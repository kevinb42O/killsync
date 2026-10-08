import { describe, expect, it } from 'vitest';
import { FriendsTerrain, FRIENDS_STEP_HEIGHT } from '../world/FriendsTerrain';
import { FRIENDS_BUILD_CATALOG, friendsWalkFloor, friendsInclineConnects, friendsBuildCeiling, resolveFriendsBuildCollisions, type FriendsBuildPiece, type FriendsBuildShape } from './FriendsBuilding';
import { advancePlayerMovement, COOP_PLAYER_RADIUS, type PlayerMotionState } from './playerMovement';
import { FriendsSimulation } from './FriendsSimulation';
import { LocalPlayerPrediction } from './LocalPlayerPrediction';
import { FriendsFrontier, frontierTrees } from './FriendsFrontier';
import { MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';

const shapes=['voxel_ramp','ramp','long_ramp','roof','voxel_stairs','stairs'] as const;
function fixture(shape:FriendsBuildShape,rotation:number,landing:'flush'|'lip'|'terrain'|'high',lane=0){
  const terrain=new FriendsTerrain(),def=FRIENDS_BUILD_CATALOG[shape],angle=rotation*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
  const at=(x:number,y=0)=>({x:12000+c*x-s*y,y:12000+s*x+c*y});
  const end=def.w*4,height=def.h*4,top=height+(landing==='lip'?8:landing==='high'?16:0);
  for(let x=-128;x<=end+256;x+=128)terrain.addGrade([at(x).x,at(x).y,0,256]);
  const pieces:FriendsBuildPiece[]=Array.from({length:4},(_,i)=>({id:i+1,...at(def.w*(i+.5)),z:def.h*i,rotation,shape,finish:'stone',author:'Host',revision:1}));
  if(landing==='terrain'){
    for(let x=end+16;x<end+192;x+=32)for(let y=-80;y<=80;y+=32){const p=at(x,y);for(let z=0;z<height;z+=32)terrain.set(Math.floor(p.x/32),Math.floor(p.y/32),z/32,2);}
  }else for(let x=end+32;x<end+192;x+=64)for(let y=-64;y<=64;y+=64)pieces.push({id:pieces.length+1,...at(x,y),z:top-64,rotation,shape:'cube',finish:'stone',author:'Host',revision:1});
  const player:PlayerMotionState={...at(-10,lane),z:0,angle,sprinting:false,sliding:false,crouching:false,verticalVelocity:0,lastJumpSequence:-1,slideAngle:angle};
  const move=(sequence:number,mode:'walk'|'sprint'|'crouch'='walk')=>{
    const input:MultiplayerInputFrame={type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence,clientTime:0,movement:1,aimAngle:Math.round(angle/(Math.PI*2)*65535),aimPitch:32768,selectedSlot:0,firing:false,sprinting:mode==='sprint',sliding:mode==='crouch',reviving:false,jumpPressed:false,dashPressed:false};
    advancePlayerMovement(player,input,1000/30,(point,radius)=>{
      const ground=terrain.collide(point,player.z,radius,50,FRIENDS_STEP_HEIGHT,(x,y,top)=>friendsInclineConnects(pieces,point,player.z,x,y,top));return resolveFriendsBuildCollisions(pieces,point,player.z,radius)||ground;
    },undefined,point=>Math.max(terrain.floor(point.x,point.y,player.z)??-Infinity,friendsWalkFloor(pieces,point.x,point.y,player.z,COOP_PLAYER_RADIUS,terrain)??-Infinity),'friends_frontier',{
      elevationAware:true,volumetric:true,ceiling:6000,stepHeight:FRIENDS_STEP_HEIGHT,
      overhead:point=>Math.min(terrain.ceiling(point.x,point.y,point.z)??Infinity,friendsBuildCeiling(pieces,point.x,point.y,point.z)??Infinity),
    });
  };
  return {player,move,end,height,top,pieces,terrain,at,angle,along:()=> (player.x-12000)*c+(player.y-12000)*s};
}
describe('player walking over ramp crests without a rope',()=>{
  const cases=shapes.flatMap(shape=>['flush','lip','terrain'].flatMap(landing=>[0,1,2,3].flatMap(rotation=>['walk','sprint','crouch'].map(mode=>({shape,landing,rotation,mode}))))) as {shape:FriendsBuildShape;landing:'flush'|'lip'|'terrain';rotation:number;mode:'walk'|'sprint'|'crouch'}[];
  it.each(cases)('$shape / $landing / rotation $rotation / $mode',({shape,landing,rotation,mode})=>{
    const f=fixture(shape,rotation,landing);
    for(let i=1;i<=220&&f.along()<f.end+72;i++)f.move(i,mode);
    expect(f.along(),JSON.stringify({shape,landing,rotation,mode,player:f.player,end:f.end})).toBeGreaterThan(f.end+60);
    expect(f.player.z).toBeCloseTo(f.top,4);expect(f.player.lastJumpSequence).toBe(-1);
  });
  it.each(shapes)('steps from %s onto authored slabs and floor tiles',shape=>{
    for(const tile of ['slab','floor_tile'] as const){
      const f=fixture(shape,0,'flush'),def=FRIENDS_BUILD_CATALOG[tile];f.pieces.splice(4);
      for(let x=f.end+def.w/2;x<f.end+192;x+=def.w)for(let y=-def.d;y<=def.d;y+=def.d)f.pieces.push({id:f.pieces.length+1,...f.at(x,y),z:f.height,rotation:0,shape:tile,finish:'stone',author:'Host',revision:1});
      for(let i=1;i<=220&&f.along()<f.end+72;i++)f.move(i);
      expect(f.along()).toBeGreaterThan(f.end+60);expect(f.player.z).toBeCloseTo(f.height+8,4);
    }
  });
  it.each(shapes)('crosses the crest near both sides of %s',shape=>{
    for(const lane of [-1,1]){
      const f=fixture(shape,0,'lip',lane*FRIENDS_BUILD_CATALOG[shape].d*.3);
      for(let i=1;i<=220&&f.along()<f.end+72;i++)f.move(i);
      expect(f.along()).toBeGreaterThan(f.end+60);expect(f.player.z).toBeCloseTo(f.top,4);
    }
  });
  it.each(shapes)('keeps a 16-unit ledge solid at the top of %s',shape=>{
    const f=fixture(shape,0,'high');
    for(let i=1;i<=180;i++)f.move(i);
    expect(f.along()).toBeLessThan(f.end);expect(f.player.z).toBeLessThan(f.top);
  });
  it.each(shapes)('keeps a disconnected landing face solid beyond %s',shape=>{
    const f=fixture(shape,0,'flush');
    for(const p of f.pieces.slice(4))p.x+=32;
    const point=f.at(f.end+32-COOP_PLAYER_RADIUS+1);
    expect(resolveFriendsBuildCollisions(f.pieces,point,f.height-16,COOP_PLAYER_RADIUS)).toBe(true);
    expect(point.x).toBeLessThanOrEqual(f.at(f.end+32-COOP_PLAYER_RADIUS).x+.00001);
  });
  it.each([{shape:'long_ramp',landing:'lip',rotation:1},{shape:'voxel_ramp',landing:'terrain',rotation:2},{shape:'stairs',landing:'lip',rotation:3}] as const)('host and predicted player cross $shape / $landing together',({shape,landing,rotation})=>{
    const f=fixture(shape,rotation,landing),frontier=new FriendsFrontier().snapshot();
    frontier.terrain=f.terrain.snapshot();
    for(let x=22;x<=26;x++)for(let y=22;y<=26;y++)frontier.harvested.push(...frontierTrees(x,y).map(t=>t.id));
    const host=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}],1,undefined,{revision:1,guestsCanBuild:true,pieces:f.pieces},undefined,frontier);
    const player=host['players'].get('host')!;Object.assign(player,f.player);
    const prediction=new LocalPlayerPrediction('host');prediction.reconcile(host.createSnapshot());
    let last:MultiplayerInputFrame;
    for(let i=1;i<=90;i++){
      const along=(player.x-12000)*Math.cos(f.angle)+(player.y-12000)*Math.sin(f.angle);
      last={type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:i,clientTime:0,movement:along<f.end+72?1:0,aimAngle:Math.round(f.angle/(Math.PI*2)*65535),aimPitch:32768,selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false};
      prediction.step(last);host.setInput('host',last);host.tick(1000/30);
      const snapshot=host.createSnapshot(),shown=prediction.present(snapshot,last,0,0).players.find(p=>p.id==='host')!;
      expect(shown.x).toBeCloseTo(player.x,5);expect(shown.y).toBeCloseTo(player.y,5);expect(shown.z).toBeCloseTo(player.z,5);
      if(i%6===0)prediction.reconcile(snapshot);
    }
    const frame=host.createSnapshot(),predicted=prediction.present(frame,last!,0,0).players.find(p=>p.id==='host')!;
    const along=(player.x-12000)*Math.cos(f.angle)+(player.y-12000)*Math.sin(f.angle);
    expect(along).toBeGreaterThan(f.end+60);expect(player.z).toBe(f.top);
    expect(predicted.x).toBeCloseTo(player.x,5);expect(predicted.y).toBeCloseTo(player.y,5);expect(predicted.z).toBeCloseTo(player.z,5);
    expect(frame.friends!.hauling!.ropes).toHaveLength(0);
  });

});
