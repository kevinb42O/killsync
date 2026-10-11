import {describe,it,expect} from 'vitest';
import {FriendsFishingBoatHelmCamera} from './FriendsFishingBoatHelmCamera';
import {FriendsFishingBoat} from '../multiplayer/FriendsFishingBoat';
describe('first-person helm look',()=>{
  it('faces the front windows, carries free look through turns, and leaves the view unchanged on release',()=>{
    const helm=new FriendsFishingBoatHelmCamera(),boat=new FriendsFishingBoat().vehicle(),view={yaw:1,pitch:.4};
    helm.update(view,boat);expect(view.yaw).toBeCloseTo(0);expect(view.pitch).toBe(0);
    view.yaw+=.6;view.pitch=.2;helm.update(view,{...boat,angle:boat.angle-.25});
    expect(view.yaw).toBeCloseTo(.85);expect(view.pitch).toBe(.2);
    helm.update(view,undefined);expect(view.yaw).toBeCloseTo(.85);expect(view.pitch).toBe(.2);
  });
  it('toggles the sailing camera only at the helm and resets on release or a new takeover',()=>{
    const helm=new FriendsFishingBoatHelmCamera(),boat=new FriendsFishingBoat().vehicle(),view={yaw:0,pitch:0};
    expect(helm.toggle()).toBe(false);
    expect(helm.update(view,boat)).toBe(false);
    expect(helm.toggle()).toBe(true);expect(helm.update(view,boat)).toBe(true);
    helm.resetView();expect(helm.update(view,boat)).toBe(false);
    expect(helm.toggle()).toBe(true);expect(helm.update(view,undefined)).toBe(false);
    expect(helm.update(view,boat)).toBe(false);
  });
  it('handles heading wrap without a full camera spin',()=>{
    const helm=new FriendsFishingBoatHelmCamera(),boat=new FriendsFishingBoat().vehicle(),view={yaw:0,pitch:0};
    helm.update(view,{...boat,angle:Math.PI-.01});const yaw=view.yaw;
    helm.update(view,{...boat,angle:-Math.PI+.01});expect(view.yaw-yaw).toBeCloseTo(-.02);
  });
});
