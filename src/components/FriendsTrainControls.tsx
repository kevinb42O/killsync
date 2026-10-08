import { useState,useEffect } from 'react';
import type { ScenicServiceSnapshot } from '../game/multiplayer/FriendsScenicService';
import type { FrontierRequest } from '../game/multiplayer/FriendsFrontier';

export function FriendsTrainControls({service,onRequest,onClose,message}:{service:ScenicServiceSnapshot;onRequest:(r:Omit<FrontierRequest,'requestId'>)=>void;onClose:()=>void;message?:string|null}){
  const [speed,setSpeed]=useState(Math.round((service.targetSpeed??132)*.3));
  useEffect(()=>setSpeed(Math.round((service.targetSpeed??132)*.3)),[service.targetSpeed]);
  const apply=(value:number,stops=service.autoStops!==false)=>{const n=Math.max(6,Math.min(360,value));setSpeed(n);onRequest({action:'scenic_speed',speedKmh:n,stopAtStations:stops});};
  const status=service.blocked?'Track obstruction · automatic hold':service.held?'Train held':service.dwell>0?'Station boarding':service.speed<(service.targetSpeed??132)-3?'Accelerating / route speed limit':'Travelling';
  return <div className="friends-train-controls-overlay" onMouseDown={e=>e.stopPropagation()}>
    <section className="friends-train-controls" role="dialog" aria-modal="true" aria-labelledby="train-control-title">
      <div className="friends-train-controls__heading"><div><small>GRAND TRAVERSE · FRONT CARRIAGE</small><h2 id="train-control-title">Train controls</h2></div><button aria-label="Close train controls" onClick={onClose}>✕</button></div>
      <div className="friends-train-controls__speed"><strong>{Math.round(service.speed*.3)}<small>km/h</small></strong><div><span>{status}</span><small>{service.chapter}</small></div></div>
      <label htmlFor="train-speed">Requested speed <strong>{speed} km/h</strong></label>
      <input id="train-speed" autoFocus type="range" min="6" max="360" step="1" value={speed} onChange={e=>setSpeed(Number(e.target.value))} onPointerUp={()=>apply(speed)} onKeyUp={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))apply(speed);}} />
      <div className="friends-train-controls__scale"><span>6 · slow exploration</span><span>360 · express</span></div>
      <div className="friends-train-controls__buttons"><button onClick={()=>apply(speed-12)}>− Slower</button><button onClick={()=>apply(speed)}>Set speed</button><button onClick={()=>apply(speed+12)}>Faster +</button></div>
      <div className="friends-train-controls__presets">{[40,120,240,360].map(n=><button key={n} className={speed===n?'selected':''} onClick={()=>apply(n)}>{n} km/h</button>)}</div>
      <label className="friends-train-controls__stops"><input type="checkbox" checked={service.autoStops!==false} onChange={e=>apply(speed,e.target.checked)} /><span>Stop at every station<small>Switch off for a continuous journey around the island.</small></span></label>
      <div className="friends-train-controls__buttons"><button onClick={()=>onRequest({action:'scenic_hold'})}>Hold train</button><button className="selected" disabled={service.blocked} onClick={()=>onRequest({action:'scenic_depart'})}>Resume / depart</button></div>
      <div className="friends-train-controls__buttons"><button onClick={()=>onRequest({action:'train_horn'})}>Sound train horn · H</button></div>
      {message&&<p role="status">{message}</p>}
      <p>Target speeds ease in gradually. Curves and tunnels can limit actual speed. Ten wagons follow the locomotive; the seven freight decks are yours to fill.</p>
      <footer><span>Next · {service.nextStation}</span><button onClick={onClose}>Return to the journey · Esc</button></footer>
    </section>
  </div>;
}
