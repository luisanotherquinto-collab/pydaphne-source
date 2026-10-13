/* ==========================================================================
 *  Thayer's Quest (RDI 1984) — portado de hypseus-singe/src/game/thayers.cpp
 *  Z80 + LD-V1000 + teclado del COP421 (HLE) + SSI-263 (subtítulos/voz del
 *  navegador) + marcador de LEDs.
 * ========================================================================== */
'use strict';
async function drvThayers(lib, set, env) {
  const mem = new Uint8Array(0x10000), cop = new Uint8Array(0x400);
  const res = await lib.loadSet(set, ROMDEFS[set], { m_cpumem: mem, coprom: cop });
  const vrec = lib.find('sc01a.bin', 0xfc416227, 'votrsc01a', null);
  const m = new Machine(), ldp = new LDP(29.97), ldv = new LDV1000(ldp, { blocking: true });
  const banks = new Uint8Array([0x00, 0xFF]);
  let copLatch = 0, stStrobe = false, cmdStrobe = false, cpu, ldData = 0, ldCtl = 0;
  let periodic = 0, timerInt = 1, dataRdy = 1, ssiReq = 1;
  const sb = [new Uint8Array(8).fill(15), new Uint8Array(8).fill(15)];
  const G = {};
  const check = () => cpu && cpu.irq(!timerInt || !dataRdy || !ssiReq || !periodic);
  const vtx = vrec ? new VotraxSC01(await lib.get(vrec), 860000 * 0 + 720000) : null;
  const ssi = vtx ? new SSI263(vtx, m, v => { ssiReq = v; check(); }) : null;
  let vAcc = 0, vLast = 0;
  const rd = a => a === 0xBE17 ? 1 : mem[a];
  const wr = (a, v) => { if (a >= 0x8000 && a < 0xC000) mem[a] = v; };
  const subtitle = () => { let s = ''; for (let i = 0; i < mem[0xA6D3] && i < 400; i++) { const ch = mem[0xA500 + i]; if (ch >= 32 && ch < 127 && '/()'.indexOf(String.fromCharCode(ch)) < 0) s += String.fromCharCode(ch); } s = s.replace(/,(?! )/g, ', ').trim(); if (s && s !== G.subtitle) { G.subtitle = s; G.subSeq = (G.subSeq || 0) + 1; } };
  const pin = p => {
    p &= 0xFF;
    if (p < 8) return ssi ? ssi.status() : 0x80;
    switch (p) {
      case 0x40: return (1 << 6) | (dataRdy << 5) | (timerInt << 4) | 0x08 | (ssiReq << 2);
      case 0x80: return copLatch;
      case 0xF0: return ldv.read();
      case 0xF1: return (banks[1] & 0x30) | (stStrobe ? 0 : 0x40) | (cmdStrobe ? 0 : 0x80) | 0x0F;
      case 0xF2: return banks[0];
    }
    return 0;
  };
  const pout = (p, v) => {
    p &= 0xFF;
    if (p < 8) { if (ssi) { if (p === 0 && ssi.ctl && v === 0) subtitle(); ssi.write(Math.min(p, 4), v); } else { ssiReq = 1; check(); } return; }
    switch (p) {
      case 0x20: if (v === 0x20) copLatch = 0xFA; break;
      case 0xA0: timerInt = 1; check(); break;
      case 0xC0: dataRdy = 1; check(); break;
      case 0xF3: periodic = 1; check(); m.after(8250, () => { periodic = 0; check(); }); break;
      case 0xF4: ldData = v; ldv.write(v); break;
      case 0xF5: ldCtl = v; break;
      case 0xF6: sb[0][(v >> 4) & 7] = v & 15; break;
      case 0xF7: sb[1][(v >> 4) & 7] = v & 15; break;
    }
  };
  cpu = m.addCPU(Z80CPU({ rd, wr, in: pin, out: pout }), 4000000);
  cpu.irqHold = false; cpu.reset(); check();
  m.every(1e6 / 60, () => { ldp.field(); ldvStrobes(m, (st, on) => { if (st) stStrobe = on; else cmdStrobe = on; }); });
  m.every(30000, () => { timerInt = 0; check(); });
  const key = code => { copLatch = code; dataRdy = 0; check(); };
  Object.assign(G, {
    name: set, fps: 29.97, ldp, m, res, ow: 320, oh: 240, keyboard: true, showScore: true,
    runField() { m.runUs(FIELD_US); },
    /* teclado alfanumérico del gabinete */
    typeKey(e) {
      const k = e.code;
      if (/^Key[A-Z]$/.test(k)) { key(k.charCodeAt(3)); return true; }
      if (/^(Digit|Numpad)\d$/.test(k)) { key(0x30 + +k.slice(-1)); return true; }
      const F = { F1: 0x80, F2: 0x81, F3: 0x82, F4: 0x83 };
      if (k in F) { key(F[k]); return true; }
      if (k === 'Space') { key(0x20); return true; }
      if (k === 'Enter' || k === 'NumpadEnter') { key(0x0D); return true; }
      if (k === 'Backspace') { key(0x08); return true; }
      return false;
    },
    input(sw, d) {
      const b = bit => { banks[1] = d ? banks[1] & ~bit : banks[1] | bit; };
      if (sw === SW.COIN1) b(0x10); else if (sw === SW.COIN2) b(0x20);
    },
    draw(buf) {
      buf.fill(0);
      if (!G.showScore) return;
      const W = 320, on = rgba(255, 70, 40), off = rgba(60, 12, 8, 200), bg = rgba(0, 0, 0, 170);
      for (let y = 222; y < 240; y++) for (let x = 0; x < W; x++) buf[y * W + x] = bg;
      for (let i = 0; i < 8; i++) { drawSeg(buf, W, 8 + i * 9, 225, sb[0][i], on, off); drawSeg(buf, W, 240 + i * 9, 225, sb[1][i], on, off); }
    },
    sample() { if (!vtx) return 0; vAcc += vtx.sclock / env.sampleRate; while (vAcc >= 1) { vAcc -= 1; vLast = vtx.next(); } return vLast * 1.4; },
    status() { return 'PC ' + cpu.pc.toString(16).padStart(4, '0') + ' · LD-V1000 · teclado · ' + (vtx ? 'Votrax SC-01A' : 'sin voz'); }
  });
  return G;
}
DRIVERS.thayers = drvThayers;
