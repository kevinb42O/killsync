/**
 * Transport-neutral messages for manual WebRTC co-op.
 *
 * This module deliberately contains no browser APIs. It is shared by the
 * WebRTC adapter, future host simulation, and tests so network payloads stay
 * compact, versioned, and safe to reject when an old tab connects.
 */

/** v30 expands the authoritative squad roster from four operatives to eight. */
export const MULTIPLAYER_PROTOCOL_VERSION = 30;

/** The host is authoritative and holds one WebRTC connection for each guest.
 * Keep this deliberately modest until the transport is moved off peer hosting. */
export const COOP_MAX_PLAYERS = 8;

/** Stable, high-contrast guest identities for roster cards, world markers,
 * and late joins. The host always keeps the cyan identity. */
export const COOP_GUEST_COLORS = ['#f472b6', '#a78bfa', '#fbbf24', '#34d399', '#fb7185', '#60a5fa', '#fb923c'] as const;

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
  /** Monotonic trigger-pull id. Repeated input frames make semi-auto fire
   * resilient to loss without allowing the host to execute an action twice. */
  fireActionId?: number;
  /** Monotonic right-click artifact-spender request. Ordinary guns still use
   * `aiming`; only the selected signature weapon consumes this action. */
  altFireActionId?: number;
  /** Edge-triggered reload request, consumed by the authoritative host. */
  reloadPressed?: boolean;
  /** Held right-mouse aim state; spread is validated by the host. */
  aiming?: boolean;
  sprinting: boolean;
  sliding: boolean;
  /** Held F-key request. The host validates range, target, and progress. */
  reviving: boolean;
  /** Monotonic F-key press id. Manual backpack drops are collected only when
   * the host observes a new action id while the operator is in range. */
  interactActionId?: number;
  /** One input-sequence pulse used for the initial ground-launch impulse and
   * discrete wall-jump attempts. */
  jumpPressed: boolean;
  /** Held Space state. The host turns this into bounded Burst Pack thrust from
   * the floor or in the air. Ignition and wall-jump share one aerial action. */
  jetHeld?: boolean;
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

export type CoopPingKind = 'location' | 'enemy' | 'boss' | 'station' | 'objective' | 'revive';

export interface CoopPing {
  id: number;
  playerId: string;
  playerLabel: string;
  playerColor: string;
  x: number;
  y: number;
  z?: number;
  kind: CoopPingKind;
  /** Localized by each receiving client. Never contains host-authored UI text. */
  labelKey: import('./i18n').CoopTextKey;
  labelParams?: Record<string, string | number>;
  createdAtMs: number;
  expiresAtMs: number;
  remainingMs?: number;
  /** Present for long-lived host-resolved tactical-map contract waypoints. */
  missionSiteId?: number;
}

export interface CoopAdminRequest {
  id: string;
  sessionId: string;
  actorPlayerId: string;
  issuedAt: number;
  sequence: number;
  command: string;
  signature: string;
}

export interface CoopAdminResult {
  requestId: string;
  ok: boolean;
  message: string;
  modified?: boolean;
}

export interface CoopAdminNotice {
  message: string;
  kind: 'info' | 'warning' | 'kick';
  paused?: boolean;
  modified?: boolean;
}

type MultiplayerReliableEventName = 'ready' | 'spectate' | 'roster' | 'start' | 'skin_update' | 'cast' | 'revive' | 'station_purchase' | 'station_purchase_result' | 'operator_redeploy' | 'operator_redeploy_result' | 'foundry_upgrade' | 'foundry_upgrade_result' | 'build_structure' | 'build_structure_result' | 'dismantle_structure' | 'dismantle_structure_result' | 'structure_action' | 'structure_action_result' | 'inventory_drop' | 'imprint_update' | 'leave' | 'error' | 'ping' | 'chat' | 'admin_request' | 'admin_result' | 'admin_notice';

interface MultiplayerReliableEventBase {
  type: 'event';
  version: number;
}

export type MultiplayerReliableEvent =
  | (MultiplayerReliableEventBase & {
    event: 'admin_request';
    payload: CoopAdminRequest;
  })
  | (MultiplayerReliableEventBase & {
    event: 'admin_result';
    payload: CoopAdminResult;
  })
  | (MultiplayerReliableEventBase & {
    event: 'admin_notice';
    payload: CoopAdminNotice;
  })
  | (MultiplayerReliableEventBase & {
    event: 'station_purchase_result';
    payload: import('./CoopBuyStation').CoopPurchaseResult;
  })
  | (MultiplayerReliableEventBase & {
    event: 'foundry_upgrade_result';
    payload: import('./CoopWeaponFoundry').CoopFoundryUpgradeResult;
  })
  | (MultiplayerReliableEventBase & {
    event: 'operator_redeploy_result';
    payload: import('./CoopBuyStation').CoopRedeployResult;
  })
  | (MultiplayerReliableEventBase & {
    event: 'build_structure_result';
    payload: import('./CoopFieldEngineering').CoopBuildResult;
  })
  | (MultiplayerReliableEventBase & {
    event: 'dismantle_structure_result';
    payload: import('./CoopFieldEngineering').CoopDismantleResult;
  })
  | (MultiplayerReliableEventBase & {
    event: 'structure_action_result';
    payload: import('./CoopFieldEngineering').CoopStructureActionResult;
  })
  | (MultiplayerReliableEventBase & {
  event: Exclude<MultiplayerReliableEventName, 'admin_request' | 'admin_result' | 'admin_notice' | 'station_purchase_result' | 'foundry_upgrade_result' | 'operator_redeploy_result' | 'build_structure_result' | 'dismantle_structure_result' | 'structure_action_result'>;
  payload?: unknown;
  });

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
  fireActionId: boundedInteger(frame.fireActionId, Number.MAX_SAFE_INTEGER),
  altFireActionId: boundedInteger(frame.altFireActionId, Number.MAX_SAFE_INTEGER),
  reloadPressed: Boolean(frame.reloadPressed),
  aiming: Boolean(frame.aiming),
  sprinting: Boolean(frame.sprinting),
  sliding: Boolean(frame.sliding),
  reviving: Boolean(frame.reviving),
  interactActionId: boundedInteger(frame.interactActionId, Number.MAX_SAFE_INTEGER),
  jumpPressed: Boolean(frame.jumpPressed),
  jetHeld: Boolean(frame.jetHeld),
  dashPressed: Boolean(frame.dashPressed),
});
