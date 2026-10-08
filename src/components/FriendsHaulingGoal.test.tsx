import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FriendsSimulation } from '../game/multiplayer/FriendsSimulation';
import { FRIENDS_DELIVERY_BAY as goal } from '../game/world/FriendsHaulingGoal';
import { FriendsHUD } from './FriendsHUD';
import { haulingBearing } from './FriendsHaulingCompass';
import { FriendsMap } from './FriendsMap';

describe('hauling goal guidance',()=>{
  it('shows compact pickup guidance while the atlas carries the hauling goals and routes',()=>{
    const snapshot=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]).createSnapshot(),player=snapshot.players[0];
    const hud=renderToStaticMarkup(<FriendsHUD snapshot={snapshot} player={player} interactionLabel="F"/>);
    expect(hud).not.toContain('friends-hud');expect(hud).not.toContain('OPEN FRONTIER');expect(hud).not.toContain('survey sites');expect(hud).not.toContain('GOAL · HAUL');expect(hud).toContain('Pickup compass for Lantern core');expect(hud).toContain('NEXT PICKUP');
    const map=renderToStaticMarkup(<FriendsMap snapshot={snapshot} localPlayer={player} onClose={()=>{}}/>);
    expect(map).toContain('Your hauling goal');expect(map).toContain('Core to delivery route');
    expect(map).toContain('750m');expect(map).toContain('amber light column');expect(map).toContain('green square on the west side');expect(map).toContain('Full frontier');
  });
  it('shows the finish instruction beside a settled core and the shared completion afterwards',()=>{
    const snapshot=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]).createSnapshot(),player=snapshot.players[0];
    Object.assign(snapshot.friends!.hauling!.cargo[0],{x:goal.x,y:goal.y,z:goal.z});Object.assign(player,{x:goal.x+90,y:goal.y,z:goal.z});
    const ready=renderToStaticMarkup(<FriendsHUD snapshot={snapshot} player={player} interactionLabel="F"/>);
    expect(ready).toContain('Deliver core · Delivery Bay');expect(ready).not.toContain('friends-hud');
    snapshot.friends!.hauling!.delivered=true;
    const complete=renderToStaticMarkup(<FriendsHUD snapshot={snapshot} player={player} interactionLabel="F"/>);
    expect(complete).toContain('Delivery complete · core remains movable');expect(complete).not.toContain('friends-hud');
  });
});

describe('tethered cargo compass',()=>{
  it('uses the tethered load’s own destination and shows independent progress',()=>{
    const snapshot=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]).createSnapshot(),player=snapshot.players[0],haul=snapshot.friends!.hauling!;
    haul.completedCargoIds=['lantern-core'];
    haul.ropes=[{id:player.id,cargoId:'sanctum-core',anchorX:36,anchorY:0,anchorZ:26,length:120,tension:.6,blocked:false}];
    const hud=renderToStaticMarkup(<FriendsHUD snapshot={snapshot} player={player} interactionLabel="F"/>);
    expect(hud).toContain('Delivery compass for Sanctum core');expect(hud).toContain('TIDAL SANCTUM BAY');expect(hud).toContain('TETHERED');expect(hud).toContain('1/3');expect(hud).toContain('AHEAD');
    const map=renderToStaticMarkup(<FriendsMap snapshot={snapshot} localPlayer={player} onClose={()=>{}}/>);
    expect(map).toContain('CASTLE COURTYARD');expect(map).toContain('TIDAL SANCTUM BAY');expect(map).toContain('LOAD 3');
    haul.ropes=[];
    expect(renderToStaticMarkup(<FriendsHUD snapshot={snapshot} player={player} interactionLabel="F"/>)).toContain('Pickup compass for Watchfire core');
    haul.ropes=[{id:player.id,cargoId:'ridge-core',anchorX:36,anchorY:0,anchorZ:26,length:120,tension:0,blocked:false}];
    const castleMap=renderToStaticMarkup(<FriendsMap snapshot={snapshot} localPlayer={player} onClose={()=>{}}/>);
    expect(castleMap).toContain('Castle stairway to courtyard');expect(castleMap).toContain('STAIRWAY START');
  });
});


describe('compass bearings relative to the view',()=>{
  it.each([
    [{x:100,y:0},0], [{x:0,y:100},Math.PI/2],
    [{x:-100,y:0},Math.PI], [{x:0,y:-100},-Math.PI/2],
  ])('points correctly toward %j', (target,expected)=>{
    expect(haulingBearing({x:0,y:0,angle:0},target)).toBeCloseTo(expected);
  });
  it('keeps the forward bearing continuous across the heading wrap',()=>{
    expect(haulingBearing({x:0,y:0,angle:Math.PI*2-.01},{x:100,y:0})).toBeCloseTo(.01);
  });
});
