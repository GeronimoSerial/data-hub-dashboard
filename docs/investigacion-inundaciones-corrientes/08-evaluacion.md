# Evaluación verificable

## Conjunto de referencia

Ventana: desde el miércoles 7 de octubre de 2026 hasta el corte (2026-10-13 ~12:45 ART).

| Clase | Criterio | Casos actuales |
|---|---|---|
| Positivos validados | hecho con evidencia de confianza alta o media, fecha y territorio | EV-20261007-001, EV-20261008-001, EV-20261010-001, EV-20261011-001, EV-20261011-002, EV-20261012-001, EV-20261013-001, EV-20261013-005 (EV-20261008-004, EV-20261012-005 y EV-20261013-004 pasaron a confianza baja en la verificación de URL del 2026-10-13; EV-20261012-004 es medida preventiva, no afectación) |
| Negativos verificados | una fuente afirma explícitamente la ausencia de afectación en un lugar y período | EV-20261008-002 (Capital, sin anegamientos, mañana del 8/10) |
| Mediciones bajo umbral | lectura oficial bajo alerta: negativo de «nivel sobre alerta», no de afectación | EV-20261013-002, EV-20261013-003 |
| Desconocidos | sin evidencia (16 departamentos) o evidencia de confianza baja | resto de [cobertura-busqueda.csv](02-registro/cobertura-busqueda.csv) |

Exclusiones: **los partes de la base productiva son datos de prueba y no entran en ningún conjunto**. Ningún dato con procedencia distinta de `real` puede formar parte del conjunto (ver I-2 en [06](06-plan-mejoras.md)).

Una localidad sin noticias no es un negativo. Hay sesgo de cobertura: la búsqueda estándar omitió medios nacionales y la prensa se concentra en Paso de los Libres e Ituzaingó.

## Métricas

**Detección de hechos** (capa de eventos):

- Cobertura: positivos del conjunto presentes en el sistema / positivos del conjunto.
- Precisión: eventos publicados respaldados / eventos publicados.
- Demora: desde el hecho (`inicio`) y desde la primera publicación hasta su aparición en el sistema.
- Error de ubicación: nivel territorial correcto (estación, barrio, localidad, departamento).
- Duplicados: eventos publicados que corresponden al mismo hecho.
- Vigencia: proporción de eventos con estado correcto al momento de la consulta.

**Pronóstico y avisos:**

- Anticipación: horas entre el primer aviso o pronóstico que cubre el hecho y el hecho.
- Falsas alarmas: avisos sin hecho asociado, **solo** donde hay negativos verificados.
- Calibración: solo con probabilidades y suficientes observaciones; **no es medible con este evento**.

## Circularidad

- Las fuentes usadas para construir la capa de eventos no pueden validarla. Para medir la detección automática, separar fuentes: por ejemplo, desarrollar con Prefectura y medios regionales, validar con medios nacionales y comunicados oficiales no usados como entrada, y declararlo.
- Separar períodos: esta crecida (octubre 2026) como desarrollo; la siguiente como evaluación.

## Qué se puede medir con esta emergencia

| Medible ahora | Requiere más historial |
|---|---|
| Cobertura y demora de la capa de eventos sobre los 11 positivos | Calibración de umbrales de lluvia y caudal |
| Latencia de captura de Prefectura | Tasa de falsas alarmas del SMN por departamento |
| Error del pronóstico de lluvia de celda frente a lluvia observada (cuando IMERG o pluviómetros existan) | Sensibilidad del motor a hechos pluviales del interior |
| Exactitud de la extracción asistida sobre las 62 evidencias | Valor de Sentinel-1 frente a línea de base estacional |

## Procedimiento reproducible

Todo con acceso de solo lectura a la base productiva (provisto por el equipo), sin escribir.

1. **Estado de jobs:** contar ejecuciones por tipo y estado en `infra_job_run` desde la fecha de inicio de la ventana.
2. **Conteos de tablas:** contar filas en `hazard_forecast`, `hazard_observation`, `infra_risk_run`, `infra_risk_snapshot`, `infra_situacion_corte`, `hazard_source_health`.
3. **Exportar** `radar_meteo_run` y `smn_alerta` de la ventana a archivos JSONL (una fila por línea).
4. **Reconstruir qué tenía el sistema** antes de cada hecho: `node docs/investigacion-inundaciones-corrientes/scripts/sistema-casos-publicos.mjs <directorio-export>`. El script elige la última corrida con `fetched_at` anterior a la hora de referencia del caso (el inicio del hecho que respalda su evidencia, no el inicio del día), suma la lluvia pronosticada en la celda más cercana a una referencia aproximada de la localidad y cuenta alertas SMN del departamento superpuestas con la ventana y conocidas (y vigentes) antes de esa hora.
5. **Filtrar procedencia:** excluir todo parte o evento que no sea real (hoy no hay campo para hacerlo; ver [09](09-preguntas-limitaciones.md)).
6. **Comparar** con `eventos.csv` y clasificar cada caso según [04](04-matriz-caso-sistema.md). Una omisión solo se declara comprobada si además existe un registro de lo que el mapa sirvió (V-2) y la configuración vigente, **o** si el estado servido se deduce por construcción (por ejemplo, sin `infra_risk_run` vigente las capas de riesgo responden vacío). Con la configuración observada el 2026-10-13, esta emergencia tiene una omisión comprobada transversal (capas de riesgo vacías); el panel radar solo es reconstruible.

Nota sobre el método: el mismo procedimiento de reconstrucción (pasos 3-4) se ejercitó antes sobre los partes de la base, que resultaron ser **datos de prueba**. Esos resultados **no son evidencia** y no se usan en ningún documento; solo se conserva el método.

Limitaciones del procedimiento: el radar se purga a los 14 días; la consulta de caudal no es as-of (`peligro/nivel.ts`), así que el caudal no se puede reconstruir retrospectivamente aunque existiera; no hay registro de lo que mostró el mapa. Cuando `situacion-corte` se programe en producción (P-6 en [06](06-plan-mejoras.md#problemas-operativos-detectados-el-2026-10-13)), `infra_situacion_corte` pasa a ser ese registro.
