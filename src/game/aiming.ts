export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export interface FireSolution {
  muzzlePosition3D: Vector3Like;
  aimPoint3D: Vector3Like;
  direction3D: Vector3Like;
  direction2D: { x: number; y: number };
  obstructed: boolean;
}

const EPSILON = 1e-6;

function normalize3(vector: Vector3Like): Vector3Like {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (length <= EPSILON) return { x: 0, y: 0, z: -1 };
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

/**
 * Keeps camera aiming intuitive while making the physical projectile originate
 * at the barrel. The camera selects the target; the muzzle supplies the origin.
 */
export function solveMuzzleConvergence(
  cameraPosition: Vector3Like,
  cameraForward: Vector3Like,
  muzzlePosition: Vector3Like,
  aimPoint?: Vector3Like,
  maxDistance: number = 2600,
  obstructed: boolean = false
): FireSolution {
  const normalizedCameraForward = normalize3(cameraForward);
  const target = aimPoint ?? {
    x: cameraPosition.x + normalizedCameraForward.x * maxDistance,
    y: cameraPosition.y + normalizedCameraForward.y * maxDistance,
    z: cameraPosition.z + normalizedCameraForward.z * maxDistance
  };

  const direction3D = normalize3({
    x: target.x - muzzlePosition.x,
    y: target.y - muzzlePosition.y,
    z: target.z - muzzlePosition.z
  });
  const horizontalLength = Math.hypot(direction3D.x, direction3D.z);
  const direction2D = horizontalLength > EPSILON
    ? { x: direction3D.x / horizontalLength, y: direction3D.z / horizontalLength }
    : { x: normalizedCameraForward.x, y: normalizedCameraForward.z };

  return {
    muzzlePosition3D: { ...muzzlePosition },
    aimPoint3D: { ...target },
    direction3D,
    direction2D,
    obstructed
  };
}
