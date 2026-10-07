import { FriendsExpedition } from './FriendsExpedition';
import { FriendsSimulation } from './FriendsSimulation';
import { FriendsFrontier, frontierTrees } from './FriendsFrontier';
import type { FriendsBuildPiece } from './FriendsBuilding';
import type { CoopPlayerSeed } from './CoopSimulation';
export function railFixture(loop=false) {
  const pieces:FriendsBuildPiece[]=[];
  const add=(x:number,y:number,rotation:number,shape:FriendsBuildPiece['shape']='rail_straight')=>pieces.push({id:pieces.length+1,x,y,z:0,rotation,shape,finish:'timber',author:'Host',revision:1});
  // Keep this player-built line clear of the authored Grand Traverse tunnel
  // cover. Its protected roof correctly resists the fixture's flat grades.
  if(!loop)for(let i=0;i<28;i++)add(2944+i*256,10800,0);
  else {
    for(let i=0;i<4;i++)add(8384+i*256,6000,0);add(9408,6128,0,'rail_curve');
    for(let i=0;i<4;i++)add(9536,6384+i*256,1);add(9408,7408,1,'rail_curve');
    for(let i=0;i<4;i++)add(9152-i*256,7536,2);add(8128,7408,2,'rail_curve');
    for(let i=0;i<4;i++)add(8000,7152-i*256,3);add(8128,6128,3,'rail_curve');
  }
  const building={revision:1,guestsCanBuild:true,pieces},e=new FriendsExpedition(),transport=e.snapshot().transport!;
  transport.railTrain={anchor:1,distance:1000,direction:1,held:false};
  const frontier=new FriendsFrontier().snapshot();
  frontier.terrain.grades=pieces.map(p=>[p.x,p.y,0,512]);
  for(let x=4;x<21;x++)for(let y=8;y<22;y++)frontier.harvested.push(...frontierTrees(x,y).map(t=>t.id));
  return {building,transport,frontier};
}
export function railSimulation(seeds:CoopPlayerSeed[],loop=false) {const f=railFixture(loop);return new FriendsSimulation(seeds,1,undefined,f.building,undefined,f.frontier,f.transport);}
export function railExpedition(loop=false) {const f=railFixture(loop),e=new FriendsExpedition(undefined,f.transport);e.setRailway(f.building.pieces,1);return e;}
