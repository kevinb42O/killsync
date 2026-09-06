import { describe, expect, it } from 'vitest';
import {
  WALL_JUMP_MAX_CAMERA_PITCH,
  WALL_JUMP_MAX_CAMERA_ROLL,
  wallJumpCameraLean,
} from './wallJumpPresentation';

describe('wall-jump camera presentation', () => {
  it('banks right when the wall launches the player to camera-right', () => {
    expect(wallJumpCameraLean(0, 1, 0)).toEqual({ roll: -WALL_JUMP_MAX_CAMERA_ROLL, pitch: -0 });
  });

  it('banks left when the wall launches the player to camera-left', () => {
    expect(wallJumpCameraLean(0, -1, 0)).toEqual({ roll: WALL_JUMP_MAX_CAMERA_ROLL, pitch: -0 });
  });

  it('adds a smaller upward kick when launching back from a wall ahead', () => {
    const lean = wallJumpCameraLean(-1, 0, 0);
    expect(lean.roll).toBeCloseTo(0);
    expect(lean.pitch).toBe(WALL_JUMP_MAX_CAMERA_PITCH);
  });

  it('normalizes diagonal wall contacts so camera lean stays bounded', () => {
    const lean = wallJumpCameraLean(100, 100, 0);
    expect(Math.abs(lean.roll)).toBeLessThanOrEqual(WALL_JUMP_MAX_CAMERA_ROLL);
    expect(Math.abs(lean.pitch)).toBeLessThanOrEqual(WALL_JUMP_MAX_CAMERA_PITCH);
  });
});
