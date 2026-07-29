import type { Graphics } from 'pixi.js';

interface OreFragment {
  x: number;
  y: number;
  radius: number;
  color: number;
}

const ORE_FRAGMENTS: readonly OreFragment[] = [
  { x: -0.82, y: 0.12, radius: 0.42, color: 0x9b6c22 },
  { x: -0.46, y: -0.48, radius: 0.5, color: 0xc08b2d },
  { x: 0.04, y: 0.28, radius: 0.62, color: 0xb57a20 },
  { x: 0.48, y: -0.38, radius: 0.48, color: 0xd0a13a },
  { x: 0.86, y: 0.2, radius: 0.36, color: 0x8f611f },
  { x: 0.42, y: 0.66, radius: 0.3, color: 0xe0b54b },
  { x: -0.42, y: 0.7, radius: 0.28, color: 0x80541c },
];

export function drawResourceField(
  graphics: Graphics,
  sx: number,
  sy: number,
  radius: number,
  entityId: number,
): void {
  const mirrored = entityId % 2 === 0 ? 1 : -1;
  const rotation = ((entityId * 0.61803398875) % 1) * Math.PI;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  graphics
    .ellipse(sx + radius * 0.08, sy + radius * 0.18, radius * 1.18, radius * 0.7)
    .fill({ color: 0x342b1c, alpha: 0.32 })
    .ellipse(sx - radius * 0.05, sy + radius * 0.04, radius * 1.02, radius * 0.56)
    .stroke({ width: Math.max(1, radius * 0.08), color: 0x79603a, alpha: 0.46 });

  for (const offset of [-0.44, -0.12, 0.22, 0.5]) {
    graphics
      .moveTo(
        sx + cos * radius * offset - sin * radius * 0.72,
        sy + sin * radius * offset + cos * radius * 0.72,
      )
      .lineTo(
        sx + cos * radius * (offset + 0.18) + sin * radius * 0.65,
        sy + sin * radius * (offset + 0.18) - cos * radius * 0.65,
      )
      .stroke({ width: Math.max(1, radius * 0.035), color: 0x3e3424, alpha: 0.42 });
  }

  for (const fragment of ORE_FRAGMENTS) {
    const x = sx + fragment.x * radius * 0.72 * mirrored;
    const y = sy + fragment.y * radius * 0.62;
    const fragmentRadius = fragment.radius * radius * 0.38;

    graphics
      .ellipse(
        x + fragmentRadius * 0.16,
        y + fragmentRadius * 0.28,
        fragmentRadius * 1.05,
        fragmentRadius * 0.62,
      )
      .fill({ color: 0x17140e, alpha: 0.48 });

    graphics
      .ellipse(x, y + fragmentRadius * 0.38, fragmentRadius * 1.12, fragmentRadius * 0.52)
      .fill({ color: 0x5a472c, alpha: 0.38 });

    graphics
      .moveTo(x, y - fragmentRadius)
      .lineTo(x + fragmentRadius * 0.9, y - fragmentRadius * 0.1)
      .lineTo(x + fragmentRadius * 0.5, y + fragmentRadius * 0.8)
      .lineTo(x - fragmentRadius * 0.62, y + fragmentRadius * 0.72)
      .lineTo(x - fragmentRadius, y - fragmentRadius * 0.18)
      .closePath()
      .fill({ color: fragment.color })
      .stroke({ width: Math.max(1, radius * 0.08), color: 0x4a3218, alpha: 0.9 });

    graphics
      .moveTo(x - fragmentRadius * 0.42, y - fragmentRadius * 0.2)
      .lineTo(x, y - fragmentRadius * 0.68)
      .lineTo(x + fragmentRadius * 0.38, y - fragmentRadius * 0.18)
      .stroke({
        width: Math.max(1, radius * 0.09),
        color: 0xf1c85c,
        alpha: 0.72,
      });
  }

  for (const offset of [-0.76, 0.72]) {
    const chipX = sx + radius * offset;
    const chipY = sy + radius * (offset > 0 ? 0.52 : -0.44);
    graphics
      .circle(chipX, chipY, radius * 0.09)
      .fill({ color: offset > 0 ? 0xa87924 : 0x76501d })
      .stroke({ width: 1, color: 0x4a3218, alpha: 0.8 });
  }
}
