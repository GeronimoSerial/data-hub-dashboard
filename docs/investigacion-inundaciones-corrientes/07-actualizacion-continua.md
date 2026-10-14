# Actualización continua

Fuentes gratuitas primero. En producción la programación se hace con tareas de Coolify, no con los timers systemd del repositorio (que en el servidor ejecutan staging); estado al 2026-10-13 en [10](10-cambios-operativos-2026-10-13.md). Las frecuencias se justifican por la cadencia observada o publicada de cada fuente; donde no se pudo medir, se indica.

| Fuente | Frecuencia propuesta | Justificación | Vigencia del dato | Reintentos | Deduplicación | Supervisión |
|---|---|---|---|---|---|---|
| Prefectura, alturas | cada 1 h | publica lecturas en horarios distintos por estación (00:00, 10:00, 12:00 observados el 13/10); solo conserva la última lectura, así que capturar de más es barato y capturar de menos pierde datos | 24 h desde `medidaEn` | 3 con espera creciente; luego marcar fuente sin actualizar | clave `(estacionId, medidaEn)` | alerta si una estación no cambia en 48 h o si el HTML cambia de estructura |
| SMN CAP (ya integrado) | mantener la actual | hubo 8 respuestas HTTP 429 el 7-8/10 sin huecos > 60 min | `expires` de cada alerta | ante 429, espera exponencial y respeto de `Retry-After` si existe | `id` CAP | registrar en salud de fuentes (I-8) |
| Radar Open-Meteo (ya integrado) | mantener (cada 3 h) | 61 corridas sin huecos > 3 h; lag de captura 27-77 min | hasta la siguiente corrida | ya implementado | `run_at` | salud de fuentes; archivo antes de la purga (I-5) |
| IMERG (programado en producción desde el 2026-10-13) | cada 1 h (`5 * * * *`) | producto temprano con horas de retraso; la primera corrida falló en 10 de 12 gránulos (P-2 en [06](06-plan-mejoras.md#problemas-operativos-detectados-el-2026-10-13)) | ventana as-of | reintento por gránulo faltante; registrar motivo de falla | gránulo | alertar gránulos faltantes y tasa de falla |
| Climatologías de caudal y precipitación (programadas desde el 2026-10-13) | mensual (día 1, 06:41 y 06:43) | se recalculan sobre series largas; la de precipitación se corta por cupo y se retoma | hasta la siguiente versión | precipitación: reanuda lo pendiente; caudal: hoy informa éxito sin procesar (P-1) | versión y período | alertar corridas sin filas; no ejecutar en staging con el mismo cupo (P-3) |
| INA | diaria (una vez obtenido un canal legible) | reporte de sala diario | hasta el reporte siguiente | 2 | fecha de reporte | revisión humana de extracción |
| EBY, CARU/CTM | diaria, más eventos | comunicados irregulares en crecida | según el comunicado | 2 | número de alerta (ej. N° 03/2026) | revisión humana |
| Medios y municipios | cada 3-6 h en crecida; diaria fuera de crecida | la ventana mostró publicaciones varias veces por día en medios regionales | según tipo de evento ([05](05-diseno-deteccion.md#representación-de-la-vigencia)) | 1; muro de pago o 4xx → `pendiente de verificación` | grupo de copia + hecho | cola de revisión humana; no publicar sin revisión |

## Reglas comunes

- Guardar el original con hash y hora de captura; nunca sobrescribir una lectura u evidencia, sino agregar.
- Una evidencia nueva sobre un evento existente actualiza `ultimaEvidenciaEn`; si contradice cifras, se registra la contradicción.
- Un evento pasa a `vencido` cuando se supera su vigencia sin evidencia nueva; pasa a `resuelto_explicito` solo con una fuente que informe la resolución.
- Un job que no procesó nada no puede terminar `completado` (caso `climatologia-caudal`, P-1).
- Cada job escribe su estado en la salud de fuentes; el mapa muestra «sin actualizar» según el umbral vigente (hoy 72 h en `lib/infraestructura/umbrales.ts:20`, a revisar por tipo de dato).

## Supervisión

- Panel de salud de fuentes con última captura exitosa, errores y latencia.
- Revisión humana diaria de la cola de extracciones durante crecidas.
- Muestreo semanal de 10 evidencias publicadas contra el original.

## Alternativas pagas

No se identificó una mejora demostrable que justifique una fuente paga. Los muros de pago de medios (Misiones Online) solo justificarían suscripción si el muestreo de [08](08-evaluacion.md) muestra hechos exclusivos de ese medio.
