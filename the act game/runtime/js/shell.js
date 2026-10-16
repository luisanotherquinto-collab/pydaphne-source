// The Act - cascaron arcade (attract, monedas, creditos, vidas, continue) + reproductor de historias decaf
"use strict";
(function () {
  const $ = id => document.getElementById(id);
  const W = 640, H = 480;
  const BUILD = window.ACT_BUILD || {};
  const DATA = 'data/';
  // modo debug: index.html#debug&start=18  (W = forzar victoria, L = forzar derrota, N = siguiente pelicula)
  const HASH = new URLSearchParams(location.hash.slice(1));
  const DEBUG = HASH.has('debug');

  // ------------------------------------------------------------ configuracion de operador
  const CFG_KEY = 'theact_operator_v1';
  const CFG = Object.assign({ price: 0, coinValue: 25, lives: 3, difficulty: 2, skipMovies: true, attractSound: true, scanlines: false, smooth: true, knobSpeed: 1.0, invertKnob: false }, loadCfg());
  function loadCfg() { try { return JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch (e) { return {}; } }
  function saveCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(CFG)); } catch (e) { } }

  // ------------------------------------------------------------ pantalla
  const cv = $('screen'), ctx = cv.getContext('2d');
  cv.width = W; cv.height = H;
  const img = ctx.createImageData(W, H);
  const fb32 = new Uint32Array(img.data.buffer);
  function applyView() {
    document.body.classList.toggle('scan', !!CFG.scanlines);
    cv.style.imageRendering = CFG.smooth ? 'auto' : 'pixelated';
  }
  applyView();
  function blank() { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }

  // ------------------------------------------------------------ audio
  let AC = null, master = null;
  function unlockAudio() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    AC = new C(); master = AC.createGain(); master.gain.value = 0.9; master.connect(AC.destination);
  }
  async function fetchBuf(url) { const r = await fetch(url); if (!r.ok) throw new Error('no se pudo cargar ' + url); return await r.arrayBuffer(); }
  function decodeAudio(ab) { return new Promise((res, rej) => { const p = AC.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); }); }
  let sfx = {};
  async function loadSfx() {
    for (const [k, f] of Object.entries({ coin: (BUILD.ui && BUILD.ui.coin) || 'ui/coin.flac' })) {
      try { sfx[k] = await decodeAudio(await fetchBuf(DATA + f)); } catch (e) { }
    }
  }
  function playSfx(k) { if (!AC || !sfx[k]) return; const s = AC.createBufferSource(); s.buffer = sfx[k]; s.connect(master); s.start(); }

  // ------------------------------------------------------------ entrada (knob, coin, start)
  const input = { delta: 0, keysL: false, keysR: false, start: false, coin: false };
  let knobVis = 0.5;
  window.addEventListener('keydown', e => {
    if (e.repeat && !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    unlockAudio();
    if (e.key === 'ArrowLeft' || e.key === 'a') input.keysL = true;
    else if (e.key === 'ArrowRight' || e.key === 'd') input.keysR = true;
    else if (e.key === '5' || e.key === 'c' || e.key === 'C') coinIn();
    else if (e.key === '1' || e.key === 'Enter' || e.key === ' ') pressStart();
    else if (e.key === 'F2' || e.key === 'Tab') { e.preventDefault(); toggleOperator(); }
    else if (e.key === 'f' || e.key === 'F11') { e.preventDefault(); toggleFS(); }
    else if (e.key === 'Escape' && opOpen) toggleOperator();
    else if (DEBUG && (e.key === 'w' || e.key === 'W') && curScene) { curScene.exited = true; curScene.exitStatus = 2; curScene.exitDetail = -1; }
    else if (DEBUG && (e.key === 'l' || e.key === 'L') && curScene) { curScene.exited = true; curScene.exitStatus = 1; curScene.exitDetail = +(HASH.get('detail') || 1); }
    else if (DEBUG && (e.key === 'n' || e.key === 'N') && playVideo.skip) playVideo.skip();
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a') input.keysL = false;
    if (e.key === 'ArrowRight' || e.key === 'd') input.keysR = false;
  });
  // rueda del raton = giro del knob
  window.addEventListener('wheel', e => { input.delta += (e.deltaY > 0 ? 1 : -1) * 24 * CFG.knobSpeed; e.preventDefault(); }, { passive: false });
  // arrastre (raton / tactil) sobre la pantalla = knob relativo, como deslizar en iOS
  let drag = null;
  const stage = $('stage');
  stage.addEventListener('pointerdown', e => { unlockAudio(); if (e.target.closest('.btn,#operator')) return; drag = { x: e.clientX, id: e.pointerId }; stage.setPointerCapture(e.pointerId); });
  stage.addEventListener('pointermove', e => { if (!drag || drag.id !== e.pointerId) return; const r = cv.getBoundingClientRect(); const dx = (e.clientX - drag.x) * (W / r.width); drag.x = e.clientX; input.delta += dx * 1.6 * CFG.knobSpeed; });
  const endDrag = e => { if (drag && drag.id === e.pointerId) drag = null; };
  stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
  // knob en pantalla (movil): perilla giratoria
  const knobEl = $('knob');
  let kdrag = null;
  knobEl.addEventListener('pointerdown', e => { unlockAudio(); e.stopPropagation(); kdrag = { a: angleOf(e), id: e.pointerId }; knobEl.setPointerCapture(e.pointerId); });
  knobEl.addEventListener('pointermove', e => { if (!kdrag || kdrag.id !== e.pointerId) return; let a = angleOf(e), d = a - kdrag.a; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; kdrag.a = a; input.delta += d * 180 * CFG.knobSpeed; });
  knobEl.addEventListener('pointerup', () => kdrag = null); knobEl.addEventListener('pointercancel', () => kdrag = null);
  function angleOf(e) { const r = knobEl.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); }
  $('bCoin').addEventListener('pointerdown', e => { e.stopPropagation(); unlockAudio(); coinIn(); });
  $('bStart').addEventListener('pointerdown', e => { e.stopPropagation(); unlockAudio(); pressStart(); });
  $('bOp').addEventListener('pointerdown', e => { e.stopPropagation(); toggleOperator(); });
  $('bFS').addEventListener('pointerdown', e => { e.stopPropagation(); toggleFS(); });
  function toggleFS() { const d = document.documentElement; if (!document.fullscreenElement) (d.requestFullscreen || d.webkitRequestFullscreen || (() => { })).call(d); else (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
  function pollGamepad() {
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const g of gps) {
      if (!g) continue;
      const ax = g.axes[0] || 0; if (Math.abs(ax) > 0.15) input.delta += ax * 10 * CFG.knobSpeed;
      const b = i => g.buttons[i] && g.buttons[i].pressed;
      if (b(9) || b(0)) { if (!pollGamepad.s) pressStart(); pollGamepad.s = true; } else pollGamepad.s = false;
      if (b(8) || b(2)) { if (!pollGamepad.c) coinIn(); pollGamepad.c = true; } else pollGamepad.c = false;
    }
  }
  function takeKnobDelta(dt) {
    let d = input.delta; input.delta = 0;
    if (input.keysL) d -= 420 * dt * CFG.knobSpeed;
    if (input.keysR) d += 420 * dt * CFG.knobSpeed;
    return CFG.invertKnob ? -d : d;
  }

  // ------------------------------------------------------------ monedas / creditos
  let cents = 0, credits = 0;
  function coinIn() { cents += CFG.coinValue; playSfx('coin'); recomputeCredits(); if (mode === 'attract') showInstructions(); }
  function recomputeCredits() { if (CFG.price <= 0) return; while (cents >= CFG.price) { cents -= CFG.price; credits++; } }
  function canStart() { return CFG.price <= 0 || credits > 0; }
  function useCredit() { if (CFG.price <= 0) return true; if (credits > 0) { credits--; return true; } return false; }
  function moneyText() { return '$' + (cents / 100).toFixed(2); }

  // ------------------------------------------------------------ historias
  const TYPES = new Set(['Movie', 'Game', 'Story', 'Image', 'Menu', 'Action']);
  function parseStory(text) {
    const defs = {}, trans = {}; let base = '';
    for (let raw of text.split(/\r?\n/)) {
      const line = raw.trim(); if (!line || line.startsWith('//')) continue;
      const f = line.split(',').map(s => s.trim());
      if (f.length === 1) { base = f[0]; continue; }
      if (TYPES.has(f[1])) { defs[f[0]] = { id: f[0], type: f[1], title: f[2], dir: f[3] || '', file: f[4] || '', extra: f.slice(5) }; continue; }
      if (defs[f[1]] !== undefined && f.length <= 3) continue; // lineas sueltas tipo "win18a, 18c"
      const list = [];
      for (let i = 1; i + 1 < f.length; i += 2) {
        let ev = f[i], tg = f[i + 1]; if (!ev) continue;
        const consume = ev.startsWith(':'); ev = ev.replace(/^:+/, '').replace(/:+$/, '');
        const m = ev.match(/^(.*?)\((\d+)\)$/); const detail = m ? +m[2] : null; if (m) ev = m[1].trim();
        list.push({ ev, detail, consume, target: tg });
      }
      trans[f[0]] = list;
    }
    return { defs, trans, base };
  }
  function resolve(story, id, out) {
    const list = story.trans[id]; if (!list) return null;
    const pick = (f) => list.find(f);
    let t = pick(e => e.ev === out.ev && e.detail !== null && e.detail === out.detail)
      || pick(e => e.ev === out.ev && e.detail === null)
      || pick(e => e.ev === 'all');
    if (!t || !t.target) return null;
    return t.target;
  }

  // ------------------------------------------------------------ carga de escenas
  const sceneCache = new Map();
  function loadScene(seqdir) {
    if (sceneCache.has(seqdir)) return sceneCache.get(seqdir);
    const p = (async () => {
      const man = await (await fetch(DATA + seqdir + '/manifest.json')).json();
      const jobs = [];
      // logica recompilada del modulo
      if (!window.ACT_RECOMP || !window.ACT_RECOMP[man.module]) jobs.push(loadScript('js/recomp/' + man.module + '.js'));
      const paks = {};
      for (const [k, v] of Object.entries(man.paks)) jobs.push(fetchBuf(DATA + v).then(b => { paks[k] = new Uint8Array(b); }));
      const bgs = new Array(man.bgs.length).fill(null);
      man.bgs.forEach((b, i) => { if (b.file) jobs.push(loadImagePixels(DATA + b.file).then(px => { bgs[i] = px; })); });
      const snds = {};
      man.sounds.forEach(ri => { const r = man.resources[ri]; jobs.push(fetchBuf(DATA + r.file).then(ab => AC ? decodeAudio(ab) : null).then(buf => { snds[ri] = buf; }).catch(() => { })); });
      let done = 0; jobs.forEach(j => j.then(() => { done++; loadProgress(done / jobs.length); }));
      await Promise.all(jobs);
      return { man, paks, bgs, snds };
    })();
    sceneCache.set(seqdir, p);
    p.catch(() => sceneCache.delete(seqdir));
    // limitar cache a 2 escenas (actual + siguiente)
    if (sceneCache.size > 2) { const k = sceneCache.keys().next().value; if (k !== seqdir) sceneCache.delete(k); }
    return p;
  }
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.appendChild(s); }); }
  function loadImagePixels(url) {
    return new Promise((res, rej) => {
      const im = new Image(); im.onload = () => {
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
        const d = x.getImageData(0, 0, im.width, im.height); const px = new Uint32Array(d.data.buffer.slice(0));
        let opaque = true; for (let i = 0; i < px.length; i += 7) if ((px[i] >>> 24) !== 255) { opaque = false; break; }
        res({ px, w: im.width, h: im.height, opaque });
      }; im.onerror = () => rej(new Error(url)); im.src = url;
    });
  }
  let loadingOn = false;
  function loadProgress(f) { if (loadingOn) $('loadbar').style.width = Math.round(f * 100) + '%'; }
  function showLoading(on) { loadingOn = on; $('loading').style.display = on ? 'flex' : 'none'; if (on) $('loadbar').style.width = '0%'; }

  // ------------------------------------------------------------ estado general
  let mode = 'boot';            // boot | attract | instr | story | continue | ending | operator
  let player = { lives: 3, state: {} };
  let runToken = 0;             // invalida tareas async al cambiar de modo
  const video = $('video');
  function stopVideo() { video.onended = null; video.onerror = null; video.pause(); video.removeAttribute('src'); video.load(); video.style.display = 'none'; }
  function playVideo(src, { loop = false, muted = false } = {}) {
    return new Promise((res) => {
      stopVideo(); video.style.display = 'block'; video.loop = loop; video.muted = muted;
      video.src = DATA + 'media/' + src;
      video.onended = () => res('ended'); video.onerror = () => res('error');
      const p = video.play(); if (p && p.catch) p.catch(() => { video.muted = true; video.play().catch(() => res('error')); });
      playVideo.skip = () => res('skip');
    });
  }

  // ------------------------------------------------------------ attract / instrucciones (pantalla naranja del arcade)
  let slateImg = null; (() => { const i = new Image(); i.src = DATA + 'ui/slate.png'; i.onload = () => slateImg = i; })();
  // Pantalla de instrucciones del arcade, medida desde la captura (1920x1080 = 640x480 estirado: x/3, y*4/9)
  function fitText(txt, x, y, w, font) { ctx.font = font; const m = ctx.measureText(txt).width; ctx.save(); ctx.translate(x, y); ctx.scale(w / m, 1); ctx.fillText(txt, 0, 0); ctx.restore(); }
  function drawInstructions(t) {
    const g = ctx.createLinearGradient(0, 0, W, H * 0.6); g.addColorStop(0, '#dca10c'); g.addColorStop(0.55, '#d0860f'); g.addColorStop(1, '#c66c0c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // vetas onduladas suaves en diagonal
    ctx.save(); ctx.globalAlpha = 0.09; ctx.fillStyle = '#fff6c8';
    for (let k = -2; k < 9; k++) { ctx.beginPath(); const y0 = k * 62; ctx.moveTo(0, y0);
      for (let x = 0; x <= W; x += 16) ctx.lineTo(x, y0 + Math.sin(x / 140 + k * 0.9 + t * 0.25) * 9 - x * 0.08);
      for (let x = W; x >= 0; x -= 16) ctx.lineTo(x, y0 + 24 + Math.sin(x / 120 + k + t * 0.25) * 7 - x * 0.08); ctx.fill(); }
    ctx.restore();
    const arrow = (y, text) => {
      ctx.fillStyle = '#000'; ctx.beginPath();
      ctx.moveTo(73, y - 17); ctx.lineTo(386, y - 17); ctx.lineTo(386, y - 25); ctx.lineTo(432, y); ctx.lineTo(386, y + 25); ctx.lineTo(386, y + 17); ctx.lineTo(73, y + 17);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
      ctx.save(); ctx.translate(0, 0); ctx.transform(1, 0, -0.16, 1, y * 0.16, 0);
      fitText(text, 82, y + 1, text.length > 23 ? 311 : 300, '32px "Archivo Black", "Arial Black", Arial, sans-serif');
      ctx.restore();
    };
    arrow(126, 'WHEN  YOU  SEE  THE  SLATE');
    arrow(254, 'GRAB  THE  KNOB  AND  PLAY');
    halo(497, 122, 64);
    if (slateImg) { const w = 104, h = slateImg.height * w / slateImg.width; ctx.drawImage(slateImg, 497 - w / 2, 120 - h / 2, w, h); }
    halo(497, 256, 58); drawKnob(497, 247, 43, t);
    if (canStart() && Math.floor(t * 1.6) % 2 === 0) {
      ctx.textBaseline = 'alphabetic'; const f = '50px "Cooper Black", "Archivo Black", "Arial Black", sans-serif';
      ctx.fillStyle = 'rgba(70,35,0,0.6)'; fitText('press start', 203, 369, 247, f);
      ctx.fillStyle = '#fff'; fitText('press start', 200, 366, 247, f);
    }
    ctx.fillStyle = '#000'; ctx.fillRect(0, 443, W, H - 443);
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
    const priceTxt = (CFG.price <= 0 ? '0' : String(CFG.price)) + '  Cents  to  play.';
    fitText(priceTxt, 120, 463, priceTxt.length * 9.6, '19px Arial, Helvetica, sans-serif');
    const dt = 'Dollars  inserted:  ' + moneyText();
    fitText(dt, 372, 463, dt.length * 7.75, '19px Arial, Helvetica, sans-serif');
    if (CFG.price > 0 && credits > 0) { ctx.font = '13px Arial'; ctx.fillStyle = '#ffd966'; ctx.fillText('CREDITS ' + credits, 8, 432); }
  }
  function halo(x, y, r) { const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 1.3); g.addColorStop(0, 'rgba(255,255,235,0.97)'); g.addColorStop(0.55, 'rgba(255,248,200,0.55)'); g.addColorStop(1, 'rgba(255,240,180,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.3, 0, Math.PI * 2); ctx.fill(); }
  function drawKnob(x, y, r, t) {
    const ry = r * 0.6, side = 22;
    ctx.save();
    const sg = ctx.createLinearGradient(x - r, 0, x + r, 0); ['#5c5c5c', '#9a9a9a', '#cfcfcf', '#7d7d7d', '#4a4a4a'].forEach((c, i, a) => sg.addColorStop(i / (a.length - 1), c));
    ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(x, y + side, r, ry, 0, 0, Math.PI); ctx.lineTo(x - r, y); ctx.ellipse(x, y, r, ry, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill();
    let g = null; try { g = ctx.createConicGradient(t * 0.35, x, y); } catch (e) { }
    if (g) { ['#7a7a7a', '#f2f2f2', '#8c8c8c', '#ffffff', '#6e6e6e', '#e6e6e6', '#7a7a7a'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c)); ctx.fillStyle = g; } else ctx.fillStyle = '#c4c4c4';
    ctx.beginPath(); ctx.ellipse(x, y, r, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  async function bootAttract() {
    const tok = ++runToken; mode = 'attract'; setHUD();
    // ciclo: video attract -> pantalla de instrucciones -> repetir
    while (tok === runToken) {
      if (BUILD.media && BUILD.media.attract) {
        const r = await playVideo(BUILD.media.attract, { muted: !CFG.attractSound });
        if (tok !== runToken) return;
      }
      stopVideo();
      await instructionsFor(10, tok);
      if (tok !== runToken) return;
    }
  }
  function instructionsFor(sec, tok) {
    return new Promise(res => {
      const t0 = performance.now(); mode = 'instr'; setHUD();
      const step = () => {
        if (tok !== runToken) return res();
        const t = (performance.now() - t0) / 1000;
        drawInstructions(t);
        if (t > sec && !canStart()) { mode = 'attract'; return res(); }
        requestAnimationFrame(step);
      }; step();
    });
  }
  function showInstructions() { const tok = ++runToken; stopVideo(); instructionsFor(1e9, tok); }

  // ------------------------------------------------------------ start / continue
  let continueAt = null;
  function pressStart() {
    if (opOpen) return;
    if (mode === 'boot') { startBoot(); return; }
    if (mode === 'story') { if (playVideo.skip && CFG.skipMovies && curKind === 'Movie') playVideo.skip(); return; }
    if (mode === 'ending') { if (playVideo.skip) playVideo.skip(); return; }
    if ((mode === 'attract' || mode === 'instr') && useCredit()) { newGame(null); return; }
    if (mode === 'continue' && useCredit()) { newGame(continueAt); return; }
  }
  function newGame(resume) {
    player = { lives: CFG.lives, state: {} }; ++runToken; stopVideo();
    runMainStory(resume);
  }

  // ------------------------------------------------------------ ejecucion de historias
  const stories = {};
  async function getStory(name) { if (!stories[name]) { const st = parseStory(await (await fetch(DATA + 'story/' + name)).text()); st.name = name; stories[name] = st; } return stories[name]; }
  let curKind = null;
  const has = new Set(BUILD.sequences || []);   // secuencias incluidas en este build
  const isSingle = BUILD.mode === 'single';

  async function runMainStory(resume) {
    const tok = runToken; mode = 'story'; setHUD();
    const res = await runStory(BUILD.mainStory || 'main.story', resume ? resume.slice() : (DEBUG && HASH.get('start') ? [HASH.get('start')] : null), tok, BUILD.start || null);
    if (tok !== runToken) return;
    if (res.ev === 'win') ending(tok);
    else gameOver(tok);
  }
  // corre una historia; resume: ruta [id, subId...] para continuar
  async function runStory(name, resume, tok, startId) {
    const st = await getStory(name);
    let id = resume ? resume.shift() : (startId || firstSeq(st));
    let out = { ev: 'all', detail: null };
    for (let guard = 0; guard < 500 && id; guard++) {
      if (tok !== runToken) return out;
      const d = st.defs[id];
      if (!d) break;
      const included = isIncluded(d, st);
      if (!included) {
        if (isSingle) break;                // build de un nivel: fin de la historia
        // juntos con exclusiones: saltar como si se ganara/terminara
        out = { ev: d.type === 'Game' || d.type === 'Story' ? 'win' : out.ev, detail: null };
      } else {
        curKind = d.type;
        if (DEBUG) { console.log('[story]', st.name, id, d.type, JSON.stringify(out)); window.ACT_TRACE = (window.ACT_TRACE || []).concat([st.name + ':' + id]); }
        out = await runSeq(st, d, out, tok, resume);
        resume = null;
      }
      if (tok !== runToken) return out;
      const next = resolve(st, id, out);
      if (!next) break;
      id = next;
    }
    return out;
  }
  function firstSeq(st) { return Object.keys(st.defs)[0]; }
  function isIncluded(d, st) {
    if (d.type === 'Game') return has.has(d.dir);
    if (d.type === 'Story') return (BUILD.substories || []).includes(d.file) && (BUILD.subIncluded || {})[d.file] !== false;
    if (d.type === 'Movie') return !!mediaFor(d, st);
    return true;
  }
  function mediaFor(d, st) { return (BUILD.movies || {})[st.name + '|' + d.id] || null; }

  async function runSeq(st, d, out, tok, resume) {
    if (d.type === 'Movie') {
      setHUD();
      const r = await playVideo(mediaFor(d, st)); stopVideo();
      return out; // las peliculas propagan el resultado previo
    }
    if (d.type === 'Image') {
      const ms = Math.max(1, +(d.extra[0] || 1)) * 1000 / 60;
      blank(); await sleep(ms); return out;
    }
    if (d.type === 'Menu') { await showMenu(d.extra[0]); return out; }
    if (d.type === 'Story') {
      const sub = await runStory(d.file, resume && resume.length ? resume : null, tok);
      return sub;
    }
    if (d.type === 'Game') return await runGame(d, tok, st);
    return out;
  }
  async function showMenu(name) {
    const m = (BUILD.menus || {})[name]; if (!m) return;
    const bg = m.background ? await loadImg(DATA + m.background) : null, fg = m.image ? await loadImg(DATA + m.image) : null;
    blank(); if (bg) ctx.drawImage(bg, 0, 0, W, H); if (fg) ctx.drawImage(fg, 0, 0, W, H);
    await sleep((m.frames || 180) * 1000 / 60);
  }
  function loadImg(u) { return new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = u; }); }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ------------------------------------------------------------ escena de juego
  let curScene = null, curPath = [];
  async function runGame(d, tok, st) {
    showLoading(true);
    let assets;
    try { assets = await loadScene(d.dir); } catch (e) { showLoading(false); showError('Error cargando ' + d.dir + ': ' + e.message); return { ev: 'win', detail: null }; }
    showLoading(false);
    if (tok !== runToken) return { ev: 'all' };
    const sc = curScene = new ACT_SCENE.Scene({
      man: assets.man, assets, player, audio: AC, audioOut: master, startupParam: 0,
      onKnobSet: v => { knobVis = v; },
      inputCallback: inputCallbackFor(assets.man.module), difficultyEvent: CFG.difficulty
    });
    continueAt = currentPathTo(d.id);
    const [mn, mx] = sc.range();
    return await new Promise(res => {
      let last = performance.now(), acc = 0;
      const frame = (now) => {
        if (tok !== runToken) { sc.destroy(); return res({ ev: 'all' }); }
        let dt = Math.min(0.25, (now - last) / 1000); last = now;
        if (!paused) {
          pollGamepad();
          const dk = takeKnobDelta(dt);
          if (dk) sc.setControl(sc.control() + mn + dk);
          acc += dt;
          let n = 0;
          while (acc >= 1 / 60 && n < 8) { sc.tick(); acc -= 1 / 60; n++; if (sc.exited) break; }
          if (sc.dirty || n) { sc.render(); img.data.set(new Uint8ClampedArray(sc.frame.buffer)); ctx.putImageData(img, 0, 0); }
          knobVis = (sc.control()) / Math.max(1, mx - mn);
          drawKnobUI();
        }
        if (sc.exited) {
          sc.destroy(); curScene = null;
          if (sc.exitStatus === 2) return res({ ev: 'win', detail: null });
          const detail = sc.exitDetail >= 0 ? sc.exitDetail : null;
          player.lives--;
          return res({ ev: player.lives > 0 ? 'lose' : 'lose story', detail });
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }
  function inputCallbackFor(mod) { const a = (window.ACT_INPUTCB || {})[mod]; return a || 0; }
  // ruta de continue: si estamos dentro de una sub-historia, guardar [idStory, idSub]
  const pathStack = [];
  function currentPathTo(id) { return BUILD.subOf && BUILD.subOf[id] ? [BUILD.subOf[id], id] : [id]; }

  // ------------------------------------------------------------ fin de juego
  async function gameOver(tok) {
    mode = 'continue'; setHUD();
    let bg = await loadImg(DATA + 'ui/tryagain_background.png');
    const on = await loadImg(DATA + 'ui/tryagain_message_on.png'), off = await loadImg(DATA + 'ui/tryagain_message_off.png');
    const t0 = performance.now();
    while (tok === runToken && mode === 'continue') {
      const t = (performance.now() - t0) / 1000, left = Math.max(0, 15 - Math.floor(t));
      blank(); if (bg) ctx.drawImage(bg, 0, 0, W, H);
      const m = (Math.floor(t * 2) % 2) ? on : off; if (m) ctx.drawImage(m, 0, 0, W, H);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 22px Arial'; ctx.textAlign = 'center';
      ctx.fillText(canStart() ? 'PRESS START TO CONTINUE' : 'INSERT COIN TO CONTINUE', W / 2, 420);
      ctx.font = 'bold 40px Arial'; ctx.fillText(String(left), W / 2, 465); ctx.textAlign = 'left';
      if (left <= 0) break;
      await sleep(50);
    }
    if (tok === runToken && mode === 'continue') bootAttract();
  }
  async function ending(tok) {
    mode = 'ending'; setHUD();
    const bg = await loadImg(DATA + 'ui/game_summary_background.png'), msg = await loadImg(DATA + 'ui/game_summary_message_1.png');
    blank(); if (bg) ctx.drawImage(bg, 0, 0, W, H); if (msg) ctx.drawImage(msg, 0, 0, W, H);
    await sleep(5000);
    if (tok !== runToken) return;
    if (BUILD.media && BUILD.media.credits) { await playVideo(BUILD.media.credits); stopVideo(); }
    if (tok === runToken) bootAttract();
  }
  function showError(msg) { const e = $('err'); e.textContent = msg; e.style.display = 'block'; setTimeout(() => e.style.display = 'none', 6000); }

  // ------------------------------------------------------------ HUD movil / knob
  function setHUD() { document.body.dataset.mode = mode; }
  const kc = $('knobc'), kx = kc.getContext('2d');
  function drawKnobUI() {
    const s = kc.width, r = s / 2 - 6; kx.clearRect(0, 0, s, s);
    const g = kx.createRadialGradient(s / 2 - r / 3, s / 2 - r / 3, 4, s / 2, s / 2, r); g.addColorStop(0, '#fafafa'); g.addColorStop(1, '#6d6d6d');
    kx.fillStyle = g; kx.beginPath(); kx.arc(s / 2, s / 2, r, 0, 7); kx.fill();
    const a = -Math.PI * 0.75 + Math.max(0, Math.min(1, knobVis)) * Math.PI * 1.5;
    kx.strokeStyle = '#d23'; kx.lineWidth = 6; kx.beginPath(); kx.moveTo(s / 2, s / 2); kx.lineTo(s / 2 + Math.cos(a - Math.PI / 2) * r * 0.85, s / 2 + Math.sin(a - Math.PI / 2) * r * 0.85); kx.stroke();
  }
  drawKnobUI();

  // ------------------------------------------------------------ menu de operador
  let opOpen = false, paused = false;
  function toggleOperator() {
    opOpen = !opOpen; paused = opOpen; $('operator').style.display = opOpen ? 'block' : 'none';
    if (opOpen) renderOperator();
    if (curScene && curScene.snd && curScene.snd.ctx) { if (opOpen) AC.suspend(); else AC.resume(); }
    if (video.style.display === 'block') { if (opOpen) video.pause(); else video.play().catch(() => { }); }
  }
  function renderOperator() {
    const o = $('opbody'); o.innerHTML = '';
    const row = (label, key, opts) => {
      const d = document.createElement('div'); d.className = 'oprow';
      const s = document.createElement('select'); opts.forEach(([v, t]) => { const op = document.createElement('option'); op.value = JSON.stringify(v); op.textContent = t; if (JSON.stringify(CFG[key]) === op.value) op.selected = true; s.appendChild(op); });
      s.onchange = () => { CFG[key] = JSON.parse(s.value); saveCfg(); applyView(); };
      d.innerHTML = `<span>${label}</span>`; d.appendChild(s); o.appendChild(d);
    };
    row('Precio por partida', 'price', [[0, 'Free play (0¢)'], [25, '25¢'], [50, '50¢'], [75, '75¢'], [100, '$1.00']]);
    row('Valor de moneda', 'coinValue', [[25, '25¢'], [50, '50¢'], [100, '$1.00']]);
    row('Vidas por crédito', 'lives', [[1, '1'], [2, '2'], [3, '3'], [5, '5'], [9, '9']]);
    row('Dificultad', 'difficulty', [[1, 'Fácil'], [2, 'Normal'], [3, 'Difícil']]);
    row('Saltar películas con START', 'skipMovies', [[true, 'Sí'], [false, 'No (arcade)']]);
    row('Sonido en attract', 'attractSound', [[true, 'Sí'], [false, 'No']]);
    row('Sensibilidad del knob', 'knobSpeed', [[0.5, 'Baja'], [1.0, 'Normal'], [1.6, 'Alta'], [2.4, 'Muy alta']]);
    row('Invertir knob', 'invertKnob', [[false, 'No'], [true, 'Sí']]);
    row('Escalado', 'smooth', [[true, 'Suave'], [false, 'Pixelado']]);
    row('Scanlines CRT', 'scanlines', [[false, 'No'], [true, 'Sí']]);
    const info = document.createElement('div'); info.className = 'opinfo';
    info.innerHTML = `Build: <b>${BUILD.title || 'The Act'}</b> · niveles: ${(BUILD.levels || []).join(', ')}<br>Teclas: ←/→ o rueda = knob · 5/C = moneda · 1/Enter = start · F2 = operador · F = pantalla completa`;
    o.appendChild(info);
    const b = document.createElement('button'); b.textContent = 'Volver al attract'; b.onclick = () => { toggleOperator(); bootAttract(); }; o.appendChild(b);
  }
  $('opclose').onclick = toggleOperator;
  document.addEventListener('visibilitychange', () => { if (document.hidden && !opOpen) { paused = true; if (AC) AC.suspend(); } else if (!opOpen) { paused = false; if (AC) AC.resume(); } });

  // ------------------------------------------------------------ arranque
  async function startBoot() {
    if (mode !== 'boot') return;
    try { await document.fonts.load('27px "Archivo Black"'); } catch (e) { }
    unlockAudio(); $('boot').style.display = 'none';
    await loadSfx();
    bootAttract();
  }
  $('boot').addEventListener('pointerdown', e => { e.stopPropagation(); startBoot(); });
  window.addEventListener('keydown', () => { if (mode === 'boot') startBoot(); }, { once: false });
  setHUD();
})();
