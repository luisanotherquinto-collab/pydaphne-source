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
  z.irq = function (vec) {
    if (!z.iff1) return false;
    if (vec === undefined) vec = 0xFF;
    z.halted = 0; z.iff1 = z.iff2 = 0;
    push(z.pc);
    z.pc = z.im === 2 ? rd16((z.i << 8) | (vec & 0xFE)) : (z.im === 0 ? (vec & 0x38) : 0x0038);
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
