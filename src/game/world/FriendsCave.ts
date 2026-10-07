/** Authored volumetric cave topology. Coordinates use simulation x/y/elevation;
 * the renderer, collisions, mining and prediction share these exact voids. */
export const CAVE_ENTRANCE = { x:6384, y:5152, radius:176, name:'THE LANTERN DESCENT' };
export type CaveRoom={id:string;name:string;x:number;y:number;rx:number;ry:number;floor:number;roof:number};
export const CAVE_ROOMS:CaveRoom[]=[
  {id:'vestibule',name:'Lantern Vestibule',x:6576,y:5008,rx:320,ry:240,floor:352,roof:576},
  {id:'echo',name:'Hall of Echoes',x:7424,y:4704,rx:544,ry:416,floor:160,roof:544},
  {id:'cathedral',name:'The Split Cathedral',x:8608,y:4800,rx:640,ry:512,floor:32,roof:480},
  {id:'blue',name:'The Blue Vault',x:9184,y:5664,rx:416,ry:352,floor:-128,roof:352},
  {id:'roots',name:'The Root Gallery',x:7936,y:5792,rx:416,ry:320,floor:64,roof:416},
  {id:'well',name:'The Silent Well',x:8512,y:5296,rx:288,ry:224,floor:-320,roof:64},
];
export type CavePoint={x:number;y:number;z:number};
export const CAVE_ROUTES:CavePoint[][]=[
  [{x:6544,y:5152,z:352},{x:6752,y:5056,z:352},{x:6976,y:4832,z:256},{x:7152,y:4752,z:160}],
  [{x:7776,y:4704,z:160},{x:7936,y:4736,z:96},{x:8128,y:4800,z:32},{x:8960,y:4800,z:32}],
  [{x:8960,y:4960,z:32},{x:9120,y:5200,z:-32},{x:9184,y:5504,z:-128}],
  [{x:8960,y:5800,z:-128},{x:8592,y:5840,z:-32},{x:8128,y:5792,z:64}],
  [{x:7680,y:5664,z:64},{x:7408,y:5408,z:96},{x:7248,y:4976,z:160}],
  [{x:6384,y:5152,z:96},{x:6752,y:5360,z:96},{x:7056,y:5152,z:128},{x:7248,y:4976,z:160}],
  [{x:8960,y:4820,z:32},{x:8960,y:5024,z:-64},{x:8736,y:5184,z:-224},{x:8512,y:5296,z:-320}],
];
// A deterministic deep labyrinth: a winding main expedition, cross-links and
// remote dead ends. All branches use the same voxel voids as movement/mining.
const districts=['Amber Archives','Fossil Gardens','Obsidian Galleries','Crystal Labyrinth','Forgotten Treasury'];
const chambers=['Gate','Rotunda','Gallery','Sanctum','Vault','Throne'];
const deepRooms:CaveRoom[][]=[];
for(let row=0;row<5;row++){
  const line:CaveRoom[]=[];
  for(let col=0;col<6;col++){
    const floor=-64-((row+col)%5)*64;
    const room={id:`deep-${row}-${col}`,name:`${districts[row]} · ${chambers[col]}`,x:10048+col*1344,y:2304+row*1408,rx:384+(col%3)*64,ry:352+(row%3)*64,floor,roof:floor+352+(col%2)*64};
    CAVE_ROOMS.push(room);line.push(room);
  }
  deepRooms.push(line);
}
function connectRooms(a:CaveRoom,b:CaveRoom,bend=0){
  CAVE_ROUTES.push([{x:a.x,y:a.y,z:a.floor},{x:(a.x+b.x)/2+bend,y:(a.y+b.y)/2+bend,z:(a.floor+b.floor)/2},{x:b.x,y:b.y,z:b.floor}]);
}
connectRooms(CAVE_ROOMS.find(r=>r.id==='blue')!,deepRooms[2][0]);
connectRooms(CAVE_ROOMS.find(r=>r.id==='echo')!,deepRooms[1][0],-128);
for(let row=0;row<5;row++){
  for(let col=1;col<6;col++)connectRooms(deepRooms[row][col-1],deepRooms[row][col],col%2?192:-192);
  if(row<4)for(const col of [row%2?0:5,2,4])connectRooms(deepRooms[row][col],deepRooms[row+1][col],col===2?160:0);
  const source=deepRooms[row][5],floor=source.floor;
  const secret={id:`reliquary-${row}`,name:`${districts[row]} · Lost Reliquary`,x:source.x+1024,y:source.y+384,rx:256,ry:256,floor,roof:floor+288};
  CAVE_ROOMS.push(secret);connectRooms(source,secret,-128);
}
export const CAVE_BOUNDS={minX:6080,maxX:18240,minY:1792,maxY:8832};
export type CaveRange=[number,number];
const snap=(n:number)=>Math.round(n/32)*32;
const columns=new Map<string,CaveRange[]>();
type CaveSegment={a:CavePoint;b:CavePoint;route:number};
const roomTiles=new Map<string,CaveRoom[]>(),segmentTiles=new Map<string,CaveSegment[]>();
function indexTiles<T>(map:Map<string,T[]>,value:T,minX:number,maxX:number,minY:number,maxY:number){
  for(let x=Math.floor(minX/512);x<=Math.floor(maxX/512);x++)for(let y=Math.floor(minY/512);y<=Math.floor(maxY/512);y++){
    const key=`${x},${y}`,items=map.get(key)||[];items.push(value);map.set(key,items);
  }
}
for(const r of CAVE_ROOMS)indexTiles(roomTiles,r,r.x-r.rx*1.04,r.x+r.rx*1.04,r.y-r.ry*1.04,r.y+r.ry*1.04);
CAVE_ROUTES.forEach((route,id)=>{for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i];indexTiles(segmentTiles,{a,b,route:id},Math.min(a.x,b.x)-80,Math.max(a.x,b.x)+80,Math.min(a.y,b.y)-80,Math.max(a.y,b.y)+80);}});
/** Northern rim is a stair descent; the centre is a much deeper open shaft. */
export function caveEntranceFloor(x:number,y:number):number|undefined {
  const dx=x-CAVE_ENTRANCE.x,dy=y-CAVE_ENTRANCE.y,r=Math.hypot(dx,dy);
  if(r>=CAVE_ENTRANCE.radius)return;
  if(r<80)return 96;
  const angle=Math.atan2(-dy,dx);
  return dy>16?352:640-Math.min(9,Math.floor((Math.PI-Math.max(0,angle))/Math.PI*9))*32;
}
function segment(x:number,y:number,a:CavePoint,b:CavePoint){
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy)));
  return {distance:Math.hypot(x-a.x-dx*t,y-a.y-dy*t),floor:snap(a.z+(b.z-a.z)*t)};
}
export function caveColumn(x:number,y:number):CaveRange[] {
  if(x<CAVE_BOUNDS.minX||x>CAVE_BOUNDS.maxX||y<CAVE_BOUNDS.minY||y>CAVE_BOUNDS.maxY)return [];
  const k=`${Math.floor(x/32)},${Math.floor(y/32)}`,cached=columns.get(k);if(cached)return cached;
  x=Math.floor(x/32)*32+16;y=Math.floor(y/32)*32+16;
  const tile=`${Math.floor(x/512)},${Math.floor(y/512)}`,segments=segmentTiles.get(tile)||[];
  const ranges:CaveRange[]=[],mouth=caveEntranceFloor(x,y);
  if(mouth!==undefined){ranges.push([mouth,6144]);const route=CAVE_ROUTES[5];for(let i=1;i<route.length;i++){const s=segment(x,y,route[i-1],route[i]);if(s.distance<80)ranges.push([s.floor,s.floor+160]);}}
  else {
    const pillar=[[8416,4672,48],[8768,4672,48],[8848,5056,48]].some(([px,py,r])=>Math.hypot(x-px,y-py)<r);
    if(!pillar)for(const room of roomTiles.get(tile)||[]){
      const warp=1+.035*Math.sin(x*.021)*Math.sin(y*.017),d=Math.hypot((x-room.x)/room.rx,(y-room.y)/room.ry)/warp;
      if(d>=1)continue;
      const floor=room.id==='cathedral'?room.floor:snap(room.floor+Math.sin(x*.013)*Math.sin(y*.011)*22);
      const roof=snap(floor+112+(room.roof-floor-112)*Math.sqrt(1-d*d));
      const pit=room.id==='cathedral'&&Math.hypot((x-8608)/264,(y-4800)/248)<1;
      if(pit){
        // A narrow natural stone crossing remains suspended over the abyss.
        if(Math.abs(y-4800)<48){ranges.push([32,roof],[-416,-32]);}
        else ranges.push([-416,roof]);
      }else ranges.push([floor,roof]);
    }
    for(const {a,b} of segments){
      const s=segment(x,y,a,b);if(s.distance<80)ranges.push([s.floor,s.floor+snap(128+64*Math.sqrt(1-(s.distance/80)**2))]);
    }
  }
  ranges.sort((a,b)=>a[0]-b[0]);const merged:CaveRange[]=[];
  for(const range of ranges){const last=merged.at(-1);if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);else merged.push([...range]);}
  // A narrow solid ledge follows each route's elevation through room unions.
  // Keeping a rock band under it prevents the larger room from swallowing ramps.
  if(mouth===undefined){
    const ramps:CaveRange[]=[];
    const nearestByRoute=new Map<number,{distance:number;floor:number}>();
    for(const {a,b,route} of segments){const s=segment(x,y,a,b),previous=nearestByRoute.get(route);if(!previous||s.distance<previous.distance)nearestByRoute.set(route,s);}
    for(const nearest of nearestByRoute.values())if(nearest.distance<40)ramps.push([nearest.floor-64,nearest.floor]);
    for(const [low,high]of ramps)for(let i=merged.length-1;i>=0;i--){const [a,b]=merged[i];if(high<=a||low>=b)continue;merged.splice(i,1);if(low-a>=64)merged.splice(i,0,[a,low]);if(b-high>=64)merged.splice(i,0,[high,b]);}
    merged.sort((a,b)=>a[0]-b[0]);
  }
  if(columns.size>160000)columns.clear();columns.set(k,merged);return merged;
}
export function explorationCave(x:number,y:number,z:number){return caveColumn(x,y).some(([floor,roof])=>z>=floor&&z<roof);}
export function caveAt(x:number,y:number,z:number){
  if(!explorationCave(x,y,z)||z>576)return;
  return CAVE_ROOMS.find(r=>Math.hypot((x-r.x)/r.rx,(y-r.y)/r.ry)<1)?.name || CAVE_ENTRANCE.name;
}
export type CaveTorch=CavePoint&{cool?:boolean};
export const CAVE_TORCHES:CaveTorch[]=[];
// A repeated warm light rhythm marks the complete return loop and the lower branch.
for(const route of CAVE_ROUTES)for(let i=1;i<route.length;i++){
  const a=route[i-1],b=route[i],steps=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/(a.x>=9664?420:180));
  for(let j=0;j<steps;j++){const t=j/steps,dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);const x=a.x+dx*t-dy/length*24,y=a.y+dy*t+dx/length*24,expected=a.z+(b.z-a.z)*t;
    const floor=caveColumn(x,y).filter(r=>r[0]<=expected+32).at(-1)?.[0];
    if(floor!==undefined&&!CAVE_TORCHES.some(p=>Math.hypot(p.x-x,p.y-y)<96))CAVE_TORCHES.push({x,y,z:floor,cool:x>9050});
  }
}
for(const [x,y]of [[6256,5104],[6352,5024],[6456,5024],[6496,5136]]){const z=caveEntranceFloor(Math.floor(x/32)*32+16,Math.floor(y/32)*32+16);if(z!==undefined)CAVE_TORCHES.push({x,y,z});}

// Small lights at the abyss floor reveal its depth from the upper crossing.
CAVE_TORCHES.push({x:8624,y:4944,z:-416},{x:8512,y:4864,z:-416});
/** Static soft bounce, sampled only when a chunk is meshed. Dynamic flames and
 * the nearest direct lights sit on top of this inexpensive distant illumination. */
const glowTiles=new Map<string,CaveTorch[]>();
for(const t of CAVE_TORCHES)indexTiles(glowTiles,t,t.x-360,t.x+360,t.y-360,t.y+360);
export function caveGlow(x:number,y:number,z:number):[number,number,number]{
  let r=0,g=0,b=0;
  for(const t of glowTiles.get(`${Math.floor(x/512)},${Math.floor(y/512)}`)||[]){const d=(x-t.x)**2+(y-t.y)**2+(z-t.z-78)**2;if(d>360**2)continue;const a=(1-d/360**2)**2*.25;r+=a*(t.cool?.28:1);g+=a*(t.cool?.65:.38);b+=a*(t.cool?1:.08);}
  return [Math.min(.8,r),Math.min(.6,g),Math.min(.6,b)];
}

export type CaveTreasure=CavePoint&{id:string;name:string;gold:number;angle:number};
/** Stable IDs keep existing worlds compatible when the cave grows again. */
export const CAVE_TREASURES:CaveTreasure[]=CAVE_ROOMS.flatMap((room,i)=>{
  const locations=room.id==='cathedral'?[[room.x+352,room.y+128]]:[[room.x+96,room.y+96],[room.x-room.rx*.55,room.y+room.ry*.3]];
  return locations.flatMap(([x,y],j)=>{
    x=Math.floor(x/32)*32+16;y=Math.floor(y/32)*32+16;
    const range=caveColumn(x,y).find(([floor,roof])=>Math.abs(floor-room.floor)<=32&&roof-floor>=96);
    return range?[{id:`${room.id}-${j}`,name:room.id.startsWith('reliquary')?'Royal Hoard':'Ancient Chest',x,y,z:range[0],gold:room.id.startsWith('reliquary')?75000+i*1000:5000+i*1250+j*2500,angle:i*2.399}]:[];
  });
});
export function nearbyCaveTreasure(player:CavePoint,opened:readonly string[]=[],clear:(x:number,y:number,z:number)=>boolean=explorationCave){
  return CAVE_TREASURES.filter(t=>!opened.includes(t.id)&&Math.abs(t.z-player.z)<=48&&Math.hypot(t.x-player.x,t.y-player.y)<=112)
    .sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y))
    .find(t=>{const steps=Math.max(1,Math.ceil(Math.hypot(t.x-player.x,t.y-player.y)/16));for(let i=0;i<=steps;i++){const f=i/steps;if(!clear(player.x+(t.x-player.x)*f,player.y+(t.y-player.y)*f,player.z+28+(t.z-player.z)*f))return false;}return true;});
}
