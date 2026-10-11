import type { FriendsVehicle } from '../multiplayer/FriendsExpedition';
/** Inherit the boat's heading while preserving free mouse look and release view. */
export class FriendsFishingBoatHelmCamera {
  private previous?:{id:string;angle:number};
  private thirdPerson=false;
  toggle(){if(this.previous)this.thirdPerson=!this.thirdPerson;return this.thirdPerson;}
  resetView(){this.thirdPerson=false;}
  update(view:{yaw:number;pitch:number},boat:FriendsVehicle|undefined){
    if(!boat){this.previous=undefined;this.thirdPerson=false;return false;}
    if(this.previous?.id!==boat.id){this.thirdPerson=false;view.yaw=-boat.angle-Math.PI/2;view.pitch=0;}
    else view.yaw-=Math.atan2(Math.sin(boat.angle-this.previous.angle),Math.cos(boat.angle-this.previous.angle));
    this.previous={id:boat.id,angle:boat.angle};
    return this.thirdPerson;
  }
}
