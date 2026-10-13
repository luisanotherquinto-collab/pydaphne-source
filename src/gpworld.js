/* ==========================================================================
 *  GP World (Sega 1984) — portado de hypseus-singe/src/game/gpworld.cpp
 *  Z80 + LD-V1000 por NMI + sprites por línea + tiles de 7 px.
 * ========================================================================== */
'use strict';
const GPWORLD_ROMS = [['gpw_6162a.bin', null, 'mem', '0x0000', 0x4000, '0x0'], ['gpw_6163.bin', null, 'mem', '0x4000', 0x4000, '0x0'], ['gpw_6164.bin', null, 'mem', '0x8000', 0x4000, '0x0'],
  ['gpw_6148.bin', null, 'chr', '0x0000', 0x1000, '0x0'],
  ['gpw_6149.bin', null, 'spr', '0x0000', 0x4000, '0x0'], ['gpw_6150.bin', null, 'spr', '0x8000', 0x4000, '0x0'], ['gpw_6151.bin', null, 'spr', '0x4000', 0x4000, '0x0'], ['gpw_6152.bin', null, 'spr', '0xc000', 0x4000, '0x0'],
  ['gpw_6153.bin', null, 'spr', '0x10000', 0x4000, '0x0'], ['gpw_6154.bin', null, 'spr', '0x18000', 0x4000, '0x0'], ['gpw_6155.bin', null, 'spr', '0x14000', 0x4000, '0x0'], ['gpw_6156.bin', null, 'spr', '0x1c000', 0x4000, '0x0'],
  ['gpw_6157.bin', null, 'spr', '0x20000', 0x4000, '0x0'], ['gpw_6158.bin', null, 'spr', '0x28000', 0x4000, '0x0']];
async function drvGPWorld(lib, set, env) {
  const mem = new Uint8Array(0x10000), chr = new Uint8Array(0x1000), spr = new Uint8Array(0x30000);
  const res = await lib.loadSet('gpworld', GPWORLD_ROMS, { mem, chr, spr });
  const m = new Machine(), ldp = new LDP(29.97), ldv = new LDV1000(ldp, {});
  const banks = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00]);
  let outLatch = 0xFF, inLatch = 0, nmie = false, lss = 0x10, rss = 0x01, steer = 0, steerT = 0, cpu;
  const lookup = new Uint32Array(4096), w4 = (a, b, c, d) => 0x8F * a + 0x43 * b + 0x1F * c + 0x0E * d, bt = (i, n) => (i >> n) & 1;
  for (let i = 0; i < 4096; i++) lookup[i] = rgba(w4(bt(i, 3), bt(i, 2), bt(i, 1), bt(i, 0)), w4(bt(i, 7), bt(i, 6), bt(i, 5), bt(i, 4)), w4(bt(i, 11), bt(i, 10), bt(i, 9), bt(i, 8)));
  const rd = a => {
    if (a === 0xD800) return inLatch;
    if (a === 0xDA00) return banks[1];
    if (a === 0xDA20) return (mem[0xDA02] & 1) ? banks[5] : banks[6];
    return mem[a];
  };
  const wr = (a, v) => { if (a < 0xC000) return; if (a === 0xD800) outLatch = v; mem[a] = v; };
  cpu = m.addCPU(Z80CPU({ rd, wr,
    in: p => { switch (p & 0xFF) { case 0x80: return banks[2]; case 0x81: return banks[0]; case 0x82: return banks[3]; case 0x83: return banks[4]; } return 0; },
    out: (p, v) => { if ((p & 0xFF) === 1) { if (v & 0x40) nmie = true; else { nmie = false; if (v === 0) { ldv.write(0xA3); lss = 0x10; rss = 0x01; mem[0xE02E] = 0; } } } } }), 5000000);
  cpu.reset();
  m.every(FIELD_US, () => {
    ldp.field(); cpu.irq();
    if (steer && ++steerT % 3 === 0) {
      if (steer < 0) { banks[1] &= ~lss; if (lss < 0x80) lss <<= 1; } else { banks[1] &= ~rss; if (rss < 0x08) rss <<= 1; }
    }
  });
  m.every(FIELD_US, () => { if (nmie) { ldv.write(outLatch); inLatch = ldv.read(); cpu.nmi(); } }, FIELD_US / 2);
  const W = 360, H = 256, ov = new Uint32Array(W * H);
  const put = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) ov[y * W + x] = c; };
  const sprCol = i => lookup[mem[0xCA00 + i * 2] | ((mem[0xCA01 + i * 2] & 15) << 8)];
  const tileCol = i => { const c = mem[0xC800 + i * 2] | ((mem[0xC801 + i * 2] & 15) << 8); return c ? lookup[c] : 0; };
  const drawSprite = n => {
    const b = 0xC000 + n * 8; let src = mem[b + 6] | (mem[b + 7] << 8); const skip = ((mem[b + 4] | (mem[b + 5] << 8)) << 16) >> 16;
    const height = mem[b + 1] - mem[b], sy = mem[b] + 1, col = (mem[b + 3] >> 4) & 15, bank = (mem[b + 3] >> 1) & 7;
    let sx = mem[b + 2] + ((mem[b + 3] & 1) << 8) - 19 * 8, p = 12;
    if (n === 1) { sx -= 2; p -= 4; if (sx < 4) sx -= 4; if (sy < 4) p -= 7; }
    for (let row = p; row < height + p; row++) {
      src = (src + skip) & 0xFFFF; let s2 = src, x = sx - 12; const y = sy + row;
      for (let g = 0; g < 200; g++) {
        const idx = (s2 & 0x7FFF) | (bank << 16); if (idx >= 0x30000) break;
        const lo = spr[idx], hi = spr[idx | 0x8000];
        let p1 = hi >> 4, p2 = hi & 15, p3 = lo >> 4, p4 = lo & 15;
        if (src & 0x8000) { [p1, p4] = [p4, p1]; [p2, p3] = [p3, p2]; s2--; } else s2++;
        if (p1 && p1 !== 15) put(x, y, sprCol(p1 + 16 * col)); if (p2 && p2 !== 15) put(x + 1, y, sprCol(p2 + 16 * col));
        if (p3 && p3 !== 15) put(x + 2, y, sprCol(p3 + 16 * col)); if (p4 && p4 !== 15) put(x + 3, y, sprCol(p4 + 16 * col));
        x += 4;
        if (((lo & 15) === 15) && !(src & 0x8000)) break;
        if ((src & 0x8000) && ((hi & 0xF0) === 0xF0)) break;
      }
    }
  };
  return {
    name: set, fps: 29.97, ldp, m, res, ow: W, oh: H,
    get marquee() { return banks[2] ? 'GEAR LO' : 'GEAR HI'; },
    runField() { m.runUs(FIELD_US); },
    input(sw, d) {
      switch (sw) {
        case SW.LEFT: case SW.UP: if (d) { steer = -1; banks[1] &= ~lss; } else { steer = 0; banks[1] = 0xFF; lss = 0x10; rss = 0x01; } break;
        case SW.RIGHT: if (d) { steer = 1; banks[1] &= ~rss; } else { steer = 0; banks[1] = 0xFF; lss = 0x10; rss = 0x01; } break;
        case SW.START1: banks[0] = d ? banks[0] & ~0x10 : banks[0] | 0x10; break;
        case SW.BUTTON1: if (d) banks[2] = ~banks[2] & 0xFF; break;
        case SW.BUTTON2: case SW.DOWN: banks[5] = d ? 0xFF : 0; break;
        case SW.BUTTON3: banks[6] = d ? 0xFF : 0; break;
        case SW.COIN1: banks[0] = d ? banks[0] & ~1 : banks[0] | 1; break;
        case SW.COIN2: banks[0] = d ? banks[0] & ~2 : banks[0] | 2; break;
        case SW.SERVICE: banks[0] = d ? banks[0] & ~8 : banks[0] | 8; break;
        case SW.TEST: banks[0] = d ? banks[0] & ~4 : banks[0] | 4; break;
      }
    },
    draw(buf) {
      ov.fill(0);
      for (let s = 0; s < 64; s++) { const b = 0xC000 + s * 8; if (mem[b + 1] && mem[b + 1] - mem[b] > 0) drawSprite(s); }
      const P = 5;
      for (let cx = 19; cx < 64; cx++) for (let cy = 0; cy < 32; cy++) {
        const code = mem[0xD000 + cy * 64 + cx];
        for (let y = 0; y < 8; y++) {
          const b0 = chr[code * 8 + y], b1 = chr[(code * 8 + y + 0x800) & 0xFFF];
          for (let x = 0; x < 8; x++) { const s = 7 - x, px = ((b0 >> s) & 1) | (((b1 >> s) & 1) << 1); if (px) { const c = tileCol(px | (code & 0xFC)); if (c) put((cx - 19) * 7 + x + P, cy * 8 + y + P, c); } }
        }
      }
      buf.set(ov);
    },
    sample() { return 0; },
    status() { return 'PC ' + cpu.pc.toString(16).padStart(4, '0') + ' · LD-V1000'; }
  };
}
DRIVERS.gpworld = drvGPWorld;
