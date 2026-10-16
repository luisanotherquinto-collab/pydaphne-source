/* ==========================================================================
 *  Laser Grand Prix (Taito 1983) — nativo, según el driver lgp.cpp corregido
 *  de Luis (ingeniería inversa del programa principal):
 *   - A02-41 es programa en $8000; A02-06..13 son 4 juegos de datos de pista
 *     leídos por ventana (EF88 alto, EF90 bajo, EF00 dato)
 *   - placa OBJ: lista de 8 objetos en E400 (X, Y, zoom, attr, 4 celdas 32×32
 *     → objeto 64×64), celdas de 5 bpp en A02-19..28
 *   - paleta: A02-34 rojo, A02-33 verde, A02-31 azul; tiles en la fila
 *     0x80 + ((EFE0>>3)&7)*16, página de tiles = EFE0 & 7
 *   - NMI = vblank habilitada por EFD8 bit 7; IRQ = strobe de estado del LD-V1000
 *   - dos CDP1855 en los puertos FC-FF (multiplicar/dividir de 16 bits)
 *   - sonido: Z80 + AY-3-8910 en 8400-8407 (mapa del recompilador de Luis)
 * ========================================================================== */
'use strict';
async function drvLGP(lib, set, env) {
  const res = { missing: [], loaded: [] };
  const alt = set === 'lgpalt';
  const prog = new Uint8Array(0xA000), snd = new Uint8Array(0x4000), data = new Uint8Array(0x20000), tiles = new Uint8Array(0x10000), obj = new Uint8Array(0x28000), prom = new Uint8Array(0x300);
  const pick = async (name, dst, off, size) => {
    let r = null;
    for (const s of [set, 'lgp', 'lgpalt']) { r = (lib.sets[s] || []).find(x => x.name === name); if (r) break; }
    if (!r) for (const k in lib.sets) { r = lib.sets[k].find(x => x.name === name); if (r) break; }
    if (!r) { res.missing.push(name); return; }
    dst.set((await lib.get(r)).subarray(0, size), off); res.loaded.push(name);
  };
  const a = n => alt ? n + 'a' : n;
  await pick(a('a02_01') + '.bin', prog, 0x0000, 0x2000); await pick(a('a02_02') + '.bin', prog, 0x2000, 0x2000);
  await pick(a('a02_03') + '.bin', prog, 0x4000, 0x2000); await pick(a('a02_04') + '.bin', prog, 0x6000, 0x2000);
  await pick(a('a02_41') + '.bin', prog, 0x8000, 0x2000);
  await pick('a02_29.bin', snd, 0, 0x2000); await pick('a02_30.bin', snd, 0x2000, 0x2000);
  for (let i = 0; i < 8; i++) await pick('a02_' + String(6 + i).padStart(2, '0') + '.bin', data, i * 0x4000, 0x4000);
  for (let i = 0; i < 4; i++) await pick(a('a02_' + (14 + i)) + '.bin', tiles, i * 0x4000, 0x4000);
  for (let i = 0; i < 10; i++) await pick('a02_' + (19 + i) + '.bin', obj, i * 0x4000, 0x4000);
  await pick('a02_31.bin', prom, 0x000, 0x100); await pick('a02_33.bin', prom, 0x100, 0x100); await pick('a02_34.bin', prom, 0x200, 0x100);
  /* paleta: A02-31 azul, A02-33 verde, A02-34 rojo */
  const pal = new Uint32Array(256);
  for (let i = 0; i < 256; i++) pal[i] = rgba((prom[0x200 + i] & 15) * 17, (prom[0x100 + i] & 15) * 17, (prom[i] & 15) * 17);
  /* tiles 8×8 de 4 planos (A02-14 = bit 3 … A02-17 = bit 0), 2048 códigos */
  const T = new Uint8Array(2048 * 64);
  for (let t = 0; t < 2048; t++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    let v = 0; for (let p = 0; p < 4; p++) if (tiles[p * 0x4000 + t * 8 + y] & (0x80 >> x)) v |= 8 >> p; T[t * 64 + y * 8 + x] = v;
  }
  /* celdas OBJ 32×32 de 5 bpp: códigos 00-7F en A02-24..28 (0x14000), 80-FF en A02-19..23 */
  const C = new Uint8Array(256 * 1024);
  for (let code = 0; code < 256; code++) {
    const base = code < 128 ? 0x14000 : 0, c = code & 0x7F;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      let v = 0; for (let k = 0; k < 5; k++) if (obj[base + k * 0x4000 + c * 128 + y * 4 + (x >> 3)] & (0x80 >> (x & 7))) v |= 0x10 >> k;
      C[(code * 32 + y) * 32 + x] = v;
    }
  }
  const ram = new Uint8Array(0x1000), wram = new Uint8Array(0x3C0), tram = new Uint8Array(0x400), oram = new Uint8Array(0x40), sram = new Uint8Array(0x400), shs = new Uint8Array(4);
  let winHi = 0, winLo = 0, efe0 = 0, efd8 = 0, slatch = 0;
  const md = new Uint16Array(3), mseq = [0, 0, 0];
  const IN = { efe0: 0, efd8: 0, steer: 0, pedal: 0x78, dswa: 0xFF, dswb: 0xFF, dswc: 0xFF };
  /* ---- LD-V1000 (HLE del recompilador) ---- */
  const ldp = new LDP(29.97);
  const ST_PARK = 0x7C, ST_PLAY = 0x64, ST_STOP = 0x65, ST_SEARCH = 0x50, ST_SEARCH_FIN = 0xD0, ST_READY = 0x80;
  let ldStatus = ST_PARK | ST_READY, ldMode = 0, ldNum = [], ldDelay = 0;
  const NUMS = { 0x3F: 0, 0x0F: 1, 0x8F: 2, 0x4F: 3, 0x2F: 4, 0xAF: 5, 0x6F: 6, 0x1F: 7, 0x9F: 8, 0x5F: 9 };
  const ldWrite = c => {
    if (c === 0xFF) { ldStatus |= ST_READY; return; }
    if (!(ldStatus & ST_READY)) return;
    ldStatus &= ~ST_READY;
    if (c in NUMS) { if (ldNum.length < 8) ldNum.push(NUMS[c]); return; }
    switch (c) {
      case 0xFD: ldMode = 1; ldStatus = ST_PLAY; ldp.play(); break;
      case 0xFB: ldMode = 3; ldStatus = ST_STOP; ldp.pause(); break;
      case 0xF7: { let v = 0; for (const d of ldNum) v = v * 10 + d; ldMode = 2; ldStatus = ST_SEARCH; ldDelay = 6; ldp.search(v || 1, false); break; }
      case 0xF6: ldp.step && ldp.step(1); ldMode = 3; ldStatus = ST_STOP; break;
      case 0xFE: ldp.step && ldp.step(-1); ldMode = 3; ldStatus = ST_STOP; break;
      case 0xF9: ldMode = 0; ldStatus = ST_PARK; ldp.pause(); break;
    }
    ldNum = [];
  };
  ldp.searchFields = 6;
  const m = new Machine();
  const ay = [0, 1, 2, 3].map(() => makeAY(1500000, env.sampleRate));
  let cpu, scpu;
  const rd = a => {
    if (a < 0xA000) return prog[a];
    if (a >= 0xF000) return ram[a - 0xF000];
    if (a >= 0xE000 && a < 0xE400) return tram[a - 0xE000];
    if (a >= 0xE400 && a < 0xE440) return oram[a - 0xE400];
    if (a >= 0xE440 && a < 0xE800) return wram[a - 0xE440];
    if ((a & 0xFF00) === 0xEF00) switch (a & 0xF8) {
      case 0x00: return data[((winHi << 8) | winLo) & 0x1FFFF];
      case 0x80: return ldStatus;
      case 0x88: return winHi;
      case 0xB8: return 0xFF;                      /* watchdog */
      case 0xC0: return IN.dswa; case 0xC8: return IN.dswb; case 0xD0: return IN.dswc;
      case 0xD8: return IN.efd8; case 0xE0: return IN.efe0;
      case 0xE8: return IN.steer & 0xFF; case 0xF0: return IN.pedal;
    }
    return 0xFF;
  };
  const wr = (a, v) => {
    if (a >= 0xF000) { ram[a - 0xF000] = v; return; }
    if (a >= 0xE000 && a < 0xE400) { tram[a - 0xE000] = v; return; }
    if (a >= 0xE400 && a < 0xE440) { oram[a - 0xE400] = v; return; }
    if (a >= 0xE440 && a < 0xE800) { wram[a - 0xE440] = v; return; }
    if ((a & 0xFF00) === 0xEF00) switch (a & 0xF8) {
      case 0x80: ldWrite(v); break;
      case 0x88: winHi = v; break;
      case 0x90: winLo = v; break;
      case 0x98: slatch = v; scpu.nmi(); break;      /* comando de sonido → NMI del Z80 de sonido */
      case 0xD8: efd8 = v; break;
      case 0xE0: efe0 = v; break;
    }
  };
  /* dos CDP1855 en cascada: X, Y, Z de 16 bits; FF = control */
  const io = {
    in: p => { const o = (p & 0xFF) - 0xFC; if (o < 0 || o > 2) return 0xFF; const v = md[o], r = mseq[o] ? v & 0xFF : v >> 8; mseq[o] ^= 1; return r; },
    out: (p, v) => {
      const q = p & 0xFF;
      if (q >= 0xFC && q <= 0xFE) { const o = q - 0xFC; md[o] = mseq[o] ? (md[o] & 0xFF00) | v : (md[o] & 0x00FF) | (v << 8); mseq[o] ^= 1; return; }
      if (q === 0xFF) {
        mseq[0] = mseq[1] = mseq[2] = 0; if (v & 4) md[1] = 0; if (v & 8) md[2] = 0;
        if ((v & 3) === 1) { const r = md[0] * md[1] + md[2]; md[2] = (r >>> 16) & 0xFFFF; md[1] = r & 0xFFFF; }
        else if ((v & 3) === 2) { const num = ((md[2] << 16) >>> 0) + md[1]; if (!md[0]) { md[1] = md[2] = 0xFFFF; } else { const qq = Math.floor(num / md[0]); md[2] = num % md[0]; md[1] = Math.min(qq, 0xFFFF); } }
      }
    }
  };
  cpu = m.addCPU(Z80CPU({ rd, wr, in: io.in, out: io.out }), 4000000);
  scpu = m.addCPU(Z80CPU({
    rd: a => a < 0x4000 ? snd[a] : (a >= 0x8000 && a < 0x8400) ? sram[a - 0x8000] : a === 0x8800 ? slatch : (a > 0x8800 && a < 0x8804) ? shs[a - 0x8800] : 0xFF,
    wr: (a, v) => { if (a >= 0x8000 && a < 0x8400) sram[a - 0x8000] = v; else if (a >= 0x8400 && a < 0x8408) { const c = ay[(a >> 1) & 3]; if (a & 1) c.writeData(v); else c.writeAddr(v); } else if (a > 0x8800 && a < 0x8804) shs[a - 0x8800] = v; },
    in: () => 0xFF, out: () => {}
  }), 3000000);
  cpu.reset(); scpu.reset();
  m.every(FIELD_US, () => {
    ldp.field();
    if (ldMode === 2 && ldDelay && --ldDelay === 0) { ldMode = 3; ldStatus = ST_SEARCH_FIN; }
    if (efd8 & 0x80) cpu.nmi();                    /* vblank */
    cpu.irq();                                     /* strobe de estado del LD-V1000 (el manejador lee/escribe EF80) */
    scpu.irq();                                    /* IRQ periódica de 60 Hz del sonido */
  });
  const keys = {}; let ana = null, coinT = 0, aAcc = 0;
  const W = 256, H = 256;
  const G = {
    name: set, fps: 29.97, ldp, res, ow: W, oh: H, players: 1,
    get videoBlank() { return false; },
    runField() {
      /* volante con signo: centro 0, ±0x40 */
      const target = ana != null ? ana : keys.L ? 0x40 : keys.R ? -0x40 : 0;
      IN.steer += Math.sign(target - IN.steer) * Math.min(8, Math.abs(target - IN.steer));
      IN.pedal = keys.D ? 0xC0 : 0x78;
      IN.efd8 = (keys.S ? 0x04 : 0) | (keys.U || keys.B1 ? 0x10 : 0) | (keys.B2 ? 0x40 : 0) | (keys.SV ? 0x02 : 0) | (keys.CLR ? 0x08 : 0);
      if (coinT > 0) { coinT--; IN.efe0 = coinT > 4 ? (IN.efe0 | keys.coinBits) : 0; } else IN.efe0 = 0;
      m.runUs(FIELD_US);
    },
    analog(x) { ana = Math.round((0.5 - x / W) * 0x80); },
    input(sw, d) {
      const k = { [SW.LEFT]: 'L', [SW.RIGHT]: 'R', [SW.UP]: 'U', [SW.DOWN]: 'D', [SW.BUTTON1]: 'B1', [SW.BUTTON2]: 'B2', [SW.START1]: 'S', [SW.SERVICE]: 'SV', [SW.TEST]: 'CLR' }[sw];
      if (k) { keys[k] = d; if (k === 'L' || k === 'R') ana = null; }
      if (d && (sw === SW.COIN1 || sw === SW.COIN2)) { keys.coinBits = sw === SW.COIN1 ? 1 : 2; coinT = 10; }
    },
    gamepad(seat, gp) {
      if (seat) return; let x = gp.axes[0] || 0; if (Math.abs(x) < 0.12) x = 0;
      ana = Math.round(-x * 0x40); const bt = n => !!(gp.buttons[n] && gp.buttons[n].pressed);
      keys.B1 = bt(0) || bt(7); keys.B2 = bt(1) || bt(6); keys.D = bt(2); if (bt(9)) keys.S = true; else if (keys.S && !bt(9)) keys.S = false;
    },
    draw(buf) {
      buf.fill(0);
      /* objetos (detrás de los tiles): 4 celdas → 64×64, zoom aproximado (tablas A02-39/40 pendientes) */
      for (let n = 7; n >= 0; n--) {
        const o = n * 8, at = oram[o + 3]; if ((at & 3) === 3 || oram[o + 1] >= 0xF0) continue;
        const scale = 1 - (oram[o + 2] & 0x3F) / 64, size = Math.max(1, Math.round(64 * scale)), x0 = (at & 1) ? oram[o] - 256 : oram[o];
        for (let yy = 0; yy < size; yy++) {
          const sy = (oram[o + 1] + yy) & 0xFF; if (sy < 8 || sy > 247) continue;
          const srcy = Math.min(63, (yy / scale) | 0), q0 = (srcy >> 5) * 2, cy = srcy & 31;
          for (let xx = 0; xx < size; xx++) {
            const sx = x0 + xx; if (sx < 0 || sx > 255) continue;
            let srcx = Math.min(63, (xx / scale) | 0); if (at & 0x40) srcx = 63 - srcx;
            const code = oram[o + 4 + q0 + (srcx >> 5)], pix = C[(code * 32 + cy) * 32 + (srcx & 31)];
            if (pix) buf[sy * W + sx] = pal[pix];
          }
        }
      }
      const page = (efe0 & 7) * 256, cbase = 0x80 + ((efe0 >> 3) & 7) * 16;
      for (let ty = 1; ty < 31; ty++) for (let tx = 0; tx < 32; tx++) {
        const tb = (page + tram[ty * 32 + tx]) * 64;
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const p = T[tb + y * 8 + x]; if (p) buf[(ty * 8 + y) * W + tx * 8 + x] = pal[cbase + p]; }
      }
    },
    sample() { return (ay[0].sample() + ay[1].sample() + ay[2].sample() + ay[3].sample()) * 0.25; },
    status() { return 'Z80 PC ' + cpu.pc.toString(16).padStart(4, '0') + ' · LD-V1000 ' + ldStatus.toString(16) + ' cuadro ' + ldp.frame; }
  };
  return G;
}
DRIVERS.lgp = drvLGP;
