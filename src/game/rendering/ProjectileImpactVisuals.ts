import * as THREE from 'three';

const MAX_IMPACT_MARKS = 48;
const IMPACT_MARK_LIFE_MS = 1_800;

/**
 * Fixed-capacity, single-draw surface marks for firearm impacts. Positions,
 * normals and lifetimes live in preallocated GPU buffers; sustained fire only
 * replaces the oldest slot and never creates meshes, materials or geometry.
 */
export class ProjectileImpactVisuals {
  private readonly mesh: THREE.InstancedMesh;
  private readonly life = new Float32Array(MAX_IMPACT_MARKS);
  private readonly remainingMs = new Float32Array(MAX_IMPACT_MARKS);
  private readonly lifeAttribute: THREE.InstancedBufferAttribute;
  private readonly transform = new THREE.Object3D();
  private readonly normal = new THREE.Vector3();
  private readonly surfaceForward = new THREE.Vector3(0, 0, 1);
  private readonly color = new THREE.Color();
  private nextSlot = 0;

  constructor(private readonly scene: THREE.Scene) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    this.lifeAttribute = new THREE.InstancedBufferAttribute(this.life, 1);
    geometry.setAttribute('impactLife', this.lifeAttribute);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      vertexShader: `
        attribute float impactLife;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vLife;
        void main() {
          vUv = uv;
          vColor = instanceColor;
          vLife = impactLife;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vLife;
        void main() {
          vec2 p = (vUv - .5) * 2.0;
          float radius = length(p);
          float angle = atan(p.y, p.x);
          float ragged = sin(angle * 7.0 + radius * 19.0) * .035
            + sin(angle * 13.0 - radius * 11.0) * .018;
          float mark = 1.0 - smoothstep(.62 + ragged, .93 + ragged, radius);
          float hollow = smoothstep(.08, .24, radius);
          float crater = mark * (.55 + hollow * .45);
          float hotCore = (1.0 - smoothstep(.05, .32, radius)) * smoothstep(.52, .92, vLife);
          float hotRim = (smoothstep(.2, .38, radius) - smoothstep(.38, .57, radius))
            * smoothstep(.68, .98, vLife);
          float fade = smoothstep(0.0, .18, vLife);
          vec3 scorch = vec3(.008, .014, .022);
          vec3 color = mix(scorch, vColor, clamp(hotCore + hotRim * .78, 0.0, 1.0));
          float alpha = (crater * .58 + hotCore * .72 + hotRim * .48) * fade;
          if (alpha < .01) discard;
          gl_FragColor = vec4(color, min(alpha, .92));
        }
      `,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, MAX_IMPACT_MARKS);
    this.mesh.name = 'projectile-impact-marks';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    for (let slot = 0; slot < MAX_IMPACT_MARKS; slot++) {
      this.mesh.setColorAt(slot, this.color.set('#67e8f9'));
      this.transform.scale.setScalar(0);
      this.transform.updateMatrix();
      this.mesh.setMatrixAt(slot, this.transform.matrix);
    }
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (this.mesh.instanceColor) this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.mesh);
  }

  spawn(x: number, y: number, z: number, normalX: number, normalY: number, normalZ: number, color: string, size = 18) {
    const slot = this.nextSlot;
    this.nextSlot = (this.nextSlot + 1) % MAX_IMPACT_MARKS;
    this.remainingMs[slot] = IMPACT_MARK_LIFE_MS;
    this.life[slot] = 1;

    // Simulation axes are x/y across the ground with z as elevation. Three.js
    // uses x/z across the ground and y as elevation.
    this.normal.set(normalX, normalZ, normalY);
    if (this.normal.lengthSq() < .5) this.normal.set(0, 1, 0);
    else this.normal.normalize();
    this.transform.quaternion.setFromUnitVectors(this.surfaceForward, this.normal);
    this.transform.position.set(x, Math.max(.7, z), y).addScaledVector(this.normal, .7);
    this.transform.scale.set(size, size, 1);
    this.transform.updateMatrix();
    this.mesh.setMatrixAt(slot, this.transform.matrix);
    this.mesh.setColorAt(slot, this.color.set(color));
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.lifeAttribute.needsUpdate = true;
  }

  update(deltaMs: number) {
    let changed = false;
    for (let slot = 0; slot < MAX_IMPACT_MARKS; slot++) {
      if (this.remainingMs[slot] <= 0) continue;
      this.remainingMs[slot] = Math.max(0, this.remainingMs[slot] - deltaMs);
      this.life[slot] = this.remainingMs[slot] / IMPACT_MARK_LIFE_MS;
      changed = true;
    }
    if (changed) this.lifeAttribute.needsUpdate = true;
  }

  clear() {
    this.remainingMs.fill(0);
    this.life.fill(0);
    this.lifeAttribute.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
