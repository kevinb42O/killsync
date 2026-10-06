import { frontierTrees } from '../multiplayer/FriendsFrontier';
import { FRONTIER_SIZE, TERRAIN_CHUNK } from '../world/FriendsTerrain';
self.onmessage = () => {
  const trees = [];
  for (let x = 0; x < Math.ceil(FRONTIER_SIZE / TERRAIN_CHUNK); x++)
    for (let y = 0; y < Math.ceil(FRONTIER_SIZE / TERRAIN_CHUNK); y++) trees.push(...frontierTrees(x, y));
  self.postMessage(trees);
};
