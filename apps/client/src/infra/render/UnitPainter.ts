import type { Graphics } from 'pixi.js';
import type { EntitySnapshot } from '@iron/engine';
import { engineerToolMotion, infantryMotion, MATERIAL, shadeColor } from './renderStyle.js';

interface Point {
  x: number;
  y: number;
}

export interface UnitPresentation {
  animationTime: number;
  moving: boolean;
  firing: boolean;
}

export function drawUnit(
  graphics: Graphics,
  entity: EntitySnapshot,
  sx: number,
  sy: number,
  radius: number,
  color: number,
  presentation: UnitPresentation = { animationTime: 0, moving: false, firing: false },
): void {
  drawGroundShadow(graphics, sx, sy, radius, entity.unitType === 'rifleman' ? 0.72 : 1);
  switch (entity.unitType) {
    case 'tank':
      drawTank(graphics, sx, sy, radius, entity.angle, color);
      return;
    case 'harvester':
      drawHarvester(
        graphics,
        entity,
        sx,
        sy,
        radius,
        entity.angle,
        color,
        presentation.animationTime,
      );
      return;
    case 'scout':
      drawScout(graphics, sx, sy, radius, entity.angle, color);
      return;
    case 'engineer':
      drawInfantry(graphics, sx, sy, radius, entity.angle, color, 'engineer', presentation);
      return;
    case 'medic':
      drawInfantry(graphics, sx, sy, radius, entity.angle, color, 'medic', presentation, entity);
      return;
    default:
      drawInfantry(graphics, sx, sy, radius, entity.angle, color, 'rifleman', presentation);
  }
}

function drawScout(
  graphics: Graphics,
  sx: number,
  sy: number,
  radius: number,
  angle: number,
  color: number,
): void {
  for (const side of [-1, 1]) {
    for (const offset of [-0.52, 0.48]) {
      const wheel = localToScreen(sx, sy, angle, radius * offset, radius * side * 0.72);
      graphics
        .circle(wheel.x, wheel.y, radius * 0.28)
        .fill({ color: 0x0d110f })
        .stroke({ width: 1, color: MATERIAL.armorMid });
    }
  }

  polygon(graphics, sx, sy, angle, [
    { x: -radius * 0.88, y: -radius * 0.58 },
    { x: radius * 0.55, y: -radius * 0.58 },
    { x: radius, y: 0 },
    { x: radius * 0.55, y: radius * 0.58 },
    { x: -radius * 0.88, y: radius * 0.58 },
  ]);
  graphics.fill({ color }).stroke({ width: 1.25, color: MATERIAL.armorDark });

  const cabin = localToScreen(sx, sy, angle, radius * 0.12, 0);
  polygon(graphics, cabin.x, cabin.y, angle, [
    { x: -radius * 0.35, y: -radius * 0.4 },
    { x: radius * 0.34, y: -radius * 0.3 },
    { x: radius * 0.34, y: radius * 0.3 },
    { x: -radius * 0.35, y: radius * 0.4 },
  ]);
  graphics.fill({ color: MATERIAL.glass }).stroke({ width: 1, color: shadeColor(color, 0.55) });

  const antennaBase = localToScreen(sx, sy, angle, -radius * 0.48, radius * 0.28);
  const antennaTip = localToScreen(sx, sy, angle, -radius * 0.82, radius * 0.7);
  graphics
    .moveTo(antennaBase.x, antennaBase.y)
    .lineTo(antennaTip.x, antennaTip.y)
    .stroke({ width: Math.max(1, radius * 0.08), color: MATERIAL.armorLight })
    .circle(antennaTip.x, antennaTip.y, radius * 0.08)
    .fill({ color: MATERIAL.amber });
}

function drawGroundShadow(
  graphics: Graphics,
  sx: number,
  sy: number,
  radius: number,
  scale: number,
): void {
  graphics
    .ellipse(sx + radius * 0.18, sy + radius * 0.32, radius * 1.12 * scale, radius * 0.62 * scale)
    .fill({ color: MATERIAL.shadow, alpha: 0.42 });
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

  polygon(graphics, sx, sy, angle, [
    { x: -radius * 0.68, y: -radius * 0.46 },
    { x: radius * 0.5, y: -radius * 0.46 },
    { x: radius * 0.76, y: 0 },
    { x: radius * 0.5, y: radius * 0.46 },
    { x: -radius * 0.68, y: radius * 0.46 },
  ]);
  graphics.fill({ color: shadeColor(color, 1.08) }).stroke({ width: 1, color: MATERIAL.armorDark });

  const turret = localToScreen(sx, sy, angle, radius * 0.08, 0);
  graphics
    .circle(turret.x, turret.y, radius * 0.42)
    .fill({ color: shadeColor(color, 0.72) })
    .stroke({ width: 1.5, color: 0x080b08 });
  const barrelEnd = localToScreen(sx, sy, angle, radius * 1.42, 0);
  graphics
    .moveTo(turret.x, turret.y)
    .lineTo(barrelEnd.x, barrelEnd.y)
    .stroke({ width: Math.max(2, radius * 0.16), color: 0x121a15 });
  const hatch = localToScreen(sx, sy, angle, -radius * 0.02, radius * 0.12);
  graphics
    .circle(hatch.x, hatch.y, radius * 0.17)
    .fill({ color: MATERIAL.armorMid })
    .stroke({ width: 1, color: MATERIAL.armorDark });
  const factionPlate = localToScreen(sx, sy, angle, -radius * 0.42, -radius * 0.5);
  graphics
    .rect(
      factionPlate.x - radius * 0.12,
      factionPlate.y - radius * 0.06,
      radius * 0.24,
      radius * 0.12,
    )
    .fill({ color: MATERIAL.factionRed });
}

function drawHarvester(
  graphics: Graphics,
  entity: EntitySnapshot,
  sx: number,
  sy: number,
  radius: number,
  angle: number,
  color: number,
  animationTime: number,
): void {
  const cargoRatio = entity.cargo ? entity.cargo.amount / entity.cargo.capacity : 0;
  const gathering = entity.cargo?.phase === 'gathering';
  const depositing = entity.cargo?.phase === 'depositing';
  const scoopStroke = gathering ? 0xdcc160 : 0xc49a35;
  const scoopTravel = gathering ? (Math.sin(animationTime * 9) + 1) * radius * 0.08 : 0;

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
  graphics.fill({ color: 0x292619 }).stroke({ width: 1, color: 0x16130b });

  const oreSlots = [
    { x: -0.63, y: -0.28 },
    { x: -0.28, y: 0.24 },
    { x: -0.02, y: -0.2 },
    { x: -0.55, y: 0.3 },
    { x: -0.22, y: -0.05 },
  ];
  const visibleOre = Math.ceil(cargoRatio * oreSlots.length);
  for (let index = 0; index < visibleOre; index++) {
    const slot = oreSlots[index]!;
    const ore = localToScreen(sx, sy, angle, radius * slot.x, radius * slot.y);
    graphics
      .circle(ore.x, ore.y, radius * (0.12 + (index % 2) * 0.025))
      .fill({ color: index % 2 === 0 ? 0xd2a63a : 0xa87924 })
      .stroke({ width: 1, color: 0x4e3712 });
  }

  polygon(graphics, sx, sy, angle, [
    { x: radius * 0.28, y: -radius * 0.48 },
    { x: radius * 0.76, y: -radius * 0.34 },
    { x: radius * 0.76, y: radius * 0.34 },
    { x: radius * 0.28, y: radius * 0.48 },
  ]);
  graphics.fill({ color: 0x99a18b }).stroke({ width: 1, color: 0x111812 });

  const scoopLeft = localToScreen(sx, sy, angle, radius * 1.22 + scoopTravel, -radius * 0.72);
  const scoopTip = localToScreen(sx, sy, angle, radius * 1.45 + scoopTravel, 0);
  const scoopRight = localToScreen(sx, sy, angle, radius * 1.22 + scoopTravel, radius * 0.72);
  graphics
    .moveTo(scoopLeft.x, scoopLeft.y)
    .lineTo(scoopTip.x, scoopTip.y)
    .lineTo(scoopRight.x, scoopRight.y)
    .stroke({ width: Math.max(2, radius * 0.14), color: scoopStroke });

  if (gathering) {
    const pulse = 0.55 + (Math.sin(animationTime * 12) + 1) * 0.2;
    graphics
      .circle(scoopTip.x, scoopTip.y, radius * 0.2)
      .stroke({ width: Math.max(1.5, radius * 0.09), color: 0xe4bf4c, alpha: pulse });
  }

  if (depositing) {
    for (let index = 0; index < 3; index++) {
      const transfer = localToScreen(
        sx,
        sy,
        angle,
        -radius * (1.05 + index * 0.18),
        Math.sin(animationTime * 10 + index) * radius * 0.24,
      );
      graphics
        .circle(transfer.x, transfer.y, radius * 0.1)
        .fill({ color: 0xe0b43f, alpha: 0.9 - index * 0.2 });
    }
  }
}

function drawInfantry(
  graphics: Graphics,
  sx: number,
  sy: number,
  radius: number,
  angle: number,
  color: number,
  role: 'rifleman' | 'engineer' | 'medic',
  presentation: UnitPresentation,
  entity?: EntitySnapshot,
): void {
  const motion = infantryMotion(
    presentation.animationTime + sx * 0.013 + sy * 0.007,
    presentation.moving,
    presentation.firing,
  );
  const bob = radius * motion.bob;
  const bodyX = sx + Math.cos(angle) * bob;
  const bodyY = sy + Math.sin(angle) * bob;
  const stride = radius * motion.gait * 0.28;
  const head = localToScreen(bodyX, bodyY, angle, radius * 0.62, 0);
  const leftFoot = localToScreen(sx, sy, angle, -radius * 0.82 + stride, -radius * 0.32);
  const rightFoot = localToScreen(sx, sy, angle, -radius * 0.82 - stride, radius * 0.32);
  const hip = localToScreen(bodyX, bodyY, angle, -radius * 0.25, 0);
  const weaponStart = localToScreen(bodyX, bodyY, angle, radius * 0.02, -radius * 0.35);
  const weaponEnd = localToScreen(
    bodyX,
    bodyY,
    angle,
    radius * (1.3 - motion.recoil),
    -radius * 0.35,
  );

  graphics
    .moveTo(hip.x, hip.y)
    .lineTo(leftFoot.x, leftFoot.y)
    .moveTo(hip.x, hip.y)
    .lineTo(rightFoot.x, rightFoot.y)
    .stroke({ width: Math.max(1.5, radius * 0.24), color: MATERIAL.armorDark });

  polygon(graphics, bodyX, bodyY, angle, [
    { x: -radius * 0.42, y: -radius * 0.42 },
    { x: radius * 0.25, y: -radius * 0.55 },
    { x: radius * 0.52, y: -radius * 0.28 },
    { x: radius * 0.52, y: radius * 0.28 },
    { x: radius * 0.25, y: radius * 0.55 },
    { x: -radius * 0.42, y: radius * 0.42 },
  ]);
  graphics
    .fill({ color: shadeColor(color, role === 'engineer' ? 0.83 : 0.92) })
    .stroke({ width: 1.25, color: 0x080b08 });

  const leftShoulder = localToScreen(bodyX, bodyY, angle, radius * 0.12, -radius * 0.58);
  const rightShoulder = localToScreen(bodyX, bodyY, angle, radius * 0.12, radius * 0.58);
  graphics
    .circle(leftShoulder.x, leftShoulder.y, radius * 0.16)
    .circle(rightShoulder.x, rightShoulder.y, radius * 0.16)
    .fill({ color: shadeColor(color, 0.62) })
    .circle(head.x, head.y, radius * 0.3)
    .fill({ color: shadeColor(color, 1.16) })
    .stroke({ width: 1, color: 0x080b08 });
  const helmetBandStart = localToScreen(bodyX, bodyY, angle, radius * 0.6, -radius * 0.27);
  const helmetBandEnd = localToScreen(bodyX, bodyY, angle, radius * 0.6, radius * 0.27);
  graphics
    .moveTo(helmetBandStart.x, helmetBandStart.y)
    .lineTo(helmetBandEnd.x, helmetBandEnd.y)
    .stroke({ width: Math.max(1, radius * 0.11), color: MATERIAL.factionRed });

  if (role === 'engineer') {
    const toolMotion = engineerToolMotion(presentation.animationTime, presentation.moving);
    const pack = localToScreen(bodyX, bodyY, angle, -radius * 0.48, 0);
    graphics
      .rect(pack.x - radius * 0.29, pack.y - radius * 0.38, radius * 0.58, radius * 0.76)
      .fill({ color: MATERIAL.copper })
      .stroke({ width: 1, color: MATERIAL.armorDark });
    graphics.circle(pack.x, pack.y - radius * 0.17, radius * 0.08).fill({ color: MATERIAL.amber });
    const toolEnd = localToScreen(
      bodyX,
      bodyY,
      angle,
      radius * 0.94,
      radius * (-0.48 + toolMotion.swing),
    );
    graphics
      .moveTo(weaponStart.x, weaponStart.y)
      .lineTo(toolEnd.x, toolEnd.y)
      .stroke({ width: Math.max(1.5, radius * 0.18), color: MATERIAL.copper });
    graphics
      .circle(toolEnd.x, toolEnd.y, radius * 0.1)
      .stroke({ width: 1.5, color: MATERIAL.amber });
    if (toolMotion.pulse > 0) {
      graphics
        .circle(toolEnd.x, toolEnd.y, radius * (0.12 + toolMotion.pulse * 0.12))
        .fill({ color: 0xf5d675, alpha: toolMotion.pulse * 0.7 });
    }
    return;
  }

  if (role === 'medic') {
    const treating = entity?.healingTarget !== undefined;
    const treatmentPulse = treating ? (Math.sin(presentation.animationTime * 10) + 1) / 2 : 0;
    const bag = localToScreen(bodyX, bodyY, angle, -radius * 0.48, 0);
    graphics
      .rect(bag.x - radius * 0.3, bag.y - radius * 0.38, radius * 0.6, radius * 0.76)
      .fill({ color: 0xd0c9a6 })
      .stroke({ width: 1, color: MATERIAL.armorDark });
    graphics
      .rect(bag.x - radius * 0.07, bag.y - radius * 0.24, radius * 0.14, radius * 0.48)
      .rect(bag.x - radius * 0.24, bag.y - radius * 0.07, radius * 0.48, radius * 0.14)
      .fill({ color: 0x9f2f2a });

    const injector = localToScreen(
      bodyX,
      bodyY,
      angle,
      radius * (0.82 + treatmentPulse * 0.18),
      -radius * 0.42,
    );
    graphics
      .moveTo(weaponStart.x, weaponStart.y)
      .lineTo(injector.x, injector.y)
      .stroke({ width: Math.max(1.5, radius * 0.16), color: 0xb9c5b0 });
    if (treating) {
      graphics
        .circle(injector.x, injector.y, radius * (0.12 + treatmentPulse * 0.18))
        .stroke({ width: 1.5, color: 0x8fd18b, alpha: 0.6 + treatmentPulse * 0.35 });
    }
    return;
  }

  graphics
    .moveTo(weaponStart.x, weaponStart.y)
    .lineTo(weaponEnd.x, weaponEnd.y)
    .stroke({ width: Math.max(1.5, radius * 0.2), color: MATERIAL.armorDark });
  const magazine = localToScreen(
    bodyX,
    bodyY,
    angle,
    radius * (0.52 - motion.recoil),
    -radius * 0.27,
  );
  graphics
    .rect(magazine.x - radius * 0.06, magazine.y - radius * 0.04, radius * 0.12, radius * 0.24)
    .fill({ color: MATERIAL.armorMid });
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
