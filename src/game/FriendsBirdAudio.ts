import * as THREE from 'three';
import { friendsAudio, type FriendsAudio, type FriendsCue } from './FriendsAudio';
import type { FriendlyBird } from './multiplayer/FriendsBirds';

const CALLS=['birdRobin','birdBlueTit','birdSparrow'] as const;
type Visit={phase:FriendlyBird['phase'];nextCall:number;arrivalWings:boolean};

/** Irregular, short field recordings anchored to each visible bird. */
export class FriendsBirdAudio {
  private visits=new Map<number,Visit>();
  private nextCall=0;
  private cameraPosition=new THREE.Vector3();
  private right=new THREE.Vector3();
  private delta=new THREE.Vector3();
  private rotation=new THREE.Quaternion();
  constructor(private audio:Pick<FriendsAudio,'play'|'prepareBirds'>=friendsAudio,private random= Math.random){}
  update(birds:readonly FriendlyBird[],camera:THREE.Camera,now:number,localId:string){
    if(birds.length)this.audio.prepareBirds();
    camera.getWorldPosition(this.cameraPosition);camera.getWorldQuaternion(this.rotation);this.right.set(1,0,0).applyQuaternion(this.rotation);
    const active=new Set<number>();
    for(const bird of birds){
      active.add(bird.id);if(now<bird.atMs)continue;
      let visit=this.visits.get(bird.id);
      const entered=!visit||visit.phase!==bird.phase;
      if(!visit){visit={phase:bird.phase,nextCall:now+3000+this.random()*6000,arrivalWings:false};this.visits.set(bird.id,visit);}
      const local=bird.ownerId===localId&&(bird.phase==='feeding'||bird.phase==='perched');
      this.delta.set(bird.x,bird.z,bird.y).sub(this.cameraPosition);
      const distance=this.delta.length(),near=local?1:distance>=650?0:1/(1+(distance/130)**2);
      const pan=local?.22:distance>1?THREE.MathUtils.clamp(this.delta.dot(this.right)/distance,-.95,.95):0;
      const play=(cue:FriendsCue,volume:number,cooldown:number)=>{if(near>.01)this.audio.play(cue,volume*near,cooldown,1,undefined,{ambience:true,pan});};
      if(bird.phase==='approach'&&!visit.arrivalWings&&now-bird.atMs>=1500){play('birdWings',.42,180);visit.arrivalWings=true;}
      if(entered&&bird.phase==='leaving'){
        play('birdWings',.62,180);
        if(bird.burningUntil&&bird.burningUntil>now)play('birdStartled',.65,500);
      }
      const settled=bird.phase==='feeding'||bird.phase==='perched';
      if(settled&&((entered&&bird.phase==='feeding')||now>=visit.nextCall)){
        if(near>.01&&now>=this.nextCall){
          play(CALLS[bird.variant%3],local?.62:.55,500);
          this.nextCall=now+850;
          visit.nextCall=now+(bird.phase==='perched'?5500:7000)+this.random()*8000;
        }else visit.nextCall=now+1200+this.random()*2500;
      }
      visit.phase=bird.phase;
    }
    for(const id of this.visits.keys())if(!active.has(id))this.visits.delete(id);
  }
  dispose(){this.visits.clear();this.nextCall=0;}
}
