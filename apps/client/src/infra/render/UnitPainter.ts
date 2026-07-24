import type { Graphics } from 'pixi.js';
import type { EntitySnapshot } from '@iron/engine';

interface Point {
  x: number;
  y: number;
}

export function drawUnit(
  graphics: Graphics,
  entity: EntitySnapshot,
  sx: number,
  sy: number,
  radius: number,
  color: number,
): void {
  switch (entity.unitType) {
    case 'tank':
      drawTank(graphics, sx, sy, radius, entity.angle, color);
      return;
    case 'harvester':
      drawHarvester(graphics, sx, sy, radius, entity.angle, color);
      return;
    case 'engineer':
      drawInfantry(graphics, sx, sy, radius, entity.angle, color, true);
      return;
    default:
      drawInfantry(graphics, sx, sy, radius, entity.angle, color, false);
  }
}

function drawTank(
  graphics: Graphics,
  sx: number,
  sy: number,
  radius: number,
  angle: number,
  color: number,
): void {
  polygon(graphics, sx, sy, angle, [
    { x: -radius * 0.9, y: -radius * 0.88 },
    { x: radius * 0.75, y: -radius * 0.88 },
    { x: radius, y: -radius * 0.58 },
    { x: radius, y: -radius * 0.34 },
    { x: -radius, y: -radius * 0.34 },
  ]);
  graphics.fill({ color: 0x101612 }).stroke({ width: 1, color: 0x060806 });
  polygon(graphics, sx, sy, angle, [
    { x: -radius * 0.9, y: radius * 0.34 },
    { x: radius, y: radius * 0.34 },
    { x: radius, y: radius * 0.58 },
    { x: radius * 0.75, y: radius * 0.88 },
    { x: -radius * 0.9, y: radius * 0.88 },
  ]);
  graphics.fill({ color: 0x101612 }).stroke({ width: 1, color: 0x060806 });

  polygon(graphics, sx, sy, angle, [
    { x: -radius * 0.82, y: -radius * 0.58 },
    { x: radius * 0.72, y: -radius * 0.58 },
    { x: radius, y: 0 },
    { x: radius * 0.72, y: radius * 0.58 },
    { x: -radius * 0.82, y: radius * 0.58 },
  ]);
  graphics.fill({ color }).stroke({ width: 1.5, color: 0x080b08 });

  const turret = localToScreen(sx, sy, angle, radius * 0.08, 0);
  graphics
    .circle(turret.x, turret.y, radius * 0.42)
    .fill({ color: shade(color, 0.72) })
    .stroke({ width: 1.5, color: 0x080b08 });
  const barrelEnd = localToScreen(sx, sy, angle, radius * 1.42, 0);
  graphics
    .moveTo(turret.x, turret.y)
    .lineTo(barrelEnd.x, barrelEnd.y)
    .stroke({ width: Math.max(2, radius * 0.16), color: 0x121a15 });
}

function drawHarvester(
  graphics: Graphics,
  sx: number,
  sy: number,
  radius: number,
  angle: number,
  color: number,
): void {
  polygon(graphics, sx, sy, angle, [
    { x: -radius, y: -radius * 0.7 },
    { x: radius * 0.7, y: -radius * 0.7 },
    { x: radius, y: -radius * 0.4 },
    { x: radius, y: radius * 0.4 },
    { x: radius * 0.7, y: radius * 0.7 },
    { x: -radius, y: radius * 0.7 },
  ]);
  graphics.fill({ color }).stroke({ width: 1.5, color: 0x090c09 });

  polygon(graphics, sx, sy, angle, [
    { x: -radius * 0.86, y: -radius * 0.5 },
    { x: radius * 0.18, y: -radius * 0.5 },
    { x: radius * 0.18, y: radius * 0.5 },
    { x: -radius * 0.86, y: radius * 0.5 },
  ]);
  graphics.fill({ color: 0x725621 }).stroke({ width: 1, color: 0x16130b });

  polygon(graphics, sx, sy, angle, [
    { x: radius * 0.28, y: -radius * 0.48 },
    { x: radius * 0.76, y: -radius * 0.34 },
    { x: radius * 0.76, y: radius * 0.34 },
    { x: radius * 0.28, y: radius * 0.48 },
  ]);
  graphics.fill({ color: 0x99a18b }).stroke({ width: 1, color: 0x111812 });

  const scoopLeft = localToScreen(sx, sy, angle, radius * 1.22, -radius * 0.72);
  const scoopTip = localToScreen(sx, sy, angle, radius * 1.45, 0);
  const scoopRight = localToScreen(sx, sy, angle, radius * 1.22, radius * 0.72);
  graphics
    .moveTo(scoopLeft.x, scoopLeft.y)
    .lineTo(scoopTip.x, scoopTip.y)
    .lineTo(scoopRight.x, scoopRight.y)
    .stroke({ width: Math.max(2, radius * 0.14), color: 0xc49a35 });
}

function drawInfantry(
  graphics: Graphics,
  sx: number,
  sy: number,
  radius: number,
  angle: number,
  color: number,
  engineer: boolean,
): void {
  const body = localToScreen(sx, sy, angle, -radius * 0.08, 0);
  const head = localToScreen(sx, sy, angle, radius * 0.52, 0);
  const weaponStart = localToScreen(sx, sy, angle, radius * 0.1, -radius * 0.22);
  const weaponEnd = localToScreen(sx, sy, angle, radius * 1.25, -radius * 0.22);

  graphics
    .circle(body.x, body.y, radius * 0.64)
    .fill({ color })
    .stroke({ width: 1, color: 0x080b08 })
    .circle(head.x, head.y, radius * 0.38)
    .fill({ color: shade(color, 1.18) })
    .stroke({ width: 1, color: 0x080b08 });

  if (engineer) {
    const pack = localToScreen(sx, sy, angle, -radius * 0.45, 0);
    graphics
      .rect(pack.x - radius * 0.28, pack.y - radius * 0.34, radius * 0.56, radius * 0.68)
      .fill({ color: 0xc29a3d })
      .stroke({ width: 1, color: 0x20180a });
    const toolEnd = localToScreen(sx, sy, angle, radius * 0.92, -radius * 0.48);
    graphics
      .moveTo(weaponStart.x, weaponStart.y)
      .lineTo(toolEnd.x, toolEnd.y)
      .stroke({ width: Math.max(1.5, radius * 0.18), color: 0xd0b66d });
    return;
  }

  graphics
    .moveTo(weaponStart.x, weaponStart.y)
    .lineTo(weaponEnd.x, weaponEnd.y)
    .stroke({ width: Math.max(1.5, radius * 0.2), color: 0x161b16 });
}

function polygon(graphics: Graphics, sx: number, sy: number, angle: number, points: Point[]): void {
  const [first, ...rest] = points;
  if (!first) return;
  const start = localToScreen(sx, sy, angle, first.x, first.y);
  graphics.moveTo(start.x, start.y);
  for (const point of rest) {
    const screen = localToScreen(sx, sy, angle, point.x, point.y);
    graphics.lineTo(screen.x, screen.y);
  }
  graphics.closePath();
}

function localToScreen(sx: number, sy: number, angle: number, x: number, y: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: sx + x * cos - y * sin,
    y: sy + x * sin + y * cos,
  };
}

function shade(color: number, factor: number): number {
  const red = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
  const green = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
  const blue = Math.min(255, Math.round((color & 0xff) * factor));
  return (red << 16) | (green << 8) | blue;
}
