import type { Board } from './Board';
import type { Snake } from './Snake';
import type { Point } from './types';

/** Owns the single active food cell and knows how to relocate it off the snake. */
export class Food {
  private position: Point;

  constructor(board: Board, snake: Snake) {
    this.position = Food.pickFreeCell(board, snake);
  }

  get cell(): Point {
    return this.position;
  }

  respawn(board: Board, snake: Snake): void {
    this.position = Food.pickFreeCell(board, snake);
  }

  private static pickFreeCell(board: Board, snake: Snake): Point {
    // Board is small relative to the snake for the vast majority of play,
    // so rejection sampling is simple and fast. Falls back to a full scan
    // as the board fills up, so it still terminates near-full-board.
    for (let attempt = 0; attempt < 200; attempt++) {
      const candidate = board.randomCell();
      if (!snake.occupies(candidate) && !board.isObstacle(candidate)) return candidate;
    }
    const free: Point[] = [];
    for (let y = 0; y < board.rows; y++) {
      for (let x = 0; x < board.cols; x++) {
        const p = { x, y };
        if (!snake.occupies(p) && !board.isObstacle(p)) free.push(p);
      }
    }
    return free[Math.floor(Math.random() * free.length)] ?? { x: 0, y: 0 };
  }
}
