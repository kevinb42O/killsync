import { describe, expect, it } from 'vitest';
import { friendsWaterAt, friendsWaterDepth, friendsWaterGround, friendsWaterRenderDepth } from './FriendsWaterSurface';
import { FRIENDS_RIVERS } from './FriendsHydrology';
import { ISLAND_LAKES } from './FriendsIsland';
import { FriendsTerrain, skyfallWaterLevelAt } from './FriendsTerrain';
import { meshOrganicHorizon, organicHorizonHeightAt } from './FriendsHorizonMesh';
import { islandWater } from '../rendering/FriendsIslandVisuals';

// Flood actual 32-unit navigation cells rather than only centreline samples.
function connected(start:{x:number;y:number},end:{x:number;y:number}){
  const sx=Math.floor(start.x/32),sy=Math.floor(start.y/32),ex=Math.floor(end.x/32),ey=Math.floor(end.y/32);
  const queue:[[number,number]]|[number,number][]=[[sx,sy]],seen=new Set([`${sx},${sy}`]);
  for(let i=0;i<queue.length&&i<80000;i++){
    const [x,y]=queue[i];if(Math.abs(x-ex)<2&&Math.abs(y-ey)<2)return true;
    const current=friendsWaterAt(x*32+16,y*32+16)!;
    for(const [dx,dy]of [[-1,0],[1,0],[0,-1],[0,1]]){
      const xx=x+dx,yy=y+dy,key=`${xx},${yy}`;if(seen.has(key))continue;seen.add(key);
      const wet=friendsWaterAt(xx*32+16,yy*32+16);
      if(wet&&wet.depth>22&&Math.abs(wet.level-current.level)<12)queue.push([xx,yy]);
    }
  }return false;
}
describe('water geometry and actual navigation continuity',()=>{
  it('supports each steep Skyfalls sheet across full collision cells and joins the lake',()=>{
    const terrain=new FriendsTerrain();
    for(const start of [6464,7360])for(let y=18992;y<=20368;y+=16){
      const t=(y-18976)/1312,x=start+Math.sin(t*Math.PI)*96+Math.sin(t*8)*40;
      const source=skyfallWaterLevelAt(x,y)!,wet=friendsWaterAt(x,y)!;
      expect(wet,`cascade ${start} at ${y}`).toBeDefined();
      expect(terrain.floor(x,y,wet.level,0)!).toBeLessThan(wet.level-20);
      expect(friendsWaterGround(x,y)).toBeLessThan(wet.level-20);
      if(source.level<ISLAND_LAKES[0].level)expect(wet.bodyId).toBe('skyfalls');
    }
  });
  it('connects the interiors of both original lakes through Deepmere to the sea on a navigable raster',()=>{
    expect(connected(ISLAND_LAKES[0],ISLAND_LAKES[2])).toBe(true);
    expect(connected(ISLAND_LAKES[1],ISLAND_LAKES[2])).toBe(true);
    expect(connected(ISLAND_LAKES[2],FRIENDS_RIVERS[2].points.at(-1)!)).toBe(true);
  });
  it('uses real solid lake/river beds, including the open World Gate mouth, with no submerged dams',()=>{
    const terrain=new FriendsTerrain();
    for(const river of FRIENDS_RIVERS)for(let i=0;i<river.points.length;i+=5){const p=river.points[i];
      for(const offset of [-96,0,96]){
        const x=p.x-p.ty*offset,y=p.y+p.tx*offset,wet=friendsWaterAt(x,y)!;
        expect(wet,`${river.id} ${p.distance}`).toBeDefined();
        const bed=terrain.floor(x,y,wet.level,0);
        expect(bed).toBeDefined();expect(bed!).toBeLessThan(wet.level-35);
        expect(friendsWaterGround(x,y)).toBeLessThan(wet.level-35);
      }
    }
  });
  it('ends every inland river sheet against solid terrain rather than a low, uncontained air edge',()=>{
    for(const river of FRIENDS_RIVERS)for(let i=0;i<river.points.length;i+=16){
      const p=river.points[i],centre=friendsWaterAt(p.x,p.y);
      if(centre?.bodyId!==river.id||p.z<-166)continue;
      for(const sign of [-1,1]){
        let last=centre;
        for(let offset=p.width*.4;offset<p.width+160;offset+=16){
          const x=Math.floor((p.x-p.ty*offset*sign)/32)*32+16,y=Math.floor((p.y+p.tx*offset*sign)/32)*32+16;
          const wet=friendsWaterAt(x,y);if(wet){last=wet;continue;}
          expect(friendsWaterGround(x,y),`${river.id} unsupported bank near ${p.distance}, side ${sign}`).toBeGreaterThanOrEqual(last.level-2);
          break;
        }
      }
    }
  });
  it('buries every rendered river edge in both the collision banks and the distant terrain',()=>{
    for(const river of FRIENDS_RIVERS)for(const p of river.points)for(const sign of [-1,1]){
      const x=p.x-p.ty*p.width*.8*sign,y=p.y+p.tx*p.width*.8*sign;
      // Lake joins are owned by their basin; the sea owns the estuary.
      if(p.z<=-168.5||friendsWaterRenderDepth(x,y,river.id)<=0)continue;
      const label=`${river.id} bank at ${p.distance}, side ${sign}`;
      expect(friendsWaterGround(x,y),label).toBeGreaterThanOrEqual(p.z+2);
      expect(organicHorizonHeightAt(x,y),label).toBeGreaterThanOrEqual(p.z+2);
    }
  });
  it('contains both steep waterfall side edges through their lake transitions',()=>{
    for(let y=18992;y<=20368;y+=16)for(const start of [6464,7360]){
      const t=(y-18976)/1312,x=start+Math.sin(t*Math.PI)*96+Math.sin(t*8)*40;
      const cascade=skyfallWaterLevelAt(x,y)!;
      for(const sign of [-1,1]){
        const edge=x+sign*cascade.width*.8;
        if(friendsWaterRenderDepth(edge,y,cascade.id)<=0)continue;
        expect(friendsWaterGround(edge,y)).toBeGreaterThanOrEqual(cascade.level);
        expect(organicHorizonHeightAt(edge,y)).toBeGreaterThanOrEqual(cascade.level);
      }
    }
  });
  it('extends the render mask into dry station banks while keeping navigation dry',()=>{
    const p=FRIENDS_RIVERS[0].points.find(p=>p.x>7900&&p.x<8000&&p.z===442.5)!;
    const x=p.x-p.ty*p.width*.7,y=p.y+p.tx*p.width*.7;
    expect(friendsWaterAt(x,y)).toBeUndefined();
    expect(friendsWaterRenderDepth(x,y,'skyfalls-river')).toBeGreaterThan(0);
    expect(friendsWaterRenderDepth(x,y,'gate-river')).toBeLessThan(0);
  });
  it('keeps deep freshwater bed geometry visible to divers instead of applying the ocean-floor cull',()=>{
    const deep=meshOrganicHorizon(12032,23552,256);
    expect(deep.indices.length).toBeGreaterThan(0);expect([...deep.positions].some((v,i)=>i%3===1&&v===-416)).toBe(true);
  });
  it('aligns every neighbouring depth mask to the same physical cell lattice and gives each join one owner',()=>{
    const p=FRIENDS_RIVERS[2].points[30];
    const river=islandWater(p.x,p.y,800,800,p.z,(x,y)=>friendsWaterDepth(x,y,'reedwater'));
    const lake=islandWater(p.x+133,p.y-77,1100,1100,154.5,(x,y)=>friendsWaterDepth(x,y,'deepmere'));
    for(const mesh of [river,lake]){const u=mesh.material.uniforms;expect(u.waterOrigin.value.x%32).toBe(0);expect(u.waterOrigin.value.y%32).toBe(0);expect(u.waterExtent.value.x/u.bathymetry.value.image.width).toBe(32);}
    for(let x=p.x-250;x<p.x+250;x+=32)for(let y=p.y-250;y<p.y+250;y+=32){const wet=friendsWaterAt(x,y);if(!wet)continue;const owners=[...ISLAND_LAKES.map(l=>l.id),...FRIENDS_RIVERS.map(r=>r.id),'sea'].filter(id=>friendsWaterDepth(x,y,id)>0);expect(owners).toEqual([wet.bodyId]);}
    for(const m of [river,lake]){m.geometry.dispose();m.material.uniforms.bathymetry.value.dispose();m.material.dispose();}
    expect(Number.isFinite(organicHorizonHeightAt(6464,19000))).toBe(true);
  });
});
