import type { EntitySnapshot } from '@iron/engine';
import { describe, expect, it } from 'vitest';
import { BuildingAnimationState, servicingConstructionYards } from '../BuildingAnimationState.js';

function building(
  id: number,
  buildingType: EntitySnapshot['buildingType'],
  queue: string[] = [],
): EntitySnapshot {
  return {
    id,
    kind: 'building',
    buildingType,
    production: {
      queue,
      progressTicks: 0,
      currentBuildTicks: 60,
      produces: [],
    },
  } as EntitySnapshot;
}

describe('building animation state', () => {
  it('services only the closest friendly yard during an authoritative deposit', () => {
    const nearYard = { ...building(10, 'construction_yard'), x: 0, y: 0, owner: 1 };
    const farYard = { ...building(11, 'construction_yard'), x: 20, y: 0, owner: 1 };
    const harvester = {
      id: 12,
      kind: 'unit',
      unitType: 'harvester',
      x: 1,
      y: 0,
      owner: 1,
      cargo: { amount: 50, capacity: 100, phase: 'depositing' },
    } as EntitySnapshot;
    const entities = [nearYard, farYard, harvester];
    const servicing = servicingConstructionYards(entities);

    expect(servicing.has(nearYard.id)).toBe(true);
    expect(servicing.has(farYard.id)).toBe(false);
    expect(servicingConstructionYards([nearYard, { ...harvester, owner: 2 }]).size).toBe(0);
  });

  it('derives construction frames from progress without looping', () => {
    const animations = new BuildingAnimationState();
    const entity = building(1, 'factory');

    expect(
      animations.resolve({
        entity,
        presentationTime: 100,
        constructionProgress: 0,
      }),
    ).toEqual({ state: 'construction', step: 0 });
    expect(
      animations.resolve({
        entity,
        presentationTime: 200,
        constructionProgress: 0.74,
      }),
    ).toEqual({ state: 'construction', step: 2 });
    expect(
      animations.resolve({
        entity,
        presentationTime: 300,
        constructionProgress: 0.999,
      }),
    ).toEqual({ state: 'construction', step: 3 });
  });

  it('plays completion once only after observing construction', () => {
    const animations = new BuildingAnimationState();
    const entity = building(2, 'barracks');

    expect(animations.resolve({ entity, presentationTime: 5, constructionProgress: 1 })).toEqual({
      state: 'idle',
      step: 0,
    });

    animations.resolve({ entity, presentationTime: 6, constructionProgress: 0.75 });
    expect(animations.resolve({ entity, presentationTime: 7, constructionProgress: 1 })).toEqual({
      state: 'complete',
      step: 0,
    });
    expect(animations.resolve({ entity, presentationTime: 7.21, constructionProgress: 1 })).toEqual(
      { state: 'complete', step: 2 },
    );
    expect(animations.resolve({ entity, presentationTime: 7.4, constructionProgress: 1 })).toEqual({
      state: 'idle',
      step: 0,
    });
  });

  it('prioritises completion, exit, then continuous production', () => {
    const animations = new BuildingAnimationState();
    const initial = building(3, 'factory', ['tank']);
    animations.resolve({ entity: initial, presentationTime: 0, constructionProgress: 0.9 });
    expect(
      animations.resolve({ entity: initial, presentationTime: 1, constructionProgress: 1 }),
    ).toEqual({ state: 'complete', step: 0 });

    const queueDecremented = building(3, 'factory');
    expect(
      animations.resolve({
        entity: queueDecremented,
        presentationTime: 1.1,
        constructionProgress: 1,
      }),
    ).toEqual({ state: 'complete', step: 1 });
    expect(
      animations.resolve({
        entity: queueDecremented,
        presentationTime: 1.4,
        constructionProgress: 1,
      }),
    ).toEqual({ state: 'exit', step: 0 });
    expect(
      animations.resolve({
        entity: queueDecremented,
        presentationTime: 2,
        constructionProgress: 1,
      }),
    ).toEqual({ state: 'idle', step: 0 });

    const producing = building(3, 'factory', ['tank']);
    expect(
      animations.resolve({ entity: producing, presentationTime: 3, constructionProgress: 1 }),
    ).toEqual({ state: 'produce', step: 0 });
    expect(
      animations.resolve({ entity: producing, presentationTime: 3.31, constructionProgress: 1 }),
    ).toEqual({ state: 'produce', step: 3 });
  });

  it('uses the building-specific completed loops and paused presentation time', () => {
    const animations = new BuildingAnimationState();
    const powerPlant = building(4, 'power_plant');
    const yard = building(5, 'construction_yard');

    expect(
      animations.resolve({ entity: powerPlant, presentationTime: 10, constructionProgress: 1 }),
    ).toEqual({ state: 'generate', step: 0 });
    expect(
      animations.resolve({ entity: powerPlant, presentationTime: 10.25, constructionProgress: 1 }),
    ).toEqual({ state: 'generate', step: 2 });
    expect(
      animations.resolve({ entity: powerPlant, presentationTime: 10.25, constructionProgress: 1 }),
    ).toEqual({ state: 'generate', step: 2 });

    expect(
      animations.resolve({
        entity: yard,
        presentationTime: 10,
        constructionProgress: 1,
        servicing: true,
      }),
    ).toEqual({ state: 'service', step: 0 });
    expect(
      animations.resolve({
        entity: yard,
        presentationTime: 10.25,
        constructionProgress: 1,
        servicing: false,
      }),
    ).toEqual({ state: 'idle', step: 0 });
  });

  it('forgets lifecycle state when an entity leaves the rendered frame', () => {
    const animations = new BuildingAnimationState();
    const entity = building(6, 'barracks');
    animations.resolve({ entity, presentationTime: 0, constructionProgress: 0.5 });

    animations.beginFrame();
    animations.endFrame();

    expect(animations.resolve({ entity, presentationTime: 1, constructionProgress: 1 })).toEqual({
      state: 'idle',
      step: 0,
    });
  });
});
