# actlib.binary - analisis del Mach-O armv7 de The Act (iOS) con lief + capstone
import lief, struct, bisect, json, os, re, subprocess, shutil, hashlib
from capstone import *
from capstone.arm import *

FAT = None; B = None; sym = {}; dsym = {}; mods = {}; order = []
lazy = {}; stubname = {}; sorted_addrs = []; text_end = 0
cs_t = Cs(CS_ARCH_ARM, CS_MODE_THUMB); cs_t.detail = True
_cstr = None

def init(binary_path, log=print):
    """Carga el binario y prepara tablas de simbolos (debe llamarse antes de importar recomp/pack)."""
    global FAT, B, sym, dsym, mods, order, lazy, stubname, sorted_addrs, text_end, _cstr
    fat = FAT = lief.MachO.parse(binary_path)
    B = None
    for b in fat:
        if b.header.cpu_type == lief.MachO.Header.CPU_TYPE.ARM and int(b.header.cpu_subtype) == 9:  # armv7
            B = b
    if B is None: B = fat.at(fat.size - 1)
    for c in B.commands:
        if 'ENCRYPTION' in str(c.command) and getattr(c, 'crypt_id', 0):
            raise SystemExit('El binario esta cifrado (FairPlay cryptid=1). Se necesita un IPA descifrado.')
    text_end = B.get_section('__text').virtual_address + B.get_section('__text').size
    # simbolos agrupados por objeto .o (stabs N_OSO)
    cur = None; sym = {}; mods = {}; order = []
    for s in B.symbols:
        n = s.name
        if n.endswith('.o'):
            cur = n.split('/')[-1]; mods.setdefault(cur, []); order.append(cur); continue
        if n and s.value:
            sym.setdefault(s.value, n)
            if cur: mods[cur].append((s.value, n))
    sorted_addrs = sorted(sym)
    # demangling: tabla precalculada (para 1.01) y c++filt como respaldo
    table = {}
    tp = os.path.join(os.path.dirname(__file__), 'symbols_demangled.json')
    if os.path.exists(tp): table = json.load(open(tp, encoding='utf-8'))
    missing = [n for n in set(sym.values()) if n not in table]
    if missing and shutil.which('c++filt'):
        out = subprocess.run(['c++filt', '-_'], input='\n'.join(missing), capture_output=True, text=True).stdout.split('\n')
        for a, b in zip(missing, out): table[a] = b
    dsym = {a: table.get(n, n.lstrip('_')) for a, n in sym.items()}
    # stubs -> nombres de simbolos importados
    lazy = {}
    if B.has_dyld_info:
        for bi in B.dyld_info.bindings:
            try: lazy[bi.address] = bi.symbol.name
            except Exception: pass
    sec = B.get_section('__symbolstub1'); stubname = {}
    for a in range(sec.virtual_address, sec.virtual_address + sec.size, 4):
        w = u32(a)
        if (w & 0xfffff000) == 0xe59ff000:
            ptr = a + 8 + (w & 0xfff); stubname[a] = lazy.get(ptr, '?ptr_%x' % ptr)
    _cstr = B.get_section('__cstring')
    log(f'  binario armv7: {len(sym)} simbolos, {len(order)} objetos, {len(missing)} sin demangle de tabla')
    return B

def rd(addr, n): return bytes(B.get_content_from_virtual_address(addr, n))
def u32(a): return struct.unpack('<I', rd(a, 4))[0]
def name_of(a): return dsym.get(a) or dsym.get(a & ~1)
def cstring_at(a):
    if a and _cstr.virtual_address <= a < _cstr.virtual_address + _cstr.size:
        return rd(a, 160).split(b'\0')[0].decode('latin1')
    return None
def find(part): return [(a, d) for a, d in dsym.items() if part in d]
def addr_of(demangled):
    for a, d in dsym.items():
        if d == demangled: return a
    return None
def theGames():
    """{ 'GameLogic02': addr_theGame, ... }"""
    return {d.split('::')[0]: a for a, d in dsym.items() if d.endswith('::theGame') and d.startswith('GameLogic')}
def input_callbacks():
    return {d.split('::')[0]: a | 1 for a, d in dsym.items() if d.startswith('GameLogic') and '::UF_InputEventCallback(' in d}
def vtable(cls):
    for a, d in dsym.items():
        if d == f'vtable for {cls}': return a + 8
    return None
def file_sha1(p):
    h = hashlib.sha1(); f = open(p, 'rb')
    for blk in iter(lambda: f.read(1 << 20), b''): h.update(blk)
    return h.hexdigest()
