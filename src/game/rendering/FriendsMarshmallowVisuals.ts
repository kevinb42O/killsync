import { cookingFireFor,isRoastingSeat } from '../world/FriendsCookingFires';
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createCampfireFlames } from './FriendsCampfire';
import { acquireEquipmentLighting, loadFriendsGrip } from './FriendsHeldEquipment';
import { loadFriendsAsset } from './FriendsAssets';
import { CAMPFIRE_SEATS, isCampfireSeat } from '../multiplayer/FriendsCampfireSeats';
import { MARSHMALLOW_FORWARD_REACH, type CampfireSnapshot } from '../multiplayer/FriendsCampfireSimulation';
import type { CoopPlayerSnapshot } from '../multiplayer/CoopSimulation';
import { FRIENDS_CAMPFIRE } from '../world/FriendsRegion';

type RoastSurface={toast:{value:number};char:{value:number}};
type Stick={group:THREE.Group;rod:THREE.Mesh;food:THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;surface:RoastSurface;fire:THREE.Mesh;pose:number;eatPose:number;arm?:THREE.Mesh;armRequested?:boolean};
const UP=new THREE.Vector3(0,1,0);
const surfaceNoise=`
float mHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float mNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(mHash(i),mHash(i+vec3(1,0,0)),f.x),mix(mHash(i+vec3(0,1,0)),mHash(i+vec3(1,1,0)),f.x),f.y),
mix(mix(mHash(i+vec3(0,0,1)),mHash(i+vec3(1,0,1)),f.x),mix(mHash(i+vec3(0,1,1)),mHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
`;

/** A soft, slightly uneven barrel with rolled edges instead of flat cylinder
 * caps. One immutable geometry serves every roast and every cooking stage. */
export function createMarshmallowGeometry(){
  const profile=[[0,-5.25],[3.3,-5.25],[4.25,-5.02],[4.8,-4.45],[5.0,-3.6],[5.15,-1.8],[5.2,0],[5.1,2.1],[4.95,3.6],[4.7,4.45],[4.15,5.02],[3.2,5.25],[0,5.25]];
  const geometry=new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),24),p=geometry.getAttribute('position');
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),angle=Math.atan2(x,z);
    const swell=1+.018*Math.sin(angle*3+y*.32)+.012*Math.cos(angle*5-y*.45);
    p.setXYZ(i,x*swell,y+.11*Math.sin(x*.5+z*.7)*(1-Math.abs(y)/5.4),z*swell);
  }
  geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}

export function createMarshmallowMaterial(surface:RoastSurface){
  const material=new THREE.MeshStandardMaterial({color:0xfff7e7,roughness:.88,metalness:0});
  material.onBeforeCompile=shader=>{
    shader.uniforms.roastToast=surface.toast;shader.uniforms.roastChar=surface.char;
    shader.vertexShader='varying vec3 marshmallowPosition;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nmarshmallowPosition=position;');
    shader.fragmentShader='varying vec3 marshmallowPosition;uniform float roastToast;uniform float roastChar;\n'+surfaceNoise+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec3 mp=marshmallowPosition;
      float mottling=.72*mNoise(mp*.48)+.28*mNoise(mp*1.6+vec3(8.));
      float pores=mNoise(mp*7.5);
      float exposure=clamp(mottling+.09*sin(mp.y*.5)-.07*mp.z/5.,0.,1.);
      float toasted=smoothstep(.08+exposure*.35,.43+exposure*.48,roastToast);
      float darkened=smoothstep(.48+exposure*.19,.85+exposure*.14,roastToast);
      float burnt=max(roastChar,smoothstep(.86+exposure*.08,1.02,roastToast));
      vec3 cream=diffuseColor.rgb*(.965+.035*pores);
      vec3 caramel=mix(vec3(.68,.33,.095),vec3(.27,.087,.023),darkened);
      diffuseColor.rgb=mix(cream,caramel,toasted);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.032,.018,.012)*(.8+.4*pores),burnt);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*.045;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(.88,.65,clamp(roastToast,0.,.8))* (1.-.04*mNoise(marshmallowPosition*4.));');
  };
  material.customProgramCacheKey=()=> 'pillowy-roasted-marshmallow-v2';return material;
}

/** Preserve the world-space roasting pose, but project the local stick into
 * the existing depth-cleared equipment pass so scenery cannot cut through it.
 * Peers retain ordinary world depth and the same shared geometry. */
export class FriendsMarshmallowVisuals {
  readonly group=new THREE.Group();
  readonly held=new THREE.Group();
  private viewCamera?:THREE.PerspectiveCamera;
  private lighting?:ReturnType<typeof acquireEquipmentLighting>;
  private actors=new Map<string,Stick>();
  private roastSpots=new Map<string,number>();
  private rodGeometry:THREE.BufferGeometry=new THREE.CylinderGeometry(.58,.95,1,8).translate(0,.5,0);
  private foodGeometry=createMarshmallowGeometry();
  private wood=new THREE.MeshStandardMaterial({color:0x715039,roughness:.94});
  private time={value:0};
  private flameMaterial=createCampfireFlames(this.time);
  private flameGeometry:THREE.BufferGeometry;
  private start=new THREE.Vector3();
  private target=new THREE.Vector3();
  private rest=new THREE.Vector3();
  private mouth=new THREE.Vector3();
  private delta=new THREE.Vector3();
  private forward=new THREE.Vector3();
  private right=new THREE.Vector3();
  private side=new THREE.Vector3();
  private normal=new THREE.Vector3();
  private matrix=new THREE.Matrix4();
  private quaternion=new THREE.Quaternion();
  private cameraQuaternion=new THREE.Quaternion();
  private cameraPosition=new THREE.Vector3();
  private disposed=false;
  constructor(scene:THREE.Scene,viewmodel?:THREE.Scene){
    this.group.name='campfire-marshmallow-sticks';scene.add(this.group);
    this.held.name='held-marshmallow-stick';this.held.matrixAutoUpdate=false;
    if(viewmodel){
      const parent=viewmodel.getObjectByProperty('type','PerspectiveCamera')||viewmodel;
      if(parent instanceof THREE.PerspectiveCamera)this.viewCamera=parent;
      parent.add(this.held);this.lighting=acquireEquipmentLighting(viewmodel);
    }
    const planes:THREE.BufferGeometry[]=[];
    for(let i=0;i<3;i++){const g=new THREE.PlaneGeometry(15,24,1,3);g.translate(0,12,0);g.rotateY(i*Math.PI/3);planes.push(g);}
    this.flameGeometry=mergeGeometries(planes);planes.forEach(g=>g.dispose());
    this.wood.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec3 skewerPosition;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nskewerPosition=position;');
      shader.fragmentShader='varying vec3 skewerPosition;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float fibres=sin(skewerPosition.x*38.+skewerPosition.z*24.+sin(skewerPosition.y*18.)*1.7);
        float fineGrain=sin(skewerPosition.x*105.+skewerPosition.z*72.+skewerPosition.y*6.);
        float tip=smoothstep(.87,.99,skewerPosition.y);
        diffuseColor.rgb*=.91+.065*fibres+.025*fineGrain;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.26,.105,.033),tip*.45);`);
    };
    this.wood.customProgramCacheKey=()=> 'kenney-roasting-twig-grain';
    // Preserve the downloaded branching geometry, fit it once, and share one
    // small buffer across the crew. The primitive remains a load-error fallback.
    void loadFriendsAsset('roastingTwig').then(source=>{
      if(this.disposed)return;
      source.updateMatrixWorld(true);const parts:THREE.BufferGeometry[]=[];
      source.traverse(o=>{if(o instanceof THREE.Mesh){const g=o.geometry.clone();g.applyMatrix4(o.matrixWorld);g.rotateY(Math.PI/4);g.rotateX(Math.PI/2);parts.push(g.index?g.toNonIndexed():g);if(g.index)g.dispose();}});
      if(!parts.length)return;
      const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());geometry.computeBoundingBox();
      const bounds=geometry.boundingBox!,size=bounds.getSize(new THREE.Vector3());geometry.translate(-(bounds.min.x+bounds.max.x)/2,-bounds.min.y,-(bounds.min.z+bounds.max.z)/2);
      geometry.scale(1.65/Math.max(.001,size.x),1/Math.max(.001,size.y),1.50/Math.max(.001,size.z));
      geometry.deleteAttribute('normal');const smooth=mergeVertices(geometry);geometry.dispose();smooth.computeVertexNormals();smooth.computeBoundingSphere();
      const old=this.rodGeometry;this.rodGeometry=smooth;for(const entry of this.actors.values())entry.rod.geometry=smooth;old.dispose();
    }).catch(()=>{});
    void loadFriendsGrip('right').catch(()=>{});
  }
  private create(id:string):Stick{
    const group=new THREE.Group();group.name=`marshmallow-stick-${id}`;
    const rod=new THREE.Mesh(this.rodGeometry,this.wood);rod.name='long-roasting-stick';
    const surface={toast:{value:0},char:{value:0}},food=new THREE.Mesh(this.foodGeometry,createMarshmallowMaterial(surface));food.name='toasting-marshmallow';
    const fire=new THREE.Mesh(this.flameGeometry,this.flameMaterial);fire.name='burning-marshmallow-flames';fire.visible=false;
    group.add(rod,food,fire);this.group.add(group);
    const entry:Stick={group,rod,food,surface,fire,pose:0,eatPose:0};this.actors.set(id,entry);return entry;
  }
  private assignRoastSpots(players:readonly CoopPlayerSnapshot[]){
    this.roastSpots.clear();const used=new Set<number>();
    const nearby=players.filter(p=>p.lifeState==='alive'&&Math.abs(p.z-FRIENDS_CAMPFIRE.z)<64&&Math.hypot(p.x-FRIENDS_CAMPFIRE.x,p.y-FRIENDS_CAMPFIRE.y)<160);
    // Chairs keep fixed targets even when someone starts or stops roasting.
    for(const p of nearby)if(isCampfireSeat(p.friendsSeat)&&CAMPFIRE_SEATS[p.friendsSeat!.index]){this.roastSpots.set(p.id,p.friendsSeat!.index);used.add(p.friendsSeat!.index);}
    for(const p of nearby.filter(p=>!this.roastSpots.has(p.id)).sort((a,b)=>a.id.localeCompare(b.id))){
      const angle=Math.atan2(p.y-FRIENDS_CAMPFIRE.y,p.x-FRIENDS_CAMPFIRE.x);let slot=-1,best=-Infinity;
      for(let i=0;i<CAMPFIRE_SEATS.length;i++)if(!used.has(i)){const alignment=Math.cos(angle-CAMPFIRE_SEATS[i].angle);if(alignment>best){best=alignment;slot=i;}}
      if(slot>=0){this.roastSpots.set(p.id,slot);used.add(slot);}
    }
  }
  update(players:readonly CoopPlayerSnapshot[],state:CampfireSnapshot|undefined,localId:string,camera:THREE.Camera,seconds:number,dt:number,firstPerson=true,handPoint?:(id:string,out:THREE.Vector3)=>boolean,localRoastHeld?:boolean){
    if(this.disposed)return;
    this.time.value=seconds;camera.getWorldPosition(this.cameraPosition);camera.getWorldQuaternion(this.cameraQuaternion);
    if(this.viewCamera){
      camera.updateWorldMatrix(true,false);
      const worldTangent=camera instanceof THREE.PerspectiveCamera?Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()/2)):1.38;
      const viewTangent=Math.tan(THREE.MathUtils.degToRad(this.viewCamera.getEffectiveFOV()/2));
      const ratio=viewTangent/worldTangent,worldAspect=camera instanceof THREE.PerspectiveCamera?camera.aspect:this.viewCamera.aspect;
      // Transform world coordinates into camera-relative equipment coordinates.
      // The projection ratio preserves every screen position and fire alignment.
      this.held.matrix.makeScale(.01*ratio*this.viewCamera.aspect/worldAspect,.01*ratio,.01).multiply(camera.matrixWorldInverse);
      this.held.matrixWorldNeedsUpdate=true;
    }
    this.assignRoastSpots(players);let localVisible=false;
    for(const entry of this.actors.values())entry.group.visible=false;
    for(const player of players){
      if(!(state?.equipped?state.equipped.includes(player.id):isRoastingSeat(player.friendsSeat))||player.lifeState!=='alive'||player.friendsDevFlight||player.motion?.swimming)continue;
      if(Math.hypot(this.cameraPosition.x-player.x,this.cameraPosition.z-player.y)>800)continue;
      const entry=this.actors.get(player.id)??this.create(player.id),roast=state?.roasts[player.id],local=firstPerson&&player.id===localId;
      const seated=isRoastingSeat(player.friendsSeat);
      const reaching=(local?(localRoastHeld??Boolean(roast?.reach||roast?.roasting)):Boolean(roast?.reach||roast?.roasting))&&!roast?.eatingMs&&!roast?.refillMs;
      entry.pose+=(Number(reaching)-entry.pose)*(1-Math.exp(-Math.max(0,dt)*.009));
      const parent=local&&this.viewCamera?this.held:this.group;if(entry.group.parent!==parent)parent.add(entry.group);
      if(local)localVisible=true;
      if(local&&!entry.armRequested){
        entry.armRequested=true;
        void loadFriendsGrip('right').then(source=>{
          if(this.disposed||this.actors.get(player.id)!==entry)return;
          entry.arm=source.clone();entry.arm.name='marshmallow-holding-hand';entry.arm.scale.setScalar(32);entry.arm.quaternion.copy(entry.rod.quaternion);entry.group.add(entry.arm);
        }).catch(()=>{});
      }
      if(local){
        const tangent=camera instanceof THREE.PerspectiveCamera?Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()/2)):1.38;
        const aspect=camera instanceof THREE.PerspectiveCamera?camera.aspect:16/9;
        // Fixed normalized screen grip; the high world FOV cannot lift it into
        // the centre of the view or detach the forearm from the screen edge.
        this.start.set(.48*24*tangent*aspect,-.64*24*tangent,-24).applyQuaternion(this.cameraQuaternion).add(this.cameraPosition);
        this.forward.set(0,0,-1).applyQuaternion(this.cameraQuaternion);this.right.set(1,0,0).applyQuaternion(this.cameraQuaternion);
        if(!seated){
          // Push the grip forward and inward with the arm instead of merely
          // swinging a growing shaft toward a fixed campfire target.
          this.start.addScaledVector(this.forward,12*entry.pose).addScaledVector(this.right,-.16*24*tangent*aspect*entry.pose);
        }
      }else{
        if(!handPoint?.(player.id,this.start))this.start.set(player.x-Math.sin(player.angle)*8,player.z+18,player.y+Math.cos(player.angle)*8);
        this.forward.set(Math.cos(player.angle),0,Math.sin(player.angle));this.right.set(-Math.sin(player.angle),0,Math.cos(player.angle));
      }
      this.rest.copy(this.start).addScaledVector(this.forward,64).addScaledVector(this.right,-9);this.rest.y+=40;
      const fire=cookingFireFor(player);
      this.target.set(fire?.x??player.x,fire?fire.z+48*fire.scale:player.z+40,fire?.y??player.y);
      if(seated&&fire&&fire.id!==FRIENDS_CAMPFIRE.id){
        const a=Math.atan2(player.y-fire.y,player.x-fire.x);this.target.x+=Math.cos(a)*6;this.target.z+=Math.sin(a)*6;
      }
      const slot=this.roastSpots.get(player.id);
      if(seated&&slot!==undefined){const angle=CAMPFIRE_SEATS[slot].angle;this.target.x+=Math.cos(angle)*23;this.target.z+=Math.sin(angle)*23;}
      if(!seated){
        if(local)this.target.copy(this.cameraPosition).addScaledVector(this.forward,MARSHMALLOW_FORWARD_REACH);
        else if(roast?.reach)this.target.set(roast.reach.x,roast.reach.z,roast.reach.y);
        else this.target.copy(this.rest);
      }
      // The local stick reaches out as soon as LMB is held. Baking itself is
      // still host-authoritative and only advances when the marshmallow is
      // actually over the fire. Waiting for that accepted state here made the
      // standing stick stay in its raised rest pose while the player tried to
      // move it into the flames.
      this.target.lerpVectors(this.rest,this.target,entry.pose);
      entry.eatPose+=(Number(Boolean(roast?.eatingMs))-entry.eatPose)*(1-Math.exp(-Math.max(0,dt)*.012));
      if(local)this.mouth.set(0,-5,-7).applyQuaternion(this.cameraQuaternion).add(this.cameraPosition);
      else this.mouth.set(player.x+Math.cos(player.angle)*5,player.z+28,player.y+Math.sin(player.angle)*5);
      this.target.lerp(this.mouth,entry.eatPose);this.delta.copy(this.target).sub(this.start);
      const length=this.delta.length();entry.group.visible=true;entry.group.position.copy(this.start);
      this.forward.copy(this.delta).normalize();this.side.copy(this.right).addScaledVector(this.forward,-this.right.dot(this.forward));
      if(this.side.lengthSq()<.001)this.side.copy(UP).addScaledVector(this.forward,-UP.dot(this.forward));
      this.side.normalize();this.normal.crossVectors(this.side,this.forward).normalize();
      this.matrix.makeBasis(this.side,this.forward,this.normal);this.quaternion.setFromRotationMatrix(this.matrix);
      // The shaft goes through the fingers and slightly through the far cap.
      entry.rod.position.copy(this.forward).multiplyScalar(-12);entry.rod.scale.y=length+19.25;entry.rod.quaternion.copy(this.quaternion);
      if(entry.arm){entry.arm.visible=local;entry.arm.quaternion.copy(local&&!seated?this.cameraQuaternion:this.quaternion);}
      entry.food.position.copy(this.delta);entry.food.quaternion.copy(this.quaternion);entry.food.rotateY(seconds*.24);
      entry.food.visible=!roast?.refillMs&&(!roast?.eatingMs||roast.eatingMs>500);
      entry.fire.position.copy(this.delta);entry.fire.position.y+=2;entry.fire.visible=Boolean(roast&&roast.burningMs>0);
      entry.surface.toast.value=roast?.toast??0;entry.surface.char.value=roast?.charred ? 1 : entry.fire.visible ? .72 : 0;
      entry.food.material.emissive.setHex(entry.fire.visible?0x371302:0);entry.food.material.emissiveIntensity=.3;
      const shrink=roast?.charred ? 1.1 : 1.25;entry.food.scale.set(shrink,shrink,shrink);
    }
    for(const [id,entry]of this.actors)if(!players.some(p=>p.id===id&&p.lifeState==='alive')){
      entry.group.removeFromParent();entry.food.material.dispose();this.actors.delete(id);
    }
    this.held.visible=localVisible;this.lighting?.setVisible(localVisible);
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;
    for(const entry of this.actors.values())entry.food.material.dispose();this.actors.clear();
    this.rodGeometry.dispose();this.foodGeometry.dispose();this.flameGeometry.dispose();this.wood.dispose();this.flameMaterial.dispose();this.group.removeFromParent();this.held.removeFromParent();this.lighting?.dispose();
  }
}
