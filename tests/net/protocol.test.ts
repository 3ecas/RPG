import { describe, expect, it } from 'vitest';
import { decodeClientMessage, decodeServerMessage, LIMITS, normalizeName, parseClientMessage, PROTOCOL_VERSION, sanitizeChat } from '@/net/protocol';

describe('protocol: names and chat', () => {
  it('normalizes names and refuses the unusable', () => {
    expect(normalizeName('  Ada   Lovelace ')).toBe('Ada Lovelace');
    expect(normalizeName('bob')).toBe('bob');
    expect(normalizeName('ab')).toBeNull(); // too short
    expect(normalizeName('a'.repeat(LIMITS.NAME_MAX + 1))).toBeNull();
    expect(normalizeName('9lives')).toBeNull(); // must start with a letter
    expect(normalizeName('<script>')).toBeNull();
    expect(normalizeName('Ada\nLovelace')).toBe('Ada Lovelace'); // whitespace collapses to one space
    expect(normalizeName('')).toBeNull();
  });

  it('strips control characters from chat and cuts it to the limit', () => {
    expect(sanitizeChat(`  hello\u0000 there${String.fromCharCode(0x200b)}  friend `)).toBe('hello there friend');
    expect(sanitizeChat('\u0007\u001f')).toBeNull();
    expect(sanitizeChat('x'.repeat(200))).toHaveLength(LIMITS.CHAT_MAX);
    expect(sanitizeChat('<b>bold</b>')).toBe('<b>bold</b>'); // escaping is the renderer's job
  });
});

describe('protocol: parsing what clients send', () => {
  it('accepts every message exactly on the schema', () => {
    expect(parseClientMessage({ t: 'hello', v: PROTOCOL_VERSION, name: ' Ada ', token: null })).toEqual({ t: 'hello', v: PROTOCOL_VERSION, name: 'Ada', token: null });
    expect(parseClientMessage({ t: 'hello', v: 1, name: 'Ada', token: 'abc' })).toEqual({ t: 'hello', v: 1, name: 'Ada', token: 'abc' });
    expect(parseClientMessage({ t: 'hello', v: 1, name: 'Ada' })).toEqual({ t: 'hello', v: 1, name: 'Ada', token: null });
    expect(parseClientMessage({ t: 'move', x: 3, y: 4 })).toEqual({ t: 'move', x: 3, y: 4 });
    expect(parseClientMessage({ t: 'run', on: true })).toEqual({ t: 'run', on: true });
    expect(parseClientMessage({ t: 'chat', text: ' hi  all ' })).toEqual({ t: 'chat', text: 'hi all' });
    expect(parseClientMessage({ t: 'ping', at: 12.5 })).toEqual({ t: 'ping', at: 12.5 });
  });

  it('rejects everything else', () => {
    expect(parseClientMessage(null)).toBeNull();
    expect(parseClientMessage('move')).toBeNull();
    expect(parseClientMessage([])).toBeNull();
    expect(parseClientMessage({})).toBeNull();
    expect(parseClientMessage({ t: 'teleport', x: 1, y: 1 })).toBeNull();
    expect(parseClientMessage({ t: 'move', x: 1.5, y: 1 })).toBeNull();
    expect(parseClientMessage({ t: 'move', x: -1, y: 1 })).toBeNull();
    expect(parseClientMessage({ t: 'move', x: LIMITS.COORD_MAX + 1, y: 1 })).toBeNull();
    expect(parseClientMessage({ t: 'move', x: '1', y: 1 })).toBeNull();
    expect(parseClientMessage({ t: 'run', on: 'yes' })).toBeNull();
    expect(parseClientMessage({ t: 'chat', text: '' })).toBeNull();
    expect(parseClientMessage({ t: 'chat', text: 42 })).toBeNull();
    expect(parseClientMessage({ t: 'chat', text: 'x'.repeat(LIMITS.CHAT_MAX * 4 + 1) })).toBeNull();
    expect(parseClientMessage({ t: 'hello', v: 1, name: 'x' })).toBeNull();
    expect(parseClientMessage({ t: 'hello', v: '1', name: 'Ada' })).toBeNull();
    expect(parseClientMessage({ t: 'hello', v: 1, name: 'Ada', token: 7 })).toBeNull();
    expect(parseClientMessage({ t: 'hello', v: 1, name: 'Ada', token: 'x'.repeat(LIMITS.TOKEN_MAX + 1) })).toBeNull();
    expect(parseClientMessage({ t: 'ping', at: Infinity })).toBeNull();
  });

  it('decodes JSON text with a size cap', () => {
    expect(decodeClientMessage('{"t":"move","x":1,"y":2}')).toEqual({ t: 'move', x: 1, y: 2 });
    expect(decodeClientMessage('{"t":"move",')).toBeNull();
    expect(decodeClientMessage('not json')).toBeNull();
    expect(decodeClientMessage(`{"t":"chat","text":"${'x'.repeat(LIMITS.MESSAGE_CHARS)}"}`)).toBeNull();
  });

  it('recognizes server messages by type only', () => {
    expect(decodeServerMessage('{"t":"pong","at":1}')).toEqual({ t: 'pong', at: 1 });
    expect(decodeServerMessage('{"t":"nope"}')).toBeNull();
    expect(decodeServerMessage('[]')).toBeNull();
    expect(decodeServerMessage('{')).toBeNull();
  });
});
