import { FRIENDS_BUILD_CATALOG, type FriendsBuildPose, type FriendsBuildShape } from './FriendsBuilding';
import type { TerrainRay } from '../world/FriendsTerrain';

export type ConstructionMode = 'single' | 'line' | 'rectangle';
export type ConstructionState = { mode: ConstructionMode; locked: boolean; anchored: boolean };
export class FriendsConstructionControls {
  mode: ConstructionMode = 'single';
  anchor?: FriendsBuildPose;
  anchorAxis:0|1|2=2;
  plane?: { axis: 0 | 1 | 2; value: number };
  offset = [0,0,0];
  private lastPose = '';
  private lastPlace = -Infinity;
  private stable?: {pose:FriendsBuildPose;stamp:string};
  reset() { this.anchor = undefined; this.anchorAxis=2; this.plane = undefined; this.offset = [0,0,0]; this.lastPose = ''; this.stable=undefined; }
  get state(): ConstructionState { return {mode:this.mode,locked:Boolean(this.plane),anchored:Boolean(this.anchor)}; }
  setMode(mode: ConstructionMode) { this.mode = mode; this.anchor = undefined; this.lastPose = ''; }
  lock(pose: FriendsBuildPose, normal: readonly number[]) {
    if (this.plane) { this.plane = undefined; return; }
    const axis = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs))) as 0 | 1 | 2;
    this.plane = {axis,value:[pose.x,pose.y,pose.z][axis]}; this.offset = [0,0,0];
  }
  stabilize(raw:FriendsBuildPose|undefined,shape:FriendsBuildShape,surface:{x:number;y:number;z:number;nx:number;ny:number;nz:number}|undefined,revision:string) {
    if(!raw||!surface||(raw.attachment||raw.assembly)||!['block','half_block','floor_tile','voxel_ramp','voxel_stairs'].includes(shape)){this.stable=undefined;return raw;}
    const normal=[surface.nx,surface.ny,surface.nz],axis=normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
    const stamp=[shape,raw.rotation,...normal,[surface.x,surface.y,surface.z][axis],revision].join(':');
    const pose={...raw},old=this.stable;
    if(old?.stamp===stamp){
      for(const coordinate of ['x','y'] as const){
        if(Math.abs(pose[coordinate]-old.pose[coordinate])===32 && Math.abs(surface[coordinate]-(pose[coordinate]+old.pose[coordinate])/2)<1.5)pose[coordinate]=old.pose[coordinate];
      }
    }
    this.stable={pose,stamp};return pose;
  }
  adjust(raw: FriendsBuildPose | undefined, ray: TerrainRay, shape: FriendsBuildShape, rotation = 0): FriendsBuildPose | undefined {
    const d = FRIENDS_BUILD_CATALOG[shape], voxel = ['block','half_block','floor_tile','voxel_ramp','voxel_stairs'].includes(shape);
    let pose = raw && {...raw};
    if (this.plane && !raw?.attachment&&!raw?.assembly) {
      const origins = [ray.x,ray.y,ray.z], dirs = [ray.dx,ray.dy,ray.dz], {axis,value}=this.plane;
      const t = (value-origins[axis])/dirs[axis];
      if (!Number.isFinite(t) || t < 0 || t > 520) return;
      const point = origins.map((n,i)=>n+dirs[i]*t);
      const snap = (n:number,i:number)=>voxel ? i===2 ? Math.floor(n/(shape==='block'?32:8))*(shape==='block'?32:8) : Math.floor(n/32)*32+16 : Math.round(n/4)*4;
      const v=point.map(snap);v[axis]=value;
      pose={x:v[0],y:v[1],z:v[2],rotation:raw?.rotation ?? rotation};
    }
    if (!pose) return;
    if ((pose.attachment||pose.assembly) && this.offset.some(Boolean)) return pose; // Cargo uses its own frame; no world-axis nudges.
    return {...pose,x:pose.x+this.offset[0],y:pose.y+this.offset[1],z:pose.z+this.offset[2]};
  }
  footprint(end: FriendsBuildPose, shape: FriendsBuildShape): {poses:FriendsBuildPose[];issue?:string} {
    if (this.mode==='single' || !this.anchor) return {poses:[end]};
    const start=this.anchor;
    if(start.attachment||end.attachment||start.assembly||end.assembly)return {poses:[],issue:'Use single placement on moving cargo.'};
    const def=FRIENDS_BUILD_CATALOG[shape], steps=[start.rotation%2?def.d:def.w,start.rotation%2?def.w:def.d,def.h];
    const a=[start.x,start.y,start.z],b=[end.x,end.y,end.z],delta=b.map((n,i)=>Math.round((n-a[i])/steps[i]));
    let axes:number[];
    if(this.mode==='line')axes=[delta.map(Math.abs).indexOf(Math.max(...delta.map(Math.abs)))];
    else {const normal=this.plane?.axis ?? this.anchorAxis;axes=[0,1,2].filter(i=>i!==normal);}
    const counts=axes.map(i=>Math.abs(delta[i])+1),needed=counts.reduce((a,b)=>a*b,1);
    if(needed>64)return {poses:[],issue:'Limit each gesture to 64 pieces. Shorten the selection.'};
    const poses:FriendsBuildPose[]=[];
    for(let i=0;i<counts[0];i++)for(let j=0;j<(counts[1]||1);j++){
      const point=[...a];point[axes[0]]+=i*Math.sign(delta[axes[0]])*steps[axes[0]];
      if(axes.length>1)point[axes[1]]+=j*Math.sign(delta[axes[1]])*steps[axes[1]];
      poses.push({x:point[0],y:point[1],z:point[2],rotation:start.rotation});
    }
    return {poses};
  }
  /** Never repeat an unchanged or rejected pose during a held gesture. */
  repeat(pose: FriendsBuildPose, shape: FriendsBuildShape, finish: string, now: number) {
    const key=[shape,finish,pose.x,pose.y,pose.z,pose.rotation,pose.attachment?.vehicleId].join(':');
    if(now-this.lastPlace<250||key===this.lastPose)return false;
    this.lastPose=key;this.lastPlace=now;return true;
  }
  release() { this.lastPose=''; }
}
