import { describe, expect, it } from 'vitest';
import { shouldPresentGroundJump, shouldRenderPlayerRig } from './MultiplayerRendererBridge';

describe('MultiplayerRendererBridge operator visibility', () => {
  it('renders the local body while its camera is spectating a teammate', () => {
    expect(shouldRenderPlayerRig('host', 'host', true, false)).toBe(true);
  });

  it('keeps the local world rig hidden during normal first-person play', () => {
    expect(shouldRenderPlayerRig('host', 'host', false, false)).toBe(false);
    expect(shouldRenderPlayerRig('guest', 'host', false, false)).toBe(true);
  });
});

describe('MultiplayerRendererBridge jump presentation', () => {
  it('presents each normal ground-launch sequence once while airborne', () => {
    expect(shouldPresentGroundJump(false, false, 12, 14, 13)).toBe(true);
    expect(shouldPresentGroundJump(false, false, 12, 14, 14)).toBe(false);
  });

  it('does not play a local launch cue while spectating, falling, or grounded', () => {
    expect(shouldPresentGroundJump(true, false, 12, 14, 13)).toBe(false);
    expect(shouldPresentGroundJump(false, true, 12, 14, 13)).toBe(false);
    expect(shouldPresentGroundJump(false, false, 0, 14, 13)).toBe(false);
  });
});
