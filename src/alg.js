/* ==========================================================================
 *  American Laser Games / Picmatic (Amiga 500 + Sony LDP-1450) — nativo.
 *  El núcleo Amiga (SAE con el hardware ALG de WinUAE) corre aislado en un
 *  marco invisible, porque define cientos de globales; el receptor lo maneja
 *  como un driver más: el disco lo pone DiscVideo (mp4 o en línea, CRT NTSC),
 *  la imagen del Amiga se compone encima con su genlock, y las pistolas vienen
 *  del ratón/táctil (jugador 1) y de los mandos (jugador 1 y 2).
 * ========================================================================== */
'use strict';
async function drvALG(lib, set, env) {
  const res = { missing: [], loaded: [] };
  let html = typeof emuHTML === 'function' ? emuHTML('alg') : null;
  if (!html) { res.missing.push('data/emus/alg.js'); return { name: set, res, ow: 640, oh: 480, ldp: new LDP(29.97), runField() {}, draw(b) { b.fill(0xff000000); }, input() {}, sample() { return 0; }, status() { return 'falta el núcleo ALG'; } }; }
  html = html.replace('<head>', '<head><script>window.ALG_GAME=' + JSON.stringify(set) + ';window.parentMuted=false;<\/script>');
  html = html.replace(/<\/body>/i, '<script>window.__ALG={IN:IN,LD:LD,CROP:(typeof CROP==="function"?CROP:null)};<\/script></body>');
  const f = document.createElement('iframe');
  f.setAttribute('allow', 'autoplay');
  f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;opacity:0;pointer-events:none;z-index:0';
  f.srcdoc = html;
  (document.getElementById('frames') || document.body).appendChild(f);
  let A = null, cvA = null;
  const ready = () => { try { A = f.contentWindow.__ALG; cvA = f.contentDocument.querySelector('#amiga canvas'); } catch (e) {} return A && cvA; };
  for (let i = 0; i < 200 && !ready(); i++) await new Promise(r => setTimeout(r, 50));
  res.loaded.push('SAE + ' + set);
  const LD = () => A && A.LD, IN = () => A && A.IN;
  const ldp = {
    get frame() { const l = LD(); return l ? l.addr : 0; }, get frac() { const l = LD(); return l ? l.frac : 0; },
    get status() { const l = LD(); return l && l.mode === 2 && l.dir === 0 ? LDP_PLAYING : LDP_PAUSED; },
    get target() { const l = LD(); return l ? l.addr : 0; }, fps: 29.97, speedNum: 1, speedDen: 1,
    get audio1() { const l = LD(); return !(l && (l.mute || !l.audio)); }, get audio2() { const l = LD(); return !(l && (l.mute || !l.audio)); },
    squelchSearch: false, get log() { const l = LD(); return l ? l.cmds.slice(-6) : []; }
  };
  /* pistolas: x/y normalizados 0-1, gatillo, recarga (disparo fuera de pantalla) */
  const gun = [{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }];
  const trig = (pl, on, off) => {
    const I = IN(); if (!I) return;
    I.gx[pl] = gun[pl].x; I.gy[pl] = gun[pl].y;
    I.off[0] = I.off[1] = off ? 1 : 0; I.trig[0] = I.trig[1] = on ? 1 : 0;   /* como el original: el juego alterna qué jugador lee */
    if (on && off) { I.holster[0] = I.holster[1] = 1; setTimeout(() => { if (IN()) { IN().holster[0] = IN().holster[1] = 0; } }, 350); }
    if (!on) setTimeout(() => { const J = IN(); if (J && !J.trig[0]) J.off[0] = J.off[1] = 0; }, 120);
  };
  const pulse = (k, ms) => { const I = IN(); if (!I) return; I[k] = 1; setTimeout(() => { if (IN()) IN()[k] = 0; }, ms); };
  const W = 640, H = 480;
  const G = {
    name: set, fps: 29.97, ldp, res, ow: W, oh: H, players: 2, analog: true,
    get videoBlank() { const l = LD(); return l ? !l.video : false; },
    runField() { try { f.contentWindow.parentMuted = !!(S && S.settings && S.settings.vol === 0); } catch (e) {} },
    analog(x, y) { gun[0].x = Math.max(0, Math.min(1, x / W)); gun[0].y = Math.max(0, Math.min(1, y / H)); const I = IN(); if (I) { I.gx[0] = I.gx[1] = gun[0].x; I.gy[0] = I.gy[1] = gun[0].y; } },
    input(sw, d) {
      switch (sw) {
        case SW.BUTTON1: trig(0, d, 0); break;
        case SW.BUTTON2: trig(0, d, 1); break;
        case SW.COIN1: if (d) pulse('coinL', 350); break; case SW.COIN2: if (d) pulse('coinR', 350); break;
        case SW.START1: if (d) pulse('startL', 600); break; case SW.START2: if (d) pulse('startR', 600); break;
        case SW.SERVICE: { const I = IN(); if (I) I.service = d ? 1 : 0; break; }
      }
    },
    gamepad(seat, gp, prev) {
      if (seat > 1) return;
      const bt = n => !!(gp.buttons[n] && gp.buttons[n].pressed);
      let ax = gp.axes[0] || 0, ay = gp.axes[1] || 0; if (Math.abs(ax) < 0.15) ax = 0; if (Math.abs(ay) < 0.15) ay = 0;
      const g = gun[seat]; g.x = Math.max(0, Math.min(1, g.x + ax * 0.018)); g.y = Math.max(0, Math.min(1, g.y + ay * 0.018));
      const I = IN(); if (I) { I.gx[seat] = g.x; I.gy[seat] = g.y; }
      if (bt(0) !== !!(prev && prev[0])) trig(seat, bt(0), 0);
      if (bt(1) !== !!(prev && prev[1])) trig(seat, bt(1), 1);
      if (bt(8) && !(prev && prev[8])) pulse(seat ? 'coinR' : 'coinL', 350);
      if (bt(9) && !(prev && prev[9])) pulse(seat ? 'startR' : 'startL', 600);
    },
    drawCanvas(ctx, vid) {
      const own = vid && vid.tagName === 'VIDEO';
      ctx.clearRect(0, 0, W, H);
      const l = LD();
      if (own && (!l || l.video)) {
        /* mientras el video busca se repite el último cuadro bueno (no parpadea a negro) */
        if (!G._vc) { G._vc = document.createElement('canvas'); G._vc.width = W; G._vc.height = H; G._vx = G._vc.getContext('2d'); }
        if (vid.readyState >= 2 && !vid.seeking) { G._vx.drawImage(vid, 0, 0, W, H); G._vok = true; }
        if (G._vok) ctx.drawImage(G._vc, 0, 0);
      }
      if (cvA && cvA.width) {
        const c = A.CROP ? A.CROP(cvA.height) : { top: 0, h: cvA.height };
        ctx.drawImage(cvA, 0, c.top, cvA.width, c.h, 0, 0, W, H);
      }
      /* miras */
      for (let p = 0; p < 2; p++) { if (p && !padSeatUsed(1)) continue; const x = gun[p].x * W, y = gun[p].y * H;
        ctx.strokeStyle = p ? 'rgba(60,200,255,.9)' : 'rgba(255,40,40,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.moveTo(x - 16, y); ctx.lineTo(x + 16, y); ctx.moveTo(x, y - 16); ctx.lineTo(x, y + 16); ctx.stroke(); }
    },
    draw(buf) { buf.fill(0); },
    sample() { return 0; },        /* el sonido del Amiga sale del propio núcleo SAE */
    status() { const l = LD(); return 'Amiga 500 · LDP-1450 ' + (l ? l.addr + ' modo ' + l.mode : '—'); }
  };
  return G;
}
function padSeatUsed(seat) { try { return [...padSeat.values()].includes(seat); } catch (e) { return false; } }
DRIVERS.alg = drvALG;
