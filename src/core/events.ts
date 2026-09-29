/** Typed publish/subscribe. Systems talk to each other and to the UI only through this. */
import type { GameEventName, GameEvents } from '@/types/events';

export type Listener<E extends GameEventName> = (payload: GameEvents[E]) => void;

export class EventBus {
  private readonly listeners = new Map<GameEventName, Set<(payload: unknown) => void>>();

  /** Subscribe. Returns an unsubscribe function. */
  on<E extends GameEventName>(event: E, fn: Listener<E>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const wrapped = fn as (payload: unknown) => void;
    set.add(wrapped);
    return () => {
      set.delete(wrapped);
    };
  }

  emit<E extends GameEventName>(event: E, payload: GameEvents[E]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    // Copy so listeners may unsubscribe while we iterate.
    for (const fn of [...set]) fn(payload);
  }
}
