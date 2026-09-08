/**
 * Shared, small Gamepad API helpers. Keeping the dead-zone and button mapping
 * independent of React makes controller behaviour deterministic and testable.
 */
export const GAMEPAD_DEAD_ZONE = 0.2;

export const GAMEPAD_BUTTON = {
  jump: 0,
  slide: 1,
  reload: 2,
  interact: 3,
  previousWeapon: 4,
  nextWeapon: 5,
  aim: 6,
  fire: 7,
  sprint: 10,
  dpadLeft: 14,
  dpadRight: 15,
} as const;

export type GamepadAxes = Pick<Gamepad, 'axes'>;
export type GamepadButtons = Pick<Gamepad, 'buttons'>;

export function applyGamepadDeadZone(value: number, deadZone = GAMEPAD_DEAD_ZONE) {
  if (!Number.isFinite(value) || Math.abs(value) <= deadZone) return 0;
  const normalized = (Math.abs(value) - deadZone) / (1 - deadZone);
  return Math.sign(value) * Math.min(1, normalized);
}

export function gamepadMovementMask(gamepad: GamepadAxes) {
  const horizontal = applyGamepadDeadZone(gamepad.axes[0] || 0);
  const vertical = applyGamepadDeadZone(gamepad.axes[1] || 0);
  return (vertical < 0 ? 1 : 0)
    | (vertical > 0 ? 2 : 0)
    | (horizontal < 0 ? 4 : 0)
    | (horizontal > 0 ? 8 : 0);
}

export function gamepadLookAxes(gamepad: GamepadAxes) {
  return {
    x: applyGamepadDeadZone(gamepad.axes[2] || 0),
    y: applyGamepadDeadZone(gamepad.axes[3] || 0),
  };
}

export function isGamepadButtonDown(gamepad: GamepadButtons, button: number) {
  const state = gamepad.buttons[button];
  return Boolean(state?.pressed || (state?.value || 0) > 0.5);
}

export function firstConnectedGamepad(gamepads: readonly (Gamepad | null)[]) {
  return gamepads.find((gamepad): gamepad is Gamepad => Boolean(gamepad?.connected));
}
