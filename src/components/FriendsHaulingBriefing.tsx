import { useEffect, useRef, type CSSProperties } from 'react';
import { Castle, Check, Package, Waves, X } from 'lucide-react';
import type { HaulingSnapshot } from '../game/multiplayer/FriendsHauling';
import { cargoDelivered, haulingJob } from '../game/world/FriendsHaulingGoal';
import type { HaulingBriefing } from './useFriendsHaulingBriefing';

export function FriendsHaulingBriefing({briefing,hauling,interactionLabel,onClose}:{briefing:HaulingBriefing;hauling:HaulingSnapshot;interactionLabel:string;onClose:()=>void}){
  const dialog=useRef<HTMLElement>(null);
  const job=haulingJob({id:briefing.cargoId}),mission=job.mission,complete=briefing.kind==='complete';
  const next=hauling.cargo.find(c=>!cargoDelivered(hauling,c)),count=hauling.cargo.filter(c=>cargoDelivered(hauling,c)).length;
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape'&&!e.defaultPrevented){e.preventDefault();e.stopPropagation();onClose();}
      if(e.key==='Tab'){
        const buttons=dialog.current?.querySelectorAll<HTMLButtonElement>('button');if(!buttons?.length)return;
        const first=buttons[0],last=buttons[buttons.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    };
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[onClose]);
  const Icon=complete?Check:job.id==='ridge-core'?Castle:job.id==='sanctum-core'?Waves:Package;
  return <div className="hauling-dispatch-overlay" onPointerDown={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()}>
    <section ref={dialog} className="hauling-dispatch" role="dialog" aria-modal="true" aria-label={complete?'Delivery complete':`Mission briefing: ${mission.title}`} aria-describedby="hauling-dispatch-objective" style={{'--dispatch-color':job.goal.color} as CSSProperties}>
      <button type="button" className="hauling-dispatch__close" aria-label="Close mission briefing" onClick={onClose}><X size={18}/></button>
      <div className="hauling-dispatch__eyebrow"><span>SUNLINE DISPATCH</span><span>{complete?`${count}/${hauling.cargo.length} DELIVERED`:mission.difficulty}</span></div>
      <div className="hauling-dispatch__title"><div className="hauling-dispatch__seal"><Icon size={31} strokeWidth={1.3}/></div><div><small>{complete?'SIGNED, SEALED, DELIVERED':`MISSION ${String(job.number).padStart(2,'0')} · ${job.name}`}</small><h2>{complete?mission.completionTitle:mission.title}</h2></div></div>
      <p className="hauling-dispatch__story">{complete?mission.completion:mission.dispatch}</p>
      {!complete&&<>
        <div className="hauling-dispatch__objective" id="hauling-dispatch-objective"><small>YOUR JOB</small><p>{mission.objective}</p></div>
        <div className="hauling-dispatch__route"><small>A LITTLE LOCAL KNOWLEDGE</small><ol>{mission.route.map((hint,i)=><li key={hint}><span>{String(i+1).padStart(2,'0')}</span><p>{hint}</p></li>)}</ol></div>
        <div className="hauling-dispatch__controls"><span>WALK <b>haul</b></span><span>HOLD AIM <b>reel</b></span><span>{interactionLabel} <b>deliver when settled</b></span></div>
      </>}
      {complete&&<p className="hauling-dispatch__next" id="hauling-dispatch-objective">{next?`Next dispatch: ${haulingJob(next).mission.title}. Your compass will guide you to its pickup when you release this rope.`:'All dispatches complete. Take a breath, enjoy the view, and leave the island a little brighter.'}</p>}
      <footer><small>— {mission.issuer}</small><button type="button" autoFocus onClick={onClose}>{complete?'NICE WORK':"LET’S HAUL"}<span>→</span></button></footer>
      <div className="hauling-dispatch__dismiss-note">Click to continue · Esc closes · Mission details stay on your compass</div>
    </section>
  </div>;
}
