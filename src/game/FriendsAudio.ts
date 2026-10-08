import type { FriendsSoundscapeMix } from './FriendsSoundscape';
import { QUIET_TRAIN, type TrainSoundMix } from './FriendsTrainSound';
const QUIET_SOUNDSCAPE: FriendsSoundscapeMix = { wind: 0, birds: 0, crickets: 0, surf: 0, foliage: 0, foliagePan: 0 };

export type SurfaceCue = 'grass' | 'woodStep' | 'stoneStep' | 'snow';
type Cue = SurfaceCue | 'wood' | 'stone' | 'soil' | 'ore' | 'dig' | 'landing' | 'leaves' | 'treeBreak' | 'birdCall'
  | 'trainDepart' | 'trainBrake' | 'trainStop' | 'trainHorn'
  | 'click' | 'hover' | 'success' | 'error' | 'collect' | 'pack' | 'jump' | 'swing' | 'chest' | 'chime'
  | 'gunfire' | 'reloadRifle' | 'reloadHandgun' | 'reloadShotgun' | 'eat';
export type FriendsAudioSettings = { music: number; effects: number; ambience: number; muted: boolean };
const ROOT = `${import.meta.env.BASE_URL}audio/friends/`;
const variants = (stem: string, count = 3) => Array.from({ length: count }, (_, i) => `${ROOT}${stem}_${String(i).padStart(3, '0')}.ogg`);
const CUES: Record<Cue, string[]> = {
  grass: variants('footstep_grass'), woodStep: variants('footstep_wood'), stoneStep: variants('footstep_concrete'), snow: variants('footstep_snow'),
  wood: variants('impactWood_medium'), stone: variants('impactMining', 5), soil: variants('impactSoft_medium'), ore: variants('impactMetal_light'),
  dig: [ROOT + 'shovel.ogg'], landing: [ROOT + 'landing.wav'], leaves: [ROOT + 'leaves.ogg'], treeBreak: variants('impactWood_heavy'),
  birdCall: variants('bird_call', 4),
  trainDepart: [ROOT + 'train_depart.ogg'], trainBrake: [ROOT + 'train_brake.ogg'], trainStop: [ROOT + 'train_stop.ogg'], trainHorn: [ROOT + 'train_horn.ogg'],
  click: [ROOT + 'click_001.ogg'], hover: [ROOT + 'select_001.ogg'], success: [ROOT + 'confirmation_001.ogg'], error: [ROOT + 'error_001.ogg'],
  collect: [ROOT + 'handleCoins.ogg'], pack: [ROOT + 'handleSmallLeather.ogg'], jump: [ROOT + 'jump.ogg'], swing: [ROOT + 'knifeSlice.ogg'],
  chest: [ROOT + 'bookOpen.ogg'], chime: [ROOT + 'glass_001.ogg'],
  eat: [ROOT + 'eat.ogg'],
  gunfire: [`${import.meta.env.BASE_URL}audio/cc0-gunfire.wav`],
  reloadRifle: [`${import.meta.env.BASE_URL}audio/cc0-rifle-reload.wav`],
  reloadHandgun: [`${import.meta.env.BASE_URL}audio/cc0-handgun-reload.wav`],
  reloadShotgun: [`${import.meta.env.BASE_URL}audio/cc0-shotgun-reload.wav`],
};
const AMBIENCE = { wind: ROOT + 'wind_clean.ogg', crickets: ROOT + 'crickets.ogg', surf: ROOT + 'surf.ogg' };
const TRAIN_LOOPS = { engine: ROOT + 'train_drive.ogg', rail: ROOT + 'train_rail.ogg' };
const STORAGE = 'sunline.audio.v1';
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
  private ambientLoops = new Map<keyof typeof AMBIENCE, { source: AudioBufferSourceNode; gain: GainNode }>();
  private retiringAmbienceSources = new Set<AudioBufferSourceNode>();
  private soundscape: FriendsSoundscapeMix = QUIET_SOUNDSCAPE;
  private soundscapeEnabled = false;
  private trainMix: TrainSoundMix = QUIET_TRAIN;
  private trainLoops = new Map<keyof typeof TRAIN_LOOPS, { source: AudioBufferSourceNode; gain: GainNode; pan?: StereoPannerNode }>();
  private retiringTrainSources = new Set<AudioBufferSourceNode>();
  private nextRustle = 0;
  private nextBirdCall = 0;
  private nearbyBirdSince?: number;
  private birdVoice?: AudioBufferSourceNode;
  private music?: AudioBufferSourceNode;
  private musicBuffer?: AudioBuffer;
  private musicLoad?: Promise<void>;
  private activated = false;
  private preloaded = false;
  private buffers = new Map<string, AudioBuffer>();
  private loads = new Map<string, Promise<void>>();
  private voices = new Set<AudioBufferSourceNode>();
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
    if (this.settings.muted || !this.settings.ambience) { this.nearbyBirdSince = undefined; this.stopBirdCall(); }
    this.syncMusic();
    this.syncAmbience();
    this.syncTrain();
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
        this.voices.clear();
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
    this.voices.clear(); this.buffers.clear(); this.musicBuffer = undefined;
    void this.context?.close().catch(() => {}); this.context = undefined;
  }
  activate = () => {
    if (!this.active) return;
    try {
      if (!this.context) {
        const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        this.context = new AudioCtx();
        this.effectsGain = this.context.createGain(); this.effectsGain.connect(this.context.destination);
        this.musicGain = this.context.createGain(); this.musicGain.connect(this.context.destination);
        this.ambienceGain = this.context.createGain(); this.ambienceGain.connect(this.context.destination);
        this.applyVolumes();
        const unlock = this.context.createBufferSource();
        unlock.buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
        unlock.connect(this.effectsGain); unlock.onended = () => unlock.disconnect(); unlock.start();
      }
      this.activated = true;
      if (this.context.state === 'suspended') void this.context.resume().then(() => { this.syncMusic(); this.syncAmbience(); this.syncTrain(); }).catch(() => {});
      this.preload();
      this.syncMusic();
      this.syncAmbience();
      this.syncTrain();
    } catch { /* Audio must never block world input. */ }
  };
  preload() {
    if (!this.context) return;
    if (!this.preloaded) {
      this.preloaded = true;
      for (const url of new Set(Object.entries(CUES).filter(([cue]) => cue !== 'birdCall' && !cue.startsWith('train')).flatMap(([, urls]) => urls))) void this.load(url);
    }
    if (!this.musicBuffer && !this.musicLoad) {
      const context = this.context;
      this.musicLoad = fetch(ROOT + 'vaporware.mp3')
        .then(response => { if (!response.ok) throw new Error('Theme unavailable'); return response.arrayBuffer(); })
        .then(data => context.decodeAudioData(data))
        .then(buffer => { if (this.disposed) return; this.musicBuffer = crossfadeLoop(context, buffer); this.syncMusic(); })
        .catch(() => {})
        .finally(() => { this.musicLoad = undefined; });
    }
  }
  private load(url: string, loop = false, seamSeconds = 2): Promise<void> {
    if (this.buffers.has(url) || !this.context) return Promise.resolve();
    const pending = this.loads.get(url); if (pending) return pending;
    const context = this.context;
    const promise = fetch(url).then(response => { if (!response.ok) throw new Error('Sound unavailable'); return response.arrayBuffer(); })
      .then(data => context.decodeAudioData(data)).then(buffer => { if (!this.disposed) this.buffers.set(url, loop ? crossfadeLoop(context, buffer, seamSeconds) : buffer); }).catch(() => {})
      .finally(() => this.loads.delete(url));
    this.loads.set(url, promise);
    return promise;
  }
  play(cue: Cue, volume = .3, cooldownMs = 80, rate = 1, duration?: number, options?: { ambience?: boolean; pan?: number }) {
    const context = this.context;
    if (!this.active || !context || context.state !== 'running' || document.hidden || this.settings.muted || !(options?.ambience ? this.settings.ambience : this.settings.effects) || this.voices.size >= 20) return;
    const now = context.currentTime;
    if ((now - (this.lastCue.get(cue) ?? -Infinity)) * 1000 < cooldownMs) return;
    const urls = CUES[cue];
    const index = ((this.lastVariant.get(cue) ?? -1) + 1) % urls.length;
    const buffer = this.buffers.get(urls[index]);
    if (!buffer) { void this.load(urls[index]); return; } // Never replay a stale input after download.
    this.lastCue.set(cue, now); this.lastVariant.set(cue, index);
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer; source.playbackRate.value = Math.max(.65, Math.min(1.4, rate));
    const length = Math.min(duration ?? buffer.duration, buffer.duration);
    gain.gain.value = clamp(volume);
    if (duration !== undefined) {
      const end = now + length / source.playbackRate.value;
      gain.gain.setValueAtTime(clamp(volume), Math.max(now, end - .025));
      gain.gain.linearRampToValueAtTime(0, end);
    }
    const pan = options?.pan && context.createStereoPanner ? context.createStereoPanner() : undefined;
    source.connect(gain);
    if (pan) { pan.pan.value = Math.max(-1, Math.min(1, options!.pan!)); gain.connect(pan); pan.connect(options?.ambience ? this.ambienceGain! : this.effectsGain!); }
    else gain.connect(options?.ambience ? this.ambienceGain! : this.effectsGain!);
    this.voices.add(source);
    source.onended = () => { this.voices.delete(source); if (this.birdVoice === source) this.birdVoice = undefined; source.disconnect(); gain.disconnect(); pan?.disconnect(); };
    source.start(now, 0, length);
    return source;
  }
  material(kind: string, volume = .32, rate = 1) { this.play(kind === 'wood' || kind === 'timber' ? 'wood' : kind === 'soil' || kind === 'grass' ? 'soil' : kind === 'ore' || kind === 'iron' || kind === 'copper' || kind === 'teal' ? 'ore' : 'stone', volume, 90, rate); }
  takeoff() { this.play('jump', .12, 100); }
  land(surface: SurfaceCue, strength = 1) { this.play('landing', Math.min(.42, .24 * strength), 100); this.play(surface, Math.min(.25, .12 * strength), 100); }
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
      const volume = this.soundscape[key];
      if (key === 'wind' && volume <= .001) {
        if (loop) {
          loop.gain.gain.setTargetAtTime(0, context.currentTime, .2);
          this.retiringAmbienceSources.add(loop.source);
          loop.source.stop(context.currentTime + 1);
          this.ambientLoops.delete(key);
        }
        continue;
      }
      if (!loop) {
        if (key === 'wind' && volume <= .003) continue; // Don't load wind on ordinary ground.
        if (key === 'surf' && this.soundscape.surf <= .001) continue; // Don't download/decode the coast inland.
        const buffer = this.buffers.get(AMBIENCE[key]);
        if (!buffer) {
          if (!this.loads.has(AMBIENCE[key])) void this.load(AMBIENCE[key], true).then(() => { if (this.buffers.has(AMBIENCE[key])) this.syncAmbience(); });
          continue;
        }
        const source = context.createBufferSource(), gain = context.createGain();
        source.buffer = buffer; source.loop = true; gain.gain.value = 0;
        source.onended = () => { this.retiringAmbienceSources.delete(source); source.disconnect(); gain.disconnect(); };
        source.connect(gain); gain.connect(this.ambienceGain!); source.start();
        loop = { source, gain }; this.ambientLoops.set(key, loop);
      }
      loop.gain.gain.setTargetAtTime(clamp(this.soundscape[key]), context.currentTime, 1.2);
    }
  }
  private stopAmbience() {
    for (const { source, gain } of this.ambientLoops.values()) { try { source.stop(); } catch { /* Already stopped. */ } source.disconnect(); gain.disconnect(); }
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
    if (this.music || !this.musicBuffer || !this.context || this.context.state !== 'running') return;
    const source = this.context.createBufferSource(); source.buffer = this.musicBuffer; source.loop = true;
    source.connect(this.musicGain!); this.music = source;
    const gain = this.musicGain!.gain, now = this.context.currentTime;
    gain.cancelScheduledValues(now); gain.setValueAtTime(0, now); gain.linearRampToValueAtTime(this.settings.music * .35, now + 2);
    source.start();
  }
  private stopMusic() {
    if (!this.music) return;
    try { this.music.stop(); } catch { /* Already stopped. */ }
    this.music.disconnect(); this.music = undefined;
  }
  private onVisibility = () => {
    if (document.hidden) { this.nearbyBirdSince = undefined; this.stopBirdCall(); void this.context?.suspend().catch(() => {}); }
    else if (this.active && this.activated && this.context) { void this.context.resume().then(() => { this.syncMusic(); this.syncAmbience(); this.syncTrain(); }).catch(() => {}); }
  };
}
export const friendsAudio = new FriendsAudio();
if (import.meta.hot) import.meta.hot.dispose(() => friendsAudio.dispose());
