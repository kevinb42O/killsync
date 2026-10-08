import { SCENIC_CAR_LENGTH, type ScenicWagonKind } from '../world/FriendsTrainLayout';
import * as THREE from 'three';
import { createRailwayFinishes,RAIL_FINISH as M } from './FriendsRailwayFinish';
import { SCENIC_SEATS } from '../multiplayer/FriendsScenicService';
import { scenicRailway } from '../world/FriendsScenicRailway';
import { sampleRailAlignment } from '../world/FriendsRailAlignment';
import { vehicleLocalPoint } from '../multiplayer/FriendsVehiclePose';
import type { FriendsVehicle } from '../multiplayer/FriendsExpedition';

type Bogie={group:THREE.Group;offset:number;wheels:THREE.Group[]};
type RunningGear={batches:{mesh:THREE.InstancedMesh;slots:{bogie:Bogie;wheel?:THREE.Group;local:THREE.Matrix4}[]}[];matrix:THREE.Matrix4;poses:{object:THREE.Object3D;matrix:THREE.Matrix4}[];valid:boolean};
/** Preserve the original tyre/rim/hub geometry in four articulated batches. */
export function updateScenicRunningGear(group:THREE.Group){
  const gear=group.userData.scenicRunningGear as RunningGear|undefined;if(!gear)return;
  let changed=!gear.valid;for(const pose of gear.poses){pose.object.updateMatrix();if(!pose.matrix.equals(pose.object.matrix)){changed=true;pose.matrix.copy(pose.object.matrix);}}
  if(!changed)return;gear.valid=true;
  for(const batch of gear.batches){
    batch.slots.forEach((slot,i)=>{gear.matrix.copy(slot.bogie.group.matrix);if(slot.wheel)gear.matrix.multiply(slot.wheel.matrix);gear.matrix.multiply(slot.local);batch.mesh.setMatrixAt(i,gear.matrix);});
    batch.mesh.instanceMatrix.needsUpdate=true;batch.mesh.boundingBox=null;batch.mesh.computeBoundingSphere();
  }
}
/** A restrained green-and-ivory touring train. Seats and canopy clearance match the walking model; the small roof overhangs
 * and buffers remain inside the surveyed railway clearance. */
export function createScenicTrainVisual(closed:boolean,index:number,wagonKind:ScenicWagonKind='touring'){
  const group=new THREE.Group(),finish=createRailwayFinishes(),materials=finish.materials,bogies:Bogie[]=[];
  group.userData.railwayFinishResources=finish;
  const cube=new THREE.BoxGeometry(1,1,1),tube=new THREE.CylinderGeometry(1,1,1,16);
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,mat:number)=>{const m=new THREE.Mesh(cube,materials[mat]);m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=true;m.receiveShadow=true;group.add(m);return m;};
  const cylinder=(radius:number,height:number,x:number,y:number,z:number,mat:number,parent:THREE.Object3D=group)=>{const m=new THREE.Mesh(tube,materials[mat]);m.position.set(x,y,z);m.scale.set(radius,height,radius);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
  const length=closed?180:SCENIC_CAR_LENGTH,bogieOffset=closed?58:72;
  box(length-2,6,96,0,-4,0,M.steel);box(length-6,2,98,0,-1,0,M.timber);
  // The wheel pockets keep the deck clear of the wheel crowns.
  for(const side of [-50.5,50.5])for(const [x,w]of [[-(length/2+bogieOffset+16)/2,length/2-bogieOffset-16],[0,2*(bogieOffset-16)],[(length/2+bogieOffset+16)/2,length/2-bogieOffset-16]])box(w,2,3,x,-1,side,M.timber);
  for(const offset of [-bogieOffset,bogieOffset]){
    const bogie=new THREE.Group();bogie.name='scenic-steering-bogie';bogie.position.x=offset;group.add(bogie);const wheels:THREE.Group[]=[];
    const frame=new THREE.Mesh(cube,materials[M.steel]);frame.scale.set(32,5,98);frame.position.y=-5.5;bogie.add(frame);
    for(const x of [-9,9])for(const side of [-53,53]){
      const pivot=new THREE.Group();pivot.name='scenic-rolling-wheel';pivot.position.set(x,0,side);bogie.add(pivot);
      const wheel=cylinder(6,5,0,0,0,M.rubber,pivot);wheel.rotation.x=Math.PI/2;
      const rim=cylinder(4.8,6.2,0,0,0,M.zinc,pivot);rim.rotation.x=Math.PI/2;
      const hub=cylinder(1.5,9,0,0,0,M.steel,pivot);hub.rotation.x=Math.PI/2;
      for(const angle of [0,Math.PI/2]){const spoke=new THREE.Mesh(cube,materials[M.steel]);spoke.scale.set(8.5,1,7.4);spoke.rotation.z=angle;pivot.add(spoke);}
      wheels.push(pivot);
    }
    for(const side of [-53,53]){box(36,2,10,offset,8,side,M.steel);box(36,10,1.5,offset,2,Math.sign(side)*58,M.paint);}
    bogies.push({group:bogie,offset,wheels});
  }
  for(const x of [-length/2+2,length/2-2]){box(4,12,86,x,1,0,M.steel);box(8,5,18,x,1,0,M.rubber);}
  if(closed){
    box(66.5,52,100,17.75,27,0,M.paint);box(68,37,104,-49,19.5,0,M.paint);box(68,62,104,-49,69,0,M.paint);
    box(138,5,108,-15,11,0,M.platform);box(148,3,108,-10,48,0,M.platform);
    // Sloped nose and low cab roof, with recessed glazing and lamp housings.
    const nose=box(32,48,98,65,28,0,M.paint);nose.rotation.z=-.14;
    const roof=box(74,6,108,-49,102,0,M.steel);roof.name='scenic-locomotive-roof';
    const glass=new THREE.MeshStandardMaterial({color:0x203b3b,metalness:.38,roughness:.17});materials.push(glass);
    for(const side of [-1,1]){
      const window=new THREE.Mesh(new THREE.BoxGeometry(48,24,1.2),glass);window.position.set(-48,81,side*52.6);group.add(window);
      box(1.4,26,2,-48,81,side*53.5,M.zinc);box(54,2,2,-48,68,side*53.5,M.platform);
      for(let x=-6;x<=43;x+=7)box(3,24,1.5,x,29,side*50.8,M.steel);
      box(130,2,2,-12,15,side*52,M.zinc);
      box(3,22,2,-76,41,side*52.5,M.zinc);box(3,22,2,-70,41,side*52.5,M.zinc);
    }
    for(const side of [-32,32]){const lamp=cylinder(5,3,87,36,side,M.steel);lamp.rotation.z=Math.PI/2;const lens=cylinder(3.8,3.5,88,36,side,M.light);lens.rotation.z=Math.PI/2;}
    const headlight=new THREE.SpotLight(0xffdfb5,80000,1800,.48,.55,2);headlight.name='scenic-headlight';headlight.position.set(92,36,0);headlight.target.position.set(900,20,0);headlight.castShadow=true;headlight.shadow.mapSize.set(512,512);headlight.shadow.camera.near=4;headlight.shadow.normalBias=.3;headlight.shadow.bias=-.0001;group.add(headlight,headlight.target);
    box(52,18,66,-44,112,0,M.steel);
    for(let x=-64;x<=-24;x+=8)box(2,2,64,x,122,0,M.zinc);
    const exhaust=cylinder(5,15,8,60,0,M.steel);exhaust.name='scenic-exhaust';
  }else if(wagonKind==='touring'){
    for(let x=-91;x<=91;x+=13)box(1,.6,Math.abs(x)>bogieOffset-16&&Math.abs(x)<bogieOffset+16?98:104,x,.3,0,M.steel);
    for(const x of [-93,93])for(const side of [-49,49]){cylinder(1.7,112,x,56,side,M.paint);cylinder(3.5,3,x,1.5,side,M.zinc);}
    const shape=new THREE.Shape();shape.moveTo(-58,109);
    for(let i=0;i<=16;i++){const side=-58+i*116/16;shape.lineTo(side,113+4*(1-(side/58)**2));}
    for(let i=16;i>=0;i--){const side=-58+i*116/16;shape.lineTo(side,109+4*(1-(side/58)**2));}shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:SCENIC_CAR_LENGTH,bevelEnabled:true,bevelSize:.4,bevelThickness:.4,bevelSegments:1});geometry.rotateY(Math.PI/2);geometry.translate(-SCENIC_CAR_LENGTH/2,0,0);
    const roof=new THREE.Mesh(geometry,materials[M.paint]);roof.castShadow=true;roof.receiveShadow=true;roof.name='scenic-carriage-canopy';group.add(roof);
    for(const side of [-58,58])box(SCENIC_CAR_LENGTH+4,2,3,0,110,side,M.zinc);
    for(const side of [-53,53]){box(130,16,2,0,9,side,M.paint);box(151,2,2,0,27,side,M.zinc);box(134,1.5,4,0,16,side,M.platform);
      for(const x of [-68,68])cylinder(1.2,27,x,13.5,side,M.paint);
    }
    for(const seat of SCENIC_SEATS){const x=seat.x,z=seat.y;
      for(const offset of [-12,12])box(3,10,14,x+offset,5,z,M.steel);box(30,2,3,x,4,z,M.steel);
      for(const side of [-6,0,6])box(35,4,5,x,11,z+side,M.timber);
      for(const up of [20,27,34])box(35,5,3,x,up,Math.sign(z)*47,M.timber);
      for(const offset of [-15,15]){box(2,32,2,x+offset,19,Math.sign(z)*48,M.paint);box(3.2,2,19.2,x+offset,21,z+Math.sign(z)*2,M.zinc);cylinder(.8,8,x+offset,17,z-Math.sign(z)*5,M.paint);}
    }
    for(const x of [-50,45]){box(18,4,26,x,105,0,M.steel);box(13,2,20,x,102,0,M.light);}
  }
  if(!closed&&wagonKind!=='touring'){
    // Clear deck, recessed plank seams, tie-down rings and open end walkways.
    for(let x=-96;x<=96;x+=16)box(.8,.5,Math.abs(x)>56&&Math.abs(x)<88?98:104,x,.25,0,M.steel);
    for(const side of [-53,53]){
      box(204,12,2,0,7,side,M.paint);box(206,2,3,0,14,side,M.zinc);
      for(const x of [-94,-32,32,94]){const ring=new THREE.Mesh(new THREE.TorusGeometry(2.5,.7,5,12),materials[M.zinc]);ring.position.set(x,5,side*1.02);group.add(ring);}
      if(wagonKind==='stake')for(const x of [-92,-46,0,46,92]){box(3,65,3,x,33,side,M.paint);box(7,8,4,x,5.6,side*1.025,M.steel);}
      if(wagonKind==='gondola'){
        box(200,32,2,0,31,side,M.paint);box(204,2,4,0,48,side,M.zinc);
        for(const x of [-92,-46,0,46,92])box(3,35,2,x,31,Math.sign(side)*55.5,M.steel);
      }
    }
    if(wagonKind==='gondola')for(const x of [-101,101])for(const side of [-37,37])box(2,42,30,x,25,side,M.paint);
  }
  if(!closed&&index===0){
    const console=box(26,30,24,78,15,0,M.paint);console.name='scenic-speed-controller';
    box(28,3,26,78,32,0,M.zinc);box(20,1,18,78,34.1,0,M.steel);
    const knob=cylinder(3.5,4,82,37,0,M.platform);knob.name='scenic-throttle';
    box(3,3,13,82,39.7,0,M.paint);
    const dial=new THREE.Mesh(new THREE.CircleGeometry(5,24),materials[M.platform]);dial.rotation.x=-Math.PI/2;dial.position.set(73,35.2,0);group.add(dial);
    box(.8,.6,5,73,35.8,-1,M.steel);
  }
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#233e35';ctx.fillRect(0,0,512,96);ctx.strokeStyle='#c3b798';ctx.lineWidth=3;ctx.strokeRect(5,5,502,86);ctx.font='600 38px Georgia';ctx.fillStyle='#eee4ca';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(closed?'GRAND TRAVERSE':`${wagonKind.toUpperCase()} · ${String(index+1).padStart(2,'0')}`,256,50);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const sign=new THREE.MeshStandardMaterial({map:texture,roughness:.72,metalness:.15});materials.push(sign);
  for(const side of [-1,1]){box(closed?64:82,closed?16:18,.4,closed?-49:0,closed?25:10,side*(closed?53.6:55.1),M.steel);const plate=new THREE.Mesh(new THREE.PlaneGeometry(closed?60:78,closed?11.25:14.6),sign);plate.position.set(closed?-49:0,closed?25:10,side*(closed?54.4:55.8));plate.rotation.y=side<0?Math.PI:0;group.add(plate);}
  // Batch repeated body fittings. Wheels remain articulated on their steering bogies.
  for(const geometry of [cube,tube])for(const material of materials){
    const parts=group.children.filter((o):o is THREE.Mesh=>o instanceof THREE.Mesh&&o.geometry===geometry&&o.material===material&&!o.name);
    if(parts.length<2)continue;
    const batch=new THREE.InstancedMesh(geometry,material,parts.length);batch.castShadow=true;batch.receiveShadow=true;batch.name='scenic-body-fittings';
    parts.forEach((m,i)=>{m.updateMatrix();batch.setMatrixAt(i,m.matrix);group.remove(m);});batch.computeBoundingSphere();group.add(batch);
  }
  group.userData.scenicBogies=bogies;
  const gear:RunningGear={batches:[],matrix:new THREE.Matrix4(),poses:bogies.flatMap(b=>[b.group,...b.wheels]).map(object=>({object,matrix:new THREE.Matrix4()})),valid:false};
  for(const [geometry,material,shadow] of [[tube,materials[M.rubber],true],[tube,materials[M.zinc],true],[tube,materials[M.steel],true],[cube,materials[M.steel],false]] as const){
    const slots:RunningGear['batches'][number]['slots']=[];
    for(const bogie of bogies){
      const parts=[...bogie.group.children.filter(o=>o instanceof THREE.Mesh),...bogie.wheels.flatMap(w=>[...w.children])];
      for(const child of parts){
        if(!(child instanceof THREE.Mesh)||child.geometry!==geometry||child.material!==material)continue;
        child.updateMatrix();slots.push({bogie,wheel:child.parent===bogie.group?undefined:child.parent as THREE.Group,local:child.matrix.clone()});child.removeFromParent();
      }
    }
    const mesh=new THREE.InstancedMesh(geometry,material,slots.length);mesh.name='scenic-articulated-running-gear';mesh.castShadow=shadow;mesh.receiveShadow=shadow;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(mesh);gear.batches.push({mesh,slots});
  }
  // These local transforms are fixed; carriage and bogie groups still animate.
  group.traverse(o=>{if(o instanceof THREE.Mesh){o.updateMatrix();o.matrixAutoUpdate=false;}});
  group.userData.scenicRunningGear=gear;updateScenicRunningGear(group);return group;
}

export function updateScenicTrainVisual(group:THREE.Group,vehicle:FriendsVehicle){
  const route=scenicRailway(),distance=vehicle.routeDistance??0,previous=group.userData.scenicPreviousDistance as number|undefined;
  let movement=previous===undefined?0:distance-previous;if(movement>route.length/2)movement-=route.length;if(movement<-route.length/2)movement+=route.length;
  const phase=(group.userData.scenicWheelPhase||0)+(Math.abs(movement)<512?movement:0)/6;group.userData.scenicWheelPhase=phase%(Math.PI*2);group.userData.scenicPreviousDistance=distance;
  group.updateWorldMatrix(true,false);group.userData.railwayFinishResources.frame.copy(group.matrixWorld).invert();
  const inverse=group.quaternion.clone().invert();
  for(const bogie of group.userData.scenicBogies as Bogie[]){
    const p=sampleRailAlignment(route,distance+bogie.offset),local=vehicleLocalPoint(vehicle,{x:p.x,y:p.y,z:p.z+14});bogie.group.position.set(local.x,local.z,local.y);
    const pose=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,-p.angle,p.pitch,'YXZ'));bogie.group.quaternion.copy(inverse).multiply(pose);
    for(const wheel of bogie.wheels)wheel.rotation.z=-phase;
  }
  updateScenicRunningGear(group);
}
