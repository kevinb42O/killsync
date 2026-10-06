import { FRONTIER_SIZE, FriendsTerrain, TERRAIN_GENERATION, type TerrainGrade } from '../world/FriendsTerrain';
import { meshBlockHorizon } from '../world/FriendsHorizonMesh';
self.onmessage=(event:MessageEvent<{x:number;y:number;grades?:TerrainGrade[]}>)=>{
  const terrain=event.data.grades?.length?new FriendsTerrain({revision:0,generation:TERRAIN_GENERATION,grades:event.data.grades,edits:[]}):undefined;
  const tiles:number[][]=[];
  for(let x=0;x<FRONTIER_SIZE;x+=4096)for(let y=0;y<FRONTIER_SIZE;y+=4096)tiles.push([x,y]);
  tiles.sort((a,b)=>Math.hypot(a[0]+2048-event.data.x,a[1]+2048-event.data.y)-Math.hypot(b[0]+2048-event.data.x,b[1]+2048-event.data.y));
  for(const [x,y]of tiles){const mesh=meshBlockHorizon(x,y,4096,terrain?(x,y)=>terrain.surfaceHeight(x,y):undefined);self.postMessage(mesh,{transfer:[mesh.positions.buffer,mesh.normals.buffer,mesh.uv.buffer,mesh.colors.buffer,mesh.indices.buffer]});}
  self.close();
};
