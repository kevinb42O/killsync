import { useEffect, useRef } from 'react';
import { Hammer, Plane, Sun, Wind, X, RotateCcw, Pause, Play } from 'lucide-react';
import type { FriendsEnvironmentChange, FriendsEnvironmentState } from '../game/world/FriendsEnvironmentPreview';

export function FriendsDevMenu({environment,flight,guestsCanBuild,onGuestAccess,onFlight,onChange,onClose}:{environment:FriendsEnvironmentState;flight:boolean;guestsCanBuild:boolean;onGuestAccess:()=>void;onFlight:()=>void;onChange:(change:FriendsEnvironmentChange)=>void;onClose:()=>void}){
  const close=useRef<HTMLButtonElement>(null);
  useEffect(()=>{close.current?.focus();},[]);
  return <div className="friends-dev-backdrop" onPointerDown={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()}>
    <section className="friends-dev-menu" role="dialog" aria-modal="true" aria-label="Frontier developer settings" onKeyDown={event=>{
      if(event.key!=='Tab')return;
      const controls=(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button,input,select');
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }}>
      <header><div><small>FRONTIER LAB</small><h2>Developer settings</h2></div><button ref={close} onClick={onClose} aria-label="Close developer settings"><X size={20}/></button></header>
      <p className="friends-dev-caption">Set the island lighting for everyone. Environment changes sync to all players.</p>
      <div className="friends-dev-section"><h3><Hammer size={16}/> Guest permissions</h3>
        <label className="friends-dev-permission"><input type="checkbox" checked={guestsCanBuild} onChange={onGuestAccess}/> Friends can build</label>
        <p>Allow guests to build, edit terrain, and operate cranes and the railway.</p>
      </div>
      <div className="friends-dev-section"><h3><Plane size={16}/> Free flight</h3>
        <button className="friends-dev-toggle" aria-pressed={flight} onClick={onFlight}><span>{flight?'Flight enabled':'Flight disabled'}</span><b>{flight?'ON':'OFF'}</b></button>
        <p>Move toward your view · Space rise · Ctrl descend · Shift boost</p>
      </div>
      <div className="friends-dev-section"><h3><Sun size={16}/> Time of day <output>{environment.clock}</output></h3>
        <div className="friends-dev-presets">{[['Dawn',6],['Noon',12],['Sunset',18],['Midnight',0]].map(([label,hour])=><button key={label} onClick={()=>onChange({hour:Number(hour)})}>{label}</button>)}</div>
        <label className="friends-dev-range">World time<input type="range" min="0" max="23.99" step=".05" value={environment.hour} onChange={e=>onChange({hour:Number(e.target.value)})}/></label>
        <label className="friends-dev-time">Exact time<input aria-label="Exact time of day" type="time" value={environment.clock} onChange={e=>{if(e.target.value){const [h,m]=e.target.value.split(':').map(Number);onChange({hour:h+m/60});}}}/></label>
        <div className="friends-dev-speed"><label>Cycle speed<select value={environment.speed} onChange={e=>onChange({speed:Number(e.target.value)})}>{[0,.25,.5,1,2,5,10,30,60,120].map(speed=><option key={speed} value={speed}>{speed===0?'Paused':`${speed}×${speed===1?' · 24-minute day':''}`}</option>)}</select></label><button onClick={()=>onChange({speed:environment.speed===0?environment.resumeSpeed:0})}>{environment.speed===0?<Play size={15}/>:<Pause size={15}/>} {environment.speed===0?'Resume':'Pause'}</button></div>
        <p>{environment.enabled?'Shared time override active':"Following the shared world clock"} · {environment.phase}</p>
      </div>
      <div className="friends-dev-section"><h3><Wind size={16}/> Cloud wind <output>{environment.windSpeed.toFixed(2)}×</output></h3><label className="friends-dev-range">Wind speed<input type="range" min="0" max="4" step=".25" value={environment.windSpeed} onChange={e=>onChange({windSpeed:Number(e.target.value)})}/></label><p>Cloud volumes and their shadows move together. Zero holds them still.</p></div>
      <footer><button onClick={()=>onChange({reset:true})}><RotateCcw size={14}/> Reset environment</button><button className="friends-dev-return" onClick={onClose}>Return to island <kbd>C / Esc</kbd></button></footer>
    </section>
  </div>;
}
