import { GLTF } from "three/examples/jsm/Addons.js";
import nipplejs, { JoystickManager } from "nipplejs";
import { animateGLTF, copyGLTF, getAnimationsGLTF, loadModelGLTF, updateAnimations } from "./modelLoader";
import "./styles.css"

import { AmbientLight, BoxGeometry, CubeTextureLoader, CylinderGeometry, DirectionalLight, DoubleSide, Material, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, PlaneGeometry, Raycaster, Scene, Vector3, WebGLRenderer } from 'three';
import { GameState, PLAYER_HEIGHT, PLAYER_TYPES, PlayerControls, SEND_ACTION_INTERVAL } from "./logic";
import { ASSETS } from "./lib/assets";

import sfx_jump from "./assets/jump.mp3";
import sfx_client from "./assets/click.mp3";
import sfx_start from "./assets/start.mp3";
import { ShapeType } from "./simplephysics";

const SOUND_START = new Audio(sfx_start);
const SOUND_CLICK = new Audio(sfx_client);
const SOUND_JUMP = new Audio(sfx_jump);

// Utility to play sounds and make sure they always play
// when asked by restarting the audio if needed
function play(audio: HTMLAudioElement) {
  if (audio.paused) {
    audio.play();
  } else {
    audio.currentTime = 0
  }
}

const DEAD_TURN_ZONE = 0.5;
const DEAD_MOVE_ZONE = 0.25;

const touchDevice = ('ontouchstart' in document.documentElement);
const SELECT_MOVE = 0.05;

class JumpDudesGame {
  keys: Record<string, boolean> = {};
  viewDistance: number = 5;
  camera: PerspectiveCamera;
  scene: Scene;
  renderer: WebGLRenderer;
  lightGroup: Object3D;

  wireframeGroup: Object3D;

  playerObject?: Object3D;
  players: Record<string, Object3D> = {};

  lastFrame: number = Date.now();

  playerModels: GLTF[] = [];
  level!: GLTF;
  game?: GameState;
  localPlayerId?: string;
  first: boolean = true;
  playerOn: string | undefined;
  frames: number = 0;
  lastFps: number = Date.now();
  fps: number = 0;

  stick: { x: number, y: number } = { x: 0, y: 0 };
  controls: PlayerControls = { x: 0, y: 0, jump: false };
  lastSentControls: PlayerControls = { x: 0, y: 0, jump: false };
  lastActionSent: number = 0;
  cancelJumpTimer?: ReturnType<typeof setTimeout>;

  atPlayerSelect = true;

  selectTarget = Math.floor(Math.random() * PLAYER_TYPES.length);
  currentTarget = this.selectTarget;

  playerSelectionWheel!: Object3D;
  ambient: AmbientLight;
  menuDarkTint!: Mesh;
  raycaster: Raycaster;
  hidden: Mesh[] = [];

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
      window.addEventListener("mouseup", () => {
        this.cancelJump();
      });
    } else {
      document.getElementById("jump")?.addEventListener("touchstart", () => {
        this.jump();
      });
      window.addEventListener("touchend", () => {
        this.cancelJump();
      });
    }

    (document.getElementById("left") as HTMLDivElement).addEventListener("click", () => {
      if (this.atPlayerSelect) {
        this.selectTarget--;
        play(SOUND_CLICK);
      }
    });
    (document.getElementById("right") as HTMLDivElement).addEventListener("click", () => {
      if (this.atPlayerSelect) {
        this.selectTarget++;
        play(SOUND_CLICK);
      }
    });
    (document.getElementById("join") as HTMLDivElement).addEventListener("click", () => {
      if (this.atPlayerSelect) {
        this.atPlayerSelect = false;
        play(SOUND_START);
        (document.getElementById("startScreen") as HTMLDivElement).style.display = "none";
        this.playerSelectionWheel.removeFromParent();
        this.menuDarkTint.removeFromParent();
        this.ambient.intensity = 1;
        Dusk.actions.join(this.getSelectedPlayerType());
      }
    });

    this.camera = new PerspectiveCamera(45, aspect, 1, 1000);
    this.scene = new Scene();
    const loader = new CubeTextureLoader();

    const textureCube = loader.load([
      ASSETS['skybox/left.png'], ASSETS['skybox/right.png'],
      ASSETS['skybox/top.png'], ASSETS['skybox/bottom.png'],
      ASSETS['skybox/back.png'], ASSETS['skybox/front.png']
    ]);

    this.scene.background = textureCube //new Color(0x87CEEB);

    this.camera.position.set(10, 10, 10); // all components equal
    this.camera.lookAt(this.scene.position);

    this.raycaster = new Raycaster();

    this.renderer = new WebGLRenderer({
      antialias: true
    });

    this.renderer.shadowMap.enabled = true;

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    this.ambient = new AmbientLight(0xffffff, 1);
    this.scene.add(this.ambient);

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
    this.scene.add(this.wireframeGroup = new Object3D());
    this.wireframeGroup.visible = false;

    window.addEventListener("keydown", ({ key }) => {
      this.keys[key] = true;

      if (key === ' ') {
        this.jump();
      }
      if (key === "1") {
        this.wireframeGroup.visible = !this.wireframeGroup.visible;
      }
    });
    window.addEventListener("keyup", ({ key }) => {
      this.keys[key] = false;

      if (key === ' ') {
        this.cancelJump();
      }
    });
  }

  cancelJump(): void {
    // time the jump off setting so it gets a chance to be
    // sent
    this.cancelJumpTimer = setTimeout(() => {
      this.controls.jump = false;
      this.cancelJumpTimer = undefined;
    }, 150);
  }

  jump(): void {
    if (this.cancelJumpTimer) {
      clearTimeout(this.cancelJumpTimer);
      this.cancelJumpTimer = undefined;
    }

    play(SOUND_JUMP);
    this.controls.jump = true;
    this.sendControls();
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
        this.controls.y = this.stick.y < 0 ? -1 : 1;
      } 
      if (Math.abs(this.stick.x) > DEAD_TURN_ZONE) {
        this.controls.x = (this.stick.x < 0 ? -1 : 1);
      }
    }
  }

  async loadAssets(): Promise<void> {
    this.level = await loadModelGLTF("levels/level1.glb");
    for (const type of PLAYER_TYPES) {
      this.playerModels.push(await loadModelGLTF(type.model, type.texture));
    }
    console.log(getAnimationsGLTF(this.playerModels[0]));
    this.scene.add(this.level.scene);

    const geometry = new PlaneGeometry(100, 100);
    const material = new MeshBasicMaterial({ color: 0x000000, side: DoubleSide });
    material.opacity = 0.5;
    material.transparent = true;
    this.menuDarkTint = new Mesh(geometry, material);
    this.menuDarkTint.rotateY(Math.PI / 4);
    this.menuDarkTint.position.set(8, 8, 8);
    this.scene.add(this.menuDarkTint);

    let i = 0;
    this.playerSelectionWheel = new Object3D();
    this.playerSelectionWheel.position.set(8, 7.5, 8);

    for (const model of this.playerModels) {
      const parent = new Object3D();
      const selectModel = copyGLTF(model);
      animateGLTF(selectModel, "idle");
      parent.rotateY(i * Math.PI * 2 / this.playerModels.length);

      parent.add(selectModel);
      selectModel.position.set(0.75, 0.75, 0.75);
      selectModel.rotateY((Math.PI / 4));
      selectModel.rotateX(-Math.PI / 12);
      this.playerSelectionWheel.add(parent);
      i++;
    }
    this.scene.add(this.playerSelectionWheel);
  }

  updateTarget() {
    if (this.currentTarget < this.selectTarget) {
      this.currentTarget += SELECT_MOVE;
      if (this.currentTarget > this.selectTarget) {
        this.currentTarget = this.selectTarget;
      }
    }
    if (this.currentTarget > this.selectTarget) {
      this.currentTarget -= SELECT_MOVE;
      if (this.currentTarget < this.selectTarget) {
        this.currentTarget = this.selectTarget;
      }
    }
    this.playerSelectionWheel.rotation.y = -this.currentTarget * Math.PI * 2 / this.playerModels.length;
    if (this.currentTarget === this.selectTarget) {
      (document.getElementById("name") as HTMLDivElement).innerHTML = PLAYER_TYPES[this.getSelectedPlayerType()].name;
    } else {
      (document.getElementById("name") as HTMLDivElement).innerHTML = "";
    }
  }

  getSelectedPlayerType(): number {
    return (this.selectTarget < 0 ? (PLAYER_TYPES.length + (this.selectTarget % PLAYER_TYPES.length)) : this.selectTarget) % PLAYER_TYPES.length
  }

  start(): void {
    Dusk.initClient({
      onChange: ({ game, yourPlayerId }) => {
        this.localPlayerId = yourPlayerId;
        this.game = game;

        for (const m of game.movers) {
          const body = game.world.bodies.find(b => b.id === m.bodyId);
          if (body) {
            const obj = this.scene.getObjectByName(m.name);
            if (obj) {
              obj.position.set(body.center.x, body.center.y, body.center.z);
              obj.rotation.y = body.angle;
            }
          }
        }

        for (const body of game.world.bodies) {
          if (body.dynamic) {
            continue;
          }
          const objBounds = this.scene.getObjectByName(body.id+".bounds");
          if (!objBounds) {
            const geometry = body.type === ShapeType.CYLINDER ? new CylinderGeometry(body.size.x / 2, body.size.x / 2, body.size.y) : new BoxGeometry(body.size.x, body.size.y, body.size.z);
            const material = new MeshBasicMaterial( {color: 0xff0000, wireframe: true, wireframeLinewidth: 4} ); 
            const cube = new Mesh( geometry, material ); 
            cube.name = body.id+".bounds";
            cube.position.set(body.center.x, body.center.y, body.center.z);
            cube.rotation.y = body.angle;
            this.wireframeGroup.add(cube);
          }
        }

        for (const p of game.players) {
          if (!this.players[p.id]) {
            this.players[p.id] = copyGLTF(this.playerModels[p.type]);
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

          if (p.vy < 0) {
            animateGLTF(this.players[p.id], "jump");
          } else if (p.vy > 0) {
            animateGLTF(this.players[p.id], "fall");
          } else if (p.controls.x !== 0 || p.controls.y !== 0) {
            animateGLTF(this.players[p.id], "sprint");
          } else {
            animateGLTF(this.players[p.id], "idle");
          }
        }

      }
    });

    this.render();
  }

  render(): void {
    if (this.atPlayerSelect) {
      (document.getElementById("jump") as HTMLImageElement).style.display = "none";
      (document.getElementById("joystick") as HTMLImageElement).style.display = "none";

      this.ambient.intensity = 3;
      this.updateTarget();
    } else {
      (document.getElementById("jump") as HTMLImageElement).style.display = "block";
      (document.getElementById("joystick") as HTMLImageElement).style.display = "block";
      this.ambient.intensity = 1;
    }
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

  sendControls(): void {
    if (Date.now() - this.lastActionSent > SEND_ACTION_INTERVAL && this.localPlayerId) {
      if (this.lastSentControls.x !== this.controls.x || this.lastSentControls.y !== this.controls.y || this.lastSentControls.jump !== this.controls.jump) {
        this.lastSentControls = { ...this.controls };

        Dusk.actions.controls(this.lastSentControls);
        this.lastActionSent = Date.now();
      }
    }
  }

  renderScene(): void {
    this.sendControls();

    if (this.game) {
      const p = this.game.players.find(p => p.id === this.localPlayerId);
      if (p) {
        this.setDebug("FPS:" + this.fps + " controls: " + this.controls.x + "," + this.controls.y + "," + this.controls.jump + "  -  " + p.onGround);
        this.setDebug(this.game.players.map(p => p.vy).join(","));

      } else {
        this.setDebug("FPS:" + this.fps + " controls: " + this.controls.x + "," + this.controls.y + "," + this.controls.jump + " ");
      }
    }
    if (this.playerObject) {
      const direction = new Vector3();
      this.playerObject.getWorldDirection(direction);
      const h = 2;
      const frontDistance = 5;
      const y = this.playerObject.position.y;
      this.camera.position.set(this.playerObject.position.x + (this.viewDistance * -direction.x), y + h, this.playerObject.position.z + (this.viewDistance * -direction.z));
      this.camera.lookAt(this.playerObject.position.x + (frontDistance * direction.x), y, this.playerObject.position.z + (frontDistance * direction.z));
      const ray = new Vector3();
      ray.copy(this.playerObject.position);
      ray.y += PLAYER_HEIGHT;
      ray.sub(this.camera.position)
      this.raycaster.set(this.camera.position, ray);
      
      const hiddenThisFrame: Mesh[] = [];
      const intersections = this.raycaster.intersectObject(this.scene, true);
      for (const intersection of intersections) {
        if (intersection.distance > ray.length()) {
          continue;
        }
        const hit = intersection.object;
        if (hit instanceof Mesh) {
          if (!this.hidden.includes(hit)) {
            hit.material.transparent = true;
            hit.material.opacity = 0.2;
            hit.material.needsUpdate = true;
            this.hidden.push(hit);
          }
          hiddenThisFrame.push(hit);
        }
      }
      const unhide: Mesh[] = this.hidden.filter(h => !hiddenThisFrame.includes(h));
      for (const object of unhide) {
        if (object instanceof Mesh && object.material instanceof Material) {
          this.hidden.splice(this.hidden.indexOf(object), 1);
          object.material.transparent = false;
          object.material.opacity = 1;
          object.material.needsUpdate = true;
        }
      }

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

const game = new JumpDudesGame();
game.loadAssets().then(() => {
  game.start();
})