import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Compass,
  Copy,
  Crown,
  Edit3,
  Globe,
  Layers,
  Link2,
  Radio,
  RefreshCw,
  Server,
  Shield,
  Users,
  Wifi,
  X,
} from 'lucide-react';
import { soundManager } from '../game/SoundManager';
import { ManualWebRTCSession } from '../game/multiplayer/ManualWebRTCSession';
import {
  HostedLobby,
  LobbyJoin,
  PublicLobby,
  fetchIceServers,
  globalLobbyDiscovery,
  listPublicLobbies,
} from '../game/multiplayer/LobbySignaling';
import { COOP_GUEST_COLORS, COOP_MAX_PLAYERS, MultiplayerPeerInfo, MULTIPLAYER_PROTOCOL_VERSION } from '../game/multiplayer/protocol';
import { CoopPlayerSeed } from '../game/multiplayer/CoopSimulation';
import { generateRoomCode, normalizeRoomCode } from '../game/multiplayer/UnifiedSignaling';
import { coopOperatorClassKey, coopOperatorRoleKey, coopText, coopWeaponNameKey, localizeCoopSignalingMessage, readCoopLanguage, writeCoopLanguage, type CoopLanguage, type CoopTextKey } from '../game/multiplayer/i18n';
import { getCoopOperatorImprint, normalizeCoopImprintLoadout, purchaseCoopImprintRank, readCoopImprintProfile, selectedCoopOperatorId, writeCoopImprintProfile, type CoopImprintStatId } from '../game/multiplayer/CoopImprint';
import { CoopImprintSummary } from './CoopImprintSummary';
import { COOP_SKINS, normalizeCoopSkinId, readCoopSkinId, writeCoopSkinId, type CoopSkinId } from '../game/multiplayer/CoopSkins';
import { CoopSkinBadge, CoopSkinSelector } from './CoopSkinSelector';
import { COOP_OPERATOR_BY_ID, normalizeCoopOperatorId } from '../game/multiplayer/CoopOperators';
import { COOP_FIREARM_BY_ID } from '../game/combat/coopFirearms';
import { normalizeWorldId, readCoopWorldProgress, type WorldId } from '../game/world/WorldDefinitions';
import { CoopWorldSelector } from './CoopWorldSelector';

type SetupMode = 'choose' | 'host' | 'guest' | 'direct_host' | 'direct_guest';

export interface MultiplayerLaunch {
  role: 'host' | 'guest' | 'spectator';
  session: ManualWebRTCSession;
  localPlayerId: string;
  players: CoopPlayerSeed[];
  peerPlayerIds: Record<string, string>;
  hostedLobby?: HostedLobby;
  lobbyJoin?: LobbyJoin;
  soloTest?: boolean;
  /** Local-only preference. It is never imposed on peers. */
  language: CoopLanguage;
  /** Host-selected deployment. Guests receive this in the reliable start event. */
  worldId: WorldId;
}

export function createSoloMultiplayerLaunch({
  player = createLocalPlayerSeed(),
  language = readCoopLanguage(),
  worldId = readCoopWorldProgress().unlockedWorldIds.at(-1) || 'neon_bastion',
}: {
  player?: CoopPlayerSeed;
  language?: CoopLanguage;
  worldId?: WorldId;
} = {}): MultiplayerLaunch {
  const soloPlayer = {
    ...player,
    // The setup screen normally validates a callsign first. The main-menu
    // shortcut must also work for a completely fresh browser profile.
    label: player.label || 'OPERATOR',
  };
  const session = new ManualWebRTCSession({ role: 'host', iceServers: [] });

  return {
    role: 'host',
    session,
    localPlayerId: soloPlayer.id,
    players: [soloPlayer],
    peerPlayerIds: {},
    soloTest: true,
    language,
    worldId,
  };
}

export function ManualMultiplayerSetup({
  initialRoomCode,
  onClose,
  onLaunch,
}: {
  initialRoomCode?: string;
  onClose: () => void;
  onLaunch: (launch: MultiplayerLaunch) => void;
}) {
  const sessionRef = useRef<ManualWebRTCSession | null>(null);
  const hostedLobbyRef = useRef<HostedLobby | null>(null);
  const joinRef = useRef<LobbyJoin | null>(null);
  const connectionTimeoutRef = useRef(0);
  const handedOffRef = useRef(false);
  const localPlayerRef = useRef<CoopPlayerSeed>(createLocalPlayerSeed());
  const readySentRef = useRef(false);
  const peerPlayerIdsRef = useRef<Record<string, string>>({});
  const guestPlayersRef = useRef<CoopPlayerSeed[]>([]);
  const spectatingRef = useRef(false);

  const [mode, setMode] = useState<SetupMode>('choose');
  const [lobbies, setLobbies] = useState<PublicLobby[]>([]);
  const [peers, setPeers] = useState<MultiplayerPeerInfo[]>([]);
  const [guestPlayers, setGuestPlayers] = useState<CoopPlayerSeed[]>([]);
  const [rosterPlayers, setRosterPlayers] = useState<CoopPlayerSeed[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [nickname, setNickname] = useState(localPlayerRef.current.label);
  const [codeInputValue, setCodeInputValue] = useState(initialRoomCode || '');
  const [currentRoomCode, setCurrentRoomCode] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showDirectFallback, setShowDirectFallback] = useState(false);
  const [language, setLanguage] = useState<CoopLanguage>(readCoopLanguage);
  const [operatorId] = useState(selectedCoopOperatorId);
  const [selectedSkinId, setSelectedSkinId] = useState(() => normalizeCoopSkinId(localPlayerRef.current.skinId));
  const [activeTab, setActiveTab] = useState<'loadout' | 'matchmaking' | 'all'>('all');
  const [imprintProfile, setImprintProfile] = useState(readCoopImprintProfile);
  const [worldProgress] = useState(readCoopWorldProgress);
  const [selectedWorldId, setSelectedWorldId] = useState<WorldId>(() => readCoopWorldProgress().unlockedWorldIds.at(-1) || 'neon_bastion');
  const activeSkin = COOP_SKINS.find(s => s.id === selectedSkinId) || COOP_SKINS[0];
  const activeOperator = COOP_OPERATOR_BY_ID[activeSkin.id];
  const activeSignature = COOP_FIREARM_BY_ID[activeOperator.signatureWeaponId];
  const operatorImprint = getCoopOperatorImprint(imprintProfile, operatorId);
  const tr = (key: CoopTextKey, params?: Record<string, string | number>) => coopText(language, key, params);
  const selectLanguage = (next: CoopLanguage) => {
    setLanguage(next); writeCoopLanguage(next); setStatus(''); setError(null);
  };
  const selectSkin = (skinId: CoopSkinId) => {
    const normalized = writeCoopSkinId(skinId);
    localPlayerRef.current = { ...localPlayerRef.current, skinId: normalized, operatorId: normalizeCoopOperatorId(normalized) };
    setSelectedSkinId(normalized);
    setRosterPlayers(current => current.map(player => player.id === localPlayerRef.current.id ? { ...player, skinId: normalized, operatorId: normalizeCoopOperatorId(normalized) } : player));
    const session = sessionRef.current;
    if (!session) return;
    if (mode === 'host' || mode === 'direct_host') {
      session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'roster', payload: [localPlayerRef.current, ...guestPlayersRef.current] });
    } else if ((mode === 'guest' || mode === 'direct_guest') && readySentRef.current) {
      session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'skin_update', payload: { skinId: normalized, operatorId: normalizeCoopOperatorId(normalized) } });
    }
  };
  const allocateImprintRank = (statId: CoopImprintStatId) => {
    if (mode !== 'choose' || loading) return;
    setImprintProfile(current => {
      const next = purchaseCoopImprintRank(current, operatorId, statId);
      if (next.revision === current.revision) return current;
      const imprint = getCoopOperatorImprint(next, operatorId);
      localPlayerRef.current = { ...localPlayerRef.current, imprint: normalizeCoopImprintLoadout(imprint, operatorId) };
      writeCoopImprintProfile(next);
      return next;
    });
  };

  // Direct manual fallback codes
  const [offerCode, setOfferCode] = useState('');
  const [answerCode, setAnswerCode] = useState('');

  const nicknameValid = normalizeNickname(nickname).length >= 2;

  const applyNickname = () => {
    const label = normalizeNickname(nickname);
    if (label.length < 2) {
      setError(tr('error.callsign'));
      return false;
    }
    localPlayerRef.current = { ...localPlayerRef.current, label };
    try { localStorage.setItem('killsync.multiplayer.nickname', label); } catch { /* Storage fallback */ }
    return true;
  };

  const dedupeLobbies = (list: PublicLobby[]) => {
    const seen = new Set<string>();
    const out: PublicLobby[] = [];
    for (const item of list) {
      const key = normalizeRoomCode(item.code || item.id);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    }
    return out;
  };

  const refreshLobbies = async () => {
    try {
      const list = await listPublicLobbies();
      setLobbies(dedupeLobbies(list));
    } catch {
      setLobbies([]);
    }
  };

  // Real-time discovery listener + periodic refresh
  useEffect(() => {
    void refreshLobbies();
    const unsubDiscovery = globalLobbyDiscovery.onLobbiesChange((discovered) => {
      setLobbies(dedupeLobbies(discovered));
    });

    const timer = window.setInterval(() => void refreshLobbies(), 2_500);
    return () => {
      unsubDiscovery();
      window.clearInterval(timer);
    };
  }, []);

  // Handle initial room code if provided via URL
  useEffect(() => {
    if (initialRoomCode && initialRoomCode.trim()) {
      setCodeInputValue(initialRoomCode.trim());
      // If nickname is already saved, auto-join
      if (localPlayerRef.current.label.length >= 2) {
        void joinByCode(initialRoomCode.trim());
      }
    }
  }, [initialRoomCode]);

  useEffect(() => () => {
    if (!handedOffRef.current) {
      sessionRef.current?.close();
      hostedLobbyRef.current?.close();
      joinRef.current?.close();
      window.clearTimeout(connectionTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if ((mode !== 'guest' && mode !== 'direct_guest') || connectedPeers(peers) === 0 || readySentRef.current) return;
    window.clearTimeout(connectionTimeoutRef.current);
    const delivered = sessionRef.current?.sendEvent({
      type: 'event',
      version: MULTIPLAYER_PROTOCOL_VERSION,
      event: spectatingRef.current ? 'spectate' : 'ready',
      payload: spectatingRef.current ? undefined : localPlayerRef.current,
    });
    if (!delivered) return;
    readySentRef.current = true;
    setStatus(tr(spectatingRef.current ? 'status.spectating' : 'status.waitingHost'));
  }, [mode, peers]);

  const createSession = async (role: 'host' | 'guest') => {
    window.clearTimeout(connectionTimeoutRef.current);
    sessionRef.current?.close();
    readySentRef.current = false;
    peerPlayerIdsRef.current = {};
    guestPlayersRef.current = [];
    const session = new ManualWebRTCSession({
      role,
      iceServers: await fetchIceServers(),
      onPeerChange: (nextPeers) => {
        setPeers(nextPeers);
        if (role === 'host') hostedLobbyRef.current?.update(1 + connectedPeers(nextPeers), 'waiting');
      },
      onError: () => setError(tr('error.signalInterrupted')),
      onEvent: (peerId, event) => {
        if (event.event === 'ready' && role === 'host') {
          const player = parsePlayer(event.payload);
          if (!player || peerPlayerIdsRef.current[peerId] || player.id === localPlayerRef.current.id || guestPlayersRef.current.some(guest => guest.id === player.id)) return;
          if (guestPlayersRef.current.length >= COOP_MAX_PLAYERS - 1) {
            session.disconnectPeer(peerId);
            return;
          }
          peerPlayerIdsRef.current[peerId] = player.id;
          const next = guestPlayersRef.current.some(item => item.id === player.id)
            ? guestPlayersRef.current
            : [...guestPlayersRef.current, { ...player, color: guestColor(guestPlayersRef.current.length) }];
          guestPlayersRef.current = next;
          setGuestPlayers(next);
          session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'roster', payload: [localPlayerRef.current, ...next] });
          hostedLobbyRef.current?.update(next.length + 1, 'waiting');
          setStatus(tr('status.joined', { name: player.label }));
        }
        if (event.event === 'roster' && role === 'guest') {
          const players = parsePlayers(event.payload, 1);
          if (players) setRosterPlayers(players);
        }
        if (event.event === 'skin_update' && role === 'host') {
          const playerId = peerPlayerIdsRef.current[peerId];
          if (!playerId || !event.payload || typeof event.payload !== 'object') return;
          const requested = (event.payload as { skinId?: unknown }).skinId;
          if (normalizeCoopSkinId(requested) !== requested) return;
          const next = guestPlayersRef.current.map(player => player.id === playerId ? { ...player, skinId: requested as CoopSkinId, operatorId: normalizeCoopOperatorId((event.payload as { operatorId?: unknown }).operatorId, requested) } : player);
          guestPlayersRef.current = next;
          setGuestPlayers(next);
          session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'roster', payload: [localPlayerRef.current, ...next] });
        }
        if (event.event === 'start' && role === 'guest') {
          const start = parseStartPayload(event.payload, spectatingRef.current ? 1 : 2);
          const players = start?.players;
          if (!players || (!spectatingRef.current && !players.some(player => player.id === localPlayerRef.current.id))) return;
          handedOffRef.current = true;
          onLaunch({ role: spectatingRef.current ? 'spectator' : 'guest', session, localPlayerId: localPlayerRef.current.id, players, peerPlayerIds: {}, lobbyJoin: joinRef.current || undefined, language, worldId: start.worldId });
        }
      },
    });
    sessionRef.current = session;
    setPeers([]);
    setGuestPlayers([]);
    setRosterPlayers([]);
    setError(null);
    return session;
  };

  const hostSquad = async () => {
    if (!applyNickname()) return;
    spectatingRef.current = false;
    setLoading(true);
    setError(null);
    setStatus(tr('status.initializing'));
    try {
      const code = generateRoomCode();
      const [session, lobby] = await Promise.all([
        createSession('host'),
        HostedLobby.create(localPlayerRef.current.label, code),
      ]);
      hostedLobbyRef.current?.close();
      hostedLobbyRef.current = lobby;
      setCurrentRoomCode(lobby.room.code || code);
      lobby.setStatusListener(message => setStatus(localizeCoopSignalingMessage(language, message, 'status')));
      lobby.start(session);
      lobby.update(1, 'waiting');
      setMode('host');
      setStatus(tr('status.frequencyActive'));
    } catch {
      setError(tr('error.initialize'));
    } finally {
      setLoading(false);
    }
  };

  const joinSquad = async (room: PublicLobby) => {
    if (!applyNickname()) return;
    spectatingRef.current = room.state === 'in_game';
    setLoading(true);
    setMode('guest');
    setCurrentRoomCode(room.code || room.id);
    setError(null);
    setStatus(tr(room.state === 'in_game' ? 'status.infiltrating' : 'status.connectingHost', { name: room.hostName }));
    try {
      const [session, join] = await Promise.all([
        createSession('guest'),
        LobbyJoin.create(room.id, localPlayerRef.current.label, spectatingRef.current),
      ]);
      joinRef.current?.close();
      joinRef.current = join;
      join.waitForHost(
        session,
        message => setStatus(localizeCoopSignalingMessage(language, message, 'status')),
        message => setError(localizeCoopSignalingMessage(language, message, 'error')),
        () => {
        window.clearTimeout(connectionTimeoutRef.current);
        session.close();
        setMode('choose');
        setStatus('');
        },
      );
      connectionTimeoutRef.current = window.setTimeout(() => {
        if (readySentRef.current) return;
        join.close();
        session.close();
        setError(tr('error.timeout'));
        setMode('choose');
        setStatus('');
      }, 30_000);
    } catch {
      window.clearTimeout(connectionTimeoutRef.current);
      setError(tr('error.offline'));
      setStatus('');
      setMode('choose');
    } finally {
      setLoading(false);
    }
  };

  const joinByCode = async (codeToJoin?: string) => {
    const raw = codeToJoin || codeInputValue;
    const targetCode = normalizeRoomCode(raw);
    if (!targetCode) {
      setError(tr('error.invalidCode'));
      return;
    }
    if (!applyNickname()) return;

    // Check if known in lobby list
    const known = lobbies.find(l => normalizeRoomCode(l.code || '') === targetCode || normalizeRoomCode(l.id) === targetCode);
    if (known) {
      await joinSquad(known);
      return;
    }

    // Direct room code attempt
    await joinSquad({
      id: targetCode,
      code: targetCode,
      hostName: targetCode,
      maxPlayers: COOP_MAX_PLAYERS,
      playerCount: 1,
      state: 'waiting',
    });
  };

  const copyInviteLink = async () => {
    if (!currentRoomCode) return;
    try {
      const url = `${window.location.origin}${window.location.pathname}?room=${currentRoomCode}`;
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      setError(tr('error.copyLink'));
    }
  };

  const copyRoomCode = async () => {
    if (!currentRoomCode) return;
    try {
      await navigator.clipboard.writeText(currentRoomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setError(tr('error.copyCode'));
    }
  };

  const launchHost = () => {
    const session = sessionRef.current;
    if (!session) return;
    const players = [localPlayerRef.current, ...guestPlayersRef.current];
    session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'start', payload: { players, worldId: selectedWorldId } });
    hostedLobbyRef.current?.update(players.length, 'in_game');
    handedOffRef.current = true;
    onLaunch({ role: 'host', session, localPlayerId: localPlayerRef.current.id, players, peerPlayerIds: { ...peerPlayerIdsRef.current }, hostedLobby: hostedLobbyRef.current || undefined, language, worldId: selectedWorldId });
  };

  const launchSolo = () => {
    if (!applyNickname()) return;
    sessionRef.current?.close();
    const launch = createSoloMultiplayerLaunch({ player: localPlayerRef.current, language, worldId: selectedWorldId });
    sessionRef.current = launch.session;
    guestPlayersRef.current = [];
    peerPlayerIdsRef.current = {};
    handedOffRef.current = true;
    onLaunch(launch);
  };

  // Direct manual code fallback actions
  const createDirectOffer = async () => {
    if (!applyNickname()) return;
    setLoading(true);
    setError(null);
    setStatus(tr('status.generatingOffer'));
    try {
      const session = mode === 'direct_host' && sessionRef.current
        ? sessionRef.current
        : await createSession('host');
      if (session.occupiedPeerSlots >= COOP_MAX_PLAYERS - 1) {
        setError(tr('error.squadFull'));
        setStatus('');
        return;
      }
      setOfferCode(await session.createOffer());
      setAnswerCode('');
      setMode('direct_host');
      setStatus(tr('status.offerReady'));
    } catch {
      setError(tr('error.createOffer'));
      setStatus('');
    } finally { setLoading(false); }
  };

  const createDirectAnswer = async () => {
    if (!applyNickname() || !offerCode.trim()) {
      if (!offerCode.trim()) setError(tr('error.pasteOffer'));
      return;
    }
    setLoading(true);
    setError(null);
    setStatus(tr('status.creatingAnswer'));
    try {
      const session = await createSession('guest');
      setAnswerCode(await session.acceptOffer(offerCode));
      setMode('direct_guest');
      setStatus(tr('status.answerReady'));
    } catch {
      setError(tr('error.invalidOffer'));
      setStatus('');
    } finally { setLoading(false); }
  };

  const acceptDirectAnswer = async () => {
    const session = sessionRef.current;
    if (!session || !answerCode.trim()) {
      setError(tr('error.pasteAnswer'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await session.acceptAnswer(answerCode);
      setAnswerCode('');
      setStatus(tr('status.directConnected'));
    } catch {
      setError(tr('error.invalidAnswer'));
    } finally { setLoading(false); }
  };

  const close = () => {
    window.clearTimeout(connectionTimeoutRef.current);
    sessionRef.current?.close();
    hostedLobbyRef.current?.close();
    joinRef.current?.close();
    onClose();
  };

  return (
    <div className="coop-setup-screen absolute inset-0 z-[110] flex items-center justify-center p-3 md:p-6">
      <div className="coop-setup-screen__city" aria-hidden="true" />
      <div className="coop-setup-screen__grid" aria-hidden="true" />
      <section className="coop-setup-shell relative flex max-h-[94dvh] w-full max-w-6xl flex-col">
        <div className="coop-setup-shell__signal" aria-hidden="true" />

        {/* Tactical Header */}
        <header className="coop-setup-header">
          <div className="flex items-center gap-3">
            <div className="coop-setup-header__emblem">
              <Radio size={20} className="animate-pulse" />
            </div>
            <div>
              <div className="coop-setup-header__titleline">
                <h2 className="flex items-center gap-1.5">
                  <span className="coop-setup-title-kill">KILL</span>
                  <span className="coop-setup-title-sync">SYNC</span>
                  <span className="text-white/40 text-[11px] font-black tracking-[0.25em] font-mono">// CO-OP</span>
                </h2>
                <span className="coop-setup-header__live"><i />
                  {tr('setup.liveMatchmaking')}
                </span>
              </div>
              <p className="coop-setup-header__subtitle">
                {tr('setup.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              soundManager.playUIClick();
              close();
            }}
            onMouseEnter={() => soundManager.playUIHover()}
            aria-label={tr('setup.close')}
            className="coop-setup-close"
          >
            <X size={20} />
          </button>
        </header>

        {/* Command Navigation Tabs */}
        {mode === 'choose' && (
          <nav className="coop-setup-nav" aria-label="Multiplayer setup navigation">
            <button
              type="button"
              onClick={() => {
                soundManager.playUIClick();
                setActiveTab('all');
              }}
              onMouseEnter={() => soundManager.playUIHover()}
              className={`coop-setup-tab ${activeTab === 'all' ? 'is-active' : ''}`}
            >
              <Layers size={12} />
              {tr('setup.tabAll')}
            </button>
            <button
              type="button"
              onClick={() => {
                soundManager.playUIClick();
                setActiveTab('loadout');
              }}
              onMouseEnter={() => soundManager.playUIHover()}
              className={`coop-setup-tab ${activeTab === 'loadout' ? 'is-active' : ''}`}
            >
              <Users size={12} />
              {tr('setup.tabLoadout')}
            </button>
            <button
              type="button"
              onClick={() => {
                soundManager.playUIClick();
                setActiveTab('matchmaking');
              }}
              onMouseEnter={() => soundManager.playUIHover()}
              className={`coop-setup-tab ${activeTab === 'matchmaking' ? 'is-active' : ''}`}
            >
              <Radio size={12} />
              {tr('setup.tabMatchmaking')}
              {lobbies.length > 0 && (
                <span className="coop-setup-tab__badge">{lobbies.length}</span>
              )}
            </button>
          </nav>
        )}

        {/* Content Body */}
        <div className="coop-setup-content flex-1 overflow-y-auto">
          <div className="coop-setup-utility">
            <label className="coop-setup-language">
              <Globe size={13} className="text-cyan-300" /> {tr('language.label')}
              <select
                value={language}
                onChange={event => selectLanguage(event.target.value as CoopLanguage)}
                className="coop-setup-language__select"
              >
                <option value="en">{tr('language.en')}</option>
                <option value="ru">{tr('language.ru')}</option>
              </select>
            </label>
          </div>

          {/* MAIN VIEW: CHOOSE / LOBBY BROWSER */}
          {mode === 'choose' && (
            <div className="space-y-6">
              {/* TAB 1: OPERATIVE LOADOUT & LEVEL ROUTE */}
              {(activeTab === 'loadout' || activeTab === 'all') && (
                <div className="space-y-5">
                  {/* OPERATIVE CALLSIGN BAR */}
                  <div className="coop-identity-panel">
                    <div className="flex flex-1 items-center gap-3 min-w-[240px]">
                      <div className="coop-identity-panel__label">
                        {tr('setup.callsign')}
                      </div>
                      <input
                        value={nickname}
                        onChange={e => { setNickname(e.target.value); setError(null); }}
                        onBlur={() => setNickname(normalizeNickname(nickname))}
                        maxLength={16}
                        placeholder={tr('setup.callsignPlaceholder')}
                        className="coop-identity-panel__input"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={loading || !nicknameValid}
                        onClick={() => {
                          soundManager.playUIClick();
                          launchSolo();
                        }}
                        onMouseEnter={() => soundManager.playUIHover()}
                        className="coop-identity-panel__solo"
                      >
                        <ChevronRight size={13} /> {tr('setup.soloPractice')}
                      </button>
                    </div>
                  </div>

                  <CoopSkinSelector value={selectedSkinId} language={language} disabled={loading} onChange={selectSkin} />

                  <CoopWorldSelector
                    unlockedWorldIds={worldProgress.unlockedWorldIds}
                    selectedWorldId={selectedWorldId}
                    onChange={setSelectedWorldId}
                    disabled={loading}
                    description="Discover worlds in order. Redeploy directly to any world your squad leader has unlocked."
                  />

                  <CoopImprintSummary
                    imprint={operatorImprint}
                    language={language}
                    locked={loading}
                    onUpgrade={allocateImprintRank}
                  />

                  {activeTab === 'loadout' && (
                    <div className="flex items-center justify-between pt-2 border-t border-cyan-400/20">
                      <div className="text-[11px] text-white/50 font-mono">
                        // OPERATIVE & SECTOR TELEMETRY VERIFIED & READY FOR UPLINK
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          soundManager.playUIClick();
                          setActiveTab('matchmaking');
                        }}
                        onMouseEnter={() => soundManager.playUIHover()}
                        className="coop-tab-advance-btn"
                      >
                        <span>{tr('setup.proceedMatchmaking')}</span>
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: SQUAD MATCHMAKING & UPLINK */}
              {(activeTab === 'matchmaking' || activeTab === 'all') && (
                <div className="space-y-6">
                  {activeTab === 'matchmaking' && (
                    <>
                      <div className="coop-active-op-bar">
                        <div className="coop-active-op-bar__identity">
                          <div className="coop-active-op-bar__avatar" style={{ border: `1.5px solid ${activeSkin.palette.glow}` }}>
                            <img src={activeSkin.portraitSrc} alt="" />
                          </div>
                          <div className="coop-active-op-bar__meta">
                            <div className="flex items-center gap-2">
                              <span className="coop-active-op-bar__callsign">{nickname || tr('setup.callsignPlaceholder')}</span>
                              <span className="rounded bg-cyan-400/15 px-1.5 py-0.5 text-[8px] font-black text-cyan-300 uppercase">
                                {tr(coopOperatorClassKey(activeOperator.id))}
                              </span>
                            </div>
                            <div className="coop-active-op-bar__role">
                              {tr(coopOperatorRoleKey(activeOperator.id))} · {tr(coopWeaponNameKey(activeSignature.id))}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            soundManager.playUIClick();
                            setActiveTab('loadout');
                          }}
                          onMouseEnter={() => soundManager.playUIHover()}
                          className="coop-active-op-bar__edit"
                        >
                          <Edit3 size={12} />
                          <span>{tr('setup.changeLoadout')}</span>
                        </button>
                      </div>

                      <CoopWorldSelector
                        unlockedWorldIds={worldProgress.unlockedWorldIds}
                        selectedWorldId={selectedWorldId}
                        onChange={setSelectedWorldId}
                        disabled={loading}
                        description="Discover worlds in order. Redeploy directly to any world your squad leader has unlocked."
                      />
                    </>
                  )}

                  {/* PRIMARY ACTION BAR */}
                  <div className="coop-connection-grid">
                    <button
                      disabled={loading || !nicknameValid}
                      onClick={() => {
                        soundManager.playUIClick();
                        void hostSquad();
                      }}
                      onMouseEnter={() => soundManager.playUIHover()}
                      className="coop-connection-action"
                    >
                      <div>
                        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-cyan-200">
                          <Server size={15} /> {tr('setup.hostPublic')}
                        </div>
                        <div className="mt-1 text-[11px] text-white/60">
                          {tr('setup.hostPublicHelp')}
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-cyan-300 transition group-hover:translate-x-1" />
                    </button>

                    {/* JOIN BY CODE INPUT */}
                    <div className="coop-join-console">
                      <input
                        value={codeInputValue}
                        onChange={e => { setCodeInputValue(e.target.value.toUpperCase()); setError(null); }}
                        placeholder={tr('setup.codePlaceholder')}
                        maxLength={16}
                        className="coop-join-console__input"
                      />
                      <button
                        disabled={loading || !nicknameValid || !codeInputValue.trim()}
                        onClick={() => {
                          soundManager.playUIClick();
                          void joinByCode();
                        }}
                        onMouseEnter={() => soundManager.playUIHover()}
                        className="coop-join-console__button"
                      >
                        {tr('setup.join')}
                      </button>
                    </div>
                  </div>

                  {/* LIVE SQUAD LOBBIES LIST */}
                  <div className="coop-lobby-browser">
                    <div className="coop-lobby-browser__header">
                      <div className="coop-lobby-browser__title">
                        <Globe size={14} className="text-cyan-400" />
                        {tr('setup.liveSquads')}
                        <span className="coop-lobby-browser__count">
                          {tr('setup.detected', { count: lobbies.length })}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          soundManager.playUIClick();
                          void refreshLobbies();
                        }}
                        onMouseEnter={() => soundManager.playUIHover()}
                        className="coop-lobby-browser__refresh"
                      >
                        <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> {tr('setup.refresh')}
                      </button>
                    </div>

                    {lobbies.length === 0 ? (
                      <div className="coop-lobby-browser__empty">
                        <div className="coop-lobby-browser__empty-icon">
                          <Radio size={24} className="opacity-60" />
                        </div>
                        <div className="coop-lobby-browser__empty-title">
                          {tr('setup.noSquads')}
                        </div>
                        <p className="coop-lobby-browser__empty-copy">
                          {tr('setup.noSquadsHelp')}
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        {lobbies.map((room) => {
                          const isFull = room.playerCount >= room.maxPlayers;
                          const inGame = room.state === 'in_game';
                          return (
                            <div
                              key={room.id}
                              className="group relative flex items-center justify-between border border-cyan-400/20 bg-[#090f1a] p-3.5 transition duration-200 hover:border-cyan-400/60 hover:bg-cyan-500/[0.07]"
                            >
                              <div className="min-w-0 flex-1 pr-3">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[9px] font-bold text-cyan-400/80">
                                    #{room.code || room.id.slice(0, 8)}
                                  </span>
                                  <span className={`rounded px-1.5 py-0.2 text-[8px] font-black uppercase tracking-wider ${inGame ? 'bg-fuchsia-500/20 text-fuchsia-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                                    {tr(inGame ? 'setup.inCombat' : 'setup.openLobby')}
                                  </span>
                                </div>
                                <div className="mt-1 truncate text-sm font-black uppercase tracking-wider text-white">
                                  {tr('setup.hostSquad', { name: room.hostName })}
                                </div>
                                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-white/50">
                                  <Users size={11} />
                                  <span className="font-mono font-bold text-white/80">{tr('setup.operativesCount', { current: room.playerCount, max: room.maxPlayers })}</span>
                                </div>
                              </div>

                              <button
                                disabled={loading || !nicknameValid || (isFull && !inGame)}
                                onClick={() => {
                                  soundManager.playUIClick();
                                  void joinSquad(room);
                                }}
                                onMouseEnter={() => soundManager.playUIHover()}
                                className={`flex shrink-0 items-center gap-1.5 border px-3.5 py-2 text-[10px] font-black uppercase tracking-wider transition ${
                                  inGame
                                    ? 'border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-200 hover:bg-fuchsia-500/30'
                                    : isFull
                                    ? 'border-white/10 bg-white/5 text-white/30 cursor-not-allowed'
                                    : 'border-cyan-400/50 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/35 hover:shadow-[0_0_15px_rgba(0,240,255,0.3)]'
                                }`}
                              >
                                {tr(inGame ? 'setup.spectate' : isFull ? 'setup.full' : 'setup.join')}
                                <ChevronRight size={13} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* COLLAPSED MANUAL CODE FALLBACK */}
                  <div className="pt-2">
                    <button
                      onClick={() => {
                        soundManager.playUIClick();
                        setShowDirectFallback(!showDirectFallback);
                      }}
                      onMouseEnter={() => soundManager.playUIHover()}
                      className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-white/35 transition hover:text-cyan-300"
                    >
                      {showDirectFallback ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      {tr('setup.advanced')}
                    </button>

                    {showDirectFallback && (
                      <div className="mt-3 border border-white/10 bg-white/[0.02] p-4 text-xs text-white/60">
                        <p className="mb-3 text-[11px] leading-relaxed">
                          {tr('setup.manualHelp')}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              soundManager.playUIClick();
                              void createDirectOffer();
                            }}
                            onMouseEnter={() => soundManager.playUIHover()}
                            className="border border-white/20 bg-white/5 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-white/10"
                          >
                            {tr('setup.hostManual')}
                          </button>
                          <button
                            onClick={() => {
                              soundManager.playUIClick();
                              setOfferCode('');
                              setAnswerCode('');
                              setMode('direct_guest');
                            }}
                            onMouseEnter={() => soundManager.playUIHover()}
                            className="border border-white/20 bg-white/5 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-white/10"
                          >
                            {tr('setup.joinManual')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* HOST VIEW: SQUAD READY ROOM */}
          {mode === 'host' && (
            <div className="space-y-6">
              <CoopWorldSelector
                unlockedWorldIds={worldProgress.unlockedWorldIds}
                selectedWorldId={selectedWorldId}
                onChange={setSelectedWorldId}
                description="Squad leader may choose any unlocked world until deployment."
              />
              {/* CODE & SHARE HERO CARD */}
              <div className="border border-cyan-400/40 bg-gradient-to-br from-cyan-950/40 to-black/60 p-5 shadow-[0_0_30px_rgba(0,240,255,0.15)]" style={{ clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))' }}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">
                      {tr('setup.roomCode')}
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                      <span className="font-mono text-3xl font-black tracking-wider text-white select-all">
                        #{currentRoomCode}
                      </span>
                      <button
                        onClick={() => {
                          soundManager.playUIClick();
                          void copyRoomCode();
                        }}
                        onMouseEnter={() => soundManager.playUIHover()}
                        className="flex items-center gap-1 border border-cyan-400/40 bg-cyan-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-cyan-200 hover:bg-cyan-500/30 transition"
                      >
                        {copiedCode ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} />}
                        {tr(copiedCode ? 'setup.copied' : 'setup.copyCode')}
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      soundManager.playUIClick();
                      void copyInviteLink();
                    }}
                    onMouseEnter={() => soundManager.playUIHover()}
                    className="flex items-center gap-2 border border-emerald-400/50 bg-emerald-500/20 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-emerald-200 transition hover:bg-emerald-500/35 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                    style={{ clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))' }}
                  >
                    {copiedLink ? <Check size={15} className="text-emerald-300" /> : <Link2 size={15} />}
                    {tr(copiedLink ? 'setup.inviteCopied' : 'setup.copyInvite')}
                  </button>
                </div>
                <div className="mt-3 text-[11px] text-white/50">
                  {tr('setup.inviteHelp', { code: currentRoomCode })}
                </div>
              </div>

              {/* OPERATIVES SLOTS ROSTER */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-white flex items-center gap-2">
                    <Users size={14} className="text-cyan-300" />
                    {tr('setup.squadOperatives', { current: guestPlayers.length + 1, max: COOP_MAX_PLAYERS })}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {/* Host Slot */}
                  {(() => {
                    const hostSkin = COOP_SKINS.find(s => s.id === localPlayerRef.current.skinId) || COOP_SKINS[0];
                    return (
                      <div className="coop-roster-slot is-host">
                        <div className="coop-roster-avatar" style={{ border: `1.5px solid ${hostSkin.palette.glow}`, background: `radial-gradient(circle, ${hostSkin.palette.armor}40, #040812)` }}>
                          <img src={hostSkin.portraitSrc} alt="" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-black uppercase tracking-wider text-white">
                              {localPlayerRef.current.label}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded bg-amber-400/20 px-1.5 py-0.5 text-[8px] font-black text-amber-300 uppercase">
                              <Crown size={9} /> {tr('setup.host')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] font-bold text-emerald-300 flex items-center gap-1">
                              <i className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                              {tr('setup.readyDeploy')}
                            </span>
                            <span className="text-white/20">·</span>
                            <CoopSkinBadge skinId={localPlayerRef.current.skinId} />
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Guest Slots */}
                  {Array.from({ length: COOP_MAX_PLAYERS - 1 }, (_, slotIdx) => slotIdx).map(slotIdx => {
                    const guest = guestPlayers[slotIdx];
                    const guestSkin = guest ? COOP_SKINS.find(s => s.id === guest.skinId) || COOP_SKINS[0] : null;

                    return guest ? (
                      <div key={slotIdx} className="coop-roster-slot is-guest-connected">
                        <div className="coop-roster-avatar" style={{ border: `1.5px solid ${guestSkin?.palette.glow || '#4ade80'}`, background: `radial-gradient(circle, ${guestSkin?.palette.armor || '#10b981'}40, #040812)` }}>
                          <img src={guestSkin?.portraitSrc || '/phantom.png'} alt="" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-black uppercase tracking-wider text-white">
                              {guest.label}
                            </span>
                            <span className="rounded bg-emerald-400/20 px-1.5 py-0.5 text-[8px] font-black text-emerald-300 uppercase">
                              {tr('setup.connectedSynced')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] font-bold text-emerald-300 flex items-center gap-1">
                              <i className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                              {tr('setup.ready')}
                            </span>
                            <span className="text-white/20">·</span>
                            <CoopSkinBadge skinId={guest.skinId} />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div key={slotIdx} className="coop-roster-slot is-empty">
                        <div className="coop-roster-avatar__empty">
                          <Radio size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-black uppercase tracking-wider text-white/40">
                            {tr('setup.openSlot', { slot: slotIdx + 2 })}
                          </div>
                          <div className="text-[9px] text-white/25 mt-0.5 font-mono">{tr('setup.waitingFriend')}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* LAUNCH ACTIONS */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                <button
                  onClick={() => {
                    soundManager.playUIClick();
                    hostedLobbyRef.current?.close();
                    sessionRef.current?.close();
                    setMode('choose');
                    setStatus('');
                  }}
                  onMouseEnter={() => soundManager.playUIHover()}
                  className="border border-red-400/30 px-4 py-2.5 text-[11px] font-black uppercase tracking-wider text-red-300 transition hover:bg-red-500/10"
                  style={{ clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))' }}
                >
                  {tr('setup.disband')}
                </button>

                <button
                  onClick={() => {
                    soundManager.playUIClick();
                    launchHost();
                  }}
                  onMouseEnter={() => soundManager.playUIHover()}
                  className="coop-deploy-btn"
                >
                  <Shield size={18} />
                  <span>{tr('setup.deploy', { count: guestPlayers.length + 1, players: tr(guestPlayers.length === 0 ? 'setup.player.one' : 'setup.player.many') })}</span>
                </button>
              </div>
            </div>
          )}

          {/* GUEST VIEW: CONNECTING & WAITING */}
          {mode === 'guest' && (
            <div className="space-y-6 py-4">
              <div className="border border-fuchsia-400/30 bg-fuchsia-950/20 p-6 text-center" style={{ clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))' }}>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-300 shadow-[0_0_20px_rgba(217,70,239,0.3)]">
                  <Wifi size={24} className="animate-pulse" />
                </div>
                <div className="mt-4 font-mono text-sm font-bold text-fuchsia-300">
                  #{currentRoomCode}
                </div>
                <div className="mt-1 text-base font-black uppercase tracking-wider text-white">
                  {status || tr('setup.establishing')}
                </div>
                <p className="mx-auto mt-2 max-w-sm text-xs text-white/50">
                  {tr('setup.connectingHelp')}
                </p>
              </div>

              {/* Roster display for guests */}
              {rosterPlayers.length > 0 && (
                <div>
                  <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/60">
                    {tr('setup.squadOperatives', { current: rosterPlayers.length, max: COOP_MAX_PLAYERS })}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {rosterPlayers.map((p, idx) => {
                      const pSkin = COOP_SKINS.find(s => s.id === p.skinId) || COOP_SKINS[0];
                      return (
                        <div key={p.id} className="coop-roster-slot is-guest-connected">
                          <div className="coop-roster-avatar" style={{ border: `1.5px solid ${pSkin.palette.glow}`, background: `radial-gradient(circle, ${pSkin.palette.armor}40, #040812)` }}>
                            <img src={pSkin.portraitSrc} alt="" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-black uppercase text-white truncate">
                                {p.label}
                              </span>
                              {idx === 0 && (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-400/20 px-1.5 py-0.5 text-[8px] font-black text-amber-300 uppercase">
                                  <Crown size={9} /> {tr('setup.leader')}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[9px] font-bold text-emerald-300">{tr('setup.ready')}</span>
                              <span className="text-white/20">·</span>
                              <CoopSkinBadge skinId={p.skinId} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="text-center">
                <button
                  onClick={() => {
                    soundManager.playUIClick();
                    joinRef.current?.close();
                    sessionRef.current?.close();
                    setMode('choose');
                    setStatus('');
                  }}
                  onMouseEnter={() => soundManager.playUIHover()}
                  className="border border-white/20 px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-white/70 hover:bg-white/10 hover:text-white transition"
                  style={{ clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))' }}
                >
                  {tr('setup.leave')}
                </button>
              </div>
            </div>
          )}

          {/* MANUAL DIRECT CO-OP SCREENS (PRESERVED FOR AIR-GAPPED ENVIRONMENTS) */}
          {mode === 'direct_host' && (
            <div className="space-y-4 border border-cyan-400/30 bg-cyan-950/20 p-5">
              <CoopWorldSelector
                unlockedWorldIds={worldProgress.unlockedWorldIds}
                selectedWorldId={selectedWorldId}
                onChange={setSelectedWorldId}
                description="Choose any unlocked world before starting the match."
              />
              <div className="text-sm font-black uppercase tracking-wider text-white">
                {tr('setup.directHost')}
              </div>
              <textarea readOnly value={offerCode} className="h-24 w-full border border-white/20 bg-black/40 p-2 font-mono text-[10px] text-cyan-200" />
              <button onClick={() => void navigator.clipboard?.writeText(offerCode)} className="border border-cyan-400 px-3 py-1 text-xs text-cyan-200">
                {tr('setup.copyOffer')}
              </button>
              <textarea
                value={answerCode}
                onChange={e => setAnswerCode(e.target.value)}
                placeholder={tr('setup.pasteAnswer')}
                className="h-24 w-full border border-white/20 bg-black/40 p-2 font-mono text-[10px] text-white"
              />
              <button onClick={() => void acceptDirectAnswer()} className="border border-emerald-400 bg-emerald-500/20 px-4 py-2 text-xs font-black text-emerald-100">
                {tr('setup.connectFriend')}
              </button>
              <button onClick={() => void createDirectOffer()} className="ml-2 border border-cyan-400 bg-cyan-500/15 px-4 py-2 text-xs font-black text-cyan-100">
                {tr('setup.nextInvite')}
              </button>
              <button onClick={launchHost} className="ml-2 border border-emerald-400 bg-emerald-500/30 px-4 py-2 text-xs font-black text-emerald-100">
                {tr('setup.startMatch')}
              </button>
            </div>
          )}

          {mode === 'direct_guest' && (
            <div className="space-y-4 border border-fuchsia-400/30 bg-fuchsia-950/20 p-5">
              <div className="text-sm font-black uppercase tracking-wider text-white">
                {tr('setup.directGuest')}
              </div>
              <textarea
                value={offerCode}
                onChange={e => setOfferCode(e.target.value)}
                placeholder={tr('setup.pasteOffer')}
                className="h-24 w-full border border-white/20 bg-black/40 p-2 font-mono text-[10px] text-white"
              />
              <button onClick={() => void createDirectAnswer()} className="border border-fuchsia-400 bg-fuchsia-500/20 px-4 py-2 text-xs font-black text-fuchsia-100">
                {tr('setup.createAnswer')}
              </button>
              {answerCode && (
                <>
                  <textarea readOnly value={answerCode} className="h-24 w-full border border-white/20 bg-black/40 p-2 font-mono text-[10px] text-fuchsia-200" />
                  <button onClick={() => void navigator.clipboard?.writeText(answerCode)} className="border border-fuchsia-400 px-3 py-1 text-xs text-fuchsia-200">
                    {tr('setup.copyAnswer')}
                  </button>
                </>
              )}
            </div>
          )}

          {/* STATUS AND ERROR MESSAGES */}
          {status && (
            <div className="mt-4 flex items-center gap-2 text-xs font-medium text-cyan-200/85">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
              {status}
            </div>
          )}
          {error && (
            <div role="alert" className="mt-4 border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
              {error}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function connectedPeers(peers: MultiplayerPeerInfo[]) {
  return peers.filter(peer => peer.state === 'connected').length;
}

function createLocalId() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return `operator-${values[0].toString(36)}`;
}

function createLocalPlayerSeed(): CoopPlayerSeed {
  const operatorId = selectedCoopOperatorId();
  const imprint = getCoopOperatorImprint(readCoopImprintProfile(), operatorId);
  const skinId = readCoopSkinId();
  return { id: createLocalId(), label: savedNickname(), color: '#22d3ee', skinId, operatorId: normalizeCoopOperatorId(skinId), imprint: normalizeCoopImprintLoadout(imprint, operatorId) };
}

function parsePlayer(value: unknown): CoopPlayerSeed | null {
  if (!value || typeof value !== 'object') return null;
  const player = value as Partial<CoopPlayerSeed>;
  return typeof player.id === 'string' && typeof player.label === 'string' && typeof player.color === 'string'
    ? { id: player.id, label: player.label.slice(0, 24), color: player.color, skinId: normalizeCoopSkinId(player.skinId), operatorId: normalizeCoopOperatorId(player.operatorId, player.skinId), imprint: normalizeCoopImprintLoadout(player.imprint) }
    : null;
}

function parsePlayers(value: unknown, minimumPlayers: number = 2): CoopPlayerSeed[] | null {
  if (!Array.isArray(value) || value.length < minimumPlayers || value.length > COOP_MAX_PLAYERS) return null;
  const players = value.map(parsePlayer);
  return players.every((player): player is CoopPlayerSeed => player !== null) ? players : null;
}

function parseStartPayload(value: unknown, minimumPlayers: number) {
  // Array support keeps older clients capable of joining a World 1 lobby while
  // the richer deployment envelope rolls out.
  if (Array.isArray(value)) {
    const players = parsePlayers(value, minimumPlayers);
    return players ? { players, worldId: 'neon_bastion' as WorldId } : null;
  }
  if (!value || typeof value !== 'object') return null;
  const payload = value as { players?: unknown; worldId?: unknown };
  const players = parsePlayers(payload.players, minimumPlayers);
  return players ? { players, worldId: normalizeWorldId(payload.worldId) } : null;
}

function guestColor(index: number) {
  return COOP_GUEST_COLORS[index % COOP_GUEST_COLORS.length];
}

function normalizeNickname(value: string) {
  return value.replace(/[^\p{L}\p{N} _-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

function savedNickname() {
  try {
    return normalizeNickname(localStorage.getItem('killsync.multiplayer.nickname') || '');
  } catch {
    return '';
  }
}
