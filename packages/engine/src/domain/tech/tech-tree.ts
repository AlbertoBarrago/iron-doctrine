/**
 * Technology tree. Research unlocks advanced units, buildings and upgrades. Definitions
 * are data; state is per-player (a set of unlocked tech ids). Deterministic: unlocking
 * happens inside a command handler during the tick, and the state serializes for saves.
 */
export interface TechDef {
  id: string;
  cost: number;
  /** Tech ids that must be unlocked first. */
  requires: string[];
  /** Units this tech makes buildable. */
  unlocksUnits: string[];
  /** Buildings this tech makes buildable. */
  unlocksBuildings: string[];
}

export const TECH_TREE: Readonly<Record<string, TechDef>> = {
  infantry_doctrine: {
    id: 'infantry_doctrine',
    cost: 500,
    requires: [],
    unlocksUnits: ['engineer'],
    unlocksBuildings: [],
  },
  armor_doctrine: {
    id: 'armor_doctrine',
    cost: 1000,
    requires: [],
    unlocksUnits: ['tank'],
    unlocksBuildings: ['factory'],
  },
  advanced_armor: {
    id: 'advanced_armor',
    cost: 1500,
    requires: ['armor_doctrine'],
    unlocksUnits: [],
    unlocksBuildings: [],
  },
};

/** Units/buildings that require a tech before they can be produced/built. */
export const UNIT_TECH_REQUIREMENT: Readonly<Record<string, string>> = {
  engineer: 'infantry_doctrine',
  tank: 'armor_doctrine',
};

/** Per-player unlocked-tech state. */
export class TechState {
  private readonly unlocked = new Map<number, Set<string>>();

  private setFor(player: number): Set<string> {
    let s = this.unlocked.get(player);
    if (!s) {
      s = new Set();
      this.unlocked.set(player, s);
    }
    return s;
  }

  isUnlocked(player: number, tech: string): boolean {
    return this.setFor(player).has(tech);
  }

  /** Prerequisites satisfied for a player to research `tech`. */
  canResearch(player: number, tech: string): boolean {
    const def = TECH_TREE[tech];
    if (!def || this.isUnlocked(player, tech)) return false;
    return def.requires.every((r) => this.isUnlocked(player, r));
  }

  unlock(player: number, tech: string): void {
    this.setFor(player).add(tech);
  }

  /** Whether a unit can be produced by a player given tech requirements. */
  canProduceUnit(player: number, unit: string): boolean {
    const req = UNIT_TECH_REQUIREMENT[unit];
    return req === undefined || this.isUnlocked(player, req);
  }

  serialize(): Array<[number, string[]]> {
    return [...this.unlocked.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([p, set]) => [p, [...set].sort()]);
  }

  restore(entries: Array<[number, string[]]>): void {
    this.unlocked.clear();
    for (const [p, techs] of entries) this.unlocked.set(p, new Set(techs));
  }
}
