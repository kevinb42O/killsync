import * as THREE from 'three';
import { LAVA_RIVER_POINTS, LAVA_SEA_ENTRY } from '../world/FriendsLavaRiver';
import { ISLAND_SEA_LEVEL } from '../world/FriendsWaterBodies';

/** Fixed ribbons and GPU billboards: no particle sorting, texture uploads or
 * terrain sampling in the frame loop. Four draws for the entire coastal flow. */
export class FriendsLavaRiverVisuals extends THREE.Group {
  private readonly molten:THREE.ShaderMaterial;
  private readonly steam:THREE.ShaderMaterial;
  constructor(){
    super();this.name='ember-river-to-the-sea';
    this.molten=new THREE.ShaderMaterial({side:THREE.DoubleSide,toneMapped:false,uniforms:{time:{value:0}},
      vertexShader:`varying vec2 flowUv;void main(){flowUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec2 flowUv;uniform float time;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
        void main(){vec2 p=vec2(flowUv.x*5.,flowUv.y*.012-time*.24);p.x+=sin(p.y*.9)*.28;
          float n=noise(p*2.)*.65+noise(p*5.)*.35;
          float seam=pow(1.-abs(sin(p.y*2.1+p.x*3.+noise(p)*5.)),8.);
          float edge=smoothstep(0.,.18,flowUv.x)*smoothstep(0.,.18,1.-flowUv.x);
          float heat=clamp((1.-smoothstep(.35,.65,n))*.8+seam*.8,0.,1.)*edge;
          vec3 c=mix(vec3(.055,.027,.022),mix(vec3(.85,.035,.003),vec3(1.9,.85,.12),heat),heat);
          gl_FragColor=vec4(c,1.);}`});
    const positions:number[]=[],uvs:number[]=[],indices:number[]=[],banks:number[]=[],bankIndices:number[]=[];
    for(let i=0;i<LAVA_RIVER_POINTS.length;i++){
      const p=LAVA_RIVER_POINTS[i],a=LAVA_RIVER_POINTS[Math.max(0,i-1)],b=LAVA_RIVER_POINTS[Math.min(152,i+1)],length=Math.hypot(b.x-a.x,b.y-a.y),nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length;
      for(const side of [-1,1]){positions.push(p.x+nx*side*p.width/2,p.z,p.y+ny*side*p.width/2);uvs.push((side+1)/2,p.t*9100);
        for(const offset of [0,42])banks.push(p.x+nx*side*(p.width/2+offset),p.z-8+Math.sin(i*1.7)*6-offset*.65,p.y+ny*side*(p.width/2+offset));}
      if(i<152){const n=i*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);for(const side of [0,2]){const k=i*4+side;bankIndices.push(k,k+1,k+4,k+1,k+5,k+4);}}
    }
    const ribbon=new THREE.BufferGeometry();ribbon.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));ribbon.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));ribbon.setIndex(indices);ribbon.computeBoundingSphere();
    const river=new THREE.Mesh(ribbon,this.molten);river.name='caldera-breach-lava-flow';this.add(river);
    const bankGeometry=new THREE.BufferGeometry();bankGeometry.setAttribute('position',new THREE.Float32BufferAttribute(banks,3));bankGeometry.setIndex(bankIndices);bankGeometry.computeVertexNormals();
    const bank=new THREE.Mesh(bankGeometry,new THREE.MeshStandardMaterial({color:'#302b29',roughness:1,side:THREE.DoubleSide}));bank.name='lava-river-cooled-basalt-banks';this.add(bank);
    const count=28,g=new THREE.PlaneGeometry(1,1);g.setAttribute('seed',new THREE.InstancedBufferAttribute(Float32Array.from({length:count},(_,i)=>i/count),1));
    this.steam=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,uniforms:{time:{value:0}},
      vertexShader:`attribute float seed;uniform float time;varying vec2 puffUv;varying float age,phase;
        void main(){age=fract(seed+time*.055);phase=seed;puffUv=uv;vec3 c=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
          c+=vec3(age*age*650.+sin(seed*43.+age*9.)*90.,age*1150.,age*age*180.+cos(seed*31.)*90.);
          vec4 v=viewMatrix*vec4(c,1.);v.xy+=position.xy*(170.+age*640.);gl_Position=projectionMatrix*v;}`,
      fragmentShader:`varying vec2 puffUv;varying float age,phase;uniform float time;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
        void main(){vec2 p=(puffUv-.5)*2.;float density=noise(p*3.+phase*21.-time*.08)*.7+noise(p*7.+time*.1)*.3;
          float alpha=pow(max(0.,1.-dot(p,p)),1.6)*smoothstep(0.,.08,age)*(1.-smoothstep(.55,1.,age))*smoothstep(.16,.7,density)*.34;
          if(alpha<.004)discard;vec3 c=mix(vec3(.64,.72,.75),vec3(.97,.92,.82),density);c+=vec3(.12,.035,0.)*(1.-age);gl_FragColor=vec4(c,alpha);}`});
    const plume=new THREE.InstancedMesh(g,this.steam,count),matrix=new THREE.Matrix4();plume.name='lava-ocean-windblown-vapor';plume.renderOrder=4;
    for(let i=0;i<count;i++){matrix.makeTranslation(LAVA_SEA_ENTRY.x+Math.sin(i*12)*110,ISLAND_SEA_LEVEL+35,LAVA_SEA_ENTRY.y+Math.cos(i*7)*80);plume.setMatrixAt(i,matrix);}plume.instanceMatrix.needsUpdate=true;
    // GPU expansion is not reflected in the CPU unit-quad bounds.
    plume.boundingSphere=new THREE.Sphere(new THREE.Vector3(LAVA_SEA_ENTRY.x+300,500,LAVA_SEA_ENTRY.y),1600);this.add(plume);
    const rocks=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),bank.material,84),q=new THREE.Quaternion();
    for(let i=0;i<84;i++){const p=LAVA_RIVER_POINTS[12+Math.floor(i/2)*3],a=LAVA_RIVER_POINTS[Math.min(152,13+Math.floor(i/2)*3)],side=i%2?1:-1,angle=Math.atan2(a.y-p.y,a.x-p.x),radius=p.width/2+60+(i%4)*15,size=12+(i%5)*6;
      matrix.compose(new THREE.Vector3(p.x-Math.sin(angle)*side*radius,p.z-42,p.y+Math.cos(angle)*side*radius),q.setFromEuler(new THREE.Euler(i,0,i*.7)),new THREE.Vector3(size,size*.7,size*1.5));rocks.setMatrixAt(i,matrix);}
    rocks.name='lava-river-basalt-boulders';rocks.computeBoundingSphere();this.add(rocks);
  }
  update(seconds:number){this.molten.uniforms.time.value=seconds;this.steam.uniforms.time.value=seconds;}
  dispose(){const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();this.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);if(o instanceof THREE.InstancedMesh)o.dispose();}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.removeFromParent();}
}
