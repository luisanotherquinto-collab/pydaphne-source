/* ==========================================================================
 *  DAPHNE·JS core — scheduler, adaptadores de CPU, chips de sonido, VDP,
 *  modelos de reproductor de laserdisc (LD-V1000, PR-7820, PR-8210) y
 *  cargador de ROMs desde los zip embebidos (búsqueda por nombre y CRC32).
 *
 *  Portado del comportamiento de Hypseus Singe (GPL) — ldp-in/*.cpp,
 *  ldp-out/ldp.cpp, cpu/cpu.cpp — a JavaScript.
 * ========================================================================== */
'use strict';

const FIELD_US = 1e6 / 59.94;

/* ---------------------------------------------------------------- scheduler */
class Machine {
  constructor() {
    this.cpus = []; this.timers = []; this.events = [];
    this.timeUs = 0; this.sliceUs = 250; this.active = 0;
  }
  addCPU(cpu, hz) { cpu.hz = hz; cpu.index = this.cpus.length; this.cpus.push(cpu); return cpu; }
  /* temporizador periódico en microsegundos */
  every(periodUs, fn, phaseUs) {
    const t = { period: periodUs, next: this.timeUs + (phaseUs || periodUs), fn, on: true };
    this.timers.push(t); return t;
  }
  /* evento único dentro de delayUs */
  after(delayUs, fn) { this.events.push({ at: this.timeUs + delayUs, fn }); }
  cyclesToUs(cpu, c) { return c * 1e6 / cpu.hz; }
  runUs(us) {
    const end = this.timeUs + us;
    while (this.timeUs < end - 1e-6) {
      let next = Math.min(end, this.timeUs + this.sliceUs);
      for (const t of this.timers) if (t.on && t.next < next) next = t.next;
      for (const e of this.events) if (e.at < next) next = e.at;
      if (next <= this.timeUs) next = this.timeUs + 1e-3;
      for (let i = 0; i < this.cpus.length; i++) {
        const c = this.cpus[i];
        if (c.suspended) { c.total = next * c.hz / 1e6; continue; }
        const target = next * c.hz / 1e6;
        const n = Math.ceil(target - c.total);
        if (n > 0) { this.active = i; c.run(n); }
      }
      this.timeUs = next;
      for (const t of this.timers) {
        while (t.on && t.next <= this.timeUs + 1e-6) { t.next += t.period; t.fn(); }
      }
      if (this.events.length) {
        const due = this.events.filter(e => e.at <= this.timeUs + 1e-6);
        this.events = this.events.filter(e => e.at > this.timeUs + 1e-6);
        for (const e of due) e.fn();
      }
    }
  }
}

/* ------------------------------------------------------------ Z80 adapter */
function Z80CPU(bus) {
  const z = makeZ80(bus);
  const a = {
    z, total: 0, irqLine: false, irqHold: true, vec: 0xFF, nmiEdge: false, cur: 0, eiSkip: false,
    reset() { z.reset(); a.irqLine = false; a.nmiEdge = false; },
    irq(on) { a.irqLine = on !== false; },
    nmi() { a.nmiEdge = true; },
    cycles() { return a.total + (a.cur - z.cyc); },
    get pc() { return z.pc; },
    run(n) {
      a.cur = n; z.cyc = n;
      while (z.cyc > 0) {
        if (a.nmiEdge) { a.nmiEdge = false; z.nmi(); }
        else if (a.irqLine && z.iff1 && !a.eiSkip) {
          if (z.irq(typeof a.vec === 'function' ? a.vec() : a.vec) && a.irqHold) a.irqLine = false;
        }
        a.eiSkip = false;
        z.step();
        if (z.eiPending) { z.eiPending = 0; a.eiSkip = true; }
      }
      const used = n - z.cyc; a.total += used; a.cur = 0; z.cyc = 0;
      return used;
    }
  };
  return a;
}

/* ----------------------------------------------------------- 6809 adapter */
function M6809CPU(read, write) {
  const c = new CPU6809(read, write, 'm6809');
  c.autoAck = true;
  const a = {
    c, total: 0, cur: 0, done: 0,
    reset() { c.reset(); },
    irq(on) { c.irqLine = on === false ? 0 : 1; },
    firq(on) { c.firqLine = on === false ? 0 : 1; },
    nmi() { c.nmi(); },
    cycles() { return a.total + a.done; },
    get pc() { return c.pc; },
    run(n) {
      a.done = 0;
      while (a.done < n) a.done += c.step();
      a.total += a.done; const d = a.done; a.done = 0; return d;
    }
  };
  return a;
}

/* ------------------------------------------------------------- SN76496 */
function makeSN76496(clock, sampleRate) {
  const reg = new Uint16Array(8); reg[1] = reg[3] = reg[5] = reg[7] = 0x0F;
  const cnt = new Float64Array(4), out = [1, 1, 1, 1];
  let latch = 0, lfsr = 0x4000;
  const VOL = new Float32Array(16);
  for (let i = 0; i < 15; i++) VOL[i] = Math.pow(10, -2 * i / 20); VOL[15] = 0;
  const step = clock / 16 / sampleRate;
  function write(v) {
    if (v & 0x80) {
      latch = (v >> 4) & 7;
      if (latch & 1 || latch === 6) reg[latch] = v & 0x0F;
      else reg[latch] = (reg[latch] & 0x3F0) | (v & 0x0F);
      if (latch === 6) lfsr = 0x4000;
    } else {
      if (latch & 1 || latch === 6) { reg[latch] = v & 0x0F; if (latch === 6) lfsr = 0x4000; }
      else reg[latch] = (reg[latch] & 0x0F) | ((v & 0x3F) << 4);
    }
  }
  function sample() {
    let s = 0;
    for (let ch = 0; ch < 3; ch++) {
      const per = reg[ch * 2] || 1;
      cnt[ch] -= step;
      while (cnt[ch] <= 0) { cnt[ch] += per; out[ch] = -out[ch]; }
      if (per > 1) s += out[ch] * VOL[reg[ch * 2 + 1]];
    }
    const nr = reg[6], nper = [0x10, 0x20, 0x40, reg[4] || 1][nr & 3];
    cnt[3] -= step;
    while (cnt[3] <= 0) {
      cnt[3] += nper;
      const fb = (nr & 4) ? ((lfsr ^ (lfsr >> 1)) & 1) : (lfsr & 1);
      lfsr = (lfsr >> 1) | (fb << 14); out[3] = lfsr & 1 ? 1 : -1;
    }
    s += out[3] * VOL[reg[7]];
    return s / 4;
  }
  return { write, sample };
}

/* ---------------------------------------------------- TMS9918A / TMS9128 */
const TMS_PAL = [
  [0, 0, 0, 0], [0, 0, 0, 255], [33, 200, 66, 255], [94, 220, 120, 255],
  [84, 85, 237, 255], [125, 118, 252, 255], [212, 82, 77, 255], [66, 235, 245, 255],
  [252, 85, 84, 255], [255, 121, 120, 255], [212, 193, 84, 255], [230, 206, 128, 255],
  [33, 176, 59, 255], [201, 91, 186, 255], [204, 204, 204, 255], [255, 255, 255, 255]];
function makeTMS9918() {
  const vram = new Uint8Array(0x4000), reg = new Uint8Array(8);
  let addr = 0, latchByte = 0, latched = false, buf = 0, status = 0;
  const pix = new Uint8Array(256 * 192);
  const T = {
    vram, reg, pix, w: 256, h: 192,
    reset() { vram.fill(0); reg.fill(0); addr = 0; latched = false; status = 0; },
    writeCtrl(v) {
      if (!latched) { latchByte = v; latched = true; addr = (addr & 0x3F00) | v; return; }
      latched = false;
      if (v & 0x80) { reg[v & 7] = latchByte; return; }
      addr = ((v & 0x3F) << 8) | latchByte;
      if (!(v & 0x40)) { buf = vram[addr]; addr = (addr + 1) & 0x3FFF; }
    },
    writeData(v) { latched = false; buf = v; vram[addr] = v; addr = (addr + 1) & 0x3FFF; },
    readData() { latched = false; const r = buf; buf = vram[addr]; addr = (addr + 1) & 0x3FFF; return r; },
    readStatus() { latched = false; const r = status; status &= 0x1F; return r; },
    vblank() { status |= 0x80; return (reg[1] & 0x20) !== 0; },
    get intEnabled() { return (reg[1] & 0x20) !== 0; },
    render() {
      pix.fill(0);
      if (!(reg[1] & 0x40)) return pix;
      const m1 = reg[1] & 0x10, m2 = reg[1] & 0x08, m3 = reg[0] & 0x02;
      const bd = reg[7] & 0x0F;
      const nt = (reg[2] & 0x0F) << 10;
      if (m1) { /* texto 40x24, celdas de 6 px */
        const pg = (reg[4] & 7) << 11, fg = reg[7] >> 4;
        for (let row = 0; row < 24; row++) for (let col = 0; col < 40; col++) {
          const ch = vram[(nt + row * 40 + col) & 0x3FFF];
          for (let y = 0; y < 8; y++) {
            const b = vram[(pg + ch * 8 + y) & 0x3FFF], o = (row * 8 + y) * 256 + 8 + col * 6;
            for (let x = 0; x < 6; x++) pix[o + x] = (b & (0x80 >> x)) ? fg : bd;
          }
        }
        return pix;
      }
      if (m3) { /* Graphics II */
        const pg = (reg[4] & 4) << 11, ct = (reg[3] & 0x80) << 6;
        const pmask = ((reg[4] & 3) << 8) | 0xFF, cmask = ((reg[3] & 0x7F) << 3) | 7;
        for (let row = 0; row < 24; row++) for (let col = 0; col < 32; col++) {
          const ch = vram[(nt + row * 32 + col) & 0x3FFF] + ((row >> 3) << 8);
          for (let y = 0; y < 8; y++) {
            const p = vram[(pg + ((ch & pmask) * 8) + y) & 0x3FFF];
            const c = vram[(ct + ((ch & cmask) * 8) + y) & 0x3FFF];
            const f = c >> 4 || bd, bk = c & 15 || bd, o = (row * 8 + y) * 256 + col * 8;
            for (let x = 0; x < 8; x++) pix[o + x] = (p & (0x80 >> x)) ? f : bk;
          }
        }
      } else if (m2) { /* multicolor */
        const pg = (reg[4] & 7) << 11;
        for (let row = 0; row < 24; row++) for (let col = 0; col < 32; col++) {
          const ch = vram[(nt + row * 32 + col) & 0x3FFF];
          for (let y = 0; y < 8; y++) {
            const c = vram[(pg + ch * 8 + ((row & 3) * 2) + (y >> 2)) & 0x3FFF], o = (row * 8 + y) * 256 + col * 8;
            for (let x = 0; x < 8; x++) pix[o + x] = (x < 4 ? c >> 4 : c & 15) || bd;
          }
        }
      } else { /* Graphics I */
        const pg = (reg[4] & 7) << 11, ct = reg[3] << 6;
        for (let row = 0; row < 24; row++) for (let col = 0; col < 32; col++) {
          const ch = vram[(nt + row * 32 + col) & 0x3FFF];
          const c = vram[(ct + (ch >> 3)) & 0x3FFF], f = c >> 4 || bd, bk = c & 15 || bd;
          for (let y = 0; y < 8; y++) {
            const p = vram[(pg + ch * 8 + y) & 0x3FFF], o = (row * 8 + y) * 256 + col * 8;
            for (let x = 0; x < 8; x++) pix[o + x] = (p & (0x80 >> x)) ? f : bk;
          }
        }
      }
      /* sprites */
      const sat = (reg[5] & 0x7F) << 7, spg = (reg[6] & 7) << 11;
      const big = reg[1] & 2, mag = reg[1] & 1, sz = (big ? 16 : 8) * (mag ? 2 : 1);
      for (let s = 31; s >= 0; s--) {
        let y = vram[sat + s * 4]; if (y === 0xD0) { /* fin de lista */ }
        let stop = false;
        for (let k = 0; k <= s; k++) if (vram[sat + k * 4] === 0xD0) { stop = true; break; }
        if (stop) continue;
        y = (y + 1) & 0xFF; if (y > 0xE0) y -= 256;
        let x = vram[sat + s * 4 + 1]; const nm = vram[sat + s * 4 + 2] & (big ? 0xFC : 0xFF);
        const at = vram[sat + s * 4 + 3], col = at & 15; if (at & 0x80) x -= 32;
        if (!col) continue;
        for (let py = 0; py < sz; py++) {
          const yy = y + py; if (yy < 0 || yy >= 192) continue;
          const ry = mag ? py >> 1 : py;
          for (let px = 0; px < sz; px++) {
            const xx = x + px; if (xx < 0 || xx >= 256) continue;
            const rx = mag ? px >> 1 : px;
            const q = (rx >> 3) * 16 + ry;
            const b = vram[(spg + nm * 8 + (big ? q : ry)) & 0x3FFF];
            if (b & (0x80 >> (rx & 7))) pix[yy * 256 + xx] = col;
          }
        }
      }
      return pix;
    }
  };
  return T;
}

/* ------------------------------------------------ laserdisc (ldp-out) */
const LDP_ERROR = 0, LDP_SEARCHING = 1, LDP_STOPPED = 2, LDP_PLAYING = 3, LDP_PAUSED = 4;
class LDP {
  constructor(fps) {
    this.fps = fps || 29.97; this.frame = 1; this.frac = 0;
    this.status = LDP_STOPPED; this.target = 0; this.searchLeft = 0; this.searchFields = 2;
    this.speedNum = 1; this.speedDen = 1; this.audio1 = true; this.audio2 = true;
    this.display = true; this.maxFrame = 99999; this.seq = 0; this.log = [];
    this.skipFieldsLeft = 0; this.blank = false;
  }
  note(s) { this.log.push(s); if (this.log.length > 40) this.log.shift(); this.seq++; }
  search(frame, blocking) {
    frame = typeof frame === 'string' ? parseInt(frame, 10) || 0 : frame | 0;
    if (frame < 0 || frame > this.maxFrame) { this.status = LDP_ERROR; this.note('SEARCH ' + frame + ' ERR'); return false; }
    this.target = frame; this.note('SEARCH ' + frame);
    if (blocking) { this.frame = frame; this.frac = 0; this.status = LDP_PAUSED; }
    else { this.status = LDP_SEARCHING; this.searchLeft = this.searchFields; }
    return true;
  }
  play() { if (this.status === LDP_PLAYING && this.speedNum === this.speedDen) return; if (this.status === LDP_SEARCHING) { this.frame = this.target; } this.status = LDP_PLAYING; this.speedNum = this.speedDen = 1; this.frac = 0; this.note('PLAY ' + this.frame); }
  pause() { if (this.status === LDP_SEARCHING) this.frame = this.target; this.status = LDP_PAUSED; this.note('PAUSE ' + this.frame); }
  stop() { this.status = LDP_STOPPED; this.note('STOP'); }
  changeSpeed(n, d) { this.speedNum = n; this.speedDen = d; if (this.status !== LDP_PLAYING) this.status = LDP_PLAYING; }
  skipForward(n) { this.frame += n; this.frac = 0; this.status = LDP_PLAYING; this.note('SKIP +' + n); }
  skipBackward(n) { this.frame = Math.max(1, this.frame - n); this.frac = 0; this.status = LDP_PLAYING; this.note('SKIP -' + n); }
  stepForward() { this.frame++; this.status = LDP_PAUSED; }
  stepBackward() { if (this.frame > 1) this.frame--; this.status = LDP_PAUSED; }
  /* se llama en cada campo (59.94 Hz) */
  field() {
    if (this.status === LDP_SEARCHING) {
      if (--this.searchLeft <= 0) { this.frame = this.target; this.frac = 0; this.status = LDP_PAUSED; }
    } else if (this.status === LDP_PLAYING) {
      this.frac += this.fps / 59.94 * this.speedNum / this.speedDen;
      while (this.frac >= 1) { this.frac -= 1; this.frame++; }
    }
  }
  get curFrame() { return this.frame; }
  /* tiempo (s) desde el cuadro 0 del disco, para sincronizar el <video> */
  get discTime() { return (this.frame + this.frac) / this.fps; }
}

/* ---------------------------------------------------- LD-V1000 (ldp-in) */
class LDV1000 {
  constructor(ldp, opts) {
    this.ldp = ldp; this.opts = opts || {};
    this.reset();
  }
  reset() {
    this.stack = []; this.autostop = 0; this.output = 0xFC; this.searchPending = false;
    this.digits = ''; this.audio1 = true; this.audio2 = true; this.tempMute = false; this.readsSince = 0;
  }
  read() {
    if (this.stack.length) return this.stack.pop();
    if (this.nextOut !== undefined && !this.searchPending && this.output === 0xD0 && this.readsSince++ > 0) { this.output = this.nextOut; this.nextOut = undefined; this.readsSince = 0; }
    const L = this.ldp;
    if (this.searchPending) {
      this.output = 0x50;
      if (L.status === LDP_PAUSED) { this.output = 0xD0; this.searchPending = false; if (this.opts.afterSearch !== undefined) { this.stack.length = 0; this.nextOut = this.opts.afterSearch; } }
      else if (L.status === LDP_ERROR) { this.output = 0x90; this.searchPending = false; }
    } else if ((this.output & 0x7F) === 0x54) {
      if (L.curFrame >= this.autostop) { L.pause(); this.output = (this.output & 0x80) | 0x65; this.autostop = 0; }
    }
    return this.output;
  }
  addDigit(d) {
    if (this.opts.badlands) this.output |= 0x80;
    this.digits = (this.digits + d).slice(-5);
  }
  write(v) {
    const L = this.ldp;
    if (this.output & 0x80) {
      this.output &= 0x7F;
      const DIG = { 0x3F: 0, 0x0F: 1, 0x8F: 2, 0x4F: 3, 0x2F: 4, 0xAF: 5, 0x6F: 6, 0x1F: 7, 0x9F: 8, 0x5F: 9 };
      if (v in DIG) { this.addDigit(String(DIG[v])); return; }
      switch (v) {
        case 0xBF: this.digits = ''; this.output &= 0x7F; break;
        case 0xF4: this.audioCmd(1); break;
        case 0xFC: this.audioCmd(2); break;
        case 0xA0: L.pause(); break;
        case 0xA1: L.changeSpeed(1, 4); break;
        case 0xA2: L.changeSpeed(1, 2); break;
        case 0xA3:
          if (L.status !== LDP_PLAYING) { this.tempMute = true; L.play(); L.audio1 = L.audio2 = false; this.output = 0x2E; }
          L.changeSpeed(1, 1); break;
        case 0xA4: L.changeSpeed(2, 1); break;
        case 0xA5: L.changeSpeed(3, 1); break;
        case 0xA6: L.changeSpeed(4, 1); break;
        case 0xA7: L.changeSpeed(5, 1); break;
        case 0xF9: this.output = 0x7C; break;
        case 0xF3: this.autostop = parseInt(this.digits || '0', 10); this.digits = ''; L.play(); this.output = 0x54; break;
        case 0xFD:
          L.play();
          if (this.tempMute) { this.tempMute = false; L.audio1 = this.audio1; L.audio2 = this.audio2; }
          this.output = 0x64; break;
        case 0xFE: L.pause(); this.output = 0x65; break;
        case 0xF7:
          if (L.search(this.digits || '0', !!this.opts.blocking)) {
            if (this.opts.blocking) this.output = 0xD0;
            else { this.searchPending = true; this.output = 0x50; }
          } else this.output = 0x90;
          this.digits = ''; break;
        case 0xC2: {
          const s = String(L.curFrame).padStart(5, '0');
          for (let i = 4; i >= 0; i--) this.stack.push(s.charCodeAt(i));
          break;
        }
        case 0xB1: case 0xB2: case 0xB3: case 0xB4: case 0xB5:
        case 0xB6: case 0xB7: case 0xB8: case 0xB9: case 0xBA:
          L.skipForward(10 * (v & 0x0F) + 1); break;
        case 0xCD: L.display = false; break;
        case 0xCE: L.display = true; break;
        case 0xFB: L.pause(); this.output = 0x65; break;
        case 0x20: if (this.opts.badlands) { if (!L.search(Math.max(0, L.curFrame - 16), true)) this.output = 0x90; } break;
        case 0xFF: this.output |= 0x80; break;
        default: break;
      }
    } else {
      if (v === 0xFF) this.output |= 0x80; else this.output &= 0x7F;
    }
  }
  audioCmd(ch) {
    const L = this.ldp, k = 'audio' + ch;
    if (!this.digits) { this[k] = !this[k]; } else { this[k] = (parseInt(this.digits.slice(-1), 10) % 2) === 1; this.digits = ''; }
    L[k] = this[k];
  }
}

/* --------------------------------------------------------------- PR-7820 */
class PR7820 {
  constructor(ldp) { this.ldp = ldp; this.reset(); }
  reset() { this.ready = true; this.autostop = 0; this.pending = false; this.digits = ''; this.a1 = true; this.a2 = true; }
  readReady() {
    const L = this.ldp;
    if (this.pending) {
      if (L.status === LDP_PAUSED) { this.ready = false; this.pending = false; }
      else if (L.status === LDP_ERROR) { this.ready = true; this.pending = false; }
    } else if (this.autostop && L.curFrame >= this.autostop) { L.pause(); this.autostop = 0; }
    return this.ready;
  }
  write(v) {
    const L = this.ldp;
    const DIG = { 0x3F: 0, 0x0F: 1, 0x8F: 2, 0x4F: 3, 0x2F: 4, 0xAF: 5, 0x6F: 6, 0x1F: 7, 0x9F: 8, 0x5F: 9 };
    if (v in DIG) { this.digits = (this.digits + DIG[v]).slice(-5); return; }
    switch (v) {
      case 0xF4: case 0xFC: {
        const k = v === 0xF4 ? 'audio1' : 'audio2', m = v === 0xF4 ? 'a1' : 'a2';
        if (!this.digits) this[m] = !this[m]; else { this[m] = (+this.digits[0]) % 2 === 1; this.digits = ''; }
        L[k] = this[m]; break;
      }
      case 0xA3: L.changeSpeed(1, 1); break;
      case 0xF3: this.autostop = parseInt(this.digits || '0', 10); this.digits = ''; L.play(); break;
      case 0xFD: L.play(); break;
      case 0xF7: this.ready = true; if (L.search(this.digits || '0', false)) this.pending = true; this.digits = ''; break;
      case 0xFB: L.pause(); break;
    }
  }
}

/* --------------------------------------------------------------- PR-8210 */
class PR8210 {
  constructor(ldp) { this.ldp = ldp; this.reset(); }
  reset() { this.seekReceived = false; this.digits = ''; this.old = 0xFFFF; this.pending = false; this.m1 = false; this.m2 = false; }
  command(blips) {
    const L = this.ldp; blips &= 0x3FF;
    if (blips === this.old) return;
    this.old = blips;
    if ((blips & 0x383) !== 0x80) return;
    const c = (blips & 0x7C) >> 2;
    const DIG = { 0x1: 0, 0x11: 1, 0x9: 2, 0x19: 3, 0x5: 4, 0x15: 5, 0xD: 6, 0x1D: 7, 0x3: 8, 0x13: 9 };
    if (c in DIG) { if (this.seekReceived && this.digits.length < 5) this.digits += DIG[c]; else if (this.seekReceived) this.digits = ''; return; }
    switch (c) {
      case 0x14: L.play(); break;
      case 0x04: L.stepForward(); break;
      case 0x12: L.stepBackward(); break;
      case 0x0A: L.pause(); break;
      case 0x0E: this.m1 = !this.m1; L.audio1 = !this.m1; break;
      case 0x16: this.m2 = !this.m2; L.audio2 = !this.m2; break;
      case 0x1A:
        if (!this.seekReceived) this.seekReceived = true;
        else {
          if (this.digits.length && L.status !== LDP_SEARCHING) { this.pending = true; L.search(this.digits, false); }
          this.digits = '';
        }
        break;
    }
  }
  currentFrame() {
    const L = this.ldp;
    if (L.status === LDP_PLAYING || L.status === LDP_PAUSED) { this.pending = false; return L.curFrame; }
    if (this.pending && L.status !== LDP_SEARCHING) this.pending = false;
    return 0;
  }
}

/* ------------------------------------------------------------------ CRC32 */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

/* ------------------------------------------------------------- zip reader */
async function inflateRaw(u8) {
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('deflate-raw');
    const buf = await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(buf);
  }
  if (typeof require !== 'undefined') return new Uint8Array(require('zlib').inflateRawSync(Buffer.from(u8)));
  throw new Error('Este navegador no soporta DecompressionStream');
}
async function readZip(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('zip inválido');
  const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const out = [];
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const crc = dv.getUint32(p + 16, true) >>> 0;
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + el + cl;
    if (name.endsWith('/')) continue;
    const lnl = dv.getUint16(lho + 26, true), lel = dv.getUint16(lho + 28, true);
    const data = u8.subarray(lho + 30 + lnl + lel, lho + 30 + lnl + lel + csize);
    out.push({ name, crc, usize, method, data });
  }
  return out;
}
async function unzipEntry(e) {
  if (e.method === 0) return e.data.slice();
  if (e.method === 8) return await inflateRaw(e.data);
  throw new Error('método zip no soportado ' + e.method);
}

/* ---------------------------------------------------------- ROM library */
class RomLibrary {
  constructor() { this.sets = {}; this.byCrc = new Map(); this.ready = false; }
  static norm(n) { return n.toLowerCase().replace(/\s*\(\d+\)/, '').replace(/\.zip$/, ''); }
  /* zips: {nombre.zip: Uint8Array}; los zip anidados también se indexan */
  async load(zips) {
    const walk = async (zname, u8, prefix) => {
      let entries; try { entries = await readZip(u8); } catch (e) { return; }
      const set = RomLibrary.norm(zname);
      for (const e of entries) {
        const base = e.name.split('/').pop();
        if (/\.zip$/i.test(base)) { await walk(base, await unzipEntry(e), set); continue; }
        const sub = e.name.includes('/') ? e.name.split('/').slice(-2, -1)[0].toLowerCase() : null;
        const rec = { set, sub, name: base.toLowerCase(), crc: e.crc, size: e.usize, entry: e, data: null };
        (this.sets[set] = this.sets[set] || []).push(rec);
        if (sub) (this.sets[sub] = this.sets[sub] || []).push(rec);
        if (!this.byCrc.has(e.crc)) this.byCrc.set(e.crc, rec);
      }
    };
    for (const k in zips) await walk(k, zips[k], null);
    this.ready = true;
  }
  async get(rec) { if (!rec.data) rec.data = await unzipEntry(rec.entry); return rec.data; }
  find(name, crc, set, parent) {
    name = name.toLowerCase();
    for (const s of [set, parent]) {
      if (!s || !this.sets[s]) continue;
      const hit = this.sets[s].find(r => r.name === name) || this.sets[s].find(r => r.crc === crc);
      if (hit) return hit;
    }
    return this.byCrc.get(crc) || null;
  }
  /* carga un romset usando las definiciones extraídas de Hypseus */
  async loadSet(setName, defs, regions) {
    const missing = [], loaded = [];
    for (const [name, parent, region, offExpr, size, crcHex] of defs) {
      const crc = parseInt(crcHex, 16) >>> 0;
      const rec = this.find(name, crc, setName, parent);
      if (!rec) { missing.push(name); continue; }
      const data = await this.get(rec);
      const tgt = regions[region];
      if (!tgt) continue;
      const off = parseInt(offExpr, 16) || parseInt(offExpr, 10) || 0;
      tgt.set(data.subarray(0, Math.min(size, data.length, tgt.length - off)), off);
      loaded.push(name + (rec.crc === crc ? '' : ' (crc≠)'));
    }
    return { missing, loaded };
  }
}

/* ------------------------------------------------------- helpers de video */
function paletteRGB(prom, i, bits) { /* bits: [[r0,r1,r2],[g...],[b...]] con pesos 0x21,0x47,0x97 */
  const v = prom[i], w = [0x21, 0x47, 0x97];
  return bits.map(ch => ch.reduce((s, b, k) => s + (b < 0 ? 0 : ((v >> b) & 1) * w[k]), 0));
}
