import { describe, expect, it } from 'vitest';
import {
  commandAvailability,
  nextTutorialStep,
  preferredCommandTab,
  selectionCommands,
} from './gameStore.js';

describe('contextual command tabs', () => {
  const selected = (commands: Array<'move' | 'build'>) => ({
    label: 'Selection',
    kind: 'unit' as const,
    count: 1,
    commands,
  });

  it('opens build controls for a construction yard', () => {
    expect(preferredCommandTab(selected(['build']), null)).toBe('build');
  });

  it('prioritizes production facilities and defaults units to orders', () => {
    expect(
      preferredCommandTab(selected([]), {
        building: 1,
        buildingType: 'barracks',
        queue: [],
        progressTicks: 0,
        currentBuildTicks: 0,
        produces: ['rifleman'],
      }),
    ).toBe('production');
    expect(preferredCommandTab(selected(['move']), null)).toBe('orders');
  });
});

describe('command availability', () => {
  it('reports when a command is affordable', () => {
    expect(commandAvailability(800, 800)).toEqual({ available: true, label: 'Ready' });
  });

  it('reports the missing credits', () => {
    expect(commandAvailability(550, 800)).toEqual({
      available: false,
      label: 'Requires $250 more',
    });
  });
});

describe('tutorial progression', () => {
  it('advances only when the current instruction is completed', () => {
    expect(nextTutorialStep('select', 'select')).toBe('move');
    expect(nextTutorialStep('select', 'build')).toBe('select');
  });

  it('advances through the complete playable loop', () => {
    expect(nextTutorialStep('move', 'move')).toBe('gather');
    expect(nextTutorialStep('gather', 'gather')).toBe('build');
    expect(nextTutorialStep('build', 'build')).toBe('produce');
    expect(nextTutorialStep('produce', 'produce')).toBe('attack');
    expect(nextTutorialStep('attack', 'attack')).toBe('complete');
    expect(nextTutorialStep('complete', 'complete')).toBe('complete');
  });
});

describe('selection commands', () => {
  const entity = (overrides: Record<string, unknown>) => ({
    id: 1,
    kind: 'unit' as const,
    x: 0,
    y: 0,
    angle: 0,
    hp: 100,
    maxHp: 100,
    radius: 1,
    owner: 0,
    ...overrides,
  });

  it('exposes harvesting controls only when a harvester is selected', () => {
    expect(selectionCommands([entity({ unitType: 'harvester' })])).toEqual([
      'gather',
      'move',
      'stop',
    ]);
    expect(selectionCommands([entity({ unitType: 'tank' })])).toEqual(['move', 'attack', 'stop']);
  });

  it('exposes building-specific actions', () => {
    expect(
      selectionCommands([
        entity({ kind: 'building', unitType: undefined, buildingType: 'construction_yard' }),
      ]),
    ).toEqual(['build']);
  });
});
