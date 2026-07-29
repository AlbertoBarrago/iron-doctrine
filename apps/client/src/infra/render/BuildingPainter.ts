import type { EntitySnapshot } from '@iron/engine';
import type { Graphics } from 'pixi.js';
import { materialRamp, MATERIAL, shadeColor } from './renderStyle.js';

export interface WallConnections {
  north: boolean;
  east: boolean;
  south: boolean;
  west: boolean;
}

export interface BuildingPresentation {
  animationTime: number;
  constructionProgress: number;
}

export function drawBuilding(
  graphics: Graphics,
  entity: EntitySnapshot,
  x: number,
  y: number,
  size: number,
  factionColor: number,
  wallConnections?: WallConnections,
  presentation: BuildingPresentation = { animationTime: 0, constructionProgress: 1 },
): void {
  const alpha = entity.construction ? 0.72 : 1;
  if (entity.buildingType === 'concrete_wall') {
    drawConcreteWall(graphics, x, y, size, factionColor, alpha, wallConnections);
    return;
  }
  drawBuildingShadow(graphics, x, y, size);
  drawFoundation(graphics, x, y, size);

  switch (entity.buildingType) {
    case 'construction_yard':
      drawConstructionYard(graphics, x, y, size, factionColor, alpha, presentation.animationTime);
      break;
    case 'power_plant':
      drawPowerPlant(graphics, x, y, size, factionColor, alpha, presentation.animationTime);
      break;
    case 'barracks':
      drawBarracks(graphics, x, y, size, factionColor, alpha);
      break;
    case 'factory':
      drawFactory(graphics, x, y, size, factionColor, alpha, presentation.animationTime);
      break;
    case 'turret':
      drawTurret(graphics, x, y, size, factionColor, alpha, entity.angle);
      break;
    default:
      graphics
        .rect(x - size * 0.82, y - size * 0.82, size * 1.64, size * 1.64)
        .fill({ color: factionColor, alpha })
        .stroke({ width: 2, color: 0x080b09 });
  }

  drawFactionMark(graphics, x, y, size, factionColor);
  if (entity.construction) {
    drawConstructionScaffold(graphics, x, y, size, presentation.constructionProgress);
  }
}

function drawBuildingShadow(graphics: Graphics, x: number, y: number, size: number): void {
  graphics
    .moveTo(x - size * 0.85, y - size * 0.78)
    .lineTo(x + size * 1.18, y - size * 0.52)
    .lineTo(x + size * 1.25, y + size * 1.02)
    .lineTo(x - size * 0.58, y + size * 1.08)
    .closePath()
    .fill({ color: MATERIAL.shadow, alpha: 0.46 });
}

function drawConcreteWall(
  graphics: Graphics,
  x: number,
  y: number,
  size: number,
  color: number,
  alpha: number,
  connections: WallConnections = { north: false, east: false, south: false, west: false },
): void {
  const concrete = MATERIAL.concrete;
  const edge = 0x171c19;
  const halfWidth = size * 0.34;
  graphics
    .rect(x - size * 0.82, y - size * 0.82, size * 1.64, size * 1.64)
    .fill({ color: edge, alpha });

  const drawArm = (armX: number, armY: number, width: number, height: number): void => {
    graphics
      .rect(armX, armY, width, height)
      .fill({ color: concrete, alpha })
      .stroke({ width: 1, color: 0x252c27, alpha });
  };
  drawArm(x - halfWidth, y - halfWidth, halfWidth * 2, halfWidth * 2);
  if (connections.north) drawArm(x - halfWidth, y - size, halfWidth * 2, size - halfWidth);
  if (connections.east) drawArm(x + halfWidth, y - halfWidth, size - halfWidth, halfWidth * 2);
  if (connections.south) drawArm(x - halfWidth, y + halfWidth, halfWidth * 2, size - halfWidth);
  if (connections.west) drawArm(x - size, y - halfWidth, size - halfWidth, halfWidth * 2);

  graphics
    .rect(x - halfWidth * 0.62, y - halfWidth * 0.62, halfWidth * 1.24, halfWidth * 1.24)
    .fill({ color: shadeColor(color, 1.16), alpha })
    .stroke({ width: 1, color: 0x2b2410, alpha });
}

function drawFoundation(graphics: Graphics, x: number, y: number, size: number): void {
  graphics
    .rect(x - size, y - size, size * 2, size * 2)
    .fill({ color: MATERIAL.concreteDark })
    .stroke({ width: 2, color: MATERIAL.shadow });
  graphics
    .moveTo(x - size * 0.94, y - size * 0.92)
    .lineTo(x + size * 0.92, y - size * 0.92)
    .lineTo(x + size * 0.92, y + size * 0.88)
    .stroke({ width: Math.max(1, size * 0.055), color: MATERIAL.concreteLight, alpha: 0.5 });
  graphics
    .moveTo(x - size * 0.94, y + size * 0.92)
    .lineTo(x + size * 0.96, y + size * 0.92)
    .stroke({ width: Math.max(2, size * 0.09), color: MATERIAL.shadow, alpha: 0.75 });
  graphics
    .moveTo(x - size * 0.9, y + size * 0.72)
    .lineTo(x + size * 0.9, y + size * 0.72)
    .stroke({ width: Math.max(2, size * 0.08), color: 0x353c37 });
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
  animationTime: number,
): void {
  const ramp = materialRamp(color);
  graphics
    .rect(x - size * 0.72, y - size * 0.7, size * 1.44, size * 1.4)
    .fill({ color: shadeColor(color, 0.62), alpha })
    .stroke({ width: 2, color: 0x090c0a });
  drawRoofEdge(graphics, x, y - size * 0.7, size * 0.72, ramp.edge, alpha);
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
  const hookY = y + size * (0.25 + Math.sin(animationTime * 1.6) * 0.12);
  graphics
    .moveTo(x + size * 0.62, y - size * 0.92)
    .lineTo(x + size * 0.62, hookY)
    .stroke({ width: Math.max(1, size * 0.035), color: MATERIAL.armorLight, alpha });
  graphics
    .circle(x + size * 0.62, hookY, size * 0.08)
    .stroke({ width: Math.max(1.5, size * 0.045), color: MATERIAL.amber, alpha });
  drawHazardStripe(graphics, x - size * 0.5, y + size * 0.58, size * 0.58, alpha);
  drawRoofPanel(graphics, x - size * 0.22, y - size * 0.38, size * 0.5, size * 0.22, alpha);
}

function drawPowerPlant(
  graphics: Graphics,
  x: number,
  y: number,
  size: number,
  color: number,
  alpha: number,
  animationTime: number,
): void {
  const ramp = materialRamp(color);
  graphics
    .rect(x - size * 0.72, y - size * 0.55, size * 1.44, size * 1.12)
    .fill({ color: shadeColor(color, 0.72), alpha })
    .stroke({ width: 2, color: 0x080b09 });
  drawRoofEdge(graphics, x, y - size * 0.55, size * 0.72, ramp.edge, alpha);
  const pulse = 0.72 + (Math.sin(animationTime * 4) + 1) * 0.14;
  for (const dx of [-0.38, 0.38]) {
    graphics
      .circle(x + size * dx, y, size * 0.28)
      .fill({ color: 0x202a24, alpha })
      .stroke({ width: 2, color: MATERIAL.copper, alpha });
    graphics
      .circle(x + size * dx, y, size * 0.09)
      .fill({ color: MATERIAL.amber, alpha: alpha * pulse });
  }
  graphics
    .rect(x - size * 0.48, y - size * 0.88, size * 0.18, size * 0.42)
    .rect(x + size * 0.3, y - size * 0.88, size * 0.18, size * 0.42)
    .fill({ color: 0x3f4942, alpha })
    .stroke({ width: 1, color: 0x090c0a });
  for (const dx of [-0.55, 0.55]) {
    graphics
      .moveTo(x + size * dx, y - size * 0.46)
      .lineTo(x + size * dx, y + size * 0.46)
      .stroke({ width: Math.max(2, size * 0.08), color: MATERIAL.copper, alpha });
  }
}

function drawBarracks(
  graphics: Graphics,
  x: number,
  y: number,
  size: number,
  color: number,
  alpha: number,
): void {
  const ramp = materialRamp(color);
  graphics
    .rect(x - size * 0.74, y - size * 0.7, size * 1.48, size * 1.4)
    .fill({ color: shadeColor(color, 0.7), alpha })
    .stroke({ width: 2, color: 0x080b09 });
  drawRoofEdge(graphics, x, y - size * 0.7, size * 0.74, ramp.edge, alpha);
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
  animationTime: number,
): void {
  const ramp = materialRamp(color);
  graphics
    .rect(x - size * 0.82, y - size * 0.68, size * 1.64, size * 1.36)
    .fill({ color: shadeColor(color, 0.6), alpha })
    .stroke({ width: 2, color: 0x080b09 });
  drawRoofEdge(graphics, x, y - size * 0.68, size * 0.82, ramp.edge, alpha);
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
  const doorLight = 0.55 + (Math.sin(animationTime * 2.5) + 1) * 0.2;
  for (const dx of [-0.68, 0.68]) {
    graphics
      .circle(x + size * dx, y + size * 0.35, size * 0.055)
      .fill({ color: MATERIAL.amber, alpha: alpha * doorLight });
  }
  graphics
    .rect(x - size * 0.74, y - size * 0.86, size * 0.28, size * 0.35)
    .fill({ color: 0x4f5951, alpha });
  drawHazardStripe(graphics, x, y + size * 0.53, size * 0.74, alpha);
}

function drawTurret(
  graphics: Graphics,
  x: number,
  y: number,
  size: number,
  color: number,
  alpha: number,
  angle: number,
): void {
  const barrelX = x + Math.cos(angle) * size * 1.06;
  const barrelY = y + Math.sin(angle) * size * 1.06;
  graphics
    .circle(x, y, size * 0.7)
    .fill({ color: shadeColor(color, 0.55), alpha })
    .stroke({ width: 2, color: 0x080b09 });
  graphics
    .circle(x, y, size * 0.42)
    .fill({ color: 0x303a34, alpha })
    .stroke({ width: 2, color: shadeColor(color, 1.15), alpha });
  graphics
    .moveTo(x, y)
    .lineTo(barrelX, barrelY)
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
    .fill({ color: shadeColor(color, 1.35) })
    .stroke({ width: 1, color: 0x17130a });
}

function drawRoofPanel(
  graphics: Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  alpha: number,
): void {
  graphics
    .rect(x - width / 2, y - height / 2, width, height)
    .fill({ color: MATERIAL.armorMid, alpha })
    .stroke({ width: 1, color: MATERIAL.armorLight, alpha });
  for (const offset of [-0.25, 0, 0.25]) {
    graphics
      .moveTo(x + width * offset, y - height * 0.36)
      .lineTo(x + width * offset, y + height * 0.36)
      .stroke({ width: 1, color: MATERIAL.armorDark, alpha });
  }
}

function drawConstructionScaffold(
  graphics: Graphics,
  x: number,
  y: number,
  size: number,
  progress: number,
): void {
  const height = size * (0.35 + progress * 1.25);
  const top = y + size * 0.76 - height;
  const left = x - size * 0.88;
  const right = x + size * 0.88;
  graphics
    .moveTo(left, y + size * 0.78)
    .lineTo(left, top)
    .lineTo(right, top)
    .lineTo(right, y + size * 0.78)
    .moveTo(left, top)
    .lineTo(right, y + size * 0.78)
    .moveTo(right, top)
    .lineTo(left, y + size * 0.78)
    .stroke({ width: Math.max(1, size * 0.045), color: MATERIAL.copper, alpha: 0.88 });
}

export function drawBuildingConstructionOverlay(
  graphics: Graphics,
  x: number,
  y: number,
  size: number,
  progress: number,
): void {
  drawConstructionScaffold(graphics, x, y, size, progress);
}

function drawRoofEdge(
  graphics: Graphics,
  x: number,
  y: number,
  halfWidth: number,
  color: number,
  alpha: number,
): void {
  graphics
    .moveTo(x - halfWidth, y)
    .lineTo(x + halfWidth, y)
    .stroke({ width: Math.max(1, halfWidth * 0.055), color, alpha: alpha * 0.78 });
}

function drawHazardStripe(
  graphics: Graphics,
  x: number,
  y: number,
  halfWidth: number,
  alpha: number,
): void {
  graphics
    .moveTo(x - halfWidth, y)
    .lineTo(x + halfWidth, y)
    .stroke({ width: Math.max(2, halfWidth * 0.16), color: MATERIAL.armorDark, alpha });
  const step = (halfWidth * 2) / 6;
  for (let index = 0; index < 6; index += 2) {
    const start = x - halfWidth + index * step;
    graphics
      .moveTo(start, y)
      .lineTo(Math.min(start + step, x + halfWidth), y)
      .stroke({ width: Math.max(1, halfWidth * 0.08), color: MATERIAL.amber, alpha });
  }
}
