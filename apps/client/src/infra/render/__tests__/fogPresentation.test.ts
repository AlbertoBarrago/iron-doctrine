import { describe, expect, it } from 'vitest';
import {
  FOG_TRANSITION_BANDS,
  fogCornerTransitionState,
  fogTransitionAlpha,
  fogTransitionState,
} from '../fogPresentation.js';

describe('battlefield fog presentation', () => {
  const cells = new Uint8Array([0, 0, 0, 0, 2, 1, 0, 1, 1]);

  it('adds transitions only toward never-explored terrain', () => {
    expect(fogTransitionState(cells, 3, 3, 2, 2, 1)).toBeNull();
    expect(fogTransitionState(cells, 3, 3, 2, 0, 1)).toBe(0);
    expect(fogTransitionState(cells, 3, 3, 1, 1, 1)).toBeNull();
    expect(fogTransitionState(cells, 3, 3, 0, 1, 1)).toBeNull();
  });

  it('treats positions outside the map as fully hidden', () => {
    expect(fogTransitionState(cells, 3, 3, 2, -1, 1)).toBe(0);
    expect(fogTransitionState(cells, 3, 3, 1, 3, 1)).toBe(0);
  });

  it('rounds diagonal contacts and corners without scalloping straight edges', () => {
    const diagonalContact = new Uint8Array([0, 2, 2, 2]);
    const straightEdge = new Uint8Array([0, 0, 2, 2]);
    const concaveCorner = new Uint8Array([0, 0, 0, 2]);

    expect(fogCornerTransitionState(diagonalContact, 2, 2, 2, 1, 1, 'north-west')).toBe(0);
    expect(fogCornerTransitionState(straightEdge, 2, 2, 2, 1, 1, 'north-west')).toBeNull();
    expect(fogCornerTransitionState(concaveCorner, 2, 2, 2, 1, 1, 'north-west')).toBe(0);
    expect(fogCornerTransitionState(concaveCorner, 2, 2, 0, 0, 0, 'south-east')).toBeNull();
  });

  it('fades monotonically from hidden terrain', () => {
    const hidden = Array.from({ length: FOG_TRANSITION_BANDS }, (_, band) =>
      fogTransitionAlpha(0, band),
    );
    const explored = Array.from({ length: FOG_TRANSITION_BANDS }, (_, band) =>
      fogTransitionAlpha(1, band),
    );

    expect(hidden.every((alpha, index) => index === 0 || alpha < hidden[index - 1]!)).toBe(true);
    expect(explored).toEqual([0, 0, 0, 0]);
    expect(fogTransitionAlpha(0, FOG_TRANSITION_BANDS)).toBe(0);
  });
});
