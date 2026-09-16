# B9 — Verificación integral y entrega

Verificación ejecutada, no solo leída: la app se corrió con `.env` real (secretos generados
localmente para la prueba, descartados al finalizar), fixture de B0 (`scripts/sync-ge.mjs
--fixture`) y `DATA_DIR` apuntando a un directorio temporal aislado del repositorio.

## 1. Recorrido completo sobre datos conocidos

CUE de prueba: `1801605-04` (J.I.N. Nº 31 - ESCUELA N° 415, fixture de localizaciones reales).

| Paso | Comando | Resultado |
|---|---|---|
| Fixture GE | `node scripts/sync-ge.mjs --fixture` | `Localizaciones cargadas: 2005`, `Sin cui: 2005`, `Corte activado: 1` |
| Login | `POST /api/auth/sign-in/email` | `200`, sesión admin |
| Contexto por CUE | `GET /api/problematicas/contexto?cue=1801605-04` | `200`, secciones sintéticas (Sala 5 A, 1° A) |
| Persistencia | `POST /api/problematicas` con `cue`, `motivo`, `severidad`, `secciones:[1,2]`, `idempotencyKey` | `201`, `impacto: {alumnos:2, secciones:2, cuis:null, cuiDisponible:false}` |
| Cálculo preliminar vs. confirmado | `POST /api/problematicas/impacto` con las mismas secciones, antes y después de persistir | Mismo resultado exacto — un solo camino de cálculo, confirmado en runtime, no solo por test |
| Mapa protegido | `GET /api/mapas/infraestructura` (con sesión) | `200`, payload sin datos nominales; `inmuebles: null, inmueblesDisponible: false` |
| Alcance nominal sin grant | `GET /api/infraestructura/nominal?problematica=...` (admin sin grant) | `403 No tenés acceso a este recurso` — confirma que `puedeVerNominal` no mira `user.role` |
| Otorgar grant | `POST /api/infraestructura/nominal/permisos` | `201` |
| Alcance nominal con grant | `GET /api/infraestructura/nominal?problematica=...` | `200`, `cantidad: 2`; fila nueva en `infra_acceso_nominal_log` verificada por consulta directa a `hub.sqlite` |

**Limitación encontrada, no un defecto**: con datos de fixture, `alumnos` en la respuesta nominal
viene siempre vacío (`[]`). `scripts/sync-ge.mjs --fixture` genera secciones y membresías
sintéticas pero **no genera identidades** (`ge_alumno_identidad`), así que no hay payload cifrado
para descifrar. Es coherente con lo ya declarado: identidades reales llegan con B8.

## 2. Regresiones

| Área | Verificación | Resultado |
|---|---|---|
| Login | `sign-in/email` con usuario admin | `200` |
| Mapa de matrícula | `/mapas/matricula` con y sin sesión | `307` sin sesión, `200` con sesión (vía navegación de página) |
| Catálogo / audiencias | `POST /api/taxonomia/audiencias` | responde (rechaza `kind` inválido con `400`, comportamiento esperado) |
| Administración de usuarios | `GET /api/usuarios` (admin) | `200`, lista al usuario creado |
| Visor de recursos | `GET /recursos/r1` | `307` hacia la ruta real del recurso (`redirect(row.ruta)`) — comportamiento por diseño, no una regresión |
| Rutas protegidas sin sesión | `/admin`, `/mapas/matricula`, `/mapas/infraestructura` | `307` (redirect a login) |
| Rutas públicas | `/`, `/login`, `/explorar`, `/problematicas/nueva` | `200` |

## 3. `pnpm test`, `pnpm lint`, `pnpm build`

```
$ pnpm test
 Test Files  47 passed (47)
      Tests  309 passed (309)

$ pnpm lint
$ eslint .
(sin salida — limpio)

$ pnpm build
✓ Compiled successfully in 4.5s
✓ Generating static pages using 15 workers (12/12)
```

El build emite `BetterAuthError: You are using the default secret` (~14-19 veces, varía por
ejecución). **Es preexistente**, verificado por Opus corriendo el build en la rama anterior a
estos batches, y proviene de no tener `.env` con `BETTER_AUTH_SECRET` configurado en el worktree
al momento del build. No se corrige acá — es ruido de entorno, no del código de este batch.

## 4. Despliegue con `DATA_DIR` — persistencia ante reinicio

Con `DATA_DIR` apuntando a un directorio fuera del repo:

1. Se corrió el fixture, se creó una alerta y se otorgó un grant nominal.
2. Se mató el proceso del servidor y se lo volvió a levantar contra el mismo `DATA_DIR`.
3. Verificado tras el reinicio: la sesión, la alerta en `/api/mapas/infraestructura` y el grant en
   `/api/infraestructura/nominal` siguieron respondiendo igual que antes del reinicio.
4. Se volvió a correr `node scripts/sync-ge.mjs --fixture` (simulando una resincronización en un
   redeploy). El corte anterior (`id 1`) pasó a `estado: 'historico'` — **no se borró** — y el
   nuevo corte (`id 2`) quedó `'vigente'`. La alerta original, referenciada contra el corte viejo,
   se siguió sirviendo intacta desde `/api/mapas/infraestructura`. Cumple la regla transversal de
   Cortes: "un corte referenciado por una alerta no se borra".

Ninguna importación fue destructiva: no hubo pérdida de alertas, cortes ni grants en ningún punto.

## 5. Copia consistente de `hub.sqlite` — migraciones aditivas y reversión

1. Se detuvo el servidor y se copió `hub.sqlite` + `ge.sqlite` + `uploads/` a un directorio aparte
   (copia consistente, sin escritura concurrente).
2. Se armó un worktree en el commit previo al merge de `feat/alerts` (`616a4a8`, la base de B0–B7)
   y se lo hizo correr (`pnpm build` + `next start` standalone) apuntando su `DATA_DIR` a esa
   copia.
3. La app vieja (sin ninguna ruta ni tabla de infraestructura) **levantó sin errores** contra la
   copia, sirvió login, `/api/usuarios` y `/mapas/matricula` con normalidad.
4. Tras apagar la app vieja, se confirmó por consulta directa a la copia de `hub.sqlite` que los
   registros nuevos seguían intactos: `problematicas: 1, secciones: 2, permisos: 1, logs: 2`.

Esto confirma que el DDL de este batch es aditivo (`CREATE TABLE IF NOT EXISTS`) y que una
reversión de la aplicación a una versión anterior **no destruye** registros nuevos — la app vieja
simplemente ignora las tablas que no conoce. No se restauró ninguna copia antigua encima de datos
nuevos; la copia se usó solo como entorno de prueba aislado.

## 6. Lo que queda pendiente — declarado explícitamente

- **B8 (integración real con Gestión Educativa) no se ejecutó.** No hay credenciales de GE en
  `.env.example` ni en el entorno de este worktree. El sistema corre contra
  `scripts/sync-ge.mjs --fixture`: las localizaciones son reales (2005 registros de
  `public/data/localizaciones.json`), pero secciones, membresías e identidades son sintéticas.
- **`cui` es `NULL` en los 2005 registros de localización.** Ninguna fuente del repo lo provee.
  El recuento de inmuebles se informa como **no disponible** (`inmuebles: null,
  inmueblesDisponible: false`), verificado en runtime en el payload del mapa y en el impacto de
  cada problemática — nunca como cero. Llega con B8.
- **La respuesta del alcance nominal siempre trae `alumnos: []` bajo datos de fixture**, porque el
  fixture no genera identidades cifradas. No es un defecto de B9: es consecuencia directa de que
  B8 no corrió. Con datos reales de GE, `ge_alumno_identidad` se poblaría y la lista dejaría de
  estar vacía.
- **Verificación manual del formulario B4 en viewport de teléfono: NO realizada.** Se intentó con
  las herramientas de automatización de navegador disponibles en este entorno de trabajo. La app
  se levantó y respondió correctamente por `curl` (`GET /problematicas/nueva?cue=1801605-04` →
  `200`), pero el navegador de las herramientas de automatización corre en un sandbox sin acceso
  de red al worktree (`ERR_CONNECTION_REFUSED` contra `localhost` y contra el hostname de la
  máquina). Es una limitación del entorno de verificación, no evidencia de que el formulario
  funcione o falle en un teléfono real. Se declara pendiente, igual que lo hizo el líder de B4.

## 7. Fuera de alcance — no se agregó nada de esto

Rol Director, selector de CUE, SSO, alta de usuarios, asignación de responsables, moderación
previa, predicciones, notificaciones, exportación de datos nominales, adjuntos, operación sin
conexión, actualización o finalización de una problemática.

## 8. Cambios de código de este batch

Ninguno. B9 es verificación: no se encontraron defectos introducidos por B0–B7 que ameritaran una
corrección. El único hallazgo (`alumnos: []` bajo fixture) es consecuencia esperada de B8 no
ejecutado, no un bug de este batch.
