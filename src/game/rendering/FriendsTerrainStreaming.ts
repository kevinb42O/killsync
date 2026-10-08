import { scenicRailway } from '../world/FriendsScenicRailway';
import { sampleRailAlignment, railColumns } from '../world/FriendsRailAlignment';
import { CAVE_BOUNDS, CAVE_ENTRANCE } from '../world/FriendsCave';
import { FRONTIER_SIZE, TERRAIN_CHUNK, FRIENDS_FIXED_PLATFORMS } from '../world/FriendsTerrain';

// Units are 1/12 metre: exact blocks to 512 m, fading to the full-map
// horizon by 683 m. Start work another 85 m ahead of that transition.
export const BLOCK_SURFACE_TILE = 2048;
export const BLOCK_DETAIL_START = 6144;
export const BLOCK_DETAIL_END = 8192;
export const BLOCK_PREFETCH = 9216;
export const BLOCK_RETAIN = 11264;
export const BLOCK_CACHE_TILES = 128;
export const BLOCK_CACHE_BYTES = 96 * 1024 * 1024;
export const VOLUME_RETAIN = BLOCK_DETAIL_END + TERRAIN_CHUNK * 2;

export function distanceToTerrainTile(x:number,y:number,tx:number,ty:number,size:number) {
  return Math.hypot(Math.max(tx-x,0,x-tx-size),Math.max(ty-y,0,y-ty-size));
}
export function surfaceTilesAround(x:number,y:number) {
  const tiles:{x:number;y:number;distance:number}[]=[];
  for(let a=Math.max(0,Math.floor((x-BLOCK_PREFETCH)/BLOCK_SURFACE_TILE));a<=Math.min(Math.ceil(FRONTIER_SIZE/BLOCK_SURFACE_TILE)-1,Math.floor((x+BLOCK_PREFETCH)/BLOCK_SURFACE_TILE));a++)
    for(let b=Math.max(0,Math.floor((y-BLOCK_PREFETCH)/BLOCK_SURFACE_TILE));b<=Math.min(Math.ceil(FRONTIER_SIZE/BLOCK_SURFACE_TILE)-1,Math.floor((y+BLOCK_PREFETCH)/BLOCK_SURFACE_TILE));b++){
      const tx=a*BLOCK_SURFACE_TILE,ty=b*BLOCK_SURFACE_TILE,distance=distanceToTerrainTile(x,y,tx,ty,BLOCK_SURFACE_TILE);
      if(distance<=BLOCK_PREFETCH)tiles.push({x:tx,y:ty,distance});
    }
  return tiles.sort((a,b)=>a.distance-b.distance||Math.hypot(a.x+1024-x,a.y+1024-y)-Math.hypot(b.x+1024-x,b.y+1024-y));
}

/** Ordinary outdoor terrain needs no volume. Promote only changed columns,
 * their shared borders, the cave entrances, or the local underground view. */
export function volumeChunksAround(x:number,y:number,edited:ReadonlySet<string>,underground:boolean,reach=2600,excavation?:{x:number;y:number}) {
  const desired=new Set<string>();
  const add=(a:number,b:number)=>{if(a>=0&&b>=0&&a<FRONTIER_SIZE/TERRAIN_CHUNK&&b<FRONTIER_SIZE/TERRAIN_CHUNK)desired.add(`${a},${b}`);};
  const promote=(a:number,b:number)=>{for(const [dx,dy]of[[0,0],[-1,0],[1,0],[0,-1],[0,1]])add(a+dx,b+dy);};
  for (const spawn of FRIENDS_FIXED_PLATFORMS) if (Math.hypot(x - spawn.x, y - spawn.y) < 1500) {
    for (let a = Math.floor((spawn.x-spawn.size/2)/512); a <= Math.floor((spawn.x+spawn.size/2-1)/512); a++)
      for (let b = Math.floor((spawn.y-spawn.size/2)/512); b <= Math.floor((spawn.y+spawn.size/2-1)/512); b++) add(a,b);
  }
  for(const key of edited){const [a,b]=key.split(',').map(Number);if(distanceToTerrainTile(x,y,a*512,b*512,512)<=BLOCK_PREFETCH)promote(a,b);}
  if(excavation)promote(Math.floor(excavation.x/512),Math.floor(excavation.y/512));
  for(const mouth of [CAVE_ENTRANCE,{x:6512,y:6192}])if(Math.hypot(x-mouth.x,y-mouth.y)<900){
    for(let a=Math.floor((mouth.x-256)/512);a<=Math.floor((mouth.x+256)/512);a++)for(let b=Math.floor((mouth.y-256)/512);b<=Math.floor((mouth.y+256)/512);b++)add(a,b);
  }
  const route=scenicRailway(),columns=railColumns(route,x,y,768);
  // Volumes ahead of a train are promoted before its camera enters a portal.
  for(const c of columns)for(let ahead=-768;ahead<=2304;ahead+=384){
    const p=sampleRailAlignment(route,c.distance+ahead);promote(Math.floor(p.x/512),Math.floor(p.y/512));
  }
  // Looking through the shaft reveals the vestibule and connecting tunnels
  // before the camera goes underground. Stream that same view on approach;
  // a surface shell has no interior walls to close the distant end of it.
  const approachingCave=Math.hypot(x-CAVE_ENTRANCE.x,y-CAVE_ENTRANCE.y)<900;
  if(underground||approachingCave){
    const radius=reach+512;
    const authored=approachingCave||x>=CAVE_BOUNDS.minX&&x<=CAVE_BOUNDS.maxX&&y>=CAVE_BOUNDS.minY&&y<=CAVE_BOUNDS.maxY;
    for(let a=Math.max(0,Math.floor((x-radius)/512));a<=Math.min(93,Math.floor((x+radius)/512));a++)for(let b=Math.max(0,Math.floor((y-radius)/512));b<=Math.min(93,Math.floor((y+radius)/512));b++){
      if(distanceToTerrainTile(x,y,a*512,b*512,512)>radius)continue;
      if(authored&&!columns.length&&(a*512>CAVE_BOUNDS.maxX||(a+1)*512<CAVE_BOUNDS.minX||b*512>CAVE_BOUNDS.maxY||(b+1)*512<CAVE_BOUNDS.minY))continue;
      add(a,b);
    }
  }
  return desired;
}
