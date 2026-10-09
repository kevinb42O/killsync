import { FRIENDS_TOOL_ORDER } from '../game/multiplayer/FriendsToolControls';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, ArrowRight, Check, Gamepad2, Headphones, Keyboard, Leaf, LogOut, Monitor, Play, Settings2, Smartphone, Volume2, VolumeX } from 'lucide-react';
import { friendsAudio } from '../game/FriendsAudio';
import { CONTROL_SCHEME_DETAILS, getFriendsSlideBinding, isGamepadControlScheme, isMobileControlScheme, type ControlScheme } from '../game/controls';
import type { LocalGamePreferences } from '../game/LocalGamePreferences';
import type { CinematicProfile } from './CinematicVignetteOverlay';
import './friends-pause.css';

export type PauseTab = 'overview' | 'audio' | 'controls' | 'performance';
export type FriendsPauseMenuProps = {
  host?: boolean;
  controlScheme: ControlScheme; onControlScheme: (scheme: ControlScheme) => void;
  cinematicProfile: CinematicProfile; onCinematicProfile: (profile: CinematicProfile) => void;
  preferences: LocalGamePreferences; onPreferences: (patch: Partial<LocalGamePreferences>) => void;
  onResume: () => void; onExit: () => void; initialTab?: PauseTab;
};
const TABS = [{ id: 'overview', label: 'Your island', icon: Leaf }, { id: 'audio', label: 'Audio', icon: Headphones }, { id: 'controls', label: 'Controls', icon: Keyboard }, { id: 'performance', label: 'Performance', icon: Monitor }] as const;

export function FriendsPauseMenu(p: FriendsPauseMenuProps) {
  const [tab, setTab] = useState<PauseTab>(p.initialTab || 'overview');
  const audio = useSyncExternalStore(friendsAudio.subscribe, friendsAudio.getSettings, friendsAudio.getSettings);
  const dialog = useRef<HTMLDivElement>(null);
  const resume = useRef<HTMLButtonElement>(null);
  useEffect(() => { resume.current?.focus(); }, []);
  const keyboard = !isGamepadControlScheme(p.controlScheme) && !isMobileControlScheme(p.controlScheme);
  const movement = CONTROL_SCHEME_DETAILS[p.controlScheme].bindings;
  const bindings = keyboard ? [
    ['Move', `${movement.up.toUpperCase()} ${movement.left.toUpperCase()} ${movement.down.toUpperCase()} ${movement.right.toUpperCase()} / ↑ ← ↓ →`],
    ['Look', 'Mouse'], ['Empty hands', '1'], ['Raise left / right arm', `${p.controlScheme==='AZERTY'?'A':'Q'} / E`], ['Point left / right arm', 'LMB / RMB'], ['Arms sideways', 'Raise + same mouse button'], ['Campfire wood', 'K'], ['Paint · build mode', 'Y'], ['Grenade · Combat', 'J'], ['Jump / jetpack', 'Space / hold'], ['Sprint', 'Shift'], ['Crouch / slide', getFriendsSlideBinding(p.controlScheme, Boolean(p.host)).replace('control','Ctrl').toUpperCase()],
    ['Use / interact', 'F'], ['Build / piece library', 'B / hold'], ['Tools', `1–${FRIENDS_TOOL_ORDER.length} / wheel`], ['Shovel · dig / fill', 'LMB / RMB'], ['Backpack', 'G'], ['Atlas', 'M'], ['Flashlight', 'V'], ['Night vision', 'N'], ['Train horn · aboard / nearby', 'H'], ...(p.host ? [['Developer settings · host only', 'C / F2']] : []),
  ] : isGamepadControlScheme(p.controlScheme) ? [
    ['Move / look', 'Left / right stick'], ['Jump / jetpack', 'A / hold'], ['Sprint', 'L3'], ['Crouch / slide', 'B'], ['Use / interact', 'Y'], ['Reload', 'X'], ['Fire / aim', 'RT / LT'], ['Shovel · dig / fill', 'RT / LT'], ['Build', 'View'], ['Tools', 'D-pad ← / →'], ['Empty hands · raise left / right', 'LT / RT'], ['Empty hands · point left / right', 'LB / RB'], ['Game menu', 'Start'],
  ] : [['Empty hands · arm gestures', 'Hold arm buttons'], ['Move', 'Left stick'], ['Look', 'Swipe'], ['Jump / jetpack', 'Tap / hold'], ['Sprint / slide', 'Pull / double tap'], ['Use / interact', 'Use'], ['Fire / aim', 'Fire / aim'], ['Shovel · dig / fill', 'Fire / aim'], ['Build', 'Build / place']];
  bindings.push(...(keyboard ? [
    ['Swim · dive / rise', 'Hold Ctrl / Space'], ['Row · stroke / backwater', 'LMB / RMB · one stroke'], ['Rowboat · board / leave', 'F / F or Space'],
  ] : isGamepadControlScheme(p.controlScheme) ? [
    ['Swim · dive / rise', 'Hold B / A'], ['Row · stroke / backwater', 'RT / LT · one stroke'], ['Rowboat · board / leave', 'Y / Y or A'],
  ] : [
    ['Swim · dive / rise', 'Slide / Jump'], ['Row · stroke / backwater', 'Fire / Aim · one stroke'], ['Rowboat · board / leave', 'Use / Use or Jump'],
  ]));
  const chooseTab = (next: PauseTab) => { setTab(next); friendsAudio.play('click', .16); };
  return <div className="friends-pause-backdrop" onPointerDown={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="friends-pause-title" className="friends-pause" onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); p.onResume(); }
      if (event.key === 'Tab') {
        const elements = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, a[href], select, [tabindex="0"]') || [])];
        const first = elements[0], last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <header className="friends-pause__header"><div className="friends-pause__brand"><Leaf size={18}/><span>SUNLINE <i>/</i> FRIENDS</span></div><button ref={resume} type="button" onClick={p.onResume} className="friends-pause__back"><ArrowLeft size={15}/> Back to island <kbd>Esc</kbd></button></header>
      <div className="friends-pause__layout">
        <aside className="friends-pause__sidebar"><span className="friends-pause__eyebrow">A LITTLE BREATHER</span><h1 id="friends-pause-title">Take a<br/>moment.</h1><p>Make yourself at home.</p>
          <nav role="tablist" aria-label="Game settings" aria-orientation="vertical">{TABS.map((item, index) => <button key={item.id} role="tab" type="button" id={`pause-tab-${item.id}`} aria-selected={tab === item.id} aria-controls={`pause-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => chooseTab(item.id)} onKeyDown={event => {
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + TABS.length) % TABS.length;
            chooseTab(TABS[next].id); document.getElementById(`pause-tab-${TABS[next].id}`)?.focus();
          }}><item.icon size={18}/><span>{item.label}</span><ArrowRight size={15}/></button>)}</nav>
          <div className="friends-pause__connected"><span/> Still connected<small>The world keeps moving while you’re here.</small></div>
        </aside>
        <main role="tabpanel" id={`pause-panel-${tab}`} aria-labelledby={`pause-tab-${tab}`} className={`friends-pause__content friends-pause__content--${tab}`} tabIndex={0}>
          {tab === 'overview' && <><div className="friends-pause__section-heading"><span className="friends-pause__eyebrow">ROOM TO WANDER</span><h2>Your next little adventure<br/>is right outside.</h2><p>Settle the sound, find your controls, or give your machine a little breathing room.</p></div><div className="friends-pause__overview-art" aria-hidden="true"><div/><div/><div/><Leaf size={54}/><span>THE ISLAND IS YOURS TO EXPLORE</span></div><button type="button" className="friends-pause__primary" onClick={p.onResume}><Play size={17}/> Continue exploring <ArrowRight size={18}/></button><button type="button" className="friends-pause__leave" onClick={p.onExit}><LogOut size={15}/> Leave island</button><small className="friends-pause__hint">Your local settings save automatically.</small></>}
          {tab === 'audio' && <><div className="friends-pause__section-heading"><span className="friends-pause__eyebrow">THE SOUND OF SUNLINE</span><h2>A quieter kind of adventure.</h2><p>A little piano in the distance. Every footstep and every piece you place, just where you want them.</p></div><div className="friends-pause__rows">
            <label className="friends-pause__slider"><div><span><Headphones size={19}/> Music</span><output>{Math.round(audio.music * 100)}<small>%</small></output></div><p>The soft piano and ambient background theme.</p><input aria-label="Music volume" type="range" min="0" max="100" value={Math.round(audio.music * 100)} onChange={event => friendsAudio.setSettings({ music: Number(event.target.value) / 100 })}/><div className="friends-pause__scale"><span>Quiet</span><span>Full volume</span></div></label>
            <label className="friends-pause__slider"><div><span><Volume2 size={19}/> Effects</span><output>{Math.round(audio.effects * 100)}<small>%</small></output></div><p>Footsteps, gathering, building, and interface sounds.</p><input aria-label="Effects volume" type="range" min="0" max="100" value={Math.round(audio.effects * 100)} onChange={event => { friendsAudio.setSettings({ effects: Number(event.target.value) / 100 }); friendsAudio.play('click', .22); }}/><div className="friends-pause__scale"><span>Quiet</span><span>Full volume</span></div></label>
            <label className="friends-pause__slider"><div><span><Leaf size={19}/> Ambience</span><output>{Math.round(audio.ambience * 100)}<small>%</small></output></div><p>Wind, waves, leaves, nearby birds, and night crickets.</p><input aria-label="Ambience volume" type="range" min="0" max="100" value={Math.round(audio.ambience * 100)} onChange={event => friendsAudio.setSettings({ ambience: Number(event.target.value) / 100 })}/><div className="friends-pause__scale"><span>Quiet</span><span>Full volume</span></div></label>
            <div className="friends-pause__row"><div><strong>Mute all audio</strong><p>A moment of complete quiet.</p></div><button className="friends-pause__switch" role="switch" aria-label="Mute all audio" aria-checked={audio.muted} onClick={() => friendsAudio.setSettings({ muted: !audio.muted })}>{audio.muted ? <VolumeX size={17}/> : <Volume2 size={17}/>}<span/></button></div>
          </div><div className="friends-pause__track"><span className="friends-pause__track-icon"><Headphones size={24}/></span><div><small>ON THE ISLAND</small><strong>Vaporware</strong><span>The Cynic Project · Field recordings & CC0 foley</span></div><a href={`${import.meta.env.BASE_URL}audio/friends/CREDITS.md`} target="_blank" rel="noreferrer">Credits ↗</a></div></>}
          {tab === 'controls' && <><div className="friends-pause__section-heading"><span className="friends-pause__eyebrow">FEEL AT HOME</span><h2>Your way around the island.</h2><p>The same input profiles as the main menu. Switch at any time; your session stays connected.</p></div><div className="friends-pause__profiles">{(Object.entries(CONTROL_SCHEME_DETAILS) as [ControlScheme, typeof CONTROL_SCHEME_DETAILS[ControlScheme]][]).map(([scheme, detail]) => {
            const Icon = scheme === 'GAMEPAD' ? Gamepad2 : scheme === 'MOBILE' ? Smartphone : Keyboard;
            return <button key={scheme} type="button" aria-pressed={p.controlScheme === scheme} onClick={() => { p.onControlScheme(scheme); friendsAudio.play('click', .16); }}><Icon size={19}/><strong>{detail.label}</strong><span>{detail.description}</span><i>{p.controlScheme === scheme && <Check size={14}/>}</i></button>;
          })}</div><label className="friends-pause__slider friends-pause__sensitivity"><div><span>Look sensitivity</span><output>{p.preferences.lookSensitivity.toFixed(1)}<small>×</small></output></div><p>Fine-tune mouse and controller camera movement.</p><input aria-label="Look sensitivity" type="range" min=".4" max="2" step=".1" value={p.preferences.lookSensitivity} onChange={event => p.onPreferences({ lookSensitivity: Number(event.target.value) })}/></label><div className="friends-pause__bindings">{bindings.map(([label, key]) => <div key={label}><span>{label}</span><kbd>{key}</kbd></div>)}</div></>}
          {tab === 'performance' && <><div className="friends-pause__section-heading"><span className="friends-pause__eyebrow">A LITTLE BREATHING ROOM</span><h2>Find your smooth spot.</h2><p>These settings apply as you change them. Start with resolution if exploring feels slow.</p></div><div className="friends-pause__rows"><div className="friends-pause__row"><div><strong>Render resolution</strong><p>Lower resolution reduces GPU work. Your interface stays sharp.</p></div><select aria-label="Render resolution" value={p.preferences.renderScale} onChange={event => p.onPreferences({ renderScale: Number(event.target.value) })}><option value="1">100% · Full</option><option value=".85">85% · Balanced</option><option value=".7">70% · Lighter</option><option value=".5">50% · Lightest</option></select></div><div className="friends-pause__row"><div><strong>Sun shadows</strong><p>Grounded light and shade from trees and buildings.</p></div><button className="friends-pause__switch" role="switch" aria-label="Sun shadows" aria-checked={p.preferences.shadows} onClick={() => p.onPreferences({ shadows: !p.preferences.shadows })}><span/></button></div><div className="friends-pause__row"><div><strong>Compact mining progress</strong><p>Show a small progress indicator as well as cracks on the block.</p></div><button className="friends-pause__switch" role="switch" aria-label="Compact mining progress" aria-checked={p.preferences.miningProgress===true} onClick={()=>p.onPreferences({miningProgress:p.preferences.miningProgress!==true})}><span/></button></div><div className="friends-pause__effects"><strong>Visual effects</strong><p>Choose how much vignette and screen feedback you see.</p><div>{(['full', 'subtle', 'off'] as const).map(profile => <button key={profile} type="button" aria-pressed={p.cinematicProfile === profile} onClick={() => p.onCinematicProfile(profile)}>{profile === 'full' ? 'Full atmosphere' : profile === 'subtle' ? 'Subtle' : 'Off'}{p.cinematicProfile === profile && <Check size={14}/>}</button>)}</div></div></div><div className="friends-pause__tip"><Monitor size={20}/><p><strong>Keep the world. Lighten the picture.</strong>Resolution and shadows change the view on this device. Your island, friends, and building progress stay the same.</p></div></>}
        </main>
      </div><footer className="friends-pause__footer"><span><Settings2 size={13}/> Changes saved automatically</span><span><kbd>Esc</kbd> Return to island</span></footer>
    </div>
  </div>;
}
