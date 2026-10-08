import { describe, expect, it } from 'vitest';
import { effectCalibration } from './FriendsAudioMix';

function sample(values: number[], sampleRate = 1000): AudioBuffer {
  const data=Float32Array.from(values);
  return {sampleRate,duration:data.length/sampleRate,length:data.length,numberOfChannels:1,getChannelData:()=>data} as unknown as AudioBuffer;
}
describe('Friends effect mix calibration',()=>{
  it('reduces an oversized reload attack instead of raising its silent tail',()=>{
    const attack=new Array(100).fill(1.8), short=sample(attack), long=sample([...attack,...new Array(2000).fill(0)]);
    const trim=effectCalibration(short,'reloadShotgun');
    expect(trim).toBeCloseTo(effectCalibration(long,'reloadShotgun'));
    expect(trim*1.8).toBeLessThan(.64);
  });
  it('matches continuous step attacks across different recording levels',()=>{
    const quiet=sample(new Array(200).fill(.05)), loud=sample(new Array(200).fill(.4));
    expect(effectCalibration(quiet,'mudStep')*.05).toBeCloseTo(effectCalibration(loud,'stoneStep')*.4);
  });
  it('keeps reload handling below even the quietest weapon report at their actual event gains',()=>{
    const recording=sample(new Array(200).fill(.4));
    const report=effectCalibration(recording,'gunfire')*.2;
    for(const cue of ['reloadRifle','reloadHandgun','reloadShotgun'] as const)
      expect(effectCalibration(recording,cue)*.6).toBeLessThan(report*.71);
  });
  it('preserves sparse transient headroom and bounds boosts of faint recordings',()=>{
    const sparse=sample([1.4,...new Array(199).fill(.001)]);
    expect(effectCalibration(sparse,'grass')*1.4).toBeLessThan(.71);
    expect(effectCalibration(sample(new Array(200).fill(.001)),'eat')).toBe(4);
  });
  it('keeps the intentionally quiet tool swish and treats silence safely',()=>{
    expect(effectCalibration(sample(new Array(200).fill(.8)),'swing')).toBe(1);
    expect(effectCalibration(sample(new Array(200).fill(0)),'caveDrip')).toBe(1);
  });
  it('uses the loudest channel, including very short UI recordings',()=>{
    const quiet=sample(new Array(20).fill(.1));
    const stereo={...quiet,numberOfChannels:2,getChannelData:(i:number)=>Float32Array.from(new Array(20).fill(i?.8:.1))} as unknown as AudioBuffer;
    expect(effectCalibration(stereo,'click')).toBeLessThan(effectCalibration(quiet,'click'));
  });
});
