/**
 * EnergySystem: recomputes each player's power balance (produced vs consumed) from
 * their buildings every tick. When consumption exceeds production the player is in
 * deficit — a signal defensive structures use to power down (wired in a later
 * milestone). Cheap: O(buildings). Deterministic aggregation, order-independent sums.
 */
import type { System } from '../ecs/system.js';
import type { World } from '../ecs/world.js';
import { Energy, Owner } from '../../domain/components/index.js';
import type { PlayerEconomy } from '../../domain/economy/player-economy.js';

export function createEnergySystem(economy: PlayerEconomy): System {
  return {
    name: 'EnergySystem',
    update(world: World): void {
      for (const p of economy.playerIds()) {
        const r = economy.get(p);
        r.power.produced = 0;
        r.power.consumed = 0;
      }
      for (const e of world.query(Energy, Owner)) {
        const energy = world.get(e, Energy)!;
        const r = economy.get(world.get(e, Owner)!.player);
        r.power.produced += energy.produced;
        r.power.consumed += energy.consumed;
      }
    },
  };
}
