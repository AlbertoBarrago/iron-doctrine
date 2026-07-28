import * as fp from '../math/fixed.js';
import * as v2 from '../math/vec2.js';

const RAW_DIRECTIONS: readonly v2.Vec2[] = [
  { x: fp.fromInt(2), y: fp.FP.ZERO },
  { x: fp.fromInt(2), y: fp.FP.ONE },
  { x: fp.FP.ONE, y: fp.FP.ONE },
  { x: fp.FP.ONE, y: fp.fromInt(2) },
  { x: fp.FP.ZERO, y: fp.fromInt(2) },
  { x: fp.neg(fp.FP.ONE), y: fp.fromInt(2) },
  { x: fp.neg(fp.FP.ONE), y: fp.FP.ONE },
  { x: fp.fromInt(-2), y: fp.FP.ONE },
  { x: fp.fromInt(-2), y: fp.FP.ZERO },
  { x: fp.fromInt(-2), y: fp.neg(fp.FP.ONE) },
  { x: fp.neg(fp.FP.ONE), y: fp.neg(fp.FP.ONE) },
  { x: fp.neg(fp.FP.ONE), y: fp.fromInt(-2) },
  { x: fp.FP.ZERO, y: fp.fromInt(-2) },
  { x: fp.FP.ONE, y: fp.fromInt(-2) },
  { x: fp.FP.ONE, y: fp.neg(fp.FP.ONE) },
  { x: fp.fromInt(2), y: fp.neg(fp.FP.ONE) },
];

const DIRECTIONS = RAW_DIRECTIONS.map(v2.normalize);
const SLOTS_PER_RING = DIRECTIONS.length;
const RANGE_STANDOFF = fp.fromFloat(0.78);
const RING_GAP = fp.fromFloat(0.25);
const TARGET_GAP = fp.fromFloat(0.25);

export function engagementPosition(
  target: v2.Vec2,
  formationIndex: number,
  weaponRange: fp.Fixed,
  unitRadius: fp.Fixed,
  targetRadius: fp.Fixed,
): v2.Vec2 {
  const index = Math.max(0, formationIndex);
  const ring = Math.floor(index / SLOTS_PER_RING);
  const direction = DIRECTIONS[index % SLOTS_PER_RING]!;
  const idealStandoff = fp.sub(
    fp.mul(weaponRange, RANGE_STANDOFF),
    fp.mul(fp.fromInt(ring), fp.add(fp.mul(unitRadius, fp.fromInt(2)), RING_GAP)),
  );
  const minimumStandoff = fp.add(fp.add(unitRadius, targetRadius), TARGET_GAP);
  const standoff = fp.max(idealStandoff, minimumStandoff);
  return v2.add(target, v2.scale(direction, standoff));
}
