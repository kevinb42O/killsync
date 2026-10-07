import { FriendsSimulation } from '../src/game/multiplayer/FriendsSimulation';
import { MultiplayerRendererBridge } from '../src/game/multiplayer/MultiplayerRendererBridge';
const simulation = new FriendsSimulation([{ id: 'review', label: 'Explorer', color: '#8de6ce' }]);
const bridge = new MultiplayerRendererBridge('friends_frontier');
bridge.mount(document.getElementById('world')!);
bridge['renderer'].pitch = -.3;
let last = performance.now(), accumulator = 0, requestId = 0, slow = false, samples = 0, hold=false, capture=false;
let minY = Infinity, maxY = -Infinity, maxShake = 0;
const resetMeasurement = () => { samples = 0; minY = Infinity; maxY = -Infinity; maxShake = 0; };
document.getElementById('respawn')!.onclick = () => { hold=false;simulation.friendsAction('review', { requestId: ++requestId, action: 'home' }); resetMeasurement(); };
document.getElementById('wire')!.onclick=()=>{hold=true;simulation.friendsAction('review',{requestId:++requestId,action:'home'});resetMeasurement();};
document.getElementById('resume')!.onclick=()=>{hold=false;resetMeasurement();};
document.getElementById('capture')!.onclick=()=>{capture=true;};
document.getElementById('slow')!.onclick = () => { slow = !slow; document.getElementById('slow')!.textContent = slow ? 'Normal speed' : 'Slow motion'; };
document.getElementById('fall')!.onclick = () => { Object.assign(simulation['players'].get('review')!, { x: 12000, y: 12000, z: -700, verticalVelocity: -800 }); simulation.tick(50); resetMeasurement(); };
function frame(now: number) {
  // A held screenshot and a completed review do not need a continuous world
  // render. Keep buttons responsive without running a second full game idle.
  if(!capture && samples>30 && (hold || !bridge['friendsWorldArrival']!.sequence.active)){last=now;requestAnimationFrame(frame);return;}
  if(now-last<33){requestAnimationFrame(frame);return;}
  const dt = Math.min(100, now-last); last = now; accumulator += dt;
  while (accumulator >= 50) { simulation.tick(50); accumulator -= 50; }
  bridge.render(simulation.createSnapshot(), 'review', hold?0:slow ? dt*.2 : dt);
  if(capture){capture=false;bridge['renderer'].renderer.domElement.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='friends-world-materialization.jpg';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);},'image/jpeg',.94);}
  const camera = bridge['renderer'].camera;
  minY = Math.min(minY, camera.position.y); maxY = Math.max(maxY, camera.position.y); maxShake = Math.max(maxShake, bridge['presentationShake']); samples++;
  const arrival=bridge['friendsWorldArrival']!.sequence,readiness=bridge['frontierVisuals']!.arrivalReadiness(simulation.createSnapshot().players[0].x,simulation.createSnapshot().players[0].y);
  document.getElementById('stats')!.textContent = `Idle camera range: ${(maxY-minY).toFixed(6)}\nShake: ${maxShake.toFixed(3)}\nFrames sampled: ${samples}\nWorld stage: ${arrival.stage}\nReveal: ${arrival.reveal.toFixed(2)}\nLocal geometry ready: ${readiness.ready}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener('beforeunload', () => bridge.destroy());
