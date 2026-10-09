import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FriendsGraphicsSettings } from './FriendsGraphicsSettings';
import { DEFAULT_GAME_PREFERENCES } from '../game/LocalGamePreferences';

describe('shared Friends graphics controls', () => {
  it.each([1, .85, .7, .5])('displays the saved %s render scale rather than falling back to Full', renderScale => {
    const html = renderToStaticMarkup(<FriendsGraphicsSettings preferences={{ ...DEFAULT_GAME_PREFERENCES, renderScale }} onPreferences={() => {}}/>);
    expect(html).toContain(`<option value="${renderScale}" selected="">`);
  });
  it('displays saved low-power graphics values in either settings menu', () => {
    const html = renderToStaticMarkup(<FriendsGraphicsSettings preferences={{ ...DEFAULT_GAME_PREFERENCES, renderScale: .7, antialiasing: 0, frameLimit: 30, shadows: false }} onPreferences={() => {}}/>);
    expect(html).toContain('<option value="0" selected="">Off · Faster');
    expect(html).toContain('<option value="30" selected="">30 FPS');
    expect(html).toContain('aria-label="Sun shadows" aria-checked="false"');
  });
});
