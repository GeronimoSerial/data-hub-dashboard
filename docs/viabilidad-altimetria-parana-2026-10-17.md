# Viabilidad de obtener altimetría para el corredor del Paraná

**Alcance de este documento: únicamente el corredor piloto.** Los 84 puntos de esta prueba no son el total de escuelas de Corrientes. La [ampliación al padrón provincial](viabilidad-altimetria-provincial-2026-10-17.md) usa los 2.005 registros del servicio geográfico y distingue los 2.001 con coordenadas de los cuatro pendientes; prevalece para decidir cobertura provincial.

Comprobación: 17/10/2026. **Hay una alternativa descargable hoy: IGN MDE-Ar de 30 m. El MDT de 5 m es una mejora potencial que depende de entrega institucional; todavía no tenemos sus rasters.** No se comprobó que una de estas fuentes sea la más precisa en las escuelas del piloto.

El análisis comprende 87 CUE/anexo activos de Ituzaingó, Apipé Grande, Itá Ibaté, Itatí, Ramada Paso, Paso de la Patria y Ensenadita: 84 tienen coordenadas y tres no. Estos son registros escolares, no necesariamente edificios distintos. El padrón utilizado es `data/natalidad/localizaciones-geo-2025-10-02.json`.

## Resultado de acceso y cobertura

| Fuente | Comprobación real | Viabilidad para el piloto |
|---|---|---|
| IGN MDE-Ar v2.1, 30 m | Ocho ZIP descargados completos, integridad comprobada y ocho `.img` leídos. Hay un píxel válido para los 84 registros geocodificados. | **Disponible hoy para evaluación.** 48,5 MB comprimidos y 66,4 MB de raster. Descarga de archivos, sin una consulta externa por escuela o por pronóstico. |
| IGN MDT, 5 m | 55 de 84 registros caen dentro de siete planchetas del catálogo. Los siete enlaces probados redirigen a las instrucciones de solicitud; ninguno entregó un raster. | **Acceso condicionado.** Gestionar entrega con IGN. Plazo, volumen y condiciones concretas pendientes de respuesta. |
| IGN MDT, 0,5 m | El catálogo consultado devolvió un polígono en el área amplia, sin escuelas del piloto dentro. | No hay cobertura catalogada sobre los puntos escolares consultados. Esto no descarta relevamientos existentes fuera del catálogo. |
| FABDEM v1.2, aproximadamente 30 m | El editor publica un archivo regional de 2,14 GB que abarca el corredor. Las conexiones al servidor de datos se reiniciaron desde este entorno; no se obtuvo el raster. | **Descarga operativa sin confirmar aquí.** Revisar además su licencia antes de incorporarlo. No es una dependencia disponible para la primera etapa. |
| Piso/umbral de ingreso y pasos críticos | No se localizó una fuente sistemática validada para estos registros en los datos revisados. | No se pueden dar por obtenidos. Requieren planos o relevamientos con referencia vertical conocida; no hay relevamiento nuevo autorizado en esta etapa. |

El [IGN describe](https://www.ign.gob.ar/NuestrasActividades/Geodesia/ModeloDigitalElevaciones/Introduccion) MDE-Ar v2.1 con referencia SRVN16 y precisión vertical aproximada de 2 m; para sus productos aerofotogramétricos de 5 m publica precisión submétrica. Son especificaciones generales del editor, no errores medidos en este piloto. La resolución de 5 o 30 m es el espaciado horizontal, no la precisión vertical.

[Bristol publica FABDEM](https://research-information.bris.ac.uk/en/datasets/fabdem-v1-2/) como corrección de edificios y árboles sobre Copernicus, con licencia CC BY-NC-SA 4.0. Su parentesco con Copernicus impide tratar ambos como observaciones independientes. El fallo de conexión local no demuestra indisponibilidad global.

## Dónde serviría el MDT de 5 m

Cruce de puntos escolares con polígonos del catálogo oficial, no verificación de píxeles:

| Localidad | Con coordenadas | Dentro del catálogo MDT 5 m |
|---|---:|---:|
| Ituzaingó | 27 | 25 |
| Apipé Grande | 2 | 2 |
| Itá Ibaté | 16 | 14 |
| Itatí | 11 | 11 |
| Ramada Paso | 4 | 3 |
| Paso de la Patria | 18 | 0 |
| Ensenadita | 6 | 0 |
| **Total** | **84** | **55** |

Las siete planchetas pertenecen al proyecto catalogado `0044 - 2017 - COMIP`, sectores 1–3. Hay que confirmar fecha de captura y cambios posteriores de defensas, rellenos y caminos. Estas siete hojas cubren los puntos escolares; no garantizan cubrir todos los accesos o toda la conexión con el río. El catálogo devuelve 46 polígonos MDT 5 m en el rectángulo de consulta completo.

La [vía oficial de solicitud](https://www.ign.gob.ar/NuestrasActividades/Geodesia/ModeloDigitalElevaciones/faq#30) es `asesoriatecnica@ign.gob.ar`, indicando área, producto e institución. Quedó preparado un [borrador de solicitud](evidencia/altimetria-2026-10-17/solicitud-ign-borrador.md) con las siete hojas y el área amplia. No se envió. No se confirmó un plazo de respuesta ni condiciones específicas de entrega o redistribución.

## Qué permite concluir la descarga de 30 m

La adquisición y lectura son viables: los archivos son HFA, `float32`, con referencia horizontal EPSG:4326, y Rasterio pudo leer valores válidos en los 84 puntos. El servicio geoespacial del proyecto ya utiliza Rasterio; no hace falta adoptar otro formato de procesamiento. La lectura se comprobó en este entorno, no en un despliegue nuevo del servicio.

La referencia vertical procede de la documentación del producto; los archivos leídos no incluyen una definición vertical explícita. El valor ausente varía entre hojas (`-9999` y `-999999`): el lector debe respetar el metadato de cada una. Los tres registros sin coordenadas necesitan corregir su ubicación, no otra fuente altimétrica.

No se validó la exactitud física de las alturas, la posición del edificio dentro del píxel ni la superioridad frente al Copernicus existente. Un MDE tampoco equivale a una medición del piso. Por tanto, corresponde evaluar IGN 30 m como candidato y conservar procedencia e incertidumbre, sin reemplazar automáticamente la capa actual.

## Condiciones para mejorar la probabilidad

Obtener un raster resuelve el acceso al dato, pero aún quedan dos uniones necesarias: llevar la altura INA a la misma referencia vertical del terreno y trasladar el nivel de la estación hasta la escuela mediante una relación hidráulica. En esta comprobación no se obtuvo una tabla validada de ceros de escala y transferencias locales. Comparar directamente metros de escala INA con metros de elevación produciría resultados incorrectos.

La cota del terreno permite modelar exposición del predio. Para agua dentro del edificio debe añadirse el umbral de ingreso, medido o representado con incertidumbre explícita. Para interrupción educativa deben analizarse también los accesos y sus pasos críticos. Estas limitaciones no obligan a esperar un reporte de inundación para pronosticar.

La recomendación es evaluar ahora IGN 30 m junto con la fuente existente, gestionar MDT 5 m para los sectores catalogados y mantener la incertidumbre de piso y accesos donde no haya medición. La elección definitiva requiere control local y compatibilidad vertical. La evaluación altimétrica no resuelve por sí sola las limitaciones temporales del pronóstico INA, documentadas en el [diseño probabilístico](pronostico-probabilistico-fluvial-escuelas.md).

## Evidencia conservada

- [Cobertura y valor de píxel por CUE/anexo](evidencia/altimetria-2026-10-17/cobertura-y-muestras.csv): 84 lecturas y tres registros sin coordenadas. Los decimales exportados no representan precisión medida.
- [Planchetas MDT 5 m a solicitar](evidencia/altimetria-2026-10-17/planchetas-mdt5-a-solicitar.csv) y [área GeoJSON](evidencia/altimetria-2026-10-17/area-consulta.geojson).
- [Verificación técnica](evidencia/altimetria-2026-10-17/verificacion.json): fechas, URLs, tamaños, SHA-256, integridad ZIP, metadatos y resultados de acceso.
- [Catálogo MDT 5 m consultado](evidencia/altimetria-2026-10-17/catalogo-mdt5.geojson) y [catálogo MDE-Ar 30 m consultado](evidencia/altimetria-2026-10-17/catalogo-mdear30.geojson).

Los ocho ZIP y ocho `.img` quedaron en la caché local ignorada por Git: `services/geo-static/.data/viabilidad-altimetria-2026-10-17/ign-mdear/`. Esta tarea no cambió el motor, la ingesta ni la base productiva.
