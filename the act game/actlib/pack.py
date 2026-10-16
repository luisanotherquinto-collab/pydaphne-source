# actlib.pack - empaqueta escenas "Game", peliculas, menus, historias y UI para el runtime web
import os, re, json, struct, base64, shutil, subprocess, posixpath
from . import binary as bn
from . import rl2 as RL

APP = None      # ruta a "The Act.app"
FFMPEG = shutil.which('ffmpeg')

def resolve(path):
    """Resuelve symlinks aplanados (archivo de texto con ruta relativa '../..')."""
    # siempre con '/' (en Windows os.path usa '\\' y rompia los nombres de .pak y las URLs)
    parts = path.replace('\\', '/').split('/'); cur = ''
    for p in parts:
        cur = posixpath.join(cur, p) if cur else p
        full = os.path.join(APP, *cur.split('/'))
        if os.path.isfile(full) and os.path.getsize(full) < 200:
            with open(full, 'rb') as fh: head = fh.read(3)
            if head == b'../':
                tgt = open(full, encoding='latin1').read().strip().replace('\\', '/')
                cur = posixpath.normpath(posixpath.join(posixpath.dirname(cur), tgt))
    return cur

def _run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.returncode == 0

def audio(src, out_noext):
    """wav -> flac (sin perdida, exacto a la muestra). Sin ffmpeg: copia el wav. Devuelve ruta escrita."""
    if FFMPEG:
        dst = out_noext + '.flac'
        if os.path.exists(dst) or _run([FFMPEG, '-v', 'error', '-y', '-i', src, '-c:a', 'flac', '-compression_level', '8', dst]): return dst
    dst = out_noext + '.wav'; shutil.copyfile(src, dst); return dst

def wav_samples(path):
    with open(path, 'rb') as f: d = f.read()
    p = 12; ch = 1; bits = 16
    while p + 8 <= len(d):
        cid, sz = d[p:p+4], struct.unpack_from('<I', d, p+4)[0]
        if cid == b'fmt ': ch = struct.unpack_from('<H', d, p+10)[0]; bits = struct.unpack_from('<H', d, p+22)[0]
        if cid == b'data': return min(sz, len(d) - p - 8) // (ch * bits // 8)
        p += 8 + sz + (sz & 1)
    return 0

def movie(src, dst_noext):
    """.mov H.264/AAC -> .mp4 (remux sin recomprimir). Sin ffmpeg: copia el .mov."""
    if FFMPEG:
        dst = dst_noext + '.mp4'
        if os.path.exists(dst) or _run([FFMPEG, '-v', 'error', '-y', '-i', src, '-map', '0:v:0', '-map', '0:a?', '-c', 'copy', '-movflags', '+faststart', dst]): return dst
    dst = dst_noext + '.mov'; shutil.copyfile(src, dst); return dst

def pack_scene(seqdir, game_addr, module, OUT, log=print):
    from PIL import Image
    import numpy as np
    u32, cstr = bn.u32, bn.cstring_at
    gs = game_addr
    nbg, bgp = u32(gs+4), u32(gs+8)
    nch, chp = u32(gs+0x14), u32(gs+0x18)
    nsnd, sndp = u32(gs+0x1c), u32(gs+0x20)
    sd = os.path.join(OUT, seqdir); os.makedirs(sd, exist_ok=True)
    resources, paks = [], {}
    def add_rle(chdir, name):
        art = resolve(f'{seqdir}/characters/{chdir}/artwork')
        rel = art + '/' + name[:-1] + '2'
        full = os.path.join(APP, *rel.split('/'))
        if not os.path.isfile(full): return -1
        for i, r in enumerate(resources):
            if r.get('src') == rel: return i
        data = open(full, 'rb').read()
        pk = re.sub(r'[\\/:]+', '_', art)
        buf = paks.setdefault(pk, bytearray()); off = len(buf); buf += data
        resources.append(dict(kind='rle', src=rel, pak=pk, off=off, len=len(data), frames=struct.unpack_from('<H', data, 0)[0]))
        return len(resources) - 1
    chars = []
    for c in range(nch):
        cd = u32(chp + 4*c); name = cstr(u32(cd)); lc = name.lower()
        chdir = lc if os.path.exists(os.path.join(APP, seqdir, 'characters', lc)) else name
        nn, np_, na, ap = u32(cd+0x10), u32(cd+0x14), u32(cd+0x18), u32(cd+0x1c)
        node_res = [add_rle(chdir, cstr(u32(np_+12*i))) for i in range(nn)]
        arc_res = [add_rle(chdir, cstr(u32(ap+28*i))) if u32(ap+28*i+0x18) else -1 for i in range(na)]
        artdir = resolve(f'{seqdir}/characters/{chdir}/artwork')
        palf = os.path.join(APP, *artdir.split('/'), f'{lc}.rlect')
        if not os.path.isfile(palf): palf = os.path.join(APP, seqdir, 'artwork', cstr(u32(gs)))
        resources.append(dict(kind='pal', data=base64.b64encode(open(palf, 'rb').read()).decode()))
        chars.append(dict(name=name, nodes=node_res, arcs=arc_res, pal=len(resources)-1, fps=os.path.exists(os.path.join(APP, *artdir.split('/'), 'fps'))))
    art = os.path.join(APP, seqdir, 'artwork')
    gpal = os.path.join(art, cstr(u32(gs)))
    resources.append(dict(kind='pal', data=base64.b64encode(open(gpal, 'rb').read()).decode())); gpal_res = len(resources)-1
    # fondos: png/bmp, frames de bgs.pk4 (orden por list.txt o por sufijo numerico) o .rl2 estatico
    pk4 = os.path.join(art, 'bgs.pk4'); pklist = None; pkdata = None
    if os.path.isfile(pk4):
        lt = os.path.join(art, 'list.txt')
        pklist = [l.strip() for l in open(lt) if l.strip()] if os.path.isfile(lt) else 'bynum'
        pkdata = open(pk4, 'rb').read(); npk, pw, ph = struct.unpack_from('<III', pkdata, 0)
    gpal_np = np.frombuffer(open(gpal, 'rb').read(), np.uint8).reshape(256, 4)[:, 2::-1]
    bgs = []
    for i in range(nbg):
        b = bgp + 16*i; nm = cstr(u32(b)); base = nm[:-3]; out = None
        for ext in ('png', 'bmp'):
            p = os.path.join(art, base + ext)
            if os.path.isfile(p):
                out = f'{seqdir}/bg_{i:03d}.png'; Image.open(p).convert('RGBA').save(os.path.join(OUT, out), optimize=True); break
        k = None
        if out is None and pklist:
            if pklist != 'bynum' and (base + 'bmp') in pklist: k = pklist.index(base + 'bmp')
            else:  # sin list.txt, o list.txt incompleta (18a lista 90 de 96): orden por sufijo numerico
                mm = re.search(r'_(\d+)\.$', base)
                if mm and int(mm.group(1)) < npk: k = int(mm.group(1))
        if k is not None:
            off = 12 + k * (1024 + pw*ph)
            pal = np.frombuffer(pkdata, np.uint8, 1024, off).reshape(256, 4)[:, 2::-1]
            idx = np.frombuffer(pkdata, np.uint8, pw*ph, off + 1024).reshape(ph, pw)
            out = f'{seqdir}/bg_{i:03d}.jpg'; Image.fromarray(pal[idx], 'RGB').save(os.path.join(OUT, out), quality=86)
        if out is None and os.path.isfile(os.path.join(art, base + 'rl2')):
            d = open(os.path.join(art, base + 'rl2'), 'rb').read(); cm, frs, _ = RL.parse(d); f0 = frs[0]; ix = RL.decode(d, f0, cm)
            rgba = np.zeros((480, 640, 4), np.uint8); sub = np.zeros((f0['h'], f0['w'], 4), np.uint8)
            sub[..., :3] = gpal_np[ix]; sub[..., 3] = np.where(ix == 255, 0, 255)
            rgba[f0['y']:f0['y']+f0['h'], f0['x']:f0['x']+f0['w']] = sub
            out = f'{seqdir}/bg_{i:03d}.png'; Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, out), optimize=True)
        if out is None: log(f'    aviso: fondo no encontrado {nm}')
        bgs.append(dict(file=out, x=u32(b+4), y=u32(b+8), flag=u32(b+12)))
    sounds = []
    os.makedirs(os.path.join(sd, 'audio'), exist_ok=True)
    for i in range(nsnd):
        nm = cstr(u32(sndp + 4*i)); src = os.path.join(APP, seqdir, 'audio', nm)
        safe = re.sub(r'[^A-Za-z0-9_.-]', '_', nm[:-4])
        dst = audio(src, os.path.join(sd, 'audio', safe))
        resources.append(dict(kind='snd', file=os.path.relpath(dst, OUT).replace('\\', '/'), samples=wav_samples(src)))
        sounds.append(len(resources)-1)
    for pk, buf in paks.items(): open(os.path.join(sd, pk + '.pak'), 'wb').write(buf)
    man = dict(seq=seqdir, module=module, game=game_addr, chars=chars, resources=resources, gpal=gpal_res, bgs=bgs, sounds=sounds,
               paks={pk: f'{seqdir}/{pk}.pak' for pk in paks})
    json.dump(man, open(os.path.join(sd, 'manifest.json'), 'w'))
    log(f'    {seqdir}: {nch} personajes, {len(resources)} recursos, {sum(len(b) for b in paks.values())/1e6:.1f} MB de animacion')

def render_slate(OUT):
    """Claqueta 'PLAY NOW' a PNG (frame final de la animacion de entrada) para la pantalla de instrucciones."""
    from PIL import Image
    import numpy as np
    art = os.path.join(APP, 'master_slate', 'artwork')
    d = open(os.path.join(art, 'GP100_A1008.rl2'), 'rb').read(); cm, frs, _ = RL.parse(d)
    # frame 20: claqueta derecha con 'PLAY NOW' (pose de la pantalla de instrucciones del arcade)
    f = frs[20] if len(frs) > 20 else max(frs, key=lambda fr: fr['w'] * fr['h']); ix = RL.decode(d, f, cm)
    pal = np.frombuffer(open(os.path.join(art, 'slate.rlect'), 'rb').read(), np.uint8).reshape(256, 4)[:, 2::-1]
    rgba = np.zeros((f['h'], f['w'], 4), np.uint8); rgba[..., :3] = pal[ix]; rgba[..., 3] = np.where(ix == 255, 0, 255)
    Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, 'ui', 'slate.png'))

def menus(OUT, lang='en'):
    """Parsea los XML de menus (pistas de rewind) -> dict; copia imagenes."""
    from PIL import Image
    res = {}
    for root, _, files in os.walk(APP):
        for fn in files:
            if not fn.endswith('_menu.xml') or 'user_interface' in root: continue
            x = open(os.path.join(root, fn), encoding='latin1').read(); rd = os.path.relpath(root, APP).replace('\\', '/')
            for m in re.finditer(r'<menusequence\s+name="([^"]+)"\s+background="([^"]*)"\s+num_frames="(\d+)"(.*?)</menusequence>', x, re.S):
                name, bgf, frames, body = m.groups()
                im = re.search(r'imageLocalizedSelected="([^"]+)"', body)
                ent = dict(frames=int(frames))
                if bgf:
                    s = posixpath.normpath(posixpath.join(rd, bgf.replace('\\', '/'))); _copy(s, OUT); ent['background'] = s
                if im:
                    p = posixpath.normpath(posixpath.join(rd, im.group(1).replace('\\', '/')))
                    dn, bnm = posixpath.dirname(p), posixpath.basename(p)
                    for lg in (lang, 'en'):
                        cand = f'{dn}/{lg}/{bnm}'
                        if os.path.isfile(os.path.join(APP, cand)): _copy(cand, OUT); ent['image'] = cand; break
                res[name] = ent
    return res

def _copy(rel, OUT):
    s = os.path.join(APP, *rel.split('/')); d = os.path.join(OUT, *rel.split('/'))
    if os.path.isfile(s) and not os.path.exists(d):
        os.makedirs(os.path.dirname(d), exist_ok=True); shutil.copyfile(s, d)

def ui(OUT, lang='en'):
    from PIL import Image
    os.makedirs(os.path.join(OUT, 'ui'), exist_ok=True)
    render_slate(OUT)
    scr = os.path.join(APP, 'the_act_screens')
    for fn in ('tryagain_background.png', 'tryagain_message_on.gif', 'tryagain_message_off.gif', 'game_summary_background.png', 'game_summary_message_1.png'):
        for lg in (lang, 'en'):
            p = os.path.join(scr, lg, fn)
            if os.path.isfile(p):
                Image.open(p).convert('RGBA').save(os.path.join(OUT, 'ui', fn.rsplit('.', 1)[0] + '.png')); break
    btn = os.path.join(APP, 'user_interface', 'audio', 'button-28.wav')
    if os.path.isfile(btn): audio(btn, os.path.join(OUT, 'ui', 'coin'))
