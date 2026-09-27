# M1 — Padrón completo, totales por departamento y buscador (mapa de infraestructura)

Worktree: `/home/gero/orca/workspaces/data-hub-dashboard/enos-m1` (rama `feat/enos-m1`, base `5216011`).
Rol: N2 (líder de batch). Implementación 100% vía N3 (`opencode run --auto -m opencode-go/deepseek-v4.1-flash`, `OPENCODE_CONFIG=$HOME/.config/opencode/n3-sin-mcp.json`, de a uno). **No se usó la herramienta Agent en ningún momento de este batch** (instrucción explícita de N1 tras el límite de gasto de Anthropic).

## Baseline (antes de tocar código, commit 5216011)

| Chequeo | Comando | Resultado |
|---|---|---|
| Lint | `pnpm lint` | ✅ exit 0 |
| Typecheck | `pnpm exec tsc --noEmit` | ✅ exit 0 |
| Tests | `pnpm vitest run --maxWorkers=2` | ✅ 191 archivos / 1601 tests, 87.5s |
| Build | `pnpm build` | ✅ exit 0 |

## Diagnóstico y superficie de código relevada (N2, lectura directa, sin delegar)

- `lib/infraestructura/parte-mapa.ts`: `listarPartesVigentes` hace `infra_parte JOIN ge.ge_localizacion`; una escuela sin parte con afectación vigente NUNCA aparece. Este es el bug de fondo que exige el requisito no negociable.
- `ge_localizacion` (lib/infraestructura/ge-db.ts:40-49): `cue_anexo, cui, nombre, departamento, localidad, lat, lon, geo_calidad`. Padrón completo ya vive acá (~2001 filas), autosembrado desde `public/data/localizaciones.json`.
- `lib/mapas/normalizar-departamento.ts` YA EXISTE (no hace falta crearlo): NFD + mayúsculas + colapso de espacios.
- `lib/mapas/departamentos.ts` ya tiene un coroplético de "escuelas caídas" por departamento (conteo de afectación, no de padrón) montado en `map-infraestructura-page.tsx` (capas `infra-departamentos-*`), con click-to-select (`departamentoSeleccionado`) pero SIN hover-tooltip ni los tres datos (total/afectadas/%).
- `components/mapas/search-box.tsx` existe pero es genérico para `map-matricula-page.tsx` (busca sobre `MapData.establishments`, no sobre el padrón completo ni con el ranking de `main`). No está montado en `map-infraestructura-page.tsx`.
- `map-natalidad-page.tsx` / `escuela-search-box.tsx` / `lib/mapas/natalidad.ts` (buscarEscuelas, normalizarTextoBusqueda) sólo existen en `main`, no en esta rama: se traen con `git show main:<ruta>`.
- ACL de agregados: reusar `verificarAccesoLectura` de `lib/infraestructura/acceso-lectura.ts` (mismo patrón que `app/api/mapas/infraestructura/route.ts`).
- No se necesitan tablas nuevas: el padrón y los agregados se derivan de `ge_localizacion` + `infra_parte`/`infra_afectacion` ya existentes. `lib/db/schema.ts`, `lib/db/seed.ts`, `package.json` no se tocan en este batch.
- Flag: no hay flag nuevo para esta UI (el padrón/buscador/hover son mejoras del mapa base, siempre activas); se documenta explícitamente que HAZARD_CONTEXT_ENABLED/RISK_ENGINE_ENABLED siguen gobernando únicamente Radar/Riesgo, sin relación con M1.
- Archivo inesperado `.atl/` (untracked) presente desde el inicio del worktree: NO se tocó, se deja para reporte a N1.

## Decisiones locales de N2

1. Función nueva `listarEscuelasMapa()` en `lib/infraestructura/parte-mapa.ts` (no se modifica `listarPartesVigentes`, que sigue sirviendo a otros consumidores) que devuelve TODAS las escuelas de `ge_localizacion` con su estado (`afectada` | `sin_afectacion_reportada`), reusando la resolución de vigencia existente. Escuelas sin lat/lon se listan aparte, nunca se descartan.
2. Agregados por departamento/provincia en función de servidor propia (`obtenerTotalesMapa()`), mismo criterio de "afectada" que el KPI de E5 (afectación confirmada vigente, sin expuestos/condicionados).
3. Endpoint nuevo `app/api/mapas/infraestructura/totales/route.ts` (agregados, sin datos nominales) reusando `verificarAccesoLectura`.
4. Buscador: `lib/mapas/buscar-escuelas.ts` + `components/mapas/escuela-search-box.tsx`, extraídos/generalizados desde `main`, parametrizados por campo de búsqueda; el padrón completo (vía el mismo `listarEscuelasMapa`) alimenta el índice, no sólo lo que ya está pintado.
5. `map-infraestructura-page.tsx` se toca lo mínimo: se monta el hook/los componentes nuevos (hover de departamento, search box, ring de resaltado, aria) sin reescribir lo existente. Mínimo diff también pensando en E7c (Replay), que toca el mismo archivo en paralelo.

## Despachos N3

Todos vía `OPENCODE_CONFIG=$HOME/.config/opencode/n3-sin-mcp.json opencode run --auto -m opencode-go/deepseek-v4.1-flash`, en primer plano, de a uno. Ninguno commiteó (N1 commitea).

1. **N3-A** — `lib/infraestructura/parte-mapa.ts` (append, `listarPartesVigentes` intacta) + `lib/infraestructura/parte-mapa.test.ts`. Agregó `listarEscuelasMapa()`: padrón completo de `ge_localizacion` (LEFT-join en memoria contra `listarPartesVigentes`), filtro de territorio aplicado al padrón completo con el mismo plegado de acentos que `filtrosParteSql`, escuelas sin lat/lon separadas en `sinUbicacion`, 2 queries constantes (sin N+1). Verificación N2: `git diff` confirmó que sólo se agregó código al final del archivo (funciones existentes byte-a-byte iguales); `pnpm vitest run lib/infraestructura/parte-mapa.test.ts --maxWorkers=2` → 17/17 ✅.
2. **N3-B** — `lib/infraestructura/totales-mapa.ts` + test (nuevos). `obtenerTotalesMapa()`: agrupa por `normalizarNombreDepartamento`, denominador = padrón completo (escuelas + sinUbicacion), % con fórmula sobre totales sumados (no promedio de %), redondeo a 1 decimal, sin división por cero. Verificación N2: lectura completa del archivo + `pnpm vitest run lib/infraestructura/totales-mapa.test.ts --maxWorkers=2` → 8/8 ✅.
3. **N3-C** — `app/api/mapas/infraestructura/totales/route.ts` + test (nuevos). Mismo patrón de ACL (`verificarAccesoLectura`) y parseo de filtros que `app/api/mapas/infraestructura/route.ts`; test de integración con `DATA_DIR` temporal real (mismo patrón que el route.test.ts hermano). Verificación N2: lectura del handler completo + `pnpm vitest run app/api/mapas/infraestructura/totales/route.test.ts --maxWorkers=2` → 5/5 ✅.
4. **N3-D** — `lib/mapas/buscar-escuelas.ts` + test (nuevos). Extracción y generalización de `buscarEscuelas`/`normalizarTextoBusqueda` de `main:lib/mapas/natalidad.ts`: mismo algoritmo de ranking (CUE exacto → prefijo → palabra exacta → prefijo de palabra → substring), generalizado a un `EscuelaBuscable` plano (nombre/CUE/localidad/departamento) en vez de GeoJSON Feature, con `departamento` agregado al rango substring (requisito de producto). Reusa `normalizarNombreDepartamento` YA EXISTENTE en esta rama (no la de `main`). Verificación N2: lectura completa + `pnpm vitest run lib/mapas/buscar-escuelas.test.ts --maxWorkers=2` → 8/8 ✅.
5. **N3-E** — `components/mapas/escuela-search-box.tsx` + test (nuevos) + bloque `// M1: ...` al final de `app/globals.css` (69 líneas, clases renombradas de `natalidad-buscador*` a `mapa-buscador-escuela*`, mismos tokens de tema). Combobox de Base UI extraído de `main:components/mapas/escuela-search-box.tsx`, generalizado a `EscuelaBuscable`, con meta ampliada a cue · localidad · departamento. Verificación N2: `git diff --stat app/globals.css` confirmó append puro (69 inserciones, 0 líneas tocadas); grep de los tokens de tema usados (todos preexistentes, excepto `--anchor-width`/`--available-width` que son propiedades de posicionamiento inyectadas por Base UI, no tokens propios — esperado, igual que en `main`); `pnpm vitest run components/mapas/escuela-search-box.test.tsx --maxWorkers=2` → 5/5 ✅.

6. **N3-F** — `app/api/mapas/infraestructura/escuelas/route.ts` + test (nuevos). Mismo patrón ACL/parseo que los hermanos, expone `listarEscuelasMapa`. Verificación N2: lectura completa + `pnpm vitest run app/api/mapas/infraestructura/escuelas/route.test.ts --maxWorkers=2` → 4/4 ✅ (incluye el test central de aceptación: 0 partes cargados → todas las escuelas del padrón sembrado, todas `sin_afectacion_reportada`).
7. **N3-G** — `lib/infraestructura/use-escuelas-mapa.ts` + `lib/infraestructura/use-totales-mapa.ts` (nuevos), y `lib/infraestructura/query-string-filtros-mapa.ts` (nuevo, compartido) + `lib/infraestructura/use-alertas.ts` (único cambio: reemplaza su `construirQueryString` privado por el import del módulo compartido, sin tocar el resto). Verificación N2: `git diff` de `use-alertas.ts` confirmó que sólo se movió esa función (comportamiento idéntico); **checkpoint de regresión completo**: `pnpm exec tsc --noEmit` → 0 errores; `pnpm vitest run --maxWorkers=2` → 196 archivos / 1637 tests (subió de 191/1601 con exactamente los tests nuevos agregados, sin roturas) ✅.

8. **N3-H** — `lib/mapas/construir-escuelas-mapa-feature-collection.ts` + test (nuevos). Construye el `FeatureCollection` del padrón completo con properties COMPATIBLES con `circlePaintPartes()` existente (mismos nombres de campo); color `#8a8886` para `sin_afectacion_reportada` — mismo gris "sin dato" que ya usa `peligro-capas.ts` (`COLOR_NIVEL_PELIGRO.sin_dato`), nunca verde ni color de alerta. Verificación N2: lectura completa + `pnpm vitest run lib/mapas/construir-escuelas-mapa-feature-collection.test.ts --maxWorkers=2` → 4/4 ✅. N2 corrigió un error de tipo mecánico en el fixture del test (`estadoEstablecimiento: 'normal'` no es un valor válido de `EstadoEstablecimiento`; corregido a `'habitual'`) detectado recién en el checkpoint de `tsc` de la ola siguiente — no ameritó un dispatch aparte.
9. **N3-I** — cambios quirúrgicos en `components/mapas/map-infraestructura-page.tsx` (+46/-7 líneas) y 1 línea en `app/(hub)/mapas/infraestructura/map-client.tsx`, más `lib/infraestructura/filtrar-departamento-escuelas-mapa.ts` (nuevo). Reemplaza la fuente de la capa de puntos (`data={featureCollectionPadron}` en vez de `featureCollection`, que sólo tenía afectadas) por el padrón completo vía `useEscuelasMapa`; agrega guard en `handleClick` para no abrir la ficha de una escuela sin parte; agrega `visible` prop + efecto `map.stop()`/`.resize()` (mismo patrón que `main:map-natalidad-page.tsx`); pasa `visible={mapaVisible}` desde el cliente de la pestaña. Ajustó `map-infraestructura-page.test.tsx` agregando el mock de `useEscuelasMapa` que faltaba (no debilitó ninguna aserción existente). Verificación N2: lectura línea por línea del diff completo (confirmó que `construirFeatureCollection`/su test en `.paint.test.ts` se conservaron intactos, sólo se retiró la constante local ya no usada); `pnpm vitest run components/mapas/map-infraestructura-page.test.tsx components/mapas/map-infraestructura-page.paint.test.ts 'app/(hub)/mapas/infraestructura/map-client.test.tsx' --maxWorkers=2` → 30/30 ✅; **checkpoint de regresión completo**: `pnpm exec tsc --noEmit` → 0 errores; `pnpm vitest run --maxWorkers=2` → 196/197 archivos, 1639/1641 tests, 1 archivo con 2 fallos aislados en `components/infraestructura/actualizacion-form.test.tsx` (no tocado por este batch) que **pasa 23/23 al correrlo solo** — flake bajo presión de memoria del run completo, no una regresión de M1; se revisa de nuevo en la verificación final.

10. **N3-J** — cambios aditivos en `components/mapas/map-infraestructura-page.tsx` (+144/-8): monta `EscuelaSearchBox` (SIEMPRE visible, primero en el panel izquierdo, alimentado por el padrón SIN filtrar por departamento), hover de departamento (`onMouseMove`/`onMouseLeave` sobre `CAPA_DEPARTAMENTOS_RELLENO_ID`/etiqueta → `<Popup>` con los tres datos vía `useTotalesMapa`), anillo de resaltado de la escuela buscada (`Source`/`Layer` hermano, mismo patrón que `main:map-natalidad-page.tsx`), y `handleSeleccionarEscuelaBuscada` (flyTo + resaltado + abre ficha sólo si hay parte). Verificación N2: lectura línea por línea del diff completo; `pnpm vitest run components/mapas/map-infraestructura-page.test.tsx components/mapas/map-infraestructura-page.paint.test.ts --maxWorkers=2` → 27/27 ✅.
11. **N3-K** (test-only) — agrega al mismo test file el doble de `react-map-gl/maplibre` extendido (`forwardRef` + `getMap().flyTo` capturado en `FLY_TO_MOCK` vía `vi.hoisted`, botones de prueba para simular hover/mouse-leave) y 2 tests de aceptación: hover de departamento muestra los tres datos y desaparece al salir; buscar y seleccionar una escuela sin afectación hace `flyTo` al punto exacto y NO abre la ficha. No tocó código de producción. Verificación N2: lectura completa del diff (confirmó que sólo agregó, no debilitó nada existente) + `pnpm vitest run components/mapas/map-infraestructura-page.test.tsx --maxWorkers=2` → 16/16 ✅. **Checkpoint de regresión completo**: `pnpm exec tsc --noEmit` → 0 errores; `pnpm vitest run --maxWorkers=2` → 197 archivos / 1643 tests ✅ (el flake de `actualizacion-form.test.tsx` de la ola anterior no reapareció); `pnpm lint` → 1 warning mecánico (`consistent-type-imports` en `escuela-search-box.tsx`), corregido inline por N2 (import de tipo, no ameritaba un dispatch aparte) → 0 problemas.

12. **N3-L** — `components/mapas/layer-control.tsx` (aria `role="group"`/`aria-labelledby` en `InfraLayerControl`/`RadarLayerControl`; label `escuelas` actualizado a "Escuelas (padrón completo)" — ya no dice "con afectación vigente" porque ahora es el padrón completo) y `components/mapas/legend-panel.tsx` (swatch nuevo "Sin afectación reportada" con `COLOR_SIN_AFECTACION`, importado desde el módulo que ya lo define, sin repetir el literal). Verificación N2: `git diff` de ambos archivos confirmó cambios mínimos y correctos; el cambio de label rompió una aserción existente (`getByRole('checkbox', { name: /escuelas con afectación vigente/i })` en el test de modo Radar) — N2 la corrigió inline (1 línea, ajuste mecánico del texto esperado al nuevo label, no ameritó dispatch aparte) → `pnpm vitest run components/mapas/map-infraestructura-page.test.tsx --maxWorkers=2` → 16/16 ✅.
13. **N3-M** — gate de seguridad en `scripts/seed-demo-partes.mjs` (script YA EXISTENTE que cumple exactamente el rol de "demo-partes.mjs" pedido: siembra partes/afectaciones ficticios en `hub.sqlite`/`ge.sqlite`, idempotente, `--limpiar` para deshacer). **Decisión local de N2**: en vez de crear un `scripts/demo-partes.mjs` duplicado, se reforzó este script existente — exige `DEMO_OK=1` y `DATA_DIR` seteado explícitamente (el default `.data` del cwd no cuenta), corta ANTES de importar cualquier módulo de DB, imprime el motivo por stderr y sale con código 1 si falta cualquiera de las dos condiciones. Documentado en el comentario de cabecera del script. Verificación N2: `env -u DEMO_OK -u DATA_DIR node scripts/seed-demo-partes.mjs` → exit 1, mensaje claro, ninguna base tocada ✅.

## Pruebas reales fechadas

**2026-09-27** — Medición de tiempo de carga del padrón completo, contra el padrón real (`public/data/localizaciones.json`, autosembrado por `ensureSeeded()`), en un `DATA_DIR` temporal limpio (sin datos de demo, sin partes cargados). Script ad hoc (no versionado, sólo para esta medición puntual), ejecutado en primer plano:

```
DATA_DIR=<tmp> NOMINAL_ENCRYPTION_KEY=<clave temporal> node <script que llama a ensureSeeded(), listarEscuelasMapa() y obtenerTotalesMapa(), cronometrando cada paso>
```

Resultado real:
```json
{
  "seedMs": 133,
  "listarEscuelasMapaMs": 13,
  "obtenerTotalesMapaMs": 19,
  "totalPadron": 2005,
  "escuelasConCoordenadas": 2001,
  "sinUbicacion": 4,
  "departamentos": 25,
  "provincia": { "totalEscuelas": 2005, "escuelasAfectadas": 0, "porcentajeAfectadas": 0 }
}
```
Padrón real: 2005 escuelas (2001 con coordenadas, 4 sin ubicación — nunca descartadas, contadas en `sinUbicacion`), 25 departamentos. Con 0 partes cargados, `provincia.escuelasAfectadas` = 0 y el padrón completo sigue disponible (confirma en datos reales el mismo comportamiento que ya cubren los tests automatizados). Tiempos de servidor (sin red/HTTP) despreciables: 13 ms y 19 ms respectivamente sobre el padrón completo — el costo real de carga en el navegador va a estar dominado por el round-trip HTTP y el render de ~2000 puntos en MapLibre (clusterizados), no por estas consultas.

## UX

- Estados cubiertos: padrón completo siempre visible (afectada = color de severidad existente; sin afectación reportada = gris `#8a8886`, mismo "sin dato" que ya usa el modo Radar — nunca verde, nunca color de alerta); hover de departamento con los tres datos (total/afectadas/%); buscador siempre visible con ranking y resaltado; click en escuela sin afectación no abre una ficha vacía (no hace nada, deliberado); leyenda actualizada con el nuevo estado.
- **Pendiente**: walkthrough guiado con 1–2 operadores reales de escuela/supervisión no se pudo realizar dentro de este batch (no hay operadores disponibles en este momento de la ejecución). Recorrido guiado reproducible para cuando haya disponibilidad: (1) abrir `/mapas/infraestructura`, confirmar que se ven TODAS las escuelas del departamento propio aunque no haya partes cargados; (2) pasar el mouse sobre el propio departamento y leer los tres números; (3) buscar el nombre de la propia escuela con 2+ letras, confirmar que aparece aunque no tenga afectación, seleccionarla y confirmar que el mapa vuela y la resalta; (4) si la escuela tiene un parte cargado, confirmar que el click abre la ficha; si no, confirmar que no pasa nada raro (no un modal vacío ni un error). Marcado como pendiente, no bloqueante para el resto del batch (estándar permanente §7, gate de UX lo completa N1).

## Verificaciones finales

| Chequeo | Comando | Resultado |
|---|---|---|
| Lint | `pnpm lint` | ✅ exit 0 |
| Typecheck | `pnpm exec tsc --noEmit` | ✅ exit 0 |
| Tests | `pnpm vitest run --maxWorkers=2` | ✅ 197 archivos / 1643 tests |
| Build | `pnpm build` | ✅ exit 0 |

Archivo inesperado `.atl/` (untracked, presente desde el inicio del worktree): **no se tocó**, se reporta a N1 sin modificar.

Sin cambios en `lib/db/schema.ts`, `lib/db/seed.ts`, `package.json` ni el lockfile (ninguna tabla ni dependencia nueva). `git status` al cierre: sólo los archivos de este batch + `.atl/` sin tocar.

Aceptación (checklist del batch):
- [x] Tests de agregados: conteos por departamento/provincia, % con denominador = padrón, sin coordenadas contadas, sin doble conteo (`totales-mapa.test.ts`).
- [x] Mapa con 0 partes sigue mostrando todas las escuelas (`app/api/mapas/infraestructura/escuelas/route.test.ts`, `parte-mapa.test.ts`, prueba real fechada contra el padrón real).
- [x] Buscador: ranking, mínimo 2 caracteres, teclado (Combobox de Base UI), selección → flyTo/resaltado (`buscar-escuelas.test.ts`, `escuela-search-box.test.tsx`, test de integración en la página).
- [x] Hover de departamento con los tres datos (test de integración en la página).
- [x] Flag-off del Radar/Replay sin cambios (tests de "modo Radar" preexistentes, sin modificar, siguen en verde).
- [x] Tiempo de carga del padrón completo medido contra datos reales (ver "Pruebas reales fechadas").

## Correcciones del gate N1

Dos hallazgos MAYORES confirmados por la revisión independiente de M1, corregidos por un N2 (sonnet) delegando a N3 (`opencode-go/deepseek-v4.1-flash`, uno a la vez, en primer plano), sin usar la herramienta Agent. Sin commits: queda para que N1 commitee y mergee.

1. **Color de clusters cae por defecto a "Baja" en vez de gris "Sin afectación".**
   - Causa: `colorPorSeveridadRango()` (`components/mapas/map-infraestructura-page.tsx`) es una expresión `case` sobre `severidadRango`, cuyo `default` era el color de severidad "Baja". Las escuelas `sin_afectacion_reportada` tienen `severidadRango = 0` (el mismo valor que "Baja"), así que un cluster que agrupa sólo escuelas sin afectación caía en ese `default` y se pintaba celeste (color de severidad real) en vez del gris neutro `COLOR_SIN_AFECTACION`.
   - Fix: se agregó `escuelasAfectadas` a `clusterProperties` (`['+', ['case', ['==', ['get', 'estado'], 'afectada'], 1, 0]]`, cuenta cuántos puntos del cluster tienen `estado === 'afectada'`). `colorPorSeveridadRango()` ahora chequea primero `escuelasAfectadas === 0` → `COLOR_SIN_AFECTACION`; sólo si hay al menos una escuela afectada usa la severidad más alta (`severidadRango`, agregado por `max`, sin cambios en esa parte). Contrato visual preservado: "Sin dato"/"sin afectación" nunca se ve como una severidad real.
   - Archivos: `components/mapas/map-infraestructura-page.tsx`, `components/mapas/map-infraestructura-page.paint.test.ts` (tests de `colorPorSeveridadRango` actualizados a la nueva forma de la expresión + 2 tests nuevos: 0 afectadas → gris, ≥1 afectada → severidad real).

2. **Buscador no tokenizaba nombres alfabéticos (ranking por palabra exacta/prefijo roto).**
   - Causa: `tokenizar()` (`lib/mapas/buscar-escuelas.ts`) usaba la regex `/[^a-z0-9]+/` (minúsculas) sobre texto ya normalizado a MAYÚSCULAS por `normalizarTextoBusqueda`. Ninguna letra mayúscula matchea `[a-z0-9]`, así que para cualquier nombre con letras el string completo se trataba como un solo separador y `tokenizar` devolvía siempre `[]` — sólo "funcionaba" con nombres compuestos exclusivamente por dígitos (los dígitos no tienen mayúscula/minúscula). Los rangos 2 ("palabra exacta") y 3 ("prefijo de palabra") quedaban inalcanzables para nombres alfabéticos.
   - Fix: regex corregida a `/[^A-Z0-9]+/`, consistente con la normalización real (mayúsculas).
   - Archivos: `lib/mapas/buscar-escuelas.ts`, `lib/mapas/buscar-escuelas.test.ts` (tests nuevos: "belgrano" encuentra "ESCUELA N° 580 GENERAL MANUEL BELGRANO" por palabra exacta antes que un nombre donde sólo aparece como substring; prefijo de palabra "belg"; CUE exacto sigue ganando primero; query alfabética de 1 char sigue devolviendo `[]`; nombres con tildes y Ñ).

### Verificación de las correcciones (2026-09-27)

| Chequeo | Comando | Resultado |
|---|---|---|
| Tests focalizados (búsqueda) | `pnpm exec vitest run lib/mapas/buscar-escuelas.test.ts --maxWorkers=2` | ✅ 12 tests |
| Tests focalizados (cluster + integración de página) | `pnpm exec vitest run components/mapas/map-infraestructura-page.paint.test.ts components/mapas/map-infraestructura-page.test.tsx --maxWorkers=2` | ✅ 31 tests |
| Suite completa | `flock heavy.lock pnpm exec vitest run --maxWorkers=2` | ✅ 197 archivos / 1649 tests |
| Lint | `flock heavy.lock pnpm lint` | ✅ exit 0 |
| Typecheck | `flock heavy.lock pnpm exec tsc --noEmit` | ✅ exit 0 |

Sin commits. Servidor de demo del puerto 3100 no se detuvo.

## Gate

_(la completa N1)_

## Gate (N1)

**Decisión: aceptado tras correcciones (2026-09-27).**

- Verificaciones: N1 corrió `pnpm exec vitest run --maxWorkers=2` 197 archivos / 1643 tests, `pnpm lint` y `pnpm exec tsc --noEmit` con exit 0; tras las correcciones, el N2 reportó 1649/1649 bajo el candado compartido.
- Demo verificada por N1 en localhost:3100 con una base de demo nueva: 2005 escuelas en 25 departamentos (2001 con ubicación y 4 sin ubicación contadas aparte); con 47 partes de demo, provincia 46 afectadas (2,3 %), por ejemplo Capital 365 · 8 · 2,2 % y Saladas 69 · 5 · 7,2 %.
- Revisión independiente (N2 → N3): dos hallazgos mayores, corregidos. (1) Los clusters sin escuelas afectadas tomaban el color de severidad "Baja"; ahora usan el gris neutro y sólo un cluster con afectadas toma color de severidad. (2) El tokenizador del buscador usaba una expresión en minúsculas sobre texto en mayúsculas, así que el ranking por palabra no funcionaba con nombres reales; corregido con tests sobre nombres alfabéticos, tildes y Ñ. Sin otros hallazgos: agregados, denominador, ACL y `Cache-Control` de las APIs nuevas y el resguardo del script de demo están bien.
- Pendiente: walkthrough con operadores reales.
