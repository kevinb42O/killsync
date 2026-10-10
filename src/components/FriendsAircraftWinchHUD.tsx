import {ArrowDown,ArrowUp,Anchor} from 'lucide-react';
import {CraneHoldButton} from './FriendsCraneControls';
import {aircraftWinchBindings,type AircraftWinchState} from '../game/multiplayer/FriendsAircraftWinch';
import type {ControlScheme} from '../game/controls';
import './friends-aircraft-winch.css';
export function FriendsAircraftWinchHUD({state,scheme,touch,onHold}:{state:AircraftWinchState;scheme:ControlScheme;touch:boolean;onHold:(control:'raise'|'lower'|'hook',held:boolean)=>void}){
  const keys=aircraftWinchBindings(scheme),status=state.blocked?state.blockedReason??'Obstructed':state.length===0?'Hook stowed':state.mode==='raise'?'Reeling in':state.mode==='lower'?'Paying out':'Brake engaged';
  return <section className="aircraft-winch-hud" aria-label="Helicopter winch" onMouseDown={e=>e.stopPropagation()}>
    <header><Anchor size={17}/><strong>SUNSKIFF WINCH</strong><b>{(state.length/12).toFixed(1)}<small> m</small></b></header>
    <div className="aircraft-winch-status"><span>{status}</span><span>{state.cargoId?`Load connected · ${(state.swayAngle??0).toFixed(1)}° sway`:'Hook free'}</span></div>
    {touch?<div className="aircraft-winch-buttons">{(['raise','lower','hook'] as const).map(control=><span key={control} className="aircraft-winch-button"><CraneHoldButton craneId={-1} onStart={()=>onHold(control,true)} onStop={()=>onHold(control,false)}>{control==='raise'?<ArrowUp size={17}/>:control==='lower'?<ArrowDown size={17}/>:<Anchor size={17}/>}<strong>{control==='raise'?'Retract':control==='lower'?'Extend':state.cargoId?'Hold to release':'Connect'}</strong></CraneHoldButton></span>)}</div>:<p><kbd>{keys.raise.toUpperCase()||'—'}</kbd> Retract <kbd>{keys.lower.toUpperCase()||'—'}</kbd> Extend <kbd>V</kbd> {state.cargoId?'Hold to release':'Connect load'}</p>}
    {Boolean(state.releaseProgress)&&<div className="aircraft-winch-release" role="progressbar" aria-label="Release load" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((state.releaseProgress??0)*100)}><span style={{width:`${(state.releaseProgress??0)*100}%`}}/>Releasing load…</div>}
  </section>;
}
