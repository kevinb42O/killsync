import type { ControlScheme } from '../controls';

export const EMPTY_HANDS = 6 as const;
export const FRIENDS_ARM = { leftRaise:1, rightRaise:2, leftPoint:4, rightPoint:8 } as const;
export type FriendsArmPose = 'rest' | 'up' | 'point' | 'sideways';
export type FriendsHandsState = { mask:number; yaw:number; pitch:number };
export function sanitizeFriendsArms(value:unknown):number {
  return typeof value==='number' && Number.isInteger(value) && value>=0 && value<=15 ? value : 0;
}
export function friendsArmPose(mask:number, side:'left'|'right'):FriendsArmPose {
  const raise=Boolean(mask & (side==='left'?1:2)),point=Boolean(mask & (side==='left'?4:8));
  return raise ? point?'sideways':'up' : point?'point':'rest';
}
export function friendsGestureKey(key:string, scheme:ControlScheme):number {
  return key.toLowerCase()==='e' ? 2 : key.toLowerCase()===(scheme==='AZERTY'?'a':'q') ? 1 : 0;
}
/** Physical number positions work with the unshifted AZERTY punctuation row. */
export function friendsNumberSlot(code:string):number|undefined {
  const match=/^(?:Digit|Numpad)([1-9])$/.exec(code);return match?Number(match[1])-1:undefined;
}
export class FriendsGestureControls {
  mask=0;
  set(bit:number, held:boolean) { this.mask=held ? this.mask|bit : this.mask&~bit;return this.mask; }
  clear() { this.mask=0; }
}
