import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014',dir='artifacts/soaring-sound-ui';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required']}),report={errors:[],captures:[]};
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(origin+'/tools/friends-soaring-review.html');await page.waitForFunction(()=>window.soaringReview?.frames>100,{},{timeout:90000});
  await page.getByRole('button',{name:'Enable sound'}).click();
  await page.waitForFunction(()=>Boolean(window.soaringReview.audio.soaringAudio?.wind),{},{timeout:20000});
  for(const view of ['forward','up','crew']){
    await page.evaluate(v=>window.soaringReview.setView(v),view);await page.waitForTimeout(1500);await page.screenshot({path:`${dir}/${view}.png`});
    const geometry=await page.evaluate(()=>{
      const r=window.soaringReview,rig=r.scene.getObjectByName('first-person-paraglider'),cords=rig.children.filter(c=>c.name==='paraglider-brake-cord');r.scene.updateMatrixWorld(true);r.camera.updateMatrixWorld(true);
      const visibleHands=rig.children.filter(c=>c.name==='soaring-hand').map(hand=>{const p=hand.getWorldPosition(r.camera.position.clone()).project(r.camera);return {x:p.x,y:p.y,visible:Math.abs(p.x)<1&&Math.abs(p.y)<1&&p.z<1};});
      return {cords:cords.length,cordsVisible:cords.every(c=>c.visible),visibleHands};
    });assert.equal(geometry.cords,8);assert.equal(geometry.cordsVisible,true);if(view==='forward')assert.ok(geometry.visibleHands.every(h=>h.visible),JSON.stringify(geometry));report.captures.push({view,...geometry});
  }
  await page.evaluate(()=>{const r=window.soaringReview;r.setView('forward');const s=r.sim.players.get('pilot').friendsSoaring;s.brake=1;s.bank=.6;});await page.waitForTimeout(500);await page.screenshot({path:`${dir}/braking.png`});
  const hud=await page.getByRole('region',{name:'Paragliding instruments'}).boundingBox();assert.ok(hud.height<65);assert.ok(hud.width<=250);report.desktopHud=hud;
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{const s=window.soaringReview.sim.players.get('pilot').friendsSoaring;s.bank=0;s.brake=0;});await page.waitForTimeout(1500);await page.screenshot({path:`${dir}/mobile.png`});
  report.mobileHands=await page.evaluate(()=>{const r=window.soaringReview,rig=r.scene.getObjectByName('first-person-paraglider');return rig.children.filter(c=>c.name==='soaring-hand').map(hand=>{const p=hand.getWorldPosition(r.camera.position.clone()).project(r.camera);return {x:p.x,y:p.y,visible:Math.abs(p.x)<1&&Math.abs(p.y)<1&&p.z<1};});});assert.ok(report.mobileHands.every(h=>h.visible));
  report.mobileHud=await page.getByRole('region',{name:'Paragliding instruments'}).boundingBox();assert.ok(report.mobileHud.height<65);assert.ok(report.mobileHud.width<=230);
  report.audio=await page.evaluate(()=>{const audio=window.soaringReview.audio,bus=audio.soaringAudio;const before={context:audio.context.state,wind:Boolean(bus.wind),tones:bus.tones.size};audio.setSettings({muted:true});return {...before,stoppedOnMute:!bus.wind&&bus.tones.size===0&&bus.fabric.size===0};});assert.equal(report.audio.context,'running');assert.equal(report.audio.wind,true);assert.equal(report.audio.stoppedOnMute,true);
  // Offline render the actual audio engine, including the downloaded wind and
  // cloth. Weak lift → strong lift → sink → recovery warning → quiet trim.
  const pcm=await page.evaluate(async()=>{
    const {FriendsSoaringAudio}=await import('/src/game/FriendsSoaringAudio.ts'),{createSoaringState}=await import('/src/game/multiplayer/FriendsSoaring.ts');
    const duration=14,sampleRate=22050,c=new OfflineAudioContext(1,duration*sampleRate,sampleRate),bus=c.createGain();bus.gain.value=.65;bus.connect(c.destination);
    const adapter={get currentTime(){return c.currentTime;},get state(){return 'running';}};
    for(const name of ['createGain','createOscillator','createBiquadFilter','createBufferSource'])adapter[name]=c[name].bind(c);
    const decode=async url=>c.decodeAudioData(await (await fetch(url)).arrayBuffer());
    const {crossfadeLoop}=await import('/src/game/FriendsAudio.ts');const wind=crossfadeLoop(c,await decode('/audio/friends/soaring_air.wav'),.25),cloth=[await decode('/audio/friends/cloth1.ogg')];
    const audio=new FriendsSoaringAudio(adapter,bus,bus),s={...createSoaringState(0),phase:'flying',inflation:1,airspeed:9.5,climb:-1.05};audio.update(s,wind,cloth);
    let paused=c.suspend(.1);const render=c.startRendering();
    for(let time=.1;time<duration-.15;time+=.1){await paused;s.climb=time<2?-1.05:time<5?.6:time<8?3.5:time<11?-3.2:-1.05;s.stall=time>=11&&time<13?3:0;s.airspeed=time<8?9.5:13.5;audio.update(s,wind,cloth);if(time+.1<duration-.15)paused=c.suspend(time+.1);await c.resume();}
    const buffer=await render;return Array.from(buffer.getChannelData(0));
  });
  const wav=Buffer.alloc(44+pcm.length*2);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(22050,24);wav.writeUInt32LE(44100,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length*2,40);pcm.forEach((n,i)=>wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,n))*32767),44+i*2));
  report.audioPreview={durationSeconds:pcm.length/22050,peak:Math.max(...pcm.map(Math.abs).filter((_,i)=>i%4===0))};assert.ok(report.audioPreview.peak>.02&&report.audioPreview.peak<.8);await writeFile(`${dir}/flight-audio-preview.wav`,wav);
  assert.deepEqual(report.errors,[]);await writeFile(`${dir}/browser-report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
