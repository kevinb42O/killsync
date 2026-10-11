import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir,writeFile } from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014',directory='artifacts/seagulls';
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required']}),report={errors:[],views:[]};
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(origin+'/tools/friends-coastal-pier-review.html');
  await page.waitForFunction(()=>window.coastalPierReview?.scene.getObjectByName('west-beach-fishing-boat')?.userData.modelReady);
  await page.locator('aside').evaluate(e=>e.style.display='none');
  for(const view of ['boat','deck']){
    await page.evaluate(v=>window.coastalPierReview.setView(v),view);await page.waitForTimeout(1200);
    const result=await page.evaluate(()=>{
      const r=window.coastalPierReview,g=r.scene.getObjectByName('sunline-coastal-seagulls');r.renderer.render(r.scene,r.camera);const before={...r.renderer.info.render};
      const visible=g.visible;g.visible=false;r.renderer.render(r.scene,r.camera);const after={...r.renderer.info.render};g.visible=visible;
      return {count:g.count,trianglesPerBird:g.geometry.attributes.position.count/3,drawCalls:before.calls-after.calls,renderedTriangles:before.triangles-after.triangles,gl:r.renderer.getContext().getError()};
    });
    assert(result.count>0&&result.count<=6);assert.equal(result.drawCalls,1);assert(result.trianglesPerBird<=32);assert.equal(result.gl,0);
    report.views.push({view,...result});await page.screenshot({path:`${directory}/${view}.png`});
  }
  await page.evaluate(()=>window.coastalPierReview.setView('boat'));await page.waitForTimeout(150);
  await page.evaluate(async()=>{
    const r=window.coastalPierReview;
    r.setView('boat');r.pause();const mesh=r.scene.getObjectByName('sunline-coastal-seagulls'),matrix=mesh.instanceMatrix.array;
    const x=matrix[12],y=matrix[13],z=matrix[14];r.camera.position.set(x+60,y+22,z+85);r.camera.lookAt(x,y,z);r.renderer.render(r.scene,r.camera);
  });await page.screenshot({path:`${directory}/gull-close.png`});
  report.audio=await page.evaluate(async()=>{
    const {FriendsAudio}=await import('/src/game/FriendsAudio.ts'),context=new AudioContext();
    const r=window.coastalPierReview;r.setView('boat');
    const mix=r.world.seagullSoundMix(0);
    r.camera.lookAt(r.camera.position.x,r.camera.position.y-100,r.camera.position.z);
    const away=r.world.seagullSoundMix(0);
    if(mix.volume<=.05||Math.abs(mix.volume-away.volume)>1e-6)throw Error('Flock ambience depends on camera view');
    const response=await fetch('/audio/friends/seagull_beach.ogg'),bytes=await response.arrayBuffer(),size=bytes.byteLength,buffer=await context.decodeAudioData(bytes);await context.close();
    const audio=new FriendsAudio(),release=audio.acquire();audio.setSettings({music:0,ambience:1,effects:1,muted:false});audio.activate();await audio.context.resume();audio.setSeagullSound({volume:.15,pan:.5});
    const deadline=performance.now()+15000;while(!audio.buffers.has('/audio/friends/seagull_beach.ogg')&&performance.now()<deadline)await new Promise(r=>setTimeout(r,50));
    // Advance only the encounter deadline; test real sources and browser decoding without a long wait.
    audio.nextSeagullCall=-1;audio.setSeagullSound({volume:.15,pan:.5});const source=audio.seagullVoice;
    if(!source||source.loop)throw Error('Missing non-looping gull source');audio.setSeagullSound({volume:0,pan:0});if(audio.seagullVoice)throw Error('Range exit retained source');
    audio.nextSeagullCall=-1;audio.lastCue.delete('birdSeagull');audio.setSeagullSound({volume:.15,pan:0});audio.setSettings({ambience:0});if(audio.seagullVoice)throw Error('Ambience zero retained source');
    release();audio.dispose();return {size,duration:buffer.duration,channels:buffer.numberOfChannels,excerptSeconds:10,nonLooping:true,rangeCleanup:true,volumeCleanup:true,flockVolume:mix.volume,viewIndependent:true};
  });
  assert(report.audio.duration>28);assert.deepEqual(report.errors,[]);
  console.log(JSON.stringify(report,null,2));
}finally{await writeFile(`${directory}/validation.json`,JSON.stringify(report,null,2));await browser.close();}
