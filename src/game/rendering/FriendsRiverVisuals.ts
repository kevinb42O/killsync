import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FRIENDS_RIVERS, riverSampleAt, type River, type RiverPoint } from '../world/FriendsHydrology';
import { ISLAND_SEA_LEVEL } from '../world/FriendsIsland';
import { friendsWaterRenderDepth } from '../world/FriendsWaterSurface';
import { RIVER_BRIDGE, skyfallWaterLevelAt } from '../world/FriendsTerrain';

type WaterFactory=(cx:number,cy:number,w:number,h:number,level:number,depth:(x:number,y:number)=>number,ocean?:boolean,resolution?:number)=>THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;
/** Bounded ribbons, one shared time update per material; no fluid simulation. */
export class FriendsRiverVisuals extends THREE.Group{
  readonly waterMaterials:THREE.ShaderMaterial[]=[];
  constructor(water:WaterFactory,stone:THREE.MeshStandardMaterial){
    super();this.name='connected-island-rivers';
    const cascades:River[]=[0,1].map(index=>{
      const points:RiverPoint[]=[];let distance=0;
      for(let y=18976;y<=20384;y+=16){const t=(y-18976)/1312,x=[6464,7360][index]+Math.sin(t*Math.PI)*96+Math.sin(t*8)*40,s=skyfallWaterLevelAt(x,y)!;
        const previous=points.at(-1);if(previous)distance+=Math.hypot(x-previous.x,y-previous.y);
        points.push({x,y,z:s.level,width:s.width,distance,tx:0,ty:1,roughness:1.4});
      }
      points.forEach((p,i)=>{const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],n=Math.hypot(b.x-a.x,b.y-a.y);p.tx=(b.x-a.x)/n;p.ty=(b.y-a.y)/n;});
      return {id:`skyfall-cascade-${index}`,name:'Skyfalls Cascade',source:'skyfalls',roughness:1.4,points,length:distance};
    });
    for(const river of [...FRIENDS_RIVERS,...cascades]){
      const buckets=new Map<string,[RiverPoint,RiverPoint][]>();
      for(let i=0;i<river.points.length-1;i++){
        const a=river.points[i],b=river.points[i+1],key=`${Math.floor((a.x+b.x)/4096)},${Math.floor((a.y+b.y)/4096)}`;
        const list=buckets.get(key)||[];list.push([a,b]);buckets.set(key,list);
      }
      for(const [key,segments] of buckets){
        const points=segments.flat(),pad=Math.max(...points.map(p=>p.width))*.8+64;
        const minX=Math.min(...points.map(p=>p.x))-pad,maxX=Math.max(...points.map(p=>p.x))+pad;
        const minY=Math.min(...points.map(p=>p.y))-pad,maxY=Math.max(...points.map(p=>p.y))+pad;
        const cx=(minX+maxX)/2,cy=(minY+maxY)/2;
        const mesh=water(cx,cy,maxX-minX,maxY-minY,0,
          (x,y)=>friendsWaterRenderDepth(x,y,river.id),false,Math.ceil(Math.max(maxX-minX,maxY-minY)/24));
        mesh.geometry.dispose();mesh.rotation.set(0,0,0);mesh.position.set(cx,0,cy);
        const pos:number[]=[],uv:number[]=[],flow:number[]=[],tangent:number[]=[],indices:number[]=[];
        for(const [a,b] of segments){
          const start=pos.length/3;
          for(const p of [a,b])for(const side of [-1,-.5,0,.5,1]){
            const offset=side*p.width*.8;
            const x=p.x-p.ty*offset,y=p.y+p.tx*offset,level=(river.id.startsWith('skyfall-cascade')?skyfallWaterLevelAt(x,y):riverSampleAt(x,y))?.level??p.z;
            pos.push(x-cx,level,y-cy);
            uv.push((side+1)/2,p.distance/64);flow.push(p.distance,side,p.roughness,level);tangent.push(p.tx,p.ty);
          }
          for(let side=0;side<4;side++){const n=start+side;indices.push(n,n+1,n+5,n+1,n+6,n+5);}
        }
        const geometry=new THREE.BufferGeometry();
        geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
        geometry.setAttribute('riverFlow',new THREE.Float32BufferAttribute(flow,4));geometry.setAttribute('riverTangent',new THREE.Float32BufferAttribute(tangent,2));
        geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();mesh.geometry=geometry;
        const material=mesh.material;material.uniforms.waveAmplitude.value=1.4;
        material.vertexShader='attribute vec4 riverFlow;attribute vec2 riverTangent;varying vec4 streamFlow;varying vec2 streamTangent;\n'+material.vertexShader;
        material.vertexShader=material.vertexShader.replace('void main(){','void main(){streamFlow=riverFlow;streamTangent=riverTangent;');
        material.vertexShader=material.vertexShader.replace('waveAmplitude*wavePatch','mix(5.,waveAmplitude,smoothstep(0.,24.,streamFlow.w-('+ISLAND_SEA_LEVEL.toFixed(1)+')))*wavePatch');
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
