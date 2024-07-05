import type { DuskClient } from "dusk-games-sdk"

export const MOVE_SPEED = 0.1;
export const UPDATES_PER_SECOND = 30;
export const SEND_PER_SECOND = 10;
export const FRAME_STEP = SEND_PER_SECOND / UPDATES_PER_SECOND;
export const SEND_ACTION_INTERVAL = 1000 / SEND_PER_SECOND;

export type MoveFunc = "Z";

export type NamedPoint = {
  moveFunc: MoveFunc,
  distance: number,
  interval: number,
  velocity: number[];
}

export interface GameState {
  actors: PlayerState[]
  moving: Record<string, NamedPoint>
}

export type PlayerState = {
  id: string,
  q: number[],
  t: number[],
  vy: number,
  moving: boolean,
  onGround: boolean,
  on?: string,
  dir?: number[],
  baseY?: number;
}

type GameActions = {
  update(params: PlayerState ): void;
}

declare global {
  const Dusk: DuskClient<GameState, GameActions>
}

Dusk.initLogic({
  minPlayers: 1,
  maxPlayers: 6,
  setup: () => {
    const state: GameState = {
      actors: [],
      moving: {}
    }

    state.moving["platform003"] = {
      moveFunc: "Z",
      distance: 0.1,
      interval: 5000,
      velocity: [0, 0, 0] 
    };

    return state;
  },
  updatesPerSecond: 30,
  update: ({ game }) => {
    for (const mover of Object.values(game.moving)) {
      const time = ((Dusk.gameTime() % mover.interval) / mover.interval);
      mover.velocity = [0, 0, time < 0.5 ? mover.distance : -mover.distance];
    }
    for (const actor of game.actors) {
      if (actor.dir) {
        // we don't predict the Y change, just let the interpolators do that
        // actor.t[1] += (actor.dir[1] * MOVE_SPEED) * FRAME_STEP;
        actor.t[0] += (actor.dir[0] * MOVE_SPEED) * FRAME_STEP;
        actor.t[2] += (actor.dir[2] * MOVE_SPEED) * FRAME_STEP;
        if (actor.on) {
          const influence = game.moving[actor.on];
          if (influence) {
            actor.t[0] += influence.velocity[0];
            actor.t[1] += influence.velocity[1];
            actor.t[2] += influence.velocity[2];
          }
        }
        if (actor.vy !== 0) {
          if (actor.t[1] + actor.vy > (actor.baseY ?? 0) ) {
            actor.t[1] += actor.vy 
            actor.vy -= 0.05;
            if ( actor.vy < -0.5) {
              actor.vy = -0.5;
            }
          }
        }
      }
    }
  },
  landscape: true,
  actions: {
    update: (state, context) => {
      const actor = context.game.actors.find(actor => state.id === actor.id);
      if (!actor) {
        context.game.actors.push({
          ...state,
          id: context.playerId,
          dir: [0,0,0]
        })
      } else {
        actor.dir = state.moving ? [state.t[0] - actor.t[0], state.t[1] - actor.t[1], state.t[2] - actor.t[2]] : [0, 0, 0];
        actor.q = state.q;
        actor.t = state.t;
        actor.moving = state.moving;
        actor.on = state.on;
        actor.onGround = state.onGround;
        if (state.onGround) {
          // starting a jump
          actor.baseY = actor.t[1];
        }
        actor.vy = state.vy;
      }
    }
  },
})
