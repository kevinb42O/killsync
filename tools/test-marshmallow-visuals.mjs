import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);let playwright;try{playwright=require('playwright');}catch{playwright=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const directory='artifacts/marshmallow-visuals',origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3000';await mkdir(directory,{recursive:true});
const browser=await playwright.chromium.launch({headless:true,args:['--use-angle=metal']});const errors=[];
try{const page=await browser.newPage({viewport:{width:1200,height:800}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.route('**/tools/marshmallow-visual-review',route=>route.fulfill({contentType:'text/html',body:'<style>body{margin:0}canvas{display:block}</style>'}));
await page.goto(`${origin}/tools/marshmallow-visual-review`);
const initial=await page.evaluate(async()=>{
 const THREE=await import('/node_modules/three/build/three.module.js');
 const {FriendsMarshmallowVisuals}=await import('/src/game/rendering/FriendsMarshmallowVisuals.ts');
 const {CAMPFIRE_SEATS}=await import('/src/game/multiplayer/FriendsCampfireSeats.ts');const {FRIENDS_CAMPFIRE}=await import('/src/game/world/FriendsRegion.ts');
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1200,800);renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;document.body.append(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#293d3a');scene.add(new THREE.HemisphereLight('#e2eeff','#76624a',2.4));const light=new THREE.DirectionalLight('#ffe1b5',3);light.position.set(-100,170,50);scene.add(light);
 const p={id:'local',...CAMPFIRE_SEATS[2],lifeState:'alive',friendsSeat:{vehicleId:FRIENDS_CAMPFIRE.id,index:2}};
 const camera=new THREE.PerspectiveCamera(110,1.5,2,1000);camera.position.set(p.x,p.z+45,p.y);camera.lookAt(FRIENDS_CAMPFIRE.x,FRIENDS_CAMPFIRE.z+45,FRIENDS_CAMPFIRE.y);
 const visuals=new FriendsMarshmallowVisuals(scene);const state={fuelSeconds:100,roasts:{local:{toast:0,roasting:false,charred:false,heat:0,burningMs:0,serial:1}}};
 function render(toast=0,roasting=false,charred=false,burning=false){Object.assign(state.roasts.local,{toast,roasting,charred,burningMs:burning?3000:0});visuals.update([p],state,'local',camera,10,2000);renderer.render(scene,camera);return {...renderer.info.render};}
 window.review={THREE,renderer,scene,camera,visuals,p,state,render};render();await new Promise(r=>setTimeout(r,1000));return render();
});
const stats={initial,stages:{}};
for(const [name,toast,charred,burning]of [['fresh',0,false,false],['golden',.55,false,false],['dark',.85,false,false],['charred',1,true,false],['burning',1,false,true]]){stats.stages[name]=await page.evaluate(([toast,charred,burning])=>review.render(toast,false,charred,burning),[toast,charred,burning]);await page.screenshot({path:`${directory}/detail-${name}.png`});}
for(const [name,fov,aspect]of [['wide',120,1.5],['narrow',110,.75]]){await page.evaluate(([fov,aspect])=>{review.camera.fov=fov;review.camera.aspect=aspect;review.camera.updateProjectionMatrix();review.render();},[fov,aspect]);await page.screenshot({path:`${directory}/framing-${name}.png`});}
assert.deepEqual(errors,[]);await writeFile(`${directory}/geometry-cost.json`,JSON.stringify(stats,null,2));console.log(JSON.stringify(stats,null,2));
}finally{await browser.close();}
