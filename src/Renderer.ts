import type { Board } from './Board';
import type { Effects } from './Effects';
import { FoodKind, type Point } from './types';

/** Pure drawing — reads game state, never mutates it. */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private cellSize: number;

  constructor(canvas: HTMLCanvasElement, board: Board) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.cellSize = canvas.width / board.cols;
  }

  get cellPixelSize(): number {
    return this.cellSize;
  }

  clear(board: Board): void {
    const { ctx, cellSize } = this;
    ctx.fillStyle = '#101c26';
    ctx.fillRect(0, 0, board.cols * cellSize, board.rows * cellSize);

    ctx.strokeStyle = '#182a38';
    ctx.lineWidth = 1;
    for (let x = 1; x < board.cols; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cellSize, 0);
      ctx.lineTo(x * cellSize, board.rows * cellSize);
      ctx.stroke();
    }
    for (let y = 1; y < board.rows; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cellSize);
      ctx.lineTo(board.cols * cellSize, y * cellSize);
      ctx.stroke();
    }
  }

  drawObstacles(cells: readonly Point[]): void {
    cells.forEach((cell) => this.drawCell(cell, '#334a5e', 1));
  }

  drawSnake(cells: readonly Point[]): void {
    cells.forEach((cell, index) => {
      this.drawCell(cell, index === 0 ? '#7dd3fc' : '#0ea5e9', 2);
    });
  }

  drawFood(cell: Point, kind: FoodKind = FoodKind.Normal): void {
    const { ctx, cellSize } = this;
    const cx = cell.x * cellSize + cellSize / 2;
    const cy = cell.y * cellSize + cellSize / 2;

    if (kind === FoodKind.Bonus) {
      const pulse = (Math.sin(performance.now() / 120) + 1) / 2;
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(cx, cy, cellSize / 2 - 2 + pulse * 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    ctx.fillStyle = '#fb923c';
    ctx.beginPath();
    ctx.arc(cx, cy, cellSize / 2 - 3, 0, Math.PI * 2);
    ctx.fill();
  }

  drawEffects(effects: Effects): void {
    effects.draw(this.ctx);
  }

  private drawCell(cell: Point, color: string, inset: number): void {
    const { ctx, cellSize } = this;
    ctx.fillStyle = color;
    ctx.fillRect(
      cell.x * cellSize + inset,
      cell.y * cellSize + inset,
      cellSize - inset * 2,
      cellSize - inset * 2,
    );
  }
}
