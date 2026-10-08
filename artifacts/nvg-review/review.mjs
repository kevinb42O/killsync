import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const report={errors:[]},origin='http://localhost:3000';
try{
  const page=await browser.newPage({viewport:{width:960,height:540}});
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.route('**/__nvg_review',r=>r.fulfill({contentType:'text/html',body:'<html><body style="margin:0"></body></html>'}));
  await page.goto(origin+'/__nvg_review');
  const source=await(await page.request.get(origin+'/src/game/rendering/FriendsNightVision.ts')).text();
  const threeUrl=source.match(/from ["']([^"']*\/three[^"']*)["']/)[1];
  report.controlled=await page.evaluate(async threeUrl=>{
    const THREE=await import(threeUrl),{FriendsNightVision}=await import('/src/game/rendering/FriendsNightVision.ts');
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(108,16/9,2,10000);
    const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(960,540);
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;
    scene.background=new THREE.Color(0);scene.add(new THREE.AmbientLight(0xffffff,.01));
    const goggles=new FriendsNightVision(scene),geometry=new THREE.PlaneGeometry(2,2);
    const wall=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x909b99,roughness:.68}));
    wall.position.z=-600;wall.scale.set(6000,4000,1);wall.receiveShadow=true;scene.add(wall);
    const pixels=new Uint8Array(64*64*4).fill(180),texture=new THREE.DataTexture(pixels,64,64);texture.needsUpdate=true;
    for(let i=0;i<6;i++){
      const mesh=new THREE.Mesh(geometry.clone(),new THREE.MeshStandardMaterial({color:0x909b99,flatShading:Boolean(i&4),vertexColors:Boolean(i&1),map:i&2?texture:null}));
      if(i&1)mesh.geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Array(mesh.geometry.attributes.position.count*3).fill(.7),3));
      mesh.position.set((i-2.5)*70,-200,-500);mesh.scale.set(25,25,1);mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);
    }
    const frame=()=>{const active=goggles.beginFrame(renderer,camera,16);renderer.render(scene,camera);if(active)goggles.endFrame(renderer);};
    frame();frame();const programsOff=renderer.info.programs.length;
    // Isolate the HDR transition independently from adding the NVG lights.
    const hdr=new THREE.WebGLRenderTarget(960,540,{type:THREE.HalfFloatType,samples:2});
    renderer.setRenderTarget(hdr);renderer.render(scene,camera);const programsHDR=renderer.info.programs.length;
    renderer.setRenderTarget(null);renderer.render(scene,camera);
    const beforeToggle=renderer.info.programs.length,start=performance.now();goggles.toggle();frame();
    const toggleMs=performance.now()-start,afterToggle=renderer.info.programs.length;
    for(let i=0;i<60;i++)frame();
    const gl=renderer.getContext(),data=new Uint8Array(960*540*4);gl.readPixels(0,0,960,540,gl.RGBA,gl.UNSIGNED_BYTE,data);
    const sample=(x,y)=>Array.from(data.slice((y*960+x)*4,(y*960+x)*4+3));
    const view={center:sample(480,270),edge:sample(96,270),corner:sample(48,27)};
    const beam=scene.getObjectByName('night-vision-infrared'),weights=[];
    for(const fov of [108,115]){
      const edge=Math.atan(Math.tan(THREE.MathUtils.degToRad(fov/2))*16/9);
      weights.push({fov,edgeDegrees:THREE.MathUtils.radToDeg(edge),edgeBeamWeight:THREE.MathUtils.smoothstep(Math.cos(edge),Math.cos(beam.angle),Math.cos(beam.angle*(1-beam.penumbra)))});
    }
    // Parent-space regression: aim is world-space, origin remains local-space.
    const rig=new THREE.Group();rig.position.set(1000,200,500);rig.rotation.y=.4;scene.add(rig);rig.add(camera);camera.position.set(10,20,30);frame();
    const parentOffset=beam.position.distanceTo(camera.getWorldPosition(new THREE.Vector3()));
    const buffer={width:goggles.buffer.width,height:goggles.buffer.height,samples:goggles.buffer.samples};
    return{programsOff,programsHDR,beforeToggle,afterToggle,toggleMs,weights,parentOffset,view,buffer,glError:gl.getError()};
  },threeUrl);
  await page.route('**/tools/frontier-review.ts*',async route=>{
    const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\nwindow.__nvgReview={scene,world,renderer,camera,controls,nightVision};'});
  });
  await page.goto(origin+'/tools/frontier-review.html?scene=treasury');
  await page.waitForFunction(()=>window.__nvgReview?.world.terrainStats.volumeActive>0,undefined,{timeout:60000});
  await page.evaluate(()=>{const r=window.__nvgReview;r.camera.fov=108;r.camera.updateProjectionMatrix();});
  await page.waitForTimeout(1200);
  report.cave=await page.evaluate(()=>{
    const {nightVision,renderer,scene,camera}=window.__nvgReview;
    const before=renderer.info.programs.length,start=performance.now();nightVision.toggle();
    nightVision.beginFrame(renderer,camera,16);renderer.render(scene,camera);nightVision.endFrame(renderer);
    return{before,after:renderer.info.programs.length,firstActivationMs:performance.now()-start};
  });
  await page.waitForFunction(()=>{
    const w=window.__nvgReview?.world;return w&&w.desired.size>0&&[...w.desired].every(k=>w.chunks.has(k)&&!w.dirty.has(k));
  },undefined,{timeout:60000});
  // Capture immediately after rendering, so unrelated hot reloads cannot
  // reset equipment between the test mutation and a later screenshot.
  const captures=await page.evaluate(()=>{
    const {scene,world,renderer,camera,nightVision}=window.__nvgReview;
    camera.fov=108;camera.updateProjectionMatrix();
    if(!nightVision.equipped)nightVision.toggle();
    const frame=()=>{renderer.autoClear=true;nightVision.beginFrame(renderer,camera,100);renderer.render(scene,camera);nightVision.endFrame(renderer);};
    for(let i=0;i<10;i++)frame();
    const result={normal:renderer.domElement.toDataURL()};
    const infrared=scene.getObjectByName('night-vision-infrared');infrared.shadow.intensity=0;frame();result.withoutShadow=renderer.domElement.toDataURL();infrared.shadow.intensity=1;
    if(!world.flashlightEquipped)world.toggleFlashlight();world.flashlight.update(performance.now()/1000,true);world.syncFlashlightWithCamera();frame();result.flashlight=renderer.domElement.toDataURL();
    return result;
  });
  for(const [key,name]of [['normal','cave-nvg'],['withoutShadow','cave-nvg-without-shadow'],['flashlight','cave-nvg-flashlight']])await writeFile(`artifacts/nvg-review/${name}.png`,Buffer.from(captures[key].split(',')[1],'base64'));
  report.cave.state=await page.evaluate(()=>({stats:document.getElementById('stats').textContent,glError:window.__nvgReview.renderer.getContext().getError()}));
  console.log(JSON.stringify(report,null,2));
}finally{await writeFile('artifacts/nvg-review/report.json',JSON.stringify(report,null,2));await browser.close();}
