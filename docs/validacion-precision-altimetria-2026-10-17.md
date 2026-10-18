# Validación de precisión altimétrica para el riesgo escolar provincial

Revisión independiente realizada el 17/10/2026. **No hay evidencia suficiente para reemplazar automáticamente Copernicus por IGN 30 m ni para asignar un error de “±2 m” a cada escuela.** Se compararon ambos productos en los 2.001 registros con coordenadas, se armonizó aproximadamente su referencia vertical y se verificó la evaluación provincial publicada por el IGN. Persiste una discrepancia relevante entre modelos. Todavía no se validó la altura del suelo o del piso en cada edificio, ni la precisión de una probabilidad de inundación escolar.

## Resultado y alcance

| Comprobación | Resultado | Qué permite concluir |
|---|---|---|
| Disponibilidad provincial | IGN y Copernicus con valores en los 2.001 registros geolocalizados | Ambos son utilizables para comparar exposición; disponibilidad no demuestra exactitud. |
| Comparación con operador del proyecto | p10 de alturas dentro de 50 m, calculado para ambos productos | Cuantifica sensibilidad de esa estimación a la fuente; no mide cota de piso. |
| Referencia vertical | SRVN16 frente a EGM2008; armonización aproximada comprobada contra PROJ | Evita atribuir toda la diferencia al terreno o mezclar cotas incompatibles. |
| Evaluación oficial IGN en Corrientes | 1.572 controles iniciales; 1.510 después de 62 descartes | Hay evidencia provincial publicada, con sesgo y dispersión; no certifica cada escuela. |
| Controles nuevos independientes en edificios | Ninguno con altura de suelo/piso, ubicación y datum compatibles verificados | La exactitud escolar permanece pendiente. |

El universo es `public/data/localizaciones.json`: 2.005 registros CUE/anexo, 2.001 con coordenadas y cuatro sin ellas. Los 2.001 registros ocupan **1.957 coordenadas distintas**; los anexos co-ubicados no son observaciones independientes. Se conservan resultados por registro y por ubicación única. Se excluyen adicionalmente los siete puntos previamente marcados fuera del departamento en un corte separado, sin corregirlos. El filtro de localidades del corredor sobre este padrón devuelve 86 puntos, frente a los 84 del padrón alternativo utilizado en la primera exploración. La conclusión principal usa toda la provincia.

## Qué comparación se hizo

El proyecto declara [Copernicus DSM GLO-30](../services/geo-static/src/geo_static/fuentes_inundacion.py) y calcula el p10 del DEM en un radio de 50 m en [margen_inundacion.py](../services/geo-static/src/geo_static/margen_inundacion.py). El mosaico original `.data/dem/glo30.tif` **no está en este checkout**. Se leyeron ventanas de las 17 teselas COG públicas de la misma fuente declarada por el código. No se certificó su igualdad de versión, bytes o procesamiento con el raster desplegado en producción; allí el código también permite remuestreo al construir el mosaico.

Se compararon la lectura puntual nativa y el mismo operador p10 a 50 m. El disco se define por distancia de Haversine a los centros de píxel; se consideran hojas contiguas y se deduplican celdas superpuestas del IGN. Las 61 hojas IGN disponibles y las 17 teselas Copernicus aportaron valores a los 2.001 registros, sin imputar ceros a faltantes. Las cuatro filas sin coordenadas conservan campos vacíos. No se verificó visualmente que cada coordenada esté sobre el edificio correcto.

Cada producto conserva su grilla nativa: la muestra de 50 m contiene entre 8 y 12 celdas IGN y entre 7 y 12 Copernicus. Cambian centros, alineación, resolución efectiva, captura y procesamiento. Parte de la discrepancia puede proceder de esas diferencias. No se remuestreó uno para forzar su coincidencia con el otro y no se calculó un corte urbano/rural sin una clasificación verificada.

### Referencia vertical y prueba del signo

IGN MDE-Ar v2.1 está referido a SRVN16. [Copernicus documenta EGM2008](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM), modelo de superficie, y una especificación de error vertical absoluto inferior a 4 m al 90 % para su producto; esto no constituye una medición en nuestras escuelas. Su especificación tampoco es directamente comparable con el genérico “aproximadamente 2 m” del IGN, cuya métrica y población son distintas.

Se descargaron las grillas IGN GEOIDE-Ar16 y NGA EGM2008 de la distribución oficial PROJ-data, con hashes SHA-256 comprobados contra su catálogo: 6,4 MB y 80,6 MB. [PROJ documenta el origen y uso de la grilla IGN](https://github.com/OSGeo/PROJ-data/blob/master/ar_ign/ar_ign_README.txt). Para cada centro de píxel Copernicus se interpolaron bilinealmente las ondulaciones, todas en metros:

```text
h ≈ H_EGM2008 + N_EGM2008
H_SRVN16_aprox ≈ h − N_GEOIDE-Ar16
                 = H_EGM2008 + N_EGM2008 − N_GEOIDE-Ar16
```

El sentido coincide con la [convención de transformación vertical PROJ](https://proj.org/en/stable/operations/transformations/vgridshift.html). En el punto de prueba `(-58.833112, -27.489013)`, N_EGM2008=18,785730 m y N_GEOIDE-Ar16=18,999553 m: una altura de prueba de 100 m pasa a 99,786177 m. El cálculo manual y la cadena PROJ difieren 1,4×10⁻¹⁴ m. Es una comprobación de implementación y signo, no una validación geodésica contra terreno.

La corrección en los 2.001 puntos tiene mediana −0,194 m y magnitud máxima de 0,529 m. La transformación es aproximada: se usa EGM2008 de 2,5 minutos y GEOIDE-Ar16 de un minuto; no se reproduce necesariamente la interpolación geoidal de la generación de Copernicus, ni se ajustan época y marco horizontal WGS84-G1150/POSGAR07. Estos límites impiden interpretar centímetros del cálculo como exactitud física. Se conserva la comparación cruda y la armonizada por separado.

## Diferencias medidas entre modelos

**D = IGN − Copernicus.** Un D positivo expresa que la estimación IGN es más alta; no identifica qué modelo está más cerca del suelo verdadero. P90(|D|) es el percentil 90 de la magnitud de las diferencias, no un intervalo de confianza del terreno.

| Población y operador | N | Media D (m) | Mediana D (m) | P90(\|D\|) (m) | Registros con \|D\| > 2 m |
|---|---:|---:|---:|---:|---:|
| Provincia, píxel puntual, referencias originales | 2.001 | +1,381 | +1,341 | 3,388 | 708 |
| Provincia, p10 a 50 m, referencias originales | 2.001 | +1,788 | +1,761 | 3,278 | 843 |
| **Provincia, p10 a 50 m, armonización aproximada** | **2.001** | **+1,960** | **+1,937** | **3,394** | **956** |
| Ubicaciones únicas, p10 armonizado | 1.957 | +1,960 | +1,937 | 3,401 | 936 |
| Provincia sin siete alertas de coordenadas, p10 armonizado | 1.994 | +1,955 | +1,929 | 3,390 | 951 |
| Corredor por localidades del padrón actual, p10 armonizado | 86 | +1,563 | +1,333 | 3,009 | 29 |

La discrepancia p10 armonizada supera 2 m en **956/2.001 registros, 47,8 %**, y 5 m en 19. Esto justifica tratar la elección de DEM como una sensibilidad material. No permite elegir al ganador, afirmar un error de 2 m, ni usar dos DEM como escenarios equiprobables o independientes. La armonización no elimina la discrepancia; en promedio la incrementa ligeramente.

Dentro del disco de 50 m, la mediana de la amplitud p90−p10 es 1,246 m en IGN y 2,035 m en Copernicus. **Es variación espacial local, no error instrumental ni incertidumbre de medición.** Puede reflejar relieve real, superficies, vegetación, construcciones y procesamiento. Que IGN resulte más suave no demuestra mayor exactitud. El p10 puede pertenecer a una cuneta o parcela vecina: no certifica el terreno bajo el edificio.

## Evidencia oficial de exactitud y controles accesibles

El [informe técnico del IGN MDE-Ar v2.1, figura 25, página 28](https://www.ign.gob.ar/archivos/Informe_MDE-Ar_v2.1_30m.pdf) presenta específicamente Corrientes. La figura se verificó visualmente y corresponde a v2.1, el producto descargado según el catálogo. Se transcriben sus estadísticas sin recalcularlas:

| Población publicada | N | Media de diferencias (m) | Desvío σ (m) | Mediana M (m) | Extremos (m) |
|---|---:|---:|---:|---:|---|
| Todos los controles provinciales | 1.572 | −1,96 | 2,46 | −1,60 | −19,46 a +12,03 |
| Población final, 62 descartados | 1.510 | −1,62 | 1,55 | −1,55 | −7,98 a +4,01 |

No se localizó en el texto una regla explícita para esos descartes, una definición algebraica inequívoca del signo ni la convención muestral/poblacional de σ. Se conserva el signo publicado y no se prescribe una corrección de ±1,62 m. No se deriva RMSE ni una distribución normal escolar. Es validación publicada por el productor; no se acreditó separación respecto de puntos usados durante ajustes/filtrados. La población filtrada no representa automáticamente cualquier escuela, humedal o superficie urbana. Su magnitud muestra que submetros de diferencia pueden ser decisivos para inundación y no resolverse con una ficha nominal.

Como control potencial se descargaron las capas oficiales RN-Ar de alta precisión, precisión y topografía. Hay 2.363 marcas en el rectángulo de consulta y **1.343 dentro del límite provincial** utilizado. De estas, 1.246 son “Chapa pilar”; 99 figuran destruidas y 528 carecen de estado. Son estados del catálogo consultado, sin comprobación actual de campo. Sólo seis registros escolares tienen una marca a menos de 50 m; 41 a menos de 100 m. La proximidad no convierte la cota de la marca en cota del edificio.

La [documentación oficial de RN-Ar](https://www.ign.gob.ar/NuestrasActividades/Geodesia/Nivelacion/Introduccion) distingue coordenadas obtenidas con precisiones desde centímetros hasta 100–200 m, según el procedimiento. El [servicio de búsqueda](https://www.ign.gob.ar/NuestrasActividades/Geodesia/Nivelacion/Busqueda) identifica las cotas como ortométricas SRVN16. En las capas recibidas falta calidad horizontal por punto y reducción marca–suelo. Tampoco se acredita independencia de controles usados por el productor. Por ello **no se computó un supuesto RMSE de terreno restando DEM menos chapa**. Los listados sirven para preparar controles y vincular futuros relevamientos, no para certificar hoy las 2.001 alturas.

IGN 30 m utiliza ALOS/SRTM; [JAXA identifica AW3D30 como DSM](https://www.eorc.jaxa.jp/ALOS/en/dataset/aw3d30/aw3d30_e.htm). No se comprobó eliminación sistemática de árboles y edificios en las escuelas. Ambos productos pueden representar superficies distintas del suelo. Los MDT IGN de 5 m y 0,5 m están sólo catalogados y siguen sin archivos: no aportan aún un control observado. No se obtuvo otro conjunto público independiente con soporte de suelo/piso, coordenadas, fecha y datum adecuados que permita resolver esa falta en esta revisión.

## Decisión para el motor

**Conservar Copernicus y evaluar IGN como fuente alternativa explícita, sin reemplazo automático ni promedio entre ambos.** IGN aporta disponibilidad provincial y una referencia nacional útil, pero no se demostró que reduzca el error en cada escuela. Antes de promoverlo, obtener controles de terreno compatibles, resolver las ubicaciones dudosas y repetir contra el raster realmente desplegado. El MDT de detalle, cuando se entregue, también deberá validarse: una grilla más fina no certifica piso escolar.

La incertidumbre que debe acompañar al pronóstico incluye:

- **Terreno:** sesgo y residuo espacial del DEM, superficie/vegetación y fecha. Estimarlos con controles; conservar la discrepancia entre modelos como prueba de sensibilidad, sin convertirla en distribución calibrada.
- **Ubicación y edificio:** calidad de la coordenada, huella/recinto correcto y diferencia entre terreno y umbral de ingreso. El padrón deja calidad sin especificar en 1.998 registros; tres tienen anotaciones de herencia/aproximación y cuatro no tienen coordenadas. No imponer error cero al resto por ausencia de etiqueta.
- **Agua y datum:** incertidumbre del pronóstico INA, cota del cero de escala, transferencia hidráulica al sitio y conexión/defensas. Esta revisión de DEM no valida esas relaciones.
- **Accesos:** suelo y umbrales de los pasos críticos, con rutas alternativas y grupos afectados; no heredar la cota escolar como cota del recorrido.

En escenarios de diez días, el error estático del terreno se conserva durante toda la trayectoria y puede estar correlacionado entre sitios; no se vuelve a sortear independientemente cada día. Si cambiar de DEM o de ubicación plausible cambia la afectación prevista, identificar esa sensibilidad. No descartar riesgo por un margen positivo pequeño sin validar su incertidumbre. Sin controles compatibles, las probabilidades pueden identificarse como físicas/modeladas con sensibilidad pendiente; no como porcentajes escolares cuya calibración fue comprobada.

## Reproducción y evidencia

- [Script de comparación y armonización](evidencia/validacion-precision-altimetria-2026-10-17/validar_altimetria.py), [métricas con denominadores](evidencia/validacion-precision-altimetria-2026-10-17/metricas.json) y [CSV por CUE/anexo](evidencia/validacion-precision-altimetria-2026-10-17/comparacion-escolar.csv).
- [Catálogo/hash de las grillas geoidales](evidencia/validacion-precision-altimetria-2026-10-17/grillas-proj.geojson) y [transcripción verificable de la evaluación oficial](evidencia/validacion-precision-altimetria-2026-10-17/validacion-publicada-ign-corrientes.json).
- [Script de revisión RN-Ar](evidencia/validacion-precision-altimetria-2026-10-17/revisar_controles.py), [consultas, conteos y hashes](evidencia/validacion-precision-altimetria-2026-10-17/controles-rn-ar.json), [marcas provinciales](evidencia/validacion-precision-altimetria-2026-10-17/marcas-rn-ar-provincia.geojson) y [proximidad, que no constituye validación](evidencia/validacion-precision-altimetria-2026-10-17/proximidad-marcas-no-validacion.csv).

Las ventanas Copernicus y grillas geoidales quedan en la caché ignorada `services/geo-static/.data/validacion-precision-altimetria-2026-10-17/`. Se pueden repetir los cálculos sin descargar el mosaico provincial. Las dependencias se instalaron aisladamente en `/tmp`; no se cambiaron dependencias, código del motor, coordenadas, configuración ni producción. La validación ejecutada es el análisis reproducible de datos, no una nueva batería de tests del producto.
