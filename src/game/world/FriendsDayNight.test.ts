import { describe, expect, it } from 'vitest';
import { FRONTIER_DAY_DURATION_MS, sampleFrontierDayNight } from './FriendsDayNight';
const atHour = (hour:number) => sampleFrontierDayNight(((hour - 9 + 24) % 24) * 60000);

describe('shared Frontier celestial clock', () => {
  it('starts at 09:00 and uses world elapsed time for late joiners', () => {
    expect(sampleFrontierDayNight(0)).toMatchObject({clock:'09:00',day:1,phase:'Day'});
    expect(sampleFrontierDayNight(300000)).toMatchObject({clock:'14:00',day:1});
    expect(sampleFrontierDayNight(300000)).toEqual(sampleFrontierDayNight(300000));
    expect(sampleFrontierDayNight(900000)).toMatchObject({clock:'00:00',day:2,phase:'Night'});
    expect(sampleFrontierDayNight(FRONTIER_DAY_DURATION_MS)).toMatchObject({clock:'09:00',day:2});
  });
  it('has sunrise, sunset and distinct moonlit nights', () => {
    expect(atHour(6)).toMatchObject({phase:'Dawn'});
    expect(atHour(18)).toMatchObject({phase:'Dusk'});
    expect(atHour(12).daylight).toBe(1);
    expect(atHour(12).sunIntensity).toBe(1.85);
    expect(atHour(12).stars).toBe(0);
    expect(atHour(0).daylight).toBe(0);
    expect(atHour(0).sunIntensity).toBe(0);
    expect(atHour(0).stars).toBe(1);
    expect(atHour(0).moonIntensity).toBeGreaterThan(0);
    expect(atHour(0).ambientIntensity).toBeGreaterThan(0);
    expect(atHour(6).sunDirection[1]).toBeCloseTo(0);
    expect(atHour(18).sunDirection[1]).toBeCloseTo(0);
    expect(atHour(7).sunDirection[1]).toBeGreaterThan(atHour(6).sunDirection[1]);
  });
  it('wraps continuously at midnight and at the full-cycle seam', () => {
    for(const time of [900000,FRONTIER_DAY_DURATION_MS]){
      const before=sampleFrontierDayNight(time-1),after=sampleFrontierDayNight(time+1);
      for(const key of ['daylight','twilight','stars','sunIntensity','moonIntensity'] as const)expect(Math.abs(before[key]-after[key])).toBeLessThan(.0001);
      before.sunDirection.forEach((n,i)=>expect(Math.abs(n-after.sunDirection[i])).toBeLessThan(.0001));
    }
  });
  it('keeps normalized opposite orbits and finite lighting across many days', () => {
    for(let ms=0;ms<FRONTIER_DAY_DURATION_MS*5;ms+=5000){
      const s=sampleFrontierDayNight(ms);
      expect(Math.hypot(...s.sunDirection)).toBeCloseTo(1,7);
      s.sunDirection.forEach((v,i)=>expect(s.moonDirection[i]).toBe(-v));
      for(const key of ['daylight','twilight','stars'] as const){expect(s[key]).toBeGreaterThanOrEqual(0);expect(s[key]).toBeLessThanOrEqual(1);}
    }
    for(const ms of [-1,NaN,Infinity])expect(sampleFrontierDayNight(ms).clock).toBe('09:00');
  });
});
