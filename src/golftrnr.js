/* ==========================================================================
 *  Golf Trainer / Golf Analyzer (Atari 1984) — FANGAME / reconstrucción de
 *  Luis (driver golftrnr.cpp). Del prototipo sólo sobrevivieron el laserdisc y
 *  la descripción: era para proyector, golpeando una pelota de golf real.
 *  Hardware recreado: placa Return of the Jedi (136030) + Philips 22VP931 como
 *  Fire Fox. El playfield no sale al monitor: sólo tiñe el texto; el genlock
 *  muestra el disco donde alfanuméricos y motion objects valen 0.
 * ========================================================================== */
'use strict';
async function drvGolfTrainer(lib, set, env) {
  const main = new Uint8Array(0x1C000), aud = new Uint8Array(0x10000), tx = new Uint8Array(0x2000), bg = new Uint8Array(0x10000), spr = new Uint8Array(0x20000);
  const defs = [['gtr-101.14f', main, 0x8000], ['gtr-102.13f', main, 0xC000], ['gtr-103.13d', main, 0x10000], ['gtr-104.13b', main, 0x14000], ['gtr-105.13a', main, 0x18000],
    ['gtr-106.01c', aud, 0x8000], ['gtr-107.01a', aud, 0xC000], ['gtr-108.11t', tx, 0], ['gtr-109.06r', bg, 0], ['gtr-110.06n', bg, 0x8000],
    ['gtr-111.01h', spr, 0], ['gtr-112.01f', spr, 0x8000], ['gtr-113.01m', spr, 0x10000], ['gtr-114.01k', spr, 0x18000]];
  const res = { missing: [], loaded: [] };
  for (const [n, dst, off] of defs) {
    let r = lib.find(n, 0, 'golftrnr', 'golftrnr'); if (!r) for (const k in lib.sets) for (const x of lib.sets[k]) if (x.name === n) r = x;
    if (!r) { res.missing.push(n); continue; } const d = await lib.get(r); dst.set(d.subarray(0, Math.min(d.length, dst.length - off)), off); res.loaded.push(n);
  }
  const ram = new Uint8Array(0x800), aram = new Uint8Array(0x800), bgram = new Uint8Array(0x800), pal = new Uint8Array(0x400), palx = new Uint8Array(0x400), fg = new Uint8Array(0x7C0), sprram = new Uint8Array(0x440);
  const nv = new Uint8Array(0x100).fill(0xFF);
  try { const s = localStorage.getItem('ddn.nv.golftrnr'); if (s) nv.set(JSON.parse(s)); } catch (e) {}
  const m = new Machine(), ldp = new LDP(29.97), vp = new VP931(ldp);
  ldp.squelchSearch = true;
  { const ex = vp.exec.bind(vp); vp.exec = c => { const hi = c[0] & 0xF0; if ((hi === 0xF0 || hi === 0xD0) && (c[0] & 15) > 3) c = [hi | (c[0] & 3), c[1], c[2]];   /* disco de 32578 cuadros: el bit 2 del primer dígito no es parte del número */
      ex(c); if (ldp.status === LDP_SEARCHING) { ldp.frame = ldp.target; ldp.frac = 0; if (vp.playAfter) { ldp.status = LDP_PLAYING; ldp.speedNum = ldp.speedDen = 1; vp.playAfter = false; } else ldp.status = LDP_PAUSED; } }; }   /* búsqueda instantánea: el attract salta a un cuadro distinto en cada campo */   /* el attract encadena búsquedas: el 22VP931 tiene que ser rápido */
  const pk = [0, 1, 2, 3].map(() => makePOKEY(12096000 / 8, env.sampleRate));
  let bank = 0, vscroll = 0, hscroll = 0, outl = 0, discLatch = 0, discRead = 0, vblank = false;
  let sl = 0, slp = false, sk = 0, skp = false, in0 = 0xFF, nvDirty = 0, cpu, snd;
  const outBit = b => (outl >> b) & 1;
  const setOut = (b, v) => {
    const prev = outBit(b); outl = v ? outl | (1 << b) : outl & ~(1 << b);
    if (prev === v) return;
    if (b === 3 && !v) vp.write(discLatch);                    /* WRDSK activo en bajo */
    if (b === 5) vp.reset(!v);                                  /* /RSTDSK */
    if (b === 6) { snd.held = !v; if (v) snd.reset(); }         /* reset de la CPU de sonido */
  };
  const rd = a => {
    if (a < 0x800) return ram[a];
    if (a < 0x0C00) return nv[a & 0xFF];
    if (a < 0x1000) return (a & 1) ? (0x03 | 0x18 | (slp ? 0x40 : 0) | (skp ? 0x20 : 0) | (vblank ? 0x80 : 0)) : in0;
    if (a < 0x1400) { if (a & 1) return discRead; let r = 0xFF ^ 0x20; if (vp.dav) r ^= 0x80; return r; }
    if (a < 0x1800) { skp = false; return sk; }
    if (a < 0x2000) return 0xFF;
    if (a < 0x2800) return bgram[a - 0x2000];
    if (a < 0x2C00) return pal[a - 0x2800];
    if (a < 0x3000) return palx[a - 0x2C00];
    if (a < 0x37C0) return fg[a - 0x3000];
    if (a < 0x3C00) return sprram[a - 0x37C0];
    if (a < 0x4000) return 0xFF;
    if (a < 0x8000) return main[0x10000 + bank * 0x4000 + (a - 0x4000)];
    return main[a];
  };
  const wr = (a, v) => {
    if (a < 0x800) { ram[a] = v; return; }
    if (a < 0x0C00) { nv[a & 0xFF] = v; nvDirty = 1; return; }
    if (a >= 0x1000 && a < 0x1400) { if (a & 1) { discRead = vp.read(); if (vp.dav) m.after(60, () => cpu.nmi()); } else discLatch = v; return; }
    if (a >= 0x1E00 && a < 0x1E80) { cpu.irq(false); return; }
    if (a >= 0x1E80 && a < 0x1F00) { setOut(a & 7, (v >> 7) & 1); return; }
    if (a >= 0x1F00 && a < 0x1F80) { sl = v; slp = true; return; }
    if (a >= 0x1F80 && a < 0x2000) { if (v & 1) bank = 0; if (v & 2) bank = 1; if (v & 4) bank = 2; return; }
    if (a >= 0x2000 && a < 0x2800) { bgram[a - 0x2000] = v; return; }
    if (a >= 0x2800 && a < 0x2C00) { pal[a - 0x2800] = v; return; }
    if (a >= 0x2C00 && a < 0x3000) { palx[a - 0x2C00] = v; return; }
    if (a >= 0x3000 && a < 0x37C0) { fg[a - 0x3000] = v; return; }
    if (a >= 0x37C0 && a < 0x3C00) { sprram[a - 0x37C0] = v; return; }
    if (a >= 0x3C00 && a < 0x3D00) { vscroll = v | ((a & 1) << 8); return; }
    if (a >= 0x3D00 && a < 0x3E00) { hscroll = v | ((a & 1) << 8); return; }
  };
  const ard = a => {
    if (a < 0x800) return aram[a];
    if (a < 0x1000) return pk[(a >> 4) & 3].read(a & 15);
    if (a >= 0x1800 && a < 0x1C00) { slp = false; return sl; }
    if (a >= 0x1C00 && a < 0x2000) return (a & 1) ? ((slp ? 0x80 : 0) | (skp ? 0x40 : 0)) : 0x00;   /* TMS5220 siempre listo */
    if (a >= 0x8000) return aud[a];
    return 0xFF;
  };
  const awr = (a, v) => {
    if (a < 0x800) { aram[a] = v; return; }
    if (a < 0x1000) { pk[(a >> 4) & 3].write(a & 15, v); return; }
    if (a >= 0x1000 && a < 0x1100) { snd.irq(false); return; }
    if (a >= 0x1400 && a < 0x1500) { sk = v; skp = true; return; }
  };
  cpu = m.addCPU(M6502CPU(rd, wr), 2500000);
  snd = m.addCPU(M6502CPU(ard, awr), 1512000);
  cpu.reset(); snd.reset(); snd.held = true;
  const LINE = FIELD_US / 262;
  let fc = 0;
  m.every(FIELD_US, () => {
    if (vp.field()) cpu.nmi();                                  /* /DAV → NMI */
    vblank = false;
    for (let line = 32; line <= 256; line += 32) {
      const assert = !(line & 32);
      m.after(line * LINE, () => { cpu.irq(assert); if (!snd.held) snd.irq(assert); });
    }
    m.after(240 * LINE, () => { vblank = true; });
    if (nvDirty && ++fc % 120 === 0) { nvDirty = 0; try { localStorage.setItem('ddn.nv.golftrnr', JSON.stringify(Array.from(nv))); } catch (e) {} }
  });
  const W = 296, H = 240, pix = new Uint16Array(W * H);
  const pen = p => { const raw = pal[p] | ((palx[p] & 15) << 8), i = (raw >> 9) & 7; return rgba(5 * ((raw >> 6) & 7) * i, 5 * ((raw >> 3) & 7) * i, 5 * (raw & 7) * i); };
  return {
    name: set, fps: 29.97, ldp, m, res, ow: W, oh: H, vp,
    get videoBlank() { return false; },
    runField() { m.runUs(FIELD_US); },
    input(sw, d) {
      const b = bit => { in0 = d ? in0 & ~bit : in0 | bit; };
      switch (sw) {
        case SW.BUTTON1: case SW.START1: b(0x04); break;          /* golpe */
        case SW.COIN1: b(0x80); break; case SW.COIN2: b(0x40); break;
        case SW.SERVICE: b(0x20); break; case SW.TEST: b(0x10); break;
      }
    },
    draw(buf) {
      if (outBit(7)) { buf.fill(rgba(0, 0, 0)); return; }
      const fgBank = outBit(4), genlock = outBit(2);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x += 2) {
        const sy = (y + vscroll) & 0x1FF; let sx = (x + hscroll) & 0x1FF;
        const tc = (fgBank << 8) | fg[((y & 0xF8) << 3) | (x >> 3)];
        const bo = ((sy & 0x1F0) << 1) | ((sx & 0x1F0) >> 4), bb = bgram[0x400 | bo];
        const bcode = bgram[bo] | ((bb & 1) << 8) | ((bb & 8) << 6) | ((bb & 2) << 9);
        if (bb & 4) sx ^= 0x0F;
        const td = tx[((tc << 4) | ((y & 7) << 1) | ((x & 4) >> 2)) & 0x1FFF];
        const go = ((bcode << 4) | (sy & 0x0E) | ((sx & 8) >> 3)) & 0x7FFF, b1 = bg[go], b2 = bg[0x8000 | go];
        let t1, t2, bc = 0;
        if (x & 2) { t1 = (td & 0x0C) << 6; t2 = (td & 0x03) << 8; } else { t1 = (td & 0xC0) << 2; t2 = (td & 0x30) << 4; }
        switch (sx & 6) {
          case 0: bc = ((b1 & 0x80) >> 4) | ((b1 & 8) >> 1) | ((b2 & 0x80) >> 6) | ((b2 & 8) >> 3); break;
          case 2: bc = ((b1 & 0x40) >> 3) | (b1 & 4) | ((b2 & 0x40) >> 5) | ((b2 & 4) >> 2); break;
          case 4: bc = ((b1 & 0x20) >> 2) | ((b1 & 2) << 1) | ((b2 & 0x20) >> 4) | ((b2 & 2) >> 1); break;
          case 6: bc = ((b1 & 0x10) >> 1) | ((b1 & 1) << 2) | ((b2 & 0x10) >> 3) | (b2 & 1); break;
        }
        pix[y * W + x] = t1 | bc; pix[y * W + x + 1] = t2 | bc;
      }
      for (let o = 0; o < 0x30; o++) {
        let y = (240 - sprram[o + 0x80] + 1) & 0xFF; const fl = sprram[o + 0x40], fx = fl & 0x10, fy = fl & 0x20, tall = fl & 8;
        let code = sprram[o] | ((fl & 4) << 8) | ((fl & 0x40) << 3) | ((fl & 2) << 7), ys = 16;
        if (tall) { code &= ~1; ys = 32; y = (y - 16) & 0xFF; }
        let g = (code << 5) & 0xFFFF; if (fy) y = (y + ys - 1) & 0xFF;
        for (let r = 0; r < ys; r++) {
          let x = sprram[o + 0x100] + ((fl & 1) << 8) - 2; if (fx) x += 7;
          for (let i = 0; i < 2; i++) {
            let d1 = spr[g & 0xFFFF], d2 = spr[0x10000 | (g & 0xFFFF)];
            for (let k = 0; k < 4; k++) {
              const col = (d1 & 0x80) | ((d1 & 8) << 3) | ((d2 & 0x80) >> 2) | ((d2 & 8) << 1);
              x &= 0x1FF; if (col && x < W && y < H) pix[y * W + x] = (pix[y * W + x] & 0x30F) | col;
              x = fx ? x - 1 : x + 1; d1 = (d1 << 1) & 0xFF; d2 = (d2 << 1) & 0xFF;
            }
            g++;
          }
          y = (fy ? y - 1 : y + 1) & 0xFF;
        }
      }
      for (let i = 0; i < W * H; i++) { const p = pix[i]; buf[i] = (genlock && !(p & 0x3F0)) ? 0 : pen(p & 0x3FF); }
    },
    sample() { return (pk[0].sample() + pk[1].sample() + pk[2].sample() + pk[3].sample()) * 0.35; },
    status() { return 'PC ' + cpu.pc.toString(16).padStart(4, '0') + ' · 22VP931 · ' + (vp.log.slice(-1)[0] || ''); }
  };
}
DRIVERS.golftrnr = drvGolfTrainer;
