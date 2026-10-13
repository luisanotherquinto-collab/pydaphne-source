/* ==========================================================================
 *  Firefox (Atari 1984) — portado del driver MAME atari/firefox.cpp
 *  6809E + 6502 + 4×POKEY + RIOT 6532 + 22VP931 (HLE) + NOVRAM X2212
 * ========================================================================== */
'use strict';

/* ------------------------------------------------------------- 6502 */
function make6502(rd, wr) {
  const C = 1, Z = 2, I = 4, D = 8, B = 16, U = 32, V = 64, N = 128;
  const s = { a: 0, x: 0, y: 0, sp: 0xFD, pc: 0, p: I | U, cyc: 0, nmiEdge: false, irqLine: false, total: 0 };
  const r16 = a => rd(a & 0xFFFF) | (rd((a + 1) & 0xFFFF) << 8);
  const push = v => { wr(0x100 | s.sp, v & 0xFF); s.sp = (s.sp - 1) & 0xFF; };
  const pop = () => { s.sp = (s.sp + 1) & 0xFF; return rd(0x100 | s.sp); };
  const nz = v => { s.p = (s.p & ~(N | Z)) | (v & N) | (v ? 0 : Z); return v; };
  const CY = [7,6,2,8,3,3,5,5,3,2,2,2,4,4,6,6, 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7, 6,6,2,8,3,3,5,5,4,2,2,2,4,4,6,6, 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,
    6,6,2,8,3,3,5,5,3,2,2,2,3,4,6,6, 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7, 6,6,2,8,3,3,5,5,4,2,2,2,5,4,6,6, 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,
    2,6,2,6,3,3,3,3,2,2,2,2,4,4,4,4, 2,6,2,6,4,4,4,4,2,5,2,5,5,5,5,5, 2,6,2,6,3,3,3,3,2,2,2,2,4,4,4,4, 2,5,2,5,4,4,4,4,2,4,2,4,4,4,4,4,
    2,6,2,8,3,3,5,5,2,2,2,2,4,4,6,6, 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7, 2,6,2,8,3,3,5,5,2,2,2,2,4,4,6,6, 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7];
  function adc(v) {
    if (s.p & D) {
      let lo = (s.a & 15) + (v & 15) + (s.p & C), hi = (s.a >> 4) + (v >> 4);
      if (lo > 9) { lo -= 10; hi++; }
      const bin = s.a + v + (s.p & C);
      s.p = (s.p & ~(V | C | N | Z)) | ((~(s.a ^ v) & (s.a ^ bin) & 0x80) ? V : 0) | ((bin & 0xFF) ? 0 : Z);
      if (hi > 9) { hi -= 10; s.p |= C; }
      s.a = ((hi << 4) | lo) & 0xFF; s.p |= s.a & N;
    } else {
      const r = s.a + v + (s.p & C);
      s.p = (s.p & ~(V | C)) | (r > 0xFF ? C : 0) | ((~(s.a ^ v) & (s.a ^ r) & 0x80) ? V : 0);
      s.a = nz(r & 0xFF);
    }
  }
  function sbc(v) {
    if (s.p & D) {
      const bc = 1 - (s.p & C), bin = s.a - v - bc;
      let lo = (s.a & 15) - (v & 15) - bc, hi = (s.a >> 4) - (v >> 4);
      if (lo < 0) { lo += 10; hi--; } if (hi < 0) hi += 10;
      s.p = (s.p & ~(V | C | N | Z)) | (bin >= 0 ? C : 0) | (((s.a ^ v) & (s.a ^ bin) & 0x80) ? V : 0) | ((bin & 0xFF) ? 0 : Z) | (bin & N);
      s.a = ((hi << 4) | (lo & 15)) & 0xFF;
    } else adc(v ^ 0xFF);
  }
  const cmp = (r, v) => { const d = r - v; s.p = (s.p & ~(C | N | Z)) | (d >= 0 ? C : 0) | (d & 0xFF ? 0 : Z) | (d & N); };
  let ea = 0, extra = 0;
  const imm = () => { ea = s.pc; s.pc = (s.pc + 1) & 0xFFFF; };
  const zp = () => { ea = rd(s.pc); s.pc = (s.pc + 1) & 0xFFFF; };
  const zpx = () => { ea = (rd(s.pc) + s.x) & 0xFF; s.pc = (s.pc + 1) & 0xFFFF; };
  const zpy = () => { ea = (rd(s.pc) + s.y) & 0xFF; s.pc = (s.pc + 1) & 0xFFFF; };
  const abs = () => { ea = r16(s.pc); s.pc = (s.pc + 2) & 0xFFFF; };
  const abx = pen => { const b = r16(s.pc); s.pc = (s.pc + 2) & 0xFFFF; ea = (b + s.x) & 0xFFFF; if (pen && ((b ^ ea) & 0xFF00)) extra++; };
  const aby = pen => { const b = r16(s.pc); s.pc = (s.pc + 2) & 0xFFFF; ea = (b + s.y) & 0xFFFF; if (pen && ((b ^ ea) & 0xFF00)) extra++; };
  const izx = () => { const z = (rd(s.pc) + s.x) & 0xFF; s.pc = (s.pc + 1) & 0xFFFF; ea = rd(z) | (rd((z + 1) & 0xFF) << 8); };
  const izy = pen => { const z = rd(s.pc); s.pc = (s.pc + 1) & 0xFFFF; const b = rd(z) | (rd((z + 1) & 0xFF) << 8); ea = (b + s.y) & 0xFFFF; if (pen && ((b ^ ea) & 0xFF00)) extra++; };
  const br = c => { const o = rd(s.pc); s.pc = (s.pc + 1) & 0xFFFF; if (c) { const n = (s.pc + ((o << 24) >> 24)) & 0xFFFF; extra += ((n ^ s.pc) & 0xFF00) ? 2 : 1; s.pc = n; } };
  /* modos por grupo cc=01 */
  const G1 = [izx, zp, imm, abs, () => izy(1), zpx, () => aby(1), () => abx(1)];
  function rmw(op, f) { /* ASL/ROL/LSR/ROR/INC/DEC sobre memoria o A */
    const mode = (op >> 2) & 7;
    if (mode === 2) { s.a = f(s.a); return; }
    [zp, zp, null, abs, null, zpx, null, () => abx(0)][mode]();
    const v = rd(ea); wr(ea, v); wr(ea, f(v));
  }
  const asl = v => { s.p = (s.p & ~C) | (v >> 7); return nz((v << 1) & 0xFF); };
  const lsr = v => { s.p = (s.p & ~C) | (v & 1); return nz(v >> 1); };
  const rol = v => { const c = s.p & C; s.p = (s.p & ~C) | (v >> 7); return nz(((v << 1) | c) & 0xFF); };
  const ror = v => { const c = s.p & C; s.p = (s.p & ~C) | (v & 1); return nz((v >> 1) | (c << 7)); };
  function step() {
    if (s.nmiEdge) { s.nmiEdge = false; push(s.pc >> 8); push(s.pc); push((s.p | U) & ~B); s.p |= I; s.pc = r16(0xFFFA); return 7; }
    if (s.irqLine && !(s.p & I)) { if (s.autoAck) s.irqLine = false; push(s.pc >> 8); push(s.pc); push((s.p | U) & ~B); s.p |= I; s.pc = r16(0xFFFE); return 7; }
    const op = rd(s.pc); s.pc = (s.pc + 1) & 0xFFFF; extra = 0;
    const cc = op & 3, aaa = op >> 5, mode = (op >> 2) & 7;
    switch (op) {
      case 0x00: s.pc = (s.pc + 1) & 0xFFFF; push(s.pc >> 8); push(s.pc); push(s.p | B | U); s.p |= I; s.pc = r16(0xFFFE); break;
      case 0x20: { const t = r16(s.pc); s.pc = (s.pc + 1) & 0xFFFF; push(s.pc >> 8); push(s.pc); s.pc = t; break; }
      case 0x40: s.p = pop() | U; s.p &= ~B; s.pc = pop() | (pop() << 8); break;
      case 0x60: s.pc = ((pop() | (pop() << 8)) + 1) & 0xFFFF; break;
      case 0x4C: s.pc = r16(s.pc); break;
      case 0x6C: { const p = r16(s.pc); s.pc = rd(p) | (rd((p & 0xFF00) | ((p + 1) & 0xFF)) << 8); break; }
      case 0x08: push(s.p | B | U); break; case 0x28: s.p = (pop() & ~B) | U; break;
      case 0x48: push(s.a); break; case 0x68: s.a = nz(pop()); break;
      case 0x18: s.p &= ~C; break; case 0x38: s.p |= C; break; case 0x58: s.p &= ~I; break; case 0x78: s.p |= I; break;
      case 0xB8: s.p &= ~V; break; case 0xD8: s.p &= ~D; break; case 0xF8: s.p |= D; break;
      case 0x88: s.y = nz((s.y - 1) & 0xFF); break; case 0xC8: s.y = nz((s.y + 1) & 0xFF); break;
      case 0xCA: s.x = nz((s.x - 1) & 0xFF); break; case 0xE8: s.x = nz((s.x + 1) & 0xFF); break;
      case 0x8A: s.a = nz(s.x); break; case 0x98: s.a = nz(s.y); break; case 0xAA: s.x = nz(s.a); break; case 0xA8: s.y = nz(s.a); break;
      case 0x9A: s.sp = s.x; break; case 0xBA: s.x = nz(s.sp); break; case 0xEA: break;
      case 0x10: br(!(s.p & N)); break; case 0x30: br(s.p & N); break; case 0x50: br(!(s.p & V)); break; case 0x70: br(s.p & V); break;
      case 0x90: br(!(s.p & C)); break; case 0xB0: br(s.p & C); break; case 0xD0: br(!(s.p & Z)); break; case 0xF0: br(s.p & Z); break;
      case 0x24: case 0x2C: { (op === 0x24 ? zp : abs)(); const v = rd(ea); s.p = (s.p & ~(N | V | Z)) | (v & (N | V)) | ((s.a & v) ? 0 : Z); break; }
      case 0xA0: case 0xA4: case 0xAC: case 0xB4: case 0xBC: [imm, zp, null, abs, null, zpx, null, () => abx(1)][mode](); s.y = nz(rd(ea)); break;
      case 0xA2: case 0xA6: case 0xAE: case 0xB6: case 0xBE: [imm, zp, null, abs, null, zpy, null, () => aby(1)][mode](); s.x = nz(rd(ea)); break;
      case 0x84: case 0x8C: case 0x94: [null, zp, null, abs, null, zpx][mode](); wr(ea, s.y); break;
      case 0x86: case 0x8E: case 0x96: [null, zp, null, abs, null, zpy][mode](); wr(ea, s.x); break;
      case 0xC0: case 0xC4: case 0xCC: [imm, zp, null, abs][mode](); cmp(s.y, rd(ea)); break;
      case 0xE0: case 0xE4: case 0xEC: [imm, zp, null, abs][mode](); cmp(s.x, rd(ea)); break;
      default:
        if (cc === 1) {
          if (op === 0x89) { imm(); break; }
          const w = aaa === 4;
          if (w) [izx, zp, imm, abs, () => izy(0), zpx, () => aby(0), () => abx(0)][mode](); else G1[mode]();
          switch (aaa) {
            case 0: s.a = nz(s.a | rd(ea)); break; case 1: s.a = nz(s.a & rd(ea)); break; case 2: s.a = nz(s.a ^ rd(ea)); break;
            case 3: adc(rd(ea)); break; case 4: wr(ea, s.a); break; case 5: s.a = nz(rd(ea)); break; case 6: cmp(s.a, rd(ea)); break; case 7: sbc(rd(ea)); break;
          }
        } else if (cc === 2 && (mode === 1 || mode === 2 || mode === 3 || mode === 5 || mode === 7)) {
          if (aaa === 6) rmw(op, v => nz((v - 1) & 0xFF));
          else if (aaa === 7) rmw(op, v => nz((v + 1) & 0xFF));
          else rmw(op, [asl, rol, lsr, ror][aaa]);
        }
        /* ilegales: NOP */
    }
    return CY[op] + extra;
  }
  s.step = step;
  s.reset = () => { s.pc = r16(0xFFFC); s.sp = 0xFD; s.p = I | U; };
  return s;
}
function M6502CPU(rd, wr) {
  const c = make6502(rd, wr);
  const a = { c, total: 0, done: 0, held: false,
    reset() { c.reset(); }, irq(on) { c.irqLine = on !== false; }, nmi() { c.nmiEdge = true; },
    cycles() { return a.total + a.done; }, get pc() { return c.pc; },
    run(n) { a.done = 0; if (a.held) { a.total += n; return n; } while (a.done < n) a.done += c.step(); a.total += a.done; const d = a.done; a.done = 0; return d; } };
  return a;
}

/* -------------------------------------------------------------- POKEY */
function makePOKEY(clock, sr) {
  const audf = new Uint8Array(4), audc = new Uint8Array(4); let audctl = 0;
  const cnt = new Float64Array(4), out = new Int8Array(4).fill(1);
  let p4 = 0, p5 = 0, p17 = 0x1FFFF, rnd = 0;
  const base64 = clock / 28, base15 = clock / 114;
  function period(ch) {
    const b = (ch === 0 && (audctl & 0x40)) || (ch === 2 && (audctl & 0x20)) ? clock : (audctl & 1 ? base15 : base64);
    if (ch === 1 && (audctl & 0x10)) { const f = audf[0] | (audf[1] << 8), bb = audctl & 0x40 ? clock : (audctl & 1 ? base15 : base64); return (f + (audctl & 0x40 ? 7 : 1)) / bb; }
    if (ch === 3 && (audctl & 0x08)) { const f = audf[2] | (audf[3] << 8), bb = audctl & 0x20 ? clock : (audctl & 1 ? base15 : base64); return (f + (audctl & 0x20 ? 7 : 1)) / bb; }
    return (audf[ch] + (b === clock ? 4 : 1)) / b;
  }
  return {
    write(r, v) {
      r &= 15;
      if (r < 8) { if (r & 1) audc[r >> 1] = v; else audf[r >> 1] = v; }
      else if (r === 8) audctl = v;
    },
    read(r) { if ((r & 15) === 10) { rnd = (rnd * 1103515245 + 12345) >>> 0; return (rnd >> 16) & 0xFF; } return 0xFF; },
    sample() {
      let s = 0; const dt = 1 / sr;
      for (let ch = 0; ch < 4; ch++) {
        const c = audc[ch], vol = c & 15; if (!vol) continue;
        if (c & 0x10) { s += vol / 15; continue; } /* sólo volumen */
        if ((ch === 0 && (audctl & 0x10)) || (ch === 2 && (audctl & 0x08))) continue;
        const per = period(ch);
        cnt[ch] -= dt;
        while (cnt[ch] <= 0) {
          cnt[ch] += per;
          if (c & 0x20) out[ch] = -out[ch];
          else {
            p17 = ((p17 >> 1) | ((((p17 >> 0) ^ (p17 >> 5)) & 1) << 16)) & 0x1FFFF;
            p5 = (p5 + 1) % 31; p4 = (p4 + 1) % 15;
            if ((c & 0x80) || (p5 & 1)) out[ch] = (c & 0x40 ? (p4 & 1) : (audctl & 0x80 ? (p17 >> 8) & 1 : p17 & 1)) ? 1 : -1;
          }
        }
        s += out[ch] * vol / 15;
      }
      return s / 4;
    }
  };
}

/* ------------------------------------------------------------ RIOT 6532 */
function makeRIOT(onIrq) {
  const ram = new Uint8Array(128);
  let timer = 0xFF, pres = 1024, sub = 0, irqEn = false, flag = false, ddra = 0, ddrb = 0, ora = 0, orb = 0;
  const R = {
    ram, pa: () => 0xFF, pb: () => 0xFF, wa: () => {}, wb: () => {},
    clock(n) { sub += n; while (sub >= pres) { sub -= pres; timer = (timer - 1) & 0xFF; if (timer === 0xFF) { flag = true; pres = 1; if (irqEn) onIrq(true); } } },
    read(a) {
      if (!(a & 0x80)) return ram[a & 0x7F];
      if (a & 4) { if (a & 1) return flag ? 0x80 : 0; flag = false; onIrq(false); irqEn = !!(a & 8); return timer; }
      switch (a & 3) {
        case 0: return (R.pa() & ~ddra) | (ora & ddra);
        case 1: return ddra;
        case 2: return (R.pb() & ~ddrb) | (orb & ddrb);
        case 3: return ddrb;
      }
      return 0xFF;
    },
    write(a, v) {
      if (!(a & 0x80)) { ram[a & 0x7F] = v; return; }
      if ((a & 0x14) === 0x14) { pres = [1, 8, 64, 1024][a & 3]; timer = v; sub = 0; irqEn = !!(a & 8); flag = false; onIrq(false); return; }
      if (a & 4) return;
      switch (a & 3) { case 0: ora = v; R.wa(v); break; case 1: ddra = v; break; case 2: orb = v; R.wb(v); break; case 3: ddrb = v; break; }
    }
  };
  return R;
}

/* ------------------------------------------------ 22VP931 (HLE sobre LDP) */
class VP931 {
  constructor(ldp) { this.ldp = ldp; this.cmd = []; this.out = []; this.outIdx = 99; this.fieldN = 0; this.inReset = false; this.log = []; }
  get dav() { return this.outIdx < this.out.length; }
  read() { const v = this.outIdx < this.out.length ? this.out[this.outIdx] : 0; this.outIdx++; return v; }
  reset(on) { this.inReset = on; if (on) this.cmd = []; }
  write(b) { this.cmd.push(b & 0xFF); if (this.cmd.length === 3) { this.exec(this.cmd); this.cmd = []; } }
  exec(c) {
    const L = this.ldp, bcd = b => (b >> 4) * 10 + (b & 15), hi = c[0] & 0xF0;
    if (this.log.length < 2000) this.log.push(c.map(x => x.toString(16).padStart(2, '0')).join(' ') + '@' + this.ldp.frame + (this.ldp.status === LDP_SEARCHING ? 's' : ''));
    if (c[0] === 0x00) {
      if (c[1] === 0x00) L.play();
      else if (c[1] === 0x20) L.pause();
      else if ((c[1] & 0xF0) === 0xE0) { const st = L.status; L.frame += (c[1] & 15) * 100 + bcd(c[2]); L.status = st === LDP_PAUSED ? LDP_PAUSED : LDP_PLAYING; L.note('SKIP'); }
      else if ((c[1] & 0xF0) === 0xF0) { const st = L.status; L.frame = Math.max(1, L.frame - ((c[1] & 15) * 100 + bcd(c[2]))); L.status = st === LDP_PAUSED ? LDP_PAUSED : LDP_PLAYING; L.note('SKIP'); }
    } else if (hi === 0xF0 || hi === 0xD0 || hi === 0xE0) {
      const f = (c[0] & 15) * 10000 + bcd(c[1]) * 100 + bcd(c[2]);
      const dist = Math.abs(f - L.frame); L.searchFields = dist < 3 ? 1 : Math.min(40, 2 + Math.floor(dist / 900));
      L.search(f, false); this.playAfter = hi === 0xF0;
    }
  }
  /* un campo de video: devuelve true si hay datos (DAV → FIRQ) */
  field() {
    const L = this.ldp, wasSearch = L.status === LDP_SEARCHING;
    L.field();
    if (wasSearch && L.status === LDP_PAUSED && this.playAfter) { L.play(); this.playAfter = false; }
    this.fieldN ^= 1;
    if (this.inReset) { this.out = [0, 0, 0, 2, 0, 0]; this.outIdx = 0; return true; }
    const f = L.frame, d = [f / 10000 | 0, (f / 1000 | 0) % 10, (f / 100 | 0) % 10, (f / 10 | 0) % 10, f % 10];
    this.out = [(this.fieldN === 0 ? 0xF8 : 0xA8) | (d[0] & 7), (d[1] << 4) | d[2], (d[3] << 4) | d[4], L.status === LDP_SEARCHING ? 0x20 : 0, 0, 0];
    this.outIdx = 0; return true;
  }
}

/* ============================================================ FIREFOX */
async function drvFirefox(lib, set, env) {
  const main = new Uint8Array(0x30000), aud = new Uint8Array(0x10000), tiles = new Uint8Array(0x2000), spr = new Uint8Array(0x30000);
  const defs = FIREFOX_ROMS[set];
  const res = await lib.loadSet(set, defs, { maincpu: main, audiocpu: aud, tiles, sprites: spr });
  if (set === 'firefox') { main.copyWithin(0x26000, 0x24000, 0x26000); aud.copyWithin(0xA000, 0x8000, 0xA000); }
  const ram = new Uint8Array(0x1000), tileram = new Uint8Array(0x1000), sprram = new Uint8Array(0x800);
  const spal = new Uint8Array(0x300), tpal = new Uint8Array(0x300), nv = new Uint8Array(0x100);
  try { const s = localStorage.getItem('ddn.nv.' + set); if (s) nv.set(JSON.parse(s)); } catch (e) {}
  const m = new Machine(), ldp = new LDP(29.97), vp = new VP931(ldp);
  ldp.squelchSearch = true;
  const pk = [0, 1, 2, 3].map(() => makePOKEY(14318181 / 8, env.sampleRate));
  let bank = 0, sprBank = 0, discData = 0, discRead = 0, latch0 = 0, latch1 = 0, sndHeld = false;
  let sl1 = 0, sl1p = false, sl2 = 0, sl2p = false, adcCh = 0, vblank = false;
  const inp = { rdin0: 0xFF, rdin1: 0x07 | 0x10, opt0: 0, opt1: 0, pitch: 0x80, yaw: 0x80 };
  const pal = new Uint32Array(512);
  const setPal = (base, i, p) => { const r = p[i], g = p[i + 256], b = p[i + 512]; pal[base + i] = rgba(r, g, b, (b & 3) * 0x55); };
  let cpu, snd;
  const riot = makeRIOT(on => snd && snd.irq(on));
  riot.pa = () => (sl1p ? 0x80 : 0) | (sl2p ? 0x40 : 0) | 0x10 | 0x00; /* TEST=1, /READY TMS=0 */
  riot.pb = () => 0x60; /* TMS5220: buffer vacío, sin hablar */
  const latchWrite = (which, bit, st) => {
    const prev = which ? latch1 : latch0, now = st ? prev | (1 << bit) : prev & ~(1 << bit);
    if (which) { latch1 = now; return; }
    latch0 = now;
    if (bit === 1 && ((prev ^ now) & 2)) { sndHeld = !!st; snd.held = sndHeld; if (st) { sl1p = sl2p = false; } else snd.reset(); }
    if (bit === 2 && st && !(prev & 4)) { try { localStorage.setItem('ddn.nv.' + set, JSON.stringify(Array.from(nv))); } catch (e) {} }
    if (bit === 4) ldp.audio2 = !!st; if (bit === 5) ldp.audio1 = !!st;
    if (bit === 6) vp.reset(!st);
    if (bit === 7 && !st && (prev & 0x80)) vp.write(discData);
  };
  const cnt = {}; const C = k => { cnt[k] = (cnt[k] || 0) + 1; };
  const rd = a => {
    if (a >= 0x4100 && a < 0x4108) C('r' + (a & 7));
    if (a < 0x1000) return ram[a];
    if (a < 0x2000) return tileram[a & 0xFFF];
    if (a < 0x2800) return sprram[a & 0x7FF];
    if (a < 0x2B00) return spal[a - 0x2800];
    if (a >= 0x2C00 && a < 0x2F00) return tpal[a - 0x2C00];
    if (a >= 0x3000 && a < 0x4000) return main[0x10000 + bank * 0x1000 + (a & 0xFFF)];
    if (a >= 0x4000 && a < 0x4100) return nv[a & 0xFF];
    if (a >= 0x4100 && a < 0x4200) {
      switch (a & 7) {
        case 0: return inp.rdin0;
        case 1: return (inp.rdin1 & 0x1F) | (sl1p ? 0x80 : 0) | (sl2p ? 0x40 : 0) | (vblank ? 0x20 : 0);
        case 2: { let r = 0xFF ^ 0x20; if (vp.dav) r ^= 0x80; return r; }
        case 3: return inp.opt0; case 4: return inp.opt1;
        case 5: return discRead;
        case 6: sl2p = false; return sl2;
        case 7: return adcCh === 0 ? inp.pitch : adcCh === 1 ? inp.yaw : 0x80;
      }
    }
    if (a >= 0x4400) return main[a];
    return 0xFF;
  };
  const wr = (a, v) => {
    if (a < 0x1000) { ram[a] = v; return; }
    if (a < 0x2000) { tileram[a & 0xFFF] = v; return; }
    if (a < 0x2800) { sprram[a & 0x7FF] = v; return; }
    if (a < 0x2B00) { spal[a - 0x2800] = v; setPal(256, (a - 0x2800) & 0xFF, spal); return; }
    if (a < 0x3000 && (a & 0xFF00) >= 0x2B00 && a < 0x2C00) { sprBank = v & 3; return; }
    if (a >= 0x2C00 && a < 0x2F00) { tpal[a - 0x2C00] = v; setPal(0, (a - 0x2C00) & 0xFF, tpal); return; }
    if (a >= 0x2F00 && a < 0x3000) { sprBank = v & 3; return; }
    if (a >= 0x4000 && a < 0x4100) { nv[a & 0xFF] = v; return; }
    if (a >= 0x4200 && a < 0x4300) {
      switch (a & 0xB8) {
        case 0x00: cpu.irq(false); return;
        case 0x08: C('rstfirq'); cpu.firq(false); return;
        case 0x10: return;
        case 0x18: C('dskread'); discRead = vp.read(); if (vp.dav) m.after(60, () => cpu.firq(true)); return;
        case 0x20: adcCh = a & 3; return;
        case 0x30: cpu.reset(); return;
        case 0x80: latchWrite(0, a & 7, v & 0x80); return;
        case 0x88: latchWrite(1, a & 7, v & 0x80); return;
        case 0x90: bank = v & 0x1F; return;
        case 0x98: sl1 = v; sl1p = true; snd.nmi(); return;
        case 0xA0: discData = v; return;
      }
    }
  };
  cpu = m.addCPU(M6809CPU(rd, wr), 14318181 / 8);
  cpu.c.autoAck = false;
  const srd = a => {
    if (a < 0x800) return aud[a];
    if (a < 0x1000) return riot.read(a & 0xFF);
    if (a === 0x1000) { sl1p = false; return sl1; }
    if (a >= 0x2000 && a < 0x4000) return pk[(a >> 11) & 3].read(a & 15);
    if (a >= 0x8000) return aud[a];
    return 0xFF;
  };
  const swr = (a, v) => {
    if (a < 0x800) { aud[a] = v; return; }
    if (a < 0x1000) { riot.write(a & 0xFF, v); return; }
    if (a === 0x1800) { sl2 = v; sl2p = true; return; }
    if (a >= 0x2000 && a < 0x4000) { pk[(a >> 11) & 3].write(a & 15, v); return; }
  };
  snd = m.addCPU(M6502CPU(srd, swr), 14318181 / 8);
  cpu.reset(); snd.reset(); snd.held = false;
  const origRun = snd.run;
  snd.run = n => { const d = origRun(n); riot.clock(d); return d; };
  const lineUs = FIELD_US / 525;
  /* pantalla NTSC de MAME: 525 líneas a 59.94 Hz; IRQ en las líneas 140, 268, 396 y 524 (32V) */
  m.every(FIELD_US, () => {
    vblank = true; m.after(44 * lineUs, () => { vblank = false; });
    for (const l of [140, 268, 396, 524]) m.after(l * lineUs, () => cpu.irq(true));
    if (vp.field()) cpu.firq(true);
  });
  const W = 368, H = 480;
  const decodeTile = new Uint8Array(0x4000);
  for (let i = 0; i < 0x2000; i++) { decodeTile[i * 2] = tiles[i] >> 4; decodeTile[i * 2 + 1] = tiles[i] & 15; }
  const draw = buf => {
    buf.fill(pal[256]);
    /* sprites: 6 planos de 0x8000 bytes, 16×16, 32 bytes por caracter */
    for (let sp = 0; sp < 32; sp++) {
      const o = 0x200 * sprBank + sp * 16, fl = sprram[o], y = sprram[o + 1] + 256 * (fl & 1), x = sprram[o + 2] + 256 * ((fl >> 1) & 1);
      if (!x) continue;
      const color = (fl >> 2) & 3, fy = fl & 0x10, fx = fl & 0x20;
      for (let row = 0; row < 8; row++) {
        const code = sprram[o + 15 - row] + 256 * ((fl >> 6) & 3);
        const sx = x + 8 - 56, sy = 500 - y - row * 16;
        for (let py = 0; py < 16; py++) {
          const yy = sy + py; if (yy < 0 || yy >= H) continue;
          const ry = fy ? 15 - py : py;
          for (let px = 0; px < 16; px++) {
            const xx = sx + px; if (xx < 0 || xx >= W) continue;
            const rx = fx ? 15 - px : px;
            let pen = 0; const bi = code * 32 + ry * 2 + (rx >> 3), bit = 0x80 >> (rx & 7);
            for (let p = 0; p < 6; p++) if (spr[p * 0x8000 + bi] & bit) pen |= 1 << (5 - p);
            if (pen) buf[yy * W + xx] = pal[256 + color * 64 + pen];
          }
        }
      }
    }
    /* tiles 64×64 de 8×8, 4bpp empaquetado, pen 0 transparente; clip x 56.., y 44.. */
    for (let ty = 0; ty < 61; ty++) for (let tx = 7; tx < 53; tx++) {
      const code = tileram[ty * 64 + tx] & 0xFF, base = code * 64;
      for (let y = 0; y < 8; y++) {
        const yy = ty * 8 + y; if (yy >= H) break;
        for (let x = 0; x < 8; x++) {
          const pen = decodeTile[base + y * 8 + x];
          if (pen) buf[yy * W + (tx * 8 + x - 56)] = pal[pen];
        }
      }
    }
  };
  return {
    name: set, fps: 29.97, ldp, m, res, ow: W, oh: H, vp, cnt, ram,
    runField() { m.runUs(FIELD_US); },
    input(sw, d) {
      const b0 = bit => { inp.rdin0 = d ? inp.rdin0 & ~bit : inp.rdin0 | bit; }, b1 = bit => { inp.rdin1 = d ? inp.rdin1 & ~bit : inp.rdin1 | bit; };
      switch (sw) {
        case SW.BUTTON1: b0(0x80); break; case SW.BUTTON2: b0(0x40); break; case SW.BUTTON3: b0(0x20); break; case SW.START1: b0(0x10); break;
        case SW.TILT: b0(0x08); break; case SW.SERVICE: b0(0x04); break;
        case SW.COIN1: b1(0x02); break; case SW.COIN2: b1(0x01); break; case SW.TEST: b1(0x04); break;
        case SW.UP: inp.pitch = d ? 0x20 : 0x80; break; case SW.DOWN: inp.pitch = d ? 0xE0 : 0x80; break;
        case SW.LEFT: inp.yaw = d ? 0x20 : 0x80; break; case SW.RIGHT: inp.yaw = d ? 0xE0 : 0x80; break;
      }
    },
    analog(x, y) { inp.yaw = Math.max(0, Math.min(255, x)); inp.pitch = Math.max(0, Math.min(255, y)); },
    draw, sample() { return (pk[0].sample() + pk[1].sample() + pk[2].sample() + pk[3].sample()) * 0.4; },
    status() { return 'PC ' + cpu.pc.toString(16).padStart(4, '0') + '/' + snd.pc.toString(16).padStart(4, '0') + ' · 22VP931'; }
  };
}
DRIVERS.firefox = drvFirefox;
