'use strict';
const SRCORE = {};
// Motorola 6809 / 6809E CPU core — Star Rider emulator
// Cycle-counted, full instruction set incl. pages $10/$11, IRQ/FIRQ/NMI, CWAI, SYNC.
(function (root) {
'use strict';
const CC_C = 1, CC_V = 2, CC_Z = 4, CC_N = 8, CC_I = 16, CC_H = 32, CC_F = 64, CC_E = 128;

// base cycle table page 0 (from Motorola datasheet); indexed adds extra
const CYC = [
 6,6,2,6,6,2,6,6,6,6,6,2,6,6,3,6, 0,0,2,4,2,2,5,9,2,3,3,2,3,2,8,6,
 3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3, 4,4,4,4,5,5,5,5,2,5,3,6,20,11,2,19,
 2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2, 2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,
 6,6,6,6,6,6,6,6,6,6,6,6,6,6,3,6, 7,7,7,7,7,7,7,7,7,7,7,7,7,7,4,7,
 2,2,2,4,2,2,2,2,2,2,2,2,4,7,3,2, 4,4,4,6,4,4,4,4,4,4,4,4,6,7,5,5,
 4,4,4,6,4,4,4,4,4,4,4,4,6,7,5,5, 5,5,5,7,5,5,5,5,5,5,5,5,7,8,6,6,
 2,2,2,4,2,2,2,2,2,2,2,2,3,2,3,2, 4,4,4,6,4,4,4,4,4,4,4,4,5,5,5,5,
 4,4,4,6,4,4,4,4,4,4,4,4,5,5,5,5, 5,5,5,7,5,5,5,5,5,5,5,5,6,6,6,6];

class CPU6809 {
  constructor(read, write, name) {
    this.read = read; this.write = write; this.name = name || 'cpu';
    this.reset0();
  }
  reset0() {
    this.a = 0; this.b = 0; this.x = 0; this.y = 0; this.u = 0; this.s = 0;
    this.dp = 0; this.cc = CC_I | CC_F; this.pc = 0;
    this.irqLine = 0; this.firqLine = 0; this.nmiPending = 0; this.nmiArmed = false;
    this.cwai = false; this.sync = false; this.cycles = 0; this.halted = false;
    this.extra = 0; this.illegal = 0;
  }
  reset() { this.reset0(); this.pc = this.rw(0xFFFE); }
  get d() { return (this.a << 8) | this.b; }
  set d(v) { this.a = (v >> 8) & 0xFF; this.b = v & 0xFF; }
  rb(a) { return this.read(a & 0xFFFF) & 0xFF; }
  wb(a, v) { this.write(a & 0xFFFF, v & 0xFF); }
  rw(a) { return (this.rb(a) << 8) | this.rb(a + 1); }
  ww(a, v) { this.wb(a, v >> 8); this.wb(a + 1, v); }
  fb() { const v = this.rb(this.pc); this.pc = (this.pc + 1) & 0xFFFF; return v; }
  fw() { const v = this.rw(this.pc); this.pc = (this.pc + 2) & 0xFFFF; return v; }
  pushS(v) { this.s = (this.s - 1) & 0xFFFF; this.wb(this.s, v); }
  pushSW(v) { this.pushS(v & 0xFF); this.pushS(v >> 8); }
  pullS() { const v = this.rb(this.s); this.s = (this.s + 1) & 0xFFFF; return v; }
  pullSW() { const h = this.pullS(); return (h << 8) | this.pullS(); }
  pushU(v) { this.u = (this.u - 1) & 0xFFFF; this.wb(this.u, v); }
  pushUW(v) { this.pushU(v & 0xFF); this.pushU(v >> 8); }
  pullU() { const v = this.rb(this.u); this.u = (this.u + 1) & 0xFFFF; return v; }
  pullUW() { const h = this.pullU(); return (h << 8) | this.pullU(); }

  // flag helpers
  nz8(r) { this.cc &= ~(CC_N | CC_Z); if (r & 0x80) this.cc |= CC_N; if (!(r & 0xFF)) this.cc |= CC_Z; }
  nz16(r) { this.cc &= ~(CC_N | CC_Z); if (r & 0x8000) this.cc |= CC_N; if (!(r & 0xFFFF)) this.cc |= CC_Z; }
  add8(a, b, c) { const r = a + b + c; this.cc &= ~(CC_H | CC_N | CC_Z | CC_V | CC_C);
    if (((a ^ b ^ r) & 0x10)) this.cc |= CC_H; if (r & 0x100) this.cc |= CC_C;
    if ((~(a ^ b) & (a ^ r)) & 0x80) this.cc |= CC_V; this.nzq(r); return r & 0xFF; }
  sub8(a, b, c) { const r = a - b - c; this.cc &= ~(CC_N | CC_Z | CC_V | CC_C);
    if (r & 0x100) this.cc |= CC_C; if (((a ^ b) & (a ^ r)) & 0x80) this.cc |= CC_V; this.nzq(r); return r & 0xFF; }
  nzq(r) { if (r & 0x80) this.cc |= CC_N; if (!(r & 0xFF)) this.cc |= CC_Z; }
  add16(a, b) { const r = a + b; this.cc &= ~(CC_N | CC_Z | CC_V | CC_C);
    if (r & 0x10000) this.cc |= CC_C; if ((~(a ^ b) & (a ^ r)) & 0x8000) this.cc |= CC_V;
    if (r & 0x8000) this.cc |= CC_N; if (!(r & 0xFFFF)) this.cc |= CC_Z; return r & 0xFFFF; }
  sub16(a, b) { const r = a - b; this.cc &= ~(CC_N | CC_Z | CC_V | CC_C);
    if (r & 0x10000) this.cc |= CC_C; if (((a ^ b) & (a ^ r)) & 0x8000) this.cc |= CC_V;
    if (r & 0x8000) this.cc |= CC_N; if (!(r & 0xFFFF)) this.cc |= CC_Z; return r & 0xFFFF; }
  ld8(v) { this.cc &= ~CC_V; this.nz8(v); return v; }
  ld16(v) { this.cc &= ~CC_V; this.nz16(v); return v; }

  // register access for TFR/EXG
  getR(n) { switch (n) { case 0: return this.d; case 1: return this.x; case 2: return this.y; case 3: return this.u;
    case 4: return this.s; case 5: return this.pc; case 8: return this.a; case 9: return this.b; case 10: return this.cc; case 11: return this.dp; default: return 0xFF; } }
  setR(n, v) { switch (n) { case 0: this.d = v & 0xFFFF; break; case 1: this.x = v & 0xFFFF; break; case 2: this.y = v & 0xFFFF; break;
    case 3: this.u = v & 0xFFFF; break; case 4: this.s = v & 0xFFFF; this.nmiArmed = true; break; case 5: this.pc = v & 0xFFFF; break;
    case 8: this.a = v & 0xFF; break; case 9: this.b = v & 0xFF; break; case 10: this.cc = v & 0xFF; break; case 11: this.dp = v & 0xFF; break; } }

  // addressing
  dir() { return (this.dp << 8) | this.fb(); }
  ext() { return this.fw(); }
  idx() {
    const pb = this.fb(); let rr = (pb >> 5) & 3; let reg;
    const gr = () => rr === 0 ? this.x : rr === 1 ? this.y : rr === 2 ? this.u : this.s;
    const sr = (v) => { v &= 0xFFFF; if (rr === 0) this.x = v; else if (rr === 1) this.y = v; else if (rr === 2) this.u = v; else this.s = v; };
    if (!(pb & 0x80)) { let off = pb & 0x1F; if (off & 0x10) off -= 32; this.extra += 1; return (gr() + off) & 0xFFFF; }
    let ea; const ind = pb & 0x10;
    switch (pb & 0x0F) {
      case 0: reg = gr(); ea = reg; sr(reg + 1); this.extra += 2; break;
      case 1: reg = gr(); ea = reg; sr(reg + 2); this.extra += 3; break;
      case 2: reg = (gr() - 1) & 0xFFFF; sr(reg); ea = reg; this.extra += 2; break;
      case 3: reg = (gr() - 2) & 0xFFFF; sr(reg); ea = reg; this.extra += 3; break;
      case 4: ea = gr(); break;
      case 5: { let o = this.b; if (o & 0x80) o -= 256; ea = (gr() + o) & 0xFFFF; this.extra += 1; break; }
      case 6: { let o = this.a; if (o & 0x80) o -= 256; ea = (gr() + o) & 0xFFFF; this.extra += 1; break; }
      case 8: { let o = this.fb(); if (o & 0x80) o -= 256; ea = (gr() + o) & 0xFFFF; this.extra += 1; break; }
      case 9: { const o = this.fw(); ea = (gr() + o) & 0xFFFF; this.extra += 4; break; }
      case 11: ea = (gr() + this.d) & 0xFFFF; this.extra += 4; break;
      case 12: { let o = this.fb(); if (o & 0x80) o -= 256; ea = (this.pc + o) & 0xFFFF; this.extra += 1; break; }
      case 13: { const o = this.fw(); ea = (this.pc + o) & 0xFFFF; this.extra += 5; break; }
      case 15: ea = this.fw(); this.extra += 2; break;
      default: ea = gr(); this.illegal++; break;
    }
    if (ind) { ea = this.rw(ea); this.extra += 3; }
    return ea;
  }
  // effective address by mode group (opcode bits 4-5): 0=imm,1=dir,2=idx,3=ext
  ea(mode) { return mode === 1 ? this.dir() : mode === 2 ? this.idx() : this.ext(); }
  op8(mode) { return mode === 0 ? this.fb() : this.rb(this.ea(mode)); }
  op16(mode) { return mode === 0 ? this.fw() : this.rw(this.ea(mode)); }

  // RMW ops (NEG etc) — returns result
  rmw(op, v) {
    let r;
    switch (op) {
      case 0x0: r = (-v) & 0xFF; this.cc &= ~(CC_N | CC_Z | CC_V | CC_C); if (v === 0x80) this.cc |= CC_V; if (v) this.cc |= CC_C; this.nzq(r); return r;
      case 0x3: r = (~v) & 0xFF; this.cc &= ~(CC_N | CC_Z | CC_V); this.cc |= CC_C; this.nzq(r); return r;
      case 0x4: r = v >> 1; this.cc &= ~(CC_N | CC_Z | CC_C); if (v & 1) this.cc |= CC_C; this.nzq(r); return r;
      case 0x6: r = (v >> 1) | ((this.cc & CC_C) << 7); this.cc &= ~(CC_N | CC_Z | CC_C); if (v & 1) this.cc |= CC_C; this.nzq(r); return r;
      case 0x7: r = (v >> 1) | (v & 0x80); this.cc &= ~(CC_N | CC_Z | CC_C); if (v & 1) this.cc |= CC_C; this.nzq(r); return r;
      case 0x8: r = (v << 1) & 0xFF; this.cc &= ~(CC_N | CC_Z | CC_V | CC_C); if (v & 0x80) this.cc |= CC_C; if ((v ^ (v << 1)) & 0x80) this.cc |= CC_V; this.nzq(r); return r;
      case 0x9: r = ((v << 1) | (this.cc & CC_C)) & 0xFF; this.cc &= ~(CC_N | CC_Z | CC_V | CC_C); if (v & 0x80) this.cc |= CC_C; if ((v ^ (v << 1)) & 0x80) this.cc |= CC_V; this.nzq(r); return r;
      case 0xA: r = (v - 1) & 0xFF; this.cc &= ~(CC_N | CC_Z | CC_V); if (v === 0x80) this.cc |= CC_V; this.nzq(r); return r;
      case 0xC: r = (v + 1) & 0xFF; this.cc &= ~(CC_N | CC_Z | CC_V); if (v === 0x7F) this.cc |= CC_V; this.nzq(r); return r;
      case 0xD: this.cc &= ~(CC_N | CC_Z | CC_V); this.nzq(v); return -1;
      case 0xF: this.cc &= ~(CC_N | CC_Z | CC_V | CC_C); this.cc |= CC_Z; return 0;
      default: this.illegal++; return -1;
    }
  }
  cond(c) {
    const cc = this.cc, C = cc & 1, V = (cc >> 1) & 1, Z = (cc >> 2) & 1, N = (cc >> 3) & 1;
    switch (c) {
      case 0: return true; case 1: return false; case 2: return !(C | Z); case 3: return !!(C | Z);
      case 4: return !C; case 5: return !!C; case 6: return !Z; case 7: return !!Z;
      case 8: return !V; case 9: return !!V; case 10: return !N; case 11: return !!N;
      case 12: return !(N ^ V); case 13: return !!(N ^ V); case 14: return !((N ^ V) | Z); case 15: return !!((N ^ V) | Z);
    }
  }
  pushAll() { this.pushSW(this.pc); this.pushSW(this.u); this.pushSW(this.y); this.pushSW(this.x);
    this.pushS(this.dp); this.pushS(this.b); this.pushS(this.a); this.pushS(this.cc); }

  nmi() { this.nmiPending = 1; }
  // service interrupts; returns cycles used
  checkInts() {
    if (this.nmiPending && this.nmiArmed) {
      this.nmiPending = 0; this.sync = false;
      if (!this.cwai) { this.cc |= CC_E; this.pushAll(); }
      this.cwai = false; this.cc |= CC_I | CC_F; this.pc = this.rw(0xFFFC); return 19;
    }
    if (this.firqLine && !(this.cc & CC_F)) {
      this.sync = false;
      if (this.cwai) { this.cwai = false; } else { this.cc &= ~CC_E; this.pushSW(this.pc); this.pushS(this.cc); }
      this.cc |= CC_I | CC_F; this.pc = this.rw(0xFFF6); return 10;
    }
    if (this.irqLine && !(this.cc & CC_I)) {
      this.sync = false;
      if (this.cwai) { this.cwai = false; } else { this.cc |= CC_E; this.pushAll(); }
      this.cc |= CC_I; this.pc = this.rw(0xFFF8); return 19;
    }
    if (this.sync && (this.irqLine || this.firqLine || this.nmiPending)) this.sync = false;
    return 0;
  }

  // execute one instruction; returns cycles
  step() {
    const ic = this.checkInts(); if (ic) return ic;
    if (this.cwai || this.sync) return 4;
    this.extra = 0;
    const op = this.fb();
    let cyc = CYC[op];
    const hi = op >> 4, lo = op & 0xF;
    let ea, v, r, t;
    if (op < 0x10 || (op >= 0x40 && op < 0x80)) {
      // RMW group
      if (op < 0x10) { ea = this.dir(); if (lo === 0xE) { this.pc = ea; return cyc; } v = this.rb(ea); r = this.rmw(lo, v); if (r >= 0 && lo !== 0xD) this.wb(ea, r); return cyc; }
      if (hi === 4) { r = this.rmw(lo, this.a); if (r >= 0) this.a = r; return cyc; }
      if (hi === 5) { r = this.rmw(lo, this.b); if (r >= 0) this.b = r; return cyc; }
      if (hi === 6) { ea = this.idx(); if (lo === 0xE) { this.pc = ea; return cyc + this.extra; } v = this.rb(ea); r = this.rmw(lo, v); if (r >= 0 && lo !== 0xD) this.wb(ea, r); return cyc + this.extra; }
      ea = this.ext(); if (lo === 0xE) { this.pc = ea; return cyc; } v = this.rb(ea); r = this.rmw(lo, v); if (r >= 0 && lo !== 0xD) this.wb(ea, r); return cyc;
    }
    if (hi === 2) { let o = this.fb(); if (o & 0x80) o -= 256; if (this.cond(lo)) this.pc = (this.pc + o) & 0xFFFF; return cyc; }
    if (op >= 0x80) {
      const mode = (op >> 4) & 3; const isB = op >= 0xC0;
      switch (lo) {
        case 0x0: v = this.op8(mode); if (isB) this.b = this.sub8(this.b, v, 0); else this.a = this.sub8(this.a, v, 0); break;
        case 0x1: v = this.op8(mode); this.sub8(isB ? this.b : this.a, v, 0); break;
        case 0x2: v = this.op8(mode); if (isB) this.b = this.sub8(this.b, v, this.cc & 1); else this.a = this.sub8(this.a, v, this.cc & 1); break;
        case 0x3: v = this.op16(mode); if (isB) this.d = this.add16(this.d, v); else this.d = this.sub16(this.d, v); break;
        case 0x4: v = this.op8(mode); if (isB) this.b = this.ld8(this.b & v); else this.a = this.ld8(this.a & v); break;
        case 0x5: v = this.op8(mode); this.ld8((isB ? this.b : this.a) & v); break;
        case 0x6: v = this.op8(mode); if (isB) this.b = this.ld8(v); else this.a = this.ld8(v); break;
        case 0x7: if (mode === 0) { this.illegal++; break; } ea = this.ea(mode); v = isB ? this.b : this.a; this.ld8(v); this.wb(ea, v); break;
        case 0x8: v = this.op8(mode); if (isB) this.b = this.ld8(this.b ^ v); else this.a = this.ld8(this.a ^ v); break;
        case 0x9: v = this.op8(mode); if (isB) this.b = this.add8(this.b, v, this.cc & 1); else this.a = this.add8(this.a, v, this.cc & 1); break;
        case 0xA: v = this.op8(mode); if (isB) this.b = this.ld8(this.b | v); else this.a = this.ld8(this.a | v); break;
        case 0xB: v = this.op8(mode); if (isB) this.b = this.add8(this.b, v, 0); else this.a = this.add8(this.a, v, 0); break;
        case 0xC: v = this.op16(mode); if (isB) this.d = this.ld16(v); else this.sub16(this.x, v); break;
        case 0xD: if (isB) { if (mode === 0) { this.illegal++; break; } ea = this.ea(mode); this.ld16(this.d); this.ww(ea, this.d); }
          else if (mode === 0) { let o = this.fb(); if (o & 0x80) o -= 256; this.pushSW(this.pc); this.pc = (this.pc + o) & 0xFFFF; }
          else { ea = this.ea(mode); this.pushSW(this.pc); this.pc = ea; } break;
        case 0xE: v = this.op16(mode); if (isB) this.u = this.ld16(v); else this.x = this.ld16(v); break;
        case 0xF: if (mode === 0) { this.illegal++; break; } ea = this.ea(mode); v = isB ? this.u : this.x; this.ld16(v); this.ww(ea, v); break;
      }
      return cyc + this.extra;
    }
    // misc 0x10-0x1F, 0x30-0x3F
    switch (op) {
      case 0x10: return this.page2();
      case 0x11: return this.page3();
      case 0x12: return cyc;
      case 0x13: this.sync = true; return cyc;
      case 0x16: t = this.fw(); this.pc = (this.pc + t) & 0xFFFF; return cyc;
      case 0x17: t = this.fw(); this.pushSW(this.pc); this.pc = (this.pc + t) & 0xFFFF; return cyc;
      case 0x19: { let a = this.a, c = 0; const lsn = a & 0xF, msn = a >> 4;
        if (lsn > 9 || (this.cc & CC_H)) c |= 0x06;
        if (msn > 9 || (this.cc & CC_C) || (msn > 8 && lsn > 9)) c |= 0x60;
        r = a + c; this.cc &= ~(CC_N | CC_Z | CC_V); if (r & 0x100) this.cc |= CC_C; this.a = r & 0xFF; this.nzq(this.a); return cyc; }
      case 0x1A: this.cc |= this.fb(); return cyc;
      case 0x1C: this.cc &= this.fb(); return cyc;
      case 0x1D: this.a = (this.b & 0x80) ? 0xFF : 0; this.cc &= ~CC_V; this.nz16(this.d); return cyc;
      case 0x1E: { const pb = this.fb(); const r1 = pb >> 4, r2 = pb & 0xF; const v1 = this.getR(r1), v2 = this.getR(r2);
        const w1 = r1 < 8, w2 = r2 < 8;
        this.setR(r1, w2 && !w1 ? v2 & 0xFF : (!w2 && w1 ? 0xFF00 | v2 : v2)); this.setR(r2, w1 && !w2 ? v1 & 0xFF : (!w1 && w2 ? 0xFF00 | v1 : v1)); return cyc; }
      case 0x1F: { const pb = this.fb(); const r1 = pb >> 4, r2 = pb & 0xF; let v1 = this.getR(r1);
        if (r1 >= 8 && r2 < 8) v1 = 0xFF00 | v1; this.setR(r2, v1); return cyc; }
      case 0x30: this.x = this.idx(); this.cc &= ~CC_Z; if (!this.x) this.cc |= CC_Z; return cyc + this.extra;
      case 0x31: this.y = this.idx(); this.cc &= ~CC_Z; if (!this.y) this.cc |= CC_Z; return cyc + this.extra;
      case 0x32: this.s = this.idx(); this.nmiArmed = true; return cyc + this.extra;
      case 0x33: this.u = this.idx(); return cyc + this.extra;
      case 0x34: { const pb = this.fb(); let n = 0;
        if (pb & 0x80) { this.pushSW(this.pc); n += 2; } if (pb & 0x40) { this.pushSW(this.u); n += 2; }
        if (pb & 0x20) { this.pushSW(this.y); n += 2; } if (pb & 0x10) { this.pushSW(this.x); n += 2; }
        if (pb & 0x08) { this.pushS(this.dp); n++; } if (pb & 0x04) { this.pushS(this.b); n++; }
        if (pb & 0x02) { this.pushS(this.a); n++; } if (pb & 0x01) { this.pushS(this.cc); n++; } return cyc + n; }
      case 0x35: { const pb = this.fb(); let n = 0;
        if (pb & 0x01) { this.cc = this.pullS(); n++; } if (pb & 0x02) { this.a = this.pullS(); n++; }
        if (pb & 0x04) { this.b = this.pullS(); n++; } if (pb & 0x08) { this.dp = this.pullS(); n++; }
        if (pb & 0x10) { this.x = this.pullSW(); n += 2; } if (pb & 0x20) { this.y = this.pullSW(); n += 2; }
        if (pb & 0x40) { this.u = this.pullSW(); n += 2; } if (pb & 0x80) { this.pc = this.pullSW(); n += 2; } return cyc + n; }
      case 0x36: { const pb = this.fb(); let n = 0;
        if (pb & 0x80) { this.pushUW(this.pc); n += 2; } if (pb & 0x40) { this.pushUW(this.s); n += 2; }
        if (pb & 0x20) { this.pushUW(this.y); n += 2; } if (pb & 0x10) { this.pushUW(this.x); n += 2; }
        if (pb & 0x08) { this.pushU(this.dp); n++; } if (pb & 0x04) { this.pushU(this.b); n++; }
        if (pb & 0x02) { this.pushU(this.a); n++; } if (pb & 0x01) { this.pushU(this.cc); n++; } return cyc + n; }
      case 0x37: { const pb = this.fb(); let n = 0;
        if (pb & 0x01) { this.cc = this.pullU(); n++; } if (pb & 0x02) { this.a = this.pullU(); n++; }
        if (pb & 0x04) { this.b = this.pullU(); n++; } if (pb & 0x08) { this.dp = this.pullU(); n++; }
        if (pb & 0x10) { this.x = this.pullUW(); n += 2; } if (pb & 0x20) { this.y = this.pullUW(); n += 2; }
        if (pb & 0x40) { this.s = this.pullUW(); n += 2; } if (pb & 0x80) { this.pc = this.pullUW(); n += 2; } return cyc + n; }
      case 0x39: this.pc = this.pullSW(); return cyc;
      case 0x3A: this.x = (this.x + this.b) & 0xFFFF; return cyc;
      case 0x3B: this.cc = this.pullS(); if (this.cc & CC_E) { this.a = this.pullS(); this.b = this.pullS(); this.dp = this.pullS();
        this.x = this.pullSW(); this.y = this.pullSW(); this.u = this.pullSW(); this.pc = this.pullSW(); return 15; }
        this.pc = this.pullSW(); return 6;
      case 0x3C: this.cc &= this.fb(); this.cc |= CC_E; this.pushAll(); this.cwai = true; return cyc;
      case 0x3D: r = this.a * this.b; this.d = r; this.cc &= ~(CC_Z | CC_C); if (!r) this.cc |= CC_Z; if (r & 0x80) this.cc |= CC_C; return cyc;
      case 0x3F: this.cc |= CC_E; this.pushAll(); this.cc |= CC_I | CC_F; this.pc = this.rw(0xFFFA); return cyc;
    }
    this.illegal++; return 2;
  }
  page2() {
    const op = this.fb();
    if (op >= 0x20 && op < 0x30) { const o = this.fw(); if (this.cond(op & 0xF)) { this.pc = (this.pc + o) & 0xFFFF; return 6; } return 5; }
    if (op === 0x3F) { this.cc |= CC_E; this.pushAll(); this.pc = this.rw(0xFFF4); return 20; }
    const mode = (op >> 4) & 3; const lo = op & 0xF; const hi = op >= 0xC0;
    const base = [5, 6, 6, 7][mode]; let ea, v;
    switch (lo) {
      case 0x3: v = this.op16(mode); this.sub16(this.d, v); return base + this.extra; // CMPD
      case 0xC: v = this.op16(mode); this.sub16(this.y, v); return base + this.extra; // CMPY
      case 0xE: v = this.op16(mode); if (hi) this.s = this.ld16(v), this.nmiArmed = true; else this.y = this.ld16(v); return base - 1 + this.extra;
      case 0xF: ea = this.ea(mode); v = hi ? this.s : this.y; this.ld16(v); this.ww(ea, v); return base - 1 + this.extra;
    }
    this.illegal++; return 2;
  }
  page3() {
    const op = this.fb();
    if (op === 0x3F) { this.cc |= CC_E; this.pushAll(); this.pc = this.rw(0xFFF2); return 20; }
    const mode = (op >> 4) & 3; const lo = op & 0xF; const base = [5, 6, 6, 7][mode]; let v;
    if (lo === 0x3) { v = this.op16(mode); this.sub16(this.u, v); return base + this.extra; }
    if (lo === 0xC) { v = this.op16(mode); this.sub16(this.s, v); return base + this.extra; }
    this.illegal++; return 2;
  }
}
CPU6809.CC = { C: CC_C, V: CC_V, Z: CC_Z, N: CC_N, I: CC_I, H: CC_H, F: CC_F, E: CC_E };
if (typeof module !== 'undefined') module.exports = CPU6809; else root.CPU6809 = CPU6809;
})(SRCORE);

// Motorola 6821 PIA — faithful register model (DDR, CRx flags, C1 edges, C2 in/out/pulse/handshake)
(function (root) {
'use strict';
class PIA6821 {
  constructor(name) {
    this.name = name || 'pia';
    this.inA = () => 0xFF; this.inB = () => 0xFF;   // external pin readers
    this.outA = null; this.outB = null;             // (value, ddr) callbacks
    this.ca2Out = null; this.cb2Out = null;         // (level) callbacks
    this.irqA = null; this.irqB = null;             // (state) callbacks
    this.reset();
  }
  reset() {
    this.ora = 0; this.orb = 0; this.ddra = 0; this.ddrb = 0; this.cra = 0; this.crb = 0;
    this.ca1 = 1; this.cb1 = 1; this.ca2 = 1; this.cb2 = 1; this.ca2o = 1; this.cb2o = 1;
    this.irqA1 = 0; this.irqA2 = 0; this.irqB1 = 0; this.irqB2 = 0;
    this.lastIrqA = -1; this.lastIrqB = -1; this.update();
  }
  pa() { return (this.ora & this.ddra) | (this.inA() & ~this.ddra & 0xFF); }
  pb() { return (this.orb & this.ddrb) | (this.inB() & ~this.ddrb & 0xFF); }
  update() {
    const ia = ((this.irqA1 && (this.cra & 1)) || (this.irqA2 && (this.cra & 8) && !(this.cra & 0x20))) ? 1 : 0;
    const ib = ((this.irqB1 && (this.crb & 1)) || (this.irqB2 && (this.crb & 8) && !(this.crb & 0x20))) ? 1 : 0;
    if (ia !== this.lastIrqA) { this.lastIrqA = ia; if (this.irqA) this.irqA(ia); }
    if (ib !== this.lastIrqB) { this.lastIrqB = ib; if (this.irqB) this.irqB(ib); }
  }
  setCA2o(v) { if (v !== this.ca2o) { this.ca2o = v; if (this.ca2Out) this.ca2Out(v); } }
  setCB2o(v) { if (v !== this.cb2o) { this.cb2o = v; if (this.cb2Out) this.cb2Out(v); } }
  read(off) {
    switch (off & 3) {
      case 0:
        if (this.cra & 4) {
          const v = this.pa(); this.irqA1 = 0; this.irqA2 = 0; this.update();
          // CA2 read strobe/handshake modes
          if ((this.cra & 0x38) === 0x20) { this.setCA2o(0); } // handshake: low until CA1 active
          else if ((this.cra & 0x38) === 0x28) { this.setCA2o(0); this.setCA2o(1); } // pulse
          return v;
        }
        return this.ddra;
      case 1: return (this.cra & 0x3F) | (this.irqA1 ? 0x80 : 0) | (this.irqA2 && !(this.cra & 0x20) ? 0x40 : 0);
      case 2:
        if (this.crb & 4) { const v = this.pb(); this.irqB1 = 0; this.irqB2 = 0; this.update(); return v; }
        return this.ddrb;
      case 3: return (this.crb & 0x3F) | (this.irqB1 ? 0x80 : 0) | (this.irqB2 && !(this.crb & 0x20) ? 0x40 : 0);
    }
  }
  // non-destructive peek (debug)
  peek(off) { switch (off & 3) { case 0: return this.cra & 4 ? this.pa() : this.ddra; case 1: return (this.cra & 0x3F) | (this.irqA1 ? 0x80 : 0);
    case 2: return this.crb & 4 ? this.pb() : this.ddrb; case 3: return (this.crb & 0x3F) | (this.irqB1 ? 0x80 : 0); } }
  write(off, v) {
    v &= 0xFF;
    switch (off & 3) {
      case 0: if (this.cra & 4) { this.ora = v; if (this.outA) this.outA(this.pa(), this.ddra); } else { this.ddra = v; if (this.outA) this.outA(this.pa(), this.ddra); } break;
      case 1: this.cra = v & 0x3F; this.ctl2('A'); this.update(); break;
      case 2:
        if (this.crb & 4) {
          this.orb = v; if (this.outB) this.outB(this.pb(), this.ddrb);
          if ((this.crb & 0x38) === 0x20) this.setCB2o(0);             // handshake on write
          else if ((this.crb & 0x38) === 0x28) { this.setCB2o(0); this.setCB2o(1); } // pulse on write
        } else { this.ddrb = v; if (this.outB) this.outB(this.pb(), this.ddrb); }
        break;
      case 3: this.crb = v & 0x3F; this.ctl2('B'); this.update(); break;
    }
  }
  ctl2(p) {
    const cr = p === 'A' ? this.cra : this.crb;
    if (cr & 0x20) { // output
      if (cr & 0x10) { const lvl = (cr >> 3) & 1; if (p === 'A') this.setCA2o(lvl); else this.setCB2o(lvl); }
      else { /* handshake/pulse mode: idle high */ if (p === 'A') this.setCA2o(1); else this.setCB2o(1); }
    }
  }
  setCA1(v) { v = v ? 1 : 0; if (v === this.ca1) return; const rising = v > this.ca1; this.ca1 = v;
    if ((this.cra & 2) ? rising : !rising) { this.irqA1 = 1; if ((this.cra & 0x38) === 0x20) this.setCA2o(1); this.update(); } }
  setCB1(v) { v = v ? 1 : 0; if (v === this.cb1) return; const rising = v > this.cb1; this.cb1 = v;
    if ((this.crb & 2) ? rising : !rising) { this.irqB1 = 1; if ((this.crb & 0x38) === 0x20) this.setCB2o(1); this.update(); } }
  setCA2(v) { v = v ? 1 : 0; if (v === this.ca2) return; const rising = v > this.ca2; this.ca2 = v;
    if (!(this.cra & 0x20) && ((this.cra & 0x10) ? rising : !rising)) { this.irqA2 = 1; this.update(); } }
  setCB2(v) { v = v ? 1 : 0; if (v === this.cb2) return; const rising = v > this.cb2; this.cb2 = v;
    if (!(this.crb & 0x20) && ((this.crb & 0x10) ? rising : !rising)) { this.irqB2 = 1; this.update(); } }
  pulseCA1() { this.setCA1(this.cra & 2 ? 0 : 1); this.setCA1(this.cra & 2 ? 1 : 0); }
}
if (typeof module !== 'undefined') module.exports = PIA6821; else root.PIA6821 = PIA6821;
})(SRCORE);

// Star Rider (Williams 1983) — DISCAN system emulation core
// Boards: CPU (6809E + 2x6821), VGG (6821, SC2 blitters, color RAM, Manchester decoder),
// ROM board (19 image ROMs + text ROM, color translation PROMs), PIF (6809 + 6821),
// PR-8210A laserdisc model, Sound board (68B09E + 2x68B21 + 68B40 + 2x2812 FIFO + 1408 DACs + 4 attenuators)
(function (root) {
'use strict';
const CPU6809 = root.CPU6809 || (typeof require !== 'undefined' && require('./cpu6809.js'));
const PIA6821 = root.PIA6821 || (typeof require !== 'undefined' && require('./pia6821.js'));

// ---------------------------------------------------------------- 6840 PTM (enough for continuous mode)
class PTM6840 {
  constructor() { this.reset(); this.onOut = null; this.onIrq = null; }
  reset() { this.cr = [0, 1, 0]; this.latch = [0xFFFF, 0xFFFF, 0xFFFF]; this.cnt = [0xFFFF, 0xFFFF, 0xFFFF];
    this.out = [0, 0, 0]; this.flag = [0, 0, 0]; this.msb = 0; this.lsbBuf = 0; this.status = 0; this.irq = 0; }
  write(off, v) {
    off &= 7;
    if (off === 0) { if (this.cr[1] & 1) { this.cr[0] = v; } else this.cr[2] = v; }
    else if (off === 1) this.cr[1] = v;
    else if (off & 1) { // LSB write -> latch transfer
      const t = (off - 3) >> 1; this.latch[t] = (this.msb << 8) | v;
      if (!(this.cr[t] & 0x10) || true) { this.cnt[t] = this.latch[t]; }
      this.flag[t] = 0; this.updIrq();
    } else this.msb = v; // MSB buffer (offsets 2,4,6)
    if (off <= 1 && (this.cr[0] & 1)) { /* internal reset: hold counters */ for (let i = 0; i < 3; i++) this.cnt[i] = this.latch[i]; }
  }
  read(off) {
    off &= 7;
    if (off === 1) { const s = (this.flag[0] ? 1 : 0) | (this.flag[1] ? 2 : 0) | (this.flag[2] ? 4 : 0) | (this.irq ? 0x80 : 0); return s; }
    if (off === 0) return 0;
    if (off & 1) return this.lsbBuf;
    const t = (off - 2) >> 1; const c = this.cnt[t]; this.lsbBuf = c & 0xFF; this.flag[t] = 0; this.updIrq(); return c >> 8;
  }
  updIrq() { let i = 0; for (let t = 0; t < 3; t++) if (this.flag[t] && (this.cr[t] & 0x40)) i = 1; if (i !== this.irq) { this.irq = i; if (this.onIrq) this.onIrq(i); } }
  clock(cycles) {
    if (this.cr[0] & 1) return; // internal reset
    for (let t = 0; t < 2; t++) {           // timers 1,2 are the DAC clocks; timer 3 unused here
      if (!(this.cr[t] & 2)) continue;       // external clock: not wired
      let c = this.cnt[t] - cycles;
      while (c < 0) {
        c += this.latch[t] + 1;
        this.out[t] ^= 1; this.flag[t] = 1;
        if (this.onOut) this.onOut(t, this.out[t]);
      }
      this.cnt[t] = c;
    }
    this.updIrq();
  }
}

// ---------------------------------------------------------------- 2812 FIFO (32 x 8)
class FIFO2812 { constructor() { this.buf = new Uint8Array(32); this.r = 0; this.n = 0; this.out = 0x80; }
  write(v) { if (this.n < 32) { this.buf[(this.r + this.n) & 31] = v; this.n++; } }
  shift() { if (this.n > 0) { this.out = this.buf[this.r]; this.r = (this.r + 1) & 31; this.n--; } }
  reset() { this.r = 0; this.n = 0; } }

// ---------------------------------------------------------------- PR-8210A laserdisc model
class PR8210A {
  constructor() {
    this.frame = 0; this.playing = false; this.seekFields = 0; this.standby = 0; this.fieldCount = 0;
    this.lastRemote = 0; this.lastRemoteCyc = 0; this.gaps = []; this.cmdLog = []; this.digits = []; this.inSearch = false;
    this.lastDigit = -1; this.lastCmd = -1; this.jumps = 0; this.audioMute = false; this.maxFrame = 54000;
  }
  // remote-control line (active-low pulses); cyc = PIF CPU cycle timestamp
  remote(level, cyc) {
    if (level === this.lastRemote) return; this.lastRemote = level;
    if (!level) return;                        // count rising edges (end of each pulse)
    const gap = cyc - this.lastRemoteCyc; this.lastRemoteCyc = cyc;
    if (gap > 4000) { this.gaps = []; return; } // start of new word
    this.gaps.push(gap);
    if (this.gaps.length === 10) {
      let b = 0; for (let i = 2; i < 10; i++) b = (b << 1) | (this.gaps[i] > 1300 ? 1 : 0);
      this.gaps = []; this.onByte(b);
    }
  }
  onByte(b) {
    const DIG = [0x84, 0xC4, 0xA4, 0xE4, 0x94, 0xD4, 0xB4, 0xF4, 0x8C, 0xCC];
    if (this.cmdLog.length > 64) this.cmdLog.shift(); this.cmdLog.push(b);
    if (b === 0x80) { this.lastDigit = -1; return; }
    const d = DIG.indexOf(b);
    if (d >= 0) { if (this.inSearch && d !== this.lastDigit) this.digits.push(d); this.lastDigit = d; this.lastCmd = -1; return; }
    if (b === this.lastCmd) return;   // commands are sent 3x
    this.lastCmd = b; this.lastDigit = -1;
    switch (b) {
      case 0xE8: // SEARCH delimiter
        if (!this.inSearch) { this.inSearch = true; this.digits = []; }
        else if (this.digits.length) {
          this.inSearch = false; let n = 0; for (const x of this.digits) n = n * 10 + x;
          this.seek(n); this.digits = [];
        }
        break;
      case 0xD0: this.playing = true; break;            // PLAY
      case 0xAC: break;                                  // FRAME DISPLAY toggle
      default: break;                                    // step/reject/audio: tolerated
    }
  }
  seek(n) { this.target = Math.max(0, Math.min(this.maxFrame, n)); this.seekFields = 18; this.playing = false; this.lastSeek = this.target; }
  jumpTrigger(fwd) { if (this.seekFields) return; this.frame += fwd ? 1 : -1; if (this.frame < 0) this.frame = 0; this.jumps++; }
  // called at every field vsync
  field(odd) {
    this.fieldCount++;
    if (this.seekFields > 0) {
      this.seekFields--; this.standby = (this.seekFields & 4) ? 1 : 0;
      if (this.seekFields === 0) { this.frame = this.target; this.standby = 0; }
      return;
    }
    this.standby = 0;
    if (this.playing && odd) { this.frame++; if (this.frame > this.maxFrame) this.frame = this.maxFrame; }
  }
}

// ---------------------------------------------------------------- the machine
class StarRider {
  constructor(roms) {
    const R = (n) => roms[n] || null;
    this.rom30 = R('rom_30.u8'); this.rom31 = R('rom_31.u15'); this.rom32 = R('rom_32.u26');
    this.rom34 = R('rom_34.u45'); this.rom35 = R('rom_35.u52');
    this.img = []; for (let i = 1; i <= 19; i++) this.img[i] = R(['', 'rom_1.u4', 'rom_2.u19', 'rom_3.u5', 'rom_4.u20', 'rom_5.u6', 'rom_6.u21', 'rom_7.u7', 'rom_8.u22', 'rom_9.u8', 'rom_10.u23', 'rom_11.u9', 'rom_12.u24', 'rom_13.u10', 'rom_14.u25', 'rom_15.u11', 'rom_16.u26', 'rom_17.u12', 'rom_18.u27', 'rom_19.u13'][i]);
    this.textRom = R('rom_25.u46'); this.pifRom = R('rom_26.u3'); this.sndRom = R('rom_27.u11');
    this.xlatProm = R('u10.82s137'); this.u74 = R('u74.6349'); this.u114 = R('u114.82s123');
    this.vram = new Uint8Array(0xA000); this.ram = new Uint8Array(0x2000); this.ram2 = new Uint8Array(0x1000);
    this.colorRam = new Uint8Array(0x800); this.cmos = new Uint8Array(0x400).fill(0x0F);
    this.manchester = new Uint8Array(0x80);
    this.bank = 0; this.page = 0; this.xlate = 0; this.vctl = 0; this.palBank = 0; this.led = 0; this.expanderPort = 0;
    this.blit = new Uint8Array(8); this.blitStall = 0; this.blitCount = 0; this.blitLog = null;
    this.inputs = { coin: 0, steer: 32, throttle: 0, brake: 0, turbo: 0, hilo: 0, start1: 0, start2: 0, auto: 0, advance: 0, hsreset: 0, tilt: 0, memprot: 0 };
    this.line = 0; this.fieldOdd = 0; this.frameNo = 0; this.cmosDirty = false;
    this.ldFrameData = null;   // optional per-frame Manchester table (Uint8Array, 45 bytes/frame)
    this.ldPicOffset = 0;      // picture number = disc frame + offset
    this.watchdog = 0;
    this.stats = { main: 0, pif: 0, snd: 0, blits: 0, irq: 0, firq: 0, ledHist: [] };

    // ---- CPU board PIAs
    this.u10 = new PIA6821('U10 coin/sound'); this.u20 = new PIA6821('U20 steer/grip');
    this.vgg = new PIA6821('VGG'); this.pifPia = new PIA6821('PIF');
    this.snd1 = new PIA6821('SND cmd'); this.snd2 = new PIA6821('SND fifo');
    const inp = this.inputs;
    this.u10.inA = () => (inp.auto ? 1 : 0) | (inp.advance ? 2 : 0) | (inp.hsreset ? 4 : 0) | ((inp.coin & 1) ? 8 : 0) |
      ((inp.coin & 2) ? 16 : 0) | ((inp.coin & 4) ? 32 : 0) | (inp.tilt ? 64 : 0) | (inp.memprot ? 128 : 0);
    this.u10.inB = () => 0xFF;
    // Field-IRQ compensation: when the game's IRQ handler overruns one field (FIRQ beam-wait chains),
    // the read of $C980 at its end would swallow the next VSYNC edge. Re-latch it so no field is lost.
    this.vsyncCompensate = true; this.vsyncPending = 0; this.fieldQueue = []; this.fieldLatch = 0;
    const u10read = this.u10.read.bind(this.u10);
    this.u10.read = (o) => { const had = this.u10.irqA1; const v = u10read(o);
      if ((o & 3) === 0 && this.vsyncPending > 0 && (this.u10.cra & 4)) { this.vsyncPending--; this.u10.irqA1 = 1; this.u10.update(); } return v; };
    this.u20.inA = () => { const s = Math.max(0, Math.min(63, inp.steer | 0)); return (s ^ (s >> 1)) | (inp.start1 ? 0x40 : 0) | (inp.start2 ? 0x80 : 0); };
    this.u20.inB = () => { const t = Math.max(0, Math.min(15, inp.throttle | 0)); return (t ^ (t >> 1)) | (inp.brake >= 2 ? 0 : inp.brake === 1 ? 0x20 : 0x30) | (inp.turbo ? 0 : 0x40) | (inp.hilo ? 0 : 0x80); };

    // ---- CPUs
    this.main = new CPU6809((a) => this.mread(a), (a, v) => this.mwrite(a, v), 'main');
    // FIELD latch (CB90) advances with every field IRQ the CPU actually takes, so a late IRQ still sees its own field
    { const ci = this.main.checkInts.bind(this.main); const irqVec = (this.rom35[0x1FF8] << 8) | this.rom35[0x1FF9];
      this.main.checkInts = () => { const c = ci(); if (c && this.main.pc === irqVec) this.fieldLatch ^= 1; return c; }; }
    this.pif = new CPU6809((a) => this.pread(a), (a, v) => this.pwrite(a, v), 'pif');
    this.snd = new CPU6809((a) => this.sread(a), (a, v) => this.swrite(a, v), 'snd');
    this.pifRam = new Uint8Array(0x800); this.sndRam = new Uint8Array(0x1000);

    // IRQ wiring (main): IRQ = U10|U20|VGG-B ; FIRQ = VGG-A
    const updMainIrq = () => { this.main.irqLine = (this.u10.lastIrqA > 0 || this.u10.lastIrqB > 0 || this.u20.lastIrqA > 0 || this.u20.lastIrqB > 0 || this.vgg.lastIrqB > 0) ? 1 : 0; };
    this.u10.irqA = this.u10.irqB = this.u20.irqA = this.u20.irqB = this.vgg.irqB = () => updMainIrq();
    this.vgg.irqA = (s) => { this.main.firqLine = s; };
    // main -> sound: U10 port B data, CB2 strobe -> sound PIA CA1 ; sound CA2 -> U10 CB1 (ack)
    this.u10.cb2Out = (l) => this.snd1.setCA1(l);
    this.snd1.inA = () => this.u10.pb();
    this.snd1.ca2Out = (l) => this.u10.setCB1(l);
    this.snd1.irqA = (s) => { this.snd.firqLine = s; };
    this.snd1.irqB = () => {};
    // U20 CA2 -> sound reset? (kept as observed signal)
    this.u20.ca2Out = (l) => { this.sndResetLine = l; };
    // main VGG port B -> PIF port A, CB2 strobe -> PIF CA1 ; PIF CA2 -> VGG CB1
    this.pifPia.inA = () => this.vgg.pb();
    this.vgg.cb2Out = (l) => this.pifPia.setCA1(l);
    this.pifPia.ca2Out = (l) => this.vgg.setCB1(l);
    this.pifPia.irqA = (s) => { this.pif.firqLine = s; };
    this.pifPia.irqB = (s) => { this.pifIrqB = s; this.updPifIrq(); };
    this.vgg.outA = (v) => { this.expanderPort = v; };
    // PIF port B: PB0 jump trigger, PB1 scan-C, PB2 JT/SC control, PB3 remote, PB4 out, PB5 standby, PB6 field, PB7 vsync
    this.ld = new PR8210A();
    this.vsyncLevel = 0;
    this.pifPia.inB = () => (this.ld.standby ? 0x20 : 0) | (this.fieldOdd ? 0x40 : 0) | (this.vsyncLevel ? 0x80 : 0);
    this.lastPB = 0xFF;
    this.pifPia.outB = (v, ddr) => {
      const o = v | ~ddr;
      this.ld.remote((o >> 3) & 1 ? 0 : (o >> 4) & 1, this.pif.cycles);   // PB3 low = remote enabled, PB4 = remote data
      if ((this.lastPB & 1) && !(o & 1) && !(o & 4)) this.ld.jumpTrigger(!!(o & 2));
      this.lastPB = o;
    };
    this.pif4ms = 0; this.pifTimerIrq = 0;

    // ---- sound board
    this.ptm = new PTM6840(); this.fifo = [new FIFO2812(), new FIFO2812()];
    this.atten = [0, 0, 0, 0];
    this.ptm.onOut = (t, lvl) => { if (lvl) this.fifo[t].shift(); this.updFifoFlags(); };
    this.ptm.onIrq = (s) => { this.ptmIrq = s; this.updSndIrq(); };
    this.snd2.inB = () => (this.fifo[0].n < 16 ? 0 : 1) | (this.fifo[1].n < 16 ? 0 : 2) | 0xFC;
    this.snd2.inA = () => 0xFF;
    this.snd2.irqA = this.snd2.irqB = () => this.updSndIrq();
    const s2w = this.snd2.write.bind(this.snd2); this.snd2.write = (o, v) => { s2w(o, v); this.updSndIrq(); };
    this.audio = { rate: 44100, buf: new Float32Array(8192 * 2), w: 0, acc: 0 };
    this.discAudio = null;

    this.reset();
  }
  updPifIrq() { this.pif.irqLine = (this.pifTimerIrq || this.pifIrqB) ? 1 : 0; }
  updSndIrq() { const need = (this.fifo[0].n < 16 || this.fifo[1].n < 16) && (this.snd2.cra & 1);
    this.snd.irqLine = (need || this.snd2.lastIrqA > 0 || this.snd2.lastIrqB > 0 || this.ptmIrq) ? 1 : 0; }
  updFifoFlags() { const need = (this.fifo[0].n < 16 || this.fifo[1].n < 16) ? 0 : 1; this.snd2.setCA1(need); this.updSndIrq(); }   // FIFO half-empty flags -> level IRQ

  reset() {
    for (const p of [this.u10, this.u20, this.vgg, this.pifPia, this.snd1, this.snd2]) p.reset();
    this.ptm.reset(); this.fifo.forEach(f => f.reset());
    this.bank = 0; this.blitStall = 0;
    this.main.reset(); this.pif.reset(); this.snd.reset();
    this.main.cycles = this.pif.cycles = this.snd.cycles = 0;
  }

  // ======================================================= main CPU memory
  imageByte(addr) {            // ROM board, 0000-7FFF, through current page
    const p = this.page & 0x1F, hi = (addr & 0x4000) ? 1 : 0;
    let rom = null;
    if (p === 0x1E) rom = hi ? this.textRom : null;
    else if (p < 10) rom = this.img[2 * p + 1 + hi];
    if (!rom) return 0xFF;
    return rom[addr & (rom.length - 1)];
  }
  mread(a) {
    if (a < 0xA000) {
      if (this.bank & 2) return this.vram[a];
      if ((this.bank & 1) && a < 0x8000) return this.imageByte(a);
      if (a < 0x4000) return (this.bank & 4) ? this.rom31[a] : this.rom30[a];
      if (a < 0x8000) return (this.bank & 4) ? 0xFF : this.rom32[a - 0x4000];
      return this.rom34[a - 0x8000];
    }
    if (a < 0xC000) return this.ram[a - 0xA000];
    if (a < 0xC800) return this.colorRam[a - 0xC000];
    if (a < 0xCC00) return this.ioread(a);
    if (a < 0xD000) return 0xF0 | (this.cmos[a - 0xCC00] & 0x0F);
    if (a < 0xE000) return this.ram2[a - 0xD000];
    return this.rom35[a - 0xE000];
  }
  mwrite(a, v) {
    if (a < 0xA000) { this.vram[a] = v; return; }
    if (a < 0xC000) { this.ram[a - 0xA000] = v; return; }
    if (a < 0xC800) { this.colorRam[a - 0xC000] = v; return; }
    if (a < 0xCC00) { this.iowrite(a, v); return; }
    if (a < 0xD000) { this.cmos[a - 0xCC00] = v & 0x0F; this.cmosDirty = true; return; }
    if (a < 0xE000) { this.ram2[a - 0xD000] = v; return; }
  }
  vcounter() { return this.line & 0xFF; }
  ioread(a) {
    if (a >= 0xC980 && a < 0xCA00) return (a & 4) ? this.u20.read(a & 3) : this.u10.read(a & 3);
    if (a >= 0xCB00 && a < 0xCB80) return this.manchester[a & 0x7F];
    if (a >= 0xCB80 && a < 0xCB90) return this.vgg.read(a & 3);
    if (a >= 0xCB90 && a < 0xCBA0) return (this.vsyncCompensate ? this.fieldLatch : this.fieldOdd) ? 0x80 : 0x00;
    if (a >= 0xCBA0 && a < 0xCBB0) return this.vcounter();
    return 0xFF;
  }
  iowrite(a, v) {
    if (a < 0xC880) { this.bank = v; return; }
    if (a < 0xC900) { if (v !== this.led) { this.led = v; this.stats.ledHist.push(v); if (this.stats.ledHist.length > 32) this.stats.ledHist.shift(); } return; }
    if (a < 0xC980) { if (v === 0x15) this.watchdog = 0; return; }
    if (a < 0xCA00) { if (a & 4) this.u20.write(a & 3, v); else this.u10.write(a & 3, v); return; }
    if (a >= 0xCB80 && a < 0xCB90) { this.vgg.write(a & 3, v); return; }
    if (a >= 0xCBB0 && a < 0xCBC0) { this.blit[a & 7] = v; if ((a & 7) === 0) this.doBlit(v); return; }
    if (a === 0xCBC0) { this.page = v; return; }
    if (a === 0xCBC1) { this.xlate = v & 0x3F; return; }
    if (a >= 0xCBD0 && a < 0xCBE0) { this.vctl = v; return; }
    if (a >= 0xCBE0 && a < 0xCBF0) { this.palBank = v & 0x3F; return; }
  }

  // ======================================================= SC2 blitter (Williams "special chip 2")
  dmaRead(a) {
    a &= 0xFFFF;
    if (a < 0x8000) {                     // page bit 7 = 'no beam sync' flag for the FIRQ list, not a source select
      const b = this.imageByte(a);
      if (!this.xlatProm) return b;
      const t = this.xlate << 4; return (this.xlatProm[t | (b >> 4)] << 4) | (this.xlatProm[t | (b & 15)] & 15);
    }
    if (a >= 0xC000 && a < 0xE000 && this.textRom) {           // text ROM ("CS TOP") in DMA space
      const b = this.textRom[a & 0x1FFF]; if (!this.xlatProm) return b;
      const t = this.xlate << 4; return (this.xlatProm[t | (b >> 4)] << 4) | (this.xlatProm[t | (b & 15)] & 15);
    }
    if (a < 0xA000) return this.vram[a];
    return this.mread(a);
  }
  blitPixel(dst, src, ctrl) {
    dst &= 0xFFFF;
    if (dst >= 0xA000) return;                       // SC2 only reaches the screen DRAM; off-screen writes are lost
    const cur = this.vram[dst];
    let keep = 0; if (ctrl & 0x80) keep |= 0xF0; if (ctrl & 0x40) keep |= 0x0F;
    if (ctrl & 0x08) { if (!(src & 0xF0)) keep |= 0xF0; if (!(src & 0x0F)) keep |= 0x0F; }
    let pix = cur & keep;
    pix |= ((ctrl & 0x10) ? this.blit[1] : src) & ~keep & 0xFF;
    this.vram[dst] = pix;
  }
  doBlit(ctrl) {
    const r = this.blit; let sstart = (r[2] << 8) | r[3], dstart = (r[4] << 8) | r[5];
    let w = r[6], h = r[7]; if (w === 0) w = 1; if (h === 0) h = 1; if (w === 255) w = 256; if (h === 255) h = 256;
    const sxadv = (ctrl & 1) ? 0x100 : 1, syadv = (ctrl & 1) ? 1 : w, dxadv = (ctrl & 2) ? 0x100 : 1, dyadv = (ctrl & 2) ? 1 : w;
    if (this.blitLog) this.blitLog.push([ctrl, r[1], sstart, dstart, w, h, this.page, this.xlate]);
    if (!(ctrl & 0x20)) {
      for (let y = 0; y < h; y++) {
        let s = sstart & 0xFFFF, d = dstart & 0xFFFF;
        for (let x = 0; x < w; x++) { this.blitPixel(d, this.dmaRead(s), ctrl); s = (s + sxadv) & 0xFFFF; d = (d + dxadv) & 0xFFFF; }
        sstart += syadv; if (ctrl & 2) dstart = (dstart & 0xFF00) | ((dstart + dyadv) & 0xFF); else dstart += dyadv;
      }
    } else { // shifted by one pixel
      for (let y = 0; y < h; y++) {
        let s = sstart & 0xFFFF, d = dstart & 0xFFFF, pix = this.dmaRead(s);
        s = (s + sxadv) & 0xFFFF;
        this.blitPixel(d, (pix >> 4) & 0x0F, ctrl | 0x80); d = (d + dxadv) & 0xFFFF;  // left edge: keep hi nibble
        for (let x = w - 1; x > 0; x--) { pix = ((pix << 8) | this.dmaRead(s)) & 0xFFFF; this.blitPixel(d, (pix >> 4) & 0xFF, ctrl); s = (s + sxadv) & 0xFFFF; d = (d + dxadv) & 0xFFFF; }
        this.blitPixel(d, (pix << 4) & 0xF0, ctrl | 0x40);
        sstart += syadv; if (ctrl & 2) dstart = (dstart & 0xFF00) | ((dstart + dyadv) & 0xFF); else dstart += dyadv;
      }
    }
    this.stats.blits++;
    this.blitStall = Math.ceil(w * h * ((ctrl & 4) ? 2 : 1) / (this.blitRate || 1)) + 2;   // CPU is HALTed while the SC2 owns the bus
  }

  // ======================================================= PIF board memory (6809 @1MHz)
  pread(a) {
    if (a < 0x2000) return this.pifRam[a & 0x7FF];
    if (a >= 0x8000 && a < 0xA000) return this.pifPia.read(a & 3);
    if (a >= 0xE000) return this.pifRom[a & 0xFFF];
    return 0xFF;
  }
  pwrite(a, v) {
    if (a < 0x2000) { this.pifRam[a & 0x7FF] = v; return; }
    if (a >= 0x8000 && a < 0xA000) { this.pifPia.write(a & 3, v); return; }
    if (a >= 0x4000 && a < 0x6000) { this.pifTimerIrq = 0; this.updPifIrq(); return; }   // 4MS IRQ acknowledge
  }

  // ======================================================= sound board memory (68B09E @2MHz)
  sread(a) {
    if (a >= 0xE000) return this.sndRom[a & 0x1FFF];
    if (a >= 0xD000 && a < 0xE000) return this.sndRam[a & 0xFFF];
    if ((a & 0xFF80) === 0xC000) return this.ptm.read(a & 7);
    if ((a & 0xFF80) === 0xC080) return this.snd1.read(a & 3);
    if ((a & 0xFF80) === 0xC580) return this.snd2.read(a & 3);
    return 0xFF;
  }
  swrite(a, v) {
    if (a >= 0xD000 && a < 0xE000) { this.sndRam[a & 0xFFF] = v; return; }
    if ((a & 0xFF80) === 0xC000) { this.ptm.write(a & 7, v); return; }
    if ((a & 0xFF80) === 0xC080) { this.snd1.write(a & 3, v); return; }
    if ((a & 0xFF80) === 0xC580) { this.snd2.write(a & 3, v); return; }
    if ((a & 0xFFC0) === 0xC7C0) { this.fifo[0].write(v); this.updFifoFlags(); return; }
    if ((a & 0xFFC0) === 0xC740) { this.fifo[1].write(v); this.updFifoFlags(); return; }
    const ax = a & 0xFF80;
    if (ax === 0xC380) this.atten[0] = v & 0x3F; else if (ax === 0xC400) this.atten[1] = v & 0x3F;
    else if (ax === 0xC480) this.atten[2] = v & 0x3F; else if (ax === 0xC500) this.atten[3] = v & 0x3F;
  }

  // ======================================================= Manchester (biphase) data from the disc
  loadManchester() {
    const pic = this.ld.frame + this.ldPicOffset;
    const m = this.manchester;
    if (this.ldFrameData && this.ld.frame * 45 + 45 <= this.ldFrameData.length && !this.ld.seekFields) {
      const o = this.ld.frame * 45; for (let i = 0; i < 45; i++) m[i] = this.ldFrameData[o + i];
      for (let i = 3; i < 45; i++) m[i + 42] = m[i];
      return;
    }
    if (this.ld.seekFields) { m[0] = m[1] = m[2] = 0; return; }   // no valid code while searching
    const s = String(Math.max(0, pic)).padStart(5, '0');
    m[0] = 0xF8 | (+s[0] & 7); m[1] = (+s[1] << 4) | +s[2]; m[2] = (+s[3] << 4) | +s[4];
    for (let i = 3; i < 0x57; i++) m[i] = 0;
    const d = this.bandData ? this.bandData(this.ld.frame) : null;   // 42 bytes of biphase band data for this disc frame
    if (d) { for (let i = 0; i < 42; i++) { m[3 + i] = d[i]; m[45 + i] = d[i]; } }
  }

  // ======================================================= run one video field
  runField() {
    const LINES = this.fieldOdd ? 263 : 262;
    const MAIN_PER_LINE = (this.mainHz || 1000000) / 15734.26, PIF_PER_LINE = 1000000 / 15734.26, SND_PER_LINE = 2000000 / 15734.26;
    const au = this.audio, sampPerSndCyc = au.rate / 2000000;
    this.fieldOdd ^= 1;
    this.ld.field(this.fieldOdd);
    for (let L = 0; L < LINES; L++) {
      this.line = L;
      // vertical sync: main field IRQ (U10 CA1, falling edge) and disc vsync to PIF
      if (L === 0) {
        if (this.u10.irqA1 && this.vsyncCompensate) this.vsyncPending++;   // previous field IRQ still unserviced
        this.fieldQueue.push(this.fieldOdd); if (this.fieldQueue.length > 4) this.fieldQueue.shift();
        this.u10.setCA1(0); this.vsyncLevel = 1;
      }
      if (L === 3) this.u10.setCA1(1);
      if (L === 12) this.vsyncLevel = 0;
      if (L === 240) this.loadManchester();                 // biphase window near the bottom of the picture
      // 4MS timer for the PIF (video address bit: one edge every 64 lines)
      const b = (L >> 5) & 1; if (b && !this.pif4ms) { this.pifTimerIrq = 1; this.updPifIrq(); } this.pif4ms = b;
      // --- main CPU
      this.mainBudget = (this.mainBudget || 0) + MAIN_PER_LINE;
      while (this.mainBudget > 0) {
        let c;
        if (this.blitStall > 0) { c = Math.min(this.blitStall, Math.ceil(this.mainBudget)); this.blitStall -= c; if (this.blitStall <= 0) { this.blitStall = 0; this.vgg.pulseCA1(); } }
        else c = this.main.step();
        this.mainBudget -= c; this.main.cycles += c;
      }
      // --- PIF CPU
      this.pifBudget = (this.pifBudget || 0) + PIF_PER_LINE;
      while (this.pifBudget > 0) { const c = this.pif.step(); this.pifBudget -= c; this.pif.cycles += c; }
      // --- sound CPU + DAC stream
      this.sndBudget = (this.sndBudget || 0) + SND_PER_LINE;
      while (this.sndBudget > 0) {
        const c = this.snd.step(); this.sndBudget -= c; this.snd.cycles += c;
        this.ptm.clock(c);
        au.acc += c * sampPerSndCyc;
        while (au.acc >= 1) { au.acc -= 1; this.mixSample(); }
      }
    }
    this.frameNo++;
  }
  mixSample() {
    const au = this.audio; if (au.w >= au.buf.length) return;
    const d1 = (this.fifo[0].out - 128) / 128, d2 = (this.fifo[1].out - 128) / 128, g = this.atten;
    // DAC1 -> attenuators 1,2 ; DAC2 -> attenuators 3,4 ; speakers UL,UR,LL,LR folded to stereo
    const ul = d1 * g[0] / 63, ur = d1 * g[1] / 63, ll = d2 * g[2] / 63, lr = d2 * g[3] / 63;
    let L = (ul + ll) * 0.5, R = (ur + lr) * 0.5;
    this.dcL = (this.dcL || 0) * 0.995 + L * 0.005; this.dcR = (this.dcR || 0) * 0.995 + R * 0.005;
    au.buf[au.w++] = L - this.dcL; au.buf[au.w++] = R - this.dcR;
  }
  takeAudio() { const a = this.audio; const out = a.buf.slice(0, a.w); a.w = 0; return out; }

  // ======================================================= video: foreground to RGBA (320 x 256)
  paletteRGBA(bank) {
    const out = new Uint32Array(16);
    for (let i = 0; i < 16; i++) {
      const o = (bank * 16 + i) * 2, b0 = this.colorRam[o], b1 = this.colorRam[o + 1];
      const r = b0 & 15, g = b0 >> 4, bl = b1 & 15, lum = b1 >> 4;
      const k = lum / 15 * 17;
      out[i] = (255 << 24) | (Math.round(bl * k) << 16) | (Math.round(g * k) << 8) | Math.round(r * k);
    }
    return out;
  }
  render(rgba, transparentZero) {   // rgba: Uint32Array(320*256)
    const pal = this.paletteRGBA(this.palBank);
    const bgOff = !this.backgroundEnabled();
    for (let col = 0; col < 160; col++) {
      const base = col << 8;
      for (let y = 0; y < 256; y++) {
        const v = this.vram[base + y], o = y * 320 + col * 2;
        const p0 = v >> 4, p1 = v & 15;
        rgba[o] = (p0 || bgOff || !transparentZero) ? pal[p0] : 0;
        rgba[o + 1] = (p1 || bgOff || !transparentZero) ? pal[p1] : 0;
      }
    }
    return rgba;
  }
  // horizontal position of the expanded disc picture: 9-bit value sent to the expander board through
  // the VGG PIA — port A = low 8 bits, CA2 = bit 8 (routine $0989). Center = $140.
  expanderRaw() { return ((this.vgg.ca2o ? 1 : 0) << 8) | (this.vgg.ora & 0xFF); }
  expandEnabled() { return (this.vctl & 2) === 0; }          // CBD0 D1 -> U111 Q  = EXPAND DISABLE
  backgroundEnabled() { return true; }                        // disc video is always keyed in behind colour 0 (CBD0 D0 is not a blanking bit: race writes $00, countdown $01)
}
StarRider.PR8210A = PR8210A;
root.StarRider = StarRider;
})(SRCORE);

/* ==========================================================================
 *  Star Rider (Williams 1983) — nativo. Núcleo de Luis: 6809 principal + PIF
 *  6809 + 6808 de sonido, PIA/PTM, FIFO, PR-8210A por control remoto y el
 *  "expansor" horizontal del VGG. El disco se compone en el lienzo como en la
 *  placa (expansor + franja del retrovisor); con YouTube va detrás sin
 *  expansor porque un iframe no se puede dibujar en un canvas.
 * ========================================================================== */
async function drvStarRider(lib, set, env) {
  const res = { missing: [], loaded: [] }, roms = {};
  const take = async (s, n, key) => {
    let r = (lib.sets[s] || []).find(x => x.name === n.toLowerCase());
    if (!r) for (const k in lib.sets) { r = lib.sets[k].find(x => x.name === n.toLowerCase()); if (r) break; }
    if (!r) { res.missing.push(n); return; } roms[key || n] = await lib.get(r); res.loaded.push(n);
  };
  const base = ['rom_1.u4','rom_10.u23','rom_11.u9','rom_12.u24','rom_13.u10','rom_14.u25','rom_15.u11','rom_16.u26','rom_17.u12','rom_18.u27','rom_19.u13','rom_2.u19','rom_25.u46','rom_26.u3','rom_27.u11','rom_3.u5','rom_30.u8','rom_31.u15','rom_32.u26','rom_34.u45','rom_35.u52','rom_4.u20','rom_5.u6','rom_6.u21','rom_7.u7','rom_8.u22','rom_9.u8','u10.82s137','u11.82s137','u114.82s123','u74.6349'];
  for (const n of base) await take('starridr', n);
  if (set === 'starridrp3') for (const [n, k] of [['rom_30p3.u8', 'rom_30.u8'], ['rom_31p3.u15', 'rom_31.u15'], ['rom_32p3.u26', 'rom_32.u26'], ['rom_34p3.u45', 'rom_34.u45'], ['rom_35p3.u52', 'rom_35.u52']]) await take('starridrp3', n, k);
  if (set === 'starridr_pif') await take('starrider_pif_update', 'PIFU3new.bin', 'rom_26.u3');
  const M = new SRCORE.StarRider(roms);
  try { const c = localStorage.getItem('starrider_cmos'); if (c) M.cmos.set(JSON.parse(c)); } catch (e) {}
  M.audio.rate = env.sampleRate || 44100;
  const LD = M.ld, hist = [];
  let rateEst = 1;
  const ldp = {
    get frame() { return LD.frame; }, frac: 0,
    get status() { return LD.seekFields ? LDP_SEARCHING : (LD.playing && rateEst > 0.05) ? LDP_PLAYING : LDP_PAUSED; },
    get target() { return LD.frame; }, fps: 29.97,
    get speedNum() { return Math.max(1, Math.round(rateEst * 100)); }, speedDen: 100,
    get audio1() { return !LD.audioMute; }, get audio2() { return !LD.audioMute; }, squelchSearch: true,
    get log() { return LD.cmdLog.slice(-6).map(v => v.toString(16)); }
  };
  const I = M.inputs; let steer = 32, thr = 0, keys = {}, coinQ = 0, ana = null;
  const aq = []; let aqR = 0;
  const fgc = typeof document !== 'undefined' ? document.createElement('canvas') : null, fg32 = new Uint32Array(320 * 256);
  let fgx = null, fgImg = null, bgc = null, bgx = null, bgValid = false;
  if (fgc) { fgc.width = 320; fgc.height = 256; fgx = fgc.getContext('2d'); fgImg = fgx.createImageData(320, 256); bgc = document.createElement('canvas'); bgc.width = 748; bgc.height = 480; bgx = bgc.getContext('2d'); }
  const G = {
    name: set, fps: 29.97, ldp, res, ow: 640, oh: 512, players: 1,
    get videoBlank() { return false; },
    runField() {
      if (ana != null) steer = ana; else if (keys.L) steer = Math.max(0, steer - 1); else if (keys.R) steer = Math.min(63, steer + 1); else steer += steer < 32 ? 1 : steer > 32 ? -1 : 0;
      thr = keys.U ? Math.min(15, thr + 1) : Math.max(0, thr - 1);
      I.steer = steer; I.throttle = thr; I.brake = keys.D ? 2 : 0; I.turbo = keys.B1 ? 1 : 0; I.hilo = keys.B2 ? 1 : 0;
      I.start1 = keys.S1 ? 1 : 0; I.start2 = keys.S2 ? 1 : 0; I.advance = keys.ADV ? 1 : 0; I.tilt = 0;
      I.coin = coinQ; coinQ = 0;
      M.runField();
      const a = M.takeAudio(); for (let i = 0; i < a.length; i += 2) aq.push((a[i] + a[i + 1]) * 0.5); if (aq.length > 20000) aq.splice(0, aq.length - 20000);
      hist.push(LD.frame); if (hist.length > 12) hist.shift();
      rateEst = hist.length > 1 ? (hist[hist.length - 1] - hist[0]) / (hist.length - 1) * 59.94 / 29.97 : 0;
      if (M.cmosDirty && M.frameNo % 120 === 0) { try { localStorage.setItem('starrider_cmos', JSON.stringify([...M.cmos])); } catch (e) {} M.cmosDirty = false; }
    },
    analog(x) { ana = Math.max(0, Math.min(63, Math.round(x / 640 * 63))); },
    input(sw, d) {
      const m = { [SW.LEFT]: 'L', [SW.RIGHT]: 'R', [SW.UP]: 'U', [SW.DOWN]: 'D', [SW.BUTTON1]: 'B1', [SW.BUTTON2]: 'B2', [SW.START1]: 'S1', [SW.START2]: 'S2', [SW.TEST]: 'ADV' }[sw];
      if (m) { keys[m] = d; if (m === 'L' || m === 'R') ana = null; }
      if (d && sw === SW.COIN1) coinQ |= 1; if (d && sw === SW.COIN2) coinQ |= 2;
      if (d && sw === SW.SERVICE) I.auto ^= 1;
    },
    /* el canal compone el disco él mismo (expansor + retrovisor) */
    drawCanvas(cx, vid) {
      cx.fillStyle = '#000';
      const own = vid && vid.tagName === 'VIDEO';
      if (own) { cx.fillRect(0, 0, 640, 512); if (vid.readyState >= 2 && !vid.seeking) { bgx.drawImage(vid, 0, 0, 748, 480); bgValid = true; } }
      else cx.clearRect(0, 0, 640, 512);
      if (own && bgValid) {
        if (M.expandEnabled()) {
          let s0 = (1073 - 2 * M.expanderRaw()) / 2, sw = 320, dx = 0;
          if (s0 < 0) { dx = -s0 * 2; sw += s0; s0 = 0; } if (s0 + sw > 748) sw = 748 - s0;
          if (sw > 0) cx.drawImage(bgc, s0, 0, sw, 330, dx, 29, sw * 2, 330);
        } else cx.drawImage(bgc, 54, 0, 640, 330, 0, 29, 640, 330);
        cx.drawImage(bgc, 54, 330, 640, 150, 0, 359, 640, 150);
      }
      M.render(fg32, true); fgImg.data.set(new Uint8ClampedArray(fg32.buffer)); fgx.putImageData(fgImg, 0, 0);
      cx.imageSmoothingEnabled = false; cx.drawImage(fgc, 0, 0, 640, 512);
      cx.fillStyle = '#000'; cx.fillRect(0, 462, 640, 50); cx.fillRect(630, 0, 10, 512);
    },
    draw(buf) { M.render(fg32, true); for (let y = 0; y < 512; y++) for (let x = 0; x < 640; x++) buf[y * 640 + x] = fg32[(y >> 1) * 320 + (x >> 1)]; },
    sample() { return aqR < aq.length ? aq.shift() : 0; },
    status() { return 'main PC ' + M.main.pc.toString(16) + ' · PR-8210A ' + LD.frame + (LD.seekFields ? ' busca' : LD.playing ? ' play' : ' still'); }
  };
  return G;
}
DRIVERS.starrider = drvStarRider;
