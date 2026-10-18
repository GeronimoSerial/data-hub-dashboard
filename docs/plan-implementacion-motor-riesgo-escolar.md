# Plan de implementación por batches del motor de riesgo escolar

**Fecha:** 14 de octubre de 2026.  
**Base revisada:** rama `GeronimoSerial/tramos-referencia`, commit `078ded438fab6987a3235cf3dd277335b76f19ea`, archivos y artefactos locales actuales.  
**Estado:** propuesta de implementación. Este documento no modifica el motor ni constituye una calibración validada.

**Alcance provincial comprobado el 17/10:** el padrón geográfico tiene 2.005 registros, 2.001 con coordenadas. La [evaluación altimétrica provincial](viabilidad-altimetria-provincial-2026-10-17.md) descargó 61 hojas IGN 30 m y leyó valores válidos en esos 2.001 puntos. Los 84 registros de la prueba del corredor no representan el universo completo. El MDT de detalle sólo tiene cobertura catalogada en 122 puntos y requiere solicitud.

## 1. Resultado que buscamos

Mejorar la detección, la anticipación y la selección de escuelas que necesitan atención, con un motor que pueda explicarse, probarse y corregirse por partes. La simplicidad es un medio para evitar errores silenciosos; no justifica perder precisión.

La prioridad acordada el 17/10 es un núcleo reproducible de **pronóstico probabilístico fluvial**, con dos objetivos separados: agua dentro del edificio e interrupción educativa, incluida imposibilidad de llegada. Usa distribuciones futuras del río y su transferencia a edificio/accesos, sin esperar partes de inundación. **El usuario eligió INA como fuente por ahora.** La [especificación probabilística](pronostico-probabilistico-fluvial-escuelas.md) documenta respuestas A5 con `main/p10/p90`, sus límites semanales y el consumo de consultas. Open-Meteo Flood queda fuera del predictor propuesto; Google es una alternativa futura. El módulo pluvial permanece como mecanismo adicional. Los partes y verificaciones representan situación actual y aportan validación posterior.

Al terminar el núcleo:

- Una escuela evacuada aparece como evacuada y priorizada aunque falten coordenadas, OSM o pronóstico.
- Una crecida relevante llega a todas las escuelas del tramo/localidad asignados; la evidencia territorial distingue cuáles requieren mayor atención. La ausencia de una celda positiva no las descarta.
- Un edificio sin agua puede tener alumnos aislados o clases interrumpidas. Esos impactos siguen visibles por separado.
- Cada horizonte usa su propia ventana; un dato ausente, vencido o inválido nunca se presenta como seguridad.
- Un cambio se incorpora cuando demuestra mejor detección, anticipación o discriminación, con una carga de falsas alarmas aceptable. Aumentar el número de escuelas rojas no demuestra mejora.

### Qué se reutiliza y qué se agrega

| Reutilizar | Agregar o corregir |
|---|---|
| Partes, afectaciones, alcance, movimientos, cierres, verificaciones e idempotencia | Lectura coherente de la situación actual y su antigüedad |
| Ingestas meteorológicas, IMERG, PNA, SMN y capas geográficas | Contratos de unidades, ventanas, cobertura, pertinencia y disponibilidad temporal |
| Motor puro, puertos, jobs, snapshots, factores y publicación transaccional | Evaluadores por mecanismo y corrida candidata realmente aislada |
| Radar, ficha, Centro de Situación, cortes y briefing | Un contrato compartido y una única proyección de prioridades |
| Tests, fixtures y verificación meteorológica existentes | Evaluación escolar por eventos, sin fuga temporal y con negativos verificados |

No hace falta crear ahora una plataforma de incidentes, un gestor genérico de tareas, otro sistema de permisos, un grafo general de servicios ni una nueva entidad universal de evidencia. Las relaciones causales explícitas y la verificación ya tienen soporte parcial útil. Las ampliamos únicamente cuando un caso concreto lo exige.

### Recorrido de implementación

| Batch | Entrega principal | Dependencia | Aporte esperado |
|---|---|---|---|
| B0 | Línea de base reproducible y corpus de evaluación | — | Saber qué falla y medir mejoras reales |
| B1 | Contrato común, integridad de datos y aislamiento de candidatos | B0 | Eliminar errores de unidades, tiempo y publicación |
| B2 | Situación reportada y prioridad coherentes en todos los consumidores | B1 | Evitar que una afectación conocida desaparezca |
| B3 | Pronósticos y observaciones INA: preservar qualifiers, resolver soporte temporal, modelar trayectorias por tramo y transferir a edificio | B0–B1 | Anticipar excedencias e impacto con incertidumbre explícita, sin depender de partes |
| B4 | Evaluación pluvial con ventanas correctas, ensemble e IMERG | B1–B2 | Mejorar anticipación y distinguir intensidad, acumulación e incertidumbre |
| B5 | Probabilidad de interrupción por crecida en accesos y comunidad | B1–B3; B4 para mecanismo pluvial | Anticipar interrupción aunque el edificio no se inunde |
| B6 | Refinamientos medidos de historial, terreno y alternativas | B3–B5 | Ganar discriminación con las variables existentes |
| B7 | Evaluación conjunta, promoción y retiro de caminos antiguos | B2–B5; B6 sólo si mejora | Operar una versión consistente, auditable y reversible |
| B8 | Extensiones seleccionadas por errores residuales | B7 | Añadir precisión donde el núcleo todavía no alcanza |

B3 se prioriza después de B0–B1; B2 puede avanzar en paralelo y no condiciona la emisión del pronóstico. B5 integra la hidrología y los accesos dentro de los mismos escenarios. B4 amplía después la cobertura pluvial. La validación comienza en B0 y acompaña cada entrega; B7 reúne la evidencia, no inaugura las pruebas.

## 2. Base real y límites del diagnóstico

La sesión anterior terminó en una propuesta de simplificación que mantiene la precisión como prioridad. Este plan convierte esa propuesta en cambios sobre el sistema existente.

El código local declara **`motor-v0.2`** y **`acceso-v1`**. Los tramos de Prefectura están aprobados y versionados, pero su archivo indica que todavía no los consume el motor local. La revisión original de este plan no consultó producción. La [auditoría del 17/10/2026](auditoria-motor-inundacion-parana-2026-10-17.md) verificó una corrida productiva `motor-v0.3` y sus resultados prevalecen para describir lo desplegado; las observaciones sobre `motor-v0.2` siguen siendo diagnósticos del checkout local.

La auditoría previa de esta misma propuesta ejecutó 85 tests existentes y tres pruebas diagnósticas temporales, posteriormente retiradas. Estas últimas reprodujeron selección de una corrida futura, comparación de un valor horario con umbrales acumulados y reutilización de un pronóstico vencido. Son pruebas de inconsistencias específicas; no validan la precisión del modelo.

Documentos de referencia:

- [Propuesta de revisión integral](propuesta-mejora-modelo-riesgo-escolar.md).
- [Documento maestro v2 aportado por el usuario](../.orca/drops/riesgo-escolar-corrientes-documento-maestro-v2.md).

La implementación acota la expansión institucional del documento maestro y conserva sus distinciones útiles: observación frente a predicción, gravedad frente a incertidumbre, edificio frente a continuidad educativa y tiempo del hecho frente a tiempo de conocimiento.

### Qué muestran los archivos geográficos disponibles

Estos números se calcularon leyendo los artefactos de `services/geo-static/output`; **no describen necesariamente las tablas importadas ni la situación actual de producción**. Todos los archivos comparados contienen 2.001 filas por CUE-anexo.

| Archivo o cruce local | Resultado | Consecuencia para la implementación |
|---|---|---|
| `susceptibilidad_estatica-v1-2026.csv` | Fluvial informado en 2.001 filas, positivo en 67; pluvial y viento vacíos en todas | Un cero o un vacío en esta capa no puede ser el requisito universal de entrada |
| Mismo archivo, calor | 2.001 valores entre 192,48 y 335,47 | No son una escala normalizada 0–1; validar la métrica del productor antes de transformarla |
| `inundacion_v2-v1-2026-10-08.csv` | 43 `alto`, 61 `medio`, 50 `bajo`, 1.847 `sin_riesgo` | Las clases son exposición histórica modelada, no estado actual de la escuela |
| Clase de río positiva en v2 con Aqueduct igual a cero | 130 escuelas | Usar Aqueduct como filtro excluyente pierde señales disponibles en otra capa |
| `aislamiento_osm-v4-2026-10-08.csv` | 1.188 nivel 0; 455 nivel 1; 89 nivel 2; 257 nivel 3; 12 sin cálculo | El índice resume conectividad; no determina si una ruta se inunda |
| `exposicion_ruta_inundacion-v2-2026-10-08.ndjson.gz` | 516 `alto`, 85 `medio`, 62 `bajo`, 1.326 `sin_riesgo`, 12 `sin_ruta` | Ya existe una capa de ruta aprovechable; sus clases necesitan controles de calidad |
| Ruta con clase positiva e índice OSM 0 | 317 escuelas | Conectividad y exposición a inundación miden propiedades diferentes |

Los cuatro casos iniciales también muestran por qué hay que separar fuentes:

| CUE-anexo | Aqueduct local | Clase río v2 | Clase ruta v2 | Índice OSM |
|---|---:|---|---|---|
| 1800402-00 — Esc. 93 | 0 | `sin_riesgo` | `sin_riesgo` | 0 |
| 1800862-00 — Esc. 874 | 0 | `sin_riesgo` | `sin_riesgo` | 1 |
| 1800646-00 — Esc. 532 | 0 | `sin_riesgo` | `sin_riesgo` | 1 |
| 1801532-00 — Esc. 377 | 2,461… | `medio` | `sin_ruta` | sin cálculo |

Estas capas no contradicen por sí mismas los reportes de campo: pueden representar otra resolución, trayecto o mecanismo. Esc. 377, además, tiene datos locales distintos de lo descrito en el diagnóstico histórico. B0 debe fijar versiones y tiempos antes de comparar resultados.

## 3. Inventario de variables y destino propuesto

El inventario cubre las variables que pueden alterar riesgo, continuidad, prioridad, cobertura, confianza o reproducibilidad. Agrupa identificadores y metadatos técnicos cuando tienen el mismo tratamiento; no convierte credenciales, datos nominales o campos de presentación en predictores.

### 3.1. Identidad, territorio y población expuesta

| Variables existentes | Uso o limitación actual | Cambio y batch |
|---|---|---|
| `cueAnexo`, padrón y período vigente | Unidad institucional; el job parte de perfiles geográficos elegibles | Construir universo desde el padrón aplicable y unir situación y predictores por izquierda. Una escuela sin perfil continúa visible. B0–B2 |
| `lat`, `lon`, `geoCalidad`, `motivoExclusion` | Un perfil ausente/excluido puede impedir todo el cálculo | Limitar sólo los mecanismos que requieren esa geometría; conservar parte, servicio y verificación. Registrar coordenadas dudosas. B1–B2 |
| `departamento`, localidad del padrón | Agrupación y asignaciones territoriales | Normalizar alias y resolver localidades con departamento cuando haya ambigüedad. No confundir localidad, departamento y cuenca. B3 |
| `geometryRef`, `perfilVersion`, `calculadoEn` | Asociación con celdas y versión de perfil | Conservar geometría/versiones usadas por corrida. No asumir que las grillas de radar, ensemble e IMERG son intercambiables. B1 |
| `infraGeoRio.puntoRioId`, `distanciaKm`, `radioMaximoKm`, `version` | Existe asociación persistida; el adapter vuelve a calcular proximidad | Una resolución compartida; distinguir punto GloFAS de estación PNA. Distancia no prueba conexión hidrológica. B3 |
| Matrícula, secciones, `corteId` de GE | Exposición separada; adapter histórico usa corte vigente, ignora `asOf` | Usar para alcance y desempates operativos, no para reducir peligro en escuelas pequeñas. Congelar corte en evaluación; declarar cuando no existe población histórica. B0–B2 |
| Escuela sin secciones en el corte | Puede devolver matrícula 0 | Distinguir cero comprobado de ausencia/incompatibilidad de padrón. No eliminar prioridad. B2 |
| Coordenadas compartidas por varios CUE | No existe una identidad física validada de sede en este circuito | Contar instituciones como instituciones; no deduplicar edificios por proximidad ni propagar partes automáticamente. Relación física curada sólo si un caso lo requiere. B8 |

### 3.2. Situación reportada, alcance y verificación

| Variables existentes | Significado y riesgo de interpretación | Tratamiento propuesto |
|---|---|---|
| `infraParte.periodoId`, `cueAnexo`, `corteId` | Un parte por escuela/período | Reutilizar identidad; no abrir otro registro de incidente. B2 |
| `estadoEstablecimiento`: habitual, parcial, evacuado, centro_evacuados | Estado reportado del establecimiento | `evacuado` genera atención actual aunque el pronóstico sea bajo; no demuestra inundación consumada. `centro_evacuados` indica uso como refugio, no daño físico automático. B2 |
| `estadoEstablecimientoRigeDesde`, `creadaEn`, `actualizadaEn` | Vigencia y registro no son lo mismo | Reconstrucción a fecha de corte; no tomar cualquier edición como reconfirmación de todos los problemas. B1–B2 |
| `asistenciaPedagogica`: virtual/cuadernillo | Medida de continuidad | Puede mitigar interrupción educativa; no reduce altura del río, riesgo del edificio ni aislamiento físico. B2 |
| `infraAfectacion.motivo`, `categoria`, `severidad` | Motivo histórico guardado como texto; severidad sugerida no equivale a evaluación independiente | Mapear semántica mediante catálogo versionado; preservar texto histórico. Evitar lógica por coincidencias libres de palabras. B2 |
| `descripcion`, justificación crítica y detalle | Contexto libre; algunas afirmaciones describen amenaza, otras daño real | Mostrar y permitir revisión; no elevar automáticamente riesgo con extracción por IA. B2 |
| `rigeDesde`, `retiradaEn`, `cierre` | Activa, solucionada o retirada; retirada no siempre significa recuperación | Separar hecho vigente, resolución y corrección. No llamar solucionado a un reporte retirado por error. B2 |
| `causadaPorId` | Relación causal ya disponible | Explicar cadenas explícitas y evitar contar causa y consecuencia como evidencias independientes. No inferir causalidad por coincidencia temporal. B2 |
| Afectaciones por sección y alumnos | Una sección sin alumnos individuales puede representar toda la sección | Reutilizar reglas de alcance; contar personas distintas sin duplicar por varias afectaciones. Ausencia de detalle no significa cero afectados. B2 |
| `infraServicioAlcance`: establecimiento/turno/sección, referencia, normal/suspendido, fechas | **Servicio educativo**, no estado de suministro de agua o energía | Reutilizar `calcularEstadoServicioGeneral`, su precedencia y desempates. No crear un segundo cálculo de suspensión. B2 |
| `infraMovimiento`: tipo, rol, resumen, `rigeDesde`, `creadaEn`, `idempotencyKey` | Historial de cambios y confirmaciones | Base para conocimiento temporal, deduplicación y confirmación explícita. Auditar qué cambios pueden reconstruirse realmente. B0–B2 |
| Verificación pendiente/respondida/cancelada y `vencimientoEn` | Plazo de respuesta a una solicitud | El vencimiento pide seguimiento; no declara segura a la escuela ni cierra la afectación. B2 |
| Resultado sin_afectacion/con_afectacion/no_disponible, discrepancia | Evidencia a un instante y con un alcance | Conservar discrepancia cuando contradice un parte abierto. Sin afectación actual no cancela una predicción futura. B2 |
| `respondidaEn`, canal, actor, vínculo con movimiento y eventos | Procedencia y trazabilidad | Referenciar en explicación; un reporte autenticado sigue siendo reportado, no necesariamente inspeccionado en terreno. B2 |
| Tokens, expiración, revocación y consumo | Seguridad del acceso a verificación | Mantener controles existentes; no confundir expiración de credencial con vigencia del hecho. B2 |
| Umbral de 72 h sin actualizar | Seguimiento operativo existente | Reutilizar como punto inicial de reconfirmación, no como borrado automático; parametrizar por tipo sólo si aporta utilidad. B2 |

#### Mapeo inicial del catálogo de motivos

| Motivo actual | Interpretación mínima segura | Lo que no permite concluir |
|---|---|---|
| Inundación | Afectación reportada del establecimiento | Origen fluvial frente a pluvial sin evidencia adicional |
| Tormenta severa | Impacto reportado asociado a tormenta | Daño específico por viento, granizo o descarga eléctrica |
| Sin energía o agua | Problema reportado de suministro | Qué servicio falta ni su causa; no separar retrospectivamente por adivinación |
| Evacuación preventiva | Medida preventiva y alteración operativa | Edificio ya inundado |
| Inaccesibilidad de docentes | Problema actual de llegada de docentes | Ruta concreta o totalidad de alumnos aislados |
| Anegamiento, categoría alumnos | Afectación de alumnos/comunidad | Agua en el edificio escolar |
| Acceso interrumpido, categoría alumnos | Interrupción de movilidad en el alcance reportado | Que sea la ruta a la cabecera modelada por OSM |
| Otro problema en establecimiento / Otro problema de acceso | Evidencia vigente con clasificación incompleta | Mecanismo específico deducido sólo del nombre |

El catálogo ya tiene IDs; las afectaciones guardan nombres. B2 debe guardar ID/semántica estable para nuevas escrituras y mantener un mapeo explícito para las antiguas. Renombrar o eliminar un motivo administrativo no debe reescribir la interpretación de un reporte anterior. Los no reconocidos conservan su severidad y alcance como situación reportada, con mecanismo desconocido.

### 3.3. Pronóstico meteorológico, ventanas y climatología

| Variables existentes | Uso/limitación actual | Cambio y batch |
|---|---|---|
| `hazardForecast`: provider, variable, geometría, valor, unidad | Serie común a fuentes con resoluciones distintas | Validación por variable: magnitud, unidad, soporte espacial y temporal; datos inválidos quedan explícitos. B1 |
| `corridaEn`, `validoEn`, `horizonteHoras`, `pasoHoras`, `ingeridoEn`, `rawRef` | Hora de consulta puede ocupar el lugar de emisión; caudal usa paso 24 con conversión de tipo | Separar emisión conocida de consulta; aceptar paso diario en contrato; conservar referencia verificable a entrada. `rawRef` no garantiza que el bruto esté guardado. B1 |
| Precipitación ECMWF, mm | Se emiten pasos horarios; lector de peligro puede seleccionar uno como si fuera acumulado | Agregar intervalos completos y comparables antes de clasificar. No multiplicar mm acumulados por horas otra vez. B1/B4 |
| CAPE, ráfaga, temperatura y viento del proveedor ECMWF | Variables disponibles; no todas entran en el IRO | Mantener unidades y calidad. No sumarlas al riesgo de inundación. Contexto de tormenta; predictor específico en B8 si se valida |
| Climatología P90/P95/P99, muestra todos/días húmedos, período, versión y unidad | Umbral meteorológico; la selección puede desalinearse de la ventana | Exigir misma variable, ventana, muestra, unidad y versión coherente. Falta parcial no habilita mezclar percentiles de versiones distintas. B1/B4 |
| Umbrales provisionales 24/72/240 h | Alternativa sin climatología | Versionar y evaluar sólo con la acumulación correspondiente. Retirar la extrapolación arbitraria a 240 h como garantía escolar. B4 |
| Horizonte 24, 72 y 240 h | Hoy mezcla instante objetivo y ventana acumulada | Contrato único: próximas 24 h, próximas 72 h, perspectiva hasta 10 días; guardar ventana efectiva del fenómeno. B1/B4 |

Para 72 h se pueden ofrecer dos magnitudes distintas: máximo acumulado móvil de 24 h dentro de las próximas 72 h y acumulación total de 72 h. Se conservan con nombres diferentes. Comparar el primero con climatología diaria puede ser coherente; comparar el segundo requiere climatología o umbrales de 72 h. No sustituir uno por otro silenciosamente.

En 240 h, la primera versión ofrece perspectiva y cobertura temporal explícitas. No replica un riesgo de mañana como si estuviera validado durante diez días, ni inventa un pronóstico escolar diario detallado donde la fuente no lo sostiene.

### 3.4. Ensemble e información probabilística

| Variables existentes | Problema o límite | Tratamiento |
|---|---|---|
| `hazardEnsembleProb`: P95/P99, dispersión, miembros totales/válidos, corrida, validez, horizonte, versión, ingesta | Acumulación de 24 h en horizontes 24/72; no significa total de 72 h | Persistir inicio/fin y evento de excedencia; aceptar sólo miembros con ventana completa y disponible en `asOf`. B1/B4 |
| Fracción de miembros | No equivale automáticamente a probabilidad calibrada de afectación escolar | Mostrarla como excedencia meteorológica; validar calibración meteorológica y escolar por separado. B4/B7 |
| Radar ensemble departamental: P10/P50/P90, P(>10/25/50 mm), miembros válidos | Otro circuito del mismo modelo, por centroides, hasta siete días | Reutilizar contratos y cálculos puros; no sumar como evidencia independiente del ensemble de celdas. B1/B4 |
| Agregados diarios guardados por radar | No conservan trayectorias suficientes para reconstruir todas las probabilidades multidiarias | Si se necesita P(acumulado 72 h), calcular por miembro antes de resumir y persistir ese agregado definido. No sumar probabilidades ni percentiles diarios. B4 |
| Cantidad de miembros, cobertura temporal, dispersión | Disponibilidad y desacuerdo diferentes | Pocos miembros o datos incompletos degradan soporte; baja dispersión no asegura exactitud. Umbral mínimo se registra y prueba antes de promover. B4 |

No unificar ambos almacenamientos mediante una migración masiva en el primer batch. Primero compartir contratos y evitar doble conteo; consolidar la ingesta únicamente si reduce costo sin perder detalle o cobertura.

### 3.5. Lluvia observada IMERG y antecedentes de humedad

| Variables existentes | Situación actual | Cambio |
|---|---|---|
| `hazardObservation`: mm, observadoEn, válido desde/hasta, calidad, geometría, ingesta, rawRef | Fuente semihoraria; conversión desde tasa en el proveedor | Controlar la conversión una sola vez y conservar intervalos. B1 |
| Suma antecedente 24/72 h, gránulos, cobertura | Ventana anclada en último dato disponible; mínimo 80%; el puerto pierde detalle de calidad | Conservar cantidad esperada/observada, huecos, último intervalo y latencia. No llamar cero a cobertura insuficiente. B1/B4 |
| Calidad de precipitación y cobertura espacial | Hay controles adicionales en verificación de radar | Compartir política explícita; evitar que evaluación y producción usen observaciones incompatibles. B1/B4 |
| 150 mm como saturación de 72 h | Transformación lineal sin humedad real del suelo; se aplica a ventanas distintas | Retirar la interpretación de saturación física. Usar lluvia antecedente como proxy con ventana explícita y ganancia validada. B4/B6 |
| Backfill y llegada tardía | Mejora reconstrucción posterior, no información que existía antes | Guardar disponibilidad temporal; no beneficiar retrospectivamente al motor con datos llegados después. B0/B1 |

Una observación de ayer puede ser perfectamente válida dentro de un acumulado antecedente. Lo que debe controlarse es si la ventana está suficientemente cubierta y actualizada. No aplicar un TTL de pocos minutos a cada registro histórico y eliminar lluvia antecedente legítima.

### 3.6. Río: caudal, alturas y asignación

| Variables existentes | Situación actual | Cambio |
|---|---|---|
| GloFAS `river_discharge`, m³/s, diario | Ingesta existente; disponibilidad no demuestra identidad del cauce ni precisión | Suspendido como fuente del predictor propuesto por elección del usuario. Mantener evidencia histórica y auditar la celda antes de cualquier reconsideración. B1/B3 |
| INA A5: corrida/serie/estación/variable, `forecast_date`, `qualifier`, soporte temporal | Confirmados `main/p10/p90` en media semanal y `inferior/medio/superior` en otra serie de altura | Fuente principal elegida. Conservar calificadores; no convertir media semanal en pico diario ni rótulos sin cobertura probabilística en cuantiles. B1/B3 |
| Mean/max/P75 pedidos al proveedor | El adapter solicita cuatro variables pero sólo emite `river_discharge` | No dar por hecho que los otros valores están persistidos. Incorporar sólo el resumen que se vaya a usar o dejar de solicitarlo tras verificar dependencias. B3 |
| Climatología de caudal, P90/P95/P99 | Anomalía relativa del punto | No equivale a altura ni umbral de evacuación. Mantener unidades y referencia local. B3 |
| PNA `lecturaM`, `alertaM`, `evacuacionM`, `estadoPublicado` | Ingesta ya disponible; no conectada al motor local revisado | Evaluar estado actual del tramo con umbrales de esa estación, explicar discrepancias con estado publicado. B3 |
| `variacionM`, `periodoHoras`, lectura/fecha anterior | Permiten tendencia local | Comparar intervalos reales y datos consistentes. Una bajante no resuelve automáticamente daños o accesos. B3 |
| `medidaEn`, `capturadaEn`, inconsistencia/motivos, hash y versión catálogo | Calidad, procedencia y disponibilidad | Freshness de medición, no sólo de descarga. Lectura inconsistente no se usa como certeza; registrar correcciones de una fuente para la misma fecha. B1/B3 |
| Catálogo de estaciones, río, rol local/aguas arriba, coordenadas sin verificar | Puede aportar contexto pero no todas representan la escuela | Consumir tramos aprobados para PNA; aguas arriba sólo como anticipación contextual hasta validar conexión y desfase. B3 |
| Tramos, localidad, aprobación, versión | Mapeo humano ya realizado | Integrarlo; auditar alias, localidades homónimas, rurales e islas. No extender automáticamente a localidades dudosas. B3 |

No comparar altura PNA con elevación DEM absoluta: las referencias verticales pueden ser distintas. No convertir m³/s en metros de inundación sin una relación hidráulica validada.

### 3.7. Susceptibilidad, topografía y agua permanente

| Variables existentes | Riesgo de uso actual | Cambio |
|---|---|---|
| `peligroInundacionFluvial`, pluvial, viento, calor | Se promedian magnitudes distintas y se multiplican por 100 | Retirar el promedio multiamenaza. Conservar valor, unidad y semántica por mecanismo. B1/B3–B4 |
| `periodoRetorno`, fuente, fecha, licencia, versión | El significado no es homogéneo entre amenazas | RP sólo donde aplica; separar metadatos de calor y precipitación. B1 |
| Productor `mean_degree_days/above/32c` | Los números grandes se interpretaron históricamente como Kelvin | Verificar recurso/unidad; no restar 273,15 por apariencia. B1 |
| JRC profundidades RP10/100/500 y `claseRio` | Evidencia estática útil; `sin_riesgo` se puede leer como seguridad universal | Exposición modelada con resolución, fecha, cobertura y alcance. Un valor cero no niega otros mecanismos. B3 |
| RP20/50/75/200 presentes en CSV | No todos llegan a las columnas principales de la aplicación | Conservar artefacto de origen; no migrarlos todos a DB salvo experimento que los use. B6 |
| Márgenes RP10/100/500 | Heurística de terreno puede vetar profundidad positiva | Quitar veto duro del evaluador; usar como evidencia de discriminación sólo con incertidumbre y validación local. B3/B6 |
| DEM/GLO-30 y percentiles locales | Modelo de superficie; referencias espaciales y verticales aproximadas | Controlar datum, vegetación/edificios, resolución y errores de ubicación antes de permitir una reducción fuerte. B6 |
| Profundidades iguales entre RP → agua permanente | Heurística hoy termina en `sin_riesgo` | Etiquetar posible agua permanente/ambigüedad; no deducir seguridad frente a crecida o problemas de acceso. B3 |
| `juntoLaguna`, distancia al agua y altura relativa | Proximidad no equivale a anegamiento | Modificador territorial pluvial si demuestra valor; nunca observación de inundación actual. B4/B6 |
| Versiones/importación | Importer puede actualizar columnas v2 de filas existentes | Versionar insumos usados y evitar sobreescritura silenciosa de una versión reproducible. B1 |

### 3.8. Acceso OSM y exposición de rutas

| Variables existentes | Qué representan | Cambio |
|---|---|---|
| Distancia a vía pavimentada y cabecera | Accesibilidad estructural | Características auxiliares, no amenaza actual. No puntuar tres veces distancia, km sin pavimentar e índice derivado. B5 |
| Tramos sin pavimentar: cantidad/km | Fragilidad posible frente a lluvia | Condicionar a lluvia y pertinencia del trayecto; validar aporte sobre el índice base. B5/B6 |
| Cruces de agua, con puente, con vado explícito/probable | Infraestructura y calidad de inferencia | Distinguir confirmado de probable. Un puente registrado no prueba transitabilidad; falta de tag no prueba puente ausente. B5 |
| Alternativa sin cruce/pavimentada | Redundancia modelada | Reducir únicamente si alternativa pertinente y utilizable ante el mismo evento. `null` reduce conocimiento, no suma más daño que ausencia confirmada. B5 |
| `indiceAislamiento` 0–3, motivo sin datos, distancia de snap | Resumen estructural y ajuste a red | Conservar explicación; índice 0 no cancela exposición de ruta. Snap dudoso degrada aplicabilidad. B5 |
| Ruta LineString, cruces, vía principal, destino y distancia | Trayecto modelado a una localidad, no todas las movilidades escolares | Referenciar el trayecto evaluado. No atribuirlo automáticamente a alumnos/docentes ni embarcaciones. B5 |
| Exposición v1: estado, celdas totales/con dato/con profundidad, máximo, cobertura, RP, escenario, resolución | Muestreo de inundación histórica | Preservar cobertura y no mezclar escenarios/RP. Preferencia de versión explícita y reversible. B1/B5 |
| Exposición v2: clase, muestras totales/expuestas/sin dato, máximos RP10/100/500 | Clasificación por cantidad mínima de píxeles | Tratar cuellos de botella cortos; separar longitud expuesta y cruce crítico. No exigir 270 m para admitir cualquier problema. B5 |
| Fecha OSM, versión, fuente, licencia | Calidad y reproducibilidad | Conservar; una ruta nueva o un puente reconstruido puede invalidar la capa. B1/B5 |
| Ausencia de ruta para islas/red no conectada | Modelo vial fuera de dominio | Marcar acceso no evaluado por esa red; partes y verificaciones mantienen cobertura operativa. B2/B5 |

### 3.9. SMN, radar, tormenta y estacional

| Variables existentes | Uso seguro | Cambio |
|---|---|---|
| SMN: evento, severidad, urgencia, certeza, nivel SAT | Amenaza oficial regional | Incorporar por fenómeno y área/tiempo; no traducir toda alerta a inundación escolar. B4 |
| SMN: departamentos/polígonos, onset/expires/sent, fetchedAt, cancelada | Alcance y ciclo de vida | Resolver actualización/cancelación y vigencia; conservar versión conocida en replay. B1/B4 |
| SMN: título, descripción, instrucción, identificadores y bruto | Explicación y trazabilidad | Mostrar atribución; no usar texto libre como regla meteorológica implícita. B4 |
| Radar: `precipitation_probability`, `precipitation`, `wind_speed_10m`, `wind_gusts_10m`, `wind_direction_10m`, `cape`, `lifted_index`, `weather_code`, `freezing_level_height` | Contexto horario con grilla y modelo propios | Auditar unidades y ventanas. No interpolar códigos WMO como números continuos ni direcciones con promedio lineal ingenuo. B1/B4 |
| Radar escolar: interpolación, próximos horarios y diarios | Estimación espacial, no sensor en la escuela | Etiquetar soporte; evitar sumas cero de series completamente nulas, extrapolación inadvertida y días parciales como completos. B1/B4 |
| Proxy de granizo 0–3 | Heurística de CAPE/LI/ráfaga/freezing level/WMO | Conservar como indicador no calibrado; no mostrar porcentaje de granizo ni sumar automáticamente al riesgo escolar. B8 |
| Seasonal: emisión, ventana 30–90 d, media/mediana/dispersión y miembros | Planificación regional | Mantener fuera de la prioridad inmediata. No extrapolar a una escuela en 24 h. B1/B8 |
| `probabilidadSobreNormal` estacional | En el código compara miembros perturbados con el control, no con una normal climatológica | Corregir etiqueta/contrato antes de usar. Recalcular contra climatología sólo si se implementa y valida esa definición. B1/B8 |

### 3.10. Historial, episodios, resultados y operación técnica

| Variables existentes | Problema/función | Cambio |
|---|---|---|
| Cantidad de afectaciones, duración, accesos interrumpidos en 365 días | Mezcla filas, duraciones solapadas y propensión a reportar | Deducir episodios relevantes por mecanismo, sin duplicar intervalos. Ausencia de reportes no reduce riesgo. B6 |
| Episodio derivado: departamento, fechas, estado, miembros, versión/reglas | Agrupación de partes | Reutilizar para análisis y navegación; no contarlo como nueva confirmación independiente ni verdad para medir el motor. B0/B6 |
| `scoreAmenaza`, `scoreVulnerabilidad`, `scoreRiesgo` y niveles | Fórmula única puede diluir una señal grave | Migrar a resultados por mecanismo y prioridad común; conservar legado sólo para comparación. B1–B7 |
| Riesgo de acceso, confianza, exposición y urgencia | Acceso separado; urgencia no desarrollada en el núcleo | Integrar acceso sin dilución; derivar necesidad de verificar desde evidencia y discrepancias existentes. B2/B5 |
| Factores: fuente, variable, valor, unidad, contribución, peso, explicación, fecha | Explican una suma ponderada | Admitir razones/reglas y referencias sin fingir contribuciones aditivas. B1 |
| Run, versión, publicación, cobertura, snapshot, calculadoEn y validoHasta | Publicación atómica; una sola corrida vigente | Candidatos aislados; validez por mecanismo y cobertura sobre padrón completo. B1/B7 |
| Salud: último intento/éxito, estado/error, TTL, licencia | Disponibilidad del proveedor | Separar descarga exitosa de dato vigente/aplicable a escuela. B1 |
| Job: lease, idempotencia, estado, errores y métricas | Control de ejecución existente | Reutilizar; fallos parciales y reintentos sin duplicar resultados. B1/B7 |
| Corte de situación, KPIs, fuentes, episodios y run | Foto congelada | Conservar timestamps y referencias; no mezclar foto histórica con prioridades actuales sin indicarlo. B2/B7 |
| Briefing, modelo/prompt/params, validación, tokens/costo/fallback | Narrativa sobre datos persistidos | Consumir la misma proyección; nunca decidir riesgo ni agregar hechos. B2/B7 |
| Export: features y targets de afectación 24/72 h | Puede mezclar evidencia actual y etiquetas futuras | Disponibilidad temporal, versión, cobertura y target definido; excluir datos posteriores de features. B0/B7 |
| Flags y cadencias | `RISK_MODE=shadow` no impide por sí solo publicar como vigente | Implementar aislamiento real; reconciliar definiciones de cadencias y jobs esperados. B1/B7 |
| Límites/cupo/reintentos de proveedores | Pueden dejar cobertura incompleta | Medir cobertura efectiva por corrida y costo; no refrescar una fuente sacrificando silenciosamente otra. B1/B7 |

Las banderas actuales también forman parte del contrato de implementación:

| Banderas | Control que debe comprobarse en B1/B7 |
|---|---|
| `ENOS_JOBS_ENABLED` | Ejecución de jobs; distinguir pausa deliberada de fuente fresca o evaluación válida |
| `RISK_ENGINE_ENABLED`, `RISK_RADAR_ENABLED` | Visibilidad y rutas habilitadas según consumidor; el CLI no usa la primera como interruptor general de cálculo |
| `RISK_MODE` | Actualmente informa `shadow`/`advisory`; la comparación nueva necesita aislamiento real en persistencia y publicación |
| `HAZARD_CONTEXT_ENABLED`, `SEASONAL_ENABLED`, `SITUACION_ENABLED` | Varias gobiernan UI y dejan APIs existentes accesibles bajo sus permisos; no son filtros de calidad ni vigencia |
| `EPISODIOS_DERIVADOS_ENABLED`, `AI_BRIEFING_ENABLED` | Verificar alcance efectivo de presentación/ejecución; no usar para borrar evidencia operativa |
| `RADAR_ENSEMBLE_ENABLED` | Tiene valor efectivo habilitado salvo `false`, distinto del patrón opt-in de otras banderas; registrar configuración explícita |

Conservar también configuración de grilla/modelo, retención, cupos por proveedor, concurrencia y versiones de algoritmo. Son parámetros de cobertura y reproducibilidad. Credenciales permanecen fuera del corpus y de las explicaciones del motor.

### 3.11. Variables que hoy faltan y no deben suponerse

No se encontró en el circuito revisado cobertura sistemática de cortes viales en tiempo real, trayectos reales de alumnos, acceso fluvial, cota de piso validada, drenaje urbano, humedad de suelo, defensas y bombeo operativos, suministro eléctrico/hídrico en tiempo real ni tiempos hidráulicos de propagación entre estaciones.

Tampoco alcanza la proximidad a un río para modelar remanso, aportes de tributarios, operaciones de represas o conectividad entre lagunas. Son explicaciones posibles de errores residuales; incorporarlas requiere datos pertinentes y una hipótesis contrastable en B8.

## 4. Reglas del núcleo y efectos causales

### 4.1. Un recorrido de cálculo y una proyección común

```text
Datos existentes → adapters con unidades/tiempo/calidad → evaluadores puros
                                                     ├─ fluvial
                                                     ├─ pluvial
                                                     └─ acceso
Partes + servicios + verificaciones → situación actual       │
                                      └──── proyección común ┘
                                            ↓
                         prioridad, motivos, cobertura y trazabilidad
                                            ↓
                     ficha · mapa · listas · KPIs · corte · briefing
```

La situación actual reutiliza reglas del dominio operativo. No es un segundo motor de scoring. El evaluador de acceso recibe salidas fluvial/pluvial y evidencias pertinentes a su ruta; no recalcula meteorología ni suma dos veces el mismo fenómeno.

### 4.2. Contrato mínimo propuesto

Un resultado por escuela y horizonte conserva:

| Campo conceptual | Contenido |
|---|---|
| Identidad y tiempo | CUE, período, `asOf`, versión del motor y de insumos, ventana evaluada |
| Evaluaciones | Distribución hidrológica, probabilidad de excedencia y de impacto por mecanismo/ventana; evento, método, calibración, aplicabilidad, calidad y entradas utilizadas. `null` donde falte la transformación necesaria |
| Amenaza regional | Nivel, área y vigencia cuando existe señal regional pero falta resolución escolar |
| Situación actual | Estado reportado, afectaciones activas por alcance, servicio educativo, antigüedad y discrepancias |
| Prioridad | Acción principal y motivos; otras necesidades siguen visibles |
| Cobertura | Qué se evaluó, qué falta, qué venció y qué no aplica |
| Trazabilidad | IDs de datos, ventanas, versiones y referencias de reporte/verificación, sin datos nominales innecesarios |

`bajo` significa evaluación baja con evidencia suficiente en el mecanismo y ventana declarados. `null` significa que no se puede asignar ese nivel. La explicación distingue sin dato, vencido, inválido, fuera de cobertura y no aplicable. Un mecanismo no aplicable no penaliza la confianza de los demás.

Los niveles operativos y el IRO legado siguen siendo categorías/índices, no porcentajes. La nueva probabilidad debe derivarse de distribuciones y escenarios explícitos. Puede existir una estimación física con calibración escolar pendiente; esa limitación debe acompañarla. La ausencia de reportes escolares no impide emitirla, pero no permite afirmar exactitud escolar comprobada. Las probabilidades por ventana preservan dependencia temporal y entre edificio/accesos.

La prioridad propuesta tiene cuatro acciones: **atender, anticipar, verificar, seguimiento**. Una escuela puede necesitar atender y verificar a la vez; la acción principal no borra los demás motivos. Una señal regional con afectación escolar indeterminada aparece en vigilancia/anticipación y, según información faltante, verificación; no queda verde ni se etiqueta como edificio inundado.

### 4.3. Qué aumenta, reduce o no cambia cada resultado

| Cambio de evidencia | Efecto admisible | Efecto que debe impedirse |
|---|---|---|
| Crece PNA y cruza umbral local | Aumenta amenaza fluvial del tramo; prioriza escuelas con exposición relevante | Lluvia local baja diluye esa amenaza |
| Río baja con lecturas válidas | Puede reducir pronóstico fluvial según persistencia/histéresis validada | Cerrar evacuación, daños o acceso sin constatación |
| Lluvia futura aumenta en ventana comparable | Aumenta señal pluvial según regla y aplicabilidad | Reducir nivel por cambiar pesos al aparecer un dato adicional |
| Lluvia antecedente aumenta | Puede aumentar predisposición al anegamiento | Declarar suelo saturado sin medición ni calibración |
| Alternativa de acceso verificada y pertinente | Reduce riesgo de interrupción de ese trayecto | Reducir riesgo del edificio o de otros trayectos |
| Se descubre un puente existente | Mejora conocimiento de conectividad | Declarar puente transitable durante la crecida |
| Terreno alto bien validado | Puede reducir exposición fluvial del edificio | Borrar riesgo de rutas, hogares o servicios |
| Aqueduct cero o JRC `sin_riesgo` | Aporta resultado negativo acotado de esa capa | Veto universal a PNA o a un reporte actual |
| Reporte actual de evacuación/inaccesibilidad | Eleva necesidad de atención por el alcance reportado | Inflar el pronóstico previo y atribuirse anticipación retrospectiva |
| Se retira un reporte erróneo | Corrige situación y deja trazabilidad | Tratarlo como recuperación física confirmada |
| Se confirma recuperación | Reduce afectación actual del alcance confirmado | Cancelar amenaza futura que sigue vigente |
| Verificación sin afectación ahora | Aporta evidencia actual y puede resolver una duda explícita | Interpretar que no habrá afectación mañana |
| Falta un dato antes disponible | Cambia cobertura/confianza; puede impedir clasificar | Transformar riesgo desconocido en bajo o aumentar daño por un número arbitrario |
| Mayor matrícula | Aumenta personas potencialmente expuestas y puede desempatar prioridad | Hacer desaparecer una escuela pequeña con daño grave |
| Clases virtuales/cuadernillos | Puede mitigar pérdida educativa | Rebajar amenaza física |
| Alerta regional de tormenta | Aumenta vigilancia para ese fenómeno | Probar granizo, inundación o daño en cada escuela |

No sumar máximos regionales independientes para fabricar una probabilidad conjunta. Para una prioridad sintética puede dominar el mecanismo más relevante, conservando sus razones. La interacción lluvia + crecida se admite sólo mediante una regla explícita y comprobada; no por contar dos veces la misma precipitación en varios indicadores.

### 4.4. Política temporal

Se registran tres conceptos separados: **cuándo ocurrió o será válido el dato**, **cuándo se emitió**, y **cuándo estuvo disponible para el sistema**. Si no se conoce la emisión real, se indica; no se inventa a partir de la descarga.

Para replay operativo, una entrada debe haber sido conocida antes de `asOf`. Un reporte cargado tarde con `rigeDesde` anterior puede servir como etiqueta posterior, pero no como predictor retrospectivo. Para reconstrucción científica con datos corregidos se usa otro modo explícito, sin llamarlo rendimiento operativo histórico.

La situación actual se obtiene al consultar la proyección común, sin esperar el job meteorológico de seis horas. Los cortes históricos congelan esa misma proyección a su fecha. La validez se controla por mecanismo al servir resultados: que un run esté `vigente` no vuelve vigente cada fuente.

## 5. Batches de implementación

### B0 — Congelar la línea de base y los casos de evaluación

**Objetivo:** poder atribuir cada mejora o regresión a un cambio concreto.

**Trabajo:**

1. Registrar commit, configuración, versión de reglas, fuentes y artefactos importados. Comparar con el motor desplegado mediante lectura autorizada cuando se implemente; resolver `v0.2` frente a `v0.3` antes de usar comparaciones productivas.
2. Construir matriz de cobertura sobre el padrón completo: perfil, parte, población, estación/tramo, pronóstico, IMERG, estáticas y rutas. Separar filas existentes de datos utilizables.
3. Capturar fixtures anonimizados de los cuatro casos iniciales y de Ituzaingó/Libres con fechas, evidencia y resultado esperado. Mantener casos sintéticos separados de observaciones reales.
4. Definir unidad de evaluación: escuela × evento × instante de decisión × horizonte. Evitar contar como cientos de aciertos las sucesivas corridas del mismo caso.
5. Definir etiquetas de afectación física, acceso y continuidad; mantener reportado, verificado, retirado y desconocido. Ausencia de parte no cuenta como negativo.
6. Preparar replay con `asOf` y entradas congeladas. Identificar fuentes sobreescritas que impiden reconstrucción exacta; comenzar captura prospectiva sin inventar historia.
7. Registrar rendimiento inicial y política de promoción: sensibilidad de casos graves, anticipación, precisión con etiquetas suficientes, cobertura, carga de verificación y costo.

**Archivos/circuitos:** `motor/*`, `__fixtures__`, `dataset/export-desidentificado.ts`, `radar-meteo/verificacion.ts`, snapshots, movimientos, verificaciones y artefactos geográficos.

**Entregables:** manifiesto de base, matriz de cobertura, corpus versionado y reporte reproducible por evento. Sin cambios de reglas todavía.

**Salida:** casos trazables, tiempos conocidos y métricas con denominadores explícitos; limitaciones históricas enumeradas. La verificación meteorológica por departamento queda identificada como tal, sin presentarla como validación de impacto escolar.

**Riesgo controlado:** comparar código o datos diferentes y atribuir al modelo una mejora que proviene de datos posteriores.

### B1 — Asegurar contratos, datos y publicación aislada

**Objetivo:** disponer de entradas correctas y de un camino seguro para comparar modelos.

**B1a. Contrato y persistencia compatibles.**

- Definir resultado por mecanismo, estado de evidencia, referencias temporales y razones. Mantener lectura de snapshots antiguos.
- Agregar contenido versionado al snapshot para evaluaciones nuevas; conservar columnas antiguas durante transición. No reutilizar `scoreAmenaza` para otro significado.
- Extender corrida con propósito operativo/comparación y estado final de candidato. Un candidato completo nunca se marca `vigente`; así no desplaza al operativo ni vulnera el índice de único vigente.
- Aislar IDs de idempotencia/leases por propósito y versión para poder correr base y candidato con los mismos inputs.
- Reutilizar publicación transaccional. Promoción explícita sólo después de validación de vigencia/cobertura; cambio de flag no basta.

**B1b. Contratos de fuentes.**

- Validar magnitud, unidad, intervalo, paso temporal, cobertura, coordenada y disponibilidad. Corregir selección de corridas futuras y vencidas.
- Implementar agregadores puros de intervalos; no cambiar simultáneamente umbrales y agregación en la comparación inicial.
- Transportar cobertura/calidad IMERG hasta el núcleo y conservar observaciones históricas útiles dentro de su ventana.
- Retirar calor/viento/pluvial no normalizados del promedio de susceptibilidad del candidato. Conservar los valores originales para auditoría y futuros predictores.
- Corregir contrato/etiqueta estacional y representaciones meteorológicas engañosas: serie nula, días incompletos y variables categóricas/circulares.
- Versionar referencias a perfiles, climatologías y estáticas. Cuando no exista historia inmutable, capturar entradas efectivamente usadas desde este batch.

**B1c. Lectura común inicial.**

- Introducir un servicio compartido de lectura/proyección; inicialmente puede envolver resultados antiguos identificados como tales.
- Exponer validez por mecanismo y distinguir cobertura de ejecución frente a cobertura analítica.
- Centralizar política de cadencias/frescura: hoy `cadencias.ts` y `jobs-esperados.ts` difieren, incluso sobre climatologías y cálculo de riesgo. Los TTL de salud no sustituyen la política por dato.

**Archivos existentes:** `tipos-hazard.ts`, `peligro/*`, `providers/*`, adapters, `jobs/calcular-riesgo.ts`, `flags.ts`, `cadencias.ts`, `jobs-esperados.ts`, `salud.ts`, `lib/db/schema.ts`, `lib/db/seed.ts`, `scripts/importar-geo-static.mjs`, radar meteorológico.

**Archivos nuevos sugeridos:** contrato de evaluación, lectura/proyección compartida y utilidades de ventana/frescura; nombres finales según convenciones del repo. No crear un framework de reglas configurable por lenguaje propio.

**Migración:** cambios aditivos e idempotentes en el mecanismo de DB realmente utilizado por el repo, incluyendo DDL de arranque. Probar Postgres y PGlite donde corresponda; no asumir SQLite por comentarios antiguos. Las reglas nuevas se calculan como candidatas.

**Salida:** mismo input/versión/`asOf` produce el mismo resultado; candidato invisible a consumidores operativos; lectura antigua compatible; ninguna entrada inválida se convierte en cero; expiración observable sin depender de que otro job corra.

### B2 — Hacer visible la situación conocida y derivar una prioridad común

**Objetivo:** resolver primero las contradicciones entre lo reportado y lo que muestra el sistema.

**Trabajo:**

1. Crear adapter de situación actual a partir de parte, afectaciones, alcance, servicio, movimientos y verificaciones. Cargar por lote; sin una query por escuela o alumno.
2. Incorporar el mapeo estable de motivos descrito en §3.2. Preservar datos antiguos, motivos personalizados y mecanismo desconocido.
3. Derivar atención actual sin depender del perfil geo ni de OSM. Evaluar estado de establecimiento y servicio, además de severidad; no exigir que exista una afectación adicional para reconocer `evacuado`.
4. Diferenciar reporte reciente, reporte sin reconfirmación, resolución, retirada y discrepancia. Un hecho grave antiguo sigue identificado como reportado pendiente de reconfirmación; no se inventa resolución.
5. Reutilizar solicitudes de verificación y su idempotencia. La proyección recomienda verificar, sin crear automáticamente solicitudes ilimitadas ni enviar mensajes.
6. Derivar prioridad antes de filtrar, ordenar, contar y limitar resultados. Incluir los motivos de acceso, situación actual y falta crítica de información.
7. Migrar en el mismo batch los consumidores operativos al servicio compartido: lista, puntos del mapa, detalle, Centro de Situación y KPIs. Un componente visual nuevo no arregla una consulta que ya excluyó la escuela.
8. Hacer que cortes y briefing usen la misma semántica; mostrar fecha de foto y fecha de actualización actual cuando difieran.

**Archivos existentes:** `servicio-educativo.ts`, `verificaciones.ts`, `motivos.ts`, dominio de partes/movimientos; APIs `riesgo`, `radar`, `situacion`; `riesgo/situacion/consulta.ts`, `corte.ts`; ficha, hooks, mapa y páginas administrativas.

**Reglas iniciales de prioridad:** evacuación y afectación grave vigente → atender; suspensión o acceso interrumpido → atención según severidad/alcance; amenaza relevante futura → anticipar; evidencia insuficiente/discrepante → verificar, conservando cualquier atención simultánea. `centro_evacuados` representa ocupación y continuidad, sin elevar automáticamente amenaza física. Orden estable por acción/gravedad, tiempo útil de anticipación y alcance; matrícula sólo después de gravedad, con desconocidos explícitos.

**Salida:** Esc. 93 nunca figura como situación normal por score 0; 874/532 conservan acceso/comunidad aunque sus capas sean cero; 377 conserva afectación reportada aunque no tenga ruta. El mismo caso tiene igual situación y motivos en ficha, mapa, listas y KPIs. Reporte nuevo aparece sin esperar seis horas.

**Publicación:** puede promoverse de manera independiente al resto del motor, mostrando claramente que el pronóstico aún usa versión anterior. No atribuir a B2 mejoras de anticipación: corrige reconocimiento y atención de hechos conocidos.

### B3 — Pronóstico probabilístico fluvial y transferencia al edificio

**Objetivo:** anticipar la distribución de caudal/nivel y la probabilidad de ingreso de agua al edificio por 24 h, 72 h y diez días, sin depender de reportes escolares. Conservar incertidumbre cuando falte resolución física y distinguirla de calibración comprobada.

**Trabajo:**

1. Integrar PNA y tramos aprobados con localidad/departamento normalizados. Auditar asignaciones ambiguas y conservar versión del tramo.
2. Separar altura observada local, estado de estación, tendencia y caudal pronosticado. Cada uno tiene unidad y tiempo propios.
3. Asociar estaciones y series INA al tramo mediante identidad y relación hidrológica comprobada. La cercanía geográfica o una celda GloFAS no son autoridad de asignación. Open-Meteo Flood queda fuera del predictor propuesto por ahora.
4. Evaluar exposición del edificio con las capas disponibles, sin gate `Aqueduct > 0`, sin veto automático de margen DEM y sin interpretar agua permanente como seguridad universal.
5. Mantener amenaza regional visible para todas las escuelas del tramo. Determinar impacto escolar sólo hasta donde alcance la evidencia.
6. Agregar tendencia con requisitos mínimos de consistencia temporal. Evitar oscilación por ruido mediante una regla de persistencia/histéresis versionada y evaluada, sin retrasar un ascenso grave confirmado.
7. Usar la serie futura de caudal correspondiente al horizonte; no repetir el primer día para 24/72/240 h. Las lecturas actuales PNA no son por sí mismas un pronóstico a diez días.
8. Encadenar actualización de evaluación a la llegada de nuevas lecturas PNA pertinentes, reutilizando scheduler/leases. La ingesta horaria no mejora oportunidad si el resultado espera siempre al ciclo meteorológico de seis horas. Medir tiempo fuente → publicación → pantalla; comenzar por recálculo por lote antes de introducir una infraestructura de eventos.
9. Incorporar INA A5 conservando ID de corrida y serie, estación, emisión, unidad, soporte temporal y `qualifier`. Las respuestas simplificadas que omiten los calificadores no sirven como entrada probabilística equivalente. Descargar corridas completas y filtrar localmente para reutilizar datos entre escuelas.
10. Ajustar error y dispersión por tramo/plazo contra observaciones históricas. Integrar Yacyretá y niveles aguas arriba cuando su relación esté validada. No suponer una conversión universal caudal–nivel.
11. Transferir los escenarios al edificio mediante geometría hidráulica y cotas de ingreso compatibles, modelando su incertidumbre. Etiquetar como pendiente la calibración escolar donde falten resultados históricos, sin bloquear el pronóstico hidrológico.
12. Resolver la diferencia entre cuantiles de altura media semanal y probabilidad de máximo diario/en diez días. Confirmar el anclaje de la semana y la semántica de `main`; construir un modelo local basado en series INA donde el producto no cubra el evento requerido. No tratar escenarios `inferior/medio/superior` como tres miembros equiprobables. Google queda como alternativa futura tras obtener acceso. Detalle en la [especificación probabilística](pronostico-probabilistico-fluvial-escuelas.md).

**Contexto observado y vigilancia complementaria:** esta tabla describe la situación del tramo; no reemplaza el cálculo probabilístico futuro.

| Evidencia | Resultado propuesto |
|---|---|
| Estación válida en alerta/evacuación + tramo aprobado, sin exposición escolar resuelta | Amenaza regional relevante, impacto escolar indeterminado, anticipación/vigilancia y verificación dirigida |
| Lo anterior + exposición pertinente y fiable en edificio | Aumenta nivel previsto fluvial escolar según matriz versionada; prioridad mayor que mera coincidencia territorial |
| Lo anterior + exposición sólo de ruta | Mantener explicación fluvial regional; elevar evaluación de acceso, sin afirmar edificio inundable |
| Reporte actual de inundación o evacuación | Situación actual y atención por B2; mecanismo fluvial sólo cuando la evidencia lo permita |
| Estación vencida/inconsistente | Evidencia degradada; conservar último estado con fecha como antecedente, sin declararlo actual ni seguro |
| Escuela sin tramo | Fluvial sin cobertura suficiente; pluvial, acceso y situación reportada siguen funcionando |

**Archivos:** `hidrometria/*`, `riesgo/puntos-rio.ts`, `rio-asociacion.ts`, adapter de territorio/caudal/susceptibilidad, nuevo evaluador fluvial puro y contrato común.

**Salida:** distribuciones y excedencias por tramo/horizonte, más probabilidad modelada de ingreso al edificio donde exista transferencia física suficiente. Conservar evento, ventana, método, incertidumbre y estado de calibración. La asignación territorial cubre el universo sin hacer depender la predicción de Aqueduct o de un parte previo. Casos interiores, tributarios e islas muestran límites de cobertura.

### B4 — Evaluación pluvial y contexto meteorológico útil

**Objetivo:** que la predicción use lluvia comparable y que la incertidumbre tenga significado.

**Trabajo:**

1. Aplicar agregación por intervalos a las ventanas definidas en §3.3. Tratar bordes de corrida, día local/UTC, huecos y cambio de paso sin doble conteo.
2. Corregir ensemble por miembro antes de resumir; registrar evento de excedencia, ventana y miembros válidos. Priorizar ensemble apto y usar determinístico como alternativa explícita, sin promediar ambos como fuentes independientes.
3. Calcular antecedentes IMERG con cobertura/latencia explícitas. Lluvia reciente modifica predisposición; no se utiliza para reducir una amenaza fluvial independiente.
4. Separar rareza meteorológica e impacto escolar. Con lluvia extrema y exposición desconocida, mantener alerta meteorológica/anticipación con incertidumbre, no seguridad.
5. Incorporar SMN por fenómeno, zona y vigencia: complemento de autoridad/contexto, no observación de daño ni segunda medición independiente de la misma tormenta.
6. Integrar susceptibilidad pluvial sólo donde exista. El dataset actual no la aporta; no reutilizar por defecto profundidad fluvial como mapa pluvial.
7. Probar si proximidad a laguna, lluvia antecedente e historial pertinente mejoran discriminación. B6 determina cuáles se consolidan.
8. Etiquetar 240 h como perspectiva cuando no exista evaluación escolar suficiente. No heredar precisión de 24 h.
9. Propagar nuevas corridas, observaciones y cambios/cancelaciones SMN al resultado con cadencia compatible con su utilidad. Reutilizar encadenamiento y exclusión de jobs; una alerta cancelada no puede seguir activa hasta la siguiente corrida de seis horas.

**Archivos:** `peligro/nivel.ts`, `observado.ts`, `umbrales-provisorios.ts`, providers/adapters de ECMWF/ensemble/IMERG, `radar-meteo/ensemble.ts`, `smn-alertas.ts`, `escuela.ts`, nuevo evaluador pluvial.

**Salida:** 24 pasos completos de 5 mm dan 120 mm; 72 h no se confunden con un día al lead 72; series nulas no dan cero; cancelación SMN y forecast vencido se reflejan; la probabilidad mostrada describe exactamente el evento meteorológico calculado.

**Validación de precisión:** por evento y horizonte, comparar detección y anticipación con la versión anterior y con alternativas simples. La corrección de ventanas puede aumentar mucho las alertas: controlar ese efecto con etiquetas, no compensarlo bajando arbitrariamente pesos.

### B5 — Acceso: separar fragilidad de interrupción probable o reportada

**Objetivo:** representar la movilidad real que los datos permiten, sin que OSM o el estado del edificio oculten aislamiento.

**Trabajo:**

1. Reemplazar la suma incondicional de bases/agravantes por evaluación de transitabilidad y alternativas dentro de cada escenario hidrológico de B3. La proporción de escenarios con pérdida de un acceso necesario permite estimar probabilidad de interrupción física; su efecto educativo incorpora grupos y calendario. No convertir aislamiento estructural directamente en porcentaje.
2. Integrar exposición de ruta v2, geometría, cruces y cobertura. Mantener índice OSM como resumen estructural, no como condición excluyente.
3. Diferenciar cruce crítico corto y extensión expuesta; revisar el filtro de tres píxeles para que no descarte un puente/vado de corta longitud con evidencia suficiente.
4. Vincular al trayecto la amenaza pertinente. Estar en una localidad con río alto no demuestra que cualquier ruta cruce ese río.
5. Separar ausencia de alternativa, alternativa desconocida y alternativa verificada utilizable. No sumar más daño por falta de información.
6. Usar reportes de alumnos/docentes como afectación actual por alcance. La ruta calculada a cabecera sigue identificada como aproximación; no sustituye viajes de hogares a escuela.
7. Manejar islas, acceso fluvial y red desconectada como fuera del dominio vial; conservar situación/solicitud de verificación y oportunidad de curar vínculo comunitario.
8. Derivar prioridad común por acceso aunque el pronóstico del edificio sea bajo. Compartir pruebas con B2 para que no desaparezca en mapas o filtros de IRO.

**Archivos:** `motor/riesgo-acceso.ts`, adapter de aislamiento, `exposicion-ruta.ts`, `territorio-mapa.ts`, `services/geo-static/src/geo_static/exposicion_ruta_v2.py`, importer y consumidores de acceso.

**Salida:** índice 0 no cancela ruta expuesta; aislamiento estructural alto sin amenaza no equivale automáticamente a corte actual; reporte de acceso prevalece como situación aunque OSM no tenga ruta. Ruta 118 y comunidades de Saladas se evalúan con alcance explícito, sin prometer detección de un corte vial para el que hoy no hay fuente.

### B6 — Ganar precisión con refinamientos acotados

**Objetivo:** probar valor incremental de variables disponibles antes de consolidar reglas adicionales.

Se ejecutan experimentos independientes sobre el núcleo B3–B5. Cada uno compara versión con/sin la variable, comparte particiones y registra efectos por evento, zona y tipo de escuela.

| Experimento | Cambio | Condición para conservarlo |
|---|---|---|
| Historial pertinente | Episodios por mecanismo, recencia y duración sin solapamientos; intersección con la ventana aunque hayan comenzado antes | Mejora discriminación sin penalizar escuelas que reportan poco |
| Lluvia antecedente | Acumulados explícitos y huecos frente a sólo pronóstico | Mejora detección/anticipación pluvial o de acceso sin duplicar señal |
| JRC/DEM/margen | Exposición con incertidumbre frente a clase básica | Reduce falsas alarmas sin introducir omisiones graves por altura o ubicación |
| Laguna | Distancia/altura relativa con cobertura frente a no usar ese proxy | Aporta información más allá de lluvia y ubicación |
| Cruce crítico | Evidencia de cuello de botella frente a mínimo de píxeles | Recupera interrupciones reales sin multiplicar falsos positivos de muestreo |
| Alternativas | Redundancia pertinente y verificada frente a desconocida | Reduce prioridad sólo donde mejora resultado observado |
| Tendencia de río | Nivel + variación frente a sólo umbral | Aporta tiempo útil de anticipación y estabilidad, sin extrapolación inválida |

**Archivos:** adapters de historial/susceptibilidad, evaluadores, módulos geo-static relacionados y corpus de evaluación.

**Salida:** cada experimento termina en incorporar, mantener sólo como contexto o retirar del cálculo, con evidencia. No se exige incorporarlos todos. No agregar un peso manual nuevo por cada variable disponible.

### B7 — Validar en conjunto, promover y retirar inconsistencias

**Objetivo:** operar un resultado único, medido y reversible.

**Trabajo:**

1. Ejecutar replay y comparación prospectiva con datos idénticos y corridas candidatas aisladas. Una duración de observación sin eventos útiles no basta para afirmar precisión.
2. Comparar situación reconocida y predicción anticipada por separado. Medir resultados por mecanismo y combinados, incluyendo escuelas sin cobertura y carga operativa.
3. Verificar contrato de extremo a extremo: API, lista, filtros, paginación, puntos, totales, detalle, admin, corte, export y briefing.
4. Corregir metodología y simuladores que replican la fórmula anterior; no permitir dos versiones visibles del significado de riesgo.
5. Promover mediante publicación atómica con manifiesto de reglas/insumos y compatibilidad de lectores. Recalcular si las fuentes se vencieron desde la validación.
6. Conservar reversión al resultado operativo anterior sin eliminar partes ni evidencia nueva. La coherencia de situación reportada entregada en B2 se mantiene aun si se revierte un predictor.
7. Retirar consultas, filtros y fórmulas antiguas sólo tras comprobar que no quedan consumidores. Mantener snapshots históricos identificados con su modelo.
8. Registrar salud por fuente/mecanismo, cobertura por zona, motivos de abstención, latencia de publicación, cambios de prioridad, costo de ingesta y cola de verificación.

**Salida:** mejora demostrada o limitación declarada, invariantes cumplidos, ningún consumidor operativo usa silenciosamente el IRO anterior y la reversión está ensayada. Si no hay evidencia para promover un refinamiento, se mantiene el núcleo validado.

### B8 — Extensiones elegidas por los errores que permanezcan

**Objetivo:** añadir precisión donde se demuestre que falta información, sin ampliar todo el sistema a la vez.

| Error residual observado | Extensión candidata | Evidencia exigida |
|---|---|---|
| Alumnos aislados fuera de la ruta modelada | Relación curada escuela–comunidad–acceso y cortes viales oficiales | Recupera casos nuevos y mejora anticipación, con cobertura/actualización sostenible |
| Fallas pluviales pese a pronóstico correcto | Drenaje, humedad de suelo, relieve adecuado, lluvia de cuenca | Mejora por eventos retenidos, más allá de proxies existentes |
| Crecida no representada por estación asignada | Conectividad de cuenca, tributarios, remanso, propagación aguas arriba | Correspondencia física y desfases contrastados; no sólo correlación espacial |
| Daños por viento/granizo/calor no anticipados | Evaluador específico reutilizando el contrato común | Datos con unidades correctas, exposición pertinente y corpus de impacto suficiente |
| Cortes de agua/energía recurrentes | Motivos separados para nuevas cargas y fuentes confiables de servicio | Distingue afectación real y recuperación; no reinterpreta registros ambiguos antiguos |
| Duplicación de problemas en instituciones co-localizadas | Identidad física de sede curada y vínculos explícitos | Reduce duplicación sin propagar falsamente reportes o permisos |
| Necesidad de preparación estacional | Anomalías respecto de climatología válida | Valor para planificación regional, sin contaminar prioridad a 24 h |

No hay obligación de ejecutar todas las extensiones. Cada una debe explicar qué error corrige, qué dato nuevo requiere, quién lo mantiene, cuánto cuesta y cómo se retira si no mejora.

## 6. Cambios de datos y migración mínimos

| Área | Cambio mínimo | Compatibilidad |
|---|---|---|
| Corridas | Propósito, `asOf`/referencia de entradas y estado de candidato completo | Mantener único operativo vigente; candidatos fuera de selección pública |
| Snapshot | Evaluaciones versionadas, cobertura, razones y ventanas por mecanismo | Columnas antiguas legibles durante transición; no reescribir historia |
| Factores | Referencias a evidencia/regla y semántica de contribución cuando aplique | No generar sumas ficticias para explicar decisiones ordinales |
| Fuentes | Intervalo/ventana, disponibilidad, calidad y metadatos suficientes | Aprovechar columnas actuales; agregar únicamente faltantes necesarios |
| Catálogo/afectaciones | ID o código semántico estable para nuevas cargas, mapeo histórico explícito | Mantener nombre histórico y motivos personalizados |
| Geografía/estáticas | Identificador inmutable de versión usada y cobertura | Importar nueva versión sin alterar la que explica snapshots previos |
| Situación actual | Proyección a partir del dominio operativo | No duplicar partes, cierres ni verificaciones en nuevas tablas |
| Cortes | Congelar proyección y versiones al generar corte | Foto histórica distinta de lectura actual, con fechas visibles |

La decisión física entre JSON tipado y columnas de consulta se toma en B1 con las consultas reales. Recomendación inicial: detalles por mecanismo en un payload versionado del snapshot, campos necesarios para filtrar/ordenar expresados explícitamente cuando haga falta. Evitar un esquema genérico entidad–atributo–valor.

La prioridad actual incluye partes que pueden cambiar después del snapshot meteorológico. No persistirla como verdad definitiva dentro de ese snapshot: calcularla con la situación actual mediante el servicio compartido, o materializarla con invalidación comprobable. Para el volumen actual, comenzar con carga por lotes y medición antes de crear otro proceso de sincronización.

Orden de despliegue por cambio de esquema: expansión compatible → escritor candidato → lectores compatibles → validación → activación → retiro posterior. Nunca activar un lector nuevo antes de disponer de datos y semántica compatibles.

## 7. Parámetros actuales: conservar, retirar o recalibrar

| Parámetro actual | Decisión propuesta |
|---|---|
| Amenaza 0,5 celda + 0,3 caudal + 0,2 lluvia antecedente | Retirar del candidato: mezcla mecanismos y permite dilución |
| Vulnerabilidad 0,7 historial + 0,3 estática; riesgo = A×V/100 | Retirar como fórmula general: ausencia de historial no puede bloquear amenaza |
| Verde/amarillo/naranja/rojo → 0/33/66/100; niveles 25/50/75 | Conservar para interpretar legado; definir categorías nuevas por regla y validación, sin trasladar cortes automáticamente |
| Lluvia antecedente 150 mm como saturación 72 h | Retirar significado físico; estudiar proxy por ventana en B6 |
| Historial 365 d, topes 5 casos/720 h/3 accesos | Base de comparación, no constantes de verdad; deduplicar antes de recalibrar |
| Confianza según cantidad global de faltantes | Retirar; pertinencia, vigencia y calidad por mecanismo |
| Asociación de río a 40 km | No autoridad hidrológica; priorizar tramos aprobados y vínculos pertinentes |
| Provisionales lluvia 24 h: 50/80/120; 72 h: 80/120/180 mm | Candidatos explícitos sobre ventanas corregidas, a contrastar; no umbrales oficiales |
| 240 h = umbrales de 72 h × 1,5 | Retirar como justificación de impacto escolar; perspectiva con ventana explícita |
| Ensemble P99 ≥0,5 rojo; P95 ≥0,5 naranja; >0,1 amarillo | Documentar y contrastar con cobertura/calibración; fracción meteorológica no probabilidad escolar |
| IMERG cobertura mínima 0,8 | Mantener como punto de partida y mostrar huecos; probar sensibilidad para eventos intensos |
| Verificación radar QI ≥0,5, 39/48 gránulos, cobertura espacial ≥0,8 | Unificar significado con producción; verificar redondeo y ventanas antes de compartir implementación |
| PNA salud 120 min; pronóstico/ensemble 360 min; IMERG 60 min; SMN 60 min; seasonal 36 h | Son TTL de salud existentes, no política definitiva de evidencia. Separar medición, emisión y latencia propia |
| Reporte sin actualizar 72 h | Seguimiento, no auto-resolución; severidad puede justificar reconfirmación más temprana |
| Acceso base 0/20/45/70 +25 cruce +25 peligro +15 sin alternativa/+20 desconocida +15 historial | Reemplazar por regla condicional; desconocimiento afecta evidencia y verificación |
| JRC profundidad ≥0,15 m; RP10/100/500 | Mantener información original; evaluar clasificación local y resolución |
| Margen ≥0 como veto; profundidades iguales como `sin_riesgo` | Retirar como veto de riesgo escolar; conservar heurística identificada como tal |
| Ruta paso 90 m, mínimo 3 píxeles | Evaluar por longitud y puntos críticos; tres píxeles no garantizan continuidad ni cubren puentes cortos |
| Laguna: ocurrencia ≥25%, distancia ≤300 m, altura ≤6 m | Hipótesis territorial a contrastar, no criterio universal de inundabilidad |
| Proxy granizo: umbrales de precipitación/CAPE/LI/ráfaga/congelación y WMO | Mantener contexto etiquetado; no elevarlo a probabilidad de daño sin B8 |

No cambiar varios umbrales para compensar un error de unidades. Primero corregir la variable, después comparar políticas sobre la variable correcta.

## 8. Validación que decide si realmente mejora

### 8.1. Cuatro preguntas diferentes

| Pregunta | Medición |
|---|---|
| ¿Representamos lo que ya fue reportado? | Coherencia de situación, alcance, cierre, antigüedad y visibilidad |
| ¿Anticipamos eventos todavía no reportados? | Detección por horizonte y tiempo entre primera señal útil y comienzo del impacto |
| ¿Priorizamos las escuelas pertinentes? | Precisión con etiquetas suficientes, posición de casos graves y carga de verificación |
| ¿Sabemos dónde falla el sistema? | Cobertura efectiva, abstención, frescura y causas de fallo por zona/mecanismo |

No usar un parte como entrada de “pronóstico” y luego computarlo como acierto de anticipación. Evaluar predicción con información disponible **antes** del evento o de la fecha de decisión definida.

### 8.2. Métricas y denominadores

- Sensibilidad de casos graves conocidos sobre **todos** esos casos, incluyendo los que el motor dejó sin evaluar. Reportar además sensibilidad dentro de cobertura; nunca ocultar fallas absteniéndose.
- Precisión y falsas alarmas donde el resultado se haya verificado. Escuela alertada sin respuesta = resultado desconocido, no falso positivo.
- Anticipación por escuela/evento y porcentaje detectado antes de un plazo útil. El plazo operativo se documenta por acción; no basta con alertar minutos antes.
- Carga: escuelas nuevas por verificar, persistencia de alertas, solicitudes duplicadas, pendientes sin respuesta y tiempo de revisión.
- Cobertura por mecanismo, rural/urbano, isla, localidad, tamaño y calidad de georreferencia. Reportar grupos pequeños sin falsa precisión estadística.
- Estabilidad: cambios de nivel sin cambio relevante de evidencia, desacuerdo entre pantallas y pérdida de cobertura por fuente/cupo.
- Calidad meteorológica: sesgo, detección y falsas alarmas de precipitación; calibración probabilística cuando haya tamaño muestral suficiente. Separada del impacto escolar.

Particionar por eventos y bloques temporales/geográficos. No entrenar o ajustar con escuelas de la misma crecida que se usa como prueba independiente. Intervalos de incertidumbre y número de eventos acompañan cualquier porcentaje.

La verificación existente del radar usa agregados departamentales, una ventana de 14 días y mínimos de pares/eventos. Es un punto de partida para meteorología; esos mínimos no justifican por sí solos afirmar rendimiento provincial de impacto escolar.

### 8.3. Condiciones de promoción

Condiciones estructurales obligatorias:

1. Cero regresiones en los casos graves conocidos y correctamente representados por la evidencia disponible.
2. Ninguna afectación activa desaparece por una fuente externa ausente, perfil excluido o filtro del score antiguo.
3. Sin fuga temporal, doble conteo de fuentes derivadas ni conversiones inválidas de unidad/ventana.
4. Ninguna discrepancia semántica entre consumidores del mismo resultado y fecha.
5. Ejecución, publicación y reversión reproducibles; costos y fallos parciales observables.

Condiciones de utilidad, fijadas en B0 antes de ajustar contra el conjunto de prueba:

- Para corregir omisiones: mejora de detección o anticipación con carga operativa dentro del límite establecido para la capacidad real de verificación.
- Para reducir falsas alarmas: sensibilidad de casos graves no inferior dentro del margen predefinido y mejor discriminación demostrable.
- Para agregar una variable: mejora incremental frente al núcleo sin esa variable; si el beneficio es incierto, queda como contexto o en comparación.
- Si faltan etiquetas o eventos independientes, publicar sólo la mejora de coherencia demostrada y mantener la hipótesis predictiva en evaluación.

No se inventa aquí un objetivo como “95% de precisión”: todavía no existe en este análisis una base etiquetada ni una capacidad de respuesta medidas que lo justifiquen. B0 debe dejar esos valores registrados antes de la evaluación final, sin elegirlos después de ver el resultado.

### 8.4. Casos mínimos de aceptación

| Caso | Resultado esperado | Batch |
|---|---|---|
| INA entrega `main/p10/p90` para altura media semanal | Se conserva soporte semanal; no se presenta como distribución de pico diario | B1/B3 |
| Endpoint omite `qualifier` o devuelve límites sin probabilidad | No se inventan percentiles ni escenarios equiprobables | B1/B3 |
| Sin partes escolares, con ensemble y transferencia física disponibles | Se emite pronóstico probabilístico; la validación escolar pendiente queda identificada | B3/B5 |
| Miembros alcanzan umbrales en días distintos | Excedencia por ventana evaluada sobre trayectorias; no suma de probabilidades diarias | B3 |
| Google disponible hasta día 7 | Días 8–10 provienen de otro predictor con cobertura real o quedan sin cobertura; no se repite el día 7 | B3 |
| Parte evacuado, sin pronóstico ni perfil | Situación evacuada y atención; predicción sin cobertura | B2 |
| Inundación/evacuación preventiva sin origen identificado | Reconocer reporte sin inventar mecanismo físico | B2 |
| Alumnos aislados con edificio habitual | Afectación de alumnos/acceso visible; edificio conserva su estado | B2/B5 |
| Escuela funcionando como centro de evacuados | Uso como refugio y efecto educativo, sin deducir daño del edificio | B2 |
| Suspensión de una sección | Servicio parcial según reglas existentes; sin suspender las otras | B2 |
| Reporte sin actualizar supera 72 h | Reconfirmación pendiente; nunca resolución automática | B2 |
| Verificación sin afectación contradice parte abierto | Discrepancia visible hasta resolución explícita | B2 |
| Retirada por error frente a solucionada | Historia y estado diferenciados | B2 |
| PNA en evacuación + Aqueduct cero | Amenaza regional visible; graduación escolar según evidencia | B3 |
| PNA alta + lluvia local baja | Señal fluvial no disminuye por falta de lluvia | B3 |
| Río en bajante + acceso aún reportado cortado | Puede bajar amenaza; corte sigue activo | B2/B3/B5 |
| Lectura PNA inconsistente o vieja recién descargada | Sin certeza de estado actual; antecedente con fecha | B1/B3 |
| Punto de río cercano de otra cuenca | No transferencia automática de amenaza | B3 |
| 24 pasos de 5 mm, todos válidos | Acumulado 120 mm, ventana correcta | B1/B4 |
| 72 h con máximos diarios y total distintos | Ambos conservan semántica; umbrales compatibles | B4 |
| Corrida posterior a `asOf` | Excluida del replay | B1 |
| Reporte tardío de hecho anterior | Etiqueta posterior posible; no entrada conocida en el pasado | B0/B1 |
| Miembros incompletos o probabilidades diarias | Sin probabilidad multidiaria fabricada por suma | B4 |
| Alerta SMN cancelada/actualizada | Se respeta versión y vigencia conocidas | B4 |
| IMERG parcial/atrasado | Cobertura explícita, sin lluvia cero ficticia | B1/B4 |
| OSM 0 + ruta expuesta | La exposición participa; índice no veta | B5 |
| Puente corto dentro de un píxel | No descartado sólo por mínimo de tres píxeles | B5 |
| Alternativa desconocida | Incertidumbre/verificación; no daño mayor arbitrario | B5 |
| Isla sin red vial | Acceso vial sin cobertura; situación sigue evaluable | B2/B5 |
| Dos CUE en mismas coordenadas | No fusión ni propagación automática de afectación | B2 |
| Parte cambia después del run | Proyección actual se actualiza; corte anterior conserva foto | B2/B7 |
| Candidato termina mientras operativo está vigente | No cambia vista pública | B1/B7 |
| Falla una fuente o corrida nueva | Resultado anterior con validez explícita; nunca verde por defecto | B1/B7 |

Agregar propiedades de comportamiento: una amenaza mayor con el resto idéntico no reduce su evaluación; agregar historial duplicado no aumenta riesgo; un cambio de matrícula no elimina un caso grave; una fuente irrelevante ausente no degrada otro mecanismo; perder evidencia cambia conocimiento y no inventa recuperación.

## 9. Superficies que deben quedar alineadas

| Superficie | Trabajo necesario | Batch |
|---|---|---|
| `/api/infraestructura/riesgo` y detalle de snapshot | Resultado/versión, filtros y explicación compatibles | B1–B2/B7 |
| `/api/infraestructura/radar`, hooks y puntos de mapa | Prioridad y cobertura antes de limitar; diferencia visual entre bajo y desconocido | B2/B7 |
| Ficha territorial y detalle escolar | Situación, pronóstico por mecanismo, fuente, fecha y alcance | B2–B5 |
| Centro de Situación | Incluir reportes y acceso; no seleccionar sólo IRO alto/muy alto a 24 h | B2 |
| Corte y cambios entre cortes | Misma semántica, referencias de versión y fecha | B2/B7 |
| Admin riesgo y detalle | Retirar dependencia directa del score viejo; inspección de candidato identificada | B1/B7 |
| `components/mapas/metodologia/simuladores.ts` | Actualizar fórmula, ejemplos y limitaciones | B7 |
| Capas territoriales/planificación | Clase estática visible como exposición histórica, no predicción actual | B3/B5 |
| Radar meteorológico | Unidades, ventanas y variables categóricas; contexto regional distinguido | B1/B4 |
| Briefing y exportación de situación | Narrar la misma foto y no inventar observaciones | B2/B7 |
| Dataset de evaluación | Versiones, tiempo de conocimiento, cobertura y etiquetas independientes | B0/B7 |
| Salud operativa y scheduler | Cadencias coherentes, fuente vigente frente a job exitoso, candidato aislado | B1/B7 |

## 10. Entregable y cierre de cada batch

Cada batch se divide en cambios revisables por responsabilidad: contrato/datos, cálculo puro, integración y verificación. No mezclar en un mismo cambio una ingesta nueva, una recalibración y una reescritura de pantallas sin una razón concreta.

El paquete de cierre contiene:

1. Problema concreto y comportamiento antes/después.
2. Archivos, datos, contratos y consumidores modificados.
3. Pruebas de regresión pertinentes y resultados por evento/caso.
4. Comparación con base: detección, anticipación, discriminación, cobertura y carga; indicar qué no se pudo medir.
5. Versiones, parámetros y decisiones introducidos.
6. Ruta de activación/reversión y limitaciones conocidas.

**Definición de terminado del núcleo:** una escuela afectada no se oculta por el modelo; las amenazas no se diluyen entre mecanismos; cada señal se usa en su dominio, tiempo y unidad; las prioridades son coherentes en todo el producto; y las mejoras predictivas promovidas cuentan con evidencia de utilidad, no sólo con una fórmula más sofisticada.

## 11. Referencias principales de implementación

Rutas relativas al repositorio, revisadas para preparar el plan:

- `lib/infraestructura/riesgo/motor/{calculo,config,puertos,tipos,riesgo-acceso}.ts` y adapters de territorio, peligro, lluvia, historial, susceptibilidad, aislamiento y exposición.
- `lib/infraestructura/riesgo/peligro/{nivel,observado,umbrales-provisorios}.ts`.
- `lib/infraestructura/riesgo/providers/{ecmwf,flood,ensemble,imerg,seasonal,climatologia,climatologia-caudal,config-fuentes,cupo-om}.ts`.
- `lib/infraestructura/riesgo/{geo-perfil,rio-asociacion,puntos-rio,flags,cadencias,jobs-esperados,salud}.ts`, `jobs/calcular-riesgo.ts` y jobs de sincronización.
- `lib/infraestructura/hidrometria/{estaciones-prefectura,tramos-prefectura,lecturas-repo,sync-prefectura-alturas}.ts`.
- `lib/infraestructura/{motivos,servicio-educativo,verificaciones,umbrales,territorio-mapa,exposicion-ruta}.ts`.
- `lib/infraestructura/radar-meteo/{ensemble,escuela,granizo,smn-alertas,verificacion}.ts`.
- `lib/infraestructura/riesgo/situacion/{consulta,corte}.ts`, `riesgo/briefing.ts`, `dataset/export-desidentificado.ts`.
- `lib/db/schema.ts`, `lib/db/seed.ts`, `scripts/jobs.mjs`, `scripts/importar-geo-static.mjs`.
- `services/geo-static/src/geo_static/{physrisk_susceptibilidad,clase_inundacion_v2,margen_inundacion,proximidad_laguna,exposicion_ruta_v2,osm_aislamiento}.py` y jobs asociados.
- `services/geo-static/output/`: susceptibilidad v1, inundación v2, aislamiento OSM v4 y exposición de ruta v2 utilizados en los cruces de §2.

Las propuestas de reglas, prioridades y campos nuevos están identificadas como propuestas. Los números del inventario corresponden al código y artefactos locales citados; cualquier divergencia con producción se resuelve en B0 antes de implementar o evaluar sobre datos operativos.
