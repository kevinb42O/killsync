import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Crosshair, Shield, Zap, Activity, AlertTriangle, Clock, Target, Skull, Eye, ChevronRight, Flame, Snowflake, Radio, CircleDot } from 'lucide-react';
import { ENEMY_TYPES, WEAPON_DEFINITIONS, ITEM_TYPES } from '../constants';
import { soundManager } from '../game/SoundManager';

// ─── Types ─────────────────────────────────────────────────────
type TabId = 'hostiles' | 'events' | 'armaments' | 'drops';

interface EnemyEntry {
  key: string;
  name: string;
  health: number;
  speed: number;
  damage: number;
  radius: number;
  xp: number;
  color: string;
  visual: string;
  spawnTime: string;
  threatLevel: number; // 1-5
  description: string;
  behavior: string;
  tip: string;
}

interface EventEntry {
  id: string;
  name: string;
  triggerTime: string;
  duration: string;
  dangerLevel: number; // 1-5
  color: string;
  icon: string;
  description: string;
  effect: string;
  survivalTip: string;
  reward: string;
}

// ─── Data ──────────────────────────────────────────────────────
const ENEMY_DATABASE: EnemyEntry[] = [
  { key: 'basic', ...ENEMY_TYPES.basic, spawnTime: '0:00', threatLevel: 1, description: 'Standard surveillance drone. Low threat individually but lethal in swarms.', behavior: 'Moves directly toward the operator at a constant pace. No special abilities.', tip: 'Early fodder — use them to build your combo meter for Overdrive.' },
  { key: 'fast', ...ENEMY_TYPES.fast, spawnTime: '2:00', threatLevel: 2, description: 'Lightweight reconnaissance unit with boosted servos. Flanks and overwhelms.', behavior: 'Faster approach speed. Tends to come in clusters from multiple directions.', tip: 'Area weapons like Void Aura handle Scout packs efficiently.' },
  { key: 'tank', ...ENEMY_TYPES.tank, spawnTime: '5:00', threatLevel: 3, description: 'Armored heavy unit with reinforced plating. Absorbs massive punishment.', behavior: 'Slow but extremely durable. High contact damage — avoid melee range.', tip: 'High-penetration weapons and Might upgrades cut through their armor.' },
  { key: 'ranged', ...ENEMY_TYPES.ranged, spawnTime: '8:00', threatLevel: 3, description: 'Long-range threat with targeting systems. Maintains distance while engaging.', behavior: 'Higher speed with moderate health. Approaches quickly and deals consistent damage.', tip: 'Prioritize with homing weapons. Phantom Chain locks them down.' },
  { key: 'elite', ...ENEMY_TYPES.elite, spawnTime: '12:00', threatLevel: 4, description: 'Advanced combat unit with reinforced neural shielding. Drops Data Cores on kill.', behavior: 'Large hitbox, high HP pool. Pushes through projectiles via sheer durability.', tip: 'Always worth killing — guaranteed Data Core drop. Focus fire immediately.' },
  { key: 'phantom', ...ENEMY_TYPES.phantom, spawnTime: '15:00', threatLevel: 4, description: 'Phase-shifted entity that flickers through the grid. Extremely fast and elusive.', behavior: 'Highest base speed in the game. Low health but hard to target due to speed.', tip: 'Area weapons and Frost Aura slow them to manageable speeds.' },
  { key: 'titan', ...ENEMY_TYPES.titan, spawnTime: '20:00', threatLevel: 5, description: 'Colossal war machine. The largest non-boss threat in the grid. Massive damage.', behavior: 'Very slow but enormous hitbox. Devastating contact damage — one touch can end a run.', tip: 'Kite at max range. Stack Might and Boss Damage upgrades for efficient kills.' },
];

const BOSS_ENTRY: EnemyEntry = {
  key: 'boss', name: 'Sector Boss', health: 9999, speed: 1.2, damage: 99, radius: 80, xp: 1000, color: '#ff0066',
  visual: 'boss', spawnTime: '2:00 / 5:00 / 10:00 / 20:00', threatLevel: 5,
  description: 'Apex threat entity. Spawns at key time intervals with scaling health/damage. Percentage-based hits bypass armor.',
  behavior: 'Deals % max HP damage per hit (1s cooldown). Gets stronger with each spawn. Drops diamond coins and Data Cores.',
  tip: 'Titan Slayer perm upgrade is essential. Stay mobile — the 1s hit cooldown is your survival window.'
};

const EVENT_DATABASE: EventEntry[] = [
  { id: 'blackout', name: 'Blackout Protocol', triggerTime: 'Wave 15', duration: '35s', dangerLevel: 1, color: '#00ffff', icon: 'zap', description: 'Grid power fluctuation amplifies neural data streams.', effect: '1.8× XP multiplier on all kills during the event.', survivalTip: 'Go aggressive — kill everything. This is your power spike moment.', reward: 'Bonus XP on all kills during the window' },
  { id: 'system_breach', name: 'System Breach', triggerTime: 'Waves 5 & 25', duration: '30s', dangerLevel: 3, color: '#ff4444', icon: 'alert', description: 'Security protocols compromised. Enemy portals activate across the grid.', effect: 'All enemies spawn from portal locations. Exfill portals disabled and any active extraction is aborted.', survivalTip: 'Stay near the center. Avoid getting pinched between portal spawn points.', reward: 'Portals restored on survival' },
  { id: 'bounty_target', name: 'Bounty Target', triggerTime: 'Every 3rd wave', duration: '15s', dangerLevel: 2, color: '#ffd700', icon: 'target', description: 'High-value golden elite detected. Eliminate within the time limit.', effect: 'A golden elite spawns with a countdown timer. Kill it for a gem burst + possible Data Core.', survivalTip: 'Drop everything and focus fire. The bounty vanishes if the timer runs out.', reward: '6× Gold gems + 50% chance at Data Core + Silver Coin' },
  { id: 'supply_drop', name: 'Supply Drop', triggerTime: 'Every 4th wave', duration: 'Until collected', dangerLevel: 2, color: '#00ccff', icon: 'package', description: 'Emergency supply crate deployed nearby. Guarded by a Goliath-class enemy.', effect: 'Glowing crate spawns at range. A tough guard protects it. Collect for healing and possible gear.', survivalTip: 'Kill the guard first. The +25 HP can save a losing run.', reward: '+25 HP + 35% chance at Data Core' },
  { id: 'data_storm', name: 'Data Storm', triggerTime: 'Waves 10 & 30', duration: '18s', dangerLevel: 3, color: '#00ffff', icon: 'storm', description: 'A wall of corrupted data sweeps across the grid.', effect: 'Cyan particle wall moves horizontally or vertically. Drops XP gems in its path but deals 16 DPS on contact. Can kill if you remain in the wall.', survivalTip: 'Follow behind the wall to collect free XP. Never stand in it — it can kill you.', reward: 'Free XP gems & coins in storm path' },
  { id: 'nano_plague', name: 'Nano Plague', triggerTime: 'Wave 20', duration: '50s', dangerLevel: 4, color: '#00ff44', icon: 'biohazard', description: 'Nanite contamination event. Enemy corpses release toxic residue.', effect: '60% of kills spawn toxic pools dealing 16 DPS for 7 seconds. Pools can kill — revive mechanic applies.', survivalTip: 'Keep moving. Never fight in one spot — the pools stack up fast.', reward: 'Survival endurance test — no direct reward' },
  { id: 'firewall_collapse', name: 'Firewall Collapse', triggerTime: 'Wave 35 (Wave 18 on Nightmare)', duration: '35s', dangerLevel: 5, color: '#ff0000', icon: 'fire', description: 'Grid boundary systems failing. The arena shrinks.', effect: 'Arena walls close in by up to 520px. 26 DPS outside boundary. Enemies pushed inward. Revive mechanic active if owned.', survivalTip: 'Move to center IMMEDIATELY. The damage outside is lethal in seconds.', reward: 'Rare treasure chest on survival' },
];

const WEAPON_TYPE_COLORS: Record<string, string> = {
  projectile: '#00ffff',
  area: '#a855f7',
  orbit: '#f97316',
};

const ITEM_DATABASE = [
  { id: 'hp', name: 'Repair Kit', color: '#ff3366', shape: 'heart', description: 'Restores 30 HP on pickup.', source: 'Enemy drops, Supply Crates' },
  { id: 'coin_bronze', name: 'Bronze Coin', color: '#cd7f32', shape: 'circle', description: 'Worth 2 gold. Common drop.', source: 'Basic enemies (15% chance)' },
  { id: 'coin_silver', name: 'Silver Coin', color: '#c0c0c0', shape: 'circle', description: 'Worth 10 gold. Uncommon.', source: 'Tank & Elite enemies' },
  { id: 'coin_gold', name: 'Gold Coin', color: '#ffd700', shape: 'circle', description: 'Worth 20 gold. Rare find.', source: 'Bounty Targets, rare drops' },
  { id: 'coin_diamond', name: 'Diamond Coin', color: '#b9f2ff', shape: 'diamond', description: 'Worth 100 gold. Extremely rare.', source: 'Boss kills only' },
  { id: 'magnet', name: 'Magnet Pulse', color: '#00ccff', shape: 'magnet', description: 'Instantly attracts all nearby gems.', source: 'Item Holder enemies' },
  { id: 'bomb', name: 'EMP Charge', color: '#ff8800', shape: 'bomb', description: 'Kills all nearby non-boss enemies.', source: 'Item Holder enemies' },
  { id: 'data_core', name: 'Data Core', color: '#ffffff', shape: 'star', description: 'Rare currency for elite upgrades in the Neural Lab. Collected via Exfill.', source: 'Elite kills, Boss kills, Event rewards' },
  { id: 'xp_gem', name: 'XP Gem', color: '#00ff88', shape: 'gem', description: 'Experience crystal. Value varies by enemy killed.', source: 'All enemy kills' },
];

// ─── Canvas Drawing Helpers ────────────────────────────────────
function drawEnemyVisual(ctx: CanvasRenderingContext2D, visual: string, color: string, cx: number, cy: number, r: number, time: number) {
  ctx.save();
  
  // Glow
  ctx.shadowColor = color;
  ctx.shadowBlur = 15 + Math.sin(time * 3) * 5;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  switch (visual) {
    case 'circle': {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      // Inner eye
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(cx + r * 0.2, cy - r * 0.1, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(cx + r * 0.25, cy - r * 0.1, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'triangle': {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx - r * 0.9, cy + r * 0.7);
      ctx.lineTo(cx + r * 0.9, cy + r * 0.7);
      ctx.closePath();
      ctx.fill();
      // Center dot
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.1, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'square': {
      const half = r * 0.8;
      ctx.fillRect(cx - half, cy - half, half * 2, half * 2);
      // X mark
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - half * 0.5, cy - half * 0.5);
      ctx.lineTo(cx + half * 0.5, cy + half * 0.5);
      ctx.moveTo(cx + half * 0.5, cy - half * 0.5);
      ctx.lineTo(cx - half * 0.5, cy + half * 0.5);
      ctx.stroke();
      break;
    }
    case 'diamond': {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.7, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r * 0.7, cy);
      ctx.closePath();
      ctx.fill();
      // Center circle
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.25, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'hexagon': {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const hx = cx + r * Math.cos(angle);
        const hy = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.fill();
      // Inner hex
      ctx.fillStyle = color + '40';
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const hx = cx + r * 0.5 * Math.cos(angle);
        const hy = cy + r * 0.5 * Math.sin(angle);
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'ghost': {
      // Body
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.2, r * 0.8, Math.PI, 0);
      ctx.lineTo(cx + r * 0.8, cy + r * 0.6);
      // Wavy bottom
      for (let i = 4; i >= 0; i--) {
        const wx = cx - r * 0.8 + (r * 1.6 / 4) * i;
        const wy = cy + r * 0.6 + Math.sin(time * 4 + i * 1.5) * r * 0.2;
        ctx.lineTo(wx, wy);
      }
      ctx.closePath();
      ctx.globalAlpha = 0.7 + Math.sin(time * 2) * 0.3;
      ctx.fill();
      ctx.globalAlpha = 1;
      // Eyes
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(cx - r * 0.25, cy - r * 0.3, r * 0.15, 0, Math.PI * 2);
      ctx.arc(cx + r * 0.25, cy - r * 0.3, r * 0.15, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'star': {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        const sr = i % 2 === 0 ? r : r * 0.45;
        const sx = cx + sr * Math.cos(angle);
        const sy = cy + sr * Math.sin(angle);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.fill();
      // Pulse ring
      ctx.globalAlpha = 0.3 + Math.sin(time * 2) * 0.2;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      const pulseR = r * 1.3 + Math.sin(time * 3) * 5;
      ctx.beginPath();
      ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    }
    case 'boss': {
      // Menacing compound shape
      const pulse = 1 + Math.sin(time * 2) * 0.05;
      // Outer ring
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.2 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      // Core body - octagon
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI / 4) * i - Math.PI / 8;
        const ox = cx + r * 0.9 * Math.cos(angle);
        const oy = cy + r * 0.9 * Math.sin(angle);
        if (i === 0) ctx.moveTo(ox, oy);
        else ctx.lineTo(ox, oy);
      }
      ctx.closePath();
      ctx.fill();
      // Inner skull-like markings
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(cx - r * 0.25, cy - r * 0.15, r * 0.18, 0, Math.PI * 2);
      ctx.arc(cx + r * 0.25, cy - r * 0.15, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx - r * 0.25, cy - r * 0.15, r * 0.08, 0, Math.PI * 2);
      ctx.arc(cx + r * 0.25, cy - r * 0.15, r * 0.08, 0, Math.PI * 2);
      ctx.fill();
      // Mouth
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.3, cy + r * 0.2);
      ctx.lineTo(cx + r * 0.3, cy + r * 0.2);
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
}

function drawItemVisual(ctx: CanvasRenderingContext2D, shape: string, color: string, cx: number, cy: number, r: number, time: number) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 10 + Math.sin(time * 3) * 3;
  ctx.fillStyle = color;

  switch (shape) {
    case 'heart': {
      ctx.beginPath();
      const topY = cy - r * 0.3;
      ctx.moveTo(cx, cy + r * 0.7);
      ctx.bezierCurveTo(cx - r * 1.2, cy - r * 0.2, cx - r * 0.6, topY - r * 0.7, cx, topY);
      ctx.bezierCurveTo(cx + r * 0.6, topY - r * 0.7, cx + r * 1.2, cy - r * 0.2, cx, cy + r * 0.7);
      ctx.fill();
      break;
    }
    case 'circle': {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      // Shine
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(cx - r * 0.25, cy - r * 0.25, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'diamond': {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.6, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r * 0.6, cy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.6);
      ctx.lineTo(cx + r * 0.3, cy);
      ctx.lineTo(cx, cy + r * 0.2);
      ctx.lineTo(cx - r * 0.1, cy);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'magnet': {
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.7, Math.PI, 0);
      ctx.stroke();
      ctx.fillRect(cx - r * 0.7, cy - 2, 5, r * 0.7);
      ctx.fillRect(cx + r * 0.7 - 5, cy - 2, 5, r * 0.7);
      break;
    }
    case 'bomb': {
      ctx.beginPath();
      ctx.arc(cx, cy + 2, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
      // Fuse
      ctx.strokeStyle = '#ffaa00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy + 2 - r * 0.7);
      ctx.quadraticCurveTo(cx + r * 0.3, cy - r, cx + r * 0.2, cy - r * 1.1);
      ctx.stroke();
      // Spark
      ctx.fillStyle = '#ffff00';
      ctx.shadowColor = '#ffff00';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(cx + r * 0.2, cy - r * 1.1, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'star': {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI / 4) * i - Math.PI / 2;
        const sr = i % 2 === 0 ? r : r * 0.4;
        const sx = cx + sr * Math.cos(angle);
        const sy = cy + sr * Math.sin(angle);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.fill();
      // Inner glow
      ctx.fillStyle = 'rgba(0,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'gem': {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.7, cy - r * 0.3);
      ctx.lineTo(cx + r * 0.5, cy + r);
      ctx.lineTo(cx - r * 0.5, cy + r);
      ctx.lineTo(cx - r * 0.7, cy - r * 0.3);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }

  ctx.restore();
}

// ─── Animated Canvas for enemy previews ────────────────────────
function EnemyCanvas({ visual, color, size = 80 }: { visual: string; color: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const startTime = useRef(Date.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const animate = () => {
      const t = (Date.now() - startTime.current) / 1000;
      ctx.clearRect(0, 0, size, size);
      
      // Background glow
      const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grad.addColorStop(0, color + '15');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      drawEnemyVisual(ctx, visual, color, size / 2, size / 2, size * 0.28, t);
      animRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => cancelAnimationFrame(animRef.current);
  }, [visual, color, size]);

  return <canvas ref={canvasRef} style={{ width: size, height: size }} className="flex-shrink-0" />;
}

function ItemCanvas({ shape, color, size = 48 }: { shape: string; color: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const startTime = useRef(Date.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const animate = () => {
      const t = (Date.now() - startTime.current) / 1000;
      ctx.clearRect(0, 0, size, size);
      drawItemVisual(ctx, shape, color, size / 2, size / 2, size * 0.3, t);
      animRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => cancelAnimationFrame(animRef.current);
  }, [shape, color, size]);

  return <canvas ref={canvasRef} style={{ width: size, height: size }} className="flex-shrink-0" />;
}

// ─── Stat Bar Component ────────────────────────────────────────
function StatBar({ label, value, maxValue, color, delay = 0 }: { label: string; value: number; maxValue: number; color: string; delay?: number }) {
  const pct = Math.min((value / maxValue) * 100, 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-white/40 uppercase tracking-wider w-10 text-right font-mono">{label}</span>
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, delay, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${color}80, ${color})` }}
        />
      </div>
      <span className="text-[10px] text-white/50 font-mono w-8">{value}</span>
    </div>
  );
}

// ─── Threat Level Indicators ───────────────────────────────────
function ThreatPips({ level, max = 5 }: { level: number; max?: number }) {
  return (
    <div className="flex gap-1 items-center">
      {Array.from({ length: max }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: i * 0.06, type: 'spring' }}
          className={`w-2.5 h-2.5 rounded-sm ${i < level ? '' : 'bg-white/10'}`}
          style={i < level ? {
            background: level >= 5 ? '#ff0000' : level >= 4 ? '#ff6600' : level >= 3 ? '#ffaa00' : level >= 2 ? '#ffdd00' : '#00ff88',
            boxShadow: `0 0 6px ${level >= 5 ? '#ff000060' : level >= 4 ? '#ff660060' : level >= 3 ? '#ffaa0060' : level >= 2 ? '#ffdd0060' : '#00ff8860'}`
          } : {}}
        />
      ))}
    </div>
  );
}

// ─── Danger Level Badge ────────────────────────────────────────
function DangerBadge({ level }: { level: number }) {
  const labels = ['SAFE', 'LOW', 'MEDIUM', 'HIGH', 'EXTREME', 'LETHAL'];
  const colors = ['#00ff88', '#00ff88', '#ffdd00', '#ffaa00', '#ff6600', '#ff0000'];
  return (
    <span
      className="text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest"
      style={{ color: colors[level], background: colors[level] + '15', border: `1px solid ${colors[level]}30` }}
    >
      {labels[level]}
    </span>
  );
}

// ─── Timeline Dot ──────────────────────────────────────────────
function SpawnTimeline({ spawnTime, color }: { spawnTime: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <Clock size={11} className="text-white/30" />
      <span className="text-[10px] font-mono text-white/50">Appears at</span>
      <span className="text-[11px] font-mono font-bold" style={{ color }}>{spawnTime}</span>
    </div>
  );
}

// ─── Tab Button ────────────────────────────────────────────────
function TabButton({ active, label, count, onClick, color }: { active: boolean; label: string; count: number; onClick: () => void; color: string }) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => soundManager.playUIHover()}
      className={`relative px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] transition-all rounded-lg ${
        active ? 'text-black' : 'text-white/40 hover:text-white/70 bg-white/[0.02] hover:bg-white/[0.05]'
      }`}
      style={active ? { background: color, boxShadow: `0 0 20px ${color}40` } : {}}
    >
      <span className="relative z-10">{label}</span>
      <span className={`ml-2 text-[10px] ${active ? 'text-black/50' : 'text-white/20'}`}>({count})</span>
    </button>
  );
}

// ─── Main Component ────────────────────────────────────────────
interface IntelArchiveProps {
  onBack: () => void;
}

export function IntelArchive({ onBack }: IntelArchiveProps) {
  const [activeTab, setActiveTab] = useState<TabId>('hostiles');
  const [selectedEnemy, setSelectedEnemy] = useState<EnemyEntry | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventEntry | null>(null);

  const allEnemies = [...ENEMY_DATABASE, BOSS_ENTRY];
  const tabColors: Record<TabId, string> = {
    hostiles: '#ff4444',
    events: '#ffaa00',
    armaments: '#00ffff',
    drops: '#00ff88',
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 flex flex-col z-[70] overflow-hidden"
    >
      {/* BG layers */}
      <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl pointer-events-none z-0" />
      <div className="absolute inset-0 bg-cover bg-center pointer-events-none opacity-15 mix-blend-screen z-0" style={{ backgroundImage: `url('/neon_cityscape_bg.png')` }} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.85)_100%)] pointer-events-none z-0" />
      {/* Scanline effect */}
      <div className="absolute inset-0 pointer-events-none z-[1] opacity-[0.03]" style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)' }} />

      {/* Header */}
      <div className="relative z-10 px-8 pt-6 pb-4 border-b border-white/10">
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={() => { soundManager.playUIClick(); onBack(); }}
            onMouseEnter={() => soundManager.playUIHover()}
            className="flex items-center gap-2 text-white/50 hover:text-white transition-colors uppercase font-bold tracking-widest text-sm"
          >
            <ArrowLeft size={20} />
            Back to Menu
          </button>
          <div className="flex items-center gap-2 text-white/20 text-[10px] uppercase tracking-[0.3em] font-mono">
            <Radio size={12} className="text-cyan-500 animate-pulse" />
            Live Grid Intel
          </div>
        </div>

        <div className="text-center mb-6">
          <motion.h2
            initial={{ y: -10 }}
            animate={{ y: 0 }}
            className="text-4xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-yellow-500 to-cyan-500 tracking-tighter"
          >
            INTEL ARCHIVE
          </motion.h2>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: '80px' }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="h-[2px] bg-gradient-to-r from-transparent via-white/30 to-transparent mx-auto mt-2"
          />
          <p className="text-white/30 text-[10px] uppercase tracking-[0.4em] mt-2 font-mono">Classified Threat Analysis // Operator Eyes Only</p>
        </div>

        {/* Tabs */}
        <div className="flex justify-center gap-2">
          <TabButton active={activeTab === 'hostiles'} label="Hostiles" count={allEnemies.length} onClick={() => { soundManager.playUIClick(); setActiveTab('hostiles'); setSelectedEnemy(null); }} color={tabColors.hostiles} />
          <TabButton active={activeTab === 'events'} label="Grid Events" count={EVENT_DATABASE.length} onClick={() => { soundManager.playUIClick(); setActiveTab('events'); setSelectedEvent(null); }} color={tabColors.events} />
          <TabButton active={activeTab === 'armaments'} label="Armaments" count={WEAPON_DEFINITIONS.length} onClick={() => { soundManager.playUIClick(); setActiveTab('armaments'); }} color={tabColors.armaments} />
          <TabButton active={activeTab === 'drops'} label="Field Drops" count={ITEM_DATABASE.length} onClick={() => { soundManager.playUIClick(); setActiveTab('drops'); }} color={tabColors.drops} />
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 overflow-y-auto p-8">
        <div className="max-w-6xl mx-auto">
          <AnimatePresence mode="wait">
            {/* ─── HOSTILES TAB ───────────────────────────────── */}
            {activeTab === 'hostiles' && (
              <motion.div key="hostiles" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
                {selectedEnemy ? (
                  // Detail View
                  <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="max-w-3xl mx-auto">
                    <button
                      onClick={() => { soundManager.playUIClick(); setSelectedEnemy(null); }}
                      onMouseEnter={() => soundManager.playUIHover()}
                      className="flex items-center gap-2 text-white/40 hover:text-white text-xs uppercase tracking-widest mb-6 transition-colors"
                    >
                      <ArrowLeft size={14} /> Back to roster
                    </button>

                    <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
                      {/* Header band */}
                      <div className="p-6 border-b border-white/10 flex items-center gap-6" style={{ background: `linear-gradient(135deg, ${selectedEnemy.color}08, transparent)` }}>
                        <EnemyCanvas visual={selectedEnemy.visual} color={selectedEnemy.color} size={100} />
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-3xl font-black uppercase tracking-tight" style={{ color: selectedEnemy.color }}>{selectedEnemy.name}</h3>
                            <DangerBadge level={selectedEnemy.threatLevel} />
                          </div>
                          <p className="text-white/50 text-sm leading-relaxed mb-3">{selectedEnemy.description}</p>
                          <SpawnTimeline spawnTime={selectedEnemy.spawnTime} color={selectedEnemy.color} />
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="p-6 border-b border-white/10">
                        <div className="text-[10px] text-white/30 uppercase tracking-[0.3em] font-bold mb-4">Combat Statistics</div>
                        <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                          <StatBar label="HP" value={selectedEnemy.health} maxValue={1000} color={selectedEnemy.color} delay={0.1} />
                          <StatBar label="DMG" value={selectedEnemy.damage} maxValue={50} color="#ff4444" delay={0.2} />
                          <StatBar label="SPD" value={Math.round(selectedEnemy.speed * 100)} maxValue={200} color="#ffaa00" delay={0.3} />
                          <StatBar label="XP" value={selectedEnemy.xp} maxValue={500} color="#00ff88" delay={0.4} />
                        </div>
                        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/5">
                          <div className="text-[10px] text-white/30 uppercase tracking-wider">Threat Level</div>
                          <ThreatPips level={selectedEnemy.threatLevel} />
                          <div className="text-[10px] text-white/30 uppercase tracking-wider ml-auto">Hitbox</div>
                          <span className="text-[11px] font-mono text-white/50">{selectedEnemy.radius}px</span>
                        </div>
                      </div>

                      {/* Behavior & Tips */}
                      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <Eye size={14} className="text-white/30" />
                            <span className="text-[10px] text-white/30 uppercase tracking-[0.3em] font-bold">Behavior Pattern</span>
                          </div>
                          <p className="text-white/50 text-sm leading-relaxed">{selectedEnemy.behavior}</p>
                        </div>
                        <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <AlertTriangle size={14} className="text-cyan-400" />
                            <span className="text-[10px] text-cyan-400/70 uppercase tracking-[0.3em] font-bold">Operator Tip</span>
                          </div>
                          <p className="text-cyan-100/60 text-sm leading-relaxed">{selectedEnemy.tip}</p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  // Grid View
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {allEnemies.map((enemy, i) => (
                      <motion.button
                        key={enemy.key}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        onClick={() => { soundManager.playUIClick(); setSelectedEnemy(enemy); }}
                        onMouseEnter={() => soundManager.playUIHover()}
                        className="group flex items-center gap-4 p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl hover:bg-white/[0.05] hover:border-white/15 transition-all text-left cursor-pointer"
                      >
                        <EnemyCanvas visual={enemy.visual} color={enemy.color} size={64} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold text-sm uppercase tracking-wide" style={{ color: enemy.color }}>{enemy.name}</h4>
                            <ThreatPips level={enemy.threatLevel} />
                          </div>
                          <p className="text-white/30 text-xs truncate">{enemy.description}</p>
                          <div className="flex items-center gap-4 mt-2">
                            <span className="text-[10px] font-mono text-white/30">HP {enemy.health}</span>
                            <span className="text-[10px] font-mono text-white/30">DMG {enemy.damage}</span>
                            <SpawnTimeline spawnTime={enemy.spawnTime} color={enemy.color} />
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-white/10 group-hover:text-white/30 transition-colors flex-shrink-0" />
                      </motion.button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ─── EVENTS TAB ─────────────────────────────────── */}
            {activeTab === 'events' && (
              <motion.div key="events" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
                {selectedEvent ? (
                  <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="max-w-3xl mx-auto">
                    <button
                      onClick={() => { soundManager.playUIClick(); setSelectedEvent(null); }}
                      onMouseEnter={() => soundManager.playUIHover()}
                      className="flex items-center gap-2 text-white/40 hover:text-white text-xs uppercase tracking-widest mb-6 transition-colors"
                    >
                      <ArrowLeft size={14} /> Back to events
                    </button>

                    <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
                      <div className="p-8 border-b border-white/10 text-center" style={{ background: `linear-gradient(180deg, ${selectedEvent.color}10, transparent)` }}>
                        {/* Animated event icon */}
                        <motion.div
                          animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
                          transition={{ duration: 3, repeat: Infinity }}
                          className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4"
                          style={{ background: selectedEvent.color + '15', border: `1px solid ${selectedEvent.color}30` }}
                        >
                          {selectedEvent.icon === 'zap' && <Zap size={36} style={{ color: selectedEvent.color }} />}
                          {selectedEvent.icon === 'alert' && <AlertTriangle size={36} style={{ color: selectedEvent.color }} />}
                          {selectedEvent.icon === 'target' && <Target size={36} style={{ color: selectedEvent.color }} />}
                          {selectedEvent.icon === 'package' && <Shield size={36} style={{ color: selectedEvent.color }} />}
                          {selectedEvent.icon === 'storm' && <Activity size={36} style={{ color: selectedEvent.color }} />}
                          {selectedEvent.icon === 'biohazard' && <Skull size={36} style={{ color: selectedEvent.color }} />}
                          {selectedEvent.icon === 'fire' && <Flame size={36} style={{ color: selectedEvent.color }} />}
                        </motion.div>
                        <h3 className="text-3xl font-black uppercase tracking-tight mb-2" style={{ color: selectedEvent.color }}>{selectedEvent.name}</h3>
                        <DangerBadge level={selectedEvent.dangerLevel} />
                        <p className="text-white/40 text-sm mt-4 max-w-md mx-auto leading-relaxed">{selectedEvent.description}</p>
                      </div>

                      <div className="p-6 border-b border-white/10 grid grid-cols-2 gap-4">
                        <div className="bg-white/[0.03] rounded-xl p-4">
                          <div className="text-[10px] text-white/30 uppercase tracking-[0.3em] font-bold mb-2">Trigger</div>
                          <div className="font-mono text-sm" style={{ color: selectedEvent.color }}>{selectedEvent.triggerTime}</div>
                        </div>
                        <div className="bg-white/[0.03] rounded-xl p-4">
                          <div className="text-[10px] text-white/30 uppercase tracking-[0.3em] font-bold mb-2">Duration</div>
                          <div className="font-mono text-sm text-white/70">{selectedEvent.duration}</div>
                        </div>
                      </div>

                      <div className="p-6 space-y-5">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Zap size={13} className="text-white/30" />
                            <span className="text-[10px] text-white/30 uppercase tracking-[0.3em] font-bold">Effect</span>
                          </div>
                          <p className="text-white/50 text-sm leading-relaxed">{selectedEvent.effect}</p>
                        </div>

                        <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle size={13} className="text-cyan-400" />
                            <span className="text-[10px] text-cyan-400/70 uppercase tracking-[0.3em] font-bold">Survival Strategy</span>
                          </div>
                          <p className="text-cyan-100/60 text-sm leading-relaxed">{selectedEvent.survivalTip}</p>
                        </div>

                        <div className="bg-yellow-500/5 border border-yellow-500/10 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <CircleDot size={13} className="text-yellow-400" />
                            <span className="text-[10px] text-yellow-400/70 uppercase tracking-[0.3em] font-bold">Reward</span>
                          </div>
                          <p className="text-yellow-100/60 text-sm leading-relaxed">{selectedEvent.reward}</p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <div className="space-y-3">
                    {/* Timeline visualization */}
                    <div className="mb-8 bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
                      <div className="text-[10px] text-white/30 uppercase tracking-[0.3em] font-bold mb-4">Event Timeline</div>
                      <div className="relative h-10">
                        {/* Timeline line */}
                        <div className="absolute top-1/2 left-0 right-0 h-px bg-white/10" />
                        {/* Time markers */}
                        {[0, 2, 3, 5, 7, 8, 10, 14, 15, 16, 20].map(min => (
                          <div key={min} className="absolute top-0 bottom-0 flex flex-col items-center" style={{ left: `${(min / 20) * 100}%` }}>
                            <div className="w-px h-2 bg-white/20" />
                            <div className="text-[8px] font-mono text-white/20 mt-auto">{min}m</div>
                          </div>
                        ))}
                        {/* Event dots */}
                        {EVENT_DATABASE.map((evt, i) => {
                          const mins = parseInt(evt.triggerTime) || 0;
                          const left = Math.min((mins / 20) * 100, 95);
                          return (
                            <motion.div
                              key={evt.id}
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ delay: i * 0.08, type: 'spring' }}
                              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full cursor-pointer hover:scale-150 transition-transform"
                              style={{ left: `${left}%`, background: evt.color, boxShadow: `0 0 8px ${evt.color}60` }}
                              onClick={() => { soundManager.playUIClick(); setSelectedEvent(evt); }}
                              title={evt.name}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {EVENT_DATABASE.map((evt, i) => (
                      <motion.button
                        key={evt.id}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        onClick={() => { soundManager.playUIClick(); setSelectedEvent(evt); }}
                        onMouseEnter={() => soundManager.playUIHover()}
                        className="group w-full flex items-center gap-5 p-5 bg-white/[0.02] border border-white/[0.06] rounded-xl hover:bg-white/[0.05] hover:border-white/15 transition-all text-left cursor-pointer"
                      >
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: evt.color + '15', border: `1px solid ${evt.color}25` }}>
                          {evt.icon === 'zap' && <Zap size={22} style={{ color: evt.color }} />}
                          {evt.icon === 'alert' && <AlertTriangle size={22} style={{ color: evt.color }} />}
                          {evt.icon === 'target' && <Target size={22} style={{ color: evt.color }} />}
                          {evt.icon === 'package' && <Shield size={22} style={{ color: evt.color }} />}
                          {evt.icon === 'storm' && <Activity size={22} style={{ color: evt.color }} />}
                          {evt.icon === 'biohazard' && <Skull size={22} style={{ color: evt.color }} />}
                          {evt.icon === 'fire' && <Flame size={22} style={{ color: evt.color }} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <h4 className="font-bold text-sm uppercase tracking-wide" style={{ color: evt.color }}>{evt.name}</h4>
                            <DangerBadge level={evt.dangerLevel} />
                          </div>
                          <p className="text-white/30 text-xs truncate">{evt.description}</p>
                          <div className="flex items-center gap-4 mt-2">
                            <span className="text-[10px] font-mono text-white/30"><Clock size={10} className="inline mr-1" />{evt.triggerTime}</span>
                            <span className="text-[10px] font-mono text-white/30">Duration: {evt.duration}</span>
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-white/10 group-hover:text-white/30 transition-colors flex-shrink-0" />
                      </motion.button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ─── ARMAMENTS TAB ───────────────────────────────── */}
            {activeTab === 'armaments' && (
              <motion.div key="armaments" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
                {/* Type legend */}
                <div className="flex items-center justify-center gap-6 mb-6">
                  {Object.entries(WEAPON_TYPE_COLORS).map(([type, color]) => (
                    <div key={type} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}60` }} />
                      <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">{type}</span>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {WEAPON_DEFINITIONS.map((weapon, i) => {
                    const typeColor = WEAPON_TYPE_COLORS[weapon.type] || '#ffffff';
                    return (
                      <motion.div
                        key={weapon.id}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="relative p-5 bg-white/[0.02] border border-white/[0.06] rounded-xl hover:bg-white/[0.04] transition-all group"
                      >
                        {/* Type badge */}
                        <div className="absolute top-3 right-3">
                          <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider" style={{ color: typeColor, background: typeColor + '15', border: `1px solid ${typeColor}25` }}>
                            {weapon.type}
                          </span>
                        </div>

                        {/* Weapon icon */}
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style={{ background: typeColor + '10', border: `1px solid ${typeColor}20` }}>
                          <Crosshair size={18} style={{ color: typeColor }} />
                        </div>

                        <h4 className="font-bold text-sm uppercase tracking-wide mb-1" style={{ color: typeColor }}>{weapon.name}</h4>
                        <p className="text-white/30 text-xs leading-relaxed mb-4 min-h-[32px]">{weapon.description}</p>

                        {/* Stats */}
                        <div className="space-y-1.5 mb-3">
                          <StatBar label="DMG" value={weapon.baseDamage} maxValue={100} color="#ff4444" delay={i * 0.03} />
                          <StatBar label="CD" value={Math.round(weapon.baseCooldown / 100)} maxValue={100} color="#ffaa00" delay={i * 0.03 + 0.1} />
                          <StatBar label="SIZE" value={weapon.baseSize} maxValue={350} color="#00ff88" delay={i * 0.03 + 0.2} />
                        </div>

                        {/* Evolution */}
                        <div className="flex items-center gap-2 pt-3 border-t border-white/5">
                          <Zap size={10} className="text-yellow-500" />
                          <span className="text-[10px] text-white/25 uppercase tracking-wider">Evolves to</span>
                          <span className="text-[10px] font-bold text-yellow-500/70 uppercase tracking-wide">{weapon.evolution.replace(/_/g, ' ')}</span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* ─── DROPS TAB ──────────────────────────────────── */}
            {activeTab === 'drops' && (
              <motion.div key="drops" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {ITEM_DATABASE.map((item, i) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="flex items-start gap-4 p-5 bg-white/[0.02] border border-white/[0.06] rounded-xl hover:bg-white/[0.04] transition-all"
                    >
                      <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: item.color + '10' }}>
                        <ItemCanvas shape={item.shape} color={item.color} size={48} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-sm uppercase tracking-wide mb-1" style={{ color: item.color }}>{item.name}</h4>
                        <p className="text-white/40 text-xs leading-relaxed mb-2">{item.description}</p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-white/20 uppercase tracking-wider">Source:</span>
                          <span className="text-[10px] text-white/35 font-mono">{item.source}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Magnetic mechanics info box */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="mt-6 p-5 bg-cyan-500/5 border border-cyan-500/10 rounded-xl"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Snowflake size={14} className="text-cyan-400" />
                    <span className="text-[10px] text-cyan-400/70 uppercase tracking-[0.3em] font-bold">Magnet Mechanics</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-lg font-black text-cyan-400">200px</div>
                      <div className="text-[10px] text-white/30 uppercase">Gem Range</div>
                    </div>
                    <div>
                      <div className="text-lg font-black text-cyan-400">150px</div>
                      <div className="text-[10px] text-white/30 uppercase">Item Range</div>
                    </div>
                    <div>
                      <div className="text-lg font-black text-cyan-400">250px</div>
                      <div className="text-[10px] text-white/30 uppercase">Treasure Range</div>
                    </div>
                  </div>
                  <p className="text-white/30 text-xs mt-3 text-center">All ranges scale with your Magnet Range stat multiplier</p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
