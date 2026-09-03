# Batch 0 — Contrato de navegación y cobertura: entrega

> Requisito: `docs/navigation-batches/batch-00-contrato-y-cobertura.md`.
> Alcance: red de seguridad de navegación. **No** se cambió comportamiento productivo:
> ninguna ruta, redirect, gate, ACL ni visor fue modificado en su comportamiento.

## 1. Contrato de navegación (formalizado)

| Mecanismo | Cuándo usarlo | Dónde ocurre hoy |
| --- | --- | --- |
| `router.push` | Cambio de contexto intencional que el usuario espera recorrer con Back (entidad, recurso, sección principal, búsqueda enviada). | Explore `update()` (`components/explore-page.tsx`), menu de cuenta, admin. |
| `router.replace` | Normalización o microestado navegable: canonicalización de filtros, redirect post-login, limpieza de filtros. No debe crear entradas de historial por cada tecla. | `components/explore-page.tsx` (canonicalize), `app/login/page.tsx` (post-signin). |
| `history.replaceState` | Estado frecuente de un visor (cámara de mapa) que no debe renderizar una nueva ruta ni contaminar el historial. | Pendiente Batch 5. |
| Ruta real | Cambio de entidad o sección principal; el shell y el contexto se mantienen dentro del App Router. | `/recursos/[id]`, `/mapas/matricula`, `/admin`, `/explorar`. |
| Estado local | Modal, panel o interacción sin valor como deep link (detalles del recurso, menús, sheet de filtros). | `app-shell.tsx` (detalles), `explore-filters-sheet.tsx`. |
| `<a>` documental | Descarga, recurso externo o fallback documental explícito (archivos legacy y visores fuera del shell). | `components/recurso-viewer.tsx`, fallback legacy gated. |

Regla transversal: la autorización vive en servidor (gate + server components); el cliente solo decide *a dónde* navegar, nunca *si* puede.

## 2. Matriz de rutas cubierta

| Ruta | Protección | Tipo | Comportamiento esperado | Cobertura |
| --- | --- | --- | --- | --- |
| `/` | Pública | Ruta real | Catálogo/Home, 200. | Smoke + `middleware.test.ts` (passthrough) |
| `/explorar` | Pública | Ruta real | Explore, 200. | Smoke + `middleware.test.ts` |
| `/explorar?...` filtros válidos | Pública | Ruta real | Filtra; URL canónica estable. | `explore-filters.test.ts` |
| `/explorar?...` filtros inválidos/desconocidos | Pública | Ruta real | Se descartan y se canonicaliza con `replace`. | `explore-filters.test.ts` |
| `/reportes` | Pública | Redirect (documental) | 307 → `/explorar?formato=reporte`. | Smoke + `middleware.test.ts` |
| `/tableros` | Pública | Redirect (documental) | 307 → `/explorar?formato=tablero`. | Smoke |
| `/mapas` | Pública | Redirect (documental) | 307 → `/explorar?formato=mapa`. | Smoke |
| `/recursos/:id` (ficha) | Sesión + ACL | Ruta real SPA | Anónimo → login con callback; sin permiso → forbidden; inexistente → 404; con ruta legacy → redirect documental. | `app/recursos/[id]` (lectura de página, manual), handler gate |
| `/recursos/:file.pdf` / `.html` | Sesión + ACL | Documental gated | Middleware reescribe a `/api/gate`; anónimo → login con callback completo; archivo permitido → stream MIME/headers. | `middleware.test.ts` + `route.test.ts` |
| `/mapas/matricula` | Sesión + ACL | Ruta real SPA | Anónimo → login callback; sin permiso → forbidden. | Smoke (anon) + `route.test.ts` + lectura de página (manual con sesión) |
| `/tablero`, `/mapa_interactivo`, `/mapa_sobreedad`, `/mapa_notas` (raíz) | Sesión + ACL | Documental legacy | Middleware reescribe; anónimo → login con callback. | `middleware.test.ts`, `route.test.ts`, Smoke |
| Legacy anidados + assets | Sesión + ACL | Documental legacy | Prefijos anidados también reescritos; query preservada. | `middleware.test.ts`, Smoke |
| Legacy inexistentes | Sesión + ACL | Documental | Recurso sin fila → 404; archivo no presente → 404. | `route.test.ts` |
| Traversal / ruta no permitida | Servidor | Documental | `publicAbsPath` rechaza `..`, backslash y NUL; handler nunca sirve fuera de `public/`. | `gate-static.test.ts` + `route.test.ts` |
| `/admin` | Sesión + staff | Ruta real SPA | Anónimo → login `callbackUrl=/admin`; consulta/banned → forbidden; editor/admin → ok. | Smoke (anon) + `acl.test.ts` (`adminPageGate`) + manual con sesión |
| `/login?callbackUrl=` válido | Pública | Ruta real SPA | Callback app-relative se conserva (con query/hash). | `nav.test.ts` (`normalizeLoginCallbackUrl`), `resource-href.test.ts` |
| `/login?callbackUrl=` vacío/externo/protocol-relative | Pública | Ruta real SPA | Cae a `/`. | `nav.test.ts` |
| `/forbidden` | Pública | Ruta real | 200, enlace de salida. | Smoke |
| 404 | Pública | — | Ruta desconocida → 404. | Smoke |

## 3. Helpers ampliados

- `gatedStaticPath` — query/hash, trailing slash, extensiones case-insensitive, nombres codificados, entradas inválidas.
- `isStaticHref`, `isReadyHref`, `isMapViewerPath`, `isBleedViewerPath` — nuevos casos (raíz, anidados, `/recursos/[id]`, alias, query).
- `resourceCardTarget` / `resourceCardHref` — ids codificados, ruta con query/hash/slash, callbacks con caracteres especiales, targets inválidos.
- Callback URL — extracción behavior-preserving de `normalizeLoginCallbackUrl` (`app/login/page.tsx` ahora la usa); `gateLoginCallbackUrl` cubre hash y multi-valor.

## 4. Middleware y gate

- `middleware.test.ts` — rewrite a `/api/gate/...` para todos los prefijos gated (raíz, anidado, archivo), preservación de query, `NextResponse.next()` para rutas App Router, y contrato del `matcher`.
- `app/api/gate/[...path]/route.test.ts` — anónimo → login con callback completo, sin permiso → forbidden, recurso inexistente → 404, archivo permitido → stream con MIME/headers correctos, y rechazo de rutas que escapan de `public/`.

## 5. E2E (bloqueado por red)

`@playwright/test` **no pudo instalarse**: el registry npm responde con `ETIMEDOUT` en `playwright-core` y dependencias (verificado 2 veces; el ping al registry tarda 15 s). Chrome local existe (`/usr/bin/google-chrome`), pero sin el paquete no hay runner.

**Decisión:** no se dejan archivos E2E que importen una dependencia ausente (código muerto no ejecutable). Se incorporó en su lugar:

- `scripts/smoke-nav.mjs` — smoke documental **cero dependencias** (solo `fetch` de Node) que verifica la matriz anónima a nivel HTTP: 200/404, alias, gate→login con callback, legacy. Ejecutable con la app levantada:
  ```bash
  pnpm build && pnpm start   # en otra terminal
  node scripts/smoke-nav.mjs http://localhost:3000
  ```

**Casos que quedan manuales hasta poder ejecutar Playwright** (con justificación):

| Caso | Justificación |
| --- | --- |
| Inicio → Explore → recurso → Back (SPA sin reload) | Requiere navegador real + sesión. La lógica de target/href/callback está cubierta por unit tests. |
| Anónimo → Login → login efectivo → callback solicitado | Requiere navegador + credenciales sembradas. La generación y normalización del callback está cubierta por tests. |
| Acceso denegado con sesión → `/forbidden` | Requiere navegador + usuario sin permiso. El redirect está cubierto por `route.test.ts` y `acl.test.ts`. |
| Navegación App Router sin reload documental | Requiere navegador real (evento `load`). Se detecta con listener de `page.on('load')` en Playwright cuando esté disponible. |

## 6. Validación ejecutada

| Comando | Resultado |
| --- | --- |
| `pnpm test` | 23 files / 189 tests OK (baseline 21/157 → +32) |
| `pnpm lint` | OK (sin warnings) |
| `pnpm build` | OK, 23 rutas, Proxy middleware compilado |
| `node scripts/smoke-nav.mjs` | Pendiente en el momento de escribir esta fila; ver abajo |

## 7. Archivos modificados (lista exacta)

- `lib/nav.ts` — helper `normalizeLoginCallbackUrl` (extracción behavior-preserving).
- `app/login/page.tsx` — usa el helper extraído; comportamiento idéntico.
- `lib/nav.test.ts` — ampliado (gatedStaticPath, isReadyHref, isStaticHref, isMapViewerPath, isBleedViewerPath, normalizeLoginCallbackUrl).
- `lib/resource-href.test.ts` — ampliado (encoding, query/hash, targets inválidos, callbacks).
- `lib/gate-static.test.ts` — ampliado (lookup, traversal/backslash/NUL, MIME, callback con hash).
- `middleware.test.ts` — **nuevo**: contrato del middleware y del matcher.
- `app/api/gate/[...path]/route.test.ts` — **nuevo**: flujos del gate (login/forbidden/404/stream/traversal).
- `scripts/smoke-nav.mjs` — **nuevo**: smoke documental cero dependencias.
- `docs/navigation-batches/batch-00-entrega.md` — este documento.

No modificados (requisito): `next-env.d.ts`, `.atl/`. Sin cambios en comportamiento productivo.