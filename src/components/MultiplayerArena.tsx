import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Coins, ShoppingCart, ShieldPlus } from 'lucide-react';
import { COOP_REVIVE_RANGE, COOP_WEAPON_DETAILS, COOP_WEAPON_SLOTS, CoopPlayerSeed, CoopSimulation, CoopSnapshot, quantizeAngle, quantizePitch } from '../game/multiplayer/CoopSimulation';
import { MultiplayerRendererBridge } from '../game/multiplayer/MultiplayerRendererBridge';
import { interpolateCoopSnapshot } from '../game/multiplayer/snapshotInterpolation';
import { soundManager } from '../game/SoundManager';
import { MultiplayerLaunch } from './ManualMultiplayerSetup';
import { MultiplayerInputFrame, MultiplayerStateFrame, MULTIPLAYER_PROTOCOL_VERSION } from '../game/multiplayer/protocol';
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
  const displayedCombatEventsRef = useRef(new Set<number>());
  const sessionCloseTimerRef = useRef(0);
  const spectatorTargetRef = useRef<string | null>(null);
  const downedSpectatorTargetRef = useRef<string | null>(null);
  // Input listeners are installed once for the arena. Keep the station's
  // focus state in a ref too, so those listeners can immediately stop sending
  // look/fire/wheel input while the UI is open.
  const stationOpenRef = useRef(false);
  const [hud, setHud] = useState({ players: launch.players.length, kills: 0, tick: 0, connected: true, selectedSlot: 0, weaponLevel: 1, health: 100, maxHealth: 100, level: 1, experience: 0, experienceToNextLevel: 120, coins: 0, cores: 0, weapons: [] as CoopSnapshot['players'][number]['weaponStates'], isReloading: false, isAiming: false, actionEndsAt: undefined as number | undefined, lifeState: 'alive' as CoopSnapshot['players'][number]['lifeState'], downedRemainingMs: 0, reviveProgressMs: 0, reviverId: undefined as string | undefined, invulnerableRemainingMs: 0, matchState: 'active' as CoopSnapshot['matchState'], squad: [] as Array<Pick<CoopSnapshot['players'][number], 'id' | 'label' | 'color' | 'health' | 'maxHealth' | 'lifeState' | 'downedRemainingMs' | 'reviveProgressMs' | 'reviverId'>> });
  const [combatNotice, setCombatNotice] = useState<{ text: string; color: string } | null>(null);
  const [damageFlash, setDamageFlash] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('connected');
  const [connectionMessage, setConnectionMessage] = useState(launch.role === 'host' ? 'Players can join your match at any time.' : 'Connected');
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
    if (local?.lifeState !== 'downed') {
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
      for (const event of snapshot.combatEvents) {
        if (displayedCombatEventsRef.current.has(event.id)) continue;
        displayedCombatEventsRef.current.add(event.id);
        if (displayedCombatEventsRef.current.size > 320) displayedCombatEventsRef.current.clear();
        if (event.playerId && event.playerId !== launch.localPlayerId && event.killedByPlayerId !== launch.localPlayerId) continue;
        if (event.kind === 'enemy_hit' && event.amount) setCombatNotice({ text: `HIT ${Math.round(event.amount)}`, color: '#f8fafc' });
        else if (event.kind === 'enemy_killed') setCombatNotice({ text: 'KILL CONFIRMED', color: event.color || '#fb7185' });
        else if (event.kind === 'pickup_collected') setCombatNotice({ text: event.itemType ? `+ ${event.itemType.replace('_', ' ').toUpperCase()}` : `+ ${Math.round(event.amount || 0)} XP`, color: event.color || '#67e8f9' });
        else if (event.kind === 'level_up') setCombatNotice({ text: `LEVEL ${event.amount}`, color: '#fde047' });
        else if (event.kind === 'weapon_upgraded') setCombatNotice({ text: `${COOP_WEAPON_DETAILS[event.weaponId || 'plasma_gun'].name.toUpperCase()} LV ${event.amount} — DAMAGE +10%`, color: event.color || '#67e8f9' });
        else if (event.kind === 'ammo_collected') setCombatNotice({ text: `AMMO +${event.amount}`, color: event.color || '#67e8f9' });
        else if (event.kind === 'reload_started') setCombatNotice({ text: 'RELOADING', color: '#f8fafc' });
        else if (event.kind === 'empty_fire') setCombatNotice({ text: 'EMPTY — RELOAD', color: '#fca5a5' });
        else if (event.kind === 'player_damaged' && event.playerId === launch.localPlayerId) { const local = snapshot.players.find(player => player.id === launch.localPlayerId); setCombatNotice({ text: `${incomingDirection(local, event)} HIT −${Math.max(1, Math.round(event.amount || 0))}`, color: '#fda4af' }); setDamageFlash(true); }
        else if (event.kind === 'player_downed' && event.playerId === launch.localPlayerId) setCombatNotice({ text: 'YOU ARE DOWNED', color: '#fb7185' });
        else if (event.kind === 'player_revived' && event.playerId === launch.localPlayerId) setCombatNotice({ text: 'REVIVED — SHIELDS UP', color: '#5eead4' });
        else if (event.kind === 'revive_started' && event.playerId === launch.localPlayerId) setCombatNotice({ text: 'TEAMMATE REVIVING YOU', color: '#a5f3fc' });
        else if (event.kind === 'boss_ability') setCombatNotice({ text: event.amount ? `BOSS PHASE ${event.amount}` : 'BOSS ATTACK — MOVE', color: event.color || '#fda4af' });
        else if (event.kind === 'station_online') setCombatNotice({ text: 'BUY STATION ONLINE', color: '#67e8f9' });
        else if (event.kind === 'exfil_deployed') setCombatNotice({ text: 'EXFILL BEACON DEPLOYED', color: '#fbbf24' });
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
      const restarted = timeline.current && snapshot.tick < timeline.current.tick;
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
      const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return;
      if (isSpectator) return;
      // Reload can be the first interaction in an arena, before the player
      // clicks to lock the mouse. Keyboard gestures are equally valid for
      // resuming Web Audio, so make that first R press audible too.
      soundManager.activate();
      if (event.code === 'Space') {
        event.preventDefault();
        if (!event.repeat) inputRef.current = { ...inputRef.current, sequence: ++sequence, clientTime: Date.now(), jumpPressed: true };
        return;
      }
      const key = event.key.toLowerCase();
      if (stationOpenRef.current && key !== 'f') return;
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
      if (lifeState === 'downed') {
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
      if (snapshotRef.current?.players.find(player => player.id === launch.localPlayerId)?.lifeState === 'downed') {
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
    window.addEventListener('blur', clearControls);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
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
      animationFrame = requestAnimationFrame(frame);
    };
    animationFrame = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(animationFrame);
      hostClock?.stop();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('blur', clearControls);
      window.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('pointerlockchange', syncPointerLock);
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
    if (!damageFlash) return;
    const timeout = window.setTimeout(() => setDamageFlash(false), 180);
    return () => window.clearTimeout(timeout);
  }, [damageFlash]);

  useEffect(() => {
    if (launch.role === 'host' && hud.matchState !== 'active') launch.hostedLobby?.close();
  }, [hud.matchState, launch]);

  const localSnapshot = matchSnapshot?.players.find(player => player.id === (isSpectator ? spectatorTargetRef.current : launch.localPlayerId));
  const nearbyStation = !isSpectator && localSnapshot && matchSnapshot?.buyStations.find(station => Math.hypot(localSnapshot.x - station.x, localSnapshot.y - station.y) <= station.radius + 48);
  const revivingTarget = !isSpectator && localSnapshot?.lifeState === 'alive'
    ? matchSnapshot?.players.find(player => player.lifeState === 'downed' && player.reviverId === launch.localPlayerId)
    : undefined;
  const run = matchSnapshot?.run;
  const encounter = matchSnapshot?.encounter;
  const activeWeaponId = COOP_WEAPON_SLOTS[hud.selectedSlot];
  const activeWeapon = COOP_WEAPON_DETAILS[activeWeaponId];
  const activeWeaponState = hud.weapons[hud.selectedSlot];
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
      {damageFlash && <div className="pointer-events-none absolute inset-0 z-20 border-[min(8vw,100px)] border-rose-500/35 bg-rose-500/10 animate-pulse" />}
      <div className="coop-vitals pointer-events-none absolute">
        <div className="coop-vitals__topline"><span>LV {hud.level}</span><span>{hud.kills} KILLS</span><span>{hud.players} LIVE</span></div>
        <div className="coop-vitals__health"><span>{Math.ceil(hud.health)}</span><div className="coop-meter"><i style={{ width: `${Math.max(0, Math.min(100, hud.health / Math.max(1, hud.maxHealth) * 100))}%` }} /></div></div>
        <div className="coop-vitals__lower"><span>XP {Math.floor(hud.experience / Math.max(1, hud.experienceToNextLevel) * 100)}%</span><span className="coop-vitals__currency">¤ {hud.coins}</span>{hud.cores > 0 && <span>{hud.cores} CORES</span>}</div>
        <div className="coop-xp"><i style={{ width: `${Math.max(0, Math.min(100, hud.experience / Math.max(1, hud.experienceToNextLevel) * 100))}%` }} /></div>
        {localSnapshot && (localSnapshot.armorHp > 0 || localSnapshot.selfRevives > 0 || localSnapshot.passiveModules.length > 0) && <div className="coop-vitals__equipment"><ShieldPlus size={11} /> {Math.ceil(localSnapshot.armorHp)} ARMOR{localSnapshot.selfRevives > 0 ? ' · REBOOT READY' : ''}</div>}
        {hud.invulnerableRemainingMs > 0 && <div className="coop-vitals__shield">SHIELDED {Math.ceil(hud.invulnerableRemainingMs / 1000)}s</div>}
      </div>
      {squadmates.length > 0 && <div className="coop-squad pointer-events-none absolute">
        {squadmates.map(player => {
          const status = player.lifeState === 'alive' ? `${Math.ceil(player.health)}/${Math.ceil(player.maxHealth)}` : player.lifeState === 'downed' ? (player.downedRemainingMs > 0 ? `DOWN ${Math.ceil(player.downedRemainingMs / 1000)}s` : 'DOWN · REVIVABLE') : 'OUT';
          return <div key={player.id} className={`coop-squadmate coop-squadmate--${player.lifeState}`}>
            <span className="coop-squadmate__signal" style={{ backgroundColor: player.color, color: player.color }} />
            <span className="coop-squadmate__name">{player.label}</span><span className="coop-squadmate__status">{status}</span>
            <span className="coop-squadmate__meter"><i style={{ width: `${player.lifeState === 'downed' ? Math.max(0, player.reviveProgressMs / 3000 * 100) : Math.max(0, player.health / Math.max(1, player.maxHealth) * 100)}%`, backgroundColor: player.lifeState === 'downed' ? '#fbbf24' : player.color }} /></span>
          </div>;
        })}
      </div>}
      {isSpectator && <div className="coop-spectating pointer-events-none absolute"><span>SPECTATING</span><b>{spectatorTarget?.label || 'Acquiring target'}</b><small>CLICK · NEXT PLAYER</small></div>}
      {objectiveHud && <div className={`coop-objective coop-objective--${objectiveHud.tone} pointer-events-none absolute`}>
        <div className="coop-objective__meta"><span>{objectiveHud.label}</span><span>{objectiveHud.detail}</span></div>
        <div className="coop-objective__title">{objectiveHud.title}</div>
        {objectiveHud.progress !== undefined && <div className="coop-objective__meter"><i style={{ width: `${Math.max(0, Math.min(100, objectiveHud.progress))}%` }} /></div>}
      </div>}
      {combatNotice && <div className="pointer-events-none absolute left-1/2 top-[43%] -translate-x-1/2 text-center text-sm font-black uppercase tracking-[0.2em] drop-shadow-[0_0_12px_currentColor]" style={{ color: combatNotice.color }}>{combatNotice.text}</div>}
      {revivingTarget && <div className="pointer-events-none absolute left-1/2 top-[56%] z-20 w-[min(330px,calc(100vw-2rem))] -translate-x-1/2 border border-cyan-300/55 bg-black/80 px-4 py-3 text-center shadow-[0_0_24px_rgba(34,211,238,.18)] backdrop-blur-md"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100">Hold F · Reviving {revivingTarget.label}</div><div className="mt-2 h-2 overflow-hidden bg-cyan-950/80"><div className="h-full bg-cyan-300 transition-[width] duration-100" style={{ width: `${Math.max(0, revivingTarget.reviveProgressMs / 3000 * 100)}%` }} /></div><div className="mt-1 text-[9px] font-mono text-cyan-100/70">{Math.round(revivingTarget.reviveProgressMs / 3000 * 100)}%</div></div>}
      {!isSpectator && (hud.selectedSlot === 3 && hud.isAiming ? <div className="pointer-events-none absolute inset-0 z-10 rounded-full border-[min(17vw,220px)] border-black/90"><div className="absolute left-1/2 top-1/2 h-[64vh] w-px -translate-x-1/2 -translate-y-1/2 bg-white/70" /><div className="absolute left-1/2 top-1/2 h-px w-[64vh] -translate-x-1/2 -translate-y-1/2 bg-white/70" /><div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-fuchsia-100" /></div> : <div className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2"><span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-cyan-100/80" /><span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-cyan-100/80" /></div>)}
      {!isSpectator && activeWeapon && <div className="coop-weapons pointer-events-none absolute">
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
        {stationOpen && <><div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-2">{nearbyStation.stock.map(itemId => { const item = COOP_SHOP_ITEMS[itemId]; const passive = itemId in COOP_PASSIVE_BY_ID ? itemId as keyof typeof COOP_PASSIVE_BY_ID : undefined; const owned = passive && localSnapshot.passiveModules.find(module => module.id === passive); const cost = passive && owned ? passiveRankCost(passive, owned.rank) : item.cost; const affordable = localSnapshot.coins >= cost; return <button key={itemId} disabled={!affordable} onClick={() => purchaseStationItem(nearbyStation.id, itemId)} className="flex w-full items-center justify-between gap-4 border border-white/10 bg-white/[0.035] px-4 py-3 text-left transition hover:border-cyan-200/50 hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-40"><span><span className="block text-xs font-bold text-white">{item.name}{owned ? ` · Rank ${owned.rank + 1}` : ''}</span><span className="mt-1 block text-[10px] leading-relaxed text-white/45">{item.description}</span></span><span className="shrink-0 text-xs font-mono text-amber-200"><Coins className="mr-1 inline" size={12} />{cost}</span></button>; })}</div>{stationMessage && <div className="mt-3 shrink-0 border border-cyan-200/20 bg-cyan-400/10 px-3 py-2 text-[10px] text-cyan-100">{stationMessage}</div>}<div className="mt-3 shrink-0 text-center text-[10px] text-white/40">Mouse wheel scrolls this list only · press <span className="font-black text-cyan-100">F</span> to close</div></>}
      </div>}
      {!isSpectator && hud.lifeState === 'downed' && <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/35"><div className="w-[min(420px,calc(100vw-2rem))] border border-amber-300/50 bg-black/80 p-6 text-center backdrop-blur-md"><div className="text-xs font-black uppercase tracking-[0.3em] text-amber-200">You are downed</div><div className="mt-3 text-4xl font-black text-white">{hud.downedRemainingMs > 0 ? `${Math.ceil(hud.downedRemainingMs / 1000)}s` : 'REVIVABLE'}</div><div className="mt-3 text-xs text-white/60">Watching <span className="font-black text-fuchsia-200">{downedSpectatorTarget?.label || 'your squad'}</span> in third person. Left click cycles living teammates.</div><div className="mt-2 text-xs text-white/60">A teammate must stand close and hold <span className="font-black text-cyan-200">F</span> for 3 seconds. Your body remains until the squad is wiped.</div>{hud.reviverId && <div className="mt-3 text-[10px] font-bold uppercase tracking-wider text-emerald-200">Revive in progress · {Math.round(hud.reviveProgressMs / 3000 * 100)}%</div>}<div className="mt-2 h-1.5 overflow-hidden bg-white/10"><div className="h-full bg-cyan-300 transition-[width]" style={{ width: `${Math.max(0, hud.reviveProgressMs / 3000 * 100)}%` }} /></div></div></div>}
      {!isSpectator && hud.lifeState === 'eliminated' && hud.matchState === 'active' && <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/45"><div className="border border-rose-300/40 bg-black/80 px-6 py-5 text-center backdrop-blur-md"><div className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">Eliminated</div><div className="mt-3 text-xs text-white/60">Your squad can still finish the encounter.</div></div></div>}
      {hud.matchState !== 'active' && <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"><div className="w-[min(440px,calc(100vw-2rem))] border border-rose-300/45 bg-[#10070b] p-7 text-center shadow-[0_0_60px_rgba(244,63,94,.2)]"><div className="text-[10px] font-black uppercase tracking-[0.32em] text-rose-200">{hud.matchState === 'solo_defeat' ? 'Run ended' : 'Squad wiped'}</div><h2 className="mt-3 text-3xl font-black text-white">{hud.matchState === 'solo_defeat' ? 'SYSTEM FAILURE' : 'NO OPERATIVES REMAIN'}</h2><p className="mt-3 text-xs leading-relaxed text-white/60">Kills confirmed: {hud.kills}. {launch.role === 'host' ? 'Retry instantly without reconnecting the squad.' : 'Waiting for the host to start the next run.'}</p><div className="mt-6 flex justify-center gap-3">{launch.role === 'host' && <button onClick={retryRun} className="border border-emerald-300/55 bg-emerald-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-emerald-100 transition hover:bg-emerald-400/20">Retry run</button>}<button onClick={onExit} className="border border-cyan-300/45 bg-cyan-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-cyan-100 transition hover:bg-cyan-400/20">Return to lobby</button></div></div></div>}
      {matchSnapshot?.results && <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#03070c]/90 p-4 backdrop-blur-xl"><div className="w-[min(760px,calc(100vw-2rem))] border border-cyan-300/35 bg-[#07111b] p-6 shadow-[0_0_60px_rgba(34,211,238,.16)]"><div className="text-center"><div className={`text-[10px] font-black uppercase tracking-[0.32em] ${matchSnapshot.results.success ? 'text-cyan-200' : 'text-rose-200'}`}>{matchSnapshot.results.success ? 'Squad extracted' : 'Run failed'}</div><h2 className="mt-2 text-3xl font-black text-white">{matchSnapshot.results.success ? 'SECTOR BREACH COMPLETE' : 'SIGNAL LOST'}</h2><p className="mt-2 text-xs text-white/55">{Math.ceil(matchSnapshot.results.durationMs / 60000)} min · {matchSnapshot.results.contractsCompleted} contracts · {matchSnapshot.results.bossesDefeated} bosses</p></div><div className="mt-6 grid gap-3 sm:grid-cols-2">{matchSnapshot.results.players.map(player => <div key={player.playerId} className="border border-white/10 bg-white/[.035] p-3"><div className="flex items-center justify-between"><span className="font-black text-white" style={{ color: player.color }}>{player.label}</span><span className="text-[9px] font-black uppercase tracking-wider text-amber-200">{player.medal}</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px]"><span><b className="block text-white">{player.kills}</b><i className="not-italic text-white/45">Kills</i></span><span><b className="block text-white">{Math.round(player.firearmDamage + player.passiveDamage)}</b><i className="not-italic text-white/45">Damage</i></span><span><b className="block text-white">{player.revives}</b><i className="not-italic text-white/45">Revives</i></span></div></div>)}</div><div className="mt-6 text-center"><div className="mb-3 text-[10px] text-white/45">{launch.role === 'host' ? 'Retry starts a new run without reconnecting anyone.' : 'The host can retry without reconnecting anyone.'}</div>{launch.role === 'host' && <button onClick={retryRun} className="mr-3 border border-emerald-300/55 bg-emerald-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-emerald-100 hover:bg-emerald-400/20">Retry run</button>}<button onClick={onExit} className="border border-cyan-300/45 bg-cyan-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-cyan-100 hover:bg-cyan-400/20">Return to lobby</button></div></div></div>}
      {connectionStatus !== 'connected' && <div className={`absolute left-1/2 top-20 z-30 -translate-x-1/2 border px-4 py-3 text-center text-xs backdrop-blur-sm ${connectionStatus === 'reconnecting' ? 'border-amber-300/45 bg-amber-950/80 text-amber-100' : 'border-red-300/45 bg-red-950/80 text-red-100'}`}><div>{connectionMessage}</div>{connectionStatus === 'disconnected' && <button onClick={onExit} className="mt-2 border border-red-200/35 px-3 py-1 text-[10px] font-black uppercase tracking-wider hover:bg-red-300/10">Back to servers</button>}</div>}
      <button onClick={onExit} aria-label="Leave arena" className="coop-exit absolute"><ArrowLeft size={13} /><span>Leave</span></button>
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
  return <div className="coop-minimap pointer-events-none absolute">
    <div className="coop-minimap__disc relative overflow-hidden rounded-full border border-cyan-400/30 bg-black/65 shadow-[0_0_20px_rgba(0,240,255,.16)] backdrop-blur-sm">
      <div className="absolute inset-2 rounded-full border border-cyan-400/20" /><div className="absolute inset-7 rounded-full border border-cyan-400/15" />
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-cyan-400/25" /><div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-cyan-400/25" />
      {threats.map(enemy => { const position = point(enemy.x, enemy.y); return <span key={enemy.id} className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${enemy.type === 'titan' ? 'h-3 w-3 bg-rose-500 shadow-[0_0_10px_#fb7185]' : 'h-1.5 w-1.5 bg-rose-400/90'}`} style={position} />; })}
      {snapshot.players.filter(player => player.id !== localPlayer.id && player.lifeState !== 'eliminated').map(player => { const position = point(player.x, player.y); return <span key={player.id} className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-white shadow-[0_0_7px_currentColor]" style={{ ...position, backgroundColor: player.color, color: player.color }} />; })}
      {snapshot.buyStations.filter(station => station.active).map(station => { const position = point(station.x, station.y); return <span key={station.id} title="Buy Station" className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-cyan-50 bg-cyan-300 shadow-[0_0_12px_#22d3ee]" style={position} />; })}
      {objective && <span title={objective.title} className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-100 bg-emerald-300 shadow-[0_0_12px_#6ee7b7]" style={point(objective.x, objective.y)} />}
      {boss && <span title={boss.name} className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-rose-100 bg-rose-500 shadow-[0_0_14px_#fb7185] animate-pulse" style={point(boss.x, boss.y)} />}
      {exfil && <span title="Extraction" className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-amber-100 bg-amber-300 shadow-[0_0_13px_#fbbf24]" style={point(exfil.x, exfil.y)} />}
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
  const radius = Math.max(4, projectile.radius * scale);
  const weapon = COOP_WEAPON_DETAILS[projectile.weaponId];
  ctx.save();
  ctx.strokeStyle = weapon.color;
  ctx.fillStyle = weapon.color;
  ctx.shadowColor = weapon.color;
  ctx.shadowBlur = 14;
  ctx.translate(point.x, point.y);
  ctx.rotate(projectile.angle);
  ctx.fillRect(-radius * 1.5, -radius / 2, radius * 3, radius);
  ctx.globalAlpha = 0.45;
  ctx.fillRect(-radius * 5, -radius / 5, radius * 4, radius * .4);
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
