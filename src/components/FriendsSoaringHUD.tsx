import { soaringSuspended } from '../game/multiplayer/FriendsSoaring';
import { gliderEquipmentLocked } from '../game/multiplayer/FriendsGliderControls';
import type { CoopPlayerSnapshot } from '../game/multiplayer/CoopSimulation';
import { soaringWind } from '../game/world/FriendsSoaringWeather';

export function FriendsSoaringHUD({player,timeMs,equipped}:{player:CoopPlayerSnapshot;timeMs:number;equipped:boolean}){
  if((!equipped&&!gliderEquipmentLocked(player))||player.friendsSeat||player.friendsDevFlight||player.motion?.swimming||player.lifeState!=='alive')return null;
  const s=player.friendsSoaring, flying=soaringSuspended(s);
  const warning=s?.phase==='collapsed'?'Release brake · recovering wing':s&&s.stall>2.4?'Release brake · stall':undefined;
  const launchHint=s?.message.includes('overhead')?'Move away from overhead cover':s?.message.includes('Turn into wind')?'Turn into wind':s?.message.includes('clear downhill')?'Find a downhill launch slope':s?.phase==='ready'?'Run into wind to launch':s?.phase==='inflating'?'Inflating wing':s?.phase==='landed'?'Landed':'Find a clear launch slope';
  const wind=soaringWind(timeMs),relative=(s?Math.atan2(s.windY,s.windX):wind.angle)-(s?.heading??player.angle);
  return <section className={`friends-soaring-hud ${flying?'is-flying':''}`} aria-label="Paragliding instruments">
    {flying&&s?<div className="friends-soaring-instruments">
      <div className={s.climb>.2?'is-climbing':s.climb< -2?'is-sinking':''} aria-label={`Vertical speed ${s.climb.toFixed(1)} metres per second`}><strong>{s.climb>=0?'+':''}{s.climb.toFixed(1)}</strong><span>m/s</span></div>
      <div aria-label={`Airspeed ${Math.round(s.airspeed*3.6)} kilometres per hour`}><strong>{Math.round(s.airspeed*3.6)}</strong><span>km/h</span></div>
      <div aria-label={`Ground clearance ${Math.round(s.agl)} metres`}><strong>{Math.round(s.agl)}</strong><span>m AGL</span></div>
    </div>:<div className="friends-soaring-launch">
      <span className="friends-soaring-wind" title="Wind direction" style={{transform:`rotate(${relative*180/Math.PI}deg)`}} aria-label="Wind direction">↑</span>
      <span role="status">{launchHint}</span>
      {s?.phase==='inflating'&&<progress value={s.inflation} max={1} aria-label="Wing inflation"/>}
    </div>}
    {warning&&<div className="friends-soaring-warning" role="status">{warning}</div>}
  </section>;
}
