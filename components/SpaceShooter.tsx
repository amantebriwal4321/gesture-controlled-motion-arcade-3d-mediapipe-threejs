"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createGameScene, type GameSceneApi, type GameState } from "@/lib/gameScene";
import { HandTracker, type TrackerStatus } from "@/lib/handTracker";

type Cam = "off" | "starting" | "on" | "error";

export default function SpaceShooter() {
  const boxRef = useRef<HTMLDivElement>(null);
  const vidRef = useRef<HTMLVideoElement>(null);
  const ovrRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef<GameSceneApi | null>(null);
  const trkRef = useRef<HandTracker | null>(null);

  const [cam, setCam] = useState<Cam>("off");
  const [trk, setTrk] = useState<TrackerStatus>({ hands: 0, mode: "idle" });
  const [camErr, setCamErr] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [gs, setGs] = useState<GameState>({
    score: 0, health: 100, gameOver: false,
    gameStarted: false, highScore: 0,
  });

  const kbPos = useRef({ x: 0.5, y: 0.5 });
  const keys = useRef<Record<string, boolean>>({});

  /* init scene */
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const api = createGameScene(el);
    apiRef.current = api;
    api.onStateChange(setGs);
    return () => { trkRef.current?.stop(); api.dispose(); apiRef.current = null; };
  }, []);

  /* gestures */
  const stopG = useCallback(() => {
    trkRef.current?.stop(); trkRef.current = null;
    setCam("off"); setTrk({ hands: 0, mode: "idle" });
  }, []);

  const startG = useCallback(async () => {
    const v = vidRef.current, o = ovrRef.current;
    if (!v || !o || trkRef.current) return;
    setCam("starting"); setCamErr(null);
    const t = new HandTracker(v, o, {
      onRotate: () => {}, onZoom: () => {}, onStatus: setTrk,
      onHandMove: (x, y, pinch) => {
        const a = apiRef.current; if (!a) return;
        a.moveShip(x, y);
        if (pinch) a.shoot();
      },
    });
    trkRef.current = t;
    try { await t.start(); setCam("on"); }
    catch (e) {
      trkRef.current = null; t.stop(); setCam("error");
      setCamErr(e instanceof DOMException && e.name === "NotAllowedError" ? "CAMERA REFUSED" : "TRACKING ERROR");
    }
  }, []);

  const toggleG = useCallback(() => {
    if (trkRef.current) stopG(); else void startG();
  }, [startG, stopG]);

  /* keyboard */
  useEffect(() => {
    let on = true;
    const tick = () => {
      if (!on) return;
      const sp = 0.015;
      let moved = false;
      if (keys.current["ArrowLeft"] || keys.current["a"]) { kbPos.current.x = Math.max(0.1, kbPos.current.x - sp); moved = true; }
      if (keys.current["ArrowRight"] || keys.current["d"]) { kbPos.current.x = Math.min(0.9, kbPos.current.x + sp); moved = true; }
      if (keys.current["ArrowUp"] || keys.current["w"]) { kbPos.current.y = Math.max(0.1, kbPos.current.y - sp); moved = true; }
      if (keys.current["ArrowDown"] || keys.current["s"]) { kbPos.current.y = Math.min(0.9, kbPos.current.y + sp); moved = true; }
      if (moved && apiRef.current && cam !== "on") apiRef.current.moveShip(kbPos.current.x, kbPos.current.y);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => { on = false; };
  }, [cam]);

  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      keys.current[e.key] = true;
      if (e.key === " ") apiRef.current?.shoot();
      if (e.key === "g" || e.key === "G") toggleG();
      if (e.key === "m" || e.key === "M") { if (apiRef.current) setMuted(apiRef.current.toggleSound()); }
      if (e.key === "Enter" && gs.gameOver) apiRef.current?.resetGame();
    };
    const up = (e: KeyboardEvent) => { keys.current[e.key] = false; };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, [toggleG, gs.gameOver]);

  const onMove = (e: React.MouseEvent) => {
    if (cam === "on" || !apiRef.current) return;
    const x = e.clientX / window.innerWidth, y = e.clientY / window.innerHeight;
    kbPos.current = { x, y };
    apiRef.current.moveShip(x, y);
  };

  const onClick = () => { if (cam !== "on") apiRef.current?.shoot(); };

  const camOn = cam === "on";

  return (
    <>
      <div ref={boxRef} className="game-root" onMouseMove={onMove} onMouseDown={onClick} />

      <div className="overlay-vignette" />
      <div className="overlay-grain" />
      <div className="overlay-scanlines" />

      {/* ── top left: title ── */}
      <div className="hud hud-title">NEON STRIKE</div>

      {/* ── top right: score ── */}
      {gs.gameStarted && (
        <div className="top-stats">
          <div className="ts-score">{gs.score.toLocaleString()}</div>
          <div className="ts-label">SCORE</div>
        </div>
      )}

      {/* ── health bar ── */}
      {gs.gameStarted && !gs.gameOver && (
        <div className="health-wrap">
          <div className="health-track">
            <div className={`health-bar ${gs.health < 35 ? "health-crit" : ""}`} style={{ width: `${gs.health}%` }} />
          </div>
          <div className="health-txt">{gs.health}%</div>
        </div>
      )}

      {/* ── start screen ── */}
      {!gs.gameStarted && (
        <div className="menu-overlay">
          <h1 className="menu-h1">NEON STRIKE</h1>
          <p className="menu-sub">GESTURE-CONTROLLED SPACE SHOOTER</p>

          <div className="menu-card">
            <div className="menu-col">
              <div className="col-head">✋ HAND GESTURES</div>
              <p>Move your hand to steer the ship.</p>
              <p>Pinch thumb & index finger to fire.</p>
              <p>Press <b>G</b> to toggle camera.</p>
            </div>
            <div className="menu-col">
              <div className="col-head">⌨️ KEYBOARD & MOUSE</div>
              <p>Move mouse or WASD to steer.</p>
              <p>Click or SPACE to fire.</p>
              <p>Press <b>M</b> to mute sound.</p>
            </div>
          </div>

          <button className="menu-btn" onClick={() => apiRef.current?.startGame()}>
            LAUNCH
          </button>
        </div>
      )}

      {/* ── game over ── */}
      {gs.gameOver && (
        <div className="menu-overlay">
          <h1 className="menu-h1 red">DESTROYED</h1>
          <div className="go-score">{gs.score.toLocaleString()}</div>
          <div className="go-label">FINAL SCORE</div>
          {gs.score >= gs.highScore && gs.score > 0 && (
            <div className="go-record">★ NEW RECORD ★</div>
          )}
          <button className="menu-btn red" onClick={() => apiRef.current?.resetGame()}>
            TRY AGAIN
          </button>
        </div>
      )}

      {/* ── bottom hints ── */}
      <div className="hud hud-hint">
        {camOn
          ? <><span className="key">HAND</span> steer &nbsp;<span className="key">PINCH</span> fire</>
          : <><span className="key">MOUSE</span> steer &nbsp;<span className="key">CLICK</span> fire &nbsp;<span className="key">G</span> gestures &nbsp;<span className="key">M</span> {muted ? "unmute" : "mute"}</>
        }
      </div>

      {/* ── camera + controls ── */}
      <div className="hud hud-controls">
        <div className={`cam-box${camOn ? " show" : ""}`}>
          <video ref={vidRef} muted playsInline className="camera-video" />
          <canvas ref={ovrRef} width={208} height={156} className="camera-overlay" />
          <div className="cam-status">
            {trk.hands > 0 ? `${trk.hands} HAND${trk.hands > 1 ? "S" : ""} · ${trk.mode === "idle" ? "STEERING" : "FIRING"}` : "SHOW HANDS"}
          </div>
        </div>
        {camErr && <div className="hud-error">{camErr}</div>}
        <div className="hud-row">
          <button className="hud-btn" onClick={toggleG} disabled={cam === "starting"}>
            {cam === "starting" ? "LOADING…" : camOn ? "GESTURES ON" : "GESTURES OFF"}
          </button>
          <button className="hud-btn" onClick={() => { if (apiRef.current) setMuted(apiRef.current.toggleSound()); }}>
            {muted ? "🔊" : "🔇"}
          </button>
        </div>
      </div>

      <style jsx global>{`
        .game-root { position: fixed; inset: 0; cursor: crosshair; background: #000913; }

        /* score */
        .top-stats {
          position: fixed; top: 28px; right: 28px; z-index: 20;
          text-align: right; font-family: "Courier New", monospace;
        }
        .ts-score {
          font-size: 28px; font-weight: bold; color: #00ffff;
          text-shadow: 0 0 12px rgba(0,255,255,0.5);
          letter-spacing: 0.05em;
        }
        .ts-label {
          font-size: 9px; color: #00aacc; letter-spacing: 0.2em; opacity: 0.7;
        }

        /* health */
        .health-wrap {
          position: fixed; bottom: 36px; left: 50%; transform: translateX(-50%);
          z-index: 20; width: 260px; font-family: "Courier New", monospace;
          text-align: center;
        }
        .health-track {
          width: 100%; height: 6px; background: rgba(0,30,60,0.5);
          border: 1px solid rgba(0,255,255,0.4); border-radius: 4px;
          padding: 1px; box-shadow: 0 0 8px rgba(0,255,255,0.08);
        }
        .health-bar {
          height: 100%; border-radius: 2px; transition: width 0.12s ease;
          background: linear-gradient(90deg, #0088ff, #00ffff);
          box-shadow: 0 0 8px rgba(0,255,255,0.6);
        }
        .health-crit {
          background: linear-gradient(90deg, #ff2222, #ff6644) !important;
          box-shadow: 0 0 8px rgba(255,50,50,0.8) !important;
        }
        .health-txt {
          font-size: 10px; color: #00ccee; margin-top: 3px;
          letter-spacing: 0.15em; opacity: 0.8;
        }

        /* menu */
        .menu-overlay {
          position: fixed; inset: 0; z-index: 30;
          background: rgba(0,5,12,0.88); backdrop-filter: blur(8px);
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          font-family: "Courier New", monospace; color: #fff;
        }
        .menu-h1 {
          font-size: 52px; letter-spacing: 0.35em; margin-bottom: 6px;
          color: #00ffff; text-shadow: 0 0 25px rgba(0,255,255,0.6), 0 0 50px rgba(0,255,255,0.15);
        }
        .menu-h1.red {
          color: #ff3344; text-shadow: 0 0 25px rgba(255,50,68,0.6);
        }
        .menu-sub {
          font-size: 11px; letter-spacing: 0.3em; color: #6688aa;
          margin-bottom: 28px;
        }
        .menu-card {
          display: grid; grid-template-columns: 1fr 1fr; gap: 24px;
          background: rgba(0,15,30,0.7); border: 1px solid rgba(0,255,255,0.2);
          border-radius: 8px; padding: 22px 28px; max-width: 520px; width: 90%;
          margin-bottom: 28px; box-shadow: 0 0 20px rgba(0,255,255,0.04);
        }
        .menu-col { font-size: 12px; line-height: 1.8; color: #aabbcc; }
        .col-head {
          font-size: 10px; font-weight: bold; letter-spacing: 0.15em;
          color: #88aacc; margin-bottom: 6px;
        }
        .menu-btn {
          background: rgba(0,20,40,0.6); color: #fff;
          font-family: "Courier New", monospace; font-size: 15px; font-weight: bold;
          letter-spacing: 0.3em; padding: 14px 36px; border-radius: 6px;
          border: 1px solid #00ffff; cursor: pointer; outline: none;
          box-shadow: 0 0 10px rgba(0,255,255,0.15) inset;
          transition: all 0.2s ease;
        }
        .menu-btn:hover {
          background: rgba(0,255,255,0.12);
          box-shadow: 0 0 20px rgba(0,255,255,0.3), 0 0 10px rgba(0,255,255,0.15) inset;
          transform: translateY(-2px);
        }
        .menu-btn:active { transform: translateY(1px); }
        .menu-btn.red {
          border-color: #ff3344;
          box-shadow: 0 0 10px rgba(255,50,68,0.15) inset;
        }
        .menu-btn.red:hover {
          background: rgba(255,50,68,0.12);
          box-shadow: 0 0 20px rgba(255,50,68,0.3), 0 0 10px rgba(255,50,68,0.15) inset;
        }

        /* game over */
        .go-score {
          font-size: 44px; font-weight: bold; color: #00ffff;
          text-shadow: 0 0 15px rgba(0,255,255,0.5);
          margin: 16px 0 4px;
        }
        .go-label {
          font-size: 10px; letter-spacing: 0.25em; color: #6688aa;
          margin-bottom: 8px;
        }
        .go-record {
          font-size: 14px; font-weight: bold; color: #ffaa30;
          text-shadow: 0 0 12px rgba(255,170,48,0.7);
          margin-bottom: 24px;
          animation: glow 1s ease-in-out infinite alternate;
        }
        @keyframes glow {
          from { text-shadow: 0 0 8px rgba(255,170,48,0.4); }
          to { text-shadow: 0 0 20px rgba(255,170,48,0.9); }
        }
      `}</style>
    </>
  );
}
