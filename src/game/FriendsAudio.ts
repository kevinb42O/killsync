import type { FriendsSoundscapeMix } from './FriendsSoundscape';
import { QUIET_TRAIN, type TrainSoundMix } from './FriendsTrainSound';
import type { CampfireSoundMix } from './FriendsLocationAudio';
import { QUIET_WORLD_SOUND, type WorldSoundMix, type WorldLoop } from './FriendsWorldSound';
import { effectCalibration } from './FriendsAudioMix';
const QUIET_CAMPFIRE: CampfireSoundMix = { volume: 0, pan: 0 };
const QUIET_SOUNDSCAPE: FriendsSoundscapeMix = { wind: 0, birds: 0, crickets: 0, surf: 0, foliage: 0, foliagePan: 0 };

export type SurfaceCue = 'grass' | 'woodStep' | 'stoneStep' | 'snow' | 'waterStep' | 'mudStep';
export type FriendsCue = SurfaceCue | 'wood' | 'stone' | 'soil' | 'ore' | 'dig' | 'landing' | 'leaves' | 'treeBreak' | 'birdCall'
  | 'birdRobin' | 'birdBlueTit' | 'birdSparrow' | 'birdWings' | 'birdStartled'
  | 'trainDepart' | 'trainBrake' | 'trainStop' | 'trainHorn' | 'flightFoliage'
  | 'click' | 'hover' | 'success' | 'error' | 'collect' | 'pack' | 'jump' | 'swing' | 'chest' | 'chime'
  | 'gunfire' | 'reloadRifle' | 'reloadHandgun' | 'reloadShotgun' | 'eat'
  | 'caveDrip' | 'steam' | 'chestLatch' | 'chestCoins' | 'chestReward' | 'ropeHook' | 'ropeCreak' | 'reelRatchet'
  | 'flashlight' | 'nightVision' | 'miningBreak' | 'cargoStone' | 'cargoWood';
type Cue = FriendsCue;
export type FriendsAudioSettings = { music: number; effects: number; ambience: number; muted: boolean };
const ROOT = `${import.meta.env.BASE_URL}audio/friends/`;
const variants = (stem: string, count = 3) => Array.from({ length: count }, (_, i) => `${ROOT}${stem}_${String(i).padStart(3, '0')}.ogg`);
export const FRIENDS_CUE_ASSETS: Readonly<Record<Cue, readonly string[]>> = {
  grass: variants('footstep_grass'), woodStep: variants('footstep_wood'), stoneStep: variants('footstep_concrete'), snow: variants('footstep_snow'),
  waterStep: variants('step_water', 4), mudStep: variants('step_mud', 4),
  wood: variants('impactWood_medium'), stone: variants('impactMining', 5), soil: variants('impactSoft_medium'), ore: variants('impactMetal_light'),
  dig: [ROOT + 'shovel.ogg'], landing: [ROOT + 'landing.wav'], leaves: [ROOT + 'leaves.ogg'], treeBreak: variants('impactWood_heavy'),
  birdCall: variants('bird_call', 4),
  birdRobin: variants('bird_robin',3), birdBlueTit: variants('bird_blue_tit',2), birdSparrow: variants('bird_sparrow',3),
  birdWings: variants('bird_wings',2), birdStartled: variants('bird_startled',2),
  flightFoliage: variants('flight_foliage'),
  trainDepart: [ROOT + 'train_depart.ogg'], trainBrake: [ROOT + 'train_brake.ogg'], trainStop: [ROOT + 'train_stop.ogg'], trainHorn: [ROOT + 'train_horn.ogg'],
  click: [ROOT + 'click_001.ogg'], hover: [ROOT + 'select_001.ogg'], success: [ROOT + 'confirmation_001.ogg'], error: [ROOT + 'error_001.ogg'],
  collect: [ROOT + 'handleCoins.ogg'], pack: [ROOT + 'handleSmallLeather.ogg'], jump: [ROOT + 'jump.ogg'], swing: [ROOT + 'knifeSlice.ogg'],
  chest: [ROOT + 'chest_lid.ogg'], chime: [ROOT + 'glass_001.ogg'],
  caveDrip: variants('cave_drips', 5), steam: [ROOT + 'steam.ogg'],
  chestLatch: [ROOT + 'chest_latch.ogg'], chestCoins: [ROOT + 'chest_coins.ogg'], chestReward: [ROOT + 'chest_reward.ogg'],
  ropeHook: [ROOT + 'rope_hook.ogg'], ropeCreak: variants('rope_creak'), reelRatchet: [ROOT + 'reel_ratchet.ogg'],
  flashlight: [ROOT + 'flashlight.ogg'], nightVision: [ROOT + 'night_vision.ogg'],
  miningBreak: [ROOT + 'mining_break.ogg'], cargoStone: [ROOT + 'cargo_stone.ogg'], cargoWood: [ROOT + 'cargo_wood.ogg'],
  eat: [ROOT + 'eat.ogg'],
  gunfire: [`${import.meta.env.BASE_URL}audio/cc0-gunfire.wav`],
  reloadRifle: [`${import.meta.env.BASE_URL}audio/cc0-rifle-reload.wav`],
  reloadHandgun: [`${import.meta.env.BASE_URL}audio/cc0-handgun-reload.wav`],
  reloadShotgun: [`${import.meta.env.BASE_URL}audio/cc0-shotgun-reload.wav`],
};
const CUES = FRIENDS_CUE_ASSETS;
const AMBIENCE = { wind: ROOT + 'wind_clean.ogg', crickets: ROOT + 'crickets.ogg', surf: ROOT + 'surf.ogg', campfire: ROOT + 'campfire_woods.ogg' };
const MUSIC = { exploration: ROOT + 'exploration.ogg', castle: ROOT + 'castle.ogg' };
type MusicTheme = keyof typeof MUSIC;
type MusicLoop = { source: AudioBufferSourceNode; gain: GainNode; from: number; target: number; changedAt: number; startedAt: number; offset: number };
const MUSIC_FADE_SECONDS = 8;
const TRAIN_LOOPS = { engine: ROOT + 'train_drive.ogg', rail: ROOT + 'train_rail.ogg' };
const WORLD_LOOPS: Record<WorldLoop, string> = {
  caveAir: ROOT + 'cave_air.ogg', waterfall: ROOT + 'waterfall.ogg', lava: ROOT + 'lava.ogg',
  volcano: ROOT + 'volcano.ogg', reel: ROOT + 'reel_motor.ogg',
};
const STORAGE = 'sunline.audio.v1';
const SAMPLE_CUES = new Map(Object.entries(CUES).flatMap(([cue, urls]) => urls.map(url => [url, cue as Cue] as const)));
const clamp = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/** Crossfade the original track's tail into its opening. This only edits the
 * downloaded recording; no tones, noise, or audio generation are used. */
export function crossfadeLoop(context: Pick<AudioContext, 'createBuffer'>, original: AudioBuffer, seconds = 4): AudioBuffer {
  const overlap = Math.min(Math.floor(seconds * original.sampleRate), Math.floor(original.length / 4));
  if (overlap < 2) return original;
  const length = original.length - overlap;
  const loop = context.createBuffer(original.numberOfChannels, length, original.sampleRate);
  for (let channel = 0; channel < original.numberOfChannels; channel++) {
    const input = original.getChannelData(channel), output = loop.getChannelData(channel);
    output.set(input.subarray(overlap));
    for (let i = 0; i < overlap; i++) {
      const blend = i / (overlap - 1);
      output[length - overlap + i] = input[original.length - overlap + i] * (1 - blend) + input[i] * blend;
    }
  }
  return loop;
}

export class FriendsAudio {
  private disposed = false;
  private users = 0;
  private releaseTimer?: ReturnType<typeof setTimeout>;
  private context?: AudioContext;
  private effectsGain?: GainNode;
  private musicGain?: GainNode;
  private ambienceGain?: GainNode;
  private outputGuard?: DynamicsCompressorNode;
  private ambientLoops = new Map<keyof typeof AMBIENCE, { source: AudioBufferSourceNode; gain: GainNode; pan?: StereoPannerNode }>();
  private retiringAmbienceSources = new Set<AudioBufferSourceNode>();
  private soundscape: FriendsSoundscapeMix = QUIET_SOUNDSCAPE;
  private soundscapeEnabled = false;
  private campfireMix: CampfireSoundMix = QUIET_CAMPFIRE;
  private worldMix: WorldSoundMix = QUIET_WORLD_SOUND;
  private worldLoops = new Map<WorldLoop, { source: AudioBufferSourceNode; gain: GainNode; pan?: StereoPannerNode; filter?: BiquadFilterNode }>();
  private retiringWorldSources = new Set<AudioBufferSourceNode>();
  private nextDrip = 0;
  private dripSource?: string;
  private dripVoice?: AudioBufferSourceNode;
  private nextSteam = 0;
  private reflectionInput?: GainNode;
  private reflectionDelays: DelayNode[] = [];
  private reflectionNodes: AudioNode[] = [];
  private trainMix: TrainSoundMix = QUIET_TRAIN;
  private trainLoops = new Map<keyof typeof TRAIN_LOOPS, { source: AudioBufferSourceNode; gain: GainNode; pan?: StereoPannerNode }>();
  private retiringTrainSources = new Set<AudioBufferSourceNode>();
  private nextRustle = 0;
  private nextBirdCall = 0;
  private nearbyBirdSince?: number;
  private birdVoice?: AudioBufferSourceNode;
  private music = new Map<MusicTheme, MusicLoop>();
  private musicOffsets = new Map<MusicTheme, number>();
  private castleMusic = false;
  private activated = false;
  private preloaded = false;
  private buffers = new Map<string, AudioBuffer>();
  private bufferTrims = new Map<string, number>();
  private loads = new Map<string, Promise<void>>();
  private voices = new Set<AudioBufferSourceNode>();
  private effectVoices = new Set<AudioBufferSourceNode>();
  private lastCue = new Map<Cue, number>();
  private lastVariant = new Map<Cue, number>();
  private listeners = new Set<() => void>();
  private settings: FriendsAudioSettings = { music: .28, effects: .65, ambience: .5, muted: false };
  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE) || 'null');
      if (saved) this.settings = { music: clamp(saved.music ?? .28), effects: clamp(saved.effects ?? .65), ambience: clamp(saved.ambience ?? .5), muted: saved.muted === true };
    } catch { /* Storage is optional. */ }
  }
  get active() { return this.users > 0; }
  getSettings = () => this.settings;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  setSettings(patch: Partial<FriendsAudioSettings>) {
    this.settings = { music: clamp(patch.music ?? this.settings.music), effects: clamp(patch.effects ?? this.settings.effects), ambience: clamp(patch.ambience ?? this.settings.ambience), muted: patch.muted ?? this.settings.muted };
    try { localStorage.setItem(STORAGE, JSON.stringify(this.settings)); } catch { /* Storage is optional. */ }
    this.applyVolumes();
    if (this.settings.muted || !this.settings.effects) {
      // Cancel scheduled reward layers as well as sounds already playing.
      for (const voice of this.settings.muted ? this.voices : this.effectVoices) {
        try { voice.stop(); } catch { /* Already ended. */ }
        this.voices.delete(voice);
      }
      this.effectVoices.clear();
    }
    if (this.settings.muted || !this.settings.ambience) { this.nearbyBirdSince = undefined; this.stopBirdCall(); }
    if (this.settings.muted || !this.settings.ambience) this.resetDrips();
    this.syncMusic();
    this.syncAmbience();
    this.syncTrain();
    this.syncWorld();
    this.listeners.forEach(listener => listener());
  }
  /** Reference counting keeps the same theme alive across menu → world and
   * React StrictMode remounts, then stops every voice on a real mode exit. */
  acquire() {
    if (this.disposed) return () => {};
    clearTimeout(this.releaseTimer);
    this.users++;
    if (this.users === 1) {
      window.addEventListener('pointerdown', this.activate, true);
      window.addEventListener('keydown', this.activate, true);
      document.addEventListener('visibilitychange', this.onVisibility);
      this.syncMusic();
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.users = Math.max(0, this.users - 1);
      if (!this.active) this.releaseTimer = setTimeout(() => {
        if (this.active) return;
        window.removeEventListener('pointerdown', this.activate, true);
        window.removeEventListener('keydown', this.activate, true);
        document.removeEventListener('visibilitychange', this.onVisibility);
        this.stopMusic();
        this.clearSoundscape();
        for (const voice of this.voices) { try { voice.stop(); } catch { /* Already ended. */ } voice.disconnect(); }
        this.voices.clear(); this.effectVoices.clear();
        this.lastCue.clear();
      }, 0);
    };
  }
  /** Retire the old singleton during live code updates, including loops owned
   * by an older module version and downloads which finish after retirement. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.users = 0; this.activated = false;
    clearTimeout(this.releaseTimer);
    window.removeEventListener('pointerdown', this.activate, true);
    window.removeEventListener('keydown', this.activate, true);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.stopMusic(); this.clearSoundscape();
    for (const voice of this.voices) { try { voice.stop(); } catch { /* Already ended. */ } voice.disconnect(); }
    this.voices.clear(); this.effectVoices.clear(); this.buffers.clear(); this.bufferTrims.clear(); this.musicOffsets.clear();
    this.outputGuard?.disconnect(); this.outputGuard = undefined;
    void this.context?.close().catch(() => {}); this.context = undefined;
  }
  activate = () => {
    if (!this.active) return;
    try {
      if (!this.context) {
        const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        this.context = new AudioCtx();
        // One shared audio-thread node catches exceptional overlapping peaks.
        // Normal mixes remain below its knee; no frame work or object limiters.
        this.outputGuard = this.context.createDynamicsCompressor?.();
        if (this.outputGuard) {
          this.outputGuard.threshold.value = -6; this.outputGuard.knee.value = 2;
          this.outputGuard.ratio.value = 20; this.outputGuard.attack.value = .0005;
          this.outputGuard.release.value = .15; this.outputGuard.connect(this.context.destination);
        }
        const output = this.outputGuard ?? this.context.destination;
        this.effectsGain = this.context.createGain(); this.effectsGain.connect(output);
        this.musicGain = this.context.createGain(); this.musicGain.connect(output);
        this.ambienceGain = this.context.createGain(); this.ambienceGain.connect(output);
        this.effectsGain.gain.value = this.settings.muted ? 0 : this.settings.effects;
        this.musicGain.gain.value = this.settings.muted ? 0 : this.settings.music * .35;
        this.ambienceGain.gain.value = this.settings.muted ? 0 : this.settings.ambience;
        this.applyVolumes();
        const unlock = this.context.createBufferSource();
        unlock.buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
        unlock.connect(this.effectsGain); unlock.onended = () => unlock.disconnect(); unlock.start();
      }
      this.activated = true;
      if (this.context.state === 'suspended') void this.context.resume().then(() => { this.syncMusic(); this.syncAmbience(); this.syncTrain(); this.syncWorld(); }).catch(() => {});
      this.preload();
      this.syncMusic();
      this.syncAmbience();
      this.syncTrain();
      this.syncWorld();
    } catch { /* Audio must never block world input. */ }
  };
  preload() {
    if (!this.context) return;
    if (!this.preloaded) {
      this.preloaded = true;
      for (const url of new Set(Object.entries(CUES).filter(([cue]) => !cue.startsWith('bird') && !['flightFoliage','caveDrip','steam'].includes(cue) && !cue.startsWith('train')).flatMap(([, urls]) => urls))) void this.load(url);
    }
  }
  private load(url: string, loop = false, seamSeconds = 2): Promise<void> {
    if (this.buffers.has(url) || !this.context) return Promise.resolve();
    const pending = this.loads.get(url); if (pending) return pending;
    const context = this.context;
    const promise = fetch(url).then(response => { if (!response.ok) throw new Error('Sound unavailable'); return response.arrayBuffer(); })
      .then(data => context.decodeAudioData(data)).then(buffer => {
        if (this.disposed) return;
        this.buffers.set(url, loop ? crossfadeLoop(context, buffer, seamSeconds) : buffer);
        const cue = SAMPLE_CUES.get(url);
        if (cue) this.bufferTrims.set(url, effectCalibration(buffer, cue));
      }).catch(() => {})
      .finally(() => this.loads.delete(url));
    this.loads.set(url, promise);
    return promise;
  }
  play(cue: Cue, volume = .3, cooldownMs = 80, rate = 1, duration?: number, options?: { ambience?: boolean; pan?: number; delay?: number; offset?: number }) {
    const context = this.context;
    if (!this.active || !context || context.state !== 'running' || document.hidden || this.settings.muted || !(options?.ambience ? this.settings.ambience : this.settings.effects) || this.voices.size >= 20) return;
    const now = context.currentTime, start = now + Math.max(0, Math.min(2, options?.delay ?? 0));
    if ((now - (this.lastCue.get(cue) ?? -Infinity)) * 1000 < cooldownMs) return;
    const urls = CUES[cue];
    const previous = this.lastVariant.get(cue) ?? -1;
    // Drops use random selection without immediate repeats, not a five-beat cycle.
    let index = (previous + 1) % urls.length;
    if (cue === 'caveDrip' || cue.startsWith('bird')) {
      index = Math.floor(Math.random() * (urls.length - (previous >= 0 ? 1 : 0)));
      if (previous >= 0 && index >= previous) index++;
    }
    const buffer = this.buffers.get(urls[index]);
    if (!buffer) { void this.load(urls[index]); return; } // Never replay a stale input after download.
    this.lastCue.set(cue, now); this.lastVariant.set(cue, index);
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer; source.playbackRate.value = Math.max(.65, Math.min(1.4, rate));
    const offset = Math.max(0, Math.min(options?.offset ?? 0, buffer.duration - .001));
    const length = Math.min(duration ?? buffer.duration, buffer.duration - offset);
    const level = clamp(volume) * (this.bufferTrims.get(urls[index]) ?? 1);
    gain.gain.value = level;
    if (duration !== undefined) {
      const end = start + length / source.playbackRate.value;
      gain.gain.setValueAtTime(level, Math.max(start, end - .025));
      gain.gain.linearRampToValueAtTime(0, end);
    }
    const pan = options?.pan && context.createStereoPanner ? context.createStereoPanner() : undefined;
    source.connect(gain);
    if (pan) { pan.pan.value = Math.max(-1, Math.min(1, options!.pan!)); gain.connect(pan); pan.connect(options?.ambience ? this.ambienceGain! : this.effectsGain!); }
    else gain.connect(options?.ambience ? this.ambienceGain! : this.effectsGain!);
    if (!options?.ambience && this.reflectionInput) (pan ?? gain).connect(this.reflectionInput);
    this.voices.add(source);
    if (!options?.ambience) this.effectVoices.add(source);
    source.onended = () => { this.voices.delete(source); this.effectVoices.delete(source); if (this.birdVoice === source) this.birdVoice = undefined; if (this.dripVoice === source) this.dripVoice = undefined; source.disconnect(); gain.disconnect(); pan?.disconnect(); };
    source.start(start, offset, length);
    return source;
  }
  material(kind: string, volume = .32, rate = 1) { this.play(kind === 'wood' || kind === 'timber' ? 'wood' : kind === 'soil' || kind === 'grass' ? 'soil' : kind === 'ore' || kind === 'iron' || kind === 'copper' || kind === 'teal' ? 'ore' : 'stone', volume, 90, rate); }
  takeoff() { this.play('jump', .12, 100); }
  land(surface: SurfaceCue, strength = 1) { this.play('landing', Math.min(.42, .24 * strength), 100); this.play(surface, Math.min(.25, .12 * strength), 100); }
  treasure(volume: number, pan = 0) {
    // Audio-clock scheduling is canceled with the tracked voices on exit.
    this.play('chestLatch', volume*.55, 250, 1, undefined, {pan});
    this.play('chest', volume*.8, 250, 1, 1.4, {pan, delay:.1});
    this.play('chestCoins', volume*.5, 250, 1, .85, {pan, delay:.38});
    this.play('chestReward', volume*.4, 250, 1, undefined, {pan, delay:.6});
  }
  equipment(cue: 'flashlight' | 'nightVision', enabled: boolean) {
    this.play(cue, enabled ? .14 : .095, 100, enabled ? 1 : .85, enabled ? undefined : .35);
  }
  setWorldSound(mix: WorldSoundMix) {
    this.worldMix = {...mix,reel:this.worldMix.reel}; this.syncWorld();
    const now = this.context?.currentTime ?? 0;
    const audible = this.active && this.activated && this.context?.state === 'running'
      && !document.hidden && !this.settings.muted && this.settings.ambience > 0;
    if (!audible || mix.drip.volume <= .003) this.resetDrips();
    else {
      for (const url of CUES.caveDrip) void this.load(url);
      const source = mix.dripSource ?? 'wet-room';
      if (!this.nextDrip || source !== this.dripSource) {
        this.resetDrips(); this.dripSource = source;
        this.nextDrip = now + 5 + Math.random() * 9;
      } else if (now >= this.nextDrip && !this.dripVoice) {
        this.dripVoice = this.play('caveDrip', mix.drip.volume * (.75 + Math.random() * .25), 3000,
          .97 + Math.random() * .06, undefined, {ambience:true,pan:mix.drip.pan});
        // A bounded exponential wait leaves natural, irregular quiet gaps.
        this.nextDrip = now + 10 + Math.min(26, -Math.log(1 - Math.random()) * 10);
      }
    }
    if (!audible || mix.steam.volume <= .003) this.nextSteam = 0;
    else {
      for (const url of CUES.steam) void this.load(url);
      if (!this.nextSteam) this.nextSteam = now + 6 + Math.random() * 6;
      else if (now >= this.nextSteam) {
        this.play('steam',mix.steam.volume,3000,1,undefined,{ambience:true,pan:mix.steam.pan});
        this.nextSteam = now + 14 + Math.random() * 12;
      }
    }
  }
  private resetDrips() {
    if (this.dripVoice) { try { this.dripVoice.stop(); } catch { /* Already ended. */ } }
    this.dripVoice = undefined; this.dripSource = undefined; this.nextDrip = 0;
  }
  setReelSound(reel: WorldSoundMix['reel']) {
    const old = this.worldMix.reel;
    if (old.volume === reel.volume && old.pan === reel.pan && old.rate === reel.rate) return;
    this.worldMix = {...this.worldMix,reel}; this.syncWorld('reel');
  }
  private syncReflections() {
    const context = this.context;
    if (!context || !context.createDelay || !this.effectsGain) return;
    if (!this.reflectionInput && this.worldMix.reflection > 0) {
      this.reflectionInput = context.createGain();
      this.reflectionInput.gain.value = this.worldMix.reflection;
      this.reflectionNodes.push(this.reflectionInput);
      let input: AudioNode = this.reflectionInput;
      if (context.createBiquadFilter) { const filter=context.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=2600; input.connect(filter); input=filter; this.reflectionNodes.push(filter); }
      for (let i=0;i<4;i++) {
        const delay=context.createDelay(1), tap=context.createGain();
        delay.delayTime.value = this.worldMix.reflectionDelay;
        this.reflectionNodes.push(delay,tap);
        input.connect(delay); delay.connect(tap); tap.gain.value=Math.pow(.55,i); tap.connect(this.effectsGain);
        this.reflectionDelays.push(delay); input=delay;
      }
    }
    this.reflectionInput?.gain.setTargetAtTime(this.worldMix.reflection,context.currentTime,.4);
    for (const delay of this.reflectionDelays) delay.delayTime.setTargetAtTime(this.worldMix.reflectionDelay,context.currentTime,.6);
  }
  private syncWorld(only?: WorldLoop) {
    const context=this.context;
    if (!this.active || !this.activated || this.settings.muted) { this.stopWorld(); return; }
    if (!context || context.state !== 'running' || document.hidden) return;
    if (!only) this.syncReflections();
    for (const key of (only ? [only] : Object.keys(WORLD_LOOPS)) as WorldLoop[]) {
      const sound=this.worldMix[key], effects=key==='reel', enabled=effects?this.settings.effects:this.settings.ambience;
      let loop=this.worldLoops.get(key);
      if (!enabled || sound.volume <= .003) {
        if (loop) { loop.gain.gain.setTargetAtTime(0,context.currentTime,effects ? .04 : .18); this.retiringWorldSources.add(loop.source); loop.source.stop(context.currentTime+(effects ? .18 : .8)); this.worldLoops.delete(key); }
        continue;
      }
      if (!loop) {
        const url=WORLD_LOOPS[key],buffer=this.buffers.get(url);
        if (!buffer) { if (!this.loads.has(url)) void this.load(url,true,key === 'reel' ? .08 : .8).then(()=>{if(this.buffers.has(url))this.syncWorld();}); continue; }
        const source=context.createBufferSource(),gain=context.createGain(),pan=context.createStereoPanner?.(),filter=context.createBiquadFilter?.();
        source.buffer=buffer;source.loop=true;gain.gain.value=0;source.connect(gain);
        let output:AudioNode=gain;
        if(filter){filter.type='lowpass';filter.frequency.value=sound.cutoff??8500;output.connect(filter);output=filter;}
        if(pan){output.connect(pan);output=pan;} output.connect(effects?this.effectsGain!:this.ambienceGain!);
        source.onended=()=>{this.retiringWorldSources.delete(source);source.disconnect();gain.disconnect();pan?.disconnect();filter?.disconnect();};
        source.start();loop={source,gain,pan,filter};this.worldLoops.set(key,loop);
      }
      loop.gain.gain.setTargetAtTime(clamp(sound.volume),context.currentTime,effects ? .06 : .45);
      loop.pan?.pan.setTargetAtTime(sound.pan,context.currentTime,.2);
      loop.filter?.frequency.setTargetAtTime(sound.cutoff??8500,context.currentTime,.4);
      loop.source.playbackRate.setTargetAtTime(sound.rate??1,context.currentTime,.3);
    }
  }
  private stopWorld() {
    for(const {source,gain,pan,filter} of this.worldLoops.values()){try{source.stop();}catch{}source.disconnect();gain.disconnect();pan?.disconnect();filter?.disconnect();}
    this.worldLoops.clear();
    for(const source of this.retiringWorldSources){try{source.stop();}catch{}source.disconnect();}this.retiringWorldSources.clear();
    for(const node of this.reflectionNodes)node.disconnect();
    this.reflectionNodes=[];this.reflectionDelays=[];this.reflectionInput=undefined;
  }
  setSoundscape(mix: FriendsSoundscapeMix) {
    this.soundscape = mix; this.soundscapeEnabled = true;
    this.syncAmbience();
    const now = this.context?.currentTime ?? 0;
    if (mix.birds > .006 && !document.hidden && this.context?.state === 'running' && !this.settings.muted && this.settings.ambience > 0) {
      if (this.nearbyBirdSince === undefined) {
        this.nearbyBirdSince = now;
        // Encounter delay and global cooldown survive leaving/re-entering range.
        this.nextBirdCall = Math.max(this.nextBirdCall, now + 12 + Math.random() * 12);
      }
      for (const url of CUES.birdCall) void this.load(url);
      if (now >= this.nextBirdCall) {
        this.nextBirdCall = now + 75 + Math.random() * 60;
        this.birdVoice = this.play('birdCall', mix.birds, 75000, 1, 1.2, { ambience: true, pan: mix.birdPan ?? 0 });
      }
    } else { this.nearbyBirdSince = undefined; this.stopBirdCall(); }
    if (mix.foliage > .01 && now >= this.nextRustle && !document.hidden) {
      this.nextRustle = now + 5 + Math.random() * 7;
      this.play('leaves', mix.foliage, 4000, .9 + Math.random() * .2, undefined, { ambience: true, pan: mix.foliagePan });
    }
  }
  clearSoundscape() {
    this.soundscapeEnabled = false; this.soundscape = QUIET_SOUNDSCAPE; this.nextRustle = 0; this.nextBirdCall = 0; this.nearbyBirdSince = undefined;
    this.stopAmbience();
    this.stopBirdCall();
    this.trainMix = QUIET_TRAIN; this.stopTrain();
    this.campfireMix = QUIET_CAMPFIRE;
    this.worldMix = QUIET_WORLD_SOUND; this.resetDrips(); this.nextSteam = 0; this.stopWorld();
    this.setCastleMusic(false);
  }
  setCastleMusic(inside: boolean) {
    this.castleMusic = inside;
    this.syncMusic();
  }
  setCampfireSound(mix: CampfireSoundMix) {
    this.campfireMix = mix;
    this.syncAmbience();
  }
  private stopBirdCall() {
    if (!this.birdVoice) return;
    try { this.birdVoice.stop(); } catch { /* Already ended. */ }
    this.birdVoice = undefined;
  }
  setTrainSound(mix: TrainSoundMix) {
    this.trainMix = mix;
    if (mix.nearby && this.active && this.activated && !this.settings.muted && this.settings.effects > 0) for (const cue of ['trainDepart', 'trainBrake', 'trainStop', 'trainHorn'] as const) for (const url of CUES[cue]) void this.load(url);
    this.syncTrain();
  }
  prepareBirds() {
    if(this.active&&this.activated&&!this.settings.muted&&this.settings.ambience>0)
      for(const cue of ['birdRobin','birdBlueTit','birdSparrow','birdWings','birdStartled'] as const)for(const url of CUES[cue])if(!this.buffers.has(url)&&!this.loads.has(url))void this.load(url);
  }
  prepareFlightFoliage() {
    if (this.active && this.activated && !this.settings.muted && this.settings.effects > 0)
      for (const url of CUES.flightFoliage) void this.load(url);
  }
  private syncTrain() {
    const context = this.context;
    if (!this.active || !this.activated || this.settings.muted || !this.settings.effects) { this.stopTrain(); return; }
    if (!context || context.state !== 'running' || document.hidden) return;
    for (const key of Object.keys(TRAIN_LOOPS) as (keyof typeof TRAIN_LOOPS)[]) {
      const volume = this.trainMix[key]; let loop = this.trainLoops.get(key);
      if (volume <= .003) { if (loop) { loop.gain.gain.setTargetAtTime(0, context.currentTime, .18); this.retiringTrainSources.add(loop.source); loop.source.stop(context.currentTime + .8); this.trainLoops.delete(key); } continue; }
      if (!loop) {
        const buffer = this.buffers.get(TRAIN_LOOPS[key]);
        if (!buffer) { if (!this.loads.has(TRAIN_LOOPS[key])) void this.load(TRAIN_LOOPS[key], true, .08).then(() => { if (this.buffers.has(TRAIN_LOOPS[key])) this.syncTrain(); }); continue; }
        const source = context.createBufferSource(), gain = context.createGain(), pan = context.createStereoPanner?.();
        source.buffer = buffer; source.loop = true; gain.gain.value = 0; source.connect(gain);
        if (pan) { gain.connect(pan); pan.connect(this.effectsGain!); } else gain.connect(this.effectsGain!);
        source.onended = () => { this.retiringTrainSources.delete(source); source.disconnect(); gain.disconnect(); pan?.disconnect(); };
        source.start(); loop = { source, gain, pan }; this.trainLoops.set(key, loop);
      }
      loop.gain.gain.setTargetAtTime(volume, context.currentTime, .35);
      loop.source.playbackRate.setTargetAtTime(this.trainMix.rate, context.currentTime, .6);
      loop.pan?.pan.setTargetAtTime(key === 'engine' ? this.trainMix.enginePan : this.trainMix.railPan, context.currentTime, .25);
    }
  }
  private stopTrain() {
    for (const { source, gain, pan } of this.trainLoops.values()) { try { source.stop(); } catch { /* Ended. */ } source.disconnect(); gain.disconnect(); pan?.disconnect(); }
    this.trainLoops.clear();
    for (const source of this.retiringTrainSources) { try { source.stop(); } catch { /* Ended. */ } source.disconnect(); }
    this.retiringTrainSources.clear();
  }
  private syncAmbience() {
    const context = this.context;
    if (!this.active || !this.activated || !this.soundscapeEnabled || this.settings.muted || !this.settings.ambience) { this.stopAmbience(); return; }
    if (!context || context.state !== 'running' || document.hidden) return;
    for (const key of Object.keys(AMBIENCE) as (keyof typeof AMBIENCE)[]) {
      let loop = this.ambientLoops.get(key);
      const volume = key === 'campfire' ? this.campfireMix.volume : this.soundscape[key];
      if (volume <= .001) {
        if (loop) {
          loop.gain.gain.setTargetAtTime(0, context.currentTime, .2);
          this.retiringAmbienceSources.add(loop.source);
          loop.source.stop(context.currentTime + 1);
          this.ambientLoops.delete(key);
        }
        continue;
      }
      if (!loop) {
        if (volume <= .003) continue; // No decoding or idle nodes for silent beds.
        const buffer = this.buffers.get(AMBIENCE[key]);
        if (!buffer) {
          if (!this.loads.has(AMBIENCE[key])) void this.load(AMBIENCE[key], true).then(() => { if (this.buffers.has(AMBIENCE[key])) this.syncAmbience(); });
          continue;
        }
        const source = context.createBufferSource(), gain = context.createGain(), pan = key === 'campfire' ? context.createStereoPanner?.() : undefined;
        source.buffer = buffer; source.loop = true; gain.gain.value = 0;
        source.onended = () => { this.retiringAmbienceSources.delete(source); source.disconnect(); gain.disconnect(); pan?.disconnect(); };
        source.connect(gain);
        if (pan) { gain.connect(pan); pan.connect(this.ambienceGain!); } else gain.connect(this.ambienceGain!);
        source.start();
        loop = { source, gain, pan }; this.ambientLoops.set(key, loop);
      }
      loop.gain.gain.setTargetAtTime(clamp(volume), context.currentTime, key === 'campfire' ? .35 : 1.2);
      loop.pan?.pan.setTargetAtTime(this.campfireMix.pan, context.currentTime, .25);
    }
  }
  private stopAmbience() {
    for (const { source, gain, pan } of this.ambientLoops.values()) { try { source.stop(); } catch { /* Already stopped. */ } source.disconnect(); gain.disconnect(); pan?.disconnect(); }
    this.ambientLoops.clear();
    for (const source of this.retiringAmbienceSources) { try { source.stop(); } catch { /* Already ended. */ } source.disconnect(); }
    this.retiringAmbienceSources.clear();
  }
  private applyVolumes() {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.effectsGain?.gain.setTargetAtTime(this.settings.muted ? 0 : this.settings.effects, now, .05);
    this.musicGain?.gain.setTargetAtTime(this.settings.muted ? 0 : this.settings.music * .35, now, .25);
    this.ambienceGain?.gain.setTargetAtTime(this.settings.muted ? 0 : this.settings.ambience, now, .25);
  }
  private syncMusic() {
    if (!this.active || !this.activated || document.hidden || this.settings.muted || !this.settings.music) { this.stopMusic(); return; }
    const context = this.context;
    if (!context || context.state !== 'running') return;
    const desired: MusicTheme = this.castleMusic ? 'castle' : 'exploration';
    const buffer = this.buffers.get(MUSIC[desired]);
    if (!buffer) {
      if (!this.loads.has(MUSIC[desired])) void this.load(MUSIC[desired], true, 4).then(() => { if (this.buffers.has(MUSIC[desired])) this.syncMusic(); });
      return; // Keep the existing theme audible while the next one downloads.
    }
    const now = context.currentTime;
    if (!this.music.has(desired)) {
      const source = context.createBufferSource(), gain = context.createGain();
      const offset = (this.musicOffsets.get(desired) ?? 0) % buffer.duration;
      source.buffer = buffer; source.loop = true; gain.gain.value = 0;
      source.connect(gain); gain.connect(this.musicGain!);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      source.start(now, offset);
      this.music.set(desired, { source, gain, from: 0, target: -1, changedAt: now, startedAt: now, offset });
    }
    for (const [theme, loop] of this.music) {
      const target = theme === desired ? 1 : 0;
      if (loop.target !== target) {
        const progress = clamp((now - loop.changedAt) / MUSIC_FADE_SECONDS);
        const current = loop.target < 0 ? 0 : loop.from + (loop.target - loop.from) * progress;
        loop.gain.gain.cancelScheduledValues(now); loop.gain.gain.setValueAtTime(current, now);
        loop.gain.gain.linearRampToValueAtTime(target, now + MUSIC_FADE_SECONDS);
        loop.from = current; loop.target = target; loop.changedAt = now;
      } else if (!target && now - loop.changedAt >= MUSIC_FADE_SECONDS) this.stopMusicTheme(theme, loop);
    }
  }
  private stopMusicTheme(theme: MusicTheme, loop: MusicLoop) {
    const duration = loop.source.buffer?.duration ?? 1;
    this.musicOffsets.set(theme, (loop.offset + (this.context?.currentTime ?? loop.startedAt) - loop.startedAt) % duration);
    try { loop.source.stop(); } catch { /* Already stopped. */ }
    loop.source.disconnect(); loop.gain.disconnect(); this.music.delete(theme);
  }
  private stopMusic() {
    for (const [theme, loop] of this.music) this.stopMusicTheme(theme, loop);
  }
  private onVisibility = () => {
    if (document.hidden) {
      this.nearbyBirdSince = undefined; this.stopBirdCall();
      this.resetDrips(); this.nextSteam = 0;
      for(const source of this.voices){try{source.stop();}catch{} }this.voices.clear(); this.effectVoices.clear();
      void this.context?.suspend().catch(() => {});
    }
    else if (this.active && this.activated && this.context) { void this.context.resume().then(() => { this.syncMusic(); this.syncAmbience(); this.syncTrain(); this.syncWorld(); }).catch(() => {}); }
  };
}
export const friendsAudio = new FriendsAudio();
if (import.meta.hot) import.meta.hot.dispose(() => friendsAudio.dispose());
