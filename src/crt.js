/* ==========================================================================
 *  CRT NTSC — post-proceso WebGL del televisor.
 *  Compone el disco (textura del <video>) y el overlay del juego con "sprite
 *  blending" (los bordes de los sprites/textos se funden con el video como en
 *  un genlock analógico, con un halo leve), luego simula la señal NTSC
 *  compuesta (YIQ: crominancia con ancho de banda reducido, cross-color en
 *  los bordes de alta frecuencia que se arrastra cuadro a cuadro) y el tubo:
 *  curvatura, líneas de barrido, máscara de apertura, bloom y viñeta.
 * ========================================================================== */
'use strict';
const CRTFX = (() => {
  let gl = null, cv = null, prog = null, texV = null, texO = null, loc = {}, ok = false, frame = 0, videoErr = false, vidTex = false;
  const VS = `attribute vec2 p; varying vec2 uv; void main(){ uv = p * 0.5 + 0.5; uv.y = 1.0 - uv.y; gl_Position = vec4(p, 0.0, 1.0); }`;
  const FS = `
precision mediump float;
varying vec2 uv;
uniform sampler2D tV, tO;
uniform float hasV, ovW, ovH, time, curv, scan, mask, ntsc, blend;
uniform vec2 res;
vec3 toYIQ(vec3 c){ return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(0.596, -0.274, -0.322)), dot(c, vec3(0.211, -0.523, 0.312))); }
vec3 toRGB(vec3 y){ return vec3(y.x + 0.956 * y.y + 0.621 * y.z, y.x - 0.272 * y.y - 0.647 * y.z, y.x - 1.106 * y.y + 1.703 * y.z); }
vec4 ov(vec2 c){ return texture2D(tO, c); }
/* composición disco + overlay con bordes suavizados (sprite blending) */
vec3 comp(vec2 c){
  vec3 base = hasV > 0.5 ? texture2D(tV, c).rgb : vec3(0.0);
  float px = 1.0 / ovW;
  vec4 o0 = ov(c), oL = ov(c - vec2(px * 0.75, 0.0)), oR = ov(c + vec2(px * 0.75, 0.0));
  float a = mix(o0.a, (o0.a * 2.0 + oL.a + oR.a) * 0.25, blend);
  vec3 col = (o0.rgb * o0.a * 2.0 + oL.rgb * oL.a + oR.rgb * oR.a) / max(1e-4, o0.a * 2.0 + oL.a + oR.a);
  vec3 outc = mix(base, col, clamp(a, 0.0, 1.0));
  /* halo: un poco de luz de los sprites se derrama sobre el video */
  vec4 g = (ov(c + vec2(px * 2.0, 0.0)) + ov(c - vec2(px * 2.0, 0.0)) + ov(c + vec2(0.0, 1.5 / ovH)) + ov(c - vec2(0.0, 1.5 / ovH))) * 0.25;
  outc += g.rgb * g.a * 0.18 * blend;
  return outc;
}
vec3 compLite(vec2 c){ vec3 base = hasV > 0.5 ? texture2D(tV, c).rgb : vec3(0.0); vec4 o = ov(c); return mix(base, o.rgb, o.a); }
void main(){
  /* curvatura del tubo */
  vec2 c = uv * 2.0 - 1.0;
  c *= 1.0 + curv * dot(c.yx, c.yx) * vec2(0.045, 0.06);
  vec2 t = c * 0.5 + 0.5;
  if (t.x < 0.0 || t.x > 1.0 || t.y < 0.0 || t.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  /* señal NTSC: luma casi completa, crominancia borrosa en horizontal */
  float dx = 1.0 / ovW;
  vec3 y0 = toYIQ(comp(t));
  vec3 acc = y0 * 0.30; float wsum = 0.30;
  for (int i = 1; i <= 2; i++) { float fi = float(i); float w = exp(-fi * fi / 3.0);
    acc += (toYIQ(compLite(t + vec2(fi * dx * 1.4, 0.0))) + toYIQ(compLite(t - vec2(fi * dx * 1.4, 0.0)))) * w; wsum += 2.0 * w; }
  vec3 blur = acc / wsum;
  vec3 yiq = vec3(mix(y0.x, blur.x, 0.12 * ntsc), mix(y0.yz, blur.yz, ntsc));
  /* cross-color: los bordes finos de luma generan franjas de color que se arrastran */
  float edge = abs(y0.x - toYIQ(compLite(t + vec2(dx, 0.0))).x);
  float ph = (t.x * ovW * 3.14159 * 0.5) + (t.y * ovH * 3.14159 * 0.5) + time * 3.14159;
  yiq.yz += vec2(cos(ph), sin(ph)) * edge * 0.18 * ntsc;
  vec3 col = clamp(toRGB(yiq), 0.0, 1.0);
  /* líneas de barrido según las líneas del juego */
  float lines = max(240.0, ovH);
  float sl = 0.5 + 0.5 * cos(t.y * lines * 6.28318);
  col *= mix(1.0, 0.62 + 0.38 * sl, scan) * (1.0 + 0.12 * scan);
  /* máscara de apertura (tríadas RGB) */
  float mx = mod(gl_FragCoord.x, 3.0);
  vec3 m = mx < 1.0 ? vec3(1.0, 0.7, 0.7) : mx < 2.0 ? vec3(0.7, 1.0, 0.7) : vec3(0.7, 0.7, 1.0);
  col *= mix(vec3(1.0), m, mask) * (1.0 + 0.18 * mask);
  /* viñeta y esquinas redondeadas */
  float vig = smoothstep(1.25, 0.55, length(c * vec2(0.92, 1.0)));
  vec2 q = abs(c); float corner = smoothstep(0.0, 0.035, 1.0 - max(q.x, q.y) + 0.0);
  gl_FragColor = vec4(min(vec3(1.0), col * 1.22) * mix(1.0, vig, 0.5) * corner, 1.0);
}`;
  function init(host) {
    if (cv) return ok;
    cv = document.createElement('canvas'); cv.id = 'crtgl';
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:4;display:none';
    host.appendChild(cv);
    gl = cv.getContext('webgl', { premultipliedAlpha: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) return (ok = false);
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(o)); return null; } return o; };
    const v = sh(gl.VERTEX_SHADER, VS), f = sh(gl.FRAGMENT_SHADER, FS); if (!v || !f) return (ok = false);
    prog = gl.createProgram(); gl.attachShader(prog, v); gl.attachShader(prog, f); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return (ok = false);
    gl.useProgram(prog);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pl = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(pl); gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['tV', 'tO', 'hasV', 'ovW', 'ovH', 'time', 'curv', 'scan', 'mask', 'ntsc', 'blend', 'res']) loc[n] = gl.getUniformLocation(prog, n);
    const mk = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); return t; };
    texV = mk(); texO = mk();
    gl.uniform1i(loc.tV, 0); gl.uniform1i(loc.tO, 1);
    return (ok = true);
  }
  /* video: <video> con cuadros (o null); ovc: canvas del overlay; vidVisible: el disco se ve ahora */
  function render(video, ovc, vidVisible, opts) {
    if (!ok) return false;
    const r = cv.getBoundingClientRect(), dpr = Math.min(1.5, window.devicePixelRatio || 1), k = Math.min(1, 1440 / Math.max(1, r.width * dpr));
    const w = Math.max(2, Math.round(r.width * dpr * k)), h = Math.max(2, Math.round(r.height * dpr * k));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.viewport(0, 0, w, h);
    let hasV = 0;
    if (video && vidVisible && !videoErr) {
      /* mientras el decodificador busca (readyState < 2) se reutiliza el último cuadro */
      if (video.readyState >= 2) {
        try { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texV); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video); vidTex = true; }
        catch (e) { videoErr = true; }        /* video de otro dominio sin CORS: no se puede leer */
      }
      hasV = vidTex ? 1 : 0;
    } else if (!vidVisible) vidTex = vidTex && !!video;
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texO); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ovc);
    gl.uniform1f(loc.hasV, hasV); gl.uniform1f(loc.ovW, ovc.width); gl.uniform1f(loc.ovH, ovc.height); gl.uniform1f(loc.time, (frame++ & 1));
    gl.uniform1f(loc.curv, opts.curv); gl.uniform1f(loc.scan, opts.scan); gl.uniform1f(loc.mask, opts.mask); gl.uniform1f(loc.ntsc, opts.ntsc); gl.uniform1f(loc.blend, opts.blend);
    gl.uniform2f(loc.res, w, h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }
  return { init, render, show(on) { if (cv) cv.style.display = on ? 'block' : 'none'; }, get videoBlocked() { return videoErr; }, resetVideo() { videoErr = false; vidTex = false; } };
})();
