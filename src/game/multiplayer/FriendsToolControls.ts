import type { FrontierTool } from './FriendsFrontier';
import { CONFETTI_TOOL } from './FriendsConfetti';
export { CONFETTI_TOOL } from './FriendsConfetti';

export const FRIENDS_FUN_ORDER: readonly FrontierTool[] = [8,9,10,CONFETTI_TOOL];
export function cycleFriendsFun(tool:FrontierTool,direction:number):FrontierTool {
  const index=Math.max(0,FRIENDS_FUN_ORDER.indexOf(tool));
  return FRIENDS_FUN_ORDER[(index+Math.sign(direction)+FRIENDS_FUN_ORDER.length)%FRIENDS_FUN_ORDER.length];
}

export const FRIENDS_TOOL_ORDER: readonly FrontierTool[] = [6, 1, 2, 3, 0, 5, 7];

/** The held secondary input places soil only with Shovel. It takes priority
 * over digging when both buttons are held. Other tools retain secondary aim. */
export function friendsToolInput(tool: FrontierTool, firing: boolean, aiming: boolean) {
  const fill = tool === 3 && aiming;
  return { fill, held: (tool === 1 || tool === 2 || tool === 3) && (firing || fill) };
}

export function cycleFriendsTool(tool: FrontierTool, direction: number): FrontierTool {
  const index = Math.max(0, FRIENDS_TOOL_ORDER.indexOf(tool));
  return FRIENDS_TOOL_ORDER[(index + Math.sign(direction) + FRIENDS_TOOL_ORDER.length) % FRIENDS_TOOL_ORDER.length];
}

/** Mouse notches select immediately; small trackpad deltas accumulate instead
 * of racing through the belt. Pinch and horizontal scrolling do not select. */
export class FriendsToolWheel {
  private amount = 0;
  private lastAt = -Infinity;
  reset() { this.amount = 0; this.lastAt = -Infinity; }
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
