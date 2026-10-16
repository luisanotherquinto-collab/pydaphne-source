// The Act - runtime de escenas "Game" (motor decaf de Cecropia)
// La logica (GameLogicXX) y el nucleo updateState son codigo ARM recompilado (js/recomp/*.js).
// Aqui se construye el objeto GameSequence en la memoria de la VM con el layout original
// y se implementan (HLE) ScreenManager, SoundManager, ResourceManager, PlayerState,
// InputManager y Palette.
"use strict";
(function (G) {
  const NODE = 0x20000000, MASK = 0x0fffffff;
  const W = 640, H = 480;
  const SR = 44100; // frecuencia de referencia de los tiempos musicales (muestras)

  // ---------------------------------------------------------------- RL2
  class RLE {
    constructor(pak, off) {
      this.b = pak;
      const nfr = pak[off] | pak[off + 1] << 8, nmap = pak[off + 2];
      this.cmap = nmap ? pak.subarray(off + 4, off + 4 + nmap) : null;
      let p = off + 4 + nmap; this.frames = [];
      for (let i = 0; i < nfr; i++) {
        const w = pak[p] | pak[p + 1] << 8, h = pak[p + 2] | pak[p + 3] << 8, comp = pak[p + 4];
        const size = (pak[p + 8] | pak[p + 9] << 8 | pak[p + 10] << 16 | pak[p + 11] << 24) >>> 0;
        const x = pak[p + 12] | pak[p + 13] << 8, y = pak[p + 14] | pak[p + 15] << 8;
        this.frames.push({ w, h, comp, x, y, data: p + 16 }); p += 16 + size;
      }
    }
    get n() { return this.frames.length; }
    // dibuja sobre dst (Uint32Array 640x480, ABGR little-endian) con la paleta pal32 (Uint32Array 256)
    draw(dst, fi, pal32, ox, oy) {
      const f = this.frames[fi]; if (!f) return;
      const b = this.b, cmap = this.cmap;
      let p = f.data, pos = 0;
      const X0 = f.x + ox, Y0 = f.y + oy;
      const nib = () => { const by = b[p + (pos >> 1)]; const v = (pos & 1) ? (by & 15) : (by >> 4); pos++; return v; };
      const num = n => n < 8 ? n : (((n << 4) & 0x70) | nib());
      const color = () => {
        if (!cmap) { const q = p + (pos >> 1); const c = (pos & 1) ? (((b[q] << 4) | (b[q + 1] >> 4)) & 255) : b[q]; pos += 2; return c; }
        let v = nib();
        if (v >= 8) { v = num(v); if (v === 0x7f) { let w2 = nib(); w2 = w2 >= 8 ? num(w2) : w2; v = (v + w2) & 255; } }
        return cmap[v];
      };
      if (f.comp === 0) {
        for (let row = 0; row < f.h; row++) {
          const y = Y0 + row; if (y < 0 || y >= H) { p += f.w; continue; }
          for (let x = 0; x < f.w; x++) { const c = b[p++]; const xx = X0 + x; if (c !== 255 && xx >= 0 && xx < W) dst[y * W + xx] = pal32[c]; }
        }
        return;
      }
      for (let row = 0; row < f.h; row++) {
        const y = Y0 + row, inY = y >= 0 && y < H, base = y * W;
        let x = X0;
        for (;;) {
          const n0 = nib();
          if (n0) {
            const cnt = num(n0), c = color();
            if (c !== 255 && inY) { const px = pal32[c]; let a = x < 0 ? 0 : x, e = x + cnt > W ? W : x + cnt; for (; a < e; a++) dst[base + a] = px; }
            x += cnt;
          } else {
            const n1 = nib();
            if (n1 === 0) { p += (pos + 1) >> 1; pos = 0; break; }
            if (n1 === 1) return;
            if (n1 === 2) { x += 255; continue; }
            const cnt = num(n1);
            for (let k = 0; k < cnt; k++) { const c = color(); if (c !== 255 && inY && x >= 0 && x < W) dst[base + x] = pal32[c]; x++; }
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- Paleta
  class Pal {
    constructor(bytes) { // .rlect: 256 x BGR0
      this.base = new Uint8Array(768);
      for (let i = 0; i < 256; i++) { this.base[i * 3] = bytes[i * 4 + 2]; this.base[i * 3 + 1] = bytes[i * 4 + 1]; this.base[i * 3 + 2] = bytes[i * 4]; }
      this.cur = new Uint8Array(this.base); this.p32 = new Uint32Array(256); this.rebuild();
    }
    rebuild() { const c = this.cur; for (let i = 0; i < 256; i++) this.p32[i] = (255 << 24 | c[i * 3 + 2] << 16 | c[i * 3 + 1] << 8 | c[i * 3]) >>> 0; }
    set(i, r, g, b) { i &= 255; this.cur[i * 3] = r; this.cur[i * 3 + 1] = g; this.cur[i * 3 + 2] = b; this.rebuild(); }
    reset() { this.cur.set(this.base); this.rebuild(); }
    resetColor(i) { i &= 255; for (let k = 0; k < 3; k++) this.cur[i * 3 + k] = this.base[i * 3 + k]; this.rebuild(); }
    swap(a, b) { a &= 255; b &= 255; for (let k = 0; k < 3; k++) { const t = this.cur[a * 3 + k]; this.cur[a * 3 + k] = this.cur[b * 3 + k]; this.cur[b * 3 + k] = t; } this.rebuild(); }
    remap(a, b) { a &= 255; b &= 255; for (let k = 0; k < 3; k++) this.cur[a * 3 + k] = this.base[b * 3 + k]; this.rebuild(); }
  }

  // ---------------------------------------------------------------- Sonido (SoundManager por beats)
  class SoundMgr {
    constructor(ctx, out, res) {
      this.ctx = ctx; this.out = out; this.res = res; // res[id] = {buf, samples}
      this.ch = new Map(); this.events = []; this.seqn = 0; this.B = 4; this.L = 18345; this.t0 = ctx ? ctx.currentTime : 0;
      this.fakeT = 0; // reloj alternativo si no hay audio
    }
    now() { return this.ctx ? (this.ctx.currentTime - this.t0) * SR : this.fakeT; }
    setTimeSignature(B, L) { this.B = B || 4; this.L = L || 18345; this.t0 = this.ctx ? this.ctx.currentTime + 0.05 : 0; this.fakeT = 0; }
    beatState() {
      const T = Math.max(0, this.now()), L = this.L, B = this.B;
      const beat = Math.floor(T / L);
      return { T, bim: beat % B, nextBeat: (beat + 1) * L, nextMeasure: (Math.floor(T / (L * B)) + 1) * L * B };
    }
    when(timing) { const s = this.beatState(); return timing === 1 ? s.nextBeat : timing === 2 ? s.nextMeasure : 0; }
    offsetFor(mode, extraBeats) { const s = this.beatState(); return mode === 1 ? this.L : mode === 2 ? (((extraBeats || 0) + s.bim + 1) % this.B) * this.L : 0; }
    push(ev) { ev.seq = this.seqn++; this.events.push(ev); this.events.sort((a, b) => a.time - b.time || a.seq - b.seq); }
    play(id, loop, timing, offMode) { this.push({ type: 'start', id, loop: !!loop, time: this.when(timing), offset: this.offsetFor(offMode) }); }
    stop(id, timing) { this.push({ type: 'stop', id, time: this.when(timing) }); }
    transition(from, to, loop, mode, bridges) {
      if (this.isPlaying(to)) return;
      const s = this.beatState(); const remain = s.nextMeasure - s.T;
      let bid = -1, blen = 0;
      for (const b of bridges) { if (b < 0 || !this.res[b]) continue; const l = this.res[b].samples; if (l && l <= remain) { bid = b; blen = l; break; } }
      let off = 0;
      if (mode === 1) off = this.L; else if (mode === 2) off = ((Math.floor(blen / this.L) + s.bim + 1) % this.B) * this.L;
      if (bid >= 0) {
        const t = s.T + remain - blen;
        this.push({ type: 'stop', id: from, time: t }); this.push({ type: 'start', id: bid, loop: false, time: t, offset: 0 });
        this.push({ type: 'start', id: to, loop, time: t + blen, offset: off });
      } else { this.push({ type: 'stop', id: from, time: 0 }); this.push({ type: 'start', id: to, loop, time: 0, offset: off }); }
    }
    isPlaying(id) {
      const c = this.ch.get(id); if (!c) return false;
      if (!c.loop && this.now() >= c.end) { this.ch.delete(id); return false; }
      return true;
    }
    update(dtSamples) {
      if (!this.ctx) this.fakeT += dtSamples;
      const T = this.now();
      while (this.events.length && this.events[0].time <= T + SR * 0.03) {
        const ev = this.events.shift();
        if (ev.dead) continue;
        if (ev.type === 'start') {
          if (this.isPlaying(ev.id)) continue;
          for (const e of this.events) if (e.type === 'stop' && e.id === ev.id && e.seq < ev.seq) e.dead = true;
          this._start(ev, Math.max(ev.time, T));
        } else if (ev.type === 'stop') {
          const c = this.ch.get(ev.id); if (c) { this._kill(c, Math.max(ev.time, T)); this.ch.delete(ev.id); }
        }
      }
    }
    _start(ev, t) {
      const r = this.res[ev.id]; if (!r) return;
      const len = r.samples; let off = len ? ev.offset % len : 0;
      const c = { id: ev.id, loop: ev.loop, start: t, end: t + (len - off), src: null };
      if (this.ctx && r.buf) {
        const src = this.ctx.createBufferSource(); src.buffer = r.buf; src.loop = ev.loop;
        src.connect(this.out);
        try { src.start(this.t0 + t / SR, off / SR); } catch (e) { src.start(); }
        c.src = src;
      }
      this.ch.set(ev.id, c);
    }
    _kill(c, t) { if (c.src) { try { c.src.stop(this.t0 + t / SR); } catch (e) { try { c.src.stop(); } catch (e2) { } } } }
    stopAll() { for (const c of this.ch.values()) this._kill(c, this.now()); this.ch.clear(); this.events = []; }
  }

  // ---------------------------------------------------------------- Escena
  // man: manifest.json; assets: {paks:{name:Uint8Array}, bgs:[{px:Uint32Array, opaque}], snds:{resIdx:AudioBuffer}}
  class Scene {
    constructor(opts) {
      this.o = opts; const man = this.man = opts.man;
      const vm = this.vm = new G.ACT_VM(G.ACT_MEMIMG);
      this.mods = G.ACT_RECOMP;
      vm.load('engine', this.mods.engine);
      vm.load(man.module, this.mods[man.module]);
      vm._seed = (opts.seed || (Date.now() & 0x7fffffff)) >>> 0;
      this.player = opts.player; // estado compartido entre escenas (vidas, stateInt)
      // recursos
      this.res = man.resources.map((r, i) => {
        if (r.kind === 'rle') return { kind: 'rle', rle: new RLE(opts.assets.paks[r.pak], r.off) };
        if (r.kind === 'pal') return { kind: 'pal', pal: new Pal(b64(r.data)) };
        if (r.kind === 'snd') return { kind: 'snd', buf: opts.assets.snds[i] || null, samples: r.samples };
        return { kind: r.kind };
      });
      this.snd = new SoundMgr(opts.audio, opts.audioOut, this.res);
      this.frame = new Uint32Array(W * H);
      this.exited = false; this.exitStatus = -1; this.exitDetail = -1;
      this._installHLE();
      this._build();
    }
    _installHLE() {
      const vm = this.vm, S = this, hm = G.ACT_HLEMAP;
      const reg = (name, fn) => { const a = hm[name]; if (a) vm.registerHLE(a, fn); };
      // singletons falsos en memoria
      this.SM = vm.alloc(0x100); vm.S(this.SM + 0x40, W); vm.S(this.SM + 0x44, H);
      this.RM = vm.alloc(0x40); this.IM = vm.alloc(0x40); this.PS = vm.alloc(0x40); this.SNDM = vm.alloc(0x40);
      // vtable falsa para objetos Resource: entradas 0..15 -> trampolines
      this.RVT = vm.alloc(0x80); this.RTRAMP = 0x3ff000;
      for (let i = 0; i < 32; i++) vm.S(this.RVT + i * 4, (this.RTRAMP + i * 4) | 1);
      for (let i = 0; i < 32; i++) {
        const slot = i * 4;
        vm.registerHLE(this.RTRAMP + slot, (self) => {
          const id = S._resIdOf(self);
          if (slot === 0x8) return 1;          // exists/isValid
          if (slot === 0xc || slot === 0x10) return 0; // load / unload (precargado)
          if (slot === 0x14) { const r = S.res[id]; return r && r.samples ? r.samples * 4 : 0; } // getLength (bytes est.)
          if (slot === 0x18) return 1;
          return 0;
        });
      }
      this.RESBASE = vm.alloc(0x40 * this.man.resources.length + 0x40);
      this.man.resources.forEach((r, i) => {
        const a = this.RESBASE + i * 0x40; vm.S(a, this.RVT); vm.SB(a + 0x10, 1);
        vm.S(a + 0x18, 128); vm.S(a + 0x1c, r.kind === 'rle' ? r.frames : 0);
      });
      // --- ResourceManager
      reg('ResourceManager::getInstance()', () => this.RM);
      reg('ResourceManager::getResource(int)', (self, id) => id < 0 ? 0 : this.RESBASE + id * 0x40);
      // --- ScreenManager
      reg('ScreenManager::getInstance()', () => this.SM);
      reg('ScreenManager::setZBufferElementImage(unsigned int, int)', (s, e, img) => { const z = this.zget(e); if (z) { z.img = img; this.dirty = true; } });
      reg('ScreenManager::setZBufferElementFrame(unsigned int, int)', (s, e, f) => { const z = this.zget(e); if (z) { z.frame = f; this.dirty = true; } });
      reg('ScreenManager::setZBufferElementEnabled(unsigned int, bool)', (s, e, b) => { const z = this.zget(e); if (z) { z.en = !!(b & 255); this.dirty = true; } });
      reg('ScreenManager::getZBufferElementEnabled(unsigned int)', (s, e) => { const z = this.zget(e); return z && z.en ? 1 : 0; });
      reg('ScreenManager::setZBufferElementXOffset(unsigned int, int)', (s, e, v) => { const z = this.zget(e); if (z) { z.xo = v; this.dirty = true; } });
      reg('ScreenManager::setZBufferElementYOffset(unsigned int, int)', (s, e, v) => { const z = this.zget(e); if (z) { z.yo = v; this.dirty = true; } });
      reg('ScreenManager::getZBufferElementXOffset(unsigned int)', (s, e) => { const z = this.zget(e); return z ? z.xo : 0; });
      reg('ScreenManager::getZBufferElementYOffset(unsigned int)', (s, e) => { const z = this.zget(e); return z ? z.yo : 0; });
      reg('ScreenManager::markZBufferDirty(unsigned int)', () => { this.dirty = true; });
      reg('ScreenManager::changeZBufferOrder(unsigned int, int)', (s, e, w) => { const z = this.zget(e); if (z && z.w !== w) { z.w = w; this.zsort(); } });
      reg('ScreenManager::getZBufferWeight(unsigned int)', (s, e) => { const z = this.zget(e); return z ? z.w : -1; });
      reg('ScreenManager::getCurrentCharacterZBuffer()', (out) => {
        const list = this.zorder.filter(z => z.type === 2).map(z => z.ch);
        const p = this.ZVEC; list.forEach((c, i) => vm.S(p + 4 * i, c));
        vm.S(out, p); vm.S(out + 4, p + 4 * list.length); vm.S(out + 8, p + 4 * list.length); return out;
      });
      // --- SoundManager
      reg('SoundManager::getInstance()', () => this.SNDM);
      reg('SoundManager::playSound(int, bool, int, int)', (s, id, loop, timing) => { const off = vm.L(vm.SP); this.snd.play(id, loop & 255, timing, off); });
      reg('SoundManager::stopSound(int, int)', (s, id, timing) => { this.snd.stop(id, timing); });
      reg('SoundManager::isSoundPlaying(int) const', (s, id) => this.snd.isPlaying(id) ? 1 : 0);
      reg('SoundManager::setVolume(int, int, int)', () => 0);
      reg('SoundManager::transitionSound(int, int, bool, int, int, int, int, int, int)', (s, from, to, loop) => {
        const sp = vm.SP; const mode = vm.L(sp); const br = [vm.L(sp + 4), vm.L(sp + 8), vm.L(sp + 12), vm.L(sp + 16), vm.L(sp + 20)];
        this.snd.transition(from, to, !!(loop & 255), mode, br);
      });
      const chBeat = (id, kind) => { const c = this.snd.ch.get(id); if (!c) return -1; const pos = Math.max(0, this.snd.now() - c.start); const L = this.snd.L, B = this.snd.B; return kind === 0 ? Math.floor(pos / L) : kind === 1 ? Math.floor(pos / (L * B)) : Math.floor((pos % (L * B)) / L); };
      reg('SoundManager::getChannelCurrentBeat(int) const', (s, id) => chBeat(id, 0));
      reg('SoundManager::getChannelCurrentMeasure(int) const', (s, id) => chBeat(id, 1));
      reg('SoundManager::getChannelCurrentBeatInMeasure(int) const', (s, id) => chBeat(id, 2));
      // --- PlayerState
      reg('PlayerState::getInstance()', () => this.PS);
      reg('PlayerState::getLives()', () => this.player.lives);
      reg('PlayerState::getStateInt(unsigned int, int)', (s, k, d) => (k in this.player.state) ? this.player.state[k] : d);
      reg('PlayerState::setStateInt(unsigned int, int)', (s, k, v) => { this.player.state[k] = v; });
      reg('PlayerState::resetStateInt(unsigned int)', (s, k) => { delete this.player.state[k]; });
      // --- InputManager
      reg('InputManager::getInstance()', () => this.IM);
      reg('InputManager::getVirtualMouse()', () => 0);
      reg('InputManager::getActiveControlValue(bool)', () => this.control());
      reg('InputManager::setActiveControlValue(int, bool)', (s, v) => { if (this.o.onKnobSet) this.o.onKnobSet(v); });
      // --- Palette (this = objeto recurso de paleta)
      const P = (self) => { const r = this.res[this._resIdOf(self)]; return r && r.pal; };
      reg('Palette::setColor(int, int, int, int)', (self, i, r, g) => { const p = P(self); if (p) p.set(i, r & 255, g & 255, vm.L(vm.SP) & 255); this.dirty = true; });
      reg('Palette::getRedColor(int)', (self, i) => { const p = P(self); return p ? p.cur[(i & 255) * 3] : 0; });
      reg('Palette::getGreenColor(int)', (self, i) => { const p = P(self); return p ? p.cur[(i & 255) * 3 + 1] : 0; });
      reg('Palette::getBlueColor(int)', (self, i) => { const p = P(self); return p ? p.cur[(i & 255) * 3 + 2] : 0; });
      reg('Palette::swapColor(int, int)', (self, a, b) => { const p = P(self); if (p) p.swap(a, b); this.dirty = true; });
      reg('Palette::remapColor(int, int)', (self, a, b) => { const p = P(self); if (p) p.remap(a, b); this.dirty = true; });
      reg('Palette::reset()', (self) => { const p = P(self); if (p) p.reset(); this.dirty = true; });
      reg('Palette::resetColor(int)', (self, i) => { const p = P(self); if (p) p.resetColor(i); this.dirty = true; });
      // --- GameAdapter (no criticos)
      for (const n of Object.keys(hm)) if (n.startsWith('GameAdapter::print') || n.startsWith('GameAdapter::logEvent') || n.startsWith('GameAdapter::~')) reg(n, () => 0);
    }
    _resIdOf(addr) { return ((addr - this.RESBASE) / 0x40) | 0; }
    zget(id) { return this.zmap.get(id); }
    zsort() { this.zorder = [...this.zmap.values()].sort((a, b) => a.w - b.w || a.id - b.id); this.dirty = true; }
    control() { const vm = this.vm; return vm.L(this.GS + 0x3c); }
    setControl(v) { // como el knob fisico: GameSequence::setActiveControlValue(v, true)
      const vm = this.vm, mn = vm.L(this.GS + 0x24), mx = vm.L(this.GS + 0x28);
      v = Math.round(Math.max(mn, Math.min(mx, v)));
      vm.S(this.GS + 0x3c, v - mn);
    }
    range() { const vm = this.vm; return [vm.L(this.GS + 0x24), vm.L(this.GS + 0x28)]; }
    _build() {
      const vm = this.vm, man = this.man, gs = this.GS = man.game;
      const nch = vm.L(gs + 0x14), chp = vm.L(gs + 0x18), nbg = vm.L(gs + 4), bgp = vm.L(gs + 8);
      const nsnd = vm.L(gs + 0x1c);
      // --- objeto GameSequence
      const seq = this.SEQ = vm.alloc(0x500);
      vm.S(seq, G.ACT_CONST.VT_GAMESEQ); vm.S(seq + 4, 0);
      vm.S(seq + 0x18, gs);
      const ga = this.GA = vm.alloc(16); vm.S(ga, G.ACT_CONST.VT_ADAPTER); vm.S(ga + 4, seq); vm.S(seq + 0x24, ga);
      vm.S(seq + 0x2c, 0);
      // sonidos: 8 bytes {?, resId}
      const sarr = vm.alloc(8 * Math.max(1, nsnd));
      for (let i = 0; i < nsnd; i++) { vm.S(sarr + 8 * i, 0); vm.S(sarr + 8 * i + 4, man.sounds[i]); }
      vm.S(seq + 0x38, sarr);
      // fondos: 12 bytes {bgDef, resIdx, zElem}
      const barr = vm.alloc(12 * Math.max(1, nbg));
      for (let i = 0; i < nbg; i++) { vm.S(barr + 12 * i, bgp + 16 * i); vm.S(barr + 12 * i + 4, i); vm.S(barr + 12 * i + 8, -1); }
      vm.S(seq + 0x3c, barr);
      // estados de personaje (64 bytes)
      const cs = this.CS = vm.alloc(64 * nch); vm.u8.fill(0, cs, cs + 64 * nch);
      vm.S(seq + 0x40, cs);
      for (let c = 0; c < nch; c++) {
        const S = cs + 64 * c, cd = vm.L(chp + 4 * c), mc = man.chars[c];
        const nn = vm.L(cd + 0x10), np = vm.L(cd + 0x14), na = vm.L(cd + 0x18), ap = vm.L(cd + 0x1c);
        vm.S(S, cd);
        const narr = vm.alloc(8 * Math.max(1, nn));
        for (let i = 0; i < nn; i++) { vm.S(narr + 8 * i, np + 12 * i); vm.S(narr + 8 * i + 4, mc.nodes[i]); }
        const aarr = vm.alloc(20 * Math.max(1, na));
        for (let i = 0; i < na; i++) { const a = aarr + 20 * i; vm.S(a, ap + 28 * i); vm.S(a + 4, mc.arcs[i]); vm.S(a + 8, 0); vm.S(a + 12, 0); vm.SB(a + 16, 0); }
        vm.S(S + 4, narr); vm.S(S + 8, aarr);
        vm.S(S + 0x28, mc.pal); vm.SB(S + 0x2c, mc.fps ? 1 : 0); vm.S(S + 0x34, 0); vm.S(S + 0x38, 0); vm.SB(S + 0x3c, 0);
      }
      this.ZVEC = vm.alloc(4 * 64);
      // --- GameState runtime
      vm.S(gs + 0x5c, seq); vm.S(gs + 0x54, man.gpal);
      // input callback (UF_InputEventCallback) no se usa: dificultad via estado
      // initializeState
      vm.SP = 0x3f0000;
      const initFn = vm.L(gs + 0x38); if (initFn) vm.call(initFn, 0, 0, 0, 0);
      for (let c = 0; c < nch; c++) {
        const S = cs + 64 * c, cd = vm.L(S);
        vm.S(S + 0xc, vm.L(cd + 4)); vm.S(S + 0x14, -1); vm.S(S + 0x18, -1); vm.S(S + 0x10, -1);
        vm.S(S + 0x1c, 0); vm.S(S + 0x20, 0); vm.S(S + 0x24, 0);
      }
      vm.SB(gs + 0x40, 0); vm.S(gs + 0x44, -1); vm.S(gs + 0x58, -1); vm.S(gs + 0x50, this.o.startupParam || 0);
      vm.S(gs + 0x48, 0); vm.S(gs + 0x4c, 0);
      vm.call(G.ACT_CONST.SET_ACTIVE_CTL, seq, vm.L(gs + 0x2c), 1, 0);
      // dificultad del operador (UV_DIFFICULTY_LEVEL via callback de entrada: 1 facil, 2 medio, 3 dificil)
      if (this.o.inputCallback && this.o.difficultyEvent) vm.call(this.o.inputCallback, this.GA, this.o.difficultyEvent, 0, 0);
      // initializeZBuffer
      this.zmap = new Map(); let nextId = 1;
      const zl = vm.L(gs + 0x10), nz = vm.L(gs + 0xc);
      for (let i = 0; i < nz; i++) {
        const v = vm.L(zl + 4 * i) >>> 0;
        if ((v & 0xf0000000) === 0x10000000) {
          const bi = v & MASK, bd = bgp + 16 * bi;
          const z = { id: nextId++, type: 1, bg: bi, x: vm.L(bd + 4), y: vm.L(bd + 8), en: !!vm.L(bd + 12), img: -1, frame: -1, xo: 0, yo: 0 };
          z.w = z.id; this.zmap.set(z.id, z); vm.S(barr + 12 * bi + 8, z.id);
        } else if ((v & 0xf0000000) === 0) {
          const c = v & MASK, S = cs + 64 * c, cd = vm.L(S);
          const z = { id: nextId++, type: 2, ch: c, x: vm.L(cd + 8), y: vm.L(cd + 12), en: true, img: -1, frame: -1, xo: 0, yo: 0, pal: man.chars[c].pal };
          z.w = z.id; this.zmap.set(z.id, z); vm.S(S + 0x30, z.id);
          const node = vm.L(S + 0xc) & MASK; z.img = man.chars[c].nodes[node] !== undefined ? man.chars[c].nodes[node] : -1;
        }
      }
      vm.SB(seq + 0x44, 1);
      this.zsort();
      // start(): firma de tiempo musical
      const meas = vm.L(gs + 0x30) >>> 0, bpm = vm.L(gs + 0x34) >>> 0;
      this.snd.setTimeSignature(bpm, Math.floor(meas / (bpm || 1)));
      if (this.o.onKnobSet) this.o.onKnobSet(vm.L(gs + 0x3c));
      this.dirty = true;
    }
    // un tick logico (60 Hz)
    tick() {
      if (this.exited) return;
      const vm = this.vm;
      this.snd.update(SR / 60);
      vm.SP = 0x3f0000;
      vm.call(G.ACT_CONST.UPDATE_STATE, this.SEQ, this.GS, 0, 0);
      if (vm.LB(this.GS + 0x40)) {
        this.exited = true; this.exitStatus = vm.L(this.GS + 0x44); this.exitDetail = vm.L(this.GS + 0x58);
      }
    }
    // compone el cuadro en this.frame (ABGR)
    render() {
      const fb = this.frame, bgs = this.o.assets.bgs;
      let drewOpaque = false;
      for (const z of this.zorder) {
        if (!z.en) continue;
        if (z.type === 1) {
          const bg = bgs[z.bg]; if (!bg) continue;
          if (bg.opaque && z.x === 0 && z.y === 0) { fb.set(bg.px); drewOpaque = true; }
          else blitRGBA(fb, bg, z.x + z.xo, z.y + z.yo);
        } else {
          if (z.img < 0) continue;
          const r = this.res[z.img]; if (!r || !r.rle) continue;
          const pal = this.res[z.pal] && this.res[z.pal].pal;
          const fi = z.frame < 0 ? 0 : z.frame;
          r.rle.draw(fb, Math.min(fi, r.rle.n - 1), pal ? pal.p32 : GREY, z.x + z.xo, z.y + z.yo);
        }
      }
      if (!drewOpaque) { /* fondo ya limpiado por el llamador si hace falta */ }
      this.dirty = false;
      return fb;
    }
    destroy() { this.snd.stopAll(); }
  }
  const GREY = new Uint32Array(256).map((_, i) => (255 << 24 | i << 16 | i << 8 | i) >>> 0);
  function blitRGBA(fb, bg, ox, oy) {
    const px = bg.px, w = bg.w, h = bg.h;
    for (let y = 0; y < h; y++) {
      const yy = y + oy; if (yy < 0 || yy >= H) continue;
      for (let x = 0; x < w; x++) {
        const xx = x + ox; if (xx < 0 || xx >= W) continue;
        const s = px[y * w + x], a = s >>> 24; if (a === 0) continue;
        if (a === 255) { fb[yy * W + xx] = s; continue; }
        const d = fb[yy * W + xx], ia = 255 - a;
        const r = ((s & 255) * a + (d & 255) * ia) / 255, g = (((s >> 8) & 255) * a + ((d >> 8) & 255) * ia) / 255, b2 = (((s >> 16) & 255) * a + ((d >> 16) & 255) * ia) / 255;
        fb[yy * W + xx] = (255 << 24 | b2 << 16 | g << 8 | r) >>> 0;
      }
    }
  }
  function b64(s) { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }

  G.ACT_SCENE = { Scene, RLE, Pal, SoundMgr, W, H };
})(typeof window !== 'undefined' ? window : globalThis);
