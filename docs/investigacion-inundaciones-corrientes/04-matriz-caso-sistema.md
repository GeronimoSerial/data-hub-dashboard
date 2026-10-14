# Matriz caso – sistema – causa – mejora – validación

Ventana: desde el miércoles 7 de octubre de 2026 hasta el corte (2026-10-13 ~12:45 ART). Solo se usan **hechos públicos** de [eventos.csv](02-registro/eventos.csv); confianzas según la verificación de URL del 2026-10-13. Los partes escolares de la base productiva son datos de prueba y no forman parte de esta matriz.

## Qué tenía el sistema en cada caso

Reconstrucción a partir de un snapshot de `radar_meteo_run` y `smn_alerta` exportado en solo lectura el 2026-10-13, con [scripts/sistema-casos-publicos.mjs](scripts/sistema-casos-publicos.mjs) (salida en [sistema-casos-publicos.salida.txt](scripts/sistema-casos-publicos.salida.txt)).

Método y límites:

- Hora de referencia por caso: el inicio del hecho que respalda su propia evidencia (no el inicio del día genérico). Se indica en la tabla en hora argentina (ART = UTC−3).
- Lo que el sistema «tenía»: solo la corrida radar y los registros SMN con `fetched_at` **anterior** a la hora de referencia. Las corridas se capturan entre 27 y 77 minutos después de su `run_at`, por eso se usa `fetched_at` y no `run_at`.
- Celda: la más cercana a una **referencia aproximada de la localidad**, no al punto del incidente.
- Lluvia: suma de `precipitation` horaria de esa corrida entre la hora de referencia y el fin de la ventana del caso. Es pronóstico, no observación. Se informa también lo que daba la última corrida capturada dentro de la ventana (solo para ver cómo cambió el pronóstico; no era conocido al inicio).
- Los niveles de `resumen.ts` (atención ≥ 25 mm/24 h, importante ≥ 50 mm/24 h) se calculan sobre el área departamental con cobertura ≥ 80 %; aplicarlos a una celda es una aproximación.
- Alertas: registros SMN cuyo departamento coincide y cuya vigencia se superpone con la ventana. «Conocidas» = capturadas antes de la referencia; «vigentes» = además con `onset` ≤ referencia < `expires` y no canceladas. Cuentan registros, no alertas únicas (una alerta actualizada genera varios registros).
- Para caudal, alturas de río y score de riesgo **no hay nada que reconstruir**: las tablas tienen 0 filas.

| Caso | Hora de referencia (base) → fin de ventana | Corrida conocida (capturada) | Celda (km) | Lluvia pronosticada en ventana (última corrida en ventana) | Ráfaga máx. | Tormenta (WMO) | Alertas superpuestas / conocidas / vigentes y conocidas | Severidad conocida a la referencia |
|---|---|---|---|---|---|---|---|---|
| Curuzú Cuatiá, temporal | 7/10 20:00 ART (noche del 7/10 sin hora; supuesto) → 8/10 08:30 ART | 7/10 21:00Z (21:27Z) | 5,0 | 12,4 mm (15,5 mm) | 38,2 km/h | sí | 33 / 20 / 7 | solo Moderate |
| Curuzú Cuatiá, sensibilidad | 7/10 18:00 ART → 8/10 08:30 ART | 7/10 18:00Z (18:27Z) | 5,0 | 27,0 mm (15,5 mm) | 36,0 km/h | sí | 33 / 16 / 5 | solo Moderate |
| Capital, 17 mm | 8/10 00:00 ART (EVD-007) → 8/10 09:00 ART | 8/10 00:00Z (00:27Z) | 8,3 | 30,9 mm (30,7 mm) | 55,4 km/h | sí | 21 / 15 / 9 | Moderate y Severe |
| Monte Caseros, cruce cerrado | 7/10 08:00 ART (cierre según EVD-053, no localizada; cierre confirmado el 8/10 por EVD-033) → fin del 8/10 | 7/10 09:00Z (09:27Z) | 6,8 | 48,9 mm (0,0 mm) | 48,6 km/h | sí | 47 / 13 / 0 | Moderate y Severe (ninguna vigente a esa hora) |
| Goya, 20 mm | 12/10 00:00 ART → 12/10 20:00 ART (EVD-018) | 12/10 00:00Z (00:27Z) | 7,3 | 0,0 mm (9,2 mm) | 31,3 km/h | no | 0 / 0 / 0 | — |
| Paso de los Libres, 8,49 m y evacuación | 7/10 00:00 ART (primera publicación EVD-002, sin hora) → corte | 7/10 00:00Z (00:27Z) | 14,6 | 43,3 mm en el horizonte de la corrida (0,7 mm) | 52,2 km/h | sí | 43 / 6 / 0 | solo Moderate |
| Ituzaingó, evacuación Isla Apipé | 11/10 00:00 ART (EV-20261011-001/002) → corte | 11/10 00:00Z (00:27Z) | 8,9 | 4,5 mm (1,4 mm) | 35,6 km/h | no | 4 / 0 / 0 | — (primera alerta enviada 11/10 20:39 ART) |

Lectura:

- **Curuzú Cuatiá**: con la referencia en la noche del 7/10, el sistema tenía una corrida que pronosticaba 12,4 mm en la celda (27,0 mm si la tormenta empezó a las 18:00), frente a 88-90 mm informados por prensa sin estación. Las alertas conocidas a esa hora eran **solo Moderate**; los registros Severe que se superponen con la ventana se capturaron después de la referencia. La afirmación anterior («Moderate y Severe conocida antes del 8/10») se corrige.
- **Capital**: el sistema tenía 30,9 mm pronosticados entre 00:00 y 09:00 ART y alertas Moderate y Severe vigentes; el municipio informó 17 mm hasta las 9 sin anegamientos.
- **Monte Caseros**: al cierre del cruce (7/10 08:00 ART) el sistema tenía registros de tormenta Moderate y Severe ya capturados, pero ninguno vigente en ese instante; no tenía nada sobre el río. El cierre es un hecho hidrológico/operativo que el sistema no representa.
- **Goya**: la corrida conocida pronosticaba 0 mm hasta las 20:00 ART; la última corrida de la ventana subió a 9,2 mm; el municipio informó 20 mm.
- **Paso de los Libres**: al inicio del 7/10 el sistema tenía 6 registros de tormenta Moderate capturados y ninguno vigente, y ningún dato de altura. La lluvia pronosticada es de varios días y no explica la crecida del Uruguay, que se origina aguas arriba.
- **Ituzaingó**: al inicio del 11/10 el sistema no tenía ninguna alerta para el departamento y la lluvia local pronosticada era baja (4,5 mm); la crecida del Paraná no es observable con la grilla local.

Son comparaciones entre pronóstico de celda y mediciones de prensa sin estación identificada: **indican**, no miden, el error del pronóstico. Estas cifras describen la corrida que tenía el sistema; el panel radar del mapa se calcula al vuelo desde la última corrida (ver la sección siguiente), pero la celda y el umbral usados aquí son aproximaciones y no prueban que el panel mostrara el evento.

## Qué mostraba el mapa: dos dimensiones

Con la configuración productiva observada el 2026-10-13 ([03](03-auditoria-sistema.md#configuración-observada-en-producción)), la pestaña Radar era visible (`RISK_RADAR_ENABLED=true`). Dentro de ella hay dos cosas distintas:

| Dimensión | Fuente de datos | Estado en la ventana | Clasificación (todos los casos públicos) |
|---|---|---|---|
| **Panel radar** (pronóstico y alertas SMN por departamento) | última `radar_meteo_run`, resumen calculado al vuelo (`app/api/infraestructura/radar-meteo/resumen/route.ts:2, 18, 29`) | con datos (61 corridas completas) | **Reconstruible**: lo que tenía es la reconstrucción de la tabla anterior. No prueba que el panel mostrara el evento: la celda y el umbral departamental se aproximan |
| **Capas de riesgo por escuela** («Peligro por clima estimado», «Riesgo pronosticado») | `infra_risk_run` vigente (`app/api/infraestructura/radar/route.ts:189-197`; sin corrida vigente devuelve vacío) | **vacías toda la ventana** (`infra_risk_run` 0 filas) | **Omisión comprobada** (causa confirmada: el motor no se ejecutaba en producción — tareas no programadas) |

Alcance de la omisión: es la omisión **de las capas de riesgo**, que el sistema tenía habilitadas y que debían mostrar un estado calculado y no mostraron ninguno. **No** demuestra que, de haber corrido, el motor habría marcado estos casos (el motor tiene defectos conocidos: consulta no as-of, vulnerabilidad 0 con amenaza 100; ver [03](03-auditoria-sistema.md#motor-de-riesgo-no-ejecutado-en-prod-código)), ni que el panel radar mostrara o no el evento.

## Matriz

La columna «Clasificación» se refiere a la capacidad del sistema para representar el **hecho** (afectación, nivel de río, cierre). Las dos dimensiones del mapa de la sección anterior aplican a todos los casos públicos y no se repiten fila por fila.

Clasificación: **detectado y representado** (evidencia de su presencia en el sistema), **omisión comprobada** (evidencia del hecho y del estado del sistema que demuestra que faltó), **brecha de capacidad** (la arquitectura no tiene datos o representación para ese fenómeno), **no evaluable**.

| Caso | Qué tenía el sistema | Clasificación | Causa | Mejora | Validación |
|---|---|---|---|---|---|
| **Paso de los Libres: Uruguay sobre evacuación, evacuaciones** (EV-20261007-001, EV-20261013-001) | Al inicio del 7/10: sin alturas de río (no hay integración); sin caudal GloFAS ni score (jobs nunca corrieron); 6 registros de tormenta Moderate capturados, ninguno vigente; ningún parte real conocido | **Brecha de capacidad** | Confirmada: no existe fuente de altura observada; motor y caudal sin ejecutar por falta de programación [prod, ops]. Las capas de riesgo estaban vacías (omisión comprobada, transversal), pero el hecho «río sobre evacuación» no tiene entidad en el sistema: brecha de capacidad | I-3 alturas Prefectura con umbrales oficiales; F-1 capa territorial de eventos | Con capturas periódicas desde el 13/10, el mapa debe mostrar Paso de los Libres «sobre evacuación» dentro de un ciclo de captura después de cada lectura oficial |
| **Ituzaingó: Paraná sobre alerta; Isla Apipé evacuada; Yacyretá abre vertedero; paso a Ayolas cerrado** (EV-20261011-001/002, EV-20261012-001, EV-20261013-005) | Al inicio del 11/10: sin altura ni caudal; `parana-ituzaingo` existe en código pero sin datos; ninguna alerta conocida para el departamento (la primera de la ventana se envió el 11/10 20:39 ART, de tormentas); 4,5 mm pronosticados | **Brecha de capacidad** | Confirmada: sin fuente de altura ni de operador (EBY); la grilla radar no cubre la cuenca del Iguazú/Paraná alto | I-3; F-2 avisos de EBY como evidencia; G-2 contexto aguas arriba | Igual que el anterior; además, que una evacuación publicada aparezca como evento con evidencia y estado temporal |
| **Alvear, La Cruz, Yapeyú, Bonpland sobre alerta (confianza baja: lecturas del 12/10 sin nota localizada); cierre del paso Alvear-Itaquí (media)** (EV-20261013-004, EV-20261010-001) | Sin estaciones en esas localidades en `puntos-rio.ts`; General Alvear 4/25 y San Martín 15/51 escuelas asociadas a un punto | **Brecha de capacidad** | Confirmada: no hay puntos ni alturas para esas estaciones | I-3 (todas las estaciones de Prefectura del Uruguay correntino); G-1 | Cada estación de la tabla de Prefectura en territorio correntino debe tener su estado y umbral en la capa |
| **Monte Caseros: cruce cerrado (confianza baja; calles cortadas y 7,10 m no verificados)** (EV-20261008-004) | Al cierre del cruce (7/10 08:00 ART): sin altura; registros de tormenta Moderate y Severe capturados pero ninguno vigente a esa hora | **Brecha de capacidad** | Confirmada: cierres y cortes no tienen entidad en el modelo | F-1 capa de eventos con tipo «acceso/cruce cerrado» | Evento publicado con evidencia, tipo y vigencia |
| **Curuzú Cuatiá: temporal, árboles, cortes de luz** (EV-20261008-001) | Al inicio de la noche del 7/10 (20:00 ART supuesto): alertas de tormenta **solo Moderate** conocidas (7 vigentes); pronóstico de 12,4 mm en la celda hasta las 08:30 del 8/10 (27,0 mm si se toma 18:00 ART) | Panel radar **reconstruible** (fila de la tabla de reconstrucción); capas de riesgo en **omisión comprobada**. **Brecha de capacidad** para la afectación (no hay lluvia observada ni entidad de impacto sin parte) | Confirmada para la falta de lluvia observada (IMERG no corrió en la ventana: no estaba programado en producción). Hipótesis: el pronóstico subestimó la lluvia (12,4-27,0 mm vs 88-90 mm informados sin estación) y la severidad conocida a la hora del evento era Moderate | I-4 activar IMERG con as-of; F-1; F-3 pluviómetros oficiales si existen | Comparar acumulado IMERG de la noche del 7 al 8/10 con el valor informado; el evento debe existir en la capa con su evidencia |
| **Capital: 17 mm, sin anegamientos** (EV-20261008-002) | A las 00:00 ART del 8/10: alertas Moderate y Severe vigentes (9 registros); 30,9 mm pronosticados hasta las 09:00 | **No evaluable** como acierto o error del pronóstico (sin observación propia; panel radar reconstruible, no capturado). Es un **negativo verificado parcial** útil para evaluación | — | I-4 | Usarlo como caso negativo de anegamiento (solo para la mañana del 8/10) |
| **Goya: 20 mm el 12/10** (EV-20261012-002) | A las 00:00 ART del 12/10: 0 mm pronosticados hasta las 20:00; sin alertas | **No evaluable** para impacto (no hubo impacto informado). Indica posible error de pronóstico | Hipótesis: lluvia convectiva local no resuelta por el modelo | I-4 | Comparar con IMERG cuando corra |
| **Paraná bajo alerta en Corrientes, Itatí, Bella Vista, Goya, Esquina** (EV-20261013-002) | Sin alturas; Itatí 0/26 escuelas asociadas a un punto de río | **Brecha de capacidad** | Confirmada: sin alturas; asociación por proximidad sin estación en Itatí | I-3; G-1 | Estado «bajo alerta, creciendo» visible; Itatí asociado a su estación |
| **Avisos: SMN naranja 8/10; pronósticos INA, CARU/CTM, EBY** (AV-001..009) | El SMN CAP sí estaba almacenado (solo tormentas); INA, CARU y EBY no | **Detectado y almacenado** (SMN); el panel radar los incluía (`alertasSmnActivas` en el resumen; pestaña visible con `RISK_RADAR_ENABLED=true`), reconstruible. **Brecha de capacidad** para avisos hidrológicos | Confirmada: sin integración de avisos hidrológicos | F-2 registro de avisos con emisión y vigencia | Cada aviso con emisor, emisión, vigencia y área, separado de hechos |
| **Cifra «más de 400 afectados»** (EVD-030) | — | No aplica: no es un hecho verificable | Cifra sin fuente identificada: TN no localizada; Cadena 3 10/10 no la contiene; solo copias sin atribución | Regla de verificación (05) | La cifra no debe publicarse como conteo |

**Omisiones comprobadas:** una, transversal a todos los casos públicos: las **capas de riesgo por escuela** estuvieron vacías toda la ventana porque el motor no se ejecutaba en producción (tareas no programadas). Se cumple (a) hecho con evidencia, (b) estado del sistema conocido por construcción (sin `infra_risk_run` vigente la API devuelve vacío) y (c) capacidad habilitada (`RISK_ENGINE_ENABLED=true`, `RISK_RADAR_ENABLED=true`). No hay omisiones comprobadas del **hecho** en sí: para los hidrológicos falta (c) (brecha de capacidad) y para los pluviales no hay snapshot del panel radar, solo su reconstrucción.

## Causas transversales confirmadas

1. El motor, el caudal, IMERG y las climatologías nunca corrieron en producción [prod] porque no estaban programados: producción usa tareas de Coolify y solo tenía 4 (radar, ensemble radar, SMN, verificación radar) [ops]. Corregido parcialmente el 2026-10-13 para IMERG y climatologías ([10](10-cambios-operativos-2026-10-13.md)); el motor sigue sin programar.
2. No existe ninguna fuente de altura hidrométrica observada ni de avisos hidrológicos [código].
3. La grilla radar cubre solo Corrientes; las crecidas se originan aguas arriba [snapshot].
4. La base mezcla partes de prueba con datos reales [prod].
5. El descubrimiento de fuentes depende de búsquedas estándar que omitieron medios nacionales [investigación].
