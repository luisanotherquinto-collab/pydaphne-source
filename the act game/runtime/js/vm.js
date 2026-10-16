// Maquina ARM virtual para la logica recompilada de The Act.
// Ejecuta las funciones GameLogicXX y el nucleo del motor traducidos a JS,
// usando una imagen de memoria del binario original para los datos estaticos.
"use strict";
(function(global){
let _imgCache=null;
function memImage(mi){
  if(_imgCache) return _imgCache;
  const bin=atob(mi.raw), u=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
  return (_imgCache=u);
}
class VM{
  constructor(memimg, hle){
    this.base=memimg.base;
    const img=memImage(memimg);
    // espacio: [0 .. 0x400000) datos del binario + heap alto
    this.buf=new ArrayBuffer(0x400000);
    this.u8=new Uint8Array(this.buf); this.i8=new Int8Array(this.buf);
    this.u16=new Uint16Array(this.buf); this.i16=new Int16Array(this.buf);
    this.u32=new Uint32Array(this.buf); this.i32=new Int32Array(this.buf);
    this.f32=new Float32Array(this.buf); this.f64=new Float64Array(this.buf);
    this.u8.set(img, this.base);
    this.heap=0x300000; this.SP=0x3f0000; this._seed=1;
    this.R1=0; this.funcs={}; this.hle=hle||{}; this.hleByAddr={};
    // registros VFP: 32 de 32-bit (s0..s31) solapados con 16 de 64-bit
    this.fbuf=new ArrayBuffer(256);
    this.FS=new Float32Array(this.fbuf); this.FI=new Int32Array(this.fbuf);
    this.FD=new Float64Array(this.fbuf);
    this.FN=this.FZ=this.FC=this.FV=false;
    this.stubs=makeStubs(this);
  }
  load(group, table){ Object.assign(this.funcs, table(this)); if(group) this.groups=(this.groups||[]).concat(group); }
  registerHLE(addr,fn){ this.hleByAddr[addr&~1]=fn; }
  // memoria (little-endian, direcciones de byte)
  L(a){ return (a&3)===0 ? this.i32[a>>2] : (this.u8[a]|this.u8[a+1]<<8|this.u8[a+2]<<16|this.u8[a+3]<<24)|0; }
  S(a,v){ if((a&3)===0) this.i32[a>>2]=v; else { this.u8[a]=v;this.u8[a+1]=v>>8;this.u8[a+2]=v>>16;this.u8[a+3]=v>>24; } }
  LB(a){ return this.u8[a]; } LSB(a){ return this.i8[a]; }
  LH(a){ return (a&1)?(this.u8[a]|this.u8[a+1]<<8):this.u16[a>>1]; }
  LSH(a){ let v=this.LH(a); return v<<16>>16; }
  SB(a,v){ this.u8[a]=v; } SH(a,v){ if(a&1){this.u8[a]=v;this.u8[a+1]=v>>8;}else this.u16[a>>1]=v; }
  ldF(a,i){ this.FS[i]=(a&3)?new DataView(this.buf).getFloat32(a,true):this.f32[a>>2]; }
  stF(a,i){ if(a&3)new DataView(this.buf).setFloat32(a,this.FS[i],true); else this.f32[a>>2]=this.FS[i]; }
  ldD(a,i){ this.FD[i>>1]=new DataView(this.buf).getFloat64(a,true); }
  stD(a,i){ new DataView(this.buf).setFloat64(a,this.FD[i>>1],true); }
  cvtS(x){ x=Math.trunc(x); return x>2147483647?2147483647:x<-2147483648?-2147483648:x|0; }
  cvtU(x){ x=Math.trunc(x); return x<0?0:x>4294967295?-1:x|0; }
  fcmp(a,b){ if(isNaN(a)||isNaN(b)){this.FN=false;this.FZ=false;this.FC=false;this.FV=true;} else {this.FZ=a===b;this.FN=a<b;this.FC=a>=b;this.FV=false;} }
  lsl(v,n){ return n>=32?0:(v<<n)|0; }
  lsr(v,n){ return n>=32?0:(v>>>n)|0; }
  asr(v,n){ return n>=32?(v>>31):(v>>n); }
  ror(v,n){ n&=31; return ((v>>>n)|(v<<(32-n)))|0; }
  // fabrica un objeto nuevo en el heap
  alloc(n){ const p=this.heap; this.heap=(this.heap+n+7)&~7; return p; }
  // llamada a funcion por direccion (recompilada o HLE)
  call(addr,a,b,c,d){
    const t=addr&~1;
    const f=this.funcs[addr]||this.funcs[t|1];
    if(f){ return f(a,b,c,d); }
    const h=this.hleByAddr[t];
    if(h){ const r=h(a,b,c,d); return r===undefined?0:r|0; }
    throw new Error("llamada a funcion no implementada: 0x"+t.toString(16));
  }
  stub(name,a,b,c,d){ const s=this.stubs[name]; if(!s) throw new Error("stub no implementado: "+name); return s(a,b,c,d)|0; }
}
function makeStubs(M){
  return {
    "_memset":(d,v,n)=>{ M.u8.fill(v&255,d,d+n); return d; },
    "_memcpy":(d,s,n)=>{ M.u8.copyWithin(d,s,s+n); return d; },
    "_memmove":(d,s,n)=>{ M.u8.copyWithin(d,s,s+n); return d; },
    "_malloc":(n)=>M.alloc(n), "_calloc":(n,s)=>{ const p=M.alloc(n*s); M.u8.fill(0,p,p+n*s); return p; },
    "_free":()=>0, "__Znwm":(n)=>M.alloc(n), "__ZdlPv":()=>0,
    "_rand":()=> (M._seed=(M._seed*1103515245+12345)&0x7fffffff), 
    "_srand":(s)=>{ M._seed=s>>>0; return 0; },
    "_time":()=> (Date.now()/1000)|0,
    "___divsi3":(a,b)=> b===0?0:(a/b)|0, "___modsi3":(a,b)=> b===0?0:(a%b)|0,
    "___udivsi3":(a,b)=> b===0?0:((a>>>0)/(b>>>0))|0, "___umodsi3":(a,b)=> b===0?0:((a>>>0)%(b>>>0))|0,
    "___assert_rtn":()=>{ throw new Error("assert en logica recompilada"); },
    "__ZSt20__throw_out_of_rangePKc":()=>{ throw new Error("out_of_range"); },
    "__ZSt9terminatev":()=>{ throw new Error("terminate"); },
    "__Unwind_SjLj_Register":()=>0, "__Unwind_SjLj_Unregister":()=>0, "__Unwind_SjLj_Resume":()=>{ throw new Error("unwind"); },
    "__ZNSsC1Ev":()=>0,"__ZNSsD1Ev":()=>0,
  };
}
global.ACT_VM=VM;
})(typeof window!=="undefined"?window:globalThis);
