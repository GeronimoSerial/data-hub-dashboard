# Plan de auditoría liviana por solicitud

Estado actualizado 2026-10-19: implementación local y validación completadas; pendiente despliegue y medición con carga de staging. Ver [implementación, cobertura y resultados](2026-10-19-implementacion-auditoria.md). El diseño original es del 2026-10-18.

Cada POST dentro del alcance debe dejar un registro mínimo que permita saber quién actuó, qué intentó hacer, sobre qué objeto, cuándo y con qué resultado. La captura ocurre en el servidor, reutiliza la identidad ya resuelta y evita solicitudes adicionales desde el navegador. Una escritura durable tiene costo: se medirá para comprobar que no degrada de forma perceptible los recorridos.

Base: [relevamiento delegado a GPT-6 Luna high](2026-10-18-auditoria-reportes-infraestructura.md).

## Alcance y supuestos

| Tema | Criterio |
|---|---|
| Confirmado por el usuario | Registro mínimo por cada POST; prioridad a navegación ágil y capturar todo lo posible. |
| Métodos complementarios | Cubrir también PUT, PATCH y DELETE dentro de estos módulos. El borrador remoto se sincroniza con PUT y hay bajas por DELETE. |
| Alcance confirmado | Reportes de infraestructura y mapa de infraestructura, incluidos sus endpoints propios de verificaciones, fotos, motivos, permisos nominales y enlaces. No se extiende la captura general a usuarios, recursos, taxonomías o autenticación de toda la aplicación. |
| Política confirmada | Ningún cambio dentro del alcance se confirma sin su auditoría durable. Si falla la escritura del evento, se revierte el cambio de base y se informa el error. |
| Identidad | Usar la sesión existente. Sin cuenta personal: registrar enlace referenciado, acceso compartido o anónimo según evidencia; nunca inventar una persona. |
| Lecturas prioritarias | Conservar el log nominal actual; agregar consultas nominales del parte/contexto y exportaciones/archivos/enlaces sensibles. No instrumentar cada GET automático o gesto del mapa en la primera entrega. |
| Visor | Propuesta: consulta paginada y de sólo lectura para admin, por usuario, fecha, acción, CUE/objeto y resultado. |
| Datos y retención | Payload pequeño con campos permitidos. Sin borrado automático inicial; acordar retención y medir crecimiento antes de agregar limpieza. |

## Registro mínimo

Tabla candidata `auditoria_evento`, independiente de los historiales de negocio existentes:

| Campo | Uso |
|---|---|
| `id`, `requestId` | Identificar evento e intento de solicitud. Generados en servidor; no confiar en un identificador arbitrario del cliente. |
| `ocurridoEn` | Hora del servidor con zona horaria; almacenamiento UTC y presentación Buenos Aires. |
| `actorTipo`, `actorId`, `actorRol`, `viaAcceso` | Usuario, credencial de enlace referenciada, sistema, compartido o anónimo. La vía que autorizó no se confunde con la cuenta que pudiera estar abierta. |
| `accion`, `metodo`, `rutaPlantilla` | Nombre de operación, método y patrón de ruta. Sin tokens ni URLs completas. |
| `objetoTipo`, `objetoId`, `cueAnexo` | Referencia principal y establecimiento cuando se conoce. |
| `resultado`, `httpStatus`, `duracionMs` | Éxito, rechazo, inválido, conflicto, sin cambio, repetido o error; estado HTTP y tiempo de proceso. Registrar respuesta preparada/servida, no recepción garantizada por el cliente. |
| `metadatos` | JSON limitado y por lista permitida: movimientoId, draftId, verificacionId, attachmentId, revisión, campos modificados, formato o cantidades. Objetivo inicial de hasta 4 KiB por evento. |

No se vuelven a copiar fotos, formularios completos, nombres de alumnos o snapshots grandes. Para reconstruir cambios se referencia `infra_movimiento` y los eventos de verificación. Los antes/después adicionales se limitan a campos relevantes y permitidos; no se promete reconstrucción exacta a partir de conteos.

La tabla conserva filas aunque se elimine el objeto o cambie el rol del usuario: sin cascadas destructivas. La escritura de aplicación sólo agrega eventos; el visor no modifica ni elimina. Revisar los permisos reales del rol de base antes de afirmar que los registros son inmutables.

Empezar con índices para fecha/ID y usuario/fecha; agregar objeto/fecha si la consulta lo justifica. No indexar todo el JSON, crear particiones ni introducir otra base antes de medir volumen.

## Captura común y persistencia

1. Crear una envoltura de Route Handlers con un contexto de auditoría por solicitud: asigna ID/hora, recibe actor y objeto desde la guarda/operación y observa resultado/errores.
2. Definir acción y ruta mediante un catálogo explícito. Cubrir retornos tempranos por validación, 401/403/409/429, feature flag deshabilitada y excepciones. No leer ni clonar bodies completos para descubrir qué pasó.
3. Reutilizar el usuario que ya obtuvo la ruta. `getSessionUser()` consulta sesión y pertenencias: repetirlo para cada evento agregaría trabajo innecesario. La guarda debe poder entregar la identidad y la vía de acceso junto con su decisión.
4. Para todos los cambios de base dentro del alcance, insertar evento y efecto dentro de la misma transacción: se confirman ambos o ninguno. Registrar éxito confirmado sólo cuando haya commit. Los rechazos y rollbacks se registran fuera de la transacción revertida.
5. Coordinar envoltura y dominio por el ID de evento: evitar un evento de éxito duplicado desde ambas capas. No marcar el evento como persistido hasta que la transacción termine. Unificar transacciones de base para no introducir cambios confirmados sin evento. Para OBS u otros efectos externos, guardar intención durable antes de habilitar/ejecutar el efecto y registrar su resultado por etapas correlacionadas; no afirmar atomicidad entre OBS y PostgreSQL. No entregar una URL de autorización/lectura si no quedó auditada su emisión.
6. Para una solicitud sin cambio de dominio, realizar una sola inserción pequeña antes de finalizar. Los eventos posteriores a la respuesta, las promesas sin esperar y una cola únicamente en memoria no serán la única copia de una auditoría obligatoria.
7. Si falla la base, impedir el cambio y emitir una señal operativa saneada. No responder éxito de un cambio revertido ni fingir que un intento quedó auditado si no se guardó. Una caída total del almacenamiento puede impedir guardar el intento fallido; la garantía es que no haya efectos confirmados sin su evento durable.

POST no significa necesariamente modificación: validar un token o iniciar sesión también debe tener registro mínimo. Tampoco usar sólo middleware: el actual atiende redirecciones/archivos estáticos, y el resultado, actor y objeto de negocio se conocen en la ruta/servicio.

## Entregas y aceptación

| Entrega | Trabajo | Criterio de aceptación |
|---|---|---|
| 1. Base y cobertura | Contrato, catálogo, tabla/migración aditiva, escritor y envoltura. Inventario automatizado de métodos exportados, incluidos handlers creados por fábrica. | Cada ruta mutadora dentro del alcance tiene acción y captura declaradas. Los eventos omiten secretos y no se pierden por cascada. |
| 2. Reportes | POST del parte, creación/descarte de borrador y PUT de sync, evidencia, autorizaciones y confirmación de fotos; acceso público. | Un intento deja su registro mínimo; un reenvío idempotente deja intento «repetido» sin duplicar movimiento. No quedan autores personales falsos como `director` o `public-parte`. |
| 3. Verificaciones y administración | Fábrica `crearPostVerificacion`, solicitudes/respuestas asistidas/cancelación, motivos, permisos nominales y enlaces del veredicto. | Todos los caminos de respuesta generan eventos; se conserva el historial especializado y se lo referencia. Revocaciones incluyen al ejecutor. |
| 4. Lecturas sensibles y operación | Nominal de contexto/parte, exportaciones JSON/XLSX/CSV, fotos, PDF/enlaces; identificar operadores CLI y ejecuciones de jobs propios de infraestructura. | Diferenciar consulta, exportación, autorización y respuesta de archivo. No duplicar el acceso nominal ya registrado. Jobs manuales/programados tienen disparador y ejecución identificables. |
| 5. Consulta y despliegue | Endpoint/visor admin paginado, filtros, verificación de permisos, métricas y validación en staging. | Ver un reporte y su registro correlacionado; usuario sin permiso no accede; cobertura y latencia verificadas antes de activar. |

Las entregas 1 a 3 constituyen el mínimo para reportes/infraestructura. Las 4 y 5 completan la trazabilidad priorizada y su consulta; no son excusas para omitir POST cubiertos por el acuerdo.

Puntos principales: `app/api/problematicas/parte/route.ts`, `lib/infraestructura/acceso-parte.ts`, `lib/infraestructura/verificacion-route.ts`, `lib/infraestructura/borradores/service.ts`, `lib/infraestructura/adjuntos`, `lib/db/schema.ts` y rutas enumeradas en el relevamiento. El esquema debe funcionar en PostgreSQL y PGlite, que son los drivers actuales.

## Rendimiento y offline

- Ningún fetch adicional en la UI para auditar los POST ya existentes; ningún bloqueo de cámara, scroll o navegación por instrumentación de gestos.
- Una escritura pequeña por solicitud en el caso normal, con el pool actual y transacción existente cuando corresponda. Sin llamadas a servicios externos para completar el registro.
- Cuerpos por lista permitida y tamaño acotado; sin descomprimir respuestas, serializar fotos o hacer joins para enriquecer el log.
- Medir p50/p95 de parte, sync de borradores, autorización de fotos y verificación con/sin auditoría bajo la misma carga. Objetivo inicial propuesto: incremento p95 de hasta 10 ms en staging; verificar también caudal y conexiones. Es un objetivo de aceptación, no un resultado medido.
- Las lecturas del visor se paginan por fecha/ID y tienen límite. No cargar todo el historial para cada navegación.
- Offline: el POST se audita cuando llega al servidor. Los intentos de red que nunca llegan no pueden registrarse desde el handler. Si se agregan eventos del dispositivo, conservar hora local separada y marcar evidencia cliente; no inventar usuario/origen al reconectar con otra sesión.
- Reintento HTTP: nuevo intento de auditoría, mismo efecto de negocio si se repite la clave idempotente. La auditoría de intentos y la idempotencia del dominio tienen propósitos distintos.

### IndexedDB y carga diferida

Recomendación ante la consulta del usuario: usar IndexedDB para los envíos offline ya existentes y, si se incorporan, eventos secundarios del navegador. Al sincronizar un reporte, el servidor valida su identidad/alcance y guarda cambio y auditoría juntos. Mientras permanece local, la UI debe indicar «guardado en dispositivo/pendiente», no «confirmado en servidor».

El registro obligatorio de un POST online se genera en el servidor al procesar esa misma solicitud. No depende de una segunda petición de logging ni de que el navegador mantenga una cola. Agregar una copia local a cada operación online no reemplaza esa garantía ni es necesario para la primera entrega.

Sí diferir la lectura/renderizado del visor hasta abrirlo y paginar sus consultas. También se puede diferir enriquecimiento, agregaciones o exportaciones del log partiendo de un evento ya persistido. Esto permite mantener pequeña la escritura que forma parte del cambio confirmado.

IndexedDB es asíncrono, pero es almacenamiento del dispositivo: puede alcanzar cuota, borrarse o quedar sin sincronizar. Un cliente también puede omitir o alterar lo que envía. Por ello, los eventos del navegador se identifican como evidencia cliente, nunca como prueba única de un cambio aceptado por el servidor.

Referencias: [características de IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Basic_Terminology), [cuotas y eliminación de almacenamiento](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), [transacciones PostgreSQL](https://www.postgresql.org/docs/18/tutorial-transactions.html).

## Verificación necesaria

1. Cobertura de rutas/fábricas y resultados: éxito, validación, denegado, límite, excepción, conflicto y repetición; evitar afirmar que cubre rechazos del proxy que no entraron a la aplicación.
2. Identidad: usuario real, enlace, compartido, anónimo y cuenta presente junto con credencial pública; actor nunca tomado del body sin validación.
3. Persistencia: provocar fallo de inserción de auditoría y comprobar que se revierte el cambio; concurrencia e idempotencia no duplican efectos. Probar que una falla de auditoría impide emitir autorizaciones de fotos y que reintentar tras una respuesta perdida conserva el efecto y evento originales.
4. Sanitización: pruebas con tokens en rutas/body y URLs firmadas; sólo metadatos permitidos llegan a base/logs técnicos.
5. Recorrido de integración: crear/sincronizar/enviar borrador, adjuntar foto, actualizar situación, responder verificación y consultar registro. Verificar GET nominal y exportación por separado.
6. Migración aditiva en base temporal PGlite y PostgreSQL de staging; confirmar preservación de registros existentes, permisos y plan de reversión de aplicación sin borrar eventos.
7. Medición comparativa de latencia/caudal con carga representativa y sin duplicar consultas de sesión. Ajustar si no cumple el objetivo antes de desplegar.

## Decisiones cerradas

1. Alcance: reportes y mapa de infraestructura.
2. Persistencia: ningún cambio confirmado sin auditoría durable; rollback si falla el registro de base.

Se mantienen como supuestos de diseño los accesos actuales, la identidad desconocida explícita, el visor admin y la conservación sin limpieza automática inicial. La recomendación sobre IndexedDB conserva el requisito de auditoría obligatoria y deja el envío diferido para actividad local/offline.
