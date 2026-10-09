import { RETREAT_SITES } from '../game/world/FriendsRetreatSites';
import { FRIENDS_RIVERS } from '../game/world/FriendsHydrology';
import { ISLAND_LAKES } from '../game/world/FriendsWaterBodies';
import { scenicRailway, scenicStationPoses } from '../game/world/FriendsScenicRailway';
import { islandSurfaceBiome, ISLAND_SEA_LEVEL } from '../game/world/FriendsIsland';
import { CAVE_ENTRANCE } from '../game/world/FriendsCave';
import { useState } from 'react';
import { X, Compass, TrainFront, Plane, Mountain } from 'lucide-react';
import { FRIENDS_HUB, FRIENDS_AIRPAD } from '../game/world/FriendsRegion';
import { isPlayerRail, railSamples } from '../game/world/FriendsPlayerRail';
import { FRONTIER_SIZE, FRONTIER_SITES, baseTerrainHeight, CASTLE_STAIRS } from '../game/world/FriendsTerrain';
import type { CoopPlayerSnapshot, CoopSnapshot } from '../game/multiplayer/CoopSimulation';
import { FRIENDS_DELIVERY_BAY, FRIENDS_HAULING_JOBS, haulingGoal, haulingJob, cargoDelivered } from '../game/world/FriendsHaulingGoal';
import { FRIENDS_SPAWN_PLATFORM, FRIENDS_HAULING_PLATFORMS } from '../game/world/FriendsTerrain';

const destinations = [{id:'arrival',name:'ARRIVAL POINT',...FRIENDS_HUB,color:'#ffd494',detail:'Open ground for your first workshop. Build your own settlement and railway.'},{id:'helicopter',name:'HELICOPTER SPAWN',...FRIENDS_AIRPAD,color:'#8de6ce',detail:'Your helicopter returns here on the ground whenever you spawn.'},{id:'cave',name:CAVE_ENTRANCE.name,x:CAVE_ENTRANCE.x,y:CAVE_ENTRANCE.y,color:'#ffc57a',detail:'A stepped sinkhole northeast of arrival. Follow the torches through vaulted chambers, the stone crossing and the deep well.'},...FRONTIER_SITES,...RETREAT_SITES];
const scenicRoute=scenicRailway(),scenicPath=scenicRoute.points.filter((_,i)=>i%16===0).map(p=>`${p.x},${p.y}`).join(' ');
const castleApproach=CASTLE_STAIRS.approach.filter((_,i)=>i%8===0),castleFoot=CASTLE_STAIRS.approach.at(-1)!;
const castlePath=[castleFoot,...[...castleApproach].reverse(),FRIENDS_HAULING_JOBS[1].goal].map(p=>`${p.x},${p.y}`).join(' ');
const scenicStops=scenicStationPoses().map(p=>({...p,color:'#f4c677',detail:`Grand Traverse station · ${Math.round(p.z/12)} m elevation · F to sit aboard a carriage. Level platforms beside the island railway.`}));
const biomeColours={sand:'#d6c291',mud:'#77715b',stone:'#9ca8a7',grass:'#52765b',ice:'#8bc7d0',snow:'#e0edf0',basalt:'#535458',lava:'#e88043'};
const terrainTiles = Array.from({ length: 1600 }, (_, i) => {
  const x = i % 40 * 1200, y = Math.floor(i / 40) * 1200, h = baseTerrainHeight(x + 600, y + 600);
  return { x, y, color: h<ISLAND_SEA_LEVEL?'#366b80':biomeColours[islandSurfaceBiome(x+600,y+600,h)], h };
});
// Isoheight contours interpolate the actual terrain field, rather than inventing a map.
const contours = [ISLAND_SEA_LEVEL, 640, 1280, 2200, 3200, 4400].map(level => {
  const parts: string[] = [], step = 600;
  for (let x = 0; x < FRONTIER_SIZE; x += step) for (let y = 0; y < FRONTIER_SIZE; y += step) {
    const corners = [[x,y],[x+step,y],[x+step,y+step],[x,y+step]], h=corners.map(([a,b]) => baseTerrainHeight(a,b));
    const crossings: number[][] = [];
    for (let i=0;i<4;i++) { const n=(i+1)%4; if ((h[i]>=level) === (h[n]>=level)) continue; const t=(level-h[i])/(h[n]-h[i]); crossings.push([corners[i][0]+(corners[n][0]-corners[i][0])*t,corners[i][1]+(corners[n][1]-corners[i][1])*t]); }
    for (let i=0;i+1<crossings.length;i+=2) parts.push(`M${crossings[i].map(Math.round).join(' ')}L${crossings[i+1].map(Math.round).join(' ')}`);
  }
  return { level, path: parts.join('') };
});
export function FriendsMap({ snapshot, localPlayer, onClose }: { snapshot: CoopSnapshot; localPlayer: CoopPlayerSnapshot; onClose: () => void }) {
  const f=snapshot.friends!,loads=f.hauling?.cargo??[];
  const tether=f.hauling?.ropes.find(r=>r.id===localPlayer.id);
  const preferred=loads.find(c=>c.id===tether?.cargoId)??loads.find(c=>!cargoDelivered(f.hauling!,c))??loads[0];
  const activeGoal=Boolean(preferred&&f.hauling&&!cargoDelivered(f.hauling,preferred));
  const [selectedId,setSelectedId]=useState(activeGoal?haulingGoal(preferred!).id:'mine'),[wide,setWide]=useState(!activeGoal),[haulView,setHaulView]=useState(activeGoal);
  const core=loads.find(c=>c.id===selectedId||(c.id==='lantern-core'&&selectedId==='salvage-core')||haulingGoal(c).id===selectedId)??preferred;
  const goal=core?haulingGoal(core):FRIENDS_DELIVERY_BAY;
  const markerId=(id:string)=>id==='lantern-core'?'salvage-core':id;
  const isHaulingPlace=(id:string)=>loads.some(c=>markerId(c.id)===id||haulingGoal(c).id===id);
  const allPlaces=[...loads.map(c=>({...haulingGoal(c),detail:cargoDelivered(f.hauling!,c)?'Delivery complete! The core stays movable. A new game resets this hauling goal.':c.id==='lantern-core'?'Find the amber light column about 750m east-northeast of spawn. Haul the Lantern core home to the green square on the west side of the spawn deck. Park the whole block inside, let it settle and press F beside it to deliver.':`${haulingJob(c).mission.title}: ${haulingJob(c).mission.objective} ${haulingJob(c).mission.route[0]} Park the entire load in its coloured bay, let it settle and press F. Read the full dispatch from Mission details on your compass.`})),...destinations.filter(d=>!RETREAT_SITES.some(s=>s.id===d.id)||(f.retreats?.active??[]).includes(d.id as any)),...scenicStops];
  const skiff=f.vehicles.find(v=>v.kind==='rowboat');
  const places=[...allPlaces,...(skiff?[{id:skiff.id,name:'REEDWATER SKIFF',x:skiff.x,y:skiff.y,color:'#83d8cd',detail:'A shared two-person rowing boat. F takes a seat; click or tap forward for one stroke. Right-click or tap backward to backwater. Each rower controls one oar; match your strokes to travel straight.'}]:[]),...loads.map(c=>({id:markerId(c.id),name:`${haulingJob(c).name.toUpperCase()} · LOAD ${haulingJob(c).number}`,x:c.x,y:c.y,color:c.id==='lantern-core'?'#ffc36e':haulingGoal(c).color,detail:`The light column follows the live core. Each block has its own delivery bay. Equip 6: rope, attach and walk to pull; hold aim to reel. Your top-left compass switches to this block's destination. F secures or releases cargo on deck.`}))];
  const selected = places.find(p => p.id === selectedId) || places[0];
  const castleHaul=core?.id==='ridge-core';
  const routePoints=[goal,core??goal,localPlayer,...(castleHaul?castleApproach:[])],loX=Math.min(...routePoints.map(p=>p.x)),loY=Math.min(...routePoints.map(p=>p.y));
  const spanX=Math.max(...routePoints.map(p=>p.x))-loX,spanY=Math.max(...routePoints.map(p=>p.y))-loY;
  // Leave room for endpoint labels when the haul spans hundreds of metres.
  const routePadding=Math.max(160,Math.max(spanX,spanY)*.17),minX=loX-routePadding,minY=loY-routePadding;
  const routeWidth=Math.max(640,spanX+routePadding*2),routeHeight=Math.max(440,spanY+routePadding*2);
  const scale = haulView ? Math.max(routeWidth,routeHeight)/12000 : wide ? 5 : 1, marker = haulView ? Math.max(routeWidth,routeHeight)/55 : wide ? 460 : 75;
  const choose = (id: string) => { setSelectedId(id);setHaulView(isHaulingPlace(id)); setWide(id !== 'mine' && FRONTIER_SITES.some(s => s.id === id)); };
  return <section className="friends-map" role="dialog" aria-modal="true" aria-label="Sunline frontier atlas" onMouseDown={e => e.stopPropagation()}>
    <header><div><Compass size={20} /><span><small>SUNLINE / LIVE ATLAS</small><strong>{haulView ? 'Your hauling goal' : wide ? 'The whole frontier' : 'Your settlement & railway'}</strong></span></div><button type="button" onClick={onClose} aria-label="Close expedition map"><X size={20} /></button></header>
    <div className="friends-map__body"><div className="friends-map__canvas">
      <div className="frontier-map-controls"><button type="button" aria-pressed={wide} onClick={() => {setWide(true);setHaulView(false);}}>Full frontier</button><button type="button" aria-pressed={!wide&&!haulView} onClick={() => {setWide(false);setHaulView(false);}}>Local area</button>{core && <button type="button" aria-pressed={haulView} onClick={()=>choose(goal.id)}>Hauling route</button>}<span>{haulView ? `${haulingJob(core!).name} → ${goal.name}` : wide ? '4 km frontier · Alpine & volcanic island' : 'Your home, train and first mine'}</span></div>
      <svg viewBox={haulView ? `${minX} ${minY} ${routeWidth} ${routeHeight}` : wide ? `0 0 ${FRONTIER_SIZE} ${FRONTIER_SIZE}` : '2400 3600 8000 6600'} role="img" aria-label={haulView ? `Hauling route from ${haulingJob(core!).name} to ${goal.name}` : 'Island coastline, alpine mountains, natural arch, ancient ruins, caves, aircraft and crew positions'}>
        <defs><filter id="frontier-terrain-soften" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="450" /></filter><pattern id="frontier-grid" width={wide ? 6000 : 500} height={wide ? 6000 : 500} patternUnits="userSpaceOnUse"><path d={`M${wide ? 6000 : 500} 0H0V${wide ? 6000 : 500}`} fill="none" stroke="#c7d9b8" strokeOpacity=".15" strokeWidth={scale * 5} /></pattern></defs>
        <rect width={FRONTIER_SIZE} height={FRONTIER_SIZE} fill="#366b80" />
        <g filter="url(#frontier-terrain-soften)">{terrainTiles.map((t, i) => <rect key={i} x={t.x} y={t.y} width="1210" height="1210" fill={t.color} />)}</g>
        {contours.map(c => <path key={c.level} d={c.path} fill="none" stroke={c.level === ISLAND_SEA_LEVEL ? '#c8d8b1' : '#d0dfc2'} strokeWidth={wide ? 30 : 8} opacity={c.level === ISLAND_SEA_LEVEL ? .65 : .24} />)}
        {ISLAND_LAKES.map(l=><ellipse key={l.id} cx={l.x} cy={l.y} rx={l.rx} ry={l.ry} fill="#66b7c5" opacity=".85"/>)}
        {FRIENDS_RIVERS.map(r=><polyline key={r.id} aria-label={r.name} points={r.points.filter((_,i)=>i%3===0).map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="#80d5db" strokeWidth={wide?150:64} strokeLinejoin="round" strokeLinecap="round"/>)}
        <rect width={FRONTIER_SIZE} height={FRONTIER_SIZE} fill="url(#frontier-grid)" />
        {haulView && <>{[FRIENDS_SPAWN_PLATFORM,...FRIENDS_HAULING_PLATFORMS].map(p=><rect key={p.x} x={p.x-p.size/2} y={p.y-p.size/2} width={p.size} height={p.size} fill="#405651" stroke="#b0c8ae" strokeWidth="1"/>)}<rect x={goal.x-goal.width/2} y={goal.y-goal.depth/2} width={goal.width} height={goal.depth} fill={goal.color+'22'} stroke={goal.color} strokeWidth="2"/></>}
        {loads.filter(c=>!cargoDelivered(f.hauling!,c)&&(!haulView||c.id===core?.id)).map(c=><line key={c.id} aria-label="Core to delivery route" x1={c.x} y1={c.y} x2={haulingGoal(c).x} y2={haulingGoal(c).y} stroke={haulingGoal(c).color} strokeWidth={scale*10} strokeDasharray={`${scale*35} ${scale*25}`} />)}
        {(wide||haulView&&castleHaul)&&<g><polyline aria-label="Castle stairway to courtyard" points={castlePath} fill="none" stroke="#83d9f2" strokeWidth={scale*14}/><circle cx={castleFoot.x} cy={castleFoot.y} r={marker*.7} fill="#17372a" stroke="#83d9f2" strokeWidth={scale*8}/><text x={castleFoot.x} y={castleFoot.y+marker*2} textAnchor="middle" fill="#bce8f2" fontSize={marker}>STAIRWAY START</text></g>}
        {wide && <><text x="17000" y="5400" fontSize="620" letterSpacing="180" fill="#e2e9c3" opacity=".75">HIGHFALL RANGE</text><text x="33000" y="36500" fontSize="700" letterSpacing="150" fill="#d9ece1" opacity=".7" transform="rotate(-25 33000 36500)">THE LONG SHORE</text><text x="11000" y="31000" fontSize="750" letterSpacing="200" fill="#d5e5c2" opacity=".55">THE WILD REACH</text></>}
        {f.scenicRailway && <><polyline points={scenicPath+' '+scenicPath.split(' ')[0]} fill="none" stroke="#183c38" strokeWidth={wide?120:32}/><polyline points={scenicPath+' '+scenicPath.split(' ')[0]} fill="none" stroke="#ffd494" strokeWidth={wide?60:15}/>{scenicStops.map(p=><g key={p.id} onClick={()=>choose(p.id)} style={{cursor:'pointer'}}><rect x={p.x-marker/2} y={p.y-marker/2} width={marker} height={marker} fill="#ffd494" stroke="#183c38" strokeWidth={scale*8}/><text x={p.x} y={p.y-marker*1.4} textAnchor="middle" fill="#fff0cf" fontSize={wide?480:85}>{p.name}</text></g>)}</>}
        {f.building?.pieces.filter(p=>isPlayerRail(p.shape)).map(p=><polyline key={p.id} points={railSamples(p).map(q=>`${q.x},${q.y}`).join(' ')} fill="none" stroke="#f3cc91" strokeWidth={wide?65:18}/>)}
        {f.building?.pieces.filter(p=>!isPlayerRail(p.shape)).map(p => <rect key={p.id} x={p.x - 20} y={p.y - 20} width={wide ? 90 : 40} height={wide ? 90 : 40} fill="#e0efc4" />)}
        <line x1={localPlayer.x} y1={localPlayer.y} x2={selected.x} y2={selected.y} stroke={selected.color} strokeWidth={scale * 8} strokeDasharray={`${scale * 25} ${scale * 25}`} opacity=".55" />
        {places.filter(p => haulView ? p.id===goal.id||p.id===markerId(core!.id) : isHaulingPlace(p.id) || !wide || FRONTIER_SITES.some(s => s.id === p.id) || p.id === 'arrival' || p.id === 'helicopter' || p.id === 'reedwater-skiff').map(p => <g key={p.id} onClick={() => choose(p.id)} style={{ cursor: 'pointer' }}><circle cx={p.x} cy={p.y} r={marker * (selectedId === p.id ? 1.5 : 1)} fill="#17372ad9" stroke={p.color} strokeWidth={scale * 10} /><circle cx={p.x} cy={p.y} r={marker * .25} fill={p.color} /><text x={p.x} y={p.y + (haulView&&p.id===markerId(core!.id) ? marker*3 : -marker*2)} textAnchor="middle" fill={p.color} fontSize={haulView ? marker*1.1 : wide ? 760 : 100} fontFamily="monospace">{p.name}</text></g>)}
        {f.vehicles.map(v => <g key={v.id} transform={`translate(${v.x} ${v.y}) rotate(${v.angle * 180 / Math.PI})`}><circle r={v.kind === 'aircraft' ? marker : marker * .65} fill={v.kind === 'rowboat' ? '#83d8cd' : v.kind === 'aircraft' ? '#8de6ce' : '#ffd494'} opacity=".75" /><path d={`M${marker} 0L${-marker / 2} ${-marker / 2}V${marker / 2}Z`} fill="#183c32" /></g>)}
        {snapshot.players.filter(p => p.lifeState === 'alive').map(p => <g key={p.id} transform={`translate(${p.x} ${p.y}) rotate(${p.angle * 180 / Math.PI})`}><circle r={marker} fill="#102828" stroke={p.color} strokeWidth={scale * 12} /><path d={`M${marker * .9} 0L${-marker * .4} ${-marker * .4}L${-marker * .2} 0L${-marker * .4} ${marker * .4}Z`} fill={p.id === localPlayer.id ? '#fff4d8' : p.color} /></g>)}
      </svg>
    </div><aside><small>{haulView ? 'HAULING OBJECTIVE' : 'EXPLORE & ESTABLISH'}</small><p>{selected.detail}</p>{places.map(p => <button key={p.id} type="button" aria-pressed={selectedId === p.id} onClick={() => choose(p.id)}><strong style={{ color: p.color }}>{p.name}</strong><span>{Math.round(Math.hypot(p.x - localPlayer.x, p.y - localPlayer.y) / 12)}m from your crew</span></button>)}
      <div className="friends-map__legend"><span><TrainFront size={15} />Grand Traverse · full island tour + your own tracks</span><span><Plane size={15} />Sunskiff · fly across the entire frontier</span><span><Mountain size={15} />Dig into the ground. Mine beneath the mountains.</span></div>
      <p className="friends-map__help">The Grand Traverse starts south of arrival. Board at the level platform at Sunline Commons. Sit with F, stand with F or jump, and explore five stations. Start with a cedar and the Copper Hollow mine. Forge tools at your workshop, then fly to the ridge and build a remote workshop. Your terrain, supplies and construction return with your saved world. All three cores and their delivery goals reset each new game.</p><small>M closes this atlas · G opens your field pack</small>
    </aside></div>
  </section>;
}
