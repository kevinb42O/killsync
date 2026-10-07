import { describe, expect, it } from 'vitest';
import { cycleFriendsTool, FRIENDS_TOOL_ORDER, FriendsToolWheel } from './FriendsToolControls';

describe('Friends wheel tools', () => {
  it('cycles the displayed belt in either direction, including firearm and rope, with wraparound', () => {
    for (let i = 0; i < FRIENDS_TOOL_ORDER.length; i++) {
      expect(cycleFriendsTool(FRIENDS_TOOL_ORDER[i], 1)).toBe(FRIENDS_TOOL_ORDER[(i + 1) % FRIENDS_TOOL_ORDER.length]);
      expect(cycleFriendsTool(FRIENDS_TOOL_ORDER[i], -1)).toBe(FRIENDS_TOOL_ORDER[(i + FRIENDS_TOOL_ORDER.length - 1) % FRIENDS_TOOL_ORDER.length]);
    }
  });
  it('accepts consecutive mouse notches and immediate reversal', () => {
    const wheel = new FriendsToolWheel();
    const event = { deltaX: 0, deltaY: 100, deltaMode: 0, ctrlKey: false };
    expect(wheel.push(event, 0)).toBe(1);
    expect(wheel.push(event, 50)).toBe(1);
    expect(wheel.push({ ...event, deltaY: -100 }, 60)).toBe(-1);
    expect(wheel.push({ ...event, deltaY: 1, deltaMode: 1 }, 70)).toBe(1);
  });
  it('accumulates trackpad motion and ignores pinch, horizontal scrolling, and zero deltas', () => {
    const wheel = new FriendsToolWheel();
    const event = { deltaX: 0, deltaY: 8, deltaMode: 0, ctrlKey: false };
    expect([0, 10, 20, 30].map(t => wheel.push(event, t))).toEqual([0, 0, 0, 1]);
    expect(wheel.push({ ...event, deltaY: 100, ctrlKey: true }, 40)).toBe(0);
    expect(wheel.push({ ...event, deltaY: 0 }, 50)).toBe(0);
    expect(wheel.push({ ...event, deltaX: 120, deltaY: 100 }, 60)).toBe(0);
    expect(wheel.push(event, 400)).toBe(0);
  });
});
