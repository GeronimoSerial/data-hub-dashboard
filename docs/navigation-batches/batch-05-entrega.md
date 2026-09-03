# Entrega Batch 5 — Estado y rendimiento del mapa

## Estado compartible

| Estado | Query param | Contrato |
|---|---|---|
| Cámara | `lng`, `lat`, `zoom` | Valores finitos, con clamp y precisión canónica. |
| Mapa base | `base` | `osm`, `voyager` o `positron`; valores desconocidos usan el default. |
| Capas activas | `layers` | Lista ordenada y compacta de IDs soportados. Una lista vacía apaga todas. |
| Selección | — | Local: zonas y establecimientos no comparten todavía un ID estable uniforme. |
| Búsqueda y paneles | — | Locales por ser interacción transitoria. |

Las URLs anteriores que solo contienen cámara siguen siendo válidas. Todos los
cambios usan `history.replaceState`: mover la cámara o alternar una capa no agrega
entradas que Back deba recorrer.

## Restauración y datos

- La carga inicial se analiza una sola vez y `popstate` restaura cámara, base y capas.
- Antes de restaurar historial se cancela cualquier escritura pendiente; desmontar
  también cancela el settler para no sobrescribir una ruta posterior.
- El dataset resuelto se conserva en caché de módulo. La medición automatizada pasa
  de 12 requests al montar, salir y volver a 6 requests iniciales, sin refetch al
  segundo montaje.
- Los datasets opcionales continúan degradando a `null`. Los datasets requeridos
  distinguen el recurso que falló y la vista ofrece `Reintentar`.

## Evidencia

- `pnpm test -- lib/map-share.test.ts lib/use-map-data.test.tsx`: 249 tests verdes
  en la suite ejecutada por Vitest.
- `pnpm lint`: aprobado.
- `pnpm exec tsc --noEmit`: aprobado.

## Rollback

Se puede revertir este batch retirando el esquema extendido de `lib/map-share.ts`,
la caché de `lib/use-map-data.ts` y su integración en el mapa, sin afectar ACL ni
las rutas implementadas en batches anteriores.
