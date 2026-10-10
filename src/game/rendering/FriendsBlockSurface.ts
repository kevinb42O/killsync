import * as THREE from 'three';
import { meshBlockHorizon, type HorizonMeshData } from '../world/FriendsHorizonMesh';
import { FriendsTerrain, TERRAIN_GENERATION, type TerrainGrade } from '../world/FriendsTerrain';
import { BLOCK_CACHE_BYTES, BLOCK_CACHE_TILES, BLOCK_DETAIL_END, BLOCK_RETAIN, BLOCK_SURFACE_TILE, distanceToTerrainTile, surfaceTilesAround } from './FriendsTerrainStreaming';
import { createTerrainShadowMaterials } from './FriendsTerrainCoverage';

/** Greedy exterior shells have no allocated underground voxel volume. Two
 * bounded worker jobs and two uploads per frame keep streaming responsive. */
export class FriendsBlockSurface extends THREE.Group {
  private worker?:Worker;
  private epoch=0;
  private disposed=false;
  private pending=new Set<string>();
  private queue:{mesh:HorizonMeshData;epoch:number}[]=[];
  private tiles=new Map<string,{mesh:THREE.Mesh;bytes:number;installed:number}>();
  private gradeStamp='[]';
  private terrain?:FriendsTerrain;
  private bytes=0;
  private wants=new Set<string>();
  private planStamp='';
  private wanted:ReturnType<typeof surfaceTilesAround>=[];
  constructor(private material:THREE.Material,private ready:Uint8Array,private coverage:THREE.DataTexture,private grid:number,private shadows?:ReturnType<typeof createTerrainShadowMaterials>){super();this.name='frontier-block-surface-shells';this.startWorker();}
  private startWorker(){
    try{
      this.worker=new Worker(new URL('./friendsSurface.worker.ts',import.meta.url),{type:'module'});
      this.worker.onmessage=(event:MessageEvent<{mesh:HorizonMeshData;epoch:number}>)=>{
        const {mesh,epoch}=event.data;this.pending.delete(`${mesh.tx},${mesh.ty}:${epoch}`);
        if(!this.disposed&&epoch===this.epoch&&this.wants.has(`${mesh.tx},${mesh.ty}`))this.queue.push({mesh,epoch});
      };
      this.worker.onerror=()=>{this.worker?.terminate();this.worker=undefined;this.pending.clear();};
      this.worker.postMessage({grades:JSON.parse(this.gradeStamp),epoch:this.epoch});
    }catch{this.worker=undefined;}
  }
  setGrades(grades:TerrainGrade[]=[]){
    const stamp=JSON.stringify(grades);if(stamp===this.gradeStamp)return;this.gradeStamp=stamp;this.epoch++;
    this.worker?.terminate();this.pending.clear();this.queue=[];
    for(const key of [...this.tiles.keys()])this.release(key);
    this.terrain=grades.length?new FriendsTerrain({generation:TERRAIN_GENERATION,revision:0,edits:[],grades}):undefined;
    this.startWorker();
  }
  private mask(tx:number,ty:number,value:number){
    for(let x=tx/512;x<Math.min(this.grid,(tx+BLOCK_SURFACE_TILE)/512);x++)for(let y=ty/512;y<Math.min(this.grid,(ty+BLOCK_SURFACE_TILE)/512);y++){
      const index=y*this.grid+x;if(this.ready[index]!==value){this.ready[index]=value;this.coverage.needsUpdate=true;}
    }
  }
  private release(key:string){
    const tile=this.tiles.get(key);if(!tile)return;this.mask(tile.mesh.position.x,tile.mesh.position.z,0);
    this.bytes-=tile.bytes;tile.mesh.geometry.dispose();tile.mesh.removeFromParent();this.tiles.delete(key);
  }
  private install(data:HorizonMeshData,time:number){
    const key=`${data.tx},${data.ty}`;this.release(key);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(data.positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(data.normals,3,true));geometry.setAttribute('uv',new THREE.BufferAttribute(data.uv,2));geometry.setAttribute('color',new THREE.BufferAttribute(data.colors,3,true));geometry.setIndex(new THREE.BufferAttribute(data.indices,1));geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,this.material);mesh.position.set(data.tx,0,data.ty);mesh.receiveShadow=true;
    if(this.shadows){mesh.customDepthMaterial=this.shadows.depth;mesh.customDistanceMaterial=this.shadows.distance;}
    this.add(mesh);
    const bytes=data.positions.byteLength+data.normals.byteLength+data.uv.byteLength+data.colors.byteLength+data.indices.byteLength;
    this.bytes+=bytes;this.tiles.set(key,{mesh,bytes,installed:time});
  }
  update(x:number,y:number,time:number,enabled=true){
    this.visible=enabled;if(!enabled)return;
    const planStamp=`${Math.floor(x/256)},${Math.floor(y/256)}`;
    if(planStamp!==this.planStamp){this.planStamp=planStamp;this.wanted=surfaceTilesAround(x,y);this.wants=new Set(this.wanted.map(tile=>`${tile.x},${tile.y}`));}
    const wanted=this.wanted;
    for(let i=0;i<2&&this.queue.length;i++){
      const result=this.queue.shift()!;
      if(result.epoch===this.epoch&&this.wants.has(`${result.mesh.tx},${result.mesh.ty}`))this.install(result.mesh,time);
    }
    const queued=new Set(this.queue.map(({mesh})=>`${mesh.tx},${mesh.ty}`));
    let requested=0;
    for(const tile of wanted){const key=`${tile.x},${tile.y}`,job=`${key}:${this.epoch}`;
      if(this.tiles.has(key)||queued.has(key)||this.pending.has(job))continue;
      if(this.worker){if(this.pending.size>=2)break;this.pending.add(job);this.worker.postMessage({x:tile.x,y:tile.y,epoch:this.epoch});}
      else if(!requested){this.install(meshBlockHorizon(tile.x,tile.y,BLOCK_SURFACE_TILE,this.terrain?(x,y)=>this.terrain!.surfaceHeight(x,y):undefined),time);}
      if(++requested>=2||!this.worker)break;
    }
    const ordered=[...this.tiles].sort((a,b)=>distanceToTerrainTile(x,y,b[1].mesh.position.x,b[1].mesh.position.z,BLOCK_SURFACE_TILE)-distanceToTerrainTile(x,y,a[1].mesh.position.x,a[1].mesh.position.z,BLOCK_SURFACE_TILE));
    for(const [key,tile]of ordered){
      const distance=distanceToTerrainTile(x,y,tile.mesh.position.x,tile.mesh.position.z,BLOCK_SURFACE_TILE);
      if(distance>BLOCK_RETAIN||this.tiles.size>BLOCK_CACHE_TILES||this.bytes>BLOCK_CACHE_BYTES){this.release(key);continue;}
      this.mask(tile.mesh.position.x,tile.mesh.position.z,Math.min(255,Math.round((time-tile.installed)/.25*255)));
      tile.mesh.visible=distance<BLOCK_DETAIL_END;
      // Far shells do not need to be replayed into the local sun shadow map.
      tile.mesh.castShadow=distance<1024;
    }
  }
  get stats(){return {surfaceTiles:this.tiles.size,surfaceBytes:this.bytes,surfaceJobs:this.pending.size+this.queue.length};}
  dispose(){this.disposed=true;this.worker?.terminate();this.pending.clear();this.queue=[];for(const key of [...this.tiles.keys()])this.release(key);this.removeFromParent();}
}
