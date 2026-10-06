import { isPlayerRail, sampleRail, railLength } from '../world/FriendsPlayerRail';
import * as THREE from 'three';
import { frontierMaterial } from './FriendsFrontierVisuals';
import { FRIENDS_TERRAIN_SURFACES } from '../world/FriendsTerrainAppearance';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FRIENDS_BUILD_CATALOG, FRIENDS_FINISHES, friendsShapeBoxes, isSlope, type FriendsBuildShape, type FriendsBuildFinish, type FriendsBuildPose, type FriendsBuildingSnapshot } from '../multiplayer/FriendsBuilding';
export function createFriendsBuildGeometry(shape: FriendsBuildShape) {
  const def = FRIENDS_BUILD_CATALOG[shape];
  if (isPlayerRail(shape)) {
    const piece={x:0,y:0,z:0,rotation:0,shape}, parts:THREE.BufferGeometry[]=[];
    const add=(g:THREE.BufferGeometry,color:string)=>{const c=new THREE.Color(color),count=g.getAttribute('position').count;g.setAttribute('color',new THREE.Float32BufferAttribute(Array.from({length:count},()=>[c.r,c.g,c.b]).flat(),3));parts.push(g);};
    const count=Math.ceil(railLength(piece)/16);
    for(let i=0;i<count;i++) {const a=sampleRail(piece,i/count),b=sampleRail(piece,(i+1)/count),angle=(a.angle+b.angle)/2,length=Math.hypot(b.x-a.x,b.y-a.y)+.3;
      for(const side of [-37,37])add(new THREE.BoxGeometry(length,5,4).rotateY(-angle).translate((a.x+b.x)/2-Math.sin(angle)*side,5.5,(a.y+b.y)/2+Math.cos(angle)*side),'#7d9298');
    }
    const sleepers=Math.ceil(railLength(piece)/32);
    for(let i=0;i<sleepers;i++){const p=sampleRail(piece,(i+.5)/sleepers);add(new THREE.BoxGeometry(12,3,108).rotateY(-p.angle).translate(p.x,1.5,p.y),'#806044');}
    const geometry=mergeGeometries(parts)!;parts.forEach(p=>p.dispose());return geometry;
  }
  if (shape === 'glass') return new THREE.PlaneGeometry(def.w, def.h).translate(0, def.h / 2, 0);
  if (shape === 'lamp') {
    const parts = [new THREE.BoxGeometry(8,48,8).translate(0,24,0),new THREE.BoxGeometry(16,2,16).translate(0,49,0),new THREE.BoxGeometry(16,2,16).translate(0,63,0)];
    for(const x of [-7,7])for(const z of [-7,7])parts.push(new THREE.BoxGeometry(2,12,2).translate(x,56,z));
    const geometry=mergeGeometries(parts)!;parts.forEach(p=>p.dispose());return geometry;
  }
  if (isSlope(shape)) {
    const w = def.w / 2, d = def.d / 2, h = def.h;
    const vertices = [-w,0,-d, w,0,-d, w,h,-d, -w,0,d, w,0,d, w,h,d];
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex([0,2,1,3,4,5,0,1,4,0,4,3,1,2,5,1,5,4,0,3,5,0,5,2]);
    const flat = geo.toNonIndexed(); geo.dispose(); flat.computeVertexNormals(); return flat;
  }
  const parts = friendsShapeBoxes(shape).map(b => new THREE.BoxGeometry(b.w, b.h, b.d).translate(b.x, b.z + b.h / 2, b.y));
  const geometry = mergeGeometries(parts)!; parts.forEach(p => p.dispose());
  return geometry;
}

export function prepareFriendsBuildGeometry(geometry: THREE.BufferGeometry, shape: FriendsBuildShape) {
  if (isPlayerRail(shape)) return geometry;
  const normal = geometry.getAttribute('normal'), count = normal.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const ny = normal.getY(i), nx = normal.getX(i);
    const shade = ny > .5 ? 1 : ny < -.5 ? .55 : Math.abs(nx) > .5 ? .84 : .92;
    colors.set([shade, shade, shade], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (!geometry.getAttribute('uv')) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  geometry.clearGroups();
  const indices = geometry.getIndex(), triangles = indices ? indices.count : count;
  for (let start = 0; start < triangles; start += 3) {
    const materialIndex = normal.getY(indices ? indices.getX(start) : start) > .5 ? 0 : 1;
    const previous = geometry.groups.at(-1);
    if (previous?.materialIndex === materialIndex) previous.count += 3;
    else geometry.addGroup(start, 3, materialIndex);
  }
  return geometry;
}

export function createFriendsBuildMaterial(shape: FriendsBuildShape, finish: FriendsBuildFinish): THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[] {
  const terrain = FRIENDS_TERRAIN_SURFACES[finish as keyof typeof FRIENDS_TERRAIN_SURFACES];
  if (terrain && !isPlayerRail(shape) && shape !== 'glass') {
    const top = frontierMaterial(terrain.asset, terrain.color, true);
    return finish === 'grass' ? [top, frontierMaterial('Ground037', FRIENDS_TERRAIN_SURFACES.soil.color, true)] : top;
  }
  const f = FRIENDS_FINISHES[finish];
  if (finish === 'timber' && !isPlayerRail(shape) && shape !== 'glass') return frontierMaterial('WoodFloor051', f.color, true);
  return new THREE.MeshStandardMaterial({ vertexColors: isPlayerRail(shape), color: isPlayerRail(shape) ? '#ffffff' : shape === 'glass' ? '#a9e4d7' : f.color,
    roughness: shape === 'glass' ? .12 : f.roughness, metalness: f.metalness, transparent: shape === 'glass', opacity: shape === 'glass' ? .34 : 1,
    depthWrite: shape !== 'glass', side: shape === 'glass' ? THREE.DoubleSide : THREE.FrontSide,
    emissive: shape === 'lamp' ? '#ffc879' : shape === 'gathering_beacon' ? '#8de6ce' : shape === 'survey_lens' ? '#baa4fa' : '#000000', emissiveIntensity: .45 });
}
export class FriendsBuildVisuals {
  readonly group = new THREE.Group();
  private geometries = new Map<FriendsBuildShape, THREE.BufferGeometry>();
  private materials = new Map<string, THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[]>();
  private batches = new Map<string, THREE.InstancedMesh>();
  private revision = -1;
  private detailBatches: THREE.InstancedMesh[] = [];
  private detailGeometries: THREE.BufferGeometry[] = [];
  private detailMaterials: THREE.Material[] = [];
  private ghost?: THREE.Mesh;
  private outline?: THREE.LineSegments;
  private ghostMaterial = new THREE.MeshBasicMaterial({ color: '#8de6ce', transparent: true, opacity: .3, depthWrite: false });
  private outlineMaterial = new THREE.LineBasicMaterial({ color: '#eaffdb', transparent: true, opacity: .85, depthWrite: false });
  constructor(scene: THREE.Scene) { this.group.name = 'friends-creations'; scene.add(this.group); }
  private geometry(shape: FriendsBuildShape) { let g = this.geometries.get(shape); if (!g) { g = prepareFriendsBuildGeometry(createFriendsBuildGeometry(shape), shape); this.geometries.set(shape, g); } return g; }
  update(building: FriendsBuildingSnapshot | undefined) {
    this.group.visible = Boolean(building); if (!building || building.revision === this.revision) return;
    this.revision = building.revision;
    const grouped = new Map<string, typeof building.pieces>();
    for (const p of building.pieces) { const k = `${p.shape}:${p.finish}`, a = grouped.get(k) || []; a.push(p); grouped.set(k, a); }
    for (const mesh of this.batches.values()) mesh.visible = false;
    const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), position = new THREE.Vector3();
    for (const [key, pieces] of grouped) {
      const { shape, finish } = pieces[0], f = FRIENDS_FINISHES[finish];
      let material = this.materials.get(key);
      if (!material) { material = createFriendsBuildMaterial(shape, finish); this.materials.set(key, material); }
      let mesh = this.batches.get(key);
      if (!mesh || mesh.instanceMatrix.count < pieces.length) {
        if (mesh) { mesh.removeFromParent(); mesh.dispose(); }
        mesh = new THREE.InstancedMesh(this.geometry(shape), material, Math.max(8, 2 ** Math.ceil(Math.log2(pieces.length))));
        mesh.name = `creation:${key}`; mesh.castShadow = true; mesh.receiveShadow = true; this.batches.set(key, mesh); this.group.add(mesh);
      }
      mesh.visible = true; mesh.count = pieces.length;
      pieces.forEach((p, i) => { position.set(p.x, p.z, p.y); quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -p.rotation * Math.PI / 2); matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1)); mesh!.setMatrixAt(i, matrix); });
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    }
    this.clearDetails();
    const detail = (shape: FriendsBuildShape, geometry: THREE.BufferGeometry, color: string, luminous = false) => {
      const pieces = building.pieces.filter(p => p.shape === shape);
      if (!pieces.length) { geometry.dispose(); return; }
      const material = new THREE.MeshStandardMaterial({ color, roughness: .65, emissive: luminous ? color : '#000000', emissiveIntensity: luminous ? .8 : 0 });
      const mesh = new THREE.InstancedMesh(geometry, material, pieces.length);
      pieces.forEach((p,i) => { position.set(p.x,p.z,p.y); quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP,-p.rotation*Math.PI/2); matrix.compose(position,quaternion,new THREE.Vector3(1,1,1)); mesh.setMatrixAt(i,matrix); });
      mesh.castShadow = true; mesh.computeBoundingSphere(); this.group.add(mesh); this.detailBatches.push(mesh); this.detailGeometries.push(geometry); this.detailMaterials.push(material);
    };
    detail('workbench', new THREE.BoxGeometry(68,4,12).translate(0,67,18), '#ded0a6');
    detail('workbench', new THREE.BoxGeometry(7,14,20).translate(28,70,-16), '#667e7d');
    detail('furnace', new THREE.BoxGeometry(26,22,2).translate(0,22,-32.5), '#ff9c48', true);
    for (const x of [-15,15]) detail('furnace',new THREE.BoxGeometry(4,28,3).translate(x,22,-33),'#4b504c');
    for (const y of [9,35]) detail('furnace',new THREE.BoxGeometry(30,4,3).translate(0,y,-33),'#4b504c');
    detail('storage', new THREE.BoxGeometry(66,4,50).translate(0,41,0), '#566b63');
    detail('storage', new THREE.BoxGeometry(8,10,2).translate(0,33,-25), '#dcc483');
    for (const x of [-36,36]) detail('landing_pad', new THREE.BoxGeometry(9,1,110).translate(x,8.6,0), '#eee4c4');
    detail('landing_pad', new THREE.BoxGeometry(72,1,9).translate(0,8.6,0), '#eee4c4');
    detail('planter',new THREE.BoxGeometry(40,2,40).translate(0,24.5,0),'#574e39');
    for (const [x,z] of [[-12,-10],[10,-8],[0,10]]) {
      detail('planter',new THREE.CylinderGeometry(1,1,10,5).translate(x,30,z),'#60896a');
      detail('planter',new THREE.IcosahedronGeometry(5,0).translate(x,35,z),'#f3d4ad');
    }
    detail('lamp',new THREE.BoxGeometry(12,12,12).translate(0,56,0),'#ffdb8c',true);
    detail('survey_lens',new THREE.CylinderGeometry(12,12,3,20).rotateX(Math.PI/2).translate(0,56,-17),'#b3d9ed',true);
    detail('gathering_beacon',new THREE.TorusGeometry(19,2,6,24).rotateX(Math.PI/2).translate(0,57,0),'#a7e5d2',true);
    // The sign carries a physical sun motif visible from either side.
    detail('sign',new THREE.CylinderGeometry(9,9,1,16).rotateX(Math.PI/2).translate(0,48,-4.8),'#ffe1a2');
    detail('sign',new THREE.CylinderGeometry(9,9,1,16).rotateX(Math.PI/2).translate(0,48,4.8),'#ffe1a2');
  }
  preview(shape?: FriendsBuildShape, pose?: FriendsBuildPose, valid = true, finish: FriendsBuildFinish = 'stone') {
    if (!shape || !pose) { if (this.ghost) this.ghost.visible = false; if (this.outline) this.outline.visible = false; return; }
    const geometry = this.geometry(shape);
    if (!this.ghost || this.ghost.geometry !== geometry) {
      this.ghost?.removeFromParent(); this.outline?.removeFromParent(); this.outline?.geometry.dispose();
      this.ghost = new THREE.Mesh(geometry, this.ghostMaterial); this.outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), this.outlineMaterial);
      this.group.add(this.ghost, this.outline);
    }
    this.ghostMaterial.color.set(valid ? FRIENDS_FINISHES[finish].color : '#f88472'); this.outlineMaterial.color.set(valid ? '#b7ffe1' : '#ff9481');
    for (const object of [this.ghost, this.outline!]) { object.visible = true; object.position.set(pose.x, pose.z, pose.y); object.rotation.y = -pose.rotation * Math.PI / 2; }
  }
  private clearDetails() { this.detailBatches.forEach(m => { m.removeFromParent(); m.dispose(); }); this.detailGeometries.forEach(g => g.dispose()); this.detailMaterials.forEach(m => m.dispose()); this.detailBatches = []; this.detailGeometries = []; this.detailMaterials = []; }
  dispose() { this.clearDetails(); this.group.removeFromParent(); this.outline?.geometry.dispose(); this.batches.forEach(m => m.dispose()); this.geometries.forEach(g => g.dispose()); this.materials.forEach(material => { for (const m of Array.isArray(material) ? material : [material]) { m.map?.dispose(); m.normalMap?.dispose(); m.roughnessMap?.dispose(); m.dispose(); } }); this.ghostMaterial.dispose(); this.outlineMaterial.dispose(); }
}
