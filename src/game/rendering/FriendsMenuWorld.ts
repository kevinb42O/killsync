import * as THREE from 'three';
import { FriendsFrontier } from '../multiplayer/FriendsFrontier';
import { FRONTIER_SIZE } from '../world/FriendsTerrain';
import { FriendsEnvironmentPreview } from '../world/FriendsEnvironmentPreview';
import { FriendsDayNightCycle, type FrontierCelestialLighting } from './FriendsDayNightCycle';
import { FriendsBlockHorizon } from './FriendsBlockHorizon';
import { FriendsClouds } from './FriendsClouds';
import { FriendsForestLOD } from './FriendsForestLOD';
import { frontierMaterial } from './FriendsFrontierVisuals';
import { createIslandOcean, createIslandRuinMaterials, FriendsIslandVisuals } from './FriendsIslandVisuals';
import { FRIENDS_MENU_SCENERY } from './FriendsMenuCamera';
import { FriendsScenicRailwayVisuals } from './FriendsScenicRailwayVisuals';
import { scenicRailway } from '../world/FriendsScenicRailway';

/** The playable island's exterior components, without caves, tools or simulation. */
export class FriendsMenuWorld {
  private atmosphere: FriendsDayNightCycle;
  private environment = new FriendsEnvironmentPreview();
  private horizon: FriendsBlockHorizon;
  private clouds: FriendsClouds;
  private forest: FriendsForestLOD;
  private island: FriendsIslandVisuals;
  private ocean = createIslandOcean();
  private group = new THREE.Group();
  private grid = Math.ceil(FRONTIER_SIZE / 512);
  private coverage = new THREE.DataTexture(new Uint8Array(this.grid ** 2), this.grid, this.grid, THREE.RedFormat);
  private ground = frontierMaterial('Ground037', '#abb68d', false, true);
  private masonry: THREE.MeshStandardMaterial[];
  private snapshot = new FriendsFrontier().snapshot();
  private dirty = new Set<string>();
  private railway?: FriendsScenicRailwayVisuals;
  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, private camera: THREE.PerspectiveCamera, lighting: FrontierCelestialLighting) {
    this.coverage.needsUpdate = true;
    this.atmosphere = new FriendsDayNightCycle(scene, renderer, camera, lighting);
    this.environment.change({ hour: 9, speed: FRIENDS_MENU_SCENERY.timeScale, windSpeed: FRIENDS_MENU_SCENERY.windSpeed });
    const stone = frontierMaterial('Rock030', '#ffffff', true);
    this.masonry = createIslandRuinMaterials(stone); stone.dispose();
    this.horizon = new FriendsBlockHorizon(this.ground, FRIENDS_MENU_SCENERY.center.x, FRIENDS_MENU_SCENERY.center.z);
    this.clouds = new FriendsClouds(renderer, { stableProjection: true });
    this.island = new FriendsIslandVisuals(this.masonry, this.coverage, this.grid);
    this.forest = new FriendsForestLOD(scene, renderer, material => this.clouds.shade(material));
    this.clouds.shade(this.ground);
    this.island.traverse(object => {
      if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material instanceof THREE.MeshStandardMaterial) this.clouds.shade(material);
      }
    });
    this.clouds.setAtmosphere(this.atmosphere);
    this.ocean.setAtmosphere(this.atmosphere);
    this.island.setAtmosphere(this.atmosphere);
    this.group.add(this.horizon, this.clouds, this.ocean, this.island); scene.add(this.group);
    const existing = new Set(scene.children);
    try {
      scenicRailway();
      this.railway = new FriendsScenicRailwayVisuals(scene);
      this.railway.group.traverse(object => {
        if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material instanceof THREE.MeshStandardMaterial) this.clouds.shade(material);
        }
      });
    } catch (error) {
      // A route can temporarily be invalid while it is being authored. Clean
      // partial construction without losing the rest of the live island.
      const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      for (const object of scene.children.filter(child => !existing.has(child))) {
        object.traverse(child => {
          if (child instanceof THREE.Mesh) {
            geometry.add(child.geometry);
            for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material);
            if (child instanceof THREE.InstancedMesh) child.dispose();
          }
        });
        object.removeFromParent();
      }
      geometry.forEach(value => value.dispose()); materials.forEach(value => value.dispose());
      console.warn('Friends menu railway is awaiting valid route data', error);
    }
  }
  get ready() { return this.horizon.children.length >= Math.ceil(FRONTIER_SIZE / 4096) ** 2; }
  get phase() { return this.atmosphere.state.phase; }
  get railwayReady() { return Boolean(this.railway); }
  update(elapsed: number) {
    this.atmosphere.update(this.environment.time(elapsed, elapsed), elapsed);
    this.horizon.update();
    this.clouds.update(this.environment.windSeconds, elapsed / 1000, this.camera);
    this.ocean.update(elapsed / 1000, this.camera.position);
    this.island.update(elapsed / 1000, this.camera.position);
    this.forest.update(this.snapshot, () => true, this.dirty, this.camera);
    this.railway?.update(this.camera, true, 85000);
  }
  dispose() {
    this.horizon.dispose(); this.clouds.release(); this.forest.dispose();
    this.railway?.dispose();
    this.island.dispose(); this.ocean.dispose(); this.atmosphere.dispose(); this.coverage.dispose();
    const textures = new Set<THREE.Texture>();
    for (const material of [this.ground, ...this.masonry]) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      if (material.userData.alpineRock instanceof THREE.Texture) textures.add(material.userData.alpineRock);
      material.dispose();
    }
    textures.forEach(texture => texture.dispose()); this.group.removeFromParent();
  }
}
