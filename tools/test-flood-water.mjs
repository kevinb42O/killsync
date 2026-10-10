import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});const body=process.env.FLOOD_REVIEW_BODY==='sea'?'sea':'lake',directory=body==='sea'?'artifacts/connected-flooding/sea':'artifacts/connected-flooding';await mkdir(directory,{recursive:true});const report={errors:[],views:[],cycles:[]};
try{const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});await page.goto((process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3015')+'/tools/flood-water-review.html?body='+body);await page.waitForFunction(()=>window.floodReview);
for(const name of ['bank','inside','night']){await page.evaluate(name=>{floodReview.view(name);floodReview.night(name==='night');},name);await page.screenshot({path:`${directory}/${name}.png`});report.views.push(await page.evaluate(()=>({gl:floodReview.renderer.getContext().getError(),...floodReview.visual.stats,wet:[...floodReview.field.cells()].length,calls:floodReview.renderer.info.render.calls})));}
report.surfaceVisibility=await page.evaluate(async()=>{
const THREE=await import('/node_modules/three/build/three.module.js'),r=floodReview;
const [column,surface]=[...r.field.exposed()][0], [vx,vy]=column.split(',').map(Number);
const scene=new THREE.Scene(),parent=r.visual.parent,camera=new THREE.OrthographicCamera(-48,48,48,-48,.1,500);
camera.position.set((vx+.5)*32,surface.level+100,(vy+.5)*32);camera.up.set(0,0,-1);camera.lookAt((vx+.5)*32,surface.level,(vy+.5)*32);
const naturalParent=r.natural.parent;scene.add(r.visual,r.natural);const target=new THREE.WebGLRenderTarget(96,96);r.renderer.setRenderTarget(target);r.renderer.setClearColor(0,0);r.renderer.clear();r.renderer.render(scene,camera);
const pixels=new Uint8Array(96*96*4);r.renderer.readRenderTargetPixels(target,0,0,96,96,pixels);let visiblePixels=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>0)visiblePixels++;
r.renderer.setRenderTarget(null);parent.add(r.visual);naturalParent.add(r.natural);target.dispose();r.draw();return {bodyId:surface.bodyId,wet:[...r.field.cells()].length,visiblePixels,centreAlpha:pixels[(48*96+48)*4+3]};
});assert(report.surfaceVisibility.visiblePixels>0&&report.surfaceVisibility.centreAlpha>0,'Solved flood water must produce visible pixels at its world position');
for(let i=0;i<10;i++){await page.evaluate(()=>{floodReview.seal();floodReview.draw();});const dry=await page.evaluate(()=>[...floodReview.field.cells()].length);assert.equal(dry,0);await page.evaluate(()=>{floodReview.dig();floodReview.draw();});report.cycles.push(await page.evaluate(()=>({wet:[...floodReview.field.cells()].length,geometry:floodReview.renderer.info.memory.geometries,textures:floodReview.renderer.info.memory.textures})));}
report.performance=await page.evaluate(async()=>{
const r=floodReview.renderer,gl=r.getContext(),extension=gl.getExtension('EXT_disjoint_timer_query_webgl2');
const begin=performance.now();for(let i=0;i<60;i++)floodReview.draw();const cpuMs=(performance.now()-begin)/60;
let gpuMs=null;if(extension){const q=gl.createQuery();gl.beginQuery(extension.TIME_ELAPSED_EXT,q);floodReview.draw();gl.endQuery(extension.TIME_ELAPSED_EXT);for(let i=0;i<100&&!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);i++)await new Promise(resolve=>setTimeout(resolve,10));if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)&&!gl.getParameter(extension.GPU_DISJOINT_EXT))gpuMs=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6;gl.deleteQuery(q);}
return {sceneCpuSubmitMs:cpuMs,sceneGpuMs:gpuMs,gpuTimerSupported:Boolean(extension),...floodReview.visual.stats};});
assert.equal(report.cycles[0].wet,report.cycles.at(-1).wet);assert.deepEqual(report.cycles[0],report.cycles.at(-1));assert.equal(report.errors.length,0);assert(report.views.every(v=>v.gl===0&&v.wet>0));await writeFile(`${directory}/render-checks.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}finally{await browser.close();}
