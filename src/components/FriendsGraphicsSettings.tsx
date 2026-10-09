import { FRIENDS_FOV_MIN, FRIENDS_FOV_MAX, type FriendsAntialiasing, type FriendsFrameLimit, type LocalGamePreferences } from '../game/LocalGamePreferences';
import './friends-pause.css';

/** The same saved device settings in Options and the in-game Graphics menu. */
export function FriendsGraphicsSettings({ preferences, onPreferences }: {
  preferences: LocalGamePreferences;
  onPreferences: (patch: Partial<LocalGamePreferences>) => void;
}) {
  return <div className="friends-graphics">
    <label className="friends-pause__slider">
      <div><span>Field of view</span><output>{preferences.fieldOfView}<small>°</small></output></div>
      <p>See more of the island with a wider camera view.</p>
      <input aria-label="Field of view" type="range" min={FRIENDS_FOV_MIN} max={FRIENDS_FOV_MAX} step="1" value={preferences.fieldOfView}
        onChange={event => onPreferences({ fieldOfView: Number(event.target.value) })}/>
      <div className="friends-pause__scale"><span>90° · Narrower</span><span>140° · Wider</span></div>
    </label>
    <div className="friends-pause__row">
      <div><strong>Render resolution</strong><p>Lower resolution reduces GPU work. Your interface stays sharp.</p></div>
      <select aria-label="Render resolution" value={preferences.renderScale} onChange={event => onPreferences({ renderScale: Number(event.target.value) })}>
        <option value="1">100% · Full</option>
        <option value="0.85">85% · Balanced</option>
        <option value="0.7">70% · Lighter</option>
        <option value="0.5">50% · Lightest</option>
      </select>
    </div>
    <div className="friends-pause__row">
      <div><strong>Anti-aliasing</strong><p>Smooths edges and leaves. Off reduces GPU work; higher quality costs more.</p></div>
      <select aria-label="Anti-aliasing" value={preferences.antialiasing ?? 'auto'} onChange={event => onPreferences({ antialiasing: event.target.value === 'auto' ? 'auto' : Number(event.target.value) as FriendsAntialiasing })}>
        <option value="auto">Auto · Device default</option>
        <option value="0">Off · Faster</option>
        <option value="2">2× · Standard</option>
        <option value="4">4× · High</option>
      </select>
    </div>
    <div className="friends-pause__row">
      <div><strong>Frame-rate limit</strong><p>Lower limits can reduce heat and power use. A limit does not raise FPS.</p></div>
      <select aria-label="Frame-rate limit" value={preferences.frameLimit ?? 0} onChange={event => onPreferences({ frameLimit: Number(event.target.value) as FriendsFrameLimit })}>
        <option value="0">Unlimited</option>
        <option value="30">30 FPS</option>
        <option value="60">60 FPS</option>
        <option value="120">120 FPS</option>
      </select>
    </div>
    <div className="friends-pause__row">
      <div><strong>Sun shadows</strong><p>Grounded light and shade from trees and buildings.</p></div>
      <button type="button" className="friends-pause__switch" role="switch" aria-label="Sun shadows" aria-checked={preferences.shadows} onClick={() => onPreferences({ shadows: !preferences.shadows })}><span/></button>
    </div>
  </div>;
}
