/** Authored quiet places. Simulation X/Y horizontal, Z up. No saved terrain edits. */
export type RetreatPoint = {x:number;y:number;z:number};
export type RetreatBox = RetreatPoint & {w:number;d:number;h:number;angle:number;siteId:string;surface:'floor'|'wall'|'roof'|'couch'|'glass'};
export type RetreatSeat = RetreatPoint & {angle:number;exit:RetreatPoint;siteId:string;index:number};
export const STILLWATER = {id:'stillwater-house',name:'Stillwater House',x:7680,y:21696,z:1352,angle:-.55,w:144,d:112,height:76} as const;
export const RETREAT_SITES = [
  {...STILLWATER,kind:'house',color:'#edc99b',detail:'A quiet room above Skyfalls lake. Sit on the couch; F at the wall switch changes the lights.'},
  {id:'skyfalls-bench',name:'Skyfalls Bench',x:8884,y:21100,z:904,angle:-1.88,w:80,d:72,kind:'bench',color:'#a0d5e3',detail:'Two seats together above the hanging lake. F to sit; F or jump to stand.'},
  {id:'gatewater-bench',name:'Gatewater Bench',x:14116,y:11308,z:840,angle:1.23,w:80,d:64,kind:'bench',color:'#b1d9e0',detail:'Sit beside a friend under the World Gate, looking across its glacial water.'},
  {id:'saltwind-camp',name:'Saltwind Camp',x:27248,y:20704,z:208,angle:Math.PI/2,w:168,d:144,kind:'fire',color:'#f2b280',detail:'An always-warm coastal fire and five seats. A quiet place to watch the bay.'},
] as const;
export type RetreatId = typeof RETREAT_SITES[number]['id'];
export type RetreatState = {version:1;active:RetreatId[];lightsOn:boolean;switchSerial:number;switchBy?:string};
export type RetreatSave = {version:1;active?:RetreatId[];lightsOn?:boolean};
export function retreatPoint(site:{x:number;y:number;z:number;angle:number},u:number,v:number,z=0):RetreatPoint {
  const c=Math.cos(site.angle),s=Math.sin(site.angle);return {x:site.x+c*u-s*v,y:site.y+s*u+c*v,z:site.z+z};
}
export function retreatLocal(site:{x:number;y:number;angle:number},p:{x:number;y:number}) {
  const c=Math.cos(site.angle),s=Math.sin(site.angle),dx=p.x-site.x,dy=p.y-site.y;return {u:c*dx+s*dy,v:-s*dx+c*dy};
}
export const RETREAT_BULB = retreatPoint(STILLWATER,0,-8,62);
export const RETREAT_SWITCH = retreatPoint(STILLWATER,-66,10,28);
export const RETREAT_SEATS:RetreatSeat[] = RETREAT_SITES.flatMap(site=>{
  const offsets=site.kind==='house'?[-30,0,30].map(u=>({u,v:25,angle:site.angle-Math.PI/2})):
    site.kind==='fire'?[{u:-30,v:35,angle:site.angle-Math.PI/2},{u:0,v:35,angle:site.angle-Math.PI/2},{u:42,v:0,angle:site.angle+Math.PI},{u:-44,v:0,angle:site.angle},{u:0,v:-43,angle:site.angle+Math.PI/2}]:
    [{u:-16,v:12,angle:site.angle-Math.PI/2},{u:16,v:12,angle:site.angle-Math.PI/2}];
  return offsets.map((o,index)=>{
    const distance=Math.hypot(o.u,o.v),exit=site.kind==='fire'?retreatPoint(site,Math.max(-site.w/2+16,Math.min(site.w/2-16,o.u+o.u/distance*26)),Math.max(-site.d/2+16,Math.min(site.d/2-16,o.v+o.v/distance*26))):retreatPoint(site,o.u,o.v-26);
    return {...retreatPoint(site,o.u,o.v,16),angle:o.angle,exit,siteId:site.id,index};
  });
});
export function isRetreatSeat(seat:{vehicleId:string;index:number}|undefined){return Boolean(seat&&RETREAT_SITES.some(s=>s.id===seat.vehicleId));}
export function isQuietSeat(seat:{vehicleId:string;index:number}|undefined){return isRetreatSeat(seat)||seat?.vehicleId==='commons-campfire';}
export function insideStillwater(p:RetreatPoint,active:readonly string[]=RETREAT_SITES.map(s=>s.id)){
  const l=retreatLocal(STILLWATER,p);return active.includes(STILLWATER.id)&&Math.abs(l.u)<STILLWATER.w/2&&Math.abs(l.v)<STILLWATER.d/2&&p.z>=STILLWATER.z-2&&p.z<STILLWATER.z+STILLWATER.height;
}
export const RETREAT_APPROACHES=RETREAT_SITES.map(s=>({siteId:s.id,points:s.kind==='house'?
  [{x:7740,y:23600},{x:7740,y:23080},{x:7800,y:22700},{x:7800,y:22380},{x:7750,y:22030},{x:7690,y:21860},retreatPoint(s,-92,-12)]:
  s.kind==='fire'?[retreatPoint(s,-s.w/2-80,64),retreatPoint(s,-s.w/2-40,64),retreatPoint(s,-s.w/2+4,0)]:[retreatPoint(s,-s.w/2-80,0),retreatPoint(s,-s.w/2+4,0)]}));
export function retreatClearing(x:number,y:number){return RETREAT_SITES.some(s=>{const p=retreatLocal(s,{x,y});return Math.abs(p.u)<s.w/2+36&&Math.abs(p.v)<s.d/2+40;})||RETREAT_APPROACHES.some(r=>r.points.slice(1).some((b,i)=>{
  const a=r.points[i],dx=b.x-a.x,dy=b.y-a.y,f=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy)));
  return Math.hypot(x-a.x-dx*f,y-a.y-dy*f)<38;
}));}
function createBoxes():RetreatBox[]{
  const boxes:RetreatBox[]=[];
  for(const s of RETREAT_SITES){
    const add=(u:number,v:number,z:number,w:number,d:number,h:number,surface:RetreatBox['surface'])=>boxes.push({...retreatPoint(s,u,v,z),w,d,h,angle:s.angle,siteId:s.id,surface});
    add(0,0,-8,s.w,s.d,8,'floor');
    if(s.kind==='house'){
      // Thick front reveals surround a genuine picture-window aperture.
      add(0,-56,0,144,4,14,'wall');add(0,-56,60,144,4,16,'wall');
      for(const u of [-67,67])add(u,-56,14,10,4,46,'wall');
      add(0,-56,14,124,2,46,'glass');
      add(0,56,0,144,4,76,'wall');
      add(-72,-43,0,4,26,76,'wall');add(-72,31,0,4,50,76,'wall');add(-72,-12,58,4,36,18,'wall');
      add(72,0,0,4,112,14,'wall');add(72,0,60,4,112,16,'wall');
      add(72,-42,14,4,28,46,'wall');add(72,42,14,4,28,46,'wall');
      add(72,0,14,2,56,46,'glass');
      add(0,0,76,152,120,4,'roof');
      add(0,30,0,112,29,14,'couch');add(0,43,14,112,7,28,'couch');
      for(const u of [-53,53])add(u,30,14,6,29,13,'couch');
      add(-86,-12,-8,28,54,8,'floor');
      add(-105,-12,-16,12,44,16,'floor');
    }else if(s.kind==='fire'){
      add(-90,0,-16,12,44,8,'floor');
    }
  }
  return boxes;
}
export const RETREAT_BOXES = createBoxes();
export function retreatFloor(p:RetreatPoint,active:readonly string[],radius=0){
  let top:number|undefined;
  for(const b of RETREAT_BOXES){if(!active.includes(b.siteId))continue;const l=retreatLocal(b,p),t=b.z+b.h;
    if(Math.abs(l.u)<=b.w/2+radius&&Math.abs(l.v)<=b.d/2+radius&&t<=p.z+8&&t>=p.z-160)top=Math.max(top??-Infinity,t);
  }return top;
}
export function retreatCeiling(p:RetreatPoint,active:readonly string[]){
  let bottom:number|undefined;
  for(const b of RETREAT_BOXES){if(!active.includes(b.siteId)||b.z<=p.z)continue;const l=retreatLocal(b,p);
    if(Math.abs(l.u)<b.w/2&&Math.abs(l.v)<b.d/2)bottom=Math.min(bottom??Infinity,b.z);
  }return bottom;
}
export function collideRetreats(p:{x:number;y:number},z:number,radius:number,active:readonly string[],height=50){
  let changed=false;
  for(const b of RETREAT_BOXES){if(!active.includes(b.siteId)||z>=b.z+b.h-8||z+height<=b.z)continue;const l=retreatLocal(b,p),ew=b.w/2+radius,ed=b.d/2+radius;
    if(Math.abs(l.u)>=ew||Math.abs(l.v)>=ed)continue;
    if(ew-Math.abs(l.u)<ed-Math.abs(l.v))l.u=(l.u<0?-1:1)*ew;else l.v=(l.v<0?-1:1)*ed;
    const q=retreatPoint(b,l.u,l.v);p.x=q.x;p.y=q.y;changed=true;
  }return changed;
}
