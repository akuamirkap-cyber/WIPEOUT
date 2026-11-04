import * as THREE from "three";

export type Phase = "menu" | "countdown" | "racing" | "finished";
export const TOTAL_LAPS = 3;

export interface Team {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  glow: string;
}

export const TEAMS: Team[] = [
  { name: "FEISAR", primary: "#1f5fd6", secondary: "#f2f4f7", accent: "#f5c518", glow: "#52b8ff" },
  { name: "AG-SYS", primary: "#f4f6fa", secondary: "#1d6fe8", accent: "#ff2e2e", glow: "#7fd0ff" },
  { name: "QIREX", primary: "#5a2ca0", secondary: "#2a1a3f", accent: "#ffb300", glow: "#c77dff" },
  { name: "AURICOM", primary: "#f3f3f3", secondary: "#d81f1f", accent: "#ffd400", glow: "#ffb37a" },
  { name: "PIRANHA", primary: "#8a1016", secondary: "#14161a", accent: "#ffffff", glow: "#ff6a3d" },
  { name: "ASSEGAI", primary: "#15873f", secondary: "#f1f1f1", accent: "#ffe600", glow: "#9bff8a" },
  { name: "TRIAKIS", primary: "#5b616b", secondary: "#ff7a00", accent: "#f1f1f1", glow: "#ffb86b" },
  { name: "GOTEKI", primary: "#15161a", secondary: "#f6c800", accent: "#ff3b3b", glow: "#ffe36a" },
];

export interface RacerState {
  id: number;
  team: Team;
  lap: number;
  progress: number; // fractional sample index
  totalProgress: number; // lap*N + progress
  rank: number;
  finished: boolean;
  finishTime: number;
  position: THREE.Vector3;
}

export const input = {
  throttle: false,
  brake: false,
  left: false,
  right: false,
  airLeft: false,
  airRight: false,
  boost: false,
  reset: false,
};

export const game = {
  phase: "menu" as Phase,
  countdown: 3,
  time: 0,
  speed: 0,
  speedKmh: 0,
  energy: 100,
  nos: 100,
  boosting: false,
  lap: 0,
  rank: 8,
  shake: 0,
  message: "",
  messageTime: 0,
  racers: [] as RacerState[],
  playerIndex: 7,
  finalRank: 0,
  finalTime: 0,
  cameraMode: 0,
  cave: 0,
  playerPos: new THREE.Vector3(0, 0, 100),
  playerForward: new THREE.Vector3(0, 0, -1),
  listeners: new Set<() => void>(),
  notify() {
    this.listeners.forEach((l) => l());
  },
  setPhase(p: Phase) {
    this.phase = p;
    this.notify();
  },
  flash(msg: string) {
    this.message = msg;
    this.messageTime = 1.6;
  },
};

export function resetGame() {
  game.time = 0;
  game.speed = 0;
  game.energy = 100;
  game.nos = 100;
  game.lap = 0;
  game.rank = 8;
  game.shake = 0;
  game.message = "";
  game.countdown = 3;
  game.finalRank = 0;
  game.finalTime = 0;
  game.racers.forEach((r) => {
    r.lap = 0;
    r.finished = false;
    r.finishTime = 0;
  });
}

const keyMap: Record<string, keyof typeof input> = {
  KeyW: "throttle",
  ArrowUp: "throttle",
  KeyS: "brake",
  ArrowDown: "brake",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  KeyQ: "airLeft",
  KeyE: "airRight",
  ShiftLeft: "boost",
  ShiftRight: "boost",
  Space: "boost",
  KeyR: "reset",
};

let bound = false;
export function bindInput() {
  if (bound) return;
  bound = true;
  const down = (e: KeyboardEvent) => {
    const k = keyMap[e.code];
    if (k) {
      input[k] = true;
      e.preventDefault();
    }
    if (e.code === "KeyC") game.cameraMode = (game.cameraMode + 1) % 2;
  };
  const up = (e: KeyboardEvent) => {
    const k = keyMap[e.code];
    if (k) input[k] = false;
  };
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
}
