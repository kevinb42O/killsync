import { describe,expect,it } from 'vitest';
import { FriendsResidentPath, smoothResidentPath, type ResidentProbe } from './FriendsResidentNavigation';

describe('resident path tracing',()=>{
  it('removes staircase turns while preserving a blocked corner',()=>{
    const points=[{x:32,y:0,z:0},{x:32,y:32,z:0},{x:64,y:32,z:0},{x:64,y:64,z:0}];
    expect(smoothResidentPath({x:0,y:0,z:0},points,(x,y)=>({x,y,z:0}))).toEqual([points[3]]);
    const blocked=smoothResidentPath({x:0,y:0,z:0},points,(x,y,from)=>
      from.x===0&&y>0?undefined:{x,y,z:0});
    expect(blocked[0]).toEqual(points[0]);expect(blocked.at(-1)).toEqual(points[3]);
  });
  it('finds a detour around a wall within the per-tick planning budget',()=>{
    const probe:ResidentProbe=(x,y)=>x>=48&&x<=80&&Math.abs(y)<80?undefined:{x,y,z:0};
    const path=new FriendsResidentPath({x:0,y:0,z:0},{x:160,y:0},probe);
    while(path.status==='searching') {
      const before=path.expansions;path.step(4);expect(path.expansions-before).toBeLessThanOrEqual(4);
    }
    expect(path.status).toBe('found');expect(path.points.at(-1)).toEqual({x:160,y:0,z:0});
    expect(path.points.some(p=>Math.abs(p.y)>=80)).toBe(true);
    expect(path.points.some(p=>p.x>=48&&p.x<=80&&Math.abs(p.y)<80)).toBe(false);
  });
  it('gives up a disconnected destination instead of endlessly planning or teleporting',()=>{
    const path=new FriendsResidentPath({x:0,y:0,z:0},{x:160,y:0},()=>undefined);
    path.step();expect(path.status).toBe('unreachable');expect(path.points).toEqual([]);
    expect(path.expansions).toBe(1);
  });
  it('checks edge midpoints so narrow obstacles cannot be skipped between grid cells',()=>{
    const path=new FriendsResidentPath({x:0,y:0,z:0},{x:96,y:0},(x,y)=>
      x===16?undefined:{x,y,z:0});
    for(let i=0;i<100&&path.status==='searching';i++)path.step();
    expect(path.status).toBe('unreachable');
  });
});
