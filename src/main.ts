import { Game } from './game';

const canvas = document.getElementById('screen');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('#screen canvas not found');
}

const game = new Game(canvas);
game.start();

// Handy for poking at state from the devtools console during development.
(window as unknown as { game: Game }).game = game;
