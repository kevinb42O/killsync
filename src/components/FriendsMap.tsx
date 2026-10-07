import { scenicRailway, scenicStationPoses } from '../game/world/FriendsScenicRailway';
import { islandSurfaceBiome, ISLAND_SEA_LEVEL } from '../game/world/FriendsIsland';
import { CAVE_ENTRANCE } from '../game/world/FriendsCave';
import { useState } from 'react';
import { X, Compass, TrainFront, Plane, Mountain } from 'lucide-react';
import { FRIENDS_HUB, FRIENDS_AIRPAD } from '../game/world/FriendsRegion';
import { isPlayerRail, railSamples } from '../game/world/FriendsPlayerRail';
import { FRONTIER_SIZE, FRONTIER_SITES, baseTerrainHeight } from '../game/world/FriendsTerrain';
import type { CoopPlayerSnapshot, CoopSnapshot } from '../game/multiplayer/CoopSimulation';
import { FRIENDS_DELIVERY_BAY } from '../game/world/FriendsHaulingGoal';
import { FRIENDS_SPAWN_PLATFORM, FRIENDS_HAULING_PLATFORM } from '../game/world/FriendsTerrain';

const destinations = [{id:'arrival',name:'ARRIVAL POINT',...FRIENDS_HUB,color:'#ffd494',detail:'Open ground for your first workshop. Build your own settlement and railway.'},{id:'helicopter',name:'HELICOPTER SPAWN',...FRIENDS_AIRPAD,color:'#8de6ce',detail:'Your helicopter returns here on the ground whenever you spawn.'},{id:'cave',name:CAVE_ENTRANCE.name,x:CAVE_ENTRANCE.x,y:CAVE_ENTRANCE.y,color:'#ffc57a',detail:'A stepped sinkhole northeast of arrival. Follow the torches through vaulted chambers, the stone crossing and the deep well.'},...FRONTIER_SITES];
const scenicRoute=scenicRailway(),scenicPath=scenicRoute.points.filter((_,i)=>i%16===0).map(p=>`${p.x},${p.y}`).join(' ');
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
  const activeGoal=Boolean(snapshot.friends?.hauling && !snapshot.friends.hauling.delivered);
  const [selectedId, setSelectedId] = useState(activeGoal ? 'delivery-bay' : 'mine'), [wide, setWide] = useState(!activeGoal), [haulView,setHaulView]=useState(activeGoal);
  const f = snapshot.friends!, core=f.hauling?.cargo[0];
  const goal=FRIENDS_DELIVERY_BAY;
  const allPlaces=[{...goal,detail:f.hauling?.delivered ? 'Delivery complete! The core stays movable. A new game resets this hauling goal.' : 'Find the amber light column about 750m east-northeast of spawn. Haul the Lantern core home to the green square on the west side of the spawn deck. Park the whole block inside, let it settle and press F beside it to deliver.'},...destinations,...scenicStops];
  const places=core ? [...allPlaces,{id:'salvage-core',name:'LANTERN SALVAGE CORE',x:core.x,y:core.y,color:'#ffc36e',detail:'The amber light column follows the live core. It starts on its dedicated pickup platform about 750m from the Delivery Bay. Equip 6: rope, attach and walk to pull; hold aim to reel. Plan a route home, or load it onto your train or helicopter. F secures or releases cargo on deck.'}] : allPlaces;
  const selected = places.find(p => p.id === selectedId) || places[0];
  const routePoints=[goal,core??goal,localPlayer],loX=Math.min(...routePoints.map(p=>p.x)),loY=Math.min(...routePoints.map(p=>p.y));
  const spanX=Math.max(...routePoints.map(p=>p.x))-loX,spanY=Math.max(...routePoints.map(p=>p.y))-loY;
  // Leave room for endpoint labels when the haul spans hundreds of metres.
  const routePadding=Math.max(160,Math.max(spanX,spanY)*.17),minX=loX-routePadding,minY=loY-routePadding;
  const routeWidth=Math.max(640,spanX+routePadding*2),routeHeight=Math.max(440,spanY+routePadding*2);
  const scale = haulView ? Math.max(routeWidth,routeHeight)/12000 : wide ? 5 : 1, marker = haulView ? Math.max(routeWidth,routeHeight)/55 : wide ? 460 : 75;
  const choose = (id: string) => { setSelectedId(id);setHaulView(id===goal.id||id==='salvage-core'); setWide(id !== 'mine' && FRONTIER_SITES.some(s => s.id === id)); };
  return <section className="friends-map" role="dialog" aria-modal="true" aria-label="Sunline frontier atlas" onMouseDown={e => e.stopPropagation()}>
    <header><div><Compass size={20} /><span><small>SUNLINE / LIVE ATLAS</small><strong>{haulView ? 'Your hauling goal' : wide ? 'The whole frontier' : 'Your settlement & railway'}</strong></span></div><button type="button" onClick={onClose} aria-label="Close expedition map"><X size={20} /></button></header>
    <div className="friends-map__body"><div className="friends-map__canvas">
      <div className="frontier-map-controls"><button type="button" aria-pressed={wide} onClick={() => {setWide(true);setHaulView(false);}}>Full frontier</button><button type="button" aria-pressed={!wide&&!haulView} onClick={() => {setWide(false);setHaulView(false);}}>Local area</button>{core && <button type="button" aria-pressed={haulView} onClick={()=>choose(goal.id)}>Hauling route</button>}<span>{haulView ? 'Amber core → green Delivery Bay' : wide ? '4 km frontier · Alpine & volcanic island' : 'Your home, train and first mine'}</span></div>
      <svg viewBox={haulView ? `${minX} ${minY} ${routeWidth} ${routeHeight}` : wide ? `0 0 ${FRONTIER_SIZE} ${FRONTIER_SIZE}` : '2400 3600 8000 6600'} role="img" aria-label={haulView ? 'Hauling route from the Lantern core to the green Delivery Bay' : 'Island coastline, alpine mountains, natural arch, ancient ruins, caves, aircraft and crew positions'}>
        <defs><filter id="frontier-terrain-soften" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="450" /></filter><pattern id="frontier-grid" width={wide ? 6000 : 500} height={wide ? 6000 : 500} patternUnits="userSpaceOnUse"><path d={`M${wide ? 6000 : 500} 0H0V${wide ? 6000 : 500}`} fill="none" stroke="#c7d9b8" strokeOpacity=".15" strokeWidth={scale * 5} /></pattern></defs>
        <rect width={FRONTIER_SIZE} height={FRONTIER_SIZE} fill="#366b80" />
        <g filter="url(#frontier-terrain-soften)">{terrainTiles.map((t, i) => <rect key={i} x={t.x} y={t.y} width="1210" height="1210" fill={t.color} />)}</g>
        {contours.map(c => <path key={c.level} d={c.path} fill="none" stroke={c.level === ISLAND_SEA_LEVEL ? '#c8d8b1' : '#d0dfc2'} strokeWidth={wide ? 30 : 8} opacity={c.level === ISLAND_SEA_LEVEL ? .65 : .24} />)}
        <rect width={FRONTIER_SIZE} height={FRONTIER_SIZE} fill="url(#frontier-grid)" />
        {haulView && <>{[FRIENDS_SPAWN_PLATFORM,FRIENDS_HAULING_PLATFORM].map(p=><rect key={p.x} x={p.x-p.size/2} y={p.y-p.size/2} width={p.size} height={p.size} fill="#405651" stroke="#b0c8ae" strokeWidth="1"/>)}<rect x={goal.x-goal.width/2} y={goal.y-goal.depth/2} width={goal.width} height={goal.depth} fill="#a5f27922" stroke={goal.color} strokeWidth="2"/></>}
        {core && !f.hauling!.delivered && <line aria-label="Core to delivery route" x1={core.x} y1={core.y} x2={goal.x} y2={goal.y} stroke={goal.color} strokeWidth={scale*10} strokeDasharray={`${scale*35} ${scale*25}`} />}
        {wide && <><text x="17000" y="5400" fontSize="620" letterSpacing="180" fill="#e2e9c3" opacity=".75">HIGHFALL RANGE</text><text x="33000" y="36500" fontSize="700" letterSpacing="150" fill="#d9ece1" opacity=".7" transform="rotate(-25 33000 36500)">THE LONG SHORE</text><text x="11000" y="31000" fontSize="750" letterSpacing="200" fill="#d5e5c2" opacity=".55">THE WILD REACH</text></>}
        {f.scenicRailway && <><polyline points={scenicPath+' '+scenicPath.split(' ')[0]} fill="none" stroke="#183c38" strokeWidth={wide?120:32}/><polyline points={scenicPath+' '+scenicPath.split(' ')[0]} fill="none" stroke="#ffd494" strokeWidth={wide?60:15}/>{scenicStops.map(p=><g key={p.id} onClick={()=>choose(p.id)} style={{cursor:'pointer'}}><rect x={p.x-marker/2} y={p.y-marker/2} width={marker} height={marker} fill="#ffd494" stroke="#183c38" strokeWidth={scale*8}/><text x={p.x} y={p.y-marker*1.4} textAnchor="middle" fill="#fff0cf" fontSize={wide?480:85}>{p.name}</text></g>)}</>}
        {f.building?.pieces.filter(p=>isPlayerRail(p.shape)).map(p=><polyline key={p.id} points={railSamples(p).map(q=>`${q.x},${q.y}`).join(' ')} fill="none" stroke="#f3cc91" strokeWidth={wide?65:18}/>)}
        {f.building?.pieces.filter(p=>!isPlayerRail(p.shape)).map(p => <rect key={p.id} x={p.x - 20} y={p.y - 20} width={wide ? 90 : 40} height={wide ? 90 : 40} fill="#e0efc4" />)}
        <line x1={localPlayer.x} y1={localPlayer.y} x2={selected.x} y2={selected.y} stroke={selected.color} strokeWidth={scale * 8} strokeDasharray={`${scale * 25} ${scale * 25}`} opacity=".55" />
        {places.filter(p => haulView ? p.id===goal.id||p.id==='salvage-core' : p.id===goal.id||p.id === 'salvage-core' || !wide || FRONTIER_SITES.some(s => s.id === p.id) || p.id === 'arrival' || p.id === 'helicopter').map(p => <g key={p.id} onClick={() => choose(p.id)} style={{ cursor: 'pointer' }}><circle cx={p.x} cy={p.y} r={marker * (selectedId === p.id ? 1.5 : 1)} fill="#17372ad9" stroke={p.color} strokeWidth={scale * 10} /><circle cx={p.x} cy={p.y} r={marker * .25} fill={p.color} /><text x={p.x} y={p.y + (haulView&&p.id==='salvage-core' ? marker*3 : -marker*2)} textAnchor="middle" fill={p.color} fontSize={haulView ? marker*1.1 : wide ? 760 : 100} fontFamily="monospace">{p.name}</text></g>)}
        {f.vehicles.map(v => <g key={v.id} transform={`translate(${v.x} ${v.y}) rotate(${v.angle * 180 / Math.PI})`}><circle r={v.kind === 'aircraft' ? marker : marker * .65} fill={v.kind === 'aircraft' ? '#8de6ce' : '#ffd494'} opacity=".75" /><path d={`M${marker} 0L${-marker / 2} ${-marker / 2}V${marker / 2}Z`} fill="#183c32" /></g>)}
        {snapshot.players.filter(p => p.lifeState === 'alive').map(p => <g key={p.id} transform={`translate(${p.x} ${p.y}) rotate(${p.angle * 180 / Math.PI})`}><circle r={marker} fill="#102828" stroke={p.color} strokeWidth={scale * 12} /><path d={`M${marker * .9} 0L${-marker * .4} ${-marker * .4}L${-marker * .2} 0L${-marker * .4} ${marker * .4}Z`} fill={p.id === localPlayer.id ? '#fff4d8' : p.color} /></g>)}
      </svg>
    </div><aside><small>{haulView ? 'HAULING OBJECTIVE' : 'EXPLORE & ESTABLISH'}</small><p>{selected.detail}</p>{places.map(p => <button key={p.id} type="button" aria-pressed={selectedId === p.id} onClick={() => choose(p.id)}><strong style={{ color: p.color }}>{p.name}</strong><span>{Math.round(Math.hypot(p.x - localPlayer.x, p.y - localPlayer.y) / 12)}m from your crew</span></button>)}
      <div className="friends-map__legend"><span><TrainFront size={15} />Grand Traverse · full island tour + your own tracks</span><span><Plane size={15} />Sunskiff · fly across the entire frontier</span><span><Mountain size={15} />Dig into the ground. Mine beneath the mountains.</span></div>
      <p className="friends-map__help">The Grand Traverse starts south of arrival. Board at the level platform at Sunline Commons. Sit with F, stand with F or jump, and explore five stations. Start with a cedar and the Copper Hollow mine. Forge tools at your workshop, then fly to the ridge and build a remote workshop. Your terrain, supplies and construction return with your saved world. The Lantern core and its hauling goal reset each new game.</p><small>M closes this atlas · G opens your field pack</small>
    </aside></div>
  </section>;
}
