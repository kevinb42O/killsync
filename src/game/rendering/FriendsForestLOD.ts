import * as THREE from 'three';
import { type FrontierTree, type FrontierSnapshot } from '../multiplayer/FriendsFrontier';
import { FRONTIER_SIZE, terrainHash } from '../world/FriendsTerrain';
import { fitFriendsAsset, loadFriendsAsset, type FriendsAssetId } from './FriendsAssets';

export const FOREST_DETAIL_START = 800;
export const FOREST_DETAIL_END = 1600;
const GRID = Math.ceil(FRONTIER_SIZE / 512), TILE = 4096;
const KINDS = ['pine', 'oak', 'autumnOak'] as const;
const ASSETS: FriendsAssetId[] = ['frontierPine', 'frontierBirch', 'frontierMaple'];
const coverage = `uniform sampler2D forestCoverage; uniform float forestGrid;
float detailCoverage(vec2 p){return texture2D(forestCoverage,(floor(p/512.)+.5)/forestGrid).r;}
float dither(){return fract(dot(floor(gl_FragCoord.xy),vec2(.754877666,.569840296)));}`;

/** Full-map, spatially culled billboards baked from the same licensed meshes as
 * the nearby trees. Each tree costs two triangles, independent of distance. */
export class FriendsForestLOD {
  private group = new THREE.Group();
  private worker?: Worker;
  private disposed = false;
  private atlas?: THREE.WebGLRenderTarget;
  private materials: THREE.ShaderMaterial[] = [];
  private ready = new Uint8Array(GRID * GRID);
  private coverage = new THREE.DataTexture(this.ready, GRID, GRID, THREE.RedFormat);
  private slots = new Map<string, { mesh: THREE.InstancedMesh; index: number; tree: FrontierTree }>();
  private removed = new Set<string>();
  private trees?: FrontierTree[];
  private baked = false;
  private pending?: FrontierTree[];
  private chunks = new Map<string, FrontierTree[]>();
  private stateRevision = -1;
  private plantedStamp = '';
  constructor(private scene: THREE.Scene, private renderer: THREE.WebGLRenderer) {
    this.group.name = 'frontier-persistent-distant-forests'; scene.add(this.group);
    this.coverage.magFilter = this.coverage.minFilter = THREE.NearestFilter; this.coverage.needsUpdate = true;
    try {
      this.worker = new Worker(new URL('./frontierVegetation.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = e => { this.trees = e.data; this.worker?.terminate(); this.worker = undefined; this.prepare(); };
      this.worker.postMessage(null);
    } catch { /* An unsupported worker does not prevent detailed nearby trees. */ }
    void Promise.all(ASSETS.map(loadFriendsAsset)).then(sources => {
      if (this.disposed) return;
      this.bake(sources); this.baked = true; this.prepare();
    }).catch(()=>{ /* Keep detailed assets visible if the atlas cannot be built. */ });
  }
  private prepare() { if (this.baked && this.trees) { this.pending = this.trees; this.trees = undefined; } }
  private bake(sources: THREE.Group[]) {
    const cellW = 256, cellH = 384;
    this.atlas = new THREE.WebGLRenderTarget(cellW * 8, cellH * 3, { depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const previousTarget = this.renderer.getRenderTarget(), viewport = this.renderer.getViewport(new THREE.Vector4()), scissor = this.renderer.getScissor(new THREE.Vector4()), scissorTest = this.renderer.getScissorTest();
    const clearColor = this.renderer.getClearColor(new THREE.Color()), clearAlpha = this.renderer.getClearAlpha(), autoClear = this.renderer.autoClear;
    const shadow = this.renderer.shadowMap.enabled;
    const stage = new THREE.Scene(); stage.add(new THREE.HemisphereLight(0xe1f4e5,0x64715b,1.2));
    const sun = new THREE.DirectionalLight(0xffe6c4,2.1); sun.position.set(300,500,-200); stage.add(sun);
    const camera = new THREE.OrthographicCamera(-120,120,340,-20,1,2000);
    this.renderer.shadowMap.enabled = false; this.renderer.autoClear = false; this.renderer.setRenderTarget(this.atlas); this.renderer.setScissorTest(false); this.renderer.setClearColor(0,0); this.renderer.clear();
    sources.forEach((source, kind) => {
      const model = fitFriendsAsset(source,{x:180,y:320,z:180},0,'contain'); stage.add(model);
      for (let angle = 0; angle < 8; angle++) {
        const yaw = angle * Math.PI / 4; camera.position.set(Math.sin(yaw)*800,160,Math.cos(yaw)*800); camera.lookAt(0,160,0); camera.updateMatrixWorld();
        this.renderer.setViewport(angle*cellW,kind*cellH,cellW,cellH); this.renderer.setScissor(angle*cellW,kind*cellH,cellW,cellH); this.renderer.setScissorTest(true); this.renderer.render(stage,camera);
      }
      model.removeFromParent(); disposeTree(model);
    });
    this.renderer.setRenderTarget(previousTarget); this.renderer.setViewport(viewport); this.renderer.setScissor(scissor); this.renderer.setScissorTest(scissorTest); this.renderer.setClearColor(clearColor,clearAlpha); this.renderer.autoClear = autoClear; this.renderer.shadowMap.enabled = shadow;
    KINDS.forEach((_,kind) => this.materials.push(new THREE.ShaderMaterial({
      fog: true, uniforms: { ...THREE.UniformsLib.fog, atlas: {value:this.atlas!.texture}, kind: {value:kind}, forestCoverage:{value:this.coverage}, forestGrid:{value:GRID}},
      vertexShader: `varying vec2 vUv; varying vec3 treeOrigin; varying float angle;
#include <fog_pars_vertex>
void main(){
 vec3 origin=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz; treeOrigin=origin;
 vec2 toward=normalize(cameraPosition.xz-origin.xz); vec3 right=vec3(toward.y,0.,-toward.x);
 float scale=length(instanceMatrix[0].xyz); float yaw=atan(instanceMatrix[2].x,instanceMatrix[2].z);
 angle=mod(floor((atan(toward.x,toward.y)-yaw)*1.273239545+8.5),8.);
 vUv=uv; vec3 world=origin+right*position.x*scale+vec3(0.,position.y*scale,0.);
 vec4 mvPosition=viewMatrix*vec4(world,1.); gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`,
      fragmentShader: `uniform sampler2D atlas; uniform float kind; varying vec2 vUv; varying vec3 treeOrigin; varying float angle;
${coverage}
#include <fog_pars_fragment>
void main(){vec4 c=texture2D(atlas,vec2((vUv.x+angle)/8.,(vUv.y+kind)/3.));if(c.a<.45)discard;
float blend=smoothstep(${FOREST_DETAIL_START.toFixed(1)},${FOREST_DETAIL_END.toFixed(1)},distance(cameraPosition,treeOrigin+vec3(0.,160.,0.)));
if(dither()>mix(1.,blend,detailCoverage(treeOrigin.xz)))discard;
gl_FragColor=vec4(c.rgb,1.);
#include <fog_fragment>
#include <colorspace_fragment>
}`,
    })));
  }
  /** Add complementary screen-space fades to the real instanced models. */
  detailMaterial(material: THREE.Material) {
    material.onBeforeCompile = shader => {
      shader.vertexShader = 'varying vec3 forestPosition;\n'+shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
forestPosition=(modelMatrix*instanceMatrix*vec4(position,1.)).xyz;`);
      shader.fragmentShader = 'varying vec3 forestPosition;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
float forestFade=1.-smoothstep(${FOREST_DETAIL_START.toFixed(1)},${FOREST_DETAIL_END.toFixed(1)},distance(cameraPosition,forestPosition));
if(fract(dot(floor(gl_FragCoord.xy),vec2(.754877666,.569840296)))>forestFade)discard;`);
    }; material.needsUpdate = true;
  }
  setReady(cx: number, cy: number, ready: boolean) { if(cx<0||cy<0||cx>=GRID||cy>=GRID)return;this.ready[cy*GRID+cx]=ready?255:0;this.coverage.needsUpdate=true; }
  private install(trees: FrontierTree[], prefix = '') {
    for (let kind=0;kind<3;kind++) {
      const list=trees.filter(t=>t.kind===KINDS[kind]); if(!list.length)continue;
      const geo=new THREE.PlaneGeometry(240,360); geo.translate(0,160,0);
      const mesh=new THREE.InstancedMesh(geo,this.materials[kind],list.length);mesh.name=prefix+'distant-'+KINDS[kind];
      list.forEach((tree,index)=>{this.write(mesh,index,tree,!this.removed.has(tree.id));this.slots.set(tree.id,{mesh,index,tree});const key=`${Math.floor(tree.x/512)},${Math.floor(tree.y/512)}`;if(!tree.id.startsWith('planted:')){const chunk=this.chunks.get(key)||[];chunk.push(tree);this.chunks.set(key,chunk);}});
      mesh.computeBoundingSphere(); this.group.add(mesh);
    }
  }
  private write(mesh:THREE.InstancedMesh,index:number,tree:FrontierTree,visible:boolean) {
    const matrix=new THREE.Matrix4().compose(new THREE.Vector3(tree.x,tree.z,tree.y),new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP,terrainHash(tree.x,tree.y)*Math.PI*2),new THREE.Vector3().setScalar(visible?tree.scale:0));mesh.setMatrixAt(index,matrix);mesh.instanceMatrix.needsUpdate=true;
  }
  update(f:FrontierSnapshot, ground:(tree:FrontierTree)=>boolean, dirty:ReadonlySet<string>) {
    let installed=false;
    if(this.pending){
      installed=true;
      const tiles=new Map<string,FrontierTree[]>();for(const tree of this.pending){const key=`${Math.floor(tree.x/TILE)},${Math.floor(tree.y/TILE)}`;const list=tiles.get(key)||[];list.push(tree);tiles.set(key,list);}this.pending=undefined;
      for(const list of tiles.values())this.install(list);
    }
    const changed=f.revision!==this.stateRevision;const next=changed?new Set(f.harvested):this.removed;
    if(changed)for(const id of new Set([...this.removed,...next]))if(next.has(id)!==this.removed.has(id)){const slot=this.slots.get(id);if(slot)this.write(slot.mesh,slot.index,slot.tree,!next.has(id)&&ground(slot.tree));}
    this.removed=next;
    const groundDirty=installed?new Set([...dirty,...f.terrain.edits.map(e=>`${Math.floor(e[0]/16)},${Math.floor(e[1]/16)}`)]):dirty;
    if(installed)for(const g of f.terrain.grades || []){const r=g[3]+320;for(let a=Math.floor((g[0]-r)/512);a<=Math.floor((g[0]+r)/512);a++)for(let b=Math.floor((g[1]-r)/512);b<=Math.floor((g[1]+r)/512);b++)(groundDirty as Set<string>).add(`${a},${b}`);}
    for(const key of groundDirty)for(const tree of this.chunks.get(key)||[]){const slot=this.slots.get(tree.id);if(slot)this.write(slot.mesh,slot.index,tree,!next.has(tree.id)&&ground(tree));}
    for(const tree of f.planted)if(groundDirty.has(`${Math.floor(tree.x/512)},${Math.floor(tree.y/512)}`)){const slot=this.slots.get(tree.id);if(slot)this.write(slot.mesh,slot.index,tree,ground(tree));}
    const stamp=f.planted.map(t=>`${t.id}:${t.x}:${t.y}:${t.z}`).join(',');
    if(this.materials.length&&stamp!==this.plantedStamp){
      for(const child of [...this.group.children])if(child.name.startsWith('planted-')){(child as THREE.InstancedMesh).geometry.dispose();(child as THREE.InstancedMesh).dispose();child.removeFromParent();}
      for(const id of this.slots.keys())if(id.startsWith('planted:'))this.slots.delete(id);
      this.install(f.planted.filter(ground),'planted-');this.plantedStamp=stamp;
    }
    this.stateRevision=f.revision;
  }
  dispose(){this.disposed=true;this.worker?.terminate();this.atlas?.dispose();this.coverage.dispose();this.materials.forEach(m=>m.dispose());this.group.traverse(o=>{if(o instanceof THREE.InstancedMesh){o.geometry.dispose();o.dispose();}});this.group.removeFromParent();}
}
function disposeTree(model:THREE.Group){const textures=new Set<THREE.Texture>();model.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const v of Object.values(m))if(v instanceof THREE.Texture)textures.add(v);m.dispose();}}});textures.forEach(t=>t.dispose());}
