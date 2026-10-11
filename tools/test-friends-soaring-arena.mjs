import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const mobile=process.env.FRIENDS_SOARING_MOBILE==='1';
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014',report={errors:[],steps:[]};let page;
try{
  page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile});page.on('pageerror',e=>report.errors.push(e.message));
  await page.addInitScript(()=>{window.__vite_plugin_react_preamble_installed__=true;window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;localStorage.setItem('sunline.preferences.v1',JSON.stringify({renderScale:.65,shadows:false}));});
  await page.route('**/__soaring_arena',r=>r.fulfill({contentType:'text/html',body:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root"></div></body></html>'}));await page.goto(origin+'/__soaring_arena');
  const source=await(await page.request.get(origin+'/src/components/MultiplayerArena.tsx')).text(),bridgeUrl=source.match(/from ["']([^"']*MultiplayerRendererBridge[^"']*)["']/)[1];
  await page.evaluate(async bridgeUrl=>{
    const React=(await import('/node_modules/.vite/deps/react.js')).default,{createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const {MultiplayerArena}=await import('/src/components/MultiplayerArena.tsx'),{ManualWebRTCSession}=await import('/src/game/multiplayer/ManualWebRTCSession.ts'),{FriendsCrewRegistry}=await import('/src/game/multiplayer/FriendsCrewIdentity.ts');
    const {FriendsSimulation}=await import('/src/game/multiplayer/FriendsSimulation.ts'),{MultiplayerRendererBridge}=await import(bridgeUrl);
    const tick=FriendsSimulation.prototype.tick;FriendsSimulation.prototype.tick=function(dt){window.soaringArenaSim=this;return tick.call(this,dt);};
    const render=MultiplayerRendererBridge.prototype.render;MultiplayerRendererBridge.prototype.render=function(s,...args){window.soaringArenaBridge=this;return render.call(this,s,...args);};
    const launch={role:'host',session:new ManualWebRTCSession({role:'host',friends:true,iceServers:[]}),localPlayerId:'host',players:[{id:'host',label:'Host',color:'#8de6ce'}],peerPlayerIds:{},friendsCrew:new FriendsCrewRegistry(),language:'en',worldId:'friends_frontier',gameMode:'friends',soloTest:true};
    createRoot(document.getElementById('root')).render(React.createElement(MultiplayerArena,{launch,controlScheme:'QWERTY',onExit:()=>{}}));
  },bridgeUrl);
  await page.waitForFunction(()=>window.soaringArenaBridge?.friendsWorldArrival.sequence.stage==='online',{},{timeout:90000});
  await page.evaluate(async()=>{
    const {SOARING_LAUNCHES,soaringWind}=await import('/src/game/world/FriendsSoaringWeather.ts');const sim=window.soaringArenaSim,p=sim['players'].get('host'),l=SOARING_LAUNCHES[0];
    Object.assign(p,{x:l.x,y:l.y,z:sim['friendsFrontier'].terrain.surfaceHeight(l.x,l.y),verticalVelocity:0,velocityX:0,velocityY:0});
    const r=window.soaringArenaBridge.renderer,a=soaringWind(sim.createSnapshot().elapsedMs).angle+Math.PI;r.yaw=-a-Math.PI/2;r.pitch=-.12;
    Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>r.renderer.domElement});document.dispatchEvent(new Event('pointerlockchange'));
  });
  await page.waitForTimeout(2000);
  await page.keyboard.press('KeyT');report.steps.push('Fun opened');
  const glider=page.getByRole('button',{name:'Glider',exact:true});
  await glider.waitFor({state:'visible'});report.steps.push('Glider visible');
  if(mobile)await glider.tap();else await glider.click();report.steps.push('Glider selected');
  await page.waitForFunction(()=>window.soaringArenaSim.createSnapshot().players[0].friendsSoaring?.phase==='ready',{},{timeout:12000});
  assert.equal(await glider.getAttribute('aria-pressed'),'true');
  const bounds=await glider.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=(mobile?390:1280));assert(bounds.height>=44);
  report.funBar={slot:6,selected:true,mobile,bounds};
  assert.equal(await page.getByRole('button',{name:/Equip wing|Stow wing/}).count(),0);
  await page.screenshot({path:mobile?'artifacts/soaring-polish/fun-bar-mobile.png':'artifacts/soaring-polish/fun-bar-glider.png'});
  if(mobile)await page.getByRole('button',{name:'1 Stone',exact:true}).tap();else await page.getByRole('button',{name:'1 Stone',exact:true}).click();
  await page.waitForFunction(()=>!window.soaringArenaSim.createSnapshot().players[0].friendsSoaring);
  assert.equal(await page.getByRole('region',{name:'Paragliding instruments'}).count(),0);
  await page.keyboard.press('Digit6');
  await page.waitForFunction(()=>window.soaringArenaSim.createSnapshot().players[0].friendsSoaring?.phase==='ready',{},{timeout:12000});
  await page.keyboard.down('KeyW');await page.waitForFunction(()=>window.soaringArenaSim.createSnapshot().players[0].friendsSoaring?.phase==='flying',{},{timeout:12000});await page.keyboard.up('KeyW');
  await page.waitForFunction(()=>document.querySelector('[data-tool="13"]')?.disabled===true&&window.soaringArenaBridge.renderer.rightArmRoot.visible===false);
  report.flight=await page.evaluate(()=>{const b=window.soaringArenaBridge,p=window.soaringArenaSim.createSnapshot().players[0];const rig=b.renderer.scene.getObjectByName('first-person-paraglider'),hands=rig.children.filter(c=>c.name==='soaring-hand').map(hand=>{const point=hand.getWorldPosition(b.renderer.camera.position.clone()).project(b.renderer.camera);return {x:point.x,y:point.y,visible:Math.abs(point.x)<1&&Math.abs(point.y)<1&&point.z<1};});return {hands,phase:p.friendsSoaring.phase,wing:!!rig,defaultHandsHidden:!b.renderer.rightArmRoot.visible,cameraRoll:b.renderer.presentationCameraRoll};});
  assert.equal(await glider.isDisabled(),true);
  assert.equal(report.flight.phase,'flying');assert.equal(report.flight.wing,true);assert.ok(report.flight.hands.every(h=>h.visible));assert.equal(report.flight.defaultHandsHidden,true);assert.deepEqual(report.errors,[]);
  await page.screenshot({path:mobile?'artifacts/soaring-polish/arena-mobile.png':'artifacts/soaring-polish/arena-flight.png'});await writeFile(mobile?'artifacts/soaring-polish/arena-mobile-report.json':'artifacts/soaring-polish/arena-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){
  if(page){report.failure=String(error);report.debug=await page.evaluate(()=>({width:innerWidth,buttons:[...document.querySelectorAll('button')].map(b=>({text:b.textContent,disabled:b.disabled,hidden:!b.getClientRects().length})),fun:document.querySelector('.friends-fun-bar')?.outerHTML,player:window.soaringArenaSim?.createSnapshot().players[0],input:window.soaringArenaSim?.['inputByPlayer']?.get('host')}));await page.screenshot({path:'artifacts/soaring-polish/arena-failure.png'});await writeFile('artifacts/soaring-polish/arena-failure.json',JSON.stringify(report,null,2));}
  throw error;
}finally{await browser.close();}
