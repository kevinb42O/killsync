export const COOP_SKIN_STORAGE_KEY = 'killsync.multiplayer.skin';

export const COOP_SKIN_IDS = [
  'neon_vanguard',
  'crimson_strike',
  'void_runner',
  'solar_guard',
  'black_ice',
  'royal_inferno',
] as const;

export type CoopSkinId = typeof COOP_SKIN_IDS[number];
export type CoopSkinTier = 'standard' | 'premium';

export interface CoopSkinPalette {
  undersuit: string;
  armor: string;
  trim: string;
  glow: string;
  visor: string;
  webbing: string;
  thrusterOuter: string;
  thrusterCore: string;
}

export interface CoopSkinDefinition {
  id: CoopSkinId;
  tier: CoopSkinTier;
  name: string;
  description: string;
  /** Full operator artwork used by the shared solo and co-op class selector. */
  portraitSrc: string;
  palette: CoopSkinPalette;
  material: {
    metalness: number;
    roughness: number;
    emissiveIntensity: number;
    animatedEmissive: boolean;
  };
}

export const DEFAULT_COOP_SKIN_ID: CoopSkinId = 'neon_vanguard';

export const COOP_SKINS: readonly CoopSkinDefinition[] = [
  {
    id: 'neon_vanguard', tier: 'standard', name: 'Neon Vanguard', description: 'Midnight armor with clean cyan combat telemetry.',
    portraitSrc: '/phantom.png',
    palette: { undersuit: '#0f172a', armor: '#22d3ee', trim: '#94a3b8', glow: '#67e8f9', visor: '#083344', webbing: '#090d16', thrusterOuter: '#ff3b00', thrusterCore: '#fff066' },
    material: { metalness: .52, roughness: .32, emissiveIntensity: .18, animatedEmissive: false },
  },
  {
    id: 'crimson_strike', tier: 'standard', name: 'Crimson Strike', description: 'Gunmetal plating cut with aggressive scarlet signals.',
    portraitSrc: '/reaper.png',
    palette: { undersuit: '#1c1117', armor: '#ef4444', trim: '#a8a29e', glow: '#fb7185', visor: '#450a0a', webbing: '#12090c', thrusterOuter: '#ff5a1f', thrusterCore: '#fde68a' },
    material: { metalness: .55, roughness: .34, emissiveIntensity: .2, animatedEmissive: false },
  },
  {
    id: 'void_runner', tier: 'standard', name: 'Void Runner', description: 'Deep-space black with violet phase-light accents.',
    portraitSrc: '/wraith.png',
    palette: { undersuit: '#151225', armor: '#a855f7', trim: '#7c3aed', glow: '#e879f9', visor: '#2e1065', webbing: '#0d0917', thrusterOuter: '#c026d3', thrusterCore: '#f5d0fe' },
    material: { metalness: .5, roughness: .3, emissiveIntensity: .22, animatedEmissive: false },
  },
  {
    id: 'solar_guard', tier: 'standard', name: 'Solar Guard', description: 'Charcoal armor carrying a bright amber command stripe.',
    portraitSrc: '/nexus.png',
    palette: { undersuit: '#1c1913', armor: '#f59e0b', trim: '#d6d3d1', glow: '#fbbf24', visor: '#451a03', webbing: '#171108', thrusterOuter: '#f97316', thrusterCore: '#fef3c7' },
    material: { metalness: .58, roughness: .36, emissiveIntensity: .18, animatedEmissive: false },
  },
  {
    id: 'black_ice', tier: 'premium', name: 'Black Ice', description: 'Obsidian chrome threaded with glacial reactor light.',
    portraitSrc: '/spectre.png',
    palette: { undersuit: '#030712', armor: '#172554', trim: '#bae6fd', glow: '#7dd3fc', visor: '#082f49', webbing: '#020617', thrusterOuter: '#38bdf8', thrusterCore: '#f0f9ff' },
    material: { metalness: .9, roughness: .11, emissiveIntensity: .55, animatedEmissive: true },
  },
  {
    id: 'royal_inferno', tier: 'premium', name: 'Royal Inferno', description: 'Black-gold ceremonial plate over a molten energy core.',
    portraitSrc: '/titan.png',
    palette: { undersuit: '#0c0807', armor: '#7c2d12', trim: '#facc15', glow: '#fb923c', visor: '#450a0a', webbing: '#160c06', thrusterOuter: '#dc2626', thrusterCore: '#fff7cc' },
    material: { metalness: .86, roughness: .14, emissiveIntensity: .62, animatedEmissive: true },
  },
] as const;

const COOP_SKIN_BY_ID = new Map<CoopSkinId, CoopSkinDefinition>(COOP_SKINS.map(skin => [skin.id, skin]));

export function normalizeCoopSkinId(value: unknown): CoopSkinId {
  return typeof value === 'string' && COOP_SKIN_BY_ID.has(value as CoopSkinId)
    ? value as CoopSkinId
    : DEFAULT_COOP_SKIN_ID;
}

export function getCoopSkin(value: unknown): CoopSkinDefinition {
  return COOP_SKIN_BY_ID.get(normalizeCoopSkinId(value))!;
}

export function readCoopSkinId(): CoopSkinId {
  try { return normalizeCoopSkinId(localStorage.getItem(COOP_SKIN_STORAGE_KEY)); }
  catch { return DEFAULT_COOP_SKIN_ID; }
}

export function writeCoopSkinId(value: unknown): CoopSkinId {
  const skinId = normalizeCoopSkinId(value);
  try { localStorage.setItem(COOP_SKIN_STORAGE_KEY, skinId); } catch { /* Storage fallback */ }
  return skinId;
}
