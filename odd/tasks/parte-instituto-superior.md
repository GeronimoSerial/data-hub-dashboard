# Parte para institutos superiores (matrícula nominal)
Objective: new "who is affected" flow for higher-education institutes (careers + enrolled students) without changing current parte behavior. Branch: GeronimoSerial/fix-issues-2. Delivery: ask-on-risk. Runner: vitest.

## Specs
- S1. "El rector o director crea un parte de un instituto superior y nosotros le presentamos un flujo nuevo."
- S2. "Podra elegir carreraS y alumnos por carreras, pero como son tantos, le vamos a poner un buscador" — single search field: digits → DNI, text → apellido/nombre (accent-insensitive).
- S3. "no puede ni debe afectar a nada de lo que hoy funciona, sino hay que empezar por otro lado para asegurar esa consistencia y RECIEN AHI vamos al modelo nuevo" — Phase 0: characterization tests over parte API, consulta, mapa and riesgo; then extract an "alcance" port with GE padrón as first adapter, with no output change.
- S4. Separate model (option B): own tables for matrícula and for career/student affectations; not GE padrón tables, no negative-ID tricks.
- S5. Scope per institute: careers and students, plus class interruption per career and building state (decision 2026-10-25: "Carreras y alumnos").
- S6. Import: script by cuts like the padrón import (new cut, activated only on success), run by an admin per new xlsx. Source: "Matriculados 2026 Nominal V2 (3).xlsx" (sheets Estatales/Privados; columns Departamento, Localidad, CUE, Instituto, Carrrera, RM, Carrera Tipo, Carrera Estado, APELLIDOS, NOMBRES, DNI).
- S7. Detection: a CUE uses the new flow when it has carreras in the vigente matrícula cut, regardless of jurisdictional level (changed 2026-10-25, see L15).
- S8. DNI stored only as a hash; DNI search is exact match on the full number.
- S9. Rows with shifted columns are excluded and reported to a CSV for correction at the source.
- S10. "Debemos mejorar toda la parte de apis y eso que hoy no esta muy profesional y listo para sobrecargas o debugging." Scope: common error envelope, request-id in every response and log, structured logs, schema validation, per-user/IP rate limiting, DB timeouts. Route unification is a later separate phase. Order: "antes, que lo nuevo nazca con el estándar".

## Tasks
- T1 [S3] characterization tests for current parte (API, historial, mapa; riesgo covered by existing corte/consulta tests) — inline — done (app/api/problematicas/parte/caracterizacion.test.ts, stable on 2 runs)
- T6 [S10] API standard (request-id, structured logs, traceable 500, bounded rate limiter; DB timeouts already existed) applied to the 11 parte handlers — inline + haiku fixes, sonnet-low review (no blockers) — done
- T2 [S3] extract alcance port + GE adapter, outputs unchanged — haiku writer, 2 sonnet-low-reviewed iterations — done
- T3 [S4,S6,S8,S9] matrícula schema + import script — haiku writer, sonnet-low review (1 blocker fixed: PII in drizzle error logs) — done
- T4 [S4,S5] matrícula adapter + selection + affectation tables (migration 0031) — haiku — done
- T4c [S1,S4,S5] POST for institutes (carreras/alumnos, servicio tipo 'carrera', readers audit, resolve alcance once per request) — haiku, 2 sonnet-low reviews + 2 corrections — done
- T4d [S1] GET/ficha shape for institutes (additive: secciones [] + carreras) — haiku, sonnet-low review — done
- T4e [S4] mapa totals for institutes (no PII) + evolucion alumnos series — haiku, sonnet-low review — done
- T4b [S2,S8] matrícula search endpoint — haiku, sonnet-low review — done (859cc75c)
- T5 [S1,S2,S7] step 2 UI for institutes with search — haiku, sonnet-low review — done

- T7 [S7] detection by vigente matrícula carreras instead of level — haiku — done

## Log
- L1 (2026-10-25) user: "vos te vas a encargar de modificar el flujo de reportes para supervisores, vamos a necesitar añadir la matricula, y el flujo de reportes para esos cue sera distinto: Podra elegir carreraS y alumnos por carreras, pero como son tantos, le vamos a poner un buscador por (dni? nombre? que recomiendas?)"
- L2 user: "Y sii del parte hablo yo no flujo de supervisores. El rector o director crea un parte de un instituto superior y nosotros le presentamos un flujo nuevo."
- L3 user rejected option A (careers as pseudo-sections): "si el b tiene mucha complejidad es porque en su momento no se hizo una correcta abstraccion. Cosa que, noto cuando veo las apis en paths y no una con varios params."
- L4 answers: Fase 0 = tests + abstracción; alcance = carreras y alumnos; import = script; detección = nivel jurisdiccional; DNI = hash; filas malas = excluir y reportar.
- L5 user: "Debemos mejorar toda la parte de apis y eso que hoy no esta muy profesional y listo para sobrecargas o debugging."
- L6 user: "antes, que lo nuevo nazca con el estándar" — T6 runs after T1, before T2.
- L7 T1 baseline: 14 parte-related test files, 124 tests green before changes.
- L8 user: "Vos no lo hagas, delega haikus e iteras hasta que quede perfecto, actua de team leader. Usa sonnet low para revisiones tambien" — from T6 on, writers=haiku, reviewers=sonnet low, parent coordinates.
- L9 T6 checks: lib/http + parte 107 tests green, tsc clean. Full suite in chunks: only timeouts under load (pass alone) and podman-missing backup test; none import lib/http or parte routes. A single `vitest run lib` hung >20min (not linked to T6, unverified at baseline).
- L10 T2: generic port (UnidadAlcance id/etiqueta/turno/grupo, miembroId numeric surrogate), GE-shaped response consumers kept on GE rows (contract frozen), one memoized ge_seccion read per request. Snapshot unchanged; 137 related tests green. parte-mapa.ts still reads GE directly (batch across CUEs) — handle in T4.
- L11 T3: dry run on real file: 28,680 imported, 10 excluded (8 duplicate in carrera, 2 invalid DNI), 419 carreras, 82 CUEs. Correction: the file has NO shifted rows; the earlier claim came from the parent's naive xlsx parse skipping empty cells. Decisions: DNI as HMAC (MATRICULA_DNI_SECRET, never rotate without re-import); advisory-lock single importer; replaced cuts kept; parte stores (corte_id, alumno_id).
- L12 T4a/T4c: scope rows resolve by their stored matricula cut; mixed-cut modify rejected; GE validation byte-identical to HEAD (17-case differential test); GE body carrying `carreras` now gets 'Este establecimiento informa por secciones' (new input, previously stripped). Open: evolucion alumnos series ignores institutes; GET ficha (T4d) and mapa (T4e).
- L13 T5: interruption in step 3 applies to carreras chosen in step 2 (mirrors GE sections); detection failure: GE loads normally, Superior with matrícula failure shows inline error.
- L14 (2026-10-25) temporary SG rule 88fecbc7-1ed8-494b-8f66-a251e379b40f (coolify-sistemas, tcp 22 from 179.0.180.39/32) added for dev import/QA — MUST be deleted after.
- L15 (2026-10-25) dev import: cut 1 vigente, 28,680 alumnos, 419 carreras, 82 CUEs; 69 Superior, 9 Enseñanza Privada, 2 Educación Física, 2 without level. Q: "¿Querés que el flujo de institutos se active para cualquier CUE que tenga matrícula vigente, sin mirar el nivel?" user: "Si." → S7 rewritten; task T7 reopened detection.
- L16 (2026-10-25) browser QA round 2 on dev: all prior bugs fixed (79d60521); fixed pre-existing SW bug (3xx navigation treated as offline), institute copy map lib/copy/institutos.ts, RM label normalization, singular. 5xx navigations still go offline (unchanged).
