import { Direction } from './types';

const SWIPE_THRESHOLD_PX = 24;

export interface TouchCallbacks {
  onDirection(direction: Direction): void;
  onTap(): void;
}

/** Translates swipe/tap gestures on a target element into game intents. No game state. */
export class TouchHandler {
  private startX = 0;
  private startY = 0;

  constructor(target: HTMLElement, callbacks: TouchCallbacks) {
    target.addEventListener(
      'touchstart',
      (e) => {
        const touch = e.touches[0];
        this.startX = touch.clientX;
        this.startY = touch.clientY;
      },
      { passive: true },
    );

    target.addEventListener(
      'touchend',
      (e) => {
        const touch = e.changedTouches[0];
        const dx = touch.clientX - this.startX;
        const dy = touch.clientY - this.startY;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);

        if (absX < SWIPE_THRESHOLD_PX && absY < SWIPE_THRESHOLD_PX) {
          callbacks.onTap();
          return;
        }

        if (absX > absY) {
          callbacks.onDirection(dx > 0 ? Direction.Right : Direction.Left);
        } else {
          callbacks.onDirection(dy > 0 ? Direction.Down : Direction.Up);
        }
      },
      { passive: true },
    );
  }
}
