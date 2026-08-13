import { describe, expect, it } from 'vitest';
import { escapeHtml } from './utils';

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
