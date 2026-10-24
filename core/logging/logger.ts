/** Structured logger. Redacts PII-ish keys; never log tokens, location, or document contents. */
const REDACT =
  /(token|secret|password|authorization|^lat$|^lng$|latitude|longitude|location|email|phone|address|document|content|transcript|^name$|fullname)/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k,
      REDACT.test(k) ? '[redacted]' : redact(v, depth + 1),
    ]),
  );
}

type Level = 'debug' | 'info' | 'warn' | 'error';
function write(level: Level, msg: string, ctx?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'test' && !process.env.LOG_IN_TESTS) return;
  const line = JSON.stringify({ level, msg, ...(ctx ? (redact(ctx) as object) : {}) });
  // eslint-disable-next-line no-console -- this IS the sanctioned logger
  (level === 'error' || level === 'warn' ? console.error : console.log)(line);
}

export const logger = {
  debug: (m: string, c?: Record<string, unknown>) => write('debug', m, c),
  info: (m: string, c?: Record<string, unknown>) => write('info', m, c),
  warn: (m: string, c?: Record<string, unknown>) => write('warn', m, c),
  error: (m: string, c?: Record<string, unknown>) => write('error', m, c),
};
