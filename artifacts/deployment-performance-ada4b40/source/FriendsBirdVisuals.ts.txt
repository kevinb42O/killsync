import * as THREE from 'three';
import type { BirdsSnapshot, FriendlyBird } from '../multiplayer/FriendsBirds';
import { SEEDS_TOOL, SEED_PATCH_MS } from '../multiplayer/FriendsBirds';
import type { CoopPlayerSnapshot } from '../multiplayer/CoopSimulation';
import { acquireEquipmentLighting, frameHeldEquipment, loadFriendsGrip } from './FriendsHeldEquipment';
import { FriendsBirdAudio } from '../FriendsBirdAudio';

type BirdRig={root:THREE.Group;head:THREE.Group;wings:THREE.Group[];tail:THREE.Mesh;phase:string;variant:number;fire:THREE.Group;hearts:THREE.Group;perchWorld?:THREE.Vector3;departure?:{from:THREE.Vector3;scale:number}};
const palettes=[['#766657','#e99c66','#f1dab0'],['#658b9f','#e8ca71','#ebe6d3'],['#8b775d','#dcc8a4','#efe5d0']];
function createHeartGeometry(){
  const shape=new THREE.Shape();shape.moveTo(0,-1);
  shape.bezierCurveTo(-.35,-.65,-1.1,-.15,-1.1,.45);shape.bezierCurveTo(-1.1,1.2,-.35,1.4,0,.65);
  shape.bezierCurveTo(.35,1.4,1.1,1.2,1.1,.45);shape.bezierCurveTo(1.1,-.15,.35,-.65,0,-1);
  return new THREE.ShapeGeometry(shape,12);
}

/** Tiny robins, blue tits and sparrows share geometry and articulated wings. */
export class FriendsBirdVisuals {
  readonly group=new THREE.Group();
  readonly held=new THREE.Group();
  private sphere=new THREE.SphereGeometry(1,14,10);
  private feather=new THREE.SphereGeometry(1,10,7);
  private cone=new THREE.ConeGeometry(1,2,8);
  private seedGeometry=new THREE.SphereGeometry(1,6,4).scale(.7,1,.55);
  private heartGeometry=createHeartGeometry();
  private seedMaterial=new THREE.MeshStandardMaterial({color:'#d6ba76',roughness:.95});
  private seedDark=new THREE.MeshStandardMaterial({color:'#897045',roughness:.95});
  private dark=new THREE.MeshStandardMaterial({color:'#252921',roughness:.7});
  private beak=new THREE.MeshStandardMaterial({color:'#b5a079',roughness:.8});
  private flame=new THREE.MeshBasicMaterial({color:'#ff7c20',transparent:true,opacity:.8,depthWrite:false,blending:THREE.AdditiveBlending});
  private flameCore=new THREE.MeshBasicMaterial({color:'#fff09b',transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending});
  private white=new THREE.MeshStandardMaterial({color:'#fff6df',roughness:.55});
  private colors=palettes.map(p=>p.map(color=>new THREE.MeshStandardMaterial({color,roughness:.87})));
  private audio=new FriendsBirdAudio();
  private birds=new Map<number,BirdRig>();
  private seeds=new THREE.InstancedMesh(this.seedGeometry,this.seedMaterial,200);
  private palm=new THREE.Group();
  private perchAnchor=new THREE.Object3D();
  private perchWorld=new THREE.Vector3();
  private arm?:THREE.Mesh;
  private matrix=new THREE.Matrix4();
  private point=new THREE.Vector3();
  private scale=new THREE.Vector3();
  private turn=new THREE.Quaternion();
  private axis=new THREE.Vector3(0,1,0);
  private cameraPoint=new THREE.Vector3();
  private cameraRotation=new THREE.Quaternion();
  private heartRotation=new THREE.Quaternion();
  private camera?:THREE.PerspectiveCamera;
  private lighting:ReturnType<typeof acquireEquipmentLighting>;
  private disposed=false;
  constructor(scene:THREE.Scene,viewmodel:THREE.Scene){
    this.group.name='friends-birds';scene.add(this.group);this.held.name='seeds-in-your-hand';this.held.visible=false;
    const parent=viewmodel.getObjectByProperty('type','PerspectiveCamera')||viewmodel;if(parent instanceof THREE.PerspectiveCamera)this.camera=parent;parent.add(this.held);
    this.held.add(this.palm);this.perchAnchor.position.set(0,.097,0);this.held.add(this.perchAnchor);this.lighting=acquireEquipmentLighting(viewmodel);
    for(let i=0;i<12;i++){const seed=new THREE.Mesh(this.seedGeometry,i%3?this.seedMaterial:this.seedDark);seed.position.set(Math.sin(i*2.4)*.052,.082+Math.floor(i/6)*.006,Math.cos(i*2.4)*.045);seed.scale.set(.009,.016,.009);seed.rotation.set(.6,i*1.8,.3);this.palm.add(seed);}
    void loadFriendsGrip('right','inward').then(arm=>{if(this.disposed)return;this.arm=arm.clone();this.held.add(this.arm);}).catch(()=>{});
    this.seeds.frustumCulled=false;this.seeds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(this.seeds);
  }
  private rig(id:number,variant:number){
    let rig=this.birds.get(id);if(rig)return rig;
    const root=new THREE.Group(),head=new THREE.Group(),wings:THREE.Group[]=[],[back,breast,cream]=this.colors[variant%3];root.name='friendly-bird-'+id;
    const part=(geometry:THREE.BufferGeometry,material:THREE.Material,scale:number[],position:number[],owner:THREE.Object3D=root)=>{const mesh=new THREE.Mesh(geometry,material);mesh.scale.fromArray(scale);mesh.position.fromArray(position);owner.add(mesh);return mesh;};
    part(this.sphere,back,[3.2,4,5.2],[0,5,0]);part(this.sphere,breast,[2.6,3.2,2.9],[0,4.9,-2]);part(this.sphere,cream,[2.1,2.3,2.5],[0,3.6,-1.8]);
    head.position.set(0,8,-2.8);root.add(head);part(this.sphere,back,[2.55,2.5,2.55],[0,0,0],head);part(this.sphere,breast,[2.2,1.55,1.8],[0,-.7,-1.1],head);
    if(variant===1)part(this.sphere,cream,[2.5,1.1,1.3],[0,-.1,-1.25],head);
    const bill=part(this.cone,this.beak,[.7,1.25,.7],[0,-.35,-3],head);bill.rotation.x=-Math.PI/2;
    for(const side of [-1,1]){
      part(this.sphere,this.dark,[.48,.52,.4],[side*2.05,.35,-1.2],head);part(this.sphere,this.white,[.12,.13,.10],[side*2.26,.50,-1.42],head);
      const wing=new THREE.Group();wing.position.set(side*2.2,6,.3);root.add(wing);wings.push(wing);
      part(this.feather,back,[1.0,2.9,4.1],[side*.5,-1.0,1.1],wing).rotation.z=side*.2;
      for(let f=0;f<3;f++)part(this.feather,variant===1?cream:breast,[.22,1.4,2.9],[side*.95,-1.4+f*.65,1.5+f*.25],wing).rotation.x=.08;
      part(this.feather,this.beak,[.28,1.6,.28],[side*1.25,1.3,0]);
      for(let toe=0;toe<3;toe++)part(this.feather,this.beak,[.16,.18,1.2],[side*1.25+(toe-1)*.48,.12,-.65]).rotation.y=(toe-1)*.30;
    }
    const tail=part(this.feather,back,[1.9,.60,4.2],[0,4.5,5.5]);tail.rotation.x=-.22;
    const fire=new THREE.Group();fire.name='bird-flames';fire.visible=false;root.add(fire);
    for(let i=0;i<5;i++){const flame=new THREE.Mesh(this.cone,i%2?this.flameCore:this.flame);flame.position.set(Math.sin(i*2.4)*2,7+i%2,Math.cos(i*2.4)*3);flame.scale.set(1.6,5+i%3,1.6);fire.add(flame);}
    const hearts=new THREE.Group();hearts.name='happy-bird-hearts';hearts.visible=false;root.add(hearts);
    for(const color of ['#ff8eb8','#ffb3cf','#ff639d'])hearts.add(new THREE.Mesh(this.heartGeometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide})));
    rig={root,head,wings,tail,phase:'',variant,fire,hearts};this.birds.set(id,rig);this.group.add(root);return rig;
  }
  private animate(r:BirdRig,b:FriendlyBird,now:number){
    const flying=b.phase==='approach'||b.phase==='leaving',phase=(now-b.atMs)*.001;
    const flap=flying?Math.sin(now*.045+b.id)*1.05:Math.sin(now*.006+b.id)*.025;
    r.wings[0].rotation.z=flying?-.65-flap:-.10;r.wings[1].rotation.z=flying?.65+flap:.10;
    r.wings[0].rotation.x=r.wings[1].rotation.x=flying?-.25:0;
    const peck=b.phase==='feeding'&&Math.sin(phase*2.7)>.05?Math.max(0,Math.sin(phase*15))*.85:0;
    r.head.rotation.x=-peck;r.head.position.y=8-peck*4.8;r.head.position.z=-2.8-peck*1.4;r.head.rotation.y=flying?0:Math.sin(phase*3.1+b.id)*.16;
    r.fire.visible=Boolean(b.burningUntil&&now<b.burningUntil);
    if(r.fire.visible)for(let i=0;i<r.fire.children.length;i++){const f=r.fire.children[i];f.scale.y=(5+i%3)*(1+Math.sin(now*.035+i*2.3)*.28);f.rotation.z=Math.sin(now*.02+i)*.12;}
    r.tail.rotation.x=-.22+Math.sin(now*.007+b.id)*.05;
    r.root.rotation.z=flying?Math.sin(now*.006+b.id)*.07:0;
    r.hearts.visible=Boolean(b.ownerId&&!r.fire.visible&&(b.phase==='perched'||b.phase==='feeding'&&now-b.atMs>900));
    if(r.hearts.visible){
      // Face the viewer in both the world and the hand's foreground pass.
      r.root.getWorldQuaternion(this.heartRotation).invert().multiply(this.cameraRotation);
      const elapsed=Math.max(0,now-b.atMs-(b.phase==='feeding'?900:0));
      for(let i=0;i<r.hearts.children.length;i++){
        const heart=r.hearts.children[i] as THREE.Mesh<THREE.ShapeGeometry,THREE.MeshBasicMaterial>,age=(elapsed-i*650)%6500,t=age/2600;
        heart.visible=age>=0&&t<1;
        if(!heart.visible)continue;
        const pop=THREE.MathUtils.smoothstep(t,0,.16),fade=1-THREE.MathUtils.smoothstep(t,.55,1);
        heart.position.set((i-1)*3+Math.sin(t*5+i)*.6,13+t*9,.5);
        heart.quaternion.copy(this.heartRotation);heart.rotateZ(Math.sin(t*5+i)*.14);
        heart.scale.setScalar((1.4+i*.18)*pop*(1+Math.sin(t*Math.PI)*.16));heart.material.opacity=.9*pop*fade;
      }
    }
  }
  update(state:BirdsSnapshot|undefined,players:readonly CoopPlayerSnapshot[],localId:string,tool:number,camera:THREE.Camera,now:number,firstPerson:boolean,blocked:boolean,handPoint:(id:string,out:THREE.Vector3)=>boolean,project?:(point:THREE.Object3D)=>{x:number;y:number;z:number}){
    this.audio.update(state?.birds??[],camera,now,localId);
    camera.getWorldPosition(this.cameraPoint);camera.getWorldQuaternion(this.cameraRotation);const hand=state?.equipped.find(h=>h.playerId===localId);
    this.held.visible=Boolean(firstPerson&&!blocked&&tool===SEEDS_TOOL&&hand);this.lighting.setVisible(this.held.visible);
    if(this.held.visible&&hand){
      frameHeldEquipment(this.held,this.camera);this.held.position.x*=hand.holding?.38:.65;this.held.position.y+=hand.holding?.23:.1;
      this.held.rotation.set(hand.holding?-.18:.12,hand.holding?-.20:0,-.1);
      const toss=hand.scatterAt===undefined?1:Math.min(1,(now-hand.scatterAt)/500);this.held.rotation.x-=Math.sin(toss*Math.PI)*(1-toss)*.8;
      for(let i=0;i<this.palm.children.length;i++)this.palm.children[i].visible=i<Math.ceil(hand.amount*12);
    }
    const active=new Set<number>();
    for(const b of state?.birds??[]){
      if(now<b.atMs)continue;active.add(b.id);const r=this.rig(b.id,b.variant),local=b.ownerId===localId&&firstPerson&&(b.phase==='feeding'||b.phase==='perched')&&this.held.visible;
      if(local){if(project){const p=project(this.perchAnchor);(r.perchWorld??=new THREE.Vector3()).set(p.x,p.y,p.z);}r.departure=undefined;if(r.root.parent!==this.held)this.held.add(r.root);r.root.position.set(0,.097,0);r.root.scale.setScalar(.028);r.root.rotation.y=Math.PI+.3;}
      else{
        if(b.ownerId===localId&&firstPerson&&b.phase==='leaving'&&r.phase!=='leaving'&&r.perchWorld)r.departure={from:r.perchWorld.clone(),scale:.028*this.cameraPoint.distanceTo(r.perchWorld)};
        if(r.root.parent!==this.group)this.group.add(r.root);r.root.scale.setScalar(1);r.root.position.set(b.x,b.z,b.y);r.root.rotation.y=Math.PI/2-b.angle;
        if(r.departure&&b.phase==='leaving'){
          const t=THREE.MathUtils.clamp((now-b.atMs)/2500,0,1),smooth=t*t*(3-2*t);this.point.set(b.target.x,b.target.z,b.target.y);
          r.root.position.lerpVectors(r.departure.from,this.point,smooth);r.root.scale.setScalar(THREE.MathUtils.lerp(r.departure.scale,1,Math.min(1,t*3)));
        }
        if(b.ownerId===localId&&firstPerson&&this.held.visible&&project&&b.phase==='approach'){
          const t=Math.min(1,Math.max(0,((now-b.atMs)/2200-.65)/.35)),p=project(this.perchAnchor);this.perchWorld.set(p.x,p.y,p.z);
          r.root.position.lerp(this.perchWorld,t*t*(3-2*t));r.root.scale.setScalar(THREE.MathUtils.lerp(1,.028*this.cameraPoint.distanceTo(this.perchWorld),t));
        }
        if(b.ownerId&&(b.phase==='feeding'||b.phase==='perched')&&handPoint(b.ownerId,this.point)){r.root.position.copy(this.point);r.root.position.y+=2;}
        if(!b.ownerId&&(b.phase==='feeding'||b.phase==='perched')){const hop=Math.max(0,Math.sin((now-b.atMs)*.004+b.id));if(hop>.85)r.root.position.y+=(hop-.85)*14;}
      }
      this.animate(r,b,now);
      r.phase=b.phase;
    }
    for(const [id,r]of this.birds)if(!active.has(id)){r.root.removeFromParent();this.disposeHearts(r);this.birds.delete(id);}
    let count=0;
    for(const patch of state?.patches??[]){
      const t=Math.min(1,Math.max(0,(now-patch.atMs)/650)),fade=Math.min(1,(SEED_PATCH_MS-(now-patch.atMs))/3000);
      for(let i=0;i<Math.ceil(patch.amount*12);i++){
        const angle=i*2.4+patch.id,radius=5+(i%5)*3,x=patch.x+Math.cos(angle)*radius,y=patch.y+Math.sin(angle)*radius;
        this.point.set(THREE.MathUtils.lerp(patch.from.x,x,t),THREE.MathUtils.lerp(patch.from.z,patch.z,t)+Math.sin(t*Math.PI)*20,THREE.MathUtils.lerp(patch.from.y,y,t));
        this.scale.set(.7*fade,1.2*fade,.7*fade);this.turn.setFromAxisAngle(this.axis,angle);this.matrix.compose(this.point,this.turn,this.scale);this.seeds.setMatrixAt(count++,this.matrix);
      }
    }
    // Peers see the same little pile of seeds on the posed palm.
    for(const h of state?.equipped??[]){
      if(h.playerId===localId&&firstPerson||h.amount<=0)continue;
      const p=players.find(p=>p.id===h.playerId);if(!p||!handPoint(p.id,this.point))continue;
      const center=this.point.clone();
      for(let i=0;i<Math.ceil(h.amount*8)&&count<200;i++){this.point.copy(center);this.point.x+=Math.sin(i*2.4)*1.6;this.point.z+=Math.cos(i*2.4)*1.4;this.point.y+=2.6;this.scale.set(.35,.55,.35);this.matrix.compose(this.point,this.turn,this.scale);this.seeds.setMatrixAt(count++,this.matrix);}
    }
    this.seeds.count=count;this.seeds.visible=count>0;if(count)this.seeds.instanceMatrix.needsUpdate=true;
  }
  private disposeHearts(r:BirdRig){for(const heart of r.hearts.children)(heart as THREE.Mesh<THREE.ShapeGeometry,THREE.MeshBasicMaterial>).material.dispose();}
  dispose(){this.disposed=true;this.audio.dispose();this.group.removeFromParent();this.held.removeFromParent();for(const r of this.birds.values())this.disposeHearts(r);this.birds.clear();for(const g of [this.sphere,this.feather,this.cone,this.seedGeometry,this.heartGeometry])g.dispose();for(const m of [this.seedMaterial,this.seedDark,this.dark,this.beak,this.white,this.flame,this.flameCore,...this.colors.flat()])m.dispose();this.lighting.dispose();}
}
