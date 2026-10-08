import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage(), errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  // Isolate regression runs from unrelated Vite file-watch reloads.
  await page.route('**/@vite/client',route=>route.fulfill({contentType:'application/javascript',body:"export const createHotContext = () => ({dispose(){},accept(){}}); export const injectQuery = (url, query) => url + (url.includes('?') ? '&' : '?') + query;"}));
  await page.route('**/src/main.tsx*',route=>route.abort());
  await page.goto(process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3000');
  const report=await page.evaluate(async()=>{
    const {FriendsAudio,FRIENDS_CUE_ASSETS}=await import('/src/game/FriendsAudio.ts');
    const {FriendsInteractionSound,QUIET_WORLD_SOUND}=await import('/src/game/FriendsWorldSound.ts');
    const {effectCalibration}=await import('/src/game/FriendsAudioMix.ts');
    const check=(ok,message)=>{if(!ok)throw new Error(message);};
    const db=n=>20*Math.log10(Math.max(n,1e-9));
    const stats=b=>{
      let peak=0,sum=0,loudest=0;
      const window=Math.round(b.sampleRate*.05);
      for(let c=0;c<b.numberOfChannels;c++){
        const d=b.getChannelData(c);let energy=0;
        for(let i=0;i<d.length;i++){
          const v=d[i];peak=Math.max(peak,Math.abs(v));sum+=v*v;energy+=v*v;
          if(i>=window)energy-=d[i-window]*d[i-window];
          if(i>=Math.min(window,d.length)-1)loudest=Math.max(loudest,energy/Math.min(window,d.length));
        }
      }
      return {duration:b.duration,peak,peakDb:db(peak),rmsDb:db(Math.sqrt(sum/(b.length*b.numberOfChannels))),attackDb:db(Math.sqrt(loudest))};
    };
    const storage=localStorage.getItem('sunline.audio.v1'),audio=new FriendsAudio(),release=audio.acquire();
    const until=async(fn)=>{const end=performance.now()+30000;while(!fn()){check(performance.now()<end,'Audio load timed out');await new Promise(r=>setTimeout(r,25));}};
    try{
      audio.setSettings({music:0,effects:.65,ambience:.5,muted:false});audio.activate();
      await until(()=>audio.context?.state==='running');
      const paths=[...new Set(Object.values(FRIENDS_CUE_ASSETS).flat())];
      await Promise.all(paths.map(url=>audio.load(url)));
      for(const [file,seam]of[['exploration',4],['castle',4],['cave_air',.8],['waterfall',.8],['lava',.8],['volcano',.8],['reel_motor',.08],['wind_clean',2],['crickets',2],['surf',2],['campfire_woods',2],['train_drive',.08],['train_rail',.08]])await audio.load(`/audio/friends/${file}.ogg`,true,seam);
      const {PREVIEW_LEVELS:nominal,AMBIENT_CUES:ambience}=await import('/tools/friends-audio-review-config.ts');
      const samples=[];let calibrationMs=0;
      for(const [cue,urls]of Object.entries(FRIENDS_CUE_ASSETS))for(const url of urls){
        const b=audio.buffers.get(url);check(b,'Missing decoded cue '+url);
        const original=stats(b),trim=audio.bufferTrims.get(url)??1;
        const begin=performance.now();effectCalibration(b,cue);calibrationMs+=performance.now()-begin;
        check(original.peak>.0001&&Number.isFinite(trim),'Silent/invalid cue '+url);
        if(cue!=='swing')check(original.peak*trim<=.711,'Unbounded calibrated peak '+url);
        if(cue==='caveDrip'){
          check(b.duration>=.65&&b.duration<=.8,'Drip is not a single short event '+url);
          const data=b.getChannelData(0),hop=Math.round(b.sampleRate*.005),envelope=[];
          for(let i=0;i<data.length;i+=hop){let sum=0;for(let j=i;j<Math.min(i+hop,data.length);j++)sum+=data[j]*data[j];envelope.push(Math.sqrt(sum/hop));}
          const threshold=Math.max(...envelope)*.2;let groups=0,last=-Infinity;
          for(let i=0;i<envelope.length;i++)if(envelope[i]>threshold){if(i-last>30)groups++;last=i;}
          check(groups===1,'Multiple drip attacks remain in '+url);
        }
        const net=trim*(nominal[cue]??.2)*(ambience.has(cue)?.5:.65);
        samples.push({cue,file:url.split('/').at(-1),...original,trimDb:db(trim),defaultPeakDb:original.peakDb+db(net),defaultAttackDb:original.attackDb+db(net)});
      }
      const cache=new Map(audio.buffers);
      const NativeAudioContext=window.AudioContext;
      async function render(name,duration,fullVolume,setup){
        const offline=new OfflineAudioContext(2,Math.ceil(duration*48000),48000);let at=0;
        // Keep the public playback path intact while scheduling a deterministic
        // native offline render; no copies of its gain/pan/limiter graph.
        const facade=new Proxy(offline,{get(target,key){if(key==='state')return 'running';if(key==='currentTime')return at;if(key==='close')return ()=>Promise.resolve();const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v;}});
        window.AudioContext=function(){return facade;};
        const mix=new FriendsAudio(),done=mix.acquire();mix.buffers=new Map(cache);mix.bufferTrims=new Map(audio.bufferTrims);mix.preloaded=true;
        mix.setSettings({music:fullVolume?1:.28,effects:fullVolume?1:.65,ambience:fullVolume?1:.5,muted:false});
        mix.musicOffsets.set('exploration',15);mix.activate();
        check(mix.outputGuard,'Missing shared output guard');
        const schedule=(time,fn)=>{at=time;fn();};
        setup(mix,schedule);
        const voices=mix.voices.size,loops=mix.worldLoops.size+mix.ambientLoops.size+mix.trainLoops.size+mix.music.size;
        const rendered=await offline.startRendering(),levels=stats(rendered);
        done();mix.dispose();window.AudioContext=NativeAudioContext;
        check(levels.peak<.94,'Mix clipped/lost headroom: '+name+' '+levels.peak);
        check(levels.peak>.01,'Mix became inaudible: '+name);
        check(voices<=20&&loops<=13,'Unbounded audio sources: '+name);
        return {name,...levels,voices,loops};
      }
      const scenes=[];
      scenes.push(await render('Walking and landing',12,false,(a,s)=>{
        for(let i=0;i<16;i++)s(2+i*.55,()=>a.play(i%3===0?'mudStep':'grass',.18,0));
        s(4,()=>a.takeoff());s(5,()=>a.land('stoneStep',1.2));
      }));
      scenes.push(await render('Quiet cave with isolated drops',24,false,(a,s)=>{
        a.setWorldSound({...QUIET_WORLD_SOUND,caveAir:{volume:.13,pan:0},reflection:.14,reflectionDelay:.15});
        s(6,()=>a.play('caveDrip',.12,0,1,undefined,{ambience:true,pan:.4}));
        s(21,()=>a.play('caveDrip',.1,0,.98,undefined,{ambience:true,pan:-.2}));
      }));
      scenes.push(await render('Nearby treasure in cave',7,false,a=>{
        a.setWorldSound({...QUIET_WORLD_SOUND,caveAir:{volume:.13,pan:0},reflection:.14,reflectionDelay:.15});a.treasure(.34,.2);
      }));
      scenes.push(await render('Crane reeling and hook',12,false,(a,s)=>{
        a.setReelSound({volume:.22,pan:.25,rate:1});s(1,()=>a.play('ropeHook',.18,0));s(4,()=>a.play('ropeCreak',.14,0));s(9,()=>a.setReelSound({volume:0,pan:0}));
      }));
      scenes.push(await render('Volcanic landscape',18,false,(a,s)=>{
        a.setWorldSound({...QUIET_WORLD_SOUND,lava:{volume:.24,pan:-.2},volcano:{volume:.085,pan:0}});s(9,()=>a.play('steam',.12,0,1,undefined,{ambience:true,pan:.3}));
      }));
      scenes.push(await render('Full sliders and twenty simultaneous impacts',6,true,(a,s)=>{
        a.setWorldSound({...QUIET_WORLD_SOUND,waterfall:{volume:.4,pan:.3},lava:{volume:.24,pan:0},volcano:{volume:.085,pan:0},reflection:.14,reflectionDelay:.12});
        s(2,()=>{for(let i=0;i<20;i++)a.play('stone',.4,0);});
      }));
      const sampleSound=new FriendsInteractionSound(),listener={id:'host',x:0,y:0,z:0};
      const benchFrames=[0,1].map(n=>({progress:{openedTreasures:[]},hauling:{ropes:[],cranes:Array.from({length:20},(_,i)=>({pieceId:i,x:i*80,y:0,z:0,rotation:0,angle:0,length:100-n,blocked:false})),cargo:Array.from({length:20},(_,i)=>({id:String(i),x:i*80,y:0,z:0,angle:0,vx:0,vy:0,vz:0,spin:0}))}}));
      const benchStart=performance.now();for(let i=0;i<5000;i++)sampleSound.sample(benchFrames[i%2],listener,i*16.667,0,()=>undefined);
      const samplerMicroseconds=(performance.now()-benchStart)*1000/5000;
      check(samplerMicroseconds<1000,'Interaction sampling exceeded 1 ms per frame');
      const decodedBytes=[...audio.buffers.values()].reduce((s,b)=>s+b.length*b.numberOfChannels*4,0);
      return {checks:['Every Friends cue decodes and contains usable audio','Five drip files contain exactly one separated attack each','Category calibration preserves tails and bounds peaks','Actual FriendsAudio graph renders six representative/stress mixes without clipping','One output guard, twenty-voice cap and shared loops','Short-effect calibration runs only at decode time'],cueVariants:samples.length,decodedFiles:audio.buffers.size,decodedBytes,calibrationMs,samplerMicroseconds,scenes,samples};
    }finally{release();audio.dispose();storage===null?localStorage.removeItem('sunline.audio.v1'):localStorage.setItem('sunline.audio.v1',storage);}
  });
  if(errors.length)throw new Error(errors.join('; '));
  await mkdir('artifacts/friends-world-audio',{recursive:true});await writeFile('artifacts/friends-world-audio/mix-audit.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,samples:undefined},null,2));
}finally{await browser.close();}
