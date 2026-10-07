import { FRIENDS_SPAWN_PLATFORM } from './FriendsTerrain';

/** Bring the distant salvage home to the existing spawn deck. */
export const FRIENDS_DELIVERY_BAY = {
  id: 'delivery-bay', name: 'DELIVERY BAY',
  x: FRIENDS_SPAWN_PLATFORM.x - 16, y: FRIENDS_SPAWN_PLATFORM.y,
  z: FRIENDS_SPAWN_PLATFORM.top, width: 160, depth: 160,
  color: '#a5f279',
} as const;
