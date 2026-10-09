import { describe, expect, it } from 'vitest';
import { CASTLE_TOWERS, createHighfallCastle, HIGHFALL_CASTLE as c } from './FriendsCastle';
import { baseTerrainHeight, CASTLE_STAIRS, FriendsTerrain } from './FriendsTerrain';
import { meshIslandRuins } from './FriendsIslandRuinMesh';
import { islandArchRange } from './FriendsIsland';

const castle=createHighfallCastle(baseTerrainHeight);
describe('Crown of Highfall fortress',()=>{
  it('grounds a substantial voxel fortress in a broad irregular mountain, preserving the natural vault',()=>{
    expect(castle.boxes.length).toBeGreaterThan(700);
    expect(Math.max(...castle.boxes.map(b=>b.z+b.h))-c.floor).toBeGreaterThan(1800);
    for(const b of castle.boxes)expect([b.x-b.w/2,b.y-b.d/2,b.z,b.w,b.d,b.h].every(n=>n%32===0)).toBe(true);
    // The original mountain remains broad. Exposed arch mouths use their
    // actual cavity floor rather than rendering a solid mountain above air.
    const heights=[-3000,-1500,0,1500,3000].map(dx=>baseTerrainHeight(c.x+dx,c.y,false));
    expect(new Set(heights).size).toBe(5);expect(heights[0]).toBeGreaterThan(1400);expect(heights[4]).toBeGreaterThan(1400);
    expect(heights[2]).toBeLessThan(c.foundation);
    expect(baseTerrainHeight(c.x-3000,c.y)).toBe(islandArchRange(c.x-3000,c.y)![0]);
    const t=new FriendsTerrain(),x=17040,y=12016,arch=islandArchRange(x,y)!;
    expect(t.material(Math.floor(x/32),Math.floor(y/32),arch[0]/32+4)).toBe(0);
  });
  it('preserves the open gate and great hall, and lands the approach flush on the ridge',()=>{
    const t=new FriendsTerrain(),end=castle.route.at(-1)!;
    expect(baseTerrainHeight(end.x,end.y)).toBe(end.z);
    for(let y=c.y+1024;y<c.y+1280;y+=32)expect(t.material(c.x/32,Math.floor(y/32),c.floor/32+3),'gate opening').toBe(0);
    expect(t.material(Math.floor((c.x+128)/32),Math.floor((c.y-672)/32),c.floor/32+3),'great hall interior').toBe(0);
    expect(t.floor(c.x,c.y+1216,4448,0)).toBe(4448);
  });
  it('connects the ward, hall, cloisters, tower rooms and complete wall circuit at player scale',()=>{
    const t=new FriendsTerrain();
    for(const side of [-1,1]){
      expect(t.floor(c.x+side*488,c.y+800,4448,0),'paving below hidden stair backing').toBe(4448);
      expect(t.supports(c.x+side*488,c.y+800,4448)).toBe(true);
    }
    const walk=(points:number[][],height:number)=>{
      for(let i=1;i<points.length;i++){
        const a=points[i-1],b=points[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/8);
        for(let j=0;j<=n;j++){
          const p={x:c.x+a[0]+(b[0]-a[0])*j/n,y:c.y+a[1]+(b[1]-a[1])*j/n};
          const label=`route at ${Math.round(p.x-c.x)},${Math.round(p.y-c.y)} elevation ${height}`;
          expect(t.floor(p.x,p.y,height,0),label).toBe(height);
          expect(t.collide({...p},height,19,50,0),label).toBe(false);
        }
      }
    };
    walk([[0,1216],[0,800],[320,800],[320,128],[0,128],[0,-128],[320,-128],[320,-672],[320,-1184],[0,-1184],[0,-1440]],4448);
    for(const side of [-1,1]){
      walk([[side*320,320],[side*800,320],[side*800,-1376],[side*1440,-1376],[side*1440,-1664],[side*1536,-1664]],4448);
      walk([[side*800,0],[side*1104,0],[side*1104,-1120]],4448);
      walk([[side*320,320],[side*1280,320],[side*1280,1056],[side*1536,1056],[side*1536,1152]],4448);
    }
    walk([[-1536,832],[-1536,-1664],[1536,-1664],[1536,1152],[-1536,1152],[-1536,832]],5088);
    walk([[-384,-416],[-544,-416],[-544,-1184],[432,-1184],[432,-1248],[608,-1248],[608,-1056],[544,-1056],[544,-160],[0,-160],[-544,-160],[-544,-416]],5824);
  });
  it('grounds every brazier and reaches bedrock beneath each exposed bridge socket',()=>{
    const t=new FriendsTerrain();
    for(const tower of CASTLE_TOWERS)for(const dx of [-tower.size/2+16,tower.size/2-16])for(const dy of [-tower.size/2+16,tower.size/2-16]){
      const x=c.x+tower.dx+dx,y=c.y+tower.dy+dy;
      for(let z=Math.ceil(baseTerrainHeight(x,y)/32)*32;z<4448;z+=32)expect(t.material(Math.floor(x/32),Math.floor(y/32),z/32),'continuous tower foundation').not.toBe(0);
    }
    for(const p of castle.torches)expect(t.material(Math.floor(p.x/32),Math.floor(p.y/32),Math.floor(p.z/32)-1),`torch at ${p.x},${p.y}`).not.toBe(0);
    for(const b of castle.boxes.filter(b=>b.detail==='stair-pier')){
      expect(b.z).toBeLessThanOrEqual(baseTerrainHeight(b.x,b.y));
      expect(t.material(Math.floor(b.x/32),Math.floor(b.y/32),b.z/32-1),'pier socket').not.toBe(0);
    }
  });
  it('meshes a single exposed castle boundary with outward faces and no duplicate coplanar quads',()=>{
    const mesh=meshIslandRuins(),faces=new Set<string>();
    expect(mesh.positions.length/3).toBeLessThan(70000);
    for(let offset=0;offset<mesh.positions.length;offset+=18){
      const p=Array.from(mesh.positions.slice(offset,offset+18)),n=Array.from(mesh.normals.slice(offset,offset+3));
      const key=`${n.join(',')}:${[...new Set(Array.from({length:6},(_,i)=>p.slice(i*3,i*3+3).join(',')))].sort().join(';')}`;
      expect(faces.has(key),'duplicate masonry face').toBe(false);faces.add(key);
      const a=p.slice(0,3),b=p.slice(3,6).map((v,i)=>v-a[i]),d=p.slice(6,9).map((v,i)=>v-a[i]);
      const cross=[b[1]*d[2]-b[2]*d[1],b[2]*d[0]-b[0]*d[2],b[0]*d[1]-b[1]*d[0]];
      expect(cross.reduce((sum,v,i)=>sum+v*n[i],0),'outward winding').toBeGreaterThan(0);
    }
  });
});

describe('the fan stairs and spiral',()=>{
  it('uses shallow risers, shared curve joints and no right-angle changes in heading',()=>{
    const flights=new Set(CASTLE_STAIRS.treads.map(t=>t.flight));
    for(const flight of flights){
      const treads=CASTLE_STAIRS.treads.filter(t=>t.flight===flight);
      for(let i=0;i<treads.length;i++){
        const t=treads[i];expect(Math.hypot(t.b.x-t.a.x,t.b.y-t.a.y)).toBeGreaterThan(.001);
        if(!i)continue;const previous=treads[i-1];
        expect(Math.abs(t.z-previous.z)).toBeLessThanOrEqual(8);
        expect(Math.hypot(t.a.x-previous.b.x,t.a.y-previous.b.y)).toBeLessThan(.001);
        expect(t.nxA*previous.nxB+t.nyA*previous.nyB).toBeGreaterThan(.995);
      }
    }
  });
  it('walks every tread in both directions across three lanes without snags or missing floors',()=>{
    const terrain=new FriendsTerrain();
    for(const t of CASTLE_STAIRS.treads)for(const lane of [-.6,0,.6]){
      const p={x:(t.a.x+t.b.x)/2+(t.nxA+t.nxB)/2*t.width/2*lane,y:(t.a.y+t.b.y)/2+(t.nyA+t.nyB)/2*t.width/2*lane};
      expect(Math.abs((terrain.floor(p.x,p.y,t.z,8)??-10000)-t.z),`${t.flight}: floor`).toBeLessThanOrEqual(8);
      const q={...p};expect(terrain.collide(q,t.z,19),`${t.flight}: snag at ${Math.round(p.x)}, ${Math.round(p.y)}`).toBe(false);
      expect(Number.isFinite(q.x)&&Number.isFinite(q.y)).toBe(true);
    }
  });
  it('has clear overhead for a player on each centre tread, including beneath the keep roof',()=>{
    const terrain=new FriendsTerrain();
    for(const t of CASTLE_STAIRS.treads){
      const x=(t.a.x+t.b.x)/2,y=(t.a.y+t.b.y)/2,ceiling=terrain.ceiling(x,y,t.z);
      expect(ceiling===undefined||ceiling-t.z>=50,`${t.flight}: headroom`).toBe(true);
    }
  });
  it('makes the continuous parapets solid without moving the centre of the stair',()=>{
    for(const t of CASTLE_STAIRS.treads.filter((t,i)=>i%32===0&&Math.max(t.railA,t.railB)>8)){
      const x=(t.a.x+t.b.x)/2,y=(t.a.y+t.b.y)/2,nx=(t.nxA+t.nxB)/2,ny=(t.nyA+t.nyB)/2;
      const p={x:x+nx*(t.width/2-8),y:y+ny*(t.width/2-8)};
      expect(CASTLE_STAIRS.collide(p,t.z,19)).toBe(true);
      expect(Number.isFinite(p.x)&&Number.isFinite(p.y)).toBe(true);
      expect(CASTLE_STAIRS.collide({x,y},t.z,19)).toBe(false);
    }
  });
});
