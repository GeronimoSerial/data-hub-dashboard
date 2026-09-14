# Batch 4 — Entrega: administración y continuidad CRUD

## Contrato implementado

La URL canónica de Administración es `/admin?section=<id>`, con estos ids: `recursos`, `categorias`, `tags`, `niveles`, `tipos` y `usuarios`. `lib/admin-navigation.ts` es la única configuración compartida por el shell desktop, la navegación mobile y el contenido: incluye id, etiqueta, grupo, icono y roles permitidos.

- `section` ausente, inválido o no permitido se normaliza a `recursos` y se corrige con `router.replace`.
- Los hashes históricos conocidos (`/admin#recursos`, `/admin#categorias`, `/admin#tags`, `/admin#niveles`, `/admin#tipos`, `/admin#usuarios`) se migran una sola vez a la query canónica; después no queda un segundo estado de navegación.
- Los enlaces desktop y mobile comparten hrefs `/admin?section=...` y exponen `aria-current="page"`; Back/Forward se refleja al rerenderizar con el snapshot nuevo de `searchParams`.
- La ACL efectiva continúa en `app/admin/page.tsx` y las APIs existentes. La configuración solo filtra UI: un editor ve únicamente Recursos y un admin ve las seis secciones.

## Matriz sección × rol

| Sección | admin | editor | consulta |
|---|:---:|:---:|:---:|
| Recursos | ✓ | ✓ | — |
| Categorías | ✓ | — | — |
| Tags | ✓ | — | — |
| Niveles | ✓ | — | — |
| Tipos | ✓ | — | — |
| Usuarios | ✓ | — | — |

`consulta` no pasa la barrera de página existente; se incluye en la matriz para dejar explícita la compatibilidad de rol.

## Continuidad CRUD, feedback y dirty guard

- Guardar y eliminar no llaman al router ni cambian `section`; el estado local del listado permanece en la sección activa y las mutaciones muestran `aria-busy`/botones deshabilitados para impedir doble operación.
- Los retornos booleanos de `HubData` permiten mantener abierto el formulario ante error; el mensaje se muestra en el formulario o en la tabla/sección responsable. La confirmación de eliminación conserva el listado y su contexto.
- Los formularios de recurso, taxonomía y usuario usan `useDirtyGuard`: cancelar, Escape y cierre por backdrop confirman solo si hubo cambios; guardar exitosamente cierra sin una confirmación adicional. `useAdminDialogFocus` recuerda el control que abrió cada diálogo y restaura allí el foco con `preventScroll` tras el cierre controlado.
- `beforeunload` protege también la salida del documento mientras un formulario está sucio. No se agregó guard global a filtros u otras pantallas.

## Evidencia automatizada

| Evidencia | Resultado |
|---|---|
| Deep links, hrefs, grupos y matriz de roles | `lib/admin-navigation.test.ts`: 3 tests |
| Query inválida/no permitida y sección activa desktop/mobile | `components/admin-shell.test.tsx`: 4 tests |
| Hash histórico real vía `window.location.hash` y replace sin hash | `components/admin-shell.test.tsx`: 1 test explícito |
| Back/Forward con rerender ante nuevo `searchParams` | `components/admin-shell.test.tsx`: 1 test explícito |
| Tabs de AdminPage conectadas a contexto y `router.push` canónico | `components/admin-page-navigation.test.tsx`: 1 test |
| Dirty guard limpio/sucio y decisión de descarte | `lib/dirty-guard.test.tsx`: 2 tests |
| Mutaciones serializadas para submit/delete | `lib/admin-pending.test.tsx`: 2 tests |
| Save/delete exitoso, error, pending y feedback local en formulario/listado | `components/admin-crud.test.tsx`: 4 tests |
| Cierre controlado restaura foco sin desplazar scroll | `lib/admin-dialog-focus.test.tsx`: 1 test |
| Suite acumulada | Vitest: **38 archivos, 246 tests OK** |
| ESLint | `./node_modules/.bin/eslint .` OK |
| TypeScript | `./node_modules/.bin/tsc --noEmit` OK |
| Whitespace | `git diff --check` OK |

Los tests de shell verifican ambas superficies de navegación y el estado derivado después del cambio de URL. La preservación exacta de scroll y el foco del trigger tras CRUD se apoyan en no navegar/remontar la ruta y en el cierre nativo controlado de Base UI; el recorrido de teclado y las operaciones CRUD en cada sección quedan como validación manual (no hay browser E2E en este entorno).

## Validación manual pendiente

1. Como admin, abrir cada enlace en desktop y mobile, editar/crear/eliminar recurso y taxonomía, y verificar que sección, scroll y foco del disparador se mantienen.
2. Abrir `/admin#usuarios`, `/admin?section=usuarios` como editor y una sección válida como admin; confirmar migración, fallback y ausencia de contenido no permitido.
3. Usar Tab/Escape/backdrop con formularios limpio y sucio; confirmar que cancelar sheet/dialog no descarta silenciosamente cambios.
4. Recorrer varias secciones y usar Back/Forward, luego recargar y compartir cada URL.

## Build y limitaciones

`next build` fue ejecutado y queda bloqueado externamente al descargar las fuentes Google `Barlow` e `Inter` desde `fonts.googleapis.com`; no es un fallo introducido por Batch 4. No se modificó la estrategia de fuentes ni se amplió el alcance para resolver conectividad.

## Rollback

El rollback de Batch 4 consiste en retirar los archivos propios listados abajo y restaurar las versiones previas de `components/admin-page.tsx`, `components/admin-shell.tsx`, `components/hub-data.tsx` y `app/globals.css`; no requiere migración de datos ni cambios de ACL/API. Los hashes antiguos seguirán siendo atendidos por la versión anterior basada en hash al completar ese rollback. No se creó commit y `.atl/` no fue tocado.

## Lista exacta de archivos modificados por Batch 4

- `app/globals.css`
- `components/admin-page.tsx`
- `components/admin-shell.test.tsx`
- `components/admin-shell.tsx`
- `components/admin-crud.test.tsx`
- `components/admin-page-navigation.test.tsx`
- `components/hub-data.tsx`
- `docs/navigation-batches/batch-04-entrega.md`
- `lib/admin-dialog-focus.test.tsx`
- `lib/admin-dialog-focus.ts`
- `lib/admin-pending.test.tsx`
- `lib/admin-pending.ts`
- `lib/admin-navigation.test.ts`
- `lib/admin-navigation.ts`
- `lib/dirty-guard.test.tsx`
- `lib/dirty-guard.ts`
