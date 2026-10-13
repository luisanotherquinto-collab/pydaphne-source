'use strict';
const FFCORE = (function () {
const window = {}, module = undefined;
// MC68000 interpreter core (c) Freedom Fighter dedicated emulation project
// Bus interface: bus.r8(a) bus.r16(a) bus.w8(a,v) bus.w16(a,v)  (24-bit address)

class M68K {
  constructor(bus) {
    this.bus = bus;
    this.d = new Int32Array(8); this.a = new Int32Array(8);
    this.pc = 0; this.sr = 0x2700; this.usp = 0; this.ssp = 0;
    this.x = 0; this.n = 0; this.z = 0; this.v = 0; this.c = 0;
    this.cycles = 0; this.stopped = false; this.irqLevel = 0; this.halted = false;
    this.irqAck = null; // function(level) -> vector or -1 for autovector
    this.onReset = null; this.trace = null;
    this.buildTable();
  }
  // ---------- SR helpers
  getSR() { return (this.sr & 0xff00) | (this.x << 4) | (this.n << 3) | (this.z << 2) | (this.v << 1) | this.c; }
  setSR(v) {
    const wasS = this.sr & 0x2000;
    this.sr = v & 0xa71f; this.x = (v >> 4) & 1; this.n = (v >> 3) & 1; this.z = (v >> 2) & 1; this.v = (v >> 1) & 1; this.c = v & 1;
    const isS = this.sr & 0x2000;
    if (wasS && !isS) { this.ssp = this.a[7]; this.a[7] = this.usp; }
    else if (!wasS && isS) { this.usp = this.a[7]; this.a[7] = this.ssp; }
  }
  setCCR(v) { this.x = (v >> 4) & 1; this.n = (v >> 3) & 1; this.z = (v >> 2) & 1; this.v = (v >> 1) & 1; this.c = v & 1; }
  reset() {
    this.sr = 0x2700; this.x = this.n = this.z = this.v = this.c = 0;
    this.a[7] = this.r32(0); this.ssp = this.a[7]; this.pc = this.r32(4) & 0xffffff; this.stopped = false; this.halted = false;
  }
  // ---------- memory
  r8(a) { return this.bus.r8(a & 0xffffff); }
  r16(a) { a &= 0xffffff; if (a & 1) return this.addrError(a); return this.bus.r16(a); }
  r32(a) { a &= 0xffffff; if (a & 1) return this.addrError(a); return ((this.bus.r16(a) << 16) | this.bus.r16((a + 2) & 0xffffff)) | 0; }
  w8(a, v) { this.bus.w8(a & 0xffffff, v & 0xff); }
  w16(a, v) { a &= 0xffffff; if (a & 1) { this.addrError(a); return; } this.bus.w16(a, v & 0xffff); }
  w32(a, v) { a &= 0xffffff; if (a & 1) { this.addrError(a); return; } this.bus.w16(a, (v >>> 16) & 0xffff); this.bus.w16((a + 2) & 0xffffff, v & 0xffff); }
  addrError(a) { this.lastAddrError = a; if (this.onAddrError) this.onAddrError(a); return 0; }
  fetch16() { const v = this.bus.r16(this.pc & 0xffffff); this.pc = (this.pc + 2) & 0xffffff; return v; }
  fetch32() { const h = this.fetch16(); return ((h << 16) | this.fetch16()) | 0; }
  // ---------- exceptions
  exception(vec, pcOverride) {
    const sr = this.getSR();
    if (!(this.sr & 0x2000)) { this.usp = this.a[7]; this.a[7] = this.ssp; }
    this.sr = (this.sr | 0x2000) & ~0x8000;
    this.a[7] -= 4; this.w32(this.a[7], pcOverride === undefined ? this.pc : pcOverride);
    this.a[7] -= 2; this.w16(this.a[7], sr);
    this.pc = this.r32(vec * 4) & 0xffffff;
    this.cycles += 34;
  }
  checkIRQ() {
    const lvl = this.getIrq ? this.getIrq() : this.irqLevel;
    if (lvl > 0 && (lvl === 7 || lvl > ((this.sr >> 8) & 7))) {
      this.stopped = false;
      let vec = this.irqAck ? this.irqAck(lvl) : -1;
      if (vec < 0) vec = 24 + lvl;
      const sr = this.getSR();
      if (!(this.sr & 0x2000)) { this.usp = this.a[7]; this.a[7] = this.ssp; }
      this.sr = ((this.sr | 0x2000) & ~0x8000 & ~0x0700) | (lvl << 8);
      this.a[7] -= 4; this.w32(this.a[7], this.pc);
      this.a[7] -= 2; this.w16(this.a[7], sr);
      this.pc = this.r32(vec * 4) & 0xffffff;
      this.cycles += 44;
      return true;
    }
    return false;
  }
  run(cycles) {
    const target = this.cycles + cycles;
    while (this.cycles < target) {
      this.checkIRQ();
      if (this.stopped || this.halted) { this.cycles = target; break; }
      this.ppc = this.pc;
      const op = this.fetch16();
      this.op = op;
      this.tbl[op].call(this, op);
    }
  }
  step() { this.checkIRQ(); if (this.stopped) return; this.ppc = this.pc; const op = this.fetch16(); this.op = op; this.tbl[op].call(this, op); }
  // ---------- effective addresses
  // returns address for memory modes; for data/addr reg returns -1 / -2 codes via separate funcs
  ea(mode, reg, size) {
    switch (mode) {
      case 2: this.cycles += 4; return this.a[reg];
      case 3: { const a = this.a[reg]; this.a[reg] += (reg === 7 && size === 1) ? 2 : size; this.cycles += 4; return a; }
      case 4: this.a[reg] -= (reg === 7 && size === 1) ? 2 : size; this.cycles += 6; return this.a[reg];
      case 5: { const d = (this.fetch16() << 16) >> 16; this.cycles += 8; return (this.a[reg] + d) | 0; }
      case 6: this.cycles += 10; return this.indexEA(this.a[reg]);
      case 7:
        switch (reg) {
          case 0: this.cycles += 8; return (this.fetch16() << 16) >> 16;
          case 1: this.cycles += 12; return this.fetch32();
          case 2: { const b = this.pc; const d = (this.fetch16() << 16) >> 16; this.cycles += 8; return (b + d) | 0; }
          case 3: { this.cycles += 10; return this.indexEA(this.pc); }
          case 4: { this.cycles += 4; const b = this.pc; this.pc = (this.pc + (size === 4 ? 4 : 2)) & 0xffffff; return size === 1 ? b + 1 : b; }
        }
    }
    this.illegal(); return 0;
  }
  indexEA(base) {
    const ext = this.fetch16();
    const r = (ext >> 12) & 7;
    let idx = (ext & 0x8000) ? this.a[r] : this.d[r];
    if (!(ext & 0x800)) idx = (idx << 16) >> 16;
    const d8 = (ext << 24) >> 24;
    return (base + idx + d8) | 0;
  }
  // read operand of size from mode/reg (sign-agnostic, returns unsigned masked)
  readEA(mode, reg, size) {
    if (mode === 0) return size === 1 ? this.d[reg] & 0xff : size === 2 ? this.d[reg] & 0xffff : this.d[reg];
    if (mode === 1) return size === 2 ? this.a[reg] & 0xffff : this.a[reg];
    if (mode === 7 && reg === 4) {
      if (size === 1) { this.cycles += 4; return this.fetch16() & 0xff; }
      if (size === 2) { this.cycles += 4; return this.fetch16(); }
      this.cycles += 8; return this.fetch32();
    }
    const a = this.ea(mode, reg, size);
    this.lastEA = a;
    if (size === 1) return this.r8(a);
    if (size === 2) return this.r16(a);
    this.cycles += 4; return this.r32(a);
  }
  writeEA(mode, reg, size, v) {
    if (mode === 0) { this.setD(reg, size, v); return; }
    if (mode === 1) { this.a[reg] = size === 2 ? (v << 16) >> 16 : v | 0; return; }
    const a = this.ea(mode, reg, size);
    if (size === 1) this.w8(a, v); else if (size === 2) this.w16(a, v); else { this.cycles += 4; this.w32(a, v); }
  }
  // read-modify-write helpers: resolve location once
  rmwRead(mode, reg, size) {
    if (mode === 0) { this.rmwMode = 0; return size === 1 ? this.d[reg] & 0xff : size === 2 ? this.d[reg] & 0xffff : this.d[reg]; }
    if (mode === 1) { this.rmwMode = 1; return this.a[reg]; }
    this.rmwMode = 2; const a = this.ea(mode, reg, size); this.rmwAddr = a;
    if (size === 1) return this.r8(a); if (size === 2) return this.r16(a); this.cycles += 4; return this.r32(a);
  }
  rmwWrite(reg, size, v) {
    if (this.rmwMode === 0) { this.setD(reg, size, v); return; }
    if (this.rmwMode === 1) { this.a[reg] = v | 0; return; }
    const a = this.rmwAddr; if (size === 1) this.w8(a, v); else if (size === 2) this.w16(a, v); else { this.cycles += 4; this.w32(a, v); }
    this.cycles += 4;
  }
  setD(r, size, v) {
    if (size === 1) this.d[r] = (this.d[r] & ~0xff) | (v & 0xff);
    else if (size === 2) this.d[r] = (this.d[r] & ~0xffff) | (v & 0xffff);
    else this.d[r] = v | 0;
  }
  // ---------- flag helpers
  msb(size) { return size === 1 ? 0x80 : size === 2 ? 0x8000 : 0x80000000; }
  mask(v, size) { return size === 1 ? v & 0xff : size === 2 ? v & 0xffff : v >>> 0; }
  logicFlags(r, size) { r = this.mask(r, size); this.n = (r & this.msb(size)) ? 1 : 0; this.z = r === 0 ? 1 : 0; this.v = 0; this.c = 0; return r; }
  add(s, d, size, withX) {
    s = this.mask(s, size); d = this.mask(d, size);
    const xin = withX ? this.x : 0;
    let r = size === 4 ? (s + d + xin) : (s + d + xin);
    const m = this.msb(size);
    const rm = this.mask(r, size);
    const carry = size === 4 ? (r > 0xffffffff ? 1 : 0) : (r >> (size * 8)) & 1;
    this.c = this.x = carry;
    this.v = ((~(s ^ d) & (s ^ rm)) & m) ? 1 : 0;
    this.n = (rm & m) ? 1 : 0;
    if (withX) { if (rm !== 0) this.z = 0; } else this.z = rm === 0 ? 1 : 0;
    return rm;
  }
  sub(s, d, size, withX, isCmp) { // d - s
    s = this.mask(s, size); d = this.mask(d, size);
    const xin = withX ? this.x : 0;
    const r = d - s - xin;
    const m = this.msb(size);
    const rm = this.mask(r, size);
    const borrow = r < 0 ? 1 : 0;
    this.c = borrow; if (!isCmp) this.x = borrow;
    this.v = (((s ^ d) & (d ^ rm)) & m) ? 1 : 0;
    this.n = (rm & m) ? 1 : 0;
    if (withX) { if (rm !== 0) this.z = 0; } else this.z = rm === 0 ? 1 : 0;
    return rm;
  }
  cond(cc) {
    switch (cc) {
      case 0: return true; case 1: return false;
      case 2: return !this.c && !this.z; case 3: return !!(this.c || this.z);
      case 4: return !this.c; case 5: return !!this.c;
      case 6: return !this.z; case 7: return !!this.z;
      case 8: return !this.v; case 9: return !!this.v;
      case 10: return !this.n; case 11: return !!this.n;
      case 12: return this.n === this.v; case 13: return this.n !== this.v;
      case 14: return !this.z && this.n === this.v; case 15: return !!this.z || this.n !== this.v;
    }
  }
  illegal() { this.pc = this.ppc; if (this.onIllegal) this.onIllegal(this.ppc, this.op); this.exception(4); }
  privViol() { this.pc = this.ppc; this.exception(8); }
  sext(v, size) { return size === 1 ? (v << 24) >> 24 : size === 2 ? (v << 16) >> 16 : v | 0; }

  // ---------- decode table
  buildTable() {
    const t = new Array(65536);
    const S = [1, 2, 4];
    const ill = function () { this.illegal(); };
    for (let op = 0; op < 65536; op++) t[op] = ill;
    const validEA = (mode, reg, kind) => {
      // kind: 'all','data','mem','alt','dalt','malt','ctrl','calt'
      if (mode === 7 && reg > 4) return false;
      const isD = mode === 0, isA = mode === 1, isImm = mode === 7 && reg === 4, isPC = mode === 7 && (reg === 2 || reg === 3);
      switch (kind) {
        case 'all': return true;
        case 'data': return !isA;
        case 'mem': return !isD && !isA;
        case 'alt': return !isImm && !isPC;
        case 'dalt': return !isA && !isImm && !isPC;
        case 'malt': return !isD && !isA && !isImm && !isPC;
        case 'ctrl': return mode === 2 || mode === 5 || mode === 6 || (mode === 7 && reg <= 3);
        case 'calt': return mode === 2 || mode === 5 || mode === 6 || (mode === 7 && reg <= 1);
      }
    };
    const set = (op, f) => { t[op] = f; };
    for (let op = 0; op < 65536; op++) {
      const hi = op >> 12, mode = (op >> 3) & 7, reg = op & 7, rx = (op >> 9) & 7, opm = (op >> 6) & 7, sz = (op >> 6) & 3;
      switch (hi) {
        case 0x0: {
          if ((op & 0x100) && mode === 1) { // MOVEP
            set(op, function (op) {
              const dr = (op >> 9) & 7, ar = op & 7, om = (op >> 6) & 7;
              const addr = this.a[ar] + ((this.fetch16() << 16) >> 16);
              if (om === 4) { this.setD(dr, 2, (this.r8(addr) << 8) | this.r8(addr + 2)); this.cycles += 16; }
              else if (om === 5) { this.d[dr] = (this.r8(addr) << 24) | (this.r8(addr + 2) << 16) | (this.r8(addr + 4) << 8) | this.r8(addr + 6); this.cycles += 24; }
              else if (om === 6) { const v = this.d[dr]; this.w8(addr, v >> 8); this.w8(addr + 2, v); this.cycles += 16; }
              else { const v = this.d[dr]; this.w8(addr, v >> 24); this.w8(addr + 2, v >> 16); this.w8(addr + 4, v >> 8); this.w8(addr + 6, v); this.cycles += 24; }
            });
            continue;
          }
          if (op & 0x100) { // dynamic bit ops
            const bop = (op >> 6) & 3;
            if (bop === 0 ? !validEA(mode, reg, 'data') : !validEA(mode, reg, 'dalt')) continue;
            set(op, this.mkBit(bop, true));
            continue;
          }
          const sub = (op >> 9) & 7;
          if (sub === 4) { // static bit
            const bop = (op >> 6) & 3;
            if (bop === 0 ? !(validEA(mode, reg, 'data') && !(mode === 7 && reg === 4)) : !validEA(mode, reg, 'dalt')) continue;
            set(op, this.mkBit(bop, false));
            continue;
          }
          if (sz === 3) continue;
          const size = S[sz];
          if ((sub === 0 || sub === 1 || sub === 5) && mode === 7 && reg === 4) { // to CCR / SR
            if (size === 4) continue;
            const kind = sub;
            set(op, function (op) {
              const imm = this.fetch16(); this.cycles += 20;
              if (size === 1) { let c = this.getSR() & 0xff; c = kind === 0 ? c | imm : kind === 1 ? c & imm : c ^ imm; this.setCCR(c); }
              else { if (!(this.sr & 0x2000)) { this.privViol(); return; } let s = this.getSR(); s = kind === 0 ? s | imm : kind === 1 ? s & imm : s ^ imm; this.setSR(s); }
            });
            continue;
          }
          if (sub === 7 || sub === 4) continue;
          if (sub === 6) { if (!validEA(mode, reg, 'data') || (mode === 7 && reg === 4)) continue; }
          else if (!validEA(mode, reg, 'dalt')) continue;
          set(op, this.mkImm(sub, size));
          continue;
        }
        case 0x1: case 0x2: case 0x3: {
          const size = hi === 1 ? 1 : hi === 3 ? 2 : 4;
          const dmode = (op >> 6) & 7, dreg = (op >> 9) & 7;
          if (!validEA(mode, reg, 'all')) continue;
          if (size === 1 && mode === 1) continue;
          if (dmode === 1) { // MOVEA
            if (size === 1) continue;
            set(op, function (op) { const v = this.readEA(mode, reg, size); this.a[dreg] = size === 2 ? (v << 16) >> 16 : v; this.cycles += 4; });
            continue;
          }
          if (!validEA(dmode, dreg, 'dalt')) continue;
          set(op, function (op) { const v = this.readEA(mode, reg, size); this.logicFlags(v, size); this.writeEA(dmode, dreg, size, v); this.cycles += 4; });
          continue;
        }
        case 0x4: this.dec4(op, set, validEA); continue;
        case 0x5: {
          if (sz === 3) {
            const cc = (op >> 8) & 15;
            if (mode === 1) { // DBcc
              set(op, function (op) {
                const r = op & 7; const base = this.pc; const disp = (this.fetch16() << 16) >> 16;
                if (!this.cond(cc)) {
                  const w = ((this.d[r] & 0xffff) - 1) & 0xffff; this.d[r] = (this.d[r] & ~0xffff) | w;
                  if (w !== 0xffff) { this.pc = (base + disp) & 0xffffff; this.cycles += 10; } else this.cycles += 14;
                } else this.cycles += 12;
              });
              continue;
            }
            if (!validEA(mode, reg, 'dalt')) continue;
            set(op, function (op) { const v = this.cond(cc) ? 0xff : 0; this.cycles += mode === 0 ? (v ? 6 : 4) : 8; this.writeEA(mode, reg, 1, v); });
            continue;
          }
          const size = S[sz]; let q = (op >> 9) & 7; if (q === 0) q = 8;
          const isSub = op & 0x100;
          if (mode === 1) {
            if (size === 1) continue;
            set(op, function (op) { this.a[reg] = isSub ? (this.a[reg] - q) | 0 : (this.a[reg] + q) | 0; this.cycles += 8; });
            continue;
          }
          if (!validEA(mode, reg, 'dalt')) continue;
          set(op, function (op) {
            const d = this.rmwRead(mode, reg, size);
            const r = isSub ? this.sub(q, d, size, false, false) : this.add(q, d, size, false);
            this.rmwWrite(reg, size, r); this.cycles += size === 4 ? 8 : 4;
          });
          continue;
        }
        case 0x6: {
          const cc = (op >> 8) & 15; const d8 = (op << 24) >> 24;
          set(op, function (op) {
            const base = this.pc; let disp = d8;
            if (disp === 0) disp = (this.fetch16() << 16) >> 16;
            if (cc === 1) { // BSR
              this.a[7] -= 4; this.w32(this.a[7], this.pc); this.pc = (base + disp) & 0xffffff; this.cycles += 18; return;
            }
            if (this.cond(cc)) { this.pc = (base + disp) & 0xffffff; this.cycles += 10; }
            else this.cycles += d8 === 0 ? 12 : 8;
          });
          continue;
        }
        case 0x7: {
          if (op & 0x100) continue;
          const v = (op << 24) >> 24;
          set(op, function (op) { this.d[rx] = v; this.logicFlags(v, 4); this.cycles += 4; });
          continue;
        }
        case 0x8: case 0xc: {
          const isAnd = hi === 0xc;
          if (opm === 3 || opm === 7) { // DIVU/DIVS or MULU/MULS
            if (!validEA(mode, reg, 'data')) continue;
            const signed = opm === 7;
            if (isAnd) set(op, this.mkMul(signed)); else set(op, this.mkDiv(signed));
            continue;
          }
          if ((opm === 4 || opm === 5 || opm === 6) && mode <= 1) { // ABCD/SBCD, EXG
            if (isAnd && opm >= 5) { // EXG
              let kind = null;
              if (opm === 5 && mode === 0) kind = 'dd'; else if (opm === 5 && mode === 1) kind = 'aa'; else if (opm === 6 && mode === 1) kind = 'da';
              if (!kind) continue;
              set(op, function (op) {
                if (kind === 'dd') { const t2 = this.d[rx]; this.d[rx] = this.d[reg]; this.d[reg] = t2; }
                else if (kind === 'aa') { const t2 = this.a[rx]; this.a[rx] = this.a[reg]; this.a[reg] = t2; }
                else { const t2 = this.d[rx]; this.d[rx] = this.a[reg]; this.a[reg] = t2; }
                this.cycles += 6;
              });
              continue;
            }
            if (opm === 4) { set(op, this.mkBCD(isAnd, mode === 1)); continue; }
            if (!isAnd) continue;
          }
          const size = S[opm & 3]; const toEA = opm >= 4;
          if (toEA) { if (!validEA(mode, reg, 'malt')) continue; }
          else { if (!validEA(mode, reg, 'data')) continue; }
          set(op, function (op) {
            if (toEA) { const d = this.rmwRead(mode, reg, size); const r = isAnd ? d & this.d[rx] : d | this.d[rx]; this.logicFlags(r, size); this.rmwWrite(reg, size, r); this.cycles += 4; }
            else { const s = this.readEA(mode, reg, size); const r = isAnd ? s & this.d[rx] : s | this.d[rx]; this.logicFlags(r, size); this.setD(rx, size, r); this.cycles += size === 4 ? 6 : 4; }
          });
          continue;
        }
        case 0x9: case 0xd: {
          const isSub = hi === 9;
          if (opm === 3 || opm === 7) { // ADDA/SUBA
            if (!validEA(mode, reg, 'all')) continue;
            const size = opm === 3 ? 2 : 4;
            set(op, function (op) { let s = this.readEA(mode, reg, size); if (size === 2) s = (s << 16) >> 16; this.a[rx] = isSub ? (this.a[rx] - s) | 0 : (this.a[rx] + s) | 0; this.cycles += size === 2 ? 8 : 6; });
            continue;
          }
          const size = S[opm & 3];
          if (opm >= 4 && mode <= 1) { // ADDX/SUBX
            const memMode = mode === 1;
            set(op, function (op) {
              let s, d;
              if (memMode) {
                this.a[reg] -= (reg === 7 && size === 1) ? 2 : size; s = size === 1 ? this.r8(this.a[reg]) : size === 2 ? this.r16(this.a[reg]) : this.r32(this.a[reg]);
                this.a[rx] -= (rx === 7 && size === 1) ? 2 : size; const ad = this.a[rx]; d = size === 1 ? this.r8(ad) : size === 2 ? this.r16(ad) : this.r32(ad);
                const r = isSub ? this.sub(s, d, size, true, false) : this.add(s, d, size, true);
                if (size === 1) this.w8(ad, r); else if (size === 2) this.w16(ad, r); else this.w32(ad, r);
                this.cycles += size === 4 ? 30 : 18;
              } else {
                s = this.d[reg]; d = this.d[rx];
                const r = isSub ? this.sub(s, d, size, true, false) : this.add(s, d, size, true);
                this.setD(rx, size, r); this.cycles += size === 4 ? 8 : 4;
              }
            });
            continue;
          }
          if (opm >= 4) { if (!validEA(mode, reg, 'malt')) continue; }
          else { if (!validEA(mode, reg, 'all')) continue; if (size === 1 && mode === 1) continue; }
          const toEA = opm >= 4;
          set(op, function (op) {
            if (toEA) { const d = this.rmwRead(mode, reg, size); const r = isSub ? this.sub(this.d[rx], d, size, false, false) : this.add(this.d[rx], d, size, false); this.rmwWrite(reg, size, r); this.cycles += 4; }
            else { const s = this.readEA(mode, reg, size); const r = isSub ? this.sub(s, this.d[rx], size, false, false) : this.add(s, this.d[rx], size, false); this.setD(rx, size, r); this.cycles += size === 4 ? 6 : 4; }
          });
          continue;
        }
        case 0xa: set(op, function () { this.pc = this.ppc; this.exception(10); }); continue;
        case 0xf: set(op, function () { this.pc = this.ppc; this.exception(11); }); continue;
        case 0xb: {
          if (opm === 3 || opm === 7) { // CMPA
            if (!validEA(mode, reg, 'all')) continue;
            const size = opm === 3 ? 2 : 4;
            set(op, function (op) { let s = this.readEA(mode, reg, size); if (size === 2) s = (s << 16) >> 16; this.sub(s, this.a[rx], 4, false, true); this.cycles += 6; });
            continue;
          }
          const size = S[opm & 3];
          if (opm < 3) { // CMP
            if (!validEA(mode, reg, 'all')) continue; if (size === 1 && mode === 1) continue;
            set(op, function (op) { const s = this.readEA(mode, reg, size); this.sub(s, this.d[rx], size, false, true); this.cycles += size === 4 ? 6 : 4; });
            continue;
          }
          if (mode === 1) { // CMPM
            set(op, function (op) {
              const inc = (r) => (r === 7 && size === 1) ? 2 : size;
              const as = this.a[reg]; this.a[reg] += inc(reg); const s = size === 1 ? this.r8(as) : size === 2 ? this.r16(as) : this.r32(as);
              const ad = this.a[rx]; this.a[rx] += inc(rx); const d = size === 1 ? this.r8(ad) : size === 2 ? this.r16(ad) : this.r32(ad);
              this.sub(s, d, size, false, true); this.cycles += size === 4 ? 20 : 12;
            });
            continue;
          }
          if (!validEA(mode, reg, 'dalt')) continue; // EOR
          set(op, function (op) { const d = this.rmwRead(mode, reg, size); const r = d ^ this.d[rx]; this.logicFlags(r, size); this.rmwWrite(reg, size, r); this.cycles += 4; });
          continue;
        }
        case 0xe: {
          if (sz === 3) { // memory shift
            const type = (op >> 9) & 7; if (type > 3) continue; if (!validEA(mode, reg, 'malt')) continue;
            const left = op & 0x100;
            set(op, function (op) { const d = this.rmwRead(mode, reg, 2); const r = this.shift(type, left, d, 1, 2); this.rmwWrite(reg, 2, r); this.cycles += 8; });
            continue;
          }
          const size = S[sz]; const left = op & 0x100; const type = (op >> 3) & 3; const isReg = op & 0x20;
          set(op, function (op) {
            let cnt = isReg ? (this.d[rx] & 63) : (rx === 0 ? 8 : rx);
            const d = this.d[reg]; const r = this.shift(type, left, d, cnt, size); this.setD(reg, size, r);
            this.cycles += (size === 4 ? 8 : 6) + 2 * cnt;
          });
          continue;
        }
      }
    }
    this.tbl = t;
  }
  shift(type, left, d, cnt, size) {
    const bits = size * 8; const m = this.msb(size);
    let v = this.mask(d, size);
    if (cnt === 0) { this.c = type === 2 ? this.x : 0; this.n = (v & m) ? 1 : 0; this.z = v === 0 ? 1 : 0; this.v = 0; return v; }
    const full = size === 4 ? 0xffffffff : (1 << bits) - 1;
    let vflag = 0;
    switch (type) {
      case 0: // AS
        if (left) {
          for (let i = 0; i < cnt; i++) { const out = (v & m) ? 1 : 0; const nv = (size === 4 ? (v << 1) >>> 0 : (v << 1) & full); if (((nv & m) ? 1 : 0) !== out) vflag = 1; this.c = out; v = nv; }
          this.x = this.c;
        } else {
          const sign = (v & m) ? 1 : 0;
          for (let i = 0; i < cnt; i++) { this.c = v & 1; v = size === 4 ? ((v >>> 1) | (sign ? 0x80000000 : 0)) >>> 0 : (v >> 1) | (sign ? m : 0); }
          this.x = this.c;
        }
        this.v = vflag; break;
      case 1: // LS
        if (left) { for (let i = 0; i < cnt; i++) { this.c = (v & m) ? 1 : 0; v = size === 4 ? (v << 1) >>> 0 : (v << 1) & full; } }
        else { for (let i = 0; i < cnt; i++) { this.c = v & 1; v = v >>> 1; } }
        this.x = this.c; this.v = 0; break;
      case 2: // ROX
        for (let i = 0; i < cnt; i++) {
          if (left) { const out = (v & m) ? 1 : 0; v = size === 4 ? ((v << 1) | this.x) >>> 0 : ((v << 1) | this.x) & full; this.x = out; }
          else { const out = v & 1; v = size === 4 ? ((v >>> 1) | (this.x ? 0x80000000 : 0)) >>> 0 : (v >> 1) | (this.x ? m : 0); this.x = out; }
        }
        this.c = this.x; this.v = 0; break;
      case 3: // RO
        for (let i = 0; i < cnt; i++) {
          if (left) { const out = (v & m) ? 1 : 0; v = size === 4 ? ((v << 1) | out) >>> 0 : ((v << 1) | out) & full; this.c = out; }
          else { const out = v & 1; v = size === 4 ? ((v >>> 1) | (out ? 0x80000000 : 0)) >>> 0 : (v >> 1) | (out ? m : 0); this.c = out; }
        }
        this.v = 0; break;
    }
    v = this.mask(v, size); this.n = (v & m) ? 1 : 0; this.z = v === 0 ? 1 : 0; return v;
  }
  mkBit(bop, dyn) {
    return function (op) {
      const mode = (op >> 3) & 7, reg = op & 7;
      let bit = dyn ? this.d[(op >> 9) & 7] : this.fetch16() & 0xff;
      if (mode === 0) {
        bit &= 31; const m = 1 << bit; const v = this.d[reg];
        this.z = (v & m) ? 0 : 1;
        if (bop === 1) this.d[reg] = v ^ m; else if (bop === 2) this.d[reg] = v & ~m; else if (bop === 3) this.d[reg] = v | m;
        this.cycles += bop === 0 ? 6 : 8;
      } else {
        bit &= 7; const m = 1 << bit;
        if (bop === 0) { const v = this.readEA(mode, reg, 1); this.z = (v & m) ? 0 : 1; this.cycles += 4; return; }
        const v = this.rmwRead(mode, reg, 1); this.z = (v & m) ? 0 : 1;
        this.rmwWrite(reg, 1, bop === 1 ? v ^ m : bop === 2 ? v & ~m : v | m); this.cycles += 8;
      }
      if (!dyn) this.cycles += 4;
    };
  }
  mkImm(sub, size) {
    return function (op) {
      const mode = (op >> 3) & 7, reg = op & 7;
      const imm = size === 4 ? this.fetch32() : size === 2 ? this.fetch16() : this.fetch16() & 0xff;
      if (sub === 6) { const d = this.readEA(mode, reg, size); this.sub(imm, d, size, false, true); this.cycles += size === 4 ? 14 : 8; return; }
      const d = this.rmwRead(mode, reg, size); let r;
      switch (sub) {
        case 0: r = this.logicFlags(d | imm, size); break;
        case 1: r = this.logicFlags(d & imm, size); break;
        case 2: r = this.sub(imm, d, size, false, false); break;
        case 3: r = this.add(imm, d, size, false); break;
        case 5: r = this.logicFlags(d ^ imm, size); break;
      }
      this.rmwWrite(reg, size, r); this.cycles += size === 4 ? 16 : 8;
    };
  }
  mkMul(signed) {
    return function (op) {
      const mode = (op >> 3) & 7, reg = op & 7, rx = (op >> 9) & 7;
      let s = this.readEA(mode, reg, 2), d = this.d[rx] & 0xffff, r;
      if (signed) { s = (s << 16) >> 16; d = (d << 16) >> 16; r = Math.imul(s, d); }
      else r = Math.imul(s, d);
      this.d[rx] = r | 0; this.n = (r & 0x80000000) ? 1 : 0; this.z = (r | 0) === 0 ? 1 : 0; this.v = 0; this.c = 0; this.cycles += 54;
    };
  }
  mkDiv(signed) {
    return function (op) {
      const mode = (op >> 3) & 7, reg = op & 7, rx = (op >> 9) & 7;
      let s = this.readEA(mode, reg, 2);
      if (s === 0) { this.c = 0; this.exception(5); return; }
      if (signed) {
        s = (s << 16) >> 16; const d = this.d[rx];
        const q = Math.trunc(d / s), rem = d - q * s;
        if (q > 32767 || q < -32768) { this.v = 1; this.c = 0; this.n = 1; this.cycles += 20; return; }
        this.d[rx] = ((rem & 0xffff) << 16) | (q & 0xffff);
        this.n = (q & 0x8000) ? 1 : 0; this.z = (q & 0xffff) === 0 ? 1 : 0; this.v = 0; this.c = 0; this.cycles += 158;
      } else {
        const d = this.d[rx] >>> 0; const q = Math.floor(d / s), rem = d % s;
        if (q > 0xffff) { this.v = 1; this.c = 0; this.n = 1; this.cycles += 10; return; }
        this.d[rx] = ((rem & 0xffff) << 16) | (q & 0xffff);
        this.n = (q & 0x8000) ? 1 : 0; this.z = q === 0 ? 1 : 0; this.v = 0; this.c = 0; this.cycles += 140;
      }
    };
  }
  mkBCD(isAbcd, mem) {
    return function (op) {
      const rx = (op >> 9) & 7, ry = op & 7;
      let s, d, ad;
      if (mem) { this.a[ry] -= ry === 7 ? 2 : 1; s = this.r8(this.a[ry]); this.a[rx] -= rx === 7 ? 2 : 1; ad = this.a[rx]; d = this.r8(ad); this.cycles += 18; }
      else { s = this.d[ry] & 0xff; d = this.d[rx] & 0xff; this.cycles += 6; }
      let r;
      if (isAbcd) {
        let res = (s & 15) + (d & 15) + this.x; let vv = ~res;
        if (res > 9) res += 6;
        res += (s & 0xf0) + (d & 0xf0);
        this.c = this.x = res > 0x99 ? 1 : 0; if (this.c) res -= 0xa0;
        this.v = (vv & res & 0x80) ? 1 : 0; r = res & 0xff;
      } else {
        let res = ((d & 15) - (s & 15) - this.x) >>> 0; let vv = ~res;
        if (res > 9) res = (res - 6) >>> 0;
        res = (res + (d & 0xf0) - (s & 0xf0)) >>> 0;
        this.c = this.x = res > 0x99 ? 1 : 0; if (this.c) res = (res + 0xa0) >>> 0;
        r = res & 0xff; this.v = (vv & r & 0x80) ? 1 : 0;
      }
      if (r !== 0) this.z = 0; this.n = (r & 0x80) ? 1 : 0;
      if (mem) this.w8(ad, r); else this.setD(rx, 1, r);
    };
  }
  dec4(op, set, validEA) {
    const mode = (op >> 3) & 7, reg = op & 7, rx = (op >> 9) & 7, sz = (op >> 6) & 3;
    const S = [1, 2, 4];
    if (op & 0x100) {
      if (((op >> 6) & 7) === 7) { // LEA
        if (!validEA(mode, reg, 'ctrl')) return;
        set(op, function () { this.a[rx] = this.ea(mode, reg, 4); this.cycles += 0; });
        return;
      }
      if (((op >> 6) & 7) === 6) { // CHK
        if (!validEA(mode, reg, 'data')) return;
        set(op, function () {
          const b = (this.readEA(mode, reg, 2) << 16) >> 16; const v = (this.d[rx] << 16) >> 16; this.cycles += 10;
          if (v < 0) { this.n = 1; this.exception(6); } else if (v > b) { this.n = 0; this.exception(6); }
        });
      }
      return;
    }
    switch ((op >> 8) & 15) {
      case 0x0: case 0x2: case 0x4: case 0x6: {
        const k = (op >> 8) & 15;
        if (sz === 3) {
          if (k === 0) { if (!validEA(mode, reg, 'dalt')) return; set(op, function () { this.cycles += 6; this.writeEA(mode, reg, 2, this.getSR()); }); return; } // MOVE from SR
          if (k === 2) return;
          if (k === 4) { if (!validEA(mode, reg, 'data')) return; set(op, function () { this.setCCR(this.readEA(mode, reg, 2)); this.cycles += 12; }); return; }
          if (k === 6) { if (!validEA(mode, reg, 'data')) return; set(op, function () { if (!(this.sr & 0x2000)) { this.privViol(); return; } this.setSR(this.readEA(mode, reg, 2)); this.cycles += 12; }); return; }
        }
        if (!validEA(mode, reg, 'dalt')) return;
        const size = S[sz];
        set(op, function () {
          const d = this.rmwRead(mode, reg, size); let r;
          if (k === 0) r = this.sub(d, 0, size, true, false); // NEGX
          else if (k === 2) { r = 0; this.n = 0; this.z = 1; this.v = 0; this.c = 0; } // CLR
          else if (k === 4) r = this.sub(d, 0, size, false, false); // NEG
          else r = this.logicFlags(~d, size); // NOT
          this.rmwWrite(reg, size, r); this.cycles += size === 4 ? 6 : 4;
        });
        return;
      }
      case 0x8: {
        if (sz === 0) { if (!validEA(mode, reg, 'dalt')) return; // NBCD
          set(op, function () { const d = this.rmwRead(mode, reg, 1); let res = (-d - this.x) >>> 0;
            if ((res & 0xff) !== 0 || res !== 0) { if ((res & 0xff) === 0 && false) {} }
            if (res !== 0) { let vv = res; if (((res | d) & 0x0f) === 0) res = (res & 0xf0) + 6; res = (res + 0x9a) & 0xff; this.v = (vv & ~res & 0x80) ? 1 : 0; if (res) this.z = 0; this.c = this.x = 1; this.n = (res & 0x80) ? 1 : 0; this.rmwWrite(reg, 1, res); }
            else { this.v = 0; this.c = 0; this.x = 0; this.n = 0; this.rmwWrite(reg, 1, 0); }
            this.cycles += 6; });
          return; }
        if (sz === 1) {
          if (mode === 0) { set(op, function () { const v = this.d[reg]; const r = ((v << 16) | ((v >>> 16) & 0xffff)) | 0; this.d[reg] = r; this.logicFlags(r, 4); this.cycles += 4; }); return; } // SWAP
          if (!validEA(mode, reg, 'ctrl')) return; // PEA
          set(op, function () { const a = this.ea(mode, reg, 4); this.a[7] -= 4; this.w32(this.a[7], a); this.cycles += 8; }); return;
        }
        if (mode === 0) { // EXT
          set(op, function () { if (sz === 2) { const v = (this.d[reg] << 24) >> 24; this.setD(reg, 2, v); this.logicFlags(v, 2); } else { const v = (this.d[reg] << 16) >> 16; this.d[reg] = v; this.logicFlags(v, 4); } this.cycles += 4; });
          return;
        }
        // MOVEM reg->mem
        if (!(validEA(mode, reg, 'calt') || mode === 4)) return;
        const size = sz === 2 ? 2 : 4;
        set(op, function () {
          const mask = this.fetch16();
          if (mode === 4) {
            let a = this.a[reg];
            for (let i = 0; i < 16; i++) if (mask & (1 << i)) { // bit0 = a7
              const r = 15 - i; const v = r >= 8 ? this.a[r - 8] : this.d[r];
              a -= size; if (size === 2) this.w16(a, v); else this.w32(a, v); this.cycles += size === 2 ? 4 : 8;
            }
            this.a[reg] = a;
          } else {
            let a = this.ea(mode, reg, size);
            for (let i = 0; i < 16; i++) if (mask & (1 << i)) {
              const v = i >= 8 ? this.a[i - 8] : this.d[i];
              if (size === 2) this.w16(a, v); else this.w32(a, v); a += size; this.cycles += size === 2 ? 4 : 8;
            }
          }
          this.cycles += 8;
        });
        return;
      }
      case 0xa: {
        if (op === 0x4afc) return; // ILLEGAL
        if (sz === 3) { if (!validEA(mode, reg, 'dalt')) return; // TAS
          set(op, function () { const d = this.rmwRead(mode, reg, 1); this.logicFlags(d, 1); this.rmwWrite(reg, 1, d | 0x80); this.cycles += 4; }); return; }
        if (!validEA(mode, reg, 'all')) return; if (sz === 0 && mode === 1) return;
        const size = S[sz];
        set(op, function () { this.logicFlags(this.readEA(mode, reg, size), size); this.cycles += 4; }); return; // TST
      }
      case 0xc: {
        if (sz < 2) return;
        if (!(validEA(mode, reg, 'ctrl') || mode === 3)) return;
        const size = sz === 2 ? 2 : 4;
        set(op, function () {
          const mask = this.fetch16();
          let a = this.ea(mode, reg, size);
          for (let i = 0; i < 16; i++) if (mask & (1 << i)) {
            let v = size === 2 ? (this.r16(a) << 16) >> 16 : this.r32(a); a += size;
            if (i >= 8) this.a[i - 8] = v; else this.d[i] = v; this.cycles += size === 2 ? 4 : 8;
          }
          if (mode === 3) this.a[reg] = a;
          this.cycles += 12;
        });
        return;
      }
      case 0xe: {
        if (sz === 1) {
          const sub = (op >> 3) & 7;
          if (sub < 2) { const v = op & 15; set(op, function () { this.exception(32 + v); }); return; } // TRAP
          if (sub === 2) { set(op, function () { this.a[7] -= 4; this.w32(this.a[7], this.a[reg]); this.a[reg] = this.a[7]; this.a[7] += (this.fetch16() << 16) >> 16; this.cycles += 16; }); return; } // LINK
          if (sub === 3) { set(op, function () { this.a[7] = this.a[reg]; this.a[reg] = this.r32(this.a[7]); this.a[7] += 4; this.cycles += 12; }); return; } // UNLK
          if (sub === 4) { set(op, function () { if (!(this.sr & 0x2000)) { this.privViol(); return; } this.usp = this.a[reg]; this.cycles += 4; }); return; }
          if (sub === 5) { set(op, function () { if (!(this.sr & 0x2000)) { this.privViol(); return; } this.a[reg] = this.usp; this.cycles += 4; }); return; }
          switch (op) {
            case 0x4e70: set(op, function () { if (!(this.sr & 0x2000)) { this.privViol(); return; } if (this.onReset) this.onReset(); this.cycles += 132; }); return;
            case 0x4e71: set(op, function () { this.cycles += 4; }); return;
            case 0x4e72: set(op, function () { if (!(this.sr & 0x2000)) { this.privViol(); return; } const v = this.fetch16(); this.setSR(v); this.stopped = true; this.cycles += 4; }); return;
            case 0x4e73: set(op, function () { if (!(this.sr & 0x2000)) { this.privViol(); return; } const sr = this.r16(this.a[7]); const pc = this.r32(this.a[7] + 2); this.a[7] += 6; this.setSR(sr); this.pc = pc & 0xffffff; this.cycles += 20; }); return;
            case 0x4e75: set(op, function () { this.pc = this.r32(this.a[7]) & 0xffffff; this.a[7] += 4; this.cycles += 16; }); return;
            case 0x4e76: set(op, function () { if (this.v) this.exception(7); this.cycles += 4; }); return;
            case 0x4e77: set(op, function () { this.setCCR(this.r16(this.a[7])); this.pc = this.r32(this.a[7] + 2) & 0xffffff; this.a[7] += 6; this.cycles += 20; }); return;
          }
          return;
        }
        if (sz === 2 || sz === 3) { // JSR/JMP
          if (!validEA(mode, reg, 'ctrl')) return;
          const jsr = sz === 2;
          set(op, function () { const a = this.ea(mode, reg, 4); if (jsr) { this.a[7] -= 4; this.w32(this.a[7], this.pc); this.cycles += 8; } this.pc = a & 0xffffff; this.cycles += 4; });
        }
        return;
      }
    }
  }
}
window.M68K = M68K;

// MC6809 interpreter core. bus: r8(a), w8(a,v)

class M6809 {
  constructor(bus) { this.bus = bus; this.a = 0; this.b = 0; this.x = 0; this.y = 0; this.u = 0; this.s = 0; this.pc = 0; this.dp = 0; this.cc = 0x50; this.cycles = 0; this.nmiArmed = false; this.nmiPending = false; this.irq = 0; this.firq = 0; this.cwai = false; this.sync = false; }
  get d() { return (this.a << 8) | this.b; } set d(v) { this.a = (v >> 8) & 0xff; this.b = v & 0xff; }
  r8(a) { return this.bus.r8(a & 0xffff); } w8(a, v) { this.bus.w8(a & 0xffff, v & 0xff); }
  r16(a) { return (this.r8(a) << 8) | this.r8(a + 1); } w16(a, v) { this.w8(a, v >> 8); this.w8(a + 1, v); }
  f8() { const v = this.r8(this.pc); this.pc = (this.pc + 1) & 0xffff; return v; }
  f16() { const v = this.r16(this.pc); this.pc = (this.pc + 2) & 0xffff; return v; }
  reset() { this.cc = 0x50; this.dp = 0; this.pc = this.r16(0xfffe); this.nmiArmed = false; this.cwai = this.sync = false; }
  nmi() { if (this.nmiArmed) this.nmiPending = true; }
  // stack
  pushS(v) { this.s = (this.s - 1) & 0xffff; this.w8(this.s, v); } pullS() { const v = this.r8(this.s); this.s = (this.s + 1) & 0xffff; return v; }
  pushU(v) { this.u = (this.u - 1) & 0xffff; this.w8(this.u, v); } pullU() { const v = this.r8(this.u); this.u = (this.u + 1) & 0xffff; return v; }
  pushS16(v) { this.pushS(v); this.pushS(v >> 8); } pullS16() { const h = this.pullS(); return (h << 8) | this.pullS(); }
  pushAll() { this.pushS16(this.pc); this.pushS16(this.u); this.pushS16(this.y); this.pushS16(this.x); this.pushS(this.dp); this.pushS(this.b); this.pushS(this.a); this.pushS(this.cc); }
  interrupts() {
    if (this.nmiPending) { this.nmiPending = false; this.cwai = this.sync = false; this.cc |= 0x80; this.pushAll(); this.cc |= 0x50; this.pc = this.r16(0xfffc); this.cycles += 19; return; }
    if (this.firq && !(this.cc & 0x40)) { this.sync = false; if (this.cwai) { this.cwai = false; } else { this.cc &= 0x7f; this.pushS16(this.pc); this.pushS(this.cc); } this.cc |= 0x50; this.pc = this.r16(0xfff6); this.cycles += 10; return; }
    if (this.irq && !(this.cc & 0x10)) { this.sync = false; if (this.cwai) { this.cwai = false; } else { this.cc |= 0x80; this.pushAll(); } this.cc |= 0x10; this.pc = this.r16(0xfff8); this.cycles += 19; return; }
    if (this.sync && (this.irq || this.firq)) this.sync = false;
  }
  run(n) { const t = this.cycles + n; while (this.cycles < t) { this.interrupts(); if (this.cwai || this.sync) { this.cycles = t; break; } this.step(); } }
  // flags C=1 V=2 Z=4 N=8 I=0x10 H=0x20 F=0x40 E=0x80
  nz8(r) { this.cc = (this.cc & ~0x0c) | (r & 0x80 ? 8 : 0) | ((r & 0xff) === 0 ? 4 : 0); }
  nz16(r) { this.cc = (this.cc & ~0x0c) | (r & 0x8000 ? 8 : 0) | ((r & 0xffff) === 0 ? 4 : 0); }
  add8(a, b, c) { const r = a + b + c; this.cc = (this.cc & 0xd0) | (((a ^ b ^ r) & 0x10) ? 0x20 : 0) | (r & 0x80 ? 8 : 0) | ((r & 0xff) === 0 ? 4 : 0) | (((a ^ r) & (b ^ r) & 0x80) ? 2 : 0) | (r & 0x100 ? 1 : 0); return r & 0xff; }
  sub8(a, b, c) { const r = a - b - c; this.cc = (this.cc & 0xf0) | (r & 0x80 ? 8 : 0) | ((r & 0xff) === 0 ? 4 : 0) | (((a ^ b) & (a ^ r) & 0x80) ? 2 : 0) | (r & 0x100 ? 1 : 0); return r & 0xff; }
  add16(a, b) { const r = a + b; this.cc = (this.cc & 0xf0) | (r & 0x8000 ? 8 : 0) | ((r & 0xffff) === 0 ? 4 : 0) | (((a ^ r) & (b ^ r) & 0x8000) ? 2 : 0) | (r > 0xffff ? 1 : 0); return r & 0xffff; }
  sub16(a, b) { const r = a - b; this.cc = (this.cc & 0xf0) | (r & 0x8000 ? 8 : 0) | ((r & 0xffff) === 0 ? 4 : 0) | (((a ^ b) & (a ^ r) & 0x8000) ? 2 : 0) | (r < 0 ? 1 : 0); return r & 0xffff; }
  ld8(v) { this.cc &= ~2; this.nz8(v); return v; }
  ld16(v) { this.cc &= ~2; this.nz16(v); return v; }
  // addressing
  dirA() { return (this.dp << 8) | this.f8(); }
  extA() { return this.f16(); }
  regGet(i) { switch (i) { case 0: return this.x; case 1: return this.y; case 2: return this.u; default: return this.s; } }
  regSet(i, v) { v &= 0xffff; switch (i) { case 0: this.x = v; break; case 1: this.y = v; break; case 2: this.u = v; break; default: this.s = v; } }
  idxA() {
    const pb = this.f8(); const ri = (pb >> 5) & 3; let ea;
    if (!(pb & 0x80)) { const off = (pb & 0x10) ? (pb & 0x1f) - 32 : pb & 0x1f; this.cycles += 1; return (this.regGet(ri) + off) & 0xffff; }
    const ind = pb & 0x10;
    switch (pb & 0x0f) {
      case 0: ea = this.regGet(ri); this.regSet(ri, ea + 1); this.cycles += 2; break;
      case 1: ea = this.regGet(ri); this.regSet(ri, ea + 2); this.cycles += 3; break;
      case 2: this.regSet(ri, this.regGet(ri) - 1); ea = this.regGet(ri); this.cycles += 2; break;
      case 3: this.regSet(ri, this.regGet(ri) - 2); ea = this.regGet(ri); this.cycles += 3; break;
      case 4: ea = this.regGet(ri); break;
      case 5: ea = this.regGet(ri) + ((this.b << 24) >> 24); this.cycles += 1; break;
      case 6: ea = this.regGet(ri) + ((this.a << 24) >> 24); this.cycles += 1; break;
      case 8: { const o = (this.f8() << 24) >> 24; ea = this.regGet(ri) + o; this.cycles += 1; break; }
      case 9: { const o = (this.f16() << 16) >> 16; ea = this.regGet(ri) + o; this.cycles += 4; break; }
      case 11: ea = this.regGet(ri) + ((this.d << 16) >> 16); this.cycles += 4; break;
      case 12: { const o = (this.f8() << 24) >> 24; ea = this.pc + o; this.cycles += 1; break; }
      case 13: { const o = (this.f16() << 16) >> 16; ea = this.pc + o; this.cycles += 5; break; }
      case 15: ea = this.f16(); this.cycles += 2; break;
      default: ea = 0;
    }
    ea &= 0xffff;
    if (ind) { ea = this.r16(ea); this.cycles += 3; }
    return ea;
  }
  // exg/tfr register access
  tReg(i) { switch (i) { case 0: return this.d; case 1: return this.x; case 2: return this.y; case 3: return this.u; case 4: return this.s; case 5: return this.pc; case 8: return this.a | 0xff00; case 9: return this.b | 0xff00; case 10: return this.cc | 0xff00; case 11: return this.dp | 0xff00; default: return 0xffff; } }
  tSet(i, v) { switch (i) { case 0: this.d = v & 0xffff; break; case 1: this.x = v & 0xffff; break; case 2: this.y = v & 0xffff; break; case 3: this.u = v & 0xffff; break; case 4: this.s = v & 0xffff; this.nmiArmed = true; break; case 5: this.pc = v & 0xffff; break; case 8: this.a = v & 0xff; break; case 9: this.b = v & 0xff; break; case 10: this.cc = v & 0xff; break; case 11: this.dp = v & 0xff; break; } }
  branch(cond, long) { if (long) { const o = (this.f16() << 16) >> 16; if (cond) { this.pc = (this.pc + o) & 0xffff; this.cycles += 1; } this.cycles += 5; } else { const o = (this.f8() << 24) >> 24; if (cond) this.pc = (this.pc + o) & 0xffff; this.cycles += 3; } }
  cond(c) { const cc = this.cc, C = cc & 1, V = (cc >> 1) & 1, Z = (cc >> 2) & 1, N = (cc >> 3) & 1;
    switch (c) { case 0: return true; case 1: return false; case 2: return !(C | Z); case 3: return !!(C | Z); case 4: return !C; case 5: return !!C; case 6: return !Z; case 7: return !!Z; case 8: return !V; case 9: return !!V; case 10: return !N; case 11: return !!N; case 12: return N === V; case 13: return N !== V; case 14: return !Z && N === V; case 15: return !!Z || N !== V; } }
  // memory-op (NEG..CLR) on value
  rmw(op, v) {
    switch (op) {
      case 0x0: return this.sub8(0, v, 0);
      case 0x3: { const r = (~v) & 0xff; this.cc = (this.cc & 0xf0) | 1 | (r & 0x80 ? 8 : 0) | (r === 0 ? 4 : 0); return r; }
      case 0x4: { this.cc = (this.cc & 0xf2) | (v & 1) | 0; const r = v >> 1; this.cc = (this.cc & ~0x0c) | (r === 0 ? 4 : 0); return r; }
      case 0x6: { const r = (v >> 1) | ((this.cc & 1) << 7); this.cc = (this.cc & 0xf2) | (v & 1); this.nz8(r); return r; }
      case 0x7: { const r = (v >> 1) | (v & 0x80); this.cc = (this.cc & 0xf2) | (v & 1); this.nz8(r); return r; }
      case 0x8: { const r = (v << 1) & 0xff; this.cc = (this.cc & 0xf0) | (v & 0x80 ? 1 : 0) | (((v ^ (v << 1)) & 0x80) ? 2 : 0); this.nz8(r); return r; }
      case 0x9: { const r = ((v << 1) | (this.cc & 1)) & 0xff; this.cc = (this.cc & 0xf0) | (v & 0x80 ? 1 : 0) | (((v ^ (v << 1)) & 0x80) ? 2 : 0); this.nz8(r); return r; }
      case 0xa: { const r = (v - 1) & 0xff; this.cc = (this.cc & 0xf1) | (v === 0x80 ? 2 : 0); this.nz8(r); return r; }
      case 0xc: { const r = (v + 1) & 0xff; this.cc = (this.cc & 0xf1) | (v === 0x7f ? 2 : 0); this.nz8(r); return r; }
      case 0xd: this.cc &= ~2; this.nz8(v); return -1;
      case 0xf: this.cc = (this.cc & 0xf0) | 4; return 0;
    }
    return -2;
  }
  // ALU ops on accumulator: op = low nibble of 0x80-0xff group
  alu(op, acc, m) {
    switch (op) {
      case 0x0: return this.sub8(acc, m, 0);
      case 0x1: this.sub8(acc, m, 0); return acc;
      case 0x2: return this.sub8(acc, m, this.cc & 1);
      case 0x4: return this.ld8(acc & m);
      case 0x5: this.ld8(acc & m); return acc;
      case 0x6: return this.ld8(m);
      case 0x8: return this.ld8(acc ^ m);
      case 0x9: return this.add8(acc, m, this.cc & 1);
      case 0xa: return this.ld8(acc | m);
      case 0xb: return this.add8(acc, m, 0);
    }
  }
  step() {
    const op = this.f8();
    if (op === 0x10) return this.page2(this.f8());
    if (op === 0x11) return this.page3(this.f8());
    const hi = op >> 4, lo = op & 15;
    // memory rmw: 0x00 direct, 0x60 indexed, 0x70 extended; 0x40/0x50 A/B inherent
    if (hi === 0 || hi === 6 || hi === 7) {
      const ea = hi === 0 ? this.dirA() : hi === 6 ? this.idxA() : this.extA();
      this.cycles += hi === 0 ? 6 : hi === 6 ? 6 : 7;
      if (lo === 0xe) { this.pc = ea; this.cycles -= 3; return; } // JMP
      const r = this.rmw(lo, this.r8(ea)); if (r >= 0) this.w8(ea, r); return;
    }
    if (hi === 4 || hi === 5) { const r = this.rmw(lo, hi === 4 ? this.a : this.b); if (r >= 0) { if (hi === 4) this.a = r; else this.b = r; } this.cycles += 2; return; }
    if (hi === 2) { this.branch(this.cond(lo), false); return; }
    if (hi >= 8) {
      const isB = hi >= 0xc, mode = hi & 3; // 0 imm,1 dir,2 idx,3 ext
      // 16-bit ops
      if (lo === 3 || lo === 0xc || lo === 0xe || (lo === 0xd && mode !== 0) || (lo === 0xf && mode !== 0) || (lo === 0xd && mode === 0 && !isB)) return this.op16(op, isB, lo, mode);
      if (lo === 0xd && isB && mode === 0) { /* LDD imm */ }
      let ea = 0, m;
      if (lo === 7) { // STA/STB
        ea = mode === 1 ? this.dirA() : mode === 2 ? this.idxA() : this.extA();
        const v = isB ? this.b : this.a; this.ld8(v); this.w8(ea, v); this.cycles += mode === 1 ? 4 : mode === 2 ? 4 : 5; return;
      }
      if (mode === 0) { m = this.f8(); this.cycles += 2; }
      else { ea = mode === 1 ? this.dirA() : mode === 2 ? this.idxA() : this.extA(); m = this.r8(ea); this.cycles += mode === 1 ? 4 : mode === 2 ? 4 : 5; }
      if (isB) this.b = this.alu(lo, this.b, m); else this.a = this.alu(lo, this.a, m);
      return;
    }
    switch (op) {
      case 0x12: this.cycles += 2; return; // NOP
      case 0x13: this.sync = true; this.cycles += 4; return;
      case 0x16: { const o = this.f16(); this.pc = (this.pc + o) & 0xffff; this.cycles += 5; return; }
      case 0x17: { const o = this.f16(); this.pushS16(this.pc); this.pc = (this.pc + o) & 0xffff; this.cycles += 9; return; }
      case 0x19: { // DAA
        let c = 0, lsn = this.a & 15, msn = this.a >> 4;
        if ((this.cc & 0x20) || lsn > 9) c |= 6;
        if ((this.cc & 1) || msn > 9 || (msn > 8 && lsn > 9)) c |= 0x60;
        const r = this.a + c; this.a = r & 0xff; this.cc = (this.cc & ~0x0e) | (r & 0x100 ? 1 : (this.cc & 1)); this.nz8(this.a); this.cycles += 2; return; }
      case 0x1a: this.cc |= this.f8(); this.cycles += 3; return;
      case 0x1c: this.cc &= this.f8(); this.cycles += 3; return;
      case 0x1d: this.a = (this.b & 0x80) ? 0xff : 0; this.nz16(this.d); this.cc &= ~2; this.cycles += 2; return;
      case 0x1e: { const p = this.f8(), r1 = p >> 4, r2 = p & 15; const v1 = this.tReg(r1), v2 = this.tReg(r2); this.tSet(r1, v2); this.tSet(r2, v1); this.cycles += 8; return; }
      case 0x1f: { const p = this.f8(); this.tSet(p & 15, this.tReg(p >> 4)); this.cycles += 6; return; }
      case 0x30: case 0x31: { const ea = this.idxA(); if (op === 0x30) this.x = ea; else this.y = ea; this.cc = (this.cc & ~4) | (ea === 0 ? 4 : 0); this.cycles += 4; return; }
      case 0x32: this.s = this.idxA(); this.nmiArmed = true; this.cycles += 4; return;
      case 0x33: this.u = this.idxA(); this.cycles += 4; return;
      case 0x34: case 0x36: { const p = this.f8(), U = op === 0x36; const push = U ? (v) => this.pushU(v) : (v) => this.pushS(v); const p16 = (v) => { push(v); push(v >> 8); };
        if (p & 0x80) p16(this.pc); if (p & 0x40) p16(U ? this.s : this.u); if (p & 0x20) p16(this.y); if (p & 0x10) p16(this.x); if (p & 8) push(this.dp); if (p & 4) push(this.b); if (p & 2) push(this.a); if (p & 1) push(this.cc); this.cycles += 5 + this.popcnt(p); return; }
      case 0x35: case 0x37: { const p = this.f8(), U = op === 0x37; const pull = U ? () => this.pullU() : () => this.pullS(); const p16 = () => { const h = pull(); return (h << 8) | pull(); };
        if (p & 1) this.cc = pull(); if (p & 2) this.a = pull(); if (p & 4) this.b = pull(); if (p & 8) this.dp = pull(); if (p & 0x10) this.x = p16(); if (p & 0x20) this.y = p16(); if (p & 0x40) { if (U) this.s = p16(); else this.u = p16(); } if (p & 0x80) this.pc = p16(); this.cycles += 5 + this.popcnt(p); return; }
      case 0x39: this.pc = this.pullS16(); this.cycles += 5; return;
      case 0x3a: this.x = (this.x + this.b) & 0xffff; this.cycles += 3; return;
      case 0x3b: this.cc = this.pullS(); if (this.cc & 0x80) { this.a = this.pullS(); this.b = this.pullS(); this.dp = this.pullS(); this.x = this.pullS16(); this.y = this.pullS16(); this.u = this.pullS16(); this.cycles += 9; } this.pc = this.pullS16(); this.cycles += 6; return;
      case 0x3c: this.cc &= this.f8(); this.cc |= 0x80; this.pushAll(); this.cwai = true; this.cycles += 20; return;
      case 0x3d: { const r = this.a * this.b; this.d = r; this.cc = (this.cc & ~5) | (r === 0 ? 4 : 0) | (r & 0x80 ? 1 : 0); this.cycles += 11; return; }
      case 0x3f: this.cc |= 0x80; this.pushAll(); this.cc |= 0x50; this.pc = this.r16(0xfffa); this.cycles += 19; return;
    }
    if (op === 0x8d) { const o = (this.f8() << 24) >> 24; this.pushS16(this.pc); this.pc = (this.pc + o) & 0xffff; this.cycles += 7; return; }
    this.illegal(op);
  }
  popcnt(p) { let n = 0; for (let i = 0; i < 8; i++) if (p & (1 << i)) n += i >= 4 ? 2 : 1; return n; }
  illegal(op) { if (this.onIllegal) this.onIllegal(this.pc - 1, op); this.cycles += 2; }
  op16(op, isB, lo, mode) {
    // lo 3: SUBD(A)/ADDD(B); C: CMPX(A)/LDD(B); D: JSR(A, non-imm) / STD(B); E: LDX(A)/LDU(B); F: STX(A)/STU(B); 0x8D=BSR handled elsewhere
    const getEA = () => mode === 1 ? this.dirA() : mode === 2 ? this.idxA() : this.extA();
    const cyc = mode === 0 ? 3 : mode === 1 ? 5 : mode === 2 ? 5 : 6;
    const rd = () => { if (mode === 0) return this.f16(); return this.r16(getEA()); };
    this.cycles += cyc;
    if (lo === 3) { const m = rd(); this.d = isB ? this.add16(this.d, m) : this.sub16(this.d, m); return; }
    if (lo === 0xc) { if (!isB) { this.sub16(this.x, rd()); } else this.d = this.ld16(rd()); return; }
    if (lo === 0xd) { if (!isB) { if (mode === 0) { const o = (this.f8() << 24) >> 24; this.pushS16(this.pc); this.pc = (this.pc + o) & 0xffff; return; } const ea = getEA(); this.pushS16(this.pc); this.pc = ea; this.cycles += 2; return; }
      const ea = getEA(); this.ld16(this.d); this.w16(ea, this.d); return; }
    if (lo === 0xe) { const v = this.ld16(rd()); if (isB) this.u = v; else this.x = v; return; }
    if (lo === 0xf) { const ea = getEA(); const v = isB ? this.u : this.x; this.ld16(v); this.w16(ea, v); return; }
  }
  page2(op) {
    const hi = op >> 4, lo = op & 15;
    if (hi === 2) { this.branch(this.cond(lo), true); return; }
    if (op === 0x3f) { this.cc |= 0x80; this.pushAll(); this.pc = this.r16(0xfff4); this.cycles += 20; return; }
    if (hi >= 8) {
      const isB = hi >= 0xc, mode = hi & 3;
      const getEA = () => mode === 1 ? this.dirA() : mode === 2 ? this.idxA() : this.extA();
      const rd = () => mode === 0 ? this.f16() : this.r16(getEA());
      this.cycles += mode === 0 ? 5 : 7;
      if (lo === 3 && !isB) { this.sub16(this.d, rd()); return; } // CMPD
      if (lo === 0xc && !isB) { this.sub16(this.y, rd()); return; } // CMPY
      if (lo === 0xe) { const v = this.ld16(rd()); if (isB) { this.s = v; this.nmiArmed = true; } else this.y = v; return; } // LDY / LDS
      if (lo === 0xf) { const ea = getEA(); const v = isB ? this.s : this.y; this.ld16(v); this.w16(ea, v); return; } // STY/STS
    }
    this.illegal(0x1000 | op);
  }
  page3(op) {
    if (op === 0x3f) { this.cc |= 0x80; this.pushAll(); this.pc = this.r16(0xfff2); this.cycles += 20; return; }
    const hi = op >> 4, lo = op & 15;
    if (hi >= 8 && hi < 0xc) {
      const mode = hi & 3; const getEA = () => mode === 1 ? this.dirA() : mode === 2 ? this.idxA() : this.extA();
      const m = mode === 0 ? this.f16() : this.r16(getEA()); this.cycles += mode === 0 ? 5 : 7;
      if (lo === 3) { this.sub16(this.u, m); return; } if (lo === 0xc) { this.sub16(this.s, m); return; }
    }
    this.illegal(0x1100 | op);
  }
}
if (typeof module !== 'undefined') module.exports = M6809; else window.M6809 = M6809;

// Freedom Fighter (Millennium Games 1986/87) dedicated board - machine emulation
// MC68000 + TMS34061 bg + microcoded 16x16 object hw + MC68440 DMA + 2x MC6821 + ADC0808
// + Philips 22VP931 laserdisc (HLE, protocol from ROM) + video expander

(function (G) {
const M68K = (typeof module !== 'undefined') ? require('./m68k.js') : G.M68K;

class PIA6821 {
  constructor(name) { this.name = name; this.reset(); this.inA = 0xff; this.inB = 0xff; this.onWrite = null; }
  reset() { this.ora = 0; this.orb = 0; this.ddra = 0; this.ddrb = 0; this.cra = 0; this.crb = 0; this.ca1 = 1; this.cb1 = 1; this.ca2 = 1; this.cb2 = 1; }
  get irqA() { return ((this.cra & 0x80) && (this.cra & 1)) || ((this.cra & 0x40) && (this.cra & 0x28) === 0x08) ? 1 : 0; }
  get irqB() { return ((this.crb & 0x80) && (this.crb & 1)) || ((this.crb & 0x40) && (this.crb & 0x28) === 0x08) ? 1 : 0; }
  read(r) {
    switch (r & 3) {
      case 0: if (this.cra & 4) { this.cra &= 0x3f; return ((this.inA() & ~this.ddra) | (this.ora & this.ddra)) & 0xff; } return this.ddra;
      case 1: return this.cra;
      case 2: if (this.crb & 4) { this.crb &= 0x3f; return ((this.inB() & ~this.ddrb) | (this.orb & this.ddrb)) & 0xff; } return this.ddrb;
      case 3: return this.crb;
    }
  }
  write(r, v) {
    switch (r & 3) {
      case 0: if (this.cra & 4) { this.ora = v; this.onWrite && this.onWrite('A', v); } else this.ddra = v; break;
      case 1: this.cra = (this.cra & 0xc0) | (v & 0x3f); if (v & 0x20) this.ca2 = (v & 0x18) === 0x18 ? 1 : (v & 0x18) === 0x10 ? 0 : this.ca2; this.onWrite && this.onWrite('CRA', v); break;
      case 2: if (this.crb & 4) { this.orb = v; this.onWrite && this.onWrite('B', v); } else this.ddrb = v; break;
      case 3: this.crb = (this.crb & 0xc0) | (v & 0x3f); if (v & 0x20) this.cb2 = (v & 0x18) === 0x18 ? 1 : (v & 0x18) === 0x10 ? 0 : this.cb2; this.onWrite && this.onWrite('CRB', v); break;
    }
  }
  setCA1(s) { if (s !== this.ca1) { const rising = s > this.ca1; if (rising === !!(this.cra & 2)) this.cra |= 0x80; this.ca1 = s; } }
  setCB1(s) { if (s !== this.cb1) { const rising = s > this.cb1; if (rising === !!(this.crb & 2)) this.crb |= 0x80; this.cb1 = s; } }
  outA() { return (this.ora & this.ddra) | (~this.ddra & 0xff); }
  outB() { return (this.orb & this.ddrb) | (~this.ddrb & 0xff); }
}

// ---- Philips 22VP931 high-level emulation (status/command protocol as used by the FFR ROM)
class VP931 {
  constructor() { this.frame = 1; this.playing = true; this.speed = 1; this.field = 0; this.out = []; this.outIdx = 99; this.cmd = []; this.log = []; this.seekDelay = 0; this.pendingFrame = -1; this.audio = [1, 1]; this.videoOn = true; this.skipCount = 0; }
  get dav() { return this.outIdx < this.out.length; } // status data available
  read() { const v = this.outIdx < this.out.length ? this.out[this.outIdx] : 0; this.outIdx++; return v; }
  doReset() { this.resetState = true; this.cmd = []; this.playing = false; }
  write(b) {
    this.resetState = false;
    this.cmd.push(b & 0xff);
    if (this.cmd.length === 3) { this.exec(this.cmd); this.cmd = []; }
  }
  bcd(b) { return (b >> 4) * 10 + (b & 15); }
  exec(c) {
    if (this.log.length < 4000) this.log.push(c.map(x => x.toString(16).padStart(2, '0')).join(' ') + ' @' + this.frame);
    const hi = c[0] & 0xf0;
    if (c[0] === 0x00) {
      if (c[1] === 0x00) { this.playing = true; this.speed = 1; }
      else if (c[1] === 0x20) { this.playing = false; }
      else if ((c[1] & 0xf0) === 0xe0) { const n = (c[1] & 15) * 100 + this.bcd(c[2]); this.skip = n; }
      else if ((c[1] & 0xf0) === 0xf0) { const n = (c[1] & 15) * 100 + this.bcd(c[2]); this.skip = -n; }
    } else if (c[0] === 0x02) { /* audio channel control */ this.audioCmd = c.slice(); }
    else if (hi === 0xf0 || hi === 0xd0 || hi === 0xe0) { // search & play / search & halt
      const f = (c[0] & 15) * 10000 + this.bcd(c[1]) * 100 + this.bcd(c[2]);
      this.pendingFrame = f; this.pendingPlay = hi === 0xf0;
      const dist = Math.abs(f - this.frame);
      this.seekDelay = dist < 3 ? 1 : Math.min(40, 2 + Math.floor(dist / 900)); // fields
    } else if (c[0] === 0x01) { /* init */ }
  }
  // called at start of every video field; returns true if IRQ/DAV should be raised
  vsync() {
    this.field ^= 1;
    if (this.pendingFrame >= 0) {
      if (--this.seekDelay <= 0) { this.frame = this.pendingFrame; this.pendingFrame = -1; this.playing = this.pendingPlay; this.searching = false; this.fieldPhase = 0; }
      else this.searching = true;
    } else if (this.skip) { this.frame += this.skip; this.skip = 0; }
    else if (this.playing && this.field === 0) this.frame++;
    const f = this.frame;
    const d = [Math.floor(f / 10000) % 10, Math.floor(f / 1000) % 10, Math.floor(f / 100) % 10, Math.floor(f / 10) % 10, f % 10];
    if (this.resetState) { this.out = [0, 0, 0, 2, 0, 0]; this.outIdx = 0; return true; }
    const b0 = (this.field === 0 ? 0xf8 : 0xa8) | (d[0] & 7);
    this.out = [b0, (d[1] << 4) | d[2], (d[3] << 4) | d[4], 0, 0, 0];
    this.outIdx = 0;
    return true;
  }
}

class FFMachine {
  constructor(rom, opts = {}) {
    this.rom = rom; // Uint8Array 0x60000 mapped at 0x200000
    this.ram = new Uint8Array(0x4000);
    this.obj = new Uint8Array(0x8000);
    this.pal = new Uint8Array(0x800);
    this.eep = new Uint8Array(0x400).fill(0xff);
    this.vram = new Uint8Array(0x20000);
    this.dmaRegs = new Uint8Array(0x100);
    this.tms = new Uint16Array(18);
    this.tmsIrq = 0;
    this.led = 0xff; this.ledLog = [];
    this.clock = opts.clock || 8000000;
    this.lines = 262; this.cycPerLine = Math.round(this.clock / 60 / this.lines);
    this.line = 0; this.frameCount = 0;
    this.input = { coin: 0, trigger: 0, test: 0, slomo: 0, x: 128, y: 128 };
    this.adc = { pending: -1, chan: 0, value: 0, irq: 0 };
    this.vp = new VP931();
    this.pia1 = new PIA6821('4010'); this.pia2 = new PIA6821('4020');
    const self = this;
    this.pia1.inA = () => { // coins bits 4,6,7 active low; bit5 test switch active low
      let v = 0xff; if (self.input.coin) v &= ~0x10; if (self.input.test) v &= ~0x20; return v; };
    this.pia1.inB = () => 0xff;
    this.pia2.inA = () => { // bit6 DAV (active low), bit7 DAK (ready), bit3 trigger (low), bit5 slo-mo (low)
      let v = 0xff; if (self.vp.dav) v &= ~0x40; if (self.input.trigger) v &= ~0x08; if (self.input.slomo) v &= ~0x20; return v; };
    this.pia2.inB = () => 0xff;
    this.soundLatch = 0; this.soundCmds = [];
    this.pia1.onWrite = (p, v) => { if (p === 'B') { this.soundLatch = v; if (this.soundCmds.length < 5000) this.soundCmds.push([this.frameCount, v]); if (this.snd) this.snd.command(v); else this.soundAck = 40; } };
    this.snd = opts.sound || null;
    if (this.snd) this.snd.onAck = () => { this.pia1.setCB1(1); this.pia1.setCB1(0); };
    this.audioRate = 48000; this.audioBuf = new Float32Array(4096); this.audioLen = 0; this.sndAcc = 0;
    this.pia2.onWrite = (p, v) => { if (p === 'CRA') { const ca2 = (v & 0x38) === 0x38 ? 1 : (v & 0x38) === 0x30 ? 0 : -1; if (ca2 === 0) this.vp.doReset(); } };
    this.cpu = new M68K(this);
    this.cpu.irqAck = (lvl) => -1;
    this.cpu.getIrq = () => { this.updateIRQ(); return this.cpu.irqLevel; };
    this.cpu.onIllegal = (pc, op) => { if (this.onLog) this.onLog('ILLEGAL ' + pc.toString(16) + ' ' + op.toString(16)); };
    this.busErrors = 0;
    this.fb = new Uint32Array(320 * 240);
    this.dmaCycles = 0;
  }
  reset() {
    if (this.snd) this.snd.reset();
    this.cpu.a[7] = 0x2000; this.cpu.ssp = 0x2000; this.cpu.pc = 0x254000; this.cpu.sr = 0x2700;
    this.pia1.reset(); this.pia2.reset();
  }
  // ---------------- bus
  r8(a) {
    if (a < 0x4000) return this.ram[a];
    if (a >= 0x200000 && a < 0x260000) return this.rom[a - 0x200000];
    if (a >= 0x8000 && a < 0x10000) return this.obj[a - 0x8000];
    if (a >= 0x1c0000 && a < 0x1e0000) return this.vram[a - 0x1c0000];
    if (a < 0x4070) return this.io_r(a);
    if (a >= 0x10000 && a < 0x14000) return this.pal[a & 0x7ff];
    if (a >= 0x14000 && a < 0x14100) return this.dma_r(a & 0xff);
    if (a >= 0x1c000 && a < 0x1c400) return this.eep[a - 0x1c000];
    if (a >= 0x100000 && a < 0x100100) return this.tms_r(a & 0xff);
    this.busErrors++; return 0xff;
  }
  r16(a) {
    if (a < 0x4000) return (this.ram[a] << 8) | this.ram[a + 1];
    if (a >= 0x200000 && a < 0x260000) { const o = a - 0x200000; return (this.rom[o] << 8) | this.rom[o + 1]; }
    return (this.r8(a) << 8) | this.r8(a + 1);
  }
  w8(a, v) {
    if (a < 0x4000) { this.ram[a] = v; return; }
    if (a >= 0x1c0000 && a < 0x1e0000) { this.vram[a - 0x1c0000] = v; return; }
    if (a >= 0x8000 && a < 0x10000) { this.obj[a - 0x8000] = v; return; }
    if (a < 0x4070) { this.io_w(a, v); return; }
    if (a >= 0x10000 && a < 0x14000) { this.pal[a & 0x7ff] = v; return; }
    if (a >= 0x14000 && a < 0x14100) { this.dma_w(a & 0xff, v); return; }
    if (a >= 0x1c000 && a < 0x1c400) { this.eep[a - 0x1c000] = v; return; }
    if (a >= 0x100000 && a < 0x100100) { this.tms_w(a & 0xff, v); return; }
    this.busErrors++;
  }
  w16(a, v) { this.w8(a, v >> 8); this.w8(a + 1, v & 0xff); }
  io_r(a) {
    if (a === 0x4001) { const v = this.vp.read(); return v; }
    if (a >= 0x4010 && a < 0x4018) return (a & 1) ? this.pia1.read((a >> 1) & 3) : 0xff;
    if (a >= 0x4020 && a < 0x4028) return (a & 1) ? this.pia2.read((a >> 1) & 3) : 0xff;
    if (a === 0x404d || a === 0x404f) { this.adcStart(a === 0x404d ? 0 : 1); return 0xff; }
    if (a >= 0x4050 && a < 0x4060) { this.adc.irq = 0; return this.adc.value; }
    return 0xff;
  }
  io_w(a, v) {
    if (a === 0x4001) { this.vp.write(v); return; }
    if (a >= 0x4010 && a < 0x4018) { if (a & 1) this.pia1.write((a >> 1) & 3, v); return; }
    if (a >= 0x4020 && a < 0x4028) { if (a & 1) this.pia2.write((a >> 1) & 3, v); return; }
    if (a >= 0x4030 && a < 0x4040) { this.ptm = this.ptm || new Uint8Array(16); this.ptm[a & 15] = v; return; }
    if (a === 0x404d || a === 0x404f) { this.adcStart(a === 0x404d ? 0 : 1); return; }
    if (a >= 0x4060 && a < 0x4070) { if (v !== this.led) { this.led = v; if (this.ledLog.length < 500) this.ledLog.push([this.frameCount, v, this.cpu.ppc]); } return; }
  }
  adcStart(ch) { this.adc.chan = ch; this.adc.pending = 800; /* ~100us @8MHz */ }
  adcValue(ch) { return ch === 0 ? (this.input.y & 0xff) : (this.input.x & 0xff); }
  // ---------------- TMS34061 (register mode addresses 0x100001 + 4*n : n = reg*2 + hi)
  tms_r(o) {
    const n = o >> 2, reg = n >> 1, hi = n & 1;
    if (reg === 13) { const v = this.tmsIrq ? 1 : 0; if (!hi) this.tmsIrq = 0; return hi ? 0 : v; }
    if (reg === 17) { const l = this.line; return hi ? (l >> 8) : (l & 0xff); }
    if (reg < 18) return hi ? this.tms[reg] >> 8 : this.tms[reg] & 0xff;
    return 0;
  }
  tms_w(o, v) {
    const n = o >> 2, reg = n >> 1, hi = n & 1;
    if (reg < 18) this.tms[reg] = hi ? (this.tms[reg] & 0xff) | (v << 8) : (this.tms[reg] & 0xff00) | v;
  }
  // ---------------- MC68440 DMA
  dma_r(o) { const ch = (o >> 6) & 1, r = o & 0x3f; if (r === 0) return this.dmaRegs[o] | 0x80; return this.dmaRegs[o]; }
  dma_w(o, v) {
    const ch = (o >> 6) & 1, r = o & 0x3f;
    if (r === 0) { this.dmaRegs[o] &= ~v; return; }
    this.dmaRegs[o] = v;
    if (r === 7 && (v & 0x80)) this.dmaRun(ch);
  }
  dmaRun(ch) {
    const b = ch * 0x40, R = this.dmaRegs;
    const ocr = R[b + 5], scr = R[b + 6];
    let mtc = (R[b + 0xa] << 8) | R[b + 0xb];
    let mar = ((R[b + 0xc] << 24) | (R[b + 0xd] << 16) | (R[b + 0xe] << 8) | R[b + 0xf]) & 0xffffff;
    let dar = ((R[b + 0x14] << 24) | (R[b + 0x15] << 16) | (R[b + 0x16] << 8) | R[b + 0x17]) & 0xffffff;
    const size = ((ocr >> 4) & 3) === 0 ? 1 : ((ocr >> 4) & 3) === 1 ? 2 : 4;
    const toDev = !(ocr & 0x80);
    const mac = (scr >> 2) & 3, dac = scr & 3;
    const n = mtc === 0 ? 0x10000 : mtc;
    for (let i = 0; i < n; i++) {
      const src = toDev ? mar : dar, dst = toDev ? dar : mar;
      if (size === 1) this.w8(dst, this.r8(src));
      else if (size === 2) this.w16(dst, this.r16(src));
      else { this.w16(dst, this.r16(src)); this.w16(dst + 2, this.r16(src + 2)); }
      if (mac === 1) mar += size; else if (mac === 2) mar -= size;
      if (dac === 1) dar += size; else if (dac === 2) dar -= size;
    }
    this.dmaCycles += n * (size === 4 ? 16 : 8);
    R[b + 0xa] = 0; R[b + 0xb] = 0;
    R[b + 0xc] = mar >>> 24; R[b + 0xd] = mar >> 16; R[b + 0xe] = mar >> 8; R[b + 0xf] = mar;
    R[b + 0x14] = dar >>> 24; R[b + 0x15] = dar >> 16; R[b + 0x16] = dar >> 8; R[b + 0x17] = dar;
    R[b] = 0x80; // COC
    R[b + 7] &= 0x7f;
  }
  // ---------------- interrupts
  updateIRQ() {
    let l = 0;
    const tmsEn = this.tms[11] & 0x0400;
    if (this.adc.irq) l = 1;
    if (this.tmsIrq && tmsEn) l = 3;
    if (this.pia2.irqA) l = 4;
    if (this.pia1.irqA || this.pia1.irqB) l = Math.max(l, 6);
    this.cpu.irqLevel = l;
  }
  runLine() {
    // start-of-field events
    if (this.line === 0) {
      this.vp.vsync();
      this.pia2.setCA1(1); this.pia2.setCA1(0); // disc field interrupt (falling edge)
      this.tmsIrq = 1;
    }
    let c = this.cycPerLine;
    if (this.dmaCycles) { const d = Math.min(this.dmaCycles, c); this.dmaCycles -= d; c -= d; this.cpu.cycles += d; }
    // split line into small slices for ADC timing
    while (c > 0) {
      const slice = Math.min(c, 128);
      this.updateIRQ();
      const before = this.cpu.cycles;
      this.cpu.run(slice);
      const used = this.cpu.cycles - before; c -= used > 0 ? used : slice;
      if (this.adc.pending >= 0) { this.adc.pending -= slice; if (this.adc.pending < 0) { this.adc.value = this.adcValue(this.adc.chan); this.adc.irq = 1; } }
    }
    if (this.soundAck > 0 && --this.soundAck === 0) { this.pia1.setCB1(1); this.pia1.setCB1(0); }
    if (this.snd) { this.sndAcc += this.audioRate / (59.94 * this.lines); const n = Math.floor(this.sndAcc); if (n > 0) { this.sndAcc -= n; if (this.audioLen + n > this.audioBuf.length) this.audioLen = 0; this.snd.render(this.audioBuf, this.audioLen, n); this.audioLen += n; } }
    this.line++;
    if (this.line >= this.lines) { this.line = 0; this.frameCount++; }
  }
  runFrame() { do { this.runLine(); } while (this.line !== 0); }
  // ---------------- video
  palColor(i) { const o = (i & 0xff) * 2; return (this.pal[o] << 8) | this.pal[o + 1]; }
  // renders 320x240; ld(x,y) callback returns RGB of laserdisc (already expander-mapped)
  render(ld) {
    const fb = this.fb;
    const start = ((this.tms[9] << 7) & 0x1ffff);
    // object line buffer
    const objLine = new Uint8Array(320 * 240);
    this.drawObjects(objLine);
    for (let y = 0; y < 240; y++) {
      const rowBase = (start + y * 256) & 0x1ffff;
      for (let x = 0; x < 320; x++) {
        const b = this.vram[(rowBase + (x >> 1)) & 0x1ffff];
        const bg = (x & 1) ? (b & 15) : (b >> 4);
        const ob = objLine[y * 320 + x];
        const c = this.palColor((ob << 4) | (ob ? 0 : bg));
        let rgb;
        if (c & 0x8000) {
          const r = (c >> 10) & 31, g = (c >> 5) & 31, bl = c & 31;
          rgb = ((r << 3) | (r >> 2)) | (((g << 3) | (g >> 2)) << 8) | (((bl << 3) | (bl >> 2)) << 16);
        } else rgb = ld ? ld(x, y) : 0;
        fb[y * 320 + x] = 0xff000000 | rgb;
      }
    }
    return fb;
  }
  drawObjects(buf) {
    // display list at 0x8000: [X.w][obj.b][Y.b], image data at 0x8000 + obj*128 (16x16 4bpp, rows of 8 bytes)
    const O = this.obj;
    for (let i = 0; i < 0xc0; i++) {
      const e = i * 4;
      const X = (O[e] << 8) | O[e + 1], n = O[e + 2], Y = O[e + 3];
      if (Y === 0xec || n === 0) continue;
      const top = this.objYBase - Y, left = X - this.objXBase;
      const base = n * 128;
      for (let r = 0; r < 16; r++) {
        const yy = top + r; if (yy < 0 || yy >= 240) continue;
        for (let c = 0; c < 16; c++) {
          const xx = left + c; if (xx < 0 || xx >= 320) continue;
          const byte = O[(base + r * 8 + (c >> 1)) & 0x7fff];
          const p = (c & 1) ? byte & 15 : byte >> 4;
          if (p) buf[yy * 320 + xx] = p;
        }
      }
    }
  }
  // preset the self-adjusting joystick calibration (game learns extremes by itself on a real cabinet)
  calibrate(lo = 8, hi = 247) {
    const R = this.ram;
    for (const [b, v] of [[0x1058, lo], [0x1062, hi], [0x106c, lo], [0x1076, hi]]) { for (let i = 0; i < 4; i++) R[b + i] = v; R[b + 9] = v; }
  }
  get expanderOn() { return !!this.pia2.cb2; }
  get expanderStart() { return ((this.pia2.outA() & 1) << 8) | this.pia2.outB(); }
}
FFMachine.prototype.objYBase = 207;
FFMachine.prototype.objXBase = 0x38;
if (typeof module !== 'undefined') module.exports = { FFMachine, VP931, PIA6821 };
else { G.FFMachine = FFMachine; }
})(typeof window !== 'undefined' ? window : globalThis);

// Freedom Fighter digital audio PCB: MC6809 (J1) + MC6844 DMA (L1) + 4 x MC3418 CVSD, 8 x 27256 sample ROMs
// Memory map reverse engineered from FFA61A (program):
//   0000-7FFF  data ROM selected by $B000 (active-low one-hot: bit n -> ROM n; $FF -> 1A)   (CPU test path)
//   9000       read: IRQ acknowledge          9800  write: status LEDs
//   A000       read: command latch (FIRQ)     A800-A803 write: channel n  [hi nibble volume mask | lo nibble clock rate]
//   B000       write: CPU ROM bank            B008-B00F write: DMA bank RAM (C5), entry 2n+A15 = ~page
//   B800-B816  MC6844                         C000-C7FF RAM          E000-FFFF program (top 8K of 1A)

(function (G) {
const M6809 = (typeof module !== 'undefined') ? require('./m6809.js') : G.M6809;
class FFSound {
  constructor(romA, dataRoms, opts = {}) {
    this.romA = romA; this.data = dataRoms; // array of 8 Uint8Array(0x8000): 1FG,1E,1D,1BC,2FG,2E,2D,2BC
    this.ram = new Uint8Array(0x800);
    this.clock = opts.clock || 1000000;          // 6809 E clock (assumed)
    this.cvsdBase = opts.cvsdBase || 100000;      // channel bit clock = base / (16 - rate)
    this.rate = opts.sampleRate || 48000;
    this.cpu = new M6809(this);
    this.latch = 0; this.leds = 0xff; this.cpuBank = 0xff;
    this.bankRam = new Uint8Array(8);
    this.dma = new Uint8Array(0x20);
    this.ch = [0, 1, 2, 3].map(i => ({ ctl: 0x0e, addr: 0, count: 0, busy: false, dend: false, sr: 0, byte: 0, bitsLeft: 0, acc: 0, integ: 0, filt: 0.0416, lp: 0 }));
    this.onAck = null; this.cmdLog = [];
    this.master = 1; this.chanMute = [0, 0, 0, 0];
    this.setRate(this.rate);
    this.cpu.reset();
  }
  setRate(r) { this.rate = r; }
  reset() { this.cpu.reset(); this.cpu.firq = 0; for (const c of this.ch) { c.busy = false; c.integ = 0; } }
  command(v) { this.latch = v & 0xff; this.cpu.firq = 1; if (this.cmdLog.length < 2000) this.cmdLog.push(v); }
  // ---- CPU bus
  r8(a) {
    if (a >= 0xe000) return this.romA[0x6000 + (a - 0xe000)];
    if (a >= 0xc000 && a < 0xc800) return this.ram[a - 0xc000];
    if (a < 0x8000) { const b = this.cpuBank; if (b === 0xff) return this.romA[a]; for (let i = 0; i < 8; i++) if (!(b & (1 << i))) return this.data[i][a]; return 0xff; }
    if (a >= 0xb800 && a < 0xb820) return this.dmaRead(a & 0x1f);
    if ((a & 0xf800) === 0x9000) { this.cpu.irq = 0; return 0xff; }
    if ((a & 0xf800) === 0xa000) { this.cpu.firq = 0; if (this.onAck) this.onAck(); return this.latch; }
    return 0xff;
  }
  w8(a, v) {
    if (a >= 0xc000 && a < 0xc800) { this.ram[a - 0xc000] = v; return; }
    if (a >= 0xb800 && a < 0xb820) { this.dmaWrite(a & 0x1f, v); return; }
    if ((a & 0xf800) === 0xa800) { this.ch[a & 3].ctl = v; return; }
    if ((a & 0xf800) === 0x9800) { this.leds = v; return; }
    if (a >= 0xb008 && a < 0xb010) { this.bankRam[a - 0xb008] = v & 15; return; }
    if ((a & 0xfff8) === 0xb000) { this.cpuBank = v; return; }
  }
  // ---- MC6844
  dmaRead(r) {
    if (r < 0x10) { const c = this.ch[r >> 2]; switch (r & 3) { case 0: return c.addr >> 8; case 1: return c.addr & 0xff; case 2: return c.count >> 8; case 3: return c.count & 0xff; } }
    if (r < 0x14) { const c = this.ch[r - 0x10]; const v = (this.dma[r] & 0x0f) | (c.busy ? 0x40 : 0) | (c.dend ? 0x80 : 0); c.dend = false; return v; }
    return this.dma[r];
  }
  dmaWrite(r, v) {
    if (r < 0x10) { const c = this.ch[r >> 2]; switch (r & 3) { case 0: c.addr = (c.addr & 0xff) | (v << 8); break; case 1: c.addr = (c.addr & 0xff00) | v; break; case 2: c.count = (c.count & 0xff) | (v << 8); break; case 3: c.count = (c.count & 0xff00) | v; break; } return; }
    this.dma[r] = v;
    if (r === 0x14) {
      for (let i = 0; i < 4; i++) {
        const c = this.ch[i];
        if (v & (1 << i)) { if (!c.busy && c.count) { c.busy = true; c.dend = false; c.bitsLeft = 0; } }
        else c.busy = false;
      }
    }
  }
  fetch(i) {
    const c = this.ch[i];
    const page = (~this.bankRam[i * 2 + (c.addr >> 15)]) & 15;
    const v = page < 8 ? this.data[page][c.addr & 0x7fff] : 0x55;
    c.addr = (this.dma[0x10 + i] & 8) ? (c.addr - 1) & 0xffff : (c.addr + 1) & 0xffff;
    c.count = (c.count - 1) & 0xffff;
    if (c.count === 0) { c.busy = false; c.dend = true; }
    return v;
  }
  // ---- produce n output samples into out (Float32Array), running the CPU interleaved
  render(out, off, n) {
    const cyc = this.clock / this.rate;
    for (let s = 0; s < n; s++) {
      this.cpuAcc = (this.cpuAcc || 0) + cyc;
      if (this.cpuAcc >= 1) { const k = Math.floor(this.cpuAcc); const before = this.cpu.cycles; this.cpu.run(k); this.cpuAcc -= (this.cpu.cycles - before); }
      let mix = 0;
      for (let i = 0; i < 4; i++) {
        const c = this.ch[i];
        const rate = c.ctl & 15; const fbit = this.cvsdBase / (16 - rate);
        const vmask = c.ctl >> 4; const vol = vmask === 0 ? 0 : vmask === 1 ? 0.25 : vmask === 3 ? 0.5 : vmask === 7 ? 0.75 : 1;
        // CVSD constants (MC3418 app circuit, as used for the Exidy 440 board in MAME)
        if (c.fbit !== fbit) { c.fbit = fbit; c.kch = Math.exp(-1 / (18e3 * 0.33e-6 * fbit)); c.kde = Math.exp(-1 / ((18e3 + 3.3e3) * 0.33e-6 * fbit)); c.klk = Math.exp(-1 / (10e3 * 0.1e-6 * fbit)); }
        c.acc += fbit / this.rate;
        let sum = 0, nb = 0;
        while (c.acc >= 1) {
          c.acc -= 1;
          if (c.busy || c.bitsLeft) {
            if (!c.bitsLeft) { if (!c.busy) break; c.byte = this.fetch(i); c.bitsLeft = 8; }
            const bit = (c.byte >> (--c.bitsLeft)) & 1;
            c.sr = ((c.sr << 1) | bit) & 15;
            if (c.sr === 0 || c.sr === 15) c.filt = 1.0954 - (1.0954 - c.filt) * c.kch; else c.filt *= c.kde;
            if (c.filt < 0.0416) c.filt = 0.0416;
            c.integ += bit ? c.filt : -c.filt;
          }
          c.integ *= c.klk; sum += c.integ; nb++;
        }
        const v = nb ? sum / nb : c.integ;
        c.lp += (v - c.lp) * 0.45; // channel low-pass (W5/W6)
        if (!this.chanMute[i]) mix += c.lp * vol;
      }
      out[off + s] = Math.max(-1, Math.min(1, mix * 0.12 * this.master));
    }
  }
}
if (typeof module !== 'undefined') module.exports = FFSound; else G.FFSound = FFSound;
})(typeof window !== 'undefined' ? window : globalThis);

return window;
})();

/* ==========================================================================
 *  Freedom Fighter (Millennium Games 1986/87) — placa dedicada, nativo.
 *  Núcleo de Luis: 68000 + TMS34061 + objetos 16×16 + DMA 68440 + PIAs + ADC,
 *  22VP931 (HLE desde la ROM), expansor de video y la placa de audio digital
 *  (6809 + DMA 6844 + 4× CVSD MC3418). El disco se compone píxel a píxel con
 *  el fondo/objetos como en el emulador original (incluido el expansor).
 * ========================================================================== */
const FF_DEFAULT_EEP = "////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////AP8C//D/A/8G/wH/AP8A/wD/AP9f/1//X/8A/wD/X/9f/1//AP8A/1//X/9f/wD/AP9f/1//X/8A/wD/X/9f/1//AP8A/1//X/9f/wD/AP9f/1//X/8A/wD/X/9f/1//AP8A/1//X/9f/wD/AP8A/4f/fv////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////93/////////////////////////////////////w==";
async function drvFreedomFighter(lib, set, env) {
  const res = { missing: [], loaded: [] }, R = {};
  const need = ['FFA41BC','FFA41D','FFA41E','FFA41FG','FFA42BC','FFA42D','FFA42E','FFA42FG','FFA61A','FFL1745A','FFL1745C','FFL2010A','FFL2010C','FFL207A','FFL207C','FFL208A','FFL208C','FFL209A','FFL209C'];
  for (const n of need) {
    let r = (lib.sets.ffr_ded || []).find(x => x.name === n.toLowerCase() + '.bin');
    if (!r) for (const k in lib.sets) { r = lib.sets[k].find(x => x.name === n.toLowerCase() + '.bin'); if (r) break; }
    if (!r) { res.missing.push(n); continue; } R[n] = await lib.get(r); res.loaded.push(n);
  }
  const il = (a, c) => { const o = new Uint8Array(a.length * 2); for (let i = 0; i < a.length; i++) { o[2 * i] = a[i]; o[2 * i + 1] = c[i]; } return o; };
  const rom = new Uint8Array(0x60000).fill(0xff);
  for (const [a, c, o] of [['FFL2010A', 'FFL2010C', 0], ['FFL209A', 'FFL209C', 0x10000], ['FFL208A', 'FFL208C', 0x20000], ['FFL207A', 'FFL207C', 0x30000], ['FFL1745A', 'FFL1745C', 0x50000]]) if (R[a] && R[c]) rom.set(il(R[a], R[c]), o);
  const b64 = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  const snd = new FFCORE.FFSound(R.FFA61A || new Uint8Array(0x8000), ['FFA41FG','FFA41E','FFA41D','FFA41BC','FFA42FG','FFA42E','FFA42D','FFA42BC'].map(n => R[n] || new Uint8Array(0x8000)), { cvsdBase: 100000 });
  const m = new FFCORE.FFMachine(rom, { sound: snd }); m.reset();
  let eep = null; try { const s = localStorage.getItem('ffr_eep'); if (s) eep = b64(s); } catch (e) {}
  m.eep.set(eep || b64(FF_DEFAULT_EEP));
  m.audioRate = env.sampleRate || 48000;
  const vp = m.vp, hist = [];
  let moving = false;
  const ldp = {
    get frame() { return vp.frame; }, frac: 0,
    get status() { return vp.searching ? LDP_SEARCHING : moving ? LDP_PLAYING : LDP_PAUSED; },
    get target() { return vp.frame; }, fps: 29.97, speedNum: 1, speedDen: 1,
    get audio1() { return !vp.resetState; }, get audio2() { return !vp.resetState; }, squelchSearch: false,
    get log() { return vp.log.slice(-6); }
  };
  const aq = []; let fc = 0, kx = 0, ky = 0, sx = 128, sy = 128, useKeys = false;
  const W = 320, H = 240;
  let cv = null, cx = null, img = null, ldc = null, ldx = null;
  if (typeof document !== 'undefined') { ldc = document.createElement('canvas'); ldc.width = 640; ldc.height = 240; ldx = ldc.getContext('2d', { willReadFrequently: true }); }
  const palR = new Uint32Array(256), palT = new Uint8Array(256), objBuf = new Uint8Array(W * H);
  const compose = (out, L, transparentVideo) => {
    for (let i = 0; i < 256; i++) { const o = i * 2, c = (m.pal[o] << 8) | m.pal[o + 1]; palT[i] = (c & 0x8000) ? 0 : 1; const r = (c >> 10) & 31, g = (c >> 5) & 31, b = c & 31;
      palR[i] = 0xff000000 | (((b << 3) | (b >> 2)) << 16) | (((g << 3) | (g >> 2)) << 8) | ((r << 3) | (r >> 2)); }
    objBuf.fill(0); m.drawObjects(objBuf);
    const start = (m.tms[9] << 7) & 0x1ffff, V = m.vram, exp = m.expanderOn, st = m.expanderStart;
    for (let y = 0; y < H; y++) { const rb = (start + y * 256) & 0x1ffff, oy = y * W;
      for (let x = 0; x < W; x++) { const b = V[(rb + (x >> 1)) & 0x1ffff], ob = objBuf[oy + x], idx = ob ? (ob << 4) : ((x & 1) ? (b & 15) : (b >> 4));
        if (!palT[idx]) out[oy + x] = palR[idx];
        else if (L) { let s = exp ? (st - 28 + x) : (x << 1); if (s < 0) s = 0; else if (s > 639) s = 639; const p = (y * 640 + s) * 4; out[oy + x] = 0xff000000 | (L[p + 2] << 16) | (L[p + 1] << 8) | L[p]; }
        else out[oy + x] = transparentVideo ? 0 : 0xff000000; } }
  };
  const G = {
    name: set, fps: 29.97, ldp, res, ow: W, oh: H, players: 1,
    get videoBlank() { return false; },
    runField() {
      if (useKeys) { sx = Math.max(0, Math.min(255, sx - kx * 4)); sy = Math.max(0, Math.min(255, sy + ky * 4)); m.input.x = sx; m.input.y = sy; }
      m.calibrate(); m.runFrame();
      if (m.audioLen) { for (let i = 0; i < m.audioLen; i++) aq.push(m.audioBuf[i]); m.audioLen = 0; if (aq.length > 24000) aq.splice(0, aq.length - 24000); }
      hist.push(vp.frame); if (hist.length > 12) hist.shift();
      const d = hist.length > 1 ? (hist[hist.length - 1] - hist[0]) / (hist.length - 1) : 0; moving = d > 0.3 && d < 0.7;
      if (++fc % 600 === 0) { try { let s = ''; for (const b of m.eep) s += String.fromCharCode(b); localStorage.setItem('ffr_eep', btoa(s)); } catch (e) {} }
    },
    analog(x, y) { useKeys = false; m.input.x = Math.round(255 - Math.min(1, Math.max(0, x / W)) * 255); m.input.y = Math.round(Math.min(1, Math.max(0, y / H)) * 255); },
    input(sw, d) {
      switch (sw) {
        case SW.BUTTON1: m.input.trigger = d ? 1 : 0; break;
        case SW.BUTTON2: m.input.slomo = d ? 1 : 0; break;
        case SW.COIN1: case SW.COIN2: m.input.coin = d ? 1 : 0; break;
        case SW.TEST: m.input.test = d ? 1 : 0; break;
        case SW.LEFT: useKeys = true; kx = d ? -1 : (kx === -1 ? 0 : kx); sx = m.input.x; sy = m.input.y; break;
        case SW.RIGHT: useKeys = true; kx = d ? 1 : (kx === 1 ? 0 : kx); sx = m.input.x; sy = m.input.y; break;
        case SW.UP: useKeys = true; ky = d ? -1 : (ky === -1 ? 0 : ky); sx = m.input.x; sy = m.input.y; break;
        case SW.DOWN: useKeys = true; ky = d ? 1 : (ky === 1 ? 0 : ky); sx = m.input.x; sy = m.input.y; break;
      }
    },
    drawCanvas(ctx, vid) {
      if (!img) img = ctx.createImageData(W, H);
      let L = null;
      const own = vid && vid.tagName === 'VIDEO';
      if (own && vid.readyState >= 2 && !vid.seeking) { ldx.drawImage(vid, 0, 0, 640, 240); G._ld = ldx.getImageData(0, 0, 640, 240).data; }
      if (own) L = G._ld || null;
      compose(new Uint32Array(img.data.buffer), L, !own);
      ctx.putImageData(img, 0, 0);
    },
    draw(buf) { compose(buf, null, true); },
    sample() { return aq.length ? aq.shift() : 0; },
    status() { const e = (~m.led) & 0xff; return '68000 PC ' + m.cpu.pc.toString(16) + ' · 22VP931 ' + vp.frame + (vp.searching ? ' busca' : moving ? ' play' : ' still') + (e ? ' · LED ' + e : ''); }
  };
  return G;
}
DRIVERS.ffded = drvFreedomFighter;
