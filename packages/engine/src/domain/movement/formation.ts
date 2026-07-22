/**
 * Formation slot assignment. When several units are ordered to the same point they
 * would otherwise pile onto one cell and fight the collision/pathing. Instead we spread
 * them across a compact grid of slots centred on the destination. Deterministic: slot
 * order is fixed, and callers assign slots to id-sorted units.
 */
import * as fp from '../math/fixed.js';
import type { Fixed } from '../math/fixed.js';
import type { Vec2 } from '../math/vec2.js';

/**
 * Generates `count` slot positions in a centred square grid around `center`.
 * Spacing is in world units. Slots are ordered row-major from the top-left, which is
 * stable across machines.
 */
export function computeFormationSlots(count: number, center: Vec2, spacingUnits: number): Vec2[] {
  if (count <= 1) return [center];
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const spacing = fp.fromInt(spacingUnits);
  // Offset so the grid is centred on `center`.
  const halfW = fp.mul(fp.fromInt(cols - 1), fp.div(spacing, fp.fromInt(2)));
  const halfH = fp.mul(fp.fromInt(rows - 1), fp.div(spacing, fp.fromInt(2)));

  const slots: Vec2[] = [];
  for (let r = 0; r < rows && slots.length < count; r++) {
    for (let c = 0; c < cols && slots.length < count; c++) {
      const dx: Fixed = fp.sub(fp.mul(fp.fromInt(c), spacing), halfW);
      const dy: Fixed = fp.sub(fp.mul(fp.fromInt(r), spacing), halfH);
      slots.push({ x: fp.add(center.x, dx), y: fp.add(center.y, dy) });
    }
  }
  return slots;
}
