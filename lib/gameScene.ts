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

/* ── tiny procedural audio ── */
class Synth {
  private ctx: AudioContext | null = null;
  private muted = false;
  private bgOsc: OscillatorNode | null = null;
  private bgGain: GainNode | null = null;

  private init() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) this.stopBg();
    else this.startBg();
    return this.muted;
  }

  pew() {
    if (this.muted) return;
    this.init();
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(900, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(120, c.currentTime + 0.1);
    g.gain.setValueAtTime(0.07, c.currentTime);
    g.gain.linearRampToValueAtTime(0, c.currentTime + 0.1);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.1);
  }

  boom() {
    if (this.muted) return;
    this.init();
    const c = this.ctx!;
    const len = c.sampleRate * 0.3;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < len; i++) {
      prev = (prev + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = prev * 3;
    }
    const n = c.createBufferSource();
    n.buffer = buf;
    const g = c.createGain();
    g.gain.setValueAtTime(0.25, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
    n.connect(g).connect(c.destination);
    n.start();
    n.stop(c.currentTime + 0.3);
  }

  hit() {
    if (this.muted) return;
    this.init();
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(140, c.currentTime);
    o.frequency.setValueAtTime(60, c.currentTime + 0.06);
    g.gain.setValueAtTime(0.15, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.12);
  }

  startBg() {
    if (this.muted || !this.ctx || this.bgOsc) return;
    this.init();
    const c = this.ctx!;
    const loop = () => {
      if (this.muted || !this.ctx) return;
      const step = 60 / 125 / 2;
      const notes = [55, 55, 65, 65, 73, 73, 82, 82];
      const now = c.currentTime;
      this.bgGain = c.createGain();
      this.bgGain.gain.setValueAtTime(0.035, now);
      this.bgOsc = c.createOscillator();
      this.bgOsc.type = "square";
      for (let i = 0; i < 32; i++) {
        const t = now + i * step;
        this.bgOsc.frequency.setValueAtTime(notes[Math.floor(i / 2) % 8], t);
        if (i % 2 === 0) {
          this.bgGain.gain.setValueAtTime(0.04, t);
          this.bgGain.gain.exponentialRampToValueAtTime(0.025, t + step * 0.8);
        }
      }
      this.bgOsc.connect(this.bgGain).connect(c.destination);
      this.bgOsc.start(now);
      this.bgOsc.onended = () => { this.bgOsc = null; this.bgGain = null; if (!this.muted) loop(); };
      this.bgOsc.stop(now + 32 * step);
    };
    loop();
  }

  stopBg() {
    try { this.bgOsc?.stop(); } catch {}
    this.bgOsc = null;
    this.bgGain = null;
  }
}

/* ══════════════════════════════════════
   GAME SCENE
   ══════════════════════════════════════ */
export function createGameScene(container: HTMLElement): GameSceneApi {
  const W = container.clientWidth;
  const H = container.clientHeight;
  const synth = new Synth();

  let highScore = 0;
  try { highScore = Number(localStorage.getItem("ns_hi") || "0"); } catch {}

  const state: GameState = {
    score: 0, health: 100, gameOver: false,
    gameStarted: false, highScore,
  };

  let cb: ((s: GameState) => void) | null = null;
  const emit = () => { if (cb) cb({ ...state }); };

  /* ── renderer ── */
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000a14, 0.012);

  const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 500);
  camera.position.set(0, 0, 8);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 1.6, 0.4, 0.2));

  /* ── lights ── */
  scene.add(new THREE.AmbientLight(0x112244));
  const sun = new THREE.DirectionalLight(0x00ccff, 1.2);
  sun.position.set(5, 5, 10);
  scene.add(sun);

  /* ── ship ── */
  const ship = new THREE.Group();
  scene.add(ship);

  const bodyG = new THREE.ConeGeometry(0.35, 1.4, 4);
  bodyG.rotateX(Math.PI / 2);
  const bodyM = new THREE.MeshStandardMaterial({ color: 0x00e0ff, emissive: 0x004466, metalness: 0.8, roughness: 0.2 });
  ship.add(new THREE.Mesh(bodyG, bodyM));

  for (const s of [-1, 1]) {
    const wG = new THREE.ConeGeometry(0.1, 1.0, 3);
    wG.rotateZ(Math.PI / 2);
    const w = new THREE.Mesh(wG, bodyM);
    w.position.set(s * 0.6, -0.08, -0.15);
    ship.add(w);
  }

  const thrG = new THREE.ConeGeometry(0.16, 0.5, 6);
  thrG.rotateX(-Math.PI / 2);
  const thrM = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.8 });
  const thr = new THREE.Mesh(thrG, thrM);
  thr.position.z = 0.8;
  ship.add(thr);

  const target = new THREE.Vector2(0, 0);
  const PLAY_W = 5;
  const PLAY_H = 3.5;

  /* ── stars ── */
  const STAR_N = 1200;
  const starG = new THREE.BufferGeometry();
  const starP = new Float32Array(STAR_N * 3);
  const starS = new Float32Array(STAR_N);
  for (let i = 0; i < STAR_N; i++) {
    starP[i * 3] = (Math.random() - 0.5) * 40;
    starP[i * 3 + 1] = (Math.random() - 0.5) * 30;
    starP[i * 3 + 2] = -Math.random() * 180;
    starS[i] = 1 + Math.random() * 2.5;
  }
  starG.setAttribute("position", new THREE.BufferAttribute(starP, 3));
  const stars = new THREE.Points(starG, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.12, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending,
  }));
  scene.add(stars);

  /* ── tunnel rings ── */
  const RING_N = 10;
  const rings: THREE.LineLoop[] = [];
  for (let i = 0; i < RING_N; i++) {
    const rG = new THREE.RingGeometry(7.5, 7.6, 24);
    const r = new THREE.LineLoop(rG, new THREE.LineBasicMaterial({
      color: 0x002244, transparent: true, opacity: 0.08 + (i / RING_N) * 0.25,
    }));
    r.position.z = -i * 18;
    scene.add(r);
    rings.push(r);
  }

  /* ── entities ── */
  interface Bullet { mesh: THREE.Mesh; vel: THREE.Vector3 }
  interface Rock { mesh: THREE.Mesh; speed: number; rx: number; ry: number; rad: number }
  interface Boom { pts: THREE.Points; life: number; vels: Float32Array }

  const bullets: Bullet[] = [];
  const rocks: Rock[] = [];
  const booms: Boom[] = [];

  const bulletG = new THREE.CylinderGeometry(0.035, 0.035, 0.6, 4);
  bulletG.rotateX(Math.PI / 2);
  const bulletM = new THREE.MeshBasicMaterial({ color: 0x00ffff, blending: THREE.AdditiveBlending });

  const rockMats = [
    new THREE.MeshStandardMaterial({ color: 0xff4422, emissive: 0x1a0600, wireframe: true }),
    new THREE.MeshStandardMaterial({ color: 0xff7700, emissive: 0x2a0e00, wireframe: true }),
  ];

  /* ── helpers ── */
  function spawnRock() {
    const r = 0.4 + Math.random() * 0.65;
    const g = new THREE.IcosahedronGeometry(r, 1);
    const pa = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).multiplyScalar(0.85 + Math.random() * 0.3);
      pa.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, rockMats[Math.floor(Math.random() * 2)]);
    m.position.set(
      (Math.random() - 0.5) * PLAY_W * 1.8,
      (Math.random() - 0.5) * PLAY_H * 1.8,
      -140,
    );
    scene.add(m);
    rocks.push({
      mesh: m,
      speed: 0.5 + Math.random() * 0.7,
      rx: (Math.random() - 0.5) * 0.04,
      ry: (Math.random() - 0.5) * 0.04,
      rad: r,
    });
  }

  function explode(pos: THREE.Vector3, color: number, scale = 1) {
    const n = Math.floor(30 * scale);
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3);
    const v = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 2 - 1);
      const sp = (0.04 + Math.random() * 0.12) * scale;
      v[i * 3] = sp * Math.sin(ph) * Math.cos(th);
      v[i * 3 + 1] = sp * Math.sin(ph) * Math.sin(th);
      v[i * 3 + 2] = sp * Math.cos(ph);
    }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({
      color, size: 0.15 * scale, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending,
    }));
    scene.add(pts);
    booms.push({ pts, life: 0, vels: v });
  }

  /* ── game logic ── */
  let cooldown = 0;
  let spawnTimer = 0;
  let shake = 0;
  let t = 0;
  let raf = 0;

  function fireWeapon() {
    if (!state.gameStarted || state.gameOver || cooldown > 0) return;
    synth.pew();
    for (const dx of [-0.5, 0.5]) {
      const m = new THREE.Mesh(bulletG, bulletM);
      m.position.copy(ship.position);
      m.position.x += dx;
      m.position.z -= 0.7;
      scene.add(m);
      bullets.push({ mesh: m, vel: new THREE.Vector3(0, 0, -1.6) });
    }
    cooldown = 8;
    emit();
  }

  function takeDmg(n: number) {
    state.health = Math.max(0, state.health - n);
    shake = 0.45;
    synth.hit();
    emit();
    if (state.health <= 0) die();
  }

  function die() {
    state.gameOver = true;
    synth.boom();
    synth.stopBg();
    explode(ship.position, 0x00ccff, 1.5);
    ship.visible = false;
    if (state.score > state.highScore) {
      state.highScore = state.score;
      try { localStorage.setItem("ns_hi", String(state.highScore)); } catch {}
    }
    emit();
  }

  /* ── animation loop ── */
  function loop() {
    raf = requestAnimationFrame(loop);
    t += 0.01;

    /* ship smoothing */
    if (!state.gameOver) {
      ship.position.x += (target.x - ship.position.x) * 0.12;
      ship.position.y += (target.y - ship.position.y) * 0.12;
      const dx = target.x - ship.position.x;
      ship.rotation.z = -dx * 0.35;
      ship.rotation.y = dx * 0.15;
      thr.scale.z = 1 + Math.sin(t * 50) * 0.15;
    }

    /* camera shake */
    if (shake > 0) {
      camera.position.x = (Math.random() - 0.5) * shake;
      camera.position.y = (Math.random() - 0.5) * shake;
      shake *= 0.85;
      if (shake < 0.01) { shake = 0; camera.position.set(0, 0, 8); }
    }

    /* stars */
    const sp = starP;
    for (let i = 0; i < STAR_N; i++) {
      sp[i * 3 + 2] += starS[i] * 0.12;
      if (sp[i * 3 + 2] > 10) {
        sp[i * 3 + 2] = -180;
        sp[i * 3] = (Math.random() - 0.5) * 40;
        sp[i * 3 + 1] = (Math.random() - 0.5) * 30;
      }
    }
    stars.geometry.attributes.position.needsUpdate = true;

    /* rings */
    for (let i = 0; i < RING_N; i++) {
      rings[i].position.z += 0.12;
      rings[i].rotation.z += 0.001 * (i % 2 === 0 ? 1 : -1);
      if (rings[i].position.z > 10) rings[i].position.z = -150;
    }

    if (state.gameStarted && !state.gameOver) {
      if (cooldown > 0) cooldown--;

      /* spawn rocks */
      spawnTimer++;
      if (spawnTimer > 30) { spawnRock(); spawnTimer = 0; }

      /* update bullets */
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.mesh.position.add(b.vel);
        if (b.mesh.position.z < -150) {
          scene.remove(b.mesh);
          bullets.splice(i, 1);
        }
      }

      /* update rocks & collisions */
      for (let i = rocks.length - 1; i >= 0; i--) {
        const r = rocks[i];
        r.mesh.position.z += r.speed;
        r.mesh.rotation.x += r.rx;
        r.mesh.rotation.y += r.ry;

        /* rock vs ship */
        if (Math.abs(r.mesh.position.z - ship.position.z) < 1.2) {
          const d = Math.hypot(r.mesh.position.x - ship.position.x, r.mesh.position.y - ship.position.y);
          if (d < r.rad + 0.4 && ship.visible) {
            takeDmg(20);
            explode(r.mesh.position, 0xff6600, 0.8);
            scene.remove(r.mesh);
            rocks.splice(i, 1);
            continue;
          }
        }

        /* past camera */
        if (r.mesh.position.z > 12) {
          scene.remove(r.mesh);
          rocks.splice(i, 1);
          continue;
        }

        /* bullet vs rock */
        for (let j = bullets.length - 1; j >= 0; j--) {
          const b = bullets[j];
          if (r.mesh.position.distanceTo(b.mesh.position) < r.rad + 0.2) {
            synth.boom();
            explode(r.mesh.position, 0xffaa00, 1);
            scene.remove(r.mesh);
            rocks.splice(i, 1);
            scene.remove(b.mesh);
            bullets.splice(j, 1);
            state.score += 10;
            emit();
            break;
          }
        }
      }
    }

    /* update explosions */
    for (let i = booms.length - 1; i >= 0; i--) {
      const b = booms[i];
      b.life++;
      const pa = b.pts.geometry.attributes.position.array as Float32Array;
      for (let k = 0; k < pa.length / 3; k++) {
        pa[k * 3] += b.vels[k * 3];
        pa[k * 3 + 1] += b.vels[k * 3 + 1];
        pa[k * 3 + 2] += b.vels[k * 3 + 2];
      }
      b.pts.geometry.attributes.position.needsUpdate = true;
      (b.pts.material as THREE.PointsMaterial).opacity = 1 - b.life / 28;
      if (b.life >= 28) {
        scene.remove(b.pts);
        b.pts.geometry.dispose();
        (b.pts.material as THREE.Material).dispose();
        booms.splice(i, 1);
      }
    }

    composer.render();
  }

  function onResize() {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  }
  window.addEventListener("resize", onResize);
  loop();

  /* ── public api ── */
  return {
    moveShip(x: number, y: number) {
      target.x = (x - 0.5) * PLAY_W * 2;
      target.y = -(y - 0.5) * PLAY_H * 2;
    },
    shoot() { fireWeapon(); },
    startGame() {
      state.gameStarted = true;
      state.gameOver = false;
      state.health = 100;
      state.score = 0;
      ship.visible = true;
      ship.position.set(0, 0, 0);
      target.set(0, 0);
      rocks.forEach(r => scene.remove(r.mesh));
      bullets.forEach(b => scene.remove(b.mesh));
      rocks.length = 0;
      bullets.length = 0;
      synth.startBg();
      emit();
    },
    resetGame() { this.startGame(); },
    toggleSound() { return synth.toggleMute(); },
    onStateChange(fn) { cb = fn; emit(); },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      synth.stopBg();
      renderer.dispose();
      composer.dispose();
      container.removeChild(renderer.domElement);
    },
  };
}
