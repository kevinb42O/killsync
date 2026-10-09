import {friendsArmPose} from '../src/game/multiplayer/FriendsGestureControls';
import { FriendsGestureViewmodels } from '../src/game/rendering/FriendsGestureViewmodels';
import { FRIENDS_CUTE_PALETTES } from '../src/game/rendering/FriendsCharacterFinish';
import * as THREE from 'three';
import { mountFriendsCharacter, updateFriendsCharacter } from '../src/game/rendering/FriendsCharacterVisuals';
import { loadFriendsCharacterModel } from '../src/game/rendering/FriendsCharacterModel';
import { createCoopOperatorRig, updateCoopOperatorRig } from '../src/game/rendering/coopOperatorVisuals';
import { FriendsToolViewmodels } from '../src/game/rendering/FriendsToolViewmodels';
import { FriendsFlashlight } from '../src/game/rendering/FriendsFlashlight';
import { FriendsHaulingVisuals } from '../src/game/rendering/FriendsHaulingVisuals';
import { FriendsSimulation } from '../src/game/multiplayer/FriendsSimulation';

const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#65868a');scene.add(new THREE.HemisphereLight('#fff2d8','#344e3c',2));const sun=new THREE.DirectionalLight('#fff0d4',2.2);sun.position.set(-70,110,80);scene.add(sun);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(1000,1000),new THREE.MeshStandardMaterial({color:'#729178',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.2;scene.add(floor);
const camera=new THREE.PerspectiveCamera(36,innerWidth/innerHeight,.1,2000);camera.position.set(0,65,215);camera.lookAt(0,25,0);
const viewmodel=new THREE.Scene(),handCamera=new THREE.PerspectiveCamera(98,innerWidth/innerHeight,.025,1000);viewmodel.add(handCamera);const tools=new FriendsToolViewmodels(viewmodel),flashlight=new FriendsFlashlight(scene,viewmodel,camera,renderer),hauling=new FriendsHaulingVisuals(new THREE.Scene(),viewmodel);
const gestures=new FriendsGestureViewmodels(viewmodel);
let gestureMask=0;
const simulation=new FriendsSimulation([{id:'review',label:'Review',color:'#fbbf24'}],1);const snapshot=simulation.createSnapshot(),local=snapshot.players[0];
const crew=FRIENDS_CUTE_PALETTES.map(({identity:color},i)=>{const rig=createCoopOperatorRig(color,'');rig.nameplate.visible=false;mountFriendsCharacter(rig,color);scene.add(rig.root);return {rig,player:{...local,id:`crew-${i}`,color,x:(i-2)*49,y:0,z:0,angle:Math.PI/2,motion:{...local.motion!,velocityX:i===1?120:0,velocityY:0},friendsSeat:i===4?{vehicleId:'campfire',index:0}:undefined,crouching:i===4}};});
const demoRig=createCoopOperatorRig('#f472b6','');mountFriendsCharacter(demoRig,'#f472b6');scene.add(demoRig.root);
const demoPlayer={...local,id:'demo',color:'#f472b6',x:0,y:0,z:0,angle:Math.PI/2,motion:{...local.motion!,velocityX:150,velocityY:0},friendsSeat:undefined,crouching:false};
const demoMasks=[0,4,8,12,1,2,3,5,10,15,7,11,13,14,6,9];
let mode='crew',turn=false,frames=0,time=0,demoStartedAt=0,demoLockedStage:number|undefined,demoView:'orbit'|'front'|'side'='orbit';
const demoCaption=document.getElementById('demo-caption')!;

function setMode(value:string){if(value==='demo')demoStartedAt=time;mode=value;history.replaceState(null,'','#'+value);demoCaption.hidden=mode!=='demo';document.getElementById('demo-controls')!.hidden=mode!=='demo';document.querySelector<HTMLElement>('.labels')!.hidden=mode!=='crew';}
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-mode]'))button.onclick=()=>setMode(button.dataset.mode!);
document.getElementById('demo-pause')!.onclick=()=>{demoLockedStage=demoLockedStage===undefined?Math.floor((time-demoStartedAt)/2300)%16:undefined;document.getElementById('demo-pause')!.textContent=demoLockedStage===undefined?'Pause pose':'Resume loop';};
document.getElementById('demo-next')!.onclick=()=>{demoLockedStage=((demoLockedStage??Math.floor((time-demoStartedAt)/2300))+1)%16;document.getElementById('demo-pause')!.textContent='Resume loop';};
document.getElementById('demo-view')!.onclick=()=>{demoView=demoView==='orbit'?'front':demoView==='front'?'side':'orbit';document.getElementById('demo-view')!.textContent=`View: ${demoView}`;};
document.getElementById('turn')!.onclick=()=>{turn=!turn;};
function render(elapsed:number){
  time=elapsed;const firstPerson=mode!=='crew'&&mode!=='signals'&&mode!=='demo';
  camera.fov=firstPerson?85:36;camera.updateProjectionMatrix();camera.position.set(0,firstPerson?1.7:65,firstPerson?0:215);camera.lookAt(0,firstPerson?1.7:25,firstPerson?-1:0);
  for(const {rig,player}of crew){
    (player as any).friendsHands=mode==='signals'?{mask:gestureMask,yaw:player.angle,pitch:0}:undefined;player.angle=turn?-Math.PI/2:Math.PI/2;updateCoopOperatorRig(rig,player,elapsed,16.666);updateFriendsCharacter(rig,player,elapsed);rig.root.visible=!firstPerson&&mode!=='demo';rig.firearm.group.visible=false;rig.nameplate.visible=false;}
  demoRig.root.visible=mode==='demo';
  if(mode==='demo'){
    const t=elapsed-demoStartedAt,stage=demoLockedStage??Math.floor(t/2300)%demoMasks.length,mask=demoMasks[stage],stride=t/1200;
    demoPlayer.x=Math.sin(stride)*16;demoPlayer.y=Math.cos(stride)*16;demoPlayer.angle=Math.atan2(-Math.sin(stride),Math.cos(stride));
    demoPlayer.sprinting=stage%4>=2;
    (demoPlayer as any).friendsHands={mask,yaw:demoPlayer.angle,pitch:Math.sin(t/3400)*.25};
    updateCoopOperatorRig(demoRig,demoPlayer,elapsed,16.666);updateFriendsCharacter(demoRig,demoPlayer,elapsed);demoRig.firearm.group.visible=false;demoRig.nameplate.visible=false;
    const angle=demoPlayer.angle+(demoView==='front'?0:demoView==='side'?Math.PI/2:Math.sin(t/4200)*1.2);
    camera.position.set(demoPlayer.x+Math.cos(angle)*135,62,demoPlayer.y+Math.sin(angle)*135);camera.lookAt(demoPlayer.x,28,demoPlayer.y);
    const names={rest:'Rest',up:'Raised ↑',point:'Forward →',sideways:'Sideways ↔'};
    demoCaption.innerHTML=`<strong>EMPTY HANDS · ${demoPlayer.sprinting?'RUNNING':'WALKING'} · ${stage+1} / 16</strong><br>Left: ${names[friendsArmPose(mask,'left')]} &nbsp; · &nbsp; Right: ${names[friendsArmPose(mask,'right')]}<br><small>Shoulders → elbows → wrists · continuous automatic loop</small>`;
  }
  gestures.update(gestureMask,0,16.666,mode==='hands');
  const id=mode==='axe'?1:mode==='pickaxe'?2:mode==='shovel'?3:0;tools.update(id,elapsed,false,false);
  if(flashlight.equipped!==(mode==='flashlight'))flashlight.toggle();flashlight.update(elapsed/1000,mode==='flashlight');
  hauling.update(snapshot,'review',mode==='rope'?5:0,elapsed,()=>({x:0,y:0,z:0}));
  handCamera.position.copy(camera.position);handCamera.quaternion.copy(camera.quaternion);renderer.autoClear=true;renderer.render(scene,camera);renderer.autoClear=false;renderer.clearDepth();renderer.render(viewmodel,handCamera);frames++;
}
addEventListener('keydown',e=>{const bit=e.key.toLowerCase()==='q'||e.key.toLowerCase()==='a'?1:e.key.toLowerCase()==='e'?2:0;if(bit)gestureMask|=bit;});
addEventListener('keyup',e=>{const bit=e.key.toLowerCase()==='q'||e.key.toLowerCase()==='a'?1:e.key.toLowerCase()==='e'?2:0;if(bit)gestureMask&=~bit;});
addEventListener('mousedown',e=>{if(e.target===renderer.domElement)gestureMask|=e.button===0?4:e.button===2?8:0;});
addEventListener('mouseup',e=>{gestureMask&=~(e.button===0?4:e.button===2?8:0);});
addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('blur',()=>gestureMask=0);
await loadFriendsCharacterModel();
setMode(location.hash.slice(1)||'crew');
function frame(elapsed:number){render(elapsed);requestAnimationFrame(frame);}requestAnimationFrame(frame);
(window as any).friendsCharacterReview={renderer,scene,camera,handCamera,viewmodel,crew,tools,flashlight,hauling,gestures,demoRig,demoPlayer,demoMasks,setDemoStage(stage:number|undefined){demoLockedStage=stage;},setDemoView(view:'orbit'|'front'|'side'){demoView=view;},setMask(mask:number){gestureMask=mask;},setMode,render,get frames(){return frames;},get time(){return time;}};
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=handCamera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();handCamera.updateProjectionMatrix();});
