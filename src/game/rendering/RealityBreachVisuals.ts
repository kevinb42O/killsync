import * as THREE from 'three';
import { BREACH_ANCHOR_RADIUS, BREACH_LINK_MS, BREACH_PULSE_RADIUS, type CoopRealityBreachSnapshot } from '../multiplayer/CoopRealityBreach';

const amber = new THREE.Color('#ffb86b');
const mint = new THREE.Color('#afffc9');
const danger = new THREE.Color('#ff5c39');

function glow(color: number, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity,
    depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
}

/** Decorative architecture stays above jump clearance. Ground rings and
 * beams are explicitly holograms and never imply an invisible collision. */
export function createBreachCathedral() {
  const root = new THREE.Group();
  root.name = 'breach-cathedral';
  root.position.set(4450, 1400, 4300);
  const stone = new THREE.MeshStandardMaterial({ color: 0x263440, emissive: 0x132530, emissiveIntensity: .45, metalness: .45, roughness: .6 });
  const light = glow(0xffb86b, .65);
  const ring = new THREE.Group();
  ring.name = 'cathedral-orbit';
  ring.rotation.set(.38, 0, .22);
  for (let index = 0; index < 9; index++) {
    const segment = new THREE.Mesh(new THREE.TorusGeometry(680, 42, 6, 12, Math.PI * 2 / 9 - .12), stone);
    segment.rotation.z = index / 9 * Math.PI * 2;
    ring.add(segment);
    const seam = new THREE.Mesh(new THREE.TorusGeometry(680, 4, 4, 12, Math.PI * 2 / 9 - .14), light);
    seam.rotation.z = segment.rotation.z;
    seam.position.z = 44;
    ring.add(seam);
  }
  root.add(ring);
  const eclipse = new THREE.Mesh(new THREE.SphereGeometry(510, 32, 20), new THREE.MeshBasicMaterial({ color: 0x020407 }));
  root.add(eclipse);
  const corona = new THREE.Mesh(new THREE.TorusGeometry(514, 6, 6, 96), glow(0xffd3a1, .9));
  corona.rotation.x = .15;
  root.add(corona);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(570, 2, 4, 96), glow(0x7eeaff, .32));
  inner.rotation.x = -.4;
  root.add(inner);
  const debrisGeometry = new THREE.IcosahedronGeometry(1, 0);
  const debris = new THREE.InstancedMesh(debrisGeometry, stone, 40);
  debris.name = 'cathedral-debris';
  const dummy = new THREE.Object3D();
  for (let index = 0; index < 40; index++) {
    const angle = index * 2.39996;
    const radius = 880 + index % 5 * 75;
    dummy.position.set(Math.cos(angle) * radius, Math.sin(index * 1.7) * 230, Math.sin(angle) * radius);
    dummy.rotation.set(index, index * .7, index * .3);
    dummy.scale.set(28 + index % 4 * 14, 16 + index % 3 * 22, 32);
    dummy.updateMatrix(); debris.setMatrixAt(index, dummy.matrix);
  }
  root.add(debris);
  return root;
}

type AnchorRig = { root: THREE.Group; ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  beam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>; shard: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
  tether: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>; };

export class RealityBreachVisuals {
  readonly root = new THREE.Group();
  private readonly portal = new THREE.Group();
  private readonly rims: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly heart: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly pulse: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly anchors: AnchorRig[] = [];
  private readonly circuits: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>[] = [];
  private readonly circuitFields: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly color = new THREE.Color();

  constructor(private readonly scene: THREE.Scene) {
    this.root.name = 'reality-breach';
    this.root.visible = false;
    this.root.add(this.portal);
    this.heart = new THREE.Mesh(new THREE.PlaneGeometry(440, 440), new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, power: { value: 0 }, tint: { value: new THREE.Color(amber) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `varying vec2 vUv; uniform float time; uniform float power; uniform vec3 tint;
        void main(){ vec2 p=(vUv-.5)*2.; float r=length(p); if(r>1.) discard;
          float a=atan(p.y,p.x); float spiral=sin(a*5.-r*18.+time*2.);
          float corona=pow(max(0.,1.-abs(r-.83)*7.),2.);
          float veins=pow(max(0.,spiral),8.)*smoothstep(.28,.88,r);
          vec3 c=vec3(.003,.007,.012)+tint*(corona*(.5+power)+veins*.25);
          gl_FragColor=vec4(c,(1.-smoothstep(.92,1.,r))); }`,
      transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
    }));
    this.portal.add(this.heart);
    for (let index = 0; index < 3; index++) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(206 + index * 28, index === 0 ? 4 : 1.5, 4, 64, index === 1 ? 4.6 : Math.PI * 2), glow(0xffb86b, index === 0 ? .9 : .4));
      rim.rotation.y = index * .28;
      this.rims.push(rim); this.portal.add(rim);
    }
    this.pulse = new THREE.Mesh(new THREE.RingGeometry(.94, 1, 96), glow(0xafffc9, 0));
    this.pulse.rotation.x = -Math.PI / 2;
    this.pulse.position.y = 4;
    this.root.add(this.pulse);
    for (let index = 0; index < 3; index++) {
      const root = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(BREACH_ANCHOR_RADIUS - 4, BREACH_ANCHOR_RADIUS, 64), glow(0xffb86b, .8));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 2;
      const inner = new THREE.Mesh(new THREE.RingGeometry(26, 29, 32), glow(0xffb86b, .45));
      inner.rotation.x = -Math.PI / 2; inner.position.y = 2;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 22, 330, 8, 1, true), glow(0xffb86b, .16));
      beam.position.y = 165;
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(18), glow(0xffb86b, .9));
      shard.position.y = 65;
      root.add(ring, inner, beam, shard);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const tether = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffb86b, transparent: true, opacity: .4, depthWrite: false }));
      tether.frustumCulled = false;
      this.root.add(root, tether);
      this.anchors.push({ root, ring, beam, shard, tether });
    }
    for (let index = 0; index < 3; index++) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xafffc9, transparent: true, opacity: .9, depthWrite: false, toneMapped: false }));
      line.frustumCulled = false;
      const field = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), glow(0xafffc9, .16));
      this.circuits.push(line); this.circuitFields.push(field); this.root.add(line, field);
    }
    scene.add(this.root);
  }

  update(breach: CoopRealityBreachSnapshot | undefined, elapsedMs: number, camera: THREE.Camera) {
    this.root.visible = Boolean(breach && breach.phase !== 'dormant');
    if (!breach || !this.root.visible) return;
    const time = elapsedMs / 1000;
    const resolved = breach.phase !== 'linking';
    this.color.copy(breach.phase === 'surge' ? danger : breach.phase === 'overdrive' ? mint : amber);
    this.root.position.set(breach.x, 0, breach.y);
    this.portal.position.set(0, 400 + Math.sin(time) * 12, 0);
    // Billboard only the portal. Ground telegraphs stay flat and honest.
    this.portal.quaternion.copy(camera.quaternion);
    this.heart.material.uniforms.time.value = time;
    this.heart.material.uniforms.power.value = breach.progressMs / BREACH_LINK_MS;
    this.heart.material.uniforms.tint.value.copy(this.color);
    this.rims.forEach((rim, index) => {
      rim.material.color.copy(this.color);
      rim.rotation.z = time * (index === 1 ? -.35 : .15) + index;
      const scale = 1 + Math.sin(time * 2 + index) * .025;
      rim.scale.setScalar(scale);
    });
    this.portal.scale.setScalar(resolved ? 1.2 : .8 + breach.progressMs / BREACH_LINK_MS * .3);
    for (let index = 0; index < this.anchors.length; index++) {
      const rig = this.anchors[index], anchor = breach.anchors[index];
      rig.root.visible = rig.tether.visible = Boolean(anchor && !resolved);
      if (!anchor) continue;
      rig.root.position.set(anchor.x - breach.x, 0, anchor.y - breach.y);
      const active = Boolean(anchor.occupantId);
      const color = active ? mint : amber;
      rig.ring.material.color.copy(color); rig.beam.material.color.copy(color); rig.shard.material.color.copy(color);
      rig.beam.material.opacity = active ? .45 : .12;
      rig.shard.position.y = 65 + Math.sin(time * 2 + index) * 10;
      rig.shard.rotation.y = time;
      rig.tether.material.color.copy(color); rig.tether.material.opacity = active ? .9 : .12;
      const array = rig.tether.geometry.attributes.position as THREE.BufferAttribute;
      array.setXYZ(0, anchor.x - breach.x, 65, anchor.y - breach.y);
      array.setXYZ(1, 0, this.portal.position.y, 0); array.needsUpdate = true;
    }
    const linked = breach.anchors.filter(anchor => anchor.occupantId);
    this.circuits.forEach((line, index) => {
      const field = this.circuitFields[index];
      field.visible = line.visible = !resolved && linked.length >= 2 && index < linked.length;
      if (!line.visible) return;
      const from = linked[index], to = linked[(index + 1) % linked.length];
      field.position.set((from.x + to.x) / 2 - breach.x, 5, (from.y + to.y) / 2 - breach.y);
      field.rotation.y = -Math.atan2(to.y - from.y, to.x - from.x);
      field.scale.set(Math.hypot(to.x - from.x, to.y - from.y), 2, 52);
      field.material.opacity = .13 + Math.sin(time * 12) * .03;
      const position = line.geometry.attributes.position as THREE.BufferAttribute;
      position.setXYZ(0, from.x - breach.x, 18, from.y - breach.y);
      position.setXYZ(1, to.x - breach.x, 18, to.y - breach.y);
      position.needsUpdate = true;
      line.material.opacity = .65 + Math.sin(time * 12) * .25;
    });
    const wave = (12_000 - breach.remainingMs) / 1500;
    const radius = Math.min(BREACH_PULSE_RADIUS, Math.max(1, wave * BREACH_PULSE_RADIUS));
    this.pulse.scale.set(radius, radius, 1);
    this.pulse.material.color.copy(this.color);
    this.pulse.material.opacity = resolved ? Math.max(0, .7 * (1 - wave)) : 0;
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse(child => {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      materials.forEach(material => material.dispose());
    });
  }
}
