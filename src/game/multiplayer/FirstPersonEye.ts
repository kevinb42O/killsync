/** Shared standing viewpoint and authoritative tool-ray contract. */
export const COOP_FIRST_PERSON_EYE_HEIGHT = 50;
export const FIRST_PERSON_SLIDE_DROP = 9;
export const FIRST_PERSON_CEILING_MARGIN = 3;

/** Swimming retains its existing waterline clearance and buoyancy contract. */
export function firstPersonEyeHeight(actor: { sliding?: boolean; motion?: { swimming?: boolean }; swimming?: boolean }) {
  return actor.swimming || actor.motion?.swimming ? 26 : COOP_FIRST_PERSON_EYE_HEIGHT - (actor.sliding ? FIRST_PERSON_SLIDE_DROP : 0);
}

export function firstPersonEyeZ(actor: { z: number; sliding?: boolean; motion?: { swimming?: boolean }; swimming?: boolean }, ceiling = Infinity) {
  return Math.min(actor.z + firstPersonEyeHeight(actor), ceiling - FIRST_PERSON_CEILING_MARGIN);
}
