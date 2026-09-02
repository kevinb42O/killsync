import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Crown, Radio, RefreshCw, Server, Users, Wifi, X } from 'lucide-react';
import { ManualWebRTCSession } from '../game/multiplayer/ManualWebRTCSession';
import { HostedLobby, LobbyJoin, PublicLobby, fetchIceServers, listPublicLobbies } from '../game/multiplayer/LobbySignaling';
import { MultiplayerPeerInfo, MULTIPLAYER_PROTOCOL_VERSION } from '../game/multiplayer/protocol';
import { CoopPlayerSeed } from '../game/multiplayer/CoopSimulation';

type SetupMode = 'choose' | 'host' | 'guest';

export interface MultiplayerLaunch {
  role: 'host' | 'guest' | 'spectator';
  session: ManualWebRTCSession;
  localPlayerId: string;
  players: CoopPlayerSeed[];
  peerPlayerIds: Record<string, string>;
  hostedLobby?: HostedLobby;
  lobbyJoin?: LobbyJoin;
}

export function ManualMultiplayerSetup({ onClose, onLaunch }: { onClose: () => void; onLaunch: (launch: MultiplayerLaunch) => void }) {
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
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [nickname, setNickname] = useState(localPlayerRef.current.label);
  const nicknameValid = normalizeNickname(nickname).length >= 2;

  const applyNickname = () => {
    const label = normalizeNickname(nickname);
    if (label.length < 2) {
      setError('Choose a name with at least 2 characters.');
      return false;
    }
    localPlayerRef.current = { ...localPlayerRef.current, label };
    try { localStorage.setItem('killsync.multiplayer.nickname', label); } catch { /* Private browsing can reject storage; the name still works for this run. */ }
    return true;
  };

  const refreshLobbies = async () => {
    try { setLobbies(await listPublicLobbies()); setError(null); }
    catch { setError('Servers are unavailable right now. Try again in a moment.'); }
  };

  useEffect(() => {
    void refreshLobbies();
    const timer = window.setInterval(() => void refreshLobbies(), 2_500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => () => {
    if (!handedOffRef.current) {
      sessionRef.current?.close();
      hostedLobbyRef.current?.close();
      joinRef.current?.close();
      window.clearTimeout(connectionTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (mode !== 'guest' || connectedPeers(peers) === 0 || readySentRef.current) return;
    window.clearTimeout(connectionTimeoutRef.current);
    const delivered = sessionRef.current?.sendEvent({ type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: spectatingRef.current ? 'spectate' : 'ready', payload: spectatingRef.current ? undefined : localPlayerRef.current });
    if (!delivered) return;
    readySentRef.current = true;
    setStatus(spectatingRef.current ? 'Loading match…' : 'Ready — waiting for the host to start.');
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
      onError: () => setError('Couldn’t connect to this server. Try another one.'),
      onEvent: (peerId, event) => {
        if (event.event === 'ready' && role === 'host') {
          const player = parsePlayer(event.payload);
          if (!player) return;
          peerPlayerIdsRef.current[peerId] = player.id;
          const next = guestPlayersRef.current.some(item => item.id === player.id)
            ? guestPlayersRef.current
            : [...guestPlayersRef.current, { ...player, color: guestColor(guestPlayersRef.current.length) }];
          guestPlayersRef.current = next;
          setGuestPlayers(next);
          hostedLobbyRef.current?.update(next.length + 1, 'waiting');
          setStatus(`${player.label} joined. You can start the match.`);
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
    setError(null);
    return session;
  };

  const hostSquad = async () => {
    if (!applyNickname()) return;
    spectatingRef.current = false;
    setLoading(true);
    setError(null);
    setStatus('Creating server…');
    try {
      const [session, lobby] = await Promise.all([createSession('host'), HostedLobby.create(localPlayerRef.current.label)]);
      hostedLobbyRef.current?.close();
      hostedLobbyRef.current = lobby;
      lobby.setStatusListener(setStatus);
      lobby.start(session);
      lobby.update(1, 'waiting');
      setMode('host');
      setStatus('Your server is live. Waiting for players.');
    } catch (reason) {
      setError('Couldn’t create a server. Try again.');
    } finally { setLoading(false); }
  };

  const joinSquad = async (room: PublicLobby) => {
    if (!applyNickname()) return;
    spectatingRef.current = room.state === 'in_game';
    setLoading(true);
    setMode('guest');
    setError(null);
    setStatus(room.state === 'in_game' ? `Spectating ${room.hostName}…` : `Joining ${room.hostName}…`);
    try {
      const [session, join] = await Promise.all([createSession('guest'), LobbyJoin.create(room.id, localPlayerRef.current.label, spectatingRef.current)]);
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
        setError('Couldn’t connect to this server. Try another one.');
        setMode('choose');
        setStatus('');
      }, 30_000);
    } catch (reason) {
      window.clearTimeout(connectionTimeoutRef.current);
      setError('This server is no longer available. Choose another one.');
      setStatus('');
      setMode('choose');
    } finally { setLoading(false); }
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

  const close = () => {
    window.clearTimeout(connectionTimeoutRef.current);
    sessionRef.current?.close(); hostedLobbyRef.current?.close(); joinRef.current?.close(); onClose();
  };

  return (
    <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/85 p-4 backdrop-blur-xl">
      <section className="w-full max-w-3xl overflow-hidden border border-cyan-400/35 bg-[#070c13] shadow-[0_0_70px_rgba(0,240,255,0.18)]">
        <header className="flex items-start justify-between border-b border-cyan-400/20 bg-cyan-500/[0.06] px-6 py-5">
          <div className="flex items-center gap-4"><div className="flex h-11 w-11 items-center justify-center border border-cyan-300/50 bg-cyan-400/10 text-cyan-200"><Radio size={21} /></div><h2 className="text-xl font-black tracking-[0.16em] text-white">MULTIPLAYER</h2></div>
          <button onClick={close} aria-label="Close multiplayer" className="p-2 text-white/45 transition hover:bg-white/10 hover:text-white"><X size={19} /></button>
        </header>
        <div className="grid gap-5 p-6 md:grid-cols-[1fr_220px]">
          <div>
            {mode === 'choose' && <>
              <label className="mb-5 block border border-cyan-300/25 bg-cyan-400/[0.045] p-3"><span className="block text-[9px] font-black uppercase tracking-[0.18em] text-cyan-200">Your name</span><input value={nickname} onChange={event => { setNickname(event.target.value); setError(null); }} onBlur={() => setNickname(normalizeNickname(nickname))} maxLength={16} autoComplete="nickname" placeholder="Enter name" className="mt-2 w-full border-b border-white/15 bg-transparent pb-1 text-sm font-black uppercase tracking-wider text-white outline-none placeholder:text-white/25 focus:border-cyan-300" /></label>
              <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white"><Server size={14} className="text-cyan-300" /> Servers <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[9px] tracking-wider text-emerald-200">{lobbies.length} ONLINE</span></div><button onClick={() => void refreshLobbies()} className="flex items-center gap-1 border border-white/10 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-cyan-200 transition hover:border-cyan-300/40 hover:text-white"><RefreshCw size={12} /> Refresh</button></div>
              <div className="space-y-2">{lobbies.length === 0 ? <div className="border border-dashed border-white/15 bg-[radial-gradient(circle_at_center,rgba(34,211,238,.09),transparent_58%)] px-5 py-12 text-center"><Server size={24} className="mx-auto text-cyan-300/65" /><div className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-white/70">No servers online</div></div> : lobbies.map((room, index) => <button key={room.id} disabled={loading || !nicknameValid} onClick={() => void joinSquad(room)} className="group relative flex w-full items-center gap-4 overflow-hidden border border-white/10 bg-[#0a101a] p-3 text-left transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/55 hover:bg-cyan-400/[0.07] hover:shadow-[0_0_24px_rgba(34,211,238,.12)] disabled:opacity-45"><div className={`absolute inset-y-0 left-0 w-1 ${room.state === 'in_game' ? 'bg-fuchsia-400' : 'bg-emerald-400'}`} /><div className="ml-1 flex h-11 w-11 shrink-0 items-center justify-center border border-white/15 bg-white/[0.04] text-sm font-black text-cyan-100">{room.hostName.slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><div className="truncate text-sm font-black uppercase tracking-wider text-white">{room.hostName}</div>{index === 0 && <Crown size={13} className="shrink-0 text-amber-300" />}</div><div className={`mt-1 text-[9px] font-black uppercase tracking-[0.14em] ${room.state === 'in_game' ? 'text-fuchsia-200' : 'text-emerald-200'}`}>{room.state === 'in_game' ? '● In progress' : '● Open lobby'}</div></div><div className="text-right"><div className="font-mono text-sm font-black text-white">{room.playerCount}<span className="text-white/35">/{room.maxPlayers}</span></div><div className="mt-1 flex items-center justify-end gap-1 text-[10px] font-black uppercase tracking-wider text-cyan-200 transition group-hover:text-white">{room.state === 'in_game' ? 'Spectate' : 'Join'} <ChevronRight size={13} className="transition group-hover:translate-x-0.5" /></div></div></button>)}</div>
              <button disabled={loading || !nicknameValid} onClick={() => void hostSquad()} className="mt-5 flex w-full items-center justify-center gap-2 border border-cyan-300/45 bg-cyan-400/15 px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-cyan-100 transition hover:bg-cyan-400/25 disabled:opacity-45"><Wifi size={14} /> Create server</button>
            </>}
            {mode === 'host' && <div className="border border-cyan-300/25 bg-cyan-400/[0.04] p-5"><div className="text-sm font-black uppercase tracking-wider text-white">SERVER ONLINE</div><button onClick={launchHost} className="mt-5 border border-emerald-300/45 bg-emerald-400/15 px-4 py-2.5 text-[11px] font-black uppercase tracking-wider text-emerald-100 transition hover:bg-emerald-400/25">Start match · {guestPlayers.length + 1} {guestPlayers.length === 0 ? 'player' : 'players'}</button></div>}
            {mode === 'guest' && <div className="border border-fuchsia-300/25 bg-fuchsia-400/[0.04] p-5"><div className="text-sm font-black uppercase tracking-wider text-white">CONNECTING</div></div>}
            {status && <p className="mt-5 text-xs font-medium leading-relaxed text-cyan-100/75">{status}</p>}
            {error && <p role="alert" className="mt-3 border border-red-400/35 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</p>}
          </div>
          <aside className="border border-white/10 bg-black/25 p-4"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/50"><Users size={13} /> Players</div><div className="mt-4 text-3xl font-black text-cyan-200">{connectedPeers(peers) + (mode === 'host' ? 1 : 0)}<span className="text-base text-white/30"> / 4</span></div><div className="mt-5 space-y-2">{peers.length === 0 ? <p className="text-xs leading-relaxed text-white/40">{mode === 'host' ? 'Waiting for players.' : 'Select a server.'}</p> : peers.map((peer, index) => <div key={peer.peerId} className="flex items-center justify-between border border-white/10 bg-white/[0.03] px-2 py-2 text-[10px]"><span className="text-white/60">Player {index + 1}</span><span className={peer.state === 'connected' ? 'text-emerald-300' : 'text-amber-200'}>{playerState(peer.state)}</span></div>)}</div></aside>
        </div>
      </section>
    </div>
  );
}

function connectedPeers(peers: MultiplayerPeerInfo[]) { return peers.filter(peer => peer.state === 'connected').length; }
function createLocalId() { const values = new Uint32Array(1); crypto.getRandomValues(values); return `operator-${values[0].toString(36)}`; }
function parsePlayer(value: unknown): CoopPlayerSeed | null { if (!value || typeof value !== 'object') return null; const player = value as Partial<CoopPlayerSeed>; return typeof player.id === 'string' && typeof player.label === 'string' && typeof player.color === 'string' ? { id: player.id, label: player.label.slice(0, 24), color: player.color } : null; }
function parsePlayers(value: unknown, minimumPlayers: number = 2): CoopPlayerSeed[] | null { if (!Array.isArray(value) || value.length < minimumPlayers || value.length > 4) return null; const players = value.map(parsePlayer); return players.every((player): player is CoopPlayerSeed => player !== null) ? players : null; }
function guestColor(index: number) { return ['#f472b6', '#a78bfa', '#fbbf24'][index % 3]; }
function playerState(state: RTCPeerConnectionState) { return state === 'connected' ? 'Ready' : state === 'connecting' ? 'Joining' : state === 'disconnected' ? 'Reconnecting' : 'Left'; }
function normalizeNickname(value: string) { return value.replace(/[^a-z0-9 _-]/gi, '').replace(/\s+/g, ' ').trim().slice(0, 16); }
function savedNickname() { try { return normalizeNickname(localStorage.getItem('killsync.multiplayer.nickname') || ''); } catch { return ''; } }
