import type { FriendsTerrain } from '../world/FriendsTerrain';

/** Cache only conservative, empty terrain volumes. Moving builds and vehicles
 * are checked separately on every query; terrain edits invalidate the cache. */
export class FriendsFishingClearance {
  private terrain?:FriendsTerrain;
  private revision=-1;
  private epoch=-1;
  private empty=new Set<string>();
  clear(terrain:FriendsTerrain,x:number,y:number,bottom:number,top:number,radius:number){
    if(terrain!==this.terrain||terrain.revision!==this.revision||terrain.waterEpoch!==this.epoch){
      this.empty.clear();this.terrain=terrain;this.revision=terrain.revision;this.epoch=terrain.waterEpoch;
    }
    const vx=Math.floor(x/32),vy=Math.floor(y/32),low=Math.floor(bottom/32)*32,high=Math.ceil(top/32)*32;
    const r=Math.ceil(radius/8)*8+Math.SQRT2*16,key=`${vx},${vy},${low},${high},${r}`;
    if(this.empty.has(key))return true;
    if(!terrain.collide({x:vx*32+16,y:vy*32+16},low,r,high-low,0)){
      if(this.empty.size>=8192)this.empty.clear();this.empty.add(key);return true;
    }
    return !terrain.collide({x,y},bottom,radius,top-bottom,0);
  }
}
