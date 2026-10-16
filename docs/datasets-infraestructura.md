# Datos versionados del mapa de infraestructura

El mapa y sus procesos leen las referencias desde PostgreSQL. `DATABASE_URL`
selecciona el entorno. Los cálculos publican resultados directamente en la DB;
no hace falta copiar CSV, JSON ni NDJSON entre servidores.

## Modelo y alcance

`infra_dataset` identifica cada conjunto; `infra_dataset_version` conserva su
revisión, fuente, licencia, fecha, checksum y metadatos. Los registros viven
individualmente en `infra_dataset_registro`, con clave y orden. Las relaciones
entre versiones de entrada y salida viven en `infra_dataset_dependencia`.
`infra_dataset_publicacion` selecciona la versión vigente por conjunto.

Los identificadores SHA-256 incluyen contenido y procedencia. Reimportar lo
mismo es idempotente. Versiones y registros son inmutables; corregir datos crea
una versión nueva. La publicación verifica que estén todos los registros.
Las capas conservan además sus proyecciones tipadas para las consultas del mapa.
Guardar, actualizar esas proyecciones y publicar ocurre en una transacción.

Se migraron 16 referencias y 8 conjuntos geográficos: 24 conjuntos, 33 versiones
iniciales. Incluyen escuelas, departamentos, localidades, máscara, eventos y
evidencias, estaciones, tramos y puntos de río, cabeceras, aislamiento,
susceptibilidad, geometrías de acceso, exposición de rutas y elevaciones DEM.
Los 16 archivos históricos de resultados se conservaron como versiones. Cuando
su archivo no documentaba las entradas originales, los metadatos lo indican;
no se reconstruyó una procedencia supuesta.

Este alcance corresponde exclusivamente a infraestructura. Los archivos
compartidos que todavía usan natalidad u otros mapas siguen en el repositorio;
infraestructura ya no los consulta. Las fixtures se conservan para tests.
Rasters, descargas OSM y cachés de cálculo siguen siendo insumos binarios de
procesamiento; no son el mecanismo de publicación o traslado de resultados.

## Consultar, importar y volver a una versión

Configurar `DATABASE_URL` y el modo TLS correspondiente en el entorno, sin
incluir credenciales en comandos versionados. Se necesita Node 24 y dependencias
instaladas en la raíz del proyecto.

```bash
pnpm datasets:historial departamentos
pnpm datasets:leer departamentos
pnpm datasets:leer departamentos ID_SHA256
pnpm datasets:publicar departamentos ID_SHA256
pnpm datasets:importar < nuevas-referencias.json
```

La importación acepta un objeto o una lista de `EntradaVersion` (ver
`lib/infraestructura/datasets/codec.ts`). Las referencias conocidas validan su
contrato antes de escribir. Una lista se confirma completa o se revierte.
`publicar` también reconstruye la proyección de escuelas o de una capa
geográfica cuando corresponde. Los lectores renuevan su caché en hasta 60 s.

Las rutas `/api/mapas/infraestructura/datasets/:dataset` permiten leer la versión
vigente, `?version=ID_SHA256` o `?historial=1`, con los permisos del mapa.
La respuesta incluye `X-Dataset-Version` y ETag. No exponen datos de usuarios.

## Ejecutar los cálculos geográficos

Los jobs de `services/geo-static` necesitan `DATABASE_URL` y Node 24 accesible
en PATH o mediante `GEO_STATIC_NODE_BINARY`. El puente `datasets.py` fija la
primera versión de cada entrada usada por el proceso, registra sus identificadores
y envía todas las salidas pendientes juntas al finalizar. No busca archivos si
falta un dataset o la conexión falla.

`pnpm import:geo-static` recibe resultados JSON por stdin. El script anterior
`scripts/importar-geo-static.mjs` sólo admite archivos históricos explícitos.
`GEO_STATIC_EXPORT_FILES=1` habilita exportaciones de diagnóstico y fixtures;
debe omitirse en la ejecución normal para publicar en la DB.

## Replicar entre entornos

Configurar `SOURCE_DATABASE_URL` y `TARGET_DATABASE_URL` mediante el gestor de
secretos o el entorno de ejecución y ejecutar:

```bash
pnpm datasets:replicar
```

Lee el origen en un snapshot de solo lectura. Copia versiones y dependencias,
verifica sus SHA-256 y publica las referencias, bases y enriquecimientos en ese
orden, dentro de una transacción de destino. Conserva el contenido y los IDs;
la fecha de incorporación al destino es propia de ese entorno. Migra el esquema
del destino antes de copiar. No copia usuarios ni reportes: éstos pertenecen a
la reconstrucción operativa de staging, documentada por separado.

El destino `hub_prod` requiere agregar `--permitir-prod`. La réplica inicial se
probó desde staging hacia PostgreSQL 17 aislado: 33 versiones, 24 publicaciones
y 2.005 escuelas, sin trasladar archivos. Producción aún no se modificó.

## Respaldo inicial

El dump previo de staging y los archivos originales están fuera del repositorio,
en el directorio privado `~/.local/state/data-hub-dashboard/`. El respaldo de
staging se restauró y verificó antes de la reconstrucción. No eliminarlo hasta
completar la validación del entorno y la promoción acordada.

## Validación de implementación

Pasaron la compilación de producción, TypeScript, 419 pruebas de datos y
lectores, 162 de mapa y fixtures operativas y 284 de Python. La suite general
también ejecutó 4.154 pruebas exitosas antes de corregir las fixtures antiguas;
sus cuatro archivos afectados se volvieron a ejecutar completos y pasaron.
La suite de backup con contenedores requiere Podman, ausente en este entorno.
El respaldo real previo de staging se verificó mediante restauración aislada.
Estos cambios de código están en el workspace; no implican desplegar la app ni
promover la DB de producción.
