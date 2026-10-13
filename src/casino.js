/* ==========================================================================
 *  Casino Strip X (Status Games 1988) — hardware de MAME misc/statriv2.cpp
 *  (casino_state): 8085, 8255, AY-3-8910, TMS9927 + tiles 8×15. El reproductor
 *  Sony se conecta a los puertos $28-$2B (MAME sólo lo deja como stub); aquí va
 *  un ACIA MOS 6551 ($28 datos, $29 estado, $2A comando, $2B control) hacia un Sony LDP (HLE, mismo protocolo que el LDP-1000/1450).
 * ========================================================================== */
'use strict';
async function drvCasinoStrip(lib, set, env) {
  const mem = new Uint8Array(0x10000), tiles = new Uint8Array(0x1000);
  const SETS = {
    cs10_sps: [['sastrip-x_1-9.5.u7', null, 'mem', '0x0000', 0x1000, '0xe66a5def'], ['sastrip-x_2-9.5.u8', null, 'mem', '0x1000', 0x1000, '0xba20f780'],
      ['sastrip-x_3-9.5.u9', null, 'mem', '0x2000', 0x1000, '0xc44358fe'], ['sastrip_0.u36', null, 'tiles', '0x0000', 0x1000, '0x4c9d995e']],
    cs12_sps: [['sonystrip-xi_1-4.1.u7', null, 'mem', '0x0000', 0x1000, '0xb076330c'], ['sonystrip-xi_2-4.1.u8', null, 'mem', '0x1000', 0x1000, '0xb77bfb85'],
      ['sonystrip-xi_3-4.5.u9', null, 'mem', '0x2000', 0x1000, '0x1d32a970'], ['sastrip-xii_0.u36', null, 'tiles', '0x0000', 0x1000, '0']],
    cs11_ssp: [['cs_11_ssp.u7', null, 'mem', '0x0000', 0x1000, '0xf51ad73e'], ['cs_11_ssp.u8', null, 'mem', '0x1000', 0x1000, '0xd9715d46'],
      ['cs_11_ssp.u36', null, 'tiles', '0x0000', 0x1000, '0xe31560ee']]
  };
  const defs = SETS[set] || SETS.cs10_sps;
  const res = await lib.loadSet(set, defs, { mem, tiles });
  for (let i = 0; i < 0x1000; i++) tiles[i] ^= 0xFF;
  try { const s = localStorage.getItem('ddn.nv.' + set); if (s) mem.set(JSON.parse(s), 0x4800); } catch (e) {}
  const m = new Machine(), ldp = new LDP(29.97), sony = new LDP1000(ldp, m);
  /* versiones Pioneer (csN_xxp): interfaz paralela tipo LD-V1000 en $E8-$EB —
     $EA latch de comando, $E9 estado, $EB bit 5 = strobe de estado del reproductor */
  const pioneer = /p$/.test(set), ldv = pioneer ? new LDV1000(ldp, {}) : null;
  let eaLatch = 0xFF, strobeLow = false;
  const IN = [0xFF, 0xFF & ~0x04 | 0x04, 0x0F];
  const io = {}; let portC = 0xFF, latched = 0, lastCoin = 0, coin = 0, ayLatch = 0, uartMode = true, uStat = 0x05, ldLog = [];
  const ay = makeAY(12440000 / 8, env.sampleRate);
  const pal = new Uint32Array(128);
  for (let i = 0; i < 64; i++) { const b = (v, n) => ((v >> n) & 1) * 255; pal[2 * i] = rgba(b(i, 2), b(i, 0), b(i, 1)); pal[2 * i + 1] = rgba(b(i, 5), b(i, 3), b(i, 4)); }
  const cpu = m.addCPU(I8085CPU({
    rd: a => a < 0x4000 ? mem[a] : mem[a],
    wr: (a, v) => { if (a >= 0x4000) mem[a] = v; },
    sod: b => { io.sod = (io.sod || 0) + 1; }, sid: () => { io.sid = (io.sid || 0) + 1; return 1; },
    in: p => {
      io['i' + p.toString(16)] = (io['i' + p.toString(16)] || 0) + 1;
      switch (p) {
        case 0x20: return IN[0];
        case 0x21: return (IN[1] & ~0x0C) | (coin & 1 ? 0 : 0x04) | (coin & 2 ? 0 : 0x08);   /* el manejador de RST 7.5 lee los monederos en crudo y espera a que se suelten */
        case 0x22: return IN[2] | 0xF0;
        case 0xE9: return ldv ? ldv.read() : 0xFF;
        case 0xEB: return strobeLow ? 0xDF : 0xFF;
        case 0x28: return sony.read();
        case 0x29: return 0x10 | (sony.ready ? 0x08 : 0);   /* MOS 6551: TDRE | RDRF */
        case 0xB1: return ay.readData ? ay.readData() : 0xFF;
      }
      return 0xFF;
    },
    out: (p, v) => {
      io['o' + p.toString(16)] = (io['o' + p.toString(16)] || 0) + 1; if (p >= 0x28 && p <= 0x2B && ldLog.length < 300) ldLog.push(p.toString(16) + ':' + v.toString(16));
      switch (p) {
        case 0x22: portC = v; if ((portC >> 4) !== 0x0F) latched = 0; break;
        case 0x23: if (!(v & 0x80)) { const bit = (v >> 1) & 7; portC = (v & 1) ? portC | (1 << bit) : portC & ~(1 << bit); if (bit >= 4 && (portC >> 4) !== 0x0F) latched = 0; } break;
        case 0xEA: eaLatch = v; break;
        case 0x28: sony.write(v); break;
        case 0x29: break;
        case 0xB0: ayLatch = v; ay.writeAddr(v); break;
        case 0xB1: ay.writeData(v); break;
      }
    }
  }), 12440000 / 2);
  cpu.reset();
  let fcount = 0;
  m.every(FIELD_US, () => {
    sony.field();
    if (ldv) { strobeLow = true; m.after(1000, () => { strobeLow = false; }); m.after(8000, () => ldv.write(eaLatch)); }
    const edge = coin & (coin ^ lastCoin); latched |= edge; lastCoin = coin;
    if (edge) cpu.c.r75 = 1;   /* RST 7.5 = monedero (el vector $003C es la rutina de crédito) */
    if (++fcount % 600 === 0) { try { localStorage.setItem('ddn.nv.' + set, JSON.stringify(Array.from(mem.subarray(0x4800, 0x4900)))); } catch (e) {} }
  });
  const W = 320, H = 240;   /* MAME: 320 visibles de los 64 tiles por fila */
  return {
    name: set, fps: 29.97, ldp, m, res, ow: W, oh: H, ldLog, io,
    /* Q W E R T = descartes 1-5, S = select (tienen prioridad sobre los atajos del receptor) */
    keymap: { KeyQ: SW.DISCARD1, KeyW: SW.DISCARD2, KeyE: SW.DISCARD3, KeyR: SW.DISCARD4, KeyT: SW.DISCARD5,
      Numpad1: SW.DISCARD1, Numpad2: SW.DISCARD2, Numpad3: SW.DISCARD3, Numpad4: SW.DISCARD4, Numpad5: SW.DISCARD5,
      KeyS: SW.START2, KeyD: SW.BUTTON1, Space: SW.BUTTON1, Enter: SW.BUTTON2, NumpadEnter: SW.BUTTON2, KeyP: SW.BUTTON2, KeyX: SW.BUTTON2,
      KeyC: SW.BUTTON3, KeyH: SW.BUTTON3 },
    runField() { m.runUs(FIELD_US); },
    input(sw, d) {
      if (typeof cabinetLamp === 'function') cabinetLamp(sw, d);
      const b = (i, bit) => { IN[i] = d ? IN[i] & ~bit : IN[i] | bit; };
      switch (sw) {
        case SW.COIN1: coin = d ? coin | 1 : coin & ~1; break;
        case SW.COIN2: coin = d ? coin | 2 : coin & ~2; break;
        /* panel real (MAME funcsino): PLAY=b0 · START/Deal=b1 · DEAL-DRAW=b2 · DISCARD 1-5=b3-b7 · Stand=IN1 b0 · SELECT=IN1 b1 */
        case SW.BUTTON2: b(0, 0x01); break;
        case SW.START1: b(0, 0x02); break;
        case SW.BUTTON1: b(0, 0x04); break;
        case SW.DISCARD1: case SW.LEFT: b(0, 0x08); break;
        case SW.DISCARD2: case SW.UP: b(0, 0x10); break;
        case SW.DISCARD3: case SW.DOWN: b(0, 0x20); break;
        case SW.DISCARD4: case SW.RIGHT: b(0, 0x40); break;
        case SW.DISCARD5: case SW.SKILL1: b(0, 0x80); break;
        case SW.BUTTON3: b(1, 0x01); break;
        case SW.START2: b(1, 0x02); break;
      }
    },
    typeKey(e) { const map = { Digit1: 0x08, Digit2: 0x10, Digit3: 0x20, Digit4: 0x40, Digit5: -1, KeyQ: 0x08, KeyW: 0x10, KeyE: 0x20, KeyR: 0x40, KeyT: 0x80 }; return false; },
    draw(buf) {
      buf.fill(0);
      for (let r = 0; r < 16; r++) for (let cx = 0; cx < 40; cx++) {
        const i = r * 64 + cx, code = mem[0xCC00 + i], attr = mem[0xC800 + i] & 0x3F;
        const fg = pal[attr * 2 + 1], bg = pal[attr * 2];
        for (let y = 0; y < 15; y++) {
          const yy = r * 15 + y; if (yy >= H) break;
          const bits = tiles[(code * 16 + y) & 0xFFF];
          for (let x = 0; x < 8; x++) { const on = bits & (0x80 >> x); const col = on ? fg : bg; buf[yy * W + cx * 8 + x] = (col & 0xFFFFFF) ? col : 0; }
        }
      }
    },
    sample() { return ay.sample(); },
    status() { return 'PC ' + cpu.pc.toString(16).padStart(4, '0') + ' · 8085 · ' + (pioneer ? 'Pioneer LD' : 'Sony LD'); }
  };
}
DRIVERS.casinostrip = drvCasinoStrip;
