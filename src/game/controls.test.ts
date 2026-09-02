import { describe, expect, it } from 'vitest';
import { getCoopSlideBinding, getMovementBindings, isMovementDirectionPressed, parseControlScheme } from './controls';

describe('control presets', () => {
  it('maps AZERTY movement to ZQSD while keeping the arrow keys', () => {
    expect(getMovementBindings('AZERTY')).toEqual({
      up: ['z', 'arrowup'],
      down: ['s', 'arrowdown'],
      left: ['q', 'arrowleft'],
      right: ['d', 'arrowright'],
    });
  });

  it('maps QWERTY movement to WASD while keeping the arrow keys', () => {
    expect(getMovementBindings('QWERTY')).toEqual({
      up: ['w', 'arrowup'],
      down: ['s', 'arrowdown'],
      left: ['a', 'arrowleft'],
      right: ['d', 'arrowright'],
    });
  });

  it('accepts an arrow key for every preset', () => {
    expect(isMovementDirectionPressed(new Set(['arrowup']), 'AZERTY', 'up')).toBe(true);
    expect(isMovementDirectionPressed(new Set(['arrowleft']), 'QWERTY', 'left')).toBe(true);
  });

  it('falls back safely to AZERTY for a missing saved value', () => {
    expect(parseControlScheme(null)).toBe('AZERTY');
    expect(parseControlScheme('other')).toBe('AZERTY');
  });

  it('keeps co-op slide off QWERTY forward movement', () => {
    expect(getCoopSlideBinding('AZERTY')).toBe('w');
    expect(getCoopSlideBinding('QWERTY')).toBe('c');
  });
});
