import { emberRetreatTreeClearance } from '../world/FriendsRetreatSites';
import { lavaRiverTreeClearance } from '../world/FriendsLavaRiver';
import * as THREE from 'three';
import { FRIENDS_TREE_SIZES, FRIENDS_FOREST_DETAIL_END } from '../world/FriendsVegetationAppearance';
import { type FrontierTree, type FrontierSnapshot, frontierTrees } from '../multiplayer/FriendsFrontier';
import { FRONTIER_SIZE, terrainHash } from '../world/FriendsTerrain';
import { FRIENDS_ASSETS, fitFriendsAsset, loadFriendsAsset, type FriendsAssetId } from './FriendsAssets';
import type { TreeCanopy } from '../FriendsFlightSound';

export const FOREST_DETAIL_END = FRIENDS_FOREST_DETAIL_END;
const KINDS = ['pine', 'oak', 'autumnOak'] as const;
const ASSETS: FriendsAssetId[] = ['frontierPine', 'frontierBirch', 'frontierMaple'];
const SHADOW_RADIUS = 1400;
const TILE = 2048;
interface BarkLevels { sourceIndices: number; sourceVertices: number; levels: { error: number; indices: number[] }[] }
interface Part { geometry: THREE.BufferGeometry[]; errors: number[]; material: THREE.Material; transform: THREE.Matrix4; bark: boolean; buckets: (Bucket | undefined)[][] }
interface Species { parts: Part[]; bounds: THREE.Sphere; canopyHeight: number; canopy?: TreeCanopy }
interface Entry { tree: FrontierTree; species: number; sphere: THREE.Sphere; matrices: Float32Array[]; levels: number[]; supported: boolean }
interface Bucket { mesh: THREE.InstancedMesh; slots: string[]; entries: Entry[]; animatedSlots: number[]; fullUploadPending: boolean; part: number }
interface Tile { bounds: THREE.Sphere; entries: Entry[] }

/** Simplify only opaque wood, when its estimated error is smaller than a pixel.
 * Foliage, alpha masks, source vertices, UVs and normals never change with range. */
export function forestWoodLevel(errors: readonly number[], worldScale: number, pixelsPerWorldUnit: number, previous = 0) {
  let level = 0;
  for (let i = errors.length - 1; i > 0; i--) if (errors[i] * worldScale * pixelsPerWorldUnit <= .6) { level = i; break; }
  // Keep an existing coarser level through minor camera bob at its boundary.
  // Both thresholds remain below one pixel of estimated geometric error.
  if (previous > level && previous < errors.length && errors[previous] * worldScale * pixelsPerWorldUnit <= .75) return previous;
  return level;
}

/** One shared 3D canopy per species at every distance. CPU spatial culling packs
 * visible trees into a handful of instanced draws; no baked views or crossfade. */
export class FriendsForestLOD {
  private group = new THREE.Group();
  private worker?: Worker;
  private disposed = false;
  private species: Species[] = [];
  private multisampled = true;
  private natural?: FrontierTree[];
  private entries: Entry[] = [];
  private tiles: Tile[] = [];
  private buckets = new Map<string, Bucket>();
  private stateRevision = -1;
  private falls = new Map<string,{tree:FrontierTree;at:number;angle:number}>();
  private lastFallSerial = 0;
  private fallRoot = new THREE.Matrix4();
  private fallRotation = new THREE.Matrix4();
  private fallPart = new THREE.Matrix4();
  private fallAxis = new THREE.Vector3();
  private fallMatrix(entry:Entry, part:number, elapsed:number) {
    const fall=this.falls.get(entry.tree.id);
    if(!fall)return entry.matrices[part];
    const t=Math.max(0,Math.min(1,(elapsed-fall.at)/950)),tree=entry.tree;
    this.fallAxis.set(Math.cos(fall.angle),0,Math.sin(fall.angle));
    this.fallRoot.makeTranslation(tree.x,tree.z,tree.y);
    this.fallRotation.makeRotationAxis(this.fallAxis,1.3*t*t);
    this.fallRoot.multiply(this.fallRotation);
    this.fallRotation.makeScale(1-t**8,1-t**8,1-t**8);this.fallRoot.multiply(this.fallRotation);
    this.fallRotation.makeTranslation(-tree.x,-tree.z,-tree.y);this.fallRoot.multiply(this.fallRotation);
    this.fallPart.fromArray(entry.matrices[part]);this.fallRoot.multiply(this.fallPart);
    return this.fallRoot.elements;
  }
  private plantedStamp = '';
  private gradeStamp = '';
  private rebuilt = false;
  private frustum = new THREE.Frustum();
  private projection = new THREE.Matrix4();
  private viewport = new THREE.Vector2();
  private visibleCount = 0;
  private packedView = new THREE.Matrix4();
  private packedProjection = new THREE.Matrix4();
  private packedPosition = new THREE.Vector3();
  private packedHeight = 0;
  private packingValid = false;
  private speciesCounts: number[] = [];
  constructor(scene: THREE.Scene, private renderer: THREE.WebGLRenderer, private shade: (m: THREE.Material) => void = () => {}) {
    this.group.name = 'frontier-instanced-3d-forests'; scene.add(this.group);
    try {
      this.worker = new Worker(new URL('./frontierVegetation.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = e => { this.natural = e.data; this.worker?.terminate(); this.worker = undefined; this.rebuilt = true; };
      this.worker.onerror = () => { this.worker?.terminate(); this.worker = undefined; this.fallbackNatural(); };
      this.worker.postMessage(null);
    } catch {
      // Defer the CPU fallback until assets are ready. Worker failure must not remove forests.
    }
    void Promise.all(ASSETS.map(async id => {
      const [source, levels] = await Promise.all([loadFriendsAsset(id), fetch(`${import.meta.env.BASE_URL}models/friends/${FRIENDS_ASSETS[id]}_BarkLOD.json`).then(r => r.ok ? r.json() as Promise<BarkLevels> : undefined).catch(() => undefined)]);
      return { source, levels };
    })).then(models => {
      if (this.disposed) return;
      this.species = models.map(({ source, levels }, kind) => this.prepare(source, KINDS[kind], levels));
      if (!this.worker && !this.natural) this.fallbackNatural();
      this.rebuilt = true;
    }).catch(error => console.warn('Could not load frontier tree geometry', error));
  }
  private fallbackNatural() {
    if (this.disposed || this.natural) return;
    this.natural = [];
    for (let x = 0; x < Math.ceil(FRONTIER_SIZE / 512); x++) for (let y = 0; y < Math.ceil(FRONTIER_SIZE / 512); y++) this.natural.push(...frontierTrees(x, y));
    this.rebuilt = true;
  }
  private prepare(source: THREE.Group, kind: typeof KINDS[number], levels?: BarkLevels): Species {
    const fitted = fitFriendsAsset(source, FRIENDS_TREE_SIZES[kind], 0, 'contain');
    fitted.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(fitted);
    const bounds = box.getBoundingSphere(new THREE.Sphere());
    const leaves = new THREE.Box3();
    const parts: Part[] = [];
    fitted.traverse(child => {
      if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) return;
      const material = child.material as THREE.MeshStandardMaterial;
      const bark = material.name.endsWith('_Bark');
      if (!bark) leaves.union(new THREE.Box3().setFromObject(child));
      // Leaf cards retain the asset's alpha cutoff and depth writes. MSAA softens
      // coverage without transparency sorting or changing the canopy silhouette.
      material.alphaToCoverage = !bark && this.multisampled; material.transparent = false; material.depthWrite = true;
      if (bark) material.side = THREE.FrontSide;
      this.shade(material);
      const geometry = [child.geometry], errors = [0];
      if (bark && levels?.sourceIndices === child.geometry.index?.count && levels.sourceVertices === child.geometry.getAttribute('position').count) {
        const scale = child.matrixWorld.getMaxScaleOnAxis();
        for (const level of levels.levels) {
          if (!Number.isFinite(level.error) || level.error < 0 || level.indices.length % 3 || level.indices.some(i => i < 0 || i >= levels.sourceVertices)) continue;
          // Shared immutable attributes: only index topology differs for wood.
          const reduced = new THREE.BufferGeometry();
          for (const name of Object.keys(child.geometry.attributes)) reduced.setAttribute(name, child.geometry.getAttribute(name));
          reduced.setIndex(level.indices); reduced.boundingBox = child.geometry.boundingBox; reduced.boundingSphere = child.geometry.boundingSphere;
          geometry.push(reduced); errors.push(level.error * scale);
        }
      }
      parts.push({ geometry, errors, material, transform: child.matrixWorld.clone(), bark, buckets: geometry.map(() => []) });
    });
    const canopy = leaves.isEmpty() ? undefined : { bottom: leaves.min.y, top: leaves.max.y,
      radius: Math.max(Math.abs(leaves.min.x), Math.abs(leaves.max.x), Math.abs(leaves.min.z), Math.abs(leaves.max.z)) };
    return { parts, bounds, canopyHeight: box.max.y, canopy };
  }
  canopyHeight(tree: FrontierTree) { return this.species[KINDS.indexOf(tree.kind)]?.canopyHeight; }
  setMultisampled(enabled: boolean) {
    if (enabled === this.multisampled) return;
    this.multisampled = enabled;
    for (const species of this.species) for (const part of species.parts) {
      const coverage = !part.bark && enabled;
      if (part.material.alphaToCoverage !== coverage) {
        part.material.alphaToCoverage = coverage; part.material.needsUpdate = true;
      }
    }
  }
  canopy(tree: FrontierTree) { return this.species[KINDS.indexOf(tree.kind)]?.canopy; }
  private rebuild(trees: FrontierTree[], ground: (tree: FrontierTree) => boolean) {
    this.speciesCounts = this.species.map(() => 0);
    this.entries = trees.filter(tree => !lavaRiverTreeClearance(tree.x, tree.y) && !emberRetreatTreeClearance(tree.x, tree.y)).map(tree => {
      const species = KINDS.indexOf(tree.kind), model = this.species[species];
      this.speciesCounts[species]++;
      const root = new THREE.Matrix4().compose(new THREE.Vector3(tree.x, tree.z, tree.y), new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, terrainHash(tree.x, tree.y) * Math.PI * 2), new THREE.Vector3().setScalar(tree.scale));
      return { tree, species, sphere: model.bounds.clone().applyMatrix4(root), supported: ground(tree), levels: model.parts.map(() => 0), matrices: model.parts.map(p => new Float32Array(new THREE.Matrix4().multiplyMatrices(root, p.transform).elements)) };
    });
    const tiles = new Map<string, Entry[]>();
    for (const entry of this.entries) {
      const key = `${Math.floor(entry.tree.x / TILE)},${Math.floor(entry.tree.y / TILE)}`;
      const list = tiles.get(key) || []; list.push(entry); tiles.set(key, list);
    }
    this.tiles = [...tiles.values()].map(entries => {
      const box = new THREE.Box3();
      for (const entry of entries) box.union(entry.sphere.getBoundingBox(new THREE.Box3()));
      return { entries, bounds: box.getBoundingSphere(new THREE.Sphere()) };
    });
    this.rebuilt = false;
  }
  update(f: FrontierSnapshot, ground: (tree: FrontierTree) => boolean, dirty: ReadonlySet<string>, camera: THREE.PerspectiveCamera, enabled = true, elapsed = 0, fallEnabled=true) {
    this.group.visible = enabled;
    if (!this.species.length || !this.natural) return;
    if(!fallEnabled&&this.falls.size){this.falls.clear();this.packingValid=false;this.rebuilt=true;}
    for(const c of f.interaction?.contacts||[]){
      if(c.serial<=this.lastFallSerial)continue;this.lastFallSerial=c.serial;
      if(!fallEnabled||!c.broken||c.kind!=='wood'||!c.tree||elapsed-c.at>500||camera.position.distanceToSquared(new THREE.Vector3(c.tree.x,c.tree.z,c.tree.y))>900**2)continue;
      if(this.falls.size>=2)this.falls.delete(this.falls.keys().next().value!);
      this.falls.set(c.id,{tree:{...c.tree,id:c.id,kind:c.tree.kind as FrontierTree['kind']},at:elapsed,angle:c.serial*2.399});this.packingValid=false;
    }
    for(const [id,fall]of this.falls)if(elapsed-fall.at>=950){this.falls.delete(id);this.packingValid=false;if(id.startsWith('planted:'))this.rebuilt=true;}
    const stamp = f.planted.map(t => `${t.id}:${t.x}:${t.y}:${t.z}:${t.scale}:${t.kind}`).join(',');
    const rebuild = this.rebuilt || stamp !== this.plantedStamp;
    if (rebuild) { this.rebuild([...this.natural, ...f.planted,...[...this.falls.values()].filter(fall=>fall.tree.id.startsWith('planted:')&&!f.planted.some(t=>t.id===fall.tree.id)).map(fall=>fall.tree)], ground); this.plantedStamp = stamp; }
    const grades = JSON.stringify(f.terrain.grades || []), gradesChanged = grades !== this.gradeStamp;
    if (!rebuild && (gradesChanged || dirty.size)) for (const entry of this.entries) if (gradesChanged || dirty.has(`${Math.floor(entry.tree.x / 512)},${Math.floor(entry.tree.y / 512)}`)) entry.supported = ground(entry.tree);
    this.gradeStamp = grades;
    // Snapshot revision includes harvest/regrowth, while support is invalidated
    // only by terrain edits. No terrain sampling or matrix rebuilding per frame.
    const revisionChanged = f.revision !== this.stateRevision;
    if (revisionChanged || rebuild) {
      this.removed = new Set(f.harvested); this.stateRevision = f.revision;
    }
    if (!enabled) { this.visibleCount = 0; this.packingValid = false; return; }
    camera.updateMatrixWorld();
    const height = this.renderer.getDrawingBufferSize(this.viewport).y;
    // Reuse only identical inputs, without quantising motion or delaying LOD.
    // Light animation changes shading uniforms, not the forest's visibility.
    if (this.packingValid && !rebuild && !revisionChanged && !gradesChanged && !dirty.size
      && this.packedView.equals(camera.matrixWorldInverse) && this.packedProjection.equals(camera.projectionMatrix)
      && this.packedPosition.equals(camera.position) && this.packedHeight === height) {
      if(this.falls.size)for(const bucket of this.buckets.values()){
        const attribute = bucket.mesh.instanceMatrix;
        const matrices = attribute.array as Float32Array;
        for (const slot of bucket.animatedSlots) {
          matrices.set(this.fallMatrix(bucket.entries[slot],bucket.part,elapsed),slot*16);
          if (!bucket.fullUploadPending) attribute.addUpdateRange(slot*16,16);
        }
        if (bucket.animatedSlots.length) attribute.needsUpdate = true;
      }
      return;
    }
    this.visibleCount = 0;
    this.frustum.setFromProjectionMatrix(this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const pixels = height * .5 * camera.projectionMatrix.elements[5];
    const view = camera.matrixWorldInverse.elements;
    for (const bucket of this.buckets.values()) bucket.entries.length = 0;
    for (const tile of this.tiles) {
      const dx = tile.bounds.center.x - camera.position.x, dz = tile.bounds.center.z - camera.position.z;
      const nearTile = dx * dx + dz * dz < (tile.bounds.radius + SHADOW_RADIUS) ** 2;
      if (!nearTile && !this.frustum.intersectsSphere(tile.bounds)) continue;
      for (const entry of tile.entries) {
        if (!entry.supported || this.removed.has(entry.tree.id)&&!this.falls.has(entry.tree.id)) continue;
        const shadow = entry.sphere.center.distanceToSquared(camera.position) < (SHADOW_RADIUS + entry.sphere.radius) ** 2;
        // Nearby offscreen trees remain in the shadow pass when turning around.
        if (!shadow && !this.frustum.intersectsSphere(entry.sphere)) continue;
        this.visibleCount++;
        const p = entry.sphere.center;
        const depth = Math.max(1, -(view[2] * p.x + view[6] * p.y + view[10] * p.z + view[14]) - entry.sphere.radius);
        const model = this.species[entry.species];
        for (let index = 0; index < model.parts.length; index++) {
          const part = model.parts[index];
          const level = part.bark ? forestWoodLevel(part.errors, entry.tree.scale, pixels / depth, entry.levels[index]) : 0;
          entry.levels[index] = level;
          const shadowIndex = Number(shadow&&!this.falls.has(entry.tree.id));
          let bucket = part.buckets[level][shadowIndex];
          if (!bucket) {
            const key = `${entry.species}:${index}:${level}:${shadowIndex}`;
            const capacity = this.speciesCounts[entry.species];
            const mesh = new THREE.InstancedMesh(part.geometry[level], part.material, Math.max(1, capacity));
            mesh.name = `forest-${KINDS[entry.species]}-${part.bark ? 'wood' : 'leaves'}-${level}-${shadow ? 'shadow' : 'far'}`;
            mesh.frustumCulled = false; mesh.castShadow = Boolean(shadowIndex); mesh.receiveShadow = true; mesh.count = 0;
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(mesh);
            bucket = { mesh, slots: [], entries: [], animatedSlots: [], fullUploadPending: true, part: index }; this.buckets.set(key, bucket);
            const created = bucket;
            mesh.instanceMatrix.onUpload(() => { created.fullUploadPending = false; });
            part.buckets[level][shadowIndex] = bucket;
          }
          bucket.entries.push(entry);
        }
      }
    }
    const animating = this.falls.size > 0;
    for (const bucket of this.buckets.values()) {
      // A planted tree can enlarge a species after an instance buffer was made.
      if (bucket.entries.length > bucket.mesh.instanceMatrix.count) {
        // Release the old GPU instance buffer before replacing its capacity.
        // Geometry and materials belong to the species and remain shared.
        bucket.mesh.dispose();
        bucket.mesh.instanceMatrix = new THREE.InstancedBufferAttribute(new Float32Array(bucket.entries.length * 16), 16).setUsage(THREE.DynamicDrawUsage);
        bucket.fullUploadPending = true;
        bucket.mesh.instanceMatrix.onUpload(() => { bucket.fullUploadPending = false; });
        bucket.slots = [];
      }
      let changed = rebuild;
      const matrices = bucket.mesh.instanceMatrix.array as Float32Array;
      bucket.animatedSlots.length = 0;
      bucket.entries.forEach((entry, index) => {
        const falling = animating && this.falls.has(entry.tree.id);
        if (falling) bucket.animatedSlots.push(index);
        if (rebuild || bucket.slots[index] !== entry.tree.id || falling) {
          matrices.set(falling ? this.fallMatrix(entry,bucket.part,elapsed) : entry.matrices[bucket.part], index * 16);
          bucket.slots[index] = entry.tree.id;
          changed = true;
        }
      });
      bucket.mesh.count = bucket.entries.length; bucket.mesh.visible = bucket.mesh.count > 0;
      if (changed) {
        // A full upload also covers any animation edits pending from a previous
        // update, before this repack changed their slot positions.
        bucket.mesh.instanceMatrix.clearUpdateRanges();
        bucket.fullUploadPending = true;
        bucket.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    this.packedView.copy(camera.matrixWorldInverse); this.packedProjection.copy(camera.projectionMatrix);
    this.packedPosition.copy(camera.position); this.packedHeight = height; this.packingValid = true;
  }
  private removed = new Set<string>();
  get arrivalReady(){return this.species.length>0 && this.natural!==undefined;}
  get stats() {
    let draws = 0, triangles = 0;
    if (this.group.visible) for (const { mesh } of this.buckets.values()) if (mesh.visible) { draws++; triangles += mesh.count * (mesh.geometry.index?.count || mesh.geometry.getAttribute('position').count) / 3; }
    return { trees: this.visibleCount, fallingTrees:this.falls.size, draws, triangles };
  }
  dispose() {
    this.disposed = true; this.worker?.terminate();
    for (const { mesh } of this.buckets.values()) mesh.dispose();
    const textures = new Set<THREE.Texture>();
    for (const model of this.species) for (const part of model.parts) {
      part.geometry.forEach(g => g.dispose());
      for (const value of Object.values(part.material)) if (value instanceof THREE.Texture) textures.add(value);
      part.material.dispose();
    }
    textures.forEach(t => t.dispose()); this.group.removeFromParent();
  }
}
