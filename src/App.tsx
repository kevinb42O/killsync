import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Skull, Trophy, Zap, Shield, Target, Activity, Coins, ArrowLeft, Lock, CheckCircle2, User, Crosshair, Maximize, Minimize, ExternalLink, Star, Sparkles, Crown, BookOpen, ChevronRight, Database, FileWarning } from 'lucide-react';
import { GameEngine, BalanceTuning, DEFAULT_BALANCE_TUNING } from './game/Engine';
import { GameHUD } from './components/GameHUD';
import { MenuEffects, triggerMenuEffect } from './components/MenuEffects';
import { IntelArchive } from './components/IntelArchive';
import { GameState } from './types';
import { soundManager } from './game/SoundManager';
import { PERMANENT_UPGRADES, OPERATOR_DEFINITIONS, WEAPON_DEFINITIONS } from './constants';
import {
  MAX_ACCOUNT_LEVEL,
  XPBreakdownItem,
  applyAccountXP,
  createDeathXPBreakdown,
  createExfillXPBreakdown,
  getAccountXPRequired
} from './game/xpProgression';

type KnobDef = {
  key: keyof BalanceTuning;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
};

const ADMIN_KNOBS: KnobDef[] = [
  { key: 'weaponSpawnStep', label: 'Weapon Spawn Step', description: 'Extra spawn multiplier added per weapon above 1. Example: 0.5 gives 1.0x, 1.5x, 2.0x, 2.5x.', min: 0, max: 2, step: 0.05 },
  { key: 'spawnBaseIntervalMs', label: 'Base Spawn Interval (ms)', description: 'Base delay between spawn ticks before difficulty scaling. Lower value means faster spawning.', min: 100, max: 1200, step: 10 },
  { key: 'spawnMinIntervalMs', label: 'Minimum Spawn Interval (ms)', description: 'Hard floor for spawn delay at high difficulty to prevent infinite acceleration.', min: 20, max: 300, step: 5 },
  { key: 'difficultyTimeScalePerMinute', label: 'Difficulty Time Scale / Min', description: 'How much difficulty increases each minute based on survival time.', min: 0, max: 2, step: 0.01 },
  { key: 'difficultyKillBonusDivisor', label: 'Kill Bonus Divisor', description: 'Kills are divided by this value to compute bonus difficulty. Lower value ramps harder with kills.', min: 200, max: 5000, step: 50 },
  { key: 'difficultyKillBonusCap', label: 'Kill Bonus Cap', description: 'Maximum extra difficulty allowed from kills, even with very high kill count.', min: 0, max: 2, step: 0.01 },
  { key: 'enemyHealthMultiplier', label: 'Enemy Health Multiplier', description: 'Global multiplier for non-boss enemy HP after difficulty scaling.', min: 0.1, max: 10, step: 0.05 },
  { key: 'enemyDamageMultiplier', label: 'Enemy Damage Multiplier', description: 'Global multiplier for non-boss enemy contact damage output.', min: 0.1, max: 10, step: 0.05 },
  { key: 'playerDamageTakenMultiplier', label: 'Player Damage Taken Multiplier', description: 'Final multiplier on all incoming damage to the player from enemies and bosses.', min: 0.1, max: 5, step: 0.05 },
  { key: 'bossDamagePercentMultiplier', label: 'Boss Damage Percent Multiplier', description: 'Multiplier for boss percentage-based hit damage and boss damage profiles.', min: 0.1, max: 5, step: 0.05 },
  { key: 'coinDropChanceBase', label: 'Coin Drop Chance Base', description: 'Base chance for regular enemies to drop coins before luck modifies it.', min: 0, max: 1, step: 0.005 },
  { key: 'treasureDropChanceBase', label: 'Treasure Drop Chance Base', description: 'Base treasure chest drop chance per kill before luck and runtime tier logic.', min: 0, max: 0.02, step: 0.0001 },
  { key: 'xpBaseRequirement', label: 'XP Base Requirement', description: 'XP needed for early levels before exponential level scaling applies.', min: 20, max: 600, step: 5 },
  { key: 'xpLevelScaling', label: 'XP Level Scaling', description: 'Exponential growth factor for XP needed per level. Higher means steeper leveling curve.', min: 1.05, max: 2.2, step: 0.01 },
  { key: 'xpGlobalGainMultiplier', label: 'XP Global Gain Multiplier', description: 'Global multiplier applied to gem XP gains after growth and event modifiers.', min: 0.1, max: 3, step: 0.01 },
  { key: 'xpGrowthEffectiveness', label: 'XP Growth Effectiveness', description: 'Controls how strongly the Growth stat contributes to effective XP gain.', min: 0, max: 2, step: 0.01 },
  { key: 'treasureXPGainMultiplier', label: 'Treasure XP Multiplier', description: 'Multiplier applied specifically to XP reward granted from treasure pickups.', min: 0, max: 5, step: 0.05 },
  { key: 'goldGainMultiplier', label: 'Gold Gain Multiplier', description: 'Global multiplier for coin and treasure gold rewards after Greed.', min: 0, max: 5, step: 0.05 },
  { key: 'bossHealthMultiplier', label: 'Boss Health Multiplier', description: 'Global multiplier for boss max health values at all boss milestones.', min: 0.1, max: 10, step: 0.05 },
  { key: 'bossXPRewardMultiplier', label: 'Boss XP Reward Multiplier', description: 'Global multiplier for XP reward value granted when bosses are killed.', min: 0, max: 10, step: 0.05 },
];

export default function App() {
  const appRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const exfillCarryoverRef = useRef<any>(null);
  const [gameState, setGameState] = useState<GameState>('MENU');
  const [levelUpOptions, setLevelUpOptions] = useState<any[]>([]);
  const [treasureReward, setTreasureReward] = useState<any>(null);
  const [gameOverStats, setGameOverStats] = useState<any>(null);
  const [exfillSummary, setExfillSummary] = useState<any>(null);
  const [accountLevel, setAccountLevel] = useState(() => {
    const saved = localStorage.getItem('accountLevel');
    return saved ? parseInt(saved) : 1;
  });
  const [accountXP, setAccountXP] = useState(() => {
    const saved = localStorage.getItem('accountXP');
    return saved ? parseInt(saved) : 0;
  });
  const [displayAccountLevel, setDisplayAccountLevel] = useState(() => {
    const saved = localStorage.getItem('accountLevel');
    return saved ? parseInt(saved) : 1;
  });
  const [displayAccountXP, setDisplayAccountXP] = useState(() => {
    const saved = localStorage.getItem('accountXP');
    return saved ? parseInt(saved) : 0;
  });
  const [pendingAccountXP, setPendingAccountXP] = useState(0);
  const [xpBreakdown, setXpBreakdown] = useState<XPBreakdownItem[]>([]);
  const [lastXPGainTotal, setLastXPGainTotal] = useState(0);
  const [xpAnimationActive, setXpAnimationActive] = useState(false);
  const [exfillDisplayedTotalXP, setExfillDisplayedTotalXP] = useState(0);
  const [exfillTotalRevealDone, setExfillTotalRevealDone] = useState(false);
  
  // Persistent Player State
  const [playerLevel, setPlayerLevel] = useState(() => {
    const saved = localStorage.getItem('playerLevel');
    return saved ? parseInt(saved) : 1;
  });
  const [playerExperience, setPlayerExperience] = useState(0);
  const [hasExfillCarryover, setHasExfillCarryover] = useState(false);
  const [playerCoins, setPlayerCoins] = useState(() => {
    const saved = localStorage.getItem('playerCoins');
    return saved ? parseInt(saved) : 0;
  });
  const [permanentUpgrades, setPermanentUpgrades] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('permanentUpgrades');
    return saved ? JSON.parse(saved) : {};
  });
  const [selectedOperator, setSelectedOperator] = useState<string>(() => {
    return localStorage.getItem('selectedOperator') || 'phantom';
  });
  const [unlockedOperators, setUnlockedOperators] = useState<string[]>(() => {
    const saved = localStorage.getItem('unlockedOperators');
    return saved ? JSON.parse(saved) : ['phantom'];
  });
  const [savedDataCores, setSavedDataCores] = useState(() => {
    const saved = localStorage.getItem('savedDataCores');
    return saved ? parseInt(saved) : 0;
  });

  const [nightmareMode, setNightmareMode] = useState(() => {
    return localStorage.getItem('nightmareMode') === 'true';
  });
  const [adminBalance, setAdminBalance] = useState<BalanceTuning>(() => {
    const raw = localStorage.getItem('adminBalanceTuning');
    if (!raw) return { ...DEFAULT_BALANCE_TUNING };
    try {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_BALANCE_TUNING,
        ...parsed,
      };
    } catch {
      return { ...DEFAULT_BALANCE_TUNING };
    }
  });

  const [isFullscreen, setIsFullscreen] = useState(false);
  const ADMIN_DASHBOARD_PASSWORD = 'pinakaaz420';

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const queueXPReward = (breakdown: XPBreakdownItem[]) => {
    const filtered = breakdown.filter(item => item.value > 0);
    const total = filtered.reduce((sum, item) => sum + item.value, 0);
    if (total <= 0) return { filtered, total: 0 };
    setXpBreakdown(filtered);
    setLastXPGainTotal(total);
    setPendingAccountXP(prev => prev + total);
    return { filtered, total };
  };

  const updateAdminBalance = (key: keyof BalanceTuning, value: number) => {
    setAdminBalance(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as any;
      const isFull = !!(
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.webkitCurrentFullScreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement
      );
      setIsFullscreen(isFull);
    };

    const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
    events.forEach(event => document.addEventListener(event, handleFullscreenChange));

    return () => {
      events.forEach(event => document.removeEventListener(event, handleFullscreenChange));
    };
  }, []);

  const toggleFullscreen = () => {
    soundManager.playUIClick();
    const doc = document as any;
    const container = (appRef.current || document.documentElement) as any;

    const requestFS = container.requestFullscreen || container.webkitRequestFullScreen || container.webkitRequestFullscreen || container.mozRequestFullScreen || container.msRequestFullscreen;
    const exitFS = doc.exitFullscreen || doc.webkitExitFullscreen || doc.webkitCancelFullScreen || doc.mozCancelFullScreen || doc.msExitFullscreen;
    
    const isFull = !!(
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.webkitCurrentFullScreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement
    );

    if (!isFull) {
      if (requestFS) {
        try {
          const promise = requestFS.call(container);
          if (promise && promise.catch) {
            promise.catch((err: any) => console.error(err));
          }
        } catch (err: any) {
          console.error(`Error attempting to enable fullscreen: ${err.message}`);
        }
      }
    } else {
      if (exitFS) {
        try {
          const promise = exitFS.call(doc);
          if (promise && promise.catch) {
            promise.catch((err: any) => console.error(err));
          }
        } catch (err: any) {
          console.error(`Error attempting to exit fullscreen: ${err.message}`);
        }
      }
    }
  };

  useEffect(() => {
    localStorage.setItem('playerLevel', playerLevel.toString());
    localStorage.setItem('playerCoins', playerCoins.toString());
    localStorage.setItem('permanentUpgrades', JSON.stringify(permanentUpgrades));
    localStorage.setItem('selectedOperator', selectedOperator);
    localStorage.setItem('unlockedOperators', JSON.stringify(unlockedOperators));
    localStorage.setItem('savedDataCores', savedDataCores.toString());
    localStorage.setItem('nightmareMode', nightmareMode.toString());
    localStorage.setItem('accountLevel', accountLevel.toString());
    localStorage.setItem('accountXP', accountXP.toString());
    localStorage.setItem('adminBalanceTuning', JSON.stringify(adminBalance));
  }, [playerLevel, playerCoins, permanentUpgrades, selectedOperator, unlockedOperators, savedDataCores, nightmareMode, accountLevel, accountXP, adminBalance]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setBalanceTuning(adminBalance);
    }
  }, [adminBalance]);

  useEffect(() => {
    if (xpAnimationActive) return;
    setDisplayAccountLevel(accountLevel);
    setDisplayAccountXP(accountXP);
  }, [accountLevel, accountXP, xpAnimationActive]);

  useEffect(() => {
    if (gameState !== 'MENU' || pendingAccountXP <= 0 || xpAnimationActive) return;

    const total = pendingAccountXP;
    const startLevel = accountLevel;
    const startXP = accountXP;
    const finalState = applyAccountXP(startLevel, startXP, total);

    // Commit progression immediately so it cannot be lost if the animation is interrupted.
    setPendingAccountXP(0);
    setAccountLevel(finalState.level);
    setAccountXP(finalState.xp);
    setXpAnimationActive(true);

    const start = performance.now();
    const duration = 1400;
    const interval = window.setInterval(() => {
      const elapsed = performance.now() - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const progressedXP = Math.floor(total * eased);
      const progressed = applyAccountXP(startLevel, startXP, progressedXP);

      setDisplayAccountLevel(progressed.level);
      setDisplayAccountXP(progressed.xp);

      if (t >= 1) {
        window.clearInterval(interval);
        setDisplayAccountLevel(finalState.level);
        setDisplayAccountXP(finalState.xp);
        setXpAnimationActive(false);
      }
    }, 30);

    return () => {
      window.clearInterval(interval);
      setDisplayAccountLevel(finalState.level);
      setDisplayAccountXP(finalState.xp);
      setXpAnimationActive(false);
    };
  }, [gameState, pendingAccountXP, xpAnimationActive, accountLevel, accountXP]);

  useEffect(() => {
    if (gameState !== 'EXFILL_SUMMARY' || !exfillSummary) return;

    setExfillDisplayedTotalXP(0);
    setExfillTotalRevealDone(false);

    const target = exfillSummary.xpEarned || 0;
    if (target <= 0) {
      setExfillTotalRevealDone(true);
      return;
    }

    const start = performance.now();
    const duration = 1200;
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setExfillDisplayedTotalXP(Math.floor(target * eased));

      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setExfillDisplayedTotalXP(target);
        setExfillTotalRevealDone(true);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [gameState, exfillSummary]);

  useEffect(() => {
    if (canvasRef.current && !engineRef.current) {
      const engine = new GameEngine(
        canvasRef.current,
        (options) => {
          setLevelUpOptions(options);
          setGameState('LEVEL_UP');
        },
        (stats) => {
          const runTime = stats.time || engineRef.current?.gameTime || 0;
          const runKills = stats.kills || engineRef.current?.killCount || 0;
          const deathXPBreakdown = createDeathXPBreakdown(runTime, runKills);
          const deathReward = queueXPReward(deathXPBreakdown);

          setGameOverStats({
            ...stats,
            xpEarned: deathReward.total,
            xpBreakdown: deathReward.filtered
          });
          setGameState('GAME_OVER');
          // Death wipes current run carryover and does not bank run loot.
          exfillCarryoverRef.current = null;
          setHasExfillCarryover(false);
          setPlayerLevel(1);
          setPlayerExperience(0);
          // NOTE: pendingDataCores from engineRef.current?.player are NOT saved here. They are lost.
        },
        (upgrade) => {
          setTreasureReward(upgrade);
          setGameState('TREASURE');
        },
        (coins, level) => {
          // Handle Exfill
          const player = engineRef.current?.player;
          const gameTime = engineRef.current?.gameTime || 0;
          const kills = engineRef.current?.killCount || 0;
          const weapons = player?.weapons || [];
          const weaponLevelTotal = weapons.reduce((sum, w) => sum + (w.level || 0), 0);
          const weaponDamageStats = engineRef.current?.weaponDamageStats || {};
          const exfillXPBreakdown = createExfillXPBreakdown({
            timeMs: gameTime,
            kills,
            level,
            coins,
            dataCores: player?.pendingDataCores || 0,
            weaponCount: weapons.length,
            weaponLevelTotal,
            upgradeCount: player?.upgrades?.length || 0
          });
          const exfillRewardFiltered = exfillXPBreakdown.filter(item => item.value > 0);
          const exfillRewardTotal = exfillRewardFiltered.reduce((sum, item) => sum + item.value, 0);

          setExfillSummary({
            time: gameTime,
            kills,
            level,
            coins,
            dataCores: player?.pendingDataCores || 0,
            health: player?.health || 0,
            maxHealth: player?.maxHealth || 0,
            weaponCount: weapons.length,
            weapons: weapons.map(w => ({
              id: w.id,
              name: w.name,
              level: w.level,
              damageDone: Math.floor(weaponDamageStats[w.id] || 0)
            })),
            upgradeCount: player?.upgrades?.length || 0,
            xpEarned: exfillRewardTotal,
            xpBreakdown: exfillRewardFiltered
          });

          setPlayerCoins(prev => prev + coins);
          setPlayerLevel(level);
          setPlayerExperience(engineRef.current?.player.experience || 0);
          exfillCarryoverRef.current = player ? JSON.parse(JSON.stringify(player)) : null;
          setHasExfillCarryover(true);
          const collectedCores = engineRef.current?.player.pendingDataCores || 0;
          setSavedDataCores(prev => prev + collectedCores);
          setGameState('EXFILL_SUMMARY');
          soundManager.playLevelUp(); // Use level up sound for exfill success
        }
      );
      engine.setBalanceTuning(adminBalance);
      engineRef.current = engine;
      
      const resize = () => {
        if (canvasRef.current) {
          canvasRef.current.width = window.innerWidth;
          canvasRef.current.height = window.innerHeight;
        }
      };
      window.addEventListener('resize', resize);
      resize();
    }
  }, []);

  useEffect(() => {
    let cheatBuffer = '';

    const handleKeyDown = (e: KeyboardEvent) => {
      // Pause handling
      if (e.key === 'Escape') {
        if (gameState === 'PLAYING') {
          setGameState('PAUSED');
          if (engineRef.current) engineRef.current.paused = true;
          soundManager.playUIClick();
        } else if (gameState === 'PAUSED') {
          setGameState('PLAYING');
          if (engineRef.current) engineRef.current.paused = false;
          soundManager.playUIClick();
        }
        return;
      }

      if (gameState !== 'MENU') return;
      
      cheatBuffer += e.key.toLowerCase();
      if (cheatBuffer.length > 20) {
        cheatBuffer = cheatBuffer.slice(-20);
      }
      
      if (cheatBuffer.endsWith('gimmecash')) {
        setPlayerCoins(9999999);
        soundManager.playLevelUp();
        cheatBuffer = '';
      } else if (cheatBuffer.endsWith('reset')) {
        setPlayerCoins(0);
        setPlayerLevel(1);
        setAccountLevel(1);
        setAccountXP(0);
        setDisplayAccountLevel(1);
        setDisplayAccountXP(0);
        setPermanentUpgrades({});
        setUnlockedOperators(['phantom']);
        setSelectedOperator('phantom');
        setSavedDataCores(0);
        soundManager.playUIClick();
        cheatBuffer = '';
      } else if (cheatBuffer.endsWith('unlockall')) {
        setUnlockedOperators(OPERATOR_DEFINITIONS.map(o => o.id));
        soundManager.playLevelUp();
        cheatBuffer = '';
      } else if (cheatBuffer.endsWith('iamgod')) {
        const maxUpgrades: Record<string, number> = {};
        PERMANENT_UPGRADES.forEach(u => {
          maxUpgrades[u.id] = u.maxLevel;
        });
        setPermanentUpgrades(maxUpgrades);
        soundManager.playLevelUp();
        cheatBuffer = '';
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  const startGame = () => {
    soundManager.playUIClick();
    if (engineRef.current) {
      engineRef.current.setBalanceTuning(adminBalance);
      engineRef.current.eventManager.nightmareMode = nightmareMode;
      if (!hasExfillCarryover || !exfillCarryoverRef.current) {
        engineRef.current.player = engineRef.current.resetPlayer(1, 0, 0, permanentUpgrades, selectedOperator);
      } else {
        engineRef.current.player = JSON.parse(JSON.stringify(exfillCarryoverRef.current));
        engineRef.current.player.health = engineRef.current.player.maxHealth;
        engineRef.current.player.velocity = { x: 0, y: 0 };
        setPlayerLevel(engineRef.current.player.level || 1);
        setPlayerExperience(engineRef.current.player.experience || 0);
      }
      engineRef.current.enemies = [];
      engineRef.current.projectiles = [];
      engineRef.current.gems = [];
      engineRef.current.gameTime = 0;
      engineRef.current.killCount = 0;
      engineRef.current.start();
      setGameState('PLAYING');
    }
  };

  const unlockOperator = (operatorId: string) => {
    const op = OPERATOR_DEFINITIONS.find(o => o.id === operatorId);
    if (!op || playerCoins < op.cost || unlockedOperators.includes(operatorId)) return;
    soundManager.playLevelUp();
    setPlayerCoins(prev => prev - op.cost);
    setUnlockedOperators(prev => [...prev, operatorId]);
    setSelectedOperator(operatorId);
  };

  const buyPermanentUpgrade = (upgrade: any) => {
    const currentLevel = permanentUpgrades[upgrade.id] || 0;
    if (currentLevel >= upgrade.maxLevel) return;

    const cost = Math.floor(upgrade.baseCost * Math.pow(upgrade.costScale, currentLevel));
    const coreCost = upgrade.coreCost || 0;
    
    if (playerCoins >= cost && savedDataCores >= coreCost) {
      soundManager.playUIClick();
      setPlayerCoins(prev => prev - cost);
      setSavedDataCores(prev => prev - coreCost);
      setPermanentUpgrades(prev => ({
        ...prev,
        [upgrade.id]: currentLevel + 1
      }));
    } else {
      // Not enough resources
    }
  };

  const selectUpgrade = (upgrade: any) => {
    if (engineRef.current) {
      engineRef.current.applyUpgrade(upgrade);
      setGameState('PLAYING');
    }
  };

  return (
    <div ref={appRef} className="relative w-full h-screen bg-[#0a0a0a] overflow-hidden text-white font-sans">
      {gameState === 'MENU' && <MenuEffects />}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />

      {/* Post-processing effects */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]" />
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />

      {/* HUD */}
      {gameState === 'PLAYING' && <GameHUD engine={engineRef.current} />}

      {/* Screens */}
      <AnimatePresence>
        {gameState === 'MENU' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center z-50"
          >
            {/* Base overlay over canvas */}
            <div className="absolute inset-0 bg-black/95 backdrop-blur-md pointer-events-none z-0" />
            {/* Cyberpunk background image */}
            <div 
              className="absolute inset-0 bg-cover bg-center pointer-events-none opacity-40 mix-blend-screen z-0"
              style={{ backgroundImage: `url('/neon_cityscape_bg.png')` }}
            />
            {/* Subtle radial gradient */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.8)_100%)] pointer-events-none z-0" />

            {/* Fullscreen toggle */}
            <button
              onClick={toggleFullscreen}
              onMouseEnter={() => soundManager.playUIHover()}
              className="absolute top-6 left-6 p-2.5 bg-white/[0.03] text-white/30 hover:text-white border border-white/[0.06] hover:border-white/20 hover:bg-white/[0.08] transition-all z-50 cursor-pointer"
              style={{ clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))' }}
              title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            >
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>

            <div className="absolute top-6 right-20 z-50 w-[320px] max-w-[calc(100vw-7rem)] p-3 bg-black/60 border border-cyan-500/20 rounded-xl backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] text-cyan-200/70 uppercase tracking-[0.2em] font-bold">Profile Level</div>
                <div className="text-sm font-mono font-black text-cyan-300">Lv {displayAccountLevel} / {MAX_ACCOUNT_LEVEL}</div>
              </div>
              <div className="h-2.5 bg-white/10 rounded-full overflow-hidden border border-white/10">
                <motion.div
                  className="h-full bg-gradient-to-r from-cyan-400 via-blue-400 to-cyan-200"
                  animate={{
                    width: `${displayAccountLevel >= MAX_ACCOUNT_LEVEL ? 100 : (displayAccountXP / Math.max(1, getAccountXPRequired(displayAccountLevel))) * 100}%`
                  }}
                  transition={{ duration: 0.2 }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="text-[10px] text-white/40 font-mono">
                  {displayAccountLevel >= MAX_ACCOUNT_LEVEL
                    ? 'MAX LEVEL'
                    : `${displayAccountXP} / ${getAccountXPRequired(displayAccountLevel)} XP`}
                </div>
                {lastXPGainTotal > 0 && (
                  <div className={`text-[10px] font-mono font-bold ${xpAnimationActive ? 'text-yellow-300' : 'text-cyan-300/80'}`}>
                    +{lastXPGainTotal} XP
                  </div>
                )}
              </div>
            </div>

            {/* ═══════ MAIN MENU LAYOUT ═══════ */}
            <div className="relative z-10 flex items-center justify-center gap-16 w-full max-w-5xl px-8">
              
              {/* ─── LEFT: Title + Buttons ─── */}
              <div className="flex-1 max-w-md">
                {/* Title */}
                <motion.div initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.5 }}>
                  <motion.h1 
                    className="relative text-7xl font-black italic tracking-tighter mb-1 leading-none"
                  >
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-0 top-0 text-transparent bg-clip-text bg-gradient-to-b from-red-200/70 via-red-500/60 to-red-900/60 blur-[1px]"
                      style={{ transform: 'translate(1.5px, 1px)' }}
                    >
                      KILL
                    </span>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-0 top-0 text-red-500/35"
                      style={{ transform: 'translate(-1.5px, 0)', clipPath: 'polygon(0 58%, 100% 50%, 100% 68%, 0 78%)' }}
                    >
                      KILL
                    </span>
                    <span className="relative inline-block text-transparent bg-clip-text bg-gradient-to-b from-red-200 via-red-500 to-red-900 drop-shadow-[0_0_18px_rgba(185,28,28,0.65)] [text-shadow:0_2px_0_rgba(80,10,10,0.65)]">
                      KILL
                    </span>
                    <span className="text-transparent bg-clip-text bg-gradient-to-br from-cyan-300 via-cyan-500 to-blue-600 drop-shadow-[0_0_14px_rgba(34,211,238,0.45)]">
                      SYNC
                    </span>
                  </motion.h1>
                  <div className="flex items-center gap-3 mb-10">
                    <div className="h-px flex-1 bg-gradient-to-r from-red-500/60 via-cyan-400/35 to-transparent" />
                    <p className="text-white/35 text-[10px] uppercase tracking-[0.4em] font-mono">Neon Requiem</p>
                    <div className="h-px w-8 bg-white/10" />
                  </div>
                </motion.div>

                {/* Menu Buttons */}
                <div className="flex flex-col gap-2">
                  {/* ▸ INITIALIZE RUN — Primary CTA */}
                  <motion.button
                    initial={{ x: -40, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.1, type: 'spring', damping: 20 }}
                    onClick={(e) => {
                      triggerMenuEffect(e.clientX, e.clientY, 'electric_arc');
                      soundManager.playUIClick();
                      setTimeout(() => startGame(), 400);
                    }}
                    onMouseEnter={() => soundManager.playUIHover()}
                    className="group relative flex items-center h-14 cursor-pointer overflow-hidden"
                    style={{ clipPath: 'polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 0px))' }}
                  >
                    {/* Bg fill */}
                    <div className="absolute inset-0 bg-cyan-500 transition-all duration-300 group-hover:bg-white" />
                    {/* Scanline on hover */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)' }} />
                    {/* Content */}
                    <div className="relative z-10 flex items-center w-full px-6">
                      <div className="w-8 h-8 rounded-sm bg-black/20 flex items-center justify-center mr-4 group-hover:bg-black/10 transition-colors">
                        <Play size={16} fill="currentColor" className="text-black ml-0.5" />
                      </div>
                      <span className="text-black font-black text-sm uppercase tracking-[0.15em]">Initialize Run</span>
                      <ChevronRight size={18} className="text-black/40 ml-auto group-hover:translate-x-1 transition-transform" />
                    </div>
                    {/* Bottom accent line */}
                    <div className="absolute bottom-0 left-0 h-[2px] w-0 group-hover:w-full bg-black/20 transition-all duration-500" />
                  </motion.button>

                  {/* ▸ OPERATOR SELECT */}
                  {(() => {
                    const op = OPERATOR_DEFINITIONS.find(o => o.id === selectedOperator);
                    const opColor = op?.color || '#00ffff';
                    return (
                      <motion.button
                        initial={{ x: -40, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.17, type: 'spring', damping: 20 }}
                        onClick={(e) => {
                          triggerMenuEffect(e.clientX, e.clientY, 'tentacle');
                          soundManager.playUIClick();
                          setTimeout(() => setGameState('OPERATOR_SELECT'), 400);
                        }}
                        onMouseEnter={() => soundManager.playUIHover()}
                        className="group relative flex items-center h-14 cursor-pointer overflow-hidden"
                        style={{ clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 0px))' }}
                      >
                        {/* Bg */}
                        <div className="absolute inset-0 bg-white/[0.03] border border-white/[0.06] group-hover:bg-white/[0.08] group-hover:border-white/15 transition-all duration-300" />
                        {/* Left accent bar */}
                        <div className="absolute left-0 top-0 bottom-0 w-[3px] transition-all duration-300" style={{ background: opColor, opacity: 0.4 }} />
                        <div className="absolute left-0 top-0 bottom-0 w-[3px] scale-y-0 group-hover:scale-y-100 transition-transform duration-300 origin-top" style={{ background: opColor }} />
                        {/* Content */}
                        <div className="relative z-10 flex items-center w-full px-6">
                          {/* Mini operator avatar */}
                          <div className="w-8 h-8 rounded-sm flex items-center justify-center mr-4 relative overflow-hidden" style={{ background: `${op?.colorDark || '#0a3d3d'}` }}>
                            <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 60% 40%, ${op?.colorSecondary || '#0d5e5e'}, transparent)` }} />
                            <div className="w-2 h-3.5 rounded-full absolute" style={{ right: '8px', background: op?.colorVisor || '#00ffff', boxShadow: `0 0 6px ${op?.colorVisor || '#00ffff'}`, opacity: 0.9 }} />
                            <div className="w-1 h-1 rounded-full absolute" style={{ left: '10px', top: '14px', background: opColor, boxShadow: `0 0 4px ${opColor}` }} />
                          </div>
                          <div className="flex flex-col items-start">
                            <span className="text-white/80 font-bold text-xs uppercase tracking-[0.12em] group-hover:text-white transition-colors">Operators</span>
                          </div>
                          {/* Active operator badge on right */}
                          <div className="ml-auto flex items-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                            <div className="h-px w-4 group-hover:w-8 transition-all duration-300" style={{ background: opColor }} />
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider" style={{ color: opColor }}>{op?.name || 'Phantom'}</span>
                          </div>
                        </div>
                      </motion.button>
                    );
                  })()}

                  {/* ▸ NEURAL LAB */}
                  <motion.button
                    initial={{ x: -40, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.24, type: 'spring', damping: 20 }}
                    onClick={(e) => {
                      triggerMenuEffect(e.clientX, e.clientY, 'electric_arc');
                      soundManager.playUIClick();
                      setTimeout(() => setGameState('PERMANENT_UPGRADES'), 400);
                    }}
                    onMouseEnter={() => soundManager.playUIHover()}
                    className="group relative flex items-center h-14 cursor-pointer overflow-hidden"
                    style={{ clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 0px))' }}
                  >
                    <div className="absolute inset-0 bg-white/[0.03] border border-white/[0.06] group-hover:bg-white/[0.08] group-hover:border-white/15 transition-all duration-300" />
                    {/* Left accent */}
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-yellow-500/30" />
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] scale-y-0 group-hover:scale-y-100 transition-transform duration-300 origin-bottom bg-yellow-400" />
                    {/* Content */}
                    <div className="relative z-10 flex items-center w-full px-6">
                      <div className="w-8 h-8 rounded-sm bg-yellow-500/10 flex items-center justify-center mr-4 group-hover:bg-yellow-500/20 transition-colors">
                        <Database size={15} className="text-yellow-400/70 group-hover:text-yellow-400 transition-colors" />
                      </div>
                      <span className="text-white/80 font-bold text-xs uppercase tracking-[0.12em] group-hover:text-white transition-colors">Neural Lab</span>
                      {/* Upgrade count badge */}
                      {(() => {
                        const totalLevels = Object.values(permanentUpgrades as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
                        return totalLevels > 0 ? (
                          <div className="ml-auto flex items-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                            <div className="h-px w-4 group-hover:w-8 transition-all duration-300 bg-yellow-500/50" />
                            <span className="text-[10px] font-mono font-bold text-yellow-500/70 uppercase tracking-wider">{totalLevels} Upgrades</span>
                          </div>
                        ) : (
                          <ChevronRight size={16} className="text-white/10 ml-auto group-hover:text-white/30 group-hover:translate-x-1 transition-all" />
                        );
                      })()}
                    </div>
                  </motion.button>

                  {/* ▸ INTEL ARCHIVE */}
                  <motion.button
                    initial={{ x: -40, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.31, type: 'spring', damping: 20 }}
                    onClick={(e) => {
                      triggerMenuEffect(e.clientX, e.clientY, 'tentacle');
                      soundManager.playUIClick();
                      setTimeout(() => setGameState('INTEL_ARCHIVE'), 400);
                    }}
                    onMouseEnter={() => soundManager.playUIHover()}
                    className="group relative flex items-center h-14 cursor-pointer overflow-hidden"
                    style={{ clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 0px))' }}
                  >
                    <div className="absolute inset-0 bg-white/[0.03] border border-white/[0.06] group-hover:bg-white/[0.08] group-hover:border-white/15 transition-all duration-300" />
                    {/* Left accent */}
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-red-500/30" />
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] scale-y-0 group-hover:scale-y-100 transition-transform duration-300 origin-center bg-red-400" />
                    {/* Content */}
                    <div className="relative z-10 flex items-center w-full px-6">
                      <div className="w-8 h-8 rounded-sm bg-red-500/10 flex items-center justify-center mr-4 group-hover:bg-red-500/20 transition-colors">
                        <FileWarning size={15} className="text-red-400/70 group-hover:text-red-400 transition-colors" />
                      </div>
                      <span className="text-white/80 font-bold text-xs uppercase tracking-[0.12em] group-hover:text-white transition-colors">Intel Archive</span>
                      <div className="ml-auto flex items-center gap-2 opacity-40 group-hover:opacity-70 transition-opacity">
                        <span className="text-[9px] font-mono text-white/40 uppercase tracking-wider hidden sm:inline">Threats &amp; Arms</span>
                        <ChevronRight size={16} className="text-white/10 group-hover:text-white/30 group-hover:translate-x-1 transition-all" />
                      </div>
                    </div>
                  </motion.button>

                  {/* ▸ NIGHTMARE MODE TOGGLE */}
                  <motion.button
                    initial={{ x: -40, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.35, type: 'spring', damping: 20 }}
                    onClick={(e) => {
                      triggerMenuEffect(e.clientX, e.clientY, 'electric_arc');
                      soundManager.playUIClick();
                      const input = window.prompt('Enter admin password');
                      if (input === ADMIN_DASHBOARD_PASSWORD) {
                        setTimeout(() => setGameState('ADMIN_DASHBOARD'), 250);
                      } else if (input !== null) {
                        window.alert('Incorrect password');
                      }
                    }}
                    onMouseEnter={() => soundManager.playUIHover()}
                    className="group relative flex items-center h-12 cursor-pointer overflow-hidden"
                    style={{ clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 0px))' }}
                  >
                    <div className="absolute inset-0 bg-white/[0.03] border border-white/[0.06] group-hover:bg-white/[0.08] group-hover:border-white/15 transition-all duration-300" />
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-cyan-500/35" />
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] scale-y-0 group-hover:scale-y-100 transition-transform duration-300 origin-center bg-cyan-400" />
                    <div className="relative z-10 flex items-center w-full px-6">
                      <div className="w-8 h-8 rounded-sm bg-cyan-500/10 flex items-center justify-center mr-4 group-hover:bg-cyan-500/20 transition-colors">
                        <Target size={15} className="text-cyan-300/80 group-hover:text-cyan-200 transition-colors" />
                      </div>
                      <span className="text-white/80 font-bold text-xs uppercase tracking-[0.12em] group-hover:text-white transition-colors">Admin Dashboard</span>
                      <div className="ml-auto flex items-center gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                        <span className="text-[9px] font-mono uppercase tracking-wider text-cyan-300/70">Tune Live</span>
                        <ChevronRight size={16} className="text-white/20 group-hover:text-cyan-200 group-hover:translate-x-1 transition-all" />
                      </div>
                    </div>
                  </motion.button>

                  <motion.button
                    initial={{ x: -40, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.42, type: 'spring', damping: 20 }}
                    onClick={() => {
                      setNightmareMode(prev => !prev);
                      soundManager.playUIClick();
                    }}
                    onMouseEnter={() => soundManager.playUIHover()}
                    className="group relative flex items-center h-10 cursor-pointer overflow-hidden"
                    style={{ clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 0px))' }}
                  >
                    <div className={`absolute inset-0 border transition-all duration-300 ${nightmareMode ? 'bg-red-950/30 border-red-500/35 group-hover:border-red-400/60' : 'bg-white/[0.02] border-white/[0.05] group-hover:bg-white/[0.06] group-hover:border-white/10'}`} />
                    {/* Left accent */}
                    <div className={`absolute left-0 top-0 bottom-0 w-[3px] transition-all duration-300 ${nightmareMode ? 'bg-red-500' : 'bg-white/10 group-hover:bg-white/20'}`} />
                    {/* Content */}
                    <div className="relative z-10 flex items-center w-full px-5">
                      <div className={`w-7 h-7 rounded-sm flex items-center justify-center mr-3 transition-colors ${nightmareMode ? 'bg-red-500/20' : 'bg-white/[0.03] group-hover:bg-white/[0.06]'}`}>
                        <Skull size={13} className={nightmareMode ? 'text-red-400' : 'text-white/20 group-hover:text-white/35'} />
                      </div>
                      <div className="flex flex-col items-start">
                        <span className={`font-bold text-[10px] uppercase tracking-[0.15em] transition-colors ${nightmareMode ? 'text-red-300' : 'text-white/40 group-hover:text-white/60'}`}>
                          Nightmare Mode
                        </span>
                        {nightmareMode && (
                          <span className="text-[8px] font-mono text-red-500/60 uppercase tracking-wider">
                            More events · Adaptive scaling · No mercy
                          </span>
                        )}
                      </div>
                      {/* Toggle pill */}
                      <div className="ml-auto flex items-center gap-2">
                        <div className={`w-9 h-5 rounded-full relative transition-all duration-300 ${nightmareMode ? 'bg-red-500/80' : 'bg-white/10'}`}>
                          <div className={`absolute w-3.5 h-3.5 rounded-full top-[3px] transition-all duration-300 ${nightmareMode ? 'left-[19px] bg-white' : 'left-[3px] bg-white/30'}`} />
                        </div>
                      </div>
                    </div>
                  </motion.button>
                </div>

                {/* ─── Resources Bar ─── */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 }}
                  className="mt-6 flex items-center gap-5 px-2"
                >
                  <div className="flex items-center gap-2">
                    <Coins size={13} className="text-yellow-500/70" />
                    <span className="text-sm font-mono font-bold text-yellow-500">{playerCoins.toLocaleString()}</span>
                  </div>
                  <div className="w-px h-4 bg-white/10" />
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 bg-white rounded-sm rotate-45 border border-cyan-400/50" />
                    <span className="text-sm font-mono font-bold text-white/70">{savedDataCores}</span>
                    <span className="text-[9px] text-white/25 uppercase tracking-wider font-mono">cores</span>
                  </div>
                  <div className="w-px h-4 bg-white/10" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-white/25 uppercase tracking-wider font-mono">Lv</span>
                    <span className="text-sm font-mono font-bold text-white/40">{playerLevel}</span>
                  </div>
                </motion.div>
              </div>

              {/* ─── RIGHT: Operator Hologram Preview ─── */}
              {(() => {
                const op = OPERATOR_DEFINITIONS.find(o => o.id === selectedOperator);
                if (!op) return null;
                const weaponDef = WEAPON_DEFINITIONS.find(w => w.id === op.startingWeaponId);
                const bonusEntries = Object.entries(op.statBonuses).filter(([_, v]) => v !== 0);
                return (
                  <motion.div
                    initial={{ opacity: 0, x: 30, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    transition={{ delay: 0.3, duration: 0.6, type: 'spring', damping: 25 }}
                    className="hidden lg:flex flex-col items-center w-64 relative"
                  >
                    {/* Connecting line from buttons to hologram */}
                    <div className="absolute left-0 top-1/2 -translate-x-full w-16 flex items-center">
                      <motion.div
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ delay: 0.5, duration: 0.4 }}
                        className="h-px w-full origin-right"
                        style={{ background: `linear-gradient(90deg, transparent, ${op.color}40)` }}
                      />
                    </div>

                    {/* Hologram container */}
                    <div className="relative">
                      {/* Outer glow ring */}
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                        className="absolute -inset-4 rounded-full opacity-20"
                        style={{ border: `1px dashed ${op.color}40` }}
                      />
                      {/* Main avatar circle */}
                      <div
                        className="w-32 h-32 rounded-full relative overflow-hidden"
                        style={{
                          background: `radial-gradient(circle at 55% 40%, ${op.colorSecondary}, ${op.colorDark})`,
                          boxShadow: `0 0 40px ${op.colorGlow}, 0 0 80px ${op.colorGlow}, inset 0 0 20px ${op.colorDark}`
                        }}
                      >
                        {/* Helmet visor */}
                        <motion.div
                          animate={{ opacity: [0.7, 1, 0.7] }}
                          transition={{ duration: 2, repeat: Infinity }}
                          className="absolute w-5 h-9 rounded-full"
                          style={{ right: '28px', top: '28px', background: op.colorVisor, boxShadow: `0 0 12px ${op.colorVisor}, 0 0 25px ${op.colorVisor}40` }}
                        />
                        {/* Core energy */}
                        <motion.div
                          animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.9, 0.5] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                          className="absolute w-2.5 h-2.5 rounded-full"
                          style={{ left: '44px', top: '55px', background: op.color, boxShadow: `0 0 10px ${op.color}` }}
                        />
                        {/* Limb accents */}
                        <div className="absolute bottom-3 left-6 w-4 h-8 rounded-sm" style={{ background: op.colorLimbs, opacity: 0.5 }} />
                        <div className="absolute bottom-3 right-6 w-4 h-8 rounded-sm" style={{ background: op.colorLimbs, opacity: 0.5 }} />
                        {/* Boot accents */}
                        <div className="absolute bottom-0 left-5 w-5 h-3 rounded-t-sm" style={{ background: op.colorBoots, opacity: 0.6 }} />
                        <div className="absolute bottom-0 right-5 w-5 h-3 rounded-t-sm" style={{ background: op.colorBoots, opacity: 0.6 }} />
                        {/* Scanline overlay */}
                        <div className="absolute inset-0 opacity-[0.06]" style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)' }} />
                      </div>
                      {/* Base glow */}
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-24 h-1 rounded-full" style={{ background: op.color, boxShadow: `0 0 20px ${op.color}60`, opacity: 0.5 }} />
                    </div>

                    {/* Operator name */}
                    <div className="mt-5 text-center">
                      <div className="text-[9px] text-white/20 uppercase tracking-[0.4em] font-mono mb-1">Active Operator</div>
                      <div className="text-lg font-black uppercase tracking-wider" style={{ color: op.color }}>{op.name}</div>
                    </div>

                    {/* Weapon loadout */}
                    <div className="mt-3 w-full px-2">
                      <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-sm" style={{ clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)' }}>
                        <Crosshair size={11} style={{ color: op.color }} />
                        <span className="text-[10px] text-white/50 font-medium">{weaponDef?.name || 'Unknown'}</span>
                        <span className="text-[8px] text-white/20 ml-auto uppercase font-mono">{weaponDef?.type}</span>
                      </div>
                    </div>

                    {/* Stat bonuses */}
                    {bonusEntries.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1 justify-center px-2">
                        {bonusEntries.map(([stat, value]) => (
                          <span
                            key={stat}
                            className="text-[9px] px-1.5 py-0.5 font-mono font-bold uppercase"
                            style={{
                              color: (value as number) > 0 ? '#4ade80' : '#f87171',
                              background: (value as number) > 0 ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)'
                            }}
                          >
                            {(value as number) > 0 ? '+' : ''}{Math.round((value as number) * 100)}% {stat.replace('_', ' ')}
                          </span>
                        ))}
                        {op.baseHealth !== 100 && (
                          <span className="text-[9px] px-1.5 py-0.5 font-mono font-bold uppercase" style={{ color: op.baseHealth > 100 ? '#4ade80' : '#f87171', background: op.baseHealth > 100 ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)' }}>
                            {op.baseHealth} hp
                          </span>
                        )}
                      </div>
                    )}

                    {/* Decorative corner markers */}
                    <div className="absolute top-0 right-0 w-6 h-6 border-t border-r opacity-10" style={{ borderColor: op.color }} />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b border-l opacity-10" style={{ borderColor: op.color }} />
                  </motion.div>
                );
              })()}
            </div>

            {/* Credit */}
            <a 
              href="https://www.webaanzee.be" 
              target="_blank" 
              rel="noopener noreferrer"
              className="absolute bottom-6 right-6 flex items-center gap-1.5 group transition-opacity opacity-30 hover:opacity-100"
              onMouseEnter={() => soundManager.playUIHover()}
            >
              <span className="text-[10px] font-mono tracking-widest text-white/50 group-hover:text-white transition-colors">
                by
              </span>
              <span className="text-xs font-bold tracking-tight">
                <span className="text-white">webaanzee.</span>
                <span className="text-[#ffcc00]">be</span>
              </span>
              <ExternalLink size={12} className="text-white/40 group-hover:text-[#ffcc00] transition-colors" />
            </a>
          </motion.div>
        )}

        {gameState === 'PAUSED' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center z-[100]"
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            
            <div className="relative bg-[#0a0a0a] border border-white/10 p-12 rounded-3xl text-center max-w-lg w-full shadow-[0_0_50px_rgba(0,0,0,0.5)]">
              <h2 className="text-5xl font-black italic text-cyan-400 mb-2">PAUSED</h2>
              <p className="text-white/40 uppercase tracking-widest text-xs mb-8">Neural Stream Suspended</p>
              
              <div className="grid grid-cols-2 gap-4 mb-8 text-left bg-white/5 p-6 rounded-2xl border border-white/5">
                <div>
                  <div className="text-[10px] text-white/30 uppercase font-bold tracking-tighter">Kills</div>
                  <div className="text-2xl font-black italic">{engineRef.current?.killCount || 0}</div>
                </div>
                <div>
                  <div className="text-[10px] text-white/30 uppercase font-bold tracking-tighter">Gold</div>
                  <div className="text-2xl font-black italic">{engineRef.current?.coins || 0}</div>
                </div>
                <div className="mt-2">
                  <div className="text-[10px] text-white/30 uppercase font-bold tracking-tighter">Level</div>
                  <div className="text-2xl font-black italic">{engineRef.current?.player.level || 1}</div>
                </div>
                <div className="mt-2">
                  <div className="text-[10px] text-white/30 uppercase font-bold tracking-tighter">Data Cores</div>
                  <div className="text-2xl font-black italic text-cyan-400">+{engineRef.current?.player.pendingDataCores || 0}</div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    setGameState('PLAYING');
                    if (engineRef.current) engineRef.current.paused = false;
                    soundManager.playUIClick();
                  }}
                  className="w-full py-4 bg-cyan-500 text-black font-bold uppercase tracking-widest rounded-xl hover:bg-white transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)]"
                >
                  Resume Stream
                </button>
                <button
                  onClick={() => {
                    setGameState('MENU');
                    exfillCarryoverRef.current = null;
                    setHasExfillCarryover(false);
                    setPlayerLevel(1);
                    setPlayerExperience(0);
                    if (engineRef.current) engineRef.current.stop();
                    soundManager.playUIClick();
                  }}
                  className="w-full py-4 bg-white/5 text-white/60 font-bold uppercase tracking-widest rounded-xl hover:bg-red-500 hover:text-white transition-all border border-white/10"
                >
                  Terminate Run
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {gameState === 'PERMANENT_UPGRADES' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col z-[70] overflow-hidden"
          >
            {/* Base overlay over canvas */}
            <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl pointer-events-none z-0" />
            {/* Cyberpunk background image */}
            <div 
              className="absolute inset-0 bg-cover bg-center pointer-events-none opacity-20 mix-blend-screen z-0"
              style={{ backgroundImage: `url('/neon_cityscape_bg.png')` }}
            />
            {/* Subtle radial gradient */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.8)_100%)] pointer-events-none z-0" />

            <div className="relative z-10 p-8 flex justify-between items-center border-b border-white/10">
              <button
                onClick={() => {
                  soundManager.playUIClick();
                  setGameState('MENU');
                }}
                className="flex items-center gap-2 text-white/50 hover:text-white transition-colors uppercase font-bold tracking-widest text-sm"
              >
                <ArrowLeft size={20} />
                Back to Menu
              </button>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 text-yellow-500">
                  <Coins size={24} />
                  <span className="text-3xl font-black italic">{playerCoins}</span>
                </div>
                <div className="flex items-center gap-2 text-white">
                  <div className="w-4 h-4 bg-white rounded-sm rotate-45 border border-cyan-400" />
                  <span className="text-3xl font-black italic">{savedDataCores}</span>
                </div>
              </div>
            </div>

            <div className="relative z-10 flex-1 overflow-y-auto p-8">
              <div className="max-w-6xl mx-auto">
                <div className="text-center mb-12">
                  <h2 className="text-5xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 mb-4">NEURAL LAB</h2>
                  <p className="text-white/40 uppercase tracking-widest text-xs">Permanent System Enhancements</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {PERMANENT_UPGRADES.map((upgrade) => {
                    const level = permanentUpgrades[upgrade.id] || 0;
                    const isMax = level >= upgrade.maxLevel;
                    const cost = Math.floor(upgrade.baseCost * Math.pow(upgrade.costScale, level));
                    const canAfford = playerCoins >= cost && savedDataCores >= (upgrade.coreCost || 0);

                    return (
                      <div 
                        key={upgrade.id}
                        className={`p-6 rounded-2xl border transition-all ${
                          isMax ? 'bg-emerald-500/5 border-emerald-500/20' : 
                          canAfford ? 'bg-white/5 border-white/10 hover:border-cyan-500/50' : 
                          'bg-white/[0.02] border-white/5 opacity-60'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                            isMax ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-cyan-400'
                          }`}>
                            {upgrade.stat === 'might' && <Zap size={24} />}
                            {upgrade.stat === 'area' && <Target size={24} />}
                            {upgrade.stat === 'speed' && <Activity size={24} />}
                            {upgrade.stat === 'health' && <Shield size={24} />}
                            {upgrade.stat === 'regen' && <Activity size={24} />}
                            {upgrade.stat === 'amount' && <Zap size={24} />}
                            {upgrade.stat === 'revive' && <Zap size={24} />}
                            {!['might', 'area', 'speed', 'health', 'regen', 'amount', 'revive'].includes(upgrade.stat) && <Zap size={24} />}
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-white/40 uppercase font-bold tracking-widest mb-1">Level</div>
                            <div className={`text-xl font-black italic ${isMax ? 'text-emerald-400' : 'text-white'}`}>
                              {level} / {upgrade.maxLevel}
                            </div>
                          </div>
                        </div>

                        <h3 className="text-lg font-bold mb-1">{upgrade.name}</h3>
                        <p className="text-xs text-white/50 mb-6 h-8 line-clamp-2">{upgrade.description}</p>

                        <button
                          disabled={isMax || !canAfford}
                          onClick={() => buyPermanentUpgrade(upgrade)}
                          className={`w-full py-3 rounded-xl font-bold uppercase tracking-widest text-sm transition-all flex items-center justify-center gap-2 ${
                            isMax ? 'bg-emerald-500/20 text-emerald-400 cursor-default' :
                            canAfford ? 'bg-cyan-500 text-black hover:bg-white' :
                            'bg-white/5 text-white/20 cursor-not-allowed'
                          }`}
                        >
                          {isMax ? (
                            <>
                              <CheckCircle2 size={18} />
                              Maxed Out
                            </>
                          ) : (
                            <>
                              <Coins size={16} />
                              <span className="font-mono">{cost.toLocaleString()}</span>
                              {upgrade.coreCost > 0 && (
                                <div className="flex items-center gap-1 border-l border-white/20 pl-2 ml-1">
                                  <div className="w-2.5 h-2.5 bg-white rounded-sm rotate-45 border border-cyan-400" />
                                  <span className="font-mono">{upgrade.coreCost}</span>
                                </div>
                              )}
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {gameState === 'ADMIN_DASHBOARD' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col z-[80] overflow-hidden"
          >
            <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl pointer-events-none z-0" />
            <div
              className="absolute inset-0 bg-cover bg-center pointer-events-none opacity-15 mix-blend-screen z-0"
              style={{ backgroundImage: `url('/neon_cityscape_bg.png')` }}
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.85)_100%)] pointer-events-none z-0" />

            <div className="relative z-10 p-8 flex justify-between items-center border-b border-white/10">
              <button
                onClick={() => {
                  soundManager.playUIClick();
                  setGameState('MENU');
                }}
                className="flex items-center gap-2 text-white/50 hover:text-white transition-colors uppercase font-bold tracking-widest text-sm"
              >
                <ArrowLeft size={20} />
                Back to Menu
              </button>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    soundManager.playUIClick();
                    setAdminBalance({ ...DEFAULT_BALANCE_TUNING });
                  }}
                  className="px-4 py-2 text-xs font-bold uppercase tracking-widest bg-white/5 border border-white/15 text-white/70 hover:text-white hover:bg-white/10 transition-all"
                >
                  Reset Defaults
                </button>
              </div>
            </div>

            <div className="relative z-10 flex-1 overflow-y-auto p-8">
              <div className="max-w-6xl mx-auto">
                <div className="text-center mb-8">
                  <h2 className="text-5xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-cyan-500 to-blue-600 mb-3">
                    ADMIN DASHBOARD
                  </h2>
                  <p className="text-white/45 uppercase tracking-[0.25em] text-xs">Live Balance Knobs</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {ADMIN_KNOBS.map((knob) => {
                    const value = adminBalance[knob.key];
                    return (
                      <div key={knob.key} className="bg-white/[0.03] border border-white/10 rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs uppercase tracking-wider text-white/70 font-bold">{knob.label}</div>
                          <div className="text-xs font-mono text-cyan-300">{Number(value).toFixed(4).replace(/\.?(0+)$/, '')}</div>
                        </div>
                        <p className="text-[11px] leading-relaxed text-white/45 mb-3">{knob.description}</p>
                        <input
                          type="range"
                          min={knob.min}
                          max={knob.max}
                          step={knob.step}
                          value={value}
                          onChange={(e) => updateAdminBalance(knob.key, Number(e.target.value))}
                          className="w-full accent-cyan-400 cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] font-mono text-white/30 mt-2">
                          <span>{knob.min}</span>
                          <span>{knob.max}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {gameState === 'LEVEL_UP' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-xl z-50"
          >
            <div className="w-full max-w-5xl p-8">
              {/* Header */}
              <motion.div
                initial={{ y: -30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: 'spring', damping: 20 }}
                className="text-center mb-10"
              >
                <h2 className="text-5xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500">
                  SYSTEM UPGRADE
                </h2>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: '120px' }}
                  transition={{ delay: 0.3, duration: 0.6 }}
                  className="h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent mx-auto mt-3"
                />
                <p className="text-white/30 text-xs uppercase tracking-[0.4em] mt-3">Select Enhancement Protocol</p>
              </motion.div>

              {/* Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {levelUpOptions.map((option, i) => {
                  const isLegendary = option.rarity === 'legendary';
                  const isRare = option.rarity === 'rare';
                  const isWeapon = option.type === 'weapon' || option.type === 'weapon_upgrade';

                  const borderColor = isLegendary ? 'from-yellow-400 via-amber-500 to-yellow-600'
                    : isRare ? 'from-purple-400 via-fuchsia-500 to-purple-600'
                    : 'from-cyan-400/40 via-blue-400/40 to-cyan-400/40';

                  const glowColor = isLegendary ? 'shadow-yellow-500/20'
                    : isRare ? 'shadow-purple-500/20'
                    : 'shadow-cyan-500/10';

                  const iconBg = isLegendary ? 'bg-gradient-to-br from-yellow-500/30 to-amber-600/20 border-yellow-500/30'
                    : isRare ? 'bg-gradient-to-br from-purple-500/30 to-fuchsia-600/20 border-purple-500/30'
                    : 'bg-gradient-to-br from-white/5 to-white/[0.02] border-white/10';

                  const accentColor = isLegendary ? 'text-yellow-400'
                    : isRare ? 'text-purple-400'
                    : isWeapon ? 'text-cyan-400' : 'text-white';

                  return (
                    <motion.button
                      key={i}
                      initial={{ y: 40, opacity: 0, scale: 0.95 }}
                      animate={{ y: 0, opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.12, type: 'spring', damping: 18, stiffness: 120 }}
                      onClick={() => selectUpgrade(option)}
                      onMouseEnter={() => soundManager.playUIHover()}
                      className={`group relative flex flex-col items-center p-0 rounded-2xl transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1 shadow-lg ${glowColor} hover:shadow-xl cursor-pointer`}
                    >
                      {/* Animated gradient border */}
                      <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${borderColor} p-[1.5px]`}>
                        <div className="w-full h-full rounded-2xl bg-[#0d1117]" />
                      </div>

                      {/* Shimmer effect on legendary/rare */}
                      {(isLegendary || isRare) && (
                        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                          <motion.div
                            animate={{ x: ['-100%', '200%'] }}
                            transition={{ repeat: Infinity, duration: isLegendary ? 2 : 3, ease: 'linear' }}
                            className={`absolute inset-y-0 w-1/3 ${isLegendary ? 'bg-gradient-to-r from-transparent via-yellow-400/10 to-transparent' : 'bg-gradient-to-r from-transparent via-purple-400/8 to-transparent'}`}
                          />
                        </div>
                      )}

                      {/* Card content */}
                      <div className="relative z-10 w-full p-7 flex flex-col items-center">
                        {/* Rarity badge */}
                        {option.rarity && option.rarity !== 'common' && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: i * 0.12 + 0.3, type: 'spring' }}
                            className="absolute top-3 right-3"
                          >
                            <span className={`text-[9px] px-2.5 py-1 rounded-full font-black uppercase tracking-widest ${
                              isLegendary 
                                ? 'bg-gradient-to-r from-yellow-500 to-amber-600 text-black shadow-lg shadow-yellow-500/30' 
                                : 'bg-gradient-to-r from-purple-500 to-fuchsia-600 text-white shadow-lg shadow-purple-500/30'
                            }`}>
                              {option.rarity}
                            </span>
                          </motion.div>
                        )}

                        {/* Type badge for weapons */}
                        {isWeapon && (
                          <div className="absolute top-3 left-3">
                            <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-cyan-500/10 text-cyan-400/80 border border-cyan-500/20">
                              {option.type === 'weapon' ? 'New Weapon' : 'Upgrade'}
                            </span>
                          </div>
                        )}

                        {/* Icon */}
                        <motion.div
                          whileHover={{ scale: 1.1, rotate: [0, -5, 5, 0] }}
                          transition={{ duration: 0.3 }}
                          className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-5 border ${iconBg} group-hover:scale-105 transition-transform`}
                        >
                          {option.id === 'might' && <Zap size={32} className="text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]" />}
                          {option.id === 'area' && <Target size={32} className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" />}
                          {option.id === 'speed' && <Activity size={32} className="text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" />}
                          {option.id === 'cooldown' && <Zap size={32} className="text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]" />}
                          {option.id === 'growth' && <Trophy size={32} className="text-purple-400 drop-shadow-[0_0_8px_rgba(192,132,252,0.5)]" />}
                          {option.id === 'amount' && <Shield size={32} className="text-orange-400 drop-shadow-[0_0_8px_rgba(251,146,60,0.5)]" />}
                          {option.id === 'health' && <Shield size={32} className="text-rose-400 drop-shadow-[0_0_8px_rgba(251,113,133,0.5)]" />}
                          {option.id === 'luck' && <Zap size={32} className="text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" />}
                          {option.id === 'regen' && <Activity size={32} className="text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.5)]" />}
                          {option.id === 'god_mode' && <Zap size={32} className="text-yellow-300 drop-shadow-[0_0_12px_rgba(253,224,71,0.6)]" />}
                          {option.id === 'instant_kill' && <Skull size={32} className="text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]" />}
                          {option.type === 'weapon' && <Crosshair size={32} className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" />}
                          {option.type === 'weapon_upgrade' && <Zap size={32} className="text-cyan-300 drop-shadow-[0_0_8px_rgba(103,232,249,0.5)]" />}
                        </motion.div>

                        {/* Name */}
                        <h3 className={`text-lg font-black uppercase tracking-tight mb-1.5 ${accentColor} group-hover:brightness-125 transition-all`}>
                          {option.name}
                        </h3>

                        {/* Description */}
                        <p className="text-xs text-white/40 text-center leading-relaxed mb-5 min-h-[32px]">
                          {option.description}
                        </p>

                        {/* Select button area */}
                        <div className={`w-full py-2.5 rounded-xl text-center text-xs font-bold uppercase tracking-widest transition-all ${
                          isLegendary ? 'bg-yellow-500/10 text-yellow-400/70 group-hover:bg-yellow-500/20 group-hover:text-yellow-400 border border-yellow-500/10 group-hover:border-yellow-500/30'
                          : isRare ? 'bg-purple-500/10 text-purple-400/70 group-hover:bg-purple-500/20 group-hover:text-purple-400 border border-purple-500/10 group-hover:border-purple-500/30'
                          : 'bg-white/[0.03] text-white/30 group-hover:bg-white/[0.08] group-hover:text-white/60 border border-white/5 group-hover:border-white/15'
                        }`}>
                          Select
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {gameState === 'TREASURE' && treasureReward && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center z-[60]"
          >
            {/* Tier-colored background */}
            <div className={`fixed inset-0 ${
              treasureReward._treasureTier === 'legendary' ? 'bg-gradient-to-b from-orange-950/95 via-black/95 to-orange-950/95' :
              treasureReward._treasureTier === 'epic' ? 'bg-gradient-to-b from-purple-950/95 via-black/95 to-purple-950/95' :
              'bg-gradient-to-b from-yellow-950/95 via-black/95 to-yellow-950/95'
            } backdrop-blur-xl pointer-events-none`} />

            {/* Animated background particles */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  className={`absolute w-1 h-1 rounded-full ${
                    treasureReward._treasureTier === 'legendary' ? 'bg-orange-400' :
                    treasureReward._treasureTier === 'epic' ? 'bg-purple-400' :
                    'bg-yellow-400'
                  }`}
                  initial={{
                    x: `${Math.random() * 100}vw`,
                    y: '110vh',
                    scale: Math.random() * 2 + 0.5,
                    opacity: 0
                  }}
                  animate={{
                    y: '-10vh',
                    opacity: [0, 0.8, 0],
                    scale: [0.5, Math.random() + 1, 0.5]
                  }}
                  transition={{
                    duration: 3 + Math.random() * 4,
                    repeat: Infinity,
                    delay: Math.random() * 2,
                    ease: 'linear'
                  }}
                />
              ))}
            </div>

            <div className="text-center max-w-lg p-8 relative z-10">
              {/* Chest icon with layered glow */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", damping: 10, stiffness: 100 }}
                className="mb-6 relative"
              >
                <div className={`absolute inset-0 blur-3xl animate-pulse ${
                  treasureReward._treasureTier === 'legendary' ? 'bg-orange-500/30' :
                  treasureReward._treasureTier === 'epic' ? 'bg-purple-500/25' :
                  'bg-yellow-500/20'
                }`} />
                <div className={`absolute inset-0 blur-xl ${
                  treasureReward._treasureTier === 'legendary' ? 'bg-orange-400/20' :
                  treasureReward._treasureTier === 'epic' ? 'bg-purple-400/15' :
                  'bg-yellow-400/10'
                }`} />
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  {treasureReward._treasureTier === 'legendary' ? (
                    <Crown size={100} className="mx-auto text-orange-400 relative z-10 drop-shadow-[0_0_30px_rgba(255,140,0,0.6)]" />
                  ) : treasureReward._treasureTier === 'epic' ? (
                    <Sparkles size={100} className="mx-auto text-purple-400 relative z-10 drop-shadow-[0_0_25px_rgba(168,85,247,0.5)]" />
                  ) : (
                    <Trophy size={100} className="mx-auto text-yellow-500 relative z-10 drop-shadow-[0_0_20px_rgba(255,215,0,0.5)]" />
                  )}
                </motion.div>
              </motion.div>

              {/* Title with tier-specific styling */}
              <motion.div
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <h2 className={`text-5xl font-black italic mb-1 tracking-tighter ${
                  treasureReward._treasureTier === 'legendary' ? 'text-orange-400' :
                  treasureReward._treasureTier === 'epic' ? 'text-purple-400' :
                  'text-yellow-500'
                }`}>
                  {treasureReward._treasureTier === 'legendary' ? 'LEGENDARY CACHE!' :
                   treasureReward._treasureTier === 'epic' ? 'EPIC TREASURE!' :
                   'TREASURE FOUND!'}
                </h2>
                <p className="text-sm text-white/40 uppercase tracking-widest mb-6">
                  {treasureReward._treasureTier} tier
                </p>
              </motion.div>

              {/* Bonus rewards banner */}
              {(treasureReward._bonusCoins || treasureReward._bonusXP) && (
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.35, type: 'spring', damping: 15 }}
                  className="flex justify-center gap-6 mb-6"
                >
                  {treasureReward._bonusCoins > 0 && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                      <Coins size={18} className="text-yellow-400" />
                      <span className="text-yellow-300 font-bold">+{treasureReward._bonusCoins}</span>
                    </div>
                  )}
                  {treasureReward._bonusXP > 0 && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
                      <Star size={18} className="text-cyan-400" />
                      <span className="text-cyan-300 font-bold">+{treasureReward._bonusXP} XP</span>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Upgrade card */}
              <motion.div
                initial={{ y: 20, opacity: 0, scale: 0.9 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={{ delay: 0.45, type: 'spring', damping: 14 }}
              >
                <div className={`p-8 border rounded-3xl mb-8 relative overflow-hidden ${
                  treasureReward._treasureTier === 'legendary'
                    ? 'bg-orange-500/5 border-orange-500/30'
                    : treasureReward._treasureTier === 'epic'
                    ? 'bg-purple-500/5 border-purple-500/30'
                    : 'bg-yellow-500/5 border-yellow-500/30'
                }`}>
                  {/* Shimmer effect */}
                  <motion.div
                    className={`absolute inset-0 bg-gradient-to-r from-transparent ${
                      treasureReward._treasureTier === 'legendary' ? 'via-orange-400/10' :
                      treasureReward._treasureTier === 'epic' ? 'via-purple-400/10' :
                      'via-yellow-400/10'
                    } to-transparent`}
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                  />
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 ${
                    treasureReward._treasureTier === 'legendary' ? 'bg-orange-500/20' :
                    treasureReward._treasureTier === 'epic' ? 'bg-purple-500/20' :
                    'bg-yellow-500/20'
                  }`}>
                    <Zap size={32} className={
                      treasureReward._treasureTier === 'legendary' ? 'text-orange-400' :
                      treasureReward._treasureTier === 'epic' ? 'text-purple-400' :
                      'text-yellow-400'
                    } />
                  </div>
                  <h3 className="text-2xl font-bold uppercase mb-2 relative">{treasureReward.name}</h3>
                  <p className="text-white/50 mb-5 relative">{treasureReward.description}</p>
                  <span className={`px-4 py-1.5 text-xs font-black uppercase rounded-full relative ${
                    treasureReward.rarity === 'legendary' ? 'bg-orange-500 text-black' :
                    treasureReward.rarity === 'rare' ? 'bg-yellow-500 text-black' :
                    'bg-white/20 text-white'
                  }`}>
                    {treasureReward.rarity}
                  </span>
                </div>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    if (engineRef.current) {
                      engineRef.current.applyUpgrade(treasureReward);
                    }
                    setGameState('PLAYING');
                  }}
                  onMouseEnter={() => soundManager.playUIHover()}
                  className={`px-14 py-4 font-bold uppercase tracking-widest rounded-full transition-all shadow-lg ${
                    treasureReward._treasureTier === 'legendary'
                      ? 'bg-gradient-to-r from-orange-500 to-yellow-500 text-black hover:shadow-orange-500/40 hover:shadow-xl'
                      : treasureReward._treasureTier === 'epic'
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:shadow-purple-500/40 hover:shadow-xl'
                      : 'bg-white text-black hover:bg-yellow-500 hover:text-white hover:shadow-yellow-500/30 hover:shadow-xl'
                  }`}
                >
                  Claim Reward
                </motion.button>
              </motion.div>
            </div>
          </motion.div>
        )}
        {gameState === 'OPERATOR_SELECT' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center z-50 overflow-y-auto"
          >
            {/* Base overlay over canvas */}
            <div className="fixed inset-0 bg-black/90 backdrop-blur-xl pointer-events-none z-0" />
            {/* Cyberpunk background image */}
            <div 
              className="fixed inset-0 bg-cover bg-center pointer-events-none opacity-30 mix-blend-screen z-0"
              style={{ backgroundImage: `url('/neon_cityscape_bg.png')` }}
            />
            {/* Subtle radial gradient */}
            <div className="fixed inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.8)_100%)] pointer-events-none z-0" />

            <div className="relative z-10 max-w-5xl w-full p-8 mt-12 mb-12">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-4xl font-black italic tracking-tighter text-white">SELECT OPERATOR</h2>
                  <p className="text-white/40 text-sm mt-1">Each operator has unique abilities, weapons, and stat profiles</p>
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2 text-yellow-500 font-mono text-lg">
                    <Coins size={18} />
                    <span>{playerCoins}</span>
                  </div>
                  <button
                    onClick={() => { soundManager.playUIClick(); setGameState('MENU'); }}
                    onMouseEnter={() => soundManager.playUIHover()}
                    className="px-6 py-2 bg-white/5 text-white text-sm font-bold uppercase tracking-widest rounded-full border border-white/10 hover:bg-white/10 transition-all flex items-center gap-2"
                  >
                    <ArrowLeft size={14} /> Back
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {OPERATOR_DEFINITIONS.map((op) => {
                  const isUnlocked = unlockedOperators.includes(op.id);
                  const isSelected = selectedOperator === op.id;
                  const canAfford = playerCoins >= op.cost;
                  const weaponDef = WEAPON_DEFINITIONS.find(w => w.id === op.startingWeaponId);
                  const bonusEntries = Object.entries(op.statBonuses).filter(([_, v]) => v !== 0);

                  return (
                    <motion.div
                      key={op.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: OPERATOR_DEFINITIONS.indexOf(op) * 0.05 }}
                      className={`relative rounded-2xl border p-5 transition-all duration-300 ${
                        isSelected 
                          ? 'border-2 bg-white/[0.07]' 
                          : isUnlocked 
                            ? 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]' 
                            : 'border-white/5 bg-white/[0.02] opacity-80'
                      }`}
                      style={isSelected ? { borderColor: op.color } : {}}
                    >
                      {/* Operator Preview Circle */}
                      <div className="flex items-center gap-4 mb-4">
                        <div 
                          className="w-16 h-16 rounded-full flex items-center justify-center relative overflow-hidden" 
                          style={{ 
                            background: `radial-gradient(circle at 60% 40%, ${op.colorSecondary}, ${op.colorDark})`,
                            boxShadow: `0 0 20px ${op.colorGlow}, inset 0 0 15px ${op.colorDark}`
                          }}
                        >
                          {/* Visor glow */}
                          <div 
                            className="w-4 h-7 rounded-full absolute" 
                            style={{ 
                              right: '12px',
                              background: op.colorVisor, 
                              boxShadow: `0 0 8px ${op.colorVisor}`,
                              opacity: 0.9 
                            }}
                          />
                          {/* Core dot */}
                          <div 
                            className="w-2 h-2 rounded-full absolute"
                            style={{ left: '22px', background: op.color, boxShadow: `0 0 6px ${op.color}` }}
                          />
                          {!isUnlocked && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                              <Lock size={22} className="text-white/50" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-xl font-black uppercase tracking-wider" style={{ color: isUnlocked ? op.color : '#666' }}>
                            {op.name}
                          </h3>
                          <p className="text-white/40 text-xs leading-relaxed mt-0.5">{op.description}</p>
                        </div>
                      </div>

                      {/* Starting Weapon */}
                      <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-white/5 rounded-lg">
                        <Crosshair size={13} style={{ color: op.color }} />
                        <span className="text-xs text-white/70 font-medium">{weaponDef?.name || 'Unknown'}</span>
                        <span className="text-[10px] text-white/30 ml-auto uppercase">{weaponDef?.type}</span>
                      </div>

                      {/* Stat Bonuses */}
                      {bonusEntries.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {bonusEntries.map(([stat, value]) => (
                            <span 
                              key={stat}
                              className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold uppercase"
                              style={{ 
                                color: (value as number) > 0 ? '#4ade80' : '#f87171', 
                                background: (value as number) > 0 ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)' 
                              }}
                            >
                              {(value as number) > 0 ? '+' : ''}{Math.round((value as number) * 100)}% {stat.replace('_', ' ')}
                            </span>
                          ))}
                          {op.baseHealth !== 100 && (
                            <span 
                              className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold uppercase"
                              style={{ 
                                color: op.baseHealth > 100 ? '#4ade80' : '#f87171',
                                background: op.baseHealth > 100 ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)'
                              }}
                            >
                              {op.baseHealth} HP
                            </span>
                          )}
                          {op.baseSpeed !== 3.2 && (
                            <span 
                              className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold uppercase"
                              style={{ 
                                color: op.baseSpeed > 3.2 ? '#4ade80' : '#f87171',
                                background: op.baseSpeed > 3.2 ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)'
                              }}
                            >
                              {op.baseSpeed > 3.2 ? 'FAST' : 'SLOW'}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Action */}
                      {isUnlocked ? (
                        isSelected ? (
                          <div className="flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-bold uppercase tracking-widest"
                            style={{ color: op.color, borderColor: op.color + '40', borderWidth: 1 }}
                          >
                            <CheckCircle2 size={16} /> Active
                          </div>
                        ) : (
                          <button
                            onClick={() => { soundManager.playUIClick(); setSelectedOperator(op.id); }}
                            onMouseEnter={() => soundManager.playUIHover()}
                            className="w-full py-2.5 rounded-full text-sm font-bold uppercase tracking-widest border border-white/10 text-white hover:bg-white/10 transition-all"
                          >
                            Select
                          </button>
                        )
                      ) : (
                        <button
                          onClick={() => unlockOperator(op.id)}
                          onMouseEnter={() => soundManager.playUIHover()}
                          disabled={!canAfford}
                          className={`w-full py-2.5 rounded-full text-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                            canAfford 
                              ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30' 
                              : 'bg-white/5 text-white/20 border border-white/5 cursor-not-allowed'
                          }`}
                        >
                          <Lock size={14} />
                          <Coins size={14} />
                          {op.cost.toLocaleString()}
                        </button>
                      )}

                      {/* Selected glow effect */}
                      {isSelected && (
                        <div 
                          className="absolute inset-0 rounded-2xl pointer-events-none"
                          style={{ boxShadow: `inset 0 0 30px ${op.colorGlow}, 0 0 15px ${op.colorGlow}` }}
                        />
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {gameState === 'INTEL_ARCHIVE' && (
          <IntelArchive onBack={() => { soundManager.playUIClick(); setGameState('MENU'); }} />
        )}

        {gameState === 'EXFILL_SUMMARY' && exfillSummary && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-start justify-center bg-cyan-950/85 backdrop-blur-xl z-50 p-4 md:p-6 overflow-y-auto"
          >
            <div className="w-full max-w-4xl bg-black/70 border border-cyan-500/20 rounded-3xl p-6 md:p-8 my-4 md:my-8">
              <div className="text-center mb-8">
                <h2 className="text-6xl font-black italic tracking-tighter text-cyan-300">EXFILL SUCCESS</h2>
                <p className="text-cyan-100/50 uppercase tracking-widest text-xs mt-2">Run Snapshot Archived</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
                  <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Time</div>
                  <div className="text-2xl font-black italic">{formatTime(exfillSummary.time)}</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
                  <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Kills</div>
                  <div className="text-2xl font-black italic">{exfillSummary.kills}</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
                  <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Level</div>
                  <div className="text-2xl font-black italic">{exfillSummary.level}</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
                  <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Gold Extracted</div>
                  <div className="text-2xl font-black italic text-yellow-400">{exfillSummary.coins}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-white/70 text-sm uppercase tracking-widest font-bold">Loadout</div>
                    <div className="text-cyan-300 text-sm font-bold">{exfillSummary.weaponCount} Weapons</div>
                  </div>
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {exfillSummary.weapons.map((weapon: any) => (
                      <div key={weapon.id} className="flex items-center justify-between bg-black/30 border border-white/5 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Crosshair size={14} className="text-cyan-400" />
                          <span className="text-white/85 text-sm">{weapon.name}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-white/50">Lv {weapon.level}</div>
                          <div className="text-[11px] text-yellow-400/80">{weapon.damageDone.toLocaleString()} dmg</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <div className="text-white/70 text-sm uppercase tracking-widest font-bold mb-4">Run Totals</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-black/30 border border-white/5 rounded-lg p-3">
                      <div className="text-[10px] text-white/40 uppercase">Data Cores</div>
                      <div className="text-xl font-bold text-cyan-300">+{exfillSummary.dataCores}</div>
                    </div>
                    <div className="bg-black/30 border border-white/5 rounded-lg p-3">
                      <div className="text-[10px] text-white/40 uppercase">Health At Exfill</div>
                      <div className="text-xl font-bold">{Math.ceil(exfillSummary.health)} / {Math.ceil(exfillSummary.maxHealth)}</div>
                    </div>
                    <div className="bg-black/30 border border-white/5 rounded-lg p-3 col-span-2">
                      <div className="text-[10px] text-white/40 uppercase">Run Upgrades Picked</div>
                      <div className="text-xl font-bold">{exfillSummary.upgradeCount}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-8 bg-white/5 border border-cyan-400/20 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-white/70 text-sm uppercase tracking-widest font-bold">Profile XP Earned</div>
                  <div className="text-2xl font-black italic text-cyan-300">+{exfillDisplayedTotalXP} XP</div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {(exfillSummary.xpBreakdown || []).map((item: XPBreakdownItem) => (
                    <div key={item.label} className="flex items-center justify-between bg-black/30 border border-white/5 rounded-lg px-3 py-2">
                      <span className="text-xs text-white/65 uppercase tracking-wide">{item.label}</span>
                      <span className="text-sm font-mono font-bold text-cyan-300">+{item.value}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-[11px] font-mono uppercase tracking-wider text-white/40">
                  {exfillTotalRevealDone ? 'Total locked. Claim to add it to your profile.' : 'Counting total XP...'}
                </div>
              </div>

              <div className="flex justify-center">
                <button
                  onClick={() => {
                    queueXPReward(exfillSummary.xpBreakdown || []);
                    soundManager.playUIClick();
                    setGameState('MENU');
                  }}
                  disabled={!exfillTotalRevealDone}
                  onMouseEnter={() => soundManager.playUIHover()}
                  className={`px-12 py-4 font-black uppercase tracking-widest rounded-full transition-all ${
                    exfillTotalRevealDone
                      ? 'bg-cyan-500 text-black hover:bg-white'
                      : 'bg-white/10 text-white/35 cursor-not-allowed'
                  }`}
                >
                  {exfillTotalRevealDone ? 'Claim XP & Continue To Menu' : 'Counting XP...'}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {gameState === 'GAME_OVER' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-red-950/90 backdrop-blur-xl z-50"
          >
            <div className="text-center p-12">
              <h2 className="text-8xl font-black italic mb-4 text-red-500 tracking-tighter">PROTOCOL FAILED</h2>
              <div className="flex justify-center gap-12 mb-12 py-8 border-y border-white/10">
                <div>
                  <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Time</div>
                  <div className="text-3xl font-mono">
                    {Math.floor(gameOverStats.time / 60000)}:
                    {Math.floor((gameOverStats.time % 60000) / 1000).toString().padStart(2, '0')}
                  </div>
                </div>
                <div>
                  <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Kills</div>
                  <div className="text-3xl font-mono">{gameOverStats.kills}</div>
                </div>
                <div>
                  <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Level</div>
                  <div className="text-3xl font-mono">{gameOverStats.level}</div>
                </div>
                <div>
                  <div className="text-white/40 text-xs uppercase tracking-widest mb-1">XP Earned</div>
                  <div className="text-3xl font-mono text-cyan-300">+{gameOverStats.xpEarned || 0}</div>
                </div>
              </div>
              {(gameOverStats.xpBreakdown || []).length > 0 && (
                <div className="max-w-2xl mx-auto mb-10 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {gameOverStats.xpBreakdown.map((item: XPBreakdownItem) => (
                    <div key={item.label} className="flex items-center justify-between bg-black/20 border border-white/10 rounded-lg px-3 py-2">
                      <span className="text-xs text-white/60 uppercase tracking-wide">{item.label}</span>
                      <span className="text-sm font-mono text-cyan-300">+{item.value}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-4 justify-center">
                <button
                  onClick={startGame}
                  onMouseEnter={() => soundManager.playUIHover()}
                  className="group relative px-10 py-4 bg-white text-black font-bold uppercase tracking-widest rounded-full hover:bg-cyan-500 transition-all overflow-hidden"
                >
                  <div className="relative z-10 flex items-center gap-2">
                    <Play size={18} fill="currentColor" />
                    Try Again
                  </div>
                </button>
                <button
                  onClick={() => {
                    soundManager.playUIClick();
                    exfillCarryoverRef.current = null;
                    setHasExfillCarryover(false);
                    setPlayerLevel(1);
                    setPlayerExperience(0);
                    if (engineRef.current) engineRef.current.stop();
                    setGameState('MENU');
                  }}
                  onMouseEnter={() => soundManager.playUIHover()}
                  className="px-10 py-4 bg-white/5 text-white font-bold uppercase tracking-widest rounded-full border border-white/10 hover:bg-white/10 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <ArrowLeft size={18} />
                    Back to Menu
                  </div>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
