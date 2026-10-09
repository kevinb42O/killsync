import { FRONTIER_DAY_DURATION_MS, sampleFrontierDayNight } from './FriendsDayNight';
export type FriendsEnvironmentChange = { hour?:number; speed?:number; windSpeed?:number; reset?:boolean };
/** Anchors use simulation time so every renderer, including late joiners, can
 * evaluate the host's settings without relying on its own wall clock. */
export type FriendsEnvironmentSnapshot = {
  enabled: boolean; speed: number; resumeSpeed: number; windSpeed: number;
  timeAnchor: number; sourceAnchor: number; windAnchor: number; windSourceAnchor: number;
};
/** Rate changes re-anchor at the current phase, including pause/resume and wind.
 * Used for local render reviews and the authoritative multiplayer environment. */
export class FriendsEnvironmentPreview {
  private worldMs=0;
  private windMs=0;
  private timeAnchor=0;
  private sourceAnchor=0;
  private windAnchor=0;
  private windSourceAnchor=0;
  enabled=false;
  speed=1;
  resumeSpeed=1;
  windSpeed=1;
  get snapshot():FriendsEnvironmentSnapshot {
    return {enabled:this.enabled,speed:this.speed,resumeSpeed:this.resumeSpeed,windSpeed:this.windSpeed,
      timeAnchor:this.timeAnchor,sourceAnchor:this.sourceAnchor,windAnchor:this.windAnchor,windSourceAnchor:this.windSourceAnchor};
  }
  synchronize(snapshot:FriendsEnvironmentSnapshot){
    this.enabled=snapshot.enabled;this.speed=snapshot.speed;this.resumeSpeed=snapshot.resumeSpeed;this.windSpeed=snapshot.windSpeed;
    this.timeAnchor=snapshot.timeAnchor;this.sourceAnchor=snapshot.sourceAnchor;this.windAnchor=snapshot.windAnchor;this.windSourceAnchor=snapshot.windSourceAnchor;
  }
  time(worldMs:number,animationMs=worldMs){this.worldMs=worldMs;this.windMs=animationMs;return this.enabled?this.timeAnchor+(worldMs-this.sourceAnchor)*this.speed:worldMs;}
  get windSeconds(){return (this.windAnchor+(this.windMs-this.windSourceAnchor)*this.windSpeed)/1000;}
  change(change:FriendsEnvironmentChange){
    if(change.reset){this.windAnchor=this.windSeconds*1000;this.windSourceAnchor=this.windMs;this.enabled=false;this.speed=1;this.resumeSpeed=1;this.windSpeed=1;return;}
    const current=this.state.elapsedMs;
    if(change.hour!==undefined&&Number.isFinite(change.hour)){
      const phase=((change.hour%24)+24)%24;
      this.timeAnchor=((phase-9+24)%24)/24*FRONTIER_DAY_DURATION_MS;this.sourceAnchor=this.worldMs;this.enabled=true;
    }else if(change.speed!==undefined){this.timeAnchor=current;this.sourceAnchor=this.worldMs;this.enabled=true;}
    if(change.speed!==undefined&&Number.isFinite(change.speed)){this.speed=Math.max(0,Math.min(120,change.speed));if(this.speed>0)this.resumeSpeed=this.speed;}
    if(change.windSpeed!==undefined&&Number.isFinite(change.windSpeed)){
      this.windAnchor=this.windSeconds*1000;this.windSourceAnchor=this.windMs;this.windSpeed=Math.max(0,Math.min(4,change.windSpeed));
    }
  }
  get state(){const elapsedMs=this.enabled?this.timeAnchor+(this.worldMs-this.sourceAnchor)*this.speed:this.worldMs;return {elapsedMs,...sampleFrontierDayNight(elapsedMs),enabled:this.enabled,speed:this.speed,resumeSpeed:this.resumeSpeed,windSpeed:this.windSpeed};}
}
export type FriendsEnvironmentState=FriendsEnvironmentPreview['state'];
