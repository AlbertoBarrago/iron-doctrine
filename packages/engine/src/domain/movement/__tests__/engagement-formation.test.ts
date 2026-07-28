import { describe, expect, it } from 'vitest';
import * as fp from '../../math/fixed.js';
import { engagementPosition } from '../engagement-formation.js';

describe('engagement formation', () => {
  it('assigns distinct positions across multiple rings', () => {
    const positions = Array.from({ length: 32 }, (_, index) =>
      engagementPosition(
        { x: fp.FP.ZERO, y: fp.FP.ZERO },
        index,
        fp.fromInt(6),
        fp.fromFloat(0.5),
        fp.fromInt(1),
      ),
    );

    expect(new Set(positions.map(({ x, y }) => `${x}:${y}`)).size).toBe(32);
  });

  it('never places an attacker inside the target clearance', () => {
    const position = engagementPosition(
      { x: fp.FP.ZERO, y: fp.FP.ZERO },
      64,
      fp.fromInt(6),
      fp.fromFloat(0.5),
      fp.fromInt(1),
    );

    const distance = fp.sqrt(
      fp.add(fp.mul(position.x, position.x), fp.mul(position.y, position.y)),
    );
    expect(fp.toFloat(distance)).toBeGreaterThanOrEqual(1.75);
  });
});
