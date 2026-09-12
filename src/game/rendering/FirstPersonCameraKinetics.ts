/**
 * First-Person Locomotion Camera Kinetics & Natural Head Bob.
 *
 * Implements biomechanically grounded camera dynamics for walking, sprinting,
 * turning, and strafing.
 *
 * Design Principles:
 * - Subtle, high-end, and realistic: angles stay strictly between 0.2° and 0.9°
 *   to avoid motion sickness and maintain competitive sight picture integrity.
 * - View-Local Translation: all gait bob (sway, bounce, surge) is evaluated
 *   along the camera's local horizontal axes (Forward, Right, Up) so movement
 *   feels natural regardless of facing direction.
 * - Decoupled Viewmodel Inertia: weapon bob lags the camera by ~0.45 rad,
 *   simulating secondary momentum of a weapon held in hands.
 * - Tactical Sprint Low-Ready Stance: sprinting naturally lowers the firearm,
 *   tucks it inward, and points the barrel diagonally downward (~ -28° pitch,
 *   +14° yaw, -12° roll), keeping the entire crosshair and battlefield vision
 *   crystal clear while replacing frantic high-frequency bounce with a smooth,
 *   cushioned stride sway.
 * - ADS Suppression: aiming down sights damps bob translation and rotation by
 *   88-90% to maintain razor-sharp reticle precision.
 */

export interface FirstPersonKineticsInput {
  deltaTime: number;
  yaw: number;
  pitch: number;
  playerVelocity: { x: number; y: number };
  isSprinting: boolean;
  isMoving: boolean;
  isAiming: boolean;
  adsProgress: number;
  isShooting?: boolean;
  isReloading?: boolean;
  isDashing?: boolean;
  isSliding?: boolean;
  isAirborne?: boolean;
  verticalOffset?: number;
  verticalVelocity?: number;
  mouseDeltaX?: number;
  mouseDeltaY?: number;
}

export interface FirstPersonKineticsOutput {
  /** Translation delta in world coordinates to add to camera position. */
  cameraTranslation: { x: number; y: number; z: number };
  /** Rotational offsets in radians: pitch (nod/lean), yaw (swivel), roll (bank). */
  cameraRotation: { pitch: number; yaw: number; roll: number };
  /** Secondary local offset for the first-person weapon/hand viewmodel. */
  viewmodelTranslation: { x: number; y: number; z: number };
  /** Secondary local rotation in radians for the first-person weapon viewmodel. */
  viewmodelRotation: { pitch: number; yaw: number; roll: number };
  /** Current step phase [0, 2π). */
  stridePhase: number;
  /** Smoothed weight of the moving state [0, 1]. */
  movingWeight: number;
  /** Smoothed weight of the sprint state [0, 1]. */
  sprintWeight: number;
  /** Smoothed weight of the firing / sprint-to-fire ready state [0, 1]. */
  firingWeight: number;
  /** Smoothed weight of the airborne state [0, 1]. */
  airborneWeight: number;
  /** Current jump spring displacement. */
  jumpDisplacement: number;
  /** Current land spring displacement. */
  landDisplacement: number;
}

export interface FirstPersonKineticsConfig {
  /** Master intensity multiplier (0 disables motion, 1.0 is default calibrated realism). */
  intensity?: number;
  /** Step cadence for normal walking in Hz (default: 1.85 Hz / ~111 steps/min). */
  walkFrequency?: number;
  /** Step cadence for sprinting in Hz (default: 2.85 Hz / ~171 steps/min). */
  sprintFrequency?: number;
}

export class FirstPersonCameraKinetics {
  intensity: number = 1.0;
  walkFrequency: number = 1.85;
  sprintFrequency: number = 2.85;

  private stridePhase: number = 0;
  private breathTimer: number = 0;
  private movingWeight: number = 0;
  private sprintWeight: number = 0;
  private firingWeight: number = 0;
  private reloadWeight: number = 0;
  private slidingWeight: number = 0;
  private airborneWeight: number = 0;
  private fireRecoveryTimer: number = 0;
  private strafeLeanRoll: number = 0;
  private turnBankingRoll: number = 0;
  private pitchInertia: number = 0;
  private vmTurnBankRoll: number = 0;
  private vmTurnBankYaw: number = 0;
  private lastForwardVelocity: number = 0;

  // Jump take-off & landing cushion physics springs
  private jumpSpringPos: number = 0;
  private jumpSpringVel: number = 0;
  private landSpringPos: number = 0;
  private landSpringVel: number = 0;
  private wasAirborne: boolean = false;
  private airborneTimer: number = 0;
  private lastVerticalOffset: number = 0;
  /** Explicit bridge events take precedence over inferred altitude changes for one frame. */
  private jumpImpulseWasNotified: boolean = false;
  /** Explicit bridge events take precedence over inferred altitude changes for one frame. */
  private landImpulseWasNotified: boolean = false;

  constructor(config: FirstPersonKineticsConfig = {}) {
    if (config.intensity !== undefined) this.intensity = config.intensity;
    if (config.walkFrequency !== undefined) this.walkFrequency = config.walkFrequency;
    if (config.sprintFrequency !== undefined) this.sprintFrequency = config.sprintFrequency;
  }

  /**
   * Notifies the kinetics solver that a shot was fired.
   * Immediately snaps the weapon to high-ready firing alignment and starts
   * a tactical follow-through window (~360ms) so tap/burst fire never spasms.
   */
  notifyFired() {
    this.fireRecoveryTimer = 0.36;
    this.firingWeight = Math.max(this.firingWeight, 0.96);
  }

  /**
   * Notifies the kinetics solver of a jump launch (ground jump, double jump, wall jump).
   * Produces a subtle upward camera lift and reactive weapon inertia lag.
   */
  notifyJump(strength: number = 1.0) {
    const s = Math.min(1.5, Math.max(0.4, strength));
    this.jumpSpringVel = Math.min(14.0, Math.max(this.jumpSpringVel, 0) + 11.0 * s);
    this.jumpImpulseWasNotified = true;
  }

  /**
   * Notifies the kinetics solver of a ground or platform touchdown.
   * Produces a cushioned knee-flex camera compression and viewmodel shock absorption recovery.
   */
  notifyLand(impactVelocity: number = 1.0) {
    const s = Math.min(2.0, Math.max(0.4, impactVelocity));
    this.landSpringVel = Math.max(-26.0, Math.min(this.landSpringVel, 0) - 16.5 * s);
    this.landImpulseWasNotified = true;
  }

  /** Resets timers and transient spring values (e.g. on teleport or spawn). */
  reset() {
    this.stridePhase = 0;
    this.breathTimer = 0;
    this.movingWeight = 0;
    this.sprintWeight = 0;
    this.firingWeight = 0;
    this.reloadWeight = 0;
    this.slidingWeight = 0;
    this.airborneWeight = 0;
    this.fireRecoveryTimer = 0;
    this.strafeLeanRoll = 0;
    this.turnBankingRoll = 0;
    this.pitchInertia = 0;
    this.vmTurnBankRoll = 0;
    this.vmTurnBankYaw = 0;
    this.lastForwardVelocity = 0;
    this.jumpSpringPos = 0;
    this.jumpSpringVel = 0;
    this.landSpringPos = 0;
    this.landSpringVel = 0;
    this.wasAirborne = false;
    this.airborneTimer = 0;
    this.lastVerticalOffset = 0;
    this.jumpImpulseWasNotified = false;
    this.landImpulseWasNotified = false;
  }

  update(input: FirstPersonKineticsInput): FirstPersonKineticsOutput {
    const dtSec = Math.max(0.0001, Math.min(0.1, input.deltaTime / 1000));
    const intensity = Math.max(0, this.intensity);

    // 0. Airborne transition & Jump / Land impulse detection
    const isAirborne = !!input.isAirborne || (input.verticalOffset !== undefined && input.verticalOffset > 0.08);
    const vertOffset = input.verticalOffset !== undefined ? input.verticalOffset : (isAirborne ? 1.0 : 0.0);
    const vertDelta = vertOffset - this.lastVerticalOffset;

    if (!this.wasAirborne && isAirborne && !this.jumpImpulseWasNotified) {
      // Ground to airborne take-off transition
      this.notifyJump(1.0);
      this.airborneTimer = 0;
    } else if (this.wasAirborne && !isAirborne && !this.landImpulseWasNotified) {
      // Airborne to ground touchdown transition
      // Only cushion if we were genuinely airborne (> 50ms) to avoid single-step edge jitter
      if (this.airborneTimer > 0.05) {
        let impact = 1.0;
        if (input.verticalVelocity !== undefined && input.verticalVelocity < 0) {
          impact = Math.min(1.8, Math.max(0.6, Math.abs(input.verticalVelocity) / 260));
        } else {
          impact = Math.min(1.6, Math.max(0.7, 0.7 + this.airborneTimer * 1.4));
        }
        this.notifyLand(impact);
      }
      this.airborneTimer = 0;
    } else if (isAirborne) {
      this.airborneTimer += dtSec;
      // Mid-air upward surge detection (e.g. double jump or wall jump without explicit notify)
      if (input.verticalVelocity !== undefined && input.verticalVelocity > 250 && vertDelta > 2.0) {
        this.notifyJump(1.0);
      }
    } else {
      this.airborneTimer = 0;
    }

    this.wasAirborne = isAirborne;
    this.lastVerticalOffset = vertOffset;

    // Numerical integration for Jump & Landing springs (semi-implicit Euler)
    const springDt = Math.min(0.033, dtSec);
    // Jump spring: stiff, snappy upward pop and zero-overshoot critical decay (~200ms)
    const jumpK = 320;
    const jumpDamp = 34;
    this.jumpSpringVel += (-jumpK * this.jumpSpringPos - jumpDamp * this.jumpSpringVel) * springDt;
    this.jumpSpringPos += this.jumpSpringVel * springDt;

    // Landing spring: cushioned knee flex (~70ms to bottom) with smooth muscular recovery (~220ms)
    const landK = 260;
    const landDamp = 26;
    this.landSpringVel += (-landK * this.landSpringPos - landDamp * this.landSpringVel) * springDt;
    this.landSpringPos += this.landSpringVel * springDt;

    // Bridge-level jump and landing sequences are explicit. Consume their
    // one-frame marker after integration so the next genuine transition can
    // still be inferred when an explicit event is unavailable.
    this.jumpImpulseWasNotified = false;
    this.landImpulseWasNotified = false;

    // Rest zeroing to prevent subnormal floating point drift
    if (Math.abs(this.jumpSpringPos) < 1e-4 && Math.abs(this.jumpSpringVel) < 1e-3) {
      this.jumpSpringPos = 0;
      this.jumpSpringVel = 0;
    }
    if (Math.abs(this.landSpringPos) < 1e-4 && Math.abs(this.landSpringVel) < 1e-3) {
      this.landSpringPos = 0;
      this.landSpringVel = 0;
    }

    // 1. Smooth state blends
    const targetMoving = (input.isMoving && !isAirborne && !input.isSliding) ? 1.0 : 0.0;
    // Sprint intent and the gait sample are deliberately separate. The
    // renderer can briefly report zero velocity while a network correction or
    // collision is being presented; tying this to targetMoving made the
    // low-ready sprint pose drop even though the player was still holding
    // sprint. Keep the pose latched to the authoritative sprint state, while
    // targetMoving still controls whether stride bob advances.
    const targetSprint = (input.isSprinting && !isAirborne && !input.isSliding) ? 1.0 : 0.0;
    
    // Smooth transition rates (~12/s response time avoids any start/stop pop)
    this.movingWeight += (targetMoving - this.movingWeight) * (1 - Math.exp(-12 * dtSec));
    this.sprintWeight += (targetSprint - this.sprintWeight) * (1 - Math.exp(-9 * dtSec));

    // 1b. Combat state blends (Sprint-to-fire raise, Reload, Slide, Airborne)
    if (input.isShooting) {
      this.fireRecoveryTimer = Math.max(this.fireRecoveryTimer, 0.36);
    } else if (this.fireRecoveryTimer > 0) {
      this.fireRecoveryTimer = Math.max(0, this.fireRecoveryTimer - dtSec);
    }
    const targetFiring = (input.isShooting || this.fireRecoveryTimer > 0) ? 1.0 : 0.0;
    // Snap up instantly on trigger pull (~28/s, ~35ms) to immediately level with crosshairs;
    // lower back down smoothly into tactical carry (~8.5/s, ~120ms) when firing finishes.
    const firingRate = targetFiring > this.firingWeight ? 28 : 8.5;
    this.firingWeight += (targetFiring - this.firingWeight) * (1 - Math.exp(-firingRate * dtSec));

    const targetReload = input.isReloading ? 1.0 : 0.0;
    this.reloadWeight += (targetReload - this.reloadWeight) * (1 - Math.exp(-14 * dtSec));

    const targetSliding = input.isSliding ? 1.0 : 0.0;
    this.slidingWeight += (targetSliding - this.slidingWeight) * (1 - Math.exp(-12 * dtSec));

    const targetAirborne = isAirborne ? 1.0 : 0.0;
    this.airborneWeight += (targetAirborne - this.airborneWeight) * (1 - Math.exp(-10 * dtSec));

    // Viewmodel dynamic banking on horizontal mouse swivels
    const mouseX = input.mouseDeltaX || 0;
    const targetVmBankRoll = Math.max(-0.045, Math.min(0.045, -mouseX * 0.0016)) * (1.0 - input.adsProgress * 0.8) * intensity;
    const targetVmBankYaw = Math.max(-0.035, Math.min(0.035, -mouseX * 0.0012)) * (1.0 - input.adsProgress * 0.8) * intensity;
    this.vmTurnBankRoll += (targetVmBankRoll - this.vmTurnBankRoll) * (1 - Math.exp(-16 * dtSec));
    this.vmTurnBankYaw += (targetVmBankYaw - this.vmTurnBankYaw) * (1 - Math.exp(-16 * dtSec));

    // 2. Cadence & Phase Advancement
    const currentFrequency = this.walkFrequency + (this.sprintFrequency - this.walkFrequency) * this.sprintWeight;
    if (this.movingWeight > 0.01) {
      this.stridePhase = (this.stridePhase + dtSec * currentFrequency * Math.PI * 2) % (Math.PI * 2);
    }
    this.breathTimer = (this.breathTimer + dtSec * 1.6) % (Math.PI * 2);

    // 3. Aim Down Sights (ADS) Suppression
    // High-level shooters lock down eye/cheek stabilization during ADS
    const adsDamp = 1.0 - Math.min(1.0, Math.max(0.0, input.adsProgress)) * 0.88;

    // 4. Locomotion Gait Translation (Camera-Local Coordinates)
    // - Vertical: two cushioned dips per stride cycle (knee flex on foot strike)
    const walkVerticalAmp = 0.28;
    const sprintVerticalAmp = 0.42;
    const currentVerticalAmp = (walkVerticalAmp + (sprintVerticalAmp - walkVerticalAmp) * this.sprintWeight) * this.movingWeight * adsDamp * intensity;
    
    // Smooth harmonic cycloid: softer cushion on impact, rounded crest on swing
    const stepDrop = -Math.abs(Math.sin(this.stridePhase)) * currentVerticalAmp;
    const stepHarmonic = Math.sin(this.stridePhase * 2) * (currentVerticalAmp * 0.18);
    const localWalkY = stepDrop + stepHarmonic;

    // - Lateral: alternating weight transfer from foot to foot (half frequency of vertical)
    const walkLateralAmp = 0.18;
    const sprintLateralAmp = 0.26;
    const currentLateralAmp = (walkLateralAmp + (sprintLateralAmp - walkLateralAmp) * this.sprintWeight) * this.movingWeight * adsDamp * intensity;
    const localWalkX = Math.cos(this.stridePhase) * currentLateralAmp;

    // - Longitudinal: micro surge along sightline matching foot push-off
    const surgeAmp = (0.05 + 0.06 * this.sprintWeight) * this.movingWeight * adsDamp * intensity;
    const localWalkZ = Math.sin(this.stridePhase * 2) * surgeAmp;

    // 5. Idle Resting Breathing Motion
    const idleWeight = (1.0 - this.movingWeight) * (1.0 - this.airborneWeight * 0.5) * adsDamp * intensity;
    const breathY = Math.sin(this.breathTimer) * 0.12 * idleWeight;
    const breathX = Math.cos(this.breathTimer * 0.5) * 0.06 * idleWeight;
    const breathPitch = Math.sin(this.breathTimer) * 0.0016 * idleWeight;
    const breathRoll = Math.cos(this.breathTimer * 0.5) * 0.0012 * idleWeight;

    // Jump & Land vertical camera translation
    const jumpCamY = 0.75 * this.jumpSpringPos * adsDamp * intensity;
    const landCamY = 0.95 * this.landSpringPos * adsDamp * intensity;
    const airborneCamY = Math.sin(this.breathTimer * 1.4) * 0.05 * this.airborneWeight * adsDamp * intensity;

    // Combined local translation
    const totalLocalX = localWalkX + breathX;
    const totalLocalY = localWalkY + breathY + jumpCamY + landCamY + airborneCamY;
    const totalLocalZ = localWalkZ;

    // 6. Transform View-Local Translation to World Space
    // In Three.js standard FPS orientation:
    // Yaw 0 faces (0, 0, -1). Forward vector is (-sin(yaw), 0, -cos(yaw)).
    // Right vector is (cos(yaw), 0, -sin(yaw)).
    const forwardX = -Math.sin(input.yaw);
    const forwardZ = -Math.cos(input.yaw);
    const rightX = Math.cos(input.yaw);
    const rightZ = -Math.sin(input.yaw);

    const worldTransX = totalLocalX * rightX + totalLocalZ * forwardX;
    const worldTransY = totalLocalY;
    const worldTransZ = totalLocalX * rightZ + totalLocalZ * forwardZ;

    // 7. Rotational Head Motion (Roll, Pitch, Yaw)
    // A. Head Roll (Lateral Banking with weight plant)
    const walkRollAmp = 0.0065; // ~0.37 degrees
    const sprintRollAmp = 0.0105; // ~0.60 degrees
    const strideRoll = Math.cos(this.stridePhase) * (walkRollAmp + (sprintRollAmp - walkRollAmp) * this.sprintWeight) * this.movingWeight * adsDamp * intensity;

    // B. Turn Banking (Mouse yaw velocity counter-roll)
    const targetTurnBank = Math.max(-0.014, Math.min(0.014, -mouseX * 0.0007)) * (1.0 - input.adsProgress * 0.75) * intensity;
    this.turnBankingRoll += (targetTurnBank - this.turnBankingRoll) * (1 - Math.exp(-18 * dtSec));

    // C. Strafe Lean (Lateral velocity banking)
    const velX = input.playerVelocity.x;
    const velY = input.playerVelocity.y;
    // Project velocity onto camera Right vector
    const lateralVelocity = velX * rightX + velY * rightZ;
    const targetStrafeLean = Math.max(-0.018, Math.min(0.018, -lateralVelocity * 0.004)) * (1.0 - input.adsProgress * 0.85) * intensity;
    this.strafeLeanRoll += (targetStrafeLean - this.strafeLeanRoll) * (1 - Math.exp(-11 * dtSec));

    const totalRoll = strideRoll + this.turnBankingRoll + this.strafeLeanRoll + breathRoll;

    // D. Head Pitch (Footfall contact nod + athletic sprint forward lean + inertia + jump/land response)
    const walkPitchAmp = 0.0035; // ~0.20 degrees
    const sprintPitchAmp = 0.0055; // ~0.31 degrees
    const footfallNod = -Math.sin(this.stridePhase * 2) * (walkPitchAmp + (sprintPitchAmp - walkPitchAmp) * this.sprintWeight) * this.movingWeight * adsDamp * intensity;

    // Athletic sprint lean: torso and head angle forward ~0.9° into the run
    const sprintLean = this.sprintWeight * this.movingWeight * 0.016 * (1.0 - input.adsProgress * 0.95) * intensity;

    // Longitudinal acceleration / deceleration pitch inertia
    const forwardVelocity = velX * forwardX + velY * forwardZ;
    const forwardAcceleration = (forwardVelocity - this.lastForwardVelocity) / dtSec;
    this.lastForwardVelocity = forwardVelocity;
    const targetPitchInertia = Math.max(-0.015, Math.min(0.015, -forwardAcceleration * 0.00004)) * (1.0 - input.adsProgress * 0.9) * intensity;
    this.pitchInertia += (targetPitchInertia - this.pitchInertia) * (1 - Math.exp(-14 * dtSec));

    // Jump take-off & landing pitch reaction
    const jumpCamPitch = -0.022 * this.jumpSpringPos * adsDamp * intensity;
    const landCamPitch = -0.038 * this.landSpringPos * adsDamp * intensity;

    const totalPitch = footfallNod + sprintLean + this.pitchInertia + breathPitch + jumpCamPitch + landCamPitch;

    // E. Head Yaw (Micro shoulder torsion)
    const walkYawAmp = 0.0020; // ~0.11 degrees
    const sprintYawAmp = 0.0030; // ~0.17 degrees
    const totalYaw = -Math.sin(this.stridePhase) * (walkYawAmp + (sprintYawAmp - walkYawAmp) * this.sprintWeight) * this.movingWeight * adsDamp * intensity;

    // 8. Secondary Viewmodel Motion (Weapon Inertia, Jump, Land, and Stance)
    // Weapon lags camera phase by ~0.45 rad to convey secondary arm momentum.
    const vmPhase = this.stridePhase - 0.45;

    // Separate walking gait bob and sprint gait bob:
    // Walking features a classic two-beat high-ready cadence.
    // Sprinting suppresses frantic high-frequency bounce in favor of a
    // smooth, cushioned rhythmic stride lope that never jerks across the reticle.
    const walkWeight = (1.0 - this.sprintWeight) * this.movingWeight * adsDamp * intensity;
    const sprintWeight = this.sprintWeight * this.movingWeight * adsDamp * intensity;

    // Normal walking viewmodel bob (crisp, subtle 2-beat)
    const walkVmX = Math.cos(vmPhase) * 0.22 * walkWeight;
    const walkVmY = Math.sin(vmPhase * 2) * 0.28 * walkWeight;
    const walkVmRotX = Math.sin(vmPhase * 2) * 0.014 * walkWeight;
    const walkVmRotY = Math.cos(vmPhase) * 0.014 * walkWeight;

    // Tactical sprint cushioned motion:
    // When firing during sprint, stabilize bobbing so sights remain steady
    const effectiveFiring = Math.max(this.firingWeight, input.isShooting ? 1.0 : 0);
    const fireStabilizer = 1.0 - effectiveFiring * 0.92;
    const sprintVmX = Math.cos(vmPhase) * 0.14 * sprintWeight * (1.0 - effectiveFiring * 0.55);
    const sprintVmY = (Math.sin(vmPhase * 2) * 0.10 - Math.abs(Math.sin(vmPhase)) * 0.06) * sprintWeight * (1.0 - effectiveFiring * 0.55);
    const sprintVmZ = Math.sin(vmPhase * 2) * 0.08 * sprintWeight * (1.0 - effectiveFiring * 0.55);
    const sprintVmRotX = Math.sin(vmPhase * 2) * 0.014 * sprintWeight * (1.0 - effectiveFiring * 0.55);
    const sprintVmRotY = Math.cos(vmPhase) * 0.016 * sprintWeight * (1.0 - effectiveFiring * 0.55);
    const sprintVmRotZ = Math.cos(vmPhase) * 0.018 * sprintWeight * (1.0 - effectiveFiring * 0.55);

    // Tactical low-ready sprint carry is suppressed when:
    // 1. Aiming down sights (ADS)
    // 2. Firing / shooting or in fire follow-through recovery
    // 3. Performing a reload
    // 4. Combat sliding
    // 5. Airborne (jumping/falling)
    const suppression = Math.min(1.0, Math.max(
      Math.min(1.0, Math.max(0.0, input.adsProgress)),
      this.firingWeight,
      this.reloadWeight,
      this.slidingWeight,
      this.airborneWeight * 0.85
    ));
    // Keep the low-ready carry tied to sprint intent rather than the sampled
    // velocity. This prevents short presentation velocity dropouts from
    // cancelling the sprint animation mid-hold; the gait terms above remain
    // scaled by movingWeight, so a genuinely stationary player does not bob.
    const sprintStanceWeight = this.sprintWeight * (1.0 - suppression) * intensity;
    
    // Position offsets: lowered out of the central crosshair, tucked inward, and pulled toward torso (+Z)
    const vmSprintDropY = -0.92 * sprintStanceWeight;  // Drops weapon cleanly below sight picture
    const vmSprintTuckX = -0.22 * sprintStanceWeight;  // Tucks inward toward body centerline
    const vmSprintPullZ = 0.52 * sprintStanceWeight;   // Braced closer to chest (+Z is toward viewer)

    // Combat slide pose: gun stays level and ready to fire forward, slightly banked
    const slideTiltZ = -0.12 * this.slidingWeight * (1.0 - input.adsProgress) * intensity;
    const slideDropY = -0.22 * this.slidingWeight * (1.0 - input.adsProgress) * intensity;
    const slidePullZ = 0.25 * this.slidingWeight * (1.0 - input.adsProgress) * intensity;

    // Orientation offsets: decisively diagonally down-facing
    // Pitch: negative rotation tilts muzzle DOWN towards the deck (~ -27.5°)
    const vmSprintRotX = -0.48 * sprintStanceWeight;
    // Yaw: positive yaw angles barrel INWARD towards center/left (~ +13.7°)
    const vmSprintRotY = 0.24 * sprintStanceWeight;
    // Roll: negative roll cants top rail inward with natural forearm angle (~ -11.5°)
    const vmSprintRotZ = -0.20 * sprintStanceWeight;

    // Jump take-off: arm inertia lag (gun dips down slightly as player ascends, then catches up)
    const jumpVmY = -1.15 * this.jumpSpringPos * adsDamp * intensity;
    const jumpVmZ = 0.28 * this.jumpSpringPos * adsDamp * intensity;
    const jumpVmRotX = -0.038 * this.jumpSpringPos * fireStabilizer * adsDamp * intensity;

    // Landing impact: firearm downward momentum absorption & spring cushion
    const landVmY = 1.65 * this.landSpringPos * adsDamp * intensity;
    const landVmZ = -0.55 * this.landSpringPos * adsDamp * intensity;
    const landVmRotX = 0.075 * this.landSpringPos * fireStabilizer * adsDamp * intensity;
    const landVmRotZ = -0.020 * this.landSpringPos * adsDamp * intensity;

    // Airborne suspension float (subtle loosened posture during hang-time)
    const vmAirborneY = (-0.08 + Math.sin(this.breathTimer * 1.4 - 0.4) * 0.04) * this.airborneWeight * (1.0 - this.firingWeight * 0.8) * adsDamp * intensity;

    const totalVmX = walkVmX + sprintVmX + vmSprintTuckX;
    const totalVmY = walkVmY + sprintVmY + vmSprintDropY + slideDropY + jumpVmY + landVmY + vmAirborneY;
    const totalVmZ = (localWalkZ * 0.4) + sprintVmZ + vmSprintPullZ + slidePullZ + jumpVmZ + landVmZ;

    const totalVmRotX = walkVmRotX + sprintVmRotX + vmSprintRotX + jumpVmRotX + landVmRotX;
    const totalVmRotY = walkVmRotY + sprintVmRotY + vmSprintRotY + this.vmTurnBankYaw;
    const totalVmRotZ = sprintVmRotZ + vmSprintRotZ + slideTiltZ + this.vmTurnBankRoll + landVmRotZ;

    return {
      cameraTranslation: {
        x: worldTransX || 0,
        y: worldTransY || 0,
        z: worldTransZ || 0,
      },
      cameraRotation: {
        pitch: (Math.max(-0.06, Math.min(0.06, totalPitch))) || 0,
        yaw: (Math.max(-0.03, Math.min(0.03, totalYaw))) || 0,
        roll: (Math.max(-0.08, Math.min(0.08, totalRoll))) || 0,
      },
      viewmodelTranslation: {
        x: totalVmX || 0,
        y: totalVmY || 0,
        z: totalVmZ || 0,
      },
      viewmodelRotation: {
        pitch: totalVmRotX || 0,
        yaw: totalVmRotY || 0,
        roll: totalVmRotZ || 0,
      },
      stridePhase: this.stridePhase,
      movingWeight: this.movingWeight,
      sprintWeight: this.sprintWeight,
      firingWeight: this.firingWeight,
      airborneWeight: this.airborneWeight,
      jumpDisplacement: this.jumpSpringPos,
      landDisplacement: this.landSpringPos,
    };
  }
}
