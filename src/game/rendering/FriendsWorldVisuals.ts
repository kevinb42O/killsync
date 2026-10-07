import { addFriendsAsset, fitFriendsAsset, loadFriendsAsset, type FriendsAssetId } from './FriendsAssets';
import * as THREE from 'three';
import { createScenicTrainVisual,updateScenicTrainVisual } from './FriendsScenicTrainVisuals';
import { FRIENDS_SPAWN_PLATFORM, FRIENDS_HAULING_PLATFORM } from '../world/FriendsTerrain';
import { FRIENDS_DELIVERY_BAY } from '../world/FriendsHaulingGoal';
import { trainGangways, type FriendsSnapshot, type FriendsVehicle } from '../multiplayer/FriendsExpedition';

const palette = { grass: 0x476955, metal: 0x23464b, cream: 0xe9dfbe, dark: 0x19353a, mint: 0x8de6ce, amber: 0xffcf8a, purple: 0xc9b2eb };
const material = (color: number, metalness = .15, roughness = .7) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
function box(group: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); mesh.position.set(x, y, z); group.add(mesh); return mesh;
}
function cylinder(group: THREE.Object3D, radius: number, height: number, x: number, y: number, z: number, mat: THREE.Material, top = radius) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, radius, height, 16), mat); mesh.position.set(x, y, z); group.add(mesh); return mesh;
}
function label(text: string, color = '#e9dfbe') {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(12,35,36,.94)'; ctx.fillRect(0, 0, 1024, 128);
  ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.strokeRect(4, 4, 1016, 120);
  ctx.font = 'bold 46px monospace'; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 512, 67);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })); sprite.scale.set(240, 30, 1); return sprite;
}
function sign(group: THREE.Object3D, text: string, x: number, y: number, z: number, width = 240, color?: string) {
  const sprite = label(text, color); sprite.position.set(x, y, z); sprite.scale.set(width * .42, width / 8 * .42, 1); group.add(sprite); return sprite;
}
function vehicleNameplates(group: THREE.Group, text: string, x: number, y: number, sideOffset: number, width: number) {
  // Vehicle labels are mounted on their sides. Camera-facing sprites sliced
  // through roofs and seats as passengers looked around the cabin.
  const source=label(text,'#ffd494');
  const mat=new THREE.MeshBasicMaterial({map:source.material.map,side:THREE.DoubleSide});source.material.dispose();
  const geometry=new THREE.PlaneGeometry(width,width/8);
  for(const side of [-1,1]){const plate=new THREE.Mesh(geometry,mat);plate.position.set(x,y,side*sideOffset);plate.rotation.y=side<0?Math.PI:0;group.add(plate);}
}
/** The spawn deck is terrain; these markings identify its permanent safe area. */
export function createFriendsEnvironment(): THREE.Group {
  const group = new THREE.Group(); group.name = 'friends-frontier-environment';
  const p = FRIENDS_SPAWN_PLATFORM, glow = new THREE.MeshBasicMaterial({ color: palette.mint });
  for (const side of [-1, 1]) {
    box(group, p.size - 12, .5, 3, p.x, p.top + .3, p.y + side * (p.size / 2 - 8), glow);
    box(group, 3, .5, p.size - 12, p.x + side * (p.size / 2 - 8), p.top + .3, p.y, glow);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(76, 79, 48), glow);
  ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, p.top + .6, p.y); group.add(ring);
  sign(group, 'PLAYER SPAWN', p.x, p.top + 70, p.y - 120, 360, '#8de6ce');
  const bay=FRIENDS_HAULING_PLATFORM, paint=new THREE.MeshBasicMaterial({color:0xffc36e});
  for(const side of [-1,1]){
    box(group,bay.size-12,.5,3,bay.x,bay.top+.3,bay.y+side*(bay.size/2-8),paint);
    box(group,3,.5,bay.size-12,bay.x+side*(bay.size/2-8),bay.top+.3,bay.y,paint);
    // The centre outline shows exactly where the core resets.
    box(group,84,.5,2,bay.x,bay.top+.5,bay.y+side*34,paint);
    box(group,2,.5,68,bay.x+side*42,bay.top+.5,bay.y,paint);
  }
  sign(group,'SALVAGE PICKUP',bay.x,bay.top+70,bay.y-92,340,'#ffc36e');
  const goal=FRIENDS_DELIVERY_BAY;
  sign(group,'DELIVERY BAY · GOAL',goal.x,goal.z+125,goal.y,440,goal.color);
  return group;
}

function createLocomotive() {
  const group = new THREE.Group();
  const fallback = box(group, 180, 100, 112, 0, 45, 0, material(palette.cream));
  addFriendsAsset(group, 'locomotive', { x: 180, y: 129, z: 112 }, new THREE.Vector3(0, -14, 0), Math.PI / 2, [fallback], 'stretch');
  vehicleNameplates(group,'SUNLINE 01',0,38,57,90);
  return group;
}
function createTrainCar(index: number) {
  const group = new THREE.Group(), cream = material(palette.cream), dark = material(palette.dark, .5), teal = material(0x426c69), glow = new THREE.MeshBasicMaterial({ color: palette.amber });
  const undercarriage=new THREE.Group();group.add(undercarriage);
  box(undercarriage,180,10,112,0,-9,0,dark);
  addFriendsAsset(group,'carriage',{x:180,y:10,z:112},new THREE.Vector3(0,-14,0),Math.PI/2,[undercarriage],'stretch');
  box(group,174,2,106,0,-3,0,dark);
  box(group, 174, 2, 106, 0, -1, 0, material(0x887f6b));
  for (const x of [-64, 64]) for (const z of [-53, 53]) { const wheel = cylinder(undercarriage, 10, 7, x, -4, z, dark); wheel.rotation.x = Math.PI / 2; }
  // Open sightseeing carriages, with space to walk and jump off the sides.
  for (const x of [-82, 82]) for (const z of [-50, 50]) cylinder(group, 2.5, 109, x, 54.5, z, cream);
  box(group, 186, 6, 120, 0, 112, 0, cream);
  for (const z of [-52, 52]) { box(group, 152, 3, 3, 0, 19, z, teal); box(group, 130, 2, 2, 0, 105, z, glow); }
  for (const x of [-50, 20]) for (const z of [-38, 38]) { box(group, 36, 13, 17, x, 6.5, z, teal); box(group, 36, 20, 3, x, 22, Math.sign(z) * 47, teal); }
  vehicleNameplates(group,index===0?'SUNLINE 01':'SUNLINE / '+(index+1),0,25,54,90);
  return group;
}
function createAircraft() {
  const group = new THREE.Group(), dark = material(palette.dark, .65), cream = material(palette.cream, .35), mint = new THREE.MeshBasicMaterial({ color: palette.mint }), teal = material(0x477a78, .6);
  // A purpose-built open hull, rather than a closed spacecraft flattened
  // into the walking floor. The bevel, deck and skids have distinct surfaces.
  const outline=new THREE.Shape();outline.moveTo(-140,-62);outline.lineTo(-124,-80);outline.lineTo(114,-80);outline.lineTo(140,-54);outline.lineTo(140,54);outline.lineTo(114,80);outline.lineTo(-124,80);outline.lineTo(-140,62);outline.closePath();
  const hullGeometry=new THREE.ExtrudeGeometry(outline,{depth:10,bevelEnabled:true,bevelSize:.7,bevelThickness:.7,bevelSegments:1,steps:1});hullGeometry.rotateX(Math.PI/2);
  const hull=new THREE.Mesh(hullGeometry,dark);hull.position.y=-3;hull.name='sunskiff-beveled-hull';group.add(hull);
  box(group, 264, 2, 144, 0, -1, 0, material(0x65777a));
  for (let i = -110; i < 135; i += 30) box(group, 2, .5, 140, i, .25, 0, cream);
  for (const z of [-76, 76]) { box(group, 286, 4, 5, 0, -2, z, cream); box(group, 250, 2, 2, 0, 6, z, mint); }
  // The cargo cabin is open on both sides; passengers remain real operators.
  for (const x of [-110, 50]) for (const z of [-75, 75]) cylinder(group, 3, 101, x, 50.5, z, cream);
  box(group, 190, 8, 168, -28, 105, 0, teal);
  for (const x of [-75, -20, 30]) for (const z of [-60, 60]) {
    const seat = box(group, 29, 13, 22, x, 9, z, dark), back = box(group, 29, 27, 4, x, 29, Math.sign(z) * 73, teal);
    addFriendsAsset(group, 'chair', { x: 29, y: 38, z: 29 }, new THREE.Vector3(x, 0, z), z > 0 ? Math.PI : 0, [seat, back]);
  }
  box(group, 20, 33, 110, 127, 16.5, 0, teal);
  const screen=box(group,2,17,78,127,44,0,mint);
  addFriendsAsset(group,'computer',{x:22,y:28,z:88},new THREE.Vector3(127,33,0),-Math.PI/2,[screen]);
  addFriendsAsset(group, 'generator', { x: 65, y: 18, z: 65 }, new THREE.Vector3(-60, 109, 0));
  // Nose canopy above the pilot, leaving a clean view through the glass.
  const glass = new THREE.MeshStandardMaterial({ color: 0x9ae3df, transparent: true, opacity: .13, metalness: .4, roughness: .16, side: THREE.DoubleSide, depthWrite: false });
  const windshield=new THREE.Mesh(new THREE.PlaneGeometry(156,57),glass);windshield.rotation.y=Math.PI/2;windshield.position.set(143,70,0);group.add(windshield);
  box(group,78,7,164,106,103,0,cream);
  for(const z of [-78,78])box(group,4,94.5,4,141,52.25,z,cream);
  for (const x of [-72, 70]) for (const z of [-122, 122]) {
    box(group, 25, 7, 95, x, -6, z * .72, teal);
    const duct = new THREE.Mesh(new THREE.TorusGeometry(42, 8, 10, 32), cream); duct.rotation.x = Math.PI / 2; duct.position.set(x, 8, z); group.add(duct);
    cylinder(group, 11, 17, x, 8, z, dark);
    const rotor = new THREE.Group(); rotor.name = 'sunskiff-rotor'; rotor.position.set(x, 9, z);
    for(const end of [-1,1]){box(rotor,28,1.7,7,end*21,0,0,dark);box(rotor,7,1.7,28,0,0,end*21,dark);} group.add(rotor);
    cylinder(group,22,4,x,-3,z,mint);
    // Engine casing terminates beneath the luminous flange, never inside it.
    addFriendsAsset(group,'engine',{x:36,y:8,z:36},new THREE.Vector3(x,-13,z));
  }
  // Landing skids and broad rear step help boarding from ground level.
  for (const z of [-60, 60]) { box(group, 240, 3, 5, 0, -12, z, dark); for (const x of [-80, 85]) cylinder(group, 2, 10, x, -7, z, cream); }
  box(group, 36, 4, 120, -140, -6, 0, cream);
  vehicleNameplates(group,'SUNSKIFF',-40,-7,82,85);
  return group;
}

export class FriendsVehicleVisuals {
  readonly group = new THREE.Group();
  private vehicles = new Map<string, THREE.Group>();
  private gangways = new Map<string, THREE.Group>();
  constructor(scene: THREE.Scene) { this.group.name = 'friends-vehicles'; scene.add(this.group); }
  update(snapshot: FriendsSnapshot | undefined, elapsedMs: number) {
    this.group.visible = Boolean(snapshot);
    if (!snapshot) return;
    for(const mesh of this.vehicles.values())mesh.visible=false;
    for(const mesh of this.gangways.values())mesh.visible=false;
    for (const vehicle of snapshot.vehicles) {
      let mesh = this.vehicles.get(vehicle.id);
      if (!mesh) { mesh = vehicle.kind === 'train' ? vehicle.scenic ? createScenicTrainVisual(Boolean(vehicle.closed),Number(vehicle.id.split('-').at(-1)),vehicle.wagonKind) : vehicle.closed ? createLocomotive() : createTrainCar(Number(vehicle.id.at(-1))) : createAircraft(); mesh.name = vehicle.id; this.vehicles.set(vehicle.id, mesh); this.group.add(mesh); }
      mesh.visible=true; this.pose(mesh, vehicle);if(vehicle.scenic)updateScenicTrainVisual(mesh,vehicle);
      mesh.traverse(child => { if (child.name === 'sunskiff-rotor') child.rotation.y = elapsedMs * (vehicle.pilotId ? .06 : .018); });
    }
    for (const link of trainGangways(snapshot.vehicles)) {
      const key = `${link.from.id}:${link.to.id}`;
      let gangway = this.gangways.get(key);
      if (!gangway) {
        gangway = new THREE.Group(); gangway.name = 'flexible-train-gangway';
        box(gangway, 1, 2, link.width, 0, -1.75, 0, material(0x887f6b));
        for (const side of [-1, 1]) box(gangway, 1, 3, 3, 0, 27, side * link.width / 2, material(0x8f9b98));
        this.gangways.set(key, gangway); this.group.add(gangway);
      }
      gangway.visible=true; gangway.position.set((link.ax + link.bx) / 2, link.z, (link.ay + link.by) / 2);
      gangway.rotation.set(0,-Math.atan2(link.by-link.ay,link.bx-link.ax),Math.atan2(link.bz-link.az,Math.hypot(link.bx-link.ax,link.by-link.ay)),'YXZ');
      gangway.scale.x = Math.max(1, Math.hypot(link.bx - link.ax, link.by - link.ay,link.bz-link.az));
    }

  }
  private pose(mesh: THREE.Group, v: FriendsVehicle) { mesh.position.set(v.x, v.z, v.y); mesh.rotation.set(0,-v.angle,v.pitch||0,'YXZ'); }
  dispose() {
    this.group.userData.disposed = true;
    this.group.traverse(child => { child.userData.disposed = true; });
    this.group.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures=new Set<THREE.Texture>();
    this.group.traverse(child => { if(child instanceof THREE.SpotLight||child instanceof THREE.InstancedMesh)child.dispose();const resources=child.userData.railwayFinishResources;if(resources){textures.add(resources.grain);for(const material of resources.materials)materials.add(material);}
      const m = child as THREE.Mesh; if (m.geometry) geometries.add(m.geometry); if (m.material) for (const mat of Array.isArray(m.material) ? m.material : [m.material]) materials.add(mat); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => { const map=(m as THREE.SpriteMaterial).map;if(map)textures.add(map);m.dispose(); });textures.forEach(t=>t.dispose()); this.vehicles.clear(); this.gangways.clear();
  }
}
