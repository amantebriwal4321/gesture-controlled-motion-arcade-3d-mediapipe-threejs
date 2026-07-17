"use client";

import Link from "next/link";

export default function Home() {
  return (
    <div className="portal-container">
      {/* Background HUD decorations */}
      <div className="overlay-vignette" />
      <div className="overlay-grain" />
      <div className="overlay-scanlines" />

      <div className="decor-grid" />
      <div className="decor-corners" />

      {/* Title Header */}
      <header className="portal-header">
        <h1 className="portal-title">ULTRON GESTURE CONTROL PORTAL</h1>
        <p className="portal-subtitle">INTEGRATING 3D GRAPHICS AND MEDIA-PIPE COMPUTER VISION</p>
      </header>

      {/* Choice Portals */}
      <main className="portal-grid">
        {/* Card 1: Jarvis Orb */}
        <div className="portal-card neon-amber">
          <div className="card-tag">SYSTEM VIEW</div>
          <h2 className="card-title">JARVIS ORB INTERFACE</h2>
          <p className="card-desc">
            An Iron Man-inspired 3D holographic wireframe orb. Spin and zoom the core
            using webcam hand tracking gestures or keyboard/mouse controls.
          </p>
          <div className="card-tech">
            <span>Next.js</span>
            <span>Three.js</span>
            <span>MediaPipe</span>
            <span>Bloom Filters</span>
          </div>
          <Link href="/orb" className="card-btn btn-amber">
            INITIALIZE INTERFACE
          </Link>
        </div>

        {/* Card 2: Space Shooter Game */}
        <div className="portal-card neon-cyan">
          <div className="card-tag">SIMULATION MODULE</div>
          <h2 className="card-title">NEON STRIKE 3D GAME</h2>
          <p className="card-desc">
            A retro-futuristic space combat arcade simulator. Steer your spaceship 
            with your hand in real-time and pinch your fingers to fire lasers.
          </p>
          <div className="card-tech">
            <span>Three.js WebGL</span>
            <span>Procedural Sound</span>
            <span>Collision Physics</span>
            <span>Dynamic HUD</span>
          </div>
          <Link href="/game" className="card-btn btn-cyan">
            LAUNCH MISSION
          </Link>
        </div>
      </main>

      <footer className="portal-footer">
        <div>CORE PLATFORM RUNNING · WEBCAM PERMISSIONS REQUIRED ON SECURE ORIGINS</div>
      </footer>

      <style jsx>{`
        .portal-container {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #000207;
          color: #ccddee;
          font-family: "Courier New", monospace;
          padding: 40px 20px;
          position: relative;
          overflow-y: auto;
        }

        /* Decorative Grid Background */
        .decor-grid {
          position: absolute;
          inset: 0;
          background-image: 
            linear-gradient(to right, rgba(0, 255, 255, 0.02) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0, 255, 255, 0.02) 1px, transparent 1px);
          background-size: 50px 50px;
          pointer-events: none;
          z-index: 1;
        }

        .portal-header {
          text-align: center;
          margin-bottom: 50px;
          z-index: 2;
        }

        .portal-title {
          font-size: 26px;
          letter-spacing: 0.25em;
          color: #ccddee;
          text-shadow: 0 0 10px rgba(255, 255, 255, 0.15);
          margin-bottom: 12px;
          font-weight: bold;
        }

        .portal-subtitle {
          font-size: 11px;
          letter-spacing: 0.2em;
          color: #6688aa;
        }

        .portal-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
          gap: 30px;
          width: 850px;
          max-width: 100%;
          z-index: 2;
          margin-bottom: 50px;
        }

        /* Glassmorphic Portal Cards */
        .portal-card {
          background: rgba(0, 10, 20, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 6px;
          padding: 30px;
          display: flex;
          flex-direction: column;
          position: relative;
          transition: all 0.3s ease;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(8px);
        }

        .portal-card:hover {
          transform: translateY(-5px);
        }

        .neon-amber:hover {
          border-color: rgba(255, 170, 48, 0.5);
          box-shadow: 
            0 10px 40px rgba(255, 140, 20, 0.1),
            0 0 20px rgba(255, 170, 48, 0.05);
        }

        .neon-cyan:hover {
          border-color: rgba(0, 255, 255, 0.5);
          box-shadow: 
            0 10px 40px rgba(0, 255, 255, 0.1),
            0 0 20px rgba(0, 255, 255, 0.05);
        }

        .card-tag {
          font-size: 10px;
          letter-spacing: 0.15em;
          margin-bottom: 16px;
          color: #557799;
        }

        .card-title {
          font-size: 20px;
          letter-spacing: 0.1em;
          margin-bottom: 20px;
          font-weight: bold;
        }

        .neon-amber .card-title {
          color: #ffaa30;
          text-shadow: 0 0 8px rgba(255, 170, 48, 0.3);
        }

        .neon-cyan .card-title {
          color: #00ffff;
          text-shadow: 0 0 8px rgba(0, 255, 255, 0.3);
        }

        .card-desc {
          font-size: 13px;
          line-height: 1.6;
          color: #aabbcc;
          margin-bottom: 24px;
          flex-grow: 1;
        }

        .card-tech {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 30px;
        }

        .card-tech span {
          font-size: 9px;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 3px;
          padding: 3px 8px;
          color: #6688aa;
          letter-spacing: 0.08em;
        }

        /* Buttons */
        .card-btn {
          text-align: center;
          font-size: 12px;
          font-weight: bold;
          letter-spacing: 0.15em;
          padding: 14px 20px;
          border-radius: 4px;
          text-decoration: none;
          transition: all 0.25s ease;
        }

        .btn-amber {
          border: 1px solid #ffaa30;
          color: #ffaa30;
          background: rgba(255, 170, 48, 0.03);
        }

        .btn-amber:hover {
          background: #ffaa30;
          color: #000;
          box-shadow: 0 0 15px rgba(255, 170, 48, 0.45);
        }

        .btn-cyan {
          border: 1px solid #00ffff;
          color: #00ffff;
          background: rgba(0, 255, 255, 0.03);
        }

        .btn-cyan:hover {
          background: #00ffff;
          color: #000;
          box-shadow: 0 0 15px rgba(0, 255, 255, 0.45);
        }

        .portal-footer {
          font-size: 10px;
          color: #446688;
          letter-spacing: 0.15em;
          text-align: center;
          margin-top: auto;
          z-index: 2;
        }

        @media (max-width: 800px) {
          .portal-grid {
            grid-template-columns: 1fr;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
