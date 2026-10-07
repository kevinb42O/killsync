import * as THREE from 'three';

/** Camera aim is already shared by mouse/controller look. Keep the light in the
 * world pass and the held prop in the existing, separately rendered hand pass. */
export const FRIENDS_FLASHLIGHT_RANGE = 2600;

export class FriendsFlashlight {
  private light = new THREE.SpotLight(0xf2f7ff, 1_500_000, FRIENDS_FLASHLIGHT_RANGE, .51, .55, 2);
  private beamProfile: THREE.DataTexture;
  private target = new THREE.Object3D();
  private hand = new THREE.Group();
  private lens: THREE.MeshStandardMaterial;
  private enabled = false;
  private forward = new THREE.Vector3();
  private offset = new THREE.Vector3();

  constructor(scene: THREE.Scene, viewmodel: THREE.Scene, private camera: THREE.PerspectiveCamera, private renderer: THREE.WebGLRenderer) {
    this.light.name = 'held-flashlight-beam';this.light.visible=false;this.hand.visible=false;
    // A broad usable shoulder around a brighter centre, on one shadowed light.
    const size=128, pixels=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const radius=Math.hypot((x+.5-size/2)/(size/2),(y+.5-size/2)/(size/2));
      const brightness=Math.round(255*(.38+.62*Math.exp(-radius*radius*7)));
      const i=(y*size+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=brightness;pixels[i+3]=255;
    }
    this.beamProfile=new THREE.DataTexture(pixels,size,size);
    this.beamProfile.minFilter=this.beamProfile.magFilter=THREE.LinearFilter;
    this.beamProfile.needsUpdate=true;this.light.map=this.beamProfile;
    this.light.target = this.target;
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(1024, 1024);
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
  get equipped(){return this.enabled;}
  toggle() {
    this.enabled = !this.enabled;
    if(!this.enabled){this.hand.visible=false;this.light.visible=false;}
  }
  update(time: number, visible: boolean) {
    this.hand.visible = visible && this.enabled;
    this.light.visible = visible && this.enabled;
    if(this.light.visible)this.renderer.shadowMap.needsUpdate=true;
    this.lens.emissiveIntensity = this.enabled ? 2 : 0;
    this.hand.position.set(-.29, -.23 + Math.sin(time * 1.7) * .004, -.58);
    this.hand.rotation.set(.04, -.04, -.12);
    this.camera.getWorldDirection(this.forward);
    // Start near the eye: the left hand must not cast a shadow across the beam.
    this.offset.set(-8, -6, -8).applyQuaternion(this.camera.quaternion);
    this.light.position.copy(this.camera.position).add(this.offset);
    this.target.position.copy(this.camera.position).addScaledVector(this.forward, FRIENDS_FLASHLIGHT_RANGE);
  }
  dispose() {
    this.light.shadow.dispose();this.beamProfile.dispose(); this.light.removeFromParent(); this.target.removeFromParent();
    const materials = new Set<THREE.Material>();
    this.hand.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); } });
    materials.forEach(m => m.dispose()); this.hand.removeFromParent();
  }
}
