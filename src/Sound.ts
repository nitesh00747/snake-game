/** Minimal beep-based SFX via the Web Audio API. No external assets. */
export class Sound {
  private ctx: AudioContext | null = null;
  private muted = false;

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  eat(): void {
    this.beep(660, 90);
  }

  gameOver(): void {
    this.beep(220, 90);
    setTimeout(() => this.beep(140, 180), 100);
  }

  private beep(frequency: number, durationMs: number): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = frequency;

    const now = ctx.currentTime;
    const durationSec = durationMs / 1000;
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec);
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }
}
