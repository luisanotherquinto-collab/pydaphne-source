'use strict';

function RRCORE(__ROMS) {
  const __dummy = () => { const o = { textContent: '', innerHTML: '', style: {}, value: '', checked: false, width: 336, height: 240, onclick: null, onchange: null,
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } }, appendChild() {}, prepend() {}, remove() {}, addEventListener() {}, childNodes: [], lastChild: null,
    getContext() { return { putImageData() {}, createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; }, fillRect() {}, drawImage() {} }; } }; return o; };
  const document = { getElementById: () => __dummy(), createElement: () => __dummy(), addEventListener() {} };
  const window = { addEventListener() {}, removeEventListener() {}, AudioContext: globalThis.AudioContext, webkitAudioContext: globalThis.webkitAudioContext };

function un(b){const s=atob(b);const a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return a;}
const R=__ROMS;
// ============================================================
//  rr6502.js — nucleo 6502 + hardware del prototipo laserdisc
//  de Road Runner (Atari 1985).  Mapa de I/O deducido de las ROM
//  y contrastado con el driver firefox.cpp de MAME (misma placa
//  "standard video disk hardware", mismo reproductor 22VP931).
// ============================================================

// ============================================================
//  rr6502.js — nucleo 6502 + hardware del prototipo laserdisc
//  de Road Runner (Atari 1985).  Mapa de I/O deducido de las ROM
//  y contrastado con el driver firefox.cpp de MAME (misma placa
//  "standard video disk hardware", mismo reproductor 22VP931).
// ============================================================

// ============================================================
//  rr6502.js — nucleo 6502 + hardware del prototipo laserdisc
//  de Road Runner (Atari 1985).  Mapa de I/O deducido de las ROM
//  y contrastado con el driver firefox.cpp de MAME (misma placa
//  "standard video disk hardware", mismo reproductor 22VP931).
// ============================================================

// ============================================================
//  rr6502.js — nucleo 6502 + hardware del prototipo laserdisc
//  de Road Runner (Atari 1985).  Mapa de I/O deducido de las ROM
//  y contrastado con el driver firefox.cpp de MAME (misma placa
//  "standard video disk hardware", mismo reproductor 22VP931).
// ============================================================

// ============================================================
//  rr6502.js — nucleo 6502 + hardware del prototipo laserdisc
//  de Road Runner (Atari 1985).  Mapa de I/O deducido de las ROM
//  y contrastado con el driver firefox.cpp de MAME (misma placa
//  "standard video disk hardware", mismo reproductor 22VP931).
// ============================================================

function RR(roms) {
  const M = new Uint8Array(0x10000);
  M.set(roms.main1, 0x4000);
  M.set(roms.main2, 0x8000);
  M.set(roms.main3, 0xC000);
  // BRK = muerte por checksum de NOVRAM; se enruta a un RTI
  M[0xEC00] = 0x40; M[0xFFFE] = 0x00; M[0xFFFF] = 0xEC;
  M[0xD643] = 0xEA; M[0xD66B] = 0xEA;
  // el lazo de watchdog $B780 cuelga la CPU si el bucle principal
  // se atrasa; el temporizado del harness no es el de la placa
  M[0xB77E] = 0xEA; M[0xB77F] = 0xEA; M[0xB780] = 0xEA; M[0xB781] = 0xEA;

  const st = {
    a: 0, x: 0, y: 0, sp: 0xFF, pc: 0, p: 0x24, cyc: 0,
    field: 0, outIdx: 0, joy: 0x80, sw: 0x00,
    latch: [0,0,0,0,0,0,0,0],
    sound: 1, snd: {kick:0, done:0}, b4: 1, sndQueue: [], nmiOn: 0, slow: 0,
    adcX: 0x80, adcY: 0x80, adcChan: 0, adcPhase: 0,
    disc: { frame: 1, pend: 0, dir: 1, seek: 0, dest: 0, cmd: [], packet: [0xF0,0,1,0,0,0] },
    log: [], M
  };

  const C=1,Z=2,I=4,D=8,B=16,V=64,N=128;

  function bcdTo(v){return (v>>4)*10+(v&15);}
  function toBcd(v){return ((((v/10)|0)%10)<<4)|(v%10);}

  function packet(){
    const f=st.disc.frame, hi=(f/10000)|0;
    return [0xF0|(hi&7), toBcd(((f/100)|0)%100), toBcd(f%100), 0, 0, 0];
  }

  function discCmd(b){
    const c=st.disc; c.cmd.push(b);
    if(c.cmd.length<3) return;
    const [c0,c1,c2]=c.cmd; c.cmd=[];
    if(c0===0&&c1===0&&c2===0){
      // STOP. $BA81 lo emite cuando no hay objetivo ($19 negativo), cuando la
      // diferencia es cero, o mientras hay una busqueda en curso ($2B). No es
      // un "no hacer nada": para el brazo.
      c.pend=0;
      if(st.log[st.log.length-1] && st.log[st.log.length-1].t==='STOP'){} 
      else st.log.push({f:st.field,t:'STOP',v:0});
      if(st.log.length>400) st.log.shift();
      return;
    }
    if((c0&0xF0)===0xF0){
      const d=(c0&7)*10000+bcdTo(c1)*100+bcdTo(c2);
      // si ya esta buscando algo casi igual, solo se corrige el destino: si no,
      // el juego reordena la busqueda cada 4 campos y el brazo nunca llega
      if(!(c.seek && Math.abs(d-c.dest)<200)) c.seek=6;
      c.dest=d;
      st.log.push({f:st.field,t:'SEARCH',v:c.dest});
    } else if(c0===0&&((c1&0xF0)===0xE0||(c1&0xF0)===0xF0)){
      const dir=((c1&0xF0)===0xE0)?1:-1;
      const n=(c1&15)*100+bcdTo(c2);
      // Un paso de uno o dos frames NO es un salto: es la reproduccion normal.
      // El brazo sigue leyendo y avanza un frame cada dos campos. Tratarlo como
      // salto instantaneo hace que el servo pida el mismo paso una y otra vez y
      // la imagen se queda trabada. De tres frames para arriba si es un salto
      // de pista, y ahi el 22VP931 lo hace de una.
      if(n<=2){ c.pend=n; c.dir=dir; }
      else { c.frame+=dir*n; c.pend=0; c.dir=dir; }
      st.log.push({f:st.field,t:dir>0?'FWD':'REV',v:n,salto:n>2});
    }
    if(c.frame<1)c.frame=1; if(c.frame>53999)c.frame=53999;
    if(st.log.length>400) st.log.shift();
  }

  function discField(){
    const c=st.disc;
    if(c.seek){ if(--c.seek===0){ c.frame=c.dest; c.pend=0; } }
    else if(c.pend>0 && (st.field&1)){
      c.frame+=c.dir; c.pend--;
      if(c.frame<1)c.frame=1; if(c.frame>53999)c.frame=53999;
    }
    c.packet=packet();
  }

  const CY_FIELD=25000;
  function rd(a){
    a&=0xFFFF;
    // El 6502 de sonido publica su auto-test en $0900-$0905. El stub lo
    // contesta solo cuando el programa principal lo lee ($E4D8-$E505), para
    // no pisarle el test de RAM de $0800-$0FFF.
    // el 6502 de sonido publica su auto-test aca; lo contesta la placa de
    // sonido emulada en cuanto el programa principal lo lee ($E4D8-$E508)
    if(a>=0x0900&&a<=0x0905&&st.pc>=0xE4D8&&st.pc<=0xE508&&st.sound)
      return a===0x0900?0xFF:0x00;
    if(a>=0x1F00&&a<=0x1FFF){
      if(a===0x1F00){
        // b7 hay byte del disco, b6 el reproductor acepta comando,
        // b5 DISKOPR activo en bajo, b0 VBLANK
        let v=0x40;
        if(st.outIdx<6) v|=0x80;
        if(st.sound) v|=0x08;                    // b3: procesador de sonido presente
        if(st.b4)    v|=0x10;                    // b4: probando
        if((st.cyc%CY_FIELD)<(CY_FIELD>>3)) v|=0x01;
        return v;
      }
      if(a===0x1F20) return st.sw;
      if(a===0x1F80) return (st.adcChan?st.adcY:st.adcX)^0xFF;  // ADC0809
      if(a===0x1FE0){
        if(st.outIdx<6) return st.disc.packet[st.outIdx++];
        return 0xFF;
      }
      return 0xFF;
    }
    return M[a];
  }
  function wr(a,v){
    a&=0xFFFF; v&=0xFF;
    // El 6502 de sonido publica su auto-test en $0900-$0905. El stub lo
    // contesta solo cuando el programa principal lo lee ($E4D8-$E505), para
    // no pisarle el test de RAM de $0800-$0FFF.
    if(a>=0x1F00&&a<=0x1FFF){
      if(a===0x1FE0){
        // La NMI del reproductor queda habilitada desde el primer comando que
        // le manda el juego. Antes de eso tiene que estar callada: el auto-test
        // prueba la pagina cero y la NMI escribe en $22-$2A.
        st.nmiOn=1; discCmd(v); return;
      }
      if(a===0x1F02){ st.snd.kick=1; }           // strobe hacia el 6502 de sonido
      if(a===0x1F06){ st.slow=(v&0x80)?1:0; }    // linea de velocidad lenta ($29)
      if(a>=0x1F80&&a<=0x1F83){ st.adcChan=(a&2)?1:0; }   // ADCSTART: elige canal
      return;
      // LS259 en $1F00-$1F0E (como latch0 de firefox.cpp): el bit es (a>>1)&7
      // y el dato es d7. El bit de $1F08 habilita la NMI del reproductor:
      // al arrancar esta en 0, por eso el auto-test corre sin que el disco
      // le pise la pagina cero.
      if(a<=0x1F0E && !(a&1)) st.latch[(a>>1)&7]=(v>>7)&1;
      return;
    }
    // $4000-$4FFF es la RAM de scrolling (playfield), no ROM: la ROM fija
    // empieza en $5000 y son 44K, justo los que dice SPEC.TXT
    if(a>=0x5000) return;
    M[a]=v;
    if(a===0x0801) st.sndQueue.push(v);   // codigo para el 6502 de sonido
  }

  const rdw=a=>rd(a)|(rd((a+1)&0xFFFF)<<8);
  const push=v=>{M[0x100+st.sp]=v&0xFF; st.sp=(st.sp-1)&0xFF;};
  const pop=()=>{st.sp=(st.sp+1)&0xFF; return M[0x100+st.sp];};
  const setNZ=v=>{st.p=(st.p&~(N|Z))|(v&0x80)|(v===0?Z:0); return v;};

  function irq(vec){
    push(st.pc>>8); push(st.pc&0xFF); push(st.p&~B);
    st.p|=I; st.pc=vec;
  }

  // ------------------------------------------------------------
  // direccionamientos
  function aIMM(){return st.pc++;}
  function aZP(){return rd(st.pc++);}
  function aZPX(){return (rd(st.pc++)+st.x)&0xFF;}
  function aZPY(){return (rd(st.pc++)+st.y)&0xFF;}
  function aABS(){const a=rdw(st.pc); st.pc+=2; return a;}
  function aABX(){const a=rdw(st.pc); st.pc+=2; return (a+st.x)&0xFFFF;}
  function aABY(){const a=rdw(st.pc); st.pc+=2; return (a+st.y)&0xFFFF;}
  function aIZX(){const z=(rd(st.pc++)+st.x)&0xFF; return rd(z)|(rd((z+1)&0xFF)<<8);}
  function aIZY(){const z=rd(st.pc++); return ((rd(z)|(rd((z+1)&0xFF)<<8))+st.y)&0xFFFF;}
  function branch(c){const o=rd(st.pc++); if(c){st.pc=(st.pc+(o<128?o:o-256))&0xFFFF; st.cyc++;}}

  function adc(v){
    if(st.p&D){
      let lo=(st.a&15)+(v&15)+(st.p&C?1:0);
      let hi=(st.a>>4)+(v>>4);
      if(lo>9){lo-=10;hi++;}
      let r=(hi<<4)|(lo&15);
      st.p=(st.p&~C)|(hi>9?C:0);
      if(hi>9) r=(r+0x60)&0xFF;
      st.a=r&0xFF; setNZ(st.a);
    } else {
      const r=st.a+v+(st.p&C?1:0);
      st.p=(st.p&~(C|V))|(r>0xFF?C:0)|((~(st.a^v)&(st.a^r)&0x80)?V:0);
      st.a=r&0xFF; setNZ(st.a);
    }
  }
  function sbc(v){
    if(st.p&D){
      let lo=(st.a&15)-(v&15)-(st.p&C?0:1);
      let hi=(st.a>>4)-(v>>4);
      if(lo&0x10){lo-=6;hi--;}
      if(hi&0x10) hi-=6;
      const bin=st.a-v-(st.p&C?0:1);
      st.p=(st.p&~(C|V))|(bin>=0?C:0)|(((st.a^v)&(st.a^bin)&0x80)?V:0);
      st.a=((hi<<4)|(lo&15))&0xFF; setNZ(st.a);
    } else {
      const r=st.a-v-(st.p&C?0:1);
      st.p=(st.p&~(C|V))|(r>=0?C:0)|(((st.a^v)&(st.a^r)&0x80)?V:0);
      st.a=r&0xFF; setNZ(st.a);
    }
  }
  function cmp(r,v){const d=r-v; st.p=(st.p&~(C|N|Z))|(d>=0?C:0)|(d&0xFF?0:Z)|(d&0x80);}
  function asl(a){const v=a<0?st.a:rd(a); st.p=(st.p&~C)|((v>>7)&1); const r=setNZ((v<<1)&0xFF); a<0?st.a=r:wr(a,r);}
  function lsr(a){const v=a<0?st.a:rd(a); st.p=(st.p&~C)|(v&1); const r=setNZ(v>>1); a<0?st.a=r:wr(a,r);}
  function rol(a){const v=a<0?st.a:rd(a); const c=st.p&C; st.p=(st.p&~C)|((v>>7)&1); const r=setNZ(((v<<1)|(c?1:0))&0xFF); a<0?st.a=r:wr(a,r);}
  function ror(a){const v=a<0?st.a:rd(a); const c=st.p&C; st.p=(st.p&~C)|(v&1); const r=setNZ((v>>1)|(c?0x80:0)); a<0?st.a=r:wr(a,r);}

  function step(){
    const op=rd(st.pc++); let a;
    st.cyc+=3;
    switch(op){
      case 0xA9: st.a=setNZ(rd(aIMM())); break;
      case 0xA5: st.a=setNZ(rd(aZP())); break;
      case 0xB5: st.a=setNZ(rd(aZPX())); break;
      case 0xAD: st.a=setNZ(rd(aABS())); break;
      case 0xBD: st.a=setNZ(rd(aABX())); break;
      case 0xB9: st.a=setNZ(rd(aABY())); break;
      case 0xA1: st.a=setNZ(rd(aIZX())); break;
      case 0xB1: st.a=setNZ(rd(aIZY())); break;
      case 0xA2: st.x=setNZ(rd(aIMM())); break;
      case 0xA6: st.x=setNZ(rd(aZP())); break;
      case 0xB6: st.x=setNZ(rd(aZPY())); break;
      case 0xAE: st.x=setNZ(rd(aABS())); break;
      case 0xBE: st.x=setNZ(rd(aABY())); break;
      case 0xA0: st.y=setNZ(rd(aIMM())); break;
      case 0xA4: st.y=setNZ(rd(aZP())); break;
      case 0xB4: st.y=setNZ(rd(aZPX())); break;
      case 0xAC: st.y=setNZ(rd(aABS())); break;
      case 0xBC: st.y=setNZ(rd(aABX())); break;
      case 0x85: wr(aZP(),st.a); break;
      case 0x95: wr(aZPX(),st.a); break;
      case 0x8D: wr(aABS(),st.a); break;
      case 0x9D: wr(aABX(),st.a); break;
      case 0x99: wr(aABY(),st.a); break;
      case 0x81: wr(aIZX(),st.a); break;
      case 0x91: wr(aIZY(),st.a); break;
      case 0x86: wr(aZP(),st.x); break;
      case 0x96: wr(aZPY(),st.x); break;
      case 0x8E: wr(aABS(),st.x); break;
      case 0x84: wr(aZP(),st.y); break;
      case 0x94: wr(aZPX(),st.y); break;
      case 0x8C: wr(aABS(),st.y); break;
      case 0xAA: st.x=setNZ(st.a); break;
      case 0xA8: st.y=setNZ(st.a); break;
      case 0x8A: st.a=setNZ(st.x); break;
      case 0x98: st.a=setNZ(st.y); break;
      case 0xBA: st.x=setNZ(st.sp); break;
      case 0x9A: st.sp=st.x; break;
      case 0x48: push(st.a); break;
      case 0x68: st.a=setNZ(pop()); break;
      case 0x08: push(st.p|B|0x20); break;
      case 0x28: st.p=(pop()&~B)|0x20; break;
      case 0x69: adc(rd(aIMM())); break;
      case 0x65: adc(rd(aZP())); break;
      case 0x75: adc(rd(aZPX())); break;
      case 0x6D: adc(rd(aABS())); break;
      case 0x7D: adc(rd(aABX())); break;
      case 0x79: adc(rd(aABY())); break;
      case 0x61: adc(rd(aIZX())); break;
      case 0x71: adc(rd(aIZY())); break;
      case 0xE9: sbc(rd(aIMM())); break;
      case 0xE5: sbc(rd(aZP())); break;
      case 0xF5: sbc(rd(aZPX())); break;
      case 0xED: sbc(rd(aABS())); break;
      case 0xFD: sbc(rd(aABX())); break;
      case 0xF9: sbc(rd(aABY())); break;
      case 0xE1: sbc(rd(aIZX())); break;
      case 0xF1: sbc(rd(aIZY())); break;
      case 0x29: st.a=setNZ(st.a&rd(aIMM())); break;
      case 0x25: st.a=setNZ(st.a&rd(aZP())); break;
      case 0x35: st.a=setNZ(st.a&rd(aZPX())); break;
      case 0x2D: st.a=setNZ(st.a&rd(aABS())); break;
      case 0x3D: st.a=setNZ(st.a&rd(aABX())); break;
      case 0x39: st.a=setNZ(st.a&rd(aABY())); break;
      case 0x21: st.a=setNZ(st.a&rd(aIZX())); break;
      case 0x31: st.a=setNZ(st.a&rd(aIZY())); break;
      case 0x09: st.a=setNZ(st.a|rd(aIMM())); break;
      case 0x05: st.a=setNZ(st.a|rd(aZP())); break;
      case 0x15: st.a=setNZ(st.a|rd(aZPX())); break;
      case 0x0D: st.a=setNZ(st.a|rd(aABS())); break;
      case 0x1D: st.a=setNZ(st.a|rd(aABX())); break;
      case 0x19: st.a=setNZ(st.a|rd(aABY())); break;
      case 0x01: st.a=setNZ(st.a|rd(aIZX())); break;
      case 0x11: st.a=setNZ(st.a|rd(aIZY())); break;
      case 0x49: st.a=setNZ(st.a^rd(aIMM())); break;
      case 0x45: st.a=setNZ(st.a^rd(aZP())); break;
      case 0x55: st.a=setNZ(st.a^rd(aZPX())); break;
      case 0x4D: st.a=setNZ(st.a^rd(aABS())); break;
      case 0x5D: st.a=setNZ(st.a^rd(aABX())); break;
      case 0x59: st.a=setNZ(st.a^rd(aABY())); break;
      case 0x41: st.a=setNZ(st.a^rd(aIZX())); break;
      case 0x51: st.a=setNZ(st.a^rd(aIZY())); break;
      case 0xC9: cmp(st.a,rd(aIMM())); break;
      case 0xC5: cmp(st.a,rd(aZP())); break;
      case 0xD5: cmp(st.a,rd(aZPX())); break;
      case 0xCD: cmp(st.a,rd(aABS())); break;
      case 0xDD: cmp(st.a,rd(aABX())); break;
      case 0xD9: cmp(st.a,rd(aABY())); break;
      case 0xC1: cmp(st.a,rd(aIZX())); break;
      case 0xD1: cmp(st.a,rd(aIZY())); break;
      case 0xE0: cmp(st.x,rd(aIMM())); break;
      case 0xE4: cmp(st.x,rd(aZP())); break;
      case 0xEC: cmp(st.x,rd(aABS())); break;
      case 0xC0: cmp(st.y,rd(aIMM())); break;
      case 0xC4: cmp(st.y,rd(aZP())); break;
      case 0xCC: cmp(st.y,rd(aABS())); break;
      case 0x24: a=rd(aZP()); st.p=(st.p&~(N|V|Z))|(a&0xC0)|((st.a&a)?0:Z); break;
      case 0x2C: a=rd(aABS()); st.p=(st.p&~(N|V|Z))|(a&0xC0)|((st.a&a)?0:Z); break;
      case 0xE6: a=aZP(); wr(a,setNZ((rd(a)+1)&0xFF)); break;
      case 0xF6: a=aZPX(); wr(a,setNZ((rd(a)+1)&0xFF)); break;
      case 0xEE: a=aABS(); wr(a,setNZ((rd(a)+1)&0xFF)); break;
      case 0xFE: a=aABX(); wr(a,setNZ((rd(a)+1)&0xFF)); break;
      case 0xC6: a=aZP(); wr(a,setNZ((rd(a)-1)&0xFF)); break;
      case 0xD6: a=aZPX(); wr(a,setNZ((rd(a)-1)&0xFF)); break;
      case 0xCE: a=aABS(); wr(a,setNZ((rd(a)-1)&0xFF)); break;
      case 0xDE: a=aABX(); wr(a,setNZ((rd(a)-1)&0xFF)); break;
      case 0xE8: st.x=setNZ((st.x+1)&0xFF); break;
      case 0xC8: st.y=setNZ((st.y+1)&0xFF); break;
      case 0xCA: st.x=setNZ((st.x-1)&0xFF); break;
      case 0x88: st.y=setNZ((st.y-1)&0xFF); break;
      case 0x0A: asl(-1); break;
      case 0x06: asl(aZP()); break;
      case 0x16: asl(aZPX()); break;
      case 0x0E: asl(aABS()); break;
      case 0x1E: asl(aABX()); break;
      case 0x4A: lsr(-1); break;
      case 0x46: lsr(aZP()); break;
      case 0x56: lsr(aZPX()); break;
      case 0x4E: lsr(aABS()); break;
      case 0x5E: lsr(aABX()); break;
      case 0x2A: rol(-1); break;
      case 0x26: rol(aZP()); break;
      case 0x36: rol(aZPX()); break;
      case 0x2E: rol(aABS()); break;
      case 0x3E: rol(aABX()); break;
      case 0x6A: ror(-1); break;
      case 0x66: ror(aZP()); break;
      case 0x76: ror(aZPX()); break;
      case 0x6E: ror(aABS()); break;
      case 0x7E: ror(aABX()); break;
      case 0x10: branch(!(st.p&N)); break;
      case 0x30: branch(!!(st.p&N)); break;
      case 0x50: branch(!(st.p&V)); break;
      case 0x70: branch(!!(st.p&V)); break;
      case 0x90: branch(!(st.p&C)); break;
      case 0xB0: branch(!!(st.p&C)); break;
      case 0xD0: branch(!(st.p&Z)); break;
      case 0xF0: branch(!!(st.p&Z)); break;
      case 0x4C: st.pc=aABS(); break;
      case 0x6C: {const p=rdw(st.pc); st.pc=rd(p)|(rd((p&0xFF00)|((p+1)&0xFF))<<8);} break;
      case 0x20: {const t=rdw(st.pc); st.pc=(st.pc+1)&0xFFFF; push(st.pc>>8); push(st.pc&0xFF); st.pc=t;} break;
      case 0x60: st.pc=(pop()|(pop()<<8))+1; break;
      case 0x40: st.p=(pop()&~B)|0x20; st.pc=pop()|(pop()<<8); break;
      case 0x00: st.pc++; push(st.pc>>8); push(st.pc&0xFF); push(st.p|B); st.p|=I; st.pc=rdw(0xFFFE); break;
      case 0x18: st.p&=~C; break;
      case 0x38: st.p|=C; break;
      case 0x58: st.p&=~I; break;
      case 0x78: st.p|=I; break;
      case 0xB8: st.p&=~V; break;
      case 0xD8: st.p&=~D; break;
      case 0xF8: st.p|=D; break;
      case 0xEA: break;
      default: break;   // opcodes no oficiales: NOP
    }
    st.pc&=0xFFFF;
  }

  st.pc = rdw(0xFFFC);

  // un campo de video: NMI del disco + 4 interrupciones de campo (32V)
  function runField(cb){
    // --- ADC0809: si nadie mueve el mando, el harness lo barre para que el
    //     test de joysticks vea el recorrido completo que exige ($24 minimo)
    st.adcPhase++;
    if(st.joyManual===undefined){
      // barrido automatico para que el test de joysticks vea el recorrido
      const b = 0x40 + Math.round(0x80*(0.5-0.5*Math.cos(st.adcPhase/37)));
      st.adcX = b; st.adcY = b;
    }
    // --- 6502 de sonido (stub): contesta el buzon compartido $0800-$0908
    discField();
    st.outIdx=0;
    for(let k=0;k<4;k++){
      if(k===0 && st.nmiOn){ st.outIdx=0; irq(rdw(0xFFFA)); }      // NMI del disco
      if(!(st.p&I)) irq(M[0xFFF8]|(M[0xFFF9]<<8));      // 32V, enmascarable
      const t=st.cyc+(CY_FIELD>>2);
      if(cb){ while(st.cyc<t){ cb(st); step(); } } else { while(st.cyc<t) step(); }
    }
    st.field++;
  }

  return { st, runField, M, step };
}

function SND(roms){
  const M=new Uint8Array(0x10000);
  M.set(roms.rpm1,0x4000); M.set(roms.rpm2,0x8000); M.set(roms.rpm3,0xC000);
  const st={a:0,x:0,y:0,sp:0xFF,pc:0x61CF,p:0x24,cyc:0,
            ymAddr:0, ym:new Uint8Array(256), eventos:[], listo:0,
            pokey:new Uint8Array(64), pokeyDirty:0, voz:[]};

  // $3000-$31FF es la RAM compartida: los mismos bytes que el principal ve
  // en $0800-$09FF.  Se pasa desde afuera para que los dos la compartan.
  const esRam=a=> a<0x1100;
  function rd(a){
    a&=0xFFFF;
    if(a>=0x3000&&a<0x3200) return M[a];   // buzon y resultados (canal explicito)
    if(esRam(a)||a>=0x4000) return M[a];
    if(a===0x1231) return 0x00;         // estado del YM: nunca ocupado
    return 0x00;
  }
  function wr(a,v){
    a&=0xFFFF; v&=0xFF;
    if(a>=0x3000&&a<0x3200){ M[a]=v; return; }
    if(esRam(a)){ M[a]=v; return; }
    if(a>=0x4000) return;
    if(a===0x1230){ st.ymAddr=v; return; }
    if(a===0x1231){ st.ym[st.ymAddr]=v; st.eventos.push([st.ymAddr,v]);
                    if(st.eventos.length>4096) st.eventos.shift(); return; }
    // Quad POKEY en $1240, $1250, $1260 y $1270 (16 registros cada uno)
    if(a>=0x1240&&a<0x1280){ st.pokey[a-0x1240]=v; st.pokeyDirty=1; return; }
    // voz de TI en $1280-$1287
    if(a>=0x1280&&a<0x1288){ st.voz.push([a-0x1280,v]); if(st.voz.length>64) st.voz.shift(); return; }
  }
  const rdw=a=>rd(a)|(rd((a+1)&0xFFFF)<<8);
  const push=v=>{M[0x100+st.sp]=v&0xFF; st.sp=(st.sp-1)&0xFF;};
  const pop=()=>{st.sp=(st.sp+1)&0xFF; return M[0x100+st.sp];};
  const setNZ=v=>{st.p=(st.p&~(128|2))|(v&0x80)|(v===0?2:0); return v;};
  function irq(vec){ push(st.pc>>8); push(st.pc&0xFF); push(st.p&~16); st.p|=4; st.pc=vec; }

  const C=1,Z=2,I=4,D=8,B=16,V=64,N=128;

  // direccionamientos
  function aIMM(){return st.pc++;}
  function aZP(){return rd(st.pc++);}
  function aZPX(){return (rd(st.pc++)+st.x)&0xFF;}
  function aZPY(){return (rd(st.pc++)+st.y)&0xFF;}
  function aABS(){const a=rdw(st.pc); st.pc+=2; return a;}
  function aABX(){const a=rdw(st.pc); st.pc+=2; return (a+st.x)&0xFFFF;}
  function aABY(){const a=rdw(st.pc); st.pc+=2; return (a+st.y)&0xFFFF;}
  function aIZX(){const z=(rd(st.pc++)+st.x)&0xFF; return rd(z)|(rd((z+1)&0xFF)<<8);}
  function aIZY(){const z=rd(st.pc++); return ((rd(z)|(rd((z+1)&0xFF)<<8))+st.y)&0xFFFF;}
  function branch(c){const o=rd(st.pc++); if(c){st.pc=(st.pc+(o<128?o:o-256))&0xFFFF; st.cyc++;}}

  function adc(v){
    if(st.p&D){
      let lo=(st.a&15)+(v&15)+(st.p&C?1:0);
      let hi=(st.a>>4)+(v>>4);
      if(lo>9){lo-=10;hi++;}
      let r=(hi<<4)|(lo&15);
      st.p=(st.p&~C)|(hi>9?C:0);
      if(hi>9) r=(r+0x60)&0xFF;
      st.a=r&0xFF; setNZ(st.a);
    } else {
      const r=st.a+v+(st.p&C?1:0);
      st.p=(st.p&~(C|V))|(r>0xFF?C:0)|((~(st.a^v)&(st.a^r)&0x80)?V:0);
      st.a=r&0xFF; setNZ(st.a);
    }
  }
  function sbc(v){
    if(st.p&D){
      let lo=(st.a&15)-(v&15)-(st.p&C?0:1);
      let hi=(st.a>>4)-(v>>4);
      if(lo&0x10){lo-=6;hi--;}
      if(hi&0x10) hi-=6;
      const bin=st.a-v-(st.p&C?0:1);
      st.p=(st.p&~(C|V))|(bin>=0?C:0)|(((st.a^v)&(st.a^bin)&0x80)?V:0);
      st.a=((hi<<4)|(lo&15))&0xFF; setNZ(st.a);
    } else {
      const r=st.a-v-(st.p&C?0:1);
      st.p=(st.p&~(C|V))|(r>=0?C:0)|(((st.a^v)&(st.a^r)&0x80)?V:0);
      st.a=r&0xFF; setNZ(st.a);
    }
  }
  function cmp(r,v){const d=r-v; st.p=(st.p&~(C|N|Z))|(d>=0?C:0)|(d&0xFF?0:Z)|(d&0x80);}
  function asl(a){const v=a<0?st.a:rd(a); st.p=(st.p&~C)|((v>>7)&1); const r=setNZ((v<<1)&0xFF); a<0?st.a=r:wr(a,r);}
  function lsr(a){const v=a<0?st.a:rd(a); st.p=(st.p&~C)|(v&1); const r=setNZ(v>>1); a<0?st.a=r:wr(a,r);}
  function rol(a){const v=a<0?st.a:rd(a); const c=st.p&C; st.p=(st.p&~C)|((v>>7)&1); const r=setNZ(((v<<1)|(c?1:0))&0xFF); a<0?st.a=r:wr(a,r);}
  function ror(a){const v=a<0?st.a:rd(a); const c=st.p&C; st.p=(st.p&~C)|(v&1); const r=setNZ((v>>1)|(c?0x80:0)); a<0?st.a=r:wr(a,r);}

  function step(){
    const op=rd(st.pc++); let a;
    st.cyc+=3;
    switch(op){
      case 0xA9: st.a=setNZ(rd(aIMM())); break;
      case 0xA5: st.a=setNZ(rd(aZP())); break;
      case 0xB5: st.a=setNZ(rd(aZPX())); break;
      case 0xAD: st.a=setNZ(rd(aABS())); break;
      case 0xBD: st.a=setNZ(rd(aABX())); break;
      case 0xB9: st.a=setNZ(rd(aABY())); break;
      case 0xA1: st.a=setNZ(rd(aIZX())); break;
      case 0xB1: st.a=setNZ(rd(aIZY())); break;
      case 0xA2: st.x=setNZ(rd(aIMM())); break;
      case 0xA6: st.x=setNZ(rd(aZP())); break;
      case 0xB6: st.x=setNZ(rd(aZPY())); break;
      case 0xAE: st.x=setNZ(rd(aABS())); break;
      case 0xBE: st.x=setNZ(rd(aABY())); break;
      case 0xA0: st.y=setNZ(rd(aIMM())); break;
      case 0xA4: st.y=setNZ(rd(aZP())); break;
      case 0xB4: st.y=setNZ(rd(aZPX())); break;
      case 0xAC: st.y=setNZ(rd(aABS())); break;
      case 0xBC: st.y=setNZ(rd(aABX())); break;
      case 0x85: wr(aZP(),st.a); break;
      case 0x95: wr(aZPX(),st.a); break;
      case 0x8D: wr(aABS(),st.a); break;
      case 0x9D: wr(aABX(),st.a); break;
      case 0x99: wr(aABY(),st.a); break;
      case 0x81: wr(aIZX(),st.a); break;
      case 0x91: wr(aIZY(),st.a); break;
      case 0x86: wr(aZP(),st.x); break;
      case 0x96: wr(aZPY(),st.x); break;
      case 0x8E: wr(aABS(),st.x); break;
      case 0x84: wr(aZP(),st.y); break;
      case 0x94: wr(aZPX(),st.y); break;
      case 0x8C: wr(aABS(),st.y); break;
      case 0xAA: st.x=setNZ(st.a); break;
      case 0xA8: st.y=setNZ(st.a); break;
      case 0x8A: st.a=setNZ(st.x); break;
      case 0x98: st.a=setNZ(st.y); break;
      case 0xBA: st.x=setNZ(st.sp); break;
      case 0x9A: st.sp=st.x; break;
      case 0x48: push(st.a); break;
      case 0x68: st.a=setNZ(pop()); break;
      case 0x08: push(st.p|B|0x20); break;
      case 0x28: st.p=(pop()&~B)|0x20; break;
      case 0x69: adc(rd(aIMM())); break;
      case 0x65: adc(rd(aZP())); break;
      case 0x75: adc(rd(aZPX())); break;
      case 0x6D: adc(rd(aABS())); break;
      case 0x7D: adc(rd(aABX())); break;
      case 0x79: adc(rd(aABY())); break;
      case 0x61: adc(rd(aIZX())); break;
      case 0x71: adc(rd(aIZY())); break;
      case 0xE9: sbc(rd(aIMM())); break;
      case 0xE5: sbc(rd(aZP())); break;
      case 0xF5: sbc(rd(aZPX())); break;
      case 0xED: sbc(rd(aABS())); break;
      case 0xFD: sbc(rd(aABX())); break;
      case 0xF9: sbc(rd(aABY())); break;
      case 0xE1: sbc(rd(aIZX())); break;
      case 0xF1: sbc(rd(aIZY())); break;
      case 0x29: st.a=setNZ(st.a&rd(aIMM())); break;
      case 0x25: st.a=setNZ(st.a&rd(aZP())); break;
      case 0x35: st.a=setNZ(st.a&rd(aZPX())); break;
      case 0x2D: st.a=setNZ(st.a&rd(aABS())); break;
      case 0x3D: st.a=setNZ(st.a&rd(aABX())); break;
      case 0x39: st.a=setNZ(st.a&rd(aABY())); break;
      case 0x21: st.a=setNZ(st.a&rd(aIZX())); break;
      case 0x31: st.a=setNZ(st.a&rd(aIZY())); break;
      case 0x09: st.a=setNZ(st.a|rd(aIMM())); break;
      case 0x05: st.a=setNZ(st.a|rd(aZP())); break;
      case 0x15: st.a=setNZ(st.a|rd(aZPX())); break;
      case 0x0D: st.a=setNZ(st.a|rd(aABS())); break;
      case 0x1D: st.a=setNZ(st.a|rd(aABX())); break;
      case 0x19: st.a=setNZ(st.a|rd(aABY())); break;
      case 0x01: st.a=setNZ(st.a|rd(aIZX())); break;
      case 0x11: st.a=setNZ(st.a|rd(aIZY())); break;
      case 0x49: st.a=setNZ(st.a^rd(aIMM())); break;
      case 0x45: st.a=setNZ(st.a^rd(aZP())); break;
      case 0x55: st.a=setNZ(st.a^rd(aZPX())); break;
      case 0x4D: st.a=setNZ(st.a^rd(aABS())); break;
      case 0x5D: st.a=setNZ(st.a^rd(aABX())); break;
      case 0x59: st.a=setNZ(st.a^rd(aABY())); break;
      case 0x41: st.a=setNZ(st.a^rd(aIZX())); break;
      case 0x51: st.a=setNZ(st.a^rd(aIZY())); break;
      case 0xC9: cmp(st.a,rd(aIMM())); break;
      case 0xC5: cmp(st.a,rd(aZP())); break;
      case 0xD5: cmp(st.a,rd(aZPX())); break;
      case 0xCD: cmp(st.a,rd(aABS())); break;
      case 0xDD: cmp(st.a,rd(aABX())); break;
      case 0xD9: cmp(st.a,rd(aABY())); break;
      case 0xC1: cmp(st.a,rd(aIZX())); break;
      case 0xD1: cmp(st.a,rd(aIZY())); break;
      case 0xE0: cmp(st.x,rd(aIMM())); break;
      case 0xE4: cmp(st.x,rd(aZP())); break;
      case 0xEC: cmp(st.x,rd(aABS())); break;
      case 0xC0: cmp(st.y,rd(aIMM())); break;
      case 0xC4: cmp(st.y,rd(aZP())); break;
      case 0xCC: cmp(st.y,rd(aABS())); break;
      case 0x24: a=rd(aZP()); st.p=(st.p&~(N|V|Z))|(a&0xC0)|((st.a&a)?0:Z); break;
      case 0x2C: a=rd(aABS()); st.p=(st.p&~(N|V|Z))|(a&0xC0)|((st.a&a)?0:Z); break;
      case 0xE6: a=aZP(); wr(a,setNZ((rd(a)+1)&0xFF)); break;
      case 0xF6: a=aZPX(); wr(a,setNZ((rd(a)+1)&0xFF)); break;
      case 0xEE: a=aABS(); wr(a,setNZ((rd(a)+1)&0xFF)); break;
      case 0xFE: a=aABX(); wr(a,setNZ((rd(a)+1)&0xFF)); break;
      case 0xC6: a=aZP(); wr(a,setNZ((rd(a)-1)&0xFF)); break;
      case 0xD6: a=aZPX(); wr(a,setNZ((rd(a)-1)&0xFF)); break;
      case 0xCE: a=aABS(); wr(a,setNZ((rd(a)-1)&0xFF)); break;
      case 0xDE: a=aABX(); wr(a,setNZ((rd(a)-1)&0xFF)); break;
      case 0xE8: st.x=setNZ((st.x+1)&0xFF); break;
      case 0xC8: st.y=setNZ((st.y+1)&0xFF); break;
      case 0xCA: st.x=setNZ((st.x-1)&0xFF); break;
      case 0x88: st.y=setNZ((st.y-1)&0xFF); break;
      case 0x0A: asl(-1); break;
      case 0x06: asl(aZP()); break;
      case 0x16: asl(aZPX()); break;
      case 0x0E: asl(aABS()); break;
      case 0x1E: asl(aABX()); break;
      case 0x4A: lsr(-1); break;
      case 0x46: lsr(aZP()); break;
      case 0x56: lsr(aZPX()); break;
      case 0x4E: lsr(aABS()); break;
      case 0x5E: lsr(aABX()); break;
      case 0x2A: rol(-1); break;
      case 0x26: rol(aZP()); break;
      case 0x36: rol(aZPX()); break;
      case 0x2E: rol(aABS()); break;
      case 0x3E: rol(aABX()); break;
      case 0x6A: ror(-1); break;
      case 0x66: ror(aZP()); break;
      case 0x76: ror(aZPX()); break;
      case 0x6E: ror(aABS()); break;
      case 0x7E: ror(aABX()); break;
      case 0x10: branch(!(st.p&N)); break;
      case 0x30: branch(!!(st.p&N)); break;
      case 0x50: branch(!(st.p&V)); break;
      case 0x70: branch(!!(st.p&V)); break;
      case 0x90: branch(!(st.p&C)); break;
      case 0xB0: branch(!!(st.p&C)); break;
      case 0xD0: branch(!(st.p&Z)); break;
      case 0xF0: branch(!!(st.p&Z)); break;
      case 0x4C: st.pc=aABS(); break;
      case 0x6C: {const p=rdw(st.pc); st.pc=rd(p)|(rd((p&0xFF00)|((p+1)&0xFF))<<8);} break;
      case 0x20: {const t=rdw(st.pc); st.pc=(st.pc+1)&0xFFFF; push(st.pc>>8); push(st.pc&0xFF); st.pc=t;} break;
      case 0x60: st.pc=(pop()|(pop()<<8))+1; break;
      case 0x40: st.p=(pop()&~B)|0x20; st.pc=pop()|(pop()<<8); break;
      case 0x00: st.pc++; push(st.pc>>8); push(st.pc&0xFF); push(st.p|B); st.p|=I; st.pc=rdw(0xFFFE); break;
      case 0x18: st.p&=~C; break;
      case 0x38: st.p|=C; break;
      case 0x58: st.p&=~I; break;
      case 0x78: st.p|=I; break;
      case 0xB8: st.p&=~V; break;
      case 0xD8: st.p&=~D; break;
      case 0xF8: st.p|=D; break;
      case 0xEA: break;
      default: break;   // opcodes no oficiales: NOP
    }
    st.pc&=0xFFFF;
  }


  let arrancada=false;
  // 6502 de sonido a 14,318181 MHz / 8 = 1,7898 MHz, igual que en las placas
  // Atari de la epoca (atarisy1.cpp usa exactamente ese divisor), o sea
  // 29.860 ciclos por campo de 59,94 Hz.
  const CICLOS_CAMPO=29860;
  st.ticks=4;   // interrupciones de musica por campo (32V, como en la principal)
  function runField(){
    if(!arrancada){
      for(let i=0;i<60000;i++){ step(); if(st.pc===0x4000){ arrancada=true; st.listo=1; break; } }
      return;
    }
    const fin=st.cyc+CICLOS_CAMPO;
    const n=st.ticks||1, paso=CICLOS_CAMPO/n;
    for(let k=0;k<n;k++){
      if(!(st.p&4)) irq(M[0xFFF8]|(M[0xFFF9]<<8));   // tick de musica $40B5
      const t=st.cyc+paso;
      while(st.cyc<t) step();
    }
    while(st.cyc<fin) step();
  }
  // El principal escribio un codigo en su $0801; aca entra por $3001 y la
  // placa lo recoge con la NMI. $3004 se limpia porque del otro lado ya se
  // leyo la respuesta anterior.
  function comando(code){
    M[0x3001]=code&0xFF;
    M[0x3004]=0x00;
    irq(rdw(0xFFFA));            // NMI $54AD
  }
  return { st, M, step, runField, comando };
}

const FONT=new Uint8Array(512*64);
for(let n=0;n<512;n++)for(let y=0;y<8;y++){
  const v=(R.an[n*16+y*2]<<8)|R.an[n*16+y*2+1];
  for(let x=0;x<8;x++) FONT[n*64+y*8+x]=(v>>(14-2*x))&3;
}
const MO=new Uint8Array(1024*128);
for(let n=0;n<1024;n++)for(let y=0;y<16;y++){
  const b=[R.mo1[n*16+y],R.mo2[n*16+y],R.mo3[n*16+y],R.mo4[n*16+y]];
  for(let x=0;x<8;x++){let p=0;for(let k=0;k<4;k++)p|=((b[k]>>(7-x))&1)<<k;MO[n*128+y*8+x]=p;}
}
// Color RAM: 1024 palabras de 16 bits en $2000-$27FF.
// Formato 2 mix + 5R + 5G + 4B. Los dos bits de "mix" son la mezcla con el
// video del laserdisc: 3 = transparente del todo (se ve el disco), 0 = opaco.
const MIXA=[255,190,110,0];
function colorRAM(M,a){
  const w=(M[a]<<8)|M[a+1];
  return [ Math.round(((w>>9)&31)*255/31), Math.round(((w>>4)&31)*255/31),
           Math.round((w&15)*255/15), MIXA[w>>14] ];
}

let m,sb,boot,bootT,autoJugar=false,nCampo=0;
function arrancar(){
  m=RR({main1:R.main1,main2:R.main2,main3:R.main3});
  sb=SND({rpm1:R.rpm1,rpm2:R.rpm2,rpm3:R.rpm3});
  nCampo=0;
  m.st.b4=1; m.st.joyManual=undefined; boot=0; bootT=0;
  document.getElementById('reg').innerHTML='';
  document.getElementById('boot').textContent='auto-test';
}
arrancar();

// encendido: auto-test -> pulso de START -> interruptor a normal -> (auto) moneda+START
function secuencia(){
  bootT++;
  if(boot===0){ if(bootT>1200){boot=1;bootT=0;} return; }
  if(boot===1){
    if(bootT<=4) m.st.sw=0x30;
    else if(bootT<=7) m.st.sw=0x00;
    else { m.st.sw=0x08; boot=2; bootT=0;
           m.st.joyManual=1; document.getElementById('boot').textContent='attract'; }
    return;
  }
  if(boot===2 && autoJugar){
    if(bootT===60) m.st.sw=0x48;
    else if(bootT===72) m.st.sw=0x08;
    else if(bootT===120) m.st.sw=0x38;
    else if(bootT===132){ m.st.sw=0x08; boot=3; document.getElementById('boot').textContent='partida'; }
  }
}

const cv=document.getElementById('cv'),cx=cv.getContext('2d');
const img=cx.createImageData(336,240);   // resolucion real: 336 x 240
// Motion objects, con el formato que MAME documenta para Atari System 1
// (atarisy1_v.cpp, s_mob_config) y que el manual de Road Runner confirma:
//   word0 = $3F00:$3F01 -> Y = (w & $3FE0) >> 5 · alto = w & $0F (en stamps de
//           8x8) · reflejo horizontal = bit 15.  Alto 0 = objeto apagado.
//   word1 = $3F80:$3F81 -> numero de imagen (10 bits) y paleta
//   word2 = $3981:$3A01 -> X = (w & $3FE0) >> 5 · prioridad = bit 15
// El objeto tiene un stamp de ancho y hasta 8 de alto, y la imagen avanza de
// una en una hacia abajo. El "Motion Object Test" de la placa deja los 56
// objetos con alto 1, y el manual dice "eight pixels high": cuadra.

// La placa tiene DOS bancos de RAM de motion objects y muestra uno mientras el
// programa escribe en el otro. Sin eso, si se lee la lista en cualquier momento
// se agarra a medio actualizar y los objetos saltan de posicion entre campos.
// Aca se congela una copia al final de cada campo y se dibuja de esa copia.
const moSnap=new Uint8Array(0x800);
function latchMO(){ moSnap.set(m.M.subarray(0x3800,0x4000)); }
function dibujar(){
  const W=336,H=240;
  const d=img.data; d.fill(0); const M=m.M;
  const S=(a)=>moSnap[a-0x3800];
  const anc=[colorRAM(M,0x2000),colorRAM(M,0x2080),colorRAM(M,0x2100),colorRAM(M,0x2180)];
  for(let r=0;r<30;r++)for(let c=0;c<42;c++){
    const ch=M[0x1000+r*64+c]; if(!ch||ch===0x20) continue;
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){
      const p=FONT[(ch&0x1FF)*64+y*8+x]; if(!p)continue;
      const k=anc[p]; if(!k[3]) continue;
      const px=c*8+x, py=r*8+y; if(px>=W||py>=H) continue;
      const o=(py*W+px)*4;
      d[o]=k[0];d[o+1]=k[1];d[o+2]=k[2];d[o+3]=k[3];
    }
  }
  // Motion objects. Cada objeto ocupa varias columnas contiguas de 8 pixeles:
  // los cinco bytes de $3801/$3881/$3901/$3981/$3A01 son la X de cada columna,
  // en unidades de stamp ((byte & $3F) * 8), y una columna en cero esta
  // apagada. El campo de alto ($3F01 & $0F) es el numero TOTAL de imagenes del
  // objeto, asi que las filas salen de alto / columnas — con cuatro columnas y
  // alto 8 quedan las "8 pictures/M.O." que anuncia el spec, repartidas 4x2.
  // El campo de alto es el numero TOTAL de imagenes del objeto, repartidas
  // entre dos columnas de 8 pixeles: con alto 8 quedan 2 x 4 stamps, o sea las
  // "8 pictures/M.O." del spec. Las imagenes van por columnas:
  // code + columna * filas + fila.
  // Es lo que hace el dispositivo de motion objects de System 1, donde el
  // numero de imagen se incrementa hacia abajo dentro de un objeto y un
  // personaje ancho se arma con varios objetos enganchados uno al lado del otro.
  const campoPar=m.st.field&1;
  let prevY=-1, prevCode=-99, prevFilas=0;
  for(let i=0;i<56;i++){
    const o=i*2;
    const w0=(S(0x3F00+o)<<8)|S(0x3F01+o);
    const alto=w0&0x0F;
    if(!alto) continue;
    const Y=((w0&0x3FE0)>>5)&0xFF, hflip=(w0>>15)&1;
    const xs=[S(0x3801+o),S(0x3881+o),S(0x3901+o),S(0x3981+o),S(0x3A01+o)];
    const act=[]; for(const v of xs) if(v) act.push(v);
    if(!act.length) continue;
    // Dos columnas por objeto: es lo que da la figura con las proporciones
    // que tiene en la placa (16 de ancho por unos 32 de alto).
    const ncol=Math.min(2,act.length);
    const filas=Math.max(1,Math.floor(alto/ncol));   // alto = stamps totales del objeto
    const code=S(0x3F80+o)|((S(0x3F81+o)&3)<<8);
    // Los personajes vienen en pares: el segundo objeto arranca justo donde
    // termina la tira de imagenes del primero y a la misma altura. Es la
    // segunda mitad de la misma figura, no otro bicho, asi que no se dibuja
    // aparte.
    if(prevY===Y && code===prevCode+prevFilas){ prevCode=code; prevFilas=filas; continue; }
    prevY=Y; prevCode=code; prevFilas=filas;
    const pal=0x2200+((S(0x3F81+o)>>4)&3)*0x80;
    const tabla=[]; for(let v=0;v<16;v++) tabla.push(colorRAM(M,pal+v*2));
    for(let c=0;c<ncol;c++){
      const X=(act[hflip?ncol-1-c:c]&0x3F)*8;
      for(let t=0;t<filas;t++){
        const c2=(code+c*filas+t)&1023;
        for(let dy=0;dy<8;dy++){
          const sy=dy*2+campoPar;
          for(let x=0;x<8;x++){
            const p=MO[c2*128+sy*8+(hflip?7-x:x)]; if(!p)continue;
            const k=tabla[p]; if(!k[3]) continue;
            const px=X+x, py=Y+t*8+dy;
            if(px<0||px>=W||py<0||py>=H)continue;
            const q=(py*W+px)*4;
            d[q]=k[0];d[q+1]=k[1];d[q+2]=k[2];d[q+3]=k[3];
          }
        }
      }
    }
  }
  cx.putImageData(img,0,0);
}

// ---------------- sonido: YM2151 aproximado ----------------
// La placa de sonido corre de verdad (6502 + sus ROM) y escribe los registros
// del YM2151. Aca se sintetiza: la nota sale de KC/KF ($28+ch y $30+ch), el
// volumen del TL de la portadora ($60/$68/$70/$78 + ch segun el algoritmo) y
// el encendido del registro $08 (KON).
let ac=null, gan=null;
const voces=[];
const SEMI=[0,1,2,0,3,4,5,0,6,7,8,0,9,10,11,0];
function audioOn(){
  if(ac) return;
  ac=new (window.AudioContext||window.webkitAudioContext)();
  gan=ac.createGain(); gan.gain.value=0.45; gan.connect(ac.destination);
  for(let i=0;i<8;i++){
    const o=ac.createOscillator(), g=ac.createGain();
    g.gain.value=0; o.type='sine'; o.frequency.value=220;
    o.connect(g); g.connect(gan); o.start();
    voces.push({o,g,on:false});
  }
}
function frecuencia(ym,ch){
  const kc=ym[0x28+ch], kf=(ym[0x30+ch]>>2)&63;
  const oct=(kc>>4)&7, semi=SEMI[kc&15];
  return 17.32*Math.pow(2, oct + (semi + kf/64)/12);
}
function volumen(ym,ch){
  const alg=ym[0x20+ch]&7;
  let slots;
  if(alg<4) slots=[0x78];
  else if(alg===4) slots=[0x70,0x78];
  else if(alg<7) slots=[0x68,0x70,0x78];
  else slots=[0x60,0x68,0x70,0x78];
  let tl=127;
  for(const s of slots){ const v=ym[s+ch]&127; if(v<tl) tl=v; }
  if(tl>=124) return 0;
  return Math.pow(10, -tl*0.75/20);
}
function atenderYM(sb){
  if(!ac) { sb.st.eventos.length=0; return; }
  const ym=sb.st.ym;
  let cambios=false;
  for(const [reg,val] of sb.st.eventos){
    if(reg===0x08){
      const ch=val&7, slots=(val>>3)&15;
      const v=voces[ch];
      if(slots){ v.on=true; } else { v.on=false; }
      cambios=true;
    } else if((reg>=0x20&&reg<0x40)||(reg>=0x60&&reg<0x80)) cambios=true;
  }
  sb.st.eventos.length=0;
  if(!cambios) return;
  const t=ac.currentTime;
  for(let ch=0;ch<8;ch++){
    const v=voces[ch];
    const alg=ym[0x20+ch]&7;
    const tipo = alg<4?'sine':(alg<7?'triangle':'sawtooth');
    if(v.o.type!==tipo) v.o.type=tipo;
    const f=frecuencia(ym,ch);
    if(isFinite(f)&&f>20&&f<12000) v.o.frequency.setTargetAtTime(f,t,0.004);
    const g=v.on?volumen(ym,ch)*0.22:0;
    v.g.gain.setTargetAtTime(g,t,v.on?0.006:0.03);
  }
}

// ---------------- Quad POKEY con ruido real ----------------
// Cuatro POKEY en $1240, $1250, $1260 y $1270, configurados con AUDCTL = $78:
// canales 1+2 y 3+4 unidos en parejas de 16 bits a 1,79 MHz. Dos voces por
// chip, ocho en total. La distorsion no se aproxima: se generan los tres
// polinomios reales del chip (4, 5 y 17 bits) y se reproducen a la frecuencia
// del canal, que es como el POKEY los desplaza.
function poly(bits, tap){
  const n=(1<<bits)-1; const s=new Uint8Array(n); let r=1;
  for(let i=0;i<n;i++){
    s[i]=r&1;
    const b=((r>>0)^(r>>tap))&1;
    r=(r>>1)|(b<<(bits-1));
  }
  return s;
}
let P4,P5,P17,bufs=null;
function bufPoly(seq){
  const b=ac.createBuffer(1,seq.length,ac.sampleRate);
  const d=b.getChannelData(0);
  for(let i=0;i<seq.length;i++) d[i]=seq[i]?0.9:-0.9;
  return b;
}
const vocesPk=[];
function pokeyOn(){
  if(!ac||vocesPk.length) return;
  P4=poly(4,1); P5=poly(5,2); P17=poly(17,5);
  bufs={4:bufPoly(P4),5:bufPoly(P5),17:bufPoly(P17)};
  for(let i=0;i<8;i++){
    const g=ac.createGain(); g.gain.value=0; g.connect(gan);
    const o=ac.createOscillator(); o.type='square'; o.frequency.value=440;
    const go=ac.createGain(); go.gain.value=0; o.connect(go); go.connect(g); o.start();
    const fuentes={};
    for(const k of [4,5,17]){
      const s=ac.createBufferSource(); s.buffer=bufs[k]; s.loop=true;
      const gs=ac.createGain(); gs.gain.value=0; s.connect(gs); gs.connect(g); s.start();
      fuentes[k]={s,gs};
    }
    vocesPk.push({g,o,go,fuentes,modo:null});
  }
}
// distorsion: $A0 y $E0 son tono puro, $80 usa el polinomio de 17 bits,
// $C0 el de 4 y el resto pasan por el de 5
function pkModo(audc){
  const d=audc&0xE0;
  if(d===0xA0||d===0xE0) return 'tono';
  if(d===0x80) return 17;
  if(d===0xC0) return 4;
  return 5;
}
function atenderPokey(sb){
  if(!ac) return;
  pokeyOn();
  if(!sb.st.pokeyDirty) return;
  sb.st.pokeyDirty=0;
  const p=sb.st.pokey, t=ac.currentTime;
  for(let c=0;c<4;c++)for(let par=0;par<2;par++){
    const b=c*16+par*4;
    const audf=p[b]|(p[b+2]<<8), audc=p[b+3];
    const v=vocesPk[c*2+par];
    const vol=(audc&15)/15;
    if(!vol||!audf){ v.g.gain.setTargetAtTime(0,t,0.02); continue; }
    const f=1789790/(2*(audf+7));
    if(!(f>20&&f<15000)) { v.g.gain.setTargetAtTime(0,t,0.02); continue; }
    const modo=pkModo(audc);
    v.go.gain.setTargetAtTime(modo==='tono'?1:0,t,0.004);
    for(const k of [4,5,17]) v.fuentes[k].gs.gain.setTargetAtTime(modo===k?1:0,t,0.004);
    if(modo==='tono') v.o.frequency.setTargetAtTime(f,t,0.004);
    else v.fuentes[modo].s.playbackRate.setTargetAtTime(f/ac.sampleRate,t,0.004);
    v.g.gain.setTargetAtTime(vol*0.09,t,0.01);
  }
}

// ---------------- grabacion de la musica en VGM ----------------
// Se anota el flujo de registros del YM2151 con un wait de un campo entre
// medio y se arma un .vgm estandar, que abre cualquier reproductor.
let grabando=false, vgmDatos=[], vgmCampos=0;
function vgmCampo(sb){
  if(!grabando) return;
  for(const [reg,val] of sb.st.eventos) vgmDatos.push(0x54,reg,val);
  vgmDatos.push(0x62);                       // esperar 1/60 de segundo
  vgmCampos++;
}
function vgmDescargar(){
  const cab=new Uint8Array(0x100);
  const dv=new DataView(cab.buffer);
  cab.set([0x56,0x67,0x6D,0x20],0);          // "Vgm "
  dv.setUint32(0x04, 0x100+vgmDatos.length+1-4, true);
  dv.setUint32(0x08, 0x00000161, true);      // version 1.61
  dv.setUint32(0x18, vgmCampos*735, true);   // total de muestras
  dv.setUint32(0x24, 60, true);              // tasa de refresco
  dv.setUint32(0x30, 3579545, true);         // reloj del YM2151
  dv.setUint32(0x34, 0x100-0x34, true);      // offset de los datos
  const todo=new Uint8Array(0x100+vgmDatos.length+1);
  todo.set(cab,0); todo.set(vgmDatos,0x100); todo[todo.length-1]=0x66;
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([todo],{type:'application/octet-stream'}));
  a.download='road_runner_laserdisc.vgm'; a.click();
}

// ---------------- joystick tactil ----------------
const stick=document.getElementById('stick'), knob=document.getElementById('knob');
let arrastrando=false;
function mover(ev){
  const r=stick.getBoundingClientRect();
  const p=ev.touches?ev.touches[0]:ev;
  let dx=(p.clientX-r.left)/r.width*2-1, dy=(p.clientY-r.top)/r.height*2-1;
  const d=Math.hypot(dx,dy); if(d>1){dx/=d;dy/=d;}
  knob.style.left=(r.width/2+dx*r.width*0.30-26)+'px';
  knob.style.top =(r.height/2+dy*r.height*0.30-26)+'px';
  m.st.joyManual=1;
  m.st.adcX=Math.max(0,Math.min(255,Math.round(128+dx*127)));
  m.st.adcY=Math.max(0,Math.min(255,Math.round(128-dy*127)));
}
function soltar(){
  arrastrando=false;
  knob.style.left='40px'; knob.style.top='40px';
  m.st.adcX=128; m.st.adcY=128;
}
stick.addEventListener('touchstart',e=>{e.preventDefault();arrastrando=true;audioOn();mover(e);},{passive:false});
stick.addEventListener('touchmove',e=>{e.preventDefault();if(arrastrando)mover(e);},{passive:false});
stick.addEventListener('touchend',e=>{e.preventDefault();soltar();},{passive:false});
stick.addEventListener('mousedown',e=>{arrastrando=true;audioOn();mover(e);});
window.addEventListener('mousemove',e=>{if(arrastrando)mover(e);});
window.addEventListener('mouseup',()=>{if(arrastrando)soltar();});

// ---------------- bucle ----------------

  return { m: () => m, sb: () => sb, img, dibujar, secuencia, latchMO, atenderYM, atenderPokey, audioOn: typeof audioOn === 'function' ? audioOn : () => {}, campo: () => nCampo, inc: () => { nCampo++; } };
}

/* ==========================================================================
 *  Road Runner laserdisc (prototipo Atari 1985) — nativo. Núcleo de Luis:
 *  6502 con el hardware deducido de las ROM (tipo System 1: alfanuméricos +
 *  motion objects), placa de sonido 6502 real con YM2151/POKEY sintetizados.
 *  El disco sigue el contador de cuadros del juego.
 * ========================================================================== */
async function drvRoadRunner(lib, set, env) {
  const res = { missing: [], loaded: [] }, R = {};
  const files = { main1: 'rrmain1.bin', main2: 'rrmain2.bin', main3: 'rrmain3.bin', an: 'rran.bin', mo1: 'rrmo1.bin', mo2: 'rrmo2.bin', mo3: 'rrmo3.bin', mo4: 'rrmo4.bin', rpm1: 'rrrpm1.bin', rpm2: 'rrrpm2.bin', rpm3: 'rrrpm3.bin' };
  for (const k in files) {
    let r = null; for (const s in lib.sets) { r = lib.sets[s].find(x => x.name === files[k]); if (r) break; }
    if (!r) { res.missing.push(files[k]); R[k] = new Uint8Array(0x4000); continue; } R[k] = await lib.get(r); res.loaded.push(files[k]);
  }
  const C = RRCORE(R);
  const hist = []; let moving = false;
  const ldp = {
    get frame() { return C.m().st.disc.frame; }, frac: 0,
    get status() { return moving ? LDP_PLAYING : LDP_PAUSED; }, get target() { return C.m().st.disc.frame; },
    fps: 29.97, speedNum: 1, speedDen: 1, audio1: true, audio2: true, squelchSearch: false, log: []
  };
  const pul = {}; let ax = 0, ay = 0;
  const G = {
    name: set, fps: 29.97, ldp, res, ow: 336, oh: 240, players: 1,
    get videoBlank() { return false; },
    runField() {
      const m = C.m(), sb = C.sb(), st = m.st;
      if (ax || ay) { st.joyManual = 1; st.adcX = Math.max(0, Math.min(255, 128 + ax * 120)); st.adcY = Math.max(0, Math.min(255, 128 + ay * 120)); }
      else if (st.joyManual) { st.adcX = 128; st.adcY = 128; }
      C.secuencia(); sb.runField();
      if (C.campo() > 400) for (let i = 2; i <= 8; i++) m.M[0x0800 + i] = sb.M[0x3000 + i];
      while (st.sndQueue.length) sb.comando(st.sndQueue.shift());
      m.runField(); C.latchMO(); C.inc();
      try { C.atenderYM(sb); C.atenderPokey(sb); } catch (e) {}
      hist.push(st.disc.frame); if (hist.length > 10) hist.shift();
      const d = hist.length > 1 ? (hist[hist.length - 1] - hist[0]) / (hist.length - 1) : 0; moving = d > 0.3 && d < 0.7;
    },
    input(sw, d) {
      const st = C.m().st; try { if (d) C.audioOn(); } catch (e) {}
      const bit = { [SW.COIN1]: 0x40, [SW.COIN2]: 0x40, [SW.START1]: 0x30, [SW.BUTTON1]: 0x10, [SW.BUTTON2]: 0x20 }[sw];
      if (bit) { if (d) st.sw |= bit; else st.sw &= ~bit; }
      if (sw === SW.TEST && d) st.sw ^= 0x08;
      if (sw === SW.LEFT) ax = d ? -1 : (ax < 0 ? 0 : ax); if (sw === SW.RIGHT) ax = d ? 1 : (ax > 0 ? 0 : ax);
      if (sw === SW.UP) ay = d ? 1 : (ay > 0 ? 0 : ay); if (sw === SW.DOWN) ay = d ? -1 : (ay < 0 ? 0 : ay);
    },
    gamepad(seat, gp) {
      if (seat) return; let x = gp.axes[0] || 0, y = gp.axes[1] || 0; if (Math.abs(x) < 0.2) x = 0; if (Math.abs(y) < 0.2) y = 0;
      ax = x; ay = -y;
    },
    draw(buf) { C.dibujar(); buf.set(new Uint32Array(C.img.data.buffer.slice(0))); },
    sample() { return 0; },   /* el YM2151/POKEY se sintetizan con osciladores Web Audio propios del núcleo */
    status() { const st = C.m().st; return '6502 PC ' + st.pc.toString(16) + ' · disco ' + st.disc.frame + (moving ? ' play' : ''); }
  };
  return G;
}
DRIVERS.roadrunner = drvRoadRunner;
