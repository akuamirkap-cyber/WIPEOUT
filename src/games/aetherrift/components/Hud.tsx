import type { HudData } from "../game/Game";

const cq = (px: number) => `${px / 19.2}cqw`;
const FONT = "Orbitron, 'Eurostile', 'Bank Gothic', 'Arial Black', sans-serif";
const YELLOW = "#f7ef1c";

export function fmtTime(t: number, digits = 1) {
  if (!isFinite(t) || t <= 0) return digits === 1 ? "0:00.0" : "0:00.00";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const sStr = s.toFixed(digits).padStart(digits === 1 ? 4 : 5, "0");
  return `${m}:${sStr}`;
}

function Label({ children, size = 30 }: { children: React.ReactNode; size?: number }) {
  return (
    <span
      style={{
        fontFamily: FONT,
        fontWeight: 900,
        fontStyle: "italic",
        color: YELLOW,
        fontSize: cq(size),
        letterSpacing: "0.06em",
        textShadow: "0 0 0.4cqw rgba(0,0,0,0.6)",
      }}
    >
      {children}
    </span>
  );
}

function Big({ children, size = 120 }: { children: React.ReactNode; size?: number }) {
  return (
    <span
      style={{
        fontFamily: FONT,
        fontWeight: 900,
        fontStyle: "italic",
        color: "#fff",
        fontSize: cq(size),
        lineHeight: 0.9,
        textShadow: "0 0.2cqw 0.8cqw rgba(0,0,0,0.55)",
      }}
    >
      {children}
    </span>
  );
}

function Segments({
  count,
  value,
  y,
  h,
  colorFn,
  skew = 18,
  stroke = YELLOW,
}: {
  count: number;
  value: number;
  y: number;
  h: number;
  colorFn: (i: number) => string;
  skew?: number;
  stroke?: string;
}) {
  const items = [];
  const w = 24;
  const gap = 5;
  for (let i = 0; i < count; i++) {
    const x = 18 + i * (w + gap);
    const on = i < Math.round(value * count);
    const pts = `${x + skew},${y} ${x + skew + w},${y} ${x + w},${y + h} ${x},${y + h}`;
    items.push(
      <polygon
        key={i}
        points={pts}
        fill={on ? colorFn(i) : "rgba(0,0,0,0.25)"}
        stroke={on ? colorFn(i) : stroke}
        strokeWidth={2.2}
        strokeOpacity={on ? 1 : 0.65}
      />
    );
  }
  return <>{items}</>;
}

export function Hud({ hud, mapPath }: { hud: HudData; mapPath: string }) {
  const hudVisible = hud.state !== "menu";
  if (!hudVisible) return null;
  const lowShield = hud.energy < 0.3;
  return (
    <div className="pointer-events-none absolute inset-0 select-none" style={{ fontFamily: FONT }}>
      {/* damage vignette */}
      <div
        className="absolute inset-0"
        style={{
          boxShadow: `inset 0 0 ${cq(260)} ${cq(40)} rgba(255,30,20,${Math.min(0.75, hud.hit * 0.8 + (hud.critical ? 0.25 : 0))})`,
        }}
      />
      {/* boost flash */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(60,200,255,${hud.boost * 0.35}) 100%)`,
        }}
      />

      {/* LAP */}
      <div className="absolute flex flex-col" style={{ left: cq(96), top: cq(44) }}>
        <Label size={34}>LAP</Label>
        <div className="flex items-end" style={{ gap: cq(14), marginTop: cq(-6) }}>
          <Big size={118}>{hud.lap}</Big>
          <div className="flex flex-col" style={{ paddingBottom: cq(8) }}>
            <Label size={34}>OF</Label>
          </div>
          <Big size={118}>{hud.laps}</Big>
        </div>
      </div>

      {/* minimap */}
      <div
        className="absolute"
        style={{
          left: cq(90),
          top: cq(232),
          width: cq(210),
          height: cq(210),
          filter: "drop-shadow(0 0 0.5cqw rgba(0,0,0,0.6))",
        }}
      >
        <svg viewBox="0 0 100 100" width="100%" height="100%">
          <path d={mapPath} fill="none" stroke="rgba(0,0,0,0.65)" strokeWidth={5} strokeLinejoin="round" />
          <path d={mapPath} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={2.2} strokeLinejoin="round" />
          {hud.map
            .filter((d) => !d.me)
            .map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r={2.3} fill={d.color} stroke="#000" strokeWidth={0.6} />
            ))}
          {hud.map
            .filter((d) => d.me)
            .map((d, i) => (
              <g key={i}>
                <circle cx={d.x} cy={d.y} r={5.2} fill="rgba(247,239,28,0.35)" />
                <circle cx={d.x} cy={d.y} r={3.2} fill={YELLOW} stroke="#fff" strokeWidth={0.9} />
              </g>
            ))}
        </svg>
      </div>

      {/* POS */}
      <div className="absolute flex flex-col items-end" style={{ right: cq(96), top: cq(44) }}>
        <Label size={34}>POS</Label>
        <div className="flex items-end" style={{ gap: cq(14), marginTop: cq(-6) }}>
          <Big size={118}>{hud.pos}</Big>
          <div style={{ paddingBottom: cq(8) }}>
            <Label size={34}>OF</Label>
          </div>
          <Big size={118}>{hud.total}</Big>
        </div>
      </div>

      {/* top center reticle */}
      <svg
        className="absolute"
        style={{ left: "50%", top: cq(40), width: cq(150), transform: "translateX(-50%)", opacity: 0.35 }}
        viewBox="0 0 100 100"
      >
        <g fill="none" stroke={YELLOW} strokeWidth={1.2}>
          <polygon points="30,5 70,5 95,30 95,70 70,95 30,95 5,70 5,30" />
          <polygon points="38,18 62,18 82,38 82,62 62,82 38,82 18,62 18,38" />
          <line x1="50" y1="5" x2="50" y2="95" />
          <line x1="5" y1="50" x2="95" y2="50" />
        </g>
      </svg>

      {/* TIME */}
      <div className="absolute flex flex-col" style={{ left: cq(96), bottom: cq(48) }}>
        <Big size={104}>{fmtTime(hud.time)}</Big>
        <div className="flex" style={{ gap: cq(40), marginTop: cq(10) }}>
          <div className="flex flex-col">
            <Label size={20}>LAST LAP</Label>
            <span style={{ color: "#fff", fontWeight: 800, fontStyle: "italic", fontSize: cq(28) }}>
              {hud.lastLap > 0 ? fmtTime(hud.lastLap, 2) : "--:--.--"}
            </span>
          </div>
          <div className="flex flex-col">
            <Label size={20}>BEST LAP</Label>
            <span style={{ color: "#fff", fontWeight: 800, fontStyle: "italic", fontSize: cq(28) }}>
              {hud.bestLap > 0 ? fmtTime(hud.bestLap, 2) : "--:--.--"}
            </span>
          </div>
        </div>
      </div>

      {/* SPEED / ENERGY / NOS */}
      <div className="absolute" style={{ right: cq(70), bottom: cq(40), width: cq(560), height: cq(250) }}>
        <div className="absolute flex items-end" style={{ right: cq(210), top: cq(0), gap: cq(10) }}>
          <Big size={118}>{hud.speed}</Big>
        </div>
        <div className="absolute" style={{ right: cq(100), top: cq(0) }}>
          <Label size={24}>KM/H</Label>
        </div>
        <svg viewBox="0 0 560 250" width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
          {/* speed */}
          <Segments
            count={18}
            value={hud.speedN}
            y={92}
            h={50}
            skew={22}
            colorFn={(i) => (i >= 12 ? "#6be8ff" : YELLOW)}
          />
          {/* shield */}
          <Segments
            count={14}
            value={hud.energy}
            y={154}
            h={30}
            skew={14}
            stroke="#ff4a5a"
            colorFn={(i) => `hsl(${350 - i * 6}, 90%, ${50 + (i % 2) * 4}%)`}
          />
          {/* nos */}
          <Segments
            count={14}
            value={hud.nitro}
            y={196}
            h={26}
            skew={12}
            stroke="#58d8ff"
            colorFn={() => (hud.nitroActive ? "#ffffff" : "#35c8ff")}
          />
        </svg>
        <div className="absolute" style={{ left: cq(8), top: cq(152) }}>
          <span style={{ color: "#ff8a95", fontSize: cq(15), fontWeight: 800, letterSpacing: "0.12em" }}>SHIELD</span>
        </div>
        <div className="absolute" style={{ left: cq(8), top: cq(196) }}>
          <span style={{ color: "#8fe4ff", fontSize: cq(15), fontWeight: 800, letterSpacing: "0.12em" }}>NOS</span>
        </div>
      </div>

      {/* Nitro / boost banner */}
      {(hud.nitroActive || hud.boost > 0.3) && (
        <div
          className="absolute flex justify-center"
          style={{ left: 0, right: 0, bottom: cq(210) }}
        >
          <span
            style={{
              fontFamily: FONT,
              fontWeight: 900,
              fontStyle: "italic",
              fontSize: cq(54),
              letterSpacing: "0.2em",
              color: "#bff4ff",
              textShadow: "0 0 1.2cqw #29c6ff, 0 0 3cqw #1b8cff",
            }}
          >
            {hud.nitroActive ? "NITRO" : "BOOST"}
          </span>
        </div>
      )}

      {/* Shield critical */}
      {hud.critical && hud.state !== "finished" && (
        <div className="absolute flex justify-center" style={{ left: 0, right: 0, top: cq(280) }}>
          <span
            className="animate-pulse"
            style={{ fontWeight: 900, fontStyle: "italic", fontSize: cq(34), color: "#ff4a4a", letterSpacing: "0.15em" }}
          >
            SHIELD CRITICAL
          </span>
        </div>
      )}
      {!hud.critical && lowShield && hud.state === "racing" && (
        <div className="absolute flex justify-center" style={{ left: 0, right: 0, top: cq(280) }}>
          <span className="animate-pulse" style={{ fontWeight: 800, fontStyle: "italic", fontSize: cq(22), color: "#ff9a4a", letterSpacing: "0.15em" }}>
            LOW SHIELD
          </span>
        </div>
      )}

      {/* Countdown */}
      {hud.state === "countdown" && hud.countdown > 0 && (
        <div className="absolute flex items-center justify-center" style={{ inset: 0, top: cq(-80) }}>
          <span
            key={hud.countdown}
            style={{
              fontFamily: FONT,
              fontWeight: 900,
              fontStyle: "italic",
              fontSize: cq(300),
              color: "#fff",
              textShadow: "0 0 2cqw #ff3b2e, 0 0 6cqw rgba(255,60,40,0.7)",
              animation: "pop 0.9s ease-out forwards",
            }}
          >
            {hud.countdown}
          </span>
        </div>
      )}
      {hud.state === "countdown" && hud.countdown < 0 && (
        <div className="absolute flex justify-center" style={{ left: 0, right: 0, top: cq(380) }}>
          <span style={{ fontWeight: 900, fontStyle: "italic", fontSize: cq(34), color: "#fff", letterSpacing: "0.3em", opacity: 0.9 }}>
            GET READY
          </span>
        </div>
      )}
      {hud.countdown === 0 && hud.state !== "countdown" && (
        <div className="absolute flex items-center justify-center" style={{ inset: 0, top: cq(-80) }}>
          <span
            style={{
              fontFamily: FONT,
              fontWeight: 900,
              fontStyle: "italic",
              fontSize: cq(260),
              color: "#6dff9a",
              textShadow: "0 0 2cqw #1aff6a, 0 0 6cqw rgba(40,255,120,0.6)",
              opacity: Math.min(1, hud.go / 1.2),
              transform: `scale(${1 + (2.2 - hud.go) * 0.25})`,
            }}
          >
            GO
          </span>
        </div>
      )}

      {/* Lap flash */}
      {hud.lapFlash > 0 && hud.state === "racing" && (
        <div
          className="absolute flex flex-col items-center"
          style={{ left: 0, right: 0, top: cq(250), opacity: Math.min(1, hud.lapFlash) }}
        >
          <span style={{ fontWeight: 900, fontStyle: "italic", fontSize: cq(64), color: YELLOW, letterSpacing: "0.1em", textShadow: "0 0 1cqw rgba(0,0,0,0.7)" }}>
            LAP {hud.lap}
          </span>
          <span style={{ fontWeight: 800, fontStyle: "italic", fontSize: cq(30), color: "#fff" }}>{fmtTime(hud.lastLap, 2)}</span>
        </div>
      )}

      {/* zone banner */}
      {hud.zoneT > 0 && (
        <div
          className="absolute flex flex-col items-center"
          style={{ left: 0, right: 0, top: cq(250), opacity: Math.min(1, hud.zoneT / 0.8, (3.6 - hud.zoneT) / 0.5) }}
        >
          <span style={{ fontWeight: 800, fontStyle: "italic", fontSize: cq(22), color: "#7fe4ff", letterSpacing: "0.5em" }}>ENTERING</span>
          <span
            style={{
              fontWeight: 900,
              fontStyle: "italic",
              fontSize: cq(78),
              color: "#fff",
              letterSpacing: "0.12em",
              textShadow: "0 0 1.2cqw #29c6ff, 0 0 3.5cqw rgba(120,60,255,0.8)",
            }}
          >
            {hud.zone}
          </span>
        </div>
      )}

      {/* controls hint */}
      {hud.state !== "finished" && hud.time < 14 && (
        <div
          className="absolute flex justify-center"
          style={{ left: 0, right: 0, bottom: cq(24), opacity: hud.state === "countdown" ? 0.95 : Math.max(0, 1 - hud.time / 14) }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: cq(17),
              letterSpacing: "0.12em",
              color: "#fff",
              background: "rgba(5,8,18,0.55)",
              padding: `${cq(8)} ${cq(22)}`,
              borderRadius: cq(6),
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            W GAS · A/D STEER · Q/E AIRBRAKE · <span style={{ color: "#7fe4ff" }}>SHIFT / SPACE NITRO</span> · C CAMERA
          </div>
        </div>
      )}
    </div>
  );
}
