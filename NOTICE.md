# Componentes de terceros

PyDaphne se publica bajo **GPL-3.0-or-later** (ver `LICENSE`). Partes del código
derivan de proyectos con licencias compatibles; cada archivo conserva sus créditos.

| Componente | Dónde | Origen / licencia |
|---|---|---|
| Drivers derivados de MAME (statriv2, istellar, firefox, cops, gal3, jedi, ...) | `src/*.js` | MAME — BSD-3-Clause / GPL-2.0+ según el driver |
| LD-V1000, PR-8210, LDP-1450 HLE inspirados en Hypseus / Daphne | `src/core.js`, `src/drivers.js` | Hypseus Singe — GPL-3.0 |
| PX-7 / LaserdiscPlayer / control Pioneer | `src/px7.js` | openMSX — GPL-2.0+ |
| Hardware ALG (Amiga + LDP-1450) | núcleo `alg.html` (no incluido) | SAE (Scripted Amiga Emulator) y WinUAE — GPL |
| Lua 5.3 en JS para juegos Singe | `web/fengari-web.js` | fengari — MIT |
| Núcleos de COPS, Star Rider, Freedom Fighter, NFL, LGP, Road Runner, Zangus, Galaxian³ | `src/*.js` | ports y recompilaciones de Luis |

**No se incluyen ROMs, imágenes de laserdisc, videos ni el contenido de The Act.**
Usa tus propios volcados (carpeta `roms/`) y tus propias capturas de disco.
