import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser=await chromium.launch({headless:true}),report={errors:[]};
try{
 const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto('http://localhost:3014/tools/dive-audio-review.html');await page.click('#dive');
 await page.waitForFunction(()=>window.diveAudioReview.audio.underwaterDiveVoice,{},{timeout:30000});await page.waitForTimeout(850);
 report.wet=await page.evaluate(()=>{const a=diveAudioReview.audio,n=a.voices.size;a.play('swimStroke',.25,0);a.play('waterStep',.25,0);return {context:a.context.state,effectsCutoff:a.effectsWaterFilter.frequency.value,ambienceCutoff:a.ambienceWaterFilter.frequency.value,voicesBefore:n,voicesAfter:a.voices.size,duration:a.underwaterDiveVoice.source.buffer.duration,loop:a.underwaterDiveVoice.source.loop,loopStart:a.underwaterDiveVoice.source.loopStart,loopEnd:a.underwaterDiveVoice.source.loopEnd};});
 assert.equal(report.wet.context,'running');assert.ok(report.wet.effectsCutoff<1000);assert.ok(report.wet.ambienceCutoff<800);assert.equal(report.wet.voicesBefore,report.wet.voicesAfter);assert.equal(report.wet.loop,true);assert.ok(report.wet.duration>1);
 await page.click('#resurface');await page.waitForTimeout(850);
 report.dry=await page.evaluate(()=>{const a=diveAudioReview.audio;return {effectsCutoff:a.effectsWaterFilter.frequency.value,ambienceCutoff:a.ambienceWaterFilter.frequency.value,underwaterVoice:Boolean(a.underwaterDiveVoice),breathPlayed:a.lastCue.has('waterBreathIn')};});
 assert.ok(report.dry.effectsCutoff>21000);assert.ok(report.dry.ambienceCutoff>21000);assert.equal(report.dry.underwaterVoice,false);assert.equal(report.dry.breathPlayed,true);
 await page.click('#stop');assert.deepEqual(report.errors,[]);
}finally{await mkdir('artifacts/dive-fixes',{recursive:true});await writeFile('artifacts/dive-fixes/audio-checks.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
