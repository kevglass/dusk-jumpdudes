import { GLTF } from "three/examples/jsm/Addons.js";
import nipplejs, { JoystickManager } from "nipplejs";
import { animateGLTF, copyGLTF, getAnimationsGLTF, loadModelGLTF, updateAnimations } from "./modelLoader";
import "./styles.css"

import { AmbientLight, Color, DirectionalLight, Object3D, PerspectiveCamera, Scene, VSMShadowMap, Vector3, WebGLRenderer } from 'three';
import { GameState, PLAYER_HEIGHT, PlayerControls, SEND_ACTION_INTERVAL } from "./logic";

const DEAD_TURN_ZONE = 0.5;
const DEAD_MOVE_ZONE = 0.25;

const touchDevice = ('ontouchstart' in document.documentElement);

class RollGame {
  keys: Record<string, boolean> = {};
  viewDistance: number = 5;
  camera: PerspectiveCamera;
  scene: Scene;
  renderer: WebGLRenderer;
  lightGroup: Object3D;

  playerObject?: Object3D;
  players: Record<string, Object3D> = {};

  lastFrame: number = Date.now();

  playerModel!: GLTF;
  level!: GLTF;
  game?: GameState;
  localPlayerId?: string;
  first: boolean = true;
  playerOn: string | undefined;

  vy: number = -0.5;

  frames: number = 0;
  lastFps: number = Date.now();
  fps: number = 0;

  stick: { x: number, y: number } = { x: 0, y: 0 };
  jumpTime: number = 0;

  controls: PlayerControls = { x: 0, y: 0, jump: false };
  lastSentControls: PlayerControls = { x: 0, y: 0, jump: false };
  lastActionSent: number = 0;
  
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
        this.controls.jump = true;
      })
      window.addEventListener("mouseup", () => {
        this.controls.jump = false;
      });
    } else {
      document.getElementById("jump")?.addEventListener("touchstart", () => {
        this.controls.jump = true;
      });
      window.addEventListener("touchend", () => {
        this.controls.jump = false;
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
        this.controls.jump = true;
      }
    });
    window.addEventListener("keyup", ({ key }) => {
      this.keys[key] = false;

      if (key === ' ') {
        this.controls.jump = false;
      }
    });
  }

  updateKeys(): void {
    this.controls.x = 0;
    this.controls.y = 0;

    if (this.keys['w']) {
      this.controls.y = 1;
    }
    if (this.keys['s']) {
      this.controls.y = -1;
    }
    if (this.keys['a']) {
      this.controls.x = -1;
    }
    if (this.keys['d']) {
      this.controls.x = 1;
    }
    if (this.stick.x || this.stick.y) {
      if (Math.abs(this.stick.y) > DEAD_MOVE_ZONE) {
        const mag = Math.abs(this.stick.y) - DEAD_MOVE_ZONE;
        this.controls.y = mag * (this.stick.y < 0 ? -1 : 1) * (1 / (1 - DEAD_MOVE_ZONE));
      } else {
        this.controls.y = 0;
      }

      if (Math.abs(this.stick.x) > DEAD_TURN_ZONE) {
        const mag = Math.abs(this.stick.x) - DEAD_TURN_ZONE;
        this.controls.x = mag * (1 / (1 - DEAD_TURN_ZONE)) * (this.stick.x < 0 ? -1 : 1);
      }
    }
  }

  async loadAssets(): Promise<void> {
    this.level = await loadModelGLTF("levels/level1.glb");
    this.playerModel = await loadModelGLTF("characters1/character-gamer.glb");
    console.log(getAnimationsGLTF(this.playerModel));

    console.log(this.level);
    this.scene.add(this.level.scene);
  }

  start(): void {
    Dusk.initClient({
      onChange: ({ game, yourPlayerId }) => {
        this.localPlayerId = yourPlayerId;
        this.game = game;

        for (const p of game.players) {
          if (!this.players[p.id]) {
            this.players[p.id] = copyGLTF(this.playerModel);
            this.scene.add(this.players[p.id]);
            if (p.id === yourPlayerId) {
              this.playerObject = this.players[p.id];
            }
          }

          const body = game.world.bodies.find(b => b.id === p.bodyId);
          if (body) {
            this.players[p.id].position.set(body.center.x, body.center.y - (PLAYER_HEIGHT / 2), body.center.z);
            this.players[p.id].rotation.y = body.angle;
          }

          if (p.controls.x !== 0 || p.controls.y !== 0) {
            animateGLTF(this.players[p.id], "walk");
          } else {
            animateGLTF(this.players[p.id], "idle");
          }
        }

      }
    });

    this.render();
  }

  render(): void {
    this.updateKeys();

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
    if (Date.now() - this.lastActionSent > SEND_ACTION_INTERVAL && this.localPlayerId) {
      if (this.lastSentControls.x !== this.controls.x || this.lastSentControls.y !== this.controls.y || this.lastSentControls.jump !== this.controls.jump) {
        this.lastSentControls = {...this.controls};

        Dusk.actions.controls(this.lastSentControls);
        this.lastActionSent = Date.now();
      }
    }

    if (this.game) {
      const p = this.game.players.find(p => p.id === this.localPlayerId);
      if (p) {
        this.setDebug("FPS:" + this.fps + " controls: " + this.controls.x + ","+this.controls.y+","+this.controls.jump+"  -  " + p.onGround );
      } else {
        this.setDebug("FPS:" + this.fps + " controls: " + this.controls.x + ","+this.controls.y+","+this.controls.jump+ " " );
      }
    }
    if (this.playerObject) {
      const direction = new Vector3();
      this.playerObject.getWorldDirection(direction);
      const h = 2;
      const frontDistance = 5;
      this.camera.position.set(this.playerObject.position.x + (this.viewDistance * -direction.x), this.playerObject.position.y + h, this.playerObject.position.z + (this.viewDistance * -direction.z));
      this.camera.lookAt(this.playerObject.position.x + (frontDistance * direction.x), this.playerObject.position.y, this.playerObject.position.z + (frontDistance * direction.z));
      this.lightGroup.position.set(this.playerObject.position.x, 0, this.playerObject.position.z);
    }
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
