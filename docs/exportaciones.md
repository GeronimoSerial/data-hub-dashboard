# Exportaciones de escuelas

La pestaña Exportar del mapa carga una página por consulta y descarga el resultado completo en Excel. La tabla de Arc se carga bajo demanda; el ordenamiento se aplica en el servidor antes de paginar. Cambiar filtros vuelve a la primera página.

## API

`GET /api/infraestructura/exportar` mantiene los filtros del mapa y los estados combinables. Estados del mismo grupo se unen; grupos distintos se intersectan.

| Parámetro | Comportamiento |
| --- | --- |
| `formato` | `xlsx` por defecto; `json` para la tabla. |
| `pagina` | Entero desde 1; por defecto 1. |
| `tamanoPagina` | Entero de 1 a 100; por defecto 25. La interfaz ofrece 25, 50 y 100. |
| `ordenarPor` | Clave de una columna visible; omitida conserva el orden por departamento y escuela. |
| `sentido` | `asc` o `desc`; por defecto `asc`. |

JSON devuelve `total`, `pagina`, `tamanoPagina`, `totalPaginas`, `columnas`, `filas` y `opciones` (departamentos y direcciones). Solo envía las filas de la página y las columnas visibles. Una página fuera de rango se ajusta a la última disponible. Las opciones se obtienen del padrón autorizado, sin descargarlo al navegador.

Excel respeta filtros y orden, pero incluye todas las filas. ExcelJS se importa solamente para la descarga.

La vista previa y el pie del Excel incluyen el total de alumnos: la suma de matrícula de todas las escuelas que cumplen los filtros y el alcance autorizado, antes de paginar. No representa alumnos sin clases ni solamente los de la página visible.

## Caché y actualización

La caché vive en memoria de cada proceso y vence a los 30 segundos desde el inicio de la carga. Puede mostrar cambios de datos con ese retraso. No es una caché distribuida.

- Se autorizan todas las peticiones antes de consultar la caché.
- Se retienen hasta 8 padrones, separados por alcance. Los identificadores de niveles se canonizan antes de formar la clave.
- Cada padrón retiene hasta 16 consultas, 16 ordenamientos y 3 horizontes de radar. Cambiar el orden reutiliza las filas filtradas; vista previa, páginas y Excel comparten las consultas. Las peticiones simultáneas comparten el trabajo en curso.
- Los errores se descartan para permitir reintentos. `invalidarCacheExportaciones()` permite vaciar la caché del proceso explícitamente.
- Las respuestas JSON usan `Cache-Control: private, no-cache`, `Vary: Cookie, Accept-Encoding`, ETag y compresión. La revalidación también comprueba el acceso. Excel conserva `private, no-store`.

## Verificación

`pnpm vitest run lib/exportaciones app/api/infraestructura/exportar components/mapas/exportar` cubre paginación, orden, descarga completa, opciones, permisos, vencimiento, concurrencia, revalidación, errores y cancelación de consultas obsoletas.

También se verifican los consumidores del multiselect, los tests del mapa, TypeScript, ESLint y `pnpm build`. La comprobación visual aislada utiliza datos de prueba: navegación, filtros, descarga y anchos de 320, 390, 768 y 1440 px.
