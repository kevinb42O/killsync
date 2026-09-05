import { describe, expect, it } from 'vitest';
import { SpatialHash } from './SpatialHash';

describe('SpatialHash', () => {
  it('returns nearby-cell candidates without scanning distant entities', () => {
    const index = new SpatialHash<{ id: number; x: number; y: number }>(100);
    const entities = [
      { id: 1, x: 20, y: 20 },
      { id: 2, x: 145, y: 20 },
      { id: 3, x: 4_000, y: 4_000 },
    ];
    index.rebuild(entities);

    expect(index.query(20, 20, 130).map(entity => entity.id).sort()).toEqual([1, 2]);
  });

  it('reuses a caller-owned result buffer and tracks moved entities after rebuild', () => {
    const index = new SpatialHash<{ id: number; x: number; y: number }>(64);
    const entity = { id: 1, x: 10, y: 10 };
    const output: typeof entity[] = [];
    index.rebuild([entity]);
    expect(index.query(10, 10, 5, output)).toBe(output);
    entity.x = 500;
    index.rebuild([entity]);
    expect(index.query(10, 10, 5, output)).toEqual([]);
    expect(index.query(500, 10, 5, output)).toEqual([entity]);
  });
});
