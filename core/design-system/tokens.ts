/** Patient-UI tokens. See "Patient UI rules" in CLAUDE.md. */
export const patientUi = {
  minTouchTarget: 64,
  minFontSize: 24,
  colors: { text: '#000000', background: '#FFFFFF', primary: '#0B3D91', danger: '#B00020' },
} as const;

/** App palette: every text/background pair is WCAG AA or better. */
export const palette = {
  bg: '#F4F1EA',
  card: '#FFFFFF',
  text: '#111111',
  muted: '#4A4A4A',
  border: '#1F1F1F',
  primary: '#0B3D91',
  onPrimary: '#FFFFFF',
  success: '#17692F',
  successBg: '#E3F4E8',
  warn: '#7A4300',
  warnBg: '#FFEBC2',
  danger: '#B00020',
  dangerBg: '#FDE4E8',
} as const;
export type Tone = 'neutral' | 'primary' | 'success' | 'warn' | 'danger';
