import { useEffect, useState } from "react";
import { game, TOTAL_LAPS, type Phase } from "../game/store";

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const d = Math.floor((t % 1) * 10);
  return `${m}:${s.toString().padStart(2, "0")}.${d}`;
}

export function HUD({ phase }: { phase: Phase }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 50);
    return () => clearInterval(id);
  }, []);

  if (phase === "menu") return null;
  const lap = Math.min(TOTAL_LAPS, Math.max(1, game.lap));
  const speedPct = Math.min(1, game.speed / 150);
  const cd = Math.ceil(game.countdown);

  return (
    <div className="absolute inset-0 pointer-events-none select-none font-hud text-white">
      {/* LAP */}
      <div className="absolute left-[4%] top-[6%] italic">
        <div className="text-[1.3cqw] text-yellow-300 tracking-[0.3em] font-black">LAP</div>
        <div className="flex items-end gap-2 leading-none drop-shadow-[0_0_10px_rgba(0,0,0,0.6)]">
          <span className="text-[6cqw] font-black">{lap}</span>
          <span className="text-[1.6cqw] mb-[0.8cqw] text-yellow-300 font-black">OF</span>
          <span className="text-[4cqw] font-black">{TOTAL_LAPS}</span>
        </div>
      </div>
      {/* POS */}
      <div className="absolute right-[4%] top-[6%] italic text-right">
        <div className="text-[1.3cqw] text-yellow-300 tracking-[0.3em] font-black">POS</div>
        <div className="flex items-end justify-end gap-2 leading-none drop-shadow-[0_0_10px_rgba(0,0,0,0.6)]">
          <span className="text-[6cqw] font-black">{game.rank}</span>
          <span className="text-[1.6cqw] mb-[0.8cqw] text-yellow-300 font-black">OF</span>
          <span className="text-[4cqw] font-black">8</span>
        </div>
      </div>
      {/* TIME */}
      <div className="absolute left-[4%] bottom-[7%] italic leading-none">
        <div className="text-[1.1cqw] text-yellow-300 tracking-[0.3em] font-black mb-1">RACE TIME</div>
        <div className="text-[4.6cqw] font-black tabular-nums drop-shadow-[0_0_12px_rgba(0,0,0,0.6)]">{fmt(game.time)}</div>
      </div>
      {/* SPEED + ENERGY */}
      <div className="absolute right-[4%] bottom-[7%] italic text-right">
        <div className="flex items-end justify-end gap-2 leading-none mb-2">
          <span className="text-[4.8cqw] font-black tabular-nums drop-shadow-[0_0_12px_rgba(0,0,0,0.6)]">{game.speedKmh}</span>
          <span className="text-[1.2cqw] mb-[0.6cqw] font-bold text-yellow-300">KM/H</span>
        </div>
        {/* speed bar */}
        <div className="relative w-[20cqw] h-[1.1cqw] skew-x-[-30deg] bg-black/40 border border-yellow-300/70 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-yellow-500 via-yellow-300 to-white transition-[width] duration-75"
            style={{ width: `${speedPct * 100}%` }}
          />
          <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0,transparent_6px,rgba(0,0,0,0.45)_6px,rgba(0,0,0,0.45)_8px)]" />
        </div>
        {/* NOS bar */}
        <div className="mt-[0.5cqw] flex items-center justify-end gap-2">
          <span className={`text-[0.9cqw] font-black tracking-[0.25em] ${game.boosting ? "text-cyan-300 animate-pulse" : "text-cyan-200/80"}`}>NOS</span>
          <div className="relative w-[16cqw] h-[0.8cqw] skew-x-[-30deg] bg-black/40 border border-cyan-300/60 overflow-hidden">
            <div
              className={`h-full ${game.boosting ? "bg-gradient-to-r from-cyan-400 to-white" : "bg-gradient-to-r from-cyan-600 to-cyan-300"}`}
              style={{ width: `${game.nos}%` }}
            />
          </div>
        </div>
        {/* energy */}
        <div className="mt-[0.5cqw] flex items-center justify-end gap-2">
          <span className="text-[0.9cqw] font-black tracking-[0.25em] text-pink-200/80">ENERGY</span>
          <div className="relative w-[16cqw] h-[0.8cqw] skew-x-[-30deg] bg-black/40 border border-pink-300/60 overflow-hidden">
            <div
              className={`h-full ${game.energy < 30 ? "bg-red-500 animate-pulse" : "bg-gradient-to-r from-fuchsia-600 via-pink-400 to-yellow-300"}`}
              style={{ width: `${game.energy}%` }}
            />
          </div>
        </div>
      </div>
      {/* center messages */}
      <div className="absolute inset-x-0 top-[30%] flex flex-col items-center justify-center italic">
        {phase === "countdown" && (
          <div key={cd} className="text-[12cqw] font-black text-red-500 drop-shadow-[0_0_30px_rgba(255,40,40,0.8)] animate-[pop_0.9s_ease-out]">
            {cd}
          </div>
        )}
        {phase === "racing" && game.messageTime > 0 && (
          <div className="text-[5cqw] font-black text-yellow-300 drop-shadow-[0_0_20px_rgba(255,220,0,0.7)] animate-[pop_0.6s_ease-out]">
            {game.message}
          </div>
        )}
      </div>
      {/* bottom center speed lines when boosting */}
      {game.boosting && (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(80,200,255,0.22)_100%)]" />
          <div className="absolute inset-x-0 top-[14%] text-center text-[1.8cqw] font-black italic tracking-[0.5em] text-cyan-300 drop-shadow-[0_0_20px_rgba(80,200,255,0.9)] animate-pulse">
            NOS BOOST
          </div>
        </>
      )}
      {/* controls hint */}
      <div className="absolute bottom-[2%] inset-x-0 text-center text-[0.8cqw] text-white/50 tracking-[0.2em]">
        W/↑ THRUST · A/D STEER · Q/E AIRBRAKE · SHIFT/SPACE NOS · C CAMERA · R RESET
      </div>
    </div>
  );
}
