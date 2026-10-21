#!/usr/bin/env python3
"""make_frontend.py — arma PyDaphne sin interfaz para frontends (LaunchBox, Hyperspin,
Attract-Mode, RetroBat, Playnite…), con un .bat por juego y el script de compilación para Windows.

  python tools/make_frontend.py ENTRADA [-o SALIDA] [--roms DIR]

ENTRADA puede ser el receptor (zip expandido, carpeta o HTML de un solo archivo) o la carpeta
de código fuente de PyDaphne (con src/ORDER; entonces se compila primero con --roms).

Salida:
  SALIDA/
    engine/ roms/ emus/ pydaphne/     (como html2pydaphne)
    games.json                        canales, siglas, títulos y versiones
    bat/<SIGLA>.bat                   un lanzador por juego:  LGP.bat "C:\\videos\\lgp.mp4"
    PyDaphne.bat                      lanzador genérico:  PyDaphne.bat LGP --video x.mp4 --crt ntsc
    pydaphne_cli_entry.py             punto de entrada para PyInstaller
    build_windows.bat                 crea dist\\PyDaphneCLI\\PyDaphneCLI.exe (sin consola visible)
    LEEME_FRONTEND.txt
"""
import argparse, json, os, re, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import html2pydaphne as H

def games_from_engine(engine):
    js = open(os.path.join(engine, 'js', 'receptor.js'), encoding='utf8').read()
    out = []
    for m in re.finditer(r"\{ n: (\d+), call: '([A-Za-z0-9]+)', title: (?:'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\")", js):
        start = m.end(); end = js.find("\n  { n:", start); end = len(js) if end < 0 else end
        body = js[start:end]
        if 'pending:' in body.split('\n')[0]: continue
        sm = re.search(r"sets: \[(.*?)\]\],", body, re.S)
        sets = re.findall(r"\['([^']+)', ['\"]((?:[^'\"\\]|\\.)*)['\"]\]", sm.group(1) + ']') if sm else []
        title = (m.group(3) if m.group(3) is not None else m.group(4)).replace("\\'", "'")
        if not sets:
            am = re.search(r"algGame: '([^']+)'", body)
            if am: sets = [(am.group(1), 'ALG')]
        out.append({'n': int(m.group(1)), 'call': m.group(2), 'title': title, 'sets': [list(s) for s in sets]})
    return out

BAT = r'''@echo off
rem {title} — PyDaphne sin interfaz.  Uso: {call}.bat [video] [opciones extra]
set "H=%~dp0.."
cd /d "%H%"
set "V="
if not "%~1"=="" set "V=--video "%~1""
if exist "%H%\PyDaphneCLI.exe" (
  "%H%\PyDaphneCLI.exe" {n} {setarg} %V% %2 %3 %4 %5 %6
) else (
  python -m pydaphne.cli {n} {setarg} %V% %2 %3 %4 %5 %6 || py -3 -m pydaphne.cli {n} {setarg} %V% %2 %3 %4 %5 %6
)
'''
BUILD = r'''@echo off
rem Compila PyDaphneCLI.exe (PyInstaller). Requiere Python 3.9+ de python.org en el PATH.
cd /d "%~dp0"
if not exist .venv ( py -3 -m venv .venv 2>nul || python -m venv .venv )
call .venv\Scripts\activate.bat || goto :err
python -m pip install --upgrade pip >nul
python -m pip install pyinstaller pywebview || goto :err
pyinstaller --noconfirm --clean --onedir --windowed --name PyDaphneCLI ^
  --add-data "engine;engine" --add-data "roms;roms" --add-data "games.json;." ^
  --hidden-import webview pydaphne_cli_entry.py || goto :err
xcopy /e /i /y bat dist\PyDaphneCLI\bat >nul
copy /y games.json dist\PyDaphneCLI\ >nul
copy /y LEEME_FRONTEND.txt dist\PyDaphneCLI\ >nul
echo.
echo Listo: dist\PyDaphneCLI\PyDaphneCLI.exe  (y los lanzadores en dist\PyDaphneCLI\bat\)
pause
exit /b 0
:err
echo Error al compilar. Revisa que Python este instalado y en el PATH.
pause
exit /b 1
'''
README = '''PyDaphne sin interfaz — para frontends
=========================================

Cada juego tiene su lanzador en bat\\<SIGLA>.bat. El frontend le pasa el video del disco como
primer parámetro y el juego arranca directo, a pantalla completa, sin guía ni perfiles.
Esc cierra el juego y devuelve el control al frontend.

  bat\\LGP.bat "D:\\Laserdisc\\Laser Grand Prix.mp4"
  bat\\SBY.bat "D:\\Laserdisc\\Star Blazers.mp4" --crt ntsc --freeplay 0
  PyDaphne.bat 304 --set lgpalt --video "D:\\lgp.mp4"
  PyDaphne.bat --list                       (lista de canales, siglas y versiones)

Opciones:  --set VERSION  --start CUADRO  --crt off|scan|ntsc  --freeplay 0|1  --lang es|en|zh|ja|ru
           --browser auto|webview|edge|chrome  --windowed  --video URL (YouTube o mp4 en línea)

Ejecutable: build_windows.bat crea dist\\PyDaphneCLI\\PyDaphneCLI.exe (con pywebview, sin consola);
los .bat lo usan automáticamente si está junto a ellos. Sin compilar, los .bat usan Python.

LaunchBox / Playnite: emulador = bat\\LGP.bat (o PyDaphneCLI.exe 304), parámetros = "%romfile%" o el video.
'''

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('entrada'); ap.add_argument('-o', '--salida', default='PyDaphne_Frontend'); ap.add_argument('--roms', default=None)
    a = ap.parse_args()
    src = a.entrada; tmp = None
    if os.path.isdir(src) and os.path.isfile(os.path.join(src, 'src', 'ORDER')):
        tmp = tempfile.mkdtemp(); out = os.path.join(tmp, 'DaphneDiscNetwork')
        cmd = [sys.executable, os.path.join(src, 'tools', 'build_web.py'), '--out', out] + (['--roms', a.roms] if a.roms else [])
        subprocess.check_call(cmd); src = out
    sys.argv = ['html2pydaphne', src, '-o', a.salida]; H.main()
    out = os.path.abspath(a.salida)
    gl = games_from_engine(os.path.join(out, 'engine'))
    json.dump(gl, open(os.path.join(out, 'games.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    os.makedirs(os.path.join(out, 'bat'), exist_ok=True)
    for g in gl:
        setarg = ('--set ' + g['sets'][0][0]) if g['sets'] else ''
        open(os.path.join(out, 'bat', g['call'] + '.bat'), 'w', encoding='utf8', newline='\r\n').write(BAT.format(title=g['title'], call=g['call'], n=g['n'], setarg=setarg))
    open(os.path.join(out, 'PyDaphne.bat'), 'w', newline='\r\n').write('@echo off\r\ncd /d "%~dp0"\r\nif exist PyDaphneCLI.exe ( PyDaphneCLI.exe %* ) else ( python -m pydaphne.cli %* || py -3 -m pydaphne.cli %* )\r\n')
    open(os.path.join(out, 'pydaphne_cli_entry.py'), 'w').write('from pydaphne.cli import main\nmain()\n')
    open(os.path.join(out, 'build_windows.bat'), 'w', newline='\r\n').write(BUILD)
    open(os.path.join(out, 'LEEME_FRONTEND.txt'), 'w', encoding='utf8').write(README)
    if tmp: shutil.rmtree(tmp, ignore_errors=True)
    print('[make_frontend] %d juegos · lanzadores en %s' % (len(gl), os.path.join(out, 'bat')))

if __name__ == '__main__':
    main()
