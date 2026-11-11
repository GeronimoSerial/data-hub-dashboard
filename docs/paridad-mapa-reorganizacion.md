# Matriz de paridad: mapa de reorganización escolar

Referencia: mockup V29 (corte 2026-10-28) y [plan](plan-mapa-reorganizacion.md). Tarea T20 del feature `odd/tasks/mapa-reorganizacion.md`, S13.

## Convenciones

- **Mockup**: `L N` es la línea N del bloque de lógica del mockup (extracto con numeración propia, no está en el repositorio). Se cita junto con el nombre de la función cuando existe (`render`, `popup`, `resumenEconomicoZona`, `rutaCalcular`, `cargarDepartamentos`).
- **Implementación**: rutas desde la raíz del repositorio. Sin ruta explícita, el módulo está en `lib/reorganizacion/`.
- **Prueba**: solo títulos reales de `describe`/`it` de los archivos de prueba. Cuando el título no está escrito en la matriz, aparece el nombre del archivo abreviado.
- **Estado**:
  - *Cubierto con prueba*: al menos una prueba unitaria o de componente cubre el comportamiento.
  - *Cubierto sin prueba automática (verificar en navegador)*: el código existe, pero ninguna prueba lo comprueba.
  - *Pendiente*: falta decisión, dato o implementación.
  - *Fuera de alcance*: no se traslada por decisión del plan.

## 1. Universo e indicadores

| ID | Comportamiento | Mockup | Implementación | Prueba | Estado |
| --- | --- | --- | --- | --- | --- |
| U1 | 265 establecimientos CUE-Anexo únicos, todos con coordenadas, como universo | L89 (`selectedCueSet`), L141-143 (marcadores) | `lib/reorganizacion/capas.ts` `construirUniverso` (l. 149); `lib/reorganizacion/data/v29.json` | `capas.test.ts`: incluye todas las escuelas del corte V29 con o sin filtro activo; `capas-reorganizacion.test.tsx`: el universo tiene siempre los 265 establecimientos, con o sin filtro; `v29-datos.test.ts`: conserva los totales del corte | Cubierto con prueba |
| U2 | 1.376 alumnos, 262 importes positivos, POF vacía (0 registros) | L139 calcula sumas en vivo | `lib/reorganizacion/importar-v29.ts` `normalizarV29` (l. 56); `lib/reorganizacion/data/v29.informe.json` | `v29-datos.test.ts`: conserva los totales del corte; conserva importes, POF vacía y la ausencia de importe como null | Cubierto con prueba |
| U3 | La pertenencia al universo la fija el corte; POF y liquidaciones no la definen | L135 (`data.filter`, la lista es el universo) | Corte fijo en `v29.json`; el código no re-deriva pertenencia | Ninguna prueba comprueba la regla; solo el conteo (U1, U2) | Cubierto sin prueba automática (verificar en navegador) |
| U4 | Indicadores del listado filtrado: establecimientos, alumnos, ubicados, con POF | L139 (`#total`, `#students`, `#located`, `#pofcount`) | `lib/reorganizacion/filtros.ts` `calcularIndicadores` (l. 165); `components/mapas/reorganizacion/panel-reorganizacion.tsx` | `filtros.test.ts`: suma establecimientos, alumnos, ubicados y con POF; sin POF registrada cuenta cero y no rompe el cálculo; `panel-reorganizacion.test.tsx`: muestra los cuatro indicadores del listado filtrado | Cubierto con prueba |

## 2. Filtros

| ID | Comportamiento | Mockup | Implementación | Prueba | Estado |
| --- | --- | --- | --- | --- | --- |
| F1 | Departamento | L135 (`dept`), L104 (lista) | `filtros.ts` `filtrarEscuelas` (l. 133), `opcionesFiltro` (l. 175) | `filtros.test.ts`: filtra por departamento; lista departamentos presentes en orden alfabético | Cubierto con prueba |
| F2 | Zona histórica "Zona N" | L135 (`zone`), L125 | `filtros.ts` `coincideZona` (l. 109); `opcionesFiltro` | `filtros.test.ts`: filtra por zona histórica; lista zonas por número y agrega aislados y sin ubicación | Cubierto con prueba |
| F3 | Búsqueda por CUE-Anexo, nombre o localidad, sin mayúsculas y recortando espacios | L135 (`q`) | `filtros.ts` `coincideBusqueda` (l. 103), `normalizarTexto` (l. 88) | `filtros.test.ts`: busca por CUE-Anexo; busca por nombre sin distinguir mayúsculas y recorta espacios; busca por localidad; una búsqueda de solo espacios no es selección activa | Cubierto con prueba |
| F4 | Presencia de POF: "si" o "no" | L135 (`pof`) | `filtros.ts` `coincidePof` (l. 115) | `filtros.test.ts`: filtra por POF: "si" son los que tienen agentes, "no" los que no | Cubierto con prueba |
| F5 | Tendencia zonal | L127 (`zoneStats`), L135 (`trend`) | `filtros.ts` `coincideTendencia` (l. 120); `zonas.ts` `tendenciaPorZona` (l. 152) | `filtros.test.ts`: filtra por tendencia; zona sin entrada o aislado es "sin comparación"; filtra por la tendencia que calcula tendenciaPorZona | Cubierto con prueba |
| F6 | Combinación de filtros y listado vacío | L135-L145 | `filtros.ts` `filtrarEscuelas` (l. 133) | `filtros.test.ts`: combina departamento y POF; combina búsqueda con tendencia; sin coincidencias devuelve listado y indicadores vacíos; `panel-reorganizacion.test.tsx`: muestra el estado vacío cuando no hay coincidencias | Cubierto con prueba |
| F7 | Opción "Sin ubicación" (zona `SIN_COORD`) | L126, L135 (`!d.zona`) | `filtros.ts` `ZONA_SIN_UBICACION` (l. 9), `coincideZona` (l. 111) | `filtros.test.ts`: filtra por establecimientos sin ubicación. Con el corte V29 la opción siempre devuelve 0 (ver Pendientes, P5) | Cubierto con prueba |
| F8 | Encuadre del mapa a las coincidencias al filtrar | L144 (`fitBounds` si hay dept, zone, q o pof) | No implementado. Solo hay encuadre provincial en `components/mapas/map-reorganizacion-page.tsx` (l. 170, 184, 199) | Ninguna | Pendiente (P7) |

## 3. Resaltado por clasificación salarial

| ID | Comportamiento | Mockup | Implementación | Prueba | Estado |
| --- | --- | --- | --- | --- | --- |
| R1 | El selector de clasificación resalta sin cambiar el listado filtrado | L136-L138 (`coincideTipo`, `destacados`), L145 | `filtros.ts` `resaltarPorClasificacion` (l. 154), `coincideClasificacion` (l. 126) | `filtros.test.ts`: la clasificación no cambia el conjunto filtrado; resalta las escuelas de la clasificación elegida; solo resalta dentro del listado filtrado. `contenedor-reorganizacion.test.tsx`: cambiar la clasificación cambia los resaltados pero no el listado filtrado. `panel-reorganizacion.test.tsx`: cambia la clasificación resaltada desde el selector | Cubierto con prueba |
| R2 | Clasificación faltante como opción "Sin dato de clasificación" | L134 (`SIN_DATO`) | `filtros.ts` `SIN_DATO_CLASIFICACION` (l. 10), `opcionesFiltro` (l. 182-188) | `filtros.test.ts`: resalta la clasificación faltante con la opción sin dato; una escuela sin clasificación coincide solo con la opción sin dato; lista clasificaciones presentes y siempre la opción sin dato al final | Cubierto con prueba |
| R3 | Contador de resaltados sobre los visibles | L138 (`zoneHighlightCount`) | `components/mapas/reorganizacion/panel-reorganizacion.tsx` | `panel-reorganizacion.test.tsx`: informa cuántas filas quedan resaltadas cuando hay clasificación activa; no muestra contador de resaltado sin clasificación | Cubierto con prueba |
| R4 | El resaltado no quita escuelas del universo; el resto queda atenuado | L142-L143 (anillo; opacidad 0,37 si hay selección activa) | `capas.ts` `construirUniverso`, `EstadoPintura` (l. 111), `paintUniverso` (l. 263) | `capas.test.ts`: atenúa con coincide false en vez de quitar escuelas; `capas-reorganizacion.test.tsx`: marca como resaltadas las escuelas de la clasificación salarial sin quitarlas del universo. Con clasificación activa, `hayFiltroActivo` (`filtros.ts` l. 92) la cuenta como selección, como en el mockup L137 | Cubierto con prueba |

## 4. Contexto del mapa (atenuado y capas)

| ID | Comportamiento | Mockup | Implementación | Prueba | Estado |
| --- | --- | --- | --- | --- | --- |
| C1 | Los filtros reducen listado e indicadores; las capas reciben el universo completo | L135-L143 | `components/mapas/reorganizacion/contenedor-reorganizacion.tsx` (`resultado`, `resaltados`) | `contenedor-reorganizacion.test.tsx`: filtrar reduce el listado y los indicadores, pero las capas reciben el universo completo | Cubierto con prueba |
| C2 | Capas independientes de otras primarias y secundarias | L86 (control de capas), L101-L102 | `capas.ts` `construirReferencias` (l. 175), `paintReferencias` (l. 276); `contenedor-reorganizacion.tsx` `VISIBLES_INICIALES` (l. 40) | `capas-reorganizacion.test.tsx`: dibuja las capas de abajo hacia arriba: zonas, primarias, secundarias y universo; omite las capas ocultas y mantiene siempre el universo; `contenedor-reorganizacion.test.tsx`: alternar una capa cambia visibles y las capas interactivas | Cubierto con prueba |
| C3 | Otras primarias excluyen las escuelas del universo | L101 (`!selectedCueSet.has`) | `capas.ts` `construirReferencias` (l. 175) | `capas.test.ts`: excluye las CUE del universo para no duplicar puntos; `capas-reorganizacion.test.tsx`: las referencias excluyen las escuelas del universo | Cubierto con prueba |
| C4 | Prioridad de clic: universo, secundarias, primarias, zonas | L2-L21 (orden de `pane`: zonas 390, escuelas 640, referencias 650) | `lib/reorganizacion/clics.ts` `resolverClic` (l. 46), `CAPAS_INTERACTIVAS` (l. 33), `idsInteractivos` (l. 67) | `clics.test.ts`: prefiere la escuela del universo a la zona que está debajo; prefiere una referencia a la zona; una escuela del universo gana a una referencia; una secundaria gana a una primaria con el mismo establecimiento; va de mayor a menor prioridad: universo, secundarias, primarias y zonas | Cubierto con prueba |
| C5 | Clic en escuela abre su ficha; clic sin entidad cierra la selección | L143 (`popup`), L146 | `contenedor-reorganizacion.tsx` | `contenedor-reorganizacion.test.tsx`: clic en una escuela abre su ficha y el cierre la quita; clic sin entidad cierra la selección | Cubierto con prueba |
| C6 | Clic en zona muestra la ficha con la zona completa aunque el listado esté filtrado | L141 (`bindPopup` de zona) | `contenedor-reorganizacion.tsx`; `ficha-zona.tsx` | `contenedor-reorganizacion.test.tsx`: clic en zona muestra la ficha con la zona completa aunque el listado esté filtrado | Cubierto con prueba |

## 5. Zonas

| ID | Comportamiento | Mockup | Implementación | Prueba | Estado |
| --- | --- | --- | --- | --- | --- |
| Z1 | Zona de 20 km de diámetro (radio 10 km) sobre el centro | L141 (`radius:10000`), L127 (`center`) | `lib/reorganizacion/zonas.ts` `RADIO_ZONA_KM` (l. 4); `capas.ts` `construirZonas` (l. 200), que dibuja un polígono GeoJSON de 64 vértices | `capas.test.ts`: dibuja un círculo cerrado de 64 vértices de 10 km de radio por centro; `zonas.test.ts`: busca el centro por etiqueta y el radio es de 10 km; `capas-reorganizacion.test.tsx`: usa la zona completa de 20 km, no el listado filtrado | Cubierto con prueba |
| Z2 | Totales de zona sobre la zona completa, no sobre el listado filtrado | L107 (`data.filter(d => d.zona === name)`) | `zonas.ts` `listarZonas` (l. 131), `estadisticasDeZona` (l. 102) | `zonas.test.ts`: los totales de zona no cambian con el listado filtrado | Cubierto con prueba |
| Z3 | Zonas de los centros sin miembros (38 y 58) se listan | L127 (`if(!members.length) continue`) | `zonas.ts` `listarZonas` (l. 131) incluye todas las zonas de los centros | `zonas.test.ts`: lista zonas sin miembros desde los centros con cero establecimientos; `v29-datos.test.ts`: conserva 64 centros únicos, 62 zonas ocupadas y 89 aislados. Ver Hallazgos H2 | Cubierto con prueba |
| Z4 | Aislados fuera de zonas, con filtro propio y conteo | L125 (excluye `Aislado`), L126 (opción "Aislados") | `zonas.ts` `ZONA_AISLADO` (l. 7), `contarAislados` (l. 72), `miembrosPorZona` (l. 75); `filtros.ts` `ZONA_AISLADOS` | `zonas.test.ts`: agrupa por etiqueta y excluye aislados y sin ubicación; cuenta los aislados sin contar otras zonas; `filtros.test.ts`: filtra por aislados | Cubierto con prueba |
| Z5 | Tendencia 2023 vs 2026 solo con establecimientos que tienen ambos años | L127 (`paired`; solo comprueba 2023) | `zonas.ts` `estadisticasDeZona` (l. 102-106), `tendenciaDe` (l. 91) | `zonas.test.ts`: compara solo establecimientos con 2023 y 2026 y suma la matrícula total; no trata la historia 2026 faltante como cero | Cubierto con prueba |
| Z6 | Zona sin comparables: "Sin comparación" sin cifras de historia | L128 (`trendLabel.sin`) | `zonas.ts` `ETIQUETA_TENDENCIA` (l. 13) | `zonas.test.ts`: zona sin comparables queda como sin comparación y sin cifras de historia; `ficha-zona.test.tsx`: muestra "Sin comparación" cuando ningún miembro tiene historia 2023 y 2026 | Cubierto con prueba |
| Z7 | Colores y textos de tendencia: Disminuyó, Aumentó, Sin cambio, Sin comparación | L128-L129 | `zonas.ts` `COLOR_TENDENCIA` (l. 20); `components/mapas/reorganizacion/leyenda-reorganizacion.tsx` | `leyenda-reorganizacion.test.tsx`: muestra cada capa con su texto y los colores de tendencia; `ficha-zona.test.tsx`: muestra la tendencia comparable con texto y cantidad de escuelas comparables | Cubierto con prueba |

## 6. Fichas

| ID | Comportamiento | Mockup | Implementación | Prueba | Estado |
| --- | --- | --- | --- | --- | --- |
| FE1 | Ficha escolar: CUE-Anexo, nombre, departamento, localidad, zona, matrícula | L130 (`popup`) | `components/mapas/reorganizacion/ficha-escuela.tsx` | `ficha-escuela.test.tsx`: muestra identificación, ubicación y matrícula del establecimiento | Cubierto con prueba |
| FE2 | Evolución 2023 a 2026; año faltante como "Sin dato", no cero | L130 (`hist`, `h[y] ?? 'Sin dato'`) | `ficha-escuela.tsx` | `ficha-escuela.test.tsx`: muestra la evolución 2023 a 2026 y marca el año faltante como sin dato, no como cero | Cubierto con prueba |
| FE3 | Oferta educativa: matrícula, turnos, modalidades, orientaciones | L90-L97 (`resumenOferta`) | `ficha-escuela.tsx`; agregados en `v29.json` (`ofertaPorCue`) | `ficha-escuela.test.tsx`: muestra la oferta educativa con matrícula, turnos, modalidades y orientaciones; informa la ausencia de oferta cuando la fuente no tiene agregados | Cubierto con prueba |
| FE4 | POF: agentes y desglose por situación de revista; sin registros se informa sin afirmar ausencia de personal | L130 (`pof`) | `ficha-escuela.tsx` | `ficha-escuela.test.tsx`: informa que la fuente no registra POF sin afirmar ausencia de personal; muestra agentes y desglose por situación de revista cuando hay registros POF | Cubierto con prueba |
| FE5 | Liquidaciones: importe mensual, personal informado, clasificación de zona, período | L130 (sueldos, personal, clasificación; "septiembre 2026") | `ficha-escuela.tsx` (`PERIODO_LIQUIDACIONES`, l. 24) | `ficha-escuela.test.tsx`: muestra el importe mensual, el personal y la clasificación de zona de liquidaciones; indica sin importe informado cuando no hay costo salarial | Cubierto con prueba |
| FE6 | Ficha de referencia: nombre, CUE-Anexo, ubicación, niveles, oferta, matrícula primaria | L98 (`referenciaPopup`), L92 | `components/mapas/reorganizacion/ficha-referencia.tsx` | `ficha-referencia.test.tsx`: muestra nombre, CUE-Anexo, ubicación y la aclaración de referencia; formatea la matrícula primaria y muestra "Sin dato" cuando la fuente no la informa; lista los dos niveles cuando el establecimiento ofrece Primaria y Secundaria; lista solo Secundaria cuando la bandera de primaria es falsa; muestra la oferta agregada de cada nivel; indica la falta de oferta cuando la fuente no tiene agregados | Cubierto con prueba |
| FZ1 | Ficha de zona: nombre, círculo de 20 km, miembros, matrícula total, tendencia comparable | L141 (`bindPopup` de zona) | `components/mapas/reorganizacion/ficha-zona.tsx` | `ficha-zona.test.tsx`: muestra el nombre, el círculo de 20 km, los miembros y la matrícula total; muestra la tendencia comparable con texto y cantidad de escuelas comparables | Cubierto con prueba |
| FZ2 | Desde la ficha de zona se abre un miembro | L141 (lista de miembros en la ficha) | `ficha-zona.tsx` | `ficha-zona.test.tsx`: llama onSeleccionarEscuela con el CUE del establecimiento elegido | Cubierto con prueba |

## 7. Economía (fórmula del plan y resumen de zona)

| ID | Comportamiento | Mockup | Implementación | Prueba | Estado |
| --- | --- | --- | --- | --- | --- |
| EC1 | Costo informado = suma de importes salariales positivos | L110 (`costo`), L109 (`sin costo`) | `lib/reorganizacion/economia.ts` `resumenEconomico` (l. 47), `esImportePositivo` (l. 38), suma (l. 53) | `economia.test.ts`: calcula el potencial bruto restando la referencia retenida; no extrapola ni cuenta como cero un importe faltante | Cubierto con prueba |
| EC2 | Referencia retenida = mayor importe; ante empate, el primero en orden de zona | L113 (`retenida`) | `economia.ts` l. 57-60 | `economia.test.ts`: usa el primer establecimiento en orden de zona ante un empate de importe | Cubierto con prueba |
| EC3 | Potencial bruto mensual = costo informado - importe de la referencia retenida | L114 (con `Math.max(0, …)`) | `economia.ts` l. 67 (sin `Math.max`; el resultado nunca es negativo porque el costo incluye el máximo) | `economia.test.ts`: calcula el potencial bruto restando la referencia retenida | Cubierto con prueba |
| EC4 | Potencial anual = mensual x 12 | L121 | `economia.ts` l. 93 | `economia.test.ts`: expresa el anual como doce veces el mensual | Cubierto con prueba |
| EC5 | Calculable solo con al menos 2 establecimientos y 2 importes positivos | L114 (`miembros.length>=2 && conCosto.length>=2`) | `economia.ts` l. 62-66 (`motivo`) | `economia.test.ts`: no es calculable con un solo establecimiento; no es calculable con dos establecimientos y un solo importe; `ficha-zona.test.tsx`: indica "No calculable" con el motivo cuando hay un solo establecimiento; indica "No calculable" cuando falta un segundo importe positivo | Cubierto con prueba |
| EC6 | Cobertura parcial: la cifra usa solo importes disponibles y lo indica | L123 (`sinCosto`) | `economia.ts` l. 68, 74-78 | `economia.test.ts`: marca cobertura parcial y advierte que la cifra solo usa importes disponibles; `ficha-zona.test.tsx`: avisa la cobertura parcial y no extrapola los importes faltantes | Cubierto con prueba |
| EC7 | Escuelas con importe sobre el total y costo informado de la zona | L118 | `ficha-zona.tsx` con `economia.ts` (`escuelasConImporte`, `totalEscuelas`) | `ficha-zona.test.tsx`: muestra el resumen económico bajo un supuesto con la referencia retenida | Cubierto con prueba |
| EC8 | Personal informado de la zona | L112 (suma solo de escuelas con costo) | `economia.ts` l. 54 (suma de todos los miembros). Sin efecto en el corte V29: las 265 escuelas sin importe positivo tienen 0 personal | `economia.test.ts`: suma el personal ignorando los nulos | Cubierto con prueba |
| EC9 | Referencia retenida y supuesto visibles | L122 (texto del supuesto) | `economia.ts` l. 89-96 (`referenciaRetenida`, `supuesto`) | `ficha-zona.test.tsx`: muestra el resumen económico bajo un supuesto con la referencia retenida | Cubierto con prueba |
| EC10 | Advertencias: no descuenta cargos, transporte ni adecuaciones; no extrapola; no es ahorro confirmado | L123 | `economia.ts` l. 70-78 | `economia.test.ts`: incluye siempre las advertencias metodológicas; `ficha-zona.test.tsx`: renderiza todas las advertencias metodológicas; no presenta el potencial como ahorro ni como cierre recomendado; `metodologia-reorganizacion.test.tsx`: informa los límites de la economía y que no es ahorro | Cubierto con prueba |
| EC11 | Formato de pesos: es-AR, hasta dos decimales | L105 (`pesos`, `maximumFractionDigits:2`) | `economia.ts` `formatearARS` (l. 34) | `economia.test.ts`: formatea pesos argentinos con separador de miles y coma decimal; muestra hasta dos decimales como el mockup | Cubierto con prueba |
| EC12 | Resumen vacío sin establecimientos | Implícito (la zona no se dibuja si `n` es 0, L141) | `economia.ts` `resumenEconomico` | `economia.test.ts`: devuelve resumen vacío sin establecimientos; `ficha-zona.test.tsx`: muestra el estado vacío sin cifras cuando la zona no tiene miembros | Cubierto con prueba |

## 8. Recorridos

| ID | Comportamiento | Mockup | Implementación | Prueba | Estado |
| --- | --- | --- | --- | --- | --- |
| RT1 | Activar y desactivar la medición; limpiar la ruta | L52 (`routeStart`), L53 (`routeClear`) | `components/mapas/reorganizacion/use-recorrido.ts` `useRecorrido` (l. 133); `panel-recorrido.tsx` | `panel-recorrido.test.tsx`: inactivo ofrece activar la medición y no muestra controles de medición; activo muestra terminar, limpiar y la instrucción de origen; `use-recorrido.test.ts`: desactivar cancela la consulta y vuelve a inactivo; limpiar borra la ruta y mantiene la medición activa | Cubierto con prueba |
| RT2 | Origen y destino desde las escuelas del mapa (universo, otras primarias, secundarias) | L26-L34 (`rutaSeleccionar`), L101-L102 (clic en referencias) | `contenedor-reorganizacion.tsx`; `use-recorrido.ts` | `contenedor-reorganizacion.test.tsx`: en medición de origen un clic en escuela elige el punto y no abre la ficha; `use-recorrido.test.ts`: ignora selecciones mientras la medición está inactiva; elegir un punto desde un resultado inicia otra medición. El clic en referencias sin ficha no tiene prueba propia | Cubierto con prueba |
| RT3 | Origen y destino desde las fichas | L145 (lista) | `ficha-escuela.tsx` (`onOrigen`, `onDestino`); `ficha-referencia.tsx` | `ficha-escuela.test.tsx`: llama a onOrigen y onDestino con el CUE cuando el recorrido está activo; `ficha-referencia.test.tsx`: muestra los botones de medición y los conecta con el CUE cuando el recorrido está activo | Cubierto con prueba |
| RT4 | Origen y destino desde el listado | L145 (clic en fila de la lista llama `rutaSeleccionar`) | `abrirEstablecimiento` en `components/mapas/reorganizacion/contenedor-reorganizacion.tsx`: con la medición activa, el clic en una fila del listado elige el punto | `contenedor-reorganizacion.test.tsx`: 'en medición de origen un clic en escuela elige el punto y no abre la ficha' (clic en mapa; el clic en fila no tiene prueba propia) | Cubierto sin prueba automática del clic en fila |
| RT5 | Consulta vía API protegida con validación, timeout y cancelación | L39 (URL fija del servicio público), L37 | `app/api/mapas/reorganizacion/ruta/route.ts` (`GET`, l. 39; `TIMEOUT_OSRM_MS`, l. 17); `lib/reorganizacion/ruta-osrm.ts` `parseCoordenadas` (l. 27), `construirUrlOsrm` (l. 41) | `app/api/mapas/reorganizacion/ruta/route.test.ts`: rechaza sin sesión y no consulta al proveedor; rechaza a un usuario sin audiencia sobre el recurso; valida parámetros antes de consultar al proveedor; timeout del proveedor responde 504; pasa la cancelación del cliente al proveedor y responde 499 | Cubierto con prueba |
| RT6 | Trazado vial, distancia y tiempo teórico | L45-L49 (`fitBounds`, texto de resultado) | `ruta-osrm.ts` `normalizarRespuestaOsrm` (l. 49); `lib/reorganizacion/capas.ts` `construirRecorrido` (l. 239); `panel-recorrido.tsx` | `ruta-osrm.test.ts`: convierte distancia y duración a km (1 decimal) y minutos enteros; `ruta/route.test.ts`: devuelve distancia, duración y geometría de OSRM; `panel-recorrido.test.tsx`: muestra origen, destino, distancia con un decimal y tiempo en horas y minutos; `capas-reorganizacion.test.tsx`: dibuja el recorrido con trazado y puntos, sin línea cuando no hay geometría. Ver Diferencias y añadidos | Cubierto con prueba |
| RT7 | Sin ruta vial: no se reemplaza por distancia lineal | L44 (`No se encontró un camino conectado`), L50 (`No se reemplaza por distancia lineal`) | `ruta/route.ts` (404); `use-recorrido.ts` (`sin_ruta_vial`); `capas.ts` `construirRecorrido` | `ruta/route.test.ts`: OSRM sin ruta vial responde 404 y nunca una distancia en línea recta; `use-recorrido.test.ts`: sin_ruta_vial muestra el mensaje y no deja distancia; `capas.test.ts`: sin geometría dibuja solo origen y destino, nunca una línea recta | Cubierto con prueba |
| RT8 | Errores del proveedor: HTTP, red y tiempo agotado, con mensaje | L42 (`Servicio vial HTTP`), L50 | `ruta/route.ts` (502, 504); `use-recorrido.ts` (`MENSAJES`, l. 44) | `ruta/route.test.ts`: error 500 del proveedor responde 502; red caída responde 502; `use-recorrido.test.ts`: 504 informa el tiempo agotado; una falla de red informa el error sin distancia | Cubierto con prueba |
| RT9 | Cancelación de consultas obsoletas y descarte de respuestas tardías | L23 (`rutaReq`), L36, L43 | `use-recorrido.ts` | `use-recorrido.test.ts`: una segunda medición cancela la consulta anterior y descarta su respuesta; al desmontar aborta la consulta en curso sin cambiar estado | Cubierto con prueba |
| RT10 | Estado de carga durante el cálculo | L37 (texto "Consultando recorrido vial") | `panel-recorrido.tsx` | `panel-recorrido.test.tsx`: durante la carga indica el cálculo y no muestra distancia | Cubierto con prueba |
| RT11 | Advertencia: el tiempo no contempla el estado del camino ni el clima | L49 | `panel-recorrido.tsx` | `panel-recorrido.test.tsx`: la advertencia sobre el tiempo teórico siempre está visible | Cubierto con prueba |
| RT12 | Anuncio de estado a lectores de pantalla | L25, L32, L37, L49 (`routeStatus`) | `panel-recorrido.tsx` | `panel-recorrido.test.tsx`: anuncia el estado en una región aria-live | Cubierto con prueba |
| RT13 | Proveedor vial de producción configurable por entorno | L39 (fijo al servicio público) | `ruta/route.ts` l. 16 (`BASE_OSRM_POR_DEFECTO`, demo público), l. 32 (`REORGANIZACION_OSRM_URL`) | `ruta/route.test.ts`: usa el proveedor público si no hay URL configurada | Pendiente (P2) |

## 9. Cartografía y fondos

| ID | Comportamiento | Mockup | Implementación | Prueba | Estado |
| --- | --- | --- | --- | --- | --- |
| M1 | Fondo vial/topográfico Esri como fondo inicial | L11-L15 (`capaVial.addTo`) | No integrado. Fondo inicial: `voyager` (`lib/reorganizacion/fondos.ts`, l. 19), mismo que natalidad | `fondos.test.ts`: es un fondo disponible y es el de natalidad. Sustitución de proveedor no probada como paridad | Pendiente (P1) |
| M2 | Calles (Esri) como alternativa | L2-L4 | Sustituido por `osm` (`fondos.ts` l. 27), no es el mismo proveedor | Ninguna como paridad | Pendiente (P1) |
| M3 | Satélite (Sentinel-2 / EOX) | L7-L9 | No integrado. `FONDOS_PENDIENTES` (`fondos.ts` l. 37) | `fondos.test.ts`: declara topográfico y satelital con motivo; `selector-fondo.test.tsx`: no renderiza fondos pendientes como opciones | Pendiente (P1) |
| M4 | Selector de fondo entre las alternativas disponibles | L16 (control de capas base) | `components/mapas/reorganizacion/selector-fondo.tsx`; `fondos.ts` `FONDOS_REORGANIZACION` (l. 27) | `selector-fondo.test.tsx`: expone un grupo con nombre "Mapa de fondo" y una opción por fondo disponible; llama a onCambio con el id elegido al hacer clic; es operable con teclado; `contenedor-reorganizacion.test.tsx`: cambiar el fondo cambia el estilo base del mapa | Cubierto con prueba |
| M5 | El cambio de fondo no altera capas ni escuelas | L14 (comentario del mockup) | `contenedor-reorganizacion.tsx`; `map-reorganizacion-page.tsx` | No hay prueba que compruebe que las capas sobreviven al cambio de estilo | Cubierto sin prueba automática (verificar en navegador) |
| M6 | Máscara exterior de Corrientes | No existe en el mockup (requisito del plan) | `map-reorganizacion-page.tsx` (`CAPA_MASCARA_ID`, l. 24; `MASCARA_URL` de `lib/mapas/departamentos.ts`, l. 51) | No hay prueba de la capa de máscara | Cubierto sin prueba automática (verificar en navegador) |
| M7 | Contornos departamentales y límites | L56-L83 (`cargarDepartamentos`, fuentes externas) | `map-reorganizacion-page.tsx` (`CAPA_DEPARTAMENTOS_BORDE_ID`, l. 25; fuente `DEPARTAMENTOS_URL`, `lib/mapas/departamentos.ts` l. 19). La fuente es la cartografía compartida, no la del mockup | No hay prueba de la capa | Cubierto sin prueba automática (verificar en navegador) |
| M8 | Nombres de departamentos | L76 (marcadores con el nombre) | `map-reorganizacion-page.tsx` (`CAPA_DEPARTAMENTOS_NOMBRES_ID`, l. 26; `etiquetasDepartamentos`, l. 87) | No hay prueba de la capa | Cubierto sin prueba automática (verificar en navegador) |
| M9 | Nombres ocultos con zoom menor a 8 | L61 (`updateDeptLabels`) | No encontrado en `map-reorganizacion-page.tsx` | Ninguna | Pendiente (P8) |
| M10 | Aviso si el proveedor de límites no responde | L80-L81 | No encontrado en `map-reorganizacion-page.tsx` | Ninguna | Pendiente (P8) |
| M11 | Control para volver al encuadre provincial | No existe en el mockup (requisito del plan) | `map-reorganizacion-page.tsx` (botón "Volver a Corrientes", l. 274-275; `volverAProvincia`) | `map-reorganizacion-page.test.tsx`: "Volver a Corrientes" vuelve a encuadrar la provincia | Cubierto con prueba |
| M12 | Pantalla completa | No existe en el mockup (requisito del plan) | `map-reorganizacion-page.tsx` (`FullscreenButton`, l. 324) | Ninguna | Cubierto sin prueba automática (verificar en navegador) |

## 10. Navegación, mapa y vistas

| ID | Comportamiento | Mockup | Implementación | Prueba | Estado |
| --- | --- | --- | --- | --- | --- |
| N1 | Encuadre inicial de Corrientes | L2 (`setView([-28.7,-58.7], 8)`) | `map-reorganizacion-page.tsx` (`initialViewState` con `LIMITES_CORRIENTES`, l. 229; `fitBounds`, l. 170) | `map-reorganizacion-page.test.tsx`: encuadra la provincia al cargar el estilo; suma el espacio del panel al padding del encuadre. Las pruebas usan un MapLibre simulado; el encuadre visual se verifica en navegador | Cubierto con prueba |
| N2 | Reencuadre al mostrarse por primera vez, sin reiniciar la cámara al volver | No existe en el mockup (requisito del plan) | `map-reorganizacion-page.tsx` (efecto de `visible`, l. 176-190; prop `visible`, l. 61) | `map-reorganizacion-page.test.tsx`: reencuadra la primera vez que se muestra y no al volver a mostrarse | Cubierto con prueba |
| N3 | "Acercar" a una escuela con zoom de acercamiento | L145 (`setView([...], 12)`) | `contenedor-reorganizacion.tsx` `flyTo` con `ZOOM_ACERCAR = 12` (l. 36, 132) | `contenedor-reorganizacion.test.tsx`: "Acercar" vuela al establecimiento con el zoom de acercamiento | Cubierto con prueba |
| N4 | Listado conectado al mapa: seleccionar una fila | L145 | `components/mapas/reorganizacion/panel-reorganizacion.tsx` | `panel-reorganizacion.test.tsx`: selecciona una escuela al pulsar su fila; marca como actual la fila de la escuela seleccionada | Cubierto con prueba |
| N5 | Título del listado con coincidencias resaltadas | L145 (`listtitle`) | `panel-reorganizacion.tsx` | `panel-reorganizacion.test.tsx`: muestra el contador de resultados | Cubierto con prueba |
| N6 | Panel plegable de filtros y listado | L147 (`toggle`) | `panel-reorganizacion.tsx`; `map-reorganizacion-page.tsx` | `panel-reorganizacion.test.tsx`: pliega el panel al pulsar "Ocultar panel"; despliega el panel al pulsar "Mostrar panel" cuando está plegado; `map-reorganizacion-page.test.tsx`: renderiza el panel y lo pliega con el botón de su control | Cubierto con prueba |
| N7 | Leyenda accesible con texto además de color | L88 (`legenda`) | `components/mapas/reorganizacion/leyenda-reorganizacion.tsx` | `leyenda-reorganizacion.test.tsx`: explica el anillo con texto y no solo con color; oculta y muestra su contenido con el botón; marca como ocultas las capas apagadas sin quitar su texto | Cubierto con prueba |
| N8 | Puntero de mano solo con el ratón sobre una capa interactiva | No existe en el mockup | `map-reorganizacion-page.tsx` (`cursor`, l. 235) | `map-reorganizacion-page.test.tsx`: usa puntero sólo con el mouse sobre una capa interactiva; sin capas interactivas no cambia el puntero ni registra el movimiento | Cubierto con prueba |
| N9 | Estados de carga, error, reintento y sin permiso | No existe en el mockup (requisito del plan) | `map-reorganizacion-page.tsx`; `use-dataset-reorganizacion.ts` | `map-reorganizacion-page.test.tsx`: muestra el estado de carga sin desmontar el mapa; muestra el error con un botón para reintentar; muestra el estado sin permiso sin botón de reintento; `use-dataset-reorganizacion.test.ts`: informa error con HTTP 500 y reintenta al llamar reintentar | Cubierto con prueba |
| N10 | Clic en escuela de la lista o del mapa sin coordenadas informa el caso | L145 (`alert` sin coordenadas) | `contenedor-reorganizacion.tsx` | No hay prueba específica del caso sin coordenadas | Cubierto sin prueba automática (verificar en navegador) |
| N11 | Navegación por teclado en panel, listado y fichas | Implícito en el mockup | Componentes de `components/mapas/reorganizacion/` | `selector-fondo.test.tsx`: es operable con teclado. Resto sin prueba | Cubierto sin prueba automática (verificar en navegador) |
| N12 | Diseño móvil sin desbordes ni superposiciones | No existe en el mockup (requisito del plan) | `map-reorganizacion-page.tsx` (`useEsEscritorio`, l. 103) | Ninguna | Cubierto sin prueba automática (verificar en navegador) |
| N13 | Tema claro y oscuro del hub | No existe en el mockup (requisito del plan) | `capas.ts` `paintUniverso` (con tema) | `capas-reorganizacion.test.tsx`: el tema oscuro cambia la pintura del universo. El resto de la interfaz no tiene prueba | Cubierto sin prueba automática (verificar en navegador) |
| N14 | Pestañas de la barra superior del mockup | Pestañas inertes (sin comportamiento) | No trasladadas | Ninguna | Fuera de alcance |

## 11. Metodología

| ID | Comportamiento | Mockup | Implementación | Prueba | Estado |
| --- | --- | --- | --- | --- | --- |
| MT1 | Fuentes, versión, fecha de corte, cifras leídas del dataset, faltantes y límites | No existe en el mockup (requisito del plan) | `components/mapas/reorganizacion/metodologia-reorganizacion.tsx` | `metodologia-reorganizacion.test.tsx`: abre el diálogo y muestra las cifras leídas del dataset; explica la POF vacía sin afirmar ausencia de personal; informa los límites de la economía y que no es ahorro; lista los centros sin establecimientos calculados desde el dataset; compara referencias con claves de oferta sin descartar la diferencia; se cierra con Escape | Cubierto con prueba |

## 12. Reglas operativas del plan

Las reglas se verifican con las filas indicadas; no tienen prueba propia.

| Regla | Filas | Estado |
| --- | --- | --- |
| Filtros reducen listado e indicadores; el mapa conserva el universo y atenúa el resto | C1, R4, F6 | Cubierto con prueba |
| La clasificación salarial solo modifica resaltados y su contador | R1, R3 | Cubierto con prueba |
| Círculos y resúmenes de zona usan la zona completa | Z1, Z2, C6, FZ1 | Cubierto con prueba |
| La tendencia usa solo establecimientos comparables; sin comparables, "Sin comparación" | Z5, Z6 | Cubierto con prueba |
| El universo es el corte V29; POF y liquidaciones no definen pertenencia | U3 | Cubierto sin prueba automática (verificar en navegador) |

## 13. Criterios de aceptación del plan

| Criterio | Filas | Estado |
| --- | --- | --- |
| 265 establecimientos, 1.376 alumnos, 262 importes positivos, POF vacía identificada | U1, U2 | Cubierto con prueba |
| 64 centros, 62 zonas ocupadas y 89 aislados coinciden con la referencia | Z3, Z4 | Cubierto con prueba |
| Historia faltante no es cero; tendencias con paneles comparables | Z5, FE2 | Cubierto con prueba |
| Filtros funcionan y el mapa conserva el contexto atenuado | F1-F7, C1 | Cubierto con prueba (el encuadre por filtro es F8, pendiente) |
| Clasificación salarial solo modifica resaltados | R1 | Cubierto con prueba |
| Escuela y zona conservan su información y advertencias | FE1-FE6, FZ1, EC10 | Cubierto con prueba |
| Resúmenes económicos sobre la zona completa, con fórmula, cobertura y condiciones | EC1-EC12 | Cubierto con prueba |
| Medición entre escuelas de las tres categorías; errores sin falso recorrido | RT2, RT3, RT7, RT8 y RT4 | Cubierto con prueba (clic en fila sin prueba propia) |
| Alternativas cartográficas, límites y nombres sin perder capas | M1-M8 | Pendiente (M1-M3, M9, M10); M4-M8 verificar en navegador |
| Primera apertura encuadra Corrientes; el retorno no reinicia la cámara | N1, N2 | Cubierto con prueba |
| Página y APIs respetan la audiencia; el dataset salarial no es archivo público | `datos/route.test.ts`: rechaza sin sesión y no expone datos de escuelas; rechaza a un usuario sin audiencia y no expone datos de escuelas; `ruta/route.test.ts`: rechaza a un usuario sin audiencia sobre el recurso; `page.test.tsx` (`app/(hub)/mapas/reorganizacion/`): redirige a /forbidden cuando el usuario no tiene audiencia; `lib/reorganizacion/sin-datos-publicos.test.ts`: ningún archivo de public/ referencia el dataset; `lib/hub-entry-server.test.ts`: denies reorganizacion to a user whose audience excludes the resource and admits an allowed user | Cubierto con prueba |
| Ningún control visible sin comportamiento; móvil y teclado | N11, N12, N14 | Cubierto sin prueba automática (verificar en navegador); pestañas inertes fuera de alcance |
| La matriz permite contrastar cada función con el HTML original | Este documento | Revisión manual |

## Pendientes

| ID | Punto | Evidencia | Estado |
| --- | --- | --- | --- |
| P1 | Satélite y topográfico: proveedor, licencia y atribución. Calles y vial/topográfico de Esri siguen sin decidirse (M1-M3) | `fondos.ts` `FONDOS_PENDIENTES` (l. 37) | Pendiente |
| P2 | Proveedor vial de producción: `REORGANIZACION_OSRM_URL` no está definida; el valor por defecto es el servicio público de demostración | `ruta/route.ts` l. 16, 32 | Pendiente |
| P3 | Procedencia de los centros adicionales 60 a 64 (el declarado son 59) | `components/mapas/reorganizacion/metodologia-reorganizacion.tsx` l. 14; `v29.json` `centros` | Pendiente |
| P4 | Estadísticas y exportación: propuestas, no existen en el mockup. Requieren contenido, formatos y permisos | Plan, "Mejoras adicionales y exclusiones" | Pendiente |
| P5 | Opción "Sin ubicación": implementada (F7) pero el corte tiene 265 de 265 escuelas geolocalizadas, así que siempre devuelve 0. Decidir si se conserva en la interfaz | `filtros.ts` l. 9, 111; `v29.informe.json` `conCoordenadas` | Pendiente |
| P7 | Encuadre a las coincidencias al filtrar (F8). El mockup lo hace (L144); el plan no lo menciona | Mockup L144 | Pendiente |
| P8 | Nombres de departamentos ocultos con zoom menor a 8, y aviso si el proveedor de límites no responde (M9, M10) | Mockup L61, L80-L81 | Pendiente |

## Fuera de alcance

- Pestañas inertes de la barra superior del mockup (N14).
- Radar meteorológico y situación operativa: pertenecen a otros dominios del hub.
- Decisiones automáticas de cierre, elección de receptores o certificación de ahorros.
- Actualización automática del universo o recálculo de zonas sin reglas aprobadas.
- Sustitución del mapa de matrícula o de su dataset.
- Información nominal de alumnos o agentes.

## Diferencias y añadidos frente al mockup

- Recorrido: distancia con 1 decimal (el mockup usa hasta 2) y tiempo en horas y minutos (el mockup muestra minutos totales). `ruta-osrm.test.ts` y `panel-recorrido.test.tsx` fijan el formato actual.
- El recorrido pasa por la API protegida; el mockup consulta el servicio público directamente desde el navegador.
- El listado muestra como máximo 200 filas y lo informa; el mockup muestra todas.
- "Acercar" anima el vuelo (`flyTo`); el mockup usa `setView` sin animación.
- El círculo de zona es un polígono GeoJSON de 64 vértices, no un círculo de Leaflet.
- Fondo inicial `voyager` (como natalidad) en lugar del vial Esri del mockup.
- Añadidos del plan: máscara, control de volver a Corrientes, pantalla completa, metodología, estados de carga y error, y puntero de mano.

## Hallazgos de la implementación

Verificados contra `lib/reorganizacion/data/v29.json`, `v29.informe.json` y el código.

- **H1. Matrícula primaria sin dato.** En 901 de las 1.166 referencias `matriculaPrimaria` es `null`. Es ausencia de dato, no cero. Evidencia: conteo sobre `v29.json`; `importar-v29.test.ts`: conserva null cuando una referencia no informa matrícula primaria; `ficha-referencia.test.tsx`: formatea la matrícula primaria y muestra "Sin dato" cuando la fuente no la informa.
- **H2. Zonas sin miembros: 38 y 58.** Los centros 38 y 58 no tienen establecimientos (`zonas.test.ts`: lista zonas sin miembros desde los centros con cero establecimientos). Inconsistencia de prueba: el fixture de `metodologia-reorganizacion.test.tsx` declara "38, 60", no "38, 58". La prueba pasa porque usa su propio fixture; conviene alinearlo con el dataset real.
- **H3. Referencias y oferta.** 4 referencias no tienen oferta y 5 claves de oferta no tienen referencia (`v29.informe.json`: `referenciasSinOferta` 4, `ofertaSinReferencia` 5). La diferencia entre 1.166 referencias y 1.167 claves se informa, no se descarta (`metodologia-reorganizacion.test.tsx`: compara referencias con claves de oferta sin descartar la diferencia).
- **H4. Tendencia solo con 2023 y 2026.** `zonas.ts` (l. 103-106) exige que ambos años sean numéricos. En el corte hay 224 escuelas con 2023 y todas tienen 2026, así que las 224 entran al panel comparable.
- **H5. Matiz sobre el NaN del mockup.** El mockup comprueba solo 2023 (L127) y después suma `+d.historia['2026']` sin comprobarlo. Si la clave no existe, la suma da NaN; si el valor es `null`, da 0, que es el error de tratar la falta como cero. En V29 todas las escuelas tienen 2026 (265 de 265), así que el NaN no se produce en este corte. El riesgo es de código, no de datos actuales, y la implementación lo evita con `esNumeroFinito` (`zonas.ts`).
- **H6. Formato de pesos.** `formatearARS` usa `maximumFractionDigits: 2` (`economia.ts` l. 30), igual que el mockup (L105). Lo fija `economia.test.ts`: muestra hasta dos decimales como el mockup.
- **H7. Personal informado.** El mockup suma el personal solo de escuelas con costo (L112); la implementación suma todos los miembros (`economia.ts` l. 54). En V29 no hay efecto: las escuelas sin importe positivo tienen 0 personal informado.

## Key Learnings

1. The V29 cut has 2026 history for all 265 schools, so the mockup's NaN path when 2026 is missing cannot occur with this data.
2. The mockup's zone summary sums staff only over schools with a positive salary amount, while the implementation sums every member; the difference has no effect on V29.
3. The metodologia test fixture declares empty centers 38 and 60, but the real dataset leaves centers 38 and 58 without members.
4. The reference school card test ensures a missing primary enrollment is shown as "Sin dato", never as zero.
5. The OSRM route endpoint reads REORGANIZACION_OSRM_URL with a public demo fallback, so production routing remains an open decision.
