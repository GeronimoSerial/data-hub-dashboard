# Batch 2 — Contención progresiva de visores legacy

## Brief para agente fresco

Encapsulá un único visor legacy como piloto dentro del shell React. No migres todos los visores hasta probar seguridad, assets y compatibilidad. Las URLs históricas directas deben seguir funcionando.

## Prerrequisitos

- Batches 0 y 1 integrados.
- Toda card abre primero `/recursos/:id`.
- La ficha dispone de CTA explícito y retorno contextual.

## Contexto técnico mínimo

- Legacy: `public/tablero/index.html`, `public/mapa_interactivo/index.html`, `public/mapa_sobreedad/index.html`, `public/mapa_notas/index.html`.
- `middleware.ts` reescribe sus prefixes hacia `app/api/gate/[...path]/route.ts`.
- El gate resuelve sesión, ACL, archivos, MIME y streaming.
- Los legacy son documentos completos con su propio HTML y assets relativos.
- Navegar directamente a ellos desmonta el App Router.
- `components/recurso-viewer.tsx` ya usa iframe para HTML/PDF almacenados.
- No toques cambios preexistentes ajenos.

## Objetivo

Demostrar que al menos un legacy puede abrirse desde la ficha sin hard reload y sin debilitar el gate.

## Alcance del piloto

Elegí un solo recurso legacy representativo, preferentemente `/tablero`, salvo que el inventario demuestre que otro tiene menor riesgo. Documentá la razón.

## Tareas atómicas

### 1. Contrato de visor

- Modelá de forma explícita contenido almacenado, ruta React y ruta legacy.
- Evitá condicionales duplicados entre card, ficha y viewer.
- La ficha decide cómo presentar; el servidor sigue decidiendo acceso.

### 2. Encapsulado

- Abrí el piloto en iframe dentro de la ficha o viewer dedicado.
- Reutilizá la ruta gated existente como `src`; no dupliques streams ni ACL.
- Aplicá sandbox solo después de inventariar capacidades necesarias.
- Proporcioná título accesible y estado de carga.

### 3. Compatibilidad

Verificá:

- scripts y módulos.
- CSS, imágenes, fuentes y JSON relativos.
- downloads y enlaces internos.
- cookies/sesión.
- fullscreen.
- tamaño, resize y scroll anidado.
- navegación interna del iframe.
- CSP, `X-Frame-Options` y headers relacionados.

### 4. Fallback

- Conservá una acción “Abrir en pantalla completa” hacia la URL legacy.
- Si el iframe falla, ofrecé fallback explícito y no una pantalla vacía.
- Mantené las URLs directas sin cambios.

### 5. Observabilidad

- Diferenciá fallo de carga, permiso denegado y contenido inexistente.
- No expongas información protegida en errores cliente.

## Tests obligatorios

- Sesión válida + permiso: carga el piloto.
- Anónimo: Login con callback correcto.
- Sin permiso: Forbidden.
- Ruta inexistente: 404 controlado.
- Assets relativos principales responden correctamente.
- Fallback abre la URL histórica.
- Volver a resultados conserva contexto.
- La ficha y shell no se desmontan al abrir el piloto.

## Validación manual

- Desktop y mobile.
- Teclado y foco al entrar/salir del visor.
- Fullscreen y Escape.
- Back/Forward del documento padre.
- Navegación o controles internos del legacy.
- Comparación funcional con apertura documental directa.

## Gate go/no-go

### Go

- No se debilita ACL.
- Assets y scripts esenciales funcionan.
- No hay bloqueo por CSP/sandbox.
- La UX embebida es igual o mejor que la documental.

### No-go

- Requiere reescribir ampliamente el HTML legacy.
- Necesita `allow-same-origin` + `allow-scripts` sin aislamiento aceptable.
- Rompe descargas, fullscreen o assets esenciales.
- Introduce una segunda implementación de autorización.

Ante no-go, conservá la ficha canónica del Batch 1 y el CTA documental. Documentá la migración como proyecto separado.

## Criterios de aceptación

- Un piloto funcional y reversible.
- URLs directas compatibles.
- Seguridad y permisos equivalentes al gate actual.
- No se migran los demás legacy sin aprobación explícita.

## Entrega esperada

- Implementación piloto y tests.
- Matriz de compatibilidad.
- Recomendación go/no-go para cada legacy restante.
- Plan de rollback y archivos modificados.

## Stop conditions

Detenete y escalá si el piloto exige reescribir el documento legacy, relajar la ACL, duplicar el gate, desactivar protecciones de navegador sin una revisión de seguridad o migrar más de un visor para demostrar viabilidad.
