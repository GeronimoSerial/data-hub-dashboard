# Batch 2 — Visor legacy `/tablero`: entrega

Requisito: `docs/navigation-batches/batch-02-visores-legacy.md`.

## Decisión y contrato

Se eligió `/tablero` como único piloto. Es el visor legacy más representativo
del catálogo: `public/tablero/index.html` es un documento completo con CSS,
datos y JavaScript inline, controles/formularios, exportación CSV mediante
`Blob`/descarga, enlaces internos a otros visores y dependencias remotas de
Leaflet/Leaflet Heat y tiles de OpenStreetMap. El inventario no encontró assets
locales separados que requirieran otro pipeline; los bytes se mantienen sin
reescribir.

`resourceContent` modela explícitamente cinco contenidos:

El piloto sólo se reconoce cuando coinciden el id `r2`, el storage key exacto
`r2/seed` y `mime: text/html`. Un reemplazo administrativo de `r2` —incluido
otro HTML o un PDF— conserva la presentación almacenada normal y no hereda el
fallback ni el sandbox del piloto.

| Tipo | Presentación | Fuente | Estado en Batch 2 |
| --- | --- | --- | --- |
| `legacy-pilot` | iframe aislado en la ficha | `/api/recursos/r2/archivo` | Piloto `/tablero` |
| `stored` | `RecursoViewer` existente | `/api/recursos/:id/archivo` | Conservado |
| `react-route` | CTA a ruta React validada | `/mapas/*` | Conservado |
| `legacy-route` | CTA a ruta histórica validada | ruta legacy permitida | No migrado |
| `missing` | sin presentación | datos incompletos/no permitidos | Seguro |

El modelo decide presentación, no autorización. El iframe reutiliza la ruta de
archivo autenticada y autorizada existente; el gate de archivo conserva 401,
403 y 404. Para que el fallback histórico `/tablero` siga encontrando la misma
ACL aunque el seed esté almacenado como `r2/seed`, `loadRecursoAccessByRuta`
resuelve el alias del seed y llama al mismo `loadRecursoAccess`; no se agregó
una segunda implementación de permisos.

La ficha conserva el shell, breadcrumbs, retorno contextual y relacionados. El
fallback usa un enlace HTML nativo a `/tablero`, por lo que abre el documento
histórico completo y atraviesa su gate; los relacionados no reciben el
`returnTo` de la ficha. El iframe tiene título accesible, estado `Cargando
visor…`, timeout seguro de 15 segundos y alerta con fallback cuando falla. Su
`sandbox` habilita únicamente `allow-scripts allow-forms allow-downloads` y no
incluye `allow-same-origin`; sólo el seed piloto opta por `allow-downloads` en
la CSP de su respuesta para conservar la exportación CSV. Los demás HTML
almacenados conservan la CSP previa.

## Matriz de compatibilidad auditada

| Capacidad | Hallazgo en `public/tablero/index.html` | Decisión/evidencia |
| --- | --- | --- |
| HTML/CSS/datos | Documento completo, CSS y datos inline | Compatible dentro del iframe |
| Scripts | JavaScript inline; Leaflet y Heat remotos desde `unpkg.com` | `allow-scripts`; no se reescribe el documento |
| Módulos/assets relativos | No se detectaron archivos locales separados; enlaces principales quedan en el HTML | Prueba de asset lee el documento real |
| Leaflet/tiles | CDN de Leaflet y tiles OSM requieren red del navegador | Dependencia documentada; no ACL nueva |
| Formularios/controles | Controles y formularios inline | `allow-forms` |
| Descargas | Exportación CSV por `Blob`/download | `allow-downloads` en iframe y CSP |
| Enlaces internos | Incluye enlace a `/mapa_interactivo/...` | Navegación sigue siendo URL directa y gated |
| Cookies/sesión | No se usa una sesión paralela en el documento; la carga inicial pasa por la ruta gated | Sin duplicar credenciales/ACL |
| Fullscreen | No se altera el documento; fallback nativo a `/tablero` | Disponible como apertura documental |
| Resize/scroll | iframe ocupa el ancho y altura mínima responsive; scroll interno queda en el documento | Requiere recorrido visual manual |
| Headers | Archivo: `nosniff`, `private, no-store`, `Content-Disposition: inline`, CSP sandbox; sólo el seed piloto opta por `allow-downloads` | Tests verifican CSP previa para HTML común y opción explícita del piloto |

## Seguridad, permisos y regresiones

Las pruebas existentes de la ficha/gate cubren sesión anónima con callback a la
ficha completa y `returnTo`, permiso denegado → `/forbidden`, recurso inexistente
→ 404 y carga autorizada. La prueba de seed verifica que `/tablero` se aliasa a
`r2`; la prueba de assets verifica que el documento real existe, contiene
script, enlace interno y CDN de Leaflet. `ResourceExperience` verifica que el
piloto usa exactamente `/api/recursos/r2/archivo`, tiene título y fallback, y
`LegacyViewer` verifica sandbox, carga, fallback y error por timeout.

La prueba de `AppShell` cambia de `/recursos/r1` a `/recursos/r2` y demuestra que
`resourceDetailsExpanded` se resetea, mientras el viewer vive dentro de la
misma ficha. No se modificó `middleware.ts`, el gate histórico ni los otros
visores; las URLs directas permanecen disponibles.

## Evidencia automatizada

Comandos directos ejecutados con los binarios ya instalados en
`node_modules/.bin` (sin investigar el wrapper de pnpm):

| Comprobación | Resultado |
| --- | --- |
| `node_modules/.bin/vitest run` | 29 archivos / 220 tests OK |
| `node_modules/.bin/eslint .` | OK |
| `node_modules/.bin/tsc --noEmit` | OK |
| `git diff --check` | OK al cierre |
| `node_modules/.bin/next build` | Bloqueado únicamente por red: Next no pudo descargar Google Fonts `Barlow` e `Inter` desde `fonts.googleapis.com` |

El bloqueo de build es externo al cambio: el trace apunta a `app/layout.tsx` y
`next/font/google`, antes de compilar la aplicación. También aparece la
advertencia preexistente de migración de `middleware` a `proxy`.

## Recorridos manuales

No se ejecutó un navegador interactivo en este entorno; por ello no se declara
verificación visual de foco, scroll, resize, fullscreen, Escape, Back/Forward ni
la carga real de CDN/tiles. Quedan automatizados los contratos de rutas, gate,
ACL, MIME/CSP, assets auditados, render de componente, loading/error, fallback,
retorno contextual y permanencia/reset del shell. Antes de activar más visores,
probar manualmente desktop y mobile con sesión permitida y denegada, incluyendo
exportación CSV y el enlace interno a `/mapa_interactivo`.

## Gate de los visores restantes

| Visor | Decisión | Motivo |
| --- | --- | --- |
| `/mapa_interactivo` | No-Go por ahora | Mantener ruta/documento directo hasta auditar sus capacidades de forma independiente |
| `/mapa_sobreedad` | No-Go por ahora | Sin evidencia de compatibilidad específica en este piloto |
| `/mapa_notas` | No-Go por ahora | Sin evidencia de compatibilidad específica en este piloto |

La decisión no bloquea sus URLs directas ni cambia sus CTAs; cada migración
requiere su propio inventario y aprobación posterior.

## Rollback

Eliminar `LegacyViewer` y `resourceContent` del camino de `ResourceExperience`,
volver a presentar `r2` con el viewer/CTA documental existente y retirar la
opción `allowDownloads` del GET del seed; así los HTML comunes conservan su CSP
previa en todo momento. Revertir el alias de rutas seed en
`seed-files`/`recurso-access` devuelve el comportamiento previo del gate sin
tocar datos de usuario: no hay migración de esquema ni reescritura del HTML.
El rollback es reversible por archivo y no requiere commit ni intervención
sobre `.atl`.

## Archivos exactos modificados

- `app/globals.css`
- `app/recursos/[id]/page.tsx`
- `app/recursos/[id]/page.test.tsx`
- `app/api/gate/[...path]/route.test.ts`
- `components/app-shell.tsx`
- `components/app-shell.test.tsx`
- `components/explore-page.tsx`
- `components/resource-card.tsx`
- `components/resource-card.test.tsx`
- `components/resource-experience.tsx`
- `components/resource-experience.test.tsx`
- `components/legacy-viewer.tsx`
- `components/legacy-viewer.test.tsx`
- `lib/archivo.ts`
- `lib/archivo.test.ts`
- `lib/db/recurso-access.ts`
- `app/api/recursos/[id]/archivo/route.ts`
- `lib/gate-static.test.ts`
- `lib/resource-content.ts`
- `lib/resource-content.test.ts`
- `lib/resource-href.ts`
- `lib/resource-href.test.ts`
- `lib/resource-presentation.ts`
- `lib/resource-presentation.test.ts`
- `lib/seed-files.ts`
- `lib/seed-files.test.ts`
- `docs/navigation-batches/batch-01-entrega.md`
- `docs/navigation-batches/batch-02-entrega.md`

`.atl/` se conservó sin modificaciones. No se hizo commit.
