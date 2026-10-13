'use strict';
const COPSCORE = (function () {
/* COPS (Nova Productions / Atari Games, 1994) - hardware emulation.
 *
 * Direct port of the Python reference implementation in ../ :
 *   M6502   - NMOS core, passes Klaus Dormann's functional test
 *   VIA6522 - three of them (steer/sound, light guns, CD-ROM)
 *   R65C52  - dual ACIA, serial link to the laserdisc player
 *   LDP1450 - Sony player HLE including the User Index character generator
 *   CDU33A  - Sony CD-ROM, protocol reverse engineered from the program ROM
 *
 * Two fixes relative to MAME's cops.cpp, without which the ROM never boots:
 *   - the DACIA powers up with TDRE set, otherwise the transmit routine at
 *     $3160 spins forever and the board reports "LDP COMM 0",
 *   - the DACIA interrupt is not inverted into the NMI, otherwise the NMI
 *     arrives after the received byte has already been read.
 */


/* ============================================================ 6502 core */
const FLAG_C = 1, FLAG_Z = 2, FLAG_I = 4, FLAG_D = 8, FLAG_B = 16,
      FLAG_U = 32, FLAG_V = 64, FLAG_N = 128;

const OPS = {};
(function () {
  const t = [
    [0x69,'ADC','imm',2,0],[0x65,'ADC','zp',3,0],[0x75,'ADC','zpx',4,0],
    [0x6D,'ADC','abs',4,0],[0x7D,'ADC','abx',4,1],[0x79,'ADC','aby',4,1],
    [0x61,'ADC','izx',6,0],[0x71,'ADC','izy',5,1],
    [0x29,'AND','imm',2,0],[0x25,'AND','zp',3,0],[0x35,'AND','zpx',4,0],
    [0x2D,'AND','abs',4,0],[0x3D,'AND','abx',4,1],[0x39,'AND','aby',4,1],
    [0x21,'AND','izx',6,0],[0x31,'AND','izy',5,1],
    [0x0A,'ASLA','acc',2,0],[0x06,'ASL','zp',5,0],[0x16,'ASL','zpx',6,0],
    [0x0E,'ASL','abs',6,0],[0x1E,'ASL','abx',7,0],
    [0x90,'BCC','rel',2,0],[0xB0,'BCS','rel',2,0],[0xF0,'BEQ','rel',2,0],
    [0x30,'BMI','rel',2,0],[0xD0,'BNE','rel',2,0],[0x10,'BPL','rel',2,0],
    [0x50,'BVC','rel',2,0],[0x70,'BVS','rel',2,0],
    [0x24,'BIT','zp',3,0],[0x2C,'BIT','abs',4,0],[0x00,'BRK','imp',7,0],
    [0x18,'CLC','imp',2,0],[0xD8,'CLD','imp',2,0],[0x58,'CLI','imp',2,0],
    [0xB8,'CLV','imp',2,0],
    [0xC9,'CMP','imm',2,0],[0xC5,'CMP','zp',3,0],[0xD5,'CMP','zpx',4,0],
    [0xCD,'CMP','abs',4,0],[0xDD,'CMP','abx',4,1],[0xD9,'CMP','aby',4,1],
    [0xC1,'CMP','izx',6,0],[0xD1,'CMP','izy',5,1],
    [0xE0,'CPX','imm',2,0],[0xE4,'CPX','zp',3,0],[0xEC,'CPX','abs',4,0],
    [0xC0,'CPY','imm',2,0],[0xC4,'CPY','zp',3,0],[0xCC,'CPY','abs',4,0],
    [0xC6,'DEC','zp',5,0],[0xD6,'DEC','zpx',6,0],[0xCE,'DEC','abs',6,0],
    [0xDE,'DEC','abx',7,0],[0xCA,'DEX','imp',2,0],[0x88,'DEY','imp',2,0],
    [0x49,'EOR','imm',2,0],[0x45,'EOR','zp',3,0],[0x55,'EOR','zpx',4,0],
    [0x4D,'EOR','abs',4,0],[0x5D,'EOR','abx',4,1],[0x59,'EOR','aby',4,1],
    [0x41,'EOR','izx',6,0],[0x51,'EOR','izy',5,1],
    [0xE6,'INC','zp',5,0],[0xF6,'INC','zpx',6,0],[0xEE,'INC','abs',6,0],
    [0xFE,'INC','abx',7,0],[0xE8,'INX','imp',2,0],[0xC8,'INY','imp',2,0],
    [0x4C,'JMP','abs',3,0],[0x6C,'JMP','ind',5,0],[0x20,'JSR','abs',6,0],
    [0xA9,'LDA','imm',2,0],[0xA5,'LDA','zp',3,0],[0xB5,'LDA','zpx',4,0],
    [0xAD,'LDA','abs',4,0],[0xBD,'LDA','abx',4,1],[0xB9,'LDA','aby',4,1],
    [0xA1,'LDA','izx',6,0],[0xB1,'LDA','izy',5,1],
    [0xA2,'LDX','imm',2,0],[0xA6,'LDX','zp',3,0],[0xB6,'LDX','zpy',4,0],
    [0xAE,'LDX','abs',4,0],[0xBE,'LDX','aby',4,1],
    [0xA0,'LDY','imm',2,0],[0xA4,'LDY','zp',3,0],[0xB4,'LDY','zpx',4,0],
    [0xAC,'LDY','abs',4,0],[0xBC,'LDY','abx',4,1],
    [0x4A,'LSRA','acc',2,0],[0x46,'LSR','zp',5,0],[0x56,'LSR','zpx',6,0],
    [0x4E,'LSR','abs',6,0],[0x5E,'LSR','abx',7,0],[0xEA,'NOP','imp',2,0],
    [0x09,'ORA','imm',2,0],[0x05,'ORA','zp',3,0],[0x15,'ORA','zpx',4,0],
    [0x0D,'ORA','abs',4,0],[0x1D,'ORA','abx',4,1],[0x19,'ORA','aby',4,1],
    [0x01,'ORA','izx',6,0],[0x11,'ORA','izy',5,1],
    [0x48,'PHA','imp',3,0],[0x08,'PHP','imp',3,0],[0x68,'PLA','imp',4,0],
    [0x28,'PLP','imp',4,0],
    [0x2A,'ROLA','acc',2,0],[0x26,'ROL','zp',5,0],[0x36,'ROL','zpx',6,0],
    [0x2E,'ROL','abs',6,0],[0x3E,'ROL','abx',7,0],
    [0x6A,'RORA','acc',2,0],[0x66,'ROR','zp',5,0],[0x76,'ROR','zpx',6,0],
    [0x6E,'ROR','abs',6,0],[0x7E,'ROR','abx',7,0],
    [0x40,'RTI','imp',6,0],[0x60,'RTS','imp',6,0],
    [0xE9,'SBC','imm',2,0],[0xEB,'SBC','imm',2,0],[0xE5,'SBC','zp',3,0],
    [0xF5,'SBC','zpx',4,0],[0xED,'SBC','abs',4,0],[0xFD,'SBC','abx',4,1],
    [0xF9,'SBC','aby',4,1],[0xE1,'SBC','izx',6,0],[0xF1,'SBC','izy',5,1],
    [0x38,'SEC','imp',2,0],[0xF8,'SED','imp',2,0],[0x78,'SEI','imp',2,0],
    [0x85,'STA','zp',3,0],[0x95,'STA','zpx',4,0],[0x8D,'STA','abs',4,0],
    [0x9D,'STA','abx',5,0],[0x99,'STA','aby',5,0],[0x81,'STA','izx',6,0],
    [0x91,'STA','izy',6,0],
    [0x86,'STX','zp',3,0],[0x96,'STX','zpy',4,0],[0x8E,'STX','abs',4,0],
    [0x84,'STY','zp',3,0],[0x94,'STY','zpx',4,0],[0x8C,'STY','abs',4,0],
    [0xAA,'TAX','imp',2,0],[0xA8,'TAY','imp',2,0],[0xBA,'TSX','imp',2,0],
    [0x8A,'TXA','imp',2,0],[0x9A,'TXS','imp',2,0],[0x98,'TYA','imp',2,0],
    [0x1A,'NOP','imp',2,0],[0x3A,'NOP','imp',2,0],[0x5A,'NOP','imp',2,0],
    [0x7A,'NOP','imp',2,0],[0xDA,'NOP','imp',2,0],[0xFA,'NOP','imp',2,0],
    [0x80,'NOP2','imm',2,0],[0x82,'NOP2','imm',2,0],[0x89,'NOP2','imm',2,0],
    [0xC2,'NOP2','imm',2,0],[0xE2,'NOP2','imm',2,0],
    [0x04,'NOP2','zp',3,0],[0x44,'NOP2','zp',3,0],[0x64,'NOP2','zp',3,0],
    [0x14,'NOP2','zpx',4,0],[0x34,'NOP2','zpx',4,0],[0x54,'NOP2','zpx',4,0],
    [0x74,'NOP2','zpx',4,0],[0xD4,'NOP2','zpx',4,0],[0xF4,'NOP2','zpx',4,0],
    [0x0C,'NOP2','abs',4,0],[0x1C,'NOP2','abx',4,1],[0x3C,'NOP2','abx',4,1],
    [0x5C,'NOP2','abx',4,1],[0x7C,'NOP2','abx',4,1],[0xDC,'NOP2','abx',4,1],
    [0xFC,'NOP2','abx',4,1],
    [0xA7,'LAX','zp',3,0],[0xB7,'LAX','zpy',4,0],[0xAF,'LAX','abs',4,0],
    [0xBF,'LAX','aby',4,1],[0xA3,'LAX','izx',6,0],[0xB3,'LAX','izy',5,1],
    [0x87,'SAX','zp',3,0],[0x97,'SAX','zpy',4,0],[0x8F,'SAX','abs',4,0],
    [0x83,'SAX','izx',6,0]
  ];
  for (const e of t) OPS[e[0]] = e;
})();

class M6502 {
  constructor(bus) {
    this.bus = bus;
    this.a = this.x = this.y = 0;
    this.sp = 0xFD; this.pc = 0; this.p = FLAG_U | FLAG_I;
    this.cycles = 0; this.irqLine = 0; this.nmiLine = 0; this.nmiPending = false;
    this.halted = false; this.instructions = 0;
  }
  reset() {
    this.sp = 0xFD; this.p = FLAG_U | FLAG_I;
    this.pc = this.bus.read(0xFFFC) | (this.bus.read(0xFFFD) << 8);
    this.cycles += 7; this.halted = false;
  }
  setIrq(s) { this.irqLine = s ? 1 : 0; }
  setNmi(s) { s = s ? 1 : 0; if (s && !this.nmiLine) this.nmiPending = true; this.nmiLine = s; }
  push(v) { this.bus.write(0x100 | this.sp, v & 0xFF); this.sp = (this.sp - 1) & 0xFF; }
  pop() { this.sp = (this.sp + 1) & 0xFF; return this.bus.read(0x100 | this.sp); }
  interrupt(vec, brk) {
    this.push((this.pc >> 8) & 0xFF); this.push(this.pc & 0xFF);
    let p = this.p | FLAG_U; p = brk ? (p | FLAG_B) : (p & ~FLAG_B);
    this.push(p); this.p |= FLAG_I;
    this.pc = this.bus.read(vec) | (this.bus.read(vec + 1) << 8);
    this.cycles += 7;
  }
  fetch() { const v = this.bus.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF; return v; }
  fetch16() { const lo = this.fetch(); return lo | (this.fetch() << 8); }
  setNZ(v) {
    let p = this.p & ~(FLAG_N | FLAG_Z);
    if (v === 0) p |= FLAG_Z; else if (v & 0x80) p |= FLAG_N;
    this.p = p;
  }
  compare(r, v) {
    const res = (r - v) & 0xFF;
    let p = this.p & ~(FLAG_N | FLAG_Z | FLAG_C);
    if (r >= v) p |= FLAG_C;
    if (res === 0) p |= FLAG_Z; else if (res & 0x80) p |= FLAG_N;
    this.p = p;
  }
  branch(cond, addr) {
    if (cond) {
      this.cycles += ((addr & 0xFF00) !== (this.pc & 0xFF00)) ? 2 : 1;
      this.pc = addr;
    }
  }
  adc(v) {
    const a = this.a, c = this.p & FLAG_C;
    if (this.p & FLAG_D) {
      let lo = (a & 15) + (v & 15) + c, hi = (a >> 4) + (v >> 4);
      if (lo > 9) { lo += 6; hi += 1; }
      const bin = (a + v + c) & 0xFF;
      this.p &= ~(FLAG_N | FLAG_V | FLAG_Z | FLAG_C);
      if (bin === 0) this.p |= FLAG_Z;
      if ((hi << 4) & 0x80) this.p |= FLAG_N;
      if ((~(a ^ v) & (a ^ (hi << 4)) & 0x80)) this.p |= FLAG_V;
      if (hi > 9) hi += 6;
      if (hi > 15) this.p |= FLAG_C;
      this.a = ((hi << 4) | (lo & 15)) & 0xFF;
    } else {
      let r = a + v + c;
      this.p &= ~(FLAG_N | FLAG_V | FLAG_Z | FLAG_C);
      if (r > 0xFF) this.p |= FLAG_C;
      r &= 0xFF;
      if (r === 0) this.p |= FLAG_Z; else if (r & 0x80) this.p |= FLAG_N;
      if ((~(a ^ v) & (a ^ r) & 0x80)) this.p |= FLAG_V;
      this.a = r;
    }
  }
  sbc(v) {
    const a = this.a, c = this.p & FLAG_C, bin = a - v - (1 - c);
    this.p &= ~(FLAG_N | FLAG_V | FLAG_Z | FLAG_C);
    if (bin >= 0) this.p |= FLAG_C;
    const res = bin & 0xFF;
    if (res === 0) this.p |= FLAG_Z; else if (res & 0x80) this.p |= FLAG_N;
    if (((a ^ v) & (a ^ res) & 0x80)) this.p |= FLAG_V;
    if (this.p & FLAG_D) {
      let lo = (a & 15) - (v & 15) - (1 - c), hi = (a >> 4) - (v >> 4);
      if (lo & 0x10) { lo -= 6; hi -= 1; }
      if (hi & 0x10) hi -= 6;
      this.a = ((hi << 4) | (lo & 15)) & 0xFF;
    } else this.a = res;
  }
  addr(am) {
    const b = this.bus;
    switch (am) {
      case 'imm': { const a = this.pc; this.pc = (this.pc + 1) & 0xFFFF; return [a, 0]; }
      case 'zp': return [this.fetch(), 0];
      case 'zpx': return [(this.fetch() + this.x) & 0xFF, 0];
      case 'zpy': return [(this.fetch() + this.y) & 0xFF, 0];
      case 'abs': return [this.fetch16(), 0];
      case 'abx': { const base = this.fetch16(), a = (base + this.x) & 0xFFFF;
        return [a, (base & 0xFF00) !== (a & 0xFF00) ? 1 : 0]; }
      case 'aby': { const base = this.fetch16(), a = (base + this.y) & 0xFFFF;
        return [a, (base & 0xFF00) !== (a & 0xFF00) ? 1 : 0]; }
      case 'izx': { const zp = (this.fetch() + this.x) & 0xFF;
        return [b.read(zp) | (b.read((zp + 1) & 0xFF) << 8), 0]; }
      case 'izy': { const zp = this.fetch();
        const base = b.read(zp) | (b.read((zp + 1) & 0xFF) << 8);
        const a = (base + this.y) & 0xFFFF;
        return [a, (base & 0xFF00) !== (a & 0xFF00) ? 1 : 0]; }
      case 'ind': { const p = this.fetch16();
        return [b.read(p) | (b.read((p & 0xFF00) | ((p + 1) & 0xFF)) << 8), 0]; }
      case 'rel': { let o = this.fetch(); if (o & 0x80) o -= 256;
        return [(this.pc + o) & 0xFFFF, 0]; }
    }
    return [0, 0];
  }
  step() {
    const start = this.cycles, b = this.bus;
    if (this.nmiPending) { this.nmiPending = false; this.interrupt(0xFFFA, false); return this.cycles - start; }
    if (this.irqLine && !(this.p & FLAG_I)) { this.interrupt(0xFFFE, false); return this.cycles - start; }
    if (this.halted) { this.cycles++; return 1; }
    const op = this.fetch(), e = OPS[op];
    if (!e) { this.halted = true; this.cycles += 2; return 2; }
    const mn = e[1], am = e[2];
    this.cycles += e[3];
    this.instructions++;
    let addr = 0;
    if (am !== 'imp' && am !== 'acc') {
      const r = this.addr(am);
      addr = r[0];
      if (e[4]) this.cycles += r[1];
    }
    switch (mn) {
      case 'LDA': this.a = b.read(addr); this.setNZ(this.a); break;
      case 'LDX': this.x = b.read(addr); this.setNZ(this.x); break;
      case 'LDY': this.y = b.read(addr); this.setNZ(this.y); break;
      case 'STA': b.write(addr, this.a); break;
      case 'STX': b.write(addr, this.x); break;
      case 'STY': b.write(addr, this.y); break;
      case 'ADC': this.adc(b.read(addr)); break;
      case 'SBC': this.sbc(b.read(addr)); break;
      case 'AND': this.a &= b.read(addr); this.setNZ(this.a); break;
      case 'ORA': this.a |= b.read(addr); this.setNZ(this.a); break;
      case 'EOR': this.a ^= b.read(addr); this.setNZ(this.a); break;
      case 'CMP': this.compare(this.a, b.read(addr)); break;
      case 'CPX': this.compare(this.x, b.read(addr)); break;
      case 'CPY': this.compare(this.y, b.read(addr)); break;
      case 'INC': { const v = (b.read(addr) + 1) & 0xFF; b.write(addr, v); this.setNZ(v); break; }
      case 'DEC': { const v = (b.read(addr) - 1) & 0xFF; b.write(addr, v); this.setNZ(v); break; }
      case 'INX': this.x = (this.x + 1) & 0xFF; this.setNZ(this.x); break;
      case 'DEX': this.x = (this.x - 1) & 0xFF; this.setNZ(this.x); break;
      case 'INY': this.y = (this.y + 1) & 0xFF; this.setNZ(this.y); break;
      case 'DEY': this.y = (this.y - 1) & 0xFF; this.setNZ(this.y); break;
      case 'ASLA': { const v = this.a << 1; this.p = (this.p & ~FLAG_C) | ((v & 0x100) ? 1 : 0);
        this.a = v & 0xFF; this.setNZ(this.a); break; }
      case 'ASL': { let v = b.read(addr) << 1; this.p = (this.p & ~FLAG_C) | ((v & 0x100) ? 1 : 0);
        v &= 0xFF; b.write(addr, v); this.setNZ(v); break; }
      case 'LSRA': { const c = this.a & 1; this.a >>= 1;
        this.p = (this.p & ~FLAG_C) | c; this.setNZ(this.a); break; }
      case 'LSR': { let v = b.read(addr); const c = v & 1; v >>= 1;
        this.p = (this.p & ~FLAG_C) | c; b.write(addr, v); this.setNZ(v); break; }
      case 'ROLA': { const v = (this.a << 1) | (this.p & FLAG_C);
        this.p = (this.p & ~FLAG_C) | ((v & 0x100) ? 1 : 0);
        this.a = v & 0xFF; this.setNZ(this.a); break; }
      case 'ROL': { const v = (b.read(addr) << 1) | (this.p & FLAG_C);
        this.p = (this.p & ~FLAG_C) | ((v & 0x100) ? 1 : 0);
        const r = v & 0xFF; b.write(addr, r); this.setNZ(r); break; }
      case 'RORA': { const v = this.a, c = v & 1;
        this.a = (v >> 1) | ((this.p & FLAG_C) << 7);
        this.p = (this.p & ~FLAG_C) | c; this.setNZ(this.a); break; }
      case 'ROR': { const v = b.read(addr), c = v & 1;
        const r = (v >> 1) | ((this.p & FLAG_C) << 7);
        this.p = (this.p & ~FLAG_C) | c; b.write(addr, r); this.setNZ(r); break; }
      case 'BIT': { const v = b.read(addr);
        let p = this.p & ~(FLAG_N | FLAG_V | FLAG_Z);
        if ((this.a & v) === 0) p |= FLAG_Z;
        this.p = p | (v & (FLAG_N | FLAG_V)); break; }
      case 'JMP': this.pc = addr; break;
      case 'JSR': { const r = (this.pc - 1) & 0xFFFF;
        this.push((r >> 8) & 0xFF); this.push(r & 0xFF); this.pc = addr; break; }
      case 'RTS': { const lo = this.pop(), hi = this.pop();
        this.pc = ((lo | (hi << 8)) + 1) & 0xFFFF; break; }
      case 'RTI': { this.p = (this.pop() | FLAG_U) & ~FLAG_B;
        const lo = this.pop(), hi = this.pop(); this.pc = lo | (hi << 8); break; }
      case 'BRK': this.pc = (this.pc + 1) & 0xFFFF; this.interrupt(0xFFFE, true); this.cycles -= 7; break;
      case 'BCC': this.branch(!(this.p & FLAG_C), addr); break;
      case 'BCS': this.branch(!!(this.p & FLAG_C), addr); break;
      case 'BEQ': this.branch(!!(this.p & FLAG_Z), addr); break;
      case 'BNE': this.branch(!(this.p & FLAG_Z), addr); break;
      case 'BMI': this.branch(!!(this.p & FLAG_N), addr); break;
      case 'BPL': this.branch(!(this.p & FLAG_N), addr); break;
      case 'BVS': this.branch(!!(this.p & FLAG_V), addr); break;
      case 'BVC': this.branch(!(this.p & FLAG_V), addr); break;
      case 'CLC': this.p &= ~FLAG_C; break;
      case 'SEC': this.p |= FLAG_C; break;
      case 'CLI': this.p &= ~FLAG_I; break;
      case 'SEI': this.p |= FLAG_I; break;
      case 'CLD': this.p &= ~FLAG_D; break;
      case 'SED': this.p |= FLAG_D; break;
      case 'CLV': this.p &= ~FLAG_V; break;
      case 'PHA': this.push(this.a); break;
      case 'PLA': this.a = this.pop(); this.setNZ(this.a); break;
      case 'PHP': this.push(this.p | FLAG_B | FLAG_U); break;
      case 'PLP': this.p = (this.pop() | FLAG_U) & ~FLAG_B; break;
      case 'TAX': this.x = this.a; this.setNZ(this.x); break;
      case 'TAY': this.y = this.a; this.setNZ(this.y); break;
      case 'TXA': this.a = this.x; this.setNZ(this.a); break;
      case 'TYA': this.a = this.y; this.setNZ(this.a); break;
      case 'TSX': this.x = this.sp; this.setNZ(this.x); break;
      case 'TXS': this.sp = this.x; break;
      case 'LAX': this.a = this.x = b.read(addr); this.setNZ(this.a); break;
      case 'SAX': b.write(addr, this.a & this.x); break;
      case 'NOP2': b.read(addr); break;
      case 'NOP': break;
    }
    return this.cycles - start;
  }
}

/* ============================================================== VIA 6522 */
class VIA6522 {
  constructor(opts) {
    opts = opts || {};
    this.irqCb = opts.irq || (() => {});
    this.readPa = opts.readPa || (() => 0xFF);
    this.readPb = opts.readPb || (() => 0xFF);
    this.writePa = opts.writePa || (() => {});
    this.writePb = opts.writePb || (() => {});
    this.writeCb2 = opts.writeCb2 || (() => {});
    this.reset();
  }
  reset() {
    this.ora = this.orb = this.ddra = this.ddrb = 0;
    this.t1c = this.t1l = this.t2c = this.t2l = 0;
    this.t1Active = this.t2Active = false; this.t1pb7 = 0;
    this.sr = this.acr = this.pcr = this.ifr = this.ier = 0;
    this.ca1 = this.ca2 = this.cb1 = this.cb2 = 0; this.irqState = 0;
  }
  updateIrq() {
    let n = 0;
    if (this.ifr & this.ier & 0x7F) { this.ifr |= 0x80; n = 1; } else this.ifr &= 0x7F;
    if (n !== this.irqState) { this.irqState = n; this.irqCb(n); }
  }
  setIfr(b) { this.ifr |= b; this.updateIrq(); }
  clrIfr(b) { this.ifr &= ~b; this.updateIrq(); }
  writeCa1(state) {
    state = state ? 1 : 0;
    const rising = !!(this.pcr & 1);
    if (state !== this.ca1 && ((rising && state) || (!rising && !state))) this.setIfr(0x02);
    this.ca1 = state;
  }
  writeCb1(state) {
    state = state ? 1 : 0;
    const rising = !!(this.pcr & 0x10);
    if (state !== this.cb1 && ((rising && state) || (!rising && !state))) this.setIfr(0x10);
    this.cb1 = state;
  }
  tick(cycles) {
    if (cycles <= 0) return;
    if (this.t1Active || (this.acr & 0x40)) {
      this.t1c -= cycles;
      while (this.t1c < 0) {
        if (this.acr & 0x40) {
          this.t1c += this.t1l + 2; this.setIfr(0x40);
          if (this.acr & 0x80) this.t1pb7 ^= 1;
        } else {
          if (this.t1Active) { this.t1Active = false; this.setIfr(0x40); if (this.acr & 0x80) this.t1pb7 = 1; }
          this.t1c += 0x10000;
        }
      }
    }
    if (this.t2Active) {
      this.t2c -= cycles;
      if (this.t2c < 0) { this.t2c &= 0xFFFF; this.t2Active = false; this.setIfr(0x20); }
    }
  }
  read(off) {
    const r = off & 15;
    switch (r) {
      case 0: { let v = (this.readPb() & ~this.ddrb) | (this.orb & this.ddrb);
        if (this.acr & 0x80) v = (v & 0x7F) | (this.t1pb7 << 7);
        this.clrIfr(0x18); return v & 0xFF; }
      case 1: this.clrIfr(0x03);
        return ((this.readPa() & ~this.ddra) | (this.ora & this.ddra)) & 0xFF;
      case 15: return ((this.readPa() & ~this.ddra) | (this.ora & this.ddra)) & 0xFF;
      case 2: return this.ddrb;
      case 3: return this.ddra;
      case 4: this.clrIfr(0x40); return Math.max(this.t1c, 0) & 0xFF;
      case 5: return (Math.max(this.t1c, 0) >> 8) & 0xFF;
      case 6: return this.t1l & 0xFF;
      case 7: return (this.t1l >> 8) & 0xFF;
      case 8: this.clrIfr(0x20); return Math.max(this.t2c, 0) & 0xFF;
      case 9: return (Math.max(this.t2c, 0) >> 8) & 0xFF;
      case 10: this.clrIfr(0x04); return this.sr;
      case 11: return this.acr;
      case 12: return this.pcr;
      case 13: return this.ifr;
      case 14: return this.ier | 0x80;
    }
    return 0;
  }
  write(off, d) {
    d &= 0xFF;
    const r = off & 15;
    switch (r) {
      case 0: this.orb = d; this.writePb((this.orb & this.ddrb) | (~this.ddrb & 0xFF)); this.clrIfr(0x18); break;
      case 1: case 15: this.ora = d;
        this.writePa((this.ora & this.ddra) | (~this.ddra & 0xFF));
        if (r === 1) this.clrIfr(0x03);
        break;
      case 2: this.ddrb = d; this.writePb((this.orb & this.ddrb) | (~this.ddrb & 0xFF)); break;
      case 3: this.ddra = d; this.writePa((this.ora & this.ddra) | (~this.ddra & 0xFF)); break;
      case 4: case 6: this.t1l = (this.t1l & 0xFF00) | d; break;
      case 5: this.t1l = (this.t1l & 0xFF) | (d << 8); this.t1c = this.t1l + 1;
        this.t1Active = true; if (this.acr & 0x80) this.t1pb7 = 0; this.clrIfr(0x40); break;
      case 7: this.t1l = (this.t1l & 0xFF) | (d << 8); this.clrIfr(0x40); break;
      case 8: this.t2l = (this.t2l & 0xFF00) | d; break;
      case 9: this.t2l = (this.t2l & 0xFF) | (d << 8); this.t2c = this.t2l + 1;
        this.t2Active = true; this.clrIfr(0x20); break;
      case 10: this.sr = d; this.clrIfr(0x04); break;
      case 11: this.acr = d; break;
      case 12: this.pcr = d;
        if ((this.pcr & 0xE0) === 0xC0) { this.cb2 = 0; this.writeCb2(0); }
        else if ((this.pcr & 0xE0) === 0xE0) { this.cb2 = 1; this.writeCb2(1); }
        break;
      case 13: this.ifr &= ~(d & 0x7F); this.updateIrq(); break;
      case 14: if (d & 0x80) this.ier |= d & 0x7F; else this.ier &= ~(d & 0x7F);
        this.updateIrq(); break;
    }
  }
}

/* ============================================================ R65C52 DACIA */
const IRQ_RDRF = 1, IRQ_TDRE = 0x40;
class R65C52 {
  constructor(cpuHz, baud, irqCb, txCb) {
    this.irqCb = irqCb; this.txCb = txCb;
    this.byteCycles = Math.floor(cpuHz * 10 / baud);
    this.ch = [this.newCh(), this.newCh()];
  }
  newCh() {
    // TDRE set at power on - see the header comment
    return { isr: 0x80 | IRQ_TDRE, ier: 0x80, status: 0x80, rdr: 0, tdr: 0,
             rdrf: false, tdre: true, tx: 0, rxq: [], rxBusy: 0, irq: 0 };
  }
  updateIrq(i) {
    const c = this.ch[i], n = (c.ier & c.isr & 0x7F) ? 1 : 0;
    if (n !== c.irq) { c.irq = n; this.irqCb(i, n); }
  }
  read(off) {
    const i = (off & 4) ? 1 : 0, r = off & 3, c = this.ch[i];
    if (r === 0) {
      let isr = c.isr;
      if (isr & 0x7F) isr |= 0x80;
      isr &= ~(0x02 | 0x08 | 0x10 | 0x20);
      c.isr = isr; this.updateIrq(i); return isr;
    }
    if (r === 1) return c.status;
    if (r === 3) {
      c.status &= ~0x84; c.isr &= ~(0x04 | 0x02 | IRQ_RDRF); c.rdrf = false;
      this.updateIrq(i); return c.rdr;
    }
    return 0;
  }
  write(off, d) {
    d &= 0xFF;
    const i = (off & 4) ? 1 : 0, r = off & 3, c = this.ch[i];
    if (r === 0) { if (d & 0x80) c.ier |= d & 0x7F; else c.ier &= ~(d & 0x7F); this.updateIrq(i); }
    else if (r === 1) c.format = d;
    else if (r === 3) { c.tdr = d; c.tdre = false; c.isr &= ~IRQ_TDRE; c.tx = this.byteCycles; this.updateIrq(i); }
  }
  receiveByte(i, b) { this.ch[i].rxq.push(b & 0xFF); }
  tick(cycles) {
    for (let i = 0; i < 2; i++) {
      const c = this.ch[i];
      if (c.tx > 0) {
        c.tx -= cycles;
        if (c.tx <= 0) { c.tx = 0; c.tdre = true; c.isr |= IRQ_TDRE; this.txCb(i, c.tdr); this.updateIrq(i); }
      }
      if (c.rxBusy > 0) c.rxBusy -= cycles;
      if (c.rxBusy <= 0 && c.rxq.length) {
        c.rdr = c.rxq.shift(); c.rdrf = true; c.isr |= IRQ_RDRF;
        c.rxBusy = this.byteCycles; this.updateIrq(i);
      }
    }
  }
}

/* ============================================================ LDP-1450 HLE */
const LDPCMD = {
  AUDIO_OFF: 0x24, AUDIO_ON: 0x25, VIDEO_OFF: 0x26, VIDEO_ON: 0x27,
  STEP_STILL: 0x2B, STEP_STILL_REV: 0x2C, PLAY: 0x3A, FAST_FWD: 0x3B,
  SLOW_FWD: 0x3C, STEP_FWD: 0x3D, SCAN_FWD: 0x3E, STOP: 0x3F, ENTER: 0x40,
  CLEAR: 0x41, SEARCH: 0x43, REPEAT: 0x44, CH1_ON: 0x46, CH1_OFF: 0x47,
  CH2_ON: 0x48, CH2_OFF: 0x49, PLAY_REV: 0x4A, FAST_REV: 0x4B, SLOW_REV: 0x4C,
  STEP_REV: 0x4D, SCAN_REV: 0x4E, STILL: 0x4F, INDEX_ON: 0x50, INDEX_OFF: 0x51,
  FRAME_SET: 0x55, CLEAR_ALL: 0x56, ADDR_INQ: 0x60, MOTOR_ON: 0x62,
  STATUS_INQ: 0x67, CHAPTER_SET: 0x69, UI_CTRL: 0x80, UI_ON: 0x81, UI_OFF: 0x82
};
const MODE = { PARK: 0, DOOR: 1, PAUSE: 2, PLAY: 3, MSF: 4, MSR: 5, SEARCH: 6,
               SEARCH_CMD: 7, SEARCH_REP: 8, REPEAT_MARK: 10, REPEAT_REPS: 11,
               STILL: 12 };
const SUB = { NORMAL: 0, UI: 1, UI_M1: 2, UI_M2: 3, UI_M3: 4, UI_S1: 5, UI_S2: 6, UI_W: 7 };
const NONE = 0xFFFFFFFF;
const TEXT_SIZE = [16, 32, 48, 64];

class LDP1450 {
  constructor(totalFrames, serialTx) {
    this.totalFrames = totalFrames || 54000;
    this.serialTx = serialTx;
    this.baseSpeed = 60;
    this.reset();
  }
  reset() {
    this.mode = MODE.PARK; this.submode = SUB.NORMAL;
    this.currFrame = 1; this.cmdBuffer = -2;
    this.searchFrame = NONE; this.markFrame = NONE;
    this.repeatStart = NONE; this.repeatEnd = NONE; this.repeatReps = 0;
    this.videoSwitch = 1; this.ch1 = false; this.ch2 = false;
    this.displaySwitch = 0; this.addressFlag = 0;
    this.speed = this.baseSpeed; this.speedAccum = 0;
    this.audioSquelch = [true, true]; this.videoSquelch = false; this.videoEnabled = true;
    this.uiFlag = false; this.uiX = 0; this.uiY = 0; this.uiMode = 0;
    this.uiCharIdx = 0; this.uiWindow = 0; this.uiChars = new Array(33).fill(0x1A);
    this.replyQueue = []; this.commandLog = [];
  }
  queueReply(b, ms) { this.replyQueue.push([ms * 1000, b]); }
  queueReplyBuffer(arr, ms) {
    let d = ms * 1000;
    for (const b of arr) { if (b === 0) break; this.replyQueue.push([d, b]); d += 1000; }
  }
  tickUs(us) {
    for (let i = 0; i < this.replyQueue.length;) {
      this.replyQueue[i][0] -= us;
      if (this.replyQueue[i][0] <= 0) { const b = this.replyQueue.splice(i, 1)[0][1]; this.serialTx(b); }
      else i++;
    }
  }
  setAudioSquelch(l, r) { this.audioSquelch = [!!l, !!r]; }
  updateAudioSquelch() {
    const both = [MODE.STILL, MODE.PAUSE, MODE.SEARCH, MODE.MSR, MODE.SEARCH_CMD, MODE.SEARCH_REP].includes(this.mode);
    this.setAudioSquelch(!this.ch1 || both, !this.ch2 || both);
  }
  updateVideoEnable() {
    const en = this.videoSwitch === 1 &&
      [MODE.STILL, MODE.PLAY, MODE.MSF, MODE.MSR].includes(this.mode);
    this.videoSquelch = !en; this.videoEnabled = en;
  }
  advance(n) { this.currFrame = Math.max(1, Math.min(this.totalFrames, this.currFrame + n)); }
  beginSearch(v) {
    this.searchFrame = v; this.setAudioSquelch(true, true);
    if (Math.abs(v - this.currFrame) > 100) this.videoEnabled = false;
  }
  rxByte(cmd) {
    cmd &= 0xFF;
    switch (this.submode) {
      case SUB.UI:
        if (cmd === 0) this.submode = SUB.UI_M1;
        else if (cmd === 1) this.submode = SUB.UI_S1;
        else if (cmd === 2) this.submode = SUB.UI_W;
        this.queueReply(0x0A, 4.3); return;
      case SUB.UI_M1: this.uiX = cmd & 0x3F; this.submode = SUB.UI_M2; this.queueReply(0x0A, 4.3); return;
      case SUB.UI_M2: this.uiY = cmd & 0x3F; this.submode = SUB.UI_M3; this.queueReply(0x0A, 4.3); return;
      case SUB.UI_M3: this.uiMode = cmd; this.submode = SUB.NORMAL; this.queueReply(0x0A, 4.3); return;
      case SUB.UI_S1: this.uiCharIdx = cmd & 0x1F; this.submode = SUB.UI_S2; this.queueReply(0x0A, 4.3); return;
      case SUB.UI_S2:
        this.uiChars[this.uiCharIdx] = cmd;
        if (cmd === 0x1A) this.submode = SUB.NORMAL;
        else { this.uiCharIdx++; if (this.uiCharIdx > 32) this.uiCharIdx = 0; }
        this.queueReply(0x0A, 4.3); return;
      case SUB.UI_W: this.uiWindow = cmd & 0x1F; this.submode = SUB.NORMAL; this.queueReply(0x0A, 4.3); return;
    }
    if (cmd >= 0x30 && cmd <= 0x39) {
      if (this.cmdBuffer === -2) this.cmdBuffer = 0;
      if (this.cmdBuffer !== 0) this.cmdBuffer *= 10;
      this.cmdBuffer += cmd - 0x30;
      this.queueReply(0x0A, 4.3); return;
    }
    this.commandLog.push([cmd, this.currFrame]);
    const C = LDPCMD;
    switch (cmd) {
      case C.ENTER:
        if (this.mode === MODE.SEARCH_CMD) { this.beginSearch(this.cmdBuffer); this.mode = MODE.SEARCH; }
        else if (this.mode === MODE.REPEAT_MARK) { this.repeatEnd = this.cmdBuffer; this.mode = MODE.REPEAT_REPS; this.cmdBuffer = -2; }
        else if (this.mode === MODE.REPEAT_REPS) {
          if (this.cmdBuffer === -2) this.cmdBuffer = 1; else if (this.cmdBuffer === 0) this.cmdBuffer = -1;
          this.repeatReps = this.cmdBuffer; this.mode = MODE.PLAY; this.cmdBuffer = 0;
          this.updateVideoEnable(); this.updateAudioSquelch();
        } else if (this.mode === MODE.MSF || this.mode === MODE.MSR) {
          if (this.cmdBuffer > 0) this.speed = Math.floor(this.baseSpeed / this.cmdBuffer);
          this.updateVideoEnable(); this.updateAudioSquelch();
        }
        this.queueReply(0x0A, 1.3); break;
      case C.STEP_STILL: this.mode = MODE.STILL; this.setAudioSquelch(1, 1); this.markFrame = NONE; this.advance(1); this.queueReply(0x0A, 1.4); break;
      case C.STEP_STILL_REV: this.mode = MODE.STILL; this.setAudioSquelch(1, 1); this.markFrame = NONE; this.advance(-1); this.queueReply(0x0A, 1.4); break;
      case C.STOP: this.mode = MODE.PARK; this.setAudioSquelch(1, 1); this.videoSquelch = true; this.queueReply(0x0A, 5.5); break;
      case C.PLAY: this.speedAccum = 0; this.speed = this.baseSpeed; this.mode = MODE.PLAY;
        this.updateAudioSquelch(); this.updateVideoEnable(); this.queueReply(0x0A, 5.5); break;
      case C.FAST_FWD: this.speed = this.baseSpeed * 3; this.mode = MODE.MSF; this.updateAudioSquelch(); this.updateVideoEnable(); this.queueReply(0x0A, 5.5); break;
      case C.SLOW_FWD: this.speed = this.baseSpeed / 5; this.mode = MODE.MSF; this.updateAudioSquelch(); this.updateVideoEnable(); this.queueReply(0x0A, 5.5); break;
      case C.STEP_FWD: this.speed = this.baseSpeed / 7; this.mode = MODE.MSF; this.setAudioSquelch(1, 1); this.queueReply(0x0A, 5.5); break;
      case C.SCAN_FWD: this.speed = this.baseSpeed * 100; this.mode = MODE.MSF; this.updateAudioSquelch(); this.updateVideoEnable(); this.queueReply(0x0A, 5.5); break;
      case C.PLAY_REV: this.speed = this.baseSpeed; this.mode = MODE.MSR; this.updateAudioSquelch(); this.updateVideoEnable(); this.queueReply(0x0A, 5.5); break;
      case C.FAST_REV: this.speed = this.baseSpeed * 3; this.mode = MODE.MSR; this.updateAudioSquelch(); this.updateVideoEnable(); this.queueReply(0x0A, 5.5); break;
      case C.SLOW_REV: this.speed = this.baseSpeed / 5; this.mode = MODE.MSR; this.updateAudioSquelch(); this.updateVideoEnable(); this.queueReply(0x0A, 5.5); break;
      case C.STEP_REV: this.speed = this.baseSpeed / 7; this.mode = MODE.MSR; this.setAudioSquelch(1, 1); this.markFrame = 0; this.advance(-1); this.queueReply(0x0A, 5.5); break;
      case C.SCAN_REV: this.speed = this.baseSpeed / 7; this.mode = MODE.MSR; this.updateAudioSquelch(); this.updateVideoEnable(); this.queueReply(0x0A, 5.5); break;
      case C.STILL: this.mode = MODE.STILL; this.setAudioSquelch(1, 1); this.updateVideoEnable(); this.queueReply(0x0A, 0.4); break;
      case C.SEARCH: this.mode = MODE.SEARCH_CMD; this.cmdBuffer = 0; this.repeatStart = 0;
        this.repeatEnd = 0; this.repeatReps = 0; this.searchFrame = NONE;
        this.updateAudioSquelch(); this.queueReply(0x0A, 9.0); break;
      case C.REPEAT: this.mode = MODE.REPEAT_MARK; this.cmdBuffer = 0; this.repeatStart = this.currFrame;
        this.repeatEnd = 0; this.repeatReps = 0; this.updateVideoEnable(); this.updateAudioSquelch();
        this.queueReply(0x0A, 8.0); break;
      case C.FRAME_SET: this.addressFlag = 0; this.queueReply(0x0A, 0.4); break;
      case C.CHAPTER_SET: this.addressFlag = 1; this.queueReply(0x0A, 0.4); break;
      case C.CLEAR: this.cmdBuffer = 0; this.queueReply(0x0A, 8.0); break;
      case C.CLEAR_ALL: this.cmdBuffer = 0; this.searchFrame = this.currFrame;
        this.repeatStart = 0; this.repeatEnd = 0; this.repeatReps = 0;
        this.speed = this.baseSpeed; this.submode = SUB.NORMAL; this.mode = MODE.PLAY;
        this.queueReply(0x0A, 5.5); break;
      case C.CH1_ON: this.ch1 = true; this.updateAudioSquelch(); this.queueReply(0x0A, 0.4); break;
      case C.CH1_OFF: this.ch1 = false; this.updateAudioSquelch(); this.queueReply(0x0A, 0.4); break;
      case C.CH2_ON: this.ch2 = true; this.updateAudioSquelch(); this.queueReply(0x0A, 0.4); break;
      case C.CH2_OFF: this.ch2 = false; this.updateAudioSquelch(); this.queueReply(0x0A, 0.4); break;
      case C.AUDIO_ON: this.ch1 = this.ch2 = true; this.updateAudioSquelch(); this.queueReply(0x0A, 0.4); break;
      case C.AUDIO_OFF: this.ch1 = this.ch2 = false; this.updateAudioSquelch(); this.queueReply(0x0A, 0.4); break;
      case C.VIDEO_ON: this.videoSwitch = 1; this.updateVideoEnable(); this.queueReply(0x0A, 0.4); break;
      case C.VIDEO_OFF: this.videoSwitch = 0; this.updateVideoEnable(); this.queueReply(0x0A, 0.4); break;
      case C.INDEX_ON: this.displaySwitch = 1; this.queueReply(0x0A, 0.4); break;
      case C.INDEX_OFF: this.displaySwitch = 0; this.queueReply(0x0A, 0.4); break;
      case C.ADDR_INQ: {
        let v = this.currFrame; const buf = [0, 0, 0, 0, 0];
        for (let i = 0; i < 5; i++) { buf[4 - i] = (v % 10) + 0x30; v = Math.floor(v / 10); }
        this.queueReplyBuffer(buf, 1.3); break; }
      case C.MOTOR_ON: this.queueReply(0x0B, 0.4); break;
      case C.STATUS_INQ: {
        const s = [0x80, 0x00, 0x10, 0x00, 0xFF];
        if ([MODE.PLAY, MODE.MSF, MODE.MSR].includes(this.mode)) s[4] = 0x01;
        else if ([MODE.PAUSE, MODE.STILL].includes(this.mode)) s[4] = 0x20;
        this.queueReplyBuffer(s, 1.3); break; }
      case C.UI_CTRL: this.submode = SUB.UI; this.queueReply(0x0A, 0.4); break;
      case C.UI_ON: this.uiFlag = true; this.queueReply(0x0A, 0.4); break;
      case C.UI_OFF: this.uiFlag = false; this.queueReply(0x0A, 0.4); break;
      default: this.queueReply(0x0B, 0.4); break;
    }
  }
  frameTick() {
    let elapsed = 0;
    if (this.mode === MODE.MSF || this.mode === MODE.MSR) {
      this.speedAccum += this.speed;
      elapsed = Math.floor(this.speedAccum / this.baseSpeed);
      this.speedAccum -= elapsed * this.baseSpeed;
      if (this.mode === MODE.MSR) elapsed = -elapsed;
    } else if ([MODE.PLAY, MODE.SEARCH, MODE.SEARCH_REP].includes(this.mode)) elapsed = 1;
    if (elapsed) this.advance(elapsed);
    this.processPosition();
  }
  processPosition() {
    if ([MODE.STILL, MODE.PAUSE, MODE.PARK, MODE.DOOR].includes(this.mode)) return;
    if (this.markFrame !== NONE && this.searchFrame === NONE && this.currFrame === this.markFrame) {
      this.markFrame = NONE; this.mode = MODE.STILL; this.updateVideoEnable(); this.setAudioSquelch(1, 1);
    }
    if (this.searchFrame !== NONE) {
      const delta = this.searchFrame - this.currFrame;
      if (delta === 0) {
        this.searchFrame = NONE;
        this.mode = (this.mode === MODE.SEARCH_REP) ? MODE.PLAY : MODE.STILL;
        this.updateVideoEnable(); this.queueReply(0x01, 1.3);
      } else if (delta > 0 && delta <= 2) { /* run up to it */ }
      else this.advance(delta < 0 ? Math.min(-2, Math.trunc(delta / 2)) : Math.max(1, Math.trunc(delta / 2)));
    }
    if (this.repeatReps !== 0 && this.repeatEnd !== NONE) {
      const hit = this.currFrame >= this.repeatEnd ||
        (this.mode === MODE.MSR && this.repeatStart !== NONE && this.currFrame <= this.repeatStart);
      if (hit) {
        if (this.repeatReps > 0) this.repeatReps--;
        const rev = this.mode === MODE.MSR;
        this.mode = MODE.STILL; this.updateVideoEnable(); this.updateAudioSquelch();
        if (this.repeatReps !== 0) { this.mode = MODE.SEARCH_REP; this.beginSearch(rev ? this.repeatEnd : this.repeatStart); }
        else { this.repeatEnd = NONE; this.repeatStart = NONE; this.queueReply(0x01, 1.3); }
      }
    }
  }
  osdText() {
    if (!this.uiFlag) return null;
    const chars = [];
    for (let i = this.uiWindow; i < 32; i++) {
      if (this.uiChars[i] === 0x1A) break;
      chars.push(this.uiChars[i]);
    }
    return {
      text: chars.map(c => (c >= 32 && c < 127) ? String.fromCharCode(c) : ' ').join(''),
      x: this.uiX, y: this.uiY, mode: this.uiMode,
      charW: TEXT_SIZE[this.uiMode & 3], charH: TEXT_SIZE[(this.uiMode >> 2) & 3],
      threeLine: !!(this.uiMode & 0x10), blueScreen: !!(this.uiMode & 0x80),
      style: (this.uiMode >> 5) & 3
    };
  }
}

/* ============================================================ Sony CDU33A */
function rev8(v) {
  v &= 0xFF; let r = 0;
  for (let i = 0; i < 8; i++) r = (r << 1) | ((v >> i) & 1);
  return r;
}
function bcd(v) { return (v >> 4) * 10 + (v & 15); }

class CDU33A {
  constructor() { this.reset(); }
  reset() {
    this.ctrl = 0xF3; this.params = []; this.result = [];
    this.busy = false; this.attention = false;
    this.playing = false; this.position = 0; this.lastCmd = null;
    this.commands = []; this.cuePoints = [];
  }
  reg() { return ((this.ctrl & 4) >> 1) | ((this.ctrl & 8) >> 3); }
  writeCtrl(d) { this.ctrl = d & 0xFF; }
  writeData(d) {
    if ((this.ctrl & 0x11) !== 0) return;          // /CS and /WR must be low
    const v = rev8(d), r = this.reg();
    if (r === 0) this.command(v);
    else if (r === 1) this.params.push(v);
    else if (r === 3) this.control(v);
  }
  readData() {
    if ((this.ctrl & 0x12) !== 0) return 0xFF;     // /CS and /RD must be low
    const r = this.reg();
    let v = 0;
    if (r === 0) {
      if (this.busy) v |= 1;
      if (this.result.length) v |= 2;
      if (this.attention) v |= 0x80;
    } else if (r === 1) v = this.result.length ? this.result.shift() : 0;
    else if (r === 3) v = 1 | 8 | (this.result.length ? 0 : 4);
    return rev8(v);
  }
  control(v) {
    if (v === 0x01) { this.busy = false; this.params = []; }
    else if (v === 0x02) this.attention = false;
    else if (v === 0x40) this.params = [];
    else if (v === 0xC7) this.reset();
  }
  command(cmd) {
    const p = this.params;
    this.lastCmd = cmd; this.commands.push([cmd, p.slice()]);
    this.params = []; this.busy = false; this.attention = false;
    if (cmd === 0x40 && p.length >= 3 && (p[0] | p[1] | p[2])) {
      this.position = bcd(p[0]) * 60 + bcd(p[1]) + bcd(p[2]) / 75;
      this.cuePoints.push(this.position);
      this.playing = true; this.newCue = true;
    } else if (cmd === 0x41 || cmd === 0x51) this.playing = false;
    this.result = [0x00, 0x00];
  }
}

/* ============================================================== MOS 6551 */
/* Vision Quest swaps the DACIA for a plain 6551 at $D000-$D003.  As with the
 * DACIA, TDRE has to be set at reset or the transmit loop never starts. */
class MOS6551 {
  constructor(cpuHz, baud, irqCb, txCb) {
    this.byteCycles = Math.floor(cpuHz * 10 / baud);
    this.irqCb = irqCb; this.txCb = txCb;
    this.status = 0x10; this.command = 0; this.control = 0;
    this.rdr = 0; this.tdr = 0; this.tx = 0; this.rxq = []; this.rxBusy = 0;
    this.irq = 0;
  }
  read(off) {
    const r = off & 3;
    if (r === 0) { this.status &= ~0x0C; this.setIrq(0); return this.rdr; }
    if (r === 1) { const v = this.status; this.status &= ~0x80; this.setIrq(0); return v; }
    if (r === 2) return this.command;
    return this.control;
  }
  write(off, d) {
    d &= 0xFF;
    const r = off & 3;
    if (r === 0) { this.tdr = d; this.status &= ~0x10; this.tx = this.byteCycles; }
    else if (r === 1) { this.status = 0x10; this.command &= 0xE0; this.setIrq(0); }
    else if (r === 2) this.command = d;
    else this.control = d;
  }
  receiveByte(b) { this.rxq.push(b & 0xFF); }
  setIrq(st) {
    st = st ? 1 : 0;
    if (st) this.status |= 0x80;
    if (st !== this.irq) { this.irq = st; this.irqCb(st); }
  }
  tick(cycles) {
    if (this.tx > 0) {
      this.tx -= cycles;
      if (this.tx <= 0) {
        this.tx = 0; this.status |= 0x10; this.txCb(this.tdr);
        if ((this.command & 0x0C) === 0x04) this.setIrq(1);
      }
    }
    if (this.rxBusy > 0) this.rxBusy -= cycles;
    if (this.rxBusy <= 0 && this.rxq.length) {
      this.rdr = this.rxq.shift(); this.status |= 0x08;
      this.rxBusy = this.byteCycles;
      if (!(this.command & 0x02)) this.setIrq(1);
    }
  }
}

/* ============================================================== MSM6242 */
/* Real time clock at $C000 on the Revelations board: BCD nibbles. */
class MSM6242 {
  constructor() { this.ctrl = [0, 0, 0]; }
  read(off) {
    const r = off & 15, t = new Date();
    const v = [t.getSeconds() % 10, (t.getSeconds() / 10) | 0,
               t.getMinutes() % 10, (t.getMinutes() / 10) | 0,
               t.getHours() % 10, (t.getHours() / 10) | 0,
               t.getDate() % 10, (t.getDate() / 10) | 0,
               (t.getMonth() + 1) % 10, ((t.getMonth() + 1) / 10) | 0,
               (t.getFullYear() % 100) % 10, ((t.getFullYear() % 100) / 10) | 0,
               t.getDay(), this.ctrl[0], this.ctrl[1], this.ctrl[2]];
    return v[r] & 15;
  }
  write(off, d) { const r = off & 15; if (r >= 13) this.ctrl[r - 13] = d & 15; }
}

/* ============================================================ the machine */
const CPU_CLOCK = 1000000;
const DIGIT_ADDRS = [0x0004, 0x0008, 0x0010, 0x0020, 0x0040, 0x0002, 0x0001,
                     0x0080, 0x1000, 0x0800, 0x0400, 0x2000, 0x4000, 0x0200,
                     0x0100, 0x8000];
const DIGIT_BITSWAP = [4, 5, 12, 1, 0, 11, 10, 6, 7, 2, 9, 3, 15, 8, 14, 13];
/* One board, four games: the Cops light gun cabinet and the Nova quiz
 * machines Revelations (1991) and Vision Quest (1992), which share this
 * hardware and the Nova quiz laserdisc but drop the gun VIA, the CD-ROM VIA
 * and the steering, add an MSM6242 clock at $C000 (Revelations) and use a
 * 6551 ACIA instead of the DACIA (Vision Quest). */
const SYSTEMS = {
  cops:     { guns: true,  cdrom: true,  steer: true,  rtc: false, serial: 'dacia', io1: 'cops', title: 'Cops (USA)' },
  copsuk:   { guns: true,  cdrom: true,  steer: true,  rtc: false, serial: 'dacia', io1: 'cops', title: 'Cops (UK)' },
  revlatns: { guns: false, cdrom: false, steer: false, rtc: true,  serial: 'dacia', io1: 'quiz', title: 'Revelations' },
  visnqust: { guns: false, cdrom: false, steer: false, rtc: false, serial: 'acia',  io1: 'quiz', title: 'Vision Quest' }
};
const QUIZ_LAMP_NAMES = ['20p', '40p', 'GBP 1', 'GBP 2', 'GBP 5', 'GBP 10',
  'GBP 20', 'win', 'A', 'B', 'collect', 'C', 'continue', 'star'];
const LAMP_NAMES = ['offroad L1', 'offroad L2', 'offroad L3', 'offroad L4',
  'offroad R1', 'offroad R2', 'offroad R3', 'offroad R4', 'vest 1', 'vest 2',
  'vest 3', 'gun active left', 'gun active right', 'stop', 'damage',
  'flash red', 'flash blue', 'bullet 1', 'bullet 2', 'bullet 3', 'bullet 4',
  'bullet 5', 'bullet 6'];

class CopsMachine {
  constructor(prg, sys, opts) {
    opts = opts || {};
    this.system = opts.system || 'cops';
    this.cfg = SYSTEMS[this.system];
    this.prg = prg;
    // Vision Quest's 8K system ROM is mirrored through all four banks
    if (sys.length < 0x8000) {
      const full = new Uint8Array(0x8000);
      for (let i = 0; i < 0x8000; i++) full[i] = sys[i % sys.length];
      sys = full;
    }
    this.sys = sys; this.sysbank = 2;
    this.ram = new Uint8Array(0x2000);
    if (opts.nvram) this.ram.set(opts.nvram.subarray(0, 0x2000));
    this.meters = [0, 0];
    this.digits = new Array(16).fill(0);
    this.lamps = new Array(23).fill(0);
    this.watchdogCycles = 0; this.watchdogKicks = 0; this.resets = 0;
    this.inputs = {
      sw0: 0xFF, sw1: 0xFF, sw2: 0x7F, steer: 0x80,
      gun: [{ x: 64, y: 64, offscreen: false, trigger: false },
            { x: 64, y: 64, offscreen: false, trigger: false }]
    };
    this.gunLatch = [0x40, 0x40]; this.gunToggle = 0;
    this.gunLatched = [false, false];
    this.gunAutoFire = false;
    this.lcd = [0, 0, 0, 0];
    this.serialToLdp = []; this.serialFromLdp = [];
    this.snWrites = [];    // [cpuCycle, value] pairs for the audio thread
    this.snPort = 0;
    this.snCb2 = 1;
    this.cd = this.cfg.cdrom ? new CDU33A() : null;
    this.rtc = this.cfg.rtc ? new MSM6242() : null;
    this.ldp = new LDP1450(opts.videoFrames || 54000, b => {
      this.serialFromLdp.push(b);
      if (this.acia) this.acia.receiveByte(b); else this.dacia.receiveByte(0, b);
    });
    if (this.cfg.serial === 'acia') {
      this.acia = new MOS6551(CPU_CLOCK, 9600, st => this.daciaIrq(0, st),
        b => { this.serialToLdp.push(b); this.ldp.rxByte(b); });
      this.dacia = null;
    } else {
      this.dacia = new R65C52(CPU_CLOCK, 9600,
        (i, s) => this.daciaIrq(i, s),
        (i, b) => { if (i === 0) { this.serialToLdp.push(b); this.ldp.rxByte(b); } });
      this.acia = null;
    }
    this.serial = this.acia || this.dacia;
    this.irqState = 0; this.acia1 = 0; this.acia2 = 0;
    this.via1 = new VIA6522({
      irq: s => { this.irqState = s ? (this.irqState | 1) : (this.irqState & ~1); this.updateIrq(); },
      readPa: () => ((this.inputs.steer >> 5) & 7) | 0xF8,
      // $2941: PCR $E0 puts CB2 high, the byte goes to port B, then PCR $C0
      // drops CB2 and the SN76489 latches it.  cops.cpp watches CB1 instead,
      // which never toggles with this PCR setting - hence MACHINE_NO_SOUND.
      writePb: d => { this.snPort = rev8(d); },
      writeCb2: st => {
        st = st ? 1 : 0;
        if (this.snCb2 && !st) this.snWrites.push([this.cpu.cycles, this.snPort]);
        this.snCb2 = st;
      }
    });
    this.via2 = this.cfg.guns ? new VIA6522({
      irq: s => { this.irqState = s ? (this.irqState | 2) : (this.irqState & ~2); this.updateIrq(); },
      readPa: () => this.gunLatch[0] & 0x7F,
      readPb: () => this.gunLatch[1] & 0x7F
    }) : null;
    this.via3 = this.cfg.cdrom ? new VIA6522({
      readPa: () => this.cd.readData(),
      writePa: d => this.cd.writeData(d),
      writePb: d => this.cd.writeCtrl(d)
    }) : null;
    this.cpu = new M6502(this);
    this.cpu.reset();
  }
  updateIrq() { this.cpu.setIrq(this.irqState !== 0); }
  daciaIrq(i, s) {
    // NOT inverted, unlike cops.cpp - see the header comment
    if (i === 0) this.acia1 = s; else this.acia2 = s;
    this.cpu.setNmi(this.acia1 || this.acia2);
  }

  read(a) {
    a &= 0xFFFF;
    if (a < 0x2000) return this.ram[a];
    if (a < 0xA000) return this.prg[a - 0x2000];
    if (a < 0xB000) return this.io1r(a & 15);
    if (a < 0xB010) return this.via1.read(a & 15);
    if (a >= 0xB800 && a < 0xB810 && this.via2) return this.via2.read(a & 15);
    if (a >= 0xC000 && a < 0xD000) {
      if (this.rtc) return this.rtc.read(a & 15);
      if (this.cfg.steer) return this.io2r(a & 15);
      return 0;
    }
    if (a >= 0xD000 && a < 0xD008)
      return this.acia ? this.acia.read(a & 3) : this.dacia.read(a & 7);
    if (a >= 0xD800 && a < 0xD810 && this.via3) return this.via3.read(a & 15);
    if (a >= 0xE000) return this.sys[this.sysbank * 0x2000 + (a - 0xE000)];
    return 0;
  }
  write(a, v) {
    a &= 0xFFFF; v &= 0xFF;
    if (a < 0x2000) { this.ram[a] = v; return; }
    if (a < 0xA000) return;
    if (a < 0xB000) { this.io1w(a & 15, v); return; }
    if (a < 0xB010) { this.via1.write(a & 15, v); return; }
    if (a >= 0xB800 && a < 0xB810 && this.via2) { this.via2.write(a & 15, v); return; }
    if (a >= 0xC000 && a < 0xD000) {
      if (this.rtc) this.rtc.write(a & 15, v);
      else if (this.cfg.steer) this.io2w(a & 15, v);
      return;
    }
    if (a >= 0xD000 && a < 0xD008) {
      if (this.acia) this.acia.write(a & 3, v); else this.dacia.write(a & 7, v);
      return;
    }
    if (a >= 0xD800 && a < 0xD810 && this.via3) { this.via3.write(a & 15, v); return; }
  }
  triggerMask() {
    // gun 1 trigger = Switch A (SW0 bit 0), gun 2 = Switch B (bit 7),
    // both active low.  The reload handler at $86F6 / $72C2 tests $42 bit 0,
    // which the input service fills in from SW0 bit 0.
    let m = 0;
    if (this.inputs.gun[0].trigger) m |= 0x01;
    if (this.inputs.gun[1].trigger) m |= 0x80;
    return m;
  }
  pull(gun, state) { this.inputs.gun[gun].trigger = !!state; }
  reload(gun, state) {
    // off the screen the sensor sees no beam, so no position is latched and
    // holding the trigger reloads the cylinder
    this.inputs.gun[gun].offscreen = !!state;
    this.inputs.gun[gun].trigger = !!state;
  }
  io1r(r) {
    if (r === 7) return 1;
    if (r === 8) return this.cfg.guns
      ? (this.inputs.sw0 & ~this.triggerMask() & 0xFF) : this.inputs.sw0;
    if (r === 9) return this.inputs.sw1;
    if (r === 10) return this.inputs.sw2;
    return 0;
  }
  io1w(r, d) {
    if (r === 0) this.lcd[0] = d;
    else if (r === 1) {
      this.lcd[1] = d;
      const addr = this.lcd[0] | (this.lcd[1] << 8);
      const i = DIGIT_ADDRS.indexOf(addr);
      if (i >= 0) {
        const src = this.lcd[2] | (this.lcd[3] << 8);
        let out = 0;
        for (let p = 0; p < 16; p++) if (src & (1 << DIGIT_BITSWAP[p])) out |= 1 << (15 - p);
        this.digits[i] = out;
      }
    } else if (r === 2) this.lcd[2] = d;
    else if (r === 3) this.lcd[3] = d;
    else if (r === 4) {
      if (this.cfg.io1 === 'quiz') { for (let i = 0; i < 8; i++) this.lamps[i] = (d >> i) & 1; }
      else for (let i = 0; i < 4; i++) { this.lamps[i + 4] = (d >> (i + 4)) & 1; this.lamps[i] = (d >> i) & 1; }
    }
    else if (r === 5 && this.cfg.io1 === 'quiz') {
      this.lamps[8] = d & 1; this.lamps[9] = (d >> 1) & 1;
      this.lamps[10] = (d >> 2) & 1; this.meters[0] = (d >> 3) & 1;
      this.lamps[11] = (d >> 4) & 1; this.lamps[12] = (d >> 5) & 1;
      this.meters[1] = (d >> 6) & 1; this.lamps[13] = (d >> 7) & 1;
    }
    else if (r === 5) {
      this.lamps[14] = (d >> 7) & 1; this.lamps[13] = (d >> 6) & 1;
      this.lamps[12] = (d >> 5) & 1; this.lamps[9] = (d >> 4) & 1;
      this.lamps[10] = (d >> 2) & 1; this.lamps[11] = (d >> 1) & 1;
      this.lamps[8] = d & 1;
    } else if (r === 7) { this.watchdogCycles = 0; this.watchdogKicks++; }
  }
  io2r(r) { return r === 3 ? this.inputs.steer : 0; }
  io2w(r, d) {
    if (r === 2) { this.lamps[15] = d & 1; this.lamps[16] = (d >> 7) & 1; }
    else if (r === 4) for (let i = 0; i < 6; i++) this.lamps[17 + i] = (d >> i) & 1;
  }
  /* Latching a position IS the shot: the gun only sees the beam while the
   * trigger is pulled.  $86E9 / $72BE read $47, and a cleared bit 7 means a
   * fresh position arrived -> fire; bit 7 still set with the trigger held for
   * three frames -> reload.  $71A2 puts bit 7 back after every shot. */
  gunStrobe(index) {
    if (index === undefined) { index = this.gunToggle; this.gunToggle ^= 1; }
    const g = this.inputs.gun[index];
    if (!g.trigger) { this.gunLatched[index] = false; return; }
    if (g.offscreen) return;                       // no beam -> reload path
    if (this.gunLatched[index] && !this.gunAutoFire) return;
    this.gunLatched[index] = true;
    this.gunLatch = [g.x & 0x7F, g.y & 0x7F];
    this.via2.writeCa1(0); this.via2.writeCa1(1);
  }
  runCycles(n, slice) {
    slice = slice || 64;
    let done = 0;
    while (done < n) {
      const chunk = Math.min(slice, n - done);
      const target = this.cpu.cycles + chunk;
      while (this.cpu.cycles < target) this.cpu.step();
      this.via1.tick(chunk);
      if (this.via2) this.via2.tick(chunk);
      if (this.via3) this.via3.tick(chunk);
      this.serial.tick(chunk);
      this.ldp.tickUs(chunk * 1000000 / CPU_CLOCK);
      this.watchdogCycles += chunk;
      if (this.watchdogCycles > CPU_CLOCK * 1.6) {
        this.watchdogCycles = 0; this.resets++; this.cpu.reset();
      }
      done += chunk;
    }
  }
  runFrame(fps) {
    const c = Math.floor(CPU_CLOCK / (fps || 29.97));
    this.runCycles(c >> 1);
    if (this.via2) this.gunStrobe();
    this.runCycles(c - (c >> 1));
    if (this.via2) this.gunStrobe();
    this.ldp.frameTick();
  }
  activeLamps() {
    const names = this.cfg.io1 === 'quiz' ? QUIZ_LAMP_NAMES : LAMP_NAMES;
    const out = [];
    this.lamps.forEach((v, i) => { if (v && names[i]) out.push(names[i]); });
    return out;
  }
  // switch helpers: SW0 bit0 = Switch A = gun 1 trigger,
  //                 bit7 = Switch B = gun 2 trigger, bit1 = Switch C,
  //                 bit2 = PROGRAM, bit3 = COIN2, bit4 = SERVICE,
  //                 bit5 = COIN1, bit6 = START.  All active low.
  setSwitch(name, state) {
    // quiz panel: A / C / COLLECT / coin / service / coin / CONTINUE / B on
    // SW0, '*' and the doors on SW1, the coin mechs on SW2
    const bits = this.cfg.io1 === 'quiz'
      ? { A: [0, 0x01], C: [0, 0x02], COLLECT: [0, 0x04], COIN2: [0, 0x08],
          SERVICE: [0, 0x10], COIN1: [0, 0x20], CONTINUE: [0, 0x40], B: [0, 0x80],
          REFILL: [1, 0x01], CASHBOX: [1, 0x02], STAR: [1, 0x20],
          BACKDOOR: [1, 0x40], '50P': [2, 0x01], '20P': [2, 0x02],
          '10P': [2, 0x04], '100P': [2, 0x08] }
      : { A: [0, 0x01], C: [0, 0x02], PROGRAM: [0, 0x04], COIN2: [0, 0x08],
          SERVICE: [0, 0x10], COIN1: [0, 0x20], START: [0, 0x40], B: [0, 0x80],
          GAS: [1, 0x02], SERVICE2: [1, 0x40] };
    const e = bits[name];
    if (!e) return;
    const key = ['sw0', 'sw1', 'sw2'][e[0]];
    this.inputs[key] = state ? (this.inputs[key] & ~e[1]) : (this.inputs[key] | e[1]);
  }
}


return { CopsMachine };
})();
function segPolys(x, y, w, h) {
  const t = Math.max(1.5, w * 0.16), mx = x + w / 2, my = y + h / 2;
  return [
    [[x + t, y], [x + w - t, y], [x + w - t * 1.5, y + t], [x + t * 1.5, y + t]],
    [[x + w, y + t], [x + w, my - t / 2], [x + w - t, my - t], [x + w - t, y + t * 1.5]],
    [[x + w, my + t / 2], [x + w, y + h - t], [x + w - t, y + h - t * 1.5], [x + w - t, my + t]],
    [[x + t, y + h], [x + w - t, y + h], [x + w - t * 1.5, y + h - t], [x + t * 1.5, y + h - t]],
    [[x, my + t / 2], [x, y + h - t], [x + t, y + h - t * 1.5], [x + t, my + t]],
    [[x, y + t], [x, my - t / 2], [x + t, my - t], [x + t, y + t * 1.5]],
    [[x + t, my - t / 2], [mx - t / 2, my - t / 2], [mx - t / 2, my + t / 2], [x + t, my + t / 2]],
    [[mx + t / 2, my - t / 2], [x + w - t, my - t / 2], [x + w - t, my + t / 2], [mx + t / 2, my + t / 2]],
    [[mx - t / 3, y + t], [mx + t / 3, y + t], [mx + t / 3, my - t / 2], [mx - t / 3, my - t / 2]],
    [[mx - t / 3, my + t / 2], [mx + t / 3, my + t / 2], [mx + t / 3, y + h - t], [mx - t / 3, y + h - t]],
    [[x + t * 1.2, y + h - t * 1.2], [x + t * 2.2, y + h - t * 1.2], [mx - t / 2, my + t], [mx - t / 2, my + t * 2]],
    [[x + t * 1.2, y + t * 1.2], [x + t * 2.2, y + t * 1.2], [mx - t / 2, my - t], [mx - t / 2, my - t * 2]],
    [[x + w - t * 1.2, y + t * 1.2], [x + w - t * 2.2, y + t * 1.2], [mx + t / 2, my - t], [mx + t / 2, my - t * 2]],
    [[x + w - t * 1.2, y + h - t * 1.2], [x + w - t * 2.2, y + h - t * 1.2], [mx + t / 2, my + t], [mx + t / 2, my + t * 2]]
  ];
}

/* ==========================================================================
 *  COPS / Revelations / Vision Quest (Nova Productions 1994-96) — nativo.
 *  Núcleo de Luis (port del emulador Python de referencia): 6502, 3× VIA6522,
 *  R65C52 hacia el Sony LDP-1450 (con el generador de caracteres User Index),
 *  Sony CDU33A, RTC, SN76489. Aquí se conecta al receptor: video por
 *  DiscVideo (mp4 local o en línea), sonido SN76489, pistolas con ratón/mando.
 * ========================================================================== */
const COPS_SETS = {
  cops:     { prg: [['cops', 'cops_prg.dat']], sys: [['cops', 'cops_sys.dat']] },
  copsuk:   { prg: [['copsuk', 'cops1b_uk.bin']], sys: [['cops', 'cops_sys.dat']] },
  revlatns: { prg: [['revlatns', 'revelations_prog.u31']], sys: [['revlatns', 'revelations_sys.u17']], nv: [['revlatns', 'default_nvram']] },
  visnqust: { prg: [['visnqust', 'visionquest.u33']], sys: [['visnqust', 'visionquest.u14']], nv: [['visnqust', 'default_nvram']] }
};
async function drvCops(lib, set, env) {
  const res = { missing: [], loaded: [] }, def = COPS_SETS[set] || COPS_SETS.cops;
  const pick = async list => {
    if (!list) return null;
    for (const [s, n] of list) {
      let r = (lib.sets[s] || []).find(x => x.name === n.toLowerCase());
      if (!r) for (const k in lib.sets) { r = lib.sets[k].find(x => x.name === n.toLowerCase()); if (r) break; }
      if (r) { res.loaded.push(n); return await lib.get(r); }
      res.missing.push(n);
    }
    return null;
  };
  const prg = await pick(def.prg), sys = await pick(def.sys), nv0 = await pick(def.nv);
  let nvram = nv0;
  try { const s = localStorage.getItem('ddn.nv.' + set); if (s) { const b = atob(s); nvram = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) nvram[i] = b.charCodeAt(i); } } catch (e) {}
  if (!prg || !sys) return { name: set, res, ow: 320, oh: 240, ldp: new LDP(29.97), runField() {}, draw(b) { b.fill(rgba(0, 0, 40)); }, input() {}, sample() { return 0; }, status() { return 'faltan ROMs'; } };
  const M = new COPSCORE.CopsMachine(prg, sys, { system: set, nvram, videoFrames: 108000 });
  const sn = makeSN76496(2000000, env.sampleRate);
  const L = M.ldp, PLAYING = [3, 4, 6, 8];
  const ldp = {
    get frame() { return L.currFrame; }, frac: 0,
    get status() { return !L.videoEnabled ? LDP_PAUSED : PLAYING.includes(L.mode) ? LDP_PLAYING : LDP_PAUSED; },
    get target() { return L.currFrame; }, fps: 29.97,
    get speedNum() { return L.mode === 4 ? Math.max(1, Math.round(L.speed / 60)) : 1; }, speedDen: 1,
    get audio1() { return !L.audioSquelch[0]; }, get audio2() { return !L.audioSquelch[1]; },
    get curFrame() { return L.currFrame; }, squelchSearch: true,
    get log() { return (L.commandLog || []).slice(-6).map(c => c[0].toString(16) + '@' + c[1]); }
  };
  const W = 360, H = 270;
  let cv = null, cx = null, field = 0, lastKey = '', fc = 0;
  if (typeof document !== 'undefined') { cv = document.createElement('canvas'); cv.width = W; cv.height = H; cx = cv.getContext('2d', { willReadFrequently: true }); }
  const gunFromXY = (gun, x, y) => {
    const g = M.inputs.gun[gun]; if (!g || g.reloading) return;
    const inside = x >= 0 && y >= 0 && x < W && y < H * 0.9;
    g.offscreen = !inside; if (inside) { g.x = Math.max(0, Math.min(127, Math.round(x / W * 127))); g.y = Math.max(0, Math.min(127, Math.round(y / (H * 0.9) * 127))); }
  };
  let steerV = 0, pad2 = { x: W / 2, y: H / 2 };
  const G = {
    name: set, fps: 29.97, ldp, res, ow: W, oh: H, analog: true, players: M.cfg.guns ? 2 : 1,
    get videoBlank() { return !L.videoEnabled; },
    runField() {
      if (steerV) M.inputs.steer = Math.max(0, Math.min(255, M.inputs.steer + steerV * 8)); else M.inputs.steer += (0x80 - M.inputs.steer) * 0.3 | 0;
      if (++field & 1) M.runFrame(29.97);
      if (M.snWrites.length) { for (const w of M.snWrites) sn.write(w[1]); M.snWrites = []; }
      if (++fc % 600 === 0) { try { let s = ''; for (const b of M.ram) s += String.fromCharCode(b); localStorage.setItem('ddn.nv.' + set, btoa(s)); } catch (e) {} }
    },
    analog(x, y) { if (M.cfg.guns) gunFromXY(0, x, y); },
    input(sw, d) {
      switch (sw) {
        case SW.COIN1: M.setSwitch('COIN1', d); break; case SW.COIN2: M.setSwitch('COIN2', d); break;
        case SW.SERVICE: M.setSwitch('SERVICE', d); break; case SW.TEST: M.setSwitch('PROGRAM', d); break;
        case SW.START1: M.setSwitch(M.cfg.io1 === 'quiz' ? 'CONTINUE' : 'START', d); break;
        case SW.BUTTON1: if (M.cfg.guns) { M.pull(0, d); if (!d) M.inputs.gun[0].reloading = false; } else M.setSwitch('A', d); break;
        case SW.BUTTON2: if (M.cfg.guns) { M.inputs.gun[0].reloading = d; M.reload(0, d); } else M.setSwitch('B', d); break;
        case SW.BUTTON3: M.setSwitch(M.cfg.io1 === 'quiz' ? 'COLLECT' : 'C', d); break;
        case SW.SKILL1: if (M.cfg.io1 === 'quiz') M.setSwitch('C', d); break;
        case SW.UP: if (M.cfg.steer) M.setSwitch('GAS', d); break;
        case SW.LEFT: steerV = d ? -1 : (steerV === -1 ? 0 : steerV); break;
        case SW.RIGHT: steerV = d ? 1 : (steerV === 1 ? 0 : steerV); break;
      }
    },
    /* mando del jugador 2 = segunda pistola */
    gamepad(seat, gp, prev) {
      if (seat !== 1 || !M.cfg.guns) return;
      const bt = n => !!(gp.buttons[n] && gp.buttons[n].pressed);
      let ax = gp.axes[0] || 0, ay = gp.axes[1] || 0; if (Math.abs(ax) < 0.15) ax = 0; if (Math.abs(ay) < 0.15) ay = 0;
      pad2.x = Math.max(0, Math.min(W - 1, pad2.x + ax * 6)); pad2.y = Math.max(0, Math.min(H * 0.9 - 1, pad2.y + ay * 5)); gunFromXY(1, pad2.x, pad2.y);
      if (bt(0) !== !!(prev && prev[0])) { M.pull(1, bt(0)); if (!bt(0)) M.inputs.gun[1].reloading = false; }
      if (bt(1) !== !!(prev && prev[1])) { M.inputs.gun[1].reloading = bt(1); M.reload(1, bt(1)); }
    },
    draw(buf) {
      if (!cx) { buf.fill(0); return; }
      const osd = L.osdText(), lamps = M.activeLamps();
      const key = JSON.stringify(osd) + M.digits.join(',') + lamps.join(',') + M.inputs.gun.map(g => g.x + '.' + g.y).join();
      if (key !== lastKey) {
        lastKey = key; cx.clearRect(0, 0, W, H);
        if (osd && osd.text.length) {
          if (osd.blueScreen) { cx.fillStyle = '#0000a0'; cx.fillRect(0, 0, W, H * 0.9); }
          const sc = W / 720, cw = osd.charW * sc, ch = osd.charH * sc, x0 = (W / 128) * osd.x, y0 = (H * 0.9 / 64) * osd.y;
          cx.font = Math.max(6, Math.round(ch * 0.95)) + 'px monospace'; cx.textBaseline = 'top';
          const lines = osd.threeLine ? [osd.text.slice(0, 10), osd.text.slice(10, 20), osd.text.slice(20, 30)] : [osd.text];
          lines.forEach((ln, r) => { for (let i = 0; i < ln.length; i++) { const x = x0 + cw * i, y = y0 + ch * r;
            if (osd.style === 3) { cx.fillStyle = 'rgba(128,128,128,0.8)'; cx.fillRect(x, y, cw, ch); }
            if (osd.style === 1) { cx.fillStyle = '#000'; cx.fillText(ln[i], x + 1, y + 1); }
            cx.fillStyle = '#fff'; cx.fillText(ln[i], x, y); } });
        }
        /* panel: 16 dígitos de 14 segmentos + lámparas */
        const ph = H * 0.1, py = H - ph; cx.fillStyle = 'rgba(0,0,0,0.85)'; cx.fillRect(0, py, W, ph);
        const dw = W / 20;
        for (let i = 0; i < 16; i++) { const polys = segPolys(W * 0.09 + dw * i + dw * 0.12, py + ph * 0.15, dw * 0.6, ph * 0.7);
          for (let bit = 0; bit < 14; bit++) { const p = polys[bit]; cx.beginPath(); cx.moveTo(p[0][0], p[0][1]); for (let k = 1; k < p.length; k++) cx.lineTo(p[k][0], p[k][1]); cx.closePath();
            cx.fillStyle = ((M.digits[i] >> bit) & 1) ? '#ff8a3c' : '#2a1710'; cx.fill(); } }
        if (lamps.includes('flash red')) { cx.fillStyle = 'rgba(255,0,0,0.85)'; cx.fillRect(0, 0, W / 2, 3); }
        if (lamps.includes('flash blue')) { cx.fillStyle = 'rgba(0,90,255,0.85)'; cx.fillRect(W / 2, 0, W / 2, 3); }
        if (M.cfg.guns) M.inputs.gun.forEach((g, i) => { const x = g.x / 127 * W, y = g.y / 127 * H * 0.9; cx.strokeStyle = i ? '#3cf' : '#f43'; cx.lineWidth = 1.5;
          cx.beginPath(); cx.arc(x, y, 6, 0, 7); cx.moveTo(x - 9, y); cx.lineTo(x + 9, y); cx.moveTo(x, y - 9); cx.lineTo(x, y + 9); cx.stroke(); });
        G._img = new Uint32Array(cx.getImageData(0, 0, W, H).data.buffer.slice(0));
      }
      if (G._img) buf.set(G._img);
    },
    sample() { return sn.sample() * 0.6; },
    status() { return 'PC ' + M.cpu.pc.toString(16).padStart(4, '0') + ' · LDP-1450 modo ' + L.mode + ' cuadro ' + L.currFrame; }
  };
  return G;
}
DRIVERS.cops = drvCops;
