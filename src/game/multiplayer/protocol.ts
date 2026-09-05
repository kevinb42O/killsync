/**
 * Transport-neutral messages for manual WebRTC co-op.
 *
 * This module deliberately contains no browser APIs. It is shared by the
 * WebRTC adapter, future host simulation, and tests so network payloads stay
 * compact, versioned, and safe to reject when an old tab connects.
 */

/** v11 keeps transport ticks monotonic across run retries. */
export const MULTIPLAYER_PROTOCOL_VERSION = 11;

export type MultiplayerRole = 'host' | 'guest';

export interface MultiplayerInputFrame {
  type: 'input';
  version: number;
  sequence: number;
  clientTime: number;
  movement: number;
  aimAngle: number;
  /** Quantized camera pitch. Zero is the lowest valid look angle. */
  aimPitch: number;
  selectedSlot: number;
  firing: boolean;
  /** Edge-triggered reload request, consumed by the authoritative host. */
  reloadPressed?: boolean;
  /** Held right-mouse aim state; spread is validated by the host. */
  aiming?: boolean;
  sprinting: boolean;
  sliding: boolean;
  /** Held F-key request. The host validates range, target, and progress. */
  reviving: boolean;
  /** One input-sequence pulse; the host consumes it only while grounded. */
  jumpPressed: boolean;
  dashPressed: boolean;
}

export interface MultiplayerStateFrame {
  type: 'state';
  version: number;
  tick: number;
  sentAt: number;
  /** The simulation payload is intentionally introduced separately from the
   * existing single-player Engine. A future host simulation owns this data. */
  payload: unknown;
}

export interface MultiplayerReliableEvent {
  type: 'event';
  version: number;
  event: 'ready' | 'spectate' | 'roster' | 'start' | 'cast' | 'revive' | 'station_purchase' | 'leave' | 'error';
  payload?: unknown;
}

export type MultiplayerWireMessage =
  | MultiplayerInputFrame
  | MultiplayerStateFrame
  | MultiplayerReliableEvent;

export interface ManualSignal {
  version: number;
  kind: 'offer' | 'answer';
  sessionId: string;
  peerId: string;
  description: RTCSessionDescriptionInit;
}

export interface MultiplayerPeerInfo {
  peerId: string;
  state: RTCPeerConnectionState;
}

export const isMultiplayerWireMessage = (value: unknown): value is MultiplayerWireMessage => {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<MultiplayerWireMessage>;
  return message.version === MULTIPLAYER_PROTOCOL_VERSION
    && (message.type === 'input' || message.type === 'state' || message.type === 'event');
};

const boundedInteger = (value: number, maximum: number) => Number.isFinite(value) ? Math.max(0, Math.min(maximum, Math.trunc(value))) : 0;

export const clampInputFrame = (frame: MultiplayerInputFrame): MultiplayerInputFrame => ({
  type: 'input',
  version: MULTIPLAYER_PROTOCOL_VERSION,
  movement: boundedInteger(frame.movement, 15),
  aimAngle: boundedInteger(frame.aimAngle, 65535),
  aimPitch: boundedInteger(frame.aimPitch, 65535),
  // The simulation clamps this against the real live weapon catalogue. Keep
  // the transport future-proof without letting malformed packets grow unbound.
  selectedSlot: boundedInteger(frame.selectedSlot, 31),
  sequence: boundedInteger(frame.sequence, Number.MAX_SAFE_INTEGER),
  clientTime: boundedInteger(frame.clientTime, Number.MAX_SAFE_INTEGER),
  firing: Boolean(frame.firing),
  reloadPressed: Boolean(frame.reloadPressed),
  aiming: Boolean(frame.aiming),
  sprinting: Boolean(frame.sprinting),
  sliding: Boolean(frame.sliding),
  reviving: Boolean(frame.reviving),
  jumpPressed: Boolean(frame.jumpPressed),
  dashPressed: Boolean(frame.dashPressed),
});
