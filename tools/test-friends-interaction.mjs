import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014',directory='artifacts/mining-building';
await mkdir(directory,{recursive:true});
const browser=await playwright.chromium.launch({headless:true,args:['--use-angle=metal','--disable-background-timer-throttling']});
const report={origin,errors:[],checks:[]};
try{
  const page=await browser.newPage({viewport:{width:900,height:620}});
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.route('**/__interaction_review',r=>r.fulfill({contentType:'text/html',body:'<html><body style="margin:0;background:#19251f"></body></html>'}));
  await page.goto(origin+'/__interaction_review');
  const source=await(await page.request.get(origin+'/src/game/rendering/FriendsInteractionVisuals.ts')).text();
  const threeUrl=source.match(/from ["']([^"']*\/three[^"']*)["']/)[1];
  report.render=await page.evaluate(async threeUrl=>{
    const THREE=await import(threeUrl),{FriendsInteractionVisuals}=await import('/src/game/rendering/FriendsInteractionVisuals.ts'),{FriendsTerrain}=await import('/src/game/world/FriendsTerrain.ts');
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(900,620);renderer.setPixelRatio(1);document.body.append(renderer.domElement);
    const scene=new THREE.Scene();scene.background=new THREE.Color('#29372f');const camera=new THREE.PerspectiveCamera(50,900/620,1,1500);camera.position.set(7920,140,8130);camera.lookAt(8050,18,8016);
    const terrain=new FriendsTerrain();terrain.addGrade([8000,8000,0,512]);
    const baseGeometry=new THREE.BoxGeometry(32,32,32),materials=['#8b7254','#a1aaa0','#bda18b'].map(color=>new THREE.MeshLambertMaterial({color}));
    scene.add(new THREE.HemisphereLight('#f4f0df','#344437',2));const light=new THREE.DirectionalLight('#f4ddb5',2);light.position.set(7900,300,8100);scene.add(light);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(700,700),new THREE.MeshLambertMaterial({color:'#556851'}));floor.rotation.x=-Math.PI/2;floor.position.set(8016,-.1,8016);scene.add(floor);
    for(let i=0;i<8;i++){const vx=250+i*2;terrain.set(vx,250,0,i%3===0?1:i%3===1?2:3);const block=new THREE.Mesh(baseGeometry,materials[i%3]);block.position.set((vx+.5)*32,16,8016);scene.add(block);}
    const visuals=new FriendsInteractionVisuals(scene);
    const target={id:'252,250,0',kind:'stone',valid:true,x:8070,y:8016,z:32,nx:0,ny:0,nz:1,distance:100,ground:{vx:252,vy:250,vz:0,material:2}};
    const work=(i,stage,now)=>({id:(250+i*2)+',250,0',value:stage,total:8,until:now+1100,by:'p'+i,kind:i%3===0?'soil':i%3===1?'stone':'ore',x:(250+i*2+.5)*32,y:8016,z:32,nx:0,ny:0,nz:1,vx:250+i*2,vy:250,vz:0});
    const feedback={actions:{},damage:[work(1,2,0)],contacts:[]};
    window.interactionReview={renderer,scene,camera,terrain,visuals,target,feedback,work};
    visuals.update(target,feedback,terrain,'p1',0);renderer.render(scene,camera);
    const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown',glError:gl.getError(),stats:visuals.stats};
  },threeUrl);
  assert.equal(report.render.glError,0);report.checks.push('crack shader compiles and renders without WebGL errors');
  await page.screenshot({path:directory+'/stone-first-cracks.png'});
  await page.evaluate(()=>{const r=window.interactionReview;r.feedback.damage=[r.work(1,7,200)];r.visuals.update(r.target,r.feedback,r.terrain,'p1',200);r.renderer.render(r.scene,r.camera);});
  await page.screenshot({path:directory+'/stone-deep-cracks.png'});
  await page.evaluate(()=>{const r=window.interactionReview;r.feedback.contacts=[{...r.work(1,8,400),serial:1,at:400,broken:true}];r.feedback.damage=[];r.visuals.update(r.target,r.feedback,r.terrain,'p1',400);r.visuals.update(undefined,r.feedback,r.terrain,'p1',520);r.renderer.render(r.scene,r.camera);});
  await page.screenshot({path:directory+'/break-fragments.png'});
  report.performance=await page.evaluate(async()=>{
    const r=window.interactionReview,gl=r.renderer.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const percentile=(a,p)=>a.sort((a,b)=>a-b)[Math.floor((a.length-1)*p)];
    let fragmentPeak=0;const samples=[{cpu:[],wall:[],queries:[],draws:0},{cpu:[],wall:[],queries:[],draws:0}];
    for(let i=0;i<260;i++){
      const active=i%2===1, bucket=samples[Number(active)],now=1000+i*16;
      r.visuals.group.visible=active;
      const feedback={actions:{},damage:Array.from({length:8},(_,n)=>r.work(n,4+n%4,now)),contacts:[]};
      if(active&&i%16===1)feedback.contacts=Array.from({length:5},(_,n)=>({...r.work(n,8,now),serial:1000+i*5+n,at:now,broken:true}));
      const start=performance.now();if(active)r.visuals.update(r.target,feedback,r.terrain,'p1',now);
      if(i>=20)bucket.cpu.push(performance.now()-start);fragmentPeak=Math.max(fragmentPeak,r.visuals.stats.fragments);
      let query;if(timer&&i>=20){query=gl.createQuery();gl.beginQuery(timer.TIME_ELAPSED_EXT,query);}
      const draw=performance.now();r.renderer.render(r.scene,r.camera);
      if(query){gl.endQuery(timer.TIME_ELAPSED_EXT);bucket.queries.push(query);}
      if(i>=20)bucket.wall.push(performance.now()-draw);bucket.draws=r.renderer.info.render.calls;
      await new Promise(requestAnimationFrame);
    }
    const summary=b=>{
      const gpu=[];if(timer&&!gl.getParameter(timer.GPU_DISJOINT_EXT))for(const q of b.queries){if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);}
      return {cpuP50:percentile(b.cpu,.5),cpuP95:percentile(b.cpu,.95),cpuP99:percentile(b.cpu,.99),renderWallP95:percentile(b.wall,.95),gpuP50:gpu.length?percentile(gpu,.5):null,gpuP95:gpu.length?percentile(gpu,.95):null,draws:b.draws};
    };
    const baseline=summary(samples[0]),feedback={...summary(samples[1]),stats:r.visuals.stats};
    r.visuals.group.visible=true;
    r.visuals.setEffects('off');r.visuals.update(r.target,{actions:{},damage:[r.work(1,4,5000)],contacts:[]},r.terrain,'p1',5000);r.renderer.render(r.scene,r.camera);
    return {method:'alternating frames after warmup; 120 samples per scene',fragmentPeak,baseline,feedback,cpuDeltaP95:feedback.cpuP95-baseline.cpuP95,gpuDeltaP95:feedback.gpuP95!==null&&baseline.gpuP95!==null?feedback.gpuP95-baseline.gpuP95:null,drawDelta:feedback.draws-baseline.draws,off:r.visuals.stats,glError:gl.getError()};
  });
  assert.equal(report.performance.glError,0);assert.ok(report.performance.drawDelta<=3);assert.equal(report.performance.fragmentPeak,96);assert.equal(report.performance.off.fragments,0);assert.ok(report.performance.off.crackFaces>0);
  report.checks.push('feedback uses at most three additional draws','effects off preserves selection and cracks','fragment pool stays bounded under five simultaneous miners');
  await page.screenshot({path:directory+'/reduced-effects.png'});
  report.excavation=await page.evaluate(async threeUrl=>{
    const r=window.interactionReview,THREE=await import(threeUrl),{FriendsTerrainEditFeedback}=await import('/src/game/rendering/FriendsTerrainEditFeedback.ts');
    const materials=Array.from({length:5},()=>new THREE.MeshStandardMaterial({color:'#b7b6ac'})),owner=new THREE.Group();r.scene.add(owner);
    const patch=new FriendsTerrainEditFeedback(owner,materials);for(const m of r.scene.children)if(m instanceof THREE.Mesh&&m!==owner)for(const material of Array.isArray(m.material)?m.material:[m.material])patch.mask(material);
    r.terrain.set(252,250,0,0);patch.add(252,250,0);patch.refresh(r.terrain);r.renderer.render(r.scene,r.camera);
    const glError=r.renderer.getContext().getError(),active=patch.stats;
    patch.installed(15,15);patch.refresh(r.terrain);const retired=patch.stats;
    patch.dispose();materials.forEach(m=>m.dispose());return {glError,active,retired};
  },threeUrl);
  assert.equal(report.excavation.glError,0);assert.equal(report.excavation.active.pendingVoxels,1);assert.equal(report.excavation.retired.pendingVoxels,0);report.checks.push('temporary excavation mask compiles and retires with the matching mesh');
  assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}finally{await writeFile(directory+'/render-performance.json',JSON.stringify(report,null,2));await browser.close();}
