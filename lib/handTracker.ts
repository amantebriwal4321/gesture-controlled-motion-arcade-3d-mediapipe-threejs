import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

const WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;

const PINCH_ON = 0.32;
const PINCH_OFF = 0.45;
const SMOOTHING = 0.45;

// Connections for hand skeleton drawing
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // Index
  [5, 9], [9, 10], [10, 11], [11, 12],  // Middle
  [9, 13], [13, 14], [14, 15], [15, 16],// Ring
  [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
  [0, 17]                               // Palm
];

export type GestureMode = "idle" | "spin" | "zoom";

export interface TrackerStatus {
  hands: number;
  mode: GestureMode;
  pinching: boolean;
}

export interface HandTrackerCallbacks {
  onRotate(deltaTheta: number, deltaPhi: number): void;
  onZoom(factor: number): void;
  onStatus(status: TrackerStatus): void;
  onHandMove?(x: number, y: number, isPinching: boolean, handIndex: number): void;
}

interface Point { x: number; y: number }

interface HandState {
  pinching: boolean;
  grab: Point;
}

export class HandTracker {
  private video: HTMLVideoElement;
  private overlay: HTMLCanvasElement;
  private callbacks: HandTrackerCallbacks;
  private landmarker: HandLandmarker | null = null;
  private stream: MediaStream | null = null;
  private rafId = 0;
  private running = false;
  private lastVideoTime = -1;
  private handStates = new Map<string, HandState>();
  private prevMode: GestureMode = "idle";
  private prevSpinGrab: Point | null = null;
  private prevZoomDist: number | null = null;
  private lastStatus: TrackerStatus = { hands: 0, mode: "idle", pinching: false };

  constructor(video: HTMLVideoElement, overlay: HTMLCanvasElement, callbacks: HandTrackerCallbacks) {
    this.video = video;
    this.overlay = overlay;
    this.callbacks = callbacks;
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();

    const fileset = await FilesetResolver.forVisionTasks(WASM_CDN);
    const opts = {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" as const },
      runningMode: "VIDEO" as const,
      numHands: 2,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
    };
    try {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, opts);
    } catch {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, {
        ...opts,
        baseOptions: { ...opts.baseOptions, delegate: "CPU" as const },
      });
    }
    this.running = true;
    this.loop();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.landmarker?.close();
    this.landmarker = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.handStates.clear();
    this.prevMode = "idle";
    this.prevSpinGrab = null;
    this.prevZoomDist = null;
    const ctx = this.overlay.getContext("2d");
    ctx?.clearRect(0, 0, this.overlay.width, this.overlay.height);
    this.emitStatus({ hands: 0, mode: "idle", pinching: false });
  }

  private loop = () => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);
    if (!this.landmarker || this.video.readyState < 2) return;
    if (this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;

    const result = this.landmarker.detectForVideo(this.video, performance.now());
    this.processHands(result.landmarks, result.handedness.map((h) => h[0]?.categoryName ?? "?"));
    this.drawOverlay(result.landmarks);
  };

  private processHands(landmarks: NormalizedLandmark[][], labels: string[]): void {
    const pinchedGrabs: Point[] = [];
    const seen = new Set<string>();
    let anyPinching = false;

    landmarks.forEach((lm, i) => {
      const label = labels[i];
      seen.add(label);
      const handScale = dist(lm[WRIST], lm[MIDDLE_MCP]);
      if (handScale < 1e-6) return;
      const pinchRatio = dist(lm[THUMB_TIP], lm[INDEX_TIP]) / handScale;

      const raw: Point = {
        x: 1 - (lm[THUMB_TIP].x + lm[INDEX_TIP].x) / 2,
        y: (lm[THUMB_TIP].y + lm[INDEX_TIP].y) / 2,
      };

      let st = this.handStates.get(label);
      if (!st) {
        st = { pinching: false, grab: raw };
        this.handStates.set(label, st);
      }

      if (st.pinching && pinchRatio > PINCH_OFF) st.pinching = false;
      else if (!st.pinching && pinchRatio < PINCH_ON) st.pinching = true;

      st.grab = {
        x: st.grab.x + (raw.x - st.grab.x) * SMOOTHING,
        y: st.grab.y + (raw.y - st.grab.y) * SMOOTHING,
      };

      if (st.pinching) {
        pinchedGrabs.push(st.grab);
        anyPinching = true;
      }

      if (this.callbacks.onHandMove) {
        this.callbacks.onHandMove(st.grab.x, st.grab.y, st.pinching, i);
      }
    });

    for (const key of this.handStates.keys()) {
      if (!seen.has(key)) this.handStates.delete(key);
    }

    const mode: GestureMode = pinchedGrabs.length >= 2 ? "zoom" : pinchedGrabs.length === 1 ? "spin" : "idle";

    if (mode !== this.prevMode) {
      this.prevSpinGrab = null;
      this.prevZoomDist = null;
      this.prevMode = mode;
    }

    if (mode === "spin") {
      const grab = pinchedGrabs[0];
      if (this.prevSpinGrab) {
        const dx = grab.x - this.prevSpinGrab.x;
        const dy = grab.y - this.prevSpinGrab.y;
        if (Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4) {
          this.callbacks.onRotate(dx * 5, dy * 5);
        }
      }
      this.prevSpinGrab = grab;
    } else if (mode === "zoom") {
      const d = Math.hypot(pinchedGrabs[0].x - pinchedGrabs[1].x, pinchedGrabs[0].y - pinchedGrabs[1].y);
      if (this.prevZoomDist && d > 1e-4) {
        this.callbacks.onZoom(Math.min(1.18, Math.max(0.85, this.prevZoomDist / d)));
      }
      this.prevZoomDist = d;
    }

    this.emitStatus({ hands: landmarks.length, mode, pinching: anyPinching });
  }

  private emitStatus(s: TrackerStatus): void {
    if (s.hands !== this.lastStatus.hands || s.mode !== this.lastStatus.mode || s.pinching !== this.lastStatus.pinching) {
      this.lastStatus = s;
      this.callbacks.onStatus(s);
    }
  }

  private drawOverlay(landmarks: NormalizedLandmark[][]): void {
    const ctx = this.overlay.getContext("2d");
    if (!ctx) return;
    const { width, height } = this.overlay;
    ctx.clearRect(0, 0, width, height);

    for (const lm of landmarks) {
      const thumb = lm[THUMB_TIP], index = lm[INDEX_TIP];
      const tx = (1 - thumb.x) * width, ty = thumb.y * height;
      const ix = (1 - index.x) * width, iy = index.y * height;
      const handScale = dist(lm[WRIST], lm[MIDDLE_MCP]);
      const pinched = handScale > 1e-6 && dist(thumb, index) / handScale < PINCH_ON;

      // Draw full hand skeleton
      ctx.strokeStyle = pinched ? "rgba(245, 158, 11, 0.8)" : "rgba(56, 189, 248, 0.6)";
      ctx.lineWidth = pinched ? 2.5 : 1.5;

      for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
        const p1 = lm[startIdx], p2 = lm[endIdx];
        ctx.beginPath();
        ctx.moveTo((1 - p1.x) * width, p1.y * height);
        ctx.lineTo((1 - p2.x) * width, p2.y * height);
        ctx.stroke();
      }

      // Draw Joint points
      ctx.fillStyle = pinched ? "#f59e0b" : "#38bdf8";
      for (const pt of lm) {
        const px = (1 - pt.x) * width, py = pt.y * height;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw glowing pinch laser reticle
      const cx = (tx + ix) / 2;
      const cy = (ty + iy) / 2;

      if (pinched) {
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = "bold 10px monospace";
        ctx.fillStyle = "#ef4444";
        ctx.textAlign = "center";
        ctx.fillText("FIRING", cx, cy - 18);
      } else {
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}

function dist(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
