# Prefectura: una ingesta, histórico y dos entornos

Los jobs existentes de Coolify siguen consultando Prefectura sólo en producción.
Cada ejecución exitosa guarda un dataset `prefectura-alturas` o
`prefectura-referencias`, con fecha de captura, catálogo de entrada, SHA-256,
identificador del job y revisión del código de la imagen. Las referencias
conservan además las lecturas históricas descargadas y los errores parciales.
No se reconstruyen resultados que ya se habían sobrescrito antes de este cambio.

Archivo, proyección operativa y fila de `infra_dataset_entrega` se confirman en
una transacción local. Una falla de staging no participa de esa transacción.
Los jobs no necesitan credenciales ni conexión de staging.

En staging, `node scripts/replicar-prefectura.mjs` consume las entregas pendientes
cada cinco minutos. Copia versiones y dependencias, verifica el checksum y aplica
la proyección en una transacción de destino antes de confirmar la entrega en
origen. No consulta Prefectura ni repite cálculos. La configuración requiere
`DATABASE_URL` de staging, `PREFECTURA_SOURCE_DATABASE_URL` de producción y TLS.
El script verifica los nombres reales de ambas bases antes de operar.

Cada falla incrementa el contador y programa un reintento con espera creciente,
hasta una hora. Un fallo tras confirmar destino y antes de confirmar origen se
resuelve reentregando el mismo ID. Workers concurrentes usan `SKIP LOCKED`.
Una versión atrasada se archiva, pero no retrocede la publicación ni la referencia
vigente. La salud de la fuente usa la fecha original, sin rejuvenecer datos viejos.

Coolify ejecuta sólo el transporte en staging; sus ingestas de Prefectura se
deshabilitan si estaban programadas allí. La acción manual `Operar entregas de
Prefectura` inspecciona o configura esa tarea mediante la API, con secretos de
GitHub. La conexión no se guarda en el repositorio ni en comandos de cron.

La entrega copia exclusivamente datasets de Prefectura y sus dependencias.
No replica usuarios, sesiones ni reportes. El estado de la cola se consulta en
`infra_dataset_entrega`; el histórico se lee con los comandos `datasets:leer` y
`datasets:historial`. Las proyecciones son optimizaciones de lectura: el archivo
versionado conserva también las correcciones que una medición ya existente
no sobrescribe en `hidro_lectura`.

Para detener el transporte, deshabilitar `replicar-prefectura` en Coolify.
Las ingestas y el histórico de producción siguen funcionando; las entregas se
acumulan hasta reactivarlo. No borrar versiones ni vaciar la cola para reintentar.
