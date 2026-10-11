import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(process.env.PLAYWRIGHT_MODULE||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const {chromium}=playwright,origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3001';
const browser=await chromium.launch({headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const errors=[];
try {
 const host=await (await browser.newContext()).newPage(),guest=await (await browser.newContext()).newPage();
 for(const p of [host,guest])p.on('pageerror',e=>errors.push(e.message));
 for(const p of [host,guest]) await p.route('**/tools/friends-multiplayer-review.ts*',async route=>{const response=await route.fetch();let body=await response.text();assert(body.includes('snapshot = simulation.createSnapshot();')); assert(body.includes('z: p.z'));body=body.replace('snapshot = simulation.createSnapshot();','snapshot = simulation.createSnapshot(); snapshot.players[0].friendsSeat=window.optionalFixture?{vehicleId:"grand-3",index:0}:undefined;');body=body.replace('z: p.z','z: p.z, friendsSeat:p.friendsSeat');await route.fulfill({response,body});});
 for(const p of [host,guest]){await p.goto(origin+'/tools/friends-multiplayer-review.html');await p.waitForFunction(()=>window.friendsReview);}
 const room=await host.evaluate(()=>window.friendsReview.host('Disconnect regression'));
 await guest.evaluate(code=>window.friendsReview.join(code,'Guest'),room.code);
 await guest.waitForFunction(()=>{const s=window.friendsReview.status();return s.playing&&s.players?.length===2;});
 for(let i=0;i<6;i++){
  await host.evaluate(()=>window.optionalFixture=true);
  await guest.waitForFunction(()=>window.friendsReview.status().players?.some(p=>p.friendsSeat?.vehicleId==='grand-3'));
  const before=await guest.evaluate(()=>window.friendsReview.status().tick);
  await host.evaluate(()=>window.optionalFixture=false);
  await guest.waitForFunction(before=>{const s=window.friendsReview.status();return s.tick>before+3&&s.players.every(p=>!p.friendsSeat);},before);
 }
 assert.deepEqual(errors,[]);const status=await guest.evaluate(()=>window.friendsReview.status());assert.deepEqual(status.errors,[]);assert(status.peers.some(p=>p.state==='connected'));
 console.log(JSON.stringify({clearedFieldCycles:6,errors,connected:true,finalTick:status.tick}));
}finally{await browser.close();}
