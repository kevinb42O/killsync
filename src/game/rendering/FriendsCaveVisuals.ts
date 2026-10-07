import { applyFriendsCaveLighting } from './FriendsCaveLighting';
import * as THREE from 'three';
import { CAVE_ENTRANCE, CAVE_ROOMS, CAVE_TORCHES, CAVE_TREASURES, caveAt, caveColumn } from '../world/FriendsCave';
import type { FriendsTerrain } from '../world/FriendsTerrain';

/** Permanent flames establish distance cues. Only the nearest three torches use
 * dynamic lights, with one bounded shadow map; distant flames remain visible. */
export class FriendsCaveVisuals extends THREE.Group {
  private lights:THREE.PointLight[]=[];
  private flame:THREE.ShaderMaterial;
  private dust:THREE.ShaderMaterial;
  private shadowStamp='';
  private torchPositions:THREE.Vector3[]=[];
  private torchCool:boolean[]=[];
  private exteriorFog=new THREE.Color(0xaec4bd);
  private caveFog=new THREE.Color(0x030509);
  private mist=0;
  private lastTime?:number;
  constructor(private scene:THREE.Scene,private camera:THREE.PerspectiveCamera,private terrain:FriendsTerrain,private renderer:THREE.WebGLRenderer){
    super();this.name='lantern-descent-cave';
    const torches=[...CAVE_TORCHES,...[{x:6096,y:5456},{x:6160,y:5344},{x:6224,y:5216}].map(p=>({...p,z:terrain.floor(p.x,p.y,6000,0)??640}))];
    const wood=new THREE.MeshStandardMaterial({color:0x34221a,roughness:1}),iron=new THREE.MeshStandardMaterial({color:0x333833,metalness:.75,roughness:.55});
    applyFriendsCaveLighting(wood);applyFriendsCaveLighting(iron);
    const posts=new THREE.InstancedMesh(new THREE.CylinderGeometry(3,5,66,6),wood,torches.length),bowls=new THREE.InstancedMesh(new THREE.CylinderGeometry(11,5,13,8),iron,torches.length);
    const flameGeo=new THREE.PlaneGeometry(26,44),phase=new Float32Array(torches.length);
    this.flame=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,uniforms:{time:{value:0}},vertexShader:`attribute float phase;varying vec2 vUv;varying float seed;uniform float time;
      void main(){vUv=uv;seed=phase;vec3 origin=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);vec3 p=origin+right*position.x*(.85+.12*sin(time*11.+phase))+vec3(0.,position.y,0.);gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,
      fragmentShader:`varying vec2 vUv;varying float seed;uniform float time;void main(){float y=vUv.y,x=(vUv.x-.5)*2.+sin(y*9.-time*7.+seed)*.12*y;float shape=1.-smoothstep((1.-y)*.65,(1.-y)*.85+.02,abs(x));float alpha=shape*smoothstep(0.,.12,y)*(1.-smoothstep(.65,1.,y));vec3 c=mix(vec3(1.,.2,.025),vec3(1.,.82,.35),pow(max(0.,1.-abs(x)*2.5),3.)*(1.-y));gl_FragColor=vec4(c*2.1,alpha);}`});
    flameGeo.setAttribute('phase',new THREE.InstancedBufferAttribute(phase,1));const flames=new THREE.InstancedMesh(flameGeo,this.flame,torches.length);
    torches.forEach((t,i)=>{const position=new THREE.Vector3(t.x,t.z,t.y),matrix=new THREE.Matrix4();posts.setMatrixAt(i,matrix.makeTranslation(position.x,position.y+33,position.z));bowls.setMatrixAt(i,matrix.makeTranslation(position.x,position.y+66,position.z));flames.setMatrixAt(i,matrix.makeTranslation(position.x,position.y+86,position.z));phase[i]=i*2.399;this.torchPositions.push(position.clone().add(new THREE.Vector3(0,78,0)));this.torchCool.push(Boolean('cool' in t && t.cool));});
    for(const mesh of [posts,bowls,flames]){mesh.computeBoundingSphere();this.add(mesh);}
    for(let i=0;i<3;i++){const light=new THREE.PointLight(0xffac53,0,260,2);light.castShadow=i===0;light.shadow.mapSize.set(512,512);light.shadow.camera.near=4;light.shadow.camera.far=260;light.shadow.bias=-.0005;light.shadow.normalBias=1.2;light.shadow.autoUpdate=false;this.lights.push(light);this.add(light);}
    // Crystalline veins contrast with amber firelight in the deepest chamber.
    const crystals:THREE.Matrix4[]=[];
    for(const room of CAVE_ROOMS)for(let i=0;i<14;i++){const angle=i*2.399,r=.68+.12*Math.sin(i*7.1),x=room.x+Math.cos(angle)*room.rx*r,y=room.y+Math.sin(angle)*room.ry*r;
      const floor=caveColumn(x,y).find(([a,b])=>a<=room.floor+32&&b>=room.floor+80)?.[0];if(floor===undefined)continue;
      if(CAVE_TREASURES.some(t=>Math.hypot(t.x-x,t.y-y)<90))continue;
      const h=room.id==='blue'?50+(i%4)*18:18+(i%4)*10;
      crystals.push(new THREE.Matrix4().compose(new THREE.Vector3(x,floor+h/2,y),new THREE.Quaternion().setFromEuler(new THREE.Euler(.1*Math.sin(i),angle,.1*Math.cos(i))),new THREE.Vector3(9+i%4*3,h,9+i%3*4)));
    }
    const crystal=new THREE.InstancedMesh(new THREE.CylinderGeometry(.1,1,1,5),applyFriendsCaveLighting(new THREE.MeshStandardMaterial({color:0x74b8b8,emissive:0x13353c,emissiveIntensity:.045,metalness:.28,roughness:.27})),crystals.length);crystals.forEach((m,i)=>crystal.setMatrixAt(i,m));crystal.castShadow=crystal.receiveShadow=true;crystal.computeBoundingSphere();this.add(crystal);
    this.dust=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{time:{value:0}},vertexShader:`attribute float seed;varying float depthFade;uniform float time;void main(){vec3 p=position;p.y+=sin(time*.3+seed)*12.;p.x+=sin(time*.15+seed)*9.;vec4 mv=modelViewMatrix*vec4(p,1.);depthFade=clamp(1.-length(mv.xyz)/1800.,0.,1.);gl_PointSize=clamp(1100./max(10.,-mv.z),1.,4.);gl_Position=projectionMatrix*mv;}`,fragmentShader:`varying float depthFade;void main(){float a=pow(max(0.,1.-length(gl_PointCoord-.5)*2.),2.);gl_FragColor=vec4(.9,.62,.31,a*depthFade*.04);}`});
    const dustPositions:number[]=[],seeds:number[]=[];
    for(const room of CAVE_ROOMS)for(let i=0;i<72;i++){const angle=i*2.399,r=Math.sqrt((i+.5)/72)*.85,x=room.x+Math.cos(angle)*room.rx*r,y=room.y+Math.sin(angle)*room.ry*r;const ranges=caveColumn(x,y);const range=ranges.at(-1);if(!range)continue;dustPositions.push(x,range[0]+32+(range[1]-range[0]-64)*((i*.618)%1),y);seeds.push(i);}
    const particles=new THREE.BufferGeometry();particles.setAttribute('position',new THREE.Float32BufferAttribute(dustPositions,3));particles.setAttribute('seed',new THREE.Float32BufferAttribute(seeds,1));this.add(new THREE.Points(particles,this.dust));
  }
  update(time:number,minedUnderground=false,exteriorFog=this.exteriorFog){
    this.flame.uniforms.time.value=time;this.dust.uniforms.time.value=time;
    const underground=minedUnderground||Boolean(caveAt(this.camera.position.x,this.camera.position.z,this.camera.position.y));
    // A roof occludes the exterior through depth testing. Changing the whole
    // background here also blackened open entrances and gaps between blocks.
    const dt=this.lastTime===undefined?1/60:Math.max(0,Math.min(.1,time-this.lastTime));this.lastTime=time;
    this.mist+=(Number(underground)-this.mist)*(1-Math.exp(-dt*5));
    if(this.scene.fog instanceof THREE.FogExp2){this.scene.fog.color.copy(exteriorFog).lerp(this.caveFog,this.mist);this.scene.fog.density=.000009+this.mist*.00020;}
    const nearest=this.torchPositions.map((p,i)=>({p,i,d:p.distanceTo(this.camera.position)})).sort((a,b)=>a.d-b.d);
    this.lights.forEach((light,i)=>{const t=nearest[i];if(!t){light.intensity=0;return;}light.position.copy(t.p);light.color.setHex(this.torchCool[t.i]?0x7dc6d1:0xffac53);light.intensity=underground&&t.d<400?(this.torchCool[t.i]?14000:18000)*(1+.055*Math.sin(time*8.1+t.i)+.025*Math.sin(time*17.3+t.i*3)):0;});
    const shadowStamp=`${nearest[0]?.i}:${this.terrain.revision}`;if(underground&&shadowStamp!==this.shadowStamp){this.shadowStamp=shadowStamp;this.lights[0].shadow.needsUpdate=true;this.renderer.shadowMap.needsUpdate=true;}
    return underground;
  }
  dispose(){this.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Points){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();if(o instanceof THREE.InstancedMesh)o.dispose();}if(o instanceof THREE.PointLight)o.shadow.map?.dispose();});this.removeFromParent();}
}
