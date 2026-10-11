import * as THREE from 'three';

// The held rod is in camera metres while walking is in world units. Its tip
// sweeps a much bigger arc than the short tether: tame those inputs separately.
export const FISHING_BOBBER_WALK_SCALE=1/64;
export const FISHING_BOBBER_TIP_SCALE=.3;
const INPUT_SMOOTHING_SECONDS=.035;
const SWING_DAMPING=1.45;

/** A spherical pendulum driven by the actual rod-tip motion. Integrating on
 * the tether's sphere preserves swing momentum, including complete loops. */
export class FriendsFishingBobber {
  readonly position=new THREE.Vector3();
  readonly direction=new THREE.Vector3(0,-1,0);
  private anchor=new THREE.Vector3();
  private carrier=new THREE.Vector3();
  private anchorVelocity=new THREE.Vector3();
  private velocity=new THREE.Vector3();
  private offset=new THREE.Vector3();
  private motion=new THREE.Vector3();
  private acceleration=new THREE.Vector3();
  private tangent=new THREE.Vector3();
  private initialized=false;

  reset(){this.initialized=false;}

  update(tip:THREE.Vector3,carrier:THREE.Vector3,length:number,dtMs:number,movementScale=1,tipScale=1){
    length=Math.max(.001,length);
    const dt=Math.max(0,Math.min(250,dtMs))/1000;
    // Camera translation uses world units; the held rod uses viewmodel units.
    // Subtract translation BEFORE applying tip gain. Both stay in world space:
    // changing heading must never reverse or rotate stored swing momentum.
    this.offset.subVectors(carrier,this.carrier);
    this.motion.subVectors(tip,this.anchor).sub(this.offset).multiplyScalar(tipScale).addScaledVector(this.offset,movementScale);
    if(!this.initialized||dtMs>250||this.motion.length()>length*8||this.offset.length()*movementScale>length*8){
      this.direction.set(0,-1,0);this.velocity.set(0,0,0);this.anchorVelocity.set(0,0,0);this.initialized=true;
      this.anchor.copy(tip);this.carrier.copy(carrier);
    }else if(dt>0){
      this.motion.divideScalar(dt).clampLength(0,length*12);
      const steps=Math.ceil(dt*240),h=dt/steps;
      for(let i=0;i<steps;i++){
        // Filter SUPPORT velocity, never the direction of the weight. This
        // removes mouse/snapshot spikes without snapping or reversing a swing.
        // The exact exponential response is independent of the render rate.
        this.acceleration.subVectors(this.anchorVelocity,this.motion).multiplyScalar((1-Math.exp(-h/INPUT_SMOOTHING_SECONDS))/h);
        this.anchorVelocity.addScaledVector(this.acceleration,-h);
        this.acceleration.y-=length*14;
        this.tangent.copy(this.acceleration).addScaledVector(this.direction,-this.acceleration.dot(this.direction));
        this.velocity.addScaledVector(this.tangent,h);
        this.velocity.addScaledVector(this.direction,-this.velocity.dot(this.direction));
        this.velocity.multiplyScalar(Math.exp(-SWING_DAMPING*h));
        this.velocity.clampLength(0,length*12);
        const speed=this.velocity.length();
        if(speed>1e-10){
          const angle=speed*h/length,cos=Math.cos(angle),sin=Math.sin(angle);
          this.offset.copy(this.direction);
          this.tangent.copy(this.velocity).divideScalar(speed);
          this.direction.multiplyScalar(cos).addScaledVector(this.tangent,sin).normalize();
          // Parallel transport the velocity along the arc. Projecting an
          // Euler step onto the tether throws away energy at every frame.
          this.velocity.copy(this.tangent).multiplyScalar(speed*cos).addScaledVector(this.offset,-speed*sin);
        }
      }
    }
    // A zero-time render must not consume movement before it can supply inertia.
    if(dt>0||dtMs>250){this.anchor.copy(tip);this.carrier.copy(carrier);}
    this.position.copy(tip).addScaledVector(this.direction,length);
    return this.position;
  }
}
