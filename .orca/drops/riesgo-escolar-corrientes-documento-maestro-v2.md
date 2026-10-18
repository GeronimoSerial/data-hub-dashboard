# Documento maestro para iteración técnica y metodológica
## Sistema provincial de riesgo hidrometeorológico y continuidad educativa — Corrientes

**Versión:** documento maestro v2.0 (ampliación crítica de la propuesta técnica v1.0)  
**Fecha:** 14 de octubre de 2026  
**Estado:** documento de diseño e iteración; no constituye validación institucional, certificación de incidentes ni implementación  
**Base:** `propuesta-mejora-modelo-riesgo-escolar.md`, especificación técnica v1.0 y decisiones acordadas durante la revisión. Esta versión **conserva** contratos, reglas, batches y tests previos y **agrega** sus fundamentos, compensaciones, ejemplos, contraejemplos y cuestiones abiertas.

> **Precaución de alcance:** el documento de origen describe un checkout `GeronimoSerial/tramos-referencia`, commit `078ded438fab6987a3235cf3dd277335b76f19ea`, con núcleo `motor-v0.2`, y menciona una ejecución previa en producción `motor-v0.3`. No se auditan aquí ni producción ni el repositorio actual. Las anomalías allí documentadas son hipótesis de regresión a reconciliar en B0, no afirmaciones de que estén presentes hoy.

---


## Guía de lectura y cambios respecto de v1.0

**Para debatir el razonamiento:** secciones **0, 15, 16 y 20**.  
**Para revisar arquitectura y contratos:** secciones **3–8 y 18**.  
**Para ejecutar y validar por batches:** secciones **9–11, 17 y 19**.

Esta edición amplía la anterior en cinco dimensiones: **(a)** justificación de principios y alternativas rechazadas; **(b)** conflictos de cobertura, precisión, identidad física, reporte y jurisdicción; **(c)** semántica y casos límites para evidencia, inferencias, cierres y fallas; **(d)** episodios reales citados y escenarios sintéticos para pruebas; y **(e)** registro de decisiones, hipótesis y criterios para próximas iteraciones. Los diez batches **B0–B9**, las reglas, los contratos y los 26 tests existentes no se eliminaron.

**Orden de lectura sugerido para revisión conjunta:**

1. **Sección 0:** qué problema estamos resolviendo y por qué no alcanza con otro índice.
2. **Secciones 1–3:** decisiones confirmadas, entidades físicas/administrativas y arquitectura.
3. **Secciones 4–8:** contratos, motor de decisiones, permisos, servicios y políticas de tiempo/espacio.
4. **Secciones 9–14:** ejecución por batches, QA, gates y riesgos.
5. **Secciones 15–21:** fundamentos explícitos, ADR, escenarios, validación, gobernanza y backlog de preguntas.

---

## 0. Propósito, criterio de diseño y método de lectura

### 0.1. Por qué no alcanza con un nuevo algoritmo

La propuesta nace de una falla de representación: un único valor de riesgo intenta contestar simultáneamente **qué fenómeno está ocurriendo**, **qué puede ocurrir**, **a quién afecta**, **qué se sabe con certeza**, **qué no se sabe** y **quién debe intervenir**. Esas preguntas poseen unidades, evidencia y responsabilidades distintas. Un promedio con pesos puede ocultar una crecida cuando no llueve localmente; multiplicarlo por antecedentes puede producir riesgo cero para una escuela sin reportes, y un ranking que depende exclusivamente de ese valor puede ocultar un parte grave.

Por eso la reforma no se limita a sustituir `IRO = A × V / 100`. Su objetivo es pasar de un *score meteorológico por escuela* a un **sistema de evidencia territorial e impactos educativos con circuitos predictivo y operativo independientes**. La capacidad de anticipar y la de gestionar afectaciones presentes son dos resultados de producto igualmente importantes, pero **se evalúan con métricas diferentes**.

**Pregunta principal del producto:** para una sede o establecimiento y un momento determinados, ¿qué afectaciones están reportadas o verificadas, qué consecuencias se prevén, con qué evidencia y límites, y qué acción corresponde a cada responsable?

**Criterio de utilidad:** una salida es buena cuando cambia una decisión de manera fundada —preparar, verificar, responder o seguir recuperando—; un color o número sin esa capacidad no es suficiente.

### 0.2. Qué es diagnóstico, qué es decisión y qué falta demostrar

Usar estas etiquetas en próximas iteraciones, issues, PR y documentación de reglas:

| Etiqueta | Significado | Ejemplo |
|---|---|---|
| **HALLAZGO LOCAL** | Comportamiento documentado y reproducido en el checkout de origen; verificar vigencia en el despliegue actual | Lectura horaria de 5 mm tomada como ventana completa; pronóstico vencido que conserva alerta |
| **ANTECEDENTE** | Caso referido previamente, no revalidado en esta revisión | Escuelas asociadas a Ituzaingó/Libres, casos ruta 118 |
| **DECISIÓN CONFIRMADA** | Restricción o prioridad seleccionada por el proyecto | Toda Corrientes; fuentes mayoritariamente remotas; asignación por jurisdicción; cierre manual |
| **RECOMENDACIÓN DE DISEÑO** | Solución propuesta sujeta a revisión técnica/institucional | Dos motores, eventos versionados, cuatro colas, asociación territorial gradual |
| **HIPÓTESIS A VALIDAR** | Relación plausible sin calibración local suficiente | Mayor anegamiento con suelo antecedentemente húmedo para determinadas características del terreno |
| **POLÍTICA POR APROBAR** | Regla que requiere autoridad institucional y parámetros concretos | Quién corrobora/cierra daños; tiempos de confirmación; escalamiento y carga de verificaciones |

Este documento **no** certifica incidentes actuales, precisión de pronósticos, disponibilidad contractual de fuentes externas ni competencias legales concretas. Las rutas relativas de código del diagnóstico original apuntan al repositorio de aquella revisión; revisar su vigencia en B0.

### 0.3. Restricciones confirmadas y sus consecuencias

| Restricción | Conflicto que introduce | Elección de arquitectura | Lo que NO se debe concluir |
|---|---|---|---|
| Predicción y gestión con idéntica importancia | Un solo ranking favorece solo lo que tiene score | Carriles independientes, acciones comunes, métricas separadas | Que una gestión correcta pruebe capacidad predictiva |
| Cobertura inicial de toda Corrientes | Una grilla provincial no describe cada predio con igual precisión | Padrón universal y cobertura diferenciada por mecanismo | Que cobertura del 100 % equivalga a predicción local precisa |
| Predominio de fuentes remotas | Pronóstico/satélite no verifican cortes o agua dentro de aulas | Inferencias graduadas, partes y verificación dirigida | Que ausencia de detección remota pruebe ausencia de afectación |
| Sedes compartidas y anexos | Una afectación puede impactar varias ofertas educativas | Identidades físicas y administrativas separadas, vínculo temporal | Que 3 CUE afectados impliquen 3 edificios inundados |
| Movilidad casi desconocida | Sin orígenes ni recorridos no se cuentan alumnos aislados | Fases de movilidad: contexto, red y trayectos reales | Que un camino cercano sea el itinerario de un estudiante |
| Capacidad central dedicada y varios niveles | Riesgo de cola central saturada y responsabilidad difusa | Asignación territorial automática, respaldo central, permisos por tipo | Que administración técnica autorice cierre institucional |
| Cierre siempre confirmado manualmente | Incidentes abiertos pueden acumularse con datos obsoletos | `lifecycle` separado de actualidad de confirmación | Que falta de actualización permita cerrar automáticamente |
| Pronóstico grave sin parte | Preparar sin declarar un hecho observado | Preparación priorizada por exposición + verificación cuando haga falta | Que el pronóstico confirme daños |
| Primero servicios y después otras amenazas | Dependencias pueden crear cascadas falsas | Módulo de servicio por ámbito y dependencia corroborada | Que tormenta implique corte eléctrico real |

### 0.4. Modelo de razonamiento que se utilizará

El vocabulario **amenaza → exposición → vulnerabilidad/capacidad → impacto potencial** explica consecuencias futuras. La **situación observada** tiene su propio circuito de partes y constataciones. La **incertidumbre** describe la calidad de cada afirmación, no reduce mecánicamente su gravedad. Las **acciones** dependen de impacto, ventana disponible, competencia institucional y posibilidad real de intervención.

```text
AMENAZA:       ¿qué fenómeno, magnitud, lugar y ventana?
EXPOSICIÓN:    ¿qué sede, camino, comunidad o servicio está en su ámbito?
SUSCEPTIBILIDAD: ¿qué hace probable o posible esa consecuencia?
CAPACIDAD:     ¿qué protección comprobada puede reducirla y hasta qué límite?
IMPACTO PREVISTO: ¿qué podría suceder, dónde y cuándo?
SITUACIÓN:     ¿qué pasó/se reportó, con qué verificación y vigencia?
ACCIÓN:        ¿qué habría que hacer, quién puede hacerlo y con qué prioridad?
CONFIANZA:     ¿cuál de esas afirmaciones es sólida y cuál es incierta?
```

**No presentar `riesgo=70` como `70 % de probabilidad`.** Las bandas actuales y futuras son ordinales hasta disponer de eventos, horizontes, muestra y validación suficientes para una probabilidad estadística calibrada.

### 0.5. Cinco salidas funcionales, no un indicador universal

1. **Amenazas:** resultado por mecanismo, región y ventana; sin inferir daño específico a partir de la señal bruta.
2. **Exposición y condiciones de vulnerabilidad:** contexto de la sede, rutas, comunidad y servicios, con precisión espacial y grado de verificación.
3. **Situación observada:** hechos reportados/corroborados, medidas preventivas, contradicciones, vigencia y recuperación.
4. **Impactos previstos:** consecuencias posibles por ámbito, horizonte y evidencia; no equivalen a daños observados.
5. **Decisiones:** respuestas, preparación, verificación y recuperación, con trazabilidad y responsable.

No es necesario asignar un escalar general a esas cinco dimensiones. Una escuela puede tener amenaza fluvial elevada, edificio sin exposición detectada, corte de energía corroborado y prioridad de verificar un camino; convertirlo en un promedio destruye esa semántica.

### 0.6. Cuatro colas que pueden coexistir

| Cola | Entrada típica | Acción representativa | Error a evitar |
|---|---|---|---|
| **Respuesta activa** | Impacto vigente reportado o corroborado | Coordinar atención, continuidad o asistencia | Exigir pronóstico positivo para actuar |
| **Preparación anticipada** | Impacto potencial relevante y exposición pertinente | Proteger equipos, contactar responsables, prever transporte | Tratar el pronóstico como incidente ya ocurrido |
| **Verificación prioritaria** | Evidencia grave o contradictoria con alcance insuficiente | Confirmar situación, ubicación o dependencia | Convertir incertidumbre en daño físico |
| **Recuperación y seguimiento** | Situación en resolución o con daños residuales | Revisar acceso/servicios y cierre autorizado | Suponer que bajante significa restablecimiento |

También existe vigilancia territorial de baja carga. Las colas no son excluyentes; **cada tarea debe tener un objetivo verificable**. Una interfaz puede mostrar una prioridad agregada para ordenar atención, pero la causa de la prioridad debe permanecer desglosada y no depender del máximo indiscriminado de datos ruidosos.

### 0.7. Prioridad por acción, no únicamente por gravedad

La urgencia para responder a un daño confirmado no siempre es la misma que la urgencia para evitar uno previsto. Considérese un caso A con acceso ya cortado y un caso B cuyo único camino podría volverse intransitable en ocho horas: diferentes operadores necesitan diferentes colas. Por eso la prioridad debe considerar:

- Gravedad y ámbito de consecuencia **observada** o **potencial**.
- Ventana de anticipación y **tiempo útil para actuar**.
- Existencia de medidas factibles y competencia para ejecutarlas.
- Exposición de personas y continuidad educativa **sin excluir escuelas pequeñas**.
- Calidad de evidencia y necesidad de verificación (cola independiente).
- Capacidad operativa y agregación de casos del mismo episodio para evitar saturación.

No fijar todavía una fórmula ponderada única. Definir una **tabla de decisión por tipo de tarea** y validarla con casos históricos y actores operativos. No convertir automáticamente una alerta hidrométrica en orden de evacuación.

### 0.8. Política propuesta para la pregunta que quedó sin responder

**Precedencia según afirmación, no según porcentajes:**

- La evidencia observada y los partes gobiernan **la situación actual**; si hay una afectación vigente, un pronóstico verde no la borra.
- Los pronósticos gobiernan **la anticipación**; que una escuela no haya informado daños no anula una amenaza futura pertinente.
- Si hay pronóstico grave sin evidencia local, priorizar **preparación de acuerdo con exposición**. Cuando exposición o vínculo territorial no sean confiables, abrir verificación dirigida.
- Una corrección o un cierre autorizado cambia únicamente la afectación/ámbito correspondiente; no anula otros daños ni los pronósticos.
- Un reporte no corroborado sigue siendo **reportado**, no se promociona por coincidencia con el modelo.

**Estado:** recomendación técnicamente adoptada como criterio de diseño; su implementación, tipos de acción y escalamiento requieren validación institucional.

### 0.9. Qué NO haría y por qué

| Alternativa descartada como arquitectura objetivo | Motivo | Excepción válida |
|---|---|---|
| Afinar solamente pesos y pisos del IRO | Mezcla variables y mantiene sesgos del historial | Contención transitoria, con marca de legado |
| Tomar el máximo de todas las señales sin filtros | Dato irrelevante o vencido monopoliza la cola | Máximo de **consecuencias pertinentes** ya evaluadas, con razón |
| Dar máxima gravedad a toda la localidad por río en umbral | Cobertura territorial no prueba exposición individual | Preparación territorial y verificación según evidencia |
| Usar el historial como protección cuando está vacío | Confunde no reporte con invulnerabilidad | Ausencia documentada bajo seguimiento suficiente como evidencia limitada |
| Cerrar automáticamente sin reporte nuevo | Silencio puede deberse a comunicaciones cortadas | Vencer una confirmación dispara revisión, no cierre |
| Usar IA generativa para decidir prioridad final | Difícil de auditar y puede inventar hechos | Extraer candidatos de texto y generar resumen citando evidencia |
| Construir ya rutas hogar–escuela individuales | No existen datos adecuados y aumentaría exposición personal | Modelo agregado por parajes y corredores, con acceso restringido |
| Entrenar ya un predictor probabilístico por escuela | Etiquetas insuficientes/sesgadas y fuga temporal | Experimento separado cuando haya validación independiente |
| Migrar prematuramente a microservicios | Aumenta complejidad sin resolver calidad de los datos | Separación física si volumen/aislamiento lo justifican |

---

## 1. Decisiones vinculantes y principios

### 1.1. Decisiones funcionales confirmadas

| Aspecto | Decisión | Implicación de diseño |
|---|---|---|
| Objetivos | Anticipación y gestión de afectaciones, con igual importancia | Dos circuitos funcionales independientes que confluyen en decisiones |
| Alcance inicial | Toda Corrientes | Universo del padrón completo, también sin coordenadas |
| Usuarios | Varios niveles institucionales | RBAC + ámbito jurisdiccional y trazabilidad de decisiones |
| Datos de campo | Principalmente fuentes remotas | Calidad/escala explícitas; verificación dirigida, no dependencia de censo de campo |
| Identidad escolar | Hay sedes compartidas y anexos | Separar sede física, establecimiento y relación temporal |
| Movilidad | Información casi inexistente | Evaluación territorial y cortes reportados primero; no rutas individuales inventadas |
| Operación | Capacidad central dedicada | Coordinación central y cola distribuida automáticamente por jurisdicción |
| Cierre de afectación | Manual y confirmado | Nunca autocerrar por vencer un dato o descender la amenaza |
| Pronóstico grave sin evidencia local | Preparación priorizada según exposición | Preparar según evidencia de exposición; desconocido requiere verificar, no presumir inundación |
| Autorización de cambios/cierre | Por tipo de situación | Política de permisos por acción, tipo, jurisdicción y grado de verificación |
| Expansión prioritaria | Servicios afectados por eventos climáticos | Módulo de energía, agua, comunicaciones, saneamiento y dependencias |
| Alcance futuro | Riesgos hidrometeorológicos | Mecanismos extensibles; evitar un índice universal |

**Decisión pendiente deliberada:** precedencia entre pronósticos y evidencia humana. Se adopta como *propuesta a validar* la siguiente política: la situación presente se determina con observaciones y partes; los pronósticos determinan anticipación; ambos pueden originar acciones, pero ninguno borra por su cuenta al otro. No se asignan pesos porcentuales a estas fuentes.

### 1.2. Invariantes

1. **Universalidad:** cada establecimiento vigente del padrón aparece en el universo de salida, incluso si tiene ubicación o pronóstico desconocidos.
2. **No equivalencia:** amenaza, exposición, afectación observada, impacto previsto, incertidumbre y prioridad de acción son campos diferentes.
3. **No supresión:** un parte grave vigente no desaparece porque el modelo meteorológico indique verde, falte OSM o el raster sea negativo.
4. **No sobreafirmación:** una estación sobre umbral no prueba que un edificio esté inundado; la ausencia de partes no prueba que esté seco.
5. **Tiempo bitemporal:** se distingue cuándo ocurrió/rigió un hecho de cuándo fue conocido por el sistema; los backtests operativos usan únicamente lo conocido entonces.
6. **Unidades compatibles:** no hay mezcla de mm horarios con umbrales diarios, ni indicadores crónicos de calor con susceptibilidad fluvial.
7. **Cierre autorizado:** los incidentes activos requieren cierre humano competente; vencer la confirmación incrementa verificación, no produce cierre.
8. **Acceso autorizado:** cambiar o cerrar requiere permisos por tipo, acción y alcance jurisdiccional; administrar tecnología no implica facultad de corroborar afectaciones.
9. **Asignación con respaldo:** toda tarea de verificación se asigna por jurisdicción o se deriva a bandeja central por falta/conflicto de mapeo; ninguna queda descartada silenciosamente.
10. **Reproducibilidad:** toda evaluación puede explicarse con reglas versionadas y referencias inmutables a entradas.
11. **No ficción probabilística:** una banda ordinal 0–100, si subsiste temporalmente, no es probabilidad de inundación.
12. **Personas protegidas:** accesos y grupos de origen se agregan; no se requieren domicilios de alumnos ni se publican datos individuales de familias.

## 2. Alcance, exclusiones y entregas

**Dentro del primer alcance:** inundación fluvial; anegamiento pluvial; accesibilidad territorial básica y cortes reportados; consecuencias en edificio, continuidad educativa y comunidad; seguimiento de afectaciones; módulo posterior de servicios impactados por meteorología; pronósticos en ventanas explícitas; cobertura de todo el padrón.

**Fuera del primer alcance:** rutas hogar–escuela individuales, inundación calculada en metros dentro de todas las aulas, probabilidad estadística calibrada de impacto por establecimiento, órdenes automáticas de evacuación, clasificación de cada edificio mediante inspección física exhaustiva, modelos estadísticos supervisados en producción y dependencia de fuentes cuya licencia/cobertura no esté confirmada.

**Resultado operativo por sede/establecimiento:** (a) situación observada, (b) evaluación predictiva por mecanismo/ámbito/ventana, (c) consecuencias y limitaciones, (d) recomendaciones y tareas con responsable, (e) estado de recuperación, (f) evidencia y auditoría.

## 3. Arquitectura funcional

```text
FUENTES
  Pronósticos/ensemble, hidrometría, pluviosatélite, cartografía,
  partes institucionales, cortes de servicios externos (si disponibles)
     |
     v
INGESTA -> validación de unidades/tiempos/espacio -> evidencia versionada
     |                                          |
     v                                          v
PADRÓN + GRAFO TERRITORIAL                 EVENTOS/REPORTES
establecimientos, sedes, edificios,       observaciones, impactos,
anexos, tramos, jurisdicciones,            verificaciones y cierres
corredores, servicios                                 |
     |                                                |
     +---------------------+--------------------------+
                           |
                +----------+-----------+
                |                      |
         MOTOR PREDICTIVO        MOTOR DE SITUACIÓN
         por mecanismo          reportes/estado vigente
         y ventana              y verificación
                |                      |
                +----------+-----------+
                           |
             CONSECUENCIAS + DECISIONES
        preparación | respuesta | verificación | recuperación
                           |
                TAREAS + ASIGNACIONES
                  jurisdicción/autoridad
                           |
             PUBLICACIÓN CONSISTENTE
          mapa | ficha | centro | rankings | briefing
                           |
                 AUDITORÍA + MÉTRICAS
```

**Separación técnica recomendada:** núcleo determinista/puro (`evaluate`), adaptadores de fuentes, persistencia y tareas, proyecciones para consultas. No exigir microservicios al comienzo. Diseñar interfaces que permitan ejecución por evento, tramo/celda o lote.

### 3.1. Modelo territorial

- `Establecimiento`: identificación oficial (CUE/anexo según padrón), matrícula/turnos/ofertas y autoridades; identidad administrativa.
- `Sede`: emplazamiento físico; geometría o referencia aproximada y calidad geográfica; puede albergar varios establecimientos.
- `Edificio`/`Predio` (opcionales al inicio): partes físicas relacionadas con una sede. Si no existen, evaluar al nivel de sede, registrando esa limitación.
- `EstablecimientoSede`: relación muchos-a-muchos con `validFrom/validTo`, función y turnos si constan.
- `Jurisdiccion`: área de supervisión/gestión, jerarquía y vigencia.
- `AdscripcionJurisdiccional`: vincula establecimiento/sede con dependencia operativa y responsable; puede tener relaciones adicionales según el tipo de trámite.
- `Estacion`, `Tramo`, `AmbitoFluvial`, `AsociacionHidrologica`: conectividad y cobertura, **no** simple proximidad. Asociaciones versionadas y marcadas como confirmadas, aproximadas o pendientes.
- `Corredor`/`PuntoCritico`: red de accesos, exposición espacial, relación con sedes; introducir progresivamente.
- `Servicio`/`DependenciaServicio`: energía, agua, comunicaciones, saneamiento/bombas y activos compartidos; la relación debe poder ser desconocida.
- `Episodio`: agrupación operativa de una tormenta, crecida o interrupción; no confundir con filas repetidas de reporte.

Una afectación física compartida se registra una sola vez por sede/predio y se vincula a las consecuencias educativas que correspondan; la matrícula no se suma sin deduplicar.

**Calidad espacial:** `verified_point | approximate_point | territorial_reference | unknown`. Una evaluación por celda de 10 km no debe mostrarse como detección exacta en la escuela. Intersecciones territoriales deben considerar precisión y versiones de geometría.

### 3.2. Dos carriles funcionales

**Carril predictivo:** toma fuentes temporalmente válidas y espacialmente pertinentes; evalúa fluvial/pluvial y, posteriormente, servicios; calcula amenazas e impactos potenciales por ventanas; produce contexto, límites y preparación según exposición.

**Carril operativo:** recibe partes, reportes, verificaciones, cortes y cierres; conserva estado vigente independiente del pronóstico; crea o ajusta acciones de respuesta y seguimiento; registra cambios por autor y jurisdicción.

**Combinación:** una entidad `DecisionCase` consolida necesidades de una sede/establecimiento/episodio y puede tener *múltiples colas* simultáneamente. El sistema no obliga a elegir una única categoría máxima y borrar las demás.


### 3.3. Cardinalidad, deduplicación y efectos sobre los indicadores

**Sede física y establecimiento no son sinónimos.** Mantener claves estables y relaciones muchos-a-muchos con vigencia; el establecimiento puede usar más de una sede y varias ofertas pueden ocupar la misma. Diferenciar anexos de infraestructura real. Cuando no se pueda resolver el vínculo, registrar `unresolved`, abrir tarea de calidad del padrón y evitar asignaciones por proximidad inventadas.

| Situación | Hecho físico | Consecuencia educativa | Contabilidad correcta |
|---|---|---|---|
| Dos establecimientos comparten edificio inundado | Una afectación en el edificio | Puede impactar ambos según turno/uso | 1 edificio, 2 establecimientos con posible impacto |
| Un establecimiento utiliza dos sedes | Solo una sede tiene acceso cortado | La consecuencia depende de ofertas/turnos allí | No afectar automáticamente toda la actividad del establecimiento |
| Anexo rural sin coordenadas precisas | Ubicación no verificable por raster | Puede informar parte y ser asignado | Mantener identidad y acción; degradar solo evaluación espacial |
| Dos causas interrumpen el mismo acceso | Un grupo no llega por corte + barro | Una interrupción con dos causas | No duplicar personas ni incidentes por contar causas |

**Regla de contabilización:** el denominador cambia según el indicador. `sedes_afectadas`, `establecimientos_con_impacto`, `personas_afectadas_confirmadas` y `establecimientos_en_vigilancia` son universos diferentes. Publicarlos con su denominador explícito.

### 3.4. Modelo de asociaciones espaciales por precisión progresiva

No inferir vulnerabilidad individual por la sola distancia a una estación o un río. La asociación es una entidad versionada: `source`, `relationType`, `target`, `evidence`, `validFrom`, `validTo`, `confidenceReasons`, `reviewStatus` y `geometryVersion`. La ruta recomendada es:

1. **Ámbito de estación/tramo:** permite cobertura territorial de todas las sedes relevantes.
2. **Subámbito hidráulico o morfológico:** barrios ribereños, parajes, islas, cuencas locales y vías de drenaje cuando hay geometría válida.
3. **Sede/predio/corredor:** determina exposición individual potencial; declarar exactitud espacial real.
4. **Confirmación específica:** reportes o constataciones que pueden prevalecer sobre una predicción espacial negativa.

La escuela no necesita tener geometría para recibir y gestionar una afectación. La asociación por localidad es un mecanismo de **descubrimiento y vigilancia**, no demostración de inundación. La estación más cercana solo debe utilizarse cuando la relación hidrológica esté respaldada; un radio de 40 km puede cruzar cursos de agua no relacionados.

**Datum y cotas:** la altura de la escala hidrométrica local, la altitud de un DEM y una profundidad estimada de otro modelo no son intercambiables sin una transformación vertical y un marco hidráulico compatible. No restar alturas incompatibles para afirmar profundidad en aulas. Copernicus DEM GLO-30 es DSM; edificios y vegetación pueden influir en la superficie representada.

### 3.5. Posición técnica sobre accesibilidad con información escasa

El acceso no se resuelve solamente calculando una ruta OSM desde la escuela hacia la ciudad. Una escuela seca puede estar operativa en el edificio y tener alumnos aislados en barrios o parajes, o docentes sin acceso. Como hoy no existen recorridos hogar–escuela suficientes:

- **Primera capacidad:** conservar cortes informados por zona, corredor o paso; identificar sedes dependientes cuando el vínculo se conoce.
- **Segunda capacidad:** modelar red vial, puentes, alcantarillas, pasos críticos y rutas aproximadas con grado de confianza; evaluar fallas de un punto, no solamente longitud expuesta.
- **Tercera capacidad:** registrar origen agregado, transporte y alternativas reales; no inferir cantidad de alumnos a partir del mapa de caminos.
- **Islas:** modelar embarcaderos, navegación y embarcaciones; OSM terrestre no puede usarse como garantía de acceso.

Una alternativa que usa el mismo puente crítico no es independiente; una alternativa demasiado larga o sin transporte disponible puede ser técnicamente transitable pero operativamente inútil. **La matrícula es exposición potencial, no cantidad constatada de aislados.**

### 3.6. Calidad y origen del dato como parte del resultado

Para cada afirmación, conservar al menos: tiempo de emisión/representación/recepción, resolución espacial, exactitud de ubicación, cobertura, identidad de fuente primaria, transformaciones, conflictos, dependencia entre productos y versión de reglas. Evitar un `confidence=0.7` sin definición: una fuente puede ser actual y de buena calidad pero representar una celda de 10 km que no permite evaluar un patio.

| Afirmación | Calidad relevante | Degradación visible |
|---|---|---|
| Nivel de estación actual | Frescura, unidad, station ID, datum, control del sensor | Lectura vencida o sensor inconsistente |
| Lluvia antecedente local | Duración, gránulos faltantes, sesgo y escala | Ventana incompleta; última hora disponible antigua |
| Susceptibilidad de sede | Coordenada, terreno, fuente física | Sede aproximada o DEM no representativo |
| Camino cortado | Reporte, tramo, hora y modo de transporte | Zona aproximada o reconfirmación vencida |
| Servicio interrumpido | Prestador/parte, área y fecha | Aviso zonal no implica corte individual |

### 3.7. Información faltante: cuatro estados que no deben mezclarse

| Estado | Significado | Tratamiento |
|---|---|---|
| `no_impact_reported` | Nadie reportó afectación en el canal considerado | No afirmar inspección ni seguridad |
| `no_impact_verified` | Verificación explícita, fechada y acotada | Evidencia negativa dentro de su alcance y vigencia |
| `not_detected_by_product` | Un producto no encontró señal sobre su cobertura | No extrapolar a fenómenos fuera de su resolución |
| `unknown / not_covered` | Sin evidencia suficiente o fuera de cobertura | Mostrar incertidumbre y, si importa, verificar |

Una quinta situación, `recovered_verified`, requiere además cierre de la afectación correspondiente por autoridad competente. **No imponer cierre ni “verde” como valor por defecto del silencio.**

## 4. Contratos de dominio propuestos

Los ejemplos siguientes son bocetos para acordar semántica, **no** migraciones de base ni tipos definitivos.

### C-01. `Evidence`

```typescript
type Evidence = {
  id: string;
  source: { id: string; version: string; originalId: string };
  subject: { kind: 'site'|'school'|'segment'|'station'|'area'|'route'|'service'; id: string };
  mechanism: 'fluvial'|'pluvial'|'access'|'services'|'storm'|'heat'|'other';
  nature: 'observation'|'forecast'|'report'|'derived'|'correction';
  payload: unknown;              // esquema discriminado por tipo/variable
  quantity?: { value: number; unit: string; variable: string; durationHours?: number };
  geometryVersion?: string;
  spatialQuality: 'verified'|'approximate'|'regional'|'unknown';
  eventTime?: string;            // instante/intervalo observado o del hecho
  issuedAt?: string;             // emisión original
  receivedAt: string;           // primera vez conocido por el sistema
  validFrom: string; validUntil?: string;
  sourceRunId?: string;
  dependencies: string[];        // evitar doble conteo derivado
  qualityFlags: string[];
  environment: 'production'|'test';
  revision: number;
};
```

**Reglas:** `unknown != 0`; no usar `validUntil` como cierre automático de un parte; preservar valor/unidad nativa y derivación normalizada; rechazar entradas incompatibles para el mecanismo; excluir evidencia de test en operación real.

### C-02. `ImpactReport` y `Verification`

```typescript
type ImpactReport = {
  id: string;
  episodeId?: string;
  target: { kind: 'site'|'school'|'route'|'service'|'community'; id: string };
  impactType: 'building_flood'|'preventive_evacuation'|'access_cut'|
              'community_isolation'|'power_loss'|'water_loss'|
              'communications_loss'|'sanitation_loss'|'other';
  verification: 'reported'|'corroborated'|'refuted';
  lifecycle: 'active'|'recovering'|'resolved';
  reportedAt: string; effectiveFrom: string;
  lastConfirmedAt?: string; closedAt?: string;
  reasonCode: string;
  evidenceIds: string[];
  revision: number;
};
```

`closedAt` solamente lo fija una operación autorizada. `confirmationAge` se deriva para solicitar reconfirmación sin modificar `lifecycle`. Correcciones no borran el original; los permisos para informar, corroborar, refutar y cerrar pueden diferir.

### C-03. `MechanismAssessment`

```typescript
type MechanismAssessment = {
  id: string; siteId: string;
  mechanism: 'fluvial'|'pluvial'|'access'|'services';
  asOf: string; knownAtCutoff: string;
  window: { from: string; to: string };
  hazard: 'none_detected'|'watch'|'elevated'|'severe'|'unknown';
  exposure: 'confirmed'|'plausible'|'not_detected'|'unknown';
  possibleImpacts: Array<{ domain: 'building'|'access'|'community'|'services'|'continuity'; level: string }>;
  evidenceIds: string[]; missingReasons: string[];
  confidenceReasons: string[]; ruleIds: string[];
  engineVersion: string; geoVersion: string;
};
```

Una banda ordinal no representa probabilidad. Las etiquetas y umbrales deben formalizarse con expertos y pruebas antes de su despliegue.

### C-04. `DecisionCase` / `Task`

- `caseId`, `episodeId`, `targetIds`, estado de situación, mecanismo(s), prioridad de **acción** y motivos.
- `lanes[]`: `response`, `preparedness`, `verification`, `recovery`, `watch`; no exclusivas.
- `task`: tipo (`contact`, `verify_site`, `verify_route`, `coordinate_transport`, `verify_service`, `follow_up`), responsable, jurisdicción, fecha de asignación, estado, vencimiento derivado de política institucional versionada, procedencia y última actualización.
- `assignment`: política/versión, jurisdicción destino, responsable o bandeja, razón de asignación, delegación y escalamiento.
- `decisionAudit`: actor, permiso usado, justificación, cambios previos/nuevos, momento y evidencia referenciada.

### C-05. `PublishedSnapshot`

- `publicationId`, `engineVersion`, `rulesVersion`, `schemaVersion`, `territoryVersion`, `dataCutoff` y `publishedAt`.
- Cobertura del padrón: incluidos, con geometría utilizable, sin geometría, evaluados por mecanismo y excluidos con razón.
- Frescura y degradaciones de cada fuente; trabajos parciales; referencias a resultados.
- Publicación atómica de una **versión coherente** para mapa, ficha, centro y briefing; los cambios de partes críticos pueden actualizar el carril operativo inmediatamente con su propio `situationVersion`, evitando afirmar que todo el pronóstico fue recalculado.

### C-06. APIs de lectura y escritura (propuesta)

- `GET /risk/sites?asOf=&mechanism=&jurisdiction=&lane=`: estado materializado; filtros y paginación.
- `GET /risk/sites/:siteId`: mecanismos, impactos, evidencias, versiones, limitaciones y tareas.
- `GET /risk/episodes/:episodeId`: agrupación y actividades por evento.
- `GET /risk/coverage`: métricas por jurisdicción y fuente.
- `POST /impacts`: nuevo parte con idempotency key.
- `POST /impacts/:id/verify`: corroboración/refutación autorizada.
- `POST /impacts/:id/close`: cierre con razón, responsable y evidencia.
- `POST /tasks/:id/reassign`: reasignación auditada y verificación de alcance.

Los nombres de rutas son orientativos; deben integrarse con las convenciones y mecanismos de autenticación ya existentes. Todas las acciones sensibles aplican autorización en servidor, no solo ocultamiento de botones.


### 4.1. Semántica de cada contrato y operaciones seguras

**Evidencia no es afirmación operativa.** `Evidence` almacena una señal, `MechanismAssessment` produce una inferencia, `ImpactReport` conserva información humana o material sobre una afectación, `DecisionCase` propone tareas y `PublishedSnapshot` declara qué versiones están siendo consultadas. La persistencia debe impedir que un objeto de un tipo sustituya silenciosamente a otro.

**Recomendación adicional:** los `payload` no deberían permanecer como `unknown` en interfaces de dominio finales. En el contrato inicial puede ser un envelope, pero cada `variable` debe mapearse a un schema validado: precipitación horaria, nivel de estación, estado de un puente, aviso institucional, corte eléctrico, etc. Una falla de parseo debe quedar en cuarentena, no convertirse en cero.

Separar las siguientes nociones temporales de manera deliberada:

| Tiempo | Semántica | Ejemplo de uso |
|---|---|---|
| `observedAt` / `eventTime` | Ocurrencia del hecho físico | Cuándo empezó un corte de acceso |
| `validFrom` / `validUntil` | Período que representa una fuente | Hora representada por un valor horario de lluvia |
| `issuedAt` | Publicación por parte del productor | Ciclo de pronóstico ECMWF |
| `receivedAt` | Primera disponibilidad en nuestro sistema | Límite para reconstrucción operativa |
| `correctedAt` / `supersedes` | Versión corregida e identidad sustituida | Parte con CUE o hora rectificados |
| `calculatedAt` | Momento de proceso | Corrida del evaluador |
| `publishedAt` | Disponibilidad para consumidores | Cuándo lo vio el Centro de Situación |
| `lastConfirmedAt` | Última reconfirmación humana | Cola de reconfirmación de parte abierto |

El intervalo de validez se maneja como semiabierto `[desde, hasta)`, cuando existe `hasta`, y las correcciones tardías deben registrar tanto su tiempo real de incorporación como su intervalo físico. No derivar `receivedAt` de una fecha retroactiva provista por el informante.

### 4.2. Ejemplo explicativo de una evaluación provincial

El siguiente JSON es **un ejemplo sintético**, no un registro real ni una API ya implementada. Los nombres y niveles deben estabilizarse en B1/B6.

```json
{
  "siteId": "sede-demo-01",
  "administrativeLinks": ["establecimiento-demo-01", "anexo-demo-02"],
  "time": {
    "asOf": "2026-10-14T20:00:00-03:00",
    "knownAtCutoff": "2026-10-14T20:00:00-03:00",
    "publishedAt": "2026-10-14T20:02:00-03:00"
  },
  "territory": {
    "geolocationQuality": "approximate_point",
    "fluvialArea": "tramo-demo-01",
    "hydrologicalAssociation": "verified_relation"
  },
  "predictive": [
    {
      "mechanism": "fluvial",
      "window": "0-24h",
      "hazard": "elevated",
      "siteExposure": "unknown",
      "impacts": ["possible_access_disruption"],
      "evidenceIds": ["nivel-demo-10", "asociacion-demo-03"],
      "limitations": ["building_ground_elevation_unverified"]
    }
  ],
  "observed": [
    {
      "reportId": "parte-demo-44",
      "type": "communications_loss",
      "verification": "reported",
      "lifecycle": "active",
      "confirmation": "recent"
    }
  ],
  "decision": {
    "lanes": ["response", "preparedness", "verification"],
    "tasks": [
      "verify_communications_outage",
      "prepare_fluvial_contingency",
      "confirm_individual_exposure"
    ],
    "assignmentMode": "jurisdictional",
    "policyVersion": "decision-rules-demo-1"
  },
  "publication": {
    "engineVersion": "engine-demo-1",
    "territoryVersion": "territory-demo-2",
    "situationVersion": "situation-demo-20",
    "assessmentVersion": "assessment-demo-11"
  }
}
```

Este ejemplo demuestra la semántica buscada: una crecida relevante **no afirma inundación del edificio**, y un corte de comunicaciones **reportado** no pasa automáticamente a corroborado. Ambos pueden generar acciones, cada uno con evidencia y responsables propios.

### 4.3. Idempotencia, concurrencia y consistencia

- Para ingestas externas: clave estable `source + originalId + revision` y hash de contenido para detectar modificaciones; conservar versionado y referencias.
- Para partes offline: `clientReportId` estable, revisión y servidor de recepción; reintentos repetidos no generan nuevas afectaciones ni tareas.
- Para cierres/corroboraciones: control de versión optimista (`expectedRevision`) y autorización en backend; dos operadores no pueden sobrescribir sin detectar conflicto.
- Para un reporte que afecta varias sedes: una evidencia fuente puede referenciar varios objetivos; documentar si existe uno o varios incidentes según el ámbito físico.
- Para publicar evaluaciones: snapshot coherente por versión; el carril operativo mantiene actualización independiente, pero la API muestra simultáneamente `situationVersion` y `assessmentVersion`.
- Para reprocesar episodios históricos: evitar duplicados con claves de episodio + ámbito + tipo de consecuencia y mantener *supersession* explícita; no deduplicar dos hechos realmente diferentes por compartir fecha o CUE.

**Riesgo de arquitectura:** una capa de memoización por escuela no garantiza snapshot consistente si las fuentes cambian durante el mismo lote. Definir corte de entradas o materializar un conjunto de evidencias versionadas antes del cómputo.

### 4.4. Contrato de inferencia y regla de abstención

Todo evaluador retorna un resultado válido o una **abstención explícita** (`insufficient_data`, `irrelevant_mechanism`, `out_of_coverage`, `stale_source`, `invalid_units`, `unresolved_territory`). Abstenerse no debe convertirse en `none_detected` ni en cero.

```typescript
// Boceto conceptual; nombres no definitivos.
type AssessmentOutcome<T> =
  | { kind: 'evaluated'; value: T; evidenceIds: string[]; limitations: string[] }
  | { kind: 'not_evaluable'; reason: string; evidenceIds: string[]; action?: 'verify'|'monitor' };
```

Cada mecanismo declara `requiredInputs`, `optionalInputs`, `freshnessPolicy`, `spatialApplicability`, `outputClaims`, `confidenceFactors` y `abstentionPolicy`. Una excepción técnica es distinta de una abstención válida: las primeras deben observarse y reintentarse, las segundas deben conservarse para reportar cobertura.

### 4.5. Contrato de explicaciones

Cada cambio de categoría o tarea debe poder reconstruirse con tres partes:

1. **Señales a favor:** estación relevante creciente, lluvia por ventana, reporte vigente, dependencia confirmada.
2. **Señales mitigadoras:** acceso alternativo verificado o defensa con alcance suficiente; no bastan medidas administrativas registradas sin comprobación de ejecución.
3. **Limitaciones/conflictos:** ubicación aproximada, fuente vencida, contradicción entre parte y raster, ausencia de geometría o informes independientes insuficientes.

Evitar explicar con «aportó +15 puntos» cuando la decisión proviene de una regla de precedencia, un requisito de pertinencia, un veto a evidencia incompatible o un incidente confirmado. El sistema debe citar IDs de reglas, versiones y evidencias, no solo nombres amigables de fuentes.

## 5. Reglas funcionales versionadas

### Evidencia y temporalidad

- **R-E01**: un registro observado o previsto solo participa si sus unidades y ventana son compatibles con la regla evaluada.
- **R-E02**: se rechaza para evaluación actual una emisión posterior al corte de conocimiento o con período de validez vencido; puede mostrarse el último estado conocido etiquetado como histórico.
- **R-E03**: en backtest operativo, `receivedAt <= knownAtCutoff`; `eventTime <= asOf` no basta para partes retroactivos.
- **R-E04**: cobertura insuficiente produce `unknown`/degradado, nunca 0 mm o seguridad.
- **R-E05**: varias señales con dependencia común no se tratan como corroboraciones independientes.
- **R-E06**: los reportes de pruebas/demo jamás afectan casos o métricas reales.

### Situación y cierre

- **R-S01**: un parte vigente de inundación activa situación física aunque el pronóstico sea bajo o falte raster.
- **R-S02**: evacuación preventiva no prueba inundación material; `centro_evacuados` no significa escuela evacuada o inundada.
- **R-S03**: impacto de alumnos/docentes aislados afecta comunidad/movilidad/continuidad, no implica por sí mismo edificio inundado.
- **R-S04**: un reporte grave aún no corroborado exige gestión y verificación; no se lo etiqueta automáticamente como hecho confirmado.
- **R-S05**: el cierre es manual, específico a cada afectación, por rol/ámbito autorizado; no cierra otros impactos ni anula pronósticos.
- **R-S06**: confirmación envejecida incrementa necesidad de reconfirmación; no modifica `resolved` por sí misma.
- **R-S07**: datos contradictorios se conservan y se genera revisión; no se sobrescribe silenciosamente el más grave.

### Predicción fluvial y pluvial

- **R-F01**: toda sede con vínculo al ámbito/tramo aprobado participa en la evaluación fluvial ante una alerta pertinente.
- **R-F02**: pertenecer al ámbito fluvial no basta para afirmar inundación de la sede; produce vigilancia/preparación/verificación graduada por exposición.
- **R-F03**: una celda de raster sin profundidad detectada no veta una afectación reportada o un vínculo fluvial.
- **R-F04**: la estación pertinente se elige por relación hidrológica versionada, no universalmente por mínima distancia.
- **R-F05**: la tendencia se calcula con observaciones válidas y comparables; bajar el río no autocierra accesos o daños.
- **R-P01**: precipitación horaria se agrega a ventanas correctas (p. ej. acumulado de 24 h; máximo móvil 24 h en 72 h).
- **R-P02**: ventana de anticipación y duración de acumulado son campos distintos; comparación solo con umbrales de igual duración.
- **R-P03**: el mecanismo pluvial no se diluye con caudal verde, y el fluvial no con lluvia local cero.
- **R-P04**: humedad de suelo, drenaje y antecedentes son modificadores pertinentes a calibrar, nunca pruebas autosuficientes de inundación escolar.

### Accesos y servicios

- **R-A01**: un corte de acceso reportado entra al carril operativo aunque OSM o mapas de exposición no tengan información.
- **R-A02**: un posible corte de vía no se traduce en número de alumnos aislados sin datos de origen o reporte.
- **R-A03**: una alternativa reduce impacto solo si es utilizable según modo, condición y punto crítico compartido; en fase inicial puede quedar `unknown`.
- **R-V01**: lluvia/tormenta/viento altos pueden elevar *riesgo de interrupción* de servicios, pero no prueban corte de electricidad, agua o comunicaciones.
- **R-V02**: corte observado de servicio crea situación propia, con duración, ámbito, fuente y dependencia del edificio.
- **R-V03**: pérdida de electricidad puede agravar agua/bombeo o comunicaciones **solo** si la dependencia es conocida; no se infiere indiscriminadamente.
- **R-V04**: fuente de corte a escala de área genera exposición posible para sedes relacionadas, no interrupción confirmada en cada una, salvo granularidad/evidencia suficiente.
- **R-V05**: recuperación de un servicio requiere cierre autorizado del impacto y no resuelve otros servicios/cortes.

### Prioridad, jurisdicción y autorizaciones

- **R-D01**: hecho grave observado o reportado activa `response`/`verification` según estado y necesidad, independientemente del pronóstico.
- **R-D02**: amenaza futura grave + exposición específica suficiente activa `preparedness` priorizada; amenaza grave + exposición desconocida activa `watch` y, según consecuencia plausible, `verification`, sin afirmar impacto individual.
- **R-D03**: existen colas independientes de respuesta, preparación, verificación y recuperación; el caso consolida señales para evitar tareas duplicadas.
- **R-D04**: tareas se asignan automáticamente por jurisdicción vigente y tipo de caso; vínculos múltiples/ausentes terminan en bandeja central de resolución, no se descartan.
- **R-D05**: `create`, `corroborate`, `refute`, `close`, `assign`, `reassign`, `override` se autorizan por rol **y** tipo de afectación **y** jurisdicción vigente, con delegaciones registradas.
- **R-D06**: un cambio de prioridad automático no constituye orden de evacuación o cierre de escuela; esas decisiones corresponden a autoridades competentes.
- **R-D07**: las intervenciones/mitigaciones solo reducen consecuencias dentro del ámbito y validez comprobados; incertidumbre y ausencia de antecedentes nunca reducen automáticamente gravedad.


### 5.1. Reglas de precedencia y su justificación

**Orden lógico de evaluación, no ranking de credibilidad universal:**

```text
1. Recibir/corroborar la evidencia e identificar su mecanismo, ámbito y validez.
2. Actualizar situación observada sin pedir permiso al pronóstico.
3. Para cada mecanismo, filtrar fuentes por pertinencia, unidad, período, frescura y espacio.
4. Si faltan entradas esenciales, devolver no evaluable + motivo; no reemplazar por 0.
5. Estimar amenaza y consecuencia potencial, conservando calidad y ámbito.
6. Aplicar interacciones justificadas (río alto + drenaje impedido, etc.)
   sin duplicar señales derivadas de una misma lluvia.
7. Aplicar mitigaciones verificadas SOLO sobre la consecuencia que pueden reducir.
8. Generar tareas independientes de respuesta, preparación, verificación o recuperación.
9. Agrupar tareas por episodio/ámbito para evitar duplicación y asignar por jurisdicción.
10. Publicar evidencia, reglas, versiones y motivos de cambio.
```

**Principio de no cancelación:** una escuela con edificio seco y alumnos aislados sigue teniendo una consecuencia grave de acceso. Un corte eléctrico corroborado sigue activo aunque baje el río. La reparación de un puente no restablece automáticamente el servicio de agua.

### 5.2. Matriz de decisiones ilustrativa (no calibrada)

| Situación de entrada | Predicción/impacto | Situación vigente | Cola sugerida | Inferencia prohibida |
|---|---|---|---|---|
| Parte de agua dentro de sede, pronóstico verde | Puede estar bajo | Inundación **reportada** | Respuesta + corroboración | Que el pronóstico borre el parte |
| Evacuación preventiva registrada | Puede estar elevado o bajo | Medida ejecutada/reportada | Seguimiento de medida | Afirmar que hubo agua dentro |
| Nivel de río superior a umbral del tramo, sede sin exposición individual | Amenaza territorial relevante | Sin afectación informada | Preparación según exposición; si desconocida, verificación | Marcar edificio inundado |
| Lluvia local cero, nivel fluvial ascendente | Fluvial independiente de pluvial | Sin cambio | Preparación/vigilancia pertinente | Diluir crecida con lluvia cero |
| Imagen satelital sin agua sobre zona con parte positivo | Señales contradictorias | Mantener estado del parte según vigencia | Verificación de conflicto | Descartar parte automáticamente |
| Corte de un paso crítico con sede seca | Posible consecuencia de movilidad | Reporte de corte si existe | Respuesta/verificación de acceso | Afirmar inundación del edificio |
| Sin señal y sin datos recientes | No evaluable | Desconocida o último estado | Verificación si relevancia operativa | Publicar verde por silencio |
| Baja el río; corte de energía continúa | Disminuye señal fluvial | Servicio afectado | Seguimiento del servicio | Cerrar todo el caso |
| Servicio restablecido corroborado; amenaza futura alta | Predicción independiente | Servicio resuelto por cierre autorizado | Preparación para nuevo impacto | Borrar el pronóstico |

### 5.3. Bandas de acción y cómo calibrarlas

**No asignar por defecto `50`, `75`, `100` al río en función de una tabla uniforme.** Primero hacer explícito qué decisión cambia una banda: vigilancia, contacto, preparación o asistencia. Los umbrales deben surgir de mecanismo, alcance espacial y evaluación histórica. Evitar que «muy alto» signifique cosas distintas en mapa y Centro.

Para cada regla que genere tarea documentar:

- `preconditions`: fuente vigente, relación territorial apropiada, tipo de exposición.
- `trigger`: condición verificable sobre señal/impacto/parte.
- `action`: tarea y responsable, no solo color.
- `cooldown / hysteresis`: forma de evitar alternancia constante entre bandas.
- `expiration`: cuándo vence la recomendación predictiva y qué sucede si falta actualización.
- `downgrade`: qué nueva evidencia permite reducir o cerrar *esa* necesidad, sin borrar otras.
- `testIds`: regresiones y casos límites.

**Histéresis:** escalar rápido cuando aparece evidencia grave y desescalar con observaciones suficientes y confirmación del ámbito afectado. La duración concreta cambia por fenómeno; no fijarla con un número universal. Los reportes activos no se cierran mediante histéresis meteorológica.

### 5.4. Monotonicidad, correlación y pruebas metamórficas

Son invariantes útiles, pero deben aplicarse solamente a entradas comparables:

- Si aumenta lluvia pertinente, y todo lo demás se mantiene, el evaluador pluvial no debería reducir la amenaza por un artefacto aritmético.
- Si una estación fluvial cambia de vigente a vencida, el sistema **debe perder actualidad**, no interpretarlo como disminución de caudal.
- Si se retira una fuente de una corrida, la diferencia debe atribuirse a cobertura/uncertainty; no puede presentarse como mejoría física sin nueva evidencia.
- Si se agrega una escuela administrativa en una sede compartida, no debería duplicarse el número de edificios afectados.
- Si una medida preventiva reduce exposición presencial, puede disminuir la consecuencia para personas aunque aumente la amenaza física: **esto no viola el criterio de monotonicidad por mecanismo** porque cambió otra variable.

Evitar doble conteo de fuentes correlacionadas: lluvia del modelo, caudal derivado del modelo y acumulado satelital no son tres observaciones independientes por definición. Conservar dependencias y, cuando no se conozcan, explicitar que la convergencia de señales no permite multiplicar confianza.

## 6. Matriz inicial de autoridad y flujo institucional

La siguiente tabla es **una propuesta**, no una afirmación sobre facultades institucionales vigentes. Debe aprobarse por las autoridades responsables antes de codificarla.

| Acción / caso | Establecimiento | Supervisión de jurisdicción | Equipo central | Especialista/autoridad competente |
|---|---|---|---|---|
| Reportar afectación propia | Crear/proponer | Crear/corroborar según delegación | Crear/gestionar | Según competencia |
| Corroborar afectación educativa | Aportar evidencia | Puede corroborar si facultado | Puede validar flujo/evidencia | Según competencia |
| Cerrar una afectación menor verificada | Solicitar o cerrar solo si autorizado | Cerrar según tipo y delegación | Cerrar según tipo y delegación | Según competencia |
| Cerrar daño estructural | Solicitar revisión | Aportar verificación | Coordinar | Validación técnica requerida según política |
| Cerrar evacuación/medida institucional | Solicitar actualización | Según delegación formal | Coordinar | Autoridad competente según normativa |
| Reasignar tareas | No fuera de ámbito | Dentro de ámbito autorizado | Interjurisdiccional | Según delegación |
| Cambiar asociación de tramo/sede | Proponer corrección | Proponer/validar información local | Aprobar versión operativa según política | Revisión técnica hidrológica cuando aplique |
| Modificar reglas del motor | No | No | Gestionar cambio aprobado | Responsable técnico y aprobador designado |

**Autorización mínima:** permisos ABAC/RBAC en backend con atributos `role`, `jurisdiction`, `caseType`, `action`, `delegation`, `effectiveAt`, y justificación auditable. Los administradores de sistemas no reciben permiso de cierre de incidentes por el solo hecho de operar la plataforma.

**Asignación automática:** (1) resolver la sede/establecimiento y su jurisdicción vigente; (2) seleccionar política por tipo/mecanismo; (3) buscar responsable activo; (4) asignar e informar; (5) ante ambigüedad, ausencia o fallo, remitir a cola central con razón; (6) mantener rastros y permitir reasignar, aceptar y escalar. Los SLA concretos y la jerarquía institucional deben acordarse; no inventar plazos normativos.

## 7. Módulo inicial de servicios: dependencia con eventos climáticos

Se implementa **después** de consolidar situación y evaluadores fluvial/pluvial, como primera ampliación de alcance funcional.

### 7.1. Servicios contemplados

- **Energía eléctrica**: pérdida confirmada, riesgo previsto de interrupción, respaldo disponible/verificado, dependencia de bombas e infraestructura crítica.
- **Agua**: suministro, captación/bombeo, potabilidad reportada, almacenamiento/autonomía si existe evidencia.
- **Comunicaciones**: conectividad institucional, telefonía y medios alternativos, estado observado o reportado.
- **Saneamiento/drenaje**: dependencias de bombas y funcionamiento durante anegamiento; reporte de falla, no inferencia automática.

### 7.2. Grafo de dependencias

Ejemplo: `red eléctrica -> bomba de agua -> suministro escolar`. La caída de red solo aumenta la consecuencia sobre agua si la escuela depende de ese bombeo y carece de un respaldo operativo corroborado. `No se sabe si hay bomba` no equivale a `hay bomba sin respaldo`.

### 7.3. Estados por servicio

`operativo_confirmado | corte_reportado | corte_corroborado | posible_interrupcion | recuperación | desconocido` combinados con verificación, antigüedad y alcance. El estado *posible interrupción* debe mostrarse por separado del *corte observado*.

### 7.4. Orden de fuentes

Primero partes institucionales y cortes documentados si existen; luego mapas/avisos de prestadores con precisión espacial definida; por último exposición potencial deducida de amenazas climáticas. Nunca presentar el último nivel como hecho ocurrido.


### 7.5. Justificación de la prioridad asignada al módulo de servicios

A diferencia del riesgo de accesos hogar–escuela, que depende de trayectos hoy desconocidos, ciertos **cortes de servicio** pueden reportarse estructuradamente y tienen consecuencias claras para la continuidad educativa. Por ello B7 puede entregar valor sin censar todos los recorridos de alumnos; esto **no** implica que se pueda predecir de forma individual qué escuela perderá energía por una tormenta sin disponer de topología de distribución y datos de prestador.

**Ámbitos de consecuencia separados:** suministro eléctrico, disponibilidad de agua, conectividad/comunicaciones, saneamiento/bombeo y continuidad de actividades. No asumir que un grupo electrógeno protege aulas, agua y comunicaciones sin confirmar circuitos cubiertos, autonomía y mantenimiento. Una mejora comprobada en un servicio no disminuye automáticamente el riesgo fluvial o pluvial.

**Escenarios de aceptación adicionales:**

1. Aviso regional del prestador sin listado de medidores afectados: vigilancia/exposición territorial de las sedes del polígono, no corte observado individual.
2. Un parte reporta caída de energía en sede A, sede B comparte edificio: deduplicar afectación física, mantener consecuencias por establecimiento cuando corresponda.
3. Pérdida de energía con bomba dependiente y sin datos de respaldo: alertar **posible** impacto en agua y solicitar verificación; no presentar corte de agua corroborado.
4. Confirmación de red restaurada no restaura automáticamente comunicaciones privadas u otros daños no corroborados.
5. Múltiples fuentes de un mismo prestador no cuentan como verificación independiente cuando replican el mismo incidente.

**Criterio de aceptación de negocio:** una persona a cargo debe poder distinguir sin interpretación técnica compleja *servicio confirmado caído*, *posible afectación* y *sin información*, y conocer quién está autorizado a corroborar y cerrar cada estado.

## 8. Política temporal, espacial y de publicación

### 8.1. Tiempos separados

- `eventTime`: cuándo ocurrió el hecho observado.
- `validFrom/validUntil`: intervalo al que corresponde un dato/pronóstico.
- `issuedAt`: cuándo emitió la fuente.
- `receivedAt`: cuándo estuvo disponible para nuestro sistema.
- `asOf`: momento histórico físico para el que se calcula.
- `knownAtCutoff`: corte de conocimiento permitido en el cálculo.
- `calculatedAt/publishedAt`: cálculo y publicación.

Para consultar qué hubiera mostrado el sistema el día X se aplican tanto validez física como disponibilidad histórica; una corrección retroactiva recibida después de X no entra en una evaluación operativa original de X.

### 8.2. Ventanas sugeridas (para acordar por mecanismo)

- Corto plazo: `0–24 h`.
- Medio plazo: `24–72 h`, además de máximo móvil dentro de la ventana `0–72 h` cuando el producto lo permita.
- Extendido: `72–240 h` solo para mecanismos/fuentes que ofrezcan utilidad comprobable; no inventar resolución local.
- Para lluvia, conservar duración de acumulados (`1 h`, `3 h`, `6 h`, `24 h`, `72 h`) **independiente** del horizonte de emisión.

Son ventanas candidatas, no umbrales de activación. La duración útil del pronóstico y su frescura deben definirse por fuente y producto.

### 8.3. Falla o desactualización

Mostrar último resultado junto con `stale=true`, antigüedad, fuente degradada y limitación; no publicar verde/normal por ausencia de actualización. Un pronóstico vencido no entra en el motor como actual. Falla del motor predictivo no debe bloquear la entrada y visibilidad de un parte.

### 8.4. Publicación sin mezclas invisibles

- Proyecciones del carril predictivo se publican por `assessmentVersion` coherente.
- Situación operativa se actualiza por `situationVersion` con baja latencia.
- La API compone ambas versiones **declarando las fechas** de cada una; no atribuye actualidad predictiva a un parte recién actualizado.
- Mapa, Centro de Situación, ranking y briefing consumen un contrato compartido de semántica y no filtran exclusivamente por IRO legado.


### 8.5. Por qué resolver ventanas antes que recalibrar pesos

El diagnóstico de origen describe que un lector tomaba la fila horaria próxima a un horizonte (`24`, `72`, `240 h`) como si representara un acumulado mayor. Con 24 horas de 5 mm, la señal evaluada era de 5 mm pese a existir 120 mm acumulados en 24 horas. Este es un error de **variable y ventana**, no de sensibilidad del umbral. Ajustar colores sobre una precipitación conceptualmente incorrecta genera calibración espuria.

Definir al menos dos ejes separados:

- **Horizon lead time:** cuándo podría ocurrir un impacto contado desde la emisión (p. ej. próximas 24/72 h).
- **Accumulation duration:** cuánto dura el intervalo de lluvia evaluado (p. ej. 1/3/6/24/72 h).

**Regla de contrato:** cada umbral meteorológico declara unidad y duración. Un percentil diario se compara con lluvia acumulada de duración comparable, no con el valor aislado de una hora. Para el ensemble, calcular el evento sobre la trayectoria de **cada miembro** y recién después su frecuencia dentro del conjunto; no sumar probabilidades de días distintos como si fueran independientes.

**Pronóstico vs impacto:** `70 % de miembros superan 50 mm en 24 h en cierta grilla` no se transforma en `70 % de escuelas se inundarán`. Ese segundo evento necesita una función de impacto y evaluación local independiente. No usar el contexto estacional para disparar medidas escolares individuales; su escala es de preparación regional.

### 8.6. Catálogo de fuentes por función, no por cantidad

Esta matriz es **propuesta de evaluación**, no un inventario confirmado de licencias, SLA o cobertura operativa. Se validará en B0/B1 antes de integrar una fuente nueva.

| Fuente/clase | Valor concreto | Limitación principal | Uso recomendado |
|---|---|---|---|
| Pronósticos/ensemble | Intensidades, acumulados, viento, horizontes | Resolución, sesgos, incertidumbre | Amenaza futura regional/local según producto |
| Alertas oficiales SMN | Advertencia oficial y cobertura geográfica | Disponibilidad programática, semántica y autorización | Contexto y escalamiento según relación con sede |
| Prefectura y otras hidrometrías pertinentes | Niveles observados, tendencia | Datum, estación/tramo, frescura | Observación fluvial local |
| GloFAS | Evolución de caudal a escala apropiada | No calcula automáticamente profundidad en aulas | Complemento de anticipación por tramo/cuenca |
| NASA IMERG | Precipitación satelital antecedente | Sesgo, latencia y resolución espacial | Contexto de lluvia y validación adicional |
| Sentinel-1 / cartografía de agua | Extensión detectada en adquisición puntual | Temporalidad, clases y áreas no detectadas | Evidencia espacial contextual, no veto absoluto |
| DEM/geomorfología | Elevación relativa contextual | Superficie vs terreno, errores verticales | Susceptibilidad y revisión, nunca prueba absoluta |
| Humedad de suelo | Condición antecedente | Producto grueso o poco representativo | Modificador experimental de pluvial/caminos |
| OSM/vialidad | Red, puentes, posible conectividad | Cobertura, calidad y transitabilidad no actualizada | Accesos potenciales con incertidumbre |
| PhysRisk y mapas estáticos | Características de amenaza física de escenario | Unidad, escenario, horizonte, escala | Contexto específico después de validar variables |
| Partes escolares | Consecuencia actual, contexto local | Sesgo de reporte, duplicados, vigencia | Situación; corroboración y seguimiento |

**Principio de independencia:** dos productos que derivan del mismo modelo o comparten observaciones deben etiquetarse con relaciones de dependencia; no incrementar confianza por conteo bruto de productos. Una fuente puede ser excelente para vigilancia regional y mala para determinar si un puente de pocos metros está cortado.

### 8.7. Política de incertidumbre por afirmación

En vez de multiplicar una gravedad por un porcentaje genérico de confianza, el resultado conserva razones:

| Dimensión | Pregunta | Ejemplo de salida |
|---|---|---|
| Temporal | ¿Representa la hora evaluada? | `stale: 3h beyond policy` |
| Espacial | ¿Dónde aplica y a qué resolución? | `regional_grid_only` |
| Procedencia | ¿Cómo se originó? | `reported_not_corroborated` |
| Cobertura | ¿Cuánto falta? | `precipitation_window_80pct` |
| Consistencia | ¿Se contradicen fuentes relevantes? | `raster_negative_vs_field_positive` |
| Aptitud predictiva | ¿Sirve para el mecanismo y horizonte? | `performance_not_validated_locally` |

La incertidumbre puede **elevar necesidad de verificación**, pero no convertirse por regla en gravedad física mayor. Una evidencia grave de baja calidad requiere comprobación prioritaria y una explicación cuidadosa; reducirla a `riesgo × confianza` haría desaparecer casos relevantes.

### 8.8. Frescura y publicación en caso de falla

Definir una política `FreshnessPolicy` por fuente/producto (ventana esperada, latencia tolerada, última cobertura, fallos, tratamiento de gaps). Un dataset etiquetado `run vigente` significa que es el último publicado; no necesariamente que todos sus insumos siguen siendo actuales.

**Comportamiento recomendado:**

- Si caduca un pronóstico, retirarlo de la evaluación actual y mostrar último resultado con hora y advertencia; nunca venderlo como pronóstico vigente.
- Si faltan gránulos de observación, conservar cobertura y no rellenar con cero; solicitar reproceso o devolver evidencia parcial con limitaciones.
- Si deja de llegar una estación, mantener último nivel **como histórico**, no considerarlo una lectura actual ni poner río en verde.
- Si cae todo el pipeline de predicción, mantener vivos partes, cierres y tareas operativas; indicar degradación en el Centro.
- Si un consumidor solo puede mostrar una versión, exponer explícitamente que la situación es reciente y el pronóstico tiene un snapshot anterior.

## 9. Plan por batches y dependencias

```text
B0 --+--> B1 (integridad de evidencia) --+--> B4 (fluvial) --+
     |                                  +--> B5 (pluvial) --+--> B6 (integración/decisiones)
     +--> B2 (identidad/jurisdicción) --+--> B3 (partes/operación) --+          |
                                                                          +--> B7 (servicios)
                                                                          +--> B8 (accesos)
                                                            todos --------> B9 (validación y despliegue)
```

**La secuencia no exige completar B4 y B5 antes de publicar la corrección operativa B3.** B1 y B2 se preparan en paralelo después de B0, y B4/B5 pueden desarrollarse en paralelo cuando estén definidos contratos comunes. Cada batch debe conservar feature flags y una comparación de resultados antes/después.

### B0 — Reconciliación y baseline reproducible

**Objetivo:** distinguir problemas de la versión local original de problemas vigentes en producción.

- **Entradas:** checkout/commit de la propuesta; versión desplegada; esquema BD y reglas; casos Ituzaingó, Libres, Escuela 93, 874/532 y 377; contratos de fuentes realmente activos.
- **Entregables:** inventario de versiones y consumidores; matriz de fuentes/unidades/ventanas; fixtures sintéticos y, cuando haya autorización, casos históricos anonimizados; baseline de distribución por escuela; documento de permisos y roles preliminares; criterios cuantitativos de promoción propuestos para aprobación.
- **Pruebas:** reproducir o descartar cada anomalía en el entorno correspondiente; garantizar no escrituras en producción en esta auditoría; verificar que cada caso tiene datos suficientes o marcar la brecha.
- **Aceptación:** cada contradicción queda clasificada `confirmada | corregida | no reproducible | información insuficiente` con evidencia, responsable y commit/versión; todos los consumidores del IRO identificados.
- **No hacer:** recalibrar pesos o introducir nuevas fuentes.

### B1 — Contratos de evidencia, tiempo y unidades

**Depende de:** B0. **Puede ejecutar en paralelo con B2.**

- **Entregables:** schemas versionados de `Evidence`, validación/normalización de fuentes y unidades, transformaciones temporales, frescura por producto, cobertura de ingesta, cuarentena de datos incompatibles; suite de tests deterministas.
- **Corregir:** precipitación horaria vs diaria; acumulados y máximo móvil; ensemble sin filtro de corte; pronósticos vencidos; observado anclado a gránulo antiguo; parámetros physrisk crudos o de calor mezclados en inundación.
- **Pruebas:** 24×5 mm/h = 120 mm en 24 h; pronóstico emitido después del corte excluido; lectura vencida no vigente; `no data != zero`; unidad fuera de dominio bloqueada/puesta en cuarentena; no confundir ventanas de 24 y 72 h.
- **Aceptación:** los errores reproducidos en B0 quedan corregidos, con tests negativos; toda salida incluye fuente/ventana/corte/frescura; ninguna fuente ausente se representa como seguridad.
- **Rollback:** mantener versiones y transformaciones anteriores aisladas, sin ocultar resultados nuevos bajo scores legados.

### B2 — Identidad física, padrón y jurisdicciones

**Depende de:** B0. **Paralelo a B1.**

- **Entregables:** `Establecimiento`, `Sede`, vínculo temporal, calidad de coordenadas, asociación jurisdiccional y roles/acciones; inventario de sedes compartidas y anexos; sistema de asignación con bandeja central de excepciones.
- **Pruebas:** dos establecimientos comparten sede sin duplicar edificio; traslado de sede conserva historia; establecimiento sin coordenadas sigue visible; jurisdicción desconocida va a central; jurisdicción fuera de permisos no recibe lectura/escritura indebida; re-asignación auditada.
- **Aceptación:** 100 % del padrón vigente representado, con relación física conocida o `unresolved`; todo registro tiene jurisdicción o cola de resolución; no se duplican afectaciones físicas por compartir edificio.
- **No hacer:** adivinar vínculos sede–establecimiento o corregir coordenadas automáticamente sin trazabilidad.

### B3 — Situación actual, cierre manual y verificaciones automáticas

**Depende de:** contrato mínimo B1 + identidad/jurisdicción mínima B2. **Puede liberarse sin B4/B5.**

- **Entregables:** impactos por ámbito, estados de verificación/evolución/gestión, idempotencia de partes offline, cierre autorizado por tipo, historial de revisiones, colas de acción, asignación por jurisdicción, reconfirmación sin cierre automático, actualización inmediata independiente del pronóstico.
- **Pruebas:** Esc. 93 con parte grave y pronóstico bajo; evacuación preventiva sin inundación; ruta 118 con alumnos aislados y sede seca; cierre de una afectación que deja otras activas; parte retroactivo no entra en backtest anterior; doble envío no duplica; actor no autorizado recibe 403; jurisdicción ambigua genera bandeja central.
- **Aceptación:** toda afectación grave vigente del conjunto de regresión produce caso/acción aunque IRO=0, sin OSM o geometría; ninguna afectación se cierra automáticamente; todas las tareas quedan asignadas o centralmente pendientes con motivo; trazabilidad íntegra.

### B4 — Cobertura y evaluación fluvial por tramo

**Depende de:** B1, B2; integra situación de B3 sin bloquearla.

- **Entregables:** tramos y estaciones aprobados conectados; asociaciones territoriales versionadas; evaluación del estado hidrométrico, tendencia y, donde sea fiable, pronóstico de caudal; cobertura completa de escuelas del ámbito y evidencia individual separada; explicación del resultado.
- **Pruebas:** Ituzaingó y Paso de los Libres como fixtures a reconciliar; río relevante + celda seca no descarta vigilancia; lluvia local 0 no diluye crecida; estación cercana de otro río no se asigna por distancia; coordenada de estación no validada aparece como limitación; lectura vencida no activa estado actual.
- **Aceptación:** todas las sedes vinculadas al ámbito pertinente reciben evaluación territorial, incluidas las sin exposición individual; ninguna es declarada inundada solo por localidad; asociaciones sin certeza identificadas y revisables.

### B5 — Evaluación pluvial y contexto del terreno

**Depende de:** B1 y geometría disponible de B2. **Paralelo a B4.**

- **Entregables:** agregaciones 1/3/6/24/72 h pertinentes, evaluación por horizonte, lluvia antecedente con frescura/cobertura, modificadores de susceptibilidad local documentados; reglas de exposición/impacto separadas; sin mezclar calor ni viento crónico.
- **Pruebas:** 24×5 mm = 120 mm; picos cortos preservados, ventanas móviles correctas; faltante del 20 % no se imputa como cero; physrisk con unidad errónea no satura score; fuente satelital ausente no borra pronóstico válido; aumento de amenaza pertinente no reduce arbitrariamente la evaluación con demás variables constantes.
- **Aceptación:** no se comparan unidades o períodos incompatibles; cambios de clasificación explicados, sin presentar probabilidades de impacto inexistentes; cobertura y resolución espacial visibles.

### B6 — Consecuencias, prioridades y consumidores unificados

**Depende de:** B3 + B4 + B5 (con posibilidad de liberar integraciones parciales por mecanismo).

- **Entregables:** contratos `MechanismAssessment`, `DecisionCase` y `PublishedSnapshot`; matriz de consecuencias edificio/acceso/comunidad/servicios/continuidad; preparación por exposición, respuesta por situación y verificación por incertidumbre; APIs comunes; mapa/ficha/radar/centro/briefing sin filtro exclusivo IRO.
- **Pruebas:** edificio seco + alumnos aislados entra en prioridad; centro de situación muestra casos con IRO legado 0; pronóstico grave de exposición desconocida no se convierte en inundación afirmada; múltiples señales del mismo episodio no generan tareas duplicadas; vista completa y briefing explican las mismas reglas/versiones; fuentes caídas muestran degradación.
- **Aceptación:** cero desapariciones de casos graves del conjunto de regresión por filtros de interfaz; todas las decisiones muestran evidencia, reglas, versiones y limitaciones; ranking y mapa usan semántica consistente.

### B7 — Servicios afectados por eventos climáticos (primera expansión)

**Depende de:** B3 y B6; usa B4/B5 como contexto de amenazas.

- **Entregables:** catálogo mínimo de electricidad, agua, comunicaciones y saneamiento/bombeo; partes de cortes; posibles interrupciones por amenaza diferenciadas de fallas observadas; dependencias conocidas; seguimiento/cierre y tareas con permisos por tipo; integraciones externas solo tras verificar cobertura/licencia.
- **Pruebas:** tormenta alta sin reporte no marca `power_loss` confirmado; corte eléctrico reportado aparece aunque pronóstico sea verde; bomba dependiente de energía eleva posible consecuencia sobre agua solo si la relación consta; servicio restaurado no autocierra otro; corte zonal sin granularidad individual genera exposición potencial, no falla corroborada por escuela; autorización de cierre por categoría.
- **Aceptación:** servicios son dimensión autónoma de situación y predicción; ninguna alerta meteorológica se transforma directamente en avería confirmada; los permisos y dependencias producen resultados auditables.

### B8 — Accesos territoriales con datos escasos

**Depende de:** B2, B3, B6. **Puede prepararse en paralelo con B7.**

- **Entregables:** red vial OSM o equivalente validada en cobertura, corredores potenciales por sede con etiqueta de incertidumbre, puntos críticos, cortes reportados vinculados a rutas/zonas, alternativas solo cuando estén verificadas; modelo futuro de origen–recorrido–escuela sin datos personales.
- **Pruebas:** un puente corto cortado basta para indicar interrupción potencial aunque un filtro por tres píxeles no lo detecte; caminos alternativos que comparten el mismo puente no se consideran independientes; falta OSM no bloquea parte de corte; corredor reportado de ruta 118 no implica corte de toda la ruta; isla con acceso fluvial no se declara conectada por red terrestre.
- **Aceptación:** información territorial disponible se utiliza sin inventar trayectos/personas aisladas; interrupciones observadas siempre visibles; limitaciones específicas para islas, red incompleta y conexiones desconocidas.

### B9 — Validación, observabilidad y despliegue controlado

**Depende de:** B1–B6 para el cambio principal; B7–B8 pueden incorporarse en releases independientes tras aprobar sus gates.

- **Entregables:** evaluador histórico bitemporal; conjunto de regresión operativa separado de conjunto predictivo; métricas por mecanismo/jurisdicción; análisis de sensibilidad/ablation; seguimiento de fuentes y publicación; comparación en sombra; flags de activación por consumidor y mecanismo; runbook de reversión.
- **Pruebas:** eventos separados temporalmente y por cuenca; negativo verificado distinto de ausencia de reporte; escenarios con fallos de ingestión, baja cobertura y coordenadas desplazadas; no fuga de futuro; medir tiempo de anticipación y verificaciones requeridas; revertir una publicación sin perder partes o trazas.
- **Aceptación:** criterios cuantitativos aprobados por responsables **antes** de evaluar; ningún empeoramiento grave sin explicación/aceptación formal; capacidad de rollback probada; reportes de cobertura y métricas reproducibles por versión.

## 10. Suite transversal de pruebas de aceptación

| ID | Caso | Aserción crítica | Batches |
|---|---|---|---|
| T01 | Parte vigente con amenaza meteorológica 0 | Situación y acción visibles | B3/B6 |
| T02 | Evacuación preventiva | No inventar agua en edificio | B3 |
| T03 | Alumnos aislados en sede seca | Acceso/comunidad afectados; edificio no | B3/B6 |
| T04 | Parte grave sin coordenadas | Visible y asignable | B2/B3 |
| T05 | Río sobre umbral + raster negativo | Vigilancia fluvial territorial incluida | B4 |
| T06 | Crecida aguas arriba + lluvia local 0 | Fluvial no diluido | B4/B6 |
| T07 | Único puente cortado | Posible desconexión sin umbral de 3 píxeles | B8 |
| T08 | Alternativa físicamente inutilizable | No mitiga el corte | B8 |
| T09 | Duplicado/reintento/corrección de parte | Idempotencia y audit trail | B3 |
| T10 | Parte con inicio retroactivo | No aparece antes de recepción en backtest | B1/B3/B9 |
| T11 | Ensemble emitido después de corte | Excluido | B1 |
| T12 | Pronóstico vencido | No se muestra como actual | B1 |
| T13 | 24 valores horarios × 5 mm | 120 mm en ventana pertinente | B1/B5 |
| T14 | Sin dato / observación parcial | Desconocido/degradado, nunca 0 por ausencia | B1/B5 |
| T15 | Sin historial + amenaza fuerte | No produce vulnerabilidad nula por construcción | B5/B6 |
| T16 | Indicador de calor mal tipado | No entra al mecanismo fluvial | B1/B5 |
| T17 | Ambiente demo | No contamina producción/validación | B1/B9 |
| T18 | Acceso reparado, edificio dañado | Se reduce una dimensión y se mantiene otra | B3/B6 |
| T19 | Dos CUE comparten sede | Una afectación física, consecuencias educativas separadas | B2/B6 |
| T20 | Jurisdicción faltante | Bandeja central + motivo + auditoría | B2/B3 |
| T21 | Actor sin facultades intenta cerrar daño técnico | 403, sin cambio y con rastro seguro | B2/B3/B7 |
| T22 | Alerta meteorológica fuerte sin corte eléctrico | Posible riesgo, no corte observado | B7 |
| T23 | Corte eléctrico + bomba dependiente conocida | Consecuencia potencial adicional documentada | B7 |
| T24 | Nueva versión de reglas sobre mismos insumos | Diff explicable; versión persistida | Todos/B9 |
| T25 | Falla del pronóstico mientras entra un parte | Parte visible inmediatamente; pronóstico degradado | B3/B6 |
| T26 | Cobertura provincial con sedes sin georreferencia | Todos en inventario; evaluación espacial desconocida cuando corresponda | B2/B6 |

### Capas de QA obligatorias por batch

- Unitarias de reglas puras y validaciones, con fixtures de fechas y unidades.
- Integración de adaptadores, DB, idempotencia y temporalidad (incluye reintentos y transacciones).
- Contrato de APIs y consumidores; pruebas de permisos en backend y aislamiento jurisdiccional.
- End-to-end para parte → situación → asignación → seguimiento → cierre, más evaluación → preparación.
- Replay histórico/sombra antes de cambiar el comportamiento en producción.
- Observabilidad: latencia, frescura, cobertura, errores de ingestión, pérdidas de asociación y diferencias de distribución.

## 11. Gates de promoción y métricas

### Gates absolutos (sin negociación cuantitativa)

1. No se publican datos de prueba como hechos reales.
2. Ningún parte grave vigente del conjunto de regresión se oculta por pronóstico 0 o ausencia espacial.
3. No se omite ningún establecimiento del padrón: si no hay datos suficientes, queda `unknown` con causa.
4. Pronósticos incompatibles o vencidos no se publican como evidencia actual.
5. Cierre, corroboración y reasignación requieren autorización servidor y producen auditoría.
6. Cada tarea tiene asignación jurisdiccional válida o bandeja central trazable.
7. No se inventa afectación individual por pertenencia a localidad ni por una alerta de corte zonal imprecisa.
8. No se pierde la capacidad de recibir partes por falla del cálculo predictivo.
9. Rollback de reglas/proyecciones probado sin borrar historia operativa.

### Métricas a acordar en B0 antes de promover

- **Predicción:** sensibilidad/recall de afectaciones graves verificadas; precisión solo donde hay negativos comprobables; anticipación en horas, por mecanismo y horizonte.
- **Gestión:** latencia de visibilidad desde recepción; tiempo de asignación; proporción de tareas resueltas/reasignadas; incidentes abiertos sin confirmación reciente.
- **Carga de trabajo:** verificaciones por jurisdicción/día; acciones duplicadas por episodio; tasa de verificación útil.
- **Cobertura:** padrón representado, geometría válida, cobertura de fuentes y capacidad de evaluar cada mecanismo.
- **Estabilidad:** oscilaciones de clasificación, faltantes por fuente, cambios de distribución atribuibles a datos vs reglas.
- **Equidad:** desempeño urbano/rural/islas/sin estación/sin coordenada.

**No inventar objetivos numéricos de precisión ni tiempos de respuesta:** deben negociarse con la capacidad operativa real y la línea de base; publicar los resultados con tamaños de muestra y limitaciones.

## 12. Desacuerdos con la propuesta original y resoluciones

| Punto | Resolución consolidada |
|---|---|
| Índice IRO único para prioridad | Reemplazar por evaluaciones por mecanismo + colas de acción; conservar IRO solo como legado de transición |
| Vulnerabilidad derivada principalmente de historial | Separar antecedentes, sesgo de reporte y susceptibilidad física; ausencia de historial no implica protección |
| Cobertura fluvial por localidad | Todos los vinculados participan, pero sin atribuir inundación individual por defecto |
| CUE como único objeto físico | Separación sede física–establecimiento–anexo, relaciones temporales y sin doble conteo |
| Acceso por rutas hogar–escuela desde el día uno | Posponer capa detallada; iniciar con acceso territorial y partes verificados |
| Prioridad única de máximo daño | Colas de respuesta, preparación, verificación y recuperación, coexistentes y deduplicadas |
| Dato vencido desaparece y baja riesgo | Último estado etiquetado, degrada vigencia y pide verificación; no se autocierra |
| Parte grave vs pronóstico bajo | El parte controla situación; el pronóstico controla anticipación; ambos alimentan acciones |
| Agregar múltiples fuentes rápido | Priorizar integridad y semántica antes de nuevas integraciones |
| Próxima expansión a cualquier amenaza | Servicios afectados por clima es la expansión comprometida; otras amenazas quedan extensibles |

## 13. Riesgos abiertos y decisiones institucionales necesarias

**Riesgos técnicos:** calidad y completitud del padrón geográfico; vínculos sede-CUE; asociaciones hidrológicas inicialmente aproximadas; resolución limitada de sensores; falta de cortes georreferenciados; dependencia y cobertura de redes de servicios desconocidas; sobrealertas al activar áreas amplias; sesgo del historial de reportes; reclasificaciones bruscas al corregir unidades; múltiples versiones temporales de UI.

**Decisiones por aprobar antes de activación real:**

1. Catálogo oficial de **tipos de afectación** y acciones permitidas para cada rol/autoridad; en particular daños estructurales, evacuación y servicios.
2. Organigrama/versiones de **jurisdicciones**, responsables operativos, suplencias, delegación, escalamiento y criterios de excepción.
3. Bandas de **preparación** basadas en exposición y sus acciones concretas, sin convertirlas en órdenes de evacuación.
4. Política de **vigencia/reconfirmación** por tipo de parte y fuente, sin cierre automático.
5. Catálogo de **estaciones/tramos/asociaciones** aprobado y procedimiento de revisión.
6. Objetivos cuantitativos de **latencia, detección, carga de verificación y tolerancia a sobrealertas**, fijados después de B0.
7. Política de **retención, acceso y publicación** de datos sensibles de estudiantes, docentes, familias y geolocalizaciones.
8. Autoridad que aprueba una nueva versión del motor, releases y reversiones.

Ninguno de estos puntos requiere rehacer la arquitectura si se expresa como políticas versionadas en lugar de condiciones incrustadas en código.

## 14. Definición de terminado por batch

Un batch está terminado únicamente cuando: (1) cumple sus escenarios de aceptación, (2) pruebas unitarias e integración pertinentes pasan, (3) no rompe casos previos, (4) se explica el diff por escuela/episodio, (5) registra versiones de código/contrato/reglas/fuentes, (6) mide cobertura y frescura, (7) documenta límites y riesgos residuales, (8) existe plan de rollback, (9) el cambio se verifica en sombra cuando puede alterar decisiones operativas y (10) se obtiene aprobación institucional cuando la funcionalidad cambia competencias, permisos o acciones recomendadas.

**Regla final de producto:** para cada establecimiento, el sistema debe poder distinguir con evidencia: qué sucede, qué podría suceder, qué consecuencias tiene o tendría, cuándo podría ocurrir, qué información falta, quién debe actuar y quién puede confirmar su resolución.

---


## 15. Registro de decisiones arquitectónicas (ADR)

Este registro permite continuar iterando sin perder **por qué** se eligió una dirección. Las decisiones confirmadas por el proyecto tienen otro estatus que las recomendaciones técnicas. Registrar fecha, motivación, opciones y evidencia para revisarlas.

| ADR | Estado | Decisión | Argumento principal | Condición de revisión |
|---|---|---|---|---|
| ADR-001 | Confirmada | Anticipación y gestión con igual peso funcional | Son dos objetivos, con evidencias y métricas distintos | Cambia mandato institucional |
| ADR-002 | Recomendada | Separar motor predictivo de situación | Un pronóstico no anula un hecho y una ingesta caída no bloquea partes | Necesidad demostrada de operación unificada |
| ADR-003 | Recomendada | No reemplazar IRO por otro promedio universal | Dilución entre mecanismos y falsa precisión | Evidencia amplia permite estadística calibrada por impacto |
| ADR-004 | Confirmada | Toda Corrientes desde el padrón | Evita sesgos por zonas sin datos | Cambia alcance político-administrativo |
| ADR-005 | Recomendada | Cobertura ≠ precisión; abstención explícita | Una celda no conoce profundidad en el edificio | Aparecen datos locales verificables para todos los sitios |
| ADR-006 | Recomendada | Separar sede física, establecimientos y anexos | Afectación física única, consecuencias educativas múltiples | Padrón oficial revela otro modelo de identidad |
| ADR-007 | Confirmada | Fuentes principalmente remotas | Escala provincial y bajo costo de relevamiento | Se dispone de relevamiento completo sostenible |
| ADR-008 | Recomendada | Asociación fluvial por tramo + exposición progresiva | Corrige omisiones sin afirmar inundación universal | Nueva cartografía hidráulica validada |
| ADR-009 | Confirmada | Sin rutas detalladas hoy | Impide atribuir aislamiento específico sin datos | Se incorporan orígenes y recorridos reales agregados |
| ADR-010 | Confirmada | Cierre de afectaciones manual | Recuperación debe ser constatada y autorizada | Nueva política institucional aprobada |
| ADR-011 | Confirmada | Permisos según tipo de situación | No todas las autoridades pueden cerrar lo mismo | Matriz normativa detallada |
| ADR-012 | Confirmada | Distribuir tareas automáticamente por jurisdicción | Escalabilidad de supervisión provincial | Cambia estructura/competencia jurisdiccional |
| ADR-013 | Confirmada | Preparación según exposición ante pronóstico grave | Evita declarar impactos sin reportes | Calibración muestra mejor política de acción |
| ADR-014 | Confirmada | Primera expansión: servicios | Gran relevancia operativa y reportes estructurables | Prioridad institucional cambia |
| ADR-015 | Recomendada | Bitemporalidad y fuentes versionadas | Evita fuga de futuro y explica decisiones históricas | Nunca eliminar necesidad de trazabilidad |
| ADR-016 | Recomendada | Regla de precedencia por afirmación | Situación y anticipación no se cancelan entre sí | Validación operativa de conflictos |
| ADR-017 | Recomendada | Histéresis para alertas, no autocierre de partes | Evita oscilación sin esconder daños | Evidencia de episodios y SLA por mecanismo |
| ADR-018 | Recomendada | Reglas explicables primero, ML después | Dataset inicial insuficiente y con sesgo de reporte | Validación independiente y muestra adecuada |
| ADR-019 | Recomendada | Modularidad dentro de arquitectura simple inicialmente | Evita sobrecostos de microservicios prematuros | Escala/aislamiento operativo requiere separación |
| ADR-020 | Recomendada | Validación de predicción separada de atención operativa | Reflejar un parte no es anticipar una afectación | Requiere mantenerse por integridad de métricas |

**Formato para nueva ADR:** contexto; decisión; alternativas consideradas; evidencia que la soporta; ventajas; consecuencias; criterio de falsación/revisión; responsable institucional/técnico; versión/reglas afectadas. Nunca borrar una ADR sustituida: marcarla `superseded` y vincular su sucesora.

## 16. Ejercicios de razonamiento con casos reales citados y escenarios sintéticos

Las referencias escolares de esta sección son **antecedentes del documento de origen**, no certificaciones actuales. No completar hechos ausentes mediante inferencias automáticas.

### 16.1. Escuela 93 — discordancia entre parte y modelo

**Antecedentes:** se comunicó una inundación; la revisión anterior encontró estado `evacuado`, motivo «Evacuación preventiva», y riesgo bajo/0. **No** se confirma que el estado `evacuado` pruebe ingreso de agua a las aulas.

- **Error del diseño anterior:** score 0 se impone en el ranking operativo aunque pueda existir un parte importante.
- **Separación propuesta:** registrar la medida preventiva como hecho/acción; registrar por separado cualquier afirmación sobre inundación física con evidencia correspondiente.
- **Acción:** mostrar situación reportada y verificar alcance y validez temporal. Si se corrobora agua en edificio, tratarlo como afectación física específica, sin pedir raster positivo.
- **Cierre:** la medida preventiva y la afectación material, si existe, tienen ciclos independientes y permisos según tipo.
- **Prueba:** una modificación del pronóstico a verde no elimina la ficha ni la tarea; cambiar `evacuado` a `edificio inundado` exige evidencia y no es conversión implícita.

### 16.2. Escuelas 874 y 532 — aislamiento de alumnos sin edificio anegado

**Antecedentes:** se mencionaron alumnos que no podían salir de sus hogares asociados al corredor de la ruta 118. No está corroborado que la ruta completa esté cortada ni se dispone de los orígenes de todos los alumnos.

- **Error:** evaluar únicamente el camino sede–cabecera o un índice OSM y concluir que «escuela accesible» implica que su comunidad puede concurrir.
- **Salida correcta:** acceso/comunidad con afectación **reportada**, sin marcar el edificio como inundado y sin cuantificar más alumnos que los corroborados.
- **Evolución:** primera fase, referencia territorial a corredor aproximado; fase posterior, segmentos/puntos críticos y orígenes agregados.
- **Prueba:** el mismo CUE con OSM sin información y con parte activo debe entrar igualmente en respuesta; la ausencia de geometría fina no borra el reporte.

### 16.3. Ituzaingó y Paso de los Libres — cobertura frente a sobrealerta

**Antecedentes de sesión previa:** estaciones comunicadas sobre umbral de evacuación y múltiples escuelas clasificadas en bajo. Antes de inferir errores vigentes, reconciliar productor, altura, fecha, vinculación geográfica, datum y versión de motor.

- **Error potencial:** condicionar la señal fluvial a una celda individual positiva, con omisiones por resolución del raster.
- **Corrección:** evaluación de **todas las sedes vinculadas al tramo/aplicabilidad**; mantener subgrupos de exposición individual conocida, exposición plausible y exposición desconocida.
- **Lo que no se hace:** pintar toda localidad como «edificio inundado» ni usar como absolutos umbrales de estación desligados de su curso/cota.
- **Validación:** medir cuántas sedes antes omitidas entran en vigilancia y cuántas tareas adicionales genera; inspeccionar especialmente escuelas en lugares físicamente altos o desligados del tramo.

### 16.4. Escuela 377, Isla Talar — desplazamiento comunitario

**Antecedente:** se informó que dos familias podían abandonar sus casas. Eso no es equivalente a evacuación del establecimiento ni a inundación física de la sede.

- **Representación:** candidato de consecuencia sobre la comunidad, con nivel de verificación y tiempo; posible acción de contacto o seguimiento.
- **Incertidumbre:** aclarar si hubo desplazamiento, si afectó asistencia y qué relación guarda con la escuela, sin publicar identidades de familias.
- **Movilidad:** reconocer acceso fluvial cuando aplique; no declarar conectividad terrestre por defecto.
- **Prueba:** la afirmación «dos familias iban a abandonar» no incrementa automáticamente contadores de escuelas evacuadas o edificios con agua.

### 16.5. Caso sintético A — dos instituciones, una sede, corte de energía

Un mismo predio es utilizado por dos instituciones en distintos turnos; se confirma la caída de red eléctrica.

- **Hecho:** 1 sede/activo con falla; 2 establecimientos potencialmente afectados.
- **Efecto:** registrar consecuencias por turno/servicio solo si hay relación conocida; deduplicar incidente físico y tareas idénticas de prestador.
- **Variación:** si solo una institución necesita conectividad para una actividad, sus consecuencias de continuidad pueden diferir aun compartiendo edificio.
- **Regla:** contar sedes físicas y establecimientos administrativos con indicadores separados, no sumar como si fueran equivalentes.

### 16.6. Caso sintético B — lluvia intensa con dato antecedente obsoleto

El pronóstico de 24 horas es reciente; el producto satelital de lluvia antecedente tiene 30 % de faltantes y finaliza varias horas antes de la ventana esperada.

- **Evitar:** reemplazar el 30 % faltante por cero o declarar antecedente seco.
- **Posible salida:** evaluar el pronóstico si sus datos son válidos; marcar contexto antecedente no evaluable o degradado, según las reglas del mecanismo.
- **Acción:** verificación dirigida cuando el contexto faltante cambie decisiones relevantes; no abrir automáticamente incidentes físicos.
- **Prueba:** la pérdida del satélite no reduce artificialmente la amenaza pronosticada ni mejora el estado del terreno.

### 16.7. Caso sintético C — bajante y recuperación desigual

La estación desciende, el acceso vuelve a ser transitable, pero quedan daños en instalación eléctrica de la sede.

- **Modelo correcto:** desciende la amenaza fluvial actual; se puede cerrar **acceso interrumpido** por decisión competente; continúa la afectación eléctrica hasta su propio cierre.
- **Error a evitar:** un botón «recuperado» global que borre simultáneamente todas las afectaciones del CUE.
- **Prueba:** cierre por tipo y ámbito no altera otros incidentes vinculados al episodio.

## 17. Diseño de validación científica, operativa y de equidad

### 17.1. Cuatro preguntas de evaluación distintas

| Evaluación | Qué demostrar | Conjunto de referencia | Métrica correcta |
|---|---|---|---|
| **Coherencia operativa** | Un hecho conocido aparece rápidamente y con el alcance adecuado | Casos de partes/cierres revisados | Latencia, omisiones de UI, duplicaciones, permisos |
| **Detección territorial** | Una crecida/tormenta es reconocida en su ámbito | Eventos y estaciones/áreas verificadas | Sensibilidad territorial y carga de vigilancia |
| **Impacto previsto por escuela** | El sistema anticipa una consecuencia ANTES de conocer el parte | Impactos fechados y negativos verificados | Sensibilidad, precisión, anticipación, calibración si hay probabilidad |
| **Recuperación** | Disminuye alertas cuando corresponde sin cierre prematuro | Reaperturas/confirmaciones y seguimiento | Errores de cierre, oscilaciones, tiempo de resolución |

No contar la reproducción correcta de un parte como éxito predictivo independiente cuando ese mismo parte fue usado como entrada. La precisión de «evento publicado respaldado por noticia» es procedencia, no precisión de impacto escolar.

### 17.2. Qué cuenta como negativo

- **Negativo verificado:** consta observación suficiente de que el impacto definido no ocurrió en el ámbito y ventana evaluados.
- **Sin reporte:** no existe registro de impacto; se desconoce si faltó seguimiento o conectividad.
- **Prevención efectiva:** no hubo impacto porque una acción redujo exposición; no clasificarla automáticamente como falsa alarma sin considerar su contrafactual.
- **Fuera de cobertura:** no hay dato predictivo apropiado; excluir del denominador pertinente o tratar como abstención, pero reportar cobertura.

La evaluación debe distinguir *impacto físico* de *interrupción educativa*, que pueden divergir: un cierre preventivo puede preservar la seguridad y seguir alterando la continuidad de clases.

### 17.3. Particiones sin fuga temporal ni espacial

- Separar por **episodio**, período y, cuando sea posible, cuenca/región, no dividir aleatoriamente escuelas contiguas del mismo evento entre train/test.
- Versionar datos históricos de territorio, padrón, geometría y fuentes, no utilizar para un backtest reglas o mapas incorporados posteriormente sin indicar que es reconstrucción retrospectiva.
- Guardar `asOf` **y** `knownAtCutoff`; un reporte ingresado el miércoles con fecha de afectación del martes no existía para el operador el martes.
- Separar corridas **operativas históricas** (solo conocimiento disponible) y **reconstrucciones corregidas** (conocimiento posterior). No mezclar sus métricas.
- Controlar estaciones/fuentes que dejen de operar, cambio de régimen meteorológico y modificaciones de infraestructura durante la serie histórica.

### 17.4. Medir costos asimétricos sin saturar la respuesta

Perder una afectación escolar grave puede ser más costoso que una verificación adicional, pero enviar cientos de llamadas diarias reduce la capacidad de atender las realmente críticas. Elegir thresholds considerando:

1. **Omisión:** impacto grave no detectado o detectado demasiado tarde.
2. **Sobrealerta:** preparación o verificación sin base suficiente para una acción útil.
3. **Demora:** horas entre primer dato útil, decisión y acción; distinguir de horas entre impacto y reporte tardío.
4. **Oscilación:** cambios frecuentes que dificultan gestión.
5. **Equidad:** escuelas remotas, pequeñas, isleñas o con pocos reportes no deben caer sistemáticamente al fondo.
6. **Capacidad:** tareas por equipo/jurisdicción/día, pendientes y vencimientos; no solo conteo provincial bruto.

Los objetivos cuantitativos se basarán en datos de B0 y consulta operativa, **antes** de usar el conjunto reservado para declarar éxito. No inventar sensibilidad del 95 %, SLA de una hora ni tolerancia universal de falsas alarmas sin línea de base.

### 17.5. Experimentos de sensibilidad/ablation

Construir reportes controlados que repitan el mismo episodio retirando una entrada por vez:

- Sin observación de nivel actual, con pronóstico fluvial presente.
- Sin pluviosatélite, con pronóstico válido.
- Con coordenadas perturbadas dentro de su incertidumbre.
- Con corte de un único puente corto y sin modelo raster positivo.
- Con una sede agregada a un edificio previamente compartido.
- Con parte de evacuación preventivo vs parte de agua efectivamente dentro del edificio.
- Con observación antigua más un estado del productor marcado `vigente`.

**Resultado deseable:** explicar qué decisiones dependen de cada fuente. No exigir que toda pérdida de dato conserve exactamente la misma alerta: puede pasar a `no_evaluable`, pero jamás presentar el cambio como mejoría meteorológica no observada.

## 18. Gobernanza, seguridad y operación cotidiana

### 18.1. Política de permisos: role + type + action + jurisdiction

Un rol aislado no alcanza. Cada solicitud de escritura verifica: actor autenticado; permiso de acción; tipo de afectación; ámbito físico/administrativo; jurisdicción vigente; delegación temporal; estado actual y versión esperada. Las operaciones relevantes requieren justificación/auditoría.

| Operación | Restricción adicional |
|---|---|
| Crear parte | Actor vinculado a sede/establecimiento o habilitado por jurisdicción |
| Corroborar impacto educativo | Delegación de corroboración para ese tipo y ámbito |
| Corroborar daño edilicio | Competencia técnica definida por la política aprobada |
| Cerrar evacuación preventiva | Autoridad definida por procedimiento institucional; no la deduce software |
| Cerrar corte de servicio | Depende de si se cierra reporte institucional o constatación técnica |
| Cambiar tramo asociado | Revisión técnica y versionado geográfico, fuera del flujo simple de partes |
| Reasignar caso | Mismo ámbito o privilegio de coordinación interjurisdiccional |

**Prueba de seguridad:** un administrador tecnológico sin competencia de cierre no puede cerrar un incidente solamente por tener acceso al panel de mantenimiento.

### 18.2. Asignación jurisdiccional con excepciones

La ruta de asignación automática debe ejecutarse de forma determinista y auditable:

```text
identificar objetivo y jurisdicción vigente
  → identificar tipo de situación y tarea
  → resolver política/versión y responsable activo
  → asignar con identificador y notificación
  → si jurisdicción ambigua, sin responsable o fallo:
       bandeja central + causa + tarea de saneamiento
  → si el responsable rechaza o no puede actuar:
       reasignar/escalar según política aprobada
```

Para establecimientos compartidos por una sede y jurisdicciones administrativas distintas, distinguir **atención física** (posible responsable único de sede) y **comunicación educativa** (varios establecimientos). No enviar tareas duplicadas de reparar el mismo tablero eléctrico si se comparten instalaciones; sí notificar a los actores afectados cuando corresponda.

### 18.3. Gestión de cola, incidentes y reconfirmación

- Una **alerta predictiva** tiene horizonte y caducidad; su actualización depende del nuevo pronóstico.
- Una **afectación reportada** tiene ciclo humano; su confirmación puede vencer, pero el impacto no se cierra sin autorización.
- Una **tarea** tiene estado propio: propuesta, asignada, aceptada, en curso, finalizada, cancelada con motivo o escalada.
- Un **episodio** agrupa causalmente casos territoriales, pero no puede cerrarlos en bloque si hay afectaciones no resueltas.
- Una **reconfirmación** pregunta por la situación y agrega evidencia; no reabre un incidente por cada intento de contacto.

Definir límites de atención por jurisdicción e interfaces para redistribuir cargas. Que la capacidad central sea dedicada no significa ilimitada; las tareas de bajo impacto pueden agruparse en un único operativo territorial si esa decisión es verificable y reversible.

### 18.4. Protección de datos y separación de visibilidad

Evitar domicilios y trazas individuales de alumnos. Registrar zonas de origen agregadas si resultan necesarias; distinguir información pública, interna y restringida. Las fichas públicas no deben revelar familias evacuadas, coordenadas privadas ni detalles sensibles de movilidad. Los historiales de cambios de usuarios y cierres necesitan retención y auditoría definidas. Es una **recomendación de privacidad y seguridad**: la normativa aplicable debe revisarse por la autoridad competente.

### 18.5. Observabilidad que mide utilidad, no solamente uptime

| Monitor | Señal de degradación | Respuesta esperada |
|---|---|---|
| Ingesta por fuente | No llegó ciclo esperado / unidad inválida | Alerta técnica; evidencia previa marcada con edad |
| Cobertura espacial | Aumentan sedes fuera de cobertura | Reporte de territorio y priorización de corrección |
| Cobertura institucional | Sedes sin jurisdicción/responsable | Bandeja central y tarea de padrón |
| Calidad temporal | Se incorpora pronóstico emitido en el futuro del corte | Bloquear publicación y abrir incidente técnico |
| Duplicados | Exceso de partes/reintentos sobre el mismo episodio | Investigar clave idempotente y agrupación |
| Cambios masivos en distribución | Salto por versión de modelo o fuente | Comparación antes/después y suspensión de promoción |
| Carga de verificación | Cola crece por encima de capacidad aprobada | Agrupar/repriorizar, revisar reglas; nunca ocultar casos |
| Consistencia consumidores | Centro, ficha y mapa discrepan sobre situación | Error de contrato/snapshot que bloquea release |

La corrida `completed` no basta para declarar estado saludable: incluir frescura, cobertura, número de evaluaciones abstinentes, errores por fuente y antigüedad del resultado servido.

## 19. Entrega incremental: criterio de salida de cada batch y gobernanza de cambios

### 19.1. Paquete mínimo obligatorio para presentar un batch

Cada batch debe producir un **paquete de evidencia**, no solo un PR:

1. `design.md`: objetivo, hipótesis, decisiones, entradas y exclusiones.
2. `contracts.md`: tipos, unidades, fechas, atributos de calidad, permisos y migraciones.
3. `implementation/`: código y migraciones, con compatibilidad hacia atrás donde aplique.
4. `test-report.md`: unitarias, integración, seguridad, regresión y escenarios de fallo.
5. `diff-report.md`: efectos antes/después por sede/episodio/jurisdicción, cobertura y ejemplos.
6. `decision-log.md`: cambios de reglas/umbrales y responsable de aprobarlos.
7. `rollback.md`: cómo volver sin perder partes ni historial; ensayo documentado.
8. `open-questions.md`: incertidumbres no resueltas y datos necesarios.

Es una estructura ilustrativa para facilitar trabajo distribuido. No exige crear literalmente estas carpetas si el repositorio ya tiene convenciones equivalentes.

### 19.2. Método de trabajo por batches

Separar **discovery y plan** de **implementación**. Antes de alterar código, identificar componentes afectados, lectores/consumidores, regresiones, migraciones y contratos; aprobar el plan y luego desarrollar en PRs aislados. La inspección puede realizarse en paralelo por fuente o mecanismo, pero dos cambios que modifican el mismo contrato de evaluación deben coordinarse mediante versión explícita.

| Etapa del batch | Pregunta que debe responder | Salida verificable |
|---|---|---|
| Inventario | ¿Qué código y datos existen realmente en la versión desplegada? | Mapa de componentes y diferencias |
| Diseño | ¿Qué regla cambia y por qué? | ADR y contrato de semántica |
| Prueba primero | ¿Cómo probaría que el problema existe? | Fixture/test rojo reproducible cuando aplique |
| Implementación | ¿Qué cambió y qué no debería haber cambiado? | PR acotado con versionado |
| Validación | ¿Mejora casos graves sin introducir daños secundarios? | Diff por episodio/sede y cobertura |
| Publicación | ¿Cómo se habilita y deshabilita? | Feature flag, runbook, observabilidad |

### 19.3. Tres puertas de despliegue

- **Gate funcional:** los contratos y escenarios obligatorios pasan, sin pérdidas silenciosas de casos operativos graves.
- **Gate metodológico:** no se mezclan unidades, temporalidades, identidades físicas o probabilidades no calibradas; cobertura y abstenciones se publican.
- **Gate institucional:** tipos de acción, autorizaciones, asignaciones, visibilidad y procedimientos de contingencia están aprobados por responsables válidos.

Las métricas predictivas solo forman parte del gate en los releases que hagan afirmaciones predictivas evaluables, pero en esos casos **deben medirse antes del despliegue**, no presentarse como una mejora inferida por más alertas.

### 19.4. Independencia de prioridades de implementación

**Secuencia recomendada de primeras entregas:**

- **Bloque urgente A:** eliminar invisibilidad operativa de partes/afectaciones graves (B3, con contratos mínimos B1/B2).
- **Bloque urgente B:** corregir integridad temporal, unidades, acumulados y vigencia (B1).
- **Bloque de territorio:** normalizar sedes y jurisdicciones (B2) y conectar relaciones fluviales (B4).
- **Bloque predictivo:** separar fluvial/pluvial (B4/B5), emitir impactos previstos sin contaminarlos con partes.
- **Bloque producto:** decisiones y consumidores (B6), luego servicios B7 y accesos B8; B9 acompaña con validación desde los primeros batches y formaliza promoción final.

Aunque B9 se liste último por su cierre de promoción, **sus fixtures, líneas de base y pruebas deben prepararse desde B0**. No esperar al final para descubrir que no existen episodios verificables o que faltan negativos.

## 20. Hipótesis, incertidumbres y preguntas para iteraciones posteriores

### 20.1. Hipótesis prioritarias a comprobar

| Hipótesis | Evidencia que la confirmaría o refutaría | Impacto de la decisión |
|---|---|---|
| H-01: tramos aprobados reducen omisiones fluviales | Episodios con asociación estación–tramo revisada y sedes afectadas/no afectadas | B4, cobertura y sobrealertas |
| H-02: lluvia antecedente mejora detección pluvial | Partes pluviales fechados, pluviómetros, productos satelitales comparables | B5, nuevas señales y thresholds |
| H-03: DEM/rasters aportan exposición individual útil | Verificaciones georreferenciadas y sensibilidad a coordenadas | B4/B5, uso como modificador o contexto |
| H-04: distribución automática mejora latencia | Tiempos de asignación, aceptación y resolución por jurisdicción | B2/B3, organización operativa |
| H-05: cortes de servicios pueden estructurarse | Tasa de partes válidos, fuentes externas pertinentes y cierres verificables | B7, amplitud de servicio |
| H-06: red vial disponible aporta valor predictivo | Cortes localizados, calidad de red y rutas alternativas reales | B8, hasta dónde automatizar movilidad |
| H-07: varios tipos de cola reducen saturación | Comparación de volumen útil de tareas y casos omitidos | B6, diseño de tablero |

### 20.2. Preguntas que siguen abiertas, agrupadas por responsable

**Institucionales (no inferirlas de la aplicación):** ¿qué cargos tienen facultad de corroborar/cerrar cada tipo de impacto?, ¿qué norma/regla autoriza escalamiento?, ¿qué eventos merecen intervención y cuáles solo vigilancia?, ¿qué indicadores se pueden publicar hacia fuera? Las decisiones de esquema RBAC son recomendaciones hasta validación formal.

**Territoriales:** ¿cuál es la fuente canónica de sedes y anexos?, ¿cómo se versionan cambios de jurisdicción?, ¿qué tan confiables son coordenadas de sedes y estaciones?, ¿qué tramos y parajes carecen de asociación revisada?

**Meteorológicas e hidrológicas:** ¿qué productos se encuentran efectivamente disponibles por región y horizonte?, ¿cuáles tienen calidad suficiente para predicción por sede?, ¿cuál es la frescura admisible de cada uno?, ¿qué umbrales fluviales tienen fuente y validación vigentes?

**Operativas:** ¿qué volumen máximo de verificaciones puede procesar cada nivel?, ¿qué plazo de reconfirmación corresponde a cada afectación?, ¿cómo se detecta que una medida preventiva se ejecutó y sigue vigente?

**Metodológicas:** ¿cómo conseguir negativos verificados?, ¿qué períodos/episodios reservar para validación?, ¿qué costo de omisión y sobrealerta se acepta por mecanismo?, ¿con qué criterio se decide que una capacidad de mitigación sigue siendo válida?

**Regla de iteración:** cada pregunta que pueda cambiar una prioridad, permiso o afirmación predictiva debe resolverse mediante evidencia o política aprobada antes de codificar ese comportamiento. Otras preguntas pueden permanecer abiertas si la salida muestra explícitamente limitaciones y abstenciones.

### 20.3. Cómo saber que el documento está listo para implementación de una capacidad

Una capacidad de un batch puede considerarse especificada cuando responde sin contradicción:

- Qué fenómeno/impacto se modela y para qué ámbito.
- Qué fuente entra y bajo qué unidades/ventanas/espacio/frescura.
- Qué significa cada salida y qué **no** demuestra.
- Qué se hace cuando la información falta, contradice o vence.
- Qué acción se dispara y qué institución puede ejecutarla/cerrarla.
- Qué evidencia explica un ascenso o descenso de prioridad.
- Qué fixture reproducible demuestra el resultado y qué conjunto independiente lo valida.
- Qué consumidores, métricas y procesos de reversión se afectan.

Si falta cualquiera de esas respuestas, el diseño puede seguir como hipótesis, pero no debería presentarse como comportamiento institucional ya validado.

## 21. Trazabilidad documental, referencias y guía de próxima iteración

### 21.1. Material de base y jerarquía de afirmaciones

1. **Documento diagnóstico original:** `propuesta-mejora-modelo-riesgo-escolar.md`, fechado el 14/10/2026. Aporta comportamiento local inspeccionado, casos antecedentes, hallazgos de pruebas y propuestas originales. La referencia a `motor-v0.3` es evidencia de una sesión anterior, **no** auditoría de este documento.
2. **Especificación v1.0 de arquitectura:** conserva la identificación de reglas R-E/R-S/R-F/R-P/R-A/R-V/R-D, contratos, responsabilidades, batches B0–B9, criterios de aceptación y escenarios T01–T26. **Esta v2.0 la incorpora íntegramente como base y la profundiza.**
3. **Decisiones explícitas del proyecto:** cobertura Corrientes, dos objetivos, fuentes remotas, sedes/anexos, poca movilidad, equipo central, cierres manuales, autorización por tipo, asignación por jurisdicción, preparación por exposición y primera expansión hacia servicios.
4. **Análisis de diseño agregado aquí:** desacuerdos sobre índice universal, salida por impacto/cola, incertidumbre no multiplicativa, identidad física, contratos de inferencia, criterios de abstención, situaciones sintéticas, mitigaciones por ámbito y registro de hipótesis. Son recomendaciones argumentadas, no hallazgos de auditoría de producción.

**Referencias externas citadas por el documento de origen, que deben verificarse nuevamente si se usan como base contractual de una integración:** inventario de peligros PhysRisk, documentación ECMWF/Open-Meteo sobre precipitación horaria, documentación GloFAS y fichas Copernicus DEM. Los enlaces originales y rutas de código están en el diagnóstico; este documento no afirma haber vuelto a consultar esas fuentes.

### 21.2. Lectura recomendada para una reunión de revisión

- Leer **0, 15 y 20** para debatir principios, decisiones y preguntas aún abiertas.
- Leer **3–8** para evaluar el contrato técnico y las reglas que reemplazan al IRO.
- Leer **9–11 y 19** para organizar implementación, QA y despliegue.
- Leer **16–17** para poner a prueba si el diseño representa casos conocidos y predice impactos reales.
- Leer **6 y 18** con responsables institucionales, especialmente los permisos de cierre y el alcance jurisdiccional.

### 21.3. Próxima iteración recomendada

1. Revisar con B0 el checkout, versión de producción y casos Ituzaingó, Libres, Escuela 93, ruta 118 e Isla Talar.
2. Resolver el esquema real de padrón y sedes, nombres de jurisdicciones y tipos de parte; documentar divergencias del modelo conceptual.
3. Aprobar el contrato `Evidence` + `ImpactReport` y una primera tabla de permisos por tipo de situación.
4. Establecer pruebas de reproducción de unidades/ventanas y partes invisibles antes de implementación.
5. Preparar B1/B2 paralelos y un recorte B3 prioritario; conservar el IRO legado en paralelo, sin permitir que vuelva a ocultar casos.

**Criterio final de calidad del producto:** frente a una escuela, el sistema debe responder *qué está sucediendo; qué podría suceder; por qué creemos que podría ocurrir; en qué sede, comunidad, acceso o servicio; con qué limitaciones; qué tiempo útil queda para actuar; quién recibe la tarea; y qué evidencia permite reducir o cerrar la situación*. Si necesita un único número para responder cualquiera de esas preguntas, la representación todavía es insuficiente.
