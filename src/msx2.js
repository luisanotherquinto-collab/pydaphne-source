/* ==========================================================================
 *  Victor/JVC HC-95 (MSX2) + reproductor VHD — para los juegos MSX2 VHD
 *  (Time Gal). Las ROMs del HC-95 corren de verdad: BIOS + MSX2-BASIC (IC023)
 *  y sub-ROM (IC034). El juego controla el VHD con sentencias de BASIC
 *  CALL VP("comando"[,variable]) — descubierto desensamblando TIME — así que
 *  aquí una ROM de extensión diminuta en el slot 2 atiende CALL VP y el
 *  reproductor se emula en alto nivel (comandos G<cuadro>, P, S+0, S+01,
 *  S+1/32, E, estado S1 → 12 ocupado, 14 hecho, 13 error, 0 quieto, 11 en marcha).
 *  VDP V9938 parcial: modos compatibles TMS9918, paleta de 9 bits, S#0-S#2.
 * ========================================================================== */
'use strict';
class VHDPlayer {
  constructor(now) { this.now = now; this.frame = 1; this.frac = 0; this.mode = 'still'; this.speed = 1; this.busyUntil = 0; this.q = []; this.final = 0; this.log = []; this.target = 1; this.searching = false; }
  cmd(s) {
    if (this.log.length > 40) this.log.shift(); this.log.push(s);
    let fin = 0, wait = 4;
    for (const c of s.split(':')) {
      const m = c.match(/^([A-Z]+)([+-]?)(.*)$/); if (!m) continue;
      const op = m[1], arg = m[3];
      if (op === 'G' && arg !== '') { const f = parseInt(arg, 10) || 1; const d = Math.abs(f - this.frame); this.target = f; this.searching = true; this.mode = 'still'; wait = Math.max(4, Math.round((300 + Math.min(2500, d * 0.35)) / 16.7)); this.seekTo = f; this.seekLeft = wait * 2; fin = 0; }
      else if (op === 'P') { this.mode = 'play'; this.speed = 1; fin = 0; }   /* P = reproducir */
      else if (op === 'S' && m[2] === '+') {
        if (arg === '0') { this.mode = 'still'; fin = 0; }
        else if (arg.includes('/')) { const [a, b] = arg.split('/').map(Number); this.mode = 'play'; this.speed = (a || 1) / (b || 1); fin = 11; }   /* S+1/32 = cámara lenta 1/32: pantalla "PUSH 1 OR 2 PLAYER" (comprobado con el gameplay real) */
        else { const n = parseInt(arg, 10) || 1; this.mode = 'play'; this.speed = n; fin = 0; }   /* S+01 = avance a velocidad ×1 */
      } else if (op === 'S' && m[2] === '-') { this.mode = 'still'; fin = 0; }
      else if (op === 'E') { this.mode = 'still'; fin = 0; }
      else if (op === 'S' && m[2] === '' && /^\d+$/.test(arg)) { const n = +arg; if (n) { this.mode = 'play'; this.speed = n; } else this.mode = 'still'; fin = 0; }   /* "S1" en un comando = avanzar ×1 (Birdie Try) */
    }
    /* secuencia de estado que espera el juego: 12 (aceptado/ocupado) … 14 (hecho) … final */
    this.q = []; for (let i = 0; i < wait; i++) this.q.push(12); this.q.push(14, 14); this.final = fin;
  }
  gotoFrame(f) { this.cmd('G' + Math.max(1, Math.round(f))); }
  status() {
    if (this.q.length) {
      const v = this.q.shift();
      if (v === 14 && this.searching) { this.searching = false; this.frame = this.seekTo; this.frac = 0; }
      return v;
    }
    return this.final;
  }
  field() {
    if (this.searching && --this.seekLeft <= 0) { this.searching = false; this.frame = this.seekTo; this.frac = 0; }
    if (this.mode === 'play' && !this.searching) { this.frac += this.speed / 2; while (this.frac >= 1) { this.frac -= 1; this.frame++; } }
  }
  /* interfaz para DiscVideo */
  get status_() { return 0; }
  get fps() { return 29.97; } get speedNum() { return this.speed >= 1 ? 1 : 1; } get speedDen() { return this.speed >= 1 ? 1 : Math.round(1 / this.speed); }
}

async function drvHC95(lib, set, env) {
  const bios = new Uint8Array(0x8000), sub = new Uint8Array(0x4000), res = { missing: [], loaded: [] };
  const byName = n => { for (const k in lib.sets) for (const x of lib.sets[k]) if (x.name === n.toLowerCase()) return x; return null; };
  const take = async (n, dst) => { const r = byName(n); if (!r) { res.missing.push(n); return null; } const d = await lib.get(r); dst.set(d.subarray(0, dst.length)); res.loaded.push(n); return d; };
  await take('ic023_msx2basic_tmm23256.bin', bios); await take('ic034_msx2basicext_tmm23128p.bin', sub);
  /* tape: el programa original desde el audio del disco/cassette (CLOAD + RUN, con su cargador BASIC real) */
  const PROGS = { timegal: { tape: 'timegal.tap', answer: 'Y' }, thunder: { file: 'storm.bin', clear: '&H85FF', exec: 0x9F83 },
    roadblst: { tape: 'roadblst.tap', answer: 'Y' }, birdie: { tape: 'birdie.tap' } };
  const P = PROGS[set] || PROGS.timegal, prog = { time: null };
  const tape = { blocks: [], idx: -1, pos: 0 };
  if (P.tape) { const r = byName(P.tape); if (r) { const d = await lib.get(r); for (let i = 0; i + 2 <= d.length;) { const n = d[i] | (d[i + 1] << 8); tape.blocks.push(d.subarray(i + 2, i + 2 + n)); i += 2 + n; } res.loaded.push(P.tape); } else res.missing.push(P.tape); }
  else { const r = byName(P.file); if (r) { prog.time = await lib.get(r); res.loaded.push(P.file.toUpperCase()); } else res.missing.push(P.file.toUpperCase()); }
  /* cassette virtual: las entradas TAPION ($00E1) y TAPIN ($00E4) de la BIOS se atienden en JS */
  bios.set([0xD3, 0xFD, 0xC9], 0xE1); bios.set([0xD3, 0xFD, 0xC9], 0xE4);
  const tapeTrap = () => {
    const z = cpu.z, pc = z.pc;
    if (pc === 0xE3) { tape.idx++; tape.pos = 0; if (tape.idx < tape.blocks.length) z.f &= ~1; else z.f |= 1; return true; }
    if (pc === 0xE6) { const b = tape.blocks[tape.idx]; if (b && tape.pos < b.length) { z.a = b[tape.pos++]; z.f &= ~1; } else z.f |= 1; return true; }
    return false;
  };
  /* ROM de extensión: CALL VP → OUT (FE) → JS */
  const ext = new Uint8Array(0x4000).fill(0xFF);
  ext.set([0x41, 0x42, 0, 0, 0x10, 0x40, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0);
  /* el manejador de CALL evalúa los argumentos con el propio BASIC (FRMEVL / PTRGET por CALSLT) */
  const STUB = [
    0xD3, 0xFE,                   // 4010 OUT (FE),A   paso 1: ¿VP / SUPERx?  A=0 VP, 1 no es nuestro, 2 hecho
    0xFE, 0x01,                   // 4012 CP 1
    0x37,                         // 4014 SCF
    0xC8,                         // 4015 RET Z
    0xFE, 0x02,                   // 4016 CP 2
    0x28, 0x1D,                   // 4018 JR Z,4037
    0xFD, 0x2A, 0xC0, 0xFC,       // 401A LD IY,(FCC0)  slot de la ROM principal
    0xDD, 0x21, 0x64, 0x4C,       // 401E LD IX,4C64    FRMEVL
    0xCD, 0x1C, 0x00,             // 4022 CALL CALSLT
    0xD3, 0xFE,                   // 4025 OUT (FE),A   paso 2: comando evaluado; A=1 si sigue una variable
    0xB7,                         // 4027 OR A
    0x28, 0x0D,                   // 4028 JR Z,4037
    0xFD, 0x2A, 0xC0, 0xFC,       // 402A LD IY,(FCC0)
    0xDD, 0x21, 0xA4, 0x5E,       // 402E LD IX,5EA4    PTRGET
    0xCD, 0x1C, 0x00,             // 4032 CALL CALSLT
  ];
  ext.set(STUB, 0x10);
  /* 4035 OUT (FE),A paso 3 / 4037 AND A / 4038 EI / 4039 RET — se colocan a continuación */
  ext.set([0xD3, 0xFE, 0xA7, 0xFB, 0xC9], 0x10 + STUB.length);
  const ram = new Uint8Array(0x20000);            /* 128 KB con mapper en el slot 3-0 */
  const mapper = new Uint8Array([3, 2, 1, 0]);
  let slotReg = 0, subSlot3 = 0, ppiC = 0x50, psgLatch = 0, rtcReg = 0, rtcMode = 0;
  const rtc = new Uint8Array(64), kbd = new Uint8Array(11).fill(0xFF);
  const m = new Machine(), core = makeTMS9918(), psg = makeAY(1789773, env.sampleRate);
  const vreg = new Uint8Array(48), vpal = new Uint32Array(16);
  const DEFPAL = [0x000, 0x000, 0x611, 0x733, 0x117, 0x327, 0x151, 0x627, 0x171, 0x373, 0x661, 0x664, 0x411, 0x265, 0x555, 0x777];
  const setPal = (i, v) => { const r = (v >> 4) & 7, b = v & 7, g = (v >> 8) & 7; vpal[i] = rgba(r * 36, g * 36, b * 36); };
  DEFPAL.forEach((v, i) => setPal(i, ((v >> 8) << 4) | (v & 7) | (((v >> 4) & 7) << 8)));
  let vLatch = -1, palLatch = -1;
  const now = () => m.timeUs + (cpu ? (cpu.cur - cpu.z.cyc) / 3.579545 : 0);
  const vhd = new VHDPlayer(now);
  let cpu;
  /* ---------- slots */
  const pageSlot = p => (slotReg >> (p * 2)) & 3;
  const sub3 = p => (subSlot3 >> (p * 2)) & 3;
  const rd = a => {
    const p = a >> 14, s = pageSlot(p);
    if (a === 0xFFFF && s === 3) return (~subSlot3) & 0xFF;
    switch (s) {
      case 0: return a < 0x8000 ? bios[a] : 0xFF;
      case 2: return (a >= 0x4000 && a < 0x8000) ? ext[a - 0x4000] : 0xFF;
      case 3: { const ss = sub3(p); if (ss === 0) return ram[((mapper[p] & 7) << 14) | (a & 0x3FFF)]; if (ss === 1 && a < 0x4000) return sub[a]; return 0xFF; }
    }
    return 0xFF;
  };
  const wr = (a, v) => {
    const p = a >> 14, s = pageSlot(p);
    if (a === 0xFFFF && s === 3) { subSlot3 = v; return; }
    if (s === 3 && sub3(p) === 0) ram[((mapper[p] & 7) << 14) | (a & 0x3FFF)] = v;
  };
  /* ---------- variables de BASIC (para CALL VP("S1",S%) y "G",G!) */
  const peekw = a => rd(a) | (rd(a + 1) << 8), pokew = (a, v) => { wr(a, v & 0xFF); wr(a + 1, (v >> 8) & 0xFF); };
  function varPtr(name, type) {
    const n1 = name.charCodeAt(0), n2 = name.length > 1 ? name.charCodeAt(1) : 0, size = type === 2 ? 2 : type === 4 ? 4 : type === 8 ? 8 : 3;
    let p = peekw(0xF6C2); const ary = peekw(0xF6C4);
    while (p < ary) { const t = rd(p); if (t === type && rd(p + 1) === n1 && rd(p + 2) === n2) return p + 3; p += 3 + (t === 3 ? 3 : t); }
    /* crear la variable al final de las simples, desplazando los arreglos */
    const strend = peekw(0xF6C6), len = 3 + size;
    for (let i = strend - 1; i >= ary; i--) wr(i + len, rd(i));
    wr(ary, type); wr(ary + 1, n1); wr(ary + 2, n2); for (let i = 0; i < size; i++) wr(ary + 3 + i, 0);
    pokew(0xF6C4, ary + len); pokew(0xF6C6, strend + len);
    return ary + 3;
  }
  const writeSingle = (a, v) => {
    if (!v) { for (let i = 0; i < 4; i++) wr(a + i, 0); return; }
    const ds = String(Math.abs(v)), e = ds.length, m = (ds + '000000').slice(0, 6);
    wr(a, (v < 0 ? 0x80 : 0) | (0x40 + e)); for (let i = 0; i < 3; i++) wr(a + 1 + i, (+m[i * 2] << 4) | +m[i * 2 + 1]);
    if (varTypeIsDouble) for (let i = 4; i < 8; i++) wr(a + i, 0);
  };
  let varTypeIsDouble = false;
  const readSingle = a => { const e = rd(a); if (!(e & 0x7F)) return 0; let mant = 0; for (let i = 1; i < 4; i++) { const b = rd(a + i); mant = mant * 100 + (b >> 4) * 10 + (b & 15); } return (e & 0x80 ? -1 : 1) * mant / 1e6 * Math.pow(10, (e & 0x7F) - 0x40); };
  /* ---------- CALL VP */
  let vpCmd = '';
  function callVP() {
    const z = cpu.z, pc = z.pc;
    let hl = (z.h << 8) | z.l;
    const skipSp = () => { while (rd(hl) === 0x20) hl++; };
    const setHL = () => { z.h = (hl >> 8) & 0xFF; z.l = hl & 0xFF; };
    if (pc === 0x4012) {                                    /* paso 1 */
      let proc = ''; for (let i = 0; i < 15; i++) { const c = rd(0xFD89 + i); if (!c) break; proc += String.fromCharCode(c); }
      if (G.trace) G.trace.push('CALL ' + proc);
      if (/^SUPER[0-4]$/.test(proc)) { superMode = proc.charCodeAt(5) - 0x30; z.a = 2; return; }
      if (proc !== 'VP') { z.a = 1; return; }
      skipSp(); if (rd(hl) === 0x28) hl++; setHL(); z.a = 0; return;
    }
    if (pc === 0x4027) {                                    /* paso 2: resultado de FRMEVL */
      vpCmd = '';
      if (rd(0xF663) === 3) {
        const dsc = rd(0xF7F8) | (rd(0xF7F9) << 8), len = rd(dsc), adr = rd(dsc + 1) | (rd(dsc + 2) << 8);
        for (let i = 0; i < len; i++) vpCmd += String.fromCharCode(rd(adr + i));
        /* liberar el descriptor temporal (lo que haría FRESTR); si no, a la tercera llamada sale "String formula too complex" */
        const tp = peekw(0xF678); if (dsc === tp - 3) pokew(0xF678, tp - 3);
      }
      skipSp();
      if (rd(hl) === 0x2C) { hl++; skipSp(); setHL(); z.a = 1; return; }
      if (rd(hl) === 0x29) hl++;
      if (G.trace) G.trace.push('VP ' + vpCmd);
      if (vpCmd) vhd.cmd(vpCmd);
      setHL(); z.a = 0; return;
    }
    if (pc === 0x4037) {                                    /* paso 3: variable de destino en DE */
      const p = (z.d << 8) | z.e, t = rd(0xF663), s = vpCmd;
      const put = v => { if (t === 2) pokew(p, v); else { varTypeIsDouble = t === 8; writeSingle(p, v); } };
      if (G.trace) G.trace.push('VP ' + s + ',var');
      if (/^S1$/.test(s)) { const st0 = vhd.status(); put(t === 2 ? st0 | 0x0500 : st0); }
      else if (/^S[23]$/.test(s)) put(0);   /* S3 = 0: disco listo (Birdie Try trata &H800 como 'no listo') */
      else if (s === 'G') put(Math.max(0, Math.round(vhd.searching ? vhd.target : vhd.frame)));
      else if (s) vhd.cmd(s);
      skipSp(); if (rd(hl) === 0x29) hl++; setHL(); return;
    }
  }
  /* ---------- VDP V9938 (parcial) */
  let vdpIrq = false, superMode = 1;
  const vdpCtrl = v => {
    if (vLatch < 0) { vLatch = v; return; }
    const lo = vLatch; vLatch = -1;
    if (v & 0x80) {
      const r = v & 0x3F; vreg[r] = lo;
      if (r < 8) { core.writeCtrl(lo); core.writeCtrl(0x80 | r); }
    } else { core.writeCtrl(lo); core.writeCtrl(v); }
  };
  const vdpStatus = () => {
    const s = vreg[15] & 15;
    if (s === 0) { const r = core.readStatus(); vdpIrq = false; cpu.irq(false); return r; }
    if (s === 1) return 0x00;                 /* ID V9938 */
    if (s === 2) {                            /* TR=1, CE=0, VR/HR según la posición del haz */
      const t = now() % (1e6 / 59.94), line = t / 63.556, inLine = t % 63.556;
      return 0x8C | (line >= 212 ? 0x40 : 0) | (inLine > 50 ? 0x20 : 0);
    }
    return 0;
  };
  const pin = p => {
    switch (p & 0xFF) {
      case 0x98: return core.readData();
      case 0x99: return vdpStatus();
      case 0xA2: return psgLatch === 14 ? joy() : psg.reg[psgLatch];
      case 0xA8: return slotReg;
      case 0xA9: return kbd[ppiC & 15] ?? 0xFF;
      case 0xAA: return ppiC;
      case 0xB5: return (rtcMode & 3) === 0 ? rtcTime(rtcReg) : rtc[(rtcMode & 3) * 16 + rtcReg] & 15;
      case 0xFC: case 0xFD: case 0xFE: case 0xFF: return mapper[(p & 0xFF) - 0xFC] | 0xF8;
    }
    return 0xFF;
  };
  const rtcTime = r => { const d = new Date(); const v = [d.getSeconds() % 10, d.getSeconds() / 10 | 0, d.getMinutes() % 10, d.getMinutes() / 10 | 0, d.getHours() % 10, d.getHours() / 10 | 0, d.getDay(), d.getDate() % 10, d.getDate() / 10 | 0, (d.getMonth() + 1) % 10, (d.getMonth() + 1) / 10 | 0, (d.getFullYear() - 1980) % 10, ((d.getFullYear() - 1980) / 10 | 0) % 10][r]; return r === 13 ? rtcMode : (v ?? 0); };
  const pout = (p, v) => {
    switch (p & 0xFF) {
      case 0x98: core.writeData(v); break;
      case 0x99: vdpCtrl(v); break;
      case 0x9A: if (palLatch < 0) palLatch = v; else { setPal(vreg[16] & 15, palLatch | (v << 8)); vreg[16] = (vreg[16] + 1) & 15; palLatch = -1; } break;
      case 0x9B: { const r = vreg[17] & 0x3F; if (r !== 17) { vreg[r] = v; if (r < 8) { core.writeCtrl(v); core.writeCtrl(0x80 | r); } } if (!(vreg[17] & 0x80)) vreg[17] = (vreg[17] & 0xC0) | ((r + 1) & 0x3F); break; }
      case 0xA0: psgLatch = v & 15; psg.writeAddr(v); break;
      case 0xA1: psg.writeData(v); break;
      case 0xA8: slotReg = v; break;
      case 0xAA: ppiC = v; break;
      case 0xAB: if (!(v & 0x80)) { const b = (v >> 1) & 7; ppiC = (v & 1) ? ppiC | (1 << b) : ppiC & ~(1 << b); } break;
      case 0xB4: rtcReg = v & 15; break;
      case 0xB5: if (rtcReg === 13) rtcMode = v; else if ((rtcMode & 3) !== 0) rtc[(rtcMode & 3) * 16 + rtcReg] = v & 15; break;
      case 0xFC: case 0xFD: case 0xFE: case 0xFF: mapper[(p & 0xFF) - 0xFC] = v & 7; break;
      case 0xFE + 0x100: break;
    }
    if ((p & 0xFF) === 0xFE && cpu && cpu._trap) { /* nunca */ }
  };
  /* el OUT (FE) de la ROM de extensión: distinguirlo del mapper por el PC (página 1 en slot 2) */
  const poutWrap = (p, v) => { if ((p & 0xFF) === 0xFD && pageSlot(0) === 0 && (cpu.z.pc === 0xE3 || cpu.z.pc === 0xE6) && tapeTrap()) return; if ((p & 0xFF) === 0xFE && pageSlot(1) === 2 && (cpu.z.pc === 0x4012 || cpu.z.pc === 0x4027 || cpu.z.pc === 0x4037)) { callVP(); return; } pout(p, v); };
  /* joystick 1 / cursor para el PSG */
  const J = { v: 0x3F };
  const joy = () => 0x40 | (J.v & 0x3F);
  cpu = m.addCPU(Z80CPU({ rd, wr, in: pin, out: poutWrap }), 3579545);
  cpu.irqHold = false; cpu.reset();
  m.sliceUs = 100;
  m.every(1e6 / 59.94, () => { vhd.field(); if (core.vblank()) { vdpIrq = true; cpu.irq(true); } });
  /* teclado (matriz japonesa, igual que el PX-7) y arranque automático */
  const press = (code, down) => { const k = MSX_KEYS[code]; if (!k) return false; kbd[k[0]] = down ? kbd[k[0]] & ~(1 << k[1]) : kbd[k[0]] | (1 << k[1]); return true; };
  const typeQ = []; let typeT = 0, fields = 0, stage = 0;
  const typeText = s => { for (const ch of s) { const c = MSX_CHARS[ch]; if (c) typeQ.push({ codes: c }); } };
  const minHold = {}, relQ = [];
  const G = {
    name: set, fps: 29.97, ldp: null, m, res, ow: 256, oh: 192, keyMatrix: true, vhd, vreg, core, peek: rd, get slots() { return [slotReg, subSlot3]; },
    get videoBlank() { return false; },
    runField() {
      m.runUs(FIELD_US); fields++;
      for (let i = relQ.length - 1; i >= 0; i--) if (relQ[i][1] <= fields) { press(relQ[i][0], false); relQ.splice(i, 1); }
      /* 1) BASIC listo → CLEAR  2) cargar TIME en &H9000 y arrancar con USR */
      if (P.tape) {
        if (stage === 0 && fields > 420) { stage = 1; typeText('CLOAD\r'); }
        if (stage === 1 && !typeQ.length && fields > 520) { stage = 2; typeQ.push({ wait: 60 }); typeText('RUN\r'); }
        if (stage === 2 && !typeQ.length && P.answer) { stage = 3; typeQ.push({ wait: 90 }); typeText(P.answer); }
      } else {
        if (stage === 0 && fields > 420) { stage = 1; typeText('CLEAR 200,' + P.clear + '\r'); }
        if (stage === 1 && !typeQ.length && fields > 560) {
          stage = 2;
          if (prog.time) { const d = prog.time, st = d[1] | (d[2] << 8), en = d[3] | (d[4] << 8); const s0 = slotReg; slotReg = 0xFF; for (let a = st, i = 7; a <= en && i < d.length; a++, i++) wr(a, d[i]); slotReg = s0; typeText('DEFUSR=&H' + P.exec.toString(16).toUpperCase() + ':A=USR(0)\r'); }
        }
      }
      if (typeQ.length && ++typeT >= 3) {
        typeT = 0; const it = typeQ[0];
        if (it.wait !== undefined) { if (--it.wait <= 0) typeQ.shift(); } else if (!it.down) { for (const c of it.codes) press(c, true); it.down = true; } else { for (const c of it.codes) press(c, false); typeQ.shift(); }
      }
    },
    get tapeInfo() { return tape.idx + '/' + tape.blocks.length; },
    msxKey(code, down) {
      const dirs = { ArrowUp: 1, ArrowDown: 2, ArrowLeft: 4, ArrowRight: 8, Space: 16, KeyM: 32 };
      if (dirs[code]) J.v = down ? J.v & ~dirs[code] : J.v | dirs[code];
      if (!MSX_KEYS[code]) return !!dirs[code];
      if (down) { press(code, true); minHold[code] = fields + 3; } else if ((minHold[code] || 0) > fields) relQ.push([code, minHold[code]]); else press(code, false);
      return true;
    },
    typeText,
    input(sw, d) {
      const map = { [SW.UP]: 'ArrowUp', [SW.DOWN]: 'ArrowDown', [SW.LEFT]: 'ArrowLeft', [SW.RIGHT]: 'ArrowRight', [SW.BUTTON1]: 'Space', [SW.BUTTON2]: 'KeyM', [SW.START1]: 'Enter', [SW.COIN1]: 'Enter' };
      if (map[sw]) G.msxKey(map[sw], d);
    },
    draw(buf) {
      const pix = core.render(), bd = core.reg[7] & 15, live = vhd.mode === 'play' || !vhd.searching;
      for (let i = 0; i < 256 * 192; i++) { let c = pix[i]; if (c === 0) c = bd; buf[i] = c === 0 ? (live ? 0 : rgba(0, 0, 0)) : vpal[c]; }
    },
    sample() { return psg.sample(); },
    status() { return 'PC ' + cpu.pc.toString(16).padStart(4, '0') + ' · slots ' + slotReg.toString(16) + ' · VHD ' + vhd.mode + ' ' + vhd.frame + (vhd.searching ? ' (busca)' : '') + ' · ' + vhd.log.slice(-3).join(' | '); }
  };
  /* objeto para DiscVideo */
  G.ldp = {
    get frame() { return vhd.searching ? vhd.target : vhd.frame; }, get frac() { return vhd.frac; },
    get status() { return vhd.searching ? LDP_SEARCHING : vhd.mode === 'play' ? LDP_PLAYING : LDP_PAUSED; },
    get target() { return vhd.target; }, fps: 29.97, get speedNum() { return vhd.speed >= 1 ? Math.round(vhd.speed) : 1; }, get speedDen() { return vhd.speed >= 1 ? 1 : Math.round(1 / vhd.speed); },
    audio1: true, audio2: true, get curFrame() { return vhd.frame; }, log: vhd.log, squelchSearch: true
  };
  return G;
}
DRIVERS.hc95 = drvHC95;
