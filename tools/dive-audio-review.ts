import { FriendsAudio } from '../src/game/FriendsAudio';
const audio=new FriendsAudio();let release:(()=>void)|undefined,stroke:ReturnType<typeof setInterval>|undefined;
function mode(name:string){
 clearInterval(stroke);if(name==='stop'){audio.setUnderwaterDive(false);release?.();release=undefined;}
 else{
  release??=audio.acquire();audio.activate();
  if(name==='dive')audio.setUnderwaterDive(true);else if(name==='resurface')audio.resurfaceFromDive();else audio.setUnderwaterDive(false);
  if(name!=='dive')stroke=setInterval(()=>audio.play('swimStroke',.25,420,1,.62,{fadeOutSeconds:.14}),800);
 }
 document.querySelector('output')!.textContent=name==='dive'?'Submerged: quiet surface splashes, muffled world sounds and continuous dive ambience.':name==='stop'?'Audio stopped.':'Surface: clear strokes. Resurfacing also plays a short inhale.';
}
for(const name of ['surface','dive','resurface','stop'])document.getElementById(name)!.onclick=()=>mode(name);
Object.assign(window,{diveAudioReview:{audio,mode}});addEventListener('pagehide',()=>{clearInterval(stroke);release?.();audio.dispose();});
