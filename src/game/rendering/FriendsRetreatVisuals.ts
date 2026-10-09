import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RETREAT_SITES, RETREAT_SEATS, RETREAT_BOXES, STILLWATER, STILLWATER_DOOR, RETREAT_BULB, RETREAT_SWITCH, retreatLocal, type RetreatState } from '../world/FriendsRetreatSites';
import { FriendsCampfire } from './FriendsCampfire';
import { retreatPaths } from '../world/FriendsRetreatPaths';
import { cullInactiveFriendsLights,installRetreatLightBounds } from './FriendsDirectLighting';
import { retreatShellGeometry,retreatPathGeometry } from './FriendsRetreatGeometry';

/** Locally bundled real PBR materials, shared between authored surfaces. */
export class FriendsRetreatVisuals {
  readonly group=new THREE.Group();
  readonly house=new THREE.Group();
  readonly lamp=new THREE.PointLight(0xffc887,0,220,2);
  readonly fill=new THREE.PointLight(0xffd9aa,0,91.25,2);
  readonly windowGlow=new THREE.PointLight(0xffce8b,0,70,2);
  private sites=new Map<string,THREE.Group>();
  private textures=new Set<THREE.Texture>();
  private materials=new Set<THREE.Material>();
  private warm={value:1};
  private daylight={value:1};
  private sun={value:new THREE.Vector3()};
  private bulbMaterials:THREE.MeshStandardMaterial[]=[];
  private rocker:THREE.Mesh;
  private fire:FriendsCampfire;
  private state?:RetreatState;
  private disposed=false;
  private lastSeconds=0;
  constructor(private scene:THREE.Scene){
    installRetreatLightBounds();
    this.group.name='friends-quiet-places';scene.add(this.group);
    const pbr=(id:string,color:number,normal:number,roughness=.9,room=false)=>{
      const loader=new THREE.TextureLoader();
      const load=(kind:string)=>{const t=loader.load(`${import.meta.env.BASE_URL}textures/friends-retreat/${id}_${kind}.jpg`);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;if(kind==='color')t.colorSpace=THREE.SRGBColorSpace;this.textures.add(t);return t;};
      const m=new THREE.MeshStandardMaterial({color,map:load('color'),normalMap:load('normal'),normalScale:new THREE.Vector2(normal,normal),roughnessMap:load('roughness'),roughness});
      this.materials.add(m);if(room)this.roomLighting(m);return m;
    };
    const plaster=pbr('white_plaster_02',0xffffff,.16,1,true);plaster.color.setRGB(1.85,1.95,2.1);
    const oak=pbr('wood_floor',0xfff4df,.4,.85,true);
    const boards=pbr('wood_plank_wall',0xc7af8e,.45,.94);
    const wool=pbr('poly_wool_herringbone',0xffffff,.38,1,true);wool.color.setRGB(1.5,1.9,1.4);
    const trim=boards.clone();this.materials.add(trim);this.roomLighting(trim);
    const glass=new THREE.MeshStandardMaterial({color:0xc9e8e6,transparent:true,opacity:.045,roughness:.18,metalness:0,depthWrite:false});this.materials.add(glass);
    const bronze=new THREE.MeshStandardMaterial({color:0x776044,metalness:.55,roughness:.4});this.materials.add(bronze);

    const batches=new Map<string,{material:THREE.Material;geometries:THREE.BufferGeometry[];group:THREE.Group}>();
    const add=(parent:THREE.Group,m:THREE.Material,w:number,h:number,d:number,x:number,y:number,z:number,tile=18,rounded=0)=>{
      const g=rounded?new RoundedBoxGeometry(w,h,d,3,rounded):new THREE.BoxGeometry(w,h,d);
      const pos=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
      for(let i=0;i<pos.count;i++){
        const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));
        uv.setXY(i,(nx>ny&&nx>nz?pos.getZ(i):pos.getX(i))/tile,(ny>nx&&ny>nz?pos.getZ(i):pos.getY(i))/tile);
      }
      g.translate(x,y,z);const flat=g.index?g.toNonIndexed():g;if(flat!==g)g.dispose();
      const key=`${parent.uuid}:${m.uuid}`,batch=batches.get(key)??{material:m,geometries:[],group:parent};batch.geometries.push(flat);batches.set(key,batch);
    };
    for(const s of RETREAT_SITES){
      const root=s.kind==='house'?this.house:new THREE.Group();root.name=s.id;root.position.set(s.x,s.z,s.y);root.rotation.y=-s.angle;this.group.add(root);this.sites.set(s.id,root);
      if(s.kind==='house'){
        const shell=new THREE.Mesh(retreatShellGeometry(s,RETREAT_BOXES.filter(b=>b.siteId===s.id)),[oak,plaster,boards]);
        shell.name='stillwater-house-shell';shell.castShadow=true;shell.receiveShadow=true;root.add(shell);
      }
      for(const b of RETREAT_BOXES.filter(b=>b.siteId===s.id)){
        if(s.kind==='house'||b.surface==='couch'||b.surface==='glass')continue;
        const p=retreatLocal(s,b),h=b.z-s.z+b.h/2;
        add(root,b.surface==='floor'?boards:plaster,b.w,b.h,b.d,p.u,h,p.v,b.surface==='floor'?20.4:18);
      }
      // Foundation posts support the terrace rather than flattening the hillside.
      for(const u of [-s.w/2+5,s.w/2-5])for(const v of [-s.d/2+5,s.d/2-5])add(root,boards,5,64,5,u,-40,v,12);
      const path=retreatPaths().find(p=>p.siteId===s.id)!;
      for(let i=1;i<path.points.length;i++){
        const a=path.points[i-1];
        if(i%12===0&&a.z-a.ground>12){const q=retreatLocal(s,a);add(root,boards,4,a.z-a.ground-5,4,q.u,(a.z-5+a.ground)/2-s.z,q.v,12);}
      }
      const pathMesh=new THREE.Mesh(retreatPathGeometry(s,path),boards);pathMesh.name=`${s.id}-approach`;pathMesh.receiveShadow=true;root.add(pathMesh);
      const seats=RETREAT_SEATS.filter(p=>p.siteId===s.id);
      if(s.kind!=='house'){
        const pairs=s.kind==='bench'?[{u:0,v:12,w:68}]:[{u:-15,v:35,w:68},{u:42,v:0,w:29},{u:-44,v:0,w:29},{u:0,v:-43,w:29}];
        if(s.kind==='bench')for(const p of pairs){
          add(root,boards,p.w,5,17,p.u,14,p.v,12,1);add(root,boards,p.w,16,4,p.u,26,p.v+10,12,1);
          for(const u of [-p.w/2+6,p.w/2-6])add(root,boards,4,12,12,p.u+u,6,p.v,12);
        }
        else for(const seat of seats){
          const q=retreatLocal(s,seat);add(root,boards,25,5,21,q.u,14,q.v,12,1);
          for(const u of [-8,8])add(root,boards,4,12,4,q.u+u,6,q.v,12);
        }
      }
    }
    // Solid couch with separate softly rounded cushions and visible seams.
    add(this.house,wool,112,8,28,0,10,30,3.6,2);
    for(const u of [-34,0,34]){add(this.house,wool,32,7,24,u,18,28,3.6,2);add(this.house,wool,32,23,8,u,29,43,3.6,2);}
    for(const u of [-54,54])add(this.house,wool,7,18,29,u,21,30,3.6,2);
    for(const u of [-46,46])for(const v of [20,40])add(this.house,trim,4,6,4,u,3,v,12);
    // Open picture and side windows; their near-invisible glass is a solid collider.
    const frontGlass=new THREE.Mesh(new THREE.PlaneGeometry(124,46),glass);frontGlass.position.set(0,37,-56);frontGlass.material.side=THREE.DoubleSide;this.house.add(frontGlass);
    const sideGlass=new THREE.Mesh(new THREE.PlaneGeometry(56,46),glass);sideGlass.rotation.y=Math.PI/2;sideGlass.position.set(72,37,0);this.house.add(sideGlass);
    for(const y of [13,61]){add(this.house,trim,136,3,10,0,y,-56,12);add(this.house,trim,10,3,62,72,y,0,12);}
    for(const u of [-63,63])add(this.house,trim,3,45,10,u,37,-56,12);
    for(const v of [-29,29])add(this.house,trim,10,45,3,72,37,v,12);
    // One bare incandescent bulb, suspended from an exposed black cord.
    const cord=new THREE.MeshStandardMaterial({color:0x211e19,roughness:.8});this.materials.add(cord);this.roomLighting(cord);
    const cable=new THREE.Mesh(new THREE.CylinderGeometry(.35,.35,10.5,10),cord);cable.name='stillwater-hanging-wire';cable.position.set(0,70.25,-8);this.house.add(cable);
    const canopy=new THREE.Mesh(new THREE.CylinderGeometry(2.2,2.2,1.2,16),cord);canopy.position.set(0,75.1,-8);this.house.add(canopy);
    const socket=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.4,2.4,16),bronze);socket.name='stillwater-bulb-socket';socket.position.set(0,65.7,-8);this.house.add(socket);
    void new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/friends/retreat-bulb/lightbulb_01_1k.gltf`).then(gltf=>{
      const model=gltf.scene;model.name='stillwater-online-lightbulb';model.rotation.z=Math.PI;model.scale.setScalar(60);model.position.set(0,65,-8);
      model.traverse(o=>{
        if(!(o instanceof THREE.Mesh))return;
        const original=o.material as THREE.MeshStandardMaterial,m=new THREE.MeshStandardMaterial().copy(original);original.dispose();o.material=m;
        if(m.name.includes('glass')){
          m.transparent=true;m.opacity=.24+.6*this.warm.value;m.depthWrite=false;m.roughness=.12;m.metalness=.05;
          // The imported emission texture only covers the internal filament.
          // Give the glass envelope its own warm glow so the visible bulb reads
          // as the source of the room light, including at normal viewing distance.
          m.emissiveMap=null;
        }
        m.emissive.set(0xffb65a);m.emissiveIntensity=this.warm.value*5;this.bulbMaterials.push(m);
        this.roomLighting(m);this.materials.add(m);for(const v of Object.values(m))if(v instanceof THREE.Texture)this.textures.add(v);
        o.castShadow=false;o.receiveShadow=true;
      });
      if(this.disposed){model.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});this.materials.forEach(m=>m.dispose());this.textures.forEach(t=>t.dispose());return;}
      this.house.add(model);
    }).catch(error=>console.error('Stillwater bulb model failed to load',error));
    // Jambs sit beside the opening, preserving the full collision clearance.
    for(const side of [-1,1])add(this.house,trim,2,STILLWATER_DOOR.height,2,-69,STILLWATER_DOOR.height/2,STILLWATER_DOOR.v+side*(STILLWATER_DOOR.width/2+1));
    add(this.house,trim,2,2,STILLWATER_DOOR.width+4,-69,STILLWATER_DOOR.height+1,STILLWATER_DOOR.v);
    // Thin plate and physically moving rocker face into the room.
    const plate=new THREE.MeshStandardMaterial({color:0xf4ead8,roughness:.5});this.materials.add(plate);this.roomLighting(plate);
    const switchPosition=retreatLocal(STILLWATER,RETREAT_SWITCH);
    add(this.house,plate,1.6,12,8,-69,28,switchPosition.v,18,.4);
    add(this.house,bronze,1.8,8.8,4.8,-68.4,28,switchPosition.v);
    this.rocker=new THREE.Mesh(new RoundedBoxGeometry(2.4,7.6,4.0,2,.4),new THREE.MeshStandardMaterial({color:0xeee3d1,roughness:.7}));
    this.materials.add(this.rocker.material as THREE.Material);this.rocker.name='stillwater-light-switch';this.rocker.position.set(-67.1,28,switchPosition.v);this.roomLighting(this.rocker.material as THREE.MeshStandardMaterial);this.house.add(this.rocker);
    for(const {material,geometries,group} of batches.values()){
      const g=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());if(!g)continue;
      const mesh=new THREE.Mesh(g,material);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
    }
    this.lamp.name='stillwater-hanging-bulb-light';this.lamp.position.set(RETREAT_BULB.x,RETREAT_BULB.z,RETREAT_BULB.y);
    // The world already reaches the 16-sampler limit with terrain and crew
    // flashlights. Room furniture uses analytic occlusion below, avoiding one
    // additional native shadow sampler in every world material.
    this.lamp.castShadow=false;this.lamp.shadow.mapSize.set(512,512);this.lamp.shadow.bias=-.001;this.lamp.shadow.normalBias=.6;
    this.lamp.shadow.camera.near=2;this.lamp.shadow.camera.far=220;this.lamp.shadow.autoUpdate=false;
    this.fill.position.set(STILLWATER.x,STILLWATER.z+35,STILLWATER.y);
    const glow=new THREE.Vector3(0,37,-53).applyAxisAngle(new THREE.Vector3(0,1,0),-STILLWATER.angle);
    this.windowGlow.position.set(STILLWATER.x+glow.x,STILLWATER.z+glow.y,STILLWATER.y+glow.z);
    scene.add(this.lamp,this.fill,this.windowGlow);
    const camp=RETREAT_SITES.find(s=>s.kind==='fire')!;
    // A second instance uses the same renderer, with a small baseline fire and no roasting UI.
    this.fire=new FriendsCampfire(scene,{id:camp.id,x:camp.x,y:camp.y,z:camp.z,scale:.27,seats:false});
    this.fire.group.position.copy(this.sites.get(camp.id)!.position);
  }
  private roomLighting(m:THREE.MeshStandardMaterial){
    m.onBeforeCompile=shader=>{
      shader.uniforms.retreatWarm=this.warm;shader.uniforms.retreatDay=this.daylight;shader.uniforms.retreatSun=this.sun;
      shader.vertexShader='varying vec3 retreatP;\n'+shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
        vec3 rw=(modelMatrix*vec4(transformed,1.)).xyz-vec3(${STILLWATER.x},${STILLWATER.z},${STILLWATER.y});
        retreatP=vec3(${Math.cos(STILLWATER.angle)}*rw.x+${Math.sin(STILLWATER.angle)}*rw.z,rw.y,${-Math.sin(STILLWATER.angle)}*rw.x+${Math.cos(STILLWATER.angle)}*rw.z);`);
      const sunGate=`{float gate=0.;
        if(retreatSun.z<-.001){float t=(-56.-retreatP.z)/retreatSun.z;vec3 hit=retreatP+retreatSun*t;if(t>0.&&abs(hit.x)<62.&&hit.y>14.&&hit.y<60.)gate=1.;}
        if(retreatSun.x>.001){float t=(72.-retreatP.x)/retreatSun.x;vec3 hit=retreatP+retreatSun*t;if(t>0.&&abs(hit.z)<28.&&hit.y>14.&&hit.y<60.)gate=1.;}
        directLight.color*=gate;}`;
      shader.fragmentShader=`varying vec3 retreatP;uniform float retreatWarm;uniform float retreatDay;uniform vec3 retreatSun;
        float retreatSofaShadow(vec3 p){
          vec3 ray=vec3(0.,62.,-8.)-p;
          vec3 inverseRay=1./(ray+vec3(.0001));
          vec3 a=(vec3(-56.,0.,15.)-p)*inverseRay,b=(vec3(56.,38.,47.)-p)*inverseRay;
          vec3 low=min(a,b),high=max(a,b);
          float enter=max(max(low.x,low.y),low.z),leave=min(min(high.x,high.y),high.z);
          return leave>max(.002,enter)&&enter<.998?.20:1.;
        }
      `+shader.fragmentShader
        .replace('#include <lights_fragment_begin>',cullInactiveFriendsLights(THREE.ShaderChunk.lights_fragment_begin)
          .replace('getDirectionalLightInfo( directionalLight, directLight );','getDirectionalLightInfo( directionalLight, directLight );'+sunGate)
          .replace('getPointLightInfo( pointLight, geometryPosition, directLight );','getPointLightInfo( pointLight, geometryPosition, directLight );if(pointLight.distance==220.)directLight.color*=retreatSofaShadow(retreatP);'))
        .replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
          reflectedLight.indirectDiffuse*=.065;reflectedLight.indirectSpecular*=.12;
          float windowFill=.04+.42*retreatDay;
          float edge=clamp((76.-retreatP.y)/65.,.15,1.);
          reflectedLight.indirectDiffuse+=diffuseColor.rgb*(vec3(.50,.63,.78)*windowFill+vec3(.50,.38,.24)*retreatWarm)*edge*mix(.7,1.,retreatSofaShadow(retreatP));`);
    };
    m.customProgramCacheKey=()=> 'stillwater-room-lighting-v1';m.fog=false;
  }
  setState(state:RetreatState|undefined){if(state&&!this.state)this.warm.value=Number(state.lightsOn);this.state=state;}
  update(seconds:number,camera:THREE.Camera,daylight:number,sunDirection:readonly number[],_players:readonly {x:number;y:number;z:number}[]=[]){
    const dt=Math.max(0,Math.min(.1,seconds-this.lastSeconds));this.lastSeconds=seconds;
    const active=this.state?.active??[];for(const [id,g]of this.sites)g.visible=active.includes(id as any);
    const near=camera.position.distanceToSquared(this.lamp.position)<800*800,on=active.includes(STILLWATER.id)&&Boolean(this.state?.lightsOn);
    this.warm.value+=(Number(on)-this.warm.value)*(1-Math.exp(-dt/.045));this.daylight.value=daylight;
    this.sun.value.set(sunDirection[0],sunDirection[1],sunDirection[2]).applyAxisAngle(new THREE.Vector3(0,1,0),STILLWATER.angle);
    this.rocker.rotation.z=on?-.17:.17;for(const m of this.bulbMaterials){
      m.emissiveIntensity=this.warm.value*5;
      if(m.name.includes('glass'))m.opacity=.24+.6*this.warm.value;
    }
    this.lamp.intensity=near?this.warm.value*3400:0;this.fill.intensity=near?this.warm.value*180:0;this.windowGlow.intensity=near?this.warm.value*130:0;
    this.fire.update(seconds,camera,daylight,active.includes('saltwind-camp'));
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;
    this.group.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});
    this.materials.forEach(m=>m.dispose());this.textures.forEach(t=>t.dispose());this.fire.dispose();
    this.group.removeFromParent();for(const o of [this.lamp,this.fill,this.windowGlow])o.removeFromParent();this.lamp.dispose();
  }
}
