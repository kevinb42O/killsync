import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FRIENDS_CAMPFIRE } from '../world/FriendsRegion';
import { campfireHeat, type CampfireSnapshot } from '../multiplayer/FriendsCampfireSimulation';
import { CAMPFIRE_SEATS } from '../multiplayer/FriendsCampfireSeats';

const noise = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
`;

export function createCampfireFlames(time:{value:number}){
  return new THREE.ShaderMaterial({uniforms:{time},transparent:true,depthWrite:false,side:THREE.DoubleSide,
      vertexShader:`uniform float time;varying vec2 p;void main(){p=uv;vec3 v=position;v.x+=sin(time*2.8+uv.y*9.)*uv.y*uv.y*4.;gl_Position=projectionMatrix*modelViewMatrix*vec4(v,1.);}`,
      fragmentShader:`uniform float time;varying vec2 p;${noise}
      void main(){float y=p.y;vec2 flow=vec2(p.x*5.,y*4.-time*1.5);
      float n=noise(flow)+.38*noise(flow*2.1+vec2(3.,-time*.6));
      float bend=sin(y*8.-time*2.3)*y*.13+(noise(vec2(y*3.-time,7.))-.5)*y*.22;
      float width=(1.-y)*(.22+.14*n);float edge=width-abs(p.x-.5-bend);
      float density=smoothstep(-.045,.09,edge)*(1.-smoothstep(.12,1.,y))*smoothstep(0.,.06,y);
      float tongues=noise(vec2(p.x*13.+sin(y*9.-time*3.)*.6,y*6.-time*2.4));
      density*=smoothstep(.25,.88,n+(1.-y)*.6)*smoothstep(.2,.62,tongues+(1.-y)*.3);
      float core=smoothstep(.015,.21,edge)*(1.-smoothstep(.12,.48,y));
      vec3 color=mix(vec3(1.65,.15,.012),vec3(2.5,1.0,.12),clamp((1.-y)*.72+n*.17,0.,1.));
      color=mix(color,vec3(3.1,2.1,.75),core);
      gl_FragColor=vec4(color,density*.86);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`});
}

/** Fixed geometry, GPU animation and one unshadowed lamp: no particle spawning,
 * per-frame buffers, lights per ember, bloom pass, or shadow cube render. */
export class FriendsCampfire {
  readonly group = new THREE.Group();
  readonly light = new THREE.PointLight(0xff9c48, 65_000, 440, 2);
  private time = {value:0};
  private flame:THREE.Mesh;
  private sparks:THREE.Points;
  private disposed=false;
  private renderedDrawCalls=0;
  private fuel=0;
  private size=1;
  private spatialScale=1;
  setState(state:CampfireSnapshot|undefined){this.fuel=state?.fuelSeconds??0;}
  constructor(scene:THREE.Scene,options?:{id:string;x:number;y:number;z:number;scale:number;seats:boolean}){
    const camp=options??FRIENDS_CAMPFIRE;
    if(options){this.spatialScale=options.scale;this.group.scale.setScalar(options.scale);this.light.distance*=options.scale;}
    this.group.name='commons-campfire-gathering';this.group.position.set(camp.x,camp.z,camp.y);scene.add(this.group);
    this.light.name=camp.id+'-light';this.light.position.set(camp.x,camp.z+48*this.spatialScale,camp.y);
    this.light.castShadow=false;scene.add(this.light);
    const wood=new THREE.MeshStandardMaterial({color:0x614431,roughness:.96});
    wood.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec3 timberPosition;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntimberPosition=position;');
      shader.fragmentShader='varying vec3 timberPosition;\n'+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat grain=sin(timberPosition.y*2.4+sin(timberPosition.x*.3+timberPosition.z*.3)*2.);diffuseColor.rgb*=.88+.12*grain;');
    };
    wood.customProgramCacheKey=()=> 'commons-timber-grain';
    const stone=new THREE.MeshStandardMaterial({color:0x777568,roughness:1});
    const charcoal=new THREE.MeshStandardMaterial({color:0x24170e,roughness:1,emissive:0xd32b04,emissiveIntensity:.14});
    const cut=new THREE.MeshStandardMaterial({color:0xc49661,roughness:1});
    const gravel=new THREE.MeshStandardMaterial({color:0x70634b,roughness:1});
    gravel.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec2 gravelPosition;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ngravelPosition=position.xy;');
      shader.fragmentShader='varying vec2 gravelPosition;\n'+noise+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat grit=noise(gravelPosition*1.3);float mottling=noise(gravelPosition*.035);diffuseColor.rgb*=.65+.28*mottling+.3*grit;');
    };
    gravel.customProgramCacheKey=()=> 'commons-gravel';
    const floor=new THREE.Mesh(new THREE.CircleGeometry(176,48),gravel);
    floor.name='campfire-gravel-clearing';floor.rotation.x=-Math.PI/2;floor.position.y=.35;floor.receiveShadow=true;this.group.add(floor);
    const parts:THREE.BufferGeometry[]=[];
    const timber=(w:number,h:number,d:number,x:number,y:number,z:number,angle:number)=>{
      const g=new THREE.BoxGeometry(w,h,d);g.rotateY(angle);g.translate(x,y,z);parts.push(g);
    };
    for(const seat of options?.seats===false?[]:CAMPFIRE_SEATS){
      const x=seat.x-camp.x,z=seat.y-camp.y,angle=Math.PI/2-seat.angle;
      timber(42,7,26,x,17,z,angle);
      // Backrests and legs are oriented towards the fire, with open gaps between seats.
      const radialX=Math.cos(seat.angle),radialZ=Math.sin(seat.angle),tx=-radialZ,tz=radialX;
      for(const side of [-1,1]){
        timber(5,36,5,x+radialX*12+tx*side*16,22,z+radialZ*12+tz*side*16,angle);
        timber(6,14,6,x-radialX*9+tx*side*16,7,z-radialZ*9+tz*side*16,angle);
      }
      for(const height of [28,38])timber(44,7,4,x+radialX*13,height,z+radialZ*13,angle);
    }
    const seats=new THREE.Mesh(parts.length?mergeGeometries(parts):new THREE.BufferGeometry(),wood);parts.forEach(g=>g.dispose());
    seats.name='campfire-eight-timber-seats';seats.receiveShadow=true;this.group.add(seats);
    const rocks=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),stone,22);
    rocks.name='campfire-stone-ring';rocks.receiveShadow=true;
    const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),v=new THREE.Vector3(),scale=new THREE.Vector3();
    for(let i=0;i<22;i++){
      const a=i*Math.PI*2/22,r=43+(i%3-1)*2;
      v.set(Math.cos(a)*r,7+(i%2),Math.sin(a)*r);q.setFromEuler(new THREE.Euler(i*.7,a,i*.31));scale.set(9+(i%3),7,8);
      rocks.setMatrixAt(i,matrix.compose(v,q,scale));rocks.setColorAt(i,new THREE.Color().setScalar(.65+(i%4)*.09));
    }
    this.group.add(rocks);
    const logs=new THREE.InstancedMesh(new THREE.CylinderGeometry(5.5,6.5,55,9),charcoal,7);
    const ends=new THREE.InstancedMesh(new THREE.CircleGeometry(5.3,9),cut,14);
    logs.name='campfire-charred-logs';ends.name='campfire-log-endgrain';
    for(let i=0;i<7;i++){
      const a=i*2.399,axis=new THREE.Vector3(Math.cos(a),.08,Math.sin(a)).normalize();
      v.set(Math.cos(a+.7)*10,6+(i%3)*4,Math.sin(a+.7)*10);q.setFromUnitVectors(new THREE.Vector3(0,1,0),axis);
      logs.setMatrixAt(i,matrix.compose(v,q,new THREE.Vector3(1,1,1)));
      for(const side of [-1,1]){const end=v.clone().addScaledVector(axis,side*27.6),orientation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),axis.clone().multiplyScalar(side));ends.setMatrixAt(i*2+(side+1)/2,matrix.compose(end,orientation,new THREE.Vector3(1,1,1)));}
    }
    this.group.add(logs,ends);
    const coals=new THREE.Mesh(new THREE.CircleGeometry(32,24),new THREE.ShaderMaterial({
      uniforms:{time:this.time},vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec2 p;uniform float time;${noise}
      void main(){float n=noise(p*24.);float hot=smoothstep(.36,.8,n)*(.75+.25*sin(time*1.8+n*12.));
      gl_FragColor=vec4(mix(vec3(.045,.018,.009),vec3(1.8,.23,.015),hot),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,side:THREE.DoubleSide}));
    coals.rotation.x=-Math.PI/2;coals.position.y=2;this.group.add(coals);
    const planes:THREE.BufferGeometry[]=[];
    for(let i=0;i<3;i++){const g=new THREE.PlaneGeometry(76,88,1,6);g.translate(0,44,0);g.rotateY(i*Math.PI/3);planes.push(g);}
    const flames=createCampfireFlames(this.time);
    this.flame=new THREE.Mesh(mergeGeometries(planes),flames);planes.forEach(g=>g.dispose());
    this.flame.name='campfire-flowing-flames';this.flame.position.y=10;this.group.add(this.flame);
    // Arrival's mesh wireframe override groups non-indexed vertices in threes.
    // A multiple of three also keeps this Points geometry valid in that pass.
    const particles=new Float32Array(24*3);
    for(let i=0;i<24;i++){particles[i*3]=i/24;particles[i*3+1]=(i*7%24)/24;particles[i*3+2]=(i*13%24)/24;}
    const sparkGeometry=new THREE.BufferGeometry();sparkGeometry.setAttribute('position',new THREE.BufferAttribute(particles,3));
    this.sparks=new THREE.Points(sparkGeometry,new THREE.ShaderMaterial({uniforms:{time:this.time},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      vertexShader:`uniform float time;varying float fade;void main(){float age=fract(time*.18+position.x);fade=sin(age*3.14159)*(1.-age);vec3 p=vec3((position.y-.5)*35.+sin(age*8.+position.z*12.)*age*18.,12.+age*135.,(position.z-.5)*35.);vec4 view=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*view;gl_PointSize=clamp(550./max(1.,-view.z),1.,4.);}`,
      fragmentShader:'varying float fade;void main(){float a=1.-smoothstep(.1,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(1.,.42,.08,a*fade);}'}));
    this.sparks.name='campfire-rising-embers';this.sparks.frustumCulled=false;this.group.add(this.sparks);
    if(import.meta.env.DEV)this.group.traverse(object=>{
      if(object instanceof THREE.Mesh||object instanceof THREE.Points)object.onBeforeRender=()=>{this.renderedDrawCalls++;};
    });
  }
  get drawCalls(){return this.renderedDrawCalls;}
  update(seconds:number,camera:THREE.Camera,daylight:number,enabled=true){
    if(this.disposed)return;
    this.renderedDrawCalls=0;
    const target=1+(campfireHeat(this.fuel)-1);
    this.size+=(target-this.size)*.06;
    this.flame.scale.set(Math.sqrt(this.size),this.size,Math.sqrt(this.size));
    this.sparks.scale.y=this.size;
    const distance=camera.position.distanceToSquared(this.light.position);
    this.group.visible=enabled&&distance<4_000*4_000;
    const near=enabled&&distance<900*900;
    // Keep the light in the shader layout while zeroing distant contribution.
    const fade=Math.max(0,Math.min(1,(900-Math.sqrt(distance))/300));
    this.light.intensity=near?65_000*this.spatialScale*this.spatialScale*this.size*(.3+.7*(1-daylight))*fade*(1+Math.sin(seconds*7.1)*.045+Math.sin(seconds*11.7)*.025):0;
    this.flame.visible=distance<2_000*2_000;this.sparks.visible=distance<650*650;
    if(this.group.visible)this.time.value=seconds;
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;
    const geometry=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    this.group.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Points){geometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);if(o instanceof THREE.InstancedMesh)o.dispose();}});
    geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.group.removeFromParent();this.light.removeFromParent();
  }
}
