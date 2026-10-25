/** Patient-UI tokens. See "Patient UI rules" in CLAUDE.md. */
export const patientUi = {
  minTouchTarget: 64,
  minFontSize: 24,
  colors: { text: '#000000', background: '#FFFFFF', primary: '#0B3D91', danger: '#B00020' },
} as const;

/**
 * App palette. Calm warm paper background, deep green primary (Alzheimer's Society advises against blue for
 * key controls), amber for "needs you now", red only for real problems. Every text/background pair is
 * WCAG AA or better (checked by core/design-system/tokens.test.ts).
 */
export const palette = {
  bg: '#F6F3EC',
  card: '#FFFFFF',
  text: '#16201C',
  muted: '#4B5753',
  border: '#D9D3C5',
  sunken: '#EFEBDF',
  track: '#E9E4D6',
  hero: '#0B3F31',
  heroSoft: 'rgba(255,255,255,0.14)',
  sunflower: '#FFC83D',
  petal: '#9DB4F0',
  inputBorder: '#6B7772',
  borderStrong: '#16201C',
  primary: '#0F5B45',
  primaryBg: '#DDF0E7',
  onPrimary: '#FFFFFF',
  success: '#17692F',
  successBg: '#E3F4E8',
  warn: '#7A4300',
  warnBg: '#FFEBC2',
  danger: '#B00020',
  dangerBg: '#FDE4E8',
} as const;
export type Tone = 'neutral' | 'primary' | 'success' | 'warn' | 'danger';

/** 8pt spacing scale and shared radii/shadow so every screen feels like one product. */
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 12, md: 20, lg: 28, pill: 999 } as const;
export const shadow = {
  boxShadow: '0 2px 10px rgba(22, 32, 28, 0.08)',
  elevation: 2,
} as const;

/** Names of the bundled icon images (core/design-system/icons/*.png). */
export type IconName =
  | 'pill'
  | 'toothbrush'
  | 'shower'
  | 'paw'
  | 'home'
  | 'sliders'
  | 'check'
  | 'alert'
  | 'back'
  | 'camera'
  | 'flower';
