import type { Point } from './types';

const OBSTACLE_BLOCK_LENGTH = 4;
const SPAWN_CLEAR_DX = 3;
const SPAWN_CLEAR_DY = 2;

/** Grid dimensions, bounds-checking, and the level's static obstacles. No rendering, no game rules. */
export class Board {
  readonly cols: number;
  readonly rows: number;
  readonly obstacles: readonly Point[];
  private readonly obstacleKeys: Set<string>;

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.obstacles = Board.buildObstacles(cols, rows);
    this.obstacleKeys = new Set(this.obstacles.map((p) => `${p.x},${p.y}`));
  }

  isInside(p: Point): boolean {
    return p.x >= 0 && p.x < this.cols && p.y >= 0 && p.y < this.rows;
  }

  isObstacle(p: Point): boolean {
    return this.obstacleKeys.has(`${p.x},${p.y}`);
  }

  randomCell(): Point {
    return {
      x: Math.floor(Math.random() * this.cols),
      y: Math.floor(Math.random() * this.rows),
    };
  }

  /** Four short wall segments in each quadrant, kept clear of the center spawn area. */
  private static buildObstacles(cols: number, rows: number): Point[] {
    const midX = Math.floor(cols / 2);
    const midY = Math.floor(rows / 2);
    const quarterX = Math.floor(cols / 4);
    const quarterY = Math.floor(rows / 4);
    const half = Math.floor(OBSTACLE_BLOCK_LENGTH / 2);

    const blockStartsX = [quarterX - half, cols - quarterX - half];
    const blockYs = [quarterY, rows - quarterY];

    const segments: Point[] = [];
    for (const y of blockYs) {
      for (const startX of blockStartsX) {
        for (let i = 0; i < OBSTACLE_BLOCK_LENGTH; i++) {
          segments.push({ x: startX + i, y });
        }
      }
    }

    return segments.filter(
      (p) => Math.abs(p.x - midX) > SPAWN_CLEAR_DX || Math.abs(p.y - midY) > SPAWN_CLEAR_DY,
    );
  }
}
