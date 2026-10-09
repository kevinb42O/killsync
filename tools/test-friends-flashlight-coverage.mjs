import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {friendsBaselineModules} from './friends-baseline-modules.mjs';

const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3000';
const directory=process.env.FRIENDS_FLASHLIGHT_DIRECTORY||'artifacts/flashlight-shape';await mkdir(directory,{recursive:true});
const baseline=process.env.FRIENDS_FLASHLIGHT_BASELINE
  ? await friendsBaselineModules(null,['FriendsFlashlight','FriendsFlashlightFalloff'],process.env.FRIENDS_FLASHLIGHT_BASELINE) : undefined;
const browser=await playwright.chromium.launch({headless:true,args:['--use-angle=metal']});
const report={errors:[],fixtures:[]};
try{
  const page=await browser.newPage({viewport:{width:960,height:540}});
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.route('**/__flashlight_coverage',r=>r.fulfill({contentType:'text/html',body:'<html><body style="margin:0"></body></html>'}));
  await page.goto(origin+'/__flashlight_coverage');
  const source=await(await page.request.get(origin+'/src/game/rendering/FriendsFlashlight.ts')).text();
  const threeUrl=source.match(/from ["']([^"']*\/three[^"']*)["']/)[1];
  for(const [name,url] of [...(baseline?[['before',baseline.urls.FriendsFlashlight]]:[]),['after','/src/game/rendering/FriendsFlashlight.ts']]){
    const fixture=await page.evaluate(async({name,url,threeUrl})=>{
      const THREE=await import(threeUrl),{FriendsFlashlight}=await import(url);
      const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
      renderer.setSize(960,540);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;
      renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
      const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(108,16/9,2,10000),handScene=new THREE.Scene();
      scene.background=new THREE.Color(0);
      const handCamera=new THREE.PerspectiveCamera(98,16/9,.025,1000);handScene.add(handCamera);
      const flashlight=new FriendsFlashlight(scene,handScene,camera,renderer);
      const pixels=new Uint8Array(64*64*4);
      for(let y=0;y<64;y++)for(let x=0;x<64;x++){
        const v=80+((x*7+y*11)%100);pixels.set([v,v,v,255],(y*64+x)*4);
      }
      const texture=new THREE.DataTexture(pixels,64,64);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
      const geometry=new THREE.PlaneGeometry(2,2);
      const wall=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x909b99,map:texture,roughness:.68}));
      wall.position.z=-600;wall.scale.set(6000,4000,1);wall.receiveShadow=true;scene.add(wall);
      // Several real shader variants expose light-count recompilation, with a
      // shadow caster to check that the inactive spotlight skips shadow draws.
      const variants=[];
      for(let i=0;i<6;i++){
        const material=new THREE.MeshStandardMaterial({color:0x909b99,roughness:.68,vertexColors:Boolean(i&1),map:i&2?texture:null,flatShading:Boolean(i&4)});
        const mesh=new THREE.Mesh(geometry.clone(),material);
        if(material.vertexColors)mesh.geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Array(mesh.geometry.attributes.position.count*3).fill(.7),3));
        mesh.position.set((i-2.5)*70,-200,-500);mesh.scale.set(25,25,1);mesh.castShadow=mesh.receiveShadow=true;
        scene.add(mesh);variants.push(mesh);
      }
      let shadowDraws=0;variants[0].onBeforeShadow=()=>shadowDraws++;
      const render=()=>{flashlight.syncWithCamera();renderer.render(scene,camera);};
      flashlight.update(0,true);render();render();
      const programsBefore=renderer.info.programs.length;
      const texturesBefore=renderer.info.memory.textures;
      shadowDraws=0;renderer.shadowMap.needsUpdate=true;render();const offShadowDraws=shadowDraws;
      const start=performance.now();flashlight.toggle();flashlight.update(1,true);render();
      const firstToggleMs=performance.now()-start,programsOn=renderer.info.programs.length,texturesOn=renderer.info.memory.textures;
      const toggleFrames=[];
      for(let i=0;i<12;i++){
        const start=performance.now();flashlight.toggle();flashlight.update(2+i,true);render();
        toggleFrames.push({ms:performance.now()-start,programs:renderer.info.programs.length});
        await new Promise(requestAnimationFrame);
      }
      const light=scene.getObjectByName('held-flashlight-beam');
      for(const mesh of variants)mesh.visible=false;
      const gl=renderer.getContext(),data=new Uint8Array(960*540*4),cases=[];
      const pictures=[];
      for(const fov of [108,115])for(const distance of [100,600,1200,1600,2200]){
        camera.fov=fov;camera.updateProjectionMatrix();wall.position.z=-distance;wall.scale.set(distance*10,distance*10,1);
        render();gl.readPixels(0,0,960,540,gl.RGBA,gl.UNSIGNED_BYTE,data);
        let lit=0,sum=0,white=0;const sample=(x,y)=>(data[(y*960+x)*4]+data[(y*960+x)*4+1]+data[(y*960+x)*4+2])/3;
        for(let y=27;y<513;y++)for(let x=48;x<912;x++){
          const v=sample(x,y);sum+=v;if(v>20)lit++;if(v>245)white++;
        }
        const count=864*486;
        cases.push({fov,distance,litFraction:lit/count,mean:sum/count,whiteFraction:white/count,center:sample(480,270),edge:sample(96,270)});
        if(fov===108&&distance===600)pictures.push({name:`${name}-wide-fov`,image:renderer.domElement.toDataURL()});
      }
      const glError=gl.getError();
      flashlight.dispose();geometry.dispose();texture.dispose();renderer.dispose();
      return{name,programsBefore,programsOn,texturesBefore,texturesOn,offShadowDraws,firstToggleMs,toggleFrames,cases,pictures,glError};
    },{name,url,threeUrl});
    for(const picture of fixture.pictures)await writeFile(`${directory}/${picture.name}.png`,Buffer.from(picture.image.split(',')[1],'base64'));
    delete fixture.pictures;report.fixtures.push(fixture);
  }
  const after=report.fixtures.find(f=>f.name==='after'),before=report.fixtures.find(f=>f.name==='before');
  assert.equal(after.programsOn,after.programsBefore,'activation must not compile world shaders');
  assert(after.toggleFrames.every(f=>f.programs===after.programsBefore),'repeated toggles keep world shaders stable');
  assert.equal(after.texturesOn,after.texturesBefore,'shadow map and cookie must already exist before activation');
  assert.equal(after.offShadowDraws,0,'off flashlight must skip shadow work when other lights request updates');
  for(const c of after.cases.filter(c=>c.distance===600)){
    assert(c.litFraction>.25&&c.litFraction<.65,'wide FOV must show a broad pool of light with dark periphery');
    assert(c.edge<5,'screen edges must stay outside the torch cone');
    assert(c.center>100,'the hotspot must clearly illuminate middle-distance surfaces');
  }
  assert(after.cases.filter(c=>c.distance<=600).every(c=>c.whiteFraction<.01),'close surfaces must retain texture');
  if(before){
    for(const c of after.cases.filter(c=>c.distance===600)){
      const b=before.cases.find(b=>b.fov===c.fov&&b.distance===c.distance);
      assert(c.litFraction<b.litFraction*.65,'beam must stay narrower than the original floodlight');
      assert(c.center>b.center*.85,'focusing must preserve the useful central brightness');
    }
  }
  assert(report.fixtures.every(f=>f.glError===0));
  // Exercise the real streamed cave and the held-tool pass, using the player's
  // wide FOV. The review fixture has its own disposable world and save state.
  await page.route('**/tools/frontier-review.ts*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:await response.text()+'\nwindow.__flashlightWorld={scene,world,renderer,camera,controls,viewmodel,handCamera,nightVision};'});
  });
  await page.goto(origin+'/tools/frontier-review.html?scene=treasury');
  await page.waitForFunction(()=>window.__flashlightWorld?.world.terrainStats.volumeActive>0,undefined,{timeout:60000});
  await page.evaluate(()=>{
    const {world,camera,handCamera,renderer,viewmodel,nightVision}=window.__flashlightWorld;
    camera.fov=108;camera.updateProjectionMatrix();handCamera.fov=98;handCamera.updateProjectionMatrix();
    // Production starts with a held mining tool; warm the same existing hand
    // pass before equipping the flashlight alongside it.
    world.tools.update(1,performance.now(),false,false,true);
    nightVision.beginFrame(renderer,camera,16);renderer.render(viewmodel,handCamera);nightVision.endFrame(renderer);
  });
  await page.waitForTimeout(1000);
  report.world=await page.evaluate(()=>{
    const {scene,world,renderer,camera,viewmodel,handCamera,nightVision}=window.__flashlightWorld;
    const before=renderer.info.programs.length,start=performance.now();
    world.toggleFlashlight();world.flashlight.update(performance.now()/1000,true);world.syncFlashlightWithCamera();
    renderer.autoClear=true;nightVision.beginFrame(renderer,camera,16);renderer.render(scene,camera);
    const worldMs=performance.now()-start,afterWorld=renderer.info.programs.length;
    renderer.autoClear=false;renderer.clearDepth();renderer.render(viewmodel,handCamera);
    nightVision.endFrame(renderer);
    return{before,afterWorld,afterHands:renderer.info.programs.length,worldMs,totalMs:performance.now()-start,glError:renderer.getContext().getError(),fov:camera.fov,angle:scene.getObjectByName('held-flashlight-beam').angle,volumes:world.terrainStats.volumeActive};
  });
  assert.equal(report.world.afterWorld,report.world.before,'real cave toggle must reuse compiled world shaders');
  // Artist-made held props can introduce their own small material variant.
  // The regression was a full world recompilation and a multi-second stall;
  // keep the complete world + hand activation within a generous frame budget.
  assert(report.world.totalMs<500,'equipping alongside a held tool must avoid the multi-second activation stall');
  assert.equal(report.world.glError,0);
  await page.locator('#flashlight').evaluate(button=>button.click()); // turn off the direct test activation
  await page.locator('#flashlight').evaluate(button=>button.click()); // enable the fixture's normal hand pass
  await page.locator('#hide').click();
  await page.waitForTimeout(500);
  await page.locator('canvas').first().screenshot({path:directory+'/cave-wide-fov.png'});
  assert.deepEqual(report.errors,[]);
  console.log(JSON.stringify(report,null,2));
}finally{
  await writeFile(directory+'/render-checks.json',JSON.stringify(report,null,2)+'\n');
  await browser.close();await baseline?.dispose();
}
