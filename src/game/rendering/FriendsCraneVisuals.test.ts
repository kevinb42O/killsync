import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {FriendsCraneVisuals} from './FriendsCraneVisuals';
import {createCraneGeometry,createCraneHookGeometry} from './FriendsCraneGeometry';
import {createFriendsBuildMaterial,prepareFriendsBuildGeometry} from './FriendsBuildVisuals';
import type {FriendsCraneState} from '../multiplayer/FriendsCrane';

describe('freight crane rendering budget',()=>{
  it('merges the detailed device into one cheap, texture-free instanced mesh',()=>{
    const g=prepareFriendsBuildGeometry(createCraneGeometry(),'crane'),hook=createCraneHookGeometry();
    const m=createFriendsBuildMaterial('crane','teal') as THREE.MeshStandardMaterial;
    expect(g.groups).toHaveLength(0);expect(g.getAttribute('color')).toBeDefined();expect(g.getIndex()!.count/3).toBeLessThan(2200);
    expect(hook.getIndex()!.count/3).toBeLessThan(400);expect(m.vertexColors).toBe(true);expect(m.map).toBeNull();
    g.dispose();hook.dispose();m.dispose();
  });
  it('reuses stationary rope buffers, instances hooks and culls distant devices',()=>{
    const parent=new THREE.Group(),visuals=new FriendsCraneVisuals(parent,new THREE.MeshStandardMaterial());
    const crane:FriendsCraneState={pieceId:1,x:880,y:1000,z:400,rotation:0,length:486,mode:'hold',blocked:false};
    const viewer={x:1000,y:1200,z:0};visuals.update([crane,{...crane,pieceId:2,x:10000}],[],viewer);
    const group=parent.children[0],rope=group.children.find(c=>c.name==='braided-hauling-rope') as THREE.Mesh;
    const version=(rope.geometry.getAttribute('position') as THREE.BufferAttribute).version;
    const hook=group.children.find(c=>c.name==='freight-crane-hooks') as THREE.InstancedMesh;expect(hook.count).toBe(1);
    for(let i=0;i<120;i++)visuals.update([crane],[],viewer);
    expect((rope.geometry.getAttribute('position') as THREE.BufferAttribute).version).toBe(version);expect(rope.castShadow).toBe(false);
    visuals.update([{...crane,length:400}],[],viewer);expect((rope.geometry.getAttribute('position') as THREE.BufferAttribute).version).toBeGreaterThan(version);
    visuals.update([crane],[],{x:20000,y:20000,z:0});expect(group.children.filter(c=>c.name==='braided-hauling-rope')).toHaveLength(0);expect(hook.visible).toBe(false);
    visuals.dispose();expect(parent.children).toHaveLength(0);
  });
});

describe('articulated crane instance transforms',()=>{
  it('poses socket members on motion-only snapshots without allocating geometry',async()=>{
    const {FriendsBuildVisuals,createFriendsBuildGeometry}=await import('./FriendsBuildVisuals');
    const {resolveFriendsBuildPieces}=await import('../multiplayer/FriendsBuilding');
    const {craneSocketPose}=await import('../multiplayer/FriendsCraneAssemblies');
    const root={id:1,x:1000,y:1000,z:400,rotation:0,shape:'crane_joint' as const,finish:'teal' as const,author:'Host',revision:1},parts=[root];
    parts.push({...root,...craneSocketPose(parts,root,'crane_boom',0)!,id:2,shape:'crane_boom' as any});
    const visual=new FriendsBuildVisuals(new THREE.Scene()),building={revision:1,guestsCanBuild:true,pieces:parts};visual.update(building);
    const mesh=visual.group.getObjectByName('creation:crane_boom:teal:world') as THREE.InstancedMesh,geometry=mesh.geometry,material=mesh.material,matrix=new THREE.Matrix4();
    visual.update({...building,pieces:resolveFriendsBuildPieces(parts,[],new Map([[1,Math.PI/4]]))});mesh.getMatrixAt(0,matrix);
    const point=new THREE.Vector3().setFromMatrixPosition(matrix);expect(point.x).toBeCloseTo(1000+48/Math.sqrt(2),3);expect(point.z).toBeCloseTo(1000+48/Math.sqrt(2),3);expect(mesh.geometry).toBe(geometry);expect(mesh.material).toBe(material);
    for(const shape of ['crane_joint','crane_boom','crane_winch','crane_console'] as const){const g=prepareFriendsBuildGeometry(createFriendsBuildGeometry(shape),shape);expect(g.groups).toHaveLength(0);expect(g.getIndex()!.count/3).toBeLessThan(2000);g.dispose();}
    visual.dispose();
  });
  it('renders no phantom hook on a pivot without a winch',()=>{
    const parent=new THREE.Group(),visual=new FriendsCraneVisuals(parent,new THREE.MeshStandardMaterial());visual.update([{pieceId:1,x:1000,y:1000,z:400,rotation:0,length:100,mode:'hold',blocked:false,hasWinch:false}],[],{x:1000,y:1000,z:400});expect(parent.getObjectByName('freight-crane-hooks')).toBeUndefined();visual.dispose();
  });
});
