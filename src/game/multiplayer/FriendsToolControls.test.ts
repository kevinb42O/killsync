import { describe, expect, it } from 'vitest';
import { cycleFriendsTool, friendsToolInput, FRIENDS_TOOL_ORDER, FriendsToolWheel, cycleFriendsFun, FRIENDS_FUN_ORDER } from './FriendsToolControls';

describe('Friends wheel tools', () => {
  it('cycles the displayed belt in either direction, including firearm and rope, with wraparound', () => {
    for (let i = 0; i < FRIENDS_TOOL_ORDER.length; i++) {
      expect(cycleFriendsTool(FRIENDS_TOOL_ORDER[i], 1)).toBe(FRIENDS_TOOL_ORDER[(i + 1) % FRIENDS_TOOL_ORDER.length]);
      expect(cycleFriendsTool(FRIENDS_TOOL_ORDER[i], -1)).toBe(FRIENDS_TOOL_ORDER[(i + FRIENDS_TOOL_ORDER.length - 1) % FRIENDS_TOOL_ORDER.length]);
    }
  });
  it('cycles stones, seeds and marshmallows in both directions',()=>{
    expect(FRIENDS_FUN_ORDER).toEqual([8,9,10]);
    for(let i=0;i<3;i++){expect(cycleFriendsFun(FRIENDS_FUN_ORDER[i],1)).toBe(FRIENDS_FUN_ORDER[(i+1)%3]);expect(cycleFriendsFun(FRIENDS_FUN_ORDER[i],-1)).toBe(FRIENDS_FUN_ORDER[(i+2)%3]);}
  });
  it('keeps one shovel slot and maps secondary input to filling only for that tool', () => {
    expect(FRIENDS_TOOL_ORDER).toEqual([6, 1, 2, 3, 0, 5, 7]);
    expect(friendsToolInput(3, false, true)).toEqual({ fill: true, held: true });
    expect(friendsToolInput(3, true, true)).toEqual({ fill: true, held: true });
    expect(friendsToolInput(3, true, false)).toEqual({ fill: false, held: true });
    expect(friendsToolInput(3, false, false)).toEqual({ fill: false, held: false });
    for (const tool of [0, 1, 2, 5] as const) {
      expect(friendsToolInput(tool, false, true)).toEqual({ fill: false, held: false });
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
