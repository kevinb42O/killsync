import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';

const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(process.env.PLAYWRIGHT_MODULE||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3011';
const directory='artifacts/flashlight-fix';await mkdir(directory,{recursive:true});
const browser=await playwright.chromium.launch({headless:true,args:[`--use-angle=${process.env.FRIENDS_TEST_ANGLE||'metal'}`]});
const report={origin,errors:[]};
try{
  const page=await browser.newPage({viewport:{width:600,height:440}});
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.route('**/__flashlight_test',r=>r.fulfill({contentType:'text/html',body:'<html><body style="margin:0"></body></html>'}));
  await page.goto(`${origin}/__flashlight_test`);
  const source=await (await page.request.get(`${origin}/src/game/rendering/FriendsFlashlight.ts`)).text();
  const threeUrl=source.match(/from ["']([^"']*\/three[^"']*)["']/)[1];
  Object.assign(report,await page.evaluate(async threeUrl=>{
    const THREE=await import(threeUrl);
    const {FriendsFlashlight}=await import('/src/game/rendering/FriendsFlashlight.ts');
    const {FRIENDS_FLASHLIGHT_SOFT_DISTANCE}=await import('/src/game/rendering/FriendsFlashlightFalloff.ts');
    const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
    renderer.setSize(600,440);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.90;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
    document.body.append(renderer.domElement);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(70,600/440,2,10000);
    scene.background=new THREE.Color(0);
    const flashlight=new FriendsFlashlight(scene,new THREE.Scene(),camera,renderer);flashlight.toggle();flashlight.update(0,true);
    const light=scene.getObjectByName('held-flashlight-beam');
    const pixels=new Uint8Array(64*64*4);
    for(let y=0;y<64;y++)for(let x=0;x<64;x++){
      const brightness=70+((x*7+y*11)%120),i=(y*64+x)*4;
      pixels.set([brightness,brightness,brightness,255],i);
    }
    const texture=new THREE.DataTexture(pixels,64,64);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
    const material=new THREE.MeshStandardMaterial({color:0x909b99,map:texture,roughness:.68});
    const wall=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);wall.receiveShadow=true;scene.add(wall);
    const read=()=>{renderer.shadowMap.needsUpdate=true;renderer.render(scene,camera);const gl=renderer.getContext(),data=new Uint8Array(600*440*4);gl.readPixels(0,0,600,440,gl.RGBA,gl.UNSIGNED_BYTE,data);if(gl.getError())throw new Error('WebGL draw error');return data;};
    const stats=data=>{
      let sum=0,white=0,count=0,min=255,max=0;
      for(let y=150;y<290;y++)for(let x=230;x<370;x++){
        const i=(y*600+x)*4,value=(data[i]+data[i+1]+data[i+2])/3;
        sum+=value;min=Math.min(min,value);max=Math.max(max,value);count++;
        if(data[i]>245&&data[i+1]>245&&data[i+2]>245)white++;
      }
      return{mean:sum/count,whiteFraction:white/count,min,max};
    };
    const cases=[];
    for(const distance of [40,100,250,600,900,1200,1600,2200,2800]){
      wall.position.set(0,0,-distance);wall.scale.setScalar(distance);
      light.decay=2;const before=read();
      light.decay=-FRIENDS_FLASHLIGHT_SOFT_DISTANCE;const after=read();
      let maxDifference=0;for(let i=0;i<after.length;i++)maxDifference=Math.max(maxDifference,Math.abs(after[i]-before[i]));
      cases.push({distance,before:stats(before),after:stats(after),maxDifference});
    }
    // Near wall and distant wall occupy the same frame: no whole-beam dimming.
    wall.position.set(-30,0,-100);wall.scale.set(30,80,1);
    const farDistance=FRIENDS_FLASHLIGHT_SOFT_DISTANCE*2+500;
    const far=new THREE.Mesh(wall.geometry,material);far.position.set(farDistance*.3,0,-farDistance);far.scale.set(farDistance*.3,farDistance*.8,1);far.receiveShadow=true;scene.add(far);
    light.decay=2;const before=read();const beforeImage=renderer.domElement.toDataURL();
    light.decay=-FRIENDS_FLASHLIGHT_SOFT_DISTANCE;const after=read();const afterImage=renderer.domElement.toDataURL();
    let farMaxDifference=0,nearReduction=0,count=0;
    for(let y=160;y<280;y++)for(let x=200;x<400;x++){
      const i=(y*600+x)*4;
      if(x>310)for(let channel=0;channel<3;channel++)farMaxDifference=Math.max(farMaxDifference,Math.abs(before[i+channel]-after[i+channel]));
      if(x<290){nearReduction+=before[i]-after[i];count++;}
    }
    // Translate + turn after the early world update, then render the final pose.
    camera.position.set(300,20,70);camera.rotation.set(.1,.3,.015,'YXZ');flashlight.syncWithCamera();
    const beamDirection=light.target.position.clone().sub(light.position).normalize();
    const runningAlignment=beamDirection.dot(camera.getWorldDirection(new THREE.Vector3()));
    read();
    return{cases,softDistance:FRIENDS_FLASHLIGHT_SOFT_DISTANCE,mixed:{farMaxDifference,nearReduction:nearReduction/count},runningAlignment,beforeImage,afterImage};
  },threeUrl));
  for(const name of ['before','after']){
    const key=`${name}Image`;await writeFile(`${directory}/${name}.png`,Buffer.from(report[key].split(',')[1],'base64'));delete report[key];
  }
  assert.deepEqual(report.errors,[]);
  assert(report.cases.filter(c=>c.distance<=250).every(c=>c.after.mean<c.before.mean-40&&c.after.whiteFraction===0),'near wall must retain texture without whiteout');
  assert(report.cases.filter(c=>c.distance>=report.softDistance*2).every(c=>c.maxDifference<=1),'long-range brightness must be preserved outside the softening zone');
  assert(report.mixed.farMaxDifference<=1&&report.mixed.nearReduction>40,'near and far surfaces must be corrected independently');
  assert(report.runningAlignment>1-1e-12,'beam must use the final running camera pose');
  console.log(JSON.stringify(report,null,2));
}catch(error){report.failure=String(error);throw error;}
finally{await writeFile(`${directory}/render-checks.json`,JSON.stringify(report,null,2)+'\n');await browser.close();}
