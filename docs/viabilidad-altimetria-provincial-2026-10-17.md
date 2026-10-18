# Viabilidad de altimetría para todas las escuelas de Corrientes

Comprobación ampliada el 17/10/2026. **Se obtuvieron alturas IGN de 30 m para los 2.001 puntos escolares con coordenadas del padrón geográfico provincial.** Se descargaron 61 planchetas, con 378,4 MB comprimidos y 508,5 MB de raster. La adquisición provincial es viable; esto no demuestra aún mayor precisión local frente a Copernicus ni mejora del motor.

La [validación independiente posterior](validacion-precision-altimetria-2026-10-17.md) comparó los 2.001 puntos con Copernicus, armonizó aproximadamente la referencia vertical y revisó controles oficiales. No encontró evidencia suficiente para reemplazar automáticamente la fuente actual ni para asignar una precisión escolar de ±2 m. Las discrepancias entre DEM cuantifican sensibilidad, no error verdadero de terreno.

La [prueba anterior de 84 puntos](viabilidad-altimetria-parana-2026-10-17.md) cubría únicamente el corredor piloto del Paraná. Sus cifras no describen el total provincial. Este documento amplía la comprobación y prevalece para decidir cobertura de todo el padrón.

## Universo utilizado

| Universo | Registros CUE/anexo | Uso en esta comprobación |
|---|---:|---|
| Padrón geográfico `public/data/localizaciones.json` | 2.005 | Denominador provincial del servicio geográfico. No equivale necesariamente a edificios distintos. |
| Con coordenadas en ese padrón | 2.001 | Cruce de cobertura y lectura de raster. Coincide en cantidad con la corrida productiva auditada; no se hizo una nueva conciliación de identidades con producción. |
| Sin coordenadas | 4 | Quedan explícitamente pendientes; otra fuente de elevación no resuelve su ubicación. |
| Prueba anterior del corredor | 84 con coordenadas | Subconjunto territorial, no universo provincial. |

El archivo alternativo `data/natalidad/localizaciones-geo-2025-10-02.json`, usado en la exploración del corredor, contiene 2.049 registros, 47 sin coordenadas y cuatro coordenadas manifiestamente fuera de Corrientes. No se utilizó para calcular esta cobertura provincial. Los dos padrones requieren conciliación antes de modificar el universo del motor; no se borró ni corrigió ningún registro.

## Disponibilidad comprobada

| Producto | Cobertura sobre los 2.001 puntos | Archivos necesarios | Estado de obtención |
|---|---:|---:|---|
| IGN MDE-Ar v2.1, 30 m | **2.001 con al menos un valor válido leído** | 61 | **Descargados y leídos.** Integridad ZIP comprobada; hashes y metadatos conservados. |
| IGN MDT 5 m | 83 en polígonos del catálogo, 4,15 % | 16 | Pendientes de solicitud institucional; no se recibieron rasters. |
| IGN MDT 0,5 m | 39 en polígonos del catálogo, 1,95 % | 2 | Pendientes de solicitud institucional; no se recibieron rasters. |
| IGN MDT externos | 0 en el catálogo consultado | 0 | No se encontró cobertura en esa capa; no demuestra ausencia de otros relevamientos. |

Los productos de detalle suman **122 puntos distintos, el 6,10 %**. Para los otros 1.879 puntos no apareció MDT de detalle en las capas consultadas. No se debe extender al conjunto provincial la expectativa de detalle encontrada en el corredor.

La consulta WFS oficial cubrió el rectángulo `[-60,-31,-55.3,-26.5]` en EPSG:4326, que contiene todos los puntos del padrón. Devolvió 121 polígonos MDE-Ar 30 m, 46 MDT 5 m, cuatro MDT 0,5 m y ninguno de MDT externos; se seleccionaron únicamente las hojas que intersectan puntos escolares. El catálogo se obtuvo a través del [visor del IGN](https://www.ign.gob.ar/NuestrasActividades/Geodesia/ModeloDigitalElevaciones/Mapa), sin credenciales.

La [documentación del IGN](https://www.ign.gob.ar/NuestrasActividades/Geodesia/ModeloDigitalElevaciones/Introduccion) declara para MDE-Ar v2.1 referencia vertical SRVN16 y precisión aproximada de 2 m; describe precisión submétrica para sus productos aerofotogramétricos de 5 m. Para 0,5 m la precisión vertical depende del relevamiento. Estas especificaciones no son mediciones del error en nuestras escuelas. Resolución horizontal y precisión vertical son distintas.

## Cobertura de detalle y gestión pendiente

| Producto | Proyecto catalogado | Puntos por departamento declarado |
|---|---|---|
| MDT 5 m | `0044 - 2017 - COMIP`, sectores 1–3 | Ituzaingó 40; Itatí 25; General Paz 14; Berón de Astrada 3; San Miguel 1. |
| MDT 0,5 m | `2019 - Bella Vista` y `2019 - Lavalle` | Bella Vista 32; Lavalle 7. |

Los 18 enlaces correspondientes a las hojas seleccionadas conducen a la página de solicitud del IGN y devuelven HTML, no el raster. Las [instrucciones oficiales](https://www.ign.gob.ar/NuestrasActividades/Geodesia/ModeloDigitalElevaciones/faq#30) indican enviar área, producto e institución a `asesoriatecnica@ign.gob.ar`. La entrega, su plazo, volumen, condiciones de uso y metadatos específicos siguen sin confirmar.

Quedó preparado un [borrador provincial de solicitud](evidencia/altimetria-2026-10-17/provincial/solicitud-ign-borrador.md) con las 18 hojas, sin enviarlo. Sustituye como propuesta de gestión al borrador limitado al corredor. Las fechas de proyecto exigen comprobar captura real y cambios posteriores. Las hojas seleccionadas por puntos no garantizan cobertura completa de accesos y conexiones hidráulicas.

## Límites y decisión recomendada

El tamaño es manejable: la descarga inicial de 61 hojas se conserva localmente, y las alturas pueden extraerse sin consultar una API por escuela en cada pronóstico. Este inventario corresponde a puntos escolares, no al volumen necesario para modelar todas las cuencas o accesos de la provincia. No se midió rendimiento de un motor hidráulico provincial.

En dos solapamientos de hojas hubo una lectura sin dato en una hoja y válida en la alternativa. Se obtuvo al menos un valor válido para cada uno de los 2.001 puntos; no se rellenaron huecos con ceros. La evidencia conserva las 2.003 lecturas y la selección válida por registro.

El control geográfico existente del proyecto marca **siete coordenadas a más de 2 km del departamento declarado**. Una lectura válida de raster en esos puntos no confirma la altura del edificio correcto. Esos siete registros requieren revisión, además de los cuatro sin coordenadas. El resto no queda certificado por superar este control.

Recomendación: evaluar IGN 30 m como candidato provincial frente a la fuente existente y gestionar los MDT de detalle para los 122 puntos catalogados. Conservar incertidumbre y procedencia por registro; no promover automáticamente la nueva fuente por estar disponible. La cota del piso sigue sin verificarse sistemáticamente y la comparación con INA requiere ceros de escala y transferencia hidráulica compatibles. La cobertura provincial de terreno tampoco prueba cobertura provincial de pronósticos INA: hay que resolver cada tramo del Paraná, Uruguay y afluentes pertinentes por separado.

Esta comprobación no cambió el motor, la ingesta, las coordenadas ni la base productiva.

## Evidencia

- [Cobertura y altura de píxel por CUE/anexo](evidencia/altimetria-2026-10-17/provincial/cobertura-y-muestras.csv): 2.005 filas, incluidas las cuatro sin coordenadas y las siete marcadas para revisión. Los decimales exportados no representan precisión comprobada.
- [Resumen por departamento](evidencia/altimetria-2026-10-17/provincial/resumen-departamentos.csv).
- [Verificación completa](evidencia/altimetria-2026-10-17/provincial/verificacion.json): hash del padrón, archivos, tamaños, hashes, lecturas, metadatos y controles.
- [Consultas WFS](evidencia/altimetria-2026-10-17/provincial/consultas-catalogo.json) y catálogos [30 m](evidencia/altimetria-2026-10-17/provincial/catalogo-mdear30.geojson), [5 m](evidencia/altimetria-2026-10-17/provincial/catalogo-mdt5.geojson), [0,5 m](evidencia/altimetria-2026-10-17/provincial/catalogo-mdt05.geojson) y [externos](evidencia/altimetria-2026-10-17/provincial/catalogo-mdt-externos.geojson).
- [Hojas de detalle a solicitar](evidencia/altimetria-2026-10-17/provincial/planchetas-detalle-a-solicitar.csv), [área de consulta](evidencia/altimetria-2026-10-17/provincial/area-consulta.geojson) y [comprobación de sus enlaces](evidencia/altimetria-2026-10-17/provincial/acceso-detalle.json).

Los 61 ZIP y sus rasters están en `services/geo-static/.data/viabilidad-altimetria-2026-10-17/ign-mdear/`, caché ignorada por Git. Los ocho archivos de la prueba inicial se reutilizaron.
