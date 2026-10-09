import * as THREE from 'three';
import type { FriendsConfettiSnapshot } from '../multiplayer/FriendsConfetti';

const PARTICLES_PER_BURST = 72;
const MAX_BURSTS = 24;
const MAX_AGE_MS = 3_800;
const VISIBLE_RADIUS = 1_800;
const COLORS = ['#ff4f87', '#ffce52', '#52e6ca', '#70a9ff', '#bd79ff', '#ff8156', '#fff0aa'];
type ParticleSeed = { spread: number; speed: number; lift: number; gravity: number; width: number; height: number; life: number; spinX: number; spinY: number; spinZ: number };

function seeded(index: number) {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

/** Shared world confetti in one instanced draw call, driven by compact host events. */
export class FriendsConfettiVisuals {
  private readonly mesh: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Euler();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly cameraPoint = new THREE.Vector3();
  private readonly seeds: ParticleSeed[] = [];
  private disposed = false;

  constructor(scene: THREE.Scene) {
    const capacity = PARTICLES_PER_BURST * MAX_BURSTS;
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, .16),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .94, depthWrite: false, side: THREE.DoubleSide }),
      capacity,
    );
    this.mesh.name = 'friends-shared-confetti';
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let index = 0; index < capacity; index++) {
      const randomIndex = Math.floor(seeded(index + 1) * 100000);
      const color = new THREE.Color(COLORS[randomIndex % COLORS.length]);
      this.mesh.setColorAt(index, color);
      if (index < PARTICLES_PER_BURST) {
        const random = (part: number) => seeded(index * 17 + part * 131 + 1);
        this.seeds.push({
          spread: random(1) * Math.PI * 2,
          speed: 18 + random(2) * 62,
          lift: 205 + random(3) * 145,
          gravity: 135 + random(4) * 60,
          width: 2.2 + random(5) * 4.5,
          height: 3.5 + random(6) * 6.5,
          life: 2.65 + random(7) * .95,
          spinX: (random(8) - .5) * 16,
          spinY: (random(9) - .5) * 18,
          spinZ: (random(10) - .5) * 20,
        });
      }
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.count = 0;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  update(state: FriendsConfettiSnapshot | undefined, now: number, camera: THREE.Camera) {
    if (this.disposed) return;
    camera.getWorldPosition(this.cameraPoint);
    const radiusSquared = VISIBLE_RADIUS * VISIBLE_RADIUS;
    const bursts = (state?.bursts ?? []).filter(burst => now >= burst.atMs && now - burst.atMs < MAX_AGE_MS
      && (burst.x - this.cameraPoint.x) ** 2 + (burst.z - this.cameraPoint.y) ** 2 + (burst.y - this.cameraPoint.z) ** 2 < radiusSquared).slice(-MAX_BURSTS);
    if (!bursts.length) {
      this.mesh.count = 0;
      this.mesh.visible = false;
      return;
    }
    let count = 0;
    for (const burst of bursts) {
      const elapsed = (now - burst.atMs) / 1000;
      const forwardX = Math.cos(burst.angle), forwardZ = Math.sin(burst.angle);
      const eventVariation = (burst.id % 97) * .731;
      for (let index = 0; index < PARTICLES_PER_BURST; index++) {
        const seedIndex = index;
        const seed = this.seeds[seedIndex];
        const age = elapsed - (seedIndex % 12) * .012;
        if (age < 0 || age >= seed.life) continue;
        const spread = seed.spread + eventVariation;
        const lateral = seed.speed * Math.cos(spread), forward = seed.speed * Math.sin(spread) + 28;
        this.position.set(
          burst.x + forwardX * forward * age - forwardZ * lateral * age,
          burst.z + seed.lift * age - .5 * seed.gravity * age * age,
          burst.y + forwardZ * forward * age + forwardX * lateral * age,
        );
        this.rotation.set(seed.spinX * age + eventVariation, seed.spinY * age, seed.spinZ * age + burst.angle + eventVariation);
        this.quaternion.setFromEuler(this.rotation);
        const fade = Math.min(1, (seed.life - age) * 2.4);
        this.scale.set(seed.width * fade, seed.height * fade, .8 * fade);
        this.matrix.compose(this.position, this.quaternion, this.scale);
        this.mesh.setMatrixAt(count++, this.matrix);
      }
    }
    this.mesh.count = count;
    this.mesh.visible = count > 0;
    if (count) this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.disposed = true;
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
