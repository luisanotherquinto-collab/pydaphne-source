# PyDaphne · Daphne Disc Network

Receptor multijuego de laserdisc con interfaz de cable box de los 90: emulación de
placas de laserdisc, CED, VHD y FMV (Dragon's Lair, Firefox, Cube Quest, Star Rider,
Freedom Fighter, COPS, Galaxian³, American Laser Games, Casino Strip, juegos MSX/VHD
y fangames). Este repositorio trae el código fuente para que cualquiera pueda
compilarlo, mejorarlo o convertirlo en una aplicación Python.

## Estructura

```
src/            drivers y receptor (JavaScript, un módulo por hardware); el orden está en src/ORDER
web/            plantilla index.template.html + fengari-web.js
art/            arte del gabinete de Casino Strip
pydaphne/       aplicación Python (servidor, ventana nativa, ROMs, récords, videos por canal)
tools/
  build_web.py      arma el receptor web desde src/
  html2pydaphne.py  convierte un receptor HTML (un archivo, carpeta o zip) en app PyDaphne
roms/           pon aquí tus zips (no se incluyen)
```

## 1. Compilar el receptor web

```bash
python tools/build_web.py --roms roms/ [--emus carpeta_con_alg.html] [--gal3-core gal3_core.js]
# -> dist/DaphneDiscNetwork/index.html
```

## 2. Convertir a aplicación Python (PyDaphne)

```bash
python tools/html2pydaphne.py dist/DaphneDiscNetwork -o PyDaphne_app
#   también acepta el HTML de un solo archivo o el .zip de la versión expandida
cd PyDaphne_app
python -m pydaphne                      # ventana nativa con pywebview, o el navegador
python -m pydaphne --video 330=MadDog.mp4   # asigna un video a un canal
python -m pydaphne --roms               # lista la biblioteca con CRC32
python -m pydaphne --no-window          # sólo servidor (para el celular en la misma WiFi)
```

`pip install pywebview` es opcional (ventana propia). Sin él se abre el navegador.

### Qué hace la conversión

- Extrae las ROMs y los emuladores embebidos a `roms/` y `emus/`.
- Deja el motor expandido en `engine/` y le agrega un puente que guarda perfiles,
  ajustes y récords en `store.json` (persisten aunque cambies de navegador).
- Python sirve los videos asignados por canal (`/video/<canal>`, con búsqueda por Range),
  lista la biblioteca de ROMs (`/api/roms`) y abre la ventana.
- Los núcleos de CPU siguen en JavaScript dentro del motor web: traducirlos a Python
  puro los haría cientos de veces más lentos.

## Controles

Teclado, ratón/táctil y mandos Bluetooth/USB (cada mando toma un asiento al pulsar un
botón: Galaxian³ hasta 6, COPS y ALG 2 pistolas, NFL 2 jugadores). Tab abre la guía.

## Video del disco

mp4 local, URL directa o YouTube (en la tarjeta del canal), o asignado desde PyDaphne.
Efecto CRT NTSC con sprite blending en MENÚ › Imagen y sonido.

## Licencia

GPL-3.0-or-later. Ver `NOTICE.md` para los componentes de terceros.
