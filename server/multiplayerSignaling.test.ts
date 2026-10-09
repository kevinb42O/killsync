import express from 'express';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {createMultiplayerRouter} from './multiplayerSignaling';
const closers:Array<()=>Promise<void>>=[];
afterEach(async()=>{await Promise.all(closers.splice(0).map(close=>close()));vi.unstubAllEnvs();});
async function api(){const app=express();app.use(express.json());app.use('/api/multiplayer',createMultiplayerRouter());const server=app.listen(0);await new Promise<void>(resolve=>server.once('listening',resolve));const origin=`http://127.0.0.1:${(server.address() as any).port}/api/multiplayer`;closers.push(()=>new Promise(resolve=>server.close(()=>resolve())));return async(path:string,body?:unknown,token?:string,method?:string)=>{const r=await fetch(origin+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:r.status===204?undefined:await r.json().catch(()=>undefined)};};}
describe('Friends controlled signaling and Survival compatibility',()=>{
 it('resolves a Friends invitation code, rejects code collision and reserves five concurrent player slots',async()=>{
  const request=await api();const code=`FRIENDS-${Date.now().toString(36)}`;
  const created=await request('/rooms',{hostName:'Host',code,gameMode:'friends'});expect(created.status).toBe(201);const room=created.body.room,token=created.body.hostToken;expect(room.maxPlayers).toBe(6);
  expect((await request(`/rooms/${code.toLowerCase()}?mode=friends`)).body.room.id).toBe(room.id);
  expect((await request('/rooms',{code,gameMode:'friends'})).status).toBe(409);
  await request(`/rooms/${room.id}`,{state:'in_game'},token,'PATCH');
  const joins=await Promise.all(Array.from({length:6},(_,i)=>request(`/rooms/${room.id}/joins`,{guestName:`Guest ${i}`})));
  expect(joins.filter(r=>r.status===201)).toHaveLength(5);expect(joins.filter(r=>r.status===409)).toHaveLength(1);
  expect((await request(`/rooms/${room.id}`,undefined,undefined,'DELETE')).status).toBe(401);
  expect((await request(`/rooms/${room.id}`,undefined,token,'DELETE')).status).toBe(204);
 });
 it('caps Friends at six and keeps Survival at five even when a larger room is requested',async()=>{
  const request=await api();
  expect((await request('/rooms',{hostName:'Friends',gameMode:'friends',maxPlayers:8})).body.room.maxPlayers).toBe(6);
  expect((await request('/rooms',{hostName:'Survival',gameMode:'survival',maxPlayers:6})).body.room.maxPlayers).toBe(5);
 });
 it('allows normal Friends shared-IP polling while retaining the Survival request budget',async()=>{
  const request=await api();for(let i=0;i<200;i++)expect((await request('/rooms?mode=friends')).status).toBe(200);
  let limited=false;for(let i=0;i<200;i++)if((await request('/rooms')).status===429){limited=true;break;}expect(limited).toBe(true);
 });
 it('returns expiring server-side TURN credentials to same-origin Friends clients',async()=>{
  vi.stubEnv('TURN_URLS','turn:relay.example:3478?transport=udp,turns:relay.example:5349?transport=tcp');vi.stubEnv('TURN_SHARED_SECRET','test-only-shared-secret');
  const request=await api(),response=await request('/ice-servers?mode=friends');expect(response.status).toBe(200);expect(response.body.iceServers).toHaveLength(2);const relay=response.body.iceServers[1];expect(relay.urls).toHaveLength(2);expect(relay.credential).toBeTypeOf('string');expect(Number(relay.username.split(':')[0])-Math.floor(Date.now()/1000)).toBeGreaterThan(590);expect(JSON.stringify(response.body)).not.toContain('test-only-shared-secret');
 });
});
