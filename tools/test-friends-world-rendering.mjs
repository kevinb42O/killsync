import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(process.env.PLAYWRIGHT_MODULE||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const sharp=require('sharp');
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3011';
const directory='artifacts/friends-world-loading';
const report={date:new Date().toISOString(),origin,checks:[],errors:[],frames:[]};
await mkdir(directory,{recursive:true});
const browser=await playwright.chromium.launch({headless:true,args:[...(process.env.FRIENDS_TEST_ANGLE?[`--use-angle=${process.env.FRIENDS_TEST_ANGLE}`]:['--enable-unsafe-swiftshader']),'--disable-background-timer-throttling','--disable-renderer-backgrounding']});
let currentPage;
const check=name=>{report.checks.push(name);console.log('PASS',name);};
async function capture(page,canvas,name){
 const {glError,gpu}=await canvas.evaluate(c=>{const gl=c.getContext('webgl2'),ext=gl?.getExtension('WEBGL_debug_renderer_info');return {glError:gl?.getError(),gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null};});
 report.gpu=gpu;
 assert.equal(glError,0,`${name}: WebGL draw error ${glError}`);
 const buffer=await canvas.screenshot({path:`${directory}/${name}.png`});
 const {data,info}=await sharp(buffer).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const colors=new Set();let sum=0;
 // Inspect the canvas itself, away from the central crosshair and tool.
 for(let y=Math.floor(info.height*.2);y<info.height*.8;y+=3)for(let x=15;x<info.width*.45;x+=3){const i=(y*info.width+x)*info.channels;colors.add(`${data[i]>>4}:${data[i+1]>>4}:${data[i+2]>>4}`);sum+=data[i]+data[i+1]+data[i+2];}
 assert(colors.size>25,`${name}: canvas has only ${colors.size} colors; world may be blank`);
 const frame={name,colors:colors.size,brightnessSum:sum,draws:await canvas.evaluate(c=>c.__friendsDraws||0)};
 assert(frame.draws>100,`${name}: no sustained WebGL world drawing`);report.frames.push(frame);return frame;
}
async function play(delayed){
 const context=await browser.newContext({viewport:{width:900,height:650},reducedMotion:'reduce'});
 await context.addInitScript(()=>{
  localStorage.setItem('cinematicEffects','off');localStorage.setItem('killsync.friends.menu.pause','true');
  // Headless Chromium cannot capture the OS pointer. Emulate only that
  // platform contract; the production mouse handlers and renderer remain real.
  let locked=null;
  Object.defineProperty(document,'pointerLockElement',{get:()=>locked});
  HTMLCanvasElement.prototype.requestPointerLock=function(){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();};
  document.exitPointerLock=()=>{locked=null;document.dispatchEvent(new Event('pointerlockchange'));};
  for(const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){const original=WebGL2RenderingContext.prototype[name];WebGL2RenderingContext.prototype[name]=function(...args){this.canvas.__friendsDraws=(this.canvas.__friendsDraws||0)+1;return original.apply(this,args);};}
 });
 if(delayed)await context.addInitScript(()=>{
  const original=WebGL2RenderingContext.prototype.getProgramParameter;
  WebGL2RenderingContext.prototype.getProgramParameter=function(program,name){return name===0x91b1?false:original.call(this,program,name);};
 });
 const page=await context.newPage();page.setDefaultTimeout(90000);
 currentPage=page;
 page.on('pageerror',error=>report.errors.push(error.message));page.on('crash',()=>report.errors.push('Browser page crashed'));
 page.on('console',message=>{if(message.type()==='error'||/GL_INVALID_|GL_OUT_OF_MEMORY/.test(message.text()))report.errors.push(message.text());});
 if(delayed)await page.route('**/textures/frontier/**',async route=>{await new Promise(resolve=>setTimeout(resolve,8000));await route.continue().catch(()=>{});});
 await page.goto(`${origin}/?mode=friends`,{waitUntil:'domcontentloaded'});
 console.log('Opening',delayed?'slow-resource island':'fresh island');
 await page.getByLabel('Your name',{exact:true}).fill(delayed?'Slow assets':'Fresh PC');
 await page.getByRole('button',{name:'Open my island',exact:true}).click();
 await page.getByRole('button',{name:'Head into the island',exact:true}).click();
 await page.locator('.coop-arena').waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('.coop-arena canvas')].some(c=>c.__friendsDraws>100),undefined,{timeout:30000});
 console.log('World drawing');
 await page.waitForFunction(()=>!document.body.innerText.includes('OPERATOR LINK / SUNLINE COMMONS'),undefined,{timeout:90000});
 console.log('Arrival complete');
 assert(!await page.getByText('Preparing island graphics…',{exact:true}).count());
 await page.evaluate(()=>{const canvases=[...document.querySelectorAll('.coop-arena canvas')];canvases.sort((a,b)=>b.width*b.height-a.width*a.height);canvases[0].dataset.worldRenderTest='true';});
 const canvas=page.locator('[data-world-render-test]');
 await canvas.click({position:{x:450,y:325}});
 await page.waitForFunction(()=>document.pointerLockElement?.tagName==='CANVAS');
 console.log('Pointer locked');
 const start=await capture(page,canvas,delayed?'delayed-start':'fresh-start');
 await page.evaluate(()=>window.dispatchEvent(new MouseEvent('mousemove',{movementX:Math.PI/.0022,movementY:100,bubbles:true})));
 await page.waitForTimeout(1000);
 const turned=await capture(page,canvas,delayed?'delayed-island':'fresh-island');
 assert(Math.abs(start.brightnessSum-turned.brightnessSum)>10000,'Turning must change the rendered scenery');
 check(`${delayed?'delayed textures and shader readiness that never completes':'fresh browser storage'}: visible world appears and mouse look changes the canvas`);
 if(!delayed){
  for(const [delta,names] of [[100,['Pickaxe','Shovel','Earthwork','Combat','Rope','Axe']],[-100,['Rope','Combat','Earthwork','Shovel','Pickaxe','Axe']]])for(const name of names){await page.mouse.wheel(0,delta);await page.waitForFunction(name=>document.querySelector('.frontier-toolbelt [aria-pressed=true]')?.textContent.includes(name),name);}
  check('wheel cycles every tool in both directions, including wraparound');
  await page.keyboard.down('w');await page.waitForTimeout(1500);await page.keyboard.up('w');
  await capture(page,canvas,'after-moving');check('world keeps drawing after movement and tool swaps');
  await page.keyboard.press('g');const dialog=page.getByRole('dialog',{name:'Frontier field pack'});await dialog.waitFor();
  const scrollAllowed=await dialog.evaluate(d=>{const event=new WheelEvent('wheel',{deltaY:100,bubbles:true,cancelable:true});d.dispatchEvent(event);return !event.defaultPrevented;});assert(scrollAllowed);
  await dialog.getByRole('button',{name:'Return to arrival point',exact:true}).click();
  await page.keyboard.press('Escape');
  await page.getByText('OPERATOR LINK / SUNLINE COMMONS',{exact:true}).waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.body.innerText.includes('OPERATOR LINK / SUNLINE COMMONS'),undefined,{timeout:90000});
  await capture(page,canvas,'repeat-arrival');check('field pack scroll and repeat arrival remain playable');
 }
 await context.close();
}
try{await play(false);await play(true);assert.deepEqual(report.errors,[]);check('production app has no runtime or shader errors');}
catch(error){report.failure=String(error);if(currentPage&&!currentPage.isClosed()){report.text=await currentPage.locator('body').innerText().catch(()=>null);await currentPage.screenshot({path:`${directory}/failure.png`}).catch(()=>{});}throw error;}
finally{await writeFile(`${directory}/browser.json`,JSON.stringify(report,null,2));await browser.close();}
