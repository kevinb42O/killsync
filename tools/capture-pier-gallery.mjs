import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require('/Users/kevin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const directory='artifacts/coastal-pier/gallery';await mkdir(directory,{recursive:true});
const shots=[
 {name:'01-coast-overview',eye:[1500,2900,1450],target:[2100,0,90],fov:45},
 {name:'02-pavilion',eye:[2840,1080,420],target:[3600,0,160],fov:50},
 {name:'03-promenade',eye:[1150,-90,64],target:[3600,0,110],fov:52},
 {name:'04-cafe-interior',eye:[3150,0,65],target:[3830,90,70],fov:65},
 {name:'05-chair-detail',view:'seated',fov:55},
 {name:'06-dome-and-facade',eye:[3190,710,245],target:[3600,30,220],fov:48},
];
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:3014/tools/friends-coastal-pier-review.html');
 await page.waitForFunction(()=>window.coastalPierReview?.scene.getObjectByName('belvedere-seaside-pier')?.userData.chairsReady);
 await page.locator('aside').evaluate(el=>el.style.display='none');
 await page.evaluate(()=>coastalPierReview.rig.nameplate.removeFromParent());
 for(const shot of shots){
  await page.evaluate(s=>{const r=coastalPierReview,p=r.p,c=r.camera;
   const point=([along,across,height])=>c.position.clone().set(p.x+Math.cos(p.angle)*along-Math.sin(p.angle)*across,p.deck+height,p.y+Math.sin(p.angle)*along+Math.cos(p.angle)*across);
   if(s.view)r.setView(s.view);else{c.position.copy(point(s.eye));c.lookAt(point(s.target));}
   c.fov=s.fov;c.updateProjectionMatrix();
  },shot);
  await page.waitForTimeout(2000);await page.screenshot({path:`${directory}/${shot.name}.png`});
 }
 if(errors.length)throw new Error(errors.join('\n'));
 await writeFile(`${directory}/cameras.json`,JSON.stringify(shots,null,2));console.log('Captured six 1920×1080 game screenshots.');
}finally{await browser.close();}
