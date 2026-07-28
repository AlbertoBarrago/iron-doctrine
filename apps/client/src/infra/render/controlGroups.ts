export interface ControlGroupRecall {
  ids: readonly number[];
  focus: boolean;
}

export interface ControlGroupSummary {
  slot: number;
  count: number;
}

const DOUBLE_RECALL_MS = 420;

export class ControlGroups {
  private readonly groups = new Map<number, Set<number>>();
  private lastRecall: { slot: number; at: number } | null = null;

  assign(slot: number, ids: Iterable<number>): boolean {
    const group = new Set(ids);
    if (!validSlot(slot) || group.size === 0) return false;
    this.groups.set(slot, group);
    return true;
  }

  recall(slot: number, validIds: ReadonlySet<number>, now: number): ControlGroupRecall | null {
    const group = this.groups.get(slot);
    if (!group || !validSlot(slot)) return null;
    for (const id of group) {
      if (!validIds.has(id)) group.delete(id);
    }
    if (group.size === 0) {
      this.groups.delete(slot);
      return null;
    }
    const focus =
      this.lastRecall?.slot === slot && now - this.lastRecall.at >= 0 && now - this.lastRecall.at <= DOUBLE_RECALL_MS;
    this.lastRecall = { slot, at: now };
    return { ids: [...group], focus };
  }

  summaries(validIds: ReadonlySet<number>): ControlGroupSummary[] {
    const summaries: ControlGroupSummary[] = [];
    for (const [slot, group] of this.groups) {
      let count = 0;
      for (const id of group) {
        if (validIds.has(id)) count++;
      }
      if (count > 0) summaries.push({ slot, count });
    }
    return summaries.sort((left, right) => left.slot - right.slot);
  }
}

function validSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 1 && slot <= 9;
}
