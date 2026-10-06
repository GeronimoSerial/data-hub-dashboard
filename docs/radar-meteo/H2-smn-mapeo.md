# H2 — severidad CAP y color SAT

**Veredicto: no hay evidencia oficial disponible para convertir `severity` CAP a amarillo, naranja o rojo.** Por eso la ingesta guarda `nivelSat: null` y presenta el valor CAP (`Minor`, `Moderate`, `Severe` o `Extreme`) con estilo neutro.

Evidencia revisada el 2026-09-30:

- El endpoint indicado por SMN, `https://ssl.smn.gob.ar/CAP/estilo_ar.xsl`, respondió con una página de desafío Cloudflare al acceso automatizado; no se obtuvo el XSL para revisar sus reglas visuales.
- Las muestras CAP oficiales de `docs/radar-meteo/muestras/` contienen el campo CAP estándar `severity` (p. ej. `Moderate`) y el `event` (p. ej. `Tormentas`), sin parámetro/eventCode que establezca un nivel SAT amarillo/naranja/rojo.
- La documentación H0 registra que CAP no expone un campo de color SAT explícito. Una correspondencia intuitiva entre `Moderate` y amarillo, etc. sería inferida y no se implementa.

La implementación vuelve a revisar el XSL cuando haya acceso verificable o una tabla de correspondencia publicada por SMN. No aplica colores SAT basándose sólo en el enum CAP.

## Geometría y departamentos

Se convierte cada anillo CAP (coordenadas CAP `lat,lon`) a GeoJSON `[lon,lat]`. Se asignan departamentos si hay vértices de una geometría dentro de la otra o si sus segmentos se cruzan; así se detectan polígonos contenidos y cruces de borde. La geometría original se conserva en `poligonos`. No se fuerza asignación cuando no hay intersección. La cobertura espacial se contrasta con el GeoJSON IGN versionado `ign-corrientes-2026-09-27`; la fixture oriental de H0 debe alcanzar Ituzaingó.

El XML se procesa con un parser pequeño propio que sólo acepta las construcciones requeridas por RSS/CAP, decodifica entidades XML predefinidas y numéricas, limita el cuerpo a 2 MB y rechaza `DOCTYPE`/`ENTITY`; no resuelve entidades externas. No se añadió una dependencia: impacto adicional en bundle y runtime Docker, ninguno; el parser es código TS ejecutado en Node tanto en el job como en la API.
