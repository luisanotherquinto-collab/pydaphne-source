#!/usr/bin/env python3
"""
The Act - build script del recomp (HTML5 mobile + PC estilo arcade)

Toma el juego original (los RAR de 2 partes, el .ipa, o la carpeta "The Act.app"),
recompila la logica ARM a JavaScript, convierte los assets y arma builds jugables.

Ejemplos:
  python build_act.py The_Act_1_01_part1.rar                    # todos los niveles juntos
  python build_act.py The_Act_1_01_part1.rar --mode separate    # una carpeta por nivel
  python build_act.py The_Act_1_01_part1.rar --mode both --zip  # juntos + separados, en zip
  python build_act.py juego.ipa --levels 02,04,18               # solo esos niveles
  python build_act.py "The Act.app" --exclude 18c,18p,21        # todos menos esos
  python build_act.py The_Act_1_01_part1.rar --list             # ver niveles disponibles

Requisitos: Python 3.9+, pip install lief capstone pillow numpy
Opcional:   ffmpeg (FLAC + MP4 mas livianos), 7-Zip o unrar (para abrir los .rar)
"""
import os, sys, re, json, shutil, argparse, zipfile, subprocess, glob, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

LEVEL_NAMES = {'02': 'Daydreaming (Sylvia)', '04': 'Boss Fight', '06': 'Doctors Laugh', '12': 'Roxy Heart', '14': 'Coffee',
               '16': 'Heimlich', '18': 'Chase (6 pasillos)', '21': 'Apology'}

def log(*a): print(*a, flush=True)

# ----------------------------------------------------------------------------- entrada
def find_7z():
    found = []
    for c in ('7zz', '7z', '7za', 'unrar', 'unar'):
        p = shutil.which(c)
        if p: found.append(p)
    for p in (r'C:\Program Files\7-Zip\7z.exe', r'C:\Program Files (x86)\7-Zip\7z.exe', r'C:\Program Files\WinRAR\UnRAR.exe',
              '/Applications/Keka.app/Contents/Resources/keka7z', '/opt/homebrew/bin/7zz', '/usr/local/bin/7zz'):
        if os.path.isfile(p): found.append(p)
    return found

def extract_rar(rar, dest):
    os.makedirs(dest, exist_ok=True)
    for tool in find_7z():
        log(f'  extrayendo {os.path.basename(rar)} con {os.path.basename(tool)} (lee la parte 2 automaticamente)')
        low = os.path.basename(tool).lower()
        if 'unrar' in low: cmd = [tool, 'x', '-y', rar, dest + os.sep]
        elif low.startswith('unar'): cmd = [tool, '-f', '-o', dest, rar]
        else: cmd = [tool, 'x', '-y', f'-o{dest}', rar]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode == 0 and glob.glob(os.path.join(dest, '**', '*.ipa'), recursive=True): return
        log('    este extractor no pudo (probando otro)')
    try:
        import rarfile
        rarfile.RarFile(rar).extractall(dest); return
    except Exception as e:
        pass
    raise SystemExit('No pude abrir el RAR. Instala 7-Zip (https://7-zip.org) o extrae el .ipa a mano y pasalo como entrada.\n'
                     '(Los RAR de 2 partes deben estar en la misma carpeta: part1 + part2.)')

def extract_ipa(ipa, dest):
    log(f'  extrayendo {os.path.basename(ipa)}')
    with zipfile.ZipFile(ipa) as z:
        for info in z.infolist():
            if not info.filename.startswith('Payload/') or info.is_dir(): continue
            out = os.path.join(dest, *info.filename.split('/'))
            os.makedirs(os.path.dirname(out), exist_ok=True)
            with z.open(info) as src, open(out, 'wb') as dst:
                src._expected_crc = None   # algunos IPA traen CRC malos: conservar los datos completos
                n = 0
                for blk in iter(lambda: src.read(1 << 20), b''): dst.write(blk); n += len(blk)
                if n != info.file_size: log(f'    aviso: {info.filename} incompleto ({n}/{info.file_size} bytes)')

def find_app(inputs, work):
    for inp in inputs:
        inp = os.path.abspath(inp)
        if os.path.isdir(inp):
            if inp.endswith('.app') and os.path.isfile(os.path.join(inp, 'The Act')): return inp
            hits = glob.glob(os.path.join(inp, '**', '*.app'), recursive=True)
            for h in hits:
                if os.path.isfile(os.path.join(h, 'The Act')): return h
            ipas = glob.glob(os.path.join(inp, '**', '*.ipa'), recursive=True)
            if ipas: inputs = list(inputs) + ipas
    for inp in inputs:
        low = inp.lower()
        if low.endswith('.ipa'):
            d = os.path.join(work, 'ipa'); extract_ipa(inp, d); return find_app([d], work)
        if low.endswith('.rar'):
            if re.search(r'part0*([2-9]|\d\d)\.rar$', low):
                p1 = re.sub(r'part0*\d+\.rar$', 'part1.rar', inp, flags=re.I)
                if os.path.exists(p1): inp = p1
            d = os.path.join(work, 'rar')
            if not glob.glob(os.path.join(d, '**', '*.ipa'), recursive=True): extract_rar(inp, d)
            ipas = glob.glob(os.path.join(d, '**', '*.ipa'), recursive=True)
            if ipas: return find_app([ipas[0]], work)
            return find_app([d], work)
    raise SystemExit('No encontre "The Act.app" en la entrada. Pasa los .rar, el .ipa o la carpeta del juego.')

# ----------------------------------------------------------------------------- utilidades
def link_or_copy(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.exists(dst): return
    try: os.link(src, dst)
    except Exception: shutil.copyfile(src, dst)

def copy_tree(src, dst, hard=True):
    for root, _, files in os.walk(src):
        for f in files:
            s = os.path.join(root, f); d = os.path.join(dst, os.path.relpath(s, src))
            if hard: link_or_copy(s, d)
            else: os.makedirs(os.path.dirname(d), exist_ok=True); shutil.copyfile(s, d)

def dir_size(p):
    return sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(p) for f in fs)

def zipdir(src, zpath):
    log(f'  comprimiendo {os.path.basename(zpath)}')
    with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_STORED, allowZip64=True) as z:
        for root, _, files in os.walk(src):
            for f in files:
                p = os.path.join(root, f)
                arc = os.path.join(os.path.basename(src), os.path.relpath(p, src))
                comp = zipfile.ZIP_DEFLATED if f.endswith(('.js', '.json', '.html', '.story', '.txt', '.py', '.bat', '.sh', '.command', '.pak')) else zipfile.ZIP_STORED
                z.write(p, arc, compress_type=comp)

# ----------------------------------------------------------------------------- build
def main():
    ap = argparse.ArgumentParser(description='Build del recomp de The Act (HTML5 mobile + PC arcade)')
    ap.add_argument('inputs', nargs='+', help='The_Act_1_01_part1.rar (+part2 en la misma carpeta), .ipa o carpeta "The Act.app"')
    ap.add_argument('--out', default='builds', help='carpeta de salida (por defecto ./builds)')
    ap.add_argument('--work', default=None, help='carpeta de trabajo/cache (por defecto <out>/_cache)')
    ap.add_argument('--mode', choices=['together', 'separate', 'both'], default='together', help='juntos, separados o ambos')
    ap.add_argument('--levels', default='', help='lista de niveles a incluir, ej. 02,04,18 (por defecto todos)')
    ap.add_argument('--exclude', default='', help='niveles o sub-niveles a excluir, ej. 18c,21')
    ap.add_argument('--lang', default='en', help='idioma de textos/pistas: en, es, fr, de, it, pt, nl, ja, ko, zh-Hans')
    ap.add_argument('--no-cinematics', action='store_true', help='no incluir peliculas narrativas (solo juego)')
    ap.add_argument('--zip', action='store_true', help='crear un .zip por build')
    ap.add_argument('--list', action='store_true', help='solo listar niveles disponibles')
    a = ap.parse_args()

    t0 = time.time()
    out = os.path.abspath(a.out); work = os.path.abspath(a.work or os.path.join(out, '_cache'))
    os.makedirs(work, exist_ok=True)
    log('[1/6] Buscando el juego...')
    app = find_app(a.inputs, work)
    log(f'  app: {app}')
    from actlib import binary
    log('[2/6] Analizando binario armv7...')
    binary.init(os.path.join(app, 'The Act'), log=log)
    from actlib import recomp, pack, stories
    pack.APP = app
    main_st = stories.Story(os.path.join(app, 'the_act_sequencestructure'), app)
    subs = {}
    for sid in main_st.order:
        d = main_st.defs[sid]
        if d['type'] == 'Story':
            subs[sid] = stories.Story(os.path.join(app, d['dir'], d['file']), app)
    levels = [s for s in main_st.order if main_st.defs[s]['type'] in ('Game', 'Story')]
    sublevels = {sid: [k for k in st.order if st.defs[k]['type'] == 'Game'] for sid, st in subs.items()}
    if os.sep != '/': log('  (Windows: rutas internas normalizadas a "/")')
    if a.list:
        log('\nNiveles disponibles:')
        for l in levels:
            log(f'  {l:4s} {LEVEL_NAMES.get(l, main_st.defs[l]["title"])}' + (f'   sub-niveles: {", ".join(sublevels[l])}' if l in sublevels else ''))
        return
    want = [x.strip() for x in a.levels.split(',') if x.strip()] or list(levels)
    excl = set(x.strip() for x in a.exclude.split(',') if x.strip())
    sel = [l for l in levels if l in want and l not in excl]
    sub_sel = {sid: [g for g in gs if g not in excl] for sid, gs in sublevels.items()}
    for sid in list(sel):
        if sid in sub_sel and not sub_sel[sid]: sel.remove(sid)
    if not sel: raise SystemExit('No quedo ningun nivel seleccionado.')
    log(f'  niveles: {", ".join(sel)}' + ''.join(f'  ({k}: {", ".join(v)})' for k, v in sub_sel.items() if k in sel))

    games = binary.theGames()
    def seqdir_of(st, gid): return st.defs[gid]['dir']
    def module_of(seqdir): return 'GameLogic' + seqdir.replace('the_act_seq', '')
    # escenas necesarias
    scene_dirs = []
    for l in sel:
        if l in subs: scene_dirs += [seqdir_of(subs[l], g) for g in sub_sel[l]]
        else: scene_dirs.append(seqdir_of(main_st, l))
    modules = sorted(set(module_of(s) for s in scene_dirs))

    cache_js = os.path.join(work, 'js'); cache_data = os.path.join(work, 'data')
    log('[3/6] Recompilando logica ARM -> JavaScript...')
    recomp.build_modules(cache_js, None, log=log)
    log('[4/6] Empaquetando escenas...')
    for sd in scene_dirs:
        if os.path.exists(os.path.join(cache_data, sd, 'manifest.json')): log(f'    {sd}: en cache'); continue
        mod = module_of(sd)
        if mod not in games: log(f'    aviso: {mod} sin theGame, se omite'); continue
        pack.pack_scene(sd, games[mod], mod, cache_data, log=log)
    log('[5/6] Peliculas, menus, historias e interfaz...')
    pack.ui(cache_data, a.lang)
    menus = pack.menus(cache_data, a.lang)
    os.makedirs(os.path.join(cache_data, 'story'), exist_ok=True)
    shutil.copyfile(main_st.path, os.path.join(cache_data, 'story', 'main.story'))
    for sid, st in subs.items(): shutil.copyfile(st.path, os.path.join(cache_data, 'story', main_st.defs[sid]['file']))
    media_dir = os.path.join(cache_data, 'media')
    def movie_file(st, mid):
        key = st.movie_key(st.defs[mid]); src = os.path.join(app, key)
        if not os.path.isfile(src): return None
        dst_noext = os.path.join(media_dir, *os.path.splitext(key)[0].split('/'))
        os.makedirs(os.path.dirname(dst_noext), exist_ok=True)
        for ext in ('.mp4', '.mov'):
            if os.path.exists(dst_noext + ext): return os.path.relpath(dst_noext + ext, media_dir).replace('\\', '/')
        return os.path.relpath(pack.movie(src, dst_noext), media_dir).replace('\\', '/')
    extra_media = {}
    for nm, rel in (('attract', 'the_act_attractmode/attractmode_01.mov'), ('credits', 'the_act_credits/credits.mov')):
        if os.path.isfile(os.path.join(app, rel)):
            dn = os.path.join(media_dir, *os.path.splitext(rel)[0].split('/')); os.makedirs(os.path.dirname(dn), exist_ok=True)
            got = [dn + e for e in ('.mp4', '.mov') if os.path.exists(dn + e)]
            extra_media[nm] = os.path.relpath(got[0] if got else pack.movie(os.path.join(app, rel), dn), media_dir).replace('\\', '/')
    coin = [f for f in ('ui/coin.flac', 'ui/coin.wav') if os.path.exists(os.path.join(cache_data, f))]

    # ---- conjuntos de secuencias por nivel
    def level_movies(l):
        """{ 'story|id': archivo } para un nivel (pierde/pistas, y en sub-historias todo lo suyo)."""
        res = {}
        if l in subs:
            st = subs[l]; fname = main_st.defs[l]['file']
            for g in sub_sel[l]:
                ids = set(st.lose_set(g)); w = st.win_target(g)
                if w: ids.add(w)
                for mid in ids:
                    if st.defs.get(mid, {}).get('type') == 'Movie':
                        f = movie_file(st, mid)
                        if f: res[f'{fname}|{mid}'] = f
        else:
            for mid in main_st.lose_set(l):
                if main_st.defs[mid]['type'] == 'Movie':
                    f = movie_file(main_st, mid)
                    if f: res[f'main.story|{mid}'] = f
        return res
    def narrative_movies():
        res = {}
        for mid in main_st.order:
            d = main_st.defs[mid]
            if d['type'] == 'Movie' and not mid.startswith('lose'):
                f = movie_file(main_st, mid)
                if f: res[f'main.story|{mid}'] = f
        return res

    builds = []
    if a.mode in ('together', 'both'):
        mv = {} if a.no_cinematics else narrative_movies()
        for l in sel: mv.update(level_movies(l))
        builds.append(dict(name='TheAct_' + ('completo' if sel == levels and not excl else 'juntos_' + '-'.join(sel)), mode='together', levels=sel, movies=mv, start=None))
    if a.mode in ('separate', 'both'):
        for l in sel:
            mv = level_movies(l); start = None
            if not a.no_cinematics:
                intro = main_st.intro_of(l); win = main_st.win_target(l)
                for mid in (intro, win):
                    if mid and main_st.defs.get(mid, {}).get('type') == 'Movie':
                        f = movie_file(main_st, mid)
                        if f: mv[f'main.story|{mid}'] = f
                start = intro
            builds.append(dict(name=f'TheAct_nivel_{l}', mode='single', levels=[l], movies=mv, start=start or l))

    log('[6/6] Armando builds...')
    os.makedirs(out, exist_ok=True)
    produced = []
    for b in builds:
        bdir = os.path.join(out, b['name'])
        if os.path.exists(bdir): shutil.rmtree(bdir)
        copy_tree(os.path.join(HERE, 'runtime'), bdir, hard=False)
        bl = b['levels']
        sdirs = []; subof = {}; substories = []
        for l in bl:
            if l in subs:
                substories.append(main_st.defs[l]['file'])
                for g in sub_sel[l]: sdirs.append(seqdir_of(subs[l], g)); subof[g] = l
            else: sdirs.append(seqdir_of(main_st, l))
        mods = sorted(set(module_of(s) for s in sdirs))
        for f in ('vm.js',): pass
        for f in ('memimg.js', 'hlemap.js'): link_or_copy(os.path.join(cache_js, f), os.path.join(bdir, 'js', f))
        for m in ['engine'] + mods: link_or_copy(os.path.join(cache_js, 'recomp', m + '.js'), os.path.join(bdir, 'js', 'recomp', m + '.js'))
        d = os.path.join(bdir, 'data')
        for sd in sdirs: copy_tree(os.path.join(cache_data, sd), os.path.join(d, sd))
        copy_tree(os.path.join(cache_data, 'ui'), os.path.join(d, 'ui'))
        copy_tree(os.path.join(cache_data, 'story'), os.path.join(d, 'story'))
        used_menus = {}
        for st_name, st in [('main.story', main_st)] + [(main_st.defs[s]['file'], subs[s]) for s in subs]:
            for mid, dd in st.defs.items():
                if dd['type'] == 'Menu' and dd['extra'] and dd['extra'][0] in menus:
                    mname = dd['extra'][0]; ent = menus[mname]
                    lvl = re.search(r'_(\d\d[a-z]?)_\d+$', mname)
                    if lvl and lvl.group(1) not in bl: continue
                    used_menus[mname] = ent
                    for k in ('background', 'image'):
                        if k in ent: link_or_copy(os.path.join(cache_data, *ent[k].split('/')), os.path.join(d, *ent[k].split('/')))
        for f in set(b['movies'].values()) | set(extra_media.values()):
            link_or_copy(os.path.join(media_dir, *f.split('/')), os.path.join(d, 'media', *f.split('/')))
        cfg = dict(title=b['name'], mode=b['mode'], levels=bl, sequences=sdirs, substories=substories, subOf=subof,
                   movies=b['movies'], menus=used_menus, media=extra_media, start=b['start'], mainStory='main.story',
                   ui=dict(coin=coin[0] if coin else None), lang=a.lang)
        open(os.path.join(bdir, 'js', 'build.js'), 'w', encoding='utf-8').write('// configuracion de este build (generado por build_act.py)\nwindow.ACT_BUILD=' + json.dumps(cfg, indent=1) + ';\n')
        copy_tree(os.path.join(HERE, 'launcher'), bdir, hard=False)
        sz = dir_size(bdir) / 1e6
        log(f'  {b["name"]}: {len(sdirs)} escenas, {len(b["movies"])} peliculas, {sz:.0f} MB')
        produced.append(bdir)
        if a.zip: zipdir(bdir, bdir + '.zip')
    log(f'\nListo en {time.time()-t0:.0f}s. Builds en: {out}')
    log('Para jugar en PC: abre la carpeta del build y ejecuta JUGAR_PC.bat (Windows) o jugar_pc.py.')
    log('Para movil: sube la carpeta a un hosting estatico (itch.io, GitHub Pages) o usa la URL de red local que muestra jugar_pc.py.')

if __name__ == '__main__':
    main()
