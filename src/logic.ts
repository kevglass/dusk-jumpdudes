import type { DuskClient } from "dusk-games-sdk"
import level1 from "./assets/levels/level1.glb?packed"
import level1Meta from "./assets/levels/level1.meta.json"
import { atobJS } from "./atob";
import { Vec3, World, addVec3, averageVec3, createBox, createCylinder, createWorld, resolve as resolvePhysics, scaleVec3, subVec3, updateBox } from "./simplephysics";

export const MOVE_SPEED = 0.1;
export const TURN_SPEED = 0.05;
export const UPDATES_PER_SECOND = 30;
export const SEND_PER_SECOND = 7;
export const FRAME_STEP = SEND_PER_SECOND / UPDATES_PER_SECOND;
export const SEND_ACTION_INTERVAL = 1000 / SEND_PER_SECOND;
export const GRAVITY = 0.05;
export const JUMP_POWER = 0.4;

export const PLAYER_HEIGHT = 0.8;
export const PLAYER_RADIUS = 0.25;

export type PlayerType = {
  name: string,
  model: string,
  texture: string,
}

export const PLAYER_TYPES: PlayerType[] = [
  {
    name: "Joe",
    model: "characters1/character-gamer.glb",
    texture: "characters1/Textures/colormap.png",
  },
  {
    name: "Sandy",
    model: "characters5/character-female-c.glb",
    texture: "characters1/Textures/colormap.png",
  },
  {
    name: "Felix",
    model: "characters5/character-male-b.glb",
    texture: "characters5/Textures/colormap.png",
  },
  {
    name: "Pam",
    model: "characters5/character-female-b.glb",
    texture: "characters5/Textures/colormap.png",
  },
  {
    name: "Eric",
    model: "characters2/character-skate-boy.glb",
    texture: "characters2/Textures/colormap.png",
  },
  {
    name: "Dan",
    model: "characters4/character-human.glb",
    texture: "characters4/Textures/colormap.png",
  },
  {
    name: "Fiona",
    model: "characters2/character-skate-girl.glb",
    texture: "characters2/Textures/colormap.png",
  },
  {
    name: "Trev",
    model: "characters5/character-male-a.glb",
    texture: "characters5/Textures/colormap.png",
  },
]
export type PlayerControls = {
  x: number;
  y: number;
  jump: boolean;
}

type LevelElement = {
  id: string;
  box: {
    min: Vec3,
    max: Vec3,
  },
  rotation: number,
  translation: Vec3
}

type LevelElementMeta = {
  bounds?: "box" | "circle";
  type?: "sensor";
  padding?: number;
}

type MoverType = "SimpleTranslate";

type Mover = {
  bodyId: number;
  type: MoverType;
  amount: number;
  offset: number;
  interval: number;
  dir?: Vec3;
  name: string;
  pause?: number;
}

export interface GameState {
  world: World;
  players: Player[];
  movers: Mover[];
}

export type Player = {
  bodyId: number;
  id: string;
  controls: PlayerControls;
  vy: number;
  onGround: boolean;
  onBody: number;
  type: number;
  lastValidPos: Vec3;
  lastValidRot: number;
}

function calcSimpleTranslateMove(mover: Mover, time: number): Vec3 {
  if (mover.dir) {
    const otime = (time + mover.offset);
    const t = (otime % mover.interval) / mover.interval;
    const pause = mover.pause ?? 0;
    if (otime % mover.interval < pause || 
        (otime % mover.interval > (mover.interval/2) &&
         otime % mover.interval < (mover.interval/2) + pause)) {
      return { x: 0, y: 0, z: 0 };
    }
    const step = ((mover.amount * 2) / (mover.interval - (pause * 2))) * (1000 / 30);
    if (t < 0.5) {
      return scaleVec3(mover.dir, step);
    } else {
      return scaleVec3(mover.dir, -step);
    }
  }
  return { x: 0, y: 0, z: 0 };
}

function calcMove(mover: Mover, time: number): Vec3 {
  if (mover.type === "SimpleTranslate") {
    return calcSimpleTranslateMove(mover, time);
  }

  return { x: 0, y: 0, z: 0 };
}

type GameActions = {
  join(playerType: number): void;

  controls(params: PlayerControls): void;
}

declare global {
  const Dusk: DuskClient<GameState, GameActions>
}

function addPlayer(state: GameState, playerId: string, playerType: number): void {
  const z = state.players.length % 2 == 0 ? Math.ceil(state.players.length / 2) * 1 : -Math.ceil(state.players.length / 2) * 1;
  const body = createCylinder(state.world, { x: -2, y: 1.1, z }, { x: PLAYER_RADIUS, y: PLAYER_HEIGHT, z: PLAYER_RADIUS }, Math.PI / 2, true, false)
  state.players.push({
    bodyId: body.id,
    id: playerId,
    controls: { x: 0, y: 0, jump: false },
    vy: 0,
    onGround: false,
    onBody: -1,
    type: playerType,
    lastValidPos:  { x: -2, y: 1.1, z },
    lastValidRot: Math.PI / 2
  })
}

Dusk.initLogic({
  minPlayers: 1,
  maxPlayers: 6,
  setup: () => {
    const levelElements = JSON.parse(atobJS(level1)) as LevelElement[];
    const metaData = JSON.parse(JSON.stringify(level1Meta)) as Record<string, LevelElementMeta>;

    const movers: Mover[] = [];
    const world = createWorld(0.25);
    for (const element of levelElements) {
      const meta = metaData[element.id];

      const center = addVec3(averageVec3(element.box.min, element.box.max), element.translation);
      const size = subVec3(element.box.max, element.box.min);
      const angle = element.rotation;

      if (meta?.bounds === "circle") {
        if (meta.padding) {
          size.x += meta.padding;
          size.x += meta.padding;
        }

        createCylinder(world, center, size, angle, false, meta?.type === "sensor")
      } else {
        createBox(world, center, size, angle, false, meta?.type === "sensor");
      }
      // if (meta?.type === "SimpleTranslate") {
      //   movers.push({
      //     bodyId: body.id,
      //     name: element.id,
      //     ...metaData[element.id]
      //   })
      // }
    }

    const state: GameState = {
      world,
      players: [],
      movers
    }

    return state;
  },
  reactive: false,
  updatesPerSecond: 30,
  update: ({ game }) => {
    const iterations = 20;
    const step = 1 / iterations;

    const moving: Record<number, Vec3> = {};
    for (const mover of game.movers) {
      const body = game.world.bodies.find(p => p.id === mover.bodyId);
      if (body) {
        moving[body.id] = calcMove(mover, Dusk.gameTime());
      }
    }

    for (let i = 0; i < iterations; i++) {
      for (const mover of game.movers) {
        const body = game.world.bodies.find(p => p.id === mover.bodyId);
        if (body) {
          const move = moving[body.id];
          body.center = addVec3(body.center, scaleVec3(move, step));
          updateBox(body);
        }
      }
      for (const player of game.players) {
        const body = game.world.bodies.find(p => p.id === player.bodyId);
        if (body) {
          body.angle -= player.controls.x * TURN_SPEED * step;

          body.center.x += Math.sin(body.angle) * MOVE_SPEED * player.controls.y * step;
          body.center.z += Math.cos(body.angle) * MOVE_SPEED * player.controls.y * step;

          if (player.onGround) {
            const move = moving[player.onBody];
            if (move) {
              body.center = addVec3(body.center, scaleVec3(move, step));
            }
          }

          if (player.onGround && player.controls.jump) {
            player.vy -= JUMP_POWER;
            player.onGround = false;
            player.onBody = -1;
          } else {
            player.vy += GRAVITY * step;
            body.center.y -= player.vy * step;
            player.onGround = false;
            player.onBody = -1;
          }
          body.vy = player.vy;

          if (body.center.y < -5) {
            body.center = { ...player.lastValidPos };
            body.angle = player.lastValidRot;
          }
        }
      }
      resolvePhysics(game.world, {
        collision(dynamic, fixed, delta) {
          if (delta.y > 0) {
            // pushed up by ground
            const player = game.players.find(p => p.bodyId === dynamic.id);
            if (player) {
              player.onGround = true;
              player.onBody = fixed.id;
              player.vy = 0;
            }
          }
          if (fixed.sensor) {
            const player = game.players.find(p => p.bodyId === dynamic.id);
            if (player) {
              player.lastValidPos = { ...dynamic.center }
              player.lastValidRot = dynamic.angle;
            }
          }
        },
      });
    }
  },
  landscape: true,
  actions: {
    join: (playerType: number, { playerId, game }) => {
      addPlayer(game, playerId, playerType);
    },
    controls: (params: PlayerControls, { playerId, game }) => {
      const player = game.players.find(p => p.id === playerId);
      if (player) {
        player.controls = params;
      }
    }
  },
  events: {
    playerJoined: () => {

    },
    playerLeft: () => {

    }
  }
})
