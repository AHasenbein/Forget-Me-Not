import { describe, expect, it } from 'vitest';
import { palette } from './tokens';

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe('palette contrast (WCAG AA = 4.5:1 text)', () => {
  const p = palette;
  const pairs: [string, string, string][] = [
    ['text on bg', p.text, p.bg],
    ['text on card', p.text, p.card],
    ['muted on bg', p.muted, p.bg],
    ['muted on card', p.muted, p.card],
    ['onPrimary on primary', p.onPrimary, p.primary],
    ['primary on card', p.primary, p.card],
    ['primary on bg', p.primary, p.bg],
    ['primary on primaryBg', p.primary, p.primaryBg],
    ['success on successBg', p.success, p.successBg],
    ['success on card', p.success, p.card],
    ['onPrimary on success', p.onPrimary, p.success],
    ['warn on warnBg', p.warn, p.warnBg],
    ['text on warnBg', p.text, p.warnBg],
    ['danger on dangerBg', p.danger, p.dangerBg],
    ['danger on card', p.danger, p.card],
    ['onPrimary on danger', p.onPrimary, p.danger],
    ['muted on track (segmented)', p.muted, p.track],
    ['primary on card (selected segment)', p.primary, p.card],
    ['muted on sunken', p.muted, p.sunken],
    ['muted on warnBg', p.muted, p.warnBg],
  ];
  it.each(pairs)('%s', (_n, fg, bg) => expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5));
});
