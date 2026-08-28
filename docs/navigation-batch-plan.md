# Plan por batches — Navegación del Hub de Datos

## Objetivo

Corregir la navegación friccionada del proyecto de forma incremental, evitando un cambio masivo y conservando los comportamientos que ya funcionan: layout raíz persistente, sesión, tema, catálogo compartido, filtros en URL, autorización en servidor y compatibilidad con rutas históricas.

Este plan no propone un rediseño general ni una reescritura de los visores legacy. Cada batch debe poder desplegarse, verificarse y revertirse de manera independiente.

## Estrategia de ejecución

```text
Batch 0 · Contrato y cobertura
   ├── Batch 1 · Catálogo → ficha → retorno
   │      ├── Batch 2 · Visores legacy
   │      └── Batch 3 · Historial y scroll de Explore
   ├── Batch 4 · Administración
   └── Batch 5 · Estado del mapa
                ↓
        Batch 6 · Estados transversales y cierre
```

Después del Batch 0 pueden ejecutarse en paralelo:

- Agente A: batches 1 y 2.
- Agente B: batches 3 y 5.
- Agente C: batch 4.
- Agente QA independiente: validación de cada batch.
- Team Leader: revisión de contratos, integración, alcance y gates.

## Principios de navegación

- `push`: cambio de contexto intencional que el usuario espera recorrer con Back.
- `replace`: actualización incremental de filtros, cámara o estado efímero.
- Ruta real: cambio de entidad, recurso o sección principal.
- Estado interno: modal, panel visual o interacción que no necesita deep link.
- La autorización permanece en servidor; no debe duplicarse como autoridad en el cliente.
- Los cambios deben preservar sesión, tema, shell y datos compartidos siempre que la navegación permanezca dentro del App Router.

---

## Batch 0 — Contrato de navegación y red de seguridad

### Objetivo

Congelar el comportamiento válido antes de cambiar rutas o flujos.

### Tareas atómicas

1. Documentar la tabla canónica de rutas, redirects, protección y tipo de navegación.
2. Ampliar los tests de `lib/nav.ts`, `resource-href`, redirects y middleware.
3. Cubrir los estados anónimo, consulta, editor, admin y usuario sin permiso.
4. Formalizar cuándo se utiliza `push`, `replace`, ruta real o estado interno.
5. Incorporar smoke E2E de navegación, preferentemente con Playwright.
6. Añadir una comprobación capaz de detectar hard reloads inesperados.
7. Cubrir navegación con Back/Forward, query params y callback de Login.

### Archivos probables

- `lib/nav.ts`
- `lib/nav.test.ts`
- `lib/resource-href.test.ts`
- `lib/gate-static.test.ts`
- `middleware.ts`
- Configuración E2E nueva

### Criterio de salida

- Todas las rutas del sitemap tienen al menos un caso de prueba.
- Login callback, Forbidden, ACL y redirects continúan funcionando.
- Los tests pueden detectar una navegación documental inesperada.
- `pnpm test`, lint y build pasan.

### Rollback

El batch solo incorpora contrato, tests e infraestructura de validación; no cambia comportamiento productivo.

---

## Batch 1 — Navegación canónica catálogo → ficha → visor

### Objetivo

Evitar que una card salte la ficha del recurso o pierda el contexto del catálogo.

### Tareas atómicas

1. Hacer que todas las cards naveguen canónicamente a `/recursos/:id`.
2. Eliminar el redirect automático desde la ficha hacia `recurso.ruta`.
3. Mostrar un CTA explícito según formato: “Ver reporte”, “Abrir tablero” o “Abrir mapa”.
4. Incorporar “Volver a resultados” siempre visible.
5. Transportar un `returnTo` interno validado con la URL completa de Explore.
6. Usar `/explorar` como fallback cuando no exista un origen válido.
7. Mantener los breadcrumbs visibles independientemente del panel de detalles.
8. Evitar que los recursos relacionados arrastren un origen incorrecto.

### Archivos probables

- `lib/resource-href.ts`
- `components/resource-card.tsx`
- `app/recursos/[id]/page.tsx`
- `components/resource-experience.tsx`
- `lib/resource-presentation.ts`

### Criterio de salida

- Todas las cards llegan primero a una ficha.
- Volver recupera query, filtros y entrada de historial.
- Un `returnTo` externo o inválido nunca se ejecuta.
- La autorización se aplica antes de mostrar contenido.
- No se introducen master-detail ni parallel routes en esta etapa.

### Dependencia

Batch 0.

---

## Batch 2 — Contención progresiva de visores legacy

### Objetivo

Eliminar progresivamente el hard reload sin romper URLs históricas, assets ni ACL.

### Tareas atómicas

1. Conservar `/tablero`, `/mapa_interactivo`, `/mapa_sobreedad` y `/mapa_notas` como URLs compatibles.
2. Crear un contrato único para abrir visores desde la ficha del recurso.
3. Probar inicialmente un solo visor legacy dentro del shell mediante iframe o el proxy existente.
4. Validar assets relativos, cookies, autorización, fullscreen, descargas, CSP, sandbox y Back/Forward.
5. Migrar los demás visores únicamente después de aprobar el piloto.
6. Mantener temporalmente la apertura documental como fallback controlado.
7. Conservar el gate servidor como única autoridad de acceso.
8. No modificar el HTML legacy salvo que exista una incompatibilidad demostrable.

### Criterio de salida

- El visor piloto abre desde la ficha sin desmontar el shell.
- Sesión, tema y contexto de retorno sobreviven.
- Las URLs legacy directas continúan funcionando.
- Los assets no arrojan 404 y la ACL no se debilita.
- Existe rollback independiente por visor.

### Dependencia

Batch 1.

### Gate go/no-go

Si iframe, assets o seguridad requieren reescribir el legacy, conservar la apertura documental y separar esa migración como proyecto específico.

---

## Batch 3 — Explore: historial, scroll y continuidad

### Objetivo

Hacer predecibles los filtros, Back/Forward y el regreso desde una ficha.

### Tareas atómicas

1. Utilizar `push` para una búsqueda enviada o una entrada desde Home.
2. Utilizar `replace` para modificaciones incrementales y para limpiar filtros.
3. Mantener query, tema, nivel y formato como fuente de verdad URL.
4. Añadir paginación URL solo si el volumen real del catálogo la justifica.
5. Restaurar scroll al volver desde un detalle.
6. Llevar el foco al encabezado de resultados ante una consulta sustancialmente nueva.
7. Evitar reset de scroll en ajustes menores de filtros.
8. Probar la canonicalización para impedir loops de `router.replace`.
9. Mantener semántica idéntica entre filtros desktop y mobile.

### Criterio de salida

- Back no recorre cada microcambio de filtros.
- Forward restaura el estado exacto.
- Volver desde una ficha recupera listado y posición.
- Los deep links y URLs compartidas producen la misma vista.
- Mobile y desktop generan la misma query canónica.

### Dependencias

Batch 0 y contrato `returnTo` del Batch 1.

---

## Batch 4 — Administración navegable y CRUD continuo

### Objetivo

Establecer una sola fuente de verdad para la sección administrativa y preservar el contexto durante operaciones CRUD.

### Decisión recomendada

Usar `/admin?section=recursos` antes que crear seis rutas nuevas. Es el cambio mínimo y conserva el provider y los formularios actuales.

### Tareas atómicas

1. Definir un parámetro `section` validado según rol.
2. Sincronizar sidebar y tabs con la URL en ambas direcciones.
3. Convertir hashes antiguos a `?section=` mediante `replace`.
4. Eliminar la actualización de `tab` durante render.
5. Mostrar sidebar en desktop y tabs o selector en mobile desde una configuración compartida.
6. Preservar sección y scroll después de crear, editar o eliminar.
7. Añadir dirty guard al cerrar formularios modificados.
8. Restaurar el foco al control que abrió el modal.
9. Introducir pending y error por fila para deletes y saves.
10. Mantener `/admin` como única ruta protegida de entrada.

### Archivos probables

- `components/admin-shell.tsx`
- `components/admin-page.tsx`
- `app/admin/page.tsx`
- `components/hub-data.tsx`

### Criterio de salida

- `/admin?section=usuarios` abre directamente Usuarios.
- Back/Forward cambia correctamente de sección.
- Un editor no puede activar una sección exclusiva de administrador.
- Guardar o cancelar no devuelve silenciosamente a Recursos.
- Los cambios sin guardar requieren confirmación.
- Una mutación fallida permanece en contexto y muestra un error local.

### Dependencia

Batch 0. Puede ejecutarse en paralelo con los batches 1 a 3.

---

## Batch 5 — Estado navegable y rendimiento del mapa

### Objetivo

Permitir que el mapa se recargue, comparta y recorra con Back/Forward sin perder el contexto relevante.

### Tareas atómicas

1. Mantener `lng`, `lat` y `zoom` mediante `replaceState`.
2. Definir qué estado adicional es compartible: mapa base, capas activas, selección y búsqueda estable.
3. Serializar únicamente estado estable y compacto.
4. Restaurar el estado soportado en carga inicial y `popstate`.
5. Evitar una entrada de historial por movimiento de cámara.
6. Cancelar actualizaciones pendientes al desmontar.
7. Evitar volver a descargar GeoJSON innecesariamente al regresar.
8. Incorporar un loader contextual sin desmontar el shell.
9. Validar fullscreen, búsqueda y selección en desktop, mobile y teclado.

### Criterio de salida

- Una URL compartida reproduce la misma vista soportada.
- Pan y zoom no contaminan el historial.
- Back/Forward restaura el mapa sin loops.
- Entrar, salir y volver no produce fetches duplicados evitables.
- La ACL de `/mapas/matricula` permanece en servidor.

### Dependencia

Batch 0. Puede ejecutarse en paralelo con el Batch 4.

---

## Batch 6 — Auth, boundaries, accesibilidad y cierre

### Objetivo

Resolver las pérdidas de continuidad restantes y endurecer la navegación completa.

### Tareas atómicas

1. Añadir “Cancelar y volver” en Login.
2. Conservar la ruta fallida al llegar a Forbidden.
3. Ofrecer en Forbidden volver, cambiar de cuenta, regresar al catálogo o solicitar acceso si existe ese canal.
4. Crear `loading.tsx`, `error.tsx` y `not-found.tsx` contextualizados.
5. Restaurar foco al encabezado tras cambios reales de ruta.
6. Verificar `aria-current`, menús mobile y retorno de foco.
7. Añadir transiciones discretas solo en paneles, loaders y cambios de contenido.
8. Confirmar que tema, sesión y catálogo persisten entre rutas App Router.
9. Ejecutar la matriz completa en desktop, mobile y teclado.
10. Eliminar helpers de navegación muertos solo cuando el análisis de uso lo confirme.

### Criterio de salida

- Ningún error deja una pantalla sin salida.
- Login conserva deep links completos.
- Forbidden conserva contexto sin exponer recursos.
- No existen hard reloads salvo fallbacks legacy documentados.
- No hay loops, actualizaciones durante render ni pérdida de foco.
- Suite completa, lint, build y smoke E2E pasan.

### Dependencias

Batches 1 a 5.

---

## Gates obligatorios por batch

Cada batch debe atravesar las siguientes revisiones antes de integrarse:

1. **Agente implementador:** cambio acotado y tests locales.
2. **Agente revisor de navegación:** historial, URL, scroll, continuidad y remounts.
3. **Agente de seguridad:** auth, ACL, callback y rutas legacy cuando corresponda.
4. **Agente QA:** desktop, mobile, teclado y Back/Forward.
5. **Team Leader:** revisión del diff, rechazo de refactors laterales, confirmación del criterio de salida y autorización del siguiente batch.

## Matriz mínima de validación

| Área | Casos obligatorios |
|---|---|
| Rutas | Entrada directa, Link interno, redirect, 404 y URL con query/hash |
| Historial | Back, Forward, recarga y deep link compartido |
| Scroll | Cambio de filtro, entrada a ficha y retorno al listado |
| Foco | Navegación por teclado, cierre de menú/modal y cambio de ruta |
| Auth | Anónimo, consulta, editor, admin y usuario sin permiso |
| Legacy | Sesión válida, sesión ausente, permiso denegado, assets y descarga |
| Administración | Deep link de sección, Back/Forward, CRUD exitoso y fallido |
| Mapa | Cámara, capas soportadas, selección, fullscreen y URL compartida |
| Responsive | Desktop, 375 px, 390 px y controles táctiles |

## Decisiones que no bloquean el inicio

- Conservar los redirects `/reportes`, `/tableros` y `/mapas`.
- Mantener ACL y gate servidor sin reescritura.
- Utilizar `?section=` en Administración.
- Utilizar ficha completa con `returnTo`, sin master-detail inicialmente.
- Aplicar feature flag únicamente al piloto legacy si el riesgo técnico lo justifica.

## Fuera de alcance

- Rediseño visual general de Home.
- Reescritura completa de los HTML legacy.
- Nueva arquitectura de autenticación.
- Cambio del modelo de datos.
- Nuevas funcionalidades de IA.
- Parallel routes o master-detail antes de medir si el retorno contextual resulta insuficiente.

## Orden recomendado de integración

1. Batch 0.
2. Batch 1 y Batch 4 en paralelo.
3. Batch 3 y Batch 5 en paralelo.
4. Piloto del Batch 2.
5. Migración gradual de visores aprobados.
6. Batch 6 y regresión completa.

## Briefs de ejecución

- [Batch 0 — Contrato y cobertura](navigation-batches/batch-00-contrato-y-cobertura.md)
- [Batch 1 — Catálogo, ficha y retorno](navigation-batches/batch-01-catalogo-ficha-retorno.md)
- [Batch 2 — Visores legacy](navigation-batches/batch-02-visores-legacy.md)
- [Batch 3 — Historial y scroll de Explore](navigation-batches/batch-03-explore-historial-scroll.md)
- [Batch 4 — Administración](navigation-batches/batch-04-administracion.md)
- [Batch 5 — Estado del mapa](navigation-batches/batch-05-estado-mapa.md)
- [Batch 6 — Auth, boundaries y cierre](navigation-batches/batch-06-auth-boundaries-cierre.md)
