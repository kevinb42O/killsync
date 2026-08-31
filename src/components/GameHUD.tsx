import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Skull, Coins, Flame, AlertTriangle, Shield, HeartPulse, Bomb, Navigation, Eye, Crosshair, Compass, MousePointer } from 'lucide-react';
import { GameEngine } from '../game/Engine';
import { WEAPON_DEFINITIONS } from '../constants';

export function GameHUD({ engine }: { engine: GameEngine | null }) {
  const [hudData, setHudData] = useState<any>(null);

  useEffect(() => {
    let frameId: number;
    let lastSync = 0;

    const syncHud = (time: number) => {
      if (engine && engine.gameState === 'PLAYING') {
        if (time - lastSync >= 50) {
          lastSync = time;
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
            viewMode: engine.viewMode,
            isPointerLocked: engine.renderer3D?.isPointerLocked || false,
            isAimingDownSights: engine.renderer3D?.isAimingDownSights || false,
            adsProgress: engine.renderer3D?.adsProgress || 0,
            cameraYaw: engine.renderer3D?.yaw || 0,
            threats: engine.enemies.slice(0, 45).map(e => {
              const dx = e.position.x - engine.player.position.x;
              const dy = e.position.y - engine.player.position.y;
              return {
                dx,
                dy,
                dist: Math.hypot(dx, dy),
                type: e.type,
                color: e.color
              };
            }),
            portalRel: engine.portals.length > 0 && engine.activePortalIndex >= 0 ? {
              dx: engine.portals[engine.activePortalIndex].position.x - engine.player.position.x,
              dy: engine.portals[engine.activePortalIndex].position.y - engine.player.position.y,
              dist: Math.hypot(
                engine.portals[engine.activePortalIndex].position.x - engine.player.position.x,
                engine.portals[engine.activePortalIndex].position.y - engine.player.position.y
              )
            } : null,
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

      {/* Perspective Switcher [V] */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 z-[95]">
        <button
          onClick={() => engine?.toggleViewMode()}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/70 border border-cyan-500/40 hover:border-cyan-400 hover:bg-cyan-950/60 text-cyan-300 text-[10px] font-mono uppercase tracking-widest backdrop-blur-md transition-all shadow-[0_0_15px_rgba(0,240,255,0.2)] cursor-pointer active:scale-95"
        >
          <Eye size={12} className="text-cyan-400 animate-pulse" />
          <span>
            {hudData.viewMode === 'FIRST_PERSON' ? '1ST PERSON' : hudData.viewMode === 'THIRD_PERSON' ? '3RD PERSON' : '2D TOPDOWN'}
          </span>
          <span className="px-1.5 py-0.5 bg-cyan-500/20 border border-cyan-400/30 text-[9px] font-bold rounded text-cyan-200">
            V
          </span>
        </button>
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
          {(() => {
            const ownedWeapons = (hudData.loadoutWeapons || []).map((w: any) => w.id);
            const dealtWeaponIds = Object.keys(hudData.weaponDamageStats || {});
            const allWeaponIds = Array.from(new Set([...ownedWeapons, ...dealtWeaponIds]));
            if (allWeaponIds.length === 0) return null;

            const stats = allWeaponIds
              .map((id) => {
                const def = WEAPON_DEFINITIONS.find(w => w.id === id);
                const dmg = Number((hudData.weaponDamageStats || {})[id] || 0);
                return {
                  id,
                  name: def ? def.name : id,
                  damage: dmg,
                  dps: dmg / Math.max(1, hudData.gameTime / 1000)
                };
              })
              .sort((a, b) => b.damage - a.damage);

            const maxDamage = stats[0]?.damage || 1;
            const visibleCount = Math.max(6, ownedWeapons.length || 0);

            return stats.slice(0, visibleCount).map((stat, idx) => (
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

      {/* 3D First-Person Pointer Lock Reminder */}

      {hudData.viewMode === 'FIRST_PERSON' && !hudData.isPointerLocked && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[95] pointer-events-none">
          <div className="flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-black/85 border border-cyan-400/60 shadow-[0_0_30px_rgba(0,240,255,0.4)] backdrop-blur-md animate-pulse">
            <MousePointer size={14} className="text-cyan-300 animate-bounce" />
            <span className="text-xs font-mono font-bold tracking-wider text-cyan-200 uppercase">
              Click Anywhere To Lock Mouse Look • [ESC] to Unlock
            </span>
          </div>
        </div>
      )}

      {/* 3D First-Person Crosshair & Directional Threat Arcs */}
      {hudData.viewMode === 'FIRST_PERSON' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[80]">
          {/* Cyber Visor Corner Brackets */}
          <div className="absolute inset-8 border border-cyan-500/10 rounded-3xl pointer-events-none">
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-cyan-400/40 rounded-tl-xl" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-cyan-400/40 rounded-tr-xl" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-cyan-400/40 rounded-bl-xl" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-cyan-400/40 rounded-br-xl" />
          </div>

          {/* Central Cyber Reticle (Transforms dynamically during ADS) */}
          <div className={`relative flex items-center justify-center transition-all duration-150 ${hudData.isAimingDownSights ? 'w-8 h-8 scale-90' : 'w-12 h-12 scale-100'}`}>
            <div className={`rounded-full bg-cyan-300 shadow-[0_0_12px_#00f0ff] transition-all duration-150 ${hudData.isAimingDownSights ? 'w-2 h-2 bg-emerald-400 shadow-[0_0_15px_#10b981]' : 'w-1.5 h-1.5'}`} />
            <div className={`absolute -top-2 h-0.5 bg-cyan-400/80 transition-all duration-150 ${hudData.isAimingDownSights ? 'w-4 bg-emerald-400/90 -top-3' : 'w-3'}`} />
            <div className={`absolute -bottom-2 h-0.5 bg-cyan-400/80 transition-all duration-150 ${hudData.isAimingDownSights ? 'w-4 bg-emerald-400/90 -bottom-3' : 'w-3'}`} />
            <div className={`absolute -left-2 w-0.5 bg-cyan-400/80 transition-all duration-150 ${hudData.isAimingDownSights ? 'h-4 bg-emerald-400/90 -left-3' : 'h-3'}`} />
            <div className={`absolute -right-2 w-0.5 bg-cyan-400/80 transition-all duration-150 ${hudData.isAimingDownSights ? 'h-4 bg-emerald-400/90 -right-3' : 'h-3'}`} />
            <div className={`absolute inset-0 rounded-full border border-cyan-400/30 transition-all duration-150 ${hudData.isAimingDownSights ? 'border-emerald-400/50 scale-125' : ''}`} />
            {hudData.isAimingDownSights && (
              <div className="absolute -top-7 text-[8px] font-mono font-black text-emerald-300 tracking-widest uppercase animate-pulse">
                ADS ZOOM
              </div>
            )}
          </div>

          {/* Tactical Weapon Control Prompt in First Person */}
          <div className="absolute bottom-7 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-1.5 rounded-full bg-black/60 border border-cyan-500/30 backdrop-blur-md shadow-[0_0_15px_rgba(0,240,255,0.15)] pointer-events-none">
            <span className="text-[10px] font-mono font-bold text-cyan-300 tracking-wider flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-200 border border-cyan-400/30">LMB</span> FIRE
            </span>
            <span className="text-white/20">•</span>
            <span className="text-[10px] font-mono font-bold text-emerald-300 tracking-wider flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">RMB</span> ADS
            </span>
            <span className="text-white/20">•</span>
            <span className="text-[10px] font-mono font-bold text-purple-300 tracking-wider flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-200 border border-purple-400/30">SPACE</span> DASH
            </span>
            <span className="text-white/20">•</span>
            <span className="text-[10px] font-mono font-bold text-cyan-300 tracking-wider flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-200 border border-cyan-400/30">V</span> VIEW
            </span>
          </div>

          {/* Directional Threat Arcs (Close range enemies behind / beside player) */}
          {hudData.threats?.filter((t: any) => t.dist < 260).map((threat: any, i: number) => {
            const worldAngle = Math.atan2(threat.dy, threat.dx);
            const camAngle = Math.atan2(-Math.cos(hudData.cameraYaw), -Math.sin(hudData.cameraYaw));
            const relAngle = worldAngle - camAngle;
            
            // Show threats that are off-center / behind / flanking
            const isBehind = Math.cos(relAngle) < 0.3;
            if (!isBehind) return null;

            const radius = 70;
            const arcX = Math.sin(relAngle) * radius;
            const arcY = -Math.cos(relAngle) * radius;
            const deg = (relAngle * 180) / Math.PI;

            return (
              <div
                key={i}
                className="absolute w-8 h-2 bg-rose-500/90 rounded-full blur-[1px] shadow-[0_0_14px_rgba(244,63,94,1)] transition-all duration-75"
                style={{
                  transform: `translate(${arcX}px, ${arcY}px) rotate(${deg}deg)`
                }}
              />
            );
          })}
        </div>
      )}

      {/* 360° Holographic Radar for 3D Perspectives */}
      {(hudData.viewMode === 'FIRST_PERSON' || hudData.viewMode === 'THIRD_PERSON') && (
        <div className="absolute bottom-6 right-6 z-[85] pointer-events-none">
          <div className="relative w-36 h-36 rounded-full bg-black/75 border border-cyan-500/40 backdrop-blur-md overflow-hidden shadow-[0_0_25px_rgba(0,240,255,0.25)]">
            {/* Range Rings */}
            <div className="absolute inset-2 rounded-full border border-cyan-500/20" />
            <div className="absolute inset-7 rounded-full border border-cyan-500/15" />
            {/* Crosshair grid */}
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-cyan-500/25 -translate-x-1/2" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-cyan-500/25 -translate-y-1/2" />
            
            {/* Player Center Indicator (Arrow facing UP) */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
              <div className="w-2.5 h-2.5 bg-cyan-400 rounded-full shadow-[0_0_8px_#00f0ff]" />
              <div className="absolute -top-2 w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-b-[6px] border-b-white" />
            </div>

            {/* Threat Blips */}
            {hudData.threats?.map((t: any, i: number) => {
              const radarRange = 650;
              const worldAngle = Math.atan2(t.dy, t.dx);
              const camAngle = Math.atan2(-Math.cos(hudData.cameraYaw), -Math.sin(hudData.cameraYaw));
              const relAngle = worldAngle - camAngle;
              const distFactor = Math.min(1, t.dist / radarRange);
              const r = distFactor * 62;
              const blipX = 72 + Math.sin(relAngle) * r;
              const blipY = 72 - Math.cos(relAngle) * r;

              return (
                <div
                  key={i}
                  className={`absolute rounded-full -translate-x-1/2 -translate-y-1/2 ${
                    t.type === 'titan' || t.type === 'boss'
                      ? 'w-3 h-3 bg-red-500 shadow-[0_0_10px_#ff0055]'
                      : 'w-1.5 h-1.5 bg-red-400/80 shadow-[0_0_4px_#ff3366]'
                  }`}
                  style={{ left: `${blipX}px`, top: `${blipY}px` }}
                />
              );
            })}

            {/* Portal Blip */}
            {hudData.portalRel && (
              (() => {
                const worldAngle = Math.atan2(hudData.portalRel.dy, hudData.portalRel.dx);
                const camAngle = Math.atan2(-Math.cos(hudData.cameraYaw), -Math.sin(hudData.cameraYaw));
                const relAngle = worldAngle - camAngle;
                const distFactor = Math.min(1, hudData.portalRel.dist / 900);
                const r = distFactor * 62;
                const px = 72 + Math.sin(relAngle) * r;
                const py = 72 - Math.cos(relAngle) * r;
                return (
                  <div
                    className="absolute w-3 h-3 bg-emerald-400 rounded-full shadow-[0_0_12px_#00ffaa] -translate-x-1/2 -translate-y-1/2 animate-ping"
                    style={{ left: `${px}px`, top: `${py}px` }}
                  />
                );
              })()
            )}

            {/* Radar Label */}
            <div className="absolute bottom-1.5 left-0 right-0 text-center text-[8px] font-mono font-bold text-cyan-400/70 uppercase tracking-widest">
              360° RADAR
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

