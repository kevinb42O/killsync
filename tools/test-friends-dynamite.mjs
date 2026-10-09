import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014',directory='artifacts/dynamite';
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
  await page.evaluate(async()=>{
    const element=document.querySelector('.coop-arena'),key=Object.keys(element).find(k=>k.startsWith('__reactFiber'));
    let fiber=element[key],simulation,bridge;
    while(fiber){let hook=fiber.memoizedState;while(hook){const value=hook.memoizedState?.current;if(value?.createSnapshot&&value?.setInput)simulation=value;if(value?.getFriendsTerrain&&value?.setFriendsTool)bridge=value;hook=hook.next;}fiber=fiber.return;}
    if(!simulation||!bridge)throw new Error('Arena test refs not found');
    const {FriendsBuilding}=await import('/src/game/multiplayer/FriendsBuilding.ts');
    const block={id:1,x:8000,y:8000,z:0,rotation:0,shape:'block',finish:'stone',author:'Review',revision:1};
    simulation.friendsBuilding=new FriendsBuilding({revision:1,guestsCanBuild:true,pieces:[block,{...block,id:2,x:8032},{...block,id:3,x:8256}]},simulation.friendsBuilding.getRevision()+1);
    simulation.friendsFrontier.terrain.addGrade([8000,8000,0,512]);
    const player=[...simulation.players.values()][0];Object.assign(player,{x:7940,y:8000,z:0,verticalVelocity:0});
    bridge.renderer.yaw=-Math.PI/2;bridge.renderer.pitch=-Math.atan2(26,60);
    window.dynamiteReview={simulation,bridge,player};
    const dynamite=simulation.friendsDynamite,tick=dynamite.tick.bind(dynamite);
    dynamite.tick=(...args)=>{tick(...args);if(dynamite.snapshot().blasts.length&&!window.dynamiteReview.impulse)window.dynamiteReview.impulse={vx:player.velocityX,vy:player.velocityY,vz:player.verticalVelocity};};
  });
  await page.keyboard.press('t');await page.getByRole('region',{name:'Fun bar'}).waitFor();
  await page.keyboard.press('5');
  await page.waitForFunction(()=>{const r=window.dynamiteReview,v=r.bridge.gestureViewmodels;return v?.root.visible&&v.root.getObjectByName('friends-held-dynamite')?.visible;});
  await page.screenshot({path:directory+'/in-game-held.png'});
  await page.evaluate(()=>{const {bridge}=window.dynamiteReview;bridge.renderer.yaw=-Math.PI/2;bridge.renderer.pitch=-.9;});
  await page.mouse.click(550,370);
  await page.waitForFunction(()=>window.dynamiteReview.simulation.createSnapshot().friends.dynamite.charges.length===1);
  assert.equal(await page.evaluate(()=>window.dynamiteReview.simulation.friendsBuilding.getPieces().length),3);
  await page.screenshot({path:directory+'/in-game-fuse.png'});
  await page.waitForFunction(()=>window.dynamiteReview.simulation.friendsBuilding.getPieces().length===1);
  const result=await page.evaluate(()=>{const s=window.dynamiteReview.simulation.createSnapshot();return {pieces:s.friends.building.pieces.map(p=>p.id),blast:s.friends.dynamite.blasts[0],motion:s.players[0].motion,impulse:window.dynamiteReview.impulse,terrainEdits:s.friends.frontier.terrain.edits.length};});
  assert.deepEqual(result.pieces,[3]);assert.equal(result.blast.destroyed,2);assert.ok(result.blast.terrainDestroyed>0);assert.ok(result.impulse.vz>0);assert.ok(Math.hypot(result.impulse.vx,result.impulse.vy)>100);assert.ok(result.terrainEdits>0);
  report.checks.push('Fun slot 5 shows held dynamite; a production click throws it, blasts two nearby pieces and natural terrain, and pushes the nearby player upward');
  await page.screenshot({path:directory+'/in-game-after.png'});
  assert.deepEqual(report.errors,[]);await writeFile(directory+'/gameplay-checks.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){if(currentPage)await currentPage.screenshot({path:directory+'/failure.png'}).catch(()=>{});throw error;}finally{await browser.close();}
