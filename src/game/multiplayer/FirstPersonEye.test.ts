import { describe, expect, it } from 'vitest';
import { firstPersonEyeZ } from './FirstPersonEye';
import { raycastFriendsBuild } from './FriendsBuilding';
import { MultiplayerRendererBridge } from './MultiplayerRendererBridge';

describe('raised first-person viewpoint', () => {
  it('keeps client targeting at standing, sliding and swimming eye level', () => {
    const bridge = Object.assign(Object.create(MultiplayerRendererBridge.prototype), {
      interactionPlayerId: 'host', getAimAngle: () => 0, getAimPitch: () => 0,
    });
    for (const [extra, height] of [[{}, 50], [{ sliding: true }, 41], [{ motion: { swimming: true } }, 26]] as const) {
      const player = { id: 'host', x: 0, y: 0, z: 100, ...extra };
      const ray = bridge.playerInteractionRay({ players: [player] });
      expect(ray.z).toBe(100 + height);
      expect(ray.z).toBe(firstPersonEyeZ(player));
    }
  });

  it('aims through the crosshair at a block above the old eye height', () => {
    const piece = { id: 1, author: 'Host', revision: 1, shape: 'cube', finish: 'stone', x: 100, y: 0, z: 32, rotation: 0 } as const;
    const ray = { x: 0, y: 0, z: firstPersonEyeZ({ z: 0 }), dx: 1, dy: 0, dz: 0 };
    expect(raycastFriendsBuild([piece], ray)?.piece.id).toBe(1);
    expect(raycastFriendsBuild([piece], { ...ray, z: 26 })).toBeUndefined();
  });

  it('leaves room for the near plane beneath a ceiling without moving the body', () => {
    const player = { z: 100 };
    expect(firstPersonEyeZ(player, 150)).toBe(147);
    expect(firstPersonEyeZ(player, 200)).toBe(150);
    expect(player.z).toBe(100);
  });
});
