import {performance} from 'node:perf_hooks';
import {mkdirSync,writeFileSync} from 'node:fs';
import {FriendsTerrain} from '../src/game/world/FriendsTerrain';
import {CAVE_DESCENT_ROOMS,CAVE_BEDROCK_ROOM} from '../src/game/world/FriendsCaveDescent';
import {meshTerrainChunk,meshTerrainChunkFull,terrainChunkMeshBands} from '../src/game/world/FriendsTerrainMesh';
const rows=[];
for(const r of [CAVE_DESCENT_ROOMS[0],CAVE_DESCENT_ROOMS[3],CAVE_DESCENT_ROOMS[5],CAVE_DESCENT_ROOMS[7],CAVE_BEDROCK_ROOM]){
 const t=new FriendsTerrain(),cx=Math.floor(r.x/512),cy=Math.floor(r.y/512),full:number[]=[],sparse:number[]=[];
 const original=t.exposedMaterial.bind(t);let samples=0,fullSamples=0,sparseSamples=0,vertices=0,bytes=0;
 t.exposedMaterial=(...args)=>{samples++;return original(...args);};
 let lo=Infinity,hi=-Infinity;for(let x=-1;x<=16;x++)for(let y=-1;y<=16;y++){const b=t.columnRange(cx*16+x,cy*16+y);lo=Math.min(lo,b.bottom);hi=Math.max(hi,b.top);}
 for(let i=0;i<10;i++)for(const mode of i%2?['full','sparse']:['sparse','full']){
  samples=0;const start=performance.now(),m=(mode==='full'?meshTerrainChunkFull:meshTerrainChunk)(t,cx,cy),elapsed=performance.now()-start;
  if(i>2)(mode==='full'?full:sparse).push(elapsed);if(mode==='full')fullSamples=samples;else sparseSamples=samples;
  vertices=m.positions.length/3;bytes=[m.positions,m.normals,m.uv,m.colors,m.glow].reduce((n,a)=>n+a.byteLength,0);
 }
 full.sort((a,b)=>a-b);sparse.sort((a,b)=>a-b);const bands=terrainChunkMeshBands(t,cx,cy);
 rows.push({name:r.name,chunk:[cx,cy],fullLayers:hi-lo+1,scannedLayers:bands.reduce((n,b)=>n+b.top-b.bottom+1,0),bands,fullMs:+full[3].toFixed(2),sparseMs:+sparse[3].toFixed(2),percentFaster:+((1-sparse[3]/full[3])*100).toFixed(1),fullSamples,sparseSamples,vertices,bytes});
}
mkdirSync('artifacts/dungeon-sections',{recursive:true});writeFileSync('artifacts/dungeon-sections/benchmark.json',JSON.stringify({date:new Date().toISOString(),note:'Alternating warm full/sparse Node CPU mesh runs; not browser FPS.',rows},null,2)+'\n');console.table(rows.map(({bands,...r})=>r));
