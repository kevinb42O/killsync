import { describe, expect, it } from 'vitest';
import { applyGamepadDeadZone, gamepadLookAxes, gamepadMovementMask, isGamepadButtonDown } from './gamepad';

const gamepad = (axes: number[], buttons: Array<{ pressed?: boolean; value?: number }> = []) => ({ axes, buttons }) as unknown as Gamepad;

describe('gamepad helpers', () => {
  it('filters stick drift before calculating movement', () => {
    expect(applyGamepadDeadZone(.19)).toBe(0);
    expect(gamepadMovementMask(gamepad([-.75, .8]))).toBe(2 | 4);
  });

  it('normalizes the right stick for look input', () => {
    expect(gamepadLookAxes(gamepad([0, 0, .2, -.6]))).toEqual({ x: 0, y: expect.closeTo(-.5) });
  });

  it('supports digital and analogue controller buttons', () => {
    expect(isGamepadButtonDown(gamepad([], [{ pressed: true }]), 0)).toBe(true);
    expect(isGamepadButtonDown(gamepad([], [{ value: .75 }]), 0)).toBe(true);
    expect(isGamepadButtonDown(gamepad([], [{ value: .49 }]), 0)).toBe(false);
  });
});
