import { describe, expect, it } from 'vitest';
import { FriendsBuildSpatialIndex } from './FriendsInteractionTargeting';
import { FRIENDS_BUILD_SHAPES, friendsBuildCeiling, friendsBuildFloor, friendsWalkFloor, resolveFriendsBuildCollisions, type FriendsBuildPiece } from './FriendsBuilding';

const piece = (id:number, x:number, y:number, shape:FriendsBuildPiece['shape']='cube', rotation=0):FriendsBuildPiece =>
  ({id,x,y,z:0,shape,rotation,finish:'stone',author:'Host',revision:1});

describe('indexed Friends movement queries', () => {
  it('matches all build shapes in 8000 seeded queries with stacked and rotated geometry', () => {
    let seed=0xdecafbad;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
    const index=new FriendsBuildSpatialIndex();
    for(let world=0;world<40;world++){
      const pieces=Array.from({length:64},(_,i)=>({...piece(i+1,8192+Math.floor(random()*16)*64,8192+Math.floor(random()*16)*64,FRIENDS_BUILD_SHAPES[i%FRIENDS_BUILD_SHAPES.length],Math.floor(random()*4)),z:Math.floor(random()*8)*32}));
      index.update(pieces,world);
      for(let sample=0;sample<200;sample++){
        const p=pieces[Math.floor(random()*pieces.length)],x=p.x+(random()-.5)*256,y=p.y+(random()-.5)*256,z=p.z+(random()-.25)*256,radius=12+random()*30,near=index.near(x,y,radius+65);
        expect(friendsBuildFloor(near,x,y,z)).toEqual(friendsBuildFloor(pieces,x,y,z));
        expect(friendsBuildCeiling(near,x,y,z)).toEqual(friendsBuildCeiling(pieces,x,y,z));
        expect(friendsWalkFloor(near,x,y,z,radius)).toEqual(friendsWalkFloor(pieces,x,y,z,radius));
        const full={x,y},indexed={x,y};
        expect(index.collide(pieces,indexed,z,radius)).toBe(resolveFriendsBuildCollisions(pieces,full,z,radius));
        expect(indexed.x).toBeCloseTo(full.x,8);expect(indexed.y).toBeCloseTo(full.y,8);
      }
    }
  });
  it('matches full scans at cell boundaries, ramps, stairs, thin openings, and rail padding', () => {
    const shapes:FriendsBuildPiece['shape'][] = ['cube','ramp','stairs','voxel_stairs','doorway','window','slab','rail_straight'];
    const pieces = Array.from({length:256}, (_,i) => piece(i+1,2048+i%16*192,2048+Math.floor(i/16)*192,shapes[i%shapes.length],i%4));
    const index = new FriendsBuildSpatialIndex(); index.update(pieces,1);
    for (let i=0;i<pieces.length;i++) {
      const p=pieces[i];
      for (const [dx,dy,z] of [[0,0,0],[31,0,16],[63,0,32],[0,63,0],[-33,-33,80],[96,0,-16]]) {
        const x=p.x+dx,y=p.y+dy,radius=19,near=index.near(x,y,radius+65);
        expect(friendsBuildFloor(near,x,y,z)).toEqual(friendsBuildFloor(pieces,x,y,z));
        expect(friendsBuildCeiling(near,x,y,z)).toEqual(friendsBuildCeiling(pieces,x,y,z));
        expect(friendsWalkFloor(near,x,y,z,radius)).toEqual(friendsWalkFloor(pieces,x,y,z,radius));
        const full={x,y},indexed={x,y};
        expect(index.collide(pieces,indexed,z,radius)).toBe(resolveFriendsBuildCollisions(pieces,full,z,radius));
        expect(indexed.x).toBeCloseTo(full.x,8);expect(indexed.y).toBeCloseTo(full.y,8);
      }
    }
  });
  it('preserves construction order and chained collision pushes', () => {
    const pieces=[piece(1,4096,4096),piece(2,4160,4096),piece(3,4096,4160)];
    const index=new FriendsBuildSpatialIndex();index.update(pieces,1);
    const full={x:4110,y:4110},indexed={...full};
    expect(index.near(full.x,full.y,84).map(p=>p.id)).toEqual([1,2,3]);
    expect(index.collide(pieces,indexed,0,19)).toBe(resolveFriendsBuildCollisions(pieces,full,0,19));
    expect(indexed).toEqual(full);
  });
  it('refreshes moving candidates without rebuilding static cells and removes them on revisions', () => {
    const staticPiece=piece(1,4096,4096),moving={...piece(2,20000,20000),attachment:{vehicleId:'grand-3',x:0,y:0,z:0}};
    const index=new FriendsBuildSpatialIndex();index.update([staticPiece,moving],1);
    const next={...moving,x:4200};index.update([{...staticPiece},next],1);
    expect(index.near(4096,4096,84)).toEqual([staticPiece,next]);
    index.update([staticPiece],2);expect(index.near(4096,4096,84)).toEqual([staticPiece]);
  });
  it('reduces a 1024-piece world to local candidates', () => {
    const pieces=Array.from({length:1024},(_,i)=>piece(i+1,2048+i%32*192,2048+Math.floor(i/32)*192));
    const index=new FriendsBuildSpatialIndex();index.update(pieces,1);
    expect(index.near(2048,2048,84).length).toBeLessThan(10);
  });
});
