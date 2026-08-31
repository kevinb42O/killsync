import { describe, expect, it } from 'vitest';
import { GAME_HEIGHT, GAME_WIDTH } from '../../constants';
import { getNearbyWorldObstacles, getWorldObstacles, isWorldPositionClear, resolveWorldCollisions } from './WorldLayout';

describe('collidable world layout', () => {
  it('builds deterministic obstacles and keeps the spawn plaza clear', () => {
    expect(getWorldObstacles().length).toBeGreaterThan(30);
    expect(isWorldPositionClear(GAME_WIDTH / 2, GAME_HEIGHT / 2, 24)).toBe(true);
  });

  it('resolves a circle out of a rendered building', () => {
    const obstacle = getWorldObstacles()[0];
    const position = { x: obstacle.x + obstacle.width / 2, y: obstacle.y + obstacle.height / 2 };
    const result = resolveWorldCollisions(position, 18);
    expect(result.collided).toBe(true);
    expect(isWorldPositionClear(position.x, position.y, 18)).toBe(true);
  });

  it('queries only nearby collision geometry', () => {
    const obstacle = getWorldObstacles()[0];
    const nearby = getNearbyWorldObstacles(obstacle.x + 10, obstacle.y + 10, 40);
    expect(nearby.some((candidate) => candidate.id === obstacle.id)).toBe(true);
    expect(nearby.length).toBeLessThan(8);
  });

  it('keeps the expanded arena boundary authoritative', () => {
    const position = { x: GAME_WIDTH + 500, y: GAME_HEIGHT + 500 };
    resolveWorldCollisions(position, 18);
    expect(position.x).toBe(GAME_WIDTH - 18);
    expect(position.y).toBe(GAME_HEIGHT - 18);
  });
});
