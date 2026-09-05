import { describe, expect, it, vi } from 'vitest';
import type { GameEngine } from './Engine';
import { EventManager } from './EventManager';

vi.mock('./SoundManager', () => ({
  soundManager: {
    playCollect: vi.fn(),
    playExplosion: vi.fn(),
    playLevelUp: vi.fn(),
    playTreasureSpawn: vi.fn(),
  },
}));

function createEngineStub(): GameEngine {
  const engine = {
    gameTime: 0,
    killCount: 0,
    difficultyMultiplier: 1,
    canvas: { width: 1280, height: 720 },
    player: {
      position: { x: 1500, y: 1500 },
      radius: 18,
      speed: 4,
      health: 50,
      maxHealth: 100,
    },
    enemies: [],
    items: [],
    gems: [],
    damageTexts: [],
    portals: [],
    reviveInvulnTimer: 0,
    gameState: 'PLAYING',
    screenShake: 0,
    camera: { x: 0, y: 0 },
    findClearEnemySpawnPosition: (position: { x: number; y: number }) => position,
    hasEnemyCapacity: () => true,
    createExplosion: vi.fn(),
    processPlayerDeath: vi.fn(),
    abortExfill: vi.fn(),
  };
  return engine as unknown as GameEngine;
}

describe('event enemies', () => {
  it('keeps a supply crate locked until its linked guard is eliminated', () => {
    const manager = new EventManager();
    const engine = createEngineStub();

    manager.triggerWaveEvents(4, engine, true);

    expect(manager.supplyCrates).toHaveLength(1);
    expect(engine.enemies).toHaveLength(1);
    const crate = manager.supplyCrates[0];
    const guard = engine.enemies[0];
    expect(crate.guardEnemyId).toBe(guard.id);
    engine.player.position = { x: crate.x, y: crate.y };

    manager.update(16, engine);
    expect(manager.supplyCrates).toHaveLength(1);
    expect(engine.player.health).toBe(50);

    manager.onEnemyKilled(guard.id, guard.position.x, guard.position.y, engine);
    engine.enemies.splice(0, 1);
    manager.update(16, engine);

    expect(manager.supplyCrates).toHaveLength(0);
    expect(engine.player.health).toBe(75);
  });

  it('does not create event enemies when the world cap has no reserve', () => {
    const manager = new EventManager();
    const engine = createEngineStub();
    engine.hasEnemyCapacity = () => false;

    manager.triggerWaveEvents(12, engine, true);

    expect(engine.enemies).toHaveLength(0);
    expect(manager.supplyCrates).toHaveLength(0);
    expect(manager.bountyTarget).toBeNull();
  });
});
