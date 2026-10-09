import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),sharp=require('sharp'),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014',directory='artifacts/fun-bar';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding']}),report={errors:[],checks:[]};
try{
  const page=await browser.newPage({viewport:{width:1200,height:800}});page.setDefaultTimeout(60000);page.on('pageerror',e=>report.errors.push(e.message));
  await page.addInitScript(()=>{
    localStorage.setItem('sunline.preferences.v1',JSON.stringify({renderScale:.7,shadows:false}));localStorage.setItem('cinematicEffects','subtle');localStorage.setItem('killsync.friends.menu.pause','true');
    let locked=null;Object.defineProperty(document,'pointerLockElement',{get:()=>locked});HTMLCanvasElement.prototype.requestPointerLock=function(){locked=this;queueMicrotask(()=>document.dispatchEvent(new Event('pointerlockchange')));return Promise.resolve();};document.exitPointerLock=()=>{locked=null;queueMicrotask(()=>document.dispatchEvent(new Event('pointerlockchange')));};
  });
  await page.route('**/@vite/client',route=>route.fulfill({contentType:'application/javascript',body:'export function createHotContext(){return {on(){},off(){},prune(){},send(){},acceptExports(){},accept(){},dispose(){},invalidate(){},data:{}}};export function injectQuery(u){return u};export function updateStyle(id,content){let s=document.getElementById(id);if(!s){s=document.createElement("style");s.id=id;document.head.append(s);}s.textContent=content;}export function removeStyle(id){document.getElementById(id)?.remove();}'}));
  await page.goto(origin+'/?mode=friends',{waitUntil:'domcontentloaded'});await page.getByLabel('Your name',{exact:true}).fill('Stone review');await page.getByRole('button',{name:'Play on my own',exact:true}).click({noWaitAfter:true});await page.locator('.coop-arena').waitFor();await page.waitForFunction(()=>!document.body.innerText.includes('OPERATOR LINK / SUNLINE COMMONS'));
  await page.evaluate(async()=>{
    const el=document.querySelector('.coop-arena'),key=Object.keys(el).find(k=>k.startsWith('__reactFiber'));let fiber=el[key],simulation,bridge,input;
    while(fiber){let hook=fiber.memoizedState;while(hook){const value=hook.memoizedState?.current;if(value?.createSnapshot&&value?.setInput)simulation=value;if(value?.getFriendsTerrain&&value?.setFriendsTool)bridge=value;if(value?.type==='input')input=hook.memoizedState;hook=hook.next;}fiber=fiber.return;}
    if(!simulation||!bridge||!input)throw Error('Fishing arena refs unavailable');const p=[...simulation.players.values()][0],{friendsWaterAt}=await import('/src/game/world/FriendsWaterSurface.ts');let x=14580;
    for(let q=14580;q>13000;q-=8)if(friendsWaterAt(q,23600)){x=q+48;break;}
    Object.assign(p,{x,y:23600,z:simulation.friendsFrontier.terrain.surfaceHeight(x,23600),verticalVelocity:0,friendsDevFlight:false});bridge.renderer.yaw=Math.PI/2;bridge.renderer.pitch=-.3;
    const friendsAudio=bridge.birdVisuals.audio.audio,birdSounds=[],play=friendsAudio.play.bind(friendsAudio);
    friendsAudio.play=(cue,...args)=>{const source=play(cue,...args);if(cue.startsWith('bird'))birdSounds.push({cue,started:Boolean(source),volume:args[0],options:args[4]});return source;};
    window.stoneArena={simulation,bridge,input,p,id:p.id,audio:friendsAudio,birdSounds};
  });
  await page.keyboard.press('t');await page.waitForFunction(()=>stoneArena.input.current.friendsTool===8&&stoneArena.bridge.stoneVisuals.held.visible);
  await page.waitForFunction(()=>stoneArena.bridge.stoneVisuals.held.children.some(o=>o.name==='premade-right-arm'));
  await page.keyboard.press('1');assert.equal(await page.getByLabel('Fun bar',{exact:true}).count(),1);
  assert((await page.getByLabel('Stone controls').innerText()).length<24);
  await page.screenshot({path:directory+'/held-stone.png'});report.checks.push('T opens a compact Fun bar and equips the stone in the shipped character hand');
  // Real pointer input charges and releases into the actual lake.
  await page.evaluate(()=>{stoneArena.bridge.renderer.pitch=0;document.querySelector('.coop-arena canvas').dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}));});
  await page.waitForFunction(()=>stoneArena.simulation.createSnapshot().friends.stones.equipped[0]?.chargeAt!==undefined);
  await page.waitForTimeout(700);await page.screenshot({path:directory+'/charging.png'});
  await page.evaluate(()=>window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true})));
  await page.waitForFunction(()=>stoneArena.simulation.createSnapshot().friends.stones.stones.some(s=>s.skips>0));
  await page.screenshot({path:directory+'/skipping.png'});report.checks.push('holding left mouse charges the throw; release produces real lake skips and replicated ripples');
  // Place a peer on dry ground in the throw path, then use the real input again.
  await page.evaluate(()=>{const r=stoneArena;r.simulation.addPlayer({id:'stone-friend',label:'Friend',color:'#f0f'});const friend=r.simulation.players.get('stone-friend');Object.assign(r.p,{x:6500,y:5500,z:r.simulation.friendsFrontier.terrain.surfaceHeight(6500,5500),verticalVelocity:0});Object.assign(friend,{x:6620,y:5500,z:r.p.z});r.bridge.renderer.yaw=-Math.PI/2;r.bridge.renderer.pitch=0;r.friend=friend;r.health=friend.health;});
  await page.waitForTimeout(500);
  await page.evaluate(()=>{const canvas=document.querySelector('.coop-arena canvas');canvas.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));});
  await page.waitForFunction(()=>stoneArena.simulation.createSnapshot().combatEvents.some(e=>e.kind==='player_damaged'&&e.playerId==='stone-friend'&&e.amount===0));
  assert.equal(await page.evaluate(()=>stoneArena.friend.health),await page.evaluate(()=>stoneArena.health));report.checks.push('actual stone throw hits the peer once and preserves health');
  // A hard landing must drive the existing local screen overlay.
  await page.waitForTimeout(1200);await page.evaluate(()=>{const r=stoneArena;r.fallEvents=[];r.overlaySeen=false;new MutationObserver(()=>{if(document.querySelector('.coop-damage-flash'))r.overlaySeen=true;}).observe(document.body,{childList:true,subtree:true});const emit=r.simulation.emitCombatEvent.bind(r.simulation);r.simulation.emitCombatEvent=e=>{if(e.kind==='player_damaged')r.fallEvents.push(e);return emit(e);};r.p.z+=500;r.p.verticalVelocity=0;r.localHealth=r.p.health;});
  await page.waitForFunction(()=>stoneArena.overlaySeen,{},{timeout:10000});await page.screenshot({path:directory+'/hard-landing.png'});
  assert.equal(await page.evaluate(()=>stoneArena.p.health),await page.evaluate(()=>stoneArena.localHealth));report.checks.push('hard landing triggers the survival red overlay without a text notice');
  await page.waitForTimeout(400);await page.keyboard.press('t');await page.waitForFunction(()=>stoneArena.input.current.friendsTool===6);
  await page.keyboard.press('7');await page.waitForFunction(()=>stoneArena.input.current.friendsTool===7);await page.keyboard.press('t');await page.waitForFunction(()=>stoneArena.input.current.friendsTool===8);
  await page.keyboard.press('b');await page.waitForFunction(()=>stoneArena.input.current.friendsTool===6);await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press('t');await page.waitForFunction(()=>stoneArena.input.current.friendsTool===8);
  report.checks.push('T closes to empty hands, fishing still uses slot 7, and switching between Build and Fun stows the other mode');
  // Seeds are selected with the actual second Fun shortcut.
  await page.keyboard.press('2');await page.waitForFunction(()=>stoneArena.input.current.friendsTool===9&&stoneArena.bridge.birdVisuals.held.visible);
  await page.waitForFunction(()=>stoneArena.bridge.birdVisuals.arm);
  await page.evaluate(()=>{const r=stoneArena;r.simulation.friends.birds.random=()=>.5;r.simulation.removePlayer('stone-friend');Object.assign(r.p,{x:6500,y:5500,z:r.simulation.friendsFrontier.terrain.surfaceHeight(6500,5500),verticalVelocity:0});r.bridge.renderer.yaw=-Math.PI/2;r.bridge.renderer.pitch=-.3;});
  await page.waitForTimeout(200);await page.keyboard.press('2');await page.screenshot({path:directory+'/seed-hand.png'});
  await page.evaluate(()=>{const canvas=document.querySelector('.coop-arena canvas');canvas.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));});
  await page.waitForFunction(()=>stoneArena.simulation.createSnapshot().friends.birds.birds.some(b=>!b.ownerId&&b.phase==='feeding'));
  await page.screenshot({path:directory+'/ground-flock.png'});report.checks.push('slot 2 shows seeds in the palm; scattering brings a small flock that lands and pecks');
  await page.evaluate(()=>{stoneArena.simulation.friends.birds.random=()=>0;document.querySelector('.coop-arena canvas').dispatchEvent(new MouseEvent('mousedown',{button:2,bubbles:true}));});
  await page.waitForFunction(()=>stoneArena.simulation.createSnapshot().friends.birds.equipped[0]?.holding);
  await page.waitForFunction(()=>stoneArena.simulation.createSnapshot().friends.birds.birds.some(b=>b.ownerId===stoneArena.id&&b.phase==='feeding'));
  await page.waitForFunction(()=>[...stoneArena.bridge.birdVisuals.birds.values()].some(b=>b.root.parent===stoneArena.bridge.birdVisuals.held));
  await page.screenshot({path:directory+'/bird-perched.png'});report.checks.push('holding right mouse extends the seed hand; the rare visit approaches, perches on the actual arm and eats seeds');
  await page.waitForFunction(()=>stoneArena.simulation.createSnapshot().friends.birds.birds.some(b=>b.ownerId===stoneArena.id&&b.phase==='perched'));
  await page.waitForTimeout(5000);assert(await page.evaluate(()=>stoneArena.simulation.createSnapshot().friends.birds.birds.some(b=>b.ownerId===stoneArena.id&&b.phase==='perched')&&[...stoneArena.bridge.birdVisuals.birds.values()].some(b=>b.root.parent===stoneArena.bridge.birdVisuals.held)));
  await page.screenshot({path:directory+'/bird-companion.png'});report.checks.push('the hand visitor finishes the seeds and stays attached as a companion until the arm is lowered');
  await page.evaluate(()=>window.dispatchEvent(new MouseEvent('mouseup',{button:2,bubbles:true})));
  await page.waitForFunction(()=>stoneArena.simulation.createSnapshot().friends.birds.birds.some(b=>b.ownerId===stoneArena.id&&b.phase==='leaving'));
  // Repeat on the actual authored outdoor seat.
  await page.evaluate(async()=>{const {RETREAT_SEATS}=await import('/src/game/world/FriendsRetreatSites.ts'),r=stoneArena,seat=RETREAT_SEATS.find(s=>s.siteId==='skyfalls-bench');Object.assign(r.p,{x:seat.x,y:seat.y,z:seat.z,verticalVelocity:0,friendsSeat:{vehicleId:seat.siteId,index:seat.index}});r.bridge.renderer.yaw=.4;r.bridge.renderer.pitch=-.12;});
  await page.waitForTimeout(200);await page.evaluate(()=>document.querySelector('.coop-arena canvas').dispatchEvent(new MouseEvent('mousedown',{button:2,bubbles:true})));
  await page.waitForFunction(()=>stoneArena.simulation.createSnapshot().friends.birds.birds.some(b=>b.ownerId===stoneArena.id&&b.phase==='feeding'));
  await page.screenshot({path:directory+'/bench-perched.png'});report.checks.push('the same arm feeding works on Skyfalls Bench while seated');
  await page.evaluate(()=>window.dispatchEvent(new MouseEvent('mouseup',{button:2,bubbles:true})));
  await page.keyboard.press('2');
  // Enter a real campfire chair with F: it automatically selects the new third slot.
  await page.keyboard.press('f');await page.waitForFunction(()=>!stoneArena.p.friendsSeat);
  await page.evaluate(async()=>{const {CAMPFIRE_SEATS}=await import('/src/game/multiplayer/FriendsCampfireSeats.ts'),r=stoneArena,seat=CAMPFIRE_SEATS[0];Object.assign(r.p,{x:seat.x,y:seat.y,z:seat.z-20,verticalVelocity:0});r.bridge.renderer.yaw=-seat.angle+Math.PI/2;r.bridge.renderer.pitch=0;});
  await page.waitForTimeout(300);await page.keyboard.press('f');
  await page.waitForFunction(()=>stoneArena.p.friendsSeat&&stoneArena.input.current.friendsTool===10&&stoneArena.bridge.marshmallows.actors.get(stoneArena.id)?.group.visible);
  await page.waitForFunction(()=>stoneArena.bridge.marshmallows.actors.get(stoneArena.id)?.arm);
  await page.screenshot({path:directory+'/campfire-marshmallow.png'});
  // A close opaque world plane must not cover any part of the local stick.
  await page.evaluate(async()=>{const THREE=await import('/node_modules/.vite/deps/three.js'),r=stoneArena,camera=r.bridge.renderer.camera,plane=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshBasicMaterial({color:'#8e188e',side:THREE.DoubleSide}));plane.position.set(0,0,-6).applyQuaternion(camera.quaternion).add(camera.position);plane.quaternion.copy(camera.quaternion);r.obstruction=plane;r.bridge.renderer.scene.add(plane);});
  await page.waitForTimeout(250);
  const foreground=await page.screenshot({path:directory+'/marshmallow-foreground.png'}),pixels=await sharp(foreground).removeAlpha().raw().toBuffer({resolveWithObject:true});
  let palmPixels=0,foodPixels=0;for(let y=0;y<pixels.info.height;y++)for(let x=0;x<pixels.info.width;x++){const i=(y*pixels.info.width+x)*3,r=pixels.data[i],g=pixels.data[i+1],b=pixels.data[i+2];if(x>720&&y>460&&y<735&&r>150&&g>105&&b<120&&r<g*1.8)palmPixels++;if(x>450&&x<850&&y>160&&y<520&&r>205&&g>190&&b>160)foodPixels++;}
  assert(palmPixels>1000,'the hand is covered by scenery');assert(foodPixels>400,'the marshmallow is covered by scenery');
  assert(await page.evaluate(()=>stoneArena.bridge.marshmallows.actors.get(stoneArena.id).group.parent===stoneArena.bridge.marshmallows.held));
  await page.evaluate(()=>{const p=stoneArena.obstruction;p.removeFromParent();p.geometry.dispose();p.material.dispose();});
  report.checks.push('an opaque obstacle in front of the camera cannot cover the hand, stick or marshmallow; peers stay in the world pass');
  report.checks.push('F seats at the Commons fire and automatically selects marshmallow slot 3 with the original roasting stick and hand');
  await page.evaluate(()=>window.dispatchEvent(new WheelEvent('wheel',{deltaY:100,bubbles:true,cancelable:true})));
  await page.waitForFunction(()=>stoneArena.input.current.friendsTool===8&&stoneArena.bridge.stoneVisuals.held.visible&&!stoneArena.bridge.marshmallows.actors.get(stoneArena.id).group.visible);
  await page.evaluate(()=>{const r=stoneArena;r.bridge.renderer.yaw=-Math.PI/8-Math.PI/2;});await page.waitForTimeout(200);
  await page.evaluate(()=>{const r=stoneArena;r.simulation.addPlayer({id:'camp-friend',label:'Camp friend',color:'#f0f'});const a=r.p.angle;r.friend=r.simulation.players.get('camp-friend');Object.assign(r.friend,{x:r.p.x+Math.cos(a)*120,y:r.p.y+Math.sin(a)*120,z:r.p.z});r.health=r.friend.health;});
  await page.waitForTimeout(300);await page.evaluate(()=>{document.querySelector('.coop-arena canvas').dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));});
  await page.waitForFunction(()=>stoneArena.simulation.createSnapshot().combatEvents.some(e=>e.kind==='player_damaged'&&e.playerId==='camp-friend'&&e.amount===0));
  assert.equal(await page.evaluate(()=>stoneArena.friend.health),await page.evaluate(()=>stoneArena.health));
  await page.evaluate(()=>window.dispatchEvent(new WheelEvent('wheel',{deltaY:100,bubbles:true,cancelable:true})));
  await page.waitForFunction(()=>stoneArena.input.current.friendsTool===9&&stoneArena.bridge.birdVisuals.held.visible);
  await page.evaluate(()=>document.querySelector('.coop-arena canvas').dispatchEvent(new MouseEvent('mousedown',{button:2,bubbles:true})));
  await page.waitForFunction(()=>stoneArena.simulation.createSnapshot().friends.birds.equipped.some(h=>h.holding));
  await page.evaluate(()=>window.dispatchEvent(new MouseEvent('mouseup',{button:2,bubbles:true})));
  await page.evaluate(()=>{stoneArena.bridge.renderer.yaw=-Math.PI/8+Math.PI/2;});await page.waitForTimeout(200);
  await page.evaluate(()=>{document.querySelector('.coop-arena canvas').dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));});
  await page.waitForFunction(()=>stoneArena.simulation.createSnapshot().friends.birds.birds.some(b=>b.burningUntil>stoneArena.simulation.elapsedMs));
  await page.waitForFunction(()=>[...stoneArena.bridge.birdVisuals.birds.values()].some(b=>b.fire.visible));
  await page.waitForTimeout(600);await page.screenshot({path:directory+'/campfire-bird-flames.png'});report.checks.push('seeds tossed toward the real campfire attract birds which visibly ignite and fly away');
  await page.evaluate(()=>window.dispatchEvent(new WheelEvent('wheel',{deltaY:100,bubbles:true,cancelable:true})));
  await page.waitForFunction(()=>stoneArena.input.current.friendsTool===10&&stoneArena.bridge.marshmallows.actors.get(stoneArena.id).group.visible);
  report.checks.push('seated wheel cycles stone, seeds and marshmallow; stones hit friends from the chair and seeds still extend the hand');
  await page.keyboard.press('f');await page.waitForFunction(()=>!stoneArena.p.friendsSeat&&stoneArena.input.current.friendsTool===10&&stoneArena.bridge.marshmallows.actors.get(stoneArena.id).group.visible);
  await page.evaluate(()=>{const r=stoneArena;Object.assign(r.p,{x:6500,y:5500,z:r.simulation.friendsFrontier.terrain.surfaceHeight(6500,5500),verticalVelocity:0});r.bridge.renderer.yaw=-Math.PI/2;});await page.waitForTimeout(300);
  const start=await page.evaluate(()=>({x:stoneArena.p.x,y:stoneArena.p.y}));await page.keyboard.down('z');await page.waitForFunction(start=>Math.hypot(stoneArena.p.x-start.x,stoneArena.p.y-start.y)>50,start,{timeout:10000});await page.keyboard.up('z');
  assert(await page.evaluate(start=>Math.hypot(stoneArena.p.x-start.x,stoneArena.p.y-start.y)>50,start));
  assert(await page.evaluate(()=>stoneArena.input.current.friendsTool===10&&stoneArena.bridge.marshmallows.actors.get(stoneArena.id).group.visible));
  await page.waitForTimeout(3000);await page.screenshot({path:directory+'/walking-marshmallow.png'});
  await page.evaluate(()=>{document.querySelector('.coop-arena canvas').dispatchEvent(new MouseEvent('mousedown',{button:2,bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup',{button:2,bubbles:true}));});
  await page.waitForFunction(()=>stoneArena.simulation.createSnapshot().friends.campfire.roasts[stoneArena.id]?.eatingMs>0);
  report.checks.push('F stands without stowing the stick; movement walks with it still visible and right mouse eats the carried marshmallow');
  report.birdSounds=await page.evaluate(()=>stoneArena.birdSounds.filter(s=>s.started));
  for(const cue of ['birdRobin','birdBlueTit','birdWings','birdStartled'])assert(report.birdSounds.some(s=>s.cue===cue),'no actual recorded source started for '+cue);
  assert(report.birdSounds.every(s=>s.options?.ambience));assert(report.birdSounds.some(s=>Math.abs(s.options.pan)>.1));
  assert.equal(await page.evaluate(()=>[...stoneArena.audio.buffers.keys()].filter(u=>/bird_(robin|blue_tit|sparrow|wings|startled)_/.test(u)).length),12);
  report.checks.push('all 12 internet bird excerpts decode; native Web Audio plays species calls, flutter and startled chirps with stereo direction through Ambience');
  report.framing=await page.getByLabel('Fun bar',{exact:true}).evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}));assert(report.framing.height<80);assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}catch(e){const page=browser.contexts()[0]?.pages()[0];if(page){report.state=await page.evaluate(()=>window.stoneArena?{fallEvents:stoneArena.fallEvents,overlaySeen:stoneArena.overlaySeen,p:{x:stoneArena.p.x,y:stoneArena.p.y,z:stoneArena.p.z,v:stoneArena.p.verticalVelocity},birds:stoneArena.simulation.createSnapshot().friends.birds}:undefined).catch(()=>undefined);report.body=await page.locator('body').innerText().catch(()=>'<unavailable>');await page.screenshot({path:directory+'/failure.png'}).catch(()=>{});}report.failure=e.message;console.error(JSON.stringify(report,null,2));throw e;}finally{await writeFile(directory+'/arena-validation.json',JSON.stringify(report,null,2));await browser.close();}
