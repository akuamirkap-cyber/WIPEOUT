import { useCallback, useEffect, useRef, useState } from "react";
import { Game, type HudData, type Quality, type ResultRow } from "./game/Game";
import { Hud, fmtTime } from "./components/Hud";

const FONT = "Orbitron, 'Eurostile', 'Bank Gothic', 'Arial Black', sans-serif";
const cq = (px: number) => `${px / 19.2}cqw`;

function Key({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        minWidth: cq(34),
        textAlign: "center",
        padding: `${cq(3)} ${cq(9)}`,
        borderRadius: cq(5),
        background: "linear-gradient(#2a3550,#161d30)",
        border: "1px solid rgba(160,190,255,0.45)",
        boxShadow: "0 2px 0 rgba(0,0,0,0.6)",
        color: "#e9f0ff",
        fontSize: cq(15),
        fontWeight: 800,
        marginRight: cq(6),
      }}
    >
      {children}
    </span>
  );
}

function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { v: T; t: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center" style={{ gap: cq(14), marginTop: cq(12) }}>
      <span style={{ width: cq(120), color: "#f7ef1c", fontWeight: 800, fontSize: cq(15), letterSpacing: "0.15em" }}>{label}</span>
      <div className="flex" style={{ gap: cq(8) }}>
        {options.map((o) => (
          <button
            key={String(o.v)}
            onClick={() => onChange(o.v)}
            style={{
              pointerEvents: "auto",
              cursor: "pointer",
              padding: `${cq(6)} ${cq(16)}`,
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: cq(15),
              letterSpacing: "0.1em",
              color: o.v === value ? "#0a0f1c" : "#cfe0ff",
              background: o.v === value ? "#f7ef1c" : "rgba(20,30,55,0.7)",
              border: "1px solid rgba(255,255,255,0.25)",
              transform: "skewX(-12deg)",
            }}
          >
            <span style={{ display: "inline-block", transform: "skewX(12deg)" }}>{o.t}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const stageRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudData | null>(null);
  const [mapPath, setMapPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [paused, setPaused] = useState(false);
  const [laps, setLaps] = useState(3);
  const [quality, setQuality] = useState<Quality>("ultra");
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    let game: Game | null = null;
    const t = window.setTimeout(() => {
      try {
        game = new Game(mountRef.current!, {
          onHud: (h) => setHud(h),
          onFinish: (rows) => setResults(rows),
        });
        gameRef.current = game;
        (window as unknown as { __game?: Game }).__game = game;
        setMapPath(game.getMapPath());
        setLoading(false);
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    }, 80);
    return () => {
      window.clearTimeout(t);
      if (game) game.dispose();
      gameRef.current = null;
    };
  }, []);

  const state = hud?.state ?? "menu";

  const startRace = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    setResults(null);
    setPaused(false);
    g.setPaused(false);
    g.startRace(laps);
  }, [laps]);

  const togglePause = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    if (g.state === "menu" || g.state === "countdown") return;
    const p = !g.paused;
    g.setPaused(p);
    setPaused(p);
  }, []);

  const toMenu = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    g.setPaused(false);
    setPaused(false);
    setResults(null);
    g.returnToMenu();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (!g) return;
      if (e.code === "Enter") {
        if (g.state === "menu" || results) startRace();
        else if (paused) togglePause();
      } else if (e.code === "Escape" || e.code === "KeyP") {
        if (results) toMenu();
        else togglePause();
      } else if (e.code === "KeyR" && g.state !== "menu") {
        startRace();
      } else if (e.code === "KeyF") {
        g.toggleFullscreen();
      } else if (e.code === "KeyM") {
        setMuted(g.audio.muted);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [results, paused, startRace, togglePause, toMenu]);

  useEffect(() => {
    gameRef.current?.setQuality(quality);
  }, [quality, loading]);

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-black">
      <div
        ref={stageRef}
        className="relative overflow-hidden bg-[#0a0f1c]"
        style={{
          width: "min(100vw, calc(100vh * 16 / 9))",
          aspectRatio: "16 / 9",
          containerType: "size",
        }}
      >
        <div ref={mountRef} className="absolute inset-0" />

        {hud && <Hud hud={hud} mapPath={mapPath} />}

        {/* top-right utility buttons */}
        {!loading && (
          <div className="absolute flex" style={{ right: cq(14), top: cq(10), gap: cq(8), opacity: state === "menu" ? 1 : 0.55 }}>
            {[
              { t: muted ? "SOUND OFF" : "SOUND ON", f: () => setMuted(gameRef.current?.toggleMute() ?? false) },
              { t: "FULLSCREEN", f: () => gameRef.current?.toggleFullscreen() },
            ].map((b) => (
              <button
                key={b.t}
                onClick={b.f}
                style={{
                  fontFamily: FONT,
                  fontWeight: 700,
                  fontSize: cq(11),
                  letterSpacing: "0.12em",
                  color: "#dbe7ff",
                  background: "rgba(8,12,24,0.55)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  padding: `${cq(4)} ${cq(10)}`,
                  cursor: "pointer",
                }}
              >
                {b.t}
              </button>
            ))}
          </div>
        )}

        {/* loading */}
        {loading && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ background: "radial-gradient(circle at 50% 40%, #12203f, #05070d)", fontFamily: FONT }}
          >
            <div style={{ fontSize: cq(70), fontWeight: 900, fontStyle: "italic", color: "#fff", letterSpacing: "0.08em" }}>
              AETHER <span style={{ color: "#f7ef1c" }}>RIFT</span>
            </div>
            <div className="animate-pulse" style={{ marginTop: cq(20), color: "#8fb4ff", fontSize: cq(20), letterSpacing: "0.4em", fontWeight: 700 }}>
              BUILDING ARENA…
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-10 text-center text-white">
            <div>
              <div style={{ fontFamily: FONT, fontSize: cq(34), fontWeight: 800 }}>WebGL tidak tersedia</div>
              <div style={{ marginTop: cq(14), fontSize: cq(16), opacity: 0.8 }}>{error}</div>
            </div>
          </div>
        )}

        {/* MENU */}
        {!loading && !error && state === "menu" && (
          <div
            className="absolute inset-0"
            style={{
              fontFamily: FONT,
              background:
                "linear-gradient(90deg, rgba(4,8,18,0.88) 0%, rgba(4,8,18,0.62) 34%, rgba(4,8,18,0) 62%), linear-gradient(0deg, rgba(4,8,18,0.7) 0%, rgba(4,8,18,0) 30%)",
            }}
          >
            <div className="absolute" style={{ left: cq(96), top: cq(120), width: cq(760) }}>
              <div style={{ color: "#f7ef1c", fontWeight: 800, fontSize: cq(18), letterSpacing: "0.5em" }}>
                ANTI-GRAVITY RACING LEAGUE
              </div>
              <div
                style={{
                  marginTop: cq(10),
                  fontSize: cq(128),
                  lineHeight: 0.92,
                  fontWeight: 900,
                  fontStyle: "italic",
                  color: "#fff",
                  textShadow: "0 0.4cqw 2cqw rgba(0,0,0,0.6)",
                }}
              >
                AETHER
                <br />
                <span
                  style={{
                    background: "linear-gradient(90deg,#f7ef1c,#ffb300)",
                    WebkitBackgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  RIFT
                </span>
              </div>
              <div style={{ marginTop: cq(14), color: "#b9ccf2", fontSize: cq(17), letterSpacing: "0.12em", fontWeight: 600 }}>
                SNOWFALL ARENA · 8 SHIPS · 1 LEGEND
              </div>

              <Choice
                label="LAPS"
                value={laps}
                options={[
                  { v: 2, t: "2" },
                  { v: 3, t: "3" },
                  { v: 5, t: "5" },
                ]}
                onChange={(v) => setLaps(Number(v))}
              />
              <Choice
                label="GRAPHICS"
                value={quality}
                options={[
                  { v: "ultra" as Quality, t: "ULTRA" },
                  { v: "high" as Quality, t: "HIGH" },
                  { v: "medium" as Quality, t: "MEDIUM" },
                ]}
                onChange={(v) => setQuality(v as Quality)}
              />

              <button
                onClick={startRace}
                style={{
                  pointerEvents: "auto",
                  cursor: "pointer",
                  marginTop: cq(34),
                  padding: `${cq(16)} ${cq(54)}`,
                  fontFamily: FONT,
                  fontWeight: 900,
                  fontStyle: "italic",
                  fontSize: cq(32),
                  letterSpacing: "0.16em",
                  color: "#0a0f1c",
                  background: "linear-gradient(90deg,#f7ef1c,#ffc400)",
                  border: "none",
                  transform: "skewX(-14deg)",
                  boxShadow: "0 0 2.5cqw rgba(255,220,30,0.45)",
                }}
              >
                <span style={{ display: "inline-block", transform: "skewX(14deg)" }}>START RACE</span>
              </button>
              <div style={{ marginTop: cq(12), color: "#9fb4de", fontSize: cq(13), letterSpacing: "0.2em" }}>
                TEKAN <b style={{ color: "#fff" }}>ENTER</b> UNTUK MULAI
              </div>
            </div>

            <div
              className="absolute"
              style={{
                right: cq(70),
                bottom: cq(60),
                background: "rgba(6,10,22,0.62)",
                border: "1px solid rgba(255,255,255,0.14)",
                padding: `${cq(18)} ${cq(26)}`,
                lineHeight: 2.1,
                color: "#cfe0ff",
                fontSize: cq(14),
                fontWeight: 600,
                letterSpacing: "0.08em",
              }}
            >
              <div style={{ color: "#f7ef1c", fontWeight: 800, letterSpacing: "0.3em", marginBottom: cq(4) }}>KONTROL</div>
              <div><Key>W</Key> / <Key>↑</Key> Gas</div>
              <div><Key>S</Key> / <Key>↓</Key> Rem</div>
              <div><Key>A</Key><Key>D</Key> / <Key>←</Key><Key>→</Key> Belok</div>
              <div><Key>Q</Key><Key>E</Key> Airbrake kiri / kanan</div>
              <div><Key>SHIFT</Key> / <Key>SPACE</Key> <span style={{ color: "#7fe4ff" }}>NITRO (NOS)</span></div>
              <div><Key>C</Key> Kamera &nbsp; <Key>P</Key> Pause &nbsp; <Key>R</Key> Restart</div>
              <div style={{ color: "#8fe4ff", marginTop: cq(4), lineHeight: 1.5, fontSize: cq(12) }}>
                Ambil kapsul biru untuk isi NOS.<br />Lewati pad panah cyan untuk boost gratis.
              </div>
            </div>
          </div>
        )}

        {/* PAUSE */}
        {paused && !results && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ background: "rgba(3,6,14,0.72)", fontFamily: FONT, backdropFilter: "blur(6px)" }}
          >
            <div style={{ fontSize: cq(90), fontWeight: 900, fontStyle: "italic", color: "#fff", letterSpacing: "0.1em" }}>PAUSED</div>
            <div className="flex" style={{ gap: cq(18), marginTop: cq(30) }}>
              {[
                { t: "RESUME", f: togglePause },
                { t: "RESTART", f: startRace },
                { t: "MENU", f: toMenu },
              ].map((b) => (
                <button
                  key={b.t}
                  onClick={b.f}
                  style={{
                    pointerEvents: "auto",
                    cursor: "pointer",
                    fontFamily: FONT,
                    fontWeight: 900,
                    fontStyle: "italic",
                    fontSize: cq(24),
                    letterSpacing: "0.12em",
                    padding: `${cq(12)} ${cq(34)}`,
                    color: b.t === "RESUME" ? "#0a0f1c" : "#fff",
                    background: b.t === "RESUME" ? "#f7ef1c" : "rgba(30,42,70,0.8)",
                    border: "1px solid rgba(255,255,255,0.25)",
                    transform: "skewX(-12deg)",
                  }}
                >
                  <span style={{ display: "inline-block", transform: "skewX(12deg)" }}>{b.t}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* RESULTS */}
        {results && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: "rgba(3,6,14,0.7)", fontFamily: FONT, backdropFilter: "blur(5px)" }}
          >
            <div style={{ width: cq(900) }}>
              <div style={{ color: "#f7ef1c", fontWeight: 800, fontSize: cq(18), letterSpacing: "0.5em" }}>RACE COMPLETE</div>
              <div style={{ fontSize: cq(76), fontWeight: 900, fontStyle: "italic", color: "#fff", lineHeight: 1, marginBottom: cq(20) }}>
                {(() => {
                  const i = results.findIndex((r) => r.isPlayer);
                  const n = i + 1;
                  const suf = n === 1 ? "ST" : n === 2 ? "ND" : n === 3 ? "RD" : "TH";
                  return (
                    <>
                      FINISHED {n}
                      <span style={{ fontSize: cq(38), color: "#f7ef1c" }}>{suf}</span>
                    </>
                  );
                })()}
              </div>
              <div style={{ border: "1px solid rgba(255,255,255,0.15)", background: "rgba(8,12,26,0.7)" }}>
                {results.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center"
                    style={{
                      padding: `${cq(9)} ${cq(22)}`,
                      background: r.isPlayer ? "linear-gradient(90deg, rgba(247,239,28,0.28), rgba(247,239,28,0.04))" : i % 2 ? "rgba(255,255,255,0.03)" : "transparent",
                      color: "#fff",
                      fontWeight: 800,
                      fontStyle: "italic",
                      fontSize: cq(22),
                    }}
                  >
                    <span style={{ width: cq(60), color: i === 0 ? "#f7ef1c" : "#9fb4de" }}>{i + 1}</span>
                    <span style={{ width: cq(16), height: cq(16), background: r.color, marginRight: cq(16), transform: "skewX(-14deg)" }} />
                    <span style={{ flex: 1 }}>{r.name}</span>
                    <span style={{ opacity: 0.8 }}>
                      {r.est ? "~" : ""}
                      {fmtTime(r.time, 2)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex" style={{ gap: cq(18), marginTop: cq(26) }}>
                <button
                  onClick={startRace}
                  style={{
                    pointerEvents: "auto",
                    cursor: "pointer",
                    fontFamily: FONT,
                    fontWeight: 900,
                    fontStyle: "italic",
                    fontSize: cq(24),
                    letterSpacing: "0.12em",
                    padding: `${cq(12)} ${cq(34)}`,
                    color: "#0a0f1c",
                    background: "#f7ef1c",
                    border: "none",
                    transform: "skewX(-12deg)",
                  }}
                >
                  <span style={{ display: "inline-block", transform: "skewX(12deg)" }}>RACE AGAIN [ENTER]</span>
                </button>
                <button
                  onClick={toMenu}
                  style={{
                    pointerEvents: "auto",
                    cursor: "pointer",
                    fontFamily: FONT,
                    fontWeight: 900,
                    fontStyle: "italic",
                    fontSize: cq(24),
                    letterSpacing: "0.12em",
                    padding: `${cq(12)} ${cq(34)}`,
                    color: "#fff",
                    background: "rgba(30,42,70,0.8)",
                    border: "1px solid rgba(255,255,255,0.25)",
                    transform: "skewX(-12deg)",
                  }}
                >
                  <span style={{ display: "inline-block", transform: "skewX(12deg)" }}>MENU [ESC]</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
