import { isDemo } from '../config/data-mode';

/**
 * App time. Live: real time, always. Demo: a virtual clock you can speed up or jump forward, so a
 * 30-minute escalation can be shown in 30 seconds. Features read time ONLY from `now()`; a service takes
 * `now` as a dependency so tests can pass a FakeClock instead.
 */
const start = () => ({ real: Date.now(), virtual: Date.now() });
let anchor = start();
let speed = 1;

const virtualNow = () => anchor.virtual + (Date.now() - anchor.real) * speed;
const reanchor = () => void (anchor = { real: Date.now(), virtual: virtualNow() });

export function now(): Date {
  return new Date(isDemo() ? virtualNow() : Date.now());
}
export const MAX_SPEED = 3600;
const requireDemo = () => {
  if (!isDemo()) throw new Error('clock controls only exist in demo mode');
};
export function setSpeed(x: number) {
  requireDemo();
  if (!Number.isFinite(x) || x < 1 || x > MAX_SPEED)
    throw new Error(`speed must be 1..${MAX_SPEED}`);
  reanchor();
  speed = x;
}
export function jump(ms: number) {
  requireDemo();
  if (!Number.isFinite(ms) || ms < 0 || ms > 7 * 86_400_000)
    throw new Error('jump must be 0..7 days');
  anchor = { real: anchor.real, virtual: anchor.virtual + ms };
}
export function resetClock() {
  anchor = start();
  speed = 1;
}
export const getSpeed = () => speed;
