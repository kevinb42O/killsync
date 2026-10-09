import * as THREE from 'three';
import { FriendsDynamiteVisuals } from '../src/game/rendering/FriendsDynamiteVisuals';
import { friendsAudio } from '../src/game/FriendsAudio';
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(devicePixelRatio);document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#26343a');scene.add(new THREE.HemisphereLight('#fff0d4','#374139',3));
const sun=new THREE.DirectionalLight('#fff4d8',3);sun.position.set(100,300,200);scene.add(sun);
const camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,1,2000);camera.position.set(280,205,310);camera.lookAt(0,35,0);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),new THREE.MeshStandardMaterial({color:'#63745b',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.1;scene.add(floor);
const blocks:THREE.Mesh[]=[];for(let x=-2;x<=2;x++)for(let y=0;y<3;y++){const b=new THREE.Mesh(new THREE.BoxGeometry(31.8,31.8,31.8),new THREE.MeshStandardMaterial({color:y===2?'#ab9a7c':'#928572',roughness:.95}));b.position.set(x*32,16+y*32,0);scene.add(b);blocks.push(b);}
const visuals=new FriendsDynamiteVisuals(scene);let start=performance.now(),fixed:number|undefined;const charge={id:1,actorId:'host',x:0,y:0,z:102,atMs:0,explodeAtMs:3000};
(window as any).reviewAt=(time:number)=>{fixed=time;};
const releaseAudio=friendsAudio.acquire();window.addEventListener('pagehide',releaseAudio);
document.querySelector('#replay')!.addEventListener('click',()=>{friendsAudio.activate();fixed=undefined;start=performance.now();});
function frame(){requestAnimationFrame(frame);const now=fixed??((performance.now()-start)%6500);for(const b of blocks)b.visible=now<3000;visuals.update({charges:now<3000?[charge]:[],blasts:now>=3000?[{...charge,destroyed:15}]:[]},now,{x:280,y:310,z:205});renderer.render(scene,camera);}frame();
