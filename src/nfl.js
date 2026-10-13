'use strict';
const NFLCORE = (function () {
const CYC_00 = new Uint8Array([4,10,7,6,4,4,7,4,4,11,7,6,4,4,7,4,8,10,7,6,4,4,7,4,12,11,7,6,4,4,7,4,7,10,16,6,4,4,7,4,7,11,16,6,4,4,7,4,7,10,13,6,11,11,10,4,7,11,13,6,4,4,7,4,4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4,7,7,7,7,7,7,4,7,4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4,5,10,10,10,10,11,7,11,5,10,10,0,10,17,7,11,5,10,10,11,10,11,7,11,5,4,10,11,10,0,7,11,5,10,10,19,10,11,7,11,5,4,10,4,10,0,7,11,5,10,10,4,10,11,7,11,5,6,10,4,10,0,7,11]);
const CYC_ED = new Uint8Array([8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,12,12,15,20,8,14,8,9,12,12,15,20,8,14,8,9,12,12,15,20,8,14,8,9,12,12,15,20,8,14,8,9,12,12,15,20,8,14,8,18,12,12,15,20,8,14,8,18,12,12,15,20,8,14,8,8,12,12,15,20,8,14,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,16,16,16,16,8,8,8,8,16,16,16,16,8,8,8,8,16,16,16,16,8,8,8,8,16,16,16,16,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8]);
const CYC_DDFD = new Uint8Array([4,4,4,4,4,4,4,4,4,15,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,15,4,4,4,4,4,4,4,14,20,10,8,8,11,4,4,15,20,10,8,8,11,4,4,4,4,4,23,23,19,4,4,15,4,4,4,4,4,4,4,4,4,4,8,8,19,4,4,4,4,4,8,8,19,4,4,4,4,4,8,8,19,4,4,4,4,4,8,8,19,4,8,8,8,8,8,8,19,8,8,8,8,8,8,8,19,8,19,19,19,19,19,19,4,19,4,4,4,4,8,8,19,4,4,4,4,4,8,8,19,4,4,4,4,4,8,8,19,4,4,4,4,4,8,8,19,4,4,4,4,4,8,8,19,4,4,4,4,4,8,8,19,4,4,4,4,4,8,8,19,4,4,4,4,4,8,8,19,4,4,4,4,4,8,8,19,4,4,4,4,4,4,4,4,4,4,4,4,0,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,14,4,23,4,15,4,4,4,8,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,10,4,4,4,4,4,4]);
/* Tablas de coeficientes del TMS5200 (= TMS5220), extraidas de
   src/devices/sound/tms5110r.hxx de MAME (tms5220_coeff). */
const TMS_ENERGY = new Int32Array([0, 1, 2, 3, 4, 6, 8, 11, 16, 23, 33, 47, 63, 85, 114, 0]);
const TMS_PITCH  = new Int32Array([0, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 44, 46, 48, 50, 52, 53, 56, 58, 60, 62, 65, 68, 70, 72, 76, 78, 80, 84, 86, 91, 94, 98, 101, 105, 109, 114, 118, 122, 127, 132, 137, 142, 148, 153, 159]);
const TMS_CHIRP  = new Int32Array([0, 3, 15, 40, 76, 108, 113, 80, 37, 38, 76, 68, 26, 50, 59, 19, 55, 26, 37, 31, 29, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const TMS_INTERP = new Int32Array([0, 3, 3, 3, 2, 2, 1, 1]);
const TMS_KBITS  = new Int32Array([5,5,4,4,4,4,4,3,3,3]);
const TMS_K = [
  new Int32Array([-501, -498, -497, -495, -493, -491, -488, -482, -478, -474, -469, -464, -459, -452, -445, -437, -412, -380, -339, -288, -227, -158, -81, -1, 80, 157, 226, 287, 337, 379, 411, 436]),
  new Int32Array([-328, -303, -274, -244, -211, -175, -138, -99, -59, -18, 24, 64, 105, 143, 180, 215, 248, 278, 306, 331, 354, 374, 392, 408, 422, 435, 445, 455, 463, 470, 476, 506]),
  new Int32Array([-441, -387, -333, -279, -225, -171, -117, -63, -9, 45, 98, 152, 206, 260, 314, 368]),
  new Int32Array([-328, -273, -217, -161, -106, -50, 5, 61, 116, 172, 228, 283, 339, 394, 450, 506]),
  new Int32Array([-328, -282, -235, -189, -142, -96, -50, -3, 43, 90, 136, 182, 229, 275, 322, 368]),
  new Int32Array([-256, -212, -168, -123, -79, -35, 10, 54, 98, 143, 187, 232, 276, 320, 365, 409]),
  new Int32Array([-308, -260, -212, -164, -117, -69, -21, 27, 75, 122, 170, 218, 266, 314, 361, 409]),
  new Int32Array([-256, -161, -66, 29, 124, 219, 314, 409]),
  new Int32Array([-256, -176, -96, -15, 65, 146, 226, 307]),
  new Int32Array([-205, -132, -59, 14, 87, 160, 234, 307]),
];
/* ==========================================================================
 * z80.js -- nucleo Z80 completo en JavaScript
 *
 * Decodificacion algoritmica x/y/z/p/q (base, CB, ED, DD/FD y DDCB/FDCB) con
 * la semantica exacta de banderas del nucleo de referencia en C, incluidas
 * las no documentadas XF/YF y el registro interno WZ ("mem_ptr"), para que
 * las trazas de estado coincidan instruccion a instruccion.
 *
 * Banderas en un solo byte f:  S Z Y H X P N C  (bits 7..0)
 * ====================================================================== */

const SF = 0x80, ZF = 0x40, YF = 0x20, HF = 0x10,
      XF = 0x08, PF = 0x04, NF = 0x02, CF = 0x01;

const PARITY = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let n = 0;
    for (let b = 0; b < 8; b++) n += (i >> b) & 1;
    t[i] = (n & 1) === 0 ? 1 : 0;
  }
  return t;
})();

class Z80 {
  /** bus: { rb(a), wb(a,v), inp(p), outp(p,v) } */
  constructor(bus) {
    this.bus = bus;
    this.reset();
  }

  reset() {
    this.a = 0xff; this.f = 0xff;
    this.b = 0; this.c = 0; this.d = 0; this.e = 0; this.h = 0; this.l = 0;
    this.a_ = 0; this.f_ = 0; this.b_ = 0; this.c_ = 0;
    this.d_ = 0; this.e_ = 0; this.h_ = 0; this.l_ = 0;
    this.pc = 0; this.sp = 0xffff; this.ix = 0; this.iy = 0;
    this.i = 0; this.r = 0; this.wz = 0;
    this.iff1 = 0; this.iff2 = 0; this.iffDelay = 0; this.im = 0;
    this.halted = 0; this.intPending = 0; this.intData = 0;
    this.cyc = 0;
  }

  // -------------------------------------------------------------- memoria
  rb(a) { return this.bus.rb(a & 0xffff); }
  wb(a, v) { this.bus.wb(a & 0xffff, v & 0xff); }
  rw(a) { return this.rb(a) | (this.rb(a + 1) << 8); }
  ww(a, v) { this.wb(a, v & 0xff); this.wb(a + 1, v >> 8); }
  nextb() { const v = this.rb(this.pc); this.pc = (this.pc + 1) & 0xffff; return v; }
  nextw() { const v = this.rw(this.pc); this.pc = (this.pc + 2) & 0xffff; return v; }
  push(v) { this.sp = (this.sp - 2) & 0xffff; this.ww(this.sp, v); }
  pop() { const v = this.rw(this.sp); this.sp = (this.sp + 2) & 0xffff; return v; }

  get hl() { return (this.h << 8) | this.l; }
  set hl(v) { this.h = (v >> 8) & 0xff; this.l = v & 0xff; }
  get bc() { return (this.b << 8) | this.c; }
  set bc(v) { this.b = (v >> 8) & 0xff; this.c = v & 0xff; }
  get de() { return (this.d << 8) | this.e; }
  set de(v) { this.d = (v >> 8) & 0xff; this.e = v & 0xff; }

  incR() { this.r = (this.r & 0x80) | ((this.r + 1) & 0x7f); }

  // ------------------------------------------------------------ aritmetica
  /* Igual que el nucleo de referencia: subb() se implementa como addb() con
     el operando complementado, y luego se invierten CF/HF. */
  addb(a, b, cy) {
    const res = (a + b + cy) & 0xff;
    const c = (a + b + cy) ^ a ^ b;
    let f = 0;
    if (res & 0x80) f |= SF;
    if (res === 0) f |= ZF;
    if (c & 0x10) f |= HF;
    if (((c & 0x80) !== 0) !== ((c & 0x100) !== 0)) f |= PF;
    if (c & 0x100) f |= CF;
    f |= res & (XF | YF);
    this.f = f;
    return res;
  }

  subb(a, b, cy) {
    const v = this.addb(a, (~b) & 0xff, cy ? 0 : 1);
    this.f ^= CF | HF;
    this.f |= NF;
    return v;
  }

  addw(a, b, cy) {
    const lsb = this.addb(a & 0xff, b & 0xff, cy);
    const msb = this.addb((a >> 8) & 0xff, (b >> 8) & 0xff, this.f & CF ? 1 : 0);
    const res = ((msb << 8) | lsb) & 0xffff;
    if (res === 0) this.f |= ZF; else this.f &= ~ZF;
    this.wz = (a + 1) & 0xffff;
    return res;
  }

  subw(a, b, cy) {
    const lsb = this.subb(a & 0xff, b & 0xff, cy);
    const msb = this.subb((a >> 8) & 0xff, (b >> 8) & 0xff, this.f & CF ? 1 : 0);
    const res = ((msb << 8) | lsb) & 0xffff;
    if (res === 0) this.f |= ZF; else this.f &= ~ZF;
    this.wz = (a + 1) & 0xffff;
    return res;
  }

  addhl16(dst, val) {                       // add hl,rr  (S/Z/PV se preservan)
    const keep = this.f & (SF | ZF | PF);
    const res = this.addw(dst, val, 0);
    this.f = (this.f & ~(SF | ZF | PF)) | keep;
    return res;
  }

  adchl(val) {
    const res = this.addw(this.hl, val, this.f & CF ? 1 : 0);
    this.f = (this.f & ~SF) | ((res >> 15) ? SF : 0);
    if (res === 0) this.f |= ZF; else this.f &= ~ZF;
    this.hl = res;
  }

  sbchl(val) {
    const res = this.subw(this.hl, val, this.f & CF ? 1 : 0);
    this.f = (this.f & ~SF) | ((res >> 15) ? SF : 0);
    if (res === 0) this.f |= ZF; else this.f &= ~ZF;
    this.hl = res;
  }

  inc8(v) { const cf = this.f & CF; const r = this.addb(v, 1, 0); this.f = (this.f & ~CF) | cf; return r; }
  dec8(v) { const cf = this.f & CF; const r = this.subb(v, 1, 0); this.f = (this.f & ~CF) | cf; return r; }

  logic(res, hf) {
    let f = hf ? HF : 0;
    if (res & 0x80) f |= SF;
    if (res === 0) f |= ZF;
    if (PARITY[res]) f |= PF;
    f |= res & (XF | YF);
    this.f = f;
    this.a = res;
  }

  cp(val) {
    this.subb(this.a, val, 0);
    this.f = (this.f & ~(XF | YF)) | (val & (XF | YF));
  }

  // ---------------------------------------------------------- rotaciones CB
  rot(op, v) {
    let cf;
    switch (op) {
      case 0: cf = v >> 7; v = ((v << 1) | cf) & 0xff; break;               // rlc
      case 1: cf = v & 1; v = ((v >> 1) | (cf << 7)) & 0xff; break;         // rrc
      case 2: cf = v >> 7; v = ((v << 1) | (this.f & CF ? 1 : 0)) & 0xff; break; // rl
      case 3: cf = v & 1; v = ((v >> 1) | ((this.f & CF) ? 0x80 : 0)) & 0xff; break; // rr
      case 4: cf = v >> 7; v = (v << 1) & 0xff; break;                      // sla
      case 5: cf = v & 1; v = ((v >> 1) | (v & 0x80)) & 0xff; break;        // sra
      case 6: cf = v >> 7; v = ((v << 1) | 1) & 0xff; break;                // sll
      case 7: cf = v & 1; v = (v >> 1) & 0xff; break;                       // srl
    }
    let f = cf ? CF : 0;
    if (v & 0x80) f |= SF;
    if (v === 0) f |= ZF;
    if (PARITY[v]) f |= PF;
    f |= v & (XF | YF);
    this.f = f;
    return v;
  }

  bitTest(n, v, xyFrom) {
    const res = v & (1 << n);
    let f = (this.f & CF) | HF;
    if (res & 0x80) f |= SF;
    if (res === 0) f |= ZF | PF;
    f |= xyFrom & (XF | YF);
    this.f = f;
  }

  daa() {
    let cor = 0;
    const a = this.a;
    if ((a & 0x0f) > 9 || (this.f & HF)) cor |= 0x06;
    if (a > 0x99 || (this.f & CF)) { cor |= 0x60; }
    const cf = (a > 0x99 || (this.f & CF)) ? CF : 0;
    let res;
    if (this.f & NF) { res = (a - cor) & 0xff; this.f = (this.f & HF) && ((a & 0x0f) < 6) ? this.f | HF : this.f & ~HF; }
    else { res = (a + cor) & 0xff; }
    // HF exacto
    const hf = (this.f & NF)
      ? (((this.f & HF) && (a & 0x0f) < 6) ? HF : 0)
      : (((a & 0x0f) > 9) ? HF : 0);
    let f = (this.f & NF) | cf | hf;
    if (res & 0x80) f |= SF;
    if (res === 0) f |= ZF;
    if (PARITY[res]) f |= PF;
    f |= res & (XF | YF);
    this.f = f;
    this.a = res;
  }

  // ------------------------------------------------------- acceso a r[0..7]
  rd(i, iz, d) {
    switch (i) {
      case 0: return this.b; case 1: return this.c; case 2: return this.d;
      case 3: return this.e;
      case 4: return iz === null ? this.h : ((iz === 0 ? this.ix : this.iy) >> 8) & 0xff;
      case 5: return iz === null ? this.l : (iz === 0 ? this.ix : this.iy) & 0xff;
      case 6: return this.rb(this.addrHL(iz, d));
      case 7: return this.a;
    }
  }

  wr(i, v, iz, d) {
    v &= 0xff;
    switch (i) {
      case 0: this.b = v; break; case 1: this.c = v; break;
      case 2: this.d = v; break; case 3: this.e = v; break;
      case 4:
        if (iz === null) this.h = v;
        else if (iz === 0) this.ix = (this.ix & 0xff) | (v << 8);
        else this.iy = (this.iy & 0xff) | (v << 8);
        break;
      case 5:
        if (iz === null) this.l = v;
        else if (iz === 0) this.ix = (this.ix & 0xff00) | v;
        else this.iy = (this.iy & 0xff00) | v;
        break;
      case 6: this.wb(this.addrHL(iz, d), v); break;
      case 7: this.a = v; break;
    }
  }

  addrHL(iz, d) {
    if (iz === null) return this.hl;
    const base = iz === 0 ? this.ix : this.iy;
    const a = (base + d) & 0xffff;
    this.wz = a;
    return a;
  }

  cond(y) {
    switch (y) {
      case 0: return !(this.f & ZF); case 1: return !!(this.f & ZF);
      case 2: return !(this.f & CF); case 3: return !!(this.f & CF);
      case 4: return !(this.f & PF); case 5: return !!(this.f & PF);
      case 6: return !(this.f & SF); case 7: return !!(this.f & SF);
    }
  }

  // ------------------------------------------------------------------ step
  step() {
    if (this.halted) { this.cyc += 4; this.incR(); this.interrupts(); return; }
    const op = this.nextb();
    this.incR();
    this.exec(op, null);
    this.interrupts();
  }

  interrupts() {
    if (this.iffDelay > 0) {
      this.iffDelay--;
      if (this.iffDelay === 0) { this.iff1 = 1; this.iff2 = 1; }
      return;
    }
    if (this.intPending && this.iff1) {
      this.intPending = 0; this.halted = 0;
      this.iff1 = 0; this.iff2 = 0;
      this.incR();
      if (this.im === 2) {
        this.cyc += 19;
        this.push(this.pc);
        this.pc = this.rw(((this.i << 8) | this.intData) & 0xffff);
        this.wz = this.pc;
      } else if (this.im === 1) {
        this.cyc += 13; this.push(this.pc); this.pc = 0x38; this.wz = 0x38;
      } else {
        this.cyc += 11; this.exec(this.intData, null);
      }
    }
  }

  genInt(data) { this.intPending = 1; this.intData = data & 0xff; }

  // --------------------------------------------------------------- decode
  exec(op, iz) {
    if (iz === null) this.cyc += CYC_00[op]; else this.cyc += CYC_DDFD[op];

    if (op === 0xDD || op === 0xFD) {
      const nxt = this.nextb(); this.incR();
      this.exec(nxt, op === 0xDD ? 0 : 1);
      return;
    }
    if (op === 0xCB) {
      if (iz === null) {
        const cb = this.nextb(); this.incR();
        this.execCB(cb, null, 0);
      } else {
        let d = this.nextb(); if (d > 127) d -= 256;
        const cb = this.nextb();
        this.execCB(cb, iz, d);
      }
      return;
    }
    if (op === 0xED && iz === null) { this.execED(this.nextb()); this.incR(); return; }

    const x = op >> 6, y = (op >> 3) & 7, z = op & 7, p = y >> 1, q = y & 1;
    let d = 0, extra = false;

    // desplazamiento de (IX+d)/(IY+d): se lee una sola vez
    const needsD = iz !== null &&
      ((x === 0 && (z === 4 || z === 5 || z === 6) && y === 6) ||
       (x === 1 && (y === 6 || z === 6) && !(y === 6 && z === 6)) ||
       (x === 2 && z === 6));
    if (needsD) { d = this.nextb(); if (d > 127) d -= 256; extra = true; }

    // ld r,r' con prefijo: solo uno de los dos puede ser (IX+d)
    const izy = (iz !== null && x === 1 && z === 6) ? null : iz;
    const izz = (iz !== null && x === 1 && y === 6) ? null : iz;

    switch (x) {
      case 0: this.x0(y, z, p, q, iz, d, extra); break;
      case 1:
        if (y === 6 && z === 6) { this.halted = 1; this.pc = (this.pc - 1) & 0xffff; }
        else this.wr(y, this.rd(z, izz, d), izy, d);
        break;
      case 2: this.alu(y, this.rd(z, iz, d)); break;
      case 3: this.x3(y, z, p, q, iz); break;
    }
  }

  x0(y, z, p, q, iz, d) {
    switch (z) {
      case 0:
        if (y === 0) { /* nop */ }
        else if (y === 1) {
          let t = this.a; this.a = this.a_; this.a_ = t;
          t = this.f; this.f = this.f_; this.f_ = t;
        } else if (y === 2) {
          let o = this.nextb(); if (o > 127) o -= 256;
          this.b = (this.b - 1) & 0xff;
          if (this.b) { this.pc = (this.pc + o) & 0xffff; this.wz = this.pc; this.cyc += 5; }
        } else if (y === 3) {
          let o = this.nextb(); if (o > 127) o -= 256;
          this.pc = (this.pc + o) & 0xffff; this.wz = this.pc;
        } else {
          let o = this.nextb(); if (o > 127) o -= 256;
          if (this.cond(y - 4)) { this.pc = (this.pc + o) & 0xffff; this.wz = this.pc; this.cyc += 5; }
        }
        break;
      case 1:
        if (q === 0) { const nn = this.nextw(); this.setRP(p, nn, iz); }
        else {
          const cur = this.getRP(2, iz);
          const res = this.addhl16(cur, this.getRP(p, iz));
          this.setRP(2, res, iz);
        }
        break;
      case 2:
        if (q === 0) {
          if (p === 0) { this.wb(this.bc, this.a); this.wz = ((this.a << 8) | ((this.bc + 1) & 0xff)); }
          else if (p === 1) { this.wb(this.de, this.a); this.wz = ((this.a << 8) | ((this.de + 1) & 0xff)); }
          else if (p === 2) { const nn = this.nextw(); this.ww(nn, this.getRP(2, iz)); this.wz = (nn + 1) & 0xffff; }
          else { const nn = this.nextw(); this.wb(nn, this.a); this.wz = ((this.a << 8) | ((nn + 1) & 0xff)); }
        } else {
          if (p === 0) { this.a = this.rb(this.bc); this.wz = (this.bc + 1) & 0xffff; }
          else if (p === 1) { this.a = this.rb(this.de); this.wz = (this.de + 1) & 0xffff; }
          else if (p === 2) { const nn = this.nextw(); this.setRP(2, this.rw(nn), iz); this.wz = (nn + 1) & 0xffff; }
          else { const nn = this.nextw(); this.a = this.rb(nn); this.wz = (nn + 1) & 0xffff; }
        }
        break;
      case 3:
        this.setRP(p, (this.getRP(p, iz) + (q === 0 ? 1 : -1)) & 0xffff, iz);
        break;
      case 4: this.wr(y, this.inc8(this.rd(y, iz, d)), iz, d); break;
      case 5: this.wr(y, this.dec8(this.rd(y, iz, d)), iz, d); break;
      case 6: {
        if (iz !== null && y === 6) { const n = this.nextb(); this.wb(this.addrHL(iz, d), n); }
        else this.wr(y, this.nextb(), iz, d);
        break;
      }
      case 7: this.x0z7(y); break;
    }
  }

  x0z7(y) {
    let v, cf;
    switch (y) {
      case 0: cf = this.a >> 7; this.a = ((this.a << 1) | cf) & 0xff;
        this.f = (this.f & (SF | ZF | PF)) | (cf ? CF : 0) | (this.a & (XF | YF)); break;
      case 1: cf = this.a & 1; this.a = ((this.a >> 1) | (cf << 7)) & 0xff;
        this.f = (this.f & (SF | ZF | PF)) | (cf ? CF : 0) | (this.a & (XF | YF)); break;
      case 2: cf = this.a >> 7; this.a = ((this.a << 1) | (this.f & CF ? 1 : 0)) & 0xff;
        this.f = (this.f & (SF | ZF | PF)) | (cf ? CF : 0) | (this.a & (XF | YF)); break;
      case 3: cf = this.a & 1; this.a = ((this.a >> 1) | ((this.f & CF) ? 0x80 : 0)) & 0xff;
        this.f = (this.f & (SF | ZF | PF)) | (cf ? CF : 0) | (this.a & (XF | YF)); break;
      case 4: this.daa(); break;
      case 5: this.a = (~this.a) & 0xff;
        this.f = (this.f & (SF | ZF | PF | CF)) | HF | NF | (this.a & (XF | YF)); break;
      case 6: this.f = (this.f & (SF | ZF | PF)) | CF | (this.a & (XF | YF)); break;
      case 7: v = this.f & CF;
        this.f = (this.f & (SF | ZF | PF)) | (v ? HF : 0) | (v ? 0 : CF) | (this.a & (XF | YF)); break;
    }
  }

  x3(y, z, p, q, iz) {
    switch (z) {
      case 0: if (this.cond(y)) { this.pc = this.pop(); this.wz = this.pc; this.cyc += 6; } break;
      case 1:
        if (q === 0) {
          const v = this.pop();
          if (p === 3) { this.a = (v >> 8) & 0xff; this.f = v & 0xff; }
          else this.setRP(p, v, iz);
        } else {
          if (p === 0) { this.pc = this.pop(); this.wz = this.pc; }
          else if (p === 1) {
            let t;
            t = this.b; this.b = this.b_; this.b_ = t;
            t = this.c; this.c = this.c_; this.c_ = t;
            t = this.d; this.d = this.d_; this.d_ = t;
            t = this.e; this.e = this.e_; this.e_ = t;
            t = this.h; this.h = this.h_; this.h_ = t;
            t = this.l; this.l = this.l_; this.l_ = t;
          } else if (p === 2) this.pc = this.getRP(2, iz);
          else this.sp = this.getRP(2, iz);
        }
        break;
      case 2: { const nn = this.nextw(); this.wz = nn; if (this.cond(y)) this.pc = nn; break; }
      case 3: this.x3z3(y, iz); break;
      case 4: {
        const nn = this.nextw(); this.wz = nn;
        if (this.cond(y)) { this.push(this.pc); this.pc = nn; this.cyc += 7; }
        break;
      }
      case 5:
        if (q === 0) this.push(p === 3 ? ((this.a << 8) | this.f) : this.getRP(p, iz));
        else if (p === 0) { const nn = this.nextw(); this.wz = nn; this.push(this.pc); this.pc = nn; }
        break;
      case 6: this.alu(y, this.nextb()); break;
      case 7: this.push(this.pc); this.pc = y * 8; this.wz = this.pc; break;
    }
  }

  x3z3(y, iz) {
    switch (y) {
      case 0: { const nn = this.nextw(); this.pc = nn; this.wz = nn; break; }
      case 2: { const n = this.nextb(); this.bus.outp(n, this.a); this.wz = ((this.a << 8) | ((n + 1) & 0xff)); break; }
      case 3: { const n = this.nextb(); this.wz = ((this.a << 8) | n) + 1; this.a = this.bus.inp(n); break; }
      case 4: { const v = this.rw(this.sp); this.ww(this.sp, this.getRP(2, iz)); this.setRP(2, v, iz); this.wz = v; break; }
      case 5: { const t = this.de; this.de = this.hl; this.hl = t; break; }
      case 6: this.iff1 = 0; this.iff2 = 0; break;
      case 7: this.iffDelay = 1; break;
    }
  }

  alu(y, v) {
    switch (y) {
      case 0: this.a = this.addb(this.a, v, 0); break;
      case 1: this.a = this.addb(this.a, v, this.f & CF ? 1 : 0); break;
      case 2: this.a = this.subb(this.a, v, 0); break;
      case 3: this.a = this.subb(this.a, v, this.f & CF ? 1 : 0); break;
      case 4: this.logic(this.a & v, true); break;
      case 5: this.logic(this.a ^ v, false); break;
      case 6: this.logic(this.a | v, false); break;
      case 7: this.cp(v); break;
    }
  }

  getRP(p, iz) {
    if (p === 3) return this.sp;
    if (p === 2) return iz === null ? this.hl : (iz === 0 ? this.ix : this.iy);
    return p === 0 ? this.bc : this.de;
  }

  setRP(p, v, iz) {
    v &= 0xffff;
    if (p === 3) this.sp = v;
    else if (p === 2) { if (iz === null) this.hl = v; else if (iz === 0) this.ix = v; else this.iy = v; }
    else if (p === 0) this.bc = v; else this.de = v;
  }

  execCB(op, iz, d) {
    const x = op >> 6, y = (op >> 3) & 7, z = op & 7;
    if (iz !== null) {
      /* DDCB/FDCB: bit -> 20 ciclos, el resto 23 (igual que el nucleo de
         referencia). XF/YF de bit salen del byte alto de la direccion. */
      const addr = this.addrHL(iz, d);
      const v = this.rb(addr);
      if (x === 1) { this.bitTest(y, v, (addr >> 8) & 0xff); this.cyc += 20; return; }
      let r;
      if (x === 0) r = this.rot(y, v);
      else if (x === 2) r = v & ~(1 << y);
      else r = v | (1 << y);
      if (z !== 6) this.wr(z, r, null, 0);
      this.wb(addr, r);
      this.cyc += 23;
      return;
    }
    this.cyc += 8;
    const v = this.rd(z, null, 0);
    if (x === 1) {
      this.bitTest(y, v, z === 6 ? ((this.wz >> 8) & 0xff) : v);
      if (z === 6) this.cyc += 4;
      return;
    }
    let r;
    if (x === 0) r = this.rot(y, v);
    else if (x === 2) r = v & ~(1 << y);
    else r = v | (1 << y);
    this.wr(z, r, null, 0);
    if (z === 6) this.cyc += 7;
  }

  execED(op) {
    this.cyc += CYC_ED[op];
    const x = op >> 6, y = (op >> 3) & 7, z = op & 7, p = y >> 1, q = y & 1;
    if (x === 1) {
      switch (z) {
        case 0: {
          const v = this.bus.inp(this.c);
          this.wz = (this.bc + 1) & 0xffff;
          // in r,(c) no altera XF/YF: conservan su valor anterior
          let f = this.f & (CF | XF | YF);
          if (v & 0x80) f |= SF;
          if (v === 0) f |= ZF;
          if (PARITY[v]) f |= PF;
          this.f = f;
          if (y !== 6) this.wr(y, v, null, 0);
          break;
        }
        case 1: this.bus.outp(this.c, y === 6 ? 0 : this.rd(y, null, 0));
          this.wz = (this.bc + 1) & 0xffff; break;
        case 2: if (q === 0) this.sbchl(this.getRP(p, null)); else this.adchl(this.getRP(p, null)); break;
        case 3: {
          const nn = this.nextw(); this.wz = (nn + 1) & 0xffff;
          if (q === 0) this.ww(nn, this.getRP(p, null));
          else this.setRP(p, this.rw(nn), null);
          break;
        }
        case 4: { const a = this.a; this.a = 0; this.a = this.subb(0, a, 0); break; }
        case 5: this.pc = this.pop(); this.wz = this.pc; this.iff1 = this.iff2; break;
        case 6: this.im = [0, 0, 1, 2, 0, 0, 1, 2][y]; break;
        case 7: this.edMisc(y); break;
      }
      return;
    }
    if (x === 2 && z <= 3 && y >= 4) this.block(y - 4, z);
  }

  edMisc(y) {
    switch (y) {
      case 0: this.i = this.a; break;
      case 1: this.r = this.a; break;
      case 2: case 3: {
        this.a = y === 2 ? this.i : this.r;
        let f = this.f & CF;
        if (this.a & 0x80) f |= SF;
        if (this.a === 0) f |= ZF;
        if (this.iff2) f |= PF;
        f |= this.a & (XF | YF);
        this.f = f;
        break;
      }
      case 4: {                                   // rrd
        const v = this.rb(this.hl);
        this.wb(this.hl, ((v >> 4) | (this.a << 4)) & 0xff);
        this.a = (this.a & 0xf0) | (v & 0x0f);
        this.wz = (this.hl + 1) & 0xffff;
        this.szpFromA();
        break;
      }
      case 5: {                                   // rld
        const v = this.rb(this.hl);
        this.wb(this.hl, ((v << 4) | (this.a & 0x0f)) & 0xff);
        this.a = (this.a & 0xf0) | (v >> 4);
        this.wz = (this.hl + 1) & 0xffff;
        this.szpFromA();
        break;
      }
    }
  }

  szpFromA() {
    let f = this.f & CF;
    if (this.a & 0x80) f |= SF;
    if (this.a === 0) f |= ZF;
    if (PARITY[this.a]) f |= PF;
    f |= this.a & (XF | YF);
    this.f = f;
  }

  /** mode: 0=I(ncrement) 1=D 2=IR 3=DR ; kind: 0=ld 1=cp 2=in 3=out */
  block(mode, kind) {
    const dir = (mode & 1) ? -1 : 1;
    const rep = mode >= 2;
    if (kind === 0) {                                   // LDI/LDD/LDIR/LDDR
      const v = this.rb(this.hl);
      this.wb(this.de, v);
      this.hl = (this.hl + dir) & 0xffff;
      this.de = (this.de + dir) & 0xffff;
      this.bc = (this.bc - 1) & 0xffff;
      const n = (v + this.a) & 0xff;
      this.f = (this.f & (SF | ZF | CF)) |
        (this.bc ? PF : 0) | (n & XF) | ((n & 0x02) ? YF : 0);
      if (rep && this.bc) { this.pc = (this.pc - 2) & 0xffff; this.cyc += 5; this.wz = (this.pc + 1) & 0xffff; }
    } else if (kind === 1) {                            // CPI/CPD/CPIR/CPDR
      const cf = this.f & CF;
      const v = this.rb(this.hl);
      const res = this.subb(this.a, v, 0);
      this.hl = (this.hl + dir) & 0xffff;
      this.bc = (this.bc - 1) & 0xffff;
      const n = (res - ((this.f & HF) ? 1 : 0)) & 0xff;
      this.f = (this.f & (SF | ZF | HF)) | NF | cf |
        (this.bc ? PF : 0) | (n & XF) | ((n & 0x02) ? YF : 0);
      this.wz = (this.wz + dir) & 0xffff;
      if (rep && this.bc && !(this.f & ZF)) {
        this.pc = (this.pc - 2) & 0xffff; this.cyc += 5; this.wz = (this.pc + 1) & 0xffff;
      }
    } else if (kind === 2) {                            // INI/IND/INIR/INDR
      const v = this.bus.inp(this.c);
      this.wb(this.hl, v);
      this.wz = (this.bc + dir) & 0xffff;
      this.hl = (this.hl + dir) & 0xffff;
      this.b = (this.b - 1) & 0xff;
      this.f = (this.b ? 0 : ZF) | NF | (this.b & (SF | XF | YF));
      if (rep && this.b) { this.pc = (this.pc - 2) & 0xffff; this.cyc += 5; }
    } else {                                            // OUTI/OUTD/OTIR/OTDR
      const v = this.rb(this.hl);
      this.b = (this.b - 1) & 0xff;
      this.wz = (this.bc + dir) & 0xffff;
      this.bus.outp(this.c, v);
      this.hl = (this.hl + dir) & 0xffff;
      this.f = (this.b ? 0 : ZF) | NF | (this.b & (SF | XF | YF));
      if (rep && this.b) { this.pc = (this.pc - 2) & 0xffff; this.cyc += 5; }
    }
  }
}

/* ==========================================================================
 * m6802.js -- nucleo Motorola M6802 (juego de instrucciones 6800)
 *
 * El M6802 es un 6800 con 128 bytes de RAM interna en $0000-$007F y un
 * divisor /4 integrado: el reloj que se le pasa es el del cristal, y los
 * ciclos que cuenta este nucleo son ciclos E (cristal / 4).
 *
 * Banderas CC:  1 1 H I N Z V C   (bits 7..0)
 * ====================================================================== */

const M_C = 0x01, M_V = 0x02, M_Z = 0x04, M_N = 0x08, M_I = 0x10, M_H = 0x20;

class M6802 {
  constructor(bus) {
    this.bus = bus;                  // { rb(a), wb(a,v) }
    this.ram = new Uint8Array(128);  // RAM interna $0000-$007F
    this.reset();
  }

  reset() {
    this.a = 0; this.b = 0; this.x = 0; this.sp = 0; this.cc = 0xd0;
    this.pc = this.rw(0xfffe);
    this.cyc = 0;
    this.nmi = 0; this.irq = 0; this.waiting = 0;
  }

  rb(a) {
    a &= 0xffff;
    if (a < 0x80) return this.ram[a];
    return this.bus.rb(a);
  }
  wb(a, v) {
    a &= 0xffff; v &= 0xff;
    if (a < 0x80) { this.ram[a] = v; return; }
    this.bus.wb(a, v);
  }
  rw(a) { return (this.rb(a) << 8) | this.rb(a + 1); }
  ww(a, v) { this.wb(a, v >> 8); this.wb(a + 1, v & 0xff); }
  fetch() { const v = this.rb(this.pc); this.pc = (this.pc + 1) & 0xffff; return v; }
  fetchw() { const v = this.rw(this.pc); this.pc = (this.pc + 2) & 0xffff; return v; }
  push(v) { this.wb(this.sp, v); this.sp = (this.sp - 1) & 0xffff; }
  pull() { this.sp = (this.sp + 1) & 0xffff; return this.rb(this.sp); }

  setNZ(v) {
    this.cc &= ~(M_N | M_Z);
    if (v & 0x80) this.cc |= M_N;
    if ((v & 0xff) === 0) this.cc |= M_Z;
  }
  setNZ16(v) {
    this.cc &= ~(M_N | M_Z);
    if (v & 0x8000) this.cc |= M_N;
    if ((v & 0xffff) === 0) this.cc |= M_Z;
  }

  add8(a, b, c) {
    const r = a + b + c;
    this.cc &= ~(M_H | M_N | M_Z | M_V | M_C);
    if (((a ^ b ^ r) & 0x10)) this.cc |= M_H;
    if (r & 0x100) this.cc |= M_C;
    if ((~(a ^ b) & (a ^ r) & 0x80)) this.cc |= M_V;
    const v = r & 0xff;
    if (v & 0x80) this.cc |= M_N;
    if (v === 0) this.cc |= M_Z;
    return v;
  }
  sub8(a, b, c) {
    const r = a - b - c;
    this.cc &= ~(M_N | M_Z | M_V | M_C);
    if (r & 0x100) this.cc |= M_C;
    if (((a ^ b) & (a ^ r) & 0x80)) this.cc |= M_V;
    const v = r & 0xff;
    if (v & 0x80) this.cc |= M_N;
    if (v === 0) this.cc |= M_Z;
    return v;
  }
  cmp8(a, b) { this.sub8(a, b, 0); }

  logic(v) { this.cc &= ~M_V; this.setNZ(v); return v & 0xff; }

  /* -------------------------------------------------------- direccionado */
  eaDir() { return this.fetch(); }
  eaExt() { return this.fetchw(); }
  eaIdx() { return (this.x + this.fetch()) & 0xffff; }
  rel() { let o = this.fetch(); if (o > 127) o -= 256; return (this.pc + o) & 0xffff; }

  branch(cond) { const t = this.rel(); if (cond) this.pc = t; this.cyc += 2; }  /* Bxx = 4 ciclos */

  interrupt(vec) {
    this.push(this.pc & 0xff); this.push(this.pc >> 8);
    this.push(this.x & 0xff); this.push(this.x >> 8);
    this.push(this.a); this.push(this.b); this.push(this.cc);
    this.cc |= M_I;
    this.pc = this.rw(vec);
    this.cyc += 12;
    this.waiting = 0;
  }

  step() {
    if (this.nmi) { this.nmi = 0; this.interrupt(0xfffc); return; }
    if (this.irq && !(this.cc & M_I)) { this.interrupt(0xfff8); return; }
    if (this.waiting) { this.cyc += 1; return; }

    const op = this.fetch();
    this.cyc += 2;
    const a = this;

    /* --- instrucciones que operan sobre un acumulador o memoria ---------
       El 6800 organiza el mapa asi:
         $00-$1F  inherentes    $20-$2F  ramas relativas
         $30-$3F  inherentes de pila/indice
         $40-$5F  ACCA / ACCB inherentes
         $60-$7F  memoria (indexado / extendido)
         $80-$BF  ACCA (inm/dir/idx/ext)   $C0-$FF  ACCB
    */
    if (op >= 0x80) {
      /* Mapa del 6800 para $80-$FF. Columna baja = operacion, y el grupo
         alto decide el acumulador salvo en las columnas C/D/E/F:
            C: CPX (grupo A) / LDD (grupo B, solo 6801)
            D: BSR/JSR (A)   / STD (B, solo 6801)
            E: LDS  (A)      / LDX (B)
            F: STS  (A)      / STX (B)                                    */
      const isB = op >= 0xc0;
      const mode = (op >> 4) & 3;                 // 0=inm 1=dir 2=idx 3=ext
      const grp = op & 0x0f;
      const acc = isB ? "b" : "a";
      const wants16 = (grp === 0x0c || grp === 0x0e || grp === 0x0f || grp === 0x03);

      // BSR / JSR van aparte: no leen operando
      if (grp === 0x0d && !isB) {
        if (mode === 0) {                          // $8D BSR
          const t = this.rel();
          this.push(this.pc & 0xff); this.push(this.pc >> 8);
          this.pc = t; this.cyc += 6;
        } else {
          const ea = mode === 1 ? this.eaDir() : mode === 2 ? this.eaIdx() : this.eaExt();
          this.push(this.pc & 0xff); this.push(this.pc >> 8);
          this.pc = ea; this.cyc += mode === 3 ? 7 : 6;
        }
        return;
      }

      let m = 0, ea = 0;
      if (mode === 0) {
        m = wants16 ? this.fetchw() : this.fetch();
        this.cyc += wants16 ? 1 : 0;
      } else {
        ea = mode === 1 ? this.eaDir() : mode === 2 ? this.eaIdx() : this.eaExt();
        this.cyc += mode === 1 ? 1 : mode === 2 ? 3 : 2;
        // las de almacenar no leen el operando
        if (grp !== 0x07 && grp !== 0x0f)
          m = wants16 ? this.rw(ea) : this.rb(ea);
      }

      switch (grp) {
        case 0x0: this[acc] = this.sub8(this[acc], m, 0); break;              // SUB
        case 0x1: this.cmp8(this[acc], m); break;                             // CMP
        case 0x2: this[acc] = this.sub8(this[acc], m, this.cc & M_C ? 1 : 0); break; // SBC
        case 0x4: this[acc] = this.logic(this[acc] & m); break;               // AND
        case 0x5: this.logic(this[acc] & m); break;                           // BIT
        case 0x6: this[acc] = m & 0xff; this.logic(m & 0xff); break;          // LDA
        case 0x7: if (mode !== 0) { this.wb(ea, this[acc]); this.logic(this[acc]); } break; // STA
        case 0x8: this[acc] = this.logic(this[acc] ^ m); break;               // EOR
        case 0x9: this[acc] = this.add8(this[acc], m, this.cc & M_C ? 1 : 0); break; // ADC
        case 0xa: this[acc] = this.logic(this[acc] | m); break;               // ORA
        case 0xb: this[acc] = this.add8(this[acc], m, 0); break;              // ADD
        case 0xc:                                                             // CPX / LDD
          if (isB) { this.a = (m >> 8) & 0xff; this.b = m & 0xff; this.setNZ16(m); this.cc &= ~M_V; }
          else { const d = (this.x - m) & 0xffff; this.setNZ16(d); this.cc &= ~M_V; }
          this.cyc += 2; break;
        case 0xd:                                                             // STD (6801)
          if (isB && mode !== 0) { const dd = (this.a << 8) | this.b;
            this.ww(ea, dd); this.setNZ16(dd); this.cc &= ~M_V; this.cyc += 2; }
          break;
        case 0xe:                                                             // LDS / LDX
          if (isB) this.x = m & 0xffff; else this.sp = m & 0xffff;
          this.setNZ16(m); this.cc &= ~M_V; this.cyc += 2; break;
        case 0xf:                                                             // STS / STX
          if (mode !== 0) { const w = isB ? this.x : this.sp;
            this.ww(ea, w); this.setNZ16(w); this.cc &= ~M_V; this.cyc += 2; }
          break;
        case 0x3:                                                             // SUBD/ADDD (6801)
          if (isB) { const d = ((this.a << 8) | this.b) + m;
            this.cc &= ~(M_N | M_Z | M_V | M_C);
            if (d & 0x10000) this.cc |= M_C;
            this.a = (d >> 8) & 0xff; this.b = d & 0xff; this.setNZ16(d); }
          else { const d = ((this.a << 8) | this.b) - m;
            this.cc &= ~(M_N | M_Z | M_V | M_C);
            if (d & 0x10000) this.cc |= M_C;
            this.a = (d >> 8) & 0xff; this.b = d & 0xff; this.setNZ16(d); }
          this.cyc += 2; break;
      }
      return;
    }

    switch (op) {
      /* ------------------------------------------------------ inherentes */
      case 0x01: break;                                                    // NOP
      case 0x06: this.cc = (this.a & 0x3f) | 0xc0; break;                  // TAP
      case 0x07: this.a = this.cc; break;                                  // TPA
      case 0x08: this.x = (this.x + 1) & 0xffff;
        this.cc = (this.x === 0) ? this.cc | M_Z : this.cc & ~M_Z; break;  // INX
      case 0x09: this.x = (this.x - 1) & 0xffff;
        this.cc = (this.x === 0) ? this.cc | M_Z : this.cc & ~M_Z; break;  // DEX
      case 0x0a: this.cc &= ~M_V; break;                                   // CLV
      case 0x0b: this.cc |= M_V; break;                                    // SEV
      case 0x0c: this.cc &= ~M_C; break;                                   // CLC
      case 0x0d: this.cc |= M_C; break;                                    // SEC
      case 0x0e: this.cc &= ~M_I; break;                                   // CLI
      case 0x0f: this.cc |= M_I; break;                                    // SEI
      case 0x10: this.a = this.sub8(this.a, this.b, 0); break;             // SBA
      case 0x11: this.cmp8(this.a, this.b); break;                         // CBA
      case 0x16: this.b = this.a; this.logic(this.b); break;               // TAB
      case 0x17: this.a = this.b; this.logic(this.a); break;               // TBA
      case 0x19: {                                                          // DAA
        let cf = 0, lo = this.a & 0x0f, hi = this.a >> 4;
        if (lo > 9 || (this.cc & M_H)) cf |= 0x06;
        if (hi > 9 || (this.cc & M_C) || (hi > 8 && lo > 9)) cf |= 0x60;
        const r = this.a + cf;
        if (r & 0x100) this.cc |= M_C;
        this.a = r & 0xff; this.setNZ(this.a);
        break;
      }
      case 0x1b: this.a = this.add8(this.a, this.b, 0); break;             // ABA
      case 0x30: this.x = (this.sp + 1) & 0xffff; break;                   // TSX
      case 0x31: this.sp = (this.sp + 1) & 0xffff; break;                  // INS
      case 0x32: this.a = this.pull(); break;                              // PULA
      case 0x33: this.b = this.pull(); break;                              // PULB
      case 0x34: this.sp = (this.sp - 1) & 0xffff; break;                  // DES
      case 0x35: this.sp = (this.x - 1) & 0xffff; break;                   // TXS
      case 0x36: this.push(this.a); break;                                 // PSHA
      case 0x37: this.push(this.b); break;                                 // PSHB
      case 0x38: this.x = (this.pull() << 8) | this.pull(); break;         // PULX (6801)
      case 0x39: this.pc = (this.pull() << 8) | this.pull(); this.cyc += 3; break; // RTS
      case 0x3b:                                                            // RTI
        this.cc = this.pull() | 0xc0; this.b = this.pull(); this.a = this.pull();
        this.x = (this.pull() << 8) | this.pull();
        this.pc = (this.pull() << 8) | this.pull(); this.cyc += 8; break;
      case 0x3c: this.push(this.x & 0xff); this.push(this.x >> 8); break;  // PSHX (6801)
      case 0x3e: this.waiting = 1; break;                                  // WAI
      case 0x3f: this.interrupt(0xfffa); break;                            // SWI

      /* ------------------------------------------------------- ACCA/ACCB */
      case 0x40: case 0x50: this.a_or_b(op, v => { const r = (-v) & 0xff;
        this.cc &= ~(M_V | M_C); if (v === 0x80) this.cc |= M_V; if (v !== 0) this.cc |= M_C;
        this.setNZ(r); return r; }); break;                                // NEG
      case 0x43: case 0x53: this.a_or_b(op, v => this.logic((~v) & 0xff) | (this.cc |= M_C, 0) || ((~v) & 0xff)); break; // COM
      case 0x44: case 0x54: this.a_or_b(op, v => { const c = v & 1; const r = v >> 1;
        this.cc &= ~M_C; if (c) this.cc |= M_C; this.setNZ(r);
        this.cc = ((this.cc & M_N ? 1 : 0) ^ (this.cc & M_C ? 1 : 0)) ? this.cc | M_V : this.cc & ~M_V;
        return r; }); break;                                               // LSR
      case 0x46: case 0x56: this.a_or_b(op, v => { const c = v & 1;
        const r = (v >> 1) | ((this.cc & M_C) ? 0x80 : 0);
        this.cc &= ~M_C; if (c) this.cc |= M_C; this.setNZ(r);
        this.cc = ((this.cc & M_N ? 1 : 0) ^ (this.cc & M_C ? 1 : 0)) ? this.cc | M_V : this.cc & ~M_V;
        return r; }); break;                                               // ROR
      case 0x47: case 0x57: this.a_or_b(op, v => { const c = v & 1;
        const r = (v >> 1) | (v & 0x80);
        this.cc &= ~M_C; if (c) this.cc |= M_C; this.setNZ(r); return r; }); break; // ASR
      case 0x48: case 0x58: this.a_or_b(op, v => { const c = v & 0x80; const r = (v << 1) & 0xff;
        this.cc &= ~M_C; if (c) this.cc |= M_C; this.setNZ(r);
        this.cc = ((this.cc & M_N ? 1 : 0) ^ (this.cc & M_C ? 1 : 0)) ? this.cc | M_V : this.cc & ~M_V;
        return r; }); break;                                               // ASL
      case 0x49: case 0x59: this.a_or_b(op, v => { const c = v & 0x80;
        const r = ((v << 1) | ((this.cc & M_C) ? 1 : 0)) & 0xff;
        this.cc &= ~M_C; if (c) this.cc |= M_C; this.setNZ(r);
        this.cc = ((this.cc & M_N ? 1 : 0) ^ (this.cc & M_C ? 1 : 0)) ? this.cc | M_V : this.cc & ~M_V;
        return r; }); break;                                               // ROL
      case 0x4a: case 0x5a: this.a_or_b(op, v => { const r = (v - 1) & 0xff;
        this.cc &= ~M_V; if (v === 0x80) this.cc |= M_V; this.setNZ(r); return r; }); break; // DEC
      case 0x4c: case 0x5c: this.a_or_b(op, v => { const r = (v + 1) & 0xff;
        this.cc &= ~M_V; if (v === 0x7f) this.cc |= M_V; this.setNZ(r); return r; }); break; // INC
      case 0x4d: case 0x5d: this.a_or_b(op, v => { this.cc &= ~(M_V | M_C); this.setNZ(v); return v; }); break; // TST
      case 0x4f: case 0x5f: this.a_or_b(op, () => { this.cc &= ~(M_N | M_V | M_C); this.cc |= M_Z; return 0; }); break; // CLR

      /* ---------------------------------------------- memoria idx / ext */
      case 0x60: case 0x70: case 0x63: case 0x73: case 0x64: case 0x74:
      case 0x66: case 0x76: case 0x67: case 0x77: case 0x68: case 0x78:
      case 0x69: case 0x79: case 0x6a: case 0x7a: case 0x6c: case 0x7c:
      case 0x6d: case 0x7d: case 0x6f: case 0x7f: {
        const ext = (op & 0x10) !== 0;
        const ea = ext ? this.eaExt() : this.eaIdx();
        this.cyc += ext ? 4 : 5;
        let v = this.rb(ea), r = v, store = true;
        switch (op & 0x0f) {
          case 0x0: r = (-v) & 0xff; this.cc &= ~(M_V | M_C);
            if (v === 0x80) this.cc |= M_V; if (v !== 0) this.cc |= M_C; this.setNZ(r); break;
          case 0x3: r = (~v) & 0xff; this.cc &= ~M_V; this.cc |= M_C; this.setNZ(r); break;
          case 0x4: r = v >> 1; this.cc &= ~M_C; if (v & 1) this.cc |= M_C; this.setNZ(r); break;
          case 0x6: r = (v >> 1) | ((this.cc & M_C) ? 0x80 : 0);
            this.cc &= ~M_C; if (v & 1) this.cc |= M_C; this.setNZ(r); break;
          case 0x7: r = (v >> 1) | (v & 0x80); this.cc &= ~M_C; if (v & 1) this.cc |= M_C; this.setNZ(r); break;
          case 0x8: r = (v << 1) & 0xff; this.cc &= ~M_C; if (v & 0x80) this.cc |= M_C; this.setNZ(r); break;
          case 0x9: r = ((v << 1) | ((this.cc & M_C) ? 1 : 0)) & 0xff;
            this.cc &= ~M_C; if (v & 0x80) this.cc |= M_C; this.setNZ(r); break;
          case 0xa: r = (v - 1) & 0xff; this.cc &= ~M_V; if (v === 0x80) this.cc |= M_V; this.setNZ(r); break;
          case 0xc: r = (v + 1) & 0xff; this.cc &= ~M_V; if (v === 0x7f) this.cc |= M_V; this.setNZ(r); break;
          case 0xd: this.cc &= ~(M_V | M_C); this.setNZ(v); store = false; break;  // TST
          case 0xf: r = 0; this.cc &= ~(M_N | M_V | M_C); this.cc |= M_Z; break;   // CLR
        }
        if (store) this.wb(ea, r);
        break;
      }
      case 0x6e: this.pc = this.eaIdx(); this.cyc += 2; break;             // JMP idx
      case 0x7e: this.pc = this.eaExt(); this.cyc += 1; break;             // JMP ext

      /* ------------------------------------------------------------ ramas */
      case 0x20: this.branch(true); break;
      case 0x22: this.branch(!((this.cc & M_C) || (this.cc & M_Z))); break;  // BHI
      case 0x23: this.branch(!!((this.cc & M_C) || (this.cc & M_Z))); break; // BLS
      case 0x24: this.branch(!(this.cc & M_C)); break;                       // BCC
      case 0x25: this.branch(!!(this.cc & M_C)); break;                      // BCS
      case 0x26: this.branch(!(this.cc & M_Z)); break;                       // BNE
      case 0x27: this.branch(!!(this.cc & M_Z)); break;                      // BEQ
      case 0x28: this.branch(!(this.cc & M_V)); break;                       // BVC
      case 0x29: this.branch(!!(this.cc & M_V)); break;                      // BVS
      case 0x2a: this.branch(!(this.cc & M_N)); break;                       // BPL
      case 0x2b: this.branch(!!(this.cc & M_N)); break;                      // BMI
      case 0x2c: this.branch(!((this.cc & M_N ? 1 : 0) ^ (this.cc & M_V ? 1 : 0))); break; // BGE
      case 0x2d: this.branch(!!((this.cc & M_N ? 1 : 0) ^ (this.cc & M_V ? 1 : 0))); break; // BLT
      case 0x2e: this.branch(!(this.cc & M_Z) && !((this.cc & M_N ? 1 : 0) ^ (this.cc & M_V ? 1 : 0))); break; // BGT
      case 0x2f: this.branch(!!(this.cc & M_Z) || !!((this.cc & M_N ? 1 : 0) ^ (this.cc & M_V ? 1 : 0))); break; // BLE
      case 0x21: this.rel(); break;                                          // BRN
      default: break;                                                        // ilegal: NOP
    }
  }

  a_or_b(op, fn) {
    if (op < 0x50) this.a = fn(this.a) & 0xff;
    else this.b = fn(this.b) & 0xff;
  }
}

/* ==========================================================================
 * pia6821.js -- PIA Motorola MC6821 (dos puertos de 8 bits con handshake)
 * ====================================================================== */
class PIA6821 {
  constructor(cfg = {}) {
    this.cfg = cfg;                 // { readpa, writepa, readpb, writepb, ca2, cb2, irq }
    this.reset();
  }
  reset() {
    this.ddr = [0, 0]; this.out = [0, 0]; this.ctl = [0, 0];
    this.in = [0xff, 0xff];
    this.ca1 = 0; this.ca2 = 0; this.cb1 = 0; this.cb2 = 0;
    this.irqA1 = 0; this.irqA2 = 0; this.irqB1 = 0; this.irqB2 = 0;
  }
  /* Los flags IRQxN se ponen siempre en el flanco activo, pero solo salen
     por la patilla /IRQ si el bit 0 (o 3) del registro de control lo habilita. */
  irqState() {
    const a = (this.irqA1 && (this.ctl[0] & 0x01)) ||
              (this.irqA2 && (this.ctl[0] & 0x08) && !(this.ctl[0] & 0x20));
    const b = (this.irqB1 && (this.ctl[1] & 0x01)) ||
              (this.irqB2 && (this.ctl[1] & 0x08) && !(this.ctl[1] & 0x20));
    return (a || b) ? 1 : 0;
  }
  updateIrq() { if (this.cfg.irq) this.cfg.irq(this.irqState()); }

  read(off) {
    const p = off >> 1, isCtl = off & 1;
    if (isCtl) {
      let v = this.ctl[p] & 0x3f;
      if (p === 0) { if (this.irqA1) v |= 0x80; if (this.irqA2) v |= 0x40; }
      else { if (this.irqB1) v |= 0x80; if (this.irqB2) v |= 0x40; }
      return v;
    }
    if (!(this.ctl[p] & 0x04)) return this.ddr[p];      // DDR seleccionado
    if (p === 0) { this.irqA1 = 0; this.irqA2 = 0; this.updateIrq(); }
    else { this.irqB1 = 0; this.irqB2 = 0; this.updateIrq(); }
    const ext = p === 0
      ? (this.cfg.readpa ? this.cfg.readpa() : this.in[0])
      : (this.cfg.readpb ? this.cfg.readpb() : this.in[1]);
    return (ext & ~this.ddr[p]) | (this.out[p] & this.ddr[p]);
  }

  write(off, v) {
    v &= 0xff;
    const p = off >> 1, isCtl = off & 1;
    if (isCtl) {
      this.ctl[p] = v & 0x3f;
      const c2 = (v & 0x38) === 0x38 ? 1 : (v & 0x30) === 0x30 ? 1 : 0;
      if (v & 0x20) {                          // CA2/CB2 como salida
        const st = (v & 0x08) ? 1 : 0;
        if (p === 0) { this.ca2 = st; if (this.cfg.ca2) this.cfg.ca2(st); }
        else { this.cb2 = st; if (this.cfg.cb2) this.cfg.cb2(st); }
      }
      return;
    }
    if (!(this.ctl[p] & 0x04)) { this.ddr[p] = v; return; }
    this.out[p] = v;
    const o = (this.out[p] & this.ddr[p]) | (~this.ddr[p] & 0xff);
    if (p === 0) { if (this.cfg.writepa) this.cfg.writepa(o); }
    else { if (this.cfg.writepb) this.cfg.writepb(o); }
  }

  /* entradas de control */
  ca1w(s) { if (s && !this.ca1) { this.irqA1 = 1; this.updateIrq(); } this.ca1 = s ? 1 : 0; }
  /* CA2 como entrada (CRA bit5 = 0): el flanco activo lo elige CRA bit4 y
     pone el flag IRQA2, que es el bit 6 que lee el programa en CRA. */
  ca2w(s) {
    s = s ? 1 : 0;
    if (!(this.ctl[0] & 0x20)) {
      const active = (this.ctl[0] & 0x10) ? (s && !this.ca2) : (!s && this.ca2);
      if (active) { this.irqA2 = 1; this.updateIrq(); }
    }
    this.ca2 = s;
  }
  cb1w(s) {
    const rising = (this.ctl[1] & 0x02) ? (s && !this.cb1) : (!s && this.cb1);
    if (rising) { this.irqB1 = 1; this.updateIrq(); }
    this.cb1 = s ? 1 : 0;
  }
  cb2w(s) {
    s = s ? 1 : 0;
    if (!(this.ctl[1] & 0x20)) {
      const active = (this.ctl[1] & 0x10) ? (s && !this.cb2) : (!s && this.cb2);
      if (active) { this.irqB2 = 1; this.updateIrq(); }
    }
    this.cb2 = s;
  }
}

/* ==========================================================================
 * ay8910.js -- AY-3-8910 PSG
 *
 * 3 canales de tono + ruido + envolvente, contadores a reloj/8 igual que en
 * MAME. Salida en punto flotante -1..1 lista para WebAudio.
 * ====================================================================== */

const AY_VOL = (() => {
  // tabla logaritmica de 16 niveles del AY-3-8910
  const t = new Float32Array(16);
  for (let i = 0; i < 16; i++) t[i] = i === 0 ? 0 : Math.pow(2, (i - 15) / 2) ;
  t[0] = 0;
  return t;
})();

/* Envolvente: 16 formas, cada una definida por (attack, alternate, hold) */
class AY8910 {
  constructor(clock) {
    this.clock = clock;
    this.reset();
  }
  reset() {
    this.reg = new Uint8Array(16);
    this.addr = 0;
    this.toneCnt = [0, 0, 0];
    this.toneOut = [0, 0, 0];
    this.noiseCnt = 0; this.noiseRng = 1; this.noiseOut = 0;
    this.envCnt = 0; this.envStep = 0; this.envVol = 0; this.envHold = 0;
    this.div = 0;
    this.portA = 0; this.portB = 0;
    this.onPortA = null; this.onPortB = null;
  }
  addressW(v) { this.addr = v & 0x0f; }
  dataW(v) {
    v &= 0xff;
    this.reg[this.addr] = v;
    if (this.addr === 13) { this.envStep = 0; this.envHold = 0; this.envCnt = 0; }
    if (this.addr === 14) { this.portA = v; if (this.onPortA) this.onPortA(v); }
    if (this.addr === 15) { this.portB = v; if (this.onPortB) this.onPortB(v); }
  }
  dataR() { return this.reg[this.addr]; }

  envVolume() {
    const shape = this.reg[13] & 0x0f;
    const cont = (shape >> 3) & 1, att = (shape >> 2) & 1;
    const alt = (shape >> 1) & 1, hold = shape & 1;
    let s = this.envStep;
    if (this.envHold) s = this.envStepHeld;
    let v = s & 15;
    let inv = att ? 0 : 1;
    if (cont) {
      const cycle = (s >> 4) & 1;
      if (alt && cycle) inv ^= 1;
    }
    return inv ? 15 - v : v;
  }

  stepEnv() {
    const shape = this.reg[13] & 0x0f;
    const cont = (shape >> 3) & 1, alt = (shape >> 1) & 1, hold = shape & 1;
    if (this.envHold) return;
    this.envStep++;
    if (this.envStep >= 16) {
      if (!cont || hold) {
        this.envHold = 1;
        const att = (shape >> 2) & 1;
        // valor final: 0 si (cont&hold&alt)==0 en modo descendente
        this.envStepHeld = (cont && (alt ^ (shape & 1) ? 0 : 1)) ? 15 : (att ? 15 : 0);
        if (!cont) this.envStepHeld = 0;
        else if (hold) this.envStepHeld = (att ^ alt) ? 0 : 15;
        this.envFinal = this.envStepHeld;
        return;
      }
      this.envStep &= 31;
    }
  }

  /** Avanza `cycles` ciclos del reloj maestro y devuelve la muestra. */
  tick(cycles) {
    const r = this.reg;
    for (let i = 0; i < cycles; i++) {
      if (++this.div < 8) continue;
      this.div = 0;
      for (let c = 0; c < 3; c++) {
        let per = (r[c * 2] | ((r[c * 2 + 1] & 0x0f) << 8));
        if (per === 0) per = 1;
        if (++this.toneCnt[c] >= per) { this.toneCnt[c] = 0; this.toneOut[c] ^= 1; }
      }
      let np = (r[6] & 0x1f) || 1;
      if (++this.noiseCnt >= np) {
        this.noiseCnt = 0;
        this.noiseRng = (this.noiseRng >> 1) |
          ((((this.noiseRng ^ (this.noiseRng >> 3)) & 1) << 16));
        this.noiseOut = this.noiseRng & 1;
      }
      let ep = ((r[11] | (r[12] << 8)) || 1) * 2;
      if (++this.envCnt >= ep) { this.envCnt = 0; this.stepEnv(); }
    }

    let out = 0;
    const ev = this.envHold ? (this.envFinal | 0) : this.envVolume();
    for (let c = 0; c < 3; c++) {
      const tEn = ((r[7] >> c) & 1) === 0;
      const nEn = ((r[7] >> (c + 3)) & 1) === 0;
      const on = (tEn ? this.toneOut[c] : 1) & (nEn ? this.noiseOut : 1);
      if (!on) continue;
      const vr = r[8 + c];
      const vol = (vr & 0x10) ? ev : (vr & 0x0f);
      out += AY_VOL[vol];
    }
    return out / 3;
  }
}

/* ==========================================================================
 * ssio.js -- placa de sonido Midway SSIO 91657
 *
 *   Z80 @ 16 MHz / 8 = 2 MHz, IM 1
 *   0000-3fff ROM        8000-83ff RAM (mirror 0x0c00)
 *   9000-9003 latches de datos de la CPU principal
 *   a000/a002 AY0 addr/data    a001 AY0 read
 *   b000/b002 AY1 addr/data    b001 AY1 read
 *   c000      status_w    e000 irq_clear    f000 DIP
 *
 * /SINT sale de un contador 14024 de 7 bits pinchado a 16 MHz/(2*16*10)
 * = 50 kHz; el bit 6 invertido es la interrupcion, o sea un flanco cada
 * 64 cuentas (~781 Hz de conmutacion).
 * ====================================================================== */
class SSIO {
  constructor(Z80, rom) {
    this.rom = new Uint8Array(0x4000).fill(0xff);
    this.rom.set(rom.subarray(0, Math.min(rom.length, 0x4000)));
    this.ram = new Uint8Array(0x400);
    this.data = new Uint8Array(4);
    this.status = 0;
    this.dip = 0xff;
    this.count14024 = 0;
    this.irqLine = 0;
    this.ay0 = new AY8910(2000000);
    this.ay1 = new AY8910(2000000);
    this.overallGain = 1;
    const self = this;
    this.cpu = new Z80({
      rb(a) {
        if (a < 0x4000) return self.rom[a];
        if (a >= 0x8000 && a < 0x9000) return self.ram[a & 0x3ff];
        if (a >= 0x9000 && a < 0xa000) return self.data[a & 3];
        if (a >= 0xa000 && a < 0xb000) return (a & 3) === 1 ? self.ay0.dataR() : 0xff;
        if (a >= 0xb000 && a < 0xc000) return (a & 3) === 1 ? self.ay1.dataR() : 0xff;
        if (a >= 0xe000 && a < 0xf000) { self.count14024 = 0; self.irqLine = 0; return 0xff; }
        if (a >= 0xf000) return self.dip;
        return 0xff;
      },
      wb(a, v) {
        if (a >= 0x8000 && a < 0x9000) { self.ram[a & 0x3ff] = v; return; }
        if (a >= 0xa000 && a < 0xb000) {
          if ((a & 3) === 0) self.ay0.addressW(v);
          else if ((a & 3) === 2) self.ay0.dataW(v);
          return;
        }
        if (a >= 0xb000 && a < 0xc000) {
          if ((a & 3) === 0) self.ay1.addressW(v);
          else if ((a & 3) === 2) self.ay1.dataW(v);
          return;
        }
        if (a >= 0xc000 && a < 0xd000) { self.status = v; return; }
      },
      inp() { return 0xff; },
      outp() {},
    });
    this.cpu.reset();
    this.cpu.im = 1;
    this.sintAcc = 0;
  }

  /** la CPU principal escribe uno de los 4 latches (puertos $1c-$1f) */
  write(offset, value) { this.data[offset & 3] = value & 0xff; }

  /** Corre `cycles` ciclos de la CPU de sonido y rellena `buf` (Float32). */
  run(cycles, buf, sampleRate) {
    const CPU_HZ = 2000000;
    const SINT_HZ = 16000000 / (2 * 16 * 10);       // 50 kHz
    const cycPerSint = CPU_HZ / SINT_HZ;             // 40
    const n = buf ? buf.length : 0;
    const cycPerSample = n ? cycles / n : cycles;
    let smp = 0, acc = 0;
    let done = 0;
    while (done < cycles) {
      const before = this.cpu.cyc;
      this.cpu.step();
      const el = this.cpu.cyc - before;
      done += el;

      this.sintAcc += el;
      while (this.sintAcc >= cycPerSint) {
        this.sintAcc -= cycPerSint;
        this.count14024 = (this.count14024 + 1) & 0x7f;
        if ((this.count14024 & 0x3f) === 0) {
          this.irqLine = (this.count14024 & 0x40) ? 1 : 0;
          if (this.irqLine) this.cpu.genInt(0xff);
        }
      }

      if (buf) {
        const s = (this.ay0.tick(el) + this.ay1.tick(el)) * 0.33 * this.overallGain;
        acc += el;
        while (acc >= cycPerSample && smp < n) { acc -= cycPerSample; buf[smp++] = s; }
      }
    }
    while (buf && smp < n) buf[smp++] = 0;
  }
}

/* ==========================================================================
 * tms5200.js -- sintetizador de voz LPC TMS5200 (variante del TMS5220)
 *
 * Codificacion LPC-10: cada trama lleva energia (4 bits), un bit de repeat,
 * pitch (6 bits) y los coeficientes de reflexion K1..K10. Las tramas sordas
 * (pitch = 0) solo llevan K1..K4. Cada trama se reparte en 8 subtramas de 25
 * muestras a 8 kHz, interpolando los parametros con los desplazamientos de
 * TMS_INTERP, y se sintetiza con un filtro de celosia de 10 etapas excitado
 * por la tabla de chirp (sonoras) o por ruido (sordas).
 *
 * En la placa Squawk & Talk no hay ROM de voz VSM, asi que el 6802 alimenta
 * al chip por el FIFO con el comando SPEAK EXTERNAL ($60).
 * ====================================================================== */

function mmul(a, b) {
  a = a << 16 >> 16; b = b << 16 >> 16;
  return (Math.imul(a, b) >> 9) << 16 >> 16;
}

class TMS5200 {
  constructor(clock) {
    this.clock = clock || 640000;
    this.sampleRate = this.clock / 80;      // 8 kHz
    this.reset();
  }

  reset() {
    this.fifo = new Uint8Array(16);
    this.fifoHead = 0; this.fifoTail = 0; this.fifoCount = 0;
    this.fifoBit = 0;
    this.speaking = 0; this.ddis = 0;
    this.talkStatus = 0; this.bufferLow = 1; this.bufferEmpty = 1;
    this.irq = 0; this.ready = 1;
    this.subcycle = 0; this.subframe = 0; this.sampleInFrame = 0;
    this.curEnergy = 0; this.curPitch = 0;
    this.curK = new Int32Array(10);
    this.tgtEnergy = 0; this.tgtPitch = 0;
    this.tgtK = new Int32Array(10);
    this.prevEnergy = 0;
    this.u = new Int32Array(11);
    this.x = new Int32Array(10);
    this.pitchCount = 0;
    this.stall = 0;
    this.rng = 0x1fff;
    this.onIrq = null; this.onReady = null;
  }

  /* --------------------------------------------------------------- FIFO */
  fifoPush(b) {
    if (this.fifoCount >= 16) return;
    this.fifo[this.fifoTail] = b & 0xff;
    this.fifoTail = (this.fifoTail + 1) & 15;
    this.fifoCount++;
    this.bufferEmpty = 0;
    this.bufferLow = this.fifoCount <= 8 ? 1 : 0;
  }
  /** lee `n` bits del FIFO, MSB primero */
  bits(n) {
    let v = 0;
    for (let i = 0; i < n; i++) {
      if (this.fifoCount === 0) { this.bufferEmpty = 1; return -1; }
      const cur = this.fifo[this.fifoHead];
      v = (v << 1) | ((cur >> (7 - this.fifoBit)) & 1);
      if (++this.fifoBit === 8) {
        this.fifoBit = 0;
        this.fifoHead = (this.fifoHead + 1) & 15;
        this.fifoCount--;
        this.bufferLow = this.fifoCount <= 8 ? 1 : 0;
      }
    }
    return v;
  }

  /* ----------------------------------------------------------- comandos */
  statusR() {
    return (this.talkStatus ? 0x80 : 0) | (this.bufferLow ? 0x40 : 0) |
           (this.bufferEmpty ? 0x20 : 0);
  }

  dataW(b) {
    b &= 0xff;
    if (this.ddis) { this.fifoPush(b); return; }     // datos de SPEAK EXTERNAL
    switch (b & 0x70) {
      case 0x60:                                     // SPEAK EXTERNAL
        this.ddis = 1; this.talkStatus = 1; this.speaking = 0;
        this.fifoHead = this.fifoTail = this.fifoCount = this.fifoBit = 0;
        this.bufferEmpty = 1; this.bufferLow = 1;
        break;
      case 0x50: this.talkStatus = 1; this.speaking = 1; break;   // SPEAK (sin VSM)
      case 0x70:                                     // RESET
      case 0x00: this.reset(); break;
      default: break;                                // LOAD ADDRESS / READ: sin VSM
    }
  }

  /* ------------------------------------------------------ decodificacion */
  nextFrame() {
    if (!this.talkStatus) return false;
    /* Una trama sonora completa ocupa hasta 50 bits (~7 bytes). Si el FIFO no
       tiene bastante, el chip NO se para: se queda con los parametros
       anteriores y espera a que el 6802 lo rellene (bufferLow / bufferEmpty).
       Pararse aqui era lo que cortaba la voz en seco. */
    if (this.fifoCount < 7) {
      this.stall++;
      if (this.stall > 400) { this.stop(); return false; }   // underflow real
      return false;
    }
    this.stall = 0;

    const e = this.bits(4);
    if (e < 0) { this.stop(); return false; }
    if (e === 0) {                                   // trama de silencio
      this.tgtEnergy = 0;
      this.tgtK.fill(0);
      return true;
    }
    if (e === 15) { this.stop(); return false; }     // trama de parada

    this.tgtEnergy = TMS_ENERGY[e];
    const rep = this.bits(1);
    const p = this.bits(6);
    if (rep < 0 || p < 0) { this.stop(); return false; }
    this.tgtPitch = TMS_PITCH[p];
    if (rep) return true;                            // repite los K anteriores

    for (let i = 0; i < 4; i++) {
      const v = this.bits(TMS_KBITS[i]);
      if (v < 0) { this.stop(); return false; }
      this.tgtK[i] = TMS_K[i][v];
    }
    if (this.tgtPitch === 0) { for (let i = 4; i < 10; i++) this.tgtK[i] = 0; return true; }
    for (let i = 4; i < 10; i++) {
      const v = this.bits(TMS_KBITS[i]);
      if (v < 0) { this.stop(); return false; }
      this.tgtK[i] = TMS_K[i][v];
    }
    return true;
  }

  stop() {
    this.talkStatus = 0; this.speaking = 0; this.ddis = 0;
    this.tgtEnergy = 0; this.curEnergy = 0;
    this.u.fill(0); this.x.fill(0);
  }

  interpolate() {
    const sh = TMS_INTERP[this.subframe];
    if (sh === 0) {
      this.curEnergy = this.tgtEnergy;
      this.curPitch = this.tgtPitch;
      for (let i = 0; i < 10; i++) this.curK[i] = this.tgtK[i];
      return;
    }
    this.curEnergy += (this.tgtEnergy - this.curEnergy) >> sh;
    this.curPitch += (this.tgtPitch - this.curPitch) >> sh;
    for (let i = 0; i < 10; i++) this.curK[i] += (this.tgtK[i] - this.curK[i]) >> sh;
  }

  lattice(excitation) {
    this.u[10] = mmul(this.prevEnergy, excitation << 6);
    for (let i = 9; i >= 0; i--) this.u[i] = this.u[i + 1] - mmul(this.curK[i], this.x[i]);
    for (let i = 9; i >= 1; i--) this.x[i] = this.x[i - 1] + mmul(this.curK[i - 1], this.u[i - 1]);
    this.x[0] = this.u[0];
    this.prevEnergy = this.curEnergy;
    let v = this.u[0];
    if (v > 16383) v = 16383; if (v < -16384) v = -16384;
    return v;
  }

  /** genera una muestra a 8 kHz */
  sample() {
    if (!this.talkStatus) return 0;
    if (this.sampleInFrame === 0 && this.subframe === 0) {
      if (!this.nextFrame()) return 0;      // silencio mientras se rellena
    }
    if (this.sampleInFrame === 0) this.interpolate();

    let exc;
    if (this.curPitch === 0) {                        // sorda: ruido
      this.rng = ((this.rng >> 1) | (((this.rng ^ (this.rng >> 2)) & 1) << 12)) & 0x1fff;
      exc = (this.rng & 1) ? 64 : -64;
    } else {                                          // sonora: chirp
      exc = this.pitchCount < TMS_CHIRP.length
        ? (TMS_CHIRP[this.pitchCount] << 24 >> 24)
        : 0;
      if (++this.pitchCount >= this.curPitch) this.pitchCount = 0;
    }
    const out = this.lattice(exc);

    if (++this.sampleInFrame >= 25) {
      this.sampleInFrame = 0;
      if (++this.subframe >= 8) this.subframe = 0;
    }
    return out / 16384;
  }
}

/* ==========================================================================
 * snt.js -- placa Bally Squawk & Talk 91660
 *
 * Segun los esquematicos (bally_squawk_n_talk_device de MAME):
 *   M6802 @ 3.579545 MHz (E = /4), 128 bytes de RAM interna
 *   0080-0083 mirror $4F6C  PIA2   0090-0093 mirror $4F6C  PIA1
 *   1000      mirror $40FF  DAC AD558 de 8 bits
 *   8000-BFFF mirror $4000  ROM U2/U3/U4/U5 (4K cada una)
 *
 *   PIA1 PA  <-> estado / datos del TMS5200
 *   PIA1 PB   -> bit0 = /RS, bit1 = /WS del TMS5200
 *   PIA1 CA2 <-  READY del TMS5200,  CB1 <- INT del TMS5200
 *   PIA2 PA  <-  ~sound_select & $1F   (op4_w bits 3-0 desde la 91490)
 *   PIA2 CB1 <-  !sound_int            (op4_w bit 4, pasa por un inversor)
 * ====================================================================== */
class SquawkNTalk {
  constructor(rom) {
    this.rom = new Uint8Array(0x4000).fill(0xff);
    this.rom.set(rom.subarray(0, Math.min(rom.length, 0x4000)));
    this.tms = new TMS5200(640000);
    this.dac = 0;
    this.soundSelect = 0;
    this.dacHP = 0; this.dacPrev = 0;      // filtro paso-alto de 2 kHz del AD558

    const self = this;
    this.pia1 = new PIA6821({
      readpa: () => self.tms.statusR(),
      writepa: v => { self.pendingData = v; },
      writepb: v => {                       // bit0 = /RS, bit1 = /WS
        const rs = v & 1, ws = (v >> 1) & 1;
        /* El TMS baja READY mientras atiende el strobe y la vuelve a subir.
           READY va al CA2 de la PIA1, y ese flanco es el que esperan las dos
           rutinas del ROM: la de escritura en $F26D y la de lectura de estado
           en $F230, ambas con  LDAA $91 / ASLA / BPL  sobre el bit 6 (IRQA2). */
        if (self.lastWs === 1 && ws === 0) {
          self.tms.dataW(self.pendingData || 0);
          self.pia1.ca2w(0); self.pia1.ca2w(1);
        }
        if (self.lastRs === 1 && rs === 0) {      // strobe de lectura de estado
          self.pia1.ca2w(0); self.pia1.ca2w(1);
        }
        self.lastWs = ws; self.lastRs = rs;
      },
      irq: () => self.updateIrq(),
    });
    this.pia2 = new PIA6821({
      readpa: () => (~self.soundSelect) & 0x1f,
      irq: () => self.updateIrq(),
    });
    this.lastWs = 1; this.lastRs = 1; this.pendingData = 0;

    this.cpu = new M6802({
      rb(a) {
        if ((a & 0xb090) === 0x0080) return self.pia2.read(a & 3);
        if ((a & 0xb090) === 0x0090) return self.pia1.read(a & 3);
        if (a >= 0x8000) return self.rom[a & 0x3fff];
        return 0xff;
      },
      wb(a, v) {
        if ((a & 0xb090) === 0x0080) { self.pia2.write(a & 3, v); return; }
        if ((a & 0xb090) === 0x0090) { self.pia1.write(a & 3, v); return; }
        if ((a & 0xbf00) === 0x1000) { self.dac = v; return; }
      },
    });
    this.cpu.reset();
    this.tmsAcc = 0;
    this.speechSample = 0;
  }

  updateIrq() {
    this.cpu.irq = (this.pia1.irqState() | this.pia2.irqState()) ? 1 : 0;
    if (this.cpu.irq) this.cpu.waiting = 0;
  }

  /** desde op4_w de la 91490 */
  soundSelectW(data) { this.soundSelect = data & 0x0f; }
  soundIntW(state) { this.pia2.cb1w(state ? 0 : 1); }   // pasa por un inversor

  /**
   * Corre `cycles` ciclos E del 6802 y, si se pasa `buf`, mezcla en el
   * la salida del DAC mas la voz del TMS5200 remuestreada.
   */
  run(cycles, buf, sampleRate) {
    const E_HZ = 3579545 / 4;
    const n = buf ? buf.length : 0;
    const cycPerSample = n ? cycles / n : cycles;
    const tmsCycPerSample = E_HZ / this.tms.sampleRate;
    let smp = 0, acc = 0, done = 0;

    while (done < cycles) {
      const before = this.cpu.cyc;
      this.cpu.step();
      const el = Math.max(1, this.cpu.cyc - before);
      done += el;

      this.tmsAcc += el;
      while (this.tmsAcc >= tmsCycPerSample) {
        this.tmsAcc -= tmsCycPerSample;
        this.speechSample = this.tms.sample();
      }

      if (buf) {
        // AD558 con el paso-alto de 2 kHz del esquematico
        const dc = (this.dac - 128) / 128;
        this.dacHP = this.dacHP * 0.92 + (dc - this.dacPrev);
        this.dacPrev = dc;
        const s = this.dacHP * 0.5 + this.speechSample * 0.5;
        acc += el;
        while (acc >= cycPerSample && smp < n) { acc -= cycPerSample; buf[smp++] += s; }
      }
    }
  }

  /** mezcla sobre un buffer ya rellenado por el SSIO */
  mix(buf, sampleRate) { this.run(3579545 / 4 / 30, buf, sampleRate); }
}

/* ==========================================================================
 * mcr.js -- maquina Midway MCR III para NFL Football (Bally/Midway 1983)
 *
 * Reproduce el harness en C: CPU board 91490 + video gen 91464 + SSIO 91657
 * + IPU 91695 (videodisco CED). Sirve tanto en Node (validacion contra la
 * traza del nucleo de referencia) como en el navegador.
 * ====================================================================== */

/* ------------------------------------------------------------------ Z80CTC
 * Z8430: 4 canales, modo timer (prescaler 16/256 sobre el reloj de la CPU)
 * y modo contador (flanco en CLK/TRG). Vector = base | (canal << 1).
 * Palabra de control: b0=1 control, b1 reset, b2 TC sigue, b4 flanco,
 * b5 prescaler, b6 modo, b7 int enable.
 */
class Z80CTC {
  constructor(zcCb) {
    this.zcCb = zcCb || null;
    this.reset();
  }
  reset() {
    this.vectorBase = 0;
    this.ch = [];
    for (let i = 0; i < 4; i++)
      this.ch.push({ ctrl: 0x03, tc: 0, down: 0, tcFollows: false,
                     intPending: false, running: false, presc: 0, lastTrg: false });
  }
  read(i) { return this.ch[i].down & 0xff; }
  write(i, data) {
    const c = this.ch[i];
    if (c.tcFollows) {
      c.tcFollows = false; c.tc = data; c.down = data ? data : 256;
      c.presc = 0; c.ctrl &= ~0x02; c.running = true; return;
    }
    if (!(data & 1)) { if (i === 0) this.vectorBase = data & 0xf8; return; }
    c.ctrl = data;
    if (data & 0x02) { c.running = false; c.intPending = false; }
    if (data & 0x04) c.tcFollows = true;
  }
  trg(i, state) {
    const c = this.ch[i];
    const edgeUp = (c.ctrl & 0x10) !== 0;
    const cur = !!state, prev = c.lastTrg;
    c.lastTrg = cur;
    if (!(c.ctrl & 0x40) || !c.running || cur === prev || cur !== edgeUp) return;
    if (--c.down <= 0) {
      c.down = c.tc ? c.tc : 256;
      if (c.ctrl & 0x80) c.intPending = true;
      if (this.zcCb) this.zcCb(i);
    }
  }
  tick(cycles) {
    for (let i = 0; i < 4; i++) {
      const c = this.ch[i];
      if (!c.running || (c.ctrl & 0x40)) continue;
      const p = (c.ctrl & 0x20) ? 256 : 16;
      c.presc += cycles;
      while (c.presc >= p) {
        c.presc -= p;
        if (--c.down <= 0) {
          c.down = c.tc ? c.tc : 256;
          if (c.ctrl & 0x80) c.intPending = true;
          if (this.zcCb) this.zcCb(i);
        }
      }
    }
  }
  irq() { return this.ch.some(c => c.intPending); }
  ack() {
    for (let i = 0; i < 4; i++)
      if (this.ch[i].intPending) { this.ch[i].intPending = false; return this.vectorBase | (i << 1); }
    return -1;
  }
}

/* ================================================= decodificacion de GFX
 * Layouts reales de src/mame/bally/mcr_m.cpp:
 *   mcr_bg_layout      8x8   4bpp RGN_FRAC(1,2)  planos {F/2+0,F/2+1,0,1}
 *   mcr_sprite_layout  32x32 4bpp RGN_FRAC(1,4)  planos {0,1,2,3}
 * Orden de bits MSB-first; plano 0 = bit alto del pixel.
 */
function decodeGfx(gfx1, gfx2) {
  const bg = [], sp = [];
  const F12 = gfx1.length * 8 / 2;
  const pl1 = [F12, F12 + 1, 0, 1];
  for (let e = 0; e < 512; e++) {
    const t = new Uint8Array(64);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const base = e * 128 + y * 16 + x * 2;
        let v = 0;
        for (let p = 0; p < 4; p++) {
          const i = base + pl1[p];
          v |= ((gfx1[i >> 3] >> (7 - (i & 7))) & 1) << (3 - p);
        }
        t[y * 8 + x] = v;
      }
    bg.push(t);
  }
  const Q = [0, 1, 2, 3].map(i => gfx2.length * 8 * i / 4);
  const spx = [];
  for (const g of [0, 8, 16, 24]) for (let q = 0; q < 4; q++) { spx.push(Q[q] + g); spx.push(Q[q] + g + 4); }
  for (let e = 0; e < 128; e++) {
    const t = new Uint8Array(1024);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const base = e * 1024 + y * 32 + spx[x];
        let v = 0;
        for (let p = 0; p < 4; p++) {
          const i = base + p;
          v |= ((gfx2[i >> 3] >> (7 - (i & 7))) & 1) << (3 - p);
        }
        t[y * 32 + x] = v;
      }
    sp.push(t);
  }
  return { bg, sp };
}

const pal3bit = v => { v &= 7; return (v << 5) | (v << 2) | (v >> 1); };

/* ====================================================== reproductor CED
 * Vocabulario de comandos reconstruido de las 19 llamadas a $9E3F:
 *   $00 stop/estado      $01 play (atractivo)
 *   $02..$05 segmentos fijos que elige el arranque
 *   $0A+n  jugada n, parametro $FF o el byte de ($e08d)  ($9EB1 / $9F05)
 *   $0E    park/blank;  los bits 6-7 del comando son modificadores
 * Estado devuelto (lo decodifica $69D1 con  &$3c ):
 *   $F0 listo   $04/$0C/$1C buscando   $00 ocupado   $FF error
 */
const CED_READY = 0xF0, CED_SEEK = 0x0C, CED_BUSY = 0x00, CED_PLAY = 0x38;

class CedPlayer {
  constructor(onSeek) {
    this.onSeek = onSeek || null;      // (segundos, playing) -> void
    this.status = CED_READY;
    this.busyFrames = 0;
    this.seekFrames = 0;
    this.cmd = 0; this.param = 0;
    this.playing = false;
    /* videoActive decide si el monitor ensena el disco o los graficos.
       En la placa real ese conmutador lo maneja el IPU por sus puertos
       $10-$13 (ipu_laserdisc_w), no hay clave de color: se comprobo que el
       CG nunca deja pixeles de valor 0 ni negros, asi que no puede haber
       mezcla por pixel. Aqui se deduce del propio comando. */
    this.videoActive = false;
    this.log = [];
  }
  /* Mapa de comando -> posicion en la linea de tiempo del disco (segundos).
     El disco de NFL Football es continuo: el atractivo al principio y las
     tomas de cada jugada repartidas a lo largo de la cara. */
  timeFor(cmd, param) {
    const base = cmd & 0x3f;
    if (base === 0x01) return 8;                       // atractivo
    if (base >= 0x02 && base <= 0x05) return 40 + (base - 2) * 12;
    if (base >= 0x0a) {
      const play = base - 0x0a;                        // 0..n jugada
      const variant = (param === 0xff) ? 0 : (param & 0x0f);
      return 120 + play * 46 + variant * 6;
    }
    return 0;
  }
  command(c0, c1) {
    this.cmd = c0; this.param = c1;
    this.log.push([c0, c1]);
    const base = c0 & 0x3f;

    /* Todo comando pasa por ocupado -> buscando -> listo. Antes los comandos
       de parada saltaban a listo de inmediato y no habia ninguna transicion
       de estado; si el programa espera a ver el disco ocupado antes de
       esperar a que este listo, esa falta de transicion lo deja colgado. */
    this.busyFrames = 2;
    this.status = CED_BUSY;

    if (base === 0x00 || base === 0x0e) {   // stop / park
      this.playing = false;
      this.videoActive = false;
      this.seekFrames = 3;
      this.endStatus = CED_READY;
      if (this.onSeek) this.onSeek(null, false);
      return;
    }
    const t = this.timeFor(c0, c1);
    this.playing = true;
    this.videoActive = true;
    this.seekFrames = 8;                 // el brazo del CED tarda en posicionar
    /* Tiene que acabar en $F0 exacto: $69D1 lo aceptaria como listo con
       cualquiera de $20/$30/$38, pero $A045 hace  cp $f0  literal contra
       ($e5bf). Devolver $38 ahi cuelga el juego tras el primer play. */
    this.endStatus = CED_READY;
    if (this.onSeek) this.onSeek(t, true);
  }

  frame() {
    if (this.busyFrames > 0) {
      if (--this.busyFrames === 0) this.status = CED_SEEK;
      return;
    }
    if (this.seekFrames > 0 && --this.seekFrames === 0)
      this.status = this.endStatus || CED_READY;
  }
}

/* ============================================================== la maquina */
class NFLMachine {
  /**
   * roms: { main, ssio, gfx1, gfx2, ipu }  (Uint8Array)
   * opts: { onCedSeek }
   */
  constructor(Z80, roms, opts = {}) {
    this.romMain = new Uint8Array(0x10000).fill(0xff);
    this.romMain.set(roms.main.subarray(0, 0xc000), 0);
    this.nvram = new Uint8Array(0x800).fill(0xff);
    this.spriteram = new Uint8Array(0x200);
    this.videoram = new Uint8Array(0x800);
    this.paletteram = new Uint8Array(0x80);
    this.palR = new Uint8Array(64);
    this.palG = new Uint8Array(64);
    this.palB = new Uint8Array(64);

    const g = decodeGfx(roms.gfx1, roms.gfx2);
    this.bgGfx = g.bg; this.spGfx = g.sp;

    this.ip = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff]);
    this.cocktail = 0;
    this.watchdog = 0;

    /* --- HLE del enlace serie 91490 <-> IPU (ver README, seccion 2) --- */
    this.linkPending = 1;
    this.linkReply = CED_READY;
    this.linkRxBit = 0;
    this.linkTxByte = 0;
    this.linkTxBit = 0;
    this.ipuCmd = [0, 0];
    this.ipuCmdN = 0;
    this.ced = new CedPlayer(opts.onCedSeek);

    this.ctc = new Z80CTC(ch => { if (ch === 0) { this.ctc.trg(1, 1); this.ctc.trg(1, 0); } });

    const self = this;
    this.cpu = new Z80({
      rb(a) {
        if (a < 0xe000) return self.romMain[a];
        if (a < 0xe800) return self.nvram[a & 0x7ff];
        if (a < 0xec00) return self.spriteram[a & 0x1ff];
        if (a >= 0xf000 && a < 0xf800) return self.videoram[a & 0x7ff];
        return 0xff;
      },
      wb(a, v) {
        if (a < 0xe000) return;
        if (a < 0xe800) { self.nvram[a & 0x7ff] = v; return; }
        if (a < 0xec00) { self.spriteram[a & 0x1ff] = v; return; }
        if (a >= 0xf000 && a < 0xf800) { self.videoram[a & 0x7ff] = v; return; }
        if (a >= 0xf800) {
          const off = a & 0x7f;
          self.paletteram[off] = v;
          self.setColor(off >> 1, v | ((off & 1) << 8));
        }
      },
      inp(p) { return self.portIn(p); },
      outp(p, v) { self.portOut(p, v); },
    });

    /* El SSIO (91657) es un Z80 propio con dos AY-8910; se instancia aparte
       en ssio.js. Aqui solo se guarda el ultimo comando escrito. */
    this.ssioCmd = 0;
    this.snt = null;          // placa Squawk & Talk 91660 (se engancha desde fuera)
    this.ssioWrite = null;      // callback que conecta con la placa de sonido
    this.ssioStatus = () => 0;
  }

  setColor(idx, data) {
    if (idx >= 64) return;
    this.palR[idx] = pal3bit(data >> 6);
    this.palG[idx] = pal3bit(data);
    this.palB[idx] = pal3bit(data >> 3);
  }

  portIn(p) {
    const base = p & 7;
    if ((p & 0xe0) === 0) {
      if (base <= 4) {
        let r = this.ip[base];
        if (base === 2) {
          const pc = this.cpu.pc;    // ya avanzado tras el IN
          let txda;
          if (pc === 0x0107) txda = 0;                       // reposo
          else if (pc === 0x010D) { txda = 1; this.linkRxBit = 0; }  // start
          else if (pc === 0x012B) {
            const bit = (this.linkReply >> this.linkRxBit) & 1;
            this.linkRxBit = (this.linkRxBit + 1) & 7;
            if (this.linkRxBit === 0) this.linkPending = 0;
            txda = bit ? 0 : 1;                              // linea invertida
          } else txda = this.linkPending;
          r = (r & 0x7f) | (txda << 7);
        }
        return r;
      }
      if (base === 7) return this.ssioStatus();
    }
    if (p >= 0xf0 && p <= 0xf3) return this.ctc.read(p & 3);
    return 0xff;
  }

  portOut(p, v) {
    if (p <= 0x07) {
      if ((p >> 2) === 0) { this.cocktail = (v >> 6) & 1; return; }
      /* op4_w (mcr_nflfoot_state::op4_w):
           b7 = J3-7  -> /RXDA del SIO del IPU
           b6 = J3-3  -> CTSA del SIO del IPU
           b4 = SEL0  -> sound_int del Squawk & Talk (J1-8)
           b3-0 = MD3-0 -> sound_select del Squawk & Talk (J1-4,3,2,1) */
      if (this.snt) { this.snt.soundSelectW(v & 0x0f); this.snt.soundIntW((v >> 4) & 1); }
      if (this.cpu.pc === 0x00C8) {                 // bit-bang hacia el IPU
        const rxa = (v & 0x80) ? 0 : 1;
        if (this.linkTxBit === 0) { this.linkTxByte = 0; this.linkTxBit = 1; }
        else {
          this.linkTxByte |= rxa << (this.linkTxBit - 1);
          if (++this.linkTxBit === 9) {
            this.linkTxBit = 0;
            this.ipuCmd[this.ipuCmdN++] = this.linkTxByte;
            if (this.ipuCmdN === 2) {
              this.ipuCmdN = 0;
              this.ced.command(this.ipuCmd[0], this.ipuCmd[1]);
              this.linkReply = this.ced.status;
              this.linkPending = 1;
            }
          }
        }
      }
      return;
    }
    if (p >= 0x1c && p <= 0x1f) { this.ssioCmd = v; if (this.ssioWrite) this.ssioWrite(p & 3, v); return; }
    if (p === 0xe0) { this.watchdog = 0; return; }
    if (p === 0xe8) return;
    if (p >= 0xf0 && p <= 0xf3) { this.ctc.write(p & 3, v); return; }
  }

  /* -------------------------------------------------- un campo de video */
  runFrame() {
    const CPU_HZ = 5000000, FPS = 30, LINES = 480;
    const CYC_LINE = Math.floor(CPU_HZ / FPS / LINES);
    for (let line = 0; line < LINES; line++) {
      if (line === 0 || line === 240) { this.ctc.trg(2, 1); this.ctc.trg(2, 0); }
      if (line === 0) { this.ctc.trg(3, 1); this.ctc.trg(3, 0); }
      const target = this.cpu.cyc + CYC_LINE;
      while (this.cpu.cyc < target) {
        const before = this.cpu.cyc;
        this.cpu.step();
        this.ctc.tick(this.cpu.cyc - before);
        if (this.ctc.irq() && this.cpu.iff1) {
          const v = this.ctc.ack();
          if (v >= 0) this.cpu.genInt(v);
        }
      }
    }
    this.ced.frame();
    this.linkReply = this.ced.status;
    this.linkPending = 1;
    if (++this.watchdog >= 16) { this.watchdog = 0; this.reset(); }
  }

  reset() {
    this.cpu.reset();
    this.ctc.reset();
  }

  /* ---------------------------------------------------- render 512x480
   * tilemap 32x30 de tiles 8x8 escalados 2x, luego render_sprites_91464
   * con primask $00 / sprmask $30 / colormask $00 (placa 91490).
   * Devuelve indices de pen 0..63 en `pens` y RGBA en `out`.
   */
  render(out, pens, pri) {
    const vr = this.videoram;
    for (let ty = 0; ty < 30; ty++)
      for (let tx = 0; tx < 32; tx++) {
        const idx = ty * 32 + tx;
        const data = vr[idx * 2] | (vr[idx * 2 + 1] << 8);
        const code = (data & 0x3ff) % 512;
        const color = (data >> 12) & 3;
        let fx = (data >> 10) & 1, fy = (data >> 11) & 1;
        let sx = tx, sy = ty;
        if (this.cocktail) { sx = 31 - tx; sy = 29 - ty; fx ^= 1; fy ^= 1; }
        const g = this.bgGfx[code];
        for (let y = 0; y < 8; y++) {
          const gy = (fy ? 7 - y : y) * 8;
          const oy = sy * 16 + y * 2;
          for (let x = 0; x < 8; x++) {
            const pen = color * 16 + g[gy + (fx ? 7 - x : x)];
            const ox = sx * 16 + x * 2;
            pens[oy * 512 + ox] = pen; pens[oy * 512 + ox + 1] = pen;
            pens[(oy + 1) * 512 + ox] = pen; pens[(oy + 1) * 512 + ox + 1] = pen;
          }
        }
      }
    pri.fill(0);
    const sr = this.spriteram;
    for (let offs = 0x200 - 4; offs >= 0; offs -= 4) {
      const code = (sr[offs + 2] + 256 * ((sr[offs + 1] >> 3) & 1)) % 128;
      const color = ((~sr[offs + 1] & 3) << 4) & 0x30;
      let hflip = (sr[offs + 1] & 0x10) ? 31 : 0;
      let vflip = (sr[offs + 1] & 0x20) ? 31 : 0;
      let sx = (sr[offs + 3] - 3) * 2;
      let sy = (241 - sr[offs]) * 2;
      if (this.cocktail) { hflip ^= 31; vflip ^= 31; sx = 480 - sx; sy = 452 - sy; }
      sx &= 0x1ff; sy &= 0x1ff;
      const g = this.spGfx[code];
      for (let y = 0; y < 32; y++, sy = (sy + 1) & 0x1ff) {
        if (sy < 2 || sy >= 480) continue;
        const row = (y ^ vflip) * 32;
        for (let x = 0; x < 32; x++) {
          const txp = (sx + x) & 0x1ff;
          const o = sy * 512 + txp;
          if (pri[o] === 0xff) continue;
          const pix = color | g[row + (x ^ hflip)];
          if (pix & 0x0f) {
            pri[o] = 0xff;
            if (pix & 0x07) pens[o] = pix;
          }
        }
      }
    }
    if (out) {
      for (let i = 0, n = 512 * 480; i < n; i++) {
        const p = pens[i] & 63;
        const j = i * 4;
        out[j] = this.palR[p]; out[j + 1] = this.palG[p]; out[j + 2] = this.palB[p];
        out[j + 3] = 255;    /* El 91464 no mezcla por pixel: el IPU conmuta
                                el monitor entero. Ver CedPlayer.videoActive. */
      }
    }
  }
}

if (typeof module !== "undefined") module.exports = { Z80, NFLMachine, Z80CTC, CedPlayer, decodeGfx, AY8910, SSIO, M6802, PIA6821, TMS5200, SquawkNTalk };

return { Z80, SSIO, SquawkNTalk, NFLMachine };
})();

/* ==========================================================================
 *  NFL Football (Bally Midway 1983) — nativo. Núcleo de Luis: MCR III 91490
 *  (Z80) + 91464, SSIO (Z80 + 2× AY-3-8910), Squawk & Talk (6802 + TMS5200),
 *  IPU 91695 y el reproductor de videodisco CED. El monitor muestra el CED o
 *  los gráficos, nunca mezclados (lo conmuta el IPU). Dos jugadores: teclado
 *  y/o un mando por jugador.
 * ========================================================================== */
async function drvNFL(lib, set, env) {
  const res = { missing: [], loaded: [] };
  const cat = async (names, size) => {
    const out = new Uint8Array(size); let off = 0;
    for (const n of names) {
      let r = (lib.sets.nflfoot || []).find(x => x.name === n);
      if (!r) for (const k in lib.sets) { r = lib.sets[k].find(x => x.name === n); if (r) break; }
      if (!r) { res.missing.push(n); off += size / names.length; continue; }
      const d = await lib.get(r); out.set(d.subarray(0, size - off), off); off += d.length; res.loaded.push(n);
    }
    return out;
  };
  const ROMS = {
    main: await cat(['nflcpupg.1c', 'nflcpupg.2c', 'nflcpupg.3c'], 49152),
    gfx1: await cat(['nflcpubg.6f', 'nflcpubg.5f'], 16384),
    gfx2: await cat(['nflvidfg.cp4', 'nflvidfg.cp3', 'nflvidfg.cp6', 'nflvidfg.cp5', 'nflvidfg.cp8', 'nflvidfg.cp7', 'nflvidfg.c10', 'nflvidfg.cp9'], 65536),
    ssio: await cat(['nflsnd.a7', 'nflsnd.a8', 'nflsnd.a9'], 12288),
    snt: await cat(['nfl-sqtk-11-15-83.u2', 'nfl-sqtk-11-15-83.u3', 'nfl-sqtk-11-15-83.u4', 'nfl-sqtk-11-15-83.u5'], 16384),
    ipu: await cat(['ipu-7-9.a2', 'ipu-7-9.a4'], 16384)
  };
  let pos = 0, playing = false;          /* posición del CED en cuadros (29,97/s) */
  const mach = new NFLCORE.NFLMachine(NFLCORE.Z80, ROMS, { onCedSeek: (t, pl) => { if (t === null) { playing = false; return; } pos = Math.round(t * 29.97); playing = !!pl; } });
  const ssio = new NFLCORE.SSIO(NFLCORE.Z80, ROMS.ssio), snt = new NFLCORE.SquawkNTalk(ROMS.snt);
  mach.snt = snt; mach.ssioWrite = (o, v) => ssio.write(o, v); mach.ssioStatus = () => ssio.status; mach.cpu.reset();
  const W = 512, H = 480, pens = new Uint8Array(W * H), pri = new Uint8Array(W * H);
  const sr = env.sampleRate || 44100, aq = [];
  const ldp = {
    get frame() { return pos; }, frac: 0,
    get status() { return playing ? LDP_PLAYING : LDP_PAUSED; }, get target() { return pos; },
    fps: 29.97, speedNum: 1, speedDen: 1, audio1: true, audio2: true, squelchSearch: false,
    get log() { return mach.ced.log.slice(-6).map(l => l[0].toString(16) + ',' + l[1].toString(16)); }
  };
  const held = {};
  const setBit = (port, bit, d, src) => { const k = port + ',' + bit + '|' + (src || 'k'); if (d) held[k] = 1; else delete held[k];
    const pre = port + ',' + bit + '|', any = Object.keys(held).some(x => x.startsWith(pre)); if (any) mach.ip[port] &= ~(1 << bit); else mach.ip[port] |= (1 << bit); };
  /* códigos propios para las jugadas (teclado) */
  const PLAY = { P1: 60, P2: 70 };
  let field = 0;
  const G = {
    name: set, fps: 29.97, ldp, res, ow: W, oh: H, players: 2,
    get videoBlank() { return !mach.ced.videoActive; },
    keymap: { KeyQ: 61, KeyW: 62, KeyE: 63, KeyR: 64, KeyY: 65, KeyZ: 66, Enter: 70, KeyU: 71, KeyI: 72, KeyO: 73, KeyP: 74, BracketLeft: 75, KeyX: 76 },
    runField() {
      if (playing && (field & 1)) pos++;
      if (++field & 1) return;                       /* la 91490 corre a 30 campos/s */
      mach.runFrame();
      const n = Math.round(sr / 30), buf = new Float32Array(n);
      ssio.run(2000000 / 30, buf, sr); snt.mix(buf, sr);
      if (aq.length < sr) for (let i = 0; i < n; i++) aq.push(buf[i]);
    },
    input(sw, d) {
      switch (sw) {
        case SW.COIN1: case SW.COIN2: setBit(0, 0, d); break;
        case SW.START1: setBit(0, 4, d); break; case SW.START2: setBit(0, 2, d); break;
        case SW.SERVICE: setBit(0, 3, d); break; case SW.TILT: setBit(0, 5, d); break;
        case SW.BUTTON1: setBit(1, 0, d); break;
        case SW.SKILL1: setBit(1, 1, d); break; case SW.SKILL2: setBit(1, 2, d); break; case SW.SKILL3: setBit(1, 3, d); break;
        default:
          if (sw >= 61 && sw <= 66) setBit(1, sw - 60, d);
          else if (sw >= 70 && sw <= 76) setBit(2, sw - 70, d);
      }
    },
    /* mandos: A = engage, X/Y/LB/RB/B = jugadas 1-5, Select = moneda, Start = un/dos jugadores */
    gamepad(seat, gp, prev) {
      if (seat > 1) return; const port = seat + 1, src = 'pad' + seat;
      const bt = n => !!(gp.buttons[n] && gp.buttons[n].pressed);
      const map = [[0, 0], [2, 1], [3, 2], [4, 3], [5, 4], [1, 5], [9, 6]];
      for (const [b, bit] of map) if (bt(b) !== !!(prev && prev[b])) setBit(port, bit, bt(b), src);
      if (bt(8) !== !!(prev && prev[8])) setBit(0, 0, bt(8), src);
    },
    draw(buf) {
      if (mach.ced.videoActive) { buf.fill(0); return; }
      mach.render(new Uint8Array(buf.buffer, buf.byteOffset, buf.length * 4), pens, pri);
    },
    sample() { return aq.length ? aq.shift() * 0.8 : 0; },
    status() { return 'Z80 PC ' + mach.cpu.pc.toString(16) + ' · CED ' + (mach.ced.videoActive ? 'video' : 'gráficos') + ' ' + pos; }
  };
  return G;
}
DRIVERS.nflfoot = drvNFL;
