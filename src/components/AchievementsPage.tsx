import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, CheckCircle2, Coins, Lock, Search, Sparkles, Target, Trophy } from 'lucide-react';
import {
  AchievementDefinition,
  AchievementRuntimeSnapshot,
  AchievementUnlock,
  getAchievementProgress
} from '../game/achievements';

interface AchievementsPageProps {
  achievements: AchievementDefinition[];
  unlocks: AchievementUnlock[];
  progressSnapshot?: AchievementRuntimeSnapshot;
  onBack: () => void;
}

const EMPTY_SNAPSHOT: AchievementRuntimeSnapshot = {
  currentWave: 0,
  playerLevel: 0,
  killCount: 0,
  totalCoinsCollected: 0,
  runCoinsBanked: 0,
  weaponCount: 0,
  weaponTotalLevels: 0,
  upgradeCount: 0,
  gameTimeMs: 0,
  comboCount: 0,
  currentWaveKillCount: 0,
  currentWaveLevelUps: 0
};

const VIRTUAL_ROW_HEIGHT = 238;
const VIRTUAL_OVERSCAN_ROWS = 4;

function categoryLabel(category: AchievementDefinition['category']) {
  switch (category) {
    case 'wave':
      return 'Waves';
    case 'level':
      return 'Levels';
    case 'kills':
      return 'Kills';
    case 'economy':
      return 'Economy';
    case 'loadout':
      return 'Loadout';
    case 'survival':
      return 'Survival';
    case 'combo':
      return 'Combo';
    default:
      return 'General';
  }
}

export function AchievementsPage({ achievements, unlocks, progressSnapshot, onBack }: AchievementsPageProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | AchievementDefinition['category']>('all');
  const [columns, setColumns] = useState(1);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(720);
  const virtualScrollerRef = useRef<HTMLDivElement | null>(null);

  const unlockedMap = useMemo(() => new Map(unlocks.map((unlock) => [unlock.achievementId, unlock])), [unlocks]);
  const snapshot = progressSnapshot ?? EMPTY_SNAPSHOT;
  const unlockedCount = unlocks.length;
  const total = achievements.length;
  const completion = total > 0 ? Math.round((unlockedCount / total) * 100) : 0;

  const categories: Array<'all' | AchievementDefinition['category']> = [
    'all',
    'wave',
    'level',
    'kills',
    'economy',
    'loadout',
    'survival',
    'combo'
  ];

  const query = search.trim().toLowerCase();
  const filteredAchievements = useMemo(() => {
    return achievements.filter((achievement) => {
      if (categoryFilter !== 'all' && achievement.category !== categoryFilter) return false;
      if (!query) return true;
      return (
        achievement.title.toLowerCase().includes(query) ||
        achievement.description.toLowerCase().includes(query) ||
        achievement.chapter.toLowerCase().includes(query)
      );
    });
  }, [achievements, categoryFilter, query]);

  const progressById = useMemo(
    () => new Map(achievements.map((achievement) => [achievement.id, getAchievementProgress(achievement, snapshot)])),
    [achievements, snapshot]
  );

  const nearUnlock = useMemo(() => {
    return achievements
      .filter((achievement) => !unlockedMap.has(achievement.id))
      .map((achievement) => ({
        achievement,
        progress: progressById.get(achievement.id) ?? getAchievementProgress(achievement, snapshot)
      }))
      .filter((entry) => entry.progress.ratio > 0 && entry.progress.ratio < 1)
      .sort((a, b) => {
        if (b.progress.ratio !== a.progress.ratio) return b.progress.ratio - a.progress.ratio;
        return a.progress.remaining - b.progress.remaining;
      })
      .slice(0, 8);
  }, [achievements, progressById, snapshot, unlockedMap]);

  const nearUnlockIds = useMemo(() => new Set(nearUnlock.map((entry) => entry.achievement.id)), [nearUnlock]);

  useEffect(() => {
    const updateLayout = () => {
      const width = window.innerWidth;
      setColumns(width >= 1280 ? 3 : width >= 768 ? 2 : 1);
      if (virtualScrollerRef.current) {
        setViewportHeight(virtualScrollerRef.current.clientHeight || 720);
      }
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  useEffect(() => {
    if (!virtualScrollerRef.current) return;
    virtualScrollerRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [search, categoryFilter]);

  const totalRows = Math.ceil(filteredAchievements.length / columns);
  const startRow = Math.max(0, Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN_ROWS);
  const endRow = Math.min(
    totalRows,
    Math.ceil((scrollTop + viewportHeight) / VIRTUAL_ROW_HEIGHT) + VIRTUAL_OVERSCAN_ROWS
  );
  const startIndex = startRow * columns;
  const endIndex = Math.min(filteredAchievements.length, endRow * columns);
  const visibleAchievements = filteredAchievements.slice(startIndex, endIndex);
  const topSpacerHeight = startRow * VIRTUAL_ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, (totalRows - endRow) * VIRTUAL_ROW_HEIGHT);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 overflow-y-auto"
    >
      <div className="fixed inset-0 bg-black/90 backdrop-blur-xl pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(6,182,212,0.2),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(250,204,21,0.12),transparent_35%),radial-gradient(circle_at_50%_100%,rgba(239,68,68,0.12),transparent_45%)] pointer-events-none" />

      <div className="relative max-w-6xl mx-auto p-6 md:p-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-4xl md:text-5xl font-black italic tracking-tight text-cyan-200">ACHIEVEMENTS</h2>
            <p className="text-white/50 text-sm mt-1">Run milestones, mastery goals, and operator feats.</p>
          </div>
          <button
            onClick={onBack}
            className="px-5 py-2 rounded-full bg-white/10 border border-white/15 hover:bg-white/20 text-white text-sm font-bold uppercase tracking-wider transition-all cursor-pointer"
          >
            <span className="flex items-center gap-2"><ArrowLeft size={14} /> Back</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="rounded-2xl border border-cyan-400/25 bg-cyan-950/30 p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-100/60">Progress</div>
            <div className="mt-2 text-3xl font-black text-cyan-200">{unlockedCount} / {total}</div>
            <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden border border-white/10">
              <div className="h-full bg-gradient-to-r from-cyan-400 via-blue-400 to-cyan-200" style={{ width: `${completion}%` }} />
            </div>
          </div>

          <div className="rounded-2xl border border-yellow-400/25 bg-yellow-900/20 p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-yellow-100/70">Completion</div>
            <div className="mt-2 text-3xl font-black text-yellow-300">{completion}%</div>
            <div className="mt-2 text-xs text-yellow-100/60">Unlock all to complete the archive.</div>
          </div>

          <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">Reward Feed</div>
            <div className="mt-2 flex items-center gap-3 text-white/75 text-sm">
              <Coins size={16} className="text-yellow-400" /> Instant coins during runs
            </div>
            <div className="mt-1 flex items-center gap-3 text-white/75 text-sm">
              <Sparkles size={16} className="text-cyan-300" /> Instant XP during runs
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-4 mb-6">
          <div className="flex flex-col xl:flex-row xl:items-center gap-3">
            <label className="relative flex-1 min-w-0">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title, chapter, or description"
                className="w-full rounded-xl bg-black/40 border border-white/15 pl-9 pr-3 py-2 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {categories.map((category) => {
                const active = categoryFilter === category;
                return (
                  <button
                    key={category}
                    onClick={() => setCategoryFilter(category)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] uppercase tracking-[0.14em] border transition-all cursor-pointer ${
                      active
                        ? 'bg-cyan-500/20 border-cyan-300/50 text-cyan-100'
                        : 'bg-white/5 border-white/15 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    {category === 'all' ? 'All' : categoryLabel(category)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-3 text-xs text-white/45">
            Showing {filteredAchievements.length.toLocaleString()} of {total.toLocaleString()} achievements.
          </div>
          <div className="mt-1 text-[11px] text-white/35">
            Rendering {visibleAchievements.length.toLocaleString()} cards at once for smooth scrolling.
          </div>
        </div>

        <div className="rounded-2xl border border-amber-400/20 bg-amber-950/20 p-4 mb-6">
          <div className="flex items-center gap-2 text-amber-200 text-xs uppercase tracking-[0.2em] font-bold mb-3">
            <Target size={14} /> Near Unlock Targets
          </div>
          {nearUnlock.length === 0 ? (
            <div className="text-xs text-amber-100/65">Play a run to generate near-unlock progress highlights.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {nearUnlock.map(({ achievement, progress }) => (
                <div key={achievement.id} className="rounded-xl border border-amber-300/30 bg-black/25 p-3">
                  <div className="text-[9px] uppercase tracking-[0.18em] text-amber-100/70 mb-1">{achievement.chapter}</div>
                  <div className="text-xs font-bold text-amber-100 leading-snug">{achievement.title}</div>
                  <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden border border-white/10">
                    <div className="h-full bg-gradient-to-r from-amber-400 to-yellow-200" style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
                  </div>
                  <div className="mt-1 text-[10px] text-amber-100/80 font-mono">
                    {Math.floor(progress.current)} / {progress.target} ({Math.round(progress.ratio * 100)}%)
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          ref={virtualScrollerRef}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          className="max-h-[58vh] overflow-y-auto pr-1 pb-8"
        >
          {topSpacerHeight > 0 && <div style={{ height: topSpacerHeight }} />}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {visibleAchievements.map((achievement, index) => {
            const absoluteIndex = startIndex + index;
            const unlock = unlockedMap.get(achievement.id);
            const unlocked = !!unlock;
            const progress = progressById.get(achievement.id) ?? getAchievementProgress(achievement, snapshot);
            const highlighted = nearUnlockIds.has(achievement.id);
            return (
              <div
                key={achievement.id}
                className={`rounded-xl border p-4 transition-all ${
                  unlocked
                    ? 'bg-emerald-500/10 border-emerald-400/30'
                    : highlighted
                      ? 'bg-amber-500/10 border-amber-300/45'
                      : 'bg-white/[0.03] border-white/10'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-white/45 mb-1">{categoryLabel(achievement.category)} • {achievement.chapter}</div>
                    <h3 className={`font-bold text-sm ${unlocked ? 'text-emerald-200' : 'text-white/85'}`}>
                      {achievement.title}
                    </h3>
                  </div>
                  <div className="mt-0.5">
                    {unlocked ? (
                      <CheckCircle2 size={18} className="text-emerald-300" />
                    ) : (
                      <Lock size={16} className="text-white/35" />
                    )}
                  </div>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-white/55 min-h-9">{achievement.description}</p>

                {!unlocked && (
                  <div className="mt-2">
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden border border-white/10">
                      <div
                        className={`h-full ${highlighted ? 'bg-gradient-to-r from-amber-400 to-yellow-200' : 'bg-gradient-to-r from-cyan-400 to-blue-300'}`}
                        style={{ width: `${Math.round(progress.ratio * 100)}%` }}
                      />
                    </div>
                    <div className="mt-1 text-[10px] text-white/50 font-mono">
                      Progress {Math.floor(progress.current)} / {progress.target} ({Math.round(progress.ratio * 100)}%)
                    </div>
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1 text-yellow-300/90">
                      <Coins size={12} /> +{achievement.rewardCoins}
                    </span>
                    <span className="inline-flex items-center gap-1 text-cyan-300/90">
                      <Sparkles size={12} /> +{achievement.rewardXP} XP
                    </span>
                  </div>
                  <span className="text-white/35 font-mono">#{absoluteIndex + 1}</span>
                </div>

                {unlocked && unlock && (
                  <div className="mt-2 text-[10px] text-emerald-200/80 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <Trophy size={11} />
                    Unlocked
                  </div>
                )}
              </div>
            );
          })}
          </div>

          {bottomSpacerHeight > 0 && <div style={{ height: bottomSpacerHeight }} />}
        </div>
      </div>
    </motion.div>
  );
}
