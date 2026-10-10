import { useEffect, useRef } from 'react';
import { FISHING_CHARGE_MS, fishingCastPower } from '../game/multiplayer/FriendsFishing';

/** Pointer capture keeps a touch hold alive while aiming with the other thumb. */
export function FriendsFishingControls({ primaryLabel, secondaryLabel, primaryKey, secondaryKey, chargeMs, onPrimary, onSecondary }: {
  primaryLabel:string; secondaryLabel:string; primaryKey:string; secondaryKey:string; chargeMs?:number;
  onPrimary:(held:boolean)=>void; onSecondary:()=>void;
}) {
  const pointer=useRef<number|undefined>(undefined),held=useRef(false),callbacks=useRef({onPrimary,onSecondary});callbacks.current={onPrimary,onSecondary};
  const press=()=>{if(!held.current){held.current=true;callbacks.current.onPrimary(true);}};
  const release=(cancel=false)=>{if(held.current){held.current=false;pointer.current=undefined;if(cancel)callbacks.current.onSecondary();callbacks.current.onPrimary(false);}};
  useEffect(()=>()=>{if(held.current){callbacks.current.onSecondary();callbacks.current.onPrimary(false);}},[]);
  return <>
    <button type="button" className="friends-fishing-cast" onPointerDown={event=>{if(event.button!==0||held.current)return;event.preventDefault();pointer.current=event.pointerId;event.currentTarget.setPointerCapture(event.pointerId);press();}}
      onPointerUp={event=>{if(pointer.current!==event.pointerId)return;event.preventDefault();release();if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
      onPointerCancel={event=>{if(pointer.current===event.pointerId)release(true);}} onLostPointerCapture={event=>{if(pointer.current===event.pointerId)release(true);}} onBlur={()=>release(true)}
      onKeyDown={event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();event.stopPropagation();press();}}}
      onKeyUp={event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();event.stopPropagation();release();}}}
      onClick={event=>{if(event.detail===0&&!held.current){press();release();}}}>
      <kbd>{primaryKey}</kbd>{primaryLabel}
    </button>
    <button type="button" onClick={onSecondary}><kbd>{secondaryKey}</kbd>{secondaryLabel}</button>
    {chargeMs!==undefined&&<progress className="friends-fishing-power" aria-label="Casting power" max={FISHING_CHARGE_MS} value={fishingCastPower(chargeMs)*FISHING_CHARGE_MS}/>}
  </>;
}
