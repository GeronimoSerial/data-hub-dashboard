# Batch 1 — Catálogo, ficha y retorno contextual

## Brief para agente fresco

Unificá la entrada a los recursos: toda card debe abrir primero una ficha canónica y permitir volver al catálogo exacto. Hacé el cambio mínimo; no implementes master-detail ni migres aún los visores legacy.

## Prerrequisito

Batch 0 integrado y suite verde.

## Contexto técnico mínimo

- `components/resource-card.tsx` obtiene el href mediante `lib/resource-href.ts`.
- Hoy `resourceCardTarget` devuelve `/recursos/:id` para `storageKey`, pero devuelve `recurso.ruta` para recursos legacy.
- `app/recursos/[id]/page.tsx` redirige automáticamente a `row.ruta` cuando no hay `storageKey`.
- `components/resource-experience.tsx` contiene metadata, breadcrumbs, explicación, compartir, visor y relacionados.
- Los breadcrumbs están dentro de un panel colapsable.
- `lib/resource-presentation.ts` contiene presentación y acción principal reutilizable.
- Los filtros de Explore ya viven en query params.
- No toques cambios preexistentes ajenos en `next-env.d.ts` y `.atl/`.

## Objetivo

Establecer `/recursos/:id` como ficha canónica para todos los recursos y preservar el origen completo de Explore.

## Decisiones cerradas

- No usar parallel routes.
- No usar modal routing/master-detail.
- El origen se transporta como `returnTo` interno validado.
- La ficha muestra una acción explícita para abrir el contenido.
- La ACL sigue evaluándose en servidor.

## Tareas atómicas

### 1. Destino canónico

- Hacé que toda card válida apunte a `/recursos/${id}`.
- Conservá la lógica de Login/callback para anónimos.
- No permitas rutas externas o protocol-relative.
- Actualizá unit tests de `resource-href`.

### 2. Origen contextual

- Desde Explore, agregá a la ficha un `returnTo` con pathname y query actuales.
- Desde Home o relacionados, usá un origen coherente o no agregues `returnTo`.
- Validá que `returnTo` empiece con `/`, no con `//`, y permanezca dentro de la app.
- Evitá propagar recursivamente `returnTo` al navegar entre relacionados.

### 3. Eliminar salto automático

- En `app/recursos/[id]/page.tsx`, no redirijas automáticamente los recursos con `ruta`.
- Cargá la ficha con el recurso y su acción primaria.
- Conservá notFound, Login y Forbidden existentes.

### 4. Acción primaria

- Mostrá “Ver reporte”, “Abrir tablero” o “Abrir mapa” según formato.
- Para archivos embebibles, conservá el visor actual.
- Para rutas legacy, la acción todavía puede abrir la ruta documental; Batch 2 resolverá el encapsulado.
- La acción debe ser claramente distinta de “Volver”.

### 5. Retorno y breadcrumbs

- Mostrá “Volver a resultados” fuera del panel colapsable.
- Si `returnTo` es válido, regresá a esa URL exacta.
- Sin origen válido, regresá a `/explorar`.
- Mantené breadcrumbs básicos visibles aunque los detalles estén colapsados.

### 6. Estado del shell

- Revisá el estado `resourceDetailsExpanded` al cambiar entre IDs.
- Definí de forma explícita si debe persistir entre recursos o reiniciarse.
- Evitá actualizaciones durante render.

## Tests obligatorios

- Todas las cards apuntan a ficha canónica.
- Anónimo recibe Login con callback hacia la ficha, no hacia el legacy.
- `returnTo` conserva filtros y búsqueda.
- `returnTo` externo, vacío o protocol-relative usa fallback.
- Recurso con `ruta` renderiza ficha y CTA; no redirige durante la carga.
- Sin sesión, sin permiso e ID inexistente mantienen comportamiento.
- Recurso relacionado no hereda un origen corrupto.
- Back desde ficha devuelve a la vista filtrada.

## Validación manual

1. Home → recurso → volver.
2. Explore con tres filtros → recurso → volver.
3. Explore con búsqueda → recurso → relacionado → volver.
4. Recurso legacy → ficha → CTA documental.
5. Deep link directo a ficha sin `returnTo`.
6. Mobile y teclado.

## Criterios de aceptación

- Ninguna card salta directamente la ficha.
- La ficha nunca queda sin salida visible.
- El origen válido se recupera exactamente.
- ACL, Login y Forbidden no regresionan.
- No se implementa aún encapsulado legacy ni master-detail.

## Entrega esperada

- Implementación y tests.
- Descripción del contrato final de `returnTo`.
- Evidencia de los seis recorridos manuales.
- Lista de archivos modificados.

## Stop conditions

Escalá si la ficha no puede construirse para recursos legacy con el modelo actual, si el callback necesita aceptar dominios externos o si el cambio exige debilitar el gate servidor.
