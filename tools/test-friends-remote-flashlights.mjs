import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3000',directory='artifacts/remote-flashlights';
await mkdir(directory,{recursive:true});
const browser=await playwright.chromium.launch({headless:true,args:['--use-angle=metal']});
const report={errors:[]};
try{
  const page=await browser.newPage({viewport:{width:1200,height:800}});
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.route('**/__remote_flashlights',r=>r.fulfill({contentType:'text/html',body:'<html><body style="margin:0"></body></html>'}));
  await page.goto(origin+'/__remote_flashlights');
  const source=await(await page.request.get(origin+'/src/game/rendering/FriendsRemoteFlashlightVisuals.ts')).text();
  const threeUrl=source.match(/from ["']([^"']*\/three[^"']*)["']/)[1];
  const characterUrl=source.match(/from ["']([^"']*FriendsCharacterVisuals[^"']*)["']/)[1];
  report.fixture=await page.evaluate(async({threeUrl,characterUrl})=>{
    const THREE=await import(threeUrl);
    const {createFriendsCharacterRig,placeFriendsCharacter,updateFriendsCharacter,friendsCharacterHandPoint}=await import(characterUrl);
    const {FriendsRemoteFlashlightVisuals}=await import('/src/game/rendering/FriendsRemoteFlashlightVisuals.ts');
    const {FriendsSharedFlashlights}=await import('/src/game/rendering/FriendsSharedFlashlights.ts');
    const {FriendsNightVision}=await import('/src/game/rendering/FriendsNightVision.ts');
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1200,800);document.body.append(renderer.domElement);
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;
    const scene=new THREE.Scene();scene.background=new THREE.Color(0x192128);
    scene.add(new THREE.HemisphereLight(0xe5f4ff,0x314342,2));
    const key=new THREE.DirectionalLight(0xffffff,2);key.position.set(-80,160,100);scene.add(key);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(1000,1000),new THREE.MeshStandardMaterial({color:0x3a4747,roughness:1}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
    const player={id:'friend',label:'Friend',color:'#e7c64d',skinId:'default',x:0,y:0,z:0,angle:Math.PI/2,lifeState:'alive',friendsFlashlight:{pitch:0,yaw:Math.PI/2,cone:1}};
    const rig=createFriendsCharacterRig(player.color,player.label);scene.add(rig.root);
    const deadline=performance.now()+15000;
    while(!rig.avatar.getObjectByName('friends-big-walk-character')){if(performance.now()>deadline)throw new Error('Character failed to load');await new Promise(r=>setTimeout(r,20));}
    const props=new FriendsRemoteFlashlightVisuals(),shared=new FriendsSharedFlashlights(scene,renderer),vision=new FriendsNightVision(scene);
    const camera=new THREE.PerspectiveCamera(55,1.5,2,10000);camera.position.set(0,50,150);camera.lookAt(0,28,0);camera.updateMatrixWorld(true);
    let now=0;
    const frame=(effects=true)=>{
      now+=16;placeFriendsCharacter(rig,player);updateFriendsCharacter(rig,player,now);rig.nameplate.visible=false;props.update(player,rig);
      const effect=shared.update([player],'self',camera,now,16,()=>false,'',true,(id,out)=>props.emission(id,out));
      vision.setFlashlightGlare(effects?effect:{glare:0,flares:[],afterimage:new THREE.Vector4()});
      vision.beginFrame(renderer,camera,16);renderer.render(scene,camera);vision.endFrame(renderer);
    };
    for(let i=0;i<70;i++)frame(false);
    const images=[{name:'handheld-front.png',image:renderer.domElement.toDataURL()}];
    camera.position.set(120,48,45);camera.lookAt(0,28,0);camera.updateMatrixWorld(true);frame(false);
    images.push({name:'handheld-side.png',image:renderer.domElement.toDataURL()});
    const checks=[];
    for(const angle of [-1.2,0,1.5])for(const yawOffset of [-.6,0,.6])for(const pitch of [-.7,0,.7]){
      player.angle=angle;const yaw=angle+yawOffset;player.friendsFlashlight={pitch,yaw,cone:1};
      const forward=new THREE.Vector3(Math.cos(yaw)*Math.cos(pitch),Math.sin(pitch),Math.sin(yaw)*Math.cos(pitch));
      camera.position.set(player.x,50,player.y).addScaledVector(forward,150);camera.lookAt(player.x,50,player.y);camera.updateMatrixWorld(true);
      for(let i=0;i<25;i++)frame(false);
      const torch=rig.root.getObjectByName('friends-remote-flashlight'),hand=new THREE.Vector3();friendsCharacterHandPoint(rig,hand,false,'left');rig.root.localToWorld(hand);
      const lens=new THREE.Vector3();props.emission(player.id,lens);const ndc=lens.clone().project(camera),flare=shared.presentation.flares.find(f=>f.z>0);
      const beam=shared['slots'].find(s=>s.id===player.id).light;
      const meshForward=new THREE.Vector3(0,0,-1).applyQuaternion(torch.getWorldQuaternion(new THREE.Quaternion()));
      checks.push({angle,yawOffset,pitch,handGap:torch.getWorldPosition(new THREE.Vector3()).distanceTo(hand),
        beamGap:beam.position.distanceTo(lens),aimDot:meshForward.dot(forward),
        flareGap:flare?Math.hypot(flare.x-(ndc.x*.5+.5),flare.y-(ndc.y*.5+.5)):Infinity});
    }
    player.angle=Math.PI/2;player.friendsFlashlight={pitch:0,yaw:Math.PI/2,cone:1};
    camera.position.set(0,50,150);camera.lookAt(0,42,0);camera.updateMatrixWorld(true);
    for(let i=0;i<60;i++)frame();images.push({name:'lens-glare.png',image:renderer.domElement.toDataURL()});
    const glare=shared.presentation.glare;
    const before={programs:renderer.info.programs.length,textures:renderer.info.memory.textures};
    player.friendsFlashlight=undefined;for(let i=0;i<100;i++)frame();
    const off={emission:props.emission(player.id,new THREE.Vector3()),glare:shared.presentation.glare,afterimage:shared.presentation.afterimage.z};
    player.friendsFlashlight={pitch:0,yaw:Math.PI/2,cone:1};frame();
    const after={programs:renderer.info.programs.length,textures:renderer.info.memory.textures};
    const result={checks,glare,off,before,after,glError:renderer.getContext().getError(),images};
    props.dispose();shared.dispose();vision.dispose();renderer.dispose();return result;
  },{threeUrl,characterUrl});
  for(const img of report.fixture.images)await writeFile(directory+'/'+img.name,Buffer.from(img.image.split(',')[1],'base64'));delete report.fixture.images;
  assert(report.fixture.checks.every(c=>c.handGap<1e-6&&c.beamGap<1e-6&&c.flareGap<1e-6&&c.aimDot>.99999),'palm, physical lens, beam and glare must share one transform');
  assert(report.fixture.glare>.8);assert.deepEqual(report.fixture.off,{emission:false,glare:0,afterimage:0});
  assert.deepEqual(report.fixture.before,report.fixture.after,'toggling must reuse GPU resources');
  assert.equal(report.fixture.glError,0);
  // Exercise the real arena's character update and HDR composite wiring too.
  await page.addInitScript(()=>{
    localStorage.setItem('sunline.preferences.v1',JSON.stringify({renderScale:1,shadows:false}));
    localStorage.setItem('killsync.friends.menu.pause','true');
  });
  await page.goto(origin+'/?mode=friends',{waitUntil:'domcontentloaded'});
  await page.getByLabel('Your name',{exact:true}).fill('Flashlight review');
  await page.getByRole('button',{name:'Play on my own',exact:true}).click({noWaitAfter:true});
  await page.locator('.coop-arena').waitFor({state:'attached',timeout:120000});
  await page.waitForFunction(()=>!document.body.innerText.includes('OPERATOR LINK / SUNLINE COMMONS'),undefined,{timeout:120000});
  await page.evaluate(async()=>{
    const {quantizePitch}=await import('/src/game/multiplayer/CoopSimulation.ts');
    const element=document.querySelector('.coop-arena'),key=Object.keys(element).find(k=>k.startsWith('__reactFiber'));
    let fiber=element[key],simulation,bridge;
    while(fiber){let hook=fiber.memoizedState;while(hook){const value=hook.memoizedState?.current;
      if(value?.createSnapshot&&value?.setInput)simulation=value;
      if(value?.getFriendsTerrain&&value?.setFriendsTool)bridge=value;hook=hook.next;}fiber=fiber.return;}
    if(!simulation||!bridge)throw new Error('Arena refs unavailable');
    const host=[...simulation.players.values()][0],direction=bridge.renderer.camera.getWorldDirection(bridge.renderer.camera.position.clone());
    simulation.addPlayer({id:'flashlight-friend',label:'Flashlight friend',color:'#fbbf24'});
    const guest=simulation.players.get('flashlight-friend');
    Object.assign(guest,{x:host.x+direction.x*120,y:host.y+direction.z*120,z:host.z,verticalVelocity:0});
    const setInput=simulation.setInput.bind(simulation);
    simulation.setInput=(id,frame)=>{
      setInput(id,frame);if(id!==host.id)return;
      const yaw=Math.atan2(host.y-guest.y,host.x-guest.x),pitch=Math.atan2(host.z-guest.z,Math.hypot(host.x-guest.x,host.y-guest.y));
      setInput(guest.id,{...frame,movement:0,firing:false,aiming:false,sprinting:false,jumpPressed:false,jetHeld:false,dashPressed:false,
        friendsTool:1,friendsFlashlight:true,friendsFlashlightCone:255,aimPitch:quantizePitch(pitch),aimAngle:Math.round((yaw+Math.PI*2)%(Math.PI*2)/(Math.PI*2)*65535)});
    };
    window.liveFlashlightReview={simulation,bridge,guest};
  });
  await page.waitForFunction(()=>{
    const r=window.liveFlashlightReview,rig=r.bridge.remotePlayers.get(r.guest.id);
    return rig?.getObjectByName?.('friends-remote-flashlight')||rig?.root.getObjectByName('friends-remote-flashlight')?.visible;
  },undefined,{timeout:30000});
  report.production=await page.evaluate(()=>{
    const {bridge,guest}=window.liveFlashlightReview,rig=bridge.remotePlayers.get(guest.id),camera=bridge.renderer.camera;
    const lens=camera.position.clone();bridge.remoteFlashlights.emission(guest.id,lens);
    const light=bridge.sharedFlashlights.slots.find(s=>s.id===guest.id).light,ndc=lens.clone().project(camera);
    const flare=bridge.sharedFlashlights.presentation.flares.find(f=>f.z>0);
    return {propVisible:rig.root.getObjectByName('friends-remote-flashlight').visible,beamGap:light.position.distanceTo(lens),
      flareGap:flare?Math.hypot(flare.x-(ndc.x*.5+.5),flare.y-(ndc.y*.5+.5)):Infinity,
      glError:bridge.renderer.renderer.getContext().getError()};
  });
  await page.screenshot({path:directory+'/live-island.png'});
  assert(report.production.propVisible&&report.production.beamGap<1e-6&&report.production.flareGap<1e-6);
  assert.equal(report.production.glError,0);assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}catch(error){report.failure=String(error);throw error;}
finally{await writeFile(directory+'/checks.json',JSON.stringify(report,null,2));await browser.close();}
