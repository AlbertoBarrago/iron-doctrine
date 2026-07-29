/**
 * Minimal WebAudio bus. With no licensed audio assets yet, effects are synthesized
 * procedurally (oscillators + noise) so the game has responsive feedback out of the
 * box; swapping in sampled assets later means implementing the same `play` contract.
 *
 * The AudioContext is created lazily on the first sound because browsers require a
 * user gesture — the first click/keypress that triggers a sound provides it.
 */
export const SOUND_KINDS = [
  'select',
  'move',
  'explosion',
  'build',
  'rifle',
  'cannon',
  'impact',
] as const;
export type SoundKind = (typeof SOUND_KINDS)[number];

export const normalizeVolume = (volume: number): number => Math.min(1, Math.max(0, volume));
export const busGain = (volume: number, muted: boolean, scale: number): number =>
  muted ? 0 : normalizeVolume(volume) * scale;

const AMBIENT_CHORDS = [
  [146.83, 174.61, 220], // D minor
  [174.61, 220, 261.63], // F major
  [130.81, 164.81, 196], // C major
  [196, 246.94, 293.66], // G major
] as const;
export const AMBIENT_PHRASE_SECONDS = 6;
export const AMBIENT_PULSE_SECONDS = 1.4;

export const ambientChord = (phrase: number): readonly number[] =>
  AMBIENT_CHORDS[
    ((phrase % AMBIENT_CHORDS.length) + AMBIENT_CHORDS.length) % AMBIENT_CHORDS.length
  ]!;

export class AudioBus {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxMuted = false;
  private sfxVolume = 0.7;
  private musicMuted = false;
  private musicVolume = 0.35;
  private ambientRequested = false;
  private ambientPhrase = 0;
  private ambientTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly ambientSources = new Set<OscillatorNode>();

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      const Ctor =
        globalThis.AudioContext ??
        (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.updateGains();
      this.sfxGain.connect(this.ctx.destination);
      this.musicGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  setMuted(muted: boolean): void {
    this.sfxMuted = muted;
    this.updateGains();
  }

  setVolume(volume: number): void {
    this.sfxVolume = normalizeVolume(volume);
    this.updateGains();
  }

  setMusicMuted(muted: boolean): void {
    this.musicMuted = muted;
    this.updateGains();
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = normalizeVolume(volume);
    this.updateGains();
  }

  requestAmbient(): void {
    this.ambientRequested = true;
    if (this.ctx) this.startAmbientIfNeeded(this.ctx);
  }

  play(kind: SoundKind): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxGain) return;
    if (ctx.state === 'suspended') void ctx.resume();
    this.startAmbientIfNeeded(ctx);
    if (this.sfxMuted) return;
    const now = ctx.currentTime;
    switch (kind) {
      case 'select':
        this.blip(ctx, now, 260, 0.035, 'square');
        this.blip(ctx, now + 0.045, 390, 0.035, 'square');
        break;
      case 'move':
        this.blip(ctx, now, 185, 0.07, 'sawtooth');
        break;
      case 'build':
        this.blip(ctx, now, 150, 0.1, 'square');
        this.blip(ctx, now + 0.09, 225, 0.11, 'square');
        break;
      case 'explosion':
        this.noiseBurst(ctx, now, 0.35);
        break;
      case 'rifle':
        this.noiseBurst(ctx, now, 0.045, 2400);
        this.blip(ctx, now, 720, 0.035, 'square');
        break;
      case 'cannon':
        this.noiseBurst(ctx, now, 0.2, 620);
        this.blip(ctx, now, 72, 0.16, 'sine');
        break;
      case 'impact':
        this.noiseBurst(ctx, now, 0.09, 1300);
        break;
    }
  }

  dispose(): void {
    this.ambientRequested = false;
    if (this.ambientTimer) clearTimeout(this.ambientTimer);
    this.ambientTimer = null;
    for (const source of this.ambientSources) source.stop();
    this.ambientSources.clear();
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
    this.sfxGain = null;
    this.musicGain = null;
  }

  private updateGains(): void {
    if (this.sfxGain) this.sfxGain.gain.value = busGain(this.sfxVolume, this.sfxMuted, 0.35);
    if (this.musicGain)
      this.musicGain.gain.value = busGain(this.musicVolume, this.musicMuted, 0.16);
  }

  private startAmbientIfNeeded(ctx: AudioContext): void {
    if (!this.ambientRequested || this.ambientTimer || !this.musicGain) return;
    this.scheduleAmbientPhrase(ctx);
  }

  private scheduleAmbientPhrase(ctx: AudioContext): void {
    if (!this.ambientRequested || !this.musicGain) return;
    const now = ctx.currentTime + 0.05;
    const duration = AMBIENT_PHRASE_SECONDS + 0.6;
    const chord = ambientChord(this.ambientPhrase);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 940;
    filter.Q.value = 0.45;
    filter.connect(this.musicGain);

    for (const [voice, frequency] of chord.entries()) {
      const oscillator = ctx.createOscillator();
      const envelope = ctx.createGain();
      oscillator.type = voice === 0 ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = voice === 2 ? 3 : 0;
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(voice === 0 ? 0.42 : 0.25, now + 0.9);
      envelope.gain.setValueAtTime(voice === 0 ? 0.42 : 0.25, now + duration - 1.4);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(envelope).connect(filter);
      oscillator.onended = () => this.ambientSources.delete(oscillator);
      this.ambientSources.add(oscillator);
      oscillator.start(now);
      oscillator.stop(now + duration);
    }

    for (let pulse = 0; pulse < 4; pulse++) {
      this.scheduleAmbientPulse(ctx, filter, now + 0.45 + pulse * AMBIENT_PULSE_SECONDS, chord);
    }

    this.ambientPhrase++;
    this.ambientTimer = setTimeout(() => {
      this.ambientTimer = null;
      this.scheduleAmbientPhrase(ctx);
    }, AMBIENT_PHRASE_SECONDS * 1_000);
  }

  private scheduleAmbientPulse(
    ctx: AudioContext,
    destination: AudioNode,
    now: number,
    chord: readonly number[],
  ): void {
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = chord[0]!;
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(0.075, now + 0.035);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    oscillator.connect(envelope).connect(destination);
    oscillator.onended = () => this.ambientSources.delete(oscillator);
    this.ambientSources.add(oscillator);
    oscillator.start(now);
    oscillator.stop(now + 0.3);
  }

  private blip(
    ctx: AudioContext,
    now: number,
    freq: number,
    dur: number,
    type: OscillatorType,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.5, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain).connect(this.sfxGain!);
    osc.start(now);
    osc.stop(now + dur);
  }

  private noiseBurst(ctx: AudioContext, now: number, dur: number, cutoff = 900): void {
    const frames = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Deterministic-ish decaying noise (audio need not be sim-deterministic).
    let seed = 1;
    for (let i = 0; i < frames; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const decay = 1 - i / frames;
      data[i] = ((seed / 0x7fffffff) * 2 - 1) * decay * decay;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    src.connect(filter).connect(this.sfxGain!);
    src.start(now);
  }
}
