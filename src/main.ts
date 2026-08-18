import { Effects } from './Effects';
import { Game } from './Game';
import { InputHandler } from './InputHandler';
import { Renderer } from './Renderer';
import { Sound } from './Sound';
import { TouchHandler } from './TouchHandler';
import { FoodKind, GameStatus } from './types';

const COLS = 60;
const ROWS = 30;
const BEST_SCORE_KEY = 'snake.bestScore';
const RESUME_COUNTDOWN_STEPS = 3;
const RESUME_COUNTDOWN_STEP_MS = 700;
const SHAKE_ANIMATION_MS = 500;

const canvas = document.getElementById('board') as HTMLCanvasElement;
const boardWrapEl = document.querySelector('.board-wrap') as HTMLElement;
const scoreEl = document.getElementById('score') as HTMLElement;
const bestEl = document.getElementById('best') as HTMLElement;
const overlayEl = document.getElementById('overlay') as HTMLElement;
const overlayTitleEl = document.getElementById('overlay-title') as HTMLElement;
const overlaySubtitleEl = document.getElementById('overlay-subtitle') as HTMLElement;

let bestScore = Number(localStorage.getItem(BEST_SCORE_KEY) ?? 0);
bestEl.textContent = String(bestScore);

const sound = new Sound();
const effects = new Effects();

const game = new Game(COLS, ROWS, {
  onScoreChange(score) {
    scoreEl.textContent = String(score);
    if (score > bestScore) {
      bestScore = score;
      bestEl.textContent = String(bestScore);
      localStorage.setItem(BEST_SCORE_KEY, String(bestScore));
    }
  },
  onStatusChange(status) {
    renderOverlay(status);
    if (status === GameStatus.GameOver) {
      sound.gameOver();
      triggerShake();
    }
  },
  onEat(at, kind) {
    if (kind === FoodKind.Bonus) {
      sound.eatBonus();
      effects.burst(at, renderer.cellPixelSize, '#facc15');
    } else {
      sound.eat();
      effects.burst(at, renderer.cellPixelSize, '#fb923c');
    }
  },
});

const renderer = new Renderer(canvas, game.board);

function triggerShake(): void {
  boardWrapEl.classList.remove('shake');
  // Force reflow so the animation restarts even if triggered again quickly.
  void boardWrapEl.offsetWidth;
  boardWrapEl.classList.add('shake');
  setTimeout(() => boardWrapEl.classList.remove('shake'), SHAKE_ANIMATION_MS);
}

function renderOverlay(status: GameStatus): void {
  const messages: Partial<Record<GameStatus, [string, string]>> = {
    [GameStatus.Ready]: ['Snake', 'Press Space or Enter to start'],
    [GameStatus.Paused]: ['Paused', 'Press Space to resume'],
    [GameStatus.GameOver]: [
      'Game Over',
      `Score ${game.currentScore} — Press Enter to play again`,
    ],
  };
  const entry = messages[status];
  if (entry) {
    overlayTitleEl.textContent = entry[0];
    overlaySubtitleEl.textContent = entry[1];
    overlayEl.classList.remove('hidden');
  } else {
    overlayEl.classList.add('hidden');
  }
}

let resuming = false;

function handleStart(): void {
  game.start();
}

/** Pausing is immediate; resuming counts down first so play doesn't resume mid-reaction. */
function handleTogglePause(): void {
  if (game.currentStatus === GameStatus.Running) {
    game.togglePause();
  } else if (game.currentStatus === GameStatus.Paused && !resuming) {
    startResumeCountdown();
  }
}

function startResumeCountdown(): void {
  resuming = true;
  let count = RESUME_COUNTDOWN_STEPS;
  overlayTitleEl.textContent = String(count);
  overlaySubtitleEl.textContent = 'Get ready';
  overlayEl.classList.remove('hidden');

  const interval = setInterval(() => {
    count--;
    if (count > 0) {
      overlayTitleEl.textContent = String(count);
      return;
    }
    clearInterval(interval);
    resuming = false;
    game.togglePause();
  }, RESUME_COUNTDOWN_STEP_MS);
}

new InputHandler({
  onDirection: (direction) => game.turn(direction),
  onTogglePause: handleTogglePause,
  onStart: handleStart,
});

new TouchHandler(canvas, {
  onDirection: (direction) => game.turn(direction),
  onTap: () => {
    const status = game.currentStatus;
    if (status === GameStatus.Ready || status === GameStatus.GameOver) {
      handleStart();
    } else {
      handleTogglePause();
    }
  },
});

function draw(): void {
  renderer.clear(game.board);
  renderer.drawObstacles(game.board.obstacles);
  renderer.drawFood(game.foodCell, game.foodKind);
  renderer.drawSnake(game.snakeCells);
  renderer.drawEffects(effects);
}

// Fixed-interval logic loop decoupled from rendering: the tick cadence
// changes as the snake speeds up, so a fresh timeout is scheduled after
// every tick rather than relying on a constant-rate interval.
let tickHandle = 0;
function scheduleTick(): void {
  tickHandle = window.setTimeout(() => {
    game.tick();
    scheduleTick();
  }, game.tickIntervalMs);
}
scheduleTick();

function renderLoop(): void {
  draw();
  requestAnimationFrame(renderLoop);
}
renderLoop();

renderOverlay(GameStatus.Ready);
window.addEventListener('beforeunload', () => clearTimeout(tickHandle));
