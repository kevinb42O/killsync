import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { CoopStructureSnapshot } from '../multiplayer/CoopFieldEngineering';
import { CoopStructureVisuals } from './CoopStructureVisuals';

const damagedStructure: CoopStructureSnapshot = {
  id: 7,
  type: 'barricade',
  ownerId: 'host',
  ownerColor: '#22d3ee',
  x: 1_000,
  y: 1_000,
  angle: 0,
  health: 200,
  maxHealth: 520,
  state: 'active',
  createdAtMs: 0,
  expiresAtMs: 120_000,
};

describe('co-op structure lighting', () => {
  it('uses tone-mapped emissive materials without expanding the point-light budget', () => {
    const scene = new THREE.Scene();
    const visuals = new CoopStructureVisuals(scene);
    visuals.update([damagedStructure], 1_000);
    const rig = scene.getObjectByName('coop-structure:7')!;

    visuals.update([damagedStructure], 1_500);

    expect(rig.children.some(node => node instanceof THREE.PointLight)).toBe(false);
    rig.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) expect(material.toneMapped).toBe(true);
    });
    visuals.dispose();
  });

  it('renders the four-panel Bastion as one shared structure rig', () => {
    const scene = new THREE.Scene();
    const visuals = new CoopStructureVisuals(scene);
    visuals.update([{ ...damagedStructure, id: 8, type: 'hardlight_bastion', health: 1_050, maxHealth: 1_050, expiresAtMs: 14_000 }], 1_000);
    const rig = scene.getObjectByName('coop-structure:8')!;
    const fieldPanels: THREE.Mesh[] = [];
    rig.traverse(node => { if (node instanceof THREE.Mesh && node.userData.visualRole === 'bastion-field') fieldPanels.push(node); });
    expect(fieldPanels).toHaveLength(8);
    visuals.dispose();
  });
});
