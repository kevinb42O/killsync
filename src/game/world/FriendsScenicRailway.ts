import { compileRailAlignment, sampleRailAlignment, type RailAlignment, type RailKnot } from './FriendsRailAlignment';
export const SCENIC_ROUTE_ID='sunline-grand-traverse-v3';
export const SCENIC_CHAPTERS=['Sunline Departure','Cedar Country','Amber Valley','Northern Foothills','World Gate Lakeside','Highfall Lower Bore','Crown Foothills','Glacier Valley','Tidal Shore','Eastern Cove Bridge','Quiet East Coast','Ember Mountain Passage','Ember Meadow','South Shore','Dune Country','Wild Reach','Southern Mountain Bore','Western Fjord','Skyfalls Shore','Rustwater Return'];
export const SCENIC_STOPS=[{id:'home',name:'Sunline Commons',dwell:45000},{id:'crown',name:'Highfall Meadow',dwell:35000},{id:'tidal',name:'Tidal Shore',dwell:35000},{id:'ember',name:'Ember Meadow',dwell:35000},{id:'falls',name:'Skyfalls Shore',dwell:35000}];
let cached:RailAlignment|undefined;
/** A low railway: broad landscape curves, direct mountain bores, and shoreline
 * bridges. There are no spirals, summit climbs, stair towers or elevated stations. */
export function scenicRailway():RailAlignment {
  if(cached)return cached;
  const k:RailKnot[]=[];
  const add=(chapter:number,x:number,y:number,z:number,station?:string)=>k.push({chapter,x,y,z,station});
  const line=(chapter:number,z:number,points:number[][])=>points.forEach(([x,y])=>add(chapter,x,y,z));
  add(1,6800,7500,722,'home');add(1,9100,7500,722);
  line(2,480,[[9800,5100],[11900,4500]]);
  line(3,608,[[13900,6000],[15800,6500]]);
  line(4,672,[[15800,8500]]);
  line(5,672,[[15800,11000],[15800,14500],[15400,17100],[15400,20500]]);
  line(6,800,[[19000,21600],[22800,20400],[24600,16900],[24000,14000],[24000,13500]]);
  add(7,24000,12000,608);add(7,24000,9900,480);add(7,25900,9900,274);add(7,27100,9900,274,'crown');add(7,29500,9900,274);
  line(8,608,[[30700,12200],[30700,15800],[28900,17700],[28000,18800]]);
  add(9,28000,20300,82);add(9,28000,21800,82,'tidal');add(9,28000,24200,82);
  line(10,128,[[30300,24000],[32900,25500],[35400,25600]]);
  line(11,256,[[38000,28100],[39400,31400]]);
  line(12,672,[[37400,34700],[34800,36500]]);
  add(13,31600,37500,466);add(13,30000,37500,466,'ember');add(13,28400,37500,466);
  line(14,128,[[25600,38100],[23000,39000]]);
  line(15,384,[[20800,37900],[19600,35400]]);
  line(16,608,[[19000,32900],[18000,31200]]);
  line(17,736,[[14800,29200],[11600,30300],[9800,31000]]);
  line(18,256,[[7600,29200],[7000,26700]]);
  add(19,8000,24950,594);add(19,8000,23200,594,'falls');add(19,8000,21400,594);
  line(19,736,[[9000,19500],[8700,16900],[9000,14000]]);
  line(20,608,[[9400,11000],[7200,9600],[4500,10000],[4500,7500]]);
  cached=compileRailAlignment(k);return cached;
}
let stationCache:ReturnType<typeof buildStationPoses>|undefined;
export function scenicStationPoses(){return stationCache??=buildStationPoses();}
function buildStationPoses(){const route=scenicRailway();return route.stations.map(s=>({...SCENIC_STOPS.find(p=>p.id===s.id)!,distance:s.distance,...sampleRailAlignment(route,s.distance)}));}
