# Batch 6 — Auth, boundaries, accesibilidad y cierre

## Brief para agente fresco

Realizá el cierre transversal después de integrar los batches funcionales. No introduzcas nuevos patrones de navegación; corregí estados sin salida, loading/error/404, foco y regresiones finales.

## Prerrequisitos

- Batches 1 a 5 integrados o descartados explícitamente mediante sus gates.
- Suite del Batch 0 actualizada y verde.

## Contexto técnico mínimo

- Login: `app/login/page.tsx`, con `callbackUrl` validada y `router.replace` tras éxito.
- Forbidden: `app/forbidden/page.tsx`, actualmente solo enlaza al inicio.
- No hay boundaries propios `loading.tsx`, `error.tsx` o `not-found.tsx` en las áreas principales.
- `components/app-shell.tsx` contiene navegación global, menús, cuenta y toggle de detalles.
- Los providers persistentes viven en `app/layout.tsx`.
- Explore, recurso, admin y mapa ya deben tener contratos definidos por batches previos.

## Objetivo

Garantizar que todo flujo tenga salida, feedback y continuidad accesible sin introducir reloads ni rutas innecesarias.

## Tareas atómicas

### 1. Login

- Añadí “Cancelar y volver” cuando exista un destino interno seguro.
- Sin destino, volver a Inicio o a la página anterior según contrato explícito.
- Conservá callback completo tras autenticación.
- Evitá doble submit y anunciá error correctamente.
- Restaurá una ruta segura si callback es inválido.

### 2. Forbidden

- Conservá el destino intentado mediante parámetro interno validado o contexto seguro.
- Ofrecé volver, regresar al catálogo y cambiar de cuenta.
- Añadí “Solicitar acceso” solo si existe un canal/producto real.
- No reveles metadata de recursos no autorizados.

### 3. Loading boundaries

- Añadí loading contextual donde una navegación pueda esperar datos o bundles.
- Conservá shell, ancho y jerarquía para evitar layout shift.
- No uses un spinner global para toda interacción local.

### 4. Error boundaries

- Añadí recuperación con retry o salida segura.
- Diferenciá fallo inesperado de Forbidden y Not Found.
- No expongas stack traces ni detalles sensibles.
- Registrá error usando la infraestructura existente, si existe.

### 5. Not Found

- Proporcioná navegación hacia Explore e Inicio.
- Para ID de recurso inexistente, no simules Forbidden.
- Conservá copy consistente en español.

### 6. Foco y teclado

- Tras cambio real de ruta, el foco debe llegar a heading o contenedor principal según patrón.
- Menús y modales restauran foco al trigger.
- Escape cierra overlays apropiados.
- `aria-current`, `aria-expanded`, labels y live regions son coherentes.
- Evitá anuncios duplicados en filtros o loaders.

### 7. Transiciones

- Usá movimiento solo para paneles y cambios parciales que se beneficien de continuidad.
- Respetá `prefers-reduced-motion`.
- No retrases navegación real para mostrar animaciones.

### 8. Limpieza final

- Buscá `<a>` internos, `window.location`, redirects duplicados y helpers muertos.
- Conservá anchors de descarga y externos.
- Eliminá código muerto solo con prueba de no uso.
- No aproveches el batch para refactors visuales o de datos.

## Matriz de regresión obligatoria

| Flujo | Casos |
|---|---|
| Público | Inicio, Explore, filtros, ficha, relacionados y retorno |
| Auth | Login exitoso/fallido, cancelar, callback válido/inválido y logout |
| ACL | consulta, editor, admin, sin permiso y usuario bloqueado si aplica |
| Legacy | piloto embebido o fallback documental, directo y mediante ficha |
| Admin | sección directa, Back/Forward, CRUD y dirty guard |
| Mapa | deep link, reload, Back/Forward, fullscreen y error de datos |
| Estados | loading, error, 404 y Forbidden |
| Accesibilidad | teclado, foco, reduced motion y mobile |

## Validación obligatoria

```bash
pnpm test
pnpm lint
pnpm build
```

Ejecutá además toda la suite E2E y los recorridos manuales que permanezcan fuera de automatización.

## Criterios de aceptación

- Ningún estado deja al usuario sin salida segura.
- Login conserva deep links internos.
- Forbidden conserva contexto sin filtrar información.
- No hay hard reload salvo fallback legacy documentado.
- No existen warnings por actualización durante render.
- El foco y Back/Forward son coherentes en desktop y mobile.
- Reduced motion está respetado.
- Tests, lint, build y E2E pasan.

## Entrega esperada

- Implementación y tests finales.
- Matriz de regresión con resultado.
- Lista de fallbacks legacy que permanezcan documentados.
- Deuda explícitamente diferida.
- Archivos modificados.

## Stop conditions

Escalá si una corrección requiere cambiar el modelo de autenticación, agregar un servicio externo, rediseñar Home o reescribir un visor legacy. Esas acciones están fuera de alcance.
