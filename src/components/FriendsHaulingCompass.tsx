import type { CoopPlayerSnapshot } from '../game/multiplayer/CoopSimulation';
import type { HaulingSnapshot } from '../game/multiplayer/FriendsHauling';
import { haulingGoal, haulingJob } from '../game/world/FriendsHaulingGoal';

export function haulingBearing(player:{x:number;y:number;angle:number},target:{x:number;y:number}){
  const angle=Math.atan2(target.y-player.y,target.x-player.x)-player.angle;
  return Math.atan2(Math.sin(angle),Math.cos(angle));
}
/** Project a solid arrow, with sorted side faces, into a tilted compass dial. */
function CompassArrow({bearing,elevation,color}:{bearing:number;elevation:number;color:string}){
  const outline=[[0,-34],[21,-5],[8,-5],[8,28],[-8,28],[-8,-5],[-21,-5]];
  const yaw=Math.cos(bearing),turn=Math.sin(bearing),pitch=Math.cos(elevation),rise=Math.sin(elevation);
  const project=(x:number,y:number,z:number)=>{
    const yy=y*pitch+z*rise,zz=-y*rise+z*pitch,xx=x*yaw-yy*turn,forward=x*turn+yy*yaw;
    return {x:60+xx,y:61+forward*.6-zz*.8,depth:forward*.8+zz*.6};
  };
  const lower=outline.map(([x,y])=>project(x,y,0)),upper=outline.map(([x,y])=>project(x,y,8));
  const sides=lower.map((p,i)=>{const j=(i+1)%lower.length;return {points:[p,lower[j],upper[j],upper[i]],depth:(p.depth+lower[j].depth)/2,index:i};}).sort((a,b)=>a.depth-b.depth);
  const points=(vertices:typeof lower)=>vertices.map(p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  return <svg viewBox="0 0 120 106" aria-hidden="true" className="hauling-compass__dial">
    <ellipse cx="60" cy="61" rx="48" ry="29" fill="#0a1d1b" stroke="#a0cbb442"/>
    <ellipse cx="60" cy="61" rx="36" ry="21.6" fill="none" stroke="#a0cbb41a"/>
    <path d="M60 26v8M60 88v8M5 61h9M106 61h9" stroke="#b4ceba" strokeWidth="2"/>
    <text x="60" y="19" textAnchor="middle" fill="#c8dac9" fontSize="8" letterSpacing="2">AHEAD</text>
    {sides.map(face=><polygon key={face.index} points={points(face.points)} fill={color} stroke="#102725" strokeWidth=".8" style={{filter:`brightness(${.45+face.index*.055})`}}/>)}
    <polygon points={points(upper)} fill={color} stroke="#edffdf" strokeWidth=".7"/>
    <path d={`M${upper[0].x} ${upper[0].y}L${upper[3].x-7*yaw} ${upper[3].y-7*turn*.6}`} stroke="#ffffff80" strokeWidth="1.2"/>
  </svg>;
}
export function FriendsHaulingCompass({hauling,player}:{hauling:HaulingSnapshot;player:CoopPlayerSnapshot}){
  const rope=hauling.ropes.find(r=>r.id===player.id);
  const cargo=rope&&hauling.cargo.find(c=>c.id===rope.cargoId);
  if(!cargo)return null;
  const job=haulingJob(cargo),goal=haulingGoal(cargo);
  const target=goal,bearing=haulingBearing(player,target);
  const horizontal=Math.hypot(target.x-player.x,target.y-player.y);
  const elevation=Math.atan2(target.z-player.z,Math.max(1,horizontal));
  const color=goal.color;
  return <div className="hauling-compass" aria-label={`Delivery compass for ${job.name}`}>
    <CompassArrow bearing={bearing} elevation={elevation} color={color}/>
    <small className="hauling-compass__distance">{Math.round(horizontal/12)} m</small>
  </div>;
}
