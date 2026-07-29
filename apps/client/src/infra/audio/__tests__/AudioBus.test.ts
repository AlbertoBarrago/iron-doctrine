import { describe, expect, it } from 'vitest';
import {
  AMBIENT_PHRASE_SECONDS,
  AMBIENT_PULSE_SECONDS,
  ambientChord,
  busGain,
  musicGain,
  normalizeVolume,
  SOUND_KINDS,
} from '../AudioBus.js';

describe('audio volume', () => {
  it('clamps values to the supported range', () => {
    expect(normalizeVolume(-0.5)).toBe(0);
    expect(normalizeVolume(0.65)).toBe(0.65);
    expect(normalizeVolume(1.5)).toBe(1);
  });

  it('exposes distinct combat cues', () => {
    expect(SOUND_KINDS).toEqual(expect.arrayContaining(['rifle', 'cannon', 'impact', 'explosion']));
    expect(new Set(SOUND_KINDS).size).toBe(SOUND_KINDS.length);
  });

  it('keeps effects and music gain independently configurable', () => {
    expect(busGain(0.8, false, 0.35)).toBeCloseTo(0.28);
    expect(busGain(0.8, true, 0.35)).toBe(0);
    expect(busGain(0.4, false, 0.16)).toBeCloseTo(0.064);
  });

  it('silences music while gameplay is paused without changing its configured volume', () => {
    expect(musicGain(0.4, false, false)).toBeCloseTo(0.064);
    expect(musicGain(0.4, false, true)).toBe(0);
    expect(musicGain(0.4, true, false)).toBe(0);
  });

  it('cycles through a stable ambient chord progression', () => {
    expect(ambientChord(0)).toEqual([146.83, 174.61, 220]);
    expect(ambientChord(1)).toEqual([174.61, 220, 261.63]);
    expect(ambientChord(3)).toEqual([196, 246.94, 293.66]);
    expect(ambientChord(4)).toEqual(ambientChord(0));
    expect(ambientChord(-1)).toEqual(ambientChord(3));
  });

  it('uses a shorter phrase with a restrained pulse', () => {
    expect(AMBIENT_PHRASE_SECONDS).toBe(6);
    expect(AMBIENT_PULSE_SECONDS).toBeGreaterThan(1);
    expect(AMBIENT_PULSE_SECONDS).toBeLessThan(AMBIENT_PHRASE_SECONDS / 2);
  });
});
