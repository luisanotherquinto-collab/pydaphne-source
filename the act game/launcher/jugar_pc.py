#!/usr/bin/env python3
"""The Act - lanzador PC: sirve esta carpeta por HTTP local y abre el juego en modo arcade (pantalla completa).
Tambien muestra la URL de red local para jugar desde el celular en la misma WiFi."""
import http.server, socketserver, threading, webbrowser, os, sys, socket, shutil, subprocess, functools

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map, **{
        '.js': 'application/javascript', '.json': 'application/json', '.flac': 'audio/flac', '.wav': 'audio/wav',
        '.mp4': 'video/mp4', '.mov': 'video/mp4', '.pak': 'application/octet-stream', '.story': 'text/plain'})
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache'); super().end_headers()

def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('8.8.8.8', 80)); ip = s.getsockname()[0]; s.close(); return ip
    except Exception: return '127.0.0.1'

def open_kiosk(url):
    cands = []
    if sys.platform.startswith('win'):
        pf = [os.environ.get('PROGRAMFILES', r'C:\Program Files'), os.environ.get('PROGRAMFILES(X86)', r'C:\Program Files (x86)'), os.environ.get('LOCALAPPDATA', '')]
        for base in pf:
            cands += [os.path.join(base, r'Google\Chrome\Application\chrome.exe'), os.path.join(base, r'Microsoft\Edge\Application\msedge.exe')]
    elif sys.platform == 'darwin':
        cands += ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
    else:
        cands += [shutil.which(x) or '' for x in ('google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge')]
    kiosk = '--kiosk' in sys.argv
    for c in cands:
        if c and os.path.isfile(c):
            args = [c, ('--kiosk' if kiosk else '--start-fullscreen'), f'--app={url}', '--autoplay-policy=no-user-gesture-required', '--disable-features=Translate']
            subprocess.Popen(args); return
    webbrowser.open(url)

class TS(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True; allow_reuse_address = True

def main():
    port = 8077
    for p in range(8077, 8100):
        try: srv = TS(('0.0.0.0', p), H); port = p; break
        except OSError: continue
    url = f'http://127.0.0.1:{port}/index.html'
    print('=' * 60); print(' THE ACT - recomp arcade')
    print(f' PC:      {url}'); print(f' Celular: http://{lan_ip()}:{port}/index.html  (misma WiFi)')
    print(' Controles: flechas o rueda = knob, 5 = moneda, 1 = start, F2 = operador')
    print(' Cierra esta ventana para salir.'); print('=' * 60)
    threading.Timer(0.6, lambda: open_kiosk(url)).start()
    try: srv.serve_forever()
    except KeyboardInterrupt: pass

if __name__ == '__main__': main()
