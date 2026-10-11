import * as THREE from 'three';

/** A damped, constrained pendulum. All scratch state is owned once per rod;
 * bounded substeps keep hitches stable without a general physics engine. */
export class FriendsFishingBobber {
  readonly position=new THREE.Vector3();
  readonly direction=new THREE.Vector3(0,-1,0);
  private anchor=new THREE.Vector3();
  private carrier=new THREE.Vector3();
  private anchorVelocity=new THREE.Vector3();
  private velocity=new THREE.Vector3();
  private offset=new THREE.Vector3();
  private motion=new THREE.Vector3();
  private initialized=false;

  reset(){this.initialized=false;}

  update(tip:THREE.Vector3,carrier:THREE.Vector3,length:number,dtMs:number,movementScale=1){
    const dt=Math.max(0,Math.min(80,dtMs))/1000;
    this.motion.subVectors(tip,this.anchor).addScaledVector(this.offset.subVectors(carrier,this.carrier),movementScale-1);
    if(!this.initialized||dtMs>250||this.motion.length()>length*8){
      this.direction.set(0,-1,0);this.velocity.set(0,0,0);this.anchorVelocity.set(0,0,0);this.initialized=true;
    }else if(dt>0){
      this.motion.divideScalar(dt);
      // Changes in support velocity supply inertia: steady walking does not
      // keep pumping the swing, and stopping lets the weight carry on.
      this.velocity.add(this.anchorVelocity).sub(this.motion);
      this.anchorVelocity.copy(this.motion);
      const steps=Math.ceil(dt*120),h=dt/steps;
      this.offset.copy(this.direction).multiplyScalar(length);
      for(let i=0;i<steps;i++){
        this.velocity.y-=length*14*h;
        this.velocity.multiplyScalar(Math.exp(-2.4*h));
        // Bound exceptional camera/network jumps before solving the tether.
        this.velocity.clampLength(0,length*12);
        this.offset.addScaledVector(this.velocity,h).normalize().multiplyScalar(length);
        this.direction.copy(this.offset).divideScalar(length);
        this.velocity.addScaledVector(this.direction,-this.velocity.dot(this.direction));
      }
    }
    this.anchor.copy(tip);this.carrier.copy(carrier);
    this.position.copy(tip).addScaledVector(this.direction,length);
    return this.position;
  }
}
