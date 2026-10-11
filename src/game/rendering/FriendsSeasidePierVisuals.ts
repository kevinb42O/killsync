import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FRIENDS_SEASIDE_PIER as p, seasidePierDeck, seasidePierSupports, PIER_CAFE_TABLES, PIER_CAFE_CHAIRS } from '../world/FriendsSeasidePier';
import type { FriendsTerrain } from '../world/FriendsTerrain';
import { addFriendsAssetInstances } from './FriendsAssets';
import { createRailwayFinishes } from './FriendsRailwayFinish';

/** Blankenberge-inspired pleasure pier. Batched architectural geometry keeps
 * the long colonnade, balustrades, lights and pavilion inexpensive to draw. */
export function createFriendsSeasidePier(terrain:FriendsTerrain) {
  const group=new THREE.Group();group.name='belvedere-seaside-pier';group.userData.landmark=true;
  group.position.set(p.x,0,p.y);group.rotation.y=-p.angle;
  const finishes=createRailwayFinishes();
  const concrete=finishes.materials[3] as THREE.MeshStandardMaterial;concrete.color.set('#e4dfd1');
  const paving=finishes.materials[5] as THREE.MeshStandardMaterial;paving.color.set('#c7c3b7');
  const timber=finishes.materials[2],steel=finishes.materials[0] as THREE.MeshStandardMaterial;steel.color.set('#273d40');
  const roof=new THREE.MeshStandardMaterial({color:'#6e817d',metalness:.62,roughness:.48});
  const brass=new THREE.MeshStandardMaterial({color:'#b9a273',metalness:.7,roughness:.36});
  const glass=new THREE.MeshStandardMaterial({color:'#739ba2',metalness:.1,roughness:.3,transparent:true,opacity:.42,side:THREE.DoubleSide,depthWrite:false});
  glass.forceSinglePass=true;
  const glow=new THREE.MeshStandardMaterial({color:'#ffe2aa',emissive:'#ffd08a',emissiveIntensity:.65,roughness:.4});
  const cream=new THREE.MeshStandardMaterial({color:'#f4ead4',roughness:.68});
  const teal=new THREE.MeshStandardMaterial({color:'#285851',roughness:.8});
  const leaves=new THREE.MeshStandardMaterial({color:'#3b6542',roughness:.9});
  const terracotta=new THREE.MeshStandardMaterial({color:'#a87155',roughness:.9});
  const used=[cream,teal,leaves,terracotta,concrete,paving,timber,steel,roof,brass,glass,glow];
  for(const m of finishes.materials)if(!used.includes(m))m.dispose();
  // The frontier's resource disposer collects texture-valued material fields.
  for(const m of used)Object.assign(m,{pierGrain:finishes.grain});
  const batches=new Map<string,{material:THREE.Material;geometries:THREE.BufferGeometry[]}>();
  const floor=new THREE.MeshStandardMaterial({color:'#c7c3b7',roughness:.94});floor.name='pier-walking-floor';
  // One surface owns every floor pixel; café tiles are colour, not stacked boxes.
  floor.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec2 vPierFloor;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPierFloor=position.xz;');
    shader.fragmentShader='varying vec2 vPierFloor;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      if(length(vPierFloor-vec2(${p.length.toFixed(1)},0.))<${(p.pavilionRadius-10).toFixed(1)}){
        vec2 cell=(vPierFloor-vec2(${p.length.toFixed(1)},0.))/48.;
        float tile=mod(floor(cell.x)+floor(cell.y),2.);
        vec2 edge=min(fract(cell),1.-fract(cell));
        vec2 aa=max(fwidth(cell),vec2(.001));
        float grout=1.-min(smoothstep(.01,.01+aa.x,edge.x),smoothstep(.01,.01+aa.y,edge.y));
        diffuseColor.rgb=mix(mix(vec3(.84,.81,.72),vec3(.57,.55,.49),tile),vec3(.43,.42,.38),grout);
      }else if(vPierFloor.x>704.&&vPierFloor.x<3120.&&abs(vPierFloor.y)<180.){
        float joint=abs(mod(vPierFloor.x-704.+64.,128.)-64.);
        float line=1.-smoothstep(.4,.4+fwidth(vPierFloor.x),joint);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.14,.18,.18),line);
      }`);
  };
  floor.customProgramCacheKey=()=> 'seaside-pier-single-floor-v1';
  const add=(geometry:THREE.BufferGeometry,material:THREE.Material,x=0,y=0,z=0,rotation=0)=>{
    geometry.rotateY(rotation);geometry.translate(x,y,z);
    const flat=geometry.index?geometry.toNonIndexed():geometry;if(flat!==geometry)geometry.dispose();
    flat.computeBoundingBox();const center=flat.boundingBox!.getCenter(new THREE.Vector3());
    const zone=center.x<p.ramp?'landing':center.x<p.length-p.terraceRadius?'promenade':'pavilion';
    const key=material.uuid+':'+zone;
    let batch=batches.get(key);if(!batch){batch={material,geometries:[]};batches.set(key,batch);}batch.geometries.push(flat);
  };
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material=concrete,angle=0)=>add(new THREE.BoxGeometry(w,h,d),m,x,y,z,angle);
  const cylinder=(r:number,h:number,x:number,y:number,z:number,m:THREE.Material=concrete,top=r,segments=16)=>add(new THREE.CylinderGeometry(top,r,h,segments),m,x,y,z);
  const beam=(a:THREE.Vector3,b:THREE.Vector3,r:number,m:THREE.Material)=>{
    const geometry=new THREE.CylinderGeometry(r,r,a.distanceTo(b),8),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());
    geometry.applyQuaternion(q);const c=a.clone().add(b).multiplyScalar(.5);add(geometry,m,c.x,c.y,c.z);
  };
  const ring=(radius:number,y:number,m:THREE.Material,tube=2)=>{const g=new THREE.TorusGeometry(radius,tube,6,96);g.rotateX(Math.PI/2);add(g,m,p.length,y,0);};
  // A continuous, gently rising concrete entrance meets the natural beach.
  box(p.rampLanding,18,p.width,p.rampLanding/2,p.landing-9,0);
  const ramp=new THREE.BoxGeometry(p.ramp-p.rampLanding,18,p.width),positions=ramp.attributes.position;
  for(let i=0;i<positions.count;i++){const x=positions.getX(i)+(p.ramp+p.rampLanding)/2;positions.setX(i,x);positions.setY(i,positions.getY(i)-9+seasidePierDeck(x));}
  ramp.computeVertexNormals();add(ramp,concrete);
  // Union outline removes the gangway/terrace intersection and duplicate caps.
  const joinAngle=Math.asin(p.width/2/p.terraceRadius),joinX=p.length-Math.sqrt(p.terraceRadius**2-(p.width/2)**2);
  const outline=new THREE.Shape();outline.moveTo(p.ramp,p.width/2);outline.lineTo(joinX,p.width/2);
  outline.absarc(p.length,0,p.terraceRadius,Math.PI-joinAngle,-Math.PI+joinAngle,true);
  outline.lineTo(p.ramp,-p.width/2);outline.closePath();
  const slab=new THREE.ExtrudeGeometry(outline,{depth:18,bevelEnabled:false,curveSegments:48});
  slab.rotateX(Math.PI/2);slab.translate(0,p.deck-2,0);add(slab,concrete);
  const top=new THREE.ShapeGeometry(outline,48);top.rotateX(-Math.PI/2);top.translate(0,p.deck,0);add(top,floor);
  // Expansion joints are part of the floor shader, avoiding distant depth fights.
  const railEnd=p.length-Math.sqrt(p.terraceRadius**2-(p.width/2)**2);
  for(const side of [-1,1]){
    for(let x=0;x<=railEnd;x+=48){const y=seasidePierDeck(x);box(3,36,3,x,y+18,side*p.width/2,steel);}
    for(const h of [12,24,36]){
      beam(new THREE.Vector3(0,p.landing+h,side*p.width/2),new THREE.Vector3(p.rampLanding,p.landing+h,side*p.width/2),1.8,steel);
      beam(new THREE.Vector3(p.rampLanding,p.landing+h,side*p.width/2),new THREE.Vector3(p.ramp,p.deck+h,side*p.width/2),1.8,steel);
      beam(new THREE.Vector3(p.ramp,p.deck+h,side*p.width/2),new THREE.Vector3(railEnd,p.deck+h,side*p.width/2),1.8,steel);
    }
    beam(new THREE.Vector3(0,p.landing-12,side*(p.width/2-6)),new THREE.Vector3(p.rampLanding,p.landing-12,side*(p.width/2-6)),6,concrete);
    beam(new THREE.Vector3(p.rampLanding,p.landing-12,side*(p.width/2-6)),new THREE.Vector3(p.ramp,p.deck-12,side*(p.width/2-6)),6,concrete);
    box(p.length-p.ramp,24,12,(p.length+p.ramp)/2,p.deck-22,side*(p.width/2-6));
  }
  // Full footprint sampling prevents bases floating above a sloping seabed.
  const supports=seasidePierSupports((x,y)=>terrain.height(Math.floor(x/32),Math.floor(y/32)));
  group.userData.supports=supports;
  for(const pole of supports){const {along:x,across:z,top,bottom,radius}=pole;
    cylinder(radius,top-bottom,x,(top+bottom)/2,z,concrete,radius*.78);
    cylinder(radius+6,22,x,top-11,z);
    cylinder(radius+10,40,x,bottom+20,z);
  }
  for(let x=192;x<railEnd;x+=288)box(32,28,p.width-18,x,seasidePierDeck(x)-34,0);
  for(let i=0;i<16;i++){const a=i*Math.PI/8;box(90,24,32,p.length+Math.cos(a)*540,p.deck-36,Math.sin(a)*540,concrete,-a);}
  // Terrace balustrade, with a full-width opening at the promenade.
  for(let i=0;i<128;i++){const a=i*Math.PI*2/128,x=Math.cos(a)*p.terraceRadius,z=Math.sin(a)*p.terraceRadius;if(x<0&&Math.abs(z)<p.width/2)continue;
    box(3,36,3,p.length+x,p.deck+18,z,steel);
    const b=a+Math.PI*2/128,x2=Math.cos(b)*p.terraceRadius,z2=Math.sin(b)*p.terraceRadius;
    for(const h of [12,24,36])beam(new THREE.Vector3(p.length+x,p.deck+h,z),new THREE.Vector3(p.length+x2,p.deck+h,z2),1.8,steel);
  }
  // Art Deco pavilion: deep terrace, glazed rotunda, layered cornices and dome.
  const radius=p.pavilionRadius,segments=32;
  // Terrace slab already supports the pavilion; no overlapping pedestal cap.
  for(let i=0;i<segments;i++){
    const a=(i+.5)*Math.PI*2/segments,x=Math.cos(a)*radius,z=Math.sin(a)*radius;
    if(x<0&&Math.abs(z)<88)continue;
    const chord=2*radius*Math.sin(Math.PI/segments),angle=Math.PI/2-a;
    box(chord+2,48,12,p.length+x,p.deck+24,z,concrete,angle);
    add(new THREE.PlaneGeometry(chord-9,150),glass,p.length+x,p.deck+123,z,angle);
    box(chord+2,20,14,p.length+x,p.deck+208,z,concrete,angle);
    box(5,190,8,p.length+Math.cos(i*Math.PI*2/segments)*radius,p.deck+123,Math.sin(i*Math.PI*2/segments)*radius,steel,angle);
    box(chord,3,6,p.length+x,p.deck+122,z,brass,angle);
  }
  for(const [r,h,y] of [[radius+20,10,p.deck+224],[radius+34,10,p.deck+237],[radius+28,8,p.deck+248]])cylinder(r,h,p.length,y,0,concrete,r,64);
  const profile=[[radius+30,252],[radius+24,265],[radius*.92,285],[radius*.72,320],[radius*.46,347],[radius*.20,364],[0,370]].map(([r,y])=>new THREE.Vector2(r,p.deck+y));
  add(new THREE.LatheGeometry(profile,64),roof,p.length);
  for(let i=0;i<32;i++){const a=i*Math.PI*2/32;
    const curve=new THREE.CatmullRomCurve3(profile.slice(0,-1).map(v=>new THREE.Vector3(p.length+Math.cos(a)*v.x,v.y+1.5,Math.sin(a)*v.x)));
    add(new THREE.TubeGeometry(curve,20,1.8,4,false),brass);
  }
  cylinder(20,12,p.length,p.deck+373,0,brass);cylinder(2,90,p.length,p.deck+418,0,steel);
  box(36,20,1,p.length+18,p.deck+444,0,brass);
  // Open front portal and canopy; its opening matches the facade collision.
  for(const side of [-1,1]){box(18,224,22,p.length-radius-5,p.deck+112,side*92);box(6,204,5,p.length-radius-18,p.deck+102,side*102,brass);}
  box(80,10,224,p.length-radius-24,p.deck+218,0);box(80,3,216,p.length-radius-24,p.deck+225,0,roof);
  const bench=(x:number,z:number,angle=0)=>{
    const root=new THREE.Matrix4().makeRotationY(angle);root.setPosition(x,p.deck,z);
    const part=(w:number,h:number,d:number,dx:number,dy:number,dz:number,m:THREE.Material)=>{const g=new THREE.BoxGeometry(w,h,d);g.translate(dx,dy,dz);g.applyMatrix4(root);add(g,m);};
    for(const leg of [-28,28])part(4,16,20,leg,8,0,steel);
    for(const slat of [-7,0,7])part(72,3,5,0,17,slat,timber);
    for(const h of [28,35])part(72,5,3,0,h,10,timber);
    for(const leg of [-28,28])part(3,24,3,leg,24,11,steel);
  };
  const lamp=(x:number,z:number,y:number=p.deck)=>{
    cylinder(5,10,x,y+5,z,concrete);cylinder(2.5,114,x,y+64,z,steel);
    cylinder(11,4,x,y+123,z,steel);cylinder(9,18,x,y+112,z,glow);cylinder(11,6,x,y+102,z,brass);
    cylinder(12,7,x,y+128,z,steel,3);cylinder(1.6,12,x,y+137,z,brass);
  };
  for(let x=p.ramp+120;x<railEnd-80;x+=360){for(const side of [-1,1]){lamp(x,side*(p.width/2-18));bench(x+100,side*(p.width/2-40),side>0?Math.PI:0);}}
  for(let i=0;i<12;i++){const a=i*Math.PI*2/12;if(Math.cos(a)<-.9)continue;lamp(p.length+Math.cos(a)*590,Math.sin(a)*590);bench(p.length+Math.cos(a)*545,Math.sin(a)*545,-a-Math.PI/2);}
  // Entrance pylons make the landmark readable from the beach.
  for(const side of [-1,1]){const z=side*(p.width/2+22);box(44,142,44,60,seasidePierDeck(60)+71,z);box(54,8,54,60,seasidePierDeck(60)+146,z,steel);lamp(60,z,seasidePierDeck(60)+150);}
  // A tiled café floor, brass borders and timber soffit warm the rotunda.
  ring(radius-28,p.deck+1,brass,.6);ring(240,p.deck+1,brass,.6);
  cylinder(radius-8,4,p.length,p.deck+222,0,timber,radius-8,64);
  ring(radius-32,p.deck+214,glow,3);ring(170,p.deck+205,brass,3);
  // Central chandelier leaves the main walking aisle open.
  cylinder(2,40,p.length,p.deck+202,0,brass);
  ring(78,p.deck+180,brass,2);
  for(let i=0;i<8;i++){const a=i*Math.PI/4,x=p.length+Math.cos(a)*78,z=Math.sin(a)*78;
    beam(new THREE.Vector3(p.length,p.deck+210,0),new THREE.Vector3(x,p.deck+184,z),1.2,brass);
    cylinder(7,12,x,p.deck+177,z,glow);cylinder(10,4,x,p.deck+185,z,brass,5);
  }
  for(const table of PIER_CAFE_TABLES){const x=table.along,z=table.across;
    cylinder(29,3,x,p.deck+30,z,cream);cylinder(30,1,x,p.deck+28,z,brass);
    cylinder(2,26,x,p.deck+13,z,steel);cylinder(14,2,x,p.deck+1,z,steel);
    // Small ceramic vase, fresh stems and two cups with saucers.
    cylinder(2.8,6,x,p.deck+35,z,terracotta,2);
    for(const dx of [-2,0,2]){beam(new THREE.Vector3(x,p.deck+37,z),new THREE.Vector3(x+dx,p.deck+45,z+dx),.45,leaves);cylinder(1.8,2,x+dx,p.deck+46,z+dx,cream);}
    for(const side of [-1,1]){cylinder(4,.7,x+side*13,p.deck+32,z,cream);cylinder(2.7,4,x+side*13,p.deck+34,z,cream);cylinder(2.1,.3,x+side*13,p.deck+36.2,z,timber);}
    cylinder(14,5,x,p.deck+191,z,brass,7);cylinder(11,5,x,p.deck+187,z,glow);cylinder(1,26,x,p.deck+208,z,steel);
  }
  // Plant pots sit between tables, keeping chairs and all exits clear.
  for(let i=0;i<12;i++){const a=(i+.5)*Math.PI/6,x=p.length+Math.cos(a)*398,z=Math.sin(a)*398;
    cylinder(11,18,x,p.deck+10,z,terracotta,15);cylinder(15,3,x,p.deck+20,z,brass);
    for(let j=0;j<5;j++){const b=j*Math.PI*2/5;beam(new THREE.Vector3(x,p.deck+21,z),new THREE.Vector3(x+Math.cos(b)*12,p.deck+48+j*3,z+Math.sin(b)*12),1,leaves);
      add(new THREE.SphereGeometry(7,8,6),leaves,x+Math.cos(b)*12,p.deck+48+j*3,z+Math.sin(b)*12);}
  }
  // A compact service console and framed menu face the entrance.
  box(100,28,24,p.length+396,p.deck+14,0,teal);box(104,3,28,p.length+396,p.deck+30,0,timber);
  for(const z of [-32,0,32])box(2,23,25,p.length+396,p.deck+15,z,brass);
  box(3,44,62,p.length+435,p.deck+93,0,brass);box(4,38,56,p.length+432,p.deck+93,0,teal);
  for(const y of [83,92,101])box(1,1,34,p.length+429,p.deck+y,0,cream);
  const placements=PIER_CAFE_CHAIRS.map(c=>({x:c.along,y:p.deck+2,z:c.across,rotation:Math.PI/2-(c.angle-p.angle)}));
  const configureFurniture=(mesh:THREE.InstancedMesh,detail:boolean)=>{
    const matrices=placements.map((_,i)=>{const matrix=new THREE.Matrix4();mesh.getMatrixAt(i,matrix);return matrix;});
    mesh.userData.pierFurniture={detail,matrices,mask:''};mesh.userData.chairCapacity=placements.length;
  };
  const detailed=new THREE.Group(),distant=new THREE.Group();
  detailed.name='pier-chairs-detailed';distant.name='pier-chairs-distant';group.add(detailed,distant);
  const loadFurniture=(owner:THREE.Group,id:'pierChair'|'pierChairLod',detail:boolean)=>
    addFriendsAssetInstances(owner,id,{x:26,y:40,z:26},placements).then(ready=>{
      owner.traverse(child=>{if(child instanceof THREE.InstancedMesh)configureFurniture(child,detail);});return ready;
    });
  void Promise.all([loadFurniture(detailed,'pierChair',true),loadFurniture(distant,'pierChairLod',false)]).then(results=>{group.userData.chairsReady=results.every(Boolean);});
  // Spatial material batches can be culled independently; weld shared vertices.
  for(const {material,geometries} of batches.values()){
    const merged=mergeGeometries(geometries)!,indexed=mergeVertices(merged);
    merged.dispose();geometries.forEach(g=>g.dispose());const mesh=new THREE.Mesh(indexed,material);
    mesh.name='pier-'+(material===glass?'glazing':'architecture');
    mesh.castShadow=material!==glass&&material!==glow&&material!==floor;mesh.receiveShadow=true;group.add(mesh);
  }
  group.userData.modelReady=true;
  return group;
}

/** Keep expensive scans near the viewer; simplified scans preserve the café. */
export function updateFriendsSeasidePier(group:THREE.Group,camera:THREE.Camera){
  const local=group.worldToLocal(camera.getWorldPosition(new THREE.Vector3()));
  const close=PIER_CAFE_CHAIRS.map(c=>Boolean(group.userData.chairsReady)&&(c.along-local.x)**2+(p.deck-local.y)**2+(c.across-local.z)**2<180**2);
  const mask=close.map(Number).join('');
  group.traverse(child=>{if(!(child instanceof THREE.InstancedMesh))return;
    const furniture=child.userData.pierFurniture;if(!furniture||furniture.mask===mask)return;
    let count=0;close.forEach((near,i)=>{if(near===furniture.detail)child.setMatrixAt(count++,furniture.matrices[i]);});
    child.count=count;child.visible=count>0;child.instanceMatrix.needsUpdate=true;furniture.mask=mask;
  });
}
