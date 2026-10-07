import { applyFriendsCaveLighting } from './FriendsCaveLighting';
import { FriendsFlashlight, FRIENDS_FLASHLIGHT_RANGE } from './FriendsFlashlight';
import { FriendsTreasureVisuals } from './FriendsTreasureVisuals';
import { CAVE_BOUNDS, CAVE_ENTRANCE, caveAt } from '../world/FriendsCave';
import { FriendsCaveVisuals } from './FriendsCaveVisuals';
import * as THREE from 'three';
import { FriendsTerrain, FRONTIER_SIZE, FRONTIER_SITES, TERRAIN_CHUNK, baseTerrainHeight, terrainHash, type TerrainSnapshot } from '../world/FriendsTerrain';
import { meshTerrainChunk, type TerrainMeshData } from '../world/FriendsTerrainMesh';
import { frontierTrees, type FrontierSnapshot, type FrontierTool } from '../multiplayer/FriendsFrontier';
import { addFriendsAssetInstances, loadFriendsAsset, fitFriendsAsset, type FriendsAssetId } from './FriendsAssets';
import { FOREST_DETAIL_END, FriendsForestLOD } from './FriendsForestLOD';
import { FriendsBlockHorizon } from './FriendsBlockHorizon';
import { FriendsClouds } from './FriendsClouds';
import { configureTerrainCoverage } from './FriendsTerrainCoverage';
import { FRIENDS_TERRAIN_SURFACES } from '../world/FriendsTerrainAppearance';

export function frontierMaterial(asset: 'Ground037' | 'Rock030' | 'WoodFloor051', color = '#ffffff', worldProjected = false) {
  const loader = new THREE.TextureLoader(), base = `${import.meta.env.BASE_URL}textures/frontier/${asset}_1K-JPG_`;
  const texture = (name: string, srgb = false) => { const t = loader.load(base + name + '.jpg'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const material = new THREE.MeshStandardMaterial({ color, map: texture('Color', true), normalMap: texture('NormalGL'), normalScale: new THREE.Vector2(.28, .28), roughnessMap: texture('Roughness'), roughness: .95, vertexColors: true });
  material.onBeforeCompile = shader => {
    const projection = `vec4 frontierPosition=vec4(position,1.); vec3 frontierNormal=normal;
      #ifdef USE_INSTANCING
      frontierPosition=instanceMatrix*frontierPosition; frontierNormal=mat3(instanceMatrix)*frontierNormal;
      #endif
      frontierWorld=(modelMatrix*frontierPosition).xyz;`;
    shader.vertexShader='varying vec3 frontierWorld;\n'+shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + projection);
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
    shader.fragmentShader='varying vec3 frontierWorld;\n'+shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
      vec4 primary=texture2D(map,vMapUv);vec4 secondary=texture2D(map,mat2(.8,-.6,.6,.8)*vMapUv*1.73+vec2(.43,.27));
      diffuseColor*=vec4(mix(primary.rgb,secondary.rgb,.45),primary.a);
      #endif`).replace('#include <color_fragment>',`#include <color_fragment>
      diffuseColor.rgb*=.92+.08*sin(frontierWorld.x*.0011+sin(frontierWorld.z*.0007)*2.)*sin(frontierWorld.z*.0015);`);
  };
  material.customProgramCacheKey = () => worldProjected ? 'frontier-world-projected-v1' : 'frontier-uv-v1';
  return material;
}
function disposeGroup(group: THREE.Group) {
  group.userData.disposed = true;
  const geo = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  group.traverse(o => { if (o instanceof THREE.Mesh) { if(!o.geometry.userData.friendsShared)geo.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) { materials.add(m); for (const value of Object.values(m)) if (value instanceof THREE.Texture&&!m.userData.friendsSharedTextures) textures.add(value); } if (o instanceof THREE.InstancedMesh) o.dispose(); } });
  geo.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); group.removeFromParent();
}
export class FriendsFrontierVisuals {
  readonly terrain = new FriendsTerrain();
  private group = new THREE.Group();
  private chunks = new Map<string, THREE.Mesh>();
  private groves = new Map<string, THREE.Group>();
  private dirty = new Set<string>();
  private previousEdits = new Map<string, number>();
  private desired = new Set<string>();
  private pending = new Set<string>();
  private materials = Object.values(FRIENDS_TERRAIN_SURFACES).map(surface => frontierMaterial(surface.asset, surface.color));
  private revision = -1;
  private gradeStamp='[]';
  private vegetationStamp = '';
  private vegetationDirty = new Set<string>();
  private knownPlanted = new Set<string>();
  private coast: THREE.Mesh;
  private epoch = 0;
  private worker?: Worker;
  private farMaterial = frontierMaterial('Ground037', '#abb68d');
  private fineGrid = Math.ceil(FRONTIER_SIZE / 512);
  private fineData = new Uint8Array(this.fineGrid * this.fineGrid);
  private fineCoverage = new THREE.DataTexture(this.fineData,this.fineGrid,this.fineGrid,THREE.RedFormat);
  private forestLOD: FriendsForestLOD;
  private far: FriendsBlockHorizon;
  private clouds: FriendsClouds;
  private cave: FriendsCaveVisuals;
  private flashlight: FriendsFlashlight;
  private treasures = new FriendsTreasureVisuals();
  private tool = new THREE.Group();
  private toolId = -1;
  private sky: THREE.Mesh;
  constructor(private scene: THREE.Scene, private viewmodel: THREE.Scene, renderer: THREE.WebGLRenderer, private camera: THREE.PerspectiveCamera) {
    this.group.name = 'frontier-streamed-world'; scene.add(this.group); (viewmodel.getObjectByProperty('type', 'PerspectiveCamera') || viewmodel).add(this.tool);
    this.cave=new FriendsCaveVisuals(scene,camera,this.terrain,renderer);this.group.add(this.cave,this.treasures);
    this.flashlight=new FriendsFlashlight(scene,viewmodel,camera,renderer);
    for(const source of this.materials.slice()){const m=source.clone(),decorate=source.onBeforeCompile;m.customProgramCacheKey=()=> 'frontier-underground';m.color.set('#909b99');m.roughness=.68;m.onBeforeCompile=(shader,renderer)=>{decorate(shader,renderer);shader.vertexShader='attribute vec3 caveGlow;varying vec3 caveRadiance;\n'+shader.vertexShader.replace('#include <color_vertex>','#include <color_vertex>\ncaveRadiance=caveGlow;');shader.fragmentShader='varying vec3 caveRadiance;\n'+shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=caveRadiance*diffuseColor.rgb;');};applyFriendsCaveLighting(m);this.materials.push(m);}
    this.forestLOD = new FriendsForestLOD(scene, renderer);
    this.fineCoverage.magFilter = this.fineCoverage.minFilter = THREE.NearestFilter; this.fineCoverage.needsUpdate = true;
    configureTerrainCoverage(this.farMaterial,this.fineCoverage,this.fineGrid,'horizon');
    for(const material of this.materials)configureTerrainCoverage(material,this.fineCoverage,this.fineGrid,'near');
    this.far = new FriendsBlockHorizon(this.farMaterial, 5900, 5630); this.group.add(this.far);
    this.clouds = new FriendsClouds(); this.group.add(this.clouds);
    for(const material of [...this.materials,this.farMaterial])this.clouds.shade(material);
    const waterMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { time: { value: 0 } }, vertexShader: 'varying vec3 waterPosition; void main(){waterPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', fragmentShader: 'varying vec3 waterPosition;uniform float time;void main(){float waves=sin(waterPosition.x*.013+time)*sin(waterPosition.y*.018-time*.7);float glint=pow(max(0.,waves),12.);gl_FragColor=vec4(mix(vec3(.09,.27,.28),vec3(.28,.56,.53),waves*.25+.4)+glint*.16,.86);}' });
    const coast = this.coast = new THREE.Mesh(new THREE.PlaneGeometry(20000, 34000), waterMaterial); coast.rotation.x = -Math.PI / 2; coast.position.set(38000, -160, 31000); this.group.add(coast);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(80000, 32, 20), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { time: { value: 0 } }, vertexShader: 'varying vec3 direction;void main(){direction=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', fragmentShader: `varying vec3 direction;uniform float time;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){vec3 d=normalize(direction);float h=max(0.,d.y);vec3 c=mix(vec3(.78,.83,.78),vec3(.20,.41,.58),pow(h,.45));vec3 sun=normalize(vec3(.55,.36,-.45));float s=max(0.,dot(d,sun));c+=vec3(1.,.64,.28)*pow(s,420.)*.9+vec3(.35,.22,.10)*pow(s,12.);gl_FragColor=vec4(c,1.);}` }));
    this.sky.position.set(12000, 0, 12000); this.group.add(this.sky);
    // Survey flags make regional destinations readable from the air and ground.
    for (const site of FRONTIER_SITES) {
      const h = baseTerrainHeight(site.x, site.y), marker = new THREE.Group(); marker.position.set(site.x, h, site.y); this.group.add(marker);
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
      this.worker.onmessage = e => { const { cx, cy, epoch, mesh } = e.data as { cx: number; cy: number; epoch: number; mesh: TerrainMeshData }; this.pending.delete(`${cx},${cy}:${epoch}`); if (epoch !== this.epoch || !this.desired.has(`${cx},${cy}`)) return; this.install(cx, cy, mesh); };
    } catch { /* Synchronous fallback still gives identical geometry. */ }
  }
  private install(cx: number, cy: number, data: TerrainMeshData) {
    const key = `${cx},${cy}`, old = this.chunks.get(key); if (old) { old.geometry.dispose(); old.removeFromParent(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3)); g.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3)); g.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));g.setAttribute('caveGlow',new THREE.BufferAttribute(data.glow,3)); for (const group of data.groups) g.addGroup(group.start, group.count, group.materialIndex);
    g.computeBoundingSphere(); const mesh = new THREE.Mesh(g, this.materials); mesh.position.set(cx * 512, 0, cy * 512); mesh.receiveShadow = true; mesh.castShadow = true; this.group.add(mesh); this.chunks.set(key, mesh); this.dirty.delete(key); this.fineData[cy*this.fineGrid+cx]=255; this.fineCoverage.needsUpdate=true;
  }
  update(f: FrontierSnapshot | undefined, x: number, y: number, elapsed: number, tool: FrontierTool, firing = false, openedTreasures: readonly string[] = []) {
    this.group.visible = Boolean(f); this.tool.visible = Boolean(f && tool);
    this.flashlight.update(elapsed/1000,Boolean(f && tool));
    if (!f) return;
    this.treasures.update(openedTreasures,this.camera,elapsed/1000);
    this.far.update(); this.clouds.update(elapsed / 1000);
    const underground=this.cave.update(elapsed/1000);this.sky.visible=!underground;this.clouds.visible=!underground;this.coast.visible=!underground;this.far.visible=!underground;
    (this.coast.material as THREE.ShaderMaterial).uniforms.time.value = elapsed / 1000; (this.sky.material as THREE.ShaderMaterial).uniforms.time.value = elapsed / 1000;
    if (f.terrain.revision !== this.revision) {
      const gradeStamp=JSON.stringify(f.terrain.grades || []);if(gradeStamp!==this.gradeStamp){this.far.setGrades(f.terrain.grades);this.gradeStamp=gradeStamp;for(const key of this.chunks.keys())this.dirty.add(key);for(const key of this.groves.keys())this.vegetationDirty.add(key);
        for(const g of [...this.terrain.snapshot().grades || [],...f.terrain.grades || []]){const r=g[3]+320;for(let a=Math.floor((g[0]-r)/512);a<=Math.floor((g[0]+r)/512);a++)for(let b=Math.floor((g[1]-r)/512);b<=Math.floor((g[1]+r)/512);b++)this.vegetationDirty.add(`${a},${b}`);}}
      this.terrain.restore(f.terrain); this.revision = f.terrain.revision; this.epoch++;
      this.worker?.postMessage({ snapshot: f.terrain, epoch: this.epoch });
      const nextEdits = new Map(f.terrain.edits.map(e => [e.slice(0, 3).join(','), e[3]]));
      for (const k of new Set([...nextEdits.keys(), ...this.previousEdits.keys()])) if (nextEdits.get(k) !== this.previousEdits.get(k)) {
        const [vx, vy] = k.split(',').map(Number), a = Math.floor(vx / 16), b = Math.floor(vy / 16);
        for (const [dx, dy] of [[0,0],[-1,0],[1,0],[0,-1],[0,1]]) this.dirty.add(`${a+dx},${b+dy}`);
      }
      for (const k of this.dirty) this.vegetationDirty.add(k);
      this.previousEdits = nextEdits;
    }
    const cx = Math.floor(x / 512), cy = Math.floor(y / 512), radius = 3;
    this.desired.clear();
    const todo: [number, number][] = [];
    for (let a = cx - radius; a <= cx + radius; a++) for (let b = cy - radius; b <= cy + radius; b++) if (a >= 0 && b >= 0 && a < FRONTIER_SIZE / 512 && b < FRONTIER_SIZE / 512) { this.desired.add(`${a},${b}`); if (!this.chunks.has(`${a},${b}`) || this.dirty.has(`${a},${b}`)) todo.push([a, b]); }
    const caveReady=Boolean(caveAt(x,y,this.camera.position.y))||Math.hypot(x-CAVE_ENTRANCE.x,y-CAVE_ENTRANCE.y)<1200;
    // Match the underground streaming distance to the flashlight reach.
    const caveRadius=Math.ceil(FRIENDS_FLASHLIGHT_RANGE/512)+1;
    // A local extra ring keeps tunnels ahead ready without preloading the whole
    // labyrinth (hundreds of chunks) when someone approaches its entrance.
    if(caveReady)for(let a=Math.max(cx-caveRadius,Math.floor(CAVE_BOUNDS.minX/512));a<=Math.min(cx+caveRadius,Math.floor(CAVE_BOUNDS.maxX/512));a++)for(let b=Math.max(cy-caveRadius,Math.floor(CAVE_BOUNDS.minY/512));b<=Math.min(cy+caveRadius,Math.floor(CAVE_BOUNDS.maxY/512));b++){const key=`${a},${b}`;if(!this.desired.has(key)){this.desired.add(key);if(!this.chunks.has(key)||this.dirty.has(key))todo.push([a,b]);}}
    todo.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));
    for (const [a, b] of todo.slice(0, this.worker ? 6 : 1)) { const k = `${a},${b}:${this.epoch}`; if (this.pending.has(k)) continue; if (this.worker) { this.pending.add(k); this.worker.postMessage({ cx: a, cy: b, epoch: this.epoch }); } else this.install(a, b, meshTerrainChunk(this.terrain, a, b)); }
    for (const [k, mesh] of this.chunks) { const [a,b]=k.split(',').map(Number);if(!this.desired.has(k)&&(Math.abs(a-cx)>radius+1||Math.abs(b-cy)>radius+1)){ mesh.removeFromParent(); mesh.geometry.dispose(); this.chunks.delete(k);this.fineData[b*this.fineGrid+a]=0;this.fineCoverage.needsUpdate=true; }}

    for(const [key,mesh] of this.chunks){const [a,b]=key.split(',').map(Number);const gx=(a+.5)*512,gy=(b+.5)*512;
      const altitude=Math.max(0,this.camera.position.y-this.terrain.surfaceHeight(gx,gy));const value=Math.round(255*(1-THREE.MathUtils.smoothstep(altitude,350,650)));mesh.visible=value>0;
      const index=b*this.fineGrid+a;if(this.fineData[index]!==value){this.fineData[index]=value;this.fineCoverage.needsUpdate=true;}
    }
    const stamp = `${f.harvested.length}:${f.planted.length}:${f.terrain.revision}`;
    const harvested = new Set(f.harvested);
    if (stamp !== this.vegetationStamp) {
      for (const tree of f.planted) if (!this.knownPlanted.has(tree.id)) this.vegetationDirty.add(`${Math.floor(tree.x / 512)},${Math.floor(tree.y / 512)}`);
      for (const [key, grove] of this.groves) if (this.vegetationDirty.has(key) || (grove.userData.treeIds as string[]).some(id => harvested.has(id) || id.startsWith('planted:')&&!f.planted.some(t=>t.id===id))) { disposeGroup(grove); this.groves.delete(key); const [a,b]=key.split(',').map(Number);this.forestLOD.setReady(a,b,false); }
      this.knownPlanted = new Set(f.planted.map(t => t.id)); this.vegetationStamp = stamp;
    }
    this.forestLOD.update(f, tree=>this.terrain.supports(tree.x,tree.y,tree.z),this.vegetationDirty);
    this.vegetationDirty.clear();
    let grovesCreated = 0;
    const groveCells = Array.from({length:81}, (_,i) => [cx-4+i%9,cy-4+Math.floor(i/9)]);
    groveCells.sort((a,b)=>Math.hypot(a[0]-cx,a[1]-cy)-Math.hypot(b[0]-cx,b[1]-cy));
    for (const [a,b] of groveCells) {
      if (a < 0 || b < 0 || a > 93 || b > 93 || grovesCreated >= 3 || this.groves.has(`${a},${b}`)) continue;
      const trees = [...frontierTrees(a, b), ...f.planted.filter(t => Math.floor(t.x / 512) === a && Math.floor(t.y / 512) === b)].filter(t => !harvested.has(t.id) && this.terrain.supports(t.x,t.y,t.z));
      const grove = new THREE.Group(); grove.userData.treeIds = trees.map(t => t.id); grovesCreated++; this.group.add(grove); this.groves.set(`${a},${b}`, grove);
      const detailJobs=[];
      for (const kind of ['oak', 'pine', 'autumnOak'] as const) detailJobs.push(addFriendsAssetInstances(grove, kind === 'pine' ? 'frontierPine' : kind === 'oak' ? 'frontierBirch' : 'frontierMaple', { x: 180, y: kind === 'pine' ? 320 : 260, z: 180 }, trees.filter(t => t.kind === kind).map(t => ({ x: t.x, y: t.z, z: t.y, rotation: terrainHash(t.x, t.y) * Math.PI * 2, scale: t.scale }))));
      void Promise.all(detailJobs).then(results=>{if(grove.userData.disposed)return;grove.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material]){this.forestLOD.detailMaterial(m);this.clouds.shade(m);}});this.forestLOD.setReady(a,b,results.every(Boolean));});
      const plants = trees.flatMap(t => Array.from({ length: 3 }, (_, i) => { const px = t.x + Math.cos(i * 2.4) * 60, py = t.y + Math.sin(i * 2.4) * 60; return { x: px, y: this.terrain.surfaceHeight(px, py), z: py, rotation: i, scale: .6 + terrainHash(px, py) }; }));
      addFriendsAssetInstances(grove, 'frontierBush', { x: 48, y: 35, z: 48 }, plants);
      addFriendsAssetInstances(grove, 'wildGrass', { x: 48, y: 28, z: 48 }, plants.map(p => ({ ...p, x: p.x + 40 })));
      addFriendsAssetInstances(grove, 'broadRock', { x: 100, y: 55, z: 85 }, plants.filter((_, i) => i % 13 === 0));
    }
    for (const [k, grove] of this.groves) { const [a, b] = k.split(',').map(Number); if (Math.abs(a - cx) > 5 || Math.abs(b - cy) > 5) { disposeGroup(grove); this.groves.delete(k); this.forestLOD.setReady(a,b,false); } }
    for(const [key,grove] of this.groves){const [a,b]=key.split(',').map(Number);const gx=(a+.5)*512,gy=(b+.5)*512;
      const distance=Math.hypot(this.camera.position.x-gx,this.camera.position.z-gy,this.camera.position.y-this.terrain.surfaceHeight(gx,gy)-160);
      grove.visible=distance<FOREST_DETAIL_END+500;
      grove.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.castShadow=distance<1000;});
    }
    this.updateTool(tool, elapsed, firing, f.upgrades>0);
  }
  toggleFlashlight() { this.flashlight.toggle(); }
  private updateTool(id: FrontierTool, elapsed: number, firing: boolean, upgraded: boolean) {
    const variant=id+(upgraded?10:0);
    if (variant !== this.toolId) {
      for(const child of [...this.tool.children]){if(child instanceof THREE.Group)disposeGroup(child);else child.removeFromParent();}
      this.toolId = variant;
      this.tool.add(new THREE.HemisphereLight(0xffeed0, 0x3d4b46, 2));
      const owner=new THREE.Group();this.tool.add(owner);
      const modelId:FriendsAssetId=id===1?(upgraded?'toolAxeUpgraded':'toolAxe'):id===2?(upgraded?'toolPickaxeUpgraded':'toolPickaxe'):(upgraded?'toolShovelUpgraded':'toolShovel');
      if(id)void loadFriendsAsset(modelId).then(source=>{
        if(owner.userData.disposed)return;
        const model=fitFriendsAsset(source,{x:.46,y:.82,z:.22},0,'contain');model.rotation.y=-Math.PI/2;model.position.y=-.34;owner.add(model);
      });
    }
    const swing = firing ? Math.sin(elapsed / 48) * .45 : Math.sin(elapsed / 1200) * .02;
    this.tool.position.set(.28, -.25 - Math.max(0, swing) * .12, -.7); this.tool.rotation.set(-.2 + swing, .2, -.35 + swing * .4);
  }
  dispose() {
    this.worker?.terminate(); this.forestLOD.dispose();this.fineCoverage.dispose(); for (const mesh of this.chunks.values()) mesh.geometry.dispose(); for (const grove of this.groves.values()) disposeGroup(grove);
    for (const landmark of [...this.group.children].filter(o => o.userData.landmark)) disposeGroup(landmark as THREE.Group);
    this.group.removeFromParent(); this.tool.removeFromParent(); this.far.dispose(); this.clouds.release();this.cave.dispose();this.flashlight.dispose();this.treasures.dispose();
    for (const m of [...this.materials, this.farMaterial]) { m.map?.dispose(); m.normalMap?.dispose(); m.roughnessMap?.dispose(); m.dispose(); }
    this.coast.geometry.dispose(); (this.coast.material as THREE.Material).dispose(); this.sky.geometry.dispose(); (this.sky.material as THREE.Material).dispose();
    for(const child of [...this.tool.children])if(child instanceof THREE.Group)disposeGroup(child);
  }
}
