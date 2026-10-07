import type { IslandStoneBox } from './FriendsIsland';
import { createCastleStairs } from './FriendsCastleStairs';

/** One authored block fortress, shared by collision, mining and the skyline. */
export const HIGHFALL_CASTLE = { x: 18304, y: 12416, foundation: 4352, floor: 4384, half: 1792 } as const;
export const CASTLE_TOWERS = [
  ...[-1536,1536].flatMap(dx=>[-1664,1152].map(dy=>({dx,dy,height:dy<0?960:928,size:448}))),
  ...[-384,384].map(dx=>({dx,dy:1120,height:864,size:384})),
];
export type CastleTorch = { x: number; y: number; z: number; large?: boolean };
export type CastleRouteStep = { x: number; y: number; z: number };
const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

/** An irregular, broad massif with a southern saddle and eastern buttress.
 * Only rock protruding through the court is excavated. The landform has no
 * rectangular distance field and never follows the outline of the castle. */
export function castleTerrainHeight(x: number, y: number, natural: number) {
  const c = HIGHFALL_CASTLE;
  if(Math.abs(x-c.x)>6800||Math.abs(y-c.y)>8000)return natural;
  const dx=x-18112,dy=y-13248,angle=-.30,rx=(dx*Math.cos(angle)-dy*Math.sin(angle))/3400,ry=(dx*Math.sin(angle)+dy*Math.cos(angle))/4300;
  const r=Math.hypot(rx,ry),envelope=1-smooth((r-1.1)/.9);
  const fracture=.85+.12*Math.sin(x/530+y/1100)+.07*Math.sin(y/430-x/900);
  const crown=1450*Math.exp(-r*r*1.35)*fracture;
  const spur=1100*Math.exp(-(((x-20160)/2400)**2+((y-15360)/3000)**2));
  const saddle=360*Math.exp(-(((x-18304)/1800)**2+((y-16960)/3000)**2));
  let height=natural+(crown+spur+saddle)*envelope;
  // Excavation is hidden inside the retaining wall, with natural slopes
  // continuing well beyond every tower and the western fly-through vault.
  const court=Math.max(Math.abs(x-c.x)-1792,Math.abs(y-c.y+320)-1536);
  const cut=1-smooth(court/128);
  height-=Math.max(0,height-(c.foundation-64))*cut;
  return height;
}

export function createHighfallCastle(sampleHeight: (x: number, y: number) => number) {
  const c = HIGHFALL_CASTLE, boxes: IslandStoneBox[] = [], torches: CastleTorch[] = [], route: CastleRouteStep[] = [];
  const box = (dx: number, dy: number, z: number, w: number, d: number, h: number, tint: IslandStoneBox['tint'] = 'stone') => {
    boxes.push({ x:c.x+dx, y:c.y+dy, z, w, d, h, tint });
  };
  const torch = (dx: number, dy: number, z: number = c.floor, large = false) => torches.push({x:c.x+dx,y:c.y+dy,z,large});
  const f = c.floor;
  // A wide ward gives each building its own space. The south gate and the
  // approved approach stay in place; the compound grows west, east and north.
  box(0,-320,c.foundation-128,3584,3072,128,'dark');
  box(0,-320,c.foundation,3520,3008,64);
  for(let dx=-1728;dx<=1728;dx+=128)for(let dy=-1792;dy<=1152;dy+=128){
    let ground=Infinity;
    for(const ox of [-48,48])for(const oy of [-48,48])ground=Math.min(ground,sampleHeight(c.x+dx+ox,c.y+dy+oy));
    const bottom=ground-64,top=c.foundation-128;
    if(bottom<top)box(dx,dy,bottom,128,128,top-bottom,'dark');
  }
  // Court, hall, cloisters and tower doorways share one flush paving datum.
  box(0,-320,f+32,3392,2944,32,'dark');
  box(0,544,f+32,384,1344,32);
  box(0,224,f+32,2912,192,32);
  for(const dx of [-1376,1376])box(dx,-480,f+32,192,1792,32);

  const battlements = (dx:number,dy:number,z:number,w:number,d:number) => {
    box(dx,dy,z,w,d,64);
    const merlon=(x:number,y:number)=>{
      if(CASTLE_TOWERS.some(t=>z<f+t.height-64&&Math.abs(x-t.dx)<t.size/2&&Math.abs(y-t.dy)<t.size/2))return;
      box(x,y,z+64,64,64,96);
    };
    for(let x=-w/2+32;x<w/2;x+=128){if(d>1000&&w<256)continue;merlon(dx+x,dy-d/2+32);merlon(dx+x,dy+d/2-32);}
    for(let y=-d/2+160;y<d/2-64;y+=128)for(const side of [-1,1]){
      if(w>700&&d<256)continue;
      // The curved court flight enters through a generous opening in the
      // inner parapet. Exterior merlons remain continuous for protection.
      if(d>1000&&w<256&&Math.sign(dx)*side<0&&dy+y>=640&&dy+y<=1024)continue;
      merlon(dx+side*(w/2-32),dy+y);
    }
  };
  // Ground passages and upper galleries open on all four faces. Wall walks
  // run straight through the galleries, with no dead ends inside solid towers.
  const tower = (dx:number,dy:number,height:number,size=448) => {
    const half=size/2,panel=(size-160)/2,offset=40+size/4;
    let ground=Infinity;
    for(let x=-half+16;x<half;x+=32)for(let y=-half+16;y<half;y+=32)ground=Math.min(ground,sampleHeight(c.x+dx+x,c.y+dy+y));
    const bottom=Math.floor((ground-64)/32)*32;
    if(bottom<f+32)box(dx,dy,bottom,size,size,f+32-bottom,'dark');
    box(dx,dy,f+32,size,size,32,'dark');
    for(const axis of [0,1])for(const side of [-1,1]){
      const face=side*(half-32);
      const faceBox=(along:number,z:number,width:number,h:number,tint:IslandStoneBox['tint']='dark')=>{
        box(dx+(axis===0?face:along),dy+(axis===0?along:face),z,axis===0?64:width,axis===0?width:64,h,tint);
      };
      const doorShift=size===448?(axis===0?-Math.sign(dy): -Math.sign(dx))*96:0;
      for(const [lo,hi] of [[-half,doorShift-80],[doorShift+80,half]])faceBox((lo+hi)/2,f+64,hi-lo,256);
      for(const sign of [-1,1])faceBox(sign*offset,f+320,panel,height-320);
      faceBox(0,f+320,160,128);
      for(const sign of [-1,1])faceBox(sign*64,f+448,32,160,'stone');
      faceBox(0,f+608,160,96);
      faceBox(0,f+832,160,height-832);
    }
    box(dx,dy,f+672,size-128,size-128,32);
    box(dx,dy,f+height-32,size+32,size+32,32);
    battlements(dx,dy,f+height,size+32,size+32);
    torch(dx,dy,f+height+64,true);
  };
  for(const t of CASTLE_TOWERS)tower(t.dx,t.dy,t.height,t.size);

  for(const dx of [-1536,1536]){
    box(dx,-256,f+64,128,2368,576,'dark');
    battlements(dx,-256,f+640,192,2816);
    for(let dy=-1280;dy<=736;dy+=352){box(dx,dy,f+64,192,96,448);torch(dx-Math.sign(dx)*128,dy,f+64);}
  }
  box(0,-1664,f+64,2624,128,576,'dark');
  battlements(0,-1664,f+640,3072,192);
  for(const dx of [-944,944]){
    box(dx,1152,f+64,736,128,576,'dark');
    battlements(dx,1152,f+640,1184,192);
  }
  // A generous gate aligns exactly with the existing curved approach.
  for(let i=0;i<4;i++)for(const side of [-1,1])box(side*(240-i*32),1152,f+352+i*32,32,192,32);
  box(0,1152,f+480,448,192,64);
  battlements(0,1152,f+640,640,192);
  for(const dx of [-288,288])torch(dx,1312,f+64,true);

  // The hall is almost twice as deep and substantially wider. Its open stair
  // atrium has a broad terrace around it instead of a thin, crowded roof ring.
  const ky=-672,kw=1344,kd=1280,kh=1280;
  for(const dx of [-640,640])box(dx,ky,f+64,64,kd,kh,'dark');
  for(const sy of [-1,1]){
    const y=ky+sy*608;
    for(const dx of [-416,416])box(dx,y,f+64,512,64,288,'dark');
    box(0,y,f+352,kw,64,224,'dark');
    for(const dx of [-640,-224,224,640])box(dx,y,f+576,64,64,320);
    for(const dx of [-432,0,432])box(dx,y,f+896,160,64,64);
    box(0,y,f+960,kw,64,384,'dark');
  }
  for(const dx of [-544,544])box(dx,ky,f+1344,320,1344,96);
  for(const dy of [-528,528])box(0,ky+dy,f+1344,768,288,96);
  for(let dx=-640;dx<=640;dx+=128)for(const dy of [-640,640])box(dx,ky+dy,f+1440,64,64,96);
  for(let dy=-512;dy<=512;dy+=128)for(const dx of [-672,672])box(dx,ky+dy,f+1440,64,64,96);
  box(0,ky,f+64,96,96,1376,'dark');
  // The crown is a rooftop lookout, with doors onto the terrace. It uses
  // the keep as its structure instead of driving a second tower through it.
  const tx=608,ty=ky-576,roof=f+1440;
  box(tx,ty,roof-32,256,256,32);
  for(const axis of [0,1])for(const side of [-1,1]){
    for(const sign of [-1,1])box(tx+(axis===0?side*96:sign*96),ty+(axis===0?sign*96:side*96),roof,64,64,256,'dark');
    box(tx+(axis===0?side*96:0),ty+(axis===0?0:side*96),roof+256,axis===0?64:256,axis===0?256:64,64);
  }
  battlements(tx,ty,roof+320,320,320);
  for(let i=0;i<3;i++)box(tx,ty,roof+480+i*32,256-i*64,256-i*64,32,i===2?'copper':'dark');
  for(const dx of [-288,288])torch(dx,ky+688,f+64);
  for(const dx of [-128,128])torch(dx,ky-64,f+64,true);
  // Independent colonnades leave clear aisles beside the keep and outer wall.
  for(const side of [-1,1]){
    box(side*1104,ky,f+32,320,1024,32);
    box(side*1248,ky,f+64,64,1024,384,'dark');
    for(let dy=ky-448;dy<=ky+448;dy+=224)box(side*944,dy,f+64,64,64,384);
    box(side*1104,ky,f+448,384,1088,64);
    for(let i=0;i<4;i++)box(side*1104,ky,f+512+i*32,384-i*64,1088,32,'copper');
  }
  for(const dx of [-96,96])box(dx,512,f+64,32,224,64);
  for(const dy of [-96,96])box(0,512+dy,f+64,160,32,64);
  for(const dx of [-576,576])torch(dx,704,f+64,true);

  // Exact fan treads sit on recessed voxel cores. The visible eight-unit
  // masonry and the shared movement surface are generated from the same path.
  const stairs=createCastleStairs(sampleHeight),cells=new Map<string,number>();
  route.push(...stairs.approach);
  for(const t of stairs.treads){
    const x=(t.a.x+t.b.x)/2,y=(t.a.y+t.b.y)/2;
    const n=Math.ceil(t.width/64);
    for(let j=-n;j<=n;j++){
      const offset=j*32,px=x+t.nxA*offset,py=y+t.nyA*offset;
      if(Math.abs(offset)>t.width/2+32)continue;
      const vx=Math.floor(px/32),vy=Math.floor(py/32),key=`${vx},${vy},${Math.floor(t.z/32)}`;
      cells.set(key,Math.floor(t.z/32)*32);
    }
  }
  const coreRows=new Map<string,number[]>();
  for(const key of cells.keys()){const [vx,vy,vz]=key.split(',').map(Number),row=`${vy},${vz}`,xs=coreRows.get(row)||[];xs.push(vx);coreRows.set(row,xs);}
  for(const [row,xs]of coreRows){
    const [vy,vz]=row.split(',').map(Number);xs.sort((a,b)=>a-b);
    for(let i=0;i<xs.length;){let end=i+1;while(end<xs.length&&xs[end]===xs[end-1]+1)end++;
      const w=(end-i)*32;boxes.push({x:xs[i]*32+w/2,y:vy*32+16,z:vz*32-64,w,d:32,h:64,tint:'stone',detail:'stair-core'});i=end;}
  }
  // Piers are restrained, flared sockets. They follow the moving tangent and
  // extend into bedrock; the approach is no longer a rigid rectangular bridge.
  let lastPier=-1000,lastTorch=-1000;
  for(const t of stairs.treads.filter(t=>t.flight==='approach')){
    const x=(t.a.x+t.b.x)/2,y=(t.a.y+t.b.y)/2;
    if(t.distance-lastPier>=384){
      const ground=Math.min(...[-96,0,96].flatMap(dx=>[-96,0,96].map(dy=>sampleHeight(x+dx,y+dy))))-96;
      const h=t.z-64-ground;if(h>64){box(x-c.x,y-c.y,ground,160,160,h,'dark');boxes.at(-1)!.detail='stair-pier';box(x-c.x,y-c.y,ground,224,224,96,'dark');}
      lastPier=t.distance;
    }
    if(t.distance-lastTorch>=640&&t.distance>180){
      const tx=x+t.nxA*192,ty=y+t.nyA*192;
      torch(tx-c.x,ty-c.y,t.z,true);lastTorch=t.distance;
    }
  }
  // Every brazier rests on stone, including those beside the high viaduct.
  for(const t of torches){
    const support=Math.max(sampleHeight(t.x,t.y),...boxes.filter(b=>t.x>=b.x-b.w/2&&t.x<b.x+b.w/2&&t.y>=b.y-b.d/2&&t.y<b.y+b.d/2&&b.z+b.h<=t.z).map(b=>b.z+b.h));
    box(t.x-c.x,t.y-c.y,Math.min(support,t.z)-32,64,64,Math.max(32,t.z-support+32),'dark');
  }
  // Snap every volume boundary, including piers with variable terrain heights.
  for(const b of boxes){b.w=Math.max(32,Math.ceil(b.w/32)*32);b.d=Math.max(32,Math.ceil(b.d/32)*32);b.h=Math.max(32,Math.ceil(b.h/32)*32);b.x=Math.round((b.x-b.w/2)/32)*32+b.w/2;b.y=Math.round((b.y-b.d/2)/32)*32+b.d/2;b.z=Math.round(b.z/32)*32;}
  // Sample the actual snapped footprint: using only a pier's centre leaves
  // its downhill edge hanging above a steep voxel terrace.
  for(const b of boxes.filter(b=>b.y>13696&&b.h>128&&b.z<c.foundation)){
    let low=Infinity;
    for(let x=b.x-b.w/2+16;x<b.x+b.w/2;x+=32)for(let y=b.y-b.d/2+16;y<b.y+b.d/2;y+=32)low=Math.min(low,sampleHeight(x,y));
    const top=b.z+b.h;b.z=Math.min(b.z,low-64);b.h=top-b.z;
  }
  for(const b of boxes.filter(b=>b.detail==='stair-pier')){
    let contact=Infinity;
    for(let x=b.x-b.w/2+16;x<b.x+b.w/2;x+=16)for(let y=b.y-b.d/2+16;y<b.y+b.d/2;y+=16){const floor=stairs.floor(x,y);if(floor!==undefined)contact=Math.min(contact,floor);}
    if(Number.isFinite(contact))b.h=Math.max(32,Math.floor((contact-72)/32)*32-b.z);
  }
  for(const t of torches){
    const sockets=boxes.filter(b=>t.x>=b.x-b.w/2&&t.x<b.x+b.w/2&&t.y>=b.y-b.d/2&&t.y<b.y+b.d/2&&b.z+b.h<=t.z+32);
    if(sockets.length)t.z=Math.max(...sockets.map(b=>b.z+b.h));
  }
  return {boxes,torches,route};
}
