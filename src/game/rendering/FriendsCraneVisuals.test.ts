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
  it('attaches an angled cable and tilted hook to the actual swinging cargo with reused geometry',()=>{
    const parent=new THREE.Group(),visual=new FriendsCraneVisuals(parent,new THREE.MeshStandardMaterial());
    const crane:FriendsCraneState={pieceId:1,x:1000,y:1000,z:400,rotation:0,mastExtension:0,boomExtension:0,length:200,mode:'hold',blocked:false,cargoId:'load'};
    const cargo={id:'load',x:1090,y:1020,z:286,angle:0,vx:0,vy:0,vz:0,spin:0};
    visual.update([crane],[cargo],{x:1000,y:1000,z:400});
    const hook=parent.getObjectByName('freight-crane-hooks') as THREE.InstancedMesh,rope=parent.getObjectByName('braided-hauling-rope') as THREE.Mesh;
    const geometry=rope.geometry,matrix=new THREE.Matrix4();hook.getMatrixAt(0,matrix);
    const position=new THREE.Vector3().setFromMatrixPosition(matrix);expect(position.x).toBe(1090);expect(position.z).toBe(1020);expect(position.y).toBe(334);
    const down=new THREE.Vector3(0,-1,0).transformDirection(matrix),expected=new THREE.Vector3(-30,-200,20).normalize();expect(down.distanceTo(expected)).toBeLessThan(.0001);
    cargo.x+=10;visual.update([crane],[cargo],{x:1000,y:1000,z:400});expect(rope.geometry).toBe(geometry);hook.getMatrixAt(0,matrix);expect(new THREE.Vector3().setFromMatrixPosition(matrix).x).toBe(1100);
    visual.dispose();
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

describe('telescopic crane visuals',()=>{
  it('updates giant stages on motion packets while retaining shared geometry and fixed foot transforms',async()=>{
    const {FriendsBuildVisuals}=await import('./FriendsBuildVisuals');
    const visual=new FriendsBuildVisuals(new THREE.Scene()),p={id:1,x:10000,y:10000,z:400,rotation:0,shape:'crane' as const,finish:'teal' as const,author:'Host',revision:1,mastExtension:0,boomExtension:0,craneAngle:0};
    const building={revision:1,guestsCanBuild:true,pieces:[p]};visual.update(building);
    const mesh=visual.group.getObjectByName('telescopic-crane-steel') as THREE.InstancedMesh,winch=visual.group.getObjectByName('telescopic-crane-winches') as THREE.InstancedMesh,geometry=mesh.geometry,matrix=new THREE.Matrix4();mesh.getMatrixAt(0,matrix);const foot=matrix.clone();
    visual.update({...building,pieces:[{...p,mastExtension:2912,boomExtension:2888,craneAngle:Math.PI/2}]});mesh.getMatrixAt(0,matrix);
    expect(matrix.equals(foot)).toBe(true);expect(mesh.geometry).toBe(geometry);expect(mesh.count).toBeLessThan(128);winch.getMatrixAt(0,matrix);const tip=new THREE.Vector3().setFromMatrixPosition(matrix);expect(tip.x).toBeCloseTo(9936);expect(tip.z).toBeCloseTo(13072);expect(tip.y).toBeCloseTo(3450);
    visual.update({...building,pieces:[]});expect(mesh.visible).toBe(false);expect(winch.visible).toBe(false);visual.dispose();
  });
  it('keeps a giant crane cable visible to the operator beside its base',()=>{
    const parent=new THREE.Group(),visual=new FriendsCraneVisuals(parent,new THREE.MeshStandardMaterial());
    visual.update([{pieceId:1,x:10000,y:10000,z:0,rotation:0,mastExtension:2912,boomExtension:2888,angle:0,length:100,mode:'hold',blocked:false}],[],{x:9936,y:10060,z:0});
    expect(parent.getObjectByName('freight-crane-hooks')).toBeDefined();visual.dispose();
  });
});
