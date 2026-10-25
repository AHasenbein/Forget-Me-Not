import type { EventBus } from '@core/events/bus';

/** Holds the bus handed to `register()`. Tiny and dependency-free so the manifest can import it statically. */
let current: EventBus | undefined;
export const setBus = (b: EventBus) => void (current = b);
export const getBus = () => current;
