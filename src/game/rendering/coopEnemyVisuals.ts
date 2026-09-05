import * as THREE from 'three';
import type { Enemy } from '../../types';

type EnemyRig = {
  hull: THREE.Group;
  limbs: THREE.Group[];
  rotor: THREE.Mesh;
  armor: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
  health: THREE.Group;
  fill: THREE.Mesh;
  phase: number;
};

export function createCoopEnemyRig(enemy: Enemy): THREE.Group {
  const root = new THREE.Group();
  const hull = new THREE.Group();
  root.add(hull);
  const radius = enemy.radius;
  const armor = new THREE.MeshStandardMaterial({ color: enemy.type === 'phantom' ? '#cbd5db' : '#34454a', metalness: .7, roughness: .38, emissive: enemy.color, emissiveIntensity: .12 });
  const dark = new THREE.MeshStandardMaterial({ color: '#10191d', metalness: .65, roughness: .52 });
  const glow = new THREE.MeshBasicMaterial({ color: enemy.color, toneMapped: false });
  const addPart = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = hull) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  };
  const heavy = enemy.type === 'tank' || enemy.type === 'titan';
  addPart(new THREE.BoxGeometry(radius * 1.25, radius * (heavy ? 1 : .65), radius * 1.3), armor, 0, 0, 0);
  addPart(new THREE.BoxGeometry(radius * 1.02, radius * .16, radius * .08), glow, 0, radius * .13, radius * .69);
  addPart(new THREE.BoxGeometry(radius * .5, radius * .2, radius * .6), dark, 0, radius * .53, -.1 * radius);
  const limbs: THREE.Group[] = [];
  const legs = enemy.type === 'fast' || enemy.type === 'phantom' ? 4 : heavy ? 6 : 2;
  for (let index = 0; index < legs; index++) {
    const side = index % 2 ? 1 : -1;
    const limb = new THREE.Group();
    limb.position.set(side * radius * .65, -radius * .05, (Math.floor(index / 2) - (legs / 2 - 1) / 2) * radius * .7);
    hull.add(limb); limbs.push(limb);
    addPart(new THREE.BoxGeometry(radius * .38, radius * .65, radius * .36), armor, side * radius * .2, -radius * .22, 0, limb);
    addPart(new THREE.BoxGeometry(radius * .4, radius * .18, radius * .65), dark, side * radius * .3, -radius * .6, radius * .1, limb);
    addPart(new THREE.BoxGeometry(radius * .04, radius * .4, radius * .18), glow, side * radius * .41, -radius * .15, 0, limb);
  }
  if (enemy.type === 'ranged' || enemy.type === 'elite' || enemy.type === 'titan') {
    for (const side of [-1, 1]) {
      const cannon = addPart(new THREE.CylinderGeometry(radius * .12, radius * .18, radius * 1.25, 8), dark, side * radius * .58, radius * .55, radius * .25);
      cannon.rotation.x = Math.PI / 2;
      addPart(new THREE.TorusGeometry(radius * .15, radius * .04, 4, 10), glow, side * radius * .58, radius * .55, radius * .88);
    }
  }
  if (enemy.type === 'fast') {
    for (const side of [-1, 1]) {
      const fin = addPart(new THREE.ConeGeometry(radius * .3, radius * 1.5, 3), armor, side * radius * .85, radius * .25, -radius * .3);
      fin.rotation.x = -.6;
    }
  }
  const rotor = addPart(new THREE.TorusGeometry(radius * .65, radius * .045, 4, 24), glow, 0, radius * .6, 0);
  rotor.rotation.x = Math.PI / 2;
  rotor.visible = enemy.type === 'phantom' || enemy.type === 'elite' || enemy.type === 'titan';
  const health = new THREE.Group();
  const background = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2.4, 5), new THREE.MeshBasicMaterial({ color: '#10191d', depthWrite: false }));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2.3, 2.5), new THREE.MeshBasicMaterial({ color: enemy.color, depthWrite: false }));
  fill.position.z = .3; health.add(background, fill); health.position.y = radius * 1.5; root.add(health);
  root.userData.coopRig = { hull, limbs, rotor, armor, glow, health, fill, phase: Number(enemy.id.replace(/\D/g, '')) * 1.73 } satisfies EnemyRig;
  return root;
}

export function animateCoopEnemyRig(root: THREE.Group, enemy: Enemy, camera: THREE.Camera, now: number) {
  const rig = root.userData.coopRig as EnemyRig;
  const phase = now * .006 + rig.phase;
  const death = enemy.presentationDeathProgress || 0;
  const charging = enemy.presentationAttackCharge || 0;
  const hover = enemy.type === 'phantom' ? enemy.radius * .5 + Math.sin(phase) * 6 : 0;
  root.position.set(enemy.position.x, enemy.radius * .7 + hover, enemy.position.y);
  root.rotation.y = Math.PI / 2 - (enemy.presentationFacingAngle ?? 0);
  root.scale.setScalar(Math.max(.01, 1 - death * .9));
  rig.hull.rotation.z = death * 1.3;
  rig.hull.position.y = charging > 0 ? -charging * enemy.radius * .2 : Math.sin(phase * 2) * 1.2;
  rig.limbs.forEach((limb, index) => { limb.rotation.x = charging > 0 ? -.2 : Math.sin(phase + index * Math.PI) * .3; });
  rig.rotor.rotation.z = phase * .6;
  rig.rotor.scale.setScalar(1 + charging * .3);
  rig.armor.emissive.set(enemy.hitFlash && enemy.hitFlash > 0 ? '#ffffff' : enemy.color);
  rig.armor.emissiveIntensity = enemy.hitFlash && enemy.hitFlash > 0 ? 2 : .12 + charging * .7;
  rig.glow.color.set(charging > 0 ? '#fff4cf' : enemy.color);
  rig.health.visible = enemy.health > 0 && enemy.health < enemy.maxHealth;
  rig.health.quaternion.copy(root.quaternion).invert().multiply(camera.quaternion);
  const ratio = Math.max(0, Math.min(1, enemy.health / enemy.maxHealth));
  rig.fill.scale.x = ratio; rig.fill.position.x = -(1 - ratio) * enemy.radius * 1.15;
}