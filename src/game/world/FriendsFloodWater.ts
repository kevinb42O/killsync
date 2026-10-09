import { FRIENDS_TERRAIN_BOTTOM } from './FriendsTerrainLimits';
import type { FriendsTerrain, TerrainEdit } from './FriendsTerrain';
import { friendsWaterAt, friendsWaterGround, type FriendsWaterSample } from './FriendsWaterSurface';
import { ISLAND_LAKES } from './FriendsIsland';

const SIZE=32;
const directions=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]] as const;
const key=(x:number,y:number,z:number)=>`${x},${y},${z}`;
export type FloodCell={vx:number;vy:number;vz:number;level:number;bodyId:string};
export interface FloodTerrain {
  readonly waterEpoch:number;
  floodEdits():Iterable<TerrainEdit>;
  floodChanges?(after:number):TerrainEdit[]|undefined;
  material(x:number,y:number,z:number):number;
}
export type FloodSource=(x:number,y:number)=> (FriendsWaterSample & {bed:number})|undefined;
const naturalSource:FloodSource=(x,y)=>{
  const s=friendsWaterAt(x,y);
  if(s&&(s.bodyId==='sea'||ISLAND_LAKES.some(l=>l.id===s.bodyId)))return {...s,bed:friendsWaterGround(x,y)};
};
const preferred=(a:{level:number;bodyId:string},b:{level:number;bodyId:string})=>a.level>b.level||a.level===b.level&&a.bodyId<b.bodyId;
/** Sparse fixed-head connectivity. Natural wet cells are terminal boundaries,
 * never traversal nodes. The cache commits atomically once per terrain batch. */
type FloodNode={vx:number;vy:number;vz:number;neighbours:string[];seeds:{cell:string;level:number;bodyId:string}[]};
export class FriendsFloodWater {
  private nodes=new Map<string,FloodNode>();
  private epoch=-1;
  private wet=new Map<string,FloodCell>();
  private bottoms=new Map<string,number>();
  private surfaces=new Map<string,FriendsWaterSample>();
  private sourceCache=new Map<string,ReturnType<FloodSource>>();
  rebuilds=0;
  lastSolveMs=0;
  constructor(private terrain:FloodTerrain,private source:FloodSource=naturalSource){}
  refresh(){
    if(this.epoch===this.terrain.waterEpoch)return;
    const start=performance.now(),changes=this.epoch>=0?this.terrain.floodChanges?.(this.epoch):undefined;
    const nodes=changes?this.nodes:new Map<string,FloodNode>(),dirty=new Set<string>();
    if(changes){
      for(const [vx,vy,vz,m]of changes){const id=key(vx,vy,vz);
        if(m===0&&!this.terrain.material(vx,vy,vz))nodes.set(id,{vx,vy,vz,neighbours:[],seeds:[]});else nodes.delete(id);
        dirty.add(id);for(const [dx,dy,dz]of directions)dirty.add(key(vx+dx,vy+dy,vz+dz));
      }
    }else for(const [vx,vy,vz,m]of this.terrain.floodEdits())if(m===0&&!this.terrain.material(vx,vy,vz))nodes.set(key(vx,vy,vz),{vx,vy,vz,neighbours:[],seeds:[]});
    for(const [id,c]of nodes){
      if(changes&&!dirty.has(id))continue;
      c.neighbours=[];c.seeds=[];
      for(const [dx,dy,dz]of directions){
        const x=c.vx+dx,y=c.vy+dy,z=c.vz+dz,n=key(x,y,z);
        if(nodes.has(n)){c.neighbours.push(n);continue;}
        const column=`${x},${y}`;
        if(!this.sourceCache.has(column))this.sourceCache.set(column,this.source((x+.5)*SIZE,(y+.5)*SIZE));
        const s=this.sourceCache.get(column);if(!s||this.terrain.material(x,y,z))continue;
        // Both cells must share a nonzero wet face, including vertical faces.
        const low=dz?Math.max(c.vz,z)*SIZE:Math.max(c.vz*SIZE,s.bed);
        const high=dz?low:Math.min((c.vz+1)*SIZE,(z+1)*SIZE,s.level);
        if(dz?low>=s.bed&&low<s.level:high>low)c.seeds.push({cell:id,level:s.level,bodyId:s.bodyId});
      }
    }
    // Highest head first: each node is visited once. A lower source cannot
    // cross a sill that the higher source could not cross either.
    const seeds=[...nodes.values()].flatMap(c=>c.seeds);
    seeds.sort((a,b)=>b.level-a.level||(a.bodyId<b.bodyId?-1:a.bodyId>b.bodyId?1:0)||(a.cell<b.cell?-1:a.cell>b.cell?1:0));
    const wet=new Map<string,FloodCell>();
    for(const seed of seeds){
      if(wet.has(seed.cell))continue;
      const queue=[seed.cell];
      for(let i=0;i<queue.length;i++){
        const id=queue[i],c=nodes.get(id)!;
        if(wet.has(id)||c.vz*SIZE>=seed.level)continue;
        wet.set(id,{vx:c.vx,vy:c.vy,vz:c.vz,level:seed.level,bodyId:seed.bodyId});
        for(const n of c.neighbours)if(!wet.has(n)&&Math.max(c.vz,nodes.get(n)!.vz)*SIZE<seed.level)queue.push(n);
      }
    }
    const bottoms=new Map<string,number>();
    for(const [id,c]of wet){
      if(bottoms.has(id))continue;
      const path:string[]=[];let z=c.vz,bottom:number;
      while(true){const k=key(c.vx,c.vy,z);if(bottoms.has(k)){bottom=bottoms.get(k)!;break;}
        path.push(k);if(wet.get(key(c.vx,c.vy,z-1))?.bodyId!==c.bodyId){bottom=z;break;}z--;}
      for(const k of path)bottoms.set(k,bottom);
    }
    const surfaces=new Map<string,FriendsWaterSample>();
    for(const c of wet.values()){
      const top=Math.ceil(c.level/SIZE)-1;
      if(c.vz!==top||this.terrain.material(c.vx,c.vy,top+1)&&c.level===(top+1)*SIZE)continue;
      const bottom=bottoms.get(key(c.vx,c.vy,c.vz))!;
      const s={level:c.level,bodyId:c.bodyId,depth:c.level-bottom*SIZE};
      const column=`${c.vx},${c.vy}`,old=surfaces.get(column);
      if(!old||preferred(s,old))surfaces.set(column,s);
    }
    this.nodes=nodes;this.wet=wet;this.bottoms=bottoms;this.surfaces=surfaces;this.epoch=this.terrain.waterEpoch;this.rebuilds++;this.lastSolveMs=performance.now()-start;
    // Bound persistent source lookups even during repeated dig/refill cycles.
    if(this.sourceCache.size>42000)this.sourceCache.clear();
  }
  cells(){this.refresh();return this.wet.values();}
  exposed(){this.refresh();return this.surfaces.entries();}
  surface(x:number,y:number){this.refresh();return this.surfaces.get(`${Math.floor(x/SIZE)},${Math.floor(y/SIZE)}`);}
  sample(x:number,y:number,z:number):FriendsWaterSample|undefined{
    if(![x,y,z].every(Number.isFinite))return;
    this.refresh();const vx=Math.floor(x/SIZE),vy=Math.floor(y/SIZE),vz=Math.floor(z/SIZE),c=this.wet.get(key(vx,vy,vz));
    if(c&&z<c.level)return {level:c.level,bodyId:c.bodyId,depth:c.level-this.bottoms.get(key(vx,vy,vz))!*SIZE};
  }
}
const fields=new WeakMap<FriendsTerrain,FriendsFloodWater>();
export function friendsFloodWater(terrain:FriendsTerrain){let field=fields.get(terrain);if(!field){field=new FriendsFloodWater(terrain);fields.set(terrain,field);}return field;}
/** Natural rivers retain their existing ownership. Live collision prevents
 * underwater feedback through replaced beds, roofs and excavated dry gaps. */
export function friendsLiveWaterAt(terrain:FriendsTerrain,x:number,y:number,z:number){
  if(![x,y,z].every(Number.isFinite)||x<0||y<0||x>=48000||y>=48000)return;
  const dynamic=friendsFloodWater(terrain).sample(x,y,z);if(dynamic)return dynamic;
  const vx=Math.floor(x/SIZE),vy=Math.floor(y/SIZE),vz=Math.floor(z/SIZE);
  if(terrain.material(vx,vy,vz))return;
  const s=friendsWaterAt(x,y);if(!s||z<friendsWaterGround(x,y)||z>=s.level)return;
  if(!terrain.hasColumnEdits(vx,vy))return s;
  const surface=friendsLiveWaterSurface(terrain,x,y);return surface?.bodyId===s.bodyId?{...s,depth:surface.depth}:s;
}
export function friendsLiveWaterSurface(terrain:FriendsTerrain,x:number,y:number){
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=48000||y>=48000)return;
  const dynamic=friendsFloodWater(terrain).surface(x,y);if(dynamic)return dynamic;
  const s=friendsWaterAt(x,y);if(!s)return;
  const vx=Math.floor(x/SIZE),vy=Math.floor(y/SIZE),top=Math.ceil(s.level/SIZE)-1;
  if(terrain.material(vx,vy,top))return;
  if(!terrain.hasColumnEdits(vx,vy))return s;
  const naturalBed=friendsWaterGround(x,y);
  let bottom=top;while(bottom>FRIENDS_TERRAIN_BOTTOM/SIZE&&!terrain.material(vx,vy,bottom-1)&&(bottom-1)*SIZE>=naturalBed)bottom--;
  const below=friendsFloodWater(terrain).sample(x,y,bottom*SIZE-.01);
  return {...s,depth:below?.bodyId===s.bodyId?below.depth:Math.min(s.depth,s.level-bottom*SIZE)};
}
