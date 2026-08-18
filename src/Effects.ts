import type { Point } from './types';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

const PARTICLE_COUNT = 10;
const PARTICLE_SPEED_PX_PER_SEC = 90;
const PARTICLE_LIFE_MS = 400;

/** Ephemeral particle-burst effects layered on top of gameplay. Pure animation state driven by wall-clock time; no game rules. */
export class Effects {
  private particles: Particle[] = [];
  private lastFrameTime = performance.now();

  burst(cell: Point, cellSize: number, color: string): void {
    const cx = cell.x * cellSize + cellSize / 2;
    const cy = cell.y * cellSize + cellSize / 2;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = (Math.PI * 2 * i) / PARTICLE_COUNT + Math.random() * 0.4;
      const speed = PARTICLE_SPEED_PX_PER_SEC * (0.6 + Math.random() * 0.6);
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: PARTICLE_LIFE_MS,
        maxLife: PARTICLE_LIFE_MS,
        color,
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const now = performance.now();
    const dtMs = now - this.lastFrameTime;
    this.lastFrameTime = now;

    if (this.particles.length === 0) return;

    for (const p of this.particles) {
      p.life -= dtMs;
      p.x += (p.vx * dtMs) / 1000;
      p.y += (p.vy * dtMs) / 1000;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }
}
