/**
 * camera.ts — viewport position in world space.
 *
 * The camera is the authority for what is on screen, which makes it the key
 * the spawner is tied to (step 4): spawn tables are indexed by camera X for
 * side-scrolling levels and camera Y for vertical ones.
 */

import { CAMERA_FOLLOW, CAMERA_NO_BACKTRACK, SCREEN_H, SCREEN_W } from '../tuning';

export class Camera {
  x = 0;
  y = 0;

  /** Previous-tick position, for render interpolation. */
  prevX = 0;
  prevY = 0;

  /** World bounds. maxX/maxY are set from level dimensions. */
  minX = 0;
  minY = 0;
  maxX = Infinity;
  maxY = Infinity;

  /** High-water mark used to enforce no-backtracking in side-scrollers. */
  private furthestX = 0;

  setBounds(minX: number, minY: number, maxX: number, maxY: number): void {
    this.minX = minX;
    this.minY = minY;
    this.maxX = maxX;
    this.maxY = maxY;
  }

  snapTo(x: number, y: number): void {
    this.x = this.clampX(x);
    this.y = this.clampY(y);
    this.prevX = this.x;
    this.prevY = this.y;
    this.furthestX = this.x;
  }

  beginTick(): void {
    this.prevX = this.x;
    this.prevY = this.y;
  }

  /** Ease the camera toward a target top-left position. */
  followTo(targetX: number, targetY: number): void {
    let nx = this.x + (targetX - this.x) * CAMERA_FOLLOW;
    let ny = this.y + (targetY - this.y) * CAMERA_FOLLOW;

    nx = this.clampX(nx);
    ny = this.clampY(ny);

    if (CAMERA_NO_BACKTRACK) {
      this.furthestX = Math.max(this.furthestX, nx);
      nx = this.furthestX;
    }

    this.x = nx;
    this.y = ny;
  }

  /** Constant-rate scroll, used by auto-scrolling sections. */
  scrollBy(dx: number, dy: number): void {
    this.x = this.clampX(this.x + dx);
    this.y = this.clampY(this.y + dy);
    if (CAMERA_NO_BACKTRACK) {
      this.furthestX = Math.max(this.furthestX, this.x);
      this.x = this.furthestX;
    }
  }

  private clampX(x: number): number {
    return Math.max(this.minX, Math.min(this.maxX - SCREEN_W, x));
  }

  private clampY(y: number): number {
    return Math.max(this.minY, Math.min(this.maxY - SCREEN_H, y));
  }

  /** Interpolated render-space offset. Always integral, to keep pixels crisp. */
  renderX(alpha: number): number {
    return Math.round(this.prevX + (this.x - this.prevX) * alpha);
  }

  renderY(alpha: number): number {
    return Math.round(this.prevY + (this.y - this.prevY) * alpha);
  }

  /** True if a world-space AABB intersects the viewport (with optional margin). */
  isVisible(x: number, y: number, w: number, h: number, margin = 0): boolean {
    return (
      x + w >= this.x - margin &&
      x <= this.x + SCREEN_W + margin &&
      y + h >= this.y - margin &&
      y <= this.y + SCREEN_H + margin
    );
  }
}
