import { describe, expect, it } from 'vitest';
import { nextTutorialStep } from './gameStore.js';

describe('tutorial progression', () => {
  it('advances only when the current instruction is completed', () => {
    expect(nextTutorialStep('select', 'select')).toBe('move');
    expect(nextTutorialStep('select', 'build')).toBe('select');
  });

  it('advances through the complete playable loop', () => {
    expect(nextTutorialStep('move', 'move')).toBe('build');
    expect(nextTutorialStep('build', 'build')).toBe('produce');
    expect(nextTutorialStep('produce', 'produce')).toBe('attack');
    expect(nextTutorialStep('attack', 'attack')).toBe('complete');
    expect(nextTutorialStep('complete', 'complete')).toBe('complete');
  });
});
