export const CAVE_ENTRANCE = { x:6384, y:5152, radius:176, name:'THE LANTERN DESCENT' };
/** Authored expedition below the original cave. No terrain generation reset:
 * the old passages and saved excavations remain alongside this descent. */
export type DescentPoint={x:number;y:number;z:number};
export type DescentRoom={id:string;name:string;x:number;y:number;rx:number;ry:number;floor:number;roof:number;theme:'mine'|'ruins'|'crystal'|'ember'|'vault';detail:string};
export const CAVE_DESCENT_ROOMS:DescentRoom[]=[
  {id:'descent-mine',name:'The Last Shift',x:9504,y:6208,rx:352,ry:288,floor:-512,roof:-160,theme:'mine',detail:'Follow the copper lamps. The old haul road continues below.'},
  {id:'descent-archive',name:'The Buried Archive',x:10944,y:6912,rx:416,ry:352,floor:-896,roof:-480,theme:'ruins',detail:'The forge was sealed, not abandoned. Recover the archive relay.'},
  {id:'descent-gallery',name:'The Fallen Colonnade',x:12416,y:6176,rx:544,ry:320,floor:-1280,roof:-768,theme:'ruins',detail:'A broken civilization above a living mountain. Follow the blue light.'},
  {id:'descent-crystal',name:'The Listening Cavern',x:13568,y:7552,rx:544,ry:448,floor:-1728,roof:-1120,theme:'crystal',detail:'The crystals hold the last light of the forge.'},
  {id:'descent-overlook',name:'Ember Overlook',x:14848,y:6720,rx:384,ry:320,floor:-2112,roof:-1664,theme:'ember',detail:'The glow below belongs to an ancient furnace. Stay on the stone road.'},
  {id:'descent-forge',name:'The Heart Forge',x:16192,y:7424,rx:640,ry:480,floor:-2560,roof:-1888,theme:'ember',detail:'Recover the master tools. The final seal lies beyond the cooling gallery.'},
  {id:'descent-cooling',name:'The Cooling Gallery',x:17024,y:5952,rx:448,ry:352,floor:-3072,roof:-2592,theme:'ember',detail:'The heat fades. The oldest stone is close.'},
  {id:'descent-vault',name:'The Bedrock Vault',x:15424,y:4608,rx:544,ry:416,floor:-3584,roof:-2944,theme:'vault',detail:'Recover the Sunline relic. Bring the forgotten light home.'},
];
export const CAVE_BEDROCK_ROOM:DescentRoom={id:'descent-bedrock',name:'The Last Stone',x:14976,y:4032,rx:256,ry:224,floor:-4032,roof:-3680,theme:'vault',detail:'Bedrock. The long descent ends here; even dynamite cannot cut this stone.'};
export const CAVE_DESCENT_ROUTE:DescentPoint[]=[{x:8512,y:5296,z:-320},...CAVE_DESCENT_ROOMS.map(r=>({x:r.x,y:r.y,z:r.floor}))];
export type CaveLava=DescentPoint&{id:string;rx:number;ry:number;bed:number;safe:DescentPoint};
export const CAVE_LAVA:CaveLava[]=[
  {id:'cathedral-fissure',x:8608,y:4912,z:-392,rx:144,ry:72,bed:-448,safe:{x:8992,y:4800,z:32}},
  {id:'ember-basin',x:14848,y:6880,z:-2120,rx:160,ry:88,bed:-2176,safe:{x:14848,y:6720,z:-2112}},
  {id:'heart-furnace',x:16192,y:7648,z:-2568,rx:352,ry:128,bed:-2624,safe:{x:16192,y:7424,z:-2560}},
  {id:'cooling-channel',x:17024,y:6080,z:-3080,rx:192,ry:64,bed:-3136,safe:{x:17024,y:5952,z:-3072}},
];
export function caveLavaAt(x:number,y:number,z:number){return CAVE_LAVA.find(l=>z>=l.bed&&z<=l.z+8&&Math.hypot((x-l.x)/l.rx,(y-l.y)/l.ry)<1);}
export function caveLavaProtected(x:number,y:number,z:number){return CAVE_LAVA.some(l=>Math.hypot((x-l.x)/(l.rx+48),(y-l.y)/(l.ry+48))<1&&z>=l.bed-64&&z<l.z+8);}
/** Old excavations must not leave newly authored lava floating without a bed. */
export function caveLavaFoundation(x:number,y:number,z:number){
 if(x<8400||x>17300||y<4780||y>7840||z<-3200||z>-448)return false;
 return CAVE_LAVA.some(l=>z>=l.bed-64&&z<l.bed&&((x-l.x)/(l.rx+48))**2+((y-l.y)/(l.ry+48))**2<1);
}
export type CaveStair={a:DescentPoint;b:DescentPoint;width:number;z:number;length:number;dx:number;dy:number};
export const CAVE_UPPER_ROUTES:DescentPoint[][]=[
 [{x:6256,y:5104,z:608},{x:6320,y:5008,z:544},{x:6416,y:5040,z:480},{x:6496,y:5056,z:416},{x:6576,y:5008,z:352}],
 [{x:6576,y:5008,z:352},{x:6752,y:5056,z:352},{x:6976,y:4832,z:256},{x:7152,y:4752,z:160},{x:7776,y:4704,z:160}],
 [{x:7776,y:4704,z:160},{x:7936,y:4736,z:96},{x:8128,y:4800,z:32},{x:8960,y:4800,z:32}],
 [{x:8960,y:4800,z:32},{x:8960,y:5024,z:-64},{x:8736,y:5184,z:-224},{x:8512,y:5296,z:-320}],
];
export const CAVE_BEDROCK_ROUTE=[CAVE_DESCENT_ROUTE.at(-1)!,{x:CAVE_BEDROCK_ROOM.x,y:CAVE_BEDROCK_ROOM.y,z:CAVE_BEDROCK_ROOM.floor}];
export const CAVE_STAIR_ROUTES=[...CAVE_UPPER_ROUTES,CAVE_DESCENT_ROUTE,CAVE_BEDROCK_ROUTE];
export const CAVE_STAIRS:CaveStair[]=[];
// Eight-unit risers with a generous 112-unit walkway inside the carved tunnel.
for(const route of CAVE_STAIR_ROUTES)for(let i=1;i<route.length;i++){
 const a=route[i-1],b=route[i],length=Math.hypot(b.x-a.x,b.y-a.y),apron=Math.min(48,length*.15),count=Math.max(Math.ceil(length/16),Math.ceil(Math.abs(b.z-a.z)/8*length/(length-apron*2)));
 const height=(f:number)=>Math.round((a.z+(b.z-a.z)*Math.max(0,Math.min(1,(f*length-apron)/(length-apron*2))))/8)*8;
 for(let j=0;j<count;j++){
  const f=j/count,g=(j+1)/count,at={x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,z:height(f)},end={x:a.x+(b.x-a.x)*g,y:a.y+(b.y-a.y)*g,z:height(g)};
  CAVE_STAIRS.push({a:at,b:end,z:Math.max(at.z,end.z),width:112,length:length/count,dx:(b.x-a.x)/length,dy:(b.y-a.y)/length});
 }
}
const stairTiles=new Map<string,CaveStair[]>();
for(const s of CAVE_STAIRS)for(let x=Math.floor((Math.min(s.a.x,s.b.x)-96)/256);x<=Math.floor((Math.max(s.a.x,s.b.x)+96)/256);x++)for(let y=Math.floor((Math.min(s.a.y,s.b.y)-96)/256);y<=Math.floor((Math.max(s.a.y,s.b.y)+96)/256);y++){const k=`${x},${y}`,list=stairTiles.get(k)||[];list.push(s);stairTiles.set(k,list);}
function stairContains(s:CaveStair,x:number,y:number,clearance=0){
 const dx=x-s.a.x,dy=y-s.a.y,along=dx*s.dx+dy*s.dy;
 return along>=-clearance-.1&&along<=s.length+clearance+.1&&Math.abs(-dx*s.dy+dy*s.dx)<=s.width/2+clearance;
}
export function caveStairsAt(x:number,y:number,clearance=0){return (stairTiles.get(`${Math.floor(x/256)},${Math.floor(y/256)}`)||[]).filter(s=>stairContains(s,x,y,clearance));}
export function caveStairFloor(x:number,y:number,z:number,step=8){
 let floor:number|undefined;
 for(const s of stairTiles.get(`${Math.floor(x/256)},${Math.floor(y/256)}`)||[])if(s.z<=z+step+.01&&(floor===undefined||s.z>floor)&&stairContains(s,x,y))floor=s.z;
 return floor;
}
export function caveStairProtected(x:number,y:number,z:number){return (stairTiles.get(`${Math.floor(x/256)},${Math.floor(y/256)}`)||[]).some(s=>z>=s.z-64&&z<s.z&&stairContains(s,x,y));}
export type CaveLift=DescentPoint&{id:string;claim:string;destination:DescentPoint;label:string};
export const CAVE_LIFTS:CaveLift[]=CAVE_DESCENT_ROOMS.flatMap((r,i)=>{
 const lower={x:r.x-160,y:r.y,z:r.floor},upper=i?{x:CAVE_DESCENT_ROOMS[i-1].x+160,y:CAVE_DESCENT_ROOMS[i-1].y,z:CAVE_DESCENT_ROOMS[i-1].floor}:{x:8512,y:5296,z:-320};
 return [{...lower,id:`lift-${i}-up`,claim:`${r.id}-cache`,destination:upper,label:`Return lift · ${i?CAVE_DESCENT_ROOMS[i-1].name:'Silent Well'}`},{...upper,id:`lift-${i}-down`,claim:`${r.id}-cache`,destination:lower,label:`Restored lift · ${r.name}`}];
});
export const CAVE_RETURN:CaveLift={id:'vault-home',x:15424,y:4432,z:-3584,claim:'descent-vault-cache',destination:{x:6500,y:5488,z:704},label:'Return to camp'};
CAVE_LIFTS.push(CAVE_RETURN);
export function nearbyCaveLift(p:DescentPoint,claims:readonly string[]=[]){let nearest:CaveLift|undefined,best=64*64;for(const l of CAVE_LIFTS){if(!claims.includes(l.claim)||Math.abs(p.z-l.z)>=20)continue;const d=(p.x-l.x)**2+(p.y-l.y)**2;if(d<best){best=d;nearest=l;}}return nearest;}
const descentRooms=[...CAVE_DESCENT_ROOMS,CAVE_BEDROCK_ROOM];
export function descentRoomAt(p:DescentPoint){return descentRooms.find(r=>p.z>=r.floor-64&&p.z<r.roof&&Math.hypot((p.x-r.x)/r.rx,(p.y-r.y)/r.ry)<1);}

/** Reinforced lift aprons stay solid even where a route passes underneath. */
const landingTiles=new Map<string,CaveLift[]>();
for(const l of CAVE_LIFTS)for(let x=Math.floor((l.x-32)/512);x<=Math.floor((l.x+32)/512);x++)for(let y=Math.floor((l.y-32)/512);y<=Math.floor((l.y+32)/512);y++){const k=`${x},${y}`,list=landingTiles.get(k)||[];list.push(l);landingTiles.set(k,list);}
export function caveLandingProtected(x:number,y:number,z:number){
 if(x<6080||x>18240||y<1792||y>8832||z>96||z<-3616)return false;
 return (landingTiles.get(`${Math.floor(x/512)},${Math.floor(y/512)}`)||[]).some(l=>Math.abs(x-l.x)<32&&Math.abs(y-l.y)<32&&z>=l.z-32&&z<l.z);
}
