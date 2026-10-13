/* ==========================================================================
 *  Pioneer Palcom PX-7 (MSX1 + control de LaserDisc) — máquina de openMSX
 *  (share/machines/Pioneer_PX-7.xml) con el control y el reproductor portados
 *  de openMSX src/laserdisc/PioneerLDControl.cc y LaserdiscPlayer.cc:
 *  - las órdenes van por EXTCONTROL como un control remoto NEC (custom 0xA8)
 *    que el software genera con el pulso de 7812,5 Hz de $7FFE;
 *  - EXTACK, superimposición (color 0 transparente) y mute L/R en $7FFF;
 *  - el programa del disco se carga desde el canal derecho de audio, que
 *    entra al PSG como entrada de cassette cuando el relé del motor está apagado.
 * ========================================================================== */
'use strict';
let window_casInvert = (typeof globalThis !== 'undefined' && globalThis.PX7_INVERT) || false;
const PX7_ST = { STOPPED: 0, PLAYING: 1, MULTI: 2, PAUSED: 3, STILL: 4 };
class PX7Laserdisc {
  constructor(now) {
    this.now = now; this.state = PX7_ST.STOPPED; this.frame = 1; this.frac = 0; this.seeking = false; this.ack = false; this.ackUntil = 0;
    this.seekState = 0; this.seekNum = 0; this.waitFrame = 0; this.stillOnWait = false; this.speed = 3; this.frameStep = 1; this.stereo = 0;
    this.rs = 0; this.rBits = 0; this.rNr = 0; this.lastBit = 0; this.lastEdge = 0; this.rCode = -1; this.rDelayed = false; this.rBack = 0; this.rActive = false;
    this.muteL = true; this.muteR = true; this.totalFrames = 54000; this.hasDisc = false; this.log = []; this.videoIn = () => {};
  }
  note(s) { this.log.push(s); if (this.log.length > 60) this.log.shift(); }
  setAck(ms) { this.ack = true; this.ackUntil = this.now() + ms * 1000; }
  extAck() { if (this.ack && this.ackUntil && this.now() >= this.ackUntil) { this.ack = false; this.ackUntil = 0; this.seeking = false; } return this.ack; }
  extControl(bit) {
    if (this.lastBit === bit) return;
    this.lastBit = bit; const t = this.now(), us = t - this.lastEdge; this.lastEdge = t;
    switch (this.rs) {
      case 0: if (bit) { this.rBits = 0; this.rNr = 0; this.rs = 1; } break;
      case 1: this.rs = (us >= 5800 && us < 11200) ? 2 : 0; break;
      case 2: this.rs = (us >= 3400 && us < 6200) ? 3 : 0; break;
      case 3: this.rs = (us >= 380 && us < 1070) ? 4 : 0; break;
      case 4:
        if (us >= 1260 && us < 4720) this.rBits |= (1 << this.rNr);
        else if (us < 300 || us >= 1065) { this.rs = 0; break; }
        if (++this.rNr === 32) {
          const b = this.rBits >>> 0, cu = b & 0xFF, cc = (~b >>> 8) & 0xFF, code = (b >>> 16) & 0xFF, ncode = (~b >>> 24) & 0xFF;
          if (cu === cc && cu === 0xA8 && code === ncode) this.submit(code);
          this.rs = 0;
        } else this.rs = 3;
        break;
    }
  }
  submit(code) {
    if (!this.rActive || code !== this.rCode || code === 0x42 || code === 0x17) { this.rActive = true; this.rCode = code; this.rBack = 0; this.rDelayed = true; }
    else { this.rBack = 0; this.rDelayed = false; }
  }
  remote(code) {
    this.note(code.toString(16));
    if (code === 0x49 || code === 0x4A || code === 0x4B) { this.stereo = code === 0x4B ? 1 : code === 0x49 ? 2 : 0; this.setAck(46); return; }
    if (this.state === PX7_ST.STOPPED) { if (code === 0x17) this.play(); return; }
    let ackIt = true;
    switch (code) {
      case 0x5F: this.seekState = 3; this.seekNum = 0; this.stillOnWait = false; ackIt = false; break;
      case 0x41: this.seekState = 1; this.seekNum = 0; break;
      case 0x40: this.seekState = 2; this.seekNum = 0; ackIt = false; break;
      case 0x42:
        if (this.seekState === 1) { this.seekState = 0; this.seekFrame(this.seekNum % 100000); ackIt = false; }
        else if (this.seekState === 3) { this.seekState = 0; this.waitFrame = this.seekNum % 100000; }
        else this.seekState = 0;
        break;
      case 0x45: if (this.seekState && this.seekNum) this.seekNum = 0; else { this.seekState = 0; this.seekNum = 0; } this.waitFrame = 0; break;
      case 0x18: this.pause(); ackIt = false; break;
      case 0x17: this.play(); ackIt = false; break;
      case 0x16: this.state = PX7_ST.STOPPED; ackIt = false; break;
      case 0xFF: ackIt = false; this.seekState = 0; break;
      case 0x54: if (this.seekState === 3) this.stillOnWait = true; else this.step(true); break;
      case 0x50: this.step(false); break;
      case 0x58: this.state = PX7_ST.MULTI; this.setStep(); break;
      case 0x46: if (this.speed >= 1) { this.speed--; this.frameStep = 1; } break;
      case 0x47: if (this.speed <= 3) { this.speed++; this.frameStep = 1; } break;
      default: if (code <= 9) this.seekNum = this.seekNum * 10 + code; else ackIt = false;
    }
    if (ackIt) this.setAck(46);
  }
  setStep() { this.frameStep = [30, 90, 16, 8, 4, 2, 1, 1, 1][this.speed] || 1; }
  play() {
    if (!this.hasDisc) return;
    if (this.seeking) { }
    else if (this.state === PX7_ST.STOPPED) { this.frame = 1; this.setAck(9600); this.seekState = 0; this.seeking = true; this.waitFrame = 0; this.stereo = 0; this.speed = 3; }
    else this.setAck(46);
    this.state = PX7_ST.PLAYING;
  }
  pause() { if (this.state === PX7_ST.STOPPED) return; this.state = PX7_ST.PAUSED; this.setAck(46); }
  step(fw) { if (this.state === PX7_ST.STILL) { if (fw) { if (this.frame < this.totalFrames) this.frame++; } else if (this.frame > 1) this.frame--; } this.state = PX7_ST.STILL; }
  seekFrame(to) {
    if (this.state === PX7_ST.STOPPED) return;
    to = Math.max(1, Math.min(this.totalFrames, to));
    const d = Math.abs(to - this.frame), ms = d < 1000 ? d + 300 : 1800 + d / 12;
    this.state = PX7_ST.STILL; this.frame = to; this.waitFrame = 0; this.seeking = true; this.setAck(ms);
  }
  videoAvail() { return (this.state === PX7_ST.PLAYING || this.state === PX7_ST.MULTI || this.state === PX7_ST.STILL) && !this.seeking; }
  nextFrame() {
    if (this.waitFrame && this.waitFrame === this.frame) { this.ack = true; this.ackUntil = 0; this.waitFrame = 0; if (this.stillOnWait) { this.state = PX7_ST.STILL; this.stillOnWait = false; } }
    if (this.state === PX7_ST.MULTI) { if (--this.frameStep) return; this.frame += this.speed === 5 ? 3 : this.speed === 4 ? 2 : 1; this.setStep(); }
    else if (this.state === PX7_ST.PLAYING) this.frame++;
  }
  field(odd) {
    this.extAck();
    if (!odd) {
      if (this.state !== PX7_ST.STOPPED && this.frame > this.totalFrames) this.state = PX7_ST.STOPPED;
      const av = this.videoAvail(); this.videoIn(av);
      if (av) this.nextFrame();
    }
    if (this.rActive) { if (this.rDelayed) this.remote(this.rCode); if (++this.rBack > 6) this.rActive = false; }
    this.rDelayed = false;
  }
  /* objeto compatible con DiscVideo */
  get status() { return this.seeking ? LDP_SEARCHING : this.state === PX7_ST.PLAYING ? LDP_PLAYING : this.state === PX7_ST.STOPPED ? LDP_STOPPED : LDP_PAUSED; }
  get target() { return this.frame; }
  get fps() { return 29.97; }
  get speedNum() { return 1; } get speedDen() { return 1; }
  get audio1() { return !this.muteL; } get audio2() { return !this.muteR; }
}

/* matriz de teclado MSX japonesa (JIS): [fila, bit] por código de tecla del navegador */
const MSX_KEYS = (() => {
  const k = {};
  for (let i = 0; i < 8; i++) k['Digit' + i] = [0, i];
  k.Digit8 = [1, 0]; k.Digit9 = [1, 1]; k.Minus = [1, 2]; k.Equal = [1, 3]; k.IntlYen = [1, 4]; k.Backslash = [1, 4]; k.BracketLeft = [1, 5]; k.BracketRight = [1, 6]; k.Semicolon = [1, 7];
  k.Quote = [2, 0]; k.Backquote = [2, 1]; k.Comma = [2, 2]; k.Period = [2, 3]; k.Slash = [2, 4]; k.IntlRo = [2, 5];
  const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let i = 0; i < 26; i++) { const n = i + 6; k['Key' + L[i]] = [2 + (n >> 3), n & 7]; }
  Object.assign(k, { ShiftLeft: [6, 0], ShiftRight: [6, 0], ControlLeft: [6, 1], ControlRight: [6, 1], AltLeft: [6, 2], CapsLock: [6, 3], AltRight: [6, 4],
    F1: [6, 5], F2: [6, 6], F3: [6, 7], F4: [7, 0], F5: [7, 1], Escape: [7, 2], Tab: [7, 3], Pause: [7, 4], End: [7, 4], Backspace: [7, 5], PageUp: [7, 6], Enter: [7, 7], NumpadEnter: [7, 7],
    Space: [8, 0], Home: [8, 1], Insert: [8, 2], Delete: [8, 3], ArrowLeft: [8, 4], ArrowUp: [8, 5], ArrowDown: [8, 6], ArrowRight: [8, 7] });
  return k;
})();
const MSX_CHARS = (() => {
  const m = {}; for (let i = 0; i < 10; i++) m[String(i)] = ['Digit' + i];
  for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') { m[c] = ['Key' + c]; m[c.toLowerCase()] = ['Key' + c]; }
  Object.assign(m, { ' ': ['Space'], '\r': ['Enter'], '\n': ['Enter'], '-': ['Minus'], ',': ['Comma'], '.': ['Period'], '/': ['Slash'], ':': ['Quote'], ';': ['Semicolon'],
    '"': ['ShiftLeft', 'Digit2'], '!': ['ShiftLeft', 'Digit1'], '#': ['ShiftLeft', 'Digit3'], '$': ['ShiftLeft', 'Digit4'], '%': ['ShiftLeft', 'Digit5'], '&': ['ShiftLeft', 'Digit6'],
    "'": ['ShiftLeft', 'Digit7'], '(': ['ShiftLeft', 'Digit8'], ')': ['ShiftLeft', 'Digit9'], '=': ['ShiftLeft', 'Minus'], '+': ['ShiftLeft', 'Semicolon'], '*': ['ShiftLeft', 'Quote'], '?': ['ShiftLeft', 'Slash'], '_': ['IntlRo'] });
  return m;
})();

async function drvPX7(lib, set, env) {
  const bios = new Uint8Array(0x8000), pbasic = new Uint8Array(0x2000), ram = new Uint8Array(0x8000);
  const res = { missing: [], loaded: [] };
  const take = async (n, crc, dst) => { const r = lib.find(n, crc, 'px7', 'px7') || (() => { for (const k in lib.sets) for (const x of lib.sets[k]) if (x.name === n) return x; return null; })(); if (!r) { res.missing.push(n); return; } dst.set((await lib.get(r)).subarray(0, dst.length)); res.loaded.push(n); };
  await take('px-7_basic-bios1.rom', 0, bios); await take('px-7_pbasic.rom', 0, pbasic);
  const m = new Machine(), vdp = makeTMS9918(), psg = makeAY(1789773, env.sampleRate);
  let cpu, slotReg = 0, ppiC = 0x50, psgLatch = 0, kbd = new Uint8Array(11).fill(0xFF);
  let superimposing = false, extInt = false, videoEnabled = false, ldIrq = false, vdpIrq = false, casLevel = 0;
  const now = () => m.timeUs + (cpu ? (cpu.cur - cpu.z.cyc) / 3.579545 : 0);
  const ld = new PX7Laserdisc(now);
  const tap = env.ldTap || null;                 /* captura del audio del video: canal derecho → cassette */
  ld.videoIn = en => { if (videoEnabled && !en) { extInt = true; if (superimposing) setLdIrq(true); } videoEnabled = en; };
  const updIrq = () => cpu.irq(vdpIrq || ldIrq);
  const setLdIrq = on => { ldIrq = on; updIrq(); };
  /* entrada de cassette: muestra del canal derecho del laserdisc si el relé del motor está apagado */
  let casPos = -1;
  const casDbg = { on: 0, off: 0, ones: 0 };
  const casIn = () => {
    if (ppiC & 0x10) casDbg.off++; else casDbg.on++;
    if (!(ppiC & 0x10) || !tap || ld.state !== PX7_ST.PLAYING || ld.seeking) return 0;
    if (casPos < 0) casPos = tap.write - tap.sr * 0.15;
    const p = Math.floor(casPos + (now() - fieldStart) * tap.sr / 1e6);
    const s = tap.buf[((p % tap.buf.length) + tap.buf.length) % tap.buf.length];
    const sv = window_casInvert ? -s : s;
    const hy = (typeof globalThis !== 'undefined' && globalThis.PX7_HYST !== undefined) ? globalThis.PX7_HYST : 0.015;
    if (sv > hy) casLevel = 1; else if (sv < -hy) casLevel = 0; else if (hy === 0) casLevel = sv >= 0 ? 1 : 0;
    if (casDbg.rec && casDbg.rec.length < 200000) casDbg.rec.push(now(), casLevel, p);
    return casLevel;
  };
  let fieldStart = 0;
  const slotOf = a => (slotReg >> ((a >> 14) * 2)) & 3;
  const rd = a => {
    const s = slotOf(a);
    if (s === 0) return a < 0x8000 ? bios[a] : ram[a - 0x8000];
    if (s === 2 && a >= 0x4000 && a < 0x8000) {
      if (a < 0x6000) return pbasic[a & 0x1FFF];
      if (a === 0x7FFF) { let v = 0xFF; if (videoEnabled) v &= 0x7F; if (!extInt) v &= 0xFE; extInt = false; setLdIrq(false); return v; }
      if (a === 0x7FFE) { let v = 0xFF; if (Math.floor(now() * 0.0078125) & 1) v &= 0xFE; if (ld.extAck()) v &= 0x7F; return v; }
    }
    return 0xFF;
  };
  const wr = (a, v) => {
    const s = slotOf(a);
    if (s === 0 && a >= 0x8000) { ram[a - 0x8000] = v; return; }
    if (s === 2) {
      if (a === 0x7FFF) {
        superimposing = !(v & 1); setLdIrq(superimposing && extInt);
        if (!ld.muteL && !(v & 0x80)) ld.muteR = !(ppiC & 0x10);
        ld.muteL = !(v & 0x80);
      } else if (a === 0x7FFE) ld.extControl(v & 1);
    }
  };
  const pin = p => {
    switch (p & 0xFF) {
      case 0x98: return vdp.readData();
      case 0x99: { const r = vdp.readStatus(); vdpIrq = false; updIrq(); return r; }
      case 0xA2: return psgLatch === 14 ? (0x3F | 0x40 | (casIn() << 7)) : psg.reg[psgLatch];
      case 0xA8: return slotReg;
      case 0xA9: return kbd[ppiC & 15] ?? 0xFF;
      case 0xAA: return ppiC;
    }
    return 0xFF;
  };
  const pout = (p, v) => {
    switch (p & 0xFF) {
      case 0x98: vdp.writeData(v); break;
      case 0x99: vdp.writeCtrl(v); break;
      case 0xA0: psgLatch = v & 15; psg.writeAddr(v); break;
      case 0xA1: psg.writeData(v); break;
      case 0xA8: slotReg = v; break;
      case 0xAA: ppiC = v; break;
      case 0xAB: if (!(v & 0x80)) { const b = (v >> 1) & 7; ppiC = (v & 1) ? ppiC | (1 << b) : ppiC & ~(1 << b); } break;
    }
  };
  cpu = m.addCPU(Z80CPU({ rd, wr, in: pin, out: pout }), 3579545);
  cpu.irqHold = false; cpu.reset();
  m.sliceUs = 100;
  let odd = false;
  m.every(1e6 / 59.94, () => {
    odd = !odd; ld.field(odd);
    if (vdp.vblank()) { vdpIrq = true; updIrq(); }
  });
  /* teclado: pulsaciones físicas y texto tecleado automáticamente (CALL LD) */
  const typeQ = [];
  const press = (code, down) => { const k = MSX_KEYS[code]; if (!k) return false; kbd[k[0]] = down ? kbd[k[0]] & ~(1 << k[1]) : kbd[k[0]] | (1 << k[1]); return true; };
  let typeTimer = 0, autoRun = false, bootFields = 0; const minHold = {}, relQ = [];
  const G = {
    name: set, fps: 29.97, ldp: ld, m, res, ow: 256, oh: 192, keyMatrix: true, px7: ld, casDbg, peek: rd, get ppiC() { return ppiC; },
    get videoBlank() { return !ld.videoAvail(); },
    runField() {
      fieldStart = m.timeUs;
      if (tap && casPos >= 0) { const lag = tap.write - casPos; if (lag > tap.sr * 0.4 || lag < tap.sr * 0.03) casPos = tap.write - tap.sr * 0.15; }
      m.runUs(FIELD_US);
      if (casPos >= 0 && tap) casPos += FIELD_US * tap.sr / 1e6;
      if (tap) tap.setMute(ld.muteL, ld.muteR, ld.stereo);
      /* teclado automático */
      bootFields++;
      for (let i = relQ.length - 1; i >= 0; i--) if (relQ[i][1] <= bootFields) { press(relQ[i][0], false); relQ.splice(i, 1); }
      if (!autoRun && G.autoRunWanted && bootFields > 150) { autoRun = true; G.typeText('1'); typeQ.push({ wait: 40 }); G.typeText('CALLLD\r'); }
      if (typeQ.length && ++typeTimer >= 3) {
        typeTimer = 0; const it = typeQ[0];
        if (it.wait !== undefined) { if (--it.wait <= 0) typeQ.shift(); return; }
        if (!it.down) { for (const c of it.codes) press(c, true); it.down = true; } else { for (const c of it.codes) press(c, false); typeQ.shift(); }
      }
    },
    typeText(s) { for (const ch of s) { const codes = MSX_CHARS[ch]; if (codes) typeQ.push({ codes, down: false }); } },
    /* una tecla dura al menos 3 campos: la BIOS barre el teclado en la interrupción de 60 Hz */
    msxKey(code, down) {
      if (!MSX_KEYS[code]) return false;
      if (down) { press(code, true); minHold[code] = bootFields + 3; return true; }
      if ((minHold[code] || 0) > bootFields) relQ.push([code, minHold[code]]); else press(code, false);
      return true;
    },
    typeKey(e) { return press(e.code, true); },
    input(sw, d) {
      const map = { [SW.UP]: 'ArrowUp', [SW.DOWN]: 'ArrowDown', [SW.LEFT]: 'ArrowLeft', [SW.RIGHT]: 'ArrowRight', [SW.BUTTON1]: 'Space', [SW.BUTTON2]: 'KeyM', [SW.START1]: 'Enter', [SW.COIN1]: 'Enter', [SW.BUTTON3]: 'Escape' };
      if (map[sw]) press(map[sw], d);
    },
    draw(buf) {
      const pix = vdp.render(), trans = superimposing && ld.videoAvail(), bd = vdp.reg[7] & 15;
      const pal = TMS_PAL.map(c => rgba(c[0], c[1], c[2]));
      const black = rgba(0, 0, 0);
      for (let i = 0; i < 256 * 192; i++) {
        let c = pix[i]; if (c === 0) c = bd;
        buf[i] = c === 0 ? (trans ? 0 : black) : pal[c];
      }
    },
    sample() { return psg.sample(); },
    status() { return 'PC ' + cpu.pc.toString(16).padStart(4, '0') + ' · Z80 · LD ' + ['STOP', 'PLAY', 'MULTI', 'PAUSA', 'STILL'][ld.state] + ' ' + ld.frame + (ld.seeking ? ' (busca)' : '') + (ld.ack ? ' ACK' : ''); }
  };
  return G;
}
DRIVERS.px7 = drvPX7;
