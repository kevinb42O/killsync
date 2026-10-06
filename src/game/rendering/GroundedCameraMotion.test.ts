import { describe, expect, it } from 'vitest';
import { GroundedCameraMotion } from './GroundedCameraMotion';

describe('grounded first-person camera motion', () => {
  it('cushions stair risers and settles on the actual height', () => {
    const camera = new GroundedCameraMotion();
    camera.update(64, true, false, 16);
    const rising = camera.update(68, true, false, 16);
    expect(rising).toBeGreaterThan(64);
    expect(rising).toBeLessThan(68);
    expect(camera.update(68, true, false, 500)).toBeCloseTo(68, 3);
  });

  it('follows takeoff, landing and large teleports immediately', () => {
    const camera = new GroundedCameraMotion();
    camera.update(64, true, false, 16);
    camera.update(68, true, false, 16);
    expect(camera.update(74, false, false, 16)).toBe(74);
    expect(camera.update(64, true, false, 16)).toBe(64);
    expect(camera.update(1000, true, false, 16)).toBe(1000);
  });

  it('bounds eye displacement on a long staircase and blends crouching', () => {
    const camera = new GroundedCameraMotion();
    camera.update(0, true, false, 16);
    for (let z = 4; z <= 128; z += 4) {
      const eye = camera.update(z, true, false, 16);
      expect(z - eye).toBeLessThanOrEqual(8);
      expect(eye).toBeLessThanOrEqual(z);
    }
    camera.update(128, true, false, 500);
    const crouching = camera.update(128, true, true, 16);
    expect(crouching).toBeGreaterThan(119);
    expect(crouching).toBeLessThan(128);
    expect(camera.update(128, true, true, 1000)).toBeCloseTo(119, 3);
    expect(camera.update(128, true, false, 1000)).toBeCloseTo(128, 3);
  });
});
