/* ==========================================================================
 *  Astron Belt / Galaxy Ranger / Star Blazer / Cobra Command (Sega) —
 *  portado de hypseus-singe/src/game/astron.cpp. Z80 + sprites por líneas;
 *  prototipos con LD-V1000 (paralelo), producción con Hitachi VIP9500SG por 8251.
 * ========================================================================== */
'use strict';

class VIP9500SG {
  constructor(ldp) { this.ldp = ldp; this.q = []; this.digits = ''; this.mode = 0; this.searching = false; this.log = []; }
  read() { return this.q.length ? this.q.shift() : 0; }
  get ready() { if (this.searching && this.ldp.status === LDP_PAUSED) { this.q.push(0x41, 0xB0); this.searching = false; } return this.q.length > 0; }
  write(v) {
    const L = this.ldp; if (this.log.length < 300) this.log.push(v.toString(16));
    if (v >= 0x30 && v <= 0x39) { if (this.digits.length < 5) this.digits += v - 0x30; return; }
    switch (v) {
      case 0x25: L.play(); this.q.push(0xA5); break;
      case 0x29: L.pause(); this.q.push(0xA9); break;
      case 0x2B: this.mode = 1; break;
      case 0x2F: this.q.push(0xAF); break;
      case 0x41:
        if (this.mode === 1) { L.search(parseInt(this.digits || '0', 10), true); this.q.push(0x41, 0xB0); }
        else if (this.mode === 2) { L.skipForward(parseInt(this.digits || '0', 10)); this.q.push(0x41, 0xC6); }
        this.digits = ''; this.mode = 0; break;
      case 0x46: this.mode = 2; break;
      case 0x4C: this.q.push(0xCC); break; case 0x4D: this.q.push(0xCD); break;
      case 0x53: L.play(); this.q.push(0xD3); break;
      case 0x68: this.q.push(0xE8); break;
      case 0x6B: { const f = L.curFrame; this.q.push(0x6B, (f >> 8) & 0xFF, f & 0xFF); break; }
      case 0x6E: this.q.push(0xEE); break;
    }
  }
}

const ASTRON_SETS = { astron: { vip: 1 }, astronp: {}, galaxy: { vip: 1 }, galaxyp: {}, blazer: {}, cobraab: { vip: 1, cobra: 1 } };
async function drvAstron(lib, set, env) {
  const v = ASTRON_SETS[set] || {};
  const mem = new Uint8Array(0x10000), rombank = new Uint8Array(0x8000), chr = new Uint8Array(0x1000), spr = new Uint8Array(0x10000), bankprom = new Uint8Array(0x200), misc = new Uint8Array(0x400);
  const res = await lib.loadSet(set, ROMDEFS[set], { m_cpumem: mem, rombank, character: chr, sprite: spr, bankprom, miscprom: misc });
  const m = new Machine(), ldp = new LDP(29.97);
  const ldv = v.vip ? null : new LDV1000(ldp, {}), vip = v.vip ? new VIP9500SG(ldp) : null;
  const banks = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]);
  let bank = 0, outLatch = 0xFF, inLatch = 0, txrdy = false, rxrdy = false, txEn = false, rxEn = false, init8251 = false, cpu;
  const lookup = new Uint32Array(4096);
  const w4 = (a, b, c, d) => 0x8F * a + 0x43 * b + 0x1F * c + 0x0E * d, bt = (i, n) => (i >> n) & 1;
  for (let i = 0; i < 4096; i++) lookup[i] = rgba(w4(bt(i, 3), bt(i, 2), bt(i, 1), bt(i, 0)), w4(bt(i, 7), bt(i, 6), bt(i, 5), bt(i, 4)), w4(bt(i, 11), bt(i, 10), bt(i, 9), bt(i, 8)));
  const tileCol = x => lookup[((x & 7) << 1) | ((x & 0x38) << 2) | ((x & 0xC0) << 4)];
  const nmi8251 = () => { if (mem[0xD801] & 0x40) cpu.nmi(); };
  const hits = {}; 
  const rd = a => {
    if (a === 0xBB4 || a === 0x129B || a === 0x10E1 || a === 0xBDC) hits[a] = (hits[a] || 0) + 1;
    if (a >= 0x8000 && a < 0xC000) return rombank[(a - 0x8000) + 0x4000 * bank];
    if (a >= 0xC800 && a < 0xD000) {
      if (!vip) return inLatch;
      if (a & 1) return (txrdy ? 1 : 0) | (rxrdy ? 2 : 0);
      rxrdy = false; return vip.read();
    }
    switch (a) { case 0xD000: return banks[2]; case 0xD001: return banks[3]; case 0xD002: return banks[0]; case 0xD003: return banks[1]; }
    return mem[a];
  };
  const wr = (a, val) => {
    if (a < 0xC000) return;
    if (a >= 0xC800 && a < 0xD000) {
      if (!vip) { outLatch = val; return; }
      if (!(a & 1)) { txrdy = false; vip.write(val); return; }
      if (!init8251) { init8251 = true; return; }
      if (val & 1) { if (!txEn) { txEn = true; txrdy = true; nmi8251(); } } else { txEn = false; txrdy = false; }
      rxEn = !!(val & 4); if (val & 0x40) init8251 = false; return;
    }
    if (a >= 0xF400 && a < 0xF800) { mem[a - 0x400] = val; return; }
    mem[a] = val;
  };
  cpu = m.addCPU(Z80CPU({ rd, wr, in: () => 0, out: (p, val) => { if ((p & 0xFF) < 2) bank = val & 1; } }), 5000000);
  cpu.reset();
  m.every(FIELD_US, () => { (vip ? ldp : ldp).field(); cpu.irq(); });
  if (vip) m.every(2000, () => { if (vip.ready && !rxrdy && rxEn) { rxrdy = true; nmi8251(); } else if (!txrdy && txEn) { txrdy = true; nmi8251(); } });
  else m.every(FIELD_US, () => { if (mem[0xD801] & 0x40) { ldv.write(outLatch); inLatch = ldv.read(); cpu.nmi(); } }, FIELD_US / 2);
  const W = 256, H = 256, ov = new Uint32Array(W * H);
  const sprPal = i => lookup[mem[0xE000 + i * 2] | ((mem[0xE001 + i * 2] & 15) << 8)];
  return {
    name: set, fps: 29.97, ldp, m, res, ow: 256, oh: 240, mem, vip, hits, cpu, st8251: () => ({ txrdy, rxrdy, txEn, rxEn, init8251, q: vip && vip.q.length, log: vip && vip.log.slice(-12).join(',') }),
    runField() { m.runUs(FIELD_US); },
    input(sw, d) {
      const b = (i, bit) => { banks[i] = d ? banks[i] & ~bit : banks[i] | bit; };
      switch (sw) {
        case SW.UP: b(1, 8); break; case SW.LEFT: b(1, 2); break; case SW.RIGHT: b(1, 1); break; case SW.DOWN: b(1, 4); break;
        case SW.START1: b(0, 0x10); break; case SW.START2: b(0, v.cobra ? 0x20 : 0x40); break;
        case SW.BUTTON1: b(1, 0x10); break; case SW.BUTTON2: if (v.cobra) b(0, 0x40); break;
        case SW.COIN1: b(0, 1); break; case SW.COIN2: b(0, 2); break; case SW.SERVICE: b(0, 8); break; case SW.TEST: b(0, 4); break;
      }
    },
    draw(buf) {
      ov.fill(0);
      for (let sn = 0; sn < 32; sn++) {
        const sb = 0xC000 + sn * 16, top = mem[sb], bot = mem[sb + 1];
        if (!bot || bot - top <= 0) continue;
        let src = mem[sb + 6] | (mem[sb + 7] << 8); const skip = (mem[sb + 4] | (mem[sb + 5] << 8)) << 16 >> 16;
        for (let row = 0; row < bot - top; row++) {
          src = (src + skip) & 0xFFFF; let s2 = src, x = mem[sb + 2] + ((mem[sb + 3] & 1) << 8) - 3; const y = top + 1 + row;
          for (let guard = 0; guard < 256; guard++) {
            const lo = spr[s2 & 0x7FFF], hi = spr[(s2 & 0x7FFF) + 0x8000];
            if (lo === 0xFF && hi === 0xFF) break;
            let p1 = (lo >> 4) | (hi & 0xF0), p2 = (lo & 15) | ((hi << 4) & 0xF0);
            if (src & 0x8000) { const t = p1; p1 = p2; p2 = t; s2--; } else s2++;
            if (y >= 0 && y < H) { if (p1 && x >= 0 && x < W) ov[y * W + x] = sprPal(p1); if (p2 && x + 1 >= 0 && x + 1 < W) ov[y * W + x + 1] = sprPal(p2); }
            x += 2;
          }
        }
      }
      const tb = (mem[0xD801] & 0x20) << 2;
      for (let cx = 0; cx < 32; cx++) for (let cy = 0; cy < 32; cy++) {
        const code = mem[0xF000 + cy * 32 + cx], hiBits = (code & 0xF8) >> 1;
        for (let y = 0; y < 8; y++) {
          const p0 = chr[code * 8 + y], p1 = chr[code * 8 + y + 0x800], o = (cy * 8 + y) * W + cx * 8;
          for (let x = 0; x < 8; x++) {
            const s = 7 - x, px = bankprom[(((p0 >> s) & 1) | (((p1 >> s) & 1) << 1) | hiBits | tb) & 0x1FF];
            if (px) ov[o + x] = tileCol(px);
          }
        }
      }
      buf.set(ov.subarray(16 * W, 256 * W));
    },
    sample() { return 0; },
    status() { return 'PC ' + cpu.pc.toString(16).padStart(4, '0') + (vip ? ' · VIP9500SG' : ' · LD-V1000'); }
  };
}
DRIVERS.astron = drvAstron;
