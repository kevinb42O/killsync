import { ManualWebRTCSession } from '../src/game/multiplayer/ManualWebRTCSession';
import { HostedLobby, LobbyJoin, fetchIceServers } from '../src/game/multiplayer/LobbySignaling';
import { FriendsSimulation } from '../src/game/multiplayer/FriendsSimulation';
import { CoopSimulation, quantizePitch, type CoopSnapshot, type CoopPlayerSeed } from '../src/game/multiplayer/CoopSimulation';
import { MULTIPLAYER_PROTOCOL_VERSION } from '../src/game/multiplayer/protocol';
import { FriendsCrewRegistry, FRIENDS_SESSION_PROTOCOL, readFriendsCredential, rememberFriendsCredential } from '../src/game/multiplayer/FriendsCrewIdentity';
import { recoverFriendsWorld, friendsWorldCrew, initialFriendsWorld, saveFriendsWorld, readFriendsWorld } from '../src/game/multiplayer/FriendsWorldStorage';
import { FriendsCommandOutbox } from '../src/game/multiplayer/FriendsCommands';
import { packKey } from '../src/game/multiplayer/FriendsFrontier';
if(!import.meta.env.DEV)throw new Error('This fixture is available only in development.');
let session:ManualWebRTCSession|undefined,lobby:HostedLobby|undefined,join:LobbyJoin|undefined,simulation:CoopSimulation|undefined,registry:FriendsCrewRegistry|undefined,snapshot:CoopSnapshot|undefined;
let mode:'friends'|'survival'='friends',worldId='',local:CoopPlayerSeed={id:crypto.randomUUID(),label:'Friend',color:'#fff'},tick=0,seq=0,requestId=Date.now()*100,playing=false;
const mapping:Record<string,string>={},errors:string[]=[],results:unknown[]=[],startAcks=new Set<string>();
let droppedResults=0,input=0;
const outbox=new FriendsCommandOutbox(event=>session!.sendEvent(event),m=>errors.push(m));
const event=(name:any,payload?:unknown)=>({type:'event' as const,version:MULTIPLAYER_PROTOCOL_VERSION,event:name,payload});
const start=(peerId:string)=>session!.sendEventTo(peerId,event('start',{players:simulation!.getPlayerSeeds(),friendsProtocol:FRIENDS_SESSION_PROTOCOL}));
function handlers(){session!.setHandlers({
 onError:m=>errors.push(m),
 onPeerChange:peers=>{if(simulation)for(const [id,playerId]of Object.entries(mapping))if(!peers.some(p=>p.peerId===id)){simulation.removePlayer(playerId);delete mapping[id];lobby?.update(simulation.getPlayerSeeds().length,'in_game');}},
 onInput:(peerId,frame)=>{if(simulation&&mapping[peerId])simulation.setInput(mapping[peerId],frame);},
 onState:frame=>{snapshot=frame.payload as CoopSnapshot;if(snapshot.players.some(p=>p.id===local.id))playing=true;},
 onEvent:(peerId,e)=>{
   const p=e.payload as any;
   if(simulation){
     if(e.event==='friends_hello'){session!.sendEventTo(peerId,event('friends_welcome',{schema:FRIENDS_SESSION_PROTOCOL,worldId:registry!.saved.worldId}));return;}
     if(e.event==='friends_start_ack'){startAcks.add(peerId);return;}
     if(e.event==='ready'){
       if(mapping[peerId]){start(peerId);return;}
       try{let player=p;if(mode==='friends'){const admitted=registry!.admit(p,p.credential,simulation.getPlayerSeeds().map(v=>v.id));player=admitted.player;session!.sendEventTo(peerId,event('friends_identity',admitted.credential));}
         if(!simulation.addPlayer(player))throw new Error('Full');mapping[peerId]=player.id;session!.admitFriendsPeer(peerId);start(peerId);lobby?.update(simulation.getPlayerSeeds().length,'in_game');
       }catch(error){session!.sendEventTo(peerId,event('error',(error as Error).message));}return;
     }
     if(e.event==='friends_action'||e.event==='friends_build'){
       if(p.friendsEpoch!==session!.friendsEpoch)return;const actor=mapping[peerId];if(!actor)return;
       const result=e.event==='friends_action'?simulation.friendsAction(actor,p):simulation.friendsBuild(actor,p);
       if(droppedResults){droppedResults--;return;}session!.sendEventTo(peerId,event(`${e.event}_result`,result));return;
     }
   }else{
     if(e.event==='friends_welcome'){worldId=p.worldId;return;}
     if(e.event==='friends_identity'){rememberFriendsCredential(p);local.id=p.playerId;return;}
     if(e.event==='start'){playing=true;session!.sendEvent(event('friends_start_ack'));return;}
     if(e.event==='friends_action_result'||e.event==='friends_build_result'){results.push(p);outbox.acknowledge(e.event.replace('_result',''),p.requestId);return;}
     if(e.event==='error')errors.push(String(p));
   }
 }
});}
const clock=window.setInterval(()=>{
 if(!session)return;
 if(simulation){simulation.tick(50);snapshot=simulation.createSnapshot();session.broadcastState({type:'state',version:MULTIPLAYER_PROTOCOL_VERSION,tick:++tick,sentAt:Date.now(),payload:snapshot});}
 else if(playing){session.sendInput({type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:++seq,clientTime:Date.now(),movement:input,aimAngle:0,aimPitch:quantizePitch(0),selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false});}
},50);
window.setInterval(()=>{if(!session)return;outbox.tick(performance.now());if(simulation){for(const id of Object.keys(mapping))if(!startAcks.has(id))start(id);}else if(!playing){if(mode==='friends'&&!worldId)session.sendEvent(event('friends_hello',{schema:FRIENDS_SESSION_PROTOCOL}));else session.sendEvent(event('ready',{...local,friendsProtocol:FRIENDS_SESSION_PROTOCOL,credential:readFriendsCredential(worldId)}));}},500);
const api={
 async host(name:string='Host',gameMode:'friends'|'survival'='friends'){
   mode=gameMode;local.label=name;if(mode==='friends'){await recoverFriendsWorld();registry=new FriendsCrewRegistry(friendsWorldCrew());local.id=registry.saved.hostId;const w=initialFriendsWorld();simulation=new FriendsSimulation([local],1,w.progress,w.building,w.projects,w.frontier,w.transport);simulation.setFriendsGuestAccess(true);}else simulation=new CoopSimulation([local]);
   session=new ManualWebRTCSession({role:'host',friends:mode==='friends',iceServers:await fetchIceServers(mode)});handlers();lobby=await HostedLobby.create(name,undefined,mode);lobby.start(session);lobby.update(1,'in_game');playing=true;return lobby.room;
 },
 async join(code:string,name='Guest',gameMode:'friends'|'survival'='friends'){
   mode=gameMode;local.label=name;session=new ManualWebRTCSession({role:'guest',friends:mode==='friends',iceServers:await fetchIceServers(mode)});handlers();join=await LobbyJoin.create(code,name,false,mode);join.waitForHost(session,()=>{},m=>errors.push(m),()=>errors.push('Join timed out'));
 },
 status(){const s=simulation?.createSnapshot()||snapshot;return {playing,localId:local.id,epoch:session?.friendsEpoch,peers:session?.peerInfo,mapping,tick:s?.tick,mode:s?.mode,players:s?.players.map(p=>({id:p.id,label:p.label,x:p.x,y:p.y,z:p.z})),frontier:s?.friends?.frontier,building:s?.friends?.building,vehicles:s?.friends?.vehicles,results,errors,pending:outbox.size};},
 faults({motionLoss=0,worldDrops=0,delay=0}:{motionLoss?:number;worldDrops?:number;delay?:number}){let count=0;const receive=session!['receiveMessage'].bind(session);session!['receiveMessage']=(peerId,kind,raw)=>{if(kind==='friends-world'&&worldDrops>0){worldDrops--;return;}if(kind==='state'&&motionLoss>0&&++count%motionLoss===0)return;if(kind==='state'&&delay>0){setTimeout(()=>receive(peerId,kind,raw),delay);return;}receive(peerId,kind,raw);};},
 async directHost(){mode='survival';local.label='Survival Host';simulation=new CoopSimulation([local]);session=new ManualWebRTCSession({role:'host'});handlers();playing=true;return session.createOffer();},
 async directJoin(offer:string){mode='survival';local.label='Survival Guest';session=new ManualWebRTCSession({role:'guest'});handlers();return session.acceptOffer(offer);},
 finish(answer:string){return session!.acceptAnswer(answer);},
 move(mask:number){input=mask;},
 command(action:string,extra:Record<string,unknown>={},build=false){const payload={requestId:++requestId,action,...extra};if(simulation)return build?simulation.friendsBuild(local.id,payload as any):simulation.friendsAction(local.id,payload as any);return outbox.submit(build?'friends_build':'friends_action',payload,session!.friendsEpoch,performance.now());},
 flatFixture(){if(!simulation)throw new Error('Host only');const f=simulation['friendsFrontier']!;f.terrain.addGrade([8000,8000,0,512]);for(const p of simulation['players'].values())Object.assign(p,{x:8000,y:8000,z:0,velocityX:0,velocityY:0,verticalVelocity:0});},
 largeFixture(){if(!simulation)throw new Error('Host only');const f=simulation['friendsFrontier']!;for(let i=0;i<6000;i++)f.terrain.set(800+i%600,1200+Math.floor(i/600),200,1);return f.terrain.snapshot().edits.length;},
 dropReplies(count:number){droppedResults=count;},
 pack(){const s=simulation?.createSnapshot()||snapshot;const p=s?.players.find(p=>p.id===local.id);return p&&s?.friends?.frontier?.packs[packKey(p)];},
 async save(){const f=simulation!.createSnapshot().friends!;return saveFriendsWorld({progress:f.progress,building:f.building!,frontier:f.frontier,projects:f.projects,transport:f.transport});},
 async storage(){const world=await recoverFriendsWorld();return {world:world?.crew?.worldId,pieces:world?.building.pieces.length,mirror:!!localStorage.getItem('killsync.friends.world.v2')};},
 async stats(){const p=[...session!['peers'].values()][0];if(!p)return [];const stats=await p.connection.getStats();return [...stats.values()].filter(s=>s.type==='candidate-pair'||s.type==='local-candidate'||s.type==='data-channel').map(s=>({type:s.type,state:s.state,label:s.label,candidateType:s.candidateType,nominated:s.nominated,localCandidateType:s.localCandidateId?stats.get(s.localCandidateId)?.candidateType:undefined,remoteCandidateType:s.remoteCandidateId?stats.get(s.remoteCandidateId)?.candidateType:undefined,bytesSent:s.bytesSent,bytesReceived:s.bytesReceived}));},
 close(){outbox.clear();session?.close();lobby?.close();join?.close();window.clearInterval(clock);},
};
(window as any).friendsReview=api;document.getElementById('status')!.textContent='Ready';
