import type { EventMap, EventName } from '@contracts/events';
import { logger } from '../logging/logger';

type Handler<K extends EventName> = (payload: EventMap[K]) => void | Promise<void>;

/** In-process typed event bus. A failing handler never blocks the emitter or other handlers. */
export class EventBus {
  private handlers = new Map<EventName, Set<Handler<EventName>>>();

  on<K extends EventName>(name: K, handler: Handler<K>): () => void {
    const set = this.handlers.get(name) ?? new Set();
    set.add(handler as Handler<EventName>);
    this.handlers.set(name, set);
    return () => set.delete(handler as Handler<EventName>);
  }

  async emit<K extends EventName>(name: K, payload: EventMap[K]): Promise<void> {
    for (const h of [...(this.handlers.get(name) ?? [])]) {
      try {
        await h(payload);
      } catch (err) {
        logger.error('event handler failed', { event: name, err: String(err) });
      }
    }
  }
}

export const eventBus = new EventBus();
