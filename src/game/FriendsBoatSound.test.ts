import { describe, expect, it } from 'vitest';
import { friendsBoatSound } from './FriendsBoatSound';
import type { FriendsVehicle } from './multiplayer/FriendsExpedition';
const listener={x:0,y:0,z:0};
const boat=(extra:Partial<FriendsVehicle>={}):FriendsVehicle=>({id:'boat',kind:'fishingBoat',x:80,y:0,z:0,angle:0,length:480,width:200,speed:0,moored:true,...extra});
describe('fishing boat recordings',()=>{
  it('keeps moored/released engines silent while water laps locally',()=>{
    const parked=friendsBoatSound([boat()],listener,0);
    expect(parked.boatEngine.volume).toBe(0);expect(parked.boatWater.volume).toBeGreaterThan(0);
    expect(friendsBoatSound([boat({speed:220,moored:false})],listener,0).boatEngine.volume).toBe(0);
    expect(friendsBoatSound([boat({pilotId:'a'})],listener,0).boatEngine.volume).toBe(0);
  });
  it('idles under helm control and increases pitch/volume with forward and reverse speed',()=>{
    const idle=friendsBoatSound([boat({pilotId:'a',moored:false})],listener,0);
    const moving=friendsBoatSound([boat({pilotId:'a',moored:false,speed:220})],listener,0);
    const reverse=friendsBoatSound([boat({pilotId:'a',moored:false,speed:-220})],listener,0);
    expect(idle.boatEngine.volume).toBeGreaterThan(0);
    expect(moving.boatEngine.volume).toBeGreaterThan(idle.boatEngine.volume);
    expect(moving.boatEngine.rate).toBeGreaterThan(idle.boatEngine.rate!);
    expect(moving.boatWater.volume).toBeGreaterThan(idle.boatWater.volume);
    expect(reverse).toEqual(moving);
  });
  it('uses 3D range, listener direction and underground silence',()=>{
    const boats=[boat({x:0,y:80,pilotId:'a',moored:false,speed:220})];
    const a=friendsBoatSound(boats,listener,0),b=friendsBoatSound(boats,listener,Math.PI);
    expect(a.boatEngine.pan).toBeCloseTo(-b.boatEngine.pan);
    for(const mix of [friendsBoatSound(boats,{...listener,z:3000},0),friendsBoatSound(boats,listener,0,true),friendsBoatSound([],listener,0)]){
      expect(mix.boatEngine.volume).toBe(0);expect(mix.boatWater.volume).toBe(0);
    }
    expect(friendsBoatSound([boat({pilotId:'a',moored:false,speed:NaN})],listener,0).boatEngine.rate).toBe(.85);
  });
});
