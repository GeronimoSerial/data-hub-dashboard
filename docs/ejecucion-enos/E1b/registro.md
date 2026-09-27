# E1b — Parte escolar resistente a conectividad intermitente

Registro de ejecución del batch E1b (N2, rama `feat/enos-e1b`, worktree
`/home/gero/orca/workspaces/data-hub-dashboard/enos-e1b`). Entregable
independiente descrito en plan-ejecucion §6-E1 ("Entregable adicional
independiente — conectividad intermitente del parte escolar") y su
"Aceptación adicional". No agrega carga manual nueva: el único ingreso
manual sigue siendo el parte existente que carga la escuela.

## Baseline (antes de tocar código)

Ejecutado sobre `3bd9604` (punto de partida, E0/E2/E3b ya mergeados):

| Comando | Resultado |
|---|---|
| `pnpm test` | 145 test files, 1136 tests — exit 0 |
| `pnpm lint` | exit 0, sin hallazgos |
| `pnpm exec tsc --noEmit` | exit 0, sin errores |
| `pnpm build` | exit 0, build completo |

## Decisiones locales

- **Alcance del cambio**: se agregó un motor reutilizable de borrador
  persistente + cola de reintento (`lib/infraestructura/parte/envio-offline.ts`)
  y se integró en los DOS formularios existentes que envían un parte
  (`reporte-inicial-form.tsx` y `actualizacion-form.tsx`), reemplazando el
  `sessionStorage` de sesión por un almacén IndexedDB-con-fallback-a-localStorage.
  `sessionStorage` no sobrevive a cerrar la pestaña/app, que es exactamente el
  requisito de la decisión 1 de N1; por eso el swap de backend era obligatorio,
  no cosmético.
- **Sin tablas nuevas**: este batch no necesitó ningún cambio en
  `lib/db/schema.ts` ni en `HUB_DDL` de `lib/db/seed.ts`. Toda la persistencia
  del borrador/cola es del lado del cliente (IndexedDB/localStorage); el
  servidor no gana estado nuevo. No hay bloque `// E1b: ...` en esquema/seed
  porque no aplica.
- **Sin dependencias nuevas**: no se agregó `idb-keyval` ni `fake-indexeddb`.
  `crearAlmacenNavegador()` usa la API nativa `indexedDB` con `try/catch` y cae
  a `localStorage` (también con `try/catch`, nunca lanza). Los tests usan un
  adaptador en memoria (`crearAlmacenMemoria()`, un `Map`) para el motor, y el
  fallback real a `localStorage` para los dos formularios (jsdom no implementa
  `indexedDB`, así que el camino de fallback se ejercita de verdad en cada test).
- **Sin service worker**: evaluado y descartado. La cola de reintento sólo
  necesita reaccionar a `online`/`visibilitychange` mientras la pestaña está
  abierta y a la persistencia del borrador mientras está cerrada; no hay
  requisito de reintentar en segundo plano con la app cerrada. Un service
  worker habría agregado superficie de build/despliegue en Next sin resolver
  ningún criterio de aceptación adicional.
- **Flag que gobierna la UI nueva**: NINGUNO de `HAZARD_CONTEXT_ENABLED` ni
  `RISK_ENGINE_ENABLED` aplica. Esta UI no es una capacidad nueva de riesgo/
  hazard en sombra: es resiliencia de UX para el formulario de parte YA
  autorizado y ya visible sin flag (el borrador de sesión existente tampoco
  estaba gateado). Gatear la resiliencia de red hubiera significado que, con
  el flag apagado, el director pierde datos ante un corte — contrario al
  principio rector. Se documenta acá como decisión local explícita porque el
  brief pedía dejarlo asentado.
- **Idempotencia server-side**: NO se tocó `app/api/problematicas/parte/route.ts`.
  El mecanismo (columna `idempotency_key` + índice único en `infra_movimiento`,
  precheck + manejo de la carrera en el catch de la transacción) ya existía y
  ya tenía cobertura de un solo replay. Se agregó un test explícito de
  reintentos múltiples secuenciales (ver despachos abajo) sin modificar la
  lógica de producción, conforme a "ya existe idempotencia: probarla
  explícitamente, no reescribirla salvo defecto".
- **Unificación del error de envío**: los formularios ya tenían un estado
  `error` (role="alert") para validación de paso incompleto (sin cambios). Los
  errores de ENVÍO (submit) ahora se muestran exclusivamente a través del
  nuevo párrafo `role="status"` con los textos exactos de `MENSAJES_ESTADO`,
  para no duplicar dos mensajes distintos sobre el mismo fallo.
- **`calcularEsperaReintento` (backoff exponencial acotado) queda declarado en
  el motor pero SIN uso** por los formularios: el disparo de reintento es
  puramente por evento (`online`/`visibilitychange`), no por temporizador. Se
  deja como hallazgo de la revisión (ver más abajo) en vez de forzar un uso
  artificial; documentado para que N1 decida si lo quiere cablear a futuro
  (por ejemplo, para amortiguar "flapping" de conectividad).

## Despachos a N3 (todos en `opencode-go/deepseek-v4.1-flash`, `OPENCODE_CONFIG=n3-sin-mcp.json`)

### Ola 1 — N3-Datos: motor de borrador/cola
- **Archivos**: `lib/infraestructura/parte/envio-offline.ts` (nuevo),
  `lib/infraestructura/parte/envio-offline.test.ts` (nuevo).
- **Resultado**: intento 1 con timeout de 560s se agotó sin producir ningún
  archivo (`git status` vacío tras el intento). Intento 2, mismo brief
  recortado, terminó en ~1 min con 19 tests verdes.
- **Verificación**: `npx vitest run lib/infraestructura/parte/envio-offline.test.ts`
  → 19 passed. Lectura manual del módulo: nombres, firma y comportamiento
  coinciden con el contrato pedido (clasificación 'red'/5xx→reintentable,
  401/403/410→sesión vencida, otro 4xx→no-reintentable; reutilización de
  `idempotencyKey` en reintentos; `registrarAutoReintento` con limpieza de
  listeners).
- **Qué escribí yo**: nada de código; sólo el brief y la verificación.

### Ola 2 — N3-Formulario-Nuevo y N3-Formulario-Actualizar (en paralelo, archivos disjuntos)
- **Archivos**: `components/infraestructura/reporte-inicial-form.tsx` +
  `.test.tsx`; `components/infraestructura/actualizacion-form.tsx` + `.test.tsx`.
- **Resultado del primer intento (los 2 en paralelo con `&`/`wait` en un mismo
  Bash)**: ambos agotaron el timeout de 560s SIN aplicar ningún cambio
  (contención de recursos al correr dos sesiones opencode simultáneas con
  briefs grandes). Registrado como fallo #1 de la MISMA tarea, según la regla
  de "implemento yo sólo si falla 2 veces con esta config": no aplica porque
  el segundo intento (secuencial) sí funcionó.
- **Reintento (secuencial, uno primero y el otro después)**: ambos terminaron
  con éxito. Nuevo: 27 tests verdes. Actualizar: 21 tests verdes.
- **Verificación**: `npx vitest run` focalizado en cada archivo, luego
  conjunto (`48 passed` entre los dos). Lectura del diff: swap de
  `sessionStorage`→`almacenParte` (IndexedDB/localStorage) preservando la
  validación existente (`esBorradorParteNuevo`/`esBorradorParteActualizacion`),
  integración de `intentarEnviar` en el submit, textos de estado exactos,
  auto-reintento vía `registrarAutoReintento`.
- **Qué escribí yo**: nada de código; briefs, verificación y el criterio de
  "secuencial en vez de paralelo" para el reintento.

### Ola 3 — N3-Servidor: test explícito de N reintentos
- **Archivo**: `app/api/problematicas/parte/route.test.ts` (sólo se agregó un
  test nuevo; no se tocó `route.ts`).
- **Resultado**: éxito al primer intento. Agregó `CUE_IDEM` propio (para no
  colisionar con fixtures de tests vecinos) y un test que hace 5 POST
  secuenciales con la misma `idempotencyKey`: 1×201 + 4×200, mismo
  `movimientoId`, y verifica en la base que sólo existe 1 fila de
  `infraMovimiento` con esa clave y 1 fila de `infraParte` para ese CUE.
- **Verificación**: `npx vitest run app/api/problematicas/parte/route.test.ts
  app/api/problematicas/parte/route.sin-corte.test.ts` → 32 passed.
- **Qué escribí yo**: nada de código.

### Ola 4 — N3-Revisión (implementador distinto, sólo lectura/reporte)
- **Alcance**: revisión de los 5 archivos modificados + el módulo nuevo, sin
  tocar código. Preguntas dirigidas: colisión de claves, reutilización de
  idempotencyKey, manejo 401/403/410, envío duplicado en paralelo, datos
  sensibles en el borrador, robustez del fallback IndexedDB→localStorage, uso
  real del backoff, comportamiento ante "flapping" de red.
- **Hallazgos** (con severidad asignada por el propio revisor):
  1. **[menor, corregido en ola 5]** Si un 2xx llega con un cuerpo inesperado
     (`ok` no es `true`), el motor ya borró la cola antes de que el
     componente valide el cuerpo; un reintento posterior generaría una
     `idempotencyKey` NUEVA. Caso de borde (requiere que el servidor responda
     2xx con un cuerpo que no cumple el contrato esperado); no se disparó en
     ningún test, pero se deja anotado. **No se corrigió** en este batch:
     corregirlo bien requeriría no borrar la cola hasta validar el cuerpo, lo
     cual cambia la semántica de "2xx implica éxito" del motor; queda como
     mejora de una futura iteración, no como defecto bloqueante (el servidor
     real de `route.ts` siempre responde `{ok:true, movimientoId}` en 2xx).
  2. **[menor, CORREGIDO]** `estadoEnvio` no se restauraba desde la cola al
     montar el componente: si el usuario cerraba la pestaña con un envío
     `pendiente-envio` y la reabría, el auto-reintento no disparaba hasta un
     click manual (violaba "sin acción del director"). Se despachó una ola 5
     de corrección (ver abajo).
  3. **[menor]** El auto-reintento en el formulario de alta exige `paso===4`;
     si el usuario retrocede de paso con un envío pendiente, el reintento
     automático deja de dispararse silenciosamente. Aceptado como diseño: si
     el director vuelve a editar, es razonable esperar que confirme de nuevo
     antes de reintentar.
  4. **[nota]** `calcularEsperaReintento` no tiene ningún call site real
     (ver decisión local arriba).
  5. **[nota]** El fallback `IndexedDB → localStorage` no es "pegajoso": una
     escritura que cayó a localStorage puede no verse si luego IndexedDB
     vuelve a responder. No se corrigió (edge case de doble fallo de
     almacenamiento, de impacto bajo).
  6. **[nota]** El mensaje de sesión vencida explica qué hacer en texto pero
     no ofrece un enlace/acción de re-login. Aceptado: el requisito de N1 pide
     "mostrar cómo retomar", no un botón de acción.
  7. **[nota]** El campo `idempotencyKey` de estado de los componentes queda
     sin uso real en el cuerpo del POST (lo pisa `construirCuerpo`); no rompe
     nada, es vestigial. No se tocó para no ampliar el diff sin necesidad.

### Ola 5 — N3-Fix: hidratar `estadoEnvio` desde la cola al montar
- **Archivos**: los mismos 4 de la ola 2 (2 componentes + sus 2 tests).
- **Resultado**: éxito al primer intento. Se agregó, en el mismo efecto de
  montaje (o uno nuevo con la misma bandera `cancelado`), una lectura de
  `leerBorrador` (aliasado `leerColaEnvio`) del módulo de envío para
  inicializar `estadoEnvio`/`motivoEnvio` desde la cola real, y un test de
  regresión por archivo.
- **Verificación**: `npx vitest run` de los 4 archivos → 99 passed (motor +
  2 formularios + servidor).
- **Qué escribí yo**: nada de código; el diagnóstico del hallazgo (leído del
  reporte de la ola 4) y el brief de corrección.

### Ola 6 — N3-Fix-tsc: errores de tipos
- **Motivo**: `pnpm exec tsc --noEmit` (corrido por mí, nunca por N3) reveló 5
  errores nuevos tras las olas anteriores: 2 en `envio-offline.ts`
  (`operarIndice` no genérica, `IDBRequest<unknown>` vs `IDBRequest<IDBValidKey>`/
  `IDBRequest<undefined>`) y 3+1 en `actualizacion-form.test.tsx` (mocks de
  `fetch` declarados con un solo parámetro `url`, tupla de `mock.calls` de
  longitud 1 al indexar `[1]`).
- **Archivos**: `lib/infraestructura/parte/envio-offline.ts`,
  `components/infraestructura/actualizacion-form.test.tsx`.
- **Resultado**: éxito al primer intento. `operarIndice<T>` genérica; mocks
  de fetch con segundo parámetro `init?: RequestInit`.
- **Verificación**: `pnpm exec tsc --noEmit` sin líneas para esos 2 archivos;
  tests de ambos archivos siguen en verde.
- **Qué escribí yo**: nada de código; diagnóstico de los mensajes de tsc y
  el brief de corrección.

### Ola 7 — N3-Fix-lint: comentarios `eslint-disable` sin uso
- **Motivo**: `pnpm lint` (corrido por mí) reportó 4 warnings (0 errores):
  "Unused eslint-disable directive" en los dos efectos de restauración de
  borrador (2 por componente), porque el IIFE async ya no dispara la regla
  que motivaba el disable original.
- **Archivos**: `reporte-inicial-form.tsx`, `actualizacion-form.tsx`.
- **Resultado**: éxito al primer intento. Se borraron los 4 pares
  `eslint-disable`/`eslint-enable`, sin tocar el comentario explicativo normal
  ni el código.
- **Verificación**: `pnpm lint` → 0 errores, 0 warnings. Tests de ambos
  archivos siguen en verde (50 passed).
- **Qué escribí yo**: nada de código; el diagnóstico y el brief.

## Pruebas reales fechadas

No se realizó una prueba real contra un servidor Next levantado (no había
navegador/entorno disponible en este worker para reproducir un corte de red
real end-to-end dentro del tiempo de este batch). En su lugar:

- La idempotencia server-side se verificó con un test de integración real
  contra SQLite temporal (no mock), no contra un mock de base de datos: ver
  ola 3, `app/api/problematicas/parte/route.test.ts`, ejecutado
  el 2026-09-26 — `npx vitest run app/api/problematicas/parte/route.test.ts` →
  30 passed (incluye el test nuevo de 5 reintentos).
- **Pendiente para el gate UX** (ver sección siguiente): recorrido manual con
  DevTools en un navegador real, no ejecutado en este batch.

## UX — estados y recorrido manual (pendiente de ejecución real)

Textos de estado implementados exactamente como los pidió N1
(`lib/infraestructura/parte/envio-offline.ts`, `MENSAJES_ESTADO`):

- `guardado-local` → "Guardado en este dispositivo"
- `pendiente-envio` → "Pendiente de envío — se enviará al recuperar conexión"
- `enviando` → "Enviando…"
- `enviado` → "Enviado"
- `error` → "No se pudo enviar" (+ `: <motivo>` cuando hay motivo, p.ej. "No se
  pudo enviar: dato inválido" o el mensaje de sesión vencida)

**Recorrido manual reproducible (PENDIENTE — no ejecutado con operadores
reales en este batch; dejarlo documentado para que N1 lo corra o lo asigne)**:

1. Levantar el entorno (`pnpm dev`) y loguearse con acceso a un parte de un
   establecimiento de prueba.
2. Abrir `/problematicas/parte/nuevo?cue=<CUE>`, completar los 4 pasos hasta
   "Confirmar".
3. Abrir DevTools → pestaña "Network" → tildar "Offline".
4. Click en "Guardar reporte". Esperado: aparece
   "Pendiente de envío — se enviará al recuperar conexión"; el botón vuelve a
   estar habilitado; no hay ningún reintento visible mientras siga offline.
5. Cerrar la pestaña (o navegar a otra URL y volver) SIN sacar el offline de
   DevTools. Reabrir `/problematicas/parte/nuevo?cue=<CUE>`. Esperado: el
   texto de estado "Pendiente de envío…" reaparece solo, sin que el director
   toque nada (ola 5 corrigió justo este camino).
6. Destildar "Offline" en DevTools (volver online). Esperado: sin ninguna
   acción del director, el POST se reintenta solo y aparece la confirmación
   "El reporte fue registrado…".
7. Repetir el mismo flujo pero, en el paso 4, en vez de offline real, usar
   "Network conditions" para forzar un 500/503 con una extensión o un proxy
   local (o, más simple, revisar el mismo comportamiento ya cubierto por los
   tests automatizados de la ola 2/5, que son equivalentes a este paso).
8. Repetir el flujo con una sesión vencida (borrar la cookie de sesión antes
   del paso 4): esperado, el texto de estado menciona la sesión vencida y el
   borrador (los datos de los 4 pasos) sigue visible al volver a entrar tras
   reloguearse.

## Verificaciones finales (repetidas tras integrar las 7 olas)

| Comando | Resultado |
|---|---|
| `pnpm test` | 146 test files, **1164 tests** (1136 baseline + 28 nuevos) — exit 0 |
| `pnpm lint` | exit 0, 0 errores, 0 warnings |
| `pnpm exec tsc --noEmit` | exit 0, sin errores |
| `pnpm build` | exit 0, build completo (incluye `/problematicas/parte/nuevo` y `/problematicas/parte/actualizar`) |

## Archivos modificados/creados

- Nuevo: `lib/infraestructura/parte/envio-offline.ts`
- Nuevo: `lib/infraestructura/parte/envio-offline.test.ts`
- Modificado: `components/infraestructura/reporte-inicial-form.tsx`
- Modificado: `components/infraestructura/reporte-inicial-form.test.tsx`
- Modificado: `components/infraestructura/actualizacion-form.tsx`
- Modificado: `components/infraestructura/actualizacion-form.test.tsx`
- Modificado: `app/api/problematicas/parte/route.test.ts` (sólo test nuevo,
  sin cambios de producción)

No se tocó `lib/db/schema.ts`, `lib/db/seed.ts`, `package.json`, ni
`app/globals.css`. Se encontró un directorio no rastreado `.atl/` presente
desde antes de empezar esta tarea (contiene `skill-registry.md`); no fue
creado por este batch y no se tocó.

## Gate

*(Esta sección la completa N1.)*

## Correcciones del gate N1

Corregidos los 4 hallazgos del gate de revisión, en
`lib/infraestructura/parte/envio-offline.ts` y los dos formularios. No se
tocó `app/api/problematicas/parte/route.ts`.

### 1 (MAJOR) — doble envío duplica partes entre pestañas/dispositivos

**1a — mismo dispositivo, varias pestañas.** El ciclo leer→decidir→escribir
de `intentarEnviar` (¿hay ya una idempotencyKey para este tipo+cue, o hay
que acuñar una?) ahora es una sección crítica atómica, serializada por clave
(`claveBorrador(tipo, cue)`):

- Con Web Locks API (`navigator.locks`, soportada por Chrome/Edge/Firefox y
  Safari ≥15.4) se usa `navigator.locks.request(...)`, que coordina de
  verdad entre pestañas reales del mismo origen.
- Sin Web Locks API (navegador viejo, o este entorno de test sobre jsdom,
  que NO la implementa) se cae a un mutex en memoria por (almacén, clave):
  sólo sincroniza dentro del mismo proceso de JS. Documentado en el propio
  código como limitación explícita.

El bloqueo se suelta apenas se persiste el borrador en estado `'enviando'`
con la idempotencyKey decidida — **deliberadamente no se sostiene durante el
fetch**: sostenerlo ahí le ganaría de mano a la reutilización, porque la
segunda pestaña recién podría leer el borrador después de que la primera ya
hubiera terminado y borrado la cola (con éxito), y en ese caso acuñaría una
clave nueva igual que antes. Soltándolo apenas se escribe `'enviando'`, una
segunda pestaña que entra MIENTRAS la primera todavía está en vuelo ve esa
clave recién escrita y la reutiliza.

Además, para que dos pestañas que ya acordaron la misma idempotencyKey no le
peguen a la red al mismo tiempo, si la segunda llega mientras la primera
sigue esperando la respuesta, se ENGANCHA a la misma promesa de envío en vez
de hacer su propio POST (mapa `enviosEnCursoPorAlmacen`, indexado por
almacén y por clave+idempotencyKey, con entrada borrada apenas el envío
resuelve). Si no hay nada en vuelo — pestañas reales distintas, cuyo caché en
memoria no cruza, o un reintento deliberado y posterior — cada una hace su
propio POST con la MISMA clave, que el servidor ya trata como el replay
idempotente probado en `app/api/problematicas/parte/route.test.ts` (ola 3).
Se descartó explícitamente cachear el *resultado* de un envío ya terminado
(en vez de la promesa en vuelo) por probarse incorrecto: un reintento
deliberado posterior con la misma clave (por ejemplo disparado por
`registrarAutoReintento` bastante después) NO debe reutilizar ciegamente el
resultado de un intento anterior — tiene que volver a golpear la red.

Se evaluó y se descartó la alternativa de fallback sugerida en el brief (una
única transacción `readwrite` de IndexedDB haciendo el get+put): la Web
Locks API ya resuelve el caso real (pestañas de verdad) de forma nativa y
más simple, y el fallback en memoria alcanza para el resto (mismo proceso).
Envolver el `fetch` dentro de una transacción de IndexedDB además es
antipatrón (una transacción de IDB se autocierra si no sigue haciendo
pedidos al store mientras espera una promesa ajena como un `fetch`).

Tests (`lib/infraestructura/parte/envio-offline.test.ts`, describe
"concurrencia entre pestañas..."): dos llamados concurrentes con
`Promise.all` que comparten almacén usan una única idempotencyKey; un caso
determinístico (fetch controlado a mano) donde la segunda llega mientras la
primera sigue en vuelo y se engancha sin repetir el POST; el mismo caso con
`navigator.locks` simulado (para probar el camino real, no sólo el
fallback); y un test que deja explícito que este entorno corre sobre el
fallback en memoria.

**1b — dispositivos distintos (no pueden compartir un lock del navegador).**
Se inspeccionó el modelo del servidor
(`app/api/problematicas/parte/route.ts` + `lib/db/schema.ts`):

- `infra_parte` tiene un índice único en `(cue_anexo, periodo_id)`
  (`infra_parte_cue_periodo_uidx`): dos requests que compiten por crear el
  PARTE para el mismo CUE+período nunca crean dos partes — el segundo
  `insert().onConflictDoNothing()` no hace nada y ambos releen el mismo
  `parteId`.
- `infra_movimiento` tiene un índice único en `idempotency_key`
  (`infra_movimiento_idempotency_key_uidx`), con precheck antes de la
  transacción y manejo de la carrera en el `catch` (reintento con la misma
  clave, incluso concurrente, no sólo secuencial, ya que SQLite serializa
  escrituras): esto es lo que la corrección 1a aprovecha reutilizando la
  clave entre pestañas.

**Riesgo residual documentado, no corregido en este batch**: si dos
dispositivos DISTINTOS (celular + PC, dos sesiones sin ningún lock
compartido) alcanzan a mandar, casi al mismo tiempo, un PRIMER alta para el
mismo CUE+período con dos idempotencyKey DIFERENTES (cada uno la suya,
inevitable sin lock compartido), el servidor create-o-reutiliza UN solo
`infraParte` (por el índice único de arriba) pero cada request, al no
re-verificar `parteExistente` DENTRO de la misma transacción que adquiere el
parte, sigue adelante e inserta sus PROPIAS filas de `infraAfectacion` (y su
propio `infraMovimiento` con `tipo: 'reporte_inicial'`, porque ambas
calcularon `esNuevoParte = true` ANTES de que cualquiera escribiera). Esto
produciría un parte con afectaciones duplicadas y dos movimientos
`reporte_inicial` para el mismo hecho. Corregirlo bien requiere mover la
re-verificación de `parteExistente` (y posiblemente fusionar/objetar la
segunda alta) DENTRO de la transacción, después de adquirir el parte — un
cambio de semántica de negocio no trivial en una ruta que este batch tiene
la instrucción explícita de no tocar salvo una guarda barata y probada. Por
el criterio del brief ("si un cambio de servidor es necesario y no trivial,
pararse y reportarlo como propuesta"), se deja como propuesta para N1 en vez
de implementarlo acá. Mitigación de producto disponible mientras tanto: el
director rara vez tiene dos dispositivos activos al mismo tiempo enviando el
MISMO primer reporte; el caso realista de "dos pestañas" (mismo
dispositivo) SÍ queda cubierto por 1a.

### 2 (MINOR) — 2xx con cuerpo inesperado

`EnviarOpciones<T>` ganó un campo opcional `validarExito?: (respuesta:
unknown) => boolean`. Si se omite, cualquier 2xx se considera válido
(comportamiento previo, el que siguen usando los tests genéricos del
motor). Los dos formularios ahora lo pasan, validando `ok === true &&
typeof movimientoId === 'string'` (el contrato real de
`app/api/problematicas/parte/route.ts`). Cuando un 2xx no lo cumple, el
motor YA NO vacía la cola: conserva el mismo borrador (misma
idempotencyKey) marcado `estado: 'error'` con
`motivoError: 'respuesta inesperada del servidor'`, y el componente muestra
"No se pudo enviar: respuesta inesperada del servidor" sin acuñar clave
nueva en el próximo intento.

Tests: uno en el motor (cuerpo inesperado no vacía la cola y un reintento
posterior reutiliza la clave) y uno en cada formulario (el mensaje se
muestra, el asistente/formulario sigue editable, y un reintento manual
reutiliza la misma idempotencyKey hasta guardar con éxito).

### 3 (MINOR) — `idempotencyKey` vestigial en los borradores de los formularios

Confirmado por lectura: el `idempotencyKey` de estado de cada formulario
(`useState`) nunca llegaba al POST — `construirCuerpo: (datos,
idempotencyKey) => ({ ...datos, idempotencyKey })` siempre usa el segundo
parámetro (la clave real que decide el motor de envío por tipo+cue), que
pisa cualquier campo `idempotencyKey` que ya viniera en `datos`. Se quitó el
`useState` y sus escrituras en ambos formularios
(`reporte-inicial-form.tsx`, `actualizacion-form.tsx`). El campo del borrador
persistido (`BorradorParteNuevo`/`BorradorParteActualizacion`) pasó a
opcional y `esBorradorParteNuevo`/`esBorradorParteActualizacion` lo aceptan
ausente O string (antes lo exigían) — así un borrador viejo en el
dispositivo del director, que todavía lo tiene, sigue cargando igual; el
campo simplemente se ignora. No se tocó `construirPayloadActualizacion`
(`lib/infraestructura/actualizacion-parte.ts`): sigue pidiendo
`idempotencyKey` por firma (con su propio test que la usa), pero también es
vestigial ahí — `actualizacion-form.tsx` ahora le pasa un
`crypto.randomUUID()` de relleno, comentado explícitamente, ya que
`construirCuerpo` lo pisa igual. Ampliar esa limpieza a
`actualizacion-parte.ts` quedó fuera de alcance (no es "el borrador de los
formularios", es una función de librería con su propio contrato ya
probado).

### 4 (MINOR) — `calcularEsperaReintento` sin uso

Se cableó en `registrarAutoReintento`: el primer evento
`online`/`visibilitychange` de una ráfaga dispara el callback al toque (no
hay motivo para demorar un reintento aislado); los siguientes eventos,
mientras dure la ráfaga, se amortiguan con la misma espera acotada que ya
declaraba `calcularEsperaReintento` (nunca se pierden: siempre queda
programado un `setTimeout` para cuando termine la espera). La limpieza que
devuelve `registrarAutoReintento` cancela cualquier reintento amortiguado
pendiente.

Tests: ráfaga de 4 eventos `online` seguidos dispara sólo 2 veces (el
primero al toque, el resto amortiguado hasta que pasa 1s con
`vi.useFakeTimers()`); la limpieza cancela el reintento amortiguado
pendiente.

### Verificación

| Comando | Resultado |
|---|---|
| `npx vitest run lib/infraestructura/parte/envio-offline.test.ts` | 27 passed (19 previos + 8 nuevos) |
| `npx vitest run components/infraestructura/reporte-inicial-form.test.tsx components/infraestructura/actualizacion-form.test.tsx` | 52 passed (50 previos + 2 nuevos) |
| `pnpm test` | 146 test files, **1174 tests** — exit 0 |
| `pnpm lint` | exit 0, sin hallazgos |
| `pnpm exec tsc --noEmit` | exit 0, sin errores |
| `pnpm build` | exit 0, build completo |

### Archivos tocados en esta corrección

- `lib/infraestructura/parte/envio-offline.ts`
- `lib/infraestructura/parte/envio-offline.test.ts`
- `components/infraestructura/reporte-inicial-form.tsx`
- `components/infraestructura/reporte-inicial-form.test.tsx`
- `components/infraestructura/actualizacion-form.tsx`
- `components/infraestructura/actualizacion-form.test.tsx`

No se tocó `app/api/problematicas/parte/route.ts`, `lib/db/schema.ts` ni
`lib/infraestructura/actualizacion-parte.ts`.

## Gate (N1)

**Decisión: aceptado tras correcciones (2026-09-27).**

- Verificaciones globales tras las correcciones: `pnpm test` 146 archivos / 1174 tests OK; `pnpm lint`, `pnpm exec tsc --noEmit` y `pnpm build` con exit 0. N1 reverificó los tests focalizados del motor de envío.
- Revisión independiente (primera pasada): sin bloqueantes; un hallazgo mayor (doble envío entre pestañas generaba claves de idempotencia distintas) y cuatro menores. Todos corregidos (ver "Correcciones del gate N1"): sección crítica por escuela y tipo con `navigator.locks` y alternativa en memoria, envíos concurrentes unificados, cola que sólo se vacía tras validar la respuesta, campo vestigial retirado con compatibilidad de borradores viejos y amortiguación ante conexión intermitente.
- Confirmado sin defectos: el borrador no guarda contraseña ni tokens, está separado por CUE, se rehidrata tras recargar, 4xx no se reintenta, sesión vencida conserva el borrador, idempotencia de servidor probada con 5 reintentos → un solo parte, estados con `aria-live`.
- Riesgo residual asignado a una corrección de servidor aparte (rama `fix/parte-alta-concurrente`): dos dispositivos que envían casi a la vez el primer parte de un CUE en el período pueden duplicar afectaciones y movimientos, porque la existencia del parte no se reverifica dentro de la transacción.
- Pendiente que se arrastra: recorrido offline con DevTools y operadores reales.
