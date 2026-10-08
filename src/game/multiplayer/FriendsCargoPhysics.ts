import { Body, Box, ConvexPolyhedron, Cylinder, GSSolver, Narrowphase, Quaternion, SAPBroadphase, Vec3, World, type ContactEquation, type FrictionEquation } from 'cannon-es';
import type { HaulingEnvironment, PhysicalCargo } from './FriendsHauling';
import { cargoRotation, cargoWorldPoint, cargoHullPoints } from './FriendsCargoPose';

const SCALE=32,GRAVITY=10;
/** Keep reduced friction contact arms in their owning body's coordinate frame.
 * cannon-es 0.20 swaps those arms when averaging same-order contacts, giving
 * a tiny skid the terrain box's huge lever arm and making pulling asymmetric. */
class CargoNarrowphase extends Narrowphase {
  private averageNormal=new Vec3();
  private averageA=new Vec3();
  private averageB=new Vec3();
  override createFrictionEquationsFromContact(contact:ContactEquation,out:FrictionEquation[]){
    const created=super.createFrictionEquationsFromContact(contact,out);
    // GSSolver clamps accumulated impulses, not forces. Convert Coulomb's
    // mu*m*g limit to an impulse for this fixed tick or 120 Hz multiplies
    // friction by 120 and effectively glues the skids to the ground.
    if(created)for(let i=out.length-2;i<out.length;i++){out[i].minForce*=this.world.dt;out[i].maxForce*=this.world.dt;}
    return created;
  }
  override createFrictionFromAverage(count:number){
    const last=this.result[this.result.length-1];
    if(!this.createFrictionEquationsFromContact(last,this.frictionResult)||count===1)return;
    const a=this.frictionResult[this.frictionResult.length-2],b=this.frictionResult[this.frictionResult.length-1];
    this.averageNormal.setZero();this.averageA.setZero();this.averageB.setZero();
    for(let i=0;i<count;i++){
      const contact=this.result[this.result.length-1-i],same=contact.bi===last.bi;
      this.averageNormal.addScaledVector(same?1:-1,contact.ni,this.averageNormal);
      this.averageA.vadd(same?contact.ri:contact.rj,this.averageA);
      this.averageB.vadd(same?contact.rj:contact.ri,this.averageB);
    }
    this.averageA.scale(1/count,a.ri);this.averageB.scale(1/count,a.rj);
    b.ri.copy(a.ri);b.rj.copy(a.rj);this.averageNormal.normalize();this.averageNormal.tangents(a.t,b.t);
  }
}
export type CargoPhysicsRegion={minX:number;maxX:number;minY:number;maxY:number;minZ:number;maxZ:number};
export type CargoStaticCollider={x:number;y:number;z:number;w:number;d:number;h:number;angle?:number;kind?:'box'|'ramp'|'cylinder'|'hull';vertices?:{x:number;y:number;z:number}[]};

/** Merge the actual local solid field, including mined caves, into seam-free boxes. */
export function cargoTerrainColliders(region:CargoPhysicsRegion,solid:(x:number,y:number,z:number)=>boolean) {
  const nx=(region.maxX-region.minX)/32,ny=(region.maxY-region.minY)/32,nz=(region.maxZ-region.minZ)/32;
  const occupied=new Uint8Array(nx*ny*nz),index=(x:number,y:number,z:number)=>(z*ny+y)*nx+x;
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)occupied[index(x,y,z)]=Number(solid(region.minX/32+x,region.minY/32+y,region.minZ/32+z));
  const boxes:CargoStaticCollider[]=[];
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    if(!occupied[index(x,y,z)])continue;
    let w=1,d=1,h=1;while(x+w<nx&&occupied[index(x+w,y,z)])w++;
    const row=(yy:number,zz:number)=>{for(let xx=x;xx<x+w;xx++)if(!occupied[index(xx,yy,zz)])return false;return true;};
    while(y+d<ny&&row(y+d,z))d++;
    const layer=(zz:number)=>{for(let yy=y;yy<y+d;yy++)if(!row(yy,zz))return false;return true;};
    while(z+h<nz&&layer(z+h))h++;
    for(let zz=z;zz<z+h;zz++)for(let yy=y;yy<y+d;yy++)for(let xx=x;xx<x+w;xx++)occupied[index(xx,yy,zz)]=0;
    boxes.push({x:region.minX+(x+w/2)*32,y:region.minY+(y+d/2)*32,z:region.minZ+z*32,w:w*32,d:d*32,h:h*32});
  }
  return boxes;
}
function skidHull(){
  const vertices=cargoHullPoints().map(p=>new Vec3(p.x/SCALE,p.y/SCALE,(p.z-24)/SCALE));
  const faces=[[3,2,1,0],[8,9,10,11]];
  for(let i=0;i<4;i++){const j=(i+1)%4;faces.push([i,j,j+4,i+4],[i+4,j+4,j+8,i+8]);}
  return new ConvexPolyhedron({vertices,faces});
}
function colliderBody(c:CargoStaticCollider){
  const body=new Body({type:Body.STATIC,position:new Vec3(c.x/SCALE,c.y/SCALE,c.z/SCALE)});body.quaternion.setFromEuler(0,0,c.angle??0);
  if(c.kind==='hull'&&c.vertices){
    body.addShape(new ConvexPolyhedron({vertices:c.vertices.map(p=>new Vec3(p.x/SCALE,p.y/SCALE,p.z/SCALE)),faces:[[3,2,1,0],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]}));
  }else if(c.kind==='ramp'){
    const w=c.w/2/SCALE,d=c.d/2/SCALE,h=c.h/SCALE;
    body.addShape(new ConvexPolyhedron({vertices:[new Vec3(-w,-d,0),new Vec3(w,-d,0),new Vec3(w,d,0),new Vec3(-w,d,0),new Vec3(w,-d,h),new Vec3(w,d,h)],faces:[[3,2,1,0],[0,1,4],[1,2,5,4],[2,3,5],[0,4,5,3]]}));
  }else if(c.kind==='cylinder')body.addShape(new Cylinder(c.w/2/SCALE,c.w/2/SCALE,c.h/SCALE,12),new Vec3(0,0,c.h/2/SCALE),new Quaternion().setFromEuler(Math.PI/2,0,0));
  else body.addShape(new Box(new Vec3(c.w/2/SCALE,c.d/2/SCALE,c.h/2/SCALE)),new Vec3(0,0,c.h/2/SCALE));
  return body;
}
function floorColliders(region:CargoPhysicsRegion,env:HaulingEnvironment){
  const floors=new Map<string,number>(),boxes:CargoStaticCollider[]=[];
  for(let x=region.minX;x<region.maxX;x+=32)for(let y=region.minY;y<region.maxY;y+=32){
    const f=env.floor(x+16,y+16,region.maxZ,0);if(f!==undefined&&f>region.minZ)floors.set(`${x}:${y}`,Math.min(region.maxZ,f));
  }
  for(let y=region.minY;y<region.maxY;y+=32)for(let x=region.minX;x<region.maxX;x+=32){
    const f=floors.get(`${x}:${y}`);if(f===undefined)continue;
    let w=32,d=32;while(x+w<region.maxX&&floors.get(`${x+w}:${y}`)===f)w+=32;
    const row=(yy:number)=>{for(let xx=x;xx<x+w;xx+=32)if(floors.get(`${xx}:${yy}`)!==f)return false;return true;};
    while(y+d<region.maxY&&row(y+d))d+=32;
    for(let yy=y;yy<y+d;yy+=32)for(let xx=x;xx<x+w;xx+=32)floors.delete(`${xx}:${yy}`);
    boxes.push({x:x+w/2,y:y+d/2,z:region.minZ,w,d,h:f-region.minZ});
  }
  return boxes;
}

/** One tiny physics island, stepped by the host clock, with no render-time simulation. */
export class FriendsCargoPhysics {
  readonly world=new World({gravity:new Vec3(0,0,-GRAVITY),allowSleep:true});
  readonly body=new Body({mass:8,shape:skidHull(),linearDamping:.45,angularDamping:.65,sleepSpeedLimit:.045,sleepTimeLimit:.65});
  private terrain:Body[]=[];
  private vehicles:Body[]=[];
  private otherLoads:Body[]=[];
  private terrainKey='';
  private region?:CargoPhysicsRegion;
  constructor(){
    this.world.broadphase=new SAPBroadphase(this.world);(this.world.solver as GSSolver).iterations=16;
    this.world.narrowphase=new CargoNarrowphase(this.world);
    this.world.narrowphase.enableFrictionReduction=true;this.world.defaultContactMaterial.friction=.12;this.world.defaultContactMaterial.restitution=.04;
    this.world.defaultContactMaterial.contactEquationStiffness=1e8;this.world.defaultContactMaterial.contactEquationRelaxation=4;
    this.world.addBody(this.body);
  }
  sync(c:PhysicalCargo){
    const centre=cargoWorldPoint(c,{x:0,y:0,z:24}),q=cargoRotation(c);
    const moved=this.body.position.distanceTo(new Vec3(centre.x/SCALE,centre.y/SCALE,centre.z/SCALE))>.003;
    const changedRotation=Math.abs(this.body.quaternion.x*q.x+this.body.quaternion.y*q.y+this.body.quaternion.z*q.z+this.body.quaternion.w*q.w)<.99999;
    this.body.position.set(centre.x/SCALE,centre.y/SCALE,centre.z/SCALE);this.body.quaternion.set(q.x,q.y,q.z,q.w);
    this.body.velocity.set(c.vx/SCALE,c.vy/SCALE,c.vz/SCALE);this.body.angularVelocity.set(c.angularVelocityX??0,c.angularVelocityY??0,c.spin);
    this.body.aabbNeedsUpdate=true;if(moved||changedRotation)this.body.wakeUp();
  }
  prepare(c:PhysicalCargo,env:HaulingEnvironment,cargo:readonly PhysicalCargo[]=[]){
    this.sync(c);
    const x=Math.floor(c.x/128)*128,y=Math.floor(c.y/128)*128,z=Math.floor(c.z/128)*128,key=`${env.revision}:${x}:${y}:${z}`;
    if(key!==this.terrainKey){
      this.terrainKey=key;this.body.wakeUp();this.region={minX:x-128,maxX:x+256,minY:y-128,maxY:y+256,minZ:z-128,maxZ:z+256};
      for(const body of this.terrain)this.world.removeBody(body);
      const region=this.region;
      const boxes=env.solid?cargoTerrainColliders(region,env.solid):floorColliders(region,env);
      this.terrain=[...boxes,...(env.colliders?.(region)??[])].map(colliderBody);for(const body of this.terrain)this.world.addBody(body);
    }
    for(const body of this.otherLoads)this.world.removeBody(body);this.otherLoads=[];
    for(const other of cargo){
      if(other.id===c.id||Math.hypot(other.x-c.x,other.y-c.y,other.z-c.z)>256)continue;
      const p=cargoWorldPoint(other,{x:0,y:0,z:24}),q=cargoRotation(other);
      const body=new Body({type:Body.STATIC,shape:skidHull(),position:new Vec3(p.x/SCALE,p.y/SCALE,p.z/SCALE)});
      body.quaternion.set(q.x,q.y,q.z,q.w);this.world.addBody(body);this.otherLoads.push(body);
    }
    for(const body of this.vehicles)this.world.removeBody(body);this.vehicles=[];
    for(const v of env.vehicles){
      if(Math.hypot(v.x-c.x,v.y-c.y)>400)continue;
      const parts:CargoStaticCollider[]=v.closed?[{x:v.x,y:v.y,z:v.z-14,w:v.length,d:v.width,h:128,angle:v.angle}]:[
        {x:v.x,y:v.y,z:v.z-6,w:v.length,d:v.width,h:6,angle:v.angle},
        {x:v.x,y:v.y,z:v.z+(v.kind==='train'?109:101),w:v.length,d:v.width,h:6,angle:v.angle},
      ];
      for(const part of parts){const body=colliderBody(part);this.vehicles.push(body);this.world.addBody(body);}
    }
  }
  setTowing(active:boolean){this.body.linearDamping=active?.75:.45;this.body.angularDamping=active?.8:.65;}
  applyPull(force:{x:number;y:number;z:number},anchor:{x:number;y:number;z:number}){
    if(Math.hypot(force.x,force.y,force.z)<.01)return;
    this.body.wakeUp();this.body.applyForce(new Vec3(force.x/SCALE,force.y/SCALE,force.z/SCALE),new Vec3(anchor.x/SCALE-this.body.position.x,anchor.y/SCALE-this.body.position.y,anchor.z/SCALE-this.body.position.z));
  }
  anchorVelocity(anchor:{x:number;y:number;z:number}){
    const v=this.body.getVelocityAtWorldPoint(new Vec3(anchor.x/SCALE,anchor.y/SCALE,anchor.z/SCALE),new Vec3());return {x:v.x*SCALE,y:v.y*SCALE,z:v.z*SCALE};
  }
  step(seconds:number,c:PhysicalCargo){
    if(seconds<=0)return;
    this.limitVelocity();
    this.world.step(seconds);
    // Contact resolution can generate a large impulse during this very step,
    // especially when edited terrain or a transport hull overlaps the load.
    // Clamp before publishing it, not just before the next simulation step.
    this.limitVelocity();
    this.read(c);
  }
  private limitVelocity(){
    const speed=this.body.velocity.length();if(speed>16)this.body.velocity.scale(16/speed,this.body.velocity);
    const spin=this.body.angularVelocity.length();if(spin>3)this.body.angularVelocity.scale(3/spin,this.body.angularVelocity);
  }
  private read(c:PhysicalCargo){
    const b=this.body,q=b.quaternion,offset=q.vmult(new Vec3(0,0,24/SCALE));
    c.x=(b.position.x-offset.x)*SCALE;c.y=(b.position.y-offset.y)*SCALE;c.z=(b.position.z-offset.z)*SCALE;
    c.vx=b.sleepState===Body.SLEEPING?0:b.velocity.x*SCALE;c.vy=b.sleepState===Body.SLEEPING?0:b.velocity.y*SCALE;c.vz=b.sleepState===Body.SLEEPING?0:b.velocity.z*SCALE;
    c.angularVelocityX=b.sleepState===Body.SLEEPING?0:b.angularVelocity.x;c.angularVelocityY=b.sleepState===Body.SLEEPING?0:b.angularVelocity.y;c.spin=b.sleepState===Body.SLEEPING?0:b.angularVelocity.z;
    c.orientation=[q.x,q.y,q.z,q.w];const forward=q.vmult(new Vec3(1,0,0));if(Math.hypot(forward.x,forward.y)>.001)c.angle=Math.atan2(forward.y,forward.x);
  }
}
