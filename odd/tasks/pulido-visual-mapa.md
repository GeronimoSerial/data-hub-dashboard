# Pulido visual del mapa de infraestructura

## Objetivo

Pulido estético y de comprensión completo de `/mapas/infraestructura` (Operativa, Radar,
Evolución y ficha de escuela). Solo el mapa de infraestructura: el resto del hub queda fuera
de alcance (aclaración explícita del usuario). Hoy se ve mal: colores poco claros, iconografía que no se
entiende (círculos sobre círculos, círculos grises sin sentido), labels confusos, pestañas no
centradas y sin estado activo, tooltip roto. Además, seleccionar una escuela desde el mapa
no muestra nada.

## Origen

Revisión directa en navegador (Chrome DevTools, 1440+ px, tema claro y oscuro) del
2026-09-28 sobre `feat/renovación` @ `b3228c4`, demo con datos ficticios
(`scripts/seed-demo-partes.mjs`, 47 escuelas afectadas sobre 2005 del padrón fixture).

## Preferencias explícitas del usuario

- Iconografía con `lucide-react` (ya es dependencia) o SVG reales y comprensibles.
  Nada de círculos grises sin significado ni anillos concéntricos para codificar estado.
- El mapa tiene que indicar claramente; no agregar visuales que no se entienden.
- Al seleccionar una escuela, mostrar sus datos relevantes: accesos, datos de la escuela,
  reportes (partes), etc.

## Hallazgos (evidencia del navegador)

### Mapa — Operativa
1. Clusters de colores (rojo/naranja/amarillo/azul) con número sin explicar: no se sabe si el
   número cuenta escuelas o alumnos ni qué color manda en el cluster.
2. La leyenda dice "Tamaño: fijo, igual para todas las escuelas", pero los clusters varían de
   tamaño. La leyenda contradice al mapa.
3. Estado de servicio codificado con anillos (grueso/fino/sin anillo) y halos grises para
   "sin reportar": con capas activas aparecen círculos sobre círculos ilegibles. Evacuado
   (cuadrado) y centro de evacuados (triángulo) no se distinguen a nivel cluster.
4. Capa "Todas las escuelas (padrón)": círculos grises grandes sin número ni significado claro.
5. Puntos de escuela a zoom alto: diminutos; la escuela seleccionada no queda resaltada.
6. Tooltip: el texto desborda la caja blanca; muestra el departamento aunque el cursor esté
   sobre una escuela o un cluster; tapa el elemento apuntado; queda clavado al cambiar de
   modo (Situación actual / Radar) y al cerrar la ficha.
7. Clic en una escuela del padrón sin afectación: cursor `pointer` pero no pasa nada.
8. Dos buscadores "BUSCAR ESCUELA" duplicados en el panel izquierdo (uno arriba de
   Indicadores y otro dentro de Filtros).
9. Panel izquierdo flota a media altura con scroll propio; al cargar, el panel salta.
   "Filtros del mapa" se colapsa solo al cambiar de modo.
10. Contador "2005 escuelas · 46 afectadas · 2.3%" contradice "Indicadores consolidados:
    Escuelas: 47" (verificar la fuente de verdad; puede ser un caso de datos, no solo visual).
    Además una etiqueta del mapa ("GOYA 1") se superpone al contador.
11. "Indicadores consolidados" es una lista de texto plano `Label: N`; sin jerarquía visual.
12. Leyenda verbosa, iconos de leyenda chicos y desalineados respecto al texto.
13. Controles de MapLibre en inglés ("Zoom in", "Zoom out", "Drag to rotate…").
14. Pestañas Operativa/Evolución pegadas a la izquierda, no centradas, sin indicador de activa.

### Mapa — Radar
15. "Peligro meteorológico estimado" pinta la provincia completa con un gris opaco que tapa
    departamentos y clusters (estado sin evidencia a pantalla completa).
16. La leyenda sigue siendo la de Situación actual; no hay leyenda propia del radar visible.
17. Botones de horizonte (Ahora / 24 h / 72 h / 7–10 días) deshabilitados se ven iguales a
    los habilitados.
18. Riesgo por escuela y riesgo de acceso: más círculos grises superpuestos a los clusters.
19. En Radar no hay buscador de escuela.

### Ficha de escuela (modal)
20. Modal centrado que tapa header y mapa; prever panel lateral o drawer.
21. Severidad codificada con formas distintas (círculo, cuadrado, triángulo) además del color.
22. No muestra accesos, datos de la escuela (nivel, matrícula, secciones), ni enlace a sus
    partes/reportes. Debe mostrarse para cualquier escuela del padrón, afectada o no.

### Evolución
23. Pestañas y subpestañas sin estado activo visible; contenido salta unos px entre subpestañas.
24. Gráfico de "Servicio caído" arranca el 01/01 y desperdicia ~90 % del ancho; recortar al
    rango con datos o al período vigente.
25. Sin footer; ranking de departamentos sin apoyo visual (barras).

### Transversal al mapa
26. (Fuera de alcance: footer global del hub desalineado.)
27. (Fuera de alcance: portada del hub.)
28. Modo oscuro: mapa base sigue claro, textos secundarios con contraste bajo
    (contador del panel), foco amarillo persistente en "Admin".
29. Verificar responsive (≤ 768 px) de mapa, panel y ficha.

Los hallazgos 26 y 27 quedan registrados pero fuera de alcance.

## Alcance

- `components/mapas/**`, `components/infraestructura/**`, `app/(hub)/mapas/**`,
  `lib/mapas/severidad-visual.ts`, `lib/mapas/peligro-capas.ts`, `components/mapas/overlay-styles.ts`,
  y estilos propios del mapa. No tocar portada, catálogo, header ni footer globales del hub.
- Ficha de escuela para cualquier escuela del padrón (hallazgos 7 y 22), con los datos ya
  disponibles en las APIs existentes (`/api/mapas/infraestructura/*`, `/api/infraestructura/radar`).
  Si falta un dato, reportarlo; no inventar endpoints sin consultar.
- Fuera de alcance: cambios de base de datos (DB1 en curso), jobs, ingesta, Open-Meteo.

## Restricciones

- Todo el copy de UI en español neutro y profesional; identificadores en el idioma del código.
- Iconos: `lucide-react` o SVG propios; stroke consistente; un solo set por superficie.
- Color: una escala de severidad accesible (contraste AA), consistente en mapa, leyenda y ficha;
  color nunca como único canal (icono + label).
- No romper tests existentes; tests de comportamiento para la ficha y la interacción de clic.
- No consumir cupo de Open-Meteo (demo con `ENOS_JOBS_ENABLED=false`).

## Tareas

- [x] V1 — Sistema visual: escala de severidad, tokens de color claro/oscuro, set de iconos
      Lucide para estados (suspendido, parcial, evacuado, centro de evacuados, sin reportar).
      Ver `docs/ejecucion-enos/pulido/registro.md`.
- [x] V2 — Marcadores y clusters: reemplazar anillos/halos por iconos claros; cluster con
      significado explícito; leyenda coherente con lo dibujado; selección resaltada.
      TypeScript + tests verdes; verificación visual en navegador pendiente (V9).
- [x] V3 — Tooltip: caja que contiene el texto, contenido según el objeto apuntado (escuela,
      cluster, departamento), sin tapar el objetivo, se limpia al cambiar de modo.
      TypeScript + tests verdes; verificación visual pendiente (V9).
- [x] V4 — Ficha de escuela para cualquier escuela (clic en mapa o buscador): accesos, datos,
      partes/reportes; panel lateral en lugar de modal que tapa todo. Completa (incluye
      hallazgo 20, panel lateral con Sheet). Gap de datos (matrícula/nivel por escuela):
      autorizado por N1 el 2026-09-28 y resuelto (`datosPadron` agregado, sin datos
      nominales, ver registro).
- [x] V5 — Panel izquierdo: un solo buscador, indicadores con jerarquía, estado de filtros
      persistente, sin saltos; coherencia de contadores (hallazgo 10). Completa; hallazgo 10
      resuelto con copy aclaratorio (conceptos legítimamente distintos, no un bug).
- [x] V6 — Radar: capa de peligro sin tapar el mapa (estado sin evidencia legible), leyenda
      propia, horizontes deshabilitados distinguibles, buscador disponible. Completa.
      Nota de producto pendiente: si el buscador en Radar debe alimentar el panel de riesgo
      además de/en vez de la ficha (no resuelto sin decisión de producto).
- [x] V7 — Pestañas y Evolución: centrado, estado activo, gráfico con rango útil, ranking con
      barras, footer. Completa salvo footer (investigado: su ausencia es intencional, decisión
      de producto pendiente si se quiere cambiar).
- [x] V8 — Transversal al mapa: modo oscuro del mapa (mapa base oscuro, contraste),
      controles de MapLibre en español, responsive. Completa; verificación visual (V9)
      pendiente, sobre todo del filtro CSS del mapa oscuro.
- [x] V9 — Verificación en navegador de cada sección con capturas: RESUELTA. El bloqueo de
      cookie de la sesión anterior era el bug de doble instancia de PGlite, corregido en
      9b1e0f2 — con ese fix, Playwright headless funciona normal (login real por form, sin
      ningún workaround de cookies). 13 capturas en
      /home/gero/orca/demo-data/enos-pulido/capturas/: claro 1440x900 (8 escenas: operativa,
      tooltip-cluster, radar-panel, radar-capas, leyenda-radar, leyenda-situacion,
      escuela-icono, ficha-panel), oscuro 1440x900 (3 escenas: operativa, tooltip-cluster,
      leyenda-situacion — completo quedaría bueno tener las 5 restantes, no bloqueante),
      claro 390x844 (2 escenas: operativa, ficha-panel). Script reutilizable:
      /home/gero/orca/demo-data/enos-pulido/capturas-v11.mjs. Scripts de debug viejos (44
      archivos) y capturas de descarte limpiados.
- [ ] V10 — QA estético completo del mapa de infraestructura, al detalle, hecho por el coordinador en el navegador cuando
      el N2 termina (pedido explícito del usuario). Recorre los 29 hallazgos y cada estado:
      hover, foco, capas combinadas, Radar por horizonte, ficha, Evolución, claro/oscuro,
      móvil. Lo que no pase vuelve al N2 como corrección.
      Primera pasada hecha 2026-09-28 11:00 UTC por N1 (chrome-devtools, demo :3202,
      1448 px y 390 px, claro y oscuro). Resuelto: pestañas centradas con estado activo
      (Base UI usa data-active, confirmado en DOM), panel izquierdo anclado arriba con un
      solo buscador e indicadores con jerarquía, contadores coherentes (47/47 con nota),
      leyenda con íconos Lucide, ficha para cualquier escuela con datos de padrón,
      Evolución con rango útil, mapa base oscuro, controles en español, sin scroll
      horizontal en móvil. Pendiente, vuelve como V11.

### V11 — Correcciones del QA de N1 (bloquean el cierre)

- [x] Q1 — Clusters engañosos: el número del cluster ahora muestra `escuelasAfectadas` (no el
      total agrupado), vacío si es 0 (no se lee como alerta). Tooltip con desglose
      "N escuelas · M afectadas (X críticas, Y altas)" (clusterProperties `criticas`/`altas`
      nuevos). Leyenda actualizada. `components/mapas/map-infraestructura-page.tsx`
      (líneas ~1858-1870, ~1911, ~2077-2095), `components/mapas/legend-panel.tsx` (~217).
      tsc + vitest verdes (101→177 tests). Verificación visual en navegador pendiente.
- [x] Q2 — Radar, riesgo por escuela: reemplazadas las 2 capas circle (círculo+halo) por
      `<Marker>` DOM con ícono `TriangleAlert` coloreado por nivel (`colorPuntoRiesgo()` en
      `lib/mapas/peligro-capas.ts`); `sin_dato` filtrado, no se dibuja. tsc + vitest verdes
      (177 tests). Verificación visual pendiente.
- [x] Q3 — Radar, peligro por departamento: `paintCoropletaPeligro()` (lib/mapas/peligro-capas.ts)
      con `fill-opacity` data-driven, 0 para `sin_dato` (antes 0.55 fijo siempre). tsc + vitest
      verdes. Verificación visual pendiente.
- [x] Q4 — Radar, leyenda: agregado el CSS que faltaba para `.peligro-legend*`
      (app/globals.css, ~línea 72) — el JSX ya traía swatch+ícono+etiqueta pero sin ninguna
      regla CSS, se veía como lista con viñetas del navegador. tsc + vitest verdes.
      Verificación visual pendiente.
- [x] Q5 — Escuela seleccionada: reemplazado el `<Source>/<Layer>` circle (anillo) por
      `<Marker>` + ícono `MapPin` de lucide-react en `COLOR_FOCO_SELECCION`, anchor="bottom".
      `components/mapas/map-infraestructura-page.tsx`. tsc + vitest verdes. Verificación
      visual pendiente.
- [x] Q6 — Ficha (integrada con Q14, panel propio):
      a) hecho — nueva prop `escuela` (identidad del padrón completo, `dataEscuelasMapa`)
         pasada a `FichaParteModal`, título/CUE/localidad/departamento siempre visibles;
      b) hecho — estados vacíos con clase `estado-actual-bloque__vigencia` (texto secundario)
         en vez de `__valor` (titular);
      c) hecho vía Q14 (panel propio, ver abajo);
      d) hecho — nuevo `IndicadorSeveridadFicha` local (sólo en la ficha): ícono fijo
         `CircleAlert` + color + texto, sin variar forma por nivel; NO se tocó el componente
         compartido `EstadoActualSeveridad` (usado fuera del mapa, en afectacion-borrador.tsx/
         afectacion-campos.tsx, fuera de alcance);
      e) hecho — `FichaTerritorial` ya mostraba riesgo de acceso con fallback "Sin datos de
         acceso"; agregado enlace "Cargar o actualizar el parte" a
         `/infraestructura/cargar?cue=...` (ruta real confirmada, `app/(hub)/infraestructura/
         cargar/page.tsx`);
      f) hecho — "Ver alumnos alcanzados" pasó de `variant="secondary"` a `variant="ghost"`.
      `components/infraestructura/ficha-parte-modal.tsx`. tsc + vitest verdes (370 tests).
      Verificación visual pendiente.
- [x] Q7 — Tooltip: los 3 `<Popup>` (departamento/escuela/cluster) sacaron el `anchor="bottom"`
      fijo; sin esa prop, react-map-gl/maplibre calcula el anclaje automáticamente según el
      espacio disponible (maplibre-gl@6.3.0 no acepta el string `"auto"` explícito, el
      comportamiento automático es el default al omitir `anchor`). tsc + vitest verdes.
      Verificación visual pendiente.
- [x] Q8 — Absorbido por Q13a (ver abajo): el ícono School reemplaza al punto de 6px, con
      halo de color de severidad alrededor (radio subido a 14px en `circlePaintPartes()`
      para que el color siga visible bajo el ícono). No se tocó el mapa base por defecto
      (queda "Mapa claro"/voyager); no se atenuaron los POI de transporte — no investigado,
      queda como gap conocido si el ícono más grande no alcanza. Verificación visual pendiente.
- [x] Q9 — Modo oscuro: filtro CSS del canvas ajustado con matemática calculada (no a ojo):
      `brightness(1.1) invert(0.72) contrast(1.2) hue-rotate(195deg)`. Recalculado dos
      veces: primero contra la paleta arcoíris vieja (Crítica 1.98:1 → 3.42:1 de
      contraste), y de nuevo tras Q19 (paleta tonal roja/azul nueva) — con los tonos
      nuevos el filtro se mantiene (ningún tono colapsa con otro de su escala, ΔE00 mín.
      9.5), pero el contraste de texto claro sobre Crítica bajó a ~2.4:1 (el tono
      resultante es más medio ahora); probados hue-rotate 165/180/210° sin mejora clara,
      documentado como límite conocido del enfoque (un solo canvas WebGL compartido, no
      se puede aplicar el filtro sólo al basemap). Evidencia completa (tabla de 8 colores
      antes/después) como comentario en app/globals.css. tsc + vitest verdes.
- [x] Q10 — Móvil: agregado `<AttributionControl position="bottom-right" compact />`
      explícito (antes sin declarar, quedaba con el ancho default de maplibre-gl). Compact
      solo no alcanzaba para "Pantalla completa" (misma esquina); refuerzo CSS sube
      `.map-fullscreen-btn` y `.map-left-stack-toggle` a `bottom: 46px` dentro del media
      query de 720px. tsc + vitest verdes. Verificación visual pendiente.
- [x] Q11 — Leyenda de Situación actual: `.map-legend-item` pasó de `align-items: center` a
      `flex-start` (correcto con texto multilínea) + `flex-shrink: 0` en los íconos
      (app/globals.css). Ícono de "Sin reportar" cambiado de `CircleHelp` a `Clock`; copy de
      los 5 ítems de estado y del cluster gris acortado a una línea manteniendo el
      significado (`components/mapas/legend-panel.tsx`). tsc + vitest verdes. Verificación
      visual pendiente.
- [x] Q12 — Evolución: `GraficoSerieServicioCaido` (`components/infraestructura/
      evolucion-graficos.tsx`) — línea `type="monotone"` → `"stepAfter"` (datos diarios, sin
      valores intermedios inventados); tooltip ya existía, mejorado el formatter
      ("N escuelas"); eje X con `interval` numérico calculado en vez de
      `"preserveStartEnd"` para marcas parejas sin importar dónde arranca el recorte de
      `recortarSerieAlRangoConDatos`. tsc + vitest verdes (268 tests). Verificación visual
      pendiente.

### Q13/Q14 — Pedido directo del usuario vía N1 (2026-09-28, PRIORIDAD ALTA, antes que el resto de V11)

- [x] Q13 — Escuelas individuales del padrón:
      a) hecho — nuevo ícono `School` de lucide-react registrado vía `map.addImage`
         (`lib/mapas/iconos-mapa.ts`, `ID_IMAGEN_ESCUELA`/`SVG_ICONO_ESCUELA`, mismo patrón de
         fondo blanco + contorno que Tent/DoorOpen), capa `symbol` nueva
         `infra-partes-escuela-icono` sobre la capa `circle` existente. El círculo de color
         (severidad) subió su radio a 14px para que quede un anillo de color visible alrededor
         del ícono blanco (antes el badge de 22px tapaba por completo el círculo de 12px —
         hallazgo real encontrado y corregido en la misma tarea);
      b) hecho — la nueva capa symbol tiene un área de hit-testing mucho mayor (~22px vs 12px
         del círculo) y se agregó a `capasInteractivas`, `handleClick` y `handleMouseMove`
         junto a `CAPA_PARTES_ID`, así un clic/hover que acierte el ícono (no sólo el centro
         exacto del círculo) abre la ficha / muestra el tooltip de escuela en vez de perder
         contra el departamento de abajo.
      `lib/mapas/iconos-mapa.ts`, `components/mapas/map-infraestructura-page.tsx`. tsc +
      vitest verdes. Verificación visual en navegador (clic real sobre una escuela del padrón
      en Capital, como probó N1) pendiente.
- [x] Q14 — Ficha con panel propio: `SheetRoot`/`SheetContent` (primitiva genérica con
      backdrop) reemplazado por un `<div className="map-ficha-panel">` a mano, sin backdrop,
      `role="dialog" aria-modal="false"`, cierre con Esc (listener propio) y con botón (ícono
      `X`), foco al abrir movido al botón de cerrar, transición de entrada corta
      (`translateX` + opacity, 160ms), CSS propio con los tokens del resto del mapa
      (`var(--card)`, `var(--ink)`, `var(--r-sm)`, `var(--e-float)`), ancho 400px en
      escritorio anclado al borde derecho dentro de `.map-shell`, hoja inferior a pantalla
      completa (`max-height: 80vh`) bajo 720px. `components/infraestructura/ficha-parte-modal.tsx`,
      `app/globals.css`. tsc + vitest verdes (370 tests). Verificación visual pendiente.

Verificación visual en navegador (capturas Playwright vía N3) de Q1-Q14 pendiente — código y
tests verdes, falta el QA visual real antes del cierre.

### Q15/Q16/Q17 — QA parcial de N1 en navegador sobre Q13/Q14 (2026-09-28, PRIORIDAD ALTA)

Q13/Q14 confirmados correctos en navegador por N1. Aparecieron 3 hallazgos nuevos:

- [x] Q15 — Confirmado: `.map-ficha-panel` y `.map-controls-stack` compartían `top/right: 12px`
      y el MISMO `z-index: 3`; el orden del DOM decidía cuál ganaba, y perdía la ficha. Subido
      `.map-ficha-panel` a `z-index: 4` (app/globals.css). tsc + vitest verdes (447 tests).
      Verificación visual pendiente.
- [x] Q16 — Los 3 datos de "Datos de la escuela" (niveles/matrícula/secciones) usaban
      `estado-actual-bloque__valor` (escala de titular, diseñada para el dato principal de
      OTRAS pantallas del hub, no tocada). Cambiados a `estado-actual-bloque__vigencia`
      (texto secundario). `turnos` ya estaba correcto. Estado del servicio/establecimiento
      siguen en titular a propósito (son el dato principal de la ficha).
      `components/infraestructura/ficha-parte-modal.tsx`. Verificación visual pendiente.
- [x] Q17 — REABIERTO por N1, ahora completo. Normal (sin afectación): fondo blanco,
      borde gris fino `#9ca3af`, ícono gris oscuro `#4b5563` (tema claro); variante
      dedicada para tema oscuro (`SVG_ICONO_ESCUELA_NORMAL_OSCURO`, seleccionada vía
      `useThemeMode()`), con colores de entrada COMPENSADOS matemáticamente para que,
      tras pasar por el filtro CSS del canvas, el resultado final sea gris pizarra
      oscuro con ícono claro (el filtro invierte luminancia; se calculó el color de
      entrada que produce el resultado deseado, mismo método que Q9). Afectadas: fondo
      lleno del color de severidad (`PALETA_TONAL_SEVERIDAD`, ya vigente desde Q19),
      trazo oscuro sobre Baja/Media y blanco sobre Alta/Crítica. Tamaño subido a
      `icon-size: 1.2` sólo en la capa de escuela individual (no afecta los íconos de
      cluster). Verificado con capturas Playwright propias (no delegadas): comparé el
      MISMO ícono a igual zoom en claro y oscuro — en oscuro es un gris-pizarra
      claramente distinto del blanco de tema claro, confirmando que la variante
      dedicada se aplica (mi primera lectura de una captura panorámica había sido un
      falso positivo por íconos demasiado chicos para juzgar el color a simple vista).
      tsc + vitest verdes.
- [x] Q18 — Nuevo: scroll horizontal en la ficha (contenido más ancho que el panel,
      probablemente algún bloque sin `overflow-wrap`/`min-width: 0` dentro de
      `.map-ficha-panel` o `.ficha-parte-sheet__body`). Agregado `overflow-x: hidden`,
      `overflow-wrap: break-word`, `min-width: 0` a `.map-ficha-panel`
      (app/globals.css). tsc verde.

### Q19/Q20 — Pedido directo del usuario vía N1 (2026-09-28, PRIORIDAD ALTA, antes de V9)

- [x] Q19 — Paleta tonal de una sola gama. Decisión de producto del usuario (vía
      `orca orchestration ask`): severidad en ROJO (Baja `#fecaca`, Media `#f87171`,
      Alta `#dc2626`, Crítica `#7f1d1d`), Radar en AZUL (mismo patrón que
      `PALETA_SECUENCIAL` de natalidad: `#eff6ff`/`#93c5fd`/`#3b82f6`/`#1e3a8a`), nunca
      semáforo. Módulo único `lib/mapas/paleta-tonal.ts` (`PALETA_TONAL_SEVERIDAD`,
      `PALETA_TONAL_PELIGRO`), consumido por `lib/infraestructura/severidad.ts` y
      `lib/mapas/peligro-capas.ts` (fuente única, sin duplicar hex). Contraste
      ajustado: texto del número de cluster y trazo de los íconos de escuela por
      severidad pasan a oscuro sobre Baja/Media (fondos claros) y claro sobre
      Alta/Crítica (fondos oscuros). Durante la verificación se encontró y corrigió
      un bug real no relacionado (bucle infinito en el mock de test de MapGL, ver
      registro). tsc + vitest verdes (447 tests, ~22s).
- [x] Q20 — Tooltip sólo al hacer clic, sin popups de hover. Sacados `handleMouseMove`/
      `handleMouseLeave` y el estado `hoverInfo` (con su tipo `HoverMapa`, código muerto
      asociado limpiado: `offsetTooltip`, `iconoTooltipEscuela`,
      `TEXTO_SIN_AFECTACION_REPORTADA`). Los popups de 'escuela' y 'cluster' se
      eliminaron sin reemplazo (el clic ya abre la ficha / hace zoom de expansión,
      redundante mostrar un popup además). Departamento: nuevo estado
      `departamentoInfoClic`, mismo contenido/estilo que el popup viejo, atado al clic
      sobre la capa de departamento (toggle de selección); se cierra con cualquier otro
      clic, al cambiar de modo, o con Esc (listener propio). tsc + vitest verdes (104
      tests, área mapas).

### V12 — Segundo QA de N1 (2026-09-28 15:40 UTC, chrome-devtools, :3202, 1448 px y 390 px, claro y oscuro)

Resuelto en navegador: Q1 (clusters cuentan afectadas), Q2/Q3/Q4 (Radar sin anillos grises, sin velo, leyenda azul con muestras), Q13 (ícono School y selección por clic en el padrón), Q14/Q15/Q16 (ficha propia, encima de los paneles, datos compactos), Q17 (normales claras, afectadas en rojo lleno), Q19 (gama tonal roja/azul), Q20 hover sin popup y popup de departamento al clic.

- [x] R1 — Atribución de MapLibre duplicada: `attributionControl={false}` en `<MapGL>` (react-map-gl agregaba su propio control además del explícito). Una sola `.maplibregl-ctrl-attrib`, verificado claro/oscuro 1440px y 390px, sin solapar "Buscar escuelas"/"Pantalla completa" en móvil.
- [x] R2 — Modo oscuro: sacado el filtro CSS `brightness/invert/contrast/hue-rotate`. El proveedor SÍ ofrece un estilo oscuro real (`https://tiles.openfreemap.org/styles/dark`, no probado antes); `mapStyle` lo usa en tema oscuro. Colores de severidad y Radar idénticos en claro y oscuro (verificado con capturas). Revertido también el ícono de escuela "normal" compensado para el filtro viejo (ya no hace falta).
- [x] R3 — Clic en cluster ahora abre un popup con el resumen ("N escuelas · M afectadas (x críticas, y altas)") y un botón "Acercar"; el zoom sólo ocurre al elegir esa acción. Verificado con clic real en el popup y en "Acercar" (claro y oscuro).
- [x] R4 — "Quitar filtro" de departamento vuelve a encuadrar la provincia (`fitBounds(LIMITES_CORRIENTES)`), tanto desde el botón como desde el toggle de deselección por clic. Verificado: el contador vuelve a "2005 escuelas" y el mapa muestra la provincia completa.
- [x] R5 — Leyenda de Radar: "Sin dato" ahora con muestra vacía (sólo contorno, `background: transparent`) y el texto "Sin dato (no se colorea)". Verificado.
- [x] R6 — Íconos de escuelas sin afectación: el círculo de severidad detrás del ícono (gris, pensado para afectadas) ahora queda con opacidad 0 cuando la escuela no tiene afectación; el ícono blanco queda limpio, sin halo gris. Verificado con captura recortada centrada en el ícono.
- [x] R7 — Popups: `font-weight: 400` en el contenedor, `font-weight: 600` sólo en `<strong>` (antes el CSS forzaba negrita en todo el texto, pisando el markup). Verificado en el popup de departamento.

## Checks

- `pnpm test` (vitest) verde; `pnpm lint`; `pnpm build`.
- Revisión en navegador de cada hallazgo, con antes/después.

## Estado

- Ruta: delegado (N2 → N3), cerrado por N2.
- Progreso: V1-V8, V11 (Q1-Q20) y V9 completos (pasadas anteriores). V12 (R1-R7,
  segundo QA de N1) completo en esta pasada: los 7 hallazgos corregidos por N3,
  verificados por mí (N2) leyendo cada diff, y con revisión visual real en
  navegador (Playwright, `capturas-v12.mjs`) hecha y mirada por mí, no delegada —
  a diferencia de V11/Q13-Q20, donde la revisión visual sistemática quedó
  pendiente para N1. Verificación funcional completa: `pnpm exec tsc --noEmit`
  limpio, suite completa **224 archivos / 1990 tests** (+3 skipped preexistentes)
  bajo flock, `pnpm lint` limpio, `pnpm build` exitoso. Demo levantada y estable
  en :3202 (reusada, no reiniciada). Ver `docs/ejecucion-enos/pulido/registro.md`,
  sección "V12", para el detalle completo de cada corrección y evidencia.
