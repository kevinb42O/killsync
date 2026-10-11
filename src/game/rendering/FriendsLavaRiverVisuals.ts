import * as THREE from 'three';
import { LAVA_RIVER_POINTS, LAVA_SEA_ENTRY } from '../world/FriendsLavaRiver';
import { ISLAND_SEA_LEVEL } from '../world/FriendsWaterBodies';
import { LAVA_SURFACE_GLSL } from './FriendsLavaSurface';

/** Fixed ribbons and GPU billboards: no particle sorting, texture uploads or
 * terrain sampling in the frame loop. Banks are solid world voxels, not skirts. */
export class FriendsLavaRiverVisuals extends THREE.Group {
  private readonly molten:THREE.ShaderMaterial;
  private readonly steam:THREE.ShaderMaterial;
  constructor(){
    super();this.name='ember-river-to-the-sea';
    this.molten=new THREE.ShaderMaterial({side:THREE.DoubleSide,toneMapped:false,uniforms:{time:{value:0}},
      vertexShader:`varying vec2 flowUv;varying vec2 lavaWorld;void main(){flowUv=uv;lavaWorld=(modelMatrix*vec4(position,1.)).xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec2 flowUv;varying vec2 lavaWorld;uniform float time;
        ${LAVA_SURFACE_GLSL}
        void main(){float cooling=smoothstep(.28,.55,abs(flowUv.x-.5));
          gl_FragColor=vec4(lavaSurface(lavaWorld,time,smoothstep(360.,2000.,flowUv.y),cooling),1.);}`});
    const positions:number[]=[],uvs:number[]=[],indices:number[]=[];
    const sides=[-1.7,-1,-.5,0,.5,1,1.7];
    for(let i=0;i<LAVA_RIVER_POINTS.length;i++){
      const p=LAVA_RIVER_POINTS[i],a=LAVA_RIVER_POINTS[Math.max(0,i-1)],b=LAVA_RIVER_POINTS[Math.min(152,i+1)],length=Math.hypot(b.x-a.x,b.y-a.y),nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length;
      // Bury the sheet inside the physical bank. The terrain depth test defines
      // its visible shoreline across both voxel and distant terrain meshes.
      for(const side of sides){positions.push(p.x+nx*side*p.width/2,p.z,p.y+ny*side*p.width/2);uvs.push((side+1)/2,p.t*9100);}
      // The crater owns the flat throat; only one molten surface at the join.
      if(i>=6&&i<152)for(let side=0;side<sides.length-1;side++){
        const n=i*sides.length+side,next=n+sides.length;indices.push(n,next,n+1,n+1,next,next+1);
      }
    }
    const ribbon=new THREE.BufferGeometry();ribbon.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));ribbon.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));ribbon.setIndex(indices);ribbon.computeBoundingSphere();
    const river=new THREE.Mesh(ribbon,this.molten);river.name='caldera-breach-lava-flow';this.add(river);
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
  }
  update(seconds:number){this.molten.uniforms.time.value=seconds;this.steam.uniforms.time.value=seconds;}
  dispose(){const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();this.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);if(o instanceof THREE.InstancedMesh)o.dispose();}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.removeFromParent();}
}
