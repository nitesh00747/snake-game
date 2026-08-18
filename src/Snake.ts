import { DELTA, Direction, OPPOSITE, type Point } from './types';

/**
 * Body is a deque of grid cells, head at index 0.
 * Pure state + movement rules — no board/food knowledge, no rendering.
 */
export class Snake {
  private body: Point[];
  private direction: Direction;
  private pendingDirection: Direction;
  private pendingGrowth = 0;

  constructor(start: Point, initialLength: number, direction: Direction) {
    this.direction = direction;
    this.pendingDirection = direction;
    this.body = [];
    const back = DELTA[OPPOSITE[direction]];
    for (let i = 0; i < initialLength; i++) {
      this.body.push({ x: start.x + back.x * i, y: start.y + back.y * i });
    }
  }

  get head(): Point {
    return this.body[0];
  }

  get cells(): readonly Point[] {
    return this.body;
  }

  get currentDirection(): Direction {
    return this.direction;
  }

  /** Ignored if it directly reverses current travel (no 180 turns) or repeats a queued turn. */
  setDirection(next: Direction): void {
    if (next === OPPOSITE[this.direction]) return;
    this.pendingDirection = next;
  }

  grow(segments = 1): void {
    this.pendingGrowth += segments;
  }

  /** Advances one tick; returns the new head position. Tail is popped unless growth is pending. */
  step(): Point {
    this.direction = this.pendingDirection;
    const delta = DELTA[this.direction];
    const newHead: Point = { x: this.head.x + delta.x, y: this.head.y + delta.y };
    this.body.unshift(newHead);
    if (this.pendingGrowth > 0) {
      this.pendingGrowth--;
    } else {
      this.body.pop();
    }
    return newHead;
  }

  /** Wraps the head back onto the board after it stepped past an edge. Mutates and returns the head. */
  wrapHead(cols: number, rows: number): Point {
    const wrapped: Point = {
      x: ((this.head.x % cols) + cols) % cols,
      y: ((this.head.y % rows) + rows) % rows,
    };
    this.body[0] = wrapped;
    return wrapped;
  }

  occupies(p: Point, includeHead = true): boolean {
    const cells = includeHead ? this.body : this.body.slice(1);
    return cells.some((c) => c.x === p.x && c.y === p.y);
  }

  /** True if the head overlaps any other body segment (post-step self-collision). */
  hasSelfCollision(): boolean {
    const [head, ...rest] = this.body;
    return rest.some((c) => c.x === head.x && c.y === head.y);
  }
}
