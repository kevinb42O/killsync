import * as THREE from 'three';
import type { HorizonMeshData } from '../world/FriendsHorizonMesh';
import { meshOrganicHorizon } from '../world/FriendsHorizonMesh';
import { FRONTIER_SIZE, FriendsTerrain, TERRAIN_GENERATION, type TerrainGrade } from '../world/FriendsTerrain';

export class FriendsBlockHorizon extends THREE.Group {
  private worker?:Worker;
  private disposed=false;
  private queue:HorizonMeshData[]=[];
  private fallback:number[][]=[];
  private installed=new Set<string>();
  private exteriorPending=new Set<string>();
  private exterior=new Map<string,THREE.Mesh>();
  private exteriorStamp='';
  private gradeStamp='[]';
  private terrain?:FriendsTerrain;
  private focus={x:0,y:0};
  constructor(private material:THREE.Material,x:number,y:number){
    super();this.focus={x,y};this.name='frontier-persistent-block-horizon';
    try{this.worker=new Worker(new URL('./friendsHorizon.worker.ts',import.meta.url),{type:'module'});this.worker.onmessage=e=>{this.exteriorPending.delete(`${e.data.tx},${e.data.ty}`);if(!this.disposed)this.queue.push(e.data);};this.worker.onerror=()=>{this.worker?.terminate();this.worker=undefined;this.startFallback(x,y);};this.worker.postMessage({x,y});}
    catch{this.startFallback(x,y);}
  }
  setGrades(grades: TerrainGrade[] = []) {
    const stamp=JSON.stringify(grades);if(stamp===this.gradeStamp)return;this.gradeStamp=stamp;
    this.terrain=new FriendsTerrain({revision:0,generation:TERRAIN_GENERATION,grades,edits:[]});
    this.worker?.terminate();this.queue=[];this.fallback=[];this.installed.clear();this.exteriorPending.clear();this.exterior.clear();this.exteriorStamp='';
    for(const child of [...this.children]){if(child instanceof THREE.Mesh)child.geometry.dispose();this.remove(child);}
    try {this.worker=new Worker(new URL('./friendsHorizon.worker.ts',import.meta.url),{type:'module'});this.worker.onmessage=e=>{this.exteriorPending.delete(`${e.data.tx},${e.data.ty}`);if(!this.disposed)this.queue.push(e.data);};this.worker.onerror=()=>{this.worker?.terminate();this.worker=undefined;this.startFallback(this.focus.x,this.focus.y);};this.worker.postMessage({...this.focus,grades});}
    catch {this.worker=undefined;this.startFallback(this.focus.x,this.focus.y);}
  }
  private startFallback(x:number,y:number){
    this.exteriorPending.clear();this.exteriorStamp='';
    for(let a=0;a<FRONTIER_SIZE;a+=4096)for(let b=0;b<FRONTIER_SIZE;b+=4096)this.fallback.push([a,b]);
    this.fallback.sort((a,b)=>Math.hypot(a[0]-x,a[1]-y)-Math.hypot(b[0]-x,b[1]-y));
  }
  update(x=this.focus.x,y=this.focus.y){
    this.focus={x,y};
    const tx=Math.floor(x/4096),ty=Math.floor(y/4096),stamp=`${tx},${ty}`;
    if(stamp!==this.exteriorStamp){
      this.exteriorStamp=stamp;
      // Keep a bounded horizon around exploration outside the original island.
      const wanted:number[][]=[];
      for(let a=tx-3;a<=tx+3;a++)for(let b=ty-3;b<=ty+3;b++){
        if(a>=0&&b>=0&&a*4096<FRONTIER_SIZE&&b*4096<FRONTIER_SIZE)continue;
        wanted.push([a*4096,b*4096]);
      }
      wanted.sort((a,b)=>Math.hypot(a[0]+2048-x,a[1]+2048-y)-Math.hypot(b[0]+2048-x,b[1]+2048-y));
      // Fallback also consumes exterior work incrementally.
      this.fallback=this.fallback.filter(([a,b])=>{const keep=a>=0&&b>=0&&a<FRONTIER_SIZE&&b<FRONTIER_SIZE;if(!keep)this.exteriorPending.delete(`${a},${b}`);return keep;});
      for(const [a,b]of wanted){const key=`${a},${b}`;if(this.installed.has(key)||this.exteriorPending.has(key))continue;
        this.exteriorPending.add(key);
        if(this.worker)this.worker.postMessage({x:a,y:b,grades:JSON.parse(this.gradeStamp),tileOnly:true});
        else this.fallback.push([a,b]);
      }
      for(const [key,mesh]of this.exterior)if(Math.abs(mesh.position.x/4096-tx)>4||Math.abs(mesh.position.z/4096-ty)>4){
        mesh.geometry.dispose();mesh.removeFromParent();this.exterior.delete(key);this.installed.delete(key);
      }
    }

    if(this.fallback.length&&!this.queue.length){const [x,y]=this.fallback.shift()!;this.exteriorPending.delete(`${x},${y}`);this.queue.push(meshOrganicHorizon(x,y,4096,this.terrain?(x,y)=>this.terrain!.surfaceHeight(x,y):undefined));}
    for(let i=0;i<4&&this.queue.length;i++){
      const data=this.queue.shift()!;
      const outside=data.tx<0||data.ty<0||data.tx>=FRONTIER_SIZE||data.ty>=FRONTIER_SIZE;
      if(outside&&(Math.abs(data.tx/4096-tx)>4||Math.abs(data.ty/4096-ty)>4))continue;
      const key=`${data.tx},${data.ty}`;if(this.installed.has(key))continue;this.installed.add(key);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(data.positions,3));g.setAttribute('normal',new THREE.BufferAttribute(data.normals,3,true));g.setAttribute('uv',new THREE.BufferAttribute(data.uv,2));g.setAttribute('color',new THREE.BufferAttribute(data.colors,3,true));g.setIndex(new THREE.BufferAttribute(data.indices,1));g.computeBoundingSphere();
      const mesh=new THREE.Mesh(g,this.material);mesh.position.set(data.tx,0,data.ty);mesh.receiveShadow=true;this.add(mesh);if(outside)this.exterior.set(key,mesh);
    }
  }
  hasTerrainAt(x:number,y:number){return this.installed.has(`${Math.floor(x/4096)*4096},${Math.floor(y/4096)*4096}`);}
  dispose(){this.disposed=true;this.worker?.terminate();this.queue=[];this.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});this.removeFromParent();}
}
