import {describe,it,expect} from 'vitest';
import {stepCraneSway,craneCableDrop} from './FriendsCraneSway';
describe('lightweight crane pendulum',()=>{
  it('lags acceleration, swings through center and responds to braking',()=>{
    let s=stepCraneSway({x:0,y:0,vx:0,vy:0},200,.025,false,100,0);
    expect(s.x).toBeLessThan(0);let crossed=false;
    for(let i=0;i<160;i++){s=stepCraneSway(s,200,.025,false);if(s.x>0)crossed=true;}
    expect(crossed).toBe(true);
    const braked=stepCraneSway(s,200,.025,false,-100,0);expect(braked.vx).toBeGreaterThan(s.vx+80);
  });
  it('settles faster with stabilization and sleeps at rest',()=>{
    let natural={x:50,y:20,vx:0,vy:0},steady={...natural};
    for(let i=0;i<240;i++){natural=stepCraneSway(natural,200,.025,false);steady=stepCraneSway(steady,200,.025,true);}
    expect(Math.hypot(steady.x,steady.y,steady.vx,steady.vy)).toBeLessThan(Math.hypot(natural.x,natural.y,natural.vx,natural.vy)*.1);
    for(let i=0;i<1200;i++)steady=stepCraneSway(steady,200,.025,true);
    expect(steady).toEqual({x:0,y:0,vx:0,vy:0});
  });
  it('bounds extreme impulses and keeps the geometric cable length for giant cranes',()=>{
    for(const length of [12,86,1000,6144]){
      let s={x:0,y:0,vx:0,vy:0};for(let i=0;i<500;i++)s=stepCraneSway(s,length,.1,false,500,-500);
      expect(Math.hypot(s.x,s.y)).toBeLessThanOrEqual(Math.min(192,length*Math.sin(Math.PI/7))+.001);
      expect(Math.hypot(s.vx,s.vy)).toBeLessThanOrEqual(280.001);
      expect(Math.hypot(s.x,s.y,craneCableDrop(length,s.x,s.y))).toBeCloseTo(length,6);
    }
  });
  it('produces comparable motion at different host tick rates',()=>{
    const run=(dt:number)=>{let s={x:30,y:5,vx:80,vy:10};for(let t=0;t<2000;t+=dt)s=stepCraneSway(s,200,dt/1000,false);return s;};
    const a=run(20),b=run(50);expect(Math.abs(a.x-b.x)).toBeLessThan(.6);expect(Math.abs(a.y-b.y)).toBeLessThan(.2);
  });
});
