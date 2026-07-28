export interface BattlefieldProfile {
  label: string;
  role: string;
  description: string;
  tacticalNote: string;
}

const CONTINUOUS_PLACEMENT = new Set(['concrete_wall']);

export function usesContinuousPlacement(building: string): boolean {
  return CONTINUOUS_PLACEMENT.has(building);
}

export const UNIT_PROFILES: Readonly<Record<string, BattlefieldProfile>> = {
  rifleman: {
    label: 'Rifleman',
    role: 'Line infantry',
    description: 'Cheap, mobile infantry for scouting and holding ground.',
    tacticalNote: 'Effective in numbers. Vulnerable to armor and concentrated fire.',
  },
  engineer: {
    label: 'Engineer',
    role: 'Field support',
    description: 'Unarmed specialist intended for technical battlefield objectives.',
    tacticalNote: 'Keep protected behind combat units.',
  },
  scout: {
    label: 'Scout buggy',
    role: 'Fast reconnaissance',
    description: 'Light unarmed vehicle with extended battlefield vision.',
    tacticalNote: 'Use speed to reveal approaches. Avoid every direct engagement.',
  },
  tank: {
    label: 'Battle tank',
    role: 'Armored assault',
    description: 'Durable direct-fire vehicle for breaking defended positions.',
    tacticalNote: 'Powerful but expensive. Screen it with infantry.',
  },
  harvester: {
    label: 'Harvester',
    role: 'Field economy',
    description: 'Collects ore and returns it to a refinery or construction yard.',
    tacticalNote: 'Your income depends on it. Avoid frontline routes.',
  },
};

export const BUILDING_PROFILES: Readonly<Record<string, BattlefieldProfile>> = {
  concrete_wall: {
    label: 'Concrete wall',
    role: 'Base perimeter',
    description: 'A durable barrier that blocks hostile movement and channels attacks.',
    tacticalNote: 'Build connected lines and leave deliberate routes for your own forces.',
  },
  construction_yard: {
    label: 'Construction yard',
    role: 'Base command',
    description: 'Deploys new structures and anchors your operational base.',
    tacticalNote: 'Losing every construction yard ends the battle.',
  },
  power_plant: {
    label: 'Power plant',
    role: 'Power generation',
    description: 'Supplies the grid required by production and defensive systems.',
    tacticalNote: 'Low power disables automated defenses.',
  },
  refinery: {
    label: 'Refinery',
    role: 'Resource processing',
    description: 'Receives ore deliveries and converts them into credits.',
    tacticalNote: 'Place it close to ore fields to shorten harvester routes.',
  },
  barracks: {
    label: 'Barracks',
    role: 'Infantry production',
    description: 'Trains riflemen and battlefield engineers.',
    tacticalNote: 'The fastest way to establish an inexpensive fighting force.',
  },
  factory: {
    label: 'War factory',
    role: 'Vehicle production',
    description: 'Builds armored combat vehicles and harvesters.',
    tacticalNote: 'Expensive and power-hungry, but essential for heavy forces.',
  },
  turret: {
    label: 'Defense turret',
    role: 'Static defense',
    description: 'Automatically engages hostile units inside its firing radius.',
    tacticalNote: 'Requires power and works best covering a narrow approach.',
  },
};

export function profileFor(
  unitType?: string,
  buildingType?: string,
): BattlefieldProfile | undefined {
  return unitType
    ? UNIT_PROFILES[unitType]
    : buildingType
      ? BUILDING_PROFILES[buildingType]
      : undefined;
}
