import * as THREE from 'three';
import { FRIENDS_BREAKWATERS, BREAKWATER_HALF_WIDTH, BREAKWATER_RAMP, breakwaterPoint, breakwaterTop } from '../world/FriendsBreakwaters';

/** Three static draw calls per groyne; each groyne has independent frustum bounds.
 * Shared low-poly geometry, instance colours, no shadows or per-frame updates. */
export function createFriendsBreakwaters(){
  const group=new THREE.Group();group.name='coastal-golfbrekers';group.userData.landmark=true;
  const stone=new THREE.MeshStandardMaterial({color:'#a4a39a',roughness:1});
  const coreMaterial=new THREE.MeshStandardMaterial({color:'#555952',roughness:1});
  const shape=new THREE.Shape();shape.moveTo(-.5,-.5);shape.lineTo(.5,-.5);shape.lineTo(.5,.5);shape.lineTo(-.5,.5);shape.closePath();
  const cap=new THREE.ExtrudeGeometry(shape,{depth:.65,bevelEnabled:true,bevelSize:.055,bevelThickness:.055,bevelSegments:1,steps:1});
  cap.rotateX(-Math.PI/2);cap.translate(0,-.705,0);
  const rock=new THREE.IcosahedronGeometry(1,0),dummy=new THREE.Object3D();
  const color=new THREE.Color();
  for(const [index,b] of FRIENDS_BREAKWATERS.entries()){
    const root=new THREE.Group();root.name=b.id;root.position.set(b.x,0,b.y);root.rotation.y=-Math.atan2(b.s,b.c);group.add(root);
    const positions:number[]=[],indices:number[]=[];
    for(const along of [0,BREAKWATER_RAMP,b.length])for(const across of [-BREAKWATER_HALF_WIDTH,-80,80,BREAKWATER_HALF_WIDTH])positions.push(along,breakwaterTop(along,across)-1,across,along,b.bottom,across);
    const quad=(a:number,b:number,c:number,d:number)=>indices.push(a,b,d,b,c,d);
    for(let a=0;a<2;a++)for(let c=0;c<3;c++)quad(a*8+c*2,a*8+(c+1)*2,(a+1)*8+(c+1)*2,(a+1)*8+c*2);
    for(let a=0;a<2;a++){quad(a*8+1,a*8,(a+1)*8,(a+1)*8+1);quad(a*8+6,a*8+7,(a+1)*8+7,(a+1)*8+6);}
    for(const a of [0,2])for(let c=0;c<3;c++){const n=a*8+c*2;if(a===0)quad(n,n+1,n+3,n+2);else quad(n+2,n+3,n+1,n);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const body=new THREE.Mesh(geometry,coreMaterial);body.name='groyne-foundation';body.receiveShadow=true;root.add(body);
    const rows=Math.ceil(b.length/48),paving=new THREE.InstancedMesh(cap,stone,rows*4);paving.name='groyne-walkable-stones';
    let n=0;for(let row=0;row<rows;row++)for(let col=0;col<4;col++){
      const length=b.length/rows,along=(row+.5)*length,across=-60+col*40;
      dummy.position.set(along,breakwaterTop(along),across);dummy.rotation.set(0,0,along<BREAKWATER_RAMP?Math.atan(1/6):0);dummy.scale.set(length-1.2,18,39);dummy.updateMatrix();paving.setMatrixAt(n,dummy.matrix);
      const shade=.76+((row*17+col*31+index*13)%19)/95;color.setRGB(shade,shade*.99,shade*.94);paving.setColorAt(n++,color);
    }paving.computeBoundingSphere();paving.receiveShadow=true;root.add(paving);
    const rubble=new THREE.InstancedMesh(rock,stone,rows*4);rubble.name='groyne-rubble';n=0;
    for(let row=0;row<rows;row++)for(const side of [-1,1])for(const tier of [0,1]){
      const along=(row+.5)*b.length/rows,across=side*(104+tier*36);
      dummy.position.set(along,breakwaterTop(along,across)-24,across);dummy.rotation.set(row*.7,index+row*.31,tier*.8);dummy.scale.set(30,26,28);dummy.updateMatrix();rubble.setMatrixAt(n,dummy.matrix);
      const shade=.48+((row*13+tier*7+index*3)%17)/75;color.setRGB(shade,shade*1.02,shade*.95);rubble.setColorAt(n++,color);
    }rubble.computeBoundingSphere();rubble.receiveShadow=true;root.add(rubble);
    root.userData.tip=breakwaterPoint(b,b.length);root.userData.walkable=true;
  }return group;
}
