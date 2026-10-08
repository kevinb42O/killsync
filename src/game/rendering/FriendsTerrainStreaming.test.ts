import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CAVE_ENTRANCE } from '../world/FriendsCave';
import { FriendsTerrain } from '../world/FriendsTerrain';
import { meshBlockHorizon } from '../world/FriendsHorizonMesh';
import { FriendsBlockSurface } from './FriendsBlockSurface';
import { BLOCK_DETAIL_START, BLOCK_DETAIL_END, BLOCK_PREFETCH, BLOCK_SURFACE_TILE, surfaceTilesAround, volumeChunksAround } from './FriendsTerrainStreaming';
import { FRIENDS_NIGHT_VISION_RANGE } from './FriendsVision';
afterEach(()=>vi.unstubAllGlobals());

describe('surface-first block streaming',()=>{
  it('loads exact block surfaces far ahead on untouched ground without generating underground volumes',()=>{
    const view={x:24000,y:24000},tiles=surfaceTilesAround(view.x,view.y);
    expect(volumeChunksAround(view.x,view.y,new Set(),false).size).toBe(0);
    for(const distance of [0,2048,4096,BLOCK_DETAIL_START,BLOCK_DETAIL_END,BLOCK_PREFETCH]){
      const x=view.x+distance;
      expect(tiles.some(t=>x>=t.x&&x<t.x+BLOCK_SURFACE_TILE&&view.y>=t.y&&view.y<t.y+BLOCK_SURFACE_TILE)).toBe(true);
    }
    expect(tiles.length).toBeLessThan(128);
    const terrain=new FriendsTerrain(),sample=vi.spyOn(terrain,'material');
    const mesh=meshBlockHorizon(22528,22528,2048,(x,y)=>terrain.surfaceHeight(x,y));
    expect(mesh.positions.length).toBeGreaterThan(0);expect(sample).not.toHaveBeenCalled();
    for(const n of mesh.positions)expect(n%32).toBe(0);
  });
  it('promotes a dig and its shared chunk borders, and reloads persisted digs when returning',()=>{
    const edited=new Set(['46,46']),around=volumeChunksAround(24000,24000,edited,false);
    for(const key of ['46,46','45,46','47,46','46,45','46,47'])expect(around.has(key)).toBe(true);
    expect(around.size).toBe(5);
    expect(volumeChunksAround(24000,24000,new Set(),false,2600,{x:24000,y:24000})).toEqual(around);
    expect(volumeChunksAround(45000,45000,edited,false).size).toBe(0);
    expect(volumeChunksAround(24000,24000,edited,false)).toEqual(around);
  });
  it('preloads the visible cave interior on approach and follows the viewer deeper inside',()=>{
    const mouth=volumeChunksAround(CAVE_ENTRANCE.x-100,CAVE_ENTRANCE.y,new Set(),false);
    expect(mouth.size).toBeLessThan(180);
    // The vestibule beyond the shaft used to be missing from the exterior
    // view, leaving sky behind its torches and crystals.
    for(const key of ['13,9','13,10','14,9'])expect(mouth.has(key),key).toBe(true);
    expect(mouth).toEqual(volumeChunksAround(CAVE_ENTRANCE.x-100,CAVE_ENTRANCE.y,new Set(),true));
    const inside=volumeChunksAround(9184,5664,new Set(),true);
    expect(inside.size).toBeGreaterThan(mouth.size);expect(inside.size).toBeLessThan(180);
    expect(inside.has('17,11')).toBe(true);expect(inside.has('32,11')).toBe(false);
    // Player-made mining seams outside the authored labyrinth work too.
    expect(volumeChunksAround(24000,24000,new Set(),true).has('46,46')).toBe(true);
  });
  it('keeps the horizon until a shell is installed, limits jobs, and evicts travel history',()=>{
    class WorkerStub {
      static instance:WorkerStub;
      requests:{x?:number;y?:number;epoch:number}[]=[];
      onmessage?: (event:MessageEvent)=>void;
      onerror?:()=>void;
      constructor(){WorkerStub.instance=this;}
      postMessage(request:typeof this.requests[number]){this.requests.push(request);}
      terminate(){}
    }
    vi.stubGlobal('Worker',WorkerStub);
    const grid=94,ready=new Uint8Array(grid*grid),coverage=new THREE.DataTexture(ready,grid,grid,THREE.RedFormat),material=new THREE.MeshStandardMaterial();
    const surface=new FriendsBlockSurface(material,ready,coverage,grid),worker=WorkerStub.instance;
    surface.update(24000,24000,0);surface.update(24000,24000,.1);
    expect(worker.requests.filter(r=>r.x!==undefined)).toHaveLength(2);expect(ready.some(Boolean)).toBe(false);
    const request=worker.requests.find(r=>r.x!==undefined)!;
    worker.onmessage!({data:{epoch:request.epoch,mesh:meshBlockHorizon(request.x!,request.y!,2048,()=>0)}} as MessageEvent);
    expect(ready.some(Boolean)).toBe(false);
    surface.update(24000,24000,.2);surface.update(24000,24000,.5);
    expect(surface.stats.surfaceTiles).toBe(1);expect(ready.some(v=>v===255)).toBe(true);
    surface.update(47000,47000,.6);
    expect(surface.stats.surfaceTiles).toBe(0);expect(ready.some(Boolean)).toBe(false);
    surface.dispose();material.dispose();coverage.dispose();
  });
  it('prepares underground terrain throughout the longer NVG reach before goggles are toggled',()=>{
    const x=24000,y=24000,desired=volumeChunksAround(x,y,new Set(),true,FRIENDS_NIGHT_VISION_RANGE);
    for(const [dx,dy]of [[FRIENDS_NIGHT_VISION_RANGE-32,0],[-FRIENDS_NIGHT_VISION_RANGE+32,0],[0,FRIENDS_NIGHT_VISION_RANGE-32],[0,-FRIENDS_NIGHT_VISION_RANGE+32]]){
      expect(desired.has(`${Math.floor((x+dx)/512)},${Math.floor((y+dy)/512)}`)).toBe(true);
    }
    expect(volumeChunksAround(x,y,new Set(),false,FRIENDS_NIGHT_VISION_RANGE).size).toBe(0);
  });
});
