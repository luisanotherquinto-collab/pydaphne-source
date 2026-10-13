#!/usr/bin/env python3
"""html2pydaphne.py — convierte el receptor HTML en una aplicación PyDaphne.

  python tools/html2pydaphne.py ENTRADA [-o SALIDA]

ENTRADA puede ser:
  * el HTML de un solo archivo (daphne_disc_network.html, con las ROMs y los
    emuladores embebidos en base64),
  * la carpeta expandida (index.html + js/ + data/), o
  * el .zip de la versión expandida.

La salida es una carpeta autónoma:
  SALIDA/
    pydaphne/            paquete Python (servidor, ventana, biblioteca de ROMs, récords)
    engine/              el receptor (index.html + js/ + data/), ya expandido
    roms/                los zips de ROMs extraídos del HTML (tus volcados)
    emus/                los emuladores HTML embebidos, como archivos .html
    PyDaphne.bat / pydaphne.sh

Importante: los emuladores siguen siendo JavaScript y corren en el motor del
navegador/ventana; Python se encarga de la aplicación (servir, ventana nativa,
biblioteca de ROMs con CRC32, asignación de videos por canal, récords y ajustes
guardados en disco). Traducir los núcleos de CPU a Python los haría cientos de
veces más lentos.
"""
import argparse, base64, html, io, json, os, re, shutil, sys, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

def log(*a): print('[html2pydaphne]', *a)

def from_single_html(path, engine, roms, emus):
    s = open(path, encoding='utf8', errors='replace').read()
    n_r = n_e = 0
    # ROMs: <script type="text/x-rom" data-name="x.zip">BASE64</script>
    for m in re.finditer(r'<script[^>]*type="text/x-rom"[^>]*data-name="([^"]+)"[^>]*>(.*?)</script>', s, re.S):
        open(os.path.join(roms, os.path.basename(m.group(1))), 'wb').write(base64.b64decode(re.sub(r'\s', '', m.group(2)))); n_r += 1
    # emuladores: <script type="text/x-emu" data-id=".." data-title="..">HTML</script>
    emu_tags = []
    for m in re.finditer(r'<script[^>]*type="text/x-emu"[^>]*data-id="([^"]+)"[^>]*?(?:data-title="([^"]*)")?[^>]*>(.*?)</script>', s, re.S):
        i, title, body = m.group(1), html.unescape(m.group(2) or m.group(1)), m.group(3).replace('\ue000', '').replace('\ue001', '')
        open(os.path.join(emus, i + '.html'), 'w', encoding='utf8').write(body); n_e += 1
        emu_tags.append((i, title))
    # el resto del documento es el motor; las ROMs/emuladores pasan a archivos de datos
    page = re.sub(r'<script[^>]*type="text/x-(rom|emu)"[^>]*>.*?</script>\s*', '', s, flags=re.S)
    os.makedirs(os.path.join(engine, 'data', 'roms'), exist_ok=True); os.makedirs(os.path.join(engine, 'data', 'emus'), exist_ok=True)
    tags = []
    for f in sorted(os.listdir(roms)):
        js = f[:-4] + '.js'
        open(os.path.join(engine, 'data', 'roms', js), 'w').write('(window.DDN_ROMS=window.DDN_ROMS||[]).push([%s,"%s"]);\n' % (json.dumps(f.lower()), base64.b64encode(open(os.path.join(roms, f), 'rb').read()).decode()))
        tags.append('<script src="data/roms/%s"></script>' % js)
    for i, title in emu_tags:
        body = open(os.path.join(emus, i + '.html'), encoding='utf8').read()
        open(os.path.join(engine, 'data', 'emus', i + '.js'), 'w', encoding='utf8').write(('(window.DDN_EMUS=window.DDN_EMUS||{})[%s]={title:%s,html:%s};\n' % (json.dumps(i), json.dumps(title), json.dumps(body))).replace('</script', '<\\/script'))
        tags.append('<script src="data/emus/%s.js"></script>' % i)
    # los datos tienen que cargarse antes del código del receptor
    k = page.find('<script>', page.find('</style>'))
    page = page[:k] + '\n'.join(tags) + '\n' + page[k:] if k > 0 else page.replace('</body>', '\n'.join(tags) + '\n</body>')
    open(os.path.join(engine, 'index.html'), 'w', encoding='utf8').write(page)
    return n_r, n_e

def from_expanded(folder, engine, roms, emus):
    shutil.copytree(folder, engine, dirs_exist_ok=True)
    n_r = n_e = 0
    for f in os.listdir(os.path.join(engine, 'data', 'roms')) if os.path.isdir(os.path.join(engine, 'data', 'roms')) else []:
        m = re.search(r'push\(\["([^"]+)","([^"]+)"\]\)', open(os.path.join(engine, 'data', 'roms', f)).read())
        if m: open(os.path.join(roms, m.group(1)), 'wb').write(base64.b64decode(m.group(2))); n_r += 1
    for f in os.listdir(os.path.join(engine, 'data', 'emus')) if os.path.isdir(os.path.join(engine, 'data', 'emus')) else []:
        s = open(os.path.join(engine, 'data', 'emus', f), encoding='utf8').read()
        m = re.search(r'html:(".*")\};\s*$', s, re.S)
        if m: open(os.path.join(emus, f[:-3] + '.html'), 'w', encoding='utf8').write(json.loads(m.group(1).replace('<\\/script', '</script'))); n_e += 1
    # los lanzadores de la versión expandida no hacen falta dentro de engine/
    for x in ('JUGAR.bat', 'jugar.py', 'jugar.sh'):
        p = os.path.join(engine, x)
        if os.path.exists(p): os.remove(p)
    return n_r, n_e

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('entrada'); ap.add_argument('-o', '--salida', default='PyDaphne_app')
    a = ap.parse_args()
    out = os.path.abspath(a.salida)
    if os.path.exists(out): shutil.rmtree(out)
    engine, roms, emus = (os.path.join(out, d) for d in ('engine', 'roms', 'emus'))
    for d in (engine, roms, emus): os.makedirs(d)
    src = a.entrada; tmp = None
    if src.lower().endswith('.zip'):
        tmp = os.path.join(out, '_tmp'); zipfile.ZipFile(src).extractall(tmp)
        cands = [os.path.join(dp) for dp, dn, fs in os.walk(tmp) if 'index.html' in fs]
        if not cands: sys.exit('el zip no trae index.html')
        src = min(cands, key=len)
    if os.path.isdir(src): n_r, n_e = from_expanded(src, engine, roms, emus); kind = 'carpeta expandida'
    else: n_r, n_e = from_single_html(src, engine, roms, emus); kind = 'HTML de un solo archivo'
    if tmp: shutil.rmtree(tmp)
    shutil.copytree(os.path.join(ROOT, 'pydaphne'), os.path.join(out, 'pydaphne'))
    open(os.path.join(out, 'PyDaphne.bat'), 'w').write('@echo off\r\ncd /d "%~dp0"\r\npython -m pydaphne %*\r\nif errorlevel 1 py -m pydaphne %*\r\npause\r\n')
    open(os.path.join(out, 'pydaphne.sh'), 'w').write('#!/bin/sh\ncd "$(dirname "$0")"\nexec python3 -m pydaphne "$@"\n'); os.chmod(os.path.join(out, 'pydaphne.sh'), 0o755)
    log('entrada: %s' % kind); log('ROMs extraídas: %d · emuladores: %d' % (n_r, n_e)); log('aplicación lista en', out)
    log('ejecútala con:  python -m pydaphne   (desde %s)' % out)

if __name__ == '__main__':
    main()
