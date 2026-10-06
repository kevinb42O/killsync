import { FRIENDS_BUILD_CATALOG, isFriendsShape, type FriendsBuildShape } from './FriendsBuilding';
import { VOXEL_SIZE } from '../world/FriendsTerrain';

export const DEFAULT_BUILD_TOOLBAR: FriendsBuildShape[] = ['block', 'half_block', 'floor_tile', 'voxel_ramp', 'wall', 'doorway', 'rail_straight', 'rail_curve'];
export const BUILD_TOOLBAR_KEY = 'killsync.friends.build-toolbar.v1';
export const BUILD_CATEGORIES = [
  { id: 'pinned', label: 'My toolbar', hint: 'Your eight quick slots' },
  { id: 'blocks', label: 'Blocks & terrain', hint: 'Fits the world grid' },
  { id: 'structure', label: 'Architecture', hint: 'Rooms, roofs & connections' },
  { id: 'furnish', label: 'Garden & furniture', hint: 'Make it yours' },
  { id: 'workshop', label: 'Workshop', hint: 'Craft, store & land' },
  { id: 'railway', label: 'Railway', hint: 'Tracks, trains & travel' },
] as const;
export type BuildCategory = typeof BUILD_CATEGORIES[number]['id'];
export const BUILD_LIBRARY: Record<Exclude<BuildCategory, 'pinned'>, FriendsBuildShape[]> = {
  blocks: ['block', 'half_block', 'floor_tile', 'voxel_ramp', 'voxel_stairs'],
  structure: ['wall', 'window', 'doorway', 'pillar', 'beam', 'railing', 'roof', 'glass', 'long_ramp'],
  furnish: ['lamp', 'planter', 'bench', 'table', 'sign', 'survey_lens', 'gathering_beacon'],
  workshop: ['workbench', 'furnace', 'storage', 'landing_pad'],
  railway: ['rail_straight', 'rail_curve'],
};
export const buildCategory = (shape: FriendsBuildShape): Exclude<BuildCategory, 'pinned'> =>
  (Object.entries(BUILD_LIBRARY).find(([, shapes]) => shapes.includes(shape))?.[0] as Exclude<BuildCategory, 'pinned'>) ?? 'blocks';

export function readBuildToolbar(): FriendsBuildShape[] {
  try {
    const saved = JSON.parse(localStorage.getItem(BUILD_TOOLBAR_KEY) || 'null');
    if (Array.isArray(saved) && saved.length === 8 && saved.every(isFriendsShape) && new Set(saved).size === 8) return saved;
  } catch { /* A private browser or older toolbar starts with the defaults. */ }
  return [...DEFAULT_BUILD_TOOLBAR];
}
export function assignBuildSlot(toolbar: readonly FriendsBuildShape[], index: number, shape: FriendsBuildShape) {
  if (!Number.isInteger(index) || index < 0 || index >= 8 || !isFriendsShape(shape)) return [...toolbar];
  const next = [...toolbar], other = next.indexOf(shape);
  if (other >= 0) next[other] = next[index];
  next[index] = shape;
  return next;
}
export function saveBuildToolbar(toolbar: readonly FriendsBuildShape[]) {
  try { localStorage.setItem(BUILD_TOOLBAR_KEY, JSON.stringify(toolbar)); } catch { /* Selection still works without storage. */ }
}
export function buildDimensions(shape: FriendsBuildShape) {
  const d = FRIENDS_BUILD_CATALOG[shape];
  return `${d.w / VOXEL_SIZE} × ${d.d / VOXEL_SIZE} × ${d.h / VOXEL_SIZE} blocks`;
}
export function filterBuildLibrary(category: BuildCategory, query: string, toolbar: readonly FriendsBuildShape[]) {
  const search = query.trim().toLowerCase();
  const shapes = search ? Object.values(BUILD_LIBRARY).flat() : category === 'pinned' ? [...toolbar] : BUILD_LIBRARY[category];
  return shapes.filter(shape => {
    const d = FRIENDS_BUILD_CATALOG[shape];
    return !search || `${d.name} ${d.description} ${d.group} ${buildCategory(shape)}`.toLowerCase().includes(search);
  });
}

/** A trackpad gesture may emit hundreds of momentum events. One deliberate
 * gesture earns one action; small noise and horizontal/pinch gestures earn none. */
export class BuildWheelGesture {
  private accumulated = 0;
  private lastTime = -Infinity;
  private direction = 0;
  private consumed = false;
  private mode = '';
  reset() { this.accumulated = 0; this.lastTime = -Infinity; this.direction = 0; this.consumed = false; this.mode = ''; }
  push(event: { deltaY: number; deltaX: number; deltaMode: number; ctrlKey?: boolean }, now: number, mode = 'rotate'): -1 | 0 | 1 {
    if (event.ctrlKey || !Number.isFinite(event.deltaY) || Math.abs(event.deltaY) < 1 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return 0;
    const direction = Math.sign(event.deltaY);
    if (now - this.lastTime > 200 || mode !== this.mode) {
      this.accumulated = 0; this.consumed = false; this.direction = direction;
    }
    this.lastTime = now; this.mode = mode;
    if (this.consumed) return 0;
    if (direction !== this.direction) this.accumulated = 0;
    this.direction = direction;
    this.accumulated += event.deltaY * (event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? 800 : 1);
    if (Math.abs(this.accumulated) < 100) return 0;
    this.consumed = true;
    return direction as -1 | 1;
  }
}
