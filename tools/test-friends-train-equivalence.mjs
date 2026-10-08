import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {mkdir,writeFile} from 'node:fs/promises';
import {friendsBaselineModules} from './friends-baseline-modules.mjs';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(process.env.PLAYWRIGHT_MODULE||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3000',revision=process.env.FRIENDS_COMPARE_REV||'745226c';
const directory='artifacts/friends-render-second-pass';await mkdir(directory,{recursive:true});
const browser=await playwright.chromium.launch({headless:true,args:[`--use-angle=${process.env.FRIENDS_TEST_ANGLE||'metal'}`]});
let baseline;
const report={date:new Date().toISOString(),origin,revision,lighting:[],train:[],errors:[]};
try{
 const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||/GL_INVALID_|GL_OUT_OF_MEMORY/.test(m.text()))report.errors.push(m.text());});
 await page.route('**/__friends_render_equivalence',r=>r.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));await page.goto(`${origin}/__friends_render_equivalence`);
 baseline=await friendsBaselineModules(revision,['FriendsScenicTrainVisuals','FriendsClouds','FriendsCaveLighting','FriendsDirectLighting']);
 const result=await page.evaluate(async({urls})=>{
  const current={};for(const name of ['FriendsScenicTrainVisuals','FriendsClouds','FriendsCaveLighting'])current[name]=await import(`/src/game/rendering/${name}.ts`);
  const legacy={};for(const name of ['FriendsScenicTrainVisuals','FriendsClouds','FriendsCaveLighting'])legacy[name]=await import(urls[name]);
  const raw=await(await fetch('/src/game/rendering/FriendsClouds.ts')).text(),url=raw.match(/from "([^"]*three\.js[^"]*)"/)[1],THREE=await import(url);
  const {cullInactiveFriendsLights}=await import('/src/game/rendering/FriendsDirectLighting.ts');
  const result={lighting:[],train:[]};
  const setup=()=>{const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(600,440);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;
   const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(55,600/440,1,10000);camera.position.set(210,140,290);camera.lookAt(0,24,0);
   const moon=new THREE.DirectionalLight(0xa3c6ff,0);moon.position.set(-100,180,-100);scene.add(moon);
   const sun=new THREE.DirectionalLight(0xffe8c8,1.2);sun.position.set(180,280,90);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.normalBias=1.5;sun.shadow.bias=-.0003;Object.assign(sun.shadow.camera,{left:-400,right:400,top:400,bottom:-400,near:1,far:1200});sun.shadow.camera.updateProjectionMatrix();scene.add(sun,sun.target,new THREE.AmbientLight(0x9db2c5,.25));
   const points=Array.from({length:12},(_,i)=>{const p=new THREE.PointLight(0xffbb83,0,350,2);p.position.set((i%4-1.5)*60,60+Math.floor(i/4)*20,(i%3-1)*65);if(i===0){p.castShadow=true;p.shadow.mapSize.set(256,256);p.shadow.camera.near=1;}scene.add(p);return p;});
   const spot=new THREE.SpotLight(0xafd7ff,0,600,.9,.45,2);spot.position.set(70,110,130);spot.target.position.set(0,12,0);spot.castShadow=true;spot.shadow.mapSize.set(256,256);spot.shadow.camera.near=1;scene.add(spot,spot.target);
   return{renderer,scene,camera,points,spot,sun,moon,materials:[]};};
  const read=f=>{f.renderer.render(f.scene,f.camera);const gl=f.renderer.getContext(),data=new Uint8Array(600*440*4);gl.readPixels(0,0,600,440,gl.RGBA,gl.UNSIGNED_BYTE,data);if(gl.getError())throw new Error('WebGL error');return data;};
  const compare=(a,b)=>{let max=0,sum=0,changed=0;const pixels=new Set();for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);max=Math.max(max,d);sum+=d*d;if(d){changed++;pixels.add(i>>2);}}return{maxChannelDifference:max,rmsChannelDifference:Math.sqrt(sum/a.length),changedChannels:changed,changedPixels:pixels.size,totalChannels:a.length};};
  const dispose=f=>{f.scene.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.isInstancedMesh)o.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();if(o.shadow)o.shadow.dispose();});f.clouds?.release();f.renderer.dispose();f.renderer.forceContextLoss();};
  for(const mode of ['standard','cloud','cave']){
   const fixtures=[setup(),setup()];
   for(let side=0;side<2;side++){const f=fixtures[side];for(const [geometry,color,position] of [[new THREE.PlaneGeometry(900,900),0x779565,[0,0,0]],[new THREE.BoxGeometry(65,75,65),0xae8055,[-45,37.5,0]],[new THREE.SphereGeometry(36,24,16),0xa3bfce,[65,36,15]]]){
     const material=new THREE.MeshStandardMaterial({color,roughness:.48,metalness:.24});f.materials.push(material);
     if(mode==='cloud'){f.clouds??=new (side?current:legacy).FriendsClouds.FriendsClouds(f.renderer);f.clouds.shade(material);}
     if(mode==='cave')(side?current:legacy).FriendsCaveLighting.applyFriendsCaveLighting(material);
     if(mode==='standard'&&side){material.onBeforeCompile=s=>{s.fragmentShader=s.fragmentShader.replace('#include <lights_fragment_begin>',cullInactiveFriendsLights(THREE.ShaderChunk.lights_fragment_begin));};material.customProgramCacheKey=()=> 'friends-equivalence-culling';}
     const mesh=new THREE.Mesh(geometry,material);mesh.position.fromArray(position);if(geometry.type==='PlaneGeometry')mesh.rotation.x=-Math.PI/2;mesh.receiveShadow=true;mesh.castShadow=geometry.type!=='PlaneGeometry';f.scene.add(mesh);
    }
    f.clouds?.update(0,0,f.camera);
   }
   for(const sky of ['day','twilight','night'])for(const lighting of ['off','point-near','spot-near','all-near','outside-range','mixed']){
    for(const f of fixtures){f.sun.intensity=sky==='night'?.24:1.2;f.moon.intensity=sky==='twilight'?.24:0;f.points.forEach((p,i)=>{p.intensity=lighting==='off'||lighting==='spot-near'?0:lighting==='point-near'?i===0?35000:0:lighting==='mixed'?i%2?18000:0:18000;p.distance=lighting==='outside-range'?1:350;});f.spot.intensity=['spot-near','all-near','mixed','outside-range'].includes(lighting)?45000:0;f.spot.distance=lighting==='outside-range'?1:600;}
    result.lighting.push({mode,sky,lighting,...compare(read(fixtures[0]),read(fixtures[1]))});
   }
   fixtures.forEach(dispose);
  }
  const {scenicVehicles}=await import('/src/game/multiplayer/FriendsScenicService.ts');
  const {scenicRailway}=await import('/src/game/world/FriendsScenicRailway.ts');
  const length=scenicRailway().length;
  for(const kind of ['engine','touring','flatbed','stake','gondola']){
   const fixtures=[setup(),setup()];for(let side=0;side<2;side++){const f=fixtures[side],module=(side?current:legacy).FriendsScenicTrainVisuals;f.train=module.createScenicTrainVisual(kind==='engine',0,kind==='engine'?'touring':kind);f.scene.add(f.train);f.camera.position.set(210,85,240);f.camera.lookAt(0,24,0);}
   for(const distance of [0,48,96,10000,40000,90000,length-2,length+2]){
    for(let side=0;side<2;side++){const f=fixtures[side],v=scenicVehicles(distance)[kind==='engine'?0:1];f.train.position.set(v.x,v.z,v.y);f.train.rotation.set(0,-v.angle,v.pitch||0,'YXZ');(side?current:legacy).FriendsScenicTrainVisuals.updateScenicTrainVisual(f.train,v);
     // Put the same curved/graded track pose near the origin for pixel precision.
     f.train.position.set(0,0,0);f.train.updateMatrixWorld(true);f.train.userData.railwayFinishResources.frame.copy(f.train.matrixWorld).invert();}
    const a=read(fixtures[0]),b=read(fixtures[1]);
    const points=[];
    for(let side=0;side<2;side++){const f=fixtures[side],lists={};const add=(mesh,matrix)=>{const key=mesh.geometry.type+':'+f.train.userData.railwayFinishResources.materials.indexOf(mesh.material)+':'+mesh.castShadow+':'+mesh.receiveShadow,list=lists[key]??=[];const position=mesh.geometry.getAttribute('position');for(let i=0;i<position.count;i++)list.push(...new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(matrix).toArray());};
     for(const bogie of f.train.userData.scenicBogies)bogie.group.traverse(o=>{if(o.isMesh)add(o,o.matrixWorld);});
     if(side===1)for(const {mesh} of f.train.userData.scenicRunningGear?.batches||[])for(let i=0;i<mesh.count;i++){const matrix=new THREE.Matrix4();mesh.getMatrixAt(i,matrix);matrix.premultiply(mesh.matrixWorld);add(mesh,matrix);}
     points.push(lists);
    }
    let geometryError=0;for(const key of Object.keys(points[0])){if(points[0][key].length!==points[1][key].length)throw new Error('Missing geometry '+key);for(let i=0;i<points[0][key].length;i++)geometryError=Math.max(geometryError,Math.abs(points[0][key][i]-points[1][key][i]));}
    if(kind==='touring'&&distance===0)result.images=fixtures.map(f=>f.renderer.domElement.toDataURL());result.train.push({kind,distance,geometryError,draws:fixtures.map(f=>f.renderer.info.render.calls),bounds:(fixtures[1].train.userData.scenicRunningGear?.batches||[]).map(({mesh})=>({count:mesh.count,center:mesh.boundingSphere.center.toArray(),radius:mesh.boundingSphere.radius})),...compare(a,b)});
   }
   fixtures.forEach(dispose);
  }
  return result;
 },{urls:baseline.urls});
 if(result.images){for(let i=0;i<2;i++)await writeFile(`${directory}/train-${i?'after':'before'}.png`,Buffer.from(result.images[i].split(',')[1],'base64'));delete result.images;}Object.assign(report,result);assert.deepEqual(report.errors,[]);
 assert(report.lighting.every(r=>r.maxChannelDifference<=1),'light culling exceeded one 8-bit quantisation step');
 // Float32 instance composition can round a silhouette/contact sample differently.
 // Bound geometry error below 1e-5 world units and affected pixels below 0.002%.
 assert(report.train.every(r=>r.changedPixels/(r.totalChannels/4)<=.00002 && r.maxChannelDifference<=10 && r.rmsChannelDifference<=.02 && r.geometryError<.00001),'articulated batches exceeded subpixel geometry/rendering tolerances');
 console.log(JSON.stringify({lightingCases:report.lighting.length,lightingMaxDifference:Math.max(...report.lighting.map(r=>r.maxChannelDifference)),trainCases:report.train.length,trainMaxRms:Math.max(...report.train.map(r=>r.rmsChannelDifference)),trainMaxChangedPixels:Math.max(...report.train.map(r=>r.changedPixels)),trainMaxChannelDifference:Math.max(...report.train.map(r=>r.maxChannelDifference)),errors:report.errors},null,2));
}catch(error){report.failure=String(error);throw error;}
finally{await writeFile(`${directory}/equivalence.json`,JSON.stringify(report,null,2)+'\n');await browser.close();await baseline?.dispose();}
