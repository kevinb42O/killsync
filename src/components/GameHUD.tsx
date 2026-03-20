import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Skull, Coins, Flame, AlertTriangle } from 'lucide-react';
import { GameEngine } from '../game/Engine';
import { WEAPON_DEFINITIONS } from '../constants';

export function GameHUD({ engine }: { engine: GameEngine | null }) {
  const [hudData, setHudData] = useState<any>(null);

  useEffect(() => {
    let frameId: number;
    const syncHud = () => {
      if (engine && engine.gameState === 'PLAYING') {
        setHudData({
          level: engine.player.level,
          experience: engine.player.experience,
          experienceToNextLevel: engine.player.experienceToNextLevel,
          health: engine.player.health,
          maxHealth: engine.player.maxHealth,
          killCount: engine.killCount,
          gameTime: engine.gameTime,
          coins: engine.player.coins,
          exfillState: engine.exfillState,
          exfillTimer: engine.exfillTimer,
          exfillEscapeTimer: engine.exfillEscapeTimer,
          exfillDisabledTimer: engine.exfillDisabledTimer,
          exfillExtractTimer: engine.exfillExtractTimer,
          exfillExtractRequired: engine.EXFILL_EXTRACT_STAY_REQUIRED,
          weaponDamageStats: { ...engine.weaponDamageStats },
          comboCount: engine.comboCount,
          comboMax: engine.COMBO_MAX,
          isOverdrive: engine.isOverdrive,
          overdriveTimer: engine.overdriveTimer,
          overdriveMax: engine.OVERDRIVE_DURATION,
          pendingDataCores: engine.player.pendingDataCores,
          activeEvents: engine.eventManager.getActiveEventsInfo(),
          bountyTarget: engine.eventManager.bountyTarget,
          pressureLevel: engine.eventManager.getPressureLevel(),
          nightmareMode: engine.eventManager.nightmareMode,
        });
      }
      frameId = requestAnimationFrame(syncHud);
    };
    frameId = requestAnimationFrame(syncHud);
    return () => cancelAnimationFrame(frameId);
  }, [engine]);

  if (!hudData) return null;

  return (
    <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between z-40">
      <div className="w-full max-w-2xl mx-auto">
        <div className="flex justify-between items-end mb-2">
          <span className="text-xs font-mono text-cyan-400 uppercase tracking-widest">Level {hudData.level}</span>
          <span className="text-xs font-mono text-cyan-400 uppercase tracking-widest">
            {Math.floor(hudData.gameTime / 60000)}:
            {Math.floor((hudData.gameTime % 60000) / 1000).toString().padStart(2, '0')}
          </span>
        </div>
        <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden border border-white/5">
          <motion.div
            className="h-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]"
            initial={{ width: 0 }}
            animate={{ width: `${(hudData.experience / hudData.experienceToNextLevel) * 100}%` }}
            transition={{ type: 'tween', duration: 0.1 }}
          />
        </div>
      </div>

       <div className="absolute top-6 left-6">
        <div className="w-48 h-4 bg-white/10 rounded-lg overflow-hidden border border-white/5 relative">
          <motion.div
            className="h-full bg-red-500"
            animate={{ width: `${(hudData.health / hudData.maxHealth) * 100}%` }}
            transition={{ type: 'tween', duration: 0.1 }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold uppercase drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
            HP {Math.ceil(hudData.health)}
          </div>
        </div>
      </div>

      {/* CARNAGE METER (Top Right) */}
      <div className="absolute top-6 right-6 flex flex-col items-end">
        <div className={`w-48 h-4 bg-white/10 rounded-lg overflow-hidden border relative transition-colors duration-300 ${hudData.isOverdrive ? 'border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.5)]' : 'border-white/5'}`}>
          <motion.div
            className={`h-full ${hudData.isOverdrive ? 'bg-gradient-to-r from-orange-400 to-red-600' : 'bg-orange-500'}`}
            animate={{ 
              width: hudData.isOverdrive 
                ? `${(hudData.overdriveTimer / hudData.overdriveMax) * 100}%` 
                : `${(hudData.comboCount / hudData.comboMax) * 100}%` 
            }}
            transition={{ type: 'tween', duration: 0.1 }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black uppercase drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] italic tracking-tighter">
            {hudData.isOverdrive ? 'OVERDRIVE ACTIVE' : `CARNAGE ${hudData.comboCount}`}
          </div>
        </div>
        {hudData.isOverdrive && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-1 flex items-center gap-1 text-[10px] font-black text-orange-400 italic uppercase"
          >
            <Flame size={12} className="animate-pulse" />
            2.5x Fire Rate
          </motion.div>
        )}
      </div>

      <div className="absolute bottom-6 left-6 z-40">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-mono text-white/50">
            <Skull size={14} />
            <span>{hudData.killCount} Kills</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-yellow-400">
            <Coins size={14} />
            <span>{hudData.coins} Coins</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-white">
            <div className="w-3 h-3 bg-white rounded-sm rotate-45 border border-cyan-400 shadow-[0_0_5px_rgba(34,211,238,0.5)]" />
            <span>{hudData.pendingDataCores} DATA CORES</span>
          </div>
        </div>
      </div>

      {/* Exfill Status HUD */}
      {hudData.exfillState && hudData.exfillState !== 'idle' && (
        <div className="flex justify-center mt-4">
          {hudData.exfillState === 'activating' && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-6 py-2.5 bg-yellow-500/10 border border-yellow-500/30 rounded-xl backdrop-blur-sm"
            >
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-xs font-mono text-yellow-400 uppercase tracking-widest">
                  Extracting: {Math.ceil(hudData.exfillTimer / 1000)}s
                </span>
              </div>
            </motion.div>
          )}
          {hudData.exfillState === 'escaping' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: [0.7, 1, 0.7], scale: [1, 1.02, 1] }}
              transition={{ repeat: Infinity, duration: 0.5 }}
              className={`px-6 py-3 border-2 rounded-xl backdrop-blur-sm ${
                hudData.exfillExtractTimer > 0 
                  ? 'bg-red-500/15 border-red-400/60' 
                  : 'bg-cyan-500/15 border-cyan-400/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full animate-ping ${hudData.exfillExtractTimer > 0 ? 'bg-red-400' : 'bg-cyan-400'}`} />
                <span className={`text-sm font-bold font-mono uppercase tracking-widest ${hudData.exfillExtractTimer > 0 ? 'text-red-400' : 'text-cyan-400'}`}>
                  {hudData.exfillExtractTimer > 0 
                    ? `EXTRACTING ${Math.round((hudData.exfillExtractTimer / hudData.exfillExtractRequired) * 100)}%`
                    : `ESCAPE NOW! ${Math.ceil(hudData.exfillEscapeTimer / 1000)}s`
                  }
                </span>
              </div>
            </motion.div>
          )}
          {hudData.exfillState === 'disabled' && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 0.7, y: 0 }}
              className="px-5 py-2 bg-red-500/10 border border-red-500/20 rounded-xl backdrop-blur-sm"
            >
              <span className="text-[10px] font-mono text-red-400/70 uppercase tracking-widest">
                Exfill Disabled: {Math.ceil(hudData.exfillDisabledTimer / 1000)}s
              </span>
            </motion.div>
          )}
        </div>
      )}

      {/* DPS METER */}
      <div className="absolute top-14 left-6 w-48 flex flex-col gap-1 z-40 pointer-events-none">
        
        {/* Active Events */}
        <AnimatePresence>
          {hudData.activeEvents && hudData.activeEvents.length > 0 && hudData.activeEvents.map((ev: any, idx: number) => (
            <motion.div
              key={ev.type}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="relative bg-black/50 border rounded px-2 py-1 overflow-hidden backdrop-blur-md"
              style={{ borderColor: ev.color + '40' }}
            >
              <div
                className="absolute left-0 top-0 bottom-0 transition-all"
                style={{
                  width: `${(ev.remaining / 30000) * 100}%`,
                  backgroundColor: ev.color + '20',
                }}
              />
              <div className="relative flex justify-between items-center">
                <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: ev.color }}>
                  {ev.label}
                </span>
                <span className="text-[9px] font-mono text-white/70">
                  {Math.ceil(ev.remaining / 1000)}s
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Bounty Target */}
        <AnimatePresence>
          {hudData.bountyTarget && !hudData.bountyTarget.claimed && (
            <motion.div
              initial={{ opacity: 0, x: -20, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="relative bg-yellow-500/10 border border-yellow-500/30 rounded px-2 py-1.5 overflow-hidden backdrop-blur-md"
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-[9px] font-black text-yellow-400 uppercase tracking-wider">BOUNTY</div>
                  <div className="text-[8px] font-mono text-yellow-300/70">{hudData.bountyTarget.name}</div>
                </div>
                <span className={`text-[11px] font-mono font-bold ${hudData.bountyTarget.timeLimit < 5000 ? 'text-red-400 animate-pulse' : 'text-yellow-400'}`}>
                  {Math.ceil(hudData.bountyTarget.timeLimit / 1000)}s
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Nightmare badge */}
        {hudData.nightmareMode && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-950/40 border border-red-500/30 rounded">
            <Skull size={8} className="text-red-400" />
            <span className="text-[8px] font-black uppercase tracking-wider text-red-400">Nightmare</span>
          </div>
        )}

        {/* Threat pressure indicator */}
        {hudData.pressureLevel && hudData.pressureLevel.multiplier > 1.15 && (
          <div className="flex items-center gap-1.5 px-2 py-0.5">
            <AlertTriangle size={8} style={{ color: hudData.pressureLevel.color }} />
            <span className="text-[8px] font-mono uppercase tracking-wider" style={{ color: hudData.pressureLevel.color, opacity: 0.7 }}>
              {hudData.pressureLevel.label}
            </span>
            <span className="text-[8px] font-mono text-white/25">×{hudData.pressureLevel.multiplier.toFixed(1)}</span>
          </div>
        )}

        <AnimatePresence>
          {hudData.weaponDamageStats && Object.keys(hudData.weaponDamageStats).length > 0 && (() => {
            const stats = Object.entries(hudData.weaponDamageStats)
              .map(([id, dmg]) => {
                const def = WEAPON_DEFINITIONS.find(w => w.id === id);
                return {
                  id,
                  name: def ? def.name : id,
                  damage: Number(dmg),
                  dps: Number(dmg) / Math.max(1, hudData.gameTime / 1000)
                };
              })
              .sort((a, b) => b.damage - a.damage);

            const maxDamage = stats[0]?.damage || 1;

            return stats.slice(0, 6).map((stat, idx) => (
              <motion.div
                key={stat.id}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative bg-black/40 border border-white/5 rounded p-1 overflow-hidden backdrop-blur-md"
              >
                {/* Progress bar background */}
                <div 
                  className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-orange-500/20 to-red-500/10"
                  style={{ width: `${(stat.damage / maxDamage) * 100}%` }}
                />
                
                <div className="relative flex justify-between items-center px-1">
                  <span className="text-[9px] font-bold text-white uppercase truncate pr-2 z-10">
                    <span className="text-white/40 mr-1.5">{idx + 1}</span>
                    {stat.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-mono text-orange-400 z-10 hidden sm:inline-block">
                      {Math.round(stat.damage).toLocaleString()}
                    </span>
                    <span className="text-[8px] font-mono text-white/70 whitespace-nowrap z-10">
                      {Math.round(stat.dps)} DPS
                    </span>
                  </div>
                </div>
              </motion.div>
            ));
          })()}
        </AnimatePresence>
      </div>
    </div>
  );
}
