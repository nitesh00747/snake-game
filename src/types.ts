export interface Point {
  x: number;
  y: number;
}

export enum Direction {
  Up = 'Up',
  Down = 'Down',
  Left = 'Left',
  Right = 'Right',
}

export const OPPOSITE: Record<Direction, Direction> = {
  [Direction.Up]: Direction.Down,
  [Direction.Down]: Direction.Up,
  [Direction.Left]: Direction.Right,
  [Direction.Right]: Direction.Left,
};

export const DELTA: Record<Direction, Point> = {
  [Direction.Up]: { x: 0, y: -1 },
  [Direction.Down]: { x: 0, y: 1 },
  [Direction.Left]: { x: -1, y: 0 },
  [Direction.Right]: { x: 1, y: 0 },
};

export enum GameStatus {
  Ready = 'Ready',
  Running = 'Running',
  Paused = 'Paused',
  GameOver = 'GameOver',
}
