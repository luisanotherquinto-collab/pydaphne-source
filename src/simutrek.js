/* ==========================================================================
 *  Controlador de laserdisc Simutrek (Cube Quest): 8748 con su firmware
 *  (laser_player_interface_d8748_a308.bin) emulado a nivel de instrucción,
 *  hablando por la línea serie de control a un PR-8210 en HLE.
 *  Portado del comportamiento de MAME devices/machine/ldpr8210.cpp.
 * ========================================================================== */
'use strict';

function makeMCS48(rom, io) {
  const ram = new Uint8Array(64);
  const s = { a: 0, pc: 0, psw: 0x08, f1: 0, p1: 0xFF, p2: 0xFF, bus: 0xFF, t: 0, tf: 0, timerOn: 0, cntOn: 0, pre: 0,
    xirqEn: 0, tirqEn: 0, inIrq: 0, tirqPend: 0, irqLine: 0, mb: 0, total: 0 };
  const rb = () => (s.psw & 0x10) ? 0x18 : 0;
  const R = n => ram[rb() + n], setR = (n, v) => { ram[rb() + n] = v & 0xFF; };
  const fetch = () => { const v = rom[s.pc & 0x3FF]; s.pc = (s.pc & 0x800) | ((s.pc + 1) & 0x7FF); return v; };
  const push = () => { const sp = s.psw & 7; ram[8 + sp * 2] = s.pc & 0xFF; ram[9 + sp * 2] = (s.psw & 0xF0) | ((s.pc >> 8) & 15); s.psw = (s.psw & 0xF8) | ((sp + 1) & 7); };
  const pop = restore => { const sp = (s.psw - 1) & 7; s.psw = (s.psw & 0xF8) | sp; const hi = ram[9 + sp * 2]; s.pc = ((hi & 15) << 8) | ram[8 + sp * 2]; if (restore) s.psw = (hi & 0xF0) | (s.psw & 0x0F) | 0x08; };
  const add = (v, c) => { const r = s.a + v + c; s.psw = (s.psw & 0x3F) | (r > 0xFF ? 0x80 : 0) | (((s.a & 15) + (v & 15) + c) > 15 ? 0x40 : 0); s.a = r & 0xFF; };
  const jcond = (c) => { const lo = fetch(); if (c) s.pc = (s.pc & 0xF00) | lo; };
  const CY = s => (s.psw >> 7) & 1;
  function step() {
    if (!s.inIrq) {
      if (s.irqLine && s.xirqEn) { s.inIrq = 1; push(); s.pc = 3; return 2; }
      if (s.tirqPend && s.tirqEn) { s.tirqPend = 0; s.inIrq = 1; push(); s.pc = 7; return 2; }
    }
    const op = fetch(); let cyc = 1;
    const r = op & 7, ri = op & 1;
    switch (op) {
      case 0x00: break;
      case 0x02: s.bus = s.a; cyc = 2; break;
      case 0x03: add(fetch(), 0); cyc = 2; break;
      case 0x05: s.xirqEn = 1; break; case 0x15: s.xirqEn = 0; break;
      case 0x25: s.tirqEn = 1; break; case 0x35: s.tirqEn = 0; s.tirqPend = 0; break;
      case 0x07: s.a = (s.a - 1) & 0xFF; break; case 0x17: s.a = (s.a + 1) & 0xFF; break;
      case 0x08: s.a = io.bus(); cyc = 2; break;
      case 0x09: s.a = io.p1() & s.p1; cyc = 2; break;
      case 0x0A: s.a = io.p2() & s.p2; cyc = 2; break;
      case 0x10: case 0x11: { const ad = R(ri) & 63; ram[ad] = (ram[ad] + 1) & 0xFF; break; }
      case 0x13: add(fetch(), CY(s)); cyc = 2; break;
      case 0x16: { const t = s.tf; s.tf = 0; jcond(t); cyc = 2; break; }
      case 0x20: case 0x21: { const ad = R(ri) & 63, t = ram[ad]; ram[ad] = s.a; s.a = t; break; }
      case 0x23: s.a = fetch(); cyc = 2; break;
      case 0x26: jcond(!io.t0()); cyc = 2; break; case 0x36: jcond(io.t0()); cyc = 2; break;
      case 0x46: jcond(!io.t1()); cyc = 2; break; case 0x56: jcond(io.t1()); cyc = 2; break;
      case 0x27: s.a = 0; break; case 0x37: s.a ^= 0xFF; break;
      case 0x30: case 0x31: { const ad = R(ri) & 63, t = ram[ad]; ram[ad] = (t & 0xF0) | (s.a & 15); s.a = (s.a & 0xF0) | (t & 15); break; }
      case 0x39: s.p1 = s.a; io.w1(s.p1); cyc = 2; break;
      case 0x3A: s.p2 = s.a; io.w2(s.p2); cyc = 2; break;
      case 0x40: case 0x41: s.a |= ram[R(ri) & 63]; break;
      case 0x42: s.a = s.t; break;
      case 0x43: s.a |= fetch(); cyc = 2; break;
      case 0x45: s.cntOn = 1; s.timerOn = 0; break; case 0x55: s.timerOn = 1; s.cntOn = 0; s.pre = 0; break;
      case 0x65: s.timerOn = s.cntOn = 0; break;
      case 0x47: s.a = ((s.a << 4) | (s.a >> 4)) & 0xFF; break;
      case 0x50: case 0x51: s.a &= ram[R(ri) & 63]; break;
      case 0x53: s.a &= fetch(); cyc = 2; break;
      case 0x57: { let a = s.a; if ((a & 15) > 9 || (s.psw & 0x40)) { a += 6; if (a > 0xFF) s.psw |= 0x80; }
        if (((a >> 4) & 0x1F) > 9 || (s.psw & 0x80)) { a += 0x60; s.psw |= 0x80; } s.a = a & 0xFF; break; }
      case 0x60: case 0x61: add(ram[R(ri) & 63], 0); break;
      case 0x62: s.t = s.a; break;
      case 0x67: { const c = s.a & 1; s.a = (s.a >> 1) | (CY(s) << 7); s.psw = (s.psw & 0x7F) | (c << 7); break; }
      case 0x70: case 0x71: add(ram[R(ri) & 63], CY(s)); break;
      case 0x75: break;
      case 0x76: jcond(s.f1); cyc = 2; break; case 0xB6: jcond(s.psw & 0x20); cyc = 2; break;
      case 0x77: s.a = ((s.a >> 1) | (s.a << 7)) & 0xFF; break;
      case 0x80: case 0x81: s.a = io.bus(R(ri)); cyc = 2; break;
      case 0x90: case 0x91: io.busw(R(ri), s.a); cyc = 2; break;
      case 0x83: pop(false); cyc = 2; break;
      case 0x93: pop(true); s.inIrq = 0; cyc = 2; break;
      case 0x85: s.psw &= ~0x20; break; case 0x95: s.psw ^= 0x20; break;
      case 0x86: jcond(!s.irqLine); cyc = 2; break;
      case 0x88: s.bus |= fetch(); cyc = 2; break;
      case 0x89: s.p1 |= fetch(); io.w1(s.p1); cyc = 2; break;
      case 0x8A: s.p2 |= fetch(); io.w2(s.p2); cyc = 2; break;
      case 0x98: s.bus &= fetch(); cyc = 2; break;
      case 0x99: s.p1 &= fetch(); io.w1(s.p1); cyc = 2; break;
      case 0x9A: s.p2 &= fetch(); io.w2(s.p2); cyc = 2; break;
      case 0x96: jcond(s.a !== 0); cyc = 2; break; case 0xC6: jcond(s.a === 0); cyc = 2; break;
      case 0xE6: jcond(!CY(s)); cyc = 2; break; case 0xF6: jcond(CY(s)); cyc = 2; break;
      case 0x97: s.psw &= 0x7F; break; case 0xA7: s.psw ^= 0x80; break;
      case 0xA0: case 0xA1: ram[R(ri) & 63] = s.a; break;
      case 0xA3: s.a = rom[((s.pc & 0xF00) | s.a) & 0x3FF]; cyc = 2; break;
      case 0xE3: s.a = rom[(0x300 | s.a) & 0x3FF]; cyc = 2; break;
      case 0xA5: s.f1 = 0; break; case 0xB5: s.f1 ^= 1; break;
      case 0xB0: case 0xB1: ram[R(ri) & 63] = fetch(); cyc = 2; break;
      case 0xB3: s.pc = (s.pc & 0xF00) | rom[((s.pc & 0xF00) | s.a) & 0x3FF]; cyc = 2; break;
      case 0xC5: s.psw &= ~0x10; break; case 0xD5: s.psw |= 0x10; break;
      case 0xC7: s.a = s.psw | 0x08; break; case 0xD7: s.psw = s.a | 0x08; break;
      case 0xD0: case 0xD1: s.a ^= ram[R(ri) & 63]; break;
      case 0xD3: s.a ^= fetch(); cyc = 2; break;
      case 0xE5: s.mb = 0; break; case 0xF5: s.mb = 1; break;
      case 0xE7: s.a = ((s.a << 1) | (s.a >> 7)) & 0xFF; break;
      case 0xF7: { const c = s.a >> 7; s.a = ((s.a << 1) | CY(s)) & 0xFF; s.psw = (s.psw & 0x7F) | (c << 7); break; }
      case 0xF0: case 0xF1: s.a = ram[R(ri) & 63]; break;
      default:
        if ((op & 0x1F) === 0x04) { const lo = fetch(); s.pc = (s.mb << 11) | ((op & 0xE0) << 3) | lo; cyc = 2; break; }
        if ((op & 0x1F) === 0x14) { const lo = fetch(); push(); s.pc = (s.mb << 11) | ((op & 0xE0) << 3) | lo; cyc = 2; break; }
        if ((op & 0x1F) === 0x12) { jcond(s.a & (1 << (op >> 5))); cyc = 2; break; }
        if (op >= 0x18 && op <= 0x1F) { setR(r, R(r) + 1); break; }
        if (op >= 0xC8 && op <= 0xCF) { setR(r, R(r) - 1); break; }
        if (op >= 0x28 && op <= 0x2F) { const t = R(r); setR(r, s.a); s.a = t; break; }
        if (op >= 0x48 && op <= 0x4F) { s.a |= R(r); break; }
        if (op >= 0x58 && op <= 0x5F) { s.a &= R(r); break; }
        if (op >= 0x68 && op <= 0x6F) { add(R(r), 0); break; }
        if (op >= 0x78 && op <= 0x7F) { add(R(r), CY(s)); break; }
        if (op >= 0xA8 && op <= 0xAF) { setR(r, s.a); break; }
        if (op >= 0xB8 && op <= 0xBF) { setR(r, fetch()); cyc = 2; break; }
        if (op >= 0xD8 && op <= 0xDF) { s.a ^= R(r); break; }
        if (op >= 0xE8 && op <= 0xEF) { const v = (R(r) - 1) & 0xFF; setR(r, v); jcond(v !== 0); cyc = 2; break; }
        if (op >= 0xF8 && op <= 0xFF) { s.a = R(r); break; }
        if (op >= 0x0C && op <= 0x0F) { s.a = 0; cyc = 2; break; }
        /* MOVD/ORLD/ANLD P4-7 (8243) no conectados */
        if ((op >= 0x3C && op <= 0x3F) || (op >= 0x8C && op <= 0x9F)) { cyc = 2; break; }
    }
    if (s.timerOn) { s.pre += cyc; while (s.pre >= 32) { s.pre -= 32; s.t = (s.t + 1) & 0xFF; if (!s.t) { s.tf = 1; s.tirqPend = 1; } } }
    return cyc;
  }
  s.ram = ram; s.step = step;
  s.reset = () => { s.pc = 0; s.psw = 0x08; s.p1 = s.p2 = 0xFF; s.bus = 0xFF; s.xirqEn = s.tirqEn = s.inIrq = 0; s.timerOn = s.cntOn = 0; s.tf = 0; s.mb = 0; };
  return s;
}

/* interfaz Simutrek: el 68000 escribe comandos; el 8748 los traduce a la línea serie del PR-8210 */
class SimutrekLD {
  constructor(m, rom, ldp) {
    this.m = m; this.ldp = ldp; this.pr = new PR8210(ldp); this.data = 0; this.ready = true; this.p2 = 0xFF;
    this.acc = 0x5555; this.lastBit = -1e9; this.firstBit = -1e9; this.lastCmd = -1; this.lastCmdT = -1e9; this.log = [];
    const self = this;
    this.cpu = makeMCS48(rom, {
      bus: () => { self.ready = false; return self.data; },
      busw: () => {},
      p1: () => 0xFF, w1: () => {},
      p2: () => (self.ldp.status === LDP_SEARCHING || self.ldp.status === LDP_STOPPED) ? 0x00 : 0x80,
      w2: v => self.port2(v),
      t0: () => self.ready ? 1 : 0, t1: () => 0
    });
    this.cpu.reset();
    this.adapter = { total: 0, cur: 0, done: 0, get pc() { return self.cpu.pc; }, cycles() { return this.total + this.done; },
      run(n) { this.done = 0; while (this.done < n) this.done += self.cpu.step(); this.total += this.done; const d = this.done; this.done = 0; return d; } };
  }
  nowUs() { return this.m.timeUs + this.adapter.done / 0.4; }
  port2(v) {
    const prev = this.p2; this.p2 = v;
    if ((v ^ prev) & 0x20 && (v & 0x20)) this.serialEdge(this.nowUs());
    if (!(v & 0x10) && (prev & 0x10)) { const d = (v & 0x08) ? 1 : -1; this.ldp.frame = Math.max(1, this.ldp.frame + d); }
  }
  serialEdge(t) {
    const delta = t - this.lastBit; this.lastBit = t;
    if (t - this.firstBit > 25300 || delta > 9000) { this.firstBit = t; this.acc = 0x5555; }
    this.acc = ((this.acc << 1) | (delta < 1319 ? 0 : 1)) & 0xFFFF;
    if ((this.acc & 0x383) === 0x80) {
      const word = this.acc & 0x3FF, cmd = (word >> 2) & 0x1F;
      const dup = cmd === this.lastCmd && t < this.lastCmdT + 101000;
      this.lastCmdT = t;
      if (!dup) { this.lastCmd = cmd; this.pr.old = -1; this.pr.command(word); }
      if (this.log.length < 400) this.log.push((dup ? '(' : '') + cmd.toString(16) + (dup ? ')' : ''));
      this.firstBit = t - 25300;
    }
  }
  get status() { return (this.p2 & 3) === 3 ? 1 : 0; }
  write(v) { this.data = v & 0xFF; this.ready = true; }
  reset() { this.cpu.reset(); this.ready = true; this.pr.reset(); }
  vsync() { if (this.ready) { this.cpu.irqLine = 1; this.m.after(63.5, () => { this.cpu.irqLine = 0; }); } }
}
