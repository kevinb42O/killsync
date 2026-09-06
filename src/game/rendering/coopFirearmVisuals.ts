import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COOP_FIREARM_BY_ID, type CoopFirearmId, type CoopWeaponRuntime } from '../combat/coopFirearms';

type SuitMaterials = { forearm: THREE.MeshStandardMaterial; armor: THREE.MeshStandardMaterial; hand: THREE.MeshStandardMaterial; glow: THREE.MeshBasicMaterial };
type VisualParts = { root: THREE.Group; bolt?: THREE.Object3D; magazine?: THREE.Object3D; pump?: THREE.Object3D; magazineHome?: THREE.Vector3; magazineRotationHome?: THREE.Euler; pumpHome?: THREE.Vector3; boltHome?: THREE.Vector3; muzzle: THREE.Object3D; flash: THREE.Sprite; flashMaterial: THREE.SpriteMaterial; accent: THREE.MeshBasicMaterial; suit?: SuitMaterials };

const bodyGeometry = new THREE.BoxGeometry(1, 1, 1);
const roundedBodyGeometry = new RoundedBoxGeometry(1, 1, 1, 2, .08);
const tubeGeometry = new THREE.CylinderGeometry(.16, .16, 1, 8);
const detailedTubeGeometry = new THREE.CylinderGeometry(.16, .16, 1, 12);

const WEAPON_PALETTES: Record<CoopFirearmId, { dark: number; panel: number; steel: number; trim: number; rubber: number }> = {
  // These values deliberately preserve the existing modular handgun. The
  // first-person handgun remains the separately authored Renderer3D model.
  plasma_gun: { dark: 0x111c2c, panel: 0x38516d, steel: 0x8aa4bb, trim: 0x67e8f9, rubber: 0x0b111c },
  assault_rifle: { dark: 0x0b1b19, panel: 0x245044, steel: 0x8fbeb0, trim: 0x34d399, rubber: 0x07110f },
  combat_shotgun: { dark: 0x21130c, panel: 0x61321b, steel: 0xd0a064, trim: 0xfb923c, rubber: 0x140b07 },
  arc_launcher: { dark: 0x0c1830, panel: 0x1d4f78, steel: 0x8fb9d9, trim: 0x60a5fa, rubber: 0x07101d },
  smg: { dark: 0x121b0d, panel: 0x385322, steel: 0x9caf8e, trim: 0xa3e635, rubber: 0x0a1007 },
};
const flashTexture = (() => {
  if (typeof document === 'undefined') return new THREE.Texture();
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
  const context = canvas.getContext('2d')!; const glow = context.createRadialGradient(16, 16, 1, 16, 16, 16);
  glow.addColorStop(0, '#fff'); glow.addColorStop(.2, '#fff8b3'); glow.addColorStop(1, 'rgba(255,255,255,0)'); context.fillStyle = glow; context.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(canvas);
})();

/** Low-poly, code-native firearms. Geometries are shared, and each rig owns
 * only a handful of materials: visually rich enough for FPS scale, very cheap
 * under four-player load. */
export class CoopFirearmVisualRig {
  readonly group = new THREE.Group();
  private readonly parts = new Map<CoopFirearmId, VisualParts>();
  private current: CoopFirearmId = 'plasma_gun';
  private recoil = 0; private flashLife = 0;

  constructor(private readonly firstPerson: boolean) {
    this.group.name = firstPerson ? 'Coop Firearm Viewmodel Rig' : 'Coop Firearm Remote Rig';
    (Object.keys(COOP_FIREARM_BY_ID) as CoopFirearmId[]).forEach(id => {
      const parts = buildFirearm(id, firstPerson); parts.root.visible = id === this.current && !(firstPerson && id === 'plasma_gun'); this.parts.set(id, parts); this.group.add(parts.root);
    });
    // fpsWeaponGroup already owns the camera-relative -Z placement. Adding a
    // second offset here made long guns look toy-sized in the wide-FOV pass.
    if (firstPerson) { this.group.position.set(0, 0, 0); this.group.scale.setScalar(1.30); }
    else { this.group.position.set(.1, 27, 20); this.group.scale.setScalar(1.15); }
  }

  dispose() { this.group.removeFromParent(); for (const parts of this.parts.values()) { parts.flashMaterial.dispose(); parts.accent.dispose(); } }
  /** Copies the existing right-arm palette instead of inventing a second suit. */
  matchSuitPalette(dark: THREE.Color, secondary: THREE.Color, primary: THREE.Color) {
    for (const parts of this.parts.values()) {
      const suit = parts.suit; if (!suit) continue;
      suit.forearm.color.copy(dark); suit.forearm.emissive.copy(dark).multiplyScalar(.45);
      suit.armor.color.copy(secondary).multiplyScalar(.30); suit.armor.emissive.copy(dark).multiplyScalar(.16);
      suit.hand.color.copy(secondary).multiplyScalar(.42); suit.hand.emissive.copy(dark).multiplyScalar(.08);
      suit.glow.color.copy(primary);
    }
  }
  fire(id: CoopFirearmId) { if (id !== this.current) return; const definition = COOP_FIREARM_BY_ID[id]; this.recoil = Math.max(this.recoil, definition.recoil.kick); this.flashLife = 1; }
  getMuzzlePoint() { return this.parts.get(this.current)!.muzzle; }
  setWeapon(id: CoopFirearmId) { if (id === this.current) return; this.parts.get(this.current)!.root.visible = false; this.current = id; this.parts.get(id)!.root.visible = !(this.firstPerson && id === 'plasma_gun'); this.recoil = .4; }
  update(state: CoopWeaponRuntime, elapsedMs: number, deltaMs: number, aiming: boolean) {
    this.setWeapon(state.weaponId); const parts = this.parts.get(this.current)!; const definition = COOP_FIREARM_BY_ID[this.current];
    this.recoil *= Math.exp(-deltaMs / definition.recoil.recoveryMs); this.flashLife = Math.max(0, this.flashLife - deltaMs / 52);
    const isReloading = state.state === 'reloading';
    const reloadProgress = isReloading && state.reloadStartedAtMs !== undefined && state.reloadEndsAtMs !== undefined
      ? definition.reloadStyle === 'shell_by_shell'
        ? THREE.MathUtils.clamp((elapsedMs - (state.reloadEndsAtMs - definition.shellInsertMs!)) / definition.shellInsertMs!, 0, 1)
        : THREE.MathUtils.clamp((elapsedMs - state.reloadStartedAtMs) / Math.max(1, state.reloadEndsAtMs - state.reloadStartedAtMs), 0, 1)
      : 0;
    // Reloading deliberately drops the rifle into frame and rolls it toward
    // the support hand. This makes the movement read as an actual reload even
    // in peripheral vision, rather than just a UI timer changing.
    const reloadPose = isReloading ? 1 : 0;
    const reloadSway = isReloading ? Math.sin(elapsedMs * .018) * .035 : 0;
    parts.root.position.z = (this.firstPerson ? this.recoil * .42 : this.recoil * .06) + reloadPose * (this.firstPerson ? .62 : .12);
    parts.root.rotation.x = (this.firstPerson ? -this.recoil * .17 : -this.recoil * .06) + reloadPose * (this.firstPerson ? .48 : .12);
    parts.root.rotation.z = reloadPose * (this.firstPerson ? -.20 : -.05) + reloadSway;
    parts.flash.visible = this.flashLife > .01; parts.flash.material.opacity = this.flashLife; parts.flash.scale.setScalar((this.firstPerson ? 1.65 : .65) * (1 + this.flashLife));
    const glow = .48 + Math.sin(elapsedMs * .009) * .16; parts.accent.opacity = glow;
    if (parts.magazine && parts.magazineHome) {
      const arc = Math.sin(reloadProgress * Math.PI);
      parts.magazine.position.copy(parts.magazineHome);
      if (parts.magazineRotationHome) parts.magazine.rotation.copy(parts.magazineRotationHome);
      // The battery / magazine leaves the well, turns in the off hand, then
      // slots home. Long magazines get a little more forward travel to avoid
      // looking like the same animation scaled to every weapon.
      parts.magazine.position.y -= arc * (this.firstPerson ? 1.38 : .38);
      parts.magazine.position.z += arc * (this.current === 'smg' ? .72 : .44);
      parts.magazine.position.x += arc * (this.current === 'arc_launcher' ? -.22 : .16);
      parts.magazine.rotation.x += arc * .72;
      parts.magazine.rotation.z += arc * (this.current === 'smg' ? -.24 : .16);
    }
    if (parts.pump && parts.pumpHome) {
      parts.pump.position.copy(parts.pumpHome);
      // Each shell has its own authoritative reload deadline, so this resets
      // into a tactile insert-and-seat motion for every individual shell.
      parts.pump.position.z += isReloading ? Math.sin(reloadProgress * Math.PI) * .62 : 0;
      parts.pump.position.y += isReloading ? Math.sin(reloadProgress * Math.PI) * .11 : 0;
    }
    if (this.firstPerson) {
      const target = aiming ? .42 : 1;
      parts.root.scale.setScalar(target);
      parts.root.position.x = (aiming ? .05 : .22) + reloadPose * .28;
      parts.root.position.y = (aiming ? -.06 : 0) - reloadPose * .68;
    }
  }
}

export function createRemoteFirearm(id: CoopFirearmId) { const rig = new CoopFirearmVisualRig(false); rig.setWeapon(id); return rig; }

function buildFirearm(id: CoopFirearmId, firstPerson: boolean): VisualParts {
  const definition = COOP_FIREARM_BY_ID[id], root = new THREE.Group(), palette = WEAPON_PALETTES[id], isHandgun = id === 'plasma_gun';
  const dark = new THREE.MeshStandardMaterial({ color: palette.dark, emissive: isHandgun ? 0x07101d : palette.dark, emissiveIntensity: isHandgun ? .65 : .28, metalness: .92, roughness: isHandgun ? .19 : .24 });
  const panel = new THREE.MeshStandardMaterial({ color: palette.panel, emissive: isHandgun ? 0x0b1829 : palette.dark, emissiveIntensity: isHandgun ? .75 : .34, metalness: .8, roughness: isHandgun ? .24 : .28 });
  const steel = new THREE.MeshStandardMaterial({ color: palette.steel, emissive: isHandgun ? 0x182b3d : palette.dark, emissiveIntensity: isHandgun ? .45 : .16, metalness: .96, roughness: isHandgun ? .12 : .18 });
  const rubber = new THREE.MeshStandardMaterial({ color: palette.rubber, metalness: .2, roughness: .72 });
  const accent = new THREE.MeshBasicMaterial({ color: palette.trim, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false });
  const accentMetal = new THREE.MeshStandardMaterial({ color: palette.trim, emissive: palette.trim, emissiveIntensity: .72, metalness: .58, roughness: .22 });
  const glass = new THREE.MeshPhysicalMaterial({ color: palette.trim, emissive: palette.trim, emissiveIntensity: .28, transparent: true, opacity: .32, roughness: .08, metalness: .22, transmission: .18, depthWrite: false, side: THREE.DoubleSide });
  const suit: SuitMaterials = { forearm: new THREE.MeshStandardMaterial({ color: 0x101827, emissive: 0x07101d, metalness: .72, roughness: .30 }), armor: new THREE.MeshStandardMaterial({ color: 0x263449, emissive: 0x091525, metalness: .82, roughness: .22 }), hand: new THREE.MeshStandardMaterial({ color: 0x263449, emissive: 0x07101d, metalness: .76, roughness: .25 }), glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(definition.visual.muzzleColor), transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false }) };
  const addBox = (size: [number, number, number], position: [number, number, number], material: THREE.Material = dark) => { const mesh = new THREE.Mesh(isHandgun ? bodyGeometry : roundedBodyGeometry, material); mesh.scale.set(...size); mesh.position.set(...position); root.add(mesh); return mesh; };
  const addTube = (radius: number, length: number, position: [number, number, number], material: THREE.Material = dark) => { const mesh = new THREE.Mesh(isHandgun ? tubeGeometry : detailedTubeGeometry, material); mesh.scale.set(radius / .16, length, radius / .16); mesh.rotation.x = Math.PI / 2; mesh.position.set(...position); root.add(mesh); return mesh; };
  const addRail = (z: number, length: number, y = .46) => { addBox([.16, .10, length], [-.36, y, z], steel); addBox([.16, .10, length], [.36, y, z], steel); for (let notch = 0; notch < Math.ceil(length / .36); notch++) addBox([.82, .045, .06], [0, y + .08, z - length / 2 + .15 + notch * .32], accent); };
  const addVents = (z: number, count: number, width = .9) => { for (let vent = 0; vent < count; vent++) { const x = vent % 2 ? .56 : -.56; const y = vent < 2 ? .04 : .18; addBox([.10, .33, .40], [x, y, z - Math.floor(vent / 2) * .50], accent); } };
  const addBrace = (z: number, length: number) => { const brace = addBox([.18, .18, length], [.72, -.18, z], steel); brace.rotation.x = -.18; return brace; };
  const addSidePlate = (z: number, length: number, material: THREE.Material = panel) => {
    addBox([.08, .68, length], [-.75, .02, z], material);
    addBox([.08, .68, length], [.75, .02, z], material);
    addBox([.035, .09, length * .78], [-.80, .17, z], accent);
    addBox([.035, .09, length * .78], [.80, .17, z], accent);
  };
  const addFasteners = (z: number, spacing: number, y = .30) => {
    for (const x of [-.79, .79]) for (const offset of [-spacing, spacing]) {
      const fastener = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, .045, 10), steel);
      fastener.rotation.z = Math.PI / 2; fastener.position.set(x, y, z + offset); root.add(fastener);
    }
  };
  const addEnergyWindow = (z: number, length: number) => {
    addBox([.58, .10, length], [0, .69, z], glass);
    addBox([.16, .035, length * .78], [0, .755, z], accent);
    for (const end of [-1, 1]) addBox([.72, .13, .12], [0, .70, z + end * length * .46], steel);
  };
  const addMuzzleCollars = (z: number, radius: number) => {
    for (let ring = 0; ring < 2; ring++) {
      const collar = new THREE.Mesh(new THREE.TorusGeometry(radius + ring * .035, .07, 8, 18), ring ? accentMetal : steel);
      collar.position.set(0, 0, z - ring * .24); root.add(collar);
    }
  };
  const addCylinderBetween = (from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material) => {
    const mid = from.clone().add(to).multiplyScalar(.5), length = from.distanceTo(to);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * .9, length, 8), material);
    mesh.position.copy(mid); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()); root.add(mesh); return mesh;
  };
  const addSupportArm = (handZ: number) => {
    if (!firstPerson) return;
    // A separate, articulated left support arm gives the long guns a solid
    // shouldered two-hand stance without changing the handgun's authored hand.
    // Shoulder starts behind the camera plane and below-left of frame: no
    // floating cut-off limb at high FOV, just a natural arm entering view.
    const shoulder = new THREE.Vector3(-3.45, -3.35, 4.35), elbow = new THREE.Vector3(-1.52, -1.72, -.62), wrist = new THREE.Vector3(-.62, -.72, handZ + .55);
    addCylinderBetween(shoulder, elbow, .42, suit.forearm); addCylinderBetween(elbow, wrist, .34, suit.armor);
    addCylinderBetween(shoulder.clone().add(new THREE.Vector3(.12, .14, -.05)), elbow.clone().add(new THREE.Vector3(.10, .12, -.05)), .095, suit.glow);
    const elbowJoint = new THREE.Mesh(new THREE.SphereGeometry(.48, 8, 8), suit.armor); elbowJoint.position.copy(elbow); root.add(elbowJoint);
    const palm = addBox([.72, .52, .86], [-.46, -.50, handZ], suit.hand); palm.rotation.x = -.32;
    addBox([.78, .09, .90], [-.46, -.22, handZ], suit.glow);
    for (let finger = 0; finger < 4; finger++) { const digit = addBox([.14, .16, .62], [-.78 + finger * .20, -.46, handZ - .46], suit.hand); digit.rotation.x = -.62; }
  };
  const chassis = addBox([1.42, 1.16, 3.25], [0, 0.0, -1.72], panel); addBox([1.25, .18, 3.12], [0, .70, -1.72], dark); addBox([.14, .09, 2.9], [0, .83, -1.72], accent);
  addBox([1.5, .16, .75], [0, -.50, -.38], dark); const grip = addBox([.68, 1.54, .96], [0, -1.02, -.28], dark); grip.rotation.x = -.28; addBox([.16, .74, .72], [.38, -1.10, -.25], accent);
  addRail(-2.16, 2.9); addVents(-1.3, 6); addBrace(-1.15, 2.3);
  let magazine: THREE.Object3D | undefined, bolt: THREE.Object3D | undefined, pump: THREE.Object3D | undefined;
  const mountMuzzle = (z: number) => { const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, z); root.add(muzzle); const flashMaterial = new THREE.SpriteMaterial({ map: flashTexture, color: new THREE.Color(definition.visual.muzzleColor), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }); const flash = new THREE.Sprite(flashMaterial); flash.scale.setScalar(firstPerson ? 1.7 : .7); muzzle.add(flash); return { muzzle, flash, flashMaterial }; };
  if (id === 'plasma_gun') { chassis.scale.z = .85; chassis.position.z = -1.1; addTube(.31, 2.6, [0, .03, -4.32], panel); addRail(-3.9, 2.6); magazine = addBox([.58, .95, .88], [0, -.92, -1.32], dark); addBox([.15, .48, .70], [.43, -.94, -1.32], accent); }
  if (id === 'assault_rifle') {
    // Emerald service rifle: layered stock, armored handguard and a visible
    // power spine keep the silhouette readable without turning it into a slab.
    addBox([1.18, .62, 2.05], [0, -.02, 1.08], dark);
    addBox([.92, .38, 1.62], [0, .16, 1.72], panel);
    addBox([1.10, .78, .34], [0, -.02, 2.54], rubber);
    addBox([.70, .28, 1.10], [0, .48, 1.58], rubber);
    addTube(.28, 4.85, [0, .05, -5.35], steel);
    addTube(.13, 4.95, [.48, -.18, -5.35], accent);
    addRail(-4.4, 4.45);
    addSidePlate(-4.35, 3.20);
    addFasteners(-4.30, 1.18);
    addEnergyWindow(-1.62, 1.34);
    addMuzzleCollars(-7.52, .39);
    magazine = addBox([.92, 1.72, .86], [0, -1.18, -1.85], dark);
    magazine.rotation.x = -.16;
    addBox([.18, 1.20, .66], [.56, -1.18, -1.85], accent);
    for (let mark = 0; mark < 3; mark++) addBox([.045, .12, .42], [-.49, -1.02 - mark * .34, -1.82], accentMetal);
    addReflex(root, dark, steel, glass, accent, -2.05);
    addBox([.45, .22, .86], [0, -.46, -3.65], steel);
    addSupportArm(-4.10);
  }
  if (id === 'combat_shotgun') {
    // Amber breacher: broad receiver, ventilated heat shield, ribbed pump and
    // individual shell-status lamps sell weight and close-range purpose.
    chassis.scale.x = 1.25;
    addBox([1.20, .58, 2.25], [0, .02, 1.28], dark);
    addBox([1.36, .82, .32], [0, -.02, 2.48], rubber);
    addBox([.82, .26, 1.54], [0, .48, 1.25], panel);
    addTube(.46, 5.55, [0, .08, -5.55], steel);
    addTube(.25, 4.75, [0, -.48, -5.18], panel);
    const heatShield = new THREE.Mesh(new THREE.CylinderGeometry(.58, .58, 4.55, 12, 1, true, .32, Math.PI * 2 - .64), dark);
    heatShield.rotation.x = Math.PI / 2; heatShield.position.set(0, .08, -5.34); root.add(heatShield);
    for (let vent = 0; vent < 5; vent++) {
      addBox([.22, .08, .46], [-.39, .61, -3.65 - vent * .72], accentMetal);
      addBox([.22, .08, .46], [.39, .61, -3.65 - vent * .72], accentMetal);
    }
    for (let band = 0; band < 4; band++) addBox([1.05, .12, .18], [0, -.22, -3.5 - band * 1.05], accent);
    pump = addBox([1.52, .76, 1.28], [0, -.08, -4.18], rubber);
    addBox([1.20, .11, .95], [0, .37, -4.18], accent);
    for (let rib = 0; rib < 4; rib++) addBox([1.56, .10, .08], [0, -.42, -3.77 - rib * .27], steel);
    addSidePlate(-1.64, 1.30, dark);
    for (let shell = 0; shell < 4; shell++) addBox([.045, .16, .16], [.81, -.05, -1.22 - shell * .28], accent);
    addMuzzleCollars(-8.48, .56);
    addBox([.95, .48, 1.05], [0, -.20, -7.88], dark);
    addSupportArm(-4.18);
  }
  if (id === 'arc_launcher') {
    // Electric crowd-control platform: a compact accelerator barrel, exposed
    // charge chamber, and paired induction rings replace the sniper silhouette.
    chassis.scale.set(1.18, 1.08, .92); chassis.position.z = -1.46;
    addBox([1.10, .50, 2.25], [0, .02, 1.12], dark);
    addBox([1.16, .72, .34], [0, -.02, 2.40], rubber);
    addTube(.32, 4.8, [0, .04, -5.10], steel);
    addTube(.12, 4.95, [.45, .02, -5.12], accent);
    addTube(.12, 4.95, [-.45, .02, -5.12], accent);
    addSidePlate(-4.25, 3.10, dark);
    addEnergyWindow(-1.42, 1.72);
    for (const ringZ of [-3.18, -4.58, -5.98]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.66, .105, 10, 24), accentMetal);
      ring.position.set(0, .03, ringZ); root.add(ring);
      addBox([1.55, .12, .18], [0, -.68, ringZ], steel);
    }
    const core = addTube(.28, 2.8, [0, .05, -4.58], glass);
    core.scale.x *= 1.25; core.scale.z *= 1.25;
    addMuzzleCollars(-7.35, .49);
    magazine = addBox([.92, 1.55, .92], [0, -1.16, -1.62], dark);
    addBox([.22, 1.12, .62], [.57, -1.16, -1.62], glass);
    addReflex(root, dark, steel, glass, accent, -1.82);
    addSupportArm(-4.36);
  }
  if (id === 'smg') {
    // Acid-lime compact: short vented shroud, skeletal stock and a translucent
    // magazine witness strip distinguish it from the full-size rifle.
    chassis.scale.set(1.20, 1.03, .82); chassis.position.z = -1.28;
    addBox([1.02, .50, 1.82], [0, -.05, 1.18], dark);
    addBox([1.02, .62, .28], [0, -.04, 2.15], rubber);
    addBox([.16, .16, 1.56], [-.47, .23, 1.34], steel);
    addBox([.16, .16, 1.56], [.47, .23, 1.34], steel);
    addBox([.82, .30, .26], [0, .30, .66], panel);
    addTube(.28, 3.25, [0, .03, -4.35], steel);
    addRail(-3.2, 2.8);
    addSidePlate(-3.46, 2.20);
    addEnergyWindow(-1.34, .92);
    addMuzzleCollars(-5.86, .38);
    magazine = addBox([.94, 2.35, .68], [0, -1.45, -1.25], dark);
    magazine.rotation.x = -.34;
    addBox([.18, 1.8, .44], [.56, -1.45, -1.25], glass);
    for (let mark = 0; mark < 5; mark++) addBox([.045, .10, .28], [.665, -.76 - mark * .31, -1.12], accent);
    addReflex(root, dark, steel, glass, accent, -1.72);
    for (let slot = 0; slot < 5; slot++) addBox([.14, .28, .32], [slot % 2 ? .62 : -.62, .02, -2.4 - Math.floor(slot / 2) * .44], accent);
    addSupportArm(-3.42);
  }
  const muzzleData = mountMuzzle(id === 'arc_launcher' ? -7.82 : id === 'combat_shotgun' ? -8.85 : id === 'assault_rifle' ? -7.90 : id === 'smg' ? -6.18 : -6.15);
  root.traverse(node => { if (node instanceof THREE.Mesh) { node.castShadow = false; node.receiveShadow = false; } });
  return { root, bolt, magazine, pump, magazineHome: magazine?.position.clone(), magazineRotationHome: magazine?.rotation.clone(), pumpHome: pump?.position.clone(), boltHome: bolt?.position.clone(), muzzle: muzzleData.muzzle, flash: muzzleData.flash, flashMaterial: muzzleData.flashMaterial, accent, suit };
}

function addReflex(root: THREE.Group, dark: THREE.Material, steel: THREE.Material, glass: THREE.Material, accent: THREE.Material, z: number) {
  const base = new THREE.Mesh(roundedBodyGeometry, steel); base.scale.set(.72, .16, .66); base.position.set(0, .58, z + .04); root.add(base);
  const top = new THREE.Mesh(roundedBodyGeometry, dark); top.scale.set(.68, .12, .48); top.position.set(0, 1.08, z); root.add(top);
  for (const x of [-.30, .30]) {
    const wall = new THREE.Mesh(roundedBodyGeometry, dark); wall.scale.set(.10, .56, .48); wall.position.set(x, .84, z); root.add(wall);
  }
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(.48, .34), glass); lens.position.set(0, .84, z - .25); root.add(lens);
  const dot = new THREE.Mesh(new THREE.RingGeometry(.025, .052, 16), accent); dot.position.set(0, .84, z - .265); root.add(dot);
}
