/**
 * Minimal WebAudio bus. With no licensed audio assets yet, effects are synthesized
 * procedurally (oscillators + noise) so the game has responsive feedback out of the
 * box; swapping in sampled assets later means implementing the same `play` contract.
 *
 * The AudioContext is created lazily on the first sound because browsers require a
 * user gesture — the first click/keypress that triggers a sound provides it.
 */
export type SoundKind = 'select' | 'move' | 'explosion' | 'build';

export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const Ctor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.25;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  play(kind: SoundKind): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    switch (kind) {
      case 'select':
        this.blip(ctx, now, 660, 0.06);
        break;
      case 'move':
        this.blip(ctx, now, 440, 0.05);
        break;
      case 'build':
        this.blip(ctx, now, 330, 0.12);
        break;
      case 'explosion':
        this.noiseBurst(ctx, now, 0.35);
        break;
    }
  }

  private blip(ctx: AudioContext, now: number, freq: number, dur: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.5, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain).connect(this.master!);
    osc.start(now);
    osc.stop(now + dur);
  }

  private noiseBurst(ctx: AudioContext, now: number, dur: number): void {
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
    filter.frequency.value = 900;
    src.connect(filter).connect(this.master!);
    src.start(now);
  }
}
