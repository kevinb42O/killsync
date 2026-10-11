import { describe,it,expect,vi } from 'vitest';
import { FriendsSoaringAudio,soaringVarioProfile } from './FriendsSoaringAudio';
import { createSoaringState } from './multiplayer/FriendsSoaring';
function setup(){
  const voices:any[]=[],gains:any[]=[],filters:any[]=[];
  const param=()=>({value:0,setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),setTargetAtTime:vi.fn()});
  const node=()=>({connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn(),frequency:param(),playbackRate:param(),onended:undefined});
  const c={currentTime:0,state:'running',createOscillator:()=>{const n=node();voices.push(n);return n;},createBufferSource:()=>{const n=node();voices.push(n);return n;},createGain:()=>{const n={gain:param(),connect:vi.fn(),disconnect:vi.fn()};gains.push(n);return n;},createBiquadFilter:()=>{const n={frequency:param(),Q:param(),connect:vi.fn(),disconnect:vi.fn()};filters.push(n);return n;}};
  const bus=c.createGain(),audio=new FriendsSoaringAudio(c as any,bus as any,bus as any),wing={...createSoaringState(0),phase:'flying' as const,inflation:1,airspeed:9.5,climb:1};
  return {c,audio,voices,gains,filters,wing};
}
describe('soaring audio',()=>{
  it('keeps trim sink quiet and makes stronger lift faster and higher',()=>{
    expect(soaringVarioProfile(-1.05).mode).toBe('quiet');expect(soaringVarioProfile(.24).mode).toBe('quiet');
    const weak=soaringVarioProfile(.5),strong=soaringVarioProfile(5);
    expect(strong.frequency).toBeGreaterThan(weak.frequency);expect(strong.interval).toBeLessThan(weak.interval);expect(strong.duration).toBeLessThan(strong.interval);
    expect(soaringVarioProfile(-3).mode).toBe('sink');expect(soaringVarioProfile(-6).frequency).toBeLessThan(soaringVarioProfile(-3).frequency);
    expect(soaringVarioProfile(5,true).mode).toBe('warning');
  });
  it('switches out of pulses immediately and holds one continuous sink oscillator',()=>{
    const {c,audio,voices,wing}=setup();audio.update(wing,undefined,[]);const climb=voices[0];
    c.currentTime=.05;audio.update({...wing,climb:-4},undefined,[]);const sink=voices[1];expect(climb.disconnect).toHaveBeenCalled();
    for(let i=0;i<100;i++){c.currentTime+=.03;audio.update({...wing,climb:-4},undefined,[]);}
    expect(voices).toHaveLength(2);expect(sink.stop).not.toHaveBeenCalled();
    audio.update({...wing,climb:-1},undefined,[]);expect(sink.stop).toHaveBeenCalled();expect(sink.disconnect).toHaveBeenCalled();
  });
  it('owns one speed-responsive wind loop and releases all sources and nodes on exit',()=>{
    const {c,audio,voices,gains,filters,wing}=setup(),buffer={duration:4} as AudioBuffer;
    audio.update(wing,buffer,[buffer]);const wind=voices.find(v=>v.loop);expect(wind).toBeDefined();
    const filter=filters[0],slow=filter.frequency.setTargetAtTime.mock.calls.at(-1)[0];
    c.currentTime=.2;audio.update({...wing,airspeed:13.5,brake:.7},buffer,[buffer]);
    expect(filter.frequency.setTargetAtTime.mock.calls.at(-1)[0]).toBeGreaterThan(slow);expect(voices.filter(v=>v.loop)).toHaveLength(1);
    audio.update(undefined,buffer,[buffer]);for(const voice of voices)expect(voice.disconnect).toHaveBeenCalled();expect(filter.disconnect).toHaveBeenCalled();
    for(const gain of gains.slice(1))expect(gain.disconnect).toHaveBeenCalled();
  });
  it('detects gradual control movement rather than requiring a single-frame jump',()=>{
    const {c,audio,voices,wing}=setup(),cloth={duration:1} as AudioBuffer;
    for(let step=0;step<=8;step++){c.currentTime=step*.02;audio.update({...wing,climb:-1.05,brake:step*.02},undefined,[cloth]);}
    expect(voices).toHaveLength(1);expect(voices[0].buffer).toBe(cloth);
  });
  it('respects effects and ambience independently and prevents suspended-context playback',()=>{
    const {c,audio,voices,wing}=setup(),buffer={duration:4} as AudioBuffer;
    audio.update(wing,buffer,[],false,true);expect(voices).toHaveLength(1);expect(voices[0].loop).toBe(true);
    audio.update(wing,buffer,[],true,false);expect(voices[0].stop).toHaveBeenCalled();expect(voices).toHaveLength(2);
    c.state='suspended';audio.update(wing,buffer,[]);expect(voices[1].stop).toHaveBeenCalled();expect(voices).toHaveLength(2);
  });
});
