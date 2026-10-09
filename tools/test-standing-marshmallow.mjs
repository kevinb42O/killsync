import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const directory='artifacts/standing-marshmallow';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const report={errors:[],stages:[]};
try{
 const page=await browser.newPage({viewport:{width:1200,height:800}});page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/__standing_marshmallow',r=>r.fulfill({contentType:'text/html',body:'<div id="world" style="position:fixed;inset:0"></div>'}));
 await page.goto((process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3000')+'/__standing_marshmallow');
 await page.evaluate(async()=>{
  const {FriendsSimulation}=await import('/src/game/multiplayer/FriendsSimulation.ts');
  const {MultiplayerRendererBridge}=await import('/src/game/multiplayer/MultiplayerRendererBridge.ts');
  const {FRIENDS_CAMPFIRE}=await import('/src/game/world/FriendsRegion.ts');
  const {quantizeAngle,quantizePitch}=await import('/src/game/multiplayer/CoopSimulation.ts');
  const {MULTIPLAYER_PROTOCOL_VERSION}=await import('/src/game/multiplayer/protocol.ts');
  const sim=new FriendsSimulation([{id:'review',label:'Explorer',color:'#8de6ce'}]),bridge=new MultiplayerRendererBridge('friends_frontier');bridge.mount(document.getElementById('world'));
  const p=sim.players.get('review');Object.assign(p,{x:FRIENDS_CAMPFIRE.x,y:FRIENDS_CAMPFIRE.y+124,z:FRIENDS_CAMPFIRE.z,angle:-Math.PI/2});
  bridge.renderer.yaw=0;bridge.renderer.pitch=Math.atan2(-2,124);bridge.setFriendsEnvironment({hour:20,speed:0});
  let sequence=0;
  function render(held=false,frames=30){
   for(let i=0;i<frames;i++){
    sim.setInput(p.id,{type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:++sequence,clientTime:0,movement:0,aimAngle:quantizeAngle(bridge.getAimAngle()),aimPitch:quantizePitch(bridge.getAimPitch()),selectedSlot:0,firing:held,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,friendsTool:10});
    sim.tick(50);bridge.setFriendsTool(10,held);bridge.render(sim.createSnapshot(),p.id,50);
   }
   return {roast:sim.createSnapshot().friends.campfire.roasts.review,gl:bridge.renderer.renderer.getContext().getError()};
  }
  window.review={sim,bridge,p,render};window.frames=0;
  function warm(){if(window.ready)return;render(false,1);window.frames++;requestAnimationFrame(warm);}warm();
 });
 await page.waitForFunction(()=>window.frames>100&&!review.bridge.friendsWorldArrival.sequence.active,undefined,{timeout:60000});
 await page.evaluate(()=>window.ready=true);
 for(const [stage,held,frames]of [['rest',false,30],['extended',true,30],['golden',true,170],['released',false,60]]){
  const result=await page.evaluate(([held,frames])=>review.render(held,frames),[held,frames]);report.stages.push({stage,...result});
  await page.screenshot({path:`${directory}/${stage}.png`});assert.equal(result.gl,0);
 }
 const [rest,extended,golden,released]=report.stages;
 assert.equal(rest.roast.roasting,false);assert.equal(extended.roast.roasting,true);assert(golden.roast.toast>.4);assert.equal(released.roast.roasting,false);
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}finally{await writeFile(directory+'/report.json',JSON.stringify(report,null,2));await browser.close();}
