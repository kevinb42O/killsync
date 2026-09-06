import * as THREE from 'three';

/**
 * Builds the visible mass beneath the co-op deck without adding a second top
 * surface. The shader floor is the sole horizontal surface near ground level;
 * this shell supplies only perimeter walls and a deeply separated underside.
 */
export function createFloatingPlatformShell(width: number, height: number, depth = 150): THREE.Group {
  const material = new THREE.MeshStandardMaterial({
    color: 0x07101c,
    emissive: 0x020711,
    emissiveIntensity: 0.35,
    metalness: 0.92,
    roughness: 0.5,
  });
  const shell = new THREE.Group();
  const wallThickness = 8;
  const wallCenterY = -depth / 2 - 1.5;
  const addPart = (geometry: THREE.BufferGeometry, x: number, y: number, z: number) => {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(x, y, z);
    shell.add(part);
  };

  addPart(new THREE.BoxGeometry(width, depth, wallThickness), width / 2, wallCenterY, wallThickness / 2);
  addPart(new THREE.BoxGeometry(width, depth, wallThickness), width / 2, wallCenterY, height - wallThickness / 2);
  addPart(new THREE.BoxGeometry(wallThickness, depth, height - wallThickness * 2), wallThickness / 2, wallCenterY, height / 2);
  addPart(new THREE.BoxGeometry(wallThickness, depth, height - wallThickness * 2), width - wallThickness / 2, wallCenterY, height / 2);
  addPart(new THREE.BoxGeometry(width, 6, height), width / 2, -depth - 4.5, height / 2);
  shell.name = 'coop-floating-platform-slab';
  return shell;
}
