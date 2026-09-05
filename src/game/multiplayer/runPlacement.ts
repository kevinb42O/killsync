import { GAME_HEIGHT, GAME_WIDTH } from '../../constants';
import { isWorldPositionClear } from '../world/WorldLayout';

export function findClearRunPosition(desired: { x: number; y: number }, radius: number) {
  const margin = radius + 20;
  const origin = { x: Math.max(margin, Math.min(GAME_WIDTH - margin, desired.x)), y: Math.max(margin, Math.min(GAME_HEIGHT - margin, desired.y)) };
  for (let ring = 0; ring <= 24; ring++) {
    const samples = ring === 0 ? 1 : 24;
    for (let sample = 0; sample < samples; sample++) {
      const angle = sample / samples * Math.PI * 2;
      const x = origin.x + Math.cos(angle) * ring * 50;
      const y = origin.y + Math.sin(angle) * ring * 50;
      if (x < margin || y < margin || x > GAME_WIDTH - margin || y > GAME_HEIGHT - margin) continue;
      if (isWorldPositionClear(x, y, radius)) return { x, y };
    }
  }
  return { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 };
}