import { describe, expect, it } from 'vitest';
import { FriendsEnvironmentPreview } from './FriendsEnvironmentPreview';
describe('local Frontier development clock',()=>{
  it('sets exact phases, changes speed continuously and pauses independently of wind',()=>{
    const preview=new FriendsEnvironmentPreview();
    expect(preview.time(180000,5000)).toBe(180000);expect(preview.state.clock).toBe('12:00');
    preview.change({hour:18,speed:0});expect(preview.state.clock).toBe('18:00');
    preview.time(240000,15000);expect(preview.state.clock).toBe('18:00');expect(preview.windSeconds).toBe(15);
    preview.change({speed:10});const before=preview.state.elapsedMs;
    expect(preview.time(246000,21000)).toBe(before+60000);expect(preview.state.clock).toBe('19:00');
    preview.change({speed:.25});expect(preview.state.elapsedMs).toBe(before+60000);
    expect(preview.time(250000,25000)).toBe(before+61000);
  });
  it('reanchors wind without teleporting and resets to the shared world',()=>{
    const preview=new FriendsEnvironmentPreview();preview.time(300000,10000);
    preview.change({windSpeed:4});expect(preview.windSeconds).toBe(10);
    preview.time(301000,11000);expect(preview.windSeconds).toBe(14);
    preview.change({windSpeed:0,hour:0});preview.time(302000,12000);expect(preview.windSeconds).toBe(14);
    expect(preview.state.clock).toBe('00:01');
    preview.change({reset:true});expect(preview.state.enabled).toBe(false);expect(preview.state.elapsedMs).toBe(302000);
    expect(preview.speed).toBe(1);expect(preview.windSpeed).toBe(1);expect(preview.windSeconds).toBe(14);
  });
});
