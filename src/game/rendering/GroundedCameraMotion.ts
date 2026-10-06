/** Cushions small stair/terrain changes without delaying airborne motion or
 * moving the physical body. Eye height stays within the body clearance. */
export class GroundedCameraMotion {
  private previousHeight?: number;
  private wasGrounded = false;
  private stepOffset = 0;
  private stanceOffset = 0;

  reset() {
    this.previousHeight = undefined;
    this.wasGrounded = false;
    this.stepOffset = this.stanceOffset = 0;
  }

  update(height: number, grounded: boolean, crouching: boolean, deltaMs: number) {
    const dt = Math.max(0, deltaMs);
    const difference = (this.previousHeight ?? height) - height;
    if (this.wasGrounded && grounded && Math.abs(difference) <= 16) {
      this.stepOffset = Math.max(-8, Math.min(8, this.stepOffset + difference));
      this.stepOffset *= Math.exp(-dt / 45);
    } else this.stepOffset = 0;
    const targetStance = crouching ? -9 : 0;
    this.stanceOffset = this.previousHeight === undefined ? targetStance
      : targetStance + (this.stanceOffset - targetStance) * Math.exp(-dt / 65);
    this.previousHeight = height;
    this.wasGrounded = grounded;
    return height + this.stepOffset + this.stanceOffset;
  }
}
