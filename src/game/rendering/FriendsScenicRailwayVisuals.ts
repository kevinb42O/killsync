import * as THREE from 'three';
import { scenicRailway, scenicStationPoses } from '../world/FriendsScenicRailway';
import { applyFriendsCaveLighting } from './FriendsCaveLighting';
import { sampleRailAlignment, railColumns, type RailSample } from '../world/FriendsRailAlignment';
import { baseTerrainHeight } from '../world/FriendsTerrain';
import { createRailwayFinishes,railArchGeometry,RAIL_FINISH as M } from './FriendsRailwayFinish';
import { surveyRailwaySections,sectionContains } from './FriendsRailwaySurvey';
import { ISLAND_SEA_LEVEL } from '../world/FriendsIsland';
import { scenicTunnelSections } from '../world/FriendsRailInfrastructure';

const BLOCK=2048;
type Box={x:number;y:number;z:number;w:number;h:number;d:number;angle:number;pitch:number;material:number;primitive?:number};
/** Static instanced infrastructure, spatially bounded so a island-wide line does not
 * submit every sleeper, pier or lamp to the GPU on every frame. */
export class FriendsScenicRailwayVisuals {
  readonly group=new THREE.Group();
  private chunks:{group:THREE.Group;x:number;y:number}[]=[];
  private lights:THREE.PointLight[]=[];
  private lamps:THREE.Vector3[]=[];
  private materials:THREE.Material[]=[];
  private geometry=new THREE.BoxGeometry(1,1,1);
  private primitives:THREE.BufferGeometry[]=[];
  private grain?:THREE.Texture;
  private pointLightRange=768;
  constructor(scene:THREE.Scene){
    this.group.name='sunline-grand-traverse';scene.add(this.group);
    const finish=createRailwayFinishes();this.materials=finish.materials;this.grain=finish.grain;
    const bed=new THREE.BufferGeometry();
    bed.setAttribute('position',new THREE.Float32BufferAttribute([-.5,-.5,-.5,.5,-.5,-.5,.5,-.5,.5,-.5,-.5,.5,-.5,.5,-.42,.5,.5,-.42,.5,.5,.42,-.5,.5,.42],3));
    bed.setIndex([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5]);bed.computeVertexNormals();bed.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1],2));
    const cable=new THREE.CylinderGeometry(.5,.5,1,8);cable.rotateZ(Math.PI/2);
    this.primitives=[this.geometry,bed,new THREE.CylinderGeometry(.38,.5,1,8),cable];
    const route=scenicRailway(),stations=scenicStationPoses(),buckets=new Map<string,Box[]>();
    const add=(b:Box)=>{const key=`${Math.floor(b.x/BLOCK)},${Math.floor(b.y/BLOCK)}`,list=buckets.get(key)||[];list.push(b);buckets.set(key,list);};
    const on=(p:RailSample,side:number,up:number,w:number,h:number,d:number,mat:number,pitch=p.pitch,primitive=0)=>add({x:p.x-Math.sin(p.angle)*side,y:p.y+Math.cos(p.angle)*side,z:p.z+up,w,h,d,angle:p.angle,pitch,material:mat,primitive});
    const beam=(a:THREE.Vector3,b:THREE.Vector3,width:number,mat:number,primitive=0)=>{
      const delta=b.clone().sub(a),mid=a.clone().add(b).multiplyScalar(.5);
      add({x:mid.x,y:mid.z,z:mid.y,w:delta.length(),h:width,d:width,angle:Math.atan2(delta.z,delta.x),pitch:Math.atan2(delta.y,Math.hypot(delta.x,delta.z)),material:mat,primitive});
    };
    const ground=(distance:number)=>{const p=sampleRailAlignment(route,distance);return baseTerrainHeight(p.x,p.y)-p.z;};
    const stationApproach=(distance:number)=>stations.some(s=>{const delta=Math.abs(s.distance-distance);return Math.min(delta,route.length-delta)<1536;});
    const tunnels=scenicTunnelSections();
    const bridges=surveyRailwaySections(route,d=>ground(d)<-64);
    const spans=surveyRailwaySections(route,d=>{const p=sampleRailAlignment(route,d);return (p.chapter===10||p.chapter===18)&&baseTerrainHeight(p.x,p.y)<ISLAND_SEA_LEVEL;}).filter(s=>s.end-s.start>1024);
    const atSide=(p:RailSample,side:number,up:number)=>new THREE.Vector3(p.x-Math.sin(p.angle)*side,p.z+up,p.y+Math.cos(p.angle)*side);
    // The deck strip uses the same centreline as physical support. Rails sit
    // 106 native units apart, with broad maintenance shoulders on each side.
    for(let s=0;s<route.length;s+=64){
      const end=Math.min(route.length,s+64),a=sampleRailAlignment(route,s),b=sampleRailAlignment(route,end),p=sampleRailAlignment(route,(s+end)/2),length=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)+.8,raised=sectionContains(bridges,p.distance);
      on(p,0,-12,length,24,160,raised?M.steel:M.ballast,p.pitch,raised?0:1);
      if(ground(p.distance)>12)on(p,0,-26,length,4,224,M.ballast);
      // Distinct foot, web and polished head give the rail an actual section.
      for(const side of [-53,53]){on(p,side,1,length,2,10,M.rail);on(p,side,4,length,4,3,M.steel);on(p,side,7,length,2,7,M.rail);}
      if(raised)for(const side of [-76,76]){
        on(p,side,44,length,3,3,M.zinc);on(p,side,24,length,2,2,M.zinc);on(p,side,5,length,8,3,M.steel);
        if(s%128===0){on(p,side,22,3,44,3,M.zinc);on(p,side,2,9,3,9,M.steel);}
      }
      if(!raised){const h=baseTerrainHeight(p.x,p.y);if(h<p.z-24&&h>p.z-64)on(p,0,(h+p.z-24)/2-p.z,length,p.z-24-h,144,M.ballast);}
    }
    for(let s=0;s<route.length;s+=32){const p=sampleRailAlignment(route,s);
      on(p,0,-1,10,5,128,M.timber);
      for(const side of [-53,53]){on(p,side,.8,12,1.5,17,M.steel);for(const edge of [-7,7])on(p,side+edge,2.5,3,2,2,M.zinc);}
    }
    for(const bridge of bridges)if(bridge.end-bridge.start>128)for(const distance of [bridge.start,bridge.end]){
      const p=sampleRailAlignment(route,distance),h=baseTerrainHeight(p.x,p.y)-16,top=p.z-24;
      if(top>h)on(p,0,(top+h)/2-p.z,80,top-h,176,M.concrete,0);
      on(p,0,-27,80,6,184,M.platform,0);
    }
    for(let s=0;s<route.length;s+=512){
      const p=sampleRailAlignment(route,s),ground=baseTerrainHeight(p.x,p.y);
      if(p.z-ground<64||spans.some(span=>s>=span.start&&s<=span.end))continue;
      on(p,0,-42,48,16,176,M.concrete,0);
      for(const side of [-48,48])on(p,side,-29,20,10,36,M.rubber,0);
      for(const side of [-48,48]){
        const x=p.x-Math.sin(p.angle)*side,y=p.y+Math.cos(p.angle)*side,base=baseTerrainHeight(x,y)-24,height=p.z-50-base;
        if(height<=0||railColumns(route,x,y,144).some(q=>q.z<p.z-160&&q.z>base-64))continue;
        const width=height>320?44:32;
        add({x,y,z:(base+p.z-50)/2,w:width,h:height,d:40,angle:p.angle,pitch:0,material:M.concrete,primitive:2});
        add({x,y,z:base+12,w:width+20,h:24,d:64,angle:p.angle,pitch:0,material:3});
      }
    }
    // Compact Warren trusses: continuous top/bottom chords, alternating
    // diagonals and caps supported directly underneath the deck.
    for(let s=0;s<route.length;s+=128){
      const a=sampleRailAlignment(route,s),b=sampleRailAlignment(route,s+128);
      if(!sectionContains(bridges,s)||!sectionContains(bridges,s+128))continue;
      for(const side of [-68,68]){
        beam(atSide(a,side,-28),atSide(b,side,-28),7,0);
        beam(atSide(a,side,-72),atSide(b,side,-72),7,0);
        beam(atSide(a,side,s%256===0?-28:-72),atSide(b,side,s%256===0?-72:-28),5,0);
        beam(atSide(a,side,-28),atSide(a,side,-72),5,0);
      }
    }
    // Two modest towers per open-water cove span, with a continuous parabolic
    // cable. Tower positions and hanger lengths follow the actual alignment.
    for(const span of spans){
      for(const distance of [span.start,span.end]){const p=sampleRailAlignment(route,distance);
        for(const side of [-112,112]){on(p,side,32,80,64,64,M.concrete,0);on(p,side,64,64,4,48,M.zinc,0);
          const h=baseTerrainHeight(p.x-Math.sin(p.angle)*side,p.y+Math.cos(p.angle)*side)-24;
          if(h<p.z)on(p,side,(h-p.z)/2,64,p.z-h,72,M.concrete,0);
        }
      }
      const a=span.start+(span.end-span.start)*.22,b=span.end-(span.end-span.start)*.22,length=b-a;
      for(const distance of [a,b]){
        const p=sampleRailAlignment(route,distance);
        for(const side of [-112,112]){
          const x=p.x-Math.sin(p.angle)*side,y=p.y+Math.cos(p.angle)*side,base=baseTerrainHeight(x,y)-32,top=p.z+400;
          add({x,y,z:(base+top)/2,w:36,h:top-base,d:48,angle:p.angle,pitch:0,material:M.concrete,primitive:2});
          add({x,y,z:base+16,w:72,h:32,d:88,angle:p.angle,pitch:0,material:M.concrete});
          on(p,side,400,48,16,60,5,0);
        }
        on(p,0,370,32,24,252,3,0);
      }
      for(let d=a;d<b;d+=64){
        const p=sampleRailAlignment(route,d),q=sampleRailAlignment(route,Math.min(b,d+64)),t=(d-a)/length,u=(Math.min(b,d+64)-a)/length,h=180+220*(2*t-1)**2,h2=180+220*(2*u-1)**2;
        on(p,0,-17,12,14,236,M.steel);
        for(const side of [-112,112]){
          beam(atSide(p,side,h),atSide(q,side,h2),4,M.rail,3);
          beam(atSide(p,side,0),atSide(p,side,h),2.5,M.rail,3);
          on(p,side,-4,10,8,10,M.steel);
        }
      }
      for(const [lo,hi]of [[span.start,a],[b,span.end]])for(let d=lo;d<hi;d+=64){
        const p=sampleRailAlignment(route,d),q=sampleRailAlignment(route,Math.min(hi,d+64)),f=(d-lo)/(hi-lo),g=(Math.min(hi,d+64)-lo)/(hi-lo),h=lo===span.start?64+336*f:400-336*f,h2=lo===span.start?64+336*g:400-336*g;
        for(const side of [-112,112])beam(atSide(p,side,h),atSide(q,side,h2),4,M.rail,3);
      }
    }
    const tunnelMaterial=this.materials[M.masonry].clone() as THREE.MeshStandardMaterial;
    tunnelMaterial.onBeforeCompile=this.materials[M.masonry].onBeforeCompile;tunnelMaterial.customProgramCacheKey=this.materials[M.masonry].customProgramCacheKey;
    tunnelMaterial.side=THREE.FrontSide;applyFriendsCaveLighting(tunnelMaterial);this.materials.push(tunnelMaterial);
    // The lining's normals face into the bore. Its reverse faces use outdoor
    // stone and normal daylight whenever the roof emerges from the hillside.
    // Opposite face culling keeps the two finishes from competing for pixels.
    const tunnelExterior=this.materials[M.masonry].clone() as THREE.MeshStandardMaterial;
    tunnelExterior.onBeforeCompile=this.materials[M.masonry].onBeforeCompile;tunnelExterior.customProgramCacheKey=this.materials[M.masonry].customProgramCacheKey;
    tunnelExterior.color.set(0xaaa99d);tunnelExterior.side=THREE.BackSide;this.materials.push(tunnelExterior);
    const ribMaterial=this.materials[M.concrete].clone() as THREE.MeshStandardMaterial;ribMaterial.onBeforeCompile=this.materials[M.concrete].onBeforeCompile;ribMaterial.customProgramCacheKey=this.materials[M.concrete].customProgramCacheKey;applyFriendsCaveLighting(ribMaterial);this.materials.push(ribMaterial);
    const ribGeometry=railArchGeometry(110,34,104,28,10,.5),portalGeometry=railArchGeometry(172,94,112,36,72,.75);
    const ribs=new Map<string,THREE.Matrix4[]>(),linings=new Map<string,{positions:number[];uv:number[]}>();
    const placeArch=(geometry:THREE.BufferGeometry,material:THREE.Material,p:RailSample,name:string)=>{
      const mesh=new THREE.Mesh(geometry,material);mesh.position.set(p.x,p.z,p.y);mesh.rotation.set(0,-p.angle+Math.PI/2,0);mesh.castShadow=true;mesh.receiveShadow=true;mesh.name=name;
      const group=new THREE.Group();group.add(mesh);this.group.add(group);this.chunks.push({group,x:p.x,y:p.y});return mesh;
    };
    const profile:{side:number;up:number;arc:number}[]=[{side:-112,up:-24,arc:0},{side:-112,up:156,arc:180}];
    for(let i=1;i<=32;i++){const theta=Math.PI-i*Math.PI/32,side=112*Math.cos(theta),up=156+36*Math.sin(theta),last=profile.at(-1)!;profile.push({side,up,arc:last.arc+Math.hypot(side-last.side,up-last.up)});}
    profile.push({side:112,up:-24,arc:profile.at(-1)!.arc+180});
    for(const tunnel of tunnels){
      const entry=sampleRailAlignment(route,tunnel.start),exit=sampleRailAlignment(route,tunnel.end);
      for(const [p,direction]of [[entry,-1],[exit,1]] as const){
        placeArch(portalGeometry,this.materials[M.concrete],p,'rail-tunnel-portal');
        // Individually cut arch stones, recessed mortar joints and a keystone.
        for(let i=0;i<24;i++){
          const shape=new THREE.Shape(),lo=i*Math.PI/24+.003,hi=(i+1)*Math.PI/24-.003;
          shape.moveTo(116*Math.cos(lo),156+40*Math.sin(lo));shape.lineTo(164*Math.cos(lo),156+86*Math.sin(lo));shape.lineTo(164*Math.cos(hi),156+86*Math.sin(hi));shape.lineTo(116*Math.cos(hi),156+40*Math.sin(hi));shape.closePath();
          const stone=new THREE.ExtrudeGeometry(shape,{depth:84,bevelEnabled:true,bevelSize:.2,bevelThickness:.2,bevelSegments:1});stone.translate(0,0,-42);
          placeArch(stone,this.materials[M.platform],p,'rail-portal-arch-stone');
        }
        on(p,0,244,40,14,50,M.platform,0);
        for(const side of [-148,148]){on(p,side,38,68,124,38,M.masonry,0);on(p,side,103,74,8,44,M.platform,0);
          const q=sampleRailAlignment(route,p.distance+direction*100);beam(atSide(p,side,-16),atSide(q,Math.sign(side)*162,-16),14,M.concrete);
          beam(atSide(p,side,76),atSide(q,Math.sign(side)*162,36),12,M.platform);
          for(let i=0;i<5;i++){const t=(i+.5)/5,r=sampleRailAlignment(route,p.distance+direction*100*t),height=92-40*t;on(r,Math.sign(side)*(148+14*t),-16+height/2,21,height,14,M.masonry,0);}

        }
      }
      for(let d=tunnel.start+96;d<tunnel.end-36;d+=256){const p=sampleRailAlignment(route,d),key=`${Math.floor(p.x/BLOCK)},${Math.floor(p.y/BLOCK)}`,list=ribs.get(key)||[],dummy=new THREE.Object3D();
        dummy.position.set(p.x,p.z,p.y);dummy.rotation.y=-p.angle+Math.PI/2;dummy.updateMatrix();list.push(dummy.matrix.clone());ribs.set(key,list);
        for(const side of [-101,101]){on(p,side,114,14,18,9,M.steel,0);on(p,side,114,10,12,10,M.light,0);on(p,side,125,19,4,15,M.steel,0);}
        this.lamps.push(atSide(p,97,114));
      }
      for(let distance=tunnel.start;distance<tunnel.end;distance+=48){
        const end=Math.min(tunnel.end,distance+48),a=sampleRailAlignment(route,distance),b=sampleRailAlignment(route,end),p=sampleRailAlignment(route,(distance+end)/2),key=`${Math.floor(a.x/BLOCK)},${Math.floor(a.y/BLOCK)}`,data=linings.get(key)||{positions:[],uv:[]};
        for(let i=0;i<profile.length-1;i++){
          const lo=profile[i],hi=profile[i+1],v=[atSide(a,lo.side,lo.up),atSide(b,lo.side,lo.up),atSide(b,hi.side,hi.up),atSide(a,hi.side,hi.up)],uv=[[distance,lo.arc],[end,lo.arc],[end,hi.arc],[distance,hi.arc]];
          for(const index of [0,1,2,0,2,3]){const q=v[index];data.positions.push(q.x,q.y,q.z);data.uv.push(...uv[index]);}
        }
        linings.set(key,data);
        const length=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)+.5;
        for(const side of [-100,100]){on(p,side,-16,length,8,10,M.rubber);on(p,side,-11,length,3,12,M.zinc);on(p,side,-22,length,4,24,M.concrete);}
        on(p,107,136,length,2,2,M.steel);
      }
    }
    // Finish the exposed faces of shallow cuttings. These walls meet the
    // tunnel lining at its exact inner width, hiding the stepped excavation
    // margin without changing the railway's physical clearance or elevation.
    for(let distance=0;distance<route.length;distance+=48){
      const end=Math.min(route.length,distance+48),p=sampleRailAlignment(route,(distance+end)/2);
      if(sectionContains(tunnels,p.distance)||ground(p.distance)<12||stationApproach(p.distance))continue;
      for(const side of [-122,122]){
        const outer=atSide(p,Math.sign(side)*146,0),top=Math.min(224,baseTerrainHeight(outer.x,outer.z)-p.z+8);
        if(top<16)continue;
        on(p,side,(top-24)/2,end-distance+.7,top+24,20,M.masonry,0);
        on(p,side,top+2,end-distance+.7,4,26,M.platform,0);
      }
    }
    for(const [key,data]of linings){const [x,y]=key.split(',').map(Number),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(data.uv,2));geometry.computeVertexNormals();geometry.computeBoundingSphere();
      const mesh=new THREE.Mesh(geometry,tunnelMaterial);mesh.receiveShadow=true;mesh.name='rail-tunnel-lining';
      const exterior=new THREE.Mesh(geometry,tunnelExterior);exterior.receiveShadow=true;exterior.name='rail-tunnel-exterior';
      const group=new THREE.Group();group.add(mesh,exterior);this.group.add(group);this.chunks.push({group,x:(x+.5)*BLOCK,y:(y+.5)*BLOCK});
    }
    for(const [key,matrices]of ribs){const [x,y]=key.split(',').map(Number),mesh=new THREE.InstancedMesh(ribGeometry,ribMaterial,matrices.length);matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.computeBoundingSphere();mesh.name='rail-tunnel-ribs';mesh.receiveShadow=true;const group=new THREE.Group();group.add(mesh);this.group.add(group);this.chunks.push({group,x:(x+.5)*BLOCK,y:(y+.5)*BLOCK});}
    // Keep unused shared geometries owned even in worlds without a tunnel.
    this.primitives.push(ribGeometry,portalGeometry);
    const roofShape=new THREE.Shape();roofShape.moveTo(-110,0);roofShape.lineTo(0,11);roofShape.lineTo(110,0);roofShape.lineTo(110,4);roofShape.lineTo(0,15);roofShape.lineTo(-110,4);roofShape.closePath();
    const roofGeometry=new THREE.ExtrudeGeometry(roofShape,{depth:228,bevelEnabled:false});roofGeometry.translate(0,0,-114);this.primitives.push(roofGeometry);
    for(const station of stations){
      const p=station;
      on(p,232,3,2560,22,304,M.platform,0);
      on(p,84,14.5,2556,1,8,M.platform,0);
      for(let along=-1264;along<1270;along+=32){const q={...p,x:p.x+Math.cos(p.angle)*along,y:p.y+Math.sin(p.angle)*along};on(q,88,15,22,1.5,12,M.zinc,0);}
      for(let a=-1200;a<=1200;a+=240){
        const q={...p,x:p.x+Math.cos(p.angle)*a,y:p.y+Math.sin(p.angle)*a};
        for(const side of [102,272]){on(q,side,92,6,156,6,M.paint,0);on(q,side,17,18,6,18,M.zinc,0);
          for(const offset of [-50,50]){const r={...q,x:q.x+Math.cos(q.angle)*offset,y:q.y+Math.sin(q.angle)*offset};beam(atSide(q,side,139),atSide(r,side,168),4,M.paint);}
        }
        on(q,187,168,10,8,192,M.paint,0);
        const roof=new THREE.Mesh(roofGeometry,this.materials[M.paint]);roof.position.copy(atSide(q,184,176));roof.rotation.y=-q.angle+Math.PI/2;roof.name='rail-station-canopy';roof.receiveShadow=true;
        const canopy=new THREE.Group();canopy.add(roof);this.group.add(canopy);this.chunks.push({group:canopy,x:q.x,y:q.y});
        on(q,184,190,232,3,5,M.zinc,0);
        for(const side of [74,294])on(q,side,176,232,4,5,M.zinc,0);
        const bench={...q,x:q.x+Math.cos(q.angle)*60,y:q.y+Math.sin(q.angle)*60};
        for(const side of [248,254,260,266,272])on(bench,side,42,88,12,5,M.timber,0);
        for(const offset of [-32,32])on({...bench,x:bench.x+Math.cos(bench.angle)*offset,y:bench.y+Math.sin(bench.angle)*offset},260,25,6,22,24,M.paint,0);
        for(const up of [51,58,65])on(bench,274,up,88,5,4,M.timber,0);
        for(const offset of [-32,32])on({...bench,x:bench.x+Math.cos(bench.angle)*offset,y:bench.y+Math.sin(bench.angle)*offset},274,50,5,40,5,M.paint,0);
        on(q,108,149,34,7,15,M.steel,0);on(q,108,144,28,3,12,M.light,0);this.lamps.push(atSide(q,108,143));
      }
      on(p,272,132,264,36,4,M.paint,0);
      on(p,264,156,44,7,15,M.steel,0);on(p,264,151,36,3,12,M.light,0);this.lamps.push(atSide(p,256,150));
      const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;
      const ctx=canvas.getContext('2d')!;ctx.fillStyle='#233d36';ctx.fillRect(0,0,1024,128);ctx.strokeStyle='#d2c5a3';ctx.lineWidth=3;ctx.strokeRect(8,8,1008,112);ctx.font='600 45px Georgia';ctx.fillStyle='#eee7d4';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(station.name.toUpperCase(),512,64);
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
      const signMat=new THREE.MeshStandardMaterial({map:texture,roughness:.76,metalness:.12});this.materials.push(signMat);
      for(const face of [-1,1]){const sign=new THREE.Mesh(new THREE.PlaneGeometry(260,32),signMat),side=272+face*2.2;sign.position.set(p.x-Math.sin(p.angle)*side,p.z+132,p.y+Math.cos(p.angle)*side);sign.rotation.y=-p.angle+(face<0?Math.PI:0);this.group.add(sign);}
    }

    const dummy=new THREE.Object3D();
    for(const [key,boxes]of buckets){
      const [x,y]=key.split(',').map(Number),chunk=new THREE.Group();chunk.name=`rail-sector-${key}`;
      for(let mat=0;mat<this.materials.length;mat++)for(let primitive=0;primitive<4;primitive++){
        const list=boxes.filter(b=>b.material===mat&&(b.primitive||0)===primitive);if(!list.length)continue;
        const mesh=new THREE.InstancedMesh(this.primitives[primitive],this.materials[mat],list.length);
        list.forEach((b,i)=>{dummy.position.set(b.x,b.z,b.y);dummy.rotation.set(0,-b.angle,b.pitch,'YXZ');dummy.scale.set(b.w,b.h,b.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
        mesh.computeBoundingSphere();mesh.receiveShadow=true;chunk.add(mesh);
      }
      this.group.add(chunk);this.chunks.push({group:chunk,x:(x+.5)*BLOCK,y:(y+.5)*BLOCK});
    }
    for(let i=0;i<6;i++){const light=new THREE.PointLight(0xffd1a0,26000,this.pointLightRange,2);light.visible=false;this.group.add(light);this.lights.push(light);}
  }
  update(camera:THREE.Camera,enabled:boolean,viewDistance=11000){
    this.group.visible=enabled;if(!enabled)return;
    const p=camera.position;
    for(const c of this.chunks){const d=Math.hypot(c.x-p.x,c.y-p.z);c.group.visible=d<viewDistance;if(c.group.visible)for(const mesh of c.group.children)mesh.castShadow=d<2400;}
    const nearest=this.lamps.map(p=>({p,d:p.distanceTo(camera.position)})).filter(l=>l.d<this.pointLightRange).sort((a,b)=>a.d-b.d);
    this.lights.forEach((light,i)=>{light.visible=Boolean(nearest[i]);if(nearest[i])light.position.copy(nearest[i].p);});
  }
  dispose(){
    this.group.removeFromParent();const geometries=new Set<THREE.BufferGeometry>(this.primitives),textures=new Set<THREE.Texture>();
    this.group.traverse(o=>{const mesh=o as THREE.Mesh;if(mesh.geometry)geometries.add(mesh.geometry);if(o instanceof THREE.InstancedMesh)o.dispose();});
    this.lights.forEach(light=>light.dispose());this.lights=[];geometries.forEach(g=>g.dispose());
    for(const material of this.materials){const map=(material as THREE.MeshBasicMaterial).map;if(map)textures.add(map);material.dispose();}
    textures.forEach(t=>t.dispose());this.grain?.dispose();this.primitives=[];this.chunks=[];this.lamps=[];
  }
}
