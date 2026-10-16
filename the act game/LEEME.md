# The Act — recomp arcade (HTML5 mobile + PC)

Recompilación del port de iOS (Chillingo, 2012) del arcade **The Act** (Cecropia, 2007).
La lógica original de cada escena —el código ARM del motor *decaf*— se traduce
instrucción por instrucción a JavaScript y corre sobre una máquina virtual con la
memoria del binario original. Las animaciones (RL2), la música sincronizada por beats,
los vídeos y el flujo de historias son los del juego. El marco es el del gabinete:
attract mode, pantalla de *insert coin*, créditos, 3 vidas por crédito y continue.

Este kit **no trae ningún archivo del juego**: tú le pasas tu copia (los RAR, el .ipa o
la carpeta `The Act.app`) y el script genera los builds.

## Requisitos

- Python 3.9 o superior
- `pip install lief capstone pillow numpy`
- **7-Zip** para abrir los `.rar` (https://7-zip.org). También sirve WinRAR/unrar, o
  extraer tú el `.ipa` y pasarlo directo.
- Opcional pero recomendado: **ffmpeg** en el PATH. Convierte el audio a FLAC y los
  vídeos a MP4. Sin ffmpeg se copian los WAV y MOV originales, que también funcionan
  pero pesan más.

## Uso

Pon los dos RAR juntos en la misma carpeta y pásale la parte 1. La parte 2 se lee sola.

```
python build_act.py The_Act_1_01_part1.rar                      # juego completo (todos juntos)
python build_act.py The_Act_1_01_part1.rar --mode separate      # una carpeta jugable por nivel
python build_act.py The_Act_1_01_part1.rar --mode both --zip    # ambos, y un .zip por build
python build_act.py The_Act_1_01_part1.rar --levels 02,04,18    # solo esos niveles
python build_act.py The_Act_1_01_part1.rar --exclude 18c,18p,21 # todo menos esos
python build_act.py The_Act_1_01_part1.rar --lang es            # pistas y pantallas en español
python build_act.py The_Act_1_01_part1.rar --list               # ver los niveles
```

Los builds salen en `./builds/` y el caché en `./builds/_cache`. Si vuelves a correr
el script, reutiliza lo ya convertido y es mucho más rápido.

### Niveles

| id | escena | notas |
|----|--------|-------|
| 02 | Daydreaming (Sylvia) | |
| 04 | Boss Fight | |
| 06 | Doctors Laugh | |
| 12 | Roxy Heart | |
| 14 | Coffee | |
| 16 | Heimlich | |
| 18 | Chase | sub-historia con 6 pasillos: 18a, 18c, 18d, 18e, 18o, 18p |
| 21 | Apology | |

Las películas entre niveles (01, 03, 05, 07_08_09, 13, 15, 17, 20, 22) van en el build
completo. Cada build separado lleva su película de entrada, la de salida, y los vídeos
de rewind y pistas de su nivel.

- **Excluir en modo juntos:** el nivel excluido se salta como si se hubiera ganado, y
  la historia sigue con la película siguiente. Esto también vale para los sub-niveles
  del chase (`--exclude 18c`).
- **`--no-cinematics`:** deja solo los juegos y los vídeos de derrota.

## Jugar

**PC:** abre la carpeta del build y ejecuta `JUGAR_PC.bat` (Windows) o `jugar_pc.py` /
`jugar_pc.sh`. Se abre Chrome o Edge a pantalla completa. Para gabinete:
`JUGAR_GABINETE_KIOSKO.bat` (modo kiosko).

**Celular:** `jugar_pc.py` muestra una URL de red local (`http://192.168.x.x:8077`). Ábrela
en el celular conectado a la misma WiFi. También puedes subir la carpeta a cualquier
hosting estático (itch.io, GitHub Pages, Netlify).

> No funciona abriendo `index.html` con doble clic. El navegador bloquea la carga de
> datos desde `file://`, por eso existe el lanzador.

### Controles

| acción | teclado / ratón | gamepad | táctil |
|--------|-----------------|---------|--------|
| knob | ← → (o A/D), rueda, arrastrar | stick izquierdo | perilla en pantalla, o deslizar sobre el juego |
| moneda | 5 o C | Select / X | COIN |
| start | 1, Enter o Espacio | Start / A | START |
| menú de operador | F2 o Tab | | OP |
| pantalla completa | F | | ⛶ |

### Menú de operador (F2)

Permite ajustar:
- precio por partida (free play, como en tu captura, o 25¢–$1);
- valor de la moneda;
- vidas por crédito;
- dificultad (fácil, normal, difícil: la de los DIP del arcade, `UV_DIFFICULTY_LEVEL`);
- saltar películas con START;
- sonido en attract;
- sensibilidad e inversión del knob;
- escalado y scanlines.

Se guarda en el navegador.

### Modo debug

Abre `index.html#debug&start=18` para arrancar en cualquier secuencia. Teclas:
- **W:** fuerza la victoria de la escena.
- **L:** fuerza la derrota (`#debug&detail=4` elige el código de pista).
- **N:** salta la película.

La consola muestra cada transición de la historia.

## Cómo funciona (resumen técnico)

1. `actlib/binary.py` abre el Mach-O armv7. No está cifrado y conserva sus 5731
   símbolos, agrupados por objeto `.o`.
2. `actlib/recomp.py` es un recompilador estático Thumb-2 → JavaScript:
   - descubre el código de forma recursiva desde cada función;
   - resuelve las tablas de salto `tbb/tbh` y los bloques `IT` con su condición
     correcta (las instrucciones de 16 bits dentro de un `IT` no tocan los flags);
   - emula VFP y genera un `switch` por bloque básico.

   Traduce las 13 `GameLogicXX` (≈1700 funciones), `GameSequence::updateState` y la
   API `GameAdapter`.
3. `runtime/js/vm.js` es la máquina: memoria plana con la imagen de `__DATA` del
   binario, pila, llamadas por dirección y stubs de libc/C++.
4. `runtime/js/scene.js` construye el objeto `GameSequence` en esa memoria con el
   layout original (personajes de 64 bytes, arcos de 20, nodos de 8…). Luego ejecuta
   el `updateState` recompilado a 60 Hz. Reimplementa por HLE `ScreenManager` (z-buffer),
   `SoundManager` (eventos *ahora / próximo beat / próximo compás* y offsets de compás),
   `ResourceManager`, `Palette`, `PlayerState` e `InputManager`.
5. `actlib/pack.py` convierte los assets:
   - las animaciones RL2 quedan tal cual en `.pak` y se decodifican en el navegador;
   - las paletas `.rlect` (BGR);
   - los fondos PNG, y los frames del `.pk4` del chase a JPG;
   - el audio WAV a FLAC y los vídeos MOV a MP4 sin recomprimir;
   - las pistas de rewind desde su XML.
6. `runtime/js/shell.js` reproduce el formato de historias `.story`:
   - los eventos son `win`, `lose(N)` y `lose story(N)` (cuando ya no quedan vidas);
   - `:` indica que la transición consume una vida;
   - las sub-historias propagan su resultado a la historia padre.

   Encima va el marco arcade.

Validación: un bot recorre las 13 escenas con 8 estrategias de knob sin crashes.
- Gana en 02, 04 y 16.
- Los códigos de derrota coinciden con las transiciones del `.story` original (los
  choques 155/49/22… del chase).

## Licencias

- El código de este kit lo escribimos Luis y Claude.
- La fuente Archivo Black está bajo SIL OFL 1.1 (`fonts/ArchivoBlack-OFL.txt`).
- The Act © Cecropia / Chillingo. Los builds que generes contienen los assets de tu
  copia del juego, así que no los redistribuyas.
