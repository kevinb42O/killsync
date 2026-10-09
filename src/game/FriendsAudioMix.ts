import type { FriendsCue } from './FriendsAudio';

type Profile = { attackDb: number; peakDb: number };
// Category targets are measured before the event/distance and user gains.
// They preserve the quiet tool swish and put tactile impacts ahead of foliage.
const profile = (attackDb: number, peakDb = -4): Profile => ({ attackDb, peakDb });
const STEP = profile(-20, -3), IMPACT = profile(-17, -3), SMALL = profile(-22, -6);
const PROFILES: Record<FriendsCue, Profile | undefined> = {
  grass: STEP, woodStep: STEP, stoneStep: STEP, snow: STEP, waterStep: STEP, mudStep: STEP,
  wood: IMPACT, stone: IMPACT, ore: IMPACT, soil: profile(-20, -3), dig: IMPACT,
  landing: IMPACT, treeBreak: profile(-16, -3), miningBreak: IMPACT, cargoStone: IMPACT, cargoWood: IMPACT,
  collect: SMALL, pack: SMALL, eat: SMALL, jump: SMALL,
  click: SMALL, hover: SMALL, success: profile(-19), error: profile(-20), chime: profile(-20),
  chest: profile(-19), chestLatch: profile(-21), chestCoins: SMALL, chestReward: profile(-20, -6),
  ropeHook: profile(-21), ropeCreak: profile(-21, -6), reelRatchet: profile(-24, -6),
  flashlight: SMALL, nightVision: SMALL,
  caveDrip: profile(-23, -9), steam: profile(-24, -6),
  leaves: profile(-25, -6), birdCall: profile(-23, -6), birdRobin: profile(-18,-6), birdBlueTit: profile(-18,-6), birdSparrow: profile(-18,-6), birdWings: profile(-21,-6), birdStartled: profile(-19,-6), flightFoliage: profile(-24, -6),
  trainDepart: profile(-23, -6), trainBrake: profile(-23, -6), trainStop: profile(-23, -6), trainHorn: profile(-19, -6),
  gunfire: profile(-17, -3), reloadRifle: profile(-30, -6), reloadHandgun: profile(-30, -6), reloadShotgun: profile(-30, -6),
  swing: undefined,
};

/** One bounded scan when a short effect decodes, never during a game frame.
 * A fixed linear gain preserves the recording's dynamics. The loudest 50 ms
 * window prevents long quiet tails from being amplified into a loud attack.
 * Peak and boost limits protect very sparse clicks and noisy recordings. */
export function effectCalibration(buffer: AudioBuffer, cue: FriendsCue): number {
  const target = PROFILES[cue];
  if (!target) return 1;
  const window = Math.max(1, Math.round(buffer.sampleRate * .05));
  let peak = 0, loudest = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    let energy = 0;
    for (let i = 0; i < data.length; i++) {
      const value = data[i];
      peak = Math.max(peak, Math.abs(value)); energy += value * value;
      if (i >= window) energy -= data[i - window] * data[i - window];
      if (i >= Math.min(window, data.length) - 1) loudest = Math.max(loudest, energy / Math.min(window, data.length));
    }
  }
  if (peak < .0001 || loudest < .00000001) return 1;
  return Math.min(4, Math.pow(10, target.attackDb / 20) / Math.sqrt(loudest), Math.pow(10, target.peakDb / 20) / peak);
}
