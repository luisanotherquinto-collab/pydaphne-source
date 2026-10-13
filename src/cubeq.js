/* ==========================================================================
 *  Cube Quest (Simutrek 1983) — portado de MAME misc/cubeqst.cpp y
 *  devices/cpu/cubeqcpu/cubeqcpu.cpp (CPUs AM2901: sonido, rotación, líneas)
 * ========================================================================== */
'use strict';

let AF = 0, AC = 0, AV = 0;
function am2901Alu(i5_3, r, s, ci, bits) {
  const M = bits === 16 ? 0xFFFF : 0xFFF, HB = bits === 16 ? 0x7FFF : 0x7FF, SH = bits - 1;
  let res = 0, c = 0, v = 0;
  switch (i5_3) {
    case 0: res = r + s + ci; c = (res >>> bits) & 1; v = (((r & HB) + (s & HB) + ci) >> SH) ^ c; break;
    case 1: res = (bits === 16 ? (~r) : (r ^ M)) + s + ci; res >>>= 0; c = (res >>> bits) & 1; v = (((s & HB) + (~r & HB) + ci) >> SH) ^ c; break;
    case 2: res = r + (bits === 16 ? (~s) : (s ^ M)) + ci; res >>>= 0; c = (res >>> bits) & 1; v = (((r & HB) + (~s & HB) + ci) >> SH) ^ c; break;
    case 3: res = r | s; break;
    case 4: res = r & s; break;
    case 5: res = ~r & s; break;
    case 6: res = r ^ s; break;
    case 7: res = ~(r ^ s); break;
  }
  AF = res & M; AC = c & 1; AV = v & 1;
}

/* --------------------------------------------------------- CPU de sonido */
class CQSound {
  constructor(hi, lo, sndData, dacW) {
    this.hi = hi; this.lo = lo; this.sd = sndData; this.dacW = dacW;
    this.ram = new Uint16Array(16); this.sram = new Uint16Array(2048);
    this.q = 0; this.f = 0; this.y = 0; this.cf = 0; this.vf = 0; this.pc = 0; this.platch = 0; this.rtnlatch = 0;
    this.adrcntr = 0; this.adrlatch = 0; this.dinlatch = 0; this.ramwlatch = 0; this.prevIpram = 0; this.prevIpwrt = 0;
    this.held = true; this.total = 0;
  }
  reset() { this.pc = 0; }
  cycles() { return this.total; }
  run(n) {
    if (this.held) { this.total += n; return n; }
    for (let k = 0; k < n; k++) {
      const hi = this.hi[this.pc], lo = this.lo[this.pc];
      let t = (hi >>> 24) & 0xFF;
      const b = (hi >>> 20) & 15, a = (hi >>> 16) & 15, ci = (hi >>> 15) & 1, i5_3 = (hi >>> 12) & 7, ramen = (hi >>> 11) & 1,
        i2_0 = (hi >>> 8) & 7, rtnltch = (hi >>> 7) & 1, jmp = (hi >>> 4) & 7, inca = (hi >>> 3) & 1, i8_6 = hi & 7;
      const ipram = (lo >>> 31) & 1, ipwrt = (lo >>> 30) & 1, latch = (lo >>> 28) & 3, rtn = (lo >>> 27) & 1, rin = (lo >>> 26) & 1;
      if (rtn) t = this.rtnlatch;
      const din = ramen ? this.sd[this.platch] : this.dinlatch, R = this.ram;
      let r = 0, s = 0;
      switch (i2_0) { case 0: r = R[a]; s = this.q; break; case 1: r = R[a]; s = R[b]; break; case 2: s = this.q; break; case 3: s = R[b]; break;
        case 4: s = R[a]; break; case 5: r = din; s = R[a]; break; case 6: r = din; s = this.q; break; case 7: r = din; break; }
      am2901Alu(i5_3, r, s, ci, 16); this.f = AF; this.cf = AC; this.vf = AV;
      const f = this.f;
      switch (i8_6) {
        case 0: this.q = f; this.y = f; break;
        case 1: this.y = f; break;
        case 2: this.y = R[a]; R[b] = f; break;
        case 3: R[b] = f; this.y = f; break;
        case 4: { R[b] = (rin ? 0 : 0x8000) | (f >> 1); this.q >>= 1; this.y = f; this.q |= (((f >> 15) ^ (f >> 1)) & 1) ? 0 : 0x8000; break; }
        case 5: R[b] = (rin ? 0 : 0x8000) | (f >> 1); this.y = f; break;
        case 6: R[b] = (f << 1) | (rin ? 0 : 1); this.q = (this.q << 1) & 0xFFFF; this.y = f; break;
        case 7: R[b] = (f << 1) | (rin ? 0 : 1); this.y = f; break;
      }
      if (!this.prevIpram) {
        const ad = this.adrlatch | (this.adrcntr & 0x7F);
        if (!this.prevIpwrt) this.sram[ad] = this.ramwlatch; else this.dinlatch = this.sram[ad];
      }
      if (latch === 0) this.platch = ((t & 3) << 9) | ((this.y >> 6) & 0x1FF);
      else if (latch === 1) this.dacW((this.y & 0xFFF0) | ((this.adrcntr >> 3) & 15));
      else if (latch === 2) { this.adrcntr = this.y & 0x7F; this.adrlatch = this.y & 0x780; }
      let j = false;
      switch (jmp) { case 0: j = true; break; case 2: j = !(this.f & 0x8000); break; case 3: j = !!(this.f & 0x8000); break;
        case 5: j = this.f !== 0; break; case 6: j = !this.vf; break; case 7: j = !(this.adrcntr & 0x80); break; }
      this.pc = j ? (rtn ? this.rtnlatch : t) : (this.pc + 1) & 0xFF;
      if (rtnltch) this.rtnlatch = t;
      if (inca && latch !== 2) this.adrcntr = (this.adrcntr + 1) & 0xFF;
      if (!ipwrt) this.ramwlatch = this.y;
      this.prevIpram = ipram; this.prevIpwrt = ipwrt;
    }
    this.total += n; return n;
  }
}

/* ------------------------------------------------------- CPU de rotación */
class CQRotate {
  constructor(hi, lo, lineW) {
    this.hi = hi; this.lo = lo; this.lineW = lineW;
    this.ram = new Uint16Array(16); this.dram = new Uint16Array(16384); this.sram = new Uint16Array(2048);
    this.q = 0; this.f = 0; this.y = 0; this.cf = 0; this.vf = 0; this.pc = 0; this.seqcnt = 0; this.dsrclatch = 0; this.rsrclatch = 0;
    this.dynaddr = 0; this.dyndata = 0; this.yrlatch = 0; this.ydlatch = 0; this.dinlatch = 0; this.divreg = 0; this.linedata = 0; this.lineaddr = 0;
    this.prevDred = 1; this.prevDwrt = 1; this.wc = 0; this.rc = 0; this.clkcnt = 0; this.held = true; this.total = 0;
  }
  reset() { this.pc = 0; this.wc = 0; this.prevDred = 1; this.prevDwrt = 1; }
  cycles() { return this.total; }
  run(n) {
    if (this.held) { this.total += n; return n; }
    const R = this.ram;
    for (let k = 0; k < n; k++) {
      const hi = this.hi[this.pc & 0x1FF], lo = this.lo[this.pc & 0x1FF];
      let t = (hi >>> 20) & 0xFFF;
      const jmp = (hi >>> 16) & 15, spf = (hi >>> 12) & 15, rsrc = (hi >>> 11) & 1, yout = (hi >>> 8) & 7, sel = (hi >>> 6) & 3, dsrc = (hi >>> 4) & 3, b = hi & 15;
      const a = (lo >>> 28) & 15, i8_6 = (lo >>> 24) & 7, sex = (lo >>> 19) & 1;
      let ci = (lo >>> 23) & 1, i5_3 = (lo >>> 20) & 7, i2_0 = (lo >>> 16) & 7, din = 0xFFFF;
      if (!(this.clkcnt & 3)) {
        if (this.wc) { this.wc = 0; this.dram[this.dynaddr & 0x3FFF] = this.dyndata; }
        if (this.rc) { this.rc = 0; this.dinlatch = this.dram[this.dynaddr & 0x3FFF]; }
      }
      if (!this.prevDwrt) this.wc = 1; else if (!this.prevDred) this.rc = 1;
      const sa = (this.dsrclatch & 2) ? this.yrlatch : (this.rsrclatch | 0x700);
      const dl = this.dsrclatch;
      if (~dl & 0x10) din = this.dinlatch;
      else if (~dl & 0x20) din = this.sram[sa];
      else if (~dl & 0x40) din = this.ydlatch;
      else if (~dl & 0x80) din = t & 0xFFF;
      if (spf === 3 && (dl & 0x80)) t = din;
      else if (spf === 2) t = (t & ~15) | (din >> 12);
      if (~dl & 1) this.sram[sa] = din;
      if (!sex) din = (din & ~0xF000) | ((din & 0x800) ? 0xF000 : 0);
      if (spf === 7 && !(this.q & 1)) i2_0 |= 2;
      let r = 0, s = 0;
      switch (i2_0) { case 0: r = R[a]; s = this.q; break; case 1: r = R[a]; s = R[b]; break; case 2: s = this.q; break; case 3: s = R[b]; break;
        case 4: s = R[a]; break; case 5: r = din; s = R[a]; break; case 6: r = din; s = this.q; break; case 7: r = din; break; }
      if (spf === 6 && this.divreg) { i5_3 |= 1; ci = 1; }
      am2901Alu(i5_3, r, s, ci, 16); this.f = AF; this.cf = AC; this.vf = AV;
      const f = this.f;
      switch (i8_6) {
        case 0: this.q = f; this.y = f; break;
        case 1: this.y = f; break;
        case 2: this.y = R[a]; R[b] = f; break;
        case 3: R[b] = f; this.y = f; break;
        case 4: {
          const q0 = this.q & 1, r0 = f & 1; let q15 = 0, r15 = 0;
          switch (sel) { case 1: q15 = r15 = 0x8000; break; case 2: q15 = q0 << 15; r15 = r0 << 15; break; case 3: q15 = r0 << 15; r15 = (this.vf ^ (f >> 15)) << 15; break; }
          R[b] = r15 | (f >> 1); this.q = q15 | (this.q >> 1); this.y = f; break;
        }
        case 5: {
          const r0 = f & 1; let r15 = 0;
          switch (sel) { case 1: r15 = 0x8000; break; case 2: r15 = r0 << 15; break; case 3: r15 = (this.vf ^ (f >> 15)) << 15; break; }
          R[b] = r15 | (f >> 1); this.y = f; break;
        }
        case 6: {
          const q15 = (this.q >> 15) & 1, r15 = (f >> 15) & 1; let q0 = 0, r0 = 0;
          switch (sel) { case 1: q0 = r0 = 1; break; case 2: q0 = q15; r0 = r15; break; case 3: q0 = (spf === 6 && !(f & 0x8000)) ? 1 : 0; r0 = q15; break; }
          R[b] = (f << 1) | r0; this.q = ((this.q << 1) | q0) & 0xFFFF; this.y = f; break;
        }
        case 7: {
          const q15 = (this.q >> 15) & 1, r15 = (f >> 15) & 1; let r0 = 0;
          switch (sel) { case 1: r0 = 1; break; case 2: r0 = r15; break; case 3: r0 = q15; break; }
          R[b] = (f << 1) | r0; this.y = f; break;
        }
      }
      let ret = 0;
      switch (jmp & 7) { case 1: ret = this.seqcnt === 15; break; case 2: ret = this.cf; break; case 3: ret = !(this.clkcnt & 3); break;
        case 5: ret = (this.f >> 15) & 1; break; case 6: ret = !(this.f & 0x8000) && this.f !== 0; break; case 7: ret = this.f === 0; break; }
      const jump = !(!ret ^ ((jmp >> 3) & 1));
      this.pc = jump ? t : (this.pc + 1) & 0xFFF;
      if (spf === 4) this.seqcnt = t & 15;
      else if (spf === 7 || spf === 6) this.seqcnt = (this.seqcnt + 1) & 15;
      const nd = ((~(0x10 << dsrc)) & 0xF0) | (rsrc ? 4 : 2) | (spf === 5 ? 0 : 1);
      if (!(this.dsrclatch & 4) && (nd & 4)) this.rsrclatch = t & 0xFF;
      this.dsrclatch = nd;
      switch (yout) {
        case 2: this.lineaddr = this.y & 0xFFF; break;
        case 3: this.linedata = ((t & 15) << 12) | (this.y & 0xFFF); this.lineW(this.lineaddr, this.linedata); break;
        case 4: this.dynaddr = this.y & 0x3FFF; break;
        case 5: this.dyndata = this.y & 0xFFFF; break;
        case 6: this.yrlatch = this.y & 0x7FF; break;
        case 7: this.ydlatch = this.y; break;
      }
      this.divreg = spf === 6 && !(this.f & 0x8000) ? 1 : 0;
      this.prevDred = spf === 8 ? 0 : 1; this.prevDwrt = spf === 9 ? 0 : 1;
      this.clkcnt = (this.clkcnt + 1) & 0xFF;
    }
    this.total += n; return n;
  }
}

/* ---------------------------------------------------- CPU dibujador de líneas */
class CQLine {
  constructor(hi, lo, lineR) {
    this.hi = hi; this.lo = lo; this.lineR = lineR;
    this.ram = new Uint16Array(16); this.sram = new Uint16Array(4096); this.ptr = new Uint8Array(1024);
    this.eStack = new Uint32Array(32768); this.oStack = new Uint32Array(32768);
    this.q = 0; this.f = 0; this.y = 0; this.cf = 0; this.vf = 0; this.pc = [0, 0x80]; this.seqcnt = 0; this.clatch = 0; this.zlatch = 0;
    this.xcnt = 0; this.ycnt = 0; this.sreg = 0; this.fadlatch = 0; this.badlatch = 0; this.sramdlatch = 0; this.fglatch = 0; this.bglatch = 0;
    this.gt0 = 0; this.fdx = 0; this.field = 0; this.clkcnt = 0; this.held = true; this.total = 0;
  }
  reset() { this.clkcnt = 0; this.pc[0] = 0; this.pc[1] = 0x80; }
  cycles() { return this.total; }
  swapBanks() { this.field ^= 1; }
  clearStack() { this.ptr.fill(0, this.field * 256, this.field * 256 + 256); }
  ptrVal(i) { return this.ptr[((this.field ^ 1) * 256) + i]; }
  stackRam() { return this.field !== 0 ? this.oStack : this.eStack; }
  run(n) {
    if (this.held) { this.total += n; return n; }
    const stack = this.field === 0 ? this.oStack : this.eStack, pbase = this.field === 0 ? 0 : 0x100, P = this.ptr, R = this.ram;
    const bit = (v, k) => (v >> k) & 1;
    for (let k = 0; k < n; k++) {
      const prog = (this.clkcnt & 3) ? 1 : 0;
      const cur = (this.pc[prog] & 0x7F) | (prog ? 0x80 : 0);
      const hi = this.hi[cur], lo = this.lo[cur];
      let t = (hi >>> 24) & 0xFF;
      const jmp = (hi >>> 20) & 15, latch = (hi >>> 16) & 7, op = (hi >>> 15) & 1, spf = (hi >>> 12) & 7, b = (hi >>> 8) & 15, i8_6 = hi & 7;
      let a = (hi >>> 4) & 15;
      const ci = (lo >>> 31) & 1, i5_3 = (lo >>> 28) & 7, pbcs = (lo >>> 27) & 1;
      let i2_0 = (lo >>> 24) & 7, din = 0;
      if (!prog) { din = !bit(this.fglatch, 5) ? this.sram[this.fadlatch] : this.lineR(); }
      else {
        if (!bit(this.bglatch, 4)) this.sram[this.badlatch] = this.sramdlatch;
        else if (bit(this.bglatch, 2)) din = this.sram[this.badlatch];
        else din = this.lineR();
      }
      if ((this.clkcnt & 3) === 1) {
        if (bit(this.fglatch, 4) && this.ycnt < 256) {
          let h = this.xcnt; const v = this.ycnt & 0xFF;
          if (h >= 320) h = (h & 0x800) ? 0 : 319;
          const data = bit(this.fglatch, 3) ? ((h << 8) | this.zlatch) : ((1 << 19) | ((this.clatch & 0x100) << 9) | (h << 8) | (this.clatch & 0xFF));
          stack[(v << 7) | (P[pbase + v] & 0x7F)] = data >>> 0;
          P[pbase + v] = (P[pbase + v] + 1) & 0x7F;
        }
      }
      if (op) t = (t & ~15) | (din >> 12);
      if (spf === 5 && !(this.q & 1)) i2_0 |= 2;
      if (!prog && !bit(this.fglatch, 2)) a |= this.gt0;
      let r = 0, s = 0;
      switch (i2_0) { case 0: r = R[a]; s = this.q; break; case 1: r = R[a]; s = R[b]; break; case 2: s = this.q; break; case 3: s = R[b]; break;
        case 4: s = R[a]; break; case 5: r = din; s = R[a]; break; case 6: r = din; s = this.q; break; case 7: r = din; break; }
      am2901Alu(i5_3, r & 0xFFF, s & 0xFFF, ci, 12); this.f = AF; this.cf = AC; this.vf = AV;
      const f = this.f;
      switch (i8_6) {
        case 0: this.q = f; this.y = f; break;
        case 1: this.y = f; break;
        case 2: this.y = R[a]; R[b] = f; break;
        case 3: R[b] = f; this.y = f; break;
        case 4: { const r11 = (bit(f, 11) ^ this.vf) ? 0x800 : 0, q11 = prog ? 0x800 : 0; R[b] = r11 | (f >> 1); this.q = q11 | (this.q >> 1); this.y = f; break; }
        case 5: { const r11 = (bit(f, 11) ^ this.vf) ? 0x800 : 0; R[b] = r11 | (f >> 1); this.y = f; break; }
        case 6: R[b] = (f << 1) | prog; this.q = (this.q << 1) & 0xFFFF; this.y = f; break;
        case 7: R[b] = (f << 1) | prog; this.y = f; break;
      }
      let ret = 0;
      switch (jmp & 7) { case 1: ret = bit(this.f, 11); break; case 2: ret = this.seqcnt === 0xFFF; break; case 3: ret = this.f !== 0 && !bit(this.f, 11); break;
        case 4: ret = this.cf; break; case 5: ret = this.f === 0; break; }
      const jump = !(!ret ^ bit(jmp, 3));
      this.pc[prog] = jump ? t & 0x7F : (this.pc[prog] + 1) & 0x7F;
      const sr = this.sreg;
      if (prog) this.pc[prog] |= 0x80;
      else {
        const mux = (bit(sr, 1) << 1) | (bit(sr, 3) ^ bit(sr, 2));
        if (latch === 2) this.xcnt = this.y & 0xFFF;
        else {
          const xcet = mux === 0 ? !(spf === 7) : mux === 1 ? bit(this.fglatch, 1) : mux === 2 ? !(this.gt0 && spf === 7) : bit(this.fglatch, 0);
          if (!xcet) this.xcnt = (this.xcnt + (bit(sr, 3) ? 1 : -1)) & 0xFFF;
        }
        if (latch === 3) this.ycnt = this.y & 0xFFF;
        else {
          const ycet = mux === 0 ? !(this.gt0 && spf === 7) : mux === 1 ? bit(this.fglatch, 0) : mux === 2 ? !(spf === 7) : bit(this.fglatch, 1);
          if (!ycet) this.ycnt = (this.ycnt + (bit(sr, 2) ? 1 : -1)) & 0xFFF;
        }
      }
      if (latch === 6) this.clatch = this.y & 0x1FF;
      else if (latch === 7) this.zlatch = this.y & 0xFF;
      else if (latch === 5) this.fadlatch = this.y & 0xFFF;
      else if (latch === 4) this.badlatch = this.y & 0xFFF;
      if (!bit(this.bglatch, 5)) this.sramdlatch = ((t & 15) << 12) | (this.y & 0xFFF);
      if (!prog) {
        const mux = ((spf !== 1) << 1) | (spf !== 6 ? 1 : 0);
        let dowrt = 0, ss = 0;
        if (mux === 1) { dowrt = this.fdx ^ bit(sr, 3); ss = this.fdx; }
        else if (mux === 2) { dowrt = bit(sr, 7) ^ bit(sr, 3); ss = bit(sr, 3); }
        else if (mux === 3) { dowrt = (spf === 7 && (bit(sr, 1) || this.gt0)) ? 1 : 0; ss = bit(sr, 2); }
        this.fglatch = (latch === 5 ? 0 : 32) | (dowrt << 4) | (ss << 3) | (pbcs << 2) | (spf === 7 ? 0 : 2) | ((this.gt0 && spf === 7) ? 0 : 1);
      } else {
        const lp = bit(this.bglatch, 5);
        this.bglatch = ((spf !== 4 ? 1 : 0) << 5) | (lp << 4) | ((!lp || (spf !== 4 && latch === 4)) ? 4 : 0);
      }
      if (spf === 2) { this.sreg = ((this.sreg << 1) | (bit(this.f, 11) ? 0 : 1)) & 0xFF; this.gt0 = (this.f !== 0 && !bit(this.f, 11)) ? 1 : 0; }
      else if (spf === 3) this.fdx = bit(this.sreg, 3);
      if (latch === 1) this.seqcnt = this.y & 0xFFF;
      else if (spf === 7) { this.seqcnt = (this.seqcnt + 1) & 0xFFF; this.gt0 = (this.f !== 0 && !bit(this.f, 11)) ? 1 : 0; }
      this.clkcnt = (this.clkcnt + 1) >>> 0;
    }
    this.total += n; return n;
  }
}

/* ============================================================ CUBE QUEST */
async function drvCubeQuest(lib, set, env) {
  const defs = CUBEQ_ROMS[set], missing = [], got = {};
  for (const [name, region, off, size, crc] of defs) {
    const rec = lib.find(name, parseInt(crc, 16) >>> 0, set, 'cubeqst');
    if (!rec) { missing.push(name); continue; }
    got[name] = await lib.get(rec);
  }
  const main = new Uint8Array(0x20000), qw = { rotate_cpu: 0x200, line_cpu: 0x100, sound_cpu: 0x100 }, words = {};
  for (const k in qw) words[k] = new Uint8Array(qw[k] * 8);
  const sndBytes = new Uint8Array(0x1000);
  for (const [name, region, off, size, crc, flag] of defs) {
    const d = got[name]; if (!d) continue;
    if (region === 'main_cpu') { for (let i = 0; i < size; i++) main[off + i * 2] = d[i]; }
    else if (words[region]) { const W = words[region]; for (let i = 0; i < size; i++) W[i * 8 + off] |= flag === 'HI' ? (d[i] & 15) << 4 : d[i] & 15; }
    else if (region === 'soundproms') { for (let i = 0; i < size; i++) sndBytes[i * 2 + off] |= flag === 'HI' ? (d[i] & 15) << 4 : d[i] & 15; }
  }
  /* arranque rápido: la ROM espera ~60 s a que gire el laserdisc (move.w #$0e10,$fe5a) */
  if (!env.ld && env.fastboot !== false && main[0xF194] === 0x31 && main[0xF196] === 0x0E && main[0xF197] === 0x10) { main[0xF196] = 0x00; main[0xF197] = 0x3C; }
  const split = W => { const n = W.length / 8, hi = new Uint32Array(n), lo = new Uint32Array(n); for (let i = 0; i < n; i++) { hi[i] = ((W[i * 8] << 24) | (W[i * 8 + 1] << 16) | (W[i * 8 + 2] << 8) | W[i * 8 + 3]) >>> 0; lo[i] = ((W[i * 8 + 4] << 24) | (W[i * 8 + 5] << 16) | (W[i * 8 + 6] << 8) | W[i * 8 + 7]) >>> 0; } return [hi, lo]; };
  const sndData = new Uint16Array(0x800); for (let i = 0; i < 0x800; i++) sndData[i] = (sndBytes[i * 2] << 8) | sndBytes[i * 2 + 1];
  const m = new Machine(), ldp = new LDP(29.97);
  let st = null, videoOn = false, squelch = false;
  if (env.ld) {
    const rec = lib.find('laser_player_interface_d8748_a308.bin', 0xeed3e728, 'simutrek', 'simutrek');
    if (rec) st = new SimutrekLD(m, await lib.get(rec), ldp); else missing.push('laser_player_interface_d8748_a308.bin');
  }
  const dac = new Float32Array(16);
  const [rh, rl] = split(words.rotate_cpu), [lh, ll] = split(words.line_cpu), [sh, sl] = split(words.sound_cpu);
  let line;
  const rot = new CQRotate(rh, rl, (a, v) => { line.sram[a & 0xFFF] = v; });
  line = new CQLine(lh, ll, () => rot.linedata);
  const snd = new CQSound(sh, sl, sndData, v => { const val = ((v >> 4) ^ 0x800) & 0xFFF; dac[((v & 1) << 3) | ((v >> 1) & 7)] = (val - 0x800) / 2048; });
  const pal = new Uint16Array(256), nvram = new Uint8Array(0x1000), wram = new Uint8Array(0x1000);
  try { const s = localStorage.getItem('ddn.nv.' + set); if (s) nvram.set(JSON.parse(s)); } catch (e) {}
  let ioLatch = 0, resetLatch = 0, field = 0, buttons = 0xFFFF, trackX = 0, trackY = 0, lastSave = 0;
  const cmap = new Uint32Array(65536);
  for (let i = 0; i < 65536; i++) { const a = (i >> 3) & 1, b = i & 7, g = (i >> 4) & 7, r = (i >> 8) & 7, y = ((i >> 12) & 15) * 2; cmap[i] = rgba(y * r, y * g, y * b, a ? 0 : 255); }
  const resetW = d => {
    rot.held = line.held = !(d & 1); snd.held = !(d & 2);
    if (!(d & 1)) { rot.reset(); line.reset(); }
    if (!(d & 2)) snd.reset();
    if (!(resetLatch & 1) && (d & 1)) { line.swapBanks(); line.clearStack(); }
    if (!(d & 4) && st) st.reset();
    resetLatch = d & 0xFF;
  };
  const r16 = a => {
    a &= 0x3FFFF;
    if (a < 0x20000) return (main[a] << 8) | main[a + 1];
    if (a < 0x28000) return rot.dram[(a - 0x20000) >> 1];
    if (a < 0x29000) return snd.sram[(a - 0x28000) >> 1];
    switch (a & 0x3FFFE) {
      case 0x38000: return (ioLatch & 0x80) ? buttons & ~0x4E0 : buttons;
      case 0x38002: return ((trackX & 0xFF) << 8) | (trackY & 0xFF);
      case 0x38008: return 0;
      case 0x3800E: return st ? (st.status << 1) | (st.ready ? 1 : 0) : 1; /* sin reproductor: el juego usa sus fondos gráficos */
    }
    if (a >= 0x3C800 && a < 0x3CA00) return pal[(a - 0x3C800) >> 1];
    if (a >= 0x3E000 && a < 0x3F000) return (nvram[a - 0x3E000] << 8) | nvram[a - 0x3E000 + 1];
    if (a >= 0x3F000) return (wram[a - 0x3F000] << 8) | wram[a - 0x3F000 + 1];
    return 0xFFFF;
  };
  const w16 = (a, v, mask) => {
    a &= 0x3FFFF; mask = mask || 0xFFFF;
    const comb = (old) => (old & ~mask) | (v & mask);
    if (a < 0x20000) return;
    if (a < 0x28000) { const i = (a - 0x20000) >> 1; rot.dram[i] = comb(rot.dram[i]); return; }
    if (a < 0x29000) { const i = (a - 0x28000) >> 1; snd.sram[i] = comb(snd.sram[i]); return; }
    switch (a & 0x3FFFE) {
      case 0x38000: ioLatch = v & 0xFF; return;
      case 0x38002: squelch = !!st && !(v & 1); return;
      case 0x38008: resetW(v); return;
      case 0x3800E: if (st) st.write(v); return;
    }
    if (a >= 0x3C800 && a < 0x3CA00) { const i = (a - 0x3C800) >> 1; pal[i] = comb(pal[i]); return; }
    if (a === 0x3CC00) { videoOn = !!st && !!(v & 1); return; }
    if (a >= 0x3E000 && a < 0x3F000) { const o = a - 0x3E000; if (mask & 0xFF00) nvram[o] = v >> 8; if (mask & 0xFF) nvram[o + 1] = v; return; }
    if (a >= 0x3F000) { const o = a - 0x3F000; if (mask & 0xFF00) wram[o] = v >> 8; if (mask & 0xFF) wram[o + 1] = v; return; }
  };
  const bus = {
    r16, r8: a => (a & 1) ? r16(a & ~1) & 0xFF : r16(a & ~1) >> 8,
    w16: (a, v) => w16(a, v, 0xFFFF),
    w8: (a, v) => (a & 1) ? w16(a & ~1, v & 0xFF, 0x00FF) : w16(a & ~1, (v & 0xFF) << 8, 0xFF00)
  };
  const cpu68 = new M68K(bus);
  let irqPending = 0;
  cpu68.getIrq = () => irqPending;
  let acks = 0; cpu68.irqAck = lvl => { irqPending = 0; acks++; return -1; };
  const c68 = { total: 0, get pc() { return cpu68.pc; }, cycles() { return this.total; },
    run(n) { const b = cpu68.cycles; cpu68.run(n); const d = cpu68.cycles - b; this.total += d; return d; } };
  m.addCPU(c68, 8000000); m.addCPU(rot, 5000000); m.addCPU(line, 5000000); m.addCPU(snd, 5000000);
  if (st) m.addCPU(st.adapter, 400000);
  m.sliceUs = 1000 / 64;
  cpu68.reset(); resetW(0);
  const W = 320, H = 256, depth = new Uint8Array(512);
  m.every(FIELD_US, () => {
    irqPending = field === 0 ? 5 : 6; field ^= 1; ldp.field(); if (st) st.vsync();
    ldp.audio1 = ldp.audio2 = !squelch;
    if (++lastSave % 600 === 0) { try { localStorage.setItem('ddn.nv.' + set, JSON.stringify(Array.from(nvram))); } catch (e) {} }
  });
  return {
    name: set, fps: 29.97, ldp, m, res: { missing, loaded: Object.keys(got) }, ow: W, oh: H - 8, st,
    get videoBlank() { return !!st && !videoOn; },
    runField() { this.tick(); m.runUs(FIELD_US); },
    input(sw, d) {
      const bb = bit => { buttons = d ? buttons & ~bit : buttons | bit; };
      switch (sw) {
        case SW.COIN1: bb(0x08); break; case SW.COIN2: bb(0x10); break; case SW.TILT: bb(0x04); break;
        case SW.BUTTON3: case SW.START1: bb(0x20); break; case SW.BUTTON2: bb(0x40); break; case SW.BUTTON1: bb(0x80); break;
        case SW.SERVICE: bb(0x100); break; case SW.TEST: bb(0x200); break;
        case SW.LEFT: this.dx = d ? -6 : 0; break; case SW.RIGHT: this.dx = d ? 6 : 0; break;
        case SW.UP: this.dy = d ? -6 : 0; break; case SW.DOWN: this.dy = d ? 6 : 0; break;
      }
    },
    analog(dx, dy) { trackX = (trackX + dx) & 0xFF; trackY = (trackY + dy) & 0xFF; },
    tick() { if (this.dx) trackX = (trackX + this.dx) & 0xFF; if (this.dy) trackY = (trackY + this.dy) & 0xFF; },
    draw(buf) {
      buf.fill(cmap[255]);
      const stk = line.stackRam();
      for (let y = 0; y < H - 8; y++) {
        const n = line.ptrVal(y); depth.fill(0xFF);
        for (let i = 0; i < n; i += 2) {
          const e1 = stk[(y << 7) | (i & 0x7F)], e2 = stk[(y << 7) | ((i + 1) & 0x7F)];
          let h1, h2, color, dep;
          if (e1 & (1 << 19)) { h1 = (e2 >> 8) & 0x1FF; dep = e2 & 0xFF; h2 = (e1 >> 8) & 0x1FF; color = e1 & 0xFF; }
          else if (e2 & (1 << 19)) { h1 = (e1 >> 8) & 0x1FF; dep = e1 & 0xFF; h2 = (e2 >> 8) & 0x1FF; color = e2 & 0xFF; }
          else continue;
          const pen = cmap[pal[color]];
          for (let x = h1; x <= h2 && x < W; x++) if (!(depth[x] < dep)) { buf[y * W + x] = pen; depth[x] = dep; }
        }
      }
    },
    sample() { let s = 0; for (let i = 0; i < 16; i++) s += dac[i]; return s / 6; },
    dbg() { const pc6 = cpu68.pc; let nzd = 0; for (const v of rot.dram) if (v) nzd++; let nzs = 0; for (const v of line.sram) if (v) nzs++; let np = 0; for (const v of line.ptr) np += v; return { acks, a7: (cpu68.a[7] >>> 0).toString(16), nzd, nzs, np, fe16: (wram[0xE16 - 0] << 8) | wram[0xE17], st: (wram[0x30A] << 8) | wram[0x30B], resetLatch, irqPending, rotHeld: rot.held, rotTotal: rot.total, pal0: pal[0], ptr: Array.from(line.ptr.slice(0, 16)), sr: cpu68.sr.toString(16) }; },
    status() { return 'PC ' + cpu68.pc.toString(16).padStart(6, '0') + ' · rot ' + rot.pc.toString(16) + ' · lin ' + line.pc[0].toString(16) + ' · snd ' + snd.pc.toString(16) + (st ? ' · Simutrek 8748 ' + st.cpu.pc.toString(16) : ' · sin LD'); }
  };
}
DRIVERS.cubeqst = drvCubeQuest;
