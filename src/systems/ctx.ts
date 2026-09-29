/** What every system function receives besides the state. */
import type { EventBus } from '@/core/events';
import type { Registry } from '@/core/registry';
import type { Rng } from '@/core/rng';
import type { GameEventName, GameEvents } from '@/types/events';
import type { GameState } from '@/types/state';

export interface Ctx {
  readonly content: Registry;
  readonly rng: Rng;
  readonly events: EventBus;
}

/** Event reactions a system wants wired up. The facade subscribes them at boot. */
export type SystemListeners = {
  [E in GameEventName]?: (state: GameState, ctx: Ctx, payload: GameEvents[E]) => void;
};
