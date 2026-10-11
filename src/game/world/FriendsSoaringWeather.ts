import type { FriendsEnvironmentSnapshot } from './FriendsEnvironmentPreview';
import { baseTerrainHeight } from './FriendsTerrain';
import { sampleFrontierDayNight } from './FriendsDayNight';

/** Frontier instruments, boats and maps use twelve world units per metre. */
export const SOARING_UNITS_PER_METRE = 12;
export type SoaringAir = { x:number; y:number; up:number; ridge:number; thermal:number; turbulence:number; ground:number };
export type SoaringHeight = (x:number,y:number)=>number;
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export const SOARING_LAUNCHES = [
  {id:'highfall',name:'Highfall launch',x:13856,y:8544},
  {id:'skyfalls',name:'Skyfalls launch',x:6080,y:18816},
  {id:'ember',name:'Ember caldera launch',x:32832,y:33024},
] as const;
/** Wind points TO the east/northeast. The direction changes slowly, never with
 * a client's clock or developer-only environment override. */
export function soaringWind(timeMs:number,scale=1) {
  const t=timeMs/1000,angle=.27+.14*Math.sin(t/190),speed=(4.5+.65*Math.sin(t/83))*scale;
  return {x:Math.cos(angle)*speed,y:Math.sin(angle)*speed,speed,angle};
}
export function soaringAtmosphere(timeMs:number,worldTimeMs=timeMs,environment?:FriendsEnvironmentSnapshot){
  return {dayTimeMs:environment?.enabled?environment.timeAnchor+(worldTimeMs-environment.sourceAnchor)*environment.speed:worldTimeMs,
    windTimeMs:environment?environment.windAnchor+(timeMs-environment.windSourceAnchor)*environment.windSpeed:timeMs,
    windScale:environment?.windSpeed??1};
}
const terrainCache=new Map<string,number>();
/** Lift uses a smooth 192-unit field. Exact voxel collision remains separate. */
export function soaringTerrainHeight(x:number,y:number){
  const grid=192,ix=Math.floor(x/grid),iy=Math.floor(y/grid),tx=x/grid-ix,ty=y/grid-iy;
  const sample=(a:number,b:number)=>{const key=`${a}:${b}`;let h=terrainCache.get(key);if(h===undefined){h=baseTerrainHeight(a*grid,b*grid);if(terrainCache.size>=8192)terrainCache.delete(terrainCache.keys().next().value!);terrainCache.set(key,h);}return h;};
  const a=sample(ix,iy),b=sample(ix+1,iy),c=sample(ix,iy+1),d=sample(ix+1,iy+1);
  return (a+(b-a)*tx)*(1-ty)+(c+(d-c)*tx)*ty;
}
const THERMALS = [
  [13200,8800,74,3.6],[17500,14700,90,3.8],[22100,15100,95,4.2],
  [22000,23300,80,3.6],[5500,17400,85,3.8],[11200,28300,95,3.2],
  [28700,19900,90,2.8],[31000,31200,100,3.5],
] as const;
/** Analytic airflow rather than CFD. Smoothed terrain gradients remove voxel
 * stair pulses; distance/height falloff removes the "mountain elevator" effect.
 * Returns SI velocities, converted only by the flight controller. */
export function sampleSoaringAir(x:number,y:number,z:number,timeMs:number,height:SoaringHeight=soaringTerrainHeight,atmosphere=soaringAtmosphere(timeMs)):SoaringAir {
  const wind=soaringWind(atmosphere.windTimeMs,atmosphere.windScale),ground=height(x,y),agl=Math.max(0,(z-ground)/12),s=192;
  const gx=(height(x+s,y)-height(x-s,y))/(2*s),gy=(height(x,y+s)-height(x,y-s))/(2*s);
  const uphill=wind.x*gx+wind.y*gy;
  let ridge=Math.max(0,uphill)*.85*Math.exp(-agl/90);
  // Upwind terrain shadow models the lee side even when its local slope is flat.
  const ux=Math.cos(wind.angle),uy=Math.sin(wind.angle);
  const upstream=height(x-ux*600,y-uy*600),shelter=clamp((upstream-z)/480,0,1)*Math.min(1,atmosphere.windScale);
  ridge-=Math.max(0,-uphill)*.55*Math.exp(-agl/110)+shelter*1.8;
  ridge=clamp(ridge,-3.2,4.5);
  const daylight=sampleFrontierDayNight(atmosphere.dayTimeMs).daylight;
  let thermal=0;
  for(let i=0;i<THERMALS.length;i++){
    const [cx,cy,radius,strength]=THERMALS[i];
    const age=((timeMs/1000+i*37)%240+240)%240;
    const life=Math.sin(Math.PI*age/240)**2;
    // Columns lean downwind with altitude; releases have a finite lifecycle.
    const tilt=agl*.22+age*.12;
    const dx=(x-cx)/12-wind.x*tilt,dy=(y-cy)/12-wind.y*tilt;
    const r=Math.hypot(dx,dy)/(radius+agl*.08),core=Math.exp(-r*r*2);
    const ring=.22*Math.exp(-(((r-1.5)/.45)**2));
    const base=height(cx,cy),above=(z-base)/12;
    if(above>=-5)thermal+=(core-ring)*strength*life*daylight*clamp((above+5)/20,0,1)*clamp((520-above)/120,0,1);
  }
  // An authored volcanic heat plume: finite top, tilted column and rough edges.
  const va=Math.max(0,(z-height(34240,33792))/12),vx=(x-34240)/12-wind.x*va*.24,vy=(y-33792)/12-wind.y*va*.24;
  const vr=Math.hypot(vx,vy)/(105+va*.12);
  const volcanic=Math.exp(-vr*vr*1.8)*4.6*clamp((620-va)/130,0,1);
  if(z>=height(34240,33792)-24)thermal+=volcanic;
  const rough=clamp(shelter*.7+Math.abs(uphill)*.05+volcanic*.08,0,1);
  const gust=rough*(Math.sin(timeMs*.0027+x*.003+y*.002)*.6+Math.sin(timeMs*.0061-y*.005)*.3);
  // No atmospheric lift under solid terrain or inside caves.
  if(z<ground-24)return {x:0,y:0,up:0,ridge:0,thermal:0,turbulence:0,ground};
  return {x:wind.x,y:wind.y,up:clamp(ridge+thermal+gust,-5,6),ridge,thermal,turbulence:rough,ground};
}
