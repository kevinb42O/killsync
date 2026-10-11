import { useEffect, useRef, useState } from 'react';
import { Fish } from 'lucide-react';
import type { CaughtFish } from '../game/multiplayer/FriendsFishing';
import { fishSpeciesName, formatFishLength, type FishSpecies } from '../game/multiplayer/FriendsFishSpecies';

const completed=(f:CaughtFish,id:string)=>f.caughtBy===id&&(f.landedAt!==undefined||f.ownerId===id&&f.phase==='held');

type CatchRecord = { id:number; size:number; species?:FishSpecies };

export function FriendsFishingCatchLog({ fish, localId, visible }: { fish:readonly CaughtFish[]; localId:string; visible:boolean }) {
  const seen=useRef(new Set(fish.filter(catchFish=>completed(catchFish,localId)).map(catchFish=>catchFish.id)));
  const [log,setLog]=useState<{recent:CatchRecord[];total:number;best:CatchRecord|undefined}>({recent:[],total:0,best:undefined});

  useEffect(()=>{
    const fresh:CatchRecord[]=[];
    for(const catchFish of fish){
      if(!completed(catchFish,localId)||seen.current.has(catchFish.id))continue;
      seen.current.add(catchFish.id);fresh.push({id:catchFish.id,size:catchFish.size,species:catchFish.species});
    }
    if(fresh.length)setLog(previous=>({recent:[...fresh.reverse(),...previous.recent].slice(0,4),total:previous.total+fresh.length,best:[...(previous.best?[previous.best]:[]),...fresh].reduce((best,fish)=>fish.size>best.size?fish:best)}));
  },[fish,localId]);

  const held=fish.find(f=>f.ownerId===localId&&f.phase==='held'||f.tetheredBy===localId&&f.phase==='landed');
  return <aside className="friends-fishing-log" data-visible={visible} aria-label="Fishing catch log" aria-live="polite">
    <header><Fish size={13} aria-hidden="true"/><span>YOUR CATCHES</span><b>{log.total}</b></header>
    {held&&<div className="friends-fishing-log__held"><span>{fishSpeciesName(held.species)}</span><strong>{formatFishLength(held.size)}</strong></div>}
    {log.best&&<div className="friends-fishing-log__record">Personal best <strong>{fishSpeciesName(log.best.species)} · {formatFishLength(log.best.size)}</strong></div>}
    {log.total>0?<ol>{log.recent.map(catchFish=><li key={catchFish.id}><span>{fishSpeciesName(catchFish.species)}</span><strong>{formatFishLength(catchFish.size)}</strong></li>)}</ol>:<p>No catches yet</p>}
  </aside>;
}
