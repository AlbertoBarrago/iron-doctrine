import { describe, expect, it } from 'vitest';
import { ControlGroups } from '../controlGroups.js';

describe('control groups', () => {
  it('assigns and recalls a numbered group', () => {
    const groups = new ControlGroups();
    expect(groups.assign(2, [4, 7, 9])).toBe(true);
    expect(groups.recall(2, new Set([4, 7, 9]), 1_000)).toEqual({
      ids: [4, 7, 9],
      focus: false,
    });
  });

  it('prunes destroyed units from recalls and summaries', () => {
    const groups = new ControlGroups();
    groups.assign(1, [4, 7, 9]);
    expect(groups.recall(1, new Set([4, 9]), 1_000)?.ids).toEqual([4, 9]);
    expect(groups.summaries(new Set([4]))).toEqual([{ slot: 1, count: 1 }]);
  });

  it('focuses only on a quick second recall of the same group', () => {
    const groups = new ControlGroups();
    groups.assign(1, [4]);
    groups.assign(2, [7]);
    const valid = new Set([4, 7]);
    expect(groups.recall(1, valid, 1_000)?.focus).toBe(false);
    expect(groups.recall(1, valid, 1_300)?.focus).toBe(true);
    expect(groups.recall(2, valid, 1_500)?.focus).toBe(false);
  });

  it('ignores empty assignments and invalid slots', () => {
    const groups = new ControlGroups();
    expect(groups.assign(0, [1])).toBe(false);
    expect(groups.assign(1, [])).toBe(false);
    expect(groups.recall(1, new Set([1]), 0)).toBeNull();
  });
});
