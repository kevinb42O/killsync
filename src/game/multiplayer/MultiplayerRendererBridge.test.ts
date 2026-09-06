import { describe, expect, it } from 'vitest';
import { shouldRenderPlayerRig } from './MultiplayerRendererBridge';

describe('MultiplayerRendererBridge operator visibility', () => {
  it('renders the local body while its camera is spectating a teammate', () => {
    expect(shouldRenderPlayerRig('host', 'host', true, false)).toBe(true);
  });

  it('keeps the local world rig hidden during normal first-person play', () => {
    expect(shouldRenderPlayerRig('host', 'host', false, false)).toBe(false);
    expect(shouldRenderPlayerRig('guest', 'host', false, false)).toBe(true);
  });
});
