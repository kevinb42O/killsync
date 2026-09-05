/** Reusable broad-phase index for co-op collision and proximity queries. */
export class SpatialHash<T extends { x: number; y: number }> {
  private readonly buckets = new Map<number, T[]>();
  private readonly activeBuckets: T[][] = [];

  constructor(private readonly cellSize: number) {}

  rebuild(entities: readonly T[]) {
    // Only clear buckets populated by the previous rebuild. A long match can
    // visit much of the city; walking every historical cell would gradually
    // make rebuild cost depend on travel history rather than active entities.
    for (const bucket of this.activeBuckets) bucket.length = 0;
    this.activeBuckets.length = 0;
    for (const entity of entities) {
      const key = this.key(this.cell(entity.x), this.cell(entity.y));
      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = [];
        this.buckets.set(key, bucket);
      }
      if (bucket.length === 0) this.activeBuckets.push(bucket);
      bucket.push(entity);
    }
  }

  /** Returns a cell-level superset; callers retain their exact distance test. */
  query(x: number, y: number, radius: number, output: T[] = []): T[] {
    output.length = 0;
    const minX = this.cell(x - radius), maxX = this.cell(x + radius);
    const minY = this.cell(y - radius), maxY = this.cell(y + radius);
    for (let cellY = minY; cellY <= maxY; cellY++) {
      for (let cellX = minX; cellX <= maxX; cellX++) {
        const bucket = this.buckets.get(this.key(cellX, cellY));
        if (bucket) output.push(...bucket);
      }
    }
    return output;
  }

  private cell(value: number) { return Math.floor(value / this.cellSize); }
  // Co-op cells stay well inside signed 16-bit coordinates, allowing a
  // numeric key without allocating template strings in every hot query.
  private key(x: number, y: number) { return ((x & 0xffff) << 16) | (y & 0xffff); }
}
