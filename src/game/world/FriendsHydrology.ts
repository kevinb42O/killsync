import { ISLAND_LAKES, ISLAND_SEA_LEVEL, waterBasinRadius } from './FriendsWaterBodies';
import { scenicRailway } from './FriendsScenicRailway';
import { RETREAT_SITES, RETREAT_APPROACHES } from './FriendsRetreatSites';

export const HYDROLOGY_VERSION = 2;
export const RIVER_BANK_APRON = 160;
export type RiverPoint = {x:number;y:number;z:number;width:number;distance:number;tx:number;ty:number;roughness:number};
export type River = {id:string;name:string;points:RiverPoint[];length:number;source:'skyfalls'|'gate'|'deepmere';roughness:number};
type Knot = [number,number,number,number];
const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const deep=ISLAND_LAKES[2];
// The railway underpass is midway between the existing piers at chainages
// 123904 and 124416. Its original ground and foundation columns stay intact.
const sky:Knot[]=[
  [7200,20720,666.5,360],[7000,21520,666.5,336],[6870,21800,666.5,336],[6440,22500,586.5,320],
  [6620,23400,522.5,320],[7180,24348,442.5,320],[8000,24348,442.5,320],
  [8520,24348,442.5,320],[8850,25400,330.5,360],[9750,26200,218.5,384],
  [10900,25600,154.5,384],[11500,24600,154.5,384],
];
const gate:Knot[]=[
  [15120,11900,602.5,560],[14880,13000,602.5,480],[14800,13600,602.5,336],[14560,14400,554.5,320],
  [13800,15800,490.5,352],[12900,17400,330.5,384],[12000,18680,298.5,360],
  [11080,19800,266.5,336],[11360,20800,154.5,352],[12128,22300,154.5,384],
];
const main:Knot[]=[
  [14000,23900,154.5,384],[15400,24700,154.5,384],[16000,25000,122.5,384],[18000,25600,85.0,432],
  [20000,26900,42.25,432],[22500,28000,-6.7,456],[24800,27500,-48.9,384],
  [27000,26700,-90.85,360],[28900,25700,-129.34,384],[30200,25300,-153.72,432],
  [31000,25500,ISLAND_SEA_LEVEL,456],[31500,25300,ISLAND_SEA_LEVEL,456],
  [31170.27,24502.08,ISLAND_SEA_LEVEL,432],[31450.27,23852.08,ISLAND_SEA_LEVEL,432],
];
function compile(id:string,name:string,source:River['source'],knots:Knot[],roughness:number):River{
  const points:RiverPoint[]=[];
  // Cubic horizontal interpolation; monotonic smoothstep elevations avoid
  // overshoot and join without vertical steps. Spatial samples are <=24 units.
  const cat=(a:number,b:number,c:number,d:number,t:number)=>.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
  for(let i=0;i<knots.length-1;i++){
    const a=knots[Math.max(0,i-1)],b=knots[i],c=knots[i+1],d=knots[Math.min(knots.length-1,i+2)];
    const steps=Math.ceil(Math.hypot(c[0]-b[0],c[1]-b[1])/12);
    for(let j=0;j<steps;j++){
      const t=j/steps,x=cat(a[0],b[0],c[0],d[0],t),y=cat(a[1],b[1],c[1],d[1],t);
      const width=(b[3]+(c[3]-b[3])*smooth(t))*(1+.035*Math.sin(x/240+y/370));
      points.push({x,y,z:b[2]+(c[2]-b[2])*smooth(t),width,distance:0,tx:0,ty:0,roughness});
    }
  }
  const last=knots.at(-1)!;points.push({x:last[0],y:last[1],z:last[2],width:last[3],distance:0,tx:0,ty:0,roughness});
  let length=0;
  points.forEach((p,i)=>{const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
    if(i)length+=Math.hypot(p.x-a.x,p.y-a.y);p.distance=length;
    const n=Math.hypot(b.x-a.x,b.y-a.y);p.tx=(b.x-a.x)/n;p.ty=(b.y-a.y)/n;
  });return {id,name,source,points,length,roughness};
}
export const FRIENDS_RIVERS:readonly River[]=[
  compile('skyfalls-river','Skyfalls Run','skyfalls',sky,.85),
  compile('gate-river','Gatewater Run','gate',gate,.9),
  compile('reedwater','Reedwater River','deepmere',main,.6),
];
type Segment={a:RiverPoint;b:RiverPoint;river:River};
const tiles=new Map<string,Segment[]>();
for(const river of FRIENDS_RIVERS)for(let i=0;i<river.points.length-1;i++){
  const a=river.points[i],b=river.points[i+1],r=Math.max(a.width,b.width)/2+RIVER_BANK_APRON;
  const segment={a,b,river};
  for(let x=Math.floor((Math.min(a.x,b.x)-r)/512);x<=Math.floor((Math.max(a.x,b.x)+r)/512);x++)
    for(let y=Math.floor((Math.min(a.y,b.y)-r)/512);y<=Math.floor((Math.max(a.y,b.y)+r)/512);y++){
      const k=`${x},${y}`,list=tiles.get(k)||[];list.push(segment);tiles.set(k,list);
    }
}
export type RiverSample={x:number;y:number;level:number;width:number;distance:number;side:number;tx:number;ty:number;roughness:number;riverId:string};
export function riverSampleAt(x:number,y:number):RiverSample|undefined{
  const entries=tiles.get(`${Math.floor(x/512)},${Math.floor(y/512)}`);if(!entries)return;
  let best:Segment|undefined,nearest=Infinity,f=0;
  for(const s of entries){const dx=s.b.x-s.a.x,dy=s.b.y-s.a.y,t=Math.max(0,Math.min(1,((x-s.a.x)*dx+(y-s.a.y)*dy)/(dx*dx+dy*dy))),d=(x-s.a.x-dx*t)**2+(y-s.a.y-dy*t)**2;
    if(d<nearest){nearest=d;best=s;f=t;}}
  if(!best)return;const {a,b,river}=best,width=a.width+(b.width-a.width)*f,side=Math.sqrt(nearest);
  if(side>width/2+RIVER_BANK_APRON)return;
  return {x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,level:a.z+(b.z-a.z)*f,width,
    distance:a.distance+(b.distance-a.distance)*f,side,tx:a.tx+(b.tx-a.tx)*f,ty:a.ty+(b.ty-a.ty)*f,roughness:river.roughness,riverId:river.id};
}
// Immutable railway ground envelope. Deliberately does not import terrain or
// classify spans using the new terrain, so existing bridge geometry cannot move.
function railReserved(x:number,y:number){
  const route=scenicRailway(),entries=route.tiles.get(`${Math.floor(x/512)},${Math.floor(y/512)}`);if(!entries)return false;
  for(const i of entries){const a=route.points[i],b=route.points[(i+4)%route.points.length],dx=b.x-a.x,dy=b.y-a.y;
    const f=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));
    if((x-a.x-dx*f)**2+(y-a.y-dy*f)**2<320**2)return true;
  }return false;
}
export function hydrologyProtected(x:number,y:number){
  if(railReserved(x,y))return true;
  // Authored castle and entire ascent, monument, caves, arrival and fixed pads.
  if(x>=16000&&x<=21600&&y>=10000&&y<=20100)return true;
  if(Math.hypot(x-27008,y-19456)<1200)return true;
  if(x>4000&&x<8700&&y>4300&&y<9100)return true;
  if(Math.hypot(x-14800,y-4464)<400||Math.hypot(x-20784,y-18544)<600)return true;
  for(const s of RETREAT_SITES)if(Math.hypot(x-s.x,y-s.y)<Math.hypot(s.w,s.d)/2+220)return true;
  for(const route of RETREAT_APPROACHES)for(let i=1;i<route.points.length;i++){
    const a=route.points[i-1],b=route.points[i],dx=b.x-a.x,dy=b.y-a.y,f=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));
    if((x-a.x-dx*f)**2+(y-a.y-dy*f)**2<100**2)return true;
  }return false;
}
export function deepmereRadius(x:number,y:number){return waterBasinRadius(x,y,deep);}
/** Ground sampler; keep unauthored terrain exactly unchanged outside the field. */
export function hydrologyTerrainHeight(x:number,y:number,natural:number,includeLake=true){
  const lakeRadius=includeLake&&Math.abs(x-deep.x)<deep.rx*1.2&&Math.abs(y-deep.y)<deep.ry*1.2?deepmereRadius(x,y):Infinity;
  const river=riverSampleAt(x,y);
  if(lakeRadius>=1.15&&!river)return natural;
  if(hydrologyProtected(x,y)){
    // The Skyfalls station spans low ground. Fill its channel banks from
    // bedrock instead of leaving the elevated water ribbon exposed to air.
    // This only adds ground below the original truss; railway alignment,
    // decks and authored pier sockets keep their original generation field.
    if(river?.riverId==='skyfalls-river'&&Math.abs(river.level-442.5)<.05){
      const inner=river.width*.58,outer=river.width*.68;
      if(river.side>=inner&&river.side<outer+96){
        const top=Math.ceil((river.level+2)/32)*32;
        const fill=top+(natural-top)*smooth((river.side-outer)/96);
        return Math.max(natural,fill);
      }
    }
    // The existing cove span has no ordinary piers between its towers. Only
    // deepen the already submerged central boat lane, far from tower bases;
    // never grade rail approaches or raise ground beneath the deck.
    if(river?.riverId==='reedwater'&&Math.abs(river.level-ISLAND_SEA_LEVEL)<.1&&river.side<river.width*.43
      &&x>30880&&x<31700&&y>24150&&y<25200&&natural<ISLAND_SEA_LEVEL-1
      &&Math.hypot(x-31789.7,y-24988.7)>192&&Math.hypot(x-31901.7,y-24794.7)>192)
      return Math.min(natural,river.level-112+16*(river.side/(river.width/2))**2);
    return natural;
  }
  let ground=natural;
  if(lakeRadius<1.15){
    const bed=-416+32*smooth(lakeRadius/.35),shelf=deep.level-64;
    const bowl=bed+(shelf-bed)*smooth((lakeRadius-.38)/.46);
    ground=bowl+(natural-bowl)*smooth((lakeRadius-.83)/.32);
  }
  if(river){
    const r=river.side/(river.width/2),bed=Math.max(-416,river.level-112+16*Math.min(1,r*r));
    // Raised bank collars only where necessary to contain an elevated tributary.
    const cross=bed+(river.level+32-bed)*smooth((r-.95)/.32);
    const target=r<1.35?cross:Math.max(natural,river.level+32);
    const blend=1-smooth((river.side-river.width*.675)/(RIVER_BANK_APRON-river.width*.175));
    const channel=target*blend+natural*(1-blend);
    // Cutting an outlet must never build a submerged dam across a lake bowl.
    const lakeJoin=ISLAND_LAKES.some(l=>Math.abs(river.level-l.level)<.05&&Math.abs(x-l.x)<l.rx*1.5&&Math.abs(y-l.y)<l.ry*1.5&&waterBasinRadius(x,y,l)<1.45);
    ground=lakeRadius<1.15||lakeJoin?Math.min(ground,channel):channel;
  }return ground;
}
export function riverWetAt(x:number,y:number){const s=riverSampleAt(x,y);return s&&s.side<s.width*.65?s:undefined;}
export function hydrologyWaterLevel(x:number,y:number):number|undefined{
  let level:number|undefined;
  if(Math.abs(x-deep.x)<deep.rx*1.15&&Math.abs(y-deep.y)<deep.ry*1.15&&deepmereRadius(x,y)<1.05)level=deep.level;
  const river=riverWetAt(x,y);if(river)level=level===undefined?river.level:Math.max(level,river.level);
  return level;
}
export const RIVER_CROSSING={id:'reedwater-crossing',name:'REEDWATER CROSSING',x:20000,y:26900,z:608,
  angle:Math.atan2(4500, -2400),length:960,width:120,color:'#d6c2a1',detail:'A stone arch above Reedwater. Walk across the valley or pass beneath it on the water.'} as const;
export const HYDROLOGY_SITES=[
  {id:'deepmere',name:'DEEPMERE LAKE',x:deep.x,y:deep.y,markerX:13800,markerY:22000,color:'#79c4cc',detail:'A deep sheltered lake. Skyfalls Run and Gatewater Run meet here before Reedwater winds to the eastern sea.'},
  {...RIVER_CROSSING,markerX:RIVER_CROSSING.x-Math.sin(RIVER_CROSSING.angle)*48,markerY:RIVER_CROSSING.y+Math.cos(RIVER_CROSSING.angle)*48},
  {id:'river-mouth',name:'REEDWATER ESTUARY',x:31000,y:25500,markerX:30800,markerY:25760,color:'#8accc7',detail:'Follow the wild river inland to Deepmere, Skyfalls and the World Gate. The eastern railway bridge stays overhead.'},
] as const;
