# Reportes offline, borradores sincronizados e imágenes en Huawei OBS

## Objetivo y estado

Permitir continuar reportes nuevos y actualizaciones después de cerrar el navegador sin conexión, consultar sus borradores pendientes desde el mapa y adjuntar fotos sin demorar el envío del reporte ni transferir imágenes a través del servidor de la aplicación.

Estado: plan acordado, pendiente de implementación. Este documento amplía el plan offline original. El orden de ejecución, archivos afectados y condiciones de cierre están en [Batches de implementación](plan-reportes-batches.md).

## Decisiones acordadas

| Tema | Decisión |
| --- | --- |
| Formularios | Reporte nuevo y actualización, con restauración automática. |
| Borradores remotos | Guardar progreso y respuestas parciales; permitir consultarlos desde el mapa según permisos. |
| Conteo | Contar borradores distintos, no escuelas. Dos borradores de una escuela suman dos. |
| Inactividad | Seguir contando hasta enviar o descartar; mostrar última actividad, sin vencimiento automático. |
| Fotos | Opcionales, hasta tres por envío, incluidas actualizaciones que solo agregan fotos. |
| Calidad | Conservar en OBS solo la versión optimizada y su miniatura; no subir el original. |
| Prioridad | Envío definitivo del reporte, sincronización de borradores y, finalmente, subida de fotos. |
| Subida | Automática después de confirmar el reporte, incluso con conexión lenta; una foto por vez inicialmente. |
| Historial | Conservar las fotos de cada actualización, aunque la situación se solucione. |
| Mapa | Indicador de cantidad, miniaturas al abrir la ficha y ampliación al seleccionar una foto. |
| Infraestructura | Reutilizar el bucket existente de Huawei OBS, previa revisión mediante CLI. |

## Recorrido principal

1. Guardar respuestas, paso y contexto localmente antes de sincronizar.
2. Al seleccionar fotos, persistirlas temporalmente en el dispositivo; no iniciar transferencias.
3. Al completar o abandonar un paso, encolar una sincronización ligera del borrador.
4. Al confirmar un formulario válido, congelar el cuerpo del envío y su clave de idempotencia.
5. Enviar primero los reportes pendientes, sin esperar a la compresión ni a OBS.
6. Persistir el éxito, incluido `movimientoId`, y cerrar el borrador remoto de forma consistente.
7. Optimizar localmente las fotos y subirlas directamente a OBS cuando el reporte esté confirmado.
8. Confirmar adjuntos y retirar archivos locales únicamente después de persistir su confirmación.

La optimización puede ejecutarse sin red después de encolar el reporte, fuera de su camino crítico. El procesamiento nunca es requisito para confirmar o enviar las respuestas. Si el navegador no permite procesar imágenes en segundo plano, continuar al reabrir la aplicación.

## Persistencia y recuperación

- Reutilizar la base IndexedDB existente, con un esquema versionado compartido por página y service worker.
- Separar contextos, borradores, envíos confirmados por el usuario, confirmaciones, archivos y descartes pendientes de sincronizar.
- Identificar cada borrador de forma estable. CUE y tipo de flujo sirven para localizarlo, pero no bastan como identidad de cargas distintas.
- Guardar el contexto necesario: escuela, turnos, motivos y, en actualizaciones, estado e historial utilizados al iniciar el recorrido.
- Restaurar respuestas y paso automáticamente. Ofrecer descarte con confirmación y avisar que se recuperó el progreso.
- Esperar la lectura del borrador antes de habilitar edición y autoguardado.
- Confirmar escrituras cuando termine la transacción de IndexedDB, no solo la solicitud individual.
- Guardar imágenes como `Blob`; nunca incluirlas en JSON, base64 ni localStorage.
- El original puede existir temporalmente en el dispositivo. Eliminarlo solo cuando la versión optimizada y su miniatura estén persistidas correctamente.
- Si falla el almacenamiento, explicar qué no quedó protegido. La imposibilidad de conservar una foto no debe bloquear el reporte.
- Mantener compatibilidad con borradores existentes. Ante un registro incompatible, explicar el problema antes de ofrecer empezar de nuevo.
- Limpiar solo la generación confirmada: el éxito de un envío anterior no debe borrar un borrador posterior.

## Reapertura sin internet

- Agregar una pantalla offline genérica que reutilice ambos formularios y lea su contexto local.
- Extender `public/sw-parte.js` para servirla ante fallas de red en navegaciones a reportes nuevos y actualizaciones. Conservar la URL original para identificar flujo y CUE.
- Preparar pantalla y recursos mientras hay conexión, mediante un iframe del mismo origen controlado por el worker, sujeto a validación en compilación de producción.
- Cachear únicamente recursos estáticos necesarios: dependencias de Next, estilos, fuentes e imágenes institucionales. No cachear páginas o respuestas autenticadas ni credenciales.
- Versionar las cachés y conservar la anterior hasta que la nueva esté preparada.
- Mostrar “Disponible sin conexión” solo después de comprobar contexto y recursos guardados.
- Si no hubo preparación inicial, explicar que hace falta una primera apertura con internet.
- No exigir consultas al servidor para reconstruir una actualización cuyo contexto ya está guardado.
- Al reconectar, mantener respuestas y permitir al servidor validar su vigencia; un rechazo no debe eliminar datos.

## Borradores sincronizados y consulta de pendientes

### Contrato ligero

Guardar identificador, CUE, tipo de recorrido, versión del formato, revisión, paso actual, pasos completados, respuestas parciales y fechas de actividad y sincronización. Los adjuntos se representan por referencias y estados, sin archivos ni autorizaciones de OBS.

- Sincronizar al completar o abandonar un paso; agrupar cambios y evitar una request por tecla.
- La primera sincronización puede crear la instantánea completa. Las siguientes envían cambios con control de revisión.
- Si se acumulan ediciones offline, consolidarlas; no reproducir cada pulsación ni cada versión intermedia.
- Validar forma, límites y permisos de las respuestas presentes, sin exigir que el formulario esté completo.
- Sincronizar un borrador no crea un movimiento ni altera gravedad, afectaciones o estadísticas de reportes enviados.
- Conservar revisión confirmada y cambios locales todavía no sincronizados.
- Detectar conflictos entre pestañas o dispositivos; no resolverlos sobrescribiendo silenciosamente respuestas.

### Ciclo de vida y consistencia

- Distinguir activo, envío pendiente, enviado y descartado. Activos y envíos pendientes cuentan hasta confirmar su cierre en el servidor.
- Mantener los pendientes antiguos sin caducidad automática y mostrar última actividad.
- Un borrador compartido por dos pestañas cuenta una vez; cargas independientes tienen identificadores diferentes.
- Dejar una marca duradera de cierre para que una sincronización atrasada no reactive un borrador enviado o descartado.
- Asociar el envío definitivo al borrador. Su éxito y el cierre remoto deben ser consistentes; si hay reconciliación posterior, debe ser idempotente y recuperable.
- Un descarte offline se aplica localmente y se sincroniza después. El mapa puede conservar el pendiente hasta recibirlo.
- Conservar un conjunto inmutable de respuestas y adjuntos para cada envío confirmado. Corregir después de un rechazo requiere una transición explícita, no mutar a ciegas un intento de resultado incierto.

### Lectura desde el mapa

- Mostrar cantidad de borradores por escuela y total de borradores, progreso y última actividad sincronizada.
- Permitir abrir respuestas parciales identificadas como “Borrador sin enviar”. Nunca presentarlas como hechos confirmados.
- Aplicar la separación de permisos existente: la lectura amplia del mapa no habilita datos nominales de alumnos. El detalle debe filtrar esos campos; su lectura nominal requiere el permiso específico correspondiente.
- Guardar respuestas en el servidor no reemplaza las guardas de escritura del formulario ni autoriza por sí solo recuperación o edición desde otro dispositivo.
- Paginar listados y detalles. Obtener conteos mediante consultas agrupadas, sin una consulta adicional por escuela.
- El mapa solo conoce lo sincronizado: no puede contar borradores que todavía existen únicamente en un dispositivo sin conexión.

## Envío automático y prioridades

- Solo el botón de envío de un formulario válido encola el reporte definitivo. Sincronizar borradores incompletos no equivale a enviarlos.
- Persistir cuerpo y clave de idempotencia antes del primer intento; reutilizarlos ante resultado incierto.
- Reintentar al abrir, al recibir `online`, al volver a la pestaña y con espera creciente hasta 30 segundos para reportes. Evitar ráfagas y respetar límites temporales indicados por el servidor.
- Tratar `navigator.onLine` como orientación. No bloquear indefinidamente intentos por su valor ni agregar requests de comprobación.
- Mantener Background Sync donde exista. No implementar polling permanente del worker ni prometer ejecución inmediata con el navegador cerrado.
- Recuperar estados `enviando` interrumpidos. Coordinar pestañas y worker con el mismo bloqueo por envío donde exista Web Locks; preservar idempotencia del servidor como defensa final.
- Registrar éxito y `movimientoId` antes de retirar el pendiente. Página y worker deben cumplir el mismo contrato.
- Al reabrir, consumir la confirmación para mostrar el resultado y limpiar únicamente el borrador correspondiente, conservando adjuntos pendientes.
- Ante sesión vencida, conservar el trabajo y solicitar reingreso. Ante validación rechazada, detener reintentos y permitir corregir.
- No iniciar fotos mientras haya reportes listos para enviar. Si aparece un reporte durante una subida, enviarlo sin esperar a que esa transferencia termine; no abortar y reiniciar fotos sistemáticamente, desperdiciando datos.
- Separar las esperas de cada clase de trabajo para que un reporte que requiere intervención no bloquee indefinidamente otros envíos.

## Imágenes optimizadas y Huawei OBS

### Procesamiento local

No enviar el original a una API para recibir una imagen comprimida. Generar en el dispositivo una versión optimizada y una miniatura, con procesamiento serial y fuera del hilo principal cuando sea compatible.

| Parámetro | Propuesta inicial para validar |
| --- | --- |
| Lado mayor | Hasta 1600 px |
| Peso objetivo | 200–400 KB por foto |
| Máximo optimizado | 600 KB por foto |
| Miniatura | Hasta 320 px; objetivo de hasta 40 KB |
| Concurrencia | Una imagen en procesamiento y una subida de foto por vez inicialmente |

Estos valores no son garantías de calidad o latencia. Validarlos con daños, textos y celulares modestos. Elegir formato y calidad compatibles durante el batch de procesamiento, sin incorporar una conversión remota como dependencia.

- Corregir orientación y eliminar metadatos innecesarios, incluido GPS.
- Limitar tamaño y dimensiones de entrada para evitar agotar memoria.
- Si un formato no puede decodificarse, informar y permitir reemplazarlo; no subir el original pesado como alternativa silenciosa.
- El trabajo local no debe competir con la interacción o el envío urgente. La falta de soporte de compresión en el worker no impide enviar el reporte.

### Subida, confirmación y permisos

- Revisar el bucket existente con la CLI: región, endpoint, políticas, CORS y reglas de conservación. No crear otro bucket por defecto ni cambiar políticas compartidas sin evaluar sus usos.
- `obsutil` es la CLI específica de OBS; resolver instalación y autenticación en el entorno de ejecución sin almacenar secretos en el repositorio.
- Mantener privados los objetos de reportes; autorizar escritura por CUE y lectura según los permisos del formulario o mapa correspondientes.
- Solicitar autorizaciones temporales agrupadas para hasta tres fotos y sus variantes, cuando estén listas para subir y el reporte esté confirmado.
- Transferir archivos directamente del navegador a OBS. La API de la aplicación maneja JSON pequeño y verificaciones acotadas, no descarga ni recomprime imágenes completas.
- El servidor determina claves de objeto, asociaciones y restricciones. Aplicar el máximo de tres fotos por envío también en el servidor, incluyendo concurrencia y reintentos.
- Generar un movimiento de evidencia para actualizaciones solo con fotos. Declarar sus referencias antes de la subida, sin requerir cambios ficticios en la situación ni esperar archivos.
- Validar objetos antes de marcarlos disponibles; no confiar únicamente en tamaño, formato o claves declarados por el navegador. Concretar la verificación acotada en el diseño del batch, sin convertirla en un proxy de archivos.
- Confirmar adjuntos de forma idempotente. Si OBS recibió el archivo pero se perdió la respuesta o confirmación, reconciliar antes de volver a transferirlo.
- Reintentar solo lo pendiente, con espera creciente; reutilizar autorizaciones válidas y renovarlas cuando haga falta. Un error de autorización de OBS no debe interpretarse automáticamente como sesión de la aplicación vencida.
- Limpiar archivos locales tras confirmar su persistencia remota; gestionar objetos huérfanos por separado, sin borrar fotos históricas válidas.

## Fotos en mapa e historial

- Incorporar conteos de fotos disponibles al resultado agregado del mapa, sin descargar imágenes ni emitir autorizaciones por cada escuela.
- Cargar miniaturas al abrir la ficha y la versión ampliada al seleccionarla. Conservar dimensiones de presentación para evitar saltos de interfaz.
- Servir bytes desde OBS con acceso temporal autorizado, sin proxy de optimización de la aplicación.
- Conservar fotos por movimiento y fecha; mostrar las recientes primero y paginar el historial.
- Distinguir fotos disponibles de pendientes locales. El mapa no puede afirmar que existe una foto que todavía no salió del dispositivo.
- Mostrar al director estados separados, por ejemplo: “Reporte enviado · 2 fotos pendientes”.

## Alcance, dependencias y verificación

- La recuperación offline requiere el mismo dispositivo, perfil y origen y una primera apertura con conexión. El almacenamiento puede ser eliminado por el usuario o el navegador; no prometer recuperación absoluta.
- El alcance offline incluye alta y actualización, no el mapa ni el historial general completos.
- A diferencia del plan original, este alcance sí amplía contratos HTTP y esquema del servidor para borradores, cierre consistente y adjuntos, conservando compatibilidad con clientes anteriores.
- La región y configuración real del bucket quedan pendientes de consultar mediante CLI. No se promete una latencia fija sin medir.
- Verificar Node y pnpm en el entorno que ejecute cada batch; la ausencia documentada en el análisis original no debe asumirse para otros worktrees.
- Cada batch incluye pruebas enfocadas; el último valida navegación offline real en Chrome y Safari sobre una compilación de producción en HTTPS o localhost.
- Medir bytes y cantidad de requests por recorrido, tiempo de envío del reporte con y sin fotos, costo del procesamiento local, reintentos y tiempo de consultas agregadas.

## Próximo paso

Ejecutar el [batch 0](plan-reportes-batches.md#batch-0--contratos-y-relevamiento-de-obs). La planificación no implica que la CLI esté conectada, el bucket configurado o las funcionalidades implementadas.
