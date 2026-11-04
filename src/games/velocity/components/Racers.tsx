import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Ship, type ShipHandle } from "./Ship";
import {
  START_GRID,
  SAMPLE_COUNT,
  SEG_LEN,
  TRACK_HALF_WIDTH as HW,
  PADS,
  getTrackInfo,
  frameAt,
  wrapIndex,
  padHeightAt,
  planeHeight,
  samples,
  type Frame as TrackFrame,
} from "../game/track";
import { game, input, TEAMS, TOTAL_LAPS, resetGame } from "../game/store";
import { blobTexture } from "../game/textures";
import { audio } from "../game/audio";

const HOVER = 1.3;
const MIN_CLEARANCE = 0.8;
const ACCEL = 40;
const MAX_SPEED = 96;
const BOOST_THRUST = 60;
const N = SAMPLE_COUNT;
const ZERO = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);
const AX_Z = new THREE.Vector3(0, 0, 1);
const AX_X = new THREE.Vector3(1, 0, 0);

type Frame = TrackFrame;
const mkFrame = (): Frame => ({ p: new THREE.Vector3(), t: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3(), w: HW });

interface AI {
  progress: number;
  lane: number;
  laneTarget: number;
  speed: number;
  baseSpeed: number;
  laneTimer: number;
  roll: number;
  lap: number;
  frame: Frame;
  pos: THREE.Vector3;
}

function lapFromProgress(prev: number, cur: number, lap: number) {
  if (prev > N * 0.8 && cur < N * 0.2) return lap + 1;
  if (prev < N * 0.2 && cur > N * 0.8) return lap - 1;
  return lap;
}

export function Racers() {
  const ships = useRef<(ShipHandle | null)[]>([]);
  const blobs = useRef<(THREE.Mesh | null)[]>([]);
  const engineLight = useRef<THREE.PointLight>(null!);
  const { camera } = useThree();

  const P = useRef({
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    yaw: 0,
    idx: N - 30,
    prevProgress: 0,
    lap: 0,
    roll: 0,
    quat: new THREE.Quaternion(),
    padCooldown: 0,
    padKick: 0,
    steer: 0,
    air: 0,
    airbrake: 0,
    throttle: 0,
    boostAmt: 0,
    wasBoosting: false,
    yawRate: 0,
    hoverOff: 0,
    hoverVel: 0,
    terrainPitch: 0,
    lastBase: 0,
    pitch: 0,
    scrapeTimer: 0,
    inCave: false,
    autopilot: false,
    autoProgress: 0,
    autoLane: 0,
    autoFrame: mkFrame(),
  }).current;

  const ais = useRef<AI[]>([]).current;
  const cam = useRef({ pos: new THREE.Vector3(0, 10, 120), up: new THREE.Vector3(0, 1, 0), fov: 70, look: new THREE.Vector3(), off: new THREE.Vector3(0, 4, 12), lookOff: new THREE.Vector3(0, 1, -10), headYaw: undefined as number | undefined }).current;
  const tmp = useMemo(
    () => ({
      f: new THREE.Vector3(),
      fp: new THREE.Vector3(),
      m: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
      q2: new THREE.Quaternion(),
      v: new THREE.Vector3(),
      v2: new THREE.Vector3(),
      v2b: new THREE.Vector3(),
      probe: new THREE.Vector3(),
      look: new THREE.Vector3(),
    }),
    []
  );

  // init racers
  const initRace = () => {
    resetGame();
    // player -> grid slot 7 (or debug spawn index via ?spawn=N)
    const g = START_GRID[7];
    const spawnParam = typeof location !== "undefined" ? Number(new URLSearchParams(location.search).get("spawn")) : 0;
    const spawnIdx = spawnParam > 0 ? wrapIndex(spawnParam) : -1;
    const info = spawnIdx >= 0 ? getTrackInfo(samples[spawnIdx].p, spawnIdx) : getTrackInfo(new THREE.Vector3(g.x, 0, g.z), N - 30);
    if (spawnIdx >= 0) {
      const ss = samples[spawnIdx];
      P.pos.copy(ss.p).addScaledVector(ss.u, HOVER);
      P.yaw = Math.atan2(-ss.t.x, -ss.t.z);
    } else {
      P.pos.set(g.x, info.height + padHeightAt(g.x, g.z) + HOVER, g.z);
      P.yaw = 0;
    }
    P.vel.set(0, 0, 0);
    P.idx = info.index;
    P.prevProgress = info.progress;
    P.lap = 0;
    P.autopilot = false;
    P.steer = P.air = P.airbrake = P.throttle = P.boostAmt = P.yawRate = P.hoverOff = P.hoverVel = P.pitch = P.padKick = 0;
    P.lastBase = 0;
    P.wasBoosting = false;
    P.inCave = false;
    game.cave = 0;
    cam.headYaw = undefined;
    P.quat.identity();
    ais.length = 0;
    for (let i = 0; i < 7; i++) {
      const gg = START_GRID[i];
      const inf = spawnIdx >= 0 ? getTrackInfo(samples[wrapIndex(spawnIdx + 10 + i * 6)].p, spawnIdx) : getTrackInfo(new THREE.Vector3(gg.x, 0, gg.z), N - 30);
      ais.push({
        progress: inf.progress,
        lane: spawnIdx >= 0 ? (i % 2 ? 6 : -6) : gg.x,
        laneTarget: gg.x,
        speed: 0,
        baseSpeed: 74 + i * 1.8 + Math.random() * 3,
        laneTimer: 1 + Math.random() * 3,
        roll: 0,
        lap: 0,
        frame: mkFrame(),
        pos: new THREE.Vector3(),
      });
    }
    game.racers = [
      { id: 0, team: TEAMS[0], lap: 0, progress: 0, totalProgress: 0, rank: 8, finished: false, finishTime: 0, position: P.pos },
      ...ais.map((a, i) => ({
        id: i + 1,
        team: TEAMS[i + 1],
        lap: 0,
        progress: 0,
        totalProgress: 0,
        rank: 1,
        finished: false,
        finishTime: 0,
        position: a.pos,
      })),
    ];
  };

  useEffect(() => {
    initRace();
    const unsub = () => {
      if (game.phase === "countdown" && game.countdown === 3) initRace();
    };
    game.listeners.add(unsub);
    return () => {
      game.listeners.delete(unsub);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((state, dtRaw) => {
    if (game.racers.length === 0 || ais.length === 0) initRace();
    const dt = Math.min(dtRaw, 0.05);
    const t = state.clock.elapsedTime;
    const racing = game.phase === "racing";
    const moving = racing || game.phase === "finished";

    // ---------- phase timers ----------
    if (game.phase === "countdown") {
      const before = Math.ceil(game.countdown);
      game.countdown -= dt;
      const after = Math.ceil(game.countdown);
      if (after !== before && after > 0) audio.countdownBeep();
      if (game.countdown <= 0) {
        game.setPhase("racing");
        game.flash("GO!");
        audio.go();
      }
    }
    if (racing) game.time += dt;
    if (game.messageTime > 0) game.messageTime -= dt;
    game.shake = Math.max(0, game.shake - dt * 2.2);

    // ---------- PLAYER ----------
    const ship = ships.current[0];
    const { f, fp, m, q, v, v2 } = tmp;
    f.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
    let info = getTrackInfo(P.pos, P.idx);
    let boosting = false;
    let thrust = 0;
    const damp = THREE.MathUtils.damp;

    if (racing && !P.autopilot) {
      // --- smoothed inputs (frame-rate independent) ---
      const steerRaw = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const airRaw = (input.airRight ? 1 : 0) - (input.airLeft ? 1 : 0);
      const abRaw = input.airLeft || input.airRight ? 1 : 0;
      P.steer = damp(P.steer, steerRaw, 12, dt);
      P.air = damp(P.air, airRaw, 14, dt);
      P.airbrake = damp(P.airbrake, abRaw, 10, dt);
      P.throttle = damp(P.throttle, input.throttle ? 1 : 0, 7, dt);
      const wantBoost = input.boost && game.nos > 0.5;
      if (wantBoost && !P.wasBoosting) audio.boostStart();
      if (!wantBoost && P.wasBoosting) {
        if (game.nos <= 0.5) audio.boostEmpty();
        else audio.boostEnd();
      }
      P.wasBoosting = wantBoost;
      boosting = wantBoost;
      P.boostAmt = damp(P.boostAmt, boosting ? 1 : 0, boosting ? 6 : 4, dt);
      if (boosting) game.nos = Math.max(0, game.nos - 28 * dt);
      else game.nos = Math.min(100, game.nos + 4.5 * dt);
      game.boosting = boosting;
      thrust = P.throttle * ACCEL + P.boostAmt * BOOST_THRUST;

      // --- fixed sub-step integration (120 Hz) for silky motion ---
      const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
      const h = dt / sub;
      let hitWall = 0;
      let scraping = false;
      for (let k = 0; k < sub; k++) {
        f.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
        // thrust / drag
        P.vel.addScaledVector(f, thrust * h);
        if (input.brake) P.vel.multiplyScalar(Math.exp(-2.6 * h));
        P.vel.multiplyScalar(Math.exp(-(ACCEL / MAX_SPEED) * h));
        // lateral grip (airbrake loosens grip -> drift)
        const fwd = P.vel.dot(f);
        v.copy(P.vel).addScaledVector(f, -fwd);
        const grip = 4.8 - P.airbrake * 3.2;
        P.vel.addScaledVector(v, -(1 - Math.exp(-grip * h)));
        if (P.airbrake > 0.01) P.vel.multiplyScalar(Math.exp(-0.95 * P.airbrake * h));
        // yaw with angular inertia
        const speed = P.vel.length();
        const sf = THREE.MathUtils.clamp(speed / 22, 0.15, 1);
        const yawTarget = -(P.steer * 1.6 + P.air * 1.35) * sf;
        P.yawRate = damp(P.yawRate, yawTarget, 9, h);
        P.yaw += P.yawRate * h;
        // integrate
        P.pos.addScaledVector(P.vel, h);
        info = getTrackInfo(P.pos, P.idx);
        P.idx = info.index;
        const s = info.sample;
        // soft wall: repulsion zone, then hard clamp
        const limit = s.w - 2.3;
        const soft = limit - 1.2;
        const absLat = Math.abs(info.lateral);
        const sign = Math.sign(info.lateral);
        if (absLat > soft) {
          const pen = (absLat - soft) / (limit - soft);
          P.vel.addScaledVector(s.r, -sign * pen * 18 * h);
          if (absLat > limit - 0.3) scraping = true;
        }
        if (absLat > limit) {
          P.pos.addScaledVector(s.r, -(info.lateral - sign * limit));
          const vr = P.vel.dot(s.r);
          if (vr * sign > 0) {
            const impact = Math.abs(vr);
            P.vel.addScaledVector(s.r, -vr * 1.4);
            P.vel.multiplyScalar(impact > 8 ? 0.82 : 0.96);
            if (impact > 6) {
              hitWall = Math.max(hitWall, impact);
              const tYaw = Math.atan2(-s.t.x, -s.t.z);
              let d = tYaw - P.yaw;
              d = Math.atan2(Math.sin(d), Math.cos(d));
              P.yaw += d * 0.3;
              P.yawRate *= 0.3;
            }
          }
          info = getTrackInfo(P.pos, P.idx);
        }
      }
      if (hitWall > 0) {
        const speed = P.vel.length();
        game.energy = Math.max(0, game.energy - 2 - hitWall * 0.25);
        game.shake = Math.min(1, 0.3 + hitWall / 40 + speed / 300);
        audio.hit(hitWall / 30);
      } else if (scraping) {
        game.energy = Math.max(0, game.energy - 2 * dt);
        game.shake = Math.max(game.shake, 0.12);
        P.scrapeTimer -= dt;
        if (P.scrapeTimer <= 0) {
          P.scrapeTimer = 0.09;
          audio.scrape(Math.min(1, P.vel.length() / 80));
        }
      }
      const s = info.sample;
      const speed = P.vel.length();
      // pads
      P.padCooldown -= dt;
      if (P.padCooldown <= 0) {
        for (const pad of PADS) {
          const di = Math.abs(wrapIndex(info.index - pad.index + N / 2) - N / 2);
          if (di < 4 && Math.abs(info.lateral - pad.lateral) < 3.4) {
            P.padCooldown = 0.6;
            if (pad.type === "speed") {
              P.padKick = 34;
              game.nos = Math.min(100, game.nos + 8);
              game.flash("SPEED PAD");
              audio.speedPad();
            } else {
              game.energy = Math.min(100, game.energy + 25);
              game.nos = Math.min(100, game.nos + 35);
              game.flash("ENERGY +");
              audio.energyPad();
            }
            game.shake = Math.max(game.shake, 0.2);
            break;
          }
        }
      }
      // speed pad kick is applied over ~0.25s instead of instantly (smoother)
      if (P.padKick > 0) {
        const k = Math.min(P.padKick, 140 * dt);
        P.vel.addScaledVector(f, k);
        P.padKick -= k;
        if (P.vel.length() > 150) P.vel.setLength(150);
      }
      // reset
      if (input.reset) {
        P.pos.copy(s.p).addScaledVector(s.u, HOVER);
        P.lastBase = 0;
        P.hoverOff = P.hoverVel = 0;
        P.vel.set(0, 0, 0);
        P.yaw = Math.atan2(-s.t.x, -s.t.z);
        P.yawRate = 0;
      }
      // laps
      const prevLap = P.lap;
      P.lap = lapFromProgress(P.prevProgress, info.progress, P.lap);
      P.prevProgress = info.progress;
      if (P.lap > prevLap && P.lap >= 2 && P.lap <= TOTAL_LAPS) {
        game.flash(P.lap === TOTAL_LAPS ? "FINAL LAP" : `LAP ${P.lap}`);
        audio.lap();
      }
      if (P.lap > TOTAL_LAPS) {
        P.autopilot = true;
        P.autoProgress = info.progress;
        P.autoLane = info.lateral;
        game.finalTime = game.time;
        game.finalRank = game.rank;
        game.racers[0].finished = true;
        game.racers[0].finishTime = game.time;
        game.setPhase("finished");
        audio.finish();
      }
      game.lap = P.lap;
      // hollow-earth transition
      const caveNow = info.sample.cave;
      if (caveNow > 0.5 && !P.inCave) {
        P.inCave = true;
        game.flash("HOLLOW EARTH");
      } else if (caveNow < 0.5 && P.inCave) {
        P.inCave = false;
        game.flash("SURFACE");
      }
      game.speed = damp(game.speed, speed, 10, dt);
      game.speedKmh = Math.round(game.speed * 7.2);
      // hover height: base follows the surface EXACTLY (no lag -> never clips),
      // a small clamped spring offset only adds suspension feel
      // multi-point ground sensing: nose & tail probes keep the long prongs out of crests
      const NOSE = 4.4, TAIL = 2.4;
      const nx = P.pos.x + f.x * NOSE, nz = P.pos.z + f.z * NOSE;
      const tx = P.pos.x - f.x * TAIL, tz = P.pos.z - f.z * TAIL;
      tmp.probe.set(nx, 0, nz);
      const hN = getTrackInfo(tmp.probe, info.index).height + padHeightAt(nx, nz);
      tmp.probe.set(tx, 0, tz);
      const hT = getTrackInfo(tmp.probe, info.index).height + padHeightAt(tx, tz);
      const sC = info.sample;
      const resN = hN - planeHeight(sC, nx, nz);
      const resT = hT - planeHeight(sC, tx, tz);
      const padC = padHeightAt(P.pos.x, P.pos.z);
      // tilt with the terrain (nose up on climbs / crests)
      const tp = Math.atan2(resN - resT, NOSE + TAIL);
      P.terrainPitch = damp(P.terrainPitch, tp, 10, dt);
      const surface = info.height + padC + Math.max(0, resN, resT) * 0.6;
      const base = surface + HOVER;
      const vRoad = P.lastBase === 0 ? 0 : (base - P.lastBase) / dt;
      P.lastBase = base;
      const offTarget = THREE.MathUtils.clamp(-vRoad * 0.025, -0.3, 0.3);
      P.hoverVel += ((offTarget - P.hoverOff) * 70 - P.hoverVel * 13) * dt;
      P.hoverOff += P.hoverVel * dt;
      P.hoverOff = THREE.MathUtils.clamp(P.hoverOff, -Math.min(0.25, HOVER - MIN_CLEARANCE), 0.6);
      const bob = Math.sin(t * 5) * 0.04 + Math.sin(t * 3.1) * 0.025;
      P.pos.y = base + P.hoverOff + bob;
      // visual orientation with roll (steer/drift) and pitch (accel/brake)
      fp.copy(f).addScaledVector(s.u, -f.dot(s.u)).normalize();
      m.lookAt(ZERO, fp, s.u);
      q.setFromRotationMatrix(m);
      const slide = THREE.MathUtils.clamp(-P.vel.dot(s.r) / 40, -0.5, 0.5);
      const targetRoll = THREE.MathUtils.clamp(-P.steer * 0.32 - P.air * 0.38 + slide * 0.8 + P.yawRate * 0.2, -0.4, 0.4);
      P.roll = damp(P.roll, targetRoll, 7, dt);
      const accel = thrust - (ACCEL / MAX_SPEED) * speed;
      const targetPitch = THREE.MathUtils.clamp(accel * 0.002 - (input.brake ? 0.05 : 0) + P.boostAmt * 0.05, -0.08, 0.12);
      P.pitch = damp(P.pitch, targetPitch, 5, dt);
      tmp.q2.setFromAxisAngle(AX_Z, P.roll);
      q.multiply(tmp.q2);
      tmp.q2.setFromAxisAngle(AX_X, P.pitch + P.terrainPitch);
      q.multiply(tmp.q2);
      P.quat.slerp(q, Math.min(1, dt * 14));
    } else if (P.autopilot && moving) {
      // autopilot after finish
      P.autoProgress += (70 * dt) / SEG_LEN;
      if (P.autoProgress >= N) P.autoProgress -= N;
      P.autoLane += (0 - P.autoLane) * Math.min(1, dt);
      const fr = frameAt(P.autoProgress, P.autoFrame);
      P.pos.copy(fr.p).addScaledVector(fr.r, P.autoLane).addScaledVector(fr.u, HOVER + padHeightAt(fr.p.x, fr.p.z));
      P.yaw = Math.atan2(-fr.t.x, -fr.t.z);
      m.makeBasis(fr.r, fr.u, v.copy(fr.t).negate());
      q.setFromRotationMatrix(m);
      P.quat.slerp(q, Math.min(1, dt * 6));
      thrust = ACCEL;
      game.speed = 70;
      game.speedKmh = Math.round(70 * 7.2);
      info = getTrackInfo(P.pos, P.idx);
      P.idx = info.index;
    } else {
      // idle on grid: gentle hover
      const s = info.sample;
      P.pos.y = info.height + padHeightAt(P.pos.x, P.pos.z) + HOVER + Math.sin(t * 2) * 0.05;
      fp.copy(f).addScaledVector(s.u, -f.dot(s.u)).normalize();
      m.lookAt(ZERO, fp, s.u);
      P.quat.setFromRotationMatrix(m);
      game.speed = 0;
      game.speedKmh = 0;
      game.boosting = false;
    }

    if (ship) {
      ship.group.position.copy(P.pos);
      ship.group.quaternion.copy(P.quat);
      ship.setThrust(racing ? 0.25 + P.throttle * 0.75 : moving ? 0.6 : 0.2, boosting);
      ship.setAirbrake(input.airLeft && racing ? 1 : 0, input.airRight && racing ? 1 : 0);
    }
    game.playerPos.copy(P.pos);
    game.playerForward.copy(f);
    game.cave = damp(game.cave, info.sample.cave, 2.5, dt);
    audio.update(dt, game.speed, racing ? P.throttle : moving ? 0.6 : 0, boosting, moving, P.airbrake);
    if (engineLight.current) {
      engineLight.current.position.copy(P.pos).addScaledVector(f, 3).addScaledVector(Y, -0.3);
      engineLight.current.intensity = damp(engineLight.current.intensity, 18 + P.boostAmt * 50, 8, dt);
    }
    // blob shadow for player
    const blob0 = blobs.current[0];
    if (blob0) {
      const s = info.sample;
      blob0.position.copy(s.p).addScaledVector(s.r, info.lateral).addScaledVector(s.t, info.along).addScaledVector(s.u, 0.08);
      m.makeBasis(s.r, s.u, v.copy(s.t).negate());
      blob0.quaternion.setFromRotationMatrix(m);
      blob0.rotateX(-Math.PI / 2);
      blob0.rotateZ(-(P.yaw - Math.atan2(-s.t.x, -s.t.z)));
    }

    // ---------- AI ----------
    const playerTotal = P.lap * N + (P.autopilot ? P.autoProgress : info.progress);
    game.racers[0].progress = info.progress;
    game.racers[0].totalProgress = playerTotal;
    game.racers[0].lap = P.lap;

    for (let i = 0; i < ais.length; i++) {
      const a = ais[i];
      const r = game.racers[i + 1];
      if (moving) {
        const total = a.lap * N + a.progress;
        const gap = total - playerTotal; // + = ahead
        let target = a.baseSpeed + Math.sin(t * 0.7 + i) * 3;
        if (gap < -250) target += 10;
        else if (gap > 350) target -= 9;
        if (game.phase === "finished") target = 70;
        a.speed += (target - a.speed) * Math.min(1, dt * (a.speed < 20 ? 0.8 : 1.5));
        const prev = a.progress;
        a.progress += (a.speed * dt) / SEG_LEN;
        if (a.progress >= N) {
          a.progress -= N;
          a.lap++;
          if (a.lap > TOTAL_LAPS && !r.finished) {
            r.finished = true;
            r.finishTime = game.time;
          }
        }
        void prev;
        a.laneTimer -= dt;
        if (a.laneTimer <= 0) {
          a.laneTimer = 2 + Math.random() * 4;
          a.laneTarget = (Math.random() * 2 - 1) * (samples[wrapIndex(a.progress)].w - 5);
        }
        // avoid player if close
        const dl = a.laneTarget - a.lane;
        const laneVel = THREE.MathUtils.clamp(dl * 1.2, -4, 4);
        a.lane += laneVel * dt;
        a.roll = THREE.MathUtils.damp(a.roll, -laneVel * 0.08, 4, dt);
      }
      const fr = frameAt(a.progress, a.frame);
      const wl = fr.w - 4;
      if (a.lane > wl) a.lane = wl;
      if (a.lane < -wl) a.lane = -wl;
      a.pos.copy(fr.p).addScaledVector(fr.r, a.lane);
      a.pos.addScaledVector(fr.u, HOVER + padHeightAt(a.pos.x, a.pos.z) + Math.sin(t * 4 + i) * 0.05);
      const sh = ships.current[i + 1];
      if (sh) {
        sh.group.position.copy(a.pos);
        m.makeBasis(fr.r, fr.u, v.copy(fr.t).negate());
        q.setFromRotationMatrix(m);
        tmp.q2.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a.roll);
        q.multiply(tmp.q2);
        sh.group.quaternion.slerp(q, Math.min(1, dt * 8));
        sh.setThrust(moving ? 1 : 0.2, false);
      }
      const b = blobs.current[i + 1];
      if (b) {
        b.position.copy(fr.p).addScaledVector(fr.r, a.lane).addScaledVector(fr.u, 0.08);
        b.quaternion.copy(q);
        b.rotateX(-Math.PI / 2);
      }
      // collision with player
      if (racing && !P.autopilot) {
        v2.subVectors(P.pos, a.pos);
        const d = v2.length();
        if (d < 4.6 && d > 0.01) {
          v2.normalize();
          P.pos.addScaledVector(v2, (4.6 - d) * 0.5);
          P.vel.addScaledVector(v2, 6);
          P.vel.multiplyScalar(0.97);
          a.lane -= v2.dot(fr.r) * 0.6;
          game.shake = Math.max(game.shake, 0.3);
          game.energy = Math.max(0, game.energy - 0.5);
        }
      }
      r.lap = a.lap;
      r.progress = a.progress;
      r.totalProgress = a.lap * N + a.progress;
    }

    // ranking
    const sorted = [...game.racers].sort((x, y) => {
      if (x.finished && y.finished) return x.finishTime - y.finishTime;
      if (x.finished) return -1;
      if (y.finished) return 1;
      return y.totalProgress - x.totalProgress;
    });
    sorted.forEach((r, i) => (r.rank = i + 1));
    game.rank = game.racers[0].rank;

    // ---------- CAMERA ----------
    const pc = camera as THREE.PerspectiveCamera;
    if (game.phase === "menu") {
      const a = 0.75 + Math.sin(t * 0.13) * 0.55;
      const target = new THREE.Vector3(0, 1.5, 66);
      cam.pos.set(target.x + Math.cos(a) * 26, 7.5 + Math.sin(t * 0.3) * 1.5, target.z + Math.sin(a) * 30);
      camera.position.lerp(cam.pos, Math.min(1, dt * 2));
      camera.up.lerp(Y, 0.1).normalize();
      camera.lookAt(target);
      cam.fov = 55;
    } else {
      const s = info.sample;
      const su = s.u;
      // camera follows a smoothed heading (not the raw yaw) to avoid jitter
      cam.headYaw = cam.headYaw ?? P.yaw;
      let dYaw = P.yaw - cam.headYaw;
      dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
      cam.headYaw += dYaw * Math.min(1, dt * 6);
      v2.set(-Math.sin(cam.headYaw), 0, -Math.cos(cam.headYaw));
      fp.copy(v2).addScaledVector(su, -v2.dot(su)).normalize();
      const sp = game.speed;
      const right = tmp.v2b.crossVectors(fp, su).normalize();
      // lateral swing proportional to yaw rate (feel of weight)
      const swing = THREE.MathUtils.clamp(-P.yawRate * 1.6, -2.2, 2.2);
      if (game.cameraMode === 0) {
        v.copy(P.pos)
          .addScaledVector(fp, -(9.6 + sp * 0.022 + P.boostAmt * 1.2))
          .addScaledVector(su, 3.3 + sp * 0.005)
          .addScaledVector(right, swing);
        tmp.look.copy(P.pos).addScaledVector(fp, 10 + sp * 0.04).addScaledVector(su, 1.3).addScaledVector(right, swing * 0.5);
      } else {
        v.copy(P.pos).addScaledVector(fp, 1.2).addScaledVector(su, 1.7);
        tmp.look.copy(P.pos).addScaledVector(fp, 40).addScaledVector(su, 1.2);
      }
      // damp the OFFSET relative to the ship (not the world position) -> zero lag at
      // constant speed, still smooth on turns/accel
      const lam = game.cameraMode === 0 ? 9 : 26;
      v.sub(P.pos);
      tmp.look.sub(P.pos);
      cam.off.x = damp(cam.off.x, v.x, lam, dt);
      cam.off.y = damp(cam.off.y, v.y, lam * 1.3, dt);
      cam.off.z = damp(cam.off.z, v.z, lam, dt);
      cam.lookOff.x = damp(cam.lookOff.x, tmp.look.x, 14, dt);
      cam.lookOff.y = damp(cam.lookOff.y, tmp.look.y, 14, dt);
      cam.lookOff.z = damp(cam.lookOff.z, tmp.look.z, 14, dt);
      cam.pos.copy(P.pos).add(cam.off);
      cam.look.copy(P.pos).add(cam.lookOff);
      cam.up.lerp(su, Math.min(1, dt * 4)).normalize();
      camera.position.copy(cam.pos);
      if (game.shake > 0) {
        const sh = game.shake * 0.3;
        const tt = t * 37;
        camera.position.x += Math.sin(tt) * sh * (0.6 + 0.4 * Math.random());
        camera.position.y += Math.cos(tt * 1.3) * sh * (0.6 + 0.4 * Math.random());
      }
      // boost rumble
      if (P.boostAmt > 0.05) {
        camera.position.x += (Math.random() - 0.5) * 0.05 * P.boostAmt;
        camera.position.y += (Math.random() - 0.5) * 0.05 * P.boostAmt;
      }
      // never let the chase camera sink below the road on climbs / banked turns
      const ci = getTrackInfo(camera.position, P.idx);
      const camMin = ci.height + padHeightAt(camera.position.x, camera.position.z) + 1.6;
      if (camera.position.y < camMin) camera.position.y = camMin;
      camera.up.copy(cam.up);
      camera.lookAt(cam.look);
      const targetFov = 64 + (sp / 150) * 14 + P.boostAmt * 9;
      cam.fov = damp(cam.fov, targetFov, 5, dt);
    }
    if (Math.abs(pc.fov - cam.fov) > 0.01) {
      pc.fov = cam.fov;
      pc.updateProjectionMatrix();
    }
  });

  const blobMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.85 }),
    []
  );

  return (
    <group>
      {TEAMS.map((team, i) => (
        <Ship
          key={team.name}
          team={team}
          ref={(h) => {
            ships.current[i] = h;
          }}
        />
      ))}
      {TEAMS.map((team, i) => (
        <mesh
          key={"b" + team.name}
          ref={(mref) => {
            blobs.current[i] = mref;
          }}
          material={blobMat}
        >
          <planeGeometry args={[6.5, 8.5]} />
        </mesh>
      ))}
      <pointLight ref={engineLight} color="#52b8ff" intensity={18} distance={14} decay={2} />
    </group>
  );
}
