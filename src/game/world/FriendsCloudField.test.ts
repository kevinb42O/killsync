import { describe, expect, it } from 'vitest';
import { createFrontierCloudField } from './FriendsCloudField';

describe('frontier cloud weather field',()=>{
  it('is repeatable without repeating cloud silhouettes, sizes or heights',()=>{
    const clouds=createFrontierCloudField();expect(clouds).toEqual(createFrontierCloudField());expect(clouds).toHaveLength(78);
    expect(new Set(clouds.map(c=>c.shape.join(','))).size).toBe(clouds.length);
    const widths=clouds.map(c=>c.width),heights=clouds.map(c=>c.height),altitudes=clouds.map(c=>c.altitude);
    expect(Math.max(...widths)/Math.min(...widths)).toBeGreaterThan(4);expect(Math.max(...heights)/Math.min(...heights)).toBeGreaterThan(4);expect(Math.max(...altitudes)-Math.min(...altitudes)).toBeGreaterThan(1500);
  });
  it('has irregular spacing, clear openings and no rows of clouds',()=>{
    const clouds=createFrontierCloudField(),nearest=clouds.map(c=>Math.min(...clouds.filter(other=>other!==c).map(other=>Math.hypot(c.x-other.x,c.z-other.z))));
    expect(new Set(clouds.map(c=>Math.floor(c.x))).size).toBe(clouds.length);expect(new Set(clouds.map(c=>Math.floor(c.z))).size).toBe(clouds.length);
    expect(Math.max(...nearest)/Math.min(...nearest)).toBeGreaterThan(3);
  });
});
