import {performance} from 'node:perf_hooks';
import {mkdirSync,writeFileSync} from 'node:fs';
import {FriendsTerrain} from '../src/game/world/FriendsTerrain';
import {CAVE_DESCENT_ROOMS,CAVE_BEDROCK_ROOM} from '../src/game/world/FriendsCaveDescent';
import {meshTerrainChunk} from '../src/game/world/FriendsTerrainMesh';
const report:{name:string;chunk:number[];verticalVoxels:number;medianMs:number;rangeMs:number[];samples:number;vertices:number;bytes:number}[]=[];
for(const room of [CAVE_DESCENT_ROOMS[0],CAVE_DESCENT_ROOMS[3],CAVE_DESCENT_ROOMS[5],CAVE_DESCENT_ROOMS[7],CAVE_BEDROCK_ROOM]){
 const terrain=new FriendsTerrain(),cx=Math.floor(room.x/512),cy=Math.floor(room.y/512),original=terrain.exposedMaterial.bind(terrain);let samples=0;
 terrain.exposedMaterial=(...args)=>{samples++;return original(...args);};
 const times:number[]=[];let vertices=0,bytes=0,firstSamples=0,bottom=Infinity,top=-Infinity;
 for(let x=-1;x<=16;x++)for(let y=-1;y<=16;y++){const r=terrain.columnRange(cx*16+x,cy*16+y);bottom=Math.min(bottom,r.bottom);top=Math.max(top,r.top);}
 for(let run=0;run<4;run++){samples=0;const start=performance.now(),mesh=meshTerrainChunk(terrain,cx,cy);const elapsed=performance.now()-start;if(run)times.push(elapsed);else firstSamples=samples;vertices=mesh.positions.length/3;bytes=[mesh.positions,mesh.normals,mesh.uv,mesh.colors,mesh.glow].reduce((n,a)=>n+a.byteLength,0);}
 times.sort((a,b)=>a-b);report.push({name:room.name,chunk:[cx,cy],verticalVoxels:top-bottom+1,medianMs:Math.round(times[1]*100)/100,rangeMs:times.map(t=>Math.round(t*100)/100),samples:firstSamples,vertices,bytes});
}
const target=process.argv[2]??'artifacts/dungeon-profile/current.json';mkdirSync(target.slice(0,target.lastIndexOf('/')),{recursive:true});writeFileSync(target,JSON.stringify({date:new Date().toISOString(),note:'Node CPU microbenchmark, warm repeated chunk meshes; not browser FPS.',report},null,2)+'\n');console.table(report);
