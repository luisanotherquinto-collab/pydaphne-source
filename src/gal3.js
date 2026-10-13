'use strict';

// Galaxian 3 core wrapper (shared by browser page and Node harness)
const G3 = (() => {
  // ---- tiny ZIP reader (stored + deflate) ----
  async function unzip(buf, inflateRaw) {
    const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('ZIP inválido');
    const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
    const out = {};
    for (let k = 0; k < n; k++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl)).split('/').pop();
      const lnl = dv.getUint16(lho + 26, true), lxl = dv.getUint16(lho + 28, true);
      const data = u8.subarray(lho + 30 + lnl + lxl, lho + 30 + lnl + lxl + csize);
      if (name) out[name] = method === 0 ? data.slice() : await inflateRaw(data);
      p += 46 + nl + xl + cl;
    }
    return out;
  }
  const wasiStub = {
    fd_close: () => 0, fd_seek: () => 0, proc_exit: (c) => { throw new Error('exit ' + c); },
    fd_write: (fd, iovs, n, nw) => 0,
  };
  async function create(wasmBytes) {
    const { instance } = await WebAssembly.instantiate(wasmBytes, { wasi_snapshot_preview1: wasiStub });
    const x = instance.exports;
    if (x._initialize) x._initialize();
    const mem = () => new Uint8Array(x.memory.buffer);
    const i32 = (sym) => new Int32Array(x.memory.buffer, sym.value, 1);
    const core = {
      x,
      loadFiles(files) {
        let used = 0;
        for (const [name, data] of Object.entries(files)) {
          const np = x.malloc(name.length + 1); const m = mem();
          for (let i = 0; i < name.length; i++) m[np + i] = name.charCodeAt(i); m[np + name.length] = 0;
          const dp = x.malloc(data.length); mem().set(data, dp);
          used += x.g3_load(np, dp, data.length);
          x.free(dp); x.free(np);
        }
        return used;
      },
      init() { x.g3_init(); },
      frame() { x.g3_run_frame(); },
      frameNo() { return x.g3_frame() >>> 0; },
      // RGBA view (512x512) of chain k; format is ABGR little-endian => bytes R,G,B,A
      fb(k) { return new Uint8ClampedArray(x.memory.buffer, x.g3_fb(k), 512 * 512 * 4); },
      stats(k) { return { quads: x.g3_chain_stat(k, 0) >>> 0, kicks: x.g3_chain_stat(k, 1) >>> 0, polypix: x.g3_stats(k, 0), sprpix: x.g3_stats(k, 2) }; },
      pcs() { return [0, 1, 2, 3, 4].map(i => (x.g3_pc(i) >>> 0).toString(16).padStart(8, '0')); },
      dspPcs() { return [x.g3_dsp_pc(0, 0), x.g3_dsp_pc(0, 1), x.g3_dsp_pc(1, 0), x.g3_dsp_pc(1, 1)].map(v => v.toString(16).padStart(4, '0')); },
      leds() { return [x.g3_led(0) >>> 0, x.g3_led(1) >>> 0]; },
      unmapped() { const r = []; for (let i = 0; i < x.g3_ulog_n(); i++) r.push({ addr: x.g3_ulog(i, 0) >>> 0, cpu: x.g3_ulog(i, 1), w: x.g3_ulog(i, 2), n: x.g3_ulog(i, 3) >>> 0, pc: x.g3_ulog(i, 4) >>> 0 }); return r; },
      setVar(name, v) { i32(x[name])[0] = v; },
      getVar(name) { return i32(x[name])[0]; },
      saveState() { const n = x.g3_state_size(); const p = x.malloc(n); x.g3_state_save(p); const out = mem().slice(p, p + n); x.free(p); return out; },
      loadState(b) { const p = x.malloc(b.length); mem().set(b, p); x.g3_state_load(p); x.free(p); },
    };
    return core;
  }
  return { unzip, create };
})();

/* ==========================================================================
 *  Galaxian³ Theater 6 (Namco 1990) — nativo. El núcleo es el WASM del
 *  emulador de Luis (driver gal3 de MAME corregido: 68020×2 + 68000×3 +
 *  TMS320C25×4); aquí se envuelve como un driver más del receptor:
 *  6 artilleros (ratón/táctil = jugador 1, mandos Bluetooth/USB = jugadores
 *  1-6), laserdisc wide con el protocolo Pioneer de la tabla de la ROM RS.
 * ========================================================================== */
const GAL3_LD_TABLE = (() => {
  const t = { 1: ['SA'], 2: ['PL'], 3: ['PA'], 6: ['ST'] };
  const se = {16:11,17:31,18:41,19:51,20:61,21:900,22:4111,23:4171,24:5255,25:5384,26:7710,27:8250,28:8250,29:3195,30:3577,31:4591,
    48:5381,49:9471,50:11495,51:12260,52:14230,53:17560,54:1711,55:2281,56:13780,57:20260,58:22460,59:17500,60:4291,61:5941,62:8551,63:9931};
  const pl = {32:4110,33:5254,34:7709,35:14229,36:17559,37:20259,38:7740,39:14379,40:2280,41:21429,42:4891,43:6541,44:23229,45:1500,46:9151,47:10531};
  for (const k in se) t[k] = ['SE', se[k]];
  for (const k in pl) t[k] = ['PL', pl[k]];
  return t;
})();
async function drvGal3(lib, set, env) {
  const res = { missing: [], loaded: [] };
  if (typeof window === 'undefined' || !window.G3_WASM_B64) throw new Error('Falta data/gal3_core.js (núcleo WASM de Galaxian³)');
  const files = {};
  for (const s of ['gal3', 'namcoc67']) {
    const recs = lib.sets[s] || [];
    if (!recs.length) res.missing.push(s + '.zip');
    for (const r of recs) { files[r.name] = await lib.get(r); res.loaded.push(r.name); }
  }
  const b = atob(window.G3_WASM_B64), wasm = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) wasm[i] = b.charCodeAt(i);
  const core = await G3.create(wasm); core.loadFiles(files); core.init();
  const ldp = new LDP(29.97); ldp.squelchSearch = true;
  let playTo = -1, startPulse = 0, turbo = true, firstPoly = -1;
  const P = [...Array(6)].map((_, i) => ({ x: 512, y: 256, fire: 0, b2: 0, coinQ: 0, coinT: 0, vx: 0, vy: 0, mouse: i === 0 }));
  const ldCommand = cmd => {
    const e = GAL3_LD_TABLE[cmd]; if (!e) return;
    const [op, f] = e;
    if (op === 'SE') { playTo = -1; ldp.search(f, true); }
    else if (op === 'PL') { playTo = f !== undefined ? f : -1; ldp.play(); }
    else ldp.pause();
  };
  const step = () => {
    for (let i = 0; i < 6; i++) {
      const p = P[i];
      p.x = Math.max(0, Math.min(1023, p.x + p.vx)); p.y = Math.max(0, Math.min(511, p.y + p.vy));
      let c = 0;
      if (p.coinT > 0) { p.coinT--; c = p.coinT > 8 ? 1 : 0; } else if (p.coinQ > 0) { p.coinQ--; p.coinT = 14; c = 1; }
      core.x.g3_aim(i, p.x, p.y, (p.fire ? 1 : 0) | (p.b2 ? 2 : 0), c, 0);
    }
    core.x.g3_set_switch(2, startPulse > 0 ? 1 : 0); if (startPulse > 0) startPulse--;
    core.frame();
    let r; while ((r = core.x.g3_ld_poll()) >= 0) ldCommand(r & 0xffff);
    if (firstPoly < 0 && core.x.g3_stats(0, 0) > 200) { firstPoly = core.frameNo(); turbo = false; }
  };
  const W = 1024, H = 512;
  const G = {
    name: set, fps: 29.97, ldp, res, ow: W, oh: H, wide: true, players: 6, analog: true,
    get videoBlank() { return false; },
    get booting() { return turbo; },
    runField() {
      ldp.field(); if (playTo > 0 && ldp.frame >= playTo) { ldp.pause(); playTo = -1; }
      if (turbo) { const t0 = performance.now(); while (performance.now() - t0 < 25 && turbo) step(); }
      else step();
    },
    /* ratón/táctil: jugador 1 apunta con coordenadas del overlay */
    analog(x, y) { P[0].x = x; P[0].y = y; },
    input(sw, d) {
      const p = P[0], v = d ? 1 : 0;
      switch (sw) {
        case SW.BUTTON1: p.fire = v; break; case SW.BUTTON2: p.b2 = v; break;
        case SW.LEFT: p.vx = d ? -12 : 0; break; case SW.RIGHT: p.vx = d ? 12 : 0; break;
        case SW.UP: p.vy = d ? -9 : 0; break; case SW.DOWN: p.vy = d ? 9 : 0; break;
        case SW.COIN1: if (d) p.coinQ++; break; case SW.START1: if (d) startPulse = 10; break;
      }
    },
    /* mandos: cada asiento tiene su propio estado (ejes + botones) */
    gamepad(seat, gp, prev) {
      const p = P[seat]; if (!p) return;
      let ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const bt = n => !!(gp.buttons[n] && (gp.buttons[n].pressed || gp.buttons[n].value > 0.4));
      if (bt(14)) ax = -1; if (bt(15)) ax = 1; if (bt(12)) ay = -1; if (bt(13)) ay = 1;
      if (Math.abs(ax) < 0.15) ax = 0; if (Math.abs(ay) < 0.15) ay = 0;
      p.vx = ax * Math.abs(ax) * 14; p.vy = ay * Math.abs(ay) * 10;
      p.fire = bt(0) || bt(7) || bt(5); p.b2 = bt(1) || bt(6) || bt(4);
      if (bt(8) && !(prev && prev[8])) p.coinQ++;
      if (bt(9) && !(prev && prev[9])) startPulse = 10;
    },
    draw(buf) {
      const a = new Uint32Array(core.x.memory.buffer, core.x.g3_fb(0), 512 * 512), bb = new Uint32Array(core.x.memory.buffer, core.x.g3_fb(1), 512 * 512);
      for (let y = 0; y < 512; y++) { buf.set(a.subarray(y * 512, y * 512 + 512), y * 1024); buf.set(bb.subarray(y * 512, y * 512 + 512), y * 1024 + 512); }
      /* miras de los 6 artilleros */
      const COL = [0xfff4f4f4, 0xff6ae035, 0xff3b3bff, 0xff00e6ff, 0xff1fd2ff, 0xffd62bff];
      for (let i = 0; i < 6; i++) { const p = P[i], cx = p.x | 0, cy = p.y | 0;
        for (let k = -7; k <= 7; k++) { if (Math.abs(k) < 3) continue;
          const xx = cx + k, yy = cy + k; if (xx >= 0 && xx < W) buf[cy * W + xx] = COL[i]; if (yy >= 0 && yy < H) buf[yy * W + cx] = COL[i]; } }
    },
    sample() { return 0; },
    status() { return (turbo ? 'arrancando (turbo) · ' : '') + 'frame ' + core.frameNo() + ' · LD ' + (ldp.log.slice(-1)[0] || ''); }
  };
  return G;
}
DRIVERS.gal3 = drvGal3;
