import { CAVE_ENTRANCE } from '../game/world/FriendsCave';
import { useState } from 'react';
import { X, Compass, TrainFront, Plane, Mountain } from 'lucide-react';
import { FRIENDS_HUB, FRIENDS_AIRPAD } from '../game/world/FriendsRegion';
import { isPlayerRail, railSamples } from '../game/world/FriendsPlayerRail';
import { FRONTIER_SIZE, FRONTIER_SITES, baseTerrainHeight } from '../game/world/FriendsTerrain';
import { sampleTrainRoute, TRAIN_LOOP_LENGTH } from '../game/multiplayer/FriendsExpedition';
import type { CoopPlayerSnapshot, CoopSnapshot } from '../game/multiplayer/CoopSimulation';

const destinations = [{id:'arrival',name:'ARRIVAL POINT',...FRIENDS_HUB,color:'#ffd494',detail:'Open ground for your first workshop. Build your own settlement and railway.'},{id:'helicopter',name:'HELICOPTER SPAWN',...FRIENDS_AIRPAD,color:'#8de6ce',detail:'Your helicopter returns here on the ground whenever you spawn.'},{id:'cave',name:CAVE_ENTRANCE.name,x:CAVE_ENTRANCE.x,y:CAVE_ENTRANCE.y,color:'#ffc57a',detail:'A stepped sinkhole northeast of arrival. Follow the torches through vaulted chambers, the stone crossing and the deep well.'},...FRONTIER_SITES];
const terrainTiles = Array.from({ length: 1600 }, (_, i) => {
  const x = i % 40 * 1200, y = Math.floor(i / 40) * 1200, h = baseTerrainHeight(x + 600, y + 600);
  return { x, y, color: h < -100 ? '#568a87' : h < 0 ? '#a5aa83' : h > 1900 ? '#d2d4c1' : h > 1100 ? '#9caa94' : h > 650 ? '#7b927c' : '#436e59', h };
});
// Isoheight contours interpolate the actual terrain field, rather than inventing a map.
const contours = [0, 320, 640, 960, 1280, 1600, 2200].map(level => {
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
  const [selectedId, setSelectedId] = useState('mine'), [wide, setWide] = useState(true);
  const selected = destinations.find(p => p.id === selectedId) || destinations[0], f = snapshot.friends!;
  const scale = wide ? 5 : 1, marker = wide ? 460 : 75;
  const choose = (id: string) => { setSelectedId(id); setWide(id !== 'mine' && FRONTIER_SITES.some(s => s.id === id)); };
  return <section className="friends-map" role="dialog" aria-modal="true" aria-label="Sunline frontier atlas" onMouseDown={e => e.stopPropagation()}>
    <header><div><Compass size={20} /><span><small>SUNLINE / LIVE ATLAS</small><strong>{wide ? 'The whole frontier' : 'Your settlement & railway'}</strong></span></div><button type="button" onClick={onClose} aria-label="Close expedition map"><X size={20} /></button></header>
    <div className="friends-map__body"><div className="friends-map__canvas">
      <div className="frontier-map-controls"><button type="button" aria-pressed={wide} onClick={() => setWide(true)}>Full frontier</button><button type="button" aria-pressed={!wide} onClick={() => setWide(false)}>Local area</button><span>{wide ? '4 km × 4 km · 16 km²' : 'Your home, train and first mine'}</span></div>
      <svg viewBox={wide ? `0 0 ${FRONTIER_SIZE} ${FRONTIER_SIZE}` : '2400 3600 8000 6600'} role="img" aria-label="Terrain, copper mine, mountain ridge, distant coast, railway, aircraft and crew positions">
        <defs><filter id="frontier-terrain-soften" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="700" /></filter><pattern id="frontier-grid" width={wide ? 6000 : 500} height={wide ? 6000 : 500} patternUnits="userSpaceOnUse"><path d={`M${wide ? 6000 : 500} 0H0V${wide ? 6000 : 500}`} fill="none" stroke="#c7d9b8" strokeOpacity=".15" strokeWidth={scale * 5} /></pattern></defs>
        <rect width={FRONTIER_SIZE} height={FRONTIER_SIZE} fill="#436e59" />
        <g filter="url(#frontier-terrain-soften)">{terrainTiles.map((t, i) => <rect key={i} x={t.x} y={t.y} width="1210" height="1210" fill={t.color} />)}</g>
        {contours.map(c => <path key={c.level} d={c.path} fill="none" stroke={c.level === 0 ? '#c8d8b1' : '#d0dfc2'} strokeWidth={wide ? 30 : 8} opacity={c.level === 0 ? .65 : .24} />)}
        <rect width={FRONTIER_SIZE} height={FRONTIER_SIZE} fill="url(#frontier-grid)" />
        {wide && <><text x="17000" y="5400" fontSize="620" letterSpacing="180" fill="#e2e9c3" opacity=".75">HIGHFALL RANGE</text><text x="33000" y="36500" fontSize="700" letterSpacing="150" fill="#d9ece1" opacity=".7" transform="rotate(-25 33000 36500)">THE LONG SHORE</text><text x="11000" y="31000" fontSize="750" letterSpacing="200" fill="#d5e5c2" opacity=".55">THE WILD REACH</text></>}
        {f.building?.pieces.filter(p=>isPlayerRail(p.shape)).map(p=><polyline key={p.id} points={railSamples(p).map(q=>`${q.x},${q.y}`).join(' ')} fill="none" stroke="#f3cc91" strokeWidth={wide?65:18}/>)}
        {f.building?.pieces.filter(p=>!isPlayerRail(p.shape)).map(p => <rect key={p.id} x={p.x - 20} y={p.y - 20} width={wide ? 90 : 40} height={wide ? 90 : 40} fill="#e0efc4" />)}
        <line x1={localPlayer.x} y1={localPlayer.y} x2={selected.x} y2={selected.y} stroke={selected.color} strokeWidth={scale * 8} strokeDasharray={`${scale * 25} ${scale * 25}`} opacity=".55" />
        {destinations.filter(p => !wide || FRONTIER_SITES.some(s => s.id === p.id) || p.id === 'arrival' || p.id === 'helicopter').map(p => <g key={p.id} onClick={() => choose(p.id)} style={{ cursor: 'pointer' }}><circle cx={p.x} cy={p.y} r={marker * (selectedId === p.id ? 1.5 : 1)} fill="#17372ad9" stroke={p.color} strokeWidth={scale * 10} /><circle cx={p.x} cy={p.y} r={marker * .25} fill={p.color} /><text x={p.x} y={p.y - marker * 2} textAnchor="middle" fill={p.color} fontSize={wide ? 760 : 100} fontFamily="monospace">{p.name}</text></g>)}
        {f.vehicles.map(v => <g key={v.id} transform={`translate(${v.x} ${v.y}) rotate(${v.angle * 180 / Math.PI})`}><circle r={v.kind === 'aircraft' ? marker : marker * .65} fill={v.kind === 'aircraft' ? '#8de6ce' : '#ffd494'} opacity=".75" /><path d={`M${marker} 0L${-marker / 2} ${-marker / 2}V${marker / 2}Z`} fill="#183c32" /></g>)}
        {snapshot.players.filter(p => p.lifeState === 'alive').map(p => <g key={p.id} transform={`translate(${p.x} ${p.y}) rotate(${p.angle * 180 / Math.PI})`}><circle r={marker} fill="#102828" stroke={p.color} strokeWidth={scale * 12} /><path d={`M${marker * .9} 0L${-marker * .4} ${-marker * .4}L${-marker * .2} 0L${-marker * .4} ${marker * .4}Z`} fill={p.id === localPlayer.id ? '#fff4d8' : p.color} /></g>)}
      </svg>
    </div><aside><small>EXPLORE & ESTABLISH</small>{destinations.map(p => <button key={p.id} type="button" aria-pressed={selectedId === p.id} onClick={() => choose(p.id)}><strong style={{ color: p.color }}>{p.name}</strong><span>{Math.round(Math.hypot(p.x - localPlayer.x, p.y - localPlayer.y) / 12)}m from your crew</span></button>)}<p>{selected.detail}</p>
      <div className="friends-map__legend"><span><TrainFront size={15} />Your railway · tracks you built</span><span><Plane size={15} />Sunskiff · fly across the entire frontier</span><span><Mountain size={15} />Dig into the ground. Mine beneath the mountains.</span></div>
      <p className="friends-map__help">Start with a cedar and the Copper Hollow mine. Forge tools at your workshop, then fly to the ridge and build a remote workshop. Your terrain, cargo, supplies and construction return with your saved world.</p><small>M closes this atlas · G opens your field pack</small>
    </aside></div>
  </section>;
}
