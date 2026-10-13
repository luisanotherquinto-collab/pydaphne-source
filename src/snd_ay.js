/* ay.js - AY-3-8910 (General Instrument) para el PCB de sonido de
 * Laser Grand Prix.  Tres canales de tono + ruido compartido + envolvente.
 *
 * El divisor interno del AY es /16 para tono y ruido y /256 para la
 * envolvente, contando desde el reloj del chip.
 */


/* volumenes logaritmicos de 4 bits, normalizados a 0..1 */
const AY_VOL = new Float32Array([
  0.0000, 0.0100, 0.0145, 0.0211, 0.0294, 0.0409, 0.0567, 0.0787,
  0.1096, 0.1524, 0.2119, 0.2947, 0.4100, 0.5700, 0.7930, 1.0000
]);

/* las 16 formas de envolvente se reducen a 4 bits: continue/attack/alternate/hold */
function makeAY(clock, sampleRate) {
  const reg = new Uint8Array(16);
  const tone = new Int32Array(3);       /* contador */
  const out  = new Uint8Array(3);       /* estado de la onda cuadrada */
  let noiseCnt = 0, noiseRng = 1, noiseOut = 0;
  let envCnt = 0, envStep = 0, envVol = 0, envHold = 0, envAtt = 0, envAlt = 0, envCont = 0;
  let latch = 0;
  /* el AY avanza a clock/16; acumulador de punto fijo 16.16 */
  const stepsPerSample = Math.floor((clock / 16 / sampleRate) * 65536);
  let acc = 0;

  function envReset() {
    const shape = reg[13] & 0x0F;
    envCont = (shape >> 3) & 1;
    envAtt  = (shape >> 2) & 1;
    envAlt  = (shape >> 1) & 1;
    envHold = shape & 1;
    envStep = 0;
    envVol = envAtt ? 0 : 15;
    envCnt = 0;
  }

  function envTick() {
    if (envStep > 15) return;
    envStep++;
    if (envStep > 15) {
      if (!envCont) { envVol = 0; envStep = 99; return; }
      if (envHold) {
        if (envAlt) envVol = envAtt ? 0 : 15;
        else envVol = envAtt ? 15 : 0;
        envStep = 99;
        return;
      }
      envStep = 0;
      if (envAlt) envAtt ^= 1;
      envVol = envAtt ? 0 : 15;
      return;
    }
    envVol = envAtt ? envStep : 15 - envStep;
  }

  function tick() {
    for (let c = 0; c < 3; c++) {
      let p = (reg[c * 2] | ((reg[c * 2 + 1] & 0x0F) << 8));
      if (p < 1) p = 1;
      if (--tone[c] <= 0) { tone[c] = p; out[c] ^= 1; }
    }
    let np = reg[6] & 0x1F;
    if (np < 1) np = 1;
    if (--noiseCnt <= 0) {
      noiseCnt = np;
      /* LFSR de 17 bits, realimentacion en los bits 0 y 3 */
      noiseRng ^= (((noiseRng & 1) ^ ((noiseRng >> 3) & 1)) << 17);
      noiseRng >>= 1;
      noiseOut = noiseRng & 1;
    }
    let ep = (reg[11] | (reg[12] << 8));
    if (ep < 1) ep = 1;
    envCnt += 1;
    if (envCnt >= ep * 16) { envCnt = 0; envTick(); }
  }

  function sample() {
    acc += stepsPerSample;
    while (acc >= 65536) { acc -= 65536; tick(); }
    const mix = reg[7];
    let s = 0;
    for (let c = 0; c < 3; c++) {
      const tOn = ((mix >> c) & 1) === 0;
      const nOn = ((mix >> (c + 3)) & 1) === 0;
      const lvl = (tOn ? out[c] : 1) & (nOn ? noiseOut : 1);
      if (!lvl) continue;
      const v = reg[8 + c];
      s += AY_VOL[(v & 0x10) ? envVol : (v & 0x0F)];
    }
    return s / 3;
  }

  return {
    /* el bus lo expone como par (direccion, dato) en dos posiciones */
    writeAddr(v) { latch = v & 0x0F; },
    writeData(v) {
      reg[latch] = v & 0xFF;
      if (latch === 13) envReset();
    },
    sample,
    reg
  };
}



