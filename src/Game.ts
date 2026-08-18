import { Board } from './Board';
import { Food } from './Food';
import { Snake } from './Snake';
import { Direction, GameStatus, type Point } from './types';

export interface GameEvents {
  onScoreChange?(score: number): void;
  onStatusChange?(status: GameStatus): void;
  onEat?(): void;
}

const START_LENGTH = 3;
const BASE_TICK_MS = 180;
const MIN_TICK_MS = 55;
const SPEEDUP_PER_FOOD = 5;

/** Orchestrates Board + Snake + Food into one playable round. No rendering, no DOM. */
export class Game {
  readonly board: Board;
  private snake: Snake;
  private food: Food;
  private status: GameStatus = GameStatus.Ready;
  private score = 0;
  private tickMs = BASE_TICK_MS;
  private events: GameEvents;

  constructor(cols: number, rows: number, events: GameEvents = {}) {
    this.board = new Board(cols, rows);
    this.events = events;
    this.snake = this.createSnake();
    this.food = new Food(this.board, this.snake);
  }

  private createSnake(): Snake {
    const start: Point = {
      x: Math.floor(this.board.cols / 2),
      y: Math.floor(this.board.rows / 2),
    };
    return new Snake(start, START_LENGTH, Direction.Right);
  }

  get currentStatus(): GameStatus {
    return this.status;
  }

  get currentScore(): number {
    return this.score;
  }

  get tickIntervalMs(): number {
    return this.tickMs;
  }

  get snakeCells(): readonly Point[] {
    return this.snake.cells;
  }

  get foodCell(): Point {
    return this.food.cell;
  }

  reset(): void {
    this.snake = this.createSnake();
    this.food = new Food(this.board, this.snake);
    this.score = 0;
    this.tickMs = BASE_TICK_MS;
    this.setStatus(GameStatus.Ready);
    this.events.onScoreChange?.(this.score);
  }

  start(): void {
    if (this.status === GameStatus.Ready || this.status === GameStatus.GameOver) {
      if (this.status === GameStatus.GameOver) this.reset();
      this.setStatus(GameStatus.Running);
    }
  }

  togglePause(): void {
    if (this.status === GameStatus.Running) {
      this.setStatus(GameStatus.Paused);
    } else if (this.status === GameStatus.Paused) {
      this.setStatus(GameStatus.Running);
    }
  }

  turn(direction: Direction): void {
    this.snake.setDirection(direction);
  }

  /** Advances one logic tick. No-op unless the game is actively running. */
  tick(): void {
    if (this.status !== GameStatus.Running) return;

    let head = this.snake.step();
    if (!this.board.isInside(head)) {
      head = this.snake.wrapHead(this.board.cols, this.board.rows);
    }

    if (this.board.isObstacle(head) || this.snake.hasSelfCollision()) {
      this.setStatus(GameStatus.GameOver);
      return;
    }

    if (head.x === this.food.cell.x && head.y === this.food.cell.y) {
      this.snake.grow();
      this.score += 1;
      this.tickMs = Math.max(MIN_TICK_MS, BASE_TICK_MS - this.score * SPEEDUP_PER_FOOD);
      this.food.respawn(this.board, this.snake);
      this.events.onScoreChange?.(this.score);
      this.events.onEat?.();
    }
  }

  private setStatus(status: GameStatus): void {
    this.status = status;
    this.events.onStatusChange?.(status);
  }
}
