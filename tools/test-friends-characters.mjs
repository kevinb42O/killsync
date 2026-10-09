import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const require=createRequire(import.meta.url);
const {chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014',directory=process.env.FRIENDS_TEST_ARTIFACTS||'artifacts/big-walk';
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),report={errors:[],requests:[],renders:{},checks:[]};
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  page.on('request',r=>{if(r.url().includes('/models/'))report.requests.push(r.url());});
  await page.goto(origin+'/tools/friends-character-review.html');
  await page.waitForFunction(()=>window.friendsCharacterReview?.crew.every(c=>c.rig.avatar.getObjectByName('friends-big-walk-character'))&&window.friendsCharacterReview.frames>5);
  await page.screenshot({path:directory+'/crew.png'});
  report.crew=await page.evaluate(()=>{const r=window.friendsCharacterReview;return r.crew.map(c=>{const m=c.rig.avatar.getObjectByName('friends-big-walk-character');return {meshes:m.children[0].children.filter(p=>p.children.some(o=>o.isMesh)).length,oldBodyVisible:c.rig.bodyMesh.visible,scale:c.rig.root.scale.toArray()};});});
  assert.ok(report.crew.every(c=>c.meshes===6&&!c.oldBodyVisible&&c.scale.every(n=>n===1)));
  for(const mode of ['axe','pickaxe','shovel','flashlight','rope']){
    await page.getByRole('button',{name:mode[0].toUpperCase()+mode.slice(1),exact:true}).click();
    await page.waitForFunction(mode=>{const r=window.friendsCharacterReview;return mode==='rope'?r.hauling.gun.getObjectByName('rope-launcher-character-hand'):mode==='flashlight'?r.flashlight.hand.getObjectByName('premade-left-arm'):r.tools.root.getObjectByName('premade-right-arm');},mode);
    await page.waitForTimeout(250);
    await page.screenshot({path:directory+'/'+mode+'.png'});
    report.renders[mode]=await page.evaluate(()=>{const r=window.friendsCharacterReview;return {calls:r.renderer.info.render.calls,triangles:r.renderer.info.render.triangles,glError:r.renderer.getContext().getError()};});
    assert.equal(report.renders[mode].glError,0);
  }
  report.framing=await page.evaluate(()=>{
    const r=window.friendsCharacterReview,checks=[];
    for(const aspect of [16/9,2.4,9/16])for(const fov of [70,98,120])for(const tool of [1,2,3]){
      r.handCamera.aspect=aspect;r.handCamera.fov=fov;r.handCamera.updateProjectionMatrix();r.tools.update(tool,10000,false,false);r.tools.root.updateWorldMatrix(true,true);
      const arm=r.tools.root.getObjectByName('held-'+['axe','pickaxe','shovel'][tool-1]).getObjectByName('premade-right-arm');
      const position=arm.geometry.getAttribute('position'),point=arm.position.clone(),bounds={min:[Infinity,Infinity],max:[-Infinity,-Infinity]};
      // Reuse THREE vectors exposed by the rig rather than importing a second engine.
      const inverse=r.handCamera.matrixWorld.clone().invert();
      for(let i=0;i<position.count;i++){point.fromBufferAttribute(position,i).applyMatrix4(arm.matrixWorld).applyMatrix4(inverse);if(point.z>=-.025)continue;point.applyMatrix4(r.handCamera.projectionMatrix);for(let a=0;a<2;a++){bounds.min[a]=Math.min(bounds.min[a],point.getComponent(a));bounds.max[a]=Math.max(bounds.max[a],point.getComponent(a));}}
      checks.push({aspect,fov,tool,...bounds});
    }
    return checks;
  });
  assert.ok(report.framing.every(c=>c.min.every(Number.isFinite)&&c.max.every(Number.isFinite)&&c.min[0]<1&&c.max[0]>-1&&c.min[1]<1&&c.max[1]>-1));
  assert.ok(!report.requests.some(url=>url.includes('wrad-arms')));
  // Exercise the production renderer as well as the isolated review fixture.
  await page.addInitScript(()=>{
    localStorage.setItem('sunline.preferences.v1',JSON.stringify({renderScale:1,shadows:false}));
    localStorage.setItem('killsync.friends.menu.pause','true');
  });
  await page.routeWebSocket(url=>url.searchParams.has('token'),socket=>{
    const server=socket.connectToServer();server.onMessage(message=>{try{if(JSON.parse(String(message)).type==='connected')socket.send(message);}catch{}});
  });
  await page.goto(origin+'/?mode=friends',{waitUntil:'domcontentloaded'});
  await page.getByLabel('Your name',{exact:true}).fill('Character review');
  await page.getByRole('button',{name:'Play on my own',exact:true}).click({noWaitAfter:true});
  await page.locator('.coop-arena').waitFor({state:'attached',timeout:120000});
  await page.waitForFunction(()=>!document.body.innerText.includes('OPERATOR LINK / SUNLINE COMMONS'),undefined,{timeout:120000});
  await page.evaluate(()=>{
    const element=document.querySelector('.coop-arena'),key=Object.keys(element).find(k=>k.startsWith('__reactFiber'));
    let fiber=element[key],simulation,bridge;
    while(fiber){let hook=fiber.memoizedState;while(hook){const value=hook.memoizedState?.current;
      if(value?.createSnapshot&&value?.setInput)simulation=value;
      if(value?.getFriendsTerrain&&value?.setFriendsTool)bridge=value;
      hook=hook.next;}fiber=fiber.return;}
    if(!simulation||!bridge)throw new Error('Arena refs unavailable');
    const host=[...simulation.players.values()][0];
    simulation.addPlayer({id:'big-walk-review-friend',label:'Big Walk friend',color:'#ff0000'});
    const guest=simulation.players.get('big-walk-review-friend');
    Object.assign(guest,{x:host.x+120,y:host.y,z:host.z,angle:Math.PI,verticalVelocity:0});
    window.liveCharacterReview={simulation,bridge,guest};
  });
  await page.waitForFunction(()=>{
    const rig=window.liveCharacterReview.bridge.remotePlayers.get('big-walk-review-friend');
    return rig?.avatar.getObjectByName('friends-big-walk-character')&&!rig.bodyMesh.visible;
  });
  report.production=await page.evaluate(()=>{
    const r=window.liveCharacterReview,rig=r.bridge.remotePlayers.get(r.guest.id);
    return {model:rig.avatar.getObjectByName('friends-big-walk-character').name,oldBodyVisible:rig.bodyMesh.visible,glError:r.bridge.renderer.renderer.getContext().getError()};
  });
  assert.equal(report.production.glError,0);assert.equal(report.production.oldBodyVisible,false);
  assert.ok(!report.requests.some(url=>url.includes('wrad-arms')));
  assert.deepEqual(report.errors,[]);
  report.checks.push('three crew avatars use six articulated meshes each and hide the original chassis','all five held tools load matching character limbs without requesting WRAD arms','tools render without WebGL errors and remain in frame across 70–120° FOV and portrait/ultrawide sizes','a real island guest mounts the Big Walk model through the production multiplayer renderer');
  console.log(JSON.stringify(report,null,2));
}finally{await writeFile(directory+'/render-checks.json',JSON.stringify(report,null,2));await browser.close();}
