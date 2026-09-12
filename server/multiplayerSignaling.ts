import { Router } from 'express';
import crypto from 'node:crypto';
import { COOP_MAX_PLAYERS } from '../src/game/multiplayer/protocol';

const ROOM_TTL_MS = 45_000;
const JOIN_TTL_MS = 45_000;
const MAX_ROOMS = 250;
const MAX_PENDING_JOINS_PER_ROOM = 8;
const MAX_SPECTATORS_PER_ROOM = 4;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_PER_WINDOW = 180;
const TURN_CREDENTIAL_TTL_SECONDS = 600;

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
  code?: string;
  hostToken: string;
  hostName: string;
  maxPlayers: number;
  playerCount: number;
  state: 'waiting' | 'in_game';
  updatedAt: number;
  joins: Map<string, Join>;
};

export type PublicRoom = Pick<Room, 'id' | 'code' | 'hostName' | 'maxPlayers' | 'playerCount' | 'state'>;

const rooms = new Map<string, Room>();
const requestRates = new Map<string, { startedAt: number; count: number }>();

export function createMultiplayerRouter() {
  const router = Router();
  router.use((_, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Access-Control-Allow-Origin', process.env.MULTIPLAYER_CORS_ORIGIN || '*');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    next();
  });
  router.options('*', (_, response) => response.sendStatus(204));
  router.use((request, response, next) => {
    const now = Date.now();
    const key = request.ip || request.socket.remoteAddress || 'unknown';
    const current = requestRates.get(key);
    const bucket = !current || now - current.startedAt >= RATE_WINDOW_MS ? { startedAt: now, count: 0 } : current;
    bucket.count++;
    requestRates.set(key, bucket);
    response.setHeader('RateLimit-Limit', String(RATE_LIMIT_PER_WINDOW));
    response.setHeader('RateLimit-Remaining', String(Math.max(0, RATE_LIMIT_PER_WINDOW - bucket.count)));
    if (bucket.count > RATE_LIMIT_PER_WINDOW) {
      response.setHeader('Retry-After', String(Math.ceil((bucket.startedAt + RATE_WINDOW_MS - now) / 1000)));
      return response.status(429).json({ error: 'Too many signaling requests. Try again shortly.' });
    }
    next();
  });

  router.get('/rooms', (_, response) => {
    purgeExpired();
    response.json({ rooms: [...rooms.values()].map(publicRoom).filter(room => room.state === 'in_game' || room.playerCount < room.maxPlayers) });
  });

  router.post('/rooms', (request, response) => {
    purgeExpired();
    if (rooms.size >= MAX_ROOMS) return response.status(503).json({ error: 'Lobby service is full. Try again shortly.' });
    const hostName = cleanName(request.body?.hostName) || 'OPERATIVE';
    const maxPlayers = Math.max(2, Math.min(COOP_MAX_PLAYERS, Number(request.body?.maxPlayers) || COOP_MAX_PLAYERS));
    const code = cleanCode(request.body?.code);
    const id = cleanId(request.body?.id) || (code ? `room-${code.toLowerCase()}` : shortId('room'));
    // A second host must never silently replace a live lobby just because a
    // memorable room code (or caller-provided id) collides with it.
    if (rooms.has(id)) return response.status(409).json({ error: 'That lobby code is already active. Choose another code.' });
    const room: Room = {
      id, code: code || id, hostToken: token(), hostName, maxPlayers, playerCount: 1,
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
    const pendingJoins = [...room.joins.values()].filter(join => !join.answer).length;
    if (pendingJoins >= MAX_PENDING_JOINS_PER_ROOM) return response.status(429).json({ error: 'This squad has too many pending joins.' });
    const spectators = [...room.joins.values()].filter(join => join.spectate).length;
    if (spectate && spectators >= MAX_SPECTATORS_PER_ROOM) return response.status(409).json({ error: 'This squad has no spectator slots left.' });
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

function publicRoom(room: Room): PublicRoom { return { id: room.id, code: room.code, hostName: room.hostName, maxPlayers: room.maxPlayers, playerCount: room.playerCount, state: room.state }; }
function shortId(prefix: string) { return `${prefix}-${crypto.randomBytes(5).toString('base64url')}`; }
function token() { return crypto.randomBytes(24).toString('base64url'); }
function cleanName(value: unknown) { return typeof value === 'string' ? value.replace(/[^a-z0-9 _-]/gi, '').trim().slice(0, 24) : ''; }
function cleanCode(value: unknown) { return typeof value === 'string' ? value.replace(/[^a-z0-9-]/gi, '').trim().toUpperCase().slice(0, 16) : ''; }
function cleanId(value: unknown) { return typeof value === 'string' ? value.replace(/[^a-z0-9-]/gi, '').trim().slice(0, 32) : ''; }
function purgeExpired() {
  const now = Date.now();
  for (const room of rooms.values()) {
    for (const join of room.joins.values()) if (now - join.createdAt > JOIN_TTL_MS) room.joins.delete(join.id);
    if (now - room.updatedAt > ROOM_TTL_MS) rooms.delete(room.id);
  }
  for (const [key, bucket] of requestRates) if (now - bucket.startedAt > RATE_WINDOW_MS * 2) requestRates.delete(key);
}
function iceServers(): RTCIceServer[] {
  const urls = process.env.TURN_URLS?.split(',').map(url => url.trim()).filter(Boolean) || [];
  const sharedSecret = process.env.TURN_SHARED_SECRET;
  const expiresAt = Math.floor(Date.now() / 1000) + TURN_CREDENTIAL_TTL_SECONDS;
  const username = `${expiresAt}:coop-${crypto.randomBytes(6).toString('base64url')}`;
  const turn = urls.length && sharedSecret
    ? [{ urls, username, credential: crypto.createHmac('sha1', sharedSecret).update(username).digest('base64') }] : [];
  return [{ urls: 'stun:stun.l.google.com:19302' }, ...turn];
}
