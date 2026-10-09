import { describe, expect, it } from 'vitest';
import { decodeClientMessage, decodeServerMessage, isSecret, LIMITS, normalizeName, parseClientMessage, PROTOCOL_VERSION, sanitizeChat } from '@/net/protocol';

const SECRET = '0123456789abcdef0123456789abcdef';

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
    expect(parseClientMessage({ t: 'hello', v: PROTOCOL_VERSION, name: ' Ada ', secret: SECRET, token: null })).toEqual({ t: 'hello', v: PROTOCOL_VERSION, name: 'Ada', secret: SECRET, token: null });
    expect(parseClientMessage({ t: 'hello', v: 1, name: 'Ada', secret: SECRET, token: 'abc' })).toEqual({ t: 'hello', v: 1, name: 'Ada', secret: SECRET, token: 'abc' });
    expect(parseClientMessage({ t: 'hello', v: 1, name: 'Ada', secret: SECRET })).toEqual({ t: 'hello', v: 1, name: 'Ada', secret: SECRET, token: null });
    expect(parseClientMessage({ t: 'hello', v: 1, name: 'Ada', secret: 'Under_Score-dash0', token: '' })).toEqual({ t: 'hello', v: 1, name: 'Ada', secret: 'Under_Score-dash0', token: null });
    expect(parseClientMessage({ t: 'input', seq: 7 })).toEqual({ t: 'input', seq: 7 });
    expect(parseClientMessage({ t: 'input', seq: 8, to: [3, 4] })).toEqual({ t: 'input', seq: 8, to: [3, 4] });
    expect(parseClientMessage({ t: 'input', seq: 9, to: null })).toEqual({ t: 'input', seq: 9 });
    expect(parseClientMessage({ t: 'input', seq: 10, to: [3, 4], use: true })).toEqual({ t: 'input', seq: 10, to: [3, 4], use: true });
    expect(parseClientMessage({ t: 'input', seq: 11, to: [3, 4], use: false })).toEqual({ t: 'input', seq: 11, to: [3, 4] });
    expect(parseClientMessage({ t: 'drop', slot: 27 })).toEqual({ t: 'drop', slot: 27 });
    expect(parseClientMessage({ t: 'bank', op: 'deposit', slot: 0, qty: 1 })).toEqual({ t: 'bank', op: 'deposit', slot: 0, qty: 1 });
    expect(parseClientMessage({ t: 'bank', op: 'withdraw', item: 'oak_log', qty: 5 })).toEqual({ t: 'bank', op: 'withdraw', item: 'oak_log', qty: 5 });
    expect(parseClientMessage({ t: 'bank', op: 'all' })).toEqual({ t: 'bank', op: 'all' });
    expect(parseClientMessage({ t: 'bank', op: 'close', extra: 1 })).toEqual({ t: 'bank', op: 'close' });
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
    expect(parseClientMessage({ t: 'move', x: 1, y: 1 })).toBeNull(); // from protocol 1
    expect(parseClientMessage({ t: 'input' })).toBeNull();
    expect(parseClientMessage({ t: 'input', seq: -1 })).toBeNull();
    expect(parseClientMessage({ t: 'input', seq: 1.5 })).toBeNull();
    expect(parseClientMessage({ t: 'input', seq: '1' })).toBeNull();
    expect(parseClientMessage({ t: 'input', seq: 1, to: [1.5, 1] })).toBeNull();
    expect(parseClientMessage({ t: 'input', seq: 1, to: [LIMITS.COORD_MAX + 1, 1] })).toBeNull();
    expect(parseClientMessage({ t: 'input', seq: 1, to: [1] })).toBeNull();
    expect(parseClientMessage({ t: 'input', seq: 1, to: '1,1' })).toBeNull();
    expect(parseClientMessage({ t: 'run', on: 'yes' })).toBeNull();
    expect(parseClientMessage({ t: 'input', seq: 1, to: [1, 1], use: 'yes' })).toBeNull();
    expect(parseClientMessage({ t: 'input', seq: 1, use: true })).toEqual({ t: 'input', seq: 1 }); // use without a cell means nothing
    expect(parseClientMessage({ t: 'drop' })).toBeNull();
    expect(parseClientMessage({ t: 'drop', slot: -1 })).toBeNull();
    expect(parseClientMessage({ t: 'drop', slot: LIMITS.SLOT_MAX })).toBeNull();
    expect(parseClientMessage({ t: 'bank', op: 'deposit', slot: 0, qty: 0 })).toBeNull();
    expect(parseClientMessage({ t: 'bank', op: 'withdraw', item: 'Oak Log', qty: 1 })).toBeNull();
    expect(parseClientMessage({ t: 'bank', op: 'withdraw', item: 'oak_log' })).toBeNull();
    expect(parseClientMessage({ t: 'bank', op: 'steal' })).toBeNull();
    expect(parseClientMessage({ t: 'chat', text: '' })).toBeNull();
    expect(parseClientMessage({ t: 'chat', text: 42 })).toBeNull();
    expect(parseClientMessage({ t: 'chat', text: 'x'.repeat(LIMITS.CHAT_MAX * 4 + 1) })).toBeNull();
    expect(parseClientMessage({ t: 'hello', v: 1, name: 'x', secret: SECRET })).toBeNull();
    expect(parseClientMessage({ t: 'hello', v: '1', name: 'Ada', secret: SECRET })).toBeNull();
    expect(parseClientMessage({ t: 'hello', v: 1, name: 'Ada', secret: SECRET, token: 7 })).toBeNull();
    expect(parseClientMessage({ t: 'hello', v: 1, name: 'Ada', secret: SECRET, token: 'x'.repeat(LIMITS.TOKEN_MAX + 1) })).toBeNull();
    expect(parseClientMessage({ t: 'hello', v: 1, name: 'Ada' })).toBeNull(); // no secret (protocol 3)
    expect(parseClientMessage({ t: 'hello', v: 1, name: 'Ada', secret: 'short' })).toBeNull();
    expect(parseClientMessage({ t: 'hello', v: 1, name: 'Ada', secret: 'has spaces in it and more' })).toBeNull();
    expect(parseClientMessage({ t: 'hello', v: 1, name: 'Ada', secret: 'x'.repeat(LIMITS.TOKEN_MAX + 1) })).toBeNull();
    expect(parseClientMessage({ t: 'hello', v: 1, name: 'Ada', secret: 42 })).toBeNull();
    expect(parseClientMessage({ t: 'ping', at: Infinity })).toBeNull();
  });

  it('decodes JSON text with a size cap', () => {
    expect(decodeClientMessage('{"t":"input","seq":1,"to":[2,3]}')).toEqual({ t: 'input', seq: 1, to: [2, 3] });
    expect(decodeClientMessage('{"t":"input",')).toBeNull();
    expect(decodeClientMessage('not json')).toBeNull();
    expect(decodeClientMessage(`{"t":"chat","text":"${'x'.repeat(LIMITS.MESSAGE_CHARS)}"}`)).toBeNull();
  });

  it('knows a secret a browser could have made', () => {
    expect(isSecret(SECRET)).toBe(true);
    expect(isSecret('a'.repeat(LIMITS.SECRET_MIN))).toBe(true);
    expect(isSecret('a'.repeat(LIMITS.SECRET_MIN - 1))).toBe(false);
    expect(isSecret('a'.repeat(LIMITS.TOKEN_MAX + 1))).toBe(false);
    expect(isSecret('0123456789abcdef!')).toBe(false);
    expect(isSecret(null)).toBe(false);
  });

  it('recognizes server messages by type only', () => {
    expect(decodeServerMessage('{"t":"pong","at":1}')).toEqual({ t: 'pong', at: 1 });
    expect(decodeServerMessage('{"t":"zone","zone":"copper_hills","tick":5,"entities":[],"seq":1005}')).toMatchObject({ t: 'zone', zone: 'copper_hills' });
    expect(decodeServerMessage('{"t":"you","bag":[]}')).toEqual({ t: 'you', bag: [] });
    expect(decodeServerMessage('{"t":"nope"}')).toBeNull();
    expect(decodeServerMessage('[]')).toBeNull();
    expect(decodeServerMessage('{')).toBeNull();
  });
});
