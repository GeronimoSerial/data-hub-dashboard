# Batch 3 — Explore: historial, scroll y continuidad

Requisito: `docs/navigation-batches/batch-03-explore-historial-scroll.md`.

## Contrato de navegación

La URL es la única fuente de verdad de `q`, `tema`, `nivel` y `formato`. Todos
los cambios pasan por `serializeExploreFilters`, que emite siempre el mismo
orden y encoding; no se concatenan query strings manualmente. La consulta se
normaliza (trim, minúsculas y límite de 80 caracteres) antes de serializarse,
por lo que un submit no dispara un `push` seguido de una segunda
canonicalización.

| Acción | Método | URL/efecto |
| --- | --- | --- |
| Submit de búsqueda | `router.push` | Nueva entrada con `q` normalizado |
| Home/tema/formato/nivel → Explore | `push` del enlace existente | Nueva entrada de exploración |
| Select de filtro desktop | `router.replace` | Reemplaza el estado incremental |
| Aplicar filtros mobile | `router.replace` una vez | Serializa el mismo contrato desktop |
| Limpiar filtros (chips o empty state) | `router.replace` | Elimina filtros sin contaminar Back |
| Canonicalizar parámetros inválidos/duplicados/desconocidos | `router.replace` una vez | URL estable e idempotente |
| Cancelar sheet mobile | Sin navegación | Descarta el draft local |
| Back/Forward | Router/navegador | Relee los cuatro filtros desde la URL |

La canonicalización compara contra el valor serializado antes de reemplazar;
una URL ya canónica no genera navegación ni loop. Desktop y mobile comparten
el mismo `serializeExploreFilters` y callback de aplicación.

## Retorno, scroll y foco

Cada card de Explore conserva el `returnTo` contextual de Batch 1. Antes de
navegar a una ficha, el callback de la card guarda de forma efímera, indexada
por la URL exacta, el `scrollY` y el id de la card. Al montar la URL de retorno,
Explore restaura esa posición una sola vez, elimina el registro y devuelve el
foco a la card con `focus({ preventScroll: true })` para no desplazar de nuevo
el viewport, si todavía existe en el resultado. Si el almacenamiento del
navegador no está disponible, el comportamiento nativo del router queda como
fallback; no hay contexto ni store global de navegación. `history.scrollRestoration`
se deja explícitamente en `auto` para favorecer Back/Forward nativo.

Un submit de búsqueda enfoca de forma no intrusiva el encabezado `Resultados`
(con `tabIndex=-1`) una vez después de observar el cambio de URL.
El contador conserva un único `aria-live="polite"`; no se anuncia toda la
grilla. Al cancelar o aplicar el sheet, ambos cierres pasan por
`onOpenChange(false)` y su foco vuelve al trigger. Aplicar realiza una sola
llamada al callback y una sola navegación `replace`; cancelar no llama al
callback.

## Evidencia automatizada

Se ejecutaron los binarios ya instalados en `node_modules/.bin`:

| Comprobación | Resultado |
| --- | --- |
| `node_modules/.bin/vitest run` | 31 archivos / 229 tests OK |
| `node_modules/.bin/eslint .` | OK |
| `node_modules/.bin/tsc --noEmit` | OK |
| `git diff --check` | OK |
| `node_modules/.bin/next build` | Bloqueado externamente al descargar Google Fonts `Barlow` e `Inter` desde `fonts.googleapis.com`; no persiste el error de bundle `node:fs` |

La cobertura nueva verifica submit `push` con foco posterior al rerender de URL,
filtros/limpieza `replace`, canonicalización única, los cuatro filtros en dos
estados Back/Forward mediante rerender de `ExplorePage`, cancelar y aplicar
mobile, retorno exacto con scroll y `preventScroll`, foco de resultados y foco
del trigger. También se mantiene la cobertura acumulada de ficha, ACL,
visores legacy, assets, fallback y reset de detalles por id.

## Evidencia manual y límites

No se ejecutó un navegador interactivo en este entorno. Por tanto, no se
declara verificación visual de Back/Forward real, restauración nativa bajo
scroll, focus ring, teclado, viewport 375 px, layout desktop, ni historial del
documento padre. Los tests de componentes/helpers cubren las transiciones y
efectos de foco/scroll simulados; antes de liberar conviene repetir los cinco
recorridos del brief en desktop y mobile, incluyendo compartir una URL y volver
desde una ficha abierta al final del listado.

## Archivos exactos del worktree

- `app/api/gate/[...path]/route.test.ts`
- `app/api/recursos/[id]/archivo/route.ts`
- `app/globals.css`
- `app/recursos/[id]/page.tsx`
- `app/recursos/[id]/page.test.tsx`
- `components/app-shell.tsx`
- `components/app-shell.test.tsx`
- `components/explore-filters-sheet.test.tsx`
- `components/explore-filters-sheet.tsx`
- `components/explore-page.test.tsx`
- `components/explore-page.tsx`
- `components/legacy-viewer.test.tsx`
- `components/legacy-viewer.tsx`
- `components/resource-card.test.tsx`
- `components/resource-card.tsx`
- `components/resource-experience.test.tsx`
- `components/resource-experience.tsx`
- `lib/archivo.test.ts`
- `lib/archivo.ts`
- `lib/db/recurso-access.ts`
- `lib/explore-filters.test.ts`
- `lib/explore-filters.ts`
- `lib/gate-static.test.ts`
- `lib/resource-content.test.ts`
- `lib/resource-content.ts`
- `lib/resource-href.test.ts`
- `lib/resource-href.ts`
- `lib/resource-pilot.test.ts`
- `lib/resource-pilot.ts`
- `lib/resource-presentation.test.ts`
- `lib/resource-presentation.ts`
- `lib/seed-files.test.ts`
- `lib/seed-files.ts`
- `docs/navigation-batches/batch-01-entrega.md`
- `docs/navigation-batches/batch-02-entrega.md`
- `docs/navigation-batches/batch-03-entrega.md`

`.atl/` fue conservado sin modificaciones. No se hizo commit.
