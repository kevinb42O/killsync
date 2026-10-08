import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, RotateCcw, RotateCw, Camera, Link2, Pause, Unlink, X } from 'lucide-react';
import { CRANE_MAX_LENGTH, CRANE_MIN_LENGTH, type FriendsCraneState } from '../game/multiplayer/FriendsCrane';
import { DEFAULT_CRANE_CAMERA, type CraneCameraOptions } from '../game/multiplayer/FriendsCraneCamera';
import type { FrontierRequest } from '../game/multiplayer/FriendsFrontier';
import './friends-crane.css';


/** Each axis brakes on release, including a release outside the button. */
function CraneHoldButton({craneId,disabled,onStart,onStop,children}:{
  craneId:number;disabled?:boolean;onStart:()=>void;onStop:()=>void;children:ReactNode;
}) {
  const held=useRef<{pointerId?:number;key?:string;stop:()=>void}|null>(null);
  const [holding,setHolding]=useState(false);
  const stop=useCallback(()=>{
    const active=held.current;if(!active)return;
    held.current=null;setHolding(false);active.stop();
  },[]);
  useEffect(()=>{
    const visibility=()=>{if(document.visibilityState!=='visible')stop();};
    window.addEventListener('blur',stop);document.addEventListener('visibilitychange',visibility);
    return()=>{window.removeEventListener('blur',stop);document.removeEventListener('visibilitychange',visibility);stop();};
  },[craneId,stop]);
  useEffect(()=>{if(disabled)stop();},[disabled,stop]);
  return <button type="button" className="crane-hold-button" disabled={disabled} data-held={holding} title="Hold to move · release to stop"
    onPointerDown={event=>{
      if(event.button!==0||disabled||held.current)return;
      event.preventDefault();event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      held.current={pointerId:event.pointerId,stop:onStop};setHolding(true);onStart();
    }}
    onPointerUp={event=>{if(held.current?.pointerId===event.pointerId)stop();}}
    onPointerCancel={event=>{if(held.current?.pointerId===event.pointerId)stop();}}
    onLostPointerCapture={event=>{if(held.current?.pointerId===event.pointerId)stop();}}
    onKeyDown={event=>{
      if(event.key!==' '&&event.key!=='Enter')return;
      event.preventDefault();event.stopPropagation();
      if(disabled||event.repeat||held.current)return;
      held.current={key:event.key,stop:onStop};setHolding(true);onStart();
    }}
    onKeyUp={event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();event.stopPropagation();if(held.current?.key===event.key)stop();}}}
    onBlur={()=>{if(held.current?.key)stop();}}
    onContextMenu={event=>event.preventDefault()}
  >{children}</button>;
}

export function FriendsCraneControls({crane,onRequest,onClose,message,localId,operatorName,onCameraChange}:{
  crane:FriendsCraneState;onRequest:(request:Omit<FrontierRequest,'requestId'>)=>void;onClose:()=>void;message?:string|null;
  localId?:string;operatorName?:string;onCameraChange?:(options:CraneCameraOptions)=>void;
}) {
  const panel=useRef<HTMLElement>(null),requestRef=useRef(onRequest);requestRef.current=onRequest;
  const [camera,setCamera]=useState(DEFAULT_CRANE_CAMERA);
  useEffect(()=>{const before=document.activeElement as HTMLElement|null;panel.current?.querySelector<HTMLButtonElement>('[data-brake]')?.focus();return()=>{if(before?.isConnected)before.focus();};},[]);
  useEffect(()=>{const timer=window.setInterval(()=>requestRef.current({action:'crane_heartbeat',pieceId:crane.pieceId}),1000);return()=>window.clearInterval(timer);},[crane.pieceId]);
  const changeCamera=(next:CraneCameraOptions)=>{setCamera(next);onCameraChange?.(next);};
  const request=(action:FrontierRequest['action'])=>onRequest({action,pieceId:crane.pieceId});
  const rotating=Boolean(crane.armMode&&crane.armMode!=='hold'),hasWinch=crane.hasWinch!==false;
  const otherOperator=Boolean(crane.operatorId&&localId&&crane.operatorId!==localId);
  const status=crane.blocked?`${crane.blockedReason??'Travel obstructed'} · brake engaged`:rotating&&crane.mode!=='hold'?'Rotating and lifting':rotating?'Rotating arm':crane.mode==='raise'?'Raising load':crane.mode==='lower'?'Lowering load':'Brake engaged';
  return <div className="friends-crane-overlay" onMouseDown={e=>e.stopPropagation()}>
    <section ref={panel} className="friends-crane-dialog" role="dialog" aria-modal="true" aria-labelledby="crane-control-title" onKeyDown={e=>{
      if(e.key!=='Tab')return;
      const buttons=[...panel.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],first=buttons[0],last=buttons.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }}>
      <div className="friends-crane-live-view" aria-label="Live view of crane load">
        <div className="crane-camera-label"><Camera size={16}/><strong>{camera.mode==='load'?'LOAD CAMERA':'WHOLE CRANE'}</strong><span>LIVE</span></div>
        <div className="crane-camera-reticle" aria-hidden="true"/>
        <div className="crane-camera-tools"><button type="button" onClick={()=>changeCamera({...camera,mode:camera.mode==='load'?'overview':'load'})}>{camera.mode==='load'?'View whole crane':'Follow load'}</button><button type="button" aria-label="Orbit camera left" onClick={()=>changeCamera({...camera,orbit:camera.orbit+Math.PI/4})}><RotateCcw size={16}/></button><button type="button" aria-label="Orbit camera right" onClick={()=>changeCamera({...camera,orbit:camera.orbit-Math.PI/4})}><RotateCw size={16}/></button><button type="button" aria-label="Move camera closer" disabled={camera.distance<=160} onClick={()=>changeCamera({...camera,distance:Math.max(160,camera.distance/1.3)})}>+</button><button type="button" aria-label="Move camera farther" disabled={camera.distance>=1600} onClick={()=>changeCamera({...camera,distance:Math.min(1600,camera.distance*1.3)})}>−</button><button type="button" onClick={()=>changeCamera({...camera,light:!camera.light})}>{camera.light?'Camera light on':'Camera light off'}</button></div>
      </div>
      <div className="friends-crane-controls">
      <header><div><small>SUNLINE WORKS · FREIGHT HANDLING</small><h2 id="crane-control-title">Freight crane</h2></div><button type="button" aria-label="Close crane controls" onClick={onClose}><X size={20}/></button></header>
      <div className="friends-crane-status"><i className={crane.mode==='hold'&&!rotating?'':'running'}/><div><strong>{status}</strong><span>{!hasWinch?'Attach a winch to the free arm socket':crane.cargoId?'Salvage core connected':'Hook free · align above the cargo'}</span></div><b>{hasWinch?(crane.length/12).toFixed(1):'—'}<small>m cable</small></b></div>
      <div className="friends-crane-travel"><span style={{width:`${Math.max(2,100*(1-crane.length/CRANE_MAX_LENGTH))}%`}}/></div>
      {crane.angle!==undefined&&<><div className="crane-axis-label"><strong>ARM ROTATION</strong><span>{((crane.rotation*90+crane.angle*180/Math.PI+360)%360).toFixed(0)}° · {crane.memberCount??0} arm pieces</span></div><div className="friends-crane-buttons crane-rotation"><CraneHoldButton craneId={crane.pieceId} disabled={otherOperator} onStart={()=>request('crane_left')} onStop={()=>request('crane_stop_arm')}><RotateCcw size={21}/><strong>Rotate left</strong></CraneHoldButton><button type="button" className="crane-brake" onClick={()=>request('crane_stop_arm')}><Pause size={21}/><strong>Hold arm</strong></button><CraneHoldButton craneId={crane.pieceId} disabled={otherOperator} onStart={()=>request('crane_right')} onStop={()=>request('crane_stop_arm')}><RotateCw size={21}/><strong>Rotate right</strong></CraneHoldButton></div><div className="crane-axis-label"><strong>WINCH</strong><span>Vertical lift</span></div></>}
      <div className="friends-crane-buttons"><CraneHoldButton craneId={crane.pieceId} disabled={otherOperator||!hasWinch||crane.length<=CRANE_MIN_LENGTH} onStart={()=>request('crane_raise')} onStop={()=>request('crane_hold')}><ArrowUp size={22}/><strong>Raise</strong><small>Hold to lift</small></CraneHoldButton><button type="button" className="crane-brake" disabled={!hasWinch} onClick={()=>request('crane_hold')}><Pause size={22}/><strong>Stop / hold</strong><small>Hold cable</small></button><CraneHoldButton craneId={crane.pieceId} disabled={otherOperator||!hasWinch||crane.length>=CRANE_MAX_LENGTH} onStart={()=>request('crane_lower')} onStop={()=>request('crane_hold')}><ArrowDown size={22}/><strong>Lower</strong><small>Hold to lower</small></CraneHoldButton></div>
      <button type="button" data-brake className="crane-stop-all" onClick={()=>request('crane_stop_all')}><Pause size={18}/>Stop all · hold load and arm</button>
      <div className="friends-crane-connection"><button type="button" disabled={otherOperator||!hasWinch||Boolean(crane.cargoId)} onClick={()=>request('crane_connect')}><Link2 size={18}/>Connect load</button><button type="button" disabled={otherOperator||!crane.cargoId} onClick={()=>request('crane_release')}><Unlink size={18}/>Release load</button></div>
      <div className="crane-operator"><span>{otherOperator?`${operatorName??'A teammate'} has the controls`:crane.operatorId?'You have the controls':'Controls available'}</span>{otherOperator&&<button type="button" onClick={()=>request('crane_takeover')}>Take controls</button>}</div>
      {message&&<p className="friends-crane-feedback" role="status">{message}</p>}
      <p className="friends-crane-help">Align the hook above a settled core and lower it, then connect. A crew member beside the hook can press F to connect or disconnect without taking your controls. Hold a direction button to move; release it to brake that axis. Arm and winch can run together. Stop all or close this menu to brake both motors. Releasing an unsupported load lets it fall.</p>
      <footer><span>Shared controls · solo or crew</span><button type="button" onClick={onClose}>Return · Esc</button></footer>
      </div>
    </section>
  </div>;
}
