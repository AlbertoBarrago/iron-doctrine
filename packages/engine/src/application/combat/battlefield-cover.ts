import type { EntityId } from '@iron/shared';
import { Position, UnitType } from '../../domain/components/index.js';
import type { Vec2 } from '../../domain/math/vec2.js';
import type { World } from '../ecs/world.js';
import type { NavGrid } from '../pathfinding/nav-grid.js';

const COVERED_UNIT_TYPES = new Set(['rifleman', 'engineer', 'medic']);
const COVER_NUMERATOR = 3;
const COVER_DENOMINATOR = 4;

/**
 * Immutable authored cover mask. Dynamic navigation blockers such as buildings are
 * intentionally excluded by accepting map cells separately from the NavGrid topology.
 */
export class BattlefieldCover {
  private readonly cells: ReadonlySet<string>;

  constructor(
    private readonly grid: NavGrid,
    cells: readonly (readonly [number, number])[] = [],
  ) {
    this.cells = new Set(cells.map(([x, y]) => keyOf(x, y)));
  }

  damageAgainst(world: World, target: EntityId, threatPosition: Vec2, rawDamage: number): number {
    if (rawDamage <= 0 || !this.protects(world, target, threatPosition)) return rawDamage;
    return Math.max(1, Math.floor((rawDamage * COVER_NUMERATOR) / COVER_DENOMINATOR));
  }

  protects(world: World, target: EntityId, threatPosition: Vec2): boolean {
    const unit = world.get(target, UnitType);
    const targetPosition = world.get(target, Position);
    if (!unit || !targetPosition || !COVERED_UNIT_TYPES.has(unit.kind)) return false;

    const cell = this.grid.worldToCell(targetPosition.x, targetPosition.y);
    const dx = Math.sign(threatPosition.x - targetPosition.x);
    const dy = Math.sign(threatPosition.y - targetPosition.y);
    if (dx === 0 && dy === 0) return false;

    return this.cells.has(keyOf(cell.cx + dx, cell.cy + dy));
  }

  serialize(): Array<[number, number]> {
    return [...this.cells]
      .map((key) => key.split(':').map(Number) as [number, number])
      .sort(([leftX, leftY], [rightX, rightY]) => leftY - rightY || leftX - rightX);
  }
}

function keyOf(x: number, y: number): string {
  return `${x}:${y}`;
}
