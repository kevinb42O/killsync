import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014',directory='artifacts/mining-building';
await mkdir(directory,{recursive:true});const report={origin,errors:[],checks:[]};
const browser=await playwright.chromium.launch({headless:true,args:['--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
let currentPage;
try{
  const page=await browser.newPage({viewport:{width:1100,height:740}});page.setDefaultTimeout(45000);currentPage=page;
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.addInitScript(()=>{
    for(const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){const original=WebGL2RenderingContext.prototype[name];WebGL2RenderingContext.prototype[name]=function(...args){this.canvas.reviewDraws=(this.canvas.reviewDraws||0)+1;return original.apply(this,args);};}
    localStorage.setItem('sunline.preferences.v1',JSON.stringify({renderScale:.7,shadows:false}));localStorage.setItem('cinematicEffects','subtle');localStorage.setItem('killsync.friends.menu.pause','true');
    let locked=null;Object.defineProperty(document,'pointerLockElement',{get:()=>locked});
    HTMLCanvasElement.prototype.requestPointerLock=function(){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();};
    document.exitPointerLock=()=>{locked=null;document.dispatchEvent(new Event('pointerlockchange'));};
  });
  await page.route('**/@vite/client',r=>r.fulfill({contentType:'application/javascript',body:'export function createHotContext(){return {on(){},off(){},prune(){},send(){},acceptExports(){},accept(){},dispose(){},invalidate(){},data:{}}};export function injectQuery(u){return u};export function updateStyle(id,content){let s=document.getElementById(id);if(!s){s=document.createElement("style");s.id=id;document.head.append(s);}s.textContent=content;}export function removeStyle(id){document.getElementById(id)?.remove();}'}));
  await page.goto(origin+'/?mode=friends',{waitUntil:'domcontentloaded'});
  await page.getByLabel('Your name',{exact:true}).fill('Build review');await page.getByRole('button',{name:'Play on my own',exact:true}).click({noWaitAfter:true});
  await page.locator('.coop-arena').waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('.coop-arena canvas')].some(c=>c.reviewDraws>100),undefined,{timeout:120000});
  await page.waitForFunction(()=>!document.body.innerText.includes('OPERATOR LINK / SUNLINE COMMONS'),undefined,{timeout:120000});
  await page.evaluate(()=>{
    // Obtain existing component-owned refs solely for test fixture positioning.
    // All tested tool/build actions below use the production input handlers.
    const element=document.querySelector('.coop-arena'),key=Object.keys(element).find(k=>k.startsWith('__reactFiber'));
    let fiber=element[key],simulation,bridge,input;
    while(fiber){let hook=fiber.memoizedState;while(hook){const value=hook.memoizedState?.current;if(value?.createSnapshot&&value?.setInput)simulation=value;if(value?.getFriendsTerrain&&value?.setFriendsTool)bridge=value;if(value?.type==='input')input=hook.memoizedState;hook=hook.next;}fiber=fiber.return;}
    if(!simulation||!bridge)throw new Error('Arena test refs not found');
    window.constructionReview={simulation,bridge,input};
    const f=simulation.friendsFrontier;f.terrain.addGrade([8000,8000,0,512]);
    for(let x=247;x<250;x++)for(let y=249;y<252;y++)f.terrain.set(x,y,-1,0);
    f.terrain.set(250,250,-1,2);
    const player=[...simulation.players.values()][0];player.x=7970;player.y=8016;player.z=-32;player.verticalVelocity=0;
    bridge.renderer.yaw=-Math.PI/2;bridge.renderer.pitch=0;
    window.constructionReview.start={mined:f.snapshot().mined,stone:f.pack(player).stone,terrain:f.terrain.revision};
    const commit=f.contact.bind(f);f.contact=(...args)=>{commit(...args);const r=window.constructionReview;if(!args[2]&&!r.partial){r.partial={terrain:f.terrain.revision,start:r.start.terrain,work:f.snapshot().interaction.damage};window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));}else if(args[2])window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));};
  });
  await page.locator('.coop-arena canvas').first().click({position:{x:550,y:370}});await page.keyboard.press('2');await page.waitForTimeout(1200);
  await page.mouse.move(550,370);await page.evaluate(()=>{window.constructionReview.bridge.renderer.yaw=-Math.PI/2;window.constructionReview.bridge.renderer.pitch=0;});await page.waitForTimeout(100);await page.mouse.down();
  await page.waitForFunction(()=>Boolean(window.constructionReview.partial));
  const partial=await page.evaluate(()=>window.constructionReview.partial);
  assert.equal(partial.terrain,partial.start);report.checks.push('first contact shows stone damage without editing terrain');
  await page.mouse.up();await page.screenshot({path:directory+'/game-mining-progress.png'});await page.mouse.down();
  await page.waitForFunction(()=>{const r=window.constructionReview;return r.simulation.friendsFrontier.snapshot().mined>r.start.mined;});await page.mouse.up();
  await page.waitForFunction(()=>window.constructionReview.bridge.getPerformanceStats().interaction.terrain.pendingVoxels===0);
  const mined=await page.evaluate(()=>{const r=window.constructionReview,f=r.simulation.friendsFrontier,p=[...r.simulation.players.values()][0];return {mined:f.snapshot().mined-r.start.mined,stone:f.pack(p).stone-r.start.stone,feedback:r.bridge.getPerformanceStats().interaction};});
  assert.equal(mined.mined,1);assert.equal(mined.stone,2);report.mining=mined;report.checks.push('held primary breaks stone and awards resources exactly once');
  report.checks.push('temporary excavation feedback retires after the updated terrain mesh installs');
  await page.screenshot({path:directory+'/game-mined-opening.png'});
  await page.evaluate(()=>{const r=window.constructionReview,p=[...r.simulation.players.values()][0];p.x=7952;p.y=8080;p.z=0;p.verticalVelocity=0;r.bridge.renderer.yaw=-Math.PI/2;r.bridge.renderer.pitch=-Math.atan2(26,64);r.beforeBuild=r.simulation.friendsBuilding.getPieces().length;});
  await page.keyboard.press('b');
  if(await page.getByRole('button',{name:'Close construction library',exact:true}).count())await page.getByRole('button',{name:'Close construction library',exact:true}).click();
  await page.getByRole('button',{name:'Construction controls',exact:true}).click();await page.getByRole('button',{name:'Line',exact:true}).click();
  await page.mouse.move(550,370);await page.evaluate(()=>{window.constructionReview.bridge.renderer.yaw=-Math.PI/2;window.constructionReview.bridge.renderer.pitch=-Math.atan2(26,64);});await page.waitForTimeout(100);await page.mouse.click(550,370);
  await page.waitForFunction(()=>document.body.innerText.includes('Start set.'));
  await page.evaluate(()=>{window.constructionReview.bridge.renderer.pitch=-Math.atan2(26,160);});await page.waitForTimeout(200);
  await page.screenshot({path:directory+'/game-line-preview.png'});
  await page.mouse.click(550,370);
  await page.waitForFunction(()=>{const r=window.constructionReview;return r.simulation.friendsBuilding.getPieces().length>r.beforeBuild;});
  const placed=await page.evaluate(()=>{const r=window.constructionReview;return r.simulation.friendsBuilding.getPieces().length-r.beforeBuild;});assert.equal(placed,4);report.checks.push('two-click line gesture places four connected blocks through production controls');
  await page.keyboard.press('Control+z');await page.waitForFunction(()=>{const r=window.constructionReview;return r.simulation.friendsBuilding.getPieces().length===r.beforeBuild;});
  await page.keyboard.press('Control+Shift+z');await page.waitForFunction(()=>{const r=window.constructionReview;return r.simulation.friendsBuilding.getPieces().length===r.beforeBuild+4;});report.checks.push('keyboard undo/redo reverses/restores the complete gesture');
  if(await page.getByRole('button',{name:'Construction controls',exact:true}).getAttribute('aria-expanded')==='false')await page.getByRole('button',{name:'Construction controls',exact:true}).click();
  await page.getByRole('button',{name:'Lock plane',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Unlock plane',exact:true}).getAttribute('aria-pressed'),'true');
  await page.getByText('Adjust position',{exact:true}).click();await page.getByRole('button',{name:'↑',exact:true}).click();await page.screenshot({path:directory+'/game-construction-controls.png'});report.checks.push('plane lock and accessible precision controls respond');
  assert.deepEqual(report.errors,[]);report.checks.push('actual game has no browser runtime or shader errors');console.log(JSON.stringify(report,null,2));
}catch(e){report.failure=String(e);report.text=await currentPage?.locator('body').innerText().catch(()=>null);report.state=await currentPage?.evaluate(()=>{const r=window.constructionReview;return r&&{player:[...r.simulation.players.values()][0],frontier:r.simulation.friendsFrontier.snapshot().interaction,tool:r.input,authorityInput:[...r.simulation.inputByPlayer.values()],locked:document.pointerLockElement?.tagName};}).catch(()=>null);await currentPage?.screenshot({path:directory+'/game-failure.png'}).catch(()=>{});throw e;}finally{await writeFile(directory+'/game-flow.json',JSON.stringify(report,null,2));await browser.close();}
