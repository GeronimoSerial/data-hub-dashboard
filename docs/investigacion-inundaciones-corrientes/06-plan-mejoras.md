# Plan priorizado de mejoras

Cada acción enlaza la evidencia que la justifica. Esfuerzo relativo: **S** (≤ 2 días), **M** (≤ 2 semanas), **L** (> 2 semanas); supone una persona con conocimiento del repositorio. No se proponen cambios de pesos ni umbrales sin datos de calibración.

## Orden y dependencias

```text
I-1 ─┬─> I-4 ──> F-3
     └─> I-7
I-2 ──> V-1
I-3 ──> G-1 ──> G-2
I-5 ──> V-2 ──> V-1
F-1 ──> F-2, F-4
I-6, I-8, G-3, G-4: independientes
I-6 + I-7 + G-3 (P-5) ──> P-6 programar motor en producción
P-1, P-2, P-3, P-4: independientes
```

Cambios operativos ya hechos el 2026-10-13 (IMERG y climatologías programados en producción): [10](10-cambios-operativos-2026-10-13.md).

Primera entrega vertical recomendada: **I-3 → F-1 → mapa** con el caso Paso de los Libres (fuente oficial abierta, umbrales oficiales, hecho vigente). Recorre fuente → evidencia → evento territorial → mapa sin depender del motor.

## Inmediatas

### I-1. Documentar el estado esperado de cada job en producción
- **Evidencia:** 0 ejecuciones de `calcular-riesgo`, caudal, IMERG, climatologías; 0 filas en `hazard_*` e `infra_risk_*` [prod]. Causa confirmada el 2026-10-13: producción programa con tareas de Coolify y solo tenía 4; los timers de `deploy/systemd/ops1/` instalados en el servidor ejecutan staging [ops]. IMERG y climatologías se programaron ese día ([10](10-cambios-operativos-2026-10-13.md)); el motor queda para P-6.
- **Componentes:** tareas programadas de Coolify, `deploy/systemd/ops1/*.timer`, `scripts/jobs.mjs`, `lib/infraestructura/riesgo/salud.ts`.
- **Dependencias:** decisión del equipo ([09](09-preguntas-limitaciones.md)); P-4.
- **Esfuerzo:** S (decisión y documentación); M si hay que corregir el despliegue.
- **Riesgos:** activar el motor con partes de prueba en la base (ver I-2) y con la consulta temporal defectuosa (I-6).
- **Aceptación:** documento de operación que declare el estado esperado de cada job; si se activa, `infra_job_run` registra corridas en la cadencia esperada y `salud.ts` informa jobs esperados sin ejecución.

### I-2. Separar partes de prueba de partes reales
- **Evidencia:** los 8 partes de la ventana son ficticios y comparten tablas con datos reales, sin marca de procedencia visible [prod].
- **Componentes:** `lib/db/schema.ts` (`infra_parte`, `infra_afectacion`), `lib/infraestructura/parte-mapa.ts` (`listarPartesVigentes`), alta de partes, exportaciones.
- **Opciones:** (a) campo `procedencia` (`real` | `prueba` | `simulacro`) obligatorio con exclusión por defecto en mapa, motor y exportaciones; (b) entorno separado para pruebas. (a) es más rápida; (b) evita el problema de raíz. Pueden combinarse.
- **Dependencias:** saber cómo se identifican hoy los partes de prueba ([09](09-preguntas-limitaciones.md)).
- **Esfuerzo:** M (migración, filtro, pruebas).
- **Riesgos:** clasificar mal partes históricos; ocultar partes reales.
- **Aceptación:** prueba automatizada: un parte `prueba` no aparece en `/api/mapas/infraestructura`, no suma historial en el motor y no se exporta; inventario de partes existentes clasificados.

### I-3. Ingerir alturas hidrométricas de Prefectura con umbrales oficiales
- **Evidencia:** EV-20261013-001 (9,31 m sobre evacuación), EV-20261012-001, EV-20261013-002/003/004; el sistema no tenía ninguna altura [prod]. La tabla oficial solo conserva la última lectura (EVD-001).
- **Componentes (propuestos):** conector nuevo, tabla de lecturas (contrato en [05](05-diseno-deteccion.md)), job systemd, capa de estaciones en el mapa.
- **Reglas:** guardar lectura, hora informada, estado textual, lectura anterior, alerta y evacuación **tal como los publica la estación**; no trasladar umbrales entre estaciones; no convertir caudal en altura.
- **Dependencias:** verificar términos de uso y estabilidad del HTML; coordenadas de estaciones (G-1).
- **Esfuerzo:** M.
- **Riesgos:** cambios de formato; lecturas erróneas publicadas (Santa Teresita 0,00 con «CRECE»); horas sin zona horaria explícita.
- **Aceptación:** durante 7 días, cada lectura nueva publicada para las estaciones correntinas aparece en la base en menos de 2 ciclos de captura; validación contra lectura manual en 10 muestras; lecturas inconsistentes marcadas, no descartadas.

### I-4. Activar lluvia observada (IMERG) con consulta as-of
- **Evidencia:** EV-20261008-001 (88-90 mm sin estación) vs 12,4 mm pronosticados por la corrida conocida en la noche del 7/10 (27,0 mm con inicio 18:00 ART); EV-20261012-002 (20 mm) vs 0 mm; `sync-imerg` no corrió en la ventana [prod]; `observado.ts` ya es as-of [código].
- **Estado al 2026-10-13:** programado en producción cada hora (tarea de Coolify) y ejecutado una vez: 8.662 celdas, `hazard_source_health` ok ([10](10-cambios-operativos-2026-10-13.md)). Pendiente: carga retroactiva de la ventana y tasa de gránulos fallidos (P-2).
- **Componentes:** `lib/infraestructura/riesgo/jobs/sync-imerg.ts`, `peligro/observado.ts`, tarea programada de Coolify (producción).
- **Dependencias:** I-1 (activación hecha); P-2.
- **Esfuerzo:** S-M.
- **Riesgos:** latencia del producto (IMERG temprano tiene horas de retraso); subestimación convectiva; resolución ~10 km.
- **Aceptación:** acumulados del 8/10 disponibles para Curuzú Cuatiá y Capital y comparados con EV-20261008-001/002; latencia medida y documentada.

### I-5. Preservar snapshots antes de la purga
- **Evidencia:** `radar_meteo_run` se purga a 14 días (`radar-meteo/job-sync.ts:56-58`); el contraste de [04](04-matriz-caso-sistema.md) dependió de un snapshot manual.
- **Componentes:** job de archivo (exportación comprimida a almacenamiento externo) antes del borrado.
- **Esfuerzo:** S.
- **Aceptación:** existe archivo de cada corrida purgada; el script `sistema-casos-publicos.mjs` funciona sobre el archivo.

### I-6. Corregir la consulta temporal de caudal y pronóstico
- **Evidencia:** `obtenerNivelCaudal` ignora `ahora` (`peligro/nivel.ts:588-593`); `cargarPronostico` no filtra por tiempo (`:185-194`); el módulo de replay referido no existe.
- **Componentes:** `lib/infraestructura/riesgo/peligro/nivel.ts`; comentarios en `nivel.ts:57`, `jobs/sync-imerg.ts:72`.
- **Esfuerzo:** S-M.
- **Riesgos:** cambiar resultados actuales del motor (hoy no corre en prod, el impacto inmediato es nulo).
- **Aceptación:** prueba: con dos corridas, consultar con `ahora` entre ambas devuelve la primera; climatología elegida por versión vigente a `ahora`.

### I-7. Separar detección de amenaza de priorización educativa
- **Evidencia:** `scoreRiesgo = amenaza × vulnerabilidad / 100` (`motor/calculo.ts:382`) con historial siempre presente (`:373`): una escuela sin historial ni susceptibilidad queda en 0 con amenaza 100.
- **Cambio:** publicar la amenaza territorial como salida propia, visible aunque la vulnerabilidad sea 0; mantener la priorización como capa distinta. **No** modificar pesos.
- **Componentes:** `motor/calculo.ts`, `motor/config.ts`, consumidores del snapshot.
- **Dependencias:** I-1, I-2.
- **Esfuerzo:** M.
- **Aceptación:** prueba: escuela con amenaza alta y vulnerabilidad 0 muestra amenaza alta y prioridad baja, no «riesgo bajo» a secas.

### I-8. Salud de fuentes para radar y SMN
- **Evidencia:** 8 fallas HTTP 429 en SMN; 2 fallas del ensemble; el radar no escribe `hazard_source_health` [prod, código].
- **Esfuerzo:** S.
- **Aceptación:** cada job registra última captura exitosa; el mapa muestra «sin actualizar» cuando corresponde.

## Problemas operativos detectados el 2026-10-13

Surgen de las ejecuciones y la configuración observadas ese día ([10](10-cambios-operativos-2026-10-13.md)).

### P-1. `climatologia-caudal` informa éxito sin procesar nada
- **Evidencia:** en producción quedó `completado` con 0 filas, 0 puntos y los 8 puntos de río en error, sin error guardado [ops]. En código, el job publica `estado: 'completado'` sin condición (`lib/infraestructura/riesgo/jobs/calcular-climatologia-caudal.ts:204-210`) y los errores por punto solo van al valor de retorno (`puntosConError`, `:214`), no a la corrida; el comentario `:29-31` lo declara a propósito. El job hermano `calcular-climatologia.ts:270-279` ya resolvió un caso análogo marcando `fallido` para no bloquear el reintento.
- **Hipótesis a verificar:** un `completado` con 0 filas podría bloquear el reintento del mismo período por el lease, como documenta `calcular-climatologia.test.ts:171-174` para el job de precipitación.
- **Componentes:** `calcular-climatologia-caudal.ts`, su prueba `calcular-climatologia-caudal.test.ts`.
- **Esfuerzo:** S.
- **Aceptación:** prueba: con `puntosProcesados = 0` el job termina `fallido` y la corrida guarda el error de cada punto; con fallas parciales queda marcado como degradado (hoy `degradado` existe como estado de salud de fuente, `sync-imerg.ts:103`, no de corrida: elegir dónde registrarlo) con los puntos en error guardados.

### P-2. Tasa alta de gránulos IMERG fallidos
- **Evidencia:** 10 de 12 gránulos fallidos en producción y 7 de 12 en staging en la primera ejecución [ops].
- **Hipótesis:** errores de CMR/OPeNDAP o gránulos del producto temprano aún no publicados (latencia). No verificado.
- **Componentes:** `lib/infraestructura/riesgo/jobs/sync-imerg.ts`.
- **Esfuerzo:** S (diagnóstico) a M.
- **Aceptación:** cada gránulo fallido registra su motivo (código HTTP o error del proveedor y hora); la tasa de falla en 7 días queda por debajo de un umbral acordado con el equipo, distinguiendo «aún no publicado» de «error».

### P-3. Cupo de Open-Meteo compartido entre staging y producción
- **Evidencia:** producción no tiene clave de Open-Meteo (cupo gratuito); la climatología de staging del 2026-10-13 consumió cupo y la de producción se cortó por cupo agotado («366 celda(s) pendientes») [ops]. Que compartan cupo es probable (misma salida de red), no verificado.
- **Opciones:** (a) desactivar las climatologías en staging; (b) aislar el cupo (clave propia o salida distinta). (a) es inmediata; (b) mantiene staging representativo.
- **Esfuerzo:** S.
- **Aceptación:** una corrida de staging no reduce el cupo disponible para producción (medido por la ausencia de cortes por cupo en producción tras corridas de staging).

### P-4. Deriva del runbook del scheduler
- **Evidencia:** `docs/ejecucion-enos/OPS1/runbook-scheduler.md` describe systemd; producción usa tareas de Coolify y los timers del servidor corresponden a staging [ops].
- **Esfuerzo:** S.
- **Aceptación:** el runbook lista, por entorno, el mecanismo de programación, cada job con su cron y timeout, y cómo verificarlo; coincide con lo configurado.

### P-5. Condición para activar el motor
- **Contenido:** I-6 (consulta as-of de caudal y pronóstico), I-7 (atenuación: amenaza × vulnerabilidad deja en 0 escuelas con amenaza alta) y G-3 (distancia en grados en el adaptador territorial).
- **Regla:** no programar `calcular-riesgo` en producción hasta cerrar las tres con sus pruebas de aceptación. Además, I-2 (partes de prueba) debe estar resuelto o el historial del motor se contamina.

### P-6. Programar el motor y sus dependencias en producción
- **Dependencias:** P-5, I-2.
- **Cambio:** crear tareas programadas para `calcular-riesgo`, `sync-pronostico-caudal`, `sync-ensemble` y `situacion-corte`. `infra_situacion_corte` es el registro de «qué mostraba el mapa»: habilitarla cubre en parte V-2.
- **Esfuerzo:** S (configuración) una vez cumplida P-5.
- **Aceptación:** `infra_job_run` registra corridas en la cadencia configurada; existe una `infra_risk_run` vigente; las capas de riesgo dejan de responder vacío; `infra_situacion_corte` guarda un corte por ciclo.

## Fuentes

### F-1. Capa territorial de eventos con evidencias
- **Evidencia:** 19 hechos públicos sin entidad en el sistema; ninguno ligado a una escuela.
- **Componentes (propuestos):** tablas `evento_territorial`, `evidencia`, `evento_evidencia` ([05](05-diseno-deteccion.md)); revisión humana; capa de mapa.
- **Esfuerzo:** L.
- **Riesgos:** publicar hechos no verificados; duplicados.
- **Aceptación:** los eventos de `eventos.csv` se cargan con sus evidencias y estados; ninguno con geometría inventada.

### F-2. Avisos hidrológicos (INA, EBY, CARU/CTM)
- **Evidencia:** AV-003..009; INA y EBY solo vía prensa; PDF INA ilegibles con la herramienta usada.
- **Dependencias:** F-1; conseguir un canal legible (texto, API o suscripción) — pendiente.
- **Esfuerzo:** M (semiautomático con revisión).
- **Aceptación:** cada aviso registra emisor, emisión, vigencia, área y valores; vencidos marcados.

### F-3. Lluvia medida en superficie
- **Evidencia:** las cifras de lluvia de la ventana son municipales o de prensa sin estación.
- **Tarea previa:** investigar disponibilidad de estaciones SMN, INTA o redes municipales con acceso abierto (no verificado).
- **Esfuerzo:** investigación S; integración M.

### F-4. Descubrimiento de noticias nacional, regional y oficial
- **Evidencia:** la búsqueda estándar inicial omitió TN, Crónica, Infobae y MDZ; aparecieron en una segunda ronda.
- **Cambio:** lista curada de medios por departamento y nivel (local, regional, nacional, oficial), con consultas por localidad y río; extracción asistida con los controles de [05](05-diseno-deteccion.md#extracción-asistida-por-ia).
- **Esfuerzo:** M.
- **Aceptación:** en una ventana de prueba, la cobertura de medios del conjunto de referencia supera la de la búsqueda estándar (medido en [08](08-evaluacion.md)).

## Geografía

### G-1. Estaciones como entidad y asociación por tramo
- **Evidencia:** Itatí 0/26 escuelas asociadas a pesar de estar sobre el Paraná; Alvear, La Cruz, Yapeyú, Bonpland sin punto; afluentes pendientes (`puntos-rio.ts:98-106`).
- **Cambio:** catálogo de estaciones de Prefectura con coordenadas verificadas; asociación de localidades a estación por tramo de río definido por una persona (no por distancia).
- **Esfuerzo:** M.
- **Aceptación:** cada localidad ribereña del Paraná y el Uruguay tiene estación asignada con justificación; Itatí asociada.

### G-2. Contexto aguas arriba
- **Evidencia:** crecidas originadas en Iguazú y Paraná alto (EV-20261011-002); Prefectura publica Iguazú 29,20 m sobre evacuación y Libertador sobre evacuación el 13/10.
- **Cambio:** mostrar estaciones aguas arriba como contexto, sin trasladar sus umbrales.
- **Esfuerzo:** S (si I-3 existe).

### G-3. Distancia geodésica en el adaptador territorial
- **Evidencia:** `motor/adaptadores/territorio.ts:12,25` (euclídea en grados) vs `rio-asociacion.ts` (haversine 40 km).
- **Esfuerzo:** S. **Aceptación:** ambos flujos asocian igual en pruebas con puntos conocidos.

### G-4. Revisar el comentario de caudal de `parana-goya`
- **Evidencia:** `puntos-rio.ts:59` repite el valor de `:43`. **Esfuerzo:** S.

## Modelo

- **M-1. Umbrales de lluvia:** reemplazar los provisorios v0.1 por la climatología cuando exista (lo prevé `umbrales-provisorios.ts:2-3`); no recalibrar con un solo evento. Dependencia: I-1.
- **M-2. Caudal:** no convertir caudal GloFAS en altura ni extensión sin curvas de descarga; mostrar caudal como indicador, no como nivel.

## Validación

- **V-1.** Conjunto de referencia según [08](08-evaluacion.md). Dependencias: I-2, I-5, V-2.
- **V-2.** Guardar lo que el mapa sirvió (respuesta de `/api/mapas/infraestructura` y flags) con marca de tiempo, para poder demostrar omisiones en el futuro. Esfuerzo S.
- **V-3.** Completar o retirar `scripts/exportar-dataset-desidentificado.mjs` (hoy escribe solo el encabezado, `:33-35`). Esfuerzo S.
