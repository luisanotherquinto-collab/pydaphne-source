/* ==========================================================================
 *  Time Traveler (Virtual Image Productions / Sega 1991) — portado del driver
 *  MAME sega/timetrv.cpp: 80188 (con temporizadores y controlador de
 *  interrupciones internos), 2× 8255, NS16450 hacia un Pioneer LD-V4200 (HLE
 *  de MAME ldv4200hle.cpp), EEPROM 2816, display de 16 caracteres y DAC de 1 bit.
 * ========================================================================== */
'use strict';
class LDV4200 {
  constructor(ldp, m, send) { this.ldp = ldp; this.m = m; this.send = send; this.buf = ''; this.pending = null; this.mark = -1; this.log = []; }
  rx(ch) {
    if (ch === 0x0D) { const b = this.buf.toUpperCase(); this.buf = ''; this.process(b); return; }
    if (this.buf.length < 64) this.buf += String.fromCharCode(ch);
  }
  reply(s) { this.m.after(3000, () => this.send(s + '\r')); }
  process(b) {
    const L = this.ldp; if (this.log.length < 200) this.log.push(b);
    let i = 0, running = false;
    while (i < b.length) {
      let num = null; const mm = b.slice(i).match(/^\d{1,7}/); if (mm) { num = +mm[0]; i += mm[0].length; }
      const cmd = b.substr(i, 2); i += 2;
      switch (cmd) {
        case 'SA': L.pause(); break;
        case 'PL': L.play(); if (num !== null) { this.mark = num; this.pending = 'mark'; running = true; } break;
        case 'PA': case 'ST': L.pause(); break;
        case 'SF': L.stepForward(); break; case 'SR': L.stepBackward(); break;
        case 'MF': L.changeSpeed(1, 1); if (num !== null) { this.mark = num; this.pending = 'mark'; running = true; } break;
        case 'SE': L.search(num || 0, false); this.pending = 'search'; running = true; break;
        case 'SM': this.mark = num === null ? -1 : num; break;
        case 'AD': if (num !== null) { L.audio1 = !!(num & 1); L.audio2 = !!(num & 2); } break;
        case 'VD': this.video = num !== 0; break;
        case '?F': this.reply(String(L.curFrame).padStart(5, '0')); return;
        case '?P': this.reply('P0' + (L.status === LDP_PLAYING ? 4 : 5)); return;
        case '?X': this.reply('P1537'); return;
        default: break;
      }
    }
    if (!running) this.reply('R');
  }
  field() {
    const L = this.ldp; L.field();
    if (this.pending === 'search' && L.status === LDP_PAUSED) { this.pending = null; this.reply('R'); }
    else if (this.mark >= 0 && L.status === LDP_PLAYING && L.curFrame >= this.mark) { L.pause(); this.mark = -1; if (this.pending === 'mark') { this.pending = null; this.reply('R'); } }
  }
}

async function drvTimeTraveler(lib, set, env) {
  const rom = new Uint8Array(0x40000), ram = new Uint8Array(0x10000), eep = new Uint8Array(0x800);
  const rec = lib.find('tt061891.bin', 0xa3d44219, 'timetrv', null);
  const res = { missing: [], loaded: [] };
  if (rec) { rom.set((await lib.get(rec)).subarray(0, 0x40000)); res.loaded.push('tt061891.bin'); } else res.missing.push('tt061891.bin');
  try { const s = localStorage.getItem('ddn.nv.timetrv'); if (s) eep.set(JSON.parse(s)); } catch (e) {}
  const m = new Machine(), ldp = new LDP(29.97);
  const in0 = { v: 0xFF }, in1 = { v: 0xFF }, dsw = [0x04, 0x84, 0x7F];
  const led = new Uint8Array(16).fill(0x20);
  let dac = 0, lamps = 0, eepDirty = 0, lastScore = 0;
  /* UART NS16450 */
  const U = { rx: [], lcr: 0, ier: 0, mcr: 0, scr: 0, dll: 0, dlm: 0 };
  const ld = new LDV4200(ldp, m, s => { for (const ch of s) U.rx.push(ch.charCodeAt(0)); });
  const uartR = r => {
    const dlab = U.lcr & 0x80;
    switch (r) {
      case 0: return dlab ? U.dll : (U.rx.length ? U.rx.shift() : 0);
      case 1: return dlab ? U.dlm : U.ier;
      case 2: return U.rx.length && (U.ier & 1) ? 0x04 : 0x01;
      case 3: return U.lcr; case 4: return U.mcr;
      case 5: return (U.rx.length ? 1 : 0) | 0x60;
      case 6: return 0xB0; case 7: return U.scr;
    }
  };
  const uartW = (r, v) => {
    const dlab = U.lcr & 0x80;
    switch (r) { case 0: if (dlab) U.dll = v; else ld.rx(v); break; case 1: if (dlab) U.dlm = v; else U.ier = v; break;
      case 3: U.lcr = v; break; case 4: U.mcr = v; break; case 7: U.scr = v; break; }
  };
  /* bloque de periféricos del 80188 */
  const T = [0, 1, 2].map(() => ({ cnt: 0, maxA: 0, maxB: 0, ctl: 0, riu: 0, out: 0 }));
  const PIC = { imask: 0xFD, primsk: 7, inserv: 0, req: 0, tcucon: 0x0F, pend: [0, 0, 0] };
  let sub = 0;
  const tExpire = i => {
    const t = T[i];
    if (t.ctl & 0x2000) { PIC.pend[i] = 1; PIC.req |= 1; }
    if (t.ctl & 0x0002) { t.riu ^= 1; t.ctl = (t.ctl & ~0x1000) | (t.riu << 12); t.out = t.riu; if (!t.riu && !(t.ctl & 1)) t.ctl &= ~0x8000; }
    else { t.out ^= 1; if (!(t.ctl & 1)) t.ctl &= ~0x8000; }
    if (i === 0) dac = t.out;
    if (i === 2) { for (const k of [0, 1]) if ((T[k].ctl & 0x8000) && (T[k].ctl & 0x08)) tick(k); }
  };
  const tick = i => {
    const t = T[i], max = (t.ctl & 2) && t.riu ? t.maxB : t.maxA;
    t.cnt = (t.cnt + 1) & 0xFFFF;
    if (t.cnt === (max || 0x10000) % 0x10000 || (max === 0 && t.cnt === 0)) { t.cnt = 0; tExpire(i); }
  };
  const clockTimers = n => {
    sub += n; const ticks = sub >> 2; sub &= 3;
    for (let k = 0; k < ticks; k++) {
      for (let i = 0; i < 3; i++) { const t = T[i]; if (!(t.ctl & 0x8000)) continue; if (i < 2 && (t.ctl & 0x0C)) continue; tick(i); }
    }
  };
  const pcbR = o => {
    switch (o) {
      case 0x28: return PIC.imask; case 0x2A: return PIC.primsk; case 0x2C: return PIC.inserv; case 0x2E: return PIC.req; case 0x32: return PIC.tcucon;
      case 0x50: return T[0].cnt; case 0x52: return T[0].maxA; case 0x54: return T[0].maxB; case 0x56: return T[0].ctl;
      case 0x58: return T[1].cnt; case 0x5A: return T[1].maxA; case 0x5C: return T[1].maxB; case 0x5E: return T[1].ctl;
      case 0x60: return T[2].cnt; case 0x62: return T[2].maxA; case 0x66: return T[2].ctl;
      case 0xFE: return relocVal;
    }
    return 0;
  };
  const pcbW = (o, v) => {
    const tc = (t, v) => { const keep = t.ctl & 0x1000; t.ctl = (v & 0x4000) ? (v & ~0x1000) | keep : (t.ctl & 0x8000) | (v & 0x7FFF & ~0x1000) | keep; };
    switch (o) {
      case 0xFE: relocVal = v; pcbBase = (v & 0xFFF) << 8; break;
      case 0x22: if (v & 0x8000 || (v & 0x1F) === 8 || (v & 0x1F) === 0x12 || (v & 0x1F) === 0x13) PIC.inserv &= ~1; break;
      case 0x28: PIC.imask = v; PIC.tcucon = (PIC.tcucon & ~8) | ((v & 1) << 3); break; case 0x2A: PIC.primsk = v; break;
      case 0x32: PIC.tcucon = v; PIC.imask = (PIC.imask & ~1) | ((v >> 3) & 1); break;
      case 0x50: T[0].cnt = v; break; case 0x52: T[0].maxA = v; break; case 0x54: T[0].maxB = v; break; case 0x56: tc(T[0], v); break;
      case 0x58: T[1].cnt = v; break; case 0x5A: T[1].maxA = v; break; case 0x5C: T[1].maxB = v; break; case 0x5E: tc(T[1], v); break;
      case 0x60: T[2].cnt = v; break; case 0x62: T[2].maxA = v; break; case 0x66: tc(T[2], v); break;
    }
  };
  const ppi = [{ ctl: 0x9B, c: 0 }, { ctl: 0x9B, c: 0 }];
  const ioR = p => {
    p &= 0xFFFF;
    if (inPcb(p)) return pcbR(p & 0xFE) >> ((p & 1) * 8) & 0xFF;
    if (p >= 0x1000 && p <= 0x1003) return [in0.v, in1.v, ppi[0].c, ppi[0].ctl][p & 3];
    if (p >= 0x1080 && p <= 0x1083) return [dsw[0], dsw[1], dsw[2], ppi[1].ctl][p & 3];
    if (p >= 0x1100 && p <= 0x1107) return uartR(p & 7);
    if (p >= 0x1180 && p <= 0x1187) return led[p & 7];
    if (p >= 0x1200 && p <= 0x1207) return led[8 + (p & 7)];
    return 0xFF;
  };
  const ioW = (p, v) => {
    p &= 0xFFFF; v &= 0xFF;
    if (p >= 0x1000 && p <= 0x1003) { const r = p & 3; if (r === 2) { ppi[0].c = v; lamps = v; } else if (r === 3) { if (v & 0x80) ppi[0].ctl = v; else { const b = (v >> 1) & 7; ppi[0].c = (v & 1) ? ppi[0].c | (1 << b) : ppi[0].c & ~(1 << b); lamps = ppi[0].c; } } return; }
    if (p >= 0x1080 && p <= 0x1083) { if ((p & 3) === 3 && (v & 0x80)) ppi[1].ctl = v; return; }
    if (p >= 0x1100 && p <= 0x1107) { uartW(p & 7, v); return; }
    if (p >= 0x1180 && p <= 0x1187) { led[p & 7] = v & 0x3F; return; }
    if (p >= 0x1200 && p <= 0x1207) { led[8 + (p & 7)] = v & 0x3F; return; }
  };
  let pcbBase = 0xFF00, relocVal = 0x20FF;
  const inPcb = p => ((p & 0xFFFF) & 0xFF00) === pcbBase;
  const bus = {
    is186: true,
    r8: a => { if (a < 0x10000) return ram[a]; if (a < 0x10800) return eep[a - 0x10000]; if (a >= 0xC0000) return rom[a - 0xC0000]; return 0xFF; },
    w8: (a, v) => { if (a < 0x10000) ram[a] = v; else if (a < 0x10800) { eep[a - 0x10000] = v; eepDirty = 1; } },
    in: p => ioR(p), out: (p, v) => { if (inPcb(p)) { pcbW((p & 0xFE), v); return; } ioW(p, v); },
    in16: p => inPcb(p) ? pcbR(p & 0xFE) : ioR(p) | (ioR(p + 1) << 8),
    out16: (p, v) => { if (inPcb(p)) pcbW(p & 0xFE, v & 0xFFFF); else { ioW(p, v & 0xFF); ioW(p + 1, v >> 8); } }
  };
  const cpu = m.addCPU(X86CPU(bus), 8000000);
  cpu.reset();
  const origRun = cpu.run;
  cpu.run = n => {
    const d = origRun(n); clockTimers(d);
    if (PIC.req && !(PIC.inserv & 1) && !(PIC.imask & 1) && !(PIC.tcucon & 8) && cpu.c.iff) {
      const i = PIC.pend.findIndex(x => x);
      if (i >= 0) { PIC.pend[i] = 0; if (!PIC.pend.some(x => x)) PIC.req &= ~1; PIC.inserv |= 1; cpu.c.intr([8, 0x12, 0x13][i]); }
    }
    return d;
  };
  m.sliceUs = 100;
  let saveCnt = 0;
  m.every(FIELD_US, () => { ld.field(); if (eepDirty && ++saveCnt % 120 === 0) { eepDirty = 0; try { localStorage.setItem('ddn.nv.timetrv', JSON.stringify(Array.from(eep))); } catch (e) {} } });
  const ledChar = c => c === 0x20 ? ' ' : String.fromCharCode(c < 0x20 ? c + 0x40 : c);
  return {
    name: set, fps: 29.97, ldp, m, res, ow: 320, oh: 240, ld,
    get marquee() { return Array.from(led, ledChar).join(''); },
    get score() { const m = /SCORE1?\s*(\d+)/.exec(Array.from(led, ledChar).join('')); if (m) lastScore = +m[1]; return lastScore; },
    get videoBlank() { return ld.video === false; },
    runField() { m.runUs(FIELD_US); },
    input(sw, d) {
      const a = bit => { in0.v = d ? in0.v & ~bit : in0.v | bit; }, b = bit => { in1.v = d ? in1.v & ~bit : in1.v | bit; };
      switch (sw) {
        case SW.UP: a(1); break; case SW.DOWN: a(2); break; case SW.LEFT: a(4); break; case SW.RIGHT: a(8); break;
        case SW.START1: a(0x10); break; case SW.START2: a(0x20); break; case SW.COIN1: a(0x40); break; case SW.COIN2: a(0x80); break;
        case SW.BUTTON1: b(0x10); break; case SW.BUTTON2: b(0x20); break; case SW.SERVICE: b(0x40); break;
      }
    },
    draw(buf) { buf.fill(0); },
    sample() { return dac ? 0.15 : -0.15; },
    _dbg() { return JSON.stringify({ T: T.map(t => [t.cnt, t.maxA, t.maxB, t.ctl.toString(16)]), PIC: { im: PIC.imask.toString(16), tc: PIC.tcucon.toString(16), is: PIC.inserv, rq: PIC.req, p: PIC.pend }, iff: cpu.c.iff }); },
    status() { return 'CS:IP ' + cpu.c.S[1].toString(16) + ':' + cpu.c.ip.toString(16) + ' · 80188 · LD-V4200'; }
  };
}
DRIVERS.timetrv = drvTimeTraveler;
