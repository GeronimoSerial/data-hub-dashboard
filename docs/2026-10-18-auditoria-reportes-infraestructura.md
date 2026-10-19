# Relevamiento de auditoría de reportes y mapa de infraestructura

Fecha: 2026-10-18. Estado: relevamiento de código y [plan de implementación](2026-10-18-plan-auditoria-liviana.md), con alcance y política de fallas confirmados. El relevamiento describe el estado anterior. La [implementación local del 2026-10-19](2026-10-19-implementacion-auditoria.md) incorpora la captura y el visor; falta validar despliegue y carga en staging.

El objetivo solicitado es poder reconstruir quién hizo qué y a qué hora en todo el recorrido de reportes y del mapa. Hay registros parciales, pero hoy no permiten esa reconstrucción completa. El bloqueo principal es la identidad: el acceso con contraseña compartida no identifica a una persona y el movimiento del parte sólo guarda un rol.

El relevamiento se delegó a GPT-6 Luna con razonamiento alto y se contrastó con las rutas, servicios y esquema actuales. Las acciones de las matrices son candidatas de cobertura; no implican que existan hoy esos eventos de auditoría.

Actualización del usuario: toda solicitud POST debe producir un registro mínimo y afectar lo menos posible la navegación, registrando todo lo posible. El plan toma POST como cobertura obligatoria y propone incluir PUT/PATCH/DELETE porque también modifican datos. La matriz amplia sigue sirviendo como inventario; zoom, desplazamientos y cada consulta automática no pasan a ser obligatorios por esta aclaración. Se conserva la auditoría nominal actual y se priorizan además exportaciones y accesos sensibles.

## Decisiones y supuestos del plan

| Decisión | Pregunta que debe resolver el plan |
|---|---|
| Extensión del alcance | Confirmado: reportes y mapa de infraestructura. POST obligatorio, incluyendo PUT/PATCH/DELETE propios de estos módulos para cubrir sus modificaciones. |
| Identidad | Propuesta: reutilizar sesión o referencia de enlace disponibles y marcar explícitamente el acceso compartido/sin identidad personal. Exigir nuevas cuentas sería una decisión adicional. |
| Consulta de la auditoría | Supuesto para el plan: visor inicial de sólo lectura para administradores. Permisos más amplios se definen después. |
| Detalle y retención | Registro mínimo con referencias al historial existente y metadatos permitidos. No se propone borrado automático hasta acordar retención; dimensionar crecimiento. |
| Fallas | Confirmado: ningún cambio se confirma sin auditoría durable. Cambio de base y evento se guardan juntos; si falla el registro, se revierte el cambio. |

## Qué existe y qué falta

| Registro actual | Evidencia | Límite comprobado |
|---|---|---|
| Trayectoria del parte | `infra_movimiento` en [schema](../lib/db/schema.ts); [POST del parte](../app/api/problematicas/parte/route.ts) | Guarda tipo, rol, resumen, vigencia, carga e idempotencia; no tiene identidad personal del autor. El POST escribe `rol: 'director'`. |
| Cambios del parte | [movimiento-diff](../lib/infraestructura/movimiento-diff.ts) | Hay antes/después para varios campos; parte del alcance se representa mediante cantidades. No equivale a una fotografía completa de todos los valores afectados. |
| Verificaciones | `infra_verificacion_evento` y [servicio](../lib/infraestructura/verificaciones.ts) | Identifica usuario, enlace o sistema en hitos del flujo. Un enlace identifica la credencial, no necesariamente al receptor real. |
| Consulta nominal en mapa | `infra_acceso_nominal_log`; [endpoint](../app/api/mapas/infraestructura/nominal/route.ts) | Guarda usuario, afectación, cantidad y hora para esta consulta. No es un log general de lecturas. |
| Lectura nominal de borradores | [servicio del mapa](../lib/infraestructura/borradores/mapa.ts) | Reutiliza el log nominal con referencia `borrador:<id>` cuando corresponde; no registra todo el recorrido del borrador. |
| Adjuntos | `infra_adjunto`; [evidencia](../lib/infraestructura/adjuntos/evidencia-fotografica.ts) | Tiene `creadaPor`, con respaldo genérico `public-parte` si no hay sesión; no reconstruye autorización, carga, confirmación y lectura completas. |
| Enlaces del veredicto | [enlaces](../lib/infraestructura/veredicto/enlaces.ts) | Guarda creador y revocador en el estado del enlace; falta el historial de uso y de intentos de acceso. |
| Jobs y datasets | `infra_job_run`; [datasets](../lib/infraestructura/datasets/repositorio.ts) | Hay estado de ejecución y versiones. Eso no identifica por sí solo al operador que lanzó un comando ni conserva cada transición de una publicación. |
| Acceso por SSO | `ge_sso_evento`; [registro](../lib/ge-sso/evento.ts) | Auditoría específica del SSO, no de todas las sesiones ni de las operaciones posteriores. |

El acceso al parte combina contraseña compartida, administrador, enlace de verificación acotado al CUE y sesión con alcance por rol. Ver [acceso-parte](../lib/infraestructura/acceso-parte.ts), [acceso público](../lib/infraestructura/acceso-publico.ts) y [alcance de sesión](../lib/infraestructura/acceso-parte-sesion.ts). La cookie de la contraseña compartida no está acotada a un CUE ni identifica una persona.

## Matriz: flujo de reportes

En todas las filas deben poder relacionarse actor, acción, objeto, resultado y hora. Los datos adicionales de la última columna permiten interpretar el evento sin guardar cuerpos completos ni secretos.

| Área | Acciones a cubrir | Punto del código | Contexto específico |
|---|---|---|---|
| Acceso | Ingreso aceptado/rechazado, acceso fuera de alcance y credencial vencida | [acceso](../app/api/problematicas/acceso/route.ts), [guarda](../lib/infraestructura/acceso-parte.ts) | Vía de autenticación, identificador seguro de credencial, CUE solicitado, causa saneada. Nunca contraseña, cookie o token en claro. |
| Entrada y contexto | Abrir el flujo, seleccionar establecimiento y consultar contexto/secciones/alumnos | [contexto](../app/api/problematicas/contexto/route.ts), páginas `app/problematicas` | Establecimiento, corte GE, categorías de información entregada y si hubo datos nominales. |
| Lectura del parte | Consultar estado actual, afectaciones y servicio | [GET parte](../app/api/problematicas/parte/route.ts) | Parte, período, CUE y exposición nominal. Esta ruta resuelve nombres y no usa el log nominal del mapa. |
| Lectura de trayectoria | Consultar historial | [historial](../app/api/problematicas/parte/historial/route.ts) | Parte y consulta efectiva; distinguir carga automática de apertura explícita. |
| Creación | Enviar reporte inicial y crear parte/afectaciones | [POST parte](../app/api/problematicas/parte/route.ts) | Parte, movimiento, afectaciones, período, corte, vigencia e idempotencia. |
| Actualización de situaciones | Agregar, editar, confirmar sin cambios, solucionar o retirar una afectación; vincular causa | Mismo POST; [diff](../lib/infraestructura/movimiento-diff.ts) | Motivo, categoría, severidad, descripción, justificación crítica, causa, cierre y campos efectivamente modificados. |
| Alcance | Cambiar escuela completa, turnos, secciones o selección de alumnos | Mismo POST | Identificadores de alcance antes/después según política de datos; los conteos solos no permiten reconstruir todas las selecciones. |
| Establecimiento y servicio | Cambiar estado del edificio, asistencia pedagógica, suspensión/reanudación y fecha de vigencia | Mismo POST | Estado anterior/nuevo, referencia de alcance y diferencia entre vigencia y hora de registro. |
| Envíos sin efecto | Reenvío idempotente, intento sin diferencias, conflicto, datos inválidos y error de persistencia | Mismo POST | Intento de solicitud relacionado con el único efecto confirmado; resultado «sin cambios» distinto de «falló». |
| Borrador remoto | Crear, sincronizar, consultar, descartar y cerrar por envío | [colección](../app/api/problematicas/parte/borradores/route.ts), [detalle](../app/api/problematicas/parte/borradores/[draftId]/route.ts), [descarte](../app/api/problematicas/parte/borradores/[draftId]/descarte/route.ts), [servicio](../lib/infraestructura/borradores/service.ts) | Borrador, generación, revisión previa/nueva, paso, estado y movimiento de cierre. |
| Borrador local | Iniciar, guardar, restaurar, continuar, descartar y cambiar de paso | [formulario](../components/infraestructura/reporte-inicial-form.tsx), `lib/infraestructura/parte` | Eventos pendientes del dispositivo, no hechos comprobados por el servidor hasta recepción. Política de granularidad pendiente. |
| Cola offline | Encolar envío, iniciar/reintentar, bloquear por sesión/conflicto y confirmar | [envío offline](../lib/infraestructura/parte/envio-offline.ts), [cola](../lib/infraestructura/parte/cola-trabajos-envio.ts), `public/sw-parte.js` | ID de evento y envío, momento local, recepción, intentos, sesión que originó el envío y sesión que sincroniza. |
| Fotos | Seleccionar, quitar o fallar procesamiento local; reservar evidencia; autorizar carga; confirmar; rechazar o limpiar huérfanos | [evidencia](../app/api/problematicas/parte/evidencia/route.ts), [autorizaciones](../app/api/problematicas/parte/adjuntos/autorizaciones/route.ts), [confirmación](../app/api/problematicas/parte/adjuntos/[attachmentId]/confirmacion/route.ts), [limpieza](../lib/infraestructura/adjuntos/limpieza-huerfanos.ts) | Adjunto/movimiento, tamaño, tipo, checksum/ETag si existe, estado y resultado. No bytes ni URLs firmadas. |
| Fotos consultadas | Abrir galería, autorizar miniatura y autorizar imagen completa | [lectura de adjuntos](../app/api/infraestructura/adjuntos/route.ts) | Usuario, parte/adjunto, variante y operación autorizada. La URL firmada no prueba la descarga desde OBS. |
| Verificación por enlace | Validar token, canjear sesión, responder y vincular al movimiento | `app/api/problematicas/verificaciones/[id]` | Verificación, credencial referenciada sin secreto, respuesta, canal, correlación y movimiento. |
| Verificación asistida | Solicitar, cancelar, responder por teléfono/WhatsApp/presencial/otro, detectar discrepancia y vínculo fallido | [colección](../app/api/infraestructura/verificaciones/route.ts), `app/api/infraestructura/verificaciones/[id]` | Separar usuario que carga la respuesta de persona que la informa, si esta última se recoge; no atribuir al informante la sesión del operador. |

## Matriz: mapa de infraestructura

Las consultas de API y las interacciones del navegador son hechos distintos. Una apertura puede leer datos ya presentes en memoria y una sola pantalla puede disparar varias consultas automáticas.

| Área | Acciones a cubrir | Punto del código | Contexto específico |
|---|---|---|---|
| Acceso al recurso | Abrir mapa, autorizar o denegar | [acceso lectura](../lib/infraestructura/acceso-lectura.ts), `app/(hub)/mapas/infraestructura` | Usuario, alcance institucional/territorial y ruta. |
| Navegación y búsqueda | Cambiar pestaña, buscar y seleccionar escuela/departamento/evento, abrir/cerrar ficha o panel | [mapa](../components/mapas/map-infraestructura-page.tsx) y componentes asociados | Búsqueda confirmada, selección y contexto aplicado. No registrar cada tecla salvo decisión explícita. |
| Filtros y visualización | Aplicar/quitar filtros, cambiar período/horizonte/variable, capas, mapa base y modo de vista | Mismo componente y shell del mapa | Valores anteriores/nuevos y si el cambio fue del usuario o restaurado automáticamente. |
| Cámara | Zoom, desplazamiento, rotación, encuadre, pantalla completa | Mismo componente | Si se incluye: registrar gestos completados; separar encuadre manual del producido por selección/restauración. |
| Estado operativo | Leer partes, escuelas, totales, evolución y territorio | `app/api/mapas/infraestructura`: raíz, `escuelas`, `parte`, `historial`, `totales`, `evolucion`, `territorio` | Filtros normalizados, alcance, cantidad y versión/corte de los datos. |
| Datos nominales | Consultar alcance nominal; denegar por falta de permiso o alcance | [nominal](../app/api/mapas/infraestructura/nominal/route.ts) | Permiso efectivo, afectación, cantidad e identificadores mínimos; no duplicar nombres en el log. |
| Borradores vistos desde mapa | Ver conteos/listado/detalle y respuestas nominales autorizadas | [conteos](../app/api/infraestructura/borradores/conteos/route.ts), [listado](../app/api/infraestructura/borradores/[cueAnexo]/route.ts) | CUE, borrador, paginación, campos expuestos y permiso efectivo. |
| Accesibilidad física | Consultar acceso a escuela, geometría y exposición a inundación | [accesos](../app/api/infraestructura/accesos/[cueAnexo]/route.ts), `app/api/mapas/infraestructura/accesos/[cueAnexo]` | CUE, geometría/perfil/versión y resultado de exposición. |
| Riesgo y meteorología | Consultar radar, peligro, grilla observada, alertas, estaciones, lecturas y episodios derivados | `app/api/infraestructura`: `radar`, `radar-meteo`, `peligro`, `hidrometria`, `episodios-derivados`, `fuentes`, `operacion/salud` | Parámetros, fuente, horizonte, versión de motor/datos y estado de disponibilidad. |
| Riesgo y situación calculada | Consultar snapshots de riesgo, riesgo por escuela, perfil geográfico, situación y cambios entre cortes | `app/api/infraestructura`: `riesgo`, `riesgo/[snapshotId]`, `riesgo/escuela/[cueAnexo]`, `geo-perfiles/[cueAnexo]`, `situacion`, `situacion/cambios` | Escuela/territorio, snapshots y cortes comparados, filtros y versión del cálculo. |
| Referencias | Consultar eventos y datasets actuales/históricos; descargar CSV/JSON | [datasets](../app/api/mapas/infraestructura/datasets/[dataset]/route.ts), [eventos](../app/api/mapas/infraestructura/referencias/eventos/route.ts) | Dataset, versión publicada/solicitada, formato, ETag y resultado 200/304/error. |
| Exportaciones | Abrir vista previa, cambiar columnas/orden/página y solicitar XLSX | [exportar](../app/api/infraestructura/exportar/route.ts), `lib/exportaciones` | Separar consulta JSON de generación de archivo; filtros, columnas, filas, formato y versión del contenido. |
| Exportación de situación | Solicitar CSV o JSON de la situación calculada | [exportación de situación](../app/api/infraestructura/situacion/export/route.ts) | Usuario, formato, alcance, filtros, corte y resultado de generación/respuesta. |
| Veredictos | Abrir resumen/historial/eventos y generar PDF | `app/api/infraestructura/veredictos` | Veredicto, rango de fechas, versión y archivo generado/servido. |
| Enlaces compartidos | Crear, copiar desde UI, revocar, abrir página compartida, solicitar PDF y fallar acceso | [enlaces](../app/api/infraestructura/veredictos/enlaces/route.ts), [PDF compartido](../app/api/veredicto/compartido/[token]/pdf/route.ts), `app/veredicto/compartido` | Separar creador del enlace y actor que lo usa; si es anónimo, registrar esa condición. Nunca guardar el token o la URL completa. |

## Matriz: administración y automatismos que afectan estos flujos

| Área | Acciones a cubrir | Evidencia | Actor/objeto |
|---|---|---|---|
| Motivos | Crear, editar nombre/categoría/orden/gravedad sugerida y eliminar; rechazos por uso | [ABM](../app/api/infraestructura/motivos/route.ts) | Administrador, motivo, antes/después y afectación del catálogo usado por reportes. |
| Permisos nominales | Otorgar, revocar y consultar; vencimiento efectivo | [permisos](../app/api/infraestructura/nominal/permisos/route.ts), [servicio](../lib/infraestructura/permiso-nominal.ts) | Otorgante/revocador, destinatario, permiso, alcance y vencimiento. Hoy la revocación no recibe actor. |
| Permisos del recurso y usuarios | Cambiar roles, bloqueos, CUE, niveles jurisdiccionales o acceso al recurso de infraestructura | [usuarios](../app/api/usuarios/[id]/route.ts), [recursos](../app/api/recursos/[id]/route.ts), `lib/usuarios.ts` | Administrador y sujeto afectado. Cubrir las modificaciones que cambian quién puede operar/ver estos módulos. |
| Datasets | Importar, validar, publicar, volver a una versión anterior y replicar entre entornos | [CLI](../scripts/datasets-infraestructura.mjs), [repositorio](../lib/infraestructura/datasets/repositorio.ts) | Operador o servicio identificado; dataset, versiones anterior/nueva, checksum, fuente y entorno sin credenciales. |
| Ingestas y cálculos | Ejecutar/reintentar/omitir/fallar/salvar resultado de ingestas, riesgo, episodios, cortes y veredictos | [jobs](../scripts/jobs.mjs), [ejecuciones](../lib/infraestructura/riesgo/job-run.ts) | Servicio/jobRun, intento, disparador manual/programado, versión de motor y entradas/salidas publicadas. |
| Mantenimiento | Limpiar adjuntos, modificar datos mediante scripts y exportar dataset desidentificado | `scripts`, [limpieza](../lib/infraestructura/adjuntos/limpieza-huerfanos.ts), [exportador](../scripts/exportar-dataset-desidentificado.mjs) | Operador/servicio, alcance, cantidades, resultado y referencias verificables. |
| Propia auditoría | Consultar/exportar registros, cambiar permisos y ejecutar retención | Funcionalidad a diseñar | Auditor/administrador/proceso, filtros, alcance y resultado. Evitar recursión infinita al auditar la lectura del log. |

## Información necesaria por evento

Contrato candidato para discutir en el plan, todavía sin decidir tabla ni migración:

| Dimensión | Información |
|---|---|
| Identificación | ID único, versión del contrato, acción estable y área. |
| Actor | Tipo usuario/enlace/sistema/anónimo, ID seguro, rol y alcance efectivos en ese momento, vía de autenticación. Copia histórica mínima que sobreviva a cambios de nombre/rol o baja de cuenta. |
| Objeto | Tipo e ID; relaciones pertinentes con CUE, período, parte, movimiento, borrador, verificación, adjunto o dataset. |
| Tiempo | Hora del servidor en UTC como referencia; hora declarada por dispositivo para offline; recepción del evento y fecha de vigencia separadas. Mostrar horario de Buenos Aires en el visor. |
| Resultado | Éxito, denegado, inválido, conflicto, sin cambios, repetido, pendiente o fallido; código de causa saneado. |
| Correlación | ID de solicitud/operación, evento padre, clave idempotente, revisión y jobRun cuando correspondan. Un reintento no duplica el efecto de negocio. |
| Cambios | Campos antes/después autorizados, IDs de alcance y referencias a evidencia. No copiar cuerpos completos por defecto. |
| Contexto | Filtros confirmados, versión/corte/fuente, canal y origen servidor/navegador/job/CLI. IP o dispositivo sólo si se acuerdan necesidad y retención. |

## Límites que el plan debe resolver

1. **Identidad verificable.** No convertir `director`, `public-parte`, IP o CUE en un nombre de persona. Preferir el usuario autenticado cuando exista y registrar por separado la credencial que autorizó la operación.
2. **Persistencia de cambios.** Decisión confirmada: dato y evento de auditoría en la misma transacción. Los intentos rechazados o revertidos requieren su propio registro fuera de la transacción revertida. Para OBS hacen falta etapas correlacionadas e intención durable antes de habilitar el efecto, porque no comparte transacción con PostgreSQL.
3. **Offline.** Una cola local puede conservar eventos y enviarlos al reconectar; el servidor debe validar identidad/alcance y deduplicarlos. La hora del dispositivo y los eventos puramente locales no tienen la misma garantía que la hora del servidor. Borrar almacenamiento o no reconectar puede impedir recuperar actividad local.
4. **Lecturas y caché.** Registrar el acceso también al servir caché o responder 304. Una interacción con datos ya cargados necesita instrumentación de UI si está dentro del alcance. Distinguir prefetch, polling y restauración automática de acciones explícitas.
5. **Archivos y enlaces.** Registrar generación, autorización y respuesta servida como hechos diferentes. No afirmar que alguien leyó o terminó de descargar un PDF/foto. El acceso directo a OBS requeriría evidencia adicional del almacenamiento si se exige ese nivel.
6. **Historia completa.** No borrar auditoría mediante cascada desde parte/usuario. Una convención «append-only» en comentarios no demuestra que la base impida UPDATE/DELETE: habrá que revisar permisos y controles de almacenamiento.
7. **Datos protegidos.** No guardar contraseñas, cookies, tokens, URLs firmadas, claves de conexión ni payload nominal completo. Los antes/después deben respetar la protección actual de identidad de alumnos y tener permisos propios.
8. **Historia previa.** Se pueden referenciar/importar registros existentes marcando origen y calidad; no se puede recuperar una identidad que nunca se guardó. Separar hora original de hora de importación.
9. **Operación directa.** Instrumentar las APIs no cubre comandos CLI ni escrituras SQL directas. Definir operadores identificados y canal autorizado; si se incluyen accesos DBA, hace falta una capa adicional de auditoría de base/infraestructura.
10. **Volumen.** Si se incluyen cámara, filtros y consultas automáticas, dimensionar retención, lotes y capacidad con esa cobertura. Cualquier agrupamiento debe ser explícito; no muestrear silenciosamente eventos que se acordó conservar.

## Orden propuesto para elaborar el plan

1. Aplicar el alcance confirmado (reportes/mapa) y la política obligatoria de persistencia; usar la identidad disponible y marcar sus límites.
2. Cerrar catálogo de eventos y matriz ruta/acción/evento, incluyendo estados de error y canales offline/CLI.
3. Diseñar almacenamiento, permisos, atomicidad, idempotencia y preservación histórica.
4. Dividir implementación por recorrido: identidad y base; reportes; offline/fotos/verificaciones; mapa/lecturas/exportaciones; administración/jobs; visor y operación.
5. Definir aceptación por acción de las matrices y prueba de cobertura: identidad correcta, hora, resultado, antes/después cuando corresponda y correlación de reintentos, concurrencia y rollback.

El plan vinculado concreta este orden con el alcance y la política de fallas acordados. La matriz incluye candidatos más amplios para referencia; no amplía la captura general al resto de la aplicación. IndexedDB queda recomendado para offline, mientras la escritura obligatoria se realiza en servidor y la consulta del visor se carga al abrirlo.
