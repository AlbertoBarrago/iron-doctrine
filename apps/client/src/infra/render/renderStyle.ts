export const MATERIAL = {
  armorDark: 0x151a17,
  armorMid: 0x303832,
  armorLight: 0x687068,
  concreteDark: 0x242a26,
  concrete: 0x59615a,
  copper: 0x9a6034,
  amber: 0xe0b34b,
  factionRed: 0x8f3429,
  glass: 0x223833,
  shadow: 0x070908,
} as const;

export interface InfantryMotion {
  gait: number;
  bob: number;
  recoil: number;
}

export function shadeColor(color: number, factor: number): number {
  const red = clampChannel(((color >> 16) & 0xff) * factor);
  const green = clampChannel(((color >> 8) & 0xff) * factor);
  const blue = clampChannel((color & 0xff) * factor);
  return (red << 16) | (green << 8) | blue;
}

export function infantryMotion(
  animationTime: number,
  moving: boolean,
  firing: boolean,
): InfantryMotion {
  const gait = moving ? Math.sin(animationTime * 10) : 0;
  return {
    gait,
    bob: moving ? Math.abs(Math.cos(animationTime * 10)) * 0.08 : 0,
    recoil: firing ? 0.16 : 0,
  };
}

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}
