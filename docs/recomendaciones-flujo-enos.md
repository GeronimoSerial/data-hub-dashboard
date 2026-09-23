# Recomendaciones para el flujo ENOS completo

**Propósito.** Evolucionar el Hub de Datos de Corrientes desde un mapa de partes hacia un sistema que ayude a preparar, verificar, responder y recuperar la continuidad educativa durante eventos hidrometeorológicos en un contexto ENOS. Son recomendaciones de producto y operación; este documento no declara vigente ningún protocolo oficial ni propone implementar todo de una vez.

**Decisión central.** Cada vista debe permitir responder dos preguntas: «¿Qué sabemos de esta escuela y cuán reciente es?» y «¿Qué acción corresponde, a quién y hasta cuándo?». El mapa es una entrada geográfica a esas respuestas; la lista y el historial deben permitir hacer el mismo trabajo aun cuando falten coordenadas.

## Recorrido recomendado

| Momento | Pregunta principal | Resultado que debe quedar registrado |
|---|---|---|
| Preparación estacional | ¿Qué escuelas, accesos y centros necesitan revisión previa? | Universo escolar, antecedentes, responsables y tareas de preparación |
| Vigilancia y alerta | ¿A quién hay que pedir una verificación ante una señal oficial? | Solicitud dirigida con fuente, área, emisión, plazo y destinatarios |
| Reporte escolar | ¿Qué ocurre realmente y desde cuándo? | Confirmación sin afectación o parte con servicio, edificio y afectaciones |
| Triage | ¿Qué casos necesitan contacto o decisión primero? | Cola ordenada por razones explícitas y dueño del caso |
| Respuesta | ¿Qué se hizo y cómo continúa la enseñanza? | Intervención, responsable, plazo y modalidad educativa |
| Recuperación | ¿Qué se restableció y qué queda pendiente? | Resolución validada, duración de interrupciones y revisión del episodio |

El recorrido debe admitir varias alertas y varias interrupciones de una misma escuela durante un período ENOS. Una escuela puede mejorar y volver a afectarse.

## 1. Fundamentos de información

### 1.1 Separar cinco niveles de evidencia

Representar independientemente:

1. **Contexto ENOS:** fase, probabilidad, período de validez, fecha y organismo emisor. Sirve para preparación de semanas o meses.
2. **Pronóstico y alerta territorial:** tipo de amenaza, área, nivel y vigencia. Sirve para intensificar vigilancia y solicitar verificaciones.
3. **Observación local:** lluvia, altura de río, estado de accesos u otra medición, con estación, hora y calidad. Sirve para elegir dónde verificar primero.
4. **Situación de la escuela:** servicio educativo, uso del edificio, afectaciones y personas alcanzadas, con autor y vigencia.
5. **Intervención:** contacto, derivación, continuidad pedagógica, reparación y resolución confirmada.

Un nivel no debe completar automáticamente otro. Una fase El Niño no demuestra daño en una escuela; una alerta no implica suspensión; ausencia de parte no significa normalidad. Cada afirmación visible debe llevar su nivel, fuente y hora.

### 1.2 Fijar el universo escolar y el corte

Adoptar un denominador oficial de CUE-anexo activos. Mientras el padrón institucional no identifique la actividad con vigencia explícita, usar provisionalmente los CUE-anexo distintos con secciones en el corte GE vigente; mostrar aparte escuelas con localización pero sin secciones y partes sin cruce con el padrón. Publicar la definición provisional junto a cada porcentaje.

Versionar el universo y sus exclusiones: escuela cerrada, anexo nuevo, CUE sin cruce, duplicado, sin secciones o sin ubicación. Cada excepción necesita responsable de conciliación. El denominador provincial y el departamental deben provenir del mismo corte, para que las cifras se puedan reproducir.

### 1.3 Usar estados independientes

| Eje | Estados que conviene distinguir |
|---|---|
| Verificación | No solicitada; solicitada pendiente; confirmó sin afectación; informó afectación; respuesta vencida |
| Servicio | Normal; suspensión parcial; suspensión total; desconocido |
| Edificio | Habitual; evacuado; centro de evacuados; desconocido |
| Gestión | Sin asignar; tomada; en trámite; derivada; pendiente de validación; cerrada |
| Calidad | Actualizado; vencido; sin corte GE; CUE sin cruce; coordenada ausente o aproximada |

Una escuela puede ser centro de evacuados y tener clases parcialmente suspendidas; otra puede estar en una zona con alerta sin haber respondido. «Confirmó sin afectación» requiere autor y hora: es un dato positivo, no la ausencia de un parte.

### 1.4 Establecer autoría y cadencia

Asignar autoridad funcional para cada fuente: organismo meteorológico e hidrológico para señales; director para situación escolar; supervisión para validación; operativo para intervenciones; conducción para decisiones generales. Registrar correcciones manuales y quién las hizo. Diferenciar hora del fenómeno, de emisión, de recepción en el Hub y de última visualización.

Definir vigencias distintas para contexto ENOS, alerta de corto plazo, observación y verificación escolar. Cuando una fuente venza, mostrar el último valor como histórico, pero dejar de usarlo como disparador nuevo. Los umbrales y plazos deben ser decisiones aprobadas por el área responsable y visibles en el producto.

## 2. Preparación anterior a la emergencia

### 2.1 Crear una vista de preparación

Permitir revisar escuelas con antecedentes de interrupción, acceso difícil, uso anterior como centro de evacuados y geolocalización incompleta. Presentar esos datos como **antecedentes observados**, nunca como predicción de daño. Incorporar un inventario mantenible: referente territorial, contacto verificado, acceso habitual y alternativa conocida, estado del edificio, plan de continuidad y eventual designación oficial como centro de evacuados.

El listado de centros previstos debe provenir de la autoridad que los apruebe. Haber alojado evacuados una vez no los designa automáticamente para el período siguiente. Cada tarea de preparación —inspección, reparación, materiales, sede alternativa— debe tener responsable, plazo, evidencia de cierre y próxima revisión. Si esos campos aún no existen, crear primero un registro mínimo de tareas.

### 2.2 Preparar continuidad educativa, no sólo edificios

Registrar qué alternativas son viables para cada territorio: cambio de turno, sede alternativa, materiales impresos, modalidad remota, transporte excepcional o recuperación posterior de días. La conectividad y el transporte no deben asumirse disponibles. Definir quién puede disponer suspensión, reubicación y vuelta a clases; el Hub debe registrar y comunicar esas decisiones, no inferirlas desde una alerta climática.

Preparar mensajes para directores y familias que incluyan autoridad emisora, escuela y alcance, desde cuándo rigen, hasta cuándo o cuándo será la próxima actualización, y alternativa de continuidad. Mantener separados un aviso preventivo, una suspensión oficial y el parte del director.

### 2.3 Activar un período de vigilancia y distinguir episodios

Permitir abrir y cerrar un período operativo con nombre, fechas, autoridad, alcance, cadencia y criterios de activación. Antes de activarlo, revisar padrón, corte GE, coordenadas, catálogo de motivos, usuarios responsables y estado de fuentes externas. Tratar el «Protocolo Provincial ENOS 2026/2027» del repositorio como marco interno hasta confirmar su aprobación oficial; la interfaz debe utilizar la denominación autorizada.

Decidir expresamente cómo se relacionan **período ENOS**, **evento hidrometeorológico** y **parte escolar**. Un período puede contener varias tormentas o crecidas. El modelo actual permite un parte por CUE y período. Si hay que medir episodios distintos dentro del mismo período, añadir identidad de episodio y una acción inequívoca de reapertura o inicio de uno nuevo, migrando el historial previo. Si se mantiene una trayectoria única por período, marcar por lo menos el inicio y fin de cada interrupción para no interpretar meses separados como daño continuo.

## 3. Vigilancia y solicitud de verificación

### 3.1 Integrar fuentes oficiales de manera gradual

Comenzar con carga supervisada de contexto ENOS, alertas SMN y mediciones o perspectivas INA. Guardar documento original o URL, emisor, área, emisión, vigencia, operador de carga y momento de ingestión. Automatizar después de verificar permisos, formato estable, completitud y controles ante fallas. Si falla la ingestión, mostrar «fuente vencida» en vez de «sin alerta».

Para relacionar escuelas con zonas de alerta, cuencas o estaciones, crear un cruce versionado y revisado con supervisión y conocimiento hidrológico. La cercanía geométrica a una estación no demuestra exposición a la misma crecida. Comenzar con selección territorial manual justificada; medir falsos positivos y escuelas omitidas antes de generar solicitudes automáticas.

### 3.2 Solicitar verificaciones dirigidas

Ante una alerta vigente, dividir las escuelas seleccionadas en tres grupos: **sin respuesta**, **confirmaron sin afectación** y **reportaron afectación**. Registrar en cada solicitud la alerta que la motivó, el área elegida, destinatarios, pregunta concreta, plazo y operador. Emitir la solicitud no debe crear un parte de daño ni decidir la suspensión de clases.

Configurar el disparador con conducción, supervisión y protección civil. Una alerta oficial de nivel acordado puede motivar revisar accesos y servicio, pero la decisión de suspender corresponde a la autoridad definida. Toda solicitud masiva debe poder cancelarse, con razón y autor. Dar una cola específica a las escuelas silenciosas en un área con alerta: el objetivo es contactarlas, no pintarlas como afectadas.

## 4. Reporte escolar

### 4.1 Añadir una respuesta breve «sin afectación»

Ofrecer al director una confirmación simple: «Verifiqué la escuela y no hay afectación por ahora», con hora, acceso y servicio comprobados. No crear una afectación ficticia. La confirmación vence con la solicitud o la cadencia acordada; una nueva crecida puede requerir volver a verificar. Mostrar en la pantalla inicial el último estado confirmado, su antigüedad y solicitudes pendientes.

### 4.2 Extender el parte sin volverlo pesado

Conservar la separación actual entre afectación, alumnos/secciones alcanzados, servicio educativo y uso del edificio. Añadir una **necesidad operativa** de opciones acordadas y «otra», además de la observación libre. Pedir sólo información que cambie una acción. En las actualizaciones, priorizar «qué cambió»: empeoró, mejoró, apareció otra afectación, se restableció el servicio, cambió el uso del edificio o se corrigió una carga.

Mantener separadas la fecha desde la que rige el cambio y la fecha de registro. Marcar cargas retroactivas para que no reescriban silenciosamente cortes diarios ya publicados. Permitir retirar afectaciones y restablecer clases sin perder historial. Una escuela debe seguir en la vista operativa si continúa con servicio suspendido o usada como centro, aunque no queden afectaciones vigentes.

### 4.3 Corregir identificación, ubicación y autoría

Mantener en indicadores y lista los partes cuyo CUE no cruce con localizaciones; abrir una cola de conciliación con causa y responsable. Contar y listar escuelas sin coordenadas o con ubicación aproximada. No ubicarlas en un punto inventado ni borrarlas de los totales. Mostrar el corte GE usado para calcular alumnos y separar alumnos alcanzados por una afectación de alumnos en secciones sin clases; deduplicar personas según la definición de cada indicador.

Sustituir gradualmente la contraseña compartida por acceso vinculado a persona y escuela, con vigencia, revocación y delegaciones. Mientras exista, mostrar autoría como «escuela con acceso compartido», no como persona identificada. Mantener reintentos idempotentes y confirmación clara para conexiones inestables; no guardar listados nominales en cachés locales. Prever un canal alternativo de contacto y registrar después quién recibió la información, de quién y a qué hora.

## 5. Triage territorial y respuesta

### 5.1 Construir una cola con prioridad explicable

Usar la escuela como unidad de trabajo y agrupar sus afectaciones. Ordenar por la primera regla que aplique, con razón visible:

1. Riesgo inmediato para personas declarado o edificio evacuado.
2. Centro de evacuados con servicio suspendido.
3. Verificación pendiente o vencida dentro de alerta oficial vigente.
4. Suspensión total del servicio.
5. Mayor cantidad de alumnos en secciones suspendidas.
6. Mayor antigüedad sin actualización o intervención.

Mostrar fuente y hora de cada señal. Permitir filtrar por territorio, nivel, supervisor, servicio, centro de evacuados, necesidad y silencio. Un operador autorizado puede marcar «revisado» o posponer con motivo; esa decisión no debe modificar lo declarado por el director. No usar un puntaje de riesgo opaco ni confundir severidad del parte con necesidad de intervención.

### 5.2 Registrar el ciclo de gestión

Al tomar una escuela, permitir asignar responsable, registrar contacto, confirmar necesidad, derivar a un área, documentar intervención, fijar próxima revisión y solicitar validación de resolución. Cada acción necesita autor, hora y estado anterior/nuevo. Separar **estado escolar** de **estado de trabajo**: una reparación puede estar en gestión mientras siguen suspendidas las clases, y cerrar una tarea no debe cambiar el parte.

Configurar plazos y escalamiento por decisión operativa. Si un contacto telefónico confirma normalidad, registrar esa verificación con fuente y pedir confirmación escolar cuando corresponda; no reemplazar el parte en silencio. Mostrar contactos recientes para evitar que varias áreas dupliquen llamadas.

### 5.3 Proteger información sensible

Mantener las vistas ejecutiva y territorial sin nombres de alumnos. El acceso nominal debe seguir siendo excepcional, autorizado y auditado. En notas, tareas y exportaciones, usar CUE, escuela, secciones y totales si alcanzan para actuar. Evitar copiar identidades en textos libres, informes climáticos o servicios de IA.

## 6. Continuidad educativa durante la respuesta

Registrar **cómo se sostiene o recupera la enseñanza**, además del estado de clases: sede alternativa, cambio de turno, material impreso, actividad remota, transporte, recuperación posterior o modalidad aún no definida. Cada alternativa necesita responsable, alcance, inicio y fin; no debe deducirse del clima ni de una suspensión.

Cuando la suspensión sea parcial, conservar turnos y secciones concretos. Contar alumnos de secciones suspendidas según corte GE y advertir si está desactualizado. No presentar alumnos con inaccesibilidad como si todos hubieran perdido clases. Distinguir comunicación a familias de un parte escolar; las notificaciones futuras requieren contactos confiables, permisos y confirmación de entrega. Editar una observación no debe disparar un aviso nuevo de suspensión.

En escuelas usadas como centros de evacuados, registrar el uso del edificio por separado del daño y de las clases. Acordar una salida del refugio y acondicionamiento de aulas con el área responsable. Si se incorpora número de personas alojadas, guardar fuente y fecha; nunca inferirlo de la matrícula.

## 7. Recuperación y cierre

Mostrar «en recuperación» al disminuir la afectación o volver parte del servicio. Mostrar «recuperada» sólo cuando servicio, edificio y necesidades pendientes hayan sido revisados según una política acordada. El director informa mejoras; la resolución formal queda para supervisión u otra autoridad definida. Permitir reabrir un caso con nuevo cambio y conservar la trayectoria.

Registrar inicio y fin de cada suspensión por turno/sección, reapertura del edificio, fin de uso como centro y acción que permitió recuperar clases. Mostrar por día **entradas** en suspensión, **salidas** y **stock** de escuelas suspendidas; el saldo solo puede ocultar que algunas empeoraron mientras otras mejoraron. Separar alumnos alcanzados hoy, alumnos distintos alcanzados en el período y días de clases perdidos.

Al cerrar un período, congelar los cortes publicados y revisar pendientes, cobertura, tiempos de contacto, decisiones revertidas, falsos disparos, recurrencias y calidad de datos. Comparar departamentos con conteo **y** tasa sobre su padrón. Preservar episodios previos para preparar el siguiente ciclo.

## 8. Vistas recomendadas

### 8.1 Vista ejecutiva de 30 segundos

Priorizar: escuelas con suspensión total/parcial y variación desde el corte anterior; alumnos en secciones sin clases; escuelas evacuadas o usadas como centros y cuáles tienen clases suspendidas; cobertura de respuesta **entre las escuelas solicitadas**; cobertura de todo el padrón como cifra distinta; respuestas vencidas; casos sin responsable; y territorios con mayor tasa y conteo.

Mostrar siempre período, hora de consulta, corte GE y vigencia de fuentes. Si no hay período o corte, decir «indicadores no disponibles» en lugar de mostrar ceros. Situar ENOS, alertas y observaciones en una franja de contexto separada, fechada y enlazada a la fuente. No usar un color climático para presentar escuelas como afectadas. Mover secciones alcanzadas y distribución extensa de motivos al detalle.

### 8.2 Vista operativa de cinco minutos

Mostrar cola y mapa juntos. Cada fila debe contener CUE, escuela, territorio, razón de prioridad, servicio, uso del edificio, alumnos de secciones sin clases, última verificación, alerta asociada, responsable y siguiente acción. Permitir abrir ficha, historial y tarea sin perder filtros ni encuadre. Ofrecer lista alternativa para escuelas sin coordenadas; el mapa nunca debe ser la única entrada a un caso.

Permitir alternar relleno departamental entre **conteo** y **tasa** de escuelas con suspensión, con etiqueta que declare denominador. Mostrar un estado de salud del sistema: último corte GE, último refresco de partes, fuentes climáticas y sus horas, CUE sin cruce, coordenadas faltantes y fallos de ingestión. Una fuente vencida conserva el último valor con aviso, no se vuelve «sin alerta».

## 9. Contratos de datos e indicadores

| Indicador | Definición recomendada |
|---|---|
| Universo `U` | CUE-anexo activos del padrón oficial; si aún no existe marca de actividad, versión provisional del corte GE con exclusiones visibles. |
| Cobertura de solicitud | Escuelas que respondieron a una solicitud / escuelas incluidas en esa solicitud, a una hora de corte. |
| Cobertura del período | Escuelas de `U` con verificación o parte / `U`; nunca equivale a escuelas normales. |
| Silencio | Escuela solicitada sin respuesta al plazo; separar de «nunca verificó en el período». |
| Desactualización | Último estado confirmado más antiguo que la cadencia aprobada; hasta entonces llamar al umbral actual «sin actualizar > 72 h». |
| Suspensión | Escuelas con alcance de servicio suspendido vigente; deduplicar por CUE y separar total/parcial. |
| Alumnos sin clases | Personas distintas de secciones/turnos suspendidos según el corte GE; no sumarlas con otros alumnos alcanzados. |
| Riesgo para personas | Escuela con afectación crítica declarada o edificio evacuado: señal de revisión prioritaria, no diagnóstico técnico. |
| Entrada/salida diaria | Transición a suspensión o a reanudación por escuela, con vigencia local y marca de carga retroactiva. |
| Tasa territorial | Escuelas con condición / escuelas de `U` del territorio; mostrar el conteo junto al porcentaje. |
| Tiempo de respuesta | Desde solicitud o primer reporte prioritario hasta primer contacto/intervención registrado; distinto de duración de la afectación. |

La API operativa debe devolver metadatos junto a los totales: período, estado de disponibilidad, identificador y fecha del corte GE, hora de cálculo, definición del universo y estado de fuentes externas. Distinguir cero verdadero, sin período, sin corte, fuente vencida y error de consulta. Fijar la zona horaria de Corrientes para series y preservar los cortes históricos aun si luego entra una carga retroactiva.

Versionar el cruce escuela–alerta/estación: fuente, zona, método, validador y vigencia. Debe ser auditable y reversible. No incluir texto libre del director ni información nominal en paquetes de contexto climático.

## 10. IA: único piloto condicionado

Primero capturar necesidades estructuradas y medir, con acceso autorizado, cuántas descripciones libres existen, qué contenido accionable agregan y si contienen datos personales. Si el texto es escaso o repite el motivo seleccionado, no incorporar IA.

Si queda información útil, comparar un extractor de **necesidades concretas** con un formulario estructurado y reglas de búsqueda sobre los mismos partes históricos. Cada propuesta de IA debe incluir etiqueta, cita textual exacta, ID de afectación y opción «no inferible»; un operador confirma antes de que aparezca en agregados. No enviar identidades de alumnos al modelo ni usarlo para pronosticar crecidas, atribuir causalidad a ENOS, ordenar escuelas automáticamente o decidir suspensiones.

Medir precisión y omisiones de necesidades críticas, tiempo hasta encontrar casos y esfuerzo de revisión. Fijar umbrales antes del ensayo y retirar la función si no supera claramente la alternativa sin IA. Un resumen generado debe ser borrador con enlaces a evidencia, nunca cifra oficial.

## 11. Orden de implementación

| Etapa | Cambio recomendado | Condición de salida |
|---|---|---|
| **A. Confiabilidad** | Estado «sin período/sin corte»; vigencia visible; conservar partes sin cruce y escuelas suspendidas/centro sin afectación vigente; listar sin coordenadas; renombrar «sin reportar». | Totales y listas concilian; cero se distingue de falta de dato. |
| **B. Cobertura** | Definir `U`; solicitudes; respuesta «sin afectación»; silencio y vencimiento. | Ninguna escuela sin respuesta aparece como normal; cada solicitud tiene denominador. |
| **C. Operación** | Cola priorizada; responsable, contacto, derivación y plazo; vista ejecutiva de cambios; alumnos sin clases; filtros coherentes. | Se puede seguir una escuela desde señal hasta acción y explicar su prioridad. |
| **D. Contexto ENOS** | Carga supervisada de ENOS, SMN e INA; fechas y caducidad; cruce territorial revisable; solicitudes dirigidas. | Ninguna señal climática vencida se usa como disparador ni se presenta como impacto escolar. |
| **E. Continuidad y recuperación** | Alternativas pedagógicas, resolución supervisada, reapertura, flujos de recuperación y cortes publicados. | El período se cierra con pendientes explícitos y tiempos medibles. |
| **F. Automatización selectiva** | Ingesta externa estable y, sólo si demuestra valor, extracción asistida. | Reduce trabajo sin aumentar omisiones críticas ni perder trazabilidad. |

Antes de B–E, decidir quién mantiene el padrón, quién solicita y valida reportes, quién decide suspensión y reapertura, quién asigna tareas, quién autoriza centros de evacuados, quién mantiene fuentes climáticas y qué canal comunica a familias. Registrar esas decisiones en permisos y auditoría. La secuencia depende de ellas; los plazos se estiman después.

### 11.1 Áreas del proyecto que conviene extender

| Área existente | Recomendación |
|---|---|
| [`lib/infraestructura/parte-mapa.ts`](../lib/infraestructura/parte-mapa.ts) y [`app/api/mapas/infraestructura/route.ts`](../app/api/mapas/infraestructura/route.ts) | Separar disponibilidad, universo, calidad de cruce, escuelas sin respuesta y totales en un cálculo compartido. |
| [`components/mapas/map-infraestructura-page.tsx`](../components/mapas/map-infraestructura-page.tsx), [`components/infraestructura/indicadores.tsx`](../components/infraestructura/indicadores.tsx) y [`components/infraestructura/lista-alertas.tsx`](../components/infraestructura/lista-alertas.tsx) | Distinguir lectura ejecutiva y cola, vigencia, motivo de prioridad y casos sin coordenadas. |
| [`lib/infraestructura/evolucion.ts`](../lib/infraestructura/evolucion.ts) y [`components/infraestructura/evolucion-panel.tsx`](../components/infraestructura/evolucion-panel.tsx) | Incorporar entradas/salidas, filtros coherentes y cortes publicados; conservar diferencia entre acumulado e impacto actual. |
| [`app/api/problematicas/parte/route.ts`](../app/api/problematicas/parte/route.ts) y formularios en [`components/infraestructura`](../components/infraestructura) | Añadir verificación sin afectación y necesidad estructurada sin deformar los partes existentes. |
| [`lib/infraestructura/trayectoria-tipos.ts`](../lib/infraestructura/trayectoria-tipos.ts) y [`lib/db/schema.ts`](../lib/db/schema.ts) | Modelar solicitudes, episodios si se aprueban, tareas, fuentes y resoluciones con autoría y tiempos propios. |
| [`lib/infraestructura/ge-db.ts`](../lib/infraestructura/ge-db.ts) y sincronización GE | Publicar identidad, fecha y cobertura del corte; definir universo y conciliación de CUE. |
| [`lib/infraestructura/acceso-publico.ts`](../lib/infraestructura/acceso-publico.ts) | Pasar a identidad verificable por persona y CUE, mantener acceso nominal separado y auditado. |

Preservar los partes y movimientos existentes. Agregar entidades específicas para solicitudes, episodios y tareas si se aprueban; no sobrecargar `infra_afectacion` con estados de gestión o señales climáticas. Toda migración debe conservar lectura histórica y ruta de reversión.

## 12. Recorrido de aceptación de punta a punta

1. Conducción activa el período y ve padrón, corte GE y calidad de ubicaciones. ENOS aparece sólo como contexto fechado de preparación.
2. Llega una alerta oficial local; un operador delimita el área, registra fuente y solicita verificación. La solicitud muestra su denominador.
3. Una escuela confirma «sin afectación»; otra informa acceso cortado con clases normales; una tercera informa edificio evacuado y suspensión parcial. Las tres quedan diferenciadas.
4. Una cuarta escuela no responde. Entra en la cola de verificación, pero nunca se cuenta como afectada ni normal.
5. El operativo toma casos, contacta, confirma necesidades y deriva intervenciones. La vista ejecutiva sólo cambia cuando cambian hechos o acciones registrados.
6. Una escuela reanuda parte de las clases mientras sigue como centro de evacuados. Ambos estados permanecen visibles.
7. Supervisión valida la resolución; quedan duración, acción, alumnos sin clases según corte e historial de señales y partes.
8. Al cerrar el período, los cortes publicados conservan su fecha y se revisan silencios, demoras, activaciones innecesarias y recurrencias.

**Éxito esperado:** conducción puede explicar qué cambió, qué falta saber y dónde decidir; el operador encuentra el siguiente caso y registra su acción; el director informa la realidad de su escuela sin completar datos climáticos que no le corresponden.
