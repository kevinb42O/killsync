import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Skull, Coins, Flame, AlertTriangle, Shield, HeartPulse, Bomb, Navigation } from 'lucide-react';
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
           exfillExtractRequired: 0, // Placeholder
          pendingDataCores: engine.player.pendingDataCores,
          weaponDamageStats: { ...engine.weaponDamageStats },
          comboCount: engine.comboCount,
          comboMax: engine.COMBO_MAX,
          isOverdrive: engine.isOverdrive,
          overdriveTimer: engine.overdriveTimer,
          overdriveMax: engine.OVERDRIVE_DURATION,
          bountyTarget: engine.eventManager.bountyTarget,
          pressureLevel: engine.eventManager.getPressureLevel(),
          nightmareMode: engine.eventManager.nightmareMode,
          currentWave: engine.player.currentWave,
          waveTimer: engine.waveTimer,
          waveDuration: engine.waveDuration,
          canvasWidth: engine.canvas.width,
          canvasHeight: engine.canvas.height,
          autoUpgrade: engine.recentAutoUpgrade && engine.recentAutoUpgrade.expiresAt > engine.gameTime
            ? { ...engine.recentAutoUpgrade }
            : null,
          systemNotice: engine.recentSystemNotice && engine.recentSystemNotice.expiresAt > engine.gameTime
            ? { ...engine.recentSystemNotice }
            : null,
          autoControls: {
            rerollsLeft: engine.getRemainingRerollsThisWave(),
            rerollCost: engine.getRerollCost(),
            queuedRerolls: engine.getQueuedAutoRerolls(),
            banishes: engine.player.banishes,
            skips: engine.player.skips,
            queuedSkips: engine.getQueuedAutoSkips(),
          },
          loadoutWeapons: engine.player.weapons.map(w => ({
            id: w.id,
            name: w.name,
            description: w.description,
            level: w.level,
            maxLevel: w.maxLevel,
          })),
          loadoutUpgrades: engine.player.upgrades.map((u: any) => ({
            id: u.id,
            name: u.name,
            description: u.description,
            level: u.level || 1,
            type: u.type || 'stat',
          })),
          inventory: engine.player.inventory,
          armorHp: engine.player.armorHp,
          maxArmorHp: engine.getMaxArmorHp(),
          shops: engine.shops.map(s => {
            const dx = s.position.x - engine.player.position.x;
            const dy = s.position.y - engine.player.position.y;
            return {
              dist: Math.sqrt(dx * dx + dy * dy),
              angle: Math.atan2(dy, dx)
            };
          }).sort((a, b) => a.dist - b.dist)[0] || null
        });
      }
      frameId = requestAnimationFrame(syncHud);
    };
    frameId = requestAnimationFrame(syncHud);
    return () => cancelAnimationFrame(frameId);
  }, [engine]);

  if (!hudData) return null;

  const iconSize = 28;
  const iconPadding = 6;
  const viewportWidth = Math.max(320, Number(hudData.canvasWidth) || 1280);
  const xpRegionWidth = Math.min(672, viewportWidth - 80);
  const regionStartX = Math.round((viewportWidth - xpRegionWidth) / 2);
  const weaponsY = 72;
  const upgradesY = weaponsY + iconSize + iconPadding;
  const loadoutWeapons = hudData.loadoutWeapons || [];
  const loadoutUpgrades = hudData.loadoutUpgrades || [];

  const weaponHoverSlots = loadoutWeapons.map((weapon: any, index: number) => {
    const step = loadoutWeapons.length <= 1 ? 0 : (xpRegionWidth - iconSize) / (loadoutWeapons.length - 1);
    const x = Math.round(regionStartX + index * step);
    return {
      key: `weapon-${weapon.id}-${index}`,
      x,
      y: weaponsY,
      name: weapon.name,
      description: weapon.description,
      meta: `Weapon • Lv ${weapon.level}/${weapon.maxLevel}`,
      accent: 'text-cyan-200 border-cyan-300/60'
    };
  });

  const upgradeHoverSlots = loadoutUpgrades.map((upgrade: any, index: number) => {
    const step = loadoutUpgrades.length <= 1 ? 0 : (xpRegionWidth - iconSize) / (loadoutUpgrades.length - 1);
    const x = Math.round(regionStartX + index * step);
    const typeLabel = upgrade.type === 'dash' ? 'Dash Skill' : upgrade.type === 'weapon' ? 'Weapon' : 'Skill';
    const accent = upgrade.type === 'dash' ? 'text-orange-200 border-orange-300/60' : 'text-yellow-200 border-yellow-300/60';
    return {
      key: `upgrade-${upgrade.id}-${index}`,
      x,
      y: upgradesY,
      name: upgrade.name,
      description: upgrade.description,
      meta: `${typeLabel} • Lv ${upgrade.level}`,
      accent,
    };
  });

  const hoverSlots = [...weaponHoverSlots, ...upgradeHoverSlots];

  return (
    <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between z-40">
      <div className="w-full max-w-2xl mx-auto">
        <div className="flex justify-between items-end mb-2">
          <span className="text-xs font-mono text-cyan-400 uppercase tracking-widest">WAVE {hudData.currentWave}</span>
          <span className="text-xs font-mono text-cyan-400 uppercase tracking-widest">
            LVL : {hudData.level}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden border border-white/5">
            <motion.div
              className="h-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]"
              initial={{ width: 0 }}
              animate={{ width: `${(hudData.experience / hudData.experienceToNextLevel) * 100}%` }}
              transition={{ type: 'tween', duration: 0.1 }}
            />
          </div>
          <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden border border-white/5">
            <motion.div
              className="h-full bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]"
              initial={{ width: 0 }}
              animate={{ width: `${(hudData.waveTimer / hudData.waveDuration) * 100}%` }}
              transition={{ type: 'tween', duration: 0.1 }}
            />
          </div>
        </div>

      </div>

      <AnimatePresence>
        {hudData.autoUpgrade && (
          <motion.div
            key={`${hudData.autoUpgrade.id}-${hudData.autoUpgrade.expiresAt}`}
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="absolute top-14 left-1/2 -translate-x-1/2 z-[85] pointer-events-none"
          >
            <div className="px-3 py-1.5 rounded-full border border-cyan-400/35 bg-black/70 backdrop-blur-sm shadow-[0_0_18px_rgba(34,211,238,0.25)]">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">
                Auto Upgrade: {hudData.autoUpgrade.name}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {hudData.systemNotice && (
          <motion.div
            key={`${hudData.systemNotice.text}-${hudData.systemNotice.expiresAt}`}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="absolute top-24 left-1/2 -translate-x-1/2 z-[85] pointer-events-none"
          >
            <div className="px-3 py-1 rounded-full border bg-black/70 backdrop-blur-sm"
              style={{ borderColor: `${hudData.systemNotice.color}66` }}>
              <span className="text-[10px] font-black uppercase tracking-[0.13em]"
                style={{ color: hudData.systemNotice.color }}>
                {hudData.systemNotice.text}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Invisible hover zones + tooltips over original canvas top loadout bar */}
      <div className="absolute inset-0 z-[88] pointer-events-none">
        {hoverSlots.map(slot => (
          <div
            key={slot.key}
            className="group absolute pointer-events-auto"
            style={{ left: slot.x, top: slot.y, width: iconSize, height: iconSize }}
          >
            <div className="w-full h-full opacity-0" />
            <div className={`absolute left-1/2 top-full mt-2 -translate-x-1/2 w-60 rounded-md border bg-gradient-to-b from-[#111113] to-[#070708] px-3 py-2 shadow-[0_12px_30px_rgba(0,0,0,0.65)] opacity-0 group-hover:opacity-100 transition-opacity duration-120 pointer-events-none z-[90] ${slot.accent}`}>
              <div className="text-[11px] font-bold tracking-wide">{slot.name}</div>
              <div className="text-[10px] text-white/75 mt-1 leading-snug">{slot.description}</div>
              <div className="mt-2 text-[10px] font-mono text-white/80">{slot.meta}</div>
            </div>
          </div>
        ))}
      </div>

       <div className="absolute top-6 left-6 flex flex-col gap-1">
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
        {hudData.maxArmorHp > 0 && (
          <div className="w-48 h-2 bg-white/5 rounded-full overflow-hidden border border-cyan-500/20 relative mt-1">
            <motion.div
              className="h-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"
              animate={{ width: `${(hudData.armorHp / hudData.maxArmorHp) * 100}%` }}
              transition={{ type: 'tween', duration: 0.1 }}
            />
          </div>
        )}
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
        <div className="mt-2 flex items-center gap-2 text-[10px] font-mono text-white/55">
          <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">R: REROLL {hudData.autoControls.queuedRerolls > 0 ? `(${hudData.autoControls.queuedRerolls})` : ''}</span>
          <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">B: BANISH {hudData.autoControls.banishes}</span>
          <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">K: SKIP {hudData.autoControls.queuedSkips > 0 ? `(${hudData.autoControls.queuedSkips})` : hudData.autoControls.skips}</span>
          <span className="text-white/35">
            RR {hudData.autoControls.rerollsLeft}/3 • Cost {hudData.autoControls.rerollCost ?? 'MAX'}
          </span>
        </div>
      </div>

      {/* Inventory Display (Bottom Right) */}
      <div className="absolute bottom-6 right-6 flex items-end gap-3 z-40">
        {hudData.inventory?.hasRevive && (
          <div className="flex items-center gap-2 bg-black/60 border border-red-500/30 px-3 py-1.5 rounded-lg backdrop-blur-sm">
            <HeartPulse size={16} className="text-red-400 animate-pulse" />
            <span className="text-xs font-bold text-red-100 uppercase tracking-widest">Revive Active</span>
          </div>
        )}
        
        {hudData.inventory?.nukeCount > 0 && (
          <div className="flex flex-col items-center gap-1 bg-black/60 border border-orange-500/30 px-3 py-1.5 rounded-lg backdrop-blur-sm relative cursor-pointer group">
            <div className="flex items-center gap-2">
              <Bomb size={16} className="text-orange-400 group-hover:text-white transition-colors" />
              <span className="text-xs font-bold text-orange-200">NUKE ({hudData.inventory.nukeCount})</span>
            </div>
            <div className="text-[9px] font-mono text-white/50 bg-black px-1.5 py-0.5 rounded border border-white/10 mt-1">
              [ N ] KEY
            </div>
          </div>
        )}
      </div>

      {/* Shop Compass */}
      <AnimatePresence>
        {hudData.shops && hudData.shops.dist < 1500 && hudData.shops.dist > 150 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 0.7, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none"
          >
            <div 
              style={{ transform: `translate(${Math.cos(hudData.shops.angle) * 120}px, ${Math.sin(hudData.shops.angle) * 120}px)` }}
            >
              <div 
                className="flex items-center justify-center w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/50 backdrop-blur-md text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)]"
              >
                <Navigation 
                  size={16} 
                  style={{ transform: `rotate(${hudData.shops.angle}rad) rotate(90deg)` }} 
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Exfill Status HUD removed as it is now handled in UI between waves */}


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

      {/* Wave End Countdown */}
      <AnimatePresence>
        {hudData.waveDuration - hudData.waveTimer <= 3000 && hudData.waveDuration - hudData.waveTimer > 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
            <motion.div
              key={Math.ceil((hudData.waveDuration - hudData.waveTimer) / 1000)}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1.5, opacity: 1 }}
              exit={{ scale: 2, opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="text-[150px] font-black italic text-red-500 drop-shadow-[0_0_40px_rgba(239,68,68,1)] tracking-tighter"
            >
              {Math.ceil((hudData.waveDuration - hudData.waveTimer) / 1000)}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
