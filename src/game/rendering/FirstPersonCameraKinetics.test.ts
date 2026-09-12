import { describe, expect, it } from 'vitest';
import { FirstPersonCameraKinetics } from './FirstPersonCameraKinetics';

describe('FirstPersonCameraKinetics', () => {
  it('initializes with default frequencies and zero initial weights', () => {
    const kinetics = new FirstPersonCameraKinetics();
    expect(kinetics.walkFrequency).toBe(1.85);
    expect(kinetics.sprintFrequency).toBe(2.85);
    expect(kinetics.intensity).toBe(1.0);
  });

  it('produces gentle breathing motion when idle and stationary', () => {
    const kinetics = new FirstPersonCameraKinetics();
    const output = kinetics.update({
      deltaTime: 16.67,
      yaw: 0,
      pitch: 0,
      playerVelocity: { x: 0, y: 0 },
      isSprinting: false,
      isMoving: false,
      isAiming: false,
      adsProgress: 0,
    });

    expect(output.movingWeight).toBeLessThan(0.01);
    expect(output.sprintWeight).toBe(0);
    // Translation stays very small (breathing scale, < 0.2 units)
    expect(Math.abs(output.cameraTranslation.x)).toBeLessThan(0.2);
    expect(Math.abs(output.cameraTranslation.y)).toBeLessThan(0.2);
    expect(Math.abs(output.cameraRotation.pitch)).toBeLessThan(0.01);
    expect(Math.abs(output.cameraRotation.roll)).toBeLessThan(0.01);
  });

  it('advances stride phase smoothly when moving', () => {
    const kinetics = new FirstPersonCameraKinetics();
    let phase = 0;

    // Simulate 10 frames of walking
    for (let i = 0; i < 10; i++) {
      const output = kinetics.update({
        deltaTime: 16.67,
        yaw: 0,
        pitch: 0,
        playerVelocity: { x: 0, y: -150 },
        isSprinting: false,
        isMoving: true,
        isAiming: false,
        adsProgress: 0,
      });
      phase = output.stridePhase;
    }

    expect(phase).toBeGreaterThan(0);
  });

  it('speeds up cadence and increases amplitude when sprinting', () => {
    const walkKinetics = new FirstPersonCameraKinetics();
    const sprintKinetics = new FirstPersonCameraKinetics();

    // Warm up walking
    for (let i = 0; i < 30; i++) {
      walkKinetics.update({
        deltaTime: 16.67,
        yaw: 0,
        pitch: 0,
        playerVelocity: { x: 0, y: -150 },
        isSprinting: false,
        isMoving: true,
        isAiming: false,
        adsProgress: 0,
      });
    }

    // Warm up sprinting
    let sprintOutput = sprintKinetics.update({
      deltaTime: 16.67,
      yaw: 0,
      pitch: 0,
      playerVelocity: { x: 0, y: -220 },
      isSprinting: true,
      isMoving: true,
      isAiming: false,
      adsProgress: 0,
    });

    for (let i = 0; i < 30; i++) {
      sprintOutput = sprintKinetics.update({
        deltaTime: 16.67,
        yaw: 0,
        pitch: 0,
        playerVelocity: { x: 0, y: -220 },
        isSprinting: true,
        isMoving: true,
        isAiming: false,
        adsProgress: 0,
      });
    }

    expect(sprintOutput.sprintWeight).toBeGreaterThan(0.9);
    // Sprint induces athletic forward pitch lean (> 0.01 rad)
    expect(sprintOutput.cameraRotation.pitch).toBeGreaterThan(0.005);
    // Viewmodel lowers cleanly into tactical low-ready carry pose (< -0.6 units)
    expect(sprintOutput.viewmodelTranslation.y).toBeLessThan(-0.6);
    // Viewmodel points diagonally down: negative pitch (downwards) and positive yaw (inward)
    expect(sprintOutput.viewmodelRotation.pitch).toBeLessThan(-0.3);
    expect(sprintOutput.viewmodelRotation.yaw).toBeGreaterThan(0.15);
    expect(sprintOutput.viewmodelRotation.roll).toBeLessThan(-0.1);
  });

  it('keeps the sprint carry active through a temporary movement-sample dropout', () => {
    const kinetics = new FirstPersonCameraKinetics();

    // Establish a normal sprint pose first.
    for (let i = 0; i < 30; i++) {
      kinetics.update({
        deltaTime: 16.67, yaw: 0, pitch: 0, playerVelocity: { x: 0, y: -220 },
        isSprinting: true, isMoving: true, isAiming: false, adsProgress: 0,
      });
    }

    // Snapshot interpolation/collision correction can yield zero displayed
    // velocity for a few frames even though Shift remains held.
    let output;
    for (let i = 0; i < 15; i++) {
      output = kinetics.update({
        deltaTime: 16.67, yaw: 0, pitch: 0, playerVelocity: { x: 0, y: 0 },
        isSprinting: true, isMoving: false, isAiming: false, adsProgress: 0,
      });
    }

    expect(output!.sprintWeight).toBeGreaterThan(0.9);
    expect(output!.viewmodelTranslation.y).toBeLessThan(-0.75);
    expect(output!.viewmodelRotation.pitch).toBeLessThan(-0.35);
  });

  it('suppresses tactical sprint low-ready pose and restores sight alignment during ADS', () => {
    const kinetics = new FirstPersonCameraKinetics();
    // Warm up sprinting
    for (let i = 0; i < 30; i++) {
      kinetics.update({
        deltaTime: 16.67,
        yaw: 0,
        pitch: 0,
        playerVelocity: { x: 0, y: -220 },
        isSprinting: true,
        isMoving: true,
        isAiming: false,
        adsProgress: 0,
      });
    }
    // Aim down sights while continuing to sprint
    const adsOutput = kinetics.update({
      deltaTime: 16.67,
      yaw: 0,
      pitch: 0,
      playerVelocity: { x: 0, y: -220 },
      isSprinting: true,
      isMoving: true,
      isAiming: true,
      adsProgress: 1.0,
    });
    // ADS brings weapon back up and aligns sight straight ahead
    expect(Math.abs(adsOutput.viewmodelRotation.pitch)).toBeLessThan(0.05);
    expect(Math.abs(adsOutput.viewmodelRotation.yaw)).toBeLessThan(0.05);
    expect(Math.abs(adsOutput.viewmodelTranslation.y)).toBeLessThan(0.1);
  });

  it('cushions viewmodel vertical excursions during sprint to avoid erratic view obstruction', () => {
    const kinetics = new FirstPersonCameraKinetics();
    for (let i = 0; i < 30; i++) {
      kinetics.update({
        deltaTime: 16.67,
        yaw: 0,
        pitch: 0,
        playerVelocity: { x: 0, y: -220 },
        isSprinting: true,
        isMoving: true,
        isAiming: false,
        adsProgress: 0,
      });
    }

    // Sample across an entire stride cycle (~60 frames)
    let maxY = -Infinity;
    let minY = Infinity;
    for (let i = 0; i < 60; i++) {
      const out = kinetics.update({
        deltaTime: 16.67,
        yaw: 0,
        pitch: 0,
        playerVelocity: { x: 0, y: -220 },
        isSprinting: true,
        isMoving: true,
        isAiming: false,
        adsProgress: 0,
      });
      if (out.viewmodelTranslation.y > maxY) maxY = out.viewmodelTranslation.y;
      if (out.viewmodelTranslation.y < minY) minY = out.viewmodelTranslation.y;
    }

    // The gun stays lowered throughout the sprint stride cycle (never lurches above -0.5)
    expect(maxY).toBeLessThan(-0.5);
    // The peak-to-peak bounce amplitude is restrained (< 0.4 units, avoiding erratic visual jerkiness)
    expect(maxY - minY).toBeLessThan(0.4);
  });

  it('snaps viewmodel up to level high-ready when firing while sprinting and sustains follow-through', () => {
    const kinetics = new FirstPersonCameraKinetics();
    // Warm up sprinting
    for (let i = 0; i < 30; i++) {
      kinetics.update({
        deltaTime: 16.67,
        yaw: 0,
        pitch: 0,
        playerVelocity: { x: 0, y: -220 },
        isSprinting: true,
        isMoving: true,
        isAiming: false,
        adsProgress: 0,
        isShooting: false,
      });
    }

    // Step 1: In pure sprint, gun must be lowered and pointing diagonally down
    const pureSprint = kinetics.update({
      deltaTime: 16.67,
      yaw: 0,
      pitch: 0,
      playerVelocity: { x: 0, y: -220 },
      isSprinting: true,
      isMoving: true,
      isAiming: false,
      adsProgress: 0,
      isShooting: false,
    });
    expect(pureSprint.viewmodelRotation.pitch).toBeLessThan(-0.3);
    expect(pureSprint.viewmodelTranslation.y).toBeLessThan(-0.6);

    // Step 2: Trigger fire while still sprinting (holding Shift + W)
    kinetics.notifyFired();
    let firingOutput = kinetics.update({
      deltaTime: 16.67,
      yaw: 0,
      pitch: 0,
      playerVelocity: { x: 0, y: -220 },
      isSprinting: true,
      isMoving: true,
      isAiming: false,
      adsProgress: 0,
      isShooting: true,
    });
    for (let i = 0; i < 3; i++) {
      firingOutput = kinetics.update({
        deltaTime: 16.67,
        yaw: 0,
        pitch: 0,
        playerVelocity: { x: 0, y: -220 },
        isSprinting: true,
        isMoving: true,
        isAiming: false,
        adsProgress: 0,
        isShooting: true,
      });
    }

    // Weapon snaps up immediately to level forward high-ready pose
    expect(firingOutput.firingWeight).toBeGreaterThan(0.9);
    expect(firingOutput.viewmodelRotation.pitch).toBeGreaterThan(-0.1);
    expect(firingOutput.viewmodelTranslation.y).toBeGreaterThan(-0.25);

    // Step 3: Release fire button; within the 360ms follow-through window, gun must remain raised
    let followThroughOutput = firingOutput;
    for (let i = 0; i < 10; i++) {
      followThroughOutput = kinetics.update({
        deltaTime: 16.67, // ~167ms elapsed, well within 360ms window
        yaw: 0,
        pitch: 0,
        playerVelocity: { x: 0, y: -220 },
        isSprinting: true,
        isMoving: true,
        isAiming: false,
        adsProgress: 0,
        isShooting: false,
      });
    }
    expect(followThroughOutput.firingWeight).toBeGreaterThan(0.85);
    expect(followThroughOutput.viewmodelRotation.pitch).toBeGreaterThan(-0.12);

    // Step 4: After follow-through window expires while continuing to sprint, gun lowers back to low-ready
    let afterCooldownOutput = followThroughOutput;
    for (let i = 0; i < 30; i++) {
      afterCooldownOutput = kinetics.update({
        deltaTime: 16.67, // ~500ms further elapsed
        yaw: 0,
        pitch: 0,
        playerVelocity: { x: 0, y: -220 },
        isSprinting: true,
        isMoving: true,
        isAiming: false,
        adsProgress: 0,
        isShooting: false,
      });
    }
    expect(afterCooldownOutput.firingWeight).toBeLessThan(0.1);
    expect(afterCooldownOutput.viewmodelRotation.pitch).toBeLessThan(-0.3);
    expect(afterCooldownOutput.viewmodelTranslation.y).toBeLessThan(-0.6);
  });

  it('raises viewmodel during sprint reload so tactical reloads are clearly visible', () => {
    const kinetics = new FirstPersonCameraKinetics();
    for (let i = 0; i < 30; i++) {
      kinetics.update({
        deltaTime: 16.67,
        yaw: 0,
        pitch: 0,
        playerVelocity: { x: 0, y: -220 },
        isSprinting: true,
        isMoving: true,
        isAiming: false,
        adsProgress: 0,
      });
    }
    // Reloading while sprinting suppresses the low-ready downward carry
    let reloadOutput = kinetics.update({
      deltaTime: 16.67,
      yaw: 0,
      pitch: 0,
      playerVelocity: { x: 0, y: -220 },
      isSprinting: true,
      isMoving: true,
      isAiming: false,
      adsProgress: 0,
      isReloading: true,
    });
    for (let i = 0; i < 15; i++) {
      reloadOutput = kinetics.update({
        deltaTime: 16.67,
        yaw: 0,
        pitch: 0,
        playerVelocity: { x: 0, y: -220 },
        isSprinting: true,
        isMoving: true,
        isAiming: false,
        adsProgress: 0,
        isReloading: true,
      });
    }
    // Low-ready downward pitch is suppressed so hands and magazine well are visible
    expect(reloadOutput.viewmodelRotation.pitch).toBeGreaterThan(-0.1);
    expect(reloadOutput.viewmodelTranslation.y).toBeGreaterThan(-0.25);
  });

  it('projects view-local lateral sway along camera right vector correctly', () => {
    // When looking North (yaw = 0), Forward is (0, -1), Right is (1, 0)
    // Lateral sway should affect world X, not world Z.
    const kineticsNorth = new FirstPersonCameraKinetics();
    for (let i = 0; i < 20; i++) {
      kineticsNorth.update({
        deltaTime: 16.67,
        yaw: 0,
        pitch: 0,
        playerVelocity: { x: 0, y: -100 },
        isSprinting: false,
        isMoving: true,
        isAiming: false,
        adsProgress: 0,
      });
    }
    const outNorth = kineticsNorth.update({
      deltaTime: 16.67,
      yaw: 0,
      pitch: 0,
      playerVelocity: { x: 0, y: -100 },
      isSprinting: false,
      isMoving: true,
      isAiming: false,
      adsProgress: 0,
    });

    // When looking East (yaw = -Math.PI / 2), Right is (0, 1), Forward is (1, 0)
    // Lateral sway should affect world Z.
    const kineticsEast = new FirstPersonCameraKinetics();
    for (let i = 0; i < 20; i++) {
      kineticsEast.update({
        deltaTime: 16.67,
        yaw: -Math.PI / 2,
        pitch: 0,
        playerVelocity: { x: 100, y: 0 },
        isSprinting: false,
        isMoving: true,
        isAiming: false,
        adsProgress: 0,
      });
    }
    const outEast = kineticsEast.update({
      deltaTime: 16.67,
      yaw: -Math.PI / 2,
      pitch: 0,
      playerVelocity: { x: 100, y: 0 },
      isSprinting: false,
      isMoving: true,
      isAiming: false,
      adsProgress: 0,
    });

    expect(Number.isFinite(outNorth.cameraTranslation.x)).toBe(true);
    expect(Number.isFinite(outNorth.cameraTranslation.z)).toBe(true);
    expect(Number.isFinite(outEast.cameraTranslation.x)).toBe(true);
    expect(Number.isFinite(outEast.cameraTranslation.z)).toBe(true);
  });

  it('damps translation and rotation by ~88% when aiming down sights (ADS)', () => {
    const hipKinetics = new FirstPersonCameraKinetics();
    const adsKinetics = new FirstPersonCameraKinetics();

    let hipMaxY = 0;
    let adsMaxY = 0;

    for (let i = 0; i < 60; i++) {
      const hipOut = hipKinetics.update({
        deltaTime: 16.67,
        yaw: 0,
        pitch: 0,
        playerVelocity: { x: 0, y: -120 },
        isSprinting: false,
        isMoving: true,
        isAiming: false,
        adsProgress: 0,
      });
      const adsOut = adsKinetics.update({
        deltaTime: 16.67,
        yaw: 0,
        pitch: 0,
        playerVelocity: { x: 0, y: -120 },
        isSprinting: false,
        isMoving: true,
        isAiming: true,
        adsProgress: 1.0,
      });

      hipMaxY = Math.max(hipMaxY, Math.abs(hipOut.cameraTranslation.y));
      adsMaxY = Math.max(adsMaxY, Math.abs(adsOut.cameraTranslation.y));
    }

    expect(adsMaxY).toBeLessThan(hipMaxY * 0.2);
  });

  it('never exceeds safety clamps or generates NaN/Infinity values', () => {
    const kinetics = new FirstPersonCameraKinetics();

    // Extreme delta time and extreme velocity stress test
    for (let i = 0; i < 50; i++) {
      const out = kinetics.update({
        deltaTime: Math.random() * 200,
        yaw: (Math.random() - 0.5) * 10,
        pitch: (Math.random() - 0.5) * 4,
        playerVelocity: { x: (Math.random() - 0.5) * 20000, y: (Math.random() - 0.5) * 20000 },
        isSprinting: Math.random() > 0.5,
        isMoving: true,
        isAiming: Math.random() > 0.5,
        adsProgress: Math.random(),
        mouseDeltaX: (Math.random() - 0.5) * 1000,
        mouseDeltaY: (Math.random() - 0.5) * 1000,
      });

      expect(Number.isFinite(out.cameraTranslation.x)).toBe(true);
      expect(Number.isFinite(out.cameraTranslation.y)).toBe(true);
      expect(Number.isFinite(out.cameraTranslation.z)).toBe(true);
      expect(Number.isFinite(out.cameraRotation.pitch)).toBe(true);
      expect(Number.isFinite(out.cameraRotation.yaw)).toBe(true);
      expect(Number.isFinite(out.cameraRotation.roll)).toBe(true);

      // Hard clamp bounds
      expect(Math.abs(out.cameraRotation.pitch)).toBeLessThanOrEqual(0.06);
      expect(Math.abs(out.cameraRotation.yaw)).toBeLessThanOrEqual(0.03);
      expect(Math.abs(out.cameraRotation.roll)).toBeLessThanOrEqual(0.08);
    }
  });

  it('respects zero intensity to disable all kinetics cleanly', () => {
    const kinetics = new FirstPersonCameraKinetics({ intensity: 0 });
    const out = kinetics.update({
      deltaTime: 16.67,
      yaw: 0,
      pitch: 0,
      playerVelocity: { x: 50, y: -100 },
      isSprinting: true,
      isMoving: true,
      isAiming: false,
      adsProgress: 0,
    });

    expect(out.cameraTranslation.x).toBe(0);
    expect(out.cameraTranslation.y).toBe(0);
    expect(out.cameraTranslation.z).toBe(0);
    expect(out.cameraRotation.pitch).toBe(0);
    expect(out.cameraRotation.yaw).toBe(0);
    expect(out.cameraRotation.roll).toBe(0);
  });

  it('produces subtle upward camera lift and viewmodel inertia lag upon jumping', () => {
    const kinetics = new FirstPersonCameraKinetics();
    // Warm up idle on ground
    kinetics.update({
      deltaTime: 16.67,
      yaw: 0,
      pitch: 0,
      playerVelocity: { x: 0, y: 0 },
      isSprinting: false,
      isMoving: false,
      isAiming: false,
      adsProgress: 0,
      isAirborne: false,
    });

    // Jump take-off (airborne transition)
    let jumpMaxCamY = -Infinity;
    let jumpMinVmY = Infinity;
    for (let i = 0; i < 6; i++) {
      const out = kinetics.update({
        deltaTime: 16.67,
        yaw: 0,
        pitch: 0,
        playerVelocity: { x: 0, y: 0 },
        isSprinting: false,
        isMoving: false,
        isAiming: false,
        adsProgress: 0,
        isAirborne: true,
        verticalOffset: 12.0,
      });
      if (out.cameraTranslation.y > jumpMaxCamY) jumpMaxCamY = out.cameraTranslation.y;
      if (out.viewmodelTranslation.y < jumpMinVmY) jumpMinVmY = out.viewmodelTranslation.y;
    }

    // Camera lifts up subtly (~0.05 - 0.12 units)
    expect(jumpMaxCamY).toBeGreaterThan(0.04);
    // Weapon lags downward under gravitational inertia (~ -0.08 to -0.25 units)
    expect(jumpMinVmY).toBeLessThan(-0.06);

    // After 250ms in the air, the initial launch impulse settles cleanly
    let settledOut = kinetics.update({
      deltaTime: 16.67,
      yaw: 0,
      pitch: 0,
      playerVelocity: { x: 0, y: 0 },
      isSprinting: false,
      isMoving: false,
      isAiming: false,
      adsProgress: 0,
      isAirborne: true,
      verticalOffset: 15.0,
    });
    for (let i = 0; i < 15; i++) {
      settledOut = kinetics.update({
        deltaTime: 16.67,
        yaw: 0,
        pitch: 0,
        playerVelocity: { x: 0, y: 0 },
        isSprinting: false,
        isMoving: false,
        isAiming: false,
        adsProgress: 0,
        isAirborne: true,
        verticalOffset: 15.0,
      });
    }
    expect(Math.abs(settledOut.jumpDisplacement)).toBeLessThan(0.02);
  });

  it('does not double a bridge-signalled jump impulse when altitude changes in the same frame', () => {
    const inferred = new FirstPersonCameraKinetics();
    const explicit = new FirstPersonCameraKinetics();
    const groundInput = { deltaTime: 16.67, yaw: 0, pitch: 0, playerVelocity: { x: 0, y: 0 }, isSprinting: false, isMoving: false, isAiming: false, adsProgress: 0, isAirborne: false, verticalOffset: 0 };
    const airInput = { ...groundInput, isAirborne: true, verticalOffset: 12 };

    inferred.update(groundInput);
    explicit.update(groundInput);
    explicit.notifyJump(1);

    const inferredOut = inferred.update(airInput);
    const explicitOut = explicit.update(airInput);

    expect(explicitOut.jumpDisplacement).toBeCloseTo(inferredOut.jumpDisplacement, 5);
  });

  it('produces cushioned knee-flex compression and viewmodel shock absorption on landing with smooth spring recovery', () => {
    const kinetics = new FirstPersonCameraKinetics();
    // Simulate jump and hang time (~300ms)
    for (let i = 0; i < 18; i++) {
      kinetics.update({
        deltaTime: 16.67,
        yaw: 0,
        pitch: 0,
        playerVelocity: { x: 0, y: 0 },
        isSprinting: false,
        isMoving: false,
        isAiming: false,
        adsProgress: 0,
        isAirborne: true,
        verticalOffset: 20.0,
      });
    }

    // Touchdown (transition from airborne to grounded)
    let minCamY = Infinity;
    let minVmY = Infinity;
    let maxPitch = -Infinity;

    for (let i = 0; i < 8; i++) {
      const out = kinetics.update({
        deltaTime: 16.67,
        yaw: 0,
        pitch: 0,
        playerVelocity: { x: 0, y: 0 },
        isSprinting: false,
        isMoving: false,
        isAiming: false,
        adsProgress: 0,
        isAirborne: false,
        verticalOffset: 0.0,
        verticalVelocity: -350,
      });

      if (out.cameraTranslation.y < minCamY) minCamY = out.cameraTranslation.y;
      if (out.viewmodelTranslation.y < minVmY) minVmY = out.viewmodelTranslation.y;
      if (out.cameraRotation.pitch > maxPitch) maxPitch = out.cameraRotation.pitch;
    }

    // Camera compresses downward (knee-flex cushion, < -0.12 units)
    expect(minCamY).toBeLessThan(-0.12);
    // Camera nods forward slightly on touchdown (+pitch > 0.004 rad / ~0.25°)
    expect(maxPitch).toBeGreaterThan(0.004);
    // Viewmodel drops with momentum absorption (< -0.20 units)
    expect(minVmY).toBeLessThan(-0.20);

    // Over next ~240ms, spring cushions and smoothly recovers back to resting ready pose
    let finalOut = kinetics.update({
      deltaTime: 16.67,
      yaw: 0,
      pitch: 0,
      playerVelocity: { x: 0, y: 0 },
      isSprinting: false,
      isMoving: false,
      isAiming: false,
      adsProgress: 0,
      isAirborne: false,
      verticalOffset: 0.0,
    });
    for (let i = 0; i < 20; i++) {
      finalOut = kinetics.update({
        deltaTime: 16.67,
        yaw: 0,
        pitch: 0,
        playerVelocity: { x: 0, y: 0 },
        isSprinting: false,
        isMoving: false,
        isAiming: false,
        adsProgress: 0,
        isAirborne: false,
        verticalOffset: 0.0,
      });
    }

    expect(Math.abs(finalOut.landDisplacement)).toBeLessThan(0.01);
    expect(Math.abs(finalOut.cameraTranslation.y)).toBeLessThan(0.15);
  });

  it('dampens jump and landing motion by ~88% when aiming down sights (ADS)', () => {
    const hipKinetics = new FirstPersonCameraKinetics();
    const adsKinetics = new FirstPersonCameraKinetics();

    // Trigger explicit landing impact on both
    hipKinetics.notifyLand(1.0);
    adsKinetics.notifyLand(1.0);

    let hipMinCamY = Infinity;
    let adsMinCamY = Infinity;

    for (let i = 0; i < 6; i++) {
      const hipOut = hipKinetics.update({
        deltaTime: 16.67,
        yaw: 0,
        pitch: 0,
        playerVelocity: { x: 0, y: 0 },
        isSprinting: false,
        isMoving: false,
        isAiming: false,
        adsProgress: 0,
        isAirborne: false,
      });
      const adsOut = adsKinetics.update({
        deltaTime: 16.67,
        yaw: 0,
        pitch: 0,
        playerVelocity: { x: 0, y: 0 },
        isSprinting: false,
        isMoving: false,
        isAiming: true,
        adsProgress: 1.0,
        isAirborne: false,
      });

      if (hipOut.cameraTranslation.y < hipMinCamY) hipMinCamY = hipOut.cameraTranslation.y;
      if (adsOut.cameraTranslation.y < adsMinCamY) adsMinCamY = adsOut.cameraTranslation.y;
    }

    // ADS cushions landing shock by ~88%, keeping reticle rock steady
    expect(Math.abs(adsMinCamY)).toBeLessThan(Math.abs(hipMinCamY) * 0.2);
  });

  it('stabilizes muzzle angular pitch when shooting during landing', () => {
    const idleLandingKinetics = new FirstPersonCameraKinetics();
    const firingLandingKinetics = new FirstPersonCameraKinetics();

    idleLandingKinetics.notifyLand(1.2);
    firingLandingKinetics.notifyLand(1.2);

    let idleMuzzleMax = 0;
    let firingMuzzleMax = 0;

    for (let i = 0; i < 6; i++) {
      const idleOut = idleLandingKinetics.update({
        deltaTime: 16.67,
        yaw: 0,
        pitch: 0,
        playerVelocity: { x: 0, y: 0 },
        isSprinting: false,
        isMoving: false,
        isAiming: false,
        adsProgress: 0,
        isShooting: false,
      });
      const firingOut = firingLandingKinetics.update({
        deltaTime: 16.67,
        yaw: 0,
        pitch: 0,
        playerVelocity: { x: 0, y: 0 },
        isSprinting: false,
        isMoving: false,
        isAiming: false,
        adsProgress: 0,
        isShooting: true,
      });

      idleMuzzleMax = Math.max(idleMuzzleMax, Math.abs(idleOut.viewmodelRotation.pitch));
      firingMuzzleMax = Math.max(firingMuzzleMax, Math.abs(firingOut.viewmodelRotation.pitch));
    }

    // Firing suppresses muzzle angular kick so bullets continue to land on the reticle
    expect(firingMuzzleMax).toBeLessThan(idleMuzzleMax * 0.3);
  });
});
