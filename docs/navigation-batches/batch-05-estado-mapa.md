# Batch 5 — Estado navegable y rendimiento del mapa

## Brief para agente fresco

Ampliá cuidadosamente el estado compartible del mapa sin convertir cada interacción en una navegación. La URL debe ser compacta, estable y compatible hacia atrás.

## Prerrequisito

Batch 0 integrado.

## Contexto técnico mínimo

- Ruta protegida: `app/mapas/matricula/page.tsx`.
- Carga cliente: `app/mapas/matricula/map-client.tsx`.
- Vista: `components/mapas/map-matricula-page.tsx`.
- URL state actual: `lib/map-share.ts` guarda `lng`, `lat`, `zoom` con `history.replaceState`.
- `popstate` restaura cámara con `flyTo`.
- Basemap, overlays y selección son estado local.
- `lib/use-map-data.ts` carga datasets; revisar refetch al remontar.
- El mapa es un viewer full-bleed dentro del shell.

## Objetivo

Permitir reload, deep link y Back/Forward coherentes, preservando solo estado estable y evitando fetches duplicados.

## Decisiones previas requeridas

Antes de codificar, clasificá:

- Cámara: compartible, siempre.
- Basemap: compartible si tiene IDs estables.
- Overlays: compartibles en forma compacta.
- Selección: solo si existe ID estable y resoluble.
- Texto de búsqueda: no persistir si es únicamente input transitorio.
- Paneles abiertos/cerrados: estado local salvo requisito de deep link.

Documentá la clasificación en el PR o handoff.

## Tareas atómicas

### 1. Esquema URL

- Extendé parser y serializer con claves breves pero legibles.
- Conservá compatibilidad con URLs que solo tienen cámara.
- Ignorá valores desconocidos o inválidos.
- Aplicá clamps y defaults consistentes.
- La serialización canónica debe ser determinista.

### 2. Restauración

- Inicializá estado soportado desde search params una sola vez.
- En `popstate`, restaurá cámara y demás estado sin crear una nueva entrada.
- Evitá loops entre restauración y settle.
- Cancelá timers pendientes antes de aplicar historial.

### 3. Frecuencia de escritura

- Cámara usa settler/debounce y `replaceState`.
- Toggle de capa o basemap usa replace, no push.
- Una acción semántica excepcional solo puede usar push si se documenta por qué Back debe recorrerla.

### 4. Datos y remount

- Medí cuántos fetches ocurren al entrar, salir y volver.
- Reutilizá caché HTTP o una caché compartida ya disponible antes de agregar una nueva dependencia.
- Cancelá requests al desmontar si corresponde.
- No muevas el mapa completo al provider raíz.

### 5. Loading y error

- Mantené shell y controles estructurales estables durante carga.
- Diferenciá error de red, dataset ausente y permiso.
- Ofrecé retry cuando sea seguro.

## Tests obligatorios

- Parser/serializer round-trip.
- Canonicalización y clamps.
- Compatibilidad con URL antigua.
- Debounce produce un solo replace.
- `flush` y `cancel` funcionan.
- Popstate restaura sin escribir otra entrada.
- Valores inválidos usan defaults.
- Overlays/basemap soportados se restauran.
- Entrar/salir/volver no duplica fetches evitables.

## Validación manual

1. Mover y hacer zoom; comprobar URL e historial.
2. Activar capas y cambiar basemap; recargar.
3. Copiar URL en nueva pestaña.
4. Back/Forward tras salir del mapa.
5. Fullscreen, mobile y teclado.
6. Simular error o dataset ausente.

## Criterios de aceptación

- La URL reproduce el estado oficialmente soportado.
- Pan y zoom no crean entradas de historial.
- No existen loops ni saltos inesperados de cámara.
- ACL permanece en servidor.
- No se incorpora una caché global compleja sin medición.
- El shell no se desmonta.

## Entrega esperada

- Implementación y tests.
- Especificación de query params soportados.
- Medición simple de fetches antes/después.
- Evidencia manual y archivos modificados.

## Stop conditions

Escalá si la selección no tiene ID estable, si la URL excede un tamaño razonable, si MapLibre impide restauración determinista o si evitar refetch requiere una nueva arquitectura de datos.
