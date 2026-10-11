import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {FriendsTerrain} from '../src/game/world/FriendsTerrain';
import {meshTerrainChunk,meshTerrainChunkFull,type TerrainMeshData} from '../src/game/world/FriendsTerrainMesh';
import {CAVE_BOUNDS} from '../src/game/world/FriendsCave';
function hash(m:TerrainMeshData){const triangles:string[]=[];for(const g of m.groups)for(let i=g.start;i<g.start+g.count;i+=3){const v=[];for(let j=i;j<i+3;j++)v.push([...m.positions.subarray(j*3,j*3+3),...m.normals.subarray(j*3,j*3+3),...m.uv.subarray(j*2,j*2+2),...m.colors.subarray(j*3,j*3+3),...m.glow.subarray(j*3,j*3+3)]);triangles.push(JSON.stringify([g.materialIndex,v]));}return createHash('sha256').update(triangles.sort().join('\n')).digest('hex');}
const t=new FriendsTerrain(),results=[];
for(let x=Math.floor(CAVE_BOUNDS.minX/512);x<=Math.floor(CAVE_BOUNDS.maxX/512);x++)for(let y=Math.floor(CAVE_BOUNDS.minY/512);y<=Math.floor(CAVE_BOUNDS.maxY/512);y++){
 const full=hash(meshTerrainChunkFull(t,x,y)),sparse=hash(meshTerrainChunk(t,x,y));
 if(full!==sparse)throw new Error(`Mesh attributes differ at ${x},${y}`);results.push({chunk:[x,y],hash:full});
}
mkdirSync('artifacts/dungeon-sections',{recursive:true});writeFileSync('artifacts/dungeon-sections/geometry.json',JSON.stringify({checks:results.length,results},null,2)+'\n');console.log(`PASS ${results.length} dungeon-footprint chunks preserve all triangle attributes`);
