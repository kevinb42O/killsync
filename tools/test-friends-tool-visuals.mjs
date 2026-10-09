import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {friendsBaselineModules} from './friends-baseline-modules.mjs';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014',directory=process.env.FRIENDS_TEST_ARTIFACTS||'artifacts/tool-visuals';
await mkdir(directory,{recursive:true});
const baseline=await friendsBaselineModules(null,['FriendsFlashlight'],directory+'/baseline');
const browser=await playwright.chromium.launch({headless:true,args:['--use-angle=metal','--disable-background-timer-throttling']});
const report={errors:[],checks:[]};
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.route('**/__tools_review',r=>r.fulfill({contentType:'text/html',body:'<html><body style="margin:0;background:#18292e"></body></html>'}));
  await page.goto(origin+'/__tools_review');
  const source=await(await page.request.get(origin+'/src/game/rendering/FriendsHeldEquipment.ts')).text();
  const threeUrl=source.match(/from ["']([^"']*\/three[^"']*)["']/)[1];
  report.setup=await page.evaluate(async({threeUrl,baseline})=>{
    const THREE=await import(threeUrl),{FriendsToolViewmodels}=await import('/src/game/rendering/FriendsToolViewmodels.ts'),{FriendsFlashlight}=await import('/src/game/rendering/FriendsFlashlight.ts'),{FriendsFlashlight:OldFlashlight}=await import(baseline.FriendsFlashlight),{fitFriendsAsset,loadFriendsAsset}=await import('/src/game/rendering/FriendsAssets.ts');
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1440,900);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;renderer.autoClear=false;document.body.append(renderer.domElement);
    const world=new THREE.Scene(),worldCamera=new THREE.PerspectiveCamera(108,1.6,.1,100);worldCamera.position.set(0,1.7,0);
    world.background=new THREE.Color('#6f9294');world.fog=new THREE.Fog('#6f9294',8,35);world.add(new THREE.HemisphereLight('#fff0cf','#293f38',2));const sun=new THREE.DirectionalLight('#fff0cf',2);sun.position.set(-5,10,4);world.add(sun);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:'#576c4c',roughness:1}));floor.rotation.x=-Math.PI/2;world.add(floor);
    for(let i=0;i<24;i++){const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.16,.23,2.6,7),new THREE.MeshStandardMaterial({color:'#695342'}));trunk.position.set((i%8-3.5)*3.2,1.3,-6-Math.floor(i/8)*7);world.add(trunk);const leaves=new THREE.Mesh(new THREE.ConeGeometry(1.4,4.5,7),new THREE.MeshStandardMaterial({color:i%2?'#3e5b49':'#304f43'}));leaves.position.copy(trunk.position);leaves.position.y=4;world.add(leaves);}
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(98,1.6,.025,1000);scene.add(camera);
    const tools=new FriendsToolViewmodels(scene),torch=new FriendsFlashlight(world,scene,worldCamera,renderer);torch.toggle();
    const oldScene=new THREE.Scene(),oldCamera=new THREE.PerspectiveCamera(98,1.6,.025,1000);oldScene.add(oldCamera);
    const legacy=new THREE.Group();oldCamera.add(legacy);legacy.add(new THREE.HemisphereLight(0xffeed0,0x3d4b46,2));legacy.position.set(.28,-.25,-.7);legacy.rotation.set(-.2,.2,-.35);
    const oldModels=[];for(const name of ['toolAxe','toolPickaxe','toolShovel','toolAxeUpgraded','toolPickaxeUpgraded','toolShovelUpgraded']){const model=fitFriendsAsset(await loadFriendsAsset(name),{x:.46,y:.82,z:.22},0,'contain');model.rotation.y=-Math.PI/2;model.position.y=-.34;model.visible=false;legacy.add(model);oldModels.push(model);}
    const oldTorch=new OldFlashlight(world,oldScene,worldCamera,renderer);oldTorch.toggle();
    const render=(id,old=false,upgraded=false,time=1000,flashlight=false)=>{
      tools.update(id,time,false,upgraded,!old);torch.update(time/1000,flashlight&&!old);
      for(let i=0;i<oldModels.length;i++)oldModels[i].visible=old&&i===(Math.min(id,3)-1+(upgraded?3:0));legacy.visible=old&&id>=1&&id<=3;oldTorch.update(time/1000,flashlight&&old);
      renderer.clear();renderer.render(world,worldCamera);renderer.clearDepth();renderer.render(old?oldScene:scene,old?oldCamera:camera);
      return {draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures};
    };
    window.toolsReview={THREE,renderer,world,worldCamera,scene,camera,tools,torch,oldScene,oldCamera,oldModels,oldTorch,legacy,render};
    await new Promise(resolve=>setTimeout(resolve,800));render(1);const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown',glError:gl.getError()};
  },{threeUrl,baseline:baseline.urls});
  for(const [id,name] of [[1,'axe'],[2,'pickaxe'],[3,'shovel']]) {
    await page.evaluate(({id})=>window.toolsReview.render(id,true),{id});await page.screenshot({path:`${directory}/before-${name}.png`});
    await page.evaluate(({id})=>{window.toolsReview.render(id);window.toolsReview.render(id,false,false,1500);},{id});await page.waitForTimeout(400);await page.evaluate(({id})=>window.toolsReview.render(id,false,false,1500),{id});await page.screenshot({path:`${directory}/after-${name}.png`});
    if(id<4){await page.evaluate(({id})=>{window.toolsReview.render(id,false,true);window.toolsReview.render(id,false,true,1500);},{id});await page.waitForTimeout(400);await page.evaluate(({id})=>window.toolsReview.render(id,false,true,1500),{id});await page.screenshot({path:`${directory}/after-${name}-upgraded.png`});}
  }
  await page.evaluate(()=>window.toolsReview.render(0,true,false,1500,true));await page.screenshot({path:`${directory}/before-flashlight.png`});
  await page.evaluate(()=>window.toolsReview.render(0,false,false,1500,true));await page.screenshot({path:`${directory}/after-flashlight.png`});
  await page.evaluate(()=>window.toolsReview.render(2,false,false,2000,true));await page.screenshot({path:`${directory}/tools-and-flashlight.png`});
  if(process.env.FRIENDS_TOOL_REVIEW_FAST!=='1')report.performance=await page.evaluate(async()=>{
    const r=window.toolsReview,{renderer}=r,gl=renderer.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');renderer.info.autoReset=false;
    const p=(a,n)=>a.length?a.sort((a,b)=>a-b)[Math.floor((a.length-1)*n)]:null,result={};
    for(const [id,name] of [[1,'axe'],[2,'pickaxe'],[3,'shovel'],[0,'flashlight']]) {
      const samples=[{cpu:[],queries:[],draws:0,triangles:0},{cpu:[],queries:[],draws:0,triangles:0}];
      for(let i=0;i<180;i++) {
        const old=i%2===0,b=samples[old?0:1];renderer.info.reset();let q;
        if(timer&&i>=20){q=gl.createQuery();gl.beginQuery(timer.TIME_ELAPSED_EXT,q);}
        const start=performance.now();r.render(id,old,false,3000+i*16,id===0);
        if(q){gl.endQuery(timer.TIME_ELAPSED_EXT);b.queries.push(q);}
        if(i>=20)b.cpu.push(performance.now()-start);b.draws=renderer.info.render.calls-49;b.triangles=renderer.info.render.triangles;
        await new Promise(requestAnimationFrame);
      }
      const summary=b=>{const gpu=[];if(timer&&!gl.getParameter(timer.GPU_DISJOINT_EXT))for(const q of b.queries){if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);}return {cpuP50:p(b.cpu,.5),cpuP95:p(b.cpu,.95),gpuP50:p(gpu,.5),gpuP95:p(gpu,.95),draws:b.draws,triangles:b.triangles};};
      result[name]={before:summary(samples[0]),after:summary(samples[1])};
    }
    renderer.info.autoReset=true;return result;
  });
  report.framing=await page.evaluate(()=>{
    const r=window.toolsReview,checks=[];
    for(const aspect of [16/9,2.4,9/16])for(const fov of [70,98,120])for(const id of [1,2,3]) {
      r.camera.aspect=aspect;r.camera.fov=fov;r.camera.updateProjectionMatrix();r.tools.update(id,10000,false,false);r.tools.update(id,10500,false,false);r.scene.updateMatrixWorld(true);
      const meshes=[];r.tools.root.traverseVisible(o=>{if(o.isMesh){const bounds=new r.THREE.Box3(),point=new r.THREE.Vector3(),positions=o.geometry.getAttribute('position');for(let i=0;i<positions.count;i++)bounds.expandByPoint(point.fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld).project(r.camera));meshes.push({name:o.name,min:bounds.min.toArray(),max:bounds.max.toArray(),finite:[...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite)});}});
      checks.push({aspect,fov,id,meshes});
    }
    r.camera.aspect=1.6;r.camera.fov=98;r.camera.updateProjectionMatrix();return checks;
  });
  assert.equal(report.setup.glError,0);assert.deepEqual(report.errors,[]);
  for(const [name,result]of Object.entries(report.performance||{}))assert.ok(result.after.draws<=(name==='flashlight'?9:2));
  assert.ok(report.framing.every(c=>c.meshes.every(m=>m.finite)));
  for(const c of report.framing){const arm=c.meshes.find(m=>m.name==='premade-right-arm');assert.ok(arm&&(arm.min[1]<-1||arm.max[0]>1),`arm must continue beyond screen edge: ${JSON.stringify(c)}`);}
  report.checks.push('all four tools and upgraded mining variants render without WebGL errors','existing mining tools plus premade connected arm stay at two draws','premade arm continues beyond the frame across 70–120 degree equipment FOV and portrait/ultrawide aspect ratios');
  await page.evaluate(()=>{const r=window.toolsReview;r.render(1,false,false,11000);r.tools.setAction({actor:'host',serial:1,tool:1,targetId:'tree',start:11000,contact:11200,end:11600},11175);r.renderer.clear();r.renderer.render(r.world,r.worldCamera);r.renderer.clearDepth();r.renderer.render(r.scene,r.camera);});await page.screenshot({path:`${directory}/axe-windup.png`});
  console.log(JSON.stringify({setup:report.setup,performance:report.performance,checks:report.checks,errors:report.errors},null,2));
} finally {await writeFile(directory+(process.env.FRIENDS_TOOL_REVIEW_FAST==='1'?'/render-smoke.json':'/render-performance.json'),JSON.stringify(report,null,2));await browser.close();await baseline.dispose();}
