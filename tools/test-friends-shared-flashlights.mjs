import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';

const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3000',directory='artifacts/shared-flashlights';
await mkdir(directory,{recursive:true});
const browser=await playwright.chromium.launch({headless:true,args:['--use-angle=metal']});
const report={errors:[]};
try{
  const page=await browser.newPage({viewport:{width:960,height:540}});
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.route('**/@vite/client',route=>route.fulfill({contentType:'application/javascript',body:'export function createHotContext(){return {on(){},off(){},prune(){},send(){},acceptExports(){},accept(){},dispose(){},invalidate(){},data:{}}};export function injectQuery(u){return u};export function updateStyle(){};export function removeStyle(){};'}));
  await page.route('**/__shared_flashlights',r=>r.fulfill({contentType:'text/html',body:'<html><body style="margin:0"></body></html>'}));
  await page.goto(origin+'/__shared_flashlights');
  const source=await(await page.request.get(origin+'/src/game/rendering/FriendsSharedFlashlights.ts')).text();
  const threeUrl=source.match(/from ["']([^"']*\/three[^"']*)["']/)[1];
  report.fixture=await page.evaluate(async({threeUrl})=>{
    const THREE=await import(threeUrl);
    const {FriendsSharedFlashlights}=await import('/src/game/rendering/FriendsSharedFlashlights.ts');
    const {FriendsNightVision}=await import('/src/game/rendering/FriendsNightVision.ts');
    const {FriendsFlashlight}=await import('/src/game/rendering/FriendsFlashlight.ts');
    const {MultiplayerRendererBridge}=await import('/src/game/multiplayer/MultiplayerRendererBridge.ts');
    const {cullInactiveFriendsLights}=await import('/src/game/rendering/FriendsDirectLighting.ts');
    const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(960,540);
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;renderer.info.autoReset=false;
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(108,16/9,2,10000);camera.position.set(0,50,0);camera.updateMatrixWorld(true);
    scene.background=new THREE.Color(0);scene.add(new THREE.AmbientLight(0xffffff,.018));
    const nvg=new FriendsNightVision(scene),local=new FriendsFlashlight(scene,new THREE.Scene(),camera,renderer),shared=new FriendsSharedFlashlights(scene,renderer);
    const pixels=new Uint8Array(64*64*4);
    for(let y=0;y<64;y++)for(let x=0;x<64;x++){const v=80+(x*7+y*11)%100;pixels.set([v,v,v,255],(y*64+x)*4);}
    const texture=new THREE.DataTexture(pixels,64,64);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
    const material=new THREE.MeshStandardMaterial({map:texture,color:0x8f9693,roughness:.8});
    material.onBeforeCompile=s=>{s.fragmentShader=s.fragmentShader.replace('#include <lights_fragment_begin>',cullInactiveFriendsLights(THREE.ShaderChunk.lights_fragment_begin));};
    const wall=new THREE.Mesh(new THREE.PlaneGeometry(6000,4000),material);wall.position.set(0,26,-1000);wall.castShadow=wall.receiveShadow=true;scene.add(wall);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(6000,6000),material);floor.rotation.x=-Math.PI/2;floor.position.z=-1500;floor.castShadow=floor.receiveShadow=true;scene.add(floor);
    const cube=new THREE.Mesh(new THREE.BoxGeometry(90,160,90),material);cube.position.set(-200,80,-650);cube.castShadow=cube.receiveShadow=true;scene.add(cube);
    const slots=scene.children.filter(o=>o.isSpotLight&&o.name.startsWith('shared-flashlight'));
    let shadowCameras=new Set(),offShadows=0;
    for(const mesh of [wall,floor,cube])mesh.onBeforeShadow=(_r,_o,_c,shadowCamera)=>{
      if(slots.some(l=>l.shadow.camera===shadowCamera)){shadowCameras.add(shadowCamera);offShadows++;}
    };
    let players=[],now=0,blocked=false;
    const frame=()=>{
      shadowCameras.clear();const effect=shared.update(players,'self',camera,now,16,()=>blocked,blocked?'wall':'clear');now+=16;
      nvg.setFlashlightGlare(effect);renderer.autoClear=true;nvg.beginFrame(renderer,camera,16);local.update(now/1000,true);
      renderer.render(scene,camera);nvg.endFrame(renderer);return shadowCameras.size;
    };
    const gl=renderer.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');
    const read=()=>{const data=new Uint8Array(960*540*4);gl.readPixels(0,0,960,540,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
    const metrics=()=>{const data=read();let sum=0,center=0,white=0;for(let i=0;i<data.length;i+=4){sum+=data[i+1];if(data[i]>245&&data[i+1]>245&&data[i+2]>245)white++;
      const pixel=i/4,x=pixel%960,y=Math.floor(pixel/960);if(x>=240&&x<720&&y>=135&&y<405)center+=data[i+1];}
      return {mean:sum/(960*540),centerMean:center/(480*270),white:white/(960*540)};};
    for(let i=0;i<6;i++)frame();offShadows=0;for(let i=0;i<10;i++)frame();const off=metrics(),offShadowDraws=offShadows;
    const before={programs:renderer.info.programs.length,textures:renderer.info.memory.textures};
    const sender=(id,x)=>({id,x,y:-300,z:0,angle:-Math.PI/2,lifeState:'alive',friendsFlashlight:{pitch:0,cone:1.35}});
    players=[sender('friend',-180)];const start=performance.now();frame();const firstOnMs=performance.now()-start;
    for(let i=0;i<8;i++)frame();const on=metrics(),after={programs:renderer.info.programs.length,textures:renderer.info.memory.textures};
    // Apply the actual game preference: sun shadows off used to turn the
    // receiver's entire shadow renderer off and silently blank remote beams.
    const sun=new THREE.DirectionalLight(0xffffff,0);sun.castShadow=true;
    const bridge=Object.assign(Object.create(MultiplayerRendererBridge.prototype),{
      worldId:'friends_frontier',nativePixelRatio:1,renderer:{renderer,dirLight:sun,setFriendsAntialiasing:()=>{}},
    });
    bridge.setLocalPreferences({renderScale:1,shadows:false,lookSensitivity:1});
    for(let i=0;i<12;i++)frame();const sunShadowsOff={...metrics(),sunCastShadow:sun.castShadow,shadowRenderer:renderer.shadowMap.enabled};
    const images=[{name:'shared-beam.png',image:renderer.domElement.toDataURL()}];
    // A source looks at the receiver's eyes; both look-at and beam tests must pass.
    players=[{...sender('friend',0),y:-500,angle:Math.PI/2}];for(let i=0;i<45;i++)frame();
    const eyeContact={...metrics(),glare:shared.presentation.glare,flares:shared.presentation.flares.map(v=>v.toArray())};
    images.push({name:'eye-glare.png',image:renderer.domElement.toDataURL()});
    const glarePrograms=renderer.info.programs.length;
    nvg.toggle();for(let i=0;i<60;i++)frame();images.push({name:'nvg-eye-glare.png',image:renderer.domElement.toDataURL()});
    const nvgPrograms=renderer.info.programs.length;
    blocked=true;for(let i=0;i<45;i++)frame();const occluded={glare:shared.presentation.glare,flares:shared.presentation.flares.map(v=>v.z)};
    blocked=false;nvg.toggle();camera.position.y=50;camera.updateMatrixWorld(true);
    players=[{...sender('friend',0),y:-55,angle:Math.PI/2}];
    for(let i=0;i<60;i++)frame();
    const closeContact={...metrics(),glare:shared.presentation.glare,afterimage:shared.presentation.afterimage.z};
    images.push({name:'close-face-dazzle.png',image:renderer.domElement.toDataURL()});
    players=[];for(let i=0;i<15;i++)frame();
    const recovery={...metrics(),glare:shared.presentation.glare,afterimage:shared.presentation.afterimage.z};
    images.push({name:'recovering-vision.png',image:renderer.domElement.toDataURL()});
    for(let i=0;i<100;i++)frame();
    const recovered={glare:shared.presentation.glare,afterimage:shared.presentation.afterimage.z};
    const measurements=[];
    for(const count of [0,1,4]){
      players=Array.from({length:count},(_,i)=>sender(`friend-${i}`,(i-1.5)*180));for(let i=0;i<12;i++)frame();
      const samples=[],queries=[];let maxShadowRefresh=0;
      for(let i=0;i<60;i++){
        const query=timer?gl.createQuery():null;if(query)gl.beginQuery(timer.TIME_ELAPSED_EXT,query);renderer.info.reset();
        const start=performance.now();maxShadowRefresh=Math.max(maxShadowRefresh,frame());samples.push(performance.now()-start);
        if(query){gl.endQuery(timer.TIME_ELAPSED_EXT);queries.push(query);}await new Promise(requestAnimationFrame);
      }
      gl.finish();const valid=timer&&!gl.getParameter(timer.GPU_DISJOINT_EXT);
      const gpu=queries.filter(q=>valid&&gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)).map(q=>gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6).sort((a,b)=>a-b);
      samples.sort((a,b)=>a-b);measurements.push({count,cpuP50:samples[30],cpuP95:samples[57],gpuP50:gpu[Math.floor(gpu.length/2)],maxShadowRefresh});
      for(const q of queries)gl.deleteQuery(q);
    }
    const result={off,on,sunShadowsOff,offShadows:offShadowDraws,before,after,firstOnMs,eyeContact,occluded,closeContact,recovery,recovered,glarePrograms,nvgPrograms,measurements,
      gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unknown',glError:gl.getError(),images};
    shared.dispose();local.dispose();nvg.dispose();renderer.dispose();return result;
  },{threeUrl});
  for(const img of report.fixture.images)await writeFile(directory+'/'+img.name,Buffer.from(img.image.split(',')[1],'base64'));delete report.fixture.images;
  const f=report.fixture;
  assert.deepEqual(f.before,f.after,'shared beam activation must reuse shaders and textures');assert.equal(f.offShadows,0);
  // Meter the illuminated wall, rather than diluting the result with the dark
  // periphery of the wide-FOV camera outside today's narrower flashlight cone.
  assert(f.on.centerMean>f.off.centerMean+25,'a teammate must illuminate surfaces on the receiving screen');
  assert(f.sunShadowsOff.centerMean>f.off.centerMean+25,'remote flashlights must illuminate surfaces with sun shadows off');
  assert.equal(f.sunShadowsOff.sunCastShadow,false);assert.equal(f.sunShadowsOff.shadowRenderer,true);
  assert(f.eyeContact.glare>.4&&f.eyeContact.white<.03,'eye glare must be noticeable and bounded');
  assert(f.closeContact.glare>.8&&f.closeContact.mean>f.eyeContact.mean+20&&f.closeContact.white<.1,'close face hits must visibly dazzle without a full whiteout');
  assert(f.recovery.glare<f.closeContact.glare*.2&&f.recovery.afterimage>.05,'looking away must clear glare and briefly retain an afterimage');
  assert.equal(f.recovered.glare,0);assert.equal(f.recovered.afterimage,0);
  assert(f.occluded.glare<.01&&f.occluded.flares.every(v=>v===0),'walls must suppress flare and eye glare');
  assert.equal(f.glarePrograms,f.before.programs);assert.equal(f.nvgPrograms,f.before.programs);
  assert(f.measurements.every(m=>m.maxShadowRefresh<=1));assert.equal(f.glError,0);
  // Streamed production cave: all real materials, sun/torch/local/IR samplers.
  await page.route('**/tools/frontier-review.ts*',async route=>{
    const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
      const {FriendsSharedFlashlights}=await import('/src/game/rendering/FriendsSharedFlashlights.ts');
      const shared=new FriendsSharedFlashlights(scene,renderer);let senders=[],sharedNow=0;
      scene.onBeforeRender=()=>{const effect=shared.update(senders,'self',camera,sharedNow,16,()=>false);sharedNow+=16;nightVision.setFlashlightGlare(effect);};
      window.__sharedWorld={scene,world,renderer,camera,nightVision,shared,setSenders:p=>senders=p};`});
  });
  await page.goto(origin+'/tools/frontier-review.html?scene=treasury');
  await page.waitForFunction(()=>{const w=window.__sharedWorld?.world;return w&&w.desired.size>0&&[...w.desired].every(k=>w.chunks.has(k)&&!w.dirty.has(k));},undefined,{timeout:90000});
  report.cave=await page.evaluate(()=>{
    const r=window.__sharedWorld;r.camera.fov=108;r.camera.updateProjectionMatrix();
    const frame=()=>{r.nightVision.beginFrame(r.renderer,r.camera,16);r.renderer.render(r.scene,r.camera);r.nightVision.endFrame(r.renderer);};
    for(let i=0;i<3;i++)frame();const before={programs:r.renderer.info.programs.length,textures:r.renderer.info.memory.textures};
    const direction=r.camera.getWorldDirection(r.camera.position.clone());
    r.setSenders(Array.from({length:4},(_,i)=>({id:`friend-${i}`,x:r.camera.position.x+direction.x*80+i*8,y:r.camera.position.z+direction.z*80,z:r.camera.position.y-26,
      angle:Math.atan2(direction.z,direction.x),lifeState:'alive',friendsFlashlight:{pitch:Math.asin(direction.y),cone:1.35}})));
    const start=performance.now();for(let i=0;i<4;i++)frame();const firstFourMs=performance.now()-start;
    for(let i=0;i<20;i++)frame();const image=r.renderer.domElement.toDataURL();
    r.setSenders([]);for(let i=0;i<100;i++)frame();const clearImage=r.renderer.domElement.toDataURL();
    r.setSenders([{id:'face-hit',x:r.camera.position.x+direction.x*160,y:r.camera.position.z+direction.z*160,
      z:r.camera.position.y+direction.y*160-50,angle:Math.atan2(-direction.z,-direction.x),lifeState:'alive',
      friendsFlashlight:{pitch:-Math.asin(direction.y),cone:1.35}}]);
    for(let i=0;i<60;i++)frame();const faceImage=r.renderer.domElement.toDataURL(),faceGlare=r.shared.presentation.glare;
    r.setSenders([]);for(let i=0;i<15;i++)frame();const recoveryImage=r.renderer.domElement.toDataURL();
    return{before,after:{programs:r.renderer.info.programs.length,textures:r.renderer.info.memory.textures},firstFourMs,faceGlare,
      glError:r.renderer.getContext().getError(),image,clearImage,faceImage,recoveryImage};
  });
  await writeFile(directory+'/cave-shared-beams.png',Buffer.from(report.cave.image.split(',')[1],'base64'));delete report.cave.image;
  for(const [key,name] of [['clearImage','cave-clear.png'],['faceImage','cave-face-dazzle.png'],['recoveryImage','cave-recovery.png']]){
    await writeFile(directory+'/'+name,Buffer.from(report.cave[key].split(',')[1],'base64'));delete report.cave[key];
  }
  assert(report.cave.faceGlare>.8,'real cave materials must composite a close face hit');
  assert.deepEqual(report.cave.before,report.cave.after);assert.equal(report.cave.glError,0);assert.deepEqual(report.errors,[]);
  console.log(JSON.stringify(report,null,2));
}catch(error){report.failure=String(error);throw error;}
finally{await writeFile(directory+'/render-checks.json',JSON.stringify(report,null,2));await browser.close();}
