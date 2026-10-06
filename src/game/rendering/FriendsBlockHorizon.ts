import * as THREE from 'three';
import type { HorizonMeshData } from '../world/FriendsHorizonMesh';
import { meshBlockHorizon } from '../world/FriendsHorizonMesh';
import { FRONTIER_SIZE, FriendsTerrain, TERRAIN_GENERATION, type TerrainGrade } from '../world/FriendsTerrain';

export class FriendsBlockHorizon extends THREE.Group {
  private worker?:Worker;
  private disposed=false;
  private queue:HorizonMeshData[]=[];
  private fallback:number[][]=[];
  private installed=new Set<string>();
  private gradeStamp='[]';
  private terrain?:FriendsTerrain;
  private focus={x:0,y:0};
  constructor(private material:THREE.Material,x:number,y:number){
    super();this.focus={x,y};this.name='frontier-persistent-block-horizon';
    try{this.worker=new Worker(new URL('./friendsHorizon.worker.ts',import.meta.url),{type:'module'});this.worker.onmessage=e=>{if(!this.disposed)this.queue.push(e.data);};this.worker.onerror=()=>{this.worker?.terminate();this.worker=undefined;this.startFallback(x,y);};this.worker.postMessage({x,y});}
    catch{this.startFallback(x,y);}
  }
  setGrades(grades: TerrainGrade[] = []) {
    const stamp=JSON.stringify(grades);if(stamp===this.gradeStamp)return;this.gradeStamp=stamp;
    this.terrain=new FriendsTerrain({revision:0,generation:TERRAIN_GENERATION,grades,edits:[]});
    this.worker?.terminate();this.queue=[];this.fallback=[];this.installed.clear();
    for(const child of [...this.children]){if(child instanceof THREE.Mesh)child.geometry.dispose();this.remove(child);}
    try {this.worker=new Worker(new URL('./friendsHorizon.worker.ts',import.meta.url),{type:'module'});this.worker.onmessage=e=>{if(!this.disposed)this.queue.push(e.data);};this.worker.onerror=()=>{this.worker?.terminate();this.worker=undefined;this.startFallback(this.focus.x,this.focus.y);};this.worker.postMessage({...this.focus,grades});}
    catch {this.worker=undefined;this.startFallback(this.focus.x,this.focus.y);}
  }
  private startFallback(x:number,y:number){
    for(let a=0;a<FRONTIER_SIZE;a+=4096)for(let b=0;b<FRONTIER_SIZE;b+=4096)this.fallback.push([a,b]);
    this.fallback.sort((a,b)=>Math.hypot(a[0]-x,a[1]-y)-Math.hypot(b[0]-x,b[1]-y));
  }
  update(){
    if(this.fallback.length&&!this.queue.length){const [x,y]=this.fallback.shift()!;this.queue.push(meshBlockHorizon(x,y,4096,this.terrain?(x,y)=>this.terrain!.surfaceHeight(x,y):undefined));}
    for(let i=0;i<4&&this.queue.length;i++){
      const data=this.queue.shift()!,key=`${data.tx},${data.ty}`;if(this.installed.has(key))continue;this.installed.add(key);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(data.positions,3));g.setAttribute('normal',new THREE.BufferAttribute(data.normals,3,true));g.setAttribute('uv',new THREE.BufferAttribute(data.uv,2));g.setAttribute('color',new THREE.BufferAttribute(data.colors,3,true));g.setIndex(new THREE.BufferAttribute(data.indices,1));g.computeBoundingSphere();
      const mesh=new THREE.Mesh(g,this.material);mesh.position.set(data.tx,0,data.ty);mesh.receiveShadow=true;this.add(mesh);
    }
  }
  dispose(){this.disposed=true;this.worker?.terminate();this.queue=[];this.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});this.removeFromParent();}
}
