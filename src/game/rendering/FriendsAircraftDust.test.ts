import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import { FriendsAircraftDust } from './FriendsAircraftDust';
import type { FriendsVehicle } from '../multiplayer/FriendsExpedition';
const aircraft:FriendsVehicle={id:'sunskiff',kind:'aircraft',x:8000,y:8000,z:114,groundZ:0,angle:0,length:280,width:160,pilotId:'host'};
describe('helicopter dust budget',()=>{
  it('reuses a fixed pool, bursts on contact, and fades after leaving',()=>{
    const group=new THREE.Group(),dust=new FriendsAircraftDust(group),positions=dust.points.geometry.getAttribute('position');
    dust.update(aircraft,0);dust.update(aircraft,50);expect(dust.points.visible).toBe(false);
    dust.update({...aircraft,z:14},100);expect(dust.points.visible).toBe(true);
    const life=dust.points.geometry.getAttribute('life');expect(Array.from(life.array).filter(n=>n>0).length).toBeGreaterThanOrEqual(24);
    for(let t=150;t<10000;t+=50)dust.update({...aircraft,z:14},t);
    expect(positions.count).toBe(96);expect(dust.points.geometry.getAttribute('position')).toBe(positions);expect(group.children).toHaveLength(1);
    for(let t=10000;t<12500;t+=50)dust.update(undefined,t);expect(dust.points.visible).toBe(false);
  });
  it('stays quiet for parked and high altitude aircraft',()=>{
    const dust=new FriendsAircraftDust(new THREE.Group());
    for(let t=0;t<2000;t+=25)dust.update({...aircraft,z:14,pilotId:undefined},t);expect(dust.points.visible).toBe(false);
    for(let t=2000;t<4000;t+=25)dust.update({...aircraft,z:1000},t);expect(dust.points.visible).toBe(false);
  });
});
