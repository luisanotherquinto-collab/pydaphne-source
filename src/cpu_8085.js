/* ==========================================================================
 *  Intel 8085 (8080 + RIM/SIM + RST 5.5/6.5/7.5/TRAP)
 * ========================================================================== */
'use strict';
function make8085(bus) {
  const c = { a: 0, b: 0, c: 0, d: 0, e: 0, h: 0, l: 0, sp: 0, pc: 0, f: 0x02, ie: 0, halted: 0, mask: 7, r75: 0, i55: 0, i65: 0, sod: 0, trapPend: 0 };
  const PAR = new Uint8Array(256); for (let i = 0; i < 256; i++) { let b = i, p = 1; while (b) { p ^= b & 1; b >>= 1; } PAR[i] = p; }
  const S = 0x80, Z = 0x40, AC = 0x10, P = 0x04, CY = 0x01;
  const rd = a => bus.rd(a & 0xFFFF), wr = (a, v) => bus.wr(a & 0xFFFF, v & 0xFF);
  const f8 = () => { const v = rd(c.pc); c.pc = (c.pc + 1) & 0xFFFF; return v; };
  const f16 = () => { const l = f8(); return l | (f8() << 8); };
  const push = v => { c.sp = (c.sp - 1) & 0xFFFF; wr(c.sp, v >> 8); c.sp = (c.sp - 1) & 0xFFFF; wr(c.sp, v); };
  const pop = () => { const l = rd(c.sp); c.sp = (c.sp + 1) & 0xFFFF; const h = rd(c.sp); c.sp = (c.sp + 1) & 0xFFFF; return l | (h << 8); };
  const szp = v => (v & S) | (v ? 0 : Z) | (PAR[v] ? P : 0);
  const getR = r => { switch (r) { case 0: return c.b; case 1: return c.c; case 2: return c.d; case 3: return c.e; case 4: return c.h; case 5: return c.l; case 6: return rd((c.h << 8) | c.l); case 7: return c.a; } };
  const setR = (r, v) => { v &= 0xFF; switch (r) { case 0: c.b = v; break; case 1: c.c = v; break; case 2: c.d = v; break; case 3: c.e = v; break; case 4: c.h = v; break; case 5: c.l = v; break; case 6: wr((c.h << 8) | c.l, v); break; case 7: c.a = v; break; } };
  const getRP = p => p === 0 ? (c.b << 8) | c.c : p === 1 ? (c.d << 8) | c.e : p === 2 ? (c.h << 8) | c.l : c.sp;
  const setRP = (p, v) => { v &= 0xFFFF; if (p === 0) { c.b = v >> 8; c.c = v & 0xFF; } else if (p === 1) { c.d = v >> 8; c.e = v & 0xFF; } else if (p === 2) { c.h = v >> 8; c.l = v & 0xFF; } else c.sp = v; };
  function alu(op, v) {
    const a = c.a; let r;
    switch (op) {
      case 0: case 1: { const ci = op === 1 ? c.f & CY : 0; r = a + v + ci; c.f = szp(r & 0xFF) | (r > 0xFF ? CY : 0) | (((a & 15) + (v & 15) + ci) > 15 ? AC : 0) | 2; c.a = r & 0xFF; break; }
      case 2: case 3: case 7: { const bi = op === 3 ? c.f & CY : 0; r = a - v - bi; c.f = szp(r & 0xFF) | (r < 0 ? CY : 0) | (((a & 15) - (v & 15) - bi) >= 0 ? AC : 0) | 2; if (op !== 7) c.a = r & 0xFF; break; }
      case 4: c.a = a & v; c.f = szp(c.a) | (((a | v) & 8) ? AC : 0) | 2; break;
      case 5: c.a = a ^ v; c.f = szp(c.a) | 2; break;
      case 6: c.a = a | v; c.f = szp(c.a) | 2; break;
    }
  }
  const cond = k => { switch (k) { case 0: return !(c.f & Z); case 1: return c.f & Z; case 2: return !(c.f & CY); case 3: return c.f & CY; case 4: return !(c.f & P); case 5: return c.f & P; case 6: return !(c.f & S); case 7: return c.f & S; } };
  const CYC = [4,10,7,6,4,4,7,4,4,10,7,6,4,4,7,4, 7,10,7,6,4,4,7,4,10,10,7,6,4,4,7,4, 7,10,16,6,4,4,7,4,10,10,16,6,4,4,7,4, 7,10,13,6,10,10,10,4,10,10,13,6,4,4,7,4];
  function interrupt(vec) { c.halted = 0; c.ie = 0; push(c.pc); c.pc = vec; return 12; }
  function step() {
    if (c.trapPend) { c.trapPend = 0; c.halted = 0; push(c.pc); c.pc = 0x24; return 12; }
    if (c.ie) {
      if (c.r75 && !(c.mask & 4)) { c.r75 = 0; return interrupt(0x3C); }
      if (c.i65 && !(c.mask & 2)) return interrupt(0x34);
      if (c.i55 && !(c.mask & 1)) return interrupt(0x2C);
      if (c.intr && bus.intAck) { c.intr = 0; return interrupt(bus.intAck() & 0x38); }
    }
    if (c.halted) return 4;
    const op = f8();
    if (op >= 0x40 && op < 0x80) { if (op === 0x76) { c.halted = 1; return 5; } setR((op >> 3) & 7, getR(op & 7)); return (op & 7) === 6 || ((op >> 3) & 7) === 6 ? 7 : 4; }
    if (op >= 0x80 && op < 0xC0) { alu((op >> 3) & 7, getR(op & 7)); return (op & 7) === 6 ? 7 : 4; }
    if (op < 0x40) {
      const y = (op >> 3) & 7, p = (op >> 4) & 3;
      switch (op & 7) {
        case 0:
          if (op === 0x20) { c.a = (c.sod << 7) | (bus.sid ? (bus.sid() << 7) : 0) & 0x80 | (c.i65 ? 0x20 : 0) | (c.i55 ? 0x10 : 0) | (c.ie ? 8 : 0) | (c.r75 ? 0x40 : 0) | (c.mask & 7); c.a &= 0xFF; }
          /* instrucciones no documentadas del 8085 (Casino Strip usa DSUB para convertir a decimal) */
          else if (op === 0x08) { const hl = getRP(2), bc = getRP(0), r = hl - bc, v = (((hl ^ bc) & (hl ^ r)) & 0x8000) ? 2 : 0; setRP(2, r & 0xFFFF); const h = (r >> 8) & 0xFF; c.f = (szp(h) & 0xC4 & ~4) | ((r & 0xFFFF) === 0 ? 0x40 : 0) | (r < 0 ? CY : 0) | v | (((r & 0xFFFF) ? 0 : 0)) | (szp(r & 0xFF) & 4); }
          else if (op === 0x10) { const hl = getRP(2); c.f = (c.f & ~CY) | (hl & 1); setRP(2, (hl >> 1) | (hl & 0x8000)); }
          else if (op === 0x18) { const de = getRP(1), cy = c.f & CY; c.f = (c.f & ~CY) | ((de >> 15) & 1); setRP(1, ((de << 1) | cy) & 0xFFFF); }
          else if (op === 0x28) { setRP(1, (getRP(2) + f8()) & 0xFFFF); }
          else if (op === 0x38) { setRP(1, (getRP(3) + f8()) & 0xFFFF); }
          else if (op === 0x30) { if (c.a & 8) c.mask = c.a & 7; if (c.a & 0x10) c.r75 = 0; if (c.a & 0x40) { c.sod = (c.a >> 7) & 1; if (bus.sod) bus.sod(c.sod); } }
          break;
        case 1: if (op & 8) { const hl = getRP(2) + getRP(p); c.f = (c.f & ~CY) | (hl > 0xFFFF ? CY : 0); setRP(2, hl); } else setRP(p, f16()); break;
        case 2:
          switch (op) {
            case 0x02: wr(getRP(0), c.a); break; case 0x12: wr(getRP(1), c.a); break;
            case 0x0A: c.a = rd(getRP(0)); break; case 0x1A: c.a = rd(getRP(1)); break;
            case 0x22: { const a = f16(); wr(a, c.l); wr(a + 1, c.h); break; }
            case 0x2A: { const a = f16(); c.l = rd(a); c.h = rd(a + 1); break; }
            case 0x32: wr(f16(), c.a); break; case 0x3A: c.a = rd(f16()); break;
          }
          break;
        case 3: setRP(p, getRP(p) + (op & 8 ? -1 : 1)); break;
        case 4: { const v = (getR(y) + 1) & 0xFF; setR(y, v); c.f = (c.f & CY) | szp(v) | ((v & 15) === 0 ? AC : 0) | 2; break; }
        case 5: { const v = (getR(y) - 1) & 0xFF; setR(y, v); c.f = (c.f & CY) | szp(v) | ((v & 15) !== 15 ? AC : 0) | 2; break; }
        case 6: setR(y, f8()); break;
        case 7:
          switch (y) {
            case 0: { const b = c.a >> 7; c.a = ((c.a << 1) | b) & 0xFF; c.f = (c.f & ~CY) | b; break; }
            case 1: { const b = c.a & 1; c.a = (c.a >> 1) | (b << 7); c.f = (c.f & ~CY) | b; break; }
            case 2: { const b = c.a >> 7; c.a = ((c.a << 1) | (c.f & CY)) & 0xFF; c.f = (c.f & ~CY) | b; break; }
            case 3: { const b = c.a & 1; c.a = (c.a >> 1) | ((c.f & CY) << 7); c.f = (c.f & ~CY) | b; break; }
            case 4: { let a = c.a, cy = c.f & CY, ac = 0, add = 0; if ((a & 15) > 9 || (c.f & AC)) { add = 6; ac = ((a & 15) + 6) > 15 ? AC : 0; } if (a > 0x99 || cy) { add |= 0x60; cy = CY; } const r = (a + add) & 0xFF; c.a = r; c.f = szp(r) | cy | ac | 2; break; }
            case 5: c.a ^= 0xFF; break; case 6: c.f |= CY; break; case 7: c.f ^= CY; break;
          }
          break;
      }
      return CYC[op];
    }
    const y = (op >> 3) & 7;
    switch (op & 7) {
      case 0: if (cond(y)) { c.pc = pop(); return 12; } return 6;
      case 1:
        switch (op) {
          case 0xC1: setRP(0, pop()); break; case 0xD1: setRP(1, pop()); break; case 0xE1: setRP(2, pop()); break;
          case 0xF1: { const v = pop(); c.a = v >> 8; c.f = (v & 0xD5) | 2; break; }
          case 0xC9: c.pc = pop(); break; case 0xE9: c.pc = getRP(2); break; case 0xF9: c.sp = getRP(2); break;
        }
        return 10;
      case 2: { const a = f16(); if (cond(y)) c.pc = a; return 10; }
      case 3:
        switch (op) {
          case 0xC3: c.pc = f16(); return 10;
          case 0xD3: bus.out(f8(), c.a); return 10;
          case 0xDB: c.a = bus.in(f8()) & 0xFF; return 10;
          case 0xE3: { const l = rd(c.sp), h = rd(c.sp + 1); wr(c.sp, c.l); wr(c.sp + 1, c.h); c.l = l; c.h = h; return 16; }
          case 0xEB: { let t = c.d; c.d = c.h; c.h = t; t = c.e; c.e = c.l; c.l = t; return 4; }
          case 0xF3: c.ie = 0; return 4;
          case 0xFB: c.ie = 1; c.eiSkip = 1; return 4;
          case 0xCB: c.pc = f16(); return 10;
        }
        return 4;
      case 4: { const a = f16(); if (cond(y)) { push(c.pc); c.pc = a; return 18; } return 9; }
      case 5:
        switch (op) {
          case 0xC5: push(getRP(0)); break; case 0xD5: push(getRP(1)); break; case 0xE5: push(getRP(2)); break;
          case 0xF5: push((c.a << 8) | (c.f & 0xD5) | 2); break;
          case 0xCD: { const a = f16(); push(c.pc); c.pc = a; return 18; }
          case 0xD9: { const a = getRP(1); wr(a, c.l); wr((a + 1) & 0xFFFF, c.h); return 10; }   /* SHLX */
          case 0xED: { const a = getRP(1); c.l = rd(a); c.h = rd((a + 1) & 0xFFFF); return 10; }   /* LHLX */
          case 0xDD: { const a = f16(); if (!(c.f & 0x20)) c.pc = a; return 10; }   /* JNX5 */
          case 0xFD: { const a = f16(); if (c.f & 0x20) c.pc = a; return 10; }   /* JX5 */
        }
        return 12;
      case 6: alu(y, f8()); return 7;
      case 7: push(c.pc); c.pc = y * 8; return 12;
    }
    return 4;
  }
  c.step = step;
  c.reset = () => { c.pc = 0; c.ie = 0; c.mask = 7; c.halted = 0; };
  return c;
}
function I8085CPU(bus) {
  const c = make8085(bus);
  const a = { c, total: 0, done: 0, reset() { c.reset(); }, cycles() { return a.total + a.done; }, get pc() { return c.pc; },
    run(n) { a.done = 0; while (a.done < n) a.done += c.step(); a.total += a.done; const d = a.done; a.done = 0; return d; } };
  return a;
}
