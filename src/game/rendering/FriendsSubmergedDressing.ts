import * as THREE from 'three';
import type { FriendsTerrain } from '../world/FriendsTerrain';
import { friendsWaterAt, friendsWaterGround } from '../world/FriendsWaterSurface';
import { ISLAND_LAKES } from '../world/FriendsIsland';

const CELL=112,RADIUS=5,SLOTS=121;
const hash=(x:number,z:number,s:number)=>{const n=Math.sin(x*127.1+z*311.7+s*74.7)*43758.5453;return n-Math.floor(n);};
/** Cosmetic only: fixed instance buffers, deterministic rolling tiles and bounded
 * placement work. Constructed lazily by the swimming/diving presentation gate. */
export class FriendsSubmergedDressing {
 readonly root=new THREE.Group();
 readonly rocks:THREE.InstancedMesh;readonly plants:THREE.InstancedMesh;readonly timber:THREE.InstancedMesh;
 private time={value:0};private matrix=new THREE.Matrix4();private pose=new THREE.Object3D();private colour=new THREE.Color();
 private tiles=new Map<string,number>();private pending:{x:number;z:number;key:string}[]=[];private free=Array.from({length:SLOTS},(_,i)=>i);
 private band=Infinity;private region='';private body='';private epoch=-1;
 readonly stats={placedTiles:0,sampledTiles:0};
 constructor(scene:THREE.Scene){
  this.root.name='submerged-bed-dressing';this.root.visible=false;scene.add(this.root);
  const rock=new THREE.IcosahedronGeometry(1,1),p=rock.getAttribute('position');
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),r=1+.11*Math.sin(x*9+z*7+y*11);p.setXYZ(i,x*r,y*r,z*r);}rock.computeVertexNormals();
  const plant=new THREE.BufferGeometry(),vertices:number[]=[],indices:number[]=[];
  // Four tapered, curled ribbons per tuft, with a substantial silhouette from any view.
  for(let leaf=0;leaf<4;leaf++){const start=vertices.length/3,a=leaf*2.399;
   for(let j=0;j<=5;j++){const t=j/5,width=(1-t*.93)*.075,bend=Math.sin(t*1.9)*.25,height=t*(.72+leaf*.09);
    for(const side of [-1,1])vertices.push(Math.cos(a)*bend-Math.sin(a)*width*side,height,Math.sin(a)*bend+Math.cos(a)*width*side);
   }
   for(let j=0;j<5;j++){const k=start+j*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}
  }
  plant.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));plant.setIndex(indices);plant.computeVertexNormals();
  const wood=new THREE.CylinderGeometry(.7,1,1,7,1);wood.rotateZ(Math.PI/2);
  const make=(geometry:THREE.BufferGeometry,count:number,vegetation=false,base=.35)=>{
   const material=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:1,side:vegetation?THREE.DoubleSide:THREE.FrontSide});
   material.onBeforeCompile=shader=>{shader.uniforms.bedTime=this.time;
    shader.vertexShader='uniform float bedTime;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
     ${vegetation?'float stem=max(0.,position.y);float phase=instanceMatrix[3].x*.031+instanceMatrix[3].z*.047;transformed.x+=sin(bedTime*.8+phase+stem*2.)*stem*stem*.12;transformed.z+=cos(bedTime*.6+phase)*stem*stem*.075;':''}
     float bedDistance=length((modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xz-cameraPosition.xz);
     float bedGrowth=1.-smoothstep(470.,650.,bedDistance);
     transformed.xz*=bedGrowth;
     transformed.y=(transformed.y+${base.toFixed(2)})*bedGrowth-${base.toFixed(2)};`);

   };
   material.customProgramCacheKey=()=>`submerged-bed-v2-${vegetation}-${base}`;
   const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
   this.matrix.makeScale(0,0,0);for(let i=0;i<count;i++){mesh.setMatrixAt(i,this.matrix);mesh.setColorAt(i,new THREE.Color(1,1,1));}
   this.root.add(mesh);return mesh;
  };
  this.rocks=make(rock,SLOTS*3);this.plants=make(plant,SLOTS*4,true,0);this.timber=make(wood,SLOTS,false,1);
 }
 hide(){this.root.visible=false;}
 private clear(slot:number){this.matrix.makeScale(0,0,0);for(const [mesh,n]of [[this.rocks,3],[this.plants,4],[this.timber,1]] as const)for(let i=0;i<n;i++)mesh.setMatrixAt(slot*n+i,this.matrix);}
 private put(mesh:THREE.InstancedMesh,index:number,x:number,y:number,z:number,sx:number,sy:number,sz:number,rotation:number,tint:string,shade:number){
  this.pose.position.set(x,y,z);this.pose.rotation.set(0,rotation,mesh===this.timber?.12:0);this.pose.scale.set(sx,sy,sz);this.pose.updateMatrix();mesh.setMatrixAt(index,this.pose.matrix);this.colour.set(tint).multiplyScalar(shade);mesh.setColorAt(index,this.colour);
 }
 update(camera:THREE.Camera,elapsed:number,terrain:FriendsTerrain,body:string){
  if(body!=='sea'&&!ISLAND_LAKES.some(l=>l.id===body)){this.hide();return;}
  this.root.visible=true;this.time.value=elapsed/1000;let dirty=false;
  const cx=Math.floor(camera.position.x/CELL),cz=Math.floor(camera.position.z/CELL),region=`${cx},${cz}`;
  if(this.body!==body||this.epoch!==terrain.waterEpoch||this.band!==Math.floor(camera.position.y/256)){this.band=Math.floor(camera.position.y/256);dirty=true;for(const slot of this.tiles.values())this.clear(slot);this.tiles.clear();this.free=Array.from({length:SLOTS},(_,i)=>i);this.region='';this.body=body;this.epoch=terrain.waterEpoch;}
  if(region!==this.region){dirty=true;this.region=region;const desired=new Set<string>();this.pending=[];
   for(let x=cx-RADIUS;x<=cx+RADIUS;x++)for(let z=cz-RADIUS;z<=cz+RADIUS;z++){const key=`${x},${z}`;desired.add(key);if(!this.tiles.has(key))this.pending.push({x,z,key});}
   for(const [key,slot]of this.tiles)if(!desired.has(key)){this.clear(slot);this.free.push(slot);this.tiles.delete(key);}
   this.pending.sort((a,b)=>(a.x-cx)**2+(a.z-cz)**2-(b.x-cx)**2-(b.z-cz)**2);
  }
  // At most twelve candidate tiles per wet frame; no terrain queries on land.
  const started=performance.now();
  for(let i=0;i<12&&this.pending.length&&(i===0||performance.now()-started<1.5);i++){
   dirty=true;const tile=this.pending.shift()!,slot=this.free.pop()!;this.tiles.set(tile.key,slot);this.stats.sampledTiles++;
   const x=(tile.x+.18+hash(tile.x,tile.z,1)*.64)*CELL,z=(tile.z+.18+hash(tile.x,tile.z,2)*.64)*CELL;
   const water=friendsWaterAt(x,z);if(water?.bodyId!==body||water.depth<40)continue;
   const natural=friendsWaterGround(x,z),floor=terrain.floor(x,z,water.level,0);
   // Omit roofs, excavations and beds beyond local visibility: dressing never occupies a dynamic flood tunnel.
   if(floor===undefined||Math.abs(floor-natural)>33||water.level-floor<38||Math.abs(camera.position.y-floor)>1050)continue;
   this.stats.placedTiles++;
   const patch=(Math.sin(tile.x*.63+Math.cos(tile.z*.41)) + Math.cos(tile.z*.71-tile.x*.23))*.5;
   const rockPatch=patch>.05,sea=body==='sea';
   if(rockPatch)for(let j=0;j<3;j++){
    const wx=x+(hash(tile.x,tile.z,10+j)-.5)*50,wz=z+(hash(tile.x,tile.z,20+j)-.5)*50;
    const bed=terrain.floor(wx,wz,water.level,0),wet=friendsWaterAt(wx,wz);if(bed===undefined||wet?.bodyId!==body||Math.abs(bed-friendsWaterGround(wx,wz))>33)continue;
    const size=j===0?18+hash(tile.x,tile.z,30)*25:5+hash(tile.x,tile.z,30+j)*11,sy=size*(.48+hash(tile.x,tile.z,40+j)*.3);
    if(bed+sy*1.65>water.level-12)continue;
    this.put(this.rocks,slot*3+j,wx,bed+sy*.35,wz,size,sy,size*(.85+hash(tile.x,tile.z,50+j)*.55),hash(tile.x,tile.z,60+j)*6.28,sea?'#96a5aa':'#9ba88e',.7+hash(tile.x,tile.z,70+j)*.35);
   }
   if(patch<.65&&water.depth<820)for(let j=0;j<4;j++){
    const wx=x+(hash(tile.x,tile.z,80+j)-.5)*65,wz=z+(hash(tile.x,tile.z,90+j)-.5)*65,bed=terrain.floor(wx,wz,water.level,0),wet=friendsWaterAt(wx,wz);
    if(bed===undefined||wet?.bodyId!==body||Math.abs(bed-friendsWaterGround(wx,wz))>33)continue;
    const height=Math.min(water.level-bed-16,(sea?58:34)+hash(tile.x,tile.z,100+j)*(sea?60:42));if(height<18)continue;
    this.put(this.plants,slot*4+j,wx,bed-1,wz,32+hash(tile.x,tile.z,110+j)*28,height,32+hash(tile.x,tile.z,120+j)*28,hash(tile.x,tile.z,130+j)*6.28,sea?'#718c58':'#849b55',.65+hash(tile.x,tile.z,140+j)*.4);
   }
   if(rockPatch&&hash(tile.x,tile.z,160)>.945&&water.depth>100){const length=70+hash(tile.x,tile.z,161)*65;
    this.put(this.timber,slot,x,floor+6,z,length,6,6,hash(tile.x,tile.z,162)*6.28,'#a39878',.85);
   }
  }
  if(dirty)for(const mesh of [this.rocks,this.plants,this.timber]){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
 }
 dispose(){this.root.removeFromParent();for(const mesh of [this.rocks,this.plants,this.timber]){mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();mesh.dispose();}}
}
