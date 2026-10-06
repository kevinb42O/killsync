import { FriendsTerrain, type TerrainSnapshot } from '../world/FriendsTerrain';
import { meshTerrainChunk } from '../world/FriendsTerrainMesh';
let terrain = new FriendsTerrain();
self.onmessage = (event: MessageEvent<{ snapshot?: TerrainSnapshot; cx?: number; cy?: number; epoch: number }>) => {
  const request = event.data;
  if (request.snapshot) { terrain.restore(request.snapshot); return; }
  if (request.cx === undefined || request.cy === undefined) return;
  const mesh = meshTerrainChunk(terrain, request.cx, request.cy);
  self.postMessage({ cx: request.cx, cy: request.cy, epoch: request.epoch, mesh }, { transfer: [mesh.positions.buffer, mesh.normals.buffer, mesh.uv.buffer, mesh.colors.buffer, mesh.glow.buffer] });
};
