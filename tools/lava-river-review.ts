import { FriendsAudio } from '../src/game/FriendsAudio';
import { friendsWorldSound } from '../src/game/FriendsWorldSound';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FriendsLavaRiverVisuals } from '../src/game/rendering/FriendsLavaRiverVisuals';
import { FriendsVolcanoGlow } from '../src/game/rendering/FriendsVolcanoGlow';
import { FriendsVolcanoSmoke } from '../src/game/rendering/FriendsVolcanoSmoke';
import { FriendsRetreatVisuals } from '../src/game/rendering/FriendsRetreatVisuals';
import { baseTerrainHeight } from '../src/game/world/FriendsTerrain';
import { LAVA_RIVER_POINTS,LAVA_SEA_ENTRY } from '../src/game/world/FriendsLavaRiver';
import { RETREAT_SITES } from '../src/game/world/FriendsRetreatSites';
import { islandWater } from '../src/game/rendering/FriendsIslandVisuals';
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#647c88');scene.fog=new THREE.Fog('#647c88',15000,38000);scene.add(new THREE.HemisphereLight('#b4c8dc','#44322c',1.8));const sun=new THREE.DirectionalLight('#ffc68c',1.8);sun.position.set(30000,8000,34000);scene.add(sun);
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,1,60000),controls=new OrbitControls(camera,renderer.domElement);
const g=new THREE.PlaneGeometry(14000,15000,280,300);g.rotateX(-Math.PI/2);g.translate(36000,0,38500);const pos=g.getAttribute('position'),colours=[];
for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getZ(i),h=baseTerrainHeight(x,y);pos.setY(i,h);const c=new THREE.Color(h<0?'#554f46':'#57534e');c.multiplyScalar(.85+.15*Math.sin(x*.012)*Math.sin(y*.015));colours.push(c.r,c.g,c.b);}g.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));g.computeVertexNormals();scene.add(new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1})));
const sea=islandWater(36500,40000,17000,17000,-168.5,(x,y)=>-168.5-baseTerrainHeight(x,y),true,320);scene.add(sea);
const river=new FriendsLavaRiverVisuals(),glow=new FriendsVolcanoGlow(),smoke=new FriendsVolcanoSmoke();scene.add(river,glow,smoke);
const retreats=new FriendsRetreatVisuals(scene);retreats.setState({version:1,active:RETREAT_SITES.map(s=>s.id),lightsOn:true,switchSerial:0});
// Crater surface uses the production molten shader via the landmark renderer.
const {FriendsIslandVisuals}=await import('../src/game/rendering/FriendsIslandVisuals');
const coverage=new THREE.DataTexture(new Float32Array(4),1,1,THREE.RGBAFormat,THREE.FloatType);coverage.needsUpdate=true;
const monuments=new FriendsIslandVisuals([0x777777,0x333333,0x886644,0xff8844].map(color=>new THREE.MeshStandardMaterial({color})),coverage,1);
const crater=monuments.getObjectByName('ember-caldera-molten-crater')!;scene.add(crater);
function view(name:string){if(name==='overview'){camera.position.set(44100,10300,44300);controls.target.set(36600,3300,37800);}if(name==='summit'){camera.position.set(41200,8600,36300);controls.target.set(35600,5000,33900);}if(name==='delta'){camera.position.set(40600,950,43100);controls.target.set(38900,220,41900);}if(name==='bench'){camera.position.set(37370,540,40190);controls.target.set(37780,390,40600);}controls.update();}
for(const name of ['overview','summit','delta','bench'])document.getElementById(name)!.onclick=()=>view(name);
const audio=new FriendsAudio();let releaseAudio:(()=>void)|undefined,nextSound=0;
document.getElementById('listen')!.onclick=()=>{releaseAudio??=audio.acquire();audio.activate();nextSound=0;draw();};
document.getElementById('silence')!.onclick=()=>{releaseAudio?.();releaseAudio=undefined;audio.clearSoundscape();};
let seconds=14,paused=false;function draw(){river.update(seconds);glow.update(seconds);smoke.update(seconds);retreats.update(seconds,camera,.55,[1,1,0]);(sea.material as THREE.ShaderMaterial).uniforms.time.value=seconds;renderer.render(scene,camera);if(releaseAudio&&seconds>=nextSound){nextSound=seconds+.5;const direction=camera.getWorldDirection(new THREE.Vector3());audio.setWorldSound(friendsWorldSound({x:LAVA_SEA_ENTRY.x-120,y:LAVA_SEA_ENTRY.y-80,z:LAVA_SEA_ENTRY.z+120},Math.atan2(direction.z,direction.x),false));}}function frame(){requestAnimationFrame(frame);if(!paused){seconds+=1/60;controls.update();draw();}}view('overview');frame();Object.assign(window,{lavaReview:{renderer,scene,camera,river,smoke,audio,view,draw,pause:()=>{paused=true;},points:LAVA_RIVER_POINTS}});

function disposeReviewAudio(){releaseAudio?.();audio.dispose();}addEventListener('beforeunload',disposeReviewAudio);if(import.meta.hot)import.meta.hot.dispose(disposeReviewAudio);
