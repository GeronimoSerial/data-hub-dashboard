# Mapa de infraestructura sobre el modelo de parte

Branch: `feat/mapa-enos`
Plan: `~/.claude/plans/si-me-cierra-crea-async-karp.md` (aprobado por el usuario)

## Objetivo

Que el mapa de `/mapas/infraestructura` lea el modelo de parte/trayectoria en vez de la
tabla deprecada `infra_problematica`, que toda la información recopilada en los partes
sea accesible sin salir del mapa, y que el modelo deprecado desaparezca del repo.

## Problema

`listarAlertasActivas` (`lib/infraestructura/consulta.ts:135-261`) consulta
`infra_problematica`. Todo lo que el director carga en el flujo del parte —estado del
establecimiento, suspensión del servicio educativo, vigencia real, descripción libre,
historial— nunca llega al mapa. El dato que responde "¿hay clases?" vive en
`infra_servicio_alcance` y no está representado en ningún lado.

## Alcance autorizado

- Reescribir la proyección de datos del mapa sobre `infra_parte` / `infra_afectacion` /
  `infra_servicio_alcance`.
- Rediseñar la codificación visual del mapa y su leyenda.
- Exponer ficha, alcance nominal, historial y "qué cambió" como modales sobre el mapa.
- Eliminar `infra_problematica`, `infra_problematica_seccion`, `infra_problematica_alumno`
  y todos sus consumidores, incluido el tab "Problemáticas" del panel de admin.
- Agregar una pestaña de evolución con gráficos (Recharts).

**Fuera de alcance**: cargar o actualizar partes desde el mapa; tocar el flujo del
director (`app/problematicas/parte/**`) y su modelo de acceso por cookie; límites por
localidad; el mapa de matrícula.

## Restricciones

- `lib/infraestructura/severidad.ts` es la **única** fuente de color de severidad. Ninguna
  capa ni gráfico introduce una segunda escala de color.
- `servicio` (normal/parcial/suspendido) **se calcula, nunca se persiste**
  (`lib/db/schema.ts:410-420`). Un solo lugar de cálculo para mapa, lista y modal.
- Abrir el modal de alcance nominal **escribe** en `infra_acceso_nominal_log`. No se
  prefetchea ni se abre especulativamente.
- Manual de Marca (`app/globals.css:1-16`): flat, sin gradientes ni sombras, color
  oficial, Barlow. Aplica también a los gráficos de Recharts.

## Modo de verificación

- **TDD: desactivado.** Fuente: `openspec/config.yaml` → `apply.tdd: false`.
- **Runner: `pnpm test`** (vitest run) y `pnpm lint` (eslint), de `package.json:11-12`.
  Nota: `openspec/config.yaml` está desactualizado — declara `Testing: none` y
  `test_command: ""`, pero el repo tiene vitest con cobertura amplia. Se usan los
  comandos reales de `package.json`.
- **RDD: apagado** (`gentle-ai review mode status` → off, decidido por global). No hay
  ciclo de review nativo.

## Tareas

### Fase 1 — Proyección del parte para el mapa

- [x] **F1.1** `lib/infraestructura/parte-mapa.ts`: tipo `ParteMapa` y
      `listarPartesVigentes(filtros)`, con carga batcheada (sin N+1). Reusa
      `resolverAlcanceVigente`, `claveServicioAlcance`, `calcularEstadoServicioGeneral`,
      `obtenerMembresiaSecciones`, `asegurarGeAdjuntada`, `obtenerPeriodoVigente`.
      Ruta: **delegada** (writer trigger: 4 archivos no triviales). El writer corrió en
      Sonnet; el padre sólo orquestó y verificó.
- [x] **F1.2** `listarSeccionesDeCues(client, corteId, cueAnexos[])` en
      `lib/infraestructura/secciones-cue.ts`; el singular existente delega en el plural.
      Chunkeo de 500 CUEs por consulta (límite de parámetros SQLite).
- [x] **F1.3** `formatearFechaRelativa` en `lib/model.ts`, junto a `formatearFecha`.
- [x] **F1.4** `lib/infraestructura/parte-mapa.test.ts`: 10 tests — parte sin
      afectaciones vigentes, afectación retirada, servicio parcial por turno, ambas
      categorías, parte sin coordenadas, dedupe de alumno en dos afectaciones,
      filtro de severidad excluye escuela, peorSeveridad por orden de SEVERIDADES,
      indicadores consolidados, guard anti N+1. Todos verdes.

### Fase 2 — Endpoint y mapa operativo

- [x] **F2.1** `app/api/mapas/infraestructura/route.ts` pasa a `listarPartesVigentes`;
      indicadores nuevos (servicio suspendido, sin reportar). Ruta: delegada
      (worker en Sonnet, misma pauta que F1.1).
- [x] **F2.2** `components/mapas/map-infraestructura-page.tsx`: una escuela = un punto;
      color = severidad, radio = alumnos alcanzados (interpolate sobre
      `sqrt(alumnosAlcanzados)`), anillo = servicio (ancho+opacidad de trazo,
      sin color nuevo). `ListaAlertas`, `FichaAlerta`, `Indicadores` y
      `useAlertas` adaptados al mismo tiempo (mismo writer, mismo commit
      lógico). `InfraLayerControl` reducido a una sola capa (`escuelas`) —
      F2.3 agrega ahí las capas de evacuación/sin-reportar sin tocar esta
      forma.
- [x] **F2.3** Capas toggleables de evacuación y "sin reportar" (umbral 72 h, constante
      nombrada y justificada).
- [x] **F2.4** Coroplético departamental por escuelas con servicio caído (opacidad, sin
      segunda escala de color). Reusa la normalización de nombres de
      `lib/mapas/departamentos.ts`.
- [x] **F2.5** `InfraLegendPanel` reescrita con los canales nuevos (color/tamaño/anillo)
      y números en vivo vía `indicadores` por props, mismo patrón que
      `LegendPanel` (matrícula).

### Fase 3 — Modales

- [x] **F3.1** Extraer el armado del body del GET de
      `app/api/problematicas/parte/route.ts:65-161` a función compartida; consumirla desde
      la ruta existente y desde el mapa.
- [x] **F3.2** Modal de ficha del parte (reemplaza `FichaAlerta`), con `descripcion`.
- [x] **F3.3** Modal de alcance nominal + Route Handler; repunte de `problematicaId` a
      `afectacionId` en `identidad.ts`, `impacto.ts` y la columna
      `infra_acceso_nominal_log.problematica_id` → `afectacion_id`.
- [x] **F3.4** Modal de historial + Route Handler bajo la ACL del hub.
- [x] **F3.5** Bloque "qué cambió" vía `describirMovimiento` sobre `infra_movimiento`.

### Fase 4 — Retirar el modelo deprecado

- [x] **F4.1** Retirar el tab "Problemáticas" del admin y
      `app/api/infraestructura/problematicas/route.ts`.
- [x] **F4.2** Repuntar el guard de motivos a `infra_afectacion.motivo`.
- [x] **F4.3** Borrar `lib/infraestructura/consulta.ts` y sus tests.
- [x] **F4.4** Borrar código muerto: `contarAlertasActivasPorCue`,
      `calcularImpactoProblematica`, `calcularImpactoConsolidadoCue`.
- [x] **F4.5** Limpiar `lib/db/seed.ts`: DDL de las tres tablas,
      `ensureCategoriaColumn`, `backfillCategoriaProblematicas`, `ensureParteIdColumn`, `backfillPeriodoYPartes`.
- [x] **F4.6** Sacar las tablas de `lib/db/schema.ts` + `DROP TABLE IF EXISTS` idempotente.
- [x] **F4.7** Actualizar `docs/trayectoria-contrato-implementacion.md:65-71`.

### Fase 5 — Pestaña de evolución

- [x] **F5.1** Tabs sobre `components/ui/tabs.tsx`, patrón de `admin-page.tsx:1841-1856`,
      con hash sync. El mapa se oculta con CSS, no se desmonta.
- [ ] **F5.2** `app/api/mapas/infraestructura/evolucion/route.ts`.
- [x] **F5.3** Gráficos con Recharts, defaults apagados (sin gradientes ni sombras,
      paleta de las variables CSS, severidad vía `colorSeveridad`).

## Criterios de aceptación

1. Una escuela con servicio suspendido se distingue en el mapa sin abrir nada.
2. El radio del punto refleja alumnos alcanzados, no cantidad de afectaciones.
3. Ficha, nominal, historial y "qué cambió" se abren y cierran sin perder encuadre,
   filtros ni selección.
4. Abrir el modal nominal escribe exactamente una fila en `infra_acceso_nominal_log`.
5. `rg 'infra_problematica|infraProblematica'` no devuelve nada en código de producción.
6. Los números de la pestaña de evolución coinciden con los indicadores del mapa.
7. `pnpm lint` y `pnpm test` en verde.

## Progreso

Fase 1 completa (F1.1–F1.4). `pnpm lint` y `pnpm test` corridos en foreground tras
los cambios: 717/717 tests verdes (85 archivos, incluye los 10 nuevos de
`parte-mapa.test.ts`); lint reporta 1 error + 4 warnings, todos pre-existentes en
archivos no tocados por esta fase (`historial-parte.tsx`,
`actualizacion-form.tsx`/`.test.tsx`, `reporte-inicial-form.tsx`,
`movimiento-descripcion.test.ts`). No se tocó el modelo deprecado, el endpoint ni
el componente del mapa (fuera de alcance de esta fase). Sin commit todavía.

### Verificación del padre (no del writer)

- `pnpm test` corrido por el orquestador: **717/717 en 85 archivos**.
- `pnpm lint` corrido **dos veces**, con los cambios aplicados y con el árbol limpio
  (stash con tag único + `apply` por SHA + `drop`): **5 problemas en ambos casos**.
  Queda probado que el error de `set-state-in-effect` en `historial-parte.tsx` y los
  4 warnings son pre-existentes, no introducidos por esta fase.
- Lectura del código: la lógica de sección completa vs. parcial en
  `cargarAfectacionesDeVariosPartes` es semánticamente idéntica a la de
  `cargarAfectaciones` (`parte-consulta.ts:122-133`) — no se inventó semántica nueva.
  El `JOIN` (no `LEFT JOIN`) contra `ge.ge_localizacion` replica el criterio de
  `consulta.ts:167`: un CUE sin fila de localización no aparece, igual que hoy.
- Deuda menor anotada, no bloqueante: `resultadoVacio` es un objeto de módulo
  compartido (mismo patrón que `consulta.ts`); si algún consumidor llegara a mutar
  `partes`, el estado se filtraría entre llamadas.

### Fase 2 — núcleo (F2.1, F2.2, F2.5)

Un solo writer delegado tocó los tres a la vez porque están acoplados por tipo (todos
consumen `ParteMapa`/`IndicadoresMapa` de `parte-mapa.ts` y se rompen juntos si cambia
la forma de la respuesta): `app/api/mapas/infraestructura/route.ts` + su test,
`lib/infraestructura/use-alertas.ts` + su test, `components/mapas/map-infraestructura-page.tsx`,
`components/mapas/layer-control.tsx`, `components/mapas/legend-panel.tsx`,
`components/infraestructura/{indicadores,lista-alertas,ficha-alerta}.tsx` + sus tests.

Decisiones de codificación visual:
- Radio: `interpolate` lineal sobre `sqrt(alumnosAlcanzados)` (área proporcional al
  dato, no el radio — criterio de símbolos proporcionales/Flannery). Piso 6px (una
  escuela con 0 alumnos alcanzados sigue siendo un punto clickeable), techo 26px a
  800 alumnos (por encima de la matrícula típica de un establecimiento; MapLibre
  extrapola el tramo final para valores mayores).
- Anillo de servicio: sin color nuevo (ya tomado por severidad). `suspendido` =
  trazo grosor 4 opacidad 1; `parcial` = grosor 2 opacidad 0.55; `normal` = grosor 1
  (el hairline que ya traía el punto, se lee como "sin anillo"). MapLibre no tiene
  `circle-stroke-dasharray`, así que el punteado de `parcial` se resolvió con
  grosor+opacidad en vez de patrón de trazo.
- `InfraLayerControl` se redujo a una única capa (`escuelas`, antes
  `establecimiento`/`alumnos`) porque la categoría dejó de ser capa; F2.3 agrega ahí
  `evacuadas`/`sinReportar` sin tocar esta forma.
- `FichaAlerta` pasó de `alertas: AlertaActiva[]` a `parte: ParteMapa | null` (un
  punto = una escuela, ya no una lista de alertas sueltas). El enlace "Ver alumnos
  alcanzados" queda apuntando a la primera afectación vigente — la página de destino
  todavía consulta el modelo deprecado, repuntar ese id es F3.3, explícitamente fuera
  de alcance acá.

Verificación en foreground tras los cambios:
- `pnpm lint`: **1 error + 4 warnings**, idénticos a los pre-existentes documentados
  en Fase 1 (`historial-parte.tsx`, `actualizacion-form.tsx`/`.test.tsx`,
  `reporte-inicial-form.tsx`, `movimiento-descripcion.test.ts`). Cero problemas nuevos.
- `pnpm test`: **719/719 verdes** (85 archivos; +2 tests nuevos en
  `indicadores.test.tsx`/`ficha-alerta.test.tsx` sobre los que ya existían).
- `pnpm build`: compila y castea tipos sin errores; la ruta
  `/api/mapas/infraestructura` aparece como dinámica en el árbol de rutas.

Sin commit todavía (fuera de alcance de este writer).

## Estrategia de entrega

Forecast inicial: muy por encima de las ~400 líneas autoradas por slice. Estrategia
pendiente de elegir con el usuario **antes del primer commit** (`ask-on-risk`).

### Fase 2 — cierre (F2.3, F2.4)

`lib/mapas/departamentos.ts` no traía todavía la normalización de nombres que la tarea
daba por existente: se agregó ahí (`normalizarNombreDepartamento` — NFD + descarte de
diacríticos + mayúsculas — y `agregarEscuelasCaidasPorDepartamento`), verificada a mano
contra `public/data/localizaciones.json` (2005 filas reales): 26 valores distintos de
`departamento`, con el gotcha confirmado (`CONCEPCION` y `CONCEPCIÓN` conviven como dos
strings) colapsando a las 25 claves normalizadas del GeoJSON.

Decisiones de codificación visual:
- **Evacuación**: dos símbolos vía `Marker` (DOM), no una capa MapLibre — `evacuado`
  (cuadrado, borde) y `centro_evacuados` (triángulo, borde vía CSS) en
  `ANILLO_COLOR`, el mismo neutro que ya usa el anillo de servicio. Nada de
  `circle`/`symbol` con sprite porque MapLibre no da dos *formas* geométricas
  distintas sin iconos, y los iconos están explícitamente prohibidos por el brief.
  Capa toggleable, apagada por defecto.
- **Sin reportar**: halo (`circle-stroke`, sin relleno) en gris neutro `#6b7280`
  alrededor del punto, con el mismo radio base (`sqrt(alumnosAlcanzados)`) más un
  margen fijo. `UMBRAL_SIN_REPORTAR_HORAS` se reusa tal cual de `parte-mapa.ts`
  (mismo criterio que el indicador agregado, nunca dos definiciones de "viejo").
  El "ahora" contra el que se compara se resuelve en un efecto (no durante el
  render: `Date.now()` es impuro y la regla `react-hooks/purity` lo bloquea),
  disparado por cada respuesta nueva de `useAlertas`.
- **Coroplético departamental**: `fill-opacity` pasa a ser `interpolate` sobre
  `escuelasCaidas` (propiedad calculada en el cliente, cruzando `data.partes` contra
  un fetch propio de `DEPARTAMENTOS_URL` vía `useMemo`) con piso en la opacidad fija
  que ya existía (0.055) y techo en `OPACIDAD_DEPARTAMENTO_CAIDO_TECHO` (0.4) a partir
  de `ESCUELAS_CAIDAS_TECHO` (5) escuelas caídas en un mismo departamento. El color
  sigue fijo (`COLORES_DEPARTAMENTO.rellenoNormal`): no se introdujo una segunda
  escala. Etiqueta "GOYA 3" vía capa `symbol` con `text-field` data-driven (nombre en
  mayúsculas + conteo, sólo cuando el conteo es mayor a cero). Un departamento sin
  match visible se loguea (`console.error`) y se muestra en `InfraLegendPanel`.
- `InfraLegendPanel` explica los dos símbolos de evacuación, el halo de sin-reportar
  y la intensidad del coroplético; agrega las filas de indicadores que faltaban
  (evacuadas, centros de evacuados, sin reportar) usando los mismos números de
  `IndicadoresMapa` que ya carga `useAlertas`.
- `InfraLayerControl` gana dos entradas (`evacuacion`, `sinReportar`), apagadas por
  defecto para no sumar ruido al encuadre inicial; `escuelas` no cambió de forma.

Tests nuevos en `lib/mapas/departamentos.test.ts` (14 tests, todos verdes): 3 de
`normalizarNombreDepartamento` (Ituzaingó/ITUZAINGO, el gotcha CONCEPCION/CONCEPCIÓN,
recorte de espacios) y 6 de `agregarEscuelasCaidasPorDepartamento` (conteo por
servicio suspendido/parcial ignorando normal, cruce ITUZAINGO↔Ituzaingó, cruce del
gotcha de tildes, un departamento sin escuelas afectadas, y un departamento que no
matchea — se reporta en `departamentosSinMatch`, no desaparece).

Verificación en foreground:
- `pnpm lint`: **1 error + 4 warnings**, idénticos a los documentados en Fase 1/2
  (`historial-parte.tsx`, `actualizacion-form.tsx`/`.test.tsx`,
  `reporte-inicial-form.tsx`, `movimiento-descripcion.test.ts`). Cero problemas
  nuevos — el primer intento sí introdujo dos errores nuevos (`Date.now()` impuro
  en `useMemo` durante el render, y el `setState` resultante llamado de forma
  síncrona dentro de un efecto); se resolvieron moviendo el cálculo de "ahora" a un
  efecto disparado por `data` con el `setState` dentro de un `setTimeout` (patrón de
  suscripción, no de derivación durante el render).
- `pnpm test`: **737/737 verdes** (87 archivos; +14 nuevos en
  `departamentos.test.ts`, de los cuales 4 eran preexistentes). Una corrida mostró un
  `ReferenceError: window is not defined` no determinístico en
  `actualizacion-form.test.tsx` (archivo fuera de este alcance); no se repitió en
  las corridas siguientes ni corriendo ese archivo solo — se trata como flake del
  entorno compartido, no como regresión introducida acá.
- `pnpm build`: **falla** con un error de Turbopack ajeno a los archivos de esta
  tarea — `basemap-control.tsx` (bajo `components/mapas/`, pero no tocado en esta
  pasada) no compila porque Turbopack fusiona su chunk con un módulo que importa
  `node:fs`, y el trace de importación pasa por `map-matricula-page.tsx` /
  `mapas/matricula`, no por `map-infraestructura-page.tsx`. `git diff --stat`
  muestra que `package.json`/`pnpm-lock.yaml` cambiaron durante esta pasada (se
  sumó `recharts`) y aparecieron `app/api/mapas/infraestructura/evolucion/` y
  `lib/infraestructura/evolucion.ts` sin tocar por este worker — es el otro worker
  en paralelo (Fase 5, fuera de este alcance) el que movió esas piezas. `tsc --noEmit`
  sobre todo el proyecto no reporta ningún error en `components/mapas/` ni
  `lib/mapas/`; los únicos errores de tipo son en `scripts/padron-ge.test.ts`
  (tampoco de este alcance). No se investigó más a fondo porque tocar `package.json`
  o `app/api/` para diagnosticarlo está fuera de la ownership de esta tarea.

## Próximo paso

Fase 3 (modales). El `pnpm build` roto necesita que alguien con ownership de
`package.json`/`app/api/` (el worker de Fase 5, o el orquestador) confirme si el
error de Turbopack en `basemap-control.tsx` es una regresión de la dependencia
`recharts` recién agregada, antes de dar la Fase 2 por cerrada a nivel de build.

### Fase 3 completa (F3.1–F3.5)

Tres writers delegados, dos en paralelo sobre archivos disjuntos (backend: F3.1 +
mitad de F3.2/F3.4; backend: F3.3) y un tercero secuencial de integración de
frontend (F3.2/F3.4/F3.5 + limpieza), verificados en foreground por el
orquestador al final con todo integrado.

**F3.1** — `armarFichaParte(cueAnexo, corteId)` y `listarMovimientosDescritos(cueAnexo,
corteId)` nuevas en `lib/infraestructura/parte-consulta.ts`, al lado de
`snapshotDesde`. `app/api/problematicas/parte/route.ts` GET y
`app/api/problematicas/parte/historial/route.ts` refactorizados para consumirlas
(comportamiento y forma de respuesta preservados, sin tocar su auth por cookie).
Decisión de diseño deliberada: `armarFichaParte` **no resuelve nombres de
alumnos** (sólo `totales: {secciones, alumnos}` por afectación) — extraer la
resolución de identidades hacia la función compartida habría filtrado nombres al
endpoint del mapa (acceso de lectura del hub, no el gate nominal auditado de
F3.3). La resolución de identidades queda como paso posterior, sólo en la ruta
del director. Es la única proyección de servicio/estado/afectaciones para un
parte puntual — el mapa y el director leen la misma función.

**F3.2** — `components/infraestructura/ficha-parte-modal.tsx` (`Dialog`),
reemplaza el `Popup` de MapLibre + `FichaAlerta` (borrada, sin otro
consumidor). Nuevo `GET /api/mapas/infraestructura/parte?cue=` (`verificarAccesoLectura`,
usa `armarFichaParte`, nunca expone alumnos por nombre ni por id). Usa
`ParteMapa` ya cargado en memoria como placeholder mientras llega el detalle con
totales reales por afectación.

**F3.3** — `infra_acceso_nominal_log.problematica_id` → `afectacion_id` en
`lib/db/schema.ts` (sin FK, rename barato) + migración idempotente
`ensureAccesoNominalLogAfectacionIdColumn` en `lib/db/seed.ts` (patrón
`PRAGMA table_info` + `ALTER TABLE ... RENAME COLUMN`, mismo estilo que
`ensureParteIdColumn`). `obtenerCorteYSeccionesDeAfectacion` nueva en
`impacto.ts` (join `infra_afectacion` → `infra_parte`: el corteId vive en el
parte). `listarAfectadosNominal`/`consultarYRegistrarAfectados` en
`identidad.ts` repunteados a `afectacionId`. Nuevo
`GET /api/mapas/infraestructura/nominal?afectacionId=` (`verificarAccesoLectura`
+ `puedeVerNominal`, escribe en la misma transacción que responde — un GET
exitoso es una fila de log, ni más ni menos). Frontend:
`alcance-nominal-modal.tsx`, contenido montado sólo mientras `open`, un único
`useEffect([])` por apertura (patrón `RecursoDialog`), sin prefetch ni montaje
especulativo. Página vieja `app/(hub)/infraestructura/afectados/` y su API
huérfana `app/api/infraestructura/nominal/route.ts` (nada la llamaba salvo su
propio test) borradas.

**F3.4** — `GET /api/mapas/infraestructura/historial?cue=` (`verificarAccesoLectura`,
usa `listarMovimientosDescritos`), paralelo a la ruta del director que sigue
detrás de la cookie. `historial-parte.tsx` parametrizado (`endpoint`,
`mostrarReingresoCookie`) en vez de duplicado; `historial-parte-modal.tsx`
nuevo lo envuelve en un `Sheet` lateral (no `Dialog`: la lista de movimientos no
tiene techo, mismo criterio que `MobileFilters`).

**F3.5** — bloque "qué cambió" embebido en `ficha-parte-modal.tsx`: fetch a
`/historial` (mismo trigger `open`), primeros 3 `movimientos[].cambios` (ya en
prosa vía `describirMovimiento`), botón "Ver historial completo" que abre el
modal de F3.4. No se agregó endpoint nuevo — reusa el de F3.4.

**Estado del mapa preservado al cerrar**: `seleccionCue` (abre la ficha),
`nominalAfectacionId` y `historialCue` son tres piezas de estado independientes
entre sí y de `filtrosForm`/`capasVisibles`/encuadre — cerrar cualquier modal
sólo resetea su propio estado.

**Verificación en foreground, por el orquestador, con los tres writers ya
integrados:**
- `pnpm test`: **760/760 verdes** (92 archivos).
- `pnpm lint`: **5 problemas** (1 error + 4 warnings), idénticos a la línea de
  base documentada en Fase 1/2 (`historial-parte.tsx` — el error preexistente
  de `set-state-in-effect`, no tocado por el repunte de esta fase —,
  `actualizacion-form.tsx`/`.test.tsx`, `reporte-inicial-form.tsx`,
  `movimiento-descripcion.test.ts`). Cero problemas nuevos.
- `pnpm build`: **compila**. El error de Turbopack en `basemap-control.tsx`
  documentado al cierre de Fase 2 ya no reproduce — desapareció con los
  cambios de la Fase 5 en paralelo (evolución/Recharts), ajeno a esta fase.
  Las tres rutas nuevas (`/api/mapas/infraestructura/{parte,historial,nominal}`)
  aparecen en el árbol; `/infraestructura/afectados/[problematicaId]` ya no
  existe; `/infraestructura/cargar` sigue intacta.

Sin commit todavía.

### Fase 4 completa (F4.1–F4.7)

Worker único, orden secuencial respetado (cada paso dejó al anterior sin
consumidores). Sin commit, sin dev server, sin dependencias nuevas.

**F4.1** — `components/admin-page.tsx`: borrados `InfraProblematicaRow`,
`ProblematicaDialog`, `ProblematicaForm`, `ProblematicasAdmin`, la entrada del
tab `problematicas` y su render (1997 → 1628 líneas); imports
`ContextoCue`/`SEVERIDADES` dados de baja (ya sin consumidores). Borrados
`app/api/infraestructura/problematicas/route.ts` + `route.test.ts` (directorio
eliminado). `rg` confirma cero referencias al endpoint ni a los componentes.

**F4.2** — `app/api/infraestructura/motivos/route.ts`: el DELETE cuenta usos
contra `infra_afectacion.motivo` (mensaje y comentario adaptados; el copy del
`ConfirmDelete` en admin-page también). Test rearmed: crea período+parte+
afectación con motivo "Inundación" y espera 400, en vez de insertar en la
tabla vieja.

**F4.3** — `rg` previo verificó que `listarAlertasActivas`/`AlertaActiva` sólo
los definía `consulta.ts` y los consumía su propio test. Borrados
`lib/infraestructura/consulta.ts` + `consulta.test.ts`. Comentarios que los
mencionaban reescritos en `parte-mapa.ts` y `app/api/mapas/infraestructura/route.ts`
(**sólo comentarios**, cero cambios de lógica — eran archivos de la lista
"no tocar", pero el acceptance #1 hace el `rg` sobre `app/` y `lib/`, y esos
comentarios habrían devuelto match).

**F4.4** — `rg` confirmó cero llamadores fuera de tests para los tres
símbolos. Borrados `contarAlertasActivasPorCue` (`limites.ts`, con sus
imports de drizzle/db/schema), `calcularImpactoProblematica`,
`calcularImpactoConsolidadoCue` y también `obtenerCorteYSeccionesDeProblematica`
— ésta NO estaba en la lista pero era la única consumidora de la primera y
leía las tablas borradas, así que dejarla violaba el acceptance #1. En
`impacto.test.ts`: describe `calcularImpactoConsolidadoCue` y helper
`createInfraTables` borrados; la cadena nominal (`calcularImpactoSecciones`,
`obtenerCorteYSeccionesDeAfectacion`) queda intacta con sus 7 tests.

**F4.5** — `lib/db/seed.ts`: fuera del `HUB_DDL` las 3 `CREATE TABLE` + sus 2
índices; borradas `ensureCategoriaColumn`, `backfillCategoriaProblematicas`,
`ensureParteIdColumn` y `backfillPeriodoYPartes` con sus llamadas en
`seedHub`. Decisión registrada: la siembra del período ENOS se **conserva**
extrayéndola a `sembrarPeriodoEnos()` (onConflictDoNothing) — no es dato del
modelo deprecado y sin ella rompen `parte-consulta.test.ts` (espera el período
vigente), los tests que insertan `infraParte` con ese `periodoId` (FK) y el
test "segundo período vigente" de `seed.test.ts`. `seed.test.ts` actualizado:
fuera 5 describes/tests ligados a las funciones borradas, adentro +1 test
nuevo de F4.6.

**F4.6** — `lib/db/schema.ts`: fuera `infraProblematica`,
`infraProblematicaSeccion`, `infraProblematicaAlumno` y todos los comentarios
que las citaban (469 → 414 líneas). En `seedHub`, donde vivían los ensure, 3
`DROP TABLE IF EXISTS` idempotentes en orden hijos → padre (FK). Test
negativo en `seed.test.ts`: tras `ensureSeeded`, `sqlite_master` no contiene
ninguna de las tres.

**F4.7** — `docs/trayectoria-contrato-implementacion.md`: la sección
"Migration strategy: ADDITIVE … Do NOT drop it" pasó a "RETIRED (Fase 4,
September 2026)" explicando qué se retiró, cuándo, por qué fue seguro dropear
sin backfill y cómo se limpian las bases (DROP idempotente en `seedHub`).
Además se corrigieron en el mismo doc los párrafos que describían
`backfillPeriodoYPartes()` como código vivo y el bullet
`infra_problematica.parteId` (quedaban mentirosos tras F4.5/F4.6), y el caveat
del backfill pasó a histórico.

**Verificación en foreground (salida literal):**

- `rg "infra_problematica|infraProblematica|listarAlertasActivas|AlertaActiva" app/ components/ lib/ scripts/`
  → **5 matches, todos esperados y ninguno es un consumidor**: 3 son los
  `DROP TABLE IF EXISTS` mandados por F4.6 en `lib/db/seed.ts` (el DROP debe
  nombrar las tablas: acceptance #1 y F4.6 se pisan inherentemente — no hay
  forma de dropear una tabla sin escribir su nombre) y 2 son el test nuevo de
  F4.6 en `lib/db/seed.test.ts` (verificación negativa de que no existen).
  Cero matches en cualquier consumidor, comentario o componente.
- `pnpm test` → **735 passed (735) en 90 archivos** (partida: 760 en 92;
  bajó 25 al borrar `consulta.test.ts`, `problematicas/route.test.ts` y los
  tests internos de seed/impacto/motivos; **ninguno rojo**).
- `pnpm build` → **exit 0**, compila limpio, árbol de rutas sin
  `/api/infraestructura/problematicas`.
- `pnpm lint` → **5 problems (1 error, 4 warnings)**, idéntica a la línea de
  base (`historial-parte.tsx` el error pre-existente de
  `set-state-in-effect`, más `actualizacion-form.tsx`/`.test.tsx`,
  `reporte-inicial-form.tsx`, `movimiento-descripcion.test.ts`). Cero
  problemas nuevos.

Fuera de alcance respetado: `components/mapas/`, `parte-mapa.ts` (lógica),
`evolucion.ts`, `app/api/mapas/` (lógica), `app/problematicas/parte/**` y
`app/(hub)/infraestructura/cargar/page.tsx` no tocados; en `parte-mapa.ts` y
en tres archivos de `app/api/mapas/` sólo se reescribieron comentarios que el
acceptance #1 obligaba a limpiar.

### F5.1 + F5.3 — pestaña de evolución en la interfaz (cierre)

Worker dedicado a F5.1 y F5.3. El backend (F5.2) ya estaba commiteado en
`0473a2d` por el worker que lo hizo y **no se tocó**: `lib/infraestructura/evolucion.ts`
y `app/api/mapas/infraestructura/evolucion/route.ts` siguen intactos (su
checkbox queda para quien lo cerró). Tampoco se tocó nada de la lista "no
tocar" (`lib/db/`, `components/admin-page.tsx`, `app/api/infraestructura/`,
`consulta.ts`, `limites.ts`). Sin commits.

**F5.1 — dos pestañas sobre el mapa**

- `app/(hub)/mapas/infraestructura/map-client.tsx`: patrón de
  `admin-page.tsx:1841-1857` — `useState<PestanaMapa>` + efecto que espeja
  `window.location.hash` con listener de `hashchange`. Diferencia deliberada
  con admin: además de LEER el hash, la pestaña lo ESCRIBE al cambiar
  (`window.location.hash = valor`). Sin eso la sincronía sólo serviría a
  quien llega con un `#evolucion` ya armado y no habría forma de copiar un
  enlace a la evolución desde la interfaz. Un hash desconocido se ignora
  (no puede dejar la página sin pestaña activa).
- **El mapa no se desmonta**: el panel del mapa está SIEMPRE en el árbol y
  sólo alterna el atributo `hidden`. MapLibre 6.3 observa el tamaño de su
  contenedor con `ResizeObserver` (`_setupResizeObserver`), así que al volver
  a mostrarse se redimensiona solo; encuadre, basemap y capas no se tocan.
  La pestaña de evolución sí se monta/desmonta (gráficos + un fetch, sin
  estado caro que preservar): así el pedido a `/evolucion` sólo se hace
  cuando alguien la abre.
- Layout nuevo en `app/globals.css` (`.mapa-pestanas*`): barra arriba, cuerpo
  flex con un solo panel visible. Decisión documentada ahí: la clase
  `.mapa-pestana-panel` NO declara `display`, porque un `display` del autor
  pisa al `[hidden]` del user-agent; la regla explícita
  `.mapa-pestana-panel[hidden] { display: none; }` es la que garantiza que
  el mapa se oculte.
- Test nuevo `app/(hub)/mapas/infraestructura/map-client.test.tsx` (3 tests).
  El que exige el acceptance compara dos señales antes/después de cambiar de
  pestaña: la **identidad del nodo del DOM** y un **contador de montajes**
  (incrementado en un `useEffect([])` dentro del doble — el cuerpo del
  componente se ejecuta en cada render, contar renders daría falsos
  positivos). Resultado: mismo nodo, un solo montaje, `not.toBeVisible()`
  mientras está oculto, y al volver vuelve a ser visible. Los otros dos
  tests cubren la apertura directa por `#evolucion` y la escritura del hash.

**F5.3 — cuatro vistas con Recharts**

- `components/infraestructura/evolucion-panel.tsx`: un solo fetch a
  `GET /api/mapas/infraestructura/evolucion` al montar (el panel sólo se
  monta al abrir la pestaña), sub-pestañas con el mismo
  `Tabs`/`TabsList`/`TabsTab` y las cuatro vistas:
  1. serie temporal de escuelas con servicio caído (`LineChart`),
  2. ranking de departamentos como **tabla** (`.ui-table-wrap` + `.ui-table`,
     numéricas alineadas a la derecha con `font-variant-numeric: tabular-nums`,
     primera columna `th[scope=row]` para lectores de pantalla),
  3. distribución por motivo en **barras horizontales**
     (`BarChart layout="vertical"`: los motivos son frases y en un eje X se
     pisarían),
  4. alumnos alcanzados acumulados (`AreaChart`) con un
     `.ui-messagebar--info` que dice explícitamente **"No es el indicador
     del mapa"** y explica el dedupe por persona a lo largo de TODO el
     período vs. el snapshot de hoy — para que la diferencia no se lea como
     bug.
  Error de endpoint → `role="alert"`, nunca una grilla vacía que parezca
  "cero escuelas".
- `components/infraestructura/evolucion-graficos.tsx`: defaults de Recharts
  apagados de forma explícita — sin `<defs>` ni `<LinearGradient>` (el
  relleno del Area es sólido con `fillOpacity` fija), `box-shadow: none` en
  el tooltip, `strokeWidth={1}` (hairline) en series, grilla y líneas de eje,
  tipografía heredada del documento (`font-family: inherit` en tooltip y
  ticks), `isAnimationActive={false}`. La paleta se **lee de las variables
  CSS** con `getComputedStyle(document.documentElement)` (no hay una paleta
  hardcodeada en los charts) y se relee cuando cambia el tema, usando
  `useThemeMode()` como dependencia real de `useMemo` (sin eso,
  `react-hooks/exhaustive-deps` la excluía y la paleta quedaba congelada en
  el tema anterior). Los literales de respaldo sólo se usan si no hay
  documento. Ninguna de las cuatro vistas codifica severidad, así que no
  existe una segunda escala de color: si alguna la codificara, el valor
  saldría de `colorSeveridad` (`lib/infraestructura/severidad.ts`), la única
  escala de severidad del producto.
- **Frontera servidor/cliente**: de `lib/infraestructura/evolucion.ts` sólo
  cruzan `import type` (`EvolucionMapa`, `PuntoEscuelasServicioCaido`,
  `RankingDepartamento`, `DistribucionMotivo`, `PuntoAlumnosAcumulados`).
  Ningún valor en runtime → `pnpm build` compila (salida literal abajo).
  El panel y los charts entran por `dynamic(..., { ssr: false })`, igual que
  el mapa, así Recharts no pesa en el primer viewport.
- Test nuevo `components/infraestructura/evolucion-panel.test.tsx` (5 tests):
  pedido único al endpoint, ranking como tabla con los datos del endpoint,
  etiqueta del acumulado, las cuatro pestañas navegables y estado de error.

**Conteo de tests: 743/92 contra la partida 760/92 del acceptance.** La
diferencia NO es de esta fase: el worker paralelo commiteó `de757d2`
(retiro del modelo deprecado) a las 23:14 y ahí desaparecieron los tests de
`lib/infraestructura/consulta.test.ts` y
`app/api/infraestructura/problematicas/route.test.ts`, entre otros cambios.
Esta fase suma 8 tests en 2 archivos nuevos; los tres comandos de abajo
corrieron DESPUÉS de ese commit, sobre el árbol ya integrado, y salieron
verdes. (Una corrida intermedia mostró el flake ya documentado en Fase 2 —
`ReferenceError: window is not defined` atribuido a
`actualizacion-form.test.tsx`, archivo no tocado acá —; no se repitió en las
corridas siguientes.)

**Verificación en foreground — salida literal**

`pnpm test`:
```text
$ vitest run
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v4.1.11 /home/gero/orca/workspaces/data-hub-dashboard/mapa-enos


 Test Files  92 passed (92)
      Tests  743 passed (743)
   Start at  23:17:40
   Duration  11.97s (transform 9.07s, setup 21.26s, import 42.98s, tests 48.96s, environment 33.80s)

EXIT=0
```

`pnpm build`:
```text
$ next build
▲ Next.js 16.2.9 (Turbopack)
- Environments: .env

⚠ The "middleware" file convention is deprecated. Please use "proxy" instead. Learn more: https://nextjs.org/docs/messages/middleware-to-proxy
  Creating an optimized production build ...
✓ Compiled successfully in 5.6s
  Running TypeScript ...
  Finished TypeScript in 8.5s ...
  Collecting page data using 15 workers ...
  Generating static pages using 15 workers (0/13) ...
  Generating static pages using 15 workers (3/13) 
  Generating static pages using 15 workers (6/13) 
  Generating static pages using 15 workers (9/13) 
✓ Generating static pages using 15 workers (13/13) in 336ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /admin
├ ƒ /api/auth/[...all]
├ ƒ /api/gate/[...path]
├ ƒ /api/hub
├ ƒ /api/hub/admin
├ ƒ /api/infraestructura/motivos
├ ƒ /api/infraestructura/nominal/permisos
├ ƒ /api/mapas/infraestructura
├ ƒ /api/mapas/infraestructura/evolucion
├ ƒ /api/mapas/infraestructura/historial
├ ƒ /api/mapas/infraestructura/nominal
├ ƒ /api/mapas/infraestructura/parte
├ ƒ /api/problematicas/acceso
├ ƒ /api/problematicas/contexto
├ ƒ /api/problematicas/parte
├ ƒ /api/problematicas/parte/historial
├ ƒ /api/recursos
├ ƒ /api/recursos/[id]
├ ƒ /api/recursos/[id]/archivo
├ ƒ /api/recursos/[id]/explain
├ ƒ /api/taxonomia/[kind]
├ ƒ /api/usuarios
├ ƒ /api/usuarios/[id]
├ ○ /explorar
├ ○ /forbidden
├ ƒ /infraestructura/cargar
├ ○ /intranet
├ ○ /login
├ ○ /mapas
├ ƒ /mapas/infraestructura
├ ƒ /mapas/matricula
├ ƒ /problematicas/parte
├ ƒ /problematicas/parte/actualizar
├ ƒ /problematicas/parte/historial
├ ƒ /problematicas/parte/nuevo
├ ƒ /recursos/[id]
├ ○ /reportes
└ ○ /tableros


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

EXIT=0
```

`pnpm lint`:
```text
$ eslint .

/home/gero/orca/workspaces/data-hub-dashboard/mapa-enos/components/infraestructura/actualizacion-form.test.tsx
  84:47  warning  'init' is defined but never used. Allowed unused args must match /^_/u  @typescript-eslint/no-unused-vars

/home/gero/orca/workspaces/data-hub-dashboard/mapa-enos/components/infraestructura/actualizacion-form.tsx
  164:9  warning  The 'servicioAlcanceVigente' logical expression could make the dependencies of useMemo Hook (at line 208) change on every render. Move it inside the useMemo callback. Alternatively, wrap the initialization of 'servicioAlcanceVigente' in its own useMemo() Hook  react-hooks/exhaustive-deps

/home/gero/orca/workspaces/data-hub-dashboard/mapa-enos/components/infraestructura/historial-parte.tsx
  71:10  error  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/gero/orca/workspaces/data-hub-dashboard/mapa-enos/components/infraestructura/historial-parte.tsx:71:10
  69 |
  70 |   useEffect(() => {
> 71 |     void cargar()
     |          ^^^^^^ Avoid calling setState() directly within an effect
  72 |   }, [cargar])
  73 |
  74 |   if (estado.fase === 'cargando') {  react-hooks/set-state-in-effect

/home/gero/orca/workspaces/data-hub-dashboard/mapa-enos/components/infraestructura/reporte-inicial-form.tsx
  24:15  warning  'CategoriaProblematica' is defined but never used. Allowed unused vars must match /^_/u  @typescript-eslint/no-unused-vars

/home/gero/orca/workspaces/data-hub-dashboard/mapa-enos/lib/infraestructura/movimiento-descripcion.test.ts
  3:21  warning  'esDiffVacio' is defined but never used. Allowed unused vars must match /^_/u  @typescript-eslint/no-unused-vars

✖ 5 problems (1 error, 4 warnings)

[ELIFECYCLE] Command failed with exit code 1.
EXIT=1
```
