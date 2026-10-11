import { applyCraneMotion } from './FriendsTelescopicCrane';
import { durableBuildPieces } from './FriendsAssemblyPose';
import { craneTopologyError } from './FriendsCraneAssemblies';
import { isFriendsFinish, isFriendsShape, resolveFriendsBuildPieces } from './FriendsBuilding';
import { isFrontierSave } from './FriendsFrontier';
import { scenicVehicles } from './FriendsScenicService';
import type { CoopSnapshot } from './CoopSimulation';
import { friendsRandomId } from './FriendsCrewIdentity';
import type { FriendsSnapshot } from './FriendsExpedition';

type Durable = Pick<FriendsSnapshot, 'building'|'frontier'|'progress'|'projects'>;
type Patch = { value?: unknown; object?: Record<string,Patch>; array?: Record<string,Patch>; length?:number; remove?:string[] };
export function worldDiff(a:unknown,b:unknown):Patch|undefined {
  if(a===b)return;
  if(Array.isArray(a)&&Array.isArray(b)) { const array:Record<string,Patch>={}; for(let i=0;i<b.length;i++){const p=i>=a.length&&b[i]===undefined?{value:null}:worldDiff(a[i],b[i]);if(p)array[i]=p;} return Object.keys(array).length||a.length!==b.length?{array,length:b.length}:undefined; }
  if(a && b && typeof a==='object' && typeof b==='object' && !Array.isArray(a) && !Array.isArray(b)) {
    const object:Record<string,Patch>={}, remove:string[]=[];
    // JSON drops undefined object fields. Encode cleared links as removals,
    // otherwise {value:undefined} becomes {} and retains the old attachment.
    for(const [k,v] of Object.entries(b)){if(v===undefined)continue;const p=worldDiff((a as any)[k],v);if(p)object[k]=p;}
    for(const k of Object.keys(a))if(!Object.hasOwn(b,k)||(b as any)[k]===undefined)remove.push(k);
    return Object.keys(object).length||remove.length?{object,remove}:undefined;
  }
  // JSON serializes undefined array entries as null.
  return {value:b===undefined?null:b};
}
export function worldPatch(a:unknown,p:Patch|undefined,depth=0):any {
  if(depth>64)throw new Error('World patch is too deep');
  if(!p)return a;if(Object.hasOwn(p,'value'))return p.value;
  if(p.array){
    if(!Number.isSafeInteger(p.length)||p.length!<0||p.length!>16384)throw new Error('Invalid world array');
    const out=Array.isArray(a)?a.slice(0,p.length):[];out.length=p.length!;
    for(const [i,v] of Object.entries(p.array)){const index=Number(i);if(!Number.isSafeInteger(index)||index<0||index>=p.length!)throw new Error('Invalid world index');out[index]=worldPatch(out[index],v,depth+1);}return out;
  }
  const out={...(a&&typeof a==='object'?a:{})};for(const k of p.remove||[])delete out[k];for(const [k,v] of Object.entries(p.object||{})){if(k==='__proto__'||k==='constructor'||k==='prototype')throw new Error('Invalid world key');out[k]=worldPatch(out[k],v,depth+1);}return out;
}
const MAGIC=0x46575231, HEADER=24, CHUNK=10000, MAX=4_000_000;
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
function checksum(bytes:Uint8Array){let n=2166136261;for(const b of bytes)n=Math.imul(n^b,16777619);return n>>>0;}
export function friendsWorldPackets(text:string,serial:number):ArrayBuffer[]{
  const bytes=encoder.encode(text);if(bytes.length>MAX)throw new Error('Island state exceeds the supported transfer size. Export a backup.');
  const count=Math.ceil(bytes.length/CHUNK),sum=checksum(bytes);
  return Array.from({length:count},(_,i)=>{const part=bytes.subarray(i*CHUNK,(i+1)*CHUNK),p=new ArrayBuffer(HEADER+part.length),v=new DataView(p);v.setUint32(0,MAGIC);v.setFloat64(4,serial);v.setUint16(12,i);v.setUint16(14,count);v.setUint32(16,bytes.length);v.setUint32(20,sum);new Uint8Array(p,HEADER).set(part);return p;});
}
export class FriendsWorldAssembler {
  private serial=-1; private parts=new Map<number,Uint8Array>();private bytes=0;private sum=0;private at=0;
  push(p:ArrayBuffer,now:number):string|undefined {
    if(p.byteLength<=HEADER||p.byteLength>HEADER+CHUNK)return;
    const v=new DataView(p),serial=v.getFloat64(4),index=v.getUint16(12),count=v.getUint16(14),bytes=v.getUint32(16),sum=v.getUint32(20);
    if(v.getUint32(0)!==MAGIC||!Number.isSafeInteger(serial)||serial<0||serial<this.serial||bytes>MAX||bytes<1||count!==Math.ceil(bytes/CHUNK)||index>=count||p.byteLength-HEADER!==Math.min(CHUNK,bytes-index*CHUNK))return;
    if(serial>this.serial || now-this.at>60000){this.serial=serial;this.parts.clear();this.bytes=bytes;this.sum=sum;this.at=now;}
    if(this.bytes!==bytes||this.sum!==sum)return;this.at=now;this.parts.set(index,new Uint8Array(p,HEADER).slice());
    if(this.parts.size!==count)return;const joined=new Uint8Array(bytes);for(const [i,b]of this.parts)joined.set(b,i*CHUNK);this.parts.clear();
    if(checksum(joined)!==sum)return;try{return decoder.decode(joined);}catch{return;}
  }
  get progress(){return this.bytes?Math.min(1,this.parts.size*CHUNK/this.bytes):0;}
}
function durable(snapshot:CoopSnapshot):Durable {
  const f=snapshot.friends!;
  const {feedback:_feedback,damage:_damage,interaction:_interaction,...frontier}=f.frontier!;
  return {building:f.building&&{...f.building,pieces:durableBuildPieces(f.building.pieces)},frontier:{...frontier,feedback:{}},progress:f.progress,projects:f.projects};
}
type Baseline={revision:number;world:Durable};
type Flight=Baseline&{packets:ArrayBuffer[];next:number;at:number};
export class FriendsWorldHost {
  epoch=friendsRandomId();private serial=0;private revision=0;private latest?:Baseline;private stamp='';
  private peers=new Map<string,{ack?:Baseline;flight?:Flight}>();private tokens=20048;private tokenAt=0;private cursor=0;
  reset(){this.epoch=friendsRandomId();this.latest=undefined;this.stamp='';this.peers.clear();}
  remove(peerId:string){this.peers.delete(peerId);}
  request(peerId:string){this.peers.set(peerId,{});}
  acknowledge(peerId:string,epoch:string,revision:number){const p=this.peers.get(peerId);if(epoch===this.epoch&&p?.flight?.revision===revision){p.ack={revision,world:p.flight.world};p.flight=undefined;}}
  update(snapshot:CoopSnapshot){
    const f=snapshot.friends!;const stamp=JSON.stringify([f.building?.revision,f.frontier?.revision,f.frontier?.terrain.revision,f.progress,f.projects]);
    if(stamp===this.stamp)return;this.stamp=stamp;this.latest={revision:++this.revision,world:durable(snapshot)};
  }
  pump(peerIds:string[],now:number,send:(peerId:string,packet:ArrayBuffer)=>boolean,onError:(message:string)=>void){
    if(!this.latest||!peerIds.length)return;this.tokens=Math.min(30072,this.tokens+Math.max(0,now-this.tokenAt)*128);this.tokenAt=now;
    const ordered=peerIds.slice(this.cursor).concat(peerIds.slice(0,this.cursor));this.cursor=(this.cursor+1)%peerIds.length;
    for(const peerId of ordered){let p=this.peers.get(peerId);if(!p){p={};this.peers.set(peerId,p);}
      if(p.flight&&p.flight.next===p.flight.packets.length&&now-p.flight.at>15000){p.flight.next=0;p.flight.at=now;}
      if(!p.flight && p.ack?.revision!==this.latest.revision){
        const envelope={schema:1,epoch:this.epoch,revision:this.latest.revision,base:p.ack?.revision,world:p.ack?undefined:this.latest.world,patch:p.ack?worldDiff(p.ack.world,this.latest.world):undefined};
        try{p.flight={...this.latest,packets:friendsWorldPackets(JSON.stringify(envelope),++this.serial),next:0,at:now};}catch(e){onError((e as Error).message);continue;}
      }
      const flight=p.flight;if(!flight)continue;
      while(flight.next<flight.packets.length){const packet=flight.packets[flight.next];if(packet.byteLength>this.tokens||!send(peerId,packet))break;this.tokens-=packet.byteLength;flight.next++;if(flight.next===flight.packets.length)flight.at=now;}
    }
  }
  motion(peerId:string,snapshot:CoopSnapshot):unknown {
    const ack=this.peers.get(peerId)?.ack;if(!ack)return undefined;
    // Save-only transport duplicates the live aircraft, railway and cargo.
    // Scenic car poses are deterministic from the shared route and distance.
    const {building:_b,frontier:_f,progress:_p,projects:_j,transport:_t,...motion}=snapshot.friends!;
    const vehicles=motion.scenicRailway?motion.vehicles.filter(v=>!v.scenic):motion.vehicles;
    const feedback=snapshot.friends!.frontier?.interaction;
    const interaction=feedback&&{...feedback,contacts:feedback.contacts.filter(c=>c.broken||snapshot.elapsedMs-c.at<350).map(c=>c.broken?c:{...c,tree:undefined})};
    return {format:'friends_motion_v1',epoch:this.epoch,revision:ack.revision,snapshot:{...snapshot,friends:{...motion,vehicles}},feedback:snapshot.friends!.frontier?.feedback,damage:snapshot.friends!.frontier?.damage,interaction};
  }
}
export class FriendsWorldGuest {
  readonly assembler=new FriendsWorldAssembler();epoch='';private revision=-1;private world?:Durable;
  constructor(private control:(message:unknown)=>void,private installed:()=>void){}
  receive(packet:ArrayBuffer,now:number){
    const text=this.assembler.push(packet,now);if(!text)return;
    try{const m=JSON.parse(text);if(m.schema!==1||typeof m.epoch!=='string'||!Number.isSafeInteger(m.revision)||m.revision<0)return;
      if(m.epoch===this.epoch&&m.revision<=this.revision){this.control({kind:'ack',epoch:this.epoch,revision:this.revision});return;}
      if(m.patch&&(!this.world||m.epoch!==this.epoch||m.base!==this.revision)){this.control({kind:'request'});return;}
      const world=m.world||worldPatch(this.world,m.patch);
      if(!world?.building||!Array.isArray(world.building.pieces)||world.building.pieces.length>1024||!Number.isSafeInteger(world.building.revision)||typeof world.building.guestsCanBuild!=='boolean'||!isFrontierSave(world.frontier)||!world.progress||!world.building.pieces.every((p:any)=>Number.isSafeInteger(p.id)&&isFriendsShape(p.shape)&&isFriendsFinish(p.finish)&&['x','y','z','rotation'].every(k=>Number.isFinite(p[k]))&&Number.isInteger(p.rotation)&&p.rotation>=0&&p.rotation<=3))throw new Error('Invalid island baseline');
      if(craneTopologyError(world.building.pieces))throw new Error('Invalid crane topology');
      const changed=this.epoch!==m.epoch;this.epoch=m.epoch;this.revision=m.revision;this.world=world;
      if(changed)this.installed();this.control({kind:'ack',epoch:this.epoch,revision:this.revision});
    }catch{this.control({kind:'request'});}
  }
  decode(value:unknown):CoopSnapshot|undefined {
    const m=value as any;if(m?.format!=='friends_motion_v1'||m.epoch!==this.epoch||!this.world||m.revision>this.revision)return;
    const motion=m.snapshot.friends;
    // The host appends the shared skiff after the scenic train. Reconstruct
    // that same order when expanding the compact train motion on guests.
    const vehicles=motion.scenicRailway?[...motion.vehicles.filter(v=>v.kind!=='rowboat'),...scenicVehicles(motion.scenicRailway.distance),...motion.vehicles.filter(v=>v.kind==='rowboat')]:motion.vehicles;
    return {...m.snapshot,friends:{...motion,vehicles,...this.world,building:this.world.building&&{...this.world.building,pieces:applyCraneMotion(resolveFriendsBuildPieces(this.world.building.pieces,vehicles||[],new Map((motion.hauling?.cranes??[]).filter((c:any)=>c.angle!==undefined).map((c:any)=>[c.pieceId,c.angle]))),motion.hauling?.cranes)},frontier:{...this.world.frontier,feedback:m.feedback||{},damage:m.damage,interaction:m.interaction}}};
  }
}
