import * as THREE from 'three';
import type { FriendsVehicle } from '../multiplayer/FriendsExpedition';
import { FRIENDS_COASTAL_PIER } from '../world/FriendsCoastalPier';
import { FRIENDS_SEASIDE_PIER, seasidePierPoint } from '../world/FriendsSeasidePier';

export const SEAGULL_LIMIT=6,SEAGULL_HEARING_RANGE=1200;
const smooth=(v:number)=>{v=THREE.MathUtils.clamp(v,0,1);return v*v*(3-2*v);};
type Anchor={x:number;y:number;z:number};
const dock=FRIENDS_COASTAL_PIER;
const PIER_ANCHORS:readonly Anchor[]=[{x:dock.x-dock.sections*dock.sectionLength,y:dock.y,z:dock.deck},
  {...seasidePierPoint(1300),z:FRIENDS_SEASIDE_PIER.deck+80},
  {...seasidePierPoint(FRIENDS_SEASIDE_PIER.length-500),z:FRIENDS_SEASIDE_PIER.deck+190}];
export function sampleSeagull(anchor:Anchor,id:number,seconds:number){
  const angle=seconds*(id%2?-.18:.16)+id*2.4,radius=140+(id%2)*80;
  return {x:anchor.x+Math.cos(angle)*radius,y:anchor.y+Math.sin(angle)*radius*.72,
    z:anchor.z+140+id%2*75+Math.sin(seconds*.43+id)*25,
    yaw:Math.atan2(Math.cos(angle)*radius*.72,-Math.sin(angle)*radius)+(id%2?Math.PI:0),bank:id%2?.16:-.16};
}
export function seagullCallVolume(distance:number,daylight:number){return daylight>.25?.32*smooth(1-distance/SEAGULL_HEARING_RANGE):0;}

/** Six faceted gulls in one opaque instanced draw. Analytic paths, GPU wings,
 * 20 Hz transforms, no textures, physics, shadows or replicated flock state. */
export class FriendsSeagulls {
  readonly mesh:THREE.InstancedMesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
  private time={value:0};
  private dummy=new THREE.Object3D();
  private underground=false;
  private boat?:FriendsVehicle;
  private boatAnchor?:Anchor;
  private lastTime=-Infinity;
  private nextPose=0;
  constructor(){
    const geometry=seagullGeometry();
    geometry.setAttribute('gullPhase',new THREE.InstancedBufferAttribute(Float32Array.from({length:SEAGULL_LIMIT},(_,i)=>i*1.71),1));
    const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95,side:THREE.DoubleSide});
    material.onBeforeCompile=shader=>{
      shader.uniforms.gullTime=this.time;
      shader.vertexShader='uniform float gullTime; attribute float gullWing; attribute float gullPhase;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        float glide=smoothstep(-.3,.35,sin(gullTime*.38+gullPhase));
        float flap=sin(gullTime*6.+gullPhase)*.5*(1.-glide);
        transformed.x*=mix(1.,cos(flap),gullWing);
        transformed.y+=abs(position.x)*sin(flap)*gullWing;
      `);
    };
    material.customProgramCacheKey=()=> 'sunline-seagulls-v1';
    this.mesh=new THREE.InstancedMesh(geometry,material,SEAGULL_LIMIT);
    this.mesh.name='sunline-coastal-seagulls';this.mesh.count=0;this.mesh.visible=false;
    this.mesh.castShadow=false;this.mesh.receiveShadow=false;this.mesh.frustumCulled=false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  setVehicles(vehicles:readonly FriendsVehicle[]){this.boat=vehicles.find(v=>v.kind==='fishingBoat');}
  update(camera:THREE.Camera,seconds:number,daylight:number,underground:boolean){
    this.underground=underground;
    if(seconds<this.lastTime){this.nextPose=0;this.boatAnchor=undefined;}
    if(underground||daylight<=.25){this.mesh.visible=false;this.mesh.count=0;this.lastTime=seconds;return;}
    this.time.value=seconds;
    if(seconds<this.nextPose)return;
    const dt=Math.max(0,seconds-this.lastTime);this.lastTime=seconds;this.nextPose=seconds+.05;
    if(this.boat){
      if(!this.boatAnchor||dt>2||Math.hypot(this.boat.x-this.boatAnchor.x,this.boat.y-this.boatAnchor.y)>1800)this.boatAnchor={x:this.boat.x,y:this.boat.y,z:this.boat.z+70};
      const t=1-Math.exp(-dt*.8),a=this.boatAnchor;a.x+=(this.boat.x-a.x)*t;a.y+=(this.boat.y-a.y)*t;a.z+=(this.boat.z+70-a.z)*t;
    }else this.boatAnchor=undefined;
    const anchors=[PIER_ANCHORS[0],PIER_ANCHORS[0],PIER_ANCHORS[1],PIER_ANCHORS[2],...(this.boatAnchor?[this.boatAnchor,this.boatAnchor]:[])];
    let count=0;
    for(let a=0;a<anchors.length;a++){
      const anchor=anchors[a];if(Math.hypot(anchor.x-camera.position.x,anchor.y-camera.position.z,anchor.z-camera.position.y)>2400)continue;
      {
        const pose=sampleSeagull(anchor,a,seconds);
        const distance=Math.hypot(pose.x-camera.position.x,pose.y-camera.position.z,pose.z-camera.position.y);
        const fade=smooth((2200-distance)/400)*smooth((daylight-.25)/.2);if(fade<=0)continue;
        this.dummy.position.set(pose.x,pose.z,pose.y);this.dummy.rotation.set(0,Math.PI/2-pose.yaw,pose.bank);
        this.dummy.scale.setScalar(fade);this.dummy.updateMatrix();this.mesh.setMatrixAt(count,this.dummy.matrix);
        count++;
      }
    }
    this.mesh.count=count;this.mesh.visible=count>0;this.mesh.instanceMatrix.needsUpdate=true;
  }
  /** One recording represents the coastal flock, independent of visible bird poses.
   * Use the strongest habitat gain, never sum one copy per bird. */
  flockSound(camera:THREE.Camera,yaw:number,daylight:number){
    if(this.underground||daylight<=.25)return {volume:0,pan:0};
    const anchors=[...PIER_ANCHORS,...(this.boat?[this.boat]:[])];
    let volume=0,weight=0,dx=0,dy=0;
    for(const anchor of anchors){
      const x=anchor.x-camera.position.x,y=anchor.y-camera.position.z,z=anchor.z-camera.position.y;
      const gain=seagullCallVolume(Math.hypot(x,y,z),daylight);
      volume=Math.max(volume,gain);weight+=gain;dx+=x*gain;dy+=y*gain;
    }
    // Broad, gently directional ambience rather than a pinpoint overhead call.
    return {volume,pan:weight>0?Math.sin(Math.atan2(dy,dx)-yaw)*.25:0};
  }
  dispose(){this.mesh.removeFromParent();this.mesh.geometry.dispose();this.mesh.material.dispose();this.mesh.dispose();}
}
function seagullGeometry(){
  const positions:number[]=[],colors:number[]=[],wings:number[]=[];
  const tri=(a:number[],b:number[],c:number[],color:string,wing=0)=>{const shade=new THREE.Color(color);for(const p of [a,b,c]){positions.push(...p);colors.push(shade.r,shade.g,shade.b);wings.push(wing);}};
  const front=[0,1,7],back=[0,0,-6],top=[0,3,0],bottom=[0,-1,0];
  for(const side of [[-2,0,0],[2,0,0]]){tri(front,top,side,'#f1f2e8');tri(top,back,side,'#abb5b9');tri(front,side,bottom,'#fffdf0');tri(back,bottom,side,'#e4e8e1');}
  // White head, yellow bill and a short broad tail distinguish gulls from swallows.
  for(const s of [-1,1]){
    tri([0,1,9],[s*1.8,1,6],[0,3.5,6],'#fffdf0');
    tri([0,1,12],[s*.7,.7,8],[0,1.8,8],'#d6ad45');
    tri([s*1.55,1.7,7.3],[s*1.7,1.7,6.7],[s*1.6,2.2,7],'#273237');
    const shoulder=[s*1.7,1,3],elbow=[s*12,1.5,1],tip=[s*24,.7,-6],trailing=[s*7,.4,-5],edge=[s*18,.6,-7];
    tri(shoulder,elbow,trailing,'#c8d0d1',1);tri(elbow,edge,trailing,'#b9c3c7',1);tri(elbow,tip,edge,'#303b41',1);
    tri([0,.4,-4],[s*3.5,.3,-10],[0,.3,-10],'#f0f1e8');
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('gullWing',new THREE.Float32BufferAttribute(wings,1));g.computeVertexNormals();return g;
}
