import { ENEMY_TYPES } from '../combat/enemyDomain';
import type { CoopSnapshot } from './CoopSimulation';
import type { WorldId } from '../world/WorldDefinitions';

export type CoopAdminCommand = {
  name: 'help' | 'players' | 'status' | 'announce' | 'pause' | 'resume' | 'restart' | 'kick' | 'heal' | 'revive' | 'redeploy' | 'give' | 'teleport' | 'world' | 'spawn' | 'killall';
  args: string[];
};

export interface CoopAdminCommandResult {
  ok: boolean;
  message: string;
  modified?: boolean;
}

export const COOP_ADMIN_HELP = [
  'help · players · status',
  'announce <message> · pause · resume · restart',
  'kick <target> [reason]',
  'heal <target> [amount|full] · revive <target> · redeploy <target>',
  'give <target> <credits|cores|ammo|fabricator|selfrevive> <amount|full>',
  'teleport <target> <me|center|target>',
  'world <1|2|3|4|world-id> · teleport world <1|2|3|4>',
  `spawn <${Object.keys(ENEMY_TYPES).join('|')}> [count] [target] · killall`,
  'Targets: me, all, alive, downed, @callsign, or #player-id',
];

const COMMANDS = new Set(COOP_ADMIN_HELP.flatMap(() => []) as string[]);
for (const name of ['help', 'players', 'status', 'announce', 'pause', 'resume', 'restart', 'kick', 'heal', 'revive', 'redeploy', 'give', 'teleport', 'world', 'spawn', 'killall']) COMMANDS.add(name);

export function tokenizeCoopAdminCommand(value: string): string[] | null {
  const tokens: string[] = [];
  let token = '', quote = '';
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (quote) {
      if (character === quote) quote = '';
      else if (character === '\\' && index + 1 < value.length) token += value[++index];
      else token += character;
    } else if (character === '"' || character === "'") quote = character;
    else if (/\s/.test(character)) {
      if (token) { tokens.push(token); token = ''; }
    } else token += character;
  }
  if (quote) return null;
  if (token) tokens.push(token);
  return tokens;
}

export function parseCoopAdminCommand(value: string): CoopAdminCommand | CoopAdminCommandResult {
  const tokens = tokenizeCoopAdminCommand(value.trim().replace(/^\//, ''));
  if (!tokens) return { ok: false, message: 'Unclosed quote in command.' };
  const [rawName = '', ...args] = tokens;
  const alias = rawName.toLowerCase();
  const name = alias === 'tp' ? 'teleport' : alias === 'warp' ? 'world' : alias;
  if (!COMMANDS.has(name)) return { ok: false, message: `Unknown command “${rawName}”. Type help for the command list.` };
  return { name: name as CoopAdminCommand['name'], args };
}

export function resolveCoopAdminTargets(snapshot: CoopSnapshot, selector: string | undefined, actorPlayerId: string) {
  const normalized = (selector || 'me').trim();
  if (normalized === 'me' || normalized === '@me') return snapshot.players.filter(player => player.id === actorPlayerId);
  if (normalized === 'all' || normalized === '@all') return [...snapshot.players];
  if (normalized === 'alive' || normalized === '@alive') return snapshot.players.filter(player => player.lifeState === 'alive');
  if (normalized === 'downed' || normalized === '@downed') return snapshot.players.filter(player => player.lifeState === 'downed');
  if (normalized.startsWith('#')) return snapshot.players.filter(player => player.id === normalized.slice(1));
  const query = normalized.replace(/^@/, '').toLocaleLowerCase();
  const exact = snapshot.players.filter(player => player.label.toLocaleLowerCase() === query);
  return exact.length ? exact : snapshot.players.filter(player => player.label.toLocaleLowerCase().startsWith(query));
}

export const isCoopEnemyType = (value: string): value is keyof typeof ENEMY_TYPES => value in ENEMY_TYPES;

const ADMIN_WORLD_ALIASES: Readonly<Record<string, WorldId>> = Object.freeze({
  '1': 'neon_bastion', w1: 'neon_bastion', world1: 'neon_bastion', neon: 'neon_bastion', neon_bastion: 'neon_bastion',
  '2': 'cinderworks', w2: 'cinderworks', world2: 'cinderworks', cinder: 'cinderworks', cinderworks: 'cinderworks',
  '3': 'white_silence', w3: 'white_silence', world3: 'white_silence', white: 'white_silence', white_silence: 'white_silence',
  '4': 'null_garden', w4: 'null_garden', world4: 'null_garden', null: 'null_garden', null_garden: 'null_garden',
});

export function resolveCoopAdminWorld(value: string | undefined): WorldId | undefined {
  return value ? ADMIN_WORLD_ALIASES[value.trim().toLowerCase().replace(/[ -]+/g, '_')] : undefined;
}
