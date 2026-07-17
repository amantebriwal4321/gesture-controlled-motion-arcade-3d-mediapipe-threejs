import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

export interface GameState {
  score: number;
  health: number;
  gameOver: boolean;
  gameStarted: boolean;
  highScore: number;
  speed: number;
}

export interface GameSceneApi {
  moveShip(x: number, y: number): void;
  shoot(): void;
  startGame(): void;
  resetGame(): void;
  toggleSound(): boolean;
  onStateChange(cb: (s: GameState) => void): void;
  dispose(): void;
}

/* ── PROCEDURAL SYNTHESIZER ── */
class AudioSynth {
  private ctx: AudioContext | null = null;
  private muted = false;
  private bgOsc: OscillatorNode | null = null;
  private bgGain: GainNode | null = null;

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.muted) this.stopBg();
    else this.startBg();
    return this.muted;
  }

  playLaser() {
    if (this.muted) return;
    this.initCtx();
    const c = this.ctx;
    if (!c) return;

    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(1200, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.12);

    gain.gain.setValueAtTime(0.12, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.12);
  }

  playExplosion() {
    if (this.muted) return;
    this.initCtx();
    const c = this.ctx;
    if (!c) return;

    const bufferSize = c.sampleRate * 0.35;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);

    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = data[i];
      data[i] *= 3.5;
    }

    const noise = c.createBufferSource();
    noise.buffer = buffer;

    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(600, c.currentTime);
    filter.frequency.exponentialRampToValueAtTime(30, c.currentTime + 0.35);

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.3, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.35);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);

    noise.start();
    noise.stop(c.currentTime + 0.35);
  }

  playHit() {
    if (this.muted) return;
    this.initCtx();
    const c = this.ctx;
    if (!c) return;

    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(220, c.currentTime);
    osc.frequency.linearRampToValueAtTime(70, c.currentTime + 0.1);

    gain.gain.setValueAtTime(0.18, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.1);
  }

  startBg() {
    if (this.muted || this.bgOsc) return;
    this.initCtx();
    const c = this.ctx;
    if (!c) return;

    const loop = () => {
      if (this.muted || !this.ctx) return;
      const step = 60 / 128 / 2;
      const bassNotes = [55, 55, 65.4, 65.4, 73.4, 73.4, 82.4, 82.4];
      const now = c.currentTime;

      this.bgGain = c.createGain();
      this.bgGain.gain.setValueAtTime(0.04, now);

      this.bgOsc = c.createOscillator();
      this.bgOsc.type = "sawtooth";

      for (let i = 0; i < 32; i++) {
        const time = now + i * step;
        const note = bassNotes[Math.floor(i / 2) % bassNotes.length];
        this.bgOsc.frequency.setValueAtTime(note, time);
      }

      const filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(400, now);

      this.bgOsc.connect(filter);
      filter.connect(this.bgGain);
      this.bgGain.connect(c.destination);

      this.bgOsc.start(now);
      this.bgOsc.onended = () => {
        this.bgOsc = null;
        if (!this.muted) loop();
      };
      this.bgOsc.stop(now + 32 * step);
    };
    loop();
  }

  stopBg() {
    try {
      this.bgOsc?.stop();
    } catch {}
    this.bgOsc = null;
    this.bgGain = null;
  }
}

/* ════════════════════════════════════════════════════════════════════
   MAIN THREE.JS GAME ENGINE
   ════════════════════════════════════════════════════════════════════ */
export function createGameScene(container: HTMLElement): GameSceneApi {
  const width = container.clientWidth;
  const height = container.clientHeight;
  const synth = new AudioSynth();

  let highScore = 0;
  try {
    highScore = Number(localStorage.getItem("ultron_hi") || "0");
  } catch {}

  const state: GameState = {
    score: 0,
    health: 100,
    gameOver: false,
    gameStarted: false,
    highScore,
    speed: 1.0,
  };

  let onStateChangeCb: ((s: GameState) => void) | null = null;
  const emitState = () => {
    if (onStateChangeCb) onStateChangeCb({ ...state });
  };

  // ——— SCENE & RENDERER SETUP ———
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x020617, 0.012);

  const camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 600);
  camera.position.set(0, 0, 8);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  container.appendChild(renderer.domElement);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    1.7,  // bloom strength
    0.4,  // radius
    0.15  // threshold
  );
  composer.addPass(bloomPass);

  // ——— LIGHTING ———
  const ambientLight = new THREE.AmbientLight(0x0f172a, 1.5);
  scene.add(ambientLight);

  const mainLight = new THREE.DirectionalLight(0x38bdf8, 2.5);
  mainLight.position.set(10, 15, 20);
  scene.add(mainLight);

  const rimLight = new THREE.DirectionalLight(0xf43f5e, 1.8);
  rimLight.position.set(-10, -10, -20);
  scene.add(rimLight);

  const shipLight = new THREE.PointLight(0x06b6d4, 3.5, 18);
  scene.add(shipLight);

  // ——— PRACTICAL SUPERSONIC COMBAT FIGHTER AIRCRAFT ———
  const ship = new THREE.Group();
  scene.add(ship);

  // Main Tapered Fuselage
  const noseGeom = new THREE.ConeGeometry(0.35, 1.8, 6);
  noseGeom.rotateX(Math.PI / 2);
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    emissive: 0x0284c7,
    emissiveIntensity: 0.35,
    metalness: 0.95,
    roughness: 0.15,
  });
  const nose = new THREE.Mesh(noseGeom, darkMetalMat);
  ship.add(nose);

  // Rear Jet Body Core
  const coreBodyGeom = new THREE.BoxGeometry(0.7, 0.4, 1.2);
  const coreBody = new THREE.Mesh(coreBodyGeom, darkMetalMat);
  coreBody.position.set(0, 0, 0.4);
  ship.add(coreBody);

  // Dual Tinted Glass Canopy
  const canopyGeom = new THREE.SphereGeometry(0.22, 16, 16);
  canopyGeom.scale(0.75, 0.55, 2.2);
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x06b6d4,
    emissiveIntensity: 1.0,
    metalness: 0.9,
    roughness: 0.05,
  });
  const canopy = new THREE.Mesh(canopyGeom, canopyMat);
  canopy.position.set(0, 0.16, -0.2);
  ship.add(canopy);

  // Swept Dual Forward Tactical Wings
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(1.8, -0.4);
  wingShape.lineTo(1.6, -1.1);
  wingShape.lineTo(0, -0.7);
  wingShape.closePath();

  const extrudeOpts = { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02 };
  const wingGeom = new THREE.ExtrudeGeometry(wingShape, extrudeOpts);
  wingGeom.rotateX(Math.PI / 2);

  const wingMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    emissive: 0x0369a1,
    emissiveIntensity: 0.4,
    metalness: 0.85,
    roughness: 0.2,
  });

  const leftWing = new THREE.Mesh(wingGeom, wingMat);
  leftWing.position.set(-0.2, 0, 0.2);
  ship.add(leftWing);

  const rightWing = new THREE.Mesh(wingGeom, wingMat);
  rightWing.scale.set(-1, 1, 1);
  rightWing.position.set(0.2, 0, 0.2);
  ship.add(rightWing);

  // Vertical Tail Stabilizers
  for (const sx of [-0.3, 0.3]) {
    const tailGeom = new THREE.BoxGeometry(0.05, 0.5, 0.6);
    tailGeom.rotateX(Math.PI / 6);
    const tail = new THREE.Mesh(tailGeom, darkMetalMat);
    tail.position.set(sx, 0.3, 0.8);
    ship.add(tail);
  }

  // Double Wingtip Plasma Cannons
  const cannonGeom = new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8);
  cannonGeom.rotateX(Math.PI / 2);
  const cannonMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x38bdf8,
    emissiveIntensity: 1.8,
  });

  for (const sx of [-1.75, 1.75]) {
    const cannon = new THREE.Mesh(cannonGeom, cannonMat);
    cannon.position.set(sx, -0.02, -0.2);
    ship.add(cannon);
  }

  // Quad Glowing Thruster Nozzles
  const thrusterGeom = new THREE.ConeGeometry(0.14, 0.7, 12);
  thrusterGeom.rotateX(-Math.PI / 2);
  const thrusterMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

  const thrusters: THREE.Mesh[] = [];
  for (const sx of [-0.22, 0.22]) {
    const tMesh = new THREE.Mesh(thrusterGeom, thrusterMat);
    tMesh.position.set(sx, 0, 1.05);
    ship.add(tMesh);
    thrusters.push(tMesh);
  }

  // Engine Exhaust Particle Trail
  const EXHAUST_COUNT = 80;
  const exhaustGeom = new THREE.BufferGeometry();
  const exhaustPos = new Float32Array(EXHAUST_COUNT * 3);
  const exhaustVels = new Float32Array(EXHAUST_COUNT * 3);
  const exhaustLife = new Float32Array(EXHAUST_COUNT);

  for (let i = 0; i < EXHAUST_COUNT; i++) {
    exhaustPos[i * 3 + 2] = 100; // Offscreen initially
    exhaustLife[i] = 0;
  }
  exhaustGeom.setAttribute("position", new THREE.BufferAttribute(exhaustPos, 3));

  const exhaustMat = new THREE.PointsMaterial({
    color: 0x38bdf8,
    size: 0.14,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
  });
  const exhaustSystem = new THREE.Points(exhaustGeom, exhaustMat);
  scene.add(exhaustSystem);
  let exhaustIndex = 0;

  const targetPos = new THREE.Vector2(0, 0);
  const PLAY_AREA_W = 5.2;
  const PLAY_AREA_H = 3.6;

  // ——— MULTI-COLORED STARFIELD BACKGROUND ———
  const STAR_COUNT = 1800;
  const starGeom = new THREE.BufferGeometry();
  const starPositions = new Float32Array(STAR_COUNT * 3);
  const starColors = new Float32Array(STAR_COUNT * 3);
  const starSpeeds = new Float32Array(STAR_COUNT);

  const palette = [
    new THREE.Color(0x38bdf8),
    new THREE.Color(0x818cf8),
    new THREE.Color(0xc084fc),
    new THREE.Color(0xffffff),
  ];

  for (let i = 0; i < STAR_COUNT; i++) {
    starPositions[i * 3] = (Math.random() - 0.5) * 60;
    starPositions[i * 3 + 1] = (Math.random() - 0.5) * 45;
    starPositions[i * 3 + 2] = -Math.random() * 220;

    const col = palette[Math.floor(Math.random() * palette.length)];
    starColors[i * 3] = col.r;
    starColors[i * 3 + 1] = col.g;
    starColors[i * 3 + 2] = col.b;

    starSpeeds[i] = 1.2 + Math.random() * 2.8;
  }

  starGeom.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  starGeom.setAttribute("color", new THREE.BufferAttribute(starColors, 3));

  const starMat = new THREE.PointsMaterial({
    size: 0.16,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
  });
  const starField = new THREE.Points(starGeom, starMat);
  scene.add(starField);

  // ——— CYBER GRID TUNNEL RINGS ———
  const RING_COUNT = 12;
  const rings: THREE.LineLoop[] = [];
  for (let i = 0; i < RING_COUNT; i++) {
    const ringGeom = new THREE.RingGeometry(8.5, 8.62, 32);
    const ringMat = new THREE.LineBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.12 + (i / RING_COUNT) * 0.35,
    });
    const ring = new THREE.LineLoop(ringGeom, ringMat);
    ring.position.z = -i * 18;
    scene.add(ring);
    rings.push(ring);
  }

  // ——— HIGH VISIBILITY OBSTACLES & BULLETS ———
  interface Projectile {
    mesh: THREE.Group;
    velocity: THREE.Vector3;
  }

  interface Obstacle {
    mesh: THREE.Group;
    type: "magma_asteroid" | "cyber_mine";
    speed: number;
    rotX: number;
    rotY: number;
    radius: number;
  }

  interface ExplosionParticle {
    mesh: THREE.Points;
    life: number;
    maxLife: number;
    velocities: Float32Array;
  }

  const projectiles: Projectile[] = [];
  const obstacles: Obstacle[] = [];
  const explosions: ExplosionParticle[] = [];

  // Large visible Laser Energy Bullet Template
  function createLaserBulletMesh(): THREE.Group {
    const group = new THREE.Group();

    const coreGeom = new THREE.CylinderGeometry(0.08, 0.08, 1.4, 8);
    coreGeom.rotateX(Math.PI / 2);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const core = new THREE.Mesh(coreGeom, coreMat);
    group.add(core);

    const haloGeom = new THREE.CylinderGeometry(0.18, 0.18, 1.5, 8);
    haloGeom.rotateX(Math.PI / 2);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });
    const halo = new THREE.Mesh(haloGeom, haloMat);
    group.add(halo);

    return group;
  }

  // Create High-Visibility Magma Asteroid
  function createMagmaAsteroidMesh(radius: number): THREE.Group {
    const group = new THREE.Group();

    const geom = new THREE.IcosahedronGeometry(radius, 1);
    const posAttr = geom.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < posAttr.count; i++) {
      v.fromBufferAttribute(posAttr, i).multiplyScalar(0.85 + Math.random() * 0.3);
      posAttr.setXYZ(i, v.x, v.y, v.z);
    }
    geom.computeVertexNormals();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1e1b4b,
      roughness: 0.8,
      metalness: 0.3,
    });
    const body = new THREE.Mesh(geom, bodyMat);
    group.add(body);

    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      wireframe: true,
    });
    const wire = new THREE.Mesh(geom, wireMat);
    wire.scale.setScalar(1.02);
    group.add(wire);

    const light = new THREE.PointLight(0xf43f5e, 2.0, 6);
    group.add(light);

    return group;
  }

  // Create Cyber Defense Mine
  function createCyberMineMesh(radius: number): THREE.Group {
    const group = new THREE.Group();

    const sphereGeom = new THREE.SphereGeometry(radius * 0.75, 12, 12);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0369a1,
      emissiveIntensity: 0.6,
      metalness: 0.9,
      roughness: 0.1,
    });
    const sphere = new THREE.Mesh(sphereGeom, sphereMat);
    group.add(sphere);

    const spikeCount = 6;
    for (let i = 0; i < spikeCount; i++) {
      const spikeGeom = new THREE.ConeGeometry(0.12, radius * 1.6, 6);
      spikeGeom.rotateX(Math.PI / 2);
      const spikeMat = new THREE.MeshStandardMaterial({ color: 0xe0e7ff, metalness: 0.9 });
      const spike = new THREE.Mesh(spikeGeom, spikeMat);

      const angle = (i / spikeCount) * Math.PI * 2;
      spike.position.set(Math.cos(angle) * radius * 0.5, Math.sin(angle) * radius * 0.5, 0);
      spike.rotation.z = angle;
      group.add(spike);
    }

    const auraGeom = new THREE.RingGeometry(radius * 1.1, radius * 1.25, 24);
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const aura = new THREE.Mesh(auraGeom, auraMat);
    group.add(aura);

    const light = new THREE.PointLight(0xf59e0b, 2.5, 8);
    group.add(light);

    return group;
  }

  function spawnObstacle() {
    const radius = 0.55 + Math.random() * 0.65;
    const isMine = Math.random() < 0.4;

    const group = isMine ? createCyberMineMesh(radius) : createMagmaAsteroidMesh(radius);
    group.position.set(
      (Math.random() - 0.5) * PLAY_AREA_W * 1.8,
      (Math.random() - 0.5) * PLAY_AREA_H * 1.8,
      -150
    );

    scene.add(group);
    obstacles.push({
      mesh: group,
      type: isMine ? "cyber_mine" : "magma_asteroid",
      speed: 0.6 + Math.random() * 0.6 + (state.score / 250) * 0.1,
      rotX: (Math.random() - 0.5) * 0.05,
      rotY: (Math.random() - 0.5) * 0.05,
      radius,
    });
  }

  function spawnExplosion(pos: THREE.Vector3, colorHex: number, scale = 1.0) {
    const particleCount = Math.floor(45 * scale);
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const speed = (0.06 + Math.random() * 0.16) * scale;

      velocities[i * 3] = speed * Math.sin(phi) * Math.cos(theta);
      velocities[i * 3 + 1] = speed * Math.sin(phi) * Math.sin(theta);
      velocities[i * 3 + 2] = speed * Math.cos(phi);
    }

    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: colorHex,
      size: 0.22 * scale,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
    });

    const pSystem = new THREE.Points(geom, mat);
    scene.add(pSystem);
    explosions.push({
      mesh: pSystem,
      life: 0,
      maxLife: 30,
      velocities,
    });
  }

  let shootCooldown = 0;
  function triggerShoot() {
    if (!state.gameStarted || state.gameOver || shootCooldown > 0) return;
    synth.playLaser();

    for (const offset of [-1.75, 1.75]) {
      const bullet = createLaserBulletMesh();
      bullet.position.copy(ship.position);
      bullet.position.x += offset;
      bullet.position.z -= 0.6;

      scene.add(bullet);
      projectiles.push({
        mesh: bullet,
        velocity: new THREE.Vector3(0, 0, -1.8),
      });
    }

    shootCooldown = 8;
  }

  let cameraShake = 0;
  function takeDamage(amount: number) {
    state.health = Math.max(0, state.health - amount);
    cameraShake = 0.55;
    synth.playHit();
    emitState();

    if (state.health <= 0) {
      handleGameOver();
    }
  }

  function handleGameOver() {
    state.gameOver = true;
    synth.playExplosion();
    synth.stopBg();
    spawnExplosion(ship.position, 0x38bdf8, 2.0);
    ship.visible = false;

    if (state.score > state.highScore) {
      state.highScore = state.score;
      try {
        localStorage.setItem("ultron_hi", String(state.highScore));
      } catch {}
    }
    emitState();
  }

  // ——— ANIMATION & PHYSICS RENDER LOOP ———
  let time = 0;
  let spawnTimer = 0;
  let rafId = 0;

  function renderLoop() {
    rafId = requestAnimationFrame(renderLoop);
    time += 0.015;

    if (!state.gameOver) {
      ship.position.x += (targetPos.x - ship.position.x) * 0.16;
      ship.position.y += (targetPos.y - ship.position.y) * 0.16;

      const deltaX = targetPos.x - ship.position.x;
      ship.rotation.z = -deltaX * 0.38;
      ship.rotation.y = deltaX * 0.16;
      ship.rotation.x = Math.sin(time * 3) * 0.04;

      shipLight.position.copy(ship.position);

      thrusters.forEach((t) => {
        t.scale.set(1, 1, 1 + Math.sin(time * 40) * 0.25);
      });

      // Spawn Engine Exhaust Particles
      for (let e = 0; e < 2; e++) {
        const idx = exhaustIndex % EXHAUST_COUNT;
        exhaustPos[idx * 3] = ship.position.x + (Math.random() - 0.5) * 0.2;
        exhaustPos[idx * 3 + 1] = ship.position.y + (Math.random() - 0.5) * 0.1;
        exhaustPos[idx * 3 + 2] = ship.position.z + 1.1;

        exhaustVels[idx * 3] = (Math.random() - 0.5) * 0.02;
        exhaustVels[idx * 3 + 1] = (Math.random() - 0.5) * 0.02;
        exhaustVels[idx * 3 + 2] = 0.08 + Math.random() * 0.06;

        exhaustLife[idx] = 18;
        exhaustIndex++;
      }
    }

    // Update Engine Particles
    for (let i = 0; i < EXHAUST_COUNT; i++) {
      if (exhaustLife[i] > 0) {
        exhaustPos[i * 3] += exhaustVels[i * 3];
        exhaustPos[i * 3 + 1] += exhaustVels[i * 3 + 1];
        exhaustPos[i * 3 + 2] += exhaustVels[i * 3 + 2];
        exhaustLife[i]--;
        if (exhaustLife[i] <= 0) exhaustPos[i * 3 + 2] = 100;
      }
    }
    exhaustGeom.attributes.position.needsUpdate = true;

    // Camera Shake Effect
    if (cameraShake > 0) {
      camera.position.x = (Math.random() - 0.5) * cameraShake;
      camera.position.y = (Math.random() - 0.5) * cameraShake;
      cameraShake *= 0.84;
      if (cameraShake < 0.01) {
        cameraShake = 0;
        camera.position.set(0, 0, 8);
      }
    }

    // Starfield Movement
    const starArr = starGeom.attributes.position.array as Float32Array;
    for (let i = 0; i < STAR_COUNT; i++) {
      starArr[i * 3 + 2] += starSpeeds[i] * 0.15;
      if (starArr[i * 3 + 2] > 10) {
        starArr[i * 3 + 2] = -220;
        starArr[i * 3] = (Math.random() - 0.5) * 60;
        starArr[i * 3 + 1] = (Math.random() - 0.5) * 45;
      }
    }
    starGeom.attributes.position.needsUpdate = true;

    // Cyber Rings Movement
    for (let i = 0; i < RING_COUNT; i++) {
      rings[i].position.z += 0.15;
      rings[i].rotation.z += 0.002 * (i % 2 === 0 ? 1 : -1);
      if (rings[i].position.z > 10) rings[i].position.z = -150;
    }

    // Active Gameplay Loop
    if (state.gameStarted && !state.gameOver) {
      if (shootCooldown > 0) shootCooldown--;

      spawnTimer++;
      if (spawnTimer > Math.max(18, 36 - Math.floor(state.score / 150))) {
        spawnObstacle();
        spawnTimer = 0;
      }

      // Update Projectiles
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.mesh.position.add(p.velocity);
        if (p.mesh.position.z < -160) {
          scene.remove(p.mesh);
          projectiles.splice(i, 1);
        }
      }

      // Update Obstacles & Check Collisions
      for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        obs.mesh.position.z += obs.speed;
        obs.mesh.rotation.x += obs.rotX;
        obs.mesh.rotation.y += obs.rotY;

        if (Math.abs(obs.mesh.position.z - ship.position.z) < 1.2) {
          const distToShip = Math.hypot(
            obs.mesh.position.x - ship.position.x,
            obs.mesh.position.y - ship.position.y
          );
          if (distToShip < obs.radius + 0.55 && ship.visible) {
            takeDamage(25);
            spawnExplosion(obs.mesh.position, obs.type === "cyber_mine" ? 0xf59e0b : 0xf43f5e, 1.2);
            scene.remove(obs.mesh);
            obstacles.splice(i, 1);
            continue;
          }
        }

        if (obs.mesh.position.z > 12) {
          scene.remove(obs.mesh);
          obstacles.splice(i, 1);
          continue;
        }

        for (let j = projectiles.length - 1; j >= 0; j--) {
          const p = projectiles[j];
          if (obs.mesh.position.distanceTo(p.mesh.position) < obs.radius + 0.35) {
            synth.playExplosion();
            spawnExplosion(obs.mesh.position, obs.type === "cyber_mine" ? 0xf59e0b : 0xf43f5e, 1.4);

            scene.remove(obs.mesh);
            obstacles.splice(i, 1);

            scene.remove(p.mesh);
            projectiles.splice(j, 1);

            state.score += obs.type === "cyber_mine" ? 25 : 15;
            emitState();
            break;
          }
        }
      }
    }

    // Update Particle Explosions
    for (let i = explosions.length - 1; i >= 0; i--) {
      const exp = explosions[i];
      exp.life++;

      const pArr = exp.mesh.geometry.attributes.position.array as Float32Array;
      for (let k = 0; k < pArr.length / 3; k++) {
        pArr[k * 3] += exp.velocities[k * 3];
        pArr[k * 3 + 1] += exp.velocities[k * 3 + 1];
        pArr[k * 3 + 2] += exp.velocities[k * 3 + 2];
      }
      exp.mesh.geometry.attributes.position.needsUpdate = true;
      (exp.mesh.material as THREE.PointsMaterial).opacity = 1.0 - exp.life / exp.maxLife;

      if (exp.life >= exp.maxLife) {
        scene.remove(exp.mesh);
        exp.mesh.geometry.dispose();
        (exp.mesh.material as THREE.Material).dispose();
        explosions.splice(i, 1);
      }
    }

    composer.render();
  }

  function handleResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  }
  window.addEventListener("resize", handleResize);
  renderLoop();

  return {
    moveShip(x: number, y: number) {
      targetPos.x = (x - 0.5) * PLAY_AREA_W * 2;
      targetPos.y = -(y - 0.5) * PLAY_AREA_H * 2;
    },
    shoot() {
      triggerShoot();
    },
    startGame() {
      state.gameStarted = true;
      state.gameOver = false;
      state.health = 100;
      state.score = 0;

      ship.visible = true;
      ship.position.set(0, 0, 0);
      targetPos.set(0, 0);

      obstacles.forEach((o) => scene.remove(o.mesh));
      projectiles.forEach((p) => scene.remove(p.mesh));
      obstacles.length = 0;
      projectiles.length = 0;

      synth.startBg();
      emitState();
    },
    resetGame() {
      this.startGame();
    },
    toggleSound() {
      return synth.toggleMute();
    },
    onStateChange(cb) {
      onStateChangeCb = cb;
      emitState();
    },
    dispose() {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
      synth.stopBg();
      renderer.dispose();
      composer.dispose();
      container.removeChild(renderer.domElement);
    },
  };
}
