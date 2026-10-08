import type { FrontierTool } from './FriendsFrontier';
import type { InteractionTarget } from './FriendsInteractionTargeting';

export type ToolKind = 'wood' | 'soil' | 'stone' | 'ore';
export type ToolAction = { actor: string; serial: number; tool: FrontierTool; fill?: boolean; targetId: string; start: number; contact: number; end: number };
export type ToolDamage = { id: string; value: number; total: number; until: number; by: string; kind: ToolKind;
  x: number; y: number; z: number; nx: number; ny: number; nz: number; vx?: number; vy?: number; vz?: number; material?: number;
  pieceId?: number; pieceRevision?: number; tree?: { x: number; y: number; z: number; scale: number; kind: string } };
export type ToolContact = ToolDamage & { serial: number; at: number; broken: boolean; resource?: string; amount?: number };
export type ToolFeedback = { actions: Record<string, ToolAction>; damage: ToolDamage[]; contacts: ToolContact[] };
export const EMPTY_TOOL_FEEDBACK = (): ToolFeedback => ({ actions: {}, damage: [], contacts: [] });

export function toolProfile(kind: ToolKind, tool: FrontierTool, upgraded: boolean) {
  const speed = upgraded ? .72 : 1;
  const cadence = kind === 'soil' ? (tool === 3 ? 380 : 480) : kind === 'stone' ? 250 : 280;
  return { cadence: Math.round(cadence * speed), windup: Math.round((kind === 'soil' ? 330 : 180) * speed),
    hits: kind === 'soil' ? 1 : kind === 'stone' ? 4 : kind === 'ore' ? 5 : 6 };
}

/** Held-input scheduling has one contact per cycle; pauses never catch up hits. */
export class FriendsToolActions {
  private serial = 0;
  private actions = new Map<string, ToolAction & { contacted: boolean }>();
  update(actor: string, tool: FrontierTool, target: InteractionTarget | undefined, held: boolean, now: number, upgraded: boolean, fill = false): boolean {
    fill = tool === 3 && fill;
    if (!held || !tool || tool === 5) { this.actions.delete(actor); return false; }
    let action = this.actions.get(actor);
    const targetId = target?.id || 'miss';
    if (!action || action.tool !== tool || Boolean(action.fill) !== fill || action.targetId !== targetId || now >= action.end) {
      const p = toolProfile(fill ? 'soil' : target?.kind === 'build' ? 'stone' : target?.kind || 'stone', tool, upgraded);
      action = { actor, serial: ++this.serial, tool, fill: fill || undefined, targetId, start: now, contact: now + p.windup, end: now + p.cadence, contacted: false };
      this.actions.set(actor, action);
    }
    if (action.contacted || now < action.contact) return false;
    action.contacted = true;
    return Boolean(target?.valid);
  }
  snapshot(): Record<string, ToolAction> {
    return Object.fromEntries([...this.actions].map(([id, { contacted: _, ...action }]) => [id, action]));
  }
  clearInactive(ids: ReadonlySet<string>) { for (const id of this.actions.keys()) if (!ids.has(id)) this.actions.delete(id); }
}
