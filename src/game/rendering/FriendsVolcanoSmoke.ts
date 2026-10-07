import * as THREE from 'three';
import { ISLAND_VOLCANO } from '../world/FriendsIsland';

/** One instanced draw, twenty soft puffs. Wind, expansion and turbulent density
 * run on the GPU; no per-frame particle allocations or volume ray marches. */
export class FriendsVolcanoSmoke extends THREE.InstancedMesh<THREE.PlaneGeometry,THREE.ShaderMaterial>{
  constructor(){
    const geometry=new THREE.PlaneGeometry(1,1),count=20;
    geometry.setAttribute('plumeSeed',new THREE.InstancedBufferAttribute(new Float32Array(Array.from({length:count},(_,i)=>i/count)),1));
    const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{time:{value:0}},
      vertexShader:`attribute float plumeSeed;uniform float time;varying vec2 smokeUv;varying float smokeAge,smokeSeed;
        void main(){float age=fract(time*.034+plumeSeed);smokeAge=age;smokeSeed=plumeSeed;smokeUv=uv;
          vec3 centre=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
          centre+=vec3(age*age*920.+sin(age*8.+plumeSeed*12.)*150.,age*2700.,age*age*340.+cos(age*7.+plumeSeed*10.)*120.);
          vec4 view=viewMatrix*vec4(centre,1.);float size=350.+age*950.;view.xy+=position.xy*size;
          gl_Position=projectionMatrix*view;}`,
      fragmentShader:`varying vec2 smokeUv;varying float smokeAge,smokeSeed;uniform float time;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
        void main(){vec2 p=(smokeUv-.5)*2.;float envelope=pow(max(0.,1.-dot(p,p)),1.4);
          float n=noise(p*3.+vec2(smokeSeed*19.,time*.12))*.65+noise(p*7.-time*.08)*.35;
          float fade=smoothstep(0.,.12,smokeAge)*(1.-smoothstep(.68,1.,smokeAge));
          float alpha=envelope*fade*smoothstep(.13,.7,n)*.28;if(alpha<.005)discard;
          vec3 colour=mix(vec3(.18,.17,.16),vec3(.38,.39,.38),smokeUv.y*.6+n*.3);
          colour+=vec3(.11,.025,.005)*(1.-smokeAge)*.35;gl_FragColor=vec4(colour,alpha);}`});
    super(geometry,material,count);this.name='ember-caldera-windblown-smoke';this.renderOrder=4;
    const matrix=new THREE.Matrix4().makeTranslation(ISLAND_VOLCANO.x,ISLAND_VOLCANO.lavaLevel+600,ISLAND_VOLCANO.y);
    for(let i=0;i<count;i++)this.setMatrixAt(i,matrix);
    this.instanceMatrix.needsUpdate=true;this.frustumCulled=false;
  }
  update(seconds:number){this.material.uniforms.time.value=seconds;}
  dispose(){this.geometry.dispose();this.material.dispose();super.dispose();this.removeFromParent();}
}
