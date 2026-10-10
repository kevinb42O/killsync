/** Run with: FRIENDS_CPU_BASELINE=/path/to/untouched/checkout npx tsx tools/benchmark-friends-cpu.ts */
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { FriendsBuilding, friendsBuildFloor, friendsBuildCeiling, resolveFriendsBuildCollisions, type FriendsBuildPiece } from '../src/game/multiplayer/FriendsBuilding';
import { FriendsBuildSpatialIndex } from '../src/game/multiplayer/FriendsInteractionTargeting';
import { FriendsTreeCollisionCache } from '../src/game/multiplayer/FriendsTreeCollisionCache';
import { frontierTrees } from '../src/game/multiplayer/FriendsFrontier';
import { FriendsTerrain } from '../src/game/world/FriendsTerrain';
import { FriendsSimulation } from '../src/game/multiplayer/FriendsSimulation';
import { LocalPlayerPrediction } from '../src/game/multiplayer/LocalPlayerPrediction';
import { MULTIPLAYER_PROTOCOL_VERSION } from '../src/game/multiplayer/protocol';
import assert from 'node:assert/strict';

const baselineRoot=process.env.FRIENDS_CPU_BASELINE;
if(!baselineRoot)throw new Error('FRIENDS_CPU_BASELINE must point to an untouched checkout with node_modules available.');
const original=await import(pathToFileURL(resolve(baselineRoot,'src/game/multiplayer/FriendsBuilding.ts')).href);
const originalSim=await import(pathToFileURL(resolve(baselineRoot,'src/game/multiplayer/FriendsSimulation.ts')).href);
const originalPrediction=await import(pathToFileURL(resolve(baselineRoot,'src/game/multiplayer/LocalPlayerPrediction.ts')).href);
const results:any[]=[];
let sink=0;
function compare(name:string,iterations:number,before:()=>number,after:()=>number,detail:object={}){
  for(let i=0;i<Math.min(iterations,1000);i++){sink+=before();sink+=after();}
  const runs=[];
  for(let round=0;round<7;round++){
    const run=(fn:()=>number)=>{const start=performance.now();for(let i=0;i<iterations;i++)sink+=fn();return performance.now()-start;};
    let oldMs:number,newMs:number;
    if(round%2){newMs=run(after);oldMs=run(before);}else{oldMs=run(before);newMs=run(after);}
    runs.push({beforeMs:oldMs,afterMs:newMs});
  }
  const median=(xs:number[])=>xs.sort((a,b)=>a-b)[Math.floor(xs.length/2)];
  const old=median(runs.map(r=>r.beforeMs))/iterations,next=median(runs.map(r=>r.afterMs))/iterations;
  const result={name,iterations,...detail,beforeMsPerCall:old,afterMsPerCall:next,savedMsPerCall:old-next,speedup:old/next,runs};
  results.push(result);console.log(JSON.stringify(result));
}
const pieces=(n:number):FriendsBuildPiece[]=>Array.from({length:n},(_,i)=>({id:i+1,x:2048+i%32*192,y:2048+Math.floor(i/32)*192,z:0,shape:'cube',rotation:0,finish:'stone',author:'Bench',revision:1}));
for(const n of [0,64,256,1024]){
  const p=pieces(n),index=new FriendsBuildSpatialIndex();index.update(p,1);
  compare('construction floor + ceiling + collision',3000,()=>{
    const q={x:2100,y:2100};return Number(friendsBuildFloor(p,q.x,q.y,0)||0)+Number(friendsBuildCeiling(p,q.x,q.y,0)||0)+Number(resolveFriendsBuildCollisions(p,q,0,19));
  },()=>{
    const q={x:2100,y:2100},near=index.near(q.x,q.y,84);return Number(friendsBuildFloor(near,q.x,q.y,0)||0)+Number(friendsBuildCeiling(near,q.x,q.y,0)||0)+Number(index.collide(p,q,0,19));
  },{pieces:n,localCandidates:index.near(2100,2100,84).length,contact:false});
  if(n){
    const q={x:2050,y:2050};compare('construction collision with conservative replay',1000,()=>Number(resolveFriendsBuildCollisions(p,{...q},0,19)),()=>Number(index.collide(p,{...q},0,19)),{pieces:n,contact:true});
  }
  for(const attached of [false,true]){
    if(!n&&attached)continue;
    const fixture=pieces(n);if(attached)fixture[0].attachment={vehicleId:'grand-3',x:16,y:0,z:0};
    const old=new original.FriendsBuilding({pieces:fixture}),next=new FriendsBuilding({pieces:fixture});
    const vehicles=[{id:'grand-3',kind:'train' as const,x:6400,y:6144,z:100,angle:0,length:210,width:120,scenic:true,wagonKind:'flatbed' as const}];
    old.vehicleProvider=()=>vehicles;next.vehicleProvider=()=>vehicles;
    compare('unchanged build pose read',10000,()=>old.getPieces().length,()=>next.getPieces().length,{pieces:n,attached});
  }
  // This includes terrain, frontier, vehicles, hauling and player authority work.
  const seeds=[{id:'host',label:'Bench',color:'#8de6ce'}],fixture={revision:1,guestsCanBuild:true,pieces:pieces(n)};
  const old=new originalSim.FriendsSimulation(seeds,1234,undefined,fixture),next=new FriendsSimulation(seeds,1234,undefined,fixture);
  compare('complete stationary host simulation tick',300,()=>{old.tick(1000/30);return old.tickNumber||0;},()=>{next.tick(1000/30);return 0;},{pieces:n,tickRate:30});
  assert.deepEqual(next.createSnapshot().players,old.createSnapshot().players,'Host positions must match after equal tick counts');
  const snapshot=next.createSnapshot(),oldGuest=new originalPrediction.LocalPlayerPrediction('host'),newGuest=new LocalPlayerPrediction('host');
  oldGuest.reconcile(snapshot);newGuest.reconcile(snapshot);
  const input={type:'input' as const,version:MULTIPLAYER_PROTOCOL_VERSION,sequence:1,clientTime:0,movement:1,aimAngle:0,aimPitch:32768,selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false};
  compare('complete guest presentation movement',1000,()=>oldGuest.present(snapshot,input,16,0).players[0].x,()=>newGuest.present(snapshot,input,16,0).players[0].x,{pieces:n});
  assert.deepEqual(newGuest.present(snapshot,input,16,0).players,oldGuest.present(snapshot,input,16,0).players,'Guest presentation must match');
}
const terrain=new FriendsTerrain(),t=frontierTrees(20,8)[0],forest={harvested:Array.from({length:1000},(_,i)=>`harvested:${i}`),planted:[]},cache=new FriendsTreeCollisionCache();
function oldTree(){
  const position={x:t.x+2,y:t.y},cx=Math.floor(position.x/512),cy=Math.floor(position.y/512),removed=new Set(forest.harvested),trees=[...forest.planted];
  for(let a=cx-1;a<=cx+1;a++)for(let b=cy-1;b<=cy+1;b++)trees.push(...frontierTrees(a,b));
  let hit=0;for(const tree of trees){if(removed.has(tree.id)||!terrain.supports(tree.x,tree.y,tree.z)||t.z>=tree.z+180*tree.scale||t.z+50<tree.z)continue;
    const dx=position.x-tree.x,dy=position.y-tree.y,d=Math.hypot(dx,dy),r=19+10*tree.scale;
    if(d<r){position.x=tree.x+(d>.001?dx/d:1)*r;position.y=tree.y+(d>.001?dy/d:0)*r;hit=1;}}
  return hit;
}
compare('guest tree collision warm cache',2000,oldTree,()=>Number(cache.collide({x:t.x+2,y:t.y},t.z,19,forest,terrain)),{harvested:1000,region:[20,8]});
// Network latency can force reconciliation to replay up to 30 pending inputs.
// Keep the position in dense woodland and measure that complete public path.
for(const n of [0,1024]){
  const host=new FriendsSimulation([{id:'host',label:'Bench',color:'#fff'}],1234,undefined,{revision:1,guestsCanBuild:true,pieces:pieces(n)}),snapshot=host.createSnapshot();
  Object.assign(snapshot.players[0],{x:t.x+2,y:t.y,z:t.z,lastProcessedInput:0});
  snapshot.friends!.frontier.harvested=Array.from({length:1000},(_,i)=>`${i%94}:${Math.floor(i/94)}:0`);
  const oldGuest=new originalPrediction.LocalPlayerPrediction('host'),newGuest=new LocalPlayerPrediction('host');
  oldGuest.reconcile(snapshot);newGuest.reconcile(snapshot);
  for(let sequence=1;sequence<=30;sequence++){
    const input={type:'input' as const,version:MULTIPLAYER_PROTOCOL_VERSION,sequence,clientTime:0,movement:0,aimAngle:0,aimPitch:32768,selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false};
    oldGuest.step(input);newGuest.step(input);
  }
  compare('complete guest reconciliation with 30 pending inputs in woodland',100,()=>{oldGuest.reconcile(snapshot);return 0;},()=>{newGuest.reconcile(snapshot);return 0;},{pieces:n,harvested:1000,pendingInputs:30});
  assert.deepEqual((newGuest as any).motion,(oldGuest as any).motion,'Dense woodland replay must preserve complete movement state');
}
const offsets=Array.from({length:121},(_,i)=>[i%11-5,Math.floor(i/11)-5]).sort((a,b)=>Math.hypot(...a)-Math.hypot(...b));
compare('grove cell ordering',10000,()=>{const cells=Array.from({length:121},(_,i)=>[i%11-5,Math.floor(i/11)-5]);cells.sort((a,b)=>Math.hypot(...a)-Math.hypot(...b));return cells.length;},()=>offsets.length,{cells:121});
await mkdir('artifacts/friends-cpu-optimisation',{recursive:true});
await writeFile('artifacts/friends-cpu-optimisation/cpu-benchmark.json',JSON.stringify({date:new Date().toISOString(),hardware:execFileSync('sysctl',['-n','machdep.cpu.brand_string'],{encoding:'utf8'}).trim(),baselineRoot,rounds:7,method:'Warmed paired Node/tsx CPU benchmarks, alternating order; median per call. Not whole-game FPS.',sink,results},null,2)+'\n');
