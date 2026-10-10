import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir, writeFile} from 'node:fs/promises';

const require=createRequire(import.meta.url);
const {chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser=await chromium.launch({headless:true});
const report={errors:[]};
try {
  const page=await browser.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  // Render the real game graph deterministically, including the complete loop
  // boundary, without depending on an available desktop audio output device.
  await page.addInitScript(()=>{
    localStorage.setItem('sunline.audio.v1',JSON.stringify({music:0,ambience:0,effects:1,muted:false}));
    class RenderContext extends OfflineAudioContext {
      constructor(){super(2,32000*62,32000);window.renderContext=this;}
      get state(){return 'running';}
      resume(){return Promise.resolve();}
      suspend(){return Promise.resolve();}
      close(){return Promise.resolve();}
    }
    window.AudioContext=RenderContext;
  });
  await page.goto('http://localhost:3014/tools/dive-audio-review.html');
  await page.click('#surface');
  await page.waitForFunction(()=>{
    const a=window.diveAudioReview.audio;
    return [...a.buffers.keys()].some(url=>url.endsWith('underwater_bubbles_loop.ogg')) &&
      [...a.buffers.keys()].some(url=>url.endsWith('cinematic_dive_underwater.mp3'));
  },{},{timeout:30000});
  await page.click('#dive');
  report.wet=await page.evaluate(async()=>{
    const a=window.diveAudioReview.audio;
    const source=a.underwaterDiveVoice.source;
    const cueBefore=a.lastCue.get('waterDive');
    a.setUnderwaterDive(true);
    const sameSource=source===a.underwaterDiveVoice.source;
    const rendered=await window.renderContext.startRendering();
    function rms(start,end){
      const data=rendered.getChannelData(0);let energy=0;
      for(let i=start*32000;i<end*32000;i++)energy+=data[i]*data[i];
      return Math.sqrt(energy/((end-start)*32000));
    }
    let peak=0;for(const sample of rendered.getChannelData(0))peak=Math.max(peak,Math.abs(sample));
    return {duration:source.buffer.duration,channels:source.buffer.numberOfChannels,
      loop:source.loop,loopStart:source.loopStart,loopEnd:source.loopEnd,sameSource,
      splashOnce:cueBefore===a.lastCue.get('waterDive'),
      firstMinuteOnly:source.buffer.duration<=60,
      rmsMiddle:rms(25,26),rmsBeforeJoin:rms(58,59),rmsAfterJoin:rms(59,60),
      seamJump:Math.abs(rendered.getChannelData(0)[59*32000]-rendered.getChannelData(0)[59*32000-1]),
      peak,effectsCutoff:a.effectsWaterFilter.frequency.value,ambienceCutoff:a.ambienceWaterFilter.frequency.value};
  });
  assert.equal(report.wet.duration,59);
  assert.equal(report.wet.channels,2);
  assert.equal(report.wet.loop,true);
  assert.equal(report.wet.loopStart,0);
  assert.equal(report.wet.loopEnd,59);
  assert.equal(report.wet.sameSource,true);
  assert.equal(report.wet.splashOnce,true);
  for(const key of ['rmsMiddle','rmsBeforeJoin','rmsAfterJoin'])assert.ok(report.wet[key]>.005,key);
  assert.ok(report.wet.peak<1);
  assert.ok(report.wet.seamJump<.01,'No click at the loop boundary');
  assert.ok(report.wet.effectsCutoff<1000);
  assert.ok(report.wet.ambienceCutoff<800);
  await page.click('#resurface');
  await page.waitForFunction(()=>window.diveAudioReview.audio.lastCue.has('waterBreathIn'));
  report.dry=await page.evaluate(()=>({underwaterVoice:Boolean(diveAudioReview.audio.underwaterDiveVoice),breathPlayed:diveAudioReview.audio.lastCue.has('waterBreathIn')}));
  assert.equal(report.dry.underwaterVoice,false);
  assert.equal(report.dry.breathPlayed,true);
  await page.click('#stop');
  assert.deepEqual(report.errors,[]);
} finally {
  await browser.close();
  await mkdir('artifacts/dive-fixes',{recursive:true});
  await writeFile('artifacts/dive-fixes/submerged-loop-checks.json',JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(report,null,2));
