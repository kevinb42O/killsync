import type { FishingCast } from '../multiplayer/FriendsFishing';
import { FISHING_CHARGE_MS, fishingCastPower } from '../multiplayer/FriendsFishing';

export type FishingRodPose = { pitch:number; lift:number; draw:number; flex:number };
const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};

/** +Y is the shaft and -Z is forward. Positive pitch draws the tip back.
 * Reuse the caller's pose: no animation objects, bones or extra draws. */
export function fishingRodPose(out:FishingRodPose,heldMs:number|undefined,cast:FishingCast|undefined,now:number,tension=0){
  out.pitch=-.48;out.lift=0;out.draw=0;out.flex=.04+tension*.26;
  if(heldMs!==undefined){
    const power=fishingCastPower(heldMs),back=smooth(heldMs/450);
    out.pitch+=back*(.78+power*.18);out.lift=.12*back;out.draw=.10*back;
    // Loading comes from moving the rod, not holding a stationary rod forever.
    out.flex=.04+Math.sin(back*Math.PI)*.32;
  }else if(cast&&cast.phase!=='reeling'&&now-(cast.castAt??cast.atMs)<800){
    const power=cast.castPower??0,held=power*FISHING_CHARGE_MS,back=smooth(held/450);
    const age=Math.max(0,now-(cast.castAt??cast.atMs)),stroke=smooth(age/180),settle=smooth((age-220)/580);
    const start=-.48+back*(.78+power*.18),forward=-.78-power*.22;
    out.pitch=(start+(forward-start)*stroke)*(1-settle)-.48*settle;
    out.lift=(.12*back*(1-stroke)+.035*stroke)*(1-settle);out.draw=.10*back*(1-stroke);
    // Tip lags the accelerating forward stroke, springs through release, then
    // damps to rest. The baked reel-to-tip filament follows the same morph.
    out.flex=(.04+Math.sin(back*Math.PI)*.32)*(1-stroke)
      -.38*Math.sin(stroke*Math.PI)*(1-settle)
      +.04*settle+(age>=180?.30*Math.exp(-(age-180)/170)*Math.sin((age-180)/65):0);
  }else if(cast?.phase==='bite'){
    out.pitch-=.12*Math.sin(now*.023);out.flex=.75+Math.sin(now*.018)*.15;
  }else if(cast?.phase==='reeling'){
    const grip=smooth((now-cast.atMs)/250);
    out.pitch-=grip*(.10+.012*Math.sin(now*.011));
    out.flex=cast.empty?.10+.025*Math.sin(now*.011):.5+.08*Math.sin(now*.011);
  }
  return out;
}
