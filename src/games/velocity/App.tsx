import { useEffect, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Scene } from "./components/Scene";
import { HUD } from "./components/HUD";
import { game, bindInput, TEAMS, type Phase, TOTAL_LAPS } from "./game/store";
import { audio } from "./game/audio";

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const d = Math.floor((t % 1) * 100);
  return `${m}:${s.toString().padStart(2, "0")}.${d.toString().padStart(2, "0")}`;
}

export default function App() {
  const [phase, setPhase] = useState<Phase>(game.phase);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    bindInput();
    const l = () => setPhase(game.phase);
    game.listeners.add(l);
    return () => {
      game.listeners.delete(l);
      try {
        audio.stopMusic();
      } catch {
        // ignore
      }
    };
  }, []);

  const [muted, setMuted] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyM") setMuted(audio.toggleMute());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const start = () => {
    audio.resume();
    audio.uiClick();
    audio.startMusic();
    audio.setMusicVolume(0.3);
    game.countdown = 3;
    game.setPhase("countdown");
  };

  return (
    <div className="w-screen h-screen bg-black flex items-center justify-center overflow-hidden">
      <div className="relative aspect-video w-full max-h-full max-w-[177.78vh] bg-[#0a0f1a] [container-type:inline-size]">
        <Canvas
          shadows={{ type: THREE.PCFShadowMap }}
          dpr={[1, 1.5]}
          camera={{ fov: 66, near: 0.3, far: 3000, position: [30, 10, 100] }}
          gl={{
            antialias: false,
            powerPreference: "high-performance",
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.15,
          }}
          onCreated={() => setReady(true)}
        >
          <Scene />
        </Canvas>

        <HUD phase={phase} />
        <button
          onClick={() => setMuted(audio.toggleMute())}
          className="absolute top-[2%] right-[2%] z-20 pointer-events-auto text-[0.9cqw] font-hud tracking-widest text-white/60 hover:text-white bg-black/30 px-2 py-1 border border-white/10"
        >
          {muted ? "🔇 MUTED (M)" : "🔊 SOUND (M)"}
        </button>

        {phase === "menu" && (
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-[8%] font-hud italic text-white bg-gradient-to-t from-black/80 via-black/20 to-transparent">
            <div className="text-[1.4cqw] tracking-[0.6em] text-yellow-300 font-black">ANTI-GRAVITY RACING LEAGUE</div>
            <h1 className="text-[8cqw] font-black leading-none tracking-tight drop-shadow-[0_0_30px_rgba(80,160,255,0.6)]">
              VELO<span className="text-cyan-300">CITY</span>
            </h1>
            <div className="text-[1.3cqw] text-white/70 tracking-[0.3em] mb-[2cqw]">SEBENCO ARENA → HOLLOW EARTH · {TOTAL_LAPS} LAPS · 8 SHIPS</div>
            <div className="flex gap-2 mb-[2cqw]">
              {TEAMS.map((t) => (
                <div key={t.name} className="px-3 py-1 text-[0.8cqw] font-bold tracking-widest border border-white/20 bg-black/40" style={{ color: t.secondary === "#f2f4f7" || t.secondary.startsWith("#f") ? t.primary : t.secondary }}>
                  {t.name}
                </div>
              ))}
            </div>
            <button
              onClick={start}
              disabled={!ready}
              className="pointer-events-auto px-[4cqw] py-[1cqw] text-[2cqw] font-black tracking-[0.3em] bg-yellow-400 text-black skew-x-[-20deg] hover:bg-white hover:scale-105 transition-all shadow-[0_0_40px_rgba(250,204,21,0.6)] disabled:opacity-50"
            >
              <span className="inline-block skew-x-[20deg]">START RACE</span>
            </button>
            <div className="mt-[1.5cqw] text-[0.9cqw] text-white/60 tracking-[0.2em]">
              W/↑ THRUST · A/D STEER · Q/E AIRBRAKES · SHIFT/SPACE NOS BOOST · C CAMERA · R RESET · M MUTE
            </div>
          </div>
        )}

        {phase === "finished" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center font-hud italic text-white bg-black/50">
            <div className="text-[1.6cqw] tracking-[0.6em] text-yellow-300 font-black">RACE COMPLETE</div>
            <div className="text-[10cqw] font-black leading-none drop-shadow-[0_0_30px_rgba(255,220,0,0.6)]">
              {game.finalRank}
              <span className="text-[3cqw] text-yellow-300">{["ST", "ND", "RD"][game.finalRank - 1] ?? "TH"}</span>
            </div>
            <div className="text-[2.4cqw] font-black tabular-nums">{fmt(game.finalTime)}</div>
            <div className="mt-[1cqw] grid grid-cols-2 gap-x-[3cqw] gap-y-1 text-[1cqw] tracking-widest">
              {[...game.racers]
                .sort((a, b) => a.rank - b.rank)
                .map((r) => (
                  <div key={r.id} className={`flex gap-3 ${r.id === 0 ? "text-yellow-300" : "text-white/80"}`}>
                    <span className="w-[1.5cqw] text-right">{r.rank}</span>
                    <span>{r.team.name}</span>
                  </div>
                ))}
            </div>
            <button
              onClick={start}
              className="pointer-events-auto mt-[2cqw] px-[3cqw] py-[0.8cqw] text-[1.6cqw] font-black tracking-[0.3em] bg-yellow-400 text-black skew-x-[-20deg] hover:bg-white transition-all"
            >
              <span className="inline-block skew-x-[20deg]">RACE AGAIN</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
