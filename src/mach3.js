/* ==========================================================================
 *  MACH 3 / Us vs. Them / Cobra Command (Mylstar/Gottlieb) — portado de
 *  hypseus-singe/src/game/mach3.cpp: 8088 + 2× 6502 + 2× AY + DAC + PR-8210.
 * ========================================================================== */
'use strict';
const MACH3_SETS = { mach3: { dips: 0x4C, target: 1 }, uvt: { dips: 0x00 }, cobram3: { dips: 0x07 } };
async function drvMach3(lib, set, env) {
  const v = MACH3_SETS[set];
  const mem = new Uint8Array(0x100000), m2 = new Uint8Array(0x10000), m3 = new Uint8Array(0x10000), spr = new Uint8Array(0x10000), chr = new Uint8Array(0x2000);
  const target = v.target ? new Uint8Array(971776) : null;
  const res = await lib.loadSet(set, ROMDEFS[set], { m_cpumem: mem, m_cpumem2: m2, m_cpumem3: m3, sprite: spr, character: chr, targetdata: target || new Uint8Array(1) });
  const m = new Machine(), ldp = new LDP(29.97), pr = new PR8210(ldp);
  let dips = v.dips, svc = 0x21, ctl = 0x00, decSel = 1, sigLoss = 0, audioReady = 0, curTarget = 0, tOff = 0, prevFrame = 0xFFFF, prevCmd = 0, ldVideo = false;
  const q1 = [], q2 = []; let snd2NmiOn = false, last4000 = 0, psgLatch = 0, sc1 = 0, sc2 = 0, dacVal = 0;
  const ay1 = makeAY(2000000, env.sampleRate), ay2 = makeAY(2000000, env.sampleRate);
  const pal = new Uint32Array(16);
  const w4 = (x) => 0x10 * (x & 1) + 0x21 * ((x >> 1) & 1) + 0x47 * ((x >> 2) & 1) + 0x87 * ((x >> 3) & 1);
  const calcPal = () => { for (let i = 0; i < 16; i++) { const a = mem[0x5000 + i * 2], b = mem[0x5001 + i * 2]; pal[i] = rgba(w4(b & 15), w4(a >> 4), w4(a & 15)); } };
  const frame = () => pr.currentFrame() || ldp.curFrame;
  let c1, c2, x86;
  const r8 = a => {
    a &= 0xFFFF;
    switch (a) {
      case 0x5800: return dips; case 0x5801: return svc; case 0x5804: return ctl;
      case 0x5805: { const f = frame(); return (f % 10) | (((f % 100) / 10 | 0) << 4); }
      case 0x5806: { const f = frame() / 100 | 0; return (f % 10) | (((f % 100) / 10 | 0) << 4); }
      case 0x5807: {
        if (decSel) { const f = frame(); let r = (f / 10000) | 0; if ((v.target && f < 53 * 44) || sigLoss > 0) r |= 0x80; r |= audioReady << 3; r |= 0x10; if (!sigLoss && f) r |= 0x20; return r; }
        const r = target ? target[curTarget + tOff] : 0; tOff++; if (tOff === 0x3FF) tOff = 0; return r;
      }
    }
    return mem[a];
  };
  const w8 = (a, val) => {
    a &= 0xFFFF;
    if (a < 0x2000 || (a >= 0x3000 && a < 0x5000)) { mem[a] = val; return; }
    if (a >= 0x5000 && a < 0x5020) { mem[a] = val; calcPal(); return; }
    switch (a) {
      case 0x5800: mem[a] = val; return;
      case 0x5802: q1.push(val & 0x3F); c1.irq(true); if (val) { q2.push(val & 0x3F); c2.irq(true); } mem[a] = val; return;
      case 0x5803: ldVideo = (val & 8) === 8; mem[a] = val; return;
      case 0x5805: { pr.command(val << 2); if (((val << 2 & 0x7C) >> 2) === 0x1A) sigLoss = 60;
        if (v.target && val === 0x24 && prevCmd !== 0x24 && frame() > 53 * 44) { audioReady = 1; tOff = 0; } prevCmd = val; return; }
      case 0x5806: decSel = val & 1; return;
    }
  };
  x86 = m.addCPU(X86CPU({ r8, w8, in: () => 0, out: () => {} }), 5000000);
  c1 = m.addCPU(M6502CPU(a => { if (a === 0x8000) return q1.length ? q1.shift() : 0; return m2[a]; }, (a, val) => { if (a === 0x4001) dacVal = (val - 128) / 128; else if (a < 0x4000) m2[a] = val; }), 1000000);
  c2 = m.addCPU(M6502CPU(a => { if (a === 0x6000) return 0xC0; if (a === 0xA800) return q2.length ? q2.shift() : 0; return m3[a]; }, (a, val) => {
    switch (a) {
      case 0x2000: case 0x4000:
        snd2NmiOn = !!(val & 1);
        if ((last4000 & 4) && !(val & 4)) {
          if (val & 8) { if (val & 0x10) sc1 = psgLatch; else { ay1.writeAddr(sc1); ay1.writeData(psgLatch); } }
          else { if (val & 0x10) sc2 = psgLatch; else { ay2.writeAddr(sc2); ay2.writeData(psgLatch); } }
        }
        last4000 = val & 0x44; break;
      case 0x8000: psgLatch = val; break;
      case 0xA000: nmiTimer.period = 1e6 / (250000 / 256 / (256 - val || 1)); break;
      case 0xB000: c1.nmi(); break;
    }
    if (a < 0x2000) m3[a] = val;
  }), 1000000);
  c1.c.autoAck = true; c2.c.autoAck = true;
  x86.reset(); c1.reset(); c2.reset();
  m.every(FIELD_US, () => {
    ldp.field(); if (sigLoss > 0) sigLoss--;
    x86.nmi();
    if (v.target) {
      const f = frame();
      if (f !== prevFrame && f % 53 === 0) { const pk = f / 53 | 0; if (pk >= 44) { curTarget = (pk - 44) * 1024 + 1; tOff = 0; audioReady = 1; } }
      if (f === prevFrame && f % 53 === 0) audioReady = 0;
      prevFrame = f;
    }
  });
  const nmiTimer = m.every(1000, () => { if (snd2NmiOn) c2.nmi(); });
  const W = 256, H = 240, ov = new Uint8Array(W * H);
  const chars = () => {
    for (let cx = 0; cx < 32; cx++) for (let cy = 0; cy < 30; cy++) {
      const n = mem[0x3800 + cy * 32 + cx];
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const b = chr[(n * 32 + (x >> 1) + y * 4) & 0x1FFF], p = x & 1 ? b & 15 : b >> 4;
        if (p) ov[(cy * 8 + y) * W + cx * 8 + x] = p;
      }
    }
  };
  const sprites = () => {
    const off = (mem[0x5803] & 2) ? 0x2000 : 0;
    for (let s = 0; s < 62; s++) {
      const o = 0x3000 + s * 4; if (!(mem[o] | mem[o + 1] | mem[o + 2] | mem[o + 3])) continue;
      const yp = mem[o], xp = mem[o + 1], n = 255 - mem[o + 2], y0 = yp - 13, x0 = xp - 4;
      for (let y = 0; y < 16; y++) {
        const yy = y0 + y; if (yy < 0 || yy >= H) continue;
        const base = off + n * 32 + y * 2;
        for (let half = 0; half < 2; half++) for (let i = 7; i >= 0; i--) {
          const q = base + half, p = (((spr[q & 0xFFFF] >> i) & 1) << 3) | (((spr[(q + 0x4000) & 0xFFFF] >> i) & 1) << 2) | (((spr[(q + 0x8000) & 0xFFFF] >> i) & 1) << 1) | ((spr[(q + 0xC000) & 0xFFFF] >> i) & 1);
          const xx = x0 + half * 8 + (7 - i); if (p && xx >= 0 && xx < W) ov[yy * W + xx] = p;
        }
      }
    }
  };
  return {
    name: set, fps: 29.97, ldp, m, res, ow: W, oh: H,
    get videoBlank() { return !ldVideo; },
    runField() { m.runUs(FIELD_US); },
    input(sw, d) {
      const cb = bit => { ctl = d ? ctl | bit : ctl & ~bit; }, sb = bit => { svc = d ? svc | bit : svc & ~bit; };
      switch (sw) {
        case SW.UP: cb(1); break; case SW.DOWN: cb(2); break; case SW.LEFT: cb(4); break; case SW.RIGHT: cb(8); break;
        case SW.BUTTON1: cb(0x20); break; case SW.BUTTON2: cb(0x40); break; case SW.BUTTON3: cb(0x10); break;
        case SW.START1: sb(0x40); break; case SW.START2: sb(0x80); break; case SW.COIN1: sb(0x08); break; case SW.COIN2: sb(0x04); break;
        case SW.TEST: sb(0x02); break;
      }
    },
    draw(buf) {
      ov.fill(0);
      if (mem[0x5803] & 4) { if (mem[0x5803] & 1) { sprites(); chars(); } else { chars(); sprites(); } }
      for (let i = 0; i < W * H; i++) { const p = ov[i]; buf[i] = p ? pal[p] : (ldVideo ? 0 : pal[0] | 0xFF000000); }
    },
    sample() { return (ay1.sample() + ay2.sample()) * 0.4 + dacVal * 0.3; },
    status() { return 'CS:IP ' + x86.c.S[1].toString(16) + ':' + x86.c.ip.toString(16) + ' · PR-8210 · 8088'; }
  };
}
DRIVERS.mach3 = drvMach3;
