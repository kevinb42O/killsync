import type { FrontierTool } from './FriendsFrontier';

export const FRIENDS_TOOL_ORDER: readonly FrontierTool[] = [1, 2, 3, 4, 0, 5];

export function cycleFriendsTool(tool: FrontierTool, direction: number): FrontierTool {
  const index = Math.max(0, FRIENDS_TOOL_ORDER.indexOf(tool));
  return FRIENDS_TOOL_ORDER[(index + Math.sign(direction) + FRIENDS_TOOL_ORDER.length) % FRIENDS_TOOL_ORDER.length];
}

/** Mouse notches select immediately; small trackpad deltas accumulate instead
 * of racing through the belt. Pinch and horizontal scrolling do not select. */
export class FriendsToolWheel {
  private amount = 0;
  private lastAt = -Infinity;
  push(event: Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode' | 'ctrlKey'>, now: number): -1 | 0 | 1 {
    if (event.ctrlKey || !Number.isFinite(event.deltaY) || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return 0;
    const delta = event.deltaY * (event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? 800 : 1);
    if (now - this.lastAt > 200 || Math.sign(delta) !== Math.sign(this.amount)) this.amount = 0;
    this.lastAt = now;
    this.amount += delta;
    if (Math.abs(this.amount) < 32) return 0;
    this.amount = 0;
    return Math.sign(delta) as -1 | 1;
  }
}
