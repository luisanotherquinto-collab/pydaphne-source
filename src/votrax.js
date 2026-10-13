/* ==========================================================================
 *  Votrax SC-01A — simulación portada de MAME devices/sound/votrax.cpp
 *  (O. Galibert) usando la ROM interna sc01a.bin. Incluye:
 *   - VotraxSC01: el chip (filtros de capacitores conmutados, glotis, ruido)
 *   - SSI263: HLE de MAME ssi263hle.cpp que traduce fonemas al SC-01
 *   - votraxSay(): texto → fonemas (reglas del español + diccionario inglés)
 * ========================================================================== */
'use strict';
const VOTRAX_PHONES = ['EH3','EH2','EH1','PA0','DT','A1','A2','ZH','AH2','I3','I2','I1','M','N','B','V','CH','SH','Z','AW1','NG','AH1','OO1','OO','L','K','J','H','G','F','D','S','A','AY','Y1','UH3','AH','P','O','I','U','Y','T','R','E','W','AE','AE1','AW2','UH2','UH1','UH','O2','O1','IU','U1','THV','TH','ER','EH','E1','AW','PA1','STOP'];
class VotraxSC01 {
  constructor(rom, clock) {
    this.rom = rom; this.main = clock || 720000; this.sclock = this.main / 18; this.cclock = this.main / 36;
    const h = n => new Float64Array(n);
    this.v1 = h(4); this.v2 = h(4); this.v3 = h(4); this.n1 = h(3); this.n2 = h(3); this.n3 = h(2); this.n4 = h(2);
    this.vn1 = h(4); this.vn2 = h(4); this.vn3 = h(4); this.vn4 = h(4); this.vn5 = h(2); this.vn6 = h(2);
    this.f1a = h(4); this.f1b = h(4); this.f2va = h(4); this.f2vb = h(4); this.f2na = h(2); this.f2nb = h(2);
    this.f3a = h(4); this.f3b = h(4); this.f4a = h(4); this.f4b = h(4); this.fxa = h(1); this.fxb = h(2); this.fna = h(3); this.fnb = h(3);
    this.reset();
  }
  reset() {
    this.phone = 0x3F; this.inflection = 0; this.ar = true; this.sampleCount = 0;
    this.commitIn = -1; this.endIn = -1;
    this.phoneCommit();
    this.cur = { fa: 0, fc: 0, va: 0, f1: 0, f2: 0, f2q: 0, f3: 0 };
    this.filt = { fa: 0, fc: 0, va: 0, f1: -1, f2: -1, f2q: -1, f3: -1 };
    this.filtersCommit(true);
    this.pitch = 0; this.closure = 0; this.updCnt = 0; this.curClosure = true; this.noise = 0; this.curNoise = false;
  }
  write(p) { const prev = this.phone; this.phone = p & 0x3F; if (this.phone !== prev || this.phone !== 0x3F) this.ar = false; if (this.commitIn < 0) this.commitIn = 72 / 18; }
  phoneCommit() {
    this.phonetick = 0; this.ticks = 0;
    const bit = (lo, hi, n) => n < 32 ? (lo >>> n) & 1 : (hi >>> (n - 32)) & 1;
    for (let i = 0; i < 64; i++) {
      const o = i * 8, lo = (this.rom[o] | (this.rom[o + 1] << 8) | (this.rom[o + 2] << 16) | (this.rom[o + 3] << 24)) >>> 0,
        hi = (this.rom[o + 4] | (this.rom[o + 5] << 8) | (this.rom[o + 6] << 16) | (this.rom[o + 7] << 24)) >>> 0;
      if (this.phone !== ((hi >>> 24) & 0x3F)) continue;
      const sw = (...b) => b.reduce((v, n) => (v << 1) | bit(lo, hi, n), 0);
      const nb = (...b) => b.reduce((v, n) => (v << 1) | (bit(lo, hi, n) ^ 1), 0);
      this.rf1 = sw(0, 7, 14, 21); this.rva = sw(1, 8, 15, 22); this.rf2 = sw(2, 9, 16, 23); this.rfc = sw(3, 10, 17, 24);
      this.rf2q = sw(4, 11, 18, 25); this.rf3 = sw(5, 12, 19, 26); this.rfa = sw(6, 13, 20, 27);
      this.rcld = sw(34, 32, 30, 28); this.rvd = sw(35, 33, 31, 29); this.rclosure = sw(36); this.rdur = nb(37, 38, 39, 40, 41, 42, 43);
      this.rpause = this.phone === 0x03 || this.phone === 0x3E;
      if (this.rcld === 0) this.curClosure = !!this.rclosure;
      return;
    }
  }
  interp(k, target) { this.cur[k] = (this.cur[k] - (this.cur[k] >> 3) + (target << 1)) & 0xFF; }
  chipUpdate() {
    if (this.ticks !== 0x10) { this.phonetick++; if (this.phonetick === ((this.rdur << 2) | 1)) { this.phonetick = 0; this.ticks++; if (this.ticks === this.rcld) this.curClosure = !!this.rclosure; } }
    this.updCnt++; if (this.updCnt === 0x30) this.updCnt = 0;
    const t625 = !(this.updCnt & 0xF), t208 = this.updCnt === 0x28, F = this.filt;
    if (t208 && (!this.rpause || !(F.fa || F.va))) { this.interp('fc', this.rfc); this.interp('f1', this.rf1); this.interp('f2', this.rf2); this.interp('f2q', this.rf2q); this.interp('f3', this.rf3); }
    if (t625) { if (this.ticks >= this.rvd) this.interp('fa', this.rfa); if (this.ticks >= this.rcld) this.interp('va', this.rva); }
    if (!this.curClosure && (F.fa || F.va)) this.closure = 0; else if (this.closure !== 28) this.closure++;
    this.pitch = (this.pitch + 1) & 0xFF;
    if (this.pitch === (((0xE0 ^ (this.inflection << 5) ^ (F.f1 << 1)) + 2) & 0xFF)) this.pitch = 0;
    if ((this.pitch & 0xF9) === 0x08) this.filtersCommit(false);
    const inp = this.curNoise && this.noise !== 0x7FFF ? 1 : 0;
    this.noise = ((this.noise << 1) & 0x7FFE) | inp;
    this.curNoise = !(((this.noise >> 14) ^ (this.noise >> 13)) & 1);
  }
  caps(v, list) { let t = 0; for (const d of list) { if (v & 1) t += d; v >>= 1; } return t; }
  stdFilter(a, b, c1t, c1b, c2t, c2b, c3, c4) {
    const k0 = c1t / (this.cclock * c1b), k1 = c4 * c2t / (this.cclock * c1b * c3), k2 = c4 * c2b / (this.cclock * this.cclock * c1b * c3);
    const fp = Math.sqrt(Math.abs(k0 * k1 - k2)) / (2 * Math.PI * k2), zc = 2 * Math.PI * fp / Math.tan(Math.PI * fp / this.sclock);
    const m0 = zc * k0, m1 = zc * k1, m2 = zc * zc * k2;
    a[0] = 1 + m0; a[1] = 3 + m0; a[2] = 3 - m0; a[3] = 1 - m0; b[0] = 1 + m1 + m2; b[1] = 3 + m1 - m2; b[2] = 3 - m1 - m2; b[3] = 1 - m1 + m2;
  }
  filtersCommit(force) {
    const F = this.filt, C = this.cur;
    F.fa = C.fa >> 4; F.fc = C.fc >> 4; F.va = C.va >> 4;
    if (force || F.f1 !== C.f1 >> 4) { F.f1 = C.f1 >> 4; this.stdFilter(this.f1a, this.f1b, 11247, 11797, 949, 52067, 2280 + this.caps(F.f1, [2546, 4973, 9861, 19724]), 166272); }
    if (force || F.f2 !== C.f2 >> 3 || F.f2q !== C.f2q >> 4) {
      F.f2 = C.f2 >> 3; F.f2q = C.f2q >> 4;
      const q = 829 + this.caps(F.f2q, [1390, 2965, 5875, 11297]), f = 2352 + this.caps(F.f2, [833, 1663, 3164, 6327, 12654]);
      this.stdFilter(this.f2va, this.f2vb, 24840, 29154, q, 38180, f, 34270);
      const k0 = this.cclock * 29154, k1 = this.cclock * (q * f / 29154 + 29154) * 0 + this.cclock * (29154 * 0 + (29154 * 0)), zc = 2 * this.sclock;
      /* build_injection_filter(c1b=29154, c2t=q, c2b=38180, c3=f, c4=34270) */
      const c1b = 29154, c2t = q, c2b = 38180, c3 = f, K0 = this.cclock * c2t, K1 = this.cclock * (c1b * c3 / c2t + c2t), m = zc * c2b;
      this.f2na[0] = K0 + m; this.f2na[1] = K0 - m; this.f2nb[0] = K1 + m; this.f2nb[1] = K1 - m;
      void k0; void k1;
    }
    if (force || F.f3 !== C.f3 >> 4) { F.f3 = C.f3 >> 4; this.stdFilter(this.f3a, this.f3b, 0, 17594, 868, 18828, 8480 + this.caps(F.f3, [2226, 4485, 9056, 18111]), 50019); }
    if (force) {
      this.stdFilter(this.f4a, this.f4b, 0, 28810, 1165, 21457, 8558, 7289);
      { const k = 23131 / (this.cclock * 1122) * (150 / 4000), fp = 1 / (2 * Math.PI * k), zc = 2 * Math.PI * fp / Math.tan(Math.PI * fp / this.sclock), m = zc * k;
        this.fxa[0] = 1; this.fxb[0] = 1 + m; this.fxb[1] = 1 - m; }
      { const c1 = 15500, c2t = 14854, c2b = 8450, c3 = 9523, c4 = 14083;
        const k0 = c2t * c3 * c2b / c4, k1 = c2t * (this.cclock * c2b), k2 = c1 * c2t * c3 / (this.cclock * c4);
        const fp = Math.sqrt(1 / k2) / (2 * Math.PI), zc = 2 * Math.PI * fp / Math.tan(Math.PI * fp / this.sclock);
        const m0 = zc * k0, m1 = zc * k1, m2 = zc * zc * k2;
        this.fna[0] = m0; this.fna[1] = 0; this.fna[2] = -m0; this.fnb[0] = 1 + m1 + m2; this.fnb[1] = 2 - 2 * m2; this.fnb[2] = 1 - m1 + m2; }
    }
  }
  static sh(v, h) { for (let i = h.length - 1; i > 0; i--) h[i] = h[i - 1]; h[0] = v; }
  static ap(x, y, a, b) { let t = 0; for (let i = 0; i < a.length; i++) t += x[i] * a[i]; for (let i = 1; i < b.length; i++) t -= y[i - 1] * b[i]; return t / b[0]; }
  analog() {
    const sh = VotraxSC01.sh, ap = VotraxSC01.ap, GW = [0, -4 / 7, 1, 6 / 7, 5 / 7, 4 / 7, 3 / 7, 2 / 7, 1 / 7], F = this.filt;
    let v = this.pitch >= 72 ? 0 : GW[this.pitch >> 3]; v = v * F.va / 15;
    sh(v, this.v1); v = ap(this.v1, this.v2, this.f1a, this.f1b); sh(v, this.v2);
    v = ap(this.v2, this.v3, this.f2va, this.f2vb); sh(v, this.v3);
    let n = 1e4 * ((this.pitch & 0x40 ? this.curNoise : false) ? 1 : -1); n = n * F.fa / 15;
    sh(n, this.n1); n = ap(this.n1, this.n2, this.fna, this.fnb); sh(n, this.n2);
    let n2 = n * F.fc / 15; sh(n2, this.n3); n2 = ap(this.n3, this.n4, this.f2na, this.f2nb); sh(n2, this.n4);
    let vn = v + n2; sh(vn, this.vn1); vn = ap(this.vn1, this.vn2, this.f3a, this.f3b); sh(vn, this.vn2);
    vn += n * (5 + (15 ^ F.fc)) / 20; sh(vn, this.vn3); vn = ap(this.vn3, this.vn4, this.f4a, this.f4b); sh(vn, this.vn4);
    vn = vn * (7 ^ (this.closure >> 2)) / 7; sh(vn, this.vn5); vn = ap(this.vn5, this.vn6, this.fxa, this.fxb); sh(vn, this.vn6);
    return vn * 0.35;
  }
  /* una muestra a sclock (main/18) */
  next() {
    if (this.commitIn >= 0 && (this.commitIn -= 1) < 0) { this.phoneCommit(); this.endIn = (16 * (this.rdur * 4 + 1) * 4 * 9 + 2) / 18; }
    if (this.endIn >= 0 && (this.endIn -= 1) < 0) { this.ar = true; if (this.onAR) this.onAR(); }
    this.sampleCount++; if (this.sampleCount & 1) this.chipUpdate();
    const s = this.analog(); return Number.isFinite(s) ? Math.max(-1, Math.min(1, s)) : 0;
  }
  /* renderiza una secuencia de fonemas completa (para la guía) */
  render(phones) {
    const out = []; let i = 0; this.reset(); this.write(phones[0]);
    let guard = this.sclock * 12;
    this.onAR = () => { i++; if (i < phones.length) this.write(phones[i]); };
    while (guard-- > 0) { out.push(this.next()); if (i >= phones.length && this.ar) break; }
    for (let k = 0; k < this.sclock * 0.08; k++) out.push(this.next());
    this.onAR = null; return Float32Array.from(out);
  }
}

/* SSI-263 → SC-01 (tabla de MAME ssi263hle.cpp) */
const SSI_TO_SC01 = [0x03,0x2c,0x3b,0x3c,0x22,0x21,0x29,0x27,0x20,0x05,0x01,0x00,0x2e,0x2f,0x15,0x15,0x13,0x26,0x35,0x17,0x36,0x16,0x28,0x37,0x32,0x32,0x31,0x23,0x3a,0x2b,0x2b,0x2b,0x18,0x18,0x18,0x2d,0x0e,0x1e,0x1c,0x25,0x2a,0x19,0x03,0x03,0x1b,0x03,0x03,0x12,0x1f,0x07,0x11,0x0f,0x1d,0x38,0x39,0x0c,0x0d,0x14,0x08,0x34,0x28,0x37,0x02,0x18];
class SSI263 {
  constructor(vtx, m, onAR) { this.v = vtx; this.m = m; this.onAR = onAR; this.fifo = []; this.dur = 0; this.rate = 0; this.ctl = false; this.mode = 0; this.req = 1; this.infl = 0;
    vtx.onAR = () => this.votraxReq(); }
  setReq(v) { this.req = v; this.onAR(v); }
  write(reg, data) {
    switch (reg) {
      case 0: {
        const frame = (4096 * (16 - this.rate)) / 2, ph = frame * (4 - this.dur);
        this.dur = (data >> 5) & 3; const p = data & 0x3F; this.setReq(1);
        if (this.mode < 2) this.m.after(ph, () => this.setReq(0)); else if (this.mode === 2) this.m.after(frame, () => this.setReq(0));
        if (p && this.fifo.length < 64) { this.fifo.push(SSI_TO_SC01[p]); if (this.fifo.length === 1) this.v.write(SSI_TO_SC01[p]); }
        break;
      }
      case 1: this.infl = (this.infl & 0x807) | (data << 3); break;
      case 2: this.infl = (this.infl & 0x7F8) | (((data >> 3) & 1) << 11) | (data & 7); this.rate = data >> 4; this.v.inflection = 1; break;
      case 3: if (this.ctl && !(data & 0x80)) this.mode = this.dur; this.ctl = !!(data & 0x80); break;
    }
  }
  status() { return (this.req ? 0 : 1) << 7; }
  votraxReq() {
    if (!this.fifo.length) return;
    const prev = this.fifo.shift();
    if (!this.fifo.length) { if (prev !== 0x3F) { this.fifo.push(0x3F); this.v.write(0x3F); } return; }
    this.v.write(this.fifo[0]);
  }
}

/* ------------------------------------------------ texto → fonemas SC-01 */
const P = n => VOTRAX_PHONES.indexOf(n);
const EN_WORDS = {
  dragons: 'D R AE1 G UH3 N Z', dragon: 'D R AE1 G UH3 N', lair: 'L AY EH3 R', space: 'S P AY Y1 S', ace: 'AY Y1 S', cliff: 'K L I F', hanger: 'H AE1 NG ER',
  goal: 'G O1 U1 L', to: 'T OO1', go: 'G O1 U1', super: 'S U1 P ER', don: 'D AH1 N', quixote: 'K I H O1 T EH1', badlands: 'B AE1 D L AE1 N D Z',
  battle: 'B AE1 T UH3 L', cobra: 'K O1 B R UH2', command: 'K UH1 M AE1 N D', road: 'R O1 U1 D', blaster: 'B L AE1 S T ER', astron: 'AE1 S T R AH1 N', belt: 'B EH1 L T',
  galaxy: 'G AE1 L UH3 K S E1', ranger: 'R AY Y1 N J ER', world: 'W ER L D', firefox: 'F AH1 EH3 ER F AH1 K S', thayers: 'TH AY Y1 ER Z', quest: 'K W EH1 S T',
  mach: 'M AH1 K', us: 'UH1 S', vs: 'V ER S UH1 S', them: 'THV EH1 M', lairs: 'L AY EH3 R Z', time: 'T AH1 EH3 M', traveler: 'T R AE1 V UH3 L ER',
  star: 'S T AH1 R', rider: 'R AH1 EH3 D ER', freedom: 'F R E1 D UH3 M', fighter: 'F AH1 EH3 T ER', laser: 'L AY Y1 Z ER', grand: 'G R AE1 N D', prix: 'P R E1',
  runner: 'R UH1 N ER', football: 'F OO1 T B AW L', nfl: 'EH1 N EH1 F EH1 L', cube: 'K Y1 IU B', the: 'THV UH1', of: 'UH1 V', interstellar: 'I N T ER S T EH1 L ER',
  fantasy: 'F AE1 N T UH3 S E1', enhancement: 'EH1 N H AE1 N S M UH3 N T', singe: 'S I N J', zangus: 'Z AE1 NG G UH3 S', cops: 'K AH1 P S', ii: 'T OO1',
  warp: 'W O1 R P', euro: 'Y1 OO1 R O1 U1', and: 'AE1 N D', blazer: 'B L AY Y1 Z ER',
  channel: 'CH AE1 N UH3 L', zero: 'Z I1 R O1 U1', one: 'W UH1 N', two: 'T OO1', three: 'TH R E1', four: 'F O1 R', five: 'F AH1 EH3 V', six: 'S I K S', seven: 'S EH1 V UH3 N', eight: 'AY Y1 T', nine: 'N AH1 EH3 N',
  act: 'AE1 K T', gear: 'G I1 R', top: 'T AH1 P', lazon: 'L AY Y1 Z AH1 N', trainer: 'T R AY Y1 N ER', golf: 'G AH1 L F', time: 'T AH1 EH3 M', gal: 'G AE1 L', storm: 'S T O1 R M', thunder: 'TH UH1 N D ER', birdie: 'B ER D E1', try: 'T R AH1 EH3', victor: 'V I K T ER', casino: 'K UH3 S E1 N O1 U1', strip: 'S T R I P', quarter: 'K W O1 R T ER', horse: 'H O1 R S'
};
function spanishWord(w) {
  const out = []; const s = w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, m => m === '\u0303' ? '~' : '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i], n = s[i + 1] || '', add = (...p) => out.push(...p);
    switch (c) {
      case 'a': add('AH1'); break; case 'e': add('EH1'); break; case 'i': add(/[aeou]/.test(n) ? 'Y1' : 'E1'); break;
      case 'o': add('O1'); break; case 'u': add(/[aeio]/.test(n) ? 'W' : 'OO1'); break;
      case 'b': case 'v': add('B'); break; case 'd': add('D'); break; case 'f': add('F'); break; case 'k': add('K'); break;
      case 'l': if (n === 'l') { add('Y1'); i++; } else add('L'); break;
      case 'm': add('M'); break; case 'p': add('P'); break; case 't': add('T'); break; case 's': case 'z': add('S'); break;
      case 'n': if (n === '~') { add('N', 'Y1'); i++; } else add('N'); break;
      case 'r': add('R'); if (n === 'r') i++; break;
      case 'c': if (n === 'h') { add('CH'); i++; } else if (/[ei]/.test(n)) add('S'); else add('K'); break;
      case 'q': add('K'); if (n === 'u') i++; break;
      case 'g': if (/[ei]/.test(n)) add('H'); else { add('G'); if (n === 'u' && /[ei]/.test(s[i + 2] || '')) i++; } break;
      case 'j': add('H'); break; case 'h': break; case 'x': add('K', 'S'); break; case 'w': add('W'); break;
      case 'y': add(n && /[aeiou]/.test(n) ? 'Y1' : 'E1'); break; case '~': break;
    }
  }
  return out;
}
const ES_NUM = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
function textToPhones(text) {
  const ph = [];
  for (let w of String(text).replace(/[’']/g, '').split(/[\s\-·,.:;!?()/]+/)) {
    if (!w) continue;
    if (/^\d+$/.test(w)) { for (const d of w) ph.push(...spanishWord(ES_NUM[+d]), 'PA0'); continue; }
    if (/^[²³]$/.test(w)) continue;
    const k = w.toLowerCase().replace(/[^a-z]/g, '');
    if (EN_WORDS[k]) ph.push(...EN_WORDS[k].split(' ')); else ph.push(...spanishWord(w));
    ph.push('PA0');
  }
  ph.push('PA1', 'STOP');
  return ph.map(P).filter(x => x >= 0);
}
