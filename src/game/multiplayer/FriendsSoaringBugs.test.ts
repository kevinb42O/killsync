import { describe,it,expect } from 'vitest';
import { advanceFriendsSoaring,createSoaringState } from './FriendsSoaring';
import { advancePlayerMovement,type PlayerMotionState,type PlayerMovementEnvironment } from './playerMovement';
import { MULTIPLAYER_PROTOCOL_VERSION,type MultiplayerInputFrame } from './protocol';
const frame=(extra:Partial<MultiplayerInputFrame>={}):MultiplayerInputFrame=>({type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:1,clientTime:0,movement:0,aimAngle:0,aimPitch:32767,selectedSlot:0,friendsTool:6,friendsGlider:true,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,...extra});
const actor=(extra:Partial<PlayerMotionState>={}):PlayerMotionState=>({x:1000,y:1000,z:1200,angle:0,sprinting:false,sliding:false,crouching:false,verticalVelocity:-15,lastJumpSequence:-1,slideAngle:0,friendsSoaring:{...createSoaringState(0),phase:'flying',inflation:1,airspeed:9.5},...extra});
const env:PlayerMovementEnvironment={elevationAware:true,volumetric:true,ceiling:6000,soaring:{timeMs:0,height:()=>0}};
describe('soaring bug regressions',()=>{
  it('does not equip below the floor as if grounded',()=>{const p=actor({z:-32,verticalVelocity:0,friendsSoaring:undefined});advanceFriendsSoaring(p,frame(),.01,env,undefined,()=>0);expect(p.friendsSoaring).toBeUndefined();});
  it('cannot jet-jump while a selected glider is blocked by overhead cover',()=>{const p=actor({z:0,verticalVelocity:0,friendsSoaring:undefined});advancePlayerMovement(p,frame({jumpPressed:true,jetHeld:true}),33,undefined,undefined,()=>0,'friends_frontier',{...env,overhead:()=>80});expect(p.z).toBe(0);expect(p.jetActive).toBeFalsy();});
  it('does not teleport a glider down when already above the altitude limit',()=>{const p=actor({z:8000});advanceFriendsSoaring(p,frame(),.05,env,undefined,()=>0);expect(p.z).toBeGreaterThan(7900);expect(p.z).toBeLessThan(8000);});
  it('keeps a physical descent after an airborne terrain collision instead of declaring a landing',()=>{const p=actor();advanceFriendsSoaring(p,frame(),.05,env,q=>q.x>1003,()=>0);expect(p.friendsSoaring.phase).toBe('collapsed');expect(p.verticalVelocity).toBeLessThan(0);});
  it('loses height through a collision and recovers only after clear air and released brakes',()=>{
    const p=actor(),e={...env,soaring:{...env.soaring,canopyBlocked:()=>true}};
    advanceFriendsSoaring(p,frame(),.01,e,undefined,()=>0);
    expect(p.friendsSoaring.phase).toBe('collapsed');
    for(let i=0;i<120;i++)advanceFriendsSoaring(p,frame({jetHeld:true}),1/120,env,undefined,()=>0);
    expect(p.friendsSoaring.phase).toBe('collapsed');expect(p.z).toBeLessThan(1200);
    const low=p.z;
    for(let i=0;i<280;i++)advanceFriendsSoaring(p,frame(),1/120,env,undefined,()=>0);
    expect(p.friendsSoaring.phase).toBe('flying');expect(p.z).toBeLessThan(low);
  });
  it('detects an obstacle at the wing leading edge away from the pilot center',()=>{
    const p=actor();advanceFriendsSoaring(p,frame(),.01,{...env,soaring:{...env.soaring,canopyBlocked:(x,y)=>x>p.x+15&&Math.abs(y-p.y)<2}},undefined,()=>0);
    expect(p.friendsSoaring.phase).toBe('collapsed');
  });
  it('keeps water entry stowed until the old held equip request is released',()=>{
    const p=actor({z:1,verticalVelocity:-40});
    advanceFriendsSoaring(p,frame(),.05,{...env,waterAt:()=>({level:0})},undefined,()=>-100);
    expect(p.friendsSoaring).toBeUndefined();expect(p.gliderNeedsStow).toBe(true);
    p.z=0;p.verticalVelocity=0;
    advanceFriendsSoaring(p,frame(),.1,env,undefined,()=>0);expect(p.friendsSoaring).toBeUndefined();
    advanceFriendsSoaring(p,frame({friendsGlider:false}),.1,env,undefined,()=>0);
    advanceFriendsSoaring(p,frame(),.1,env,undefined,()=>0);expect(p.friendsSoaring.phase).toBe('inflating');
  });
  it('reports zero clearance immediately on a real landing',()=>{const p=actor({z:1,verticalVelocity:-40});advanceFriendsSoaring(p,frame(),.05,env,undefined,()=>0);expect(p.z).toBe(0);expect(p.friendsSoaring.phase).toBe('landed');expect(p.friendsSoaring.agl).toBe(0);});
  it('can jump repeatedly after landing without changing the selected glider',()=>{
    const p=actor({z:1,verticalVelocity:-40});
    advancePlayerMovement(p,frame(),33,undefined,undefined,()=>0,'friends_frontier',env);
    expect(p.friendsSoaring.phase).toBe('landed');expect(p.z).toBe(0);
    for(const sequence of [2,3]){
      advancePlayerMovement(p,frame({sequence,jumpPressed:true}),33,undefined,undefined,()=>0,'friends_frontier',env);
      expect(p.z).toBeGreaterThan(0);expect(p.verticalVelocity).toBeGreaterThan(0);
      expect(p.lastJumpSequence).toBe(sequence);expect(p.friendsSoaring.phase).toBe('landed');
      for(let i=0;i<150&&p.z>0;i++)advancePlayerMovement(p,frame({sequence}),33,undefined,undefined,()=>0,'friends_frontier',env);
      expect(p.z).toBe(0);
    }
  });
  it('allows jumping while a water-entry wing awaits release of the old equip request',()=>{
    const p=actor({z:0,verticalVelocity:0,friendsSoaring:undefined,gliderNeedsStow:true});
    advancePlayerMovement(p,frame({jumpPressed:true}),33,undefined,undefined,()=>0,'friends_frontier',env);
    expect(p.z).toBeGreaterThan(0);expect(p.friendsSoaring).toBeUndefined();expect(p.gliderNeedsStow).toBe(true);
  });
});
