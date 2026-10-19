# Auditoría de reportes y mapa de infraestructura

Implementación local del [plan acordado](2026-10-18-plan-auditoria-liviana.md), 2026-10-19. Pendiente: despliegue y medición con carga representativa en staging. No se modificó ningún entorno remoto.

## Comportamiento

La migración aditiva `0030_auditoria_infraestructura.sql` crea `auditoria_evento` sin claves foráneas destructivas. Conserva identidad disponible, vía de acceso, hora UTC, acción, patrón de ruta, referencia de objeto/CUE, resultado, estado HTTP y duración hasta preparar el registro. La hora del visor es Buenos Aires. Los ID de solicitud se generan en el servidor y se devuelven como `X-Request-Id`.

Los 21 handlers de escritura de reportes/infraestructura declaran su acción y patrón mediante `conAuditoria`. La prueba `cobertura.test.ts` descubre exportaciones con TypeScript, incluidas las cuatro rutas de la fábrica de verificaciones, y falla ante nuevas escrituras sin declaración. El middleware/proxy y solicitudes que no llegan a la aplicación quedan fuera de esa cobertura.

| Recorrido | Acciones |
|---|---|
| Parte | Acceso compartido, alta/actualización/confirmación, intentos inválidos, errores y reenvíos idempotentes |
| Borradores | Creación, sincronización PUT, descarte y cierre al enviar el parte |
| Fotos | Movimiento de evidencia, autorización de carga y confirmación de objetos |
| Verificaciones | Creación, validación de token, canje de sesión, respuesta por enlace/asistida, vínculo de movimiento y cancelación |
| Administración | Alta/edición/baja de motivos, otorgamiento/revocación nominal y creación/revocación de enlaces de veredicto |
| Lecturas prioritarias | Contexto/parte/historial, exportaciones de escuelas/situación, autorizaciones de lectura de fotos, consulta de enlace compartido y PDFs |

La auditoría nominal especializada del mapa y sus borradores se conserva en sus tablas actuales; no se duplica con un evento genérico para la misma apertura. No se instrumentaron gestos del mapa ni todos sus GET automáticos. Usuarios, recursos, taxonomías y autenticación general siguen fuera del alcance.

## Transacciones y fallas

`cambioAuditado` inserta el evento antes del commit de la misma transacción que modifica el dominio. El contexto de base mediante AsyncLocalStorage permite que los servicios llamados dentro de esa operación usen la misma conexión; no abre una transacción durante validaciones o consultas GE ajenas a esa operación. Los contextos se comparten entre bundles de Next mediante claves globales y se aíslan entre solicitudes.

El parte incorpora su vínculo opcional de verificación dentro de la transacción. Un savepoint conserva el comportamiento de vínculo opcional ante un error y evita invalidar la transacción principal; el evento especializado de vínculo fallido también debe persistirse. La solicitud no confirma cambios si su evento obligatorio falla.

Si falla la inserción de auditoría, los cambios se revierten y la API responde `503` con `code: auditoria_no_disponible`. También se bloquean cookies y URLs firmadas todavía no entregadas. Los rechazos sin cambios reciben una inserción independiente. Una caída total del almacenamiento puede impedir guardar el intento: no se afirma que ese intento esté registrado. El log operativo sólo expone acción e ID de solicitud.

La confirmación de fotos consulta HEAD en OBS antes de la transacción de actualización. La autorización sólo firma URLs: no sube imágenes. La escritura durable termina antes de entregar las firmas, incluso cuando se reutilizan firmas del caché. No se promete atomicidad entre OBS y PostgreSQL ni se interpreta una URL emitida como descarga completada.

## Identidad, datos y consulta

Se reutiliza el usuario resuelto por la sesión. Si autorizó la contraseña compartida, se registra `compartido`; si autorizó un enlace, se referencia la verificación/enlace persistido. La credencial que autorizó no se sustituye por una cuenta que pudiera estar abierta. Los nuevos movimientos y fotos no atribuyen autores personales ficticios a `director` o `public-parte`. Los registros históricos conservan sus valores previos.

Los metadatos tienen lista permitida, validación de formato y presupuesto de tamaño, más un CHECK de 4 KiB en base. No contienen cuerpos completos, contraseñas, cookies, tokens, nombres de alumnos o URLs firmadas. Las referencias al historial permiten consultar los cambios de negocio existentes. No se guardan nuevos snapshots nominales.

`/admin/auditoria` y `GET /api/infraestructura/auditoria` son exclusivos de administradores no bloqueados. Filtros: `actorId`, `accion`, `cueAnexo`, `objetoId`, `resultado`, `desde`, `hasta` exclusivo. Las fechas de API requieren zona horaria. `limite` admite 1–100 y el cursor usa fecha/ID; no hay consulta de totales ni carga completa del historial. No hay prefetch del enlace del visor. El endpoint de auditoría no se audita recursivamente.

IndexedDB conserva los pendientes offline que ya existían. No se agregó una segunda petición de logging del navegador. El `503` es reintentable por la cola existente. El historial se consulta al abrir el visor. No hay eliminación automática de eventos ni endpoints para modificarlos. El rol SQL sigue siendo el que usa la aplicación: revisar sus privilegios en staging antes de declarar los eventos inmutables frente a escrituras SQL directas.

## Operación CLI

El CLI de datasets (`scripts/datasets-infraestructura.mjs`) ejecuta cada comando y su evento dentro de una transacción compartida. Las referencias incluyen dataset/versión cuando están disponibles. Los comandos que procesan varias versiones comparten el evento de comando; sus versiones siguen en el repositorio especializado.

El punto de entrada `scripts/jobs.mjs` guarda una intención durable antes de despachar y un resultado al terminar, con el mismo requestId y referencia de jobRun cuando el job la devuelve. Un proceso interrumpido deja su intención pendiente. Un job puede publicar varios lotes o afectar OBS; su auditoría se expresa por etapas, sin prometer rollback global. La intención fallida impide despachar el job.

`INFRA_AUDIT_OPERATOR` permite identificar al operador/servicio configurado; sin ella se usa el servicio genérico y no se inventa una persona. `INVOCATION_ID` referencia la ejecución de systemd; por sí sola no prueba que haya sido programada. `INFRA_AUDIT_TRIGGER=manual|programado` permite declarar el disparador desde el invocador; sin esa declaración sólo se registra `cli` o `systemd`. Esto no cubre SQL directo ni otros scripts que omitan estos puntos de entrada.

## Validación local

- Suite de rutas, servicios afectados, visor, cobertura y jobs: **588 pruebas aprobadas**, más una medición opcional omitida en la ejecución normal.
- Migración y pruebas de atomicidad en PGlite y PostgreSQL 18 local desechable; incluye fallas forzadas de inserción, reintentos, aislamiento concurrente de actores, sanitización y paginación con fechas iguales.
- Compilación de producción y TypeScript aprobados. ESLint de archivos afectados sin errores.
- Navegador con sesión real: sin consulta anticipada del historial, páginas 50/3/50, filtros, referencias, vacío y acceso anónimo denegado. Escritorio 1440 px y móvil 390 px sin desbordamiento horizontal ni errores JavaScript; estados de carga/error/reintento, navegación de teclado y temas claro/oscuro verificados.
- La escritura de aplicación agrega eventos, sin cascadas desde usuario/objeto. No se evaluaron privilegios SQL de un entorno remoto.

### Medición reproducible

`AUDITORIA_MEDIR=1 pnpm exec vitest run lib/infraestructura/auditoria/rendimiento.test.ts --maxWorkers=1`

Sin DATABASE_URL usa PGlite temporal. Para PostgreSQL, usar una base **vacía y desechable cuyo nombre termine en `_test`** y pasar su DATABASE_URL; el test rechaza otros nombres. `AUDITORIA_MEDICION_ARCHIVO` controla la salida JSON; por defecto `/tmp/auditoria-medicion.json`. El bypass sin auditoría existe exclusivamente en el mock del test, no en producción.

60 muestras por modo y recorrido, tras 10 pares de calentamiento; modos alternados, carga secuencial, mismo pool. Se mide el handler completo y lectura de respuesta, sin red HTTP, con sesión de prueba y firmas OBS locales (sin carga real ni HEAD remoto). El parte medido confirma una afectación existente; sync modifica un borrador; fotos firma autorizaciones nuevas; verificación responde una solicitud nueva. No representa concurrencia, red remota o carga de staging. El caudal del JSON es el inverso de la duración secuencial, no una capacidad máxima.

| Recorrido | PGlite p50 sin/con (ms) | PGlite p95 sin/con (ms) | PostgreSQL p50 sin/con (ms) | PostgreSQL p95 sin/con (ms) | Δ p95 PostgreSQL |
|---|---:|---:|---:|---:|---:|
| Parte | 13,215 / 13,716 | 15,409 / 15,539 | 28,006 / 28,141 | 33,166 / 34,904 | +1,738 ms |
| Sync | 3,493 / 3,974 | 4,333 / 4,745 | 7,959 / 8,098 | 9,308 / 10,176 | +0,868 ms |
| Fotos | 1,276 / 1,801 | 1,379 / 1,966 | 1,686 / 4,988 | 2,113 / 5,811 | +3,698 ms |
| Verificación | 2,376 / 2,832 | 2,659 / 3,493 | 6,137 / 7,033 | 8,135 / 9,161 | +1,026 ms |

Las cuatro diferencias locales quedan bajo el objetivo propuesto de +10 ms. La aceptación de rendimiento de staging sigue pendiente.

## Despliegue y reversión

Incluir la migración 0030 y aplicarla con el mecanismo versionado existente antes de habilitar la nueva versión en staging. Comprobar permisos de inserción/consulta del rol real, recorrido offline/fotos/verificación, crecimiento de tabla, latencia p50/p95, caudal y conexiones bajo carga representativa. La aplicación ya espera su migración antes de capturar solicitudes.

Revertir la aplicación conserva `auditoria_evento` y sus eventos; no borrar esa tabla para revertir código. La versión anterior vuelve a operar con su cobertura previa, por lo que no debe presentarse como cumplimiento de la garantía nueva. Acordar retención antes de incorporar cualquier limpieza.
