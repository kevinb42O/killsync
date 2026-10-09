import { FriendsCraneVisuals } from './FriendsCraneVisuals';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { CARGO_WIDTH, CARGO_DEPTH, CARGO_HEIGHT, cargoAnchor } from '../multiplayer/FriendsHauling';
import type { CoopSnapshot } from '../multiplayer/CoopSimulation';
import { isQuietSeat } from '../world/FriendsRetreatSites';
import { FriendsRopeMesh, ropeFibreTextures } from './FriendsRopeMesh';
import { cargoRotation, cargoHullPoints } from '../multiplayer/FriendsCargoPose';
import { FRIENDS_DELIVERY_BAY, FRIENDS_HAULING_JOBS, haulingJob, cargoDelivered, type HaulingGoal } from '../world/FriendsHaulingGoal';
import { FriendsCargoBeacon } from './FriendsCargoBeacon';
import { loadFriendsGrip } from './FriendsHeldEquipment';

type MuzzleProjector = (point:THREE.Object3D)=>{x:number;y:number;z:number};

// Carry trails contain a point for every simulation step. Keep their corners,
// but omit collinear samples so a shoulder or muzzle offset cannot make the
// visible rope double back through the first-person camera.
function carryRopeBends(start:THREE.Vector3,end:THREE.Vector3,bends:THREE.Vector3[]) {
  const result:THREE.Vector3[]=[],previous=start.clone(),delta=new THREE.Vector3(),offset=new THREE.Vector3();
  for(let i=0;i<bends.length;i++) {
    const next=bends[i+1]??end;
    delta.subVectors(next,previous);offset.subVectors(bends[i],previous);
    const t=THREE.MathUtils.clamp(offset.dot(delta)/Math.max(1e-10,delta.lengthSq()),0,1);
    if(offset.addScaledVector(delta,-t).length()>.25){result.push(bends[i]);previous.copy(bends[i]);}
  }
  return result;
}

/** A small shared mesh set; rope buffers are reused rather than rebuilt per frame. */
export class FriendsHaulingVisuals {
  private group = new THREE.Group();
  private gun = new THREE.Group();
  private muzzlePoint = new THREE.Object3D();
  private muzzleRim = new THREE.Object3D();
  private reel = new THREE.Group();
  private goal = new THREE.Group();
  private goalBeacon = new THREE.Group();
  private goalCheck = new THREE.Group();
  private cargoBeacon = new FriendsCargoBeacon();
  private cargoBeacons=new Map<string,FriendsCargoBeacon>();
  private goals=new Map<string,{group:THREE.Group;beacon:THREE.Group;check:THREE.Group}>();
  private loads = new Map<string, THREE.Group>();
  private cranes:FriendsCraneVisuals;
  private ropes = new Map<string, FriendsRopeMesh>();
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private fibres = ropeFibreTextures();
  private start = new THREE.Vector3();
  private end = new THREE.Vector3();
  private rim = new THREE.Vector3();
  private disposed=false;
  constructor(scene: THREE.Scene, viewmodel: THREE.Scene) {
    scene.add(this.group);
    this.cranes=new FriendsCraneVisuals(this.group,this.ropeMaterial());
    // Held equipment belongs to the camera's local space, including at high FOV.
    (viewmodel.getObjectByProperty('type','PerspectiveCamera') || viewmodel).add(this.gun);
    this.group.name = 'friends-hauling'; this.gun.name = 'rope-launcher';
    this.makeGoal();
    for(const job of FRIENDS_HAULING_JOBS.slice(1))this.makeGoal(job.goal,new THREE.Group(),new THREE.Group(),new THREE.Group());
    this.group.add(this.cargoBeacon);this.cargoBeacons.set('lantern-core',this.cargoBeacon);
    const metal = this.material(0x355e60), brass = this.material(0xffc36e), grip = this.material(0x29383a);
    this.roundedBox(this.gun, .23,.16,.35, 0,0,0, metal,.025);
    this.roundedBox(this.gun, .08,.22,.12, .025,-.14,.08, grip,.014);
    this.box(this.gun, .025,.06,.09, -.065,-.075,.01, brass);
    const barrel = new THREE.CylinderGeometry(.047,.063,.35,20,1,true); this.geometries.push(barrel);
    const muzzle = new THREE.Mesh(barrel,grip); muzzle.rotation.x=Math.PI/2; muzzle.position.set(0,.025,-.30); this.gun.add(muzzle);
    const rimGeometry = new THREE.TorusGeometry(.047,.009,8,24);this.geometries.push(rimGeometry);
    const rim=new THREE.Mesh(rimGeometry,brass);rim.position.set(0,.025,-.478);this.gun.add(rim);
    const boreGeometry=new THREE.CircleGeometry(.039,20);this.geometries.push(boreGeometry);
    const bore=new THREE.Mesh(boreGeometry,this.material(0x101a1a));bore.rotation.y=Math.PI;bore.position.set(0,.025,-.465);this.gun.add(bore);
    this.muzzlePoint.name='rope-muzzle';this.muzzlePoint.position.set(0,.025,-.484);
    this.muzzleRim.position.set(.039,.025,-.484);this.gun.add(this.muzzlePoint,this.muzzleRim);
    this.reel.position.set(.155,.025,.02);this.gun.add(this.reel);
    const reelGeometry = new THREE.CylinderGeometry(.105,.105,.075,24); this.geometries.push(reelGeometry);
    const drum = new THREE.Mesh(reelGeometry,grip); drum.rotation.z=Math.PI/2;this.reel.add(drum);
    const flangeGeometry=new THREE.CylinderGeometry(.122,.122,.013,24);this.geometries.push(flangeGeometry);
    for(const x of [-.044,.044]){const flange=new THREE.Mesh(flangeGeometry,brass);flange.rotation.z=Math.PI/2;flange.position.x=x;this.reel.add(flange);}
    const coilMaterial=this.ropeMaterial();this.materials.push(coilMaterial);
    const coilGeometry=new THREE.TorusGeometry(.106,.009,6,32);this.geometries.push(coilGeometry);
    for(let i=-2;i<=2;i++){const coil=new THREE.Mesh(coilGeometry,coilMaterial);coil.rotation.y=Math.PI/2;coil.position.x=i*.015;this.reel.add(coil);}
    // Scale the prop about its grip socket; the character hand retains its size.
    const gripSocket=new THREE.Vector3(.045,-.155,.115);
    for(const child of this.gun.children){child.position.sub(gripSocket).multiplyScalar(1.14).add(gripSocket);child.scale.multiplyScalar(1.14);}
    void loadFriendsGrip('right').then(source=>{
      if(this.disposed)return;
      const arm=source.clone();arm.name='rope-launcher-character-hand';arm.position.set(.045,-.155,.115);this.gun.add(arm);
    }).catch(()=>{});
    const key=new THREE.DirectionalLight(0xffead3,1.4);key.position.set(-.8,1,1);key.target.position.set(0,0,-.2);
    this.gun.add(new THREE.AmbientLight(0xffedd3,.6),key,key.target);this.gun.visible=false;
  }
  private ropeMaterial(){return new THREE.MeshStandardMaterial({color:0xffffff,map:this.fibres.map,normalMap:this.fibres.normalMap,normalScale:new THREE.Vector2(.65,.65),roughness:.92,metalness:0,vertexColors:true});}
  private makeGoal(g:HaulingGoal=FRIENDS_DELIVERY_BAY,goal=this.goal,beacon=this.goalBeacon,check=this.goalCheck){
    const paint=new THREE.MeshBasicMaterial({color:g.color});this.materials.push(paint);
    goal.name=g.id==='delivery-bay'?'hauling-delivery-goal':`hauling-goal-${g.id}`;
    this.goals.set(g.id,{group:goal,beacon,check});goal.position.set(g.x,g.z,g.y);this.group.add(goal);
    const fillMaterial=new THREE.MeshBasicMaterial({color:g.color,transparent:true,opacity:.18,depthWrite:false});this.materials.push(fillMaterial);
    const fillGeometry=new THREE.PlaneGeometry(g.width,g.depth);this.geometries.push(fillGeometry);
    const fill=new THREE.Mesh(fillGeometry,fillMaterial);fill.rotation.x=-Math.PI/2;fill.position.y=.15;goal.add(fill);
    for(const side of [-1,1]){
      this.box(goal,g.width,.5,3,0,.4,side*(g.depth/2-1.5),paint);
      this.box(goal,3,.5,g.depth,side*(g.width/2-1.5),.4,0,paint);
    }
    // Keep approach paint on the home deck, rather than floating above the landscape.
    for(const x of [112])for(const side of [-1,1]){
      const arrow=this.box(goal,20,.5,3,x,.4,side*7,paint);arrow.rotation.y=-side*Math.PI/4;
    }
    beacon.name='delivery-beacon';goal.add(beacon);
    const beamMaterial=new THREE.MeshBasicMaterial({color:g.color,transparent:true,opacity:.2,depthWrite:false});this.materials.push(beamMaterial);
    const beamGeometry=new THREE.CylinderGeometry(12,28,160,16,1,true);this.geometries.push(beamGeometry);
    const beam=new THREE.Mesh(beamGeometry,beamMaterial);beam.position.y=80;beacon.add(beam);
    const diamondGeometry=new THREE.OctahedronGeometry(10);this.geometries.push(diamondGeometry);
    const diamond=new THREE.Mesh(diamondGeometry,paint);diamond.position.y=165;beacon.add(diamond);
    check.name='delivery-complete-check';check.position.y=85;goal.add(check);
    const short=this.box(check,16,4,4,-8,-3,0,paint);short.rotation.z=-Math.PI/4;
    const long=this.box(check,28,4,4,6,2,0,paint);long.rotation.z=Math.PI/4;
    check.visible=false;
    goal.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=false;o.receiveShadow=false;}});
  }
  private material(color:number) { const m=new THREE.MeshStandardMaterial({color,roughness:.65,metalness:.35});this.materials.push(m);return m; }
  private roundedBox(parent:THREE.Group,w:number,h:number,d:number,x:number,y:number,z:number,material:THREE.Material,radius:number){
    const g=new RoundedBoxGeometry(w,h,d,2,radius);this.geometries.push(g);const mesh=new THREE.Mesh(g,material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
  }
  private box(parent:THREE.Group,w:number,h:number,d:number,x:number,y:number,z:number,material:THREE.Material) {
    const g=new THREE.BoxGeometry(w,h,d);this.geometries.push(g);const m=new THREE.Mesh(g,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  }
  private makeLoad(id:string) {
    const group=new THREE.Group(), metal=this.material(id==='lantern-core'?0x427778:new THREE.Color(haulingJob({id}).goal.color).multiplyScalar(.55).getHex()), dark=this.material(0x293c41), brass=this.material(0xf4bf74);
    const shellGeometry=new ConvexGeometry(cargoHullPoints().map(p=>new THREE.Vector3(p.x,p.z,p.y)));this.geometries.push(shellGeometry);
    const shell=new THREE.Mesh(shellGeometry,metal);shell.castShadow=shell.receiveShadow=true;group.add(shell);
    for(const y of [-10,10])this.box(group,38,6,8,0,3,y,dark);
    for(const x of [-24,24])this.box(group,8,24,CARGO_DEPTH+2,x,36,0,dark);
    this.box(group,22,6,24,0,CARGO_HEIGHT+2,0,brass);
    for(const x of [-36,36])for(const z of [-17,17])this.box(group,5,8,8,x,24,z,brass);
    const straps=new THREE.Group();straps.name='cargo-straps';group.add(straps);
    for(const x of [-15,15]) {this.box(straps,4,2,CARGO_DEPTH+6,x,CARGO_HEIGHT+1,0,brass);for(const z of [-CARGO_DEPTH/2-2,CARGO_DEPTH/2+2])this.box(straps,4,CARGO_HEIGHT,2,x,CARGO_HEIGHT/2,z,brass);}
    this.group.add(group);return group;
  }
  update(snapshot:CoopSnapshot,localId:string,tool:number,elapsed:number,projectMuzzle:MuzzleProjector,firstPerson=true) {
    const hauling=snapshot.friends?.hauling, local=snapshot.players.find(p=>p.id===localId);
    this.group.visible=Boolean(hauling);
    this.gun.visible=Boolean(firstPerson && hauling && tool===5 && local?.lifeState==='alive' && !isQuietSeat(local.friendsSeat) && !local.motion?.swimming && !snapshot.friends?.vehicles.some(v=>v.pilotId===localId));
    this.gun.position.set(.30,-.28+Math.sin(elapsed/1000)*.003,-.73); this.gun.rotation.set(-.07,-.12,-.04);
    this.reel.rotation.x=-elapsed/600*(hauling?.ropes.find(r=>r.id===localId)?.tension??0);
    this.gun.updateWorldMatrix(true,true);
    if(!hauling)return;
    this.cranes.update(hauling.cranes??[],hauling.cargo,local);
    const goalIds=new Set<string>(hauling.cargo.map(c=>haulingJob(c).goal.id));
    for(const [id,goal]of this.goals){
      goal.group.visible=goalIds.has(id);
      const cargo=hauling.cargo.find(c=>haulingJob(c).goal.id===id),done=Boolean(cargo&&cargoDelivered(hauling,cargo));
      goal.beacon.visible=!done;goal.check.visible=done;goal.beacon.rotation.y=elapsed/1600;goal.check.rotation.y=elapsed/2200;
    }
    for(const [id,beacon]of this.cargoBeacons)beacon.visible=hauling.cargo.some(c=>c.id===id);
    for(const cargo of hauling.cargo){
      let beacon=this.cargoBeacons.get(cargo.id);if(!beacon){beacon=new FriendsCargoBeacon();this.group.add(beacon);this.cargoBeacons.set(cargo.id,beacon);}
      beacon.update(cargo,elapsed,cargoDelivered(hauling,cargo),cargo.id==='lantern-core'?'#ffc36e':haulingJob(cargo).goal.color);
    }
    const cargoIds=new Set(hauling.cargo.map(c=>c.id)), ropeIds=new Set([...hauling.ropes,...(hauling.playerRopes??[])].map(r=>r.id));
    for(const [id,group]of this.loads)if(!cargoIds.has(id)){group.visible=false;}
    for(const cargo of hauling.cargo){let group=this.loads.get(cargo.id);if(!group){group=this.makeLoad(cargo.id);this.loads.set(cargo.id,group);}group.visible=true;group.position.set(cargo.x,cargo.z,cargo.y);const q=cargoRotation(cargo);group.quaternion.set(-q.x,-q.z,-q.y,q.w);group.getObjectByName('cargo-straps')!.visible=Boolean(cargo.secured);}
    for(const [id,mesh]of this.ropes)if(!ropeIds.has(id)){mesh.dispose();mesh.removeFromParent();this.ropes.delete(id);}
    for(const rope of [...hauling.ropes,...(hauling.playerRopes??[])]){
      const player=snapshot.players.find(p=>p.id===rope.id);
      const cargo='cargoId' in rope?hauling.cargo.find(c=>c.id===rope.cargoId):undefined;
      const passenger='playerId' in rope?snapshot.players.find(p=>p.id===rope.playerId):undefined;
      if(!player||(!cargo&&!passenger))continue;
      let mesh=this.ropes.get(rope.id);
      if(!mesh){mesh=new FriendsRopeMesh(this.ropeMaterial());this.group.add(mesh);this.ropes.set(rope.id,mesh);}
      const anchor=cargo&&'cargoId' in rope?cargoAnchor(cargo,rope):{x:passenger!.x,y:passenger!.y,z:passenger!.z+16},forward=Math.cos(player.angle),side=Math.sin(player.angle);
      this.start.set(player.x+forward*8-side*10,player.z+26,player.y+side*8+forward*10);
      let startRadius=1.45;
      if(player.id===localId && this.gun.visible){
        // Screen-space muzzle matching across the independently projected cameras.
        // The rim projection also matches near-field thickness to the actual bore.
        const start=projectMuzzle(this.muzzlePoint),rim=projectMuzzle(this.muzzleRim);
        this.start.set(start.x,start.y,start.z);this.rim.set(rim.x,rim.y,rim.z);
        startRadius=THREE.MathUtils.clamp(this.start.distanceTo(this.rim)*.88,.04,1.45);
      }
      this.end.set(anchor.x,anchor.z,anchor.y);
      let bends=rope.bends?.map(p=>new THREE.Vector3(p.x,p.z,p.y));
      if(passenger&&bends)bends=carryRopeBends(new THREE.Vector3(player.x,player.z+26,player.y),new THREE.Vector3(passenger.x,passenger.z+26,passenger.y),bends);
      mesh.update(this.start,this.end,rope.length,'tension' in rope?rope.tension:.4,startRadius,bends);
      mesh.material.color.setHex('blocked' in rope&&rope.blocked?0xd9947b:0xffffff);
    }
  }
  dispose(){this.disposed=true;this.cranes.dispose();for(const beacon of this.cargoBeacons.values())beacon.dispose();this.cargoBeacons.clear();this.goals.clear();this.group.removeFromParent();this.gun.removeFromParent();for(const g of this.geometries)g.dispose();for(const m of this.materials)m.dispose();for(const mesh of this.ropes.values())mesh.dispose();this.fibres.map.dispose();this.fibres.normalMap.dispose();this.loads.clear();this.ropes.clear();}
}
