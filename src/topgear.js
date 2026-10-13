/* ==========================================================================
 *  Top Gear (Universal 1984) — FANGAME: recreación del juego de laserdisc
 *  perdido sobre una placa "LD-Z80" inventada (fusión de Mr. Do! y Super Don
 *  Quix-ote). Implementa el driver de referencia topgear.cpp de Luis:
 *  Z80 4 MHz IM1, LD-V1000 en el puerto $00 (latch muestreado una vez por
 *  campo), número de cuadro BCD en $01-$03, chars 32×32 2bpp (color 0 =
 *  genlock), 64 sprites 16×16 3bpp, 2× SN76489, 3 canales PCM a 11025 Hz y
 *  dos barras de LEDs + lámpara IGNITE.
 * ========================================================================== */
'use strict';
async function drvTopGear(lib, set, env) {
  const rom = new Uint8Array(0x8000), gfx1 = new Uint8Array(0x2000), gfx2 = new Uint8Array(0x3000), prom = new Uint8Array(0x40), smp = new Uint8Array(0x10000);
  const defs = [['tg-a4.bin', 'rom', 0x0000], ['tg-c4.bin', 'rom', 0x2000], ['tg-e4.bin', 'rom', 0x4000], ['tg-f4.bin', 'rom', 0x6000], ['tg-h5.bin', 'gfx1', 0], ['tg-k5.bin', 'gfx1', 0x1000],
    ['tg-n8.bin', 'gfx2', 0], ['tg-r8.bin', 'gfx2', 0x1000], ['tg-s8.bin', 'gfx2', 0x2000], ['tg-u02.bin', 'prom', 0], ['tg-t02.bin', 'prom', 0x20], ['tg-v1.bin', 'smp', 0], ['tg-v2.bin', 'smp', 0x8000]];
  const dst = { rom, gfx1, gfx2, prom, smp }, res = { missing: [], loaded: [] };
  for (const [n, r, off] of defs) {
    let rec = lib.find(n, 0, 'topgear', 'topgear'); if (!rec) for (const k in lib.sets) for (const x of lib.sets[k]) if (x.name === n) rec = x;
    if (!rec) { res.missing.push(n); continue; }
    const d = await lib.get(rec); dst[r].set(d.subarray(0, Math.min(d.length, dst[r].length - off)), off); res.loaded.push(n);
  }
  const pal = new Uint32Array(32);
  for (let i = 0; i < 32; i++) pal[i] = rgba((prom[i] >> 4) * 17, (prom[i] & 15) * 17, (prom[0x20 + i] >> 4) * 17);
  /* PCM: cabecera de 16 × (inicio16, largo16) */
  const pcm = [];
  for (let i = 0; i < 16; i++) {
    const st = smp[i * 4] | (smp[i * 4 + 1] << 8), len = smp[i * 4 + 2] | (smp[i * 4 + 3] << 8);
    const a = new Float32Array(i ? len : 0); for (let k = 0; k < a.length; k++) a[k] = (smp[(st + k) & 0xFFFF] - 128) / 128; pcm.push(a);
  }
  const ram = new Uint8Array(0x1000), vram = new Uint8Array(0x800), spr = new Uint8Array(0x100);
  const m = new Machine(), ldp = new LDP(29.97), ldv = new LDV1000(ldp, { afterSearch: 0xE5 });   /* tras la búsqueda el reproductor queda en still (02) */
  const sn1 = makeSN76496(4000000, env.sampleRate), sn2 = makeSN76496(4000000, env.sampleRate);
  const ch = [0, 1, 2].map(() => ({ id: 0, pos: 0, loop: false }));
  let ctrl = 0, outLatch = 0xFF, inLatch = 0, lamp1 = 0, lamp2 = 0, in0 = 0xFF, wheel = 0x80, wheelV = 0, cpu;
  const DSW1 = 0x06;
  const busy = () => ch.reduce((b, c, i) => b | (c.id ? 1 << i : 0), 0);
  const bcd = n => { const s = String(Math.max(0, n | 0) % 100000).padStart(5, '0'); return [+s[0], (+s[1] << 4) | +s[2], (+s[3] << 4) | +s[4]]; };
  const rd = a => {
    if (a < 0x8000) return rom[a];
    if (a < 0x8800) return vram[a - 0x8000];
    if (a >= 0x9000 && a < 0x9100) return spr[a - 0x9000];
    if (a === 0x9803) return busy();
    if (a === 0xA000) return in0;
    if (a === 0xA001) return wheel;
    if (a === 0xA002) return DSW1;
    if (a === 0xA003) return 0xFF;
    if (a >= 0xE000 && a < 0xF000) return ram[a - 0xE000];
    return 0xFF;
  };
  const wr = (a, v) => {
    if (a >= 0x8000 && a < 0x8800) { vram[a - 0x8000] = v; return; }
    if (a >= 0x9000 && a < 0x9100) { spr[a - 0x9000] = v; return; }
    if (a >= 0xE000 && a < 0xF000) { ram[a - 0xE000] = v; return; }
    switch (a) {
      case 0x9800: ctrl = v; break;
      case 0x9801: sn1.write(v); break;
      case 0x9802: sn2.write(v); break;
      case 0x9803: case 0x9804: case 0x9805: { const c = ch[a - 0x9803], id = v & 15; c.id = id && pcm[id].length ? id : 0; c.pos = 0; c.loop = !!(v & 0x80); break; }
      case 0x9806: lamp1 = v; break;
      case 0x9807: lamp2 = v; break;
    }
  };
  cpu = m.addCPU(Z80CPU({ rd, wr,
    in: p => { switch (p & 0xFF) { case 0: return inLatch; case 1: case 2: case 3: return bcd(ldp.curFrame !== undefined ? ldp.curFrame : ldp.frame)[(p & 0xFF) - 1]; } return 0xFF; },
    out: (p, v) => { if ((p & 0xFF) === 0) outLatch = v; } }), 4000000);
  cpu.reset();
  m.every(FIELD_US, () => {
    ldp.field();
    /* el reproductor muestrea el latch una vez por campo (como Super Don Quix-ote) */
    ldv.write(outLatch);
    const st = ldv.read();
    inLatch = (st === 0x64 || st === 0xE4) ? 0x01 : (st === 0x50 || st === 0xD0) ? 0x80 : 0x02;
    cpu.irq();
    /* volante con teclado: se mueve hacia la dirección pulsada y regresa al centro al soltar */
    if (wheelV) wheel = Math.max(0, Math.min(255, wheel + wheelV * 6)); else if (!G.mouseWheel) wheel += (0x80 - wheel) * 0.25 | 0;
  });
  const W = 256, H = 256, ov = new Uint32Array(W * H);
  const bar = (n, max, rev) => { let s = ''; for (let i = 0; i < max; i++) { const on = rev ? (max - 1 - i) < n : i < n; s += on ? '█' : '·'; } return s; };
  const G = {
    name: set, fps: 29.97, ldp, m, res, ow: W, oh: H, mouseWheel: false,
    get videoBlank() { return !(ctrl & 4); },
    get marquee() { return bar(Math.min(17, lamp1), 17, false) + ((lamp2 & 0x80) ? ' IGNITE ' : '        ') + bar(Math.min(17, lamp2 & 0x1F), 17, true); },
    runField() { m.runUs(FIELD_US); },
    analog(x) { G.mouseWheel = true; wheel = Math.max(0, Math.min(255, x)); },
    input(sw, d) {
      const b = bit => { in0 = d ? in0 & ~bit : in0 | bit; };
      switch (sw) {
        case SW.COIN1: case SW.COIN2: b(1); break;
        case SW.BUTTON1: case SW.UP: b(2); break;
        case SW.START1: case SW.BUTTON2: b(4); break;
        case SW.SERVICE: b(8); break;
        case SW.LEFT: G.mouseWheel = false; wheelV = d ? -1 : (wheelV === -1 ? 0 : wheelV); break;
        case SW.RIGHT: G.mouseWheel = false; wheelV = d ? 1 : (wheelV === 1 ? 0 : wheelV); break;
      }
    },
    draw(buf) {
      ov.fill(0);
      if (ctrl & 2) {
        for (let o = 0; o < 0x400; o++) {
          const at = vram[0x400 + o], code = vram[o] | ((at & 8) << 5), base = (at & 3) * 4, cx = (o & 31) * 8, cy = (o >> 5) * 8;
          for (let y = 0; y < 8; y++) {
            const p0 = gfx1[(code * 8 + y) & 0xFFF], p1 = gfx1[0x1000 + ((code * 8 + y) & 0xFFF)];
            for (let x = 0; x < 8; x++) { const px = (((p1 >> (7 - x)) & 1) << 1) | ((p0 >> (7 - x)) & 1); if (px) ov[(cy + y) * W + cx + x] = pal[base + px]; }
          }
        }
        for (let s = 63; s >= 0; s--) {
          const o = s * 4, at = spr[o + 2]; if (!(at & 0x80)) continue;
          const code = spr[o + 1] & 0x7F, fx = at & 0x10, fy = at & 0x20, base = 16 + (at & 1) * 8, sx = spr[o + 3], sy = spr[o];
          for (let y = 0; y < 16; y++) {
            const ry = fy ? 15 - y : y, a = code * 32 + ry * 2;
            const w0 = (gfx2[a] << 8) | gfx2[a + 1], w1 = (gfx2[0x1000 + a] << 8) | gfx2[0x1000 + a + 1], w2 = (gfx2[0x2000 + a] << 8) | gfx2[0x2000 + a + 1];
            for (let x = 0; x < 16; x++) {
              const rx = fx ? 15 - x : x, sh = 15 - rx, px = (((w2 >> sh) & 1) << 2) | (((w1 >> sh) & 1) << 1) | ((w0 >> sh) & 1);
              const xx = (sx + x) & 0xFF, yy = sy + y; if (px && yy < H) ov[yy * W + xx] = pal[base + px];
            }
          }
        }
      }
      buf.set(ov);
    },
    sample() {
      let s = (sn1.sample() + sn2.sample()) * 0.3;
      for (const c of ch) {
        if (!c.id) continue; const a = pcm[c.id], i = c.pos | 0;
        if (i >= a.length) { if (c.loop) c.pos = 0; else { c.id = 0; continue; } }
        s += a[c.pos | 0] * 0.5; c.pos += 11025 / env.sampleRate;
      }
      return s;
    },
    status() { return 'PC ' + cpu.pc.toString(16).padStart(4, '0') + ' · LD-V1000 · volante ' + wheel; }
  };
  return G;
}
DRIVERS.topgear = drvTopGear;
