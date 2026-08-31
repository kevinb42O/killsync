/**
 * Movement presets use `KeyboardEvent.key`, so the displayed label and the
 * character produced by the player's active keyboard layout stay aligned.
 * Arrow keys intentionally live outside a preset: they are always available.
 */
export type ControlScheme = 'AZERTY' | 'QWERTY';

export type MovementDirection = 'up' | 'down' | 'left' | 'right';

export type MovementBindings = Record<MovementDirection, readonly string[]>;

export const DEFAULT_CONTROL_SCHEME: ControlScheme = 'AZERTY';

export const CONTROL_SCHEME_DETAILS: Record<ControlScheme, {
  label: string;
  description: string;
  bindings: Record<MovementDirection, string>;
}> = {
  AZERTY: {
    label: 'AZERTY',
    description: 'Belgian and French keyboard layout',
    bindings: { up: 'z', down: 's', left: 'q', right: 'd' },
  },
  QWERTY: {
    label: 'QWERTY',
    description: 'International keyboard layout',
    bindings: { up: 'w', down: 's', left: 'a', right: 'd' },
  },
};

const ARROW_BINDINGS: Record<MovementDirection, string> = {
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
};

export const getMovementBindings = (scheme: ControlScheme): MovementBindings => {
  const preset = CONTROL_SCHEME_DETAILS[scheme].bindings;
  return {
    up: [preset.up, ARROW_BINDINGS.up],
    down: [preset.down, ARROW_BINDINGS.down],
    left: [preset.left, ARROW_BINDINGS.left],
    right: [preset.right, ARROW_BINDINGS.right],
  };
};

export const isMovementDirectionPressed = (
  keys: ReadonlySet<string>,
  scheme: ControlScheme,
  direction: MovementDirection,
): boolean => getMovementBindings(scheme)[direction].some((key) => keys.has(key));

export const parseControlScheme = (value: string | null): ControlScheme =>
  value === 'QWERTY' || value === 'AZERTY' ? value : DEFAULT_CONTROL_SCHEME;
