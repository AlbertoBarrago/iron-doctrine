import { describe, expect, it } from 'vitest';
import {
  BUILDING_PROFILES,
  profileFor,
  UNIT_PROFILES,
  usesContinuousPlacement,
} from '../gameContent.js';

describe('battlefield profiles', () => {
  it('documents every currently playable unit and structure', () => {
    expect(Object.keys(UNIT_PROFILES)).toEqual([
      'rifleman',
      'engineer',
      'medic',
      'scout',
      'tank',
      'harvester',
    ]);
    expect(Object.keys(BUILDING_PROFILES)).toEqual([
      'concrete_wall',
      'construction_yard',
      'power_plant',
      'barracks',
      'factory',
      'turret',
    ]);
  });

  it('resolves unit and building profiles without mixing categories', () => {
    expect(profileFor('tank')?.role).toBe('Armored assault');
    expect(profileFor(undefined, 'construction_yard')?.role).toBe('Base command');
  });

  it('keeps wall placement active without affecting regular structures', () => {
    expect(usesContinuousPlacement('concrete_wall')).toBe(true);
    expect(usesContinuousPlacement('factory')).toBe(false);
  });
});
