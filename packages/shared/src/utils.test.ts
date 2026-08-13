import { describe, expect, it } from 'vitest';
import { CYCLE_LABELS, escapeHtml } from './utils';

describe('escapeHtml', () => {
  it('escapes the 5 HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('バーベルベンチプレス')).toBe('バーベルベンチプレス');
  });

  it('handles an empty string', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('CYCLE_LABELS', () => {
  it('has an entry for each of the 4 cycles matching the cycles table', () => {
    expect(CYCLE_LABELS).toEqual({
      1: 'Push',
      2: 'Pull',
      3: 'Legs',
      4: 'Rest',
    });
  });
});
