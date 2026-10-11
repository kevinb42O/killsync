import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014',directory=process.env.FISHING_ARTIFACT_DIR||'artifacts/fishing-idle-bobber';
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
      return {name,pitch:rod.root.rotation.x,tipCamera:cameraTip.toArray(),calls:r.renderer.info.render.calls,flex:rod.mesh.morphTargetInfluences[0],floatVisible:rod.float.visible,lineVisible:rod.line.visible,gl:r.renderer.getContext().getError()};
    },{name,held,age}));
    await page.screenshot({path:`${directory}/${name}.png`});
  }
  assert(report.frames[2].tipCamera[2]>report.frames[0].tipCamera[2]);
  assert(report.frames[4].tipCamera[2]<report.frames[0].tipCamera[2]);
  assert.equal(report.frames[2].pitch,report.frames[3].pitch);
  // Charging can swing the three bobber meshes out of the camera frustum.
  assert(Math.abs(report.frames[0].calls-report.frames[2].calls)<=3);
  assert.equal(report.frames[0].floatVisible,true);assert.equal(report.frames[0].lineVisible,true);
  assert.equal(report.frames[3].floatVisible,true);assert.equal(report.frames[3].lineVisible,true);
  assert.equal(report.frames[4].floatVisible,true);assert.equal(report.frames[4].lineVisible,true);
  assert(report.frames.every(f=>f.gl===0));assert.deepEqual(report.errors,[]);
  report.idle=await page.evaluate(()=>{
    const r=fishingReview,state={equipped:['review'],casts:[],fish:[]};
    r.setStage('rod');
    const update=(now)=>{r.handCamera.position.copy(r.camera.position);r.handCamera.quaternion.copy(r.camera.quaternion);r.fishing.update(state,[r.player],'review',7,r.camera,now,16,true,r.project,()=>false);};
    update(22000);const rod=r.fishing.rods.get('review'),buffer=rod.line.geometry.attributes.position.array;
    const directions=[];
    for(let i=0;i<60;i++){r.camera.position.x+=.4;update(22016+i*16);directions.push(Math.abs(rod.bobber.direction.x));}
    const swing=Math.max(...directions);
    for(let i=0;i<600;i++)update(23000+i*16);
    const result={swing,settled:rod.bobber.direction.y,visible:rod.float.visible&&rod.line.visible,bufferReused:buffer===rod.line.geometry.attributes.position.array,viewmodel:rod.float.parent===r.handCamera};
    r.setStage('rod');r.handCamera.position.copy(r.camera.position);r.handCamera.quaternion.copy(r.camera.quaternion);
    return result;
  });
  assert(report.idle.swing>.02);assert(report.idle.settled<-.999);assert(report.idle.visible);assert(report.idle.bufferReused);assert(report.idle.viewmodel);
  report.swingControls=await page.evaluate(()=>{
    const r=fishingReview,state={equipped:['review'],casts:[],fish:[]},checks=[];
    const update=(now)=>{
      r.handCamera.position.copy(r.camera.position);r.handCamera.quaternion.copy(r.camera.quaternion);
      r.fishing.update(state,[r.player],'review',7,r.camera,now,1000/60,true,r.project,()=>false);
    };
    for(const control of ['strafe','forward','yaw','pitch','circle']){
      r.setStage('rod');r.camera.rotation.set(-.3,Math.PI/2,0,'YXZ');
      const origin=r.camera.position.clone(),rod=r.fishing.rods.get('review');rod.bobber.reset();update(30000);
      let highest=-1,motion=0,tetherError=0,attachmentError=0;
      const previous=rod.bobber.direction.clone();
      for(let i=1;i<=240;i++){
        const t=i/60,phase=t*7;
        if(control==='strafe')r.camera.position.z=origin.z+20*Math.sin(phase);
        if(control==='forward')r.camera.position.x=origin.x+20*Math.sin(phase);
        if(control==='yaw'||control==='circle')r.camera.rotation.y=Math.PI/2+.65*Math.sin(phase);
        if(control==='pitch'||control==='circle')r.camera.rotation.x=-.3+.65*(1-Math.cos(phase));
        update(30000+i*1000/60);
        motion+=previous.distanceTo(rod.bobber.direction);previous.copy(rod.bobber.direction);
        highest=Math.max(highest,rod.bobber.direction.y);
        const tip=rod.tip.getWorldPosition(new r.THREE.Vector3()),length=23*rod.root.scale.y/32;
        tetherError=Math.max(tetherError,Math.abs(tip.distanceTo(rod.bobber.position)-length));
        const end=r.handCamera.localToWorld(rod.line.points.at(-1).clone());
        attachmentError=Math.max(attachmentError,end.distanceTo(rod.bobber.position));
      }
      const released=rod.bobber.direction.clone();for(let i=0;i<12;i++)update(34000+(i+1)*1000/60);
      checks.push({control,motion,highest,tetherError,attachmentError,coast:released.distanceTo(rod.bobber.direction)});
    }
    return checks;
  });
  for(const check of report.swingControls){assert(check.motion>2);assert(check.coast>.05);assert(check.tetherError<1e-7);assert(check.attachmentError<1e-7);}
  // Repeated keyboard/yaw input should stay below the tip; deliberate mouse
  // circles can still pump it overhead instead of imposing an angle limit.
  for(const check of report.swingControls.filter(c=>['strafe','forward','yaw'].includes(c.control)))assert(check.highest<0);
  assert(report.swingControls.find(c=>c.control==='circle').highest>.5);
  report.signedControls=await page.evaluate(async()=>{
    const {FISHING_BOBBER_WALK_SCALE:walk,FISHING_BOBBER_TIP_SCALE:look}=await import('/src/game/rendering/FriendsFishingBobber.ts');
    const r=fishingReview,state={equipped:['review'],casts:[],fish:[]},checks=[];
    const update=()=>{
      r.handCamera.position.copy(r.camera.position);r.handCamera.quaternion.copy(r.camera.quaternion);
      r.fishing.update(state,[r.player],'review',7,r.camera,40000,1000/60,true,r.project,()=>false);
    };
    for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const pitch of [-1,0,1])for(const input of ['strafe','forward','yaw','pitch'])for(const sign of [-1,1]){
      r.setStage('rod');r.camera.rotation.set(pitch,yaw,0,'YXZ');
      const rod=r.fishing.rods.get('review');rod.bobber.reset();update();
      const from=rod.tip.getWorldPosition(new r.THREE.Vector3()),carrier=r.camera.position.clone();
      if(input==='strafe'||input==='forward')r.camera.position.add(new r.THREE.Vector3(input==='strafe'?sign:0,0,input==='forward'?-sign:0).applyAxisAngle(new r.THREE.Vector3(0,1,0),yaw));
      else if(input==='yaw')r.camera.rotation.y+=sign*.025;else r.camera.rotation.x+=sign*.025;
      update();
      const translation=r.camera.position.clone().sub(carrier);
      const motion=rod.tip.getWorldPosition(new r.THREE.Vector3()).sub(from).sub(translation).multiplyScalar(look).addScaledVector(translation,walk);motion.y=0;
      const lag=new r.THREE.Vector3(rod.bobber.direction.x,0,rod.bobber.direction.z).dot(motion);
      checks.push({yaw,pitch,input,sign,lag});
    }
    return checks;
  });
  assert.equal(report.signedControls.length,96);assert(report.signedControls.every(c=>c.lag<0));
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
