"""PyDaphne: sirve el motor (engine/), abre una ventana nativa si hay pywebview
(o el navegador), y da servicios desde Python:

  GET  /api/store            ajustes, perfiles y récords guardados en disco (store.json)
  PUT  /api/store            (el puente JS copia ahí las claves ddn.* de localStorage)
  GET  /api/roms             biblioteca: zips de roms/ con CRC32 de cada archivo
  GET  /api/videos           videos asignados por canal (videos.json)
  GET  /video/<canal>        sirve el video asignado (con soporte de Range para buscar)

Uso:  python -m pydaphne [--port N] [--browser] [--no-window] [--video CANAL=RUTA ...]
"""
import argparse, json, mimetypes, os, socket, sys, threading, webbrowser, zipfile, zlib
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, unquote

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE, ROMS = os.path.join(BASE, 'engine'), os.path.join(BASE, 'roms')
STORE, VIDEOS = os.path.join(BASE, 'store.json'), os.path.join(BASE, 'videos.json')
BRIDGE = r"""<script>/* PyDaphne: localStorage <-> store.json */
(function(){try{var x=new XMLHttpRequest();x.open('GET','/api/store',false);x.send();var d=JSON.parse(x.responseText||'{}');
for(var k in d){if(localStorage.getItem(k)===null)localStorage.setItem(k,d[k]);}}catch(e){}
var t=null;function save(){var o={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(/^(ddn|starrider|ffr)/.test(k))o[k]=localStorage.getItem(k);}
var x=new XMLHttpRequest();x.open('PUT','/api/store');x.setRequestHeader('Content-Type','application/json');x.send(JSON.stringify(o));}
var si=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){si.call(this,k,v);clearTimeout(t);t=setTimeout(save,800);};
window.PYDAPHNE=true;})();</script>"""

def load_json(p, d):
    try:
        with open(p, encoding='utf8') as f: return json.load(f)
    except Exception: return d

def rom_library():
    out = []
    if os.path.isdir(ROMS):
        for f in sorted(os.listdir(ROMS)):
            if not f.lower().endswith('.zip'): continue
            try:
                z = zipfile.ZipFile(os.path.join(ROMS, f))
                out.append({'zip': f, 'files': [{'name': i.filename, 'size': i.file_size, 'crc': '%08x' % i.CRC} for i in z.infolist() if not i.is_dir()]})
            except zipfile.BadZipFile: out.append({'zip': f, 'error': 'zip dañado'})
    return out

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ENGINE, **k)
    def log_message(self, *a): pass
    def _json(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False).encode('utf8')
        self.send_response(code); self.send_header('Content-Type', 'application/json; charset=utf-8'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        p = urlparse(self.path).path
        if p == '/api/store': return self._json(load_json(STORE, {}))
        if p == '/api/roms': return self._json(rom_library())
        if p == '/api/videos': return self._json(load_json(VIDEOS, {}))
        if p.startswith('/video/'): return self._video(unquote(p[7:]))
        if p in ('/', '/index.html'):
            s = open(os.path.join(ENGINE, 'index.html'), encoding='utf8').read().replace('<head>', '<head>' + BRIDGE, 1).encode('utf8')
            self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.send_header('Content-Length', str(len(s))); self.end_headers(); self.wfile.write(s); return
        return super().do_GET()
    def do_PUT(self):
        if urlparse(self.path).path != '/api/store': return self._json({'error': 'no'}, 404)
        n = int(self.headers.get('Content-Length', 0)); data = json.loads(self.rfile.read(n) or b'{}')
        cur = load_json(STORE, {}); cur.update(data)
        with open(STORE, 'w', encoding='utf8') as f: json.dump(cur, f, ensure_ascii=False, indent=1)
        self._json({'ok': True})
    def _video(self, ch):
        path = load_json(VIDEOS, {}).get(ch)
        if not path or not os.path.isfile(path): return self._json({'error': 'sin video para el canal ' + ch}, 404)
        size = os.path.getsize(path); rng = self.headers.get('Range'); start, end = 0, size - 1
        if rng and rng.startswith('bytes='):
            a, _, b = rng[6:].partition('-'); start = int(a or 0); end = int(b) if b else size - 1
        self.send_response(206 if rng else 200)
        self.send_header('Content-Type', mimetypes.guess_type(path)[0] or 'video/mp4'); self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(end - start + 1))
        if rng: self.send_header('Content-Range', 'bytes %d-%d/%d' % (start, end, size))
        self.end_headers()
        with open(path, 'rb') as f:
            f.seek(start); left = end - start + 1
            while left > 0:
                buf = f.read(min(1 << 20, left))
                if not buf: break
                try: self.wfile.write(buf)
                except (BrokenPipeError, ConnectionResetError): break
                left -= len(buf)

def free_port(p):
    for q in range(p, p + 40):
        with socket.socket() as s:
            try: s.bind(('127.0.0.1', q)); return q
            except OSError: continue
    return p

def main():
    ap = argparse.ArgumentParser(prog='pydaphne', description='PyDaphne — receptor multijuego de laserdisc')
    ap.add_argument('--port', type=int, default=8090); ap.add_argument('--browser', action='store_true', help='usar el navegador aunque haya pywebview')
    ap.add_argument('--no-window', action='store_true', help='sólo servidor (para jugar desde el celular en la misma red)')
    ap.add_argument('--video', action='append', default=[], metavar='CANAL=RUTA', help='asigna un video local a un canal (queda en videos.json)')
    ap.add_argument('--roms', action='store_true', help='lista la biblioteca de ROMs y sale')
    a = ap.parse_args()
    if not os.path.isfile(os.path.join(ENGINE, 'index.html')): sys.exit('No encuentro engine/index.html — genera la app con tools/html2pydaphne.py')
    if a.video:
        v = load_json(VIDEOS, {})
        for item in a.video:
            ch, _, path = item.partition('='); v[ch.strip()] = os.path.abspath(path.strip())
        with open(VIDEOS, 'w', encoding='utf8') as f: json.dump(v, f, indent=1)
    if a.roms:
        for z in rom_library(): print(z['zip'], '·', len(z.get('files', [])), 'archivos', z.get('error', ''))
        return
    port = free_port(a.port)
    srv = ThreadingHTTPServer(('0.0.0.0', port), Handler)
    url = 'http://127.0.0.1:%d/index.html' % port
    print('PyDaphne', url)
    try:
        ip = socket.gethostbyname(socket.gethostname()); print('En el celular (misma WiFi): http://%s:%d/index.html' % (ip, port))
    except Exception: pass
    if a.no_window: srv.serve_forever(); return
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        if a.browser: raise ImportError
        import webview                                     # pip install pywebview  (opcional)
        webview.create_window('PyDaphne · Daphne Disc Network', url, width=1280, height=800)
        webview.start()
    except ImportError:
        webbrowser.open(url)
        try:
            input('PyDaphne corriendo — Enter para salir\n')
        except (EOFError, KeyboardInterrupt): pass
    srv.shutdown()

if __name__ == '__main__':
    main()
