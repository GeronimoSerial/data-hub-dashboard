# Pronóstico probabilístico de crecidas y afectación escolar

Actualización: 17/10/2026. Alcance acordado: anticipar hasta diez días, con prioridad en las crecidas de los ríos. El pronóstico debe funcionar sin reportes de inundación de las escuelas. Los dos objetivos son agua dentro del edificio e interrupción educativa, incluida la imposibilidad de llegada de alumnos o docentes.

**Cobertura escolar provincial:** el corredor del Paraná es un piloto territorial; no reduce el universo de más de 2.000 escuelas. La [comprobación altimétrica provincial](viabilidad-altimetria-provincial-2026-10-17.md) obtuvo valores IGN de 30 m en los 2.001 puntos con coordenadas del padrón geográfico de 2.005 registros. Los 84 puntos citados en la exploración anterior corresponden únicamente al piloto.

## Decisión de diseño

Construir la cadena **distribución futura de caudal/nivel → inundación local → edificio y accesos**. Las observaciones actuales de río y cuenca inicializan y corrigen el pronóstico antes del impacto. Los reportes escolares se usan después para contrastar resultados y mejorar el modelo; su ausencia no impide emitir una predicción.

**Fuente elegida por el usuario: INA.** La integración fluvial prioriza su API A5 para conservar identidad de estación, fecha de emisión, variable y calificadores probabilísticos. Open-Meteo Flood queda fuera del predictor propuesto por ahora. Su disponibilidad técnica y el presupuesto investigado no acreditan precisión hidrológica local. Esta decisión cambia el diseño; todavía no sustituye la ingesta desplegada en producción.

Se pueden producir probabilidades físicas/modeladas con hidrología, geometría y sus incertidumbres aunque no haya etiquetas escolares. En ese caso se declara que la calibración escolar todavía no está comprobada. La falta de etiquetas limita qué exactitud podemos demostrar, no obliga a esperar la inundación para predecirla.

## Qué aporta Google

El [artículo de Google Research del 20/03/2024](https://research.google/blog/using-ai-to-expand-global-access-to-reliable-flood-forecasts/) describe un modelo que utiliza meteorología antecedente, pronóstico meteorológico y características de cuenca para generar distribuciones de caudal. Su evaluación global muestra mejoras sobre GloFAS v4 de aquella comparación; ese resultado no garantiza superioridad en el Paraná regulado. La evaluación original está en [Nature](https://www.nature.com/articles/s41586-024-07145-1).

| Recurso actual comprobado | Utilidad para este motor | Condición o límite |
|---|---|---|
| [Modelo hidrológico de Google](https://sites.research.google/gr/floodforecasting/our-models/) | Distribuciones de caudal por día con hasta siete días de anticipación. | No cubre por sí solo los días 8–10. |
| [Cobertura de Flood Hub](https://support.google.com/flood-hub/answer/16508958) | Argentina está incluida. | No se confirmó aún qué puntos y mapas tienen cobertura/validación en Ituzaingó, Itatí y Paso de la Patria. |
| [Flood Forecasting API](https://developers.google.com/flood-forecasting) | Integración automática de pronósticos y estado previsto. | Sin cargo según su documentación, pero requiere aprobación, proyecto y clave. La consulta sin credencial devolvió HTTP 403. No se solicitó acceso en nombre del usuario. |
| [Consulta de pronósticos](https://developers.google.com/flood-forecasting/rest/v1/gauges/queryGaugeForecasts) | Emisión, intervalo de validez y valor para cada plazo; permite construir un archivo de pronósticos emitidos. | El esquema publicado devuelve `value`, no cuantiles, miembros ni parámetros de la distribución. No permite extraer directamente un porcentaje numérico de excedencia. |
| [Mapas en FloodStatus](https://developers.google.com/flood-forecasting/rest/v1/floodStatus) | Polígonos de inundación prevista donde exista cobertura. | `PROBABILITY` y `DEPTH` tienen significados distintos. Las clases HIGH/MEDIUM/LOW no deben convertirse en porcentajes arbitrarios. |
| [GRRR y código abierto](https://sites.research.google/gr/floodforecasting/resources/) | Datos históricos del modelo, código y modelos preentrenados para evaluación/adaptación. | Datos históricos no son observaciones independientes; contrastar con estaciones y satélite. Ejecutar el modelo propio exige preparar cuencas, meteorología y recursos de cómputo. |

El usuario confirmó que ya existe un proyecto de Google Cloud, pero todavía no tiene esta API. El paso de acceso pendiente es solicitar admisión al programa para ese proyecto; no se debe confundir tener Google Cloud con estar habilitado como consumidor de la API.

La [documentación del modelo](https://sites.research.google/gr/floodforecasting/our-models/) explica que la curva determinística diaria corresponde a la mediana de la distribución. Por tanto, disponer de una curva o de un color en Flood Hub no implica tener acceso a la distribución necesaria para calcular cualquier probabilidad escolar.

## INA: disponibilidad y contrato comprobados

Se consultaron el [catálogo de pronósticos](https://alerta.ina.gob.ar/pub/gui/seriesProno), el [asistente de datos](https://alerta.ina.gob.ar/pub/gui/datosProno) y la [documentación A5](https://alerta.ina.gob.ar/a5/swagger/index.html). Las consultas A5 siguientes devolvieron HTTP 200 sin credenciales el 17/10. No se encontró una cuota pública que permita asumir uso ilimitado.

| Estación | ID de estación INA | Serie de pronóstico localizada | Qué entrega |
|---|---:|---:|---|
| Ituzaingó | 15 | No localizada en el catálogo consultado | Hay observaciones; no trasladar automáticamente el pronóstico de otra estación. |
| Itá Ibaté | 16 | 34860, calibrado 499 | Altura media semanal, `main`, `p10`, `p90`. |
| Itatí | 17 | 34861, calibrado 499 | Altura media semanal, `main`, `p10`, `p90`. |
| Paso de la Patria | 18 | 34862, calibrado 499 | Altura media semanal, `main`, `p10`, `p90`. |
| Corrientes | 19 | 34863, calibrado 499; 1540, calibrado 289 | Media semanal con `p10/p90`; altura hidrométrica con `inferior/medio/superior`. |

Endpoints para descargar cada corrida completa y filtrar localmente por serie:

```text
https://alerta.ina.gob.ar/a5/sim/calibrados/499/corridas/last?includeProno=true&timestart=2026-10-17&timeend=2026-10-28
https://alerta.ina.gob.ar/a5/sim/calibrados/289/corridas/last?includeProno=true&timestart=2026-10-17&timeend=2026-10-28
```

La primera consulta incluyó 28 series y emisión `2026-10-16T12:00:00Z`; la segunda, ocho series y emisión `2026-10-16T03:00:00Z`. Una consulta específica con `estacion_id`, `var_id` y `series_metadata=true` permitió comprobar unidad, estación y soporte temporal. En las respuestas completas algunos metadatos de serie vinieron nulos: el catálogo debe guardarse y validarse por separado, no asumir que cada corrida los incluirá.

Como comprobación del contrato, la serie semanal de Itatí para la fecha etiquetada 18/10 devolvió `main=7,49 m`, `p10=7,11 m`, `p90=7,87 m`; para 25/10, `main=4,14 m`, `p10=3,45 m`, `p90=4,49 m`. Son valores de pronóstico, no lecturas observadas. **No usar esos promedios como pico diario ni como ingreso de agua al edificio.** Hay que confirmar qué semana representa cada fecha: el metadato declara soporte de siete días, pero las filas tienen inicio y fin iguales. Tampoco se asume que `main` sea la mediana sin documentación del producto.

El endpoint simplificado `pub/datos/datosProno` devolvió las mismas tres filas por fecha **sin `qualifier`**. No se debe inferir el significado por orden o por valor. La API A5 conserva `main/p10/p90` y es la ruta elegida para la ingesta probabilística.

En Corrientes, la serie 1540 devolvió para 20/10 valores 7,00 / 7,29 / 7,80 m identificados como `inferior/medio/superior`, y otra fecha el 27/10. Estos rótulos no declaran probabilidades de cobertura; no asignarles p10/p50/p90 arbitrariamente ni presentar dos fechas como una trayectoria diaria completa.

Dos cuantiles permiten acotar incertidumbre del evento correspondiente, pero no reconstruyen por sí solos toda una distribución ni sus trayectorias temporales. Para probabilidades de excedencia diaria o de ingreso en cualquier momento de diez días se necesita un producto de esa duración/resolución o un modelo local de trayectorias basado en series INA y errores históricos. No interpolar promedios semanales como si fueran máximos diarios. El [reporte oficial](https://alerta.ina.gob.ar/a5/diario/reporte_diario) complementa el contexto de crecida, sin transformar expresiones cualitativas en porcentajes numéricos.

## Open-Meteo: experimento de disponibilidad, suspendido como ruta principal

La [API Flood de Open-Meteo](https://open-meteo.com/en/docs/flood-api) permite solicitar todos los miembros mediante `ensemble=true`. El proveedor local `lib/infraestructura/riesgo/providers/flood.ts` solicita resúmenes pero sólo emite/persiste `river_discharge`; actualmente se pierde la información de escenarios.

Se realizó el 17/10 una consulta de lectura al punto curado de Ituzaingó:

```text
https://flood-api.open-meteo.com/v1/flood?latitude=-27.49&longitude=-56.8&daily=river_discharge&ensemble=true&forecast_days=10&timezone=GMT
```

Devolvió HTTP 200, celda `(-27.474998, -56.82499)`, fechas 17–26/10/2026 y **51 series con dato en cada uno de los diez días**: `river_discharge` más `river_discharge_member01` a `member50`. Esto comprueba disponibilidad del ensemble para ese punto, no la precisión de la celda ni una probabilidad de inundación escolar. Se conserva la advertencia de verificar el cauce y el tramo; el punto Corrientes/Paso existente está aguas abajo de la confluencia con el Paraguay y no debe asignarse automáticamente al tramo superior.

[GloFAS documenta pronósticos probabilísticos con 51 miembros y horizonte de quince días](https://confluence.ecmwf.int/spaces/CEMS/pages/265028831/GloFAS%2BHydrological%2BProducts%2BOverview). La elección posterior del usuario prioriza INA. La muestra aportada por él, con celda `(-27.474998, -58.82499)` y caudales inferiores a 3 m³/s en la serie central, no es compatible con el cauce principal del Paraná. Corresponde a otra longitud que la consulta de Ituzaingó anterior; el curso/celda de esa muestra no quedó identificado. No se infiere de esto que todo GloFAS sea inexacto, pero estos datos no se usarán como pronóstico del Paraná sin validar identidad, magnitud y desempeño.

## Consumo de API y frecuencia

**Presupuesto de la ruta INA elegida:** para las dos corridas completas 499 y 289 son dos peticiones por actualización. Consultarlas cuatro veces al día supone ocho peticiones diarias / 240 en treinta días, reutilizadas para todas las escuelas. Observaciones, catálogo e historia agregan sus propias peticiones y caché. Esto no es una cuota oficial del INA ni garantiza una nueva emisión cada seis horas. La ventana de fechas debe construirse en cada corrida y se evita procesar de nuevo el mismo ID/fecha de emisión. El pronóstico fluvial INA no consume el cupo de Open-Meteo.

El presupuesto siguiente de Open-Meteo queda como antecedente técnico de una alternativa suspendida, no como propuesta activa:

El proveedor local consulta ocho puntos de río; `flood.ts` hace una petición por punto y la cadencia configurada es cada seis horas. Eso implica **32 peticiones HTTP diarias / 960 en treinta días**, sin reintentos, para el componente de caudal. No corresponde a todo el consumo Open-Meteo del sistema: radar, meteorología, ensemble meteorológico y climatologías tienen sus propios pedidos.

Los 51 miembros y diez días vienen en una petición por punto con `ensemble=true`; las escuelas reutilizan esos datos y sus probabilidades se calculan localmente. No se hace una llamada por miembro, escuela ni horizonte. Reemplazar la consulta actual por la de miembros completos mantiene el número de peticiones por actualización.

| Estrategia para los ocho puntos existentes | HTTP/día | HTTP/30 días |
|---|---:|---:|
| Cuatro actualizaciones diarias, como la cadencia actual | 32 | 960 |
| Una descarga diaria por punto, por nueva corrida GloFAS | 8 | 240 |

La segunda opción fue la recomendación inicial: [Open-Meteo documenta actualización diaria de GloFAS](https://open-meteo.com/en/docs/flood-api). Se conserva aquí para comparar consumos. El presupuesto contempla margen separado para reintentos y pruebas; una carga histórica inicial se presupuesta aparte.

**Peticiones HTTP y unidades de cupo son medidas distintas.** La [tarificación general](https://open-meteo.com/en/pricing) pondera ubicaciones, variables, modelos y duración. En el [controlador público actual](https://github.com/open-meteo/open-meteo/blob/main/Sources/App/Controllers/ForecastapiController.swift), el flag `ensemble` de Flood expande `river_discharge` a 51 miembros al leer los datos, pero no multiplica el número de variables usado para el peso; la [fórmula de peso](https://github.com/open-meteo/open-meteo/blob/main/Sources/App/Helper/Writer/ForecastApiResult.swift) da una unidad para una ubicación, una variable y diez días. **La estimación derivada de ese código es una unidad por punto/pedido**, pendiente de contrastar con la contabilidad efectiva del proveedor; no se midió el descuento de cupo de una cuenta. No extrapolarlo al endpoint meteorológico Ensemble, cuyo cálculo sí incluye miembros.

Para Google, [`queryGaugeForecasts` admite hasta 500 IDs juntos](https://developers.google.com/flood-forecasting/rest/v1/gauges/queryGaugeForecasts): los ocho puntos podrían consultarse en una petición de pronósticos por actualización, si tienen cobertura. Cuatro actualizaciones supondrían cuatro peticiones diarias de pronóstico; estados, polígonos y metadatos suman las suyas cuando se solicitan. La API es sin cargo, con [límite publicado de 200 solicitudes/minuto](https://support.google.com/flood-hub/answer/16364606?hl=en), previa habilitación.

## La altura de la escuela como variable central

La inundación física depende del nivel de agua futuro **en el sitio escolar**, de la elevación del terreno y del umbral de ingreso al edificio. La lectura de una estación INA no es directamente ese nivel local. Hay que trasladarla al sitio con una relación hidráulica apropiada y una referencia vertical compatible.

| Variable | Uso | Disponibilidad comprobada |
|---|---|---|
| Elevación del terreno en la parcela y alrededor del edificio | Determinar exposición y caminos por donde puede entrar agua. | Existe estimación Copernicus GLO-30 y márgenes derivados en las capas estáticas locales. |
| Cota del piso/umbral de ingreso | Distinguir patio/parcela inundados de agua dentro del edificio. | No se encontró relevamiento sistemático validado. No sustituirla silenciosamente por la elevación del píxel. |
| Nivel de agua previsto en el sitio escolar | Compararlo con terreno e ingreso para cada escenario futuro. | Requiere transferencia desde estación/tramo y control de remanso, pendiente y aportes. |
| Defensas y conexión hidráulica | Evitar inundar ficticiamente todas las zonas bajas o asumir que una barrera protege sin comprobarla. | Falta cobertura operativa sistemática; cada relación debe declarar su certeza. |
| Cotas y transitabilidad de pasos críticos | Estimar interrupción aunque el edificio quede seco. | Hay rutas/cruces OSM y exposición estática; faltan recorridos y umbrales operativos validados en muchos casos. |
| Referencia vertical y error | Comparar alturas compatibles y propagar incertidumbre. | Verificar datum, cero de escala, fuente, resolución, fecha y calidad por dato. |

En cada trayectoria: `margen = cota_del_umbral_de_ingreso − cota_del_agua_prevista_en_el_sitio`. Un margen negativo indica superación de ese umbral, siempre que el escenario incluya conexión hidráulica hasta el edificio. Propagar incertidumbre de ambas cotas y de las protecciones, además de duración y momento de la superación.

[Copernicus describe GLO-30 como modelo de superficie](https://documentation.dataspace.copernicus.eu/Data/Others/CCM.html), que puede incluir vegetación y construcciones. Su resolución espacial de treinta metros no es precisión vertical de treinta centímetros ni una medida del piso escolar. La estimación satelital permite comenzar; no debe producir un veto de riesgo por diferencias pequeñas frente a su error. El cálculo local `margen_inundacion.py` es una aproximación estática que combina terreno, agua permanente y escenarios JRC, no una cota de agua futura INA.

### Alternativas de elevación comprobadas el 17/10

La [validación independiente de precisión](validacion-precision-altimetria-2026-10-17.md) comparó ambos DEM en los 2.001 registros con coordenadas, aplicando el mismo p10 a 50 m y una armonización vertical aproximada. Las discrepancias persisten y no permiten identificar qué fuente está más cerca del suelo escolar. No reemplazar automáticamente Copernicus por IGN ni convertir la discrepancia entre modelos en una distribución de error calibrada.

**La comprobación provincial amplía esta prueba inicial:** 61 hojas IGN 30 m descargadas y leídas, con un valor válido para cada uno de los 2.001 puntos geocodificados; MDT 5 m catalogado en 83 y MDT 0,5 m en otros 39. Los archivos de detalle siguen pendientes de solicitud. Ver [viabilidad provincial y controles de ubicación](viabilidad-altimetria-provincial-2026-10-17.md). La tabla de localidades siguiente describe sólo el piloto.

La [evaluación de viabilidad y evidencia de descarga](viabilidad-altimetria-parana-2026-10-17.md) distingue acceso al archivo de exactitud local. Se descargaron las ocho planchetas IGN MDE-Ar 30 m necesarias para el piloto (48,5 MB comprimidos) y se leyeron valores válidos en los 84 registros geocodificados. El MDT 5 m sigue pendiente de entrega institucional; no se incorporó ninguna de estas fuentes al motor.

GLO-30 no es la única fuente disponible ni se comprobó que sea la más precisa en estas escuelas. El [IGN publica MDE-Ar v2.1 de treinta metros](https://www.ign.gob.ar/NuestrasActividades/Geodesia/ModeloDigitalElevaciones/Introduccion) con cobertura continental nacional, referencia SRVN16 y precisión vertical aproximada de dos metros. También describe MDE/MDT aerofotogramétricos de cinco metros con precisión vertical submétrica. Son especificaciones generales; no sustituyen la validación local ni acreditan la cota del piso.

Se consultó el WFS del [visor oficial del IGN](https://www.ign.gob.ar/NuestrasActividades/Geodesia/ModeloDigitalElevaciones/Mapa), capas `modelos-digitales-elevaciones:mdt_5m` y `mde_5m`, sobre el rectángulo `[-59.2,-28.0,-56.2,-27.0]` en EPSG:4326. El catálogo devolvió 46 polígonos MDT y 60 MDE. El cruce punto-en-polígono con las 84 escuelas activas geocodificadas del corredor arrojó:

| Localidad | CUE dentro de cobertura catalogada MDT 5 m |
|---|---:|
| Ituzaingó | 25 |
| Itá Ibaté | 14 |
| Itatí | 11 |
| Ramada Paso | 3 |
| Apipé Grande | 2 |
| Paso de la Patria y Ensenadita | 0 |
| **Total** | **55 de 84** |

Los proyectos MDT corresponden a `0044 - 2017 - COMIP`, sectores 1–3. La fecha exige revisar cambios posteriores de terreno/obras. Esto confirma cobertura del **catálogo**, no valores de píxeles válidos ni un raster descargado. Los enlaces de descarga de muestra para MDT y MDE redirigieron a las [instrucciones de solicitud del IGN](https://www.ign.gob.ar/NuestrasActividades/Geodesia/ModeloDigitalElevaciones/faq): los archivos de detalle requieren gestionar acceso con el organismo. No se envió una solicitud.

Como alternativa de cobertura amplia, [FABDEM v1.2 de la Universidad de Bristol](https://research-information.bris.ac.uk/en/datasets/fabdem-v1-2/) corrige sesgos de edificios y árboles de Copernicus a aproximadamente treinta metros. Es un candidato a representar mejor el terreno, no una mejora local ya medida ni una fuente independiente de GLO-30. Comparar productos en la misma referencia vertical contra puntos de control antes de elegir; no promediar modelos indiscriminadamente ni confundir mayor resolución con menor error vertical.

## Cálculo que proponemos

1. **Pronosticar cada tramo con INA.** Conservar corrida, serie, estación, variable, unidad, emisión, descarga, intervalo, soporte temporal y `qualifier`. Separar observaciones PNA distribuidas por INA y pronóstico INA, sin contarlas como fuentes independientes. Donde el producto sólo aporte cuantiles semanales, conservar ese significado y construir/evaluar un modelo local de trayectorias si se requieren probabilidades diarias. Las trayectorias futuras dependen del río y sus aportes, no de partes escolares.
2. **Corregir el error local por plazo.** Contrastar pronósticos históricos con nivel/caudal observado. Una relación caudal–nivel debe ser específica del tramo; remanso y operación de presas pueden impedir una relación unívoca. No convertir m³/s a metros mediante una regla genérica ni comparar escala PNA y DEM sin datum compatible. Si falta esa relación, publicar la excedencia del umbral de caudal como producto hidrológico y marcar pendiente la transformación escolar.
3. **Propagar escenarios al territorio.** Para cada trayectoria, estimar extensión/profundidad de inundación mediante relaciones hidráulicas o mapas vinculados a niveles/caudales, incluyendo incertidumbre de terreno, coordenadas, defensas y cotas de piso. Las capas RP10/100/500 aportan escenarios de exposición; su período de retorno no es la probabilidad de inundarse en los próximos diez días.
4. **Evaluar edificio y accesos dentro del mismo escenario.** Agua sobre el terreno del punto escolar no prueba agua dentro del edificio: hace falta umbral de ingreso/cota de piso o modelar su incertidumbre. Para accesos, comprobar pasos críticos, recorridos/orígenes y alternativas utilizables. Compartir el escenario hidrológico preserva la dependencia entre edificio y caminos.
5. **Calcular probabilidades y calibrar.** Usar cuantiles de INA para el evento y soporte temporal que realmente describen. Cuando exista un modelo de trayectorias completo, la fracción que supera un umbral da una probabilidad modelada. Evaluar/corregir calibración contra observaciones históricas; no convertir tres valores o escenarios sin probabilidad asignada en tres miembros equiprobables.

Para un evento dentro de una ventana, se evalúa el máximo de cada trayectoria en esa ventana. Por ejemplo:

```text
p_agua_edificio(h) = fracción ponderada de escenarios en los que
                    entra agua al edificio al menos una vez entre t y t+h

p_acceso_interrumpido(h) = fracción ponderada de escenarios en los que
                          un grupo escolar pierde un acceso necesario
                          sin alternativa utilizable durante esa ventana
```

La probabilidad de interrupción educativa combina consecuencias del edificio y de accesos con calendario, grupos afectados y condiciones operativas. No equivale automáticamente a la probabilidad física de corte de una ruta. No sumar probabilidades de edificio y acceso; no multiplicar complementos diarios suponiendo independencia. Conservar las trayectorias y evaluar la unión de eventos dentro de ellas.

Google y GloFAS pueden compartir forzantes meteorológicos: no son votos independientes. La comparación/mezcla necesita evaluación local. Para días 8–10 se usa un predictor que realmente llegue a esos plazos, sin copiar el porcentaje del día 7.

## Entregas que cambian el plan

| Entrega | Resultado verificable |
|---|---|
| B0/B1: archivo y contrato probabilístico INA | Corridas/series/qualifiers preservados, soporte temporal comprobado y separación entre observación y predicción. |
| B3 primero: pronósticos INA y ajuste por tramo | Cuantiles del producto nativo y probabilidades por 24 h, 72 h y diez días sólo donde la resolución y el modelo permitan ese evento; independientes de partes escolares. |
| B3: transferencia a edificio | Probabilidad física/modelada con incertidumbre explícita; validación escolar identificada como comprobada o pendiente. |
| B5: accesos y continuidad | Probabilidad del segundo evento, utilizando el mismo escenario de crecida. |
| Google como alternativa futura | Matriz real de cobertura, calidad y comparación por plazo frente al predictor basado en INA, una vez obtenido acceso. |
| Validación continua | Brier y diagramas de calibración para excedencias; CRPS para distribuciones; anticipación, precisión y sensibilidad por episodio. |

La coherencia de partes y atención actual puede continuar como B2 en paralelo; no es dependencia del pronóstico fluvial. El relevamiento escolar mejora y valida la transformación a impacto, pero no es condición para comenzar el predictor hidrológico probabilístico.
