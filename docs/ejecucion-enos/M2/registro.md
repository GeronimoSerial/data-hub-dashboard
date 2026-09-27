# M2 — Correcciones del mapa de infraestructura pedidas tras el demo

## 0. Objetivo

Batch de 5 correcciones puntuales sobre `components/mapas/map-infraestructura-page.tsx`
pedidas por el usuario después de probar el demo. Rama `feat/enos-m2` (desde
`feat/renovación`, incluye M1 + P1 + E4 Radar). N2 = sonnet; delegó la
implementación del punto 1 a N3 (`opencode-go/deepseek-v4.1-flash`, sin
herramienta Agent) y resolvió directamente los puntos 3, 4 y 5 (fixes
mecánicos de 1-3 líneas, ya diagnosticados) y el punto 2 (test de regresión).

Otro N2 integra el modo Replay (E7c) en el mismo archivo: los cambios de este
batch se mantuvieron localizados (funciones puras nuevas + JSX puntual) para
que el merge sea simple.

## 1. Mapa: sólo afectadas por defecto, padrón como capa, indicador siempre visible

Pedido original del usuario: ocultar el total del padrón en el mapa y dejarlo
sólo como indicador. **Ajuste de N1 durante la ejecución** (mensaje recibido a
mitad de tarea): en vez de ocultar el padrón, dejarlo como una CAPA más,
apagada por defecto, prendible desde el control de capas — el mapa muestra
sólo afectadas por defecto, el indicador se ve siempre.

Implementado así:

- `components/mapas/layer-control.tsx`: label de la capa `escuelas` cambiado
  de "Escuelas (padrón completo)" a **"Todas las escuelas (padrón)"**.
- `components/mapas/map-infraestructura-page.tsx`:
  - `CAPAS_VISIBLES_DEFECTO.escuelas`: `true` → **`false`** (apagada por
    defecto).
  - La `<Source id="infra-partes-src">` (contiene el padrón clusterizado Y las
    capas `sinReportar`/`evacuacion`, que viven DENTRO de ella) dejó de estar
    gateada por `capasVisibles.escuelas` — queda **siempre montada**, porque
    esas dos capas dependen de que la Source exista aunque el padrón esté
    apagado. Lo que cambia con el toggle es el `filter` de las layers de
    puntos/clusters del padrón, no el montaje de la Source.
  - Dos funciones puras nuevas, exportadas junto a las demás (mismo patrón que
    `circlePaintPartes`/`colorPorSeveridadRango`, testeadas en
    `map-infraestructura-page.paint.test.ts`):
    - `filtroPuntosPartes(mostrarPadron)`: apagado → sólo puntos individuales
      con `estado === 'afectada'`; encendido → todos (las sin afectación se
      pintan en gris neutro vía el campo `color` que ya asigna
      `construirEscuelasMapaFeatureCollection`).
    - `filtroClusterPartes(mostrarPadron)`: apagado → sólo clusters con
      `escuelasAfectadas > 0` (agregado ya existente en `clusterProperties`);
      encendido → todos, incluidos los de puras escuelas sin afectación
      (pintados en gris por `colorPorSeveridadRango`, que ya cubre ese caso).
    - Se aplican a las TRES layers de esa fuente (`CAPA_PARTES_ID`,
      `CAPA_PARTES_CLUSTER_ID`, `CAPA_PARTES_CLUSTER_COUNT_ID`) para que un
      cluster oculto no deje su etiqueta de conteo flotando sola.
  - `capasInteractivas` ya no condiciona esos dos ids por `capasVisibles.escuelas`
    (la Source siempre está montada, así que siempre pueden ser clickeados).
  - **Indicador siempre visible**: nuevo párrafo (`data-testid`
    `infra-totales-indicador`) en el panel izquierdo, entre `<EscuelaSearchBox>`
    y `<Indicadores>`, independiente de `capasVisibles.escuelas`. Muestra
    totales del departamento filtrado (`totalesPorDepartamento`) o, sin
    filtro, los totales de provincia (`dataTotalesMapa.provincia`, ya
    calculados por M1 — no hizo falta tocar el backend). Formato: "`X`
    escuelas · `Y` afectadas · `Z`%".
  - Buscador: no requirió cambios — `escuelaResaltada` ya era una `Source`
    separada e independiente de `capasVisibles.escuelas`; el test existente de
    M1 ("buscar y seleccionar una escuela sin afectación hace flyTo...") ya
    lo cubre y sigue en verde.

Corrección de tipos post-implementación (N2): las dos funciones nuevas
devolvían `unknown[]`, que no es asignable al prop `filter` de MapLibre
(`FilterSpecification`); se tipó el retorno como `FilterSpecification` con el
mismo patrón de cast (`as unknown as X`) que ya usan las demás expresiones del
archivo. `tsc --noEmit` quedó limpio después del ajuste.

Tests (`map-infraestructura-page.paint.test.ts` y `.test.tsx`): las dos
funciones de filtro en ambas ramas (true/false); el indicador visible con la
capa apagada; la casilla arranca destildada; tildarla no hace desaparecer el
indicador. Los tests de M1 (búsqueda de escuela sin afectación, hover de
departamento) siguen en verde sin cambios.

## 2. Radar gris al cambiar de horizonte (24h verde, 72h/240h gris)

**Diagnóstico con datos reales** (`DATA_DIR` apuntando a la base de demo
`scratchpad/demo-m1`): se corrió `obtenerNivelesPeligro` y
`agregarNivelPorDepartamento` directamente contra esa base (vía un test
temporal, descartado después de confirmar el resultado). Hallazgo:

- `hazard_climatology` y `hazard_ensemble_prob` están **completamente vacías**
  en la demo (0 filas). `hazard_forecast` sí cubre precipitación hora a hora
  de 0 a 227h para las 387 celdas.
- Con climatología vacía, `calcularNivelCeldaSync` cae al camino de
  **umbral provisorio** (`nivelDesdeUmbralProvisorio`), que sí resuelve un
  nivel concreto para cualquier horizonte con pronóstico — este es
  exactamente el fallback que agregó el batch **P1** (`feat/enos-p1`, ya
  mergeado a la base de esta rama, commit `bcf5a2e`).
- Corriendo el cálculo real contra la demo: los 25 departamentos dan
  **verde en los tres horizontes (24h, 72h, 240h)**, nunca `sin_dato`. La
  causa raíz que producía el gris ("sin climatología → `sin_dato` mudo") ya
  estaba resuelta por P1 antes de que arrancara este batch; no se encontró
  una regresión nueva en 72h/240h con los datos actuales de la demo.

Para que esto no vuelva a romperse en silencio, se agregó un **test de
regresión** en `lib/infraestructura/riesgo/peligro/nivel.test.ts`: pronóstico
horario completo (0..227h, mismo rango que la demo real) sin climatología ni
ensemble → los tres horizontes (24/72/240) deben resolver a un nivel concreto
con `metodo: 'umbral_provisorio'`, nunca `sin_dato`.

**Nota para N1**: si el usuario vuelve a ver gris en 72h/240h contra la demo
actual, no es este camino — revisar si cambió el contenido de
`hazard_forecast` (por ejemplo si la corrida real no llega hasta 240h ±24h de
tolerancia, ver `TOLERANCIA_HORIZONTE_240_HORAS` en `nivel.ts`) o si se cargó
climatología parcial para algunas celdas y no otras.

## 3. Volver a "Ahora" no funcionaba (con teclado incluido)

Causa: `horizontesDisponibles` (el array que `<SelectorHorizonte>` usa para
decidir qué botones están habilitados) sólo incluía horizontes numéricos con
evidencia real; **`'ahora'` nunca estaba en la lista**, así que el botón
"Ahora" quedaba con `aria-disabled` permanente y su `onClick` (guardado por
`if (!habilitado) return`) nunca disparaba `onChange`. Como el guard es el
mismo para click y para Enter/Space (ambos pasan por el mismo `onClick` del
`<button>` nativo), el teclado quedaba igual de bloqueado.

Fix: `'ahora'` se agrega siempre al principio del array devuelto por
`horizontesDisponibles` — es cualitativo, no depende de ninguna corrida del
radar (no manda query, ver `use-radar.ts`), así que nunca debería depender de
si `radarData` llegó o de qué horizontes tienen evidencia.

Test: cubierto indirectamente por el test ya existente de
`selector-horizonte.test.tsx` ("al hacer click en un horizonte disponible
dispara onChange") una vez que `'ahora'` está en `disponibles`; no hizo falta
un test nuevo porque el componente `SelectorHorizonte` ya estaba bien
testeado — el bug vivía en quién le pasaba `disponibles`, no en el
componente.

## 4. Texto técnico del briefing (UUID del corte visible en la UI)

`lib/infraestructura/riesgo/briefing.ts`: `lineaCorte` armaba
`"Corte ${runActual.id} publicado el ..."`, exponiendo el UUID interno del
run. Y sin corte anterior, el mensaje completo era *"Corte `<uuid>` publicado
el ... Es el primer corte disponible, sin comparación."* — exactamente lo que
el usuario reportó.

Fix:
- `lineaCorte` ya no interpola ningún `.id`, sólo fechas ("Corte publicado el
  YYYY-MM-DD." / "Corte anterior: YYYY-MM-DD.").
- Sin corte anterior, el mensaje pasa a ser el texto útil para operadores
  pedido por el usuario: **"Primer resumen del día; todavía no hay un corte
  anterior para comparar."** — sin id, sin fecha repetida (la fecha del corte
  ya se ve en el resto del panel).

Revisión de otras plantillas del briefing con el mismo criterio
(`lib/infraestructura/riesgo/situacion/consulta.ts`,
`app/api/infraestructura/situacion/route.ts`,
`components/infraestructura/situacion-client.tsx`): los únicos usos de
`.id`/`runId` encontrados son claves React (`key={cambio.id}`) o IDs internos
de eventos (`riesgo-${corte.id}`) usados sólo como `key`, nunca renderizados
como texto visible. No se encontró otro leak de UUID en la interfaz.

Tests actualizados: `briefing.test.ts` (nuevo test "nunca expone el id
interno (UUID) del corte en ninguna línea" + ajuste del test de primer
corte), `situacion/corte.test.ts` (el test que reconstruye el briefing desde
un corte real esperaba la frase vieja; se actualizó y se le agregó la misma
aserción de "no contiene el id").

## 5. Tooltip transparente (hover de departamento)

Causa: `components/mapas/maplibre-popup.css` define una regla
`.mapa-tooltip-departamento .maplibregl-popup-content { background:
color-mix(...); border; box-shadow; ... }` con fondo sólido y contraste AA en
ambos temas (usa los tokens `--card`/`--ink`/`--line` de `app/globals.css`,
que ya dan contraste correcto en claro y oscuro). Pero el `<Popup>` en
`map-infraestructura-page.tsx` usaba `className="map-departamento-hover-popup"`
— **un nombre de clase distinto** al que apunta el CSS — así que esa regla
nunca aplicaba y el popup caía al `background: transparent` genérico de
`.maplibregl-popup-content` (la regla base, sin scope).

Fix: se corrigió el `className` del `<Popup>` a `mapa-tooltip-departamento`
(el nombre real que usa el CSS). No hizo falta tocar el CSS: los tokens y el
contraste ya estaban bien definidos, sólo no se aplicaban.

**Nota sobre "el tooltip de escuela" (pedido del usuario)**: en este código
sólo existe UN tooltip flotante de hover, el de departamento (`departamentoHover`
+ `<Popup>`). No hay un tooltip de hover separado para escuela — la ficha de
escuela es un modal (`FichaParteModal`, ver comentario "F3.2" en el archivo:
la ficha pasó de Popup de MapLibre a modal), no un popup flotante. Si el
usuario espera un tooltip de hover al pasar el mouse sobre un punto-escuela
(distinto del modal que abre al click), es una funcionalidad que no existe
todavía en el código — queda para que N1 confirme si hace falta agregarla o
si el reporte se refería al mismo popup de departamento visto sobre un área
con escuelas.

## 2. Verificación

- `npx vitest run components/mapas/map-infraestructura-page.paint.test.ts
  components/mapas/map-infraestructura-page.test.tsx
  components/mapas/selector-horizonte.test.tsx
  lib/infraestructura/riesgo/briefing.test.ts` → **verde** (tests
  focalizados, antes de la suite completa).
- `flock ~/.cache/enos-n3/heavy.lock npx vitest run --maxWorkers=2` →
  **197 archivos, 1673 tests, todos en verde.**
- `flock ~/.cache/enos-n3/heavy.lock npx eslint <archivos tocados>` → **sin
  hallazgos.**
- `flock ~/.cache/enos-n3/heavy.lock npx tsc --noEmit` → **sin errores**
  (después de tipar `filtroPuntosPartes`/`filtroClusterPartes` como
  `FilterSpecification` en vez de `unknown[]`).
- `flock ~/.cache/enos-n3/heavy.lock npm run build` → **build de producción
  exitoso**, todas las rutas generadas.

Archivos tocados en este batch:

- `components/mapas/layer-control.tsx`
- `components/mapas/map-infraestructura-page.tsx`
- `components/mapas/map-infraestructura-page.test.tsx`
- `components/mapas/map-infraestructura-page.paint.test.ts`
- `lib/infraestructura/riesgo/briefing.ts`
- `lib/infraestructura/riesgo/briefing.test.ts`
- `lib/infraestructura/riesgo/peligro/nivel.test.ts`
- `lib/infraestructura/riesgo/situacion/corte.test.ts`

Sin commits, push ni merge — queda para N1. `.atl/` (caché local del
registro de skills) quedó como untracked, sin agregar a ningún commit.

## 3. Pendientes explícitos para N1

1. **"Tooltip de escuela" (punto 5)**: no existe un tooltip de hover separado
   para escuela en el código actual (sólo el modal de ficha, al click). Si el
   usuario necesita un tooltip de hover distinto del modal, es trabajo nuevo,
   no un fix — confirmar alcance antes de un próximo batch.
2. **Radar gris (punto 2)**: no se encontró una causa activa contra la demo
   actual (P1 ya la resolvió). Si el usuario reproduce el gris de nuevo,
   revisar si cambió el contenido de `hazard_forecast`/`hazard_climatology`
   respecto de lo que vio este diagnóstico (ver nota en §2).

## Gate

_(Sección reservada para N1.)_
