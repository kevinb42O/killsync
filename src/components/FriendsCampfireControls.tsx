import type { CampfireAction } from '../game/multiplayer/FriendsCampfireSimulation';

export function FriendsCampfireControls({ touch, gamepad, eating=false, waiting=false, visible=false, nearFire=true, seated=true, onAction, onRoast, onStand }: {
  touch:boolean; gamepad:boolean; eating?:boolean; waiting?:boolean; visible?:boolean; nearFire?:boolean; seated?:boolean;
  onAction:(action:CampfireAction)=>void; onRoast:(held:boolean)=>void; onStand:()=>void;
}) {
  const busy=eating||waiting;
  return <div className="friends-fishing-controls" data-toolbelt-visible={visible} aria-label="Marshmallow controls" onMouseDown={event=>event.stopPropagation()} onPointerDown={event=>event.stopPropagation()}>
    <button type="button" disabled={busy} onPointerDown={event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);onRoast(true);}} onPointerUp={()=>onRoast(false)} onPointerCancel={()=>onRoast(false)} onLostPointerCapture={()=>onRoast(false)}><kbd>{touch?'Hold':gamepad?'RT':'LMB'}</kbd>{nearFire?'Roast':'Extend'}</button>
    <button type="button" aria-label="Eat marshmallow" disabled={busy} onClick={()=>onAction('campfire_eat')}><kbd>{touch?'Tap':gamepad?'LT':'RMB'}</kbd>{eating?'Eating…':waiting?'Fresh soon…':'Eat'}</button>
    <button type="button" disabled={busy} onClick={()=>onAction('campfire_fresh')}><kbd>{touch?'Tap':gamepad?'X':'R'}</kbd>Fresh</button>
    {touch&&nearFire&&<button type="button" onClick={()=>onAction('campfire_fuel')}>Wood</button>}
    {touch&&seated&&<button type="button" onClick={onStand}>Stand</button>}
  </div>;
}
