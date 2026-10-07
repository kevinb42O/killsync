import * as THREE from 'three';

/** Camera aim is already shared by mouse/controller look. Keep the light in the
 * world pass and the held prop in the existing, separately rendered hand pass. */
export class FriendsFlashlight {
  private light = new THREE.SpotLight(0xffefcf, 500_000, 1900, .29, .65, 2);
  private target = new THREE.Object3D();
  private hand = new THREE.Group();
  private lens: THREE.MeshStandardMaterial;
  private enabled = true;
  private forward = new THREE.Vector3();
  private offset = new THREE.Vector3();

  constructor(scene: THREE.Scene, viewmodel: THREE.Scene, private camera: THREE.PerspectiveCamera, private renderer: THREE.WebGLRenderer) {
    this.light.name = 'held-flashlight-beam';
    this.light.target = this.target;
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(512, 512);
    this.light.shadow.camera.near = 4;
    this.light.shadow.bias = -.0003;
    this.light.shadow.normalBias = .8;
    scene.add(this.light, this.target);
    (viewmodel.getObjectByProperty('type', 'PerspectiveCamera') || viewmodel).add(this.hand);
    this.hand.name = 'held-flashlight';
    const metal = new THREE.MeshStandardMaterial({ color: 0x455852, metalness: .6, roughness: .42 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x1e302a, roughness: .9 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x81634a, roughness: .95 });
    this.lens = new THREE.MeshStandardMaterial({ color: 0xfff1c9, emissive: 0xffdfa0, emissiveIntensity: 2 });
    const part = (radius: number, length: number, z: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 16), material);
      mesh.rotation.x = Math.PI / 2; mesh.position.z = z; this.hand.add(mesh); return mesh;
    };
    part(.045, .26, 0, metal);
    for (let i = 0; i < 5; i++) part(.049, .015, .035 + i * .028, rubber);
    part(.07, .07, -.16, metal);
    part(.064, .007, -.199, this.lens);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(.12, .09, .13), glove); grip.position.set(0, -.05, .025); this.hand.add(grip);
    const sleeve = part(.065, .24, .19, rubber); sleeve.position.y = -.075; sleeve.rotation.x = 1.3;
  }
  toggle() { this.enabled = !this.enabled; }
  update(time: number, visible: boolean) {
    this.hand.visible = visible;
    this.light.visible = visible && this.enabled;
    if(this.light.visible)this.renderer.shadowMap.needsUpdate=true;
    this.lens.emissiveIntensity = this.enabled ? 2 : 0;
    this.hand.position.set(-.29, -.23 + Math.sin(time * 1.7) * .004, -.58);
    this.hand.rotation.set(.04, -.04, -.12);
    this.camera.getWorldDirection(this.forward);
    // Start near the eye: the left hand must not cast a shadow across the beam.
    this.offset.set(-8, -6, -8).applyQuaternion(this.camera.quaternion);
    this.light.position.copy(this.camera.position).add(this.offset);
    this.target.position.copy(this.camera.position).addScaledVector(this.forward, 1800);
  }
  dispose() {
    this.light.shadow.map?.dispose(); this.light.removeFromParent(); this.target.removeFromParent();
    const materials = new Set<THREE.Material>();
    this.hand.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); } });
    materials.forEach(m => m.dispose()); this.hand.removeFromParent();
  }
}
