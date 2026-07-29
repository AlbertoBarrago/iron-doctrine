import type { Graphics } from 'pixi.js';

export type DamageStage = 'none' | 'damaged' | 'critical';

export interface PersistentDamagePresentation {
  stage: DamageStage;
  overlayAlpha: number;
  smokeScale: number;
}

export function persistentDamagePresentation(
  hp: number,
  maxHp: number,
): PersistentDamagePresentation {
  if (maxHp <= 0 || hp / maxHp > 0.6) {
    return { stage: 'none', overlayAlpha: 0, smokeScale: 0 };
  }
  if (hp / maxHp > 0.3) {
    return { stage: 'damaged', overlayAlpha: 0.28, smokeScale: 0.6 };
  }
  return { stage: 'critical', overlayAlpha: 0.48, smokeScale: 1 };
}

export function shouldEmitDamageSmoke(
  stage: DamageStage,
  entityId: number,
  tick: number,
): boolean {
  if (stage === 'none') return false;
  const interval = stage === 'critical' ? 5 : 11;
  return (tick + entityId * 7) % interval === 0;
}

export function drawPersistentDamage(
  graphics: Graphics,
  x: number,
  y: number,
  radius: number,
  presentation: PersistentDamagePresentation,
): void {
  if (presentation.stage === 'none') return;
  const alpha = presentation.overlayAlpha;
  graphics
    .ellipse(x - radius * 0.18, y + radius * 0.08, radius * 0.42, radius * 0.2)
    .fill({ color: 0x100d0a, alpha })
    .moveTo(x - radius * 0.52, y - radius * 0.2)
    .lineTo(x - radius * 0.08, y + radius * 0.15)
    .lineTo(x + radius * 0.18, y - radius * 0.04)
    .stroke({
      width: Math.max(1, radius * 0.07),
      color: 0x17130f,
      alpha: Math.min(0.8, alpha + 0.2),
    });
  if (presentation.stage === 'critical') {
    graphics
      .circle(x + radius * 0.22, y - radius * 0.12, Math.max(1.5, radius * 0.1))
      .fill({ color: 0xa64d22, alpha: 0.72 });
  }
}
