import { fp, NavGrid, Simulation } from '@iron/engine';
import type { InitConfig } from './protocol.js';

/**
 * Builds the authoritative simulation from the typed Worker boundary.
 * Kept outside the Worker event loop so every forwarded option is regression-testable.
 */
export function createSimulationFromInit(config: InitConfig): Simulation {
  const grid = config.map
    ? new NavGrid(config.map.width, config.map.height, fp.fromFloat(config.map.cellSize))
    : undefined;
  if (grid && config.map) {
    for (const [x, y] of config.map.blocked) grid.setBlocked(x, y, true);
  }

  return new Simulation({
    seed: config.seed,
    ...(grid ? { grid } : {}),
    ...(config.map ? { coverCells: config.map.blocked } : {}),
    ...(config.aiPlayers ? { aiPlayers: config.aiPlayers } : {}),
    ...(config.startingCredits ? { startingCredits: config.startingCredits } : {}),
    ...(config.startingTech ? { startingTech: config.startingTech } : {}),
    ...(config.matchPlayers ? { matchPlayers: config.matchPlayers } : {}),
    ...(config.firstContact ? { firstContact: config.firstContact } : {}),
    ...(config.ironPass ? { ironPass: config.ironPass } : {}),
    ...(config.siegeLine ? { siegeLine: config.siegeLine } : {}),
    ...(config.blackDawn ? { blackDawn: config.blackDawn } : {}),
    ...(config.silentExtraction ? { silentExtraction: config.silentExtraction } : {}),
  });
}
