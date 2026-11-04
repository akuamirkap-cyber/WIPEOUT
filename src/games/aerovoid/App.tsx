import { useEffect, useMemo, useRef, useState } from 'react';
import { Game, GAME_BUILD_ID, HudState } from './game/Game';
import { TEAMS } from './game/ship';
import { TRACKS, trackPreview } from './game/trackDefs';

// Engine instances cannot be patched in place; reload rather than leave stale 3D assets.
if (import.meta.hot) import.meta.hot.accept('./game/Game', () => window.location.reload());

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

function fmt(t: number | null) {
  if (t === null || !isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

function IntensityPicker({ hud, game }: { hud: HudState; game: Game | null }) {
  return <div className="intensity-picker interactive" aria-label="Pengaturan intensitas kontrol">
    {([['REM', hud.brakeMult, (n: number) => game?.setBrakeMult(n)], ['PINDAH JALUR', hud.steerMult, (n: number) => game?.setSteerMult(n)]] as const).map(([label, value, set]) =>
      <div className="intensity-row" key={label} role="group" aria-label={label}>
        <span>{label}</span>{[1, 2, 3, 4].map(n => <button key={n} className={value === n ? 'sel' : ''} aria-pressed={value === n} onClick={() => set(n)}>{n}X</button>)}
      </div>)}
  </div>;
}

const HEX_PTS = '50,3 91,26.5 91,73.5 50,97 9,73.5 9,26.5';

function HexBox({
  value,
  total,
  label,
  style,
}: {
  value: number;
  total: number;
  label: string;
  style: React.CSSProperties;
}) {
  return (
    <div className="hexbox" style={style}>
      <span className="lab">{label}</span>
      <svg viewBox="0 0 100 100">
        <polygon points={HEX_PTS} fill="rgba(10,16,30,0.6)" stroke="#e8ff3a" strokeWidth="4" />
        <polygon points="50,14 80,31 80,69 50,86 20,69 20,31" fill="none" stroke="rgba(120,200,255,0.55)" strokeWidth="1.6" strokeDasharray="6 4" />
      </svg>
      <span className="num">{value}</span>
      <div className="tot">
        <svg viewBox="0 0 100 100">
          <polygon points={HEX_PTS} fill="rgba(30,40,60,0.8)" stroke="rgba(200,215,235,0.7)" strokeWidth="5" />
        </svg>
        <span>{total}</span>
      </div>
    </div>
  );
}

function Speedo({ speed, energy, boosting }: { speed: number; energy: number; boosting: boolean }) {
  const pct = Math.min(1, speed / 820);
  const segs = 22;
  const on = Math.round((energy / 100) * segs);
  return (
    <>
      <div className="speedo">
        <svg viewBox="0 0 220 120">
          <defs>
            <linearGradient id="sg" x1="0" x2="1">
              <stop offset="0" stopColor="#52d6ff" />
              <stop offset="0.6" stopColor="#e8ff3a" />
              <stop offset="1" stopColor="#ff5a1a" />
            </linearGradient>
          </defs>
          <path d="M 14 108 A 190 190 0 0 1 206 12" fill="none" stroke="rgba(150,190,230,0.22)" strokeWidth="9" pathLength={100} />
          <path
            d="M 14 108 A 190 190 0 0 1 206 12"
            fill="none"
            stroke={boosting ? '#ff8a1a' : 'url(#sg)'}
            strokeWidth="9"
            pathLength={100}
            strokeDasharray={`${pct * 100} 100`}
            style={{ filter: `drop-shadow(0 0 5px ${boosting ? '#ff6a00' : '#52d6ff'})` }}
          />
        </svg>
        <div className="num">{speed}</div>
        <div className="unit">KM/H</div>
      </div>
      <div className={'nitro' + (boosting ? ' boost' : '')} style={{ bottom: '1.2cqw', width: '17cqw', right: '2.4cqw' }}>
        <span className="lbl">NOS</span>
        <div className="bar">
          {Array.from({ length: segs }).map((_, i) => (
            <div key={i} className={'seg' + (i < on ? ' on' : '')} />
          ))}
        </div>
      </div>
    </>
  );
}

function TrackCard({
  def,
  pv,
  sel,
  onPick,
}: {
  def: (typeof TRACKS)[number];
  pv: ReturnType<typeof trackPreview>;
  sel: boolean;
  onPick: () => void;
}) {
  const plan = pv.plan.map((p) => p.join(',')).join(' ');
  const n = pv.elev.length;
  const ev = pv.elev.map((y, i) => `${(i / (n - 1)) * 100},${23 - (y / 400) * 21}`).join(' ');
  return (
    <button className={'trk' + (sel ? ' sel' : '')} onClick={onPick}>
      <div className="trk-head">
        <b>{def.name}</b>
        <span>{def.tag}</span>
      </div>
      <div className="trk-body">
        <svg viewBox="0 0 100 64" className="trk-plan">
          <polyline points={plan} fill="none" stroke="rgba(10,20,40,0.9)" strokeWidth="5.5" strokeLinejoin="round" />
          <polyline points={plan + ' ' + pv.plan[0].join(',')} fill="none" stroke={sel ? '#e8ff3a' : '#7fd0ff'} strokeWidth="2.4" strokeLinejoin="round" />
          {pv.marks.map((m, i) => (
            <circle key={i} cx={m[0]} cy={m[1]} r="3.6" fill="none" stroke="#ff9a1a" strokeWidth="1.6" />
          ))}
          <rect x={pv.plan[0][0] - 2.5} y={pv.plan[0][1] - 1.4} width="5" height="2.8" fill="#fff" />
        </svg>
        <div className="trk-stats">
          <div>
            <i>LOOP</i>
            <b>×{def.loops}</b>
          </div>
          <div>
            <i>HEIGHT</i>
            <b>{def.range}</b>
          </div>
          <div>
            <i>LENGTH</i>
            <b>{(pv.length / 1000).toFixed(1)} km</b>
          </div>
        </div>
      </div>
      <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="trk-elev">
        <polyline points={`0,24 ${ev} 100,24`} fill={sel ? 'rgba(232,255,58,0.18)' : 'rgba(127,208,255,0.16)'} stroke={sel ? '#e8ff3a' : '#7fd0ff'} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
    </button>
  );
}

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previews = useMemo(() => TRACKS.map(trackPreview), []);

  useEffect(() => {
    const game = new Game(mountRef.current!, setHud);
    gameRef.current = game;
    game.setMinimap(miniRef.current);
    game.init().catch((e) => {
      console.error(e);
      setError(String(e?.message ?? e));
    });
    const ro = new ResizeObserver(() => game.doResize());
    ro.observe(mountRef.current!);
    return () => {
      ro.disconnect();
      game.dispose();
      gameRef.current = null;
    };
  }, [GAME_BUILD_ID]);

  const g = () => gameRef.current;
  const phase = hud?.phase ?? 'loading';
  const racing = phase === 'racing' || phase === 'countdown' || phase === 'finished';

  return (
    <div className="viewport">
      <div className="rotate-warn">
        <div>
          <div style={{ fontSize: '3rem' }}>↻</div>
          <p>Putar perangkat ke mode landscape / gunakan layar PC 16:9</p>
        </div>
      </div>
      <div className="stage">
        <div ref={mountRef} className="layer" style={{ pointerEvents: 'none' }} />

        {/* in-race HUD */}
        <div className="layer" style={{ opacity: racing ? 1 : 0, transition: 'opacity .4s' }}>
          {hud && (
            <>
              {hud.camMode === 'chase' && (
                <>
                  <HexBox value={hud.lap} total={hud.laps} label="LAP" style={{ left: '2.2cqw', top: '2.6cqw' }} />
                  <HexBox value={hud.pos} total={hud.total} label="POS" style={{ right: '5.4cqw', top: '2.6cqw' }} />
                </>
              )}

              <div className="panel toppanel">
                <div>
                  <div className="k">LAP TIME</div>
                  <div className="v">{fmt(hud.lapTime)}</div>
                </div>
                <div>
                  <div className="k">TOTAL</div>
                  <div className="v">{fmt(hud.time)}</div>
                </div>
              </div>

              {hud.camMode === 'chase' && (
              <div className="panel times">
                <div className="row">
                  <b>BEST</b>
                  <span>{fmt(hud.best)}</span>
                </div>
                <div className="row">
                  <b>LAST</b>
                  <span>{fmt(hud.last)}</span>
                </div>
                <div className="row" style={{ fontSize: '1.05cqw', color: '#7fa3cc' }}>
                  <span>
                    {TEAMS[hud.teamIdx].name} · {hud.shipStyle === 'velocity' ? 'VELOCITY HULL' : 'AG-CLASS'}
                  </span>
                </div>
              </div>
              )}

              {hud.camMode === 'chase' && <Speedo speed={hud.speed} energy={hud.energy} boosting={hud.boosting} />}

              {hud.shortcutHint && (
                <div className="shortcut-hint">{hud.shortcutHint}</div>
              )}
              {hud.phase === 'countdown' && (
                <div style={{ position: 'absolute', top: '10cqw', left: 0, right: 0, textAlign: 'center', fontSize: '1.5cqw', letterSpacing: '0.5cqw', color: '#8fb4dd' }}>
                  {hud.trackName}
                </div>
              )}
              {hud.countdown > 0 && (
                <div key={'c' + hud.countdown} className="bigmsg pop" style={{ fontSize: '14cqw', top: '22%' }}>
                  {hud.countdown}
                </div>
              )}
              {hud.message && hud.countdown <= 0 && (
                <div key={hud.messageId} className="bigmsg fadeout" style={{ fontSize: '5.5cqw', top: '24%' }}>
                  {hud.message}
                </div>
              )}
              {hud.phase === 'countdown' && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '2.4cqw',
                    left: '50%',
                    right: 'auto',
                    transform: 'translateX(-50%)',
                    whiteSpace: 'nowrap',
                    padding: '0.35cqw 1.4cqw',
                    background: 'rgba(6,12,22,0.55)',
                    border: '1px solid rgba(140,190,255,0.25)',
                    textAlign: 'center',
                    fontSize: '1.1cqw',
                    letterSpacing: '0.2cqw',
                    color: '#cfe6ff',
                  }}
                >
                  TAHAN <b style={{ color: '#e8ff3a' }}>W</b> UNTUK GAS · <b style={{ color: '#e8ff3a' }}>SHIFT / SPACE</b> NITRO ·{' '}
                  <b style={{ color: '#e8ff3a' }}>Q / E</b> AIRBRAKE
                </div>
              )}
              <div className="layer boostflash" style={{ opacity: hud.boosting && phase === 'racing' ? 1 : 0 }} />
              {hud.boomActive && (
                <div key={hud.boomId} className="sonic-overlay" style={{ '--sonic-y': hud.camMode === 'cockpit' ? '50%' : '66%' } as React.CSSProperties}>
                  <div className="sonic-flare" />
                  <div className="sonic-ring" />
                  <div className="sonic-ring secondary" />
                  <div className="sonic-label">SONIC BOOST</div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="panel minimap layer" style={{ position: 'absolute', inset: 'auto', right: '2cqw', top: '12.5cqw', opacity: racing ? 0.95 : 0, background: 'rgba(8,14,26,0.45)' }}>
          <canvas ref={miniRef} width={256} height={256} />
        </div>

        {/* toolbar */}
        {racing && (
          <div className="toolbar">
            <button className="tb interactive" onClick={() => g()?.toggleMute()}>
              {hud?.muted ? 'SFX OFF' : 'SFX ON'} <kbd>M</kbd>
            </button>
            <button className="tb interactive" onClick={() => g()?.toggleMusic()}>
              MUSIC {hud?.music ? 'ON' : 'OFF'} <kbd>N</kbd>
            </button>
            <button className="tb interactive" onClick={() => g()?.toggleRain()}>
              HUJAN {hud?.raining ? 'DERAS' : 'REDA'} <kbd>H</kbd>
            </button>
            <button className="tb interactive" onClick={() => g()?.toggleShipStyle()}>
              BODI {hud?.shipStyle === 'velocity' ? 'VELOCITY' : 'AEROVOID'} <kbd>B</kbd>
            </button>
            <button className="tb interactive" onClick={() => g()?.setBrakeMult((hud?.brakeMult ?? 1) % 4 + 1)}>REM {hud?.brakeMult}X <kbd>1</kbd></button>
            <button className="tb interactive" onClick={() => g()?.setSteerMult((hud?.steerMult ?? 1) % 4 + 1)}>JALUR {hud?.steerMult}X <kbd>2</kbd></button>
            <button className="tb interactive" onClick={() => g()?.toggleCam()}>
              CAM {hud?.camMode === 'cockpit' ? 'COCKPIT' : 'CHASE'} <kbd>C</kbd>
            </button>
            <button className="tb interactive" onClick={() => g()?.togglePause()}>
              PAUSE <kbd>P</kbd>
            </button>
          </div>
        )}

        {/* paused */}
        {hud?.paused && (
          <div className="layer results" style={{ pointerEvents: 'auto', flexDirection: 'column', gap: '1.5cqw' }}>
            <div className="bigmsg" style={{ position: 'static', fontSize: '6cqw' }}>
              PAUSED
            </div>
            <IntensityPicker hud={hud} game={g()} />
            <button className="btn" onClick={() => g()?.togglePause()}>
              RESUME
            </button>
            <button className="btn ghost" onClick={() => g()?.restart()}>
              RESTART
            </button>
          </div>
        )}

        {/* menu */}
        {phase === 'menu' && hud && (
          <div className="layer menu">
            <div className="title">AEROVOID</div>
            <div className="subtitle">ANTI-GRAVITY RACING · OMEGA CUP · 3 LAPS</div>
            <div className="weather-picker interactive">
              <span className="weather-dot" />
              <span>CUACA: {hud.raining ? 'HUJAN DERAS' : 'HUJAN REDA'}</span>
              <button onClick={() => g()?.toggleRain()} aria-label="Ganti intensitas hujan">{hud.raining ? 'REDAKAN HUJAN' : 'HUJAN DERAS'} <kbd>H</kbd></button>
            </div>

            <div className="lbl">
              LINTASAN — <span style={{ color: '#fff' }}>{TRACKS[hud.trackIdx].name}</span>
            </div>
            <div className="trackgrid interactive">
              {TRACKS.map((t, i) => (
                <TrackCard key={t.id} def={t} pv={previews[i]} sel={i === hud.trackIdx} onPick={() => g()?.setTrack(i)} />
              ))}
            </div>
            <div className="trk-desc">{TRACKS[hud.trackIdx].desc}</div>

            <div className="lbl">
              BENTUK KENDARAAN —{' '}
              <span style={{ color: '#e8ff3a' }}>
                {hud.shipStyle === 'velocity' ? 'VELOCITY (TWIN-PRONG)' : 'AEROVOID (AG-STD)'}
              </span>
            </div>
            <div className="hullgrid interactive">
              <button
                className={'hull' + (hud.shipStyle === 'aerovoid' ? ' sel' : '')}
                onClick={() => g()?.setShipStyle('aerovoid')}
              >
                <span className="hull-badge">AG</span>
                <div>
                  <b>AEROVOID</b>
                  <small>Bodi Asli · 2 Nacelle + Center NOS</small>
                </div>
              </button>
              <button
                className={'hull' + (hud.shipStyle === 'velocity' ? ' sel' : '')}
                onClick={() => g()?.setShipStyle('velocity')}
              >
                <span className="hull-badge">VL</span>
                <div>
                  <b>VELOCITY</b>
                  <small>Bodi Velocity · Central + Twin Prong NOS</small>
                </div>
              </button>
            </div>

            <IntensityPicker hud={hud} game={g()} />
            <div className="lbl">
              WARNA TIM — <span style={{ color: '#fff' }}>{TEAMS[hud.teamIdx].name}</span>
            </div>
            <div className="teamgrid interactive">
              {TEAMS.map((t, i) => (
                <button key={t.name} className={'team' + (i === hud.teamIdx ? ' sel' : '')} onClick={() => g()?.setTeam(i)}>
                  <i style={{ background: `linear-gradient(90deg, ${hex(t.primary)} 0 62%, ${hex(t.secondary)} 62% 100%)` }} />
                  {t.name}
                </button>
              ))}
            </div>
            <div>
              <button className="btn" onClick={() => g()?.startRace()}>
                START RACE
              </button>
              <span style={{ marginLeft: '1.4cqw', fontSize: '1.05cqw', color: '#8fb4dd' }}>
                ENTER · ↑↓ lintasan · ←→ tim · B bodi
              </span>
            </div>
            <div className="keys">
              <span>
                <kbd>W</kbd> Gas
              </span>
              <span>
                <kbd>S</kbd> Rem
              </span>
              <span>
                <kbd>A</kbd>
                <kbd>D</kbd> Belok kiri / kanan
              </span>
              <span>
                <kbd>Q</kbd>
                <kbd>E</kbd> Airbrake kiri / kanan
              </span>
              <span>
                <kbd>SHIFT</kbd> Nitro
              </span>
              <span>
                <kbd>B</kbd> Bodi (Aerovoid/Velocity)
              </span>
              <span>
                <kbd>C</kbd> Cockpit
              </span>
              <span>
                <kbd>R</kbd> Restart
              </span>
              <span>
                <kbd>P</kbd> Pause
              </span>
            </div>
          </div>
        )}

        {/* results */}
        {phase === 'finished' && hud?.results && (
          <div className="layer results" style={{ pointerEvents: 'auto' }}>
            <div className="resbox">
              <h2>RACE COMPLETE</h2>
              <div style={{ fontSize: '1.4cqw', color: '#cfe6ff', marginBottom: '1cqw', letterSpacing: '0.2cqw' }}>
                POSISI AKHIR: <b style={{ color: '#e8ff3a', fontSize: '2cqw' }}>{hud.pos}</b> / {hud.total}
              </div>
              <div className="resrow head">
                <span>#</span>
                <span>PILOT</span>
                <span>TIME</span>
                <span>BEST LAP</span>
              </div>
              {hud.results.map((r, i) => (
                <div key={r.name} className={'resrow' + (r.isPlayer ? ' me' : '')}>
                  <span>{i + 1}</span>
                  <span>
                    <i className="swatch" style={{ background: hex(r.color) }} />
                    {r.name} <span style={{ opacity: 0.5, fontSize: '1cqw' }}>{r.team}</span>
                  </span>
                  <span>{r.time === null ? '—' : fmt(r.time)}</span>
                  <span>{fmt(r.best)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '1.2cqw', marginTop: '1.6cqw', alignItems: 'center' }}>
                <button className="btn" onClick={() => g()?.restart()}>
                  RACE AGAIN
                </button>
                <button className="btn ghost" onClick={() => g()?.toMenu()}>
                  MENU
                </button>
              </div>
            </div>
          </div>
        )}

        {/* loading / error */}
        {(phase === 'loading' || error) && (
          <div className="layer loading">
            {error ? (
              <>
                <div>WEBGL ERROR</div>
                <div style={{ fontSize: '1cqw', letterSpacing: 0, maxWidth: '40cqw', textAlign: 'center' }}>{error}</div>
              </>
            ) : (
              <>
                <div>LOADING HDRI SKY &amp; TRACK…</div>
                <div className="loadbar">
                  <i />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
