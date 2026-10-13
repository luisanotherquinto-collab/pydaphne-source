/* ==========================================================================
 *  Quarter Horse (Electro-Sport 1983) — hardware de MAME misc/dwarfd.cpp:
 *  8085 + CRTC Intel 8275 alimentado por "DMA" del propio 8085 (RST 6.5 + SOD),
 *  AY-3-8910 y tiles 8×8 de 3 bits. El reproductor Pioneer lo mueve una placa
 *  aparte (LDP Ctrl, ROM -G_L-) que ni MAME emula: aquí corre la parte de juego.
 * ========================================================================== */
'use strict';
function make8275(onDrq, onIrq) {
  const T = { p: [0x4F, 0x18, 0x09, 0x40], np: 0, pi: 0, cmd: -1, status: 0, running: false, ie: false,
    rows: [], buf: [], want: 0, cur: 0, drq: 0 };
  const chars = () => (T.p[0] & 0x7F) + 1, rowsN = () => (T.p[1] & 0x3F) + 1, vret = () => ((T.p[1] >> 6) & 3) + 1, lines = () => (T.p[2] & 15) + 1;
  T.chars = chars; T.rowsN = rowsN; T.vret = vret; T.lines = lines;
  T.write = (a, v) => {
    if (a & 1) {
      switch (v >> 5) {
        case 0: T.np = 4; T.pi = 0; T.running = false; T.status &= ~0x44; break;       /* reset */
        case 1: T.running = true; T.status |= 0x04; T.ie = true; T.status |= 0x40; break; /* start display */
        case 2: T.running = false; T.status &= ~0x04; break;
        case 4: T.np = 2; T.pi = 10; break;                                               /* load cursor */
        case 5: T.ie = true; T.status |= 0x40; break;
        case 6: T.ie = false; T.status &= ~0x40; break;
      }
    } else if (T.np > 0) { if (T.pi < 4) T.p[T.pi] = v; T.pi++; T.np--; }
  };
  T.read = a => { if (a & 1) { const s = T.status; T.status &= ~0x21; onIrq(false); return s; } return 0; };
  T.startRow = r => { if (!T.running) return; T.cur = r; T.buf = []; T.want = chars(); T.drq = 1; onDrq(true); };
  T.dack = v => { if (!T.drq) return; T.buf.push(v); if (T.buf.length >= T.want) { T.drq = 0; onDrq(false); T.rows[T.cur] = T.buf; } };
  T.endFrame = () => { if (T.ie) { T.status |= 0x20; onIrq(true); } };
  return T;
}
const QH_ROMS = {
  quarterh: [['9l_qh_60-2402_7193.bin', 'mem', 0x0000], ['9k_qh_60-2401_8193.bin', 'mem', 0x1000], ['9j_qh_60-2400_9193.bin', 'mem', 0x2000], ['9h_qh_80-2399_10193.bin', 'mem', 0x3000]],
  quarterha: [['9l_qh_10-2402_7193.bin', 'mem', 0x0000], ['9k_qh_10-2401_8193.bin', 'mem', 0x1000], ['9j_qh_10-2400_9193.bin', 'mem', 0x2000], ['9h_qh_50-2399_10193.bin', 'mem', 0x3000]]
};
const window_DSW = () => { try { const v = JSON.parse(localStorage.getItem('ddn.qh.dsw')); if (v) return v; } catch (e) {} return [0xFF, 0xFF]; };
async function drvQuarterHorse(lib, set, env) {
  const mem = new Uint8Array(0x10000), ram = new Uint8Array(0x1000), gfx = new Uint8Array(0x4000), prom = new Uint8Array(0x40);
  const res = { missing: [], loaded: [] };
  const byName = n => { for (const k in lib.sets) for (const r of lib.sets[k]) if (r.name === n.toLowerCase()) return r; return null; };
  const get = async (name, s) => { const r = lib.find(name, 0, s || set, 'quarterh') || byName(name); if (!r) { res.missing.push(name); return null; } res.loaded.push(name); return lib.get(r); };
  if (set === 'quarterhb') {
    const a1 = await get('a1.bin'), a2 = await get('a2.bin'), a3 = await get('a3.bin'), p = await get('3a_50-1381_63s080n.bin');
    if (a1) mem.set(a1.subarray(0, 0x4000));
    const gd = new Uint8Array(0x8000); if (a2) for (let i = 0; i < 0x4000; i++) gd[i * 2 + 1] = a2[i]; if (a3) for (let i = 0; i < 0x4000; i++) gd[i * 2] = a3[i];
    gfx.set(gd.subarray(0, 0x800), 0x1000); gfx.set(gd.subarray(0x800, 0x1000), 0); gfx.set(gd.subarray(0x1000, 0x1800), 0x1800); gfx.set(gd.subarray(0x1800, 0x2000), 0x800);
    if (p) prom.set(p.subarray(0, 0x40));
  } else {
    for (const [n, , off] of QH_ROMS[set]) { const d = await get(n); if (d) mem.set(d.subarray(0, 0x1000), off); }
    const l16 = async (n, off) => { const d = await get(n, 'quarterh'); if (d) for (let i = 0; i < 0x800; i++) gfx[off + i * 2] = d[i]; };
    await l16('6a_qh_01-2395_14193.bin', 0x1000); await l16('6b_qh_01-2396_13193.bin', 0x0000); await l16('6c_qh_01-2397_12193.bin', 0x1001); await l16('6d_qh_01-2398_11193.bin', 0x0001);
    const p1 = await get('3a_bprom.bin', 'quarterh'); if (p1) prom.set(p1.subarray(0, 0x20));
  }
  const pal = new Uint32Array(32);
  for (let i = 0; i < 32; i++) {
    const v = prom[i], c = [((v & 8) >> 2) | (v & 1), ((v & 0x10) >> 3) | ((v & 2) >> 1), ((v & 0x20) >> 4) | ((v & 4) >> 2)].map(x => x | (x << 6) | (x << 4) | (x << 2));
    pal[i] = rgba(c[0], c[1], c[2]);
  }
  const m = new Machine(), ldp = new LDP(29.97);
  const IN = [0, 0], DSW = env.dsw || (window_DSW()) ;
  let crtAccess = 0, cpu;
  const ay = makeAY(1500000, env.sampleRate);
  const crtc = make8275(on => { if (on && !crtAccess) cpu.c.i65 = 1; else if (!on) cpu.c.i65 = 0; }, on => { cpu.c.i55 = on ? 1 : 0; });
  const ramBase = set === 'quarterhb' ? 0x4000 : 0x4000;
  cpu = m.addCPU(I8085CPU({
    rd: a => { if (a >= ramBase && a < ramBase + 0x1000) { const v = ram[a - ramBase]; if (crtAccess) crtc.dack(v); return v; } return mem[a]; },
    wr: (a, v) => { if (a >= ramBase && a < ramBase + 0x1000) ram[a - ramBase] = v; },
    sod: s => { crtAccess = s; },
    in: p => { switch (p) { case 0x01: return ay.readData ? ay.readData() : 0xFF; case 0x20: case 0x21: return crtc.read(p); case 0xC0: return DSW[0]; case 0xC1: return DSW[1]; case 0xE0: case 0xA0: return IN[0]; case 0xE1: case 0xA1: return IN[1]; } return 0xFF; },
    out: (p, v) => { switch (p) { case 0x02: ay.writeData(v); break; case 0x03: ay.writeAddr(v); break; case 0x20: case 0x21: crtc.write(p, v); break; } }
  }), 10595000 / 3 * 2 / 2);
  cpu.reset();
  /* un cuadro del 8275: una petición de DMA por fila y la IRQ al final */
  m.every(FIELD_US, () => {
    ldp.field();
    const n = crtc.rowsN(), per = FIELD_US / (n + crtc.vret() + 1);
    for (let r = 0; r < n; r++) m.after(r * per + 1, () => crtc.startRow(r));
    m.after(n * per + 2, () => crtc.endFrame());
  });
  const W = 640, H = 300;
  return {
    name: set, fps: 29.97, ldp, m, res, ow: W, oh: H, crtc,
    runField() { m.runUs(FIELD_US); },
    input(sw, d) {
      const b = (i, bit) => { IN[i] = d ? IN[i] | bit : IN[i] & ~bit; };
      switch (sw) {
        case SW.COIN1: b(1, 1); break; case SW.COIN2: b(1, 2); break; case SW.START1: b(1, 0x10); break;
        case SW.BUTTON1: b(0, 0x20); break; case SW.BUTTON2: b(0, 0x80); break; case SW.BUTTON3: b(1, 0x40); break;
        case SW.LEFT: b(0, 1); break; case SW.UP: b(0, 2); break; case SW.DOWN: b(0, 4); break; case SW.RIGHT: b(0, 8); break;
        case SW.SKILL1: b(0, 0x10); break; case SW.SERVICE: b(0, 0x40); break; case SW.START2: b(1, 0x80); break;
      }
    },
    draw(buf) {
      buf.fill(0);
      const cols = crtc.chars(), L = crtc.lines(), vis = !!(crtc.p[3] & 0x40) === false;
      for (let r = 0; r < crtc.rowsN(); r++) {
        const row = crtc.rows[r]; if (!row) continue;
        let gpa = 0, rvv = 0, vsp = 0, ended = false;
        for (let cx = 0; cx < cols && cx * 8 < W; cx++) {
          let code = row[cx] | 0, blank = ended;
          if (!ended && (code & 0xF0) === 0xF0) { ended = true; blank = true; }
          else if (!ended && (code & 0xC0) === 0x80) { gpa = (code >> 2) & 3; rvv = (code >> 4) & 1; vsp = (code >> 1) & 1; blank = true; }
          else if (code & 0x80) blank = true;
          const bank = ((gpa & 2) ? 0 : 4) + (gpa & 1) + (DSW[1] & 2), palbank = (rvv ? 2 : 0) + (vsp ? 1 : 0);
          for (let ln = 0; ln < L; ln++) {
            const y = r * L + ln; if (y >= H) break;
            const px = blank ? 0 : gfx[((ln & 7) + (((code & 0x7F) + bank * 128) << 3)) * 2] | (gfx[((ln & 7) + (((code & 0x7F) + bank * 128) << 3)) * 2 + 1] << 8);
            let back = false;
            for (let i = 0; i < 8; i += 2) {
              const pixel = (px >> (i * 2)) & 15, value = (pixel >> 1) | (palbank << 3), o = y * W + cx * 8 + i;
              const c0 = pal[value], c1 = pal[(pixel & 1) ? 0 : value];
              buf[o] = (c0 & 0xFFFFFF) ? c0 : 0; buf[o + 1] = (c1 & 0xFFFFFF) ? c1 : 0;
              if (back && i) buf[o - 1] = buf[o];
              back = !!(pixel & 1);
            }
          }
        }
      }
    },
    sample() { return ay.sample(); },
    status() { return 'PC ' + cpu.pc.toString(16).padStart(4, '0') + ' · 8085 + 8275 · ' + crtc.chars() + '×' + crtc.rowsN() + ' · sin placa LDP'; }
  };
}
DRIVERS.qhorse = drvQuarterHorse;
