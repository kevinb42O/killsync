import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Bookmark, Check, Copy, DoorOpen, Globe, Leaf, Link2, LoaderCircle, MapPin, Moon, Pause, Play, RefreshCw, Sprout, Users } from 'lucide-react';
import type { CoopPlayerSeed } from '../game/multiplayer/CoopSimulation';
import type { PublicLobby } from '../game/multiplayer/LobbySignaling';
import { COOP_MAX_PLAYERS } from '../game/multiplayer/protocol';
import { readFriendsWorld } from '../game/multiplayer/FriendsWorldStorage';
import type { CoopLanguage } from '../game/multiplayer/i18n';
import { FriendsMenuBackdrop } from './FriendsMenuBackdrop';
import { friendsAudio } from '../game/FriendsAudio';
import { friendsMenuText } from './FriendsMenuText';
import './friends-menu.css';

export type FriendsSetupMode = 'choose' | 'host' | 'guest' | 'direct_host' | 'direct_guest';
export interface FriendsModeSetupProps {
  mode: FriendsSetupMode; language: CoopLanguage; nickname: string; nicknameValid: boolean;
  codeInput: string; roomCode: string; lobbies: PublicLobby[]; localPlayer: CoopPlayerSeed;
  guestPlayers: CoopPlayerSeed[]; rosterPlayers: CoopPlayerSeed[]; connected: boolean; spectating: boolean;
  loading: boolean; discoveryLoading: boolean; discoveryError: boolean; status: string; error: string | null;
  copiedCode: boolean; copiedLink: boolean; offerCode: string; answerCode: string; initialRoomCode?: string;
  onNickname: (name: string) => void; onNormalizeNickname: () => void; onCode: (code: string) => void;
  onLanguage: (language: CoopLanguage) => void; onClose: () => void; onLeave: () => void;
  onHost: () => void; onSolo: () => void; onJoinCode: () => void; onJoinRoom: (room: PublicLobby) => void;
  onRefresh: () => void; onLaunch: () => void; onCopyCode: () => void; onCopyLink: () => void;
  onManualHost: () => void; onManualGuest: () => void; onOffer: (text: string) => void; onAnswer: (text: string) => void;
  onCreateAnswer: () => void; onAcceptAnswer: () => void; onCopyText: (text: string) => void;
}

function initialPaused() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
  try { return localStorage.getItem('killsync.friends.menu.pause') === 'true'; } catch { return false; }
}

export function FriendsModeSetup(p: FriendsModeSetupProps) {
  useEffect(() => friendsAudio.acquire(), []);
  const [view, setView] = useState<'welcome' | 'join'>(p.initialRoomCode ? 'join' : 'welcome');
  const [paused, setPaused] = useState(initialPaused);
  const [nameTouched, setNameTouched] = useState(false);
  const [save] = useState(() => readFriendsWorld());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const t = (key: Parameters<typeof friendsMenuText>[1], params?: Record<string, string | number>) => friendsMenuText(p.language, key, params);
  const goBack = () => {
    if (p.mode !== 'choose' || p.loading) { setView(p.mode === 'guest' || p.mode === 'direct_guest' ? 'join' : 'welcome'); p.onLeave(); }
    else if (view === 'join') setView('welcome');
    else p.onClose();
  };
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); menuRef.current?.scrollTo({ top: 0 }); }, [view, p.mode]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopImmediatePropagation(); goBack();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [p.mode, p.loading, view, p.onLeave, p.onClose]);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => { if (preference.matches) setPaused(true); };
    preference.addEventListener('change', onChange);
    return () => preference.removeEventListener('change', onChange);
  }, []);
  const toggleScenery = () => {
    const next = !paused; setPaused(next);
    try { localStorage.setItem('killsync.friends.menu.pause', String(next)); } catch { /* Optional preference */ }
  };
  const names = p.mode === 'host' || p.mode === 'direct_host' ? [p.localPlayer, ...p.guestPlayers] : p.rosterPlayers;
  const roster = <div className="friends-menu__people">
    <div className="friends-menu__section-title"><h3>{t('roster')}</h3><span>{t('of', { current: names.length, max: COOP_MAX_PLAYERS })}</span></div>
    <ul>{names.map((player, index) => <li key={player.id}>
      <span className="friends-menu__avatar" aria-hidden="true">{[...player.label][0]?.toLocaleUpperCase() || '?'}</span>
      <span className="friends-menu__person"><strong>{player.label}</strong><small>{player.id === p.localPlayer.id ? t('you') : t('connected')}</small></span>
      {index === 0 && <span className="friends-menu__host-tag">{t('hostLabel')}</span>}
    </li>)}</ul>
    {(p.mode === 'host' || p.mode === 'direct_host') && names.length < COOP_MAX_PLAYERS && <div className="friends-menu__empty-slot"><Users size={18}/>{t('emptySlot', { count: COOP_MAX_PLAYERS - names.length })}</div>}
  </div>;
  const nameField = <div className="friends-menu__name">
    <label htmlFor="friends-name">{t('name')}</label>
    <input id="friends-name" autoComplete="nickname" value={p.nickname} maxLength={16} minLength={2} required placeholder={t('namePlaceholder')}
      aria-invalid={nameTouched && !p.nicknameValid} aria-describedby={nameTouched && !p.nicknameValid ? 'friends-name-help' : undefined}
      onChange={event => p.onNickname(event.target.value)} onBlur={() => { setNameTouched(true); p.onNormalizeNickname(); }} disabled={p.loading}/>
    {nameTouched && !p.nicknameValid && <small id="friends-name-help" className="friends-menu__field-help">{t('nameHelp')}</small>}
  </div>;
  const title = (text: string) => <h2 ref={headingRef} tabIndex={-1}>{text}</h2>;
  return <div className="friends-menu" ref={menuRef} aria-label={t('mode')} onPointerDown={event => event.stopPropagation()} onClickCapture={event => { if ((event.target as HTMLElement).closest('button')) friendsAudio.play('click', .22); }}>
    <FriendsMenuBackdrop paused={paused}/>
    <div className="friends-menu__layout">
      <header className="friends-menu__header">
        <div className="friends-menu__brand"><button type="button" className="friends-menu__back" onClick={goBack} aria-label={p.mode === 'choose' && view === 'welcome' ? t('close') : t('back')}><ArrowLeft size={19}/></button><Leaf size={21} aria-hidden="true"/><span>{t('mode')}</span></div>
        <div className="friends-menu__utilities">
          <label className="friends-menu__language"><Globe size={16} aria-hidden="true"/><span className="friends-menu__sr">{t('language')}</span><select aria-label={t('language')} value={p.language} onChange={event => p.onLanguage(event.target.value as CoopLanguage)}><option value="en">English</option><option value="ru">Русский</option></select></label>
          <button type="button" className="friends-menu__motion" onClick={toggleScenery} aria-label={t(paused ? 'resume' : 'pause')} aria-pressed={paused}>{paused ? <Play size={16}/> : <Pause size={16}/>}<span>{t(paused ? 'resume' : 'pause')}</span></button>
        </div>
      </header>
      <main className="friends-menu__main">
        <section className="friends-menu__panel" aria-labelledby="friends-menu-label">
          <div className="friends-menu__eyebrow" id="friends-menu-label"><Sprout size={18} aria-hidden="true"/>Sunline <span>·</span> {t('mode')}</div>
          {p.mode === 'choose' && view === 'welcome' && <>
            {title(t('title'))}<p className="friends-menu__intro">{t('intro')}</p>
            <form onSubmit={event => { event.preventDefault(); p.onHost(); }}>
              {nameField}
              <div className="friends-menu__save"><Bookmark size={19} aria-hidden="true"/><div><strong>{t(save ? 'continue' : 'first')}</strong><small>{save ? `${t('saved')}${Number.isFinite(save.savedAt) ? ` · ${new Intl.DateTimeFormat(p.language === 'ru' ? 'ru' : 'en', { month: 'short', day: 'numeric' }).format(new Date(save.savedAt))}` : ''}` : t('firstHelp')}</small></div></div>
              <div className="friends-menu__actions">
                <button type="submit" className="friends-menu__primary" disabled={p.loading || !p.nicknameValid}>{p.loading ? <LoaderCircle className="friends-menu__spinner" size={19}/> : <DoorOpen size={19}/>}<span>{t(p.loading ? 'hosting' : 'host')}</span><ArrowUpRight size={18}/></button>
                <button type="button" className="friends-menu__secondary" disabled={p.loading} onClick={() => setView('join')}>{t('join')}</button>
                <button type="button" className="friends-menu__text-button" disabled={p.loading || !p.nicknameValid} onClick={p.onSolo}>{t('solo')}<ArrowUpRight size={15}/></button>
              </div>
            </form>
            <p className="friends-menu__note">{t('publicNote')}</p>
            {p.loading && <button className="friends-menu__text-button" type="button" onClick={p.onLeave}>{t('cancel')}</button>}
          </>}
          {p.mode === 'choose' && view === 'join' && <>
            {title(t('joinTitle'))}<p className="friends-menu__intro">{t('joinIntro')}</p>
            <form onSubmit={event => { event.preventDefault(); p.onJoinCode(); }}>
              {nameField}<label htmlFor="friends-room-code">{t('roomCode')}</label>
              <div className="friends-menu__join-code"><input id="friends-room-code" value={p.codeInput} onChange={event => p.onCode(event.target.value)} placeholder={t('codePlaceholder')} autoComplete="off" autoCapitalize="characters" spellCheck={false}/><button type="submit" className="friends-menu__primary" disabled={p.loading || !p.nicknameValid || !p.codeInput.trim()}>{t('joinAction')}<ArrowUpRight size={16}/></button></div>
            </form>
            <div className="friends-menu__section-title"><h3>{t('openIslands')}</h3><button type="button" className="friends-menu__icon-button" onClick={p.onRefresh} aria-label={t('refresh')} disabled={p.discoveryLoading}><RefreshCw size={17} className={p.discoveryLoading ? 'friends-menu__spinner' : ''}/></button></div>
            <div className="friends-menu__rooms">
              {p.discoveryError ? <div className="friends-menu__empty"><strong>{t('discoveryError')}</strong><p>{t('discoveryHelp')}</p><button className="friends-menu__text-button" onClick={p.onRefresh}>{t('tryAgain')}</button></div> : p.lobbies.length === 0 ? <div className="friends-menu__empty"><Users size={24} aria-hidden="true"/><strong>{t(p.discoveryLoading ? 'online' : 'empty')}</strong><p>{t('emptyHelp')}</p></div> : p.lobbies.map(room => {
                const inGame = room.state === 'in_game', full = room.playerCount >= room.maxPlayers;
                return <div key={room.id} className="friends-menu__room"><div><strong title={room.hostName}>{t('island', { name: room.hostName })}</strong><small>{t('of', { current: room.playerCount, max: room.maxPlayers })} · {t(full ? 'full' : inGame ? 'exploring' : 'gathering')}</small></div><button className="friends-menu__room-action" type="button" disabled={p.loading || !p.nicknameValid || full} onClick={() => p.onJoinRoom(room)}>{t(full ? 'full' : 'joinAction')}</button></div>;
              })}
            </div>
            <details className="friends-menu__help"><summary>{t('help')}</summary><p>{t('helpIntro')}</p><div><button type="button" className="friends-menu__secondary" onClick={p.onManualHost} disabled={p.loading || !p.nicknameValid}>{t('manualHost')}</button><button type="button" className="friends-menu__secondary" onClick={p.onManualGuest} disabled={p.loading || !p.nicknameValid}>{t('manualGuest')}</button></div></details>
          </>}
          {p.mode === 'host' && <>
            {title(t('hostTitle'))}<p className="friends-menu__intro">{t('hostIntro')}</p>
            <label>{t('roomCode')}</label><div className="friends-menu__invite-code"><strong>{p.roomCode}</strong><button type="button" onClick={p.onCopyCode} aria-label={t(p.copiedCode ? 'copied' : 'copyCode')}>{p.copiedCode ? <Check size={17}/> : <Copy size={17}/>}<span>{t(p.copiedCode ? 'copied' : 'copyCode')}</span></button></div>
            <button type="button" className="friends-menu__secondary" onClick={p.onCopyLink}>{p.copiedLink ? <Check size={18}/> : <Link2 size={18}/>} {t(p.copiedLink ? 'linkCopied' : 'copyLink')}</button>
            {roster}<button className="friends-menu__primary" type="button" onClick={p.onLaunch} disabled={p.loading}>{t('launch')}<ArrowUpRight size={18}/></button>
            <button className="friends-menu__text-button" type="button" onClick={() => { setView('welcome'); p.onLeave(); }}>{t('closeRoom')}</button><p className="friends-menu__note">{t('hostSave')}</p>
          </>}
          {p.mode === 'guest' && <>
            {title(t(p.spectating ? 'watchTitle' : p.connected ? 'guestTitle' : 'connectingTitle'))}<p className="friends-menu__intro">{t(p.spectating ? 'watchIntro' : p.connected ? 'guestIntro' : 'connectingIntro')}</p>
            <div className="friends-menu__connection"><span>{p.connected ? <Check size={20}/> : <LoaderCircle size={20} className="friends-menu__spinner"/>}</span><div><small>{t('roomCode')}</small><strong>{p.roomCode}</strong></div></div>
            {names.length > 0 && roster}<button className="friends-menu__secondary" type="button" onClick={() => { setView('join'); p.onLeave(); }}>{t(p.connected ? 'leave' : 'cancel')}</button><p className="friends-menu__note">{t('hostSave')}</p>
          </>}
          {p.mode === 'direct_host' && <>
            {title(t('manualHostTitle'))}<p className="friends-menu__intro">{t('helpIntro')}</p>
            <label htmlFor="friends-offer">{t('offer')}</label><textarea id="friends-offer" readOnly value={p.offerCode}/><button className="friends-menu__secondary" onClick={() => p.onCopyText(p.offerCode)}>{t('copyCode')}</button>
            <label htmlFor="friends-answer">{t('answer')}</label><textarea id="friends-answer" value={p.answerCode} onChange={event => p.onAnswer(event.target.value)}/><button className="friends-menu__secondary" disabled={p.loading || !p.answerCode.trim()} onClick={p.onAcceptAnswer}>{t('acceptAnswer')}</button>
            {roster}<button className="friends-menu__primary" onClick={p.onLaunch} disabled={p.loading}>{t('launch')}<ArrowUpRight size={18}/></button><button className="friends-menu__text-button" disabled={p.loading || names.length >= COOP_MAX_PLAYERS} onClick={p.onManualHost}>{t('nextInvite')}</button>
          </>}
          {p.mode === 'direct_guest' && <>
            {title(t('manualGuestTitle'))}<p className="friends-menu__intro">{t('helpIntro')}</p>
            <label htmlFor="friends-offer">{t('pasteOffer')}</label><textarea id="friends-offer" value={p.offerCode} onChange={event => p.onOffer(event.target.value)} disabled={p.connected}/><button className="friends-menu__secondary" disabled={p.loading || !p.offerCode.trim() || p.connected} onClick={p.onCreateAnswer}>{t('createAnswer')}</button>
            {p.answerCode && <><label htmlFor="friends-answer">{t('answerReady')}</label><textarea id="friends-answer" readOnly value={p.answerCode}/><button className="friends-menu__secondary" onClick={() => p.onCopyText(p.answerCode)}>{t('copyAnswer')}</button></>}
            {p.connected && <p className="friends-menu__intro">{t('guestIntro')}</p>}{names.length > 0 && roster}
          </>}
          {p.status && <p className="friends-menu__status" role="status">{p.status}</p>}
          {p.error && <div className="friends-menu__error" role="alert">{p.error}</div>}
        </section>
      </main>
      <footer className="friends-menu__location"><MapPin size={17} aria-hidden="true"/><div><strong>{t('location')}</strong><span>{t('locationDetail')}</span></div><Moon size={17} aria-hidden="true"/></footer>
    </div>
  </div>;
}
