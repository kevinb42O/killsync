import { Router } from 'express';
import crypto from 'node:crypto';

const ROOM_TTL_MS = 45_000;
const JOIN_TTL_MS = 45_000;
const MAX_ROOMS = 250;

type Join = {
  id: string;
  token: string;
  guestName: string;
  spectate: boolean;
  createdAt: number;
  offer?: string;
  answer?: string;
};

type Room = {
  id: string;
  hostToken: string;
  hostName: string;
  maxPlayers: number;
  playerCount: number;
  state: 'waiting' | 'in_game';
  updatedAt: number;
  joins: Map<string, Join>;
};

export type PublicRoom = Pick<Room, 'id' | 'hostName' | 'maxPlayers' | 'playerCount' | 'state'>;

const rooms = new Map<string, Room>();

export function createMultiplayerRouter() {
  const router = Router();
  router.use((_, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Access-Control-Allow-Origin', process.env.MULTIPLAYER_CORS_ORIGIN || '*');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
  });
  router.options('*', (_, response) => response.sendStatus(204));

  router.get('/rooms', (_, response) => {
    purgeExpired();
    response.json({ rooms: [...rooms.values()].map(publicRoom).filter(room => room.state === 'in_game' || room.playerCount < room.maxPlayers) });
  });

  router.post('/rooms', (request, response) => {
    purgeExpired();
    if (rooms.size >= MAX_ROOMS) return response.status(503).json({ error: 'Lobby service is full. Try again shortly.' });
    const hostName = cleanName(request.body?.hostName) || 'OPERATIVE';
    const maxPlayers = Math.max(2, Math.min(4, Number(request.body?.maxPlayers) || 4));
    const room: Room = {
      id: shortId('room'), hostToken: token(), hostName, maxPlayers, playerCount: 1,
      state: 'waiting', updatedAt: Date.now(), joins: new Map(),
    };
    rooms.set(room.id, room);
    response.status(201).json({ room: publicRoom(room), hostToken: room.hostToken });
  });

  router.patch('/rooms/:roomId', (request, response) => {
    const room = hostRoom(request.params.roomId, request.header('authorization'));
    if (!room) return response.sendStatus(401);
    room.updatedAt = Date.now();
    if (typeof request.body?.playerCount === 'number') room.playerCount = Math.max(1, Math.min(room.maxPlayers, Math.floor(request.body.playerCount)));
    if (request.body?.state === 'waiting' || request.body?.state === 'in_game') room.state = request.body.state;
    response.json({ room: publicRoom(room) });
  });

  router.delete('/rooms/:roomId', (request, response) => {
    const room = hostRoom(request.params.roomId, request.header('authorization'));
    if (!room) return response.sendStatus(401);
    rooms.delete(room.id);
    response.sendStatus(204);
  });

  router.post('/rooms/:roomId/joins', (request, response) => {
    purgeExpired();
    const room = rooms.get(request.params.roomId);
    if (!room) return response.status(404).json({ error: 'This squad is no longer online.' });
    const spectate = room.state === 'in_game' && request.body?.spectate === true;
    const reserved = [...room.joins.values()].filter(join => !join.answer && !join.spectate).length;
    if (!spectate && room.playerCount + reserved >= room.maxPlayers) return response.status(409).json({ error: 'This squad is full.' });
    const join: Join = { id: shortId('join'), token: token(), guestName: cleanName(request.body?.guestName) || 'OPERATIVE', spectate, createdAt: Date.now() };
    room.joins.set(join.id, join);
    room.updatedAt = Date.now();
    response.status(201).json({ requestId: join.id, joinToken: join.token });
  });

  router.get('/rooms/:roomId/joins', (request, response) => {
    const room = hostRoom(request.params.roomId, request.header('authorization'));
    if (!room) return response.sendStatus(401);
    response.json({ joins: [...room.joins.values()].map(join => ({ requestId: join.id, guestName: join.guestName, offer: join.offer, answer: join.answer })) });
  });

  router.post('/rooms/:roomId/joins/:requestId/offer', (request, response) => {
    const room = hostRoom(request.params.roomId, request.header('authorization'));
    const join = room?.joins.get(request.params.requestId);
    if (!join || typeof request.body?.offer !== 'string' || request.body.offer.length > 48_000) return response.sendStatus(400);
    join.offer = request.body.offer;
    response.sendStatus(204);
  });

  router.get('/rooms/:roomId/joins/:requestId', (request, response) => {
    const join = guestJoin(request.params.roomId, request.params.requestId, request.header('authorization'));
    if (!join) return response.status(404).json({ error: 'Join request expired.' });
    response.json({ offer: join.offer, answered: Boolean(join.answer) });
  });

  router.post('/rooms/:roomId/joins/:requestId/answer', (request, response) => {
    const join = guestJoin(request.params.roomId, request.params.requestId, request.header('authorization'));
    if (!join || typeof request.body?.answer !== 'string' || request.body.answer.length > 48_000) return response.sendStatus(400);
    join.answer = request.body.answer;
    response.sendStatus(204);
  });

  router.delete('/rooms/:roomId/joins/:requestId', (request, response) => {
    const join = guestJoin(request.params.roomId, request.params.requestId, request.header('authorization'));
    if (!join) return response.sendStatus(404);
    rooms.get(request.params.roomId)?.joins.delete(join.id);
    response.sendStatus(204);
  });

  router.get('/ice-servers', (_, response) => response.json({ iceServers: iceServers() }));
  return router;
}

function hostRoom(roomId: string, authorization?: string) {
  const room = rooms.get(roomId);
  return room && authorization === `Bearer ${room.hostToken}` ? room : undefined;
}

function guestJoin(roomId: string, requestId: string, authorization?: string) {
  const join = rooms.get(roomId)?.joins.get(requestId);
  return join && authorization === `Bearer ${join.token}` ? join : undefined;
}

function publicRoom(room: Room): PublicRoom { return { id: room.id, hostName: room.hostName, maxPlayers: room.maxPlayers, playerCount: room.playerCount, state: room.state }; }
function shortId(prefix: string) { return `${prefix}-${crypto.randomBytes(5).toString('base64url')}`; }
function token() { return crypto.randomBytes(24).toString('base64url'); }
function cleanName(value: unknown) { return typeof value === 'string' ? value.replace(/[^a-z0-9 _-]/gi, '').trim().slice(0, 24) : ''; }
function purgeExpired() {
  const now = Date.now();
  for (const room of rooms.values()) {
    for (const join of room.joins.values()) if (now - join.createdAt > JOIN_TTL_MS) room.joins.delete(join.id);
    if (now - room.updatedAt > ROOM_TTL_MS) rooms.delete(room.id);
  }
}
function iceServers(): RTCIceServer[] {
  const urls = process.env.TURN_URLS?.split(',').map(url => url.trim()).filter(Boolean) || [];
  const turn = urls.length && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL
    ? [{ urls, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL }] : [];
  return [{ urls: 'stun:stun.l.google.com:19302' }, ...turn];
}
