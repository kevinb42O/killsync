import * as THREE from 'three';
import type { InteractionTarget } from '../multiplayer/FriendsInteractionTargeting';
import type { ToolDamage, ToolFeedback, ToolContact } from '../multiplayer/FriendsToolActions';
import { FRIENDS_BUILD_CATALOG } from '../multiplayer/FriendsBuilding';
import type { FriendsTerrain } from '../world/FriendsTerrain';

const COLORS = { soil: 0x967153, stone: 0x9eaaa5, ore: 0xd6a778, wood: 0xae8154 };
const NORMALS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

/** Deterministic progressive fissures, generated once. Eight stages share an atlas. */
export function createCrackAtlas() {
  const tile = 64, width = tile * 8, data = new Uint8Array(width * tile * 4);
  const paths: Array<Array<[number, number]>> = [];
  let seed = 7391;
  const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  for (let branch = 0; branch < 13; branch++) {
    const points: Array<[number, number]> = [[32, 32]], angle = branch * 2.399;
    let x = 32, y = 32;
    for (let step = 0; step < 7; step++) { x += Math.cos(angle) * 4 + (random() - .5) * 5; y += Math.sin(angle) * 4 + (random() - .5) * 5; points.push([x, y]); }
    paths.push(points);
  }
  for (let stage = 0; stage < 8; stage++) for (let branch = 0; branch < 3 + stage; branch++) {
    const path = paths[branch];
    for (let segment = 1; segment < Math.min(path.length, 3 + stage); segment++) {
      const a = path[segment - 1], b = path[segment], length = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
      for (let step = 0; step <= length; step++) {
        const x = Math.round(a[0] + (b[0] - a[0]) * step / length), y = Math.round(a[1] + (b[1] - a[1]) * step / length);
        if (x < 1 || y < 1 || x >= tile - 1 || y >= tile - 1) continue;
        const i = (y * width + stage * tile + x) * 4;
        data.set([24, 22, 19, 210], i);
        if (stage >= 4) data.set([38, 32, 23, 160], i + 4);
      }
    }
  }
  const texture = new THREE.DataTexture(data, width, tile);
  texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false; texture.needsUpdate = true;
  return texture;
}

/** Selection, cracks and chips use three draws. There are no debris bodies or lights. */
export class FriendsInteractionVisuals {
  readonly group = new THREE.Group();
  private atlas = createCrackAtlas();
  private outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1,1,1)), new THREE.LineBasicMaterial({ color: 0xe4f0d0, transparent: true, opacity: .72 }));
  private crackGeometry = new THREE.PlaneGeometry(1,1);
  private stages = new Float32Array(48);
  private crackStamp='';
  private crackMaterial = new THREE.MeshBasicMaterial({ map: this.atlas, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  private cracks: THREE.InstancedMesh;
  private chipGeometry = new THREE.BoxGeometry(1,1,1);
  private chipMaterial = new THREE.MeshBasicMaterial({ vertexColors: false });
  private chips: THREE.InstancedMesh;
  private births = new Float64Array(96).fill(-Infinity);
  private origins = new Float32Array(96 * 3);
  private velocities = new Float32Array(96 * 3);
  private sizes = new Float32Array(96);
  private chipBirths=new Float32Array(96).fill(-100000);
  private chipTime={value:0};
  private cursor = 0;
  private lastSerial = 0;
  private lastChipAt = -Infinity;
  private matrix = new THREE.Matrix4();
  private position = new THREE.Vector3();
  private scale = new THREE.Vector3();
  private rotation = new THREE.Quaternion();
  private normal = new THREE.Vector3();
  private forward = new THREE.Vector3(0,0,1);
  private color = new THREE.Color();
  private profile: 'full' | 'subtle' | 'off' = 'full';
  private activeChips = 0;
  constructor(scene: THREE.Scene) {
    this.chipGeometry.setAttribute('chipBirth',new THREE.InstancedBufferAttribute(this.chipBirths,1));
    this.chipGeometry.setAttribute('chipVelocity',new THREE.InstancedBufferAttribute(this.velocities,3));
    this.chipMaterial.onBeforeCompile=shader=>{
      shader.uniforms.chipTime=this.chipTime;
      shader.vertexShader='attribute float chipBirth;attribute vec3 chipVelocity;uniform float chipTime;\n'+shader.vertexShader
        .replace('#include <begin_vertex>',`#include <begin_vertex>
          float chipAge=(chipTime-chipBirth)/1000.;float chipAlive=step(0.,chipAge)*(1.-step(.48,chipAge));
          transformed*=max(0.,1.-chipAge/.48)*chipAlive;
          float chipAngle=chipAge*8.;transformed.xy=mat2(cos(chipAngle),-sin(chipAngle),sin(chipAngle),cos(chipAngle))*transformed.xy;`)
        .replace('#include <project_vertex>',`vec4 mvPosition=instanceMatrix*vec4(transformed,1.);
          mvPosition.xyz+=chipVelocity*max(0.,chipAge);mvPosition.y-=140.*max(0.,chipAge)*max(0.,chipAge);
          mvPosition=modelViewMatrix*mvPosition;gl_Position=projectionMatrix*mvPosition;`);
    };
    this.chipMaterial.customProgramCacheKey=()=> 'friends-analytic-chips-v1';
    this.crackGeometry.setAttribute('crackStage', new THREE.InstancedBufferAttribute(this.stages, 1));
    this.crackMaterial.onBeforeCompile = shader => {
      shader.vertexShader = 'attribute float crackStage;\n' + shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv.x=(vMapUv.x+crackStage)/8.;');
    };
    this.crackMaterial.customProgramCacheKey = () => 'friends-crack-atlas-v1';
    this.cracks = new THREE.InstancedMesh(this.crackGeometry, this.crackMaterial, 48);
    this.chips = new THREE.InstancedMesh(this.chipGeometry, this.chipMaterial, 96);
    this.chips.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.cracks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.cracks.frustumCulled = false; this.chips.frustumCulled = false;
    this.cracks.count = 0; this.chips.count = 0; this.outline.visible = false;
    this.group.name = 'friends-interaction-feedback'; this.group.add(this.outline, this.cracks, this.chips); scene.add(this.group);
  }
  setEffects(profile: 'full' | 'subtle' | 'off') { this.profile = profile; }
  private fragment(contact: ToolContact, now: number, index: number) {
    const slot = this.cursor++ % (this.profile === 'subtle' ? 24 : 96), i = slot * 3;
    const noise = (n: number) => Math.sin(contact.serial * 17.31 + index * 7.13 + n * 2.93) * .5 + .5;
    this.lastChipAt = now;this.births[slot] = now;this.chipBirths[slot]=now; this.sizes[slot] = (contact.broken ? 2.5 : 1.5) + noise(1) * 2;
    this.origins.set([contact.x + contact.nx, contact.z + contact.nz, contact.y + contact.ny], i);
    this.velocities.set([(noise(2) - .5) * 70 + contact.nx * 45, 20 + noise(3) * 55 + contact.nz * 30, (noise(4) - .5) * 70 + contact.ny * 45], i);
    this.position.fromArray(this.origins,i);this.rotation.setFromAxisAngle(this.forward,slot);this.scale.setScalar(this.sizes[slot]);this.matrix.compose(this.position,this.rotation,this.scale);this.chips.setMatrixAt(slot,this.matrix);
    this.color.setHex(COLORS[contact.kind]); this.color.multiplyScalar(.7 + noise(5) * .5); this.chips.setColorAt(slot, this.color);
  }
  private face(work: ToolDamage, nx: number, ny: number, nz: number, width = 32, height = 32) {
    const slot = this.cracks.count++;
    if (work.tree || work.pieceId !== undefined) this.position.set(work.x + nx * .18, work.z + nz * .18, work.y + ny * .18);
    else this.position.set((work.vx! + .5) * 32 + nx * 16.035, (work.vz! + .5) * 32 + nz * 16.035, (work.vy! + .5) * 32 + ny * 16.035);
    this.normal.set(nx, nz, ny); this.rotation.setFromUnitVectors(this.forward, this.normal); this.scale.set(width, height, 1);
    this.matrix.compose(this.position, this.rotation, this.scale); this.cracks.setMatrixAt(slot, this.matrix);
    this.stages[slot] = Math.max(0, Math.min(7, Math.ceil(work.value / work.total * 8) - 1));
  }
  update(target: InteractionTarget | undefined, feedback: ToolFeedback | undefined, terrain: FriendsTerrain, localId: string, now: number, viewer?: {x:number;y:number;z:number}) {
    this.outline.visible = Boolean(target);
    if (target) {
      const g = target.ground, tree = target.tree, piece=target.piece, def=piece&&FRIENDS_BUILD_CATALOG[piece.shape];
      this.outline.position.set(g ? (g.vx + .5 + (target.fill ? g.nx : 0)) * 32 : tree ? tree.x : piece?piece.x:target.x,
        g ? (g.vz + .5 + (target.fill ? g.nz : 0)) * 32 : tree ? Math.max(tree.z + 20, Math.min(tree.z + 160, target.z)) : piece?piece.z+def!.h/2:target.z,
        g ? (g.vy + .5 + (target.fill ? g.ny : 0)) * 32 : tree ? tree.y : piece?piece.y:target.y);
      this.outline.scale.set(tree ? 38 * tree.scale : def?def.w:32.08, tree ? 44 : def?def.h:32.08, tree ? 38 * tree.scale : def?def.d:32.08);this.outline.rotation.y=piece?-piece.rotation*Math.PI/2:0;
      (this.outline.material as THREE.LineBasicMaterial).color.setHex(target.valid ? 0xe5edd0 : 0xe4a36c);
    }
    const ordered = [...(feedback?.damage || [])].sort((a,b) => Number(b.id === target?.id) - Number(a.id === target?.id));
    const visible=ordered.filter(work=>work.until>now&&Math.hypot(work.x-(viewer?.x??target?.x??work.x),work.y-(viewer?.y??target?.y??work.y))<=700).slice(0,8);
    const stamp=terrain.revision+':'+visible.map(w=>[w.id,w.value,w.total,w.x,w.y,w.z,w.nx,w.ny,w.nz].join(',')).join(';');
    if(stamp!==this.crackStamp){
      this.crackStamp=stamp;this.cracks.count=0;
      for(const work of visible){
        if(work.tree){this.face(work,work.nx,work.ny,work.nz,35*work.tree.scale,55);continue;}
        if(work.pieceId!==undefined){this.face(work,work.nx,work.ny,work.nz,24,24);continue;}
        if(work.vx===undefined||!terrain.material(work.vx,work.vy!,work.vz!))continue;
        for(const [nx,ny,nz]of NORMALS)if(!terrain.exposedMaterial(work.vx+nx,work.vy!+ny,work.vz!+nz))this.face(work,nx,ny,nz);
      }
      if(this.cracks.count){this.cracks.instanceMatrix.needsUpdate=true;this.crackGeometry.getAttribute('crackStage').needsUpdate=true;}
    }
    const contacts: ToolContact[] = [];
    for (const contact of feedback?.contacts || []) {
      if (contact.serial <= this.lastSerial) continue;
      this.lastSerial = contact.serial;
      if (now - contact.at > 500) continue;
      contacts.push(contact);
      if (this.profile !== 'off' && (!viewer||Math.hypot(contact.x-viewer.x,contact.y-viewer.y,contact.z-viewer.z)<700)) for (let i = 0; i < (contact.broken ? 14 : 4); i++) this.fragment(contact, now, i);
    }
    this.activeChips = 0;this.chipTime.value=now;
    let highest = -1;
    if(now-this.lastChipAt>=480||this.profile==='off'){this.chips.count=0;return contacts;}
    for (let slot = 0; slot < (this.profile==='subtle'?24:96); slot++) {
      const age=now-this.births[slot];if(age>=0&&age<480){this.activeChips++;highest=slot;}
    }
    this.chips.count=highest+1;
    if(contacts.length){this.chips.instanceMatrix.needsUpdate=true;this.chipGeometry.getAttribute('chipBirth').needsUpdate=true;this.chipGeometry.getAttribute('chipVelocity').needsUpdate=true;if(this.chips.instanceColor)this.chips.instanceColor.needsUpdate=true;}

    return contacts;
  }
  get stats() { return { fragments: this.activeChips, crackFaces: this.cracks.count, draws: Number(this.outline.visible) + Number(this.cracks.count > 0) + Number(this.chips.count > 0) }; }
  dispose() { this.group.removeFromParent(); this.outline.geometry.dispose(); (this.outline.material as THREE.Material).dispose(); this.cracks.dispose(); this.chips.dispose(); this.crackGeometry.dispose(); this.chipGeometry.dispose(); this.crackMaterial.dispose(); this.chipMaterial.dispose(); this.atlas.dispose(); }
}
