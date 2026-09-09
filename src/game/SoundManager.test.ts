import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundManager } from './SoundManager';

describe('SoundManager', () => {
  let sm: SoundManager;
  let mockAudioContext: any;
  let createdOscillators: any[];
  let createdGains: any[];
  let createdFilters: any[];
  let createdPanners: any[];
  let createdBufferSources: any[];

  beforeEach(() => {
    createdOscillators = [];
    createdGains = [];
    createdFilters = [];
    createdPanners = [];
    createdBufferSources = [];

    const createMockAudioParam = (initialValue: number = 0) => ({
      value: initialValue,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    });

    mockAudioContext = {
      state: 'running',
      currentTime: 10,
      sampleRate: 44100,
      destination: {},
      resume: vi.fn().mockResolvedValue(undefined),
      createGain: vi.fn(() => {
        const gain = {
          gain: createMockAudioParam(1),
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
        createdGains.push(gain);
        return gain;
      }),
      createOscillator: vi.fn(() => {
        const osc = {
          type: 'sine',
          frequency: createMockAudioParam(440),
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        };
        createdOscillators.push(osc);
        return osc;
      }),
      createBiquadFilter: vi.fn(() => {
        const filter = {
          type: 'lowpass',
          frequency: createMockAudioParam(1000),
          Q: createMockAudioParam(1),
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
        createdFilters.push(filter);
        return filter;
      }),
      createStereoPanner: vi.fn(() => {
        const panner = { pan: createMockAudioParam(0), connect: vi.fn(), disconnect: vi.fn() };
        createdPanners.push(panner);
        return panner;
      }),
      createBuffer: vi.fn((_channels, size, _rate) => ({
        getChannelData: vi.fn(() => new Float32Array(size)),
      })),
      createBufferSource: vi.fn(() => {
        const source = {
          buffer: null,
          loop: false,
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        };
        createdBufferSources.push(source);
        return source;
      }),
    };

    (globalThis as any).window = globalThis;
    function MockAudioContext() {
      return mockAudioContext;
    }
    (globalThis as any).AudioContext = MockAudioContext;
    sm = new SoundManager();
    sm.activate();
  });

  it('plays jump sound with multi-layer acoustic elements', () => {
    createdOscillators.length = 0;
    sm.playJump();
    expect(createdOscillators.length).toBeGreaterThanOrEqual(2);
    // Boot contact snap oscillator
    expect(createdOscillators[0].type).toBe('triangle');
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(360, 10);
    // Kinetic suit lift oscillator
    expect(createdOscillators[1].type).toBe('sine');
    expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(145, 10);
  });

  it('gives the double jump a distinct two-stage electronic ignition', () => {
    createdOscillators.length = 0;
    sm.playDoubleJump();
    expect(createdOscillators).toHaveLength(2);
    expect(createdOscillators[0].type).toBe('sawtooth');
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(190, 10);
    expect(createdOscillators[1].type).toBe('square');
    expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(690, 10.045);
    expect(createdOscillators[1].start).toHaveBeenCalledWith(10.045);
  });

  it('runs one non-stacking jetpack engine graph only while thrust is active', () => {
    createdOscillators.length = 0;
    createdBufferSources.length = 0;

    sm.updateJetpack(true, 1);
    expect(createdOscillators).toHaveLength(2);
    expect(createdOscillators[0].type).toBe('sawtooth');
    expect(createdOscillators[1].type).toBe('sine');
    expect(createdBufferSources).toHaveLength(1);
    expect(createdBufferSources[0].loop).toBe(true);
    const jetpackGain = createdGains.find(gain => gain.gain.linearRampToValueAtTime.mock.calls.some((call: unknown[]) => call[0] === .016 && call[1] === 10.045));
    expect(jetpackGain).toBeDefined();
    if (!jetpackGain) throw new Error('Jetpack gain was not created');

    sm.updateJetpack(true, .5);
    expect(createdOscillators).toHaveLength(2);
    expect(createdBufferSources).toHaveLength(1);

    sm.updateJetpack(false, .5);
    expect(jetpackGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 10.11);
    sm.stopJetpack();
    expect(createdOscillators[0].stop).toHaveBeenCalledOnce();
    expect(createdOscillators[1].stop).toHaveBeenCalledOnce();
    expect(createdBufferSources[0].stop).toHaveBeenCalledOnce();
  });

  it('gives the wall-jump a spatialized contact snap and lateral thrust', () => {
    createdOscillators.length = 0;
    createdPanners.length = 0;
    sm.playWallJump(.75);
    expect(createdOscillators).toHaveLength(2);
    expect(createdOscillators[0].type).toBe('triangle');
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(620, 10);
    expect(createdOscillators[1].type).toBe('sawtooth');
    expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(135, 10);
    expect(createdPanners[0].pan.setValueAtTime).toHaveBeenCalledWith(.75, 10);
  });

  it('plays muffled low-frequency landing sound with heavy lowpass damping', () => {
    createdOscillators.length = 0;
    createdFilters.length = 0;
    sm.playLanding(1);
    // Sub-bass thump and compact chest thump
    expect(createdOscillators.length).toBeGreaterThanOrEqual(2);
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(110, 10);
    // Lowpass filter strictly below 200 Hz for "dof" character
    expect(createdFilters.length).toBeGreaterThanOrEqual(1);
    expect(createdFilters[0].frequency.setValueAtTime).toHaveBeenCalledWith(200, 10);
  });

  it('plays distinct tactical new round fanfare', () => {
    createdOscillators.length = 0;
    sm.playNewRound();
    // 3 chord notes across progression
    expect(createdOscillators.length).toBeGreaterThanOrEqual(7);
  });

  it('controls the subdued single-layer uplink hum and resumes at the correct pitch', () => {
    // 1. Enter circle at 0% progress
    sm.updateTowerCharge(true, 0);
    expect(createdOscillators).toHaveLength(1);
    const mainOsc = createdOscillators.find(o => o.type === 'sine');
    expect(mainOsc).toBeDefined();
    expect(mainOsc.frequency.setValueAtTime).toHaveBeenCalledWith(125, 10);

    // 2. Advance to 50% progress
    mockAudioContext.currentTime = 12;
    sm.updateTowerCharge(true, 0.5);
    // Pitch should glide higher than base 220
    const expectedHalfPitch = 125 + 75 * Math.pow(0.5, 1.1);
    expect(mainOsc.frequency.linearRampToValueAtTime).toHaveBeenCalledWith(
      expect.closeTo(expectedHalfPitch, 1),
      expect.any(Number)
    );

    // 3. Leave circle: charging sound fades to 0
    mockAudioContext.currentTime = 14;
    sm.updateTowerCharge(false, 0.5);

    // 4. Re-enter circle: resumes at pitch where we left
    mockAudioContext.currentTime = 16;
    sm.updateTowerCharge(true, 0.5);
    expect(mainOsc.frequency.linearRampToValueAtTime).toHaveBeenCalledWith(
      expect.closeTo(expectedHalfPitch, 1),
      expect.any(Number)
    );

    // 5. Complete objective
    sm.playObjectiveComplete();
    sm.stopTowerCharge();
  });

  it('uses a subdued non-stacking continuous hum for station capture', () => {
    createdOscillators.length = 0;
    sm.updateStationCapture(true, 0);
    expect(createdOscillators).toHaveLength(1);
    expect(createdOscillators[0].type).toBe('sine');
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(105, 10);
    sm.updateStationCapture(true, .5);
    expect(createdOscillators).toHaveLength(1);
    expect(createdOscillators[0].frequency.linearRampToValueAtTime).toHaveBeenCalledWith(140, expect.any(Number));
    sm.updateStationCapture(false, .5);
    sm.updateStationCapture(true, .75);
    expect(createdOscillators).toHaveLength(1);
    sm.stopStationCapture();
    expect(createdOscillators[0].stop).toHaveBeenCalledOnce();
  });

  it('plays a dedicated station completion cue after stopping the hum', () => {
    createdOscillators.length = 0;
    sm.updateStationCapture(true, .9);
    const hum = createdOscillators[0];
    sm.playStationCaptured();
    expect(hum.stop).toHaveBeenCalledOnce();
    expect(createdOscillators[1].type).toBe('sine');
    expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(330, 10);
  });

  it('plays normal tactical sonar ping with sine chime', () => {
    createdOscillators.length = 0;
    sm.playTacticalPing(false);
    expect(createdOscillators.length).toBeGreaterThanOrEqual(1);
    expect(createdOscillators[0].type).toBe('sine');
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(1760, 10);
  });

  it('plays urgent danger tactical ping with sharp sawtooth alert', () => {
    createdOscillators.length = 0;
    sm.playTacticalPing(true);
    expect(createdOscillators.length).toBeGreaterThanOrEqual(1);
    expect(createdOscillators[0].type).toBe('sawtooth');
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(880, 10);
  });
});
