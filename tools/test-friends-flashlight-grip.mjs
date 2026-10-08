import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);let playwright;try{playwright=require('playwright');}catch{playwright=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const directory='artifacts/flashlight-grip',origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3000';await mkdir(directory,{recursive:true});
const browser=await playwright.chromium.launch({headless:true,args:['--use-angle=metal']});const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1200,height:900}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/__flashlight_grip',r=>r.fulfill({contentType:'text/html',body:'<style>body{margin:0}canvas{display:block}</style>'}));await page.goto(origin+'/__flashlight_grip');
 const source=await(await page.request.get(origin+'/src/game/rendering/FriendsHeldEquipment.ts')).text();const threeUrl=source.match(/from ["']([^"']*\/three[^"']*)["']/)[1];
 const report=await page.evaluate(async threeUrl=>{
  const THREE=await import(threeUrl),{loadFriendsGrip}=await import('/src/game/rendering/FriendsHeldEquipment.ts'),{FriendsFlashlight}=await import('/src/game/rendering/FriendsFlashlight.ts');
  const [left,right,inward]=await Promise.all([loadFriendsGrip('left'),loadFriendsGrip('right'),loadFriendsGrip('right','inward')]);
  const a=right.userData.friendsShoulderPoints,b=inward.userData.friendsShoulderPoints;const inwardShoulderError=Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
  left.geometry.computeBoundingBox();right.geometry.computeBoundingBox();const l=left.geometry.boundingBox,r=right.geometry.boundingBox;
  const mirrorError=Math.max(Math.abs(l.min.x+r.max.x),Math.abs(l.max.x+r.min.x),Math.abs(l.min.y-r.min.y),Math.abs(l.max.y-r.max.y),Math.abs(l.min.z-r.min.z),Math.abs(l.max.z-r.max.z));
  const scene=new THREE.Scene(),viewmodel=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1200/900,.01,10),renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1200,900);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;document.body.append(renderer.domElement);
  const heldCamera=new THREE.PerspectiveCamera(98,1200/900,.025,10);viewmodel.add(heldCamera);
  const lightCamera=new THREE.PerspectiveCamera(),flashlight=new FriendsFlashlight(scene,viewmodel,lightCamera,renderer);flashlight.toggle();flashlight.update(0,true);await new Promise(r=>setTimeout(r,50));
  const arm=viewmodel.getObjectByName('premade-left-arm'),cap=arm.userData.friendsShoulderPoints,capFrames=[];
  for(const aspect of [9/16,4/3,16/9,2.4])for(const fov of [70,98,120]){
    heldCamera.fov=fov;heldCamera.aspect=aspect;heldCamera.updateProjectionMatrix();flashlight.update(0,true);viewmodel.updateMatrixWorld(true);
    const values=[];for(let i=0;i<cap.length;i+=3)values.push(new THREE.Vector3().fromArray(cap,i).applyMatrix4(arm.matrixWorld).applyMatrix4(heldCamera.matrixWorldInverse).z);
    capFrames.push({aspect,fov,minZ:Math.min(...values),maxZ:Math.max(...values),vertices:values.length});
  }
  heldCamera.fov=98;heldCamera.aspect=1200/900;heldCamera.updateProjectionMatrix();flashlight.update(0,true);
  const hand=viewmodel.getObjectByName('held-flashlight'),heldPosition=hand.position.clone(),heldQuaternion=hand.quaternion.clone(),heldScale=hand.scale.clone();hand.removeFromParent();hand.position.set(0,0,0);hand.rotation.set(0,0,0);hand.scale.setScalar(1);scene.add(hand);scene.background=new THREE.Color('#263a3b');scene.add(new THREE.HemisphereLight('#fff0e2','#5e756e',2.5));const key=new THREE.DirectionalLight('#ffffff',2);key.position.set(-2,3,2);scene.add(key);
  const center=new THREE.Vector3(-.04,-.035,.015);
  function render(position){camera.position.fromArray(position);camera.lookAt(center);renderer.render(scene,camera);return {...renderer.info.render};}
  function renderHeld(){viewmodel.add(hand);hand.position.copy(heldPosition);hand.quaternion.copy(heldQuaternion);hand.scale.copy(heldScale);viewmodel.background=new THREE.Color('#263a3b');renderer.render(viewmodel,heldCamera);}
  window.gripReview={scene,renderer,camera,hand,flashlight,render,renderHeld};return {mirrorError,inwardShoulderError,capFrames,left:{min:l.min.toArray(),max:l.max.toArray()},right:{min:r.min.toArray(),max:r.max.toArray()}};
 },threeUrl);
 assert(report.mirrorError<.002,`Left palm/fingers must mirror the right grip without flipping palm side: ${JSON.stringify(report)}`);
 assert(report.inwardShoulderError<.00001,'Turning the mining grip must retain its shoulder opening');
 assert(report.capFrames.every(f=>f.vertices>0&&f.minZ>0),'The complete flashlight shoulder opening must stay behind the camera at every FOV/aspect');
 for(const [name,position] of [['palm',[-.75,.40,.65]],['back',[.7,-.3,.65]],['side',[-.8,0,.08]],['front',[-.25,.2,-.75]]]){
  await page.evaluate(p=>gripReview.render(p),position);await page.screenshot({path:`${directory}/grip-${name}.png`});
 }
 await page.evaluate(()=>gripReview.renderHeld());await page.screenshot({path:`${directory}/first-person.png`});
 assert.deepEqual(errors,[]);report.errors=errors;report.render=await page.evaluate(()=>({...gripReview.renderer.info.render}));await writeFile(`${directory}/grip-checks.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
