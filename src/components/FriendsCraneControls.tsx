import { CRANE_MAX_MAST_EXTENSION, CRANE_MAX_BOOM_EXTENSION } from '../game/multiplayer/FriendsTelescopicCrane';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, MoveHorizontal, Ruler, Gauge, RotateCcw, RotateCw, Camera, Link2, Pause, Unlink, X } from 'lucide-react';
import { CRANE_MAX_LENGTH, CRANE_MIN_LENGTH, type FriendsCraneState } from '../game/multiplayer/FriendsCrane';
import { DEFAULT_CRANE_CAMERA, dragCraneCamera, type CraneCameraOptions } from '../game/multiplayer/FriendsCraneCamera';
import type { FrontierRequest } from '../game/multiplayer/FriendsFrontier';
import './friends-crane.css';


/** Each axis brakes on release, including a release outside the button. */
export function CraneHoldButton({craneId,disabled,onStart,onStop,children}:{
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
  const [camera,setCamera]=useState(DEFAULT_CRANE_CAMERA),[cameraDragging,setCameraDragging]=useState(false);
  const cameraRef=useRef(camera),cameraFrame=useRef<number|null>(null),cameraCallback=useRef(onCameraChange);cameraCallback.current=onCameraChange;
  const cameraView=useRef<HTMLDivElement>(null),cameraDrag=useRef<{id:number;x:number;y:number}|null>(null);
  const changeCamera=useCallback((next:CraneCameraOptions)=>{
    if(cameraFrame.current!==null){cancelAnimationFrame(cameraFrame.current);cameraFrame.current=null;}
    cameraRef.current=next;setCamera(next);cameraCallback.current?.(next);
  },[]);
  const stopCameraDrag=useCallback(()=>{
    const drag=cameraDrag.current;if(!drag)return;cameraDrag.current=null;setCameraDragging(false);
    if(cameraView.current?.hasPointerCapture(drag.id))cameraView.current.releasePointerCapture(drag.id);
    changeCamera(cameraRef.current);
  },[changeCamera]);
  useEffect(()=>{
    const hidden=()=>{if(document.visibilityState!=='visible')stopCameraDrag();};
    window.addEventListener('blur',stopCameraDrag);document.addEventListener('visibilitychange',hidden);
    return()=>{window.removeEventListener('blur',stopCameraDrag);document.removeEventListener('visibilitychange',hidden);if(cameraFrame.current!==null)cancelAnimationFrame(cameraFrame.current);};
  },[stopCameraDrag]);
  useEffect(()=>{const before=document.activeElement as HTMLElement|null;panel.current?.querySelector<HTMLButtonElement>('[data-brake]')?.focus();return()=>{if(before?.isConnected)before.focus();};},[]);
  useEffect(()=>{const timer=window.setInterval(()=>requestRef.current({action:'crane_heartbeat',pieceId:crane.pieceId}),1000);return()=>window.clearInterval(timer);},[crane.pieceId]);
  const request=(action:FrontierRequest['action'])=>onRequest({action,pieceId:crane.pieceId});
  const rotating=Boolean(crane.armMode&&crane.armMode!=='hold'),hasWinch=crane.hasWinch!==false;
  const telescopic=crane.mastExtension!==undefined,mastMoving=Boolean(crane.mastMode&&crane.mastMode!=='hold'),boomMoving=Boolean(crane.boomMode&&crane.boomMode!=='hold');
  const moving=rotating||mastMoving||boomMoving||crane.mode!=='hold';
  const otherOperator=Boolean(crane.operatorId&&localId&&crane.operatorId!==localId);
  const status=crane.blocked?`${crane.blockedReason??'Travel obstructed'} · brake engaged`:[rotating,mastMoving,boomMoving,crane.mode!=='hold'].filter(Boolean).length>1?'Combined motion':mastMoving?(crane.mastMode==='up'?'Extending mast':'Retracting mast'):boomMoving?(crane.boomMode==='extend'?'Extending arm':'Retracting arm'):rotating?'Turning arm':crane.mode==='raise'?'Raising load':crane.mode==='lower'?'Lowering load':'Brake engaged';
  return <div className="friends-crane-overlay" onMouseDown={e=>e.stopPropagation()}>
    <section ref={panel} className="friends-crane-dialog" role="dialog" aria-modal="true" aria-labelledby="crane-control-title" onKeyDown={e=>{
      if(e.key!=='Tab')return;
      const buttons=[...panel.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],first=buttons[0],last=buttons.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }}>
      <div ref={cameraView} className="friends-crane-live-view" aria-label="Live view of crane load" data-dragging={cameraDragging}
        onPointerDown={event=>{
          if(event.button!==0||cameraDrag.current||(event.target as HTMLElement).closest('button'))return;
          event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);
          cameraDrag.current={id:event.pointerId,x:event.clientX,y:event.clientY};setCameraDragging(true);
        }}
        onPointerMove={event=>{
          const drag=cameraDrag.current;if(!drag||drag.id!==event.pointerId)return;
          event.preventDefault();event.stopPropagation();
          cameraRef.current=dragCraneCamera(cameraRef.current,event.clientX-drag.x,event.clientY-drag.y);drag.x=event.clientX;drag.y=event.clientY;
          if(cameraFrame.current===null)cameraFrame.current=requestAnimationFrame(()=>{cameraFrame.current=null;setCamera(cameraRef.current);cameraCallback.current?.(cameraRef.current);});
        }}
        onPointerUp={event=>{if(cameraDrag.current?.id===event.pointerId)stopCameraDrag();}}
        onPointerCancel={event=>{if(cameraDrag.current?.id===event.pointerId)stopCameraDrag();}}
        onLostPointerCapture={event=>{if(cameraDrag.current?.id===event.pointerId)stopCameraDrag();}}
        onContextMenu={event=>event.preventDefault()}
      >
        <div className="crane-camera-label"><Camera size={16}/><strong>{camera.mode==='load'?'LOAD CAMERA':'WHOLE CRANE'}</strong><span>LIVE</span></div>
        <span className="crane-camera-drag-hint">Drag to orbit · up / down to tilt</span>
        <div className="crane-camera-reticle" aria-hidden="true"/>
        <div className="crane-camera-tools"><button type="button" onClick={()=>changeCamera({...camera,mode:camera.mode==='load'?'overview':'load'})}>{camera.mode==='load'?'View whole crane':'Follow load'}</button><button type="button" aria-label="Orbit camera left" onClick={()=>changeCamera({...camera,orbit:camera.orbit+Math.PI/4,manualOrbit:true})}><RotateCcw size={16}/></button><button type="button" aria-label="Orbit camera right" onClick={()=>changeCamera({...camera,orbit:camera.orbit-Math.PI/4,manualOrbit:true})}><RotateCw size={16}/></button><button type="button" aria-label="Move camera closer" disabled={camera.distance<=160} onClick={()=>changeCamera({...camera,distance:Math.max(160,camera.distance/1.3)})}>+</button><button type="button" aria-label="Move camera farther" disabled={camera.distance>=12000} onClick={()=>changeCamera({...camera,distance:Math.min(12000,camera.distance*1.3)})}>−</button><button type="button" onClick={()=>changeCamera({...DEFAULT_CRANE_CAMERA,mode:camera.mode})}>Reset camera</button><button type="button" onClick={()=>changeCamera({...camera,light:!camera.light})}>{camera.light?'Camera light on':'Camera light off'}</button></div>
      </div>
      <div className="friends-crane-controls">
      <header><div><small>SUNLINE WORKS · FREIGHT HANDLING</small><h2 id="crane-control-title">Freight crane</h2></div><button type="button" aria-label="Close crane controls" onClick={onClose}><X size={20}/></button></header>
      <div className="friends-crane-status"><i className={moving?'running':''}/><div><strong>{status}</strong><span>{!hasWinch?'Attach a winch to the free arm socket':crane.cargoId?'Salvage core connected':'Hook free · align above the cargo'}</span></div><b>{hasWinch?(crane.length/12).toFixed(1):'—'}<small>m cable</small></b></div>
      {!telescopic&&<div className="friends-crane-travel"><span style={{width:`${Math.max(2,100*(1-crane.length/CRANE_MAX_LENGTH))}%`}}/></div>}
      {telescopic&&<div className="crane-dimensions"><div><Ruler size={14}/><span>Mast height</span><strong>{((160+(crane.mastExtension??0))/12).toFixed(1)}<small> m</small></strong><i><em style={{width:`${100*(crane.mastExtension??0)/CRANE_MAX_MAST_EXTENSION}%`}}/></i></div><div><MoveHorizontal size={14}/><span>Arm reach</span><strong>{((184+(crane.boomExtension??0))/12).toFixed(1)}<small> m</small></strong><i><em style={{width:`${100*(crane.boomExtension??0)/CRANE_MAX_BOOM_EXTENSION}%`}}/></i></div></div>}
      {crane.angle!==undefined&&<><div className="crane-axis-label"><strong>TURN THE CRANE</strong><span>{((crane.rotation*90+crane.angle*180/Math.PI+360)%360).toFixed(1)}° · 360° travel</span></div><div className="friends-crane-buttons crane-rotation"><CraneHoldButton craneId={crane.pieceId} disabled={otherOperator} onStart={()=>request('crane_left')} onStop={()=>request('crane_stop_arm')}><RotateCcw size={21}/><strong>Turn left</strong></CraneHoldButton><button type="button" className="crane-brake" onClick={()=>request('crane_stop_arm')}><Pause size={21}/><strong>Hold turn</strong></button><CraneHoldButton craneId={crane.pieceId} disabled={otherOperator} onStart={()=>request('crane_right')} onStop={()=>request('crane_stop_arm')}><RotateCw size={21}/><strong>Turn right</strong></CraneHoldButton></div></>}
      {telescopic&&<>
        <div className="crane-axis-label"><strong>MAST HEIGHT</strong><span>Up to 256 m</span></div>
        <div className="friends-crane-buttons crane-rotation"><CraneHoldButton craneId={crane.pieceId} disabled={otherOperator||(crane.mastExtension??0)>=CRANE_MAX_MAST_EXTENSION} onStart={()=>request('crane_mast_up')} onStop={()=>request('crane_stop_mast')}><ArrowUp size={20}/><strong>Extend up</strong></CraneHoldButton><button type="button" className="crane-brake" onClick={()=>request('crane_stop_mast')}><Pause size={20}/><strong>Hold mast</strong></button><CraneHoldButton craneId={crane.pieceId} disabled={otherOperator||(crane.mastExtension??0)<=0} onStart={()=>request('crane_mast_down')} onStop={()=>request('crane_stop_mast')}><ArrowDown size={20}/><strong>Retract down</strong></CraneHoldButton></div>
        <div className="crane-axis-label"><strong>ARM REACH</strong><span>Up to 256 m</span></div>
        <div className="friends-crane-buttons crane-rotation"><CraneHoldButton craneId={crane.pieceId} disabled={otherOperator||(crane.boomExtension??0)>=CRANE_MAX_BOOM_EXTENSION} onStart={()=>request('crane_extend')} onStop={()=>request('crane_stop_boom')}><MoveHorizontal size={20}/><strong>Extend arm</strong></CraneHoldButton><button type="button" className="crane-brake" onClick={()=>request('crane_stop_boom')}><Pause size={20}/><strong>Hold reach</strong></button><CraneHoldButton craneId={crane.pieceId} disabled={otherOperator||(crane.boomExtension??0)<=0} onStart={()=>request('crane_retract')} onStop={()=>request('crane_stop_boom')}><MoveHorizontal size={20}/><strong>Retract arm</strong></CraneHoldButton></div>
        <button type="button" className="crane-precision" aria-pressed={Boolean(crane.precision)} disabled={otherOperator} onClick={()=>request('crane_precision')}><Gauge size={16}/><strong>{crane.precision?'Precision speed':'Standard speed'}</strong><span>{crane.precision?'Fine positioning · 20%':'Tap for fine positioning'}</span></button>
      </>}
      {telescopic&&<button type="button" className="crane-precision crane-stabilizer" aria-pressed={Boolean(crane.antiSway)} disabled={otherOperator} onClick={()=>request('crane_stabilize')}><Gauge size={16}/><strong>{crane.antiSway?'Anti-sway on':'Natural swing'}</strong><span>{crane.cargoId?`${(crane.swayAngle??0).toFixed(1)}° load sway`:'Tap to steady the load'}</span></button>}
      <div className="crane-axis-label"><strong>CABLE / LOAD</strong><span>Hold to lift or lower</span></div>
      <div className="friends-crane-buttons"><CraneHoldButton craneId={crane.pieceId} disabled={otherOperator||!hasWinch||crane.length<=CRANE_MIN_LENGTH} onStart={()=>request('crane_raise')} onStop={()=>request('crane_hold')}><ArrowUp size={22}/><strong>Raise</strong><small>Hold to lift</small></CraneHoldButton><button type="button" className="crane-brake" disabled={!hasWinch} onClick={()=>request('crane_hold')}><Pause size={22}/><strong>Stop / hold</strong><small>Hold cable</small></button><CraneHoldButton craneId={crane.pieceId} disabled={otherOperator||!hasWinch||crane.length>=CRANE_MAX_LENGTH} onStart={()=>request('crane_lower')} onStop={()=>request('crane_hold')}><ArrowDown size={22}/><strong>Lower</strong><small>Hold to lower</small></CraneHoldButton></div>
      <button type="button" data-brake className="crane-stop-all" onClick={()=>request('crane_stop_all')}><Pause size={18}/>Stop all · brake every axis</button>
      <div className="friends-crane-connection"><button type="button" disabled={otherOperator||!hasWinch||Boolean(crane.cargoId)} onClick={()=>request('crane_connect')}><Link2 size={18}/>Connect load</button><button type="button" disabled={otherOperator||!crane.cargoId} onClick={()=>request('crane_release')}><Unlink size={18}/>Release load</button></div>
      <div className="crane-operator"><span>{otherOperator?`${operatorName??'A teammate'} has the controls`:crane.operatorId?'You have the controls':'Controls available'}</span>{otherOperator&&<button type="button" onClick={()=>request('crane_takeover')}>Take controls</button>}</div>
      {message&&<p className="friends-crane-feedback" role="status">{message}</p>}
      <details className="crane-guide"><summary>Operating guide · keyboard and touch</summary><p className="friends-crane-help">Align the hook above a settled core and lower it, then connect. A crew member beside the hook can press F to connect or disconnect without taking your controls. Hold a direction button to move; release it to brake that axis. Turn, extend, and lift together. Use precision speed for careful arm positioning. Stop all or close this menu to brake every axis. Loads swing naturally when you turn or stop. Enable anti-sway to settle the load for placement. Stop all brakes the motors while the load settles. Releasing a moving load preserves its momentum.</p></details>
      <footer><span>Shared controls · solo or crew</span><span>Esc to return</span></footer>
      </div>
    </section>
  </div>;
}
