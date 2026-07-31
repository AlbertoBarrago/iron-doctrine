import type { EntitySnapshot, FogSnapshot } from '@iron/engine';
import { profileFor } from '../game/gameContent.js';

type HarvesterPhase = NonNullable<EntitySnapshot['cargo']>['phase'];

export interface EntityReadout {
  label: string;
  role?: string;
  description?: string;
  tacticalNote?: string;
  kind: 'unit' | 'building' | 'resource';
  buildingType?: string;
  constructionProgress?: number;
  hp?: number;
  maxHp?: number;
  status: string;
  cargo?: NonNullable<EntitySnapshot['cargo']>;
  resourceAmount?: number;
}

export function harvesterStatus(phase: HarvesterPhase): string {
  switch (phase) {
    case 'idle':
      return 'Searching for ore';
    case 'toNode':
      return 'Moving to ore field';
    case 'gathering':
      return 'Harvesting ore';
    case 'toBase':
      return 'Returning to construction yard';
    case 'depositing':
      return 'Depositing ore';
    case 'paused':
      return 'Awaiting orders';
  }
}

export function entityReadout(entity: EntitySnapshot): EntityReadout | null {
  if (entity.kind === 'projectile') return null;
  const profile = profileFor(entity.unitType, entity.buildingType);
  const constructionProgress = entity.construction
    ? entity.construction.progressTicks / entity.construction.buildTicks
    : undefined;

  return {
    label:
      profile?.label ??
      (entity.resource ? 'Ore field' : undefined) ??
      (entity.unitType ?? entity.buildingType ?? entity.kind).replaceAll('_', ' '),
    ...(profile && {
      role: profile.role,
      description: profile.description,
      tacticalNote: profile.tacticalNote,
    }),
    kind: entity.kind,
    ...(entity.buildingType && { buildingType: entity.buildingType }),
    ...(constructionProgress !== undefined && { constructionProgress }),
    ...(entity.maxHp > 0 && { hp: entity.hp, maxHp: entity.maxHp }),
    ...(entity.cargo && { cargo: entity.cargo }),
    ...(entity.resource && { resourceAmount: entity.resource.amount }),
    status:
      constructionProgress !== undefined
        ? `Under construction · ${Math.round(constructionProgress * 100)}%`
        : entity.production?.queue.length
          ? `Producing ${entity.production.queue[0]!.replaceAll('_', ' ')}`
          : entity.cargo
            ? harvesterStatus(entity.cargo.phase)
            : entity.resource
              ? 'Resource field'
              : 'Ready',
  };
}

export function entityIsInspectable(entity: EntitySnapshot, fog: FogSnapshot): boolean {
  if (entity.kind === 'projectile') return false;
  if (entity.owner === 0 && entity.kind !== 'resource') return true;

  const cellX = Math.floor((entity.x - fog.originX) / fog.cellSize);
  const cellY = Math.floor((entity.y - fog.originY) / fog.cellSize);
  if (cellX < 0 || cellY < 0 || cellX >= fog.width || cellY >= fog.height) return false;
  const visibility = fog.cells[cellY * fog.width + cellX]!;
  return entity.kind === 'resource' ? visibility > 0 : visibility === 2;
}
