import * as THREE from 'three';
import { FriendsFrontierVisuals } from '../src/game/rendering/FriendsFrontierVisuals';
import { FriendsFrontier } from '../src/game/multiplayer/FriendsFrontier';
import type { FrontierTool } from '../src/game/multiplayer/FriendsFrontier';
import { createFriendsEnvironment } from '../src/game/rendering/FriendsWorldVisuals';
import { FriendsTerrain } from '../src/game/world/FriendsTerrain';
const scene=new THREE.Scene();scene.background=new THREE.Color('#aec4bd');scene.fog=new THREE.FogExp2('#aec4bd',.000009);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.90;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;document.body.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(108,innerWidth/innerHeight,2,32000),handCamera=new THREE.PerspectiveCamera(98,innerWidth/innerHeight,.025,1000),viewmodel=new THREE.Scene();viewmodel.add(handCamera);
const sun=new THREE.DirectionalLight('#ffe6c4',1.85),ambient=new THREE.AmbientLight('#e1f4e5',.65),fill=new THREE.HemisphereLight('#c7e9ff','#778361',.60);sun.position.set(7700,2300,4400);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-1700,right:1700,top:1700,bottom:-1700,near:10,far:6500});sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=1.5;sun.shadow.bias=-.0003;scene.add(sun,sun.target,ambient,fill,createFriendsEnvironment());
const terrain=new FriendsTerrain();camera.position.set(6210,terrain.surfaceHeight(6210,5700)+65,5700);camera.lookAt(6950,camera.position.y+55,6100);
const world=new FriendsFrontierVisuals(scene,viewmodel,renderer,camera,{sun,ambient,fill}),snapshot=new FriendsFrontier().snapshot();let tool:FrontierTool=1,swingStart=-Infinity;
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-tool]'))button.onclick=()=>{tool=Number(button.dataset.tool) as FrontierTool;};
document.getElementById('upgrade')!.onclick=()=>{snapshot.upgrades=snapshot.upgrades?0:1;};document.getElementById('torch')!.onclick=()=>world.toggleFlashlight();document.getElementById('swing')!.onclick=()=>{swingStart=performance.now();};document.getElementById('hide')!.onclick=()=>{document.querySelector('aside')!.hidden=true;};
let frames=0;
function frame(time:number){requestAnimationFrame(frame);const action=time<swingStart+600?{actor:'review',serial:1,tool,targetId:'review',start:swingStart,contact:swingStart+200,end:swingStart+600}:undefined;
  world.update(snapshot,camera.position.x,camera.position.z,time,tool,Boolean(action),[],180000);world.setToolAction(action,time);world.syncFlashlightWithCamera();handCamera.position.copy(camera.position);handCamera.quaternion.copy(camera.quaternion);renderer.autoClear=true;renderer.render(scene,camera);renderer.autoClear=false;renderer.clearDepth();renderer.render(viewmodel,handCamera);frames++;
  (window as any).friendsToolReview={world,renderer,camera,handCamera,frames,setTool:(id:FrontierTool)=>tool=id};}
requestAnimationFrame(frame);addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=handCamera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();handCamera.updateProjectionMatrix();});
