/** Survey the implemented network. Run: node_modules/.bin/tsx tools/river-survey.ts */
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import sharp from 'sharp';
import {FRIENDS_RIVERS,RIVER_CROSSING,HYDROLOGY_SITES} from '../src/game/world/FriendsHydrology';
import {baseTerrainHeight,FRONTIER_SITES,RIVER_BRIDGE} from '../src/game/world/FriendsTerrain';
import {ISLAND_LAKES,ISLAND_SEA_LEVEL} from '../src/game/world/FriendsIsland';
import {friendsWaterGround,friendsWaterLevel} from '../src/game/world/FriendsWaterSurface';
import {scenicRailway,scenicStationPoses} from '../src/game/world/FriendsScenicRailway';
import {RETREAT_SITES} from '../src/game/world/FriendsRetreatSites';
const out=resolve('artifacts/river-design');mkdirSync(out,{recursive:true});
const report={status:'implemented',date:'2026-10-09',unitsPerMetre:12,lakes:ISLAND_LAKES,rivers:FRIENDS_RIVERS.map(r=>{
 let minDepth=Infinity,maxGrade=0,minWidth=Infinity,maxWidth=0;
 for(let i=0;i<r.points.length;i++){
  const p=r.points[i];minWidth=Math.min(minWidth,p.width);maxWidth=Math.max(maxWidth,p.width);
  if(i){const a=r.points[i-1];maxGrade=Math.max(maxGrade,(a.z-p.z)/Math.hypot(a.x-p.x,a.y-p.y));}
  for(const offset of [-144,-96,0,96,144]){
   const x=p.x-p.ty*offset,y=p.y+p.tx*offset,water=friendsWaterLevel(x,y);
   if(water===undefined)throw new Error(`Dry navigation lane: ${r.id} at ${p.distance}`);
   minDepth=Math.min(minDepth,(water-friendsWaterGround(x,y))/12);
  }
 }
 return {id:r.id,name:r.name,lengthMetres:r.length/12,widthMetres:[minWidth/12,maxWidth/12],minimumDepthMetresIn24mLane:minDepth,maximumGrade:maxGrade,source:r.source,points:r.points};
}),bridge:{...RIVER_CROSSING,boxes:RIVER_BRIDGE.boxes.length,triangles:RIVER_BRIDGE.boxes.length*12,approachMetresPerBank:128},deepmere:{nominalSizeMetres:[ISLAND_LAKES[2].rx/6,ISLAND_LAKES[2].ry/6],depthMetres:(154.5+416)/12},rowboat:{count:1,crew:2,lengthUnits:164,widthUnits:82,source:'https://kenney.nl/assets/watercraft-kit',license:'CC0-1.0',manualStrokes:true}};
writeFileSync(resolve(out,'survey.json'),JSON.stringify(report,null,2));
const x0=4400,y0=8700,x1=35300,y1=33600,W=1400,H=1128,mapX=(x:number)=>(x-x0)/(x1-x0)*W,mapY=(y:number)=>(y-y0)/(y1-y0)*H;
const rasterW=420,rasterH=336,pixels=Buffer.alloc(rasterW*rasterH*3);
for(let j=0;j<rasterH;j++)for(let i=0;i<rasterW;i++){
 const x=x0+(i+.5)/rasterW*(x1-x0),y=y0+(j+.5)/rasterH*(y1-y0),h=baseTerrainHeight(x,y),v=Math.max(0,Math.min(1,h/4700));
 const color=h<ISLAND_SEA_LEVEL?[33,76,87]:[84+v*107,111+v*91,80+v*119];
 for(let k=0;k<3;k++)pixels[(j*rasterW+i)*3+k]=Math.round(color[k]);
}
const png=await sharp(pixels,{raw:{width:rasterW,height:rasterH,channels:3}}).png().toBuffer();
const poly=(points:readonly {x:number;y:number}[])=>points.map(p=>`${mapX(p.x).toFixed(1)},${mapY(p.y).toFixed(1)}`).join(' ');
const labels:string[]=[];
function label(x:number,y:number,name:string,dx=10,dy=-12,color='#f4edcf'){
 const tx=Math.max(12,Math.min(W-name.length*12.6-24,mapX(x)+dx)),ty=Math.max(28,Math.min(H-16,mapY(y)+dy));
 labels.push(`<circle cx="${mapX(x)}" cy="${mapY(y)}" r="5" fill="${color}"/><text x="${tx}" y="${ty}" fill="${color}" stroke="#122927" stroke-width="4" paint-order="stroke" font-size="18">${name}</text>`);
}
for(const s of HYDROLOGY_SITES)label(s.x,s.y,s.name,s.id==='deepmere'?-70:12,s.id==='deepmere'?40:-18);
label(6912,20448,'SKYFALLS LAKE',-180,-42);label(15520,10800,'WORLD BRIDGE / GATE LAKE',-170,-70);
label(7200,23000,'Skyfalls Run',-172,0,'#a3e6e0');label(13700,16400,'Gatewater Run',12,0,'#a3e6e0');label(26300,27400,'Reedwater River',-130,46,'#a3e6e0');
for(const site of RETREAT_SITES)if(site.x>x0&&site.x<x1&&site.y>y0&&site.y<y1)label(site.x,site.y,site.name,12,-16,'#efd8a8');
for(const id of ['citadel','portal','volcano']){const s=FRONTIER_SITES.find(s=>s.id===id)!;label(s.x,s.y,s.name,10,-20);}
for(const s of scenicStationPoses())if(s.x>x0&&s.x<x1&&s.y>y0&&s.y<y1)label(s.x,s.y,s.name,10,24,'#dfbb9a');
label(8000,24348,'Existing railway underpass',-140,48,'#dfbb9a');label(31170,24502,'Existing cove rail bridge',-120,-55,'#dfbb9a');
const lakePaths=ISLAND_LAKES.map(l=>{
 const points=[];for(let a=0;a<=Math.PI*2+.001;a+=Math.PI/90){
  const warp=l.id==='deepmere'?1+.065*Math.sin(a*3+.4)+.025*Math.sin(a*7):1;
  points.push({x:l.x+l.rx*warp*Math.cos(a),y:l.y+l.ry*warp*Math.sin(a)});
 }return `<polygon points="${poly(points)}" fill="#4f9da9" stroke="#b3e7df" stroke-width="2"/>`;
}).join('');
const rails=`<polyline points="${poly(scenicRailway().points.filter((_,i)=>i%4===0))}" fill="none" stroke="#352d21" stroke-width="5"/><polyline points="${poly(scenicRailway().points.filter((_,i)=>i%4===0))}" fill="none" stroke="#e1c39d" stroke-width="2" stroke-dasharray="5 5"/>`;
const rivers=FRIENDS_RIVERS.map(r=>`<polyline points="${poly(r.points.filter((_,i)=>i%2===0))}" fill="none" stroke="#aff6ed" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/><polyline points="${poly(r.points.filter((_,i)=>i%2===0))}" fill="none" stroke="#348fa9" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
const b=RIVER_CROSSING,bridge=`<line x1="${mapX(b.x-Math.cos(b.angle)*2016)}" y1="${mapY(b.y-Math.sin(b.angle)*2016)}" x2="${mapX(b.x+Math.cos(b.angle)*2016)}" y2="${mapY(b.y+Math.sin(b.angle)*2016)}" stroke="#efe0bd" stroke-width="6"/>`;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H+115}" viewBox="0 0 ${W} ${H+115}"><rect width="100%" height="100%" fill="#142f31"/><defs><clipPath id="land"><rect width="${W}" height="${H}"/></clipPath></defs><g clip-path="url(#land)"><image href="data:image/png;base64,${png.toString('base64')}" width="${W}" height="${H}"/>${lakePaths}${rivers}${rails}${bridge}<g font-family="Arial,sans-serif" font-weight="600">${labels.join('')}</g></g><g font-family="Arial,sans-serif" font-weight="600"><text x="32" y="${H+40}" fill="#e5eee3" font-size="28">SUNLINE · THE CONNECTED RIVERS</text><text x="32" y="${H+77}" fill="#a9cccb" font-size="18">${(report.rivers.reduce((n,r)=>n+r.lengthMetres,0)/1000).toFixed(2)} km of waterway · 26–48 m width controls · Deepmere 433 × 367 m · one manual two-person skiff</text><text x="${W-230}" y="${H+35}" fill="#e5eee3" font-size="16">0</text><text x="${W-56}" y="${H+35}" fill="#e5eee3" font-size="16">500 m</text><path d="M ${W-230} ${H+48} h ${6000/(x1-x0)*W}" stroke="#e5eee3" stroke-width="4"/></g></svg>`;
writeFileSync(resolve(out,'placement.svg'),svg);await sharp(Buffer.from(svg)).png().toFile(resolve(out,'placement.png'));
console.log(JSON.stringify({...report,rivers:report.rivers.map(({points,...r})=>r)},null,2));
