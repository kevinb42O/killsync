import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Crown, Radio, RefreshCw, Server, Users, Wifi, X } from 'lucide-react';
import { ManualWebRTCSession } from '../game/multiplayer/ManualWebRTCSession';
import { HostedLobby, LobbyJoin, PublicLobby, fetchIceServers, listPublicLobbies } from '../game/multiplayer/LobbySignaling';
import { MultiplayerPeerInfo, MULTIPLAYER_PROTOCOL_VERSION } from '../game/multiplayer/protocol';
import { CoopPlayerSeed } from '../game/multiplayer/CoopSimulation';

type SetupMode = 'choose' | 'host' | 'guest' | 'direct_host' | 'direct_guest';

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
  const [offerCode, setOfferCode] = useState('');
  const [answerCode, setAnswerCode] = useState('');
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
    // Vercel/static deployments have no stateful lobby service. Direct co-op
    // below remains fully playable there, so an optional lobby outage should
    // not present as a multiplayer outage.
    catch { setLobbies([]); }
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
    if ((mode !== 'guest' && mode !== 'direct_guest') || connectedPeers(peers) === 0 || readySentRef.current) return;
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

  const createDirectOffer = async () => {
    if (!applyNickname()) return;
    setLoading(true);
    setError(null);
    setStatus('Creating a direct browser-to-browser connection…');
    try {
      const session = await createSession('host');
      setOfferCode(await session.createOffer());
      setAnswerCode('');
      setMode('direct_host');
      setStatus('Send this offer to one friend. When they return an answer, paste it below.');
    } catch {
      setError('Couldn’t create a direct connection. Refresh and try again.');
      setStatus('');
    } finally { setLoading(false); }
  };

  const createDirectAnswer = async () => {
    if (!applyNickname() || !offerCode.trim()) {
      if (!offerCode.trim()) setError('Paste the complete host offer first.');
      return;
    }
    setLoading(true);
    setError(null);
    setStatus('Creating your answer…');
    try {
      const session = await createSession('guest');
      setAnswerCode(await session.acceptOffer(offerCode));
      setMode('direct_guest');
      setStatus('Send your answer back to the host, then wait for them to start the match.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That offer could not be used. Ask the host for a fresh one.');
      setStatus('');
    } finally { setLoading(false); }
  };

  const acceptDirectAnswer = async () => {
    const session = sessionRef.current;
    if (!session || !answerCode.trim()) {
      setError('Paste your friend’s complete answer first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await session.acceptAnswer(answerCode);
      setStatus('Connecting directly to your friend…');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That answer could not be used. Ask your friend for a fresh answer.');
    } finally { setLoading(false); }
  };

  const createAdditionalDirectOffer = async () => {
    const session = sessionRef.current;
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      setOfferCode(await session.createOffer());
      setAnswerCode('');
      setStatus('Send the fresh offer to your next friend.');
    } catch {
      setError('Couldn’t create another direct offer. Refresh and try again.');
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
              <div className="border border-cyan-300/35 bg-cyan-400/[0.08] p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200">Direct co-op · free browser-to-browser</div>
                <p className="mt-2 text-xs leading-relaxed text-white/65">No game server or account needed. The host sends an offer; each friend sends back an answer.</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2"><button disabled={loading || !nicknameValid} onClick={() => void createDirectOffer()} className="flex items-center justify-center gap-2 border border-cyan-300/45 bg-cyan-400/15 px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100 transition hover:bg-cyan-400/25 disabled:opacity-45"><Wifi size={14} /> Host direct match</button><button disabled={loading || !nicknameValid} onClick={() => { setOfferCode(''); setAnswerCode(''); setStatus('Paste the host offer, then create your answer.'); setError(null); setMode('direct_guest'); }} className="flex items-center justify-center gap-2 border border-fuchsia-300/45 bg-fuchsia-400/15 px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-fuchsia-100 transition hover:bg-fuchsia-400/25 disabled:opacity-45"><Users size={14} /> Join direct match</button></div>
              </div>
              <div className="mb-3 mt-5 flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white"><Server size={14} className="text-cyan-300" /> Hosted squads <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[9px] tracking-wider text-emerald-200">{lobbies.length} ONLINE</span></div><button onClick={() => void refreshLobbies()} className="flex items-center gap-1 border border-white/10 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-cyan-200 transition hover:border-cyan-300/40 hover:text-white"><RefreshCw size={12} /> Refresh</button></div>
              <div className="space-y-2">{lobbies.length === 0 ? <div className="border border-dashed border-white/15 bg-[radial-gradient(circle_at_center,rgba(34,211,238,.09),transparent_58%)] px-5 py-12 text-center"><Server size={24} className="mx-auto text-cyan-300/65" /><div className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-white/70">No servers online</div></div> : lobbies.map((room, index) => <button key={room.id} disabled={loading || !nicknameValid} onClick={() => void joinSquad(room)} className="group relative flex w-full items-center gap-4 overflow-hidden border border-white/10 bg-[#0a101a] p-3 text-left transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/55 hover:bg-cyan-400/[0.07] hover:shadow-[0_0_24px_rgba(34,211,238,.12)] disabled:opacity-45"><div className={`absolute inset-y-0 left-0 w-1 ${room.state === 'in_game' ? 'bg-fuchsia-400' : 'bg-emerald-400'}`} /><div className="ml-1 flex h-11 w-11 shrink-0 items-center justify-center border border-white/15 bg-white/[0.04] text-sm font-black text-cyan-100">{room.hostName.slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><div className="truncate text-sm font-black uppercase tracking-wider text-white">{room.hostName}</div>{index === 0 && <Crown size={13} className="shrink-0 text-amber-300" />}</div><div className={`mt-1 text-[9px] font-black uppercase tracking-[0.14em] ${room.state === 'in_game' ? 'text-fuchsia-200' : 'text-emerald-200'}`}>{room.state === 'in_game' ? '● In progress' : '● Open lobby'}</div></div><div className="text-right"><div className="font-mono text-sm font-black text-white">{room.playerCount}<span className="text-white/35">/{room.maxPlayers}</span></div><div className="mt-1 flex items-center justify-end gap-1 text-[10px] font-black uppercase tracking-wider text-cyan-200 transition group-hover:text-white">{room.state === 'in_game' ? 'Spectate' : 'Join'} <ChevronRight size={13} className="transition group-hover:translate-x-0.5" /></div></div></button>)}</div>
              <button disabled={loading || !nicknameValid} onClick={() => void hostSquad()} className="mt-5 flex w-full items-center justify-center gap-2 border border-white/20 bg-white/[0.04] px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-white/70 transition hover:bg-white/[0.08] disabled:opacity-45"><Wifi size={14} /> Create hosted squad</button>
            </>}
            {mode === 'host' && <div className="border border-cyan-300/25 bg-cyan-400/[0.04] p-5"><div className="text-sm font-black uppercase tracking-wider text-white">SERVER ONLINE</div><button onClick={launchHost} className="mt-5 border border-emerald-300/45 bg-emerald-400/15 px-4 py-2.5 text-[11px] font-black uppercase tracking-wider text-emerald-100 transition hover:bg-emerald-400/25">Start match · {guestPlayers.length + 1} {guestPlayers.length === 0 ? 'player' : 'players'}</button></div>}
            {mode === 'guest' && <div className="border border-fuchsia-300/25 bg-fuchsia-400/[0.04] p-5"><div className="text-sm font-black uppercase tracking-wider text-white">CONNECTING</div></div>}
            {mode === 'direct_host' && <div className="space-y-4 border border-cyan-300/25 bg-cyan-400/[0.04] p-5"><div><div className="text-sm font-black uppercase tracking-wider text-white">HOST DIRECT MATCH</div><p className="mt-2 text-xs leading-relaxed text-white/60">Copy this offer to one friend. For another friend, create a fresh offer after connecting the first.</p></div><textarea readOnly value={offerCode} aria-label="Host offer code" className="h-24 w-full resize-none border border-white/15 bg-black/30 p-2 font-mono text-[10px] text-cyan-100 outline-none" /><button onClick={() => void navigator.clipboard?.writeText(offerCode)} className="border border-cyan-300/45 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-cyan-100">Copy offer</button><label className="block text-[10px] font-black uppercase tracking-[0.14em] text-white/60">Friend’s answer<textarea value={answerCode} onChange={event => { setAnswerCode(event.target.value); setError(null); }} aria-label="Friend answer code" className="mt-2 h-24 w-full resize-none border border-white/15 bg-black/30 p-2 font-mono text-[10px] normal-case tracking-normal text-white outline-none focus:border-cyan-300" /></label><button disabled={loading || !answerCode.trim()} onClick={() => void acceptDirectAnswer()} className="border border-emerald-300/45 bg-emerald-400/15 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-emerald-100 disabled:opacity-45">Connect friend</button>{connectedPeers(peers) > 0 && <><button disabled={loading} onClick={() => void createAdditionalDirectOffer()} className="ml-2 border border-cyan-300/45 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-cyan-100 disabled:opacity-45">Add another friend</button><button onClick={launchHost} className="ml-2 border border-emerald-300/45 bg-emerald-400/15 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-emerald-100">Start match · {guestPlayers.length + 1} players</button></>}</div>}
            {mode === 'direct_guest' && <div className="space-y-4 border border-fuchsia-300/25 bg-fuchsia-400/[0.04] p-5"><div><div className="text-sm font-black uppercase tracking-wider text-white">JOIN DIRECT MATCH</div><p className="mt-2 text-xs leading-relaxed text-white/60">Paste the host’s offer, create your answer, then send the answer back to the host.</p></div>{!answerCode && <><textarea value={offerCode} onChange={event => { setOfferCode(event.target.value); setError(null); }} aria-label="Host offer code" placeholder="Paste host offer" className="h-28 w-full resize-none border border-white/15 bg-black/30 p-2 font-mono text-[10px] text-white outline-none focus:border-fuchsia-300" /><button disabled={loading || !offerCode.trim()} onClick={() => void createDirectAnswer()} className="border border-fuchsia-300/45 bg-fuchsia-400/15 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-fuchsia-100 disabled:opacity-45">Create answer</button></>}{answerCode && <><textarea readOnly value={answerCode} aria-label="Your answer code" className="h-28 w-full resize-none border border-white/15 bg-black/30 p-2 font-mono text-[10px] text-fuchsia-100 outline-none" /><button onClick={() => void navigator.clipboard?.writeText(answerCode)} className="border border-fuchsia-300/45 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-fuchsia-100">Copy answer</button></>}</div>}
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
