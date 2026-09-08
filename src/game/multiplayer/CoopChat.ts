export const COOP_CHAT_MAX_LENGTH = 180;
export const COOP_CHAT_HISTORY_LIMIT = 50;

export interface CoopChatMessage {
  id: string;
  playerId: string;
  playerLabel: string;
  playerColor: string;
  text: string;
  sentAt: number;
}

/** Chat is deliberately one line. Control characters are replaced before the
 * host relays a message, and the limit is counted by Unicode code points so an
 * emoji cannot be split in half. */
export function normalizeCoopChatText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return Array.from(normalized).slice(0, COOP_CHAT_MAX_LENGTH).join('');
}

export function parseCoopChatRequest(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  return normalizeCoopChatText((payload as { text?: unknown }).text);
}

export function parseCoopChatMessage(payload: unknown): CoopChatMessage | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload as Partial<CoopChatMessage>;
  const text = normalizeCoopChatText(candidate.text);
  if (!text
    || typeof candidate.id !== 'string' || candidate.id.length < 1 || candidate.id.length > 128
    || typeof candidate.playerId !== 'string' || candidate.playerId.length < 1 || candidate.playerId.length > 128
    || typeof candidate.playerLabel !== 'string' || candidate.playerLabel.length < 1 || candidate.playerLabel.length > 40
    || typeof candidate.playerColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.playerColor)
    || !Number.isSafeInteger(candidate.sentAt) || (candidate.sentAt || 0) < 0) return null;
  return {
    id: candidate.id,
    playerId: candidate.playerId,
    playerLabel: candidate.playerLabel,
    playerColor: candidate.playerColor,
    text,
    sentAt: candidate.sentAt,
  } as CoopChatMessage;
}

export function appendCoopChatMessage(history: readonly CoopChatMessage[], message: CoopChatMessage): CoopChatMessage[] {
  if (history.some(candidate => candidate.id === message.id)) return [...history];
  return [...history, message].slice(-COOP_CHAT_HISTORY_LIMIT);
}
