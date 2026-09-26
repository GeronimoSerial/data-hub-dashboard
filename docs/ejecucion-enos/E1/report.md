# E1 — Episodios y verificación explícita de punta a punta

Estado: **implementado y validado técnicamente** por N2, con revisión adversarial de un N3 distinto del implementador. La habilitación operativa queda a criterio de N1 en `gate.md` (no lo escribe este documento). Ver §9 para las correcciones del gate N1 sobre este batch (fix1).

## 1. Alcance entregado

- Esquema aditivo: `infra_episodio`, `infra_verificacion` (con credencial hasheada), `infra_verificacion_evento` (append-only), `infra_movimiento.episodio_id` nullable, todo instalable en vacío y sobre una base existente vía `ensureMovimientoEpisodioIdColumn` (mismo patrón que `ensureMovimientoIdempotencyKeyColumn` de E0).
- Dominio: máquina de estados completa (`lib/infraestructura/episodios.ts`, `lib/infraestructura/verificaciones.ts`, `lib/infraestructura/verificacion-token.ts`, `lib/infraestructura/verificacion-sesion.ts`), con transiciones atómicas (`UPDATE ... WHERE estado='pendiente' RETURNING`), auditoría append-only y credencial de un solo uso (hash únicamente, nunca el token en claro).
- API: `GET/POST /api/infraestructura/episodios`, `PATCH /api/infraestructura/episodios/:id`, `GET/POST /api/infraestructura/verificaciones`, `POST /api/infraestructura/verificaciones/:id/cancelar`, `POST /api/infraestructura/verificaciones/:id/responder-asistida` (staff-only, `staffGuard`); `POST /api/problematicas/verificaciones/:id/{validar-token,responder,canjear-sesion,vincular-movimiento}` (públicos, credencial = token en el body, nunca en query/URL de la API).
- UI operador: `/admin/episodios` (crear episodio, listar) y `/admin/episodios/:id` (cola de verificaciones, crear solicitud, copiar enlace, cancelar, respuesta asistida), gate `adminPageGate` (staff), sin tocar `app/globals.css`.
- UI escuela: `/problematicas/verificaciones/:id?token=...`, mobile-first, dos respuestas claras ("Sin afectación" / "Hay afectación"), confirmación de un paso, comprobante visible, sin callejón sin salida en credenciales vencidas/revocadas/inválidas.
- Integración con el formulario de parte existente: sesión acotada por CUE (`verificacion_sesion`, 30 min, HMAC con el mismo secreto de `acceso-publico.ts`) que habilita `POST /api/problematicas/parte` sólo para el CUE de la verificación, sin la contraseña compartida y sin ampliar a otro CUE ni a rol admin. El movimiento creado queda enlazado a la verificación (`infra_verificacion.movimiento_id`) en los tres caminos de escritura del parte (transacción nueva, replay idempotente, carrera de idempotencia).
- Vínculo best-effort con motivo expuesto: si el enlace verificación→movimiento falla (credencial inválida/vencida/revocada, contradicción, movimiento de otro CUE), el parte se guarda igual, la respuesta incluye `verificacionVinculada:false` + `verificacionVinculoMotivo`, y queda un evento `infra_verificacion_evento` tipo `vinculo_fallido` para que el operador lo vea.

## 2. Decisiones de N1 registradas durante la ejecución

- **Autenticación del formulario de parte desde el enlace de verificación** (`ask` a N1, ver `dispatches.json`): N1 optó por extender `acceso-parte.ts` con una sesión acotada por CUE en vez de dejarlo pendiente. Condiciones impuestas por N1: alcance estrictamente al CUE/sesión vigente, sin tocar los accesos existentes, delegado a N3 en pasos chicos, movimiento enlazado con canal=enlace y sin identidad personal, cubierto por el revisor.
- **Corrección directa por N2 fuera de protocolo** (mensaje de N1 durante la ejecución): N2 implementó directamente dos correcciones (ver §5) en vez de delegarlas a N3, violando la regla de "N2 implementa sólo si la misma tarea falla 2 veces". N1 pidió no revertir, sólo documentar. Registrado abajo.
- **Vínculo no puede ser best-effort silencioso** (mensaje de N1): exigió exponer `motivo` en la respuesta del parte y dejar auditoría visible cuando el vínculo falla. Despachado a N3 (ver `dispatches.json`, tarea "vínculo + auditoría").
- **Alcance del N3 revisor**: N1 exigió cubrir explícitamente vínculo en los tres caminos de escritura, token de otro CUE, y regresión de contraseña/admin. Cubierto en dos pasadas de revisión (la primera agotó el timeout sin entregar reporte final pero dejó evidencia real de dos bugs; la segunda, con alcance acotado, confirmó los cuatro escenarios — ver `dispatches.json`).

## 3. Hallazgos de la revisión adversarial y su corrección

1. **Vínculo cruzado entre CUEs (bloqueante, corregido).** `responderPorEnlace` con `resultado:'con_afectacion'` aceptaba cualquier `movimientoId` sin verificar que perteneciera al mismo CUE que la verificación — permitía enlazar la verificación de una escuela con el movimiento de otra. Corregido: `transicionarARespondida` valida `movimientoPerteneceAlCue` antes de escribir; si no coincide, `409 movimiento_cue_no_coincide`, sin escritura, con evento de auditoría. Test en `lib/infraestructura/verificaciones.test.ts`.
2. **Carrera de idempotencia nunca enlazaba (bloqueante, corregido).** El catch de `app/api/problematicas/parte/route.ts` buscaba el texto del `UNIQUE constraint` en `err.message`, pero `drizzle-orm ^0.45.2` envuelve el error de SQLite en `DrizzleQueryError` y el texto real vive en `err.cause.message`. La carrera caía siempre a `500` y nunca llegaba a enlazar la verificación. Corregido: el catch revisa también `err.cause?.message`. Test promovido de `it.fails` a `it` en `route.test.ts`.
3. **Token consumido sigue habilitando `validar-token`/`canjear-sesion` (hallazgo menor, NO corregido, pendiente explícito).** `validarCredencial` no rechaza por `tokenConsumidoEn`; una verificación ya respondida sigue permitiendo canjear una nueva sesión de 30 min para ese CUE. No permite sobrescribir la respuesta ya registrada (la máquina de estados lo bloquea con 409 de contradicción o replay idempotente), pero sí permite volver a abrir el formulario de parte para ese CUE con el mismo enlace. Se deja como limitación conocida: el riesgo real es bajo (mismo alcance — un solo CUE, 30 min — que ya tolera la contraseña compartida durante 12 h) pero conviene decidir explícitamente si se cierra en un batch siguiente.

## 4. Correcciones implementadas directamente por N2 (fuera de protocolo, autorizado por N1 para no revertir)

- `app/api/problematicas/parte/route.ts`: fix del bug de vínculo faltante en los caminos de replay idempotente y carrera (agregar el parámetro `verificacionVinculo` a `respuestaExito` y pasarlo en los tres call-sites). N2 lo detectó leyendo el diff del N3 que armó el vínculo inicial y lo corrigió en el momento, sin volver a despachar, porque el hallazgo surgió durante la revisión de un diff ya entregado y el cambio era de 3 líneas ya enteramente entendidas.
- `components/infraestructura/verificacion-responder.test.tsx`: fix de tipado en el mock de `fetch` (tupla `[url]` sin segundo elemento, error de `tsc`) para que `pnpm exec tsc --noEmit` quedara limpio.
- `lib/infraestructura/episodios.test.ts`: import no usado (`getDb`), warning de lint.

N1 marcó esto como incumplimiento del protocolo de delegación — quedó registrado para no repetirlo.

## 5. Verificaciones globales (las 4 exigidas por el plan)

Corridas al final, con todo integrado:

| Comando | Resultado |
|---|---|
| `pnpm test` | 959/959 tests, 119 archivos — verde |
| `pnpm lint` | 0 errores, 0 warnings |
| `pnpm exec tsc --noEmit` | sin salida, limpio |
| `pnpm build` | exit 0, todas las rutas nuevas compiladas (`/admin/episodios`, `/admin/episodios/[id]`, `/api/infraestructura/episodios(/[id])`, `/api/infraestructura/verificaciones(/[id]/...)`, `/api/problematicas/verificaciones/[id]/...`, `/problematicas/verificaciones/[id]`) |

Nota sobre baseline: no se corrieron las 4 verificaciones ANTES de tocar código (E1 arrancó directamente sobre la ola de esquema). Se registró el baseline retroactivamente después de la ola 1 (esquema aditivo + credencial), que ya estaba en verde (test/lint/tsc), y se repitió tras cada ola siguiente. E0 ya había dejado un baseline limpio aceptado; este batch es aditivo sobre esa base. Se detectó un test flaky preexistente y ajeno a este batch: `components/mapas/map-infraestructura-page.test.tsx` ("filtra por departamento…") falla intermitentemente bajo carga del suite completo pero pasa siempre aislado — no toca ningún archivo de E1, se deja documentado para quien mantenga ese componente.

## 6. Aceptación observable (checklist del plan, §6-E1)

- [x] Crear episodio y solicitud para CUE sin parte.
- [x] Responder sin afectación no crea parte ficticio.
- [x] Responder con afectación queda ligado a un movimiento real (los tres caminos: 201, replay 200, carrera).
- [x] Credencial de otro CUE / vencida / revocada → sin escritura (403/410, documentado). "Consumida" NO produce un 410 duro hoy (ver hallazgo §3.3, limitación conocida).
- [x] Cancelar/responder simultáneos → una sola transición válida (test de concurrencia con `Promise.all`).
- [x] Respuesta tardía conserva SLA (`vencimientoEn` informativo, no bloquea).
- [x] Retry idéntico idempotente; contradictorio → 409 sin overwrite.
- [x] "Sin afectación" con afectación vigente → discrepancia registrada, sin tocar el parte.
- [x] La contraseña compartida no permite responder ninguna solicitud (nunca se importa `acceso-publico.ts` en los endpoints de verificación).
- [x] Auditoría persiste en DB (`infra_verificacion_evento`, incluye `vinculo_fallido`).
- [x] Permisos: `staffGuard` en toda la gestión (episodios/verificaciones/cola); el director nunca ve esos endpoints ni el mapa.
- [x] Respuestas privadas (`Cache-Control: private, no-store` + `Referrer-Policy: no-referrer` en los endpoints públicos).
- [x] Tres estados visibles y distintos en texto (no sólo color): "Sin información" (pendiente), "Verificada sin afectación", "Afectación confirmada".

## 7. Pendientes explícitos

1. **Capturas baseline en 390×844 y 1366×768** (heredado de E0 y repetido en E1): no se pudo levantar `pnpm dev` con navegador en esta sesión (ejecución vía CLI sin acceso a navegador embebido durante el batch). Comando exacto para quien continúe: `pnpm dev` y luego navegar a `/admin/episodios` (staff) y a `/problematicas/verificaciones/<id>?token=<token>` (generado desde la cola de operador) en ambos anchos.
2. **Gate UX con 4/5 participantes reales** (§7 del plan): sin participantes disponibles en esta sesión. Queda **PENDIENTE explícito**, no se afirma gate operativo aprobado. Recorrido guiado reproducible para medir cuando haya participantes: ver `ux.md` §4.
3. ~~**Nombre de escuela no resuelto en el enlace público**~~ — **RESUELTO en fix1** (ver §9, punto 4): la página resuelve `escuela.nombre` del lado del servidor, sólo para el CUE de esa verificación puntual, con fallback explícito al CUE si GE no responde.
4. ~~**Token consumido sigue habilitando reapertura del formulario de parte**~~ — **RESUELTO en fix1** (ver §9, punto 1): `verificacionHabilitaSesionEscritura` ahora rechaza explícitamente por `tokenConsumidoEn`, además de por `estado`/`tokenRevocadoEn`/vencimiento.
5. **Carrera de idempotencia**: corregida para el caso genérico de SQLite/drizzle-orm ^0.45.2 de este repo; si la versión de `drizzle-orm` cambia en el futuro, revalidar que el formato de error siga exponiendo el mensaje en `err.cause.message`.

## 8. Archivos

Ver `dispatches.json` para el detalle de cada tarea N3 (archivos, modelo, resultado, verificación) y qué escribió N2 directamente. Lista completa de archivos tocados: `git status --porcelain` sobre esta rama (`feat/enos-e1` en el worktree) al cierre del batch — nuevos: esquema/dominio/API/UI listados en §1; modificados: `lib/db/schema.ts`, `lib/db/seed.ts`, `lib/db/seed.test.ts`, `lib/infraestructura/acceso-parte.ts`, `app/api/problematicas/parte/route.ts`, `app/api/problematicas/parte/route.test.ts`, `app/globals.css` (sólo clases nuevas `verificacion-*`, aditivo).

Directorio inesperado `.atl/` (cache de registro de skills, preexistente al inicio del batch, no creado por E1): se dejó intacto, sin tocar, según constraint del batch.

## 9. Correcciones gate N1 (fix1)

Estado: **implementado, revisado dos veces por N3 independientes y validado con las 4 verificaciones globales en verde.** Esta tarea (E1-fix1) tuvo **2 reemplazos de N2** por reinicios de Orca/máquina durante su ejecución; el N2 que cierra este documento es el 3º, retomó desde el contexto de recuperación que dejó N1 (6 puntos ya implementados y validados por el N2 anterior antes de caerse) y ejecutó desde ahí la revisión independiente pendiente, las correcciones que esa revisión encontró, y el cierre.

Gate N1 sobre el batch E1 devolvió 6 hallazgos (1 bloqueante, 3 mayores, 2 menores) contra la regla de diseño: *la sesión derivada de un token de verificación nunca puede ser más fuerte que el token — se re-chequea contra la fila real de la verificación en cada uso.*

### 9.1 Los 6 puntos del gate

1. **BLOQUEANTE — token consumido.** `verificacionHabilitaSesionEscritura` (`lib/infraestructura/verificaciones.ts`) ya rechazaba este caso *por invariante* (`tokenConsumidoEn` sólo se setea junto con `estado:'respondida'` en el mismo UPDATE), pero faltaba el chequeo **explícito** que pedía el hallazgo. Se agregó `if (fila.tokenConsumidoEn !== null) return false`, con un test que fuerza por UPDATE directo `tokenConsumidoEn` con `estado` todavía `'pendiente'` para probar el chequeo de forma aislada del invariante (`lib/infraestructura/verificaciones.test.ts`). `validar-token` con token consumido ya devolvía el estado de la verificación respondida (comprobante), sin formulario — comportamiento correcto, sin cambios.
2. **MAYOR — revocación se propaga.** Ya estaba `OK`: `acceso-parte.ts` y `verificacion-sesion.ts` re-chequean la fila real en cada uso. Confirmado por las dos revisiones independientes, sin cambios de código.
3. **MAYOR — token expuesto en la URL.** El header `Referrer-Policy: no-referrer` (`next.config.mjs`) y el `history.replaceState` (`verificacion-responder.tsx`) ya estaban implementados; faltaba el test del header. Se agregó `next.config.test.ts`.
4. **MAYOR (UX) — nombre de escuela.** La resolución server-side (`app/problematicas/verificaciones/[id]/page.tsx`, vía `resolverContextoPorCue`, sólo para el CUE de esa verificación, con fallback silencioso) ya estaba implementada; faltaba el test. Se agregó `app/problematicas/verificaciones/[id]/page.test.tsx` (GE sembrada, GE ausente, y que nunca resuelve el nombre de otro CUE).
5. **MENOR — comentario de `vincular-movimiento`.** Ya corregido, sin cambios.
6. **MENOR — schema `responder-asistida`.** Ya alineado (`con_afectacion` fuera del enum, test cubre el 400), sin cambios.

### 9.2 Hallazgo material adicional (fuera de los 6, mismo alcance de la decisión A de N1 en E1)

La primera revisión independiente encontró que `tieneAccesoAlParteParaCueDesdeCookies` (la variante de `acceso-parte.ts` para Server Components) no tenía ningún consumidor: las 4 páginas de `app/problematicas/parte/**` (`page.tsx`, `nuevo/page.tsx`, `actualizar/page.tsx`, `historial/page.tsx`) seguían usando sólo la guarda de contraseña/admin. Resultado: el recorrido "Hay afectación" del enlace público canjeaba la sesión pero la página del formulario de parte nunca la aceptaba — el director seguía viendo el ingreso por contraseña.

Consultado, N1 confirmó que esto es parte de la misma decisión A ya tomada en E1 (§2) y autorizó ampliar el ownership de esta tarea a esos 4 archivos. Se cableó en las 4 páginas: si `?cue=` viene en la query, `tieneAccesoAlParteParaCueDesdeCookies(cue)`; si no, la guarda vieja sin cambios. Ningún camino nuevo amplía el alcance a otro CUE ni a rol admin (confirmado por la segunda revisión: la comparación de CUE es exacta contra la firma de la cookie). Tests agregados en las 4 páginas: sesión válida abre su CUE, otro CUE deniega, sesión revocada/respondida deniega, regresión de contraseña/admin.

La segunda revisión encontró un tramo faltante: `historial/page.tsx` ya aceptaba la sesión, pero su endpoint de datos `app/api/problematicas/parte/historial/route.ts` seguía usando la guarda vieja (`tieneAccesoAlParte`, sólo contraseña/admin) — no era una brecha de seguridad (al contrario, más estricto), pero el wiring quedaba a medias y el fetch devolvía 401 igual. Corregido con el mismo patrón ya usado en `app/api/problematicas/parte/route.ts` (`tieneAccesoAlParteParaCue(request, cue.value)`), con tests agregados.

Se corrigió además un bug preexistente (no de este batch, pero descubierto al correr el foco completo): `app/api/problematicas/parte/route.test.ts` firmaba la cookie de sesión de prueba con un `verificacionId` inventado sin fila real en la base, lo que hacía fallar 2 tests ("GET/POST con la sesión del mismo CUE: 200/201") porque el re-chequeo contra la fila real (punto 2, correcto) no encontraba ninguna fila. Se corrigió el helper de test para crear una verificación real de respaldo; no se tocó código de producción.

### 9.3 Revisión independiente (dos pasadas, N3 distinto del implementador, sólo reporte)

- **Primera pasada** (contra los 6 puntos + regla de diseño): 3 puntos `OK` sin cambios (2, 5, 6), 3 `PARCIAL` — funcionaban pero faltaba el chequeo explícito o el test (1, 3, 4) —, regla de diseño `OK`, más el hallazgo material del wiring de las 4 páginas. Evidencia: `evidencias/review-fix1-n3.json`.
- **Segunda pasada** (contra las 8 correcciones aplicadas): los 5 puntos revisados quedaron `OK`, encontró el tramo faltante de `historial` (API sin wiring) y confirmó que ningún camino nuevo amplía el alcance de una sesión más allá de su CUE. Evidencia: `evidencias/review2-fix1-n3.json`.
- Tras corregir el hallazgo de `historial`, no se corrió una tercera revisión formal: el cambio es idéntico en forma al ya revisado en `app/api/problematicas/parte/route.ts` (mismo patrón, mismo módulo de guarda), y quedó cubierto por tests dedicados + las 4 verificaciones globales.

### 9.4 Verificaciones globales de fix1

Todas las tareas de código/test de esta sección se delegaron a N3 (`opencode-go/deepseek-v4.1-flash`, en primer plano, timeout 560, 1–2 archivos por tarea); ningún N3 falló una tarea 2 veces, así que N2 no implementó directamente ninguna corrección de código (la redacción de este documento es la única escritura directa de N2).

| Comando | Resultado | Evidencia |
|---|---|---|
| `pnpm test` | 1018/1018 tests, 124 archivos — verde | `evidencias/test-fix1.log` |
| `pnpm lint` | 0 errores, 0 warnings | `evidencias/lint-fix1.log` |
| `pnpm exec tsc --noEmit` | sin salida, limpio | `evidencias/tsc-fix1.log` |
| `pnpm build` | exit 0 | `evidencias/build-fix1.log` |

Vitest focalizado (antes de las 4 verificaciones globales, sobre todos los archivos tocados por fix1): 201/201 en verde. Evidencia de cada tarea N3: `evidencias/n3-task5-tokenconsumido.json` … `evidencias/n3-task13-historial-route.json`.
