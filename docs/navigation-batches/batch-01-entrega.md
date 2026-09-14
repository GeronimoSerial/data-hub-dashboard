# Batch 1 — Catálogo, ficha y retorno contextual: entrega

Requisito: `docs/navigation-batches/batch-01-catalogo-ficha-retorno.md`.

## Contrato final

### Destino de una card

`resourceCardTarget` devuelve `/recursos/${encodeURIComponent(id)}` para todo
recurso válido que tenga un `storageKey` no vacío o una `ruta` legacy aceptada
por `isAllowedRuta`. La ruta legacy nunca se usa como destino de la card. Un
recurso sin archivo ni ruta permitida queda sin link, y una ruta externa o
protocol-relative tampoco puede convertirse en un link.

El estado de sesión conserva el contrato anterior: una sesión pendiente o
autenticada recibe el destino de la ficha; una sesión anónima recibe
`/login?callbackUrl=...`, con el destino completo de la ficha (incluido su
`returnTo`) codificado como callback.

### `returnTo`

Explore construye `returnTo` con el pathname y la query actual. El valor se
acepta únicamente si:

- empieza por `/`, pero no por `//`;
- no contiene backslashes ni caracteres de control;
- al resolverlo contra un origen interno no cambia de origen.

Los valores válidos conservan exactamente su pathname, query y hash. Los
valores vacíos, externos o ambiguos usan `/explorar`. Si un helper de card
recibe un `returnTo` inválido, omite el parámetro; la ficha aplica igualmente
el fallback. Los recursos relacionados no reciben `returnTo`, por lo que no
propagan el contexto de la ficha anterior.

### Ficha, ACL y legacy

`/recursos/[id]` mantiene el orden server-side: recurso inexistente → 404,
sin sesión → Login con callback a la ficha, sin permiso → `/forbidden`, y solo
después carga el catálogo y renderiza `ResourceExperience`. Se eliminó el
redirect automático a `recurso.ruta`.

Una ruta legacy se muestra en la ficha con el CTA específico del formato
(`Ver reporte`, `Abrir tablero` o `Abrir mapa`). El CTA usa una ruta validada
por `resourceLegacyTarget`; no se imprime `ruta` cruda. Los archivos subidos
conservan `RecursoViewer`. El enlace “Volver a resultados” y los breadcrumbs
quedan fuera del panel colapsable y el retorno siempre tiene salida visible.

## Evidencia automatizada

La ejecución equivalente disponible en este entorno fue:

| Comprobación | Resultado |
| --- | --- |
| Vitest (`node_modules/.bin/vitest run`) | 27 archivos / 209 tests OK |
| ESLint (`node_modules/.bin/eslint .`) | OK |
| TypeScript (`node_modules/.bin/tsc --noEmit`) | OK |
| `git diff --check` | OK |
| `pnpm test` | No completó: con el PATH corregido el binario de pnpm queda colgado antes de imprimir versión/salida |
| `pnpm lint` | No completó: mismo bloqueo de pnpm |
| `pnpm build` | No completó: mismo bloqueo de pnpm |
| Next build directo (`node_modules/.bin/next build`) | Bloqueado por fetch de Google Fonts (`Barlow`/`Inter`) sin red |

La suite nueva cubre cards canónicas y callback anónimo, retorno exacto con
filtros/búsqueda, normalización de retorno externo/vacío/protocol-relative,
CTA legacy sin redirect, viewer embebido, relacionados sin propagación,
login, ACL/forbidden e ID inexistente/404. También se prueba que el estado
`resourceDetailsExpanded` se cierre al cambiar de `/recursos/r1` a
`/recursos/r2`.

## Recorridos manuales

No fue posible ejecutar recorridos de navegador en este entorno: no hay
Playwright configurado como dependencia ejecutable y el build no pudo resolver
las fuentes remotas. La evidencia automatizada reemplaza solo los contratos de
URL, render server-side y componentes; no certifica scroll, historial real,
focus ni layout visual.

| Recorrido | Estado | Evidencia o pendiente |
| --- | --- | --- |
| Home → recurso → volver | No ejecutado manualmente | Requiere navegador y sesión; helper/component test cubre salida y fallback |
| Explore con tres filtros → recurso → volver | No ejecutado manualmente | Test de helper conserva query; probar Back/scroll con navegador |
| Explore con búsqueda → relacionado → volver | No ejecutado manualmente | Test de componente verifica que related no hereda `returnTo` |
| Legacy → ficha → CTA documental | Automatizado a nivel de componente/página | Confirmar apertura del visor legacy y gate con servidor levantado |
| Deep link directo sin `returnTo` | Automatizado | Página normaliza a `/explorar`; falta verificación visual |
| Mobile y teclado | No ejecutado manualmente | Revisar focus, targets táctiles y stacking a 375/390 px |

## Archivos modificados

- `app/globals.css`
- `app/recursos/[id]/page.tsx`
- `app/recursos/[id]/page.test.tsx`
- `components/app-shell.tsx`
- `components/app-shell.test.tsx`
- `components/explore-page.tsx`
- `components/resource-card.tsx`
- `components/resource-card.test.tsx`
- `components/resource-experience.tsx`
- `components/resource-experience.test.tsx`
- `lib/resource-href.ts`
- `lib/resource-href.test.ts`
- `lib/resource-presentation.ts`
- `lib/resource-presentation.test.ts`
- `docs/navigation-batches/batch-01-entrega.md`

`.atl/` y `next-env.d.ts` fueron conservados sin modificaciones.

No se hizo commit.
