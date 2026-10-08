import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const FRIENDS_ASSETS = {
  frontierPine: 'quaternius/PineTree_1', frontierPineSmall: 'quaternius/PineTree_5', frontierPineTall: 'quaternius/PineTree_3', frontierBirch: 'quaternius/BirchTree_1', frontierMaple: 'quaternius/MapleTree_1', frontierBush: 'quaternius/Bush',
  firstPersonArms: 'wrad-arms/arms', roastingTwig: 'roasting/twig',
  toolAxe: 'survival-kit/tool-axe', toolPickaxe: 'survival-kit/tool-pickaxe', toolShovel: 'survival-kit/tool-shovel',
  toolAxeUpgraded: 'survival-kit/tool-axe-upgraded', toolPickaxeUpgraded: 'survival-kit/tool-pickaxe-upgraded', toolShovelUpgraded: 'survival-kit/tool-shovel-upgraded',
  locomotive: 'train-kit/train-electric-bullet-a',
  carriage: 'space-kit/monorail_trainFlat', cargoHull: 'space-kit/craft_cargoA',
  chair: 'space-kit/desk_chair', computer: 'space-kit/desk_computer',
  generator: 'space-kit/machine_generator', receiver: 'space-kit/machine_wireless',
  barrel: 'space-kit/barrel', dish: 'space-kit/satelliteDish_detailed', hangar: 'space-kit/hangar_smallA',
  engine: 'space-kit/rocket_fuelA', stones: 'space-kit/rocks_smallA',
  oak: 'nature-kit/tree_oak', tree: 'nature-kit/tree_detailed', pine: 'nature-kit/tree_pineTallA_detailed',
  rock: 'nature-kit/rock_largeA', bush: 'nature-kit/plant_bush', flower: 'nature-kit/flower_purpleA',
  stoneColumn: 'building-kit/column', stationRoof: 'building-kit/roof-flat-square', stationWindow: 'building-kit/wall-window-wide-square', stationDoor: 'building-kit/wall-doorway-wide-round',
  archiveBase: 'castle-kit/tower-hexagon-base', archiveTower: 'castle-kit/tower-hexagon-mid', archiveRoof: 'castle-kit/tower-hexagon-roof', gardenFence: 'castle-kit/wall-narrow-wood-fence', pennant: 'castle-kit/flag-pennant',
  redMushroom: 'nature-kit/mushroom_red', tanMushroom: 'nature-kit/mushroom_tan', meadowGrass: 'nature-kit/grass', autumnOak: 'nature-kit/tree_oak_fall', canopyTree: 'nature-kit/tree_plateau', roundPine: 'nature-kit/tree_pineRoundD',
  tallRock: 'nature-kit/rock_tallC', broadRock: 'nature-kit/rock_largeB', obelisk: 'nature-kit/statue_obelisk', oldColumn: 'nature-kit/statue_column', footbridge: 'nature-kit/bridge_wood', yellowFlower: 'nature-kit/flower_yellowA',
  workbench: 'survival-kit/workbench', campfire: 'survival-kit/campfire-pit', trailSign: 'survival-kit/signpost', tent: 'survival-kit/tent', planks: 'survival-kit/resource-planks', wildGrass: 'survival-kit/grass-large',
} as const;
export type FriendsAssetId = keyof typeof FRIENDS_ASSETS;
const instanceTemplates = new Map<string, Promise<THREE.Group>>();
const templates = new Map<FriendsAssetId, Promise<THREE.Group>>();

/** Immutable source cache. Decorative models own cloned resources; vegetation
 * tiles share immutable GPU geometry/maps and own their shader materials. */
export function loadFriendsAsset(id: FriendsAssetId) {
  let pending = templates.get(id);
  if (!pending) {
    pending = new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/friends/${FRIENDS_ASSETS[id]}.glb`).then(gltf => gltf.scene);
    templates.set(id, pending);
  }
  return pending;
}
export function fitFriendsAsset(source: THREE.Group, size: { x: number; y: number; z: number }, rotationY = 0, fit: 'stretch' | 'contain' = 'stretch') {
  const root = source.clone(true), resources = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  root.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    let geo = resources.get(child.geometry); if (!geo) { geo = child.geometry.clone(); resources.set(child.geometry, geo); } child.geometry = geo;
    const cloneMaterial = (material: THREE.Material) => {
      const cloned = material.clone(); const standard = cloned as THREE.MeshStandardMaterial;
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap'] as const) if (standard[key]) { standard[key] = standard[key]!.clone(); standard[key]!.needsUpdate = true; }
      return cloned;
    };
    child.material = Array.isArray(child.material) ? child.material.map(cloneMaterial) : cloneMaterial(child.material);
  });
  root.rotation.y = rotationY; root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root), dimensions = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  const scale = new THREE.Group(); scale.add(root); root.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
  scale.scale.set(size.x / Math.max(.001, dimensions.x), size.y / Math.max(.001, dimensions.y), size.z / Math.max(.001, dimensions.z));
  if (fit === 'contain') scale.scale.setScalar(Math.min(scale.scale.x, scale.scale.y, scale.scale.z));
  scale.name = 'CC0 licensed model'; return scale;
}
export function addFriendsAsset(owner: THREE.Group, id: FriendsAssetId, size: { x: number; y: number; z: number }, position: THREE.Vector3, rotationY = 0, replace?: THREE.Object3D[], fit: 'stretch' | 'contain' = 'contain') {
  void loadFriendsAsset(id).then(source => {
    if (owner.userData.disposed) return;
    const model = fitFriendsAsset(source, size, rotationY, fit); model.position.copy(position); owner.add(model);
    for (const object of replace || []) object.visible = false;
  }).catch(() => { /* Existing authored geometry remains as the offline/load-error fallback. */ });
}

/** One fitted source and one draw per submesh, even for an entire woodland. */
export function addFriendsAssetInstances(owner: THREE.Group, id: FriendsAssetId, size: { x: number; y: number; z: number }, placements: Array<{ x: number; y: number; z: number; rotation?: number; scale?: number }>) {
  if (!placements.length) return Promise.resolve(true);
  const key=id+':'+[size.x,size.y,size.z].join(',');
  let template=instanceTemplates.get(key);
  if(!template){template=loadFriendsAsset(id).then(source=>{const fitted=fitFriendsAsset(source,size,0,'contain');fitted.updateMatrixWorld(true);fitted.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.userData.friendsShared=true;});return fitted;});instanceTemplates.set(key,template);}
  return template.then(fitted => {
    if (owner.userData.disposed) return false;
    const transform = new THREE.Matrix4(), matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion();
    fitted.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const cloneMaterial=(m:THREE.Material)=>{const clone=m.clone();clone.userData.friendsSharedTextures=true;return clone;};
      const materials=Array.isArray(child.material)?child.material.map(cloneMaterial):cloneMaterial(child.material);
      const instances = new THREE.InstancedMesh(child.geometry, materials, placements.length);
      placements.forEach((p, i) => { quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, p.rotation || 0); transform.compose(new THREE.Vector3(p.x, p.y, p.z), quaternion, new THREE.Vector3().setScalar(p.scale || 1)); matrix.multiplyMatrices(transform, child.matrixWorld); instances.setMatrixAt(i, matrix); });
      instances.castShadow = id.startsWith('frontier'); instances.receiveShadow = true; instances.computeBoundingSphere(); owner.add(instances);
    });
    return true;
  }).catch(() => false);
}

export function friendsAssetsReady(){return Promise.allSettled([...templates.values()]);}
