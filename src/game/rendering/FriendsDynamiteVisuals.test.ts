import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FriendsDynamiteVisuals } from './FriendsDynamiteVisuals';
import { friendsAudio } from '../FriendsAudio';
it('renders shared fuse and bounded explosion, plays once, and disposes expired effects',()=>{
  const scene=new THREE.Scene(), visuals=new FriendsDynamiteVisuals(scene), stop=vi.fn(),play=vi.spyOn(friendsAudio,'play').mockImplementation(cue=>cue==='dynamiteFuse'?{stop} as unknown as AudioBufferSourceNode:undefined);
  const charge={id:1,actorId:'host',x:8000,y:8000,z:38,atMs:0,explodeAtMs:3000}, listener={x:7940,y:8000,z:0};
  visuals.update({charges:[charge],blasts:[]},1000,listener);expect(scene.children[0].name).toBe('friends-dynamite-charge');
  const state={charges:[],blasts:[{...charge,destroyed:4}]};
  visuals.update(state,3100,listener);visuals.update(state,3200,listener);
  expect(scene.children).toHaveLength(1);expect(scene.children[0].name).toBe('friends-dynamite-explosion');expect(play.mock.calls.filter(c=>c[0]==='dynamiteExplosion')).toHaveLength(1);expect(play.mock.calls.filter(c=>c[0]==='dynamiteFuse')).toHaveLength(1);expect(play.mock.calls[0][5]).toMatchObject({loop:true});expect(stop).toHaveBeenCalledOnce();
  const debris=scene.children[0].children[8] as THREE.InstancedMesh;expect(debris.count).toBe(36);expect(Array.from(debris.instanceMatrix.array).every(Number.isFinite)).toBe(true);
  const smoke=scene.children[0].children[2] as THREE.Mesh;const dispose=vi.spyOn(smoke.material as THREE.Material,'dispose');
  visuals.update(state,5600,listener);expect(scene.children).toHaveLength(0);expect(dispose).toHaveBeenCalledOnce();visuals.dispose();play.mockRestore();
});
