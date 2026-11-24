import { describe, expect, it } from 'vitest';
import { lerCookie, origemPermitida } from './upgrade.js';

describe('lerCookie', () => {
  it('acha o cookie entre vários e decodifica', () => {
    expect(lerCookie('a=1; sondohub_session=abc%2Fdef; b=2', 'sondohub_session')).toBe('abc/def');
  });
  it('não confunde nome parecido nem aceita header vazio', () => {
    expect(lerCookie('x_sondohub_session=1', 'sondohub_session')).toBeUndefined();
    expect(lerCookie(undefined, 'sondohub_session')).toBeUndefined();
    expect(lerCookie('sondohub_session=%E0%A4%A', 'sondohub_session')).toBeUndefined();
  });
});

describe('origemPermitida', () => {
  it('só o origin do hub', () => {
    expect(origemPermitida('https://hub.exemplo.com', 'https://hub.exemplo.com/')).toBe(true);
    expect(origemPermitida('https://evil.com', 'https://hub.exemplo.com')).toBe(false);
    expect(origemPermitida(undefined, 'https://hub.exemplo.com')).toBe(false);
  });
});
