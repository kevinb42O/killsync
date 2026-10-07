import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FriendsSimulation } from '../game/multiplayer/FriendsSimulation';
import { FRIENDS_DELIVERY_BAY as goal } from '../game/world/FriendsHaulingGoal';
import { FriendsHUD } from './FriendsHUD';
import { FriendsMap } from './FriendsMap';

describe('hauling goal guidance',()=>{
  it('keeps the screen clear while the atlas carries the hauling goal and route',()=>{
    const snapshot=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]).createSnapshot(),player=snapshot.players[0];
    const hud=renderToStaticMarkup(<FriendsHUD snapshot={snapshot} player={player} interactionLabel="F"/>);
    expect(hud).not.toContain('friends-hud');expect(hud).not.toContain('OPEN FRONTIER');expect(hud).not.toContain('survey sites');expect(hud).not.toContain('GOAL · HAUL');
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
