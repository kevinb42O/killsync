import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { arcanaGlow } from './arcanaGlow';

const handUrl = `${import.meta.env.BASE_URL}models/hellbinder/right-hand.glb`;

// One download and shared mesh buffers, independent skeletons for each rig.
let handTemplate: Promise<THREE.Group> | undefined;
export function preloadCastingHand() {
  return handTemplate ??= new GLTFLoader().loadAsync(handUrl).then(gltf => gltf.scene);
}
if (typeof window !== 'undefined') void preloadCastingHand().catch(() => undefined);

const HAND_SCALE = 8;
const canonicalRotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().set(
  0, 0, 1, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1,
));
export const CASTING_SHOULDER = new THREE.Vector3(2.5, -3.6, 6.4);
const wristPosition = new THREE.Vector3(0, -.35, -.4);
const ORB_RADIUS = .36;

/** XR joints are siblings. Restore anatomical chains without changing their
 * bind transforms so finger curls deform the authored skin continuously. */
export function prepareCastingHand(source: THREE.Group, skin: THREE.Material) {
  const model = clone(source) as THREE.Group;
  model.updateMatrixWorld(true);
  const wrist = model.getObjectByName('wrist')!;
  const origin = wrist.getWorldPosition(new THREE.Vector3());
  const joints: { bone: THREE.Object3D; rest: THREE.Quaternion; axis: THREE.Vector3; curl: number }[] = [];
  for (const finger of ['thumb', 'index-finger', 'middle-finger', 'ring-finger', 'pinky-finger']) {
    let parent = wrist;
    for (const [index, suffix] of ['metacarpal', 'phalanx-proximal', ...(finger === 'thumb' ? [] : ['phalanx-intermediate']), 'phalanx-distal', 'tip'].entries()) {
      const bone = model.getObjectByName(`${finger}-${suffix}`)!;
      const worldRotation = bone.getWorldQuaternion(new THREE.Quaternion());
      parent.attach(bone);
      if (suffix !== 'tip' && index > 0) joints.push({ bone, rest: bone.quaternion.clone(), axis: new THREE.Vector3(0, 0, 1).applyQuaternion(worldRotation.invert()), curl: finger === 'thumb' ? .08 : index === 1 ? .12 : .20 });
      parent = bone;
    }
  }
  model.traverse(object => {
    if (object instanceof THREE.SkinnedMesh) { object.material = skin; object.frustumCulled = false; object.name = 'Authored Anatomical Hand'; }
  });
  const orientation = new THREE.Group(); orientation.quaternion.copy(canonicalRotation);
  orientation.scale.setScalar(HAND_SCALE);
  orientation.position.copy(origin).applyQuaternion(canonicalRotation).multiplyScalar(-HAND_SCALE);
  orientation.add(model);
  const hand = new THREE.Group(); hand.name = 'Articulated Casting Hand'; hand.add(orientation);
  return { hand, joints, model };
}

/** Smooth elliptical sleeve, wrist to elbow to shoulder; the proximal end is
 * behind the camera, so there is never a visible floating forearm cap. */
function sleeveGeometry(firstPerson: boolean) {
  const centers = firstPerson
    ? [wristPosition.clone().add(new THREE.Vector3(0, -.12, .02)), new THREE.Vector3(.08, -.56, .22), new THREE.Vector3(.34, -.92, 1.08), new THREE.Vector3(.70, -1.46, 2.45), new THREE.Vector3(1.15, -2.12, 3.65), CASTING_SHOULDER]
    : [wristPosition.clone().add(new THREE.Vector3(0, -.12, 0)), new THREE.Vector3(.35, -.7, -.7), new THREE.Vector3(.75, -.35, -1.1), new THREE.Vector3(1, 1.3, -1.5)];
  const curve = new THREE.CatmullRomCurve3(centers);
  const geometry = new THREE.BufferGeometry(), positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const rings = 36, sides = 32;
  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings, center = curve.getPoint(t), tangent = curve.getTangent(t);
    const side = new THREE.Vector3(1, 0, 0).projectOnPlane(tangent).normalize(), up = new THREE.Vector3().crossVectors(tangent, side).normalize();
    const radius = THREE.MathUtils.lerp(.245, firstPerson ? .60 : .24, Math.pow(t, .65)) * (1 + Math.sin(t * 90) * .018 * Math.exp(-t * 8));
    for (let s = 0; s <= sides; s++) {
      const angle = s / sides * Math.PI * 2;
      const point = center.clone().addScaledVector(side, Math.cos(angle) * radius).addScaledVector(up, Math.sin(angle) * radius * .80);
      positions.push(point.x, point.y, point.z); uvs.push(s / sides, t);
      if (ring < rings && s < sides) { const a = ring * (sides + 1) + s, b = a + sides + 1; indices.push(a, a + 1, b, b, a + 1, b + 1); }
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

export function buildCastingHand(color: string, firstPerson: boolean) {
  const root = new THREE.Group(); root.name = 'Hellbinder Open Casting Hand';
  if (firstPerson) {
    root.scale.setScalar(1.25);
    // Existing gun lights sit beyond the barrel and light the back of an open
    // palm. A camera-side soft key reveals knuckles, nails and finger volumes.
    const key = new THREE.PointLight(0xffe3c8, 6, 9, 1); key.position.set(-1, 2, 2); root.add(key);
    const fill = new THREE.PointLight(0xbac9f0, 2, 8, 1); fill.position.set(2, .5, 1.5); root.add(fill);
  }
  const materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>();
  let disposed = false;
  const own = <T extends THREE.Material>(material: T) => { materials.add(material); return material; };
  const skin = own(new THREE.MeshStandardMaterial({ color: 0xc68d6f, roughness: .68, metalness: 0, emissive: 0x40251b, emissiveIntensity: .08 }));
  const cloth = own(new THREE.MeshStandardMaterial({ color: 0x211827, roughness: .88, metalness: .03 }));
  const leather = own(new THREE.MeshStandardMaterial({ color: 0x332a32, roughness: .6, metalness: .12 }));
  const gold = own(new THREE.MeshStandardMaterial({ color: 0xb29661, roughness: .35, metalness: .78 }));
  const accent = own(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .65, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const addMesh = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = root) => { geometries.add(geometry); const mesh = new THREE.Mesh(geometry, material); parent.add(mesh); return mesh; };
  const sleeve = addMesh(sleeveGeometry(firstPerson), cloth); sleeve.name = 'Continuous Shoulder Sleeve';
  const sleevePositions = sleeve.geometry.getAttribute('position') as THREE.BufferAttribute;
  const sleeveNormals = sleeve.geometry.getAttribute('normal') as THREE.BufferAttribute;
  const restPositions = Float32Array.from(sleevePositions.array);
  const restNormals = Float32Array.from(sleeveNormals.array);
  sleevePositions.setUsage(THREE.DynamicDrawUsage); sleeveNormals.setUsage(THREE.DynamicDrawUsage);
  const wristPivot = new THREE.Group(); wristPivot.name = 'Casting Recoil Wrist'; wristPivot.position.copy(wristPosition); root.add(wristPivot);
  const shoulder = new THREE.Object3D(); shoulder.name = 'Camera Shoulder Anchor'; shoulder.position.copy(firstPerson ? CASTING_SHOULDER : new THREE.Vector3(1, 1.3, -1.5)); root.add(shoulder);
  const cuff = addMesh(new THREE.CylinderGeometry(.255, .29, .29, 32, 1, true), leather, wristPivot);
  cuff.position.set(0, -.51, -.28).sub(wristPosition); cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-.12, .40, -1).normalize());
  for (const edge of [-.135, .135]) { const rim = addMesh(new THREE.TorusGeometry(.265, .015, 8, 48), gold, cuff); rim.rotation.x = Math.PI / 2; rim.position.y = edge; }

  let articulated: ReturnType<typeof prepareCastingHand> | undefined;
  const loadHand = (source: THREE.Group) => {
    if (disposed) return;
    articulated = prepareCastingHand(source, skin); wristPivot.add(articulated.hand);
  };
  // Node tests inject the real GLB explicitly. Browsers load the bundled local asset.
  const ready = typeof window === 'undefined' ? Promise.resolve() : preloadCastingHand().then(loadHand).catch(error => { if (!disposed) console.warn('Casting hand model could not load', error); });

  // The visible surface is the back of the hand (+Z). The palm faces -Z:
  // keep the entire core beyond it, raised past the fingers so it reads clearly.
  const effects = new THREE.Group(); effects.name = 'Palm Spell Focus'; effects.position.set(-.05, 1.30, -1.20).sub(wristPosition); wristPivot.add(effects);
  const orbMaterial = own(new THREE.ShaderMaterial({ uniforms: { tint: { value: new THREE.Color(color) }, time: { value: 0 } }, vertexShader: 'varying vec3 n; varying vec3 p; void main(){n=normalize(normalMatrix*normal);p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'uniform vec3 tint; uniform float time; varying vec3 n; varying vec3 p; void main(){float fire=sin(p.x*9.+p.y*7.-time*3.)*sin(p.z*8.-p.y*6.+time*2.);float core=pow(max(0.,fire),3.);float rim=pow(1.-abs(n.z),2.);gl_FragColor=vec4(tint*(.6+rim*.8)+vec3(1.,.85,.6)*core,.82);}', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  const orb = addMesh(new THREE.SphereGeometry(1, 32, 24), orbMaterial, effects); orb.name = 'Spell Orb'; orb.scale.setScalar(ORB_RADIUS);
  const halo = arcanaGlow(color, 1.65, .25); materials.add(halo.material); effects.add(halo);
  for (let index = 0; index < 2; index++) {
    const seal = new THREE.Group(); seal.name = 'Casting Seal'; seal.userData.reverse = index === 1; seal.rotation.x = index ? .65 : -.35; effects.add(seal);
    const radius = .49 + index * .13; addMesh(new THREE.TorusGeometry(radius, .008, 6, 80), accent, seal);
    for (let rune = 0; rune < 8; rune++) { const theta = rune / 8 * Math.PI * 2; const shard = addMesh(new THREE.TetrahedronGeometry(.027), accent, seal); shard.position.set(Math.cos(theta) * radius, Math.sin(theta) * radius, 0); shard.rotation.z = theta; }
  }
  const muzzle = new THREE.Object3D(); effects.add(muzzle);
  const flashMaterial = own(new THREE.SpriteMaterial({ color, transparent: true, opacity: 0 })); const flash = new THREE.Sprite(flashMaterial); flash.visible = false; root.add(flash);
  if (!firstPerson) { root.rotation.x = -.28; root.scale.setScalar(12); }
  const bend = new THREE.Quaternion();
  const vertex = new THREE.Vector3(), transformed = new THREE.Vector3(), normal = new THREE.Vector3();
  let lastCast = -1, lastThrow = -1;
  const updateCasting = (elapsedMs: number, cast: number, throwPose: number) => {
    // An immediate kick toward the camera, wrist lift and a smooth return.
    // Hand, cuff and spell focus share the same pivot. The sleeve follows the
    // wrist with influence fading to zero at the fixed shoulder.
    wristPivot.position.set(wristPosition.x + cast * .025, wristPosition.y + cast * .13 + throwPose * .16, wristPosition.z + cast * .48 - throwPose * .65);
    wristPivot.rotation.set(cast * .22 - throwPose * .32, -cast * .045, -cast * .07);
    if (cast !== lastCast || throwPose !== lastThrow) {
      for (let i = 0; i < sleevePositions.count; i++) {
        const weight = Math.pow(1 - Math.floor(i / 33) / 36, 3);
        vertex.fromArray(restPositions, i * 3);
        transformed.copy(vertex).sub(wristPosition).applyQuaternion(wristPivot.quaternion).add(wristPivot.position);
        vertex.lerp(transformed, weight); sleevePositions.setXYZ(i, vertex.x, vertex.y, vertex.z);
        normal.fromArray(restNormals, i * 3); transformed.copy(normal).applyQuaternion(wristPivot.quaternion);
        normal.lerp(transformed, weight).normalize(); sleeveNormals.setXYZ(i, normal.x, normal.y, normal.z);
      }
      sleevePositions.needsUpdate = true; sleeveNormals.needsUpdate = true;
      sleeve.geometry.computeBoundingSphere();
      lastCast = cast; lastThrow = throwPose;
    }
    if (articulated) {
      for (const joint of articulated.joints) joint.bone.quaternion.copy(joint.rest).multiply(bend.setFromAxisAngle(joint.axis, joint.curl + Math.sin(elapsedMs * .0018) * .025 - cast * .10 + throwPose * .18));
      articulated.model.updateMatrixWorld(true);
    }
    effects.rotation.z = Math.sin(elapsedMs * .0017) * .08;
    orbMaterial.uniforms.time.value = elapsedMs / 1000; orb.scale.setScalar(ORB_RADIUS * (1 + Math.sin(elapsedMs * .006) * .06 + cast * .25));
    for (const seal of effects.children) if (seal.name === 'Casting Seal') seal.rotation.z = elapsedMs * .0005 * (seal.userData.reverse ? -1 : 1);
    accent.opacity = .55 + cast * .35;
  };
  const disposeCasting = () => { disposed = true; articulated?.model.traverse(object => { if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose(); }); for (const material of materials) material.dispose(); for (const geometry of geometries) geometry.dispose(); };
  return { root, muzzle, flash, flashMaterial, accent, ready, loadHand, updateCasting, disposeCasting };
}
