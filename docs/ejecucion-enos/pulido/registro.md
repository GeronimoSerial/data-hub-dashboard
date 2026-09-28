# Pulido visual del mapa — Registro de ejecución

Batch: pulido estético y de comprensión de `/mapas/infraestructura`
(Operativa, Radar, Evolución, ficha de escuela). Ver
`odd/tasks/pulido-visual-mapa.md` para el documento fuente (29 hallazgos,
tareas V1-V10; V10 la hace N1).

Ruta: N2 (sonnet, este registro) coordina y verifica; toda edición de
código/tests/estilos la hace un N3 (`opencode run --auto -m
opencode-go/deepseek-v4.1-flash`), en foco, uno por vez.

## Estado por tarea

| Tarea | Estado | Nota |
|---|---|---|
| Demo local (prerrequisito) | **Completa** | ver "Demo local" abajo, con 2 bugs de PGlite encontrados y corregidos |
| V1 — Sistema visual (tokens, iconos Lucide) | **Completa** | ver "V1+V2" abajo |
| V2 — Marcadores y clusters | **Completa** | ver "V1+V2" abajo; verificación visual en navegador pendiente (ver nota) |
| V3 — Tooltip | **Completa** | ver "V3" abajo; verificación visual pendiente |
| V4 — Ficha de escuela (clic/buscador, cualquier escuela) | **Completa** | ver "V4" abajo; verificación visual pendiente |
| V5 — Panel izquierdo | **Completa** | ver "V5" abajo; verificación visual pendiente |
| V6 — Radar | **Completa** | ver "V6" abajo; verificación visual pendiente |
| V7 — Pestañas y Evolución | **Completa** | ver "V7" abajo; verificación visual pendiente |
| V8 — Transversal (oscuro, MapLibre es, responsive) | **Completa** | ver "V8" abajo; verificación visual pendiente |
| V9 — Verificación en navegador con capturas | Pendiente | |
| V10 — QA final del coordinador (N1) | Fuera de este N2 | |

## Demo local

Comando exacto para relanzarla (N1 lo reusa para el QA):

```sh
cd /home/gero/orca/workspaces/data-hub-dashboard/enos-pulido
set -a && source /home/gero/orca/demo-data/enos-pulido/.env.demo && set +a
pnpm dev -p 3202
# (o: pnpm exec next dev -p 3202 --webpack, si se quiere probar sin Turbopack)
```

`.env.demo` (en `/home/gero/orca/demo-data/enos-pulido/.env.demo`, fuera del
repo, permisos 600) tiene: `DATA_DIR=/home/gero/orca/demo-data/enos-pulido`,
`ENOS_JOBS_ENABLED=false`, `RISK_ENGINE_ENABLED`, `RISK_RADAR_ENABLED`,
`HAZARD_CONTEXT_ENABLED`, `SITUACION_ENABLED`, `SEASONAL_ENABLED`,
`EPISODIOS_DERIVADOS_ENABLED` en `true`, `NOMINAL_ENCRYPTION_KEY` (base64 32
bytes), `BETTER_AUTH_SECRET`, `ADMIN_EMAIL=demo@enos.local`,
`ADMIN_PASSWORD` (aleatoria, generada una vez, no rotada). Login del admin
generado la primera vez que corre `ensureSeeded()` (`ADMIN_EMAIL`/
`ADMIN_PASSWORD` sólo se usan si la tabla `user` está vacía).

Sembrado de datos (correr una sola vez, ya hecho para esta demo):

```sh
cd /home/gero/orca/workspaces/data-hub-dashboard/enos-pulido
set -a && source /home/gero/orca/demo-data/enos-pulido/.env.demo && set +a
node scripts/sync-ge.mjs --fixture        # 2005 escuelas del padrón (fixture)
DEMO_OK=1 node scripts/seed-demo-partes.mjs   # 47 escuelas afectadas, variedad de estados
```

Resultado observado del seed (verificación con `listarPartesVigentes()`
incluida en el propio script): 47 escuelas con parte, `conServicioSuspendido:
5`, `conServicioParcial: 10`, `evacuadas: 6`, `centrosDeEvacuados: 4`,
`sinReportar: 8`, `alumnosAlcanzados: 1658`, `seccionesAlcanzadas: 82`.

### Bugs de PGlite encontrados y corregidos (prerrequisito de la demo, no visual)

Ninguno de estos tres cambios lo escribí yo: los tres los aplicó un N3, verificados
por mí antes de aceptarlos (leí cada diff y corrí la verificación funcional
yo mismo, no sólo el exit code del N3).

1. **`scripts/seed-demo-partes.mjs` seguía abriendo SQLite crudo**
   (`@libsql/client` contra `ge.sqlite`/`hub.sqlite`) en vez del ejecutor
   Postgres/PGlite compartido que ya usa `sync-ge.mjs` desde DB1. Fallaba con
   `SQLITE_ERROR: no such table: ge.ge_corte`. Fix: usar
   `crearEjecutorSql(getRawClient())` para `ge` y `hub` (mismo objeto para
   ambos, porque en Postgres son el mismo backend con schemas distintos), sin
   `.close()` al final (igual que `sync-ge.mjs`).
2. **Referencias sin prefijo de schema a las tablas de GE**
   (`ge_corte`, `ge_seccion`, `ge_alumno_seccion`, `ge_alumno_identidad`,
   `ge_localizacion`): en Postgres viven en el schema `ge` (`ge.ge_localizacion`,
   etc., ver `lib/infraestructura/ge-db.ts`), no en el schema público. Se
   agregó el prefijo `ge.` en las 7 queries crudas que lo necesitaban.
3. **`enTransaccion` local usaba la API vieja de libsql**
   (`client.transaction('write')`), incompatible con el ejecutor compartido
   (sólo expone `execute()`). Reemplazado por `ejecutarEnTransaccion` de
   `lib/infraestructura/ge-db.ts`, que ya implementa BEGIN/COMMIT/ROLLBACK
   para ese ejecutor. Se borró el helper local sin uso.
4. **Bug real y más grave, fuera de `seed-demo-partes.mjs`**: cualquier
   request que dispara `ensureSeeded()`/`migrarDb()` bajo PGlite (sin
   `DATABASE_URL`, el caso local/demo) tira 500 con
   `TypeError: The "path" argument must be of type string or an instance of
   Buffer or URL. Received an instance of URL`, tanto con Turbopack como con
   webpack (no es específico de un bundler). Causa real (confirmada con
   stack completo vía `__NEXT_SHOW_IGNORE_LISTED=true`): no es
   `migrationsFolder`, es `@electric-sql/pglite-utils` inicializando su wasm
   con `fs.readFile(fsBundleUrl)` donde `fsBundleUrl` es un `new URL(...,
   import.meta.url)` que el bundler de Next reescribe a un objeto que no pasa
   el `isURL()` interno de Node. Fix: sumar `@electric-sql/pglite` a
   `serverExternalPackages` en `next.config.mjs` (mismo patrón que ya
   existía ahí para `@libsql/client`/`libsql`), para que Next lo resuelva
   nativo en runtime en vez de bundlearlo. Verificado con la suite de
   `lib/db` (44/44 verde) y con el repro real (500 → 307 a `/login`, que es
   el comportamiento esperado sin sesión).

Este bug (4) es preexistente y afecta a cualquier demo local con PGlite, no
sólo a esta tarea; lo dejo documentado acá porque bloqueaba directamente el
armado de la demo pedida en el brief.

## V1+V2 — Sistema visual e íconos de marcador/cluster (hallazgos 1, 2, 3, 4, 5, 12)

Hecho por N3 en 3 pasadas (una se cortó por timeout a mitad de camino,
retomada por la siguiente sin perder trabajo), verificado por mí (leí cada
diff completo, no sólo el reporte de N3).

- `lib/mapas/severidad-visual.ts`: función pura `iconoEstadoEscuela()` — un
  solo ícono lucide-react por escuela, por prioridad (mayor a menor):
  `Tent` (centro de evacuados) → `DoorOpen` (evacuado) → `CircleSlash`
  (servicio suspendido) → `TriangleAlert` (servicio parcial) → `CircleHelp`
  (sin reportar) → `null` (normal, sin badge). Con tests.
- `lib/mapas/iconos-mapa.ts` (nuevo): SVG standalone de los 2 íconos que
  hacen falta a nivel CLUSTER (Tent, DoorOpen), para `map.addImage()` —
  MapLibre no puede pintar un componente React en una capa `symbol`.
- `components/mapas/map-infraestructura-page.tsx`: eliminadas las 3 capas de
  anillo/halo (sin-reportar, evacuado-cluster, y el circle-stroke-width
  variable por servicio). Reemplazadas por:
  - Badge DOM (mismo patrón `<Marker>` que ya usaba evacuación) con el ícono
    de mayor prioridad, sólo sobre escuelas no agrupadas.
  - A nivel cluster, 2 capas `symbol` con `icon-image` (Tent/DoorOpen según
    el agregado `esCentroEvacuados`/`esEvacuado` de supercluster) en vez del
    anillo genérico que no distinguía cuál de los dos estados contenía la
    burbuja (hallazgo 3, textual).
  - Resaltado de selección (hallazgo 5) extendido: antes sólo marcaba la
    escuela del buscador; ahora también la de la ficha abierta por clic.
- `lib/mapas/construir-escuelas-mapa-feature-collection.ts`: nuevo campo
  `esCentroEvacuados` en el feature, para que el agregado del cluster pueda
  distinguir ambos estados.
- `components/mapas/legend-panel.tsx`: reemplazado el bloque de swatches de
  anillo CSS por los mismos 5 íconos, mismo orden de prioridad; agregadas
  las aclaraciones de copy de los hallazgos 1 (qué cuenta el número de
  cluster), 2 (tamaño fijo por escuela, clusters sí escalan) y 4 (cluster
  gris = sin novedad).

**Verificación (corrida por mí después de aceptar el trabajo, no sólo el
reporte de N3)**: `pnpm exec tsc --noEmit` sin errores; `pnpm vitest run
components/mapas lib/mapas --maxWorkers=2` → 15 archivos / 169 tests, verde.

**Pendiente**: verificación visual en navegador (claro/oscuro, 1440/390 px,
hover, capas combinadas) — el chrome-devtools-mcp está tomado por otra
sesión (probablemente el propio N1 verificando en paralelo) y la extensión
claude-in-chrome no está conectada en este entorno. Se hace en un solo
bloque (V9) más adelante, o apenas se libere la herramienta.

## V3 — Tooltip (hallazgo 6)

Un solo estado `hoverInfo` (unión discriminada `departamento | escuela |
cluster`) resuelve la prioridad en un único lugar dentro de
`handleMouseMove`: si el cursor toca una escuela o un cluster, ese tooltip
gana siempre sobre el de departamento (el relleno departamental está debajo
de todo, así que antes MapLibre devolvía ambas features y sólo se miraba la
de departamento — de ahí que el tooltip mostrara el departamento con el
cursor sobre una escuela). Contenido nuevo por tipo: escuela (nombre,
severidad o "sin afectación reportada", y estado del badge si tiene); cluster
(cantidad de escuelas agrupadas, no alumnos, y severidad máxima).

Fixes de UI: `maplibre-popup.css` pasó de `white-space: nowrap` sin límite a
`max-width: 260px` + `white-space: normal` + `overflow-wrap: break-word`
(la oración de departamento desbordaba la caja cerca del borde del mapa).
`offsetTooltip()` separa la caja del punto para no taparlo. El tooltip se
limpia explícitamente al cambiar de modo (`toggleModo`, `volverDeReplay`) y
al cerrar la ficha (`onOpenChange` de `FichaParteModal`) — antes quedaba
clavado porque `onMouseMove` no vuelve a dispararse solo por esos cambios.

**Verificación**: `pnpm exec tsc --noEmit` sin errores; `pnpm vitest run
components/mapas lib/mapas --maxWorkers=2` → 15 archivos / 172 tests, verde
(+3 sobre V1+V2). Verificación visual en navegador pendiente (misma nota que
V1+V2).

## V4 — Ficha de escuela para cualquier escuela (hallazgos 7, 22)

Este era el pedido explícito y no negociable del usuario ("al seleccionar
CUALQUIER escuela se muestran sus datos relevantes"). El servidor
(`/api/mapas/infraestructura/parte`) ya estaba listo (responde 200 con
`parte: null` para una escuela sin afectación, nunca 404); el bloqueo era
enteramente del cliente:

- `handleClick` y `handleSeleccionarEscuelaBuscada` (buscador) en
  `map-infraestructura-page.tsx` tenían un gate `if (partesPorCue.has(cue))
  setSeleccionCue(cue)` que dejaba el clic sin efecto para cualquier escuela
  del padrón sin afectación vigente (hallazgo 7, textual). Sacado en los dos
  lugares: ahora cualquier escuela real del padrón abre la ficha.
- `ficha-parte-modal.tsx` no distinguía "todavía cargando" de "cargó y no hay
  afectación": ahora muestra "Sin afectaciones reportadas para esta escuela."
  en vez de una sección vacía que se leía como rota.
- Nueva sección "Datos de la escuela": cantidad de secciones y desglose por
  turno, leído de un campo (`secciones`) que la ruta YA devolvía pero el
  cliente ignoraba.
- "Accesos": `<FichaTerritorial>` ya existía y ya estaba wireada por
  `hazardContextEnabled` (true en la demo); con el gate de clic sacado, ya se
  abre para cualquier escuela sin tocarla.
- "Enlace a partes/reportes": el botón "Ver historial completo" ya cubre
  esto y sigue igual (correctamente vacío/ausente si no hay historial).

**Gap de datos — reportado y luego AUTORIZADO por N1/usuario (2026-09-28
07:18), resuelto**: matrícula total de alumnos y nivel educativo por
escuela no estaban disponibles en ningún endpoint de lectura general. N1
autorizó extender `/api/mapas/infraestructura/parte` con un agregado nuevo,
sin datos nominales. Implementado:

- `lib/infraestructura/datos-padron-escuela.ts` (nuevo):
  `obtenerDatosPadronEscuela(client, corteId, cueAnexo)` — dos consultas
  agregadas (GROUP BY nivel/turno sobre `ge.ge_seccion`; COUNT DISTINCT de
  `ge.ge_alumno_seccion` para matrícula total), sin N+1, nunca trae
  `ge_person_id` al proceso. Devuelve `null` si la escuela no tiene ninguna
  sección en el corte vigente (la ficha muestra "Sin datos del padrón para
  esta escuela", nunca un cero inventado); una escuela con secciones pero
  sin alumnos matriculados sí devuelve `matriculaTotal: 0` (dato real).
  Confirmado que no existe columna de ámbito/sector en el schema `ge`: se
  omitió, no se inventó.
- `app/api/mapas/infraestructura/parte/route.ts`: agrega `datosPadron` a la
  respuesta (con `parte: null` o con afectación, siempre que haya CUE válido
  y corte vigente), mismo guard de acceso que el resto de la ruta.
- `ficha-parte-modal.tsx`: la sección "Datos de la escuela" ahora muestra
  nivel(es) educativo(s), matrícula total, secciones y turnos desde
  `datosPadron` (reemplaza el cálculo previo, más pobre, sobre el array
  crudo de secciones).
- Tests: fixture PGlite con secciones/matrícula sembrada a mano para los 4
  casos (agregación correcta, `null` sin secciones, matrícula 0 real,
  ausencia de identidad de alumno); test de ruta sin sesión (401/403, mismo
  patrón que las rutas hermanas); test explícito recorriendo todo el JSON de
  respuesta buscando claves de identidad de alumno (`gePersonId`, `dni`,
  etc.) — ausentes.

**Verificación**: `pnpm exec tsc --noEmit` sin errores; `pnpm vitest run
lib/infraestructura app/api/mapas/infraestructura components/infraestructura
--maxWorkers=2` → 130 archivos / 1225 tests (+3 skipped preexistentes),
verde.

**Verificación**: `pnpm exec tsc --noEmit` sin errores; `pnpm vitest run
components/mapas components/infraestructura lib/mapas --maxWorkers=2` → 41
archivos / 433 tests, verde. Incluye una regresión actualizada
deliberadamente: el test viejo afirmaba "buscar y seleccionar una escuela
sin afectación ... no abre ficha"; ahora afirma que SÍ la abre (el cambio de
comportamiento es intencional, no un test roto).

**Hallazgo 20 (modal que tapa el mapa)**: `FichaParteModal` pasó de
`Dialog`/`DialogContent` centrado a `SheetRoot`/`SheetContent side="right"`
(components/ui/sheet.tsx), mismo patrón ya usado por `HistorialParteModal`
en este mismo mapa (el modal de "Ver historial completo"). Mismo primitivo
Radix por debajo, sólo cambia el shell visual; el ancho (`min(38rem,
100vw)`) y el scroll interno replican los que ya usa el historial.
Verificado con la misma corrida de tests de arriba (433/433, sin
regresiones).

## V5 — Panel izquierdo (hallazgos 8, 9, 10, 11)

- **Hallazgo 8** (dos buscadores duplicados): `ListaAlertas` tenía su propio
  campo "Buscar escuela" (sólo entre escuelas con parte vigente) además del
  `EscuelaSearchBox` de arriba (padrón completo, flyTo + abre ficha).
  Eliminado el buscador local de `ListaAlertas`; queda un solo buscador. Los
  props `seleccionadaCue`/`onSeleccionar` (que sólo servía a esa lista de
  resultados local) se sacaron de su interfaz.
- **Hallazgo 9** (panel flota, salta, filtros se colapsan solos): `.map-left-stack`
  pasó de `bottom: 25px` a `top: 25px` (ancla arriba, crece hacia abajo con
  scroll propio — ya no flota con espacio vacío arriba ni salta al cambiar
  la altura del contenido cargado async). El estado abierto/cerrado de
  "Filtros del mapa" (`<details>`) se subió a `MapInfraestructuraPage`
  (`filtrosAvanzadosAbiertos`, controlado): antes se perdía porque toda la
  lista se desmonta y remonta al cambiar de modo (Situación actual ↔ Radar),
  y un `<details>` no controlado siempre remonta cerrado.
- **Hallazgo 10** (contador contradictorio): investigado, NO era un bug —
  `indicadores.escuelas` (parte-mapa.ts) cuenta partes vigentes aunque la
  escuela no tenga coordenadas geocodificadas; el contador del padrón
  (`totales.escuelasAfectadas`) sólo cuenta las que SÍ tienen ubicación y
  pueden dibujarse en el mapa (por eso hay hasta 4 escuelas del fixture
  "Sin lat/lon" que pueden tener parte vigente sin aparecer en el mapa).
  Son conceptos legítimamente distintos: se aclaró con copy en vez de forzar
  una unificación ("Escuelas con parte vigente" + hint explicando la
  diferencia con el contador del padrón), sin tocar ninguna query de datos.
- **Hallazgo 11** (indicadores sin jerarquía): `Indicadores` pasó de una
  lista plana de `Label: N` a una grilla de 2 columnas (1 en mobile) con el
  número grande y el label chico debajo, clases propias del mapa
  (`.map-indicadores-grid`/`.map-indicador`, NO se reusó `.stat-block` de la
  portada, fuera de alcance).

**Verificación**: `pnpm exec tsc --noEmit` sin errores; `pnpm vitest run
components/mapas components/infraestructura lib/mapas lib/infraestructura
--maxWorkers=2` → 137 archivos / 1360 tests (+3 skipped preexistentes),
verde.

## V6 — Radar (hallazgos 15, 16, 17, 18, 19)

- **Hallazgo 15** (coropleta opaca): `paintCoropletaPeligro()` no tenía
  `fill-opacity` (default de MapLibre: 1, opaco). Agregado `fill-opacity:
  0.55` — se ve el nivel de peligro sin tapar clusters/escuelas debajo.
- **Hallazgo 16** (leyenda no propia de Radar): `InfraLegendPanel` mostraba
  siempre el bloque de "Situación actual" (severidad + badges V1/V2) y
  agregaba `<PeligroLegend>` al final. Ahora, en Radar/Replay
  (`mostrarLeyendaPeligro`), el bloque de situación actual se OCULTA
  completo y sólo queda la leyenda de peligro (+ riesgo de acceso si
  corresponde). Fuera de Radar, sin cambios.
- **Hallazgo 17** (horizontes deshabilitados iguales a los habilitados):
  `SelectorHorizonte` marcaba `aria-disabled` (deliberado, para que sigan
  siendo alcanzables por teclado/lector de pantalla) pero sin señal visual.
  Clase condicional `selector-horizonte__boton--deshabilitado` (opacity
  .45, cursor not-allowed) sin tocar el `aria-disabled`/`title` existentes.
- **Hallazgo 19** (sin buscador en Radar): `<EscuelaSearchBox>` estaba
  dentro del ternario que sólo renderiza la rama "Situación actual". Movido
  fuera, se monta siempre. **Nota de producto pendiente, no resuelta por mi
  cuenta**: en Radar el buscador sigue haciendo flyTo + abrir la ficha; no
  alimenta el panel de riesgo (`RiskExplanationPanel`/`escuelaRadarSeleccionada`).
  Si el usuario quiere que buscar una escuela en Radar muestre su panel de
  riesgo en vez de (o además de) la ficha, es una decisión de producto que
  falta tomar.
- **Hallazgo 18** (círculos de riesgo superpuestos a clusters): confirmado
  y corregido con alcance acotado — las 3 capas de riesgo (halo, punto,
  acceso) ahora se filtran por `cuesNoAgrupados` (mismo criterio que ya usa
  el badge de estado V2): sólo se dibujan sobre escuelas realmente
  desagrupadas, nunca superpuestas a un cluster todavía agrupado.

**Verificación**: `pnpm exec tsc --noEmit` sin errores; `pnpm vitest run
components/mapas lib/mapas --maxWorkers=2` → 15 archivos / 174 tests,
verde.

## V7 — Pestañas y Evolución (hallazgos 14, 23, 24, 25)

- **Hallazgos 14 y 23** (sin estado activo visible, el mismo bug en ambos
  niveles de pestañas): la regla CSS usaba `.ui-tabs-tab[data-selected]`,
  pero `@base-ui/react/tabs` (v1.7.0) marca la pestaña activa con
  `data-active`, no `data-selected` — ese selector nunca matcheaba nada, en
  ninguna pestaña del hub que use este componente. Un solo cambio de
  selector arregla Operativa/Evolución y las 4 subpestañas de Evolución a
  la vez.
- **Hallazgo 14** (no centradas): `.mapa-pestanas-barra` no centraba su
  contenido (`.ui-tabs-list` es `inline-flex`, se pega a la izquierda).
  Agregado `display: flex; justify-content: center` sólo a esa clase (no a
  `.ui-tabs-list` en general, la usan otras pantallas del hub).
- **Hallazgo 23** (salto de contenido entre subpestañas): `min-height` en
  `.evolucion-vista` para reducir el reacomodo al cambiar entre gráfico,
  tabla y mensaje.
- **Hallazgo 24** (gráfico "Servicio caído" desperdicia ~90% del ancho):
  la serie SÍ arranca en el inicio real del período vigente (no es un bug
  de datos), pero puede haber meses en cero antes de la primera afectación.
  Recorte de PRESENTACIÓN (nunca tocado el servidor): nueva función pura
  `recortarSerieAlRangoConDatos()` en evolucion-panel.tsx, recorta al primer
  día con `escuelas > 0` con 3 días de margen de contexto; si todo el
  período está en cero, no recorta nada.
- **Hallazgo 25** (ranking sin apoyo visual): agregada una barra horizontal
  proporcional a `escuelasAfectadas` por fila. El footer NO se agregó:
  investigado y confirmado que su ausencia en el mapa es intencional
  (`isBleedViewerPath` en lib/nav.ts suprime el footer global en toda ruta
  `/mapas/*` para dar pantalla completa al mapa), no un olvido — decisión
  de producto si se quiere cambiar ese comportamiento, no la tomé sola.

**Verificación**: `pnpm exec tsc --noEmit` sin errores; `pnpm vitest run
components/infraestructura lib/infraestructura --maxWorkers=2` → 122
archivos / 1192 tests (+3 skipped preexistentes), verde.

## V8 — Transversal (hallazgos 13, 28 parcial)

- **Controles de MapLibre en español (hallazgo 13)**: sólo hay
  `<NavigationControl>` montado en el mapa de infraestructura (sin
  Geolocate/Scale/Fullscreen de maplibre-gl). `LOCALE_MAPLIBRE_ES` nuevo con
  las claves reales de maplibre-gl 6.3.0 (`NavigationControl.ZoomIn`,
  `.ZoomOut`, `.ResetBearing`, `Popup.Close`, etc.), pasado como prop
  `locale` al `<MapGL>`. No se tocó `map-view.tsx` (mapa de matrícula, fuera
  de alcance).
- **Mapa base oscuro (hallazgo 28)**: OpenFreeMap no tiene un estilo oscuro
  en el catálogo usado (`liberty`/`bright`/`positron`, todos claros) y no se
  agregó un proveedor de tiles nuevo (decisión de infraestructura/costo
  fuera de mi alcance). Fix pragmático: filtro CSS
  (`brightness/invert/contrast/hue-rotate`) sobre el canvas de MapLibre en
  `[data-theme='dark']`. **Corrección importante post-verificación mía**:
  el primer intento acotaba el selector con `.map-root`, pero esa clase la
  comparte `map-view.tsx` (el mapa de MATRÍCULA, `/mapas/matricula`, que
  SÍ está viva — el N3 asumió mal que esa ruta estaba muerta; la verifiqué
  yo y tiene guard de acceso real). Reacotado a
  `.mapa-pestanas-cuerpo .map-root .maplibregl-canvas-container`
  (`.mapa-pestanas-cuerpo` es exclusiva del mapa de infraestructura,
  confirmado por grep). Verificación visual final del filtro en navegador
  pendiente (V9).
- **Contraste del contador en oscuro (hallazgo 28)**: medido, no
  adivinado — `--ink-soft` sobre `--card` en oscuro daba 4.19:1 (bajo AA).
  Override puntual a `var(--ink)` (12.3:1) sólo en `.map-panel`/
  `.map-control-card .map-hint`.
- **"Admin" con foco persistente (hallazgo 28)**: confirmado fuera de
  alcance (header global del hub), no tocado.
- **Responsive (hallazgo 29)**: sin cambios necesarios detectados en el
  breakpoint ≤720px existente; verificación visual completa en V9.

**Verificación**: `pnpm exec tsc --noEmit` sin errores; `pnpm vitest run
components/mapas lib/mapas --maxWorkers=2` → 15 archivos / 174 tests,
verde.

## Verificación final

- `pnpm exec tsc --noEmit`: sin errores.
- `flock $HOME/.cache/enos-n3/heavy.lock pnpm vitest run --maxWorkers=2`
  (suite completa, no sólo el subconjunto del mapa): **223 archivos / 1982
  tests, verde** (+3 skipped preexistentes, no relacionados a este
  trabajo). Sin fallas nuevas respecto de la base.
- `pnpm lint`: sin salida (limpio).
- `pnpm build`: exitoso (Turbopack, 5.3s compilación + 10.9s typecheck +
  generación de páginas estáticas sin errores). El `BetterAuthError` que
  loguea durante la generación es sólo por correr el build sin el `.env` de
  la demo cargado en ese comando puntual — no es una falla, es el mismo
  warning esperado sin `BETTER_AUTH_SECRET` en ese proceso.
- **V9 (verificación visual): NO HECHA, derivada a V10 (decisión de N1,
  2026-09-28).** chrome-devtools-mcp y claude-in-chrome no disponibles en
  este entorno para mí. Intenté el camino alternativo indicado por N1
  (capturas Playwright, Chromium headless propio, contra la demo), en 5
  pasadas de N3 más pruebas directas mías. Bloqueo real encontrado, NO es
  un bug de la app: en este entorno, Playwright/Chromium headless nunca
  adjunta la cookie de sesión a una navegación de página real, bajo NINGÚN
  método probado —
  cookie jar normal, `context.addCookies` (con `domain`+`path` y con `url`,
  con `localhost` y con `127.0.0.1`), contexto persistente
  (`launchPersistentContext`), e inyección manual del header `Cookie` por
  `context.route()` interceptando la request (bypaseando el cookie jar del
  todo) — en TODOS los casos la navegación a `/mapas/infraestructura`
  termina en 307 a `/login`. El MISMO cookie/header, probado con `curl`
  contra el mismo servidor en el mismo momento, da 200 sin falla, de forma
  consistente y repetida. Escalado al coordinador (N1) con esta evidencia;
  decisión: cortar acá, verificación visual completa queda para el QA de
  N1 en V10, con su propio navegador real.

  **Cómo relanzar la demo para el QA (V10)** — la demo queda LEVANTADA y
  estable en http://localhost:3202 al cerrar esta tarea, no hace falta
  relanzarla; si hiciera falta hacerlo de todos modos:
  ```sh
  cd /home/gero/orca/workspaces/data-hub-dashboard/enos-pulido
  set -a && source /home/gero/orca/demo-data/enos-pulido/.env.demo && set +a
  pnpm dev -p 3202
  ```
  Credenciales del admin: en `/home/gero/orca/demo-data/enos-pulido/.env.demo`
  (`ADMIN_EMAIL`/`ADMIN_PASSWORD`, permisos 600, no repetidas acá).
  **Advertencia importante para quien relance el server**: PGlite es de un
  solo proceso — NUNCA correr `sync-ge.mjs` ni `seed-demo-partes.mjs` con la
  app corriendo, y nunca dejar dos instancias de `next dev` apuntando al
  mismo `DATA_DIR` ni un instante (ver el incidente documentado más abajo:
  pasó tres veces durante esta tarea y cada vez requirió reconstruir la
  base). Preferir `kill -TERM` con margen (5s) antes de asumir que el
  proceso terminó, nunca un `kill -9`/SIGKILL abrupto contra PGlite en
  medio de una escritura.

**Incidente (resuelto) durante el armado de las capturas**: al reiniciar el
server de la demo varias veces seguidas para probar cambios (fix del login
Better Auth, prueba con webpack en vez de Turbopack), dos procesos llegaron
a tener el puerto/directorio de datos brevemente solapados. PGlite es de
un solo proceso: el archivo de la base en `DATA_DIR/pg` quedó corrupto
(`RuntimeError: Aborted()` de WASM ante cualquier query, hasta un `select
1`). Diagnosticado por mí con un chequeo directo (Node plano, sin pasar por
Next), confirmado por N1 con la misma causa. Reconstruido siguiendo la
receta de N1: matar server y seed, borrar `DATA_DIR/pg`, levantar la app
SOLA hasta confirmar `/login` 200 y disparar la migración, apagarla,
recién ahí correr `sync-ge.mjs --fixture` + `seed-demo-partes.mjs` con la
app apagada (nunca los dos procesos tocando PGlite a la vez), y volver a
levantar la app al final. Verificado con login real (curl) + acceso a
`/mapas/infraestructura` en 200. **Lección para relanzar la demo en el
futuro**: nunca correr sync-ge/seed-demo-partes con la app corriendo, y
nunca dejar dos instancias de `next dev` apuntando al mismo `DATA_DIR` ni
siquiera brevemente durante un reinicio.

**Segundo incidente (resuelto), misma causa raíz distinta disparador**: un
N3 (sesión de diagnóstico de Playwright) creó una página de depuración
dentro del repo (`app/(hub)/zzdiag/page.tsx`, no trackeada) para inspeccionar
cookies de sesión. Agregar un archivo nuevo bajo `app/` con el server
corriendo dispara la recompilación de Turbopack/Fast Refresh, que tocó el
singleton de PGlite en caliente y volvió a corromper `DATA_DIR/pg` de la
misma forma (`RuntimeError: Aborted()`). Reconstruido con la misma receta
(server apagado durante sync-ge/seed). La carpeta `app/(hub)/zzdiag/` se
borró con un N3 acotado a esa sola tarea, verificado con `git status --short`
(sin rastro). **Regla reforzada, explícita en el brief de ahora en más**:
ningún N3 crea ni edita archivos dentro del repo para diagnosticar nada —
los scripts/páginas de diagnóstico van sólo en `/tmp/claude-1000` o en
`/home/gero/orca/demo-data/enos-pulido/`, nunca en el árbol de la app.

## Hallazgos que no se pudieron resolver (o quedaron como decisión de producto)

- **Hallazgo 19 / Radar**: el buscador de escuela en modo Radar sigue
  haciendo flyTo + abrir la ficha; no alimenta el panel de riesgo
  (`RiskExplanationPanel`). Si conviene que además/en cambio muestre el
  panel de riesgo de la escuela buscada, es una decisión de producto
  pendiente.
- **Hallazgo 25 / footer en Evolución**: investigado — su ausencia es
  intencional (`isBleedViewerPath` da pantalla completa a todo `/mapas/*`),
  no un olvido. Sólo se resuelve si el producto decide sacrificar pantalla
  completa por consistencia con el resto del hub.
- **Filtro CSS del mapa oscuro (hallazgo 28)**: es una aproximación
  (`brightness/invert/contrast/hue-rotate` sobre el canvas), no un estilo
  cartográfico oscuro real — no hay un basemap oscuro disponible en el
  catálogo de OpenFreeMap usado hoy sin agregar un proveedor de tiles nuevo
  (decisión de infraestructura/costo que no tomé). Pendiente de
  verificación visual real (V9); puede necesitar un ajuste fino de los
  valores del filtro una vez visto en pantalla.
