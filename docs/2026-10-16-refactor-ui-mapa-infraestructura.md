# Propuesta de refactorización de la UI del mapa de infraestructura

Fecha: 16 de octubre de 2026 · Estado: propuesta para revisión, sin implementación.

**Actualización de ejecución, 17 de octubre de 2026:** el usuario descartó el prototipo y solicita cambios directos, por secciones, sobre la UI existente. Cada sección se implementa, se verifica, se presenta y se detiene para iterar con su devolución. La propuesta siguiente es contexto de capacidades, no una instrucción de crear otro prototipo ni de ejecutar todos los cambios en cadena. La primera sección es la cabecera y los controles de navegación/modo del mapa actual. El manual de marca deja de ser una restricción estética rígida: se busca una interfaz más viva, cálida y fluida, preservando los archivos oficiales de marca, legibilidad y comportamiento. La política Base UI/Arc de la sección 8.1 permanece vigente; sus referencias al prototipo del batch 1 quedan sustituidas por esta modalidad incremental. Ver el [cambio de ejecución acordado](2026-10-16-plan-batches-ui-infraestructura.md#cambio-de-ejecución-acordado).

**Corrección posterior de alcance:** priorizar mejoras conceptuales y funcionales sobre pulido estético; el usuario ajustará los detalles visuales después. El mapa se valida en escritorio y laptops de pantalla pequeña, no en teléfonos. No implementar adaptaciones específicas de mobile; las menciones históricas a móvil/tablet de esta propuesta no son requisitos activos. La siguiente sección autorizada, a cargo de otro worker, es vista previa escolar compacta más ficha completa en página propia con retorno al contexto, sin adelantar el listado Escuelas ni otras secciones.

**Recomendación:** organizar la experiencia alrededor de tres tareas: explorar el territorio, consultar una escuela y monitorear los ríos. El mapa conserva un resumen operativo y una vista previa breve de la selección. La información completa de cada escuela pasa a una página propia. Las estaciones ganan una sección de monitoreo, gráficos de altura y una franja de estado con comportamiento de marquee controlable.

El cambio principal es de arquitectura de información y flujo. Cambiar colores o ensanchar el panel actual no alcanza: hoy conviven listados, configuración, pronósticos y fichas extensas sobre un mismo lienzo.

## 1. Alcance y método

Se realizaron tres revisiones delegadas a **GPT-6 Luna, razonamiento high**: estructura presentacional del mapa; escuela y flujo de detalle; estaciones, hidrometría y tendencias. La síntesis se contrastó con los componentes, el cliente de la ruta, CSS, APIs y repositorios vigentes.

La auditoría cubre la composición activa del mapa de infraestructura y los módulos que integra. Otros mapas y componentes compartidos se consideran dependencias, no se propone rediseñarlos automáticamente. Los documentos anteriores aportan contexto, pero el código actual prevalece.

**Límite de evidencia:** revisión estática de código, estilos y contratos de datos. No se abrió una sesión autenticada ni se hizo una evaluación visual en navegador o con usuarios. Los problemas espaciales se deducen de la composición y CSS; deben confirmarse en el prototipo. No se verificó qué cantidad de historia real tiene hoy la base de producción.

### Evidencias principales

Las líneas son orientativas y corresponden a esta revisión; los enlaces son relativos al documento.

| Evidencia | Qué confirma |
|---|---|
| [Cliente de infraestructura](../../app/(hub)/mapas/infraestructura/map-client.tsx), líneas 58–160 | Pestañas en hash, filtros compartidos y mapa persistente al cambiar de vista. |
| [Compositor del mapa](../../components/mapas/map-infraestructura-page.tsx), líneas 2015–2180 | Panel lateral, ficha flotante, modales y herramientas coordinados desde un archivo de 2.189 líneas. |
| [Ficha escolar](../../components/mapas/ficha-escuela-panel.tsx), líneas 131–275 | Identidad, fotos, riesgo, acceso, clases, afectaciones, borradores, historial y contexto territorial. |
| [CSS vigente](../../app/globals.css), líneas 2136, 2501 y 6358 | Columna izquierda y ficha superpuestas al mapa; ficha de hasta 24rem con scroll propio. |
| [Capa de estaciones](../../components/mapas/capa-estaciones-rio.tsx), líneas 141–155 y 270–299 | Consulta de última lectura y popup con tendencia textual; sin gráfica temporal. |
| [API de estaciones](../../app/api/infraestructura/hidrometria/estaciones/route.ts), líneas 13–59 | Altura, variación, período, fecha, umbrales, inconsistencia y vigencia disponibles. |
| [Clasificación hidrométrica](../../lib/infraestructura/hidrometria/estado-altura.ts), líneas 18–73 | Lecturas vencen a las 18h; tendencia derivada de la variación publicada. |
| [Repositorio de lecturas](../../lib/infraestructura/hidrometria/lecturas-repo.ts), líneas 63–121 | Persistencia por estación e instante; consulta actual de última lectura. |

## 2. Diagnóstico: qué produce la saturación

1. **Demasiadas superficies sobre el mapa.** La columna operativa, la ficha escolar, las leyendas, popups, controles de radar y acciones flotantes compiten por atención y superficie útil.
2. **La escuela tiene contenido de una página dentro de una ficha angosta.** Ya no está incrustada en el sidebar: se monta como un `aside` independiente. Sin embargo, conserva prácticamente todo el expediente en una columna con scroll.
3. **La navegación mezcla tareas con configuración.** Situación actual, Radar, Planificación, Capas, Estadísticas y Metodología aparecen como pestañas equivalentes. “Capas” configura el mapa; “Metodología” explica; las demás resuelven tareas de consulta.
4. **Los resultados se repiten por modo.** Situación actual, Radar y Planificación tienen listas de escuelas con criterios distintos. Hace falta un patrón compartido de resultado y selección, conservando las diferencias de significado.
5. **Las estaciones están tratadas como una capa secundaria.** Hay lectura y tendencia por estación, pero para revisarlas hay que encontrarlas y abrir sus popups. Falta una lectura colectiva.
6. **Los estados de datos necesitan mayor visibilidad.** En estaciones, un error de carga termina en una lista vacía. Eso puede verse como ausencia de estaciones. Carga, error, falta de lecturas y datos vencidos deben tener respuestas distintas.
7. **La composición dificulta evolucionar la pantalla.** El componente principal mezcla eventos y capas MapLibre con selección, datos y presentación. Añadir más overlays aumentaría ese acoplamiento.

### Precisión sobre el responsive actual

La regla final de `.map-ficha-flotante` fija un ancho `min(24rem, calc(100vw - 80px))`, posiciona de arriba a abajo y aplica scroll vertical. Bajo 1100px cambia al lado izquierdo, desde 55px, pudiendo cubrir el panel lateral. Existen reglas anteriores y ajustes móviles en el CSS; no deben tomarse aisladamente como descripción del layout final. La refactorización debe consolidar la cascada y comprobar los estilos computados en navegador.

## 3. Arquitectura de navegación propuesta

| Nivel | Destino | Función |
|---|---|---|
| Principal | **Mapa** | Exploración territorial. Modos internos: Situación actual, Pronóstico y Planificación. |
| Principal | **Escuelas** | Lista completa, búsqueda, filtros y orden; acceso directo a la ficha sin localizar un marcador. |
| Principal | **Ríos** | Monitoreo de estaciones, estado, variación e historia de alturas. |
| Principal | **Estadísticas** | Comparaciones agregadas y evolución educativa, con filtros escolares compartidos. |
| Herramienta del mapa | **Capas** | Mapa base, límites y overlays. Panel temporal que se abre y cierra. |
| Ayuda | **Metodología y fuentes** | Explicación del cálculo y procedencia; acceso secundario siempre disponible. |

No se pierde ninguna capacidad actual. “Radar” puede presentarse como **Pronóstico** si el contenido sigue siendo pronóstico meteorológico/riesgo educativo y no radar observado; conservar compatibilidad con los enlaces existentes. Mantener las restricciones por flags actuales.

Los filtros de escuelas se comparten entre Mapa, Escuelas y Estadísticas. Ríos tiene filtros propios de río, estación y estado. Elegir un nivel educativo no debe esconder estaciones hidrométricas ni dar a entender que esas lecturas están filtradas por matrícula.

### Esquema espacial del mapa

```text
Mapa | Escuelas | Ríos | Estadísticas                    Ayuda
Búsqueda de escuela    Filtros activos                    Capas
Situación actual / Pronóstico / Planificación
Resumen operativo breve
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    MAPA                                     │
│                                  Vista previa de selección  │
│                                  [Abrir ficha]              │
│ Leyenda compacta                     Zoom / pantalla completa│
└─────────────────────────────────────────────────────────────┘
Estaciones: estado + altura + variación + hora   [Pausa] [Ver todas]
```

Es un esquema funcional, no una maqueta final. La cinta de estaciones queda en una fila del layout: no flota encima de la leyenda ni de la línea temporal del pronóstico.

## 4. Flujo escolar recomendado

### Recorrido principal

1. Buscar una escuela, elegir una fila o tocar un marcador.
2. Resaltar la escuela y mostrar una **vista previa**. Encuadrar solo cuando lo exige la acción; evitar mover la cámara durante una actualización de datos.
3. La vista previa muestra nombre, CUE/anexo, localidad/departamento, situación reportada, clases y última actualización. Añadir un aviso de riesgo estimado si es relevante, claramente separado del reporte.
4. Elegir **Abrir ficha** lleva a `/mapas/infraestructura/escuelas/[cue]` —ruta propuesta, todavía inexistente—.
5. Consultar la ficha, revisar evidencia o cargar/actualizar un parte.
6. **Volver al mapa** restaura el modo, filtros, selección, encuadre y capas anteriores. Volver desde una entrada de Escuelas restaura esa lista y su posición.

La vista previa no incluye galería, timeline completo, detalle nominal ni todos los factores de riesgo. Cerrar la vista previa mantiene la selección; “Quitar selección” la elimina explícitamente.

Escuelas sin coordenadas siguen siendo accesibles desde búsqueda y listado, con aviso “Ubicación no disponible”. Su ficha no depende de poder dibujar un punto.

### Página dedicada frente a modal amplio

| Alternativa | Ventaja | Coste | Recomendación |
|---|---|---|---|
| Página dedicada | URL estable, espacio, historial navegable y consulta extensa; móvil natural. | Requiere diseñar restauración del contexto y navegación de retorno. | **Destino canónico para cada escuela.** |
| Modal amplio | Consulta puntual conservando el mapa detrás. | Scroll largo, gestión de foco y conflicto con otros diálogos/acciones. | Alternativa de transición si se necesita una primera entrega acotada. |
| Panel actual más ancho | Menor cambio inicial. | Conserva la competencia entre expediente, listas y mapa. | No resuelve el problema estructural. |

Si se adopta un modal provisional: ancho de referencia 70–85vw con máximo cercano a 1.000px, pantalla completa en móvil, encabezado persistente y un solo scroll de contenido. Debe compartir componentes y datos con la futura página, evitando dos fichas distintas. No abrir otro panel de historial encima.

### Estructura de la ficha completa

| Sección | Contenido y prioridad |
|---|---|
| Encabezado | Nombre, CUE/anexo, departamento, niveles, matrícula; volver al origen y acción principal según permisos. |
| Resumen | Situación reportada, gravedad, clases, apoyo, vigencia y última novedad. La ausencia de reporte no se presenta como confirmación de normalidad. |
| Situaciones abiertas | Motivos, alcance, severidad, descripción y novedades. Acceso nominal únicamente cuando corresponda. |
| Edificio y acceso | Condición edilicia, recorrido, cruces, distancia y exposición estructural. Mini mapa o “Ver recorrido en mapa” bajo demanda. |
| Evidencia | Galería con fecha y contexto; ampliar foto mantiene un diálogo específico. |
| Historial | Abiertas/resueltas y línea temporal paginada o por rango. Integrar el historial completo en esta sección. |
| Contexto territorial | Riesgo estimado, horizonte, lluvia y estaciones relevantes. Fuente y vigencia visibles; metodología ampliable. |

Usar navegación por anclas en escritorio y un selector de sección en móvil. El resumen aparece primero; el resto se carga por necesidad. Borradores y actualización conservan su flujo actual, incluyendo comportamiento offline y autorización del servidor.

### Estado y retorno

Persistir un estado versionado: origen, modo, filtros, selección, centro/zoom, mapa base, capas y posición del listado. Usar URL para el estado compartible y almacenamiento de sesión para detalles efímeros. No incluir información nominal en la URL. Validar valores y rutas de retorno internas.

Una apertura directa de la ficha funciona sin estado previo y ofrece “Ir al mapa” con un encuadre razonable. Atrás/adelante del navegador debe comportarse igual que los controles visibles. Conservar el montaje del mapa cuando la arquitectura de rutas lo permita; si se desmonta, restaurar explícitamente cámara/capas. No asumir que la persistencia actual entre pestañas alcanza para una nueva ruta.

## 5. Ríos: alturas, variaciones y tendencias

### Qué existe y qué falta

| Capacidad | Situación actual | Trabajo propuesto |
|---|---|---|
| Última altura y umbrales | Disponible en API de estaciones. | Reutilizar en mapa, cinta y listado. |
| Tendencia publicada | Disponible: crece/baja/estable, derivada de `variacionM`. | Mostrar delta y período real, además de la etiqueta. |
| Lecturas guardadas por instante | Existe `hidro_lectura`. | Medir cobertura real por estación y consultar rangos. |
| Gráfico temporal | No se encontró API de serie ni gráfica activa. | Nueva consulta/API de historia y componente temporal. |
| Referencia histórica de PNA | Se guardan estadísticas agregadas de referencia. | Usarlas como referencia explicada, nunca como puntos de una curva. |
| Actualización compartida | La capa consulta al montarse; no tiene actualización periódica propia. | Hook/cache común con refresco y manejo de vigencia para todas las superficies. |

### Vista de Ríos

Cabecera con filtros Paraná/Uruguay, búsqueda y estado. Resumen de estaciones en alerta/evacuación y de estaciones sin lectura vigente, calculado sobre el alcance visible. Tabla o lista con estación, río, altura en metros, estado de nivel, variación en centímetros, período y hora de medición.

Seleccionar una estación abre su detalle en el área principal, con localización secundaria y un gráfico ancho. El popup del mapa queda como resumen y ofrece “Ver evolución”. La selección de estación se centraliza para sincronizar mapa, cinta y listado.

### Gráfico de altura

- Ventanas iniciales: 7 y 30 días; ofrecer 90 días solo cuando exista cobertura. Mostrar siempre el rango real disponible.
- Eje X temporal y eje Y en metros. Fechas en hora argentina. Tooltips con altura, instante, calidad y fuente.
- Líneas de alerta y evacuación propias de la estación. No inventar umbrales ausentes; si variaron, representar su vigencia o aclarar que se muestra la referencia actual.
- Huecos visibles cuando faltan observaciones. No suavizar ni unir grandes vacíos como si existieran mediciones continuas.
- Diferenciar “variación publicada” de “cambio calculado en 24h”. El primero usa el período publicado; el segundo requiere lecturas comparables y tolerancia temporal explícita.
- No extrapolar una predicción desde dos alturas. Si más adelante se agrega pronóstico, será otra serie con su origen y horizonte.
- No promediar alturas entre estaciones para dar “la altura del Paraná”: cada estación tiene su referencia local. Para comparar estaciones, usar pequeños gráficos individuales o variaciones comparables.

API propuesta: `/api/infraestructura/hidrometria/estaciones/[id]/lecturas?desde=...&hasta=...`. Validar estación/rango, limitar puntos, conservar autorización de lectura y devolver cobertura, fechas, calidad y metadatos. Si se reduce resolución, conservar extremos relevantes y explicitar la agregación. Una ventana vacía debe responder sin inventar historia.

### Calidad de datos

La lógica vigente vence lecturas a las 18h y usa una banda de ±0,005m para “estable”. Eso describe el comportamiento actual; no es una nueva recomendación hidrológica.

Separar en la UI **estado de nivel** y **calidad de lectura**. Hoy una lectura inconsistente puede dejar el nivel en “sin dato” y conservar una tendencia derivada de su variación. El contrato para el nuevo monitoreo debe impedir que esa flecha se presente como una tendencia confiable. Sin umbrales puede haber altura y variación válidas, pero no clasificación de nivel.

“Evacuación” representa el umbral hidrométrico de la estación, no una orden de evacuación escolar. “Baja” tampoco implica que el nivel haya salido de alerta. Mantener ambos ejes separados.

## 6. Marquee de estaciones

Se propone implementar el pedido como una **cinta de monitoreo** con lectura completa disponible también en Ríos.

Formato ilustrativo, no dato real:

```text
Estación A · Paraná · 4,82 m · Alerta · ↑ +8 cm en 12 h · medida 16/10 12:00
```

### Comportamiento

- En escritorio puede desplazarse automáticamente, con **Pausar/Reanudar** visible; pausar también al recibir hover o foco.
- Con `prefers-reduced-motion`, mostrar versión estática con desplazamiento manual. En móvil, lista horizontal manual y enlace “Ver todas”.
- Cada estación se puede activar por teclado y lleva al detalle de Ríos. No roba foco ni recentra el mapa por su cuenta.
- Las copias necesarias para un bucle visual quedan fuera del árbol accesible y del recorrido de teclado. No anunciar cada movimiento con `aria-live`.
- Orden inicial: nivel de evacuación, alerta, normal y sin clasificación; dentro de cada grupo, un orden estable. No reordenar debajo del puntero durante una lectura.
- La calidad se muestra junto al estado: vencida, inconsistente, sin lectura o sin umbrales. Las incidencias de calidad tienen un contador visible para no quedar ocultas al final de la cinta.
- Un error de red muestra “No se pudieron actualizar las estaciones” y reintento; conserva la última consulta con su fecha cuando exista.
- Desactivar los símbolos de estaciones en Capas no oculta el monitoreo: son preferencias distintas.

Una cinta con última lectura puede entregarse antes del gráfico. No mostrar sparklines hasta disponer de historia real y suficiente para cada estación.

## 7. Inventario de refactorización por grupo

| Componentes / grupo | Destino propuesto |
|---|---|
| `InfraestructuraMapClient`, `MapInfraestructuraPage` | Separar shell, navegación, estado serializable y vista cartográfica. Mantener MapLibre y los cálculos existentes. |
| `PanelLateral`, `PanelEncabezado` | Reconducir a panel de resultados colapsable o vista de lista. Eliminar la responsabilidad de mostrar una ficha completa. |
| `PanelSituacionActual`, `ResumenDepartamento` | Resumen breve en mapa; detalle/listado en Escuelas. Identificar siempre el alcance provincial/departamental/filtrado. |
| `PanelRadar`, `RadarMeteo`, selector, timeline, alertas y leyenda meteo | Modo Pronóstico con controles y resultados agrupados; reservar espacio para timeline y evitar cruzarlo con la cinta. |
| `PanelPlanificacion` | Mantener vistas de aislamiento/inundación/historial y orden por prioridad; compartir la presentación de filas escolares. |
| `FiltrosChips`, búsqueda y `Segmentado` | Mantener filtros visibles y un resumen de los ocultos. Separar seleccionar un resultado de modificar filtros. |
| `SeleccionEscuela`, `FichaEscuelaPanel` | Vista previa compacta y composición de página escolar; un único modelo de selección. |
| `BloqueAcceso`, `CapasAccesosTerritoriales`, cruces y ruta | Reutilizar geometría; detalle bajo demanda en escuela. Popups de cruces breves. |
| `RiesgoEscuela`, `FichaTerritorial` | Reutilizar datos; separar riesgo estimado, condición estructural y observaciones. Reducir explicación técnica inicial. |
| Estado actual, clases, afectaciones, borradores y novedades | Módulos de la ficha escolar; conservar permisos, actualización y semántica. |
| `GaleriaEvidencia`, visor de fotos | Evidencia en ficha; conservar ampliación específica y carga diferida. |
| `HistorialParteModal`, historial y línea de tiempo | Historial integrado en ficha, con carga por rango/paginación; revisar otros consumidores antes de retirar el modal. |
| `AlcanceNominalModal` | Acción protegida desde la ficha; mantener autorización real en servidor y retorno de foco. |
| `CapaEstacionesRio` | Dibujar símbolos; extraer consulta y selección al modelo compartido. Popup breve que abre Ríos. |
| `CapaLluviaObservada` | Mantener overlay con ventana y cobertura; distinguir estimación satelital IMERG de medición puntual. |
| `CapaEventosReportados`, `SeccionEventosReportados` | Resumen contextual secundario con fuente/fecha; distinguir noticias de partes escolares verificados. |
| `CapaPuntosNivel`, clusters, iconos y badges escolares | Conservar cálculo y hit-testing; revisar densidad por zoom y leyendas. |
| `PanelCapas`, `LeyendaMapa`, pantalla completa | Configuración temporal, leyenda contextual y controles en slots reservados. Revisar portales en fullscreen. |
| `PanelEstadisticas`, `EvolucionPanel`, gráficos | Mantener vista de ancho completo, filtros compartidos y agregaciones consistentes. |
| `MetodologiaMapa` | Ayuda secundaria; conservar procedencia y explicación ampliada, sin eliminar vigencia del contexto operativo. |
| `VeredictoModal` | Integrar entrada en resumen/acciones, evitando otro botón flotante; conservar flujo y selección departamental. |
| `overlay-styles`, CSS global y popup CSS | Consolidar reglas activas, tokens de densidad y escala de capas visuales; evitar overrides sucesivos. |

Archivos como `map-view`, `title-panel`, `legend-panel`, `feature-popup`, `basemap-control` o controles compartidos no deben borrarse por quedar fuera de esta composición: confirmar consumidores de otros mapas. El inventario describe módulos y dependencias activas, no declara obsoletos todos los archivos del directorio.

## 8. Criterios visuales y responsive

**Jerarquía:** una superficie principal por tarea, números con dígitos tabulares, nombres legibles, fuente/fecha en segundo nivel y color reservado para severidad/estado. El color de selección debe distinguirse del color de alerta.

**Densidad:** filas consistentes para listas; evitar convertir cada dato en una tarjeta con borde, sombra y badge. Limitar el resumen del mapa a indicadores decisivos y trasladar el resto a Estadísticas o detalle. Definir tamaños y espaciados desde tokens existentes antes de cambiar tipografía o iconografía.

**Escritorio:** mapa amplio, panel de resultados opcional y preview compacto; nunca expediente completo y lista larga abiertos simultáneamente sobre el mapa. La ficha escolar usa el ancho de página con columna secundaria solo cuando haya espacio.

**Tablet:** alternancia explícita mapa/lista; herramientas temporales y preview único. Evitar el traslado lateral de dos paneles completos que terminan ocupando el mismo lugar.

**Móvil:** mapa/lista accesibles mediante control claro. Selección abre resumen inferior breve; ficha completa navega a página. Ríos usa lista y detalle consecutivos. Priorizar un solo scroll principal en cada vista y respetar safe areas/teclado.

**Interacción:** foco visible, retorno de foco al cerrar un diálogo, Escape solo en la superficie activa, botones con etiquetas claras, leyendas accesibles y alternativa de listado a la interacción con el canvas. Animación breve y limitada; ninguna actualización automática mueve el contenido que se está leyendo.

### 8.1 Política transversal de componentes y primitivas

**Decisión:** utilizar [Arc UI](https://uiarc.dev/) a lo largo del refactor junto con las primitivas de Base UI y los componentes reutilizables del proyecto. No implementar una interacción custom cuando exista una primitiva adecuada en estas opciones. Esta política rige desde el prototipo del batch 1 hasta la revisión final del batch 8.

La reutilización busca reducir fallas de interacción y mantenimiento; no reemplaza la verificación. El layout, la composición de la ficha, las capas cartográficas, los datos y las reglas de dominio siguen siendo específicos del producto. Se adaptan estilos y tokens sin reescribir el comportamiento de las primitivas.

| Necesidad | Criterio de elección |
|---|---|
| Patrón ya resuelto en `components/ui` sobre una primitiva | Reutilizar o extender ese componente; no crear una segunda implementación equivalente. La existencia de un componente local custom no lo exime de revisar si una primitiva lo puede reemplazar. |
| Interacción básica todavía no resuelta | Usar Base UI o un componente Arc adecuado, verificando su contrato y dependencias. No implementar manualmente foco atrapado, retorno de foco, teclado, selección o posicionamiento si la primitiva los cubre. |
| Componente o bloque Arc que resuelve una necesidad del flujo | Adoptarlo con sus dependencias declaradas y adaptar su presentación a `design.md`. La matriz del batch 1 define usos concretos y el batch de integración; citar Arc solo como inspiración no cumple esta decisión. |
| Información y composición escolar, hidrométrica o cartográfica | Componer módulos de dominio sobre los componentes elegidos y los motores existentes. Una primitiva no sustituye permisos, contratos de datos ni restauración del contexto. |
| Ninguna opción cubre el comportamiento necesario | Registrar la carencia y el alcance mínimo propio, con motivo verificable y pruebas de ese comportamiento. No usar diferencias de estilo como justificación para reconstruir una primitiva. |

**Integración de Arc:** su [instalación oficial](https://uiarc.dev/docs/installation) distribuye código fuente mediante el registro `@uiarc` o copia manual. Requiere React 19 y utiliza CSS Modules y variables CSS; las dependencias se comprueban por componente. No exige migrar a Tailwind. El código incorporado pasa a mantenerse dentro del proyecto: conservar procedencia y registrar adaptaciones relevantes.

Arc no debe asumirse construido sobre Base UI. Por ejemplo, su [Dialog](https://uiarc.dev/components/dialog) declara `@radix-ui/react-dialog`, `motion` y `lucide-react`, mientras `components/ui/dialog.tsx` ya utiliza `@base-ui/react/dialog`. No reemplazarlo solo por la apariencia de Arc ni portar a mano el comportamiento de Radix a Base UI. Elegir una implementación por patrón y justificar cualquier dependencia adicional.

- Mapear los tokens de Arc a los institucionales; revisar su foundation antes de incorporarla y evitar sobrescribir el tema global. Verificar claro/oscuro, portales y pantalla completa en los componentes afectados.
- Elegir movimiento por su función y respetar movimiento reducido; no incorporar efectos de demostración que compitan con el mapa o la lectura.
- Verificar disponibilidad Free/Pro y licencia del componente seleccionado. Si un componente Pro no está disponible, usar una alternativa adecuada de Base UI o Arc disponible y registrar el cambio; no reproducirlo a mano para eludir la falta de acceso.
- Mantener una matriz por necesidad con componente/procedencia, documentación, dependencias/licencia, adaptación y batch. Actualizarla al entregar cada batch y justificar cualquier excepción custom con su verificación.

## 9. Plan de entrega

El orden detallado de ejecución está en el [plan por batches](2026-10-16-plan-batches-ui-infraestructura.md), con alcance, dependencias y condiciones de cierre para cada entrega.

| Fase | Entrega concreta | Condición de cierre |
|---|---|---|
| 0 · Prototipo | Mapa limpio, preview, ficha escolar y Ríos; versiones escritorio/tablet/móvil. | Validar recorrido y legibilidad con contenido largo y casos sin datos. |
| 1 · Escuela | Página canónica + preview + retorno de contexto. Reutilizar módulos actuales. | Consulta y actualización completas sin expediente en el mapa; enlaces directos y Atrás funcionan. |
| 2 · Shell y resultados | Navegación, Capas como herramienta, patrón de lista y CSS consolidado. | Sin overlays en conflicto; filtros y totales coherentes entre vistas. |
| 3 · Monitoreo | Hook común de estaciones, cinta pausable, lista de Ríos y estados de carga/error/calidad. | Todas las superficies muestran la misma lectura y vigencia. |
| 4 · Historia | API de series, cobertura y gráfico de alturas por estación. | Ventanas reales, umbrales correctos, vacíos y calidad visibles. |
| 5 · Cierre | Revisión visual, accesibilidad, rendimiento y retiro de código sin consumidores. | Regresiones verificadas y navegación anterior compatible. |

Las fases son entregas de producto; no requieren reescribir los modelos de riesgo ni cambiar la biblioteca cartográfica. La prioridad es sacar el detalle escolar del mapa; la cinta puede salir con la lectura vigente antes de la historia.

## 10. Verificación y criterios de aceptación

- [ ] Seleccionar una escuela muestra resumen breve y no despliega el expediente completo.
- [ ] Toda escuela tiene URL de detalle; funciona también sin reporte o coordenadas.
- [ ] Volver restaura modo, filtros, selección, cámara y capas; desde Escuelas restaura la lista.
- [ ] Cargar/actualizar un parte conserva el contexto y mantiene el flujo offline existente.
- [ ] No se muestran datos nominales sin autorización; ocultar botones no sustituye controles de servidor.
- [ ] Reporte, riesgo estimado, noticia y observación se distinguen con texto y procedencia.
- [ ] Cambiar modo no rompe selección ni obliga a recargar innecesariamente el mapa.
- [ ] Estación muestra altura, estado de nivel, variación, período y fecha; lecturas no confiables no llevan flechas engañosas.
- [ ] Un gráfico sin puntos explica la falta de cobertura; huecos e inconsistencias son visibles.
- [ ] Cinta pausable, teclado, movimiento reducido y versión estática funcionan.
- [ ] Capa apagada y monitoreo son independientes; falla de carga no equivale a cero estaciones.
- [ ] No hay colisiones entre preview, leyenda, timeline, atribución y controles en 390, 768, 1024 y 1440px, ni con zoom de texto al 200%.
- [ ] Abrir fotos o datos nominales gestiona foco correctamente y vuelve al contexto de la ficha.
- [ ] La matriz de componentes identifica usos concretos de Arc, reutilización de Base UI/componentes locales y cualquier excepción propia justificada; no se reconstruyen interacciones ya cubiertas por primitivas adecuadas.
- [ ] Los componentes incorporados tienen procedencia, dependencias y licencia registradas; la integración conserva identidad institucional, temas, teclado, foco, portales y movimiento reducido donde correspondan.

Al implementar: pruebas de integración de navegación/retorno, estados de datos y permisos; pruebas de API para series y calidad; regresiones existentes del mapa; revisión visual en navegador autenticado con contenido realista. Ejecutar las verificaciones del repositorio que correspondan a cada entrega. Este documento no acredita pruebas de una implementación todavía inexistente.

## 11. Decisiones recomendadas para comenzar

1. **Ficha completa en página propia**, con preview desde mapa y listado.
2. **Ríos como destino de monitoreo**, con delta publicado primero y gráfico histórico después de validar cobertura.
3. **Marquee controlable**, con pausa y alternativa estática, ubicado fuera del lienzo.
4. **Capas y Metodología como herramientas secundarias**, conservando las funciones y enlaces existentes.
5. **Refactorizar presentación y composición**, reutilizando cálculos, APIs de lectura y componentes de dominio que ya funcionan.
6. **Adoptar Arc UI y Base UI con reutilización de primitivas**, definiendo la matriz en el batch 1 y verificando su aplicación en cada entrega. Evitar implementaciones custom de interacciones ya resueltas.

El próximo entregable recomendado es un prototipo navegable de esos recorridos, antes de modificar el componente cartográfico principal.
