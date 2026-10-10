import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014',directory=process.env.FISHING_ARTIFACT_DIR||'artifacts/fishing-casting-realism';
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),report={errors:[],frames:[]};
try{
  const page=await browser.newPage({viewport:{width:1200,height:800}});page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(origin+'/tools/friends-fishing-review.html');
  await page.waitForFunction(()=>fishingReview.fishing.rods.get('review')?.tip&&fishingReview.fishing.rods.get('review')?.reelArm);
  await page.evaluate(()=>{fishingReview.pause();fishingReview.setStage('rod');});
  for(const [name,held,age] of [['ready',null,null],['charging',300,null],['charged',1200,null],['release',null,0],['forward',null,180],['recovery',null,350],['settled',null,800]]){
    report.frames.push(await page.evaluate(({name,held,age})=>{
      const r=fishingReview,now=10000+(age??0),state={equipped:['review'],charges:held!==null?[{playerId:'review',chargeAt:now-held}]:[],fish:[],casts:age!==null?[{id:1,playerId:'review',x:r.player.x-100,y:r.player.y,z:r.player.z+26,from:{...r.player,z:r.player.z+26},target:{x:r.player.x-100,y:r.player.y,z:r.player.z+26},phase:'casting',atMs:10000,castAt:10000,castPower:1,biteAt:0,size:0}]:[]};
      r.fishing.update(state,[r.player],'review',7,r.camera,now,16,true,r.project,()=>false);
      r.renderer.info.reset();r.renderer.autoClear=true;r.renderer.render(r.scene,r.camera);r.renderer.autoClear=false;r.renderer.clearDepth();r.renderer.render(r.viewmodel,r.handCamera);
      const rod=r.fishing.rods.get('review'),tip=rod.tip.getWorldPosition(new r.THREE.Vector3()),cameraTip=r.handCamera.worldToLocal(tip.clone());
      return {name,pitch:rod.root.rotation.x,tipCamera:cameraTip.toArray(),calls:r.renderer.info.render.calls,flex:rod.mesh.morphTargetInfluences[0],gl:r.renderer.getContext().getError()};
    },{name,held,age}));
    await page.screenshot({path:`${directory}/${name}.png`});
  }
  assert(report.frames[2].tipCamera[2]>report.frames[0].tipCamera[2]);
  assert(report.frames[4].tipCamera[2]<report.frames[0].tipCamera[2]);
  assert.equal(report.frames[2].pitch,report.frames[3].pitch);
  assert.equal(report.frames[0].calls,report.frames[2].calls);
  assert(report.frames.every(f=>f.gl===0));assert.deepEqual(report.errors,[]);
  report.remote=await page.evaluate(()=>{
    const r=fishingReview,checks=[];
    for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
      const p={...r.player,angle},state={equipped:['review'],casts:[],fish:[]};
      r.fishing.update(state,[p],'other',7,r.camera,12000,16,false,r.project,()=>false);
      const rod=r.fishing.rods.get('review');rod.root.updateWorldMatrix(true,true);
      const base=rod.root.getWorldPosition(new r.THREE.Vector3()),tip=rod.tip.getWorldPosition(new r.THREE.Vector3()).sub(base);
      checks.push({angle,forward:tip.x*Math.cos(angle)+tip.z*Math.sin(angle)});
    }
    return checks;
  });assert(report.remote.every(c=>c.forward>0));
  report.emptyReelAudio=await page.evaluate(()=>{
    const r=fishingReview,original=r.audio.play,events=[];let stops=0;
    r.audio.play=(cue,...args)=>{events.push({cue,args});return {stop:()=>stops++};};
    const state={equipped:['review'],fish:[],casts:[{id:2,playerId:'review',...r.player,from:{...r.player},target:{...r.player},phase:'reeling',empty:true,reelDurationMs:6000,atMs:14000,biteAt:0,size:0}]};
    try{
      for(const now of [14000,14900,19000])r.fishing.update(state,[r.player],'review',7,r.camera,now,16,true,r.project,()=>false);
      r.fishing.update({equipped:['review'],fish:[],casts:[]},[r.player],'review',7,r.camera,20100,16,true,r.project,()=>false);
    }finally{r.audio.play=original;}
    return {events,stops};
  });
  assert.equal(report.emptyReelAudio.events.length,1);assert.equal(report.emptyReelAudio.events[0].args[3],6);assert.equal(report.emptyReelAudio.events[0].args[4].loop,true);assert.equal(report.emptyReelAudio.stops,1);
  await writeFile(`${directory}/casting-validation.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
