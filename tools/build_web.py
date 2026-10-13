#!/usr/bin/env python3
"""build_web.py — arma el receptor web (Daphne Disc Network) desde las fuentes.

  python tools/build_web.py [--roms DIR] [--emus DIR] [--gal3-core FILE] [--out DIR]

- concatena src/*.js en el orden de src/ORDER  ->  OUT/js/receptor.js
- copia web/fengari-web.js y el arte (art/)
- empaqueta cada .zip de --roms como OUT/data/roms/<nombre>.js
  (las ROMs NO vienen con el código: usa tus propios volcados)
- copia emuladores HTML de --emus (p. ej. alg.html) como OUT/data/emus/<id>.js
"""
import argparse, base64, json, os, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EMU_TITLES = {'alg': 'American Laser Games'}

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--roms', default=os.path.join(ROOT, 'roms'))
    ap.add_argument('--emus', default=None, help='carpeta con <id>.html (núcleo ALG/SAE, etc.)')
    ap.add_argument('--gal3-core', default=None, help='gal3_core.js (núcleo WASM de Galaxian³)')
    ap.add_argument('--theact', default=None, help='carpeta de The Act (se copia como theact/)')
    ap.add_argument('--out', default=os.path.join(ROOT, 'dist', 'DaphneDiscNetwork'))
    a = ap.parse_args()
    out = a.out
    if os.path.exists(out): shutil.rmtree(out)
    for d in ('js', 'data/roms', 'data/emus', 'data/art'): os.makedirs(os.path.join(out, d), exist_ok=True)
    order = open(os.path.join(ROOT, 'src', 'ORDER')).read().split()
    code = ''.join('\n/* ==== %s.js ==== */\n' % m + open(os.path.join(ROOT, 'src', m + '.js'), encoding='utf8').read() for m in order)
    open(os.path.join(out, 'js', 'receptor.js'), 'w', encoding='utf8').write(code)
    shutil.copy(os.path.join(ROOT, 'web', 'fengari-web.js'), os.path.join(out, 'js', 'fengari-web.js'))
    for sub in os.listdir(os.path.join(ROOT, 'art')):
        shutil.copytree(os.path.join(ROOT, 'art', sub), os.path.join(out, 'data', 'art', sub))
    tags = []
    if os.path.isdir(a.roms):
        for f in sorted(os.listdir(a.roms)):
            if not f.lower().endswith('.zip'): continue
            js = f[:-4] + '.js'
            b64 = base64.b64encode(open(os.path.join(a.roms, f), 'rb').read()).decode()
            open(os.path.join(out, 'data', 'roms', js), 'w').write('(window.DDN_ROMS=window.DDN_ROMS||[]).push([%s,"%s"]);\n' % (json.dumps(f.lower()), b64))
            tags.append('<script src="data/roms/%s"></script>' % js)
    if a.emus and os.path.isdir(a.emus):
        for f in sorted(os.listdir(a.emus)):
            if not f.endswith('.html'): continue
            i = f[:-5]; h = open(os.path.join(a.emus, f), encoding='utf8').read()
            js = '(window.DDN_EMUS=window.DDN_EMUS||{})[%s]={title:%s,html:%s};\n' % (json.dumps(i), json.dumps(EMU_TITLES.get(i, i)), json.dumps(h))
            open(os.path.join(out, 'data', 'emus', i + '.js'), 'w', encoding='utf8').write(js.replace('</script', '<\\/script'))
            tags.append('<script src="data/emus/%s.js"></script>' % i)
    gal3 = ''
    if a.gal3_core:
        shutil.copy(a.gal3_core, os.path.join(out, 'data', 'gal3_core.js')); gal3 = '<script src="data/gal3_core.js"></script>'
    if a.theact: shutil.copytree(a.theact, os.path.join(out, 'theact'))
    t = open(os.path.join(ROOT, 'web', 'index.template.html'), encoding='utf8').read()
    t = t.replace('<!--DDN_DATA-->', '\n'.join(tags)).replace('<!--DDN_GAL3-->', gal3)
    open(os.path.join(out, 'index.html'), 'w', encoding='utf8').write(t)
    print('listo:', out, '·', len(tags), 'paquetes de datos')

if __name__ == '__main__':
    main()
