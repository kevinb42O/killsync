import * as THREE from 'three';
import type { FriendsTerrain } from '../world/FriendsTerrain';

const FACES=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const CAPACITY=16;
type Edit={x:number;y:number;z:number;waiting:Set<string>};

/** Covers the interval between collision edits and asynchronous mesh delivery.
 * The same mask removes stale faces from the horizon, surface shell and volume.
 * A tiny instanced patch supplies newly exposed walls; no chunk is rebuilt here. */
export class FriendsTerrainEditFeedback {
  readonly group=new THREE.Group();
  private edits:Edit[]=[];
  private masked=new WeakSet<THREE.Material>();
  private count={value:0};
  private cells={value:Array.from({length:CAPACITY},()=>new THREE.Vector3())};
  private low={value:new THREE.Vector3()};
  private high={value:new THREE.Vector3()};
  private geometry=new THREE.PlaneGeometry(32,32);
  private batches:THREE.InstancedMesh[]=[];
  private matrix=new THREE.Matrix4();
  private position=new THREE.Vector3();
  private normal=new THREE.Vector3();
  private rotation=new THREE.Quaternion();
  private forward=new THREE.Vector3(0,0,1);
  private color=new THREE.Color();
  constructor(scene:THREE.Group,materials:readonly THREE.MeshStandardMaterial[]){
    this.group.name='friends-pending-excavation';scene.add(this.group);
    // Geometry and texture objects remain shared with the world. Only five
    // shader materials and fixed instance buffers belong to this patch.
    const uv=this.geometry.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)/5,uv.getY(i)/5);
    this.geometry.setAttribute('caveGlow',new THREE.Float32BufferAttribute(new Float32Array(12),3));
    this.geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(12).fill(1),3));
    for(const source of materials.slice(0,5)){
      const material=source.clone();material.onBeforeCompile=source.onBeforeCompile;material.customProgramCacheKey=source.customProgramCacheKey;
      material.polygonOffset=true;material.polygonOffsetFactor=-1;material.polygonOffsetUnits=-1;
      const mesh=new THREE.InstancedMesh(this.geometry,material,CAPACITY*6);mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.batches.push(mesh);this.group.add(mesh);
    }
  }
  mask(material:THREE.MeshStandardMaterial){
    if(this.masked.has(material))return;this.masked.add(material);
    const decorate=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material);
    material.onBeforeCompile=(shader,renderer)=>{
      decorate(shader,renderer);
      shader.uniforms.editCount=this.count;shader.uniforms.editCells=this.cells;shader.uniforms.editLow=this.low;shader.uniforms.editHigh=this.high;
      shader.vertexShader='varying vec3 editWorld;varying vec3 editNormal;\n'+shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
        vec4 editPosition=vec4(transformed,1.);vec3 editN=objectNormal;
        #ifdef USE_INSTANCING
        editPosition=instanceMatrix*editPosition;editN=mat3(instanceMatrix)*editN;
        #endif
        editWorld=(modelMatrix*editPosition).xyz;editNormal=normalize(mat3(modelMatrix)*editN);`);
      shader.fragmentShader='varying vec3 editWorld;varying vec3 editNormal;uniform int editCount;uniform vec3 editCells[16];uniform vec3 editLow;uniform vec3 editHigh;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
        if(editCount>0 && all(greaterThanEqual(editWorld,editLow)) && all(lessThanEqual(editWorld,editHigh))){
          vec3 editVoxel=floor((editWorld-editNormal*.08)/32.);
          for(int i=0;i<16;i++){if(i>=editCount)break;if(all(lessThan(abs(editVoxel-editCells[i]),vec3(.1))))discard;}
        }`);
    };
    material.customProgramCacheKey=()=>key()+'-pending-excavation-v1';material.needsUpdate=true;
  }
  add(x:number,y:number,z:number){
    if(this.edits.some(e=>e.x===x&&e.y===y&&e.z===z))return;
    const cx=Math.floor(x/16),cy=Math.floor(y/16),waiting=new Set([cx+','+cy]);
    if(x%16===0)waiting.add((cx-1)+','+cy);if(x%16===15)waiting.add((cx+1)+','+cy);
    if(y%16===0)waiting.add(cx+','+(cy-1));if(y%16===15)waiting.add(cx+','+(cy+1));
    if(this.edits.length===CAPACITY)this.edits.shift();this.edits.push({x,y,z,waiting});
  }
  installed(cx:number,cy:number){const key=cx+','+cy;for(const e of this.edits)e.waiting.delete(key);this.edits=this.edits.filter(e=>e.waiting.size);}
  refresh(terrain:FriendsTerrain){
    this.edits=this.edits.filter(e=>!terrain.exposedMaterial(e.x,e.y,e.z));
    this.count.value=this.edits.length;this.low.value.setScalar(Infinity);this.high.value.setScalar(-Infinity);
    for(const mesh of this.batches)mesh.count=0;
    for(let i=0;i<this.edits.length;i++){
      const e=this.edits[i];this.cells.value[i].set(e.x,e.z,e.y);
      this.low.value.min(new THREE.Vector3(e.x*32-.2,e.z*32-.2,e.y*32-.2));this.high.value.max(new THREE.Vector3((e.x+1)*32+.2,(e.z+1)*32+.2,(e.y+1)*32+.2));
      for(const [nx,ny,nz]of FACES){
        const material=terrain.exposedMaterial(e.x+nx,e.y+ny,e.z+nz);if(!material)continue;
        const surface=nz===-1&&(e.z+nz+1)*32===terrain.height(e.x+nx,e.y+ny);
        const mesh=this.batches[Math.min(4,material===1?(surface?0:1):material)],slot=mesh.count++;
        this.position.set((e.x+.5)*32+nx*16,(e.z+.5)*32+nz*16,(e.y+.5)*32+ny*16);
        this.normal.set(-nx,-nz,-ny);this.rotation.setFromUnitVectors(this.forward,this.normal);
        this.matrix.compose(this.position,this.rotation,new THREE.Vector3(1,1,1));mesh.setMatrixAt(slot,this.matrix);this.color.setScalar(nz?(nz<0?1:.55):nx?.84:.92);mesh.setColorAt(slot,this.color);
      }
    }
    for(const mesh of this.batches)if(mesh.count){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
  }
  get stats(){return {pendingVoxels:this.edits.length,patchDraws:this.batches.filter(m=>m.count>0).length};}
  dispose(){this.group.removeFromParent();for(const mesh of this.batches){mesh.dispose();(mesh.material as THREE.Material).dispose();}this.geometry.dispose();}
}
