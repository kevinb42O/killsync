import * as THREE from 'three';
import { ISLAND_VOLCANO } from '../world/FriendsIsland';

/** Rising ash column and a broad wind-sheared crown in one instanced draw.
 * Two noise octaves shade soft billows; all drift and expansion stay on GPU. */
export class FriendsVolcanoSmoke extends THREE.InstancedMesh<THREE.PlaneGeometry,THREE.ShaderMaterial>{
  constructor(){
    const geometry=new THREE.PlaneGeometry(1,1),count=32;
    geometry.setAttribute('plumeSeed',new THREE.InstancedBufferAttribute(Float32Array.from({length:count},(_,i)=>i<20?i/20:(i-20)/12),1));
    geometry.setAttribute('plumeBand',new THREE.InstancedBufferAttribute(Float32Array.from({length:count},(_,i)=>i<20?0:1),1));
    const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,uniforms:{time:{value:0}},
      vertexShader:`attribute float plumeSeed,plumeBand;uniform float time;varying vec2 smokeUv;varying float smokeAge,smokeSeed,smokeBand;
        void main(){float age=fract(time*(plumeBand>.5?.018:.027)+plumeSeed);smokeAge=age;smokeSeed=plumeSeed;smokeBand=plumeBand;smokeUv=uv;
          vec3 centre=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
          vec3 column=vec3(age*age*2500.+sin(age*11.+plumeSeed*19.)*(80.+age*240.),age*4700.,age*age*650.+cos(age*9.+plumeSeed*13.)*(60.+age*160.));
          vec3 crown=vec3(1700.+age*2200.+sin(plumeSeed*31.+age*6.)*650.,3500.+age*1500.+sin(age*7.+plumeSeed*23.)*220.,450.+cos(plumeSeed*21.+age*5.)*900.);
          centre+=mix(column,crown,plumeBand);vec4 view=viewMatrix*vec4(centre,1.);
          float size=mix(460.+pow(age,.75)*1750.,1450.+age*1450.,plumeBand);view.xy+=position.xy*size;
          gl_Position=projectionMatrix*view;}`,
      fragmentShader:`varying vec2 smokeUv;varying float smokeAge,smokeSeed,smokeBand;uniform float time;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
        void main(){vec2 p=(smokeUv-.5)*2.;float radial=dot(p,p);if(radial>1.)discard;
          float n=noise(p*3.2+vec2(smokeSeed*19.,time*.075))*.7+noise(p*7.3-time*.045)*.3;
          float envelope=pow(max(0.,1.-radial),1.3);
          float fade=smoothstep(0.,.08,smokeAge)*(1.-smoothstep(.70,1.,smokeAge));
          float alpha=envelope*fade*smoothstep(.12,.67,n)*mix(.46,.38,smokeBand);if(alpha<.004)discard;
          vec3 billowNormal=normalize(vec3(p*.75,sqrt(max(.02,1.-radial))));
          float light=max(0.,dot(billowNormal,normalize(vec3(-.45,.7,.55))));
          float edgeLight=light*.72+n*.18;
          vec3 ash=mix(vec3(.105,.112,.125),vec3(.59,.61,.63),edgeLight);
          ash+=vec3(.22,.055,.008)*(1.-smokeAge)*(1.-smokeBand)*.55;
          gl_FragColor=vec4(ash,alpha);}`});
    super(geometry,material,count);this.name='ember-caldera-windblown-smoke';this.renderOrder=4;
    const v=ISLAND_VOLCANO,matrix=new THREE.Matrix4().makeTranslation(v.x,v.lavaLevel+250,v.y);
    for(let i=0;i<count;i++)this.setMatrixAt(i,matrix);
    this.instanceMatrix.needsUpdate=true;
    // Includes the shader's wind drift and expanded crown. Offscreen summits
    // can now cull instead of submitting their full plume from anywhere.
    this.boundingSphere=new THREE.Sphere(new THREE.Vector3(v.x+1900,v.lavaLevel+3000,v.y+500),5400);
  }
  update(seconds:number){this.material.uniforms.time.value=seconds;}
  dispose(){this.geometry.dispose();this.material.dispose();super.dispose();this.removeFromParent();}
}
