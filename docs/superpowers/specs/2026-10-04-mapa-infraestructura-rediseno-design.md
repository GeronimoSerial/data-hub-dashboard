# Rediseño del mapa de infraestructura — diseño

- **Fecha:** 2026-10-04
- **Estado:** aprobado el diseño visual (prototipo); spec pendiente de revisión
- **Alcance:** `/mapas/infraestructura` (`app/(hub)/mapas/infraestructura/map-client.tsx`, `components/mapas/map-infraestructura-page.tsx` y sus paneles), la pestaña de evolución (`components/infraestructura/evolucion-panel.tsx`) y el cálculo de la ruta de acceso (`services/geo-static`).
- **Base:** el modelo de datos del parte rediseñado (`docs/superpowers/plans/2026-10-04-parte-rediseno-plan.md`, batch 2 ya mergeado). Este spec **no modifica** ese flujo; sólo consume sus datos (gravedad, criterio único de relevancia, cierre "solucionada", evacuado ⇒ sin clases).
- **Plataforma objetivo:** escritorio. El mapa es desktop-only; el layout no debe romperse en pantallas angostas, pero no hay objetivos de rendimiento móvil.
- **Prototipo de referencia:** `docs/superpowers/specs/2026-10-04-mapa-infraestructura-prototipo.html` (datos inventados). Ante una duda visual, el prototipo manda.

## 1. Problema

Feedback del dueño de producto sobre el mapa actual:

1. **Demasiadas funcionalidades, mal agrupadas.** La información está dispersa y no hay un flujo claro para seguir.
2. **El reporte de escuela quedó relegado**, aunque es la alerta más relevante.
3. **Exceso de texto técnico.** Atribuciones ("© OpenStreetMap contributors (ODbL) · extracto 2026-09-26"), metodología del acceso (resolución en arcsec, período de retorno, fuente WRI Aqueduct, "No es un pronóstico…"), "fuente vencida" en el contexto territorial y la lluvia observada. Nada de eso sirve en una emergencia. La leyenda también tiene demasiado texto.
4. **Sidebar sin jerarquía.** Títulos de tamaños distintos, sin desplegables, sin orden visual.
5. **Filtrado pobre.** Siete campos de texto libre (`FiltrosForm`, `map-infraestructura-page.tsx:353`): el nivel se escribe en lugar de elegirse y la búsqueda no encuentra resultados. No hay estadísticas por filtro.
6. **Capas y filtros se confunden.** "Evacuación" y "Sin reportar" son capas (`CAPAS_VISIBLES_DEFECTO`, `:620`), pero en realidad son estados de escuela.
7. **Dos sistemas de pestañas.** La fila "Operativa · Evolución" (`map-client.tsx:82`) convive con el conmutador flotante "Situación actual / Radar" (`ModoMapa`, `:250`).
8. **Bug:** con el sidebar abierto, al pasar a Radar el sidebar queda en blanco.
9. **"Sin reportar" no se entiende.** Cuenta partes existentes cuya `actualizadaEn` supera 72 h (`lib/infraestructura/parte-mapa.ts:500`), no escuelas que nunca reportaron. La etiqueta dice una cosa y el cálculo otra.
10. **Falta el apoyo pedagógico.** No se ve qué escuelas sin clases brindan apoyo ni de qué manera, aunque el dato existe (`asistenciaPedagogica`: `Clase virtual` / `Cuadernillo`).
11. **La ruta de acceso usa un mal criterio.**
    - Se calcula como la más corta en metros (`weight="length"`, `services/geo-static/src/geo_static/osm_aislamiento.py:1322`): un camino de tierra más corto gana a una ruta pavimentada.
    - El destino es la cabecera departamental (`jobs/calcular_aislamiento.py:12`, `:330`), no el centro urbano más cercano.

## 2. Objetivos y no-objetivos

**Objetivos**

- Que quien entra entienda en segundos qué está viendo y adónde ir.
- Que el reporte de escuela sea lo primero que se ve.
- Un único lugar para cada cosa: una fila de pestañas, una barra de filtros, un panel lateral por pestaña.
- Cero texto técnico en la interfaz operativa.
- Números que respetan los filtros y coinciden entre el mapa y las estadísticas.
- Una ruta de acceso que refleje por dónde llegaría realmente la ayuda.

**No-objetivos**

- No se modifica el flujo de carga del parte ni su modelo de datos.
- No se agrega carga manual nueva. El parte sigue siendo el único ingreso manual y sólo se usa cuando pasa algo.
- No se cambian los motores de riesgo del Radar ni sus horizontes; sólo cómo se presentan.
- No se agregan capas nuevas de datos.

## 3. Estructura de la pantalla

```
┌───────────────────────────────────────────────────────────────┐
│ Situación actual (12) │ Radar │ Planificación │ Estadísticas    │  ← una sola fila
├───────────────────────────────────────────────────────────────┤
│ [Buscar escuela o CUE] [Departamento ▾] [Nivel ▾] … [Sin act.] │  ← filtros compartidos
├──────────────────────────────────────────┬────────────────────┤
│                                          │ Panel de la        │
│                 Mapa                     │ pestaña activa     │
│  ┌ leyenda (2 líneas) ┐                  │ (o ficha escuela)  │
└──────────────────────────────────────────┴────────────────────┘
```

### 3.1 Pestañas

- Una sola fila: **Situación actual · Radar · Planificación · Estadísticas**. Reemplaza la fila "Operativa · Evolución" y elimina el conmutador flotante `ModoMapa` (`.map-modo-conmutador` y la variable `--infra-modo-panel-bottom`).
- "Situación actual" abre por defecto y muestra un contador con las escuelas que tienen reporte abierto.
- La pestaña sigue siendo linkeable por hash (`#actual`, `#radar`, `#planificacion`, `#estadisticas`). Los hashes viejos se mapean: `#operativa` → `#actual`, `#evolucion` → `#estadisticas`. El querystring `?modo=radar` se mapea a `#radar`.
- Radar sigue condicionado a `riskRadarEnabled`. Si el flag está apagado, la pestaña no aparece.
- Se mantiene la regla F5.1: el mapa **no se desmonta** al cambiar de pestaña. En Estadísticas se oculta con `hidden` y la pestaña ocupa todo el ancho.
- Un único componente decide qué panel lateral se muestra según la pestaña activa. Eso elimina por diseño el sidebar en blanco del Radar (problema 8).

### 3.2 Filtros compartidos

- Una barra debajo de las pestañas que vale para las cuatro pestañas. El mismo recorte se aplica al mapa, a los paneles y a Estadísticas.
- **Búsqueda** de texto libre, sólo por nombre de escuela o CUE.
- **Chips desplegables** con casillas (selección múltiple) y la cantidad de escuelas por opción:

  | Chip | Opciones |
  |---|---|
  | Departamento | los departamentos del padrón |
  | Nivel | Inicial, Primario, Secundario, Superior (los niveles reales del padrón) |
  | Gravedad | Crítica, Alta, Media, Baja, Sin reporte |
  | Clases | Con clases, Sin clases, Evacuado, Centro de evacuados |
  | Apoyo pedagógico | Brinda, No brinda, Clase virtual, Cuadernillo |

- **"Sin actualizar"** es un interruptor (chip on/off), no un desplegable.
- Un chip activo muestra el valor elegido (o "N elegidos") y una "×" para quitarlo. "Limpiar filtros" aparece sólo si hay algún filtro activo.
- Se eliminan los filtros de texto libre actuales (`territorio`, `nivel`, `motivo`, `severidad`, `categoria`, `servicio`). Motivo, categoría y servicio dejan de ser filtros de primer nivel. Si hacen falta, se suman como chips en una iteración posterior.
- Los filtros viven en el estado del cliente y se pierden al recargar.

### 3.3 Filtros vs. capas

- **Filtros = qué escuelas veo.** Siempre en la barra compartida.
- **Capas = qué información extra se dibuja sobre el mapa.** Son pocas y dependen de la pestaña (ver §4–§6). "Evacuación" y "Sin reportar" dejan de ser capas: pasan a ser íconos del punto (§4.1) y opciones de filtro.
- El selector de mapa base (`basemap-control.tsx`) se mantiene en todas las pestañas con mapa.

## 4. Situación actual

### 4.1 Punto de escuela

- Se muestra todo el padrón. Sigue vigente la regla de mostrar todas las escuelas, con totales por departamento y búsqueda.
- **Color = gravedad** de la situación abierta más relevante, según el criterio único de relevancia del batch 2 del parte. Crítica, Alta, Media y Baja usan la escala de severidad existente. **Sin reporte** se ve neutro: relleno de fondo, borde gris y un radio menor.
- **Ícono (lucide, sin anillos):** un badge chico sobre el punto indica el estado de clases. Se muestran *sin clases*, *evacuado* y *centro de evacuados*; *con clases* no lleva ícono. Si la escuela no tiene estado de clases afectado pero está *sin actualizar*, el badge es un reloj.
- La escuela seleccionada se marca con un contorno. La ruta de acceso se dibuja sola al seleccionar una escuela, sin capa para prender.

### 4.2 "Sin actualizar" (reemplaza "Sin reportar")

- Definición: una escuela tiene **al menos una situación abierta** y ninguna novedad en las últimas 72 h (`UMBRAL_SIN_REPORTAR_HORAS`, que se renombra a `UMBRAL_SIN_ACTUALIZAR_HORAS`).
- Una situación cerrada como "solucionada" nunca cuenta.
- Las escuelas que nunca reportaron **no** se marcan: se ven como "Sin reporte" y se interpretan como sin novedades.
- Se corrigen `parte-mapa.ts:500` y `filtrar-departamento-mapa.ts:15` para que filtren por situación abierta, y se renombra el indicador `sinReportar` → `sinActualizar` en tipos, API y UI.

### 4.3 Panel lateral

En este orden y con un solo tamaño de título por nivel:

1. **Encabezado:** "Situación actual" y la hora de la última actualización de datos.
2. **Números (2×2):** escuelas con reporte, sin clases, alumnos sin clases y sin actualizar. "Sin clases" va resaltado.
3. **Apoyo pedagógico:** "**X de Y** escuelas sin clases brindan apoyo pedagógico", con una barra de proporción. El dato aplica sólo a escuelas sin clases normales (sin clases, evacuado, centro de evacuados).
4. **Reportes:** lista ordenada por gravedad y, a igual gravedad, con las escuelas sin clases primero. Cada renglón lleva:
   - una franja de color de gravedad;
   - el nombre de la escuela;
   - departamento · nivel;
   - chips de clases, de apoyo (modalidad, o "Sin apoyo" en color de advertencia) y de sin actualizar;
   - el tiempo desde la última novedad.

   Un click en el renglón o en el punto del mapa abre la ficha. Si no hay resultados: "Ninguna escuela con reporte para estos filtros."

No hay panel de capas en esta pestaña.

### 4.4 Ficha de escuela

Reemplaza la lista en el mismo panel. Tiene "← Volver a la lista" arriba.

- **Encabezado:** nombre; CUE · departamento · nivel · alumnos.
- **Banda de gravedad:** "Gravedad Alta", categoría y desde hace cuánto, con el color de la gravedad. Sin situaciones abiertas: "Sin reportes abiertos".
- **Chips de estado:** clases, apoyo y sin actualizar.
- **Secciones desplegables:**
  - **Acceso** (abierta por defecto), ver §4.5.
  - **Clases y apoyo pedagógico** (abierta si la escuela no tiene clases normales): clases, apoyo ("No corresponde" si tiene clases) y alumnos.
  - **Situaciones (N abiertas):** categoría, a qué afecta y última novedad. El enlace al historial completo del parte se mantiene.
  - **Historial:** cantidad de situaciones en los últimos 2 años.

### 4.5 Bloque de acceso

Exactamente tres líneas, sin fuentes, fechas de extracto ni metodología:

```
Ruta Provincial 13 (pavimentada) → Saladas · 14 km
⚠ 2 cruces de agua en el camino          (o "Sin cruces de agua")
Riesgo de corte por inundación: Alto     (Bajo / Medio / Alto, con color)
```

- La primera línea es la vía principal del recorrido (nombre o `ref` de OSM y su tipo), la localidad destino y la distancia.
- Sin ruta calculada: "Sin acceso calculado".
- La explicación técnica (fuente OSM, WRI Aqueduct, resolución, período de retorno) se mueve a una página de ayuda aparte, enlazada desde el menú de ayuda general, no desde la ficha.

## 5. Radar

- El panel lateral propio del Radar reemplaza al de Situación actual y nunca queda en blanco.
- **Horizonte:** un control segmentado con los horizontes que publica el motor (hoy 24 h, 72 h y 10 días). Reemplaza `selector-horizonte.tsx` dentro del panel.
- **Números:** escuelas con riesgo alto o muy alto, y alumnos en esas escuelas.
- **Lista "Escuelas en riesgo"**, ordenada por nivel de riesgo, con click para abrir la ficha.
- **Color del punto = nivel de riesgo** del horizonte elegido. La leyenda tiene una línea: "Riesgo de afectación · 72 h" y la escala.
- Se mantienen las capas propias del Radar (`components/mapas/radar-meteo/capas.ts`). Se eliminan la lluvia observada y todo texto de fuente o metodología de la leyenda y de los paneles (`radar-meteo/leyenda.tsx`, `resumen-panel.tsx`, `risk-explanation-panel.tsx`).

## 6. Planificación

- Un control segmentado elige la vista: **Escuelas aisladas · Inundación · Historial**. Cada vista colorea los puntos con una escala Alto / Medio / Bajo / Nulo:
  - **Escuelas aisladas:** el índice de aislamiento existente (dependen de un solo camino o de cruces de agua).
  - **Inundación:** la exposición a inundación existente, reducida a tres niveles.
  - **Historial:** cantidad de situaciones reportadas por escuela, para priorizar obras.
- El panel muestra una lista "Prioridad", ordenada de mayor a menor, con click para abrir la ficha.
- Se elimina el contexto territorial con "fuente vencida" y todo texto de fuente o metodología (`peligro-legend.tsx` y los textos de `capas-accesos.tsx`).

## 7. Estadísticas (reemplaza "Evolución")

Ocupa todo el ancho, sin mapa, y respeta los filtros compartidos.

1. **Números:** escuelas afectadas, sin clases, alumnos sin clases, sin actualizar y "sin clases con apoyo pedagógico" (X / Y).
2. **Tabla con "Agrupar por"** (segmentado): departamento, nivel, gravedad o categoría. Columnas: escuelas, afectadas, % (con barra chica) y alumnos sin clases. Se ordena por afectadas. No hay agrupación por escuela: eso lo cubre la ficha.
3. **Evolución en el tiempo:** los gráficos de `evolucion-panel.tsx` (servicio caído, departamentos, motivos, alumnos acumulados), ahora filtrados por la barra compartida.

Los totales se calculan con la misma función que alimenta los números de Situación actual, para que siempre coincidan.

## 8. Leyenda

- Flotante abajo a la izquierda, con una línea por concepto y sin párrafos.
- Situación actual: colores de gravedad y "Sin reporte" en una línea; íconos (sin clases, evacuado, centro de evacuados, sin actualizar) en otra.
- Radar y Planificación: título de una línea y la escala.
- Se eliminan las atribuciones del mapa base del área visible. La atribución que exija la licencia del proveedor de teselas se mantiene en el control de atribución compacto de MapLibre (colapsado, ícono "i"), no como texto suelto.

## 9. Ruta de acceso (geo-static)

### 9.1 Criterio de camino

- El costo de cada tramo pasa de `length` a `length × factor(tipo de vía)`. Factores iniciales, ajustables en un único lugar:

  | Tipo OSM (`highway`) | Factor |
  |---|---|
  | motorway, trunk, primary | 1.0 |
  | secondary | 1.2 |
  | tertiary | 1.5 |
  | unclassified, residential | 2.0 |
  | track, service | 3.0 |

- Un `surface` no pavimentado (tierra, ripio) multiplica por 1.5 más, salvo que el tipo ya sea `track`.
- La distancia mostrada en la ficha sigue siendo la longitud real en km, no el costo.

### 9.2 Destino

- El destino deja de ser la cabecera departamental. Pasa a ser la **localidad urbana más cercana por red** (INDEC: 2.000 habitantes o más), sea o no cabecera.
- **Dependencia de datos a verificar primero:** Georef da las localidades con coordenadas, pero no se verificó que incluya población. Hace falta una fuente oficial de población por localidad (resultados del censo del INDEC por localidad) versionada en `services/geo-static/data/`. Si no existe una fuente confiable, se vuelve a decidir con el dueño de producto antes de implementar.
- La búsqueda multi-destino actual (grafo invertido desde la cabecera) pasa a ser multi-origen desde todas las localidades urbanas, para mantener un único Dijkstra por corrida.
- Se regeneran las geometrías y los índices de aislamiento. Las cifras de aislamiento van a cambiar; eso es esperado.

## 10. Qué se elimina

- El conmutador flotante `ModoMapa` y su CSS.
- Los siete filtros de texto libre.
- Las capas "Evacuación" y "Sin reportar".
- Todos los textos de fuente, atribución suelta, extracto, corrida, resolución y metodología en paneles, fichas y leyendas.
- La lluvia observada.
- El contexto territorial con estado de fuente ("vencida").

Antes de borrar un componente se verifica que nada más lo use. Si algo lo usa, se reporta y no se borra.

## 11. Copy

- Se habla en "usted", igual que el flujo del parte.
- Se nombran las cosas como las conoce el usuario: "Sin clases", "Sin actualizar", "Escuelas aisladas", "Riesgo de corte".
- Sin siglas técnicas (ODbL, arcsec, WRI, job) en la interfaz.

## 12. Pruebas

- **Unidad:**
  - la regla "sin actualizar" (abierta + 72 h; las solucionadas no cuentan; las que nunca reportaron no cuentan);
  - el filtrado compartido (combinaciones de chips y búsqueda);
  - la agregación de Estadísticas (que coincida con los números de Situación actual);
  - el mapeo de hashes viejos.
- **Componentes:**
  - cambio de pestaña sin desmontar el mapa;
  - el panel nunca vacío al pasar a Radar con una ficha abierta (regresión del bug 8);
  - los chips (abrir, elegir, quitar, limpiar);
  - las secciones desplegables de la ficha.
- **geo-static (pytest):**
  - el costo por tipo de vía elige la ruta pavimentada sobre una huella más corta en un grafo de juguete;
  - el destino es la localidad urbana más cercana y no la cabecera.
- Cada batch cierra con `pnpm test && pnpm lint && pnpm build` en verde (y `pytest` para geo-static).

## 13. Fases sugeridas

| Fase | Entrega | Depende de |
|---|---|---|
| 1 | Una fila de pestañas, panel por pestaña (bug 8), Evolución → Estadísticas | — |
| 2 | Filtros compartidos en chips | 1 |
| 3 | Situación actual: punto, "Sin actualizar", panel, ficha, bloque de acceso | 1, 2, batch 2 del parte |
| 4 | Radar y Planificación limpios, leyendas, eliminación de textos técnicos | 1 |
| 5 | Estadísticas: números, "Agrupar por", evolución filtrada | 2 |
| 6 | Ruta de acceso: costo por tipo de vía y destino a localidad urbana | verificación de datos §9.2 |

Las fases 4 y 6 no comparten archivos con 2, 3 y 5 y pueden ir en paralelo.
