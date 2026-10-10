import * as THREE from 'three';
import type { CoopPlayerSnapshot } from '../multiplayer/CoopSimulation';
import { CAMPFIRE_SEATS, isCampfireSeat } from '../multiplayer/FriendsCampfireSeats';
import { resolveFriendsBuildCollisions, type FriendsBuildPiece } from '../multiplayer/FriendsBuilding';
import { FRIENDS_CAMPFIRE } from '../world/FriendsRegion';
import type { FriendsTerrain } from '../world/FriendsTerrain';
import { friendsWaterAt } from '../world/FriendsWaterSurface';
import { frontierTrees, type FrontierSnapshot, type FrontierTree } from '../multiplayer/FriendsFrontier';
import { FriendsResidentPath, smoothResidentPath, type ResidentPoint } from './FriendsResidentNavigation';
import { createFriendsCharacterRig, disposeFriendsCharacterRig, friendsCharacterHandPoint, placeFriendsCharacter, updateFriendsCharacter } from './FriendsCharacterVisuals';
import { createMarshmallowGeometry } from './FriendsMarshmallowVisuals';
import type { CoopChatMessage } from '../multiplayer/CoopChat';
import type { PlayerVisualRig } from './coopOperatorVisuals';
import { RESIDENT_DIALOGUE, type ResidentConversation } from './FriendsResidentDialogue';

const RESIDENTS = [
  { name: 'Pip', color: '#fbbf24', x:5808, y:5808 },
  { name: 'Moss', color: '#34d399', x:6096, y:5984 },
  { name: 'Sunny', color: '#f472b6', x:6400, y:5360 },
  { name: 'Wren', color: '#a78bfa', x:6848, y:5760 },
] as const;
const PLACES = [
  {x:5808,y:5808,purpose:'arrival',look:Math.PI/2}, {x:5808,y:5616,purpose:'view',look:Math.PI},
  {x:6000,y:5808,purpose:'arrival',look:Math.PI}, {x:6096,y:5984,purpose:'woods',look:-Math.PI/2},
  {x:6240,y:5744,purpose:'meadow',look:0}, {x:6368,y:5408,purpose:'woods',look:-Math.PI/2},
  {x:6512,y:5872,purpose:'view',look:Math.PI/2}, {x:6848,y:5760,purpose:'meadow',look:Math.PI},
  {x:6864,y:5360,purpose:'view',look:0},
] as const;

/** Cosmetic residents never enter the player roster, saves or wire protocol.
 * Four shared character clones, distributed homes, independent schedules and
 * one shared incremental pathfinding budget for the entire group. */
export class FriendsInhabitants {
  private readonly root = new THREE.Group();
  private readonly twigGeometry = new THREE.CylinderGeometry(.9, 1.3, 1, 5);
  private readonly foodGeometry = createMarshmallowGeometry();
  private readonly wood = new THREE.MeshStandardMaterial({ color: 0x705039, roughness: 1 });
  private readonly food = new THREE.MeshStandardMaterial({ color: 0xffdfa7, roughness: .9 });
  private readonly hand = new THREE.Vector3();
  private readonly tip = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly cameraPosition = new THREE.Vector3();
  private nextThink = 0;
  private disposed = false;
  private initialized=false;
  private planner=0;
  private terrain?:FriendsTerrain;
  private pieces:readonly FriendsBuildPiece[]=[];
  private readonly treeBuckets=new Map<string,FrontierTree[]>();
  private harvested=new Set<string>();
  private planted:readonly FrontierTree[]=[];
  private forestRevision=-1;
  readonly speechRigs=new Map<string,PlayerVisualRig>();
  private speechSequence=0;
  private nextSpeech=0;
  private nextGreeting=0;
  private campStay=false;
  private inviteAt=Infinity;
  private secondInviteAt=Infinity;
  private readonly residents = RESIDENTS.map((definition, index) => {
    const rig = createFriendsCharacterRig(definition.color, `${definition.name} · NPC`);
    rig.root.name = `friendly-npc-${definition.name.toLowerCase()}`;
    const stick = new THREE.Mesh(this.twigGeometry, this.wood);
    const marshmallow = new THREE.Mesh(this.foodGeometry, this.food);
    stick.name = 'npc-roasting-twig'; marshmallow.name = 'npc-marshmallow';
    this.root.add(rig.root, stick, marshmallow);
    return { definition, index, rig, stick, marshmallow,
      x:definition.x as number, y:definition.y as number, z:704,
      angle:index*Math.PI/2, seated:false, walking:false, waveUntil:0, greetAfter:0,
      vx:0, vy:0, seed:1237+index*9137, waitUntil:0, visitAfter:30000+index*19000,
      visualZ:undefined as number|undefined, speed:0, blockedAt:undefined as number|undefined,
      purpose:'arrival' as ResidentConversation, lookAngle:index*Math.PI/2,
      lastPlace:-1,
      companion:false, speechAt:Infinity, lastLine:'' ,
      seatIndex:undefined as number|undefined, goal:undefined as {x:number;y:number}|undefined,
      search:undefined as FriendsResidentPath|undefined, path:[] as ResidentPoint[],
      pose:undefined as CoopPlayerSnapshot|undefined,
    };
  });

  constructor(scene: THREE.Scene,private readonly onSpeak?:(message:CoopChatMessage)=>void) {
    for(const r of this.residents)this.speechRigs.set(`ambient-npc-${r.index}`,r.rig);
    this.root.name = 'friends-ambient-inhabitants'; scene.add(this.root);
  }

  private random(r:typeof this.residents[number]) {
    r.seed=(Math.imul(r.seed,1664525)+1013904223)>>>0;return r.seed/4294967296;
  }

  private probe=(x:number,y:number,from:ResidentPoint):ResidentPoint|undefined=>{
    if(!this.terrain||x<5520||x>7104||y<5184||y>6176)return;
    const count=Math.max(1,Math.ceil(Math.hypot(x-from.x,y-from.y)/16));
    let z=from.z;
    for(let i=1;i<=count;i++) {
      const px=from.x+(x-from.x)*i/count,py=from.y+(y-from.y)*i/count;
      const floor=this.terrain.floor(px,py,z,32);
      if(floor===undefined||Math.abs(floor-z)>32)return;
      const water=friendsWaterAt(px,py);
      if(water&&water.level>floor+4)return;
      if(Math.hypot(px-FRIENDS_CAMPFIRE.x,py-FRIENDS_CAMPFIRE.y)<62)return;
      const point={x:px,y:py};
      if(this.terrain.collide(point,floor,12,54,32)||resolveFriendsBuildCollisions(this.pieces,point,floor,12,54,32))return;
      const bx=Math.floor(px/128),by=Math.floor(py/128);
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++) {
        for(const tree of this.treeBuckets.get(`${bx+dx},${by+dy}`)??[]) {
          if(!this.harvested.has(tree.id)&&Math.abs(tree.z-floor)<80&&Math.hypot(px-tree.x,py-tree.y)<16+tree.scale*12)return;
        }
      }
      for(const tree of this.planted)if(Math.abs(tree.z-floor)<80&&Math.hypot(px-tree.x,py-tree.y)<16+tree.scale*12)return;
      z=floor;
    }
    return {x,y,z};
  };

  private occupied(index:number,players:readonly CoopPlayerSnapshot[]) {
    const seat=CAMPFIRE_SEATS[index];
    return players.some(p=>p.lifeState==='alive'&&(
      isCampfireSeat(p.friendsSeat)&&p.friendsSeat!.index===index||
      Math.hypot(p.x-seat.x,p.y-seat.y)<70&&Math.abs(p.z-seat.z)<70));
  }

  private say(r:typeof this.residents[number],context:ResidentConversation,time:number) {
    if(!this.onSpeak||time<this.nextSpeech)return;
    const lines=RESIDENT_DIALOGUE[context][r.index];
    let text=lines[Math.floor(this.random(r)*lines.length)];
    if(text===r.lastLine)text=lines[(lines.indexOf(text)+1)%lines.length];
    r.lastLine=text;this.nextSpeech=time+9000;
    this.onSpeak({id:`npc-speech-${++this.speechSequence}`,playerId:`ambient-npc-${r.index}`,
      playerLabel:`${r.definition.name} · NPC`,playerColor:r.definition.color,text,sentAt:Math.round(time)});
  }

  private joinCampfire(time:number,players:readonly CoopPlayerSnapshot[],local:CoopPlayerSnapshot) {
    if(this.residents.filter(r=>r.seatIndex!==undefined).length>=2)return;
    const choices=this.residents.filter(r=>!r.seated&&r.seatIndex===undefined&&
      Math.hypot(r.x-local.x,r.y-local.y)<900).sort((a,b)=>
      Math.hypot(a.x-local.x,a.y-local.y)-Math.hypot(b.x-local.x,b.y-local.y));
    const r=choices[0];if(!r)return;
    // Leave a chair between us and the player; space any second visitor apart.
    const index=CAMPFIRE_SEATS.map((_,i)=>i).filter(i=>
      !this.occupied(i,players)&&
      Math.hypot(CAMPFIRE_SEATS[i].x-local.x,CAMPFIRE_SEATS[i].y-local.y)>150&&
      !this.residents.some(other=>other.seatIndex!==undefined&&
        Math.hypot(CAMPFIRE_SEATS[i].x-CAMPFIRE_SEATS[other.seatIndex].x,CAMPFIRE_SEATS[i].y-CAMPFIRE_SEATS[other.seatIndex].y)<170))
      .sort((a,b)=>Math.hypot(CAMPFIRE_SEATS[a].x-r.x,CAMPFIRE_SEATS[a].y-r.y)-Math.hypot(CAMPFIRE_SEATS[b].x-r.x,CAMPFIRE_SEATS[b].y-r.y))[0];
    if(index===undefined)return;
    r.companion=true;r.seatIndex=index;r.purpose='fire';r.goal=CAMPFIRE_SEATS[index];
    r.path=[];r.waitUntil=time;r.waveUntil=time;r.speed=0;
    r.search=new FriendsResidentPath({x:r.x,y:r.y,z:r.z},r.goal,this.probe);
    r.visitAfter=time+120000;this.say(r,'join',time);
  }

  private chooseDestination(r:typeof this.residents[number],time:number,players:readonly CoopPlayerSnapshot[]) {
    r.goal=undefined;r.path=[];r.search=undefined;r.seatIndex=undefined;r.companion=false;
    if(time>=r.visitAfter) {
      r.visitAfter=time+65000+this.random(r)*65000;
      // At most two visitors, on opposite sides; player seats always win.
      const index=[2,6].find(i=>!this.occupied(i,players)&&!this.residents.some(other=>other!==r&&other.seatIndex===i));
      if(index!==undefined){r.seatIndex=index;r.goal=CAMPFIRE_SEATS[index];r.purpose='fire';}
    }
    if(!r.goal)for(let attempt=0;attempt<16;attempt++) {
      const preferred=['arrival','woods','view','meadow'][r.index];
      const choices=this.random(r)<.65?PLACES.filter(p=>p.purpose===preferred):PLACES;
      const place=choices[Math.floor(this.random(r)*choices.length)],placeIndex=PLACES.indexOf(place);
      if(placeIndex===r.lastPlace)continue;
      const goal={x:place.x+(this.random(r)-.5)*40,y:place.y+(this.random(r)-.5)*40};
      if(Math.hypot(goal.x-r.x,goal.y-r.y)<110||Math.hypot(goal.x-r.x,goal.y-r.y)>900)continue;
      if(this.residents.some(other=>other!==r&&(
        Math.hypot(goal.x-other.x,goal.y-other.y)<180||other.goal&&Math.hypot(goal.x-other.goal.x,goal.y-other.goal.y)<180)))continue;
      r.goal=goal;r.purpose=place.purpose;r.lookAngle=place.look;r.lastPlace=placeIndex;break;
    }
    if(r.goal)r.search=new FriendsResidentPath({x:r.x,y:r.y,z:r.z},r.goal,this.probe);
    else r.waitUntil=time+3000;
  }

  update(time:number,deltaMs:number,players:readonly CoopPlayerSnapshot[],local:CoopPlayerSnapshot,
    camera:THREE.Camera,terrain:FriendsTerrain,pieces:readonly FriendsBuildPiece[]=[],frontier?:FrontierSnapshot) {
    if(this.disposed)return;
    this.terrain=terrain;this.pieces=pieces;
    camera.getWorldPosition(this.cameraPosition);
    const think=time>=this.nextThink;
    if(think){
      this.nextThink=time+100;
      if(frontier&&frontier.revision!==this.forestRevision){
        this.forestRevision=frontier.revision;this.harvested=new Set(frontier.harvested);
        this.planted=frontier.planted.filter(t=>t.x>=5480&&t.x<=7144&&t.y>=5144&&t.y<=6216);
      }
    }
    if(!this.initialized) {
      for(let cx=10;cx<=14;cx++)for(let cy=10;cy<=12;cy++)for(const tree of frontierTrees(cx,cy)) {
        const key=`${Math.floor(tree.x/128)},${Math.floor(tree.y/128)}`;
        const bucket=this.treeBuckets.get(key)??[];bucket.push(tree);this.treeBuckets.set(key,bucket);
      }
      for(const r of this.residents){r.z=terrain.floor(r.x,r.y,2000,0)??704;r.waitUntil=time+r.index*1800;}
      this.initialized=true;
    }
    if(think) {
      const sitting=local.lifeState==='alive'&&isCampfireSeat(local.friendsSeat);
      if(sitting&&!this.campStay) {
        // Most visits attract one neighbour, sometimes a second later on.
        this.inviteAt=this.random(this.residents[0])<.8?time+4000:Infinity;
        this.secondInviteAt=this.random(this.residents[1])<.25?time+22000:Infinity;
      }
      if(!sitting){this.inviteAt=this.secondInviteAt=Infinity;}
      this.campStay=sitting;
      if(sitting&&time>=this.inviteAt){this.inviteAt=Infinity;this.joinCampfire(time,players,local);}
      if(sitting&&time>=this.secondInviteAt){this.secondInviteAt=Infinity;this.joinCampfire(time,players,local);}
    }
    // Only one search gets twelve expansions per thinking tick, irrespective
    // of how many residents want a route. Invisible residents consume no work.
    if(think)for(let n=0;n<this.residents.length;n++) {
      const r=this.residents[this.planner++%this.residents.length];
      if(!r.search||Math.hypot(this.cameraPosition.x-r.x,this.cameraPosition.z-r.y,this.cameraPosition.y-r.z)>1500)continue;
      const status=r.search.step(12);
      if(status==='found'){r.path=smoothResidentPath(r,r.search.points,this.probe);r.search=undefined;}
      else if(status==='unreachable'){r.search=undefined;r.goal=undefined;r.seatIndex=undefined;r.waitUntil=time+2000+this.random(r)*4000;}
      break;
    }
    const dt=Math.max(0,Math.min(deltaMs,100))/1000;
    for(const r of this.residents) {
      const visible=Math.hypot(this.cameraPosition.x-r.x,this.cameraPosition.z-r.y,this.cameraPosition.y-r.z)<1500;
      r.rig.root.visible=visible;r.stick.visible=r.marshmallow.visible=false;
      if(!visible)continue;
      if(think) {
        const near=local.lifeState==='alive'&&Math.hypot(local.x-r.x,local.y-r.y,local.z-r.z)<190;
        if(near&&time>=r.greetAfter&&time>=this.nextGreeting&&!(r.companion&&r.path.length)){r.waveUntil=time+1800;r.greetAfter=time+60000+this.random(r)*30000;this.nextGreeting=time+4000;this.say(r,r.seated?'fire':'hello',time);}
        if(r.seatIndex!==undefined&&this.occupied(r.seatIndex,players)) {
          r.seated=false;r.seatIndex=undefined;r.goal=undefined;r.path=[];r.search=undefined;r.waitUntil=time;
          r.z=terrain.floor(r.x,r.y,r.z,0)??r.z;
        }
        if(r.seated&&r.companion&&this.campStay)r.waitUntil=Math.max(r.waitUntil,time+5000);
        if(r.seated&&time>=r.waitUntil){r.seated=false;r.seatIndex=undefined;r.goal=undefined;r.z=terrain.floor(r.x,r.y,r.z,0)??r.z;}
        if(time>=r.speechAt){
          r.speechAt=Infinity;
          if(Math.hypot(local.x-r.x,local.y-r.y,local.z-r.z)<450){
            if(time<this.nextSpeech)r.speechAt=this.nextSpeech+500;
            else this.say(r,r.purpose,time);
          }
        }
        if(!r.seated&&!r.goal&&!r.search&&time>=r.waitUntil)this.chooseDestination(r,time,players);
      }
      r.vx=r.vy=0;
      // Pass through intermediate waypoints without stopping for a frame.
      while(r.path.length>1&&Math.hypot(r.path[0].x-r.x,r.path[0].y-r.y)<8)r.path.shift();
      const target=r.path[0];
      if(target&&!r.seated&&time>=r.waveUntil) {
        const dx=target.x-r.x,dy=target.y-r.y,distance=Math.hypot(dx,dy);
        if(distance<3) {
          r.path.shift();
          if(!r.path.length) {
            if(r.seatIndex!==undefined&&!this.occupied(r.seatIndex,players)) {
              r.seated=true;r.x=target.x;r.y=target.y;r.z=CAMPFIRE_SEATS[r.seatIndex].z;
              r.waitUntil=time+25000+this.random(r)*25000;r.speechAt=time+2000;
            }else {r.waitUntil=time+14000+this.random(r)*22000;r.speechAt=time+2500;}
            r.speed=0;
            r.goal=undefined;
          }
        }else {
          let vx=dx/distance,vy=dy/distance;
          // Gentle personal space around both residents and real players.
          for(const other of [...this.residents,...players.filter(p=>p.lifeState==='alive')]) {
            if(other===r||Math.abs(other.z-r.z)>64)continue;
            const ox=r.x-other.x,oy=r.y-other.y,d=Math.hypot(ox,oy);
            if(d>0&&d<95){const force=(95-d)/95*1.4;vx+=ox/d*force;vy+=oy/d*force;}
          }
          const desired=Math.atan2(vy,vx),turn=Math.atan2(Math.sin(desired-r.angle),Math.cos(desired-r.angle));
          r.angle+=THREE.MathUtils.clamp(turn,-dt*2.8,dt*2.8);
          const cruise=(42+r.index*3)*Math.max(0,Math.cos(turn));
          const braking=r.path.length===1?Math.min(1,distance/20):1;
          r.speed+=(cruise*braking-r.speed)*(1-Math.exp(-dt*4));
          const travel=Math.min(distance,r.speed*dt);
          const next=this.probe(r.x+Math.cos(r.angle)*travel,r.y+Math.sin(r.angle)*travel,r);
          if(next&&!players.some(p=>p.lifeState==='alive'&&Math.abs(p.z-next.z)<64&&Math.hypot(p.x-next.x,p.y-next.y)<35)&&
            !this.residents.some(other=>other!==r&&Math.abs(other.z-next.z)<64&&Math.hypot(other.x-next.x,other.y-next.y)<48)) {
            r.blockedAt=undefined;
            r.vx=dt?(next.x-r.x)/dt:0;r.vy=dt?(next.y-r.y)/dt:0;r.x=next.x;r.y=next.y;r.z=next.z;
          }else {
            r.speed=0;r.blockedAt??=time;
            if(think&&time-r.blockedAt>800) {
            // A changed build or blocked route triggers a new destination;
            // never repeatedly push into the same wall or teleport past it.
            r.path=[];r.goal=undefined;r.seatIndex=undefined;r.waitUntil=time+4000+this.random(r)*4000;r.blockedAt=undefined;
            }
          }
        }
      }
      if(!target||r.seated||time<r.waveUntil)r.speed=0;
      r.walking=Math.hypot(r.vx,r.vy)>.1;
      const seat=CAMPFIRE_SEATS[r.seatIndex??2];
      const waving = time < r.waveUntil;
      const facing = waving ? Math.atan2(local.y-r.y,local.x-r.x) : r.seated ? seat.angle+Math.PI : r.walking ? r.angle : !r.goal?r.lookAngle:r.angle;
      r.angle += Math.atan2(Math.sin(facing-r.angle),Math.cos(facing-r.angle)) * (1-Math.exp(-dt*6));
      // Reuse the player's articulated movement solver without exposing an NPC
      // as a connected player or giving it a weapon or interactive inventory.
      const pose = r.pose ?? (r.pose = { ...local, motion: { ...local.motion } as CoopPlayerSnapshot['motion'] });
      Object.assign(pose, { id: `ambient-npc-${r.index}`, label: `${r.definition.name} · NPC`, color: r.definition.color,
        x:r.x, y:r.y, z:r.z, angle:r.angle, lifeState:'alive', sprinting:false, sliding:false,
        crouching:r.seated, friendsDevFlight:false, friendsFlashlight:undefined, friendsWeaponEquipped:false,
        platformVelocityX:0, platformVelocityY:0,
        friendsSeat:r.seated ? {vehicleId:FRIENDS_CAMPFIRE.id,index:r.seatIndex!} : undefined,
        friendsHands:{mask:waving && Math.sin((time-r.waveUntil)*.009) > -.25 ? 1 : 0,yaw:r.angle,pitch:0},
      });
      // The shared gait is tuned for a running player. Give these slower,
      // short-legged walkers a readable stride instead of a tiny sliding shuffle.
      Object.assign(pose.motion!, { velocityX:r.vx*2, velocityY:r.vy*2, swimming:false, swimSubmerged:false });
      placeFriendsCharacter(r.rig,pose);
      r.visualZ=r.visualZ===undefined?r.z:r.visualZ+(r.z-r.visualZ)*(1-Math.exp(-dt*20));
      r.rig.root.position.y=r.visualZ;
      updateFriendsCharacter(r.rig,pose,time,undefined,false,undefined,r.seated?'marshmallow':undefined);
      // Keep the NPC caption legible even while sitting.
      r.rig.nameplate.scale.copy(r.rig.nameplateScale).multiplyScalar(1.2);
      if (r.seated && friendsCharacterHandPoint(r.rig,this.hand)) {
        r.rig.root.localToWorld(this.hand);
        this.tip.set(FRIENDS_CAMPFIRE.x+Math.cos(seat.angle)*23,FRIENDS_CAMPFIRE.z+48,FRIENDS_CAMPFIRE.y+Math.sin(seat.angle)*23);
        this.direction.subVectors(this.tip,this.hand);
        r.stick.position.copy(this.hand).addScaledVector(this.direction,.5);
        r.stick.scale.y=this.direction.length();
        r.stick.quaternion.setFromUnitVectors(this.up,this.direction.normalize());
        r.marshmallow.position.copy(this.tip);r.marshmallow.quaternion.copy(r.stick.quaternion);
        r.stick.visible=r.marshmallow.visible=true;
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed=true;
    for (const r of this.residents) disposeFriendsCharacterRig(r.rig);
    this.twigGeometry.dispose();this.foodGeometry.dispose();this.wood.dispose();this.food.dispose();
    this.speechRigs.clear();this.root.removeFromParent();this.root.clear();
  }
}
