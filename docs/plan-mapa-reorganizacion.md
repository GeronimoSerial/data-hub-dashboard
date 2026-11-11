# Plan de integración del mapa de reorganización escolar

## Objetivo y estado

Crear un mapa nativo en `/mapas/reorganizacion`, integrado al catálogo y los permisos del hub, que conserve todas las funcionalidades operativas del mockup V29. La profesionalización debe mejorar la presentación y el uso sin cambiar silenciosamente el universo, los cálculos ni las reglas metodológicas.

Estado: propuesta de implementación. Este documento registra el análisis y el plan; no implica que las tareas estén implementadas ni aprobadas individualmente.

Fuente principal: [mockup V29](../services/Mapa_Reduccion_Establecimientos_Hasta_10_Alumnos_V29_Diseno_Actualizado_Liquidaciones.html).

Requisitos del usuario:

- Conservar todas las funcionalidades del mockup.
- Usar las tecnologías de mapas, capas y datos del hub.
- Abrir con Corrientes encuadrada como en el mapa de natalidad.
- Aplicar el filtro antislop durante la planificación y la implementación.

## Enfoque recomendado

Construir un recurso nuevo, sin incrustar el HTML ni reemplazar el mapa de matrícula. Reutilizar MapLibre, React Map GL, GeoJSON, cartografía provincial y componentes del hub, manteniendo un módulo de datos y reglas propio para reorganización.

Orden de trabajo: referencia funcional y datos, integración y permisos, mapa e interacciones, validación de paridad y mejoras adicionales.

## Hallazgos del análisis

El análisis se realizó por inspección del código y lectura de los datos JSON embebidos. No incluyó ejecución del mockup en un navegador ni consultas a las fuentes originales externas.

### Inventario del corte V29

| Concepto | Resultado verificado |
| --- | ---: |
| Establecimientos del universo | 265 CUE-Anexo únicos |
| Matrícula primaria | 1.376 alumnos |
| Rango de matrícula por establecimiento | 1 a 10 alumnos |
| Establecimientos con coordenadas | 265 |
| Establecimientos con importe salarial positivo | 262 |
| Establecimientos con registros POF incorporados | 0 |
| Centros de zona | 64 |
| Zonas con establecimientos asignados | 62 |
| Establecimientos clasificados como aislados | 89 |
| Establecimientos de referencia | 1.166 |
| Referencias con oferta primaria | 888 |
| Referencias con oferta secundaria | 339 |

Las referencias primarias y secundarias no son conjuntos excluyentes. El objeto de agregados de matrícula y oferta contiene 1.167 claves, mientras que el arreglo de referencias contiene 1.166 establecimientos; el importador deberá informar esta diferencia sin descartar registros silenciosamente.

### Cobertura y diferencias relevantes

- Historia disponible: 224 establecimientos en 2023, 234 en 2024, 244 en 2025 y 265 en 2026. La ausencia de dato histórico no equivale a matrícula cero.
- Faltan importes salariales positivos para `1800027-00`, `1800521-00` y `1801048-00`.
- Todos los registros POF están vacíos. La interfaz debe informar ausencia de registros en la fuente, no ausencia de personal. El personal de liquidaciones y los agentes POF son conceptos separados.
- La metodología menciona 59 centros originales. El arreglo contiene los identificadores 1 a 64, con cinco adicionales del 60 al 64. Los centros 38 y 58 no tienen miembros; las cinco zonas adicionales agrupan 10 establecimientos. Confirmar y documentar la procedencia sin recalcular asignaciones durante la migración.
- El dataset del mapa de matrícula existente tiene 288 puntos y solo 223 CUE coinciden con el universo V29. No es una fuente intercambiable.
- Las pestañas de la barra superior del mockup son elementos sin comportamiento. No constituyen funcionalidades implementadas ni justifican trasladar controles inertes.

### Reglas operativas que deben preservarse

Los filtros reducen el listado y sus indicadores, pero mantienen todas las escuelas del universo como contexto en el mapa. Las coincidencias se resaltan y las demás se atenúan. El selector de clasificación salarial modifica el resaltado, no el conjunto filtrado.

Los círculos y los resúmenes de zona representan la zona completa, incluso cuando el listado está filtrado. Las zonas usan círculos de 20 km de diámetro, con radio de 10 km.

La tendencia zonal compara 2023 y 2026 únicamente para los mismos establecimientos con registro histórico disponible. Una zona sin establecimientos comparables debe quedar identificada como sin comparación.

El universo corresponde a Primaria común de 1 a 10 alumnos según el corte que declara el mockup, del 28/10/2026. La existencia de POF o de liquidaciones no define la pertenencia al universo.

## Alcance obligatorio de paridad

| Área | Funcionalidad a conservar |
| --- | --- |
| Universo | Identificación por CUE-Anexo, matrícula y pertenencia al corte V29 |
| Indicadores | Establecimientos filtrados, alumnos, establecimientos ubicados y con POF identificada |
| Filtros | Departamento, zona histórica, búsqueda por CUE/nombre/localidad, tendencia zonal y presencia de registros POF |
| Resaltado | Clasificación de zona salarial, incluyendo clasificación faltante |
| Zonas especiales | Aislados y opción para establecimientos sin ubicación, aunque el corte actual esté completamente geolocalizado |
| Contexto educativo | Capas independientes de otras primarias y secundarias |
| Ficha escolar | CUE-Anexo, nombre, departamento, localidad, zona, matrícula y evolución 2023 a 2026 |
| Oferta educativa | Matrícula agregada, turnos, modalidades y orientaciones disponibles |
| POF | Agentes y desglose por situación de revista cuando existan registros |
| Liquidaciones | Importe mensual, personal informado, clasificación de zona y período |
| Ficha zonal | Miembros, panel comparable, tendencia, matrícula y resumen económico de la zona completa |
| Recorridos | Activación, selección de origen y destino, trazado vial, distancia, tiempo teórico y limpieza |
| Cartografía | Alternativas vial/topográfica, calles y satélite; límites y nombres departamentales |
| Navegación | Listado conectado al mapa, selección, acercamiento, leyenda y panel plegable |
| Metodología | Fuentes, períodos, faltantes, reglas de agrupación y advertencias |

## Diseño de la experiencia

### Dirección visual

Usar la identidad institucional definida en [design.md](../design.md): tipografía Barlow, superficies sólidas, componentes existentes y contraste legible. El mapa es la superficie principal de una herramienta de planificación territorial.

Parámetros de diseño: energía 1, ritmo 1 y movimiento 1. Las transiciones deben ayudar a reconocer selecciones y cambios de panel, sin animación decorativa y respetando movimiento reducido.

| Decisión | Motivo |
| --- | --- |
| Mapa como superficie principal | La tarea central es comprender proximidad, zonas y posibilidades de recorrido |
| Panel plegable de filtros y listado | Permite trabajar con criterios sin repartir controles por todo el mapa |
| Ficha contextual de escuela o zona | Permite leer datos extensos sin saturar el mapa con popups |
| Tipografía y componentes del hub | Mantiene continuidad institucional y evita un segundo sistema visual |
| Colores por categoría y anillos de selección | Separa pertenencia educativa, coincidencias y selección sin depender solo del color |
| Movimiento discreto | Conserva la orientación espacial y reduce distracciones |

### Disposición y navegación

En escritorio, un panel plegable reúne indicadores, filtros y listado. La ficha contextual muestra escuela o zona. Los controles de capas y mapa base quedan agrupados, con una leyenda accesible desde el inicio.

En móvil, filtros y fichas pasan a un panel desplegable para no cubrir permanentemente el mapa. Deben evitarse desbordes horizontales y superposiciones con controles.

El encuadre inicial debe mostrar Corrientes completa, con límites y máscara exterior, ajustándose al tamaño real del contenedor y al espacio ocupado por el panel. Reutilizar el criterio de natalidad de `resize` y `fitBounds` al cargar o al mostrarse por primera vez. No reiniciar el encuadre del usuario al volver de otra vista.

Agregar un control para volver al encuadre provincial y reutilizar pantalla completa. Mantener estado de filtros, selección, capas y recorrido al cambiar de vista.

### Semántica cartográfica

- Amarillo para establecimientos del universo.
- Celeste para otras primarias.
- Verde para secundarias.
- Anillo y etiqueta para selección o coincidencias.
- Color de zona para tendencia de matrícula, con leyenda textual.

Las escuelas deben conservar prioridad de selección sobre zonas y departamentos. Si se incorpora agrupación de puntos, debe permitir llegar a cada escuela y seleccionar origen o destino sin ocultar su categoría ni alterar los conteos del universo.

## Fases de implementación

### 1. Congelar la referencia funcional

- [ ] Crear un importador reproducible que extraiga los datos del HTML sin ejecutar sus scripts.
- [ ] Registrar versión, fuentes declaradas, fechas de corte y cobertura.
- [ ] Validar CUE-Anexo, duplicados, coordenadas, importes, series y referencias sin correspondencia.
- [ ] Preservar los 64 centros, identificadores y pertenencias actuales.
- [ ] Crear una matriz que relacione cada comportamiento del mockup con su implementación y prueba.
- [ ] Guardar resultados de referencia para conteos, filtros, tendencias y cálculos económicos.

Entregable: corte V29 normalizado y referencia verificable de paridad.

### 2. Separar datos y reglas de la interfaz

- [ ] Crear un módulo de reorganización con tipos y validaciones para establecimientos, referencias, series, zonas, POF y liquidaciones.
- [ ] Mantener funciones independientes de la interfaz para búsqueda, filtrado, resaltado, comparación y cálculo económico.
- [ ] Conservar las diferencias entre matrícula del universo, matrícula agregada de oferta, agentes POF y personal de liquidaciones.
- [ ] Servir datos operativos y salariales mediante APIs protegidas, no mediante archivos en `public/data`.
- [ ] Mantener cartografía pública compartida cuando corresponda.
- [ ] Exponer versión, período y cobertura de cada fuente en la interfaz.

La primera versión utiliza el corte V29 versionado. Una actualización automática desde otras fuentes queda fuera de la migración inicial: requiere definir cómo cambiarán el universo, las pertenencias y la comparabilidad histórica.

### 3. Integrar el recurso al hub

- [ ] Crear `/mapas/reorganizacion`, con carga diferida del mapa siguiendo el patrón del hub.
- [ ] Registrar el recurso Reorganización escolar en el catálogo.
- [ ] Aplicar permisos de sección y audiencia del recurso tanto en página como en APIs.
- [ ] Incorporar la ruta a los registros de destinos y controles de acceso que lo requieran.
- [ ] Usar alta idempotente sin sobrescribir audiencias administradas.
- [ ] Mantener el alcance de las instalaciones con catálogo exclusivo de infraestructura.
- [ ] Evitar acoplar el nuevo recurso a permisos exclusivos de infraestructura por reutilizar sus endpoints.

### 4. Implementar el mapa y sus interacciones

- [ ] Reutilizar MapLibre y React Map GL, sin introducir Leaflet ni un iframe.
- [ ] Incorporar máscara, límites y nombres departamentales desde la cartografía compartida.
- [ ] Implementar capas de zonas, universo, otras primarias, secundarias, selección, coincidencias y recorrido.
- [ ] Conectar indicadores, filtros, listado y mapa a un estado coherente.
- [ ] Mantener contexto atenuado y separar filtrado de resaltado por clasificación salarial.
- [ ] Implementar fichas escolares y zonales con toda la información disponible.
- [ ] Conservar alternativas vial/topográfica, calles y satélite sin perder capas al cambiar de fondo.
- [ ] Revisar proveedor, atribución, licencia y disponibilidad de la capa satelital, hoy ausente del registro compartido de mapas base.
- [ ] Implementar panel plegable, vista móvil, encuadre provincial y pantalla completa.
- [ ] Mostrar estados de carga, error, datos faltantes y búsqueda sin coincidencias.

### 5. Implementar recorridos y análisis económico

#### Recorridos

El mockup consulta `router.project-osrm.org` para obtener recorridos en automóvil entre dos escuelas. La integración deberá encapsular el proveedor detrás de una API protegida y configurable, con validación de entradas, timeout, cancelación de consultas obsoletas y límites de uso. La elección de un servicio de producción queda pendiente de confirmar; no se debe asumir disponibilidad garantizada del servidor público.

- [ ] Permitir origen y destino desde las tres categorías de escuelas y desde el listado.
- [ ] Mostrar origen, destino, geometría vial, kilómetros y tiempo teórico.
- [ ] Limpiar ruta y estado al solicitarlo o iniciar otra medición.
- [ ] Informar errores del proveedor y caminos no conectados sin reemplazarlos por una distancia lineal.
- [ ] Advertir que el tiempo no contempla estado del camino ni clima y que puede faltar información rural en OpenStreetMap.

#### Economía

Preservar la fórmula del mockup por zona completa:

```text
costo informado = suma de importes salariales positivos disponibles
referencia retenida = establecimiento con mayor importe informado
potencial bruto mensual = costo informado - importe de la referencia retenida
potencial bruto anual = potencial bruto mensual * 12
```

El potencial solo es calculable si la zona tiene al menos dos establecimientos y al menos dos importes positivos. Con cobertura parcial, la cifra representa únicamente los importes disponibles y debe indicarlo.

- [ ] Mostrar cantidad de escuelas con importe sobre el total zonal y personal informado.
- [ ] Identificar la referencia retenida y el supuesto utilizado.
- [ ] No extrapolar importes faltantes ni convertirlos en salarios cero.
- [ ] Mantener la advertencia de que no se descuentan cargos a conservar o reubicar, transporte, adecuaciones ni costos del receptor.
- [ ] Presentar los resultados como potencial bruto bajo un supuesto, nunca como ahorro confirmado ni recomendación automática de cierre.

### 6. Verificar paridad y calidad

- [ ] Probar funciones de importación, filtrado, resaltado, comparación histórica y cálculo económico.
- [ ] Probar las combinaciones de filtros y su coherencia con listado e indicadores.
- [ ] Probar fichas, selección y prioridad de clic sobre zonas y departamentos.
- [ ] Probar rutas exitosas, falta de conexión vial, timeout, error y cancelación.
- [ ] Probar cambios de fondo y vistas sin pérdida de estado.
- [ ] Probar acceso directo a página y APIs con sesión ausente o audiencia denegada.
- [ ] Probar carga, error, ausencia de resultados y datos parciales.
- [ ] Ejecutar revisión visual en escritorio y móvil, teclado y temas del hub.
- [ ] Ejecutar pruebas del módulo, chequeo de tipos, lint y build, documentando los resultados reales.

## Criterios de aceptación

- [ ] El corte inicial conserva 265 establecimientos únicos, 1.376 alumnos, 262 importes salariales positivos y cobertura POF vacía identificada como tal.
- [ ] Los 64 centros y sus asignaciones se mantienen; las 62 zonas ocupadas y los 89 aislados coinciden con la referencia.
- [ ] La historia faltante no se interpreta como cero y las tendencias usan paneles comparables.
- [ ] Todos los filtros funcionan y el mapa conserva el contexto atenuado del mockup.
- [ ] La clasificación salarial solo modifica resaltados y su contador, sin alterar el conjunto filtrado.
- [ ] Cada escuela y zona conserva su información y sus advertencias metodológicas.
- [ ] Los resúmenes económicos usan la zona completa y respetan fórmula, cobertura y condiciones de cálculo.
- [ ] Se puede medir entre escuelas de las tres categorías; los errores nunca producen un falso recorrido vial.
- [ ] Las alternativas cartográficas, límites y nombres departamentales funcionan sin perder las capas operativas.
- [ ] La primera apertura encuadra Corrientes y el retorno a la vista de mapa no reinicia la cámara del usuario.
- [ ] Página y APIs respetan la audiencia del recurso; el dataset salarial no queda expuesto como archivo público.
- [ ] Ningún control visible queda sin comportamiento, y la navegación funciona en móvil y por teclado.
- [ ] La matriz de paridad permite contrastar cada función operativa con el HTML original.

## Mejoras adicionales y exclusiones

Estadísticas y exportación reales del corte y de la selección son mejoras propuestas, no funcionalidades existentes en el HTML. Antes de implementarlas, definir contenido, formatos y permisos. Deben conservar filtros, fuentes, períodos y advertencias en cualquier salida.

Quedan fuera de la migración inicial:

- Radar meteorológico y situación operativa, que pertenecen a otros dominios del hub.
- Decisiones automáticas de cierre, elección de receptores o certificación de ahorros.
- Actualización automática del universo o recálculo de zonas sin reglas aprobadas.
- Sustitución del mapa de matrícula o modificación de su dataset.
- Incorporación de información personal nominal de alumnos o agentes.

## Dependencias por resolver

| Punto | Acción pendiente |
| --- | --- |
| Fuente POF vacía | Confirmar disponibilidad de una fuente con registros; mantener la funcionalidad y el estado sin datos mientras tanto |
| Cinco zonas adicionales | Confirmar procedencia y documentar la diferencia respecto de los 59 centros originales declarados |
| Referencias y agregados de oferta | Conciliar las 1.166 referencias con las 1.167 claves de agregados sin descartar información silenciosamente |
| Servicio vial | Elegir proveedor o infraestructura apta para el uso esperado y confirmar condiciones de uso |
| Satélite | Confirmar fuente, licencia, atribución y disponibilidad |
| Actualizaciones futuras | Definir versionado, aprobación y reglas de comparabilidad antes de automatizar |

## Referencias técnicas

| Archivo | Uso como referencia |
| --- | --- |
| [Mapa de natalidad](../components/mapas/map-natalidad-page.tsx) | MapLibre, encuadre provincial y manejo de visibilidad |
| [Ruta de natalidad](../app/(hub)/mapas/natalidad/page.tsx) | Acceso a la página por sesión y recurso |
| [Cliente de natalidad](../app/(hub)/mapas/natalidad/map-client.tsx) | Carga diferida y conservación del mapa entre vistas |
| [Cartografía provincial](../lib/mapas/departamentos.ts) | Límites de Corrientes, máscara y geometrías compartidas |
| [Tipos y mapas base](../lib/map-types.ts) | Registro actual de mapas base; no reutilizar sus tipos de dominio si pierden campos V29 |
| [Registro de recurso](../lib/mapas/recurso-seed-natalidad.ts) | Alta idempotente y preservación de audiencias |
| [Inicialización del catálogo](../lib/db/seed.ts) | Respeto por catálogos exclusivos de infraestructura |
| [Control de acceso del hub](../lib/hub-entry-server.ts) | Autorización por ruta y recurso |
| [Destinos y secciones](../lib/hub-sections.ts) | Registro de navegación y políticas del hub |
| [Identidad institucional](../design.md) | Tipografía, colores, superficies y accesibilidad |

## Próximo paso

Revisar el alcance obligatorio y las dependencias pendientes. Iniciar la implementación por el importador y la matriz de paridad; no comenzar por una reconstrucción visual que pueda omitir reglas del mockup.
