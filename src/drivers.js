/* ==========================================================================
 *  DAPHNE·JS drivers — portados de hypseus-singe/src/game/*.cpp
 *  Interfaz común de un juego:
 *    runField()            avanza 1/59.94 s de máquina
 *    input(sw, down)       SW.* abajo
 *    draw(u32)             pinta el overlay (ABGR) en un buffer ow*oh
 *    sample()              una muestra de audio mono (-1..1)
 *    ldp                   estado del reproductor (frame, status, audio1/2)
 * ========================================================================== */
'use strict';

const SW = { UP: 0, LEFT: 1, DOWN: 2, RIGHT: 3, START1: 4, START2: 5, BUTTON1: 6, BUTTON2: 7, BUTTON3: 8,
  COIN1: 9, COIN2: 10, SKILL1: 11, SKILL2: 12, SKILL3: 13, SERVICE: 14, TEST: 15, TILT: 21,
  DISCARD1: 30, DISCARD2: 31, DISCARD3: 32, DISCARD4: 33, DISCARD5: 34 };

const rgba = (r, g, b, a) => ((a === undefined ? 255 : a) << 24 | b << 16 | g << 8 | r) >>> 0;
const bitrev8 = v => ((v & 1) << 7) | ((v & 2) << 5) | ((v & 4) << 3) | ((v & 8) << 1) | ((v & 0x10) >> 1) | ((v & 0x20) >> 3) | ((v & 0x40) >> 5) | ((v & 0x80) >> 7);

/* strobes del LD-V1000 tras cada vsync (ldv1000.cpp: event_callback) */
function ldvStrobes(m, cb) {
  m.after(27.1 + 500, () => { cb(true, true);
    m.after(26, () => { cb(true, false);
      m.after(54, () => { cb(false, true);
        m.after(25, () => cb(false, false)); }); }); });
}

/* dígitos de 7 segmentos para el marcador de Dragon's Lair / Space Ace */
const SEG7 = [0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F, 0x77, 0x7C, 0x39, 0x5E, 0x79, 0x00];
function drawSeg(buf, W, x, y, d, on, off) {
  const s = SEG7[d & 15];
  const seg = (b, x0, y0, w, h) => { const c = (s & b) ? on : off; for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) buf[(y + y0 + yy) * W + x + x0 + xx] = c; };
  seg(1, 1, 0, 5, 1); seg(2, 6, 1, 1, 5); seg(4, 6, 7, 1, 5); seg(8, 1, 12, 5, 1); seg(16, 0, 7, 1, 5); seg(32, 0, 1, 1, 5); seg(64, 1, 6, 5, 1);
}

/* ======================================================= DRAGON'S LAIR */
const LAIR_SETS = {
  lair: {}, lair_f: {}, lair_e: {}, lair_d: { swA: 0x00, swB: 0x08 },
  lair_a: { pr: 1, swA: 0x00, swB: 0x08 }, lair_b: { pr: 1, swA: 0x00, swB: 0x08 }, lair_c: { pr: 1, swA: 0x00, swB: 0x08 },
  lair_n1: { pr: 1, swA: 0x00, swB: 0x08 }, lair_x: { pr: 1, swA: 0x00, swB: 0x08 },
  dle11: {}, dle20: {}, dle21: {},
  ace: { ace: 1, swA: 0x3D, swB: 0xFE }, ace_a: { ace: 1, swA: 0x3D, swB: 0xFE }, ace_a2: { ace: 1, swA: 0x3D, swB: 0xFE },
  sae: { ace: 1, swA: 0x66, swB: 0x98 }
};
async function drvLair(lib, set, env) {
  const v = LAIR_SETS[set] || {};
  const mem = new Uint8Array(0x10000);
  const res = await lib.loadSet(set, ROMDEFS[set], { m_cpumem: mem });
  const m = new Machine(), ldp = new LDP(23.976);
  const ldv = new LDV1000(ldp, {}), pr = new PR7820(ldp);
  let swA = v.swA !== undefined ? v.swA : 0x22, swB = v.swB !== undefined ? v.swB : 0xD8;
  let joy = 0xFF, misc = 0x7F, ayLatch = 0;
  const ay = makeAY(2000000, env.sampleRate);
  const sb = new Uint8Array(16).fill(0x0F);
  const rd = a => {
    a &= 0xFFFF;
    if (a < 0xC000) return mem[a];
    if (a === 0xC008) return joy;
    if (a === 0xC010) { if (v.pr) { if (pr.readReady()) misc |= 0x80; else misc &= ~0x80; } return misc; }
    if (a === 0xC020) return ldv.read();
    return mem[a];
  };
  const wr = (a, val) => {
    a &= 0xFFFF;
    if (a < 0xA000) return;
    if (a < 0xB000) { mem[a] = val; return; }
    if (a < 0xE000) { mem[a] = val; return; }
    switch (a) {
      case 0xE000: ay.writeData(val); return;
      case 0xE010: ayLatch = val; ay.writeAddr(val);
        if (val === 0x0E) mem[0xC000] = swA; else if (val === 0x0F) mem[0xC000] = swB; return;
      case 0xE020: if (v.pr) pr.write(val); else ldv.write(val); return;
    }
    if (a >= 0xE030 && a <= 0xE03F) sb[a & 15] = val;
  };
  const cpu = m.addCPU(Z80CPU({ rd, wr, in: () => 0xFF, out: () => {} }), 4000000);
  cpu.reset();
  m.every(32768, () => cpu.irq());
  m.every(FIELD_US, () => {
    ldp.field();
    if (!v.pr) ldvStrobes(m, (st, on) => { misc &= 0x3F; if (on) misc |= st ? 0x40 : 0x80; });
  });
  const G = {
    name: set, fps: 23.976, ldp, m, res, ow: 320, oh: 240, showScore: true, sb, mem,
    runField() { m.runUs(FIELD_US); },
    input(sw, d) {
      const bit = (reg, b) => { if (reg === 'j') joy = d ? joy & ~b : joy | b; else misc = d ? misc & ~b : misc | b; };
      switch (sw) {
        case SW.UP: bit('j', 1); break; case SW.DOWN: bit('j', 2); break; case SW.LEFT: bit('j', 4); break; case SW.RIGHT: bit('j', 8); break;
        case SW.BUTTON1: bit('j', 0x10); break; case SW.SKILL1: bit('j', 0x20); break; case SW.SKILL2: bit('j', 0x40); break; case SW.SKILL3: bit('j', 0x80); break;
        case SW.START1: bit('m', 1); break; case SW.START2: bit('m', 2); break; case SW.COIN1: bit('m', 4); break; case SW.COIN2: bit('m', 8); break;
        case SW.SERVICE: if (d) { if (v.ace) swB ^= 0x80; else swA ^= 0x80; } break;
        case SW.BUTTON3: if (d) G.showScore = !G.showScore; break;
      }
    },
    get score() { let s = 0, any = false; for (let i = 8; i < 14; i++) { const v = sb[i]; if (v <= 9) { s = s * 10 + v; any = true; } else s = s * 10; } return any ? s : 0; },
    draw(buf) {
      buf.fill(0);
      if (!G.showScore) return;
      const W = 320, on = rgba(255, 60, 40), off = rgba(60, 10, 8, 200), bg = rgba(0, 0, 0, 170), lab = rgba(255, 200, 80);
      for (let y = 222; y < 240; y++) for (let x = 0; x < W; x++) buf[y * W + x] = bg;
      /* P1: E038-E03D, vidas E03E ; P2: E030-E035, vidas E03F ; créditos E036/E037 */
      for (let i = 0; i < 6; i++) drawSeg(buf, W, 6 + i * 9, 225, sb[8 + i], on, off);
      drawSeg(buf, W, 64, 225, sb[14], lab, off);
      drawSeg(buf, W, 150, 225, sb[6], on, off); drawSeg(buf, W, 159, 225, sb[7], on, off);
      for (let i = 0; i < 6; i++) drawSeg(buf, W, 250 + i * 9, 225, sb[i], on, off);
      drawSeg(buf, W, 238, 225, sb[15], lab, off);
    },
    sample() { return ay.sample(); },
    status() { return 'PC ' + cpu.pc.toString(16).padStart(4, '0') + (v.pr ? ' · PR-7820' : ' · LD-V1000'); }
  };
  return G;
}

/* ======================================================== CLIFF HANGER */
async function drvCliff(lib, set, env) {
  const mem = new Uint8Array(0x10000);
  const res = await lib.loadSet(set, ROMDEFS[set], { m_cpumem: mem });
  const m = new Machine(), ldp = new LDP(29.97), pr = new PR8210(ldp), vdp = makeTMS9918();
  const banks = new Uint8Array(10).fill(0xFF);
  const gtg = set === 'gtg';
  if (set === 'cliff') { banks[1] = 0; banks[2] = 0xF3; banks[3] = 0x3F; banks[4] = 0xFD; }
  else if (gtg) { banks[1] = 0x01; banks[2] = 0xF3; banks[3] = 0x1F; banks[4] = 0xFD; }
  else { banks[1] = 0x4F; banks[2] = 0xF3; }
  let bankIdx = 0, frameStr = '00000', frameVal = 0, lastL = 0, blips = 0, blipCount = 0, lastBlip = 0, lastSnd = 0;
  const beeps = [];
  const rd = a => { a &= 0xFFFF; if (gtg && a === 0xE1BA && ldp.status === LDP_PLAYING) return 0x01; return mem[a]; };
  const wr = (a, v) => { a &= 0xFFFF; if (a >= 0xA000) mem[a] = v; };
  let cpu;
  const pin = p => {
    switch (p & 0xFF) {
      case 0x45: return vdp.readData();
      case 0x52: return ((frameStr.charCodeAt(0) & 0x0F) | (frameVal ? 0xF8 : 0)) & 0xFF;
      case 0x51: return (((frameStr.charCodeAt(1) & 0xF) << 4) | (frameStr.charCodeAt(2) & 0xF)) & 0xFF;
      case 0x50: return (((frameStr.charCodeAt(3) & 0xF) << 4) | (frameStr.charCodeAt(4) & 0xF)) & 0xFF;
      case 0x62: return banks[bankIdx];
    }
    return 0;
  };
  const pout = (p, v) => {
    switch (p & 0xFF) {
      case 0x44: if (lastL === 0x10 && v === 0x5E) { lastL = 0; break; } vdp.writeData(v); lastL = v; break;
      case 0x54: vdp.writeCtrl(v); break;
      case 0x46: if ((v & 0xF) !== lastSnd) { lastSnd = v & 0xF; if (lastSnd >= 1 && lastSnd <= 3) beeps.push({ f: [0, 880, 220, 660][lastSnd], n: 6000 }); } break;
      case 0x57: frameVal = pr.currentFrame(); frameStr = String(frameVal).padStart(5, '0'); break;
      case 0x60: if (v < 10) bankIdx = v; break;
      case 0x66: if (v === 1) {
        const now = cpu.cycles(), ec = now - lastBlip; lastBlip = now;
        if (ec < 12000) { blips = ((blips << 1) | (ec > 5500 ? 1 : 0)) & 0xFFFF; if (++blipCount > 9) { pr.command(blips); blipCount = 0; } }
        else blipCount = 0;
      } break;
    }
  };
  cpu = m.addCPU(Z80CPU({ rd, wr, in: pin, out: pout }), 4000000);
  cpu.reset();
  m.every(1e6 / 29.97, () => cpu.irq());
  m.every(FIELD_US, () => { ldp.field(); if (vdp.vblank()) cpu.nmi(); });
  let bph = 0;
  const G = {
    name: set, fps: 29.97, ldp, m, res, ow: 256, oh: 192,
    runField() { m.runUs(FIELD_US); },
    input(sw, d) {
      const b = (i, bit) => { banks[i] = d ? banks[i] & ~bit : banks[i] | bit; };
      switch (sw) {
        case SW.UP: b(6, 1); break; case SW.LEFT: b(6, 8); break; case SW.RIGHT: b(6, 2); break; case SW.DOWN: b(6, 4); break;
        case SW.START1: case SW.BUTTON2: b(5, 4); break; case SW.START2: b(5, 8); break; case SW.BUTTON1: b(5, 16); break;
        case SW.COIN1: b(5, 1); break; case SW.COIN2: b(5, 2); break; case SW.TILT: b(5, 128); break;
        case SW.SERVICE: if (d) banks[3] ^= 1; break; case SW.TEST: if (d) banks[3] ^= 2; break;
      }
    },
    draw(buf) {
      const p = vdp.render();
      for (let i = 0; i < p.length; i++) { const c = TMS_PAL[p[i]]; buf[i] = c[3] ? rgba(c[0], c[1], c[2]) : 0; }
    },
    sample() {
      if (!beeps.length) return 0;
      const b = beeps[0]; bph += b.f / env.sampleRate; if (--b.n <= 0) beeps.shift();
      return (bph % 1 < 0.5 ? 0.25 : -0.25);
    },
    status() { return 'PC ' + cpu.pc.toString(16).padStart(4, '0') + ' · PR-8210 · VDP modo ' + ((vdp.reg[1] & 0x10) ? 'texto' : (vdp.reg[0] & 2) ? 'G-II' : 'G-I'); }
  };
  return G;
}

/* ================================================= SUPER DON QUIX-OTE */
async function drvSuperd(lib, set, env) {
  const mem = new Uint8Array(0x10000), chr = new Uint8Array(0x2000), prom = new Uint8Array(32);
  const res = await lib.loadSet(set, ROMDEFS[set], { m_cpumem: mem, character: chr, color_prom: prom });
  const m = new Machine(), ldp = new LDP(29.97), ldv = new LDV1000(ldp, {});
  const banks = new Uint8Array(4).fill(0xFF);
  let outLatch = 0xFF, inLatch = 0xFF;
  const sn = makeSN76496(2500000, env.sampleRate);
  const pal = new Uint32Array(32);
  const w3 = [0x24, 0x4a, 0x91];
  for (let i = 0; i < 32; i++) {
    const c = prom[i], bit = n => (c >> n) & 1;
    pal[i] = rgba(w3[0] * bit(5) + w3[1] * bit(6) + w3[2] * bit(7), w3[0] * bit(2) + w3[1] * bit(3) + w3[2] * bit(4), w3[1] * bit(0) + w3[2] * bit(1));
  }
  pal[15] = 0;
  let cpu;
  const rd = a => mem[a & 0xFFFF];
  const wr = (a, v) => { a &= 0xFFFF; if (a >= 0x4000) mem[a] = v; };
  const pin = p => { p &= 0xFF; if (p < 4) return banks[p]; if (p === 4) return inLatch; return 0; };
  const pout = (p, v) => {
    switch (p & 0xFF) {
      case 0x00: outLatch = v; break;
      case 0x04: sn.write(v); break;
      case 0x08: if (v & 0x40) cpu.irq(false); break;
    }
  };
  cpu = m.addCPU(Z80CPU({ rd, wr, in: pin, out: pout }), 5000000);
  cpu.irqHold = false; cpu.reset();
  m.every(FIELD_US, () => {
    ldp.field();
    ldvStrobes(m, (st, on) => { if (!on) return; if (st) inLatch = ldv.read(); else { ldv.write(outLatch); cpu.irq(true); } });
  });
  return {
    name: set, fps: 29.97, ldp, m, res, ow: 256, oh: 256,
    runField() { m.runUs(FIELD_US); },
    input(sw, d) {
      const b = (i, bit) => { banks[i] = d ? banks[i] & ~bit : banks[i] | bit; };
      switch (sw) {
        case SW.UP: b(0, 0x80); break; case SW.LEFT: b(0, 0x02); break; case SW.RIGHT: b(0, 0x20); break; case SW.DOWN: b(0, 0x08); break;
        case SW.START1: b(1, 0x80); break; case SW.START2: b(1, 0x40); break; case SW.BUTTON1: b(1, 0x20); break;
        case SW.COIN1: b(1, 0x08); break; case SW.COIN2: b(1, 0x04); break; case SW.SERVICE: b(1, 0x01); break; case SW.TEST: b(1, 0x02); break;
      }
    },
    draw(buf) {
      for (let cy = 0; cy < 32; cy++) for (let cx = 0; cx < 32; cx++) {
        const ch = mem[0x5C00 + cy * 32 + cx];
        for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
          const b = chr[(ch * 32 + x + 4 * y) & 0x1FFF], o = (cy * 8 + y) * 256 + cx * 8 + x * 2;
          buf[o] = pal[b >> 4]; buf[o + 1] = pal[b & 15];
        }
      }
    },
    sample() { return sn.sample(); },
    status() { return 'PC ' + cpu.pc.toString(16).padStart(4, '0') + ' · LD-V1000'; }
  };
}

/* ================================================== ESH'S AURUNMILLA */
async function drvEsh(lib, set, env) {
  const mem = new Uint8Array(0x10000), chr = new Uint8Array(0x3000), prom = new Uint8Array(512), misc = new Uint8Array(512);
  const res = await lib.loadSet(set, ROMDEFS[set], { m_cpumem: mem, character: chr, color_prom: prom, miscprom: misc });
  mem[0xE463] = 5; mem[0xE465] = 1;
  const m = new Machine(), ldp = new LDP(29.97), ldv = new LDV1000(ldp, (typeof window !== 'undefined' && window.ESH_LDOPT) || {});
  const banks = new Uint8Array(4).fill(0xFF);
  let hi = 0, blank = 0, beep = 0, bph = 0;
  const pal = new Uint32Array(256), G4 = 1 / 4.0;
  for (let i = 0; i < 256; i++) {
    const c = prom[i + 256], bit = n => (c >> n) & 1;
    let r = 0x21 * bit(0) + 0x47 * bit(1) + 0x97 * bit(2), g = 0x47 * bit(3) + 0x97 * bit(4), b = 0x47 * bit(5) + 0x97 * bit(6);
    r = 255 * Math.pow(r / 255, G4) | 0; g = 255 * Math.pow(g / 255, G4) | 0; b = 255 * Math.pow(b / 255, G4) | 0;
    pal[i] = (r | g | b) ? rgba(r, g, b) : 0;
  }
  const rd = a => mem[a & 0xFFFF];
  const wr = (a, v) => { a &= 0xFFFF; if (a >= 0x4000) mem[a] = v; };
  const pin = p => { switch (p & 0xFF) { case 0xF0: return banks[0]; case 0xF1: return banks[1]; case 0xF2: case 0xF3: return 0xFF; case 0xF4: return ldv.read(); } return 0; };
  const pout = (p, v) => {
    switch (p & 0xFF) {
      case 0xF4: ldv.write(v); break;
      case 0xF5: if (v & 2) beep = 2200; hi = (v & 8) ? 1 : 0; break;
    }
  };
  const cpu = m.addCPU(Z80CPU({ rd, wr, in: pin, out: pout }), 3072000);
  cpu.reset();
  m.every(FIELD_US, () => { ldp.field(); blank = (blank + 1) % 10; cpu.irq(); });
  m.every(FIELD_US, () => cpu.nmi(), FIELD_US / 2);
  return {
    name: set, fps: 29.97, ldp, m, res, ow: 256, oh: 256,
    runField() { m.runUs(FIELD_US); },
    input(sw, d) {
      const b = (i, bit) => { banks[i] = d ? banks[i] & ~bit : banks[i] | bit; };
      switch (sw) {
        case SW.UP: b(1, 1); break; case SW.LEFT: b(1, 4); break; case SW.RIGHT: b(1, 8); break; case SW.DOWN: b(1, 2); break;
        case SW.START1: b(0, 4); break; case SW.BUTTON1: b(1, 0x10); break; case SW.COIN1: b(0, 1); break; case SW.COIN2: b(0, 2); break; case SW.TEST: b(0, 0x10); break;
      }
    },
    draw(buf) {
      for (let cx = 0; cx < 32; cx++) for (let cy = 0; cy < 32; cy++) {
        const at = mem[0xF400 + (cy << 5) + cx], palN = at & 15, ts = (at >> 4) & 1, bl = (at >> 6) & 1, bc = (at >> 7) & 1;
        const ch = mem[0xF000 + (cy << 5) + cx] | (ts << 8);
        for (let y = 0; y < 8; y++) {
          const vis = (!bc || blank < 7) && (!(bl && y % 2 === 0) || blank < 3) && palN;
          const b0 = chr[ch * 8 + y], b1 = chr[ch * 8 + y + 0x1000], b2 = chr[ch * 8 + y + 0x2000];
          const o = ((cy << 3) + y) * 256 + (cx << 3);
          for (let x = 0; x < 8; x++) {
            const s = 7 - x, px = vis ? (((b0 >> s) & 1) | (((b1 >> s) & 1) << 1) | (((b2 >> s) & 1) << 2)) : 0;
            buf[o + x] = pal[px | (palN << 3) | (hi << 7)];
          }
        }
      }
    },
    sample() { if (beep <= 0) return 0; beep--; bph += 1000 / env.sampleRate; return bph % 1 < 0.5 ? 0.2 : -0.2; },
    status() { return 'PC ' + cpu.pc.toString(16).padStart(4, '0') + ' · LD-V1000'; }
  };
}

/* ======================================================== INTERSTELLAR */
async function drvInterstellar(lib, set, env) {
  const m0 = new Uint8Array(0x10000), m1 = new Uint8Array(0x10000), m2 = new Uint8Array(0x10000);
  const chr = new Uint8Array(0x6000), prom = new Uint8Array(0x300);
  const res = await lib.loadSet(set, ROMDEFS[set], { m_cpumem: m0, m_cpumem2: m1, m_cpumem3: m2, character: chr, color_prom: prom });
  const m = new Machine(), ldp = new LDP(29.97), ldv = new LDV1000(ldp, {});
  const banks = new Uint8Array([0x00, 0x00, 0x30]);
  let soundLatch = 0, latch1 = 0, latch2 = 0, nmi0 = false, nmi1 = false, nmi2 = false, bgTransparent = true;
  const sn1 = makeSN76496(3072000, env.sampleRate), sn2 = makeSN76496(3072000, env.sampleRate);
  const pal = new Uint32Array(256);
  const w4 = [0x8f, 0x43, 0x1f, 0x0e];
  const comp = v => w4[0] * ((v >> 3) & 1) + w4[1] * ((v >> 2) & 1) + w4[2] * ((v >> 1) & 1) + w4[3] * (v & 1);
  for (let i = 0; i < 256; i++) pal[i] = rgba(comp(prom[i]), comp(prom[i + 0x100]), comp(prom[i + 0x200]));
  let bg = rgba(0, 0, 0);
  let c0, c1, c2;
  c0 = m.addCPU(Z80CPU({
    rd: a => m0[a & 0xFFFF], wr: (a, v) => { a &= 0xFFFF; if (a >= 0xA000) m0[a] = v; },
    in: p => { switch (p & 0xFF) { case 0: return banks[0]; case 2: return banks[1]; case 3: return banks[2]; case 5: return latch1; } return 0; },
    out: (p, v) => {
      switch (p & 0xFF) {
        case 0: soundLatch = v; if (nmi1) { c1.nmi(); nmi1 = false; } break;
        case 3: nmi0 = true; break;
        case 4: { const b = n => (v >> n) & 1; bg = rgba(0x21 * b(0) + 0x47 * b(1) + 0x97 * b(2), 0x21 * b(3) + 0x47 * b(4) + 0x97 * b(5), 0x47 * b(6) + 0x97 * b(7)); break; }
        case 5: latch2 = v; if (nmi2) { c2.nmi(); nmi2 = false; } break;
      }
    }
  }), 3072000);
  c1 = m.addCPU(Z80CPU({
    rd: a => m1[a & 0xFFFF], wr: (a, v) => { a &= 0xFFFF; if (a >= 0x2000) m1[a] = v; },
    in: p => { switch (p & 0xFF) { case 0: return soundLatch; case 1: nmi1 = true; return 0; } return 0; },
    out: (p, v) => { switch (p & 0xFF) { case 1: sn1.write(bitrev8(v)); break; case 2: sn2.write(bitrev8(v)); break; } }
  }), 3072000);
  c2 = m.addCPU(Z80CPU({
    rd: a => m2[a & 0xFFFF], wr: (a, v) => { a &= 0xFFFF; if (a >= 0x1800) m2[a] = v; },
    in: p => { switch (p & 0xFF) { case 0: return ldv.read(); case 1: return latch2; case 2: nmi2 = true; return 0; } return 0; },
    out: (p, v) => { switch (p & 0xFF) { case 0: ldv.write(v); break; case 1: latch1 = v; break; case 3: bgTransparent = !v; break; } }
  }), 3072000);
  for (const c of [c0, c1, c2]) c.reset();
  m.sliceUs = 100;
  m.every(1e6 / 59.94, () => { ldp.field(); c0.irq(); c2.irq(); });
  const ov = new Uint8Array(256 * 256);
  const d8 = (n, x0, y0, xf, yf, palN) => {
    for (let y = 0; y < 8; y++) {
      const b3 = chr[(n * 8 + y) % 0x2000], b2 = chr[(n * 8 + y) % 0x2000 + 0x2000], b1 = chr[(n * 8 + y) % 0x2000 + 0x4000];
      const yy = y0 + (yf ? 7 - y : y); if (yy < 0 || yy >= 256) continue;
      for (let x = 0; x < 8; x++) {
        const s = 7 - x, p = (((b1 >> s) & 1) << 2) | (((b2 >> s) & 1) << 1) | ((b3 >> s) & 1);
        const xx = x0 + (xf ? 7 - x : x);
        if (p && xx >= 0 && xx < 256) ov[yy * 256 + xx] = p | (palN << 3);
      }
    }
  };
  return {
    name: set, fps: 29.97, ldp, m, res, ow: 256, oh: 240,
    runField() { m.runUs(FIELD_US); },
    input(sw, d) {
      const hi = (i, bit) => { banks[i] = d ? banks[i] | bit : banks[i] & ~bit; };
      switch (sw) {
        case SW.RIGHT: hi(0, 1); break; case SW.LEFT: hi(0, 2); break; case SW.UP: hi(0, 4); break; case SW.DOWN: hi(0, 8); break;
        case SW.BUTTON1: hi(0, 0x10); break; case SW.BUTTON2: hi(0, 0x20); break;
        case SW.START1: hi(2, 0x80); break; case SW.START2: hi(2, 0x40); break; case SW.TEST: hi(2, 0x08); break;
        case SW.COIN1: case SW.COIN2: {
          const bit = sw === SW.COIN1 ? 0x20 : 0x10;
          if (d) { banks[2] &= ~bit; if (nmi0) { c0.nmi(); nmi0 = false; } } else banks[2] |= bit; break;
        }
      }
    },
    draw(buf) {
      ov.fill(0);
      for (let s = 0x200 - 4; s >= 0; s -= 4) {
        const sd = 0xB000 + s;
        if (m0[sd + 1] !== 0xFF && m0[sd + 3] !== 0xFF && ((~m0[sd]) & 0xFF) !== 0xFF) {
          const n = m0[sd + 1], x = m0[sd + 3], y = 240 - m0[sd], xf = m0[sd + 2] & 0x40, yf = m0[sd + 2] & 0x80, p = m0[sd + 2] & 15;
          d8(n * 4, x + (xf ? 8 : 0), y + (yf ? 8 : 0), xf, yf, p); d8(n * 4 + 1, x + (xf ? 0 : 8), y + (yf ? 8 : 0), xf, yf, p);
          d8(n * 4 + 2, x + (xf ? 8 : 0), y + (yf ? 0 : 8), xf, yf, p); d8(n * 4 + 3, x + (xf ? 0 : 8), y + (yf ? 0 : 8), xf, yf, p);
        }
      }
      for (let cx = 0; cx < 32; cx++) for (let cy = 0; cy < 32; cy++) d8(m0[0xA800 + (cy << 5) + cx], cx * 8, cy * 8, 0, 0, m0[0xAC00 + (cy << 5) + cx] & 15);
      for (let y = 0; y < 240; y++) for (let x = 0; x < 256; x++) {
        const p = ov[(y + 16) * 256 + x];
        buf[y * 256 + x] = p ? pal[p] : (bgTransparent ? 0 : bg);
      }
    },
    sample() { return (sn1.sample() + sn2.sample()) * 0.5; },
    status() { return 'PC ' + [c0, c1, c2].map(c => c.pc.toString(16).padStart(4, '0')).join('/') + ' · LD-V1000'; }
  };
}

/* ============================================================= BADLANDS */
async function drvBadlands(lib, set, env) {
  const mem = new Uint8Array(0x10000), chr = new Uint8Array(0x2000), prom = new Uint8Array(32);
  const res = await lib.loadSet(set, ROMDEFS[set], { m_cpumem: mem, character: chr, color_prom: prom });
  const proto = set === 'badlandp';
  const m = new Machine(), ldp = new LDP(29.97), ldv = new LDV1000(ldp, { badlands: true });
  const banks = new Uint8Array([0xFF, proto ? 0xDF : 0xFF, proto ? 0xFF : 0x7D]);
  let irqOn = proto, firqOn = proto, nmiOn = proto, videoBlank = false, shootLed = false;
  const charBase = proto ? 0x2000 : 0x4000, cxo = proto ? 12 : 6, cyo = proto ? 1 : 2;
  const sn = makeSN76496(14318180 / 8, env.sampleRate);
  const pal = new Uint32Array(16);
  for (let i = 0; i < 16; i++) {
    const c = prom[i], b = n => (c >> n) & 1;
    pal[i] = rgba(0x21 * b(0) + 0x47 * b(1) + 0x97 * b(2), 0x21 * b(3) + 0x47 * b(4) + 0x97 * b(5), 0x47 * b(6) + 0x97 * b(7));
  }
  const rd = proto
    ? a => { if (a === 0x0000) return ldv.read(); if (a === 0x0C00) return banks[0]; if (a === 0x1000) return banks[1]; return mem[a]; }
    : a => { if (a === 0x0000) return banks[2]; if (a === 0x0800) return banks[1]; if (a === 0x1000) return ldv.read(); if (a === 0x1800) return banks[0]; return mem[a]; };
  const wr = proto
    ? (a, v) => {
      if (a === 0x0400) ldv.write(v); else if (a === 0x0802) shootLed = !!v; else if (a === 0x0803) videoBlank = !!v;
      else if (a === 0x1400) sn.write(v);
      if (a < 0xC000) mem[a] = v;
    }
    : (a, v) => {
      if (a === 0x0000) sn.write(bitrev8(v)); else if (a === 0x0800) ldv.write(v); else if (a === 0x1000) shootLed = !!v;
      else if (a === 0x1003) videoBlank = !!v; else if (a === 0x1004) nmiOn = !!v; else if (a === 0x1006) irqOn = !!v; else if (a === 0x1007) firqOn = !!v;
      if (a < 0xC000) mem[a] = v;
    };
  const cpu = m.addCPU(M6809CPU(rd, wr), 14318180 / 4);
  cpu.reset();
  m.every(1e6 / 59.94, () => { ldp.field(); if (irqOn) cpu.irq(); if (nmiOn) cpu.nmi(); });
  m.every(8e6 / 59.94, () => { if (firqOn) cpu.firq(); });
  return {
    name: set, fps: 29.97, ldp, m, res, ow: 320, oh: 240,
    get videoBlank() { return videoBlank; },
    runField() { m.runUs(FIELD_US); },
    input(sw, d) {
      const b = bit => { banks[0] = d ? banks[0] & ~bit : banks[0] | bit; };
      switch (sw) {
        case SW.START1: b(0x08); break; case SW.START2: case SW.BUTTON2: b(0x10); break; case SW.BUTTON1: b(0x20); break;
        case SW.COIN1: b(0x01); break; case SW.COIN2: b(0x02); break; case SW.SERVICE: b(0x04); break;
      }
    },
    draw(buf) {
      for (let cx = 0; cx < 40; cx++) for (let cy = 0; cy < 30; cy++) {
        const ch = mem[(cy + cyo) * 64 + cx + cxo + charBase];
        for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
          const b = chr[(ch * 32 + x + 4 * y) & 0x1FFF], o = (cy * 8 + y) * 320 + cx * 8 + x * 2;
          buf[o] = (b >> 4) ? pal[b >> 4] : 0; buf[o + 1] = (b & 15) ? pal[b & 15] : 0;
        }
      }
    },
    sample() { return sn.sample(); },
    status() { return 'PC ' + cpu.pc.toString(16).padStart(4, '0') + ' · 6809 · LD-V1000' + (shootLed ? ' · ¡SHOOT!' : ''); }
  };
}

const DRIVERS = {
  lair: drvLair, cliff: drvCliff, superd: drvSuperd, esh: drvEsh, interstellar: drvInterstellar, badlands: drvBadlands
};
