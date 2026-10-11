import { frontierTrees, type FrontierSnapshot, type FrontierTree } from '../multiplayer/FriendsFrontier';
import { FriendsTerrain, terrainHash, FRIENDS_STEP_HEIGHT } from './FriendsTerrain';
import { lavaRiverTreeClearance } from './FriendsLavaRiver';
import { emberRetreatTreeClearance } from './FriendsRetreatSites';
import { FRIENDS_ROCK_PLANES } from './FriendsRockHull';

type RockForest = Pick<FrontierSnapshot, 'planted'> & { harvested: readonly string[] | ReadonlySet<string> };

export const FRIENDS_ROCK_SIZE = { x: 100, y: 55, z: 85 };
export type FriendsRock = { x:number; y:number; z:number; rotation:number; scale:number };
/** Keep the same stable decoration order in rendering, authority and prediction. */
export function friendsGroveRocks(trees:readonly FrontierTree[],terrain:FriendsTerrain):FriendsRock[] {
  return trees.flatMap(t=>Array.from({length:2},(_,i)=>{
    const x=t.x+Math.cos(i*2.4)*60,y=t.y+Math.sin(i*2.4)*60;
    return {x,y,z:terrain.surfaceHeight(x,y),rotation:i,scale:.6+terrainHash(x,y)};
  })).filter((_,i)=>i%13===0);
}
function local(rock:FriendsRock,x:number,y:number){
  const c=Math.cos(rock.rotation),s=Math.sin(rock.rotation),dx=(x-rock.x)/rock.scale,dy=(y-rock.y)/rock.scale;
  // Three.js rotates about the vertical axis toward negative world Z.
  return {x:c*dx-s*dy,y:s*dx+c*dy,c,s};
}
export function rockSurface(rock:FriendsRock,x:number,y:number){
  const p=local(rock,x,y);let top=Infinity,bottom=-Infinity;
  for(const [nx,ny,nz,d] of FRIENDS_ROCK_PLANES){const h=d-nx*p.x-ny*p.y;
    if(nz>1e-6)top=Math.min(top,h/nz);else if(nz< -1e-6)bottom=Math.max(bottom,h/nz);else if(h<0)return undefined;
  }
  return top>=bottom ? rock.z+top*rock.scale : undefined;
}
export function collideRock(rock:FriendsRock,p:{x:number;y:number},z:number,radius:number,height=50,step=FRIENDS_STEP_HEIGHT){
  const q=local(rock,p.x,p.y),low=(z+step-rock.z)/rock.scale,high=(z+height-rock.z)/rock.scale;
  let penetration=Infinity,best: number[]|undefined;
  for(const [nx,ny,nz,d] of FRIENDS_ROCK_PLANES){
    const horizontal=Math.hypot(nx,ny),edge=d-nz*(nz>=0?low:high)-nx*q.x-ny*q.y;
    if(horizontal<1e-6){if(edge<=0)return false;continue;}
    const gap=edge/horizontal+radius/rock.scale;if(gap<=1e-6)return false;
    if(gap<penetration){penetration=gap;best=[nx/horizontal,ny/horizontal];}
  }
  if(!best)return false;
  p.x+=(q.c*best[0]+q.s*best[1])*penetration*rock.scale;
  p.y+=(-q.s*best[0]+q.c*best[1])*penetration*rock.scale;
  return true;
}
/** Only the nearby nine grove cells are queried, with terrain/forest invalidation. */
export class FriendsRockCollisionCache {
  private rocks:FriendsRock[]=[];
  private cellX=NaN;
  private cellY=NaN;
  private terrain?:FriendsTerrain;
  private terrainRevision=-1;
  private waterEpoch=-1;
  private harvested?:RockForest['harvested'];
  private harvestedCount=-1;
  private removed=new Set<string>();
  private planted?:RockForest['planted'];
  private plantedValues:FrontierTree[]=[];

  private forestChanged(forest:RockForest) {
    let changed=false;
    const count=Array.isArray(forest.harvested)?forest.harvested.length:(forest.harvested as ReadonlySet<string>).size;
    // Host harvesting only adds IDs to its Set. Guest snapshots replace arrays;
    // compare their contents once per replacement, rather than per movement query.
    if(forest.harvested!==this.harvested||count!==this.harvestedCount){
      changed=count!==this.removed.size;
      if(!changed)for(const id of forest.harvested)if(!this.removed.has(id)){changed=true;break;}
      if(changed)this.removed=new Set(forest.harvested);
      this.harvested=forest.harvested;this.harvestedCount=count;
    }
    if(forest.planted!==this.planted||forest.planted.length!==this.plantedValues.length){
      const different=forest.planted.length!==this.plantedValues.length||forest.planted.some((t,i)=>{
        const old=this.plantedValues[i];
        return t.id!==old.id||t.x!==old.x||t.y!==old.y||t.z!==old.z||t.kind!==old.kind||t.scale!==old.scale;
      });
      if(different){this.plantedValues=forest.planted.map(t=>({...t}));changed=true;}
      this.planted=forest.planted;
    }
    return changed;
  }
  near(x:number,y:number,forest:RockForest,terrain:FriendsTerrain){
    const cx=Math.floor(x/512),cy=Math.floor(y/512),forestChanged=this.forestChanged(forest);
    if(forestChanged||cx!==this.cellX||cy!==this.cellY||terrain!==this.terrain||terrain.revision!==this.terrainRevision||terrain.waterEpoch!==this.waterEpoch){
      this.cellX=cx;this.cellY=cy;this.terrain=terrain;
      this.terrainRevision=terrain.revision;this.waterEpoch=terrain.waterEpoch;this.rocks=[];
      for(let a=cx-1;a<=cx+1;a++)for(let b=cy-1;b<=cy+1;b++){
        const trees=[...frontierTrees(a,b),...forest.planted.filter(t=>Math.floor(t.x/512)===a&&Math.floor(t.y/512)===b)]
          .filter(t=>!this.removed.has(t.id)&&!lavaRiverTreeClearance(t.x,t.y)&&!emberRetreatTreeClearance(t.x,t.y)&&terrain.supports(t.x,t.y,t.z));
        this.rocks.push(...friendsGroveRocks(trees,terrain));
      }
    }
    return this.rocks;
  }
  collide(p:{x:number;y:number},z:number,radius:number,forest:RockForest,terrain:FriendsTerrain){
    let hit=false;for(const rock of this.near(p.x,p.y,forest,terrain)){
      if(Math.abs(p.x-rock.x)>100*rock.scale+radius||Math.abs(p.y-rock.y)>100*rock.scale+radius)continue;
      hit=collideRock(rock,p,z,radius)||hit;
    }return hit;
  }
  floor(x:number,y:number,z:number,forest:RockForest,terrain:FriendsTerrain){
    let floor:number|undefined;
    for(const rock of this.near(x,y,forest,terrain)){
      if(Math.abs(x-rock.x)>100*rock.scale||Math.abs(y-rock.y)>100*rock.scale)continue;
      const top=rockSurface(rock,x,y);if(top!==undefined&&top<=z+FRIENDS_STEP_HEIGHT)floor=Math.max(floor??-Infinity,top);
    }return floor;
  }
}
