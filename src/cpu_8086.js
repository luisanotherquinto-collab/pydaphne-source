/* ==========================================================================
 *  Intérprete 8086/8088 (modo real) para MACH 3 / Us vs. Them / Cobra M3.
 * ========================================================================== */
'use strict';

function make8086(bus) {
  const R = new Uint16Array(8), S = new Uint16Array(4); /* AX CX DX BX SP BP SI DI ; ES CS SS DS */
  const PAR = new Uint8Array(256); for (let i = 0; i < 256; i++) { let b = i, p = 1; while (b) { p ^= b & 1; b >>= 1; } PAR[i] = p; }
  const c = { R, S, ip: 0, cf: 0, pf: 0, af: 0, zf: 0, sf: 0, tf: 0, iff: 0, df: 0, of: 0, halted: false, nmiPend: false, irqLine: false, irqVec: 0, cyc: 0 };
  let seg = -1, rep = 0, cyc = 0;
  const lin = (s, o) => ((S[s] << 4) + (o & 0xFFFF)) & 0xFFFFF;
  const rb = a => bus.r8(a & 0xFFFFF), wb = (a, v) => bus.w8(a & 0xFFFFF, v & 0xFF);
  const rw = a => rb(a) | (rb(a + 1) << 8), ww = (a, v) => { wb(a, v); wb(a + 1, v >> 8); };
  const f8 = () => { const v = rb(lin(1, c.ip)); c.ip = (c.ip + 1) & 0xFFFF; return v; };
  const f16 = () => { const v = f8(); return v | (f8() << 8); };
  const s8 = v => (v << 24) >> 24, s16 = v => (v << 16) >> 16;
  const g8 = r => r < 4 ? R[r] & 0xFF : R[r - 4] >> 8;
  const p8 = (r, v) => { if (r < 4) R[r] = (R[r] & 0xFF00) | (v & 0xFF); else R[r - 4] = (R[r - 4] & 0xFF) | ((v & 0xFF) << 8); };
  const flagsW = () => 0xF002 | c.cf | (c.pf << 2) | (c.af << 4) | (c.zf << 6) | (c.sf << 7) | (c.tf << 8) | (c.iff << 9) | (c.df << 10) | (c.of << 11);
  const setFlags = v => { c.cf = v & 1; c.pf = (v >> 2) & 1; c.af = (v >> 4) & 1; c.zf = (v >> 6) & 1; c.sf = (v >> 7) & 1; c.tf = (v >> 8) & 1; c.iff = (v >> 9) & 1; c.df = (v >> 10) & 1; c.of = (v >> 11) & 1; };
  const push = v => { R[4] = (R[4] - 2) & 0xFFFF; ww(lin(2, R[4]), v); };
  const pop = () => { const v = rw(lin(2, R[4])); R[4] = (R[4] + 2) & 0xFFFF; return v; };
  /* ModR/M */
  let mod = 0, reg = 0, rm = 0, ea = 0;
  function modrm() {
    const b = f8(); mod = b >> 6; reg = (b >> 3) & 7; rm = b & 7;
    if (mod === 3) return;
    let off = 0, ds = 3;
    switch (rm) {
      case 0: off = R[3] + R[6]; break; case 1: off = R[3] + R[7]; break;
      case 2: off = R[5] + R[6]; ds = 2; break; case 3: off = R[5] + R[7]; ds = 2; break;
      case 4: off = R[6]; break; case 5: off = R[7]; break;
      case 6: if (mod === 0) off = f16(); else { off = R[5]; ds = 2; } break;
      case 7: off = R[3]; break;
    }
    if (mod === 1) off += s8(f8()); else if (mod === 2) off += f16();
    ea = lin(seg >= 0 ? seg : ds, off); cyc += 7;
  }
  const rm8 = () => mod === 3 ? g8(rm) : rb(ea), wrm8 = v => { if (mod === 3) p8(rm, v); else wb(ea, v); };
  const rm16 = () => mod === 3 ? R[rm] : rw(ea), wrm16 = v => { if (mod === 3) R[rm] = v & 0xFFFF; else ww(ea, v); };
  /* ALU */
  function szp(v, w) { const m = w ? 0xFFFF : 0xFF; v &= m; c.zf = v ? 0 : 1; c.sf = (v >> (w ? 15 : 7)) & 1; c.pf = PAR[v & 0xFF]; return v; }
  function alu(op, a, b, w) {
    const m = w ? 0xFFFF : 0xFF, sb = w ? 0x8000 : 0x80; let r;
    switch (op) {
      case 0: case 2: { const ci = op === 2 ? c.cf : 0; r = a + b + ci; c.cf = r > m ? 1 : 0; c.af = ((a ^ b ^ r) >> 4) & 1; c.of = ((r ^ a) & (r ^ b) & sb) ? 1 : 0; return szp(r, w); }
      case 3: case 5: case 7: { const bi = op === 3 ? c.cf : 0; r = a - b - bi; c.cf = r < 0 ? 1 : 0; c.af = ((a ^ b ^ r) >> 4) & 1; c.of = ((a ^ b) & (a ^ r) & sb) ? 1 : 0; return szp(r, w); }
      case 1: r = a | b; break; case 4: r = a & b; break; case 6: r = a ^ b; break;
    }
    c.cf = c.of = 0; c.af = 0; return szp(r, w);
  }
  function incdec(v, d, w) { const cf = c.cf; const r = alu(d > 0 ? 0 : 5, v, 1, w); c.cf = cf; return r; }
  function shift(op, v, n, w) {
    const bits = w ? 16 : 8, m = w ? 0xFFFF : 0xFF, top = bits - 1;
    if (!n) return v;
    for (let i = 0; i < n; i++) {
      switch (op) {
        case 0: { const b = (v >> top) & 1; v = ((v << 1) | b) & m; c.cf = b; break; }
        case 1: { const b = v & 1; v = (v >> 1) | (b << top); c.cf = b; break; }
        case 2: { const b = (v >> top) & 1; v = ((v << 1) | c.cf) & m; c.cf = b; break; }
        case 3: { const b = v & 1; v = (v >> 1) | (c.cf << top); c.cf = b; break; }
        case 4: case 6: c.cf = (v >> top) & 1; v = (v << 1) & m; break;
        case 5: c.cf = v & 1; v >>= 1; break;
        case 7: c.cf = v & 1; v = (v >> 1) | (v & (1 << top)); break;
      }
    }
    if (op < 4) { c.of = op === 0 || op === 2 ? (((v >> top) & 1) ^ c.cf) : (((v >> top) ^ (v >> (top - 1))) & 1); }
    else { szp(v, w); c.of = op === 5 ? ((n === 1) ? 0 : c.of) : ((v >> top) & 1) ^ c.cf; if (op === 7) c.of = 0; }
    cyc += n * 4; return v;
  }
  function interrupt(n) { push(flagsW()); push(S[1]); push(c.ip); c.iff = 0; c.tf = 0; c.ip = rw(n * 4); S[1] = rw(n * 4 + 2); cyc += 50; }
  const cond = k => {
    switch (k) { case 0: return c.of; case 1: return !c.of; case 2: return c.cf; case 3: return !c.cf; case 4: return c.zf; case 5: return !c.zf;
      case 6: return c.cf || c.zf; case 7: return !c.cf && !c.zf; case 8: return c.sf; case 9: return !c.sf; case 10: return c.pf; case 11: return !c.pf;
      case 12: return c.sf !== c.of; case 13: return c.sf === c.of; case 14: return c.zf || c.sf !== c.of; case 15: return !c.zf && c.sf === c.of; }
  };
  function strop(op) {
    const w = op & 1, d = c.df ? (w ? -2 : -1) : (w ? 2 : 1), ss = seg >= 0 ? seg : 3;
    const once = () => {
      switch (op & 0xFE) {
        case 0xA4: if (w) ww(lin(0, R[7]), rw(lin(ss, R[6]))); else wb(lin(0, R[7]), rb(lin(ss, R[6]))); R[6] += d; R[7] += d; break;
        case 0xA6: { const a = w ? rw(lin(ss, R[6])) : rb(lin(ss, R[6])), b = w ? rw(lin(0, R[7])) : rb(lin(0, R[7])); alu(7, a, b, w); R[6] += d; R[7] += d; break; }
        case 0xAA: if (w) ww(lin(0, R[7]), R[0]); else wb(lin(0, R[7]), R[0]); R[7] += d; break;
        case 0xAC: if (w) R[0] = rw(lin(ss, R[6])); else p8(0, rb(lin(ss, R[6]))); R[6] += d; break;
        case 0xAE: alu(7, w ? R[0] : R[0] & 0xFF, w ? rw(lin(0, R[7])) : rb(lin(0, R[7])), w); R[7] += d; break;
      }
      cyc += 10;
    };
    if (!rep) { once(); return; }
    const cmpType = (op & 0xFE) === 0xA6 || (op & 0xFE) === 0xAE;
    while (R[1]) { once(); R[1]--; if (cmpType && ((rep === 0xF3 && !c.zf) || (rep === 0xF2 && c.zf))) break; }
  }
  function step() {
    cyc = 0;
    if (c.nmiPend) { c.nmiPend = false; c.halted = false; interrupt(2); return cyc; }
    if (c.irqLine && c.iff) { c.halted = false; c.irqLine = false; interrupt(c.irqVec); return cyc; }
    if (c.halted) return 4;
    seg = -1; rep = 0;
    let op;
    for (;;) {
      op = f8();
      if (op === 0x26) seg = 0; else if (op === 0x2E) seg = 1; else if (op === 0x36) seg = 2; else if (op === 0x3E) seg = 3;
      else if (op === 0xF2 || op === 0xF3) rep = op; else if (op === 0xF0) { } else break;
    }
    cyc += 3;
    if (op < 0x40 && (op & 7) < 6) {
      const k = op >> 3, t = op & 7;
      if (t === 0) { modrm(); const r = alu(k, rm8(), g8(reg), 0); if (k !== 7) wrm8(r); }
      else if (t === 1) { modrm(); const r = alu(k, rm16(), R[reg], 1); if (k !== 7) wrm16(r); }
      else if (t === 2) { modrm(); const r = alu(k, g8(reg), rm8(), 0); if (k !== 7) p8(reg, r); }
      else if (t === 3) { modrm(); const r = alu(k, R[reg], rm16(), 1); if (k !== 7) R[reg] = r; }
      else if (t === 4) { const r = alu(k, R[0] & 0xFF, f8(), 0); if (k !== 7) p8(0, r); }
      else { const r = alu(k, R[0], f16(), 1); if (k !== 7) R[0] = r; }
      if (t === 0 && k === 7) { /* cmp r/m8: deshacer escritura */ }
      return cyc;
    }
    switch (op) {
      case 0x06: push(S[0]); break; case 0x07: S[0] = pop(); break; case 0x0E: push(S[1]); break; case 0x0F: S[1] = pop(); break;
      case 0x16: push(S[2]); break; case 0x17: S[2] = pop(); break; case 0x1E: push(S[3]); break; case 0x1F: S[3] = pop(); break;
      case 0x27: case 0x2F: { let al = R[0] & 0xFF; const oc = c.cf, sub = op === 0x2F;
        if ((al & 15) > 9 || c.af) { al = sub ? al - 6 : al + 6; c.af = 1; } else c.af = 0;
        if ((R[0] & 0xFF) > 0x99 || oc) { al = sub ? al - 0x60 : al + 0x60; c.cf = 1; } else c.cf = 0;
        p8(0, szp(al, 0)); break; }
      case 0x37: case 0x3F: { if ((R[0] & 15) > 9 || c.af) { const al = op === 0x37 ? (R[0] & 0xFF) + 6 : (R[0] & 0xFF) - 6; const ah = (R[0] >> 8) + (op === 0x37 ? 1 : -1); R[0] = ((ah & 0xFF) << 8) | (al & 15); c.af = c.cf = 1; } else { c.af = c.cf = 0; R[0] &= 0xFF0F; } break; }
      default:
        if (op >= 0x40 && op <= 0x47) { R[op & 7] = incdec(R[op & 7], 1, 1); break; }
        if (op >= 0x48 && op <= 0x4F) { R[op & 7] = incdec(R[op & 7], -1, 1); break; }
        if (op >= 0x50 && op <= 0x57) { if (op === 0x54) push((R[4] - 2) & 0xFFFF); else push(R[op & 7]); break; }
        if (op >= 0x58 && op <= 0x5F) { R[op & 7] = pop(); break; }
        if (bus.is186 && op >= 0x60 && op <= 0x6F) {
          switch (op) {
            case 0x60: { const sp = R[4]; push(R[0]); push(R[1]); push(R[2]); push(R[3]); push(sp); push(R[5]); push(R[6]); push(R[7]); break; }
            case 0x61: R[7] = pop(); R[6] = pop(); R[5] = pop(); pop(); R[3] = pop(); R[2] = pop(); R[1] = pop(); R[0] = pop(); break;
            case 0x62: modrm(); break;
            case 0x68: push(f16()); break;
            case 0x6A: push(s8(f8()) & 0xFFFF); break;
            case 0x69: case 0x6B: { modrm(); const a = s16(rm16()), b = op === 0x69 ? s16(f16()) : s8(f8()); const r = a * b; R[reg] = r & 0xFFFF; c.cf = c.of = (r !== s16(r & 0xFFFF)) ? 1 : 0; cyc += 25; break; }
            case 0x6C: case 0x6D: { const once = () => { const d = c.df ? -1 : 1; if (op & 1) { const v = bus.in16 ? bus.in16(R[2]) : bus.in(R[2]); ww(lin(0, R[7]), v); R[7] += 2 * d; } else { wb(lin(0, R[7]), bus.in(R[2])); R[7] += d; } };
              if (rep) while (R[1]) { once(); R[1]--; } else once(); break; }
            case 0x6E: case 0x6F: { const ss = seg >= 0 ? seg : 3; const once = () => { const d = c.df ? -1 : 1; if (op & 1) { const v = rw(lin(ss, R[6])); bus.out16 ? bus.out16(R[2], v) : bus.out(R[2], v & 0xFF); R[6] += 2 * d; } else { bus.out(R[2], rb(lin(ss, R[6]))); R[6] += d; } };
              if (rep) while (R[1]) { once(); R[1]--; } else once(); break; }
          }
          break;
        }
        if (op >= 0x60 && op <= 0x7F) { const d = s8(f8()); if (cond(op & 15)) { c.ip = (c.ip + d) & 0xFFFF; cyc += 12; } break; }
        if (op >= 0x90 && op <= 0x97) { const t = R[0]; R[0] = R[op & 7]; R[op & 7] = t; break; }
        if (op >= 0xB0 && op <= 0xB7) { p8(op & 7, f8()); break; }
        if (op >= 0xB8 && op <= 0xBF) { R[op & 7] = f16(); break; }
        if (op >= 0xD8 && op <= 0xDF) { modrm(); break; }
        switch (op) {
          case 0x80: case 0x82: { modrm(); const r = alu(reg, rm8(), f8(), 0); if (reg !== 7) wrm8(r); break; }
          case 0x81: { modrm(); const r = alu(reg, rm16(), f16(), 1); if (reg !== 7) wrm16(r); break; }
          case 0x83: { modrm(); const r = alu(reg, rm16(), s8(f8()) & 0xFFFF, 1); if (reg !== 7) wrm16(r); break; }
          case 0x84: modrm(); alu(4, rm8(), g8(reg), 0); break;
          case 0x85: modrm(); alu(4, rm16(), R[reg], 1); break;
          case 0x86: { modrm(); const t = rm8(); wrm8(g8(reg)); p8(reg, t); break; }
          case 0x87: { modrm(); const t = rm16(); wrm16(R[reg]); R[reg] = t; break; }
          case 0x88: modrm(); wrm8(g8(reg)); break;
          case 0x89: modrm(); wrm16(R[reg]); break;
          case 0x8A: modrm(); p8(reg, rm8()); break;
          case 0x8B: modrm(); R[reg] = rm16(); break;
          case 0x8C: modrm(); wrm16(S[reg & 3]); break;
          case 0x8D: { modrm(); /* LEA: recalcular offset sin segmento */ const b0 = ea; R[reg] = (b0 - (S[seg >= 0 ? seg : ((rm === 2 || rm === 3 || (rm === 6 && mod !== 0)) ? 2 : 3)] << 4)) & 0xFFFF; break; }
          case 0x8E: modrm(); S[reg & 3] = rm16(); break;
          case 0x8F: modrm(); wrm16(pop()); break;
          case 0x98: R[0] = s8(R[0] & 0xFF) & 0xFFFF; break;
          case 0x99: R[2] = (R[0] & 0x8000) ? 0xFFFF : 0; break;
          case 0x9A: { const o = f16(), s = f16(); push(S[1]); push(c.ip); c.ip = o; S[1] = s; cyc += 28; break; }
          case 0x9B: break;
          case 0x9C: push(flagsW()); break; case 0x9D: setFlags(pop()); break;
          case 0x9E: setFlags((flagsW() & 0xFF00) | (R[0] >> 8)); break; case 0x9F: p8(4, flagsW() & 0xFF); break;
          case 0xA0: p8(0, rb(lin(seg >= 0 ? seg : 3, f16()))); break;
          case 0xA1: R[0] = rw(lin(seg >= 0 ? seg : 3, f16())); break;
          case 0xA2: wb(lin(seg >= 0 ? seg : 3, f16()), R[0]); break;
          case 0xA3: ww(lin(seg >= 0 ? seg : 3, f16()), R[0]); break;
          case 0xA4: case 0xA5: case 0xA6: case 0xA7: case 0xAA: case 0xAB: case 0xAC: case 0xAD: case 0xAE: case 0xAF: strop(op); break;
          case 0xA8: alu(4, R[0] & 0xFF, f8(), 0); break; case 0xA9: alu(4, R[0], f16(), 1); break;
          case 0xC2: { const n = f16(); c.ip = pop(); R[4] = (R[4] + n) & 0xFFFF; break; }
          case 0xC3: c.ip = pop(); break;
          case 0xC4: case 0xC5: { modrm(); R[reg] = rw(ea); S[op === 0xC4 ? 0 : 3] = rw(ea + 2); break; }
          case 0xC6: modrm(); wrm8(f8()); break;
          case 0xC7: modrm(); wrm16(f16()); break;
          case 0xCA: { const n = f16(); c.ip = pop(); S[1] = pop(); R[4] = (R[4] + n) & 0xFFFF; break; }
          case 0xCB: c.ip = pop(); S[1] = pop(); break;
          case 0xCC: interrupt(3); break; case 0xCD: interrupt(f8()); break; case 0xCE: if (c.of) interrupt(4); break;
          case 0xCF: c.ip = pop(); S[1] = pop(); setFlags(pop()); break;
          case 0xC0: if (bus.is186) { modrm(); const v = rm8(); wrm8(shift(reg, v, f8() & 31, 0)); } break;
          case 0xC1: if (bus.is186) { modrm(); const v = rm16(); wrm16(shift(reg, v, f8() & 31, 1)); } break;
          case 0xC8: if (bus.is186) { const sz = f16(), lv = f8() & 31; push(R[5]); const fp = R[4]; for (let i = 1; i < lv; i++) { R[5] = (R[5] - 2) & 0xFFFF; push(rw(lin(2, R[5]))); } if (lv) push(fp); R[5] = fp; R[4] = (R[4] - sz) & 0xFFFF; } break;
          case 0xC9: if (bus.is186) { R[4] = R[5]; R[5] = pop(); } break;
          case 0xD0: modrm(); wrm8(shift(reg, rm8(), 1, 0)); break;
          case 0xD1: modrm(); wrm16(shift(reg, rm16(), 1, 1)); break;
          case 0xD2: modrm(); wrm8(shift(reg, rm8(), R[1] & 0xFF, 0)); break;
          case 0xD3: modrm(); wrm16(shift(reg, rm16(), R[1] & 0xFF, 1)); break;
          case 0xD4: { const b = f8() || 10, al = R[0] & 0xFF; R[0] = (((al / b) | 0) << 8) | (al % b); szp(R[0], 0); cyc += 80; break; }
          case 0xD5: { const b = f8(); R[0] = ((R[0] & 0xFF) + (R[0] >> 8) * b) & 0xFF; szp(R[0], 0); cyc += 60; break; }
          case 0xD7: p8(0, rb(lin(seg >= 0 ? seg : 3, R[3] + (R[0] & 0xFF)))); break;
          case 0xE0: { const d = s8(f8()); R[1]--; if (R[1] && !c.zf) c.ip = (c.ip + d) & 0xFFFF; break; }
          case 0xE1: { const d = s8(f8()); R[1]--; if (R[1] && c.zf) c.ip = (c.ip + d) & 0xFFFF; break; }
          case 0xE2: { const d = s8(f8()); R[1]--; if (R[1]) { c.ip = (c.ip + d) & 0xFFFF; cyc += 12; } break; }
          case 0xE3: { const d = s8(f8()); if (!R[1]) c.ip = (c.ip + d) & 0xFFFF; break; }
          case 0xE4: p8(0, bus.in(f8())); break; case 0xE5: { const p = f8(); R[0] = bus.in16 ? bus.in16(p) : bus.in(p); break; }
          case 0xE6: bus.out(f8(), R[0] & 0xFF); break; case 0xE7: { const p = f8(); bus.out16 ? bus.out16(p, R[0]) : bus.out(p, R[0] & 0xFF); break; }
          case 0xEC: p8(0, bus.in(R[2])); break; case 0xED: R[0] = bus.in16 ? bus.in16(R[2]) : bus.in(R[2]); break;
          case 0xEE: bus.out(R[2], R[0] & 0xFF); break; case 0xEF: bus.out16 ? bus.out16(R[2], R[0]) : bus.out(R[2], R[0] & 0xFF); break;
          case 0xE8: { const d = f16(); push(c.ip); c.ip = (c.ip + d) & 0xFFFF; cyc += 16; break; }
          case 0xE9: { const d = f16(); c.ip = (c.ip + d) & 0xFFFF; break; }
          case 0xEA: { const o = f16(), s = f16(); c.ip = o; S[1] = s; break; }
          case 0xEB: { const d = s8(f8()); c.ip = (c.ip + d) & 0xFFFF; break; }
          case 0xF4: c.halted = true; break;
          case 0xF5: c.cf ^= 1; break; case 0xF8: c.cf = 0; break; case 0xF9: c.cf = 1; break;
          case 0xFA: c.iff = 0; break; case 0xFB: c.iff = 1; break; case 0xFC: c.df = 0; break; case 0xFD: c.df = 1; break;
          case 0xF6: case 0xF7: {
            const w = op & 1; modrm(); const v = w ? rm16() : rm8();
            switch (reg) {
              case 0: case 1: alu(4, v, w ? f16() : f8(), w); break;
              case 2: w ? wrm16(~v) : wrm8(~v); break;
              case 3: { const r = alu(5, 0, v, w); c.cf = v ? 1 : 0; w ? wrm16(r) : wrm8(r); break; }
              case 4: if (w) { const r = R[0] * v; R[0] = r & 0xFFFF; R[2] = (r >>> 16) & 0xFFFF; c.cf = c.of = R[2] ? 1 : 0; } else { const r = (R[0] & 0xFF) * v; R[0] = r & 0xFFFF; c.cf = c.of = (r >> 8) ? 1 : 0; } cyc += 70; break;
              case 5: if (w) { const r = s16(R[0]) * s16(v); R[0] = r & 0xFFFF; R[2] = (r >> 16) & 0xFFFF; c.cf = c.of = (r !== s16(r & 0xFFFF)) ? 1 : 0; } else { const r = s8(R[0] & 0xFF) * s8(v); R[0] = r & 0xFFFF; c.cf = c.of = (r !== s8(r & 0xFF)) ? 1 : 0; } cyc += 80; break;
              case 6: if (w) { const n = R[2] * 65536 + R[0]; if (!v || (n / v) > 0xFFFF) { interrupt(0); break; } R[0] = Math.floor(n / v); R[2] = n % v; }
                else { const n = R[0]; if (!v || (n / v) > 0xFF) { interrupt(0); break; } R[0] = ((n % v) << 8) | Math.floor(n / v); } cyc += 90; break;
              case 7: if (w) { const n = (R[2] << 16) | R[0], d = s16(v); if (!d) { interrupt(0); break; } const q = Math.trunc(n / d); if (q > 32767 || q < -32768) { interrupt(0); break; } R[0] = q & 0xFFFF; R[2] = (n % d) & 0xFFFF; }
                else { const n = s16(R[0]), d = s8(v); if (!d) { interrupt(0); break; } const q = Math.trunc(n / d); if (q > 127 || q < -128) { interrupt(0); break; } R[0] = ((n % d) & 0xFF) << 8 | (q & 0xFF); } cyc += 100; break;
            }
            break;
          }
          case 0xFE: { modrm(); if (reg < 2) wrm8(incdec(rm8(), reg ? -1 : 1, 0)); break; }
          case 0xFF: {
            modrm();
            switch (reg) {
              case 0: wrm16(incdec(rm16(), 1, 1)); break;
              case 1: wrm16(incdec(rm16(), -1, 1)); break;
              case 2: { const t = rm16(); push(c.ip); c.ip = t; break; }
              case 3: { const o = rw(ea), s = rw(ea + 2); push(S[1]); push(c.ip); c.ip = o; S[1] = s; break; }
              case 4: c.ip = rm16(); break;
              case 5: c.ip = rw(ea); S[1] = rw(ea + 2); break;
              case 6: push(rm16()); break;
            }
            break;
          }
        }
    }
    return cyc;
  }
  c.step = step;
  c.reset = () => { R.fill(0); S.fill(0); S[1] = 0xFFFF; c.ip = 0; setFlags(0); c.halted = false; };
  c.nmi = () => { c.nmiPend = true; };
  c.intr = v => { c.irqLine = true; c.irqVec = v; };
  c.linPC = () => lin(1, c.ip);
  return c;
}
function X86CPU(bus) {
  const c = make8086(bus);
  const a = { c, total: 0, done: 0, reset() { c.reset(); }, nmi() { c.nmi(); }, cycles() { return a.total + a.done; }, get pc() { return c.linPC(); },
    run(n) { a.done = 0; while (a.done < n) a.done += c.step(); a.total += a.done; const d = a.done; a.done = 0; return d; } };
  return a;
}
