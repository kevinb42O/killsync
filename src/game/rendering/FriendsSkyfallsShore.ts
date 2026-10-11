import * as THREE from 'three';
import { ISLAND_LAKES, containedLakeRadius, skyfallCascadeAt } from '../world/FriendsWaterBodies';
import { baseTerrainHeight, terrainHash } from '../world/FriendsTerrain';
import { friendsWaterAt } from '../world/FriendsWaterSurface';
import { riverSampleAt, hydrologyProtected } from '../world/FriendsHydrology';

/** Small shoreline dressing follows the real wet/dry boundary, rather than a
 * decorative oval. Stones fit inside their supporting voxel and do not close
 * either waterfall inlet or the navigable outlet. Two shared draw calls. */
export function createSkyfallsShore(){
  const group=new THREE.Group();group.name='skyfalls-cobbles-and-bank-grasses';
  const lake=ISLAND_LAKES[0];
  const rocks:{x:number;y:number;z:number;seed:number;wet:boolean}[]=[],plants:typeof rocks=[];
  for(let x=4816;x<8016;x+=32)for(let y=19600;y<22224;y+=32){
    const seed=terrainHash(x/32,y/32,71);
    if(seed<.55||containedLakeRadius(x,y,lake)>1.25||hydrologyProtected(x,y))continue;
    if(skyfallCascadeAt(x,y)||riverSampleAt(x,y))continue;
    const z=baseTerrainHeight(x,y),wet=friendsWaterAt(x,y);
    if(wet&&wet.bodyId!==lake.id||z<lake.level-72||z>lake.level+80)continue;
    const nearWater=[[32,0],[-32,0],[0,32],[0,-32],[64,0],[-64,0],[0,64],[0,-64]]
      .some(([dx,dy])=>friendsWaterAt(x+dx,y+dy)?.bodyId===lake.id);
    if(!nearWater)continue;
    rocks.push({x,y,z,seed,wet:!!wet});
    if(!wet&&seed>.86&&y>20448)plants.push({x,y,z,seed,wet:false});
  }
  const rockMaterial=new THREE.MeshStandardMaterial({color:'#9a9e93',roughness:.91});
  const cobbles=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),rockMaterial,rocks.length);
  cobbles.name='skyfalls-shore-cobbles';cobbles.receiveShadow=true;
  const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),color=new THREE.Color();
  rocks.forEach((p,i)=>{
    const radius=5+p.seed*9,scale=new THREE.Vector3(radius,radius*(.35+terrainHash(i,22)*.4),radius*(.65+terrainHash(i,13)*.4));
    rotation.setFromEuler(new THREE.Euler(p.seed*.5,p.seed*19,terrainHash(i,3)*.4));
    matrix.compose(new THREE.Vector3(p.x,p.z+scale.y*.42,p.y),rotation,scale);cobbles.setMatrixAt(i,matrix);
    color.set(p.wet?'#778e87':'#bcc0aa').multiplyScalar(.78+terrainHash(i,19)*.3);cobbles.setColorAt(i,color);
  });
  cobbles.computeBoundingSphere();group.add(cobbles);
  // Narrow crossed leaves form sparse grass tufts on the quieter south shore.
  const positions:number[]=[];
  for(let blade=0;blade<5;blade++){
    const angle=blade*2.4,dx=Math.cos(angle),dy=Math.sin(angle),h=16+blade*3;
    positions.push(-dx*2,0,-dy*2,dx*2,0,dy*2,dx*5,h,dy*5);
  }
  const grassGeometry=new THREE.BufferGeometry();grassGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));grassGeometry.computeVertexNormals();
  const grasses=new THREE.InstancedMesh(grassGeometry,new THREE.MeshStandardMaterial({color:'#777f46',roughness:1,side:THREE.DoubleSide}),plants.length);
  grasses.name='skyfalls-bank-grass';
  plants.forEach((p,i)=>{
    rotation.setFromAxisAngle(new THREE.Vector3(0,1,0),p.seed*30);
    matrix.compose(new THREE.Vector3(p.x,p.z+.2,p.y),rotation,new THREE.Vector3(1,1+p.seed*.6,1));grasses.setMatrixAt(i,matrix);
  });
  grasses.computeBoundingSphere();group.add(grasses);
  return group;
}
