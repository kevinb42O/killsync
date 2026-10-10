import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(process.env.PLAYWRIGHT_MODULE||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3012';
const directory=process.env.FRIENDS_TEST_ARTIFACT_DIR||'artifacts/excavation-shadows';
await mkdir(directory,{recursive:true});
const browser=await playwright.chromium.launch({headless:true,args:[`--use-angle=${process.env.FRIENDS_TEST_ANGLE||'metal'}`]});
const report={errors:[]};
try{
  const page=await browser.newPage({viewport:{width:256,height:256}});
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.route('**/__excavation_shadow_test',r=>r.fulfill({contentType:'text/html',body:'<html><body style="margin:0"></body></html>'}));
  await page.goto(`${origin}/__excavation_shadow_test`);
  const source=await (await page.request.get(`${origin}/src/game/rendering/FriendsTerrainCoverage.ts`)).text();
  const threeUrl=source.match(/from ["']([^"']*\/three[^"']*)["']/)[1];
  Object.assign(report,await page.evaluate(async threeUrl=>{
    const THREE=await import(threeUrl);
    const {configureTerrainCoverage,createTerrainShadowMaterials}=await import('/src/game/rendering/FriendsTerrainCoverage.ts');
    const {FriendsTerrainEditFeedback}=await import('/src/game/rendering/FriendsTerrainEditFeedback.ts');
    const {FriendsTerrain}=await import('/src/game/world/FriendsTerrain.ts');
    const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
    renderer.setSize(256,256);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
    document.body.append(renderer.domElement);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,1,1000);
    camera.position.set(8016,80,8016);camera.up.set(0,0,-1);camera.lookAt(8016,-64,8016);
    const grid=94,data=new Uint8Array(grid*grid),coverage=new THREE.DataTexture(data,grid,grid,THREE.RedFormat);
    const blockData=new Uint8Array(grid*grid).fill(255),blocks=new THREE.DataTexture(blockData,grid,grid,THREE.RedFormat);
    for(const t of [coverage,blocks]){t.minFilter=t.magFilter=THREE.NearestFilter;t.needsUpdate=true;}
    const material=new THREE.MeshStandardMaterial({color:0x999999,side:THREE.DoubleSide});
    configureTerrainCoverage(material,coverage,grid,'surface',{texture:blocks,altitude:{value:1}});
    const feedback=new FriendsTerrainEditFeedback(new THREE.Group(),Array.from({length:5},()=>new THREE.MeshStandardMaterial()));
    feedback.mask(material);
    const shadows=createTerrainShadowMaterials(coverage,grid,'surface');
    feedback.mask(shadows.depth);feedback.mask(shadows.distance);
    // A stale solid cell above an exposed receiver reproduces the invisible
    // terrain occluder without textures, weather, workers or moving cameras.
    const stale=new THREE.Mesh(new THREE.BoxGeometry(32,32,32),material);stale.position.set(8016,-16,8016);stale.castShadow=true;scene.add(stale);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(96,96),new THREE.MeshStandardMaterial({color:0x999999}));
    floor.rotation.x=-Math.PI/2;floor.position.set(8016,-64,8016);floor.receiveShadow=true;scene.add(floor);
    const terrain=new FriendsTerrain();terrain.addGrade([8000,8000,0,512]);terrain.set(250,250,-1,0);
    const pixel=new Uint8Array(4),gl=renderer.getContext();
    const read=()=>{renderer.render(scene,camera);gl.readPixels(128,128,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return (pixel[0]+pixel[1]+pixel[2])/3;};
    const cases=[];
    for(const kind of ['spot','point']){
      const light=kind==='spot'?new THREE.SpotLight(0xffffff,100000,500,.5,0,2):new THREE.PointLight(0xffffff,100000,500,2);
      light.position.copy(camera.position);light.castShadow=true;light.shadow.mapSize.set(512,512);light.shadow.camera.near=1;
      if(kind==='spot'){light.target.position.copy(floor.position);scene.add(light.target);}
      scene.add(light);
      for(const phase of ['pending','installed']){
        data.fill(0);coverage.needsUpdate=true;
        if(phase==='pending'){feedback.add(250,250,-1);feedback.refresh(terrain);}
        else{feedback.installed(15,15);feedback.refresh(terrain);data[15*grid+15]=255;coverage.needsUpdate=true;}
        stale.customDepthMaterial=undefined;stale.customDistanceMaterial=undefined;
        const before=read();
        stale.customDepthMaterial=shadows.depth;stale.customDistanceMaterial=shadows.distance;
        const after=read();
        stale.visible=false;const reference=read();stale.visible=true;
        cases.push({kind,phase,before,after,reference});
      }
      // Unedited terrain must continue to block light.
      // Suppress its camera draw only, so this samples the receiver's shadow
      // rather than the illuminated top of the intact block.
      data.fill(0);coverage.needsUpdate=true;material.colorWrite=false;material.depthWrite=false;const intact=read();
      material.colorWrite=true;material.depthWrite=true;
      cases.push({kind,phase:'intact',brightness:intact});
      light.removeFromParent();if(kind==='spot')light.target.removeFromParent();light.shadow.dispose();
    }
    // Capture the edited spotlight view for inspection.
    const light=new THREE.SpotLight(0xffffff,100000,500,.5,0,2);light.position.copy(camera.position);light.target.position.copy(floor.position);light.castShadow=true;scene.add(light,light.target);
    data[15*grid+15]=255;coverage.needsUpdate=true;read();
    return {cases,webglError:gl.getError(),shaderErrors:renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length};
  },threeUrl));
  await page.screenshot({path:`${directory}/fixed.png`});
  assert.deepEqual(report.errors,[]);assert.equal(report.webglError,0);assert.equal(report.shaderErrors,0);
  for(const c of report.cases){
    if(c.phase==='intact')assert(c.brightness<5,`${c.kind}: unedited terrain stopped casting shadows`);
    else{assert(c.after>c.before+50,`${c.kind}/${c.phase}: missing ghost-shadow reproduction`);assert(Math.abs(c.after-c.reference)<=2,`${c.kind}/${c.phase}: excavation still casts an invisible shadow`);}
  }
  console.log(JSON.stringify(report,null,2));
}finally{await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2)+'\n');await browser.close();}
