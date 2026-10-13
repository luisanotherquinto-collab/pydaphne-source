/* ==========================================================================
 *  Bega's Battle / Cobra Command / Road Blaster (Data East) — portado de
 *  hypseus-singe/src/game/bega.cpp: 2× 6502, 2× AY-3-8910, MC6850 y un
 *  reproductor Sony LDP-1000 en HLE (ldp-in/ldp1000.cpp).
 * ========================================================================== */
'use strict';

class LDP1000 {
  constructor(ldp, m) { this.ldp = ldp; this.m = m; this.q = []; this.wait = 0; this.digits = ''; this.mode = 0; this.pending = false; this.repeatEnd = 0; this.log = []; }
  now() { return this.m.timeUs; }
  ack(ms) { this.wait = this.now() + ms * 1000; this.q.push(0x0A); }
  get ready() { return this.q.length > 0 && this.now() >= this.wait; }
  read() { return this.q.length && this.now() >= this.wait ? this.q.shift() : 0; }
  write(v) {
    const L = this.ldp;
    if (this.log.length < 300) this.log.push(v.toString(16));
    if (v >= 0x30 && v <= 0x39) { this.digits = (this.digits + (v - 0x30)).slice(-5); this.ack(1.2); return; }
    switch (v) {
      case 0x3A: L.play(); this.ack(2.6); break;
      case 0x43: this.mode = 1; this.digits = ''; this.ack(2.6); break;
      case 0x44: this.mode |= 2; this.ack(2.6); break;
      case 0x40: {
        this.ack(2.6);
        const n = parseInt(this.digits || '0', 10); this.digits = '';
        if (this.mode === 1) { if (L.search(n, false)) this.pending = true; else this.q.push(0x02); }
        else if (this.mode & 2) { this.repeatEnd = n; L.play(); }
        this.mode = 0; break;
      }
      case 0x46: L.audio1 = true; this.q.push(0x0A); break; case 0x47: L.audio1 = false; this.q.push(0x0A); break;
      case 0x48: L.audio2 = true; this.q.push(0x0A); break; case 0x49: L.audio2 = false; this.q.push(0x0A); break;
      case 0x24: L.audio1 = L.audio2 = false; this.q.push(0x0A); break; case 0x25: L.audio1 = L.audio2 = true; this.q.push(0x0A); break;
      case 0x4F: L.pause(); this.q.push(0x0A); break;
      case 0x56: case 0x55: this.digits = ''; this.mode = 0; this.ack(4.3); break;
      case 0x60: for (const c of String(L.curFrame).padStart(5, '0')) this.q.push(c.charCodeAt(0)); break;
      case 0x67: case 0x62: this.q.push(0x80, 0, 0x10, 0, L.status === LDP_PLAYING ? 1 : 0x20); break;
      default: this.q.push(0x0A);
    }
  }
  field() {
    const L = this.ldp; L.field();
    if (this.pending && (L.status === LDP_PAUSED || L.status === LDP_ERROR)) { this.pending = false; this.q.push(L.status === LDP_PAUSED ? 0x01 : 0x02); }
    if (this.repeatEnd && L.curFrame >= this.repeatEnd) { this.repeatEnd = 0; L.pause(); this.q.push(0x01); }
  }
}

const DEF_PAL = [0, rgba(255, 60, 60), rgba(60, 255, 60), rgba(255, 255, 60), rgba(60, 120, 255), rgba(255, 60, 255), rgba(60, 255, 255), rgba(255, 255, 255)];
async function drvBega(lib, set, env) {
  const mem = new Uint8Array(0x10000), mem2 = new Uint8Array(0x10000), ch1 = new Uint8Array(0x6000), ch2 = new Uint8Array(0x6000);
  const res = await lib.loadSet(set, ROMDEFS[set], { m_cpumem: mem, m_cpumem2: mem2, character1: ch1, character2: ch2 });
  const m = new Machine(), ldp = new LDP(29.97), sony = new LDP1000(ldp, m);
  const banks = new Uint8Array([0xFF, 0xFF, set === 'roadblaster' ? 0xF8 : 0xB8]);
  let vblank = false, status = 0, ldpData = 0, latch = 0, al1 = 0, al2 = 0;
  const ay1 = makeAY(1500000, env.sampleRate), ay2 = makeAY(1500000, env.sampleRate);
  const pal = new Uint32Array(64);
  let c0, c1;
  const rd = a => {
    switch (a) {
      case 0x1000: return banks[0]; case 0x1001: return banks[1]; case 0x1002: return banks[2];
      case 0x1003: if (vblank) { vblank = false; return 0x80; } return 0;
      case 0x1006: return status;
      case 0x1007: if (status & 1) ldpData = sony.read(); status &= 0x7E; return ldpData;
    }
    return mem[a];
  };
  const wr = (a, v) => {
    if (a === 0x1004) { latch = v; c1.irq(true); }
    else if (a === 0x1006) { if ((v & 3) === 3) status = 0x02; }
    else if (a === 0x1007) { status &= 0x7D; sony.write(v); }
    else if (a >= 0x1800 && a <= 0x1837) {
      const x = ~v & 0xFF, b = n => (x >> n) & 1;
      pal[a & 0x3F] = rgba(0x21 * b(0) + 0x47 * b(1) + 0x97 * b(2), 0x21 * b(3) + 0x47 * b(4) + 0x97 * b(5), 0x47 * b(6) + 0x97 * b(7));
    }
    if (a < 0x4000) mem[a] = v;
  };
  const rd2 = a => a === 0xA000 ? latch : mem2[a];
  const wr2 = (a, v) => {
    if (a === 0x2000) { ay1.writeAddr(al1); ay1.writeData(v); } else if (a === 0x4000) al1 = v;
    else if (a === 0x6000) { ay2.writeAddr(al2); ay2.writeData(v); } else if (a === 0x8000) al2 = v;
    else if (a < 0x800) mem2[a] = v;
  };
  c0 = m.addCPU(M6502CPU(rd, wr), 2500000); c0.c.autoAck = true;
  c1 = m.addCPU(M6502CPU(rd2, wr2), 2500000); c1.c.autoAck = true;
  c0.reset(); c1.reset();
  m.every(FIELD_US, () => { vblank = true; sony.field(); });
  m.every(9000 / 9.6, () => { if (sony.ready) { status |= 0x83; c0.irq(true); } else if (!(status & 1)) status |= 0x02; });
  m.every(2000, () => c1.nmi());
  const W = 256, H = 256, ov = new Uint8Array(W * H);
  const put = (x, y, p) => { if (x >= 0 && x < W && y >= 0 && y < H) ov[y * W + x] = p; };
  const d8 = (n, cs, x0, y0) => {
    for (let y = 0; y < 8; y++) {
      const b1 = cs[(n * 8 + y) % 0x2000], b2 = cs[(n * 8 + y) % 0x2000 + 0x2000], b3 = cs[(n * 8 + y) % 0x2000 + 0x4000];
      for (let x = 0; x < 8; x++) { const p = (((b1 >> x) & 1) << 2) | (((b2 >> x) & 1) << 1) | ((b3 >> x) & 1); if (p) put(x0 + x, y0 + 7 - y, p + 48); }
    }
  };
  const d16 = (n, cs, x0, y0, xf, yf) => {
    for (let y = 0; y < 16; y++) for (let half = 0; half < 2; half++) {
      const o = (n * 32 + y + half * 16) % 0x2000, b1 = cs[o], b2 = cs[o + 0x2000], b3 = cs[o + 0x4000];
      for (let x = 0; x < 8; x++) {
        const p = (((b1 >> x) & 1) << 2) | (((b2 >> x) & 1) << 1) | ((b3 >> x) & 1), xx = half * 8 + x;
        if (p) put(x0 + (xf ? 15 - xx : xx), y0 + (yf ? y : 15 - y), p + 48);
      }
    }
  };
  const sprites = (off, cs) => {
    for (let s = 0; s < 0x32; s += 4) {
      const o = off + s;
      if ((mem[o] & 1) && mem[o + 3] < 240 && mem[o + 2] >= 8 && mem[o + 2] < 232) d16(mem[o + 1], cs, mem[o + 3], mem[o + 2], mem[o] & 4, mem[o] & 2);
    }
  };
  return {
    name: set, fps: 29.97, ldp, m, res, ow: 256, oh: 240, sony,
    runField() { m.runUs(FIELD_US); },
    input(sw, d) {
      const b = (i, bit) => { banks[i] = d ? banks[i] & ~bit : banks[i] | bit; };
      switch (sw) {
        case SW.UP: b(0, 0x02); break; case SW.LEFT: b(0, 0x04); break; case SW.RIGHT: b(0, 0x08); break; case SW.DOWN: b(0, 0x01); break;
        case SW.START1: b(1, 0x20); break; case SW.START2: b(1, 0x10); break;
        case SW.BUTTON1: b(0, 0x40); break; case SW.BUTTON2: b(0, 0x20); break; case SW.BUTTON3: b(0, 0x10); break;
        case SW.COIN1: b(1, 0x40); if (d) c0.nmi(); break; case SW.COIN2: b(1, 0x80); if (d) c0.nmi(); break;
      }
    },
    draw(buf) {
      ov.fill(0);
      sprites(0x3800, ch1); sprites(0x3BE0, ch1); sprites(0x2800, ch2); sprites(0x2BE0, ch2);
      for (let cx = 0; cx < 32; cx++) for (let cy = 1; cy < 31; cy++) {
        d8(mem[cy * 32 + cx + 0x2800] + 256 * (mem[cy * 32 + cx + 0x2C00] & 3), ch2, cx * 8, cy * 8);
        d8(mem[cy * 32 + cx + 0x3800] + 256 * (mem[cy * 32 + cx + 0x3C00] & 3), ch1, cx * 8, cy * 8);
      }
      for (let y = 0; y < 240; y++) for (let x = 0; x < 256; x++) { const p = ov[(y + 8) * W + x]; buf[y * W + x] = p ? (pal[p] || DEF_PAL[p & 7]) : 0; }
    },
    sample() { return (ay1.sample() + ay2.sample()) * 0.5; },
    status() { return 'PC ' + c0.pc.toString(16).padStart(4, '0') + '/' + c1.pc.toString(16).padStart(4, '0') + ' · LDP-1000'; }
  };
}
DRIVERS.bega = drvBega;
