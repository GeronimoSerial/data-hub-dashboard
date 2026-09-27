# E8 — Tercera revisión (independiente, solo lectura)

Fecha: 2026-09-27
Alcance: correcciones de la segunda revisión de E8 (briefing narrativo asistido por IA), en `feat/enos-e8`, cambios sin commitear. Gate de N1 (1700 tests, lint, tsc) ya pasó antes de esta revisión.
Metodología: N2 (sonnet) exploró el código para poder verificar; delegó UN N3 (`opencode-go/deepseek-v4.1-flash`, foreground, sin red) que ejecutó código real del repo (no sólo lectura) contra los 5 puntos del encargo. N2 reprodujo independientemente los dos hallazgos con impacto (Tarea 1d y confirmación arquitectónica de la Tarea 3c) antes de cerrar veredicto.

## Veredicto: **REJECT**

Bloqueante por un bug de datos/migración real (Tarea 3c), no por una evasión del filtro de contenido (Tarea 1 no tiene evasiones bloqueantes nuevas).

---

## Tarea 1 — Evasión del filtro (`contieneTerminoProhibido`, validar.ts)

Ejecutado contra la función real (no simulado): separadores Unicode invisibles (ZWSP U+200B, NBSP U+00A0, thin space U+2009, soft hyphen U+00AD, word joiner U+2060), fullwidth (`ａｌｅｒｔａ`), marcas combinantes sueltas, mayúsculas cirílicas/griegas, leetspeak, "S. M. N." / "Servicio Meteorológico Nacional", término partido entre frases, y 10 frases operativas legítimas.

- Bloquea correctamente: (a) separadores Unicode, (b) fullwidth, (c) diacríticos sueltos, (e) leetspeak, (f) puntuación/tildes, (g) término partido entre dos frases distintas — la revalidación sobre el texto UNIDO en `generar-briefing-asistido.ts` (línea 180, `contieneTerminoProhibido(textoUnido)`) atrapa lo que la validación por-frase deja pasar.
- Falsos positivos sobre las 10 frases operativas legítimas: **0/10**.
- **Hallazgo NO bloqueante** (riesgo residual, no regresión de esta revisión): homoglifos visuales que sustituyen una letra por un carácter fuera de `MAPA_CONFUSABLES` evaden el filtro porque `formaSoloLetras` los descarta y rompe la contigüidad de `"alerta"` en vez de resolverlos. Verificado independientemente por N2 con la lógica real de `normalizarSinTildes`/`formaSoloLetras`:
  - `aӏerta` (palochka cirílica U+04CF, visualmente idéntica a "l") → **PASA**.
  - `aIerta` (I mayúscula latina sustituyendo la "l" minúscula — indistinguible en muchas fuentes) → **PASA**.
  - `АЛЕRTA` / `ΑΛΕΡΤΑ` (Л/Ρ cirílicas y griegas no mapeadas) → **PASA**.
  - Causa raíz: el mapa cubre homoglifos de la mayoría de las letras pero no de `l` (falta al menos `ӏ` U+04CF, `Ӏ` U+04C0, `І`/`I` cirílica U+0406), y algunas consonantes cirílicas/griegas (`л`, `т`/`τ` ya cubierta, `ρ` cubierta pero `Р`/`р` ya está, revisar `л`).
  - Recomendación (no bloqueante): ampliar `MAPA_CONFUSABLES` con los homoglifos de `l` y las letras cirílicas/griegas faltantes; no cambia el veredicto porque no hay evasión de la revisión anterior, es cobertura incompleta preexistente del enfoque de mapa fijo.

## Tarea 2 — Post-procesamiento del texto final (`generar-briefing-asistido.ts`)

Confirmado por lectura de código: `estado.textoFinal` nace en `textoPlantilla` (línea 103). Cuando `fuente === 'ia'`, se asigna en la línea 198 exactamente `validacionResultado.frasesValidas.map(f => f.texto).join(' ')` (líneas 176-178), sin ninguna transformación entre esa asignación y el `persistir(...)` de las líneas 220-227. Toda rama de fallo (presupuesto agotado, proveedor, JSON inválido, esquema inválido, trazabilidad inválida, término prohibido en el texto unido) deja `textoFinal` en la plantilla determinista. **Sin hallazgos.**

## Tarea 3 — `ensureBriefingAuditoriaFallbackColumn` (lib/db/seed.ts)

- **3a — Aditiva e idempotente**: confirmado (líneas 776-783). Sólo `PRAGMA table_info` + `ALTER TABLE ... ADD COLUMN`, sin DROP ni modify.
- **3b — Test existente**: ejecutado (`vitest run lib/db/seed.test.ts -t 'ensureBriefingAuditoriaFallbackColumn'`) → pasa.
- **3c — BLOQUEANTE (bug de migración real)**: la migración corre dentro de `seedHub()`, disparada por `ensureSeeded()`. Los route handlers de `app/api/infraestructura/briefings/*` sí llaman `ensureSeeded()` antes de tocar la tabla. **La cadena del job programado no**: `deploy/systemd/ops1/enos-ops1-briefing-ia.timer` → `scripts/jobs.mjs` (`briefing-ia`) → `lib/infraestructura/briefing-ia/job.ts` (`correrJobBriefingIA`) → `generarBriefingAsistido` → `repositorio.ts` (`insertarBriefingSiNoExiste`, que escribe la columna `auditoria_fallback`). Grep confirmado: ninguna función de esa cadena (`scripts/jobs.mjs`, `job.ts`, `generar-briefing-asistido.ts`, `repositorio.ts`, `puertos.ts`, `presupuesto.ts`, `job-run.ts`) invoca `ensureSeeded`. El job corre en un proceso Node propio (`docker exec`, ver el comentario de diseño en `lib/db/index.ts` sobre por qué los scripts de job son "su PROPIO proceso"), así que no comparte el `_db`/`seedPromise` memoizado del proceso web.
  - Prueba end-to-end (N3, reproducida por N2 a nivel de grep/arquitectura): con un sqlite legacy cuya tabla `infra_briefing` fue creada sin la columna `auditoria_fallback` (escenario real de una base sembrada por un build anterior a este batch), llamar `correrJobBriefingIA()` directamente — sin pasar antes por ninguna ruta web que dispare `ensureSeeded()` — falla al persistir con `SQLITE_ERROR: table infra_briefing has no column named auditoria_fallback`.
  - El healthcheck de contenedor (`/`) tampoco migra: la página raíz es un client component y no llama `ensureSeeded`.
  - El fix hoy es accidental: sólo funciona si algún request web ya corrió en ese contenedor antes de que dispare el timer. No está garantizado por el diseño (timer y web son procesos distintos con arranque independiente).
  - Corrección sugerida: llamar `ensureSeeded()` al inicio de `correrJobBriefingIA` (o en el dispatch de `scripts/jobs.mjs` para `briefing-ia`), igual que ya hacen `scripts/job-diagnostico.mjs` y `scripts/job-episodios-derivados.mjs` para sus propios jobs.
- **3d — Sin índice sobre la columna**: confirmado, `lib/db/schema.ts` sólo define `infra_briefing_corte_uidx` (sobre `corte_id`) e `infra_briefing_creada_en_idx` (sobre `creada_en`); ningún índice sobre `auditoria_fallback`.

## Tarea 4 — Test de concurrencia con dos conexiones (`presupuesto.test.ts`)

Confirmado: el test `'dos conexiones distintas al mismo archivo, compitiendo por el mismo mes, sólo una reserva procede al superar el techo'` abre una conexión libsql nativa (`createClient` de `@libsql/client`) distinta de la memoizada por `getDb()`, contra el mismo archivo `hub.sqlite`, y corre una carrera real (`Promise.all`) contra la función de producción. Verifica que exactamente una de las dos reservas de 3 USD (techo 5) procede y que el acumulado final es 3. Ejecutado (`vitest run lib/infraestructura/briefing-ia/presupuesto.test.ts`) → pasa (6 tests). **Sin hallazgos.**

## Tarea 5 — Secretos en el diff

Revisado `git diff`, `git diff --staged` (vacío) y el contenido completo de los archivos nuevos sin trackear. Sin hallazgos: sólo placeholders de test (`apiKey: 'clave'`) y nombres de variables de entorno (`OPENROUTER_API_KEY`, `E8_*`). **Sin secretos expuestos.**

---

## Resumen de bloqueantes

1. **Tarea 3c** — bug de migración real: el job programado `briefing-ia` puede fallar en producción sobre una base legacy si corre antes de que cualquier ruta web dispare `ensureSeeded()`. **Bloqueante.**
2. Tarea 1d — evasión de homoglifos no mapeados en `MAPA_CONFUSABLES` (cobertura incompleta preexistente, no regresión de esta revisión). No bloqueante; recomendado corregir en un batch posterior.

Todo lo demás (Tareas 1a-c/e-h, 2, 3a/b/d, 4, 5) queda verificado por ejecución real, sin hallazgos.
