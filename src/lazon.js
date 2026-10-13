/* ==========================================================================
 *  LAZON (South Gate 1983) — FANGAME / reconstrucción LZ-R1 de Luis.
 *  Sólo sobrevive el videodisco CED; el programa y la placa son recreados
 *  (driver de referencia lazon.cpp): placa principal tipo Thayer's Quest
 *  (Z80 4 MHz IM1, NVRAM 8 KB con récords "SGL"), expansión gráfica TMS9128
 *  con genlock (color 0 = imagen del CED), SN76489, Votrax SC-01A y un
 *  reproductor industrial RCA SJT400 por puerto paralelo (bandas de 4 cuadros).
 * ========================================================================== */
'use strict';
class SJT400 {
  constructor() { this.st = 0; this.target = 0; this.frame = 0; this.latched = 0; this.odd = 0; this.seekFields = 0; this.log = []; }
  command(c) {
    if (c === 1 && this.st === 0) this.st = 1;
    else if (c === 2 && this.st === 1) this.st = 0;
    else if (c === 3) { this.seekFields = Math.round(18 + Math.abs(this.target * 4 - this.frame) / 4 * 0.00011 * 59.94); this.st = 2; }
    if (this.log.length > 60) this.log.shift(); this.log.push(['', 'PLAY', 'PAUSA', 'BUSCA ' + this.target][c] || c.toString(16));
  }
  status() { this.latched = this.frame; return 0x01 | 0x08 | (this.st === 1 ? 0x02 : 0) | (this.st === 2 ? 0x04 : 0); }
  band() { return this.latched >> 2; }
  field() { return ((this.latched & 3) << 1) | this.odd; }
  vblank() {
    this.odd ^= 1;
    if (this.st === 2 && --this.seekFields <= 0) { this.frame = this.target * 4; this.st = 0; }
    else if (this.st === 1 && !this.odd) this.frame++;
  }
  /* interfaz para DiscVideo */
  get status_() { return 0; }
  get fps() { return 29.97; } get speedNum() { return 1; } get speedDen() { return 1; }
  get audio1() { return this.st === 1; } get audio2() { return this.st === 1; }
}
async function drvLazon(lib, set, env) {
  const rom = new Uint8Array(0x8000), exp = new Uint8Array(0x2000), nv = new Uint8Array(0x2000), res = { missing: [], loaded: [] };
  const take = async (n, dst) => { let r = lib.find(n, 0, 'lazon', 'lazon'); if (!r) for (const k in lib.sets) for (const x of lib.sets[k]) if (x.name === n) r = x; if (!r) { res.missing.push(n); return; } dst.set((await lib.get(r)).subarray(0, dst.length)); res.loaded.push(n); };
  await take('lz_u33.bin', rom); await take('lz_u1.bin', exp);
  try { const s = localStorage.getItem('ddn.nv.lazon'); if (s) { const b = atob(s); for (let i = 0; i < b.length && i < nv.length; i++) nv[i] = b.charCodeAt(i); } } catch (e) {}
  const vrec = lib.find('sc01a.bin', 0xfc416227, 'votrsc01a', null);
  const vtx = vrec ? new VotraxSC01(await lib.get(vrec), 720000) : null;
  let vReady = true; if (vtx) vtx.onAR = () => { vReady = true; };
  const m = new Machine(), vdp = makeTMS9918(), sn = makeSN76496(3579545, env.sampleRate), ced = new SJT400();
  const IN1 = { v: 0xFF }, SYS = { v: 0xFF }, DSW1 = 0x19, DSW2 = 0x01;
  let cpu, vdpIrq = false, nvDirty = 0, vAcc = 0, vLast = 0;
  const ldp = {
    get frame() { return ced.st === 2 ? ced.target * 4 : ced.frame; }, frac: 0,
    get status() { return ced.st === 1 ? LDP_PLAYING : ced.st === 2 ? LDP_SEARCHING : LDP_PAUSED; },
    get target() { return ced.target * 4; }, fps: 29.97, speedNum: 1, speedDen: 1, squelchSearch: true,
    get audio1() { return ced.st === 1; }, get audio2() { return ced.st === 1; }, get curFrame() { return ced.frame; }, log: ced.log
  };
  const upd = () => cpu.irq(vdpIrq);
  cpu = m.addCPU(Z80CPU({
    rd: a => a < 0x8000 ? rom[a] : a < 0xA000 ? exp[a - 0x8000] : a < 0xC000 ? nv[a - 0xA000] : 0xFF,
    wr: (a, v) => { if (a >= 0xA000 && a < 0xC000) { nv[a - 0xA000] = v; nvDirty = 1; } },
    in: p => {
      switch (p & 0xFF) {
        case 0x00: return IN1.v; case 0x01: return DSW1; case 0x02: return (SYS.v & 0x7F) | (vReady ? 0x80 : 0); case 0x03: return DSW2;
        case 0xA0: return vdp.readData();
        case 0xA1: { const r = vdp.readStatus(); vdpIrq = false; upd(); return r; }
        case 0xF0: return ced.status(); case 0xF1: return ced.band() & 0xFF; case 0xF2: return ced.band() >> 8; case 0xF3: return ced.field();
      }
      return 0xFF;
    },
    out: (p, v) => {
      switch (p & 0xFF) {
        case 0x40: sn.write(v); break;
        case 0x60: if (vtx) { vReady = false; vtx.inflection = v >> 6; vtx.write(v & 0x3F); } break;
        case 0xA0: vdp.writeData(v); break;
        case 0xA1: vdp.writeCtrl(v); break;
        case 0xF0: ced.command(v); break;
        case 0xF1: ced.target = (ced.target & 0xFF00) | v; break;
        case 0xF2: ced.target = (ced.target & 0x00FF) | (v << 8); break;
      }
    }
  }), 4000000);
  cpu.irqHold = false; cpu.reset();
  let fc = 0;
  m.every(1e6 / 59.94, () => {
    if (vdp.vblank()) { vdpIrq = true; upd(); ced.vblank(); }
    if (nvDirty && ++fc % 180 === 0) { nvDirty = 0; try { let s = ''; for (const b of nv) s += String.fromCharCode(b); localStorage.setItem('ddn.nv.lazon', btoa(s)); } catch (e) {} }
  });
  const pal = TMS_PAL.map(c => rgba(c[0], c[1], c[2]));
  return {
    name: set, fps: 29.97, ldp, m, res, ow: 256, oh: 192, ced,
    get videoBlank() { return ced.st !== 1; },
    get score() { return 0; },
    runField() { m.runUs(FIELD_US); },
    input(sw, d) {
      const b = (o, bit) => { o.v = d ? o.v & ~bit : o.v | bit; };
      switch (sw) {
        case SW.UP: b(IN1, 1); break; case SW.DOWN: b(IN1, 2); break; case SW.LEFT: b(IN1, 4); break; case SW.RIGHT: b(IN1, 8); break;
        case SW.BUTTON1: b(IN1, 0x10); break; case SW.START1: b(IN1, 0x20); break;
        case SW.COIN1: b(SYS, 1); break; case SW.COIN2: b(SYS, 2); break; case SW.SERVICE: b(SYS, 4); break;
      }
    },
    draw(buf) {
      const pix = vdp.render(), bd = vdp.reg[7] & 15, ext = vdp.reg[0] & 1;
      for (let i = 0; i < 256 * 192; i++) { let c = pix[i]; if (c === 0) c = bd; buf[i] = c === 0 ? (ext ? 0 : rgba(0, 0, 0)) : pal[c]; }
    },
    sample() {
      let s = sn.sample() * 0.5;
      if (vtx) { vAcc += vtx.sclock / env.sampleRate; while (vAcc >= 1) { vAcc -= 1; vLast = vtx.next(); } s += vLast * 1.2; }
      return s;
    },
    status() { return 'PC ' + cpu.pc.toString(16).padStart(4, '0') + ' · CED ' + ['PAUSA', 'PLAY', 'BUSCA'][ced.st] + ' banda ' + (ced.frame >> 2) + ' (cuadro ' + ced.frame + ')' + (vtx ? ' · Votrax' : ''); }
  };
}
DRIVERS.lazon = drvLazon;
