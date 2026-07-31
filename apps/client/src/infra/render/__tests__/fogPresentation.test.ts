import { describe, expect, it } from 'vitest';
import {
  FOG_TRANSITION_BANDS,
  fogTransitionAlpha,
  fogTransitionState,
} from '../fogPresentation.js';

describe('battlefield fog presentation', () => {
  const cells = new Uint8Array([0, 0, 0, 0, 2, 1, 0, 1, 1]);

  it('adds transitions only toward darker neighbouring states', () => {
    expect(fogTransitionState(cells, 3, 3, 2, 2, 1)).toBe(1);
    expect(fogTransitionState(cells, 3, 3, 1, 1, 1)).toBeNull();
    expect(fogTransitionState(cells, 3, 3, 0, 1, 1)).toBeNull();
  });

  it('treats positions outside the map as fully hidden', () => {
    expect(fogTransitionState(cells, 3, 3, 2, -1, 1)).toBe(0);
    expect(fogTransitionState(cells, 3, 3, 1, 3, 1)).toBe(0);
  });

  it('fades monotonically into known terrain without weakening hidden edges', () => {
    const hidden = Array.from({ length: FOG_TRANSITION_BANDS }, (_, band) =>
      fogTransitionAlpha(0, band),
    );
    const explored = Array.from({ length: FOG_TRANSITION_BANDS }, (_, band) =>
      fogTransitionAlpha(1, band),
    );

    expect(hidden.every((alpha, index) => index === 0 || alpha < hidden[index - 1]!)).toBe(true);
    expect(explored.every((alpha, index) => index === 0 || alpha < explored[index - 1]!)).toBe(
      true,
    );
    expect(hidden.every((alpha, index) => alpha > explored[index]!)).toBe(true);
    expect(fogTransitionAlpha(0, FOG_TRANSITION_BANDS)).toBe(0);
  });
});
