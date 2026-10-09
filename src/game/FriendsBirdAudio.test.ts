import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { FriendsBirdAudio } from './FriendsBirdAudio';
import { FRIENDS_CUE_ASSETS } from './FriendsAudio';
import type { FriendlyBird } from './multiplayer/FriendsBirds';

const bird=(extra:Partial<FriendlyBird>={}):FriendlyBird=>({id:1,variant:0,phase:'approach',atMs:0,x:60,y:-60,z:27,from:{x:60,y:-60,z:27},target:{x:60,y:-60,z:27},angle:0,...extra});
function fixture(){
  const sink={play:vi.fn(),prepareBirds:vi.fn()},audio=new FriendsBirdAudio(sink,()=>.5),camera=new THREE.PerspectiveCamera();camera.position.set(0,27,0);
  return {sink,audio,camera};
}
describe('recorded feeding-bird audio',()=>{
  it('plays arrival wings and species calls with irregular quiet gaps instead of a loop or frame repeats',()=>{
    const {audio,sink,camera}=fixture(),b=bird({variant:1});
    for(let now=0;now<1500;now+=50)audio.update([b],camera,now,'local');expect(sink.play).not.toHaveBeenCalled();
    audio.update([b],camera,1500,'local');audio.update([b],camera,1550,'local');expect(sink.play.mock.calls.map(c=>c[0])).toEqual(['birdWings']);
    b.phase='feeding';b.atMs=2200;audio.update([b],camera,2200,'local');
    expect(sink.play.mock.calls.map(c=>c[0])).toEqual(['birdWings','birdBlueTit']);
    for(let now=2250;now<13200;now+=50)audio.update([b],camera,now,'local');expect(sink.play).toHaveBeenCalledTimes(2);
    audio.update([b],camera,13200,'local');expect(sink.play).toHaveBeenCalledTimes(3);
    expect(sink.play.mock.calls.every(c=>c[3]===1&&c[5].ambience)).toBe(true);
    b.phase='leaving';b.atMs=14000;b.burningUntil=18000;audio.update([b],camera,14000,'local');audio.update([b],camera,14050,'local');
    expect(sink.play.mock.calls.slice(-2).map(c=>c[0])).toEqual(['birdWings','birdStartled']);
  });
  it('uses stereo direction, attenuates distant birds and keeps the hand companion audible',()=>{
    const {audio,sink,camera}=fixture();
    audio.update([bird({phase:'feeding'})],camera,0,'local');
    const right=sink.play.mock.calls[0];expect(right[5].pan).toBeGreaterThan(.6);
    audio.update([bird({id:2,x:-60,phase:'feeding'})],camera,1000,'local');expect(sink.play.mock.calls.at(-1)![5].pan).toBeLessThan(-.6);
    audio.update([bird({id:3,x:450,phase:'feeding'})],camera,2000,'local');expect(sink.play.mock.calls.at(-1)![1]).toBeLessThan(right[1]/3);
    const before=sink.play.mock.calls.length;audio.update([bird({id:4,x:2000,phase:'feeding'})],camera,3000,'local');expect(sink.play).toHaveBeenCalledTimes(before);
    audio.update([bird({id:5,ownerId:'local',variant:2,phase:'perched'})],camera,4000,'local');
    audio.update([bird({id:5,ownerId:'local',variant:2,phase:'perched'})],camera,10000,'local');
    expect(sink.play.mock.calls.at(-1)![0]).toBe('birdSparrow');expect(sink.play.mock.calls.at(-1)![5].pan).toBe(.22);
    audio.dispose();audio.update([],camera,20000,'local');expect(sink.play.mock.calls.length).toBe(before+1);
  });
  it('bounds flock chatter so twelve birds do not make simultaneous calls',()=>{
    const {audio,sink,camera}=fixture(),flock=Array.from({length:12},(_,id)=>bird({id,phase:'feeding',variant:id%3}));
    audio.update(flock,camera,0,'local');expect(sink.play).toHaveBeenCalledTimes(1);
    for(let now=50;now<1000;now+=50)audio.update(flock,camera,now,'local');expect(sink.play).toHaveBeenCalledTimes(1);
  });
  it('ships twelve distinct real recordings with source attribution, licenses and verified hashes',()=>{
    const manifest=JSON.parse(readFileSync('public/audio/friends/sources.json','utf8')),assets=manifest.assets.filter((a:any)=>a.pack==='birdFieldRecordings');
    expect(assets).toHaveLength(12);expect(new Set(assets.map((a:any)=>a.sha256)).size).toBe(12);
    for(const cue of ['birdRobin','birdBlueTit','birdSparrow','birdWings','birdStartled'] as const){
      for(const url of FRIENDS_CUE_ASSETS[cue]){
        const filename=url.split('/').at(-1),path='public/audio/friends/'+filename,entry=assets.find((a:any)=>a.file===filename);
        expect(existsSync(path)).toBe(true);const data=readFileSync(path);expect(data.subarray(0,4).toString()).toBe('OggS');
        expect(entry.sourcePage).toMatch(/^https:/);expect(entry.license).toMatch(/^CC/);expect(entry.author).toBeTruthy();
        expect(createHash('sha256').update(data).digest('hex')).toBe(entry.sha256);
      }
    }
  });
});
