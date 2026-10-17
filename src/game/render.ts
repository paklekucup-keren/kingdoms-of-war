import type { BType, PlacedB, TType } from './types';
import { BUILDINGS } from './content';
import { clamp } from './types';

// ---------- palette ----------
export const PAL = {
  stone: '#8d8578', stoneD: '#6b655b', wood: '#7a5a34', woodD: '#5b4225',
  gold: '#e3b23c', crim: '#b3382e', azure: '#2e63b3', ally: '#1f9d8f',
  roofA: '#3f74c9', roofE: '#c74a3c', parchment: '#efe0bd',
};
export const sideColor = (side: number, owner?: number) =>
  side === 1 ? PAL.crim : owner === 1 ? PAL.ally : PAL.azure;
export const sideRoof = (side: number, owner?: number) =>
  side === 1 ? PAL.roofE : owner === 1 ? '#2fbfae' : PAL.roofA;

// ---------- particle FX (pooled, tile-space) ----------
interface P { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; grav: number; ring?: boolean }
interface F { x: number; y: number; txt: string; color: string; life: number }
export class FX {
  parts: P[] = []; floats: F[] = []; shake = 0; quality = 1;
  private cap() { return this.quality < 1 ? 110 : 240; }
  burst(x: number, y: number, color: string, n: number, spd = 3, grav = 4, size = 0.09) {
    n = Math.round(n * this.quality);
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= this.cap()) return;
      const a = Math.random() * Math.PI * 2, v = (0.3 + Math.random() * 0.7) * spd;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spd * 0.35, life: 0, max: 0.4 + Math.random() * 0.45, size: size * (0.6 + Math.random()), color, grav });
    }
  }
  ring(x: number, y: number, color: string) {
    if (this.parts.length < this.cap()) this.parts.push({ x, y, vx: 0, vy: 0, life: 0, max: 0.35, size: 0.1, color, grav: 0, ring: true });
  }
  float(x: number, y: number, txt: string, color: string) {
    if (this.floats.length > 12) this.floats.shift();
    this.floats.push({ x, y, txt, color, life: 0 });
  }
  addShake(m: number) { this.shake = Math.min(0.6, this.shake + m * this.quality); }
  update(dt: number) {
    this.shake = Math.max(0, this.shake - dt * 1.8);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.life += dt;
      if (p.life >= p.max) { this.parts[i] = this.parts[this.parts.length - 1]; this.parts.pop(); continue; }
      if (!p.ring) { p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]; f.life += dt; f.y -= dt * 0.9;
      if (f.life > 1.1) this.floats.splice(i, 1);
    }
  }
  draw(ctx: CanvasRenderingContext2D, ts: number) {
    for (const p of this.parts) {
      const k = 1 - p.life / p.max;
      ctx.globalAlpha = k;
      if (p.ring) {
        ctx.strokeStyle = p.color; ctx.lineWidth = 0.08 * ts * k;
        ctx.beginPath(); ctx.arc(p.x * ts, p.y * ts, (0.3 + (p.life / p.max) * 1.4) * ts, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        const s = p.size * ts * (0.5 + k * 0.5);
        ctx.fillRect(p.x * ts - s / 2, p.y * ts - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (const f of this.floats) {
      ctx.globalAlpha = clamp(1 - (f.life - 0.5) * 2, 0, 1);
      ctx.font = `800 ${0.55 * ts}px "Alegreya Sans", sans-serif`;
      ctx.lineWidth = 0.08 * ts; ctx.strokeStyle = 'rgba(20,12,4,0.85)';
      ctx.strokeText(f.txt, f.x * ts, f.y * ts);
      ctx.fillStyle = f.color; ctx.fillText(f.txt, f.x * ts, f.y * ts);
    }
    ctx.globalAlpha = 1;
  }
}

// ---------- ground ----------
export function makeGround(ts: number, seed: number, decorated: boolean) {
  const c = document.createElement('canvas');
  c.width = c.height = ts * 16;
  const g = c.getContext('2d')!;
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const alt = (x + y) % 2 === 0;
    const base = alt ? 86 : 78;
    g.fillStyle = `rgb(${base + 14 + rnd() * 8},${base + 52 + rnd() * 10},${40 + rnd() * 10})`;
    g.fillRect(x * ts, y * ts, ts + 1, ts + 1);
  }
  if (decorated) {
    for (let i = 0; i < 46; i++) {
      const x = rnd() * 16 * ts, y = rnd() * 16 * ts, r = rnd();
      g.fillStyle = r < 0.4 ? 'rgba(46,84,36,.5)' : 'rgba(120,110,70,.35)';
      g.beginPath(); g.arc(x, y, ts * (0.05 + rnd() * 0.09), 0, Math.PI * 2); g.fill();
    }
    // trees & rocks around the outer border
    for (let i = 0; i < 14; i++) {
      const edge = Math.floor(rnd() * 4), o = rnd() * 14 + 1;
      const x = (edge === 0 ? o : edge === 1 ? 15.4 : edge === 2 ? o : 0.6) * ts;
      const y = (edge === 0 ? 0.6 : edge === 1 ? o : edge === 2 ? 15.4 : o) * ts;
      if (rnd() < 0.6) { // pine
        g.fillStyle = '#4a3823'; g.fillRect(x - ts * 0.06, y, ts * 0.12, ts * 0.28);
        g.fillStyle = '#2c5a30';
        g.beginPath(); g.moveTo(x, y - ts * 0.62); g.lineTo(x - ts * 0.36, y + ts * 0.05); g.lineTo(x + ts * 0.36, y + ts * 0.05); g.closePath(); g.fill();
        g.fillStyle = '#3a723f';
        g.beginPath(); g.moveTo(x, y - ts * 0.5); g.lineTo(x - ts * 0.25, y); g.lineTo(x + ts * 0.25, y); g.closePath(); g.fill();
      } else { // rock
        g.fillStyle = '#7c7668';
        g.beginPath(); g.moveTo(x - ts * 0.22, y + ts * 0.1); g.lineTo(x - ts * 0.05, y - ts * 0.18); g.lineTo(x + ts * 0.2, y - ts * 0.1); g.lineTo(x + ts * 0.24, y + ts * 0.12); g.closePath(); g.fill();
        g.fillStyle = '#98917f'; g.fillRect(x - ts * 0.08, y - ts * 0.12, ts * 0.12, ts * 0.1);
      }
    }
  }
  return c;
}

// ---------- buildings ----------
export interface BDrawOpts { hpFrac?: number; ghost?: boolean; bad?: boolean; time?: number; scaffold?: boolean; stored01?: number }
export function drawBuilding(ctx: CanvasRenderingContext2D, b: Pick<PlacedB, 't' | 'lvl' | 'gx' | 'gy'>, ts: number, o: BDrawOpts = {}) {
  const d = BUILDINGS[b.t];
  const x = b.gx * ts, y = b.gy * ts, w = d.w * ts, h = d.h * ts;
  const t = o.time ?? 0;
  ctx.save();
  if (o.ghost) ctx.globalAlpha = 0.72;
  // base pad + soft shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  roundRect(ctx, x + w * 0.04, y + h * 0.78, w * 0.96, h * 0.24, w * 0.1); ctx.fill();
  stonePad(ctx, x, y, w, h);

  switch (b.t) {
    case 'townhall': {
      keep(ctx, x + w * 0.18, y + h * 0.34, w * 0.64, h * 0.56, PAL.stone, '#b9b2a3');
      keep(ctx, x + w * 0.04, y + h * 0.42, w * 0.24, h * 0.48, PAL.stone, '#b9b2a3');
      keep(ctx, x + w * 0.72, y + h * 0.42, w * 0.24, h * 0.48, PAL.stone, '#b9b2a3');
      roof(ctx, x + w * 0.15, y + h * 0.34, w * 0.7, h * 0.2, '#7d2a1e');
      roof(ctx, x + w * 0.03, y + h * 0.42, w * 0.26, h * 0.16, '#7d2a1e');
      roof(ctx, x + w * 0.71, y + h * 0.42, w * 0.26, h * 0.16, '#7d2a1e');
      ctx.fillStyle = '#3a2c1a';
      roundRect(ctx, x + w * 0.42, y + h * 0.62, w * 0.16, h * 0.28, w * 0.03); ctx.fill();
      // banner
      const sway = Math.sin(t * 1.6) * w * 0.015;
      ctx.strokeStyle = '#2c2116'; ctx.lineWidth = Math.max(1, ts * 0.045);
      ctx.beginPath(); ctx.moveTo(x + w * 0.5, y + h * 0.33); ctx.lineTo(x + w * 0.5, y + h * 0.1); ctx.stroke();
      ctx.fillStyle = PAL.crim;
      ctx.beginPath(); ctx.moveTo(x + w * 0.5, y + h * 0.1);
      ctx.lineTo(x + w * 0.66 + sway, y + h * 0.13); ctx.lineTo(x + w * 0.5, y + h * 0.2); ctx.closePath(); ctx.fill();
      break;
    }
    case 'goldmine': {
      ctx.fillStyle = '#8a8378';
      ctx.beginPath(); ctx.moveTo(x + w * 0.1, y + h * 0.85); ctx.lineTo(x + w * 0.3, y + h * 0.3);
      ctx.lineTo(x + w * 0.62, y + h * 0.18); ctx.lineTo(x + w * 0.9, y + h * 0.5); ctx.lineTo(x + w * 0.9, y + h * 0.85); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#241d16';
      ctx.beginPath(); ctx.arc(x + w * 0.55, y + h * 0.78, w * 0.17, Math.PI, 0); ctx.lineTo(x + w * 0.72, y + h * 0.85); ctx.lineTo(x + w * 0.38, y + h * 0.85); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = PAL.wood; ctx.lineWidth = ts * 0.07;
      ctx.beginPath(); ctx.moveTo(x + w * 0.36, y + h * 0.85); ctx.lineTo(x + w * 0.44, y + h * 0.55); ctx.lineTo(x + w * 0.66, y + h * 0.55); ctx.lineTo(x + w * 0.74, y + h * 0.85); ctx.stroke();
      ctx.fillStyle = PAL.gold;
      for (let i = 0; i < 3 + (o.stored01 ?? 0.4) * 3; i++)
        { ctx.beginPath(); ctx.arc(x + w * (0.12 + (i * 37 % 22) / 100), y + h * (0.8 - (i % 2) * 0.08), ts * 0.09, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'farm': {
      ctx.fillStyle = '#7c5a2e'; ctx.fillRect(x + w * 0.06, y + h * 0.4, w * 0.5, h * 0.5);
      ctx.strokeStyle = '#5a4423'; ctx.lineWidth = ts * 0.04;
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + w * 0.08, y + h * (0.4 + i * 0.12)); ctx.lineTo(x + w * 0.54, y + h * (0.4 + i * 0.12)); ctx.stroke(); }
      ctx.fillStyle = '#c9a23c';
      for (let i = 0; i < 8; i++) { const px = x + w * (0.12 + (i % 4) * 0.11), py = y + h * (0.48 + Math.floor(i / 4) * 0.24); ctx.fillRect(px, py, ts * 0.06, ts * 0.14); }
      // windmill
      ctx.fillStyle = '#e7dcc2'; roundRect(ctx, x + w * 0.6, y + h * 0.42, w * 0.3, h * 0.48, w * 0.03); ctx.fill();
      roof(ctx, x + w * 0.58, y + h * 0.42, w * 0.34, h * 0.16, '#7d2a1e');
      const ang = t * 1.2;
      ctx.save(); ctx.translate(x + w * 0.75, y + h * 0.46); ctx.rotate(ang);
      ctx.fillStyle = '#d9cfae';
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.fillRect(-ts * 0.03, -h * 0.34, ts * 0.07, h * 0.28); }
      ctx.restore();
      break;
    }
    case 'storage': {
      barrel(ctx, x + w * 0.16, y + h * 0.42, w * 0.3, h * 0.48);
      barrel(ctx, x + w * 0.54, y + h * 0.34, w * 0.34, h * 0.56);
      ctx.fillStyle = PAL.gold; ctx.beginPath(); ctx.arc(x + w * 0.71, y + h * 0.32, ts * 0.08, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'barracks': {
      ctx.fillStyle = '#a3502f'; roundRect(ctx, x + w * 0.08, y + h * 0.4, w * 0.84, h * 0.5, w * 0.05); ctx.fill();
      roof(ctx, x + w * 0.04, y + h * 0.4, w * 0.92, h * 0.22, '#6b3220');
      ctx.fillStyle = '#2c2116'; ctx.fillRect(x + w * 0.44, y + h * 0.62, w * 0.12, h * 0.28);
      ctx.strokeStyle = '#cfd6de'; ctx.lineWidth = ts * 0.06;
      ctx.beginPath(); ctx.moveTo(x + w * 0.72, y + h * 0.12); ctx.lineTo(x + w * 0.86, y + h * 0.34); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w * 0.86, y + h * 0.12); ctx.lineTo(x + w * 0.72, y + h * 0.34); ctx.stroke();
      break;
    }
    case 'camp': {
      tent(ctx, x + w * 0.08, y + h * 0.45, w * 0.4, h * 0.42, '#b97f4a');
      tent(ctx, x + w * 0.52, y + h * 0.52, w * 0.34, h * 0.34, '#96613a');
      const fl = 0.85 + Math.sin(t * 9) * 0.15;
      ctx.fillStyle = '#5b4225'; ctx.fillRect(x + w * 0.42, y + h * 0.86, w * 0.18, ts * 0.06);
      ctx.fillStyle = `rgba(255,${140 + Math.sin(t * 9) * 40 | 0},40,${0.8 * fl})`;
      ctx.beginPath(); ctx.arc(x + w * 0.5, y + h * 0.82, ts * 0.1 * fl, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'tower': {
      keep(ctx, x + w * 0.16, y + h * 0.28, w * 0.68, h * 0.62, PAL.stone, '#b9b2a3');
      ctx.fillStyle = PAL.stoneD; ctx.fillRect(x + w * 0.1, y + h * 0.24, w * 0.8, h * 0.12);
      for (let i = 0; i < 3; i++) ctx.clearRect(0, 0, 0, 0);
      ctx.fillStyle = '#241d16'; ctx.fillRect(x + w * 0.42, y + h * 0.42, w * 0.16, h * 0.2);
      roof(ctx, x + w * 0.12, y + h * 0.24, w * 0.76, h * 0.18, '#7d2a1e');
      const sway = Math.sin(t * 1.8 + b.gx) * ts * 0.08;
      ctx.fillStyle = PAL.azure;
      ctx.beginPath(); ctx.moveTo(x + w * 0.5, y + h * 0.06); ctx.lineTo(x + w * 0.78 + sway, y + h * 0.1); ctx.lineTo(x + w * 0.5, y + h * 0.16); ctx.closePath(); ctx.fill();
      break;
    }
    case 'cannon': {
      stonePad(ctx, x + w * 0.08, y + h * 0.3, w * 0.84, h * 0.6);
      ctx.fillStyle = '#3d4149'; roundRect(ctx, x + w * 0.3, y + h * 0.22, w * 0.4, h * 0.42, ts * 0.08); ctx.fill();
      ctx.fillStyle = '#23262c'; roundRect(ctx, x + w * 0.36, y + h * 0.05, w * 0.28, h * 0.3, ts * 0.06); ctx.fill();
      ctx.fillStyle = '#5b4225'; ctx.beginPath(); ctx.arc(x + w * 0.3, y + h * 0.82, ts * 0.14, 0, Math.PI * 2); ctx.arc(x + w * 0.7, y + h * 0.82, ts * 0.14, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'wall': {
      ctx.fillStyle = PAL.stone;
      roundRect(ctx, x + ts * 0.06, y + ts * 0.1, ts * 0.88, ts * 0.84, ts * 0.08); ctx.fill();
      ctx.fillStyle = PAL.stoneD;
      ctx.fillRect(x + ts * 0.06, y + ts * 0.5, ts * 0.88, ts * 0.05);
      ctx.fillRect(x + ts * 0.3, y + ts * 0.55, ts * 0.05, ts * 0.39);
      ctx.fillRect(x + ts * 0.62, y + ts * 0.1, ts * 0.05, ts * 0.4);
      ctx.fillStyle = '#a8a091';
      ctx.fillRect(x + ts * 0.06, y + ts * 0.08, ts * 0.88, ts * 0.07);
      break;
    }
  }

  if (o.scaffold) {
    ctx.fillStyle = 'rgba(40,30,16,0.55)';
    roundRect(ctx, x, y, w, h, ts * 0.12); ctx.fill();
    ctx.strokeStyle = '#c9a23c'; ctx.lineWidth = ts * 0.05;
    for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x + (w / 3) * i, y + h * 0.1); ctx.lineTo(x + (w / 3) * i, y + h * 0.9); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(x + w * 0.08, y + h * 0.33); ctx.lineTo(x + w * 0.92, y + h * 0.33);
    ctx.moveTo(x + w * 0.08, y + h * 0.66); ctx.lineTo(x + w * 0.92, y + h * 0.66); ctx.stroke();
  }
  if (o.hpFrac !== undefined && o.hpFrac < 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x + w * 0.1, y - ts * 0.16, w * 0.8, ts * 0.11);
    ctx.fillStyle = o.hpFrac > 0.5 ? '#6abe5c' : o.hpFrac > 0.25 ? '#e0b23c' : '#d84f3a';
    ctx.fillRect(x + w * 0.1, y - ts * 0.16, w * 0.8 * clamp(o.hpFrac, 0, 1), ts * 0.11);
  }
  if (o.bad) { ctx.fillStyle = 'rgba(200,50,40,0.35)'; ctx.fillRect(x, y, w, h); }
  if (o.ghost) { ctx.strokeStyle = o.bad ? '#d84f3a' : '#7be07a'; ctx.lineWidth = ts * 0.07; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2); }
  ctx.restore();
}
export function drawRubble(ctx: CanvasRenderingContext2D, b: { gx: number; gy: number; t: BType }, ts: number) {
  const d = BUILDINGS[b.t]; const x = b.gx * ts, y = b.gy * ts, w = d.w * ts, h = d.h * ts;
  ctx.fillStyle = 'rgba(30,22,14,0.5)'; roundRect(ctx, x + w * 0.06, y + h * 0.55, w * 0.88, h * 0.4, ts * 0.08); ctx.fill();
  ctx.fillStyle = '#5e5748';
  for (let i = 0; i < 5; i++) ctx.fillRect(x + w * (0.15 + (i * 47 % 60) / 100), y + h * (0.6 + (i * 29 % 25) / 100), ts * 0.22, ts * 0.14);
  ctx.fillStyle = '#41392c';
  for (let i = 0; i < 4; i++) ctx.fillRect(x + w * (0.2 + (i * 31 % 55) / 100), y + h * (0.68 + (i * 17 % 20) / 100), ts * 0.3, ts * 0.08);
}

// ---------- units ----------
export function drawUnit(ctx: CanvasRenderingContext2D, tp: TType, side: number, owner: number | undefined, x: number, y: number, ts: number, anim: { walk: number; swing: number }, uhpF = 1) {
  const col = sideColor(side, owner);
  const r = ts * 0.3;
  const bob = Math.sin(anim.walk * 9) * ts * 0.04;
  ctx.save(); ctx.translate(x, y + bob);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(0, ts * 0.3 - bob, r * 0.9, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();

  if (tp === 'ram') {
    ctx.fillStyle = '#6d4c2a'; roundRect(ctx, -ts * 0.42, -ts * 0.22, ts * 0.84, ts * 0.4, ts * 0.12); ctx.fill();
    ctx.fillStyle = '#4e3517'; roundRect(ctx, -ts * 0.46, -ts * 0.28, ts * 0.92, ts * 0.14, ts * 0.07); ctx.fill();
    ctx.fillStyle = '#2e2214';
    const spin = anim.walk * 4;
    for (const wx of [-0.3, 0.3]) {
      ctx.beginPath(); ctx.arc(ts * wx, ts * 0.18, ts * 0.15, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8a734f'; ctx.lineWidth = ts * 0.03;
      ctx.beginPath(); ctx.moveTo(ts * wx - Math.cos(spin) * ts * 0.12, ts * 0.18 - Math.sin(spin) * ts * 0.12);
      ctx.lineTo(ts * wx + Math.cos(spin) * ts * 0.12, ts * 0.18 + Math.sin(spin) * ts * 0.12); ctx.stroke();
    }
    ctx.fillStyle = col; ctx.fillRect(-ts * 0.42, -ts * 0.3, ts * 0.12, ts * 0.14);
  } else {
    const bodyR = tp === 'knight' ? r * 1.15 : r;
    // body
    ctx.fillStyle = tp === 'knight' ? '#b9c2cc' : col;
    ctx.beginPath(); ctx.arc(0, 0, bodyR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = tp === 'knight' ? '#8d97a3' : shade(col, -24);
    ctx.beginPath(); ctx.arc(0, bodyR * 0.35, bodyR * 0.75, 0, Math.PI); ctx.fill();
    // head
    ctx.fillStyle = '#e8c89a';
    ctx.beginPath(); ctx.arc(0, -bodyR * 0.85, bodyR * 0.45, 0, Math.PI * 2); ctx.fill();
    if (tp === 'sword') {
      ctx.fillStyle = '#7d2a1e'; ctx.fillRect(-bodyR * 0.4, -bodyR * 1.35, bodyR * 0.8, bodyR * 0.22);
      const a = anim.swing > 0 ? -1.9 + (1 - anim.swing) * 1.4 : -0.5;
      ctx.save(); ctx.rotate(a);
      ctx.strokeStyle = '#dfe5ec'; ctx.lineWidth = ts * 0.07;
      ctx.beginPath(); ctx.moveTo(bodyR * 0.6, 0); ctx.lineTo(bodyR * 0.6, -ts * 0.5); ctx.stroke();
      ctx.fillStyle = '#8a6a2f'; ctx.fillRect(bodyR * 0.45, -ts * 0.02, ts * 0.3, ts * 0.07); ctx.restore();
    } else if (tp === 'archer') {
      ctx.fillStyle = '#3c5a34';
      ctx.beginPath(); ctx.moveTo(0, -bodyR * 1.4); ctx.lineTo(-bodyR * 0.5, -bodyR * 0.8); ctx.lineTo(bodyR * 0.5, -bodyR * 0.8); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#6d4c2a'; ctx.lineWidth = ts * 0.05;
      const pull = anim.swing > 0 ? -ts * 0.08 : 0;
      ctx.beginPath(); ctx.arc(bodyR * 0.7, -ts * 0.05, ts * 0.28, -1.2, 1.2); ctx.stroke();
      ctx.strokeStyle = '#d9cfae'; ctx.lineWidth = ts * 0.02;
      ctx.beginPath(); ctx.moveTo(bodyR * 0.7 + Math.cos(-1.2) * ts * 0.28, -ts * 0.05 + Math.sin(-1.2) * ts * 0.28);
      ctx.lineTo(bodyR * 0.7 + pull, -ts * 0.05);
      ctx.lineTo(bodyR * 0.7 + Math.cos(1.2) * ts * 0.28, -ts * 0.05 + Math.sin(1.2) * ts * 0.28); ctx.stroke();
    } else if (tp === 'knight') {
      ctx.fillStyle = col; ctx.fillRect(-bodyR * 0.12, -bodyR * 1.6, bodyR * 0.24, bodyR * 0.5);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(-bodyR * 1.45, -bodyR * 0.1); ctx.arc(0, -bodyR * 0.1, bodyR * 1.45, Math.PI, Math.PI * 1.5); ctx.lineTo(0, -bodyR * 0.1); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#f0d98a'; ctx.lineWidth = ts * 0.045;
      ctx.beginPath(); ctx.arc(0, -bodyR * 0.1, bodyR * 1.1, Math.PI * 1.05, Math.PI * 1.45); ctx.stroke();
    }
  }
  // hp bar
  if (uhpF < 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(-r, -ts * 0.62, r * 2, ts * 0.09);
    ctx.fillStyle = uhpF > 0.4 ? '#6abe5c' : '#d84f3a';
    ctx.fillRect(-r, -ts * 0.62, r * 2 * clamp(uhpF, 0, 1), ts * 0.09);
  }
  ctx.restore();
}

// ---------- projectile ----------
export function drawProj(ctx: CanvasRenderingContext2D, kind: 'arrow' | 'ball', x: number, y: number, ang: number, ts: number) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  if (kind === 'arrow') {
    ctx.strokeStyle = '#e8dcc2'; ctx.lineWidth = ts * 0.05;
    ctx.beginPath(); ctx.moveTo(-ts * 0.3, 0); ctx.lineTo(ts * 0.3, 0); ctx.stroke();
    ctx.fillStyle = '#8d97a3';
    ctx.beginPath(); ctx.moveTo(ts * 0.36, 0); ctx.lineTo(ts * 0.2, -ts * 0.07); ctx.lineTo(ts * 0.2, ts * 0.07); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillStyle = '#262a30'; ctx.beginPath(); ctx.arc(0, 0, ts * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,160,60,0.9)'; ctx.beginPath(); ctx.arc(-ts * 0.14, -ts * 0.1, ts * 0.05, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---------- shape helpers ----------
export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function stonePad(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#8d8578'; roundRect(ctx, x + w * 0.05, y + h * 0.28, w * 0.9, h * 0.66, w * 0.08); ctx.fill();
  ctx.fillStyle = '#a39b8c'; roundRect(ctx, x + w * 0.05, y + h * 0.28, w * 0.9, h * 0.12, w * 0.08); ctx.fill();
}
function keep(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string, top: string) {
  ctx.fillStyle = c; roundRect(ctx, x, y, w, h, w * 0.06); ctx.fill();
  ctx.fillStyle = top; ctx.fillRect(x, y, w, h * 0.12);
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.fillRect(x, y + h * 0.42, w, h * 0.05);
}
function roof(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.moveTo(x - w * 0.04, y + h * 0.28); ctx.lineTo(x + w / 2, y - h * 0.72); ctx.lineTo(x + w * 1.04, y + h * 0.28); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath(); ctx.moveTo(x + w * 0.5, y - h * 0.72); ctx.lineTo(x + w * 0.72, y + h * 0.28); ctx.lineTo(x + w * 1.04, y + h * 0.28); ctx.closePath(); ctx.fill();
}
function barrel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = PAL.wood; roundRect(ctx, x, y, w, h, w * 0.35); ctx.fill();
  ctx.strokeStyle = PAL.woodD; ctx.lineWidth = Math.max(1, w * 0.08);
  ctx.beginPath(); ctx.moveTo(x, y + h * 0.3); ctx.lineTo(x + w, y + h * 0.3);
  ctx.moveTo(x, y + h * 0.7); ctx.lineTo(x + w, y + h * 0.7); ctx.stroke();
}
function tent(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.moveTo(x + w * 0.38, y + h); ctx.lineTo(x + w / 2, y + h * 0.4); ctx.lineTo(x + w * 0.62, y + h); ctx.closePath(); ctx.fill();
}
function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp((n >> 16) + amt, 0, 255), g = clamp(((n >> 8) & 255) + amt, 0, 255), b = clamp((n & 255) + amt, 0, 255);
  return `rgb(${r},${g},${b})`;
}
