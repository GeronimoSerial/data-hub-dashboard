# G-1b tramos de río, V-1 conjunto de referencia, F-2 y F-3 (investigación)

## Objetivo

Avanzar con workers Haiku (pedido del usuario, 2026-10-13) las mejoras G-1, F-2, F-3 y V-1 del plan `docs/investigacion-inundaciones-corrientes/06-plan-mejoras.md`.

## Problema y por qué

- G-1: Itatí tiene 0/26 escuelas asociadas; la asociación por distancia no respeta tramos de río. El plan pide asignar localidades a estación por tramo, con justificación y decidido por una persona (`06:153-157`).
- V-1: no hay un conjunto de referencia versionado para medir cobertura y demora (`08-evaluacion.md`).
- F-2 y F-3: dependen de conseguir un canal legible de avisos (INA, EBY, CARU/CTM) y estaciones de lluvia abiertas; hoy no verificados.

## Alcance autorizado

Código, pruebas y docs en `GeronimoSerial/tramos-referencia` (desde `origin/main` 212bfaf). F-2 y F-3: solo investigación (lectura web), con informe en `docs/`. Sin migraciones (el PR #110 abierto renumera 0013/0014). Sin push, PR ni cambios en producción.

## Restricciones y decisiones

- G-1b: los tramos los define una persona. Los workers solo proponen: cada asignación lleva `estado: 'propuesta'` y no se usa por defecto hasta que alguien la apruebe. Las coordenadas de Prefectura siguen `verificada: false`.
- V-1: excluye partes y todo dato con procedencia distinta de real; una localidad sin noticias no es un negativo (`08`).
- Workers: Haiku, una tarea atómica, un solo writer a la vez; investigadores en paralelo (solo lectura).
- Checks por tarea: `pnpm exec vitest run <archivo>`, `pnpm exec tsc --noEmit`, `pnpm exec eslint <ruta>`.
- RDD: off (global). Entrega: `ask-on-risk`.

## Checklist

- [x] T1 G-1b: tramos versionados por río (estación → localidades, justificación, `estado`) + `estacionParaLocalidad` que solo usa tramos aprobados
- [x] T2 V-1: conjunto de referencia versionado (positivos, negativos, bajo umbral) + métricas puras de cobertura, precisión y demora
- [x] T3 F-2: informe de canales legibles de avisos hidrológicos (INA, EBY, CARU/CTM)
- [x] T4 F-3: informe de estaciones de lluvia en superficie con acceso abierto

## Progreso y evidencia

(Por tarea: ruta, checks observados, commit.)

- T1 — ruta: delegated direct (Haiku); RED (import fallaba) / GREEN 64/64 en `hidrometria`; checks: vitest 64/64 (re-ejecutado por el padre), `tsc --noEmit` ok, eslint ok; commit 4b0e231 (`feat(hidrometria): propose river stretches for Prefectura stations`). 18 tramos, todos `propuesta`; 13 localidades dudosas sin asignar (razones del worker, sin fuente). A revisar primero: Colonia Liebig (probablemente no ribereña). Sin conexión al motor ni al mapa.
- T2 — ruta: delegated direct (Haiku); RED (módulos inexistentes) / GREEN 20/20 en `evaluacion` (re-ejecutado por el padre); `tsc --noEmit` ok, eslint ok; commit 9c753b0 (`feat(evaluacion): add versioned reference set and detection metrics`). 8 positivos, 1 negativo, 2 bajo umbral. Hallazgos: 08 dice "11 positivos" pero lista 8; casi ningún `inicio` tiene hora (se guarda null, sin demora desde inicio); EV-20261013-005 (cierre preventivo) entra como positivo mientras EV-20261012-004 se excluye por la misma razón.
- T3 — ruta: investigación delegada (Haiku, solo lectura); informe `docs/fuentes/f2-avisos-hidrologicos.md`. Único canal legible verificado: reporte diario HTML del INA; API del INA por probar.
- T4 — ruta: investigación delegada (Haiku, solo lectura); informe `docs/fuentes/f3-lluvia-superficie.md`. Sin feed abierto verificado; OGIMET accesible; SMN y SIGA no se pudieron abrir.

## Decisiones del usuario (2026-10-13)

- G-1: Colonia Liebig fuera (no ribereña). Las 18 localidades con estación en su propio puerto, aprobadas (`aprobadoPor: GeronimoSerial`, 2026-10-13). Dudosas → propuesta por distancia de escuelas a la estación (≤ 15 km; proxy, coordenadas PNA sin verificar): Ensenadita, Ramada Paso, Puerto Boca, Apipé Grande, La Cruz (Sección Quintas) propuestas; 8 siguen dudosas con su distancia. Commit c58bfcd (`tramos-prefectura-v2`).
- V-1: positivos = afectación ocurrida, alta o media confianza; medidas preventivas excluidas (EV-20261012-004, EV-20261013-005) → 7 positivos. El "11 positivos" de `08-evaluacion.md` está desactualizado (pendiente corregir en el doc de investigación). Commit f33845a (`conjunto-referencia-2026-10-v2`).
- Checks: vitest `hidrometria` + `evaluacion` 87/87 (re-ejecutado por el padre), `tsc --noEmit` ok, eslint ok. Ningún nombre de localidad aprobada o propuesta es ambiguo entre departamentos de Corrientes en el padrón.

## Próximo paso

Riachuelo aprobada en el tramo de Corrientes (usuario, 2026-10-13). Las 5 propuestas por distancia (incluida La Cruz, Sección Quintas) y las 7 dudosas quedan para aprobar después. Usuario autorizó push y PR.
