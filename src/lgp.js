'use strict';
const LGPCORE = (function () {

/* z80.js - nucleo Z80 completo (base + CB + ED + DD/FD + DDCB/FDCB).
 *
 * Version portatil del mismo modelo que runtime/z80rt.h del recompilador.
 * El recompilador estatico no se puede transliterar a JS porque JS no tiene
 * goto, asi que aqui va un interprete equivalente en semantica.
 *
 * El bus lo aporta quien lo instancia: {rd, wr, in, out}.
 */
'use strict';

function makeZ80(bus) {
  const SZP = new Uint8Array(256), SZ = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let p = 0, v = i;
    while (v) { p ^= v & 1; v >>= 1; }
    SZ[i] = (i & 0xA8) | (i ? 0 : 0x40);
    SZP[i] = SZ[i] | (p ? 0 : 0x04);
  }
  const FS = 0x80, FZ = 0x40, FY = 0x20, FH = 0x10, FX = 0x08, FP = 0x04, FN = 0x02, FC = 0x01;

  const z = {
    a: 0, f: 0, b: 0, c: 0, d: 0, e: 0, h: 0, l: 0,
    a_: 0, f_: 0, b_: 0, c_: 0, d_: 0, e_: 0, h_: 0, l_: 0,
    ix: 0, iy: 0, sp: 0xFFFF, pc: 0, i: 0, r: 0,
    iff1: 0, iff2: 0, im: 1, halted: 0, cyc: 0, eiPending: 0
  };

  const rd = bus.rd, wr = bus.wr;
  const rd16 = a => rd(a) | (rd((a + 1) & 0xFFFF) << 8);
  const wr16 = (a, v) => { wr(a, v & 0xFF); wr((a + 1) & 0xFFFF, v >> 8); };
  const fetch = () => { const v = rd(z.pc); z.pc = (z.pc + 1) & 0xFFFF; return v; };
  const fetch16 = () => { const v = rd16(z.pc); z.pc = (z.pc + 2) & 0xFFFF; return v; };
  const push = v => { z.sp = (z.sp - 2) & 0xFFFF; wr16(z.sp, v); };
  const pop = () => { const v = rd16(z.sp); z.sp = (z.sp + 2) & 0xFFFF; return v; };

  const getHL = () => (z.h << 8) | z.l;
  const setHL = v => { z.h = (v >> 8) & 0xFF; z.l = v & 0xFF; };
  const getBC = () => (z.b << 8) | z.c;
  const setBC = v => { z.b = (v >> 8) & 0xFF; z.c = v & 0xFF; };
  const getDE = () => (z.d << 8) | z.e;
  const setDE = v => { z.d = (v >> 8) & 0xFF; z.e = v & 0xFF; };

  /* ---- ALU ---- */
  function add8(v) {
    const r = z.a + v;
    z.f = SZ[r & 0xFF] | ((z.a ^ v ^ r) & FH) | ((r >> 8) & FC)
        | ((((z.a ^ v ^ 0x80) & (v ^ r)) >> 5) & FP);
    z.a = r & 0xFF;
  }
  function adc8(v) {
    const cy = z.f & FC, r = z.a + v + cy;
    z.f = SZ[r & 0xFF] | ((z.a ^ v ^ r) & FH) | ((r >> 8) & FC)
        | ((((z.a ^ v ^ 0x80) & (v ^ r)) >> 5) & FP);
    z.a = r & 0xFF;
  }
  function sub8(v) {
    const r = z.a - v;
    z.f = SZ[r & 0xFF] | FN | ((z.a ^ v ^ r) & FH) | ((r >> 8) & FC)
        | ((((z.a ^ v) & (z.a ^ r)) >> 5) & FP);
    z.a = r & 0xFF;
  }
  function sbc8(v) {
    const cy = z.f & FC, r = z.a - v - cy;
    z.f = SZ[r & 0xFF] | FN | ((z.a ^ v ^ r) & FH) | ((r >> 8) & FC)
        | ((((z.a ^ v) & (z.a ^ r)) >> 5) & FP);
    z.a = r & 0xFF;
  }
  function and8(v) { z.a &= v; z.f = SZP[z.a] | FH; }
  function xor8(v) { z.a ^= v; z.f = SZP[z.a]; }
  function or8(v)  { z.a |= v; z.f = SZP[z.a]; }
  function cp8(v) {
    const r = z.a - v;
    z.f = (r & FS) | ((r & 0xFF) ? 0 : FZ) | (v & (FY | FX)) | FN
        | ((z.a ^ v ^ r) & FH) | ((r >> 8) & FC)
        | ((((z.a ^ v) & (z.a ^ r)) >> 5) & FP);
  }
  function inc8(v) {
    const r = (v + 1) & 0xFF;
    z.f = (z.f & FC) | SZ[r] | ((r & 0x0F) ? 0 : FH) | (r === 0x80 ? FP : 0);
    return r;
  }
  function dec8(v) {
    const r = (v - 1) & 0xFF;
    z.f = (z.f & FC) | SZ[r] | FN | ((v & 0x0F) === 0 ? FH : 0) | (r === 0x7F ? FP : 0);
    return r;
  }
  function add16(a, b) {
    const r = a + b;
    z.f = (z.f & (FS | FZ | FP)) | (((a ^ b ^ r) >> 8) & FH) | ((r >> 16) & FC)
        | ((r >> 8) & (FY | FX));
    return r & 0xFFFF;
  }
  function adc16(b) {
    const a = getHL(), r = a + b + (z.f & FC);
    z.f = ((r >> 8) & 0xA8) | ((r & 0xFFFF) ? 0 : FZ) | (((a ^ b ^ r) >> 8) & FH)
        | ((r >> 16) & FC) | ((((a ^ b ^ 0x8000) & (b ^ r)) >> 13) & FP);
    setHL(r & 0xFFFF);
  }
  function sbc16(b) {
    const a = getHL(), r = a - b - (z.f & FC);
    z.f = ((r >> 8) & 0xA8) | ((r & 0xFFFF) ? 0 : FZ) | (((a ^ b ^ r) >> 8) & FH)
        | ((r >> 16) & FC) | FN | ((((a ^ b) & (a ^ r)) >> 13) & FP);
    setHL(r & 0xFFFF);
  }
  function daa() {
    let a = z.a, cy = z.f & FC, corr = 0;
    if ((z.f & FH) || (a & 0x0F) > 9) corr |= 0x06;
    if (cy || a > 0x99) { corr |= 0x60; cy = FC; }
    if (z.f & FN) {
      const hf = ((a & 0x0F) < (corr & 0x0F)) ? FH : 0;
      a = (a - corr) & 0xFF; z.f = SZP[a] | FN | cy | hf;
    } else {
      const hf = (((a & 0x0F) + (corr & 0x0F)) > 0x0F) ? FH : 0;
      a = (a + corr) & 0xFF; z.f = SZP[a] | cy | hf;
    }
    z.a = a;
  }

  const rot = [
    v => { const r = ((v << 1) | (v >> 7)) & 0xFF; z.f = SZP[r] | (v >> 7); return r; },
    v => { const r = ((v >> 1) | (v << 7)) & 0xFF; z.f = SZP[r] | (v & 1); return r; },
    v => { const r = ((v << 1) | (z.f & FC)) & 0xFF; z.f = SZP[r] | (v >> 7); return r; },
    v => { const r = ((v >> 1) | ((z.f & FC) << 7)) & 0xFF; z.f = SZP[r] | (v & 1); return r; },
    v => { const r = (v << 1) & 0xFF; z.f = SZP[r] | (v >> 7); return r; },
    v => { const r = ((v >> 1) | (v & 0x80)) & 0xFF; z.f = SZP[r] | (v & 1); return r; },
    v => { const r = ((v << 1) | 1) & 0xFF; z.f = SZP[r] | (v >> 7); return r; },
    v => { const r = v >> 1; z.f = SZP[r] | (v & 1); return r; }
  ];

  function bit(v, n) {
    const r = v & (1 << n);
    z.f = (z.f & FC) | FH | SZ[r] | (r ? 0 : FP) | (v & (FY | FX));
    if (n === 7 && r) z.f |= FS;
  }

  /* acceso a registros con prefijo de indice */
  function getR(i, idx, d) {
    switch (i) {
      case 0: return z.b; case 1: return z.c; case 2: return z.d; case 3: return z.e;
      case 4: return idx ? ((z[idx] >> 8) & 0xFF) : z.h;
      case 5: return idx ? (z[idx] & 0xFF) : z.l;
      case 6: return idx ? rd((z[idx] + d) & 0xFFFF) : rd(getHL());
      default: return z.a;
    }
  }
  function setR(i, v, idx, d) {
    v &= 0xFF;
    switch (i) {
      case 0: z.b = v; break; case 1: z.c = v; break;
      case 2: z.d = v; break; case 3: z.e = v; break;
      case 4: if (idx) z[idx] = (z[idx] & 0x00FF) | (v << 8); else z.h = v; break;
      case 5: if (idx) z[idx] = (z[idx] & 0xFF00) | v; else z.l = v; break;
      case 6: if (idx) wr((z[idx] + d) & 0xFFFF, v); else wr(getHL(), v); break;
      default: z.a = v;
    }
  }
  function getRP(p, idx) {
    switch (p) { case 0: return getBC(); case 1: return getDE();
                 case 2: return idx ? z[idx] : getHL(); default: return z.sp; }
  }
  function setRP(p, v, idx) {
    v &= 0xFFFF;
    switch (p) { case 0: setBC(v); break; case 1: setDE(v); break;
                 case 2: if (idx) z[idx] = v; else setHL(v); break; default: z.sp = v; }
  }
  function cond(y) {
    switch (y) {
      case 0: return !(z.f & FZ); case 1: return !!(z.f & FZ);
      case 2: return !(z.f & FC); case 3: return !!(z.f & FC);
      case 4: return !(z.f & FP); case 5: return !!(z.f & FP);
      case 6: return !(z.f & FS); default: return !!(z.f & FS);
    }
  }

  function step() {
    if (z.halted) { z.cyc -= 4; return; }
    let idx = null, op = fetch();
    while (op === 0xDD || op === 0xFD) { idx = op === 0xDD ? 'ix' : 'iy'; op = fetch(); }
    z.r = (z.r + 1) & 0x7F;
    let d = 0;

    if (op === 0xCB) {
      if (idx) { d = (fetch() << 24) >> 24; }
      const o2 = fetch(), x = o2 >> 6, y = (o2 >> 3) & 7, s = o2 & 7;
      z.cyc -= idx ? 23 : 8;
      if (idx) {
        const addr = (z[idx] + d) & 0xFFFF, v = rd(addr);
        if (x === 1) { bit(v, y); return; }
        let r = x === 0 ? rot[y](v) : x === 2 ? (v & ~(1 << y)) & 0xFF : (v | (1 << y)) & 0xFF;
        wr(addr, r);
        if (s !== 6) setR(s, r, null, 0);
        return;
      }
      const v = getR(s, null, 0);
      if (x === 1) { bit(v, y); return; }
      setR(s, x === 0 ? rot[y](v) : x === 2 ? (v & ~(1 << y)) : (v | (1 << y)), null, 0);
      return;
    }

    if (op === 0xED) {
      const o2 = fetch(), x = o2 >> 6, y = (o2 >> 3) & 7, s = o2 & 7, p = (o2 >> 4) & 3, q = (o2 >> 3) & 1;
      z.cyc -= 12;
      if (x === 1) {
        if (s === 0) { const v = bus.in(getBC()); if (y !== 6) setR(y, v, null, 0); z.f = (z.f & FC) | SZP[v]; }
        else if (s === 1) bus.out(getBC(), y === 6 ? 0 : getR(y, null, 0));
        else if (s === 2) { if (q) adc16(getRP(p, null)); else sbc16(getRP(p, null)); }
        else if (s === 3) { const nn = fetch16(); if (q) setRP(p, rd16(nn), null); else wr16(nn, getRP(p, null)); }
        else if (s === 4) { const v = z.a; z.a = 0; sub8(v); }
        else if (s === 5) { z.iff1 = z.iff2; z.pc = pop(); }
        else if (s === 6) z.im = [0, 0, 1, 2, 0, 0, 1, 2][y];
        else {
          if (y === 0) z.i = z.a;
          else if (y === 1) z.r = z.a;
          else if (y === 2) { z.a = z.i; z.f = (z.f & FC) | SZ[z.a] | (z.iff2 ? FP : 0); }
          else if (y === 3) { z.a = z.r; z.f = (z.f & FC) | SZ[z.a] | (z.iff2 ? FP : 0); }
          else if (y === 4) { const m = rd(getHL()); wr(getHL(), ((m >> 4) | (z.a << 4)) & 0xFF);
                              z.a = (z.a & 0xF0) | (m & 0x0F); z.f = (z.f & FC) | SZP[z.a]; }
          else if (y === 5) { const m = rd(getHL()); wr(getHL(), ((m << 4) | (z.a & 0x0F)) & 0xFF);
                              z.a = (z.a & 0xF0) | (m >> 4); z.f = (z.f & FC) | SZP[z.a]; }
        }
        return;
      }
      if (x === 2 && s <= 3 && y >= 4) {
        const inc = (y & 1) ? -1 : 1, rep = y >= 6;
        if (s === 0) {                                   /* LDI / LDD / LDIR / LDDR */
          const v = rd(getHL()); wr(getDE(), v);
          setHL(getHL() + inc); setDE(getDE() + inc); setBC((getBC() - 1) & 0xFFFF);
          const n = (v + z.a) & 0xFF;
          z.f = (z.f & (FS | FZ | FC)) | ((n & 0x02) ? FY : 0) | ((n & 0x08) ? FX : 0)
              | (getBC() ? FP : 0);
          if (rep && getBC()) { z.pc = (z.pc - 2) & 0xFFFF; z.cyc -= 5; }
        } else if (s === 1) {                            /* CPI / CPD / CPIR / CPDR */
          const v = rd(getHL()), r = (z.a - v) & 0xFF, hf = (z.a ^ v ^ r) & FH;
          setHL(getHL() + inc); setBC((getBC() - 1) & 0xFFFF);
          const n = (r - (hf ? 1 : 0)) & 0xFF;
          z.f = (z.f & FC) | FN | hf | (r ? 0 : FZ) | (r & FS)
              | ((n & 0x02) ? FY : 0) | ((n & 0x08) ? FX : 0) | (getBC() ? FP : 0);
          if (rep && getBC() && r) { z.pc = (z.pc - 2) & 0xFFFF; z.cyc -= 5; }
        } else if (s === 2) {
          wr(getHL(), bus.in(getBC())); setHL(getHL() + inc); z.b = dec8(z.b);
          if (rep && z.b) z.pc = (z.pc - 2) & 0xFFFF;
        } else {
          const v = rd(getHL()); z.b = dec8(z.b); bus.out(getBC(), v); setHL(getHL() + inc);
          if (rep && z.b) z.pc = (z.pc - 2) & 0xFFFF;
        }
      }
      return;
    }

    /* ---- opcodes base ---- */
    const x = op >> 6, y = (op >> 3) & 7, s = op & 7, p = (op >> 4) & 3, q = (op >> 3) & 1;
    z.cyc -= idx ? 8 : 4;

    if (x === 0) {
      if (s === 0) {
        if (y === 0) return;
        if (y === 1) { let t;
          t = z.a; z.a = z.a_; z.a_ = t; t = z.f; z.f = z.f_; z.f_ = t; return; }
        if (y === 2) { const o = (fetch() << 24) >> 24; z.b = (z.b - 1) & 0xFF;
                       if (z.b) { z.pc = (z.pc + o) & 0xFFFF; z.cyc -= 5; } return; }
        if (y === 3) { const o = (fetch() << 24) >> 24; z.pc = (z.pc + o) & 0xFFFF; z.cyc -= 7; return; }
        const o = (fetch() << 24) >> 24;
        if (cond(y - 4)) { z.pc = (z.pc + o) & 0xFFFF; z.cyc -= 5; }
        return;
      }
      if (s === 1) {
        if (q === 0) { setRP(p, fetch16(), idx); z.cyc -= 6; }
        else { const v = add16(getRP(2, idx), getRP(p, idx)); setRP(2, v, idx); z.cyc -= 7; }
        return;
      }
      if (s === 2) {
        if (q === 0) {
          if (p === 0) wr(getBC(), z.a);
          else if (p === 1) wr(getDE(), z.a);
          else if (p === 2) wr16(fetch16(), getRP(2, idx));
          else wr(fetch16(), z.a);
        } else {
          if (p === 0) z.a = rd(getBC());
          else if (p === 1) z.a = rd(getDE());
          else if (p === 2) setRP(2, rd16(fetch16()), idx);
          else z.a = rd(fetch16());
        }
        z.cyc -= 6;
        return;
      }
      if (s === 3) { setRP(p, getRP(p, idx) + (q ? -1 : 1), idx); z.cyc -= 2; return; }
      if (s === 4 || s === 5) {
        if (idx && y === 6) d = (fetch() << 24) >> 24;
        const v = getR(y, idx, d);
        setR(y, s === 4 ? inc8(v) : dec8(v), idx, d);
        return;
      }
      if (s === 6) {
        if (idx && y === 6) d = (fetch() << 24) >> 24;
        setR(y, fetch(), idx, d);
        z.cyc -= 3;
        return;
      }
      switch (y) {
        case 0: z.a = ((z.a << 1) | (z.a >> 7)) & 0xFF; z.f = (z.f & (FS|FZ|FP)) | (z.a & (FY|FX|FC)); break;
        case 1: { const c = z.a & 1; z.a = ((z.a >> 1) | (c << 7)) & 0xFF;
                  z.f = (z.f & (FS|FZ|FP)) | (z.a & (FY|FX)) | c; break; }
        case 2: { const c = z.f & FC, n = ((z.a << 1) | c) & 0xFF;
                  z.f = (z.f & (FS|FZ|FP)) | (n & (FY|FX)) | (z.a >> 7); z.a = n; break; }
        case 3: { const c = z.f & FC, n = ((z.a >> 1) | (c << 7)) & 0xFF;
                  z.f = (z.f & (FS|FZ|FP)) | (n & (FY|FX)) | (z.a & 1); z.a = n; break; }
        case 4: daa(); break;
        case 5: z.a = (~z.a) & 0xFF; z.f = (z.f & (FS|FZ|FP|FC)) | FH | FN | (z.a & (FY|FX)); break;
        case 6: z.f = (z.f & (FS|FZ|FP)) | FC | (z.a & (FY|FX)); break;
        default: { const c = z.f & FC;
                   z.f = (z.f & (FS|FZ|FP)) | (c ? FH : 0) | (c ^ FC) | (z.a & (FY|FX)); }
      }
      return;
    }

    if (x === 1) {
      if (y === 6 && s === 6) { z.halted = 1; return; }
      if (idx && (y === 6 || s === 6)) {
        d = (fetch() << 24) >> 24;
        z.cyc -= 11;
        if (s === 6) setR(y, rd((z[idx] + d) & 0xFFFF), null, 0);
        else wr((z[idx] + d) & 0xFFFF, getR(s, null, 0));
        return;
      }
      setR(y, getR(s, idx, 0), idx, 0);
      if (y === 6 || s === 6) z.cyc -= 3;
      return;
    }

    if (x === 2) {
      if (idx && s === 6) { d = (fetch() << 24) >> 24; z.cyc -= 11; }
      const v = getR(s, idx, d);
      [add8, adc8, sub8, sbc8, and8, xor8, or8, cp8][y](v);
      return;
    }

    /* x === 3 */
    if (s === 0) { if (cond(y)) { z.pc = pop(); z.cyc -= 6; } z.cyc -= 1; return; }
    if (s === 1) {
      if (q === 0) {
        const v = pop(); z.cyc -= 6;
        if (p === 3) { z.a = (v >> 8) & 0xFF; z.f = v & 0xFF; } else setRP(p, v, idx);
        return;
      }
      if (p === 0) { z.pc = pop(); z.cyc -= 6; return; }
      if (p === 1) { let t;
        t = z.b; z.b = z.b_; z.b_ = t; t = z.c; z.c = z.c_; z.c_ = t;
        t = z.d; z.d = z.d_; z.d_ = t; t = z.e; z.e = z.e_; z.e_ = t;
        t = z.h; z.h = z.h_; z.h_ = t; t = z.l; z.l = z.l_; z.l_ = t; return; }
      if (p === 2) { z.pc = getRP(2, idx); return; }
      z.sp = getRP(2, idx); return;
    }
    if (s === 2) { const nn = fetch16(); if (cond(y)) z.pc = nn; z.cyc -= 6; return; }
    if (s === 3) {
      if (y === 0) { z.pc = fetch16(); z.cyc -= 6; return; }
      if (y === 2) { const n = fetch(); bus.out(n | (z.a << 8), z.a); z.cyc -= 7; return; }
      if (y === 3) { const n = fetch(); z.a = bus.in(n | (z.a << 8)); z.cyc -= 7; return; }
      if (y === 4) { const t = rd16(z.sp); wr16(z.sp, getRP(2, idx)); setRP(2, t, idx); z.cyc -= 15; return; }
      if (y === 5) { let t;
        t = z.d; z.d = z.h; z.h = t; t = z.e; z.e = z.l; z.l = t; return; }
      if (y === 6) { z.iff1 = z.iff2 = 0; return; }
      z.iff1 = z.iff2 = 1; z.eiPending = 1; return;
    }
    if (s === 4) {
      const nn = fetch16();
      if (cond(y)) { push(z.pc); z.pc = nn; z.cyc -= 13; } else z.cyc -= 6;
      return;
    }
    if (s === 5) {
      if (q === 0) { push(p === 3 ? ((z.a << 8) | z.f) : getRP(p, idx)); z.cyc -= 7; return; }
      if (p === 0) { const nn = fetch16(); push(z.pc); z.pc = nn; z.cyc -= 13; return; }
      return;                                          /* opcode invalido */
    }
    if (s === 6) { [add8, adc8, sub8, sbc8, and8, xor8, or8, cp8][y](fetch()); z.cyc -= 3; return; }
    push(z.pc); z.pc = y * 8; z.cyc -= 7;
  }

  z.step = step;
  z.nmi = function () {
    z.halted = 0; z.iff2 = z.iff1; z.iff1 = 0;
    push(z.pc); z.pc = 0x0066; z.cyc -= 11;
  };
  z.irq = function () {
    if (!z.iff1) return false;
    z.halted = 0; z.iff1 = z.iff2 = 0;
    push(z.pc);
    z.pc = z.im === 2 ? rd16((z.i << 8) | 0xFF) : 0x0038;
    z.cyc -= 13;
    return true;
  };
  z.reset = function () {
    z.a = z.f = z.b = z.c = z.d = z.e = z.h = z.l = 0;
    z.pc = 0; z.sp = 0xFFFF; z.i = z.r = 0;
    z.iff1 = z.iff2 = 0; z.im = 1; z.halted = 0;
  };
  return z;
}



/* ay.js - AY-3-8910 (General Instrument) para el PCB de sonido de
 * Laser Grand Prix.  Tres canales de tono + ruido compartido + envolvente.
 *
 * El divisor interno del AY es /16 para tono y ruido y /256 para la
 * envolvente, contando desde el reloj del chip.
 */
'use strict';

/* volumenes logaritmicos de 4 bits, normalizados a 0..1 */
const AY_VOL = new Float32Array([
  0.0000, 0.0100, 0.0145, 0.0211, 0.0294, 0.0409, 0.0567, 0.0787,
  0.1096, 0.1524, 0.2119, 0.2947, 0.4100, 0.5700, 0.7930, 1.0000
]);

/* las 16 formas de envolvente se reducen a 4 bits: continue/attack/alternate/hold */
function makeAY(clock, sampleRate) {
  const reg = new Uint8Array(16);
  const tone = new Int32Array(3);       /* contador */
  const out  = new Uint8Array(3);       /* estado de la onda cuadrada */
  let noiseCnt = 0, noiseRng = 1, noiseOut = 0;
  let envCnt = 0, envStep = 0, envVol = 0, envHold = 0, envAtt = 0, envAlt = 0, envCont = 0;
  let latch = 0;
  /* el AY avanza a clock/16; acumulador de punto fijo 16.16 */
  const stepsPerSample = Math.floor((clock / 16 / sampleRate) * 65536);
  let acc = 0;

  function envReset() {
    const shape = reg[13] & 0x0F;
    envCont = (shape >> 3) & 1;
    envAtt  = (shape >> 2) & 1;
    envAlt  = (shape >> 1) & 1;
    envHold = shape & 1;
    envStep = 0;
    envVol = envAtt ? 0 : 15;
    envCnt = 0;
  }

  function envTick() {
    if (envStep > 15) return;
    envStep++;
    if (envStep > 15) {
      if (!envCont) { envVol = 0; envStep = 99; return; }
      if (envHold) {
        if (envAlt) envVol = envAtt ? 0 : 15;
        else envVol = envAtt ? 15 : 0;
        envStep = 99;
        return;
      }
      envStep = 0;
      if (envAlt) envAtt ^= 1;
      envVol = envAtt ? 0 : 15;
      return;
    }
    envVol = envAtt ? envStep : 15 - envStep;
  }

  function tick() {
    for (let c = 0; c < 3; c++) {
      let p = (reg[c * 2] | ((reg[c * 2 + 1] & 0x0F) << 8));
      if (p < 1) p = 1;
      if (--tone[c] <= 0) { tone[c] = p; out[c] ^= 1; }
    }
    let np = reg[6] & 0x1F;
    if (np < 1) np = 1;
    if (--noiseCnt <= 0) {
      noiseCnt = np;
      /* LFSR de 17 bits, realimentacion en los bits 0 y 3 */
      noiseRng ^= (((noiseRng & 1) ^ ((noiseRng >> 3) & 1)) << 17);
      noiseRng >>= 1;
      noiseOut = noiseRng & 1;
    }
    let ep = (reg[11] | (reg[12] << 8));
    if (ep < 1) ep = 1;
    envCnt += 1;
    if (envCnt >= ep * 16) { envCnt = 0; envTick(); }
  }

  function sample() {
    acc += stepsPerSample;
    while (acc >= 65536) { acc -= 65536; tick(); }
    const mix = reg[7];
    let s = 0;
    for (let c = 0; c < 3; c++) {
      const tOn = ((mix >> c) & 1) === 0;
      const nOn = ((mix >> (c + 3)) & 1) === 0;
      const lvl = (tOn ? out[c] : 1) & (nOn ? noiseOut : 1);
      if (!lvl) continue;
      const v = reg[8 + c];
      s += AY_VOL[(v & 0x10) ? envVol : (v & 0x0F)];
    }
    return s / 3;
  }

  return {
    /* el bus lo expone como par (direccion, dato) en dos posiciones */
    writeAddr(v) { latch = v & 0x0F; },
    writeData(v) {
      reg[latch] = v & 0xFF;
      if (latch === 13) envReset();
    },
    sample,
    reg
  };
}



/* lgp.js - maquina de Laser Grand Prix (Taito 1983) en JavaScript.
 * Mismo modelo que runtime/machine.c: ver docs/HARDWARE.md.
 *
 * roms: objeto con Uint8Array por nombre ("A02_01" ... "A02_41").
 */
'use strict';

function makeLGP(roms, opts) {
  opts = opts || {};
  const CYC_FRAME = Math.floor(8000000 / 60);

  /* ---- memoria ---- */
  const prog = new Uint8Array(0xA000);
  for (let i = 0; i < 4; i++) prog.set(roms['A02_0' + (i + 1)], i * 0x2000);
  prog.set(roms['A02_41'], 0x8000);          /* clave: MAME deja esto sin mapear */

  const extrom = new Uint8Array(0x20000);
  ['A02_06','A02_07','A02_08','A02_09','A02_10','A02_11','A02_12','A02_13']
    .forEach((n, i) => extrom.set(roms[n], i * 0x4000));

  const tilegfx = new Uint8Array(0x10000);
  ['A02_14','A02_15','A02_16','A02_17'].forEach((n, i) => tilegfx.set(roms[n], i * 0x4000));

  const promR = roms['A02_31'], promG = roms['A02_33'], promB = roms['A02_34'];

  /* ---- PCB de sonido: Z80 @6 MHz + 4x AY-3-8910 ---- */
  const sndRom = new Uint8Array(0x4000);
  const hasSound = !!(roms['A02_29'] && roms['A02_30']);
  if (hasSound) { sndRom.set(roms['A02_29'], 0); sndRom.set(roms['A02_30'], 0x2000); }
  const sndRam = new Uint8Array(0x400);
  const SND_CYC_FRAME = Math.floor(6000000 / 60);
  const sampleRate = opts.sampleRate || 44100;
  const ayClock = opts.ayClock || 1500000;
  const ay = [0, 1, 2, 3].map(() => makeAY(ayClock, sampleRate));
  let sndLatchIn = 0, sndNmiPending = 0, sndAck = 0;

  const ram     = new Uint8Array(0x1000);
  const tileram = new Uint8Array(0x400);
  const tilectl = new Uint8Array(0x400);

  /* ---- registros ---- */
  let hwCtrl = 0, hwVid = 0, hwAttr = 0, extAddr = 0, sndLatch = 0;
  let wheel = 0x80, accel = 0x70;
  const objreg = new Uint8Array(4);
  const M = {
    in0: 0, in1: 0,
    dswa: 0xFF, dswb: 0xFF, dswc: 0x00
  };

  /* ---- LDV-1000 (HLE) ---- */
  const ST_PARK = 0x7C, ST_PLAY = 0x64, ST_STOP = 0x65, ST_SEARCH = 0x50,
        ST_SEARCH_FIN = 0xD0, ST_READY = 0x80;
  const MD_PARK = 0, MD_PLAY = 1, MD_SEARCH = 2, MD_STOP = 3;
  let ldStatus = ST_PARK | ST_READY, ldMode = MD_PARK, ldFrame = 1;
  let ldSearchFrame = 0, ldSearchDelay = 0, ldParity = 0;
  const ldNum = [];

  const NUMS = { 0x3F:0, 0x0F:1, 0x8F:2, 0x4F:3, 0x2F:4, 0xAF:5, 0x6F:6, 0x1F:7, 0x9F:8, 0x5F:9 };

  function ldWrite(c) {
    if (c === 0xFF) { ldStatus |= ST_READY; return; }   /* NO ENTRY: solo handshake */
    if (ldStatus & ST_READY) {
      ldStatus &= ~ST_READY;
      if (c in NUMS) { if (ldNum.length < 8) ldNum.push(NUMS[c]); return; }
      switch (c) {
        case 0xFD: ldMode = MD_PLAY;   ldStatus = ST_PLAY; break;
        case 0xFB: ldMode = MD_STOP;   ldStatus = ST_STOP; break;
        case 0xF7: {
          let v = 0; for (const d of ldNum) v = v * 10 + d;
          ldSearchFrame = v || 1; ldMode = MD_SEARCH; ldStatus = ST_SEARCH; ldSearchDelay = 6;
          break;
        }
        case 0xF6: ldFrame++; ldMode = MD_STOP; ldStatus = ST_STOP; break;
        case 0xFE: if (ldFrame > 1) ldFrame--; ldMode = MD_STOP; ldStatus = ST_STOP; break;
        case 0xF9: ldMode = MD_PARK; ldStatus = ST_PARK; break;
      }
      ldNum.length = 0;
    } else {
      ldStatus &= ~ST_READY;
    }
  }

  function ldField() {
    if (ldMode === MD_SEARCH) {
      if (ldSearchDelay && --ldSearchDelay === 0) {
        ldFrame = ldSearchFrame; ldMode = MD_STOP; ldStatus = ST_SEARCH_FIN;
      }
    } else if (ldMode === MD_PLAY) {
      ldParity ^= 1;
      if (!ldParity) ldFrame++;                        /* 2 campos = 1 frame */
    }
  }

  /* ---- bus ---- */
  function rd(a) {
    a &= 0xFFFF;
    if (a < 0xA000) return prog[a];
    if (a >= 0xF000) return ram[a & 0x0FFF];
    if (a >= 0xE000 && a < 0xE400) return tileram[a & 0x3FF];
    if (a >= 0xE400 && a < 0xE800) return tilectl[a & 0x3FF];
    if ((a & 0xFF00) === 0xEF00) {
      switch (a & 0xF8) {
        case 0x00: return extrom[(((hwVid & 8) ? 0x10000 : 0) + extAddr) & 0x1FFFF];
        case 0x80: return ldStatus;
        case 0xB8: return 0xFF;
        case 0xC0: return M.dswa;
        case 0xC8: return M.dswb;
        case 0xD0: return M.dswc;
        case 0xD8: return M.in0;
        case 0xE0: return M.in1;
        case 0xE8: return wheel;
        case 0xF0: return accel;
        default:   return 0xFF;
      }
    }
    return 0xFF;
  }

  function wr(a, v) {
    a &= 0xFFFF; v &= 0xFF;
    if (a < 0xA000) return;
    if (a >= 0xF000) { ram[a & 0x0FFF] = v; return; }
    if (a >= 0xE000 && a < 0xE400) { tileram[a & 0x3FF] = v; return; }
    if (a >= 0xE400 && a < 0xE800) { tilectl[a & 0x3FF] = v; return; }
    if ((a & 0xFF00) === 0xEF00) {
      switch (a & 0xF8) {
        case 0x80: ldWrite(v); return;
        case 0x88: extAddr = (extAddr & 0x00FF) | (v << 8); return;
        case 0x90: extAddr = (extAddr & 0xFF00) | v; return;
        case 0x98: sndLatch = v; sndLatchIn = v; sndNmiPending = 1; return;
        case 0xA0: hwAttr = v; return;
        case 0xD8: hwCtrl = v; return;
        case 0xE0: hwVid = v; return;
        case 0xE8: wheel = v; return;
        case 0xF8: objreg[a & 3] = v; return;
      }
    }
  }

  const cpu = makeZ80({ rd, wr, in: () => 0xFF, out: () => {} });
  cpu.reset();

  /* bus del Z80 de sonido: 0000-3FFF ROM, 8000-83FF RAM,
   * 8400/8402/8404/8406 = (registro, dato) de cada AY,
   * 8800 = latch del EF98, 8801/8802 = ack de IRQ/NMI, 8803 = configuracion */
  function srd(a) {
    a &= 0xFFFF;
    if (a < 0x4000) return sndRom[a];
    if (a >= 0x8000 && a < 0x8400) return sndRam[a & 0x3FF];
    if (a >= 0x8800 && a < 0x8804) {
      if (a === 0x8800) return sndLatchIn;
      return 0x00;
    }
    return 0xFF;
  }
  function swr(a, v) {
    a &= 0xFFFF; v &= 0xFF;
    if (a >= 0x8000 && a < 0x8400) { sndRam[a & 0x3FF] = v; return; }
    if (a >= 0x8400 && a < 0x8408) {
      const chip = ay[(a >> 1) & 3];
      if (a & 1) chip.writeData(v); else chip.writeAddr(v);
      return;
    }
    if (a === 0x8800) { sndLatchIn = v; return; }
  }
  const scpu = makeZ80({ rd: srd, wr: swr, in: () => 0xFF, out: () => {} });
  scpu.reset();

  /* ---- video ---- */
  const overlay = new Uint8Array(256 * 256);
  const rgba = new Uint8ClampedArray(256 * 256 * 4);

  function render() {
    overlay.fill(0xFF);
    const page = (hwVid & 7) * 256;
    const cc = (hwAttr & 0x0F) << 4;
    for (let ty = 0; ty < 32; ty++) {
      for (let tx = 0; tx < 32; tx++) {
        const code = page + tileram[ty * 32 + tx];
        const o = code * 8;
        for (let y = 0; y < 8; y++) {
          const b0 = tilegfx[o + y], b1 = tilegfx[0x4000 + o + y],
                b2 = tilegfx[0x8000 + o + y], b3 = tilegfx[0xC000 + o + y];
          if (!(b0 | b1 | b2 | b3)) continue;
          const row = (ty * 8 + y) * 256 + tx * 8;
          for (let x = 0; x < 8; x++) {
            const sh = 7 - x;
            const pix = ((b0 >> sh) & 1) | (((b1 >> sh) & 1) << 1)
                      | (((b2 >> sh) & 1) << 2) | (((b3 >> sh) & 1) << 3);
            if (pix) overlay[row + x] = cc | pix;
          }
        }
      }
    }
  }

  function toRGBA() {
    for (let i = 0, j = 0; i < overlay.length; i++, j += 4) {
      const v = overlay[i];
      if (v === 0xFF) { rgba[j + 3] = 0; continue; }
      rgba[j]     = promR[v] * 17;
      rgba[j + 1] = promG[v] * 17;
      rgba[j + 2] = promB[v] * 17;
      rgba[j + 3] = 255;
    }
    return rgba;
  }

  /* ---- audio ---- */
  const spf = Math.round(sampleRate / 60);
  const abuf = new Float32Array(spf);
  function mixAudio() {
    for (let i = 0; i < spf; i++) {
      abuf[i] = (ay[0].sample() + ay[1].sample() + ay[2].sample() + ay[3].sample()) * 0.25;
    }
    return abuf;
  }

  function runSound() {
    if (!hasSound) return;
    /* la NMI del Z80 de sonido es el strobe de comando desde EF98,
     * la IRQ es el tick periodico de 60 Hz */
    if (sndNmiPending) { sndNmiPending = 0; scpu.nmi(); }
    scpu.cyc = Math.floor(SND_CYC_FRAME / 2);
    while (scpu.cyc > 0) scpu.step();
    scpu.irq();
    scpu.cyc = SND_CYC_FRAME - Math.floor(SND_CYC_FRAME / 2);
    while (scpu.cyc > 0) scpu.step();
  }

  /* ---- un campo de video ---- */
  function runFrame() {
    ldField();
    cpu.nmi();
    cpu.cyc = Math.floor(CYC_FRAME / 4);
    while (cpu.cyc > 0) cpu.step();
    cpu.irq();
    cpu.cyc = CYC_FRAME - Math.floor(CYC_FRAME / 4);
    while (cpu.cyc > 0) cpu.step();
    runSound();
  }

  return {
    cpu, scpu, ay, runFrame, render, toRGBA, overlay, tileram, tilectl,
    mixAudio, sampleRate, samplesPerFrame: spf, hasSound,
    setInputs(i0, i1) { M.in0 = i0 & 0xFF; M.in1 = i1 & 0xFF; },
    setAnalog(w, a) { wheel = w & 0xFF; accel = a & 0xFF; },
    setDip(a, b, c) { M.dswa = a; M.dswb = b; M.dswc = c; },
    get ldFrame() { return ldFrame; },
    get ldMode()  { return ldMode; },
    get hwVid()   { return hwVid; },
    get hwAttr()  { return hwAttr; },
    get hwCtrl()  { return hwCtrl; }
  };
}




return { makeLGP };
})();

/* ==========================================================================
 *  Laser Grand Prix (Taito 1983) — nativo. Núcleo de Luis (versión JS de su
 *  recompilador estático): Z80 principal a 8 MHz, ROM de expansión, tiles con
 *  PROM de color, y la placa de sonido (Z80 + 4× AY-3-8910). El disco va
 *  detrás de los tiles transparentes.
 * ========================================================================== */
async function drvLGP(lib, set, env) {
  const res = { missing: [], loaded: [] }, roms = {};
  const map = { A02_01: 'a02_01.63', A02_02: 'a02_02.62', A02_03: 'a02_03.61', A02_04: 'a02_04.60', A02_06: 'a02_06.53', A02_07: 'a02_07.52', A02_08: 'a02_08.51',
    A02_09: 'a02_09.50', A02_10: 'a02_10.49', A02_11: 'a02_11.48', A02_12: 'a02_12.47', A02_13: 'a02_13.46', A02_14: 'a02_14.13', A02_15: 'a02_15.12', A02_16: 'a02_16.11',
    A02_17: 'a02_17.10', A02_29: 'a02_29.ic11', A02_30: 'a02_30.ic17', A02_31: 'a02_31.106', A02_33: 'a02_33.116', A02_34: 'a02_34.122', A02_41: 'a02_41.59' };
  for (const k in map) {
    let r = (lib.sets.lgp || []).find(x => x.name === map[k]);
    if (!r) for (const s in lib.sets) { r = lib.sets[s].find(x => x.name === map[k]); if (r) break; }
    if (!r) { res.missing.push(map[k]); roms[k] = new Uint8Array(k >= 'A02_31' && k <= 'A02_34' ? 256 : 0x4000); continue; }
    roms[k] = await lib.get(r); res.loaded.push(map[k]);
  }
  const sr = env.sampleRate || 44100;
  const m = LGPCORE.makeLGP(roms, { sampleRate: sr, ayClock: 1500000 });
  const ldp = {
    get frame() { return Math.max(1, m.ldFrame); }, frac: 0,
    get status() { return m.ldMode === 1 ? LDP_PLAYING : m.ldMode === 2 ? LDP_SEARCHING : LDP_PAUSED; },
    get target() { return m.ldFrame; }, fps: 29.97, speedNum: 1, speedDen: 1, audio1: true, audio2: true, squelchSearch: true, log: []
  };
  const keys = {}; let coinLatch = 0, wheel = 0x80, ana = null; const aq = [];
  const G = {
    name: set, fps: 29.97, ldp, res, ow: 256, oh: 256, players: 1,
    get videoBlank() { return false; },
    runField() {
      let in0 = 0, in1 = 0;
      if (keys.B1) in0 |= 0x10; if (keys.D || keys.B2) in0 |= 0x20; if (keys.SV) in0 |= 0x01;
      if (keys.C && !coinLatch) { coinLatch = 12; keys.C = 0; } if (coinLatch > 0) { in1 |= 0x01; coinLatch--; }
      m.setInputs(in0, in1);
      const target = ana != null ? ana : keys.L ? 0x58 : keys.R ? 0xA8 : 0x80;
      wheel += Math.sign(target - wheel) * Math.min(6, Math.abs(target - wheel));
      m.setAnalog(wheel & 0xFF, keys.U ? 0x70 : 0x10);
      m.runFrame();
      const a = m.mixAudio(); if (aq.length < sr) for (let i = 0; i < a.length; i++) aq.push(a[i]);
    },
    analog(x) { ana = Math.max(0x40, Math.min(0xC0, Math.round(0x40 + x / 256 * 0x80))); },
    input(sw, d) {
      const k = { [SW.LEFT]: 'L', [SW.RIGHT]: 'R', [SW.UP]: 'U', [SW.DOWN]: 'D', [SW.BUTTON1]: 'B1', [SW.BUTTON2]: 'B2', [SW.SERVICE]: 'SV' }[sw];
      if (k) { keys[k] = d; if (k === 'L' || k === 'R') ana = null; }
      if ((sw === SW.COIN1 || sw === SW.COIN2) && d) keys.C = 1;
    },
    draw(buf) { m.render(); buf.set(new Uint32Array(m.toRGBA().buffer.slice(0))); },
    sample() { return aq.length ? aq.shift() : 0; },
    status() { return 'Z80 · disco ' + m.ldFrame + ' ' + ['park', 'play', 'busca', 'stop'][m.ldMode]; }
  };
  return G;
}
DRIVERS.lgp = drvLGP;
