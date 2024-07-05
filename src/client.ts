import { GLTF } from "three/examples/jsm/Addons.js";
import nipplejs, { JoystickManager } from "nipplejs";
import { animateGLTF, copyGLTF, getAnimationsGLTF, loadModelGLTF, updateAnimations } from "./modelLoader";
import "./styles.css"

import { AmbientLight, Color, DirectionalLight, Mesh, Object3D, PerspectiveCamera, Quaternion, Scene, VSMShadowMap, Vector3, WebGLRenderer } from 'three';
import { GameState, MOVE_SPEED, SEND_ACTION_INTERVAL } from "./logic";
import RAPIER, { RigidBody } from "@dimforge/rapier3d";
import { Interpolator } from "dusk-games-sdk";

const PLAYER_HEIGHT = 0.8;
const PLAYER_RADIUS = 0.2;
const PHYSICS_FPS = 30;
const DEAD_TURN_ZONE = 0.5;
const DEAD_MOVE_ZONE = 0.25;

let lastActionSent = 0;

interface LevelElement {
  body: RAPIER.RigidBody;
  mesh: Object3D;
}

const touchDevice = ('ontouchstart' in document.documentElement);

class RollGame {
  keys: Record<string, boolean> = {};
  viewDistance: number = 5;
  camera: PerspectiveCamera;
  scene: Scene;
  renderer: WebGLRenderer;
  lightGroup: Object3D;

  playerBody?: RAPIER.RigidBody;
  playerCollider?: RAPIER.Collider;
  playerObject?: Object3D;
  otherPlayers: Record<string, Object3D> = {};

  characterController?: RAPIER.KinematicCharacterController;

  lastFrame: number = Date.now();

  playerModel!: GLTF;
  level!: GLTF;
  game?: GameState;
  localPlayerId?: string;
  moveSpeed: number = MOVE_SPEED;
  turnSpeed: number = 0.1;
  world: RAPIER.World;
  first: boolean = true;
  playerOn: string | undefined;

  vy: number = -0.5;

  frames: number = 0;
  lastFps: number = Date.now();
  fps: number = 0;

  elements: LevelElement[] = [];
  onGround: boolean = false;
  ang: number = 0;
  floorBody: RigidBody | null = null;
  stick: { x: number, y: number } = { x: 0, y: 0 };

  startTime: number = 0;
  jumpTime: number = 0;

  playerInterpolators: Record<string, Interpolator<number[]>> = {};

  constructor() {
    const aspect = window.innerWidth / window.innerHeight;

    const joystick: JoystickManager = nipplejs.create({
      mode: "static",
      zone: document.getElementById("joystick") ?? document.body,
      position: { left: '25%', bottom: '35%' },
      threshold: 0.2,
    });

    joystick.on("move", (event, joystick) => {
      this.stick = joystick.vector;
    });
    joystick.on("end", () => {
      this.stick = { x: 0, y: 0 };
    });

    if (!touchDevice) {
      (document.getElementById("jump") as HTMLImageElement).addEventListener("mousedown", () => {
        this.jump();
      })
    } else {
      document.getElementById("jump")?.addEventListener("touchstart", () => {
        this.jump();
      });
    }

    this.camera = new PerspectiveCamera(45, aspect, 1, 1000);
    this.scene = new Scene();
    this.scene.background = new Color(0x87CEEB);

    this.camera.position.set(20, 20, 20); // all components equal
    this.camera.lookAt(this.scene.position);

    this.renderer = new WebGLRenderer({
      antialias: true
    });

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = VSMShadowMap

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    const ambient = new AmbientLight(0xffffff, 1);
    this.scene.add(ambient);

    this.lightGroup = new Object3D();

    const light1 = new DirectionalLight(0xffffff, 0.7);

    light1.position.set(-5, 10, 5);

    const d = 9;
    light1.castShadow = true;
    light1.shadow.mapSize.width = 512
    light1.shadow.mapSize.height = 512
    light1.shadow.camera.near = 0.001
    light1.shadow.camera.far = 150
    light1.shadow.bias = -0.001;
    light1.shadow.camera.left = - d;
    light1.shadow.camera.right = d;
    light1.shadow.camera.top = d;
    light1.shadow.camera.bottom = - d;

    const light2 = new DirectionalLight(0xffffff, 0.2);
    light2.position.set(5, 15, -10);

    // this.scene.add(light2);
    this.lightGroup.add(light1);
    this.lightGroup.add(light1.target);
    this.scene.add(this.lightGroup);

    window.addEventListener("keydown", ({ key }) => {
      this.keys[key] = true;

      if (key === ' ') {
        this.jump();
      }
    });
    window.addEventListener("keyup", ({ key }) => {
      this.keys[key] = false;
    });

    const gravity = { x: 0.0, y: -9.81, z: 0.0 };
    this.world = new RAPIER.World(gravity);

    setInterval(() => {
      this.update();
    }, 1000 / PHYSICS_FPS);
  }

  jump() {
    if (this.onGround) {
      this.vy = 0.5;
    }
  }

  updateKeys(): number {
    let delta: number = 0;
    if (this.keys['w']) {
      delta = this.moveSpeed;
    }
    if (this.keys['s']) {
      delta = -this.moveSpeed;
    }
    if (this.playerObject) {
      if (this.keys['a']) {
        this.playerObject.rotation.y += this.turnSpeed;
      }
      if (this.keys['d']) {
        this.playerObject.rotation.y -= this.turnSpeed;
      }
    }
    if (this.stick.x || this.stick.y) {
      if (Math.abs(this.stick.y) > DEAD_MOVE_ZONE) {
        const mag = Math.abs(this.stick.y) - DEAD_MOVE_ZONE;
        delta = mag * (this.stick.y < 0 ? -1 : 1) * (1 / (1 - DEAD_MOVE_ZONE)) * this.moveSpeed;
      } else {
        delta = 0;
      }

      if (this.playerObject) {
        if (Math.abs(this.stick.x) > DEAD_TURN_ZONE) {
          const mag = Math.abs(this.stick.x) - DEAD_TURN_ZONE;
          this.playerObject.rotation.y -= this.turnSpeed * mag * (1 / (1 - DEAD_TURN_ZONE)) * (this.stick.x < 0 ? -1 : 1);
        }
      }
    }

    return delta;
  }

  update(): void {
    if (this.playerObject) {
      const dir = new Vector3();
      this.playerObject.getWorldDirection(dir);

      const delta = this.updateKeys();

      if (delta !== 0) {
        animateGLTF(this.playerObject, "walk");
      } else {
        animateGLTF(this.playerObject, "idle");
      }

      if (this.characterController && this.playerBody && this.playerCollider) {
        for (const element of this.elements) {
          if (this.game && this.game.moving[element.mesh.name]) {
            const change = new Vector3().fromArray(this.game.moving[element.mesh.name].velocity);
            element.mesh.position.add(change);
            // update the moving platform 
            const pos = new Vector3();
            element.mesh.getWorldPosition(pos);
            element.body.setTranslation(pos, true)
            const q = new Quaternion();
            element.mesh.getWorldQuaternion(q);
            element.body.setRotation(q, true);
          }
        }

        // clamp gravity
        if (this.vy === 0) {
          this.vy -= 0.1;
        } else {
          this.vy -= 0.05;
          if (this.vy < -0.5) {
            this.vy = -0.5;
          }
        }

        const intendedMove = new RAPIER.Vector3(delta * dir.x, this.vy, delta * dir.z);
        this.characterController.computeColliderMovement(this.playerCollider, intendedMove);
        const current = this.playerBody.translation();
        const move = this.characterController.computedMovement();
        this.onGround = false;
        for (let i = 0; i < this.characterController.numComputedCollisions(); i++) {
          const collision = this.characterController.computedCollision(i);
          if (collision) {
            // hit the ground
            if (collision.normal2.y < -0.5 && collision.witness2.y > PLAYER_HEIGHT) {
              this.vy = 0;
              this.onGround = true;

              this.floorBody = collision.collider?.parent() ?? null;

              const element = this.elements.find(e => e.body === this.floorBody);
              this.playerOn = undefined;
              if (element && this.game && this.game.moving[element.mesh.name]) {
                const push = new Vector3().fromArray(this.game.moving[element.mesh.name].velocity);
                move.x += push.x;
                move.y += push.y;
                move.z += push.z;
                this.playerOn = element.mesh.name;
              }
            }
          }
        }

        this.playerBody.setNextKinematicTranslation(new RAPIER.Vector3(current.x + move.x, current.y + move.y, current.z + move.z));
        this.world.step();
      }
    }
  }

  async loadAssets(): Promise<void> {
    this.level = await loadModelGLTF("levels/level1.glb");
    this.playerModel = await loadModelGLTF("characters1/character-gamer.glb");
    console.log(getAnimationsGLTF(this.playerModel));

    // setup physics for level
    this.scene.add(this.level.scene);
    this.level.scene.traverse((node) => {
      if (node instanceof Mesh) {
        const pos = new Vector3();
        node.getWorldPosition(pos);
        const scale = new Vector3();
        node.getWorldScale(scale);
        const rot = new Quaternion();
        node.getWorldQuaternion(rot);

        const verts = new Float32Array(node.geometry.attributes.position.array);
        for (let i = 0; i < verts.length; i += 3) {
          verts[i] *= scale.x;
          verts[i + 1] *= scale.y;
          verts[i + 2] *= scale.z;
        }

        const platform = RAPIER.ColliderDesc.convexHull(verts)!;
        const platformBody = RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z).setRotation(new RAPIER.Quaternion(rot.x, rot.y, rot.z, rot.w));
        const body = this.world.createRigidBody(platformBody);
        this.world.createCollider(platform, body);

        this.elements.push({
          body: body,
          mesh: node
        })
      }
    });

    // setup main character
    this.playerObject = copyGLTF(this.playerModel);
    this.playerObject.rotation.y = Math.PI;
    animateGLTF(this.playerObject, "walk");
    this.scene.add(this.playerObject);
    const capsule = RAPIER.ColliderDesc.cylinder(PLAYER_HEIGHT / 2, PLAYER_RADIUS);
    const targetBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 5, -5);
    this.playerBody = this.world.createRigidBody(targetBodyDesc);
    this.playerCollider = this.world.createCollider(capsule, this.playerBody);
    this.playerBody.setNextKinematicTranslation(new RAPIER.Vector3(0, 5, 0));
    const offset = 0.01;
    // Create the controller.
    this.characterController = this.world.createCharacterController(offset);
    this.characterController.enableAutostep(0.2, 0, false);
    this.characterController.setMaxSlopeClimbAngle(45 * Math.PI / 180);
    this.characterController.setMinSlopeSlideAngle(30 * Math.PI / 180);
  }

  start(): void {
    Dusk.initClient({
      onChange: ({ game, futureGame, yourPlayerId }) => {
        if (!this.startTime) {
          this.startTime = Date.now();
        }
        this.game = game;
        this.localPlayerId = yourPlayerId;

        for (const actor of (futureGame ?? game).actors) {
          if (actor.id === yourPlayerId) {
            continue;
          }

          if (!this.otherPlayers[actor.id]) {
            console.log("Adding " + actor.id + " to " + this.localPlayerId);
            this.otherPlayers[actor.id] = copyGLTF(this.playerModel);
            this.scene.add(this.otherPlayers[actor.id]);
          }

          const actorObject = this.otherPlayers[actor.id];

          actorObject.quaternion.copy(new Quaternion().fromArray(actor.q));
          if (!this.playerInterpolators[actor.id]) {
            this.playerInterpolators[actor.id] = Dusk.interpolatorLatency<number[]>({ maxSpeed: MOVE_SPEED * 1.5 });

            this.playerInterpolators[actor.id].update({ game: actor.t, futureGame: actor.t });
          }

          if (game && futureGame) {
            const futureActor = futureGame.actors.find(a => a.id === actor.id);
            if (futureActor) {
              this.playerInterpolators[actor.id].update({ game: actor.t, futureGame: futureActor.t });

              for (let i = 0; i < 3; i++) {
                if (actor.t[i] !== futureActor.t[i]) {
                  actor.moving = true;
                }
              }
            }
          }

          if (actor.moving) {
            animateGLTF(actorObject, "walk");
          } else {
            animateGLTF(actorObject, "idle");
          }

        }
      }
    });

    this.render();
  }

  render(): void {
    const now = Date.now();
    const elapsed = now - this.lastFrame;
    this.lastFrame = now;

    this.frames++;
    if (now - this.lastFps > 1000) {
      this.lastFps = now;
      this.fps = this.frames;
      this.frames = 0;
    }

    requestAnimationFrame(() => {
      this.render()
    });

    updateAnimations(elapsed / 1000);
    this.renderScene();
  }

  renderScene(): void {
    if (this.game) {
      for (const actor of this.game.actors) {
        if (this.playerInterpolators[actor.id]) {
          const actorObject = this.otherPlayers[actor.id];
          const pos = this.playerInterpolators[actor.id].getPosition();
          actorObject.position.copy(new Vector3().fromArray(pos));
        }
      }
    }

    const direction = new Vector3();
    if (!this.playerObject || !this.playerBody || !this.characterController || !this.playerCollider) {
      return;
    }

    const physicsLocation = this.playerCollider.translation();
    physicsLocation.x = Math.floor(physicsLocation.x * 100) / 100;
    physicsLocation.y = Math.floor(physicsLocation.y * 100) / 100;
    physicsLocation.z = Math.floor(physicsLocation.z * 100) / 100;

    this.playerObject.position.set(physicsLocation.x, physicsLocation.y - (PLAYER_HEIGHT / 2), physicsLocation.z);

    if (Date.now() - lastActionSent > SEND_ACTION_INTERVAL && this.localPlayerId) {
      Dusk.actions.update({
        id: this.localPlayerId,
        q: this.playerObject.quaternion.toArray(),
        t: this.playerObject.position.toArray(),
        moving: this.updateKeys() != 0,
        onGround: this.onGround,
        vy: this.vy,
        on: this.playerOn
      })
      lastActionSent = Date.now();
    }

    this.setDebug("FPS:" + this.fps + " Ground: " + this.onGround + " " + JSON.stringify(physicsLocation) + " " + this.jumpTime);

    this.playerObject.getWorldDirection(direction);

    const h = 2;
    const frontDistance = 5;

    this.camera.position.set(this.playerObject.position.x + (this.viewDistance * -direction.x), this.playerObject.position.y + h, this.playerObject.position.z + (this.viewDistance * -direction.z));
    this.camera.lookAt(this.playerObject.position.x + (frontDistance * direction.x), this.playerObject.position.y, this.playerObject.position.z + (frontDistance * direction.z));
    this.lightGroup.position.set(this.playerObject.position.x, 0, this.playerObject.position.z);

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  setDebug(msg: string): void {
    document.getElementById("debug")!.innerHTML = msg;
  }
}

(async () => {
  const game = new RollGame();
  await game.loadAssets();
  game.start();
})();
