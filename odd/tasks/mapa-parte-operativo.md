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

- [ ] **F3.1** Extraer el armado del body del GET de
      `app/api/problematicas/parte/route.ts:65-161` a función compartida; consumirla desde
      la ruta existente y desde el mapa.
- [ ] **F3.2** Modal de ficha del parte (reemplaza `FichaAlerta`), con `descripcion`.
- [ ] **F3.3** Modal de alcance nominal + Route Handler; repunte de `problematicaId` a
      `afectacionId` en `identidad.ts`, `impacto.ts` y la columna
      `infra_acceso_nominal_log.problematica_id` → `afectacion_id`.
- [ ] **F3.4** Modal de historial + Route Handler bajo la ACL del hub.
- [ ] **F3.5** Bloque "qué cambió" vía `describirMovimiento` sobre `infra_movimiento`.

### Fase 4 — Retirar el modelo deprecado

- [ ] **F4.1** Retirar el tab "Problemáticas" del admin y
      `app/api/infraestructura/problematicas/route.ts`.
- [ ] **F4.2** Repuntar el guard de motivos a `infra_afectacion.motivo`.
- [ ] **F4.3** Borrar `lib/infraestructura/consulta.ts` y sus tests.
- [ ] **F4.4** Borrar código muerto: `contarAlertasActivasPorCue`,
      `calcularImpactoProblematica`, `calcularImpactoConsolidadoCue`.
- [ ] **F4.5** Limpiar `lib/db/seed.ts`: DDL de las tres tablas, `ensureCategoriaColumn`,
      `backfillCategoriaProblematicas`, `ensureParteIdColumn`, `backfillPeriodoYPartes`.
- [ ] **F4.6** Sacar las tablas de `lib/db/schema.ts` + `DROP TABLE IF EXISTS` idempotente.
- [ ] **F4.7** Actualizar `docs/trayectoria-contrato-implementacion.md:65-71`.

### Fase 5 — Pestaña de evolución

- [ ] **F5.1** Tabs sobre `components/ui/tabs.tsx`, patrón de `admin-page.tsx:1841-1856`,
      con hash sync. El mapa se oculta con CSS, no se desmonta.
- [ ] **F5.2** `app/api/mapas/infraestructura/evolucion/route.ts`.
- [ ] **F5.3** Gráficos con Recharts, defaults apagados (sin gradientes ni sombras,
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
