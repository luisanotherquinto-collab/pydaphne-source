/* ==========================================================================
 *  Inter Stellar Zangus (Funai / Gakken 1984) — set istellar2, emulado aquí
 *  como un canal más. Mapa de memoria tomado del port de Luis (corrige el de
 *  MAME): main Z80 ROM $0000-$9FFF (rom2-rom6) + RAM/tiles/atributos/sprites;
 *  sub Z80 ROM rom10 $0000-$1BFF + RAM 1K en $1C00 y lectura de las ROMs de
 *  main; Z80 de audio con 2× SN76496. LD-V1000: estado con bit 7 de "listo"
 *  (E4 play · E5 stop · 50/D0 búsqueda · FC park) y comandos que el reproductor
 *  sólo latchea en la transición del bus.
 * ========================================================================== */
'use strict';
async function drvZangus(lib, set, env) {
  const mrom = new Uint8Array(0xA000), arom = new Uint8Array(0x2000), sromFull = new Uint8Array(0x2000), gfx = new Uint8Array(0x6000), prom = new Uint8Array(0x300);
  const res = { missing: [], loaded: [] };
  const map = [['rom2.g1', mrom, 0x0000], ['rom3.f1', mrom, 0x2000], ['rom4.e1', mrom, 0x4000], ['rom5.d1', mrom, 0x6000], ['rom6.b1', mrom, 0x8000],
    ['rom1.j1', arom, 0], ['rom10.f1', sromFull, 0], ['rom9.g5', gfx, 0x0000], ['rom8.h5', gfx, 0x2000], ['rom7.j5', gfx, 0x4000],
    ['red.b6', prom, 0x000], ['green.c6', prom, 0x100], ['blue.d6', prom, 0x200]];
  for (const [n, dst, off] of map) {
    let r = lib.find(n, 0, set, set); if (!r) for (const k in lib.sets) for (const x of lib.sets[k]) if (x.name === n) r = x;
    if (!r) { res.missing.push(n); continue; } dst.set((await lib.get(r)).subarray(0, dst.length - off), off); res.loaded.push(n);
  }
  const srom = sromFull.subarray(0, 0x1C00);
  srom[0x1805] = 0;                                   /* salta la prueba de firmas de ROM (como el port original) */
  /* gráficos: 3 planos (rom9 = bit 2, rom8 = bit 1, rom7 = bit 0); sprites 16×16 en cuadrantes TL TR BL BR */
  const T8 = new Uint8Array(1024 * 64), S16 = new Uint8Array(256 * 256);
  for (let pl = 0; pl < 3; pl++) {
    const bit = 2 - pl, base = pl * 0x2000;
    for (let t = 0; t < 1024; t++) for (let row = 0; row < 8; row++) { const by = gfx[base + t * 8 + row]; for (let col = 0; col < 8; col++) T8[t * 64 + row * 8 + col] |= ((by >> (7 - col)) & 1) << bit; }
    for (let t = 0; t < 256; t++) for (let row = 0; row < 16; row++) for (let col = 0; col < 16; col++) {
      const sub = ((row >> 3) * 2) + (col >> 3), by = gfx[base + t * 32 + sub * 8 + (row & 7)];
      S16[t * 256 + row * 16 + col] |= ((by >> (7 - (col & 7))) & 1) << bit;
    }
  }
  const pal = new Uint32Array(256);
  for (let i = 0; i < 256; i++) pal[i] = rgba((prom[i] & 15) * 17, (prom[256 + i] & 15) * 17, (prom[512 + i] & 15) * 17);
  const mram = new Uint8Array(0x800), tileRam = new Uint8Array(0x400), attrRam = new Uint8Array(0x400), sprRam = new Uint8Array(0x200), sram = new Uint8Array(0x400), aram = new Uint8Array(0x800);
  const M = { in0: 0, dsw1: 0x01, dsw2: 0x30, ovl: 0, latch1: 0, latch2: 0, slatch: 0, mode: 4, status: 0x80, digits: 0, last: -1, delay: 0 };
  const m = new Machine(), ldp = new LDP(29.97);
  const sn1 = makeSN76496(3072000, env.sampleRate), sn2 = makeSN76496(3072000, env.sampleRate);
  const DIG = { 0x3f: 0, 0x0f: 1, 0x8f: 2, 0x4f: 3, 0x2f: 4, 0xaf: 5, 0x6f: 6, 0x1f: 7, 0x9f: 8, 0x5f: 9 };
  const ldWrite = v => {
    if (v === M.last) return; M.last = v;                     /* el LD-V1000 latchea en la transición */
    if (v in DIG) { M.digits = M.digits * 10 + DIG[v]; return; }
    switch (v) {
      case 0xbf: M.digits = 0; break;
      case 0xf7: { let t = M.digits || ldp.frame; M.digits = 0; if (t > 108000) t %= 100000; M.mode = 3; M.delay = 12; M.status = 0x50; ldp.search(t, false); break; }
      case 0xfd: case 0xf3: M.mode = 1; M.status = 0xe4; ldp.play(); break;
      case 0xfb: M.mode = 2; M.status = 0xe5; ldp.pause(); break;
      case 0xf9: M.mode = 0; M.status = 0xfc; ldp.pause(); break;
    }
  };
  let cm, ca, cs;
  cm = m.addCPU(Z80CPU({
    rd: a => a < 0xA000 ? mrom[a] : a < 0xA800 ? mram[a - 0xA000] : a < 0xAC00 ? tileRam[a - 0xA800] : a < 0xB000 ? attrRam[a - 0xAC00] : a < 0xB200 ? sprRam[a - 0xB000] : 0xFF,
    wr: (a, v) => { if (a < 0xA000) return; if (a < 0xA800) mram[a - 0xA000] = v; else if (a < 0xAC00) tileRam[a - 0xA800] = v; else if (a < 0xB000) attrRam[a - 0xAC00] = v; else if (a < 0xB200) sprRam[a - 0xB000] = v; },
    in: p => { switch (p & 0xFF) { case 0: return M.in0; case 2: return M.dsw1; case 3: return M.dsw2; case 5: return M.latch1; } return 0xFF; },
    out: (p, v) => { switch (p & 0xFF) { case 2: M.slatch = v; break; case 4: M.ovl = v; break; case 5: M.latch2 = v; cs.nmi(); break; } }
  }), 3075000);
  ca = m.addCPU(Z80CPU({
    rd: a => a < 0x2000 ? arom[a] : (a >= 0x4000 && a < 0x4800) ? aram[a - 0x4000] : 0xFF,
    wr: (a, v) => { if (a >= 0x4000 && a < 0x4800) aram[a - 0x4000] = v; },
    in: p => { if ((p & 0xFF) === 0) { const v = M.slatch; M.slatch = 0; return v; } return 0xFF; },
    out: (p, v) => { const q = p & 0xFF; if (q === 1) sn1.write(bitrev8(v)); else if (q === 2) sn2.write(bitrev8(v)); }
  }), 3075000);
  cs = m.addCPU(Z80CPU({
    rd: a => a < 0x1C00 ? srom[a] : a < 0x2000 ? sram[a - 0x1C00] : a < 0xA000 ? mrom[a] : a === 0xC000 ? 0 : 0xFF,
    wr: (a, v) => { if (a >= 0x1C00 && a < 0x2000) sram[a - 0x1C00] = v; },
    in: p => { const q = p & 0xFF; return q === 0 ? M.status : q === 1 ? M.latch2 : 0; },
    out: (p, v) => { const q = p & 0xFF; if (q === 0) ldWrite(v); else if (q === 1) M.latch1 = v; }
  }), 3075000);
  [cm, ca, cs].forEach(c => c.reset());
  ldp.searchFields = 12;
  m.every(FIELD_US, () => {
    ldp.field();
    if (M.mode === 3) { if (--M.delay <= 0) { M.mode = 2; M.status = 0xd0; } }
    else if (M.mode === 1) M.status = 0xe4; else if (M.mode === 2) M.status = 0xe5; else if (M.mode === 4) M.status = 0x80;
    ca.nmi(); cm.irq(); cs.irq();
  });
  const W = 256, H = 256;
  let coinT = 0, startT = 0;
  return {
    name: set, fps: 29.97, ldp, m, res, ow: W, oh: H,
    get videoBlank() { return false; },
    runField() {
      if (coinT && --coinT === 0) M.dsw2 |= 0x20;
      if (startT && --startT === 0) M.dsw2 &= ~0x80;
      m.runUs(FIELD_US);
    },
    input(sw, d) {
      const b = bit => { M.in0 = d ? M.in0 | bit : M.in0 & ~bit; };
      switch (sw) {
        case SW.RIGHT: b(1); break; case SW.LEFT: b(2); break; case SW.UP: b(4); break; case SW.DOWN: b(8); break;
        case SW.BUTTON1: b(16); break; case SW.BUTTON2: b(32); break;
        case SW.COIN1: case SW.COIN2: if (d) { M.dsw2 &= ~0x20; cm.nmi(); coinT = 6; } break;      /* moneda: bit 5 de DSW2 a 0 + NMI */
        case SW.START1: if (d) { M.dsw2 |= 0x80; startT = 16; } break;
        case SW.SERVICE: M.dsw2 = d ? M.dsw2 | 0x08 : M.dsw2 & ~0x08; break;
      }
    },
    draw(buf) {
      buf.fill((typeof S !== 'undefined' && S.video && S.video.has) ? 0 : ((M.ovl & 0x80) ? rgba(0, 0, 255) : rgba(0, 0, 0)));
      for (let i = 0; i < 1024; i++) {
        const code = tileRam[i]; if (!code) continue;
        const col = attrRam[i] & 15, y0 = (i >> 5) * 8, x0 = (i & 31) * 8, tb = code * 64;
        for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 8; xx++) { const p = T8[tb + yy * 8 + xx]; if (p) buf[(y0 + yy) * W + x0 + xx] = pal[(col * 8 + p) & 255]; }
      }
      for (let i = 0; i < 512; i += 4) {
        const at = sprRam[i + 2]; if (at === 0xFF) continue;
        const y = 0xF0 - sprRam[i], x = sprRam[i + 3], code = sprRam[i + 1], col = at & 0x1F, fx = at & 0x40, sb = code * 256;
        for (let yy = 0; yy < 16; yy++) { const dy = y + yy; if (dy < 0 || dy >= H) continue;
          for (let xx = 0; xx < 16; xx++) { const dx = x + xx; if (dx < 0 || dx >= W) continue; const p = S16[sb + yy * 16 + (fx ? 15 - xx : xx)]; if (p) buf[dy * W + dx] = pal[(col * 8 + p) & 255]; } }
      }
    },
    sample() { return (sn1.sample() + sn2.sample()) * 0.5; },
    status() { return 'PC ' + cm.pc.toString(16).padStart(4, '0') + ' · 3× Z80 · LD-V1000 ' + M.status.toString(16); }
  };
}
DRIVERS.zangus = drvZangus;
