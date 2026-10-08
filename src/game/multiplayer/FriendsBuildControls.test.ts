import { afterEach, describe, expect, it, vi } from 'vitest';
import { assignBuildSlot, BUILD_TOOLBAR_KEY, BuildWheelGesture, cycleBuildToolbar, DEFAULT_BUILD_TOOLBAR, filterBuildLibrary, readBuildToolbar, saveBuildToolbar } from './FriendsBuildControls';

const wheel = (deltaY: number, extra = {}) => ({ deltaY, deltaX: 0, deltaMode: 0, ...extra });
afterEach(() => vi.unstubAllGlobals());
describe('deliberate construction controls', () => {
  it('turns once for an entire trackpad gesture including momentum', () => {
    const control = new BuildWheelGesture();
    const actions = Array.from({ length: 80 }, (_, i) => control.push(wheel(i < 10 ? 18 : 4), i * 16));
    expect(actions.filter(Boolean)).toEqual([1]);
    expect(control.push(wheel(-110), 1600)).toBe(-1);
  });
  it('ignores pinch, horizontal scrolling and small resting noise', () => {
    const control = new BuildWheelGesture();
    expect(control.push(wheel(200, { ctrlKey: true }), 0)).toBe(0);
    expect(control.push(wheel(200, { deltaX: 250 }), 20)).toBe(0);
    for (let i = 0; i < 300; i++) expect(control.push(wheel(.7), i * 16)).toBe(0);
  });
  it('normalizes mouse wheel lines and resets on changing control mode', () => {
    const control = new BuildWheelGesture();
    expect(control.push(wheel(3, { deltaMode: 1 }), 0)).toBe(0);
    expect(control.push(wheel(3, { deltaMode: 1 }), 16)).toBe(1);
    expect(control.push(wheel(3, { deltaMode: 1 }), 32)).toBe(0);
    expect(control.push(wheel(-1, { deltaMode: 2 }), 48, 'toolbar')).toBe(-1);
    control.reset(); expect(control.push(wheel(100), 64)).toBe(1);
  });
  it('requires a deliberate movement after reversing before the threshold', () => {
    const control = new BuildWheelGesture();
    expect(control.push(wheel(70), 0)).toBe(0);
    expect(control.push(wheel(-70), 16)).toBe(0);
    expect(control.push(wheel(-35), 32)).toBe(-1);
  });
  it('swaps pinned pieces without creating duplicate shortcuts', () => {
    const toolbar = assignBuildSlot(DEFAULT_BUILD_TOOLBAR, 0, 'rail_curve');
    expect(toolbar[0]).toBe('rail_curve'); expect(toolbar[7]).toBe('block');
    expect(new Set(toolbar).size).toBe(8); expect(DEFAULT_BUILD_TOOLBAR[0]).toBe('block');
    expect(assignBuildSlot(toolbar, 8, 'bench')).toEqual(toolbar);
  });
  it('cycles the saved slot order, wraps both ways and rejoins from an unpinned library piece', () => {
    const toolbar = assignBuildSlot(DEFAULT_BUILD_TOOLBAR, 4, 'bench');
    expect(cycleBuildToolbar(toolbar, toolbar[7], 1)).toBe(toolbar[0]);
    expect(cycleBuildToolbar(toolbar, toolbar[0], -1)).toBe(toolbar[7]);
    expect(cycleBuildToolbar(toolbar, toolbar[3], 1)).toBe('bench');
    expect(cycleBuildToolbar(toolbar, 'table', 1)).toBe(toolbar[0]);
    expect(cycleBuildToolbar(toolbar, 'table', -1)).toBe(toolbar[7]);
    expect(cycleBuildToolbar(toolbar, 'table', 0)).toBe('table');
  });
  it('remembers a customized toolbar and recovers from corrupt storage', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) });
    const toolbar = assignBuildSlot(DEFAULT_BUILD_TOOLBAR, 4, 'bench');
    saveBuildToolbar(toolbar); expect(readBuildToolbar()).toEqual(toolbar);
    values.set(BUILD_TOOLBAR_KEY, JSON.stringify(Array(8).fill('block'))); expect(readBuildToolbar()).toEqual(DEFAULT_BUILD_TOOLBAR);
    values.set(BUILD_TOOLBAR_KEY, '{'); expect(readBuildToolbar()).toEqual(DEFAULT_BUILD_TOOLBAR);
  });
  it('keeps railway pieces discoverable and searches across categories', () => {
    expect(filterBuildLibrary('railway', '', DEFAULT_BUILD_TOOLBAR)).toEqual(['rail_straight', 'rail_curve']);
    expect(filterBuildLibrary('blocks', 'window', DEFAULT_BUILD_TOOLBAR)).toEqual(['window']);
    expect(filterBuildLibrary('pinned', '', DEFAULT_BUILD_TOOLBAR)).toEqual(DEFAULT_BUILD_TOOLBAR);
    expect(filterBuildLibrary('blocks', '', DEFAULT_BUILD_TOOLBAR)).toEqual(['block', 'half_block', 'floor_tile', 'voxel_ramp', 'voxel_stairs']);
  });
});
