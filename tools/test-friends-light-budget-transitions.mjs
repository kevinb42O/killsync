import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3001';
const browser=await playwright.chromium.launch({headless:true,args:['--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});page.setDefaultTimeout(120000);
 await page.addInitScript(()=>{localStorage.setItem('cinematicEffects','off');localStorage.setItem('killsync.friends.menu.pause','true');});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/game/rendering/FriendsMenuScene.ts*',r=>r.fulfill({contentType:'application/javascript',body:'export function createFriendsMenuScene(){return()=>{};}'}));
 await page.route('**/src/game/multiplayer/MultiplayerRendererBridge.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text())+'\n{const original=MultiplayerRendererBridge.prototype.render;MultiplayerRendererBridge.prototype.render=function(...args){window.bridge=this;window.lastRenderArgs=args;return original.apply(this,args);};}\n'});});
 console.log('Opening Friends benchmark');await page.goto(origin+'/?mode=friends');await page.getByLabel('Your name',{exact:true}).fill('Render research');await page.getByRole('button',{name:'Open my island',exact:true}).click();await page.getByRole('button',{name:'Head into the island',exact:true}).click();await page.locator('.coop-arena').waitFor();await page.waitForFunction(()=>window.bridge);console.log('Island loaded; settling');await page.waitForTimeout(20000);
 await page.evaluate(()=>{bridge.frontierVisuals.setEnvironment({hour:9,speed:0,windSpeed:0});bridge.renderer.yaw=-2.3;bridge.renderer.pitch=-.3;});await page.waitForTimeout(10000);
 const result=await page.evaluate(async(processAdaptive)=>{
 const b=window.bridge,p=b.renderer,r=p.renderer,scene=p.scene,camera=p.camera;
 b.render=()=>{};if(processAdaptive){const {FriendsPointLightBudget}=await import('/src/game/rendering/FriendsPointLightBudget.ts');new FriendsPointLightBudget(r,scene);}const target=p.nightVision.buffer;
 const castle=scene.getObjectByName('highfall-torchlit-fortress');
 const station=scene.getObjectByName('sunline-grand-traverse');const stationLights=station.children.filter(o=>o.isPointLight);
 const gl=r.getContext();let compiled=0,linked=0,blockingMs=0;
 const originalCompile=gl.compileShader.bind(gl),originalLink=gl.linkProgram.bind(gl),originalQuery=gl.getProgramParameter.bind(gl);
 gl.compileShader=s=>{compiled++;return originalCompile(s);};gl.linkProgram=p=>{linked++;return originalLink(p);};
 gl.getProgramParameter=(p,key)=>{const start=performance.now();try{return originalQuery(p,key);}finally{blockingMs+=performance.now()-start;}};
 const rail=b.scenicRailVisuals;const far=camera.position.clone().set(60000,12000,60000),near=camera.position.clone().set(6800,786,7500),frames=[];
 for(const [name,pos] of [['far',far],['far-repeat',far],['approach-train',near],['near-repeat',near]]){
 castle.update(5,far);rail.update({position:pos},true,85000);compiled=linked=blockingMs=0;r.shadowMap.needsUpdate=false;r.setRenderTarget(target);const start=performance.now();r.render(scene,camera);const renderMs=performance.now()-start;r.setRenderTarget(null);
 frames.push({name,renderMs,compiled,linked,blockingMs,activeRailLights:stationLights.filter(l=>l.intensity>0).length});await new Promise(resolve=>setTimeout(resolve,100));
 }
 return{frames,adaptive:processAdaptive,warmup:p.friendsShaderWarmup.stats};
 },process.env.FRIENDS_TEST_ADAPTIVE==='true');
 await writeFile(process.env.FRIENDS_TRANSITION_OUTPUT||'artifacts/render-cost-research/light-budget-train-after.json',JSON.stringify({errors,...result},null,2));console.log(JSON.stringify(result));if(errors.length)throw Error('Browser errors: '+errors.join('; '));if(process.env.FRIENDS_ASSERT_NO_TRANSITION==='true'){if(result.frames.find(f=>f.name==='approach-train').activeRailLights!==6)throw Error('Probe did not activate the station lamps');if(result.frames.slice(1).some(f=>f.compiled||f.linked||f.renderMs>500))throw Error('Station approach compiled shaders or stalled');}
}finally{await browser.close();}
