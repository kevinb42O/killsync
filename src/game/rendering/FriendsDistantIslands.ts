import * as THREE from 'three';
import { configureTerrainCoverage } from './FriendsTerrainCoverage';
import { ISLAND_SEA_LEVEL } from '../world/FriendsWaterBodies';

/** Outer islands share their landscape with collision and terrain streaming.
 * Dressing stays visible while the land hands off to the local terrain shells. */
export { DISTANT_ISLANDS } from '../world/FriendsOuterIslands';
import { DISTANT_ISLANDS, OUTER_CASTLE_SITE, type Island, distantIslandHash as hash, distantIslandOutline as outline, distantIslandHeightAt as heightAt } from '../world/FriendsOuterIslands';
const SEGMENTS=48,RINGS=18;
const APRON=1.18;
const smooth=(a:number,b:number,n:number)=>THREE.MathUtils.smoothstep(n,a,b);
class IslandBatch {
  positions: number[] = [];
  colors: number[] = [];
  normals: number[] = [];
  triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color) {
    for (const p of [a, b, c]) { this.positions.push(p.x, p.y, p.z); this.colors.push(color.r, color.g, color.b); }
  }
  shape(geometry: THREE.BufferGeometry, position: THREE.Vector3, scale: THREE.Vector3, color: THREE.Color) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone(), p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      this.positions.push(p.getX(i) * scale.x + position.x, p.getY(i) * scale.y + position.y, p.getZ(i) * scale.z + position.z);
      this.colors.push(color.r, color.g, color.b);
    }
    g.dispose();
  }
  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Uint8BufferAttribute(this.colors.map(c => Math.round(THREE.MathUtils.clamp(c, 0, 1) * 255)), 3, true));
    geometry.computeVertexNormals();
    if (this.normals.length) (geometry.getAttribute('normal') as THREE.BufferAttribute).array.set(this.normals);
    geometry.computeBoundingSphere(); return geometry;
  }
}
function islandMesh(island: Island, material: THREE.Material, coverage?:THREE.DataTexture,grid=512) {
  const batch = new IslandBatch(), lava = new IslandBatch();
  const segments = island.kind === 'volcano' ? 64 : SEGMENTS, rings = island.kind === 'volcano' ? 24 : RINGS;
  const sand = new THREE.Color('#c6b58c'), grass = new THREE.Color('#65856a'), rock = new THREE.Color('#7b8586');
  const forest = new THREE.Color('#3e6654');
  const snow = new THREE.Color('#e0edf0'), basalt = new THREE.Color('#62524c');
  const point = (ring: number, sector: number) => {
    const a = sector / segments * Math.PI * 2, r = ring / rings * APRON, coast = outline(a, island.seed);
    const x = Math.cos(a) * r * coast * island.rx, z = Math.sin(a) * r * coast * island.rz;
    return new THREE.Vector3(x, heightAt(x, z, island), z);
  };
  // Match the rendered triangles, not just the analytic height field. Thin
  // lava on a steep slope otherwise intersects the coarse terrain facets.
  const surfaceHeight = (x: number, z: number) => {
    const angle = Math.atan2(z / island.rz, x / island.rx);
    const sector = Math.floor(((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * segments);
    const ring = Math.floor(Math.hypot(x / island.rx, z / island.rz) / outline(angle, island.seed) / APRON * rings);
    for (let r = Math.max(0, ring - 1); r <= Math.min(rings - 1, ring + 1); r++) for (let s = sector - 1; s <= sector + 1; s++) {
      const a = point(r, s), b = point(r + 1, s), c = point(r + 1, s + 1), d = point(r, s + 1);
      for (const [v0, v1, v2] of [[a, c, b], [a, d, c]]) {
        const denominator = (v1.z - v2.z) * (v0.x - v2.x) + (v2.x - v1.x) * (v0.z - v2.z);
        if (Math.abs(denominator) < .001) continue;
        const u = ((v1.z - v2.z) * (x - v2.x) + (v2.x - v1.x) * (z - v2.z)) / denominator;
        const v = ((v2.z - v0.z) * (x - v2.x) + (v0.x - v2.x) * (z - v2.z)) / denominator;
        if (u >= -.0001 && v >= -.0001 && u + v <= 1.0001) return u * v0.y + v * v1.y + (1 - u - v) * v2.y;
      }
    }
    return heightAt(x, z, island);
  };
  const face = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    batch.triangle(a, b, c, grass);
    const start = batch.colors.length - 9;
    const facet=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).normalize();
    for (const [index, p] of [a,b,c].entries()) {
      const step = 65;
      const normal = new THREE.Vector3(heightAt(p.x-step,p.z,island)-heightAt(p.x+step,p.z,island),step*2,
        heightAt(p.x,p.z-step,island)-heightAt(p.x,p.z+step,island)).normalize();
      normal.lerp(facet,.18).normalize();
      batch.normals.push(normal.x,normal.y,normal.z);
      const patch = .5 + .5 * Math.sin(p.x / 620 + Math.sin(p.z / 900) + island.seed);
      const color = sand.clone().lerp(grass, smooth(25,180,p.y));
      const woodland = smooth(120,400,p.y)*(1-smooth(1100,1900,p.y));
      color.lerp(forest,woodland*patch*.45);
      const slope = 1 - normal.y;
      const rocky = Math.max(smooth(.13,.60,slope), smooth(island.height*.38,island.height*.65,p.y));
      color.lerp(island.kind === 'volcano' ? basalt : rock, rocky);
      if (island.kind === 'volcano') color.lerp(basalt, smooth(450,1600,p.y));
      if (island.kind === 'snow') {
        // Wind-scoured steep faces remain rock; snow settles in shoulders.
        const snowline = island.height * .48 + 120 * Math.sin(p.x/500 + p.z/800);
        color.lerp(snow, smooth(snowline,snowline+750,p.y) * (.45 + .55 * smooth(.25,.70,normal.y)));
      }
      color.multiplyScalar(.93 + patch*.12);
      batch.colors.splice(start+index*3,3,color.r,color.g,color.b);
    }
  };
  for (let ring = 0; ring < rings; ring++) for (let s = 0; s < segments; s++) {
    const a = point(ring, s), b = point(ring + 1, s), c = point(ring + 1, s + 1), d = point(ring, s + 1);
    // Counterclockwise from above; skip the degenerate central triangle.
    face(a, c, b); if (ring) face(a, d, c);
  }
  const landCount=batch.positions.length;
  const tree = new THREE.ConeGeometry(1, 1, 5), box = new THREE.BoxGeometry(1, 1, 1);
  // Small groves become a serrated forest silhouette. All crowns are baked
  // into the terrain batch, so adding them does not add draw calls.
  for (let i = 0; i < 90; i++) {
    const grove = Math.floor(i / 18), a = grove * 1.9 + island.seed + (hash(i,island.seed)-.5)*.55, r = .50 + hash(grove + 400,island.seed)*.24 + (hash(i,17)-.5)*.18;
    const x = Math.cos(a) * r * island.rx, z = Math.sin(a) * r * island.rz, y = surfaceHeight(x, z);
    if (y < 120 || y > 1150 || island.kind === 'volcano' && r < .65) continue;
    const h = 140 + hash(i + 700, island.seed) * 130;
    batch.shape(tree, new THREE.Vector3(x, y + h / 2, z), new THREE.Vector3(h * .29, h, h * .29), new THREE.Color().setHSL(.36 + hash(i, 32) * .035, .20, .22 + hash(i, 15) * .10));
  }
  if (island.kind === 'castle') {
    const {x,z}=OUTER_CASTLE_SITE, ground = OUTER_CASTLE_SITE.top, stone = new THREE.Color('#b7b29d');
    const addBox = (dx: number, dz: number, w: number, h: number, d: number, y: number) => batch.shape(box, new THREE.Vector3(x + dx, y + h / 2, z + dz), new THREE.Vector3(w, h, d), stone);
    addBox(0, 0, 840, 330, 520, ground - 100);
    for (const dx of [-410, 410]) for (const dz of [-255, 255]) {
      const y = ground - 100, h = dx > 0 && dz > 0 ? 760 : 500;
      addBox(dx, dz, 190, h, 190, y);
      for (const tx of [-65, 65]) for (const tz of [-65, 65]) addBox(dx + tx, dz + tz, 60, 65, 60, y + h);
    }
    addBox(100, 10, 230, 920, 220, ground - 100);
    batch.shape(tree, new THREE.Vector3(x + 100, ground + 1000, z + 10), new THREE.Vector3(185, 360, 185), new THREE.Color('#526773'));
  }
  if (island.kind === 'volcano') {
    const orange = new THREE.Color('#ff5b0b'), gold = new THREE.Color('#ffbe35'), core = new THREE.Color('#ffe297');
    // Irregular molten crater floor, inset below the fractured rim.
    const center = new THREE.Vector3(0, heightAt(0, 0, island) + 25, 0);
    for (let s = 0; s < 40; s++) {
      const edge = (sector: number) => {
        const a = sector / 40 * Math.PI * 2, r = .14 + .014 * Math.sin(a * 7);
        const x = Math.cos(a) * island.rx * r, z = Math.sin(a) * island.rz * r;
        return new THREE.Vector3(x, surfaceHeight(x, z) + 22, z);
      };
      lava.triangle(center, edge(s + 1), edge(s), s % 3 ? gold : orange);
    }
    // Subdivide across the flow as well as along it: a single wide quad would
    // bridge the crater breach and become a floating orange curtain.
    const flowPoint = (step: number, across: number) => {
      const distance = .14 + step * .020;
      const angle = -.5 + .040 * Math.sin(step * .30);
      const spread = .025 + .012 * Math.sin(step * .7) ** 2 + .022 * smooth(.60, .86, distance);
      const x = Math.cos(angle) * island.rx * distance - Math.sin(angle) * across * island.rx * spread;
      const z = Math.sin(angle) * island.rz * distance + Math.cos(angle) * across * island.rz * spread;
      return new THREE.Vector3(x, surfaceHeight(x, z) + 22, z);
    };
    for (let i = 0; i < 36; i++) for (let col = 0; col < 8; col++) {
      const left = col / 4 - 1, right = (col + 1) / 4 - 1;
      const color = orange.clone().lerp(gold, 1 - Math.abs((left + right) / 2));
      if (col === 3 || col === 4) color.lerp(core, .65);
      color.multiplyScalar(.84 + hash(i * 8 + col, 53) * .26);
      const a = flowPoint(i, left), b = flowPoint(i, right), c = flowPoint(i + 1, right), d = flowPoint(i + 1, left);
      lava.triangle(a, b, c, color); lava.triangle(a, c, d, color);
    }

  }
  tree.dispose(); box.dispose();
  let props:THREE.Mesh|undefined;
  if(coverage){
    const dressing=new IslandBatch();dressing.positions=batch.positions.splice(landCount);dressing.colors=batch.colors.splice(landCount);
    props=new THREE.Mesh(dressing.geometry(),material);
    const atmosphere=material.onBeforeCompile;material=material.clone();material.onBeforeCompile=atmosphere;material.customProgramCacheKey=()=> 'distant-island-aerial-v1';configureTerrainCoverage(material,coverage,grid,'horizon');
  }
  const mesh = new THREE.Mesh(batch.geometry(), material); mesh.name = `distant-island:${island.name}`;
  mesh.position.set(island.x, ISLAND_SEA_LEVEL, island.z);if(props)mesh.add(props);
  if (lava.positions.length) {
    const glow = new THREE.Mesh(lava.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true })); glow.name = 'emberwake-lava'; mesh.add(glow);
  }
  return mesh;
}
export class FriendsDistantIslands extends THREE.Group {
  constructor(coverage?:THREE.DataTexture,grid=512) {
    super(); this.name = 'friends-distant-islands';
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    material.customProgramCacheKey=()=> 'distant-island-aerial-v1';
    material.onBeforeCompile=shader=>{
      shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>', `#include <fog_fragment>
#ifdef USE_FOG
float islandHaze=1.-exp(-max(0.,vFogDepth-3000.)*.000018);
gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,islandHaze);
#endif`);
    };
    for (const island of DISTANT_ISLANDS) this.add(islandMesh(island, material,coverage,grid));
  }
  dispose() {
    const materials = new Set<THREE.Material>();
    this.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); } });
    materials.forEach(m => m.dispose()); this.removeFromParent();
  }
}
