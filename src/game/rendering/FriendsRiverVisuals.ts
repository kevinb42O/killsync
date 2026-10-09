import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FRIENDS_RIVERS, riverSampleAt, type RiverPoint } from '../world/FriendsHydrology';
import { ISLAND_LAKES, ISLAND_SEA_LEVEL, islandLakeRadius } from '../world/FriendsIsland';
import { friendsWaterGround } from '../world/FriendsWaterSurface';
import { RIVER_BRIDGE } from '../world/FriendsTerrain';

type WaterFactory=(cx:number,cy:number,w:number,h:number,level:number,depth:(x:number,y:number)=>number,ocean?:boolean,resolution?:number)=>THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;
/** Bounded ribbons, one shared time update per material; no fluid simulation. */
export class FriendsRiverVisuals extends THREE.Group{
  readonly waterMaterials:THREE.ShaderMaterial[]=[];
  constructor(water:WaterFactory,stone:THREE.MeshStandardMaterial){
    super();this.name='connected-island-rivers';
    for(const river of FRIENDS_RIVERS){
      const buckets=new Map<string,[RiverPoint,RiverPoint][]>();
      for(let i=0;i<river.points.length-1;i++){
        const a=river.points[i],b=river.points[i+1],key=`${Math.floor((a.x+b.x)/4096)},${Math.floor((a.y+b.y)/4096)}`;
        const list=buckets.get(key)||[];list.push([a,b]);buckets.set(key,list);
      }
      for(const [key,segments] of buckets){
        const points=segments.flat(),pad=Math.max(...points.map(p=>p.width))/2+64;
        const minX=Math.min(...points.map(p=>p.x))-pad,maxX=Math.max(...points.map(p=>p.x))+pad;
        const minY=Math.min(...points.map(p=>p.y))-pad,maxY=Math.max(...points.map(p=>p.y))+pad;
        const cx=(minX+maxX)/2,cy=(minY+maxY)/2;
        const mesh=water(cx,cy,maxX-minX,maxY-minY,0,(x,y)=>{
          const s=riverSampleAt(x,y);if(!s||s.riverId!==river.id||s.side>s.width*.57)return -32;
          const floor=friendsWaterGround(x,y);
          for(const lake of ISLAND_LAKES)if(Math.abs(s.level-lake.level)<1&&islandLakeRadius(x,y,lake)<1.15&&floor<lake.level)return -32;
          return s.level-floor;
        },false,96);
        mesh.geometry.dispose();mesh.rotation.set(0,0,0);mesh.position.set(cx,0,cy);
        const pos:number[]=[],uv:number[]=[],flow:number[]=[],tangent:number[]=[],indices:number[]=[];
        for(const [a,b] of segments){
          const start=pos.length/3;
          for(const p of [a,b])for(const side of [-1,0,1]){
            const offset=side*p.width*.56;
            pos.push(p.x-p.ty*offset-cx,p.z,p.y+p.tx*offset-cy);
            uv.push((side+1)/2,p.distance/64);flow.push(p.distance,side,p.roughness,p.z);tangent.push(p.tx,p.ty);
          }
          for(let side=0;side<2;side++){const n=start+side;indices.push(n,n+3,n+1,n+1,n+3,n+4);}
        }
        const geometry=new THREE.BufferGeometry();
        geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
        geometry.setAttribute('riverFlow',new THREE.Float32BufferAttribute(flow,4));geometry.setAttribute('riverTangent',new THREE.Float32BufferAttribute(tangent,2));
        geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();mesh.geometry=geometry;
        const material=mesh.material;material.uniforms.waveAmplitude.value=river.id==='reedwater'?2.4:3.5;
        material.vertexShader='attribute vec4 riverFlow;attribute vec2 riverTangent;varying vec4 streamFlow;varying vec2 streamTangent;\n'+material.vertexShader;
        material.vertexShader=material.vertexShader.replace('void main(){','void main(){streamFlow=riverFlow;streamTangent=riverTangent;');
        material.fragmentShader='varying vec4 streamFlow;varying vec2 streamTangent;\n'+material.fragmentShader;
        material.fragmentShader=material.fragmentShader.replace('float wave=swell(p),ripple=noise(p*.04+vec2(time*.10,-time*.08));',`
          vec2 drift=normalize(streamTangent)*time*(.35+streamFlow.z*.55);
          float wave=swell(p),ripple=noise(p*.035-drift);
          float current=noise(vec2(streamFlow.x*.065-time*(1.3+streamFlow.z*2.),streamFlow.y*5.));
        `);
        material.fragmentShader=material.fragmentShader.replace('foam*=.45+.55*noise(p/19.+time*.09);',`
          foam*=.45+.55*noise(p/19.+time*.09);
          float ribbons=pow(max(0.,sin(streamFlow.x*.046-time*(2.+streamFlow.z*3.)+current*5.)),12.);
          foam=max(foam,ribbons*(.08+streamFlow.z*.22)*(1.-smoothstep(.55,1.,abs(streamFlow.y))));
        `);
        // At the mouth the existing ocean owns the flat surface. This avoids
        // duplicate translucent planes and lets its bounded wave patch take over.
        material.fragmentShader=material.fragmentShader.replace('smoothstep(1.,14.,depth)*patchFade','smoothstep(1.,14.,depth)*patchFade*smoothstep(0.,4.,streamFlow.w-('+ISLAND_SEA_LEVEL.toFixed(1)+'))');
        mesh.name=`${river.id}-ribbon-${key}`;mesh.renderOrder=3;mesh.receiveShadow=false;
        this.add(mesh);this.waterMaterials.push(material);
      }
    }
    const masonry:THREE.BufferGeometry[]=[],trim:THREE.BufferGeometry[]=[];
    for(const box of RIVER_BRIDGE.boxes){
      const g=new THREE.BoxGeometry(box.w,box.h,box.d);g.rotateY(-box.angle);
      g.translate(box.x,box.z+box.h/2,box.y);(box.kind==='rail'?trim:masonry).push(g);
    }
    for(const [name,list,tint] of [['river-bridge-masonry',masonry,'#b9b5a2'],['river-bridge-parapets',trim,'#9faaa0']] as const){
      const geometry=mergeGeometries([...list]);if(!geometry)continue;
      const material=stone.clone();material.onBeforeCompile=stone.onBeforeCompile;material.customProgramCacheKey=stone.customProgramCacheKey;
      material.color.set(tint);material.roughness=.92;
      const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;this.add(mesh);
      list.forEach(g=>g.dispose());
    }
  }
}
