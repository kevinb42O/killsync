import { describe, expect, it } from 'vitest';
import { FriendsSimulation } from './FriendsSimulation';
import type { CoopSnapshot } from './CoopSimulation';
import { FriendsPresentationTimeline } from './FriendsPresentationTimeline';
import { interpolateCoopSnapshot, CoopSnapshotInterpolator } from './snapshotInterpolation';
import { vehicleLocal } from './FriendsExpedition';
import { ROWBOAT_ID, rowboatSeatPoint } from './FriendsRowboat';

const seed = [{ id: 'host', label: 'Host', color: '#8de6ce' }];
describe('Friends vehicle presentation', () => {
  it('interpolates passenger coordinates relative to a turning deck, rather than cutting through its world-space arc', () => {
    const s = new FriendsSimulation(seed), a = s.createSnapshot(), b = s.createSnapshot();
    const before = a.friends!.vehicles.find(v=>v.kind==='aircraft')!, after = b.friends!.vehicles.find(v=>v.kind==='aircraft')!; after.x += 70; after.y += 90; after.z += 80; after.angle = 1.2;
    Object.assign(a.players[0], { x: before.x - 45, y: before.y + 35, z: before.z });
    Object.assign(b.players[0], { x: after.x - 45 * Math.cos(after.angle) - 35 * Math.sin(after.angle), y: after.y - 45 * Math.sin(after.angle) + 35 * Math.cos(after.angle), z: after.z });
    for (const interpolate of [interpolateCoopSnapshot, (beforeFrame: CoopSnapshot, afterFrame: CoopSnapshot, t: number) => new CoopSnapshotInterpolator().interpolate(beforeFrame, afterFrame, t)]) {
      const frame = interpolate(a, b, .5), v = frame.friends!.vehicles.find(v=>v.kind==='aircraft')!, p = frame.players[0], local = vehicleLocal(v, p.x, p.y);
      expect(local.x).toBeCloseTo(-45, 8); expect(local.y).toBeCloseTo(35, 8); expect(p.z).toBe(v.z);
    }
  });
  it('keeps a solo rower centred on the interpolated rowboat instead of using a train seat anchor',()=>{
    const simulation=new FriendsSimulation(seed),a=simulation.createSnapshot(),b=simulation.createSnapshot();
    const before=a.friends!.vehicles.find(v=>v.id===ROWBOAT_ID)!,after=b.friends!.vehicles.find(v=>v.id===ROWBOAT_ID)!;
    a.players[0].friendsSeat={vehicleId:ROWBOAT_ID,index:0};b.players[0].friendsSeat={vehicleId:ROWBOAT_ID,index:0};
    Object.assign(a.players[0],rowboatSeatPoint(before,0,true),{angle:before.angle+Math.PI});
    after.x+=80;after.y+=36;after.angle+=.45;
    Object.assign(b.players[0],rowboatSeatPoint(after,0,true),{angle:after.angle+Math.PI});
    for(const interpolate of [interpolateCoopSnapshot,(beforeFrame:typeof a,afterFrame:typeof b,t:number)=>new CoopSnapshotInterpolator().interpolate(beforeFrame,afterFrame,t)]){
      const frame=interpolate(a,b,.5),boat=frame.friends!.vehicles.find(v=>v.id===ROWBOAT_ID)!,player=frame.players[0],local=vehicleLocal(boat,player.x,player.y);
      expect(local.x).toBeCloseTo(8,7);expect(local.y).toBeCloseTo(0,7);expect(player.angle).toBeCloseTo(boat.angle+Math.PI,7);
    }
  });
  it('keeps both rowers on their own interpolated side seats',()=>{
    const simulation=new FriendsSimulation([...seed,{id:'guest',label:'Guest',color:'#f472b6'}]),a=simulation.createSnapshot(),b=simulation.createSnapshot();
    const before=a.friends!.vehicles.find(v=>v.id===ROWBOAT_ID)!,after=b.friends!.vehicles.find(v=>v.id===ROWBOAT_ID)!;
    after.x+=48;after.angle+=.3;
    for(let i=0;i<2;i++){
      a.players[i].friendsSeat={vehicleId:ROWBOAT_ID,index:i};b.players[i].friendsSeat={vehicleId:ROWBOAT_ID,index:i};
      Object.assign(a.players[i],rowboatSeatPoint(before,i),{angle:before.angle+Math.PI});
      Object.assign(b.players[i],rowboatSeatPoint(after,i),{angle:after.angle+Math.PI});
    }
    const frame=interpolateCoopSnapshot(a,b,.5),boat=frame.friends!.vehicles.find(v=>v.id===ROWBOAT_ID)!;
    frame.players.forEach((player,index)=>{const local=vehicleLocal(boat,player.x,player.y);expect(local.x).toBeCloseTo(8,7);expect(local.y).toBeCloseTo(index===0?20:-20,7);});
  });
  it('keeps movement monotonic and continuous across irregular packet arrival times', () => {
    const s = new FriendsSimulation(seed), packets = Array.from({ length: 31 }, (_, i) => {
      const frame = s.createSnapshot(); frame.tick = i; frame.elapsedMs = i * 50;
      frame.friends!.vehicles[0].x = 6000 + i * 9;
      return { frame, arrival: 1000 + i * 50 + (i % 4 === 2 ? 32 : i % 4 === 3 ? 5 : 0) };
    });
    const timeline = new FriendsPresentationTimeline(120); let index = 0, previousX: number | undefined, previousDelta = 0;
    for (let now = 1000; now < 2450; now += 1000 / 60) {
      while (index < packets.length && packets[index].arrival <= now) { timeline.push(packets[index].frame, packets[index].arrival); index++; }
      const frame = timeline.sample(now); if (!frame) continue;
      const x = frame.friends!.vehicles[0].x;
      if (previousX !== undefined && now > 1200) { const delta = x - previousX; expect(delta).toBeGreaterThan(2.5); expect(delta).toBeLessThan(3.5); expect(Math.abs(delta - previousDelta)).toBeLessThan(.6); previousDelta = delta; }
      else previousDelta = 3;
      previousX = x;
    }
  });
});
