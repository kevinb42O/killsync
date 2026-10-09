import type { CampfireAction } from '../game/multiplayer/FriendsCampfireSimulation';

/** Cooking is communicated by the marshmallow; the Eat action remains available
 * after the brief entry reminder fades. */
export function FriendsCampfireControls({ touch, gamepad, eating=false, waiting=false, onAction, onRoast, onStand }: {
  touch:boolean; gamepad:boolean; eating?:boolean; waiting?:boolean; onAction:(action:CampfireAction)=>void; onRoast:(held:boolean)=>void; onStand:()=>void;
}) {
  const eat=<button type="button" aria-label="Eat marshmallow" disabled={eating||waiting} onMouseDown={event=>event.stopPropagation()} onPointerDown={event=>event.stopPropagation()} onClick={()=>onAction('campfire_eat')}>{eating?'Eating…':waiting?'Fresh soon…':touch?'Eat':gamepad?'Eat · →':'Eat · T'}</button>;
  if(touch)return <nav className="friends-campfire-touch" aria-label="Campfire controls">
    <button onPointerDown={event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);onRoast(true);}} onPointerUp={()=>onRoast(false)} onPointerCancel={()=>onRoast(false)} onLostPointerCapture={()=>onRoast(false)}>Roast</button>
    {eat}
    <button onClick={()=>onAction('campfire_fuel')}>Wood</button>
    <button disabled={eating||waiting} onClick={()=>onAction('campfire_fresh')}>Fresh</button>
    <button onClick={onStand}>Stand</button>
  </nav>;
  return <><div className="friends-campfire-hint" aria-label="Campfire controls">
    {gamepad?'Hold RT to roast · ↑ wood · X fresh · Y stand':'Hold click to roast · K wood · R fresh · F stand'}
  </div><div className="friends-campfire-eat">{eat}</div></>;
}
