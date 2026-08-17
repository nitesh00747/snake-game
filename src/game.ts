/**
 * game.ts — top-level wiring.
 *
 * Owns the renderer, the loop, and the active scene. Keeping this thin means
 * later steps swap the scene (title / level / boss) without touching the loop.
 */

import { debug } from './core/debug';
import { GameLoop } from './core/loop';
import { PAL } from './core/palette';
import { Renderer } from './core/renderer';
import {
  endKeyboardFrame,
  endKeyboardTick,
  framePressed,
  installKeyboard,
} from './core/keyboard';
import { PlayScene } from './scenes/playScene';

export class Game {
  private readonly renderer: Renderer;
  private readonly loop: GameLoop;
  private readonly scene: PlayScene;

  constructor(canvas: HTMLCanvasElement) {
    installKeyboard();

    this.renderer = new Renderer(canvas);
    this.scene = new PlayScene();
    this.loop = new GameLoop(this.update, this.render, this.preFrame, this.postFrame);

    debug.addProvider(() => this.scene.debugLines());
    debug.addProvider(() => (this.loop.paused ? ['PAUSED'] : []));
  }

  start(): void {
    this.loop.start();
  }

  // -------------------------------------------------------------------------
  // Loop hooks
  // -------------------------------------------------------------------------

  /** Once per rendered frame, before any logic tick. Runs while paused too. */
  private preFrame = (): void => {
    if (framePressed('F1')) debug.toggle();
    if (framePressed('F2')) debug.cycleDetail();
    if (framePressed('Backslash')) debug.showHitboxes = !debug.showHitboxes;

    if (framePressed('Enter')) this.loop.paused = !this.loop.paused;
    if (this.loop.paused && framePressed('Period')) this.loop.requestStep();
  };

  private update = (): void => {
    this.scene.update();
    endKeyboardTick();
  };

  private render = (alpha: number): void => {
    const r = this.renderer;
    r.clear(PAL.black);
    this.scene.draw(r, alpha);

    if (this.loop.paused) {
      r.text('PAUSED', r.w / 2, 20, PAL.white, { align: 'center', shadow: PAL.black });
    }

    debug.sample(this.loop.stats.frameMs);
    debug.draw(r, this.loop.stats);

    r.present();
  };

  private postFrame = (): void => {
    endKeyboardFrame();
  };
}
