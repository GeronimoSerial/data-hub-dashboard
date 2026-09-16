# Plan de implementación por batches — Alertas de infraestructura en Data Hub

Versión 1.0 · 16 de septiembre de 2026.

Repositorio destino: [GeronimoSerial/data-hub-dashboard](https://github.com/GeronimoSerial/data-hub-dashboard).

Este es un plan de trabajo sobre el repositorio existente, no una implementación realizada. Cada batch es una entrega verificable con alcance y criterio de cierre propios. El objetivo es construir primero el recorrido completo y después terminar su integración y validación.

## 1. Alcance acordado

**Gestión Educativa únicamente entrega un enlace con el CUE. Todo lo que ocurre desde que se abre ese enlace es desarrollo nuestro dentro de data-hub-dashboard.**

Recorrido:

1. El director abre el enlace recibido desde Gestión Educativa.
2. Nuestro formulario toma el CUE y recupera establecimiento, secciones, matrícula y ubicación de nuestras fuentes.
3. El director informa la problemática y selecciona las secciones afectadas.
4. Nuestro servidor guarda y calcula el impacto.
5. El mapa del Hub muestra la alerta, sin aprobación previa.

No hay selector de CUE, alta del director, nuevo rol, asignación usuario–CUE, autenticación compartida ni servicio adicional que deba desarrollar Gestión Educativa. El Hub es exclusivamente de consulta de las alertas; sus roles actuales determinan quién puede visualizar el recurso.

Las únicas entradas del formulario son la problemática, las secciones afectadas y, opcionalmente, una descripción breve. El establecimiento aparece como información precargada. «Todas las secciones» simplifica una afectación completa.

## 2. Base real del repositorio

Revisión local sobre el commit `616a4a89e12ab278df76a870297266eacc83b251`. Antes de implementar, contrastar estos puntos con la rama de trabajo vigente; no asumir que esta copia seguirá siendo la última.

| Pieza existente | Ubicación | Uso en este desarrollo |
|---|---|---|
| Next.js, React y TypeScript | `app/`, `package.json` | Formulario, páginas y servicios en la misma aplicación. |
| Componentes y estilos del Hub | `components/ui/`, `app/globals.css` | Apariencia y controles consistentes. |
| Marco general de navegación | `components/app-shell.tsx`, `app/layout.tsx` | Variante liviana para el formulario de entrada externa. |
| Base SQLite con libSQL y Drizzle | `lib/db/index.ts`, `lib/db/schema.ts` | Persistencia de alertas y datos necesarios para el cálculo. |
| Inicialización actual de tablas y catálogo | `lib/db/seed.ts`, `lib/model.ts` | Integración de tablas nuevas y recurso de mapa en instalaciones existentes. |
| Datos persistentes | `lib/data-dir.ts` | Base y fuentes fuera de archivos públicos. |
| Autenticación y acceso a recursos | `lib/session.ts`, `lib/acl.ts`, `lib/db/recurso-access.ts` | Proteger la visualización y sus servicios de lectura. |
| Patrón de página de mapa | `app/mapas/matricula/page.tsx`, `map-client.tsx` | Referencia para el mapa nuevo con carga cliente de MapLibre. |
| Componentes cartográficos | `components/mapas/` | Reutilizar mapa base, controles y estilos cuando sus interfaces lo permitan. |
| Catálogo y enlaces | `lib/model.ts`, `lib/resource-href.ts`, `lib/recurso-write.ts` | Dar de alta el recurso y verificar navegación. |
| Pruebas existentes | `*.test.ts`, Vitest y Testing Library | Probar cálculos, acceso, persistencia y formulario. |

Se conserva la tecnología existente. No se agrega Leaflet por copiar el mockup, otra aplicación, otra base de datos ni un sistema de roles paralelo.

`lib/db/seed.ts` contiene DDL explícito: modificar solamente el esquema de Drizzle no basta para crear tablas en instalaciones existentes. Esta particularidad forma parte del batch de persistencia.

## 3. Rutas propuestas

Los siguientes nombres son decisiones de implementación propuestas, no rutas que ya existan.

| Ruta | Función | Acceso |
|---|---|---|
| `/problematicas/nueva?cue=1800505` | Formulario con establecimiento precargado | Enlace con CUE, sin sesión del Hub. |
| `GET /api/problematicas/contexto?cue=…` | Datos mínimos de la escuela y sus secciones | Mismo contrato de entrada por CUE. |
| `POST /api/problematicas` | Registrar situación y secciones; calcular impacto | Validación del CUE y de sus secciones, sin nuevo rol. |
| `/mapas/infraestructura` | Visualización de alertas | Sesión y audiencia del recurso del Hub. |
| `GET /api/mapas/infraestructura` | Puntos, lista e indicadores con filtros | Mismos controles de acceso que la página del mapa. |

El CUE de ejemplo es ilustrativo del formato, no una instrucción para crear una alerta real.

### Contrato mínimo del enlace

- Único parámetro externo requerido: `cue`.
- No se requiere token de Gestión, identidad del director, firma, sesión compartida ni consulta de permisos a otro sistema.
- Nuestro servidor normaliza y valida el CUE, verifica que exista en la fuente disponible y obtiene sus secciones.
- El formulario no permite editarlo ni elegir otro establecimiento.
- Si falta el CUE o no existe, se presenta un mensaje claro; no se muestra un padrón completo como alternativa.
- Un CUE base agrupa sus localizaciones conocidas. Si el formato recibido contiene anexo, se preserva ese alcance. La regla se valida con la fuente, sin convertir silenciosamente un CUE base en anexo `00`.
- Las secciones pueden mostrar su sede/turno para desambiguar; esto no incorpora un selector de CUE.

Con el contrato de solo CUE, el sistema puede validar la escuela y la coherencia de la carga, pero no acreditar quién abrió el enlace. Registrar «carga por enlace con CUE» como origen; no inventar un director autenticado. Este límite no se convierte en una nueva dependencia para Gestión Educativa.

## 4. Orden de entregas

| Batch | Entrega | Depende de | Resultado verificable |
|---|---|---|---|
| 1 | Entrada por CUE y fuentes | — | Un enlace resuelve la escuela y sus secciones. |
| 2 | Persistencia y cálculo | 1 | Una carga se guarda y produce totales correctos. |
| 3 | Formulario completo | 1–2 | Se registra una problemática desde teléfono sin elegir CUE. |
| 4 | Lectura e indicadores del mapa | 2 | El Hub consulta alertas y totales sin duplicaciones. |
| 5 | Mapa e integración con catálogo | 3–4 | Una carga se refleja en el mapa del Hub. |
| 6 | Validación integral y puesta en marcha | 1–5 | Recorrido completo comprobado con datos y despliegue preparado. |

Un batch se cierra con código revisable, pruebas pertinentes y evidencia de su criterio de aceptación. No se mezclan refactorizaciones generales del Hub con esta funcionalidad.

## Batch 1 — Entrada por CUE y conexión con nuestros datos

### Objetivo

Abrir el enlace y resolver toda la información necesaria para el formulario, sin pedir al director que identifique nuevamente su establecimiento.

### Trabajo

1. Revisar las instrucciones del repositorio y su estado al iniciar la implementación.
2. Crear los tipos del módulo y la normalización de CUE/anexo como identificadores de texto.
3. Definir un adaptador propio para obtener localizaciones, secciones y matrícula por CUE. No necesita ser un servicio de Gestión Educativa: consume nuestras fuentes disponibles.
4. Incorporar la planilla de localizaciones como fuente de referencia, preservando CUI y calidad geográfica.
5. Obtener una muestra estructural de la fuente real de secciones y nominalización: clave estable de sección, CUE/anexo, turno, corte e identificador estable de alumno.
6. Implementar el servicio de contexto y una página mínima que muestre escuela y secciones.
7. Responder con nombre de sección y matrícula agregada; no enviar nombres, documentos ni identificadores individuales de alumnos al formulario.

### Archivos previstos

- `lib/infraestructura/types.ts`
- `lib/infraestructura/cue.ts`
- `lib/infraestructura/fuentes.ts`
- `lib/infraestructura/contexto.ts`
- `app/api/problematicas/contexto/route.ts`
- `app/problematicas/nueva/page.tsx`
- Pruebas de normalización y resolución junto a los módulos.

### Datos disponibles y trabajo pendiente

La planilla tiene 2.049 combinaciones CUE–Anexo, 1.992 CUI numéricos, 56 CUI vacíos y una anotación textual en lugar de CUI. Hay 47 registros con alguna coordenada vacía. El HTML contiene 2.005 registros: conciliar por clave, no por posición de fila ni nombre.

La matrícula por sección y la nominalización fueron confirmadas por el usuario, pero no se inspeccionó todavía su archivo o conexión real. Es la dependencia de datos principal. Se puede avanzar con muestras ficticias para desarrollo; no cerrar la integración real con cifras inventadas.

### Criterio de cierre

- CUE válido: escuela correcta y únicamente sus secciones.
- CUE inexistente o faltante: error entendible, sin lista de CUE alternativos.
- CUE base y CUE–Anexo no se confunden.
- Ningún dato nominal se entrega al navegador.
- Contrato de fuentes documentado y probado con muestra real o, si falta, dependencia explícita sin afirmar integración completada.

## Batch 2 — Guardado de problemáticas y motor de impacto

### Objetivo

Guardar una problemática de forma consistente y calcular alumnos, secciones y establecimientos afectados del lado del servidor.

### Modelo mínimo propuesto

| Información | Persistencia |
|---|---|
| Corte de datos | Versión, fecha y fuente de la matrícula y localizaciones. |
| Localización | CUE, anexo, CUI nullable, nombre, territorio, coordenadas nullable. |
| Sección por corte | Identificador estable, localización, nivel, turno y matrícula conocida. |
| Membresía nominal | Clave interna estable de alumno y sección por corte; sin copiar nombres o documentos innecesarios. |
| Problemática | ID, CUE recibido normalizado, categoría, descripción opcional, fecha de servidor, estado y clave de reintento. |
| Secciones de la problemática | Relación única problemática–sección, con corte utilizado. |

Si las fuentes ya están en una base accesible, el adaptador puede consultarlas sin duplicarlas completas. La problemática debe conservar una referencia estable al corte utilizado. Para fuentes en archivos, usar importación controlada a tablas con prefijo `infra_` en la base existente. Conservar los cortes referenciados por alertas y un indicador del corte vigente.

### Trabajo

1. Incorporar tablas y restricciones en Drizzle y su creación/versionado compatible con `lib/db/seed.ts`.
2. Implementar una importación transaccional de fuentes cuando corresponda; activar un corte solo después de verificar sus relaciones.
3. Indexar secciones por CUE/localización/corte, membresías por sección/corte y alertas por estado/CUE/fecha.
4. Validar el cuerpo con Zod: categoría, descripción acotada, CUE válido y lista de secciones no vacía.
5. Rechazar secciones que no pertenezcan al CUE recibido. No aceptar totales enviados por el navegador como resultados oficiales.
6. Guardar problemática y secciones en una sola transacción.
7. Usar una clave de reintento única para que doble clic o reenvío no duplique la carga. Un reintento con contenido distinto devuelve conflicto.
8. Calcular alumnos por unión de identificadores nominales; contar secciones distintas, CUE distintos y CUI distintos por separado.
9. Conservar el corte original para el detalle registrado. El mapa actual usa un único corte vigente para todas las alertas activas, resuelve sus secciones mediante claves estables y muestra ese corte. Secciones que no puedan resolverse se marcan como cálculo incompleto; no desaparecen del conteo de alertas.

### Archivos previstos

- `lib/db/schema.ts`
- `lib/db/seed.ts` y/o `lib/db/infraestructura-migrations.ts`
- `lib/infraestructura/repository.ts`
- `lib/infraestructura/impacto.ts`
- `lib/infraestructura/validacion.ts`
- `app/api/problematicas/route.ts`
- `scripts/import-infraestructura.mjs`, si las fuentes se entregan como archivos.

### Criterio de cierre

- Dos secciones de 25 alumnos distintos producen 50, no la matrícula total del CUE.
- Dos alertas sobre la misma sección no duplican alumnos en el consolidado.
- Un CUI compartido no marca automáticamente otros CUE como afectados.
- Matrícula faltante se informa como incompleta, no como cero.
- Un reintento no crea una segunda alerta.
- Si falla el guardado, no queda una alerta sin sus secciones.
- La actualización de datos no destruye el corte de registros anteriores.
- La inicialización funciona tanto sobre una base nueva como sobre una copia de la base existente.

## Batch 3 — Formulario breve y funcional

### Objetivo

Completar el recorrido del director dentro de nuestro desarrollo, desde el enlace con CUE hasta la confirmación de carga.

### Trabajo

1. Terminar `/problematicas/nueva?cue=…` con una vista liviana basada en los componentes del Hub.
2. Adaptar `AppShell` para esta ruta: encabezado institucional y formulario, sin menú de cuenta, navegación administrativa ni invitación a iniciar sesión.
3. Mantener los hooks del componente en un orden estable al introducir esta variante; no realizar una reorganización general del layout.
4. Verificar que `HubDataProvider` no condicione el formulario a una sesión o a la carga del catálogo; aislar esa dependencia solo donde sea necesario.
5. Mostrar nombre del establecimiento y CUE como texto de referencia, sin input editable.
6. Ofrecer categoría, secciones con matrícula y descripción opcional.
7. Agrupar secciones por turno/localización solo para facilitar lectura, con opción de seleccionar todas dentro del alcance recibido.
8. Mostrar el impacto preliminar con el mismo criterio del servidor y reemplazarlo por el resultado confirmado al guardar. Si calcular la unión requiere nominalización, hacerlo en servidor sin enviar membresías al cliente.
9. Mostrar estado de envío, evitar doble envío y conservar campos ante fallos de conexión.
10. Tras guardar, confirmar el registro y los totales; no enviar al director al login del Hub.

### Archivos previstos

- `app/problematicas/nueva/page.tsx`
- `components/infraestructura/formulario-problematica.tsx`
- `components/infraestructura/secciones-selector.tsx`
- `components/app-shell.tsx`
- `lib/nav.ts`, si se incorpora un helper para reconocer la ruta.
- `app/globals.css`, únicamente estilos necesarios del módulo.

### Criterio de cierre

En un teléfono se puede abrir un enlace válido, identificar la escuela precargada, seleccionar dos secciones y guardar. No aparece una lista de CUE, un nuevo rol, un alta de usuario ni una pregunta adicional sobre la organización educativa.

La confirmación solo aparece después de persistir. El formulario funciona con teclado y sin mapa. Un error de envío no obliga a volver a completar todo.

## Batch 4 — Lectura protegida e indicadores consolidados

### Objetivo

Entregar al mapa un único resultado coherente para puntos, lista e indicadores.

### Trabajo

1. Implementar la consulta de alertas activas y sus filtros por territorio, nivel, establecimiento y categoría.
2. Proteger cada solicitud con `getSessionUser()`, `loadRecursoAccessByRuta()` y `puedeAbrir()`, como la página existente de matrícula. La protección no puede limitarse a la página.
3. Contar alumnos y secciones mediante uniones, no sumando las cifras de cada alerta.
4. Limitar población al nivel filtrado; un CUE con varios niveles no aporta toda su matrícula a un solo nivel.
5. Mantener el mismo universo de filtros para la lista, los indicadores y los puntos. Los casos sin coordenadas permanecen en lista y totales.
6. Entregar únicamente coordenadas, identificación institucional, problemática, cifras y fecha de actualización. No entregar nominalización.
7. Empezar con conteos absolutos claros; si se muestran porcentajes, usar como denominador el universo educativo filtrado, no solo las escuelas que ya tienen alerta.
8. Evitar caché compartida de respuestas autorizadas; cada consulta comprueba el acceso vigente y lee datos actualizados.

### Archivos previstos

- `app/api/mapas/infraestructura/route.ts`
- `lib/infraestructura/consulta.ts`
- `lib/infraestructura/impacto.ts`
- `lib/infraestructura/acceso-lectura.ts`

### Criterio de cierre

- Sin sesión o sin audiencia permitida, la API no entrega el conjunto del mapa.
- Un usuario permitido obtiene el mismo total en lista e indicadores.
- Varios incidentes sobre una escuela cuentan una escuela afectada.
- Se distingue cantidad de CUE, localizaciones e inmuebles, sin mezclarlas.
- Los casos sin CUI o coordenadas se informan sin excluirlos del resto de los totales.

## Batch 5 — Mapa de infraestructura dentro del Hub

### Objetivo

Publicar la experiencia de consulta completa usando el sistema de mapas y catálogo existente.

### Trabajo

1. Crear la página protegida `/mapas/infraestructura` siguiendo el patrón de matrícula.
2. Cargar MapLibre en cliente con el mismo mecanismo de carga diferida existente.
3. Reutilizar controles cartográficos compatibles; crear componentes específicos para indicadores, lista y ficha de infraestructura.
4. Mostrar alertas activas como puntos, con agrupación visual cuando se superpongan. CUI compartido sirve para explicar el inmueble; no para multiplicar afectaciones.
5. Incorporar búsqueda y filtros, indicadores de alumnos/secciones/escuelas, lista sincronizada y ficha de consulta.
6. No agregar botones de crear, editar o finalizar en el mapa del Hub.
7. Crear el recurso con ID estable y ruta `/mapas/infraestructura`, formato mapa, nivel transversal y categoría infraestructura. Reutilizar los tags territorial y alertas que ya existen.
8. Agregarlo de forma idempotente también a una base poblada: no alcanza con añadir una entrada a `lib/model.ts` y esperar que el seed vuelva a ejecutarse completo.
9. Respetar la audiencia configurada en el recurso y no sobrescribirla en reinicios o actualizaciones.
10. Verificar `isAllowedRuta`, `resourceCardTarget`, explorador y navegación para que el recurso abra su página correcta.
11. Tras un guardado, el registro queda consultable en la siguiente petición, sin cola de aprobación. Para mapas ya abiertos, usar actualización al recuperar foco y consulta periódica propuesta de 15 segundos; cancelar al desmontar y pausar cuando la pestaña está oculta. No agregar WebSockets inicialmente.

### Archivos previstos

- `app/mapas/infraestructura/page.tsx`
- `app/mapas/infraestructura/map-client.tsx`
- `components/mapas/map-infraestructura-page.tsx`
- `components/infraestructura/indicadores.tsx`
- `components/infraestructura/lista-alertas.tsx`
- `components/infraestructura/ficha-alerta.tsx`
- `lib/infraestructura/use-alertas.ts`
- `lib/model.ts`, `lib/db/seed.ts` y validadores de rutas solo si requieren ajuste.

### Criterio de cierre

Dos ventanas permiten demostrar el recorrido: se guarda una problemática en el formulario y aparece al consultar el mapa; una pestaña ya abierta la incorpora en el siguiente ciclo de actualización. Los totales coinciden con las secciones seleccionadas y los filtros aplicados.

La actualización periódica no es moderación: la alerta existe inmediatamente tras guardar. La única latencia adicional de una vista ya abierta es su intervalo de consulta.

## Batch 6 — Verificación integral y entrega operativa

### Objetivo

Completar un incremento listo para desplegar con evidencia de que funciona dentro del Hub y conserva las funciones actuales.

### Trabajo

1. Conciliar una muestra real de localizaciones, secciones y matrícula; identificar qué corte se utiliza en producción.
2. Ejecutar los casos de cálculo y acceso de los batches anteriores sobre datos de prueba conocidos.
3. Verificar formulario en teléfono, teclado, errores y reintentos; mapa con alertas, vacío, filtros y ubicaciones faltantes.
4. Comprobar regresiones del mapa de matrícula, login, catálogo, audiencias y administración de usuarios.
5. Ejecutar `pnpm test`, `pnpm lint` y `pnpm build`; corregir fallos introducidos y documentar los preexistentes, sin ampliar el cambio innecesariamente.
6. Preparar despliegue usando la infraestructura del proyecto y `DATA_DIR`; verificar que reiniciar la aplicación no pierda alertas ni repita importaciones destructivas.
7. Probar sobre una copia consistente de SQLite; documentar migraciones aditivas y reversión de aplicación que conserve los registros nuevos. Evitar restaurar una copia antigua encima de nuevas cargas válidas.
8. Documentar el enlace final con `cue`, las fuentes/cortes cargados y la forma de mantener esos datos.
9. Hacer una revisión del código antes de cualquier merge y entregar el cambio por el flujo de revisión del repositorio.

### Criterio de cierre

El recorrido completo está verificado: enlace con CUE → datos de la escuela → formulario → persistencia → cálculo → mapa protegido. No hay cambios de roles ni pasos nuevos exigidos a Gestión Educativa. La entrega incluye evidencia de pruebas, limitaciones de datos y procedimiento de despliegue.

Este plan no ejecuta despliegues, modifica DNS ni publica cambios. La ejecución de los batches y la puesta en marcha son trabajo posterior.

## 5. Límites para mantener el proyecto simple

Quedan fuera de estos batches:

- Rol Director y padrón de permisos director–CUE dentro del Hub.
- Selector, buscador o listado de CUE en el formulario.
- SSO, tokens o validaciones que deba implementar Gestión Educativa.
- Alta de usuarios para cargar la problemática.
- Asignación de responsables, seguimiento de obras o reparaciones.
- Moderación antes de publicar la alerta.
- Formularios nominales para seleccionar alumnos individualmente.
- Predicciones, prioridades automáticas y notificaciones.
- Exportaciones, adjuntos y operación completa sin conexión.

La actualización o finalización de una problemática no se agrega silenciosamente a esta primera entrega de carga y visualización. La base deja un estado preparado para esa evolución; el producto inicial identifica los registros como «problemáticas reportadas» y muestra su fecha. Hasta definir cómo se finalizan, no se presenta su persistencia como verificación continua de que el problema sigue ocurriendo.

## 6. Entregables de cada batch

Cada entrega debe incluir:

1. Cambio acotado dentro de data-hub-dashboard.
2. Resumen de comportamiento y archivos modificados.
3. Pruebas pertinentes y criterio de cierre demostrado.
4. Migración o actualización de datos cuando corresponda.
5. Dependencias o limitaciones reales que afecten el siguiente batch.

No se fija un calendario artificial antes de revisar las fuentes de matrícula. La secuencia y los criterios permiten estimar cada batch cuando esa dependencia esté resuelta.

## 7. Primer batch para ejecutar

Comenzar por **entrada por CUE y conexión con nuestros datos**. Es el punto que permite validar la integración real con el menor desarrollo: que un enlace abra exactamente la escuela esperada y que nuestras fuentes devuelvan sus secciones y matrícula. Sobre esa base se construyen guardado, formulario y mapa.
