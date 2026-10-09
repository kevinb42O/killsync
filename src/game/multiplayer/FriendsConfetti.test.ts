import { describe, expect, it } from 'vitest';
import { CONFETTI_TOOL, FriendsConfetti } from './FriendsConfetti';
import { ROWBOAT_ID, OPPOSITE_ROWBOAT_ID } from '../world/FriendsFishingDock';
import { MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';

const input=(fireActionId:number):MultiplayerInputFrame=>({type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:fireActionId,clientTime:0,movement:0,aimAngle:0,aimPitch:32768,selectedSlot:0,friendsTool:CONFETTI_TOOL,firing:true,fireActionId,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false});
const player={id:'host',x:100,y:200,z:32,lifeState:'alive'};

describe('shared confetti',()=>{
  it.each([ROWBOAT_ID,OPPOSITE_ROWBOAT_ID])('consumes rowing presses in %s without bursting on dismount',vehicleId=>{
    const confetti=new FriendsConfetti(),command=input(1);
    confetti.update(50,[{...player,friendsSeat:{vehicleId,index:0}}],new Map([[player.id,command]]));
    expect(confetti.snapshot()).toBeUndefined();
    confetti.update(100,[player],new Map([[player.id,command]]));
    expect(confetti.snapshot()).toBeUndefined();
    confetti.update(150,[player],new Map([[player.id,input(2)]]));
    expect(confetti.snapshot()?.bursts).toHaveLength(1);
  });
  it('bounds rapid clicks, ignores held/replayed input, and expires events',()=>{
    const confetti=new FriendsConfetti();
    for(let now=50;now<=10000;now+=50)confetti.update(now,[player],new Map([[player.id,input(now/50)]]));
    expect(confetti.snapshot()!.bursts.length).toBeLessThanOrEqual(20);
    const latest=confetti.snapshot()!.bursts.at(-1)!;
    confetti.update(10050,[player],new Map([[player.id,input(200)]]));
    expect(confetti.snapshot()!.bursts.at(-1)).toEqual(latest);
    confetti.update(14000,[player],new Map([[player.id,input(200)]]));
    expect(confetti.snapshot()).toBeUndefined();
  });
});
