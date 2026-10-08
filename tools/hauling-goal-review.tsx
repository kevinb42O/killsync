import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FriendsHUD } from '../src/components/FriendsHUD';
import { FriendsHaulingBriefing } from '../src/components/FriendsHaulingBriefing';
import { useFriendsHaulingBriefing } from '../src/components/useFriendsHaulingBriefing';
import { FriendsMap } from '../src/components/FriendsMap';
import { FriendsToolbelt } from '../src/components/FriendsFieldPack';
import { useFriendsToolbelt } from '../src/components/useFriendsToolbelt';
import type { FrontierTool } from '../src/game/multiplayer/FriendsFrontier';
import { FriendsSimulation } from '../src/game/multiplayer/FriendsSimulation';
import { FRIENDS_DELIVERY_BAY } from '../src/game/world/FriendsHaulingGoal';
import '../src/index.css';
import '../src/components/multiplayer.css';
import '../src/components/frontier.css';

// Production UI with a disposable snapshot: never opens saves or networking.
const toolReview=new URLSearchParams(location.search).get('view')==='tools';
const initial=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]).createSnapshot();
function Review(){
  const [map,setMap]=useState(!toolReview&&new URLSearchParams(location.search).get('view')!=='compass'),[phase,setPhase]=useState('start');
  const [load,setLoad]=useState(0),[angle,setAngle]=useState(0);
  const [tool,setTool]=useState<FrontierTool>(1),[toolsVisible,revealTools]=useFriendsToolbelt();
  const select=(next:FrontierTool)=>{setTool(next);revealTools();};
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{if(!e.repeat&&/^[1-6]$/.test(e.key))select(([1,2,3,4,0,5] as FrontierTool[])[Number(e.key)-1]);};
    addEventListener('keydown',key);return ()=>removeEventListener('keydown',key);
  },[revealTools]);
  const snapshot=structuredClone(initial),player=snapshot.players[0],haul=snapshot.friends!.hauling!;
  if(phase!=='start'){
    Object.assign(haul.cargo[0],{x:FRIENDS_DELIVERY_BAY.x,y:FRIENDS_DELIVERY_BAY.y,z:FRIENDS_DELIVERY_BAY.z});
    Object.assign(player,{x:FRIENDS_DELIVERY_BAY.x+90,y:FRIENDS_DELIVERY_BAY.y,z:FRIENDS_DELIVERY_BAY.z});
  }
  haul.delivered=phase==='complete';player.angle=angle;
  if(phase==='attached')haul.ropes=[{id:player.id,cargoId:haul.cargo[load].id,anchorX:36,anchorY:0,anchorZ:26,length:160,tension:.7,blocked:false}];
  const briefing=useFriendsHaulingBriefing(haul,player.id);
  return <main style={{position:'fixed',inset:0,background:'linear-gradient(160deg,#899d89,#31463e)',color:'#eee'}}>
    <FriendsHUD snapshot={snapshot} player={player} interactionLabel="F" onMission={briefing.show}/>
    {briefing.briefing&&<FriendsHaulingBriefing briefing={briefing.briefing} hauling={haul} interactionLabel="F" onClose={briefing.dismiss}/>}
    {!map&&<FriendsToolbelt frontier={snapshot.friends!.frontier!} player={player} tool={tool} visible={toolsVisible} onTool={select} onPack={()=>setMap(true)} elapsed={snapshot.elapsedMs}/>}
    {!toolReview&&<div style={{position:'absolute',bottom:18,left:18,zIndex:120,display:'flex',gap:8}}>{['start','attached','ready','complete'].map(p=><button key={p} onClick={()=>setPhase(p)}>{p}</button>)}<button onClick={()=>setMap(!map)}>Toggle map</button><button onClick={()=>setLoad((load+1)%3)}>Next load</button><button onClick={()=>setAngle(angle+Math.PI/4)}>Turn 45°</button></div>}
    {map&&<FriendsMap snapshot={snapshot} localPlayer={player} onClose={()=>setMap(false)}/>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Review/>);
