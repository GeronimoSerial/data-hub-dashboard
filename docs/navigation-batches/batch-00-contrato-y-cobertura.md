# Batch 0 — Contrato de navegación y cobertura

## Brief para agente fresco

Trabajá únicamente en la red de seguridad de navegación. No cambies todavía el comportamiento visible del producto. Tu entrega debe permitir que los batches posteriores modifiquen rutas, historial y visores con regresiones detectables.

## Contexto técnico mínimo

- Stack: Next.js 16 App Router, React 19, Vitest y Testing Library.
- El layout raíz monta `Providers`, `HubDataProvider` y `AppShell` en `app/layout.tsx`.
- Navegación global: `components/app-shell.tsx`.
- Helpers centrales: `lib/nav.ts`, `lib/resource-href.ts`, `lib/gate-static.ts`.
- Rutas legacy protegidas: `/tablero`, `/mapa_interactivo`, `/mapa_sobreedad`, `/mapa_notas`.
- `middleware.ts` reescribe esas rutas hacia `/api/gate/[...path]`.
- Rutas canónicas actuales: `/`, `/explorar`, `/recursos/[id]`, `/mapas/matricula`, `/admin`, `/login`, `/forbidden`.
- Alias: `/reportes`, `/tableros`, `/mapas` redirigen a Explore con filtro.
- Hay cambios preexistentes ajenos en `next-env.d.ts` y `.atl/`: no los toques.

## Objetivo

Formalizar el contrato de navegación y cubrirlo con pruebas antes de modificar producción.

## Alcance

1. Construir una matriz de rutas con destino, protección, tipo de navegación y comportamiento esperado.
2. Ampliar unit tests de helpers de navegación.
3. Cubrir middleware, gate, redirects, callback URL y estados de ACL relevantes.
4. Incorporar smoke E2E mínimo si no existe infraestructura equivalente.
5. Detectar hard reloads inesperados en rutas App Router.

## Fuera de alcance

- Cambiar destinos de cards.
- Modificar experiencia de detalle.
- Encapsular legacy.
- Cambiar navegación admin o mapa.
- Rediseñar UI.

## Tareas atómicas

### 1. Inventario ejecutable

Definí casos para:

- `/`, `/explorar` y combinaciones válidas/inválidas de filtros.
- `/reportes`, `/tableros`, `/mapas` y sus redirects.
- `/recursos/:id` con archivo, ruta legacy, recurso inexistente y sin permiso.
- `/mapas/matricula` con y sin sesión/permisos.
- rutas legacy raíz, anidadas, assets y rutas inexistentes.
- `/admin` para anónimo, consulta, editor, admin y usuario bloqueado si aplica.
- `/login?callbackUrl=` válido, vacío, externo y protocol-relative.
- `/forbidden` y 404.

### 2. Helpers

Ampliá tests para:

- `gatedStaticPath`.
- `isStaticHref`.
- `isReadyHref`.
- `isMapViewerPath`.
- `isBleedViewerPath`.
- `resourceCardTarget` y `resourceCardHref`.
- normalización y preservación de callback URL.

Incluí query, hash, trailing slash, extensiones, caracteres codificados y entradas inválidas.

### 3. Middleware y gate

Probá:

- rewrite correcto para prefixes gated.
- `NextResponse.next()` para rutas no gated.
- anónimo → Login con callback completo.
- sin permiso → Forbidden.
- recurso inexistente → 404.
- archivo permitido → stream, MIME y headers correctos.
- traversal o ruta no permitida → rechazo.

### 4. E2E mínimo

Si el repositorio no tiene runner E2E, incorporá Playwright con el menor setup posible. Cubrí como mínimo:

- Inicio → Explore → recurso → Back.
- alias de formato → Explore filtrado.
- anónimo → Login → callback solicitado.
- acceso denegado → Forbidden.
- navegación App Router sin reload documental.

No crees una suite extensa: solo la infraestructura reutilizable y smoke críticos.

## Contrato que debe quedar documentado

- `router.push`: cambio intencional que merece entrada de historial.
- `router.replace`: normalización o microestado navegable.
- `history.replaceState`: estado frecuente del mapa que no debe renderizar una nueva ruta.
- ruta real: cambio de entidad o sección principal.
- estado local: modal o panel sin valor como deep link.
- `<a>`: descarga, recurso externo o fallback documental explícito.

## Validación obligatoria

```bash
pnpm test
pnpm lint
pnpm build
```

Ejecutá también el smoke E2E si se incorporó.

## Criterios de aceptación

- Cada ruta del inventario tiene cobertura automatizada o un caso manual documentado con justificación.
- Los roles y redirects críticos están cubiertos.
- Los tests distinguen navegación SPA de navegación documental.
- No cambia el comportamiento productivo.
- No se modifican archivos ajenos al alcance.

## Entrega esperada

- Tests y configuración mínima.
- Resumen de la matriz cubierta.
- Comandos ejecutados y resultado.
- Riesgos o casos que deban seguir manuales.
- Lista exacta de archivos modificados.

## Stop conditions

Detenete y escalá si el setup E2E exige cambiar infraestructura de despliegue, si no puede levantarse la app localmente o si una prueba revela una vulnerabilidad de ACL. No “arregles de paso” comportamiento de los batches siguientes.
