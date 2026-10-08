import { PREVIEW_LEVELS, AMBIENT_CUES } from './friends-audio-review-config';
import { FriendsAudio, FRIENDS_CUE_ASSETS, type FriendsCue } from '../src/game/FriendsAudio';
import { QUIET_WORLD_SOUND } from '../src/game/FriendsWorldSound';
const key='sunline.audio.v1',saved=localStorage.getItem(key);
const audio=new FriendsAudio(),release=audio.acquire();
audio.setSettings({music:0,effects:.65,ambience:.5,muted:false});
const restore=()=>saved===null?localStorage.removeItem(key):localStorage.setItem(key,saved);
const status=document.getElementById('status')!;
const internals=audio as any;
async function prepare(){
  audio.activate();
  await Promise.all(['chest_latch','chest_lid','chest_coins','chest_reward'].map(file=>internals.load(`/audio/friends/${file}.ogg`)));
}
for(const button of document.querySelectorAll<HTMLButtonElement>('button[data-mix]'))button.onclick=async()=>{
  activePlayer=undefined;document.querySelectorAll('audio').forEach(a=>a.pause());
  const mode=button.dataset.mix;
  audio.clearSoundscape();
  for(const source of internals.voices)try{source.stop();}catch{/* Already ended. */}
  if(mode==='stop'){status.textContent='Stopped.';return;}
  await prepare();
  const mix={...QUIET_WORLD_SOUND};
  if(mode==='treasure'){audio.setWorldSound({...mix,reflection:.14,reflectionDelay:.12});audio.treasure(.34,.2);}
  if(mode==='cave')audio.setWorldSound({...mix,caveAir:{volume:.13,pan:0},drip:{volume:.12,pan:.4},dripSource:'audition-cave',reflection:.14,reflectionDelay:.15});
  if(mode==='waterfall')audio.setWorldSound({...mix,waterfall:{volume:.4,pan:.4}});
  if(mode==='volcano')audio.setWorldSound({...mix,lava:{volume:.24,pan:-.2},volcano:{volume:.085,pan:0},steam:{volume:.12,pan:.3}});
  if(mode==='reel')audio.setReelSound({volume:.18,pan:0,rate:1});
  status.textContent=`Playing: ${button.textContent}. Use Stop all to end loops.`;
};
const manifest=await (await fetch('/audio/friends/sources.json')).json();
const labels:Record<string,string>={cave_air:'Cave air',cave_drips:'Cave droplets',waterfall:'Waterfall',lava:'Molten lava',volcano:'Volcano rumble',steam:'Steam release',chest_latch:'Treasure latch',chest_lid:'Treasure lid',chest_coins:'Spilling coins',chest_reward:'Treasure reward',rope_hook:'Rope hook',rope_creak:'Rope under tension',reel_motor:'Reel motor',reel_ratchet:'Reel ratchet',step_mud:'Mud footstep',step_water:'Water footstep',flashlight:'Flashlight switch',night_vision:'Night-vision activation',mining_break:'Rock break',cargo_stone:'Cargo on stone',cargo_wood:'Cargo on timber'};
let activePlayer:HTMLAudioElement|undefined;
for(const [cue,urls] of Object.entries(FRIENDS_CUE_ASSETS) as [FriendsCue, readonly string[]][]) for(const [variant,url] of urls.entries()) {
  const file=url.split('/').at(-1)!, asset=manifest.assets.find((a:any)=>a.file===file);
  const stem=file.replace(/(?:_\d{3})?\.ogg$/,''), label=labels[stem]||cue.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase());
  const article=document.createElement('article'),details=document.createElement('div'),title=document.createElement('h2'),player=document.createElement('audio');
  title.textContent=label+(urls.length>1?` · variant ${variant+1}`:'');
  details.append(title);
  if(asset?.sourcePage){const link=document.createElement('a');link.href=asset.sourcePage;link.textContent='Original recording';link.target='_blank';link.rel='noopener';details.append(link);}
  player.controls=true;player.preload='none';player.src=url;player.volume=0;
  player.onplay=async()=>{
    activePlayer=player;audio.clearSoundscape();
    for(const source of internals.voices)try{source.stop();}catch{/* Already ended. */}
    document.querySelectorAll('audio').forEach(a=>{if(a!==player)a.pause();});
    if(!player.dataset.ready){
      player.pause();status.textContent=`Preparing: ${title.textContent}`;audio.activate();await internals.load(url);
      if(activePlayer!==player)return;
      player.volume=Math.min(1,PREVIEW_LEVELS[cue]*(AMBIENT_CUES.has(cue)?.5:.65)*(internals.bufferTrims.get(url)??1));
      player.dataset.ready='1';await player.play();
    }
    status.textContent=`Previewing at typical game volume: ${title.textContent}`;
  };
  article.append(details,player);document.getElementById('assets')!.append(article);
}

const timer=setInterval(()=>{const mix=internals.worldMix;if(mix.drip.volume||mix.steam.volume)audio.setWorldSound(mix);},500);
const cleanup=()=>{clearInterval(timer);release();audio.dispose();restore();};
addEventListener('beforeunload',cleanup);
if(import.meta.hot)import.meta.hot.dispose(cleanup);
