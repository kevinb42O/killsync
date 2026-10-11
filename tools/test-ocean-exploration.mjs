import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014';
const directory='artifacts/ocean-exploration';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const report={errors:[],views:[]};
try{
  const page=await browser.newPage({viewport:{width:1200,height:800}});
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.goto(origin+'/tools/water-polish-review.html');
  await page.waitForFunction(()=>window.waterReview);
  await page.evaluate(async()=>{
    waterReview.pause();document.querySelector('aside')?.remove();
    const source=await fetch('/src/game/rendering/FriendsUnderwaterVisuals.ts').then(r=>r.text());
    const THREE=await import(source.match(/from "([^"]*\/three\.js[^"]*)"/)[1]);
    const {FriendsTerrain}=await import('/src/game/world/FriendsTerrain.ts');
    const {FriendsBlockHorizon}=await import('/src/game/rendering/FriendsBlockHorizon.ts');
    const {FriendsBlockSurface}=await import('/src/game/rendering/FriendsBlockSurface.ts');
    const {configureTerrainCoverage,terrainCoverageIndex}=await import('/src/game/rendering/FriendsTerrainCoverage.ts');
    const {FriendsIslandOcean}=await import('/src/game/rendering/FriendsIslandVisuals.ts');
    const {FriendsDistantIslands}=await import('/src/game/rendering/FriendsDistantIslands.ts');
    const renderer=waterReview.renderer,scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(65,1.5,1,16000),terrain=new FriendsTerrain();
    scene.background=new THREE.Color('#608e9c');scene.add(new THREE.HemisphereLight(0xffffff,0x667766,2));
    const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-1,4,-2);scene.add(light);
    const grid=512,fine=new THREE.DataTexture(new Uint8Array(grid*grid),grid,grid,THREE.RedFormat),data=new Uint8Array(grid*grid),block=new THREE.DataTexture(data,grid,grid,THREE.RedFormat);
    for(const texture of [fine,block]){texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.needsUpdate=true;}
    const farMaterial=new THREE.MeshStandardMaterial({color:'#a7a48e',vertexColors:true,roughness:1}),nearMaterial=farMaterial.clone();
    for(const [material,layer]of [[farMaterial,'horizon'],[nearMaterial,'surface']])configureTerrainCoverage(material,fine,grid,layer,{texture:block,altitude:{value:1}});
    const horizon=new FriendsBlockHorizon(farMaterial,-32,24000),surface=new FriendsBlockSurface(nearMaterial,data,block,grid),ocean=new FriendsIslandOcean(),islands=new FriendsDistantIslands(fine,grid);
    scene.add(horizon,surface,islands);
    window.oceanExploration={THREE,renderer,scene,camera,terrain,horizon,surface,ocean,islands,data,grid,terrainCoverageIndex};
  });
  for(const [name,x,y]of [['west',-32,24000],['east',48032,24000],['north',24000,-32],['south',24000,48032]]){
    await page.evaluate(({x,y})=>{
      const r=oceanExploration,bed=r.terrain.surfaceHeight(x,y);
      r.camera.position.set(x,bed+200,y);r.camera.lookAt(x-400,bed+32,y+200);
      r.horizon.update(x,y);r.surface.update(x,y,0);
    },{x,y});
    await page.waitForFunction(({x,y})=>{
      const r=oceanExploration;r.horizon.update(x,y);r.surface.update(x,y,performance.now()/1000);
      const i=r.terrainCoverageIndex(Math.floor(x/512),Math.floor(y/512),r.grid);
      return r.data[i]===255&&r.horizon.hasTerrainAt(x,y);
    },{x,y},{timeout:60000});
    const result=await page.evaluate(({x,y})=>{
      const r=oceanExploration;r.renderer.render(r.scene,r.camera);
      const gl=r.renderer.getContext();
      return {x,y,gl:gl.getError(),surface:r.surface.stats,horizonTiles:r.horizon.children.length,calls:r.renderer.info.render.calls,triangles:r.renderer.info.render.triangles};
    },{x,y});
    assert.equal(result.gl,0);assert.ok(result.calls>0);assert.ok(result.triangles>0);
    report.views.push({name,...result});await page.screenshot({path:`${directory}/${name}.png`});
  }
  const oceanResult=await page.evaluate(()=>{
    const r=oceanExploration;r.scene.add(r.ocean);r.camera.position.set(-100000,250,24000);r.camera.lookAt(-99000,-168.5,24000);
    r.ocean.update(10,r.camera.position);r.renderer.render(r.scene,r.camera);
    const result={seaX:r.ocean.far.position.x,patchX:r.ocean.patch.position.x,gl:r.renderer.getContext().getError()};
    r.horizon.dispose();r.surface.dispose();r.ocean.dispose();r.islands.dispose();return result;
  });
  assert.equal(oceanResult.seaX,oceanResult.patchX);assert.equal(oceanResult.gl,0);assert.deepEqual(report.errors,[]);
  report.ocean=oceanResult;await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
