import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundManager } from './SoundManager';

describe('SoundManager', () => {
  let sm: SoundManager;
  let mockAudioContext: any;
  let createdOscillators: any[];
  let createdGains: any[];
  let createdFilters: any[];

  beforeEach(() => {
    createdOscillators = [];
    createdGains = [];
    createdFilters = [];

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
      createBuffer: vi.fn((_channels, size, _rate) => ({
        getChannelData: vi.fn(() => new Float32Array(size)),
      })),
      createBufferSource: vi.fn(() => ({
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
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

  it('controls continuous tower charging sound and resumes at the correct pitch', () => {
    // 1. Enter circle at 0% progress
    sm.updateTowerCharge(true, 0);
    expect(createdOscillators.length).toBeGreaterThanOrEqual(3);
    const mainOsc = createdOscillators.find(o => o.type === 'triangle');
    expect(mainOsc).toBeDefined();
    expect(mainOsc.frequency.setValueAtTime).toHaveBeenCalledWith(220, 10);

    // 2. Advance to 50% progress
    mockAudioContext.currentTime = 12;
    sm.updateTowerCharge(true, 0.5);
    // Pitch should glide higher than base 220
    const expectedHalfPitch = 220 + 740 * Math.pow(0.5, 1.15);
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
