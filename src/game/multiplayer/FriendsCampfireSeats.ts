import { FRIENDS_CAMPFIRE } from '../world/FriendsRegion';
import type { ScenicActor, ScenicSeat } from './FriendsScenicService';

export const CAMPFIRE_SEATS = Array.from({length:8},(_,index)=>{
  const angle=index*Math.PI/4+Math.PI/8;
  return {x:FRIENDS_CAMPFIRE.x+Math.cos(angle)*124,y:FRIENDS_CAMPFIRE.y+Math.sin(angle)*124,z:FRIENDS_CAMPFIRE.z+20,angle};
});
export function isCampfireSeat(seat:ScenicSeat|undefined){return seat?.vehicleId===FRIENDS_CAMPFIRE.id;}
export function campfireSeatPrompt(player:ScenicActor,players:readonly ScenicActor[]=[]){
  if(player.lifeState!=='alive'||player.friendsDevFlight)return;
  if(isCampfireSeat(player.friendsSeat))return {label:'Stand up · leave the campfire',seat:player.friendsSeat!};
  if(player.friendsSeat)return;
  let nearest=62,result:{label:string;seat:ScenicSeat}|undefined;
  CAMPFIRE_SEATS.forEach((seat,index)=>{
    if(Math.abs(player.z-FRIENDS_CAMPFIRE.z)>38||players.some(p=>isCampfireSeat(p.friendsSeat)&&p.friendsSeat!.index===index))return;
    const distance=Math.hypot(player.x-seat.x,player.y-seat.y);
    if(distance<nearest){nearest=distance;result={label:'Sit · warm up by the campfire',seat:{vehicleId:FRIENDS_CAMPFIRE.id,index}};}
  });
  return result;
}
function stand(player:ScenicActor){
  const seat=CAMPFIRE_SEATS[player.friendsSeat!.index];
  if(seat){player.x=seat.x-Math.cos(seat.angle)*40;player.y=seat.y-Math.sin(seat.angle)*40;player.z=FRIENDS_CAMPFIRE.z;}
  delete player.friendsSeat;player.crouching=false;player.verticalVelocity=0;
}
export function interactCampfireSeat(player:ScenicActor,players:readonly ScenicActor[]){
  const prompt=campfireSeatPrompt(player,players);if(!prompt)return false;
  if(isCampfireSeat(player.friendsSeat))stand(player);
  else {player.friendsSeat=prompt.seat;updateCampfireSeats([player],new Set());}
  return true;
}
export function updateCampfireSeats(players:readonly ScenicActor[],jumping:ReadonlySet<string>){
  for(const player of players){
    if(!isCampfireSeat(player.friendsSeat))continue;
    const seat=CAMPFIRE_SEATS[player.friendsSeat!.index];
    if(!seat||player.lifeState!=='alive'||player.friendsDevFlight||jumping.has(player.id)){stand(player);continue;}
    player.x=seat.x;player.y=seat.y;player.z=seat.z;player.crouching=true;
    player.verticalVelocity=0;player.velocityX=0;player.velocityY=0;
  }
}
