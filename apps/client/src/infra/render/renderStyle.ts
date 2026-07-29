export const MATERIAL = {
  armorDark: 0x121713,
  armorMid: 0x343d35,
  armorLight: 0x7b8477,
  steelEdge: 0xaab09e,
  concreteDark: 0x272923,
  concrete: 0x66685c,
  concreteLight: 0x909080,
  copper: 0x9b6038,
  amber: 0xe2b44a,
  factionRed: 0x8f3429,
  glass: 0x1c3533,
  dust: 0xa58c62,
  smoke: 0x3b403a,
  shadow: 0x070908,
} as const;

export interface MaterialRamp {
  shadow: number;
  base: number;
  light: number;
  edge: number;
}

export interface InfantryMotion {
  gait: number;
  bob: number;
  recoil: number;
}

export interface EngineerToolMotion {
  swing: number;
  pulse: number;
}

export function shadeColor(color: number, factor: number): number {
  const red = clampChannel(((color >> 16) & 0xff) * factor);
  const green = clampChannel(((color >> 8) & 0xff) * factor);
  const blue = clampChannel((color & 0xff) * factor);
  return (red << 16) | (green << 8) | blue;
}

export function materialRamp(color: number): MaterialRamp {
  return {
    shadow: shadeColor(color, 0.48),
    base: shadeColor(color, 0.78),
    light: shadeColor(color, 1.08),
    edge: shadeColor(color, 1.34),
  };
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

export function engineerToolMotion(animationTime: number, moving: boolean): EngineerToolMotion {
  if (moving) return { swing: 0, pulse: 0 };
  const cycle = (animationTime * 0.8) % 1;
  return {
    swing: Math.sin(animationTime * 3.2) * 0.16,
    pulse: cycle > 0.72 && cycle < 0.84 ? Math.sin(((cycle - 0.72) / 0.12) * Math.PI) : 0,
  };
}

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}
