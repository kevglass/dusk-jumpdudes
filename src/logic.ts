import type { DuskClient } from "dusk-games-sdk"
import level1 from "./assets/levels/level1.glb?packed"
import { atobJS } from "./atob";
import { Vec3, World, addVec3, averageVec3, createBox, createCylinder, createWorld, resolve as resolvePhysics, subVec3 } from "./simplephysics";

export const MOVE_SPEED = 0.1;
export const TURN_SPEED = 0.1;
export const UPDATES_PER_SECOND = 30;
export const SEND_PER_SECOND = 7;
export const FRAME_STEP = SEND_PER_SECOND / UPDATES_PER_SECOND;
export const SEND_ACTION_INTERVAL = 1000 / SEND_PER_SECOND;
export const GRAVITY = 0.05;
export const JUMP_POWER = 0.5;

export const PLAYER_HEIGHT = 0.8;
export const PLAYER_RADIUS = 0.2;

export type PlayerControls = {
  x: number;
  y: number;
  jump: boolean;
}

type LevelElement = {
  id: number;
  box: {
    min: Vec3,
    max: Vec3,
  },
  rotation: number,
  translation: Vec3
}

export interface GameState {
  world: World;
  players: Player[]
}

export type Player = {
  bodyId: number;
  id: string;
  controls: PlayerControls;
  vy: number;
  onGround: boolean;
}

type GameActions = {
  controls(params: PlayerControls): void;
}

declare global {
  const Dusk: DuskClient<GameState, GameActions>
}

startLogic();

function startLogic() {
  console.log("Logic start");

  Dusk.initLogic({
    minPlayers: 1,
    maxPlayers: 6,
    setup: (allPlayerIds) => {
      const levelElements = JSON.parse(atobJS(level1)) as LevelElement[];

      const world = createWorld(0.25);
      for (const element of levelElements) {
        const center = addVec3(averageVec3(element.box.min, element.box.max), element.translation);
        const size = subVec3(element.box.max, element.box.min);
        const angle = element.rotation;

        createBox(world, center, size, angle, false);
      }

      const state: GameState = {
        world,
        players: [],
      }

      for (const playerId of allPlayerIds) {
        const body = createCylinder(world, { x: 0, y: 1.1, z: 0 }, { x: PLAYER_RADIUS, y: PLAYER_HEIGHT, z: PLAYER_RADIUS }, 0, true)
        state.players.push({
          bodyId: body.id,
          id: playerId,
          controls: { x: 0, y: 0, jump: false },
          vy: 0,
          onGround: false
        })
      }
      return state;
    },
    reactive: false,
    updatesPerSecond: 30,
    update: ({ game }) => {
      const iterations = 20;
      const step = 1 / iterations;
      for (let i = 0; i < iterations; i++) {
        for (const player of game.players) {
          const body = game.world.bodies.find(p => p.id === player.bodyId);
          if (body) {
            body.angle -= player.controls.x * TURN_SPEED * step;

            body.center.x += Math.sin(body.angle) * MOVE_SPEED * player.controls.y * step;
            body.center.z += Math.cos(body.angle) * MOVE_SPEED * player.controls.y * step;

            if (player.onGround && player.controls.jump) {
              player.vy -= JUMP_POWER;
              player.onGround = false;
            } else {
              player.vy += GRAVITY * step;
              body.center.y -= player.vy * step;
              player.onGround = false;
            }
            body.vy = player.vy;
          }
        }
        resolvePhysics(game.world, {
          collision(dynamic, fixed, delta) {
            if (delta.y > 0) {
              // pushed up by ground
              const player = game.players.find(p => p.bodyId === dynamic.id);
              if (player) {
                player.onGround = true;
                player.vy = 0;
              }
            }
          },
        });
      }
    },
    landscape: true,
    actions: {
      controls: (params: PlayerControls, { playerId, game }) => {
        const player = game.players.find(p => p.id === playerId);
        if (player) {
          player.controls = params;
        }
      }
    },
  })
}
