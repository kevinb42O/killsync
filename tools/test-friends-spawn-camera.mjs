import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const origin=process.env.FRIENDS_TEST_ORIGIN || 'http://localhost:3015';
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
try {
const page=await browser.newPage({viewport:{width:900,height:740}});
page.on('pageerror',e=>console.log('ERROR',e.message));
await page.addInitScript(()=>{window.__vite_plugin_react_preamble_installed__=true;window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;localStorage.setItem('sunline.preferences.v1',JSON.stringify({renderScale:.5,shadows:false,fieldOfView:140}));});
await page.route('**/__camera_debug',r=>r.fulfill({contentType:'text/html',body:'<html><body style="margin:0"><div id="root"></div></body></html>'}));
await page.goto(origin+'/__camera_debug');
const source=await (await page.request.get(origin+'/src/components/MultiplayerArena.tsx')).text();
const bridgeUrl=source.match(/from ["']([^"']*MultiplayerRendererBridge[^"']*)["']/)[1];
await page.evaluate(async bridgeUrl=>{
const React=(await import('/node_modules/.vite/deps/react.js')).default;
const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
const {MultiplayerArena}=await import('/src/components/MultiplayerArena.tsx');
const {ManualWebRTCSession}=await import('/src/game/multiplayer/ManualWebRTCSession.ts');
const {FriendsCrewRegistry}=await import('/src/game/multiplayer/FriendsCrewIdentity.ts');
const {MultiplayerRendererBridge}=await import(bridgeUrl);
const original=MultiplayerRendererBridge.prototype.render;
window.samples=[];
MultiplayerRendererBridge.prototype.render=function(snapshot,...args){window.bridge=this;const result=original.call(this,snapshot,...args); if(snapshot)window.samples.push({dt:args[1],yaw:this.renderer.yaw,pitch:this.renderer.pitch,rotation:this.renderer.camera.rotation.toArray(),position:this.renderer.camera.position.toArray(),fov:this.renderer.camera.fov,stage:this.friendsWorldArrival.sequence.stage});return result;};
const launch={role:'host',session:new ManualWebRTCSession({role:'host',friends:true,iceServers:[]}),localPlayerId:'host',players:[{id:'host',label:'Host',color:'#8de6ce'}],peerPlayerIds:{},friendsCrew:new FriendsCrewRegistry(),language:'en',worldId:'friends_frontier',gameMode:'friends',soloTest:true};
createRoot(document.getElementById('root')).render(React.createElement(MultiplayerArena,{launch,controlScheme:'QWERTY',onExit:()=>{}}));
},bridgeUrl);
await page.waitForFunction(()=>window.samples.length>=100,{},{timeout:90000});
const result=await page.evaluate(()=>{
const r=window.bridge.renderer,canvas=r.renderer.domElement;
let locked=canvas;
Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>locked});
document.dispatchEvent(new Event('pointerlockchange'));
const yaw=r.yaw,pitch=r.pitch;
window.dispatchEvent(new MouseEvent('mousemove',{movementX:5000,movementY:5000}));
const ignoredWarp=r.yaw===yaw&&r.pitch===pitch;
window.dispatchEvent(new MouseEvent('mousemove',{movementX:10,movementY:-5}));
const normalLook=Math.abs(r.yaw-(yaw-10*r.sensitivity*r.lookSensitivityScale))<1e-10&&Math.abs(r.pitch-(pitch+5*r.sensitivity*r.lookSensitivityScale))<1e-10;
locked=null;document.dispatchEvent(new Event('pointerlockchange'));
const beforeRelock=r.yaw;
locked=canvas;document.dispatchEvent(new Event('pointerlockchange'));
window.dispatchEvent(new MouseEvent('mousemove',{movementX:-5000,movementY:-5000}));
const ignoredRelock=r.yaw===beforeRelock;
return {frames:window.samples.length,negativeDeltas:window.samples.filter(s=>s.dt<0).length,finiteCamera:window.samples.every(s=>[s.fov,...s.rotation.slice(0,3),...s.position].every(Number.isFinite)),fovRange:[Math.min(...window.samples.map(s=>s.fov)),Math.max(...window.samples.map(s=>s.fov))],ignoredWarp,normalLook,ignoredRelock};
});
if(result.fovRange[0]<90||result.fovRange[1]>140||result.negativeDeltas||!result.finiteCamera||!result.ignoredWarp||!result.normalLook||!result.ignoredRelock)throw new Error(JSON.stringify(result));
console.log(JSON.stringify(result));
}finally{await browser.close();}
