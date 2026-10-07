import * as THREE from 'three';
import { Renderer3D } from '../src/game/Renderer3D';
import { FriendsSimulation } from '../src/game/multiplayer/FriendsSimulation';
import { FriendsHaulingVisuals } from '../src/game/rendering/FriendsHaulingVisuals';

const scene=new THREE.Scene(),viewmodel=new THREE.Scene();scene.background=new THREE.Color(0x819da2);scene.fog=new THREE.Fog(0x819da2,800,3000);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.body.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(110,innerWidth/innerHeight,2,4000),handCamera=new THREE.PerspectiveCamera(98,camera.aspect,.025,1000);viewmodel.add(handCamera);
scene.add(new THREE.HemisphereLight(0xe4f2ff,0x485044,2));const sun=new THREE.DirectionalLight(0xffe3b5,3);sun.position.set(1150,200,1050);sun.target.position.set(1200,0,1100);sun.castShadow=true;Object.assign(sun.shadow.camera,{left:-250,right:250,top:250,bottom:-250,near:1,far:600});sun.shadow.camera.updateProjectionMatrix();sun.shadow.mapSize.set(2048,2048);sun.shadow.normalBias=.3;scene.add(sun,sun.target);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(3000,3000),new THREE.MeshStandardMaterial({color:0x617d6e,roughness:.95}));floor.rotation.x=-Math.PI/2;floor.position.set(1200,-.4,1000);floor.receiveShadow=true;scene.add(floor);
const grid=new THREE.GridHelper(3000,100,0x758678,0x758678);grid.position.set(1200,-.3,1000);scene.add(grid);
const snapshot=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]).createSnapshot(),cargo=snapshot.friends!.hauling!.cargo[0],player=snapshot.players[0];
Object.assign(cargo,{x:1200,y:1000,z:0});Object.assign(player,{x:1180,y:1170,z:0,angle:-Math.PI/2});
snapshot.friends!.vehicles=[];snapshot.friends!.hauling!.ropes=[{id:'host',cargoId:cargo.id,anchorX:20,anchorY:28,anchorZ:32,length:180,tension:.8,blocked:false}];
const visuals=new FriendsHaulingVisuals(scene,viewmodel);
const projectionContext={camera,viewmodelCamera:handCamera,tempMuzzlePos:new THREE.Vector3(),tempMuzzleNdc:new THREE.Vector3(),tempMuzzleNdc2:new THREE.Vector2(),tempRaycaster:new THREE.Raycaster()} as unknown as Renderer3D;
const project=(point:THREE.Object3D)=>Renderer3D.prototype.projectViewmodelPointToWorld.call(projectionContext,point);
let pose='normal',slack=false;
for(const id of ['normal','wide','up','down','turn','braid'])document.getElementById(id)!.onclick=()=>{pose=id;};
document.getElementById('slack')!.onclick=()=>{slack=!slack;};
addEventListener('resize',()=>{camera.aspect=handCamera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();handCamera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
let frames=0,last=performance.now();
function frame(t:number){
  requestAnimationFrame(frame);const firstPerson=pose!=='braid';camera.fov=pose==='wide'?145:110;camera.updateProjectionMatrix();
  camera.position.set(1180,42,1170);camera.lookAt(1200,24,1000);
  if(pose==='up')camera.rotation.x=1.30;if(pose==='down')camera.rotation.x=-1.30;if(pose==='turn')camera.rotation.y=Math.PI*.7;
  if(!firstPerson){camera.fov=50;camera.updateProjectionMatrix();camera.position.set(1170,52,1090);camera.lookAt(1200,26,1115);}
  handCamera.position.copy(camera.position);handCamera.quaternion.copy(camera.quaternion);
  const rope=snapshot.friends!.hauling!.ropes[0];rope.length=slack?260:180;rope.tension=slack?0:.8;
  visuals.update(snapshot,'host',5,t,project,firstPerson);
  renderer.autoClear=true;renderer.render(scene,camera);const worldTriangles=renderer.info.render.triangles,worldCalls=renderer.info.render.calls;
  if(firstPerson){renderer.autoClear=false;renderer.clearDepth();renderer.render(viewmodel,handCamera);renderer.autoClear=true;}
  frames++;if(t-last>1000){document.getElementById('stats')!.textContent=`${Math.round(frames*1000/(t-last))} FPS · ${worldCalls} world draws · ${worldTriangles.toLocaleString()} triangles`;last=t;frames=0;}
}
requestAnimationFrame(frame);
