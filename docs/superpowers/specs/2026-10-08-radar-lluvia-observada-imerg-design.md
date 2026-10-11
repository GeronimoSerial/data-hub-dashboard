# Radar: histórico de lluvia observada (IMERG) — diseño propuesto

- **Fecha:** 2026-10-08
- **Estado:** propuesta, **no implementada**. Se separó a propósito de la PR del selector de corridas pasadas (histórico del pronóstico).
- **Alcance:** modo Radar de `/mapas/infraestructura`. Mostrar, junto al pronóstico publicado en un instante pasado, la lluvia que efectivamente se estimó para ese período.
- **Depende de:** la feature "ver pronóstico pasado" (`asOf` en las rutas del radar y selector de corridas, PR #86). Este documento reutiliza ese instante `asOf` como eje temporal.
- **Fuera de alcance:** pluviómetros o estaciones propias; cambiar la fuente de datos; verificación estadística del pronóstico (ya existe en `lib/infraestructura/radar-meteo/verificacion.ts`).

## 1. Objetivo

Hoy se puede elegir una corrida pasada y ver **qué se pronosticó**. Falta ver **qué pasó**: la lluvia observada en las 48 h previas al instante elegido, para comparar pronóstico contra realidad sobre el mismo mapa.

## 2. Qué existe hoy (verificado en el código)

| Tema | Hecho | Dónde |
| --- | --- | --- |
| Fuente | NASA GPM IMERG **Early Run** (estimación satelital, no medición en tierra), proveedor `nasa-imerg`, variable `precipitacion_observada_satelital` | `lib/infraestructura/riesgo/jobs/sync-imerg.ts` |
| Cadencia | Un gránulo cada 30 min; el valor guardado es `mm/30min` con ventana `validoDesde`/`validoHasta` | `sync-imerg.ts`, `lib/db/schema.ts` (`hazardObservation`) |
| Latencia | Early Run publica con ~4 h de retraso: las últimas ~4 h antes de "ahora" **no tienen dato**, y eso no es lluvia cero | comentario en `sync-imerg.ts` |
| Grilla | 0,1° (celdas de ~10 km) sobre el bbox de Corrientes. La grilla del radar de pronóstico es de 0,2° | `providers/imerg.ts`, `radar-meteo/grilla.ts` (`ESPACIADO_GRILLA`) |
| Ingesta | Cada corrida procesa como máximo 12 gránulos; el backfill cubre 72 h con margen de 6 h | `providers/config-fuentes.ts` (`imergCmr`) |
| Tabla | `hazard_observation`; único `(provider, variable, geometry_ref, observado_en)`; **solo** hay un índice más, por `geometry_ref` | `lib/db/schema.ts` |
| Retención | No se encontró ninguna purga de `hazard_observation` en `lib/` ni `scripts/`: la tabla crece sin límite | búsqueda en el repo |
| Lectura | `peligro/observado.ts` suma 24 h / 72 h con criterio "as-of" (nunca usa un gránulo cuyo fin sea posterior al instante pedido) y devuelve `null` si la cobertura es menor a 80 % | `lib/infraestructura/riesgo/peligro/observado.ts` |
| Calidad | `calidad` guarda `precipitationQualityIndex` cuando el gránulo lo trae; `verificacion.ts` descarta valores de calidad no aceptable | `verificacion.ts` |

## 3. Brecha

1. **No hay endpoint ni UI** que devuelvan la lluvia observada por celda y por paso de tiempo; `observado.ts` solo entrega acumulados 24 h / 72 h por celda.
2. **Falta un índice por tiempo.** Una consulta "todas las celdas con `valido_hasta` en las últimas 48 h" hoy no tiene índice que la sirva, y la tabla crece sin purga.
3. **Las grillas no coinciden** (0,1° vs 0,2°): hay que decidir cómo superponer o comparar.
4. **El volumen no se midió.** Cota superior por cálculo: los límites que usa `verificacion.ts` (lat −31,95 a −26,05; lon −60,95 a −54,05) dan 60 × 70 celdas de 0,1° (≈ 4 200), y hay 48 gránulos por día, o sea hasta ~200 000 filas por día y ~400 000 para 48 h. El número real (celdas efectivamente guardadas por gránulo) hay que **medirlo** antes de decidir el formato de respuesta.

## 4. Propuesta

### 4.1 Datos y API

- Migración: índice `(provider, variable, valido_hasta)` en `hazard_observation`.
- Endpoint de lectura `GET /api/infraestructura/radar-meteo/observada?hasta=<ISO>&horas=48&paso=3` (mismos guardas de acceso y flag que las rutas del radar). Devuelve la grilla observada ya **agregada por paso de tiempo** (por ejemplo, suma de `mm` cada 3 h, igual que el modo "Paso 3 h" del pronóstico) para no enviar 96 gránulos de 30 min por celda.
- Regla as-of: solo gránulos con `valido_hasta <= hasta`; cobertura mínima del 80 % por celda y paso, igual que `observado.ts`; por debajo, el valor es `null` ("sin dato"), nunca 0.
- Los pasos recientes sin gránulos por la latencia se devuelven como `null`, no como cero.

### 4.2 UI

- Capa "Lluvia observada" seleccionable en el panel del radar, con **la misma escala de color** que "Lluvia" para poder compararlas visualmente.
- Se mueve con el mismo control de tiempo; el instante `asOf` elegido define el extremo derecho de la ventana observada.
- Rotular siempre como "estimación satelital (IMERG)" y avisar cuando el tramo reciente (~4 h) no tiene dato.

## 5. Decisiones abiertas

1. **Resolución de la capa:** mostrar en 0,1° (más fiel, ~4× más celdas) o re-muestrear a la grilla de 0,2° del radar (más simple de superponer).
2. **Granularidad temporal:** 3 h (coincide con el paso del pronóstico) o 1 h / 30 min (más detalle, más datos).
3. **Qué se muestra:** solo la capa observada, o también una capa de **diferencia** (pronóstico − observado) para el instante elegido.
4. **Retención:** cuántos días conservar `hazard_observation` y quién purga (hoy nadie).
5. **Early vs Final Run:** el Early Run es provisional. A confirmar si conviene reemplazarlo por el Final Run cuando esté disponible, y con qué latencia (no verificado).

## 6. Plan de tareas sugerido

1. Medir el volumen real (filas por gránulo y por día en prod) y fijar resolución y granularidad.
2. Migración del índice + política de retención + tests de la consulta (hoy los helpers SQL del radar solo se prueban con mocks).
3. Endpoint `observada` con agregación por paso, regla as-of y cobertura, con tests.
4. Hook y capa en la UI, con aviso de latencia y rótulo de fuente.
5. Revisión visual en escritorio contra datos reales.

## 7. Riesgos

- **Peso de la respuesta** si se envía sin agregar (ver 3.4): medir antes de elegir formato.
- **Interpretación errónea:** sin el rótulo y el aviso de latencia, "sin dato reciente" puede leerse como "no llovió".
- **Crecimiento de la tabla** sin purga ni índice temporal: degrada las consultas por ventana con el tiempo.
