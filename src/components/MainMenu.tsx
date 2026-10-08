import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, ChevronRight, Coins, Crosshair, Database, ExternalLink, Maximize, Minimize, MoreHorizontal, Settings2, Skull, Sprout, Sun, Trophy } from 'lucide-react';
import type { CoopGameMode } from '../game/multiplayer/CoopGameMode';
import type { GameState } from '../types';
import { friendsAudio } from '../game/FriendsAudio';
import { soundManager } from '../game/SoundManager';
import './main-menu.css';

export interface MainMenuProps {
  onEnterMode: (mode: CoopGameMode) => void;
  onNavigate: (state: GameState) => void;
  onAdmin: () => void;
  onFullscreen: () => void;
  onToggleNightmare: () => void;
  isFullscreen: boolean;
  nightmareMode: boolean;
  accountLevel: number;
  maxAccountLevel: number;
  accountXP: number;
  accountXPRequired: number;
  lastXPGain: number;
  achievementCount: number;
  achievementTotal: number;
  coins: number;
  dataCores: number;
  playerLevel: number;
  operatorName: string;
  upgradeCount: number;
  returnFocus?: string;
  onRememberFocus: (action: string) => void;
}

export function MainMenu(p: MainMenuProps) {
  const root = useRef<HTMLDivElement>(null);
  const handoff = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const releaseAudio = useRef<(() => void) | undefined>(undefined);
  const selecting = useRef(false);
  const [selected, setSelected] = useState<CoopGameMode | null>(null);
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (p.returnFocus) {
      const button = root.current?.querySelector<HTMLButtonElement>(`[data-menu-action="${p.returnFocus}"]`);
      const disclosure = button?.closest('details');
      if (disclosure) disclosure.open = true;
      button?.focus({ preventScroll: true });
    }
    return () => { clearTimeout(handoff.current); releaseAudio.current?.(); };
  }, []);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      root.current?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(details => {
        details.open = false;
        (details.querySelector('summary') as HTMLElement | null)?.focus();
      });
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.two-worlds-menu details')) return;
      root.current?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(details => { details.open = false; });
    };
    window.addEventListener('keydown', close);
    window.addEventListener('pointerdown', outside);
    return () => { window.removeEventListener('keydown', close); window.removeEventListener('pointerdown', outside); };
  }, []);

  const toggleDisclosure = (current: HTMLDetailsElement) => {
    if (current.open) root.current?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(details => { if (details !== current) details.open = false; });
  };

  const remember = (action: string) => p.onRememberFocus(action);
  const navigate = (state: GameState, action = state) => {
    if (selecting.current) return;
    remember(action);
    soundManager.playUIClick();
    p.onNavigate(state);
  };
  const enter = (mode: CoopGameMode) => {
    if (selecting.current) return;
    selecting.current = true;
    root.current?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(details => { details.open = false; });
    remember(mode);
    setSelected(mode);
    if (mode === 'friends') {
      releaseAudio.current = friendsAudio.acquire();
      friendsAudio.activate();
      friendsAudio.play('click', .22);
    } else soundManager.playUIClick();
    handoff.current = setTimeout(() => p.onEnterMode(mode), reducedMotion ? 0 : 360);
  };
  const progress = p.accountLevel >= p.maxAccountLevel ? 100 : Math.max(0, Math.min(100, p.accountXP / Math.max(1, p.accountXPRequired) * 100));

  return <div ref={root} className={`two-worlds-menu${selected ? ` two-worlds-menu--entering-${selected}` : ''}`} aria-label="Main menu" aria-busy={Boolean(selected)}>
    <header className="two-worlds-menu__header">
      <span className="two-worlds-menu__wordmark">Two worlds</span>
      <span className="two-worlds-menu__prompt">Choose your world</span>
    </header>

    <main className="two-worlds-menu__worlds">
      <section className="two-worlds-menu__world two-worlds-menu__friends" aria-labelledby="sunline-title" inert={selected === 'survival'}>
        <div className="two-worlds-menu__island" aria-hidden="true"/>
        <div className="two-worlds-menu__wash" aria-hidden="true"/>
        <div className="two-worlds-menu__identity">
          <p className="two-worlds-menu__eyebrow"><Sprout size={16}/>Friends mode</p>
          <h1 id="sunline-title" className="two-worlds-menu__sr">Sunline — Friends mode</h1>
        </div>
        <div className="two-worlds-menu__content">
          <h2>A little adventure,<br/><em>together.</em></h2>
          <p className="two-worlds-menu__description">Mine, build, fly and see where<br className="two-worlds-menu__linebreak"/> the day takes you.</p>
          <button type="button" className="two-worlds-menu__entry" data-menu-action="friends" onClick={() => enter('friends')} disabled={Boolean(selected)} aria-label="Let's play — Friends mode"><span>Let's play</span><ArrowUpRight size={19}/></button>
          <div className="two-worlds-menu__world-footer">
            <p className="two-worlds-menu__support">Your island. Your people. Your pace.<Sun size={17} aria-hidden="true"/></p>
          </div>
        </div>
      </section>

      <section className="two-worlds-menu__world two-worlds-menu__survival" aria-labelledby="survival-title" inert={selected === 'friends'}>
        <div className="two-worlds-menu__city" aria-hidden="true"/>
        <div className="two-worlds-menu__wash" aria-hidden="true"/>
        <div className="two-worlds-menu__identity">
          <p className="two-worlds-menu__eyebrow"><Crosshair size={16}/>KILLSYNC / Survival</p>
          <h1 id="survival-title" className="two-worlds-menu__brand">SURVIVAL</h1>
          <p className="two-worlds-menu__subbrand">Reality breach // Co-op survival</p>
        </div>
        <div className="two-worlds-menu__content">
          <h2>Enter the breach.</h2>
          <p className="two-worlds-menu__description">Link your squad. Rewrite the battlefield.<br className="two-worlds-menu__linebreak"/> Survive the swarm.</p>
          <button type="button" className="two-worlds-menu__entry" data-menu-action="survival" onClick={() => enter('survival')} onMouseEnter={() => soundManager.playUIHover()} disabled={Boolean(selected)}><span>Enter the breach</span><ArrowRight size={19}/></button>
          <div className="two-worlds-menu__world-footer">
            <div className="two-worlds-menu__support"><span>Co-op survival</span><button type="button" data-menu-action="SOLO_SETUP" onClick={() => navigate('SOLO_SETUP')} disabled={Boolean(selected)}>Solo Recon<ChevronRight size={14}/></button></div>
            <nav className="two-worlds-menu__preparation" aria-label="Survival preparation">
              <button type="button" data-menu-action="OPERATOR_SELECT" onClick={() => navigate('OPERATOR_SELECT')} disabled={Boolean(selected)} title={`Active operator: ${p.operatorName}`}>Operators</button>
              <button type="button" data-menu-action="PERMANENT_UPGRADES" onClick={() => navigate('PERMANENT_UPGRADES')} disabled={Boolean(selected)} title={`${p.upgradeCount} upgrades`}>Neural Lab</button>
              <button type="button" data-menu-action="INTEL_ARCHIVE" onClick={() => navigate('INTEL_ARCHIVE')} disabled={Boolean(selected)}>Intel Archive</button>
            </nav>
            <div className="two-worlds-menu__resources">
              <span aria-label={`${p.coins} coins`}><Coins size={13}/>{p.coins.toLocaleString()}</span>
              <span aria-label={`${p.dataCores} data cores`}><Database size={13}/>{p.dataCores.toLocaleString()} cores</span>
              <span>Lv {p.playerLevel}</span>
              <button type="button" className="two-worlds-menu__nightmare" onClick={() => { if (!selecting.current) { p.onToggleNightmare(); soundManager.playUIClick(); } }} aria-pressed={p.nightmareMode} disabled={Boolean(selected)}><Skull size={13}/>Nightmare <span>{p.nightmareMode ? 'On' : 'Off'}</span></button>
            </div>
          </div>
        </div>
      </section>
    </main>

    <footer className="two-worlds-menu__utilities" inert={Boolean(selected)}>
      <button type="button" data-menu-action="SETTINGS" onClick={() => navigate('SETTINGS')} disabled={Boolean(selected)}><Settings2 size={15}/>Settings</button>
      <button type="button" onClick={p.onFullscreen} disabled={Boolean(selected)} aria-label={p.isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>{p.isFullscreen ? <Minimize size={15}/> : <Maximize size={15}/>}<span>Fullscreen</span></button>
      <details className="two-worlds-menu__profile" onToggle={event => { setProfileOpen(event.currentTarget.open); toggleDisclosure(event.currentTarget); }}>
        <summary aria-label={`Account level ${p.accountLevel} and achievements`}><Trophy size={14}/><span>Account · Lv {p.accountLevel}</span></summary>
        <div className="two-worlds-menu__popover" inert={!profileOpen || Boolean(selected)}>
          <div className="two-worlds-menu__profile-heading"><strong>Profile level</strong><span>Lv {p.accountLevel} / {p.maxAccountLevel}</span></div>
          <progress value={progress} max={100} aria-label="Account experience"/>
          <div className="two-worlds-menu__xp"><span>{p.accountLevel >= p.maxAccountLevel ? 'Max level' : `${p.accountXP} / ${p.accountXPRequired} XP`}</span>{p.lastXPGain > 0 && <span>+{p.lastXPGain} XP</span>}</div>
          <button type="button" data-menu-action="ACHIEVEMENTS" onClick={() => navigate('ACHIEVEMENTS')} disabled={Boolean(selected)}><Trophy size={15}/>Achievements<span>{p.achievementCount} / {p.achievementTotal}</span><ChevronRight size={14}/></button>
        </div>
      </details>
      <details className="two-worlds-menu__tools" onToggle={event => toggleDisclosure(event.currentTarget)}>
        <summary aria-label="More menu options"><MoreHorizontal size={19}/></summary>
        <div className="two-worlds-menu__popover"><button type="button" data-menu-action="admin" onClick={() => { if (!selecting.current) { remember('admin'); soundManager.playUIClick(); p.onAdmin(); } }} disabled={Boolean(selected)}>Admin Dashboard<ChevronRight size={14}/></button><a href="https://www.webaanzee.be" target="_blank" rel="noopener noreferrer">by webaanzee.be<ExternalLink size={13}/></a></div>
      </details>
    </footer>
    <span className="two-worlds-menu__sr" role="status">{selected ? `Opening ${selected === 'friends' ? 'Friends' : 'Survival'} mode` : ''}</span>
  </div>;
}
