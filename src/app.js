/* ==========================================================================
 *  DAPHNE DISC NETWORK — receptor estilo cable box de los 90.
 * ========================================================================== */
'use strict';
const $ = s => document.querySelector(s);
const FIELD_MS = 1000 / 59.94;

/* ------------------------------------------------------------ canales */
const CHANNELS = [
  { n: 201, call: 'LAIR', title: "Dragon's Lair", year: 1983, maker: 'Cinematronics', drv: 'lair', hw: 'Z80 · LD-V1000 / PR-7820',
    sets: [['lair', 'Rev F2'], ['lair_f', 'Rev F'], ['lair_e', 'Rev E'], ['lair_d', 'Rev D'], ['lair_c', 'Rev C (PR-7820)'], ['lair_b', 'Rev B (PR-7820)'], ['lair_a', 'Rev A (PR-7820)'], ['lair_n1', 'Máquina #1'], ['lair_x', 'Rev X temprana']],
    desc: 'Dirk el Temerario entra al castillo del dragón Singe para rescatar a la princesa Daphne. Joystick y espada en el momento justo.', keys: 'Flechas: joystick · Espacio: espada · 5: moneda (2 por crédito) · 1: inicio' },
  { n: 202, call: 'DLE', title: "Dragon's Lair Enhancement", year: 2006, maker: 'd-l-p.com', drv: 'lair', hw: 'Z80 · LD-V1000',
    sets: [['dle21', 'v2.1'], ['dle20', 'v2.0'], ['dle11', 'v1.1']],
    desc: 'ROM mejorada de la comunidad: escenas completas, movimientos extra y dificultad ajustable, sobre el disco original.', keys: 'Igual que Dragon\'s Lair' },
  { n: 203, call: 'ACE', title: 'Space Ace', year: 1984, maker: 'Cinematronics', drv: 'lair', hw: 'Z80 · LD-V1000',
    sets: [['ace', 'Rev A3'], ['ace_a2', 'Rev A2'], ['ace_a', 'Rev A'], ['sae', 'Space Ace Enhanced']],
    desc: 'Dexter se convierte en Ace para detener al comandante Borf y su Rayo Infanto. Energiza en el momento correcto.', keys: 'Flechas · Espacio: energizar · Q/W/E: nivel cadete/capitán/ace' },
  { n: 204, call: 'CLIF', title: 'Cliff Hanger', year: 1983, maker: 'Stern', drv: 'cliff', hw: 'Z80 · TMS9128 · PR-8210',
    sets: [['cliff', 'Original'], ['cliffalt', 'Alterna'], ['cliffalt2', 'Alterna 2']],
    desc: 'Lupin III en videojuego: escenas del anime con manos y pies en el instante justo. Overlay TMS9128 sobre el video.', keys: 'Flechas · Espacio: manos · 1: pies/inicio' },
  { n: 205, call: 'GTG', title: 'Goal to Go', year: 1983, maker: 'Stern', drv: 'cliff', hw: 'Z80 · TMS9128 · PR-8210', experimental: 1,
    sets: [['gtg', 'Original']],
    desc: 'Fútbol americano con jugadas filmadas. El driver arranca y dibuja, pero la verificación de lado del disco aún no pasa.', keys: 'Flechas · Espacio · 1' },
  { n: 206, call: 'SDQ', title: 'Super Don Quix-ote', year: 1984, maker: 'Universal', drv: 'superd', hw: 'Z80 · LD-V1000 · SN76496',
    sets: [['sdq', 'Original'], ['sdqshort', 'Versión corta'], ['sdqshortalt', 'Versión corta alt.']],
    desc: 'Don Quijote animado en Japón: flechas y botón según los íconos que aparecen sobre el disco.', keys: 'Flechas · Espacio: acción' },
  { n: 207, call: 'ESH', title: "Esh's Aurunmilla", year: 1984, maker: 'Funai / Gakken', drv: 'esh', hw: 'Z80 · LD-V1000',
    sets: [['esh', 'Original'], ['eshalt', 'Alterna'], ['eshalt2', 'Alterna 2']],
    desc: 'Aventura de fantasía animada de Funai con overlay de caracteres parpadeantes y decisiones a tiempo.', keys: 'Flechas · Espacio · 1' },
  { n: 208, call: 'ISTL', title: 'Interstellar Laser Fantasy', year: 1983, maker: 'Funai', drv: 'interstellar', hw: '3× Z80 · LD-V1000 · 2× SN76496',
    sets: [['interstellar', 'Original']],
    desc: 'Shooter espacial en tercera persona con la nave como sprite sobre el video CGI del disco. El antecesor de Zangus.', keys: 'Flechas · Espacio: disparo · X: bomba' },
  { n: 209, call: 'BADL', title: 'Badlands', year: 1984, maker: 'Konami', drv: 'badlands', hw: '6809 · LD-V1000 · SN76496',
    sets: [['badlands', 'Original'], ['badlandp', 'Prototipo']],
    desc: 'Western animado: Buck vengará a su familia disparando justo cuando aparece el aviso SHOOT.', keys: 'Espacio: disparar · 1: inicio' },
  { n: 210, call: 'BEGA', title: "Bega's Battle", year: 1983, maker: 'Data East', drv: 'bega', hw: '2× 6502 · 2× AY-3-8910 · Sony LDP-1000',
    sets: [['bega', 'Rev 3'], ['begar1', 'Rev 1']],
    desc: 'Shooter de sprites de Data East sobre el anime de Harmagedon: tu psíquico vuela y dispara encima del video del disco.', keys: 'Flechas · Espacio/X/C: disparos · 5: moneda · 1: inicio' },
  { n: 211, call: 'COBR', title: 'Cobra Command', year: 1984, maker: 'Data East', drv: 'bega', hw: '2× 6502 · 2× AY-3-8910 · Sony LDP-1000', experimental: 1,
    sets: [['cobra', 'Data East'], ['cobraab', 'Hardware Astron Belt', 'astron'], ['cobram3', 'Hardware MACH 3', 'mach3']],
    desc: 'Helicóptero de ataque sobre ciudades animadas. La versión Data East arranca sin overlay (Hypseus la marca con fallas gráficas); las conversiones para hardware Astron Belt y MACH 3 sí dibujan.', keys: 'Flechas · Espacio: cañón · X: misil · 5: moneda · 1: inicio' },
  { n: 212, call: 'RBLS', title: 'Road Blaster', year: 1985, maker: 'Data East', drv: 'bega', hw: '2× 6502 · 2× AY-3-8910 · Sony LDP-1000',
    sets: [['roadblaster', 'Original']],
    desc: 'Venganza en carretera con animación de Toei: volante, acelerador y turbo marcados sobre el tablero que dibuja la placa.', keys: 'Flechas: volante · Espacio: turbo · X/C: pedales · 5: moneda · 1: inicio' },
  { n: 213, call: 'ASTR', title: 'Astron Belt', year: 1983, maker: 'Sega / Bally Midway', drv: 'astron', hw: 'Z80 · sprites por línea · Hitachi VIP9500SG o LD-V1000',
    sets: [['astron', 'Producción (VIP9500SG)'], ['astronp', 'Prototipo (LD-V1000)']],
    desc: 'El primer laserdisc de Sega: tu caza en sprites contra naves sobre película de Toei y CGI.', keys: 'Flechas · Espacio: disparo · 5: moneda · 1: inicio' },
  { n: 214, call: 'GRNG', title: 'Galaxy Ranger', year: 1984, maker: 'Sega / Bally Midway', drv: 'astron', hw: 'Z80 · sprites por línea · VIP9500SG / LD-V1000',
    sets: [['galaxy', 'Producción'], ['galaxyp', 'Prototipo'], ['blazer', 'Star Blazer']],
    desc: 'Secuela de Astron Belt con anime de Toei; Star Blazer usa el mismo disco y hardware.', keys: 'Flechas · Espacio: disparo · 5: moneda · 1: inicio' },
  { n: 215, call: 'GPW', title: 'GP World', year: 1984, maker: 'Sega', drv: 'gpworld', hw: 'Z80 · LD-V1000 · sprites por línea',
    sets: [['gpworld', 'Original']],
    desc: 'Fórmula 1 de Sega: tu auto en sprites sobre pistas filmadas del laserdisc, con semáforo, vueltas y caja de dos marchas.', keys: '←/→: volante · X o ↓: acelerador · C: freno · Espacio: cambio LO/HI · 5: moneda · 1: inicio' },
  { n: 216, call: 'FFOX', title: 'Firefox', year: 1984, maker: 'Atari', drv: 'firefox', hw: '6809 + 6502 · 4×POKEY · 22VP931', analog: 'abs',
    sets: [['firefox', 'Rev 2'], ['firefoxa', 'Rev 1']],
    desc: 'Robas el Mig-31 de la película: sprites y mira de Atari sobre el laserdisc de Philips. Driver portado de MAME.', keys: 'Ratón o flechas: palanca · Espacio/X/C: disparos · 1: botón 4 · 5: moneda' },
  { n: 217, call: 'TQ', title: "Thayer's Quest", year: 1984, maker: 'RDI Video Systems', drv: 'thayers', hw: 'Z80 · LD-V1000 · teclado COP421 · SSI-263 → Votrax SC-01A',
    sets: [['tq', 'Original'], ['tq_alt', 'Alterna'], ['tq_swear', 'Con groserías']],
    desc: 'Aventura de fantasía con teclado de hechizos: la voz sale de un Votrax SC-01A emulado como en MAME, con subtítulos.', keys: 'Letras y números: teclado del gabinete · F1-F4: teclas de objetos · F5/F6: moneda · Tab: guía' },
  { n: 218, call: 'MCH3', title: 'MACH 3', year: 1983, maker: 'Mylstar (Gottlieb)', drv: 'mach3', hw: '8088 + 2× 6502 · 2× AY + DAC · PR-8210',
    sets: [['mach3', 'Original']],
    desc: 'Bombardeo y combate aéreo sobre película real; incluye los datos de blancos del disco (m3target.bin).', keys: 'Flechas · Espacio: cañón · X: bombas · 5: moneda · 1: inicio' },
  { n: 219, call: 'DL2', title: "Dragon's Lair II: Time Warp", year: 1991, maker: 'Leland / Sullivan Bluth', drv: 'lair2', hw: '8088 a 10 MHz · Sony LDP-1450 por COM2 (texto del reproductor) · altavoz PC · EEPROM 9536',
    sets: [['lair2', '3.19']],
    desc: 'Dirk viaja por el tiempo para rescatar a Daphne. Placa tipo PC con 8088 y un Sony LDP-1450: los puntajes y créditos los dibuja el propio reproductor.', keys: 'Flechas · Espacio: espada · 5: moneda · 1: inicio' },
  { n: 220, call: 'EURO', title: "Dragon's Lair / Space Ace (Euro)", year: 1983, maker: 'Atari / Cinematronics', pending: 'Z80 CTC/SIO + 22VP932', sets: [['laireuro', ''], ['lair_ita', ''], ['aceeuro', '']], desc: 'Versiones europeas con overlay de texto propio.' },
  { n: 221, call: 'SA91', title: "Space Ace '91", year: 1991, maker: 'Leland / Sullivan Bluth', drv: 'lair2', hw: '8088 a 10 MHz · Sony LDP-1450 por COM2 (texto del reproductor) · altavoz PC · EEPROM 9536',
    sets: [['ace91', 'US']],
    desc: "Relanzamiento de Space Ace sobre el hardware de Dragon's Lair II.", keys: 'Flechas · Espacio: espada · 5: moneda · 1: inicio' },
  { n: 222, call: 'CUBE', title: 'Cube Quest', year: 1983, maker: 'Simutrek', drv: 'cubeqst', hw: '68000 + 3 CPUs AM2901 · Simutrek 8748 + PR-8210', analog: 'rel', ldRestart: 1,
    sets: [['cubeqst', '01/04/84'], ['cubeqsta', '12/30/83']],
    desc: 'Polígonos 3D en tiempo real hechos por tres procesadores bit-slice sobre el laserdisc, controlado por la interfaz Simutrek (8748). Sin disco cargado usa sus propios fondos.', keys: 'Ratón o flechas: trackball · Espacio: fuego izq. · X: fuego der. · C o 1: cubo · 5: moneda' },

  { n: 223, call: 'UVT', title: 'Us vs. Them', year: 1984, maker: 'Mylstar (Gottlieb)', drv: 'mach3', hw: '8088 + 2× 6502 · 2× AY + DAC · PR-8210',
    sets: [['uvt', 'Original']],
    desc: 'Invasión alienígena con actores reales; mismo hardware que MACH 3. Necesita el romset uvt (usvs.rm0-rm4, fg, bg, drom, yrom), que no viene en la biblioteca.', keys: 'Flechas · Espacio: cañón · X: bombas · 5: moneda · 1: inicio' },

  { n: 224, call: 'TIME', title: 'Time Traveler', year: 1991, maker: 'Virtual Image Productions / Sega', drv: 'timetrv', hw: '80188 · Pioneer LD-V4200 por RS-232 · display de 16 caracteres',
    sets: [['timetrv', '18/06/1991']],
    desc: 'El juego holográfico: Marshal Gram viaja en el tiempo sobre video del disco; los mensajes salen en el display de LEDs del gabinete.', keys: 'Flechas · Espacio: ataque · X: cubo de reversa · 5: moneda · 1: inicio' },
  { n: 225, call: 'CSX', title: 'Casino Strip', year: 1988, maker: 'Status Games', drv: 'casinostrip', cabinet: 'casino', hw: '8085 · 8255 · AY-3-8910 · TMS9927 · Sony LDP por ACIA 6551 / Pioneer por interfaz paralela · dos monitores',
    sets: [['cs10_sps', 'X · Póker (Sony)'], ['cs12_sps', 'XII · Póker (Sony)'], ['cs11_ssp', 'XI · Shooting Gallery (Pioneer)']],
    desc: 'Póker de strip y galería de tiro sobre laserdisc de Status Games. El mueble tiene dos monitores: arriba el laserdisc, abajo los naipes y textos de la placa. Toca o haz clic en los botones del panel. Hardware de MAME statriv2.cpp (marcado como no funcional); aquí juega gracias a las instrucciones no documentadas del 8085 y a los enlaces con los reproductores Sony y Pioneer.',
    keys: '5/6: moneda · Q W E R T o teclado numérico 1-5: descartes/disparos · S: select · 1: start · Espacio o D: deal/draw · Enter, P o X: play · C o H: plantarse · 9: servicio · 0: test' },
  { n: 226, call: 'QHRS', title: 'Quarter Horse', year: 1983, maker: 'Electro-Sport', drv: 'qhorse', hw: '8085 · CRTC Intel 8275 (DMA por RST 6.5 + SOD) · AY-3-8910', experimental: 1,
    sets: [['quarterh', 'Set 1 (PR-8210)'], ['quarterha', 'Set 2 (PR-8210)'], ['quarterhb', 'Set 3 (LD-V2000)']],
    desc: 'Carreras de caballos con apuestas sobre laserdisc Pioneer. Corre la placa de juego de MAME dwarfd.cpp; la placa que maneja el reproductor (LDP Ctrl) no está emulada en ningún lado, así que se queda en la pantalla de contadores.', keys: '5/6: monedas · 1: inicio · ←↑↓→ y Q: apuestas 1-5 · Espacio: ×1 · X: ×2 · C: tomar' },
  { n: 227, call: 'PX7', title: 'Pioneer Palcom PX-7 (MSX LaserDisc)', year: 1984, maker: 'Pioneer', drv: 'px7', hw: 'MSX1 · Z80 · TMS9928 · PSG · P-BASIC + control de LaserDisc (openMSX)',
    sets: [['px7', 'PX-7']],
    desc: 'El MSX de Pioneer con control de laserdisc y superimposición. Carga el video del disco (con audio): el programa viene grabado en el canal derecho al principio del disco y se carga solo con CALL LD.', keys: 'Teclado completo del MSX (Tab: guía · F12: menú) · flechas/Espacio también en el control' },
  { n: 228, call: 'TGR', title: 'Top Gear (fangame)', year: 1984, maker: 'Universal · recreación de Luis', drv: 'topgear', analog: 'abs', fangame: 1, hw: 'Placa recreada "LD-Z80": Z80 4 MHz · LD-V1000 · 2× SN76489 · PCM 3 canales · barras de LEDs',
    sets: [['topgear', 'Recreación']],
    desc: 'FANGAME — recreación del juego de laserdisc perdido de Universal con la poca información que existe: hardware inventado que mezcla Mr. Do! y Super Don Quix-ote, con el driver topgear.cpp de Luis. Carga topgear.mp4 como laserdisc (atract 1-1951, pista 1952-6925).', keys: '←/→ o ratón: volante · ↑/Espacio: acelerador · 1/X: IGNITE · 5: moneda' },
  { n: 229, call: 'LAZN', title: 'Lazon (fangame)', year: 1983, maker: 'South Gate · reconstrucción LZ-R1 de Luis', drv: 'lazon', fangame: 1, hw: 'Placa tipo Thayer\'s Quest: Z80 4 MHz · TMS9128 con genlock · SN76489 · Votrax SC-01A · reproductor CED RCA SJT400',
    sets: [['lazon', 'LZ-R1']],
    desc: 'FANGAME — Lazon nunca salió y sólo sobrevive el videodisco CED. El programa y la placa son una reconstrucción hecha para manejar ese disco (driver lazon.cpp de Luis). Carga la captura del CED (31:14) como disco: attract 684-6698, 13 etapas desde el cuadro 6749.', keys: 'Flechas: mira · Espacio: disparo · 1: inicio · 5: moneda' },
  { n: 230, call: 'VHD', title: 'Victor HC-95 · MSX2 VHD', year: 1986, maker: 'Victor (JVC) · Taito / Wolf Team', drv: 'hc95', hw: 'MSX2 (BIOS + MSX2-BASIC + sub-ROM del HC-95) · V9938 · reproductor VHD por CALL VP',
    sets: [['timegal', 'Time Gal (VHD)'], ['thunder', 'Thunder Storm / Cobra Command (VHD)'], ['roadblst', 'Road Blaster (VHD)'], ['birdie', 'Birdie Try (VHD)']],
    desc: 'Los juegos VHD del MSX2: el programa corre en el HC-95 y controla el reproductor con CALL VP("…"). Time Gal, Road Blaster y Birdie Try se cargan como en la máquina real, con CLOAD y su cargador BASIC desde el audio del cassette/disco (decodificado y montado como cassette virtual); Thunder Storm se carga directo a la RAM. Carga el video del disco VHD como laserdisc del canal: con time_gal_vhd_clean.mp4 y thunder_storm_vhd_clean.mp4 el cuadro 0 del disco cae en el segundo 0 (Cuadro inicial = 0).', keys: 'Flechas o cursor: palanca · Espacio: disparo · teclado MSX completo (Tab: guía · F12: menú)' },
  { n: 231, call: 'GOLF', title: 'Golf Trainer (fangame)', year: 1984, maker: 'Atari · reconstrucción de Luis', drv: 'golftrnr', fangame: 1, hw: 'Placa Return of the Jedi (6502 ×2, 4 POKEY) + Philips 22VP931 como Fire Fox · genlock',
    sets: [['golftrnr', 'Reconstrucción']],
    desc: 'FANGAME — del prototipo de Atari sólo sobrevivieron el laserdisc y la descripción: se jugaba frente a un proyector golpeando una pelota de golf real. El romset es nuevo (driver golftrnr.cpp de Luis). Carga el laserdisc del juego (18:07, 32578 cuadros): partida desde 360, mapa del hoyo en 28112.', keys: 'Espacio o 1: golpe · 5/6: monedas · 9: servicio · 0: self test' },
  { n: 232, call: 'ACT', title: 'The Act', year: 2007, maker: 'Cecropia', src: 'theact/index.html', notLD: 1, hw: 'NO es laserdisc: animación a mano en video digital + motor "decaf" (recomp de Luis, Thumb-2 → JS)',
    desc: 'Parece un juego de laserdisc, pero no lo es: la arcade de 2007 reproduce animación dibujada a mano (estilo Disney) desde disco duro, y una sola perilla controla las emociones de Edgar. Esta es la recompilación de Luis con su motor de escenas. Corre en un servidor local: abre el receptor con JUGAR.bat o jugar.py.', keys: 'Perilla: ←/→ o ratón · el juego trae sus propios controles táctiles' },
  { n: 301, call: 'STAR', title: 'Star Rider', year: 1983, maker: 'Williams', drv: 'starrider', analog: 'px', hw: '6809 + PIF 6809 + 6808 · blitter Williams · PR-8210A · expansor VGG (núcleo de Luis, nativo)',
    sets: [['starridr', 'Producción'], ['starridrp3', 'CPU prototipo 3'], ['starridr_pif', 'PIF actualizado']],
    desc: 'Motos futuristas con blitter de Williams sobre el disco DISCAN. El disco se compone con el expansor y el retrovisor como en la placa (con video en línea va detrás, sin expansor).', keys: '←/→ o ratón: manubrio · ↑ acelerar · ↓ frenar · Espacio turbo · X alto/bajo · 1 inicio · 5 moneda · 0 avance · 9 auto' },
  { n: 302, call: 'FFTR', title: 'Freedom Fighter', year: 1987, maker: 'Millennium', drv: 'ffded', analog: 'px', hw: '68000 + TMS34061 + objetos + DMA 68440 · 22VP931 · audio 6809 + 4× CVSD (núcleo de Luis, nativo)',
    sets: [['ffr_ded', 'Placa dedicada R17']],
    desc: 'El shooter de laserdisc de la placa dedicada. El disco se compone con fondo, objetos y expansor como en tu emulador.', keys: 'Ratón o flechas: mira · clic/Espacio dispara · clic derecho/X cámara lenta · 5 moneda · 0 test' },
  { n: 303, call: 'COPS', title: 'COPS', year: 1994, maker: 'Nova / Atari Games', drv: 'cops', analog: 'px', hw: '6502 · 3× VIA6522 · R65C52 → Sony LDP-1450 · CDU33A · SN76489 (núcleo de Luis, nativo)',
    sets: [['cops', 'Cops (USA)'], ['copsuk', 'Cops (UK)'], ['revlatns', 'Revelations (quiz)'], ['visnqust', 'Vision Quest (quiz)']],
    desc: 'Pistola de luz en video FMV con volante y pedal, y los dos quiz de la misma placa Nova. El laserdisc puede ser un mp4 o un video en línea (YouTube o URL).', keys: 'Ratón: pistola 1 (clic dispara, clic derecho/X recarga) · mando 2: pistola 2 · ←/→ volante · ↑ pedal · 1 inicio · 5 moneda · 0 programa' },
  { n: 304, call: 'LGP', title: 'Laser Grand Prix', year: 1983, maker: 'Taito', drv: 'lgp', analog: 'abs', hw: 'Z80 4 MHz + 2× CDP1855 · placa OBJ (objetos 64×64 con zoom, 5 bpp) · sonido Z80 + AY-3-8910 · LD-V1000 (driver lgp.cpp corregido de Luis)',
    sets: [['lgp', 'Laser Grand Prix'], ['lgpalt', 'Alternativa (puntaje)']],
    desc: 'Carreras sobre laserdisc de Taito con el driver corregido de Luis: datos de pista por ventana, placa de objetos (el auto y los rivales), multiplicadores CDP1855 y paleta corregida.', keys: '←/→ o ratón: volante · ↑/Espacio: acelerar en marcha alta · X: marcha baja · ↓: pedal · 1: llave de encendido · 5 moneda · 9 servicio · 0 borrar récords' },
  { n: 305, call: 'ZANG', title: 'Inter Stellar Zangus', year: 1984, maker: 'Funai / Gakken', drv: 'zangus', hw: '3× Z80 · LD-V1000 · 2× SN76496 (placa tipo Interstellar)',
    sets: [['istellar2', 'Zangus (PCB)']],
    desc: 'La secuela inacabada de Interstellar Laser Fantasy, emulada desde el set istellar2 con el mapa de memoria corregido del port de Luis. Con el volcado del disco que no trae el minuto de lead-in, pon Cuadro inicial = 1801.', keys: 'Flechas: nave · Espacio/Z: disparo · X: disparo 2 · 5: moneda · 1: inicio · 9: servicio' },
  { n: 306, call: 'RRUN', title: 'Road Runner (laserdisc)', year: 1985, maker: 'Atari (prototipo)', drv: 'roadrunner', hw: '6502 + alfanuméricos y motion objects tipo System 1 · sonido 6502 con YM2151/POKEY sintetizados (núcleo de Luis, nativo)',
    sets: [['rr_laserdisc_roms', 'Prototipo']],
    desc: 'El Road Runner de laserdisc que Atari nunca sacó. Primero corre el auto-test de la placa (unos 20 s) y luego el attract.', keys: 'Flechas/mando: palanca · Espacio/X: saltos · 5 moneda · 1 inicio · 0 interruptor de test' },
  { n: 307, call: 'GAL3', title: 'Galaxian³ Theater 6', year: 1994, maker: 'Namco', drv: 'gal3', analog: 'px', wide: 1, hw: '68020×2 + 68000×3 + TMS320C25×4 (núcleo WASM de Luis, nativo) · laserdisc wide',
    sets: [['gal3', 'Project Dragoon']],
    desc: 'Project Dragoon para seis artilleros en un solo disco panorámico. Cada mando Bluetooth/USB toma un asiento (jugadores 1-6); el ratón es el artillero 1. Arranca en turbo (~35 s reales de la máquina).', keys: 'Ratón/táctil: mira y disparo del artillero 1 · mandos: un artillero cada uno (A dispara, B arma 2, Select moneda, Start inicio) · 5 moneda · 1 inicio' },

  { n: 308, call: 'NFL', title: 'NFL Football', year: 1983, maker: 'Bally Midway', drv: 'nflfoot', sets: [['nflfoot', 'NFL Football']], keys: 'J1: Espacio engage · Q W E R Y jugadas 1-5 · Z un jugador — J2: Enter engage · U I O P [ jugadas · X dos jugadores · mandos: uno por jugador · 5 moneda · 1 inicio · 2 continuar', hw: 'MCR III 91490 (Z80) + SSIO + Squawk & Talk + IPU · videodisco CED (núcleo de Luis, nativo)', desc: 'Fútbol americano sobre el videodisco CED de Midway, con los sprites escondidos detrás del video.' },
  { n: 330, call: 'MDOG', title: "Mad Dog McCree", year: 1990, maker: "American Laser Games", drv: 'alg', analog: 'px', sets: [['maddog', 'Placa ALG']], algGame: 'maddog', hw: 'Amiga 500 + Kickstart 1.3 + Sony LDP-1450 · núcleo SAE (WinUAE) con hardware ALG de WinUAE/MAME', desc: "Juego de pistola de luz con actores reales. Mad Dog McCree (v2.03 board rev.B). Carga el laserdisc (mp4 o en l\u00ednea) en la tarjeta del canal; el rat\u00f3n es la pistola 1 y un mando la pistola 2." },
  { n: 331, call: 'WSJR', title: "Who Shot Johnny Rock?", year: 1991, maker: "American Laser Games", drv: 'alg', analog: 'px', sets: [['wsjr', 'Placa ALG']], algGame: 'wsjr', hw: 'Amiga 500 + Kickstart 1.3 + Sony LDP-1450 · núcleo SAE (WinUAE) con hardware ALG de WinUAE/MAME', desc: "Juego de pistola de luz con actores reales. Who Shot Johnny Rock? (v1.6). Carga el laserdisc (mp4 o en l\u00ednea) en la tarjeta del canal; el rat\u00f3n es la pistola 1 y un mando la pistola 2." },
  { n: 332, call: 'MDG2', title: "Mad Dog II: The Lost Gold", year: 1992, maker: "American Laser Games", drv: 'alg', analog: 'px', sets: [['maddog2', 'Placa ALG']], algGame: 'maddog2', hw: 'Amiga 500 + Kickstart 1.3 + Sony LDP-1450 · núcleo SAE (WinUAE) con hardware ALG de WinUAE/MAME', desc: "Juego de pistola de luz con actores reales. Mad Dog II: The Lost Gold (v2.04). Carga el laserdisc (mp4 o en l\u00ednea) en la tarjeta del canal; el rat\u00f3n es la pistola 1 y un mando la pistola 2." },
  { n: 333, call: 'SPIR', title: "Space Pirates", year: 1992, maker: "American Laser Games", drv: 'alg', analog: 'px', sets: [['spacepir', 'Placa ALG']], algGame: 'spacepir', hw: 'Amiga 500 + Kickstart 1.3 + Sony LDP-1450 · núcleo SAE (WinUAE) con hardware ALG de WinUAE/MAME', desc: "Juego de pistola de luz con actores reales. Space Pirates (v2.2). Carga el laserdisc (mp4 o en l\u00ednea) en la tarjeta del canal; el rat\u00f3n es la pistola 1 y un mando la pistola 2." },
  { n: 334, call: 'GALL', title: "Gallagher's Gallery", year: 1992, maker: "American Laser Games", drv: 'alg', analog: 'px', sets: [['gallgall', 'Placa ALG']], algGame: 'gallgall', hw: 'Amiga 500 + Kickstart 1.3 + Sony LDP-1450 · núcleo SAE (WinUAE) con hardware ALG de WinUAE/MAME', desc: "Juego de pistola de luz con actores reales. Gallagher's Gallery (v2.2). Carga el laserdisc (mp4 o en l\u00ednea) en la tarjeta del canal; el rat\u00f3n es la pistola 1 y un mando la pistola 2." },
  { n: 335, call: 'CPAT', title: "Crime Patrol", year: 1993, maker: "American Laser Games", drv: 'alg', analog: 'px', sets: [['crimepat', 'Placa ALG']], algGame: 'crimepat', hw: 'Amiga 500 + Kickstart 1.3 + Sony LDP-1450 · núcleo SAE (WinUAE) con hardware ALG de WinUAE/MAME', desc: "Juego de pistola de luz con actores reales. Crime Patrol (v1.51). Carga el laserdisc (mp4 o en l\u00ednea) en la tarjeta del canal; el rat\u00f3n es la pistola 1 y un mando la pistola 2." },
  { n: 336, call: 'CPT2', title: "Crime Patrol 2: Drug Wars", year: 1993, maker: "American Laser Games", drv: 'alg', analog: 'px', sets: [['crimep2', 'Placa ALG']], algGame: 'crimep2', hw: 'Amiga 500 + Kickstart 1.3 + Sony LDP-1450 · núcleo SAE (WinUAE) con hardware ALG de WinUAE/MAME', desc: "Juego de pistola de luz con actores reales. Crime Patrol 2: Drug Wars (v1.3). Carga el laserdisc (mp4 o en l\u00ednea) en la tarjeta del canal; el rat\u00f3n es la pistola 1 y un mando la pistola 2." },
  { n: 337, call: 'LBH', title: "The Last Bounty Hunter", year: 1994, maker: "American Laser Games", drv: 'alg', analog: 'px', sets: [['lastbh', 'Placa ALG']], algGame: 'lastbh', hw: 'Amiga 500 + Kickstart 1.3 + Sony LDP-1450 · núcleo SAE (WinUAE) con hardware ALG de WinUAE/MAME', desc: "Juego de pistola de luz con actores reales. The Last Bounty Hunter (v1.01). Carga el laserdisc (mp4 o en l\u00ednea) en la tarjeta del canal; el rat\u00f3n es la pistola 1 y un mando la pistola 2." },
  { n: 338, call: 'FDRW', title: "Fast Draw Showdown", year: 1995, maker: "American Laser Games", drv: 'alg', analog: 'px', sets: [['fastdraw', 'Placa ALG']], algGame: 'fastdraw', hw: 'Amiga 500 + Kickstart 1.3 + Sony LDP-1450 · núcleo SAE (WinUAE) con hardware ALG de WinUAE/MAME', desc: "Juego de pistola de luz con actores reales. Fast Draw Showdown (v1.31). Carga el laserdisc (mp4 o en l\u00ednea) en la tarjeta del canal; el rat\u00f3n es la pistola 1 y un mando la pistola 2." },
  { n: 339, call: 'PLTN', title: "Platoon", year: 1995, maker: "Nova?", drv: 'alg', analog: 'px', sets: [['aplatoon', 'Placa ALG']], algGame: 'aplatoon', hw: 'Amiga 500 + Kickstart 1.3 + Sony LDP-1450 · núcleo SAE (WinUAE) con hardware ALG de WinUAE/MAME', desc: "Juego de pistola de luz con actores reales. Platoon (V.3.1 US). Carga el laserdisc (mp4 o en l\u00ednea) en la tarjeta del canal; el rat\u00f3n es la pistola 1 y un mando la pistola 2." },
  { n: 340, call: 'MVIC', title: "Marbella Vice", year: 1994, maker: "Picmatic", drv: 'alg', analog: 'px', sets: [['marvice', 'Placa ALG']], algGame: 'marvice', hw: 'Amiga 500 + Kickstart 1.3 + Sony LDP-1450 · núcleo SAE (WinUAE) con hardware ALG de WinUAE/MAME', desc: "Juego de pistola de luz con actores reales. Marbella Vice. Carga el laserdisc (mp4 o en l\u00ednea) en la tarjeta del canal; el rat\u00f3n es la pistola 1 y un mando la pistola 2." },
  { n: 341, call: 'TSAL', title: "Tierras Salvajes", year: 1995, maker: "Picmatic", drv: 'alg', analog: 'px', sets: [['tierras100hz', 'Placa ALG']], algGame: 'tierras100hz', hw: 'Amiga 500 + Kickstart 1.3 + Sony LDP-1450 · núcleo SAE (WinUAE) con hardware ALG de WinUAE/MAME', desc: "Juego de pistola de luz con actores reales. Tierras Salvajes (100Hz display). Carga el laserdisc (mp4 o en l\u00ednea) en la tarjeta del canal; el rat\u00f3n es la pistola 1 y un mando la pistola 2." },
  { n: 342, call: 'ZORT', title: "Zorton Brothers", year: 1994, maker: "Picmatic", drv: 'alg', analog: 'px', sets: [['zortonbr', 'Placa ALG']], algGame: 'zortonbr', hw: 'Amiga 500 + Kickstart 1.3 + Sony LDP-1450 · núcleo SAE (WinUAE) con hardware ALG de WinUAE/MAME', desc: "Juego de pistola de luz con actores reales. Zorton Brothers / Los Justicieros (v1.01). Carga el laserdisc (mp4 o en l\u00ednea) en la tarjeta del canal; el rat\u00f3n es la pistola 1 y un mando la pistola 2." },
  { n: 400, call: 'SNGE', title: 'Singe', year: 2006, maker: 'Hypseus Singe', singe: 1, hw: 'Lua (fengari) + API Singe 1/2', desc: 'Carga la carpeta de un juego Singe (script .singe, framefile y video mp4) y corre aquí mismo.' }
];
const EMU_NAMES = {};
const chByNum = n => CHANNELS.find(c => c.n === n);

/* --------------------------------------------------------- estado */
const S = {
  lib: new RomLibrary(), emus: {}, cur: null, set: null, game: null, singe: null,
  mode: 'tv', guideRow: 0, guideCol: 0, entry: '', settings: { vol: 0.8, crt: true, discVol: 1 }, audio: null,
  video: null, keysHeld: new Set()
};
try { Object.assign(S.settings, JSON.parse(localStorage.getItem('ddn.settings') || '{}')); } catch (e) {}
const saveSettings = () => { try { localStorage.setItem('ddn.settings', JSON.stringify(S.settings)); } catch (e) {} };

function toast(t, ms) { const el = $('#toast'); el.textContent = t; el.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => el.style.display = 'none', ms || 2600); }
function clockHTML() { return clockStr().replace(':', '<i style="font:inherit;font-family:var(--guide);font-style:normal;margin:0 2px">:</i>'); }
function clockStr(d) { d = d || new Date(); let h = d.getHours(), m = d.getMinutes(); const ap = h >= 12 ? 'p' : 'a'; h = h % 12 || 12; return h + ':' + String(m).padStart(2, '0') + ap; }

/* ------------------------------------------------------ datos embebidos */
async function loadEmbedded() {
  const zips = {};
  for (const el of document.querySelectorAll('script[type="text/x-rom"]')) {
    const bin = atob(el.textContent.trim()), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    zips[el.dataset.name] = u8; el.textContent = '';
  }
  /* versión expandida: cada zip de ROMs es un data/roms/*.js que llena window.DDN_ROMS */
  for (const [name, b64] of (window.DDN_ROMS || [])) {
    const bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    zips[name] = u8;
  }
  window.DDN_ROMS = [];
  await S.lib.load(zips);
  for (const el of document.querySelectorAll('script[type="text/x-emu"]')) {
    S.emus[el.dataset.id] = { html: () => el.textContent.replace(/[\uE000\uE001]/g, '') }; EMU_NAMES[el.dataset.id] = el.dataset.title;
  }
  for (const id in (window.DDN_EMUS || {})) { const e = window.DDN_EMUS[id]; S.emus[id] = { html: () => e.html }; EMU_NAMES[id] = e.title; }
}
const emuHTML = id => { const el = S.emus[id]; return el ? el.html() : null; };

/* ------------------------------------------------------------- audio */
function ensureAudio() {
  if (S.audio) { if (S.audio.ctx.state === 'suspended') S.audio.ctx.resume(); return S.audio; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  const ctx = new AC(), gain = ctx.createGain(); gain.gain.value = S.settings.vol; gain.connect(ctx.destination);
  const ring = new Float32Array(16384); let rd = 0, wr = 0;
  const sp = ctx.createScriptProcessor(1024, 0, 1);
  sp.onaudioprocess = e => {
    const out = e.outputBuffer.getChannelData(0);
    for (let i = 0; i < out.length; i++) { if (rd !== wr) { out[i] = ring[rd]; rd = (rd + 1) & 16383; } else out[i] = 0; }
  };
  sp.connect(gain);
  const sfx = ctx.createGain(); sfx.connect(gain);
  S.audio = { ctx, gain, sfx, push(v) { const n = (wr + 1) & 16383; if (n !== rd) { ring[wr] = v; wr = n; } }, fill() { return (wr - rd + 16384) & 16383; }, flush() { rd = wr; } };
  return S.audio;
}

/* ------------------------------------------- video del laserdisc (VLDP) */
function getLdTap() {
  if (S.ldTap) return S.ldTap;
  const A = S.audio; if (!A) return null;
  const ctx = A.ctx, src = ctx.createMediaElementSource(vid), sp = ctx.createChannelSplitter(2), mg = ctx.createChannelMerger(2);
  const gL = ctx.createGain(), gR = ctx.createGain(), out = ctx.createGain();
  src.connect(sp); sp.connect(gL, 0); sp.connect(gR, 1); gL.connect(mg, 0, 0); gR.connect(mg, 0, 1); mg.connect(out); out.connect(ctx.destination);
  const cap = ctx.createScriptProcessor(1024, 2, 1), buf = new Float32Array(ctx.sampleRate * 4);
  const T = { buf, sr: ctx.sampleRate, write: 0, px7: false,
    setMute(l, r, st) { gL.gain.value = l ? 0 : 1; gR.gain.value = r ? 0 : 1; },
    reset() { gL.gain.value = gR.gain.value = 1; this.px7 = false; } };
  cap.onaudioprocess = ev => {
    const inp = ev.inputBuffer, ch = inp.numberOfChannels > 1 ? inp.getChannelData(1) : inp.getChannelData(0);
    for (let i = 0; i < ch.length; i++) buf[(T.write + i) % buf.length] = ch[i];
    T.write += ch.length; ev.outputBuffer.getChannelData(0).fill(0);
  };
  src.connect(cap); const z = ctx.createGain(); z.gain.value = 0; cap.connect(z); z.connect(ctx.destination);
  T.out = out; S.ldTap = T; return T;
}

/* ----------------------------------------------------- video en línea
   Además del mp4 local, el laserdisc puede ser una URL: un video directo
   (mp4/webm por http) o YouTube. Para YouTube se usa la IFrame API y un
   adaptador que se comporta como el <video> que DiscVideo ya sabe esclavizar
   al reproductor emulado (currentTime, paused, play, pause, playbackRate…). */
function parseYouTube(u) {
  try {
    const url = new URL(u.trim());
    if (/(^|\.)youtu\.be$/.test(url.hostname)) return { id: url.pathname.slice(1).split('/')[0], t: parseFloat(url.searchParams.get('t')) || 0 };
    if (/youtube\.com$/.test(url.hostname) || /youtube-nocookie\.com$/.test(url.hostname)) {
      const id = url.searchParams.get('v') || (url.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/) || [])[1];
      if (id) return { id, t: parseFloat(url.searchParams.get('t')) || 0 };
    }
  } catch (e) {}
  return null;
}
let ytApi = null;
function loadYTApi() {
  if (ytApi) return ytApi;
  ytApi = new Promise((res, rej) => {
    if (window.YT && window.YT.Player) return res(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) try { prev(); } catch (e) {} res(window.YT); };
    const sc = document.createElement('script'); sc.src = 'https://www.youtube.com/iframe_api';
    sc.onerror = () => { ytApi = null; rej(new Error('No se pudo cargar la API de YouTube (¿sin internet o abierto desde file://?)')); };
    document.head.appendChild(sc);
  });
  return ytApi;
}
class YTVideo {
  constructor(host, id) {
    this.id = id; this.ready = false; this._paused = true; this._rate = 1; this._muted = true; this._vol = 1; this._t = 0; this._dur = NaN; this.seeking = false;
    this.box = document.createElement('div'); this.box.id = 'ytbox';
    this.box.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:#000';
    const inner = document.createElement('div'); this.box.appendChild(inner);
    host.insertBefore(this.box, host.firstChild);
    this.style = this.box.style;
    this.p = null;
    loadYTApi().then(YT => {
      this.p = new YT.Player(inner, { width: '100%', height: '100%', videoId: id,
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, playsinline: 1, rel: 0, iv_load_policy: 3, cc_load_policy: 0 },
        events: {
          onReady: () => { this.ready = true; try { this.p.mute(); this._dur = this.p.getDuration(); this.p.seekTo(this._t, true); this.p.pauseVideo(); } catch (e) {} const f = this.box.querySelector('iframe'); if (f) f.style.cssText = 'width:100%;height:100%;border:0'; },
          onStateChange: e => { this.state = e.data; if (e.data === 1 || e.data === 2) this.seeking = false; },
          onError: e => toast('YouTube no permite reproducir este video incrustado (error ' + e.data + ')', 6000)
        } });
    }).catch(e => toast(e.message, 6000));
  }
  get readyState() { return this.ready ? 4 : 0; }
  get duration() { if (this.ready) { const d = this.p.getDuration(); if (d > 0) this._dur = d; } return this._dur; }
  get currentTime() { return this.ready ? this.p.getCurrentTime() : this._t; }
  set currentTime(t) { this._t = t; if (this.ready) { this.seeking = true; this.p.seekTo(t, true); setTimeout(() => { this.seeking = false; }, 400); } }
  get paused() { return this._paused; }
  play() { this._paused = false; if (this.ready) this.p.playVideo(); return Promise.resolve(); }
  pause() { this._paused = true; if (this.ready) this.p.pauseVideo(); }
  get playbackRate() { return this._rate; }
  set playbackRate(r) { const ok = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]; let b = 1; for (const x of ok) if (Math.abs(x - r) < Math.abs(b - r)) b = x; if (b !== this._rate) { this._rate = b; if (this.ready) this.p.setPlaybackRate(b); } }
  get muted() { return this._muted; }
  set muted(m) { this._muted = m; if (this.ready) m ? this.p.mute() : this.p.unMute(); }
  get volume() { return this._vol; }
  set volume(v) { this._vol = v; if (this.ready) this.p.setVolume(Math.round(v * 100)); }
  addEventListener() {} removeAttribute() {} load() {}
  destroy() { try { this.p && this.p.destroy(); } catch (e) {} this.box.remove(); }
}

class DiscVideo {
  constructor(el) {
    this.el = el; this.segs = []; this.cur = null; this.lastSeek = -1; this.vol = 1; this.forceMute = false;
    this.pending = null; this.stallAt = 0; this.rate = 1; this.missing = false; this.muteState = null; this.volState = -1;
    this.mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    /* las búsquedas se encadenan: nunca se pide un currentTime nuevo mientras el anterior no terminó */
    el.addEventListener('seeked', () => { if (this.pending !== null) { const t = this.pending; this.pending = null; this.seek(t); } });
    el.addEventListener('waiting', () => { if (!this.stallAt) this.stallAt = performance.now(); });
    el.addEventListener('playing', () => { this.stallAt = 0; });
    el.addEventListener('timeupdate', () => { if (!el.seeking && el.readyState >= 3) this.stallAt = 0; });
    for (const a of ['disablepictureinpicture', 'disableremoteplayback', 'webkit-playsinline', 'x-webkit-airplay']) el.setAttribute(a, a === 'x-webkit-airplay' ? 'deny' : '');
    this.missEl = document.createElement('div'); this.missEl.id = 'ldmiss';
    this.missEl.innerHTML = '<div class="m1">Missing laserdisc content</div><div class="m2">insert a larger one</div><div class="m3">or you will see this on big ld command seeks</div>';
    el.parentNode.insertBefore(this.missEl, el.nextSibling);
  }
  clear() { this.onlineUrl = null; if (this.yt) { this.yt.destroy(); this.yt = null; this.el = this.vidEl || this.el; this.el.style.visibility = ''; } for (const s of this.segs) if (s.url && s.file) URL.revokeObjectURL(s.url); this.segs = []; this.cur = null; this.pending = null; this.setMissing(false); this.el.removeAttribute('src'); this.el.load(); }
  set(segs) { this.clear(); this.segs = segs.sort((a, b) => a.start - b.start); for (const s of this.segs) if (s.file) s.url = URL.createObjectURL(s.file); }
  /* laserdisc desde una URL: YouTube o video directo */
  setOnline(url, start) {
    this.clear(); this.vidEl = this.vidEl || this.el;
    const yt = parseYouTube(url);
    if (yt) {
      this.yt = new YTVideo(this.vidEl.parentNode, yt.id); this.el = this.yt; this.vidEl.style.visibility = 'hidden';
      this.segs = [{ start: start || 0, url: null, online: url, yt: true, offset: yt.t }];
    } else this.segs = [{ start: start || 0, url, online: url }];
    this.onlineUrl = url;
  }
  get has() { return this.segs.length > 0; }
  segFor(frame) { let r = this.segs[0]; for (const s of this.segs) if (frame >= s.start) r = s; return r; }
  seek(t) {
    const v = this.el;
    if (v.seeking) { this.pending = t; return; }
    this.lastSeek = t;
    try { v.currentTime = t; } catch (e) {}
  }
  setMissing(on) {
    if (on === this.missing) return;
    this.missing = on; this.missEl.style.display = on ? 'flex' : 'none';
    if (on && !this.el.paused) this.el.pause();
  }
  sync(ldp, blank) {
    const v = this.el;
    if (!this.segs.length) { this.setMissing(false); return; }
    const f = ldp.frame + (ldp.frac || 0), frame = ldp.status === LDP_SEARCHING ? ldp.target : f, seg = this.segFor(frame);
    if (seg !== this.cur) { this.cur = seg; if (!seg.yt) v.src = seg.url; this.lastSeek = -1; this.pending = null; }
    const t = Math.max(0, (frame - seg.start) / ldp.fps + 0.0005 + (seg.offset || 0));
    const playing = ldp.status === LDP_PLAYING;
    /* el comando pide un cuadro más allá del final del video cargado (o antes del primer segmento) */
    const dur = v.duration, past = (Number.isFinite(dur) && dur > 0 && t > dur - 0.04) || frame < seg.start - 1;
    this.setMissing(!!past && !blank && v.readyState >= 1);
    v.style.visibility = (blank || past || (ldp.squelchSearch && ldp.status === LDP_SEARCHING)) ? 'hidden' : 'visible';
    if (v.readyState < 1 || past) return;
    if (playing) {
      const rate = ldp.speedNum / ldp.speedDen, tol = this.yt ? 1.0 : this.mobile ? 0.6 : 0.3;
      if (v.paused) { this.seek(t); v.play().catch(() => {}); }
      /* atasco: si el decodificador se queda esperando más de 1,2 s, se le da un empujón al cuadro actual */
      if (this.stallAt && performance.now() - this.stallAt > 1200 && !v.seeking) { this.stallAt = performance.now(); this.seek(t + 0.05); }
      const drift = v.currentTime - t;
      if (Math.abs(drift) > tol) { if (!v.seeking) this.seek(t); }
      else if (this.yt) { v.playbackRate = rate; }
      else {
        const want = Math.max(0.25, Math.min(8, rate * (1 - drift * (this.mobile ? 0.35 : 0.6))));
        if (Math.abs(want - this.rate) > (this.mobile ? 0.04 : 0.01)) { this.rate = want; v.playbackRate = want; }
      }
      this.lastSeek = -1;
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(t - this.lastSeek) > (this.yt ? 0.2 : 0.5 / ldp.fps)) this.seek(t);
    }
    if (S.ldTap && S.ldTap.px7) { if (this.muteState !== false) { this.muteState = false; v.muted = false; } S.ldTap.out.gain.value = this.forceMute ? 0 : Math.min(1, S.settings.vol * this.vol); if (this.volState !== 1) { this.volState = 1; v.volume = 1; } return; }
    const mute = this.forceMute || !(ldp.audio1 || ldp.audio2) || !playing;
    if (mute !== this.muteState) { this.muteState = mute; v.muted = mute; }
    const vol = Math.min(1, S.settings.vol * this.vol);
    if (Math.abs(vol - this.volState) > 0.005) { this.volState = vol; v.volume = vol; }
  }
}

/* framefile de Daphne: primera línea = carpeta, luego "cuadro  archivo" */
function parseFramefile(txt) {
  const out = [];
  for (const line of txt.split(/\r?\n/).slice(1)) {
    const m = line.trim().match(/^(-?\d+)\s+(.+)$/); if (m) out.push({ start: +m[1], name: m[2].trim() });
  }
  return out;
}
const baseNoExt = n => n.replace(/\\/g, '/').split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();
const isVideo = f => /\.(mp4|webm|mkv|ogv|mov|m4v)$/i.test(f.name) || (f.type || '').startsWith('video/');

function buildSegments(files, defaultStart) {
  const ff = files.find(f => /\.txt$/i.test(f.name));
  const vids = files.filter(isVideo);
  const bad = files.filter(f => /\.(m2v|mpg|mpeg)$/i.test(f.name));
  return (async () => {
    if (ff) {
      const entries = parseFramefile(await ff.text()), segs = [], miss = [];
      for (const e of entries) {
        const v = vids.find(x => baseNoExt(x.name) === baseNoExt(e.name));
        if (v) segs.push({ start: e.start, file: v, name: v.name }); else miss.push(e.name);
      }
      return { segs, miss, bad };
    }
    return { segs: vids.map((v, i) => ({ start: i === 0 ? defaultStart : defaultStart, file: v, name: v.name })).slice(0, 1), miss: [], bad };
  })();
}

/* recordar el video por canal (File System Access API, si existe) */
const IDB = {
  db: null,
  open() { return this.db || (this.db = new Promise((res, rej) => { const r = indexedDB.open('ddn', 2); r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })); },
  async get(k) { try { const d = await this.open(); return await new Promise(r => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(undefined); }); } catch (e) { return undefined; } },
  async set(k, v) { try { const d = await this.open(); await new Promise(r => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = r; t.onerror = r; }); } catch (e) {} },
  async del(k) { try { const d = await this.open(); await new Promise(r => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = r; t.onerror = r; }); } catch (e) {} }
};

/* ===================================================== JUGADORES Y RÉCORDS */
const HS = {
  load() { try { return JSON.parse(localStorage.getItem('ddn.scores') || '{}'); } catch (e) { return {}; } },
  save(d) { try { localStorage.setItem('ddn.scores', JSON.stringify(d)); } catch (e) {} },
  players() { try { return JSON.parse(localStorage.getItem('ddn.players') || '[]'); } catch (e) { return []; } },
  add(ch, set, name, score) {
    if (!(score > 0)) return false;
    const d = HS.load(), k = String(ch.n), list = d[k] = d[k] || [];
    list.push({ name, score: Math.floor(score), set, date: new Date().toISOString().slice(0, 10) });
    list.sort((a, b) => b.score - a.score); d[k] = list.slice(0, 10); HS.save(d); return true;
  },
  totals() {
    const d = HS.load(), per = {};
    for (const k in d) {
      const best = {};
      for (const e of d[k]) best[e.name] = Math.max(best[e.name] || 0, e.score);
      for (const n in best) { const p = per[n] = per[n] || { name: n, total: 0, games: 0, top: null, topScore: 0 }; p.total += best[n]; p.games++; if (best[n] > p.topScore) { p.topScore = best[n]; p.top = k; } }
    }
    return Object.values(per).sort((a, b) => b.total - a.total);
  }
};
function setPlayer(name) {
  name = String(name || '').trim().slice(0, 16); if (!name) return;
  S.player = name;
  const pl = PF.list(); if (!pl.some(p => p.name === name) && pl.length < 10) { pl.push({ id: 'p' + Date.now(), name, color: PF_COLORS[pl.length % 10], img: null }); PF.save(pl); }
  const ps = HS.players().filter(p => p.toLowerCase() !== name.toLowerCase()); ps.unshift(name);
  try { localStorage.setItem('ddn.players', JSON.stringify(ps.slice(0, 20))); localStorage.setItem('ddn.player', name); } catch (e) {}
  if (S.mode === 'guide') drawGuide();
}
function dialog(html, onMount) {
  return new Promise(res => {
    const d = $('#dlg'); d.innerHTML = '<div class="bev dbox">' + html + '</div>'; d.classList.add('on');
    const prev = S.mode; S.mode = 'dialog';
    const done = v => { d.classList.remove('on'); d.innerHTML = ''; S.mode = prev === 'dialog' ? 'tv' : prev; res(v); };
    onMount(d, done);
  });
}
const PF_COLORS = ['#e50914', '#f5a623', '#2d9d4a', '#1f6fe5', '#8e44ad', '#16a2a8', '#d4387e', '#6d7a8c', '#b35a1f', '#3b3b9e'];
const PF = {
  list() { try { const l = JSON.parse(localStorage.getItem('ddn.profiles') || 'null'); if (l) return l; } catch (e) {}
    return HS.players().slice(0, 10).map((n, i) => ({ id: 'p' + i + Date.now(), name: n, color: PF_COLORS[i % 10], img: null })); },
  save(l) { try { localStorage.setItem('ddn.profiles', JSON.stringify(l.slice(0, 10))); return true; } catch (e) { toast('No cabe en el almacenamiento del navegador: usa una imagen más pequeña'); return false; } }
};
const esc = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const avatarHTML = (p, cls) => `<span class="${cls || 'av'}" style="background-color:${p.color};${p.img ? `background-image:url(${p.img})` : ''}">${p.img ? '' : esc((p.name || '?')[0].toUpperCase())}</span>`;
function curProfile() { return PF.list().find(p => p.name === S.player); }
let profResolve = null, profSel = 0, profManage = false;
function openProfiles(first) {
  return new Promise(res => {
    profResolve = res; profManage = false;
    const l = PF.list(); profSel = Math.max(0, l.findIndex(p => p.name === S.player));
    S.prevMode = S.mode === 'profiles' ? 'guide' : S.mode; S.mode = 'profiles';
    drawProfiles(first);
  });
}
function drawProfiles(first) {
  const l = PF.list(), el = $('#prof');
  el.className = 'on' + (profManage ? ' manage' : '');
  el.innerHTML = `<div class="pf-head"><div class="pf-logo">d<b>d</b>n</div></div>
    <div class="pf-title">${profManage ? 'Administrar perfiles' : '¿Quién está viendo?'}</div>
    <div class="pf-grid">${l.map((p, i) => `<button class="pf${i === profSel ? ' sel' : ''}" data-i="${i}">${avatarHTML(p).replace('</span>', '<span class="edit">✎</span></span>')}<span>${esc(p.name)}</span></button>`).join('')}
    ${l.length < 10 ? `<button class="pf add${profSel === l.length ? ' sel' : ''}" data-i="new"><span class="av">+</span><span>Agregar perfil</span></button>` : ''}</div>
    <div class="pf-foot"><button class="pf-btn" id="pfManage">${profManage ? 'LISTO' : 'ADMINISTRAR PERFILES'}</button></div>
    <div style="color:#6f7fae;font:600 13px Arial">Hasta 10 perfiles · los récords se guardan en este navegador · control: ◀ ▶ y SELECT</div>
    <div class="pf-foot">${LANGS.map((l, i) => `<button class="pf-btn${(S.settings.lang || 'es') === l[0] ? ' on' : ''}" data-lang="${l[0]}">${i + 1}. ${l[1]}</button>`).join('')}</div>`;
  el.querySelectorAll('[data-i]').forEach(b => b.onclick = () => pickProfile(b.dataset.i));
  $('#pfManage').onclick = () => { profManage = !profManage; drawProfiles(); };
  el.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => { S.settings.lang = b.dataset.lang; saveSettings(); setLang(b.dataset.lang); drawProfiles(); });
}
function pickProfile(i) {
  const l = PF.list();
  if (i === 'new' || i === l.length) { editProfile(null); return; }
  i = +i;
  if (profManage) { editProfile(i); return; }
  setPlayer(l[i].name); closeProfiles();
}
function closeProfiles() {
  $('#prof').className = ''; $('#prof').innerHTML = '';
  S.mode = S.prevMode && S.prevMode !== 'profiles' ? S.prevMode : 'guide';
  if (S.mode === 'guide') drawGuide();
  const r = profResolve; profResolve = null; if (r) r(S.player);
}
function profKey(k) {
  const dg = /^Digit([1-5])$/.exec(k); if (dg) { const l = LANGS[+dg[1] - 1][0]; S.settings.lang = l; saveSettings(); setLang(l); drawProfiles(); return; }
  const l = PF.list(), max = l.length < 10 ? l.length : l.length - 1;
  if (k === 'ArrowLeft' || k === 'chdn') profSel = Math.max(0, profSel - 1);
  else if (k === 'ArrowRight' || k === 'chup') profSel = Math.min(max, profSel + 1);
  else if (k === 'Enter' || k === 'select') { pickProfile(profSel >= l.length ? 'new' : profSel); return; }
  else if (k === 'menu' || k === 'KeyM') { profManage = !profManage; }
  else if ((k === 'Escape' || k === 'guide' || k === 'power') && S.player) { closeProfiles(); return; }
  drawProfiles();
}
function editProfile(i) {
  const l = PF.list(), isNew = i === null;
  const p = isNew ? { id: 'p' + Date.now(), name: '', color: PF_COLORS[l.length % 10], img: null } : Object.assign({}, l[i]);
  const el = $('#prof');
  const draw = () => {
    el.innerHTML = `<div class="pf-ed"><h3>${isNew ? 'Nuevo perfil' : 'Editar perfil'}</h3>
      <div class="row">${avatarHTML(p)}<div style="display:grid;gap:6px;flex:1">
        <button class="bevb" id="peImg">Importar imagen…</button>${p.img ? '<button class="bevb" id="peNoImg">Quitar imagen</button>' : ''}</div></div>
      <div class="row">${PF_COLORS.map(c => `<button class="sw${c === p.color ? ' on' : ''}" data-c="${c}" style="background:${c}" aria-label="Color"></button>`).join('')}</div>
      <div class="row"><input type="text" id="peName" maxlength="16" placeholder="Nombre" value="${esc(p.name)}"></div>
      <div class="row"><button class="bevb gold" id="peOk">Guardar</button><button class="bevb" id="peCancel">Cancelar</button>${isNew ? '' : '<button class="bevb" id="peDel" style="margin-left:auto;background:linear-gradient(#e24,#a01)">Borrar</button>'}</div></div>`;
    const nm = $('#peName'); nm.oninput = () => { p.name = nm.value; }; nm.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') $('#peOk').click(); };
    el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { p.color = b.dataset.c; draw(); });
    $('#fAvatar').onchange = async () => { const f = $('#fAvatar'), file = f.files[0]; if (!file) return; p.img = await avatarFromFile(file); f.value = ''; draw(); };
    $('#peImg').onclick = () => $('#fAvatar').click();
    const ni = $('#peNoImg'); if (ni) ni.onclick = () => { p.img = null; draw(); };
    $('#peCancel').onclick = () => drawProfiles();
    const del = $('#peDel'); if (del) del.onclick = () => { const nl = PF.list().filter(x => x.id !== p.id); PF.save(nl); if (S.player === p.name) S.player = nl[0] ? nl[0].name : ''; profSel = 0; drawProfiles(); };
    $('#peOk').onclick = () => {
      p.name = (p.name || '').trim().slice(0, 16); if (!p.name) { toast('Escribe un nombre'); return; }
      const nl = PF.list(); if (nl.some(x => x.id !== p.id && x.name.toLowerCase() === p.name.toLowerCase())) { toast('Ya hay un perfil con ese nombre'); return; }
      if (isNew) nl.push(p); else { const j = nl.findIndex(x => x.id === p.id); if (j >= 0) { if (nl[j].name !== p.name) renameScores(nl[j].name, p.name); nl[j] = p; } }
      if (PF.save(nl)) { profSel = nl.findIndex(x => x.id === p.id); drawProfiles(); }
    };
    setTimeout(() => nm.focus(), 40);
  };
  draw();
}
function renameScores(from, to) { const d = HS.load(); for (const k in d) for (const e of d[k]) if (e.name === from) e.name = to; HS.save(d); if (S.player === from) S.player = to; }
function avatarFromFile(file) {
  return new Promise(res => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      const sz = Math.min(img.width, img.height); g.drawImage(img, (img.width - sz) / 2, (img.height - sz) / 2, sz, sz, 0, 0, 128, 128);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('No pude leer esa imagen'); res(null); };
    img.src = url;
  });
}
function askPlayer(first) { return openProfiles(first); }
function askScore(ch, set, hint) {
  return dialog(`<h3>Récord · ${ch.title}</h3>
    <p>${hint || 'Este juego no reporta su puntuación automáticamente.'} Escribe los puntos que hiciste para guardarlos a nombre de <b>${(S.player || '').replace(/</g, '&lt;')}</b>.</p>
    <div class="row"><input id="sVal" inputmode="numeric" placeholder="Puntos"><button class="bevb gold" id="sOk">Guardar</button><button class="bevb" id="sNo">No guardar</button></div>`, (d, done) => {
    const inp = d.querySelector('#sVal'); setTimeout(() => inp.focus(), 50);
    const ok = () => { const v = parseInt(inp.value.replace(/\D/g, ''), 10); if (v > 0 && HS.add(ch, set, S.player, v)) toast('Récord guardado: ' + S.player + ' · ' + v.toLocaleString('es-MX')); done(v); };
    d.querySelector('#sOk').onclick = ok; d.querySelector('#sNo').onclick = () => done(0);
    inp.onkeydown = e => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') done(0); e.stopPropagation(); };
  });
}
function finishSession() {
  const ss = S.session; S.session = null;
  if (!ss || !S.player) return;
  if (ss.best > 0 && ss.coins > 0) { if (HS.add(ss.ch, ss.set, S.player, ss.best)) toast('Récord guardado: ' + S.player + ' · ' + ss.ch.title + ' · ' + ss.best.toLocaleString('es-MX'), 3500); }
  else if (ss.coins > 0) setTimeout(() => askScore(ss.ch, ss.set), 500);
}

/* ============================================================ SINTONÍA */
const tv = $('#tv'), ovc = $('#ov'), ovx = ovc.getContext('2d'), vid = $('#vid');
S.video = new DiscVideo(vid);
let ovImg = null, ovU32 = null;


/* ------------------------------------------- vista de gabinete (Casino Strip)
   El mueble real tiene DOS monitores: arriba el laserdisc y abajo la placa de
   juego (naipes, textos). Arte de CS.png con las pantallas transparentes; los
   botones del panel se tocan/clican y se encienden (D/Se/St/Dr/Pl 0/1). */
const CABINETS = {
  casino: { art: 'data/art/casino/cabinet.png', aspect: 3991 / 5574,
    top: [0.1498, 0.0614, 0.7026, 0.3836], bottom: [0.224, 0.5457, 0.551, 0.3007],
    buttons: [
      ['D', 0.3017, 0.8741, 'DISCARD1'], ['D', 0.3786, 0.8741, 'DISCARD2'], ['D', 0.4558, 0.8741, 'DISCARD3'], ['D', 0.5322, 0.8741, 'DISCARD4'], ['D', 0.6089, 0.8741, 'DISCARD5'],
      ['Se', 0.3433, 0.9293, 'START2'], ['St', 0.4197, 0.9293, 'START1'], ['Dr', 0.4964, 0.9293, 'BUTTON1'], ['Pl', 0.5733, 0.9293, 'BUTTON2']],
    bw: 0.0729, bh: 0.0522 }
};
let cabEl = null;
function cabinetOn(kind) {
  const C = CABINETS[kind]; if (!C) return;
  cabinetOff();
  cabEl = document.createElement('div'); cabEl.id = 'cab';
  const pct = (r) => `left:${r[0] * 100}%;top:${r[1] * 100}%;width:${r[2] * 100}%;height:${r[3] * 100}%`;
  cabEl.innerHTML = `<div class="cab-box" style="aspect-ratio:${C.aspect}">
      <div class="cab-scr" id="cabTop" style="${pct(C.top)}"></div>
      <div class="cab-scr" id="cabBot" style="${pct(C.bottom)}"></div>
      <img class="cab-art" src="${C.art}" alt="">
      <button class="cab-coin" id="cabCoin">MONEDA</button>
      ${C.buttons.map((b, i) => `<button class="cab-btn" data-i="${i}" style="left:${b[1] * 100}%;top:${b[2] * 100}%;width:${C.bw * 100}%;height:${C.bh * 100}%;background-image:url(data/art/${kind}/${b[0]}0.png)"></button>`).join('')}
    </div>`;
  $('#stage').appendChild(cabEl);
  $('#cabTop').appendChild(vid); $('#cabBot').appendChild(ovc);
  /* la tarjeta (Cargar laserdisc, versión, cuadro inicial) y el aviso de disco faltante viven dentro de #tv: se mudan al gabinete */
  const lm = document.getElementById('ldmiss'); if (lm) $('#cabTop').appendChild(lm);
  cabEl.querySelector('.cab-box').appendChild($('#card'));
  document.body.classList.add('cabinet');
  { const cb = $('#cabCoin'); const set = on => { if (S.game) S.game.input(SW.COIN1, on); };
    cb.addEventListener('pointerdown', e => { e.preventDefault(); ensureAudio(); set(true); setTimeout(() => set(false), 250); }); }
  cabEl.querySelectorAll('.cab-btn').forEach(btn => {
    const b = C.buttons[+btn.dataset.i], sw = SW[b[3]];
    const set = on => { btn.style.backgroundImage = `url(data/art/${kind}/${b[0]}${on ? 1 : 0}.png)`; if (S.game && sw !== undefined) S.game.input(sw, on); };
    btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.setPointerCapture(e.pointerId); ensureAudio(); set(true); });
    btn.addEventListener('pointerup', () => set(false)); btn.addEventListener('pointercancel', () => set(false));
  });
}
function cabinetOff() {
  if (!cabEl) return;
  const tvEl = $('#tv'); tvEl.insertBefore(ovc, tvEl.firstChild); tvEl.insertBefore(vid, tvEl.firstChild);
  const lm = document.getElementById('ldmiss'); if (lm) vid.after(lm);
  tvEl.appendChild($('#card'));
  cabEl.remove(); cabEl = null; document.body.classList.remove('cabinet');
}
/* lámparas del panel también con el teclado */
function cabinetLamp(sw, on) {
  if (!cabEl) return; const C = CABINETS.casino;
  C.buttons.forEach((b, i) => { if (SW[b[3]] === sw) { const el = cabEl.querySelector(`[data-i="${i}"]`); if (el) el.style.backgroundImage = `url(data/art/casino/${b[0]}${on ? 1 : 0}.png)`; } });
}

function stopChannel() {
  cabinetOff(); document.body.classList.remove('ownvideo', 'crtfx'); CRTFX.show(false); CRTFX.resetVideo();
  finishSession();
  if (S.singe) { S.singe.shutdown(); S.singe = null; }
  S.game = null; S.video.clear(); $('#frames').innerHTML = ''; tv.classList.remove('wide');
  document.querySelectorAll('.singecv').forEach(e => e.remove());
  ovx.clearRect(0, 0, ovc.width, ovc.height); ovc.style.display = '';
  $('#card').style.display = 'none'; $('#card').className = '';
  if (S.audio) S.audio.flush();
  S.keysHeld.clear(); document.body.classList.remove('playing');
  $('#marquee').style.display = 'none'; $('#osdmsg').style.display = 'none';
}

async function tune(n, setName, quiet) {
  const ch = chByNum(n) || customByNum(n);
  if (!ch) { toast('Canal ' + n + ' sin programación'); return; }
  stopChannel();
  if (S.cur && S.cur !== ch) S.lastCh = S.cur.n;
  S.cur = ch; S.set = setName || (ch.sets && ch.sets[0][0]) || null;
  try { localStorage.setItem('ddn.last', JSON.stringify([n, S.set])); } catch (e) {}
  if (!quiet) staticBurst();
  showOSD(String(n));
  if (ch.emu || ch.custom || ch.src) return tuneFrame(ch);
  if (ch.singe) return tuneSinge(ch);
  if (ch.pending) return tuneOff(ch);
  return tuneDaphne(ch);
}

function tuneOff(ch) {
  ovc.width = 320; ovc.height = 240;
  const g = ovx; g.fillStyle = '#1a3aa8'; g.fillRect(0, 0, 320, 240);
  const bars = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
  bars.forEach((c, i) => { g.fillStyle = c; g.fillRect(i * 320 / 7, 0, 320 / 7 + 1, 150); });
  g.fillStyle = '#000'; g.fillRect(40, 160, 240, 56);
  g.fillStyle = '#fff'; g.font = '14px DaphneTT, monospace'; g.textAlign = 'center';
  g.fillText('SIN SEÑAL — ' + ch.call, 160, 182); g.fillStyle = '#ffd21a'; g.fillText('driver en desarrollo', 160, 202);
  const have = ch.sets.filter(s => S.lib.sets[s[0]]).length;
  banner(ch, `Falta emular: ${ch.pending}. ROMs presentes: ${have}/${ch.sets.length} sets.`);
}

async function tuneDaphne(ch) {
  const setName = S.set, setEnt = (ch.sets || []).find(x => x[0] === setName) || [], drv = DRIVERS[setEnt[2] || ch.drv];
  if (S.pendingDisc && S.pendingDisc.n === ch.n) { S.video.set(S.pendingDisc.segs); S.pendingDisc = null; }
  let game;
  if (S.ldTap) S.ldTap.reset();
  const ldTap = ch.drv === 'px7' && ensureAudio() ? getLdTap() : null; if (ldTap) ldTap.px7 = true;
  try { game = await drv(S.lib, setName, { sampleRate: ensureAudio() ? S.audio.ctx.sampleRate : 44100, ld: S.video.has, ldTap }); }
  catch (e) { console.error(e); toast('Error al arrancar ' + setName + ': ' + e.message, 5000); return; }
  if (S.cur !== ch) return;
  if (game.res.loaded && game.res.loaded.length === 0) { tuneOff(Object.assign({}, ch, { pending: 'faltan todas las ROMs del set ' + setName })); return; }
  if (game.res.missing.length) toast('Faltan ROMs de ' + setName + ': ' + game.res.missing.join(', '), 5000);
  S.game = game; ovc.width = game.ow; ovc.height = game.oh;
  if (ch.wide || game.wide) tv.classList.add('wide');
  if (game.setFreePlay && S.settings['fp_' + ch.n] !== undefined) game.setFreePlay(!!S.settings['fp_' + ch.n]);
  /* PyDaphne: videos asignados por canal desde Python (videos.json → /video/<canal>) */
  if (window.PYDAPHNE && !S.video.has) fetch('/api/videos').then(r => r.json()).then(v => { if (v[ch.n] && S.cur === ch && !S.video.has) { S.video.setOnline('/video/' + ch.n, 0); toast('PyDaphne: video del canal ' + ch.n, 2500); } }).catch(() => {});
  if (ch.cabinet) cabinetOn(ch.cabinet);
  S.session = { ch, set: setName, coins: 0, best: 0 };
  document.body.classList.toggle('kbgame', !!game.typeKey);
  ovImg = ovx.createImageData(game.ow, game.oh); ovU32 = new Uint32Array(ovImg.data.buffer);
  document.body.classList.add('playing');
  S.acc = 0; S.last = performance.now(); S.sfrac = 0;
  renderCard(ch);
  banner(ch);
  const saved = S.video.has ? null : await IDB.get('disc:' + ch.n);
  if (saved && saved.handles) {
    try {
      const ok = (await Promise.all(saved.handles.map(h => h.queryPermission({ mode: 'read' })))).every(p => p === 'granted');
      if (ok) await applyDiscFiles(ch, await Promise.all(saved.handles.map(h => h.getFile())), saved.start);
      else renderCard(ch, saved);
    } catch (e) {}
  }
}

function renderCard(ch, saved) {
  const c = $('#card'); const hasVid = S.video.has;
  const sets = ch.sets.map(([k, l]) => `<option value="${k}" ${k === S.set ? 'selected' : ''}>${l || k} (${k})${S.lib.sets[k] ? '' : ' · sin ROM'}</option>`).join('');
  const lg = logoFor(ch, S.set);
  c.innerHTML = `<button class="x" title="Minimizar" aria-label="Minimizar">▾</button>
    ${lg ? `<img class="clogo" src="data/art/logos/${lg}.jpg" alt="">` : ''}<h2>${ch.title}</h2>
    <div class="sub">${ch.maker} ${ch.year} · ${ch.hw}${ch.experimental ? ' · experimental' : ''}</div>
    <p>${ch.ldRestart && !hasVid ? 'Sin laserdisc el juego usa sus fondos gráficos. Al cargar el video la máquina se reinicia con la interfaz Simutrek conectada.' : hasVid ? 'Laserdisc cargado: ' + S.video.segs.map(s => s.name).join(', ') : 'La máquina ya está corriendo. Carga el laserdisc en mp4 (o el framefile .txt junto con sus videos) para ver el video debajo del overlay.'}</p>
    <div class="row"><label>Versión <select class="bevel" id="cSet">${sets}</select></label></div>
    <div class="row" ${ch.nodisc ? 'hidden' : ''}><button class="bevel gold" id="cLoad">${hasVid ? 'Cambiar laserdisc' : 'Cargar laserdisc'}</button>
      ${saved ? '<button class="bevel" id="cRe">Reconectar ' + (saved.names || []).join(', ') + '</button>' : ''}
      <label>Cuadro inicial <input class="bevel" id="cStart" type="number" value="${S.video.segs[0] ? S.video.segs[0].start : 0}" style="width:90px"></label></div>
    ${S.game && S.game.setFreePlay ? `<div class="row"><label><input type="checkbox" id="cFree" ${S.game.freePlay ? 'checked' : ''}> Juego libre (free play)</label></div>` : ''}
    <div class="row" ${ch.nodisc ? 'hidden' : ''}><input class="bevel" id="cUrl" placeholder="Video en línea: URL de YouTube o mp4" value="${esc(S.video.onlineUrl || (() => { try { return localStorage.getItem('ddn.url.' + ch.n) || ''; } catch (e) { return ''; } })())}" style="flex:1;min-width:0"><button class="bevel" id="cUrlGo">Usar URL</button></div>
    <p style="color:#93a4dd;font-size:13px">${ch.keys || ''} · Tab: guía · I: info</p>`;
  c.style.display = 'block'; c.className = hasVid || document.body.classList.contains('touch') ? 'min' : '';
  c.querySelector('.x').onclick = () => c.classList.toggle('min');
  c.querySelector('h2').onclick = () => c.classList.remove('min');
  $('#cSet').onchange = e => tune(ch.n, e.target.value, true);
  $('#cLoad').onclick = () => pickDisc(ch);
  { const fp = $('#cFree'); if (fp) fp.onchange = () => { if (S.game && S.game.setFreePlay) { S.game.setFreePlay(fp.checked); S.settings['fp_' + ch.n] = fp.checked; saveSettings(); toast(fp.checked ? 'Juego libre activado' : 'Juego libre apagado: monedas y attract con créditos', 2500); } }; }
  { const go = $('#cUrlGo'); if (go) go.onclick = () => { const u = $('#cUrl').value.trim(); if (!u) return; S.video.setOnline(u, +($('#cStart') && $('#cStart').value) || 0); try { localStorage.setItem('ddn.url.' + ch.n, u); } catch (e) {} toast(parseYouTube(u) ? 'YouTube conectado como laserdisc' : 'Video en línea conectado', 3000); }; }
  $('#cStart').onchange = e => { const v = +e.target.value || 0; if (S.video.segs.length === 1) { S.video.segs[0].start = v; } };
  if (saved) $('#cRe').onclick = async () => {
    try { for (const h of saved.handles) await h.requestPermission({ mode: 'read' }); await applyDiscFiles(ch, await Promise.all(saved.handles.map(h => h.getFile())), saved.start); } catch (e) { toast('No se pudo reabrir: ' + e.message); }
  };
}

async function pickDisc(ch) {
  ensureAudio();
  if (window.showOpenFilePicker) {
    try {
      const hs = await showOpenFilePicker({ multiple: true, types: [{ description: 'Laserdisc', accept: { 'video/*': ['.mp4', '.webm', '.mkv', '.ogv', '.mov', '.m4v'], 'text/plain': ['.txt'] } }] });
      const files = await Promise.all(hs.map(h => h.getFile()));
      const start = +($('#cStart') && $('#cStart').value) || 0;
      await applyDiscFiles(ch, files, start);
      IDB.set('disc:' + ch.n, { handles: hs, start, names: files.map(f => f.name) });
      return;
    } catch (e) { if (e.name === 'AbortError') return; }
  }
  const inp = $('#fVideo'); inp.value = '';
  inp.onchange = () => applyDiscFiles(ch, [...inp.files], +($('#cStart') && $('#cStart').value) || 0);
  inp.click();
}

async function applyDiscFiles(ch, files, start) {
  const { segs, miss, bad } = await buildSegments(files, start || 0);
  if (!segs.length) {
    toast(bad.length ? 'El navegador no reproduce .m2v/.mpg: conviértelos a mp4 (H.264) con tu pipeline.' : 'No encontré videos en la selección.', 6000); return;
  }
  if (miss.length) toast('El framefile menciona videos que no elegiste: ' + miss.slice(0, 3).join(', '), 5000);
  if (ch.ldRestart) { S.pendingDisc = { n: ch.n, segs }; tune(ch.n, S.set, true); return; }
  S.video.set(segs);
  if (S.cur === ch && !ch.singe) renderCard(ch);
}

/* --------------------------------------------- canales iframe (tuyos) */
let frameKeyHook = null;
function tuneFrame(ch) {
  if (ch.src) {
    tv.classList.add('wide'); ovc.style.display = 'none';
    const f = document.createElement('iframe'); f.setAttribute('allow', 'fullscreen; gamepad; autoplay'); f.src = ch.src;
    $('#frames').appendChild(f);
    if (location.protocol === 'file:') toast(tr('Requiere servidor local') + ': JUGAR.bat / jugar.py', 6000);
    f.addEventListener('load', () => { try { f.contentWindow.focus(); } catch (e) {} });
    banner(ch, null, 5000); return;
  }
  let html = ch.custom ? ch.html : emuHTML(ch.emu);
  if (html && ch.algGame) html = html.replace('<head>', '<head><script>window.ALG_GAME=' + JSON.stringify(ch.algGame) + ';<\/script>');
  if (!html) { tuneOff(Object.assign({}, ch, { pending: 'el HTML de este emulador no viene embebido', sets: [] })); return; }
  tv.classList.add('wide'); ovc.style.display = 'none';
  const f = document.createElement('iframe');
  f.setAttribute('allow', 'fullscreen; gamepad; autoplay');
  f.srcdoc = html;
  $('#frames').appendChild(f);
  f.addEventListener('load', () => {
    try {
      const w = f.contentWindow;
      w.addEventListener('keydown', e => {
        if (S.mode === 'guide') { guideKey(e); e.stopImmediatePropagation(); return; }
        if (S.mode === 'menu') { if (e.code === 'Escape' || e.code === 'KeyM' || e.code === 'Tab') { e.preventDefault(); closeMenu(); } e.stopImmediatePropagation(); return; }
        if (remoteKey(e)) { e.preventDefault(); e.stopImmediatePropagation(); }
      }, true);
    } catch (e) {}
    setTimeout(() => { try { f.contentWindow.focus(); } catch (e) {} }, 60);
  });
  banner(ch, 'Tus controles de siempre. Tab o RePág/AvPág para salir del canal.');
}

/* ======================================================== CANAL SINGE */
function tuneSinge(ch) {
  const c = $('#card');
  c.innerHTML = `<button class="x" aria-label="Minimizar">▾</button><h2>Singe</h2>
    <div class="sub">Runtime Hypseus Singe en JavaScript (Lua 5.3 con compatibilidad 5.1)</div>
    <p>Elige la carpeta del juego: el script <b>.singe</b>, su framefile <b>.txt</b>, los videos en mp4 y los sprites, sonidos y fuentes que use.</p>
    <div class="row"><button class="bevel gold" id="sDir">Elegir carpeta</button><button class="bevel" id="sFiles">Elegir archivos</button></div>
    <p style="color:#93a4dd;font-size:13px">Controles Singe: flechas, Espacio o clic = BUTTON1, X = BUTTON2, C = BUTTON3, 5 = moneda, 1/2 = inicio; el ratón mueve la mira.</p>
    <div id="sList"></div>`;
  c.style.display = 'block'; c.className = '';
  c.querySelector('.x').onclick = () => c.classList.toggle('min');
  for (const id of ['#fSinge', '#fSingeFiles']) $(id).onchange = e => prepSinge([...e.target.files]);
  const go = inp => { inp.value = ''; inp.click(); };
  $('#sDir').onclick = () => go($('#fSinge'));
  $('#sFiles').onclick = () => go($('#fSingeFiles'));
  banner(ch);
}

const normPath = p => String(p).replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/^\/+/, '').replace(/\/\.\//g, '/').toLowerCase();
function makeResolver(files) {
  const keys = files.map(f => [normPath(f.webkitRelativePath || f.name), f]);
  const idx = new Map(keys);
  return p => {
    const n = normPath(p); if (idx.has(n)) return idx.get(n);
    const parts = n.split('/');
    for (let i = 0; i < parts.length; i++) {
      const suf = parts.slice(i).join('/');
      for (const [k, f] of keys) if (k === suf || k.endsWith('/' + suf)) return f;
    }
    return null;
  };
}

async function prepSinge(files) {
  if (!files.length) return;
  const list = $('#sList');
  const scripts = files.filter(f => /\.singe$/i.test(f.name));
  if (!scripts.length) scripts.push(...files.filter(f => /\.lua$/i.test(f.name) && /main|game|start/i.test(f.name)));
  if (!scripts.length) { list.innerHTML = '<p>No encontré ningún archivo .singe en la selección.</p>'; return; }
  const ffs = files.filter(f => /\.txt$/i.test(f.name));
  list.innerHTML = `<div class="row"><label>Script <select class="bevel" id="sScript">${scripts.map((f, i) => `<option value="${i}">${f.webkitRelativePath || f.name}</option>`).join('')}</select></label></div>
    <div class="row"><label>Framefile <select class="bevel" id="sFF"><option value="-1">(ninguno: 1 video desde el cuadro 0)</option>${ffs.map((f, i) => `<option value="${i}" ${/frame|\.txt$/i.test(f.name) && i === 0 ? 'selected' : ''}>${f.webkitRelativePath || f.name}</option>`).join('')}</select></label></div>
    <div class="row"><button class="bevel gold" id="sGo">Encender juego</button></div>`;
  $('#sGo').onclick = () => startSinge(files, scripts[+$('#sScript').value], ffs[+$('#sFF').value]);
}

async function startSinge(files, script, ff) {
  ensureAudio();
  const card = $('#card'), log = [];
  const say = t => { log.push(t); card.querySelector('#sList').innerHTML = '<p>' + log.slice(-4).join('<br>') + '</p>'; };
  const resolve = makeResolver(files);
  say('Leyendo scripts y textos…');
  const text = new Map();
  for (const f of files) if (/\.(singe|lua|txt|cfg|ini|dat|json|csv)$/i.test(f.name) && f.size < 4e6) text.set(f, await f.text());
  say('Decodificando sprites…');
  const imgCache = new Map(), sndCache = new Map(), fontCache = new Map();
  const imgFiles = files.filter(f => /\.(png|jpe?g|bmp|gif|webp)$/i.test(f.name));
  await Promise.all(imgFiles.map(async f => { try { imgCache.set(f, await createImageBitmap(f)); } catch (e) {} }));
  say('Decodificando sonidos…');
  const AC = S.audio && S.audio.ctx;
  await Promise.all(files.filter(f => /\.(wav|ogg|mp3|flac)$/i.test(f.name)).map(async f => { try { sndCache.set(f, await AC.decodeAudioData(await f.arrayBuffer())); } catch (e) {} }));
  say('Cargando fuentes…');
  let fi = 0;
  for (const f of files.filter(f => /\.(ttf|otf)$/i.test(f.name))) {
    try { const fam = 'singefont' + (fi++); const ff2 = new FontFace(fam, await f.arrayBuffer()); await ff2.load(); document.fonts.add(ff2); fontCache.set(f, fam); } catch (e) {}
  }
  /* video */
  let segs = [];
  const vids = files.filter(isVideo);
  if (ff) {
    for (const e of parseFramefile(text.get(ff) || await ff.text())) {
      const v = vids.find(x => baseNoExt(x.name) === baseNoExt(e.name));
      if (v) segs.push({ start: e.start, file: v, name: v.name }); else say('Falta video: ' + e.name + ' (conviértelo a mp4 con el mismo nombre)');
    }
  } else if (vids[0]) segs = [{ start: 0, file: vids[0], name: vids[0].name }];
  S.video.set(segs);
  let W = 360, H = 240;
  if (segs.length) {
    await new Promise(r => { const t = setTimeout(r, 4000); vid.onloadedmetadata = () => { clearTimeout(t); r(); }; });
    if (vid.videoWidth) { W = vid.videoWidth >> 1; H = vid.videoHeight >> 1; }
  } else say('Sin video: el juego corre solo con overlay.');
  const folder = (script.webkitRelativePath || script.name).split('/')[0];
  const ldp = new LDP(29.97); ldp.searchFields = 1;
  const px = document.createElement('canvas'); px.width = 64; px.height = 48; const pxg = px.getContext('2d', { willReadFrequently: true });
  const host = {
    ldp, width: W, height: H, audioCtx: AC, sfxGain: S.audio && S.audio.sfx, log: t => { console.log(t); },
    vfs: {
      read: p => {
        try { const k = 'singe:' + folder + ':' + normPath(p); const s = localStorage.getItem(k); if (s !== null) return s; } catch (e) {}
        const f = resolve(p); return f && text.has(f) ? text.get(f) : null;
      },
      write: (p, s) => { try { localStorage.setItem('singe:' + folder + ':' + normPath(p), s); } catch (e) {} }
    },
    images: { get: p => { const f = resolve(p); return f ? imgCache.get(f) : null; } },
    sounds: { get: p => { const f = resolve(p); return f ? sndCache.get(f) : null; } },
    fonts: { get: p => { const f = resolve(p); return f ? fontCache.get(f) : null; } },
    videoPixel: (x, y) => { try { pxg.drawImage(vid, 0, 0, 64, 48); const d = pxg.getImageData(Math.max(0, Math.min(63, x / (W * 2) * 64 | 0)), Math.max(0, Math.min(47, y / (H * 2) * 48 | 0)), 1, 1).data; return [d[0], d[1], d[2]]; } catch (e) { return [0, 0, 0]; } },
    setDiscVolume: v => { S.video.vol = v; },
    onError: m => { say('<span style="color:#ff8a80">Error Lua: ' + m.replace(/</g, '&lt;') + '</span>'); card.className = ''; },
    onQuit: () => { toast('El juego pidió salir (singeQuit)'); }
  };
  const rt = new SingeRuntime(host);
  rt.cv.className = 'singecv'; tv.insertBefore(rt.cv, $('#frames'));
  ovc.style.display = 'none';
  S.singe = rt; S.singeLdp = ldp; S.acc = 0; S.last = performance.now();
  document.body.classList.add('playing');
  say('Arrancando ' + script.name + '…');
  if (rt.start(script.webkitRelativePath || script.name)) { card.className = 'min'; card.querySelector('h2').textContent = 'Singe · ' + script.name; banner(S.cur, script.name + ' · overlay ' + W + '×' + H); }
}

/* ------------------------------------------------- efecto CRT
   'scan' = líneas de barrido en CSS (como antes); 'ntsc' = post-proceso WebGL
   que compone disco + overlay con sprite blending y señal NTSC. */
const crtMode = () => S.settings.crtMode || (S.settings.crt === false ? 'off' : 'scan');
function applyCrt() { const m = crtMode(); tv.classList.toggle('crt', m === 'scan'); if (m !== 'ntsc') { CRTFX.show(false); document.body.classList.remove('crtfx'); } }
function crtFrame() {
  if (crtMode() !== 'ntsc') return;
  const usable = S.game && !cabEl && !S.video.yt;
  if (!usable || !CRTFX.init(tv)) { CRTFX.show(false); document.body.classList.remove('crtfx'); if (S.game && S.video.yt) tv.classList.add('crt'); return; }
  tv.classList.remove('crt');
  const own = document.body.classList.contains('ownvideo');
  const vidVis = S.video.has && !own && vid.style.visibility !== 'hidden' && !S.video.missing && !S.game.videoBlank;
  if (CRTFX.render(vid, ovc, vidVis, { curv: 1, scan: 0.85, mask: 0.55, ntsc: 1, blend: 1 })) { CRTFX.show(true); document.body.classList.toggle('crtfx', !CRTFX.videoBlocked); }
}

/* ============================================================ BUCLE */
function loop(ts) {
  requestAnimationFrame(loop);
  pollGamepad();
  const dt = Math.min(100, ts - (S.last || ts)); S.last = ts;
  if (S.game) {
    S.acc += dt; let n = 0;
    const A = S.audio, spf = A ? A.ctx.sampleRate / 59.94 : 0;
    while (S.acc >= FIELD_MS && n < 4) {
      S.game.runField(); S.acc -= FIELD_MS; n++;
      if (A) {
        S.sfrac += spf; const k = S.sfrac | 0; S.sfrac -= k;
        if (A.fill() < A.ctx.sampleRate * 0.15) for (let i = 0; i < k; i++) A.push(S.game.sample() * 0.5);
        else for (let i = 0; i < k; i++) S.game.sample();
      }
    }
    if (n) {
      /* drivers que componen el disco ellos mismos (expansor de Star Rider / Freedom Fighter) */
      if (S.game.drawCanvas) { const own = !S.video.yt && S.video.has; document.body.classList.toggle('ownvideo', own); S.game.drawCanvas(ovx, own ? vid : null); }
      else { S.game.draw(ovU32); ovx.putImageData(ovImg, 0, 0); }
    }
    S.video.sync(S.game.ldp, S.game.videoBlank);
    crtFrame();
    if (S.game.px7) { const px = S.game.px7; px.hasDisc = S.video.has; S.game.autoRunWanted = S.video.has; }
    if (S.session && n && S.session.coins > 0) { const sc = S.game.score; if (S.session.base === undefined) S.session.base = sc || 0; if (sc > S.session.best && sc !== S.session.base) S.session.best = sc; }
    if (S.game.subSeq && S.game.subSeq !== S.lastSub) { S.lastSub = S.game.subSeq; const o = $('#osdmsg'); o.textContent = S.game.subtitle; o.style.display = 'block'; clearTimeout(S.subT); S.subT = setTimeout(() => o.style.display = 'none', 6000); }
    const mq = $('#marquee'); if (S.game.marquee !== undefined) { mq.style.display = 'block'; if (mq.textContent !== S.game.marquee) mq.textContent = S.game.marquee; } else mq.style.display = 'none';
    if (S.mode === 'tv' && $('#banner').classList.contains('on')) $('#bstat').textContent = S.game.status() + ' · LD ' + ['ERR', 'BUSCA', 'STOP', 'PLAY', 'PAUSA'][S.game.ldp.status] + ' ' + S.game.ldp.frame;
  } else if (S.singe) {
    S.acc += dt; let n = 0;
    while (S.acc >= FIELD_MS && n < 4) { S.singeLdp.field(); S.singe.frame(); S.acc -= FIELD_MS; n++; }
    S.video.sync(S.singeLdp);
  }
}

/* ====================================================== ENTRADA */
const KEYMAP = {
  ArrowUp: SW.UP, ArrowLeft: SW.LEFT, ArrowDown: SW.DOWN, ArrowRight: SW.RIGHT,
  Space: SW.BUTTON1, ControlLeft: SW.BUTTON1, KeyZ: SW.BUTTON1, KeyX: SW.BUTTON2, AltLeft: SW.BUTTON2, KeyC: SW.BUTTON3, ShiftLeft: SW.BUTTON3,
  Digit5: SW.COIN1, Digit6: SW.COIN2, Digit1: SW.START1, Digit2: SW.START2,
  KeyQ: SW.SKILL1, KeyW: SW.SKILL2, KeyE: SW.SKILL3, Digit9: SW.SERVICE, Digit0: SW.TEST, KeyT: SW.TILT
};
const SW_KEYS = { [SW.UP]: 'ArrowUp', [SW.DOWN]: 'ArrowDown', [SW.LEFT]: 'ArrowLeft', [SW.RIGHT]: 'ArrowRight', [SW.BUTTON1]: 'Space', [SW.BUTTON2]: 'KeyX', [SW.BUTTON3]: 'KeyC',
  [SW.COIN1]: 'Digit5', [SW.COIN2]: 'Digit6', [SW.START1]: 'Digit1', [SW.START2]: 'Digit2', [SW.SERVICE]: 'Digit9', [SW.TEST]: 'Digit0' };
function forwardToFrame(sw, d) {
  const f = $('#frames iframe'), code = SW_KEYS[sw]; if (!f || !code) return false;
  try {
    const w = f.contentWindow, key = code.startsWith('Digit') ? code.slice(5) : code.startsWith('Key') ? code.slice(3).toLowerCase() : code === 'Space' ? ' ' : code;
    const ev = new w.KeyboardEvent(d ? 'keydown' : 'keyup', { code, key, bubbles: true });
    (w.document.activeElement || w.document.body).dispatchEvent(ev); if (!ev.defaultPrevented) w.dispatchEvent(new w.KeyboardEvent(d ? 'keydown' : 'keyup', { code, key }));
    if (d && (sw === SW.COIN1 || sw === SW.COIN2)) setTimeout(() => forwardToFrame(sw, false), 250);
  } catch (e) { return false; }
  return true;
}
function swDown(sw, d) {
  if (!S.game && S.cur && (S.cur.emu || S.cur.custom)) { if (d && (sw === SW.COIN1 || sw === SW.COIN2) && S.session) S.session.coins++; if (!(sw === SW.COIN1 || sw === SW.COIN2) || d) forwardToFrame(sw, d); return; }
  if (S.session && d && (sw === SW.COIN1 || sw === SW.COIN2)) S.session.coins++;
  if (S.game) {
    if (d && sw === SW.COIN1 || d && sw === SW.COIN2) { /* pulso de moneda largo para el antirrebote de las ROMs */
      S.game.input(sw, true); setTimeout(() => S.game && S.game.input(sw, false), 200); return;
    }
    if ((sw === SW.COIN1 || sw === SW.COIN2) && !d) return;
    S.game.input(sw, d);
  } else if (S.singe) { d ? S.singe.press(sw) : S.singe.release(sw); }
}
/* teclas del control remoto; devuelve true si se consumió */
function remoteKey(e) {
  const k = e.code;
  if (k === 'Tab' || k === 'Home' || k === 'ContextMenu') { toggleGuide(); return true; }
  if (k === 'PageUp') { chStep(1); return true; }
  if (k === 'PageDown') { chStep(-1); return true; }
  if (S.mode === 'tv' && (S.cur && (S.cur.emu || S.cur.custom))) return false;
  if (S.game && S.game.typeKey && /^Key/.test(k)) return false;
  if (S.game && S.game.keymap && S.game.keymap[k] !== undefined) return false;
  if (k === 'KeyI') { if (S.cur) banner(S.cur, null, 6000); return true; }
  if (k === 'KeyM') { openMenu(); return true; }
  if (k === 'KeyF') { fullscreen(); return true; }
  return false;
}
addEventListener('keydown', e => {
  ensureAudio();
  if (S.mode === 'dialog') return;
  if (S.mode === 'profiles') { if (e.target && e.target.tagName === 'INPUT') return; e.preventDefault(); profKey(e.code); return; }
  if (S.mode === 'guide') { guideKey(e); return; }
  if (S.mode === 'menu') { if (e.code === 'Escape' || e.code === 'KeyM' || e.code === 'Tab') { e.preventDefault(); closeMenu(); } return; }
  if (S.mode === 'tv' && S.game && S.game.keyMatrix && !(e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) {
    if (e.target && e.target.tagName === 'SELECT') e.target.blur();
    if (e.code === 'F12') { e.preventDefault(); openMenu(); return; }
    if (e.code !== 'Tab') { if (!e.repeat && S.game.msxKey(e.code, true)) e.preventDefault(); else if (e.repeat) e.preventDefault(); return; }
  }
  if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.code !== 'Tab') return;
  if (remoteKey(e)) { e.preventDefault(); return; }
  if (e.code === 'Escape') { toggleGuide(); e.preventDefault(); return; }
  if (S.game && S.game.typeKey) {
    if (e.code === 'F5' || e.code === 'F6') { e.preventDefault(); if (!e.repeat) swDown(e.code === 'F5' ? SW.COIN1 : SW.COIN2, true); return; }
    if (!e.repeat && S.game.typeKey(e)) { e.preventDefault(); return; }
  }
  const sw = (S.game && S.game.keymap && S.game.keymap[e.code] !== undefined) ? S.game.keymap[e.code] : KEYMAP[e.code];
  if (sw !== undefined) { e.preventDefault(); if (!e.repeat && !S.keysHeld.has(e.code)) { S.keysHeld.add(e.code); swDown(sw, true); } }
});
addEventListener('keyup', e => {
  if (S.game && S.game.keyMatrix) { S.game.msxKey(e.code, false); return; }
  const sw = (S.game && S.game.keymap && S.game.keymap[e.code] !== undefined) ? S.game.keymap[e.code] : KEYMAP[e.code];
  if (sw !== undefined && S.keysHeld.has(e.code)) { S.keysHeld.delete(e.code); swDown(sw, false); }
});
/* ratón para Singe (mira / pistola) */
tv.addEventListener('pointermove', e => {
  if (S.game && S.game.analog && S.cur && S.cur.analog) {
    if (S.cur.analog === 'abs') { const r = ovc.getBoundingClientRect(); S.game.analog(Math.round((e.clientX - r.left) / r.width * 255), Math.round((e.clientY - r.top) / r.height * 255)); }
    else if (S.cur.analog === 'px') { const r = ovc.getBoundingClientRect(); S.game.analog((e.clientX - r.left) / r.width * S.game.ow, (e.clientY - r.top) / r.height * S.game.oh); }
    else S.game.analog(Math.round(e.movementX || 0), Math.round(e.movementY || 0));
    return;
  }
  if (!S.singe) return; const r = S.singe.cv.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * S.singe.overlayW, y = (e.clientY - r.top) / r.height * S.singe.overlayH;
  S.singe.mouseMove(Math.round(x), Math.round(y), Math.round(e.movementX || 0), Math.round(e.movementY || 0));
});
tv.addEventListener('pointerdown', e => { ensureAudio(); if (S.game && S.cur && S.cur.analog && !e.target.closest('#card')) { if (S.cur.analog === 'px') tv.dispatchEvent(new PointerEvent('pointermove', { clientX: e.clientX, clientY: e.clientY })); S.game.input(e.button === 2 ? SW.BUTTON2 : SW.BUTTON1, true); return; } if (S.singe && !e.target.closest('#card')) { S.singe.press(SW.BUTTON1); } });
tv.addEventListener('contextmenu', e => { if (S.game && S.cur && S.cur.analog) e.preventDefault(); });
tv.addEventListener('pointerup', e => { if (S.game && S.cur && S.cur.analog && !e.target.closest('#card')) { S.game.input(e.button === 2 ? SW.BUTTON2 : SW.BUTTON1, false); return; } if (S.singe && !e.target.closest('#card')) S.singe.release(SW.BUTTON1); });

/* mandos Bluetooth / USB (Gamepad API). Cada mando ocupa un asiento en el
   orden en que se pulsa un botón por primera vez: el asiento 0 maneja los
   interruptores normales (jugador 1); los juegos multijugador (Galaxian³ con
   sus 6 artilleros, COPS con 2 pistolas) reciben cada mando por separado. */
const padSeat = new Map();
const padPrev = {};
addEventListener('gamepadconnected', e => toast('🎮 Mando conectado: ' + e.gamepad.id.slice(0, 38) + ' — pulsa un botón para tomar asiento', 4000));
addEventListener('gamepaddisconnected', e => { const s = padSeat.get(e.gamepad.index); padSeat.delete(e.gamepad.index); if (s !== undefined) toast('🎮 Jugador ' + (s + 1) + ': mando desconectado', 3000); });
function pollGamepad() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  if (!pads.length) return;
  for (const gp of pads) {
    const pressed = gp.buttons.map(b => !!(b && (b.pressed || b.value > 0.5)));
    if (!padSeat.has(gp.index) && pressed.some(Boolean)) {
      const used = new Set(padSeat.values()); let seat = 0; while (used.has(seat)) seat++;
      padSeat.set(gp.index, seat);
      const max = (S.game && S.game.players) || 1;
      toast('🎮 Mando ' + (gp.index + 1) + ' → Jugador ' + (seat + 1) + (seat >= max ? ' (este juego es de ' + max + ')' : ''), 3000);
    }
    const seat = padSeat.get(gp.index); if (seat === undefined) continue;
    const prev = padPrev[gp.index] || [];
    /* botón guía (o L1+R1) abre la guía desde cualquier mando */
    const guideBtn = pressed[16] || (pressed[4] && pressed[5]);
    if (guideBtn && !prev.guide) toggleGuide();
    if (S.mode === 'guide') {
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const nav = { up: pressed[12] || ay < -0.5, down: pressed[13] || ay > 0.5, left: pressed[14] || ax < -0.5, right: pressed[15] || ax > 0.5, ok: pressed[0] };
      for (const k in nav) { if (nav[k] && !prev['g' + k]) guideKey({ code: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', ok: 'Enter' }[k], preventDefault() {} }); pressed['g' + k] = nav[k]; }
    } else if (S.game && S.game.gamepad && (seat > 0 || S.game.players > 1)) {
      S.game.gamepad(seat, gp, prev);
      if (seat === 0) { /* moneda/inicio del jugador 1 también por interruptores */ }
    } else if (seat === 0) {
      const st = {
        [SW.UP]: pressed[12] || gp.axes[1] < -0.5, [SW.DOWN]: pressed[13] || gp.axes[1] > 0.5,
        [SW.LEFT]: pressed[14] || gp.axes[0] < -0.5, [SW.RIGHT]: pressed[15] || gp.axes[0] > 0.5,
        [SW.BUTTON1]: pressed[0], [SW.BUTTON2]: pressed[1], [SW.BUTTON3]: pressed[2], [SW.SKILL1]: pressed[3],
        [SW.COIN1]: pressed[8], [SW.START1]: pressed[9]
      };
      for (const k in st) { const v = !!st[k]; if (v !== !!prev['s' + k]) swDown(+k, v); pressed['s' + k] = v; }
    } else if (seat === 1) {
      /* segundo mando en juegos de 1 jugador: moneda 2 / inicio 2 */
      const st = { [SW.COIN2]: pressed[8], [SW.START2]: pressed[9] };
      for (const k in st) { const v = !!st[k]; if (v !== !!prev['s' + k]) swDown(+k, v); pressed['s' + k] = v; }
    }
    pressed.guide = guideBtn;
    padPrev[gp.index] = pressed;
  }
}

/* control táctil */
document.body.classList.toggle('touch', matchMedia('(pointer: coarse)').matches);
for (const b of document.querySelectorAll('#pad button')) {
  const sw = +b.dataset.sw;
  b.addEventListener('pointerdown', e => { e.preventDefault(); ensureAudio(); b.setPointerCapture(e.pointerId); swDown(sw, true); });
  const up = e => { e.preventDefault(); swDown(sw, false); };
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
}
/* control remoto Scientific-Atlanta 8650 */
$('#rbtn').onclick = () => { ensureAudio(); $('#sa').classList.toggle('on'); };
function remoteDigit(d) {
  if (S.mode === 'guide') { guideKey({ code: 'Digit' + d, preventDefault() {} }); return; }
  S.entry = (S.entry + d).slice(-3); showOSD(S.entry.padEnd(3, '-'));
  clearTimeout(remoteDigit.t);
  remoteDigit.t = setTimeout(() => { const n = +S.entry; S.entry = ''; if (chByNum(n) || customByNum(n)) tune(n); else toast('Canal ' + n + ' no existe'); }, S.entry.length === 3 ? 300 : 1800);
}
function remoteButton(r) {
  ensureAudio();
  if (S.mode === 'dialog') return;
  if (S.mode === 'profiles') { profKey(r); return; }
  if (/^d\d$/.test(r)) { remoteDigit(r[1]); return; }
  switch (r) {
    case 'power': openProfiles(false); break;
    case 'buy': if (S.mode === 'guide') closeGuide(); menuSel = 0; openMenu(); break;
    case 'sleep': fullscreen(); break;
    case 'menu': if (S.mode === 'menu') closeMenu(); else openMenu(); break;
    case 'guide': toggleGuide(); break;
    case 'select': if (S.mode === 'guide') guideKey({ code: 'Enter', preventDefault() {} }); else if (S.cur) banner(S.cur, null, 6000); break;
    case 'chup': if (S.mode === 'guide') guideKey({ code: 'ArrowUp', preventDefault() {} }); else chStep(1); break;
    case 'chdn': if (S.mode === 'guide') guideKey({ code: 'ArrowDown', preventDefault() {} }); else chStep(-1); break;
    case 'last': if (S.lastCh) { if (S.mode === 'guide') closeGuide(); tune(S.lastCh); } break;
    case 'fav': { const list = allChannels().filter(c => !c.pending), i = list.indexOf(S.cur); if (S.mode === 'guide') closeGuide(); tune(list[(i + 1) % list.length].n); break; }
    case 'display': if (S.cur) banner(S.cur, null, 6000); break;
    case 'mute': S.muted = !S.muted; if (S.audio) S.audio.gain.gain.value = S.muted ? 0 : S.settings.vol; S.video.forceMute = S.muted; showOSD(S.muted ? 'MUTE' : 'VOL ' + Math.round(S.settings.vol * 100)); break;
    case 'volup': case 'voldn': S.muted = false; S.video.forceMute = false; S.settings.vol = Math.max(0, Math.min(1, S.settings.vol + (r === 'volup' ? .1 : -.1))); if (S.audio) S.audio.gain.gain.value = S.settings.vol; saveSettings(); showOSD('VOL ' + '|'.repeat(Math.round(S.settings.vol * 10)).padEnd(10, '.')); break;
  }
}
for (const b of document.querySelectorAll('#sa [data-r]')) b.addEventListener('click', e => { e.preventDefault(); remoteButton(b.dataset.r); });
/* teclado del sistema en móvil para juegos con teclado (Thayer's Quest) */
$('#padKbd').addEventListener('click', () => { const k = $('#kbdSink'); k.value = ''; k.focus(); });
$('#kbdSink').addEventListener('input', e => {
  const v = e.target.value; e.target.value = '';
  if (S.game && S.game.typeText) { S.game.typeText(v); return; }
  for (const ch of v.toUpperCase()) {
    if (!S.game || !S.game.typeKey) break;
    const code = /[A-Z]/.test(ch) ? 'Key' + ch : /\d/.test(ch) ? 'Digit' + ch : ch === ' ' ? 'Space' : null;
    if (code) S.game.typeKey({ code });
  }
});
$('#kbdSink').addEventListener('keydown', e => { if (S.game && S.game.typeText && (e.key === 'Enter' || e.key === 'Backspace')) { S.game.typeText(e.key === 'Enter' ? '\r' : '\b'); e.stopPropagation(); return; } if (e.key === 'Enter' && S.game && S.game.typeKey) S.game.typeKey({ code: 'Enter' }); if (e.key === 'Backspace' && S.game && S.game.typeKey) S.game.typeKey({ code: 'Backspace' }); e.stopPropagation(); });
function fullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement) document.exitFullscreen(); else (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el);
}

/* ===================================================== CAMBIO DE CANAL */
function allChannels() { return CHANNELS.concat(S.customs || []); }
function chStep(d) {
  const list = allChannels(), i = Math.max(0, list.indexOf(S.cur));
  const next = list[(i + d + list.length) % list.length];
  if (S.mode === 'guide') closeGuide();
  tune(next.n);
}
function staticBurst() {
  const c = $('#static'), g = c.getContext('2d'), img = g.createImageData(160, 120), u = new Uint32Array(img.data.buffer);
  c.style.display = 'block'; const t0 = performance.now();
  const A = S.audio;
  if (A) { const len = A.ctx.sampleRate * 0.35 | 0, b = A.ctx.createBuffer(1, len, A.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.12 * (1 - i / len); const s = A.ctx.createBufferSource(); s.buffer = b; s.connect(A.gain); s.start(); }
  const step = () => {
    for (let i = 0; i < u.length; i++) { const v = Math.random() * 255 | 0; u[i] = 0xFF000000 | v << 16 | v << 8 | v; }
    g.putImageData(img, 0, 0);
    if (performance.now() - t0 < 380) requestAnimationFrame(step); else c.style.display = 'none';
  };
  step();
}
function showOSD(t) { const o = $('#osd'); o.textContent = t; o.style.display = 'block'; clearTimeout(showOSD.t); showOSD.t = setTimeout(() => o.style.display = 'none', 3000); }
function banner(ch, extra, ms) {
  const b = $('#banner');
  $('#bnum b').textContent = ch.n; $('#bnum span').textContent = ch.call;
  const setLbl = ch.sets && S.set ? (ch.sets.find(s => s[0] === S.set) || [])[1] : '';
  $('#btitle').textContent = ch.title + (setLbl ? ' — ' + setLbl : '');
  $('#bsub').textContent = [ch.maker, ch.year, ch.hw || ch.pending].filter(Boolean).join(' · ');
  $('#bdesc').textContent = extra || ch.desc || '';
  $('#bclock').innerHTML = clockHTML(); $('#bstat').textContent = '';
  b.classList.add('on'); clearTimeout(banner.t); banner.t = setTimeout(() => b.classList.remove('on'), ms || 4500);
}

/* =============================================================== GUÍA */
const guide = $('#guide');
function slotStart() { const d = new Date(); d.setMinutes(d.getMinutes() < 30 ? 0 : 30, 0, 0); return d; }
function programsFor(ch) {
  /* tres medias horas visibles; las versiones del romset son los programas */
  if (ch.pending) return [{ title: 'Sin señal', span: 3, off: 1 }];
  if (!ch.sets || ch.sets.length === 1) return [{ title: ch.title, span: 3, set: ch.sets && ch.sets[0][0] }];
  if (ch.sets.length === 2) return [{ title: ch.title + ' · ' + ch.sets[0][1], span: 2, set: ch.sets[0][0] }, { title: ch.sets[1][1], span: 1, set: ch.sets[1][0] }];
  return ch.sets.map((s, i) => ({ title: i === 0 ? ch.title + ' · ' + s[1] : s[1], span: 1, set: s[0] }));
}
function openGuide() {
  S.mode = 'guide'; guide.classList.add('on'); $('#banner').classList.remove('on');
  const list = allChannels(); S.guideRow = Math.max(0, list.indexOf(S.cur)); S.guideCol = 0;
  $('#stage').classList.add('pip'); drawGuide(); placePip();
  try { if (document.activeElement && document.activeElement.tagName === 'IFRAME') document.activeElement.blur(); window.focus(); } catch (e) {}
}
function closeGuide() {
  document.body.classList.remove('pvlogo');
  S.mode = 'tv'; guide.classList.remove('on'); vtxLast = ''; if (vtxSrc) try { vtxSrc.stop(); } catch (e) {}
  $('#stage').classList.remove('pip');
  for (const k of ['position', 'left', 'top', 'width', 'height', 'zIndex', 'maxWidth', 'maxHeight', 'aspectRatio']) tv.style[k] = '';
  S.entry = ''; $('#entry').textContent = '';
  const f = $('#frames iframe'); if (f) setTimeout(() => { try { f.contentWindow.focus(); } catch (e) {} }, 30);
}
function placePip() {
  if (S.mode !== 'guide') return;
  const r = $('#pip').getBoundingClientRect();
  Object.assign(tv.style, { position: 'fixed', left: r.left + 2 + 'px', top: r.top + 2 + 'px', width: r.width - 4 + 'px', height: r.height - 4 + 'px', zIndex: 21, maxWidth: 'none', maxHeight: 'none', aspectRatio: 'auto' });
}
function toggleGuide() { if (S.mode === 'menu') closeMenu(); if (S.mode === 'guide') closeGuide(); else openGuide(); }
let vtxGuide = null, vtxSrc = null, vtxTimer = 0, vtxLast = '';
function guideSpeak(text) {
  if (S.settings.votrax === false) return;
  clearTimeout(vtxTimer);
  vtxTimer = setTimeout(async () => {
    const A = S.audio; if (!A || S.mode !== 'guide' || text === vtxLast) return;
    vtxLast = text;
    try {
      if (!vtxGuide) { const r = S.lib.find('sc01a.bin', 0xfc416227, 'votrsc01a', null); if (!r) return; vtxGuide = new VotraxSC01(await S.lib.get(r), 720000); }
      const pcm = vtxGuide.render(textToPhones(text)); let mx = 1e-6; for (const x of pcm) mx = Math.max(mx, Math.abs(x));
      const buf = A.ctx.createBuffer(1, pcm.length, vtxGuide.sclock), d = buf.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) d[i] = pcm[i] * 0.8 / mx;
      if (vtxSrc) try { vtxSrc.stop(); } catch (e) {}
      if (S.mode !== 'guide') return;
      vtxSrc = A.ctx.createBufferSource(); vtxSrc.buffer = buf; vtxSrc.connect(A.gain); vtxSrc.start();
    } catch (e) { console.warn('votrax', e); }
  }, 650);
}
/* logotipos de título (data/art/logos/<canal>[-<set>].jpg) */
const LOGOS = new Set(["201", "202", "203", "204", "205", "206", "207", "208", "209", "210", "211", "212", "213", "214", "215", "216", "217", "219", "221", "222", "223", "224", "225", "226", "228", "229", "230", "230-thunder", "231", "232", "301", "303", "304", "305", "307", "308", "330", "331", "332", "333", "334", "335", "336", "337", "338", "341"]);
const logoFor = (ch, set) => ch ? (set && LOGOS.has(ch.n + '-' + set) ? ch.n + '-' + set : LOGOS.has(String(ch.n)) ? String(ch.n) : null) : null;
function drawGuide() {
  const list = allChannels(), t0 = slotStart(), now = new Date();
  const days = ({ en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], zh: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'], ja: ['日', '月', '火', '水', '木', '金', '土'], ru: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] })[curLang] || ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const t12 = d => { let h = d.getHours(), m = d.getMinutes(); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return h + ':' + String(m).padStart(2, '0') + ' ' + ap; };
  { const cp = curProfile(); $('#gfav').innerHTML = (cp ? avatarHTML(cp, 'gav') : '') + (S.player ? esc(S.player) : 'Elegir perfil') + '<br><small style="font-weight:600">Cambiar perfil</small>'; }
  $('#gdate').innerHTML = days[now.getDay()] + ' ' + now.getDate() + '/' + (now.getMonth() + 1) + '<br>' + t12(now);
  S.gOff = S.gOff || 0;
  const tt = k => t12(new Date(t0.getTime() + k * 30 * 60000));
  $('#gtime').innerHTML = `<div>${days[t0.getDay()]}</div><div>${tt(0)}</div><div>${tt(1)}</div><div>${tt(2)}</div>`;
  const rowsEl = $('#grows'), vis = Math.max(3, Math.floor((rowsEl.clientHeight + 3) / 55) || 6);
  rowsEl.style.setProperty('--rowh', Math.floor((rowsEl.clientHeight - (vis - 1) * 3) / vis) + 'px');
  S.guideRow = Math.max(0, Math.min(list.length - 1, S.guideRow));
  const top = Math.max(0, Math.min(S.guideRow - Math.floor(vis / 2), list.length - vis));
  let html = '';
  for (let r = top; r < Math.min(list.length, top + vis); r++) {
    const ch = list[r], progs = programsFor(ch);
    if (r === S.guideRow) S.guideCol = Math.min(S.guideCol, progs.length - 1);
    const start = r === S.guideRow ? Math.max(0, S.guideCol - 2) : 0;
    let used = 0, cells = '';
    for (let i = start; i < progs.length && used < 3; i++) {
      const p = progs[i], span = Math.min(p.span, 3 - used); used += span;
      const sel = r === S.guideRow && i === S.guideCol;
      const cls = (p.off ? ' off' : '') + (sel ? ' sel' : '') + (i === start && start > 0 ? ' cont' : '') + ((used >= 3 && i < progs.length - 1) || (p.span >= 3 && !p.off) ? ' more' : '');
      cells += `<div class="prog${cls}" style="grid-column: span ${span}" data-r="${r}" data-i="${i}"><span>${p.title}</span></div>`;
    }
    html += `<div class="grow${ch === S.cur ? ' tuned' : ''}"><div class="gch" data-r="${r}"><span class="num">${ch.n}</span><span class="call">${ch.call}</span></div>${cells}</div>`;
  }
  rowsEl.innerHTML = html;
  const ch = list[S.guideRow], p = programsFor(ch)[S.guideCol];
  $('#gtitle').textContent = p && !p.off ? p.title : ch.title;
  $('#gmeta').textContent = `${ch.n} ${ch.call} · ${ch.maker} ${ch.year}` + (ch.pending ? ' · sin driver' : ch.emu ? ' · tu emulador' : ch.singe ? ' · Lua' : ' · ROM');
  $('#gtext').textContent = (ch.pending ? 'Falta emular ' + ch.pending + '. ' : '') + (ch.desc || '') + (ch.hw && !ch.pending ? ' — ' + ch.hw : '');
  $('#pipLabel').textContent = S.cur ? S.cur.n + ' ' + S.cur.call : '';
  { /* vista previa: el logotipo del canal resaltado (el canal sintonizado sigue en vivo) */
    let li = $('#pipLogo'); if (!li) { li = document.createElement('img'); li.id = 'pipLogo'; li.alt = ''; $('#pip').appendChild(li); }
    const lg = ch !== S.cur ? logoFor(ch) : null;
    if (lg) { const src = 'data/art/logos/' + lg + '.jpg'; if (li.getAttribute('src') !== src) li.src = src; li.style.display = 'block'; } else li.style.display = 'none';
    document.body.classList.toggle('pvlogo', !!lg);   /* el TV en vivo se dibuja encima del recuadro: se oculta mientras se ve el logotipo */
  }
  { const V = VOX[curLang] || VOX.es; guideSpeak(V.channel + ' ' + String(ch.n).split('').map(d => V.digits[+d]).join(' ') + '. ' + (p && !p.off ? p.title : ch.title)); }
}
function guideKey(e) {
  const list = allChannels();
  const k = e.code;
  if (/^(Digit|Numpad)\d$/.test(k)) {
    S.entry = (S.entry + k.slice(-1)).slice(-3); $('#entry').textContent = S.entry.padEnd(3, '_');
    clearTimeout(guideKey.t);
    if (S.entry.length === 3) { const n = +S.entry; guideKey.t = setTimeout(() => { S.entry = ''; $('#entry').textContent = ''; if (chByNum(n) || customByNum(n)) { closeGuide(); tune(n); } else toast('Canal ' + n + ' no existe'); }, 350); }
    e.preventDefault(); return;
  }
  switch (k) {
    case 'ArrowUp': S.guideRow = (S.guideRow - 1 + list.length) % list.length; break;
    case 'ArrowDown': S.guideRow = (S.guideRow + 1) % list.length; break;
    case 'ArrowLeft': S.guideCol = Math.max(0, S.guideCol - 1); break;
    case 'ArrowRight': S.guideCol = Math.min(programsFor(list[S.guideRow]).length - 1, S.guideCol + 1); break;
    case 'PageUp': S.guideRow = Math.max(0, S.guideRow - 6); break;
    case 'PageDown': S.guideRow = Math.min(list.length - 1, S.guideRow + 6); break;
    case 'Enter': case 'NumpadEnter': case 'Space': {
      const ch = list[S.guideRow], p = programsFor(ch)[S.guideCol];
      closeGuide(); tune(ch.n, p && p.set); break;
    }
    case 'KeyI': { const ch = list[S.guideRow]; closeGuide(); banner(ch, null, 6000); if (ch !== S.cur) tune(ch.n); break; }
    case 'KeyM': closeGuide(); openMenu(); break;
    case 'KeyR': closeGuide(); menuSel = 0; openMenu(); break;
    case 'KeyP': openProfiles(false); break;
    case 'Tab': case 'Escape': case 'Home': closeGuide(); break;
    default: return;
  }
  e.preventDefault(); if (S.mode === 'guide') drawGuide();
}
$('#grows').addEventListener('click', e => {
  const c = e.target.closest('[data-r]'); if (!c) return;
  const r = +c.dataset.r, i = c.dataset.i !== undefined ? +c.dataset.i : 0;
  if (r === S.guideRow && i === S.guideCol) { guideKey({ code: 'Enter', preventDefault() {} }); return; }
  S.guideRow = r; S.guideCol = i; drawGuide();
});
$('#grows').addEventListener('wheel', e => { S.guideRow = Math.max(0, Math.min(allChannels().length - 1, S.guideRow + Math.sign(e.deltaY))); drawGuide(); e.preventDefault(); }, { passive: false });
$('#glegend').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  ({ rec: () => guideKey({ code: 'KeyR', preventDefault() {} }), ok: () => guideKey({ code: 'Enter', preventDefault() {} }), info: () => guideKey({ code: 'KeyI', preventDefault() {} }), menu: () => guideKey({ code: 'KeyM', preventDefault() {} }), close: () => closeGuide() })[b.dataset.k]();
});
addEventListener('resize', () => { if (S.mode === 'guide') { drawGuide(); placePip(); } });
setInterval(() => { if (S.mode === 'guide') drawGuide(); }, 30000);

/* =============================================================== MENÚ */
const MENU = [
  ['Récords', () => {
    const d = HS.load(), keys = Object.keys(d).sort((a, b) => +a - +b), sel = S.recSel && d[S.recSel] ? S.recSel : keys[0];
    const chName = k => { const c = chByNum(+k); return c ? c.n + ' ' + c.title : k; };
    const tot = HS.totals();
    return `<h4>Récords</h4><p>Jugador actual: <b>${(S.player || '—').replace(/</g, '&lt;')}</b> <button class="bevel" id="mPl">Cambiar</button></p>
      <h4 style="margin-top:14px">Ranking total de todos los juegos</h4>
      <table><tr><th>#</th><th>Jugador</th><th>Total</th><th>Juegos</th><th>Mejor juego</th></tr>
      ${tot.map((p, i) => `<tr><td>${i + 1}</td><td>${(() => { const pr = PF.list().find(x => x.name === p.name); return pr ? avatarHTML(pr, 'gav') : ''; })()}${esc(p.name)}</td><td>${p.total.toLocaleString('es-MX')}</td><td>${p.games}</td><td>${chName(p.top)}</td></tr>`).join('') || '<tr><td colspan=5>Todavía no hay récords.</td></tr>'}</table>
      <h4 style="margin-top:14px">Por juego</h4>
      ${keys.length ? `<label>Juego <select class="bevel" id="mRec">${keys.map(k => `<option value="${k}" ${k === sel ? 'selected' : ''}>${chName(k)}</option>`).join('')}</select></label>
      <table><tr><th>#</th><th>Jugador</th><th>Puntos</th><th>Versión</th><th>Fecha</th></tr>${(d[sel] || []).map((e, i) => `<tr><td>${i + 1}</td><td>${e.name.replace(/</g, '&lt;')}</td><td>${e.score.toLocaleString('es-MX')}</td><td>${e.set || ''}</td><td>${e.date}</td></tr>`).join('')}</table>` : '<p>Juega algo: Dragon\'s Lair, Space Ace y Time Traveler guardan la puntuación solos; en los demás el receptor te la pregunta al cambiar de canal si echaste moneda.</p>'}
      <div class="row" style="margin-top:12px"><button class="bevel" id="mAddRec">Registrar puntuación del canal actual</button></div>`;
  }],
  ['Imagen y sonido', () => `<h4>Imagen y sonido</h4>
    <label>Volumen <input type="range" id="mVol" min="0" max="100" value="${S.settings.vol * 100}"></label>
    <label>Efecto CRT <select class="bevel" id="mCrt">${[['off', 'Apagado'], ['scan', 'Líneas de barrido'], ['ntsc', 'CRT NTSC (sprite blending)']].map(o => `<option value="${o[0]}" ${crtMode() === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></label>
    <label><input type="checkbox" id="mVtx" ${S.settings.votrax !== false ? 'checked' : ''}> Voz Votrax SC-01A en la guía de canales</label>
    <label>Idioma <select class="bevel" id="mLang">${LANGS.map((l, i) => `<option value="${l[0]}" ${(S.settings.lang || 'es') === l[0] ? 'selected' : ''}>${i + 1}. ${l[1]}</option>`).join('')}</select></label>
    <label><input type="checkbox" id="mScore" ${!S.game || S.game.showScore !== false ? 'checked' : ''}> Marcador de LED sobre el video (Dragon's Lair / Space Ace)</label>`],
  ['Controles', () => `<h4>Controles</h4><table>
    <tr><th>Control remoto</th><th>Tecla</th></tr>
    <tr><td>Guía de canales</td><td><kbd>Tab</kbd> <kbd>Inicio</kbd> <kbd>Esc</kbd></td></tr>
    <tr><td>Canal + / −</td><td><kbd>RePág</kbd> <kbd>AvPág</kbd></td></tr>
    <tr><td>Información del canal</td><td><kbd>I</kbd></td></tr><tr><td>Menú</td><td><kbd>M</kbd></td></tr><tr><td>Pantalla completa</td><td><kbd>F</kbd></td></tr>
    <tr><td>Número de canal</td><td>tres dígitos dentro de la guía</td></tr>
    <tr><th>Máquina</th><th></th></tr>
    <tr><td>Joystick</td><td><kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd></td></tr>
    <tr><td>Botón 1 / 2 / 3</td><td><kbd>Espacio</kbd> <kbd>X</kbd> <kbd>C</kbd></td></tr>
    <tr><td>Moneda / Inicio</td><td><kbd>5</kbd> <kbd>6</kbd> / <kbd>1</kbd> <kbd>2</kbd></td></tr>
    <tr><td>Nivel (Space Ace)</td><td><kbd>Q</kbd> <kbd>W</kbd> <kbd>E</kbd></td></tr>
    <tr><td>Servicio / Test / Tilt</td><td><kbd>9</kbd> <kbd>0</kbd> <kbd>T</kbd></td></tr>
    <tr><td>Mando</td><td>cruceta, A/B/X, Select = moneda, Start = inicio, LB+RB = guía</td></tr></table>
    <p>En los canales 3xx cada emulador usa sus propios controles; solo <kbd>Tab</kbd> y <kbd>RePág</kbd>/<kbd>AvPág</kbd> los atiende el receptor.</p>`],
  ['Biblioteca de ROMs', () => {
    const rows = [];
    for (const ch of CHANNELS) if (ch.sets) for (const [k, l] of ch.sets) {
      const have = !!S.lib.sets[k];
      rows.push(`<tr><td>${ch.n}</td><td>${k}</td><td>${ch.title}${l ? ' · ' + l : ''}</td><td class="${ch.pending ? 'soon' : have ? 'ok' : 'no'}">${ch.pending ? 'sin driver' : have ? 'lista' : 'falta'}</td></tr>`);
    }
    const extra = Object.keys(S.lib.sets).filter(k => !CHANNELS.some(c => c.sets && c.sets.some(s => s[0] === k))).sort();
    return `<h4>Biblioteca de ROMs</h4><p>${Object.keys(S.lib.sets).length} conjuntos indexados; las ROMs se buscan por nombre y, si no coincide, por CRC32.</p>
      <table><tr><th>Canal</th><th>Set</th><th>Juego</th><th>Estado</th></tr>${rows.join('')}</table>
      <p>Otros zips embebidos: ${extra.join(', ')}</p>`;
  }],
  ['Canales propios', () => `<h4>Canales propios (5xx)</h4>
    <p>Agrega cualquier emulador HTML autocontenido como canal nuevo. Se guarda en este navegador.</p>
    <div class="row"><button class="bevel gold" id="mAdd">Agregar canal HTML</button></div>
    <table>${(S.customs || []).map(c => `<tr><td>${c.n}</td><td>${c.title}</td><td><button class="bevel" data-del="${c.n}">Quitar</button></td></tr>`).join('') || '<tr><td>Todavía no hay canales propios.</td></tr>'}</table>`],
  ['Acerca de', () => `<h4>Daphne Disc Network</h4>
    <p>Receptor multijuego de laserdisc. Canales 2xx: núcleo DAPHNE·JS con drivers portados de Hypseus Singe (Dragon's Lair, Space Ace, Cliff Hanger, Super Don Quix-ote, Esh's, Interstellar y Badlands) y de MAME (Thayer's Quest con Votrax SC-01A, Time Traveler con 80188 y LD-V4200, Firefox con 22VP931, Cube Quest con sus tres CPUs AM2901 y la interfaz Simutrek 8748), más Bega's Battle, Cobra Command y Road Blaster con un LDP-1000 de Sony en HLE y modelos HLE de LD-V1000, PR-7820 y PR-8210. Canales 3xx: tus emuladores. Canal 400: runtime Singe sobre Lua.</p>
    <p>El video del laserdisc no viene dentro del archivo: cárgalo por canal en mp4/webm. Los .m2v de Daphne hay que convertirlos, por ejemplo <kbd>ffmpeg -i lair.m2v -i lair.ogg -c:v libx264 -g 12 -c:a aac lair.mp4</kbd>; un GOP corto hace que las búsquedas sean rápidas.</p>`]
];
let menuSel = 0;
function openMenu() { if (S.mode === 'guide') closeGuide(); S.mode = 'menu'; $('#menu').classList.add('on'); drawMenu(); }
function closeMenu() { S.mode = 'tv'; $('#menu').classList.remove('on'); }
function drawMenu() {
  $('#mnav').innerHTML = '<h3>Menú</h3>' + MENU.map((m, i) => `<button class="${i === menuSel ? 'sel' : ''}" data-i="${i}">${m[0]}</button>`).join('') + '<button data-close="1">Cerrar (M)</button>';
  $('#mbody').innerHTML = MENU[menuSel][1]();
  const v = $('#mVol'); if (v) v.oninput = () => { S.settings.vol = v.value / 100; if (S.audio) S.audio.gain.gain.value = S.settings.vol; saveSettings(); };
  const c = $('#mCrt'); if (c) c.onchange = () => { S.settings.crtMode = c.value; S.settings.crt = c.value !== 'off'; applyCrt(); saveSettings(); };
  const vx = $('#mVtx'); if (vx) vx.onchange = () => { S.settings.votrax = vx.checked; saveSettings(); };
  const ml = $('#mLang'); if (ml) ml.onchange = () => { S.settings.lang = ml.value; saveSettings(); setLang(ml.value); vtxLast = ''; };
  const sc = $('#mScore'); if (sc) sc.onchange = () => { if (S.game && 'showScore' in S.game) S.game.showScore = sc.checked; };
  const a = $('#mAdd'); if (a) a.onclick = addCustom;
  const mr = $('#mRec'); if (mr) mr.onchange = () => { S.recSel = mr.value; drawMenu(); };
  const mp = $('#mPl'); if (mp) mp.onclick = () => { closeMenu(); openProfiles(false); };
  const ma = $('#mAddRec'); if (ma) ma.onclick = () => { if (!S.cur || !(S.game || S.cur.emu)) { toast('Sintoniza un juego primero'); return; } askScore(S.cur, S.set, 'Registra una puntuación para el canal actual.').then(() => { S.mode = 'menu'; drawMenu(); }); };
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { S.customs = S.customs.filter(x => x.n !== +b.dataset.del); await IDB.set('customs', S.customs); drawMenu(); });
}
$('#mnav').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.close) return closeMenu(); menuSel = +b.dataset.i; drawMenu(); });
$('#menu').addEventListener('click', e => { if (e.target.id === 'menu') closeMenu(); });

/* canales propios */
const customByNum = n => (S.customs || []).find(c => c.n === n);
function addCustom() {
  const inp = $('#fHtml'); inp.value = '';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    const html = await f.text(), t = (html.match(/<title>([^<]*)/i) || [])[1] || f.name;
    const used = new Set((S.customs || []).map(c => c.n)); let n = 501; while (used.has(n)) n++;
    const ch = { n, call: 'U' + (n - 500), title: t.trim().slice(0, 60), year: new Date().getFullYear(), maker: 'Canal propio', hw: f.name, desc: 'Emulador HTML agregado desde el menú.', custom: 1, html };
    S.customs = (S.customs || []).concat(ch); await IDB.set('customs', S.customs);
    drawMenu(); toast('Canal ' + n + ' agregado');
  };
  inp.click();
}

/* ============================================================ ARRANQUE */
(async () => {
  applyCrt();
  ovc.width = 320; ovc.height = 240;
  ovx.fillStyle = '#000'; ovx.fillRect(0, 0, 320, 240); ovx.fillStyle = '#3cff66'; ovx.font = '14px DaphneTT, monospace'; ovx.fillText('CARGANDO BIBLIOTECA…', 70, 120);
  setLang(S.settings.lang || 'es');
  await loadEmbedded();
  try { S.customs = (await IDB.get('customs')) || []; } catch (e) { S.customs = []; }
  requestAnimationFrame(loop);
  let last = [201, null]; try { last = JSON.parse(localStorage.getItem('ddn.last')) || last; } catch (e) {}
  await tune(last[0], last[1], true);
  openGuide();
  await openProfiles(true);
  S.mode = 'guide'; drawGuide();
})();
