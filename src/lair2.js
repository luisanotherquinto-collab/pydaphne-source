/* ==========================================================================
 *  Dragon's Lair II: Time Warp / Space Ace '91 (Leland/Sullivan Bluth 1991) —
 *  portado de hypseus-singe/src/game/lair2.cpp: placa tipo PC con 8088 a
 *  10 MHz, timer INT 1Ch, COM2 (8250) hacia un Sony LDP-1450 con su generador
 *  de texto (los puntajes se dibujan con el texto del reproductor), altavoz PC
 *  por el 8253 y EEPROM 93C46/9536 serie para los ajustes.
 * ========================================================================== */
'use strict';
const LDP_FONT = (() => {
  const g = {}, d = {
    ' ': '00000000000000', '0': '0e11131519110e', '1': '040c040404040e', '2': '0e11010204081f', '3': '1f020402010110e'.slice(0, 14), '4': '02060a121f0202',
    '5': '1f101e0101110e', '6': '0608101e11110e', '7': '1f010204080808', '8': '0e11110e11110e', '9': '0e11110f01020c', 'A': '0e11111f111111',
    'B': '1e11111e11111e', 'C': '0e11101010110e', 'D': '1c12111111121c', 'E': '1f10101e10101f', 'F': '1f10101e101010', 'G': '0e11101713110f',
    'H': '1111111f111111', 'I': '0e04040404040e', 'J': '07020202021208', 'K': '11121418141211', 'L': '1010101010101f', 'M': '111b1515111111',
    'N': '11111915131111', 'O': '0e11111111110e', 'P': '1e11111e101010', 'Q': '0e11111115120d', 'R': '1e11111e141211', 'S': '0f10100e01011e',
    'T': '1f040404040404', 'U': '1111111111110e', 'V': '11111111110a04', 'W': '11111115151b11', 'X': '11110a040a1111', 'Y': '11110a04040404',
    'Z': '1f01020408101f', '-': '0000001f000000', ':': '000c0c000c0c00', '.': '0000000000 0c0c'.replace(' ', ''), ',': '00000000 0c0408'.replace(' ', ''),
    '!': '04040404040004', '?': '0e110102040004', "'": '0c040800000000', '/': '01010204081010', '=': '00001f001f0000', '+': '0004041f040400'
  };
  for (const k in d) { const h = d[k].padEnd(14, '0'), r = []; for (let i = 0; i < 7; i++) r.push(parseInt(h.substr(i * 2, 2), 16)); g[k] = r; }
  return g;
})();

class LDP1450 extends LDP1000 {
  constructor(ldp, m) { super(ldp, m); this.T = { cmd: false, getXY: 0, gx: 0, gy: 0, x: 0, y: 0, mode: 0, win: false, str: false, got00: false, line: 0, buf: '', on: true }; this.lines = ['', '', '']; this.lx = 0; this.ly = 0; }
  write(v) {
    const T = this.T;
    if (T.getXY) { if (!T.gx) { T.gx = 1; T.x = v; } else if (!T.gy) { T.gy = 1; T.y = v; } else { T.mode = v; T.getXY = 0; } this.q.push(0x0A); return; }
    if (T.win) { T.win = false; this.q.push(0x0A); return; }
    if (T.str) {
      if ((v === 0 || v === 0x0A || v === 0x14) && !T.got00) { T.line = v / 10 | 0; T.got00 = true; }
      else if (v !== 0x1A) { if (v >= 0x20 || v === 0x13) T.buf += String.fromCharCode(v === 0x13 ? 0x20 : v); }
      else {
        if ((T.buf.match(/ /g) || []).length > 20) this.lines = ['', '', ''];
        else this.lines[T.line] = T.buf;
        this.lx = T.x; this.ly = T.y; T.buf = ''; T.str = false; T.got00 = false;
      }
      this.q.push(0x0A); return;
    }
    switch (v) {
      case 0x00: if (T.cmd) { T.getXY = 1; T.gx = T.gy = 0; T.cmd = false; this.q.push(0x0A); return; } break;
      case 0x01: if (T.cmd) { T.str = true; T.cmd = false; this.q.push(0x0A); return; } break;
      case 0x02: if (T.cmd) { T.win = true; this.q.push(0x0A); return; } break;
      case 0x80: T.cmd = true; this.q.push(0x0A); return;
      case 0x81: T.on = true; this.q.push(0x0A); return;
      case 0x82: T.on = false; this.q.push(0x0A); return;
    }
    super.write(v);
  }
}

async function drvLair2(lib, set, env) {
  const mem = new Uint8Array(0x100000);
  const romName = set === 'ace91' ? 'ace91.bin' : 'dl2_319.bin', crc = set === 'ace91' ? 0xde93a213 : 0xe9453a1b;
  const rec = lib.find(romName, crc, set, set);
  const res = { missing: [], loaded: [] };
  if (rec) { mem.set((await lib.get(rec)).subarray(0, 0x10000), 0xF0000); res.loaded.push(romName); } else res.missing.push(romName);
  const eep = new Uint16Array(64);
  try { const s = localStorage.getItem('ddn.nv.' + set); if (s) eep.set(JSON.parse(s)); } catch (e) {}
  const m = new Machine(), ldp = new LDP(23.976), sony = new LDP1450(ldp, m);
  ldp.play();                                    /* el LDP-1450 arranca reproduciendo */
  const banks = new Uint8Array([0xFF, 0x01]), coins = [0, 0];
  const serBuf = []; let serIE = false, port61 = 0, pitLatch = 0, pitDiv = 0, pitPhase = 0, beep = 0, eepDirty = 0;
  /* EEPROM serie 9536 (hypseus EEPROM_9536_write) */
  const E = { op: 0xFF, data: 0, addr: 0, ac: 0, bc: 0, old: 0 };
  const eepWrite = v => {
    if (v & 4) {
      if ((v & 2) && !(E.old & 2)) {
        if (E.op === 0xFF) { E.data = ((E.data << 1) | (v & 1)) & 0xFFFF; if (E.data & 4) E.op = E.data & 3; }
        else if (E.ac < 8) {
          E.addr = ((E.addr << 1) | (v & 1)) & 63; E.ac++;
          if (E.ac === 2 && (E.op === 0 || E.op === 3)) banks[1] |= 1;
          banks[1] = (banks[1] & ~1) | ((eep[E.addr] >> 15) & 1);
        } else {
          if (E.op === 2) banks[1] = (banks[1] & ~1) | ((eep[E.addr] >> (16 - E.bc - 1)) & 1);
          if (E.op === 1) { if (E.bc === 0) eep[E.addr] = 0; eep[E.addr] = ((eep[E.addr] << 1) | (v & 1)) & 0xFFFF; banks[1] |= 1; eepDirty = 1; }
          E.bc++;
        }
      }
    } else { E.op = 0xFF; E.addr = 0; E.data = 0; E.bc = 0; E.ac = 0; }
    E.old = v;
  };
  let cpu;
  const pending = [];
  const raise = vec => { if (!pending.includes(vec)) pending.push(vec); };
  const bus = {
    r8: a => mem[a & 0xFFFFF], w8: (a, v) => { a &= 0xFFFFF; if (a < 0xF0000) mem[a] = v; },
    in: p => {
      switch (p & 0xFFFF) {
        case 0x61: return port61;
        case 0x201: return banks[0];
        case 0x202: return banks[1];
        case 0x2F8: return serBuf.length ? serBuf.shift() : 0;
        case 0x2F9: return serIE ? 1 : 0;
        case 0x2FA: return serBuf.length ? 4 : 1;
        case 0x2FD: case 0x2FE: return 0x30 | 0x40 | (serBuf.length ? 1 : 0);
      }
      return 0;
    },
    out: (p, v) => {
      switch (p & 0xFFFF) {
        case 0x20: if (v === 0x20 && serBuf.length && serIE) raise(0x0B); break;
        case 0x42: if (pitLatch === 0) { pitDiv = (pitDiv & 0xFF00) | v; pitLatch = 1; } else { pitDiv = (pitDiv & 0xFF) | (v << 8); pitLatch = 0; } break;
        case 0x43: if ((v & 0xC0) === 0x80) pitLatch = 0; break;
        case 0x61: port61 = v; break;
        case 0x202:
          if (v & 0x40) { for (let i = 0; i < 2; i++) if (coins[i] > 0) coins[i]--; banks[1] &= ~0x3C; }
          else { let or = 4; for (let i = 0; i < 2; i++) { if (coins[i] > 0) banks[1] |= or; or <<= 1; } }
          eepWrite(v); break;
        case 0x2F8: sony.write(v); break;
        case 0x2F9: serIE = v !== 0; break;
      }
    }
  };
  cpu = m.addCPU(X86CPU(bus), 10000000);
  cpu.reset();
  const origRun = cpu.run;
  cpu.run = n => { const d = origRun(n); if (pending.length && cpu.c.iff && !cpu.c.irqLine) cpu.c.intr(pending.shift()); return d; };
  m.sliceUs = 200;
  m.every(1e6 / 18.2, () => raise(0x1C));
  m.every(9000 / 9.6, () => { let got = false; while (sony.ready && serBuf.length < 1024) { serBuf.push(sony.read()); got = true; } if (serBuf.length && serIE) raise(0x0B); });
  let fc = 0;
  m.every(FIELD_US, () => { sony.field(); if (eepDirty && ++fc % 120 === 0) { eepDirty = 0; try { localStorage.setItem('ddn.nv.' + set, JSON.stringify(Array.from(eep))); } catch (e) {} } });
  const W = 320, H = 240;
  return {
    name: set, fps: 23.976, ldp, m, res, ow: W, oh: H, sony,
    runField() { m.runUs(FIELD_US); },
    input(sw, d) {
      const b = bit => { banks[0] = d ? banks[0] & ~bit : banks[0] | bit; };
      switch (sw) {
        case SW.UP: b(1); break; case SW.DOWN: b(2); break; case SW.LEFT: b(4); break; case SW.RIGHT: b(8); break;
        case SW.BUTTON1: b(0x40); break; case SW.START1: b(0x10); break; case SW.START2: b(0x20); break; case SW.SERVICE: b(0x80); break;
        case SW.COIN1: if (d) coins[0]++; break; case SW.COIN2: if (d) coins[1]++; break;
      }
    },
    get score() { const s = (sony.lines.join(' ').match(/\d{3,}/g) || []).map(Number); return s.length ? Math.max(...s) : 0; },
    draw(buf) {
      buf.fill(0);
      if (!sony.T.on) return;
      const col = rgba(255, 255, 255), sh = rgba(0, 0, 0, 220);
      let y = Math.round(sony.ly * 3.8 - 10);
      const x0 = Math.round(sony.lx * 3.3 - 12) - 7;
      for (const line of sony.lines) {
        let x = x0;
        for (const ch of line.toUpperCase()) {
          const gl = LDP_FONT[ch] || LDP_FONT[' '];
          for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (gl[r] & (16 >> c)) {
            for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
              const px = x + c * 2 + dx, py = y + r * 2 + dy;
              if (px >= 0 && px < W - 1 && py >= 0 && py < H - 1) { buf[(py + 1) * W + px + 1] = buf[(py + 1) * W + px + 1] || sh; buf[py * W + px] = col; }
            }
          }
          x += 12;
        }
        y += 16;
      }
    },
    sample() { if ((port61 & 3) !== 3 || pitDiv < 2) return 0; pitPhase += (1193182 / pitDiv) / env.sampleRate; pitPhase %= 1; return pitPhase < 0.5 ? 0.12 : -0.12; },
    status() { return 'CS:IP ' + cpu.c.S[1].toString(16) + ':' + cpu.c.ip.toString(16) + ' · 8088 · LDP-1450'; }
  };
}
DRIVERS.lair2 = drvLair2;
