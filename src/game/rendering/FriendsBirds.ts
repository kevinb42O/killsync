import * as THREE from 'three';
import { frontierTrees, type FrontierSnapshot, type FrontierTree } from '../multiplayer/FriendsFrontier';
import { terrainHash } from '../world/FriendsTerrain';
import { FRIENDS_TREE_SIZES } from '../world/FriendsVegetationAppearance';

export const FRIENDS_BIRD_LIMIT = 4;
export const FRIENDS_BIRD_HEARING_RANGE = 400;
const BIRDS_PER_ANCHOR = 2;
const VIEW_RANGE = 2000;
const smooth = (n: number) => { n = Math.max(0, Math.min(1, n)); return n * n * (3 - 2 * n); };
/** A fixed minority of trees can host birds. Walking through a forest must
 * not populate every nearest tree with a new flock around the listener. */
export const birdHabitat = (tree: FrontierTree) => terrainHash(tree.x, tree.y, 1217) < .08;
export function birdCallVolume(distance: number, daylight: number) {
  return daylight > .25 ? .1 * smooth(1 - distance / FRIENDS_BIRD_HEARING_RANGE) ** 2 : 0;
}

/** Analytic, shared-clock flight. No flock physics or network replication. */
export function sampleBirdFlight(tree: FrontierTree, bird: number, seconds: number, canopyHeight: number = FRIENDS_TREE_SIZES[tree.kind].y) {
  const seed = terrainHash(tree.x, tree.y, 913), cycle = (seconds + seed * 50) % 50;
  const flight = smooth(cycle / 3) * (1 - smooth((cycle - 31) / 3));
  const angle = seconds * .25 + seed * Math.PI * 2 - bird * .10;
  const side = bird % 2 ? -1 : 1, row = Math.ceil(bird / 2);
  const dx = Math.cos(angle) * (280 + row * 16), dy = Math.sin(angle) * (210 + row * 12);
  return {
    x: tree.x + dx * flight + side * row * 10 * (1 - flight),
    y: tree.y + dy * flight + row * 9 * (1 - flight),
    z: tree.z + canopyHeight * tree.scale + 8 + (170 + Math.sin(seconds * .7 + bird) * 12 + row * 7) * flight,
    yaw: Math.atan2(-Math.sin(angle) * 280, Math.cos(angle) * 210),
    bank: -.23 * flight, flight,
  };
}

/** One opaque draw call for the whole local population. Wings flap on the
 * GPU; only four instance transforms are refreshed, at most 30 times/sec. */
export class FriendsBirds {
  readonly mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private time = { value: 0 };
  private flight = new THREE.InstancedBufferAttribute(new Float32Array(FRIENDS_BIRD_LIMIT), 1);
  private phase = new THREE.InstancedBufferAttribute(Float32Array.from({ length: FRIENDS_BIRD_LIMIT }, (_, i) => i * 1.71), 1);
  private anchors: FrontierTree[] = [];
  private canopyHeights = new Map<string, number>();
  private nextScan = 0;
  private nextPose = 0;
  private harvestedStamp = '';
  private harvested = new Set<string>();
  private positions = new Float32Array(FRIENDS_BIRD_LIMIT * 3);
  private dummy = new THREE.Object3D();
  constructor() {
    const geometry = birdGeometry(); geometry.setAttribute('birdFlight', this.flight); geometry.setAttribute('birdPhase', this.phase);
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, side: THREE.DoubleSide });
    material.onBeforeCompile = shader => {
      shader.uniforms.birdTime = this.time;
      shader.vertexShader = 'uniform float birdTime; attribute float birdWing; attribute float birdPhase; attribute float birdFlight;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float glide = smoothstep(-.15, .55, sin(birdTime * .43 + birdPhase));
        float flap = sin(birdTime * 9.5 + birdPhase) * .72 * (1. - glide);
        float spread = mix(.14, cos(flap), birdFlight);
        transformed.x *= mix(1., spread, birdWing);
        transformed.y += abs(position.x) * sin(flap) * birdWing * birdFlight;
        transformed.z -= abs(position.x) * .62 * birdWing * (1. - birdFlight);
      `);
    };
    material.customProgramCacheKey = () => 'sunline-instanced-birds-v1';
    this.mesh = new THREE.InstancedMesh(geometry, material, FRIENDS_BIRD_LIMIT);
    this.mesh.name = 'sunline-local-birds'; this.mesh.count = 0; this.mesh.visible = false;
    this.mesh.castShadow = false; this.mesh.receiveShadow = false; this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  update(frontier: FrontierSnapshot, camera: THREE.Vector3, seconds: number, daylight: number, underground: boolean,
    standing: (tree: FrontierTree) => boolean,
    canopyHeight: (tree: FrontierTree) => number | undefined = tree => FRIENDS_TREE_SIZES[tree.kind].y) {
    if (underground || daylight <= .1) { this.mesh.visible = false; this.mesh.count = 0; return; }
    this.time.value = seconds;
    if (seconds >= this.nextScan) {
      this.nextScan = seconds + 2;
      const stamp = `${frontier.harvested.length}:${frontier.harvested.at(-1) || ''}`;
      if (stamp !== this.harvestedStamp) { this.harvestedStamp = stamp; this.harvested = new Set(frontier.harvested); }
      const candidates: FrontierTree[] = [], cx = Math.floor(camera.x / 512), cy = Math.floor(camera.z / 512);
      const consider = (tree: FrontierTree) => {
        if (birdHabitat(tree) && !this.harvested.has(tree.id) && Math.hypot(tree.x - camera.x, tree.y - camera.z) < 1500) candidates.push(tree);
      };
      for (let a = cx - 2; a <= cx + 2; a++) for (let b = cy - 2; b <= cy + 2; b++) for (const tree of frontierTrees(a, b)) consider(tree);
      for (const tree of frontier.planted) consider(tree);
      candidates.sort((a, b) => Math.hypot(a.x - camera.x, a.y - camera.z) - Math.hypot(b.x - camera.x, b.y - camera.z));
      this.canopyHeights.clear();
      const supported = (tree: FrontierTree) => {
        const height = canopyHeight(tree);
        if (height === undefined || !standing(tree)) return false;
        this.canopyHeights.set(tree.id, height); return true;
      };
      this.anchors = this.anchors.filter(tree => !this.harvested.has(tree.id) && Math.hypot(tree.x-camera.x,tree.y-camera.z)<1500 && supported(tree));
      for (const tree of candidates) {
        if (this.anchors.length === 2) break;
        if (this.anchors.some(anchor => Math.hypot(anchor.x - tree.x, anchor.y - tree.y) < 650) || !supported(tree)) continue;
        this.anchors.push(tree); if (this.anchors.length === 2) break;
      }
    }
    if (seconds < this.nextPose) return;
    this.nextPose = (Math.floor(seconds * 30) + 1) / 30;
    let count = 0;
    for (const tree of this.anchors) for (let bird = 0; bird < BIRDS_PER_ANCHOR; bird++) {
      const pose = sampleBirdFlight(tree, bird, seconds, this.canopyHeights.get(tree.id));
      const distance = Math.hypot(pose.x - camera.x, pose.y - camera.z, pose.z - camera.y);
      const fade = smooth((VIEW_RANGE - distance) / 500) * smooth((daylight - .1) / .3);
      if (fade <= 0) continue;
      const size = (.86 + bird * .065) * fade;
      this.dummy.position.set(pose.x, pose.z, pose.y);
      this.dummy.rotation.set(Math.sin(seconds * .8 + bird) * .04 * pose.flight, pose.yaw, pose.bank);
      this.dummy.scale.setScalar(size); this.dummy.updateMatrix(); this.mesh.setMatrixAt(count, this.dummy.matrix);
      this.positions.set([pose.x, pose.z, pose.y], count * 3); this.flight.setX(count, pose.flight); count++;
    }
    this.mesh.count = count; this.mesh.visible = count > 0;
    this.mesh.instanceMatrix.needsUpdate = true; this.flight.needsUpdate = true;
  }
  closestCall(camera: THREE.Vector3, yaw: number, daylight: number) {
    let distance = FRIENDS_BIRD_HEARING_RANGE, dx = 0, dy = 0;
    if (this.mesh.visible) for (let i = 0; i < this.mesh.count; i++) {
      const at = i * 3, x = this.positions[at] - camera.x, z = this.positions[at + 1] - camera.y, y = this.positions[at + 2] - camera.z;
      const d = Math.hypot(x, y, z); if (d < distance) { distance = d; dx = x; dy = y; }
    }
    return { volume: this.mesh.visible ? birdCallVolume(distance, daylight) : 0, pan: Math.sin(Math.atan2(dy, dx) - yaw) * .8 };
  }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.dispose(); }
}

/** Faceted swallows: dark swept wings, blue backs, pale bellies, forked tails.
 * Everything is one small vertex-colored geometry, including the beak. */
function birdGeometry() {
  const positions: number[] = [], colors: number[] = [], wings: number[] = [];
  const triangle = (a: number[], b: number[], c: number[], color: string, wing = 0) => {
    const shade = new THREE.Color(color);
    for (const p of [a, b, c]) { positions.push(...p); colors.push(shade.r, shade.g, shade.b); wings.push(wing); }
  };
  const front = [0, .4, 5], back = [0, .2, -4.5], top = [0, 1.6, 0], bottom = [0, -.8, 0], left = [-1.5, .1, 0], right = [1.5, .1, 0];
  for (const side of [left, right]) { triangle(front, top, side, '#47758a'); triangle(top, back, side, '#345b70'); triangle(front, side, bottom, '#e4e8d8'); triangle(back, bottom, side, '#bdc9c3'); }
  triangle([0,.45,5.8],[-.7,.2,4.7],[.7,.2,4.7],'#ae9064');
  for (const sign of [-1, 1]) {
    const shoulder = [sign * 1.2, .4, 1.5], elbow = [sign * 7, .6, .5], tip = [sign * 17, .2, -5.5], trailing = [sign * 4, .15, -3.2];
    triangle(shoulder, elbow, trailing, '#42667a', 1); triangle(elbow, tip, trailing, '#243d50', 1);
    triangle([sign*.65,.3,-3], [sign*3,.2,-9.5], [0,.3,-6],'#2c485c');
    triangle([sign*1.35,.7,3.5],[sign*1.5,.6,2.9],[sign*1.45,1,3.1],'#162b35');
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setAttribute('birdWing', new THREE.Float32BufferAttribute(wings, 1));
  geometry.computeVertexNormals(); return geometry;
}
