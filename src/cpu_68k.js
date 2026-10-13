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
