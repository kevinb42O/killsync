import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const directory='artifacts/underwater-depth';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),report={errors:[],levels:[],oblique:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('[vite] failed'))report.errors.push(m.text());});
 await page.goto('http://localhost:3014/tools/submerged-review.html?view=abyss');await page.waitForFunction(()=>window.submergedReview);await page.evaluate(()=>{submergedReview.pause();document.querySelector('aside').hidden=true;});
 for(const depth of [40,300,900,1800,3200]){
  const result=await page.evaluate(depth=>{const r=submergedReview;r.camera.position.set(44000,-168.5-depth,23852);r.camera.lookAt(44015,35,23872);r.camera.updateMatrixWorld(true);r.draw();
   const gl=r.renderer.getContext(),pixels=new Uint8Array(96*96*4);gl.readPixels(672,402,96,96,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let luminance=0;for(let i=0;i<pixels.length;i+=4)luminance+=pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722;
   return {depth,metres:depth/12,luminance:luminance/(96*96),fog:r.scene.fog.color.toArray(),gl:gl.getError(),calls:r.renderer.info.render.calls,moteLight:r.effect.motes.material.uniforms.light.value};},depth);
  assert.equal(result.gl,0);report.levels.push(result);await page.screenshot({path:`${directory}/surface-from-${depth}.png`});
 }
 for(let i=1;i<report.levels.length;i++)assert.ok(report.levels[i].luminance<report.levels[i-1].luminance);
 assert.ok(report.levels.at(-1).luminance<report.levels[0].luminance*.15);
 // Compare an oblique finite surface against the surrounding water itself.
 // This catches a visible sheet/outline even when its center gets darker.
 for(const depth of [300,600,900,1500,2800]){
  const result=await page.evaluate(depth=>{
   const r=submergedReview;r.camera.position.set(44000,-168.5-depth,23852);r.camera.lookAt(44700,-168.5,24252);r.camera.updateMatrixWorld(true);
   for(let i=0;i<20;i++)r.draw();
   const gl=r.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
   const read=()=>{const pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;};
   r.draw();const surface=read(),calls=r.renderer.info.render.calls,water=[];
   r.scene.traverse(o=>{if(o.isMesh&&o.material.userData.frontierWater&&o.visible){water.push(o);o.visible=false;}});
   r.draw();const background=read();for(const o of water)o.visible=true;r.draw();
   let maxDifference=0,difference=0,changed=0;
   for(let i=0;i<surface.length;i+=4){let d=0;for(let c=0;c<3;c++)d=Math.max(d,Math.abs(surface[i+c]-background[i+c]));maxDifference=Math.max(maxDifference,d);difference+=d;if(d>2)changed++;}
   return {depth,metres:depth/12,maxDifference,meanDifference:difference/(w*h),visibleSurfacePixels:changed,calls,gl:gl.getError()};
  },depth);
  assert.equal(result.gl,0);report.oblique.push(result);await page.screenshot({path:`${directory}/oblique-from-${depth}.png`});
 }
 for(const result of report.oblique.filter(r=>r.depth>=1500))assert.ok(result.maxDifference<=2,`Surface still outlined at ${result.metres}m: ${result.maxDifference}`);
 report.oceanOverlap=await page.evaluate(async()=>{
  const {FriendsIslandOcean}=await import('/src/game/rendering/FriendsIslandVisuals.ts');
  const r=submergedReview,old=[];r.scene.traverse(o=>{if(o.isMesh&&o.material.userData.frontierWater){old.push(o);o.visible=false;}});
  const ocean=new FriendsIslandOcean();r.scene.add(ocean);r.camera.position.set(44000,-1968.5,23852);r.camera.lookAt(44700,-168.5,24252);r.camera.updateMatrixWorld(true);ocean.update(20,r.camera.position);
  for(let i=0;i<20;i++)r.draw();
  const gl=r.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,read=()=>{const p=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
  r.draw();const surface=read();ocean.visible=false;r.draw();const background=read();let maxDifference=0;
  for(let i=0;i<surface.length;i+=4)for(let c=0;c<3;c++)maxDifference=Math.max(maxDifference,Math.abs(surface[i+c]-background[i+c]));
  r.scene.remove(ocean);for(const o of old)o.visible=true;
  for(const mesh of ocean.children){mesh.geometry.dispose();mesh.material.dispose();}ocean.children[0].userData.bathymetry.dispose();
  return {maxDifference,gl:gl.getError()};
 });
 assert.equal(report.oceanOverlap.gl,0);assert.ok(report.oceanOverlap.maxDifference<=2);
 report.aboveSurface=await page.evaluate(()=>{
  const r=submergedReview;r.camera.position.set(44000,350,23852);r.camera.lookAt(44000,-168.5,24152);r.camera.updateMatrixWorld(true);r.draw();
  const gl=r.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,read=()=>{const p=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;},water=[];
  const enabled=read();r.scene.traverse(o=>{if(o.isMesh&&o.material.userData.frontierWater){water.push(o.material);o.material.fog=false;o.material.needsUpdate=true;}});
  r.draw();const disabled=read();for(const material of water){material.fog=true;material.needsUpdate=true;}
  let maxDifference=0;for(let i=0;i<enabled.length;i++)maxDifference=Math.max(maxDifference,Math.abs(enabled[i]-disabled[i]));
  return {maxDifference,gl:gl.getError()};
 });
 assert.equal(report.aboveSurface.gl,0);assert.equal(report.aboveSurface.maxDifference,0);
 await page.evaluate(()=>{submergedReview.view('lake');for(let i=0;i<20;i++)submergedReview.draw();});await page.screenshot({path:directory+'/lakebed.png'});
 await page.evaluate(()=>{submergedReview.view('abyss');for(let i=0;i<20;i++)submergedReview.draw();});await page.screenshot({path:directory+'/abyss-bed.png'});
 assert.deepEqual(report.errors,[]);
}finally{await writeFile(directory+'/checks.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
