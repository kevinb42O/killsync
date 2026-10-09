import { FriendsTerrain } from './FriendsTerrain';
import { RETREAT_APPROACHES, RETREAT_SITES, type RetreatPoint } from './FriendsRetreatSites';
export type RetreatPath={siteId:string;width:number;bounds:{minX:number;maxX:number;minY:number;maxY:number};points:(RetreatPoint&{ground:number})[]};
let paths:RetreatPath[]|undefined;
const sections=new WeakMap<RetreatPath,[RetreatPoint,RetreatPoint][]>();
/** Round route corners before surveying. A wide boardwalk needs a bend radius
 * larger than its half-width, otherwise the inside edges fold over themselves. */
function roundRoute(route:readonly {x:number;y:number}[]){
  const result=[route[0]];
  for(let i=1;i<route.length-1;i++){
    const a=route[i-1],p=route[i],b=route[i+1],before=Math.hypot(p.x-a.x,p.y-a.y),after=Math.hypot(b.x-p.x,b.y-p.y);
    const dx=(p.x-a.x)/before,dy=(p.y-a.y)/before,ex=(b.x-p.x)/after,ey=(b.y-p.y)/after;
    const angle=Math.acos(Math.max(-1,Math.min(1,dx*ex+dy*ey)));if(angle<.001){result.push(p);continue;}
    const cut=Math.min(70,before*.45,after*.45),radius=cut/Math.tan(angle/2),turn=Math.sign(dx*ey-dy*ex);
    const entry={x:p.x-dx*cut,y:p.y-dy*cut},centre={x:entry.x-dy*turn*radius,y:entry.y+dx*turn*radius},start=Math.atan2(entry.y-centre.y,entry.x-centre.x),steps=Math.ceil(radius*angle/8);
    result.push(entry);
    for(let j=1;j<=steps;j++){const theta=start+turn*angle*j/steps;result.push({x:centre.x+Math.cos(theta)*radius,y:centre.y+Math.sin(theta)*radius});}
  }
  result.push(route.at(-1)!);return result;
}

/** Shared cross-sections define both the rendered strip and its walkable top. */
export function retreatPathSections(path:RetreatPath):[RetreatPoint,RetreatPoint][]{
  const cached=sections.get(path);if(cached)return cached;
  const result=path.points.map((p,i)=>{
    const a=path.points[Math.max(0,i-1)],b=path.points[Math.min(path.points.length-1,i+1)];
    const direction=(from:RetreatPoint,to:RetreatPoint)=>{const d=Math.hypot(to.x-from.x,to.y-from.y);return d?[((to.x-from.x)/d),((to.y-from.y)/d)]:[0,0];};
    let incoming=direction(a,p),outgoing=direction(p,b);if(!i)incoming=outgoing;if(i===path.points.length-1)outgoing=incoming;
    const nx=-incoming[1]-outgoing[1],ny=incoming[0]+outgoing[0],d=Math.hypot(nx,ny),mx=nx/d,my=ny/d;
    const length=Math.min(path.width,path.width/2/Math.max(.5,-mx*outgoing[1]+my*outgoing[0]));
    return [-1,1].map(side=>({x:p.x+mx*length*side,y:p.y+my*length*side,z:p.z})) as [RetreatPoint,RetreatPoint];
  });sections.set(path,result);return result;
}
/** Read-only survey of the original island; runtime edits never change these
 * authored surfaces. Conflicting saves disable the site and its approach. */
export function retreatPaths():RetreatPath[]{
  if(paths)return paths;
  const terrain=new FriendsTerrain();
  paths=RETREAT_APPROACHES.map(route=>{
    const site=RETREAT_SITES.find(s=>s.id===route.siteId)!,width=40;
    const points:(RetreatPoint&{ground:number})[]=[];
    const centreline=roundRoute(route.points);
    for(let k=1;k<centreline.length;k++){
      const a=centreline[k-1],b=centreline[k],n=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/8);
      for(let i=k===1?0:1;i<=n;i++){
        const f=i/n,x=a.x+(b.x-a.x)*f,y=a.y+(b.y-a.y)*f,dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
        const ground=terrain.floor(x,y,site.kind==='bench'&&site.id==='gatewater-bench'?site.z+100:6000)??0;
        let top=ground;
        for(const side of [-1,0,1])top=Math.max(top,terrain.floor(x-dy/d*side*width/2,y+dx/d*side*width/2,site.id==='gatewater-bench'?site.z+100:6000)??0);
        points.push({x,y,z:top+8,ground});
      }
    }
    // Include the deck elevation before grading so raised terraces have a continuous ramp.
    points.at(-1)!.z=site.z;
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
    const strip=retreatPathSections(path);
    for(let i=1;i<strip.length;i++){
      const [a,b]=strip[i-1],[c,d]=strip[i];
      for(const [one,two,three]of [[a,b,c],[b,d,c]]){
        const ux=two.x-one.x,uy=two.y-one.y,vx=three.x-one.x,vy=three.y-one.y,px=p.x-one.x,py=p.y-one.y,det=ux*vy-uy*vx;
        if(Math.abs(det)<1e-6)continue;
        const u=(px*vy-py*vx)/det,v=(ux*py-uy*px)/det;if(u<-.000001||v<-.000001||u+v>1.000001)continue;
        const z=one.z+u*(two.z-one.z)+v*(three.z-one.z);if(z<=p.z+step+.001&&z>=p.z-160)floor=Math.max(floor??-Infinity,z);
      }
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
