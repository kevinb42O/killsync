import * as THREE from 'three';
import { friendsFloodWater, friendsLiveWaterAt } from '../world/FriendsFloodWater';
import type { FriendsTerrain } from '../world/FriendsTerrain';
import { islandWater } from './FriendsIslandVisuals';
import type { FriendsDayNightCycle } from './FriendsDayNightCycle';

/** Dynamic sheets own exact voxel columns; the same mask removes the buried
 * natural sheet for uncovered cells. Covered tops extend the original water
 * mesh, preserving its waves and shading. Only changed geometry is replaced. */
export class FriendsFloodWaterVisuals extends THREE.Group {
  private epoch=-1;
  private sheets=new Map<string,{stamp:string;mesh:THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>}>();
  private maskData?:Uint16Array;
  private mask?:THREE.DataTexture;
  private maskedColumns=new Map<number,number>();
  private materials=new Set<THREE.ShaderMaterial>();
  private nativeSheets=new Map<THREE.Mesh,{bounds:THREE.Box3;level:number;sea:boolean}>();
  private maskUniform={value:null as THREE.DataTexture|null};
  constructor(private terrain:FriendsTerrain,private atmosphere:FriendsDayNightCycle){super();this.name='excavation-water';}
  bindNatural(root:THREE.Object3D){let changed=false;root.traverse(o=>{
    if(!(o instanceof THREE.Mesh))return;
    for(const m of Array.isArray(o.material)?o.material:[o.material]){
      if(!(m instanceof THREE.ShaderMaterial)||!m.userData.frontierWater)continue;
      if(!this.nativeSheets.has(o)&&o.geometry instanceof THREE.PlaneGeometry){
        o.updateWorldMatrix(true,false);const bounds=new THREE.Box3().setFromObject(o);
        if(bounds.max.y-bounds.min.y<.01){this.nativeSheets.set(o,{bounds,level:o.getWorldPosition(new THREE.Vector3()).y,sea:m.uniforms.ocean?.value>.5});changed=true;}
      }
      if(this.materials.has(m))continue;
      this.materials.add(m);m.uniforms.excavationMask=this.maskUniform;m.uniforms.excavationMaskEnabled={value:this.mask?1:0};
      // Positive depth extends this very surface; negative depth reserves an
      // out-of-coverage edge cell for a separate sparse sheet.
      const sampling=`uniform sampler2D excavationMask;uniform float excavationMaskEnabled;
        vec2 excavationAt(vec2 p,float level){
          if(excavationMaskEnabled<.5)return vec2(0.);
          vec2 flood=texture2D(excavationMask,(floor(p/32.)+.5)/1500.).rg;
          return flood.r!=0.&&abs(level-(flood.r-1024.))<12.?flood:vec2(0.);
        }\n`;
      m.vertexShader=sampling+m.vertexShader.replace('float depth=texture2D(bathymetry,clamp(uv,0.,1.)).r;',`float depth=texture2D(bathymetry,clamp(uv,0.,1.)).r;
        vec2 excavation=excavationAt(p,w.y);if(excavation.y>0.)depth=excavation.y;`);
      m.fragmentShader=sampling+m.fragmentShader.replace('float depth=mix(256.,texture2D(bathymetry,clamp(uv,0.,1.)).r,inside);',`float depth=mix(256.,texture2D(bathymetry,clamp(uv,0.,1.)).r,inside);
        vec2 excavation=excavationAt(p,seaWorld.y);
        if(excavation.y<0.)discard;if(excavation.y>0.)depth=excavation.y;`);
      m.needsUpdate=true;
    }
  });if(changed){this.epoch=-1;this.sync();}}
  private nativeCovers(vx:number,vy:number,level:number,bodyId:string){
    const x=vx*32,y=vy*32;
    for(const s of this.nativeSheets.values())if(Math.abs(s.level-level)<.05&&s.sea===(bodyId==='sea')
      &&x>=s.bounds.min.x&&x+32<=s.bounds.max.x&&y>=s.bounds.min.z&&y+32<=s.bounds.max.z)return true;
    return false;
  }
  sync(){
    if(this.epoch===this.terrain.waterEpoch)return;
    const field=friendsFloodWater(this.terrain);field.refresh();
    const groups=new Map<string,{cx:number;cy:number;bodyId:string;level:number;cells:{vx:number;vy:number;depth:number}[];sides:{positions:number[];depth:number}[]}>();
    const surfaces=[...field.exposed()];
    if(surfaces.length&&!this.mask){this.maskData=new Uint16Array(1500*1500*2);this.mask=new THREE.DataTexture(this.maskData,1500,1500,THREE.RGFormat,THREE.HalfFloatType);this.mask.minFilter=this.mask.magFilter=THREE.NearestFilter;this.maskUniform.value=this.mask;for(const m of this.materials)m.uniforms.excavationMaskEnabled.value=1;}
    const nextColumns=new Map<number,number>();
    for(const [column,s]of surfaces){
      const [vx,vy]=column.split(',').map(Number),cx=Math.floor(vx/16),cy=Math.floor(vy/16),id=`${cx},${cy}:${s.bodyId}:${s.level}`;
      const native=this.nativeCovers(vx,vy,s.level,s.bodyId);
      if(!native){let g=groups.get(id);if(!g){g={cx,cy,bodyId:s.bodyId,level:s.level,cells:[],sides:[]};groups.set(id,g);}g.cells.push({vx,vy,depth:s.depth});}
      if(this.maskData){const i=(vy*1500+vx)*2;nextColumns.set(i,THREE.DataUtils.toHalfFloat(s.level+1024));nextColumns.set(i+1,THREE.DataUtils.toHalfFloat(Math.max(.001,s.depth)*(native?1:-1)));}
    }
    const wet=[...field.cells()],wetKeys=new Set(wet.map(c=>`${c.vx},${c.vy},${c.vz}`));
    for(const c of wet)for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=c.vx+dx,ny=c.vy+dy;if(wetKeys.has(`${nx},${ny},${c.vz}`)||this.terrain.material(nx,ny,c.vz))continue;
      const hi=Math.min(c.level,(c.vz+1)*32),near=friendsLiveWaterAt(this.terrain,(nx+.5)*32,(ny+.5)*32,c.vz*32+.001);
      const lo=Math.max(c.vz*32,near?.level??-Infinity);if(lo>=hi)continue;
      const cx=Math.floor(c.vx/16),cy=Math.floor(c.vy/16),id=`${cx},${cy}:${c.bodyId}:${c.level}`;
      let g=groups.get(id);if(!g){g={cx,cy,bodyId:c.bodyId,level:c.level,cells:[],sides:[]};groups.set(id,g);}
      const x=c.vx*32-(cx*512+256),y=(cy*512+256)-c.vy*32;
      const a=dx?[x+(dx>0?32:0),y]:[x,y-(dy>0?32:0)],b=dx?[a[0],y-32]:[x+32,a[1]];
      // Plane-local Z becomes world elevation after the sheet's rotation.
      g.sides.push({positions:[a[0],a[1],lo-c.level,b[0],b[1],hi-c.level,b[0],b[1],lo-c.level,a[0],a[1],lo-c.level,a[0],a[1],hi-c.level,b[0],b[1],hi-c.level],depth:hi-lo});
    }
    for(const c of wet){
      if(wetKeys.has(`${c.vx},${c.vy},${c.vz-1}`)||this.terrain.material(c.vx,c.vy,c.vz-1))continue;
      const below=friendsLiveWaterAt(this.terrain,(c.vx+.5)*32,(c.vy+.5)*32,c.vz*32-.01);
      if(below&&below.level>=c.vz*32)continue;
      const cx=Math.floor(c.vx/16),cy=Math.floor(c.vy/16),id=`${cx},${cy}:${c.bodyId}:${c.level}`;
      let g=groups.get(id);if(!g){g={cx,cy,bodyId:c.bodyId,level:c.level,cells:[],sides:[]};groups.set(id,g);}
      const x=c.vx*32-(cx*512+256),y=(cy*512+256)-c.vy*32,z=c.vz*32-c.level;
      g.sides.push({positions:[x,y,z,x+32,y-32,z,x+32,y,z,x,y,z,x,y-32,z,x+32,y-32,z],depth:c.level-c.vz*32});
    }
    if(this.maskData&&this.mask){let changed=false;
      for(const [i]of this.maskedColumns)if(!nextColumns.has(i)){this.maskData[i]=0;changed=true;}
      for(const [i,level]of nextColumns)if(this.maskData[i]!==level){this.maskData[i]=level;changed=true;}
      if(changed)this.mask.needsUpdate=true;this.maskedColumns=nextColumns;
    }
    for(const [id,old]of this.sheets)if(!groups.has(id)){this.release(old.mesh);this.sheets.delete(id);}
    for(const [id,g]of groups){
      g.cells.sort((a,b)=>a.vy-b.vy||a.vx-b.vx);
      // Save edit ordering must not turn equivalent faces into GPU rebuilds.
      g.sides.sort((a,b)=>{for(let i=0;i<a.positions.length;i++){const delta=a.positions[i]-b.positions[i];if(delta)return delta;}return a.depth-b.depth;});const stamp=JSON.stringify([g.cells,g.sides]),old=this.sheets.get(id);if(old?.stamp===stamp)continue;
      if(old)this.release(old.mesh);
      const depths=new Map(g.cells.map(c=>[`${c.vx},${c.vy}`,c.depth]));
      const mesh=islandWater(g.cx*512+256,g.cy*512+256,512,512,g.level,(x,y)=>depths.get(`${Math.floor(x/32)},${Math.floor(y/32)}`)??-32,false,16,new THREE.BufferGeometry());
      // Exact flat heads contain water inside narrow cavities and meet banks
      // without moving the top cell into a solid ceiling.
      mesh.material.fragmentShader=mesh.material.fragmentShader.replace('if(depth<=1.', 'if(depth<=0.');mesh.material.uniforms.waveAmplitude.value=0;mesh.material.uniforms.ocean.value=g.bodyId==='sea'?1:0;
      // Excavation sheets use ocean colour, but do not belong to its moving
      // near/far patch. Its world-origin fade would make coastal holes invisible.
      mesh.material.uniforms.oceanPatchBlend.value=0;
      mesh.material.uniforms.shorebreakStrength.value=0;mesh.material.uniforms.waterLightDirection=this.atmosphere.lightDirection;mesh.material.uniforms.waterLightColor=this.atmosphere.lightColor;mesh.material.uniforms.waterDirectStrength=this.atmosphere.directStrength;mesh.material.uniforms.waterTint=this.atmosphere.surfaceTint;mesh.material.uniforms.waterHorizon={value:this.atmosphere.horizon};mesh.material.uniforms.waterZenith={value:this.atmosphere.zenith};
      mesh.material.vertexShader='attribute float excavationDepth;varying float floodDepth;\n'+mesh.material.vertexShader.replace('void main(){vec4 w=', 'void main(){floodDepth=excavationDepth;vec4 w=');
      mesh.material.fragmentShader='varying float floodDepth;\n'+mesh.material.fragmentShader.replace('float depth=mix(256.,texture2D(bathymetry,clamp(uv,0.,1.)).r,inside);','float depth=floodDepth;');
      const positions:number[]=[],vertexDepths:number[]=[];
      for(const c of g.cells){const x=c.vx*32-(g.cx*512+256),y=(g.cy*512+256)-c.vy*32;positions.push(x,y,0,x+32,y-32,0,x+32,y,0,x,y,0,x,y-32,0,x+32,y-32,0);}
      for(const c of g.cells)vertexDepths.push(...Array(6).fill(c.depth));
      for(const side of g.sides){positions.push(...side.positions);vertexDepths.push(...Array(6).fill(side.depth));}
      mesh.geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));mesh.geometry.setAttribute("excavationDepth",new THREE.Float32BufferAttribute(vertexDepths,1));mesh.geometry.computeBoundingSphere();
      mesh.name=`flood-${id}`;this.add(mesh);this.sheets.set(id,{stamp,mesh});
    }
    this.epoch=this.terrain.waterEpoch;
  }
  update(seconds:number){for(const {mesh}of this.sheets.values())mesh.material.uniforms.time.value=seconds;}
  private release(mesh:THREE.Mesh){mesh.removeFromParent();mesh.geometry.dispose();(mesh.userData.bathymetry as THREE.Texture).dispose();(mesh.material as THREE.Material).dispose();}
  get stats(){return {floodDrawCalls:this.sheets.size,floodGeometryBytes:[...this.sheets.values()].reduce((n,s)=>n+s.mesh.geometry.getAttribute('position').array.byteLength+s.mesh.geometry.getAttribute('excavationDepth').array.byteLength,0),floodMaskBytes:this.maskData?.byteLength??0};}
  dispose(){for(const {mesh}of this.sheets.values())this.release(mesh);this.sheets.clear();for(const m of this.materials)m.uniforms.excavationMaskEnabled.value=0;this.mask?.dispose();this.maskUniform.value=null;this.materials.clear();this.nativeSheets.clear();this.removeFromParent();}
}
