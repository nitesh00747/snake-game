import { Direction } from './types';

const KEY_MAP: Record<string, Direction> = {
  ArrowUp: Direction.Up,
  ArrowDown: Direction.Down,
  ArrowLeft: Direction.Left,
  ArrowRight: Direction.Right,
  w: Direction.Up,
  s: Direction.Down,
  a: Direction.Left,
  d: Direction.Right,
  W: Direction.Up,
  S: Direction.Down,
  A: Direction.Left,
  D: Direction.Right,
};

export interface InputCallbacks {
  onDirection(direction: Direction): void;
  onTogglePause(): void;
  onStart(): void;
}

/** Translates raw keyboard events into game intents. No game state. */
export class InputHandler {
  constructor(callbacks: InputCallbacks) {
    window.addEventListener('keydown', (e) => {
      const direction = KEY_MAP[e.key];
      if (direction) {
        e.preventDefault();
        callbacks.onDirection(direction);
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        callbacks.onTogglePause();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        callbacks.onStart();
      }
    });
  }
}
