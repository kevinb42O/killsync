import type { CSSProperties } from 'react';

export type HudThreat = {
  id?: string | number;
  dx: number;
  dy: number;
  dist: number;
  type: string;
  color?: string;
  /** Top-down callers can determine viewport visibility exactly. */
  offscreen?: boolean;
};

export type ThreatIndicator = {
  sector: number;
  count: number;
  nearestDistance: number;
  screenX: number;
  screenY: number;
  rotation: number;
  boss: boolean;
  urgent: boolean;
  color: string;
};

const TAU = Math.PI * 2;
const SECTOR_COUNT = 8;
const BOSS_TYPES = new Set(['boss', 'titan']);

function wrapAngle(angle: number) {
  while (angle > Math.PI) angle -= TAU;
  while (angle < -Math.PI) angle += TAU;
  return angle;
}

/**
 * Turns an arbitrary enemy crowd into at most three quiet edge cues. Enemies
 * sharing a direction are deliberately aggregated, preventing a wave from
 * turning the HUD into a ring of arrows.
 */
export function buildThreatIndicators({
  threats,
  facingAngle,
  width,
  height,
  perspective = true,
  ads = false,
  maxIndicators = 3,
}: {
  threats: HudThreat[];
  facingAngle: number;
  width: number;
  height: number;
  perspective?: boolean;
  ads?: boolean;
  maxIndicators?: number;
}): ThreatIndicator[] {
  if (width <= 0 || height <= 0 || maxIndicators <= 0) return [];

  // The rendered world camera is 108 degrees wide (68 while aiming). Leave a
  // little hysteresis at the edge so cues do not flicker beside a visible foe.
  const visibleHalfAngle = ads ? 0.64 : 0.99;
  const groups = new Map<number, { threats: HudThreat[]; x: number; y: number }>();

  for (const threat of threats) {
    if (!Number.isFinite(threat.dist) || threat.dist <= 0) continue;
    const boss = BOSS_TYPES.has(threat.type);
    // Ordinary enemies beyond this range already live on the radar and are not
    // immediately actionable. Bosses remain trackable anywhere in the arena.
    if (!boss && threat.dist > 1_800) continue;

    const worldAngle = Math.atan2(threat.dy, threat.dx);
    const relative = wrapAngle(worldAngle - facingAngle);
    const isOffscreen = threat.offscreen ?? (!perspective || Math.abs(relative) > visibleHalfAngle);
    if (!isOffscreen) continue;

    // Screen-space zero points upward: left/right remains intuitive relative
    // to the live camera while enemies behind the player settle at the bottom.
    const screenAngle = perspective ? relative - Math.PI / 2 : worldAngle;
    const x = Math.cos(screenAngle);
    const y = Math.sin(screenAngle);
    const sector = ((Math.round((screenAngle / TAU) * SECTOR_COUNT) % SECTOR_COUNT) + SECTOR_COUNT) % SECTOR_COUNT;
    const group = groups.get(sector) || { threats: [], x: 0, y: 0 };
    const weight = boss ? 2.5 : 1 / Math.max(0.55, threat.dist / 700);
    group.threats.push(threat);
    group.x += x * weight;
    group.y += y * weight;
    groups.set(sector, group);
  }

  const candidates = [...groups.entries()].map(([sector, group]) => {
    const nearest = Math.min(...group.threats.map(threat => threat.dist));
    const bossThreat = group.threats.find(threat => BOSS_TYPES.has(threat.type));
    const length = Math.hypot(group.x, group.y) || 1;
    const directionX = group.x / length;
    const directionY = group.y / length;
    const halfWidth = Math.max(30, width / 2 - Math.min(54, width * 0.06));
    const halfHeight = Math.max(30, height / 2 - Math.min(54, height * 0.075));
    const edgeScale = Math.min(
      halfWidth / Math.max(0.001, Math.abs(directionX)),
      halfHeight / Math.max(0.001, Math.abs(directionY)),
    );
    const urgent = nearest < 360;
    return {
      sector,
      count: group.threats.length,
      nearestDistance: nearest,
      screenX: width / 2 + directionX * edgeScale,
      screenY: height / 2 + directionY * edgeScale,
      rotation: Math.atan2(directionY, directionX) * 180 / Math.PI + 90,
      boss: Boolean(bossThreat),
      urgent,
      color: bossThreat?.color || (urgent ? '#fb7185' : '#fda4af'),
      score: (bossThreat ? 10_000 : 0) + (urgent ? 4_000 : 0) + group.threats.length * 180 - nearest,
    };
  });

  return candidates
    .sort((left, right) => right.score - left.score)
    .slice(0, maxIndicators)
    .map(({ score: _score, ...indicator }) => indicator);
}

export function OffscreenThreatIndicators({
  threats,
  facingAngle,
  width,
  height,
  perspective = true,
  ads = false,
}: {
  threats: HudThreat[];
  facingAngle: number;
  width: number;
  height: number;
  perspective?: boolean;
  ads?: boolean;
}) {
  const indicators = buildThreatIndicators({ threats, facingAngle, width, height, perspective, ads });
  if (!indicators.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[79] overflow-hidden" aria-hidden="true">
      {indicators.map(indicator => {
        const style = {
          left: indicator.screenX,
          top: indicator.screenY,
          color: indicator.color,
          opacity: indicator.boss ? 0.95 : indicator.urgent ? 0.82 : 0.56,
          '--threat-rotation': `${indicator.rotation}deg`,
        } as CSSProperties;
        return (
          <div
            key={indicator.sector}
            className={`offscreen-threat ${indicator.urgent ? 'offscreen-threat--urgent' : ''} ${indicator.boss ? 'offscreen-threat--boss' : ''}`}
            style={style}
          >
            <span className="offscreen-threat__chevron" />
            {(indicator.count > 1 || indicator.boss) && (
              <span className="offscreen-threat__count">{indicator.boss ? '!' : `×${indicator.count}`}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
