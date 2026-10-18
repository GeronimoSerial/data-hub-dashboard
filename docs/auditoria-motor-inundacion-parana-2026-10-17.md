# Auditoría operativa: inundación escolar en el Paraná superior

Corte: 17 de octubre de 2026, 22:52 UTC (19:52 ART). Consultas de solo lectura a la base productiva y comprobación de fuentes oficiales públicas. Esta auditoría actualiza el estado observado, sin modificar el motor ni afirmar que una escuela concreta esté inundada.

## Decisión que permite tomar esta auditoría

La salida actual sirve como **prioridad ordinal preliminar**, pero no como porcentaje de probabilidad de agua dentro del edificio ni de interrupción educativa. El objetivo aclarado por el usuario es producir esas dos probabilidades antes del impacto, principalmente por crecidas de ríos, sin depender de reportes escolares. La falta de resultados escolares fechados limita la calibración y la precisión que podemos demostrar a nivel CUE; no impide comenzar el pronóstico probabilístico hidrológico ni estimar impacto mediante un modelo físico con incertidumbre declarada.

La primera mejora debe preservar la información probabilística del río, corregir su semántica temporal y transferirla al edificio y a sus accesos. **El usuario eligió INA como fuente por ahora.** La [propuesta de pronóstico probabilístico fluvial](pronostico-probabilistico-fluvial-escuelas.md) documenta consultas A5 con `main/p10/p90` semanales y su cobertura. El experimento de 51 trayectorias Open-Meteo queda como prueba de disponibilidad, sin acreditación de precisión y fuera de la ruta propuesta.

## Qué está ocurriendo en producción

La última corrida consultada fue `motor-v0.3`, iniciada el 17/10 a las 20:15 UTC y publicada a las 20:17 UTC. Publicó 2.001 escuelas × 3 horizontes. El campo de cobertura declara 6.003 resultados con evidencia, pero eso significa que el cálculo obtuvo entradas según sus reglas; **no** que exista una verificación escolar de inundación. En esta base hay 0 `infra_parte`, 0 `infra_afectacion` y 0 `infra_verificacion`.

| Comprobación sobre la corrida vigente | Resultado | Implicación |
|---|---:|---|
| Escuelas cuyo puntaje de riesgo cambia entre 24, 72 y 240 h | 0 de 2.001 | Hoy el horizonte de 10 días no añade discriminación al resultado escolar. |
| Escuelas cuyo puntaje de acceso cambia entre esos horizontes | 0 de 2.001 | La interrupción potencial tampoco evoluciona con el plazo. |
| Escuelas con amenaza positiva / riesgo ≥ 50 / riesgo = 0, por horizonte | 162 / 28 / 1.839 | La señal se concentra en pocos valores; no representa una probabilidad calibrada. |
| Factor de peligro por celda | 0 en las 2.001 escuelas de cada horizonte | La lluvia prevista no diferencia escuelas en esta corrida, aunque haya pronósticos almacenados. |
| Factor de lluvia observada | presente en 461, valor 0 en todas | No aporta discriminación en este corte. |
| Factor de historial / susceptibilidad | 0 / 100 en las 2.001 | La vulnerabilidad tampoco discrimina; es necesario auditar unidades y significado del 100. |
| Factor de altura PNA | 164 registros, 162 con valor | Es el principal factor positivo efectivo de esta corrida. |

En los jobs más recientes, `calcular-hazard-climatologia-caudal` falló para los ocho puntos por `cupo_agotado`; `sync-radar-ensemble` también falló por cupo. La ingesta `sync-hazard-ensemble` terminó con 720 filas, pero la salud de `open-meteo-ensemble` figura `degradado`. IMERG y PNA sí tenían ingestas recientes. La tabla de pronósticos contiene valores ECMWF hasta el 26/10, y caudal de Open-Meteo Flood hasta el 26/10, pero disponer de filas futuras no demuestra que el motor las esté usando de manera correcta.

### Corredor piloto definido con el usuario

Se cruzó el padrón local activo `localizaciones-geo-2025-10-02.json` con los CUE de la corrida vigente. El corredor inicial incluye Ituzaingó, Apipé Grande, Itá Ibaté, Itatí, Ramada Paso, Paso de la Patria y Ensenadita; no agota todos los sitios afectados por la crecida.

| Localidad | CUE activos | En corrida | Bajo | Alto | Con factor PNA |
|---|---:|---:|---:|---:|---:|
| Ituzaingó | 28 | 27 | 20 | 7 | 7 |
| Apipé Grande | 2 | 2 | 0 | 2 | 2 |
| Itá Ibaté | 16 | 16 | 16 | 0 | 0 |
| Itatí | 12 | 11 | 10 | 1 | 1 |
| Ramada Paso | 5 | 4 | 4 | 0 | 0 |
| Paso de la Patria | 18 | 18 | 5 | 13 | 13 |
| Ensenadita | 6 | 6 | 5 | 1 | 1 |
| **Total** | **87** | **84** | **60** | **24** | **24** |

Las tres escuelas activas ausentes de la corrida necesitan una salida explícita de `sin_evaluar` o `georreferencia_pendiente`, no desaparecer del universo. En Itatí, Paso de la Patria e Ituzaingó hay 35 escuelas clasificadas bajo y 21 alto. La cota de evacuación en una estación **no prueba** que los edificios de las 35 estén anegados; sí justifica vigilancia de todo el ámbito y una revisión priorizada de exposición y acceso.

### Lecturas hidrométricas guardadas al corte

| Estación PNA | Última lectura en producción | Alerta / evacuación | Estado frente a umbral |
|---|---:|---:|---|
| Ituzaingó | 4,90 m, 17/10 21:00 UTC | 3,50 / 4,00 m | Sobre evacuación |
| Itá Ibaté | 6,82 m, 17/10 15:00 UTC | 7,00 / 7,50 m | Bajo alerta |
| Itatí | 7,82 m, 17/10 21:00 UTC | 6,80 / 7,50 m | Sobre evacuación |
| Paso de la Patria | 7,12 m, 17/10 17:00 UTC | 6,50 / 7,00 m | Sobre evacuación |

Estas cifras provienen de la ingesta de PNA en producción. [INA publica las series y pronósticos hidrológicos mediante su API](https://alerta.ina.gob.ar/pub/gui/apibase), pero cuando reproduce la misma medición de Prefectura no constituye una segunda observación independiente. El [reporte diario del INA del 16/10](https://alerta.ina.gob.ar/a5/diario/reporte_diario) confirma la crecida, niveles sobre umbrales en el tramo y perspectiva de ascenso de 7 a 10 días aguas abajo. El [alerta de Yacyretá del 16/10](https://www.eby.gov.py/alerta-hidrologico-n07-octubre/) aporta caudal afluente y una previsión de Ituzaingó solamente hasta el 19/10; declara que no anticipa la evolución posterior.

## Fuentes adicionales comprobadas hoy

| Fuente | Qué aporta | Límite de uso |
|---|---|---|
| [INA: API y reporte diario](https://alerta.ina.gob.ar/pub/gui/apibase) | Series de nivel observadas y series de pronóstico para estaciones del tramo; contexto y perspectiva oficial. | Hay que identificar emisión, validez, escala y significado de cada serie. Las series semanales de Itatí/Paso no son porcentajes de inundación escolar. |
| [Entidad Binacional Yacyretá](https://www.eby.gov.py/alerta-hidrologico-n07-octubre/) | Afluencia/efluencia y pronóstico operativo aguas abajo de la presa. | Cobertura temporal corta y revisión frecuente; no extrapolar linealmente a 10 días. |
| [Copernicus Global Flood Monitoring, catálogo STAC](https://extwiki.eodc.eu/GFM/PUM/DataAccess/STAC) | La consulta del 17/10 devolvió 11 escenas para el corredor desde el 10/10; la más reciente es del 15/10 a las 22:47 UTC. Potencial evidencia de extensión observada. | Sólo se comprobó huella y disponibilidad, **no píxeles inundados en escuelas**. Producto satelital con exclusiones e incertidumbre; no es observación del 17/10 ni pronóstico de 10 días. |
| [NASA IMERG](https://gis.earthdata.nasa.gov/portal/home/item.html?id=598df0e6fd674ab7855f448f7f6f0e39) | Lluvia antecedente y cobertura pluvial, ya ingerida por el sistema. | Resolución de kilómetros; no determina agua dentro de un edificio. |
| [Copernicus GloFAS](https://confluence.ecmwf.int/spaces/CEMS/pages/265028831/GloFAS%2BHydrological%2BProducts%2BOverview) | Pronóstico hidrológico de caudal para el plazo de 10 días; el sistema ya guarda una vía de Open-Meteo Flood. | Caudal no es altura local ni profundidad escolar. Corregir asociación de punto y contrastar contra estación/operación de presa. |

También se encontraron estaciones pluviométricas de INTA en el catálogo INA para Apipé, Itá Ibaté, Ramada Paso e Ituzaingó, pero las consultas de datos de los intervalos probados no devolvieron lecturas; **no se las debe presentar como una alimentación operativa confirmada**.

## Cambios recomendados en orden

1. **Contrato de datos y tiempo.** Guardar `emitido_en`, `observado_en`, `ingerido_en`, `valido_desde/hasta`, unidad y duración de ventana. Impedir seleccionar pronósticos futuros en un replay. Corregir la comparación entre una hora de lluvia y umbrales diarios/acumulados. Mostrar por qué un horizonte carece de señal propia y fallos de cupo.
2. **Salida fluvial en dos niveles.** Cuando una estación supera alerta/evacuación, activar vigilancia del tramo aprobado para todos sus CUE, incluso los de clase estática `sin_riesgo`. Graduar prioridad individual con exposición del edificio, cotas/geometría compatibles, accesos y evidencia reportada. La vigilancia territorial no afirma que todos los edificios tengan agua.
3. **Dos objetivos escolares explícitos.** `agua_en_edificio` y `interrupcion_educativa`, esta última incluyendo imposibilidad de llegada de alumnos o docentes. Calcular peligro, exposición, impacto y calidad de evidencia por mecanismo; no mezclar lluvia baja con crecida fluvial ni usar el mismo número para ambos eventos.
4. **Evolución 24 h / 72 h / 10 días.** Incorporar trayectoria de nivel/caudal, tendencia y tiempo de traslado, con pronóstico específico y calibración por estación. Marcar incertidumbre creciente con el plazo. El pronóstico oficial de EBY cubre sólo su ventana publicada; para 10 días usar la perspectiva/series hidrológicas y verificar su desempeño histórico.
5. **Acceso de la comunidad.** Evaluar corredores de barrios/parajes de origen, cruces y alternativas reales; el camino del edificio a la cabecera no representa todos los viajes. Una zona de origen y cantidad agregada basta para empezar, sin domicilios personales.
6. **Validación de probabilidades.** Contrastar primero distribuciones/excedencias hidrológicas con estaciones y extensión con satélite. Registrar por CUE y fecha ambos resultados, incluidos `no` comprobados, fuente y hora de conocimiento, cuando estén disponibles. Distinguir probabilidades físicas/modeladas de probabilidades con calibración escolar comprobada. El conjunto territorial disponible sirve para evaluar hidrología, no demuestra precisión de impacto escolar; la ausencia de partes no bloquea el predictor.

La evaluación en sombra debe comparar versión vigente y candidata con información disponible a cada corte: cobertura, anticipación, falsos avisos y casos omitidos por episodio y localidad. La capacidad diaria de verificación definirá el umbral operativo de la cola. Los cambios se corresponden con B0–B5 y B7 del [plan de implementación](plan-implementacion-motor-riesgo-escolar.md); B8 debe depender de errores residuales medidos.
