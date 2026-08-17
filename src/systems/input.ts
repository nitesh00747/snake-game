/**
 * input.ts — action-level input, one snapshot per player per tick.
 *
 * Entities never read keys. They read actions, which means rebinding, gamepads
 * and (later) demo playback all plug in here without touching gameplay code.
 *
 * Two-button scheme, as the genre requires: FIRE and JUMP, plus a direction.
 * Everything expressive about the movement comes from combining a direction
 * with a stance, not from extra buttons.
 */

import { isDown, wasPressed, wasReleased } from '../core/keyboard';

export interface ActionState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  fire: boolean;
  jump: boolean;

  /** Edge-triggered, true only on the tick the button went down. */
  firePressed: boolean;
  jumpPressed: boolean;
  /** Edge-triggered release, used to cut a jump short. */
  jumpReleased: boolean;

  /** True if any input at all arrived this tick (used to detect idle players). */
  any: boolean;
}

interface Binding {
  left: string;
  right: string;
  up: string;
  down: string;
  fire: string;
  jump: string;
}

const BINDINGS: Binding[] = [
  // P1
  {
    left: 'ArrowLeft',
    right: 'ArrowRight',
    up: 'ArrowUp',
    down: 'ArrowDown',
    fire: 'KeyZ',
    jump: 'KeyX',
  },
  // P2
  { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', fire: 'KeyF', jump: 'KeyG' },
];

/** Analogue sticks need a deadzone; d-pads report as buttons and do not. */
const STICK_DEADZONE = 0.4;

/** Standard-mapping button indices. */
const BTN = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  rb: 5,
  rt: 7,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
} as const;

function blank(): ActionState {
  return {
    left: false,
    right: false,
    up: false,
    down: false,
    fire: false,
    jump: false,
    firePressed: false,
    jumpPressed: false,
    jumpReleased: false,
    any: false,
  };
}

export class Input {
  /** One entry per player slot. */
  readonly players: ActionState[] = [blank(), blank()];

  /** Previous-tick pad button state, for edge detection on gamepads. */
  private padPrev: boolean[][] = [[], []];

  /** True once a gamepad has ever reported input, for the debug readout. */
  padActive = [false, false];

  get p1(): ActionState {
    return this.players[0];
  }

  get p2(): ActionState {
    return this.players[1];
  }

  /** Call once per logic tick, before entities update. */
  update(): void {
    const pads = this.readPads();

    for (let i = 0; i < this.players.length; i++) {
      const s = this.players[i];
      const b = BINDINGS[i];
      const pad = pads[i];

      const padLeft = pad ? pad.left : false;
      const padRight = pad ? pad.right : false;
      const padUp = pad ? pad.up : false;
      const padDown = pad ? pad.down : false;
      const padFire = pad ? pad.fire : false;
      const padJump = pad ? pad.jump : false;

      s.left = isDown(b.left) || padLeft;
      s.right = isDown(b.right) || padRight;
      s.up = isDown(b.up) || padUp;
      s.down = isDown(b.down) || padDown;
      s.fire = isDown(b.fire) || padFire;
      s.jump = isDown(b.jump) || padJump;

      // Opposing horizontal inputs cancel: prevents a jitter state where the
      // player faces one way while drifting the other.
      if (s.left && s.right) {
        s.left = false;
        s.right = false;
      }

      const prev = this.padPrev[i];
      const padFirePressed = padFire && !prev[BTN.x];
      const padJumpPressed = padJump && !prev[BTN.a];
      const padJumpReleased = !padJump && prev[BTN.a] === true;

      s.firePressed = wasPressed(b.fire) || padFirePressed;
      s.jumpPressed = wasPressed(b.jump) || padJumpPressed;
      s.jumpReleased = wasReleased(b.jump) || padJumpReleased;

      s.any = s.left || s.right || s.up || s.down || s.fire || s.jump;

      if (pad) {
        prev[BTN.x] = padFire;
        prev[BTN.a] = padJump;
        if (s.any) this.padActive[i] = true;
      }
    }
  }

  private readPads(): ({ left: boolean; right: boolean; up: boolean; down: boolean; fire: boolean; jump: boolean } | null)[] {
    const out: ReturnType<Input['readPads']> = [null, null];
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (!nav || typeof nav.getGamepads !== 'function') return out;

    const pads = nav.getGamepads();
    let slot = 0;
    for (const pad of pads) {
      if (!pad || !pad.connected || slot >= 2) continue;

      const btn = (i: number) => (pad.buttons[i] ? pad.buttons[i].pressed : false);
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;

      out[slot] = {
        left: btn(BTN.dpadLeft) || ax < -STICK_DEADZONE,
        right: btn(BTN.dpadRight) || ax > STICK_DEADZONE,
        up: btn(BTN.dpadUp) || ay < -STICK_DEADZONE,
        down: btn(BTN.dpadDown) || ay > STICK_DEADZONE,
        // Face buttons: X/square and B fire, A/cross and Y jump. Shoulder
        // buttons double up so either hand can drive it.
        fire: btn(BTN.x) || btn(BTN.b) || btn(BTN.rt),
        jump: btn(BTN.a) || btn(BTN.y) || btn(BTN.rb),
      };
      slot++;
    }
    return out;
  }
}
