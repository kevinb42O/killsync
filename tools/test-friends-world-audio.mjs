import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser = await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const page = await browser.newPage(), errors=[];
page.on('pageerror',error=>errors.push(error.message));
try {
  // Isolate regression runs from unrelated Vite file-watch reloads.
  await page.route('**/@vite/client',route=>route.fulfill({contentType:'application/javascript',body:"export const createHotContext = () => ({dispose(){},accept(){}}); export const injectQuery = (url, query) => url + (url.includes('?') ? '&' : '?') + query;"}));
  await page.route('**/src/main.tsx*',route=>route.abort());
  await page.goto(process.env.FRIENDS_TEST_ORIGIN || 'http://localhost:3000');
  const report=await page.evaluate(async()=>{
    const {FriendsAudio,crossfadeLoop}=await import('/src/game/FriendsAudio.ts');
    const {QUIET_WORLD_SOUND}=await import('/src/game/FriendsWorldSound.ts');
    const check=(ok,message)=>{if(!ok)throw new Error(message);};
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const until=async(fn)=>{const end=performance.now()+30000;while(!fn()){check(performance.now()<end,'Audio load timed out');await wait(30);}};
    const storage=localStorage.getItem('sunline.audio.v1');
    const audio=new FriendsAudio(),release=audio.acquire();
    try {
      audio.setSettings({music:0,effects:.65,ambience:.5,muted:false}); audio.activate();
      await until(()=>audio.context?.state==='running');
      const manifest=await (await fetch('/audio/friends/sources.json')).json();
      const approved=manifest.assets.filter(a=>a.pack==='approvedPixabay');
      const beds=new Set(['cave_air.ogg','waterfall.ogg','lava.ogg','volcano.ogg','reel_motor.ogg']);
      const decoded=[];
      for(const asset of approved){
        const url='/audio/friends/'+asset.file;
        await audio.load(url,beds.has(asset.file),asset.file==='reel_motor.ogg'?.08:.8);
        const b=audio.buffers.get(url); check(b,'Native decoder rejected '+asset.file);
        const d=b.getChannelData(0);let sum=0,peak=0;
        for(const v of d){sum+=v*v;peak=Math.max(peak,Math.abs(v));}
        const rms=Math.sqrt(sum/d.length);check(rms>.001&&peak<.99,'Silent/clipped asset '+asset.file);
        check(b.duration>.2&&b.duration<20,'Unexpected asset duration '+asset.file);
        const edge=Math.abs(d[0]-d.at(-1));
        if(beds.has(asset.file)) check(edge<.08,'Discontinuous seam '+asset.file);
        decoded.push({file:asset.file,duration:b.duration,rms,peak,seamJump:beds.has(asset.file)?edge:undefined});
      }
      check(decoded.length===33,'Approved asset count');
      const mix={...QUIET_WORLD_SOUND,caveAir:{volume:.055,pan:0},waterfall:{volume:.3,pan:.7,cutoff:1200},lava:{volume:.2,pan:0},volcano:{volume:.08,pan:0},reflection:.14,reflectionDelay:.12};
      audio.setWorldSound(mix);audio.setReelSound({volume:.2,pan:-.6,rate:1.1});
      await until(()=>audio.worldLoops.size===5);
      const sources=[...audio.worldLoops].map(([key,loop])=>[key,loop.source]);
      for(let i=0;i<120;i++){audio.setWorldSound(mix);audio.setReelSound({volume:.2,pan:-.6,rate:1.1});}
      check(sources.every(([key,source])=>audio.worldLoops.get(key).source===source),'Duplicate world sources');
      check(audio.reflectionDelays.length===4&&audio.reflectionNodes.length===10,'Unbounded reflection graph');
      check(audio.reflectionInput.gain.value<=.15,'Cave entry started at excessive reflection gain');
      check(audio.reflectionDelays.every(d=>Math.abs(d.delayTime.value-.12)<.01),'Cave entry used zero-delay reflections');
      await until(()=>audio.worldLoops.get('waterfall').pan.pan.value>.5);
      check(audio.worldLoops.get('waterfall').pan.pan.value>.5,'Native panning did not follow source');
      check(audio.worldLoops.get('waterfall').filter.frequency.value<1500,'Occluded waterfall not filtered');
      audio.treasure(.34,.5);check(audio.effectVoices.size===4,'Treasure sequence not scheduled');
      audio.setSettings({effects:0});check(audio.effectVoices.size===0,'Zero Effects retained scheduled treasure');
      await wait(850);check(!audio.worldLoops.has('reel'),'Zero Effects retained reel');
      check(audio.worldLoops.size===4,'Zero Effects stopped ambience');
      audio.setSettings({effects:.65,ambience:0});await wait(850);
      check(audio.worldLoops.size===1&&audio.worldLoops.has('reel'),'Ambience/Effects buses mixed');
      audio.setReelSound({volume:0,pan:0});await until(()=>!audio.retiringWorldSources.size);
      check(!audio.worldLoops.size&&!audio.retiringWorldSources.size,'Stopped reel retained sources');
      audio.setSettings({ambience:.5,muted:true});check(!audio.worldLoops.size&&!audio.reflectionNodes.length,'Mute retained world graph');
      audio.setSettings({muted:false});audio.treasure(.34);
      Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));
      await until(()=>audio.context.state==='suspended');check(!audio.voices.size,'Hidden tab retained queued cues');
      Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));
      await until(()=>audio.context.state==='running');
      audio.clearSoundscape();check(!audio.worldLoops.size&&!audio.retiringWorldSources.size&&!audio.reflectionNodes.length,'World exit retained graph');
      release();await wait(30);check(!audio.voices.size&&!audio.music.size,'Mode exit retained sound');
      return {checks:['33 approved assets decode with audible samples and headroom','five bounded shared world/reel sources','smooth native stereo panning and occlusion filtering','four bounded cave reflections','treasure audio-clock sequence','independent Effects/Ambience controls','reel stops on stationary motion','mute, hidden tab and mode exit cleanup'],decoded};
    } finally {release();audio.dispose();delete document.hidden;storage===null?localStorage.removeItem('sunline.audio.v1'):localStorage.setItem('sunline.audio.v1',storage);}
  });
  if(errors.length)throw new Error(errors.join('; '));
  await mkdir('artifacts/friends-world-audio',{recursive:true});
  await writeFile('artifacts/friends-world-audio/browser.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally {await browser.close();}
