import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(process.env.PLAYWRIGHT_MODULE||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const sharp=require('sharp');
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3011';
const directory=process.env.FRIENDS_TEST_ARTIFACT_DIR||'artifacts/friends-day-night';
const report={date:new Date().toISOString(),origin,checks:[],errors:[],phases:[],frames:[]};
await mkdir(directory,{recursive:true});
const browser=await playwright.chromium.launch({headless:true,args:[...(process.env.FRIENDS_TEST_ANGLE?[`--use-angle=${process.env.FRIENDS_TEST_ANGLE}`]:['--enable-unsafe-swiftshader']),'--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const context=await browser.newContext({viewport:{width:1100,height:700}});
await context.addInitScript(()=>{
 localStorage.setItem('cinematicEffects','off');localStorage.setItem('killsync.friends.menu.pause','true');
 let locked=null;
 Object.defineProperty(document,'pointerLockElement',{get:()=>locked});
 HTMLCanvasElement.prototype.requestPointerLock=function(){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();};
 document.exitPointerLock=()=>{locked=null;document.dispatchEvent(new Event('pointerlockchange'));};
 window.cycleProfile={compiles:0,frames:[],phase:'startup'};
 const compile=WebGL2RenderingContext.prototype.compileShader;
 WebGL2RenderingContext.prototype.compileShader=function(...args){cycleProfile.compiles++;return compile.apply(this,args);};
 let last;
 const frame=now=>{if(last!==undefined)cycleProfile.frames.push({ms:now-last,phase:cycleProfile.phase});last=now;requestAnimationFrame(frame);};requestAnimationFrame(frame);
});
const page=await context.newPage();page.setDefaultTimeout(90000);
page.on('pageerror',e=>report.errors.push(e.message));page.on('crash',()=>report.errors.push('Page crashed'));
page.on('console',m=>{if(m.type()==='error'||/GL_INVALID_|GL_OUT_OF_MEMORY/.test(m.text()))report.errors.push(m.text());});
const check=name=>{report.checks.push(name);console.log('PASS',name);};
async function environment(time,speed,phase){
 await page.keyboard.press('c');const dialog=page.getByRole('dialog',{name:'Frontier developer settings'});await dialog.waitFor();
 const before=await page.evaluate(phase=>{cycleProfile.phase=phase;return cycleProfile.compiles;},phase);
 await dialog.getByLabel('Cycle speed').selectOption('0');
 await dialog.getByLabel('Exact time of day').fill(time);
 await dialog.getByLabel('Cycle speed').selectOption(String(speed));
 await dialog.getByRole('button',{name:'Close developer settings'}).click();
 return before;
}
async function capture(phase){
 const canvas=page.locator('.coop-arena canvas').first();
 const state=await canvas.evaluate(c=>{const gl=c.getContext('webgl2'),e=gl.getExtension('WEBGL_debug_renderer_info');return{error:gl.getError(),gpu:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):null};});
 assert.equal(state.error,0,`${phase}: invalid WebGL draw`);report.gpu=state.gpu;
 const buffer=await canvas.screenshot({path:`${directory}/${phase}.png`});
 const {data,info}=await sharp(buffer).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const colors=new Set();let brightness=0;
 for(let y=Math.floor(info.height*.2);y<info.height*.8;y+=3)for(let x=15;x<info.width*.45;x+=3){const i=(y*info.width+x)*info.channels;colors.add(`${data[i]>>4}:${data[i+1]>>4}:${data[i+2]>>4}`);brightness+=data[i]+data[i+1]+data[i+2];}
 assert(colors.size>25,`${phase}: world appears blank`);report.frames.push({phase,colors:colors.size,brightness});
}
try{
 await page.goto(`${origin}/?mode=friends`,{waitUntil:'domcontentloaded'});
 await page.getByLabel('Your name',{exact:true}).fill('Day-night QA');
 await page.getByRole('button',{name:'Open my island',exact:true}).click();
 await page.getByRole('button',{name:'Head into the island',exact:true}).click();await page.locator('.coop-arena').waitFor();
 await page.waitForFunction(()=>!document.body.innerText.includes('OPERATOR LINK / SUNLINE COMMONS'));
 await page.locator('.coop-arena canvas').first().click({position:{x:500,y:350}});
 await page.evaluate(()=>window.dispatchEvent(new MouseEvent('mousemove',{movementX:-2.3/.0022,movementY:100,bubbles:true})));
 await environment('09:00',0,'warmup');await page.waitForTimeout(15000);
 for(const [time,phase] of [['12:00','noon'],['18:00','sunset'],['18:03','dusk-shadow-gap'],['18:39','moonrise'],['00:00','midnight'],['05:57','dawn-shadow-gap'],['06:03','sunrise']]){
  const before=await environment(time,0,phase);await page.waitForTimeout(500);
  const after=await page.evaluate(()=>cycleProfile.compiles);report.phases.push({phase,time,shaderCompilations:after-before});
  assert.equal(after,before,`${phase}: changing time compiled new shaders`);await capture(phase);
 }
 check('no shader compilations while scrubbing noon, sunset, the dusk shadow gap, moonrise, midnight, dawn and sunrise');
 const noon=report.frames.find(f=>f.phase==='noon'),night=report.frames.find(f=>f.phase==='midnight');assert(noon.brightness>night.brightness*1.2,'day/night lighting must remain visibly different');
 check('terrain remains visible at every phase and midnight is darker than noon; no WebGL draw errors');
 const before=await environment('09:00',120,'fast-cycle');await page.waitForTimeout(30000);
 const profile=await page.evaluate(()=>cycleProfile),frames=profile.frames.filter(f=>f.phase==='fast-cycle').map(f=>f.ms).sort((a,b)=>a-b);
 report.fastCycle={speed:120,durationMs:30000,cycles:2.5,shaderCompilations:profile.compiles-before,frames:frames.length,p95Ms:frames[Math.floor(frames.length*.95)],maxMs:frames.at(-1),stallsOver500Ms:frames.filter(ms=>ms>500).length};
 assert.equal(report.fastCycle.shaderCompilations,0,'accelerated cycles compiled new shaders');
 assert.equal(report.fastCycle.stallsOver500Ms,0,'accelerated cycle stalled for >500 ms');assert(frames.length>100,'cycle must keep drawing');
 check('2.5 full day/night cycles at 120×: zero shader compilations and zero stalls over 500 ms');
 assert.deepEqual(report.errors,[]);check('production app has no runtime or shader errors');
 console.log(JSON.stringify(report.fastCycle,null,2));
}catch(error){report.failure=String(error);report.text=await page.locator('body').innerText().catch(()=>null);await page.screenshot({path:`${directory}/failure.png`}).catch(()=>{});throw error;}
finally{await writeFile(`${directory}/browser.json`,JSON.stringify(report,null,2));await browser.close();}
