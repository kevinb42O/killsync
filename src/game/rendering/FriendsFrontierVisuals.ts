import { emberRetreatTreeClearance } from '../world/FriendsRetreatSites';
import { lavaRiverTreeClearance } from '../world/FriendsLavaRiver';
import { FriendsFloodWaterVisuals } from './FriendsFloodWaterVisuals';
import { FriendsRetreatVisuals } from './FriendsRetreatVisuals';
import type { RetreatState } from '../world/FriendsRetreatSites';
import { FriendsTerrainEditFeedback } from './FriendsTerrainEditFeedback';
import type { ToolAction } from '../multiplayer/FriendsToolActions';
import { FriendsToolViewmodels } from './FriendsToolViewmodels';
import { FriendsDayNightCycle, type FrontierCelestialLighting } from './FriendsDayNightCycle';
import { FriendsEnvironmentPreview, type FriendsEnvironmentChange, type FriendsEnvironmentSnapshot } from '../world/FriendsEnvironmentPreview';
import { islandBiomeTexture, ISLAND_BIOME_GLSL } from './FriendsIslandBiomes';
import { createIslandOcean, FriendsIslandOcean, createIslandRuinMaterials, FriendsIslandVisuals } from './FriendsIslandVisuals';
import { applyFriendsCaveLighting } from './FriendsCaveLighting';
import { FriendsFlashlight, FRIENDS_FLASHLIGHT_RANGE } from './FriendsFlashlight';
import { FRIENDS_NIGHT_VISION_RANGE } from './FriendsVision';
import { FriendsTreasureVisuals } from './FriendsTreasureVisuals';
import { FriendsCaveVisuals } from './FriendsCaveVisuals';
import * as THREE from 'three';
import { FriendsTerrain, FRONTIER_SIZE, FRONTIER_SITES, frontierSiteMarkerPose, terrainHash } from '../world/FriendsTerrain';
import { meshTerrainChunk, type TerrainMeshData } from '../world/FriendsTerrainMesh';
import { frontierTrees, type FrontierSnapshot, type FrontierTool, type FrontierTree } from '../multiplayer/FriendsFrontier';
import { addFriendsAssetInstances } from './FriendsAssets';
import { FOREST_DETAIL_END, FriendsForestLOD } from './FriendsForestLOD';
import { FriendsBlockHorizon } from './FriendsBlockHorizon';
import { FriendsBlockSurface } from './FriendsBlockSurface';
import { islandArchRange } from '../world/FriendsIsland';
import { VOLUME_RETAIN, distanceToTerrainTile, volumeChunksAround } from './FriendsTerrainStreaming';
import { FriendsClouds } from './FriendsClouds';
import { FriendsBirds } from './FriendsBirds';
import { FriendsCampfire } from './FriendsCampfire';
import type { CampfireSnapshot } from '../multiplayer/FriendsCampfireSimulation';
import { configureTerrainCoverage } from './FriendsTerrainCoverage';
import { FRIENDS_TERRAIN_SURFACES } from '../world/FriendsTerrainAppearance';

const GROVE_CELL_OFFSETS = Array.from({ length: 121 }, (_, i) => [i % 11 - 5, Math.floor(i / 11) - 5] as const)
  .sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));

export function frontierMaterial(asset: 'Ground037' | 'Rock030' | 'WoodFloor051', color = '#ffffff', worldProjected = false, alpine = false) {
  const loader = new THREE.TextureLoader(), base = `${import.meta.env.BASE_URL}textures/frontier/${asset}_1K-JPG_`;
  const texture = (name: string, srgb = false) => { const t = loader.load(base + name + '.jpg'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const material = new THREE.MeshStandardMaterial({ color, map: texture('Color', true), normalMap: texture('NormalGL'), normalScale: new THREE.Vector2(.28, .28), roughnessMap: texture('Roughness'), roughness: .95, vertexColors: true });
  const alpineRock=alpine?loader.load(`${import.meta.env.BASE_URL}textures/frontier/Rock030_1K-JPG_Color.jpg`):undefined;
  if(alpineRock){alpineRock.wrapS=alpineRock.wrapT=THREE.RepeatWrapping;alpineRock.anisotropy=4;alpineRock.colorSpace=THREE.SRGBColorSpace;material.userData.alpineRock=alpineRock;}
  material.onBeforeCompile = shader => {
    if(alpineRock){shader.uniforms.alpineRock={value:alpineRock};shader.uniforms.islandBiomes={value:islandBiomeTexture()};}
    const projection = `vec4 frontierPosition=vec4(position,1.); vec3 frontierNormal=normal;
      #ifdef USE_INSTANCING
      frontierPosition=instanceMatrix*frontierPosition; frontierNormal=mat3(instanceMatrix)*frontierNormal;
      #endif
      frontierWorld=(modelMatrix*frontierPosition).xyz;frontierFace=normalize(mat3(modelMatrix)*frontierNormal);`;
    shader.vertexShader='varying vec3 frontierWorld;varying vec3 frontierFace;\n'+shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + projection);
    if (worldProjected) shader.vertexShader = shader.vertexShader.replace(projection, projection + `
      vec3 face=abs(frontierNormal);
      vec2 surfaceUv=(face.x>face.y && face.x>face.z ? frontierWorld.zy : face.y>face.z ? frontierWorld.xz : frontierWorld.xy)/160.;
      #ifdef USE_MAP
      vMapUv=surfaceUv;
      #endif
      #ifdef USE_NORMALMAP
      vNormalMapUv=surfaceUv;
      #endif
      #ifdef USE_ROUGHNESSMAP
      vRoughnessMapUv=surfaceUv;
      #endif`);
    shader.fragmentShader=(alpine ? ISLAND_BIOME_GLSL.slice(0,ISLAND_BIOME_GLSL.indexOf('  vec4 islandClimate')) : '')+'varying vec3 frontierWorld;varying vec3 frontierFace;'+(alpine?'uniform sampler2D alpineRock;uniform sampler2D islandBiomes;\n':'\n')+shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
      vec4 primary=texture2D(map,vMapUv);vec4 secondary=texture2D(map,mat2(.8,-.6,.6,.8)*vMapUv*1.73+vec2(.43,.27));
      diffuseColor*=vec4(mix(primary.rgb,secondary.rgb,.45),primary.a);
      #endif`).replace('#include <color_fragment>',`#include <color_fragment>
      diffuseColor.rgb*=.92+.08*sin(frontierWorld.x*.0011+sin(frontierWorld.z*.0007)*2.)*sin(frontierWorld.z*.0015);
      `).replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n'+(alpine ? ISLAND_BIOME_GLSL.slice(ISLAND_BIOME_GLSL.indexOf('  vec4 islandClimate')) : ''));
  };
  material.customProgramCacheKey = () => `${worldProjected ? 'frontier-world-projected' : 'frontier-uv'}-${alpine?'island-biomes-v4':'v1'}`;
  return material;
}
function disposeGroup(group: THREE.Group) {
  group.userData.disposed = true;
  const geo = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  group.traverse(o => { if (o instanceof THREE.Mesh) { if(!o.geometry.userData.friendsShared)geo.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) { materials.add(m); for (const value of Object.values(m)) if (value instanceof THREE.Texture&&!m.userData.friendsSharedTextures) textures.add(value); } if (o instanceof THREE.InstancedMesh) o.dispose(); } });
  geo.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); group.removeFromParent();
}
export class FriendsFrontierVisuals {
  readonly retreats:FriendsRetreatVisuals;
  readonly terrain = new FriendsTerrain();
  private group = new THREE.Group();
  private chunks = new Map<string, THREE.Mesh>();
  private groves = new Map<string, THREE.Group>();
  private dirty = new Set<string>();
  private previousEdits = new Map<string, number>();
  private editQueuedAt = new Map<string,number>();
  private meshLatencies:number[]=[];
  private editFeedback:FriendsTerrainEditFeedback;
  private editedTiles = new Set<string>();
  private desired = new Set<string>();
  private pending = new Set<string>();
  private completed:{cx:number;cy:number;epoch:number;mesh:TerrainMeshData}[]=[];
  private volumeBytes=new Map<string,number>();
  private volumePlanStamp='';
  private materials = Object.values(FRIENDS_TERRAIN_SURFACES).map(surface => frontierMaterial(surface.asset, surface.color, false, true));
  private revision = -1;
  private gradeStamp='[]';
  private vegetationStamp = '';
  private vegetationDirty = new Set<string>();
  private knownPlanted = new Set<string>();
  private floodWater:FriendsFloodWaterVisuals;
  private coast: FriendsIslandOcean;
  private island: FriendsIslandVisuals;
  private epoch = 0;
  private worker?: Worker;
  private farMaterial = frontierMaterial('Ground037', '#abb68d',false,true);
  private fineGrid = Math.ceil(FRONTIER_SIZE / 512);
  private fineData = new Uint8Array(this.fineGrid * this.fineGrid);
  private fineCoverage = new THREE.DataTexture(this.fineData,this.fineGrid,this.fineGrid,THREE.RedFormat);
  private blockData=new Uint8Array(this.fineGrid*this.fineGrid);
  private blockCoverage=new THREE.DataTexture(this.blockData,this.fineGrid,this.fineGrid,THREE.RedFormat);
  private blockAltitude={value:1};
  private blockMaterial:THREE.MeshStandardMaterial;
  private surface:FriendsBlockSurface;
  private forestLOD: FriendsForestLOD;
  private far: FriendsBlockHorizon;
  private clouds: FriendsClouds;
  private cave: FriendsCaveVisuals;
  private flashlight: FriendsFlashlight;
  private treasures = new FriendsTreasureVisuals();
  private tools: FriendsToolViewmodels;
  private cosmeticFalls=true;
  setEffects(profile:'full'|'subtle'|'off'){this.cosmeticFalls=profile!=='off';}
  setToolAction(action: ToolAction | undefined, now: number) { this.tools.setAction(action,now); }
  private atmosphere: FriendsDayNightCycle;
  private environmentPreview=new FriendsEnvironmentPreview();
  private localEnvironmentPreview=false;
  private audioUnderground=false;
  private birds=new FriendsBirds();
  private campfire:FriendsCampfire;
  constructor(private scene: THREE.Scene, private viewmodel: THREE.Scene, renderer: THREE.WebGLRenderer, private camera: THREE.PerspectiveCamera, lighting?: FrontierCelestialLighting) {
    const lights = lighting ?? {
      sun: scene.children.find(o=>o instanceof THREE.DirectionalLight) as THREE.DirectionalLight,
      ambient: scene.children.find(o=>o instanceof THREE.AmbientLight) as THREE.AmbientLight,
      fill: scene.children.find(o=>o instanceof THREE.HemisphereLight) as THREE.HemisphereLight,
    };
    this.atmosphere = new FriendsDayNightCycle(scene, renderer, camera, lights);
    this.campfire=new FriendsCampfire(scene);this.retreats=new FriendsRetreatVisuals(scene);
    this.group.name = 'frontier-streamed-world'; scene.add(this.group); this.tools = new FriendsToolViewmodels(viewmodel);
    this.group.add(this.birds.mesh);
    this.cave=new FriendsCaveVisuals(scene,camera,this.terrain,renderer);this.group.add(this.cave,this.treasures);
    this.flashlight=new FriendsFlashlight(scene,viewmodel,camera,renderer);
    for(const source of this.materials.slice()){const m=source.clone(),decorate=source.onBeforeCompile;m.customProgramCacheKey=()=> 'frontier-underground';m.color.set('#909b99');m.roughness=.68;m.onBeforeCompile=(shader,renderer)=>{decorate(shader,renderer);shader.fragmentShader=shader.fragmentShader.replace(ISLAND_BIOME_GLSL.slice(ISLAND_BIOME_GLSL.indexOf('  vec4 islandClimate')),'');shader.vertexShader='attribute vec3 caveGlow;varying vec3 caveRadiance;\n'+shader.vertexShader.replace('#include <color_vertex>','#include <color_vertex>\ncaveRadiance=caveGlow;');shader.fragmentShader='varying vec3 caveRadiance;\n'+shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=caveRadiance*diffuseColor.rgb;');};applyFriendsCaveLighting(m);this.materials.push(m);}
    const ruinStone=frontierMaterial('Rock030','#ffffff',true),ruinMaterials=createIslandRuinMaterials(ruinStone);ruinStone.dispose();
    this.materials.push(...ruinMaterials);
    this.island=new FriendsIslandVisuals(ruinMaterials,this.fineCoverage,this.fineGrid);this.group.add(this.island);
    this.forestLOD = new FriendsForestLOD(scene, renderer, m => this.clouds.shade(m));
    this.fineCoverage.magFilter = this.fineCoverage.minFilter = THREE.NearestFilter; this.fineCoverage.needsUpdate = true;
    this.blockCoverage.magFilter=this.blockCoverage.minFilter=THREE.NearestFilter;this.blockCoverage.needsUpdate=true;
    this.blockMaterial=this.farMaterial.clone();this.blockMaterial.onBeforeCompile=this.farMaterial.onBeforeCompile;this.blockMaterial.customProgramCacheKey=this.farMaterial.customProgramCacheKey;
    this.editFeedback=new FriendsTerrainEditFeedback(this.group,this.materials);
    const blockMask={texture:this.blockCoverage,altitude:this.blockAltitude};
    configureTerrainCoverage(this.farMaterial,this.fineCoverage,this.fineGrid,'horizon',blockMask);
    configureTerrainCoverage(this.blockMaterial,this.fineCoverage,this.fineGrid,'surface',blockMask);
    this.surface=new FriendsBlockSurface(this.blockMaterial,this.blockData,this.blockCoverage,this.fineGrid);this.group.add(this.surface);
    for(const material of this.materials)configureTerrainCoverage(material,this.fineCoverage,this.fineGrid,'near');
    this.far = new FriendsBlockHorizon(this.farMaterial, 5900, 5630); this.group.add(this.far);
    this.clouds = new FriendsClouds(renderer); this.group.add(this.clouds);
    for(const material of [...this.materials,this.farMaterial,this.blockMaterial]){this.clouds.shade(material);this.editFeedback.mask(material);}
    this.island.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshStandardMaterial)this.clouds.shade(m);});
    this.coast=createIslandOcean();this.group.add(this.coast);
    this.clouds.setAtmosphere(this.atmosphere);
    this.coast.setAtmosphere(this.atmosphere);
    this.floodWater=new FriendsFloodWaterVisuals(this.terrain,this.atmosphere);this.group.add(this.floodWater);this.floodWater.bindNatural(this.island);this.floodWater.bindNatural(this.coast);
    this.island.setAtmosphere(this.atmosphere);
    // Survey flags make regional destinations readable from the air and ground.
    for (const site of FRONTIER_SITES) {
      const pose=frontierSiteMarkerPose(site), marker = new THREE.Group(); marker.position.set(pose.x, pose.z, pose.y); this.group.add(marker);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 160, 8), new THREE.MeshStandardMaterial({ color: '#d7c29d', roughness: .8 })); pole.position.y = 80; marker.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(70, 34), new THREE.MeshStandardMaterial({ color: site.color, side: THREE.DoubleSide, roughness: .9 })); flag.position.set(35, 139, 0); marker.add(flag);
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128; const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#192d25'; ctx.fillRect(0, 0, 512, 128); ctx.fillStyle = site.color; ctx.font = 'bold 28px monospace'; ctx.textAlign = 'center'; ctx.fillText(site.name, 256, 48); ctx.font = '18px monospace'; ctx.fillText('SURVEY / SUPPLY DISPATCH', 256, 84);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      const board = new THREE.Mesh(new THREE.PlaneGeometry(128, 32), new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide })); board.position.set(0, 67, -4); marker.add(board);
      marker.userData.landmark = true;
    }
    try {
      this.worker = new Worker(new URL('./friendsTerrain.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onerror = () => { this.worker?.terminate(); this.worker = undefined; this.pending.clear(); };
      this.worker.onmessage = e => { const result = e.data as { cx: number; cy: number; epoch: number; mesh: TerrainMeshData }; this.pending.delete(`${result.cx},${result.cy}:${result.epoch}`); if (result.epoch !== this.epoch || !this.desired.has(`${result.cx},${result.cy}`)) return; this.completed.push(result); };
    } catch { /* Synchronous fallback still gives identical geometry. */ }
  }
  private install(cx: number, cy: number, data: TerrainMeshData) {
    const key = `${cx},${cy}`, old = this.chunks.get(key); if (old) { old.geometry.dispose(); old.removeFromParent(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3)); g.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3,true)); g.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(data.colors, 3,true));g.setAttribute('caveGlow',new THREE.BufferAttribute(data.glow,3)); for (const group of data.groups) g.addGroup(group.start, group.count, group.materialIndex);
    g.computeBoundingSphere(); const mesh = new THREE.Mesh(g, this.materials); mesh.position.set(cx * 512, 0, cy * 512); mesh.receiveShadow = true; mesh.castShadow = true; this.group.add(mesh); this.chunks.set(key, mesh); this.dirty.delete(key); this.fineData[cy*this.fineGrid+cx]=255; this.fineCoverage.needsUpdate=true;
    this.volumeBytes.set(key,data.positions.byteLength+data.normals.byteLength+data.uv.byteLength+data.colors.byteLength+data.glow.byteLength);
    const queued=this.editQueuedAt.get(key);if(queued!==undefined){this.meshLatencies.push(performance.now()-queued);if(this.meshLatencies.length>128)this.meshLatencies.shift();this.editQueuedAt.delete(key);}
    this.editFeedback.installed(cx,cy);this.editFeedback.refresh(this.terrain);
    this.cave.invalidateShadows();
  }
  update(f: FrontierSnapshot | undefined, x: number, y: number, elapsed: number, tool: FrontierTool, firing = false, openedTreasures: readonly string[] = [], worldElapsedMs = elapsed, flashlightAvailable=true) {
    this.group.visible = Boolean(f); this.tools.update(tool,elapsed,firing,Boolean(f && f.upgrades>0),Boolean(f));
    this.atmosphere.sky.visible = Boolean(f);
    this.atmosphere.moon.visible = Boolean(f);
    this.flashlight.update(elapsed/1000,Boolean(f)&&flashlightAvailable);
    if (!f) {this.campfire.update(elapsed/1000,this.camera,this.atmosphere.state.daylight,false);return;}
    this.treasures.update(openedTreasures,this.camera,elapsed/1000);
    this.atmosphere.update(this.environmentPreview.time(worldElapsedMs,elapsed),elapsed);
    this.campfire.update(elapsed/1000,this.camera,this.atmosphere.state.daylight);
    this.far.update(); this.floodWater.update(elapsed/1000);this.island.update(elapsed/1000,this.camera.position);this.clouds.update(this.environmentPreview.windSeconds,elapsed/1000,this.camera);
    this.coast.update(elapsed/1000,this.camera.position);
    if (f.terrain.revision !== this.revision) {
      const gradeStamp=JSON.stringify(f.terrain.grades || []);if(gradeStamp!==this.gradeStamp){this.far.setGrades(f.terrain.grades);this.surface.setGrades(f.terrain.grades);this.gradeStamp=gradeStamp;for(const key of this.chunks.keys())this.dirty.add(key);for(const key of this.groves.keys())this.vegetationDirty.add(key);
        for(const g of [...this.terrain.snapshot().grades || [],...f.terrain.grades || []]){const r=g[3]+320;for(let a=Math.floor((g[0]-r)/512);a<=Math.floor((g[0]+r)/512);a++)for(let b=Math.floor((g[1]-r)/512);b<=Math.floor((g[1]+r)/512);b++)this.vegetationDirty.add(`${a},${b}`);}}
      if(this.revision>=0)for(const e of f.terrain.edits){const key=e.slice(0,3).join(',');if(e[3]===0&&this.previousEdits.get(key)!==0&&this.terrain.exposedMaterial(e[0],e[1],e[2]))this.editFeedback.add(e[0],e[1],e[2]);}
      this.terrain.restore(f.terrain);this.floodWater.sync();this.editFeedback.refresh(this.terrain); this.revision = f.terrain.revision; this.epoch++;
      this.pending.clear();this.completed=[];
      this.worker?.postMessage({ snapshot: f.terrain, epoch: this.epoch });
      const nextEdits = new Map(f.terrain.edits.map(e => [e.slice(0, 3).join(','), e[3]]));
      for (const k of new Set([...nextEdits.keys(), ...this.previousEdits.keys()])) if (nextEdits.get(k) !== this.previousEdits.get(k)) {
        const [vx, vy] = k.split(',').map(Number), a = Math.floor(vx / 16), b = Math.floor(vy / 16);
        const neighbors=[[0,0]];if(vx%16===0)neighbors.push([-1,0]);if(vx%16===15)neighbors.push([1,0]);if(vy%16===0)neighbors.push([0,-1]);if(vy%16===15)neighbors.push([0,1]);
        for (const [dx, dy] of neighbors) {const key=`${a+dx},${b+dy}`;this.dirty.add(key);if(this.previousEdits.size||this.chunks.has(key))this.editQueuedAt.set(key,performance.now());}
      }
      for (const k of this.dirty) this.vegetationDirty.add(k);
      this.editedTiles=new Set([...nextEdits.keys()].map(k=>{const [vx,vy]=k.split(',').map(Number);return `${Math.floor(vx/16)},${Math.floor(vy/16)}`;}));
      this.previousEdits = nextEdits;
    }
    const viewX=this.camera.position.x,viewY=this.camera.position.z;
    const arch=islandArchRange(viewX,viewY),inArch=arch&&this.camera.position.y>=arch[0]&&this.camera.position.y<arch[1];
    const minedUnderground=!inArch&&this.camera.position.y<this.terrain.surfaceHeight(viewX,viewY)-48&&this.terrain.ceiling(viewX,viewY,this.camera.position.y)!==undefined;
    // Keep the exterior visible through entrances; solid cave/roof geometry
    // determines occlusion rather than the camera's underground classification.
    const underground=this.cave.update(elapsed/1000,minedUnderground,this.atmosphere.horizon);
    this.audioUnderground=underground;
    this.birds.update(f,this.camera.position,elapsed/1000,this.environmentPreview.state.daylight,underground,
      tree=>this.terrain.supports(tree.x,tree.y,tree.z),tree=>this.forestLOD.canopyHeight(tree));
    const altitude=Math.max(0,this.camera.position.y-this.terrain.surfaceHeight(viewX,viewY));
    this.blockAltitude.value=1-THREE.MathUtils.smoothstep(altitude,4096,8192);
    this.surface.update(viewX,viewY,elapsed/1000,this.blockAltitude.value>0);
    // Raycast the actual pickaxe view to prepare its chunk before the first
    // excavation update. Ordinary exploration never allocates deep voxel grids.
    let excavation:{x:number;y:number}|undefined;
    if(firing&&(tool===2||tool===3)){
      const direction=this.camera.getWorldDirection(new THREE.Vector3());
      const hit=this.terrain.raycast({x:viewX,y:viewY,z:this.camera.position.y,dx:direction.x,dy:direction.z,dz:direction.y});
      if(hit)excavation={x:hit.x,y:hit.y};
    }
    const planStamp=`${Math.floor(viewX/256)},${Math.floor(viewY/256)}:${this.revision}:${underground}:${excavation?`${Math.floor(excavation.x/512)},${Math.floor(excavation.y/512)}`:''}`;
    if(planStamp!==this.volumePlanStamp){this.volumePlanStamp=planStamp;this.desired=volumeChunksAround(viewX,viewY,this.editedTiles,underground,Math.max(FRIENDS_FLASHLIGHT_RANGE,FRIENDS_NIGHT_VISION_RANGE),excavation);}
    // Upload only current results. The exterior shell stays in place until a
    // complete authoritative volume is ready, so opening a pit creates no hole.
    for(let i=0;i<2&&this.completed.length;i++){
      const result=this.completed.shift()!;
      if(result.epoch===this.epoch&&this.desired.has(`${result.cx},${result.cy}`))this.install(result.cx,result.cy,result.mesh);
    }
    const queued=new Set(this.completed.map(r=>`${r.cx},${r.cy}`));
    const todo=[...this.desired].filter(key=>(!this.chunks.has(key)||this.dirty.has(key))&&!queued.has(key));
    const distance=(key:string)=>{const [a,b]=key.split(',').map(Number);return distanceToTerrainTile(viewX,viewY,a*512,b*512,512);};
    todo.sort((a,b)=>distance(a)-distance(b));
    let sent=0;
    for(const key of todo){const job=`${key}:${this.epoch}`;if(this.pending.has(job))continue;
      const [a,b]=key.split(',').map(Number);
      if(this.worker){if(this.pending.size>=2)break;this.pending.add(job);this.worker.postMessage({cx:a,cy:b,epoch:this.epoch});}
      else this.install(a,b,meshTerrainChunk(this.terrain,a,b));
      if(++sent>=(this.worker?2:1))break;
    }
    const cached=[...this.chunks].sort((a,b)=>distance(b[0])-distance(a[0]));
    let cachedBytes=[...this.volumeBytes.values()].reduce((sum,n)=>sum+n,0);
    for(const [key,mesh]of cached){const [a,b]=key.split(',').map(Number),d=distance(key);
      if(!this.desired.has(key)&&(d>VOLUME_RETAIN||this.chunks.size>192||cachedBytes>64*1024*1024)){
        cachedBytes-=this.volumeBytes.get(key)||0;this.volumeBytes.delete(key);mesh.geometry.dispose();mesh.removeFromParent();this.chunks.delete(key);
        this.fineData[b*this.fineGrid+a]=0;this.fineCoverage.needsUpdate=true;continue;
      }
      // Actual edits remain voxel geometry even after leaving the dig site.
      // Cached sealed cave meshes only become visible at cave access or inside.
      mesh.visible=this.desired.has(key);mesh.castShadow=mesh.visible&&d<1024;
      const value=mesh.visible?255:0,index=b*this.fineGrid+a;
      if(this.fineData[index]!==value){this.fineData[index]=value;this.fineCoverage.needsUpdate=true;}
    }
    const cx = Math.floor(x / 512), cy = Math.floor(y / 512);
    const stamp = `${f.harvested.length}:${f.planted.length}:${f.terrain.revision}`;
    const harvested = new Set(f.harvested);
    if (stamp !== this.vegetationStamp) {
      for (const tree of f.planted) if (!this.knownPlanted.has(tree.id)) this.vegetationDirty.add(`${Math.floor(tree.x / 512)},${Math.floor(tree.y / 512)}`);
      for (const [key, grove] of this.groves) if (this.vegetationDirty.has(key) || (grove.userData.treeIds as string[]).some(id => harvested.has(id) || id.startsWith('planted:')&&!f.planted.some(t=>t.id===id))) { disposeGroup(grove); this.groves.delete(key); }
      this.knownPlanted = new Set(f.planted.map(t => t.id)); this.vegetationStamp = stamp;
    }
    this.forestLOD.update(f, tree=>this.terrain.supports(tree.x,tree.y,tree.z),this.vegetationDirty,this.camera,true,elapsed,this.cosmeticFalls);
    this.vegetationDirty.clear();
    for(const [key,grove] of this.groves){
      const [a,b]=key.split(',').map(Number);
      if(Math.hypot((a+.5)*512-x,(b+.5)*512-y)>FOREST_DETAIL_END+1100){disposeGroup(grove);this.groves.delete(key);}
    }
    let grovesCreated = 0;
    for (const [dx,dy] of GROVE_CELL_OFFSETS) {
      const a = cx + dx, b = cy + dy;
      if (Math.hypot((a+.5)*512-x,(b+.5)*512-y)>FOREST_DETAIL_END+250 || a < 0 || b < 0 || a > 93 || b > 93 || grovesCreated >= 3 || this.groves.has(`${a},${b}`)) continue;
      const trees = [...frontierTrees(a, b), ...f.planted.filter(t => Math.floor(t.x / 512) === a && Math.floor(t.y / 512) === b)].filter(t => !lavaRiverTreeClearance(t.x,t.y) && !emberRetreatTreeClearance(t.x,t.y) && !harvested.has(t.id) && this.terrain.supports(t.x,t.y,t.z));
      const grove = new THREE.Group(); grove.userData.treeIds = trees.map(t => t.id); grovesCreated++; this.group.add(grove); this.groves.set(`${a},${b}`, grove);
      const plants = trees.flatMap(t => Array.from({ length: 2 }, (_, i) => { const px = t.x + Math.cos(i * 2.4) * 60, py = t.y + Math.sin(i * 2.4) * 60; return { x: px, y: this.terrain.surfaceHeight(px, py), z: py, rotation: i, scale: .6 + terrainHash(px, py) }; }));
      addFriendsAssetInstances(grove, 'frontierBush', { x: 24, y: 18, z: 24 }, plants);
      addFriendsAssetInstances(grove, 'wildGrass', { x: 22, y: 12, z: 22 }, plants.map(p => ({ ...p, x: p.x + 40 })));
      addFriendsAssetInstances(grove, 'broadRock', { x: 100, y: 55, z: 85 }, plants.filter((_, i) => i % 13 === 0));
    }
    for (const [k, grove] of this.groves) { const [a, b] = k.split(',').map(Number); if (Math.abs(a - cx) > 5 || Math.abs(b - cy) > 5) { disposeGroup(grove); this.groves.delete(k); } }
    for(const [key,grove] of this.groves){const [a,b]=key.split(',').map(Number);const gx=(a+.5)*512,gy=(b+.5)*512;
      const distance=Math.hypot(this.camera.position.x-gx,this.camera.position.z-gy,this.camera.position.y-this.terrain.surfaceHeight(gx,gy)-160);
      grove.visible=distance<FOREST_DETAIL_END+500;
      grove.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.castShadow=distance<1000;});
    }
  }
  get forestStats(){return this.forestLOD.stats;}
  setMultisampled(enabled: boolean) { this.forestLOD.setMultisampled(enabled); }
  get campfireDrawCalls(){return this.campfire.drawCalls;}
  get cloudStats(){return this.clouds.stats;}
  get terrainStats(){return {...this.floodWater.stats,...this.surface.stats,...this.editFeedback.stats,volumeChunks:this.chunks.size,volumeActive:[...this.chunks.values()].filter(m=>m.visible).length,volumeJobs:this.pending.size+this.completed.length,editMeshLatencyP95:this.meshLatencies.length?[...this.meshLatencies].sort((a,b)=>a-b)[Math.floor((this.meshLatencies.length-1)*.95)]:0,editMeshSamples:this.meshLatencies.length};}
  arrivalReadiness(x:number,y:number){
    const cx=Math.floor(x/512),cy=Math.floor(y/512);
    const ground=Boolean(this.fineData[cy*this.fineGrid+cx] || this.blockData[cy*this.fineGrid+cx]);
    let loaded=0,total=0;
    for(const dx of [-1536,0,1536])for(const dy of [-1536,0,1536]){
      const sx=x+dx,sy=y+dy;if(sx<0||sy<0||sx>=FRONTIER_SIZE||sy>=FRONTIER_SIZE)continue;
      total++;const i=Math.floor(sy/512)*this.fineGrid+Math.floor(sx/512);
      if(this.fineData[i] || this.blockData[i]>=250 || this.far.hasTerrainAt(sx,sy))loaded++;
    }
    return {ready:ground&&loaded===total&&this.forestLOD.arrivalReady,progress:(Number(ground)+loaded/Math.max(1,total)+Number(this.forestLOD.arrivalReady))/3};
  }
  get flashlightEquipped(){return this.flashlight.equipped;}
  get flashlightShining(){return this.flashlight.shining;}
  get flashlightAngle(){return this.flashlight.beamAngle;}
  setRetreatState(state:RetreatState|undefined){this.retreats.setState(state);}
  setCampfireState(state:CampfireSnapshot|undefined){this.campfire.setState(state);this.retreats.setCampfireState(state);}
  hideHeldTool(){this.tools.hide();}
  setCraneCameraLight(enabled:boolean) {this.flashlight.setMonitor(enabled);}
  syncFlashlightWithCamera() { this.flashlight.syncWithCamera(); }
  get environmentState(){return this.environmentPreview.state;}
  get soundscapeEnvironment(){return { ...this.environmentPreview.state, windSeconds:this.environmentPreview.windSeconds, underground:this.audioUnderground };}
  birdCallSource(yaw:number){return this.birds.closestCall(this.camera.position,yaw,this.environmentPreview.state.daylight);}
  treeCanopy(tree: FrontierTree){return this.forestLOD.canopy(tree);}
  synchronizeEnvironment(snapshot:FriendsEnvironmentSnapshot){if(!this.localEnvironmentPreview)this.environmentPreview.synchronize(snapshot);}
  /** Standalone render-review controls explicitly opt into a local preview.
   * Gameplay controls change the simulation's shared environment instead. */
  setEnvironment(change:FriendsEnvironmentChange){this.localEnvironmentPreview=!change.reset;this.environmentPreview.change(change);}
  toggleFlashlight() { this.flashlight.toggle(); }
  dispose() {
    this.floodWater.dispose();
    this.campfire.dispose();this.retreats.dispose();
    this.birds.dispose();
    this.editFeedback.dispose();this.worker?.terminate();this.completed=[];this.surface.dispose();this.blockMaterial.dispose();this.blockCoverage.dispose(); islandBiomeTexture().dispose(); this.forestLOD.dispose();this.fineCoverage.dispose(); for (const mesh of this.chunks.values()) mesh.geometry.dispose(); for (const grove of this.groves.values()) disposeGroup(grove);
    for (const landmark of [...this.group.children].filter(o => o.userData.landmark)) disposeGroup(landmark as THREE.Group);
    this.group.removeFromParent(); this.tools.dispose(); this.far.dispose(); this.clouds.release();this.cave.dispose();this.flashlight.dispose();this.treasures.dispose();this.island.dispose();
    for (const m of [...this.materials, this.farMaterial]) { m.map?.dispose(); m.normalMap?.dispose(); m.roughnessMap?.dispose();if(m.userData.alpineRock instanceof THREE.Texture)m.userData.alpineRock.dispose(); m.dispose(); }
    this.coast.dispose(); this.atmosphere.dispose();
  }
}
