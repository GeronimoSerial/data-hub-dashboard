# Auditoría de promoción y rendimiento: prod + PR 184 + PR 185

**Fecha:** 19 de octubre de 2026. **Estado:** diagnóstico; implementación diferida por pedido del usuario.

La rama integra los tres orígenes, pero todavía requiere resolver o descartar tres riesgos antes de promover: limpieza destructiva de tablas heredadas, escrituras concurrentes sin bloqueo del parte y recuperación incompleta de fotos. Después conviene atacar las consultas repetidas y el DDL dentro de las requests, antes que las optimizaciones menores del navegador.

## Alcance y estado de la rama

| Origen | Revisión incluida |
| --- | --- |
| `origin/prod` | `5f837f1b` |
| [PR 184: actualizar flujo de riesgos](https://github.com/GeronimoSerial/data-hub-dashboard/pull/184) | `673d5525` |
| [PR 185: auditoría de reportes](https://github.com/GeronimoSerial/data-hub-dashboard/pull/185) | `a51bb540` |
| Rama de integración | `promote/prod-184-185`, código auditado en `c77a5ed7` |

Se verificó con `git merge-base --is-ancestor` que las tres revisiones pertenecen a la rama. El contenido de `prod` coincidía con `main`, pero había commits de promoción propios: se conservó su historial mediante merge.

El workspace tenía una integración incompleta. Se resolvió el conflicto entre el caso de uso extraído por la PR 184 y la auditoría de la PR 185, conservando la escritura del evento dentro de la transacción del parte. Esa resolución forma parte de la rama. Las correcciones y optimizaciones exploratorias posteriores quedaron **fuera de la rama**, guardadas en el stash local `98ed2a29a963abd87c8d0ec8be8fa867ff4a8c60`. Son un borrador, no una implementación aprobada ni completamente validada.

No se desplegó ni se modificó la base de producción. No se consultaron sus datos, estadísticas SQL ni volúmenes. La revisión cubre código, integración, build y pruebas locales; no incluye una auditoría visual o de accesibilidad.

## Prioridades

**15 hallazgos:** 1 P0, 4 P1, 9 P2 y 1 P3. La prioridad expresa el orden recomendado de trabajo, no una medición de latencia.

| ID | Prioridad | Hallazgo | Área |
| --- | --- | --- | --- |
| A01 | P0 | El arranque elimina cuatro tablas heredadas | Preservación de datos |
| A02 | P1 | La actualización lee el parte sin bloqueo de fila | Concurrencia |
| A03 | P1 | Un fallo al asociar fotos bloquea el reintento y oculta el error | Preservación de datos |
| A04 | P1 | Validaciones con consultas por afectación y lecturas duplicadas | N+1 / requests |
| A05 | P1 | Consultas de membresía vuelven a ejecutar el DDL de GE | SQL / latencia |
| A06 | P2 | El contexto de tema cambia de identidad al navegar | Renders |
| A07 | P2 | Estadísticas recalcula agregaciones en cada render | Renders / CPU |
| A08 | P2 | Modales y carga de fotos se importan antes de necesitarlos | Bundle / lazy loading |
| A09 | P2 | Cada consumidor vuelve a pedir la configuración de reportes | Requests / caching |
| A10 | P2 | Evolución descarta resultados tardíos sin abortar requests | Requests / estados |
| A11 | P2 | Evolución recorre el histórico completo por cada día | CPU del servidor |
| A12 | P2 | El layout raíz precarga ocho archivos de fuentes | Fuentes |
| A13 | P2 | Cada intento de compresión vuelve a crear y dibujar el canvas | Imágenes / memoria |
| A14 | P2 | Mapas HTML cargan cuatro scripts externos en serie | Scripts |
| A15 | P3 | El visor genérico de imágenes no explicita decodificación ni dimensiones | Imágenes |

P0: riesgo de pérdida irreversible si se cumple la condición indicada. P1: corregir antes de promover cuando afecta integridad, o priorizar en rendimiento. P2: mejora posterior, con medición. P3: mejora acotada.

## Riesgos de promoción

### A01 — P0: limpieza destructiva al arrancar

**Evidencia:** [lib/db/seed.ts:136](../lib/db/seed.ts#L136) ejecuta `DROP TABLE IF EXISTS` para `infra_problematica_alumno`, `infra_problematica_seccion`, `infra_problematica` e `infra_episodio` después de migrar. Es comportamiento heredado, no una nueva instrucción de las PRs.

**Impacto:** si alguna tabla conserva datos, el primer arranque los elimina. `IF EXISTS` evita errores por ausencia; no protege las filas existentes. No se verificó que esas tablas estén pobladas en prod, por lo que se documenta un riesgo condicionado, no una pérdida observada.

**Recomendación:** separar el retiro del modelo de la siembra automática. Inventariar las tablas y sus filas; preservar o migrar los datos antes de una eliminación explícita. La migración `0030_auditoria_infraestructura.sql` agrega tabla e índices y no necesita esos borrados.

**Aceptación:** un backup restaurable y una prueba sobre una base poblada que sobreviva dos arranques conservando tablas, filas y relaciones. La prueba actual de [seed.test.ts:398](../lib/db/seed.test.ts#L398) espera que las tablas no existan; no demuestra preservación de datos heredados.

### A02 — P1: el snapshot de actualización no está serializado

**Evidencia:** [parte-repo.ts:66](../lib/infraestructura/parte/parte-repo.ts#L66) hace `SELECT … LIMIT 1` sin `FOR UPDATE`. [actualizar-parte.ts:498](../lib/infraestructura/parte/actualizar-parte.ts#L498) describe un lock que esa lectura no toma. Varias validaciones de afectaciones y alcance ocurren antes de la transacción.

**Impacto:** en PostgreSQL, dos transacciones pueden construir el diff desde el mismo estado anterior. El índice único de idempotencia protege la misma clave, pero no serializa actualizaciones con claves distintas ni hace vigente una validación anterior. Puede haber cambios pisados o movimientos que describen un estado anterior incorrecto. Es un riesgo identificado por lectura del código, no un incidente observado en prod.

**Recomendación:** bloquear el parte antes del snapshot y repetir allí las validaciones que dependen de estado mutable. Comprobar de nuevo la idempotencia después de esperar el bloqueo y antes de rechazar un borrador ya cerrado; de otro modo un replay concurrente puede terminar en 409/410.

**Aceptación:** pruebas con dos conexiones PostgreSQL y barreras deterministas: cambios independientes conservados, mismo envío con respuestas 201/200 y un solo movimiento, afectación retirada durante la espera rechazada sin escritura parcial. PGlite serializa sus transacciones y por sí solo no demuestra este comportamiento. [Referencia de PostgreSQL sobre bloqueos de fila](https://www.postgresql.org/docs/17/explicit-locking.html).

### A03 — P1: asociación de fotos sin recuperación completa

**Evidencia:** [recorrido-actualizacion.tsx:444](../components/infraestructura/actualizar/recorrido-actualizacion.tsx#L444) marca el movimiento como vinculado **antes** de completar `declararFotosFormulario`; el `catch` no libera esa marca. El retorno de confirmación en [línea 738](../components/infraestructura/actualizar/recorrido-actualizacion.tsx#L738) oculta `errorFotos`. La [cola de fotos:201](../lib/infraestructura/fotos/subida-cola.ts#L201) solamente procesa trabajos con `movimientoId`.

**Impacto:** si falla la declaración remota o la asociación local, las fotos pueden permanecer en el dispositivo sin avanzar. El usuario ve el parte confirmado, pero no el error ni una acción efectiva de reintento. El borrador además se limpia al confirmar el parte.

**Recomendación:** distinguir operación en curso de operación completada; marcar éxito después de persistir la asociación. Conservar el mismo cuerpo y clave de idempotencia al reintentar, mostrar el fallo en la confirmación y persistir la declaración pendiente para recuperarla al recargar.

**Aceptación:** simular fallo antes de la respuesta y después de la confirmación remota, cerrar/reabrir el almacenamiento y recuperar todas las fotos sin duplicar evidencia. Mantener el envío del reporte mientras se procesan las fotos: el selector entrega el conjunto preparado cuando terminan las tareas; no se comprobó un flujo normal de entrega incremental de una foto por vez.

## Consultas, requests y caching

### A04 — P1: N+1 en la validación del parte

**Evidencia:** [actualizar-parte.ts:326](../lib/infraestructura/parte/actualizar-parte.ts#L326) consulta membresía por entrada. Las nuevas afectaciones de alumnos vuelven a consultarla en la línea 343. Las modificadas leen sus secciones en las líneas 386 y 404: una misma afectación puede disparar ambas lecturas.

**Costo verificable por estructura:** para N modificaciones que cambian severidad y alumnos sin enviar secciones, hay hasta **2N consultas de secciones más N consultas de membresía**, además de las lecturas comunes. El chequeo de equivalencia también puede consultar membresía por entrada nueva cuando encuentra candidatas compatibles. No se atribuyen milisegundos sin medir la base real.

**Recomendación:** una lectura por lote de secciones, membresía compartida para las secciones necesarias y mapas en memoria. La cache debe pertenecer a la request o al intento de transacción; un reintento debe volver a leer los datos autoritativos.

**Aceptación:** comparar envíos de 1, 10 y 50 afectaciones. Las lecturas de validación deben permanecer constantes por lote y producir los mismos rechazos y resultados. Los snapshots antes/después pueden requerir lecturas adicionales justificadas.

### A05 — P1: DDL repetido dentro de operaciones de lectura

**Evidencia:** [ge-db.ts:203](../lib/infraestructura/ge-db.ts#L203) ejecuta diez sentencias de creación de esquema, tablas e índices. `attachGe` vuelve a ejecutarlas; [obtenerMembresiaSecciones](../lib/infraestructura/impacto.ts#L46) llama a ese camino antes de consultar alumnos.

**Impacto:** las lecturas repetidas de A04 también multiplican viajes SQL de DDL. Aunque las sentencias sean idempotentes, agregan trabajo de catálogo y pueden participar en esperas de locks.

**Recomendación:** inicialización explícita del esquema y deduplicación acotada al ejecutor cuando corresponda. Evitar una marca global que sobreviva a un rollback o mezcle bases y conexiones.

**Aceptación:** contar DDL por request, demostrar inicialización concurrente compartida y comprobar que un error o rollback permite reintentar. Medir locks y tiempo SQL con carga concurrente.

### A09 — P2: configuración sin deduplicación

**Evidencia:** [feature-flags-client.ts:5](../lib/infraestructura/parte/feature-flags-client.ts#L5) hace `fetch` con `no-store` en cada llamada. Galería, selectores, borradores y conteos consumen la misma configuración. [use-draft-counts.test.tsx:26](../components/infraestructura/borradores/use-draft-counts.test.tsx#L26) espera tres requests para dos consumidores: dos configuraciones y un conteo compartido.

**Recomendación:** compartir la promesa en curso y evaluar un TTL breve para configuración, con revalidación y sin cachear fallos. Los endpoints deben seguir imponiendo las flags; una cache cliente nunca reemplaza autorización. Mantener aisladas las sesiones y no extender esta política a respuestas nominales o auditadas.

**Aceptación:** varios consumidores simultáneos hacen una sola request de configuración; los cambios aparecen al vencer el TTL y un fallo de red se puede reintentar inmediatamente.

### A10 — P2: requests de evolución que siguen en vuelo

**Evidencia:** [evolucion-panel.tsx:61](../components/infraestructura/evolucion-panel.tsx#L61) usa una bandera de cancelación para ignorar respuestas, pero no un `AbortController`. Los datos anteriores permanecen mientras llega la nueva consulta.

**Recomendación:** abortar requests del navegador al cambiar filtros o desmontar y asociar el estado a la clave de consulta. Definir si se muestran datos anteriores con indicación de actualización o un estado de carga. Abortar el navegador no garantiza cancelar el trabajo SQL que el servidor ya inició.

**Aceptación:** cambios rápidos de filtros no muestran una respuesta bajo filtros incorrectos; las requests obsoletas se cancelan y la más reciente termina normalmente.

**Otra política a revisar:** [use-recurso-mapa-cacheado.ts:44](../lib/infraestructura/use-recurso-mapa-cacheado.ts#L44) limita la cache a 50 entradas, pero no incorpora TTL ni versión del dataset. Antes de ampliar caches, definir cómo se invalidan accesos y resultados cuando cambia una versión publicada.

### A11 — P2: CPU del histórico, no N+1 SQL

**Evidencia:** [evolucion.ts:243](../lib/infraestructura/evolucion.ts#L243) ya carga datos por lotes. Después recorre los partes por cada día, y para alumnos vuelve a recorrer afectaciones, secciones y alumnos en [línea 288](../lib/infraestructura/evolucion.ts#L288).

**Impacto:** el cálculo crece con la longitud del período y el volumen de afectaciones/matrícula. Agregar índices no elimina ese costo en JavaScript.

**Recomendación:** perfilar la función y, si domina el tiempo, calcular mediante eventos de inicio/fin o resultados derivados versionados. Preservar las reglas distintas de alumnos acumulados y snapshot del día.

**Aceptación:** benchmark con períodos de 30/180/365 días y volúmenes representativos; igualdad de resultados históricos, incluida deduplicación de alumnos.

## Renders y bundle

### A06 — P2: identidad inestable del contexto global

**Evidencia:** [app/providers.tsx:53](../app/providers.tsx#L53) crea `{ mode, setMode }` en cada render. El mismo componente se suscribe al pathname.

**Impacto:** una navegación que vuelve a renderizar el provider puede notificar a todos los consumidores de tema aunque el modo sea el mismo.

**Recomendación y validación:** estabilizar el valor del contexto; comprobar con React Profiler que navegar sin cambiar el tema no vuelve a renderizar consumidores por esa causa. El cambio real de tema debe seguir actualizándolos. [Documentación de React sobre memoización y referencias](https://react.dev/reference/react/memo).

### A07 — P2: agregaciones repetidas en Estadísticas

**Evidencia:** [panel-estadisticas.tsx:39](../components/mapas/panel-estadisticas.tsx#L39) ejecuta `resumir(escuelas)` y `agrupar(escuelas, por)` en cada render.

**Recomendación:** perfilar con el padrón completo y memoizar por sus dependencias reales si se confirma el costo. Al cambiar solo la agrupación, el resumen no necesita recalcularse. Una frontera memoizada solo sirve si el padre conserva referencias estables.

**Aceptación:** menos cálculos y commits al interactuar con controles ajenos al panel; el cambio de escuelas o agrupación actualiza los resultados correctos.

### A08 — P2: funcionalidad opcional en imports estáticos

**Evidencia:** [map-infraestructura-page.tsx:59](../components/mapas/map-infraestructura-page.tsx#L59) importa `VeredictoModal`; las líneas 71/72 importan los modales nominal e historial, montados incluso cerrados. [galeria-evidencia.tsx:7](../components/infraestructura/fotos/galeria-evidencia.tsx#L7) importa el formulario de carga aunque solo se estén viendo miniaturas.

**Recomendación:** carga dinámica y montaje al abrir cada función, con estado de carga y recuperación ante un chunk fallido. Priorizar la ficha y los modales; el mapa principal y los gráficos de evolución ya tienen fronteras dinámicas que conviene conservar.

**Aceptación:** la traza de red inicial no solicita los chunks opcionales; abrir cada función los carga una vez y mantiene permisos, accesibilidad y comportamiento. No diferir contenido necesario para el primer uso.

## Imágenes, fuentes y scripts

### A12 — P2: ocho precargas de fuentes en el layout raíz

**Evidencia:** [app/layout.tsx:8](../app/layout.tsx#L8) declara cuatro familias; Barlow tiene cuatro pesos, Barlow Semi Condensed dos, Montserrat uno e Inter es variable. La respuesta local de `/login` emitió **ocho** precargas `as="font"` en el encabezado HTTP `Link`.

**Recomendación:** medir qué familias y pesos se usan en la primera pantalla. Reservar precarga para los necesarios y evaluar el alcance de Montserrat, conservando la identidad de marca y los caracteres españoles. `next/font`, subconjunto latino y `display: swap` ya están presentes.

**Aceptación:** menos bytes y precargas críticas sin regresión visual ni aumento de CLS. No se midió todavía una mejora de LCP.

### A13 — P2: canvas nuevo en cada intento de calidad

**Evidencia:** [procesador-imagen.ts:86](../lib/infraestructura/fotos/procesador-imagen.ts#L86) crea el canvas y vuelve a dibujar la misma imagen en cada uno de hasta cinco intentos, para cada variante.

**Recomendación:** dibujar una vez por dimensión y reutilizar el canvas al variar la calidad. Conservar límites de píxeles y bytes, orientación, liberación del bitmap y recuperación del original.

**Aceptación:** una asignación y un dibujo por variante aun si hay varios intentos de compresión; salidas dentro de los límites existentes. La aplicación ya produce optimizada de hasta 1600 px/600 KiB y miniatura de 320 px/40 KiB: no corresponde confundir `unoptimized` en las URLs firmadas con ausencia de procesamiento.

### A14 — P2: cadena de scripts externos en mapas HTML

**Evidencia:** [mapa_interactivo/index.html:89](../public/mapa_interactivo/index.html#L89), [mapa_sobreedad/index.html:34](../public/mapa_sobreedad/index.html#L34) y [mapa_notas/index.html:34](../public/mapa_notas/index.html#L34) esperan en serie Leaflet, heat, MapLibre y el puente entre ambos. El tablero usa una cadena similar. Son documentos independientes del bundle de Next.

**Recomendación:** medir esa cascada aparte, paralelizar solo dependencias independientes y evaluar servir versiones fijadas desde el mismo origen. Conservar lazy loading y una promesa compartida de inicialización donde ya existe.

**Aceptación:** menos profundidad de cascada con red lenta; heat y el puente esperan a sus dependencias. No agregar scripts antes de que se necesite cartografía.

### A15 — P3: visor genérico de imágenes

**Evidencia:** [components/recurso-viewer.tsx:16](../components/recurso-viewer.tsx#L16) renderiza `<img>` sin dimensiones ni `decoding` explícito.

**Recomendación:** obtener dimensiones en la carga para reservar proporción y evaluar decodificación asíncrona. Usar tamaños derivados cuando los recursos lo justifiquen. Antes de adoptar el optimizador remoto, comprobar cómo conserva la autorización del endpoint privado.

**Aceptación:** imagen legible y autorizada, espacio reservado y ausencia de saltos de layout. No aplicar lazy loading indiscriminadamente a la imagen principal visible.

## Medición disponible y límites

El build de referencia de la integración pasó con Next.js 16.2.9. Se sumaron los archivos JS únicos listados en cada `page_client-reference-manifest.js` y se comprimieron individualmente con gzip:

| Ruta | Chunks referenciados | JS sin comprimir | Gzip local |
| --- | ---: | ---: | ---: |
| `/login` | 11 | 354.238 bytes | 114.768 bytes |
| `/mapas/infraestructura` | 14 | 833.421 bytes | 258.899 bytes |
| `/mapas/infraestructura/escuelas/[cue]` | 17 | 985.956 bytes | 308.569 bytes |

Son una referencia reproducible del build, **no** bytes transferidos en una sesión real: puede haber chunks dinámicos adicionales, caché de navegador y otra compresión en el proxy. No se midieron LCP, INP, CLS ni conteos de commits en un navegador autenticado con datos reales. Los tamaños experimentales del borrador no describen la rama entregada.

Sobre SQL, están comprobados los patrones repetitivos A04/A05. No hay evidencia para afirmar cuáles son las consultas más lentas en prod, su p95 o qué índices adicionales necesitan. Para completar esa parte:

1. Obtener métricas agregadas de `pg_stat_statements`, si está disponible, sin registrar parámetros con datos personales.
2. Comparar llamadas, tiempo total/promedio, filas y bloques leídos de membresía, actualización, evolución y auditoría.
3. Tomar planes `EXPLAIN (ANALYZE, BUFFERS)` de SELECT representativos en una copia controlada y revisar cardinalidades. No ejecutar escrituras reales bajo `ANALYZE` en prod.
4. Revisar índices existentes antes de agregar otros: ya existen `(corte_id, ge_section_id)`, índices de `parte_id`, claves únicas de idempotencia e índices temporales de auditoría.

### Verificación y deuda de pruebas

- Sobre el código de integración, con las optimizaciones ya apartadas, pasaron **97 pruebas en cuatro archivos**: `app/api/problematicas/parte/route.test.ts`, `lib/infraestructura/auditoria/servidor.test.ts`, `lib/db/seed.test.ts` y `lib/infraestructura/ge-db.test.ts`. Cubren, entre otros casos, reversión del parte ante fallo del evento y replay idempotente. Comando: `pnpm exec vitest run <esos cuatro archivos> --maxWorkers=1 --hookTimeout=30000 --testTimeout=30000`.
- Las pruebas adicionales sobre el borrador exploratorio no certifican el código de esta rama. El experimento incluyó PostgreSQL 17 descartable, pero no una copia de prod.
- La suite amplia se ejecutó mientras había cambios exploratorios: no es un resultado final de esta revisión. Expuso expectativas de requests que deberían actualizarse junto con una futura deduplicación.
- Hay un test dependiente del calendario en [algo-nuevo.test.tsx:205](../components/infraestructura/actualizar/algo-nuevo.test.tsx#L205): su causa cerrada del 4 de octubre deja de pertenecer a la ventana de 14 días el 19 de octubre. Fijar el reloj del test o generar fechas relativas, manteniendo pruebas de expiración separadas.
- `scripts/backup-postgres.test.ts` requiere Podman y herramientas PostgreSQL ausentes en el host. No se comprobó restauración de un backup productivo.

## Orden recomendado de ejecución

| Etapa | Trabajo | Evidencia para cerrarla |
| --- | --- | --- |
| 1. Preservación | A01, A02 y A03 | Inventario y restauración de datos; concurrencia real; fotos recuperables tras recarga |
| 2. Servidor | A04 y A05; medir A11 | Consultas constantes por lote, menos DDL y p50/p95 comparables |
| 3. Cliente | A06–A10 | Profiler, cascada de red y separación efectiva de chunks |
| 4. Recursos | A12–A15 | Bytes transferidos, memoria móvil, LCP/INP/CLS y comprobación funcional |

Implementar cada comportamiento con sus pruebas en una unidad revisable. Evitar mezclar optimizaciones con cambios de esquema destructivos o reconstrucciones de datos de staging. La promoción debe conservar la base operativa y los archivos; reemplazar la imagen de aplicación no requiere copiar una base de otro ambiente.

## Prácticas que conviene conservar

La auditoría transaccional de la PR 185, las claves de idempotencia, la separación de la validación en la PR 184, las lecturas por lotes de `parte-consulta` y evolución, la carga dinámica existente del mapa/gráficos, las miniaturas con carga diferida, el procesamiento de fotos en worker cuando está disponible y las fuentes servidas mediante `next/font` son bases útiles. Las optimizaciones propuestas deben mantener esas garantías.
