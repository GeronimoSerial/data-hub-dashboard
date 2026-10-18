# Plan por batches: nueva UI de infraestructura

Estado: ejecución incremental por secciones · Actualización: 17 de octubre de 2026.

## Cambio de ejecución acordado

El usuario descartó el prototipo del batch 1 y su entregable. Desde esta actualización se modifica directamente la UI existente de `/mapas/infraestructura`, una sección por entrega. No se crean prototipos, rutas de demostración ni matrices previas como sustituto de una mejora visible. La secuencia por batches que sigue queda como referencia de capacidades futuras, no como autorización para implementar todo sin revisión.

**Primera sección:** cabecera y controles de navegación/modo del mapa existente. Mejorar jerarquía, composición, espaciado, superficies y estados de interacción usando primitivas Base UI y componentes Arc adecuados. Mantener destinos, enlaces, flags y comportamiento actuales; no activar destinos futuros todavía inexistentes.

**Siguiente sección autorizada:** consulta escolar. Sustituir el expediente extenso sobre el mapa por una vista previa compacta con acceso a una ficha completa en página propia, reutilizando datos y módulos actuales. Verificar selección, apertura, acciones existentes y regreso con modo, filtros, selección, cámara y capas conservados. No incluye crear el listado Escuelas, reorganizar toda la navegación ni implementar Ríos. Se delega a un worker nuevo y se detiene tras esta entrega.

**Plataformas objetivo, corrección del usuario:** el mapa está pensado para escritorio y laptops, incluidas pantallas pequeñas. No dedicar trabajo a mobile, bottom sheets móviles ni composiciones específicas para teléfonos. Validar como referencia 1280×720, 1366×768 y 1440×900 CSS px, cuidando especialmente la altura útil, paneles y acciones visibles. Estas medidas son referencias de comprobación, no un nuevo mínimo rígido. No retirar compatibilidad existente de componentes compartidos. Esta instrucción prevalece sobre las menciones a móvil/tablet de los batches históricos siguientes.

**Prioridad:** mejora conceptual y funcional de cada sección. El usuario realizará después el ajuste estético fino; no invertir la entrega en perfeccionar ornamentos.

**Dirección visual actualizada:** interfaz más viva, cálida y fluida, con jerarquía y contraste deliberados. El manual actual es referencia, no una restricción estética rígida para este refactor. Conservar los archivos oficiales de marca y legibilidad; permitir cambios locales de color, radios, densidad y tipografía cuando mejoren la sección. No copiar la estética del prototipo descartado ni hacer un cambio global de tema como parte de esta primera sección.

**Iteración obligatoria:** implementar y verificar únicamente la sección asignada, mostrar acceso a la pantalla real y evidencia del cambio, informar al usuario y detenerse. La siguiente sección o una nueva pasada se define después de su devolución. No se continúa automáticamente al siguiente batch. Sigue vigente la política de reutilizar primitivas; no reconstruir interacciones cubiertas por Base UI o Arc.

El frente técnico de Ríos continúa separado con sus límites de edición. Su evidencia se registra en su propio informe; no depende del entregable de prototipo descartado.

Este plan ordena la [propuesta de refactorización](2026-10-16-refactor-ui-mapa-infraestructura.md) en entregas revisables. Cada batch tiene un resultado visible y una condición de cierre. No contiene código ni instrucciones técnicas de implementación.

**Orden recomendado:** definir la experiencia → resolver la consulta escolar → reorganizar el mapa → incorporar monitoreo y tendencias de ríos → cerrar la experiencia completa.

## Vista general

| Batch | Resultado | Depende de |
|---|---|---|
| 1 | Diseño del flujo y distribución de la información | — |
| 2 | Ficha completa de escuela y regreso al mapa | 1 |
| 3 | Resumen de selección y listado de escuelas | 2 |
| 4 | Mapa despejado, navegación y herramientas ordenadas | 3 |
| 5 | Monitoreo de estaciones y sección Ríos | 4 |
| 6 | Marquee de estado y tendencias publicadas | 5 |
| 7 | Evolución histórica de alturas | 5; puede ejecutarse en paralelo con 6 con contratos compartidos definidos |
| 8 | Revisión integral y cierre | 1–7 |

La primera mejora funcional completa llega al cerrar el batch 3: se puede consultar una escuela sin ocupar el mapa con toda su información. El monitoreo y el marquee no necesitan esperar a los gráficos históricos.

## Reglas de trabajo

- Completar y revisar las dependencias de cada batch antes de integrarlo. La secuencia recomendada admite los frentes paralelos delimitados a continuación.
- Cada entrega se comprueba en escritorio y laptops de pantalla pequeña. No se exige diseñar ni validar una experiencia móvil para el mapa; conservar accesibilidad de teclado, contraste y legibilidad.
- Conservar las funciones actuales hasta que su reemplazo esté disponible y verificado.
- Revisar carga, vacío, error y datos desactualizados dentro de cada batch que muestre información.
- Mantener permisos, borradores, carga de partes y funcionamiento offline durante toda la transición.
- Registrar qué quedó terminado, qué se verificó y qué pendiente continúa en el próximo batch.
- Los criterios de cierre son comprobaciones del resultado. No son pedidos de aprobación adicionales para cada tarea.
- Aplicar en todos los batches la [política de componentes y primitivas](2026-10-16-refactor-ui-mapa-infraestructura.md#81-política-transversal-de-componentes-y-primitivas): reutilizar componentes del proyecto sustentados en primitivas, usar Base UI y seleccionar componentes de [Arc UI](https://uiarc.dev/) según la necesidad. No construir a mano una interacción cubierta por una primitiva adecuada.
- Cada entrega identifica los componentes usados, su procedencia y las adaptaciones. La composición y los datos de dominio son propios; foco, teclado, selección, portales y apertura/cierre se delegan a las primitivas que los resuelven.
- Verificar la integración aun usando bibliotecas: teclado, foco, Escape, scroll, temas, responsive y movimiento reducido según el componente. Reutilización no equivale a ausencia de fallas.

### Ejecución paralela acordada

Mientras se mejora la primera sección real de la UI, otro worker prepara la base técnica de Ríos correspondiente a los batches 5 y 7: cobertura real de lecturas, contrato de datos y consulta/API histórica con pruebas. Puede implementar esa base técnica; no implica cerrar esos batches ni adelantar su interfaz.

- **Worker de experiencia:** mejora directa de cabecera y controles del mapa existente, con verificación y parada para devolución del usuario. El prototipo anterior fue descartado.
- **Worker técnico de Ríos:** repositorios y contratos de hidrometría, nueva ruta de historia y pruebas específicas; informe separado en `docs/2026-10-16-rios-base-tecnica.md`. Verifica cobertura con evidencia propia y registra fuente y fecha; el informe del prototipo anterior fue descartado.
- **Límites:** el worker técnico no modifica componentes, prototipo, CSS global, navegación, esquema de BD, ingestas ni estos planes. Conserva el contrato de últimas lecturas existente y sus permisos; la inspección de la BD de desarrollo es de solo lectura. Cada worker edita únicamente sus archivos y no realiza commits ni pushes.
- **Integración posterior:** la sección Ríos sigue dependiendo de la navegación del batch 4. Tras cerrar el batch 5, los batches 6 y 7 pueden avanzar en paralelo si comparten un contrato estable de datos, selección de estación y componentes, con archivos de edición asignados. La conexión de ambos se verifica antes del batch 8.

## Batch 1 · Definir la experiencia antes de mover contenido

**Objetivo:** acordar la organización de pantallas y el recorrido principal.

### Alcance

- Definir la navegación: Mapa, Escuelas, Ríos y Estadísticas.
- Ubicar Capas como herramienta y Metodología como ayuda.
- Establecer qué información pertenece al resumen del mapa, a la vista previa y a la ficha completa de escuela.
- Diseñar el recorrido de entrada, selección, apertura de ficha y regreso al origen.
- Preparar vistas de referencia para escritorio, tablet y móvil, incluyendo contenido largo y ausencia de datos.
- Identificar las capacidades actuales que deben conservarse y dónde quedará cada una.
- Revisar la disponibilidad de historia de alturas para conocer el alcance posible del batch 7.
- Preparar una matriz de necesidades y componentes: componente local reutilizable, primitiva Base UI o componente Arc, enlace a documentación, dependencias/licencia, adaptación institucional y batch de adopción. Seleccionar usos concretos de Arc a lo largo del refactor, no solo referencias visuales.
- Identificar interacciones custom actuales y su reemplazo por primitivas dentro del batch que las modifica. Cuando ninguna opción adecuada exista, documentar la carencia antes de proponer una excepción.

**Entregable:** recorrido visual de las pantallas principales, distribución definitiva del contenido y matriz de componentes reutilizables/Base UI/Arc. La página propia es la opción base para la escuela; un modal amplio queda como alternativa de transición, no como una segunda ficha distinta. Este batch define y prototipa la experiencia; no implementa la migración productiva ni instala una biblioteca globalmente como anticipo de los siguientes batches.

**Cierre:** cada contenido actual tiene destino; el recorrido se entiende sin explicaciones externas; los controles interactivos del prototipo usan componentes existentes o primitivas adecuadas; la matriz fija qué componentes Arc se adoptarán y en qué batch, con disponibilidad comprobada; se conoce qué historia de estaciones está disponible o qué verificación sigue pendiente.

## Batch 2 · Darle a cada escuela una ficha completa

**Objetivo:** disponer de un lugar cómodo para consultar toda la información escolar.

### Alcance

- Crear la experiencia de detalle con identidad y resumen operativo al inicio.
- Organizar situaciones abiertas, edificio y acceso, evidencia, historial y contexto territorial en secciones claras.
- Integrar el historial en la ficha, evitando abrir otra superficie extensa encima.
- Mantener acciones de carga y actualización, borradores y consulta nominal según permisos.
- Resolver acceso directo a una escuela, escuelas sin reportes y escuelas sin ubicación.
- Conservar el contexto de origen al volver: mapa o listado, filtros y selección.
- Comprobar el regreso después de cargar o actualizar un parte, y el comportamiento de Atrás/Adelante.

**Entregable:** ficha escolar completa, accesible directamente y desde el mapa existente. Durante este batch puede convivir temporalmente con la ficha anterior.

**Cierre:** toda la información y las acciones actuales están disponibles en el nuevo detalle; consultar o actualizar una escuela permite regresar al contexto anterior.

## Batch 3 · Simplificar la selección y sumar Escuelas

**Objetivo:** separar encontrar una escuela de consultar su expediente.

### Alcance

- Reemplazar la ficha extensa del mapa por una vista previa breve con acceso al detalle completo.
- Diferenciar cerrar el resumen de quitar la selección.
- Crear el listado de Escuelas con búsqueda, filtros y orden comprensibles.
- Unificar el aspecto de los resultados, conservando los criterios propios de situación, pronóstico y planificación.
- Permitir encontrar y abrir escuelas sin coordenadas desde el listado.
- Conservar la posición y los filtros al regresar desde una ficha.

**Entregable:** recorrido completo mapa o listado → resumen → ficha → regreso.

**Cierre:** seleccionar una escuela ya no despliega todo el expediente sobre el mapa; las escuelas se encuentran por búsqueda o listado y el regreso no obliga a empezar de nuevo.

## Batch 4 · Reorganizar el mapa y sus herramientas

**Objetivo:** recuperar espacio cartográfico y reducir la competencia entre paneles.

### Alcance

- Aplicar la navegación principal definida en el batch 1.
- Ordenar Situación actual, Pronóstico y Planificación como modos del mapa.
- Reducir el resumen a indicadores decisivos y ofrecer acceso al listado completo.
- Convertir Capas en una herramienta temporal y ubicar Ayuda en un acceso secundario claro.
- Reservar lugares para leyenda, controles, selección, línea temporal y atribución.
- Reubicar eventos reportados y Veredicto diario sin sumar superficies flotantes permanentes.
- Mantener filtros coherentes entre Mapa, Escuelas y Estadísticas, indicando el alcance de cada cifra.
- Conservar los enlaces anteriores y los modos disponibles según permisos y funcionalidades habilitadas.

**Entregable:** mapa ordenado, con herramientas reconocibles y resultados que no dominan el lienzo.

**Cierre:** las superficies no se tapan entre sí; cambiar de modo mantiene el contexto esperado; los totales coinciden entre vistas cuando tienen el mismo alcance.

## Batch 5 · Crear el monitoreo de estaciones en Ríos

**Objetivo:** consultar el estado del conjunto sin abrir cada marcador.

### Alcance

- Incorporar una sección Ríos con listado de estaciones y filtros propios.
- Mostrar altura, estado de nivel, variación publicada, período y hora de medición.
- Diferenciar alerta de nivel, lectura vencida, inconsistencia, falta de lectura y ausencia de umbrales.
- Ofrecer un detalle de estación y acceso desde los símbolos del mapa.
- Mantener la misma lectura y vigencia en listado, detalle y mapa.
- Resolver actualización, reintento y conservación del último dato conocido cuando falle la consulta.
- Mantener separado el monitoreo de ríos del pronóstico educativo y meteorológico.

**Entregable:** monitoreo usable con las últimas lecturas, todavía sin exigir gráficos históricos.

**Cierre:** todas las estaciones se pueden consultar; los filtros escolares no afectan sus lecturas; una falla o lectura no confiable nunca se presenta como normalidad ni como ausencia de estaciones.

## Batch 6 · Incorporar el marquee de estaciones

**Objetivo:** hacer visible el monitoreo mientras se explora el mapa.

### Alcance

- Añadir una cinta fuera del lienzo cartográfico con estación, estado, altura, variación, período y hora.
- Priorizar estados relevantes con un orden estable y hacer visibles las incidencias de calidad.
- Permitir abrir el detalle de la estación desde cada elemento.
- Incorporar pausa y reanudación, navegación por teclado y alternativa sin movimiento.
- Usar desplazamiento manual en móvil y acceso a “Ver todas”.
- Evitar que la cinta mueva el mapa, robe foco o choque con los controles del pronóstico.

**Entregable:** marquee conectado al monitoreo del batch 5.

**Cierre:** se puede leer y detener cómodamente; funciona sin animación; sus datos coinciden con Ríos; ocultar los símbolos cartográficos no desactiva el monitoreo.

## Batch 7 · Mostrar la evolución histórica de alturas

**Objetivo:** entender cómo cambió el nivel de una estación a lo largo del tiempo.

### Alcance

- Confirmar cobertura real y períodos consultables por estación.
- Incorporar gráficos con ventanas útiles según la historia disponible.
- Mostrar altura, fechas, umbrales propios de la estación y rango real de observaciones.
- Representar huecos, lecturas inconsistentes y falta de historia suficiente.
- Distinguir variación publicada de cambios calculados sobre un período comparable.
- Dar acceso a la evolución desde el detalle de estación y desde el mapa.
- Mantener separadas las observaciones históricas de cualquier pronóstico.

**Entregable:** evolución temporal de alturas integrada en Ríos.

**Cierre:** cada gráfico refleja observaciones disponibles, muestra su cobertura y no inventa continuidad ni tendencias. Si falta historia, explica la limitación; no ofrece ventanas vacías como si tuvieran datos.

**Dependencia especial:** si la cobertura real es insuficiente, registrar la necesidad de reunir más observaciones. Eso no bloquea los batches 5 y 6; el gráfico puede publicarse con un período menor claramente indicado.

## Batch 8 · Validar la experiencia completa y cerrar la transición

**Objetivo:** comprobar que las entregas funcionan como una sola experiencia.

### Alcance

- Recorrer búsqueda → selección → ficha → actualización → regreso.
- Recorrer mapa → estación → evolución y marquee → estación.
- Revisar filtros, cifras, permisos, enlaces anteriores y navegación del navegador.
- Verificar contenido largo, datos incompletos, fallas de conexión y lecturas vencidas.
- Revisar legibilidad, foco, teclado, movimiento reducido y ampliación de texto.
- Comprobar escritorio, tablet, móvil y pantalla completa.
- Revisar tiempos de apertura y evitar recargas innecesarias del mapa.
- Retirar superficies reemplazadas y estilos antiguos solo cuando no tengan otros consumidores.
- Registrar pendientes reales y actualizar la documentación de la experiencia final.
- Contrastar la implementación con la matriz de componentes: usos de Arc entregados, primitivas reutilizadas, interacciones custom reemplazadas y excepciones justificadas. Confirmar que no quedaron implementaciones paralelas del mismo patrón ni cambios globales de tema introducidos por la integración.

**Entregable:** experiencia integrada y registro de verificación.

**Cierre:** los recorridos principales están comprobados, no quedan funciones perdidas ni superposiciones conocidas que impidan el uso, y cualquier limitación de datos está visible para el usuario.

## Cortes útiles de entrega

| Hasta dónde | Qué queda disponible |
|---|---|
| Batch 3 | Consulta escolar completa y mapa liberado del expediente extenso. |
| Batch 4 | Navegación y mapa reorganizados. |
| Batch 6 | Monitoreo de ríos y marquee con lecturas actuales. |
| Batch 7 | Evolución histórica de alturas. |
| Batch 8 | Transición revisada y cerrada. |

Estos cortes permiten revisar avances concretos. La verificación de cada batch sigue siendo obligatoria aunque la revisión integral se haga al final.
