import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir,writeFile } from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3015';
const directory='artifacts/friends-swim-animation';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const errors=[],poses={};
try{
 const page=await browser.newPage({viewport:{width:1100,height:760}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/tools/friends-character-review.html');
 await page.waitForFunction(()=>window.friendsCharacterReview?.demoRig.avatar.children.length>0);
 await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
 for(const [name,speed,vertical,submerged] of [['treading',0,0,false],['surface',140,0,false],['underwater',140,0,true],['diving',100,-80,true],['ascending',100,80,true]]){
  poses[name]=await page.evaluate(async({speed,vertical,submerged})=>{
   const r=window.friendsCharacterReview;
   const THREE=await import('/node_modules/.vite/deps/three.js');
   const {placeFriendsCharacter,updateFriendsCharacter}=r;
   for(const {rig}of r.crew)rig.root.visible=false;
   r.demoRig.root.visible=true;r.demoRig.nameplate.visible=false;
   const p={...r.demoPlayer,x:0,y:0,z:0,angle:0,motion:{...r.demoPlayer.motion,swimming:true,swimSubmerged:submerged,velocityX:speed,velocityY:0,verticalVelocity:vertical}};
   window.swimReviewTime=Math.max(window.swimReviewTime??0,r.time);
   for(let t=0;t<1800;t+=16.666){window.swimReviewTime+=16.666;placeFriendsCharacter(r.demoRig,p);updateFriendsCharacter(r.demoRig,p,window.swimReviewTime);}
   r.demoRig.nameplate.visible=false;
   r.scene.children.find(o=>o.isMesh).position.y=-45;
   r.camera.position.set(85,55,110);r.camera.lookAt(6,20,0);r.camera.fov=36;r.camera.updateProjectionMatrix();
   r.renderer.autoClear=true;r.renderer.render(r.scene,r.camera);
   const bounds=new THREE.Box3().setFromObject(r.demoRig.avatar);
   return {pitch:r.demoRig.avatar.rotation.x,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},drawCalls:r.renderer.info.render.calls};
  },{speed,vertical,submerged});
  await page.screenshot({path:`${directory}/${name}.png`});
 }
 assert.ok(poses.surface.pitch>1&&poses.treading.pitch<.4);
 assert.ok(poses.diving.pitch>poses.underwater.pitch&&poses.ascending.pitch<poses.underwater.pitch);
 assert.deepEqual(errors,[]);
 await writeFile(`${directory}/report.json`,JSON.stringify({errors,poses},null,2));
 console.log(JSON.stringify({errors,poses},null,2));
}finally{await browser.close();}
