"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createGameScene, type GameSceneApi, type GameState } from "@/lib/gameScene";
import { HandTracker, type TrackerStatus } from "@/lib/handTracker";

type CameraState = "off" | "starting" | "on" | "error";

export default function SpaceShooter() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const sceneApiRef = useRef<GameSceneApi | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);

  const [cameraState, setCameraState] = useState<CameraState>("off");
  const [trackerStatus, setTrackerStatus] = useState<TrackerStatus>({
    hands: 0,
    mode: "idle",
    pinching: false,
    twoHands: false,
  });
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    health: 100,
    gameOver: false,
    gameStarted: false,
    highScore: 0,
    speed: 1.0,
  });

  const mousePosRef = useRef({ x: 0.5, y: 0.5 });
  const keysPressedRef = useRef<Record<string, boolean>>({});

  // ——— INITIALIZE THREE.JS SCENE ———
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const api = createGameScene(container);
    sceneApiRef.current = api;
    api.onStateChange(setGameState);

    return () => {
      trackerRef.current?.stop();
      api.dispose();
      sceneApiRef.current = null;
    };
  }, []);

  // ——— GESTURE WEBCAM TRACKING ———
  const stopGestures = useCallback(() => {
    trackerRef.current?.stop();
    trackerRef.current = null;
    setCameraState("off");
    setTrackerStatus({ hands: 0, mode: "idle", pinching: false, twoHands: false });
  }, []);

  const startGestures = useCallback(async () => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay || trackerRef.current) return;

    setCameraState("starting");
    setCameraError(null);

    const tracker = new HandTracker(video, overlay, {
      onRotate: () => {},
      onZoom: () => {},
      onStatus: setTrackerStatus,
      onHandMove: (x, y, isPinching, handCount) => {
        const api = sceneApiRef.current;
        if (!api) return;
        api.moveShip(x, y);
        if (isPinching) api.shoot();
      },
    });

    trackerRef.current = tracker;

    try {
      await tracker.start();
      setCameraState("on");
    } catch (err) {
      trackerRef.current = null;
      tracker.stop();
      setCameraState("error");
      setCameraError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "CAMERA PERMISSION REFUSED"
          : "WEBCAM TRACKING FAILED"
      );
    }
  }, []);

  const toggleGestures = useCallback(() => {
    if (trackerRef.current) stopGestures();
    else void startGestures();
  }, [startGestures, stopGestures]);

  const toggleAudio = useCallback(() => {
    if (sceneApiRef.current) {
      const muted = sceneApiRef.current.toggleSound();
      setIsMuted(muted);
    }
  }, []);

  // ——— KEYBOARD STEER LOOP ———
  useEffect(() => {
    let active = true;
    const updateKeyboardSteer = () => {
      if (!active) return;
      const speed = 0.015;
      let moved = false;

      if (keysPressedRef.current["ArrowLeft"] || keysPressedRef.current["a"] || keysPressedRef.current["A"]) {
        mousePosRef.current.x = Math.max(0.08, mousePosRef.current.x - speed);
        moved = true;
      }
      if (keysPressedRef.current["ArrowRight"] || keysPressedRef.current["d"] || keysPressedRef.current["D"]) {
        mousePosRef.current.x = Math.min(0.92, mousePosRef.current.x + speed);
        moved = true;
      }
      if (keysPressedRef.current["ArrowUp"] || keysPressedRef.current["w"] || keysPressedRef.current["W"]) {
        mousePosRef.current.y = Math.max(0.08, mousePosRef.current.y - speed);
        moved = true;
      }
      if (keysPressedRef.current["ArrowDown"] || keysPressedRef.current["s"] || keysPressedRef.current["S"]) {
        mousePosRef.current.y = Math.min(0.92, mousePosRef.current.y + speed);
        moved = true;
      }

      if (moved && sceneApiRef.current && cameraState !== "on") {
        sceneApiRef.current.moveShip(mousePosRef.current.x, mousePosRef.current.y);
      }

      requestAnimationFrame(updateKeyboardSteer);
    };

    requestAnimationFrame(updateKeyboardSteer);
    return () => {
      active = false;
    };
  }, [cameraState]);

  // Keyboard shortcut listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressedRef.current[e.key] = true;

      if (e.key === " ") sceneApiRef.current?.shoot();
      if (e.key === "g" || e.key === "G") toggleGestures();
      if (e.key === "m" || e.key === "M") toggleAudio();
      if (e.key === "Enter" && gameState.gameOver) sceneApiRef.current?.resetGame();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressedRef.current[e.key] = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [toggleGestures, toggleAudio, gameState.gameOver]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (cameraState === "on" || !sceneApiRef.current) return;
    const x = e.clientX / window.innerWidth;
    const y = e.clientY / window.innerHeight;
    mousePosRef.current = { x, y };
    sceneApiRef.current.moveShip(x, y);
  };

  const handleMouseDown = () => {
    if (cameraState === "on") return;
    sceneApiRef.current?.shoot();
  };

  const handleStartGame = () => {
    sceneApiRef.current?.startGame();
  };

  const handleResetGame = () => {
    sceneApiRef.current?.resetGame();
  };

  const isCamActive = cameraState === "on";

  return (
    <>
      {/* 3D WebGL Canvas Container */}
      <div
        ref={containerRef}
        className="game-canvas-root"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
      />

      {/* Screen CRT Overlays */}
      <div className="overlay-vignette" />
      <div className="overlay-grain" />
      <div className="overlay-scanlines" />

      {/* Top Header Branding & Stats */}
      <header className="hud-header">
        <div className="brand-title">
          <span className="brand-badge">PROD</span>
          <span className="brand-name">NEON STRIKE 3D</span>
        </div>

        {/* Live Score Display */}
        {gameState.gameStarted && (
          <div className="hud-score-panel">
            <div className="score-box">
              <div className="score-label">SCORE</div>
              <div className="score-val cyan-glow">{gameState.score.toLocaleString()}</div>
            </div>
            <div className="score-box">
              <div className="score-label">HIGH SCORE</div>
              <div className="score-val gold-glow">{gameState.highScore.toLocaleString()}</div>
            </div>
          </div>
        )}
      </header>

      {/* PROMINENT WEBCAM GESTURE PREVIEW WINDOW (POSITIONED AT BOTTOM RIGHT) */}
      <div className={`gesture-cam-widget ${isCamActive ? "cam-active" : ""}`}>
        <div className="widget-header">
          <span className="dot-indicator" />
          <span className="widget-title">WEBCAM HAND SENSORS</span>
          <button
            type="button"
            className="cam-toggle-btn"
            onClick={toggleGestures}
            disabled={cameraState === "starting"}
          >
            {cameraState === "starting" ? "CONNECTING..." : isCamActive ? "TURN OFF" : "ENABLE CAMERA"}
          </button>
        </div>

        <div className="cam-feed-container">
          <video ref={videoRef} muted playsInline className="cam-video-element" />
          <canvas ref={overlayRef} width={230} height={170} className="cam-overlay-element" />

          {!isCamActive && (
            <div className="cam-placeholder">
              <span className="cam-icon">📷</span>
              <p className="placeholder-text">Click "ENABLE CAMERA" to steer with dual hand gestures</p>
            </div>
          )}
        </div>

        {isCamActive && (
          <div className="cam-status-bar">
            <span className="status-item">
              HANDS: <strong>{trackerStatus.hands} {trackerStatus.twoHands ? "(DUAL 👐)" : ""}</strong>
            </span>
            <span className="status-item">
              ACTION:{" "}
              <strong className={trackerStatus.pinching ? "text-red" : "text-cyan"}>
                {trackerStatus.pinching ? "FIRING 💥" : trackerStatus.hands > 0 ? "STEERING ✋" : "SEARCHING..."}
              </strong>
            </span>
          </div>
        )}

        {cameraError && <div className="cam-error-msg">{cameraError}</div>}
      </div>

      {/* Health Bar (Bottom Center) */}
      {gameState.gameStarted && !gameState.gameOver && (
        <div className="hud-health-container">
          <div className="health-label-row">
            <span>HULL SHIELD INTEGRITY</span>
            <span className="health-percent">{gameState.health}%</span>
          </div>
          <div className="health-track">
            <div
              className={`health-fill ${gameState.health < 35 ? "health-critical" : ""}`}
              style={{ width: `${gameState.health}%` }}
            />
          </div>
        </div>
      )}

      {/* Start Game Menu Screen */}
      {!gameState.gameStarted && (
        <div className="cyber-modal-overlay">
          <div className="cyber-modal-card">
            <div className="modal-header">
              <h1 className="cyber-title">NEON STRIKE 3D</h1>
              <p className="cyber-subtitle">ULTRA-SMOOTH DUAL GESTURE ARCADE SHOOTER</p>
            </div>

            <div className="instructions-grid">
              <div className="instruct-column">
                <h3>👐 DUAL WEBCAM GESTURE CONTROLS</h3>
                <ul>
                  <li>Hold one or <strong>both hands</strong> in front of the camera to <strong>Steer Ship</strong>.</li>
                  <li>Pinch thumb & index finger on either hand to <strong>Fire Plasma Lasers</strong>.</li>
                </ul>
              </div>

              <div className="instruct-column">
                <h3>⌨️ MOUSE & KEYBOARD CONTROLS</h3>
                <ul>
                  <li>Move mouse or <strong>WASD / Arrow Keys</strong> to steer.</li>
                  <li>Left-click mouse or <strong>SPACEBAR</strong> to fire.</li>
                  <li>Press <strong>M</strong> to toggle audio mute.</li>
                </ul>
              </div>
            </div>

            <div className="modal-action-row">
              <button type="button" className="btn-primary-launch" onClick={handleStartGame}>
                ENGAGE MISSION 🚀
              </button>
              <button
                type="button"
                className={`btn-secondary-cam ${isCamActive ? "active" : ""}`}
                onClick={toggleGestures}
              >
                {isCamActive ? "✓ GESTURE CAMERA ONLINE" : "📷 ENABLE GESTURE CAMERA"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over Screen */}
      {gameState.gameOver && (
        <div className="cyber-modal-overlay">
          <div className="cyber-modal-card red-theme">
            <h1 className="cyber-title text-red">MISSION FAILED</h1>
            <p className="cyber-subtitle">SHIP HULL DESTROYED</p>

            <div className="game-over-stats">
              <div className="stat-row">
                <span>FINAL SCORE</span>
                <strong className="cyan-glow">{gameState.score.toLocaleString()}</strong>
              </div>
              <div className="stat-row">
                <span>HIGH SCORE</span>
                <strong className="gold-glow">{gameState.highScore.toLocaleString()}</strong>
              </div>
              {gameState.score >= gameState.highScore && gameState.score > 0 && (
                <div className="record-badge">🏆 NEW RECORD ALL TIME HIGH!</div>
              )}
            </div>

            <button type="button" className="btn-primary-launch btn-red" onClick={handleResetGame}>
              RE-DEPLOY SHIP 🔄
            </button>
          </div>
        </div>
      )}

      {/* Bottom Floating Control Hints */}
      <footer className="hud-bottom-bar">
        <div className="hud-hints">
          {isCamActive ? (
            <span>
              <kbd>DUAL HANDS</kbd> Steer &nbsp;|&nbsp; <kbd>PINCH</kbd> Fire Lasers
            </span>
          ) : (
            <span>
              <kbd>MOUSE / WASD</kbd> Steer &nbsp;|&nbsp; <kbd>SPACE / CLICK</kbd> Fire &nbsp;|&nbsp;{" "}
              <kbd>G</kbd> Gestures &nbsp;|&nbsp; <kbd>M</kbd> Mute
            </span>
          )}
        </div>

        <div className="hud-actions">
          <button type="button" className="hud-icon-btn" onClick={toggleAudio}>
            {isMuted ? "🔊 UNMUTE" : "🔇 MUTE"}
          </button>
          <button type="button" className="hud-icon-btn" onClick={handleResetGame}>
            🔄 RESET
          </button>
        </div>
      </footer>

      {/* Scoped CSS Styles */}
      <style jsx global>{`
        .game-canvas-root {
          position: fixed;
          inset: 0;
          cursor: crosshair;
          background: #020617;
        }

        /* Top Header */
        .hud-header {
          position: fixed;
          top: 24px;
          left: 28px;
          right: 28px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          z-index: 25;
          pointer-events: none;
          font-family: "Courier New", monospace;
        }

        .brand-title {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .brand-badge {
          background: rgba(14, 165, 233, 0.2);
          border: 1px solid #38bdf8;
          color: #38bdf8;
          font-size: 10px;
          font-weight: bold;
          padding: 2px 6px;
          border-radius: 4px;
          letter-spacing: 0.1em;
        }

        .brand-name {
          font-size: 16px;
          font-weight: bold;
          letter-spacing: 0.2em;
          color: #f8fafc;
          text-shadow: 0 0 12px rgba(56, 189, 248, 0.6);
        }

        .hud-score-panel {
          display: flex;
          gap: 20px;
        }

        .score-box {
          background: rgba(15, 23, 42, 0.75);
          border: 1px solid rgba(56, 189, 248, 0.3);
          padding: 8px 16px;
          border-radius: 6px;
          backdrop-filter: blur(8px);
          text-align: right;
          min-width: 120px;
        }

        .score-label {
          font-size: 9px;
          letter-spacing: 0.15em;
          color: #94a3b8;
          margin-bottom: 2px;
        }

        .score-val {
          font-size: 22px;
          font-weight: bold;
          letter-spacing: 0.05em;
        }

        .cyan-glow {
          color: #38bdf8;
          text-shadow: 0 0 10px rgba(56, 189, 248, 0.6);
        }

        .gold-glow {
          color: #f59e0b;
          text-shadow: 0 0 10px rgba(245, 158, 11, 0.6);
        }

        /* PROMINENT WEBCAM GESTURE PREVIEW WINDOW (PLACED AT BOTTOM RIGHT) */
        .gesture-cam-widget {
          position: fixed;
          bottom: 75px;
          right: 28px;
          z-index: 30;
          width: 250px;
          background: rgba(15, 23, 42, 0.88);
          border: 1px solid rgba(56, 189, 248, 0.4);
          border-radius: 8px;
          padding: 10px;
          backdrop-filter: blur(12px);
          box-shadow: 0 0 25px rgba(2, 132, 199, 0.2);
          font-family: "Courier New", monospace;
          transition: all 0.3s ease;
        }

        .gesture-cam-widget.cam-active {
          border-color: #38bdf8;
          box-shadow: 0 0 30px rgba(56, 189, 248, 0.4);
        }

        .widget-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .dot-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #f43f5e;
          display: inline-block;
          margin-right: 6px;
        }

        .cam-active .dot-indicator {
          background: #10b981;
          box-shadow: 0 0 8px #10b981;
        }

        .widget-title {
          font-size: 10px;
          font-weight: bold;
          letter-spacing: 0.1em;
          color: #e2e8f0;
          flex-grow: 1;
        }

        .cam-toggle-btn {
          background: rgba(56, 189, 248, 0.15);
          border: 1px solid #38bdf8;
          color: #38bdf8;
          font-size: 9px;
          font-weight: bold;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .cam-toggle-btn:hover {
          background: rgba(56, 189, 248, 0.3);
        }

        .cam-feed-container {
          position: relative;
          width: 230px;
          height: 170px;
          background: #020617;
          border-radius: 6px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .cam-video-element {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          transform: scaleX(-1);
        }

        .cam-overlay-element {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }

        .cam-placeholder {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 16px;
          text-align: center;
          background: rgba(15, 23, 42, 0.9);
        }

        .cam-icon {
          font-size: 26px;
          margin-bottom: 6px;
        }

        .placeholder-text {
          font-size: 9px;
          color: #94a3b8;
          line-height: 1.4;
        }

        .cam-status-bar {
          display: flex;
          justify-content: space-between;
          margin-top: 8px;
          font-size: 9px;
          color: #94a3b8;
        }

        .text-cyan {
          color: #38bdf8;
        }

        .text-red {
          color: #ef4444;
        }

        .cam-error-msg {
          font-size: 10px;
          color: #ef4444;
          margin-top: 6px;
          text-align: center;
        }

        /* Health Bar */
        .hud-health-container {
          position: fixed;
          bottom: 25px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 25;
          width: 320px;
          font-family: "Courier New", monospace;
        }

        .health-label-row {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          letter-spacing: 0.15em;
          color: #38bdf8;
          margin-bottom: 4px;
          text-shadow: 0 0 8px rgba(56, 189, 248, 0.5);
        }

        .health-track {
          width: 100%;
          height: 10px;
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid rgba(56, 189, 248, 0.5);
          border-radius: 5px;
          padding: 1px;
          box-shadow: 0 0 15px rgba(2, 132, 199, 0.2);
        }

        .health-fill {
          height: 100%;
          border-radius: 3px;
          background: linear-gradient(90deg, #0284c7, #38bdf8);
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.8);
          transition: width 0.15s ease;
        }

        .health-critical {
          background: linear-gradient(90deg, #dc2626, #ef4444) !important;
          box-shadow: 0 0 12px rgba(239, 68, 68, 0.9) !important;
        }

        /* Modal Screens */
        .cyber-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 40;
          background: rgba(2, 6, 23, 0.88);
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: "Courier New", monospace;
          color: #f8fafc;
        }

        .cyber-modal-card {
          width: 580px;
          max-width: 90%;
          background: rgba(15, 23, 42, 0.85);
          border: 1px solid rgba(56, 189, 248, 0.4);
          border-radius: 12px;
          padding: 32px;
          box-shadow: 0 0 40px rgba(2, 132, 199, 0.25);
          text-align: center;
        }

        .cyber-modal-card.red-theme {
          border-color: rgba(239, 68, 68, 0.4);
          box-shadow: 0 0 40px rgba(239, 68, 68, 0.25);
        }

        .cyber-title {
          font-size: 38px;
          letter-spacing: 0.3em;
          color: #38bdf8;
          text-shadow: 0 0 20px rgba(56, 189, 248, 0.7);
          margin-bottom: 6px;
        }

        .cyber-subtitle {
          font-size: 11px;
          letter-spacing: 0.25em;
          color: #94a3b8;
          margin-bottom: 24px;
        }

        .instructions-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          text-align: left;
          background: rgba(30, 41, 59, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 18px;
          margin-bottom: 28px;
          font-size: 11px;
          line-height: 1.6;
          color: #cbd5e1;
        }

        .instruct-column h3 {
          font-size: 11px;
          color: #38bdf8;
          margin-bottom: 8px;
          letter-spacing: 0.1em;
        }

        .instruct-column ul {
          padding-left: 14px;
        }

        .modal-action-row {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .btn-primary-launch {
          background: linear-gradient(90deg, #0284c7, #38bdf8);
          border: none;
          color: #020617;
          font-family: "Courier New", monospace;
          font-size: 16px;
          font-weight: bold;
          letter-spacing: 0.25em;
          padding: 16px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 0 20px rgba(56, 189, 248, 0.4);
        }

        .btn-primary-launch:hover {
          transform: translateY(-2px);
          box-shadow: 0 0 30px rgba(56, 189, 248, 0.7);
        }

        .btn-primary-launch.btn-red {
          background: linear-gradient(90deg, #b91c1c, #ef4444);
          color: #ffffff;
          box-shadow: 0 0 20px rgba(239, 68, 68, 0.4);
        }

        .btn-secondary-cam {
          background: rgba(30, 41, 59, 0.6);
          border: 1px solid rgba(56, 189, 248, 0.4);
          color: #38bdf8;
          font-family: "Courier New", monospace;
          font-size: 12px;
          font-weight: bold;
          letter-spacing: 0.15em;
          padding: 12px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-secondary-cam:hover,
        .btn-secondary-cam.active {
          background: rgba(56, 189, 248, 0.15);
          border-color: #38bdf8;
        }

        .game-over-stats {
          background: rgba(30, 41, 59, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 24px;
        }

        .stat-row {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          padding: 6px 0;
          color: #cbd5e1;
        }

        .record-badge {
          margin-top: 12px;
          color: #f59e0b;
          font-weight: bold;
          font-size: 13px;
          text-shadow: 0 0 10px rgba(245, 158, 11, 0.8);
        }

        /* Bottom Floating Bar */
        .hud-bottom-bar {
          position: fixed;
          bottom: 20px;
          left: 28px;
          right: 300px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          z-index: 25;
          font-family: "Courier New", monospace;
        }

        .hud-hints {
          font-size: 11px;
          color: #94a3b8;
          letter-spacing: 0.1em;
        }

        kbd {
          background: rgba(30, 41, 59, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 3px;
          padding: 2px 6px;
          color: #38bdf8;
        }

        .hud-actions {
          display: flex;
          gap: 10px;
        }

        .hud-icon-btn {
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid rgba(56, 189, 248, 0.3);
          color: #38bdf8;
          font-family: "Courier New", monospace;
          font-size: 11px;
          font-weight: bold;
          padding: 6px 12px;
          border-radius: 4px;
          cursor: pointer;
          backdrop-filter: blur(8px);
          transition: all 0.2s ease;
        }

        .hud-icon-btn:hover {
          background: rgba(56, 189, 248, 0.2);
          border-color: #38bdf8;
        }
      `}</style>
    </>
  );
}
