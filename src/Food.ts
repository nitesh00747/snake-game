import type { Board } from './Board';
import type { Snake } from './Snake';
import { FoodKind, type Point } from './types';

const BONUS_CHANCE = 0.25;
const BONUS_LIFESPAN_TICKS = 30;

/** Owns the single active food cell and knows how to relocate it off the snake. */
export class Food {
  private position: Point;
  private kind: FoodKind = FoodKind.Normal;
  private ticksRemaining = Infinity;

  constructor(board: Board, snake: Snake) {
    this.position = Food.pickFreeCell(board, snake);
  }

  get cell(): Point {
    return this.position;
  }

  get currentKind(): FoodKind {
    return this.kind;
  }

  respawn(board: Board, snake: Snake): void {
    this.position = Food.pickFreeCell(board, snake);
    this.kind = Math.random() < BONUS_CHANCE ? FoodKind.Bonus : FoodKind.Normal;
    this.ticksRemaining = this.kind === FoodKind.Bonus ? BONUS_LIFESPAN_TICKS : Infinity;
  }

  /** A bonus food reverts to normal food in place once its timer runs out uneaten. */
  tick(): void {
    if (this.kind !== FoodKind.Bonus) return;
    this.ticksRemaining -= 1;
    if (this.ticksRemaining <= 0) this.kind = FoodKind.Normal;
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
