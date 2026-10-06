export type CoopGameMode = 'survival' | 'friends';
export const normalizeCoopGameMode = (value: unknown): CoopGameMode => value === 'friends' ? 'friends' : 'survival';
