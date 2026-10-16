# Recompilador estatico Thumb-2 (armv7) -> JavaScript para The Act (decaf engine)
from .binary import *
from . import binary as _bn
import re, sys, json
RN = {'sb':'r9','sl':'r10','fp':'r11','ip':'r12'}
def R(n):
    n = RN.get(n, n)
    return n
CC = {ARM_CC_EQ:'Z',ARM_CC_NE:'!Z',ARM_CC_HS:'C',ARM_CC_LO:'!C',ARM_CC_MI:'N',ARM_CC_PL:'!N',
      ARM_CC_VS:'V',ARM_CC_VC:'!V',ARM_CC_HI:'(C&&!Z)',ARM_CC_LS:'(!C||Z)',ARM_CC_GE:'(N==V)',
      ARM_CC_LT:'(N!=V)',ARM_CC_GT:'(!Z&&N==V)',ARM_CC_LE:'(Z||N!=V)'}
class Unsupported(Exception): pass
sorted_syms = sorted(a for a in sym if a < _bn.text_end)
def dec1(a):
    for i in cs_t.disasm(rd(a, 4), a):
        return i
    return None
def lit32(ins):
    o = ins.operands[1]
    return u32(((ins.address+4)&~3) + o.mem.disp)

class Fn:
    def __init__(s, entry, end):
        s.entry, s.end = entry, end
        s.ins = {}; s.leaders = {entry}; s.tables = {}; s.itcond = {}
    def discover(s):
        work = [s.entry]
        while work:
            a = work.pop()
            while True:
                if a in s.ins: break
                if not (s.entry <= a < s.end): break
                i = dec1(a)
                if i is None: raise Unsupported('decode %x' % a)
                s.ins[a] = i
                m = i.mnemonic.split('.')[0]
                nxt = a + i.size
                if m.startswith('it') and len(m) <= 5 and set(m[1:]) <= {'t','e'}:
                    base = CCNAME[i.op_str.strip()]
                    p = nxt
                    for ch in m[1:]:
                        j = dec1(p)
                        s.itcond[p] = base if ch == 't' else INV[base]
                        p += j.size
                icc = s.itcond.get(a, i.cc)
                if m in ('b','cbz','cbnz') or (m.startswith('b') and len(m)==3 and m[1:] in COND):
                    t = i.operands[-1].imm
                    cond = m in ('cbz','cbnz') or m != 'b' or icc != ARM_CC_AL
                    if s.entry <= t < s.end:
                        s.leaders.add(t); work.append(t)
                    if cond:
                        s.leaders.add(nxt); a = nxt; continue
                    break
                if m in ('tbb','tbh'):
                    idx = R(i.reg_name(i.operands[0].mem.index))
                    n = s.find_bound(a, idx)
                    base = a + 4; tg = []
                    for k in range(n):
                        if m == 'tbb': off = rd(base+k,1)[0]
                        else: off = struct.unpack('<H', rd(base+2*k,2))[0]
                        tg.append(base + 2*off)
                    s.tables[a] = tg
                    for t in tg: s.leaders.add(t); work.append(t)
                    s.leaders.add(nxt)  # default handled by preceding bhi
                    break
                if m == 'bx' or (m == 'pop' and any(i.reg_name(o.reg)=='pc' for o in i.operands)) or (m=='ldr' and i.operands[0].type==ARM_OP_REG and i.reg_name(i.operands[0].reg)=='pc'):
                    if icc != ARM_CC_AL:
                        s.leaders.add(nxt); a = nxt; continue
                    break
                if m == 'trap' or (m=='blx' and i.operands[0].type==ARM_OP_IMM and stubname.get(i.operands[0].imm,'') in ('___assert_rtn','__ZSt9terminatev','__ZSt20__throw_out_of_rangePKc','__Unwind_SjLj_Resume')):
                    break
                if icc != ARM_CC_AL and not m.startswith('it'):
                    s.leaders.add(nxt)
                a = nxt
    def find_bound(s, a, idx):
        p = a
        for _ in range(8):
            prevs = [x for x in s.ins if x < p]
            if not prevs: break
            p = max(prevs); i = s.ins[p]
            if i.mnemonic.startswith('cmp') and R(i.reg_name(i.operands[0].reg)) == idx and i.operands[1].type == ARM_OP_IMM:
                return i.operands[1].imm + 1
        raise Unsupported('tbb bound %x' % a)
CCNAME = {'eq':ARM_CC_EQ,'ne':ARM_CC_NE,'hs':ARM_CC_HS,'cs':ARM_CC_HS,'lo':ARM_CC_LO,'cc':ARM_CC_LO,'mi':ARM_CC_MI,'pl':ARM_CC_PL,
 'vs':ARM_CC_VS,'vc':ARM_CC_VC,'hi':ARM_CC_HI,'ls':ARM_CC_LS,'ge':ARM_CC_GE,'lt':ARM_CC_LT,'gt':ARM_CC_GT,'le':ARM_CC_LE}
INV = {ARM_CC_EQ:ARM_CC_NE,ARM_CC_NE:ARM_CC_EQ,ARM_CC_HS:ARM_CC_LO,ARM_CC_LO:ARM_CC_HS,ARM_CC_MI:ARM_CC_PL,ARM_CC_PL:ARM_CC_MI,
 ARM_CC_VS:ARM_CC_VC,ARM_CC_VC:ARM_CC_VS,ARM_CC_HI:ARM_CC_LS,ARM_CC_LS:ARM_CC_HI,ARM_CC_GE:ARM_CC_LT,ARM_CC_LT:ARM_CC_GE,ARM_CC_GT:ARM_CC_LE,ARM_CC_LE:ARM_CC_GT}
COND = {'eq','ne','hs','lo','mi','pl','vs','vc','hi','ls','ge','lt','gt','le','cs','cc'}

class Gen:
    def __init__(s, fn, callmap):
        s.fn = fn; s.out = []; s.callmap = callmap
    def reg(s, i, o):
        return R(i.reg_name(o.reg))
    def val(s, i, op, need_carry=False):
        """valor de operando (registro con shift o inmediato) -> (expr, carry_expr|None)"""
        if op.type == ARM_OP_IMM:
            return str(op.imm | 0 if op.imm < 0x80000000 else op.imm - (1<<32)), None
        r = s.reg(i, op)
        r = s.rd(r, i)
        st, sv = op.shift.type, op.shift.value
        if st == 0 or (sv == 0 and st in (ARM_SFT_LSL,)):
            return r, None
        if st == ARM_SFT_LSL: return f'({r}<<{sv})', f'(({r}>>>{32-sv})&1)'
        if st == ARM_SFT_LSR: return f'({r}>>>{sv}|0)', f'(({r}>>>{sv-1})&1)'
        if st == ARM_SFT_ASR: return f'({r}>>{sv})', f'(({r}>>{sv-1})&1)'
        if st == ARM_SFT_ROR: return f'(({r}>>>{sv})|({r}<<{32-sv}))', None
        raise Unsupported('shift %d' % st)
    def rd(s, r, i):
        if r == 'pc': return str((i.address + 4))
        return r
    def mem_addr(s, i, o):
        m = o.mem
        base = R(i.reg_name(m.base))
        if base == 'pc':
            b = str((i.address + 4) & ~3)
        else: b = base
        if m.index:
            idx = R(i.reg_name(m.index))
            if o.shift.type == ARM_SFT_LSL and o.shift.value:
                idx = f'({idx}<<{o.shift.value})'
            e = f'({b}{"-" if o.subtracted else "+"}{idx})'
        elif m.disp:
            e = f'({b}+{m.disp})'
        else: e = b
        return e, base, m.disp
    def emit(s, x): s.out.append(x)
    def gen(s):
        f = s.fn
        addrs = sorted(f.ins)
        s.emit(f'function f_{f.entry:x}(r0,r1,r2,r3){{let r4=0,r5=0,r6=0,r7=0,r8=0,r9=0,r10=0,r11=0,r12=0,lr=0,sp=M.SP,N=false,Z=false,C=false,V=false,t=0,u=0,pc={f.entry};')
        s.emit('for(;;)switch(pc){')
        prev_end = None
        for a in addrs:
            i = f.ins[a]
            if a in f.leaders or a != prev_end:
                if prev_end is not None and a != prev_end:
                    pass
                s.emit(f'case {a}:')
            prev_end = a + i.size
            try:
                code = s.ins(i)
            except Unsupported as e:
                raise Unsupported(f'{a:x}: {i.mnemonic} {i.op_str} -> {e}')
            if code is None: continue
            ecc = f.itcond.get(a, i.cc)
            if ecc != ARM_CC_AL and not s.handles_cc:
                code = f'if({CC[ecc]}){{{code}}}'
            s.emit(code)
        s.emit(f'default: throw new Error("pc fuera de flujo "+pc.toString(16)+" en f_{f.entry:x}");}}}}')
        return '\n'.join(s.out)
    def setNZ(s, r): return f'N={r}<0;Z={r}===0;'
    def call_expr(s, target_expr, static=None):
        if static is not None:
            nm = s.callmap(static)
            if nm: return f'M.SP=sp;r0={nm}(r0,r1,r2,r3);r1=M.R1;'
        if target_expr is None: target_expr = str(static)
        return f'M.SP=sp;r0=M.call({target_expr},r0,r1,r2,r3);r1=M.R1;'
    def ret(s): return 'M.R1=r1;return r0;'
    def branch(s, t):
        f = s.fn
        if f.entry <= t < f.end:
            return f'pc={t};continue;'
        return s.call_expr(None, static=t|1) + s.ret()  # tail call
    def ins(s, i):
        s.handles_cc = False
        m = i.mnemonic.split('.')[0]
        ops = i.operands
        uf = i.update_flags
        ecc = s.fn.itcond.get(i.address, i.cc)
        inIT = i.address in s.fn.itcond
        if inIT and i.size == 2 and m not in ('cmp','cmn','tst'):
            uf = False
        base = m
        # quitar sufijo de condicion de IT (moveq -> mov)
        if ecc != ARM_CC_AL and len(m) > 2 and m[-2:] in COND and m not in ('teq',):
            if m[:-2] in KNOWN: base = m[:-2]
        if base.endswith('s') and base[:-1] in SFLAG: base = base[:-1]
        if base in ('it','ite','itt','ittt','itttt','itte','ite','itet','iteee','itee','itete','nop'): return None
        if base == 'mov' or base == 'mvn':
            d = s.reg(i, ops[0])
            v, c = s.val(i, ops[1])
            if base == 'mvn': v = f'(~{v})'
            if d == 'pc': return s.ret()
            code = f'{d}={v}|0;'
            if uf: code += s.setNZ(d) + (f'C={c}!==0;' if c else '')
            return code
        if base == 'adr':
            d = s.reg(i, ops[0]); return f'{d}={((i.address+4)&~3)+ops[1].imm};'
        if base in ('movw',):
            d = s.reg(i, ops[0]); return f'{d}={ops[1].imm & 0xffff};'
        if base == 'movt':
            d = s.reg(i, ops[0]); return f'{d}=({d}&0xffff)|({ops[1].imm & 0xffff}<<16);'
        if base in ('add','sub','rsb','adc','sbc','addw','subw'):
            d = s.reg(i, ops[0])
            if len(ops) == 2: a_, bo = s.rd(d, i), ops[1]
            else: a_, bo = s.rd(s.reg(i, ops[1]), i), ops[2]
            if a_ == str(i.address+4) and base in ('add','sub','addw','subw') and bo.type == ARM_OP_IMM and len(ops)==3:
                a_ = str((i.address+4)&~3)  # adr
            if len(ops)==2 and bo.type==ARM_OP_REG and s.reg(i,bo)=='pc':
                b_ = str(i.address+4)
            else:
                b_, _ = s.val(i, bo)
            op = {'add':'+','addw':'+','sub':'-','subw':'-','rsb':'r','adc':'+','sbc':'-'}[base]
            if base == 'rsb': a_, b_ = b_, a_; op = '-'
            extra = ''
            if base == 'adc': extra = '+(C?1:0)'
            if base == 'sbc': extra = '-(C?0:1)'
            if d == 'pc': raise Unsupported('add pc')
            if not uf:
                return f'{d}=({a_}{op}{b_}{extra})|0;'
            if op == '+':
                return (f't={a_};u={b_};{d}=(t+u{extra})|0;C=(t>>>0)+(u>>>0){extra}>4294967295;V=((~(t^u))&(t^{d}))<0;' + s.setNZ(d))
            else:
                return (f't={a_};u={b_};{d}=(t-u{extra})|0;C=(t>>>0)>=((u>>>0){"" if base!="sbc" else "+(C?0:1)"});V=((t^u)&(t^{d}))<0;' + s.setNZ(d))
        if base in ('cmp','cmn'):
            a_ = s.rd(s.reg(i, ops[0]), i); b_, _ = s.val(i, ops[1])
            if base == 'cmp':
                return f't={a_};u={b_};C=(t>>>0)>=(u>>>0);t=(t-u)|0;V=(({a_}^u)&({a_}^t))<0;N=t<0;Z=t===0;'
            return f't={a_};u={b_};C=(t>>>0)+(u>>>0)>4294967295;t=(t+u)|0;V=((~({a_}^u))&({a_}^t))<0;N=t<0;Z=t===0;'
        if base in ('tst','teq'):
            a_ = s.rd(s.reg(i, ops[0]), i); b_, c = s.val(i, ops[1])
            o = '&' if base == 'tst' else '^'
            return f't={a_}{o}{b_};N=t<0;Z=t===0;' + (f'C={c}!==0;' if c else '')
        if base in ('and','orr','eor','bic','orn'):
            d = s.reg(i, ops[0])
            if len(ops) == 2: a_, bo = d, ops[1]
            else: a_, bo = s.reg(i, ops[1]), ops[2]
            b_, c = s.val(i, bo)
            if base == 'bic': e = f'{a_}&~{b_}'
            elif base == 'orn': e = f'{a_}|~{b_}'
            else: e = f'{a_}{ {"and":"&","orr":"|","eor":"^"}[base] }{b_}'
            code = f'{d}=({e})|0;'
            if uf: code += s.setNZ(d) + (f'C={c}!==0;' if c else '')
            return code
        if base in ('lsl','lsr','asr','ror'):
            d = s.reg(i, ops[0])
            if len(ops) == 2: src_, amt = d, ops[1]
            else: src_, amt = s.reg(i, ops[1]), ops[2]
            if amt.type == ARM_OP_IMM:
                n = amt.imm
                if base == 'lsl': e, c = ('t<<%d' % n, ('((t>>>%d)&1)!==0' % (32-n)) if n else None)
                elif base == 'lsr': e, c = (('t>>>%d' % n) if n else '0', '((t>>>%d)&1)!==0' % ((n or 32)-1))
                elif base == 'asr': e, c = ('t>>%d' % (n if n else 31), '((t>>%d)&1)!==0' % ((n-1) if n else 31))
                else: e, c = ('(t>>>%d)|(t<<%d)' % (n, 32-n), None)
                code = 't=%s;%s=(%s)|0;' % (src_, d, e)
                if uf: code += s.setNZ(d) + ('C=%s;' % c if c else '')
                return code
            rr = s.reg(i, amt)
            fn = {'lsl':'M.lsl','lsr':'M.lsr','asr':'M.asr','ror':'M.ror'}[base]
            code = '%s=%s(%s,%s&255);' % (d, fn, src_, rr)
            if uf: code += s.setNZ(d)
            return code
        if base in ('mul',):
            d = s.reg(i, ops[0]); a_ = s.reg(i, ops[1]); b_ = s.reg(i, ops[2]) if len(ops)>2 else d
            code = f'{d}=Math.imul({a_},{b_});'
            if uf: code += s.setNZ(d)
            return code
        if base == 'mla':
            d,a_,b_,c_ = [s.reg(i,o) for o in ops]; return f'{d}=(Math.imul({a_},{b_})+{c_})|0;'
        if base == 'mls':
            d,a_,b_,c_ = [s.reg(i,o) for o in ops]; return f'{d}=({c_}-Math.imul({a_},{b_}))|0;'
        if base == 'smmul':
            d,a_,b_ = [s.reg(i,o) for o in ops]; return f'{d}=Number((BigInt({a_})*BigInt({b_}))>>32n)|0;'
        if base in ('smull','umull'):
            lo,hi,a_,b_ = [s.reg(i,o) for o in ops]
            if base=='smull': return f't=BigInt({a_})*BigInt({b_});{lo}=Number(BigInt.asIntN(32,t));{hi}=Number(BigInt.asIntN(32,t>>32n));'
            return f't=BigInt({a_}>>>0)*BigInt({b_}>>>0);{lo}=Number(BigInt.asIntN(32,t));{hi}=Number(BigInt.asIntN(32,t>>32n));'
        if base in ('uxtb','uxth','sxtb','sxth'):
            d = s.reg(i, ops[0]); a_ = s.reg(i, ops[1])
            return {'uxtb':f'{d}={a_}&255;','uxth':f'{d}={a_}&65535;','sxtb':f'{d}=({a_}<<24)>>24;','sxth':f'{d}=({a_}<<16)>>16;'}[base]
        if base in ('ubfx','sbfx'):
            d = s.reg(i, ops[0]); a_ = s.reg(i, ops[1]); lsb, w = ops[2].imm, ops[3].imm
            if base == 'ubfx': return f'{d}=({a_}>>>{lsb})&{(1<<w)-1};'
            return f'{d}=(({a_}<<{32-lsb-w})>>{32-w});'
        if base == 'bfi':
            d = s.reg(i, ops[0]); a_ = s.reg(i, ops[1]); lsb, w = ops[2].imm, ops[3].imm
            mask = ((1<<w)-1) << lsb
            return f'{d}=({d}&{~mask & 0xffffffff})|(({a_}<<{lsb})&{mask})|0;'
        if base == 'bfc':
            d = s.reg(i, ops[0]); lsb, w = ops[1].imm, ops[2].imm
            mask = ((1<<w)-1) << lsb
            return f'{d}=({d}&{~mask & 0xffffffff})|0;'
        if base == 'clz':
            d = s.reg(i, ops[0]); return f'{d}=Math.clz32({s.reg(i,ops[1])});'
        if base in ('ldr','ldrb','ldrh','ldrsb','ldrsh','str','strb','strh','ldrd','strd'):
            return s.ldst(i, base)
        if base in ('push','pop','stm','ldm','stmdb','ldmia','stmia','ldmdb'):
            return s.ldm(i, base)
        if base in ('vpush','vpop'):
            regs = [i.reg_name(o.reg) for o in ops]
            if base == 'vpush':
                n = len(regs); c = f'sp=(sp-{8*n})|0;'
                for k,rg in enumerate(regs): c += f'M.stD(sp+{8*k},{rg[1:]});'
                return c
            c = ''
            for k,rg in enumerate(regs): c += f'M.ldD(sp+{8*k},{rg[1:]});'
            return c + f'sp=(sp+{8*len(regs)})|0;'
        if base.startswith('v'):
            return s.vfp(i, base)
        if base == 'b' or (base[0]=='b' and base[1:] in COND):
            t = ops[0].imm
            br = s.branch(t)
            if ecc != ARM_CC_AL:
                s.handles_cc = True
                return f'if({CC[ecc]}){{{br}}}'
            return br
        if base in ('cbz','cbnz'):
            r = s.reg(i, ops[0]); t = ops[1].imm
            return f'if({r}{"===" if base=="cbz" else "!=="}0){{{s.branch(t)}}}'
        if base in ('bl','blx'):
            if ops[0].type == ARM_OP_IMM:
                t = ops[0].imm
                if t in stubname:
                    return f'M.SP=sp;r0=M.stub("{stubname[t]}",r0,r1,r2,r3);r1=M.R1;'
                return s.call_expr(None, static=t|1)
            r = s.reg(i, ops[0])
            return s.call_expr(r)
        if base == 'bx':
            r = s.reg(i, ops[0])
            if r == 'lr': return s.ret()
            return f'M.SP=sp;r0=M.call({r},r0,r1,r2,r3);r1=M.R1;' + s.ret()
        if base in ('tbb','tbh'):
            tg = s.fn.tables[i.address]
            r = R(i.reg_name(ops[0].mem.index))
            return f'pc=[{",".join(map(str,tg))}][{r}];continue;'
        if base == 'trap' or base == 'udf': return 'throw new Error("trap");'
        raise Unsupported('mnemonic ' + m)
    def ldst(s, i, base):
        ops = i.operands
        load = base.startswith('ldr')
        if base in ('ldrd','strd'):
            ra, rb = s.reg(i, ops[0]), s.reg(i, ops[1]); mo = ops[2]
        else:
            ra = s.reg(i, ops[0]); rb = None; mo = ops[1]
        m = mo.mem
        bname = R(i.reg_name(m.base))
        post = bool(getattr(i, 'post_index', False))
        if bname == 'pc' and load and base == 'ldr' and not m.index:
            v = lit32(i); v = v - (1<<32) if v >= 0x80000000 else v
            return '%s=%d;' % (ra, v)
        if post:
            off = ops[-1]
            if off.type == ARM_OP_IMM: upd = '%s=(%s+%d)|0;' % (bname, bname, off.imm)
            else: upd = '%s=(%s%s%s)|0;' % (bname, bname, '-' if off.subtracted else '+', s.reg(i, off))
            pre = 't=%s;' % bname
        else:
            addr, _, _ = s.mem_addr(i, mo)
            pre = 't=%s;' % addr
            upd = ('%s=t;' % bname) if i.writeback else ''
        fns = {'ldr':'M.L','ldrb':'M.LB','ldrh':'M.LH','ldrsb':'M.LSB','ldrsh':'M.LSH','str':'M.S','strb':'M.SB','strh':'M.SH'}
        if base == 'ldrd': body = '%s=M.L(t);%s=M.L(t+4);' % (ra, rb)
        elif base == 'strd': body = 'M.S(t,%s);M.S(t+4,%s);' % (ra, rb)
        elif load:
            if ra == 'pc':
                return pre + upd + 'M.SP=sp;r0=M.call(M.L(t),r0,r1,r2,r3);r1=M.R1;' + s.ret()
            body = '%s=%s(t);' % (ra, fns[base])
        else: body = '%s(t,%s);' % (fns[base], ra)
        return pre + body + upd
    def ldm(s, i, base):
        ops = i.operands
        if base in ('push','pop'):
            regs = [R(i.reg_name(o.reg)) for o in ops]
            n = len(regs)
            if base == 'push':
                c = f'sp=(sp-{4*n})|0;'
                for k, rg in enumerate(regs): c += f'M.S(sp+{4*k},{rg});'
                return c
            c = ''; isret = False
            for k, rg in enumerate(regs):
                if rg == 'pc': isret = True
                else: c += f'{rg}=M.L(sp+{4*k});'
            c += f'sp=(sp+{4*n})|0;'
            if isret: c += s.ret()
            return c
        b = R(i.reg_name(ops[0].reg)); regs = [R(i.reg_name(o.reg)) for o in ops[1:]]
        n = len(regs)
        db = base in ('stmdb','ldmdb')
        c = f't={b}{"-"+str(4*n) if db else ""};'
        for k, rg in enumerate(regs):
            if base.startswith('ld'): c += f'{rg}=M.L(t+{4*k});'
            else: c += f'M.S(t+{4*k},{rg});'
        if i.writeback and b not in regs:
            c += f'{b}=({b}{"-" if db else "+"}{4*n})|0;'
        return c
    def fr(s, name):
        if name[0] == 's': return f'M.FS[{name[1:]}]'
        if name[0] == 'd': return f'M.FD[{name[1:]}]'
        raise Unsupported('freg ' + name)
    def vfp(s, i, base):
        ops = i.operands; mn = i.mnemonic
        names = [i.reg_name(o.reg) if o.type == ARM_OP_REG else None for o in ops]
        if base == 'vmov':
            if len(ops) == 2:
                a, b = names
                if a[0] == 'r' or a in RN:
                    if b and b[0]=='s': return f'{R(a)}=M.FI[{b[1:]}];'
                if a[0] == 's' and (b[0]=='r' or b in RN): return f'M.FI[{a[1:]}]={R(b)};'
                if a[0] in 'sd' and b and b[0] in 'sd': return f'{s.fr(a)}={s.fr(b)};'
                if ops[1].type in (ARM_OP_FP, ARM_OP_IMM):
                    v = ops[1].fp if ops[1].type == ARM_OP_FP else ops[1].imm
                    return f'{s.fr(a)}={v};'
            if len(ops) == 3:
                a, b, c = names
                if a[0] == 'd': n = int(a[1:]); return f'M.FI[{2*n}]={R(b)};M.FI[{2*n+1}]={R(c)};'
                n = int(c[1:]); return f'{R(a)}=M.FI[{2*n}];{R(b)}=M.FI[{2*n+1}];'
            raise Unsupported('vmov')
        if base in ('vldr','vstr'):
            r = names[0]; addr, _, _ = s.mem_addr(i, ops[1])
            if base == 'vldr':
                return f'M.ld{"D" if r[0]=="d" else "F"}({addr},{r[1:]});'
            return f'M.st{"D" if r[0]=="d" else "F"}({addr},{r[1:]});'
        if base == 'vcvt':
            d, sreg = names
            # tipos de mn: vcvt.f64.s32, vcvt.s32.f64, vcvt.f32.s32, vcvt.f64.f32, vcvt.f32.f64, vcvt.u32..
            parts = mn.split('.')
            dt, st = parts[1], parts[2]
            if st in ('s32','u32'):
                src = f'M.FI[{sreg[1:]}]' + ('>>>0' if st=='u32' else '')
                return f'{s.fr(d)}={src};'
            if dt in ('s32','u32'):
                return f'M.FI[{d[1:]}]=M.cvt{"S" if dt=="s32" else "U"}({s.fr(sreg)});'
            return f'{s.fr(d)}={s.fr(sreg)};'
        if base in ('vmul','vdiv','vadd','vsub'):
            if len(names) == 2: d, a, b = names[0], names[0], names[1]
            else: d, a, b = names
            op = {'vmul':'*','vdiv':'/','vadd':'+','vsub':'-'}[base]
            return f'{s.fr(d)}={s.fr(a)}{op}{s.fr(b)};'
        if base in ('vneg','vabs','vsqrt'):
            d, a = names; f = {'vneg':'-','vabs':'Math.abs','vsqrt':'Math.sqrt'}[base]
            return f'{s.fr(d)}={f}({s.fr(a)});'
        if base in ('vcmpe','vcmp'):
            a = s.fr(names[0])
            b = s.fr(names[1]) if len(ops)>1 and names[1] else '0'
            return f'M.fcmp({a},{b});'
        if base == 'vmrs':
            return 'N=M.FN;Z=M.FZ;C=M.FC;V=M.FV;'
        raise Unsupported('vfp ' + mn)
SFLAG = {'mov','mvn','add','sub','rsb','adc','sbc','and','orr','eor','bic','orn','lsl','lsr','asr','ror','mul'}
KNOWN = SFLAG | {'cmp','cmn','tst','teq','ldr','ldrb','ldrh','ldrsb','ldrsh','str','strb','strh','ldrd','strd','pop','push','movw','movt','b','bl','blx','bx','movs','adds','subs','lsls','lsrs','asrs','ands','orrs','eors','mla','vmov','vmrs','addw','subw'}

def compile_funcs(entries, compiled_set, hle_names):
    """entries: lista de (addr, end). devuelve js y lista de errores"""
    def callmap(t):
        a = t & ~1
        if a in compiled_set: return f'f_{a:x}'
        return None
    out = []; errs = []
    for a, end in entries:
        f = Fn(a, end)
        try:
            f.discover()
            out.append(Gen(f, callmap).gen())
        except Unsupported as e:
            errs.append(f'{a:x} {name_of(a)}: {e}')
    return out, errs
def fend(a):
    i = bisect.bisect_right(sorted_syms, a)
    return sorted_syms[i] if i < len(sorted_syms) else a + 0x1000

ENGINE_FUNCS = ['GameSequence::calculateNextCharacterFrameID(unsigned int, unsigned int)', 'GameSequence::getActiveControlValue()',
 'GameSequence::getArcFrameNextTick(unsigned int)', 'GameSequence::getCharacterColorElement(unsigned int, int, int)',
 'GameSequence::getImageEnabled(unsigned int)', 'GameSequence::getImagePosX(unsigned int)', 'GameSequence::getImagePosY(unsigned int)',
 'GameSequence::getZOrder(unsigned int)', 'GameSequence::remapCharacterColor(unsigned int, int, int)', 'GameSequence::resetCharacterColor(unsigned int, int)',
 'GameSequence::resetCharacterPalette(unsigned int)', 'GameSequence::resetImagePos(unsigned int)', 'GameSequence::setActiveControlValue(int, bool)',
 'GameSequence::setCharacterColor(unsigned int, int, int, int, int)', 'GameSequence::setImageEnabled(unsigned int, bool)',
 'GameSequence::setImagePosX(unsigned int, int)', 'GameSequence::setImagePosY(unsigned int, int)', 'GameSequence::setZOrder(unsigned int, int)',
 'GameSequence::swapCharacterColor(unsigned int, int, int)', 'GameSequence::updateState(GameState*)']
HLE_PREFIX = ('ScreenManager::','SoundManager::','ResourceManager::','PlayerState::','InputManager::','Palette::','GameAdapter::print','GameAdapter::logEvent','GameAdapter::~GameAdapter')

def build_modules(jsdir, modules=None, log=print):
    """Recompila los modulos GameLogicXX (o los indicados) + motor a jsdir/recomp/*.js; escribe memimg.js y hlemap.js."""
    import base64
    os.makedirs(os.path.join(jsdir, 'recomp'), exist_ok=True)
    groups = {}
    for m in _bn.order:
        if m.startswith('GameLogic'):
            g = m[:-2]
            if modules and g not in modules: continue
            groups[g] = [(a, fend(a)) for a in sorted(set(x for x, n in _bn.mods[m] if x < _bn.text_end))]
    eng = []
    for a, d in _bn.dsym.items():
        if a >= _bn.text_end: continue
        if (d.startswith('GameAdapter::') and not any(h in d for h in ('logEvent', 'print', '~'))) or d in ENGINE_FUNCS:
            eng.append(a)
    groups['engine'] = [(a, fend(a)) for a in sorted(set(eng))]
    total = 0
    for g, ents in groups.items():
        cset = set(a for a, _ in ents)
        js, errs = compile_funcs(ents, cset, {})
        if errs: raise SystemExit('Errores de recompilacion en %s:\n%s' % (g, '\n'.join(errs[:20])))
        names = '\n'.join(f'  0x{a|1:x}:f_{a:x},' for a, _ in ents)
        body = (f'// The Act - recomp Thumb-2 -> JS - modulo {g}\n// Generado automaticamente desde el binario armv7 (iOS 2012). No editar.\n'
                f'(self.ACT_RECOMP=self.ACT_RECOMP||{{}})["{g}"]=function(M){{"use strict";\n' + '\n'.join(js) + f'\nreturn {{\n{names}\n}};}};\n')
        open(os.path.join(jsdir, 'recomp', g + '.js'), 'w').write(body)
        total += len(js)
    log(f'  recompiladas {total} funciones en {len(groups)} modulos')
    # imagen de memoria (__const/__cstring/__DATA)
    LO = min(s.virtual_address for s in _bn.B.sections if s.name in ('__cstring', '__const') and s.segment_name == '__TEXT') & ~0xfff
    HI = max(s.virtual_address + s.size for s in _bn.B.sections if s.segment_name == '__DATA')
    HI = (HI + 0xfff) & ~0xfff
    img = bytearray(HI - LO)
    for s in _bn.B.sections:
        if s.virtual_address + s.size <= LO or s.virtual_address >= HI or s.name in ('__bss', '__common'): continue
        c = bytes(s.content); img[s.virtual_address - LO:s.virtual_address - LO + len(c)] = c
    open(os.path.join(jsdir, 'memimg.js'), 'w').write(
        f'// imagen de memoria del binario armv7 (datos estaticos)\nself.ACT_MEMIMG={{base:0x{LO:x},size:{len(img)},raw:"{base64.b64encode(bytes(img)).decode()}"}};\n')
    if HI > 0x2f0000: raise SystemExit('imagen de memoria demasiado grande para el layout de la VM')
    # direcciones HLE + constantes
    hm = {}
    for a, d in _bn.dsym.items():
        if 0x1000 < a < _bn.text_end and any(d.startswith(w) for w in HLE_PREFIX): hm.setdefault(d, a | 1)
    consts = dict(UPDATE_STATE=_bn.addr_of('GameSequence::updateState(GameState*)') | 1,
                  VT_GAMESEQ=_bn.vtable('GameSequence'), VT_ADAPTER=_bn.vtable('GameAdapter'),
                  SET_ACTIVE_CTL=_bn.addr_of('GameSequence::setActiveControlValue(int, bool)') | 1)
    open(os.path.join(jsdir, 'hlemap.js'), 'w').write(
        '// direcciones del binario para el runtime HLE (generado)\nself.ACT_HLEMAP=' + json.dumps(hm) + ';\nself.ACT_CONST=' + json.dumps(consts) +
        ';\nself.ACT_INPUTCB=' + json.dumps(_bn.input_callbacks()) + ';\n')
    return list(groups)
