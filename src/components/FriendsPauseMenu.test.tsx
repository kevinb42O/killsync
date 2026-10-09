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
    expect(html).toContain('1–6 / wheel');expect(html).toContain('Shovel · dig / fill');expect(html).toContain('LMB / RMB');
  });
  it('offers only rendering controls that apply to the running renderer', () => {
    const html = renderToStaticMarkup(<FriendsPauseMenu {...props} initialTab="performance"/>);
    expect(html).toContain('Render resolution'); expect(html).toContain('Sun shadows'); expect(html).toContain('Visual effects');
    expect(html).toContain('50%'); expect(html).not.toContain('FPS guarantee');
  });
});
