import { FriendsTerrain } from './FriendsTerrain';
import { RETREAT_APPROACHES, RETREAT_SITES, type RetreatPoint } from './FriendsRetreatSites';
export type RetreatPath={siteId:string;width:number;bounds:{minX:number;maxX:number;minY:number;maxY:number};points:(RetreatPoint&{ground:number})[]};
let paths:RetreatPath[]|undefined;
/** Read-only survey of the original island; runtime edits never change these
 * authored surfaces. Conflicting saves disable the site and its approach. */
export function retreatPaths():RetreatPath[]{
  if(paths)return paths;
  const terrain=new FriendsTerrain();
  paths=RETREAT_APPROACHES.map(route=>{
    const site=RETREAT_SITES.find(s=>s.id===route.siteId)!,width=40;
    const points:(RetreatPoint&{ground:number})[]=[];
    for(let k=1;k<route.points.length;k++){
      const a=route.points[k-1],b=route.points[k],n=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/8);
      for(let i=k===1?0:1;i<=n;i++){
        const f=i/n,x=a.x+(b.x-a.x)*f,y=a.y+(b.y-a.y)*f,dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
        const ground=terrain.floor(x,y,site.kind==='bench'&&site.id==='gatewater-bench'?site.z+100:6000)??0;
        let top=ground;
        for(const side of [-1,0,1])top=Math.max(top,terrain.floor(x-dy/d*side*width/2,y+dx/d*side*width/2,site.id==='gatewater-bench'?site.z+100:6000)??0);
        points.push({x,y,z:top+8,ground});
      }
    }
    // A grade-limited upper envelope clears voxel terrace faces without digging.
    for(let i=1;i<points.length;i++)points[i].z=Math.max(points[i].z,points[i-1].z-.65*Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y));
    for(let i=points.length-2;i>=0;i--)points[i].z=Math.max(points[i].z,points[i+1].z-.65*Math.hypot(points[i].x-points[i+1].x,points[i].y-points[i+1].y));
    // The final landing is deliberately flush with the site's deck.
    const last=points.at(-1)!;last.z=site.z;
    return {siteId:site.id,width,points,bounds:{minX:Math.min(...points.map(p=>p.x))-width,maxX:Math.max(...points.map(p=>p.x))+width,minY:Math.min(...points.map(p=>p.y))-width,maxY:Math.max(...points.map(p=>p.y))+width}};
  });return paths;
}
export function retreatPathFloor(p:RetreatPoint,active:readonly string[],step=8){
  if(!active.length)return;
  let floor:number|undefined;
  for(const path of retreatPaths()){
    if(!active.includes(path.siteId)||p.x<path.bounds.minX||p.x>path.bounds.maxX||p.y<path.bounds.minY||p.y>path.bounds.maxY)continue;
    for(let i=1;i<path.points.length;i++){
      const a=path.points[i-1],b=path.points[i],dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy;
      const f=((p.x-a.x)*dx+(p.y-a.y)*dy)/d2;if(f<-.001||f>1.001)continue;
      if(Math.hypot(p.x-a.x-dx*f,p.y-a.y-dy*f)>path.width/2)continue;
      const z=a.z+(b.z-a.z)*f;if(z<=p.z+step+.001&&z>=p.z-160)floor=Math.max(floor??-Infinity,z);
    }
  }return floor;
}

export function retreatWorkReserved(p:RetreatPoint,active:readonly string[]){
  if(!active.length)return false;
  for(const s of RETREAT_SITES){
    if(!active.includes(s.id)||p.z<s.z-96||p.z>s.z+('height' in s?s.height:42)+32)continue;
    const dx=p.x-s.x,dy=p.y-s.y,c=Math.cos(s.angle),sn=Math.sin(s.angle);
    if(Math.abs(c*dx+sn*dy)<s.w/2+24&&Math.abs(-sn*dx+c*dy)<s.d/2+24)return true;
  }
  const floor=retreatPathFloor({...p,z:p.z+80},active,80);return floor!==undefined&&Math.abs(floor-p.z)<80;
}
