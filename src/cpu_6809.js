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
      this.cc |= CC_I | CC_F; this.pc = this.rw(0xFFF6); if (this.autoAck) this.firqLine = 0; return 10;
    }
    if (this.irqLine && !(this.cc & CC_I)) {
      this.sync = false;
      if (this.cwai) { this.cwai = false; } else { this.cc |= CC_E; this.pushAll(); }
      this.cc |= CC_I; this.pc = this.rw(0xFFF8); if (this.autoAck) this.irqLine = 0; return 19;
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
})(this);

