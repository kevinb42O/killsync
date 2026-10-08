import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';

const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(process.env.PLAYWRIGHT_MODULE||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3000';
const baseline=process.env.FRIENDS_SHADOW_TEST_BASELINE==='1';
const directory=process.env.FRIENDS_TEST_ARTIFACT_DIR||'artifacts/shadow-flashing';
await mkdir(directory,{recursive:true});
const report={origin,baseline,errors:[]};
const browser=await playwright.chromium.launch({headless:true,args:[`--use-angle=${process.env.FRIENDS_TEST_ANGLE||'metal'}`]});
try{
  const page=await browser.newPage({viewport:{width:400,height:300}});
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.route('**/__shadow_motion_test',r=>r.fulfill({contentType:'text/html',body:'<html><body style="margin:0"></body></html>'}));
  await page.goto(`${origin}/__shadow_motion_test`);
  const source=await (await page.request.get(`${origin}/src/game/rendering/FriendsClouds.ts`)).text();
  const threeUrl=source.match(/from ["']([^"']*\/three[^"']*)["']/)[1];
  Object.assign(report,await page.evaluate(async({threeUrl,baseline})=>{
    const THREE=await import(threeUrl);
    const {FriendsClouds}=await import('/src/game/rendering/FriendsClouds.ts');
    const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(400,300);
    document.body.append(renderer.domElement);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60,4/3,1,10000);
    camera.position.set(0,100,100);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    const direction=new THREE.Vector3(.8,.7,.1).normalize();
    const sun=new THREE.DirectionalLight(0xffffff,1.85);sun.position.copy(direction).multiplyScalar(1000);scene.add(sun,sun.target);
    const fill=new THREE.DirectionalLight(0xffffff,.35);fill.position.set(-100,100,-100);scene.add(fill,fill.target);
    const clouds=new FriendsClouds();clouds.setAtmosphere({lightDirection:{value:direction},directStrength:{value:1},cloudColor:{value:new THREE.Color()},horizon:new THREE.Color()});
    // An opaque, spatially constant cloud removes weather, wind, textures and
    // surface transitions as possible sources of temporal brightness changes.
    const atlas=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);atlas.needsUpdate=true;
    const material=new THREE.MeshStandardMaterial({color:0x808080,roughness:1,metalness:0});clouds.shade(material);
    const previousDirection={value:direction.clone().transformDirection(camera.matrixWorldInverse)};
    const compile=material.onBeforeCompile;
    material.onBeforeCompile=(shader,r)=>{
      compile(shader,r);shader.uniforms.frontierCloudShadow.value=atlas;
      if(baseline){
        shader.uniforms.frontierCloudViewDirection=previousDirection;
        shader.fragmentShader='uniform vec3 frontierCloudViewDirection;\n'+shader.fragmentShader.replace('normalize(mat3(viewMatrix)*frontierCloudDirection)','frontierCloudViewDirection');
      }
    };
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(20000,20000),material);floor.rotation.x=-Math.PI/2;scene.add(floor);
    const pixel=new Uint8Array(4),gl=renderer.getContext(),frames=[];
    const basePitch=camera.rotation.x;
    for(let frame=0;frame<64;frame++){
      // Match the arena: weather sees the previous pose; prepareFrame then
      // changes camera yaw, roll and position before WebGL renders the world.
      clouds.update(0,frame/60,camera);
      previousDirection.value.copy(direction).transformDirection(camera.matrixWorldInverse);
      const yaw=frame%4<2?0:.08;
      camera.position.x=frame*2;
      camera.rotation.set(basePitch,yaw,Math.sin(frame)*.006,'YXZ');
      renderer.render(scene,camera);
      gl.readPixels(200,150,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      frames.push({frame,yaw,brightness:(pixel[0]+pixel[1]+pixel[2])/3});
    }
    const brightness=frames.map(f=>f.brightness);
    const result={frames,min:Math.min(...brightness),max:Math.max(...brightness),webglError:gl.getError()};
    result.range=result.max-result.min;
    const programs=renderer.info.programs||[];result.shaderErrors=programs.filter(p=>p.diagnostics?.runnable===false).length;
    // Secondary light contributions still survive the cloud filter.
    sun.intensity=0;renderer.render(scene,camera);gl.readPixels(200,150,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
    result.fillOnly=(pixel[0]+pixel[1]+pixel[2])/3;
    atlas.image.data.fill(0);atlas.needsUpdate=true;renderer.render(scene,camera);gl.readPixels(200,150,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
    result.fillWithoutCloud=(pixel[0]+pixel[1]+pixel[2])/3;
    floor.geometry.dispose();material.dispose();atlas.dispose();clouds.release();renderer.dispose();
    return result;
  },{threeUrl,baseline}));
  await page.screenshot({path:`${directory}/${baseline?'baseline':'fixed'}-cloud-shadow.png`});
  assert.deepEqual(report.errors,[]);assert.equal(report.webglError,0);assert.equal(report.shaderErrors,0);
  assert(report.fillOnly>0,'secondary directional fill should remain illuminated');
  assert(Math.abs(report.fillOnly-report.fillWithoutCloud)<=1,'clouds must not attenuate the secondary directional fill');
  if(baseline)assert(report.range>20,'the old camera-dependent shadow calculation must reproduce flashing');
  else assert(report.range<=2,`cloud shading flashed by ${report.range} brightness levels during movement`);
  console.log(JSON.stringify({baseline,min:report.min,max:report.max,range:report.range,fillOnly:report.fillOnly,errors:report.errors},null,2));
}finally{
  await writeFile(`${directory}/${baseline?'baseline':'fixed'}-cloud-shadow.json`,JSON.stringify(report,null,2)+'\n');await browser.close();
}
