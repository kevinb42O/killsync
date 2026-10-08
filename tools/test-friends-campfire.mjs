import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3000',directory='artifacts/friends-campfire';
await mkdir(directory,{recursive:true});
const browser=await playwright.chromium.launch({headless:true,args:['--use-angle=metal','--disable-background-timer-throttling','--disable-features=LocalNetworkAccessChecks']});
const report={errors:[]};
try{
 const page=await browser.newPage({viewport:{width:1000,height:720}});
 await page.routeWebSocket(url=>url.searchParams.has('token'),socket=>{const server=socket.connectToServer();server.onMessage(message=>{try{if(JSON.parse(String(message)).type==='connected')socket.send(message);}catch{}});});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.route('**/__campfire_review',r=>r.fulfill({contentType:'text/html',body:'<html><body style="margin:0;background:#080c13"><div id="world" style="width:100vw;height:100vh"></div></body></html>'}));
 await page.addInitScript(()=>{
  window.glErrors=[];
  for(const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){
    const original=WebGL2RenderingContext.prototype[name];
    WebGL2RenderingContext.prototype[name]=function(...args){const result=original.apply(this,args),error=this.getError();if(error)glErrors.push({name,error,object:window.currentObject});return result;};
  }
 });
 await page.goto(`${origin}/__campfire_review`);
 await page.evaluate(async()=>{
  const {FriendsSimulation}=await import('/src/game/multiplayer/FriendsSimulation.ts');
  const {MultiplayerRendererBridge}=await import('/src/game/multiplayer/MultiplayerRendererBridge.ts');
  const {FRIENDS_CAMPFIRE}=await import('/src/game/world/FriendsRegion.ts');
  window.sim=new FriendsSimulation([{id:'review',label:'Explorer',color:'#8de6ce'},{id:'friend',label:'Teammate',color:'#ffd494'}]);
  window.bridge=new MultiplayerRendererBridge('friends_frontier');bridge.mount(document.getElementById('world'));
  const p=sim.players.get('review');Object.assign(p,{x:FRIENDS_CAMPFIRE.x,y:FRIENDS_CAMPFIRE.y+280,z:FRIENDS_CAMPFIRE.z,angle:-Math.PI/2});
  const {CAMPFIRE_SEATS}=await import('/src/game/multiplayer/FriendsCampfireSeats.ts');
  Object.assign(sim.players.get('friend'),CAMPFIRE_SEATS[5],{z:FRIENDS_CAMPFIRE.z,angle:CAMPFIRE_SEATS[5].angle+Math.PI});sim.tick(50);sim.friends.interact(sim.players.get('friend'),sim.elapsedMs);
  bridge.renderer.yaw=0;bridge.renderer.pitch=-.17;bridge.setFriendsEnvironment({hour:22,speed:0});
  bridge.renderer.scene.traverse(o=>{const original=o.onBeforeRender;o.onBeforeRender=function(...args){window.currentObject=this.name||this.type;return original.apply(this,args);};});
  window.campfireReviewFrames=0;
  function frame(){if(window.stopFrames)return;sim.tick(50);bridge.render(sim.createSnapshot(),'review',33);campfireReviewFrames++;requestAnimationFrame(frame);}frame();
 });
 await page.waitForFunction(()=>campfireReviewFrames>150&&!bridge.friendsWorldArrival.sequence.active,undefined,{timeout:90000});
 await page.waitForTimeout(2000);
 await page.screenshot({path:`${directory}/night-world.png`});
 Object.assign(report,await page.evaluate(async()=>{
  window.stopFrames=true;
  const r=bridge.renderer.renderer,s=bridge.renderer.scene,c=bridge.renderer.camera,camp=bridge.frontierVisuals.campfire;
  const {Scene,PerspectiveCamera,WebGLRenderer}=await import('/node_modules/.vite/deps/three.js');
  const {FriendsCampfire}=await import('/src/game/rendering/FriendsCampfire.ts');
  const initialGlError=r.getContext().getError();
  const soloScene=new Scene(),soloCamera=new PerspectiveCamera(65,1,1,10000),soloRenderer=new WebGLRenderer();soloRenderer.setSize(256,256);
  const solo=new FriendsCampfire(soloScene);soloCamera.position.set(6608,794,5792);soloCamera.lookAt(6608,739,5552);solo.update(3,soloCamera,0);
  soloRenderer.render(soloScene,soloCamera);const draws=soloRenderer.info.render.calls,triangles=soloRenderer.info.render.triangles;
  const geo=soloRenderer.info.memory.geometries;
  for(let i=0;i<200;i++){solo.update(i/60,soloCamera,0);soloRenderer.render(soloScene,soloCamera);}
  const stableGeometry=geo===soloRenderer.info.memory.geometries;
  const baseIntensity=solo.light.intensity;
  solo.setState({fuelSeconds:180,roasts:{}});
  for(let i=0;i<200;i++){solo.update(i/60,soloCamera,0);soloRenderer.render(soloScene,soloCamera);}
  const fueledDraws=soloRenderer.info.render.calls,fueledTriangles=soloRenderer.info.render.triangles;
  const fueledGeometryStable=geo===soloRenderer.info.memory.geometries;
  const flameGrowth=solo.flame.scale.y;
  const lightGrowth=solo.light.intensity/baseIntensity;
  soloCamera.position.set(20000,1000,20000);solo.update(5,soloCamera,0);const culled=solo.light.intensity===0&&!solo.group.visible;
  solo.dispose();solo.dispose();soloRenderer.render(soloScene,soloCamera);const released=soloRenderer.info.memory.geometries===0;soloRenderer.dispose();
  // Isolate illumination in the same frozen production world and camera.
  r.setRenderTarget(null);camp.update(5,c,0);r.render(s,c);
  const renderGlError=r.getContext().getError();const lit=r.domElement.toDataURL('image/png');const lightIntensity=camp.light.intensity;
  const read=()=>{const gl=r.getContext(),data=new Uint8Array(r.domElement.width*r.domElement.height*4);gl.readPixels(0,0,r.domElement.width,r.domElement.height,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
  const on=read();const readGlError=r.getContext().getError();camp.light.intensity=0;r.render(s,c);const off=read();let changedPixels=0,delta=0;
  for(let i=0;i<on.length;i+=4){const diff=Math.abs(on[i]-off[i])+Math.abs(on[i+1]-off[i+1])+Math.abs(on[i+2]-off[i+2]);if(diff>12)changedPixels++;delta+=diff;}
  const unlit=r.domElement.toDataURL('image/png');camp.light.intensity=lightIntensity;
  return {glErrors:window.glErrors,initialGlError,renderGlError,readGlError,draws,triangles,stableGeometry,fueledDraws,fueledTriangles,fueledGeometryStable,flameGrowth,lightGrowth,culled,released,changedPixels,lightingDelta:delta,lit,unlit,glError:r.getContext().getError()};
 }));
 for(const name of ['lit','unlit']){await writeFile(`${directory}/${name}.png`,Buffer.from(report[name].split(',')[1],'base64'));delete report[name];}
 await page.evaluate(()=>{bridge.setFriendsEnvironment({hour:12,speed:0});for(let i=0;i<20;i++)bridge.render(sim.createSnapshot(),'review',33);});
 await page.screenshot({path:`${directory}/day-world.png`});
 await page.evaluate(async()=>{
  const {CAMPFIRE_SEATS}=await import('/src/game/multiplayer/FriendsCampfireSeats.ts');
  const {FRIENDS_CAMPFIRE}=await import('/src/game/world/FriendsRegion.ts');
  const seat=CAMPFIRE_SEATS[2],p=sim.players.get('review');Object.assign(p,seat,{z:FRIENDS_CAMPFIRE.z,angle:seat.angle+Math.PI});
  sim.friends.interact(p,sim.elapsedMs);bridge.renderer.yaw=Math.atan2(-Math.cos(p.angle),-Math.sin(p.angle));bridge.renderer.pitch=.02;
  bridge.setFriendsEnvironment({hour:22,speed:0});for(let i=0;i<20;i++)bridge.render(sim.createSnapshot(),'review',33);
 });
 await page.screenshot({path:`${directory}/seated-night.png`});
 assert.deepEqual(await page.evaluate(()=>window.glErrors),[]);
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.glErrors,[]);assert.equal(report.initialGlError,0);assert.equal(report.renderGlError,0);assert.equal(report.readGlError,0);assert.equal(report.glError,0);assert(report.draws<=8);assert(report.triangles<3000);assert(report.stableGeometry&&report.culled&&report.released);assert.equal(report.fueledDraws,report.draws);assert.equal(report.fueledTriangles,report.triangles);assert(report.fueledGeometryStable&&report.flameGrowth>1.6&&report.lightGrowth>1.5);assert(report.changedPixels>5000,'Warm light must visibly illuminate the real world');
 console.log(JSON.stringify(report,null,2));
}finally{await writeFile(`${directory}/checks.json`,JSON.stringify(report,null,2));await browser.close();}
