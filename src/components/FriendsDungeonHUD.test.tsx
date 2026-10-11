import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {FriendsSimulation} from '../game/multiplayer/FriendsSimulation';
import {CAVE_TREASURES} from '../game/world/FriendsCave';
import {FriendsHUD} from './FriendsHUD';
describe('dungeon discovery reach prompt',()=>{
 it('hides recovery behind a built wall and restores it when that wall is removed',()=>{
  const snapshot=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]).createSnapshot(),reward=CAVE_TREASURES.find(t=>t.id==='descent-forge-cache')!,player=snapshot.players[0];
  Object.assign(player,{x:reward.x-96,y:reward.y,z:reward.z});
  snapshot.friends!.building!.pieces=[{id:1,x:reward.x-48,y:reward.y,z:reward.z,rotation:1,shape:'wall',finish:'teal',author:'host',revision:1}];
  const blocked=renderToStaticMarkup(<FriendsHUD snapshot={snapshot} player={player} interactionLabel="F"/>);
  expect(blocked).not.toContain('Recover Master Forge Tools');
  snapshot.friends!.building!.pieces=[];
  const clear=renderToStaticMarkup(<FriendsHUD snapshot={snapshot} player={player} interactionLabel="F"/>);
  expect(clear).toContain('Recover Master Forge Tools');
 });
});
