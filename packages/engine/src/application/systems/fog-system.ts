/**
 * FogOfWarSystem: recomputes team visibility each tick. Demotes previously-visible
 * cells to explored, then re-reveals a radius around every vision source, grouped by
 * team so allied units share sight. Deterministic and O(sources × r²).
 */
import type { System } from '../ecs/system.js';
import type { World } from '../ecs/world.js';
import { Position, Owner, Vision } from '../../domain/components/index.js';
import type { FogOfWar } from '../fog/fog-of-war.js';

/** Maps a player to their vision-sharing team. Identity by default. */
export type TeamResolver = (player: number) => number;

export function createFogSystem(fog: FogOfWar, teamOf: TeamResolver): System {
  return {
    name: 'FogOfWarSystem',
    update(world: World): void {
      const sources = world.query(Vision, Position, Owner);

      // Demote each participating team's visible cells once, before stamping.
      const seen = new Set<number>();
      for (const e of sources) {
        const team = teamOf(world.get(e, Owner)!.player);
        if (!seen.has(team)) {
          seen.add(team);
          fog.beginFrame(team);
        }
      }

      for (const e of sources) {
        const team = teamOf(world.get(e, Owner)!.player);
        const pos = world.get(e, Position)!;
        fog.reveal(team, pos.x, pos.y, world.get(e, Vision)!.radius);
      }
    },
  };
}
