# Batch 3 — Explore: historial, scroll y continuidad

## Brief para agente fresco

Hacé predecible la navegación del catálogo. Conservá filtros en URL, reducí contaminación del historial y restaurá listado, scroll y foco al regresar desde una ficha.

## Prerrequisitos

- Batch 0 integrado.
- Contrato `returnTo` del Batch 1 disponible.

## Contexto técnico mínimo

- `components/explore-page.tsx` usa `usePathname`, `useRouter` y `useSearchParams`.
- Los filtros se parsean/serializan en `lib/explore-filters.ts`.
- La canonicalización usa `router.replace`.
- Hoy cambios y limpieza usan principalmente `router.push`.
- Desktop y mobile comparten callback de aplicación, pero mantienen UI separada.
- `HubDataProvider` persiste en el layout raíz.
- No existe paginación actual.

## Objetivo

Definir una política consistente para historial, scroll, foco y deep links de Explore.

## Decisiones cerradas

- La URL es la fuente de verdad de `q`, `tema`, `nivel` y `formato`.
- Enviar una búsqueda nueva merece `push`.
- Ajustar o limpiar filtros dentro de la misma exploración usa `replace`.
- No agregar paginación sin justificarla con volumen o requisito real.

## Tareas atómicas

### 1. API interna de actualización

- Separá actualización con intención `push` de actualización incremental `replace`.
- Evitá concatenación manual inconsistente de query strings.
- Conservá canonicalización idempotente.
- No generes loops entre efecto y router.

### 2. Política de historial

- Home/tema/formato/nivel → Explore: nueva entrada.
- Submit de búsqueda: nueva entrada.
- Select de filtro: reemplazo de la entrada actual.
- Limpiar filtros: reemplazo.
- Back/Forward: restauración desde la URL, sin estado paralelo.

### 3. Scroll

- Al volver desde ficha mediante `returnTo`, restaurá la posición anterior.
- No fuerces scroll al inicio por cada filtro menor.
- Ante una búsqueda sustancialmente nueva, llevá resultados a una posición útil.
- Preferí comportamiento nativo antes que un store global.

### 4. Foco y anuncios

- Tras una consulta nueva, mové el foco de forma no intrusiva al encabezado de resultados.
- Conservá `aria-live` para el conteo sin anuncios duplicados.
- Al cerrar filtros mobile, restaurá foco al trigger.

### 5. Consistencia responsive

- Desktop y mobile deben serializar exactamente los mismos filtros.
- Cancelar el sheet no modifica URL.
- Aplicar el sheet realiza una sola navegación.
- Limpiar draft y limpiar filtros reales deben seguir siendo acciones distintas.

## Tests obligatorios

- `push` en submit de búsqueda.
- `replace` en filtros y limpieza.
- canonicalización inválida realiza un único replace.
- Back/Forward restaura los cuatro filtros.
- cancelar mobile no navega.
- aplicar mobile navega una vez.
- retorno desde ficha conserva URL y scroll acordados.
- foco vuelve al trigger o resultados según acción.

## Validación manual

1. Aplicar tres filtros y recorrer Back/Forward.
2. Buscar, abrir recurso y volver.
3. Cambiar filtros estando al final del listado.
4. Compartir una URL y abrirla en nueva sesión.
5. Repetir en 375 px y con teclado.

## Criterios de aceptación

- Back no recorre microcambios innecesarios.
- Forward reproduce la vista exacta.
- Volver desde ficha conserva filtros y scroll.
- No hay loop de canonicalización.
- Mobile y desktop producen URLs idénticas.
- No se agrega store global de navegación sin necesidad demostrada.

## Entrega esperada

- Implementación y tests.
- Tabla final de acciones `push`/`replace`.
- Evidencia manual de historial, scroll y foco.
- Archivos modificados.

## Stop conditions

Escalá si la restauración de scroll requiere sustituir el router, si aparece un loop de navegación no reproducible en tests o si se concluye que hace falta paginación para completar el batch.
