import { RIVER_CROSSING } from './FriendsHydrology';
import type { TerrainRay, TerrainHit } from './FriendsTerrain';
export type BridgePoint={x:number;y:number;z:number};
export type BridgeBox=BridgePoint&{w:number;d:number;h:number;angle:number;kind:'deck'|'rail'|'support'};
export type RiverBridge={boxes:BridgeBox[];path:BridgePoint[];floor:(x:number,y:number,z:number,step?:number)=>number|undefined;ceiling:(x:number,y:number,z:number)=>number|undefined;collide:(p:{x:number;y:number},z:number,radius:number)=>boolean;raycast:(ray:TerrainRay,maxDistance:number)=>TerrainHit|undefined;clearing:(x:number,y:number)=>boolean;terrainHeight:(x:number,y:number,natural:number)=>number;protected:(x:number,y:number,z:number)=>boolean};
export function createRiverBridge(ground:(x:number,y:number)=>number):RiverBridge{
  const b=RIVER_CROSSING,c=Math.cos(b.angle),s=Math.sin(b.angle),boxes:BridgeBox[]=[],path:BridgePoint[]=[];
  const point=(u:number,v:number,z:number)=>({x:b.x+c*u-s*v,y:b.y+s*u+c*v,z});
  const local=(x:number,y:number)=>({u:(x-b.x)*c+(y-b.y)*s,v:-(x-b.x)*s+(y-b.y)*c});
  const add=(u:number,v:number,z:number,w:number,d:number,h:number,kind:BridgeBox['kind'])=>boxes.push({...point(u,v,z),w,d,h,angle:b.angle,kind});
  add(0,0,b.z-20,b.length,b.width,20,'deck');
  for(const side of [-1,1]){
    add(0,side*(b.width/2-4),b.z,b.length,8,16,'rail');
    const p=point(side*(b.length/2-24),0,0),base=ground(p.x,p.y)-64;
    add(side*(b.length/2-24),0,base,96,144,b.z-base-20,'support');
  }
  const arch=(u:number)=>b.z-60-144*(1-Math.sqrt(Math.max(0,1-(u/(b.length/2))**2)));
  for(let u=-b.length/2;u<b.length/2;u+=32)for(const side of [-1,1]){
    const bottom=Math.min(arch(u),arch(u+32))-32,top=Math.max(arch(u),arch(u+32));
    add(u+16,side*40,bottom,32,20,top-bottom,'support');
  }
  const half=b.length/2,approach=1536,endGround=[-1,1].map(sign=>{
    const p=point(sign*(half+approach),0,0);return Math.round(ground(p.x,p.y)/8)*8;
  });
  const topAt=(u:number)=>{
    if(Math.abs(u)<=half)return b.z;
    const sign=u<0?0:1,step=Math.floor((Math.abs(u)-half+.00001)/8)*8,t=Math.min(1,step/approach);
    return Math.round((b.z+(endGround[sign]-b.z)*t)/8)*8;
  };
  for(let u=-half-approach;u<=half+approach;u+=8)path.push(point(u,0,topAt(u)));
  for(const sign of [-1,1])for(let u=half;u<half+approach;u+=8){
    const top=topAt(sign*u);
    add(sign*(u+4),0,top-16,8,b.width,16,'deck');
    // Short curb leaves exits open at both landings.
    if(u<half+approach-80)for(const side of [-1,1])add(sign*(u+4),side*(b.width/2-4),top,8,8,12,'rail');
  }
  const groups=new Map<string,BridgeBox[]>();
  for(const box of boxes){const p=local(box.x,box.y),key=`${box.kind}:${p.v.toFixed(3)}:${box.z}:${box.h}:${box.d}`;
    const list=groups.get(key)||[];list.push(box);groups.set(key,list);
  }
  const merged:BridgeBox[]=[];
  for(const list of groups.values()){
    list.sort((a,d)=>local(a.x,a.y).u-local(d.x,d.y).u);
    let last:BridgeBox|undefined;
    for(const box of list){const p=local(box.x,box.y);
      if(last&&Math.abs(local(last.x,last.y).u+last.w/2-(p.u-box.w/2))<.01){
        const u=local(last.x,last.y).u+box.w/2;last.w+=box.w;const q=point(u,p.v,last.z);last.x=q.x;last.y=q.y;
      }else{last={...box};merged.push(last);}
    }
  }
  boxes.splice(0,boxes.length,...merged);
  const buckets=new Map<number,BridgeBox[]>();
  for(const box of boxes){const u=local(box.x,box.y).u;
    for(let k=Math.floor((u-box.w/2-64)/64);k<=Math.floor((u+box.w/2+64)/64);k++){
      const list=buckets.get(k)||[];list.push(box);buckets.set(k,list);
    }
  }
  const boxesAt=(x:number,y:number)=>buckets.get(Math.floor(local(x,y).u/64))||[];
  const floor=(x:number,y:number,z:number,step=8)=>{
    const p=local(x,y);if(Math.abs(p.v)>b.width/2-8+.001||Math.abs(p.u)>half+approach+.001)return;
    const top=topAt(p.u);return top<=z+step+.001?top:undefined;
  };
  const ceiling=(x:number,y:number,z:number)=>{
    const p=local(x,y);if(Math.abs(p.v)>b.width/2||Math.abs(p.u)>half+approach)return;
    let lowest=Infinity;
    for(const box of boxesAt(x,y)){const q=local(box.x,box.y);if(box.z>z+.1&&Math.abs(p.u-q.u)<box.w/2&&Math.abs(p.v-q.v)<box.d/2)lowest=Math.min(lowest,box.z);}
    return Number.isFinite(lowest)?lowest:undefined;
  };
  const nearby=(x:number,y:number)=>{const p=local(x,y);return Math.abs(p.u)<half+approach+160&&Math.abs(p.v)<b.width/2+160;};
  const collide=(p:{x:number;y:number},z:number,radius:number)=>{
    if(!nearby(p.x,p.y))return false;let changed=false;
    for(const box of boxesAt(p.x,p.y)){if(box.kind==='deck'||z>=box.z+box.h-8||z+50<=box.z)continue;
      const q=local(p.x,p.y),u=local(box.x,box.y).u,v=local(box.x,box.y).v,du=q.u-u,dv=q.v-v,ew=box.w/2+radius,ed=box.d/2+radius;
      if(Math.abs(du)>=ew||Math.abs(dv)>=ed)continue;
      if(ew-Math.abs(du)<ed-Math.abs(dv))q.u=u+(du<0?-1:1)*ew;else q.v=v+(dv<0?-1:1)*ed;
      const fixed=point(q.u,q.v,z);p.x=fixed.x;p.y=fixed.y;changed=true;
    }return changed;
  };
  const raycast=(ray:TerrainRay,maxDistance:number):TerrainHit|undefined=>{
    const origin=local(ray.x,ray.y),du=ray.dx*c+ray.dy*s,dv=-ray.dx*s+ray.dy*c;
    if(Math.min(origin.u,origin.u+du*maxDistance)>half+approach+100||Math.max(origin.u,origin.u+du*maxDistance)<-half-approach-100
      ||Math.min(origin.v,origin.v+dv*maxDistance)>b.width/2+100||Math.max(origin.v,origin.v+dv*maxDistance)<-b.width/2-100)return;
    let closest:TerrainHit|undefined;
    for(const box of boxes){
      const q=local(box.x,box.y),o=[origin.u,origin.v,ray.z],d=[du,dv,ray.dz],lo=[q.u-box.w/2,q.v-box.d/2,box.z],hi=[q.u+box.w/2,q.v+box.d/2,box.z+box.h];
      let enter=0,leave=closest?.distance??maxDistance,axis=2,sign=1,miss=false;
      for(let i=0;i<3;i++){
        if(Math.abs(d[i])<1e-9){if(o[i]<lo[i]||o[i]>hi[i]){miss=true;break;}continue;}
        const a=(lo[i]-o[i])/d[i],z=(hi[i]-o[i])/d[i],near=Math.min(a,z),far=Math.max(a,z);
        if(near>enter){enter=near;axis=i;sign=d[i]>0?-1:1;}leave=Math.min(leave,far);
        if(enter>leave){miss=true;break;}
      }
      if(miss||enter<0||enter>maxDistance)continue;
      const x=ray.x+ray.dx*enter,y=ray.y+ray.dy*enter,z=ray.z+ray.dz*enter;
      closest={x,y,z,vx:Math.floor(x/32),vy:Math.floor(y/32),vz:Math.floor(z/32),
        nx:axis===0?sign*c:axis===1?-sign*s:0,ny:axis===0?sign*s:axis===1?sign*c:0,nz:axis===2?sign:0,distance:enter,material:2};
    }return closest;
  };
  return {boxes,path,floor,ceiling,collide,raycast,clearing:nearby,
    terrainHeight:(x,y,natural)=>{const p=local(x,y);if(Math.abs(p.u)<=half-80||Math.abs(p.u)>half+approach+96||Math.abs(p.v)>b.width/2+96)return natural;
      const weight=1-Math.min(1,Math.max(0,(Math.abs(p.v)-b.width/2)/96));
      // Clear a whole terrain voxel beneath the narrow treads: sampling a
      // neighbouring 32-unit column must not introduce an invisible step.
      const top=topAt(p.u);return natural-Math.max(0,natural-top+64)*weight;},
    protected:(x,y,z)=>nearby(x,y)&&boxesAt(x,y).some(box=>{const p=local(x,y),q=local(box.x,box.y);return Math.abs(p.u-q.u)<box.w/2+16&&Math.abs(p.v-q.v)<box.d/2+16&&z>=box.z-32&&z<box.z+box.h+32;}),
  };
}
