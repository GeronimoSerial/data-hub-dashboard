# Batches de reportes offline, borradores y fotos

## Resultado esperado

Implementar el [plan funcional y técnico](plan-reportes-offline.md) en entregas verificables, compartiendo persistencia y coordinación para evitar reescribir los mismos formularios y el service worker por separado.

Estado: pendiente de implementación. Los archivos son puntos de integración identificados en el checkout `images`; confirmar su versión y ubicación en la rama de implementación antes de editar. Los módulos nuevos se ubicarán junto a los existentes; sus nombres y endpoints se definen en el batch 0.

## Orden y reglas de ejecución

`0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8`

- Mantener un único contrato de almacenamiento, confirmaciones y coordinación para página y worker.
- Cada batch incluye pruebas de comportamiento y compatibilidad; el batch 8 no sustituye esas verificaciones.
- No habilitar fotos en producción antes de contar con recuperación local, autorización y confirmación completas.
- No dar un batch por cerrado sin evidencia de sus criterios de aceptación.

| Batch | Entrega | Depende de |
| --- | --- | --- |
| 0 | Contratos y relevamiento de OBS | — |
| 1 | Persistencia local confiable | 0 |
| 2 | Cola coordinada y confirmaciones | 1 |
| 3 | Borradores sincronizados en servidor | 2 |
| 4 | Reapertura offline | 3 |
| 5 | Selección y optimización local | 4 |
| 6 | Adjuntos y subida directa a OBS | 5 |
| 7 | Mapa, galería y pendientes | 6 |
| 8 | Validación integrada y habilitación | 7 |

## Batch 0 — Contratos y relevamiento de OBS

**Objetivo:** resolver identidad, estados y permisos antes de modificar formularios.

### Trabajo

- Revisar con CLI el bucket existente: región, endpoint, acceso privado, usos compartidos, CORS y conservación. Registrar configuración no secreta y cambios necesarios.
- Definir contratos versionados de contexto, borrador, revisión, envío inmutable, confirmación, adjunto y cierre remoto.
- Definir validación parcial, lectura desde el mapa y exclusión de datos nominales sin el permiso específico.
- Diseñar conteos agrupados, índices y paginación de borradores e historial de fotos.
- Definir cómo el envío definitivo cierra su borrador sin permitir reapariciones por requests antiguas.
- Definir movimiento de evidencia para un envío solo con fotos y su deduplicación.
- Elegir límites de payload y frecuencia de sincronización; documentar recuperación de conflictos y verificación de objetos OBS.
- Revisar migraciones de la rama destino antes de asignar nombres o números nuevos.

**Integraciones:** `lib/db/schema.ts`, `drizzle/`, `lib/infraestructura/validacion-trayectoria.ts`, `lib/infraestructura/acceso-parte.ts`, `lib/infraestructura/acceso-lectura.ts` y contratos de consultas.

### Cierre

- [ ] Bucket real relevado o bloqueo de acceso registrado explícitamente.
- [ ] Contratos, estados, permisos y compatibilidad documentados.
- [ ] Ningún contrato incluye bytes de imágenes en JSON.
- [ ] Actualización solo con fotos y cierre del borrador tienen una estrategia consistente.

## Batch 1 — Persistencia local confiable

**Objetivo:** no perder ni sobrescribir trabajo al montar, recargar o cerrar.

### Trabajo

- Unificar apertura y migración de IndexedDB entre formularios y worker.
- Separar contextos, borradores, trabajos de envío, confirmaciones, archivos y marcas de descarte.
- Esperar `transaction.oncomplete` para confirmar persistencia; manejar abortos, errores y cambios de versión entre pestañas.
- Migrar borradores existentes y esperar restauración antes de habilitar autoguardado.
- Guardar originales temporales como `Blob`, con errores explícitos y sin base64.
- Conservar identidad de borrador y generación; impedir que la limpieza de uno afecte a otro posterior.

**Integraciones:** `lib/infraestructura/parte/almacen-indexeddb.ts`, adaptadores de `envio-offline.ts`, `components/infraestructura/reporte-inicial-form.tsx`, `components/infraestructura/actualizar/` y `public/sw-parte.js`.

### Cierre

- [ ] Ambos recorridos restauran paso, respuestas y referencias a fotos sin sobrescritura de montaje.
- [ ] Fallo o aborto de transacción no muestra un guardado exitoso.
- [ ] Cuota llena o almacenamiento bloqueado se informa sin impedir enviar las respuestas.
- [ ] Borradores anteriores se migran o explican su incompatibilidad sin borrarse silenciosamente.

## Batch 2 — Cola coordinada y confirmaciones

**Objetivo:** compartir envío y recuperación entre pestañas y worker.

### Trabajo

- Persistir cuerpo inmutable y clave de idempotencia antes del primer intento.
- Recuperar trabajos interrumpidos y coordinar página y worker con bloqueos compatibles.
- Persistir confirmación con `movimientoId` antes de retirar un pendiente.
- Aplicar prioridades: reporte definitivo, sincronización de borrador y fotos.
- Reintentar con espera creciente y disparadores de apertura, conexión y visibilidad; sin health checks ni polling permanente del worker.
- Separar errores recuperables, validación, límites del servidor y sesión vencida.
- Consumir confirmaciones al reabrir y conservar adjuntos aunque se limpie el formulario.

**Integraciones:** `lib/infraestructura/parte/envio-offline.ts`, `lib/infraestructura/parte/registrar-sync.ts`, `public/sw-parte.js` y consumidores de ambos formularios.

### Cierre

- [ ] Cierre durante envío, respuesta perdida y dos pestañas producen un único movimiento.
- [ ] El éxito del worker se recupera sin restaurar un borrador ya enviado.
- [ ] Errores de validación conservan respuestas y no provocan reintentos infinitos.
- [ ] La cola de menor prioridad no condiciona el inicio de un envío definitivo.

## Batch 3 — Borradores sincronizados en servidor

**Objetivo:** guardar avances parciales y exponer pendientes autorizados sin crear reportes.

### Trabajo

- Implementar persistencia, migraciones y API de creación, sincronización, lectura y descarte.
- Enviar cambios agrupados al completar o abandonar un paso; consolidar ediciones acumuladas offline.
- Aplicar validación parcial y control de revisión, manteniendo cambios locales ante conflictos.
- Vincular el envío definitivo al borrador y cerrar consistentemente su estado remoto.
- Persistir cierres para rechazar sincronizaciones tardías que intenten reactivar registros.
- Mantener pendientes hasta envío o descarte confirmado, sin caducidad por inactividad.
- Preparar consultas agregadas y detalle filtrado por permisos para el mapa.

**Integraciones:** `lib/db/schema.ts`, `drizzle/`, nuevas rutas junto a `app/api/problematicas/parte/`, `app/api/problematicas/parte/route.ts`, validación y formularios.

### Cierre

- [ ] Un paso incompleto válido como borrador se guarda sin generar un movimiento.
- [ ] Dos pestañas del mismo borrador no duplican el conteo; dos cargas distintas sí cuentan dos.
- [ ] Un conflicto no pierde respuestas locales ni sobrescribe silenciosamente las remotas.
- [ ] Guardado atrasado posterior a envío o descarte no reactiva el pendiente.
- [ ] Acceso a mapa no expone datos nominales por esta nueva vía.

## Batch 4 — Reapertura offline

**Objetivo:** continuar ambos recorridos sin consultas iniciales al servidor.

### Trabajo

- Incorporar pantalla offline genérica que reutilice los formularios y su contexto persistido.
- Preparar sus recursos con conexión y verificar completitud antes de anunciar disponibilidad.
- Atender navegaciones fallidas conservando flujo y CUE.
- Versionar cachés sin retirar la versión anterior antes de preparar la nueva.
- Excluir páginas y respuestas autenticadas y credenciales de Cache Storage.
- Restaurar trabajo y sincronizar al reconectar, sin descartar respuestas por contexto desactualizado.

**Integraciones:** `app/problematicas/parte/`, `public/sw-parte.js`, registro del worker y contratos locales de contexto.

### Cierre

- [ ] Alta y actualización continúan tras cerrar y reabrir offline.
- [ ] Primera visita sin preparación explica la necesidad de conexión inicial.
- [ ] Una actualización de recursos interrumpida conserva una versión utilizable.
- [ ] El contexto local se valida al reconectar sin destruir el trabajo rechazado.

## Batch 5 — Selección y optimización local

**Objetivo:** reducir bytes sin depender de una API de conversión ni bloquear el reporte.

### Trabajo

- Agregar selección, vista previa y eliminación de hasta tres fotos por envío.
- Procesar de a una fuera del hilo principal cuando sea compatible; ejecutar offline sin exigir soporte de conversión del service worker.
- Generar versión optimizada y miniatura, corregir orientación y eliminar metadatos innecesarios.
- Validar límites de entrada, memoria y formatos; no usar el original como fallback de subida.
- Sustituir originales temporales solo después de confirmar persistencia de las variantes.
- Validar parámetros iniciales del plan con fotografías reales y dispositivos modestos.

**Integraciones:** componentes compartidos de adjuntos, formularios, nuevos módulos locales junto a `lib/infraestructura/parte/` y almacenamiento de `Blob`.

### Cierre

- [ ] Enviar el reporte no espera a compresión ni vista previa.
- [ ] Cerrar durante conversión permite recuperar o reiniciar el trabajo desde el archivo local.
- [ ] Imagen no compatible o falta de espacio permite continuar con el reporte.
- [ ] Evidencia sigue siendo legible y los pesos finales quedan medidos.

## Batch 6 — Adjuntos y subida directa a OBS

**Objetivo:** completar imágenes después del reporte, con tráfico binario directo a OBS.

### Trabajo

- Implementar asociación de adjuntos a movimientos y actualización solo de evidencia.
- Autorizar en lote hasta tres fotos y variantes, con claves controladas y restricciones verificables.
- Subir de a una después de confirmar el reporte; conservar trabajos ante cierre o sesión vencida.
- Reutilizar autorizaciones válidas; renovarlas sin confundir fallos de OBS con sesión de aplicación vencida.
- Confirmar de forma idempotente y reconciliar cargas de resultado incierto antes de retransmitir.
- Aplicar permisos y límite de fotos del lado servidor, incluso con concurrencia.
- Retirar archivos locales confirmados y definir limpieza segura de objetos huérfanos.

**Integraciones:** esquema y migraciones, nuevas rutas de adjuntos, adaptador OBS del servidor, cola local y worker según capacidades.

### Cierre

- [ ] Caída de OBS no bloquea reportes ni sincronización de respuestas.
- [ ] Actualización solo con fotos registra evidencia sin inventar cambios de situación.
- [ ] Respuesta perdida después de subir no duplica objetos ni adjuntos.
- [ ] No atraviesan la API originales ni imágenes completas para su optimización.
- [ ] Confirmar un reporte nuevo no espera a que termine una foto en vuelo.

## Batch 7 — Mapa, galería y pendientes

**Objetivo:** mostrar borradores y fotos sin encarecer recorrer el mapa.

### Trabajo

- Agregar conteos agrupados de borradores y fotos, sin consultas individuales por escuela.
- Mostrar detalle paginado de pendientes, progreso, última actividad y respuestas permitidas.
- Separar visual y estadísticamente borradores de situaciones confirmadas.
- Agregar indicador de fotos, miniaturas al abrir la ficha y ampliación al seleccionar.
- Conservar evidencia histórica por movimiento y fecha, incluso en situaciones solucionadas.
- Obtener acceso temporal autorizado sin proxy de imágenes ni firma masiva de archivos al cargar el mapa.

**Integraciones:** `components/mapas/ficha-escuela-panel.tsx`, `lib/infraestructura/use-ficha-parte.ts`, consultas y rutas de `app/api/mapas/infraestructura/`, tipos del mapa e historial.

### Cierre

- [ ] El total principal cuenta borradores, no escuelas, sin vencerlos por inactividad.
- [ ] Respuestas parciales no alteran estado, gravedad ni totales de reportes enviados.
- [ ] Navegar el mapa no descarga fotos ni solicita autorizaciones por cada escuela.
- [ ] Miniaturas, ampliación e historial respetan permisos y se cargan a demanda.
- [ ] Pendientes locales no sincronizados no aparecen como si el servidor los conociera.

## Batch 8 — Validación integrada y habilitación

**Objetivo:** probar el recorrido real y medir su costo antes de habilitarlo.

### Matriz mínima

| Escenario | Resultado esperado |
| --- | --- |
| Completar pasos, cortar red, cerrar y reabrir | Restauración automática de respuestas, paso y fotos en ambos flujos. |
| Confirmar offline y reconectar | Envío al poder ejecutarse; recuperación al reabrir si no hubo Background Sync. |
| Cortes sin evento `online`, 5xx, respuestas lentas y límites | Reintentos espaciados, sin requests de sondeo adicionales. |
| Sesión vencida o rechazo de validación | Datos conservados y acción de recuperación clara. |
| Dos pestañas y worker concurrentes | Un movimiento por envío y un borrador por identidad. |
| Edición concurrente o sincronización atrasada | Conflicto explícito; no reaparece un borrador cerrado. |
| Descartar offline | Cierre local, sincronización posterior y mapa actualizado tras confirmación. |
| Éxito con página cerrada | Confirmación visible al volver, sin restaurar un formulario ya enviado. |
| Fotos pendientes y un nuevo reporte | El nuevo reporte tiene prioridad sin retransmisiones sistemáticas de fotos. |
| Cierre durante compresión, subida o confirmación | Recuperación sin perder asociaciones ni duplicar evidencia. |
| Almacenamiento bloqueado, cuota llena o migración | Error explícito y preservación del trabajo recuperable. |
| Bucket inaccesible y autorizaciones vencidas | El reporte sigue operativo; las fotos quedan recuperables. |
| Mapa y lectores sin permiso nominal | Detalle filtrado y cero fotos descargadas antes de abrir la ficha. |
| Cambio de versión de caché | Preparación verificable y versión anterior conservada hasta completar la nueva. |

### Evidencia de cierre

- [ ] Pruebas enfocadas de batches anteriores y regresiones relevantes ejecutadas.
- [ ] Reapertura real verificada en Chrome y Safari con build de producción servido en HTTPS o localhost.
- [ ] Medidos bytes y requests de borradores, reportes, fotos y navegación del mapa por separado.
- [ ] Comparado envío del mismo reporte con y sin fotos para detectar trabajo añadido al camino crítico.
- [ ] Medidos procesamiento y memoria con fotos grandes, consultas agregadas e historial paginado.
- [ ] Habilitación gradual y reversión definidas, preservando datos y colas pendientes si se desactiva una funcionalidad.

## Primer paso operativo

Comenzar por los contratos compartidos y el relevamiento del bucket mediante CLI. Verificar Node y pnpm en el entorno de ejecución. No asumir credenciales, región o políticas a partir de esta planificación.
