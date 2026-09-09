import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Backpack, Coins, Crosshair, Hammer, HeartPulse, MessageSquare, Radio, Send, ShieldCheck, ShoppingCart, ShieldPlus, Signal, Terminal, X } from 'lucide-react';
import { COOP_MANUAL_PICKUP_RANGE, COOP_REVIVE_RANGE, COOP_WEAPON_DETAILS, COOP_WEAPON_SLOTS, COOP_WORLD_SIZE, CoopPlayerSeed, CoopSimulation, CoopSnapshot, quantizeAngle, quantizePitch, type CoopInventoryDropKind } from '../game/multiplayer/CoopSimulation';
import { getCoopOperator, isCoopArtifactSpenderCharged, normalizeCoopOperatorId } from '../game/multiplayer/CoopOperators';
import { MultiplayerRendererBridge } from '../game/multiplayer/MultiplayerRendererBridge';
import { CoopSnapshotInterpolator } from '../game/multiplayer/snapshotInterpolation';
import { CoopPerformanceMonitor } from '../game/multiplayer/CoopPerformanceMonitor';
import { soundManager } from '../game/SoundManager';
import { MultiplayerLaunch } from './ManualMultiplayerSetup';
import { CoopPing, CoopPingKind, MultiplayerInputFrame, MultiplayerStateFrame, MULTIPLAYER_PROTOCOL_VERSION, type CoopAdminRequest, type CoopAdminResult } from '../game/multiplayer/protocol';
import { COOP_OPERATOR_REDEPLOY_COST, COOP_SHOP_ITEMS, coopShopDisabledReason, type CoopPurchaseResult, type CoopRedeployResult, type CoopShopItemId } from '../game/multiplayer/CoopBuyStation';
import { CONTROL_SCHEME_DETAILS, getCoopSlideBinding, getMovementBindings, isGamepadControlScheme, type ControlScheme } from '../game/controls';
import { firstConnectedGamepad, GAMEPAD_BUTTON, gamepadLookAxes, gamepadMovementMask, isGamepadButtonDown, isGamepadTriggerDown } from '../game/gamepad';
import { LocalPlayerPrediction } from '../game/multiplayer/LocalPlayerPrediction';
import { advancePlayerMovement, COOP_PLAYER_RADIUS, COOP_STEP_MS } from '../game/multiplayer/playerMovement';
import { HostSimulationClock } from '../game/multiplayer/HostSimulationClock';
import { createInterestSnapshot } from '../game/multiplayer/snapshotInterest';
import { coopGasStateKey, coopImprintStatDescriptionKey, coopImprintStatEffectKey, coopImprintStatNameKey, coopItemNameKey, coopPickupNameKey, coopRunPhaseKey, coopText, coopWeaponNameKey, coopWeaponShortNameKey, isCoopTextKey, localizeCoopSignalingMessage, type CoopLanguage, type CoopTextKey } from '../game/multiplayer/i18n';
import { CoopCombatReticle, type CoopReticleMode } from './CoopCombatReticle';
import { OffscreenThreatIndicators, type HudThreat } from './OffscreenThreatIndicators';
import { CoopShopMenu, resolveCoopShopKey, type CoopShopCategoryId } from './CoopShopMenu';
import { CoopWeaponFoundryMenu } from './CoopWeaponFoundryMenu';
import { COOP_FIREARM_IDS, type CoopFirearmId } from '../game/combat/coopFirearms';
import type { CoopFoundryUpgradeResult } from '../game/multiplayer/CoopWeaponFoundry';
import { COOP_MAX_FABRICATOR_CHARGES, COOP_RECOVERY_RELAY_HEAL_PER_SECOND, COOP_STRUCTURE_ACTION_RANGE, COOP_STRUCTURE_DEFINITIONS, isCoopStructureAction, isCoopStructureType, resolveBarricadeCollision, validateCoopBuildPreview, type CoopBuildResult, type CoopDismantleResult, type CoopStructureAction, type CoopStructureActionResult, type CoopStructureType } from '../game/multiplayer/CoopFieldEngineering';
import {
  COOP_IMPRINT_STATS,
  coopImprintRankCost,
  coopImprintRating,
  getCoopOperatorImprint,
  normalizeCoopImprintLoadout,
  purchaseCoopImprintRank,
  readCoopImprintProfile,
  settleCoopImprintRun,
  writeCoopImprintProfile,
  type CoopImprintProfile,
  type CoopImprintStatId,
} from '../game/multiplayer/CoopImprint';
import './multiplayer.css';
import { normalizeCoopSkinId } from '../game/multiplayer/CoopSkins';
import { COOP_FIELD_MISSION_LABELS, coopFieldMissionStageLabel, resolveCoopMissionNavigationTarget, type CoopActiveFieldMissionSnapshot } from '../game/multiplayer/CoopFieldMissions';
import { appendCoopChatMessage, COOP_CHAT_MAX_LENGTH, normalizeCoopChatText, parseCoopChatMessage, parseCoopChatRequest, type CoopChatMessage } from '../game/multiplayer/CoopChat';
import { getWorldDefinition, readCoopWorldProgress, unlockCoopWorld, writeCoopWorldProgress } from '../game/world/WorldDefinitions';
import { COOP_ADMIN_HELP, isCoopEnemyType, parseCoopAdminCommand, resolveCoopAdminTargets, resolveCoopAdminWorld, type CoopAdminCommandResult } from '../game/multiplayer/CoopAdminCommands';
import { hasCoopOwnerCredential, signCoopAdminCommand, verifyCoopAdminRequest } from '../game/multiplayer/CoopOwnerIdentity';
import { CoopTacticalMap as EnhancedCoopTacticalMap } from './CoopTacticalMap';
import { CoopMobileControls, type MobileCoopAction } from './CoopMobileControls';

const INPUT_INTERVAL_MS = COOP_STEP_MS;
const SNAPSHOT_INTERVAL_MS = 50;
/** React HUD work does not need to run at the 20 Hz network snapshot rate. */
const HUD_INTERVAL_MS = 100;
const COOP_BUILD_TYPES: readonly CoopStructureType[] = ['barricade', 'arc_fence', 'recovery_relay', 'decoy_beacon', 'bridge_segment'];
const WORLD_CONDITIONS = {
  neon_bastion: 'STABLE PLATFORM · SIGNAL STORM',
  cinderworks: 'BURNING PLATES · FURNACE RUPTURES',
  white_silence: 'THIN ICE · CRYOSEISMIC WAVES',
  null_garden: 'LOW GRAVITY · VOID RIFTS · ENERGIZED PATHS',
} as const;
type DeploymentStage = 'briefing' | 'ready' | 'released' | 'complete';

export function deploymentSectorNumber(players: readonly Pick<CoopPlayerSeed, 'id'>[]) {
  const hash = players.reduce((total, player) => {
    for (let index = 0; index < player.id.length; index++) total = (total * 31 + player.id.charCodeAt(index)) >>> 0;
    return total;
  }, 2166136261);
  return String(hash % 24 + 1).padStart(2, '0');
}

/**
 * The first playable direct-connection arena. It intentionally stays separate
 * from the legacy GameEngine while the latter is converted from a one-player
 * browser simulation into a shared squad simulation.
 */
export function MultiplayerArena({ launch, controlScheme, onExit }: { launch: MultiplayerLaunch; controlScheme: ControlScheme; onExit: () => void }) {
  const tr = (key: CoopTextKey, params?: Record<string, string | number>) => coopText(launch.language, key, params);
  const sceneRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MultiplayerRendererBridge | null>(null);
  const simulationRef = useRef<CoopSimulation | null>(null);
  if (launch.role === 'host' && !simulationRef.current) simulationRef.current = new CoopSimulation(launch.players, 0xdecafbad, undefined, launch.worldId);
  const snapshotRef = useRef<CoopSnapshot | null>(null);
  if (simulationRef.current && !snapshotRef.current) snapshotRef.current = simulationRef.current.createSnapshot();
  const presentationRef = useRef({ previous: snapshotRef.current as CoopSnapshot | null, current: snapshotRef.current as CoopSnapshot | null, receivedAt: performance.now(), durationMs: INPUT_INTERVAL_MS });
  const snapshotInterpolatorRef = useRef(new CoopSnapshotInterpolator());
  const inputRef = useRef<MultiplayerInputFrame>(createInput());
  const mobileInputHandlerRef = useRef<((action: MobileCoopAction) => void) | null>(null);
  const networkTickRef = useRef(0);
  const adminOpenRef = useRef(false);
  const adminPausedRef = useRef(false);
  const ownerAvailableRef = useRef(false);
  const lastAdminSequenceByPeerRef = useRef(new Map<string, number>());
  const displayedCombatEventsRef = useRef(new Map<number, number>());
  const healingPopTimersRef = useRef(new Set<number>());
  const specialReadyTimerRef = useRef<number | null>(null);
  const specialWasReadyRef = useRef(false);
  const specialReadyOperatorRef = useRef<string | null>(null);
  const specialReadySequenceRef = useRef(0);
  const sessionCloseTimerRef = useRef(0);
  const settledRunRef = useRef<string | null>(null);
  const spectatorTargetRef = useRef<string | null>(null);
  const downedSpectatorTargetRef = useRef<string | null>(null);
  // Input listeners are installed once for the arena. Keep the station's
  // focus state in a ref too, so those listeners can immediately stop sending
  // look/fire/wheel input while the UI is open.
  const stationOpenRef = useRef(false);
  const foundryOpenRef = useRef(false);
  const backpackOpenRef = useRef(false);
  const tacticalMapOpenRef = useRef(false);
  const chatOpenRef = useRef(false);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const adminInputRef = useRef<HTMLInputElement>(null);
  const chatMessageSequenceRef = useRef(0);
  const buildModeRef = useRef(false);
  const buildTypeRef = useRef<CoopStructureType>('barricade');
  const buildRequestIdRef = useRef(0);
  const buildRotationRef = useRef(0);
  const buildSnappingRef = useRef(true);
  const buildBPressedAtRef = useRef(0);
  const buildBWasActiveRef = useRef(false);
  const buildBTimerRef = useRef<number | null>(null);
  const deploymentBlockedRef = useRef(true);
  const deploymentStageRef = useRef<DeploymentStage>('briefing');
  const deploymentTimersRef = useRef<number[]>([]);
  const deploymentSyncPlayedRef = useRef(false);
  const stationCategoryRef = useRef<CoopShopCategoryId | null>(null);
  const [hud, setHud] = useState({ players: launch.players.length, kills: 0, tick: 0, connected: true, selectedSlot: 0, weaponLevel: 1, health: 100, maxHealth: 100, level: 1, experience: 0, experienceToNextLevel: 120, coins: 0, cores: 0, fabricatorCharges: 0, fabricatorRechargeRemainingMs: 0, weapons: [] as CoopSnapshot['players'][number]['weaponStates'], isReloading: false, isAiming: false, actionEndsAt: undefined as number | undefined, lifeState: 'alive' as CoopSnapshot['players'][number]['lifeState'], downedRemainingMs: 0, reviveProgressMs: 0, reviverId: undefined as string | undefined, invulnerableRemainingMs: 0, matchState: 'active' as CoopSnapshot['matchState'], squad: [] as Array<Pick<CoopSnapshot['players'][number], 'id' | 'label' | 'color' | 'health' | 'maxHealth' | 'lifeState' | 'downedRemainingMs' | 'reviveProgressMs' | 'reviverId'>> });
  const [combatNotice, setCombatNotice] = useState<{ text: string; color: string } | null>(null);
  const [specialReadyCue, setSpecialReadyCue] = useState<{ id: number; name: string; color: string } | null>(null);
  const [healingPops, setHealingPops] = useState<Array<{ id: number; amount: number }>>([]);
  const [damageFlashKey, setDamageFlashKey] = useState<number | null>(null);
  const damageFlashTimerRef = useRef<number | null>(null);
  const damageFlashExpiresAtRef = useRef(0);
  const fallCinematicTimerRef = useRef<number | null>(null);
  const [fallCinematicActive, setFallCinematicActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('connected');
  const [connectionMessage, setConnectionMessage] = useState(tr(launch.role === 'host' ? 'connection.hostOpen' : 'connection.connected'));
  const [imprintProfile, setImprintProfile] = useState<CoopImprintProfile>(readCoopImprintProfile);
  const imprintProfileRef = useRef(imprintProfile);
  const localOperatorId = launch.players.find(player => player.id === launch.localPlayerId)?.imprint?.operatorId || 'phantom';

  const applyLocalImprintProfile = (next: CoopImprintProfile) => {
    imprintProfileRef.current = next;
    const imprint = getCoopOperatorImprint(next, localOperatorId);
    const loadout = normalizeCoopImprintLoadout(imprint, localOperatorId);
    const seed = launch.players.find(player => player.id === launch.localPlayerId);
    if (seed) seed.imprint = loadout;
    writeCoopImprintProfile(next);
    setImprintProfile(next);
    if (launch.role === 'host') simulationRef.current?.updatePlayerImprint(launch.localPlayerId, loadout);
    else if (launch.role === 'guest') launch.session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'imprint_update', payload: loadout });
  };

  const upgradeImprint = (statId: CoopImprintStatId) => {
    const current = imprintProfileRef.current;
    const next = purchaseCoopImprintRank(current, localOperatorId, statId);
    if (next.revision !== current.revision) applyLocalImprintProfile(next);
  };

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
  const [isMobileTouchDevice, setIsMobileTouchDevice] = useState(false);
  const [matchSnapshot, setMatchSnapshot] = useState<CoopSnapshot | null>(snapshotRef.current);
  const [stationOpen, setStationOpen] = useState(false);
  const [stationCategory, setStationCategory] = useState<CoopShopCategoryId | null>(null);
  const [stationMessage, setStationMessage] = useState<string | null>(null);
  const [foundryOpen, setFoundryOpen] = useState(false);
  const [foundryMessage, setFoundryMessage] = useState<string | null>(null);
  const [backpackOpen, setBackpackOpen] = useState(false);
  const [tacticalMapOpen, setTacticalMapOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [chatMessages, setChatMessages] = useState<CoopChatMessage[]>([]);
  const [ownerAvailable, setOwnerAvailable] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminDraft, setAdminDraft] = useState('');
  const [adminHistory, setAdminHistory] = useState<string[]>([]);
  const [adminLog, setAdminLog] = useState<Array<{ id: number; tone: 'input' | 'ok' | 'error' | 'info'; text: string }>>([
    { id: 0, tone: 'info', text: 'OWNER CONTROL MESH · Type help for commands.' },
  ]);
  const [adminPaused, setAdminPaused] = useState(false);
  const [backpackMessage, setBackpackMessage] = useState<string | null>(null);
  const [buildMode, setBuildModeState] = useState(false);
  const [buildPaletteExpanded, setBuildPaletteExpanded] = useState(false);
  const [buildType, setBuildTypeState] = useState<CoopStructureType>('barricade');
  const [buildMessage, setBuildMessage] = useState<string | null>(null);
  const [spectatorTarget, setSpectatorTarget] = useState<{ id: string; label: string } | null>(null);
  const [downedSpectatorTarget, setDownedSpectatorTarget] = useState<{ id: string; label: string } | null>(null);
  const [deploymentStage, setDeploymentStage] = useState<DeploymentStage>('briefing');
  const isSpectator = launch.role === 'spectator';
  const reticleMode: CoopReticleMode = hud.isAiming ? 'ads' : 'hip';

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(pointer: coarse) and (max-width: 1100px)');
    const refresh = () => setIsMobileTouchDevice(media.matches && navigator.maxTouchPoints > 0);
    refresh();
    media.addEventListener?.('change', refresh);
    return () => media.removeEventListener?.('change', refresh);
  }, []);

  useEffect(() => {
    let active = true;
    const refreshOwner = () => void hasCoopOwnerCredential().then(available => {
      if (!active) return;
      ownerAvailableRef.current = available;
      setOwnerAvailable(available);
    });
    refreshOwner();
    window.addEventListener('killsync-owner-changed', refreshOwner);
    return () => { active = false; window.removeEventListener('killsync-owner-changed', refreshOwner); };
  }, []);

  const releaseDeployment = useCallback((requestControl: boolean = false) => {
    if (deploymentStageRef.current === 'released' || deploymentStageRef.current === 'complete') return;
    deploymentStageRef.current = 'released';
    if (requestControl) {
      soundManager.activate();
      // Pointer Lock must run inside this trusted click. React will clear the
      // presentation-only block on the following render, which is too late
      // for strict browsers, so release the renderer synchronously first.
      rendererRef.current?.setInteractionBlocked(false);
      rendererRef.current?.requestPointerLock();
    }
    soundManager.playDeploymentRelease();
    setDeploymentStage('released');
    const completionTimer = window.setTimeout(() => {
      deploymentBlockedRef.current = false;
      deploymentStageRef.current = 'complete';
      setDeploymentStage('complete');
    }, 720);
    deploymentTimersRef.current.push(completionTimer);
  }, []);

  useEffect(() => {
    deploymentBlockedRef.current = true;
    if (!deploymentSyncPlayedRef.current) {
      deploymentSyncPlayedRef.current = true;
      soundManager.playDeploymentSync();
    }
    if (isSpectator) {
      deploymentTimersRef.current.push(window.setTimeout(() => releaseDeployment(false), 1_650));
    } else {
      deploymentTimersRef.current.push(window.setTimeout(() => {
        deploymentStageRef.current = 'ready';
        setDeploymentStage('ready');
      }, 2_650));
      // Never let a missed click turn the cinematic into a dangerous blindfold.
      deploymentTimersRef.current.push(window.setTimeout(() => releaseDeployment(false), 5_200));
    }
    return () => {
      deploymentTimersRef.current.forEach(timer => window.clearTimeout(timer));
      deploymentTimersRef.current = [];
    };
  }, [isSpectator, releaseDeployment]);

  const setBuildMode = (enabled: boolean) => {
    buildModeRef.current = enabled;
    setBuildModeState(enabled);
    if (!enabled) setBuildPaletteExpanded(false);
    if (!enabled) rendererRef.current?.setBuildPreview(undefined);
  };

  const selectBuildType = (type: CoopStructureType) => {
    buildTypeRef.current = type;
    setBuildTypeState(type);
    setBuildMessage(null);
  };

  const setStationPanelOpen = (next: boolean | ((current: boolean) => boolean)) => {
    const resolved = typeof next === 'function' ? next(stationOpenRef.current) : next;
    stationOpenRef.current = resolved;
    setStationOpen(resolved);
    if (!resolved) {
      stationCategoryRef.current = null;
      setStationCategory(null);
    }
  };

  const setFoundryPanelOpen = (next: boolean) => {
    foundryOpenRef.current = next;
    setFoundryOpen(next);
  };

  const setBackpackPanelOpen = (next: boolean) => {
    backpackOpenRef.current = next;
    setBackpackOpen(next);
    if (!next) setBackpackMessage(null);
  };

  const setTacticalMapPanelOpen = (next: boolean) => {
    tacticalMapOpenRef.current = next;
    setTacticalMapOpen(next);
  };

  const setChatPanelOpen = (next: boolean) => {
    chatOpenRef.current = next;
    setChatOpen(next);
    if (next) window.requestAnimationFrame(() => chatInputRef.current?.focus({ preventScroll: true }));
  };

  const closeChatAndResume = () => {
    setChatPanelOpen(false);
    setChatDraft('');
    if (!stationOpenRef.current && !foundryOpenRef.current && !backpackOpenRef.current && !tacticalMapOpenRef.current
      && !matchSnapshot?.results && hud.matchState === 'active' && connectionStatus !== 'disconnected') resumeGameplayInteraction();
  };

  const addChatMessage = (message: CoopChatMessage) => {
    setChatMessages(history => appendCoopChatMessage(history, message));
  };

  const addAdminLog = (tone: 'input' | 'ok' | 'error' | 'info', text: string) => {
    setAdminLog(history => [...history, { id: Date.now() + Math.random(), tone, text }].slice(-80));
  };

  const setAdminPanelOpen = (next: boolean) => {
    if (!ownerAvailableRef.current && next) return;
    adminOpenRef.current = next;
    setAdminOpen(next);
    if (next) window.requestAnimationFrame(() => adminInputRef.current?.focus({ preventScroll: true }));
  };

  const closeAdminAndResume = () => {
    setAdminPanelOpen(false);
    if (!adminPausedRef.current && !stationOpenRef.current && !foundryOpenRef.current && !backpackOpenRef.current && !tacticalMapOpenRef.current && !chatOpenRef.current) resumeGameplayInteraction();
  };

  const sendChatMessage = () => {
    const text = normalizeCoopChatText(chatDraft);
    if (!text || isSpectator) return false;
    if (launch.role === 'host') {
      const player = snapshotRef.current?.players.find(candidate => candidate.id === launch.localPlayerId)
        || launch.players.find(candidate => candidate.id === launch.localPlayerId);
      if (!player) return false;
      const message: CoopChatMessage = {
        id: `${launch.localPlayerId}:${Date.now().toString(36)}:${++chatMessageSequenceRef.current}`,
        playerId: player.id,
        playerLabel: player.label,
        playerColor: player.color,
        text,
        sentAt: Date.now(),
      };
      addChatMessage(message);
      launch.session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'chat', payload: message });
    } else {
      const delivered = launch.session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'chat', payload: { text } });
      if (!delivered) return false;
    }
    setChatDraft('');
    return true;
  };

  const executeAdminCommandAtHost = (raw: string, actorPlayerId: string): CoopAdminCommandResult & { kickPeerId?: string } => {
    const simulation = simulationRef.current;
    if (launch.role !== 'host' || !simulation) return { ok: false, message: 'The authoritative host is unavailable.' };
    const parsed = parseCoopAdminCommand(raw);
    if ('ok' in parsed) return parsed;
    const snapshot = simulation.createSnapshot();
    const targetPlayers = (selector?: string) => resolveCoopAdminTargets(snapshot, selector, actorPlayerId);
    const requireTargets = (selector?: string) => {
      const targets = targetPlayers(selector);
      return targets.length ? targets : null;
    };
    const labels = (players: ReturnType<typeof targetPlayers>) => players.map(player => player.label).join(', ');
    const markNotice = (message: string, modified = false) => {
      launch.session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'admin_notice', payload: { message, kind: modified ? 'warning' : 'info', modified } });
      setCombatNotice({ text: message, color: modified ? '#fbbf24' : '#67e8f9' });
    };

    if (parsed.name === 'help') return { ok: true, message: COOP_ADMIN_HELP.join('\n') };
    if (parsed.name === 'players') return {
      ok: true,
      message: snapshot.players.map((player, index) => `${String(index + 1).padStart(2, '0')}  ${player.label}  ${player.lifeState}  ${Math.ceil(player.health)}/${Math.ceil(player.maxHealth)}  #${player.id}`).join('\n') || 'No active operators.',
    };
    if (parsed.name === 'status') return {
      ok: true,
      message: `HOST ONLINE · ${snapshot.world?.name || 'UNKNOWN WORLD'} · tick ${snapshot.tick} · ${snapshot.players.length} players · ${snapshot.enemies.length} hostiles · ${adminPausedRef.current ? 'PAUSED' : 'RUNNING'} · ${snapshot.administration?.modified ? 'MODIFIED RUN' : 'CLEAN RUN'}`,
    };
    if (parsed.name === 'announce') {
      const message = parsed.args.join(' ').trim().slice(0, 180);
      if (!message) return { ok: false, message: 'Usage: announce <message>' };
      markNotice(`OWNER: ${message}`);
      return { ok: true, message: `Announcement sent: ${message}` };
    }
    if (parsed.name === 'pause' || parsed.name === 'resume') {
      const paused = parsed.name === 'pause';
      adminPausedRef.current = paused;
      setAdminPaused(paused);
      const message = paused ? 'OWNER PAUSED THE OPERATION' : 'OWNER RESUMED THE OPERATION';
      launch.session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'admin_notice', payload: { message, kind: 'info', paused } });
      setCombatNotice({ text: message, color: '#67e8f9' });
      return { ok: true, message };
    }
    if (parsed.name === 'restart') {
      adminPausedRef.current = false;
      setAdminPaused(false);
      retryRun();
      markNotice('OWNER RESTARTED THE OPERATION');
      return { ok: true, message: 'Operation restarted.' };
    }
    if (parsed.name === 'kick') {
      const targets = requireTargets(parsed.args[0]);
      if (!targets || targets.length !== 1) return { ok: false, message: targets ? 'Kick requires exactly one operator.' : 'No operator matched that target.' };
      const target = targets[0];
      if (target.id === launch.players[0]?.id) return { ok: false, message: 'The authoritative host cannot be kicked from its own peer session.' };
      const peerEntry = Object.entries(launch.peerPlayerIds).find(([, playerId]) => playerId === target.id);
      if (!peerEntry) return { ok: false, message: `${target.label} has no active peer connection.` };
      const [peerId] = peerEntry;
      const reason = parsed.args.slice(1).join(' ').trim().slice(0, 120) || 'Removed by owner.';
      launch.session.sendEventTo(peerId, { type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'admin_notice', payload: { message: `REMOVED BY OWNER · ${reason}`, kind: 'kick' } });
      simulation.removePlayer(target.id);
      delete launch.peerPlayerIds[peerId];
      window.setTimeout(() => launch.session.disconnectPeer(peerId), 120);
      markNotice(`${target.label} REMOVED BY OWNER`);
      return { ok: true, message: `${target.label} removed: ${reason}`, kickPeerId: peerId };
    }

    if (parsed.name === 'heal') {
      const targets = requireTargets(parsed.args[0]);
      if (!targets) return { ok: false, message: 'No operator matched that target.' };
      const amountToken = parsed.args[1]?.toLowerCase();
      const amount = !amountToken || amountToken === 'full' ? undefined : Number(amountToken);
      if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) return { ok: false, message: 'Heal amount must be a positive number or “full”.' };
      const changed = simulation.adminHeal(targets.map(player => player.id), amount);
      if (!changed) return { ok: false, message: 'No living target needed healing.' };
      markNotice(`OWNER HEALED ${labels(targets)}`, true);
      return { ok: true, message: `Healed ${labels(targets)}.`, modified: true };
    }
    if (parsed.name === 'revive' || parsed.name === 'redeploy') {
      const targets = requireTargets(parsed.args[0]);
      if (!targets) return { ok: false, message: 'No operator matched that target.' };
      const changed = simulation.adminRevive(targets.map(player => player.id));
      if (!changed) return { ok: false, message: 'No selected operator was downed or eliminated.' };
      markNotice(`OWNER REDEPLOYED ${labels(targets)}`, true);
      return { ok: true, message: `Redeployed ${labels(targets)}.`, modified: true };
    }
    if (parsed.name === 'give') {
      const targets = requireTargets(parsed.args[0]);
      if (!targets) return { ok: false, message: 'No operator matched that target.' };
      const resource = parsed.args[1]?.toLowerCase();
      if (!['credits', 'cores', 'ammo', 'fabricator', 'selfrevive'].includes(resource)) return { ok: false, message: 'Usage: give <target> <credits|cores|ammo|fabricator|selfrevive> <amount|full>' };
      const amountToken = parsed.args[2]?.toLowerCase();
      const amount = resource === 'ammo' || amountToken === 'full' ? undefined : Number(amountToken || (resource === 'credits' ? 500 : 1));
      if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) return { ok: false, message: 'Grant amount must be a positive number.' };
      simulation.adminGive(targets.map(player => player.id), resource as 'credits' | 'cores' | 'ammo' | 'fabricator' | 'selfrevive', amount);
      markNotice(`OWNER GRANTED ${resource.toUpperCase()} TO ${labels(targets)}`, true);
      return { ok: true, message: `Granted ${resource} to ${labels(targets)}.`, modified: true };
    }
    const teleportWorldToken = parsed.name === 'teleport'
      ? (parsed.args[0]?.toLowerCase() === 'world' ? parsed.args[1] : parsed.args.length === 1 ? parsed.args[0] : undefined)
      : undefined;
    const requestedWorld = parsed.name === 'world'
      ? resolveCoopAdminWorld(parsed.args[0])
      : resolveCoopAdminWorld(teleportWorldToken);
    if (parsed.name === 'world' || requestedWorld) {
      if (!requestedWorld) return { ok: false, message: 'Usage: world <1|2|3|4|world-id>' };
      const destination = getWorldDefinition(requestedWorld);
      if (!simulation.adminSetWorld(requestedWorld)) return { ok: false, message: `Squad is already deployed in ${destination.name}.` };
      markNotice(`OWNER TELEPORTED SQUAD TO WORLD ${destination.tier} · ${destination.name}`, true);
      return { ok: true, message: `Teleported the squad to World ${destination.tier}: ${destination.name}.`, modified: true };
    }
    if (parsed.name === 'teleport') {
      const targets = requireTargets(parsed.args[0]);
      if (!targets) return { ok: false, message: 'No operator matched that target.' };
      const destinationToken = parsed.args[1] || 'me';
      let x = COOP_WORLD_SIZE / 2, y = COOP_WORLD_SIZE / 2;
      if (destinationToken !== 'center') {
        const destination = requireTargets(destinationToken)?.[0];
        if (!destination) return { ok: false, message: 'No destination operator matched.' };
        x = destination.x; y = destination.y;
      }
      simulation.adminTeleport(targets.map(player => player.id), x, y);
      markNotice(`OWNER TELEPORTED ${labels(targets)}`, true);
      return { ok: true, message: `Teleported ${labels(targets)}.`, modified: true };
    }
    if (parsed.name === 'spawn') {
      const type = parsed.args[0]?.toLowerCase();
      if (!type || !isCoopEnemyType(type)) return { ok: false, message: 'Usage: spawn <enemy-type> [count] [near-target]' };
      const count = Math.max(1, Math.min(40, Math.trunc(Number(parsed.args[1] || 1))));
      if (!Number.isFinite(count)) return { ok: false, message: 'Spawn count must be between 1 and 40.' };
      const near = requireTargets(parsed.args[2] || 'me')?.[0];
      if (!near) return { ok: false, message: 'No spawn target matched.' };
      const spawned = simulation.adminSpawn(type, count, near.id);
      if (!spawned) return { ok: false, message: 'No enemy capacity is currently available.' };
      markNotice(`OWNER SPAWNED ${spawned} ${type.toUpperCase()}`, true);
      return { ok: true, message: `Spawned ${spawned} ${type}.`, modified: true };
    }
    const killed = simulation.adminKillAll();
    if (!killed) return { ok: true, message: 'No active hostiles to clear.' };
    markNotice(`OWNER CLEARED ${killed} HOSTILES`, true);
    return { ok: true, message: `Cleared ${killed} hostiles.`, modified: true };
  };

  const submitAdminCommand = async () => {
    const command = adminDraft.trim();
    if (!command || !ownerAvailable) return;
    addAdminLog('input', `> ${command}`);
    setAdminHistory(history => [...history.filter(entry => entry !== command), command].slice(-30));
    setAdminDraft('');
    if (launch.role === 'host') {
      const result = executeAdminCommandAtHost(command, launch.localPlayerId);
      addAdminLog(result.ok ? 'ok' : 'error', result.message);
      return;
    }
    try {
      const request = await signCoopAdminCommand(launch.session.authoritySessionId, launch.localPlayerId, command);
      const delivered = launch.session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'admin_request', payload: request });
      if (!delivered) addAdminLog('error', 'The command could not reach the authoritative host.');
    } catch (error) {
      addAdminLog('error', error instanceof Error ? error.message : 'Could not sign owner command.');
    }
  };

  const resumeGameplayInteraction = () => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setInteractionBlocked(false);
    renderer.focusCanvas();
    renderer.requestPointerLock();
  };

  const closeStationAndResume = () => {
    setStationPanelOpen(false);
    setBackpackPanelOpen(false);
    resumeGameplayInteraction();
  };

  const closeFoundryAndResume = () => {
    setFoundryPanelOpen(false);
    resumeGameplayInteraction();
  };

  const closeBackpackAndResume = () => {
    setBackpackPanelOpen(false);
    resumeGameplayInteraction();
  };

  const dropBackpackItem = (kind: CoopInventoryDropKind) => {
    if (launch.role === 'host') {
      const issue = simulationRef.current?.dropInventory(launch.localPlayerId, kind);
      setBackpackMessage(issue ? tr('backpack.empty') : tr(kind === 'cash' ? 'backpack.cashDropped' : 'backpack.reviveDropped'));
      return;
    }
    launch.session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'inventory_drop', payload: { kind } });
    setBackpackMessage(tr('backpack.dropRequested'));
  };

  const chooseStationCategory = (category: CoopShopCategoryId | null) => {
    stationCategoryRef.current = category;
    setStationCategory(category);
    setStationMessage(null);
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
    if (local?.lifeState !== 'downed' && local?.lifeState !== 'eliminated' && local?.lifeState !== 'extracted') {
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
      const issue = simulationRef.current?.purchase(launch.localPlayerId, stationId, itemId);
      setStationMessage(issue ? tr(`purchase.${issue.code}` as CoopTextKey, { amount: issue.amount || 0 }) : tr('shop.acquired', { item: tr(coopItemNameKey(itemId)) }));
      return;
    }
    launch.session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'station_purchase', payload: { stationId, itemId } });
    setStationMessage(tr('shop.requestSent'));
  };

  const redeployOperator = (stationId: number, targetPlayerId: string) => {
    if (launch.role === 'host') {
      const issue = simulationRef.current?.redeployPlayer(launch.localPlayerId, stationId, targetPlayerId);
      const target = snapshotRef.current?.players.find(player => player.id === targetPlayerId);
      setStationMessage(issue
        ? tr(`purchase.${issue.code}` as CoopTextKey, { amount: issue.amount || 0 })
        : tr('shop.redeploy.success', { name: target?.label || tr('notice.squadmate') }));
      return;
    }
    launch.session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'operator_redeploy', payload: { stationId, targetPlayerId } });
    setStationMessage(tr('shop.requestSent'));
  };

  const forgeWeapon = (foundryId: number, weaponId: CoopFirearmId) => {
    if (launch.role === 'host') {
      const issue = simulationRef.current?.forgeWeapon(launch.localPlayerId, foundryId, weaponId);
      const level = snapshotRef.current?.players.find(player => player.id === launch.localPlayerId)?.weaponStates.find(weapon => weapon.weaponId === weaponId)?.level || 1;
      setFoundryMessage(issue ? tr(`foundry.${issue.code}` as CoopTextKey, { amount: issue.amount || 0 }) : tr('foundry.forged', { weapon: tr(coopWeaponNameKey(weaponId)), level: level + 1 }));
      return;
    }
    launch.session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'foundry_upgrade', payload: { foundryId, weaponId } });
    setFoundryMessage(tr('foundry.requestSent'));
  };

  /** Replaces only the authoritative simulation. The WebRTC session, peer
   * identities, and all three data channels stay intact, so nobody has to
   * exchange a connection code again after a wipe. */
  const retryRun = () => {
    if (launch.role !== 'host') return;
    const previous = simulationRef.current;
    if (!previous) return;
    const nextSimulation = new CoopSimulation(previous.getPlayerSeeds(), Date.now() >>> 0, undefined, snapshotRef.current?.world?.id || launch.worldId);
    const snapshot = nextSimulation.createSnapshot();
    const now = performance.now();
    simulationRef.current = nextSimulation;
    inputRef.current = createInput();
    snapshotRef.current = snapshot;
    snapshotInterpolatorRef.current.reset();
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
        experienceToNextLevel: local.experienceToNextLevel, coins: local.coins, cores: local.pendingDataCores, fabricatorCharges: local.fabricatorCharges || 0, fabricatorRechargeRemainingMs: local.fabricatorRechargeRemainingMs || 0, weapons: local.weaponStates,
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
    setConnectionMessage(tr('connection.newRun'));
    setCombatNotice({ text: tr('notice.newRun'), color: '#5eead4' });
    resumeGameplayInteraction();
  };

  useEffect(() => {
    const session = launch.session;
    const prediction = new LocalPlayerPrediction(launch.localPlayerId);
    // React development mode intentionally mounts, cleans up, then remounts
    // effects once. Defer irreversible peer teardown so the remount can cancel
    // it; a real arena exit has no following mount and closes the session.
    window.clearTimeout(sessionCloseTimerRef.current);
    launch.hostedLobby?.setStatusListener(message => setConnectionMessage(localizeCoopSignalingMessage(launch.language, message, 'status')));
    displayedCombatEventsRef.current.clear();
    const renderer = new MultiplayerRendererBridge(launch.worldId);
    if (sceneRef.current) renderer.mount(sceneRef.current);
    const performanceMonitor = sceneRef.current ? CoopPerformanceMonitor.mount(sceneRef.current) : undefined;
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
          const pingerName = pinger ? pinger.label : tr('notice.squadmate');
          const isDanger = event.color === '#ef4444' || event.color === '#fb7185';
          if (event.playerId !== launch.localPlayerId) {
            soundManager.playTacticalPing(isDanger);
          }
          setCombatNotice({
            text: tr(isDanger ? 'notice.dangerAlert' : 'notice.pinged', { name: pingerName.toUpperCase() }),
            color: event.color || '#22d3ee',
          });
          continue;
        }
        if (event.kind === 'mission_started') {
          const mission = snapshot.fieldMissions?.active;
          soundManager.playTacticalPing(false);
          setCombatNotice({ text: mission ? `${COOP_FIELD_MISSION_LABELS[mission.kind]} ACCEPTED · ${coopFieldMissionStageLabel(mission)} · ¤ ${mission.reward} EACH` : 'FIELD CONTRACT ACCEPTED', color: '#2dd4bf' });
          continue;
        }
        if (event.kind === 'mission_stage') {
          const mission = snapshot.fieldMissions?.active;
          const urgent = event.amount === -1 || event.amount === -2;
          soundManager.playTacticalPing(urgent);
          setCombatNotice({ text: event.amount === -1 ? 'SITE B WINDOW LOST · RESTART AT SITE A' : event.amount === -2 ? 'HOSTAGE DROPPED · RECOVER THE HOSTAGE' : mission ? coopFieldMissionStageLabel(mission) : 'MISSION OBJECTIVE UPDATED', color: event.amount === -1 ? '#fb7185' : event.color || '#fbbf24' });
          continue;
        }
        if (event.kind === 'demolition_charge_planted') {
          setCombatNotice({ text: `SITE ${event.amount === 2 ? 'B' : 'A'} CHARGE ARMED · DEFEND UNTIL DETONATION`, color: '#fb7185' });
          continue;
        }
        if (event.kind === 'demolition_charge_detonated') {
          setCombatNotice({ text: `SITE ${event.amount === 2 ? 'B' : 'A'} DESTROYED`, color: '#fb923c' });
          continue;
        }
        if (event.kind === 'mission_completed') {
          setCombatNotice({ text: `FIELD CONTRACT COMPLETE · +¤ ${event.amount || 0} EACH`, color: '#5eead4' });
          continue;
        }
        if (event.kind === 'mission_expired') {
          soundManager.playTacticalPing(false);
          setCombatNotice({ text: 'CHEM COMMANDER ELIMINATED · TOXIC HUNT REMOVED', color: '#4ade80' });
          continue;
        }
        if (event.kind === 'player_falling' && event.playerId !== launch.localPlayerId) {
          const fallen = snapshot.players.find(player => player.id === event.playerId);
          setCombatNotice({ text: tr('notice.teammateFell', { name: fallen?.label || tr('notice.squadmate') }), color: '#fbbf24' });
          continue;
        }
        if (event.kind === 'structure_healed' && event.playerId === launch.localPlayerId && (event.amount || 0) > 0) {
          const pop = { id: event.id, amount: event.amount || 0 };
          setHealingPops(current => [...current.slice(-2), pop]);
          const timer = window.setTimeout(() => {
            setHealingPops(current => current.filter(candidate => candidate.id !== pop.id));
            healingPopTimersRef.current.delete(timer);
          }, 1_150);
          healingPopTimersRef.current.add(timer);
          continue;
        }
        if (event.playerId && event.playerId !== launch.localPlayerId && event.killedByPlayerId !== launch.localPlayerId) continue;
        if (event.kind === 'enemy_hit' || event.kind === 'damage_number') continue;
        else if (event.kind === 'enemy_killed') setCombatNotice({ text: tr('notice.kill'), color: event.color || '#fb7185' });
        else if (event.kind === 'pickup_collected') {
          if (event.itemType === 'hp') setCombatNotice({ text: tr('notice.fullHealth'), color: '#ff3366' });
          else setCombatNotice({ text: event.itemType ? tr('notice.pickup', { item: tr(coopPickupNameKey(event.itemType)) }) : tr('notice.xp', { amount: Math.round(event.amount || 0) }), color: event.color || '#67e8f9' });
        }
        else if (event.kind === 'level_up') setCombatNotice({ text: tr('notice.level', { level: event.amount || 0 }), color: '#fde047' });
        else if (event.kind === 'weapon_upgraded') setCombatNotice({ text: tr('notice.weaponUpgrade', { weapon: tr(coopWeaponNameKey(event.weaponId || 'plasma_gun')).toUpperCase(), level: event.amount || 0 }), color: event.color || '#67e8f9' });
        else if (event.kind === 'ammo_collected') setCombatNotice({ text: tr('notice.ammo', { amount: event.amount || 0 }), color: event.color || '#67e8f9' });
        else if (event.kind === 'reload_started') setCombatNotice({ text: tr('notice.reloading'), color: '#f8fafc' });
        else if (event.kind === 'empty_fire') setCombatNotice({ text: tr('notice.empty'), color: '#fca5a5' });
        else if (event.kind === 'player_damaged' && event.playerId === launch.localPlayerId) { const local = snapshot.players.find(player => player.id === launch.localPlayerId); setCombatNotice({ text: tr('notice.incomingHit', { direction: tr(incomingDirection(local, event)), amount: Math.max(1, Math.round(event.amount || 0)) }), color: '#fda4af' }); triggerDamageFlash(); }
        else if (event.kind === 'player_downed' && event.playerId === launch.localPlayerId) setCombatNotice({ text: tr('notice.downed'), color: '#fb7185' });
        else if (event.kind === 'player_falling' && event.playerId === launch.localPlayerId) {
          setCombatNotice({ text: tr('notice.falling'), color: '#fbbf24' });
          setFallCinematicActive(true);
          if (fallCinematicTimerRef.current !== null) window.clearTimeout(fallCinematicTimerRef.current);
          fallCinematicTimerRef.current = window.setTimeout(() => { fallCinematicTimerRef.current = null; setFallCinematicActive(false); }, 5_000);
        }
        else if (event.kind === 'player_redeployed') {
          const target = snapshot.players.find(player => player.id === event.playerId);
          if (event.playerId === launch.localPlayerId) {
            if (fallCinematicTimerRef.current !== null) window.clearTimeout(fallCinematicTimerRef.current);
            fallCinematicTimerRef.current = null;
            setFallCinematicActive(false);
          }
          setCombatNotice({ text: tr('notice.redeployed', { name: target?.label || tr('notice.squadmate') }), color: '#5eead4' });
        }
        else if (event.kind === 'player_revived' && event.playerId === launch.localPlayerId) setCombatNotice({ text: tr('notice.revived'), color: '#5eead4' });
        else if (event.kind === 'revive_started' && event.playerId === launch.localPlayerId) setCombatNotice({ text: tr('notice.reviveStarted'), color: '#a5f3fc' });
        else if (event.kind === 'boss_ability') setCombatNotice({ text: event.amount ? tr('notice.bossPhase', { phase: event.amount }) : tr('notice.bossAttack'), color: event.color || '#fda4af' });
        else if (event.kind === 'station_online') setCombatNotice({ text: tr('notice.stationOnline'), color: '#67e8f9' });
        else if (event.kind === 'foundry_online') setCombatNotice({ text: tr('notice.foundryOnline'), color: '#f59e0b' });
        else if (event.kind === 'private_exfil_inbound') setCombatNotice({ text: `PRIVATE EXFIL INBOUND · ${event.amount || 20}s`, color: '#fbbf24' });
        else if (event.kind === 'player_extracted' && event.playerId === launch.localPlayerId) setCombatNotice({ text: 'EXTRACTED · SPECTATING SQUAD', color: '#5eead4' });
        else if (event.kind === 'exfil_deployed') setCombatNotice({ text: tr('notice.exfil'), color: '#fbbf24' });
        else if (event.kind === 'gas_warning') { setCombatNotice({ text: tr('notice.gasWarning'), color: '#f59e0b' }); soundManager.playHazardKlaxon(); }
        else if (event.kind === 'gas_spread') { setCombatNotice({ text: tr('notice.gasSpread'), color: '#4ade80' }); soundManager.playHazardKlaxon(); }
        else if (event.kind === 'mask_broken' && event.playerId === launch.localPlayerId) { setCombatNotice({ text: tr('notice.maskBroken'), color: '#f43f5e' }); soundManager.playMaskShatter(); }
        else if (event.kind === 'mask_damaged' && event.playerId === launch.localPlayerId) { soundManager.playFilterDegradation(); }
        else if (event.kind === 'gas_damaged' && event.playerId === launch.localPlayerId) { setCombatNotice({ text: tr('notice.gasDamage', { amount: Math.max(1, Math.round(event.amount || 0)) }), color: '#4ade80' }); }
        else if (event.kind === 'objective_completed') setCombatNotice({ text: tr('notice.objectiveComplete'), color: '#5eead4' });
        else if (event.kind === 'round_started') setCombatNotice({ text: tr('notice.roundStart', { round: event.amount || 0 }), color: '#fbbf24' });
        else if (event.kind === 'round_completed') setCombatNotice({ text: tr('notice.roundClear', { round: event.amount || 0 }), color: '#5eead4' });
        else if (event.kind === 'fabricator_charged' && event.playerId === launch.localPlayerId) setCombatNotice({ text: tr('notice.fabricatorCharged'), color: '#67e8f9' });
        else if (event.kind === 'fabricator_scrap' && event.playerId === launch.localPlayerId) setCombatNotice({ text: tr('notice.fabricatorScrap', { amount: event.amount || 0 }), color: '#67e8f9' });
        else if (event.kind === 'structure_built' && event.playerId === launch.localPlayerId) setCombatNotice({ text: tr('build.deployed', { structure: tr(`build.${event.structureType}.name` as CoopTextKey) }), color: event.color || '#67e8f9' });
        else if (event.kind === 'structure_damaged' && event.playerId === launch.localPlayerId) setCombatNotice({ text: tr('build.damaged'), color: '#fbbf24' });
        else if (event.kind === 'structure_destroyed' && event.playerId === launch.localPlayerId) setCombatNotice({ text: tr('build.destroyed'), color: '#fb7185' });
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
        experienceToNextLevel: local.experienceToNextLevel, coins: local.coins, cores: local.pendingDataCores, fabricatorCharges: local.fabricatorCharges || 0, fabricatorRechargeRemainingMs: local.fabricatorRechargeRemainingMs || 0, weapons: local.weaponStates,
        isReloading: local.isReloading, isAiming: local.isAiming, actionEndsAt: local.weaponActionEndsAtMs,
        lifeState: local.lifeState, downedRemainingMs: local.downedRemainingMs, reviveProgressMs: local.reviveProgressMs, reviverId: local.reviverId, invulnerableRemainingMs: local.invulnerableRemainingMs,
        matchState: snapshot.matchState,
        squad: snapshot.players.map(player => ({ id: player.id, label: player.label, color: player.color, health: player.health, maxHealth: player.maxHealth, lifeState: player.lifeState, downedRemainingMs: player.downedRemainingMs, reviveProgressMs: player.reviveProgressMs, reviverId: player.reviverId })),
      });
      presentCombatNotice(snapshot);
    };
    const publishSnapshot = (snapshot: CoopSnapshot, now: number) => {
      if (typeof snapshot.administration?.paused === 'boolean' && adminPausedRef.current !== snapshot.administration.paused) {
        adminPausedRef.current = snapshot.administration.paused;
        setAdminPaused(snapshot.administration.paused);
      }
      const timeline = presentationRef.current;
      const restarted = Boolean(timeline.current && snapshot.tick < 5 && timeline.current.tick > 20);
      if (timeline.current && snapshot.tick < timeline.current.tick && !restarted) {
        return;
      }
      const elapsedSinceLastSnapshot = now - timeline.receivedAt;
      timeline.previous = restarted ? snapshot : timeline.current || snapshot;
      if (restarted) { displayedCombatEventsRef.current.clear(); snapshotInterpolatorRef.current.reset(); }
      timeline.current = snapshot;
      timeline.receivedAt = now;
      timeline.durationMs = Math.max(20, Math.min(100, elapsedSinceLastSnapshot || INPUT_INTERVAL_MS));
      snapshotRef.current = snapshot;
      if (launch.role === 'guest') {
        prediction.reconcile(snapshot);
        if (restarted) {
          const current = getCoopOperatorImprint(readCoopImprintProfile(), localOperatorId);
          session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'imprint_update', payload: normalizeCoopImprintLoadout(current, localOperatorId) });
        }
      }
    };
    const presentationSnapshot = (now: number) => {
      const timeline = presentationRef.current;
      if (!timeline.current || !timeline.previous) return timeline.current;
      return snapshotInterpolatorRef.current.interpolate(timeline.previous, timeline.current, (now - timeline.receivedAt) / timeline.durationMs);
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
              setConnectionMessage(tr('connection.playerDisconnected'));
            }
          }
          const players = simulationRef.current?.getPlayerSeeds().length || 1;
          launch.hostedLobby?.update(players, 'in_game');
          return;
        }
        const state = peers[0]?.state;
        if (state === 'connected') { setConnectionStatus('connected'); setConnectionMessage(tr('connection.connected')); }
        else if (state === 'connecting' || state === 'disconnected') { setConnectionStatus('reconnecting'); setConnectionMessage(tr('connection.reconnecting')); }
        else if (state === 'failed' || state === 'closed') { setConnectionStatus('disconnected'); setConnectionMessage(tr('connection.lost')); }
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
        if (event.event === 'admin_request') {
          if (launch.role !== 'host') return;
          void (async () => {
            const request = await verifyCoopAdminRequest(event.payload, session.sessionId);
            if (!request) return;
            const mappedPlayerId = launch.peerPlayerIds[peerId];
            if (!mappedPlayerId || request.actorPlayerId !== mappedPlayerId) return;
            const previousSequence = lastAdminSequenceByPeerRef.current.get(peerId) || 0;
            if (request.sequence <= previousSequence) return;
            lastAdminSequenceByPeerRef.current.set(peerId, request.sequence);
            const result = executeAdminCommandAtHost(request.command, request.actorPlayerId);
            session.sendEventTo(peerId, {
              type: 'event',
              version: MULTIPLAYER_PROTOCOL_VERSION,
              event: 'admin_result',
              payload: { requestId: request.id, ok: result.ok, message: result.message, modified: result.modified },
            });
          })();
          return;
        }
        if (event.event === 'admin_result') {
          if (!event.payload || typeof event.payload !== 'object') return;
          const result = event.payload as CoopAdminResult;
          if (typeof result.message === 'string' && typeof result.ok === 'boolean') addAdminLog(result.ok ? 'ok' : 'error', result.message.slice(0, 2_000));
          return;
        }
        if (event.event === 'admin_notice') {
          if (!event.payload || typeof event.payload !== 'object') return;
          const notice = event.payload as { message?: unknown; kind?: unknown; paused?: unknown };
          if (typeof notice.message !== 'string') return;
          if (typeof notice.paused === 'boolean') {
            adminPausedRef.current = notice.paused;
            setAdminPaused(notice.paused);
          }
          setCombatNotice({ text: notice.message.slice(0, 180), color: notice.kind === 'warning' ? '#fbbf24' : notice.kind === 'kick' ? '#fb7185' : '#67e8f9' });
          if (notice.kind === 'kick') {
            setConnectionStatus('disconnected');
            setConnectionMessage(notice.message.slice(0, 180));
          }
          return;
        }
        if (event.event === 'chat') {
          if (launch.role === 'host') {
            const text = parseCoopChatRequest(event.payload);
            const playerId = launch.peerPlayerIds[peerId];
            const player = playerId && (snapshotRef.current?.players.find(candidate => candidate.id === playerId)
              || launch.players.find(candidate => candidate.id === playerId));
            if (!text || !player) return;
            const message: CoopChatMessage = {
              id: `${player.id}:${Date.now().toString(36)}:${++chatMessageSequenceRef.current}`,
              playerId: player.id,
              playerLabel: player.label,
              playerColor: player.color,
              text,
              sentAt: Date.now(),
            };
            addChatMessage(message);
            session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'chat', payload: message });
          } else {
            const message = parseCoopChatMessage(event.payload);
            if (message) addChatMessage(message);
          }
          return;
        }
        if (event.event === 'inventory_drop' && launch.role === 'host') {
          const request = parseInventoryDrop(event.payload);
          const playerId = launch.peerPlayerIds[peerId];
          if (request && playerId) simulationRef.current?.dropInventory(playerId, request.kind);
          return;
        }
        if (event.event === 'ping' && launch.role === 'host') {
          const playerId = launch.peerPlayerIds[peerId];
          const payload = event.payload as { missionSiteId?: number; x?: number; y?: number; z?: number; kind?: CoopPingKind; labelKey?: CoopTextKey; labelParams?: Record<string, string | number> } | undefined;
          if (playerId && payload && Number.isInteger(payload.missionSiteId)) {
            simulationRef.current?.addMissionPing(playerId, payload.missionSiteId!);
          } else if (playerId && payload && typeof payload.x === 'number' && typeof payload.y === 'number') {
            simulationRef.current?.addPing(playerId, payload.x, payload.y, payload.z || 0, payload.kind || 'location', isCoopTextKey(payload.labelKey) ? payload.labelKey : 'ping.waypoint', payload.labelParams);
          }
          return;
        }
        if (event.event === 'station_purchase' && launch.role === 'host') {
          const request = parseStationPurchase(event.payload);
          const playerId = launch.peerPlayerIds[peerId];
          if (request && playerId) {
            const issue = simulationRef.current?.purchase(playerId, request.stationId, request.itemId);
            const result: CoopPurchaseResult = { playerId, itemId: request.itemId, code: issue?.code || 'purchased', amount: issue?.amount };
            session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'station_purchase_result', payload: result });
          }
          return;
        }
        if (event.event === 'operator_redeploy' && launch.role === 'host') {
          const request = parseOperatorRedeploy(event.payload);
          const buyerId = launch.peerPlayerIds[peerId];
          if (request && buyerId) {
            const issue = simulationRef.current?.redeployPlayer(buyerId, request.stationId, request.targetPlayerId);
            const result: CoopRedeployResult = { buyerId, targetPlayerId: request.targetPlayerId, code: issue?.code || 'redeployed', amount: issue?.amount };
            session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'operator_redeploy_result', payload: result });
          }
          return;
        }
        if (event.event === 'foundry_upgrade' && launch.role === 'host') {
          const request = parseFoundryUpgrade(event.payload);
          const playerId = launch.peerPlayerIds[peerId];
          if (request && playerId) {
            const issue = simulationRef.current?.forgeWeapon(playerId, request.foundryId, request.weaponId);
            const result: CoopFoundryUpgradeResult = { playerId, weaponId: request.weaponId, code: issue?.code || 'forged', amount: issue?.amount };
            session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'foundry_upgrade_result', payload: result });
          }
          return;
        }
        if (event.event === 'build_structure' && launch.role === 'host') {
          const request = parseBuildStructure(event.payload);
          const playerId = launch.peerPlayerIds[peerId];
          if (request && playerId) {
            const issue = simulationRef.current?.buildStructure(playerId, request.structureType, request.x, request.y, request.angle, request.requestId);
            const result: CoopBuildResult = { playerId, requestId: request.requestId, structureType: request.structureType, code: issue?.code || 'built', amount: issue?.amount };
            session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'build_structure_result', payload: result });
          }
          return;
        }
        if (event.event === 'dismantle_structure' && launch.role === 'host') {
          const request = parseDismantleStructure(event.payload);
          const playerId = launch.peerPlayerIds[peerId];
          if (request && playerId) {
            const before = simulationRef.current?.createSnapshot().players.find(player => player.id === playerId)?.fabricatorCharges || 0;
            const issue = simulationRef.current?.dismantleStructure(playerId, request.structureId, request.requestId);
            const after = simulationRef.current?.createSnapshot().players.find(player => player.id === playerId)?.fabricatorCharges || 0;
            const result: CoopDismantleResult = { playerId, requestId: request.requestId, structureId: request.structureId, code: issue?.code || 'dismantled', refundedCharges: Math.max(0, after - before) };
            session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'dismantle_structure_result', payload: result });
          }
          return;
        }
        if (event.event === 'structure_action' && launch.role === 'host') {
          const request = parseStructureAction(event.payload);
          const playerId = launch.peerPlayerIds[peerId];
          if (request && playerId) {
            const issue = simulationRef.current?.structureAction(playerId, request.structureId, request.action, request.requestId, request.x, request.y, request.angle);
            const result: CoopStructureActionResult = { playerId, requestId: request.requestId, structureId: request.structureId, action: request.action, code: issue?.code || (request.action === 'activate' ? 'activated' : request.action === 'relocate' ? 'relocated' : 'rotated'), amount: issue?.amount };
            session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'structure_action_result', payload: result });
          }
          return;
        }
        if (event.event === 'imprint_update' && launch.role === 'host') {
          const playerId = launch.peerPlayerIds[peerId];
          if (playerId) simulationRef.current?.updatePlayerImprint(playerId, event.payload);
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
          session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'start', payload: { players, worldId: simulation.createSnapshot().world?.id || launch.worldId } });
          publishSnapshot(simulation.createSnapshot(), performance.now());
          setHud(current => ({ ...current, players: players.length }));
          launch.hostedLobby?.update(players.length, 'in_game');
          setConnectionMessage(tr('connection.playerJoined', { name: player.label }));
          return;
        }
        if (event.event === 'spectate' && launch.role === 'host') {
          const players = simulationRef.current?.getPlayerSeeds();
          if (players?.length) session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'start', payload: { players, worldId: simulationRef.current?.createSnapshot().world?.id || launch.worldId } });
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
              setConnectionMessage(tr('connection.playerLeft'));
            }
          } else {
            setConnectionStatus('disconnected');
            setConnectionMessage(tr('connection.hostLeft'));
          }
        }
        if (event.event === 'station_purchase_result' && launch.role === 'guest') {
          const result = parseStationPurchaseResult(event.payload);
          if (result?.playerId === launch.localPlayerId) setStationMessage(result.code === 'purchased'
            ? tr('shop.acquired', { item: tr(coopItemNameKey(result.itemId)) })
            : tr(`purchase.${result.code}` as CoopTextKey, { amount: result.amount || 0 }));
        }
        if (event.event === 'operator_redeploy_result' && launch.role === 'guest') {
          const result = parseOperatorRedeployResult(event.payload);
          if (result?.buyerId === launch.localPlayerId) {
            const target = snapshotRef.current?.players.find(player => player.id === result.targetPlayerId);
            setStationMessage(result.code === 'redeployed'
              ? tr('shop.redeploy.success', { name: target?.label || tr('notice.squadmate') })
              : tr(`purchase.${result.code}` as CoopTextKey, { amount: result.amount || 0 }));
          }
        }
        if (event.event === 'foundry_upgrade_result' && launch.role === 'guest') {
          const result = parseFoundryUpgradeResult(event.payload);
          if (result?.playerId === launch.localPlayerId) {
            const runtime = snapshotRef.current?.players.find(player => player.id === launch.localPlayerId)?.weaponStates.find(weapon => weapon.weaponId === result.weaponId);
            setFoundryMessage(result.code === 'forged'
              ? tr('foundry.forged', { weapon: tr(coopWeaponNameKey(result.weaponId)), level: (runtime?.level || 1) + 1 })
              : tr(`foundry.${result.code}` as CoopTextKey, { amount: result.amount || 0 }));
          }
        }
        if (event.event === 'build_structure_result' && launch.role === 'guest') {
          const result = parseBuildResult(event.payload);
          if (result?.playerId === launch.localPlayerId) setBuildMessage(result.code === 'built'
            ? tr('build.deployed', { structure: tr(`build.${result.structureType}.name` as CoopTextKey) })
            : tr(`build.error.${result.code}` as CoopTextKey, { amount: result.amount || 0 }));
        }
        if (event.event === 'dismantle_structure_result' && launch.role === 'guest') {
          const result = parseDismantleResult(event.payload);
          if (result?.playerId === launch.localPlayerId) setBuildMessage(result.code === 'dismantled'
            ? tr(result.refundedCharges ? 'build.dismantledRefund' : 'build.dismantled', { amount: result.refundedCharges || 0 })
            : tr(`build.error.${result.code}` as CoopTextKey));
        }
        if (event.event === 'structure_action_result' && launch.role === 'guest') {
          const result = parseStructureActionResult(event.payload);
          if (result?.playerId === launch.localPlayerId) setBuildMessage(result.code === 'activated' || result.code === 'rotated' || result.code === 'relocated'
            ? tr(result.code === 'activated' ? 'build.action.activated' : result.code === 'relocated' ? 'build.action.relocated' : 'build.action.rotated')
            : tr(`build.error.${result.code}` as CoopTextKey, { amount: result.amount || 0 }));
        }
      },
      onError: () => {
        if (launch.role === 'guest' || launch.role === 'spectator') { setConnectionStatus('disconnected'); setConnectionMessage(tr('connection.lost')); }
      },
    });

    const keys = new Set<string>();
    const movementBindings = getMovementBindings(controlScheme);
    const slideBinding = getCoopSlideBinding(controlScheme);
    let firing = false;
    const mobile = { moveX: 0, moveY: 0, fire: false, aim: false, jump: false, slide: false, sprint: false, interact: false };
    let sequence = inputRef.current.sequence;
    let fireActionId = inputRef.current.fireActionId || 0;
    let altFireActionId = inputRef.current.altFireActionId || 0;
    let interactActionId = inputRef.current.interactActionId || 0;
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
    const changeSelectedWeapon = (direction: number) => {
      const slotCount = snapshotRef.current?.players.find(player => player.id === launch.localPlayerId)?.weaponStates.length || COOP_WEAPON_SLOTS.length;
      const selectedSlot = (inputRef.current.selectedSlot + direction + slotCount) % slotCount;
      inputRef.current = { ...inputRef.current, selectedSlot };
      setHud(current => ({ ...current, selectedSlot }));
    };
    const updateMobileInput = () => {
      const movement = (mobile.moveY < -.22 ? 1 : 0)
        | (mobile.moveY > .22 ? 2 : 0)
        | (mobile.moveX < -.22 ? 4 : 0)
        | (mobile.moveX > .22 ? 8 : 0);
      const specialSelected = inputRef.current.selectedSlot === 3;
      firing = mobile.fire && !buildModeRef.current;
      inputRef.current = {
        ...inputRef.current,
        sequence: ++sequence,
        clientTime: Date.now(),
        movement,
        aimAngle: quantizeAngle(renderer.getAimAngle()),
        aimPitch: quantizePitch(renderer.getAimPitch()),
        firing,
        aiming: mobile.aim && !specialSelected,
        sprinting: mobile.sprint,
        sliding: mobile.slide && !buildModeRef.current,
        reviving: mobile.interact,
        jetHeld: mobile.jump,
      };
    };
    const clearJumpInput = () => {
      if (!inputRef.current.jumpPressed && !inputRef.current.reloadPressed) return;
      inputRef.current = { ...inputRef.current, sequence: ++sequence, clientTime: Date.now(), jumpPressed: false, reloadPressed: false };
    };
    let lastPingClickTime = 0;
    const triggerPing = (forcedKind?: CoopPingKind) => {
      if (isSpectator || stationOpenRef.current || foundryOpenRef.current || backpackOpenRef.current || tacticalMapOpenRef.current || chatOpenRef.current) return;
      const local = snapshotRef.current?.players.find(player => player.id === launch.localPlayerId);
      if (!local || local.lifeState === 'eliminated') return;
      const target = renderer.calculatePingTarget(snapshotRef.current, launch.localPlayerId);
      if (!target) return;

      const isDanger = forcedKind === 'enemy';
      const kind: CoopPingKind = forcedKind || target.kind;
      const labelKey: CoopTextKey = isDanger ? 'ping.danger' : target.labelKey;
      const labelParams = isDanger ? undefined : target.labelParams;
      const label = tr(labelKey, labelParams);
      const color = isDanger || kind === 'enemy' || kind === 'boss' ? '#ef4444' : kind === 'revive' ? '#fbbf24' : '#22d3ee';

      soundManager.playTacticalPing(isDanger);
      if (launch.role === 'host') {
        simulationRef.current?.addPing(launch.localPlayerId, target.x, target.y, target.z, kind, labelKey, labelParams);
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
            labelKey,
            labelParams,
          },
        });
      }
      setCombatNotice({
        text: isDanger ? tr('notice.pingDanger') : tr('notice.pingTarget', { label }),
        color,
      });
    };

    const placeStructure = () => {
      const type = buildTypeRef.current;
      const pose = renderer.getBuildPose(snapshotRef.current, launch.localPlayerId, type, buildRotationRef.current, buildSnappingRef.current);
      if (!pose) return;
      const requestId = ++buildRequestIdRef.current;
      if (launch.role === 'host') {
        const issue = simulationRef.current?.buildStructure(launch.localPlayerId, type, pose.x, pose.y, pose.angle, requestId);
        setBuildMessage(issue
          ? tr(`build.error.${issue.code}` as CoopTextKey, { amount: issue.amount || 0 })
          : tr('build.deployed', { structure: tr(`build.${type}.name` as CoopTextKey) }));
      } else {
        session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'build_structure', payload: { requestId, structureType: type, ...pose } });
        setBuildMessage(tr('build.requestSent'));
      }
    };

    const dismantleAimedStructure = () => {
      const snapshot = snapshotRef.current;
      const local = snapshot?.players.find(player => player.id === launch.localPlayerId);
      if (!snapshot || !local) return;
      const aim = renderer.getAimAngle();
      const target = (snapshot.structures || [])
        .filter(structure => structure.state !== 'destroying' && (structure.ownerId === local.id || !snapshot.players.some(player => player.id === structure.ownerId)))
        .map(structure => {
          const distance = Math.hypot(structure.x - local.x, structure.y - local.y);
          const angle = Math.atan2(structure.y - local.y, structure.x - local.x);
          const difference = Math.abs(Math.atan2(Math.sin(angle - aim), Math.cos(angle - aim)));
          return { structure, distance, difference };
        })
        .filter(candidate => candidate.distance <= 280 && candidate.difference <= .28)
        .sort((left, right) => left.difference - right.difference || left.distance - right.distance)[0]?.structure;
      if (!target) { setBuildMessage(tr('build.error.no_target')); return; }
      const requestId = ++buildRequestIdRef.current;
      if (launch.role === 'host') {
        const before = local.fabricatorCharges || 0;
        const issue = simulationRef.current?.dismantleStructure(local.id, target.id, requestId);
        const after = simulationRef.current?.createSnapshot().players.find(player => player.id === local.id)?.fabricatorCharges || 0;
        setBuildMessage(issue ? tr(`build.error.${issue.code}` as CoopTextKey) : tr(after > before ? 'build.dismantledRefund' : 'build.dismantled', { amount: after - before }));
      } else {
        session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'dismantle_structure', payload: { requestId, structureId: target.id } });
        setBuildMessage(tr('build.requestSent'));
      }
    };

    const operateAimedStructure = (action: CoopStructureAction) => {
      const snapshot = snapshotRef.current;
      const local = snapshot?.players.find(player => player.id === launch.localPlayerId);
      if (!snapshot || !local) return;
      const aim = renderer.getAimAngle();
      const target = (snapshot.structures || [])
        .filter(structure => structure.state !== 'destroying')
        .map(structure => {
          const distance = Math.hypot(structure.x - local.x, structure.y - local.y);
          const bearing = Math.atan2(structure.y - local.y, structure.x - local.x);
          const difference = Math.abs(Math.atan2(Math.sin(bearing - aim), Math.cos(bearing - aim)));
          return { structure, distance, difference };
        })
        .filter(candidate => candidate.distance <= COOP_STRUCTURE_ACTION_RANGE && candidate.difference <= .3)
        .sort((left, right) => left.difference - right.difference || left.distance - right.distance)[0]?.structure;
      if (!target) { setBuildMessage(tr('build.error.no_target')); return; }
      const requestId = ++buildRequestIdRef.current;
      const relocationPose = action === 'relocate' ? renderer.getBuildPose(snapshot, local.id, target.type, buildRotationRef.current, buildSnappingRef.current) : undefined;
      if (launch.role === 'host') {
        const issue = simulationRef.current?.structureAction(local.id, target.id, action, requestId, relocationPose?.x, relocationPose?.y, relocationPose?.angle);
        setBuildMessage(issue
          ? tr(`build.error.${issue.code}` as CoopTextKey, { amount: issue.amount || 0 })
          : tr(action === 'activate' ? 'build.action.activated' : action === 'relocate' ? 'build.action.relocated' : 'build.action.rotated'));
      } else {
        session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'structure_action', payload: { requestId, structureId: target.id, action, ...relocationPose } });
        setBuildMessage(tr('build.requestSent'));
      }
    };

    /**
     * Keyboard F and gamepad Y must reach the same local menus and the same
     * authoritative hold/action frames. The host still validates every world
     * interaction; this only chooses the appropriate local presentation.
     */
    const triggerContextualInteract = (keyboardHold = false) => {
      const snapshot = snapshotRef.current;
      const local = snapshot?.players.find(player => player.id === launch.localPlayerId);
      const station = local && snapshot?.buyStations.find(candidate => candidate.state === 'active' && Math.hypot(local.x - candidate.x, local.y - candidate.y) <= candidate.radius + 48);
      const foundry = local && snapshot?.weaponFoundry?.state === 'active' && Math.hypot(local.x - snapshot.weaponFoundry.x, local.y - snapshot.weaponFoundry.y) <= snapshot.weaponFoundry.radius + 48 ? snapshot.weaponFoundry : undefined;
      const revivableTeammate = local && snapshot?.players.some(player => player.id !== local.id && player.lifeState === 'downed' && Math.hypot(local.x - player.x, local.y - player.y) <= COOP_REVIVE_RANGE);
      const nearbyManualDrop = local?.lifeState === 'alive' && local.z <= 20 && snapshot?.items.some(item => item.manualDropKind
        && !(item.manualDropKind === 'self_revive' && local.selfRevives > 0)
        && Math.hypot(local.x - item.x, local.y - item.y) <= COOP_MANUAL_PICKUP_RANGE);
      const repairableStructure = local?.lifeState === 'alive' && snapshot?.structures?.some(structure => structure.state !== 'destroying'
        && structure.health < structure.maxHealth && Math.hypot(local.x - structure.x, local.y - structure.y) <= COOP_STRUCTURE_ACTION_RANGE);
      const fieldMissions = snapshot?.fieldMissions;
      const activeMission = fieldMissions?.active;
      const nearbyContract = local && !activeMission ? fieldMissions?.sites.find(site => site.state === 'available' && Math.hypot(local.x - site.x, local.y - site.y) <= 125) : undefined;
      const nearbyHostage = local && activeMission?.hostage?.state === 'waiting' && Math.hypot(local.x - activeMission.hostage.x, local.y - activeMission.hostage.y) <= 120;
      const nearbyDrive = local && activeMission?.drives.some(drive => !drive.collected && Math.hypot(local.x - drive.x, local.y - drive.y) <= 105);
      const missionHoldStage = activeMission && ['plant_a', 'plant_b', 'activate', 'deliver'].includes(activeMission.stage);
      const nearbyMissionHold = local && missionHoldStage && Math.hypot(local.x - activeMission.x, local.y - activeMission.y) <= 165;
      const holdInteraction = () => {
        if (keyboardHold) {
          keys.add('f');
          updateInput();
        }
      };

      // Revive takes precedence over every other nearby interaction, just as
      // before, and now remains consistent across controller and keyboard.
      if (local?.lifeState === 'downed' || revivableTeammate || nearbyHostage || nearbyMissionHold || repairableStructure) {
        holdInteraction();
        return;
      }
      if (nearbyManualDrop || nearbyContract || nearbyDrive) {
        inputRef.current = { ...inputRef.current, sequence: ++sequence, clientTime: Date.now(), interactActionId: ++interactActionId };
        return;
      }
      if (!station && !foundry) {
        setCombatNotice({ text: tr('notice.noInteraction'), color: '#fca5a5' });
        return;
      }
      renderer.exitPointerLock();
      firing = false;
      keys.clear();
      updateInput();
      setStationMessage(null);
      if (foundry) { setFoundryMessage(null); setFoundryPanelOpen(true); }
      else setStationPanelOpen(open => !open);
    };

    const handleMobileAction = (action: MobileCoopAction) => {
      if (deploymentBlockedRef.current || isSpectator || adminOpenRef.current || adminPausedRef.current) return;
      if (stationOpenRef.current || foundryOpenRef.current || backpackOpenRef.current || tacticalMapOpenRef.current || chatOpenRef.current) return;
      // Mobile has no mouse-down gesture to prime Web Audio. Touch actions are
      // trusted gestures too, so activate the audio context before firing or
      // interacting to keep the first shot and UI cue audible on iOS/Android.
      soundManager.activate();
      if (action.type === 'move') {
        mobile.moveX = action.x;
        mobile.moveY = action.y;
        updateMobileInput();
        return;
      }
      if (action.type === 'look') {
        renderer.adjustAim(action.deltaX * .008, action.deltaY * .006);
        updateMobileInput();
        return;
      }
      if (action.type === 'buildType') {
        if (buildModeRef.current) selectBuildType(action.buildType);
        return;
      }
      if (action.type === 'hold') {
        const wasPressed = mobile[action.control];
        mobile[action.control] = action.pressed;
        if (action.control === 'fire' && action.pressed && !wasPressed) {
          if (buildModeRef.current) placeStructure();
          else {
            fireActionId++;
            const local = snapshotRef.current?.players.find(player => player.id === launch.localPlayerId);
            const weapon = local?.weaponStates[inputRef.current.selectedSlot];
            if (weapon && local?.lifeState === 'alive' && weapon.state === 'ready' && weapon.magazineAmmo > 0 && weapon.nextFireAtMs <= (snapshotRef.current?.elapsedMs || 0)) renderer.predictLocalFire(weapon.weaponId, fireActionId);
            inputRef.current = { ...inputRef.current, fireActionId };
          }
        }
        if (action.control === 'aim' && action.pressed && !wasPressed && inputRef.current.selectedSlot === 3) {
          inputRef.current = { ...inputRef.current, altFireActionId: ++altFireActionId, aiming: false, sequence: ++sequence, clientTime: Date.now() };
        }
        if (action.control === 'jump' && action.pressed && !wasPressed) inputRef.current = { ...inputRef.current, jumpPressed: true, jetHeld: true, sequence: ++sequence, clientTime: Date.now() };
        if (action.control === 'interact' && action.pressed && !wasPressed) triggerContextualInteract();
        updateMobileInput();
        return;
      }
      switch (action.control) {
        case 'reload':
          inputRef.current = { ...inputRef.current, reloadPressed: true, sequence: ++sequence, clientTime: Date.now() };
          break;
        case 'previousWeapon': changeSelectedWeapon(-1); break;
        case 'nextWeapon': changeSelectedWeapon(1); break;
        case 'toggleBuild':
          firing = false;
          setBuildMode(!buildModeRef.current);
          setBuildMessage(null);
          break;
        case 'placeBuild': if (buildModeRef.current) placeStructure(); break;
        case 'buildRotateLeft': if (buildModeRef.current) buildRotationRef.current -= Math.PI / 12; break;
        case 'buildRotateRight': if (buildModeRef.current) buildRotationRef.current += Math.PI / 12; break;
        case 'buildActivate': if (buildModeRef.current) operateAimedStructure('activate'); break;
        case 'buildRelocate': if (buildModeRef.current) operateAimedStructure('relocate'); break;
        case 'buildDismantle': if (buildModeRef.current) dismantleAimedStructure(); break;
        case 'ping': triggerPing(); break;
        case 'backpack':
          renderer.exitPointerLock(); setBuildMode(false); setBackpackMessage(null); setBackpackPanelOpen(true);
          break;
        case 'map':
          renderer.exitPointerLock(); firing = false; setBuildMode(false); setTacticalMapPanelOpen(true);
          break;
        case 'chat':
          renderer.exitPointerLock(); firing = false; setBuildMode(false); setChatPanelOpen(true);
          break;
      }
      updateMobileInput();
    };
    mobileInputHandlerRef.current = handleMobileAction;

    const onKeyDown = (event: KeyboardEvent) => {
      const typingTarget = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (ownerAvailableRef.current && !event.repeat && !typingTarget && event.key === 'F1') {
        event.preventDefault();
        renderer.exitPointerLock();
        firing = false;
        keys.clear();
        updateInput();
        setBuildMode(false);
        setStationPanelOpen(false);
        setFoundryPanelOpen(false);
        setBackpackPanelOpen(false);
        setTacticalMapPanelOpen(false);
        setChatPanelOpen(false);
        setAdminPanelOpen(true);
        return;
      }
      if (adminOpenRef.current || adminPausedRef.current) {
        event.preventDefault();
        return;
      }
      if (deploymentBlockedRef.current) {
        if (event.key === 'Escape') return;
        event.preventDefault();
        return;
      }
      if (chatOpenRef.current) {
        event.preventDefault();
        return;
      }
      if (event.key === 'Enter' && !event.repeat && !isSpectator) {
        event.preventDefault();
        renderer.exitPointerLock();
        firing = false;
        keys.clear();
        updateInput();
        setBuildMode(false);
        setStationPanelOpen(false);
        setFoundryPanelOpen(false);
        setBackpackPanelOpen(false);
        setTacticalMapPanelOpen(false);
        setChatPanelOpen(true);
        return;
      }
      if (tacticalMapOpenRef.current) {
        event.preventDefault(); event.stopPropagation();
        if (!event.repeat && (event.key === 'Tab' || event.key === 'Escape')) {
          setTacticalMapPanelOpen(false);
          resumeGameplayInteraction();
        }
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        if (!event.repeat) {
          renderer.exitPointerLock(); firing = false; keys.clear(); updateInput(); setBuildMode(false);
          setTacticalMapPanelOpen(true);
        }
        return;
      }
      if (backpackOpenRef.current) {
        const key = event.key.toLowerCase();
        if (!event.repeat && (key === 'g' || event.key === 'Escape')) {
          event.preventDefault();
          closeBackpackAndResume();
          return;
        }
        const isMovementKey = key === 'shift' || key === slideBinding
          || movementBindings.up.includes(key) || movementBindings.down.includes(key)
          || movementBindings.left.includes(key) || movementBindings.right.includes(key);
        if (event.code === 'Space') {
          event.preventDefault();
          if (!event.repeat) inputRef.current = { ...inputRef.current, sequence: ++sequence, clientTime: Date.now(), jumpPressed: true, jetHeld: true };
          return;
        }
        event.preventDefault();
        if (isMovementKey) { keys.add(key); updateInput(); }
        return;
      }
      if (foundryOpenRef.current) {
        event.preventDefault(); event.stopPropagation();
        if (!event.repeat && (event.key.toLowerCase() === 'f' || event.key === 'Escape')) closeFoundryAndResume();
        return;
      }
      if (stationOpenRef.current) {
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) return;
        const snapshot = snapshotRef.current;
        const local = snapshot?.players.find(player => player.id === launch.localPlayerId);
        const station = local && snapshot?.buyStations.find(candidate => candidate.state === 'active' && Math.hypot(local.x - candidate.x, local.y - candidate.y) <= candidate.radius + 48);
        const redeployTargetIds = snapshot?.players.filter(player => player.id !== local?.id && player.lifeState === 'eliminated').map(player => player.id) || [];
        const action = resolveCoopShopKey(stationCategoryRef.current, event.key, station?.stock || [], redeployTargetIds);
        if (action.type === 'close') { closeStationAndResume(); return; }
        if (action.type === 'back') { chooseStationCategory(null); return; }
        if (action.type === 'category') { chooseStationCategory(action.categoryId); return; }
        if (action.type === 'redeploy' && local && station) {
          if (local.coins < COOP_OPERATOR_REDEPLOY_COST) {
            soundManager.playDamage();
            setStationMessage(tr('purchase.credits', { amount: COOP_OPERATOR_REDEPLOY_COST - local.coins }));
          } else {
            soundManager.playUIClick();
            redeployOperator(station.id, action.targetPlayerId);
          }
          return;
        }
        if (action.type !== 'purchase' || !local || !station) return;
        const issue = coopShopDisabledReason(local, action.itemId);
        if (issue) {
          soundManager.playDamage();
          setStationMessage(tr(`purchase.${issue.code}` as CoopTextKey, { amount: issue.amount || 0 }));
        } else {
          soundManager.playUIClick();
          purchaseStationItem(station.id, action.itemId);
        }
        return;
      }
      if (event.key === 'Escape') {
        if (buildModeRef.current) { event.preventDefault(); setBuildMode(false); }
        return;
      }
      if (isSpectator) return;
      // Reload can be the first interaction in an arena, before the player
      // clicks to lock the mouse. Keyboard gestures are equally valid for
      // resuming Web Audio, so make that first R press audible too.
      soundManager.activate();
      if (event.code === 'Space') {
        event.preventDefault();
        if (!event.repeat) {
          inputRef.current = { ...inputRef.current, sequence: ++sequence, clientTime: Date.now(), jumpPressed: true, jetHeld: true };
        }
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'alt' && buildModeRef.current) { event.preventDefault(); buildSnappingRef.current = false; return; }
      if (key === 'b') {
        event.preventDefault();
        if (!event.repeat) {
          firing = false;
          inputRef.current = { ...inputRef.current, firing: false, aiming: false };
          buildBWasActiveRef.current = buildModeRef.current;
          buildBPressedAtRef.current = performance.now();
          if (!buildModeRef.current) setBuildMode(true);
          if (buildBTimerRef.current !== null) window.clearTimeout(buildBTimerRef.current);
          buildBTimerRef.current = window.setTimeout(() => { if (buildBPressedAtRef.current > 0) setBuildPaletteExpanded(true); }, 220);
          setBuildMessage(null);
        }
        return;
      }
      if (key === 'x' && buildModeRef.current) {
        event.preventDefault();
        if (!event.repeat) dismantleAimedStructure();
        return;
      }
      if (key === 'e' && buildModeRef.current) {
        event.preventDefault();
        if (!event.repeat) operateAimedStructure('activate');
        return;
      }
      if (key === 'c' && buildModeRef.current) {
        event.preventDefault();
        if (!event.repeat) operateAimedStructure('relocate');
        return;
      }
      if (key === 'g') {
        event.preventDefault();
        if (!event.repeat) {
          renderer.exitPointerLock();
          firing = false;
          inputRef.current = { ...inputRef.current, firing: false, aiming: false };
          setBuildMode(false);
          setBackpackMessage(null);
          setBackpackPanelOpen(true);
        }
        return;
      }
      if (key === 'f') {
        event.preventDefault();
        if (event.repeat) return;
        triggerContextualInteract(true);
        return;
      }
      if (key === 'r') {
        event.preventDefault();
        if (buildModeRef.current) {
          if (!event.repeat) operateAimedStructure(event.shiftKey ? 'rotate_left' : 'rotate_right');
          return;
        }
        if (!event.repeat) inputRef.current = { ...inputRef.current, sequence: ++sequence, clientTime: Date.now(), reloadPressed: true };
        return;
      }
      if (/^[1-9]$/.test(key)) {
        event.preventDefault();
        if (buildModeRef.current && Number(key) <= COOP_BUILD_TYPES.length) {
          selectBuildType(COOP_BUILD_TYPES[Number(key) - 1]);
          return;
        }
        inputRef.current = { ...inputRef.current, selectedSlot: Number(key) - 1 };
        setHud(current => ({ ...current, selectedSlot: Number(key) - 1 }));
        return;
      }
      keys.add(key);
      updateInput();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (deploymentBlockedRef.current) return;
      if (chatOpenRef.current) { event.preventDefault(); return; }
      if (event.key.toLowerCase() === 'b') {
        const held = buildBPressedAtRef.current > 0 && performance.now() - buildBPressedAtRef.current >= 220;
        buildBPressedAtRef.current = 0;
        if (buildBTimerRef.current !== null) { window.clearTimeout(buildBTimerRef.current); buildBTimerRef.current = null; }
        if (held) setBuildPaletteExpanded(false);
        else if (buildBWasActiveRef.current) setBuildMode(false);
        return;
      }
      if (event.code === 'Space') { inputRef.current = { ...inputRef.current, sequence: ++sequence, clientTime: Date.now(), jumpPressed: false, jetHeld: false }; return; }
      if (event.key.toLowerCase() === 'r') { inputRef.current = { ...inputRef.current, sequence: ++sequence, clientTime: Date.now(), reloadPressed: false }; return; }
      keys.delete(event.key.toLowerCase());
      if (event.key.toLowerCase() === 'alt') buildSnappingRef.current = true;
      updateInput();
    };
    const onMouseMove = (event: MouseEvent) => {
      if (deploymentBlockedRef.current) return;
      if (stationOpenRef.current || foundryOpenRef.current || backpackOpenRef.current || tacticalMapOpenRef.current || chatOpenRef.current || isSpectator) return;
      inputRef.current = {
        ...inputRef.current,
        aimAngle: quantizeAngle(renderer.getAimAngle()),
        aimPitch: quantizePitch(renderer.getAimPitch()),
      };
    };
    const onMouseDown = (event: MouseEvent) => {
      if (deploymentBlockedRef.current) return;
      // A Buy Station is a focused modal. Do not let a click on its buttons,
      // list, or backdrop leak through to pointer lock, fire, or aiming.
      if (stationOpenRef.current || foundryOpenRef.current || backpackOpenRef.current || tacticalMapOpenRef.current || chatOpenRef.current) return;
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
      if (buildModeRef.current) {
        if (event.button === 2) { event.preventDefault(); setBuildMode(false); return; }
        if (event.button === 0) { event.preventDefault(); renderer.requestPointerLock(); placeStructure(); }
        return;
      }
      if (event.button === 2) {
        const local = snapshotRef.current?.players.find(player => player.id === launch.localPlayerId);
        if (local?.selectedSlot === 3) inputRef.current = { ...inputRef.current, altFireActionId: ++altFireActionId, aiming: false, sequence: ++sequence, clientTime: Date.now() };
        else inputRef.current = { ...inputRef.current, aiming: true, sequence: ++sequence, clientTime: Date.now() };
        return;
      }
      if (event.button !== 0) return;
      renderer.requestPointerLock();
      fireActionId++;
      firing = true;
      updateInput();
      inputRef.current = { ...inputRef.current, fireActionId };
      const local = snapshotRef.current?.players.find(player => player.id === launch.localPlayerId);
      const weapon = local?.weaponStates[inputRef.current.selectedSlot];
      const weaponId = weapon?.weaponId;
      if (weaponId && local?.lifeState === 'alive' && weapon?.state === 'ready' && weapon.magazineAmmo > 0 && weapon.nextFireAtMs <= (snapshotRef.current?.elapsedMs || 0)) {
        renderer.predictLocalFire(weaponId, fireActionId);
      }
    };
    const onMouseUp = (event: MouseEvent) => {
      if (deploymentBlockedRef.current) return;
      if (stationOpenRef.current || foundryOpenRef.current || backpackOpenRef.current || tacticalMapOpenRef.current || chatOpenRef.current) {
        firing = false;
        updateInput();
        return;
      }
      if (isSpectator) return;
      if (buildModeRef.current) return;
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
      if (deploymentBlockedRef.current) { event.preventDefault(); return; }
      // The station owns wheel input completely; it must never leak into
      // weapon selection or scroll the game page behind the modal.
      if (stationOpenRef.current || foundryOpenRef.current || backpackOpenRef.current || tacticalMapOpenRef.current || chatOpenRef.current) { event.preventDefault(); return; }
      if (isSpectator) return;
      event.preventDefault();
      const direction = event.deltaY > 0 ? 1 : -1;
      if (buildModeRef.current) {
        if (event.shiftKey) {
          const current = COOP_BUILD_TYPES.indexOf(buildTypeRef.current);
          selectBuildType(COOP_BUILD_TYPES[(current + direction + COOP_BUILD_TYPES.length) % COOP_BUILD_TYPES.length]);
        } else buildRotationRef.current += direction * Math.PI / 12;
        return;
      }
      changeSelectedWeapon(direction);
    };
    const clearControls = () => {
      keys.clear(); firing = false; updateInput();
      mobile.moveX = 0; mobile.moveY = 0; mobile.fire = false; mobile.aim = false; mobile.jump = false; mobile.slide = false; mobile.sprint = false; mobile.interact = false;
      inputRef.current = { ...inputRef.current, aiming: false, jumpPressed: false, jetHeld: false, reloadPressed: false };
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

    let previousGamepadButtons: boolean[] = [];
    let previousGamepadAimHeld = false;
    const pollGamepad = (elapsedMs: number) => {
      if (!isGamepadControlScheme(controlScheme) || typeof navigator === 'undefined' || !navigator.getGamepads) return;
      const gamepad = firstConnectedGamepad(Array.from(navigator.getGamepads()));
      if (!gamepad || deploymentBlockedRef.current || isSpectator || stationOpenRef.current || foundryOpenRef.current || backpackOpenRef.current || tacticalMapOpenRef.current || chatOpenRef.current || adminOpenRef.current || adminPausedRef.current) {
        if (gamepad) {
          previousGamepadButtons = gamepad.buttons.map(button => Boolean(button.pressed || button.value > .5));
          previousGamepadAimHeld = isGamepadTriggerDown(gamepad, GAMEPAD_BUTTON.aim, 4);
        }
        return;
      }

      const buttons = gamepad.buttons.map(button => Boolean(button.pressed || button.value > .5));
      const pressed = (button: number) => buttons[button] && !previousGamepadButtons[button];
      const down = (button: number) => isGamepadButtonDown(gamepad, button);
      const look = gamepadLookAxes(gamepad);
      if (look.x || look.y) renderer.adjustAim(look.x * elapsedMs * .0025, look.y * elapsedMs * .002);

      const fireHeld = down(GAMEPAD_BUTTON.fire);
      const firePressed = pressed(GAMEPAD_BUTTON.fire);
      const aimHeld = isGamepadTriggerDown(gamepad, GAMEPAD_BUTTON.aim, 4);
      const specialPressed = aimHeld && !previousGamepadAimHeld && inputRef.current.selectedSlot === 3;
      const jumpPressed = pressed(GAMEPAD_BUTTON.jump);
      const reloadPressed = pressed(GAMEPAD_BUTTON.reload);
      const interactPressed = pressed(GAMEPAD_BUTTON.interact);
      if (pressed(GAMEPAD_BUTTON.build)) {
        firing = false;
        inputRef.current = { ...inputRef.current, firing: false, aiming: false };
        setBuildMode(!buildModeRef.current);
        setBuildMessage(null);
      }
      if (buildModeRef.current) {
        if (pressed(GAMEPAD_BUTTON.dpadUp) || pressed(GAMEPAD_BUTTON.dpadDown)) {
          const direction = pressed(GAMEPAD_BUTTON.dpadDown) ? 1 : -1;
          const current = COOP_BUILD_TYPES.indexOf(buildTypeRef.current);
          selectBuildType(COOP_BUILD_TYPES[(current + direction + COOP_BUILD_TYPES.length) % COOP_BUILD_TYPES.length]);
        }
        if (pressed(GAMEPAD_BUTTON.slide)) setBuildMode(false);
        if (firePressed) placeStructure();
      } else {
        if (pressed(GAMEPAD_BUTTON.previousWeapon) || pressed(GAMEPAD_BUTTON.dpadLeft)) changeSelectedWeapon(-1);
        if (pressed(GAMEPAD_BUTTON.nextWeapon) || pressed(GAMEPAD_BUTTON.dpadRight)) changeSelectedWeapon(1);
      }

      if (firePressed && !buildModeRef.current) {
        fireActionId++;
        const local = snapshotRef.current?.players.find(player => player.id === launch.localPlayerId);
        const weapon = local?.weaponStates[inputRef.current.selectedSlot];
        if (weapon && local?.lifeState === 'alive' && weapon.state === 'ready' && weapon.magazineAmmo > 0 && weapon.nextFireAtMs <= (snapshotRef.current?.elapsedMs || 0)) {
          renderer.predictLocalFire(weapon.weaponId, fireActionId);
        }
      }
      // Slot four is the operator artifact weapon. Mouse right-click already
      // sends its edge-triggered action rather than entering ADS; make LT the
      // exact controller equivalent so a charged special is never swallowed
      // by ordinary aiming.
      if (specialPressed) altFireActionId++;
      if (interactPressed) triggerContextualInteract();
      if (reloadPressed || jumpPressed || interactPressed || firePressed || specialPressed) sequence++;
      firing = buildModeRef.current ? false : fireHeld;
      inputRef.current = {
        ...inputRef.current,
        sequence,
        clientTime: Date.now(),
        movement: gamepadMovementMask(gamepad),
        aimAngle: quantizeAngle(renderer.getAimAngle()),
        aimPitch: quantizePitch(renderer.getAimPitch()),
        firing: buildModeRef.current ? false : fireHeld,
        fireActionId,
        altFireActionId,
        reloadPressed: inputRef.current.reloadPressed || reloadPressed,
        sprinting: down(GAMEPAD_BUTTON.sprint),
        sliding: !buildModeRef.current && down(GAMEPAD_BUTTON.slide),
        reviving: down(GAMEPAD_BUTTON.interact),
        interactActionId,
        jumpPressed: inputRef.current.jumpPressed || jumpPressed,
        jetHeld: down(GAMEPAD_BUTTON.jump),
        aiming: inputRef.current.selectedSlot === 3 ? false : aimHeld,
      };
      previousGamepadButtons = buttons;
      previousGamepadAimHeld = aimHeld;
    };

    let animationFrame = 0;
    let lastTime = performance.now();
    let accumulator = 0;
    let stateAccumulator = 0;
    let inputAccumulator = 0;
    const hostClock = launch.role === 'host' ? new HostSimulationClock(INPUT_INTERVAL_MS, (now) => {
      const simulation = simulationRef.current!;
      if (adminPausedRef.current) {
        stateAccumulator += INPUT_INTERVAL_MS;
        if (stateAccumulator >= SNAPSHOT_INTERVAL_MS) {
          stateAccumulator %= SNAPSHOT_INTERVAL_MS;
          const baseSnapshot = simulation.createSnapshot();
          const snapshot: CoopSnapshot = { ...baseSnapshot, administration: { ...baseSnapshot.administration, modified: Boolean(baseSnapshot.administration?.modified), paused: true } };
          publishSnapshot(snapshot, now);
          session.broadcastState(
            { type: 'state', version: MULTIPLAYER_PROTOCOL_VERSION, tick: ++networkTickRef.current, sentAt: Date.now(), payload: snapshot },
            peerId => createInterestSnapshot(snapshot, launch.peerPlayerIds[peerId]),
          );
          syncHud(snapshot);
        }
        return;
      }
      inputRef.current = { ...inputRef.current, sequence: ++sequence, clientTime: Date.now(), aimAngle: quantizeAngle(renderer.getAimAngle()), aimPitch: quantizePitch(renderer.getAimPitch()) };
      simulation.setInput(launch.localPlayerId, inputRef.current);
      const simulationStartedAt = performance.now();
      simulation.tick(INPUT_INTERVAL_MS);
      const simulationFinishedAt = performance.now();
      clearJumpInput();
      const snapshot = simulation.createSnapshot();
      performanceMonitor?.recordHostWork(simulationFinishedAt - simulationStartedAt, performance.now() - simulationFinishedAt);
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
      if (stationOpenRef.current || foundryOpenRef.current || chatOpenRef.current) clearControls();
      pollGamepad(elapsed);
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
      if (frameSnapshot && launch.role === 'guest') {
        const local = frameSnapshot.players.find(player => player.id === launch.localPlayerId);
        if (local && local.lifeState === 'alive' && local.z <= 34) {
          for (const structure of frameSnapshot.structures || []) if (structure.state !== 'destroying') resolveBarricadeCollision(local, COOP_PLAYER_RADIUS, structure);
        }
      }
      if (frameSnapshot && launch.role === 'host' && snapshotRef.current?.matchState === 'active') {
        const local = snapshotRef.current.players.find(player => player.id === launch.localPlayerId);
        if (local?.lifeState === 'alive') {
          const motion = { ...local, verticalVelocity: 0, lastJumpSequence: -1, slideAngle: local.angle, ...local.motion };
          advancePlayerMovement(motion, { ...inputRef.current, jumpPressed: false }, accumulator);
          if (motion.z <= 34) for (const structure of frameSnapshot.structures || []) if (structure.state !== 'destroying') resolveBarricadeCollision(motion, COOP_PLAYER_RADIUS, structure);
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
      if (buildModeRef.current && latestLifeState === 'alive') {
        const type = buildTypeRef.current;
        const pose = renderer.getBuildPose(frameSnapshot, launch.localPlayerId, type, buildRotationRef.current, buildSnappingRef.current);
        const placementIssue = pose ? validateCoopBuildPreview(frameSnapshot, launch.localPlayerId, type, pose.x, pose.y, pose.angle) : { code: 'range' as const };
        renderer.setBuildPreview(type, pose, Boolean(pose && !placementIssue));
      } else renderer.setBuildPreview(undefined);
      const localJetpack = frameSnapshot?.players.find(player => player.id === launch.localPlayerId);
      soundManager.updateJetpack(
        Boolean(localJetpack?.lifeState === 'alive' && localJetpack.jetActive),
        (localJetpack?.jetFuel ?? 100) / 100,
      );
      const renderStartedAt = performance.now();
      renderer.render(frameSnapshot, launch.localPlayerId, elapsed, presentationTargetId, latestLifeState === 'alive');
      performanceMonitor?.recordFrame(elapsed, performance.now() - renderStartedAt, renderer.getPerformanceStats());
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
      performanceMonitor?.destroy();
      hostClock?.stop();
      if (damageFlashTimerRef.current !== null) {
        window.clearTimeout(damageFlashTimerRef.current);
        damageFlashTimerRef.current = null;
      }
      if (buildBTimerRef.current !== null) window.clearTimeout(buildBTimerRef.current);
      if (fallCinematicTimerRef.current !== null) {
        window.clearTimeout(fallCinematicTimerRef.current);
        fallCinematicTimerRef.current = null;
      }
      for (const timer of healingPopTimersRef.current) window.clearTimeout(timer);
      healingPopTimersRef.current.clear();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('auxclick', onAuxClick);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('blur', clearControls);
      window.removeEventListener('contextmenu', onContextMenu);
      mobileInputHandlerRef.current = null;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('pointerlockchange', syncPointerLock);
      soundManager.stopJetpack();
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

  const interactionBlocked = deploymentStage === 'briefing' || deploymentStage === 'ready' || stationOpen || foundryOpen || backpackOpen || tacticalMapOpen || chatOpen || adminOpen || adminPaused || Boolean(matchSnapshot?.results) || hud.matchState !== 'active' || connectionStatus === 'disconnected';
  const interactionBlockedRef = useRef(false);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const wasBlocked = interactionBlockedRef.current;
    interactionBlockedRef.current = interactionBlocked;
    renderer.setInteractionBlocked(interactionBlocked);
    if (!interactionBlocked) {
      renderer.focusCanvas();
      if (wasBlocked) renderer.requestPointerLock();
      return;
    }
    const focusModal = window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>('.coop-admin-console input, .coop-arena [role="dialog"] button:not(:disabled), .coop-arena [role="dialog"] [tabindex="0"]');
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(focusModal);
  }, [interactionBlocked]);

  useEffect(() => {
    const results = matchSnapshot?.results;
    if (!results || isSpectator || settledRunRef.current === results.runId) return;
    if (matchSnapshot?.administration?.modified) {
      settledRunRef.current = results.runId;
      return;
    }
    const localResult = results.players.find(player => player.playerId === launch.localPlayerId);
    if (!localResult) return;
    settledRunRef.current = results.runId;
    const settled = settleCoopImprintRun(readCoopImprintProfile(), {
      runId: results.runId,
      operatorId: localOperatorId,
      success: results.success,
      squadWiped: results.squadWiped,
      extractedCores: localResult.dataCoresExtracted,
      depth: results.bossesDefeated,
    });
    applyLocalImprintProfile(settled);
  }, [matchSnapshot?.results?.runId, matchSnapshot?.administration?.modified, isSpectator, launch.localPlayerId, localOperatorId]);

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
  const classOperator = getCoopOperator(localSnapshot?.operatorId, localSnapshot?.skinId);
  const specialEffectActive = Boolean(localSnapshot && matchSnapshot?.artifactEffects?.some(effect =>
    effect.ownerId === localSnapshot.id
    && ((classOperator.id === 'solar_guard' && effect.kind === 'dawnwall')
      || (classOperator.id === 'royal_inferno' && effect.kind === 'hellseed'))
  ));
  const specialReady = !isSpectator
    && localSnapshot?.lifeState === 'alive'
    && isCoopArtifactSpenderCharged(classOperator.id, localSnapshot.artifactResource)
    && !specialEffectActive;

  useEffect(() => {
    if (specialReadyOperatorRef.current !== classOperator.id) {
      specialReadyOperatorRef.current = classOperator.id;
      specialWasReadyRef.current = false;
    }
    const becameReady = specialReady && !specialWasReadyRef.current;
    specialWasReadyRef.current = specialReady;
    if (!becameReady || deploymentStageRef.current !== 'complete') return;

    if (specialReadyTimerRef.current !== null) window.clearTimeout(specialReadyTimerRef.current);
    setSpecialReadyCue({ id: ++specialReadySequenceRef.current, name: classOperator.spenderName, color: classOperator.color });
    specialReadyTimerRef.current = window.setTimeout(() => {
      setSpecialReadyCue(null);
      specialReadyTimerRef.current = null;
    }, 2_200);
  }, [classOperator.id, classOperator.spenderName, classOperator.color, specialReady]);

  useEffect(() => () => {
    if (specialReadyTimerRef.current !== null) window.clearTimeout(specialReadyTimerRef.current);
  }, []);

  useEffect(() => {
    const worldId = matchSnapshot?.world?.id;
    if (!worldId || matchSnapshot?.administration?.modified) return;
    writeCoopWorldProgress(unlockCoopWorld(readCoopWorldProgress(), worldId));
  }, [matchSnapshot?.world?.id, matchSnapshot?.administration?.modified]);
  const pingMissionFromMap = (missionSiteId: number) => {
    const snapshot = snapshotRef.current;
    const player = snapshot?.players.find(candidate => candidate.id === launch.localPlayerId);
    const site = snapshot?.fieldMissions?.sites.find(candidate => candidate.id === missionSiteId && candidate.state !== 'completed');
    if (!player || player.lifeState === 'eliminated' || player.lifeState === 'extracted' || !site) return;
    soundManager.playTacticalPing(false);
    if (launch.role === 'host') simulationRef.current?.addMissionPing(launch.localPlayerId, missionSiteId);
    else launch.session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'ping', payload: { missionSiteId } });
    setCombatNotice({ text: tr('notice.pingTarget', { label: COOP_FIELD_MISSION_LABELS[site.kind] }), color: site.kind === 'demolition' ? '#fb7185' : site.kind === 'hostage_recovery' ? '#fbbf24' : site.kind === 'courier_intercept' ? '#c084fc' : site.kind === 'toxic_hunt' ? '#4ade80' : '#22d3ee' });
  };
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
  const activeRecoveryRelay = !isSpectator && localSnapshot?.lifeState === 'alive'
    ? matchSnapshot?.structures?.find(structure => structure.type === 'recovery_relay'
      && structure.state !== 'destroying'
      && Math.hypot(localSnapshot.x - structure.x, localSnapshot.y - structure.y) <= COOP_STRUCTURE_DEFINITIONS.recovery_relay.radius + COOP_PLAYER_RADIUS)
    : undefined;
  const nearbyStation = !isSpectator && localSnapshot && localSnapshot.z <= 20 && matchSnapshot?.buyStations.find(station => station.state === 'active' && Math.hypot(localSnapshot.x - station.x, localSnapshot.y - station.y) <= station.radius + 48);
  const nearbyFoundry = !isSpectator && localSnapshot && localSnapshot.z <= 20 && matchSnapshot?.weaponFoundry?.state === 'active'
    && Math.hypot(localSnapshot.x - matchSnapshot.weaponFoundry.x, localSnapshot.y - matchSnapshot.weaponFoundry.y) <= matchSnapshot.weaponFoundry.radius + 48
    ? matchSnapshot.weaponFoundry : undefined;
  const nearbyManualDrop = !isSpectator && localSnapshot?.lifeState === 'alive' && localSnapshot.z <= 20
    ? matchSnapshot?.items.filter(item => item.manualDropKind
      && !(item.manualDropKind === 'self_revive' && localSnapshot.selfRevives > 0)
      && Math.hypot(localSnapshot.x - item.x, localSnapshot.y - item.y) <= COOP_MANUAL_PICKUP_RANGE)
      .sort((left, right) => Math.hypot(localSnapshot.x - left.x, localSnapshot.y - left.y) - Math.hypot(localSnapshot.x - right.x, localSnapshot.y - right.y))[0]
    : undefined;
  const nearbyMissionPrompt = (() => {
    if (isSpectator || !localSnapshot || localSnapshot.lifeState !== 'alive' || !matchSnapshot?.fieldMissions) return undefined;
    const missions = matchSnapshot.fieldMissions, active = missions.active;
    if (!active) {
      const site = missions.sites.find(candidate => candidate.state === 'available' && Math.hypot(localSnapshot.x - candidate.x, localSnapshot.y - candidate.y) <= 125);
      return site ? `ACCEPT ${COOP_FIELD_MISSION_LABELS[site.kind]} · ¤ ${site.reward} EACH` : undefined;
    }
    if (active.hostage?.state === 'waiting' && Math.hypot(localSnapshot.x - active.hostage.x, localSnapshot.y - active.hostage.y) <= 120) return 'HOLD TO FREE HOSTAGE · THEN CARRY TO RECOVERY';
    if (active.drives.some(drive => !drive.collected && Math.hypot(localSnapshot.x - drive.x, localSnapshot.y - drive.y) <= 105)) return 'RECOVER ENCRYPTED DRIVE';
    // Demolition gets a dedicated interaction card below. A one-line generic
    // prompt could not communicate arming progress or interrupted planting.
    if (['plant_a', 'plant_b'].includes(active.stage) && Math.hypot(localSnapshot.x - active.x, localSnapshot.y - active.y) <= 165) return undefined;
    if (active.stage === 'activate' && Math.hypot(localSnapshot.x - active.x, localSnapshot.y - active.y) <= 165) return 'HOLD TO ACTIVATE RELAY';
    if (active.stage === 'deliver' && Math.hypot(localSnapshot.x - active.x, localSnapshot.y - active.y) <= 165) return 'HOLD TO DEPOSIT DRIVES';
    return undefined;
  })();
  const demolitionMission = matchSnapshot?.fieldMissions?.active?.kind === 'demolition' ? matchSnapshot.fieldMissions.active : undefined;
  const demolitionPlantStage = demolitionMission?.stage === 'plant_a' || demolitionMission?.stage === 'plant_b';
  const demolitionSite = demolitionMission?.stage.endsWith('_b') ? 'B' : 'A';
  const demolitionProgress = demolitionMission ? Math.max(0, Math.min(100, demolitionMission.progress / Math.max(1, demolitionMission.required) * 100)) : 0;
  const nearDemolitionPlant = Boolean(!isSpectator && demolitionMission && demolitionPlantStage && localSnapshot?.lifeState === 'alive'
    && Math.hypot(localSnapshot.x - demolitionMission.x, localSnapshot.y - demolitionMission.y) <= 165);
  const activelyPlanting = nearDemolitionPlant && inputRef.current.reviving;
  const captureCandidates = matchSnapshot?.buyStations.filter(station => station.state === 'capturing' || station.state === 'available') || [];

  useEffect(() => {
    if (stationOpen && !nearbyStation) setStationPanelOpen(false);
  }, [stationOpen, nearbyStation]);
  useEffect(() => {
    if (foundryOpen && !nearbyFoundry) setFoundryPanelOpen(false);
  }, [foundryOpen, nearbyFoundry]);
  useEffect(() => {
    if (backpackOpen && localSnapshot?.lifeState !== 'alive') setBackpackPanelOpen(false);
  }, [backpackOpen, localSnapshot?.lifeState]);
  const currentCaptureStation = [...captureCandidates].sort((left, right) => {
    if (left.state !== right.state) return left.state === 'capturing' ? -1 : 1;
    if (!localSnapshot) return left.id - right.id;
    return Math.hypot(left.x - localSnapshot.x, left.y - localSnapshot.y) - Math.hypot(right.x - localSnapshot.x, right.y - localSnapshot.y);
  })[0];
  const localInsideCapture = Boolean(currentCaptureStation && localSnapshot
    && Math.hypot(currentCaptureStation.x - localSnapshot.x, currentCaptureStation.y - localSnapshot.y) <= currentCaptureStation.captureRadius + 31);
  const revivingTarget = !isSpectator && localSnapshot?.lifeState === 'alive'
    ? matchSnapshot?.players.find(player => player.lifeState === 'downed' && player.reviverId === launch.localPlayerId)
    : undefined;
  const run = matchSnapshot?.run;
  const activeWorld = getWorldDefinition(matchSnapshot?.world?.id || launch.worldId);
  const encounter = matchSnapshot?.encounter;
  const activeWeaponId = hud.weapons[hud.selectedSlot]?.weaponId;
  const activeWeapon = COOP_WEAPON_DETAILS[activeWeaponId];
  const activeWeaponState = hud.weapons[hud.selectedSlot];
  const spectatedSquadmate = matchSnapshot?.players.find(p => p.id === downedSpectatorTarget?.id);
  const activeReviver = hud.reviverId ? matchSnapshot?.players.find(p => p.id === hud.reviverId) : undefined;
  const squadmates = hud.squad.filter(player => player.id !== launch.localPlayerId);
  const engineeringTarget = buildMode && localSnapshot && matchSnapshot ? (() => {
    const aim = rendererRef.current?.getAimAngle() ?? localSnapshot.angle;
    return (matchSnapshot.structures || []).filter(structure => structure.state !== 'destroying' && structure.type !== 'bridge_segment').map(structure => {
      const distance = Math.hypot(structure.x - localSnapshot.x, structure.y - localSnapshot.y);
      const bearing = Math.atan2(structure.y - localSnapshot.y, structure.x - localSnapshot.x);
      const difference = Math.abs(Math.atan2(Math.sin(bearing - aim), Math.cos(bearing - aim)));
      return { structure, distance, difference };
    }).filter(candidate => candidate.distance <= COOP_STRUCTURE_ACTION_RANGE && candidate.difference <= .3)
      .sort((left, right) => left.difference - right.difference || left.distance - right.distance)[0]?.structure;
  })() : undefined;
  const objectiveHud = run ? (() => {
    const base = {
      title: run.objective ? tr(run.objective.titleKey) : run.boss ? (run.boss.displayName || tr(run.boss.nameKey)) : tr(run.noticeKey, run.boss ? { boss: run.boss.displayName || tr(run.boss.nameKey) } : undefined),
      label: tr(coopRunPhaseKey(run.phase)),
      detail: '',
      progress: undefined as number | undefined,
      progressText: '',
      tone: 'cyan' as 'cyan' | 'rose' | 'amber' | 'emerald' | 'fuchsia',
    };
    // Once accepted, a field contract owns the primary HUD until completion.
    // Optional world-link/exfil panels previously hid demolition feedback.
    const fieldMission = matchSnapshot?.fieldMissions?.active;
    if (fieldMission) {
      const navigationTarget = resolveCoopMissionNavigationTarget(fieldMission, matchSnapshot.enemies) || fieldMission;
      const distance = localSnapshot ? Math.max(1, Math.round(Math.hypot(navigationTarget.x - localSnapshot.x, navigationTarget.y - localSnapshot.y) / 12)) : 0;
      const commander = fieldMission.kind === 'toxic_hunt' ? matchSnapshot.enemies.find(enemy => fieldMission.targetEnemyIds.includes(enemy.id) && !enemy.dying) : undefined;
      if (fieldMission.kind === 'demolition') {
        const site = fieldMission.stage.endsWith('_b') ? 'B' : 'A';
        const planting = fieldMission.stage === 'plant_a' || fieldMission.stage === 'plant_b';
        const defending = !planting;
        const percent = Math.round(fieldMission.progress / Math.max(1, fieldMission.required) * 100);
        const seconds = Math.max(0, Math.ceil((fieldMission.timerRemainingMs || 0) / 1000));
        const detail = planting
          ? fieldMission.stage === 'plant_b' ? `${seconds}s PLANT WINDOW · ${distance}m` : `${distance}m · HOLD F AT THE CHARGE`
          : `DETONATION IN ${seconds}s · DEFEND THE CHARGE`;
        return {
          ...base,
          title: `DEMOLITION · SITE ${site}`,
          label: coopFieldMissionStageLabel(fieldMission),
          detail,
          progress: fieldMission.progress / Math.max(1, fieldMission.required) * 100,
          progressText: defending ? `${seconds}s` : `${percent}% PLANTED`,
          tone: defending ? 'rose' as const : 'amber' as const,
        };
      }
      const detail = commander ? `${Math.ceil(commander.health).toLocaleString()} HP · ${distance}m`
        : fieldMission.timerRemainingMs !== undefined ? `${Math.ceil(fieldMission.timerRemainingMs / 1000)}s · ${distance}m`
          : `${distance}m · ¤ ${fieldMission.reward} EACH`;
      return { ...base, title: COOP_FIELD_MISSION_LABELS[fieldMission.kind], label: coopFieldMissionStageLabel(fieldMission), detail, progress: fieldMission.required > 1 ? fieldMission.progress / fieldMission.required * 100 : undefined, progressText: fieldMission.required > 1 ? `${Math.round(fieldMission.progress / fieldMission.required * 100)}%` : '', tone: fieldMission.kind === 'toxic_hunt' ? 'rose' as const : 'emerald' as const };
    }
    const bridge = matchSnapshot?.bridge;
    if (bridge && bridge.destinationWorldId && bridge.state !== 'locked' && bridge.state !== 'terminal') {
      const destination = getWorldDefinition(bridge.destinationWorldId);
      const distance = localSnapshot ? Math.round(Math.hypot(bridge.buildX - localSnapshot.x, bridge.buildY - localSnapshot.y)) : 0;
      if (bridge.state === 'complete' || bridge.state === 'crossing') return { ...base, title: `WORLDLINK TO ${destination.name}`, label: 'BRIDGE COMPLETE · CROSS THE SPAN', detail: `${Math.round(bridge.endX - bridge.startX)}m TRANSIT`, progress: 100, tone: 'amber' as const };
      return { ...base, title: `BUILD WORLDLINK TO ${destination.name}`, label: 'SELECT WORLDLINK SPAN IN BUILD MODE', detail: `${distance}m · ${bridge.builtSegments}/${bridge.requiredSegments} SPANS`, progress: bridge.builtSegments / Math.max(1, bridge.requiredSegments) * 100, tone: 'amber' as const };
    }
    if (matchSnapshot?.privateExfil) {
      const exfil = matchSnapshot.privateExfil;
      const remaining = exfil.state === 'inbound' ? exfil.arrivalRemainingMs : exfil.windowRemainingMs;
      return { ...base, title: 'PRIVATE EXFIL', label: exfil.state === 'inbound' ? 'INBOUND' : 'EXTRACTION ACTIVE', detail: `${Math.ceil(remaining / 1000)}s`, progress: exfil.state === 'active' ? exfil.holdProgressMs / Math.max(1, exfil.holdRequiredMs) * 100 : (1 - exfil.arrivalRemainingMs / 20_000) * 100, tone: 'amber' as const };
    }
    if (run.boss) return { ...base, label: tr('hud.bossPhase', { phase: run.boss.phase }), detail: `${Math.ceil(run.boss.health).toLocaleString()} ${tr('unit.hp')}`, progress: run.boss.health / Math.max(1, run.boss.maxHealth) * 100, tone: 'rose' as const };
    if (run.exfil) return { ...base, label: tr('hud.extraction'), detail: tr('unit.seconds', { value: Math.ceil(run.exfil.remainingMs / 1000) }), progress: run.exfil.holdProgressMs / Math.max(1, run.exfil.holdRequiredMs) * 100, tone: 'amber' as const };
    if (currentCaptureStation && (run.phase === 'insertion' || localInsideCapture || currentCaptureStation.captureProgressMs > 0)) {
      const distance = localSnapshot ? tr('unit.meters', { value: Math.round(Math.hypot(currentCaptureStation.x - localSnapshot.x, currentCaptureStation.y - localSnapshot.y)) }) : '';
      const state = currentCaptureStation.contested ? tr('hud.contested') : currentCaptureStation.state === 'capturing' ? tr('hud.capturingStation') : tr('hud.reachCaptureStation');
      return { ...base, title: tr('objective.captureStation'), label: state, detail: distance, progress: currentCaptureStation.captureProgressMs / Math.max(1, currentCaptureStation.captureRequiredMs) * 100, tone: currentCaptureStation.contested ? 'rose' as const : 'emerald' as const };
    }
    const foundry = matchSnapshot?.weaponFoundry;
    if (foundry && (foundry.state === 'available' || foundry.state === 'capturing')) {
      const distance = localSnapshot ? tr('unit.meters', { value: Math.round(Math.hypot(foundry.x - localSnapshot.x, foundry.y - localSnapshot.y)) }) : '';
      const state = foundry.contested ? tr('hud.contested') : foundry.state === 'capturing' ? tr('hud.capturingFoundry') : tr('hud.reachFoundry');
      return { ...base, title: tr('objective.captureFoundry'), label: state, detail: distance, progress: foundry.captureProgressMs / Math.max(1, foundry.captureRequiredMs) * 100, tone: foundry.contested ? 'rose' as const : 'amber' as const };
    }
    if (run.objective) {
      const distance = localSnapshot ? tr('unit.meters', { value: Math.round(Math.hypot(run.objective.x - localSnapshot.x, run.objective.y - localSnapshot.y)) }) : '';
      const state = run.objective.kind === 'uplink'
        ? tr(run.objective.contested ? 'hud.contested' : run.objective.occupants ? 'hud.uploading' : 'hud.reachUplink')
        : tr('hud.targetTracked');
      return { ...base, label: state, detail: distance, progress: run.objective.progress / Math.max(1, run.objective.required) * 100, tone: run.objective.contested ? 'rose' as const : 'emerald' as const };
    }
    if (run.insertionRemainingMs !== undefined && run.insertionDurationMs !== undefined) return { ...base, label: tr('hud.insertion'), detail: tr('unit.seconds', { value: Math.ceil(run.insertionRemainingMs / 1000) }), progress: (1 - run.insertionRemainingMs / Math.max(1, run.insertionDurationMs)) * 100, tone: 'cyan' as const };
    if (encounter?.phase === 'combat') return { ...base, label: tr('hud.round', { round: encounter.round }), detail: tr('hud.hostiles', { count: encounter.enemiesRemaining }), progress: encounter.spawnedThisRound / Math.max(1, encounter.roundTotal) * 100, tone: 'fuchsia' as const };
    if (encounter?.phase === 'intermission') return { ...base, label: tr('hud.roundClear', { round: encounter.round }), detail: tr('unit.seconds', { value: Math.ceil(encounter.intermissionRemainingMs / 1000) }), progress: (1 - encounter.intermissionRemainingMs / 20_000) * 100, tone: 'emerald' as const };
    return base;
  })() : null;

  return (
    <div className={`coop-arena absolute inset-0 z-[110] bg-[#05080e] ${interactionBlocked ? 'coop-arena--interaction-blocked' : ''} ${deploymentStage === 'briefing' || deploymentStage === 'ready' ? 'coop-arena--deploying' : deploymentStage === 'released' ? 'coop-arena--releasing' : 'coop-arena--deployed'}`}>
      <div ref={sceneRef} className="coop-arena__scene absolute inset-0 h-full w-full" />
      {ownerAvailable && !adminOpen && <button
        type="button"
        className="coop-owner-trigger"
        aria-label="Open owner console"
        onMouseDown={event => event.stopPropagation()}
        onClick={() => { rendererRef.current?.exitPointerLock(); setAdminPanelOpen(true); }}
      ><ShieldCheck size={13} /><span>Owner</span><kbd>F1</kbd></button>}
      {adminOpen && ownerAvailable && <section className="coop-admin-console" role="dialog" aria-modal="true" aria-label="Owner control console" onMouseDown={event => event.stopPropagation()}>
        <header>
          <div><ShieldCheck size={16} /><span>Owner Control Mesh</span><small>{launch.role === 'host' ? 'LOCAL AUTHORITY' : 'SIGNED REMOTE AUTHORITY'}</small></div>
          <button type="button" onClick={closeAdminAndResume} aria-label="Close owner console"><X size={15} /></button>
        </header>
        <div className="coop-admin-console__status">
          <span data-online="true">OWNER KEY VERIFIED</span>
          <span>{adminPaused ? 'SIMULATION PAUSED' : 'SIMULATION RUNNING'}</span>
          <span>{matchSnapshot?.administration?.modified ? 'MODIFIED RUN' : 'CLEAN RUN'}</span>
        </div>
        <div className="coop-admin-console__log" role="log" aria-live="polite">
          {adminLog.map(entry => <pre key={entry.id} data-tone={entry.tone}>{entry.text}</pre>)}
        </div>
        <form onSubmit={event => { event.preventDefault(); void submitAdminCommand(); }}>
          <Terminal size={15} />
          <span>&gt;</span>
          <input
            ref={adminInputRef}
            value={adminDraft}
            onChange={event => setAdminDraft(event.target.value)}
            onKeyDown={event => {
              event.stopPropagation();
              if (event.key === 'Escape') { event.preventDefault(); closeAdminAndResume(); }
              if (event.key === 'ArrowUp' && adminHistory.length) { event.preventDefault(); setAdminDraft(adminHistory[adminHistory.length - 1]); }
            }}
            onKeyUp={event => event.stopPropagation()}
            placeholder="help"
            maxLength={512}
            autoComplete="off"
            spellCheck="false"
          />
          <button type="submit" disabled={!adminDraft.trim()}>Execute</button>
        </form>
      </section>}
      {adminPaused && !adminOpen && <div className="coop-admin-paused"><ShieldCheck size={16} /><b>OPERATION PAUSED BY OWNER</b>{ownerAvailable && <small>Press F1 to open Owner Control</small>}</div>}
      {matchSnapshot?.administration?.modified && <div className="coop-admin-modified">MODIFIED CO-OP RUN · CAREER REWARDS DISABLED</div>}
      {deploymentStage === 'complete' && matchSnapshot?.world && <div className="coop-world-readout pointer-events-none absolute left-5 top-5 z-50 border bg-black/65 px-3 py-2 font-mono uppercase backdrop-blur-sm" style={{ borderColor: `#${activeWorld.theme.accentColor.toString(16).padStart(6, '0')}88`, boxShadow: `0 0 24px #${activeWorld.theme.accentColor.toString(16).padStart(6, '0')}22` }}>
        <div className="text-[8px] font-black tracking-[.24em] text-white/45">World {activeWorld.tier} · Threat ×{activeWorld.difficulty.threatMultiplier.toFixed(2)}</div>
        <div className="mt-0.5 text-[11px] font-black tracking-[.15em]" style={{ color: `#${activeWorld.theme.accentColor.toString(16).padStart(6, '0')}` }}>{activeWorld.name}</div>
        <div className="mt-1 text-[7px] font-bold tracking-[.12em] text-white/50">{WORLD_CONDITIONS[activeWorld.id]}</div>
      </div>}
      {deploymentStage !== 'complete' && <CoopDeploymentOverlay
        stage={deploymentStage}
        players={launch.players}
        localPlayerId={launch.localPlayerId}
        controlScheme={controlScheme}
        language={launch.language}
        isSpectator={isSpectator}
        sector={deploymentSectorNumber(launch.players)}
        insertionRemainingMs={run?.insertionRemainingMs}
        onDeploy={() => releaseDeployment(true)}
      />}
      {!mouseLocked && !interactionBlocked && !isSpectator && !isMobileTouchDevice && (
        <button
          type="button"
          className="absolute left-1/2 top-1/2 z-[105] -translate-x-1/2 -translate-y-1/2 border border-cyan-300/70 bg-black/85 px-6 py-4 text-center font-mono text-xs font-black uppercase tracking-[.2em] text-cyan-100 shadow-[0_0_36px_rgba(34,211,238,.3)] backdrop-blur-md hover:bg-cyan-950/90 focus:outline-none focus:ring-2 focus:ring-cyan-300"
          onClick={() => rendererRef.current?.requestPointerLock()}
        >
          {tr('arena.resumeControl')}
        </button>
      )}
      {isMobileTouchDevice && !isSpectator && !interactionBlocked && <CoopMobileControls
        buildMode={buildMode}
        buildType={buildType}
        onAction={action => mobileInputHandlerRef.current?.(action)}
      />}
      {!isSpectator && hud.lifeState === 'alive' && !backpackOpen && !isMobileTouchDevice && <div className="pointer-events-none absolute bottom-5 right-5 z-[54] border border-white/10 bg-black/55 px-2.5 py-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-white/55 backdrop-blur-sm"><kbd className="mr-1.5 text-cyan-200">G</kbd>{tr('backpack.open')}</div>}
      {nearbyManualDrop && !backpackOpen && !stationOpen && !foundryOpen && <div className="pointer-events-none absolute bottom-[5.5rem] left-1/2 z-[86] -translate-x-1/2 border border-amber-300/45 bg-black/80 px-4 py-2 text-center font-mono text-[10px] font-black uppercase tracking-[.16em] text-amber-100 shadow-[0_0_24px_rgba(251,191,36,.18)]"><kbd className="mr-2 border border-amber-200/40 bg-amber-300/10 px-1.5 py-0.5">{isMobileTouchDevice ? 'USE' : 'F'}</kbd>{tr(nearbyManualDrop.manualDropKind === 'cash' ? 'backpack.pickupCash' : 'backpack.pickupRevive', { amount: nearbyManualDrop.value })}</div>}
      {nearbyMissionPrompt && !tacticalMapOpen && !stationOpen && !foundryOpen && <div className="pointer-events-none absolute bottom-[8.5rem] left-1/2 z-[86] -translate-x-1/2 border border-emerald-300/50 bg-black/85 px-4 py-2 text-center font-mono text-[10px] font-black uppercase tracking-[.16em] text-emerald-100 shadow-[0_0_26px_rgba(45,212,191,.2)]"><kbd className="mr-2 border border-emerald-200/40 bg-emerald-300/10 px-1.5 py-0.5">{isMobileTouchDevice ? 'USE' : 'F'}</kbd>{nearbyMissionPrompt}</div>}
      {nearDemolitionPlant && demolitionMission && !tacticalMapOpen && !stationOpen && !foundryOpen && <div className={`coop-demolition-interact pointer-events-none absolute ${activelyPlanting ? 'coop-demolition-interact--active' : ''}`}>
        <div className="coop-demolition-interact__eyebrow">SITE {demolitionSite} · EXPLOSIVE CHARGE</div>
        <div className="coop-demolition-interact__action">
          <kbd>{isMobileTouchDevice ? 'USE' : 'F'}</kbd>
          <span>{activelyPlanting ? 'PLANTING CHARGE' : demolitionMission.progress > 0 ? 'PLANT INTERRUPTED · HOLD TO CONTINUE' : `HOLD ${isMobileTouchDevice ? 'USE' : 'F'} TO PLANT CHARGE`}</span>
          <b>{Math.round(demolitionProgress)}%</b>
        </div>
        <div className="coop-demolition-interact__meter" role="progressbar" aria-label={`Plant charge at site ${demolitionSite}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(demolitionProgress)}><i style={{ width: `${demolitionProgress}%` }} /></div>
        <small>{activelyPlanting ? `KEEP ${isMobileTouchDevice ? 'USE' : 'F'} HELD · REMAIN INSIDE THE MARKED SITE` : demolitionMission.progress > 0 ? 'PROGRESS IS DECAYING' : `STAND CLOSE TO THE DEVICE AND KEEP ${isMobileTouchDevice ? 'USE' : 'F'} HELD`}</small>
      </div>}
      {localSnapshot?.carryingHostage && <div className="pointer-events-none absolute left-1/2 top-[31%] z-[55] -translate-x-1/2 border border-amber-300/50 bg-black/80 px-4 py-2 text-center text-[10px] font-black uppercase tracking-[.18em] text-amber-100"><div>CARRYING HOSTAGE</div><small className="mt-1 block font-mono text-[8px] text-white/55">WEAPON / SPRINT / JET DISABLED · SPEED −18% · SQUAD PROTECTION REQUIRED</small></div>}
      {backpackOpen && localSnapshot && <CoopBackpackModal
        player={localSnapshot}
        message={backpackMessage}
        tr={tr}
        onDrop={dropBackpackItem}
        onClose={closeBackpackAndResume}
      />}
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
                {tr(isLocalInGas ? 'mask.scrubber' : 'mask.purifier')}
              </span>
              <span className="font-mono flex items-center gap-1.5">
                {filterPercentage < 15 && <span className="text-[8px] font-black text-rose-400 tracking-wider animate-pulse">{tr('mask.critical')}</span>}
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
        <div className="coop-vitals__topline"><span>{tr('hud.level', { level: hud.level })}</span><span>{tr('hud.kills', { count: hud.kills })}</span><span>{tr('hud.live', { count: hud.players })}</span></div>
        <div className="coop-vitals__health"><span>{Math.ceil(hud.health)}</span><div className="coop-meter"><i style={{ width: `${Math.max(0, Math.min(100, hud.health / Math.max(1, hud.maxHealth) * 100))}%` }} /></div></div>
        <div className="coop-vitals__lower"><span>{tr('hud.experience', { percent: Math.floor(hud.experience / Math.max(1, hud.experienceToNextLevel) * 100) })}</span><span className="coop-vitals__currency">¤ {hud.coins}</span>{hud.cores > 0 && <span>{tr('hud.cores', { count: hud.cores })}</span>}</div>
        {localSnapshot?.imprint && <div className="mt-1 font-mono text-[8px] uppercase tracking-[.16em] text-cyan-200/65">{tr('hud.imprint', { generation: String(localSnapshot.imprint.generation).padStart(2, '0'), rating: coopImprintRating(localSnapshot.imprint.ranks) })}</div>}
        <div className="coop-xp"><i style={{ width: `${Math.max(0, Math.min(100, hud.experience / Math.max(1, hud.experienceToNextLevel) * 100))}%` }} /></div>
        {localSnapshot && (localSnapshot.armorHp > 0 || localSnapshot.gasMaskHp > 0 || localSnapshot.selfRevives > 0 || localSnapshot.passiveModules.length > 0) && (
          <div className="coop-vitals__equipment">
            {localSnapshot.armorHp > 0 && <span><ShieldPlus size={11} className="inline mr-1" /> {tr('hud.armor', { amount: Math.ceil(localSnapshot.armorHp) })}</span>}
            {localSnapshot.gasMaskHp > 0 && <span className="text-emerald-300 font-bold ml-1.5">{tr('hud.mask', { percent: Math.round((localSnapshot.gasMaskHp / localSnapshot.gasMaskMaxHp) * 100) })}</span>}
            {localSnapshot.selfRevives > 0 ? ` · ${tr('hud.rebootReady')}` : ''}
          </div>
        )}
        {hud.invulnerableRemainingMs > 0 && <div className="coop-vitals__shield">{tr('hud.shielded', { seconds: Math.ceil(hud.invulnerableRemainingMs / 1000) })}</div>}
      </div>
      {squadmates.length > 0 && <div className="coop-squad pointer-events-none absolute z-50">
        {squadmates.map(player => {
          const status = player.lifeState === 'alive' ? `${Math.ceil(player.health)}/${Math.ceil(player.maxHealth)}` : player.lifeState === 'downed' ? (player.downedRemainingMs > 0 ? tr('hud.squadmateDown', { seconds: Math.ceil(player.downedRemainingMs / 1000) }) : tr('hud.squadmateRevivable')) : tr('hud.squadmateOut');
          return <div key={player.id} className={`coop-squadmate coop-squadmate--${player.lifeState}`}>
            <span className="coop-squadmate__signal" style={{ backgroundColor: player.color, color: player.color }} />
            <span className="coop-squadmate__name">{player.label}</span><span className="coop-squadmate__status">{status}</span>
            <span className="coop-squadmate__meter"><i style={{ width: `${player.lifeState === 'downed' ? Math.max(0, player.reviveProgressMs / 3000 * 100) : Math.max(0, player.health / Math.max(1, player.maxHealth) * 100)}%`, backgroundColor: player.lifeState === 'downed' ? '#fbbf24' : player.color }} /></span>
          </div>;
        })}
      </div>}
      {(chatMessages.length > 0 || chatOpen) && <section className={`coop-chat ${chatOpen ? 'coop-chat--open' : ''}`} aria-label={tr('chat.open')}>
        <div className="coop-chat__messages" role="log" aria-live="polite" aria-relevant="additions">
          {chatMessages.slice(chatOpen ? -8 : -4).map(message => <div key={message.id} className="coop-chat__message">
            <b style={{ color: message.playerColor }}>{message.playerLabel}</b>
            <span>{message.text}</span>
          </div>)}
        </div>
        {chatOpen && <form className="coop-chat__composer" onSubmit={event => { event.preventDefault(); if (sendChatMessage()) closeChatAndResume(); }} onMouseDown={event => event.stopPropagation()}>
          <MessageSquare size={13} aria-hidden="true" />
          <input
            ref={chatInputRef}
            value={chatDraft}
            onChange={event => setChatDraft(event.target.value)}
            onKeyDown={event => {
              event.stopPropagation();
              if (event.key === 'Escape') { event.preventDefault(); closeChatAndResume(); }
            }}
            onKeyUp={event => event.stopPropagation()}
            maxLength={COOP_CHAT_MAX_LENGTH * 2}
            placeholder={tr('chat.placeholder')}
            aria-label={tr('chat.placeholder')}
            autoComplete="off"
            spellCheck="true"
          />
          <span className="coop-chat__count">{Math.min(COOP_CHAT_MAX_LENGTH, Array.from(chatDraft).length)}/{COOP_CHAT_MAX_LENGTH}</span>
          <button type="submit" disabled={!normalizeCoopChatText(chatDraft)} aria-label={tr('chat.send')}><Send size={13} /></button>
          <button type="button" onClick={closeChatAndResume} aria-label={tr('chat.close')}><X size={13} /></button>
        </form>}
      </section>}
      {isSpectator && <div className="coop-spectating pointer-events-none absolute z-50" style={{ top: objectiveHud ? '82px' : '28px' }}><span>{tr('hud.spectating')}</span><b>{spectatorTarget?.label || tr('hud.acquireTarget')}</b><small>{tr('hud.nextPlayer')}</small></div>}
      {!isSpectator && !fallCinematicActive && (hud.lifeState === 'downed' || hud.lifeState === 'eliminated' || hud.lifeState === 'extracted') && <div className="coop-spectating pointer-events-none absolute z-50" style={{ top: objectiveHud ? '82px' : '28px' }}><span className={hud.lifeState === 'downed' ? 'text-amber-300 font-black' : hud.lifeState === 'extracted' ? 'text-emerald-300 font-black' : 'text-rose-300 font-black'}>● {hud.lifeState === 'extracted' ? 'EXTRACTED · SPECTATING' : tr(hud.lifeState === 'downed' ? 'hud.downedSpectating' : 'hud.eliminatedSpectating')}</span><b style={{ color: spectatedSquadmate?.color || '#f0abfc' }}>{spectatedSquadmate?.label || downedSpectatorTarget?.label || tr('hud.squad')}</b><small>{tr('hud.cycleSquad')}</small></div>}
      {objectiveHud && <div className={`coop-objective coop-objective--${objectiveHud.tone} pointer-events-none absolute z-50`}>
        <div className="coop-objective__meta"><span>{objectiveHud.label}</span><span>{objectiveHud.detail}</span></div>
        <div className="coop-objective__title">{objectiveHud.title}</div>
        {demolitionMission && <div className="coop-objective__demolition-steps">
          {demolitionMission.points.map((point, index) => <span key={point.id} data-state={point.state}>
            <b>SITE {index === 0 ? 'A' : 'B'}</b>
            <small>{point.state === 'completed' ? 'DESTROYED' : point.state === 'defending' ? 'ARMED' : point.state === 'arming' ? 'PLANTING' : point.state === 'locked' ? 'LOCKED' : 'TARGET'}</small>
          </span>)}
        </div>}
        {objectiveHud.progress !== undefined && <div className="coop-objective__progress"><div className="coop-objective__meter"><i style={{ width: `${Math.max(0, Math.min(100, objectiveHud.progress))}%` }} /></div>{objectiveHud.progressText && <b>{objectiveHud.progressText}</b>}</div>}
      </div>}
      {combatNotice && <div className="pointer-events-none absolute left-1/2 top-[24%] z-50 -translate-x-1/2 text-center text-sm font-black uppercase tracking-[0.2em] drop-shadow-[0_0_12px_currentColor]" style={{ color: combatNotice.color }}>{combatNotice.text}</div>}
      {specialReadyCue && <div
        key={specialReadyCue.id}
        className="coop-special-ready pointer-events-none absolute z-50"
        style={{ '--special-color': specialReadyCue.color } as CSSProperties}
        aria-live="polite"
      ><kbd>RMB</kbd><span>{tr('hud.specialReady', { name: specialReadyCue.name })}</span></div>}
      {activeRecoveryRelay && <div className="coop-healing-field-status pointer-events-none absolute left-1/2 top-[56%] z-50 -translate-x-1/2" aria-label={`Recovery field ${COOP_RECOVERY_RELAY_HEAL_PER_SECOND} HP per second`}>
        <HeartPulse size={13} strokeWidth={2.6} />
        <span>{hud.health < hud.maxHealth ? `+${COOP_RECOVERY_RELAY_HEAL_PER_SECOND} HP/s` : 'RECOVERY FIELD READY'}</span>
      </div>}
      {healingPops.length > 0 && <div className="coop-healing-pops pointer-events-none absolute left-1/2 top-[51%] z-[55] -translate-x-1/2" aria-live="polite">
        {healingPops.map((pop, index) => <div key={pop.id} className="coop-healing-pop" style={{ '--heal-index': index } as CSSProperties}>
          <HeartPulse size={18} strokeWidth={3} />
          <b>+{formatHealingAmount(pop.amount)}</b><span>{tr('unit.hp')}</span>
        </div>)}
      </div>}
      {revivingTarget && <div className="pointer-events-none absolute left-1/2 top-[56%] z-20 w-[min(330px,calc(100vw-2rem))] -translate-x-1/2 border border-cyan-300/55 bg-black/80 px-4 py-3 text-center shadow-[0_0_24px_rgba(34,211,238,.18)] backdrop-blur-md"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100">{tr('hud.holdRevive', { name: revivingTarget.label })}</div><div className="mt-2 h-2 overflow-hidden bg-cyan-950/80"><div className="h-full bg-cyan-300 transition-[width] duration-100" style={{ width: `${Math.max(0, revivingTarget.reviveProgressMs / 3000 * 100)}%` }} /></div><div className="mt-1 text-[9px] font-mono text-cyan-100/70">{Math.round(revivingTarget.reviveProgressMs / 3000 * 100)}%</div></div>}
      {!isSpectator && hud.lifeState === 'alive' && <CoopCombatReticle mode={reticleMode} />}
      {!isSpectator && hud.lifeState === 'alive' && matchSnapshot && localSnapshot && (
        <CoopOffscreenThreats
          snapshot={matchSnapshot}
          localPlayer={localSnapshot}
          renderer={rendererRef.current}
        />
      )}
      {!isSpectator && hud.lifeState === 'alive' && matchSnapshot && localSnapshot && (
        <CoopReticleCompass
          localPlayer={localSnapshot}
          players={matchSnapshot.players}
          enemies={matchSnapshot.enemies}
          mission={matchSnapshot.fieldMissions?.active}
          pings={matchSnapshot.pings}
          renderer={rendererRef.current}
          language={launch.language}
        />
      )}
      {!isSpectator && hud.lifeState === 'alive' && !buildMode && activeWeapon && <div className="coop-weapons pointer-events-none absolute z-50">
        <div className="coop-weapons__class" style={{ color: classOperator.color }}><b>{classOperator.className}</b><span>{classOperator.role}</span></div>
        <div className="coop-weapons__meter"><span style={{ color: classOperator.color }}>{classOperator.resourceLabel}</span><i><em style={{ width: `${Math.max(0, Math.min(100, (localSnapshot?.artifactResource || 0) / classOperator.resourceMax * 100))}%`, backgroundColor: classOperator.color }} /></i><b>{Math.floor(localSnapshot?.artifactResource || 0)}/{classOperator.resourceMax}</b></div>
        <div className="coop-weapons__meter coop-weapons__meter--jet"><span>BURST PACK</span><i><em style={{ width: `${Math.max(0, Math.min(100, localSnapshot?.jetFuel ?? 100))}%` }} /></i><b>{Math.round(localSnapshot?.jetFuel ?? 100)}</b></div>
        {hud.selectedSlot === 3 && <div className="coop-weapons__artifact" data-ready={specialReady} style={{ '--special-color': classOperator.color } as CSSProperties}><kbd>{isGamepadControlScheme(controlScheme) ? 'LT' : 'RMB'}</kbd><b>{classOperator.spenderName}</b><span>{classOperator.spenderDescription}</span>{specialReady && <small className="coop-weapons__artifact-ready">{tr('hud.specialCharged')}</small>}{localSnapshot?.artifactProc && <small>{localSnapshot.artifactProc.replaceAll('_', ' ')}</small>}</div>}
        <div className="coop-weapons__name" style={{ color: activeWeapon.color }}><span>{tr(coopWeaponShortNameKey(activeWeaponState?.weaponId || 'plasma_gun'))}</span><small>{tr('hud.weaponLevel', { level: activeWeaponState?.level || 1 })}</small></div>
        <div className="coop-weapons__ammo"><b>{activeWeaponState?.magazineAmmo ?? '—'}</b><span>/ {activeWeaponState?.reserveAmmo ?? '—'}</span></div>
        <div className="coop-weapons__slots">{hud.weapons.map((weapon, index) => <span key={`${weapon.weaponId}-${index}`} data-selected={hud.selectedSlot === index}>{index + 1}</span>)}</div>
        {hud.isReloading && <div className="coop-weapons__reload">{tr('hud.reloading')}</div>}
      </div>}
      {!isSpectator && hud.lifeState === 'alive' && buildMode && (
        <div className={`pointer-events-none absolute bottom-5 left-1/2 z-[70] -translate-x-1/2 border border-cyan-300/45 bg-[#050b13]/94 p-3 shadow-[0_0_32px_rgba(34,211,238,.2)] backdrop-blur-md ${buildPaletteExpanded ? 'w-[min(880px,calc(100vw-2rem))]' : 'w-[min(390px,calc(100vw-2rem))]'}`}>
          <div className="flex items-center justify-between gap-4 border-b border-cyan-100/15 pb-2">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-cyan-100"><Hammer size={15} />{tr('build.fieldEngineering')}</div>
            <div className="text-right font-mono text-[10px] uppercase text-cyan-200"><div>{tr('build.charges', { count: hud.fabricatorCharges })}</div>{hud.fabricatorCharges < COOP_MAX_FABRICATOR_CHARGES && <small className="text-[8px] text-cyan-100/50">{tr('build.recharge', { seconds: Math.ceil(hud.fabricatorRechargeRemainingMs / 1000) })}</small>}</div>
          </div>
          {engineeringTarget && <div className="mt-2 flex items-center gap-3 border border-white/10 bg-white/[.035] px-2 py-1.5 font-mono text-[8px] uppercase tracking-wider text-white/65"><span style={{ color: engineeringTarget.ownerColor }}>{tr(`build.${engineeringTarget.type}.name` as CoopTextKey)}</span><span>{tr('build.integrity', { percent: Math.round(engineeringTarget.health / Math.max(1, engineeringTarget.maxHealth) * 100) })}</span><span>{tr('build.lifetime', { seconds: Math.ceil(Math.max(0, engineeringTarget.expiresAtMs - (matchSnapshot?.elapsedMs || 0)) / 1000) })}</span>{engineeringTarget.tacticalBonus && <span className="text-emerald-300">{tr('build.tacticalBonus')}</span>}{Boolean(engineeringTarget.linkedStructureIds?.length) && <span className="text-violet-300">{tr('build.linked', { count: engineeringTarget.linkedStructureIds?.length || 0 })}</span>}</div>}
          {!buildPaletteExpanded && <div className="mt-2 flex items-center justify-between border px-3 py-2" style={{ borderColor: `${COOP_STRUCTURE_DEFINITIONS[buildType].color}66`, backgroundColor: `${COOP_STRUCTURE_DEFINITIONS[buildType].color}16`, boxShadow: `inset 0 0 18px ${COOP_STRUCTURE_DEFINITIONS[buildType].color}12` }}><span className="text-[10px] font-black uppercase" style={{ color: COOP_STRUCTURE_DEFINITIONS[buildType].color }}>{tr(`build.${buildType}.name` as CoopTextKey)}</span><span className="font-mono text-[8px] uppercase text-white/45">{tr('build.holdPalette')}</span></div>}
          {buildPaletteExpanded && <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {COOP_BUILD_TYPES.map((type, index) => {
              const definition = COOP_STRUCTURE_DEFINITIONS[type];
              const selected = type === buildType;
              return <div key={type} className={`border px-2 py-2 ${selected ? 'text-white' : 'text-white/65'}`} style={{ borderColor: `${definition.color}${selected ? 'cc' : '42'}`, backgroundColor: `${definition.color}${selected ? '26' : '0c'}`, boxShadow: selected ? `0 0 18px ${definition.color}28, inset 0 0 14px ${definition.color}18` : undefined }}>
                <div className="flex items-center justify-between gap-2 text-[9px] font-black uppercase"><span style={{ color: selected ? definition.color : undefined }}><kbd className="mr-1.5" style={{ color: definition.color }}>{index + 1}</kbd>{tr(`build.${type}.name` as CoopTextKey)}</span><span style={{ color: definition.color }}>{definition.chargeCost}◆</span></div>
                <div className="mt-1 hidden text-[8px] leading-tight text-white/45 sm:block">{tr(`build.${type}.description` as CoopTextKey)}</div>
              </div>;
            })}
          </div>}
          <div className="mt-2 flex items-center justify-between gap-3 text-[8px] uppercase tracking-wider text-white/45"><span>{tr(buildPaletteExpanded ? 'build.controls' : 'build.controlsCompact')}</span><span className={buildMessage?.includes('deployed') ? 'text-emerald-300' : 'text-amber-200'}>{buildMessage}</span></div>
        </div>
      )}
      {matchSnapshot && localSnapshot && !tacticalMapOpen && <CoopMinimap snapshot={matchSnapshot} localPlayer={localSnapshot} language={launch.language} />}
      {tacticalMapOpen && matchSnapshot && localSnapshot && <EnhancedCoopTacticalMap snapshot={matchSnapshot} localPlayer={localSnapshot} onPingMission={pingMissionFromMap} onClose={() => { setTacticalMapPanelOpen(false); resumeGameplayInteraction(); }} />}
      {stationOpen && nearbyStation && <div onMouseDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} className="absolute inset-0 z-[80] bg-black/55 backdrop-blur-[2px]" aria-hidden="true" />}
      {nearbyStation && !stationOpen && <div onMouseDown={event => event.stopPropagation()} className="absolute bottom-5 left-5 z-[85] w-[min(420px,calc(100vw-2.5rem))] border border-cyan-300/35 bg-[#07111b]/95 p-4 shadow-[0_0_28px_rgba(34,211,238,.14)] backdrop-blur-md">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-cyan-200/20 pb-3">
          <div><div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-cyan-200"><ShoppingCart size={16} /> {tr('shop.title')}</div></div>
          <div className="shrink-0 text-right"><div className="text-[9px] font-black uppercase tracking-wider text-white/45">{tr('shop.credits')}</div><div className="mt-0.5 font-mono text-sm text-amber-200"><Coins className="mr-1 inline" size={13} />{localSnapshot.coins}</div></div>
          <button onClick={() => { rendererRef.current?.exitPointerLock(); setStationPanelOpen(true); }} className="flex items-center gap-2 border border-cyan-300/40 bg-cyan-400/10 px-3 py-1.5 text-[10px] font-black uppercase text-cyan-100 transition hover:bg-cyan-400/20"><kbd className="inline-flex h-6 min-w-6 items-center justify-center border border-cyan-100/50 bg-black/40 px-1 font-mono text-[10px]">F</kbd>{tr('shop.openLabel')}</button>
        </div>
        <p className="mt-3 text-[10px] text-white/50">{tr('shop.interact')}</p>
      </div>}
      {stationOpen && nearbyStation && <CoopShopMenu
        categoryId={stationCategory}
        player={localSnapshot}
        players={matchSnapshot?.players || []}
        stock={nearbyStation.stock}
        message={stationMessage}
        tr={tr}
        onCategory={chooseStationCategory}
        onPurchase={itemId => { soundManager.playUIClick(); purchaseStationItem(nearbyStation.id, itemId); }}
        onRedeploy={targetPlayerId => { soundManager.playUIClick(); redeployOperator(nearbyStation.id, targetPlayerId); }}
        onUnavailable={issue => { soundManager.playDamage(); setStationMessage(tr(`purchase.${issue.code}` as CoopTextKey, { amount: issue.amount || 0 })); }}
        onBack={() => chooseStationCategory(null)}
        onClose={closeStationAndResume}
      />}
      {nearbyFoundry && !foundryOpen && !stationOpen && <div onMouseDown={event => event.stopPropagation()} className="absolute bottom-5 left-5 z-[85] w-[min(420px,calc(100vw-2.5rem))] border border-amber-300/40 bg-[#160f08]/95 p-4 shadow-[0_0_28px_rgba(245,158,11,.18)] backdrop-blur-md">
        <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.2em] text-amber-200"><Hammer size={16} />{tr('foundry.title')}</div><button onClick={() => { rendererRef.current?.exitPointerLock(); setFoundryPanelOpen(true); }} className="border border-amber-300/40 bg-amber-400/10 px-3 py-1.5 text-[10px] font-black uppercase text-amber-100"><kbd className="mr-2">F</kbd>{tr('foundry.open')}</button></div>
        <p className="mt-3 text-[10px] text-white/50">{tr('foundry.interact')}</p>
      </div>}
      {foundryOpen && nearbyFoundry && <CoopWeaponFoundryMenu player={localSnapshot} message={foundryMessage} tr={tr} onForge={weaponId => { soundManager.playUIClick(); forgeWeapon(nearbyFoundry.id, weaponId); }} onClose={closeFoundryAndResume} />}
      {/* Downed Edge Danger Vignette */}
      {!isSpectator && hud.lifeState === 'downed' && (
        <div
          className="pointer-events-none absolute inset-0 z-20 bg-[radial-gradient(ellipse_at_center,transparent_52%,rgba(245,158,11,0.12)_78%,rgba(220,38,38,0.32)_100%)] animate-pulse"
          style={{ animationDuration: '3s' }}
        />
      )}
      {/* Eliminated Edge Vignette */}
      {!isSpectator && !fallCinematicActive && hud.lifeState === 'eliminated' && hud.matchState === 'active' && (
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
                  {tr('hud.operativeDown')}
                </span>
                {hud.reviverId ? (
                  <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-cyan-200 border border-cyan-400/40 animate-pulse">
                    {tr('hud.reviving')}
                  </span>
                ) : (localSnapshot?.selfRevives ?? 0) > 0 ? (
                  <span className="rounded bg-amber-500/25 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-200 border border-amber-400/50">
                    {tr('hud.rebootAvailable')}
                  </span>
                ) : null}
              </div>
              <div className="font-mono text-sm font-black text-amber-300">
                {hud.downedRemainingMs > 0 ? tr('hud.bleedout', { seconds: Math.ceil(hud.downedRemainingMs / 1000) }) : tr('hud.revivable')}
              </div>
            </div>

            {/* Middle row: Revive status or instructions */}
            <div className="mt-2.5">
              {hud.reviverId ? (
                <div>
                  <div className="flex items-center justify-between text-[11px] font-bold text-cyan-100">
                    <span>
                      {tr('hud.revivingYou', { name: activeReviver?.label || tr('hud.teammate') })}
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
                      {tr('hud.selfRevive')}
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
                  <span>{tr('hud.teammateReviveHelp')}</span>
                  <span className="text-white/40 font-mono text-[9px]">{tr('hud.bodyPreserved')}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Eliminated Spectating HUD (Anchored at bottom) */}
      {!isSpectator && !fallCinematicActive && hud.lifeState === 'eliminated' && hud.matchState === 'active' && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-40 w-[min(480px,calc(100vw-2.5rem))] -translate-x-1/2">
          <div className="border border-rose-400/40 bg-[#12060a]/92 p-3.5 text-center shadow-[0_0_35px_rgba(244,63,94,0.2)] backdrop-blur-xl">
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-rose-300">
              {tr('hud.eliminatedSquad')}
            </div>
            <div className="mt-1 text-[11px] text-white/65">
              {tr('hud.watchingSquad', { name: spectatedSquadmate?.label || downedSpectatorTarget?.label || tr('hud.yourSquad') })}
            </div>
          </div>
        </div>
      )}
      <div style={{ display: fallCinematicActive ? 'none' : 'contents' }}>
      {hud.matchState !== 'active' && !matchSnapshot?.results && <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"><div className="w-[min(440px,calc(100vw-2rem))] border border-rose-300/45 bg-[#10070b] p-7 text-center shadow-[0_0_60px_rgba(244,63,94,.2)]"><div className="text-[10px] font-black uppercase tracking-[0.32em] text-rose-200">{tr(hud.matchState === 'solo_defeat' ? 'result.runEnded' : 'result.squadWiped')}</div><h2 className="mt-3 text-3xl font-black text-white">{tr(hud.matchState === 'solo_defeat' ? 'result.systemFailure' : 'result.noOperatives')}</h2><p className="mt-3 text-xs leading-relaxed text-white/60">{tr('result.killsConfirmed', { count: hud.kills })} {tr(launch.role === 'host' ? 'result.retryHost' : 'result.waitHost')}</p><div className="mt-6 flex justify-center gap-3">{launch.role === 'host' && <button onClick={retryRun} className="border border-emerald-300/55 bg-emerald-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-emerald-100 transition hover:bg-emerald-400/20">{tr('result.retry')}</button>}<button onClick={onExit} className="border border-cyan-300/45 bg-cyan-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-cyan-100 transition hover:bg-cyan-400/20">{tr('result.returnLobby')}</button></div></div></div>}
      {matchSnapshot?.results && isSpectator && <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#03070c]/90 p-4 backdrop-blur-xl"><div className="w-[min(760px,calc(100vw-2rem))] border border-cyan-300/35 bg-[#07111b] p-6 shadow-[0_0_60px_rgba(34,211,238,.16)]"><div className="text-center"><div className={`text-[10px] font-black uppercase tracking-[0.32em] ${matchSnapshot.results.success ? 'text-cyan-200' : 'text-rose-200'}`}>{tr(matchSnapshot.results.success ? 'result.extracted' : 'result.failed')}</div><h2 className="mt-2 text-3xl font-black text-white">{tr(matchSnapshot.results.success ? 'result.complete' : 'result.signalLost')}</h2><p className="mt-2 text-xs text-white/55">{tr('result.summary', { minutes: Math.ceil(matchSnapshot.results.durationMs / 60000), contracts: matchSnapshot.results.contractsCompleted, bosses: matchSnapshot.results.bossesDefeated })}</p></div><div className="mt-6 grid gap-3 sm:grid-cols-2">{matchSnapshot.results.players.map(player => <ResultPlayerCard key={player.playerId} player={player} tr={tr} />)}</div><div className="mt-6 text-center"><button onClick={onExit} className="border border-cyan-300/45 bg-cyan-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-cyan-100 hover:bg-cyan-400/20">{tr('result.returnLobby')}</button></div></div></div>}
      {!fallCinematicActive && matchSnapshot?.results && !isSpectator && <CoopImprintDebrief
        language={launch.language}
        results={matchSnapshot.results}
        localPlayerId={launch.localPlayerId}
        profile={imprintProfile}
        operatorId={localOperatorId}
        isHost={launch.role === 'host'}
        onUpgrade={upgradeImprint}
        onRetry={retryRun}
        onExit={onExit}
      />}
      </div>
      {connectionStatus !== 'connected' && <div className={`absolute left-1/2 top-20 z-30 -translate-x-1/2 border px-4 py-3 text-center text-xs backdrop-blur-sm ${connectionStatus === 'reconnecting' ? 'border-amber-300/45 bg-amber-950/80 text-amber-100' : 'border-red-300/45 bg-red-950/80 text-red-100'}`}><div>{connectionMessage}</div>{connectionStatus === 'disconnected' && <button onClick={onExit} className="mt-2 border border-red-200/35 px-3 py-1 text-[10px] font-black uppercase tracking-wider hover:bg-red-300/10">{tr('connection.backServers')}</button>}</div>}
    </div>
  );
}

function CoopDeploymentOverlay({
  stage,
  players,
  localPlayerId,
  controlScheme,
  language,
  isSpectator,
  sector,
  insertionRemainingMs,
  onDeploy,
}: {
  stage: DeploymentStage;
  players: CoopPlayerSeed[];
  localPlayerId: string;
  controlScheme: ControlScheme;
  language: CoopLanguage;
  isSpectator: boolean;
  sector: string;
  insertionRemainingMs?: number;
  onDeploy: () => void;
}) {
  const tr = (key: CoopTextKey, params?: Record<string, string | number>) => coopText(language, key, params);
  const movement = CONTROL_SCHEME_DETAILS[controlScheme].bindings;
  const movementLabel = isGamepadControlScheme(controlScheme)
    ? 'L STICK'
    : `${movement.up}${movement.left}${movement.down}${movement.right}`.toUpperCase();
  const localPlayer = players.find(player => player.id === localPlayerId);
  const countdown = Math.max(1, Math.ceil((insertionRemainingMs ?? 12_000) / 1000));

  return <section
    className={`coop-deployment coop-deployment--${stage} ${isSpectator ? 'coop-deployment--spectator' : ''}`}
    aria-label={tr(isSpectator ? 'deployment.spectatorTitle' : 'deployment.title')}
    aria-live="polite"
  >
    <div className="coop-deployment__world-wash" aria-hidden="true" />
    <div className="coop-deployment__scan" aria-hidden="true" />
    <div className="coop-deployment__noise" aria-hidden="true" />

    <div className="coop-deployment__topline">
      <span><Signal size={13} /> KILLSYNC // {tr(isSpectator ? 'deployment.liveSignal' : 'deployment.squadDeployment')}</span>
      <span className="coop-deployment__topline-status"><i />{tr('deployment.combatMesh')}</span>
    </div>

    <div className="coop-deployment__briefing">
      <div className="coop-deployment__eyebrow"><Radio size={14} />{tr(isSpectator ? 'deployment.signalFound' : 'deployment.operation')} // {tr('deployment.operationName')}</div>
      <h1>KILLSYNC</h1>
      <div className="coop-deployment__welcome">
        <span>{tr('deployment.welcome')}</span>
        <b>{localPlayer?.label || tr('deployment.operative')}</b>
        <i>{tr(isSpectator ? 'deployment.liveCombat' : 'deployment.identityConfirmed')}</i>
      </div>
      <div className="coop-deployment__sector">{tr('deployment.district', { sector })}<span />{tr('deployment.threat')}</div>

      {!isSpectator && <div className="coop-deployment__mission">
        <small>{tr('deployment.primary')}</small>
        <strong>{tr('deployment.objective')}</strong>
        <p>{tr('deployment.objectiveHelp')}</p>
      </div>}

      <div className="coop-deployment__roster" aria-label={tr('deployment.squad')}>
        {players.map((player, index) => <div key={player.id} className="coop-deployment__operative" style={{ '--operative-color': player.color, '--operative-delay': `${.82 + index * .16}s` } as CSSProperties}>
          <span className="coop-deployment__operative-index">0{index + 1}</span>
          <span className="coop-deployment__operative-signal"><i /></span>
          <b>{player.label}{player.id === localPlayer?.id ? <em>{tr('deployment.you')}</em> : null}</b>
          <span>{tr(isSpectator ? 'deployment.live' : 'deployment.linked')}</span>
        </div>)}
      </div>

      {isSpectator ? <div className="coop-deployment__spectating"><Crosshair size={15} />{tr('deployment.synchronizing')}</div> : <div className="coop-deployment__controls">
        <span><kbd>{movementLabel}</kbd>{tr('deployment.move')}</span>
        <span><kbd>{isGamepadControlScheme(controlScheme) ? 'R STICK' : tr('deployment.mouse')}</kbd>{tr('deployment.aim')}</span>
        <span><kbd>{isGamepadControlScheme(controlScheme) ? 'Y' : 'F'}</kbd>{tr('deployment.interact')}</span>
        <span><kbd>G</kbd>{tr('deployment.gear')}</span>
      </div>}
    </div>

    {!isSpectator && <div className="coop-deployment__release">
      <div className="coop-deployment__count"><span>{tr('deployment.insertion')}</span><b>{String(countdown).padStart(2, '0')}</b></div>
      {stage === 'ready' && <button type="button" onMouseDown={event => event.stopPropagation()} onClick={onDeploy}>
        <Crosshair size={17} />{tr('deployment.clickToDeploy')}
      </button>}
      {stage === 'briefing' && <span className="coop-deployment__acquiring">{tr('deployment.acquiring')}</span>}
    </div>}

    <div className="coop-deployment__shutter coop-deployment__shutter--top" aria-hidden="true" />
    <div className="coop-deployment__shutter coop-deployment__shutter--bottom" aria-hidden="true" />
  </section>;
}

function CoopBackpackModal({
  player,
  message,
  tr,
  onDrop,
  onClose,
}: {
  player: CoopSnapshot['players'][number];
  message: string | null;
  tr: (key: CoopTextKey, params?: Record<string, string | number>) => string;
  onDrop: (kind: CoopInventoryDropKind) => void;
  onClose: () => void;
}) {
  const itemClass = 'group flex min-h-28 w-full items-center gap-4 border bg-white/[.035] p-4 text-left transition enabled:hover:bg-white/[.075] disabled:cursor-not-allowed disabled:opacity-35';
  return <div role="dialog" aria-modal="true" aria-label={tr('backpack.title')} className="absolute inset-0 z-[108] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]" onMouseDown={event => event.stopPropagation()}>
    <div className="w-[min(560px,calc(100vw-2rem))] border border-cyan-300/45 bg-[#07111b]/98 p-5 shadow-[0_0_65px_rgba(34,211,238,.2)]">
      <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
        <div><div className="flex items-center gap-2 text-sm font-black uppercase tracking-[.22em] text-cyan-100"><Backpack size={19} />{tr('backpack.title')}</div><p className="mt-2 text-[10px] leading-relaxed text-white/50">{tr('backpack.help')}</p></div>
        <button autoFocus type="button" aria-label={tr('backpack.close')} onClick={onClose} className="border border-white/15 bg-white/5 p-2 text-white/65 hover:border-cyan-300/50 hover:text-cyan-100"><X size={16} /></button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button type="button" disabled={player.coins <= 0} className={`${itemClass} border-amber-300/30`} onContextMenu={event => { event.preventDefault(); onDrop('cash'); }}>
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-amber-300/35 bg-amber-300/10 text-amber-300"><Coins size={25} /></span>
          <span><b className="block text-sm uppercase text-amber-100">{tr('backpack.cash')}</b><strong className="mt-1 block font-mono text-xl text-white">¤ {player.coins}</strong><small className="mt-2 block text-[9px] uppercase tracking-wider text-white/45 group-enabled:group-hover:text-amber-200">{tr('backpack.rightClickAll')}</small></span>
        </button>
        <button type="button" disabled={player.selfRevives <= 0} className={`${itemClass} border-rose-300/30`} onContextMenu={event => { event.preventDefault(); onDrop('self_revive'); }}>
          <span className="flex h-12 w-12 shrink-0 items-center justify-center border border-rose-300/35 bg-rose-300/10 text-rose-300"><HeartPulse size={25} /></span>
          <span><b className="block text-sm uppercase text-rose-100">{tr('backpack.selfRevive')}</b><strong className="mt-1 block font-mono text-xl text-white">× {player.selfRevives}</strong><small className="mt-2 block text-[9px] uppercase tracking-wider text-white/45 group-enabled:group-hover:text-rose-200">{tr('backpack.rightClick')}</small></span>
        </button>
      </div>
      {message && <div className="mt-4 border border-cyan-300/20 bg-cyan-300/[.06] px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-cyan-100">{message}</div>}
      <div className="mt-4 flex items-center justify-between text-[9px] uppercase tracking-wider text-white/35"><span>{tr('backpack.movement')}</span><span><kbd className="text-cyan-200">G</kbd> / <kbd className="text-cyan-200">ESC</kbd> · {tr('backpack.close')}</span></div>
    </div>
  </div>;
}

function CoopImprintDebrief({
  language,
  results,
  localPlayerId,
  profile,
  operatorId,
  isHost,
  onUpgrade,
  onRetry,
  onExit,
}: {
  language: CoopLanguage;
  results: NonNullable<CoopSnapshot['results']>;
  localPlayerId: string;
  profile: CoopImprintProfile;
  operatorId: string;
  isHost: boolean;
  onUpgrade: (statId: CoopImprintStatId) => void;
  onRetry: () => void;
  onExit: () => void;
}) {
  const imprint = getCoopOperatorImprint(profile, operatorId);
  const localResult = results.players.find(player => player.playerId === localPlayerId);
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  const tr = (key: CoopTextKey, params?: Record<string, string | number>) => coopText(language, key, params);
  const preserved = !results.success && !results.squadWiped;
  const resultTitle = tr(results.success ? 'imprint.secured' : preserved ? 'imprint.preserved' : 'imprint.lost');
  const resultHelp = tr(results.success ? 'imprint.securedHelp' : preserved ? 'imprint.preservedHelp' : 'imprint.lostHelp');

  useEffect(() => {
    initialFocusRef.current?.focus({ preventScroll: true });
  }, [results.runId]);

  return <div role="dialog" aria-modal="true" aria-label={resultTitle} className="absolute inset-0 z-[60] overflow-y-auto bg-[#03070c]/95 p-4 backdrop-blur-xl">
    <div className={`mx-auto my-4 w-[min(940px,calc(100vw-2rem))] border bg-[#07111b] p-5 shadow-[0_0_70px_rgba(34,211,238,.13)] md:p-7 ${results.success ? 'border-cyan-300/35' : preserved ? 'border-amber-300/35' : 'border-rose-300/40'}`}>
      <div className="text-center">
        <div className={`text-[10px] font-black uppercase tracking-[0.34em] ${results.success ? 'text-cyan-200' : preserved ? 'text-amber-200' : 'text-rose-200'}`}>{resultTitle}</div>
        <h2 className="mt-2 text-3xl font-black uppercase text-white">{operatorId} // {tr('imprint.generation')} {String(imprint.generation).padStart(2, '0')}</h2>
        <p className="mx-auto mt-2 max-w-2xl text-xs leading-relaxed text-white/55">{resultHelp}</p>
        <p className="mt-2 text-[10px] text-white/35">{tr('result.summary', { minutes: Math.ceil(results.durationMs / 60000), contracts: results.contractsCompleted, bosses: results.bossesDefeated })}</p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">{results.players.map(player => <ResultPlayerCard key={player.playerId} player={player} tr={tr} />)}</div>

      <div className="mx-auto mt-5 grid max-w-2xl grid-cols-2 gap-px border border-white/10 bg-white/10 text-center sm:grid-cols-4">
        <ImprintMetric label={tr('imprint.rating')} value={coopImprintRating(imprint.ranks)} />
        <ImprintMetric label={tr('imprint.available')} value={imprint.unspentPoints} tone="text-amber-200" />
        <ImprintMetric label={tr('imprint.coresExtracted')} value={results.success ? localResult?.dataCoresExtracted || 0 : 0} tone="text-cyan-200" />
        <ImprintMetric label={tr('imprint.highestDepth')} value={Math.max(imprint.highestDepth, results.bossesDefeated)} />
      </div>

      {!results.squadWiped ? <div className="mt-6 grid gap-3 md:grid-cols-5">
        {COOP_IMPRINT_STATS.map(stat => {
          const rank = imprint.ranks[stat.id];
          const cost = coopImprintRankCost(rank);
          const disabled = rank >= stat.maxRank || imprint.unspentPoints < cost;
          return <div key={stat.id} className="flex min-h-[190px] flex-col border border-white/10 bg-white/[.035] p-3">
            <div className="flex items-start justify-between gap-2"><h3 className="font-black uppercase text-white">{tr(coopImprintStatNameKey(stat.id))}</h3><span className="font-mono text-xs text-cyan-200">{rank}/{stat.maxRank}</span></div>
            <div className="mt-2 h-1.5 overflow-hidden bg-black/50"><i className="block h-full bg-cyan-300" style={{ width: `${rank / stat.maxRank * 100}%` }} /></div>
            <p className="mt-3 flex-1 text-[10px] leading-relaxed text-white/45">{tr(coopImprintStatDescriptionKey(stat.id))}</p>
            <div className="mb-2 text-[10px] font-mono text-cyan-100">{tr(coopImprintStatEffectKey(stat.id))} · {tr('unit.perRank')}</div>
            <button disabled={disabled} onClick={() => onUpgrade(stat.id)} className="border border-cyan-300/40 bg-cyan-400/10 px-2 py-2 text-[9px] font-black uppercase tracking-wider text-cyan-100 enabled:hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/25">
              {rank >= stat.maxRank ? tr('imprint.max') : `${tr('imprint.installRank')} · ${tr('imprint.cost')} ${cost}`}
            </button>
          </div>;
        })}
      </div> : <div className="mx-auto mt-6 max-w-xl border border-rose-300/25 bg-rose-400/[.06] p-5 text-center">
        <div className="text-xs font-black uppercase tracking-[.22em] text-rose-200">{tr('imprint.memorial', { generation: Math.max(1, imprint.generation - 1) })}</div>
        <div className="mt-2 text-[11px] text-white/45">{tr('imprint.memorialHelp')}</div>
      </div>}

      <div className="mt-5 text-center text-[9px] font-black uppercase tracking-[.2em] text-rose-200/75">{tr('imprint.atRisk')}</div>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {isHost && <button ref={initialFocusRef} autoFocus onClick={onRetry} className="border border-emerald-300/55 bg-emerald-400/10 px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-emerald-100 hover:bg-emerald-400/20">{tr('imprint.deployNext')}</button>}
        <button ref={isHost ? undefined : initialFocusRef} onClick={onExit} className="border border-cyan-300/45 bg-cyan-400/10 px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-cyan-100 hover:bg-cyan-400/20">{tr('imprint.returnLobby')}</button>
      </div>
    </div>
  </div>;
}

function ImprintMetric({ label, value, tone = 'text-white' }: { label: string; value: number; tone?: string }) {
  return <div className="bg-[#07111b] px-3 py-3"><div className="text-[8px] font-black uppercase tracking-wider text-white/35">{label}</div><div className={`mt-1 font-mono text-xl ${tone}`}>{value}</div></div>;
}

function ResultPlayerCard({ player, tr }: {
  key?: string;
  player: NonNullable<CoopSnapshot['results']>['players'][number];
  tr: (key: CoopTextKey, params?: Record<string, string | number>) => string;
}) {
  return <div className="border border-white/10 bg-white/[.035] p-3">
    <div className="flex items-center justify-between gap-3"><span className="truncate font-black text-white" style={{ color: player.color }}>{player.label}</span><span className="text-right text-[9px] font-black uppercase tracking-wider text-amber-200">{tr(player.medalKey)}</span></div>
    <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[10px]"><span><b className="block text-white">{player.kills}</b><i className="not-italic text-white/45">{tr('result.kills')}</i></span><span><b className="block text-white">{Math.round(player.firearmDamage + player.passiveDamage + player.engineeringDamage)}</b><i className="not-italic text-white/45">{tr('result.damage')}</i></span><span><b className="block text-white">{Math.round(player.engineeringDamage + player.structureDamageAbsorbed)}</b><i className="not-italic text-white/45">{tr('result.engineering')}</i></span><span><b className="block text-white">{player.revives}</b><i className="not-italic text-white/45">{tr('result.revives')}</i></span></div>
  </div>;
}

/** Co-op-only peripheral enemy awareness. Camera projection decides whether a
 * body is actually off-screen; direction buckets then keep swarms compact. */
function CoopOffscreenThreats({
  snapshot,
  localPlayer,
  renderer,
}: {
  snapshot: CoopSnapshot;
  localPlayer: CoopSnapshot['players'][number];
  renderer: MultiplayerRendererBridge | null;
}) {
  const [cameraState, setCameraState] = useState(() => ({
    angle: renderer?.getAimAngle() ?? localPlayer.angle,
    ...(renderer?.getViewportSize() ?? { width: window.innerWidth, height: window.innerHeight }),
  }));

  useEffect(() => {
    let frameId = 0;
    let lastUpdate = 0;
    const update = (now: number) => {
      if (now - lastUpdate >= 50) {
        lastUpdate = now;
        const size = renderer?.getViewportSize() ?? { width: window.innerWidth, height: window.innerHeight };
        setCameraState({ angle: renderer?.getAimAngle() ?? localPlayer.angle, ...size });
      }
      frameId = requestAnimationFrame(update);
    };
    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [renderer, localPlayer.angle]);

  const activeEnemies = snapshot.enemies.filter(enemy => !enemy.dying);
  const offscreenEnemyIds = renderer?.getOffscreenEnemyIds(activeEnemies);
  const threats: HudThreat[] = activeEnemies
    .map(enemy => {
      const dx = enemy.x - localPlayer.x;
      const dy = enemy.y - localPlayer.y;
      return {
        id: enemy.id,
        dx,
        dy,
        dist: Math.hypot(dx, dy),
        type: enemy.type,
        color: enemy.color,
        offscreen: offscreenEnemyIds?.has(enemy.id),
      };
    });

  return <OffscreenThreatIndicators
    threats={threats}
    facingAngle={cameraState.angle}
    width={cameraState.width}
    height={cameraState.height}
  />;
}

/** Radial tactical compass around the center aim crosshair displaying real-time
 * bearing, distance, and status of squadmates (including emergency revive indicators for downed allies)
 * as well as active tactical and danger pings. */
function CoopReticleCompass({
  localPlayer,
  players,
  enemies,
  mission,
  pings,
  renderer,
  language,
}: {
  localPlayer: CoopSnapshot['players'][number];
  players: CoopSnapshot['players'];
  enemies: CoopSnapshot['enemies'];
  mission?: CoopActiveFieldMissionSnapshot;
  pings?: CoopPing[];
  renderer: MultiplayerRendererBridge | null;
  language: CoopLanguage;
}) {
  const tr = (key: CoopTextKey, params?: Record<string, string | number>) => coopText(language, key, params);
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
  const missionTarget = resolveCoopMissionNavigationTarget(mission, enemies);

  if (!teammates.length && !activePings.length && !missionTarget) return null;

  const orbitRadius = 54;
  const badgeRadius = orbitRadius + 18;

  return (
    <div className="coop-reticle-compass">
      <div className="coop-reticle-ring" />
      {mission && missionTarget && (() => {
        const dx = missionTarget.x - localPlayer.x;
        const dy = missionTarget.y - localPlayer.y;
        const distanceM = Math.max(1, Math.round(Math.hypot(dx, dy) / 12));
        let relativeAngle = Math.atan2(dy, dx) - liveAimAngle;
        while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;
        while (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;
        const screenAngle = relativeAngle - Math.PI / 2;
        const arrowRadius = 69;
        const labelRadius = 98;
        const arrowX = Math.cos(screenAngle) * arrowRadius;
        const arrowY = Math.sin(screenAngle) * arrowRadius;
        const labelX = Math.cos(screenAngle) * labelRadius;
        const labelY = Math.sin(screenAngle) * labelRadius;
        const color = mission.kind === 'toxic_hunt' ? '#4ade80'
          : mission.kind === 'demolition' ? '#fb7185'
            : mission.kind === 'hostage_recovery' ? '#fbbf24'
              : mission.kind === 'courier_intercept' ? '#c084fc' : '#22d3ee';
        return <div className="coop-reticle-objective" style={{ color }}>
          <div className="coop-reticle-objective-chevron" style={{ transform: `translate(${arrowX}px, ${arrowY}px) rotate(${relativeAngle * 180 / Math.PI}deg)` }}><i /></div>
          <div className="coop-reticle-objective-badge" style={{ transform: `translate(calc(-50% + ${labelX}px), calc(-50% + ${labelY}px))` }}>
            <small>MISSION OBJECTIVE</small>
            <b>{COOP_FIELD_MISSION_LABELS[mission.kind]}</b>
            <span>{coopFieldMissionStageLabel(mission)} · {tr('unit.meters', { value: distanceM })}</span>
          </div>
        </div>;
      })()}
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
                  <span className="text-[8px] font-black text-amber-300">{tr('hud.reviveBadge')}</span>
                  <span className="font-bold text-amber-100">{teammate.label.slice(0, 4)}</span>
                  <span className="font-mono text-[7px] text-amber-200/90">{tr('unit.meters', { value: distM })}</span>
                </>
              ) : (
                <>
                  <span>{teammate.label.slice(0, 4)}</span>
                  <span className="font-mono text-[7px] text-white/75">{tr('unit.meters', { value: distM })}</span>
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
          ? `⚠️ ${tr('ping.danger')}`
          : ping.kind === 'station'
          ? `🛒 ${tr('ping.buy')}`
          : ping.kind === 'revive'
          ? tr('hud.reviveBadge')
          : ping.kind === 'objective'
          ? `📍 ${tr(ping.labelKey, ping.labelParams)}`
          : `📍 ${tr('ping.marker')}`;

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
              <span className="font-mono text-[7px] text-white/80">{tr('unit.meters', { value: pdistM })}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Snapshot-only tactical radar. It mirrors the single-player HUD's
 * camera-relative radar while adding squad and shared-run markers. */
function CoopMinimap({ snapshot, localPlayer, language }: { snapshot: CoopSnapshot; localPlayer: CoopSnapshot['players'][number]; language: CoopLanguage }) {
  const tr = (key: CoopTextKey, params?: Record<string, string | number>) => coopText(language, key, params);
  const range = 2_400;
  const radarCenter = 50;
  const radarRadius = 42;
  const point = (x: number, y: number) => {
    const dx = x - localPlayer.x, dy = y - localPlayer.y;
    const angle = Math.atan2(dy, dx) - localPlayer.angle;
    const radius = Math.min(1, Math.hypot(dx, dy) / range) * radarRadius;
    return { left: `${radarCenter + Math.sin(angle) * radius}%`, top: `${radarCenter - Math.cos(angle) * radius}%` };
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
            title={tr('minimap.gas', { state: tr(coopGasStateKey(snapshot.gasZone.state)) })}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-400/80 bg-emerald-500/15 shadow-[0_0_12px_rgba(74,222,128,0.35)] pointer-events-none"
            style={{
              left: gasCenter.left,
              top: gasCenter.top,
              width: `${gasScreenRadius * 2}%`,
              height: `${gasScreenRadius * 2}%`,
            }}
          >
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[8px] font-black text-emerald-300 opacity-80">
              ☣
            </span>
          </div>
        );
      })()}
      {snapshot.players.filter(player => player.id !== localPlayer.id && player.lifeState !== 'eliminated').map(player => { const position = point(player.x, player.y); return <span key={player.id} className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-white shadow-[0_0_7px_currentColor]" style={{ ...position, backgroundColor: player.color, color: player.color }} />; })}
      {snapshot.buyStations.filter(station => station.state === 'active').map(station => { const position = point(station.x, station.y); return <span key={station.id} title={tr('minimap.station')} className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-cyan-50 bg-cyan-300 shadow-[0_0_12px_#22d3ee]" style={position} />; })}
      {snapshot.buyStations.filter(station => station.state === 'available' || station.state === 'capturing').map(station => { const position = point(station.x, station.y); return <span key={`capture-${station.id}`} title={tr('minimap.captureStation')} className={`absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${station.contested ? 'border-rose-100 bg-rose-500 shadow-[0_0_12px_#fb7185]' : 'border-teal-100 bg-teal-400/50 shadow-[0_0_10px_#2dd4bf]'}`} style={position} />; })}
      {snapshot.fieldMissions?.sites.filter(site => site.state === 'available').map(site => <span key={`mission-${site.id}`} title={COOP_FIELD_MISSION_LABELS[site.kind]} className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-violet-400 shadow-[0_0_12px_#c084fc]" style={point(site.x, site.y)} />)}
      {snapshot.fieldMissions?.active && <span title={COOP_FIELD_MISSION_LABELS[snapshot.fieldMissions.active.kind]} className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-white bg-emerald-300 shadow-[0_0_14px_#6ee7b7]" style={point(snapshot.fieldMissions.active.x, snapshot.fieldMissions.active.y)} />}
      {snapshot.weaponFoundry && snapshot.weaponFoundry.state !== 'locked' && <span title={tr('minimap.foundry')} className={`absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 ${snapshot.weaponFoundry.state === 'active' ? 'rotate-45 bg-amber-300' : 'rounded-full bg-amber-500/50'} border-2 border-amber-100 shadow-[0_0_14px_#f59e0b]`} style={point(snapshot.weaponFoundry.x, snapshot.weaponFoundry.y)} />}
      {snapshot.structures?.filter(structure => structure.state !== 'destroying').map(structure => { const color = COOP_STRUCTURE_DEFINITIONS[structure.type].color; return <span key={`structure-${structure.id}`} title={tr(`build.${structure.type}.name` as CoopTextKey)} className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 border ${structure.type === 'barricade' ? 'rotate-45' : 'rounded-full'}`} style={{ ...point(structure.x, structure.y), borderColor: '#ecfeff', backgroundColor: color, boxShadow: `0 0 10px ${color}` }} />; })}
      {objective && <span title={tr(objective.titleKey)} className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-100 bg-emerald-300 shadow-[0_0_12px_#6ee7b7]" style={point(objective.x, objective.y)} />}
      {boss && <span title={tr(boss.nameKey)} className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-rose-100 bg-rose-500 shadow-[0_0_14px_#fb7185] animate-pulse" style={point(boss.x, boss.y)} />}
      {exfil && <span title={tr('minimap.extraction')} className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-amber-100 bg-amber-300 shadow-[0_0_13px_#fbbf24]" style={point(exfil.x, exfil.y)} />}
      {snapshot.privateExfil && <span title="Private Exfil" className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-amber-50 bg-orange-500 shadow-[0_0_14px_#f59e0b]" style={point(snapshot.privateExfil.x, snapshot.privateExfil.y)} />}
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
  return { type: 'input', version: MULTIPLAYER_PROTOCOL_VERSION, sequence: 0, clientTime: Date.now(), movement: 0, aimAngle: 0, aimPitch: quantizePitch(0), selectedSlot: 0, firing: false, fireActionId: 0, altFireActionId: 0, interactActionId: 0, reloadPressed: false, aiming: false, sprinting: false, sliding: false, reviving: false, jumpPressed: false, jetHeld: false, dashPressed: false };
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
    ? { id: player.id, label: player.label.slice(0, 24), color: player.color, skinId: normalizeCoopSkinId(player.skinId), operatorId: normalizeCoopOperatorId(player.operatorId, player.skinId), imprint: normalizeCoopImprintLoadout(player.imprint) }
    : null;
}

function parseInventoryDrop(value: unknown): { kind: CoopInventoryDropKind } | null {
  if (!value || typeof value !== 'object') return null;
  const kind = (value as { kind?: unknown }).kind;
  return kind === 'cash' || kind === 'self_revive' ? { kind } : null;
}

function parseStationPurchase(value: unknown): { stationId: number; itemId: CoopShopItemId } | null {
  if (!value || typeof value !== 'object') return null;
  const request = value as Partial<{ stationId: unknown; itemId: unknown }>;
  if (typeof request.stationId !== 'number' || !Number.isInteger(request.stationId) || typeof request.itemId !== 'string' || !(request.itemId in COOP_SHOP_ITEMS)) return null;
  return { stationId: request.stationId, itemId: request.itemId as CoopShopItemId };
}

function parseOperatorRedeploy(value: unknown): { stationId: number; targetPlayerId: string } | null {
  if (!value || typeof value !== 'object') return null;
  const request = value as { stationId?: unknown; targetPlayerId?: unknown };
  return typeof request.stationId === 'number' && Number.isInteger(request.stationId)
    && typeof request.targetPlayerId === 'string' && request.targetPlayerId.length > 0
    ? { stationId: request.stationId, targetPlayerId: request.targetPlayerId.slice(0, 128) }
    : null;
}

const PURCHASE_RESULT_CODES = new Set<CoopPurchaseResult['code']>([
  'purchased', 'alive_required', 'station_range', 'not_stocked', 'passive_max', 'passive_slots', 'credits',
  'selected_ammo_full', 'loadout_ammo_full', 'health_full', 'reboot_owned', 'armor_1_owned',
  'armor_1_required', 'armor_2_owned', 'mask_full',
]);

function parseStationPurchaseResult(value: unknown): CoopPurchaseResult | null {
  if (!value || typeof value !== 'object') return null;
  const result = value as Partial<Record<keyof CoopPurchaseResult, unknown>>;
  if (typeof result.playerId !== 'string' || typeof result.itemId !== 'string' || !(result.itemId in COOP_SHOP_ITEMS)
    || typeof result.code !== 'string' || !PURCHASE_RESULT_CODES.has(result.code as CoopPurchaseResult['code'])
    || (result.amount !== undefined && typeof result.amount !== 'number')) return null;
  return { playerId: result.playerId, itemId: result.itemId as CoopShopItemId, code: result.code as CoopPurchaseResult['code'], amount: result.amount as number | undefined };
}

const REDEPLOY_RESULT_CODES = new Set<CoopRedeployResult['code']>(['redeployed', 'alive_required', 'station_range', 'redeploy_self', 'target_not_eliminated', 'credits']);

function parseOperatorRedeployResult(value: unknown): CoopRedeployResult | null {
  if (!value || typeof value !== 'object') return null;
  const result = value as Partial<Record<keyof CoopRedeployResult, unknown>>;
  if (typeof result.buyerId !== 'string' || typeof result.targetPlayerId !== 'string'
    || typeof result.code !== 'string' || !REDEPLOY_RESULT_CODES.has(result.code as CoopRedeployResult['code'])
    || (result.amount !== undefined && typeof result.amount !== 'number')) return null;
  return { buyerId: result.buyerId, targetPlayerId: result.targetPlayerId, code: result.code as CoopRedeployResult['code'], amount: result.amount as number | undefined };
}

function parseFoundryUpgrade(value: unknown): { foundryId: number; weaponId: CoopFirearmId } | null {
  if (!value || typeof value !== 'object') return null;
  const request = value as { foundryId?: unknown; weaponId?: unknown };
  if (typeof request.foundryId !== 'number' || !Number.isInteger(request.foundryId)
    || typeof request.weaponId !== 'string' || !COOP_FIREARM_IDS.includes(request.weaponId as CoopFirearmId)) return null;
  return { foundryId: request.foundryId, weaponId: request.weaponId as CoopFirearmId };
}

const FOUNDRY_RESULT_CODES = new Set<CoopFoundryUpgradeResult['code']>(['forged', 'foundry_inactive', 'foundry_range', 'alive_required', 'invalid_weapon', 'weapon_max', 'credits']);
function parseFoundryUpgradeResult(value: unknown): CoopFoundryUpgradeResult | null {
  if (!value || typeof value !== 'object') return null;
  const result = value as Partial<Record<keyof CoopFoundryUpgradeResult, unknown>>;
  if (typeof result.playerId !== 'string' || typeof result.weaponId !== 'string' || !COOP_FIREARM_IDS.includes(result.weaponId as CoopFirearmId)
    || typeof result.code !== 'string' || !FOUNDRY_RESULT_CODES.has(result.code as CoopFoundryUpgradeResult['code'])
    || (result.amount !== undefined && typeof result.amount !== 'number')) return null;
  return { playerId: result.playerId, weaponId: result.weaponId as CoopFirearmId, code: result.code as CoopFoundryUpgradeResult['code'], amount: result.amount as number | undefined };
}

function parseBuildStructure(value: unknown): { requestId: number; structureType: CoopStructureType; x: number; y: number; angle: number } | null {
  if (!value || typeof value !== 'object') return null;
  const request = value as Record<string, unknown>;
  if (typeof request.requestId !== 'number' || !Number.isInteger(request.requestId)
    || !isCoopStructureType(request.structureType)
    || typeof request.x !== 'number' || typeof request.y !== 'number' || typeof request.angle !== 'number'
    || !Number.isFinite(request.x) || !Number.isFinite(request.y) || !Number.isFinite(request.angle)) return null;
  return { requestId: request.requestId, structureType: request.structureType, x: request.x, y: request.y, angle: request.angle };
}

function parseDismantleStructure(value: unknown): { requestId: number; structureId: number } | null {
  if (!value || typeof value !== 'object') return null;
  const request = value as Record<string, unknown>;
  return typeof request.requestId === 'number' && Number.isInteger(request.requestId)
    && typeof request.structureId === 'number' && Number.isInteger(request.structureId)
    ? { requestId: request.requestId, structureId: request.structureId }
    : null;
}

function parseStructureAction(value: unknown): { requestId: number; structureId: number; action: CoopStructureAction; x?: number; y?: number; angle?: number } | null {
  if (!value || typeof value !== 'object') return null;
  const request = value as Record<string, unknown>;
  return typeof request.requestId === 'number' && Number.isInteger(request.requestId)
    && typeof request.structureId === 'number' && Number.isInteger(request.structureId)
    && isCoopStructureAction(request.action)
    && (request.x === undefined || typeof request.x === 'number' && Number.isFinite(request.x))
    && (request.y === undefined || typeof request.y === 'number' && Number.isFinite(request.y))
    && (request.angle === undefined || typeof request.angle === 'number' && Number.isFinite(request.angle))
    ? { requestId: request.requestId, structureId: request.structureId, action: request.action, x: request.x as number | undefined, y: request.y as number | undefined, angle: request.angle as number | undefined }
    : null;
}

const BUILD_RESULT_CODES = new Set<CoopBuildResult['code']>(['built', 'alive_required', 'invalid_blueprint', 'charges', 'player_limit', 'squad_limit', 'range', 'build_zone', 'obstructed', 'bridge_locked', 'bridge_range', 'bridge_complete', 'stale_request']);
function parseBuildResult(value: unknown): CoopBuildResult | null {
  if (!value || typeof value !== 'object') return null;
  const result = value as Record<string, unknown>;
  if (typeof result.playerId !== 'string' || typeof result.requestId !== 'number' || !Number.isInteger(result.requestId)
    || !isCoopStructureType(result.structureType) || typeof result.code !== 'string' || !BUILD_RESULT_CODES.has(result.code as CoopBuildResult['code'])
    || (result.amount !== undefined && typeof result.amount !== 'number')) return null;
  return { playerId: result.playerId, requestId: result.requestId, structureType: result.structureType, code: result.code as CoopBuildResult['code'], amount: result.amount as number | undefined };
}

const DISMANTLE_RESULT_CODES = new Set<CoopDismantleResult['code']>(['dismantled', 'alive_required', 'unknown_structure', 'not_owner', 'dismantle_range', 'stale_request']);
function parseDismantleResult(value: unknown): CoopDismantleResult | null {
  if (!value || typeof value !== 'object') return null;
  const result = value as Record<string, unknown>;
  if (typeof result.playerId !== 'string' || typeof result.requestId !== 'number' || !Number.isInteger(result.requestId)
    || typeof result.structureId !== 'number' || !Number.isInteger(result.structureId)
    || typeof result.code !== 'string' || !DISMANTLE_RESULT_CODES.has(result.code as CoopDismantleResult['code'])
    || typeof result.refundedCharges !== 'number') return null;
  return { playerId: result.playerId, requestId: result.requestId, structureId: result.structureId, code: result.code as CoopDismantleResult['code'], refundedCharges: result.refundedCharges };
}

const STRUCTURE_ACTION_RESULT_CODES = new Set<CoopStructureActionResult['code']>(['activated', 'rotated', 'relocated', 'alive_required', 'unknown_structure', 'action_range', 'charges', 'cooldown', 'already_upgraded', 'not_owner', 'obstructed', 'stale_request']);
function parseStructureActionResult(value: unknown): CoopStructureActionResult | null {
  if (!value || typeof value !== 'object') return null;
  const result = value as Record<string, unknown>;
  if (typeof result.playerId !== 'string' || typeof result.requestId !== 'number' || !Number.isInteger(result.requestId)
    || typeof result.structureId !== 'number' || !Number.isInteger(result.structureId) || !isCoopStructureAction(result.action)
    || typeof result.code !== 'string' || !STRUCTURE_ACTION_RESULT_CODES.has(result.code as CoopStructureActionResult['code'])
    || (result.amount !== undefined && typeof result.amount !== 'number')) return null;
  return { playerId: result.playerId, requestId: result.requestId, structureId: result.structureId, action: result.action, code: result.code as CoopStructureActionResult['code'], amount: result.amount as number | undefined };
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
  for (const effect of snapshot.artifactEffects || []) {
    const point = project(effect.x, effect.y);
    const color = effect.kind === 'stormcall' ? '#60a5fa' : effect.kind === 'dawnwall' ? '#fbbf24' : effect.kind === 'emberling' ? '#fde68a' : '#fb923c';
    const radius = Math.max(5, effect.radius * scale), pulse = .9 + Math.sin(snapshot.elapsedMs * .012) * .1;
    ctx.save(); ctx.translate(point.x, point.y); ctx.strokeStyle = color; ctx.fillStyle = `${color}18`; ctx.shadowColor = color; ctx.shadowBlur = 18; ctx.lineWidth = effect.kind === 'dawnwall' ? 4 : 2;
    ctx.beginPath(); ctx.arc(0, 0, radius * pulse, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const sides = effect.kind === 'dawnwall' ? 12 : effect.kind === 'stormcall' ? 8 : 6;
    ctx.beginPath();
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * Math.PI * 2 + snapshot.elapsedMs * .001;
      const x = Math.cos(angle) * radius * .62, y = Math.sin(angle) * radius * .62;
      if (side === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.stroke(); ctx.restore();
  }
  for (const event of snapshot.combatEvents) {
    if (event.kind !== 'artifact_cast' || event.targetX === undefined || event.targetY === undefined) continue;
    const from = project(event.x, event.y), to = project(event.targetX, event.targetY);
    const age = Math.max(0, snapshot.elapsedMs - event.atMs), alpha = Math.max(0, 1 - age / 750);
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = event.color || '#ffffff'; ctx.shadowColor = event.color || '#ffffff'; ctx.shadowBlur = 24; ctx.lineWidth = event.weaponId === 'shatter_lance' ? 6 : event.weaponId === 'reckoning' ? 4 : 3;
    if (event.weaponId === 'echo_collapse') ctx.setLineDash([10, 7]);
    const traces = event.weaponId === 'reckoning' ? 5 : event.weaponId === 'shatter_lance' ? 3 : 1;
    for (let trace = 0; trace < traces; trace++) { const offset = (trace - (traces - 1) / 2) * 3; ctx.beginPath(); ctx.moveTo(from.x, from.y + offset); ctx.lineTo(to.x, to.y + offset * .25); ctx.stroke(); }
    ctx.fillStyle = event.weaponId === 'shatter_lance' ? '#effcff' : event.color || '#ffffff'; ctx.beginPath(); ctx.arc(to.x, to.y, 5 + traces * 1.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
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
    case 'arc_launcher': {
      // Compact blue-white energy bolt; chain endpoints are separate replicated events.
      const r = Math.max(3, projectile.radius * scale);
      // Very long ghost trail
      const ghostTrail = ctx.createLinearGradient(-r * 18, 0, 0, 0);
      ghostTrail.addColorStop(0, 'rgba(96,165,250,0)');
      ghostTrail.addColorStop(0.6, 'rgba(96,165,250,0.14)');
      ghostTrail.addColorStop(1, 'rgba(219,234,254,0.68)');
      ctx.fillStyle = ghostTrail;
      ctx.beginPath();
      ctx.moveTo(-r * 18, -r * 0.22);
      ctx.lineTo(r * 3.5, -r * 0.45);
      ctx.lineTo(r * 3.5, r * 0.45);
      ctx.lineTo(-r * 18, r * 0.22);
      ctx.fill();
      // Mid glow
      const midGlow = ctx.createLinearGradient(-r * 7, 0, r * 3.5, 0);
      midGlow.addColorStop(0, 'rgba(96,165,250,0)');
      midGlow.addColorStop(0.3, 'rgba(96,165,250,0.38)');
      midGlow.addColorStop(1, 'rgba(219,234,254,0.88)');
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
    case 'goreline_repeater': {
      const r = Math.max(4, projectile.radius * scale);
      ctx.shadowColor = '#fb7185'; ctx.shadowBlur = 20;
      const trail = ctx.createLinearGradient(-r * 8, 0, r * 2, 0);
      trail.addColorStop(0, 'rgba(127,29,29,0)'); trail.addColorStop(.65, 'rgba(251,113,133,.5)'); trail.addColorStop(1, '#fff1f2');
      ctx.fillStyle = trail; ctx.beginPath();
      ctx.moveTo(-r * 8, 0); ctx.lineTo(-r, -r * .58); ctx.lineTo(r * 2.6, 0); ctx.lineTo(-r, r * .58); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ffe4e6'; ctx.lineWidth = Math.max(1, r * .24); ctx.beginPath(); ctx.moveTo(-r * 2, 0); ctx.lineTo(r * 2.5, 0); ctx.stroke();
      break;
    }
    case 'riftspike_array': {
      const r = Math.max(3.5, projectile.radius * scale);
      ctx.shadowColor = '#c084fc'; ctx.shadowBlur = 22;
      for (let spike = -1; spike <= 1; spike++) {
        ctx.strokeStyle = spike === 0 ? '#ffffff' : '#c084fc';
        ctx.lineWidth = spike === 0 ? r * .42 : r * .28;
        ctx.beginPath(); ctx.moveTo(-r * 6, spike * r * .58); ctx.lineTo(r * 3, spike * r * .22); ctx.stroke();
      }
      ctx.strokeStyle = '#e9d5ff'; ctx.lineWidth = Math.max(1, r * .18); ctx.beginPath(); ctx.arc(-r, 0, r * 1.25, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'dawnwall_cannon': {
      const r = Math.max(4.5, projectile.radius * scale);
      ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 24;
      const solar = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.2);
      solar.addColorStop(0, '#ffffff'); solar.addColorStop(.28, '#fde68a'); solar.addColorStop(.7, 'rgba(251,191,36,.45)'); solar.addColorStop(1, 'rgba(251,191,36,0)');
      ctx.fillStyle = solar; ctx.beginPath(); ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff7d6'; ctx.lineWidth = Math.max(1.5, r * .26);
      ctx.beginPath(); ctx.moveTo(-r * 3.4, 0); ctx.lineTo(r * 2.8, 0); ctx.moveTo(0, -r * 1.4); ctx.lineTo(0, r * 1.4); ctx.stroke();
      break;
    }
    case 'winterglass_projector': {
      const r = Math.max(4, projectile.radius * scale);
      ctx.shadowColor = '#7dd3fc'; ctx.shadowBlur = 20;
      ctx.fillStyle = '#e8fbff'; ctx.beginPath();
      ctx.moveTo(r * 2.6, 0); ctx.lineTo(0, -r); ctx.lineTo(-r * 2.8, 0); ctx.lineTo(0, r); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = Math.max(1, r * .18); ctx.stroke();
      for (const offset of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-r * 2.5, offset * r * .65); ctx.lineTo(-r * 4.5, offset * r * 1.15); ctx.stroke(); }
      break;
    }
    case 'cinderhex_engine': {
      const r = Math.max(4.5, projectile.radius * scale);
      ctx.shadowColor = '#fb923c'; ctx.shadowBlur = 24;
      ctx.fillStyle = '#7c2d12'; ctx.strokeStyle = '#ffedd5'; ctx.lineWidth = Math.max(1.2, r * .22);
      ctx.beginPath();
      for (let vertex = 0; vertex < 6; vertex++) {
        const angle = vertex / 6 * Math.PI * 2;
        const x = Math.cos(angle) * r * 1.35, y = Math.sin(angle) * r * 1.35;
        if (vertex === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#fb923c'; ctx.beginPath(); ctx.arc(-r * 1.5, 0, r * 2.1, 0, Math.PI * 2); ctx.stroke();
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

function formatHealingAmount(amount: number) {
  return (Math.round(amount * 100) / 100).toFixed(2).replace(/\.0+$|(?<=\.[0-9])0$/, '');
}

function getScale(width: number, height: number) {
  return Math.max(0.3, Math.min(0.52, Math.min(width, height) / 1500));
}

function incomingDirection(player: CoopSnapshot['players'][number] | undefined, event: CoopSnapshot['combatEvents'][number]): CoopTextKey {
  if (!player) return 'direction.incoming';
  const sourceAngle = Math.atan2(event.y - player.y, event.x - player.x);
  const relative = Math.atan2(Math.sin(sourceAngle - player.angle), Math.cos(sourceAngle - player.angle));
  if (Math.abs(relative) < Math.PI / 4) return 'direction.front';
  if (Math.abs(relative) > Math.PI * .75) return 'direction.rear';
  return relative > 0 ? 'direction.right' : 'direction.left';
}
