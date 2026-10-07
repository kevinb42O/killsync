import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {posix,join} from 'node:path';
import {homedir} from 'node:os';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),ts=require('typescript');
let playwright;try{playwright=require('playwright');}catch{playwright=require(process.env.PLAYWRIGHT_MODULE||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3000',revision=process.env.FRIENDS_COMPARE_REV||'ed8d623';
const directory='artifacts/friends-render-optimisation';await mkdir(directory,{recursive:true});
const browser=await playwright.chromium.launch({headless:true,args:[`--use-angle=${process.env.FRIENDS_TEST_ANGLE||'metal'}`]});
const report={date:new Date().toISOString(),origin,revision,lighting:[],errors:[]};
try{
 const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||/GL_INVALID_|GL_OUT_OF_MEMORY/.test(m.text()))report.errors.push(m.text());});
 await page.route('**/__friends_render_equivalence',r=>r.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));await page.goto(`${origin}/__friends_render_equivalence`);
 async function before(file){
  const path=`src/game/rendering/${file}.ts`,response=await page.request.get(`${origin}/${path}`),code=await response.text(),urls=[...code.matchAll(/from ["']([^"']+)["']/g)].map(m=>m[1]);
  const source=ts.transpileModule(execFileSync('git',['show',`${revision}:${path}`],{encoding:'utf8'}),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  return source.replace(/from (["'])([^"']+)\1/g,(original,q,url)=>{const stem=url.startsWith('.')?posix.normalize('/'+posix.dirname(path)+'/'+url):`/node_modules/.vite/deps/${url}`,match=urls.find(u=>[stem+'.ts',stem+'.js'].includes(u.split('?')[0]));assert(match,`Missing import ${url}`);return 'from '+JSON.stringify(new URL(match,origin).href);});
 }
 const sources={};for(const name of ['FriendsClouds','FriendsCaveLighting'])sources[name]=await before(name);
 const result=await page.evaluate(async({sources})=>{
  const current={};for(const name of Object.keys(sources))current[name]=await import(`/src/game/rendering/${name}.ts`);
  const legacy={};for(const [name,source] of Object.entries(sources))legacy[name]=await import('data:text/javascript;base64,'+btoa(source));
  const raw=await(await fetch('/src/game/rendering/FriendsClouds.ts')).text(),url=raw.match(/from "([^"]*three\.js[^"]*)"/)[1],THREE=await import(url);
  const {cullInactiveFriendsLights}=await import('/src/game/rendering/FriendsDirectLighting.ts');
  const result={lighting:[]};
  const setup=()=>{const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(600,440);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;
   const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(55,600/440,1,10000);camera.position.set(210,140,290);camera.lookAt(0,24,0);
   const sun=new THREE.DirectionalLight(0xffe8c8,1.2);sun.position.set(180,280,90);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.normalBias=1.5;sun.shadow.bias=-.0003;Object.assign(sun.shadow.camera,{left:-400,right:400,top:400,bottom:-400,near:1,far:1200});sun.shadow.camera.updateProjectionMatrix();scene.add(sun,sun.target,new THREE.AmbientLight(0x9db2c5,.25));
   const points=Array.from({length:12},(_,i)=>{const p=new THREE.PointLight(0xffbb83,0,350,2);p.position.set((i%4-1.5)*60,60+Math.floor(i/4)*20,(i%3-1)*65);if(i===0){p.castShadow=true;p.shadow.mapSize.set(256,256);p.shadow.camera.near=1;}scene.add(p);return p;});
   const spot=new THREE.SpotLight(0xafd7ff,0,600,.9,.45,2);spot.position.set(70,110,130);spot.target.position.set(0,12,0);spot.castShadow=true;spot.shadow.mapSize.set(256,256);spot.shadow.camera.near=1;scene.add(spot,spot.target);
   return{renderer,scene,camera,points,spot,materials:[]};};
  const read=f=>{f.renderer.render(f.scene,f.camera);const gl=f.renderer.getContext(),data=new Uint8Array(600*440*4);gl.readPixels(0,0,600,440,gl.RGBA,gl.UNSIGNED_BYTE,data);if(gl.getError())throw new Error('WebGL error');return data;};
  const compare=(a,b)=>{let max=0,sum=0,changed=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);max=Math.max(max,d);sum+=d*d;if(d)changed++;}return{maxChannelDifference:max,rmsChannelDifference:Math.sqrt(sum/a.length),changedChannels:changed,totalChannels:a.length};};
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
   for(const lighting of ['off','point-near','spot-near','all-near','outside-range','mixed']){
    for(const f of fixtures){f.points.forEach((p,i)=>{p.intensity=lighting==='off'||lighting==='spot-near'?0:lighting==='point-near'?i===0?35000:0:lighting==='mixed'?i%2?18000:0:18000;p.distance=lighting==='outside-range'?1:350;});f.spot.intensity=['spot-near','all-near','mixed','outside-range'].includes(lighting)?45000:0;f.spot.distance=lighting==='outside-range'?1:600;}
    result.lighting.push({mode,lighting,...compare(read(fixtures[0]),read(fixtures[1]))});
   }
   fixtures.forEach(dispose);
  }
  return result;
 },{sources});
 Object.assign(report,result);assert.deepEqual(report.errors,[]);
 assert(report.lighting.every(r=>r.maxChannelDifference<=1),'light culling exceeded one 8-bit quantisation step');
 console.log(JSON.stringify({lightingCases:report.lighting.length,lightingMaxDifference:Math.max(...report.lighting.map(r=>r.maxChannelDifference)),errors:report.errors},null,2));
}catch(error){report.failure=String(error);throw error;}
finally{await writeFile(`${directory}/equivalence.json`,JSON.stringify(report,null,2)+'\n');await browser.close();}
