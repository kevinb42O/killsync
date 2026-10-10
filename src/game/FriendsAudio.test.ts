import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { crossfadeLoop, FRIENDS_CUE_ASSETS, FriendsAudio, friendsAudio } from './FriendsAudio';
import { SoundManager } from './SoundManager';
import { effectCalibration } from './FriendsAudioMix';
import { QUIET_WORLD_SOUND } from './FriendsWorldSound';

function buffer(values: number[], channels = 1, sampleRate = 1) {
  const arrays = Array.from({ length: channels }, () => Float32Array.from(values));
  return { numberOfChannels: channels, length: values.length, sampleRate, duration: values.length / sampleRate, getChannelData: (channel: number) => arrays[channel] } as AudioBuffer;
}
describe('downloaded Friends audio', () => {
  let context: any, sources: any[], gains: any[], doc: EventTarget & { hidden: boolean }, audio: FriendsAudio;
  let releases: (() => void)[];
  const decoded = buffer(Array.from({ length: 100 }, (_, i) => i / 100), 2, 10);
  beforeEach(() => {
    vi.useFakeTimers(); sources = []; gains = []; releases = [];
    const events = new EventTarget(); doc = Object.assign(new EventTarget(), { hidden: false });
    context = {
      currentTime: 10, sampleRate: 44100, state: 'running', destination: {},
      resume: vi.fn(async () => { context.state = 'running'; }), suspend: vi.fn(async () => { context.state = 'suspended'; }),
      close: vi.fn(async () => { context.state = 'closed'; }),
      createBuffer: vi.fn((channels: number, size: number, rate: number) => buffer(new Array(size).fill(0), channels, rate)),
      decodeAudioData: vi.fn(async () => decoded), createOscillator: vi.fn(),
      createGain: vi.fn(() => { const gain = { gain: { value: 1, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }; gains.push(gain); return gain; }),
      createBiquadFilter: vi.fn(()=>({type:'lowpass',frequency:{value:22000,setTargetAtTime:vi.fn()},Q:{value:1},connect:vi.fn(),disconnect:vi.fn()})),
      createBufferSource: vi.fn(() => { const source = { buffer: null, loop: false, playbackRate: { value: 1, setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: undefined }; sources.push(source); return source; }),
    };
    function AudioContextMock() { return context; }
    vi.stubGlobal('window', { AudioContext: AudioContextMock, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) });
    vi.stubGlobal('document', doc);
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      expect(existsSync(resolve('public', url.replace(/^\//, ''))), `missing bundled asset: ${url}`).toBe(true);
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
    }));
    audio = new FriendsAudio();
  });
  afterEach(() => { releases.forEach(release => release()); vi.runOnlyPendingTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  const load = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  it('plays single randomized drops with sparse gaps, no loop and no immediate repeats',async()=>{
    vi.spyOn(Math,'random').mockReturnValue(.5);
    releases.push(audio.acquire());audio.activate();await load();
    const mix={...QUIET_WORLD_SOUND,drip:{volume:.12,pan:.4},dripSource:'blue'};
    audio.setWorldSound(mix);await load();
    expect(vi.mocked(fetch).mock.calls.filter(([u])=>String(u).includes('cave_drips'))).toHaveLength(5);
    const state=audio as any, before=sources.length;
    context.currentTime=19;audio.setWorldSound(mix);expect(sources.length).toBe(before);
    context.currentTime=19.5;audio.setWorldSound(mix);
    const first=sources.at(-1),variant=state.lastVariant.get('caveDrip');
    expect(first.loop).toBe(false);expect(state.dripVoice).toBe(first);
    expect(first.playbackRate.value).toBe(1);
    expect(state.nextDrip-context.currentTime).toBeGreaterThanOrEqual(10);
    expect(state.nextDrip-context.currentTime).toBeLessThanOrEqual(36);
    context.currentTime=20;audio.setWorldSound(mix);expect(sources.at(-1)).toBe(first);
    first.onended();context.currentTime=state.nextDrip+.01;audio.setWorldSound(mix);
    expect(state.lastVariant.get('caveDrip')).not.toBe(variant);
    expect(sources.at(-1)).not.toBe(first);
  });
  it('stops an active drop on leaving the wet room and waits again after re-entry, mute and hiding',async()=>{
    vi.spyOn(Math,'random').mockReturnValue(0);
    releases.push(audio.acquire());audio.activate();await load();
    const mix={...QUIET_WORLD_SOUND,drip:{volume:.12,pan:0},dripSource:'blue'};
    audio.setWorldSound(mix);await load();context.currentTime=15;audio.setWorldSound(mix);
    const voice=(audio as any).dripVoice;expect(voice).toBeDefined();
    audio.setWorldSound(QUIET_WORLD_SOUND);expect(voice.stop).toHaveBeenCalled();
    context.currentTime=50;const before=sources.length;audio.setWorldSound(mix);
    expect(sources.length).toBe(before);expect((audio as any).nextDrip).toBe(55);
    audio.setWorldSound({...mix,dripSource:'well'});expect((audio as any).dripSource).toBe('well');
    audio.setSettings({ambience:0});expect((audio as any).nextDrip).toBe(0);
    audio.setSettings({ambience:.5});audio.setWorldSound(mix);
    doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));expect((audio as any).nextDrip).toBe(0);
  });
  it('loads world beds lazily, shares sources and routes the reel through Effects', async () => {
    releases.push(audio.acquire()); audio.activate(); await load();
    expect(vi.mocked(fetch).mock.calls.some(([url])=>/cave_air|waterfall|reel_motor/.test(String(url)))).toBe(false);
    const before=sources.length;
    audio.setWorldSound({...QUIET_WORLD_SOUND,caveAir:{volume:.05,pan:0},waterfall:{volume:.3,pan:.5}});
    audio.setReelSound({volume:.2,pan:0,rate:1.1}); await load();
    expect(sources.length).toBe(before+3);
    const state=audio as any, reel=state.worldLoops.get('reel'), falls=state.worldLoops.get('waterfall');
    expect(reel.filter.connect).toHaveBeenCalledWith(gains[0]);
    expect(falls.filter.connect).toHaveBeenCalledWith(gains[2]);
    for(let i=0;i<50;i++) { audio.setWorldSound({...QUIET_WORLD_SOUND,waterfall:{volume:.3,pan:.5}}); audio.setReelSound({volume:.2,pan:0,rate:1.1}); }
    expect(state.worldLoops.get('reel').source).toBe(reel.source);
    expect(state.worldLoops.get('waterfall').source).toBe(falls.source);
    audio.setSettings({ambience:0}); expect(falls.source.stop).toHaveBeenCalled();
    expect(state.worldLoops.get('reel').source).toBe(reel.source);
    audio.setReelSound({volume:0,pan:0}); expect(reel.source.stop).toHaveBeenCalledWith(context.currentTime+.18);
    audio.clearSoundscape(); expect(state.worldLoops.size+state.retiringWorldSources.size).toBe(0);
  });
  it('loads the ocean hiss only on approach, reuses one loop, and releases it on mute and exit',async()=>{
    releases.push(audio.acquire());audio.activate();await load();
    expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes('ocean_steam_loop'))).toBe(false);
    const mix={...QUIET_WORLD_SOUND,oceanSteam:{volume:.3,pan:.2,cutoff:7600}};
    audio.setWorldSound(mix);await load();const state=audio as any,loop=state.worldLoops.get('oceanSteam');expect(loop.source.loop).toBe(true);
    for(let i=0;i<50;i++)audio.setWorldSound({...mix,oceanSteam:{volume:.2,pan:-.3,cutoff:2000}});
    expect(state.worldLoops.get('oceanSteam').source).toBe(loop.source);expect(vi.mocked(fetch).mock.calls.filter(([url])=>String(url).includes('ocean_steam_loop'))).toHaveLength(1);
    audio.setSettings({ambience:0});expect(loop.source.stop).toHaveBeenCalled();audio.clearSoundscape();expect(state.worldLoops.size+state.retiringWorldSources.size).toBe(0);
  });
  it('schedules treasure layers and cancels them on mute, hidden tab and exit', async () => {
    releases.push(audio.acquire()); audio.activate(); await load();
    const before=sources.length; audio.treasure(.34,.5);
    const layers=sources.slice(before); expect(layers).toHaveLength(4);
    expect(layers.map(s=>s.start.mock.calls[0][0])).toEqual([10,10.1,10.38,10.6]);
    audio.setSettings({muted:true}); expect(layers.every(s=>s.stop.mock.calls.length===1)).toBe(true);
    audio.setSettings({muted:false}); context.currentTime+=1; audio.treasure(.34);
    const hidden=sources.slice(-4); doc.hidden=true; doc.dispatchEvent(new Event('visibilitychange'));
    expect(hidden.every(s=>s.stop.mock.calls.length===1)).toBe(true);
    doc.hidden=false; doc.dispatchEvent(new Event('visibilitychange')); await load();
    context.currentTime+=1; audio.treasure(.34); const exiting=sources.slice(-4);
    releases[0](); vi.runOnlyPendingTimers(); expect(exiting.every(s=>s.stop.mock.calls.length===1)).toBe(true);
  });
  it('keeps ambience effects independent when Effects volume is disabled', async () => {
    releases.push(audio.acquire()); audio.activate(); await load();
    const ambient=audio.play('leaves',.1,0,1,undefined,{ambience:true});
    const effect=audio.play('flashlight',.14,0);
    audio.setSettings({effects:0});
    expect(effect!.stop).toHaveBeenCalledOnce(); expect(ambient!.stop).not.toHaveBeenCalled();
  });
  it('does not decode silent environmental beds and releases surf/crickets when they become inaudible',async()=>{
    releases.push(audio.acquire());audio.activate();await load();
    const quiet={wind:0,birds:0,crickets:0,surf:0,foliage:0,foliagePan:0};
    audio.setSoundscape(quiet);await load();
    expect(vi.mocked(fetch).mock.calls.some(([u])=>/\/(crickets|surf|wind_clean|campfire_woods)\.ogg$/.test(String(u)))).toBe(false);
    audio.setSoundscape({...quiet,crickets:.1,surf:.2});await load();
    const state=audio as any, beds=[...state.ambientLoops.values()];expect(beds).toHaveLength(2);
    audio.setSoundscape(quiet);expect(state.ambientLoops.size).toBe(0);
    expect(beds.every((b:any)=>b.source.stop.mock.calls[0][0]===context.currentTime+1)).toBe(true);
    beds.forEach((b:any)=>b.source.onended());expect(state.retiringAmbienceSources.size).toBe(0);
    audio.setSoundscape({...quiet,crickets:.1,surf:.2});await load();
    expect(vi.mocked(fetch).mock.calls.filter(([u])=>/\/(crickets|surf)\.ogg$/.test(String(u)))).toHaveLength(2);
  });
  it('loads real bundled files and starts only one loop after a gesture', async () => {
    releases.push(audio.acquire());
    expect(sources).toHaveLength(0);
    audio.activate(); await load(); audio.activate(); await load();
    expect(sources.filter(source => source.loop)).toHaveLength(1);
    expect(context.createOscillator).not.toHaveBeenCalled();
    const requests = vi.mocked(fetch).mock.calls.map(call => call[0]);
    expect(requests.filter(url => String(url).endsWith('exploration.ogg'))).toHaveLength(1);
    expect(requests.some(url => String(url).endsWith('vaporware.mp3') || String(url).endsWith('castle.ogg'))).toBe(false);
  });
  it('bounds rapid effects, rotates samples, and respects mute and zero effects', async () => {
    releases.push(audio.acquire()); audio.activate(); await load();
    const initial = sources.length;
    audio.play('wood'); audio.play('wood');
    expect(sources).toHaveLength(initial + 1);
    context.currentTime += .2; audio.play('wood');
    expect(sources).toHaveLength(initial + 2);
    expect(vi.mocked(fetch).mock.calls.some(call => String(call[0]).includes('impactWood_medium_001'))).toBe(true);
    audio.setSettings({ effects: 0 }); audio.play('stone');
    expect(sources).toHaveLength(initial + 2);
    audio.setSettings({ effects: .5, muted: true }); audio.play('stone');
    expect(sources).toHaveLength(initial + 2);
    expect(sources.find(source => source.loop).stop).toHaveBeenCalledOnce();
  });
  it('preloads the short eating recording and plays it once through the effects bus, respecting mute',async()=>{
    releases.push(audio.acquire());audio.activate();await load();
    expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).endsWith('/eat.ogg'))).toBe(true);
    const initial=sources.length;
    audio.play('eat',.22,1000);audio.play('eat',.22,1000);
    expect(sources).toHaveLength(initial+1);expect(sources.at(-1).buffer).toBe(decoded);
    expect(gains.at(-1).gain.value).toBeCloseTo(.22*effectCalibration(decoded,'eat'));expect(gains.at(-1).connect).toHaveBeenCalledWith(gains[0]);
    context.currentTime+=6;audio.setSettings({effects:0});audio.play('eat',.22,1000);expect(sources).toHaveLength(initial+1);
    audio.setSettings({effects:.65,muted:true});audio.play('eat',.22,1000);expect(sources).toHaveLength(initial+1);
  });
  it('fades trimmed water strokes smoothly instead of cutting off the splash tail', async () => {
    releases.push(audio.acquire()); audio.activate(); await load();
    const before = sources.length;
    audio.play('swimStroke', .25, 0, 1, .62, { fadeOutSeconds: .14 });
    expect(sources).toHaveLength(before + 1);
    expect(sources.at(-1).start).toHaveBeenCalledWith(context.currentTime, 0, .62);
    const [strokeLevel, fadeStart] = gains.at(-1).gain.setValueAtTime.mock.calls[0];
    expect(strokeLevel).toBeGreaterThan(0);
    expect(fadeStart).toBeCloseTo(context.currentTime + .48);
    const [fadeLevel, fadeEnd] = gains.at(-1).gain.linearRampToValueAtTime.mock.calls[0];
    expect(fadeLevel).toBe(0);
    expect(fadeEnd).toBeCloseTo(context.currentTime + .62);
  });
  it('plays the entry splash once and loops the entire submerged recording until resurfacing', async () => {
    releases.push(audio.acquire()); audio.activate(); await load();
    const before = sources.length;
    audio.setUnderwaterDive(true);
    expect(sources).toHaveLength(before + 2);
    const splash = sources.at(-2);
    expect(splash.loop).toBe(false);
    const dive = sources.at(-1);
    expect(dive.loop).toBe(true);
    expect(dive.loopStart).toBe(0);
    expect(dive.loopEnd).toBe(decoded.duration);
    expect(dive.start).toHaveBeenCalledWith(context.currentTime, 0);
    audio.setUnderwaterDive(true);
    expect(sources).toHaveLength(before + 2);
    audio.setUnderwaterDive(false);
    expect(dive.stop).toHaveBeenCalledWith(context.currentTime + .2);
  });
  it('muffles both world buses, suppresses surface splashes and restores the dry mix',async()=>{
    releases.push(audio.acquire());audio.activate();await load();const state=audio as any;
    audio.setUnderwaterDive(true);const voice=state.underwaterDiveVoice.source,n=sources.length;
    expect(state.effectsGain.connect).toHaveBeenCalledWith(state.effectsWaterFilter);
    expect(state.ambienceGain.connect).toHaveBeenCalledWith(state.ambienceWaterFilter);
    expect(state.effectsWaterFilter.frequency.setTargetAtTime).toHaveBeenLastCalledWith(850,context.currentTime,.09);
    expect(state.ambienceWaterFilter.frequency.setTargetAtTime).toHaveBeenLastCalledWith(650,context.currentTime,.12);
    audio.play('swimStroke',.25,0);audio.play('waterStep',.25,0);expect(sources).toHaveLength(n);
    audio.setSettings({effects:.6,ambience:.5});expect(state.effectsGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(.48,context.currentTime,.05);expect(state.ambienceGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(.125,context.currentTime,.25);
    expect(state.underwaterDiveVoice.source).toBe(voice);
    expect(state.underwaterDiveVoice.gain.connect).toHaveBeenCalledWith(context.destination);
    expect(state.underwaterDiveVoice.gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(.33,context.currentTime,.05);
    audio.setUnderwaterDive(false);expect(state.effectsWaterFilter.frequency.setTargetAtTime).toHaveBeenLastCalledWith(22000,context.currentTime,.09);
    expect(state.ambienceGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(.5,context.currentTime,.25);
    audio.play('swimStroke',.25,0);expect(sources).toHaveLength(n+1);
  });
  it('clears underwater mixing when leaving a world and reacquiring audio',async()=>{
    const release=audio.acquire();audio.activate();await load();audio.setUnderwaterDive(true);release();vi.advanceTimersByTime(0);
    expect((audio as any).effectsWaterFilter.frequency.setTargetAtTime).toHaveBeenLastCalledWith(22000,context.currentTime,.09);
    releases.push(audio.acquire());audio.activate();expect((audio as any).underwaterDiveRequested).toBe(false);
  });
  it('stops and restores the submerged loop with mute and Effects volume', async () => {
    releases.push(audio.acquire()); audio.activate(); await load();
    audio.setUnderwaterDive(true);
    const first = (audio as any).underwaterDiveVoice.source;
    audio.setSettings({ muted: true });
    expect(first.stop).toHaveBeenCalled();
    expect((audio as any).underwaterDiveVoice).toBeUndefined();
    audio.setSettings({ muted: false });
    const resumed = (audio as any).underwaterDiveVoice.source;
    expect(resumed).not.toBe(first);
    expect(resumed.loopStart).toBe(0);
    audio.setSettings({ effects: 0 });
    expect(resumed.stop).toHaveBeenCalled();
    expect((audio as any).underwaterDiveVoice).toBeUndefined();
    audio.setSettings({ effects: .7 });
    expect((audio as any).underwaterDiveVoice).toBeDefined();
    audio.setUnderwaterDive(false);
    expect((audio as any).underwaterDiveVoice).toBeUndefined();
  });
  it('does not endlessly reload a failed dive asset and can retry on the next dive', async () => {
    releases.push(audio.acquire()); audio.activate(); await load();
    const url = FRIENDS_CUE_ASSETS.waterSubmerged[0];
    (audio as any).buffers.delete(url);
    const failed = vi.fn(async () => ({ ok: false }));
    vi.stubGlobal('fetch', failed);
    audio.setUnderwaterDive(true); await load(); await load();
    expect(failed).toHaveBeenCalledTimes(1);
    expect((audio as any).underwaterDiveVoice).toBeUndefined();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })));
    audio.setUnderwaterDive(false); audio.setUnderwaterDive(true); await load();
    expect((audio as any).underwaterDiveVoice).toBeDefined();
  });
  it('plays a short inhale after the resurfacing splash and cancels it if diving again', async () => {
    releases.push(audio.acquire()); audio.activate(); await load();
    audio.resurfaceFromDive();
    expect((audio as any).lastCue.has('waterEntry')).toBe(true);
    vi.advanceTimersByTime(419);
    expect((audio as any).lastCue.has('waterBreathIn')).toBe(false);
    vi.advanceTimersByTime(1);
    expect((audio as any).lastCue.has('waterBreathIn')).toBe(true);
    context.currentTime += 1;
    audio.resurfaceFromDive();
    const breathsBefore = (audio as any).lastCue.get('waterBreathIn');
    vi.advanceTimersByTime(200);
    audio.setUnderwaterDive(true);
    vi.advanceTimersByTime(300);
    expect((audio as any).lastCue.get('waterBreathIn')).toBe(breathsBefore);
  });
  it('waits for the inhale asset if it has not finished preloading at the resurfacing cue', async () => {
    releases.push(audio.acquire()); audio.activate(); await load();
    (audio as any).buffers.delete(FRIENDS_CUE_ASSETS.waterBreathIn[0]);
    audio.resurfaceFromDive();
    vi.advanceTimersByTime(420);
    await load();
    expect((audio as any).lastCue.has('waterBreathIn')).toBe(true);
  });
  it('prepares flight rustles only in dev flight, rotates recordings and respects effects volume', async () => {
    releases.push(audio.acquire()); audio.activate(); await load();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('flight_foliage'))).toBe(false);
    audio.prepareFlightFoliage(); await load();
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes('flight_foliage'))).toHaveLength(3);
    const before = sources.length;
    audio.play('flightFoliage', .3, 330, 1, .65); audio.play('flightFoliage', .3, 330, 1, .65);
    expect(sources.length).toBe(before + 1); expect(sources.at(-1).start).toHaveBeenCalledWith(context.currentTime, 0, .65);
    context.currentTime += .36; audio.play('flightFoliage', .3, 330, 1, .65); expect(sources.length).toBe(before + 2);
    audio.setSettings({ effects: 0 }); context.currentTime += 1; audio.play('flightFoliage'); expect(sources.length).toBe(before + 2);
  });
  it('crossfades castle music for eight seconds, reverses without duplicate loops, and resumes the main track', async () => {
    releases.push(audio.acquire()); audio.activate(); await load();
    const main = sources.at(-1), before = sources.length;
    context.currentTime += 10;
    audio.setCastleMusic(true); await load();
    const castle = sources.at(-1);
    expect(sources.length).toBe(before + 1); expect(castle.loop).toBe(true); expect(main.stop).not.toHaveBeenCalled();
    expect(gains.at(-1).gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, context.currentTime + 8);
    for (let i = 0; i < 20; i++) audio.setCastleMusic(true);
    expect(sources.length).toBe(before + 1);
    context.currentTime += 4; audio.setCastleMusic(false);
    expect(gains.at(-1).gain.setValueAtTime).toHaveBeenLastCalledWith(.5, context.currentTime);
    audio.setCastleMusic(true); expect(sources.length).toBe(before + 1);
    context.currentTime += 8; audio.setCastleMusic(true); expect(main.stop).toHaveBeenCalledOnce();
    audio.setCastleMusic(false); const resumed = sources.at(-1);
    expect(resumed).not.toBe(main); expect(resumed.start.mock.calls[0][1]).toBeGreaterThan(0);
    context.currentTime += 8; audio.setCastleMusic(false); expect(castle.stop).toHaveBeenCalledOnce();
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/castle.ogg'))).toHaveLength(1);
    audio.setSettings({ music: 0 }); expect(resumed.stop).toHaveBeenCalledOnce();
    audio.setSettings({ music: .28 }); const unmuted = sources.at(-1);
    releases[0](); vi.runOnlyPendingTimers(); expect(unmuted.stop).toHaveBeenCalledOnce();
  });
  it('keeps the main track during a pending castle download and ignores a stale area request', async () => {
    releases.push(audio.acquire()); audio.activate(); await load(); const main = sources.at(-1), before = sources.length;
    let finish: (() => void) | undefined;
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url: any, options?: any) => {
      if (String(url).endsWith('/castle.ogg')) await new Promise<void>(resolve => { finish = resolve; });
      return original(url, options);
    });
    audio.setCastleMusic(true); await load(); expect(sources.length).toBe(before); expect(main.stop).not.toHaveBeenCalled();
    audio.setCastleMusic(false); finish!(); await load(); expect(sources.length).toBe(before);
    audio.setCastleMusic(true); expect(sources.length).toBe(before + 1);
    audio.setSettings({ muted: true }); expect(main.stop).toHaveBeenCalledOnce(); expect(sources.at(-1).stop).toHaveBeenCalledOnce();
  });
  it('loads one positional campfire loop nearby, fades it out at range and honors the ambience slider', async () => {
    releases.push(audio.acquire()); audio.activate(); await load();
    const mix = { wind: 0, birds: 0, crickets: 0, surf: 0, foliage: 0, foliagePan: 0 };
    audio.setSoundscape(mix); await load();
    const requests = () => vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/campfire_woods.ogg'));
    expect(requests()).toHaveLength(0);
    const before = sources.length; audio.setCampfireSound({ volume: .3, pan: .6 }); await load();
    const fire = sources.at(-1); expect(fire.loop).toBe(true); expect(sources.length).toBe(before + 1);
    expect(gains.at(-1).connect).toHaveBeenCalledWith(gains[2]);
    for (let i = 0; i < 30; i++) audio.setCampfireSound({ volume: .4, pan: -.6 });
    expect(sources.length).toBe(before + 1);
    audio.setCampfireSound({ volume: 0, pan: 0 }); expect(fire.stop).toHaveBeenCalledWith(context.currentTime + 1);
    audio.setCampfireSound({ volume: .3, pan: 0 }); expect(requests()).toHaveLength(1);
    const resumed = sources.at(-1); audio.setSettings({ ambience: 0 }); expect(resumed.stop).toHaveBeenCalledOnce();
    audio.setSettings({ ambience: .5 }); const unmuted = sources.at(-1);
    audio.clearSoundscape(); expect(unmuted.stop).toHaveBeenCalledOnce();
  });
  it('survives a menu-to-world remount then cleans up all sources on exit', async () => {
    const release = audio.acquire(); audio.activate(); await load();
    release(); const worldRelease = audio.acquire(); releases.push(worldRelease); vi.runOnlyPendingTimers();
    expect(sources.find(source => source.loop).stop).not.toHaveBeenCalled();
    audio.play('grass'); worldRelease(); vi.runOnlyPendingTimers();
    expect(sources.find(source => source.loop).stop).toHaveBeenCalledOnce();
    expect(sources.at(-1).stop).toHaveBeenCalledOnce();
    const count = sources.length; audio.play('click'); expect(sources).toHaveLength(count);
  });
  it('suspends hidden tabs and resumes the same theme when visible', async () => {
    releases.push(audio.acquire()); audio.activate(); await load();
    const count = sources.length;
    doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); audio.play('click');
    expect(context.suspend).toHaveBeenCalledOnce(); expect(sources).toHaveLength(count);
    doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange')); await load();
    expect(context.resume).toHaveBeenCalledOnce();
    expect(sources.filter(source => source.loop)).toHaveLength(1);
  });
  it('retires all old audio on a live update and cannot restart from late downloads or stale references', async () => {
    releases.push(audio.acquire()); audio.activate(); await load();
    audio.setSoundscape({ wind: .3, birds: 0, crickets: 0, surf: 0, foliage: 0, foliagePan: 0 }); await load();
    const loops = sources.filter(source => source.loop);
    expect(loops).toHaveLength(2);
    audio.dispose();
    expect(loops.every(source => source.stop.mock.calls.length === 1)).toBe(true);
    expect(context.close).toHaveBeenCalledOnce();
    const count = sources.length;
    audio.acquire(); audio.activate(); audio.play('birdCall'); await load();
    expect(audio.active).toBe(false); expect(sources).toHaveLength(count);

    const loading = new FriendsAudio(); releases.push(loading.acquire()); loading.activate(); loading.dispose(); await load();
    expect(sources.filter(source => source.loop)).toHaveLength(2);
  });
  it('routes Friends gameplay to recordings without creating procedural audio', async () => {
    releases.push(friendsAudio.acquire()); const manager = new SoundManager(); manager.activate(); await load();
    manager.playJump(); manager.playFrontierHit('wood'); manager.playLanding(); manager.playUIClick(); manager.playGunfire();
    manager.updateJetpack(true); manager.updateTowerCharge(true, .5); manager.updateStationCapture(true, .5);
    expect(context.createOscillator).not.toHaveBeenCalled();
    expect(sources.filter(source => !source.loop && source.buffer === decoded)).toHaveLength(6);
  });
  it('loads nature only in the world, keeps bounded shared loops, and uses an independent ambience bus', async () => {
    releases.push(audio.acquire()); audio.activate(); await load();
    expect(vi.mocked(fetch).mock.calls.some(call => String(call[0]).endsWith('wind_clean.ogg'))).toBe(false);
    const mix = { wind: .3, birds: .2, crickets: .1, surf: 0, foliage: 0, foliagePan: 0 };
    audio.setSoundscape(mix); await load();
    expect(sources.filter(source => source.loop)).toHaveLength(3); // Music, wind, and night ambience. Birds never loop.
    for (let i = 0; i < 30; i++) audio.setSoundscape({ ...mix, birds: 0, crickets: .1 });
    expect(sources.filter(source => source.loop)).toHaveLength(3);
    audio.setSettings({ effects: 0 });
    expect(sources.filter(source => source.loop).every(source => !source.stop.mock.calls.length)).toBe(true);
    audio.setSettings({ ambience: 0 });
    expect(sources.filter(source => source.loop && source.stop.mock.calls.length)).toHaveLength(2);
    audio.setSettings({ ambience: .5 }); await load();
    expect(sources.filter(source => source.loop && !source.stop.mock.calls.length)).toHaveLength(3);
    audio.clearSoundscape();
    expect(sources.filter(source => source.loop && !source.stop.mock.calls.length)).toHaveLength(1);
    expect(context.createOscillator).not.toHaveBeenCalled();
  });
  it('loads trains only nearby, shares two movement loops, and stops them when parked or muted', async () => {
    releases.push(audio.acquire()); audio.activate(); await load();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('train_'))).toBe(false);
    const mix = { engine: .2, rail: .12, enginePan: 0, railPan: 0, rate: 1, nearby: true };
    audio.setTrainSound({ ...mix, engine: 0, rail: 0 }); await load();
    expect(sources.filter(s => s.loop)).toHaveLength(1);
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('train_horn'))).toBe(true);
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('train_drive'))).toBe(false);
    audio.setTrainSound(mix); await load();
    const motors = sources.filter(s => s.loop).slice(1); expect(motors).toHaveLength(2);
    for (let i = 0; i < 20; i++) audio.setTrainSound({ ...mix, rate: 1.1 });
    expect(sources.filter(s => s.loop)).toHaveLength(3);
    audio.setTrainSound({ ...mix, engine: 0, rail: 0 }); expect(motors.every(s => s.stop.mock.calls.length === 1)).toBe(true);
    audio.setSettings({ effects: 0 }); audio.setTrainSound(mix); expect(sources.filter(s => s.loop)).toHaveLength(3);
  });
  it('plays a dedicated jump once and reserves contact-surface layers for landing', async () => {
    releases.push(audio.acquire()); audio.activate(); await load();
    const play = vi.spyOn(audio, 'play');
    const before = sources.length;
    audio.takeoff(); audio.takeoff();
    expect(sources.length - before).toBe(1);
    expect(play.mock.calls.every(([cue]) => cue === 'jump')).toBe(true);
    const requests = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(requests.some(url => url.endsWith('/jump.ogg'))).toBe(true);
    expect(requests.some(url => /cloth[1-4]\.ogg$/.test(url))).toBe(false);
    context.currentTime += .2;
    audio.land('stoneStep', 1.4);
    expect(sources.length - before).toBe(3);
  });
  it('routes both Friends jump paths to jump audio, never a tool swing', async () => {
    releases.push(friendsAudio.acquire()); const manager = new SoundManager(); manager.activate(); await load();
    const play = vi.spyOn(friendsAudio, 'play');
    manager.playJump(); context.currentTime += .2; manager.playDoubleJump();
    expect(play.mock.calls.map(([cue]) => cue)).toEqual(['jump', 'jump']);
    play.mockRestore();
  });
  it('loads the coast on approach and shares one surf loop across shoreline updates', async () => {
    releases.push(audio.acquire()); audio.activate(); await load();
    const mix = { wind: .3, birds: .2, crickets: 0, surf: 0, foliage: 0, foliagePan: 0 };
    audio.setSoundscape(mix); await load();
    expect(vi.mocked(fetch).mock.calls.some(call => String(call[0]).endsWith('surf.ogg'))).toBe(false);
    audio.setSoundscape({ ...mix, surf: .4 }); await load();
    for (let i = 1; i <= 30; i++) audio.setSoundscape({ ...mix, surf: i / 100 });
    expect(sources.filter(source => source.loop)).toHaveLength(3);
    expect(vi.mocked(fetch).mock.calls.filter(call => String(call[0]).endsWith('surf.ogg'))).toHaveLength(1);
  });
  it('plays only short nearby bird calls after a dwell, with long gaps and no bird loop', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    releases.push(audio.acquire()); audio.activate(); await load();
    const mix = { wind: .3, birds: 0, crickets: 0, surf: 0, foliage: 0, foliagePan: 0 };
    audio.setSoundscape(mix); await load();
    expect(vi.mocked(fetch).mock.calls.some(call => String(call[0]).includes('bird_call'))).toBe(false);
    const before = sources.length;
    audio.setSoundscape({ ...mix, birds: .12, birdPan: .5 }); await load();
    expect(sources.length).toBe(before);
    context.currentTime += 11; audio.setSoundscape({ ...mix, birds: .12 });
    expect(sources.length).toBe(before);
    context.currentTime += 1; audio.setSoundscape({ ...mix, birds: .12 });
    expect(sources.length).toBe(before + 1); expect(sources.at(-1).loop).toBe(false);
    expect(sources.at(-1).start).toHaveBeenCalledWith(context.currentTime, 0, 1.2);
    context.currentTime += 10; audio.setSoundscape({ ...mix, birds: .12 });
    expect(sources.length).toBe(before + 1);
    context.currentTime += 40; audio.setSoundscape(mix);
    expect(sources.length).toBe(before + 1);
    expect(sources.at(-1).stop).toHaveBeenCalledOnce();
    audio.setSoundscape({ ...mix, birds: .12 }); context.currentTime += 12; audio.setSoundscape({ ...mix, birds: .12 });
    expect(sources.length).toBe(before + 1); // Re-entering cannot bypass the global quiet gap.
    context.currentTime += 13; audio.setSoundscape({ ...mix, birds: .12 });
    expect(sources.length).toBe(before + 2);
  });
  it('keeps a ten-minute encounter sparse and silences active calls on mute or range exit', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    releases.push(audio.acquire()); audio.activate(); await load();
    const mix = { wind: .3, birds: .08, crickets: 0, surf: 0, foliage: 0, foliagePan: 0 };
    audio.setSoundscape(mix); await load();
    const before = sources.length;
    for (let i = 0; i < 1200; i++) { context.currentTime += .5; audio.setSoundscape(mix); }
    const calls = sources.slice(before);
    expect(calls.length).toBe(8);
    expect(calls.every(source => !source.loop)).toBe(true);
    for (let i = 1; i < calls.length; i++) expect(calls[i].start.mock.calls[0][0] - calls[i - 1].start.mock.calls[0][0]).toBeGreaterThanOrEqual(75);
    audio.setSettings({ ambience: 0 }); expect(calls.at(-1).stop).toHaveBeenCalledOnce();
    audio.setSettings({ ambience: .5 }); audio.setSoundscape(mix);
    context.currentTime += 75; audio.setSoundscape(mix);
    audio.setSoundscape({ ...mix, birds: 0 }); expect(sources.at(-1).stop).toHaveBeenCalledOnce();
  });
  it('uses a separate wildlife-free wind asset even when no bird is nearby', async () => {
    releases.push(audio.acquire()); audio.activate(); await load();
    audio.setSoundscape({ wind: .3, birds: 0, crickets: 0, surf: 0, foliage: 0, foliagePan: 0 }); await load();
    const requests = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(requests.some(url => url.endsWith('/wind_clean.ogg'))).toBe(true);
    expect(requests.some(url => url.endsWith('/wind.ogg') || url.includes('bird_call'))).toBe(false);
  });
  it('does not load ground-level wind and releases the shared wind loop after descending', async () => {
    releases.push(audio.acquire()); audio.activate(); await load();
    const mix = { wind: 0, birds: 0, crickets: 0, surf: 0, foliage: 0, foliagePan: 0 };
    audio.setSoundscape(mix); await load();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith('/wind_clean.ogg'))).toBe(false);
    const before = sources.length;
    audio.setSoundscape({ ...mix, wind: .2 }); await load();
    const wind = sources.at(-1); expect(sources.length).toBe(before + 1); expect(wind.loop).toBe(true);
    for (let i = 0; i < 30; i++) audio.setSoundscape({ ...mix, wind: .2 });
    expect(sources.length).toBe(before + 1);
    audio.setSoundscape(mix);
    expect(wind.stop).toHaveBeenCalledWith(context.currentTime + 1);
    for (let i = 0; i < 30; i++) audio.setSoundscape(mix);
    expect(sources.length).toBe(before + 1);
    wind.onended(); expect(wind.disconnect).toHaveBeenCalledOnce();
    audio.setSoundscape({ ...mix, wind: .2 }); await load();
    expect(sources.length).toBe(before + 2);
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/wind_clean.ogg'))).toHaveLength(1);
    audio.clearSoundscape(); expect(sources.at(-1).stop).toHaveBeenCalledOnce();
  });
  it('limits leaf rustles, keeps them audible with effects off, and stops all ambience on mode exit', async () => {
    releases.push(audio.acquire()); audio.activate(); await load(); audio.setSettings({ effects: 0 });
    const mix = { wind: .3, birds: .2, crickets: 0, surf: 0, foliage: .15, foliagePan: .5 };
    const before = sources.length;
    audio.setSoundscape(mix); await load();
    for (let i = 0; i < 30; i++) audio.setSoundscape(mix);
    expect(sources.filter(source => !source.loop).length - (before - 1)).toBe(1);
    doc.hidden = true; context.currentTime += 30; audio.setSoundscape(mix);
    expect(sources.filter(source => !source.loop).length - (before - 1)).toBe(1);
    doc.hidden = false; releases[0](); vi.runOnlyPendingTimers();
    expect(sources.filter(source => source.loop).every(source => source.stop.mock.calls.length === 1)).toBe(true);
  });
});

describe('asset provenance and the music seam', () => {
  it('bundles distinct real fishing recordings with verified provenance and no catch chime', () => {
    const root=resolve('public/audio/friends'), manifest=JSON.parse(readFileSync(resolve(root,'fishing-sources.json'),'utf8'));
    expect(manifest).toHaveLength(3);
    for(const asset of manifest){
      expect(asset.license).toBe('CC0-1.0');expect(asset.sourcePage).toMatch(/^https:\/\/(freesound.org|bigsoundbank.com)\//);
      expect(createHash('sha256').update(readFileSync(resolve(root,asset.file))).digest('hex')).toBe(asset.asset_sha256);
    }
    expect(FRIENDS_CUE_ASSETS.fishingCast[0]).toContain('fishing_cast.ogg');
    expect(FRIENDS_CUE_ASSETS.fishingReel[0]).toContain('fishing_reel.ogg');
    expect(FRIENDS_CUE_ASSETS.fishingSplash[0]).toContain('fishing_plop.ogg');
    expect(FRIENDS_CUE_ASSETS).not.toHaveProperty('fishingCatch');
  });

  it('preserves the downloaded bytes recorded in the source manifest', () => {
    const root = resolve('public/audio/friends');
    const manifest = JSON.parse(readFileSync(resolve(root, 'sources.json'), 'utf8'));
    expect(manifest.defaultLicense).toBe('CC0-1.0');
    const approved = manifest.assets.filter((asset: { pack?: string }) => asset.pack === 'approvedPixabay');
    expect(approved).toHaveLength(37);
    expect(new Set(approved.map((asset: { sourcePage: string }) => asset.sourcePage)).size).toBe(25);
    expect(approved.every((asset: { license: string }) => asset.license === 'Pixabay Content License')).toBe(true);
    for (const asset of manifest.assets) expect(createHash('sha256').update(readFileSync(resolve(root, asset.file))).digest('hex')).toBe(asset.sha256);
  });
  it('joins both channels to contiguous opening samples without changing the source', () => {
    const original = buffer([0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1, .9], 2);
    const createBuffer = (channels: number, size: number, rate: number) => buffer(new Array(size).fill(0), channels, rate);
    const loop = crossfadeLoop({ createBuffer }, original, 3);
    expect(loop.length).toBe(9);
    for (let channel = 0; channel < 2; channel++) {
      expect(loop.getChannelData(channel)[0]).toBeCloseTo(.3);
      expect(loop.getChannelData(channel)[8]).toBeCloseTo(.2);
      expect(loop.getChannelData(channel)[7]).toBeCloseTo(.55);
    }
    expect(original.getChannelData(0)[11]).toBeCloseTo(.9);
  });
});
