import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Coins, ShoppingCart, ShieldPlus } from 'lucide-react';
import { COOP_REVIVE_RANGE, COOP_WEAPON_DETAILS, COOP_WEAPON_SLOTS, CoopPlayerSeed, CoopSimulation, CoopSnapshot, quantizeAngle, quantizePitch } from '../game/multiplayer/CoopSimulation';
import { MultiplayerRendererBridge } from '../game/multiplayer/MultiplayerRendererBridge';
import { interpolateCoopSnapshot } from '../game/multiplayer/snapshotInterpolation';
import { soundManager } from '../game/SoundManager';
import { MultiplayerLaunch } from './ManualMultiplayerSetup';
import { CoopPing, CoopPingKind, MultiplayerInputFrame, MultiplayerStateFrame, MULTIPLAYER_PROTOCOL_VERSION } from '../game/multiplayer/protocol';
import { COOP_SHOP_ITEMS, type CoopShopItemId } from '../game/multiplayer/CoopBuyStation';
import { COOP_PASSIVE_BY_ID, passiveRankCost } from '../game/multiplayer/CoopPassiveModules';
import { getCoopSlideBinding, getMovementBindings, type ControlScheme } from '../game/controls';
import { LocalPlayerPrediction } from '../game/multiplayer/LocalPlayerPrediction';
import { advancePlayerMovement, COOP_STEP_MS } from '../game/multiplayer/playerMovement';
import { HostSimulationClock } from '../game/multiplayer/HostSimulationClock';
import { createInterestSnapshot } from '../game/multiplayer/snapshotInterest';
import './multiplayer.css';

const INPUT_INTERVAL_MS = COOP_STEP_MS;
const SNAPSHOT_INTERVAL_MS = 50;
/** React HUD work does not need to run at the 20 Hz network snapshot rate. */
const HUD_INTERVAL_MS = 100;

/**
 * The first playable direct-connection arena. It intentionally stays separate
 * from the legacy GameEngine while the latter is converted from a one-player
 * browser simulation into a shared squad simulation.
 */
export function MultiplayerArena({ launch, controlScheme, onExit }: { launch: MultiplayerLaunch; controlScheme: ControlScheme; onExit: () => void }) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MultiplayerRendererBridge | null>(null);
  const simulationRef = useRef<CoopSimulation | null>(null);
  if (launch.role === 'host' && !simulationRef.current) simulationRef.current = new CoopSimulation(launch.players);
  const snapshotRef = useRef<CoopSnapshot | null>(null);
  if (simulationRef.current && !snapshotRef.current) snapshotRef.current = simulationRef.current.createSnapshot();
  const presentationRef = useRef({ previous: snapshotRef.current as CoopSnapshot | null, current: snapshotRef.current as CoopSnapshot | null, receivedAt: performance.now(), durationMs: INPUT_INTERVAL_MS });
  const inputRef = useRef<MultiplayerInputFrame>(createInput());
  const networkTickRef = useRef(0);
  const displayedCombatEventsRef = useRef(new Map<number, number>());
  const sessionCloseTimerRef = useRef(0);
  const spectatorTargetRef = useRef<string | null>(null);
  const downedSpectatorTargetRef = useRef<string | null>(null);
  // Input listeners are installed once for the arena. Keep the station's
  // focus state in a ref too, so those listeners can immediately stop sending
  // look/fire/wheel input while the UI is open.
  const stationOpenRef = useRef(false);
  const [hud, setHud] = useState({ players: launch.players.length, kills: 0, tick: 0, connected: true, selectedSlot: 0, weaponLevel: 1, health: 100, maxHealth: 100, level: 1, experience: 0, experienceToNextLevel: 120, coins: 0, cores: 0, weapons: [] as CoopSnapshot['players'][number]['weaponStates'], isReloading: false, isAiming: false, actionEndsAt: undefined as number | undefined, lifeState: 'alive' as CoopSnapshot['players'][number]['lifeState'], downedRemainingMs: 0, reviveProgressMs: 0, reviverId: undefined as string | undefined, invulnerableRemainingMs: 0, matchState: 'active' as CoopSnapshot['matchState'], squad: [] as Array<Pick<CoopSnapshot['players'][number], 'id' | 'label' | 'color' | 'health' | 'maxHealth' | 'lifeState' | 'downedRemainingMs' | 'reviveProgressMs' | 'reviverId'>> });
  const [combatNotice, setCombatNotice] = useState<{ text: string; color: string } | null>(null);
  const [damageFlashKey, setDamageFlashKey] = useState<number | null>(null);
  const damageFlashTimerRef = useRef<number | null>(null);
  const damageFlashExpiresAtRef = useRef(0);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('connected');
  const [connectionMessage, setConnectionMessage] = useState(launch.role === 'host' ? 'Players can join your match at any time.' : 'Connected');

  const triggerDamageFlash = useCallback(() => {
    const now = performance.now();
    damageFlashExpiresAtRef.current = now + 240;
    if (damageFlashTimerRef.current !== null) {
      window.clearTimeout(damageFlashTimerRef.current);
    }
    setDamageFlashKey(k => (k === null ? 1 : k + 1));
    damageFlashTimerRef.current = window.setTimeout(() => {
      setDamageFlashKey(null);
      damageFlashTimerRef.current = null;
      damageFlashExpiresAtRef.current = 0;
    }, 260);
  }, []);
  const [mouseLocked, setMouseLocked] = useState(false);
  const [matchSnapshot, setMatchSnapshot] = useState<CoopSnapshot | null>(snapshotRef.current);
  const [stationOpen, setStationOpen] = useState(false);
  const [stationMessage, setStationMessage] = useState<string | null>(null);
  const [spectatorTarget, setSpectatorTarget] = useState<{ id: string; label: string } | null>(null);
  const [downedSpectatorTarget, setDownedSpectatorTarget] = useState<{ id: string; label: string } | null>(null);
  const isSpectator = launch.role === 'spectator';

  const setStationPanelOpen = (next: boolean | ((current: boolean) => boolean)) => {
    setStationOpen(current => {
      const resolved = typeof next === 'function' ? next(current) : next;
      stationOpenRef.current = resolved;
      return resolved;
    });
  };

  const cycleSpectatorTarget = () => {
    if (!isSpectator) return;
    const players = snapshotRef.current?.players.filter(player => player.lifeState !== 'eliminated') || [];
    if (!players.length) return;
    const current = players.findIndex(player => player.id === spectatorTargetRef.current);
    const next = players[(current + 1 + players.length) % players.length];
    spectatorTargetRef.current = next.id;
    setSpectatorTarget({ id: next.id, label: next.label });
  };

  const cycleDownedSpectatorTarget = () => {
    const players = snapshotRef.current?.players.filter(player => player.id !== launch.localPlayerId && player.lifeState === 'alive') || [];
    if (!players.length) return;
    const current = players.findIndex(player => player.id === downedSpectatorTargetRef.current);
    const next = players[(current + 1 + players.length) % players.length];
    downedSpectatorTargetRef.current = next.id;
    setDownedSpectatorTarget({ id: next.id, label: next.label });
  };

  /** Resolve from the newest authoritative snapshot, never from an
   * interpolated presentation frame. That makes death/revive camera handoffs
   * instantaneous even while visual positions are being smoothed. */
  const resolveDownedSpectatorTarget = (snapshot: CoopSnapshot | null) => {
    const local = snapshot?.players.find(player => player.id === launch.localPlayerId);
    if (local?.lifeState !== 'downed' && local?.lifeState !== 'eliminated') {
      if (downedSpectatorTargetRef.current !== null) {
        downedSpectatorTargetRef.current = null;
        setDownedSpectatorTarget(null);
      }
      return undefined;
    }
    const livingTeammates = snapshot?.players.filter(player => player.id !== launch.localPlayerId && player.lifeState === 'alive') || [];
    const watched = livingTeammates.find(player => player.id === downedSpectatorTargetRef.current) || livingTeammates[0];
    if (!watched) return undefined;
    if (downedSpectatorTargetRef.current !== watched.id) {
      downedSpectatorTargetRef.current = watched.id;
      setDownedSpectatorTarget({ id: watched.id, label: watched.label });
    }
    return watched.id;
  };

  const purchaseStationItem = (stationId: number, itemId: CoopShopItemId) => {
    if (launch.role === 'host') {
      const message = simulationRef.current?.purchase(launch.localPlayerId, stationId, itemId);
      setStationMessage(message || `${COOP_SHOP_ITEMS[itemId].name} acquired.`);
      return;
    }
    launch.session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'station_purchase', payload: { stationId, itemId } });
    setStationMessage('Purchase request sent to host…');
  };

  /** Replaces only the authoritative simulation. The WebRTC session, peer
   * identities, and all three data channels stay intact, so nobody has to
   * exchange a connection code again after a wipe. */
  const retryRun = () => {
    if (launch.role !== 'host') return;
    const previous = simulationRef.current;
    if (!previous) return;
    const nextSimulation = new CoopSimulation(previous.getPlayerSeeds(), Date.now() >>> 0);
    const snapshot = nextSimulation.createSnapshot();
    const now = performance.now();
    simulationRef.current = nextSimulation;
    inputRef.current = createInput();
    snapshotRef.current = snapshot;
    presentationRef.current = { previous: snapshot, current: snapshot, receivedAt: now, durationMs: INPUT_INTERVAL_MS };
    downedSpectatorTargetRef.current = null;
    setDownedSpectatorTarget(null);
    setStationPanelOpen(false);
    setStationMessage(null);
    setMatchSnapshot(snapshot);
    const local = snapshot.players.find(player => player.id === launch.localPlayerId);
    if (local) {
      setHud({
        players: snapshot.players.length, kills: snapshot.kills, tick: snapshot.tick, connected: true, selectedSlot: local.selectedSlot, weaponLevel: local.selectedWeaponLevel,
        health: local.health, maxHealth: local.maxHealth, level: local.level, experience: local.experience,
        experienceToNextLevel: local.experienceToNextLevel, coins: local.coins, cores: local.pendingDataCores, weapons: local.weaponStates,
        isReloading: local.isReloading, isAiming: local.isAiming, actionEndsAt: local.weaponActionEndsAtMs,
        lifeState: local.lifeState, downedRemainingMs: local.downedRemainingMs, reviveProgressMs: local.reviveProgressMs, reviverId: local.reviverId, invulnerableRemainingMs: local.invulnerableRemainingMs,
        matchState: snapshot.matchState,
        squad: snapshot.players.map(player => ({ id: player.id, label: player.label, color: player.color, health: player.health, maxHealth: player.maxHealth, lifeState: player.lifeState, downedRemainingMs: player.downedRemainingMs, reviveProgressMs: player.reviveProgressMs, reviverId: player.reviverId })),
      });
    }
    launch.session.broadcastState(
      { type: 'state', version: MULTIPLAYER_PROTOCOL_VERSION, tick: ++networkTickRef.current, sentAt: Date.now(), payload: snapshot },
      peerId => createInterestSnapshot(snapshot, launch.peerPlayerIds[peerId]),
    );
    launch.hostedLobby?.update(snapshot.players.length, 'in_game');
    setConnectionMessage('New run started — the squad connection is still live.');
    setCombatNotice({ text: 'NEW RUN — SQUAD LINK PRESERVED', color: '#5eead4' });
  };

  useEffect(() => {
    const session = launch.session;
    const prediction = new LocalPlayerPrediction(launch.localPlayerId);
    // React development mode intentionally mounts, cleans up, then remounts
    // effects once. Defer irreversible peer teardown so the remount can cancel
    // it; a real arena exit has no following mount and closes the session.
    window.clearTimeout(sessionCloseTimerRef.current);
    launch.hostedLobby?.setStatusListener(setConnectionMessage);
    displayedCombatEventsRef.current.clear();
    const renderer = new MultiplayerRendererBridge();
    if (sceneRef.current) renderer.mount(sceneRef.current);
    rendererRef.current = renderer;
    const syncPointerLock = () => setMouseLocked(renderer.isPointerLocked);
    document.addEventListener('pointerlockchange', syncPointerLock);
    const presentCombatNotice = (snapshot: CoopSnapshot) => {
      const now = performance.now();
      for (const [id, seenAt] of displayedCombatEventsRef.current.entries()) {
        if (now - seenAt > 10_000) displayedCombatEventsRef.current.delete(id);
      }
      for (const event of snapshot.combatEvents) {
        if (displayedCombatEventsRef.current.has(event.id)) continue;
        displayedCombatEventsRef.current.set(event.id, now);
        if (event.kind === 'ping') {
          const pinger = snapshot.players.find(p => p.id === event.playerId);
          const pingerName = pinger ? pinger.label : 'SQUADMATE';
          const isDanger = event.color === '#ef4444' || event.color === '#fb7185';
          if (event.playerId !== launch.localPlayerId) {
            soundManager.playTacticalPing(isDanger);
          }
          setCombatNotice({
            text: isDanger ? `⚠️ ${pingerName.toUpperCase()}: DANGER ALERT` : `${pingerName.toUpperCase()} PINGED`,
            color: event.color || '#22d3ee',
          });
          continue;
        }
        if (event.playerId && event.playerId !== launch.localPlayerId && event.killedByPlayerId !== launch.localPlayerId) continue;
        if (event.kind === 'enemy_hit' && event.amount) setCombatNotice({ text: `HIT ${Math.round(event.amount)}`, color: '#f8fafc' });
        else if (event.kind === 'enemy_killed') setCombatNotice({ text: 'KILL CONFIRMED', color: event.color || '#fb7185' });
        else if (event.kind === 'pickup_collected') {
          if (event.itemType === 'hp') setCombatNotice({ text: 'FULL HEALTH RESTORED ❤️', color: '#ff3366' });
          else setCombatNotice({ text: event.itemType ? `+ ${event.itemType.replace('_', ' ').toUpperCase()}` : `+ ${Math.round(event.amount || 0)} XP`, color: event.color || '#67e8f9' });
        }
        else if (event.kind === 'level_up') setCombatNotice({ text: `LEVEL ${event.amount}`, color: '#fde047' });
        else if (event.kind === 'weapon_upgraded') setCombatNotice({ text: `${COOP_WEAPON_DETAILS[event.weaponId || 'plasma_gun'].name.toUpperCase()} LV ${event.amount} — DAMAGE +10%`, color: event.color || '#67e8f9' });
        else if (event.kind === 'ammo_collected') setCombatNotice({ text: `AMMO +${event.amount}`, color: event.color || '#67e8f9' });
        else if (event.kind === 'reload_started') setCombatNotice({ text: 'RELOADING', color: '#f8fafc' });
        else if (event.kind === 'empty_fire') setCombatNotice({ text: 'EMPTY — RELOAD', color: '#fca5a5' });
        else if (event.kind === 'player_damaged' && event.playerId === launch.localPlayerId) { const local = snapshot.players.find(player => player.id === launch.localPlayerId); setCombatNotice({ text: `${incomingDirection(local, event)} HIT −${Math.max(1, Math.round(event.amount || 0))}`, color: '#fda4af' }); triggerDamageFlash(); }
        else if (event.kind === 'player_downed' && event.playerId === launch.localPlayerId) setCombatNotice({ text: 'YOU ARE DOWNED', color: '#fb7185' });
        else if (event.kind === 'player_revived' && event.playerId === launch.localPlayerId) setCombatNotice({ text: 'REVIVED — SHIELDS UP', color: '#5eead4' });
        else if (event.kind === 'revive_started' && event.playerId === launch.localPlayerId) setCombatNotice({ text: 'TEAMMATE REVIVING YOU', color: '#a5f3fc' });
        else if (event.kind === 'boss_ability') setCombatNotice({ text: event.amount ? `BOSS PHASE ${event.amount}` : 'BOSS ATTACK — MOVE', color: event.color || '#fda4af' });
        else if (event.kind === 'station_online') setCombatNotice({ text: 'BUY STATION ONLINE', color: '#67e8f9' });
        else if (event.kind === 'exfil_deployed') setCombatNotice({ text: 'EXFILL BEACON DEPLOYED', color: '#fbbf24' });
        else if (event.kind === 'gas_warning') { setCombatNotice({ text: 'CONTAINMENT FAILING — GAS BREACH IN 30s', color: '#f59e0b' }); soundManager.playHazardKlaxon(); }
        else if (event.kind === 'gas_spread') { setCombatNotice({ text: 'TOXIC GAS SPREADING — EQUIP GAS MASKS', color: '#4ade80' }); soundManager.playHazardKlaxon(); }
        else if (event.kind === 'mask_broken' && event.playerId === launch.localPlayerId) { setCombatNotice({ text: 'GAS MASK DESTROYED — EXPOSURE CRITICAL', color: '#f43f5e' }); soundManager.playMaskShatter(); }
        else if (event.kind === 'mask_damaged' && event.playerId === launch.localPlayerId) { soundManager.playFilterDegradation(); }
        else if (event.kind === 'gas_damaged' && event.playerId === launch.localPlayerId) { setCombatNotice({ text: `GAS INHALATION −${Math.max(1, Math.round(event.amount || 0))}`, color: '#4ade80' }); }
        else if (event.kind === 'objective_completed') setCombatNotice({ text: 'DISTRICT UPLINK SECURED', color: '#5eead4' });
        else if (event.kind === 'round_started') setCombatNotice({ text: `ROUND ${event.amount} — HOSTILES INBOUND`, color: '#fbbf24' });
        else if (event.kind === 'round_completed') setCombatNotice({ text: `ROUND ${event.amount} CLEAR — RESUPPLY`, color: '#5eead4' });
      }
    };
    let lastHudSyncAt = -Infinity;
    const syncHud = (snapshot: CoopSnapshot, connected: boolean = true) => {
      const now = performance.now();
      if (now - lastHudSyncAt < HUD_INTERVAL_MS) return;
      lastHudSyncAt = now;
      const local = snapshot.players.find(player => player.id === (isSpectator ? spectatorTargetRef.current : launch.localPlayerId))
        || (isSpectator ? snapshot.players[0] : undefined);
      if (!local) return;
      if (isSpectator && spectatorTargetRef.current !== local.id) {
        spectatorTargetRef.current = local.id;
        setSpectatorTarget({ id: local.id, label: local.label });
      }
      if (!isSpectator) resolveDownedSpectatorTarget(snapshot);
      setMatchSnapshot(snapshot);
      setHud({
        players: snapshot.players.length, kills: snapshot.kills, tick: snapshot.tick, connected, selectedSlot: local.selectedSlot, weaponLevel: local.selectedWeaponLevel,
        health: local.health, maxHealth: local.maxHealth, level: local.level, experience: local.experience,
        experienceToNextLevel: local.experienceToNextLevel, coins: local.coins, cores: local.pendingDataCores, weapons: local.weaponStates,
        isReloading: local.isReloading, isAiming: local.isAiming, actionEndsAt: local.weaponActionEndsAtMs,
        lifeState: local.lifeState, downedRemainingMs: local.downedRemainingMs, reviveProgressMs: local.reviveProgressMs, reviverId: local.reviverId, invulnerableRemainingMs: local.invulnerableRemainingMs,
        matchState: snapshot.matchState,
        squad: snapshot.players.map(player => ({ id: player.id, label: player.label, color: player.color, health: player.health, maxHealth: player.maxHealth, lifeState: player.lifeState, downedRemainingMs: player.downedRemainingMs, reviveProgressMs: player.reviveProgressMs, reviverId: player.reviverId })),
      });
      presentCombatNotice(snapshot);
    };
    const publishSnapshot = (snapshot: CoopSnapshot, now: number) => {
      const timeline = presentationRef.current;
      const restarted = Boolean(timeline.current && snapshot.tick < 5 && timeline.current.tick > 20);
      if (timeline.current && snapshot.tick < timeline.current.tick && !restarted) {
        return;
      }
      const elapsedSinceLastSnapshot = now - timeline.receivedAt;
      timeline.previous = restarted ? snapshot : timeline.current || snapshot;
      if (restarted) displayedCombatEventsRef.current.clear();
      timeline.current = snapshot;
      timeline.receivedAt = now;
      timeline.durationMs = Math.max(20, Math.min(100, elapsedSinceLastSnapshot || INPUT_INTERVAL_MS));
      snapshotRef.current = snapshot;
      if (launch.role === 'guest') prediction.reconcile(snapshot);
    };
    const presentationSnapshot = (now: number) => {
      const timeline = presentationRef.current;
      if (!timeline.current || !timeline.previous) return timeline.current;
      return interpolateCoopSnapshot(timeline.previous, timeline.current, (now - timeline.receivedAt) / timeline.durationMs);
    };
    const hostPlayerIdByPeer = launch.peerPlayerIds;
    session.setHandlers({
      onPeerChange: (peers) => {
        if (launch.role === 'host') {
          for (const peer of peers) {
            if (peer.state !== 'failed' && peer.state !== 'closed') continue;
            const playerId = launch.peerPlayerIds[peer.peerId];
            if (playerId && simulationRef.current?.removePlayer(playerId)) {
              delete launch.peerPlayerIds[peer.peerId];
              const snapshot = simulationRef.current.createSnapshot();
              publishSnapshot(snapshot, performance.now());
              setHud(current => ({ ...current, players: snapshot.players.length }));
              setConnectionMessage('A player disconnected. The match continues.');
            }
          }
          const players = simulationRef.current?.getPlayerSeeds().length || 1;
          launch.hostedLobby?.update(players, 'in_game');
          return;
        }
        const state = peers[0]?.state;
        if (state === 'connected') { setConnectionStatus('connected'); setConnectionMessage('Connected'); }
        else if (state === 'connecting' || state === 'disconnected') { setConnectionStatus('reconnecting'); setConnectionMessage('Reconnecting…'); }
        else if (state === 'failed' || state === 'closed') { setConnectionStatus('disconnected'); setConnectionMessage('Connection lost.'); }
      },
      onInput: (peerId, frame, estimatedOneWayMs) => {
        if (launch.role !== 'host') return;
        const playerId = hostPlayerIdByPeer[peerId];
        if (playerId) simulationRef.current?.setInput(playerId, frame, estimatedOneWayMs + INPUT_INTERVAL_MS / 2);
      },
      onState: (frame) => {
        if (launch.role === 'host') return;
        const snapshot = parseSnapshot(frame.payload);
        if (!snapshot) return;
        publishSnapshot(snapshot, performance.now());
        syncHud(snapshot);
      },
      onEvent: (peerId, event) => {
        if (event.event === 'ping' && launch.role === 'host') {
          const playerId = launch.peerPlayerIds[peerId];
          const payload = event.payload as { x?: number; y?: number; z?: number; kind?: CoopPingKind; label?: string } | undefined;
          if (playerId && payload && typeof payload.x === 'number' && typeof payload.y === 'number') {
            simulationRef.current?.addPing(playerId, payload.x, payload.y, payload.z || 0, payload.kind || 'location', payload.label || 'Waypoint');
          }
          return;
        }
        if (event.event === 'station_purchase' && launch.role === 'host') {
          const request = parseStationPurchase(event.payload);
          const playerId = launch.peerPlayerIds[peerId];
          if (request && playerId) {
            const message = simulationRef.current?.purchase(playerId, request.stationId, request.itemId);
            if (message) session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'error', payload: { playerId, message } });
          }
          return;
        }
        if (event.event === 'ready' && launch.role === 'host') {
          const candidate = parsePlayer(event.payload);
          const simulation = simulationRef.current;
          if (!candidate || !simulation || launch.peerPlayerIds[peerId]) return;
          const player: CoopPlayerSeed = { ...candidate, color: nextGuestColor(simulation.getPlayerSeeds().length - 1) };
          if (!simulation.addPlayer(player)) return;
          launch.peerPlayerIds[peerId] = player.id;
          const players = simulation.getPlayerSeeds();
          session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'start', payload: players });
          publishSnapshot(simulation.createSnapshot(), performance.now());
          setHud(current => ({ ...current, players: players.length }));
          launch.hostedLobby?.update(players.length, 'in_game');
          setConnectionMessage(`${player.label} joined the match.`);
          return;
        }
        if (event.event === 'spectate' && launch.role === 'host') {
          const players = simulationRef.current?.getPlayerSeeds();
          if (players?.length) session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'start', payload: players });
          return;
        }
        if (event.event === 'leave') {
          if (launch.role === 'host') {
            const playerId = launch.peerPlayerIds[peerId];
            if (playerId && simulationRef.current?.removePlayer(playerId)) {
              delete launch.peerPlayerIds[peerId];
              const players = simulationRef.current.getPlayerSeeds();
              launch.hostedLobby?.update(players.length, 'in_game');
              publishSnapshot(simulationRef.current.createSnapshot(), performance.now());
              setConnectionMessage('A player left. The match continues.');
            }
          } else {
            setConnectionStatus('disconnected');
            setConnectionMessage('The host left the match.');
          }
        }
        if (event.event === 'error' && launch.role === 'guest') {
          const issue = event.payload as { playerId?: unknown; message?: unknown } | undefined;
          if (issue?.playerId === launch.localPlayerId && typeof issue.message === 'string') setStationMessage(issue.message);
        }
      },
      onError: () => {
        if (launch.role === 'guest' || launch.role === 'spectator') { setConnectionStatus('disconnected'); setConnectionMessage('Connection lost.'); }
      },
    });

    const keys = new Set<string>();
    const movementBindings = getMovementBindings(controlScheme);
    const slideBinding = getCoopSlideBinding(controlScheme);
    let firing = false;
    let sequence = inputRef.current.sequence;
    let fireActionId = inputRef.current.fireActionId || 0;
    const updateInput = () => {
      const movement = (movementBindings.up.some(key => keys.has(key)) ? 1 : 0)
        | (movementBindings.down.some(key => keys.has(key)) ? 2 : 0)
        | (movementBindings.left.some(key => keys.has(key)) ? 4 : 0)
        | (movementBindings.right.some(key => keys.has(key)) ? 8 : 0);
      inputRef.current = {
        ...inputRef.current,
        sequence: ++sequence,
        clientTime: Date.now(),
        movement,
        firing,
        sprinting: keys.has('shift'),
        // W is AZERTY-only. QWERTY uses C so W stays available for forward.
        sliding: keys.has(slideBinding),
        // F is intentionally held; the host owns range checks and timing.
        reviving: keys.has('f'),
      };
    };
    const clearJumpInput = () => {
      if (!inputRef.current.jumpPressed && !inputRef.current.reloadPressed) return;
      inputRef.current = { ...inputRef.current, sequence: ++sequence, clientTime: Date.now(), jumpPressed: false, reloadPressed: false };
    };
    let lastPingClickTime = 0;
    const triggerPing = (forcedKind?: CoopPingKind) => {
      if (isSpectator || stationOpenRef.current) return;
      const local = snapshotRef.current?.players.find(player => player.id === launch.localPlayerId);
      if (!local || local.lifeState === 'eliminated') return;
      const target = renderer.calculatePingTarget(snapshotRef.current, launch.localPlayerId);
      if (!target) return;

      const isDanger = forcedKind === 'enemy';
      const kind: CoopPingKind = forcedKind || target.kind;
      const label = isDanger ? 'Danger / Enemy Alert' : target.label;
      const color = isDanger || kind === 'enemy' || kind === 'boss' ? '#ef4444' : kind === 'revive' ? '#fbbf24' : '#22d3ee';

      soundManager.playTacticalPing(isDanger);
      if (launch.role === 'host') {
        simulationRef.current?.addPing(launch.localPlayerId, target.x, target.y, target.z, kind, label);
      } else {
        session.sendEvent({
          type: 'event',
          version: MULTIPLAYER_PROTOCOL_VERSION,
          event: 'ping',
          payload: {
            x: target.x,
            y: target.y,
            z: target.z,
            kind,
            label,
          },
        });
      }
      setCombatNotice({
        text: isDanger ? '⚠️ PINGED: DANGER (ENEMY ALERT)' : `PINGED: ${label}`,
        color,
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return;
      if (isSpectator) return;
      // Reload can be the first interaction in an arena, before the player
      // clicks to lock the mouse. Keyboard gestures are equally valid for
      // resuming Web Audio, so make that first R press audible too.
      soundManager.activate();
      if (event.code === 'Space') {
        event.preventDefault();
        if (!event.repeat) {
          if (rendererRef.current ? rendererRef.current.canLocalJump() : true) {
            soundManager.playJump();
          }
          inputRef.current = { ...inputRef.current, sequence: ++sequence, clientTime: Date.now(), jumpPressed: true };
        }
        return;
      }
      const key = event.key.toLowerCase();
      if (stationOpenRef.current && key !== 'f') return;
      if (key === 'g') {
        event.preventDefault();
        if (!event.repeat) {
          const now = performance.now();
          if (now - lastPingClickTime < 350) {
            lastPingClickTime = 0;
            triggerPing('enemy');
          } else {
            lastPingClickTime = now;
            triggerPing();
          }
        }
        return;
      }
      if (key === 'f') {
        event.preventDefault();
        const snapshot = snapshotRef.current;
        const local = snapshot?.players.find(player => player.id === launch.localPlayerId);
        const station = local && snapshot?.buyStations.find(candidate => candidate.active && Math.hypot(local.x - candidate.x, local.y - candidate.y) <= candidate.radius + 48);
        const revivableTeammate = local && snapshot?.players.some(player => player.id !== local.id && player.lifeState === 'downed' && Math.hypot(local.x - player.x, local.y - player.y) <= COOP_REVIVE_RANGE);
        // Revive is deliberately first priority when both are possible. The
        // interaction key remains held in `keys` so the host owns validation.
        if (local?.lifeState === 'downed' || revivableTeammate || !station) {
          keys.add(key);
          updateInput();
          if (local?.lifeState !== 'downed' && !revivableTeammate && !event.repeat) setCombatNotice({ text: 'NO REVIVE OR INTERACTION IN RANGE', color: '#fca5a5' });
          return;
        }
        if (event.repeat) return;
        renderer.exitPointerLock();
        setStationMessage(null);
        setStationPanelOpen(open => !open);
        return;
      }
      if (key === 'r') {
        event.preventDefault();
        if (!event.repeat) inputRef.current = { ...inputRef.current, sequence: ++sequence, clientTime: Date.now(), reloadPressed: true };
        return;
      }
      if (/^[1-9]$/.test(key)) {
        event.preventDefault();
        inputRef.current = { ...inputRef.current, selectedSlot: Number(key) - 1 };
        setHud(current => ({ ...current, selectedSlot: Number(key) - 1 }));
        return;
      }
      keys.add(key);
      updateInput();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'r') { inputRef.current = { ...inputRef.current, sequence: ++sequence, clientTime: Date.now(), reloadPressed: false }; return; }
      keys.delete(event.key.toLowerCase());
      updateInput();
    };
    const onMouseMove = (event: MouseEvent) => {
      if (stationOpenRef.current || isSpectator) return;
      inputRef.current = {
        ...inputRef.current,
        aimAngle: quantizeAngle(renderer.getAimAngle()),
        aimPitch: quantizePitch(renderer.getAimPitch()),
      };
    };
    const onMouseDown = (event: MouseEvent) => {
      // A Buy Station is a focused modal. Do not let a click on its buttons,
      // list, or backdrop leak through to pointer lock, fire, or aiming.
      if (stationOpenRef.current) return;
      // Middle mouse button (click scroll wheel) pings
      if (event.button === 1) {
        event.preventDefault();
        const now = performance.now();
        if (now - lastPingClickTime < 350) {
          lastPingClickTime = 0;
          triggerPing('enemy');
        } else {
          lastPingClickTime = now;
          triggerPing();
        }
        return;
      }
      // This must run inside the real user gesture. The firing event reaches
      // the renderer on a later animation frame, which is too late for strict
      // autoplay policies to resume a suspended AudioContext.
      soundManager.activate();
      if (isSpectator) {
        if (event.button === 0) cycleSpectatorTarget();
        renderer.requestPointerLock();
        return;
      }
      const lifeState = snapshotRef.current?.players.find(player => player.id === launch.localPlayerId)?.lifeState;
      if (lifeState === 'downed' || lifeState === 'eliminated') {
        if (event.button === 0) cycleDownedSpectatorTarget();
        renderer.requestPointerLock();
        return;
      }
      if (event.button === 2) { inputRef.current = { ...inputRef.current, aiming: true, sequence: ++sequence, clientTime: Date.now() }; return; }
      if (event.button !== 0) return;
      renderer.requestPointerLock();
      fireActionId++;
      firing = true;
      updateInput();
      inputRef.current = { ...inputRef.current, fireActionId };
      const weaponId = COOP_WEAPON_SLOTS[inputRef.current.selectedSlot];
      const local = snapshotRef.current?.players.find(player => player.id === launch.localPlayerId);
      const weapon = local?.weaponStates[inputRef.current.selectedSlot];
      if (weaponId && local?.lifeState === 'alive' && weapon?.state === 'ready' && weapon.magazineAmmo > 0 && weapon.nextFireAtMs <= (snapshotRef.current?.elapsedMs || 0)) {
        renderer.predictLocalFire(weaponId, fireActionId);
      }
    };
    const onMouseUp = (event: MouseEvent) => {
      if (stationOpenRef.current) {
        firing = false;
        updateInput();
        return;
      }
      if (isSpectator) return;
      const currentLifeState = snapshotRef.current?.players.find(player => player.id === launch.localPlayerId)?.lifeState;
      if (currentLifeState === 'downed' || currentLifeState === 'eliminated') {
        firing = false;
        updateInput();
        return;
      }
      if (event.button === 2) { inputRef.current = { ...inputRef.current, aiming: false, sequence: ++sequence, clientTime: Date.now() }; return; }
      if (event.button !== 0) return;
      firing = false;
      updateInput();
    };
    const onWheel = (event: WheelEvent) => {
      // Leave the browser's normal scrolling intact for the station list.
      // In every other state the wheel remains the weapon selector.
      if (stationOpenRef.current || isSpectator) return;
      event.preventDefault();
      const direction = event.deltaY > 0 ? 1 : -1;
      const selectedSlot = (inputRef.current.selectedSlot + direction + COOP_WEAPON_SLOTS.length) % COOP_WEAPON_SLOTS.length;
      inputRef.current = { ...inputRef.current, selectedSlot };
      setHud(current => ({ ...current, selectedSlot }));
    };
    const clearControls = () => {
      keys.clear(); firing = false; updateInput();
      inputRef.current = { ...inputRef.current, aiming: false, jumpPressed: false, reloadPressed: false };
    };
    const onVisibilityChange = () => { if (document.hidden) clearControls(); };
    const onContextMenu = (event: MouseEvent) => event.preventDefault();
    const onAuxClick = (event: MouseEvent) => { if (event.button === 1) event.preventDefault(); };
    window.addEventListener('blur', clearControls);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('auxclick', onAuxClick);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('contextmenu', onContextMenu);

    let animationFrame = 0;
    let lastTime = performance.now();
    let accumulator = 0;
    let stateAccumulator = 0;
    let inputAccumulator = 0;
    const hostClock = launch.role === 'host' ? new HostSimulationClock(INPUT_INTERVAL_MS, (now) => {
      const simulation = simulationRef.current!;
      inputRef.current = { ...inputRef.current, sequence: ++sequence, clientTime: Date.now(), aimAngle: quantizeAngle(renderer.getAimAngle()), aimPitch: quantizePitch(renderer.getAimPitch()) };
      simulation.setInput(launch.localPlayerId, inputRef.current);
      simulation.tick(INPUT_INTERVAL_MS);
      clearJumpInput();
      const snapshot = simulation.createSnapshot();
      publishSnapshot(snapshot, now);
      accumulator = 0;
      stateAccumulator += INPUT_INTERVAL_MS;
      if (stateAccumulator >= SNAPSHOT_INTERVAL_MS) {
        stateAccumulator %= SNAPSHOT_INTERVAL_MS;
        const state: MultiplayerStateFrame = { type: 'state', version: MULTIPLAYER_PROTOCOL_VERSION, tick: ++networkTickRef.current, sentAt: Date.now(), payload: snapshot };
        session.broadcastState(state, peerId => createInterestSnapshot(snapshot, launch.peerPlayerIds[peerId]));
        syncHud(snapshot);
      }
    }) : undefined;
    hostClock?.start();
    const frame = (now: number) => {
      const elapsed = Math.min(100, now - lastTime);
      lastTime = now;
      accumulator += elapsed;
      inputAccumulator += elapsed;
      if (stationOpenRef.current) clearControls();
      if (launch.role === 'guest') {
        while (inputAccumulator >= INPUT_INTERVAL_MS) {
          inputAccumulator -= INPUT_INTERVAL_MS;
          inputRef.current = { ...inputRef.current, sequence: ++sequence, clientTime: Date.now(), aimAngle: quantizeAngle(renderer.getAimAngle()), aimPitch: quantizePitch(renderer.getAimPitch()) };
          prediction.step(inputRef.current);
          session.sendInput(inputRef.current);
          clearJumpInput();
        }
      }
      let frameSnapshot = presentationSnapshot(now);
      if (frameSnapshot && launch.role === 'guest') frameSnapshot = prediction.present(frameSnapshot, inputRef.current, inputAccumulator, elapsed);
      if (frameSnapshot && launch.role === 'host' && snapshotRef.current?.matchState === 'active') {
        const local = snapshotRef.current.players.find(player => player.id === launch.localPlayerId);
        if (local?.lifeState === 'alive') {
          const motion = { ...local, verticalVelocity: 0, lastJumpSequence: -1, slideAngle: local.angle, ...local.motion };
          advancePlayerMovement(motion, { ...inputRef.current, jumpPressed: false }, accumulator);
          frameSnapshot = { ...frameSnapshot, players: frameSnapshot.players.map(player => player.id === local.id ? { ...player, x: motion.x, y: motion.y, z: motion.z } : player) };
        }
      }
      // Camera role switches are state transitions, not presentation values.
      // Source them from the latest network snapshot so the downed operator is
      // never selected for even one lingering interpolation frame.
      const presentationTargetId = isSpectator
        ? spectatorTargetRef.current
        : resolveDownedSpectatorTarget(snapshotRef.current);
      const latestLifeState = snapshotRef.current?.players.find(player => player.id === launch.localPlayerId)?.lifeState;
      renderer.render(frameSnapshot, launch.localPlayerId, elapsed, presentationTargetId, latestLifeState === 'alive');
      if (damageFlashExpiresAtRef.current > 0 && now > damageFlashExpiresAtRef.current + 40) {
        damageFlashExpiresAtRef.current = 0;
        if (damageFlashTimerRef.current !== null) {
          window.clearTimeout(damageFlashTimerRef.current);
          damageFlashTimerRef.current = null;
        }
        setDamageFlashKey(null);
      }
      animationFrame = requestAnimationFrame(frame);
    };
    animationFrame = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(animationFrame);
      hostClock?.stop();
      if (damageFlashTimerRef.current !== null) {
        window.clearTimeout(damageFlashTimerRef.current);
        damageFlashTimerRef.current = null;
      }
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('auxclick', onAuxClick);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('blur', clearControls);
      window.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('pointerlockchange', syncPointerLock);
      soundManager.stopTowerCharge();
      renderer.destroy();
      rendererRef.current = null;
      sessionCloseTimerRef.current = window.setTimeout(() => {
        session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'leave' });
        session.close();
        launch.hostedLobby?.close();
        launch.lobbyJoin?.close();
      }, 0);
    };
  }, [launch, controlScheme]);

  useEffect(() => {
    if (!combatNotice) return;
    const timeout = window.setTimeout(() => setCombatNotice(null), 850);
    return () => window.clearTimeout(timeout);
  }, [combatNotice]);

  useEffect(() => {
    if (launch.role === 'host' && hud.matchState !== 'active') launch.hostedLobby?.close();
  }, [hud.matchState, launch]);

  // Ambient gas and respirator breathing audio loop
  useEffect(() => {
    let timer: number;
    const tickAudio = () => {
      const local = snapshotRef.current?.players.find(player => player.id === launch.localPlayerId);
      const gas = snapshotRef.current?.gasZone;
      if (local && local.lifeState === 'alive') {
        const inGas = gas && Math.hypot(local.x - gas.x, local.y - gas.y) <= gas.radius;
        if (local.gasMaskHp > 0) {
          soundManager.playRespiratorBreathing();
        } else if (inGas) {
          soundManager.playToxicCough();
        }
      }
      timer = window.setTimeout(tickAudio, 4200);
    };
    timer = window.setTimeout(tickAudio, 2500);
    return () => window.clearTimeout(timer);
  }, [launch.localPlayerId]);

  const localSnapshot = matchSnapshot?.players.find(player => player.id === (isSpectator ? spectatorTargetRef.current : launch.localPlayerId));
  const gasZone = matchSnapshot?.gasZone;
  const isLocalInGas = Boolean(
    localSnapshot &&
    gasZone &&
    Math.hypot(localSnapshot.x - gasZone.x, localSnapshot.y - gasZone.y) <= gasZone.radius
  );
  const gasMaskHp = localSnapshot?.gasMaskHp || 0;
  const gasMaskMaxHp = localSnapshot?.gasMaskMaxHp || 150;
  const filterPercentage = Math.max(0, Math.min(100, Math.round((gasMaskHp / Math.max(1, gasMaskMaxHp)) * 100)));
  const hasGasMask = gasMaskHp > 0;
  const nearbyStation = !isSpectator && localSnapshot && matchSnapshot?.buyStations.find(station => Math.hypot(localSnapshot.x - station.x, localSnapshot.y - station.y) <= station.radius + 48);
  const revivingTarget = !isSpectator && localSnapshot?.lifeState === 'alive'
    ? matchSnapshot?.players.find(player => player.lifeState === 'downed' && player.reviverId === launch.localPlayerId)
    : undefined;
  const run = matchSnapshot?.run;
  const encounter = matchSnapshot?.encounter;
  const activeWeaponId = COOP_WEAPON_SLOTS[hud.selectedSlot];
  const activeWeapon = COOP_WEAPON_DETAILS[activeWeaponId];
  const activeWeaponState = hud.weapons[hud.selectedSlot];
  const spectatedSquadmate = matchSnapshot?.players.find(p => p.id === downedSpectatorTarget?.id);
  const activeReviver = hud.reviverId ? matchSnapshot?.players.find(p => p.id === hud.reviverId) : undefined;
  const squadmates = hud.squad.filter(player => player.id !== launch.localPlayerId);
  const objectiveHud = run ? (() => {
    const base = {
      title: run.objective?.title || run.boss?.name || run.notice,
      label: run.phase.replace('_', ' '),
      detail: '',
      progress: undefined as number | undefined,
      tone: 'cyan' as 'cyan' | 'rose' | 'amber' | 'emerald' | 'fuchsia',
    };
    if (run.boss) return { ...base, label: `Boss · Phase ${run.boss.phase}`, detail: `${Math.ceil(run.boss.health).toLocaleString()} HP`, progress: run.boss.health / Math.max(1, run.boss.maxHealth) * 100, tone: 'rose' as const };
    if (run.exfil) return { ...base, label: 'Extraction', detail: `${Math.ceil(run.exfil.remainingMs / 1000)}s`, progress: run.exfil.holdProgressMs / Math.max(1, run.exfil.holdRequiredMs) * 100, tone: 'amber' as const };
    if (run.objective) {
      const distance = localSnapshot ? `${Math.round(Math.hypot(run.objective.x - localSnapshot.x, run.objective.y - localSnapshot.y))}m` : '';
      const state = run.objective.kind === 'uplink'
        ? run.objective.contested ? 'Contested' : run.objective.occupants ? 'Uploading' : 'Reach uplink'
        : 'Target tracked';
      return { ...base, label: state, detail: distance, progress: run.objective.progress / Math.max(1, run.objective.required) * 100, tone: run.objective.contested ? 'rose' as const : 'emerald' as const };
    }
    if (run.insertionRemainingMs !== undefined && run.insertionDurationMs !== undefined) return { ...base, label: 'Insertion', detail: `${Math.ceil(run.insertionRemainingMs / 1000)}s`, progress: (1 - run.insertionRemainingMs / Math.max(1, run.insertionDurationMs)) * 100, tone: 'cyan' as const };
    if (encounter?.phase === 'combat') return { ...base, label: `Round ${encounter.round}`, detail: `${encounter.enemiesRemaining} hostiles`, progress: encounter.spawnedThisRound / Math.max(1, encounter.roundTotal) * 100, tone: 'fuchsia' as const };
    if (encounter?.phase === 'intermission') return { ...base, label: `Round ${encounter.round} clear`, detail: `${Math.ceil(encounter.intermissionRemainingMs / 1000)}s`, progress: (1 - encounter.intermissionRemainingMs / 20_000) * 100, tone: 'emerald' as const };
    return base;
  })() : null;

  // The station can be disabled, or the player can leave its interaction
  // radius, between network snapshots. Do not leave an invisible modal
  // swallowing mouse input in that case.
  useEffect(() => {
    if (!nearbyStation && stationOpenRef.current) setStationPanelOpen(false);
  }, [nearbyStation]);

  return (
    <div className="coop-arena absolute inset-0 z-[110] bg-[#05080e]">
      <div ref={sceneRef} className="absolute inset-0 h-full w-full" />
      {damageFlashKey !== null && <div key={damageFlashKey} className="coop-damage-flash" aria-hidden="true" />}
      {isLocalInGas && <div className="toxic-gas-screen" aria-hidden="true" />}
      {!isSpectator && hasGasMask && (
        <div className="gasmask-overlay" aria-hidden="true">
          <div className="gasmask-bezel" />
          <div className="gasmask-glass" />
          <div className="gasmask-condensation" />

          {/* Progressive crack decals as filter durability depletes (positioned away from HUD vitals) */}
          {filterPercentage < 65 && (
            <svg className="gasmask-crack absolute right-16 top-16 w-36 h-36 opacity-75 pointer-events-none" viewBox="0 0 100 100" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.2">
              <path d="M90,10 L70,25 L55,30 M70,25 L75,45 M55,30 L40,35 M70,25 L85,35" />
            </svg>
          )}
          {filterPercentage < 35 && (
            <svg className="gasmask-crack absolute left-8 top-1/2 -translate-y-1/2 w-40 h-40 opacity-80 pointer-events-none" viewBox="0 0 100 100" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.4">
              <path d="M10,20 L35,35 L45,55 L35,70 M35,35 L55,30 L70,40 M45,55 L65,65 M45,55 L35,45" />
            </svg>
          )}

          {/* Diegetic Visor HUD */}
          <div className="gasmask-hud">
            <div className="flex items-center justify-between gap-3 text-[9px]">
              <span className="font-bold flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: isLocalInGas ? '#4ade80' : '#22d3ee', boxShadow: `0 0 8px ${isLocalInGas ? '#4ade80' : '#22d3ee'}` }} />
                {isLocalInGas ? 'TOXIN SCRUBBER ACTIVE' : 'CBRN AIR PURIFIER'}
              </span>
              <span className="font-mono flex items-center gap-1.5">
                {filterPercentage < 15 && <span className="text-[8px] font-black text-rose-400 tracking-wider animate-pulse">CRITICAL</span>}
                <span>{filterPercentage}%</span>
              </span>
            </div>
            <div className="gasmask-hud__bar">
              <div
                className="gasmask-hud__fill"
                style={{
                  width: `${filterPercentage}%`,
                  backgroundColor: filterPercentage > 50 ? '#22d3ee' : filterPercentage > 20 ? '#fbbf24' : '#fb7185',
                  boxShadow: `0 0 8px ${filterPercentage > 50 ? '#22d3ee' : filterPercentage > 20 ? '#fbbf24' : '#fb7185'}`,
                }}
              />
            </div>
          </div>
        </div>
      )}
      <div className="coop-vitals pointer-events-none absolute z-50">
        <div className="coop-vitals__topline"><span>LV {hud.level}</span><span>{hud.kills} KILLS</span><span>{hud.players} LIVE</span></div>
        <div className="coop-vitals__health"><span>{Math.ceil(hud.health)}</span><div className="coop-meter"><i style={{ width: `${Math.max(0, Math.min(100, hud.health / Math.max(1, hud.maxHealth) * 100))}%` }} /></div></div>
        <div className="coop-vitals__lower"><span>XP {Math.floor(hud.experience / Math.max(1, hud.experienceToNextLevel) * 100)}%</span><span className="coop-vitals__currency">¤ {hud.coins}</span>{hud.cores > 0 && <span>{hud.cores} CORES</span>}</div>
        <div className="coop-xp"><i style={{ width: `${Math.max(0, Math.min(100, hud.experience / Math.max(1, hud.experienceToNextLevel) * 100))}%` }} /></div>
        {localSnapshot && (localSnapshot.armorHp > 0 || localSnapshot.gasMaskHp > 0 || localSnapshot.selfRevives > 0 || localSnapshot.passiveModules.length > 0) && (
          <div className="coop-vitals__equipment">
            {localSnapshot.armorHp > 0 && <span><ShieldPlus size={11} className="inline mr-1" /> {Math.ceil(localSnapshot.armorHp)} ARMOR</span>}
            {localSnapshot.gasMaskHp > 0 && <span className="text-emerald-300 font-bold ml-1.5">☣ MASK {Math.round((localSnapshot.gasMaskHp / localSnapshot.gasMaskMaxHp) * 100)}%</span>}
            {localSnapshot.selfRevives > 0 ? ' · REBOOT READY' : ''}
          </div>
        )}
        {hud.invulnerableRemainingMs > 0 && <div className="coop-vitals__shield">SHIELDED {Math.ceil(hud.invulnerableRemainingMs / 1000)}s</div>}
      </div>
      {squadmates.length > 0 && <div className="coop-squad pointer-events-none absolute z-50">
        {squadmates.map(player => {
          const status = player.lifeState === 'alive' ? `${Math.ceil(player.health)}/${Math.ceil(player.maxHealth)}` : player.lifeState === 'downed' ? (player.downedRemainingMs > 0 ? `DOWN ${Math.ceil(player.downedRemainingMs / 1000)}s` : 'DOWN · REVIVABLE') : 'OUT';
          return <div key={player.id} className={`coop-squadmate coop-squadmate--${player.lifeState}`}>
            <span className="coop-squadmate__signal" style={{ backgroundColor: player.color, color: player.color }} />
            <span className="coop-squadmate__name">{player.label}</span><span className="coop-squadmate__status">{status}</span>
            <span className="coop-squadmate__meter"><i style={{ width: `${player.lifeState === 'downed' ? Math.max(0, player.reviveProgressMs / 3000 * 100) : Math.max(0, player.health / Math.max(1, player.maxHealth) * 100)}%`, backgroundColor: player.lifeState === 'downed' ? '#fbbf24' : player.color }} /></span>
          </div>;
        })}
      </div>}
      {isSpectator && <div className="coop-spectating pointer-events-none absolute z-50" style={{ top: objectiveHud ? '82px' : '28px' }}><span>SPECTATING</span><b>{spectatorTarget?.label || 'Acquiring target'}</b><small>CLICK · NEXT PLAYER</small></div>}
      {!isSpectator && (hud.lifeState === 'downed' || hud.lifeState === 'eliminated') && <div className="coop-spectating pointer-events-none absolute z-50" style={{ top: objectiveHud ? '82px' : '28px' }}><span className={hud.lifeState === 'downed' ? 'text-amber-300 font-black' : 'text-rose-300 font-black'}>● {hud.lifeState === 'downed' ? 'DOWNED · SPECTATING' : 'ELIMINATED · SPECTATING'}</span><b style={{ color: spectatedSquadmate?.color || '#f0abfc' }}>{spectatedSquadmate?.label || downedSpectatorTarget?.label || 'SQUAD'}</b><small>LEFT CLICK · CYCLE SQUAD</small></div>}
      {objectiveHud && <div className={`coop-objective coop-objective--${objectiveHud.tone} pointer-events-none absolute z-50`}>
        <div className="coop-objective__meta"><span>{objectiveHud.label}</span><span>{objectiveHud.detail}</span></div>
        <div className="coop-objective__title">{objectiveHud.title}</div>
        {objectiveHud.progress !== undefined && <div className="coop-objective__meter"><i style={{ width: `${Math.max(0, Math.min(100, objectiveHud.progress))}%` }} /></div>}
      </div>}
      {combatNotice && <div className="pointer-events-none absolute left-1/2 top-[24%] z-50 -translate-x-1/2 text-center text-sm font-black uppercase tracking-[0.2em] drop-shadow-[0_0_12px_currentColor]" style={{ color: combatNotice.color }}>{combatNotice.text}</div>}
      {revivingTarget && <div className="pointer-events-none absolute left-1/2 top-[56%] z-20 w-[min(330px,calc(100vw-2rem))] -translate-x-1/2 border border-cyan-300/55 bg-black/80 px-4 py-3 text-center shadow-[0_0_24px_rgba(34,211,238,.18)] backdrop-blur-md"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100">Hold F · Reviving {revivingTarget.label}</div><div className="mt-2 h-2 overflow-hidden bg-cyan-950/80"><div className="h-full bg-cyan-300 transition-[width] duration-100" style={{ width: `${Math.max(0, revivingTarget.reviveProgressMs / 3000 * 100)}%` }} /></div><div className="mt-1 text-[9px] font-mono text-cyan-100/70">{Math.round(revivingTarget.reviveProgressMs / 3000 * 100)}%</div></div>}
      {!isSpectator && hud.lifeState === 'alive' && (hud.selectedSlot === 3 && hud.isAiming ? <div className="pointer-events-none absolute inset-0 z-10 rounded-full border-[min(17vw,220px)] border-black/90"><div className="absolute left-1/2 top-1/2 h-[64vh] w-px -translate-x-1/2 -translate-y-1/2 bg-white/70" /><div className="absolute left-1/2 top-1/2 h-px w-[64vh] -translate-x-1/2 -translate-y-1/2 bg-white/70" /><div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-fuchsia-100" /></div> : <div className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2"><span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-cyan-100/80" /><span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-cyan-100/80" /></div>)}
      {!isSpectator && hud.lifeState === 'alive' && matchSnapshot && localSnapshot && (
        <CoopReticleCompass
          localPlayer={localSnapshot}
          players={matchSnapshot.players}
          pings={matchSnapshot.pings}
          renderer={rendererRef.current}
        />
      )}
      {!isSpectator && hud.lifeState === 'alive' && activeWeapon && <div className="coop-weapons pointer-events-none absolute z-50">
        <div className="coop-weapons__name" style={{ color: activeWeapon.color }}><span>{activeWeapon.shortName}</span><small>LV {activeWeaponState?.level || 1}</small></div>
        <div className="coop-weapons__ammo"><b>{activeWeaponState?.magazineAmmo ?? '—'}</b><span>/ {activeWeaponState?.reserveAmmo ?? '—'}</span></div>
        <div className="coop-weapons__slots">{COOP_WEAPON_SLOTS.map((weaponId, index) => <span key={weaponId} data-selected={hud.selectedSlot === index}>{index + 1}</span>)}</div>
        {hud.isReloading && <div className="coop-weapons__reload">RELOADING</div>}
      </div>}
      {matchSnapshot && localSnapshot && <CoopMinimap snapshot={matchSnapshot} localPlayer={localSnapshot} />}
      {stationOpen && nearbyStation && <div className="absolute inset-0 z-[80] bg-black/55 backdrop-blur-[2px]" aria-hidden="true" />}
      {nearbyStation && <div
        role={stationOpen ? 'dialog' : undefined}
        aria-modal={stationOpen || undefined}
        aria-label={stationOpen ? 'Buy Station' : undefined}
        onMouseDown={event => event.stopPropagation()}
        onWheel={event => event.stopPropagation()}
        className={stationOpen
          ? 'absolute left-1/2 top-1/2 z-[90] flex h-[min(720px,calc(100vh-2rem))] w-[min(660px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden border border-cyan-200/55 bg-[#07111b]/98 p-5 shadow-[0_0_70px_rgba(34,211,238,.24)] backdrop-blur-xl'
          : 'absolute bottom-5 left-5 z-[85] w-[min(420px,calc(100vw-2.5rem))] border border-cyan-300/35 bg-[#07111b]/95 p-4 shadow-[0_0_28px_rgba(34,211,238,.14)] backdrop-blur-md'}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-cyan-200/20 pb-3">
          <div><div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-cyan-200"><ShoppingCart size={16} /> Buy Station online</div>{stationOpen && <div className="mt-1 text-[10px] font-mono uppercase tracking-wider text-white/45">Spend your personal credits · upgrades apply immediately</div>}</div>
          <div className="shrink-0 text-right"><div className="text-[9px] font-black uppercase tracking-wider text-white/45">Credits</div><div className="mt-0.5 font-mono text-sm text-amber-200"><Coins className="mr-1 inline" size={13} />{localSnapshot.coins}</div></div>
          <button onClick={() => { rendererRef.current?.exitPointerLock(); setStationPanelOpen(open => !open); }} className="border border-cyan-300/40 bg-cyan-400/10 px-3 py-1.5 text-[10px] font-black uppercase text-cyan-100 transition hover:bg-cyan-400/20">{stationOpen ? 'Close [F]' : 'Shop [F]'}</button>
        </div>
        {!stationOpen && <p className="mt-3 text-[10px] text-white/50">Press <span className="font-black text-cyan-100">F</span> to interact. It prioritizes reviving a nearby teammate.</p>}
        {stationOpen && <><div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-2">{nearbyStation.stock.map(itemId => {
          const item = COOP_SHOP_ITEMS[itemId];
          const passive = itemId in COOP_PASSIVE_BY_ID ? itemId as keyof typeof COOP_PASSIVE_BY_ID : undefined;
          const owned = passive && localSnapshot.passiveModules.find(module => module.id === passive);
          const cost = passive && owned ? passiveRankCost(passive, owned.rank) : item.cost;
          const isGasMask = itemId === 'gas_mask';
          const maskOwned = isGasMask && localSnapshot.gasMaskHp > 0;
          const maskFull = isGasMask && localSnapshot.gasMaskHp >= localSnapshot.gasMaskMaxHp;
          const affordable = localSnapshot.coins >= cost && !maskFull;
          let statusText = owned ? ` · Rank ${owned.rank + 1}` : '';
          if (isGasMask && maskOwned) {
            statusText = ` · ${Math.round((localSnapshot.gasMaskHp / localSnapshot.gasMaskMaxHp) * 100)}% FILTER`;
          }
          return <button key={itemId} disabled={!affordable} onClick={() => purchaseStationItem(nearbyStation.id, itemId)} className="flex w-full items-center justify-between gap-4 border border-white/10 bg-white/[0.035] px-4 py-3 text-left transition hover:border-cyan-200/50 hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-40"><span><span className="block text-xs font-bold text-white">{item.name}{statusText}</span><span className="mt-1 block text-[10px] leading-relaxed text-white/45">{item.description}</span></span><span className="shrink-0 text-xs font-mono text-amber-200"><Coins className="mr-1 inline" size={12} />{cost}</span></button>; })}</div>{stationMessage && <div className="mt-3 shrink-0 border border-cyan-200/20 bg-cyan-400/10 px-3 py-2 text-[10px] text-cyan-100">{stationMessage}</div>}<div className="mt-3 shrink-0 text-center text-[10px] text-white/40">Mouse wheel scrolls this list only · press <span className="font-black text-cyan-100">F</span> to close</div></>}
      </div>}
      {/* Downed Edge Danger Vignette */}
      {!isSpectator && hud.lifeState === 'downed' && (
        <div
          className="pointer-events-none absolute inset-0 z-20 bg-[radial-gradient(ellipse_at_center,transparent_52%,rgba(245,158,11,0.12)_78%,rgba(220,38,38,0.32)_100%)] animate-pulse"
          style={{ animationDuration: '3s' }}
        />
      )}
      {/* Eliminated Edge Vignette */}
      {!isSpectator && hud.lifeState === 'eliminated' && hud.matchState === 'active' && (
        <div className="pointer-events-none absolute inset-0 z-20 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(225,29,72,0.14)_82%,rgba(15,23,42,0.45)_100%)]" />
      )}

      {/* Downed Tactical Revive HUD (Anchored at bottom, never covering spectated operator) */}
      {!isSpectator && hud.lifeState === 'downed' && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-40 w-[min(540px,calc(100vw-2.5rem))] -translate-x-1/2">
          <div className="border border-amber-400/40 bg-[#060b13]/92 p-4 shadow-[0_0_35px_rgba(245,158,11,0.22)] backdrop-blur-xl">
            {/* Top row: Status badges & Bleedout / State info */}
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_#fbbf24] animate-ping" />
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-200">
                  Operative Down
                </span>
                {hud.reviverId ? (
                  <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-cyan-200 border border-cyan-400/40 animate-pulse">
                    Reviving
                  </span>
                ) : (localSnapshot?.selfRevives ?? 0) > 0 ? (
                  <span className="rounded bg-amber-500/25 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-200 border border-amber-400/50">
                    Reboot Available
                  </span>
                ) : null}
              </div>
              <div className="font-mono text-sm font-black text-amber-300">
                {hud.downedRemainingMs > 0 ? `${Math.ceil(hud.downedRemainingMs / 1000)}s BLEEDOUT` : 'REVIVABLE'}
              </div>
            </div>

            {/* Middle row: Revive status or instructions */}
            <div className="mt-2.5">
              {hud.reviverId ? (
                <div>
                  <div className="flex items-center justify-between text-[11px] font-bold text-cyan-100">
                    <span>
                      {activeReviver?.label || 'Teammate'} is reviving you…
                    </span>
                    <span className="font-mono text-cyan-200">{Math.round((hud.reviveProgressMs / 3000) * 100)}%</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded bg-cyan-950/80 border border-cyan-400/30">
                    <div
                      className="h-full bg-cyan-300 shadow-[0_0_12px_#67e8f9] transition-[width] duration-100"
                      style={{ width: `${Math.max(0, Math.min(100, (hud.reviveProgressMs / 3000) * 100))}%` }}
                    />
                  </div>
                </div>
              ) : (localSnapshot?.selfRevives ?? 0) > 0 ? (
                <div>
                  <div className="flex items-center justify-between text-[11px] font-bold text-amber-100">
                    <span>
                      Hold <span className="font-black text-amber-300 underline">[ F ]</span> to Self-Revive (Emergency Reboot)
                    </span>
                    {(localSnapshot?.selfReviveProgressMs ?? 0) > 0 && (
                      <span className="font-mono text-amber-200">
                        {Math.round(((localSnapshot?.selfReviveProgressMs ?? 0) / 6000) * 100)}%
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded bg-amber-950/80 border border-amber-400/30">
                    <div
                      className="h-full bg-amber-300 shadow-[0_0_12px_#f59e0b] transition-[width] duration-100"
                      style={{ width: `${Math.max(0, Math.min(100, ((localSnapshot?.selfReviveProgressMs ?? 0) / 6000) * 100))}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between text-[10px] text-white/60">
                  <span>A teammate must stand close and hold <span className="font-black text-cyan-200">[ F ]</span> for 3s</span>
                  <span className="text-white/40 font-mono text-[9px]">BODY PRESERVED</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Eliminated Spectating HUD (Anchored at bottom) */}
      {!isSpectator && hud.lifeState === 'eliminated' && hud.matchState === 'active' && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-40 w-[min(480px,calc(100vw-2.5rem))] -translate-x-1/2">
          <div className="border border-rose-400/40 bg-[#12060a]/92 p-3.5 text-center shadow-[0_0_35px_rgba(244,63,94,0.2)] backdrop-blur-xl">
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-rose-300">
              Operative Eliminated · Spectating Squad
            </div>
            <div className="mt-1 text-[11px] text-white/65">
              Watching <span className="font-bold text-fuchsia-200">{spectatedSquadmate?.label || downedSpectatorTarget?.label || 'your squad'}</span>. Left-click to cycle operators.
            </div>
          </div>
        </div>
      )}
      {hud.matchState !== 'active' && <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"><div className="w-[min(440px,calc(100vw-2rem))] border border-rose-300/45 bg-[#10070b] p-7 text-center shadow-[0_0_60px_rgba(244,63,94,.2)]"><div className="text-[10px] font-black uppercase tracking-[0.32em] text-rose-200">{hud.matchState === 'solo_defeat' ? 'Run ended' : 'Squad wiped'}</div><h2 className="mt-3 text-3xl font-black text-white">{hud.matchState === 'solo_defeat' ? 'SYSTEM FAILURE' : 'NO OPERATIVES REMAIN'}</h2><p className="mt-3 text-xs leading-relaxed text-white/60">Kills confirmed: {hud.kills}. {launch.role === 'host' ? 'Retry instantly without reconnecting the squad.' : 'Waiting for the host to start the next run.'}</p><div className="mt-6 flex justify-center gap-3">{launch.role === 'host' && <button onClick={retryRun} className="border border-emerald-300/55 bg-emerald-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-emerald-100 transition hover:bg-emerald-400/20">Retry run</button>}<button onClick={onExit} className="border border-cyan-300/45 bg-cyan-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-cyan-100 transition hover:bg-cyan-400/20">Return to lobby</button></div></div></div>}
      {matchSnapshot?.results && <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#03070c]/90 p-4 backdrop-blur-xl"><div className="w-[min(760px,calc(100vw-2rem))] border border-cyan-300/35 bg-[#07111b] p-6 shadow-[0_0_60px_rgba(34,211,238,.16)]"><div className="text-center"><div className={`text-[10px] font-black uppercase tracking-[0.32em] ${matchSnapshot.results.success ? 'text-cyan-200' : 'text-rose-200'}`}>{matchSnapshot.results.success ? 'Squad extracted' : 'Run failed'}</div><h2 className="mt-2 text-3xl font-black text-white">{matchSnapshot.results.success ? 'SECTOR BREACH COMPLETE' : 'SIGNAL LOST'}</h2><p className="mt-2 text-xs text-white/55">{Math.ceil(matchSnapshot.results.durationMs / 60000)} min · {matchSnapshot.results.contractsCompleted} contracts · {matchSnapshot.results.bossesDefeated} bosses</p></div><div className="mt-6 grid gap-3 sm:grid-cols-2">{matchSnapshot.results.players.map(player => <div key={player.playerId} className="border border-white/10 bg-white/[.035] p-3"><div className="flex items-center justify-between"><span className="font-black text-white" style={{ color: player.color }}>{player.label}</span><span className="text-[9px] font-black uppercase tracking-wider text-amber-200">{player.medal}</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px]"><span><b className="block text-white">{player.kills}</b><i className="not-italic text-white/45">Kills</i></span><span><b className="block text-white">{Math.round(player.firearmDamage + player.passiveDamage)}</b><i className="not-italic text-white/45">Damage</i></span><span><b className="block text-white">{player.revives}</b><i className="not-italic text-white/45">Revives</i></span></div></div>)}</div><div className="mt-6 text-center"><div className="mb-3 text-[10px] text-white/45">{launch.role === 'host' ? 'Retry starts a new run without reconnecting anyone.' : 'The host can retry without reconnecting anyone.'}</div>{launch.role === 'host' && <button onClick={retryRun} className="mr-3 border border-emerald-300/55 bg-emerald-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-emerald-100 hover:bg-emerald-400/20">Retry run</button>}<button onClick={onExit} className="border border-cyan-300/45 bg-cyan-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-cyan-100 hover:bg-cyan-400/20">Return to lobby</button></div></div></div>}
      {connectionStatus !== 'connected' && <div className={`absolute left-1/2 top-20 z-30 -translate-x-1/2 border px-4 py-3 text-center text-xs backdrop-blur-sm ${connectionStatus === 'reconnecting' ? 'border-amber-300/45 bg-amber-950/80 text-amber-100' : 'border-red-300/45 bg-red-950/80 text-red-100'}`}><div>{connectionMessage}</div>{connectionStatus === 'disconnected' && <button onClick={onExit} className="mt-2 border border-red-200/35 px-3 py-1 text-[10px] font-black uppercase tracking-wider hover:bg-red-300/10">Back to servers</button>}</div>}
      <button onClick={onExit} aria-label="Leave arena" className="coop-exit absolute"><ArrowLeft size={13} /><span>Leave</span></button>
    </div>
  );
}

/** Radial tactical compass around the center aim crosshair displaying real-time
 * bearing, distance, and status of squadmates (including emergency revive indicators for downed allies)
 * as well as active tactical and danger pings. */
function CoopReticleCompass({
  localPlayer,
  players,
  pings,
  renderer,
}: {
  localPlayer: CoopSnapshot['players'][number];
  players: CoopSnapshot['players'];
  pings?: CoopPing[];
  renderer: MultiplayerRendererBridge | null;
}) {
  const [liveAimAngle, setLiveAimAngle] = useState(
    renderer ? renderer.getAimAngle() : localPlayer.angle
  );

  useEffect(() => {
    let animId: number;
    const update = () => {
      if (renderer) {
        setLiveAimAngle(renderer.getAimAngle());
      }
      animId = requestAnimationFrame(update);
    };
    animId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animId);
  }, [renderer]);

  const teammates = players.filter(
    player => player.id !== localPlayer.id && player.lifeState !== 'eliminated'
  );
  const activePings = (pings || []).filter(ping => ping.playerId !== localPlayer.id);

  if (!teammates.length && !activePings.length) return null;

  const orbitRadius = 54;
  const badgeRadius = orbitRadius + 18;

  return (
    <div className="coop-reticle-compass">
      <div className="coop-reticle-ring" />
      {/* Squadmates */}
      {teammates.map(teammate => {
        const dx = teammate.x - localPlayer.x;
        const dy = teammate.y - localPlayer.y;
        const dist = Math.hypot(dx, dy);
        const distM = Math.max(1, Math.round(dist / 12));
        const worldAngle = Math.atan2(dy, dx);
        let relAngle = worldAngle - liveAimAngle;
        while (relAngle > Math.PI) relAngle -= 2 * Math.PI;
        while (relAngle < -Math.PI) relAngle += 2 * Math.PI;

        const screenAngle = relAngle - Math.PI / 2;
        const x = Math.cos(screenAngle) * orbitRadius;
        const y = Math.sin(screenAngle) * orbitRadius;
        const chevronRotationDeg = (relAngle * 180) / Math.PI;

        const isDowned = teammate.lifeState === 'downed';
        const color = isDowned ? '#fbbf24' : teammate.color;

        const badgeX = Math.cos(screenAngle) * badgeRadius;
        const badgeY = Math.sin(screenAngle) * badgeRadius;

        return (
          <div
            key={teammate.id}
            className={`coop-reticle-node ${isDowned ? 'coop-reticle-node--downed' : ''}`}
            style={{ color }}
          >
            <div
              className="coop-reticle-chevron"
              style={{
                transform: `translate(${x}px, ${y}px) rotate(${chevronRotationDeg}deg)`,
                color,
              }}
            />
            <div
              className="coop-reticle-badge"
              style={{
                transform: `translate(calc(-50% + ${badgeX}px), calc(-50% + ${badgeY}px))`,
                color,
              }}
            >
              {isDowned ? (
                <>
                  <span className="text-[8px] font-black text-amber-300">✚ REVIVE</span>
                  <span className="font-bold text-amber-100">{teammate.label.slice(0, 4)}</span>
                  <span className="font-mono text-[7px] text-amber-200/90">{distM}m</span>
                </>
              ) : (
                <>
                  <span>{teammate.label.slice(0, 4)}</span>
                  <span className="font-mono text-[7px] text-white/75">{distM}m</span>
                </>
              )}
            </div>
          </div>
        );
      })}

      {/* Tactical Pings (Distinct diamond markers) */}
      {activePings.map(ping => {
        const pdx = ping.x - localPlayer.x;
        const pdy = ping.y - localPlayer.y;
        const pdist = Math.hypot(pdx, pdy);
        const pdistM = Math.max(1, Math.round(pdist / 12));
        const pWorldAngle = Math.atan2(pdy, pdx);
        let pRelAngle = pWorldAngle - liveAimAngle;
        while (pRelAngle > Math.PI) pRelAngle -= 2 * Math.PI;
        while (pRelAngle < -Math.PI) pRelAngle += 2 * Math.PI;

        const pScreenAngle = pRelAngle - Math.PI / 2;
        const pmX = Math.cos(pScreenAngle) * orbitRadius;
        const pmY = Math.sin(pScreenAngle) * orbitRadius;

        const isDanger = ping.kind === 'enemy' || ping.kind === 'boss';
        const pColor = isDanger
          ? '#ef4444'
          : ping.kind === 'revive'
          ? '#fbbf24'
          : ping.kind === 'station'
          ? '#38bdf8'
          : ping.playerColor || '#22d3ee';

        const pBadgeX = Math.cos(pScreenAngle) * badgeRadius;
        const pBadgeY = Math.sin(pScreenAngle) * badgeRadius;

        const pingTag = isDanger
          ? '⚠️ DANGER'
          : ping.kind === 'station'
          ? '🛒 BUY'
          : ping.kind === 'revive'
          ? '✚ REVIVE'
          : '📍 PING';

        return (
          <div
            key={`reticle-ping-${ping.id}`}
            className={`coop-reticle-ping ${isDanger ? 'coop-reticle-ping--danger' : ''}`}
            style={{ color: pColor }}
          >
            <div
              className="coop-reticle-ping-diamond"
              style={{
                transform: `translate(${pmX}px, ${pmY}px) rotate(45deg)`,
                color: pColor,
              }}
            />
            <div
              className="coop-reticle-ping-badge"
              style={{
                transform: `translate(calc(-50% + ${pBadgeX}px), calc(-50% + ${pBadgeY}px))`,
                color: pColor,
              }}
            >
              <span>{pingTag}</span>
              <span className="font-mono text-[7px] text-white/80">{pdistM}m</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Snapshot-only tactical radar. It mirrors the single-player HUD's
 * camera-relative radar while adding squad and shared-run markers. */
function CoopMinimap({ snapshot, localPlayer }: { snapshot: CoopSnapshot; localPlayer: CoopSnapshot['players'][number] }) {
  const range = 2_400;
  const radarCenter = 56;
  const radarRadius = 47;
  const point = (x: number, y: number) => {
    const dx = x - localPlayer.x, dy = y - localPlayer.y;
    const angle = Math.atan2(dy, dx) - localPlayer.angle;
    const radius = Math.min(1, Math.hypot(dx, dy) / range) * radarRadius;
    return { left: radarCenter + Math.sin(angle) * radius, top: radarCenter - Math.cos(angle) * radius };
  };
  const threats = [...snapshot.enemies].sort((left, right) => Math.hypot(left.x - localPlayer.x, left.y - localPlayer.y) - Math.hypot(right.x - localPlayer.x, right.y - localPlayer.y)).slice(0, 40);
  const objective = snapshot.run.objective;
  const boss = snapshot.run.boss;
  const exfil = snapshot.run.exfil;
  return <div className="coop-minimap pointer-events-none absolute z-50">
    <div className="coop-minimap__disc relative overflow-hidden rounded-full border border-cyan-400/30 bg-black/65 shadow-[0_0_20px_rgba(0,240,255,.16)] backdrop-blur-sm">
      <div className="absolute inset-2 rounded-full border border-cyan-400/20" /><div className="absolute inset-7 rounded-full border border-cyan-400/15" />
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-cyan-400/25" /><div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-cyan-400/25" />
      {threats.map(enemy => { const position = point(enemy.x, enemy.y); return <span key={enemy.id} className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${enemy.type === 'titan' ? 'h-3 w-3 bg-rose-500 shadow-[0_0_10px_#fb7185]' : 'h-1.5 w-1.5 bg-rose-400/90'}`} style={position} />; })}
      {snapshot.gasZone && (() => {
        const gasCenter = point(snapshot.gasZone.x, snapshot.gasZone.y);
        const gasScreenRadius = Math.max(8, (snapshot.gasZone.radius / range) * radarRadius);
        return (
          <div
            title={`Toxic Gas Zone (${snapshot.gasZone.state.toUpperCase()})`}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-400/80 bg-emerald-500/15 shadow-[0_0_12px_rgba(74,222,128,0.35)] pointer-events-none"
            style={{
              left: `${gasCenter.left}px`,
              top: `${gasCenter.top}px`,
              width: `${gasScreenRadius * 2}px`,
              height: `${gasScreenRadius * 2}px`,
            }}
          >
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[8px] font-black text-emerald-300 opacity-80">
              ☣
            </span>
          </div>
        );
      })()}
      {snapshot.players.filter(player => player.id !== localPlayer.id && player.lifeState !== 'eliminated').map(player => { const position = point(player.x, player.y); return <span key={player.id} className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-white shadow-[0_0_7px_currentColor]" style={{ ...position, backgroundColor: player.color, color: player.color }} />; })}
      {snapshot.buyStations.filter(station => station.active).map(station => { const position = point(station.x, station.y); return <span key={station.id} title="Buy Station" className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-cyan-50 bg-cyan-300 shadow-[0_0_12px_#22d3ee]" style={position} />; })}
      {objective && <span title={objective.title} className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-100 bg-emerald-300 shadow-[0_0_12px_#6ee7b7]" style={point(objective.x, objective.y)} />}
      {boss && <span title={boss.name} className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-rose-100 bg-rose-500 shadow-[0_0_14px_#fb7185] animate-pulse" style={point(boss.x, boss.y)} />}
      {exfil && <span title="Extraction" className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-amber-100 bg-amber-300 shadow-[0_0_13px_#fbbf24]" style={point(exfil.x, exfil.y)} />}
      {snapshot.pings?.map(ping => {
        const position = point(ping.x, ping.y);
        const isDanger = ping.kind === 'enemy' || ping.kind === 'boss';
        const pingColor = isDanger
          ? '#ef4444'
          : ping.kind === 'revive'
          ? '#fbbf24'
          : ping.kind === 'station'
          ? '#38bdf8'
          : ping.playerColor || '#22d3ee';
        return (
          <div key={ping.id} className="absolute pointer-events-none" style={position}>
            <span
              className={`absolute -translate-x-1/2 -translate-y-1/2 ${isDanger ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5'} rotate-45 border border-white shadow-[0_0_12px_currentColor]`}
              style={{ backgroundColor: pingColor, color: pingColor }}
            />
            <span
              className={`absolute -translate-x-1/2 -translate-y-1/2 ${isDanger ? 'h-7 w-7 border-2' : 'h-5 w-5 border'} rounded-full border-current opacity-85 animate-ping`}
              style={{ color: pingColor }}
            />
          </div>
        );
      })}
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"><span className="h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_9px_#22d3ee]" /><span className="absolute -top-2 h-0 w-0 border-x-[3px] border-x-transparent border-b-[6px] border-b-white" /></div>
    </div>
  </div>;
}

function createInput(): MultiplayerInputFrame {
  return { type: 'input', version: MULTIPLAYER_PROTOCOL_VERSION, sequence: 0, clientTime: Date.now(), movement: 0, aimAngle: 0, aimPitch: quantizePitch(0), selectedSlot: 0, firing: false, fireActionId: 0, reloadPressed: false, aiming: false, sprinting: false, sliding: false, reviving: false, jumpPressed: false, dashPressed: false };
}

function parseSnapshot(payload: unknown): CoopSnapshot | null {
  if (!payload || typeof payload !== 'object') return null;
  const snapshot = payload as Partial<CoopSnapshot>;
  return typeof snapshot.tick === 'number' && typeof snapshot.kills === 'number'
    && Array.isArray(snapshot.players) && Array.isArray(snapshot.enemies) && Array.isArray(snapshot.projectiles)
    && Array.isArray(snapshot.gems) && Array.isArray(snapshot.items) && Array.isArray(snapshot.ammoCaches) && Array.isArray(snapshot.combatEvents)
    ? snapshot as CoopSnapshot
    : null;
}

function parsePlayer(value: unknown): CoopPlayerSeed | null {
  if (!value || typeof value !== 'object') return null;
  const player = value as Partial<CoopPlayerSeed>;
  return typeof player.id === 'string' && typeof player.label === 'string' && typeof player.color === 'string'
    ? { id: player.id, label: player.label.slice(0, 24), color: player.color }
    : null;
}

function parseStationPurchase(value: unknown): { stationId: number; itemId: CoopShopItemId } | null {
  if (!value || typeof value !== 'object') return null;
  const request = value as Partial<{ stationId: unknown; itemId: unknown }>;
  if (typeof request.stationId !== 'number' || !Number.isInteger(request.stationId) || typeof request.itemId !== 'string' || !(request.itemId in COOP_SHOP_ITEMS)) return null;
  return { stationId: request.stationId, itemId: request.itemId as CoopShopItemId };
}

function nextGuestColor(index: number) {
  return ['#f472b6', '#a78bfa', '#fbbf24'][index % 3];
}

function drawArena(canvas: HTMLCanvasElement | null, snapshot: CoopSnapshot | null, localPlayerId: string) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#07101c';
  ctx.fillRect(0, 0, rect.width, rect.height);
  if (!snapshot) {
    ctx.fillStyle = '#9ae6ff'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
    ctx.fillText('WAITING FOR HOST SNAPSHOT…', rect.width / 2, rect.height / 2);
    return;
  }
  const local = snapshot.players.find(player => player.id === localPlayerId) || snapshot.players[0];
  if (!local) return;
  const scale = getScale(rect.width, rect.height);
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  const project = (x: number, y: number) => ({ x: centerX + (x - local.x) * scale, y: centerY + (y - local.y) * scale });
  ctx.strokeStyle = 'rgba(34,211,238,0.10)'; ctx.lineWidth = 1;
  for (let x = (-local.x * scale) % 80; x < rect.width; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, rect.height); ctx.stroke(); }
  for (let y = (-local.y * scale) % 80; y < rect.height; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(rect.width, y); ctx.stroke(); }
  for (const hazard of snapshot.hazards || []) {
    const point = project(hazard.x, hazard.y);
    const progress = Math.max(0, Math.min(1, (snapshot.elapsedMs - hazard.startsAtMs) / Math.max(1, hazard.resolvesAtMs - hazard.startsAtMs)));
    ctx.save(); ctx.strokeStyle = hazard.color; ctx.fillStyle = `${hazard.color}18`; ctx.lineWidth = 2 + progress * 2; ctx.globalAlpha = .55 + progress * .4;
    ctx.beginPath(); ctx.arc(point.x, point.y, Math.max(8, hazard.radius * scale), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (hazard.kind === 'artillery' || hazard.kind === 'shockwave') {
      ctx.beginPath(); ctx.arc(point.x, point.y, Math.max(4, hazard.radius * scale * (hazard.kind === 'shockwave' ? progress : .42)), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  for (const projectile of snapshot.projectiles) drawProjectile(ctx, project(projectile.x, projectile.y), projectile, scale);
  ctx.shadowBlur = 0;
  for (const enemy of snapshot.enemies) {
    const point = project(enemy.x, enemy.y); drawFallbackEnemy(ctx, point, enemy, scale);
    if (enemy.health < enemy.maxHealth) {
      const width = enemy.type === 'titan' ? 34 : 24;
      ctx.fillStyle = '#24070d'; ctx.fillRect(point.x - width / 2, point.y - Math.max(15, enemy.radius * scale) - 8, width, 3);
      ctx.fillStyle = enemy.color; ctx.fillRect(point.x - width / 2, point.y - Math.max(15, enemy.radius * scale) - 8, width * (enemy.health / enemy.maxHealth), 3);
    }
  }
  for (const player of snapshot.players) {
    const point = project(player.x, player.y); ctx.strokeStyle = player.color; ctx.lineWidth = 4; ctx.shadowColor = player.color; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.moveTo(point.x, point.y); ctx.lineTo(point.x + Math.cos(player.angle) * 22, point.y + Math.sin(player.angle) * 22); ctx.stroke();
    ctx.fillStyle = player.color; ctx.beginPath(); ctx.arc(point.x, point.y, 15, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#041018'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.fillText(player.label, point.x, point.y + 3);
    ctx.fillStyle = '#031019'; ctx.fillRect(point.x - 18, point.y - 25, 36, 4); ctx.fillStyle = '#34d399'; ctx.fillRect(point.x - 18, point.y - 25, 36 * (player.health / player.maxHealth), 4);
  }
}

function drawFallbackEnemy(ctx: CanvasRenderingContext2D, point: { x: number; y: number }, enemy: CoopSnapshot['enemies'][number], scale: number) {
  const radius = Math.max(8, Math.min(28, enemy.radius * scale));
  ctx.save(); ctx.translate(point.x, point.y); ctx.rotate(enemy.facingAngle || 0);
  ctx.fillStyle = '#111b22'; ctx.strokeStyle = enemy.color; ctx.lineWidth = enemy.type === 'titan' ? 3 : 2;
  ctx.shadowColor = enemy.color; ctx.shadowBlur = enemy.hitFlashMs > 0 ? 20 : 9;
  ctx.beginPath();
  if (enemy.type === 'fast') { ctx.moveTo(radius, 0); ctx.lineTo(-radius, radius * .65); ctx.lineTo(-radius * .45, 0); ctx.lineTo(-radius, -radius * .65); }
  else if (enemy.type === 'tank') ctx.rect(-radius, -radius * .72, radius * 2, radius * 1.44);
  else if (enemy.type === 'ranged') { ctx.moveTo(radius, 0); ctx.lineTo(0, radius); ctx.lineTo(-radius, 0); ctx.lineTo(0, -radius); }
  else if (enemy.type === 'elite') for (let index = 0; index < 6; index++) { const angle = index / 6 * Math.PI * 2; const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius; if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  else if (enemy.type === 'phantom') { ctx.arc(0, 0, radius, Math.PI, 0); ctx.lineTo(radius, radius * .7); ctx.lineTo(radius * .35, radius * .3); ctx.lineTo(-radius * .35, radius * .7); ctx.lineTo(-radius, radius * .3); }
  else if (enemy.type === 'titan') for (let index = 0; index < 12; index++) { const angle = index / 12 * Math.PI * 2; const distance = index % 2 ? radius * .58 : radius; const x = Math.cos(angle) * distance, y = Math.sin(angle) * distance; if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  else ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = enemy.hitFlashMs > 0 ? '#ffffff' : enemy.color; ctx.beginPath(); ctx.arc(radius * .42, 0, Math.max(2, radius * .16), 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawProjectile(ctx: CanvasRenderingContext2D, point: { x: number; y: number }, projectile: CoopSnapshot['projectiles'][number], scale: number) {
  const weapon = COOP_WEAPON_DETAILS[projectile.weaponId];
  const color = weapon.color;
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(projectile.angle);

  switch (projectile.weaponId) {
    case 'plasma_gun': {
      // Glowing cyan plasma orb with a tight energy streak behind it
      const r = Math.max(4.5, projectile.radius * scale);
      // Streak / tail
      const tail = ctx.createLinearGradient(-r * 6, 0, 0, 0);
      tail.addColorStop(0, 'rgba(103,232,249,0)');
      tail.addColorStop(0.6, 'rgba(103,232,249,0.28)');
      tail.addColorStop(1, 'rgba(180,245,255,0.72)');
      ctx.fillStyle = tail;
      ctx.beginPath();
      ctx.moveTo(-r * 6, -r * 0.35);
      ctx.lineTo(0, -r * 0.55);
      ctx.lineTo(0, r * 0.55);
      ctx.lineTo(-r * 6, r * 0.35);
      ctx.fill();
      // Outer glow orb
      const outerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.2);
      outerGlow.addColorStop(0, 'rgba(180,245,255,0.55)');
      outerGlow.addColorStop(0.5, 'rgba(103,232,249,0.30)');
      outerGlow.addColorStop(1, 'rgba(103,232,249,0)');
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.fillStyle = outerGlow;
      ctx.beginPath();
      ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
      ctx.fill();
      // Core orb
      const core = ctx.createRadialGradient(-r * 0.25, -r * 0.25, 0, 0, 0, r);
      core.addColorStop(0, '#ffffff');
      core.addColorStop(0.35, '#b4f5ff');
      core.addColorStop(1, '#67e8f9');
      ctx.shadowBlur = 24;
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'assault_rifle': {
      // Slim elongated tracer with a blazing white-hot core
      const r = Math.max(3, projectile.radius * scale);
      // Long outer glow trail
      const outerTrail = ctx.createLinearGradient(-r * 9, 0, r * 2.5, 0);
      outerTrail.addColorStop(0, 'rgba(52,211,153,0)');
      outerTrail.addColorStop(0.55, 'rgba(52,211,153,0.18)');
      outerTrail.addColorStop(1, 'rgba(167,243,208,0.65)');
      ctx.fillStyle = outerTrail;
      ctx.beginPath();
      ctx.ellipse(-r * 3.5, 0, r * 5.5, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      // Bright needle body
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      const needle = ctx.createLinearGradient(-r * 5, 0, r * 2.5, 0);
      needle.addColorStop(0, 'rgba(52,211,153,0)');
      needle.addColorStop(0.4, '#34d399');
      needle.addColorStop(0.88, '#a7f3d0');
      needle.addColorStop(1, '#ffffff');
      ctx.fillStyle = needle;
      ctx.beginPath();
      ctx.moveTo(-r * 5, -r * 0.32);
      ctx.lineTo(r * 2.5, -r * 0.18);
      ctx.lineTo(r * 2.5, r * 0.18);
      ctx.lineTo(-r * 5, r * 0.32);
      ctx.fill();
      // Hot-white core line
      ctx.shadowBlur = 20;
      ctx.strokeStyle = '#e0fff5';
      ctx.lineWidth = Math.max(1, r * 0.28);
      ctx.beginPath();
      ctx.moveTo(-r * 2, 0);
      ctx.lineTo(r * 2.5, 0);
      ctx.stroke();
      break;
    }
    case 'combat_shotgun': {
      // Wide smoldering pellet with a short smoky orange burst
      const r = Math.max(5, projectile.radius * scale * 1.6);
      // Smoke smear behind
      const smoke = ctx.createLinearGradient(-r * 4, 0, 0, 0);
      smoke.addColorStop(0, 'rgba(251,146,60,0)');
      smoke.addColorStop(0.5, 'rgba(251,146,60,0.14)');
      smoke.addColorStop(1, 'rgba(253,186,116,0.45)');
      ctx.fillStyle = smoke;
      ctx.beginPath();
      ctx.ellipse(-r * 2, 0, r * 2, r * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      // Outer glow ring
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.9);
      glow.addColorStop(0, 'rgba(253,186,116,0.5)');
      glow.addColorStop(0.6, 'rgba(251,146,60,0.22)');
      glow.addColorStop(1, 'rgba(251,146,60,0)');
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.9, 0, Math.PI * 2);
      ctx.fill();
      // Pellet core — squashed circle (wide pellet shape)
      const pellet = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r);
      pellet.addColorStop(0, '#fff7ed');
      pellet.addColorStop(0.3, '#fed7aa');
      pellet.addColorStop(1, '#fb923c');
      ctx.shadowBlur = 20;
      ctx.fillStyle = pellet;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'sniper_rifle': {
      // Long needle with blinding bright core, extended ghostly light trail
      const r = Math.max(3, projectile.radius * scale);
      // Very long ghost trail
      const ghostTrail = ctx.createLinearGradient(-r * 18, 0, 0, 0);
      ghostTrail.addColorStop(0, 'rgba(196,181,253,0)');
      ghostTrail.addColorStop(0.6, 'rgba(196,181,253,0.12)');
      ghostTrail.addColorStop(1, 'rgba(221,214,254,0.55)');
      ctx.fillStyle = ghostTrail;
      ctx.beginPath();
      ctx.moveTo(-r * 18, -r * 0.22);
      ctx.lineTo(r * 3.5, -r * 0.45);
      ctx.lineTo(r * 3.5, r * 0.45);
      ctx.lineTo(-r * 18, r * 0.22);
      ctx.fill();
      // Mid glow
      const midGlow = ctx.createLinearGradient(-r * 7, 0, r * 3.5, 0);
      midGlow.addColorStop(0, 'rgba(196,181,253,0)');
      midGlow.addColorStop(0.3, 'rgba(196,181,253,0.35)');
      midGlow.addColorStop(1, 'rgba(233,213,255,0.8)');
      ctx.shadowColor = color;
      ctx.shadowBlur = 22;
      ctx.fillStyle = midGlow;
      ctx.beginPath();
      ctx.moveTo(-r * 7, -r * 0.35);
      ctx.lineTo(r * 3.5, -r * 0.22);
      ctx.lineTo(r * 3.5, r * 0.22);
      ctx.lineTo(-r * 7, r * 0.35);
      ctx.fill();
      // White-hot penetrator tip
      ctx.shadowBlur = 30;
      ctx.shadowColor = '#ffffff';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.5, r * 0.38);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r * 2, 0);
      ctx.lineTo(r * 3.5, 0);
      ctx.stroke();
      // Violet glow tip dot
      const tip = ctx.createRadialGradient(r * 2.5, 0, 0, r * 2.5, 0, r * 1.2);
      tip.addColorStop(0, '#ffffff');
      tip.addColorStop(0.4, '#ede9fe');
      tip.addColorStop(1, 'rgba(196,181,253,0)');
      ctx.fillStyle = tip;
      ctx.beginPath();
      ctx.arc(r * 2.5, 0, r * 1.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'smg': {
      // Tiny rapid-fire dart with a fizzing neon-lime tail
      const r = Math.max(3, projectile.radius * scale);
      // Sparky fizz tail — multiple offset streaks for rapid-fire feel
      for (let i = 0; i < 3; i++) {
        const offset = (i - 1) * r * 0.38;
        const sparkLen = r * (3.5 + i * 1.1);
        const spark = ctx.createLinearGradient(-sparkLen, offset, 0, offset);
        spark.addColorStop(0, 'rgba(163,230,53,0)');
        spark.addColorStop(0.7, 'rgba(163,230,53,0.22)');
        spark.addColorStop(1, 'rgba(217,249,157,0.6)');
        ctx.fillStyle = spark;
        ctx.fillRect(-sparkLen, offset - r * 0.18, sparkLen, r * 0.36);
      }
      // Outer glow
      const smgGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2);
      smgGlow.addColorStop(0, 'rgba(217,249,157,0.48)');
      smgGlow.addColorStop(0.5, 'rgba(163,230,53,0.22)');
      smgGlow.addColorStop(1, 'rgba(163,230,53,0)');
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = smgGlow;
      ctx.beginPath();
      ctx.arc(0, 0, r * 2, 0, Math.PI * 2);
      ctx.fill();
      // Compact dart body
      ctx.shadowBlur = 16;
      const dart = ctx.createLinearGradient(-r * 2.5, 0, r * 1.5, 0);
      dart.addColorStop(0, '#84cc16');
      dart.addColorStop(0.6, '#bef264');
      dart.addColorStop(1, '#f7fee7');
      ctx.fillStyle = dart;
      ctx.beginPath();
      ctx.moveTo(-r * 2.5, -r * 0.45);
      ctx.lineTo(r * 1.5, -r * 0.28);
      ctx.lineTo(r * 1.5, r * 0.28);
      ctx.lineTo(-r * 2.5, r * 0.45);
      ctx.fill();
      break;
    }
    default: {
      // Fallback: simple glowing pill for any future weapon
      const r = Math.max(4, projectile.radius * scale);
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 2, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      const trail = ctx.createLinearGradient(-r * 5, 0, -r, 0);
      trail.addColorStop(0, `${color}00`);
      trail.addColorStop(1, `${color}66`);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = trail;
      ctx.fillRect(-r * 5, -r * 0.22, r * 4, r * 0.44);
    }
  }

  ctx.restore();
}

function visibleWeaponSlots(selectedSlot: number) {
  const start = Math.max(0, Math.min(COOP_WEAPON_SLOTS.length - 5, selectedSlot - 2));
  return Array.from({ length: Math.min(5, COOP_WEAPON_SLOTS.length) }, (_, index) => start + index);
}

function getScale(width: number, height: number) {
  return Math.max(0.3, Math.min(0.52, Math.min(width, height) / 1500));
}

function incomingDirection(player: CoopSnapshot['players'][number] | undefined, event: CoopSnapshot['combatEvents'][number]) {
  if (!player) return 'INCOMING';
  const sourceAngle = Math.atan2(event.y - player.y, event.x - player.x);
  const relative = Math.atan2(Math.sin(sourceAngle - player.angle), Math.cos(sourceAngle - player.angle));
  if (Math.abs(relative) < Math.PI / 4) return 'FRONT';
  if (Math.abs(relative) > Math.PI * .75) return 'REAR';
  return relative > 0 ? 'RIGHT' : 'LEFT';
}
