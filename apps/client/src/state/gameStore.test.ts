import { describe, expect, it } from 'vitest';
import {
  commandAvailability,
  commandSelectionContext,
  commandTabAvailable,
  harvesterStatus,
  tutorialProgress,
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

  it('does not reset the tab when only live status changes', () => {
    const base = selected(['build']);
    expect(commandSelectionContext(base, null)).toBe(
      commandSelectionContext({ ...base, hp: 20, status: 'Damaged' }, null),
    );
  });

  it('exposes build and production only for the relevant selection', () => {
    const yard = selected(['build']);
    expect(commandTabAvailable('build', true, yard, null)).toBe(true);
    expect(commandTabAvailable('build', true, selected(['move']), null)).toBe(false);
    expect(commandTabAvailable('production', true, yard, null)).toBe(false);
    expect(commandTabAvailable('orders', false, null, null)).toBe(true);
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

describe('harvester presentation', () => {
  it('describes every authoritative harvesting phase', () => {
    expect(harvesterStatus('idle')).toBe('Searching for ore');
    expect(harvesterStatus('toNode')).toBe('Moving to ore field');
    expect(harvesterStatus('gathering')).toBe('Harvesting ore');
    expect(harvesterStatus('toBase')).toBe('Returning to refinery');
    expect(harvesterStatus('depositing')).toBe('Depositing ore');
    expect(harvesterStatus('paused')).toBe('Awaiting orders');
  });
});

describe('tutorial progression', () => {
  it('follows the base construction learning sequence', () => {
    expect(tutorialProgress([], 'select').step).toBe('power');
    expect(tutorialProgress(['select', 'power'], 'refinery').step).toBe('gather');
  });

  it('remembers milestones completed out of order', () => {
    const earlyBarracks = tutorialProgress([], 'barracks');
    expect(earlyBarracks.step).toBe('select');
    const selected = tutorialProgress(earlyBarracks.completed, 'select');
    const powered = tutorialProgress(selected.completed, 'power');
    const refined = tutorialProgress(powered.completed, 'refinery');
    const gathered = tutorialProgress(refined.completed, 'gather');
    expect(gathered.step).toBe('produce');
  });

  it('completes after production and base defense', () => {
    const completed = ['select', 'power', 'refinery', 'gather', 'barracks', 'produce'] as const;
    expect(tutorialProgress(completed, 'defense').step).toBe('complete');
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
    ).toEqual(['build', 'demolish']);
    expect(
      selectionCommands([
        entity({ kind: 'building', unitType: undefined, buildingType: 'refinery' }),
        entity({ unitType: 'engineer' }),
      ]),
    ).toContain('recycle');
  });
});
