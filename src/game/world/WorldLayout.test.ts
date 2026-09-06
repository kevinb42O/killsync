import { describe, expect, it } from 'vitest';
import { GAME_HEIGHT, GAME_WIDTH } from '../../constants';
import { getNearbyWorldObstacles, getWorldObstacles, getWorldWallContact, isWorldPositionClear, raycastWorldObstacles, resolveWorldCollisions } from './WorldLayout';

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

  it('reports resting contact and the outward building normal without overlap', () => {
    const obstacle = getWorldObstacles()[0];
    const contact = getWorldWallContact(obstacle.x - 19, obstacle.y + obstacle.height / 2, 19);
    expect(contact?.normalX).toBeCloseTo(-1);
    expect(contact?.normalY).toBeCloseTo(0);
  });

  it('queries only nearby collision geometry', () => {
    const obstacle = getWorldObstacles()[0];
    const nearby = getNearbyWorldObstacles(obstacle.x + 10, obstacle.y + 10, 40);
    expect(nearby.some((candidate) => candidate.id === obstacle.id)).toBe(true);
    expect(nearby.length).toBeLessThan(8);
  });

  it('stops a sightline on the near wall of a building', () => {
    const obstacle = getWorldObstacles().find(candidate => candidate.kind === 'tower')!;
    const originX = obstacle.x - 80;
    const originY = obstacle.y + obstacle.height / 2;
    const hit = raycastWorldObstacles(originX, originY, 36, 1, 0, 0, 200);

    expect(hit?.obstacle.id).toBe(obstacle.id);
    expect(hit?.x).toBeCloseTo(obstacle.x);
    expect(hit?.y).toBeCloseTo(originY);
    expect(hit?.z).toBeCloseTo(36);
  });

  it('can hit a rooftop while looking down from above', () => {
    const obstacle = getWorldObstacles().find(candidate => candidate.kind === 'tower')!;
    const originX = obstacle.x - 80;
    const originY = obstacle.y + obstacle.height / 2;
    const originZ = obstacle.elevation + 80;
    const hit = raycastWorldObstacles(originX, originY, originZ, 1, 0, -1, 200);

    expect(hit?.obstacle.id).toBe(obstacle.id);
    expect(hit?.z).toBeCloseTo(obstacle.elevation);
    expect(hit?.distance).toBeCloseTo(80);
  });

  it('keeps the expanded arena boundary authoritative', () => {
    const position = { x: GAME_WIDTH + 500, y: GAME_HEIGHT + 500 };
    resolveWorldCollisions(position, 18);
    expect(position.x).toBe(GAME_WIDTH - 18);
    expect(position.y).toBe(GAME_HEIGHT - 18);
  });

  it('can resolve architecture without manufacturing a world-edge wall', () => {
    const position = { x: GAME_WIDTH + 500, y: GAME_HEIGHT + 500 };
    resolveWorldCollisions(position, 18, false);
    expect(position).toEqual({ x: GAME_WIDTH + 500, y: GAME_HEIGHT + 500 });
  });
});
