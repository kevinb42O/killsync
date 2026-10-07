import * as THREE from 'three';
import { CASTLE_TOWERS, createHighfallCastle, HIGHFALL_CASTLE as c } from '../world/FriendsCastle';
import { baseTerrainHeight } from '../world/FriendsTerrain';

/** Flames and ironwork are instanced; a fixed light pool follows the viewer. */
export class FriendsCastleTorches extends THREE.Group {
  private positions: THREE.Vector3[]=[];
  private lights: THREE.PointLight[]=[];
  private flames: THREE.ShaderMaterial;
  private clothTime={value:0};
  constructor(){
    super();this.name='highfall-torchlit-fortress';
    const torches=createHighfallCastle(baseTerrainHeight).torches;
    const iron=new THREE.MeshStandardMaterial({color:'#332d28',metalness:.75,roughness:.55});
    const stems=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),iron,torches.length);
    const bowls=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,.65,1,8),iron,torches.length);
    const phase=new Float32Array(torches.length),geometry=new THREE.PlaneGeometry(1,1);
    this.flames=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,uniforms:{time:{value:0}},
      vertexShader:`attribute float phase;varying vec2 flameUv;varying float seed;uniform float time;
        void main(){flameUv=uv;seed=phase;vec3 origin=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
        vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
        vec3 p=origin+right*position.x*length(instanceMatrix[0].xyz)*(.88+.10*sin(time*9.+phase))+vec3(0.,position.y*length(instanceMatrix[1].xyz),0.);
        gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,
      fragmentShader:`varying vec2 flameUv;varying float seed;uniform float time;
        void main(){float y=flameUv.y,x=(flameUv.x-.5)*2.+sin(y*10.-time*8.+seed)*.17*y;
        float a=(1.-smoothstep((1.-y)*.55,(1.-y)*.8+.03,abs(x)))*smoothstep(0.,.13,y)*(1.-smoothstep(.7,1.,y));
        vec3 c=mix(vec3(1.,.13,.015),vec3(1.,.86,.38),pow(max(0.,1.-abs(x)*2.),2.)*(1.-y));gl_FragColor=vec4(c*2.6,a);}`});
    geometry.setAttribute('phase',new THREE.InstancedBufferAttribute(phase,1));
    const flames=new THREE.InstancedMesh(geometry,this.flames,torches.length),matrix=new THREE.Matrix4();
    torches.forEach((t,i)=>{
      const h=t.large?96:72,r=t.large?22:15;
      matrix.makeScale(12,h,12);matrix.setPosition(t.x,t.z+h/2,t.y);stems.setMatrixAt(i,matrix);
      matrix.makeScale(r,18,r);matrix.setPosition(t.x,t.z+h,t.y);bowls.setMatrixAt(i,matrix);
      matrix.makeScale(r*2.4,r*3.7,1);matrix.setPosition(t.x,t.z+h+r*1.2,t.y);flames.setMatrixAt(i,matrix);
      this.positions.push(new THREE.Vector3(t.x,t.z+h+20,t.y));phase[i]=i*2.399;
    });
    for(const mesh of [stems,bowls,flames]){mesh.computeBoundingSphere();this.add(mesh);}
    stems.castShadow=bowls.castShadow=true;
    for(let i=0;i<8;i++){const light=new THREE.PointLight('#ffaf54',65000,520,2);light.visible=false;this.lights.push(light);this.add(light);}
    // Woven crimson-and-gold standards give the huge stone silhouette a scale
    // cue. The bottom hem moves; the top stays attached to its iron crossbar.
    const width=64,height=128,pixels=new Uint8Array(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const u=x/width,v=y/height,border=x<4||x>=width-4||y<5||y>=height-5;
      const diamond=Math.abs(u-.5)*2+Math.abs(v-.52)*3.1;
      const crown=v>.38&&v<.48&&u>.28&&u<.72&&(v>.44||Math.sin(u*44)>0);
      const gold=border||(diamond>.70&&diamond<.82)||crown||(Math.abs(u-.5)<.025&&v>.5&&v<.64);
      const weave=((x+y)%3)*3,color=gold?[220,177,92]:[116,24,43],i=(y*width+x)*4;
      pixels[i]=color[0]+weave;pixels[i+1]=color[1]+weave;pixels[i+2]=color[2]+weave;
      pixels[i+3]=y<16&&Math.abs(u-.5)<(16-y)/64?0:255;
    }
    const heraldry=new THREE.DataTexture(pixels,width,height);heraldry.colorSpace=THREE.SRGBColorSpace;heraldry.needsUpdate=true;
    const cloth=new THREE.MeshStandardMaterial({map:heraldry,roughness:1,side:THREE.DoubleSide,alphaTest:.5});
    cloth.userData.castleHeraldry=heraldry;
    cloth.onBeforeCompile=shader=>{shader.uniforms.clothTime=this.clothTime;shader.vertexShader='uniform float clothTime;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      float hem=pow(1.-uv.y,1.6);transformed.z+=hem*(sin(position.y*.055+clothTime*2.4)*9.+sin(position.x*.06+clothTime*1.7)*4.);`);};
    cloth.customProgramCacheKey=()=> 'highfall-woven-standard';
    const bannerGeometry=new THREE.PlaneGeometry(112,352,4,16);
    const standards=CASTLE_TOWERS.map(t=>({dx:t.dx,dy:t.dy+t.size/2+2,h:t.height}));
    for(const {dx,dy,h} of standards){
      const banner=new THREE.Mesh(bannerGeometry,cloth);banner.position.set(c.x+dx,c.floor+h*.65,c.y+dy);banner.name='crown-of-highfall-standard';this.add(banner);
      const bar=new THREE.Mesh(new THREE.BoxGeometry(144,8,12),iron);bar.position.copy(banner.position).add(new THREE.Vector3(0,180,0));this.add(bar);
    }
  }
  update(seconds:number,camera:THREE.Vector3){
    this.flames.uniforms.time.value=seconds;
    this.clothTime.value=seconds;
    const nearest=this.positions.map((p,i)=>({p,i,d:p.distanceToSquared(camera)})).sort((a,b)=>a.d-b.d);
    this.lights.forEach((light,i)=>{const t=nearest[i];light.visible=Boolean(t&&t.d<2800*2800);if(!t)return;light.position.copy(t.p);light.intensity=65000*(1+.055*Math.sin(seconds*8.3+t.i)+.035*Math.sin(seconds*19+t.i*2));});
  }
  dispose(){const geometry=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();this.traverse(o=>{if(o instanceof THREE.Mesh){geometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);if(o instanceof THREE.InstancedMesh)o.dispose();}});geometry.forEach(g=>g.dispose());materials.forEach(m=>{m.userData.castleHeraldry?.dispose();m.dispose();});this.removeFromParent();}
}
