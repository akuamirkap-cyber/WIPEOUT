import React, { useState, useEffect, useCallback } from 'react';
import AerovoidGame from './games/aerovoid/App';
import AetherRiftGame from './games/aetherrift/App';
import VelocityGame from './games/velocity/App';
import { 
  Play, 
  ArrowLeft, 
  Maximize2, 
  Minimize2, 
  Volume2, 
  VolumeX, 
  Gauge, 
  Zap, 
  Layers, 
  Cpu, 
  Gamepad2, 
  Info,
  Sparkles,
  ChevronRight
} from 'lucide-react';

export type GameId = 'aerovoid' | 'aetherrift' | 'velocity' | null;

interface GameMeta {
  id: 'aerovoid' | 'aetherrift' | 'velocity';
  index: number;
  title: string;
  subtitle: string;
  engine: string;
  badge: string;
  badgeColor: string;
  glowColor: string;
  topSpeed: string;
  circuits: string;
  perspective: string;
  description: string;
  highlights: string[];
  controls: { key: string; act: string }[];
  accentGradient: string;
  cardBorder: string;
  heroArt: string;
}

const GAMES: GameMeta[] = [
  {
    id: 'aerovoid',
    index: 1,
    title: 'AEROVOID',
    subtitle: 'Cockpit Simulation & Weather System',
    engine: 'Three.js Direct Engine + Custom Shaders',
    badge: 'COCKPIT FPS',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    glowColor: 'rgba(245, 158, 11, 0.35)',
    topSpeed: '980 KM/H',
    circuits: '4 Planetary Tracks',
    perspective: 'Cockpit + Windshield Rain',
    description: 'Game balap anti-gravity sudut pandang kokpit pertama dengan simulasi tetesan hujan interaktif pada kaca depan, 4 sirkuit planet berbeda, dan efek sonic boom dramatis.',
    highlights: [
      'Simulasi kokpit 3D & wiper hujan',
      '4 track: Solitude Canyon, Neo Shibuya, Borealis, Magma',
      '4 Tim: Feisar, Auricom, Qirex, AG Systems',
      'Minimap real-time & indikator sonic boom'
    ],
    controls: [
      { key: 'W / ↑', act: 'Akselerasi' },
      { key: 'S / ↓', act: 'Rem / Mundur' },
      { key: 'A D / ← →', act: 'Belok Kiri/Kanan' },
      { key: 'SPACE', act: 'Turbo Boost' },
      { key: 'C / V', act: 'Ganti Kamera' },
      { key: 'H', act: 'Toggle Cuaca / Hujan' },
    ],
    accentGradient: 'from-amber-500 via-orange-500 to-yellow-400',
    cardBorder: 'hover:border-amber-400/80 hover:shadow-[0_0_35px_rgba(245,158,11,0.25)]',
    heroArt: 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(10,16,28,0.95) 70%)',
  },
  {
    id: 'aetherrift',
    index: 2,
    title: 'AETHER RIFT',
    subtitle: 'Subterranean Chasm & Neon Tunnels',
    engine: 'Three.js Procedural Cave Extrusion',
    badge: 'WIPEOUT 3D',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    glowColor: 'rgba(6, 182, 212, 0.35)',
    topSpeed: '1,150 KM/H',
    circuits: 'Neon Cave Chasm Rollercoaster',
    perspective: 'Third-Person Chase Cam',
    description: 'Sensasi balap Wipeout otentik menyusuri terowongan gua es dan jurang neon berkecepatan tinggi dengan air brakes, pad boost lantai, dan 8 rival kapal balap futuristik.',
    highlights: [
      'Terowongan gua neon & loop 360°',
      'Sistem air brakes untuk tikungan tajam',
      'Pad boost lantai & medan anti-gravitasi',
      '8 AI lawan agresif dengan leaderboard'
    ],
    controls: [
      { key: 'W / ↑', act: 'Gas / Maju' },
      { key: 'S / ↓', act: 'Rem' },
      { key: 'A D / ← →', act: 'Steering' },
      { key: 'SHIFT / Q E', act: 'Air Brakes (Drift)' },
      { key: 'SPACE', act: 'Speed Boost' },
      { key: 'R', act: 'Restart Balapan' },
    ],
    accentGradient: 'from-cyan-400 via-blue-500 to-indigo-500',
    cardBorder: 'hover:border-cyan-400/80 hover:shadow-[0_0_35px_rgba(6,182,212,0.25)]',
    heroArt: 'linear-gradient(135deg, rgba(6,182,212,0.15) 0%, rgba(8,14,26,0.95) 70%)',
  },
  {
    id: 'velocity',
    index: 3,
    title: 'VELOCITY',
    subtitle: 'React Three Fiber & Post-Processing Shaders',
    engine: 'R3F + Drei + Postprocessing Pipeline',
    badge: 'R3F BLOOM',
    badgeColor: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40',
    glowColor: 'rgba(217, 70, 239, 0.35)',
    topSpeed: '1,220 KM/H',
    circuits: 'Infinite Cyber Circuit',
    perspective: 'Dynamic Kinetic Chase Cam',
    description: 'Game balap arsitektur React Three Fiber modern dengan efek post-processing cinematic bloom, chromatic aberration, partikel knalpot exhaust, dan live synth audio generator.',
    highlights: [
      'Pipeline React Three Fiber + Post-Processing',
      'Efek visual bloom, speed lines, & aberasi kromatik',
      'Synthesizer musik synthwave prosedural live',
      'Pilihan tim balap dengan atribut performa'
    ],
    controls: [
      { key: 'W / ↑', act: 'Akselerasi Penuh' },
      { key: 'S / ↓', act: 'Rem' },
      { key: 'A D / ← →', act: 'Kemudi / Manuver' },
      { key: 'SPACE', act: 'Overdrive Boost' },
      { key: 'M', act: 'Toggle Musik Synth' },
      { key: 'ENTER', act: 'Mulai / Lanjut' },
    ],
    accentGradient: 'from-fuchsia-500 via-pink-500 to-rose-400',
    cardBorder: 'hover:border-fuchsia-400/80 hover:shadow-[0_0_35px_rgba(217,70,239,0.25)]',
    heroArt: 'linear-gradient(135deg, rgba(217,70,239,0.15) 0%, rgba(12,8,22,0.95) 70%)',
  },
];

// Synth audio chime for menu interactions
let menuAudioCtx: AudioContext | null = null;
function playUiBeep(freq = 440, type: OscillatorType = 'sine', duration = 0.08) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!menuAudioCtx) menuAudioCtx = new AudioCtx();
    if (menuAudioCtx.state === 'suspended') menuAudioCtx.resume();
    
    const now = menuAudioCtx.currentTime;
    const osc = menuAudioCtx.createOscillator();
    const gain = menuAudioCtx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + duration);
    
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    
    osc.connect(gain);
    gain.connect(menuAudioCtx.destination);
    
    osc.start(now);
    osc.stop(now + duration);
  } catch {
    // ignore
  }
}

export default function App() {
  const [activeGame, setActiveGame] = useState<GameId>(null);
  const [hoveredGame, setHoveredGame] = useState<GameId>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControlsModal, setShowControlsModal] = useState<GameMeta | null>(null);

  // Keyboard shortcut: ESC to return to main menu or numbers 1, 2, 3 to launch
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showControlsModal) {
          setShowControlsModal(null);
          return;
        }
        if (activeGame) {
          playUiBeep(320, 'triangle', 0.12);
          setActiveGame(null);
        }
      }
      if (!activeGame && !showControlsModal) {
        if (e.key === '1') launchGame('aerovoid');
        if (e.key === '2') launchGame('aetherrift');
        if (e.key === '3') launchGame('velocity');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeGame, showControlsModal]);

  const launchGame = (id: GameId) => {
    playUiBeep(660, 'sawtooth', 0.15);
    setActiveGame(id);
  };

  const handleReturnToMenu = () => {
    playUiBeep(330, 'triangle', 0.12);
    setActiveGame(null);
  };

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  // -------------------------------------------------------------
  // RENDER ACTIVE GAME IF SELECTED
  // -------------------------------------------------------------
  if (activeGame) {
    const currentGameMeta = GAMES.find((g) => g.id === activeGame)!;

    return (
      <div className="relative w-screen h-screen bg-black overflow-hidden select-none">
        {/* Floating Top HUD Navigation Bar */}
        <header className="absolute top-0 left-0 right-0 z-50 px-4 py-2.5 flex items-center justify-between bg-gradient-to-b from-black/85 via-black/40 to-transparent pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              onClick={handleReturnToMenu}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-black/75 hover:bg-neutral-800/90 text-white border border-white/20 hover:border-cyan-400 text-xs sm:text-sm font-semibold tracking-wider font-orbitron transition active:scale-95 shadow-lg shadow-black/50 backdrop-blur-md cursor-pointer group"
              title="Kembali ke Main Menu (ESC)"
            >
              <ArrowLeft className="w-4 h-4 text-cyan-400 group-hover:-translate-x-1 transition-transform" />
              <span>MAIN MENU</span>
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] bg-white/10 rounded text-neutral-300 border border-white/10">
                ESC
              </kbd>
            </button>

            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-lg bg-black/60 border border-white/10 backdrop-blur-md text-xs font-orbitron">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-white font-bold">{currentGameMeta.title}</span>
              <span className="text-white/40">|</span>
              <span className="text-white/70 text-[11px]">{currentGameMeta.badge}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              onClick={() => setShowControlsModal(currentGameMeta)}
              className="px-2.5 py-1.5 rounded-lg bg-black/75 hover:bg-neutral-800/90 text-white/80 hover:text-white border border-white/15 hover:border-white/30 text-xs font-orbitron transition flex items-center gap-1.5 backdrop-blur-md cursor-pointer"
              title="Lihat Petunjuk Kontrol"
            >
              <Gamepad2 className="w-3.5 h-3.5 text-yellow-400" />
              <span className="hidden sm:inline">Kontrol</span>
            </button>

            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg bg-black/75 hover:bg-neutral-800/90 text-white/80 hover:text-white border border-white/15 hover:border-white/30 transition backdrop-blur-md cursor-pointer"
              title={isFullscreen ? 'Keluar Layar Penuh' : 'Layar Penuh'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* The Game Instance */}
        <div className="w-full h-full">
          {activeGame === 'aerovoid' && <AerovoidGame />}
          {activeGame === 'aetherrift' && <AetherRiftGame />}
          {activeGame === 'velocity' && <VelocityGame />}
        </div>

        {/* Quick Controls Modal In Game */}
        {showControlsModal && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-neutral-900 border border-cyan-500/40 rounded-2xl p-6 shadow-2xl relative font-orbitron text-white">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Gamepad2 className="w-5 h-5 text-cyan-400" />
                  <h3 className="font-bold text-base tracking-wide">
                    Kontrol — {showControlsModal.title}
                  </h3>
                </div>
                <button
                  onClick={() => setShowControlsModal(null)}
                  className="text-white/60 hover:text-white text-sm cursor-pointer p-1"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 space-y-2.5">
                {showControlsModal.controls.map((ctrl, i) => (
                  <div key={i} className="flex items-center justify-between bg-black/50 px-3 py-2 rounded-lg border border-white/5">
                    <kbd className="px-2 py-1 rounded bg-neutral-800 border border-white/20 text-yellow-300 text-xs font-bold font-mono">
                      {ctrl.key}
                    </kbd>
                    <span className="text-xs text-neutral-300 font-sans font-medium">{ctrl.act}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setShowControlsModal(null)}
                className="mt-6 w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-sm tracking-wider transition cursor-pointer"
              >
                KEMBALI KE GAME
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER MAIN MENU / ARCADE SELECTION (Jejeran 3 Game)
  // -------------------------------------------------------------
  return (
    <div className="relative min-h-screen w-full bg-[#05070e] text-white flex flex-col justify-between overflow-x-hidden selection:bg-cyan-500 selection:text-black">
      {/* Background Cyber Grid & Vignette */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_20%,rgba(6,182,212,0.15),transparent_70%)]" />

      {/* Main Container */}
      <div className="relative z-10 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex flex-col flex-1">
        
        {/* Top Header Bar */}
        <header className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-600 to-fuchsia-500 p-0.5 shadow-lg shadow-cyan-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-[#070b16] rounded-[10px] flex items-center justify-center font-orbitron font-black text-cyan-400 text-xl tracking-tighter">
                AG
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] tracking-[0.3em] uppercase text-cyan-400 font-orbitron font-bold">
                  ARCADE SELECTOR
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-[10px] tracking-wider text-neutral-400 uppercase font-orbitron">
                  3 GAMES LOADED
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight font-orbitron text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-indigo-300">
                ANTI-GRAVITY RACING TRILOGY
              </h1>
            </div>
          </div>

          {/* Quick Stats / Actions */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-4 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-orbitron text-neutral-300">
              <div className="flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-cyan-400" />
                <span>MAX SPEED: <b className="text-white">1,220 KM/H</b></span>
              </div>
              <span className="text-white/20">|</span>
              <div className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-fuchsia-400" />
                <span>3 ENGINES</span>
              </div>
            </div>

            <button
              onClick={toggleFullscreen}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white transition cursor-pointer"
              title="Layar Penuh"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Hero Section Banner */}
        <div className="my-6 text-center max-w-2xl mx-auto space-y-2">
          <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-orbitron font-semibold tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            PILIH GAME YANG INGIN DIMAINKAN
          </p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black font-orbitron tracking-tight text-white">
            TIGA DIMENSI BALAP KECEPATAN TINGGI
          </h2>
          <p className="text-xs sm:text-sm text-neutral-400 max-w-xl mx-auto font-sans">
            Tiga variasi balapan 3D futuristik bergaya Wipeout & F-Zero telah dirangkum dalam satu menu. Tekan tombol <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-cyan-300">1</kbd>, <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-cyan-300">2</kbd>, atau <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-cyan-300">3</kbd> atau klik kartu game di bawah untuk meluncur!
          </p>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* 3 GAME CARDS JEJERAN (3-COLUMN RESPONSIVE GRID)               */}
        {/* ------------------------------------------------------------- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-4 items-stretch">
          {GAMES.map((game) => {
            const isHovered = hoveredGame === game.id;

            return (
              <div
                key={game.id}
                onMouseEnter={() => {
                  setHoveredGame(game.id);
                  playUiBeep(480 + game.index * 60, 'sine', 0.05);
                }}
                onMouseLeave={() => setHoveredGame(null)}
                className={`relative group rounded-2xl bg-[#0c1220]/90 border border-white/15 ${game.cardBorder} transition-all duration-300 flex flex-col justify-between overflow-hidden backdrop-blur-md shadow-xl`}
                style={{
                  background: game.heroArt,
                }}
              >
                {/* Top Corner Number Badge */}
                <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
                  <span className={`text-[10px] font-orbitron font-black px-2.5 py-0.5 rounded-full border ${game.badgeColor}`}>
                    {game.badge}
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-black/60 border border-white/15 flex items-center justify-center font-orbitron font-bold text-xs text-white/80">
                    #{game.index}
                  </div>
                </div>

                {/* Card Header Content */}
                <div className="p-5 sm:p-6 space-y-4">
                  {/* Title & Subtitle */}
                  <div>
                    <span className="text-[10px] tracking-[0.25em] text-neutral-400 font-orbitron font-semibold uppercase block mb-1">
                      GAME 0{game.index}
                    </span>
                    <h3 className="text-2xl sm:text-3xl font-black font-orbitron tracking-tight text-white group-hover:text-cyan-300 transition-colors">
                      {game.title}
                    </h3>
                    <p className="text-xs text-neutral-400 font-orbitron font-medium mt-1">
                      {game.subtitle}
                    </p>
                  </div>

                  {/* Engine & Speed Badges */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-orbitron">
                    <div className="p-2 rounded-xl bg-black/40 border border-white/10 flex flex-col">
                      <span className="text-[9px] text-neutral-400 font-sans">Top Speed</span>
                      <span className="font-extrabold text-white text-xs mt-0.5">{game.topSpeed}</span>
                    </div>
                    <div className="p-2 rounded-xl bg-black/40 border border-white/10 flex flex-col">
                      <span className="text-[9px] text-neutral-400 font-sans">Sirkuit</span>
                      <span className="font-extrabold text-white text-xs mt-0.5 truncate">{game.circuits}</span>
                    </div>
                  </div>

                  {/* Brief Description */}
                  <p className="text-xs text-neutral-300/90 font-sans leading-relaxed line-clamp-3">
                    {game.description}
                  </p>

                  {/* Highlights Bullet List */}
                  <div className="space-y-1.5 pt-2 border-t border-white/10">
                    <span className="text-[10px] uppercase font-orbitron font-bold text-neutral-400 tracking-wider">
                      Fitur Utama:
                    </span>
                    {game.highlights.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-neutral-300 font-sans">
                        <span className="text-cyan-400 font-bold shrink-0">▸</span>
                        <span className="line-clamp-1">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="p-5 sm:p-6 pt-0 mt-auto space-y-2">
                  <button
                    onClick={() => launchGame(game.id)}
                    className={`w-full py-3.5 px-4 rounded-xl bg-gradient-to-r ${game.accentGradient} text-black font-black font-orbitron text-sm tracking-wider flex items-center justify-center gap-2 shadow-lg hover:brightness-110 active:scale-98 transition-all cursor-pointer`}
                  >
                    <Play className="w-4 h-4 fill-black" />
                    <span>MAINKAN SEKARANG</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/20 text-black font-mono font-bold">
                      [{game.index}]
                    </span>
                  </button>

                  <button
                    onClick={() => setShowControlsModal(game)}
                    className="w-full py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-orbitron transition flex items-center justify-center gap-1.5 border border-white/5 hover:border-white/20 cursor-pointer"
                  >
                    <Gamepad2 className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Lihat Panduan Kontrol</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* ------------------------------------------------------------- */}
        {/* ENGINE COMPARISON TABLE                                       */}
        {/* ------------------------------------------------------------- */}
        <section className="mt-8 mb-4 p-5 rounded-2xl bg-white/[0.03] border border-white/10">
          <h3 className="text-xs uppercase font-orbitron font-bold text-cyan-400 tracking-wider mb-3 flex items-center gap-2">
            <Info className="w-4 h-4" />
            Perbandingan Spesifikasi 3 Game
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead>
                <tr className="border-b border-white/10 text-neutral-400 font-orbitron text-[11px]">
                  <th className="pb-2">Parameter</th>
                  <th className="pb-2 text-amber-300">1. AEROVOID</th>
                  <th className="pb-2 text-cyan-300">2. AETHER RIFT</th>
                  <th className="pb-2 text-fuchsia-300">3. VELOCITY</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-neutral-300">
                <tr>
                  <td className="py-2 font-semibold text-white">Engine Teknologi</td>
                  <td className="py-2">Three.js + Shaders</td>
                  <td className="py-2">Three.js Tube Geometry</td>
                  <td className="py-2">React Three Fiber + PostProc</td>
                </tr>
                <tr>
                  <td className="py-2 font-semibold text-white">Sudut Kamera</td>
                  <td className="py-2">Cockpit FPS + Chase Cam</td>
                  <td className="py-2">Wipeout 3rd Person</td>
                  <td className="py-2">Kinetic Dynamic Chase</td>
                </tr>
                <tr>
                  <td className="py-2 font-semibold text-white">Mekanik Spesial</td>
                  <td className="py-2">Hujan Wiper & Sonic Boom</td>
                  <td className="py-2">Air Brakes & Cave Drift</td>
                  <td className="py-2">Postprocessing Bloom & Synth</td>
                </tr>
                <tr>
                  <td className="py-2 font-semibold text-white">Shortcut Cepat</td>
                  <td className="py-2"><kbd className="px-1.5 py-0.5 rounded bg-white/10 text-amber-300 font-mono">1</kbd></td>
                  <td className="py-2"><kbd className="px-1.5 py-0.5 rounded bg-white/10 text-cyan-300 font-mono">2</kbd></td>
                  <td className="py-2"><kbd className="px-1.5 py-0.5 rounded bg-white/10 text-fuchsia-300 font-mono">3</kbd></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-auto pt-6 pb-2 text-center text-xs text-neutral-500 font-orbitron flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-white/5">
          <div>WIPEOUT ANTI-GRAVITY RACING TRILOGY — 3-IN-1 ARCADE</div>
          <div className="flex items-center gap-3">
            <span>Tekan ESC kapan saja saat bermain untuk kembali ke Main Menu</span>
          </div>
        </footer>
      </div>

      {/* Controls Modal (from Main Menu) */}
      {showControlsModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-neutral-900 border border-cyan-500/40 rounded-2xl p-6 shadow-2xl relative font-orbitron text-white animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Gamepad2 className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-base tracking-wide">
                  Kontrol — {showControlsModal.title}
                </h3>
              </div>
              <button
                onClick={() => setShowControlsModal(null)}
                className="text-white/60 hover:text-white text-sm cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-2.5">
              {showControlsModal.controls.map((ctrl, i) => (
                <div key={i} className="flex items-center justify-between bg-black/50 px-3 py-2 rounded-lg border border-white/5">
                  <kbd className="px-2 py-1 rounded bg-neutral-800 border border-white/20 text-yellow-300 text-xs font-bold font-mono">
                    {ctrl.key}
                  </kbd>
                  <span className="text-xs text-neutral-300 font-sans font-medium">{ctrl.act}</span>
                </div>
              ))}
            </div>

            <div className="mt-6 flex gap-2">
              <button
                onClick={() => setShowControlsModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs tracking-wider transition cursor-pointer"
              >
                TUTUP
              </button>
              <button
                onClick={() => {
                  const id = showControlsModal.id;
                  setShowControlsModal(null);
                  launchGame(id);
                }}
                className="flex-1 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-black text-xs tracking-wider transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-black" />
                MAINKAN
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
