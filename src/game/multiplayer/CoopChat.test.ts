import { describe, expect, it } from 'vitest';
import { appendCoopChatMessage, COOP_CHAT_HISTORY_LIMIT, COOP_CHAT_MAX_LENGTH, normalizeCoopChatText, parseCoopChatMessage, parseCoopChatRequest, type CoopChatMessage } from './CoopChat';

describe('co-op chat payloads', () => {
  it('normalizes chat into one bounded line without splitting emoji', () => {
    expect(normalizeCoopChatText('  regroup\n  at\tstation  ')).toBe('regroup at station');
    expect(normalizeCoopChatText('🔥'.repeat(COOP_CHAT_MAX_LENGTH + 5))).toBe('🔥'.repeat(COOP_CHAT_MAX_LENGTH));
    expect(normalizeCoopChatText(' \n\t ')).toBeNull();
  });

  it('accepts only a text field from an untrusted chat request', () => {
    expect(parseCoopChatRequest({ text: 'hello', playerLabel: 'FORGED' })).toBe('hello');
    expect(parseCoopChatRequest({ text: 42 })).toBeNull();
  });

  it('rejects malformed relayed messages', () => {
    expect(parseCoopChatMessage({ id: '1', playerId: 'p1', playerLabel: 'VIPER', playerColor: 'red', text: 'hi', sentAt: 1 })).toBeNull();
    expect(parseCoopChatMessage({ id: '1', playerId: 'p1', playerLabel: 'VIPER', playerColor: '#67e8f9', text: 'hi', sentAt: 1 })).toMatchObject({ text: 'hi' });
  });

  it('deduplicates messages and bounds retained history', () => {
    const message = (index: number): CoopChatMessage => ({ id: String(index), playerId: 'p1', playerLabel: 'VIPER', playerColor: '#67e8f9', text: String(index), sentAt: index });
    let history: CoopChatMessage[] = [];
    for (let index = 0; index <= COOP_CHAT_HISTORY_LIMIT; index++) history = appendCoopChatMessage(history, message(index));
    history = appendCoopChatMessage(history, message(COOP_CHAT_HISTORY_LIMIT));
    expect(history).toHaveLength(COOP_CHAT_HISTORY_LIMIT);
    expect(history[0].id).toBe('1');
  });
});
