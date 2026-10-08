import { FriendsAudio } from '../src/game/FriendsAudio';
import { campfireSound, inCastleMusicArea } from '../src/game/FriendsLocationAudio';
import { CASTLE_STAIRS } from '../src/game/world/FriendsTerrain';
import { HIGHFALL_CASTLE } from '../src/game/world/FriendsCastle';
import { FRIENDS_CAMPFIRE } from '../src/game/world/FriendsRegion';
const storageKey = 'sunline.audio.v1', savedSettings = localStorage.getItem(storageKey);
const restoreSettings = () => savedSettings === null ? localStorage.removeItem(storageKey) : localStorage.setItem(storageKey, savedSettings);
const audio = new FriendsAudio(), release = audio.acquire();
audio.setSettings({ music: .55, effects: .65, ambience: .5, muted: false });
const internals = audio as any;
let point: {x:number;y:number;z:number} = FRIENDS_CAMPFIRE, area = false, started = false, exiting = false;
const quiet = {wind:0,birds:0,crickets:0,surf:0,foliage:0,foliagePan:0};
function location(p:typeof point) { point = p; started = true; audio.activate(); audio.setSoundscape(quiet); update(); }
function update() {
  if (!started) return;
  if (!exiting) {
    area = inCastleMusicArea(point, area); audio.setCastleMusic(area);
    audio.setCampfireSound(campfireSound(point, 0, 180));
  }
  const now = internals.context?.currentTime ?? 0;
  const music = [...internals.music].map(([theme, loop]: any) => ({theme, gain: Number(loop.gain.gain.value.toFixed(3)), target: loop.target, duration: Number(loop.source.buffer.duration.toFixed(2))}));
  const fire = internals.ambientLoops.get('campfire');
  const assets = [...internals.buffers].filter(([url]: any) => /exploration|castle\.ogg|campfire_woods\.ogg/.test(url)).map(([url,b]:any)=>{
    const data=b.getChannelData(0);let sum=0;for(let i=0;i<data.length;i+=32)sum+=data[i]*data[i];
    return {file:url,duration:Number(b.duration.toFixed(2)),rms:Number(Math.sqrt(sum/Math.ceil(data.length/32)).toFixed(4))};
  });
  document.getElementById('state')!.textContent = JSON.stringify({location:exiting?'left world':area?'castle':'main',muted:audio.getSettings().muted,context:internals.context?.state,clock:Number(now.toFixed(1)),music,campfire:fire?{gain:Number(fire.gain.gain.value.toFixed(3)),pan:fire.pan?.pan.value}:null,assets},null,2);
}
document.getElementById('main')!.onclick=()=>location({x:6000,y:6000,z:700});
document.getElementById('stairs')!.onclick=()=>{const t=CASTLE_STAIRS.treads.filter(t=>t.flight==='approach').at(-1)!;location({x:t.a.x,y:t.a.y,z:t.z});};
document.getElementById('castle')!.onclick=()=>location({x:HIGHFALL_CASTLE.x,y:HIGHFALL_CASTLE.y,z:HIGHFALL_CASTLE.floor});
document.getElementById('fire')!.onclick=()=>location(FRIENDS_CAMPFIRE);
document.getElementById('mute')!.onclick=()=>{audio.setSettings({muted:!audio.getSettings().muted});update();};
document.getElementById('cleanup')!.onclick=()=>{exiting=true;release();audio.dispose();restoreSettings();update();};
const timer=setInterval(update,500);
addEventListener('beforeunload',()=>{clearInterval(timer);release();audio.dispose();restoreSettings();});

if (import.meta.hot) import.meta.hot.dispose(() => { clearInterval(timer); release(); audio.dispose(); restoreSettings(); });
