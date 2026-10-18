# Propuesta de revisión integral del modelo de riesgo escolar

Fecha: 14 de octubre de 2026. Estado: propuesta para discusión e implementación posterior.

**Universo provincial:** las 84 escuelas geolocalizadas de la exploración del Paraná son un subconjunto. La [viabilidad altimétrica ampliada](viabilidad-altimetria-provincial-2026-10-17.md) usa los 2.005 registros del padrón geográfico, 2.001 con coordenadas, y comprobó alturas IGN 30 m en esos 2.001 puntos. La recomendación de cobertura debe evaluarse sobre este universo completo.

**Actualización del 17/10/2026:** la [auditoría de producción y fuentes actuales del Paraná superior](auditoria-motor-inundacion-parana-2026-10-17.md) verificó la corrida `motor-v0.3`, el corredor Ituzaingó–Itatí–Paso de la Patria y la disponibilidad de nuevas fuentes. Las menciones siguientes al código `motor-v0.2` describen únicamente este checkout local.

**Objetivo precisado con el usuario:** predecir hasta diez días, antes del impacto, la probabilidad de agua dentro del edificio y de interrupción educativa por crecidas. El [diseño probabilístico fluvial](pronostico-probabilistico-fluvial-escuelas.md) pasa a ser la ruta principal: pronóstico del río, corrección por tramo y transferencia a edificio/accesos. **La fuente elegida por ahora es INA**, con respuestas A5 que conservan `main/p10/p90` para altura media semanal. Hay que resolver su transformación al evento diario/escolar; Open-Meteo Flood deja de ser la ruta propuesta. Los reportes escolares no son requisito de emisión; sirven para validar y mejorar el modelo y para reflejar situación actual. Google Cloud existe, pero el proyecto todavía no tiene acceso a la Flood Forecasting API.

**Recomendación central:** reconstruir la evaluación alrededor de los mecanismos que pueden afectar a una escuela y de la evidencia disponible. La afectación reportada, la amenaza prevista, la exposición del edificio y de su comunidad, y la prioridad de respuesta deben tener significado propio. Un único promedio multiplicado por el historial no alcanza para decidir qué escuelas necesitan atención.

El objetivo es detectar antes las situaciones reales, explicar por qué una escuela requiere atención y permitir bajar la prioridad cuando existe evidencia suficiente de recuperación o protección. La mejora debe cubrir tanto la inundación del establecimiento como el aislamiento de alumnos y docentes, los cortes de servicios y las consecuencias sobre la continuidad educativa.

## 1. Decisiones recomendadas

| Decisión | Beneficio esperado | Condición para aplicarla |
|---|---|---|
| Dar a los partes vigentes una vía directa hacia la situación operativa y la prioridad | Una afectación reportada deja de desaparecer cuando la amenaza modelada vale cero | Distinguir alcance, vigencia, procedencia y tipo de afectación |
| Evaluar por separado inundación fluvial, anegamiento pluvial, acceso y servicios; ampliar después a otras amenazas | Una señal grave deja de diluirse al promediarla con fenómenos tranquilos | Cada mecanismo debe tener entradas, reglas y limitaciones explícitas |
| Cubrir todas las escuelas de un ámbito fluvial asociado cuando hay alerta relevante | Resolver omisiones como las de Ituzaingó y Libres sin depender de una celda positiva | Diferenciar vigilancia territorial de afectación individual; refinar con conectividad hidráulica y evidencia local |
| Dejar de usar ausencia de antecedentes como evidencia de baja vulnerabilidad | Reducir el sesgo contra escuelas nuevas o que reportan poco | Registrar cobertura de reportes y características físicas verificadas |
| Corregir unidades, ventanas temporales y vigencia antes de recalibrar pesos | Evitar calibrar sobre entradas conceptualmente incorrectas | Contratos de datos comprobables de extremo a extremo |
| Incorporar comunidad y recorridos habituales a la evaluación del acceso | Detectar alumnos aislados aunque el edificio y su camino hacia la ciudad estén secos | Trabajar con zonas de origen y corredores; proteger datos personales |
| Separar confianza de gravedad y disponer de una cola de verificación | La incertidumbre genera una acción útil sin convertirse automáticamente en seguridad o desastre | Mostrar qué se desconoce y qué dato puede resolverlo |
| Validar con episodios y escuelas independientes de los usados para construir las reglas | Medir mejora real y efectos adversos | Conjunto de referencia revisado, archivo temporal y comparación en sombra |

**Orden actualizado:** integridad y archivo de pronósticos → distribución futura del río y calibración hidrológica → transferencia a edificio/accesos → evaluación de impacto escolar. La coherencia de partes puede avanzar en paralelo. La falta de reportes actuales no detiene el pronóstico; los porcentajes deben salir de distribuciones y relaciones físicas explícitas, con calibración declarada.

## 2. Alcance y calidad de la evidencia

Esta revisión original toma como autoridad el checkout `GeronimoSerial/tramos-referencia`, commit `078ded438fab6987a3235cf3dd277335b76f19ea`. El motor local declara `motor-v0.2`. La sesión anterior describió una corrida de producción `motor-v0.3` del 14/10/2026 a las 12:31 UTC. La revisión original no volvió a consultar producción; la [auditoría posterior del 17/10](auditoria-motor-inundacion-parana-2026-10-17.md) sí lo hizo y prevalece para describir el estado productivo actual.

En este checkout existen la ingesta de Prefectura y los tramos aprobados, pero el núcleo inspeccionado no los consume. El archivo de tramos declara expresamente que todavía no está conectado al motor ni al mapa. Por eso se distinguen:

- **Comportamiento comprobado localmente:** lectura de código y verificaciones controladas sobre el checkout indicado.
- **Evidencia de la sesión anterior:** resultados y casos descritos allí, que requieren reconciliarse con la versión desplegada antes de implementar.
- **Propuesta:** decisiones de producto, reglas y capacidades que todavía deben diseñarse, calibrarse o validarse.

La propuesta no cambia el motor, sus parámetros ni los datos operativos. Tampoco certifica la situación actual de las escuelas citadas.

### Casos que motivan la revisión

| Caso | Evidencia disponible en la conversación previa | Qué debe resolver el nuevo modelo |
|---|---|---|
| Ituzaingó | Se informó estación a 4,41 m frente a evacuación a 4 m; 7 escuelas en alto y 22 en bajo | Cobertura territorial y diferenciación individual explicable, sin veto por una celda estática vacía |
| Paso de los Libres | Se informó estación a 9,38 m frente a evacuación a 8 m; 4 escuelas en alto y 41 en bajo | La señal fluvial debe alcanzar a todo el ámbito asociado y generar verificación de las escuelas sin evidencia individual |
| Esc. 93, `1800402-00` | El usuario informó inundación; la sesión anterior encontró un parte `evacuado`, motivo «Evacuación preventiva», y riesgo bajo/0 | Mantener ambas evidencias con su procedencia; atender la situación reportada y resolver el alcance físico sin exigir coincidencia con el raster |
| Esc. 874 y 532, `1800862-00` y `1800646-00` | Alumnos que no pueden salir de sus casas, asociados al corredor de ruta 118 | Evaluar acceso desde los orígenes de los alumnos; no inferir que toda la ruta 118 está cortada ni que el edificio está inundado |
| Esc. 377, `1801532-00`, Isla Talar/Esquina | Se informó que dos familias iban a abandonar sus casas | Registrar amenaza o desplazamiento de la comunidad según su confirmación temporal, sin convertirlo automáticamente en evacuación del establecimiento |

La explicación anterior «un parte cubre los cuatro casos» necesita una condición: que cada hecho esté efectivamente registrado, vinculado al CUE correcto y vigente. La comunicación del usuario es evidencia para investigar; no garantiza que todos esos datos ya existan estructurados en la base.

## 3. Qué calcula hoy el sistema local

El núcleo de [cálculo](../lib/infraestructura/riesgo/motor/calculo.ts) combina tres señales de amenaza con pesos que se redistribuyen entre las disponibles:

```text
A = promedio ponderado de:
    peligro de lluvia por celda       peso 0,50
    peligro de caudal asociado        peso 0,30
    lluvia observada antecedente     peso 0,20

V = promedio ponderado de:
    historial de afectaciones        peso 0,70
    indicadores estáticos physrisk   peso 0,30

IRO = redondear(A × V / 100)
```

Los niveles son bajo `<25`, moderado `25–<50`, alto `50–<75`, muy alto `≥75`. Los colores de peligro se convierten en `0, 33, 66, 100`. Esos números son una escala de reglas; **no representan una probabilidad de inundación de la escuela**.

El historial promedia cantidad de afectaciones, duración acumulada y cantidad de accesos interrumpidos. Cada componente satura con topes de 5 afectaciones, 720 horas y 3 accesos interrumpidos, respectivamente, dentro de una ventana de 365 días. Se cuentan filas de afectación, no necesariamente episodios independientes.

La susceptibilidad promedia los valores disponibles de inundación fluvial, pluvial, viento y calor y limita el resultado a 100. El contrato supone valores normalizados, pero el adaptador entrega valores crudos. En el productor inspeccionado, el peligro pluvial queda sin dato y el dataset histórico de viento documenta falta de cobertura local.

El riesgo de acceso es otra regla: base `0/20/45/70` según aislamiento OSM, más agravantes por cruce, peligro alto, alternativa ausente o desconocida y antecedentes de acceso interrumpido. No modifica el IRO. La matrícula se conserva como exposición informativa; la urgencia de verificación todavía no tiene implementación en el núcleo.

Hay además capas distintas: planificación estática de inundación, radar meteorológico, alertas y contexto estacional. Su existencia en la aplicación no implica que todas alimenten el IRO. Los consumidores también importan: el top del Centro de Situación selecciona únicamente IRO alto/muy alto a 24 h y el radar ordena por ese score. Exponer amenaza y acceso por separado no garantiza que entren en la prioridad operativa.

## 4. Problemas encontrados y sus consecuencias

### 4.1. Una señal fuerte puede desaparecer por construcción

Ejemplos aritméticos de la fórmula local, sin afirmar que correspondan a una escuela real:

| Entradas | Resultado | Problema |
|---|---|---|
| Amenaza 100, historial 0 y susceptibilidad ausente | Vulnerabilidad 0; IRO 0 | Falta de antecedentes se convierte en protección absoluta |
| Amenaza 100, historial 0 y susceptibilidad normalizada 100 | Vulnerabilidad 30; IRO 30, moderado | Una escuela sin historial no puede llegar a alto por ese camino, incluso con amenaza máxima |
| Caudal rojo 100, celda verde 0 y lluvia observada 0, todos presentes | Amenaza 30; con vulnerabilidad 30, IRO 9 | La ausencia de lluvia local diluye una crecida que puede venir de aguas arriba |
| Solo caudal rojo disponible | Amenaza 100 | La misma crecida pesa más cuando faltan otros datos; el cambio de score puede ser disponibilidad, no cambio físico |
| Parte de inundación vigente, amenaza modelada 0 | IRO 0 aunque suba el historial | Un hecho reportado no logra activar la prioridad |

**Propuesta:** evaluar mecanismos por separado. La evidencia de inundación fluvial no debe diluirse con lluvia local baja; el acceso interrumpido debe activar su propia respuesta. Si se conserva el IRO durante la transición, debe quedar como indicador legado y no ser el único criterio para la cola operativa.

### 4.2. El historial mide también quién reporta

Una escuela con más conectividad, personal o seguimiento puede acumular más partes que otra igualmente vulnerable. Varias afectaciones del mismo episodio pueden inflar cantidad y duración; un corte de energía puede aumentar el índice que luego se presenta como riesgo de inundación. Una afectación antigua sin cierre puede acumular muchas horas. El corte de 365 días introduce saltos y puede excluir una afectación que comenzó antes pero sigue abierta.

El adaptador no utiliza el estado `evacuado` del establecimiento como señal directa; consume afectaciones asociadas. Tampoco diferencia en su score gravedad, personas alcanzadas o mecanismo causal.

**Propuesta:** separar antecedentes por mecanismo, agrupar episodios y solapamientos, registrar período efectivamente observado y distinguir «sin antecedentes durante seguimiento suficiente» de «sin información». El historial debe ajustar una susceptibilidad o una prioridad de revisión, nunca imponer vulnerabilidad cero.

### 4.3. Hay un problema de unidades, más amplio que «Kelvin»

El productor Python descarta `_unidades` y devuelve el valor del dataset. El adaptador TypeScript lo entrega al promedio sin normalización. Mezclar profundidad de inundación, una magnitud de viento y un indicador de calor como si fueran índices `0..1` carece de una interpretación común y puede saturar la vulnerabilidad.

La sesión anterior llamó a esto un bug de Kelvin. Esa explicación es insuficiente: la ruta de calor usada es `mean_degree_days_v2_above_32c...`, descrita como un indicador de grados-día sobre 32 °C en el [inventario oficial de physrisk](https://physrisk.readthedocs.io/en/latest/getting_started/hazard_inventory.html). **No corresponde proponer una resta automática de 273,15.** Primero hay que verificar metadatos y unidad del recurso exacto y después definir qué representa para el uso escolar.

**Propuesta:** conservar valor, unidad, variable, período, escenario y procedencia. Cada mecanismo debe tener su transformación explícita y versionada. El calor debe alimentar un módulo de calor; no elevar ni reducir el riesgo fluvial por compartir un promedio. Rechazar o poner en cuarentena entradas incompatibles, en lugar de ocultarlas mediante un límite a 100.

### 4.4. El pronóstico determinístico compara ventanas diferentes

El proveedor guarda valores horarios de precipitación y el lector de peligro elige una sola fila cercana a 24, 72 o 240 horas. Compara ese valor con climatología diaria o umbrales descritos como acumulados. La [documentación de Open-Meteo](https://open-meteo.com/en/docs/ecmwf-api) define `precipitation` horario como la suma de la hora precedente.

Una prueba controlada con 24 horas de 5 mm por hora, total 120 mm, devolvió `precipitacionMm = 5` y nivel verde frente a percentiles diarios 10/20/30. Se comprobó el comportamiento del lector; no es una medición meteorológica real.

**Propuesta:** definir ventanas explícitas: acumulado próximas 24 h, acumulado próximas 72 h, máximo acumulado móvil de 24 h dentro de esas 72 h e intensidades cortas cuando la fuente las permita. Cada variable debe compararse con umbrales de su misma duración. El horizonte de anticipación y la duración de la lluvia no son la misma cosa.

El ensemble actual usa ventanas de 24 h: la fila a 72 h no debe presentarse como un acumulado de 72 h. Para una probabilidad de excedencia en cualquier momento de una ventana, evaluar la trayectoria de cada miembro; no sumar probabilidades diarias ni asumir independencia. El caudal local actual se reutiliza en los tres horizontes, por lo que también debe separarse estado actual de evolución pronosticada.

### 4.5. «Más reciente» no asegura que un dato sea vigente

Se verificaron dos comportamientos adicionales en consultas controladas:

- Una consulta con referencia 26/09 tomó una corrida de ensemble emitida el 27/09. El camino de ensemble no aplica el filtro temporal que sí tienen otros lectores.
- Un pronóstico cuya validez terminaba el 27/09 siguió devolviendo nivel naranja al consultar el 14/10. La elección de la última corrida no exige frescura.

La lluvia observada ancla su ventana al último gránulo disponible, que puede estar atrasado. Su cobertura mínima de 80 % limita faltantes, pero no certifica actualidad ni garantiza que el 20 % faltante no contenga la parte intensa de la tormenta. El adaptador pierde el detalle de cobertura al entregar el acumulado al motor.

**Propuesta:** separar emisión de origen, recepción, intervalo representado, vencimiento y hora del cálculo. Exigir frescura por fuente y ventana válida para cada salida. Si falla la ingesta, mostrar último estado conocido con antigüedad y tarea de verificación; no publicar «normal» por vencimiento ni reciclar el pronóstico como actual.

El estado de un run `vigente` significa que es el último publicado: no garantiza que sus insumos sigan vigentes. Las APIs, rankings, KPIs y briefings deben aplicar la misma política temporal.

### 4.6. El backtest puede conocer el futuro sin usar una fecha futura del evento

Filtrar por `rigeDesde <= asOf` es necesario, pero insuficiente. Un parte cargado hoy con inicio retroactivo de ayer no era conocido ayer. El historial local no filtra por momento de registro; los adaptadores estáticos seleccionan la última versión disponible sin recibir `asOf`.

**Propuesta:** conservar dos tiempos: cuándo ocurrió o rigió el hecho y cuándo el sistema pudo conocerlo. El backtest operativo usa solo información disponible en ese momento. Una reconstrucción retrospectiva con datos corregidos puede existir, pero debe etiquetarse por separado. También deben versionarse padrón, geometrías, tramos, rasters y reglas utilizadas.

### 4.7. El filtro espacial puede omitir escuelas realmente afectadas

Según la sesión previa, producción `v0.3` condicionaba la señal de Prefectura a evidencia individual de Aqueduct v1. Una celda sin profundidad positiva no demuestra ausencia de inundación, de anegamiento ni de impacto en accesos. Las discontinuidades de raster pueden separar artificialmente escuelas vecinas.

La proximidad tampoco prueba exposición: dos escuelas cercanas pueden estar a distinta cota o conectadas a diferentes drenajes. El adaptador local de caudal usa proximidad dentro de 40 km y admite en sus comentarios que puede elegir otro curso de agua. Los tramos aprobados son una base mejor de asociación contextual, pero una localidad sigue siendo una unidad administrativa amplia.

**Propuesta:** cobertura territorial completa y refinamiento progresivo: tramo aprobado → barrio o zona hidráulicamente vinculada → edificio y corredores. Una escuela sin evidencia individual debe quedar en vigilancia/verificación del ámbito, no desaparecer. La evidencia local positiva debe poder prevalecer sobre un raster negativo. La pertenencia a una localidad no prueba por sí sola inundación del edificio.

### 4.8. Las capas estáticas v2 también contienen filtros que pueden ocultar casos

La clasificación local usa profundidades JRC de al menos 0,15 m para RP10/RP100/RP500; puede vetarlas mediante un margen de terreno. También interpreta profundidad positiva idéntica en los tres períodos como agua permanente y devuelve `sin_riesgo`.

El margen mezcla el percentil 10 de un DEM cerca de la escuela con cotas de agua y profundidades de otro modelo. Es una aproximación, no una superficie hidráulica observada. Copernicus GLO-30 es un modelo de superficie que incluye edificios y vegetación, según la [descripción oficial del producto](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM). Eso limita su uso como prueba de altura del suelo escolar.

La ruta v2 requiere al menos tres píxeles expuestos para asignar una clase. Ese filtro puede reducir ruido, pero un único puente o terraplén corto puede ser el punto que corta toda la conexión. Los píxeles sin dato se cuentan, aunque la clase puede resolverse con los que sí tienen dato.

**Propuesta:** revisar estas heurísticas contra positivos y negativos independientes. Tratar igualdad entre períodos como señal para comprobar el producto, no como demostración universal de seguridad. Evitar usar DEM o longitud mínima como veto de evidencia de campo. Separar «sin exposición detectada por este producto», «fuera de cobertura» y «sin riesgo»; esta última etiqueta expresa más certeza de la que el producto permite.

### 4.9. El acceso modelado no representa todos los desplazamientos escolares

El aislamiento OSM describe conectividad de rutas seleccionadas hacia destinos territoriales; no todos los viajes hogar–escuela. Una escuela puede tener salida pavimentada y, al mismo tiempo, alumnos atrapados en un barrio o paraje.

La regla de acceso retorna desconocido inmediatamente si falta OSM, incluso con antecedentes de acceso interrumpido. Con OSM presente, un antecedente suma 15 sin distinguir acceso todavía cortado de corte resuelto hace meses. Una alternativa desconocida suma 20, más que la ausencia confirmada de alternativa, que suma 15. Esa cautela intenta evitar falsos seguros, pero mezcla incertidumbre con gravedad.

**Propuesta:** acceso observado independiente de OSM, rutas por grupo de origen y distinción entre exposición del camino, transitabilidad actual y continuidad del viaje completo. Incertidumbre debe aumentar la necesidad de verificar; no debe convertir por definición lo desconocido en físicamente peor que lo confirmado.

### 4.10. La confianza actual mide disponibilidad de forma demasiado gruesa

El núcleo cuenta componentes faltantes: no evalúa adecuación espacial, antigüedad, calidad de coordenadas, tamaño efectivo del ensemble o contradicción entre fuentes. Penaliza ausencia de caudal incluso cuando podría no ser pertinente para el mecanismo de una escuela. El acceso puede tener confianza alta por conteos OSM completos aunque no haya información suficiente sobre el evento.

**Propuesta:** confianza por mecanismo y por afirmación, con razones visibles: cobertura, frescura, calidad espacial, consistencia, suficiencia y validación local. Varias fuentes derivadas del mismo modelo no equivalen a varias observaciones independientes. Una evidencia grave de baja confianza requiere verificación prioritaria; su score no debe simplemente multiplicarse por la confianza hasta desaparecer.

### 4.11. Otras capas pueden comunicar más certeza que la disponible

El contexto estacional calcula `probabilidadSobreNormal` respecto del miembro de control del ensemble, no de una climatología estacional. Superar ese miembro no equivale a superar lo normal. Debe renombrarse o implementarse una referencia climatológica apropiada antes de usarlo para planificación cuantitativa.

La ficha meteorológica por escuela suma los valores disponibles por día; un día sin valores puede terminar en cero. Además aplica la misma interpolación a `weather_code`, que es categórico. Son puntos de coherencia a revisar para que la ficha, el radar y el motor no den mensajes incompatibles.

**Propuesta:** una semántica compartida de variable, ventana, fuente, cobertura y ausencia. El contexto estacional sirve para preparación regional; no debe activar por sí solo una alerta individual. La interpolación visual tampoco convierte un pronóstico de grilla en una medición en el establecimiento.

### 4.12. El conjunto de evaluación aún no prueba riesgo por escuela

El conjunto existente tiene siete positivos declarados, un negativo y dos casos bajo umbral, principalmente territoriales. Su comentario excluye medidas preventivas sin impacto, pero conserva descripciones de cierre preventivo de puerto, apertura de compuertas y nivel sobre alerta como positivos. Esto requiere revisar etiquetas antes de medir desempeño: un disparador hidrológico y una afectación escolar son objetivos distintos.

La función denominada precisión mide eventos publicados respaldados sobre publicados. Es útil para procedencia, pero no sustituye la precisión de una predicción de impacto escolar. Además, reconocer un evento de localidad no demuestra haber identificado las escuelas afectadas dentro de ella.

**Propuesta:** separar evaluación de detección territorial, impacto escolar, incorporación de partes y anticipación. Una localidad sin noticia no es un negativo; una prevención que evitó daño tampoco debe contarse automáticamente como falsa alarma.

## 5. Modelo causal: qué puede provocar qué

La organización por amenaza, exposición, vulnerabilidad y capacidad sigue el marco conceptual de [UNDRR](https://www.undrr.org/terminology/disaster-risk). Ese marco no obliga a multiplicar los índices actuales ni valida sus pesos. Las siguientes relaciones son hipótesis de diseño que deben contrastarse con evidencia local.

| Cadena causal | Qué aumenta el peligro o el impacto | Qué puede reducirlo | Condición o límite |
|---|---|---|---|
| Lluvia intensa → escorrentía → anegamiento del predio | Intensidad corta alta, suelo saturado, baja infiltración, drenaje obstruido, zonas bajas | Drenaje operativo, mantenimiento, cotas de piso adecuadas | Pocos mm diarios pueden ocultar un pico intenso; una obra debe verificarse |
| Lluvia acumulada → saturación → caminos intransitables | Varios días húmedos, suelo débil, tránsito pesado, tramos sin pavimento | Mejoramiento del camino, drenaje, recorrido alternativo útil | La interrupción puede persistir después de terminar la lluvia |
| Crecida aguas arriba → aumento de nivel local → desborde | Aportes de cuenca, maniobras hidráulicas, remanso, persistencia | Capacidad hidráulica y protecciones verificadas | Puede ocurrir sin lluvia local; el tiempo de propagación debe calibrarse |
| Río alto + lluvia local → drenaje impedido → anegamiento | Desagües que descargan al río, bombeo insuficiente | Compuertas y bombeo operativos, almacenamiento temporal | La combinación puede agravar más que cada señal aislada; no basta un promedio |
| Agua sobre un tramo crítico → desconexión de un corredor | Puente/vado único, alcantarilla obstruida, terraplén vulnerable | Alternativa realmente transitable y accesible para usuarios reales | Pocos metros pueden cortar kilómetros de recorrido |
| Hogares o barrios anegados → alumnos no llegan | Única salida, movilidad reducida, falta de transporte | Salida segura y transporte disponible | Edificio escolar seco no elimina esta afectación |
| Aislamiento → demoras de asistencia y suministros | Distancia, comunicaciones deficientes, acceso único | Comunicaciones redundantes, provisiones, respuesta cercana | La infraestructura de apoyo puede fallar durante el mismo evento |
| Tormenta/viento → daños o caída de árboles/postes → interrupción | Cubiertas vulnerables, arbolado riesgoso, redes expuestas | Mantenimiento y protección comprobados | Debe evaluarse con variables propias, no con susceptibilidad fluvial |
| Corte de energía → falla de bomba/comunicación → consecuencias adicionales | Dependencia eléctrica de agua o drenaje | Respaldo probado y autonomía suficiente | Tener generador sin combustible ni mantenimiento no acredita capacidad |
| Calor + falla de agua/energía → afectación de condiciones escolares | Duración, exposición térmica, poca ventilación | Agua segura, sombra, ventilación y medidas operativas | Requiere módulo y umbrales propios; no reutilizar el indicador crónico como temperatura actual |
| Evacuación o suspensión preventiva → menor exposición presencial | Reduce personas expuestas en el lugar, si se ejecuta eficazmente | Protección y continuidad alternativa | Puede reducir riesgo para personas mientras mantiene alta la necesidad de asistencia y el riesgo material |
| Escuela como centro de evacuados → mayor demanda y ocupación | Más personas, carga sanitaria, necesidad de recursos | Capacidad de alojamiento y servicios verificados | `centro_evacuados` no significa que la propia escuela esté inundada |
| Descenso del agua → recuperación parcial | Barro, daños eléctricos, contaminación, deterioro del acceso | Inspección y rehabilitación verificadas | Bajar el río no equivale a recuperar automáticamente el servicio |

También hay riesgos de efecto en cadena organizativo: un corte compartido puede afectar muchas escuelas; una evacuación puede trasladar alumnos a una escuela con capacidad limitada; una pérdida de comunicaciones puede reducir reportes justo cuando aumenta la afectación. El sistema debe reconocer estas dependencias y evitar interpretar el silencio como mejoría.

## 6. Qué salidas debería producir el modelo

Se propone una evaluación por escuela con cuatro resultados relacionados, cada uno con fecha y evidencia:

| Resultado | Pregunta que responde | Ejemplo |
|---|---|---|
| Situación reportada/observada | ¿Qué sabemos que está ocurriendo o que se está ejecutando? | Acceso de 18 alumnos interrumpido, reportado por la escuela |
| Amenaza prevista por mecanismo | ¿Qué fenómeno podría afectar y en qué ventana? | Crecida fluvial relevante para el tramo durante las próximas 24 h |
| Consecuencia por ámbito | ¿Puede afectar edificio, acceso, comunidad o servicios? | Edificio sin afectación confirmada; origen de alumnos anegado |
| Prioridad de respuesta y verificación | ¿Qué acción requiere atención primero? | Contactar, confirmar alcance y coordinar continuidad |

Los estados propuestos para situación son: **sin afectación reportada, afectación reportada, afectación corroborada, recuperación y situación desconocida**. «Sin afectación reportada» no implica que se haya inspeccionado ni que el pronóstico sea bajo. Para medidas preventivas, conservar un tipo propio de acción; para amenazas futuras, un estado previsto.

Los niveles de pronóstico deben conservar una escala ordinal y explicar su base. Hasta calibrar probabilidades contra resultados escolares, no mostrar «70 % de riesgo» a partir de un score 70. El producto debería reservar «probabilidad» para una cantidad estadística cuyo evento, ventana y método estén definidos.

La prioridad puede usar bandas de acción, por ejemplo atención inmediata, preparación prioritaria, vigilancia y seguimiento rutinario, más una cola transversal de verificación. Los nombres y tiempos de respuesta deben acordarse con operación. El sistema recomienda atención y aporta evidencia; una lectura de estación no debe emitir por sí sola una orden de evacuación de una escuela.

### Regla de combinación propuesta

```text
1. Resolver situación vigente y alcance de los reportes.
2. Para cada mecanismo, seleccionar evidencia válida y pertinente.
3. Estimar amenaza y consecuencias con reglas del mecanismo.
4. Aplicar interacciones justificadas y capacidades verificadas.
5. Conservar los resultados por ámbito y sus incertidumbres.
6. Priorizar por la consecuencia más urgente y la acción necesaria.
7. Explicar qué evidencia disparó, agravó, mitigó o limitó la conclusión.
```

Tomar la consecuencia más urgente evita que una emergencia de acceso se diluya con un edificio seco. No significa tomar el máximo indiscriminado de cualquier dato: primero se controla pertinencia, vigencia y procedencia. Los agravantes combinados deben tener una justificación causal, para evitar contar tres veces una misma lluvia en pronóstico, caudal modelado y satélite.

## 7. Partes vigentes: reglas concretas propuestas

| Evidencia | Tratamiento propuesto | Inferencia que debe evitarse |
|---|---|---|
| Inundación del establecimiento reportada y vigente | Situación activa del edificio y prioridad correspondiente, aunque el modelo meteorológico sea bajo | Exigir Aqueduct positivo para aceptarla o llamar «corroborado» a todo reporte sin registrar su grado de verificación |
| Estado `evacuado` con motivo preventivo | Mostrar evacuación ejecutada o estado reportado y necesidad de seguimiento; conservar motivo | Afirmar que hubo agua dentro del edificio |
| Alumnos con acceso interrumpido o anegamiento | Activar ámbito comunidad/acceso y cuantificar alcance si existe | Marcar automáticamente toda la escuela como inundada |
| Docentes sin acceso | Evaluar continuidad del servicio según personal y turnos afectados | Equiparar un docente afectado a cierre total sin más datos |
| Estado `centro_evacuados` | Activar demanda de capacidad, recursos y seguimiento | Interpretar que la escuela está evacuada o dañada |
| Reporte próximo a vencer o sin reconfirmación | Mantener último estado y pedir actualización; degradar certeza sobre actualidad | Resolverlo automáticamente como normal |
| Cierre de una afectación | Retirar esa señal activa desde su cierre y conservar el antecedente | Dar por resueltas otras afectaciones del mismo CUE |
| Reportes contradictorios | Mostrar conflicto y resolver por alcance, tiempos y procedencia | Sobrescribir silenciosamente el más grave o elegir siempre el peor para siempre |
| Texto libre o noticia ambigua | Crear candidato revisable con su fuente | Convertir una extracción automática en hecho corroborado |

Usar el intervalo `[rigeDesde, retiradaEn)` para la vigencia. Para una consulta histórica operativa, agregar el requisito de que el dato ya hubiera sido registrado. Reutilizar la lógica temporal existente y registrar revisiones; no inventar otra definición de vigente dentro del motor.

Los partes deben producir una actualización visible sin esperar a la próxima corrida meteorológica completa. Se propone actualizar primero la situación y encolar un recálculo de la escuela o del grupo afectado. En envíos offline, diferenciar hora del hecho, hora del envío y hora de recepción; evitar duplicados por reintento.

Los motivos deberían adquirir identificadores semánticos estables. Hoy «Acceso interrumpido» se reconoce por igualdad de texto: cambios de nombre o variantes pueden romper la detección. Mantener el texto histórico y una correspondencia versionada con el mecanismo.

## 8. Cobertura fluvial: resolver omisiones con graduación de evidencia

La propuesta de «dar riesgo a toda la localidad» resuelve parte del problema de cobertura, pero requiere una salida que indique qué significa esa cobertura.

| Situación de estación y vínculo | Escuela sin evidencia individual | Escuela con evidencia individual pertinente |
|---|---|---|
| Bajo alerta, sin otro indicio | Evaluar otros mecanismos; no inferir seguridad general | Mantener exposición estructural y atender cualquier reporte vigente |
| Alerta en tramo aprobado | Vigilancia territorial visible y verificación dirigida | Elevar preparación según edificio, camino, comunidad y tendencia |
| Umbral de evacuación en tramo aprobado | Incluir en preparación/verificación prioritaria del ámbito; mostrar incertidumbre individual | Prioridad mayor cuando hay exposición o afectación compatible; explicar el motivo |
| Sin estación o vínculo confiable | Cobertura fluvial desconocida; recurrir a otras evidencias | El reporte o el corte confirmado siguen teniendo efecto propio |
| Observación vencida | Mostrar último estado y antigüedad | Conservar evidencia individual vigente y pedir actualización hidrológica |

Esta matriz es una propuesta ordinal, no una calibración de pisos numéricos. Antes de asignar 50, 75 o 100 hay que medir qué decisiones cambian y con qué tasa de error.

Para mejorar la asociación: usar tramos aprobados, normalizar localidades con departamento, mantener excepciones justificadas y documentar cobertura de islas y parajes. Después incorporar cuenca, conectividad y cotas verificadas. Revisar coordenadas de estaciones: el catálogo actual las marca como no verificadas en campo. No propagar riesgo entre escuelas solo por distancia ni usar la estación más cercana como sustituto universal de relación hidrológica.

Las alturas de escalas locales no se comparan directamente con cotas del terreno sin un datum compatible. El caudal tampoco equivale a altura ni a profundidad en el establecimiento: [GloFAS pronostica caudal](https://confluence.ecmwf.int/spaces/CEMS/pages/315563119/6%2BFAQ%2Bin%2BGloFAS), y convertirlo en inundación local requiere relaciones y geometrías adecuadas. Los umbrales de alerta/evacuación deben conservar estación, fuente y vigencia.

La tendencia importa: nivel cercano al umbral y subiendo puede requerir más preparación que el mismo nivel bajando. Sin embargo, un descenso aislado no resuelve accesos o daños. Proponer histéresis: escalamiento rápido con evidencia grave y desescalamiento con evidencia de mejora sostenida y verificación del ámbito afectado. La duración de esa confirmación debe calibrarse por fenómeno.

## 9. Acceso y comunidad: una segunda unidad territorial

El CUE sigue siendo la unidad de coordinación, pero el riesgo de acceso necesita una red de **orígenes → recorridos → escuela**. La salida a la cabecera o a la localidad más cercana es solo uno de esos recorridos.

Primera etapa: registrar parajes/barrios de origen, corredores habituales, pasos críticos, transporte y grupos alcanzados, sin exigir domicilios individuales. Asociar reportes de interrupción a un tramo o área con precisión declarada. Si solo se conoce el corredor general, mantener esa incertidumbre y dirigir la verificación.

Segunda etapa: incorporar cortes vigentes al grafo y recalcular conectividad. Una alternativa cuenta como mitigación si es utilizable por ese grupo: modo de transporte, distancia, tiempo, capacidad, horario y estado actual. Dos caminos que comparten el mismo puente no ofrecen redundancia ante la falla de ese puente. Los accesos fluviales de islas requieren embarcaderos, disponibilidad de embarcaciones y condiciones de navegación, no solo una red vial terrestre.

Distinguir dos tipos de evidencia sobre rutas: exposición extensa a inundación y falla de un punto crítico. El primero puede usar longitud o proporción expuesta; el segundo no debería exigir tres píxeles. Un corte confirmado en un paso necesario debe poder activar el riesgo aunque el raster de su entorno sea negativo o falte OSM.

El tablero debe mostrar personas o grupos afectados sin duplicarlos por tener varias causas simultáneas. La matrícula total es contexto y techo de exposición potencial, no número observado de afectados. Evitar mapas públicos de domicilios o detalles que identifiquen familias; usar acceso restringido y agregación según necesidad operativa.

## 10. Qué permite aumentar o reducir la evaluación

| Cambio | Efecto esperado | Evidencia necesaria |
|---|---|---|
| Aumenta lluvia o nivel de río pertinente | Aumenta la amenaza de ese mecanismo | Misma ventana, unidad, ubicación y fuente comparable |
| Aparece afectación vigente | Aumenta prioridad del ámbito afectado | Procedencia, tiempo y alcance identificados |
| Se confirma un corte crítico sin alternativa | Aumenta consecuencia de acceso | Ubicación y conectividad del corte; grupo dependiente |
| Se descubre vulnerabilidad de edificio o drenaje | Aumenta susceptibilidad pertinente | Relevamiento técnico con vigencia |
| Se confirma alternativa operativa | Reduce consecuencia de aislamiento | Alternativa independiente y usable bajo el evento |
| Se ejecuta evacuación preventiva efectiva | Puede reducir exposición presencial y daño a personas | Confirmación de ejecución y destino; no elimina necesidad de asistencia |
| Se repara una defensa o drenaje | Puede reducir consecuencias bajo ciertos escenarios | Obra verificada, capacidad de diseño y mantenimiento; riesgo residual explícito |
| Baja el río y se rehabilita el acceso | Permite reducir prioridad del acceso | Tendencia y transitabilidad verificadas, no solo una lectura |
| Se cierra un parte y no quedan afectaciones activas | Reduce situación activa; mantiene pronóstico independiente | Cierre válido y alcance completo |
| Deja de llegar una fuente o desaparece un reporte | Reduce confianza, no demuestra reducción física | Diagnóstico de cobertura y tarea de verificación |
| No hay antecedentes | No acredita protección | Distinguir seguimiento suficiente de ausencia de registro |
| Hay menos alumnos matriculados | Cambia cantidad potencialmente expuesta y logística | No vuelve segura una escuela ni debe excluirla de atención |
| Aparece nueva información de que el peligro no alcanza un área | Puede reducir la evaluación localizada | Evidencia pertinente y suficientemente confiable; conservar excepciones y otros mecanismos |

Las capacidades deben tener ámbito y límite: un piso elevado puede proteger aulas, pero no caminos; una ruta alternativa puede resolver viajes, pero no agua potable; un cierre puede reducir exposición de alumnos y aumentar necesidades de continuidad y alimentación. El sistema debe explicar esos efectos por separado.

## 11. Opciones de diseño y elección recomendada

| Opción | Ventajas | Riesgos y límites | Uso recomendado |
|---|---|---|---|
| Ajustar pesos y agregar pisos al IRO | Implementación relativamente pequeña; conserva contratos | Mantiene mezcla conceptual, sesgo de historial y precisión aparente; los pisos pueden propagarse mal | Solo contención transitoria, con trazabilidad |
| Reglas por mecanismo + situación y prioridad separadas | Explicable, permite corregir contradicciones y operar con datos incompletos | Requiere contratos nuevos y disciplina para evitar proliferación de reglas | **Base recomendada para la siguiente versión** |
| Modelo estadístico supervisado | Puede aprender relaciones y producir probabilidades calibradas | Etiquetas escasas/sesgadas, fuga temporal, cambio climático y de infraestructura, difícil extrapolación | Experimento posterior con validación por evento y región |
| Modelo hidráulico local + red de movilidad | Mayor detalle físico en áreas prioritarias | Datos topográficos, calibración, mantenimiento y costo; no cubre por sí solo reportes ni comunidad | Complemento selectivo en zonas con exposición y recurrencia altas |

Una combinación gradual es razonable: reglas explicables primero, modelos físicos donde aportan información comprobable y modelos estadísticos cuando exista una base de validación suficiente. Ninguna alternativa elimina la necesidad de reportes, control de vigencia y comunicación de incertidumbre.

## 12. Datos e integraciones: valor y costo de cada mejora

| Incorporación | Qué aportaría | Dependencias y riesgos |
|---|---|---|
| Partes estructurados y verificaciones | Afectación actual y recuperación | Cobertura desigual, duplicados, retroactividad, reportes sin cierre |
| Prefectura por tramo + tendencia | Señal fluvial local y seguimiento | Vínculo territorial, frescura, datum, faltantes y cambios de formato |
| Avisos de INA/EBY/CARU/CTM | Perspectiva de cuenca y operación hidráulica | Canal, licencia, emisión y vigencia por verificar; no asumir que un aviso implica daño escolar |
| Pluviómetros y observaciones locales | Contraste con estimaciones de lluvia | Control de calidad, continuidad, representatividad espacial y acceso a datos |
| Lluvia satelital | Cobertura espacial complementaria | Latencia, sesgo, faltantes; ausencia de medición no equivale a cero |
| Humedad de suelo y drenaje | Mejor contexto para anegamiento y caminos | Resolución, pertinencia local y actualización |
| Cortes de vialidad y transporte | Transitabilidad de corredores | Precisión del tramo, vigencia, alcance por modo de transporte |
| Imágenes de extensión de agua | Evidencia espacial adicional durante un evento | Tiempo de adquisición, resolución y errores de clasificación; una imagen sin detección no descarta todo impacto |
| Relevamiento de edificio y capacidades | Vulnerabilidad y mitigaciones específicas | Costo de campo, actualización, documentación técnica |

Los informes locales de [avisos hidrológicos](fuentes/f2-avisos-hidrologicos.md) y [lluvia en superficie](fuentes/f3-lluvia-superficie.md) son antecedentes de investigación, con limitaciones expresas. No prueban disponibilidad operativa actual de todos esos canales. Conviene verificar primero cobertura y calidad con una muestra antes de construir una integración completa.

## 13. Arquitectura y operación propuestas

Conservar el núcleo puro, los adaptadores por fuente, el cálculo determinista y la publicación atómica existentes. Extenderlos con contratos que transporten la evidencia necesaria para explicar decisiones y reconstruirlas.

Cada evidencia debería incluir identidad, fuente original, mecanismo, ámbito territorial, valor/unidad o tipo de hecho, intervalo de validez, fecha de emisión, fecha de recepción, procedencia real/prueba, calidad y relaciones con otras evidencias. Cada evaluación debería guardar versión del motor y de reglas, referencias a entradas, resultado por mecanismo, situación, prioridad, confianza y motivo de los cambios.

La explicación ya no puede limitarse a «sumar contribuciones»: debe mostrar reglas disparadas, pisos operativos, interacciones y mitigaciones. Registrar qué dato pudo reducir una conclusión y por qué, especialmente ante evidencia contradictoria.

Proponer recálculo por eventos para partes y cortes; por estación/tramo para hidrometría; y por lote para pronósticos. Congelar un corte de entradas consistente por corrida: la memoización actual evita lecturas repetidas, pero no garantiza que fuentes actualizadas durante un lote pertenezcan al mismo instante de conocimiento.

Mantener una publicación completa y coherente. El universo debe partir del padrón escolar, con estado explícito para escuelas sin coordenadas o sin perfil. Un parte no necesita que exista geometría para aparecer en la atención operativa. La completitud del job debe medir tanto escuelas procesadas como evidencia vigente por mecanismo y territorio.

Supervisar frescura, cobertura, fuentes constantes, unidades fuera de dominio, variaciones anómalas en distribución y escuelas excluidas. Una corrida exitosa no implica que haya datos útiles. Conservar el último resultado y su antigüedad durante una falla, sin ocultar la degradación.

Unificar el contrato que consumen mapa, radar, ficha, lista priorizada, Centro de Situación y briefing. Una escuela con acceso interrumpido debe poder entrar en prioridades aunque su IRO legado sea bajo. Las escuelas sin información deben aparecer en una cola de verificación, no quedar siempre al fondo por tener score nulo. Toda síntesis automática debe conservar procedencia y límites de las evidencias.

## 14. Validación: demostrar mejora y detectar daños secundarios

### Cuatro evaluaciones distintas

| Evaluación | Qué mide | Qué no demuestra |
|---|---|---|
| Coherencia operativa | Un parte vigente se refleja correctamente y con poca demora | Capacidad de anticipar el evento |
| Detección territorial | Reconocer crecidas, tormentas o cortes relevantes en un ámbito | Identificar cada escuela afectada |
| Predicción por escuela y mecanismo | Anticipar consecuencias antes del primer reporte disponible | Exactitud en otros territorios o épocas sin evaluación |
| Recuperación | Retirar o reducir alertas cuando corresponde, sin cierre prematuro | Que el riesgo futuro haya desaparecido |

El conjunto territorial existente debe conservar su propósito y sus reglas de procedencia. Crear un conjunto separado de regresión operativa para los casos reportados por escuelas y un conjunto independiente de validación predictiva. Si un parte es entrada del sistema, reflejarlo correctamente es éxito operativo; no contarlo como acierto anticipatorio independiente.

Dividir los datos por episodio y período, y reservar zonas o cuencas para comprobar generalización. Escuelas vecinas durante la misma crecida no deben repartirse al azar entre entrenamiento y prueba: comparten señales. Revisar desempeño urbano/rural, islas, escuelas pequeñas, cobertura incompleta y mecanismos sin estación.

Medir sensibilidad de eventos graves, precisión por mecanismo, demora desde recepción y desde inicio cuando se conozca, anticipación respecto del primer impacto, alertas por escuela-semana, oscilaciones, tiempo hasta resolver, cobertura y carga diaria de verificación. Para probabilidades realmente definidas, agregar calibración; para reglas ordinales, no fingir una métrica probabilística.

Elegir umbrales según costos diferenciados de omitir y alertar: perder un caso grave pesa más que una verificación adicional, pero alertar toda la provincia permanentemente puede saturar la respuesta. Reportar resultados por grupo, con conteos e incertidumbre. Siete positivos territoriales no alcanzan para afirmar una tasa provincial de desempeño.

### Escenarios mínimos de aceptación

| Escenario | Comportamiento exigido |
|---|---|
| Parte vigente de inundación y pronóstico verde | Situación activa y prioridad coherente con el reporte |
| Evacuación preventiva sin inundación confirmada | Medida y seguimiento visibles; sin inventar daño material |
| Alumnos aislados con edificio seco | Afectación de comunidad/acceso y continuidad diferenciada |
| Escuela sin coordenadas con parte grave | Atención operativa disponible; limitación geográfica explícita |
| Río en alerta y raster individual negativo o ausente | Escuela incluida en vigilancia territorial; motivo individual visible |
| Lluvia local cero y crecida relevante aguas arriba | La señal fluvial no se diluye por el cero local |
| Un único puente crítico cortado | Se detecta desconexión aunque no haya tres píxeles expuestos |
| Alternativa existente pero inutilizable | No reduce la consecuencia |
| Reporte retirado, reemplazado o duplicado | Vigencia y deduplicación correctas, sin persistencia accidental |
| Parte cargado después con fecha retroactiva | No entra en un backtest anterior a su recepción |
| Ensemble emitido después de la referencia | No participa en la consulta histórica |
| Pronóstico o lectura vencidos | No se presentan como evidencia actual |
| 24 valores horarios de 5 mm | Acumulado de 120 mm en la ventana completa pertinente |
| Observación parcial o día meteorológico sin datos | Cobertura explícita; nunca cero por suma vacía |
| Historial vacío y amenaza fuerte | No se deduce vulnerabilidad nula |
| Cambio de unidad o indicador de calor | No altera indebidamente el mecanismo fluvial |
| Datos de prueba o demo | No alimentan operación ni validación real |
| Mejora del acceso con daños en edificio pendientes | Baja la dimensión resuelta; se mantiene la restante |

Agregar análisis de sensibilidad: retirar una fuente, desplazar coordenadas dentro de su incertidumbre, cambiar umbrales cercanos y simular cortes de ingesta. Una caída de cobertura no debe comunicarse como mejora física. Un aumento de amenaza pertinente no debe reducir la evaluación de ese mecanismo si todo lo demás permanece igual.

### Verificación realizada para esta propuesta

Pasaron 85 pruebas existentes de núcleo, acceso, peligro, observado e historial. Además, tres pruebas diagnósticas temporales reprodujeron la entrada de ensemble futuro, la selección de 5 mm frente a un acumulado de 120 mm y la devolución de nivel para un pronóstico vencido. Se ejecutaron con datos aislados de prueba; el archivo temporal fue retirado.

Que las pruebas existentes pasen acredita los comportamientos que hoy verifican. No valida la metodología ni descarta los problemas anteriores. Los escenarios de aceptación propuestos son requisitos para una implementación posterior, no mejoras ya entregadas.

## 15. Plan de implementación propuesto

| Etapa | Entrega concreta | Dependencia | Criterio para avanzar |
|---|---|---|---|
| 0. Reconciliar versiones y fijar referencia | Comparación del checkout con producción; inventario de reglas, fuentes, datos y salidas; casos reproducibles | Acceso de lectura al despliegue y a sus versiones | Poder explicar qué regla produjo cada caso citado |
| 1. Corregir integridad de entradas | Unidades, acumulados, ventanas, filtro temporal, frescura y cobertura; retirar mezcla entre calor e inundación | Contratos de cada fuente y diagnóstico del dato exacto | Pruebas de unidades/tiempo y comparación de distribución sin cambios silenciosos |
| 2. Resolver contradicciones operativas | Situación de partes y acceso observado con prioridad independiente del IRO; soporte sin geometría | Vigencia, procedencia y alcance de reportes | Ningún caso grave vigente queda invisible por amenaza cero o falta de OSM |
| 3. Ampliar cobertura fluvial | Tramos aprobados conectados, matriz de vigilancia y evidencia individual; tendencia y explicación | Etapas 0–1; revisión de asociaciones | Todas las escuelas del ámbito se evalúan; se miden omisiones y sobrealertas |
| 4. Separar mecanismos y consumidores | Evaluación fluvial/pluvial/acceso/servicios y contrato común para mapas, rankings y briefing | Etapas 1–3 | Ninguna dimensión grave se pierde en un promedio o filtro de UI |
| 5. Modelar corredores y comunidad | Zonas de origen, puntos críticos, cortes y alternativas utilizables | Relevamiento y datos territoriales | Se reproducen y resuelven los casos de ruta 118 e islas según evidencia real |
| 6. Calibrar y ampliar | Evaluación por eventos, capacidades verificadas, nuevas fuentes y pilotos físicos/estadísticos | Archivo suficiente y conjunto independiente | Mejora demostrada en detección, demora y carga operativa |

Las etapas 1 y 2 pueden prepararse en paralelo con contratos acordados, pero deben compararse por separado para saber qué cambió los resultados. No conviene corregir simultáneamente todas las fuentes, todos los pesos y todos los colores sin una línea de base.

Entregar cada etapa con versión nueva, ejemplos antes/después, reporte de cobertura y diferencias por escuela. Primero ejecutar en sombra; luego hacer una habilitación acotada con revisión operativa y posibilidad de volver a la versión previa. Conservar los reportes y el historial durante una reversión. La sustitución definitiva exige criterios acordados sobre omisiones graves, carga de verificación y consistencia de las pantallas.

## 16. Riesgos de la propia mejora

| Cambio propuesto | Efecto adverso posible | Cómo controlarlo |
|---|---|---|
| Ampliar cobertura por localidad/tramo | Muchas escuelas en vigilancia sin exposición individual | Separar contexto de afectación; priorizar verificación y refinar zonas; medir volumen |
| Dar prioridad a partes | Reportes erróneos, duplicados o desactualizados dominan la cola | Trazabilidad, deduplicación, revisión y reconfirmación; conservar discrepancias |
| Corregir la susceptibilidad saturada | Bajan scores legados aunque las condiciones no mejoraron | Mostrar cambio de versión y mantener situación/prioridad independiente; no venderlo como reducción de riesgo real |
| Corregir acumulados de lluvia | Aumentan niveles y alertas de golpe | Comparación en sombra y revisión de umbrales con la ventana correcta |
| Eliminar vetos de raster o DEM | Reaparecen positivos espurios de mapas globales | Graduar evidencia y confianza; validar sin volver a excluir automáticamente los casos reales |
| Tomar la consecuencia más urgente | Una señal ruidosa monopoliza atención | Control de pertinencia, vigencia y corroboración; distinguir respuesta y verificación |
| Usar más fuentes | Doble conteo, contradicciones, costo y fallas de ingesta | Identificar dependencias, fuente original y política de conflicto; presupuesto y monitoreo |
| Incorporar matrícula al orden | Escuelas grandes desplazan sistemáticamente a pequeñas o aisladas | Priorizar gravedad y urgencia primero; exposición como criterio adicional y control de equidad |
| Incorporar capacidades | Una protección desactualizada produce falsa tranquilidad | Fecha de verificación, alcance y vencimiento de cada capacidad |
| Entrenar con datos históricos | Sesgo hacia escuelas que reportan y fuga del futuro | Separación temporal/territorial, negativos verificados, cobertura de reportes y auditoría de entradas |
| Retirar alertas por falta de actualización | Cierre prematuro de emergencias | Estado desconocido y verificación; el silencio no equivale a recuperación |

## 17. Decisiones que deben quedar documentadas antes del despliegue

1. Qué acciones corresponden a cada banda de prioridad y quién puede confirmar resolución o modificar una asociación territorial.
2. Qué evidencia basta para situación reportada, corroborada, preventiva y prevista, y cómo se atienden sus conflictos.
3. Qué ventanas temporales usa cada mecanismo y cuándo un dato deja de ser utilizable para una afirmación actual.
4. Cómo se define y revisa el ámbito de cada estación, especialmente islas, parajes y límites entre localidades.
5. Qué costo de omisión y qué carga de verificaciones se aceptan por mecanismo; qué métricas bloquean una promoción.
6. Qué variables de edificio, capacidad y movilidad se pueden obtener y mantener con calidad suficiente.
7. Cómo migran APIs, fichas, rankings y briefings sin presentar indicadores de versiones distintas como comparables.

Estas decisiones permiten una mejora profunda y verificable. El primer éxito a exigir es concreto: que la evidencia vigente sobre una escuela y su comunidad tenga efecto operativo, que las amenazas relevantes alcancen a su ámbito y que cada aumento o reducción de prioridad pueda explicarse con datos pertinentes.

## 18. Referencias de implementación revisadas

| Tema | Archivos principales |
|---|---|
| Fórmula, pesos y salidas | [calculo.ts](../lib/infraestructura/riesgo/motor/calculo.ts), [config.ts](../lib/infraestructura/riesgo/motor/config.ts), [tipos.ts](../lib/infraestructura/riesgo/motor/tipos.ts), [puertos.ts](../lib/infraestructura/riesgo/motor/puertos.ts) |
| Partes y vigencia | [historial.ts](../lib/infraestructura/riesgo/motor/adaptadores/historial.ts), [vigencia-alcance.ts](../lib/infraestructura/vigencia-alcance.ts), [motivos.ts](../lib/infraestructura/motivos.ts), [schema.ts](../lib/db/schema.ts) |
| Lluvia, caudal y tiempo | [nivel.ts](../lib/infraestructura/riesgo/peligro/nivel.ts), [observado.ts](../lib/infraestructura/riesgo/peligro/observado.ts), [ecmwf.ts](../lib/infraestructura/riesgo/providers/ecmwf.ts), [sync-pronostico-caudal.ts](../lib/infraestructura/riesgo/jobs/sync-pronostico-caudal.ts) |
| Susceptibilidad y unidades | [adaptador](../lib/infraestructura/riesgo/motor/adaptadores/susceptibilidad.ts), [productor physrisk](../services/geo-static/src/geo_static/physrisk_susceptibilidad.py) |
| Territorio fluvial | [territorio.ts](../lib/infraestructura/riesgo/motor/adaptadores/territorio.ts), [tramos-prefectura.ts](../lib/infraestructura/hidrometria/tramos-prefectura.ts), [estaciones-prefectura.ts](../lib/infraestructura/hidrometria/estaciones-prefectura.ts) |
| Inundación estática | [clase_inundacion_v2.py](../services/geo-static/src/geo_static/clase_inundacion_v2.py), [margen_inundacion.py](../services/geo-static/src/geo_static/margen_inundacion.py), [exposicion_ruta_v2.py](../services/geo-static/src/geo_static/exposicion_ruta_v2.py) |
| Accesos | [riesgo-acceso.ts](../lib/infraestructura/riesgo/motor/riesgo-acceso.ts), [osm_aislamiento.py](../services/geo-static/src/geo_static/osm_aislamiento.py) |
| Publicación y consumidores | [calcular-riesgo.ts](../lib/infraestructura/riesgo/jobs/calcular-riesgo.ts), [situacion/consulta.ts](../lib/infraestructura/riesgo/situacion/consulta.ts), [situacion/corte.ts](../lib/infraestructura/riesgo/situacion/corte.ts), [radar/route.ts](../app/api/infraestructura/radar/route.ts) |
| Capas complementarias | [planificacion.ts](../lib/infraestructura/mapa/planificacion.ts), [seasonal.ts](../lib/infraestructura/riesgo/providers/seasonal.ts), [radar-meteo/escuela.ts](../lib/infraestructura/radar-meteo/escuela.ts) |
| Evaluación | [conjunto-referencia.ts](../lib/infraestructura/evaluacion/conjunto-referencia.ts), [metricas.ts](../lib/infraestructura/evaluacion/metricas.ts) |

Las fuentes externas se enlazan junto a las afirmaciones que sustentan. Las reglas propuestas y las relaciones causales de aplicación escolar son recomendaciones de diseño, no umbrales oficiales ni resultados de una calibración ya realizada.
