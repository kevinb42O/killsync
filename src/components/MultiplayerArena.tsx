import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Crosshair, Radio, Users, Coins, ShoppingCart, ShieldPlus } from 'lucide-react';
import { COOP_REVIVE_RANGE, COOP_WEAPON_DETAILS, COOP_WEAPON_SLOTS, CoopPlayerSeed, CoopSimulation, CoopSnapshot, quantizeAngle, quantizePitch } from '../game/multiplayer/CoopSimulation';
import { MultiplayerRendererBridge } from '../game/multiplayer/MultiplayerRendererBridge';
import { interpolateCoopSnapshot } from '../game/multiplayer/snapshotInterpolation';
import { soundManager } from '../game/SoundManager';
import { MultiplayerLaunch } from './ManualMultiplayerSetup';
import { MultiplayerInputFrame, MultiplayerStateFrame, MULTIPLAYER_PROTOCOL_VERSION } from '../game/multiplayer/protocol';
import { COOP_SHOP_ITEMS, type CoopShopItemId } from '../game/multiplayer/CoopBuyStation';
import { COOP_PASSIVE_BY_ID, passiveRankCost } from '../game/multiplayer/CoopPassiveModules';
import { getCoopSlideBinding, getMovementBindings, type ControlScheme } from '../game/controls';

const INPUT_INTERVAL_MS = 50;
const SNAPSHOT_INTERVAL_MS = 100;

/**
 * The first playable direct-connection arena. It intentionally stays separate
 * from the legacy GameEngine while the latter is converted from a one-player
 * browser simulation into a shared squad simulation.
 */
export function MultiplayerArena({ launch, controlScheme, onExit }: { launch: MultiplayerLaunch; controlScheme: ControlScheme; onExit: () => void }) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MultiplayerRendererBridge | null>(null);
  const simulationRef = useRef<CoopSimulation | null>(launch.role === 'host' ? new CoopSimulation(launch.players) : null);
  const snapshotRef = useRef<CoopSnapshot | null>(launch.role === 'host' ? simulationRef.current!.createSnapshot() : null);
  const presentationRef = useRef({ previous: snapshotRef.current as CoopSnapshot | null, current: snapshotRef.current as CoopSnapshot | null, receivedAt: performance.now(), durationMs: INPUT_INTERVAL_MS });
  const inputRef = useRef<MultiplayerInputFrame>(createInput());
  const displayedCombatEventsRef = useRef(new Set<number>());
  const sessionCloseTimerRef = useRef(0);
  const spectatorTargetRef = useRef<string | null>(null);
  const downedSpectatorTargetRef = useRef<string | null>(null);
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
    setStationOpen(false);
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
    launch.session.broadcastState({ type: 'state', version: MULTIPLAYER_PROTOCOL_VERSION, tick: snapshot.tick, sentAt: Math.round(now), payload: snapshot });
    launch.hostedLobby?.update(snapshot.players.length, 'in_game');
    setConnectionMessage('New run started — the squad connection is still live.');
    setCombatNotice({ text: 'NEW RUN — SQUAD LINK PRESERVED', color: '#5eead4' });
  };

  useEffect(() => {
    const session = launch.session;
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
      }
    };
    const syncHud = (snapshot: CoopSnapshot, connected: boolean = true) => {
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
      const elapsedSinceLastSnapshot = now - timeline.receivedAt;
      timeline.previous = timeline.current || snapshot;
      timeline.current = snapshot;
      timeline.receivedAt = now;
      timeline.durationMs = Math.max(35, Math.min(140, elapsedSinceLastSnapshot || INPUT_INTERVAL_MS));
      snapshotRef.current = snapshot;
      if (launch.role === 'host') syncHud(snapshot);
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
      onInput: (peerId, frame) => {
        if (launch.role !== 'host') return;
        const playerId = hostPlayerIdByPeer[peerId];
        if (playerId) simulationRef.current?.setInput(playerId, frame);
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
          if (!candidate || !simulation) return;
          const player: CoopPlayerSeed = { ...candidate, color: nextGuestColor(simulation.getPlayerSeeds().length - 1) };
          launch.peerPlayerIds[peerId] = player.id;
          if (!simulation.addPlayer(player)) return;
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
    let sequence = 0;
    const updateInput = () => {
      const movement = (movementBindings.up.some(key => keys.has(key)) ? 1 : 0)
        | (movementBindings.down.some(key => keys.has(key)) ? 2 : 0)
        | (movementBindings.left.some(key => keys.has(key)) ? 4 : 0)
        | (movementBindings.right.some(key => keys.has(key)) ? 8 : 0);
      inputRef.current = {
        ...inputRef.current,
        sequence: ++sequence,
        clientTime: Math.round(performance.now()),
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
      if (!inputRef.current.jumpPressed) return;
      inputRef.current = { ...inputRef.current, sequence: ++sequence, clientTime: Math.round(performance.now()), jumpPressed: false };
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
        if (!event.repeat) inputRef.current = { ...inputRef.current, sequence: ++sequence, clientTime: Math.round(performance.now()), jumpPressed: true };
        return;
      }
      const key = event.key.toLowerCase();
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
        setStationOpen(open => !open);
        return;
      }
      if (key === 'r') {
        event.preventDefault();
        if (!event.repeat) inputRef.current = { ...inputRef.current, sequence: ++sequence, clientTime: Math.round(performance.now()), reloadPressed: true };
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
      if (event.key.toLowerCase() === 'r') { inputRef.current = { ...inputRef.current, sequence: ++sequence, clientTime: Math.round(performance.now()), reloadPressed: false }; return; }
      keys.delete(event.key.toLowerCase());
      updateInput();
    };
    const onMouseMove = (event: MouseEvent) => {
      if (isSpectator) return;
      inputRef.current = {
        ...inputRef.current,
        aimAngle: quantizeAngle(renderer.getAimAngle()),
        aimPitch: quantizePitch(renderer.getAimPitch()),
      };
    };
    const onMouseDown = (event: MouseEvent) => {
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
      if (event.button === 2) { inputRef.current = { ...inputRef.current, aiming: true, sequence: ++sequence, clientTime: Math.round(performance.now()) }; return; }
      if (event.button !== 0) return;
      renderer.requestPointerLock();
      firing = true;
      updateInput();
    };
    const onMouseUp = (event: MouseEvent) => {
      if (isSpectator) return;
      if (snapshotRef.current?.players.find(player => player.id === launch.localPlayerId)?.lifeState === 'downed') {
        firing = false;
        updateInput();
        return;
      }
      if (event.button === 2) { inputRef.current = { ...inputRef.current, aiming: false, sequence: ++sequence, clientTime: Math.round(performance.now()) }; return; }
      if (event.button !== 0) return;
      firing = false;
      updateInput();
    };
    const onWheel = (event: WheelEvent) => {
      if (isSpectator) return;
      event.preventDefault();
      const direction = event.deltaY > 0 ? 1 : -1;
      const selectedSlot = (inputRef.current.selectedSlot + direction + COOP_WEAPON_SLOTS.length) % COOP_WEAPON_SLOTS.length;
      inputRef.current = { ...inputRef.current, selectedSlot };
      setHud(current => ({ ...current, selectedSlot }));
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('contextmenu', event => event.preventDefault());

    let animationFrame = 0;
    let lastTime = performance.now();
    let accumulator = 0;
    let stateAccumulator = 0;
    let inputAccumulator = 0;
    const frame = (now: number) => {
      const elapsed = Math.min(100, now - lastTime);
      lastTime = now;
      accumulator += elapsed;
      inputAccumulator += elapsed;
      stateAccumulator += elapsed;
      if (launch.role === 'host') {
        const simulation = simulationRef.current!;
        simulation.setInput(launch.localPlayerId, inputRef.current);
        let simulationAdvanced = false;
        while (accumulator >= INPUT_INTERVAL_MS) {
          simulation.tick(INPUT_INTERVAL_MS);
          accumulator -= INPUT_INTERVAL_MS;
          simulationAdvanced = true;
          clearJumpInput();
        }
        if (simulationAdvanced) {
          publishSnapshot(simulation.createSnapshot(), now);
        }
        if (stateAccumulator >= SNAPSHOT_INTERVAL_MS) {
          stateAccumulator = 0;
          const snapshot = snapshotRef.current || simulation.createSnapshot();
          const state: MultiplayerStateFrame = { type: 'state', version: MULTIPLAYER_PROTOCOL_VERSION, tick: snapshot.tick, sentAt: Math.round(now), payload: snapshot };
          session.broadcastState(state);
          syncHud(snapshot);
        }
      } else if (launch.role === 'guest' && inputAccumulator >= INPUT_INTERVAL_MS) {
        inputAccumulator = 0;
        session.sendInput(inputRef.current);
        clearJumpInput();
      }
      const frameSnapshot = presentationSnapshot(now);
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
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('wheel', onWheel);
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

  return (
    <div className="absolute inset-0 z-[110] bg-[#05080e]">
      <div ref={sceneRef} className="absolute inset-0 h-full w-full" />
      {damageFlash && <div className="pointer-events-none absolute inset-0 z-20 border-[min(8vw,100px)] border-rose-500/35 bg-rose-500/10 animate-pulse" />}
      <div className="pointer-events-none absolute left-5 top-5 border border-cyan-300/35 bg-black/65 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200"><Radio size={13} /> {isSpectator ? 'Spectator' : `Direct Co-op · ${launch.role}`}</div>
        <div className="mt-2 flex gap-4 text-xs font-mono text-white/75"><span><Users size={12} className="mr-1 inline text-fuchsia-300" />{hud.players}</span><span>KILLS {hud.kills}</span><span className="text-white/40">TICK {hud.tick}</span></div>
        <div className="mt-3 w-48">
          <div className="flex justify-between text-[9px] font-mono text-rose-100/80"><span>HP</span><span>{Math.ceil(hud.health)}/{Math.ceil(hud.maxHealth)}</span></div>
          <div className="mt-1 h-1.5 overflow-hidden bg-rose-950/70"><div className="h-full bg-rose-400 transition-[width] duration-100" style={{ width: `${Math.max(0, Math.min(100, hud.health / Math.max(1, hud.maxHealth) * 100))}%` }} /></div>
          <div className="mt-2 flex justify-between text-[9px] font-mono text-cyan-100/80"><span>LV {hud.level} · XP {Math.floor(hud.experience)}/{Math.floor(hud.experienceToNextLevel)}</span><span className="text-amber-200">¤ {hud.coins}</span></div>
          <div className="mt-1 h-1 overflow-hidden bg-cyan-950/70"><div className="h-full bg-cyan-300 transition-[width] duration-100" style={{ width: `${Math.max(0, Math.min(100, hud.experience / Math.max(1, hud.experienceToNextLevel) * 100))}%` }} /></div>
          <div className="mt-2 text-[9px] font-mono uppercase tracking-wider text-white/55">Data cores <span className="text-white">{hud.cores}</span></div>
          {hud.invulnerableRemainingMs > 0 && <div className="mt-2 text-[9px] font-black uppercase tracking-wider text-emerald-200">Revive shield {Math.ceil(hud.invulnerableRemainingMs / 1000)}s</div>}
        </div>
      </div>
      <div className="pointer-events-none absolute left-5 top-40 w-52 border border-white/15 bg-black/60 p-2 backdrop-blur-sm">
        <div className="mb-1 text-[9px] font-black uppercase tracking-[0.16em] text-white/45">Squad status</div>
        {hud.squad.map(player => {
          const status = player.lifeState === 'alive' ? `${Math.ceil(player.health)}/${Math.ceil(player.maxHealth)}` : player.lifeState === 'downed' ? (player.downedRemainingMs > 0 ? `DOWN ${Math.ceil(player.downedRemainingMs / 1000)}s` : 'DOWN · REVIVABLE') : 'OUT';
          return <div key={player.id} className="mb-1 border-l-2 bg-white/[0.035] px-2 py-1" style={{ borderColor: player.color }}>
            <div className="flex items-center justify-between gap-2 text-[9px] font-mono"><span className="truncate text-white/80">{player.label}</span><span className={player.lifeState === 'alive' ? 'text-emerald-200' : player.lifeState === 'downed' ? 'text-amber-200' : 'text-rose-300'}>{status}</span></div>
            {player.lifeState === 'downed' && <div className="mt-1 h-1 overflow-hidden bg-white/10"><div className="h-full bg-amber-300" style={{ width: `${Math.max(0, player.reviveProgressMs / 3000 * 100)}%` }} /></div>}
          </div>;
        })}
      </div>
      <div className="pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 border border-white/15 bg-black/60 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-white/70 backdrop-blur-sm">{isSpectator ? 'Third-person spectator' : hud.lifeState === 'downed' ? 'Third-person revive spectator' : 'First-person co-op'}</div>
      {isSpectator && <div className="pointer-events-none absolute left-1/2 top-20 z-20 -translate-x-1/2 border border-fuchsia-300/45 bg-black/75 px-4 py-2 text-center backdrop-blur-sm"><div className="text-[9px] font-black uppercase tracking-[0.25em] text-fuchsia-200">Spectating</div><div className="mt-1 text-xs font-black uppercase tracking-wider text-white">{spectatorTarget?.label || 'Acquiring target'}</div><div className="mt-1 text-[9px] uppercase tracking-wider text-white/50">Mouse to orbit · left click next player</div></div>}
      {run && <div className="pointer-events-none absolute left-1/2 top-16 w-[min(460px,calc(100vw-2rem))] -translate-x-1/2 border border-cyan-300/25 bg-black/70 px-4 py-3 text-center backdrop-blur-sm">
        <div className="text-[9px] font-black uppercase tracking-[0.22em] text-cyan-200">{run.phase.replace('_', ' ')}</div>
        <div className="mt-1 text-xs font-black uppercase tracking-wider text-white">{run.objective?.title || run.boss?.name || run.notice}</div>
        {run.objective && <><div className="mt-1 text-[10px] text-white/55">{run.objective.description}</div><div className="mt-2 h-1.5 overflow-hidden bg-white/10"><div className="h-full bg-cyan-300 transition-[width]" style={{ width: `${Math.min(100, run.objective.progress / run.objective.required * 100)}%` }} /></div></>}
        {run.boss && <><div className="mt-2 flex justify-between text-[9px] font-mono text-rose-100"><span>PHASE {run.boss.phase}</span><span>{Math.ceil(run.boss.health).toLocaleString()} / {Math.ceil(run.boss.maxHealth).toLocaleString()}</span></div><div className="mt-1 h-1.5 overflow-hidden bg-rose-950/80"><div className="h-full bg-rose-400 transition-[width]" style={{ width: `${Math.max(0, run.boss.health / Math.max(1, run.boss.maxHealth) * 100)}%` }} /></div></>}
        {run.insertionRemainingMs !== undefined && run.insertionDurationMs !== undefined && <><div className="mt-2 flex justify-between text-[9px] font-mono text-cyan-100"><span>HOSTILES ARRIVE</span><span>{Math.ceil(run.insertionRemainingMs / 1000)}s</span></div><div className="mt-1 h-1.5 overflow-hidden bg-cyan-950/80"><div className="h-full bg-cyan-300 transition-[width]" style={{ width: `${Math.max(0, 1 - run.insertionRemainingMs / Math.max(1, run.insertionDurationMs)) * 100}%` }} /></div></>}
        {run.exfil && <><div className="mt-2 flex justify-between text-[9px] font-mono text-amber-100"><span>EXFIL HOLD</span><span>{Math.ceil(run.exfil.remainingMs / 1000)}s</span></div><div className="mt-1 h-1.5 overflow-hidden bg-amber-950/80"><div className="h-full bg-amber-300 transition-[width]" style={{ width: `${run.exfil.holdProgressMs / run.exfil.holdRequiredMs * 100}%` }} /></div></>}
      </div>}
      {combatNotice && <div className="pointer-events-none absolute left-1/2 top-[43%] -translate-x-1/2 text-center text-sm font-black uppercase tracking-[0.2em] drop-shadow-[0_0_12px_currentColor]" style={{ color: combatNotice.color }}>{combatNotice.text}</div>}
      {revivingTarget && <div className="pointer-events-none absolute left-1/2 top-[56%] z-20 w-[min(330px,calc(100vw-2rem))] -translate-x-1/2 border border-cyan-300/55 bg-black/80 px-4 py-3 text-center shadow-[0_0_24px_rgba(34,211,238,.18)] backdrop-blur-md"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100">Hold F · Reviving {revivingTarget.label}</div><div className="mt-2 h-2 overflow-hidden bg-cyan-950/80"><div className="h-full bg-cyan-300 transition-[width] duration-100" style={{ width: `${Math.max(0, revivingTarget.reviveProgressMs / 3000 * 100)}%` }} /></div><div className="mt-1 text-[9px] font-mono text-cyan-100/70">{Math.round(revivingTarget.reviveProgressMs / 3000 * 100)}%</div></div>}
      {!isSpectator && (hud.selectedSlot === 3 && hud.isAiming ? <div className="pointer-events-none absolute inset-0 z-10 rounded-full border-[min(17vw,220px)] border-black/90"><div className="absolute left-1/2 top-1/2 h-[64vh] w-px -translate-x-1/2 -translate-y-1/2 bg-white/70" /><div className="absolute left-1/2 top-1/2 h-px w-[64vh] -translate-x-1/2 -translate-y-1/2 bg-white/70" /><div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-fuchsia-100" /></div> : <div className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2"><span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-cyan-100/80" /><span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-cyan-100/80" /></div>)}
      {!isSpectator && <div className="pointer-events-none absolute bottom-16 left-1/2 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 gap-1.5 overflow-hidden border border-white/15 bg-black/60 p-1.5 backdrop-blur-sm">
        {visibleWeaponSlots(hud.selectedSlot).map(index => {
          const weaponId = COOP_WEAPON_SLOTS[index];
          const weapon = COOP_WEAPON_DETAILS[weaponId];
          const active = hud.selectedSlot === index;
          const state = hud.weapons[index];
          return <div key={weaponId} className={`min-w-[118px] border px-2 py-1.5 text-center transition ${active ? 'border-cyan-200 bg-cyan-300/15 text-white' : 'border-white/10 text-white/35'}`}>
            <div className="text-[9px] font-mono font-bold" style={{ color: active ? weapon.color : undefined }}>{weapon.key} {weapon.shortName} · LV {state?.level || 1}</div>
            <div className="mt-0.5 text-[10px] font-mono text-white/75">{state?.magazineAmmo ?? '-'} <span className="text-white/35">|</span> {state?.reserveAmmo ?? '-'}</div>
            {active && hud.isReloading && <div className="mt-1 h-0.5 overflow-hidden bg-white/10"><div className="h-full bg-cyan-300 animate-pulse" style={{ width: '68%' }} /></div>}
          </div>;
        })}
        <div className="self-center px-1 text-[9px] font-mono text-white/35">{hud.selectedSlot + 1}/{COOP_WEAPON_SLOTS.length}</div>
      </div>}
      {!isSpectator && localSnapshot && <div className="pointer-events-none absolute bottom-28 left-5 max-w-56 border border-white/10 bg-black/60 px-3 py-2 text-[9px] font-mono uppercase tracking-wider text-white/60 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-cyan-100"><ShieldPlus size={12} /> Armor {Math.ceil(localSnapshot.armorHp)} · Reboot {localSnapshot.selfRevives ? 'READY' : 'NONE'}</div>
        {localSnapshot.passiveModules.length > 0 && <div className="mt-1 text-white/65">{localSnapshot.passiveModules.map(module => `${COOP_SHOP_ITEMS[module.id].name} ${'I'.repeat(module.rank)}`).join(' · ')}</div>}
      </div>}
      {matchSnapshot && localSnapshot && <CoopMinimap snapshot={matchSnapshot} localPlayer={localSnapshot} />}
      {nearbyStation && <div className="absolute bottom-5 left-5 w-[min(390px,calc(100vw-2.5rem))] border border-cyan-300/35 bg-[#07111b]/95 p-4 shadow-[0_0_28px_rgba(34,211,238,.14)] backdrop-blur-md">
        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200"><ShoppingCart size={14} /> Buy Station online</div><button onClick={() => { rendererRef.current?.exitPointerLock(); setStationOpen(open => !open); }} className="border border-cyan-300/40 bg-cyan-400/10 px-2 py-1 text-[9px] font-black uppercase text-cyan-100 hover:bg-cyan-400/20">{stationOpen ? 'Close [F]' : 'Shop [F]'}</button></div>
        {!stationOpen && <p className="mt-2 text-[10px] text-white/50">Press <span className="font-black text-cyan-100">F</span> to interact. It prioritizes reviving a nearby teammate.</p>}
        {stationOpen && <><div className="mt-3 max-h-56 space-y-1 overflow-y-auto pr-1">{nearbyStation.stock.map(itemId => { const item = COOP_SHOP_ITEMS[itemId]; const passive = itemId in COOP_PASSIVE_BY_ID ? itemId as keyof typeof COOP_PASSIVE_BY_ID : undefined; const owned = passive && localSnapshot.passiveModules.find(module => module.id === passive); const cost = passive && owned ? passiveRankCost(passive, owned.rank) : item.cost; const affordable = localSnapshot.coins >= cost; return <button key={itemId} disabled={!affordable} onClick={() => purchaseStationItem(nearbyStation.id, itemId)} className="flex w-full items-center justify-between gap-3 border border-white/10 bg-white/[0.035] px-2 py-2 text-left transition hover:border-cyan-200/50 hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-40"><span><span className="block text-[10px] font-bold text-white">{item.name}{owned ? ` · Rank ${owned.rank + 1}` : ''}</span><span className="block text-[9px] text-white/45">{item.description}</span></span><span className="shrink-0 text-[10px] font-mono text-amber-200"><Coins className="mr-1 inline" size={11} />{cost}</span></button>; })}</div>{stationMessage && <div className="mt-2 text-[10px] text-cyan-100">{stationMessage}</div>}</>}
      </div>}
      {launch.role === 'host' && <div className="absolute bottom-[164px] right-5 w-[min(310px,calc(100vw-2.5rem))] border border-fuchsia-300/30 bg-black/75 p-4 text-[10px] backdrop-blur-md"><div className="flex items-center gap-2 font-black uppercase tracking-[0.18em] text-fuchsia-200"><Users size={13} /> Match lobby · {hud.players}/4</div><p className="mt-2 leading-relaxed text-white/50">{connectionMessage}</p></div>}
      {!isSpectator && hud.lifeState === 'downed' && <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/35"><div className="w-[min(420px,calc(100vw-2rem))] border border-amber-300/50 bg-black/80 p-6 text-center backdrop-blur-md"><div className="text-xs font-black uppercase tracking-[0.3em] text-amber-200">You are downed</div><div className="mt-3 text-4xl font-black text-white">{hud.downedRemainingMs > 0 ? `${Math.ceil(hud.downedRemainingMs / 1000)}s` : 'REVIVABLE'}</div><div className="mt-3 text-xs text-white/60">Watching <span className="font-black text-fuchsia-200">{downedSpectatorTarget?.label || 'your squad'}</span> in third person. Left click cycles living teammates.</div><div className="mt-2 text-xs text-white/60">A teammate must stand close and hold <span className="font-black text-cyan-200">F</span> for 3 seconds. Your body remains until the squad is wiped.</div>{hud.reviverId && <div className="mt-3 text-[10px] font-bold uppercase tracking-wider text-emerald-200">Revive in progress · {Math.round(hud.reviveProgressMs / 3000 * 100)}%</div>}<div className="mt-2 h-1.5 overflow-hidden bg-white/10"><div className="h-full bg-cyan-300 transition-[width]" style={{ width: `${Math.max(0, hud.reviveProgressMs / 3000 * 100)}%` }} /></div></div></div>}
      {!isSpectator && hud.lifeState === 'eliminated' && hud.matchState === 'active' && <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/45"><div className="border border-rose-300/40 bg-black/80 px-6 py-5 text-center backdrop-blur-md"><div className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">Eliminated</div><div className="mt-3 text-xs text-white/60">Your squad can still finish the encounter.</div></div></div>}
      {hud.matchState !== 'active' && <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"><div className="w-[min(440px,calc(100vw-2rem))] border border-rose-300/45 bg-[#10070b] p-7 text-center shadow-[0_0_60px_rgba(244,63,94,.2)]"><div className="text-[10px] font-black uppercase tracking-[0.32em] text-rose-200">{hud.matchState === 'solo_defeat' ? 'Run ended' : 'Squad wiped'}</div><h2 className="mt-3 text-3xl font-black text-white">{hud.matchState === 'solo_defeat' ? 'SYSTEM FAILURE' : 'NO OPERATIVES REMAIN'}</h2><p className="mt-3 text-xs leading-relaxed text-white/60">Kills confirmed: {hud.kills}. {launch.role === 'host' ? 'Retry instantly without reconnecting the squad.' : 'Waiting for the host to start the next run.'}</p><div className="mt-6 flex justify-center gap-3">{launch.role === 'host' && <button onClick={retryRun} className="border border-emerald-300/55 bg-emerald-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-emerald-100 transition hover:bg-emerald-400/20">Retry run</button>}<button onClick={onExit} className="border border-cyan-300/45 bg-cyan-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-cyan-100 transition hover:bg-cyan-400/20">Return to lobby</button></div></div></div>}
      {matchSnapshot?.results && <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#03070c]/90 p-4 backdrop-blur-xl"><div className="w-[min(760px,calc(100vw-2rem))] border border-cyan-300/35 bg-[#07111b] p-6 shadow-[0_0_60px_rgba(34,211,238,.16)]"><div className="text-center"><div className={`text-[10px] font-black uppercase tracking-[0.32em] ${matchSnapshot.results.success ? 'text-cyan-200' : 'text-rose-200'}`}>{matchSnapshot.results.success ? 'Squad extracted' : 'Run failed'}</div><h2 className="mt-2 text-3xl font-black text-white">{matchSnapshot.results.success ? 'SECTOR BREACH COMPLETE' : 'SIGNAL LOST'}</h2><p className="mt-2 text-xs text-white/55">{Math.ceil(matchSnapshot.results.durationMs / 60000)} min · {matchSnapshot.results.contractsCompleted} contracts · {matchSnapshot.results.bossesDefeated} bosses</p></div><div className="mt-6 grid gap-3 sm:grid-cols-2">{matchSnapshot.results.players.map(player => <div key={player.playerId} className="border border-white/10 bg-white/[.035] p-3"><div className="flex items-center justify-between"><span className="font-black text-white" style={{ color: player.color }}>{player.label}</span><span className="text-[9px] font-black uppercase tracking-wider text-amber-200">{player.medal}</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px]"><span><b className="block text-white">{player.kills}</b><i className="not-italic text-white/45">Kills</i></span><span><b className="block text-white">{Math.round(player.firearmDamage + player.passiveDamage)}</b><i className="not-italic text-white/45">Damage</i></span><span><b className="block text-white">{player.revives}</b><i className="not-italic text-white/45">Revives</i></span></div></div>)}</div><div className="mt-6 text-center"><div className="mb-3 text-[10px] text-white/45">{launch.role === 'host' ? 'Retry starts a new run without reconnecting anyone.' : 'The host can retry without reconnecting anyone.'}</div>{launch.role === 'host' && <button onClick={retryRun} className="mr-3 border border-emerald-300/55 bg-emerald-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-emerald-100 hover:bg-emerald-400/20">Retry run</button>}<button onClick={onExit} className="border border-cyan-300/45 bg-cyan-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-cyan-100 hover:bg-cyan-400/20">Return to lobby</button></div></div></div>}
      <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 border border-white/15 bg-black/60 px-4 py-2 text-center text-[10px] font-mono uppercase tracking-wider text-white/60 backdrop-blur-sm">{isSpectator ? <>Mouse look · left click next player · {mouseLocked ? 'camera active' : 'click world for camera'}</> : <><Crosshair size={12} className="mr-2 inline text-cyan-300" />{controlScheme === 'AZERTY' ? 'ZQSD' : 'WASD'} move · {getCoopSlideBinding(controlScheme).toUpperCase()} slide · Shift sprint · R reload · F revive / interact · RMB aim · 1–5 switch · {mouseLocked ? 'mouse locked · look around' : 'click world to lock mouse'} · hold LMB fire</>}</div>
      {connectionStatus !== 'connected' && <div className={`absolute left-1/2 top-20 z-30 -translate-x-1/2 border px-4 py-3 text-center text-xs backdrop-blur-sm ${connectionStatus === 'reconnecting' ? 'border-amber-300/45 bg-amber-950/80 text-amber-100' : 'border-red-300/45 bg-red-950/80 text-red-100'}`}><div>{connectionMessage}</div>{connectionStatus === 'disconnected' && <button onClick={onExit} className="mt-2 border border-red-200/35 px-3 py-1 text-[10px] font-black uppercase tracking-wider hover:bg-red-300/10">Back to servers</button>}</div>}
      <button onClick={onExit} className="absolute right-5 top-5 flex items-center gap-2 border border-white/15 bg-black/65 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white/70 backdrop-blur-sm transition hover:border-white/35 hover:text-white"><ArrowLeft size={13} /> Leave arena</button>
    </div>
  );
}

/** Snapshot-only tactical radar. It mirrors the single-player HUD's
 * camera-relative radar while adding squad and shared-run markers. */
function CoopMinimap({ snapshot, localPlayer }: { snapshot: CoopSnapshot; localPlayer: CoopSnapshot['players'][number] }) {
  const range = 2_400;
  const point = (x: number, y: number) => {
    const dx = x - localPlayer.x, dy = y - localPlayer.y;
    const angle = Math.atan2(dy, dx) - localPlayer.angle;
    const radius = Math.min(1, Math.hypot(dx, dy) / range) * 62;
    return { left: 72 + Math.sin(angle) * radius, top: 72 - Math.cos(angle) * radius };
  };
  const threats = [...snapshot.enemies].sort((left, right) => Math.hypot(left.x - localPlayer.x, left.y - localPlayer.y) - Math.hypot(right.x - localPlayer.x, right.y - localPlayer.y)).slice(0, 40);
  const objective = snapshot.run.objective;
  const boss = snapshot.run.boss;
  const exfil = snapshot.run.exfil;
  return <div className="pointer-events-none absolute bottom-5 right-5 z-[85]">
    <div className="relative h-36 w-36 overflow-hidden rounded-full border border-cyan-400/45 bg-black/80 shadow-[0_0_28px_rgba(0,240,255,.28)] backdrop-blur-md">
      <div className="absolute inset-2 rounded-full border border-cyan-400/20" /><div className="absolute inset-7 rounded-full border border-cyan-400/15" />
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-cyan-400/25" /><div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-cyan-400/25" />
      {threats.map(enemy => { const position = point(enemy.x, enemy.y); return <span key={enemy.id} className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${enemy.type === 'titan' ? 'h-3 w-3 bg-rose-500 shadow-[0_0_10px_#fb7185]' : 'h-1.5 w-1.5 bg-rose-400/90'}`} style={position} />; })}
      {snapshot.players.filter(player => player.id !== localPlayer.id && player.lifeState !== 'eliminated').map(player => { const position = point(player.x, player.y); return <span key={player.id} className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-white shadow-[0_0_7px_currentColor]" style={{ ...position, backgroundColor: player.color, color: player.color }} />; })}
      {snapshot.buyStations.filter(station => station.active).map(station => { const position = point(station.x, station.y); return <span key={station.id} title="Buy Station" className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-cyan-50 bg-cyan-300 shadow-[0_0_12px_#22d3ee]" style={position} />; })}
      {objective && <span title={objective.title} className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-100 bg-emerald-300 shadow-[0_0_12px_#6ee7b7]" style={point(objective.x, objective.y)} />}
      {boss && <span title={boss.name} className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-rose-100 bg-rose-500 shadow-[0_0_14px_#fb7185] animate-pulse" style={point(boss.x, boss.y)} />}
      {exfil && <span title="Extraction" className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-amber-100 bg-amber-300 shadow-[0_0_13px_#fbbf24]" style={point(exfil.x, exfil.y)} />}
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"><span className="h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_9px_#22d3ee]" /><span className="absolute -top-2 h-0 w-0 border-x-[3px] border-x-transparent border-b-[6px] border-b-white" /></div>
      <div className="absolute bottom-1.5 left-0 right-0 text-center font-mono text-[8px] font-bold uppercase tracking-widest text-cyan-300/75">Squad Radar</div>
    </div>
  </div>;
}

function createInput(): MultiplayerInputFrame {
  return { type: 'input', version: MULTIPLAYER_PROTOCOL_VERSION, sequence: 0, clientTime: 0, movement: 0, aimAngle: 0, aimPitch: quantizePitch(0), selectedSlot: 0, firing: false, reloadPressed: false, aiming: false, sprinting: false, sliding: false, reviving: false, jumpPressed: false, dashPressed: false };
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
  for (const projectile of snapshot.projectiles) drawProjectile(ctx, project(projectile.x, projectile.y), projectile, scale);
  ctx.shadowBlur = 0;
  for (const enemy of snapshot.enemies) {
    const point = project(enemy.x, enemy.y); ctx.fillStyle = '#fb7185'; ctx.beginPath(); ctx.arc(point.x, point.y, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#24070d'; ctx.fillRect(point.x - 12, point.y - 17, 24, 3); ctx.fillStyle = '#fda4af'; ctx.fillRect(point.x - 12, point.y - 17, 24 * (enemy.health / enemy.maxHealth), 3);
  }
  for (const player of snapshot.players) {
    const point = project(player.x, player.y); ctx.strokeStyle = player.color; ctx.lineWidth = 4; ctx.shadowColor = player.color; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.moveTo(point.x, point.y); ctx.lineTo(point.x + Math.cos(player.angle) * 22, point.y + Math.sin(player.angle) * 22); ctx.stroke();
    ctx.fillStyle = player.color; ctx.beginPath(); ctx.arc(point.x, point.y, 15, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#041018'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.fillText(player.label, point.x, point.y + 3);
    ctx.fillStyle = '#031019'; ctx.fillRect(point.x - 18, point.y - 25, 36, 4); ctx.fillStyle = '#34d399'; ctx.fillRect(point.x - 18, point.y - 25, 36 * (player.health / player.maxHealth), 4);
  }
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
