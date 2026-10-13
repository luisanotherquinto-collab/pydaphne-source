/* ==========================================================================
 *  SINGE·JS — runtime de juegos Hypseus Singe sobre fengari (Lua en JS).
 *  Implementa la API Singe 1 + la parte usada comúnmente de la API Hypseus
 *  (singeproxy.cpp): disc*, overlay*, sprite*, sound*, font*, mouse*, etc.
 *
 *  host = { ldp, width, height, vfs, images, sounds, fonts, audioCtx, log,
 *           videoPixel(x,y) }  — lo arma la UI a partir de la carpeta del juego.
 * ========================================================================== */
'use strict';

const SINGE_PRELUDE = `
io = io or {}
io.write = io.write or function(...) local t={} for i,v in ipairs({...}) do t[i]=tostring(v) end debugPrint(table.concat(t)) end
os = os or {}
os.time = os.time or function() return math.floor(__now()/1000) end
os.clock = os.clock or function() return __now()/1000 end
os.date = os.date or function() return '' end
os.exit = function() singeQuit() end
os.remove = function() return true end
os.rename = function() return true end
unpack = unpack or table.unpack
table.getn = table.getn or function(t) return #t end
table.setn = table.setn or function() end
math.mod = math.mod or math.fmod
math.pow = math.pow or function(a,b) return a^b end
math.ldexp = math.ldexp or function(m,e) return m*2.0^e end
loadstring = loadstring or load
string.gfind = string.gfind or string.gmatch
getfenv = getfenv or function() return _G end
setfenv = setfenv or function(f) return f end
bit = bit or {
  band=function(a,...) a=math.floor(a) for _,b in ipairs({...}) do a=a & math.floor(b) end return a end,
  bor=function(a,...) a=math.floor(a) for _,b in ipairs({...}) do a=a | math.floor(b) end return a end,
  bxor=function(a,...) a=math.floor(a) for _,b in ipairs({...}) do a=a ~ math.floor(b) end return a end,
  bnot=function(a) return ~math.floor(a) end,
  lshift=function(a,n) return (math.floor(a) << n) & 0xFFFFFFFF end,
  rshift=function(a,n) return (math.floor(a) & 0xFFFFFFFF) >> n end,
  arshift=function(a,n) return math.floor(a) >> n end,
  tobit=function(a) return math.floor(a) end }
do
  local fmt = string.format
  string.format = function(f, ...)
    local a = table.pack(...)
    local i = 0
    for spec in tostring(f):gmatch("%%[-+ #0]*%d*%.?%d*([%a%%])") do
      if spec ~= "%" then
        i = i + 1
        if ("diouxXc"):find(spec, 1, true) and type(a[i]) == "number" then a[i] = math.floor(a[i]) end
      end
    end
    return fmt(f, table.unpack(a, 1, a.n))
  end
end
do
  local _r, _w = __vfs_read, __vfs_write
  io.open = function(p, mode)
    mode = mode or "r"
    if mode:find("w") or mode:find("a") then
      local buf = mode:find("a") and (_r(p) or "") or ""
      local f = {}
      function f:write(...) for _, s in ipairs({...}) do buf = buf .. tostring(s) end return self end
      function f:close() _w(p, buf) return true end
      function f:flush() _w(p, buf) end
      function f:seek() return #buf end
      function f:setvbuf() end
      return f
    end
    local s = _r(p)
    if not s then return nil, tostring(p) .. ": No such file or directory" end
    local pos, f = 1, {}
    function f:read(fm)
      fm = fm or "*l"
      if type(fm) == "number" then local r = s:sub(pos, pos + fm - 1) pos = pos + fm if r == "" then return nil end return r end
      fm = fm:gsub("^%*", "")
      local c = fm:sub(1, 1)
      if c == "a" then local r = s:sub(pos) pos = #s + 1 return r end
      if c == "n" then local a, b = s:find("^%s*[-+]?%d*%.?%d+", pos) if not a then return nil end local r = tonumber(s:sub(a, b)) pos = b + 1 return r end
      if pos > #s then return nil end
      local e = s:find("\\n", pos, true) local line
      if e then line = s:sub(pos, e - 1) pos = e + 1 else line = s:sub(pos) pos = #s + 1 end
      line = line:gsub("\\r$", "")
      if c == "L" then return line .. "\\n" end
      return line
    end
    function f:lines() return function() return f:read("*l") end end
    function f:close() return true end
    function f:seek(w, o) if w == "set" then pos = (o or 0) + 1 elseif w == "end" then pos = #s + 1 + (o or 0) end return pos - 1 end
    return f
  end
  io.lines = function(p) local f = io.open(p) if not f then error("cannot open " .. tostring(p)) end return f:lines() end
  dofile = function(p)
    local s = _r(p)
    if not s then error("cannot open " .. tostring(p)) end
    local fn, err = load(s, "@" .. tostring(p))
    if not fn then error(err) end
    return fn()
  end
  loadfile = function(p)
    local s = _r(p)
    if not s then return nil, "cannot open " .. tostring(p) end
    return load(s, "@" .. tostring(p))
  end
  if package then table.insert(package.searchers or package.loaders, 2, function(name)
    local p = name:gsub("%.", "/") .. ".lua"
    local s = _r(p)
    if s then return load(s, "@" .. p) end
    return "\\n\\tno singe file '" .. p .. "'"
  end) end
end
SWITCH_UP=0 SWITCH_LEFT=1 SWITCH_DOWN=2 SWITCH_RIGHT=3 SWITCH_START1=4 SWITCH_START2=5
SWITCH_BUTTON1=6 SWITCH_BUTTON2=7 SWITCH_BUTTON3=8 SWITCH_COIN1=9 SWITCH_COIN2=10
SWITCH_SKILL1=11 SWITCH_SKILL2=12 SWITCH_SKILL3=13 SWITCH_SERVICE=14 SWITCH_TEST=15
SWITCH_RESET=16 SWITCH_SCREENSHOT=17 SWITCH_QUIT=18 SWITCH_PAUSE=19 SWITCH_CONSOLE=20 SWITCH_TILT=21
`;

class SingeRuntime {
  constructor(host) {
    this.h = host; this.sprites = []; this.soundsLoaded = []; this.fontList = []; this.fontCur = -1;
    this.bg = [0, 0, 0, 0]; this.fg = [255, 255, 255, 255]; this.colorKey = true; this.fontQuality = 1;
    this.mouse = { x: 0, y: 0 }; this.mouseEnabled = true; this.paused = false; this.dead = false;
    this.voices = new Map(); this.voiceSeq = 0; this.keysDown = new Set(); this.lastDown = -1; this.lastUp = -1;
    this.overlayW = host.width; this.overlayH = host.height;
    this.cv = document.createElement('canvas'); this.cv.width = this.overlayW; this.cv.height = this.overlayH;
    this.cx = this.cv.getContext('2d', { willReadFrequently: false });
    this.gameName = 'singe';
  }
  fail(msg) { this.dead = true; this.h.log('SINGE: ' + msg); if (this.h.onError) this.h.onError(msg); }
  start(scriptPath) {
    const F = fengari, lua = F.lua, lx = F.lauxlib, ll = F.lualib, S = F.to_luastring;
    const L = lx.luaL_newstate(); ll.luaL_openlibs(L); this.L = L;
    const reg = (name, fn) => { lua.lua_pushcfunction(L, L2 => { try { return fn(L2) | 0; } catch (e) { this.h.log(name + ': ' + e.message); return 0; } }); lua.lua_setglobal(L, S(name)); };
    const num = i => lua.lua_tonumber(L, i), str = i => lua.lua_tojsstring(L, i), n = () => lua.lua_gettop(L);
    const isnum = i => lua.lua_type(L, i) === lua.LUA_TNUMBER, isstr = i => lua.lua_type(L, i) === lua.LUA_TSTRING;
    const pushN = v => { if (Number.isInteger(v)) lua.lua_pushinteger(L, v); else lua.lua_pushnumber(L, v); return 1; }, pushB = v => { lua.lua_pushboolean(L, !!v); return 1; };
    const pushS = v => { lua.lua_pushstring(L, S(String(v))); return 1; };
    const H = this.h, ldp = H.ldp, cx = this.cx;
    const vfsRead = p => { const s = H.vfs.read(p); return s; };
    reg('__vfs_read', () => { const s = vfsRead(str(1)); if (s === null || s === undefined) { lua.lua_pushnil(L); return 1; } return pushS(s); });
    reg('__now', () => pushN(performance.now()));
    reg('__vfs_write', () => { H.vfs.write(str(1), str(2)); return 0; });
    /* ---- colores / overlay ---- */
    const col = a => `rgba(${a[0]},${a[1]},${a[2]},${(a[3] === undefined ? 255 : a[3]) / 255})`;
    reg('colorBackground', () => { const k = n(); if (k >= 3) this.bg = [num(1), num(2), num(3), k >= 4 ? num(4) : 0]; return 0; });
    reg('colorForeground', () => { const k = n(); if (k >= 3) this.fg = [num(1), num(2), num(3), k >= 4 ? num(4) : 255]; return 0; });
    reg('overlayClear', () => { cx.save(); cx.globalCompositeOperation = 'copy'; cx.fillStyle = col(this.bg); cx.fillRect(0, 0, this.overlayW, this.overlayH); cx.restore(); return 0; });
    reg('overlayGetWidth', () => pushN(this.overlayW));
    reg('overlayGetHeight', () => pushN(this.overlayH));
    reg('overlaySetResolution', () => { this.resize(num(1), num(2)); return 0; });
    reg('setOverlayResolution', () => { this.resize(num(1), num(2)); return 0; });
    reg('setOverlaySize', () => 0); reg('setOverlayFullAlpha', () => 0); reg('setOverlayLinearScale', () => 0);
    reg('setOverlayOpacity', () => { this.cv.style && (this.cv.style.opacity = num(1) / 255); return 0; });
    reg('setOverlayOnTop', () => 0); reg('setOverlaySpriteBlend', () => 0); reg('overlaySetMonochrome', () => 0);
    reg('drawTransparent', () => { this.colorKey = lua.lua_toboolean(L, 1); return 0; });
    reg('overlayPrint', () => {
      if (n() < 3) return 0;
      let rgb = [255, 255, 255], outline = true;
      if (n() >= 4 && lua.lua_istable(L, 4)) {
        lua.lua_getfield(L, 4, S('color'));
        if (lua.lua_istable(L, -1)) { for (let i = 1; i <= 3; i++) { lua.lua_rawgeti(L, -1, i); rgb[i - 1] = lua.lua_tonumber(L, -1); lua.lua_pop(L, 1); } }
        lua.lua_pop(L, 1);
        lua.lua_getfield(L, 4, S('outline')); if (lua.lua_isboolean(L, -1)) outline = lua.lua_toboolean(L, -1); lua.lua_pop(L, 1);
      }
      const x = num(1), y = num(2), t = str(3);
      cx.font = '12px "DaphneTT", monospace'; cx.textBaseline = 'top';
      if (outline) { cx.fillStyle = '#3d3836'; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) cx.fillText(t, x + dx, y + dy); }
      cx.fillStyle = `rgb(${rgb})`; cx.fillText(t, x, y); return 0;
    });
    reg('overlayBanner', () => { this.banner = { t: str(1), until: performance.now() + 3000 }; return 0; });
    reg('overlayPlot', () => { cx.fillStyle = col(this.fg); cx.fillRect(num(1), num(2), 1, 1); return 0; });
    reg('overlayLine', () => { cx.strokeStyle = col(this.fg); cx.lineWidth = 1; cx.beginPath(); cx.moveTo(num(1) + .5, num(2) + .5); cx.lineTo(num(3) + .5, num(4) + .5); cx.stroke(); return 0; });
    reg('overlayBox', () => { cx.strokeStyle = col(this.fg); cx.strokeRect(num(1) + .5, num(2) + .5, num(3) - num(1), num(4) - num(2)); return 0; });
    reg('overlayCircle', () => { cx.strokeStyle = col(this.fg); cx.beginPath(); cx.arc(num(1), num(2), Math.abs(num(3)), 0, 7); cx.stroke(); return 0; });
    reg('overlayEllipse', () => { cx.strokeStyle = col(this.fg); cx.beginPath(); const x0 = num(1), y0 = num(2), x1 = num(3), y1 = num(4); cx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, 7); cx.stroke(); return 0; });
    /* ---- disco ---- */
    reg('discPlay', () => { ldp.play(); this.paused = false; return 0; });
    reg('discPause', () => { ldp.pause(); this.paused = true; return 0; });
    reg('discStop', () => { ldp.stop(); return 0; });
    reg('discSearch', () => { ldp.search(Math.round(num(1)), false); return 0; });
    reg('discSearchBlanking', () => { ldp.search(Math.round(num(1)), false); return 0; });
    reg('discSkipToFrame', () => { ldp.search(Math.round(num(1)), true); ldp.play(); return 0; });
    reg('discSkipForward', () => { ldp.skipForward(Math.round(num(1))); return 0; });
    reg('discSkipBackward', () => { ldp.skipBackward(Math.round(num(1))); return 0; });
    reg('discSkipBlanking', () => 0);
    reg('discStepForward', () => { ldp.stepForward(); return 0; });
    reg('discStepBackward', () => { ldp.stepBackward(); return 0; });
    reg('discPauseAtFrame', () => { ldp.pauseAt = Math.round(num(1)); return 0; });
    reg('discChangeSpeed', () => { ldp.changeSpeed(num(1) || 1, num(2) || 1); return 0; });
    reg('discSetFPS', () => { ldp.fps = num(1) || ldp.fps; return 0; });
    reg('discGetFrame', () => pushN(ldp.curFrame));
    reg('discGetState', () => pushN(ldp.status));
    reg('discGetWidth', () => pushN(H.width * 2)); reg('discGetHeight', () => pushN(H.height * 2));
    reg('discAudio', () => { const ch = num(1), on = lua.lua_toboolean(L, 2); if (ch === 1) ldp.audio1 = on; else if (ch === 2) ldp.audio2 = on; return 0; });
    reg('discAudioSuffix', () => pushB(false));
    reg('vldpGetWidth', () => pushN(H.width * 2)); reg('vldpGetHeight', () => pushN(H.height * 2));
    reg('vldpGetPixel', () => { const p = H.videoPixel ? H.videoPixel(num(1), num(2)) : [0, 0, 0]; lua.lua_pushnumber(L, p[0]); lua.lua_pushnumber(L, p[1]); lua.lua_pushnumber(L, p[2]); return 3; });
    reg('vldpGetYUVPixel', () => { const p = H.videoPixel ? H.videoPixel(num(1), num(2)) : [0, 0, 0]; const Y = .299 * p[0] + .587 * p[1] + .114 * p[2]; lua.lua_pushnumber(L, Y); lua.lua_pushnumber(L, 128); lua.lua_pushnumber(L, 128); return 3; });
    for (const f of ['vldpSetVerbose', 'vldpSetMonochrome', 'vldpSetLuma', 'vldpSetBlend', 'vldpFlash', 'vldpSetRotate', 'vldpSetScale', 'vldpFocusArea', 'vldpResetFocus', 'srtLoad', 'srtClear', 'srtEnable', 'srtPosition', 'takeScreenshot', 'singeScreenshot', 'singeWantsCrosshairs', 'joyMouseEnable', 'keyboardCatchQuit', 'keyboardSetMode', 'scoreBezelEnable', 'scoreBezelClear', 'scoreBezelCredits', 'scoreBezelTwinScoreOn', 'scoreBezelScore', 'scoreBezelLives', 'controllerDoRumble', 'controllerSetPadding', 'mouseSetCaptured', 'mouseSetMode', 'singeEnablePauseKey', 'singeDisablePauseKey', 'debugPrintf'])
      reg(f, () => 0);
    reg('vldpGetScale', () => pushN(100)); reg('vldpGetRotate', () => pushN(0));
    reg('scoreBezelGetState', () => pushB(false)); reg('mainBezelLoaded', () => pushB(false));
    reg('ratioGetX', () => pushN(1)); reg('ratioGetY', () => pushN(1)); reg('getFValue', () => pushN(ldp.fps));
    reg('rewriteStatus', () => pushB(false)); reg('getUserString', () => pushS('webplayer'));
    reg('hypseusGetWidth', () => pushN(H.width * 2)); reg('hypseusGetHeight', () => pushN(H.height * 2));
    reg('singeGetWidth', () => pushN(H.width * 2)); reg('singeGetHeight', () => pushN(H.height * 2));
    /* ---- sistema ---- */
    reg('debugPrint', () => { H.log(str(1)); return 0; });
    reg('singeVersion', () => pushN(2.0));
    reg('singeQuit', () => { this.dead = true; H.log('singeQuit()'); if (H.onQuit) H.onQuit(); return 0; });
    reg('singeGetPauseFlag', () => pushB(this.paused));
    reg('singeSetPauseFlag', () => { this.paused = lua.lua_toboolean(L, 1); return 0; });
    reg('singeSetGameName', () => { this.gameName = str(1); return 0; });
    reg('singeGetScriptPath', () => pushS(scriptPath));
    reg('singeGetDataPath', () => pushS(''));
    reg('keyboardGetMode', () => pushN(0));
    reg('keyboardIsDown', () => pushB(this.keysDown.has(num(1))));
    reg('keyboardGetLastDown', () => pushN(this.lastDown)); reg('keyboardGetLastUp', () => pushN(this.lastUp));
    reg('keyboardGetModifiers', () => pushN(0));
    /* ---- ratón / pistola ---- */
    reg('mouseEnable', () => { this.mouseEnabled = true; return 0; }); reg('mouseDisable', () => { this.mouseEnabled = false; return 0; });
    reg('mouseHowMany', () => pushN(1)); reg('mouseHowManyReal', () => pushN(1)); reg('mouseGetPadding', () => pushN(0));
    reg('mouseGetPosition', () => { lua.lua_pushnumber(L, this.mouse.x); lua.lua_pushnumber(L, this.mouse.y); return 2; });
    reg('controllerHowMany', () => pushN(0)); reg('controllerIsValid', () => pushB(false)); reg('controllerGetButton', () => pushB(false));
    reg('controllerGetAxis', () => pushN(0)); reg('controllerGetPadding', () => pushN(0));
    /* ---- sprites ---- */
    const sprite = id => { const s = this.sprites[id]; if (!s) throw new Error('sprite inválido ' + id); return s; };
    reg('spriteLoad', () => {
      const p = str(1), img = H.images.get(p);
      if (!img) { this.fail('No se pudo cargar el sprite: ' + p); return pushN(-1); }
      this.sprites.push({ img, keyed: null, w: img.width, h: img.height, frames: 1 }); return pushN(this.sprites.length - 1);
    });
    reg('spriteLoadFrames', () => {
      const frames = num(1), p = str(2), img = H.images.get(p);
      if (!img) { this.fail('No se pudo cargar el sprite: ' + p); return pushN(-1); }
      this.sprites.push({ img, keyed: null, w: img.width / frames | 0, h: img.height, frames }); return pushN(this.sprites.length - 1);
    });
    reg('spriteGetWidth', () => pushN(sprite(num(1)).w)); reg('spriteGetHeight', () => pushN(sprite(num(1)).h));
    reg('spriteFrameWidth', () => pushN(sprite(num(1)).w)); reg('spriteFrameHeight', () => pushN(sprite(num(1)).h));
    reg('spriteGetFrames', () => pushN(sprite(num(1)).frames > 1 ? sprite(num(1)).frames : 0));
    reg('spriteUnload', () => { this.sprites[num(1)] = null; return 0; });
    const src = s => { if (!this.colorKey) return s.img; if (!s.keyed) s.keyed = keyBlack(s.img); return s.keyed; };
    const drawSpr = (s, fr, x, y, w, h, center) => {
      if (center) { x -= w / 2; y -= h / 2; }
      cx.drawImage(src(s), fr * s.w, 0, s.w, s.h, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };
    reg('spriteDraw', () => {
      const k = n(); if (k < 3) return 0;
      const x = num(1), y = num(2);
      if (k === 3) { const s = sprite(num(3)); drawSpr(s, 0, x, y, s.w, s.h, false); }
      else if (k === 4) { const s = sprite(num(4)); drawSpr(s, 0, x, y, s.w, s.h, lua.lua_toboolean(L, 3)); }
      else if (k === 5) { const s = sprite(num(5)); drawSpr(s, 0, x, y, num(3) - x + 1, num(4) - y + 1, false); }
      else { const s = sprite(num(6)); drawSpr(s, 0, x, y, num(3) - x + 1, num(4) - y + 1, lua.lua_toboolean(L, 5)); }
      return 0;
    });
    reg('spriteDrawFrame', () => {
      const k = n(), s = sprite(num(k)), fr = num(k - 1), x = num(1), y = num(2);
      const sx = k >= 5 ? num(3) : 1, sy = k >= 6 ? num(4) : sx;
      drawSpr(s, fr % Math.max(1, s.frames), x, y, s.w * sx, s.h * sy, false); return 0;
    });
    reg('spriteDrawRotatedFrame', () => { const k = n(), s = sprite(num(k)); drawSpr(s, 0, num(1), num(2), s.w, s.h, false); return 0; });
    reg('spriteDrawGrid', () => { const s = sprite(num(3)); cx.drawImage(src(s), num(4), num(5), num(6), num(7), num(1), num(2), num(6), num(7)); return 0; });
    for (const f of ['spriteRotate', 'spriteScale', 'spriteRotateAndScale', 'spriteQuality', 'spriteBlend', 'spriteResetColorKey', 'spriteRotateFrame', 'spriteAnimLoop', 'spriteAnimPause', 'spriteAnimPlay', 'spriteAnimSetFrame'])
      reg(f, () => 0);
    reg('spriteAnimIsPlaying', () => pushB(false)); reg('spriteAnimGetFrame', () => pushN(0));
    /* ---- fuentes ---- */
    reg('fontLoad', () => {
      const p = str(1), pts = num(2), fam = H.fonts.get(p);
      if (!fam) { this.fail('No se pudo cargar la fuente: ' + p); return pushN(-1); }
      this.fontList.push({ fam, pts }); this.fontCur = this.fontList.length - 1; return pushN(this.fontCur);
    });
    reg('fontSelect', () => { const i = num(1); if (this.fontList[i]) this.fontCur = i; return 0; });
    reg('fontQuality', () => { this.fontQuality = num(1); return 0; });
    reg('fontUnload', () => 0);
    const fontCss = f => `${f.pts}px "${f.fam}"`;
    reg('fontPrint', () => {
      const f = this.fontList[this.fontCur]; if (!f) return 0;
      const t = str(3), x = num(1), y = num(2);
      cx.font = fontCss(f); cx.textBaseline = 'top';
      if (this.fontQuality === 2 && this.bg[3] !== 0) { const w = cx.measureText(t).width; cx.fillStyle = col([...this.bg.slice(0, 3), 255]); cx.fillRect(x, y, w, f.pts * 1.2); }
      cx.fillStyle = col(this.fg); cx.fillText(t, x, y); return 0;
    });
    reg('fontToSprite', () => {
      const f = this.fontList[this.fontCur]; if (!f) return pushN(-1);
      const t = str(1), c = document.createElement('canvas'), g = c.getContext('2d');
      g.font = fontCss(f); const w = Math.max(1, Math.ceil(g.measureText(t).width)), h = Math.ceil(f.pts * 1.25);
      c.width = w; c.height = h; g.font = fontCss(f); g.textBaseline = 'top'; g.fillStyle = col(this.fg); g.fillText(t, 0, 0);
      this.sprites.push({ img: c, keyed: c, w, h, frames: 1 }); return pushN(this.sprites.length - 1);
    });
    /* ---- sonido ---- */
    const AC = H.audioCtx;
    reg('soundLoad', () => {
      const p = str(1), buf = H.sounds.get(p);
      if (!buf) { H.log('sonido no encontrado: ' + p); this.soundsLoaded.push(null); return pushN(this.soundsLoaded.length - 1); }
      this.soundsLoaded.push(buf); return pushN(this.soundsLoaded.length - 1);
    });
    reg('soundLoadData', () => pushN(-1));
    reg('soundPlay', () => {
      const buf = this.soundsLoaded[num(1)]; if (!buf || !AC) return pushN(-1);
      const s = AC.createBufferSource(); s.buffer = buf; s.connect(H.sfxGain || AC.destination);
      const slot = this.voiceSeq++; this.voices.set(slot, { s, paused: false });
      s.onended = () => { if (this.voices.has(slot)) { this.voices.delete(slot); this.queueCb.push(slot); } };
      s.start(); return pushN(slot);
    });
    reg('soundStop', () => { const v = this.voices.get(num(1)); if (v) { this.voices.delete(num(1)); try { v.s.stop(); } catch (e) {} } return pushB(!!v); });
    reg('soundPause', () => pushB(false)); reg('soundResume', () => pushB(false));
    reg('soundIsPlaying', () => pushB(this.voices.has(num(1))));
    reg('soundFullStop', () => { for (const v of this.voices.values()) try { v.s.stop(); } catch (e) {} this.voices.clear(); return 0; });
    reg('soundSetVolume', () => { if (H.sfxGain) H.sfxGain.gain.value = num(1) / 63; return 0; });
    reg('soundGetVolume', () => pushN(H.sfxGain ? H.sfxGain.gain.value * 63 : 63));
    reg('soundUnload', () => 0);
    reg('videoSetVolume', () => { if (H.setDiscVolume) H.setDiscVolume(num(1) / 63); return 0; });
    reg('videoGetVolume', () => pushN(63));
    for (const f of ['musicLoad', 'musicPlay']) reg(f, () => pushN(-1));
    for (const f of ['musicPause', 'musicResume', 'musicStop', 'musicSetVolume', 'musicUnload']) reg(f, () => 0);
    reg('musicIsPlaying', () => pushB(false));
    this.queueCb = [];
    /* ---- arranque ---- */
    if (lx.luaL_dostring(L, S(SINGE_PRELUDE)) !== 0) { this.fail('prelude: ' + lua.lua_tojsstring(L, -1)); return false; }
    const code = H.vfs.read(scriptPath);
    if (code == null) { this.fail('No se encontró el script ' + scriptPath); return false; }
    if (lx.luaL_loadbuffer(L, S(code), null, S('@' + scriptPath)) !== 0 || lua.lua_pcall(L, 0, 0, 0) !== 0) {
      this.fail(lua.lua_tojsstring(L, -1)); return false;
    }
    return true;
  }
  resize(w, h) { this.overlayW = w | 0; this.overlayH = h | 0; this.cv.width = this.overlayW; this.cv.height = this.overlayH; }
  call(fn, args, nres) {
    if (this.dead) return null;
    const F = fengari, lua = F.lua, L = this.L;
    lua.lua_getglobal(L, F.to_luastring(fn));
    if (lua.lua_type(L, -1) !== lua.LUA_TFUNCTION) { lua.lua_pop(L, 1); return null; }
    for (const a of args || []) { if (Number.isInteger(a)) lua.lua_pushinteger(L, a); else lua.lua_pushnumber(L, a); }
    if (lua.lua_pcall(L, (args || []).length, nres || 0, 0) !== 0) { this.fail(fn + ': ' + lua.lua_tojsstring(L, -1)); lua.lua_pop(L, 1); return null; }
    let r = null; if (nres) { r = lua.lua_tonumber(L, -1); lua.lua_pop(L, nres); }
    return r;
  }
  frame() {
    if (this.dead) return;
    while (this.queueCb.length) this.call('onSoundCompleted', [this.queueCb.shift()]);
    if (this.h.ldp.pauseAt && this.h.ldp.curFrame >= this.h.ldp.pauseAt) { this.h.ldp.pause(); this.h.ldp.pauseAt = 0; }
    this.call('onOverlayUpdate', [], 1);
  }
  press(sw) { this.keysDown.add(sw); this.lastDown = sw; this.call('onInputPressed', [sw, 0]); }
  release(sw) { this.keysDown.delete(sw); this.lastUp = sw; this.call('onInputReleased', [sw, 0]); }
  mouseMove(x, y, dx, dy) { this.mouse.x = x; this.mouse.y = y; if (this.mouseEnabled) this.call('onMouseMoved', [x, y, dx, dy, 0]); }
  shutdown() { if (!this.dead) this.call('onShutdown', []); this.dead = true; for (const v of this.voices.values()) try { v.s.stop(); } catch (e) {} }
}

/* negro → transparente (color key 0x000000 de Singe) */
function keyBlack(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  try {
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) if (p[i] === 0 && p[i + 1] === 0 && p[i + 2] === 0) p[i + 3] = 0;
    g.putImageData(d, 0, 0);
  } catch (e) {}
  return c;
}
