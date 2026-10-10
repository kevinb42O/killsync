import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
const require=createRequire(import.meta.url);
let playwright;try { playwright=require('playwright'); } catch { playwright=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3000';
const directory='artifacts/friends-inhabitants';await mkdir(directory,{recursive:true});
const browser=await playwright.chromium.launch({headless:true,args:['--use-angle=metal']});
const report={errors:[]};
try {
  const page=await browser.newPage({viewport:{width:1200,height:800}});
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('**/__inhabitants_review',r=>r.fulfill({contentType:'text/html',body:'<html><body style="margin:0"><div id="world" style="width:100vw;height:100vh"></div></body></html>'}));
  await page.goto(`${origin}/__inhabitants_review`);
  await page.evaluate(async()=>{
    const {FriendsSimulation}=await import('/src/game/multiplayer/FriendsSimulation.ts');
    const {MultiplayerRendererBridge}=await import('/src/game/multiplayer/MultiplayerRendererBridge.ts');
    const {FRIENDS_CAMPFIRE}=await import('/src/game/world/FriendsRegion.ts');
    window.sim=new FriendsSimulation([{id:'review',label:'Explorer',color:'#22d3ee'}]);
    window.bridge=new MultiplayerRendererBridge('friends_frontier');bridge.mount(document.getElementById('world'));
    const p=sim.players.get('review');Object.assign(p,{x:FRIENDS_CAMPFIRE.x,y:FRIENDS_CAMPFIRE.y+260,z:FRIENDS_CAMPFIRE.z,angle:-Math.PI/2});
    bridge.renderer.yaw=0;bridge.renderer.pitch=-.15;bridge.setFriendsEnvironment({hour:17,speed:0});
    window.frames=0;function frame(){if(window.stopFrames)return;sim.tick(16);bridge.render(sim.createSnapshot(),'review',16);window.frames++;requestAnimationFrame(frame);}frame();
  });
  await page.waitForFunction(()=>frames>220&&!bridge.friendsWorldArrival.sequence.active&&bridge.renderer.scene.getObjectByName('friendly-npc-sunny')?.getObjectByName('friends-big-walk-character'),undefined,{timeout:90000});
  await page.screenshot({path:`${directory}/campfire.png`});
  Object.assign(report,await page.evaluate(async()=>{
    window.stopFrames=true;
    const npcs=bridge.inhabitants,scene=bridge.renderer.scene,camera=bridge.renderer.camera,renderer=bridge.renderer.renderer;
    const residents=scene.getObjectByName('friends-ambient-inhabitants');
    const render=()=>{renderer.info.reset();renderer.render(scene,camera);return {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};};
    const on=render();residents.visible=false;const off=render();residents.visible=true;
    const snapshot=sim.createSnapshot(),local=snapshot.players[0],terrain=bridge.frontierVisuals.terrain;
    const residentGeometries=new Set();residents.traverse(o=>{if(o.geometry)residentGeometries.add(o.geometry);});
    const baseTime=bridge.visualElapsedMs;
    const previous=npcs.residents.map(r=>({x:r.x,y:r.y}));const travelled=[0,0,0,0];
    let closest=Infinity,campfireFrames=0,maxSeated=0;
    const start=performance.now();
    for(let i=1;i<=2400;i++) {
      npcs.update(baseTime+i*100,100,snapshot.players,local,camera,terrain,snapshot.friends?.building?.pieces,snapshot.friends?.frontier);
      npcs.residents.forEach((r,j)=>{travelled[j]+=Math.hypot(r.x-previous[j].x,r.y-previous[j].y);previous[j]={x:r.x,y:r.y};});
      for(let a=0;a<4;a++)for(let b=a+1;b<4;b++) {
        const p=npcs.residents[a],q=npcs.residents[b];closest=Math.min(closest,Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z));
      }
      const sitting=npcs.residents.filter(r=>r.seated).length;maxSeated=Math.max(maxSeated,sitting);campfireFrames+=Number(sitting>0);
    }
    const thinkingTickMs=(performance.now()-start)/2400;
    bridge.visualElapsedMs=baseTime+240000;
    // Props first upload when someone roasts. Check ownership rather than
    // mistaking that first GPU registration for a new geometry allocation.
    render();const afterGeometries=new Set();residents.traverse(o=>{if(o.geometry)afterGeometries.add(o.geometry);});
    const stableGeometry=residentGeometries.size===afterGeometries.size&&[...afterGeometries].every(g=>residentGeometries.has(g));
    const seated=npcs.residents.filter(r=>r.seated).length;
    const {FRIENDS_SPAWN_PLATFORM}=await import('/src/game/world/FriendsTerrain.ts');
    const p=sim.players.get('review');Object.assign(p,{x:FRIENDS_SPAWN_PLATFORM.x,y:FRIENDS_SPAWN_PLATFORM.y+125,z:FRIENDS_SPAWN_PLATFORM.top,angle:-Math.PI/2});
    bridge.renderer.yaw=0;bridge.renderer.pitch=-.12;
    for(let i=0;i<90;i++)bridge.render(sim.createSnapshot(),'review',16);
    return {on,off,extraDraws:on.calls-off.calls,thinkingTickMs,travelled,closest,campfireFrames,maxSeated,stableGeometry,seated,glError:renderer.getContext().getError(),playerCount:snapshot.players.length};
  }));
  await page.screenshot({path:`${directory}/spawn.png`});
  assert.ok(report.travelled.every(distance=>distance>300));assert.ok(report.closest>45);
  assert.ok(report.campfireFrames>0);assert.ok(report.maxSeated<=2);
  assert.equal(report.playerCount,1);assert.equal(report.stableGeometry,true);assert.equal(report.glError,0);assert.deepEqual(report.errors,[]);
  assert.ok(report.extraDraws>0&&report.extraDraws<=40,`NPC render budget exceeded: ${report.extraDraws}`);
  await page.evaluate(async()=>{
    const {FriendsInhabitants}=await import('/src/game/rendering/FriendsInhabitants.ts');
    const {CAMPFIRE_SEATS}=await import('/src/game/multiplayer/FriendsCampfireSeats.ts');
    bridge.inhabitants.dispose();bridge.chatBubbles?.dispose();bridge.chatBubbles=undefined;
    window.npcSpeech=[];const show=bridge.showChatMessage.bind(bridge);
    bridge.showChatMessage=m=>{npcSpeech.push(m);show(m);};
    bridge.inhabitants=new FriendsInhabitants(bridge.renderer.scene,m=>bridge.showChatMessage(m));
    bridge.visualElapsedMs=0;
    Object.assign(sim.players.get('review'),CAMPFIRE_SEATS[0],{friendsSeat:{vehicleId:'commons-campfire',index:0},crouching:true});
    bridge.renderer.yaw=0;bridge.renderer.pitch=0;
  });
  await page.waitForFunction(()=>bridge.inhabitants.residents.every(r=>r.rig.root.getObjectByName('friends-big-walk-character')));
  Object.assign(report,await page.evaluate(()=>{
    const snapshot=sim.createSnapshot(),local=snapshot.players[0],npcs=bridge.inhabitants;
    let joined=false;
    for(let t=0;t<90000;t+=100) {
      bridge.visualElapsedMs=t;
      npcs.update(t,100,snapshot.players,local,bridge.renderer.camera,bridge.frontierVisuals.terrain,snapshot.friends.building.pieces,snapshot.friends.frontier);
      if(npcs.residents.some(r=>r.seated&&r.companion)){joined=true;break;}
    }
    const visitor=npcs.residents.find(r=>r.seated&&r.companion);
    if(visitor){
      const dx=visitor.x-local.x,dy=visitor.y-local.y;
      bridge.renderer.yaw=Math.atan2(-dx,-dy);bridge.renderer.pitch=.03;
    }
    // Advance through the arrival comment, including the conversation cooldown.
    for(let i=0;i<140;i++)npcs.update(bridge.visualElapsedMs+=100,100,snapshot.players,local,bridge.renderer.camera,bridge.frontierVisuals.terrain,snapshot.friends.building.pieces,snapshot.friends.frontier);
    bridge.render(snapshot,'review',16);
    return {joined,companyCount:npcs.residents.filter(r=>r.seated).length,speechCount:npcSpeech.length,rosterCount:snapshot.players.length};
  }));
  // Let the existing bubble entrance animation settle on its wall clock.
  await page.waitForTimeout(200);
  const bubbleCount=await page.evaluate(()=>{
    bridge.render(sim.createSnapshot(),'review',16);
    return bridge.renderer.scene.children.filter(o=>o.name==='friends-chat-bubble'&&o.visible).length;
  });
  report.bubbleCount=bubbleCount;
  await page.screenshot({path:`${directory}/campfire-company.png`});
  assert.equal(report.joined,true);assert.ok(report.companyCount<=2);assert.equal(report.rosterCount,1);
  assert.ok(report.speechCount>0);assert.ok(report.bubbleCount>0);
  await page.evaluate(()=>bridge.destroy());
} finally { await browser.close();await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2)+'\n'); }
console.log(JSON.stringify(report,null,2));
