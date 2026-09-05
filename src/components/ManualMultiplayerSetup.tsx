import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Crown,
  Globe,
  Link2,
  Radio,
  RefreshCw,
  Server,
  Shield,
  Users,
  Wifi,
  X,
} from 'lucide-react';
import { ManualWebRTCSession } from '../game/multiplayer/ManualWebRTCSession';
import {
  HostedLobby,
  LobbyJoin,
  PublicLobby,
  fetchIceServers,
  globalLobbyDiscovery,
  listPublicLobbies,
} from '../game/multiplayer/LobbySignaling';
import { MultiplayerPeerInfo, MULTIPLAYER_PROTOCOL_VERSION } from '../game/multiplayer/protocol';
import { CoopPlayerSeed } from '../game/multiplayer/CoopSimulation';
import { generateRoomCode, normalizeRoomCode } from '../game/multiplayer/UnifiedSignaling';

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
  const localPlayerRef = useRef<CoopPlayerSeed>({ id: createLocalId(), label: savedNickname(), color: '#22d3ee' });
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

  // Direct manual fallback codes
  const [offerCode, setOfferCode] = useState('');
  const [answerCode, setAnswerCode] = useState('');

  const nicknameValid = normalizeNickname(nickname).length >= 2;

  const applyNickname = () => {
    const label = normalizeNickname(nickname);
    if (label.length < 2) {
      setError('Choose an operative callsign with at least 2 characters.');
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
    setStatus(spectatingRef.current ? 'Spectating match…' : 'Squad link established — waiting for host deployment.');
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
      onError: () => setError('Squad signal was interrupted. Retrying link…'),
      onEvent: (peerId, event) => {
        if (event.event === 'ready' && role === 'host') {
          const player = parsePlayer(event.payload);
          if (!player || peerPlayerIdsRef.current[peerId] || player.id === localPlayerRef.current.id || guestPlayersRef.current.some(guest => guest.id === player.id) || guestPlayersRef.current.length >= 3) return;
          peerPlayerIdsRef.current[peerId] = player.id;
          const next = guestPlayersRef.current.some(item => item.id === player.id)
            ? guestPlayersRef.current
            : [...guestPlayersRef.current, { ...player, color: guestColor(guestPlayersRef.current.length) }];
          guestPlayersRef.current = next;
          setGuestPlayers(next);
          session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'roster', payload: [localPlayerRef.current, ...next] });
          hostedLobbyRef.current?.update(next.length + 1, 'waiting');
          setStatus(`Operative ${player.label} attached to squad!`);
        }
        if (event.event === 'roster' && role === 'guest') {
          const players = parsePlayers(event.payload, 1);
          if (players) setRosterPlayers(players);
        }
        if (event.event === 'start' && role === 'guest') {
          const players = parsePlayers(event.payload, spectatingRef.current ? 1 : 2);
          if (!players || (!spectatingRef.current && !players.some(player => player.id === localPlayerRef.current.id))) return;
          handedOffRef.current = true;
          onLaunch({ role: spectatingRef.current ? 'spectator' : 'guest', session, localPlayerId: localPlayerRef.current.id, players, peerPlayerIds: {}, lobbyJoin: joinRef.current || undefined });
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
    setStatus('Initializing secure squad frequency…');
    try {
      const code = generateRoomCode();
      const [session, lobby] = await Promise.all([
        createSession('host'),
        HostedLobby.create(localPlayerRef.current.label, code),
      ]);
      hostedLobbyRef.current?.close();
      hostedLobbyRef.current = lobby;
      setCurrentRoomCode(lobby.room.code || code);
      lobby.setStatusListener(setStatus);
      lobby.start(session);
      lobby.update(1, 'waiting');
      setMode('host');
      setStatus('Squad frequency active. Waiting for operatives to connect.');
    } catch {
      setError('Could not initialize squad frequency. Please try again.');
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
    setStatus(room.state === 'in_game' ? `Infiltrating match as spectator…` : `Connecting to ${room.hostName}’s squad…`);
    try {
      const [session, join] = await Promise.all([
        createSession('guest'),
        LobbyJoin.create(room.id, localPlayerRef.current.label, spectatingRef.current),
      ]);
      joinRef.current?.close();
      joinRef.current = join;
      join.waitForHost(session, setStatus, setError, () => {
        window.clearTimeout(connectionTimeoutRef.current);
        session.close();
        setMode('choose');
        setStatus('');
      });
      connectionTimeoutRef.current = window.setTimeout(() => {
        if (readySentRef.current) return;
        join.close();
        session.close();
        setError('Connection timed out. Squad leader may be unreachable.');
        setMode('choose');
        setStatus('');
      }, 30_000);
    } catch {
      window.clearTimeout(connectionTimeoutRef.current);
      setError('Squad is no longer online. Choose another lobby.');
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
      setError('Enter a valid squad code (e.g. VIPER-04).');
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
      maxPlayers: 4,
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
      setError('Failed to copy link to clipboard.');
    }
  };

  const copyRoomCode = async () => {
    if (!currentRoomCode) return;
    try {
      await navigator.clipboard.writeText(currentRoomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setError('Failed to copy code.');
    }
  };

  const launchHost = () => {
    const session = sessionRef.current;
    if (!session) return;
    const players = [localPlayerRef.current, ...guestPlayersRef.current];
    session.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'start', payload: players });
    hostedLobbyRef.current?.update(players.length, 'in_game');
    handedOffRef.current = true;
    onLaunch({ role: 'host', session, localPlayerId: localPlayerRef.current.id, players, peerPlayerIds: { ...peerPlayerIdsRef.current }, hostedLobby: hostedLobbyRef.current || undefined });
  };

  const launchSolo = () => {
    if (!applyNickname()) return;
    sessionRef.current?.close();
    sessionRef.current = new ManualWebRTCSession({ role: 'host', iceServers: [] });
    guestPlayersRef.current = [];
    peerPlayerIdsRef.current = {};
    handedOffRef.current = true;
    onLaunch({ role: 'host', session: sessionRef.current, localPlayerId: localPlayerRef.current.id, players: [localPlayerRef.current], peerPlayerIds: {}, soloTest: true });
  };

  // Direct manual code fallback actions
  const createDirectOffer = async () => {
    if (!applyNickname()) return;
    setLoading(true);
    setError(null);
    setStatus('Generating offline WebRTC offer…');
    try {
      const session = await createSession('host');
      setOfferCode(await session.createOffer());
      setAnswerCode('');
      setMode('direct_host');
      setStatus('Copy this offer to one friend. When they return an answer, paste it below.');
    } catch {
      setError('Could not create direct offer.');
      setStatus('');
    } finally { setLoading(false); }
  };

  const createDirectAnswer = async () => {
    if (!applyNickname() || !offerCode.trim()) {
      if (!offerCode.trim()) setError('Paste host offer code first.');
      return;
    }
    setLoading(true);
    setError(null);
    setStatus('Creating offline WebRTC answer…');
    try {
      const session = await createSession('guest');
      setAnswerCode(await session.acceptOffer(offerCode));
      setMode('direct_guest');
      setStatus('Send your answer code back to the host.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Invalid offer code.');
      setStatus('');
    } finally { setLoading(false); }
  };

  const acceptDirectAnswer = async () => {
    const session = sessionRef.current;
    if (!session || !answerCode.trim()) {
      setError('Paste friend’s answer code first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await session.acceptAnswer(answerCode);
      setStatus('Direct peer connection established!');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Invalid answer code.');
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
    <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/85 p-3 backdrop-blur-xl md:p-6">
      <section className="relative flex max-h-[94dvh] w-full max-w-4xl flex-col border border-cyan-400/40 bg-[#060a12]/95 shadow-[0_0_80px_rgba(0,240,255,0.22)]">
        {/* Neon scanline accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-cyan-500 via-emerald-400 to-fuchsia-500" />

        {/* Tactical Header */}
        <header className="flex items-center justify-between border-b border-cyan-400/20 bg-cyan-950/20 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border border-cyan-400/50 bg-cyan-500/10 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.3)]">
              <Radio size={20} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-[0.2em] text-white">KILLSYNC CO-OP</h2>
                <span className="flex items-center gap-1 rounded border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Live Matchmaking
                </span>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300/60">
                100% Peer-to-Peer WebRTC · Zero Server Hosting Needed
              </p>
            </div>
          </div>
          <button
            onClick={close}
            aria-label="Close multiplayer"
            className="rounded p-2 text-white/40 transition hover:bg-white/10 hover:text-white"
          >
            <X size={20} />
          </button>
        </header>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 md:p-7">
          {/* OPERATIVE CALLSIGN BAR */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border border-cyan-400/20 bg-cyan-500/[0.03] p-3.5">
            <div className="flex flex-1 items-center gap-3 min-w-[240px]">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300 whitespace-nowrap">
                CALLSIGN //
              </div>
              <input
                value={nickname}
                onChange={e => { setNickname(e.target.value); setError(null); }}
                onBlur={() => setNickname(normalizeNickname(nickname))}
                maxLength={16}
                placeholder="OPERATIVE NAME"
                className="w-full border-b border-cyan-400/30 bg-transparent pb-1 font-mono text-sm font-black uppercase tracking-wider text-cyan-100 placeholder:text-white/20 focus:border-cyan-300 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={loading || !nicknameValid}
                onClick={launchSolo}
                className="flex items-center gap-1.5 border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-40"
              >
                <ChevronRight size={13} /> Solo Practice
              </button>
            </div>
          </div>

          {/* MAIN VIEW: CHOOSE / LOBBY BROWSER */}
          {mode === 'choose' && (
            <div className="space-y-6">
              {/* PRIMARY ACTION BAR */}
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  disabled={loading || !nicknameValid}
                  onClick={() => void hostSquad()}
                  className="group relative flex items-center justify-between overflow-hidden border border-cyan-400/60 bg-gradient-to-r from-cyan-500/20 to-cyan-500/5 p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-[0_0_30px_rgba(0,240,255,0.25)] disabled:opacity-45"
                >
                  <div>
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-cyan-200">
                      <Server size={15} /> Host Public Squad
                    </div>
                    <div className="mt-1 text-[11px] text-white/60">
                      Create an open lobby with a room code & invite link
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-cyan-300 transition group-hover:translate-x-1" />
                </button>

                {/* JOIN BY CODE INPUT */}
                <div className="flex items-center gap-2 border border-fuchsia-400/40 bg-fuchsia-500/[0.05] p-2 sm:p-3">
                  <input
                    value={codeInputValue}
                    onChange={e => { setCodeInputValue(e.target.value.toUpperCase()); setError(null); }}
                    placeholder="ENTER CODE (E.G. VIPER-04)"
                    maxLength={16}
                    className="w-full bg-transparent px-2 font-mono text-xs font-black uppercase tracking-wider text-fuchsia-100 placeholder:text-white/25 focus:outline-none"
                  />
                  <button
                    disabled={loading || !nicknameValid || !codeInputValue.trim()}
                    onClick={() => void joinByCode()}
                    className="shrink-0 border border-fuchsia-400/60 bg-fuchsia-500/20 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-fuchsia-200 transition hover:bg-fuchsia-500/35 disabled:opacity-40"
                  >
                    Join
                  </button>
                </div>
              </div>

              {/* LIVE SQUAD LOBBIES LIST */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-white">
                    <Globe size={14} className="text-cyan-400" />
                    Live Squad Frequencies
                    <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[9px] font-black text-emerald-300">
                      {lobbies.length} DETECTED
                    </span>
                  </div>
                  <button
                    onClick={() => void refreshLobbies()}
                    className="flex items-center gap-1.5 border border-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-200 transition hover:border-cyan-400/50 hover:text-white"
                  >
                    <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
                  </button>
                </div>

                {lobbies.length === 0 ? (
                  <div className="border border-dashed border-cyan-400/20 bg-cyan-950/[0.07] px-6 py-10 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-500/5 text-cyan-300">
                      <Radio size={24} className="opacity-60" />
                    </div>
                    <div className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-white/80">
                      No Active Squads Detected
                    </div>
                    <p className="mx-auto mt-2 max-w-sm text-[11px] leading-relaxed text-white/45">
                      Hit <strong className="text-cyan-200">Host Public Squad</strong> above to be the squad leader. Your lobby will appear here instantly for friends to join!
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {lobbies.map((room, idx) => {
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
                                {inGame ? 'In Combat' : 'Open Lobby'}
                              </span>
                            </div>
                            <div className="mt-1 truncate text-sm font-black uppercase tracking-wider text-white">
                              {room.hostName}’s Squad
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-white/50">
                              <Users size={11} />
                              <span className="font-mono font-bold text-white/80">{room.playerCount} / {room.maxPlayers} Operatives</span>
                            </div>
                          </div>

                          <button
                            disabled={loading || !nicknameValid || (isFull && !inGame)}
                            onClick={() => void joinSquad(room)}
                            className={`flex shrink-0 items-center gap-1.5 border px-3.5 py-2 text-[10px] font-black uppercase tracking-wider transition ${
                              inGame
                                ? 'border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-200 hover:bg-fuchsia-500/30'
                                : isFull
                                ? 'border-white/10 bg-white/5 text-white/30 cursor-not-allowed'
                                : 'border-cyan-400/50 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/35 hover:shadow-[0_0_15px_rgba(0,240,255,0.3)]'
                            }`}
                          >
                            {inGame ? 'Spectate' : isFull ? 'Full' : 'Join'}
                            <ChevronRight size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* COLLAPSED MANUAL CODE FALLBACK (FOR OFFLINE / AIRGAPPED TESTING ONLY) */}
              <div className="pt-2">
                <button
                  onClick={() => setShowDirectFallback(!showDirectFallback)}
                  className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-white/35 transition hover:text-cyan-300"
                >
                  {showDirectFallback ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  Advanced: Air-gapped / Manual SDP Fallback
                </button>

                {showDirectFallback && (
                  <div className="mt-3 border border-white/10 bg-white/[0.02] p-4 text-xs text-white/60">
                    <p className="mb-3 text-[11px] leading-relaxed">
                      Manual copy-paste mode is only needed if WebSockets are entirely blocked on your local network.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => void createDirectOffer()}
                        className="border border-white/20 bg-white/5 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-white/10"
                      >
                        Host Manual Match
                      </button>
                      <button
                        onClick={() => { setOfferCode(''); setAnswerCode(''); setMode('direct_guest'); }}
                        className="border border-white/20 bg-white/5 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-white/10"
                      >
                        Join Manual Match
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* HOST VIEW: SQUAD READY ROOM */}
          {mode === 'host' && (
            <div className="space-y-6">
              {/* CODE & SHARE HERO CARD */}
              <div className="border border-cyan-400/40 bg-gradient-to-br from-cyan-950/40 to-black/60 p-5 shadow-[0_0_30px_rgba(0,240,255,0.15)]">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">
                      SQUAD ROOM CODE // SHARE WITH FRIENDS
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                      <span className="font-mono text-3xl font-black tracking-wider text-white select-all">
                        #{currentRoomCode}
                      </span>
                      <button
                        onClick={() => void copyRoomCode()}
                        className="flex items-center gap-1 border border-cyan-400/40 bg-cyan-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-cyan-200 hover:bg-cyan-500/30"
                      >
                        {copiedCode ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} />}
                        {copiedCode ? 'Copied' : 'Copy Code'}
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => void copyInviteLink()}
                    className="flex items-center gap-2 border border-emerald-400/50 bg-emerald-500/20 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-emerald-200 transition hover:bg-emerald-500/35 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                  >
                    {copiedLink ? <Check size={15} className="text-emerald-300" /> : <Link2 size={15} />}
                    {copiedLink ? 'Invite Link Copied!' : 'Copy 1-Click Invite Link'}
                  </button>
                </div>
                <div className="mt-3 text-[11px] text-white/50">
                  Friends can click the link or type <span className="font-mono text-cyan-300 font-bold">#{currentRoomCode}</span> in their lobby browser to connect instantly.
                </div>
              </div>

              {/* OPERATIVES SLOTS ROSTER */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-white flex items-center gap-2">
                    <Users size={14} className="text-cyan-300" />
                    Squad Operatives ({guestPlayers.length + 1} / 4)
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {/* Host Slot */}
                  <div className="flex items-center gap-3 border border-cyan-400/40 bg-cyan-500/10 p-3.5">
                    <div className="flex h-10 w-10 items-center justify-center border border-cyan-300 bg-cyan-400/20 text-cyan-200">
                      <Crown size={18} className="text-amber-300" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-black uppercase tracking-wider text-white">
                          {localPlayerRef.current.label}
                        </span>
                        <span className="rounded bg-amber-400/20 px-1.5 py-0.2 text-[8px] font-black text-amber-300 uppercase">
                          Host
                        </span>
                      </div>
                      <div className="text-[10px] font-bold text-emerald-300">Ready to Deploy</div>
                    </div>
                  </div>

                  {/* Guest Slots */}
                  {[0, 1, 2].map(slotIdx => {
                    const guest = guestPlayers[slotIdx];
                    return (
                      <div
                        key={slotIdx}
                        className={`flex items-center gap-3 border p-3.5 transition ${
                          guest
                            ? 'border-emerald-400/40 bg-emerald-500/10'
                            : 'border-white/10 bg-white/[0.02]'
                        }`}
                      >
                        <div
                          className={`flex h-10 w-10 items-center justify-center border text-xs font-black uppercase ${
                            guest
                              ? 'border-emerald-300 bg-emerald-400/20 text-emerald-200'
                              : 'border-white/15 bg-white/[0.03] text-white/20'
                          }`}
                        >
                          {guest ? guest.label.slice(0, 2) : <Users size={15} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          {guest ? (
                            <>
                              <div className="truncate font-black uppercase tracking-wider text-white">
                                {guest.label}
                              </div>
                              <div className="text-[10px] font-bold text-emerald-300">Connected & Synced</div>
                            </>
                          ) : (
                            <>
                              <div className="text-xs font-black uppercase tracking-wider text-white/30">
                                Open Slot {slotIdx + 2}
                              </div>
                              <div className="text-[10px] text-white/25">Waiting for friend…</div>
                            </>
                          )}
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
                    hostedLobbyRef.current?.close();
                    sessionRef.current?.close();
                    setMode('choose');
                    setStatus('');
                  }}
                  className="border border-red-400/30 px-4 py-2.5 text-[11px] font-black uppercase tracking-wider text-red-300 transition hover:bg-red-500/10"
                >
                  Disband Squad
                </button>

                <button
                  onClick={launchHost}
                  className="flex items-center gap-2 border border-emerald-300 bg-emerald-400/25 px-6 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-100 shadow-[0_0_25px_rgba(16,185,129,0.3)] transition hover:bg-emerald-400/40 hover:scale-[1.02]"
                >
                  <Shield size={16} /> Deploy Squad ({guestPlayers.length + 1} {guestPlayers.length === 0 ? 'Player' : 'Players'})
                </button>
              </div>
            </div>
          )}

          {/* GUEST VIEW: CONNECTING & WAITING */}
          {mode === 'guest' && (
            <div className="space-y-6 py-4">
              <div className="border border-fuchsia-400/30 bg-fuchsia-950/20 p-6 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-300 shadow-[0_0_20px_rgba(217,70,239,0.3)]">
                  <Wifi size={24} className="animate-pulse" />
                </div>
                <div className="mt-4 font-mono text-sm font-bold text-fuchsia-300">
                  #{currentRoomCode}
                </div>
                <div className="mt-1 text-base font-black uppercase tracking-wider text-white">
                  {status || 'Establishing Peer Connection…'}
                </div>
                <p className="mx-auto mt-2 max-w-sm text-xs text-white/50">
                  Direct WebRTC data link is synchronizing automatically. Combat will launch as soon as the squad leader begins the mission.
                </p>
              </div>

              {/* Roster display for guests */}
              {rosterPlayers.length > 0 && (
                <div>
                  <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/60">
                    Squad Operatives
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {rosterPlayers.map((p, idx) => (
                      <div key={p.id} className="flex items-center justify-between border border-white/10 bg-white/[0.03] p-2.5 text-xs">
                        <span className="font-black uppercase text-white">
                          {p.label} {idx === 0 ? '(Leader)' : ''}
                        </span>
                        <span className="text-[10px] font-bold text-emerald-300">Ready</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-center">
                <button
                  onClick={() => {
                    joinRef.current?.close();
                    sessionRef.current?.close();
                    setMode('choose');
                    setStatus('');
                  }}
                  className="border border-white/20 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white/70 hover:bg-white/10 hover:text-white"
                >
                  Leave Squad
                </button>
              </div>
            </div>
          )}

          {/* MANUAL DIRECT CO-OP SCREENS (PRESERVED FOR AIR-GAPPED ENVIRONMENTS) */}
          {mode === 'direct_host' && (
            <div className="space-y-4 border border-cyan-400/30 bg-cyan-950/20 p-5">
              <div className="text-sm font-black uppercase tracking-wider text-white">
                OFFLINE DIRECT MATCH (HOST)
              </div>
              <textarea readOnly value={offerCode} className="h-24 w-full border border-white/20 bg-black/40 p-2 font-mono text-[10px] text-cyan-200" />
              <button onClick={() => void navigator.clipboard?.writeText(offerCode)} className="border border-cyan-400 px-3 py-1 text-xs text-cyan-200">
                Copy Offer
              </button>
              <textarea
                value={answerCode}
                onChange={e => setAnswerCode(e.target.value)}
                placeholder="Paste friend’s answer here"
                className="h-24 w-full border border-white/20 bg-black/40 p-2 font-mono text-[10px] text-white"
              />
              <button onClick={() => void acceptDirectAnswer()} className="border border-emerald-400 bg-emerald-500/20 px-4 py-2 text-xs font-black text-emerald-100">
                Connect Friend
              </button>
              <button onClick={launchHost} className="ml-2 border border-emerald-400 bg-emerald-500/30 px-4 py-2 text-xs font-black text-emerald-100">
                Start Match
              </button>
            </div>
          )}

          {mode === 'direct_guest' && (
            <div className="space-y-4 border border-fuchsia-400/30 bg-fuchsia-950/20 p-5">
              <div className="text-sm font-black uppercase tracking-wider text-white">
                OFFLINE DIRECT MATCH (GUEST)
              </div>
              <textarea
                value={offerCode}
                onChange={e => setOfferCode(e.target.value)}
                placeholder="Paste host offer here"
                className="h-24 w-full border border-white/20 bg-black/40 p-2 font-mono text-[10px] text-white"
              />
              <button onClick={() => void createDirectAnswer()} className="border border-fuchsia-400 bg-fuchsia-500/20 px-4 py-2 text-xs font-black text-fuchsia-100">
                Create Answer
              </button>
              {answerCode && (
                <>
                  <textarea readOnly value={answerCode} className="h-24 w-full border border-white/20 bg-black/40 p-2 font-mono text-[10px] text-fuchsia-200" />
                  <button onClick={() => void navigator.clipboard?.writeText(answerCode)} className="border border-fuchsia-400 px-3 py-1 text-xs text-fuchsia-200">
                    Copy Answer
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

function parsePlayer(value: unknown): CoopPlayerSeed | null {
  if (!value || typeof value !== 'object') return null;
  const player = value as Partial<CoopPlayerSeed>;
  return typeof player.id === 'string' && typeof player.label === 'string' && typeof player.color === 'string'
    ? { id: player.id, label: player.label.slice(0, 24), color: player.color }
    : null;
}

function parsePlayers(value: unknown, minimumPlayers: number = 2): CoopPlayerSeed[] | null {
  if (!Array.isArray(value) || value.length < minimumPlayers || value.length > 4) return null;
  const players = value.map(parsePlayer);
  return players.every((player): player is CoopPlayerSeed => player !== null) ? players : null;
}

function guestColor(index: number) {
  return ['#f472b6', '#a78bfa', '#fbbf24'][index % 3];
}

function normalizeNickname(value: string) {
  return value.replace(/[^a-z0-9 _-]/gi, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

function savedNickname() {
  try {
    return normalizeNickname(localStorage.getItem('killsync.multiplayer.nickname') || '');
  } catch {
    return '';
  }
}
