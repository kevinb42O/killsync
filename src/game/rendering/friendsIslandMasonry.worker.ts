import { meshIslandRuins } from '../world/FriendsIslandRuinMesh';

self.onmessage = () => {
  const mesh = meshIslandRuins();
  self.postMessage(mesh, { transfer: [mesh.positions.buffer, mesh.normals.buffer, mesh.uv.buffer] });
};
