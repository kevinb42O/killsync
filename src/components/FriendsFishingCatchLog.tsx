import { useEffect, useRef, useState } from 'react';
import { Fish } from 'lucide-react';
import type { CaughtFish } from '../game/multiplayer/FriendsFishing';
import { fishLengthCm } from '../game/multiplayer/FriendsFishing';

type CatchRecord = { id:number; size:number };

export function FriendsFishingCatchLog({ fish, localId, visible }: { fish:readonly CaughtFish[]; localId:string; visible:boolean }) {
  const seen=useRef(new Set(fish.filter(catchFish=>catchFish.ownerId===localId&&catchFish.phase==='held').map(catchFish=>catchFish.id)));
  const [log,setLog]=useState<{recent:CatchRecord[];total:number;best:number}>({recent:[],total:0,best:0});

  useEffect(()=>{
    const fresh:CatchRecord[]=[];
    for(const catchFish of fish){
      if(catchFish.caughtBy!==localId||catchFish.ownerId!==localId||catchFish.phase!=='held'||seen.current.has(catchFish.id))continue;
      seen.current.add(catchFish.id);fresh.push({id:catchFish.id,size:catchFish.size});
    }
    if(fresh.length)setLog(previous=>({recent:[...fresh.reverse(),...previous.recent].slice(0,4),total:previous.total+fresh.length,best:Math.max(previous.best,...fresh.map(catchFish=>catchFish.size))}));
  },[fish,localId]);

  const held=fish.find(f=>f.ownerId===localId&&f.phase==='held');
  return <aside className="friends-fishing-log" data-visible={visible} aria-label="Fishing catch log" aria-live="polite">
    <header><Fish size={13} aria-hidden="true"/><span>YOUR CATCHES</span><b>{log.total}</b></header>
    {held&&<div className="friends-fishing-log__held"><span>Koi</span><strong>{fishLengthCm(held.size)} <small>cm</small></strong></div>}
    {log.best>0&&<div className="friends-fishing-log__record">Personal best <strong>{fishLengthCm(log.best)} cm</strong></div>}
    {log.total>0?<ol>{log.recent.map(catchFish=><li key={catchFish.id}><span>Koi</span><strong>{fishLengthCm(catchFish.size)} cm</strong></li>)}</ol>:<p>No catches yet</p>}
  </aside>;
}
