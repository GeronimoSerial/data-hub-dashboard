# Batch 4 — Navegación de Administración y continuidad CRUD

## Brief para agente fresco

Unificá sidebar, tabs y URL administrativa usando una sola fuente de verdad. Preservá sección y contexto durante CRUD. No dividas Administración en múltiples rutas salvo que una limitación técnica demostrable obligue a reabrir la decisión.

## Prerrequisito

Batch 0 integrado.

## Contexto técnico mínimo

- Entrada protegida: `app/admin/page.tsx`.
- Shell lateral: `components/admin-shell.tsx` usa links `/admin#...`.
- Contenido: `components/admin-page.tsx` mantiene `tab` local, escucha `hashchange` y renderiza secciones condicionales.
- Seleccionar una tab no actualiza actualmente el hash.
- Para usuarios no admin existe un `setTab` durante render.
- Formularios y confirmaciones viven en `components/admin-page.tsx`.
- Mutaciones/reload se gestionan en `components/hub-data.tsx`.
- Roles editor/admin no tienen las mismas secciones.

## Objetivo

Usar `/admin?section=<id>` como estado canónico y hacer que las operaciones CRUD no pierdan sección, scroll ni foco.

## Secciones válidas

- `recursos`
- `categorias`
- `tags`
- `niveles`
- `tipos`
- `usuarios`

La lista visible debe derivarse de rol y de una configuración compartida entre shell y contenido.

## Tareas atómicas

### 1. Modelo de navegación

- Extraé una configuración común con id, label, icono y permisos.
- Parseá `section` desde search params.
- Normalizá valor ausente, inválido o no permitido a `recursos` mediante `replace`.
- Eliminá actualizaciones de estado durante render.

### 2. Compatibilidad con hashes

- Detectá hashes históricos conocidos.
- Convertí `/admin#usuarios` a `/admin?section=usuarios` mediante replace.
- No mantengas dos fuentes de verdad después de normalizar.

### 3. Sidebar y responsive

- Sidebar desktop y tabs/selector mobile consumen la misma configuración.
- Ambas superficies actualizan la misma query.
- Marcá sección activa con `aria-current` o semántica equivalente.
- Evitá mostrar dos navegaciones completas simultáneamente si el CSS responsive ya puede resolverlo.

### 4. Roles

- Editor solo puede activar Recursos.
- Admin puede activar todas las secciones.
- Una URL no permitida se normaliza sin mostrar contenido intermedio.
- No repliques la autorización del servidor como protección efectiva; la UI solo refleja permisos.

### 5. CRUD continuo

- Guardar conserva sección activa.
- Eliminar conserva sección y una posición útil.
- Error de mutación aparece en la fila o formulario responsable.
- Añadí estado pending para impedir doble submit/delete.
- Restaurá foco al disparador al cerrar modal.

### 6. Cambios sin guardar

- Detectá dirty state en formularios de recurso, taxonomía y usuario.
- Cancelar o cerrar con cambios solicita confirmación.
- Guardar exitosamente limpia dirty antes de cerrar.
- No bloquees cierre cuando no hubo cambios.

## Tests obligatorios

- Deep link de cada sección admin.
- Sección inválida → Recursos.
- Editor con `section=usuarios` → Recursos sin flash de contenido.
- Sidebar y tabs actualizan URL.
- Back/Forward cambia sección.
- Hash histórico migra correctamente.
- Save/delete exitoso conserva sección.
- Error mantiene formulario/lista y muestra feedback local.
- Dirty guard solo aparece cuando corresponde.
- Cierre restaura foco.

## Validación manual

- Admin desktop, mobile y teclado.
- Editor con URL admin manipulada.
- Crear/editar/cancelar/eliminar en cada tipo de sección.
- Back/Forward después de varias secciones.
- Reload y URL compartida.

## Criterios de aceptación

- URL, sidebar y tabs nunca discrepan.
- No existe `setState` durante render.
- Los hashes anteriores siguen entrando a la sección equivalente.
- Las mutaciones no pierden contexto.
- No hay descarte silencioso de cambios.
- ACL servidor permanece intacta.

## Entrega esperada

- Implementación, tests y compatibilidad de hashes.
- Matriz sección × rol.
- Evidencia de flujos CRUD y foco.
- Archivos modificados.

## Stop conditions

Escalá si una sección necesita layout o carga servidor independiente, si `?section=` impide un requisito real de caché/SEO o si el dirty guard exige una reescritura general de formularios.
