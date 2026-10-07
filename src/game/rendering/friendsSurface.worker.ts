import { FriendsTerrain, TERRAIN_GENERATION, type TerrainGrade } from '../world/FriendsTerrain';
import { meshBlockHorizon } from '../world/FriendsHorizonMesh';
import { BLOCK_SURFACE_TILE } from './FriendsTerrainStreaming';
let terrain:FriendsTerrain|undefined;
self.onmessage=(event:MessageEvent<{grades?:TerrainGrade[];x?:number;y?:number;epoch:number}>)=>{
  const request=event.data;
  if(request.grades){terrain=request.grades.length?new FriendsTerrain({generation:TERRAIN_GENERATION,revision:0,edits:[],grades:request.grades}):undefined;return;}
  if(request.x===undefined||request.y===undefined)return;
  const mesh=meshBlockHorizon(request.x,request.y,BLOCK_SURFACE_TILE,terrain?(x,y)=>terrain!.surfaceHeight(x,y):undefined);
  self.postMessage({mesh,epoch:request.epoch},{transfer:[mesh.positions.buffer,mesh.normals.buffer,mesh.uv.buffer,mesh.colors.buffer,mesh.indices.buffer]});
};
