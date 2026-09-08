import { useMemo, useState } from 'react';
import { Map as MapIcon, Navigation, Radio, X } from 'lucide-react';
import type { CoopSnapshot } from '../game/multiplayer/CoopSimulation';
import {
  COOP_FIELD_MISSION_DESCRIPTIONS,
  COOP_FIELD_MISSION_LABELS,
  coopFieldMissionStageLabel,
  resolveCoopMissionNavigationTarget,
  type CoopFieldMissionKind,
} from '../game/multiplayer/CoopFieldMissions';
import { getWorldObstacles, WORLD_DISTRICTS, WORLD_SECTOR_SIZE, WORLD_TRANSIT_LINES } from '../game/world/WorldLayout';
import { getWorldDefinition, sampleWorldSurface } from '../game/world/WorldDefinitions';

const WORLD_SIZE = 12_000;
const MISSION_COLORS: Readonly<Record<CoopFieldMissionKind, string>> = {
  toxic_hunt: '#4ade80', demolition: '#fb7185', hostage_recovery: '#fbbf24',
  signal_hijack: '#22d3ee', courier_intercept: '#c084fc',
};

interface CoopTacticalMapProps {
  snapshot: CoopSnapshot;
  localPlayer: CoopSnapshot['players'][number];
  onPingMission: (missionId: number) => void;
  onClose: () => void;
}

function cssHex(value: number) { return `#${value.toString(16).padStart(6, '0')}`; }
function percent(x: number, y: number) { return { left: `${x / WORLD_SIZE * 100}%`, top: `${y / WORLD_SIZE * 100}%` }; }
function angleDegrees(angle: number) { return angle * 180 / Math.PI; }
function metersBetween(left: { x: number; y: number }, right: { x: number; y: number }) {
  return Math.max(1, Math.round(Math.hypot(left.x - right.x, left.y - right.y) / 12));
}

export function CoopTacticalMap({ snapshot, localPlayer, onPingMission, onClose }: CoopTacticalMapProps) {
  const missions = snapshot.fieldMissions;
  const active = missions?.active;
  const activeNavigationTarget = resolveCoopMissionNavigationTarget(active, snapshot.enemies);
  const [selectedMissionId, setSelectedMissionId] = useState<number | null>(active?.id || null);
  const [pingedMissionId, setPingedMissionId] = useState<number | null>(null);
  const selected = missions?.sites.find(site => site.id === selectedMissionId);
  const worldId = snapshot.world?.id || 'neon_bastion';
  const world = getWorldDefinition(worldId);
  const obstacles = useMemo(() => getWorldObstacles(worldId), [worldId]);
  const surfaceCells = useMemo(() => {
    if (worldId === 'neon_bastion') return [];
    const cells: Array<{ x: number; y: number; kind: string }> = [];
    for (let y = 150; y < WORLD_SIZE; y += 300) for (let x = 150; x < WORLD_SIZE; x += 300) {
      const surface = sampleWorldSurface(worldId, x, y);
      if (surface.walkable) cells.push({ x: x - 150, y: y - 150, kind: surface.kind });
    }
    return cells;
  }, [worldId]);
  const livingPlayers = snapshot.players.filter(player => player.lifeState !== 'eliminated' && player.lifeState !== 'extracted');
  const facingRange = 760;
  const facingHalfAngle = .34;
  const facingCone = `${localPlayer.x},${localPlayer.y} ${localPlayer.x + Math.cos(localPlayer.angle - facingHalfAngle) * facingRange},${localPlayer.y + Math.sin(localPlayer.angle - facingHalfAngle) * facingRange} ${localPlayer.x + Math.cos(localPlayer.angle + facingHalfAngle) * facingRange},${localPlayer.y + Math.sin(localPlayer.angle + facingHalfAngle) * facingRange}`;

  const pingMission = (missionId: number) => {
    const site = missions?.sites.find(candidate => candidate.id === missionId && candidate.state !== 'completed');
    if (!site) return;
    setSelectedMissionId(site.id);
    setPingedMissionId(site.id);
    onPingMission(site.id);
  };

  return <div role="dialog" aria-modal="true" aria-label="Tactical map" className="absolute inset-0 z-[110] flex bg-[#01050a]/97 p-2 backdrop-blur-xl sm:p-4" onMouseDown={event => event.stopPropagation()}>
    <section className="mx-auto flex h-full w-full max-w-[1600px] gap-3 overflow-hidden border border-cyan-300/35 bg-[#050d16] p-3 shadow-[0_0_90px_rgba(34,211,238,.18)] sm:p-4">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="mb-2 flex items-center justify-between gap-3 border-b border-cyan-200/20 pb-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[.2em] text-cyan-100"><MapIcon size={18} /> Tactical Operations Map</div>
            <p className="mt-1 truncate text-[9px] uppercase tracking-wider text-white/45">Live {world.name} survey · double-click a contract to squad-ping · TAB or ESC closes</p>
          </div>
          <button autoFocus onClick={onClose} className="flex shrink-0 items-center gap-2 border border-cyan-300/35 bg-cyan-400/10 px-3 py-2 text-[10px] font-black uppercase text-cyan-100 hover:bg-cyan-300/20"><kbd>TAB</kbd><X size={14} />Close</button>
        </header>

        <div className="relative mx-auto aspect-square min-h-0 w-full max-w-[min(100%,calc(100vh-78px))] flex-1 overflow-hidden border border-cyan-200/35 bg-[#07111c] shadow-[inset_0_0_60px_rgba(2,8,23,.9)]">
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${WORLD_SIZE} ${WORLD_SIZE}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <pattern id="city-sector-grid" width={WORLD_SECTOR_SIZE} height={WORLD_SECTOR_SIZE} patternUnits="userSpaceOnUse"><path d={`M ${WORLD_SECTOR_SIZE} 0 L 0 0 0 ${WORLD_SECTOR_SIZE}`} fill="none" stroke="#38bdf8" strokeOpacity=".09" strokeWidth="16" /></pattern>
              <pattern id="city-minor-grid" width="125" height="125" patternUnits="userSpaceOnUse"><path d="M 125 0 L 0 0 0 125" fill="none" stroke="#94a3b8" strokeOpacity=".025" strokeWidth="7" /></pattern>
              <filter id="player-glow"><feGaussianBlur stdDeviation="45" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
              <marker id="gas-heading" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#86efac" /></marker>
            </defs>
            <rect width={WORLD_SIZE} height={WORLD_SIZE} fill={cssHex(world.theme.clearColor)} />
            {worldId === 'neon_bastion' && <><rect width={WORLD_SIZE} height={WORLD_SIZE} fill="url(#city-minor-grid)" /><rect width={WORLD_SIZE} height={WORLD_SIZE} fill="url(#city-sector-grid)" /></>}
            {surfaceCells.map(cell => <rect key={`${cell.x}:${cell.y}`} x={cell.x} y={cell.y} width="302" height="302" fill={cell.kind === 'burning' ? cssHex(world.theme.dangerColor) : cell.kind === 'thin_ice' ? '#d9f7ff' : cell.kind === 'energy' ? cssHex(world.theme.accentColor) : cssHex(world.theme.groundColor)} fillOpacity={cell.kind === 'solid' ? .92 : .7} />)}
            {worldId === 'neon_bastion' && WORLD_TRANSIT_LINES.map(line => line.axis === 'x'
              ? <g key={line.id}><line x1={line.start} y1={line.coordinate} x2={line.end} y2={line.coordinate} stroke="#020617" strokeWidth="105" opacity=".9" /><line x1={line.start} y1={line.coordinate} x2={line.end} y2={line.coordinate} stroke={cssHex(line.color)} strokeWidth="22" opacity=".45" strokeDasharray="90 55" /></g>
              : <g key={line.id}><line x1={line.coordinate} y1={line.start} x2={line.coordinate} y2={line.end} stroke="#020617" strokeWidth="105" opacity=".9" /><line x1={line.coordinate} y1={line.start} x2={line.coordinate} y2={line.end} stroke={cssHex(line.color)} strokeWidth="22" opacity=".45" strokeDasharray="90 55" /></g>)}
            <g data-map-layer="buildings">{obstacles.map(obstacle => {
              const district = WORLD_DISTRICTS[obstacle.district];
              const obstacleFill = worldId === 'neon_bastion' ? cssHex(district.buildingColor) : cssHex(world.theme.groundColor);
              const obstacleGlow = worldId === 'neon_bastion' ? cssHex(district.emissiveColor) : cssHex(world.theme.accentColor);
              return <g key={obstacle.id}>
                <rect x={obstacle.x - 18} y={obstacle.y - 18} width={obstacle.width + 36} height={obstacle.height + 36} rx="18" fill="#020617" opacity=".72" />
                <rect x={obstacle.x} y={obstacle.y} width={obstacle.width} height={obstacle.height} rx="12" fill={obstacleFill} stroke={obstacleGlow} strokeOpacity=".58" strokeWidth="12" />
                {obstacle.elevation >= 220 && <rect x={obstacle.x + obstacle.width * .24} y={obstacle.y + obstacle.height * .24} width={obstacle.width * .52} height={obstacle.height * .52} rx="8" fill={obstacleGlow} opacity=".18" />}
              </g>;
            })}</g>
            {snapshot.gasZone?.targetX !== undefined && snapshot.gasZone.targetY !== undefined && <line x1={snapshot.gasZone.x} y1={snapshot.gasZone.y} x2={snapshot.gasZone.targetX} y2={snapshot.gasZone.targetY} stroke="#86efac" strokeWidth="42" strokeDasharray="110 75" markerEnd="url(#gas-heading)" opacity=".9" />}
            {snapshot.gasZone && <g><circle cx={snapshot.gasZone.x} cy={snapshot.gasZone.y} r={snapshot.gasZone.radius} fill="#22c55e" fillOpacity=".10" stroke="#86efac" strokeOpacity=".8" strokeWidth="34" /><circle cx={snapshot.gasZone.x} cy={snapshot.gasZone.y} r={snapshot.gasZone.radius - 70} fill="none" stroke="#4ade80" strokeOpacity=".2" strokeWidth="18" strokeDasharray="70 55" /></g>}
            <polygon points={facingCone} fill={localPlayer.color} fillOpacity=".20" stroke={localPlayer.color} strokeOpacity=".5" strokeWidth="18" />
            {livingPlayers.map(player => {
              const own = player.id === localPlayer.id;
              return <g key={player.id} transform={`translate(${player.x} ${player.y}) rotate(${angleDegrees(player.angle)})`} filter={own ? 'url(#player-glow)' : undefined}>
                {own && <circle r="245" fill="none" stroke="#ecfeff" strokeWidth="34" strokeOpacity=".9"><animate attributeName="r" values="190;275;190" dur="1.6s" repeatCount="indefinite" /><animate attributeName="stroke-opacity" values=".95;.22;.95" dur="1.6s" repeatCount="indefinite" /></circle>}
                <path d={own ? 'M 190 0 L -105 -118 L -62 0 L -105 118 Z' : 'M 145 0 L -82 -92 L -48 0 L -82 92 Z'} fill={own ? '#ecfeff' : player.color} stroke={own ? localPlayer.color : '#f8fafc'} strokeWidth={own ? 38 : 25} />
                <circle r={own ? 53 : 42} fill={player.color} />
              </g>;
            })}
            {snapshot.pings?.map(ping => <g key={ping.id} transform={`translate(${ping.x} ${ping.y})`}>
              <circle r="130" fill="none" stroke={ping.playerColor} strokeWidth="28"><animate attributeName="r" values="90;230" dur="1.25s" repeatCount="indefinite" /><animate attributeName="stroke-opacity" values="1;0" dur="1.25s" repeatCount="indefinite" /></circle>
              <path d="M 0 -110 L 90 0 L 0 110 L -90 0 Z" fill={ping.playerColor} stroke="#fff" strokeWidth="22" />
            </g>)}
          </svg>

          {snapshot.gasZone && <div className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center text-base" style={percent(snapshot.gasZone.x, snapshot.gasZone.y)}>☣</div>}

          {missions?.sites.map(site => {
            const canPing = site.state !== 'completed';
            const distanceTarget = site.state === 'active' && active?.id === site.id ? activeNavigationTarget || active : site;
            return <button key={site.id} type="button" onClick={() => setSelectedMissionId(site.id)} onDoubleClick={() => pingMission(site.id)} disabled={!canPing} title={`${COOP_FIELD_MISSION_LABELS[site.kind]} · double-click to ping`} className={`absolute z-30 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] text-[10px] font-black text-black transition hover:scale-125 focus-visible:scale-125 focus-visible:outline-none disabled:opacity-35 ${pingedMissionId === site.id ? 'animate-pulse' : ''}`} style={{ ...percent(distanceTarget.x, distanceTarget.y), backgroundColor: MISSION_COLORS[site.kind], borderColor: selectedMissionId === site.id ? '#fff' : MISSION_COLORS[site.kind], boxShadow: `0 0 18px ${MISSION_COLORS[site.kind]}` }}>{site.state === 'completed' ? '✓' : site.id}</button>;
          })}
          {active?.drives.filter(drive => !drive.collected).map(drive => <span key={drive.id} className="pointer-events-none absolute z-20 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 border-2 border-white bg-violet-400 shadow-[0_0_12px_#c084fc]" style={percent(drive.x, drive.y)} />)}
          {active?.hostage && active.hostage.state !== 'secured' && <span className="pointer-events-none absolute z-20 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-amber-300 text-[10px] font-black text-black shadow-[0_0_13px_#fbbf24]" style={percent(active.hostage.x, active.hostage.y)}>H</span>}
          {snapshot.buyStations.map(station => <span key={station.id} title="Buy Station" className={`pointer-events-none absolute z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 ${station.state === 'active' ? 'border-white bg-cyan-300 shadow-[0_0_12px_#22d3ee]' : 'border-cyan-300/60 bg-cyan-950'}`} style={percent(station.x, station.y)} />)}
          {snapshot.weaponFoundry && <span title="Weapon Foundry" className="pointer-events-none absolute z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-orange-400 shadow-[0_0_12px_#fb923c]" style={percent(snapshot.weaponFoundry.x, snapshot.weaponFoundry.y)} />}
          {snapshot.bridge?.destinationWorldId && <span title={`Worldlink · ${snapshot.bridge.state}`} className={`pointer-events-none absolute z-20 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center border-2 border-amber-100 text-[9px] font-black text-black shadow-[0_0_16px_#fbbf24] ${snapshot.bridge.state === 'locked' ? 'bg-amber-950 opacity-55' : 'bg-amber-300'}`} style={percent(snapshot.bridge.buildX, snapshot.bridge.buildY)}>W</span>}
          {snapshot.run.objective && <span title="Primary operation" className="pointer-events-none absolute z-20 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-emerald-400 shadow-[0_0_15px_#34d399]" style={percent(snapshot.run.objective.x, snapshot.run.objective.y)} />}
          {snapshot.run.exfil && <span title="Operation exfil" className="pointer-events-none absolute z-20 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-[3px] border-white bg-amber-300 shadow-[0_0_15px_#fbbf24]" style={percent(snapshot.run.exfil.x, snapshot.run.exfil.y)} />}
          {snapshot.privateExfil && <span title="Private exfil" className="pointer-events-none absolute z-20 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rotate-45 border-[3px] border-amber-100 bg-orange-500 shadow-[0_0_18px_#f59e0b]" style={percent(snapshot.privateExfil.x, snapshot.privateExfil.y)} />}

          {livingPlayers.map(player => <div key={`label-${player.id}`} className={`pointer-events-none absolute z-40 -translate-x-1/2 translate-y-4 whitespace-nowrap border px-1.5 py-0.5 text-center font-mono text-[8px] font-black uppercase ${player.id === localPlayer.id ? 'border-cyan-100/70 bg-cyan-950/95 text-cyan-50' : 'border-white/20 bg-black/90 text-white'}`} style={percent(player.x, player.y)}><span style={{ color: player.color }}>{player.id === localPlayer.id ? 'YOU' : player.label}</span>{player.id !== localPlayer.id && <span className="ml-1 text-white/50">{metersBetween(localPlayer, player)}m</span>}</div>)}
          {snapshot.pings?.map(ping => <div key={`ping-label-${ping.id}`} className="pointer-events-none absolute z-40 -translate-x-1/2 translate-y-4 whitespace-nowrap border border-white/25 bg-black/90 px-1.5 py-0.5 font-mono text-[8px] font-black uppercase" style={{ ...percent(ping.x, ping.y), color: ping.playerColor }}><Radio className="mr-1 inline" size={8} />{ping.labelParams?.name ? String(ping.labelParams.name) : ping.playerId === localPlayer.id ? 'YOUR PING' : `${ping.playerLabel}'S PING`}</div>)}
          {pingedMissionId && <div aria-live="polite" className="pointer-events-none absolute bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 border border-cyan-200/45 bg-[#061522]/95 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-cyan-50 shadow-[0_0_20px_rgba(34,211,238,.25)]"><Radio size={12} />Mission ping sent to squad</div>}
        </div>
      </div>

      <aside className="hidden w-[330px] shrink-0 overflow-y-auto border-l border-cyan-200/15 pl-4 lg:block">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-cyan-200"><Navigation size={13} /> Field Contracts</div>
        <p className="mt-1 text-[8px] uppercase leading-relaxed text-white/35">Single click to inspect · double-click to place a squad waypoint</p>
        <div className="mt-3 space-y-2">{missions?.sites.map(site => <button key={site.id} type="button" onClick={() => setSelectedMissionId(site.id)} onDoubleClick={() => pingMission(site.id)} disabled={site.state === 'completed'} className="w-full border px-3 py-2 text-left transition hover:brightness-125 disabled:opacity-35" style={{ borderColor: selectedMissionId === site.id ? '#fff' : `${MISSION_COLORS[site.kind]}66`, backgroundColor: `${MISSION_COLORS[site.kind]}10` }}><span className="flex items-center justify-between gap-2"><span className="text-[10px] font-black uppercase" style={{ color: MISSION_COLORS[site.kind] }}>{COOP_FIELD_MISSION_LABELS[site.kind]}</span><span className="font-mono text-[8px] text-white/55">{metersBetween(localPlayer, site.state === 'active' && active?.id === site.id ? activeNavigationTarget || active : site)}m</span></span><span className="mt-1 flex justify-between text-[8px] uppercase text-white/45"><span>{site.state}</span><span>¤ {site.reward} each</span></span></button>)}</div>
        {selected && <div className="mt-4 border border-white/10 bg-white/[.025] p-3"><div className="text-xs font-black uppercase" style={{ color: MISSION_COLORS[selected.kind] }}>{COOP_FIELD_MISSION_LABELS[selected.kind]}</div><p className="mt-2 text-[10px] leading-relaxed text-white/55">{COOP_FIELD_MISSION_DESCRIPTIONS[selected.kind]}</p><div className="mt-3 font-mono text-[10px] text-amber-200">SQUAD PAYOUT · ¤ {selected.reward} PER OPERATOR</div><button type="button" onClick={() => pingMission(selected.id)} disabled={selected.state === 'completed'} className="mt-3 flex w-full items-center justify-center gap-2 border border-cyan-200/40 bg-cyan-300/10 px-3 py-2 text-[9px] font-black uppercase text-cyan-50 hover:bg-cyan-300/20 disabled:opacity-35"><Radio size={11} />Ping mission</button></div>}
        {active && <div className="mt-4 border border-emerald-300/30 bg-emerald-400/[.06] p-3"><div className="text-[9px] font-black uppercase tracking-wider text-emerald-200">Active · {coopFieldMissionStageLabel(active)}</div><div className="mt-2 h-1.5 bg-black/60"><i className="block h-full bg-emerald-300" style={{ width: `${Math.min(100, active.progress / Math.max(1, active.required) * 100)}%` }} /></div></div>}
        <div className="mt-4 border-t border-white/10 pt-3 text-[8px] uppercase leading-relaxed text-white/40">Outlined blocks · Buildings<br />Arrow + cone · Operator heading<br />Colored arrows · Squad members<br />Pulsing diamond · Squad ping<br />Cyan diamond · Buy Station<br />Amber diamond · Extraction<br />Green circle · Mobile toxic zone</div>
      </aside>
    </section>
  </div>;
}
