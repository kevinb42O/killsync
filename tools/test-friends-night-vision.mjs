import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {friendsBaselineModules} from './friends-baseline-modules.mjs';

const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3000',directory='artifacts/nvg-polish';
await mkdir(directory,{recursive:true});
const baseline=process.env.FRIENDS_NVG_BASELINE?await friendsBaselineModules(null,['FriendsNightVision'],process.env.FRIENDS_NVG_BASELINE):undefined;
const browser=await playwright.chromium.launch({headless:true,args:['--use-angle=metal']});
const report={errors:[],fixtures:[],worlds:[]};
let page;
try{
  page=await browser.newPage({viewport:{width:960,height:540}});
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.route('**/__nvg_test',r=>r.fulfill({contentType:'text/html',body:'<html><body style="margin:0"></body></html>'}));
  await page.goto(origin+'/__nvg_test');
  const source=await(await page.request.get(origin+'/src/game/rendering/FriendsNightVision.ts')).text();
  const threeUrl=source.match(/from ["']([^"']*\/three[^"']*)["']/)[1];
  const cases=[...(baseline?[['before',baseline.urls.FriendsNightVision]]:[]),['after','/src/game/rendering/FriendsNightVision.ts']];
  for(const [name,url]of cases){
    const result=await page.evaluate(async({name,url,threeUrl})=>{
      const THREE=await import(threeUrl),{FriendsNightVision}=await import(url);
      const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(960,540);
      renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;renderer.info.autoReset=false;
      renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
      const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(108,16/9,2,10000);
      scene.background=new THREE.Color(0);const ambient=new THREE.AmbientLight(0xffffff,.015);scene.add(ambient);
      const nvg=new FriendsNightVision(scene);
      const pixels=new Uint8Array(64*64*4);
      for(let y=0;y<64;y++)for(let x=0;x<64;x++){
        const v=80+(x*7+y*11)%100;pixels.set([v,v,v,255],(y*64+x)*4);
      }
      const texture=new THREE.DataTexture(pixels,64,64);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
      const geometry=new THREE.PlaneGeometry(2,2),material=new THREE.MeshStandardMaterial({color:0x909b99,map:texture,roughness:.68});
      const wall=new THREE.Mesh(geometry,material);wall.position.z=-600;wall.scale.set(6000,4000,1);wall.receiveShadow=true;scene.add(wall);
      const variants=[];
      for(let i=0;i<6;i++){
        const m=new THREE.MeshStandardMaterial({color:0x909b99,flatShading:Boolean(i&4),vertexColors:Boolean(i&1),map:i&2?texture:null});
        const mesh=new THREE.Mesh(geometry.clone(),m);
        if(i&1)mesh.geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Array(mesh.geometry.attributes.position.count*3).fill(.7),3));
        mesh.position.set((i-2.5)*70,-200,-500);mesh.scale.set(25,25,1);mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);variants.push(mesh);
      }
      let shadowDraws=0;variants[0].onBeforeShadow=()=>shadowDraws++;
      const frame=(dt=16)=>{
        renderer.autoClear=true;const active=nvg.beginFrame(renderer,camera,dt);renderer.render(scene,camera);if(active)nvg.endFrame(renderer);
      };
      const gl=renderer.getContext(),gpuExtension=gl.getExtension('WEBGL_debug_renderer_info');
      const gpu=gpuExtension?gl.getParameter(gpuExtension.UNMASKED_RENDERER_WEBGL):'unknown';
      const glStages=[];const checkGL=stage=>glStages.push({stage,error:gl.getError()});
      const read=()=>{const data=new Uint8Array(960*540*4);gl.readPixels(0,0,960,540,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
      const stats=data=>{
        const sample=(x,y)=>data[(y*960+x)*4+1];
        let sum=0,white=0,count=0;
        for(let y=27;y<513;y++)for(let x=48;x<912;x++){const v=sample(x,y);sum+=v;count++;if(v>245)white++;}
        return{mean:sum/count,whiteFraction:white/count,center:sample(480,270),edge:sample(96,270),corner:sample(48,27)};
      };
      // Compare natural rendering through the new compositor to a direct draw.
      frame();frame();ambient.intensity=1.2;
      renderer.render(scene,camera);const direct=read();checkGL('direct-reference');frame();const off=read();checkGL('off-warmup');ambient.intensity=.015;
      let difference=0;for(let i=0;i<direct.length;i++)difference+=Math.abs(direct[i]-off[i]);
      const naturalMeanDifference=difference/direct.length;
      shadowDraws=0;renderer.shadowMap.needsUpdate=true;frame();const offShadowDraws=shadowDraws;
      const programsBefore=renderer.info.programs.length,texturesBefore=renderer.info.memory.textures;
      const start=performance.now();nvg.toggle();frame();
      const firstToggleMs=performance.now()-start,programsOn=renderer.info.programs.length,texturesOn=renderer.info.memory.textures;
      checkGL('first-toggle');
      const toggleSamples=[];
      for(let i=0;i<12;i++){const t=performance.now();nvg.toggle();frame();toggleSamples.push({ms:performance.now()-t,programs:renderer.info.programs.length,textures:renderer.info.memory.textures});await new Promise(requestAnimationFrame);}
      for(const mesh of variants)mesh.visible=false;
      const views=[],images=[];
      for(const fov of [108,115])for(const distance of [100,600,1600]){
        camera.fov=fov;camera.updateProjectionMatrix();wall.position.z=-distance;wall.scale.setScalar(distance*10);
        for(let i=0;i<60;i++)frame();views.push({fov,distance,...stats(read())});
        if(fov===108&&distance===600)images.push({name:`${name}-coverage`,image:renderer.domElement.toDataURL()});
      }
      const exposure=[];
      checkGL('coverage');
      if(name==='after'){
        const gain=()=>{
          const half=new Uint16Array(4);renderer.readRenderTargetPixels(nvg.exposureTargets[nvg.exposureIndex],0,0,1,1,half);
          checkGL('exposure-read');
          return THREE.DataUtils.fromHalfFloat(half[0]);
        };
        wall.position.z=-600;wall.scale.setScalar(6000);for(let i=0;i<90;i++)frame();exposure.push({phase:'dark',gain:gain()});
        material.emissive.setRGB(20,20,20);
        for(let i=0;i<60;i++){frame();if([0,10,59].includes(i))exposure.push({phase:`bright-${i}`,gain:gain()});}
        const brightStats=stats(read());
        material.emissive.setRGB(0,0,0);
        for(let i=0;i<120;i++){frame();if([0,30,119].includes(i))exposure.push({phase:`dark-${i}`,gain:gain()});}
        exposure.push({phase:'bright-image',...brightStats});
      }
      // Actual GPU time includes the HDR resolve, shadow and final passes.
      const timer=gl.getExtension('EXT_disjoint_timer_query_webgl2'),performanceSamples=[];
      if(timer)for(const active of [false,true]){
        if(nvg.equipped!==active)nvg.toggle();for(let i=0;i<60;i++)frame();
        const samples=[];
        for(let i=0;i<24;i++){
          const query=gl.createQuery();renderer.info.reset();gl.beginQuery(timer.TIME_ELAPSED_EXT,query);
          const start=performance.now();frame();const ms=performance.now()-start;gl.endQuery(timer.TIME_ELAPSED_EXT);
          samples.push({query,ms,draws:renderer.info.render.calls});await new Promise(requestAnimationFrame);
        }
        gl.finish();const valid=!gl.getParameter(timer.GPU_DISJOINT_EXT);
        const gpu=samples.filter(s=>valid&&gl.getQueryParameter(s.query,gl.QUERY_RESULT_AVAILABLE)).map(s=>gl.getQueryParameter(s.query,gl.QUERY_RESULT)/1e6).sort((a,b)=>a-b);
        const cpu=samples.map(s=>s.ms).sort((a,b)=>a-b);
        performanceSamples.push({active,cpuP50:cpu[12],gpuP50:gpu[Math.floor(gpu.length/2)],draws:samples[0].draws});
        for(const s of samples)gl.deleteQuery(s.query);
      }
      const sizes=[];
      if(name==='after')for(const [width,height]of [[1120,480],[480,800]]){
        renderer.setSize(width,height);camera.aspect=width/height;camera.fov=115;camera.updateProjectionMatrix();wall.position.z=-600;wall.scale.setScalar(6000);
        if(!nvg.equipped)nvg.toggle();for(let i=0;i<60;i++)frame();
        const data=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,data);
        const corner=data[(Math.floor(height*.1)*width+Math.floor(width*.1))*4+1];
        sizes.push({width,height,corner,buffer:[nvg.buffer.width,nvg.buffer.height],programs:renderer.info.programs.length,textures:renderer.info.memory.textures});
        images.push({name:`after-${width>height?'ultrawide':'portrait'}`,image:renderer.domElement.toDataURL()});
      }
      const glError=gl.getError();nvg.dispose();nvg.dispose();
      scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});texture.dispose();renderer.dispose();
      return{name,gpu,naturalMeanDifference,offShadowDraws,programsBefore,programsOn,texturesBefore,texturesOn,firstToggleMs,toggleSamples,views,exposure,performanceSamples,sizes,images,glError,glStages};
    },{name,url,threeUrl});
    for(const capture of result.images)await writeFile(`${directory}/${capture.name}.png`,Buffer.from(capture.image.split(',')[1],'base64'));
    delete result.images;report.fixtures.push(result);
  }
  const after=report.fixtures.find(f=>f.name==='after');
  assert.deepEqual(report.errors,[],'all shaders must compile');
  assert.equal(after.programsOn,after.programsBefore,'NVG activation must reuse shaders');
  assert.equal(after.texturesOn,after.texturesBefore,'NVG activation must reuse GPU textures');
  assert(after.toggleSamples.every(s=>s.programs===after.programsBefore&&s.textures===after.texturesBefore));
  assert.equal(after.offShadowDraws,0);assert(after.naturalMeanDifference<2,'unequipped natural colors must be preserved');
  for(const view of after.views){assert(view.whiteFraction<.01);assert(view.corner>35,'peripheral terrain must remain visible');assert(view.edge>50);}
  const gain=phase=>after.exposure.find(e=>e.phase===phase).gain;
  assert(gain('bright-59')<gain('bright-0')&&gain('bright-0')<gain('dark'),'exposure must adapt down to glare');
  assert(gain('dark-119')>gain('dark-30')&&gain('dark-30')>gain('dark-0'),'exposure must recover smoothly in darkness');
  assert(after.exposure.filter(e=>e.gain!==undefined).every(e=>e.gain>=.079&&e.gain<=8));
  assert(after.sizes.every(s=>s.corner>50&&s.programs===after.programsOn&&s.textures===after.texturesOn));
  assert(report.fixtures.every(f=>f.glError===0&&f.glStages.every(s=>s.error===0)));

  // Real streamed cave, followed by the existing arrival effect. Hooks are
  // confined to this disposable review fixture and never touch player saves.
  await page.route('**/tools/frontier-review.ts*',async route=>{
    const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\nwindow.__nvgTest={scene,world,renderer,camera,controls,nightVision};'});
  });
  await page.goto(origin+'/tools/frontier-review.html?scene=treasury');
  await page.waitForFunction(()=>{
    const w=window.__nvgTest?.world;return w&&w.desired.size>0&&[...w.desired].every(k=>w.chunks.has(k)&&!w.dirty.has(k));
  },undefined,{timeout:90000});
  const world=await page.evaluate(async()=>{
    const r=window.__nvgTest;r.camera.fov=108;r.camera.updateProjectionMatrix();
    const frame=()=>{r.renderer.autoClear=true;r.nightVision.beginFrame(r.renderer,r.camera,16);r.renderer.render(r.scene,r.camera);r.nightVision.endFrame(r.renderer);};
    for(let i=0;i<3;i++)frame();
    const before=r.renderer.info.programs.length,textures=r.renderer.info.memory.textures,start=performance.now();
    r.nightVision.toggle();frame();const totalMs=performance.now()-start;
    const after=r.renderer.info.programs.length,texturesAfter=r.renderer.info.memory.textures;
    for(let i=0;i<60;i++)frame();const image=r.renderer.domElement.toDataURL();
    const {FriendsWorldArrival}=await import('/src/game/rendering/FriendsWorldArrival.ts');
    const arrival=new FriendsWorldArrival();arrival.start(r.camera.position.x,r.camera.position.z,r.camera.position.y);arrival.sequence.reveal=.5;
    r.nightVision.beginFrame(r.renderer,r.camera,16);const target=r.renderer.getRenderTarget();arrival.render(r.renderer,r.scene,r.camera);
    const arrivalRestored=r.renderer.getRenderTarget()===target;r.nightVision.endFrame(r.renderer);arrival.dispose();
    return{before,after,textures,texturesAfter,totalMs,arrivalRestored,glError:r.renderer.getContext().getError(),image};
  });
  await writeFile(directory+'/cave-after.png',Buffer.from(world.image.split(',')[1],'base64'));delete world.image;report.worlds.push(world);
  assert.equal(world.before,world.after,'real cave activation must reuse shaders');assert.equal(world.textures,world.texturesAfter);
  assert(world.arrivalRestored);assert.equal(world.glError,0);assert.deepEqual(report.errors,[]);
  if(process.env.FRIENDS_NVG_PROBE==='1'){
    const probes=await page.evaluate(()=>{
      const r=window.__nvgTest,frame=()=>{r.renderer.autoClear=true;r.nightVision.beginFrame(r.renderer,r.camera,16);r.renderer.render(r.scene,r.camera);r.nightVision.endFrame(r.renderer);};
      const lights=[];r.scene.traverse(o=>{if(o.isLight&&o.castShadow){lights.push([o,o.shadow.intensity]);o.shadow.intensity=0;}});frame();
      const noShadows=r.renderer.domElement.toDataURL();for(const [light,intensity]of lights)light.shadow.intensity=intensity;
      const normals=[];for(const m of r.world.materials)if(m.normalMap){normals.push([m,m.normalScale.clone()]);m.normalScale.setScalar(0);}
      frame();const noNormals=r.renderer.domElement.toDataURL();for(const [m,scale]of normals)m.normalScale.copy(scale);
      for(const m of r.world.materials)if(m.userData.frontierCaveLighting&&m.normalMap)m.normalScale.setScalar(.14);
      frame();const softerNormals=r.renderer.domElement.toDataURL();
      for(const [m,scale]of normals)m.normalScale.copy(scale);
      return{noShadows,noNormals,softerNormals};
    });
    for(const [name,value]of Object.entries(probes))await writeFile(`${directory}/probe-${name}.png`,Buffer.from(value.split(',')[1],'base64'));
  }
  console.log(JSON.stringify(report,null,2));
}catch(error){
  report.failure=String(error);
  report.worldState=await page?.evaluate(()=>{
    const w=window.__nvgTest?.world;if(!w)return {hook:false};
    return {desired:w.desired.size,chunks:w.chunks.size,dirty:[...w.dirty],pending:[...w.pending],completed:w.completed.length,
      missing:[...w.desired].filter(k=>!w.chunks.has(k)),worker:!!w.worker};
  }).catch(()=>undefined);
  throw error;
}
finally{await writeFile(directory+'/render-checks.json',JSON.stringify(report,null,2));await browser.close();await baseline?.dispose();}
