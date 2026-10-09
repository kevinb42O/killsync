import { performance } from 'node:perf_hooks';
import { FriendsSimulation } from '../src/game/multiplayer/FriendsSimulation.ts';
import { compactSnapshotWirePayload } from '../src/game/multiplayer/snapshotReplication.ts';
const seeds=Array.from({length:4},(_,i)=>({id:`p${i}`,label:`Player ${i}`,color:'#8de6ce'}));
const s=new FriendsSimulation(seeds,12345);
for(let i=0;i<200;i++)s.tick(50);
const ticks:number[]=[],snapshots:number[]=[];
for(let round=0;round<7;round++){
 let start=performance.now();for(let i=0;i<200;i++)s.tick(50);ticks.push((performance.now()-start)/200);
 start=performance.now();for(let i=0;i<200;i++)s.createSnapshot();snapshots.push((performance.now()-start)/200);
}
const median=(a:number[])=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const snapshot=s.createSnapshot();console.log(JSON.stringify({players:4,tickMedianMs:median(ticks),snapshotMedianMs:median(snapshots),ticks,snapshots,compactFullBytes:Buffer.byteLength(JSON.stringify(compactSnapshotWirePayload({format:'coop_snapshot_full',snapshot})))},null,2));
