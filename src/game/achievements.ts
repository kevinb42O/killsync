export interface AchievementDefinition {
	id: string;
	title: string;
	description: string;
	chapter: string;
	category: 'wave' | 'level' | 'kills' | 'economy' | 'loadout' | 'survival' | 'combo';
	rewardCoins: number;
	rewardXP: number;
	type:
		| 'reach_wave'
		| 'reach_level'
		| 'kill_total'
		| 'coins_collected_total'
		| 'coins_banked_total'
		| 'weapon_count'
		| 'weapon_total_levels'
		| 'upgrade_count'
		| 'survive_time_seconds'
		| 'combo'
		| 'kills_in_wave'
		| 'levels_in_wave';
	target: number;
}

export interface AchievementUnlock {
	achievementId: string;
	unlockedAt: number;
}

export interface AchievementRuntimeSnapshot {
	currentWave: number;
	playerLevel: number;
	killCount: number;
	totalCoinsCollected: number;
	runCoinsBanked: number;
	weaponCount: number;
	weaponTotalLevels: number;
	upgradeCount: number;
	gameTimeMs: number;
	comboCount: number;
	currentWaveKillCount: number;
	currentWaveLevelUps: number;
}

export interface AchievementUnlockResult {
	definition: AchievementDefinition;
	unlock: AchievementUnlock;
}

export interface AchievementProgress {
	current: number;
	target: number;
	ratio: number;
	remaining: number;
}

const ORDERED_CATEGORIES: AchievementDefinition['category'][] = [
	'wave',
	'level',
	'kills',
	'economy',
	'loadout',
	'survival',
	'combo'
];

const CATEGORY_BASE_REWARD: Record<AchievementDefinition['category'], { coins: number; xp: number }> = {
	wave: { coins: 30, xp: 25 },
	level: { coins: 35, xp: 30 },
	kills: { coins: 35, xp: 35 },
	economy: { coins: 45, xp: 35 },
	loadout: { coins: 40, xp: 35 },
	survival: { coins: 30, xp: 40 },
	combo: { coins: 40, xp: 40 }
};

function rewardFor(category: AchievementDefinition['category'], index: number) {
	const base = CATEGORY_BASE_REWARD[category];
	const tier = Math.floor(index / 4);
	return {
		coins: base.coins + tier * 18,
		xp: base.xp + tier * 15
	};
}

function sanitizeId(input: string) {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
}

function buildDefinition(
	keyPrefix: string,
	category: AchievementDefinition['category'],
	type: AchievementDefinition['type'],
	target: number,
	chapter: string,
	title: string,
	description: string,
	index: number
): AchievementDefinition {
	const rewards = rewardFor(category, index);
	return {
		id: `${sanitizeId(keyPrefix)}_${sanitizeId(String(target))}`,
		title,
		description,
		chapter,
		category,
		type,
		target,
		rewardCoins: rewards.coins,
		rewardXP: rewards.xp
	};
}

function defineThresholdSeries(options: {
	keyPrefix: string;
	category: AchievementDefinition['category'];
	type: AchievementDefinition['type'];
	thresholds: number[];
	chapter: (target: number, index: number) => string;
	title: (target: number, index: number) => string;
	description: (target: number, index: number) => string;
}): AchievementDefinition[] {
	return options.thresholds.map((target, index) =>
		buildDefinition(
			options.keyPrefix,
			options.category,
			options.type,
			target,
			options.chapter(target, index),
			options.title(target, index),
			options.description(target, index),
			index
		)
	);
}

function generateMilestones(options: {
	count: number;
	start: number;
	baseStep: number;
	stepGrowthEvery: number;
	stepGrowth: number;
	roundTo?: number;
	maxStep?: number;
}): number[] {
	const milestones: number[] = [];
	let current = options.start;
	let step = options.baseStep;
	const roundTo = Math.max(1, options.roundTo ?? 1);

	for (let index = 0; index < options.count; index += 1) {
		const rounded = Math.round(current / roundTo) * roundTo;
		const nextTarget = milestones.length === 0 ? rounded : Math.max(rounded, milestones[milestones.length - 1] + roundTo);
		milestones.push(nextTarget);

		if ((index + 1) % options.stepGrowthEvery === 0) {
			step += options.stepGrowth;
			if (typeof options.maxStep === 'number') {
				step = Math.min(step, options.maxStep);
			}
		}

		current += step;
	}

	return milestones;
}

function codename(index: number, first: string[], second: string[]) {
	const firstWord = first[index % first.length];
	const secondWord = second[(index * 7 + 3) % second.length];
	const serial = String(index + 1).padStart(3, '0');
	return `${firstWord} ${secondWord} ${serial}`;
}

function chapterForIndex(index: number, chapters: string[], chapterSize: number) {
	const chapterIndex = Math.min(chapters.length - 1, Math.floor(index / Math.max(1, chapterSize)));
	return chapters[chapterIndex];
}

const WAVE_WORDS_A = ['Neon', 'Ivory', 'Obsidian', 'Crimson', 'Solar', 'Iron', 'Ghost', 'Static', 'Atlas', 'Storm', 'Rogue', 'Nova'];
const WAVE_WORDS_B = ['Front', 'Rift', 'Breaker', 'Pulse', 'March', 'Vanguard', 'Lattice', 'Spire', 'Surge', 'Signal', 'Protocol', 'Gauntlet'];

const LEVEL_WORDS_A = ['Cipher', 'Vector', 'Echo', 'Prism', 'Axiom', 'Zenith', 'Helix', 'Orbit', 'Monolith', 'Delta', 'Chrono', 'Quanta'];
const LEVEL_WORDS_B = ['Ascendant', 'Index', 'Step', 'Spiral', 'Climb', 'Drive', 'Thread', 'Ladder', 'Edition', 'Track', 'Mode', 'Transit'];

const KILL_WORDS_A = ['Warden', 'Reaper', 'Razor', 'Raptor', 'Shard', 'Fang', 'Viper', 'Ruin', 'Grim', 'Cinder', 'Blitz', 'Onyx'];
const KILL_WORDS_B = ['Ledger', 'Doctrine', 'Quota', 'Sweep', 'Harvest', 'Hex', 'Arc', 'Cycle', 'March', 'Draft', 'Relay', 'Strike'];

const COIN_WORDS_A = ['Mint', 'Vault', 'Credit', 'Broker', 'Circuit', 'Market', 'Syndicate', 'Teller', 'Dividend', 'Neon', 'Merit', 'Parcel'];
const COIN_WORDS_B = ['Runner', 'Signal', 'Flux', 'Route', 'Cascade', 'Stack', 'Tide', 'Reserve', 'Channel', 'Frame', 'Engine', 'Protocol'];

const LOADOUT_WORDS_A = ['Arsenal', 'Forge', 'Kernel', 'Socket', 'Matrix', 'Cannon', 'Relay', 'Foundry', 'Loadstar', 'Bastion', 'Frame', 'Array'];
const LOADOUT_WORDS_B = ['Mesh', 'Bloom', 'Patch', 'Spine', 'Pulse', 'Thread', 'Wing', 'Draft', 'Mode', 'Balance', 'Drive', 'Grid'];

const SURVIVAL_WORDS_A = ['Night', 'Dawn', 'Aegis', 'Bunker', 'Ember', 'Citadel', 'Halo', 'Signal', 'Anchor', 'Breach', 'Nomad', 'Sentry'];
const SURVIVAL_WORDS_B = ['Watch', 'Shift', 'Hold', 'Season', 'Window', 'Clock', 'Rain', 'Vigil', 'Stance', 'Shelter', 'Orbit', 'Mile'];

const COMBO_WORDS_A = ['Chain', 'Tempo', 'Shock', 'Rhythm', 'Burst', 'Rally', 'Phase', 'Cadence', 'Volley', 'Spark', 'Sync', 'Fury'];
const COMBO_WORDS_B = ['Weave', 'Mirror', 'Route', 'Kick', 'Whiplash', 'Current', 'Mode', 'Pattern', 'Lance', 'Bridge', 'Shift', 'Signal'];

const WAVE_CHAPTERS = ['Street Sparks', 'Iron Tides', 'Rift Patrol', 'Steel Horizon', 'Ghost Sirens', 'Ash Tempest', 'Signal Fortress', 'Midnight Circuit', 'Nova Bastion', 'Final Breach'];
const LEVEL_CHAPTERS = ['First Steps', 'Threadlift', 'Spiral Core', 'Axiom Drift', 'Zenith Pulse', 'Prism Engine', 'Orbit Crown', 'Monolith Ascent', 'Quanta Crown', 'Beyond Grade'];
const KILL_CHAPTERS = ['Blood Ledger', 'Razor Routine', 'Warden Gospel', 'Onyx Draft', 'No Mercy Grid', 'Scorched Doctrine', 'Grim Parade', 'Cinder Requiem', 'Titan Clearance', 'Last Census'];
const ECONOMY_CHAPTERS = ['Pocket Change', 'Neon Market', 'Broker Spiral', 'Vault Weather', 'Credit Overdrive', 'Syndicate Orbit', 'Dividend Current', 'Reserve Eclipse', 'Atlas Treasury', 'Infinite Mint'];
const LOADOUT_CHAPTERS = ['Starter Rack', 'Forge Mesh', 'Socket Bloom', 'Kernel Run', 'Arsenal Pulse', 'Foundry Arc', 'Frame Doctrine', 'Loadstar Lattice', 'Bastion Prime', 'Omega Armory'];
const SURVIVAL_CHAPTERS = ['First Night', 'Long Watch', 'Cold Shift', 'Ember Hold', 'Citadel Hours', 'Breach Window', 'Anchor Storm', 'Nomad Clock', 'Sentry Season', 'Endless Vigil'];
const COMBO_CHAPTERS = ['Pulse One', 'Cadence Lock', 'Tempo Storm', 'Phase Mirror', 'Rally Arc', 'Volley Wire', 'Spark Torrent', 'Fury Router', 'Chain Zenith', 'Rhythm Eclipse'];

const WAVE_ACHIEVEMENTS = defineThresholdSeries({
	keyPrefix: 'wave_reached',
	category: 'wave',
	type: 'reach_wave',
	thresholds: generateMilestones({
		count: 280,
		start: 2,
		baseStep: 1,
		stepGrowthEvery: 8,
		stepGrowth: 1,
		maxStep: 26
	}),
	chapter: (_, index) => chapterForIndex(index, WAVE_CHAPTERS, 28),
	title: (target, index) => `Wave ${target}: ${codename(index, WAVE_WORDS_A, WAVE_WORDS_B)}`,
	description: (target) => `Reach wave ${target} in a single run.`
});

const LEVEL_ACHIEVEMENTS = defineThresholdSeries({
	keyPrefix: 'level_reached',
	category: 'level',
	type: 'reach_level',
	thresholds: generateMilestones({
		count: 280,
		start: 3,
		baseStep: 1,
		stepGrowthEvery: 7,
		stepGrowth: 1,
		maxStep: 22
	}),
	chapter: (_, index) => chapterForIndex(index, LEVEL_CHAPTERS, 28),
	title: (target, index) => `Level ${target}: ${codename(index, LEVEL_WORDS_A, LEVEL_WORDS_B)}`,
	description: (target) => `Reach player level ${target} in one run.`
});

const KILL_ACHIEVEMENTS = defineThresholdSeries({
	keyPrefix: 'kills_total',
	category: 'kills',
	type: 'kill_total',
	thresholds: generateMilestones({
		count: 300,
		start: 25,
		baseStep: 25,
		stepGrowthEvery: 6,
		stepGrowth: 15,
		roundTo: 5,
		maxStep: 420
	}),
	chapter: (_, index) => chapterForIndex(index, KILL_CHAPTERS, 30),
	title: (target, index) => `Kill ${target}: ${codename(index, KILL_WORDS_A, KILL_WORDS_B)}`,
	description: (target) => `Defeat ${target} enemies in a single run.`
});

const COINS_COLLECTED_ACHIEVEMENTS = defineThresholdSeries({
	keyPrefix: 'coins_collected',
	category: 'economy',
	type: 'coins_collected_total',
	thresholds: generateMilestones({
		count: 280,
		start: 150,
		baseStep: 120,
		stepGrowthEvery: 6,
		stepGrowth: 60,
		roundTo: 10,
		maxStep: 960
	}),
	chapter: (_, index) => chapterForIndex(index, ECONOMY_CHAPTERS, 28),
	title: (target, index) => `Collected ${target}: ${codename(index, COIN_WORDS_A, COIN_WORDS_B)}`,
	description: (target) => `Collect ${target} coins in one run before extraction or death.`
});

const COINS_BANKED_ACHIEVEMENTS = defineThresholdSeries({
	keyPrefix: 'coins_banked',
	category: 'economy',
	type: 'coins_banked_total',
	thresholds: generateMilestones({
		count: 280,
		start: 100,
		baseStep: 90,
		stepGrowthEvery: 6,
		stepGrowth: 50,
		roundTo: 10,
		maxStep: 820
	}),
	chapter: (_, index) => chapterForIndex(index, ECONOMY_CHAPTERS, 28),
	title: (target, index) => `Banked ${target}: ${codename(index, COIN_WORDS_B, COIN_WORDS_A)}`,
	description: (target) => `Hold ${target} run coins at once.`
});

const WEAPON_COUNT_ACHIEVEMENTS = defineThresholdSeries({
	keyPrefix: 'weapon_count',
	category: 'loadout',
	type: 'weapon_count',
	thresholds: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
	chapter: (_, index) => chapterForIndex(index, LOADOUT_CHAPTERS, 2),
	title: (target, index) => `Arsenal ${target}: ${codename(index, LOADOUT_WORDS_A, LOADOUT_WORDS_B)}`,
	description: (target) => `Own ${target} weapons at the same time.`
});

const WEAPON_LEVEL_ACHIEVEMENTS = defineThresholdSeries({
	keyPrefix: 'weapon_levels_sum',
	category: 'loadout',
	type: 'weapon_total_levels',
	thresholds: generateMilestones({
		count: 260,
		start: 6,
		baseStep: 2,
		stepGrowthEvery: 7,
		stepGrowth: 1,
		maxStep: 28
	}),
	chapter: (_, index) => chapterForIndex(index, LOADOUT_CHAPTERS, 26),
	title: (target, index) => `Armory ${target}: ${codename(index, LOADOUT_WORDS_B, LOADOUT_WORDS_A)}`,
	description: (target) => `Reach a combined weapon level total of ${target}.`
});

const UPGRADE_ACHIEVEMENTS = defineThresholdSeries({
	keyPrefix: 'upgrade_count',
	category: 'loadout',
	type: 'upgrade_count',
	thresholds: generateMilestones({
		count: 260,
		start: 2,
		baseStep: 1,
		stepGrowthEvery: 8,
		stepGrowth: 1,
		maxStep: 20
	}),
	chapter: (_, index) => chapterForIndex(index, LOADOUT_CHAPTERS, 26),
	title: (target, index) => `Upgrades ${target}: ${codename(index, LOADOUT_WORDS_A, LEVEL_WORDS_B)}`,
	description: (target) => `Gain ${target} non-weapon upgrades in one run.`
});

const SURVIVAL_ACHIEVEMENTS = defineThresholdSeries({
	keyPrefix: 'survive_seconds',
	category: 'survival',
	type: 'survive_time_seconds',
	thresholds: generateMilestones({
		count: 280,
		start: 60,
		baseStep: 30,
		stepGrowthEvery: 5,
		stepGrowth: 10,
		roundTo: 10,
		maxStep: 320
	}),
	chapter: (_, index) => chapterForIndex(index, SURVIVAL_CHAPTERS, 28),
	title: (target, index) => {
		const minutes = Math.floor(target / 60);
		const seconds = String(target % 60).padStart(2, '0');
		return `${minutes}:${seconds} Holdout: ${codename(index, SURVIVAL_WORDS_A, SURVIVAL_WORDS_B)}`;
	},
	description: (target) => `Survive for ${Math.floor(target / 60)}m ${target % 60}s in a single run.`
});

const COMBO_ACHIEVEMENTS = defineThresholdSeries({
	keyPrefix: 'combo_peak',
	category: 'combo',
	type: 'combo',
	thresholds: generateMilestones({
		count: 220,
		start: 8,
		baseStep: 2,
		stepGrowthEvery: 6,
		stepGrowth: 2,
		maxStep: 34
	}),
	chapter: (_, index) => chapterForIndex(index, COMBO_CHAPTERS, 22),
	title: (target, index) => `Combo ${target}: ${codename(index, COMBO_WORDS_A, COMBO_WORDS_B)}`,
	description: (target) => `Reach a combo count of ${target}.`
});

const KILLS_IN_WAVE_ACHIEVEMENTS = defineThresholdSeries({
	keyPrefix: 'kills_same_wave',
	category: 'wave',
	type: 'kills_in_wave',
	thresholds: generateMilestones({
		count: 260,
		start: 10,
		baseStep: 5,
		stepGrowthEvery: 6,
		stepGrowth: 5,
		maxStep: 180
	}),
	chapter: (_, index) => chapterForIndex(index, WAVE_CHAPTERS, 26),
	title: (target, index) => `Wave Kills ${target}: ${codename(index, KILL_WORDS_B, WAVE_WORDS_A)}`,
	description: (target) => `Defeat ${target} enemies during a single wave.`
});

const LEVELS_IN_WAVE_ACHIEVEMENTS = defineThresholdSeries({
	keyPrefix: 'levels_same_wave',
	category: 'wave',
	type: 'levels_in_wave',
	thresholds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
	chapter: (_, index) => chapterForIndex(index, WAVE_CHAPTERS, 2),
	title: (target, index) => `Burst x${target}: ${codename(index, LEVEL_WORDS_B, COMBO_WORDS_A)}`,
	description: (target) =>
		target === 1
			? 'Level up before a wave ends.'
			: `Level up ${target} times before the current wave ends.`
});

export const ACHIEVEMENTS: AchievementDefinition[] = [
	...WAVE_ACHIEVEMENTS,
	...LEVEL_ACHIEVEMENTS,
	...KILL_ACHIEVEMENTS,
	...COINS_COLLECTED_ACHIEVEMENTS,
	...COINS_BANKED_ACHIEVEMENTS,
	...WEAPON_COUNT_ACHIEVEMENTS,
	...WEAPON_LEVEL_ACHIEVEMENTS,
	...UPGRADE_ACHIEVEMENTS,
	...SURVIVAL_ACHIEVEMENTS,
	...COMBO_ACHIEVEMENTS,
	...KILLS_IN_WAVE_ACHIEVEMENTS,
	...LEVELS_IN_WAVE_ACHIEVEMENTS
].sort((a, b) => {
	const categoryDelta = ORDERED_CATEGORIES.indexOf(a.category) - ORDERED_CATEGORIES.indexOf(b.category);
	if (categoryDelta !== 0) return categoryDelta;
	return a.target - b.target;
});

export const ACHIEVEMENTS_BY_ID = new Map(ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]));

export const TOTAL_ACHIEVEMENTS = ACHIEVEMENTS.length;

export function getDefaultUnlocks(): AchievementUnlock[] {
	return [];
}

export function normalizeAchievementUnlocks(raw: unknown): AchievementUnlock[] {
	if (!Array.isArray(raw)) return [];
	const normalized: AchievementUnlock[] = [];
	for (const entry of raw) {
		if (!entry || typeof entry !== 'object') continue;
		const rec = entry as AchievementUnlock;
		if (typeof rec.achievementId !== 'string') continue;
		if (!ACHIEVEMENTS_BY_ID.has(rec.achievementId)) continue;
		normalized.push({
			achievementId: rec.achievementId,
			unlockedAt: typeof rec.unlockedAt === 'number' ? rec.unlockedAt : Date.now()
		});
	}
	return normalized;
}

function currentValueFor(definition: AchievementDefinition, snapshot: AchievementRuntimeSnapshot): number {
	switch (definition.type) {
		case 'reach_wave':
			return snapshot.currentWave;
		case 'reach_level':
			return snapshot.playerLevel;
		case 'kill_total':
			return snapshot.killCount;
		case 'coins_collected_total':
			return snapshot.totalCoinsCollected;
		case 'coins_banked_total':
			return snapshot.runCoinsBanked;
		case 'weapon_count':
			return snapshot.weaponCount;
		case 'weapon_total_levels':
			return snapshot.weaponTotalLevels;
		case 'upgrade_count':
			return snapshot.upgradeCount;
		case 'survive_time_seconds':
			return snapshot.gameTimeMs / 1000;
		case 'combo':
			return snapshot.comboCount;
		case 'kills_in_wave':
			return snapshot.currentWaveKillCount;
		case 'levels_in_wave':
			return snapshot.currentWaveLevelUps;
		default:
			return 0;
	}
}

export function getAchievementProgress(
	definition: AchievementDefinition,
	snapshot: AchievementRuntimeSnapshot
): AchievementProgress {
	const current = Math.max(0, currentValueFor(definition, snapshot));
	const target = Math.max(1, definition.target);
	const ratio = Math.max(0, Math.min(1, current / target));
	return {
		current,
		target,
		ratio,
		remaining: Math.max(0, target - current)
	};
}

export class AchievementTracker {
	private unlockedById: Map<string, AchievementUnlock>;

	constructor(unlocks: AchievementUnlock[]) {
		this.unlockedById = new Map(unlocks.map((unlock) => [unlock.achievementId, unlock]));
	}

	getUnlocks() {
		return Array.from(this.unlockedById.values()).sort((a, b) => a.unlockedAt - b.unlockedAt);
	}

	isUnlocked(achievementId: string) {
		return this.unlockedById.has(achievementId);
	}

	evaluate(snapshot: AchievementRuntimeSnapshot): AchievementUnlockResult[] {
		const unlockedNow: AchievementUnlockResult[] = [];
		for (const definition of ACHIEVEMENTS) {
			if (this.unlockedById.has(definition.id)) continue;
			if (!isDefinitionSatisfied(definition, snapshot)) continue;

			const unlock: AchievementUnlock = {
				achievementId: definition.id,
				unlockedAt: Date.now()
			};
			this.unlockedById.set(definition.id, unlock);
			unlockedNow.push({ definition, unlock });
		}
		return unlockedNow;
	}
}

function isDefinitionSatisfied(definition: AchievementDefinition, snapshot: AchievementRuntimeSnapshot): boolean {
	return currentValueFor(definition, snapshot) >= definition.target;
}
