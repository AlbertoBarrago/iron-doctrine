import type { EntitySnapshot } from '@iron/engine';
import type { Graphics } from 'pixi.js';

export function drawBuilding(
  graphics: Graphics,
  entity: EntitySnapshot,
  x: number,
  y: number,
  size: number,
  factionColor: number,
): void {
  const alpha = entity.construction ? 0.55 : 1;
  drawFoundation(graphics, x, y, size);

  switch (entity.buildingType) {
    case 'construction_yard':
      drawConstructionYard(graphics, x, y, size, factionColor, alpha);
      break;
    case 'power_plant':
      drawPowerPlant(graphics, x, y, size, factionColor, alpha);
      break;
    case 'refinery':
      drawRefinery(graphics, x, y, size, factionColor, alpha);
      break;
    case 'barracks':
      drawBarracks(graphics, x, y, size, factionColor, alpha);
      break;
    case 'factory':
      drawFactory(graphics, x, y, size, factionColor, alpha);
      break;
    case 'turret':
      drawTurret(graphics, x, y, size, factionColor, alpha);
      break;
    default:
      graphics
        .rect(x - size * 0.82, y - size * 0.82, size * 1.64, size * 1.64)
        .fill({ color: factionColor, alpha })
        .stroke({ width: 2, color: 0x080b09 });
  }

  drawFactionMark(graphics, x, y, size, factionColor);
}

function drawFoundation(graphics: Graphics, x: number, y: number, size: number): void {
  graphics
    .rect(x - size, y - size, size * 2, size * 2)
    .fill({ color: 0x111612 })
    .stroke({ width: 2, color: 0x070a08 });
  for (const [dx, dy] of [
    [-0.86, -0.86],
    [0.86, -0.86],
    [-0.86, 0.86],
    [0.86, 0.86],
  ] as const) {
    graphics.circle(x + size * dx, y + size * dy, Math.max(1.5, size * 0.055)).fill({
      color: 0x687066,
    });
  }
}

function drawConstructionYard(
  graphics: Graphics,
  x: number,
  y: number,
  size: number,
  color: number,
  alpha: number,
): void {
  graphics
    .rect(x - size * 0.72, y - size * 0.7, size * 1.44, size * 1.4)
    .fill({ color: shade(color, 0.62), alpha })
    .stroke({ width: 2, color: 0x090c0a });
  graphics
    .rect(x - size * 0.55, y - size * 0.5, size * 0.62, size)
    .fill({ color: 0x242c27, alpha })
    .stroke({ width: 1.5, color: 0x080b09 });
  graphics
    .rect(x + size * 0.18, y - size * 0.5, size * 0.37, size)
    .fill({ color: 0x0b0e0c, alpha });
  graphics
    .moveTo(x - size * 0.12, y - size * 0.7)
    .lineTo(x + size * 0.62, y - size * 1.04)
    .lineTo(x + size * 0.62, y + size * 0.72)
    .stroke({ width: Math.max(2, size * 0.1), color: 0xc19a38, alpha });
}

function drawPowerPlant(
  graphics: Graphics,
  x: number,
  y: number,
  size: number,
  color: number,
  alpha: number,
): void {
  graphics
    .rect(x - size * 0.72, y - size * 0.55, size * 1.44, size * 1.12)
    .fill({ color: shade(color, 0.72), alpha })
    .stroke({ width: 2, color: 0x080b09 });
  for (const dx of [-0.38, 0.38]) {
    graphics
      .circle(x + size * dx, y, size * 0.28)
      .fill({ color: 0x202a24, alpha })
      .stroke({ width: 2, color: 0xb59235, alpha });
    graphics.circle(x + size * dx, y, size * 0.09).fill({ color: 0xd7bb55, alpha });
  }
  graphics
    .rect(x - size * 0.48, y - size * 0.88, size * 0.18, size * 0.42)
    .rect(x + size * 0.3, y - size * 0.88, size * 0.18, size * 0.42)
    .fill({ color: 0x3f4942, alpha })
    .stroke({ width: 1, color: 0x090c0a });
}

function drawRefinery(
  graphics: Graphics,
  x: number,
  y: number,
  size: number,
  color: number,
  alpha: number,
): void {
  graphics
    .rect(x - size * 0.78, y - size * 0.66, size * 1.12, size * 1.32)
    .fill({ color: shade(color, 0.66), alpha })
    .stroke({ width: 2, color: 0x080b09 });
  graphics
    .circle(x + size * 0.46, y - size * 0.18, size * 0.38)
    .fill({ color: 0x3d463f, alpha })
    .stroke({ width: 2, color: 0x0a0d0b });
  graphics
    .rect(x + size * 0.18, y + size * 0.18, size * 0.58, size * 0.35)
    .fill({ color: 0x171d19, alpha });
  graphics
    .moveTo(x - size * 0.55, y - size * 0.15)
    .lineTo(x + size * 0.44, y - size * 0.15)
    .stroke({ width: Math.max(2, size * 0.12), color: 0xb58a2d, alpha });
}

function drawBarracks(
  graphics: Graphics,
  x: number,
  y: number,
  size: number,
  color: number,
  alpha: number,
): void {
  graphics
    .rect(x - size * 0.74, y - size * 0.7, size * 1.48, size * 1.4)
    .fill({ color: shade(color, 0.7), alpha })
    .stroke({ width: 2, color: 0x080b09 });
  graphics
    .moveTo(x - size * 0.78, y - size * 0.7)
    .lineTo(x, y - size)
    .lineTo(x + size * 0.78, y - size * 0.7)
    .stroke({ width: 3, color: 0x59635b, alpha });
  graphics
    .rect(x - size * 0.22, y + size * 0.05, size * 0.44, size * 0.65)
    .fill({ color: 0x0a0e0c, alpha });
  for (const dx of [-0.48, 0.48]) {
    graphics
      .rect(x + size * dx - size * 0.12, y - size * 0.3, size * 0.24, size * 0.25)
      .fill({ color: 0x9aa596, alpha: alpha * 0.7 });
  }
}

function drawFactory(
  graphics: Graphics,
  x: number,
  y: number,
  size: number,
  color: number,
  alpha: number,
): void {
  graphics
    .rect(x - size * 0.82, y - size * 0.68, size * 1.64, size * 1.36)
    .fill({ color: shade(color, 0.6), alpha })
    .stroke({ width: 2, color: 0x080b09 });
  graphics
    .rect(x - size * 0.6, y - size * 0.42, size * 1.2, size * 0.86)
    .fill({ color: 0x111713, alpha })
    .stroke({ width: 2, color: 0x667068, alpha });
  for (const offset of [-0.32, 0, 0.32]) {
    graphics
      .moveTo(x + size * offset, y - size * 0.4)
      .lineTo(x + size * offset, y + size * 0.42)
      .stroke({ width: 1, color: 0x343d37, alpha });
  }
  graphics
    .rect(x - size * 0.74, y - size * 0.86, size * 0.28, size * 0.35)
    .fill({ color: 0x4f5951, alpha });
}

function drawTurret(
  graphics: Graphics,
  x: number,
  y: number,
  size: number,
  color: number,
  alpha: number,
): void {
  graphics
    .circle(x, y, size * 0.7)
    .fill({ color: shade(color, 0.55), alpha })
    .stroke({ width: 2, color: 0x080b09 });
  graphics
    .circle(x, y, size * 0.42)
    .fill({ color: 0x303a34, alpha })
    .stroke({ width: 2, color: shade(color, 1.15), alpha });
  graphics
    .moveTo(x, y)
    .lineTo(x + size * 1.06, y)
    .stroke({ width: Math.max(3, size * 0.18), color: 0x111713, alpha });
}

function drawFactionMark(
  graphics: Graphics,
  x: number,
  y: number,
  size: number,
  color: number,
): void {
  graphics
    .rect(x - size * 0.12, y - size * 0.12, size * 0.24, size * 0.24)
    .fill({ color: shade(color, 1.35) })
    .stroke({ width: 1, color: 0x17130a });
}

function shade(color: number, factor: number): number {
  const red = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
  const green = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
  const blue = Math.min(255, Math.round((color & 0xff) * factor));
  return (red << 16) | (green << 8) | blue;
}
