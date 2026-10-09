import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FriendsPauseMenu, type FriendsPauseMenuProps } from './FriendsPauseMenu';
import { DEFAULT_GAME_PREFERENCES } from '../game/LocalGamePreferences';

const props: FriendsPauseMenuProps = { controlScheme: 'AZERTY', onControlScheme: () => {}, cinematicProfile: 'full', onCinematicProfile: () => {}, preferences: DEFAULT_GAME_PREFERENCES, onPreferences: () => {}, onResume: () => {}, onExit: () => {} };
describe('Friends Escape menu', () => {
  it('provides a named modal with resume and clearly states the shared world keeps running', () => {
    const html = renderToStaticMarkup(<FriendsPauseMenu {...props}/>);
    expect(html).toContain('role="dialog"'); expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Continue exploring'); expect(html).toContain('The world keeps moving');
    expect(html).not.toContain('Sound and music');
  });
  it('shows the same saved input profiles and correct movement keys', () => {
    const html = renderToStaticMarkup(<FriendsPauseMenu {...props} initialTab="controls" controlScheme="QWERTY"/>);
    for (const profile of ['AZERTY', 'QWERTY', 'GAMEPAD', 'MOBILE']) expect(html).toContain(profile);
    expect(html).toContain('W A S D'); expect(html).toContain('Look sensitivity');
    expect(html).toContain('1–7 / wheel');expect(html).toContain('Shovel · dig / fill');expect(html).toContain('LMB / RMB');
  });
  it('places the saved FOV slider first in Graphics', () => {
    const html = renderToStaticMarkup(<FriendsPauseMenu {...props} initialTab="performance" preferences={{ ...DEFAULT_GAME_PREFERENCES, fieldOfView: 130 }}/>);
    expect(html).toContain('aria-label="Field of view" type="range" min="90" max="140" step="1" value="130"');
    expect(html).toContain('Graphics');
    expect(html.indexOf('Field of view')).toBeLessThan(html.indexOf('Render resolution'));
    const controls = renderToStaticMarkup(<FriendsPauseMenu {...props} initialTab="controls"/>);
    expect(controls).not.toContain('Field of view');
  });
  it('offers only rendering controls that apply to the running renderer', () => {
    const html = renderToStaticMarkup(<FriendsPauseMenu {...props} initialTab="performance"/>);
    expect(html).toContain('Render resolution'); expect(html).toContain('Sun shadows'); expect(html).toContain('Visual effects');
    expect(html).toContain('50%'); expect(html).not.toContain('FPS guarantee');
    expect(html).toContain('Graphics'); expect(html).toContain('Anti-aliasing'); expect(html).toContain('Frame-rate limit');
    expect(html).toContain('4× · High'); expect(html).toContain('120 FPS'); expect(html).toContain('Unlimited');
    expect(html).toContain('A limit does not raise FPS');
  });
  it('shows host dev controls and avoids the QWERTY C crouch conflict', () => {
    const host = renderToStaticMarkup(<FriendsPauseMenu {...props} host initialTab="controls" controlScheme="QWERTY"/>);
    const guest = renderToStaticMarkup(<FriendsPauseMenu {...props} initialTab="controls" controlScheme="QWERTY"/>);
    expect(host).toContain('Developer settings · host only');
    expect(host).toContain('C / F2');
    expect(host).toContain('CTRL');
    expect(guest).not.toContain('Developer settings');
    expect(guest).toContain('Crouch / slide</span><kbd>C</kbd>');
  });
});
