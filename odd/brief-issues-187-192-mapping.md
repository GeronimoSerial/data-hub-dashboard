# Mapping brief: issues #187 through #192

## Target and outcome

Map the current checkout for an ODD plan covering GitHub issues #187, #188,
#189, #190, #191 and #192 in GeronimoSerial/data-hub-dashboard. Produce a
source-backed implementation map, dependency graph and unresolved questions.
This is investigation and planning only. Do not implement any fix.

## Ownership and constraints

- Workspace: `/home/gero/orca/workspaces/data-hub-dashboard/fix-issues`.
- Read code, tests, Git history and issue bodies. You may write only
  `odd/issues-187-192-mapping.md`, using apply_patch.
- Preserve all existing changes and the user-provided Excel. Do not revert,
  stage, commit, migrate a database, deploy, modify issues or start other agents.
- The coordinator prematurely started #191. Treat the current diff and new
  files as an incomplete, unverified candidate, never as the approved design.
  Compare HEAD with the working tree and identify gaps and unintended scope.
- CodeGraph was attempted in this session but reported no usable project index;
  use normal read/search tools. Do not initialize or retry CodeGraph.
- Artifact language: English; source UI already uses Spanish.
- Be careful not to print names or DNI from the workbook. Institutional
  CUE/career data alone is relevant.

## Product requirements confirmed by the user

- #191: only for Superior CUEs, disable "Inaccesibilidad de alumnos".
- For "Afecta al establecimiento", allow selecting one or more careers
  belonging to the chosen CUE. Include ABIERTA and CERRADA careers.
- Source: `.orca/drops/Matriculados 2026 Nominal V2 (2).xlsx`. Verified:
  Estatales and Privados sheets, 82 unique CUEs, 409 CUE-career pairs.
  CUE is nine digits without separator and must align with the application's
  seven-digit CUE plus two-digit annex format. Header `Carrrera` has three r's.
- No extra product behavior was authorized. In particular, independently assess
  whether the existing candidate's new service scope type is necessary and what
  decisions remain unresolved. Do not assume a new career nominal roster.
- User wants ODD plan FIRST and explicitly told us to preserve the local changes.
- Antislop during is selected for this session. Preserve `design.md` and existing
  UI patterns; this mapping task is not a redesign.

## Issue summaries (fetch current full bodies with gh)

- #187: nominal scope returns all students of a section instead of the selected
  subset in infra_afectacion_alumno. Distinguish complete and partial sections.
- #188: show stored critical-severity justification and optional detail in school
  drawer and standalone page. Follow the read contract end to end.
- #189: photos crop on small screens; fullscreen school details become blocked.
  Map gallery sizing, portals, fullscreen root, escape/focus and scroll behavior.
- #190: intermittent `no available server` for probabilistic risk calculation.
  Identify request chain, error/retry behavior and operational evidence needed;
  distinguish verified source findings from an unconfirmed infrastructure cause.
- #191: Superior eligibility/career scope as specified above.
- #192: add "Centro de evacuados" as establishment affectation reason and
  examine consistency with existing centro_evacuados building status.

## Required report

1. Per issue: confirmed behavior, source paths/symbols, data/API/UI flow, existing
   tests, concrete acceptance scenarios and unknowns. Cite line numbers where useful.
2. Distinguish existing fixes in history from fixes actually present in this checkout.
3. Audit incomplete #191 diff: reusable pieces, missing integrations, compatibility
   risks (initial/update/offline drafts/readbacks/map/history/validation), migration
   and rollout boundaries, and proposed minimal design without implementing it.
4. Propose reviewable work units grouped by exclusive write ownership, dependency
   ordering and collision points. Flag likely units exceeding 400 authored lines.
5. Verification matrix: focused tests, runtime/browser scenarios and required
   operational evidence. Do not run the entire suite or build just for mapping.
6. Keep questions minimal, prioritize genuine product blockers. Do not invent
   answers, claim root causes without evidence or request clarification directly
   from the user. Return questions to the coordinator.

## Observable acceptance

The report exists at the allowed path, covers all six issues and the candidate
diff, and includes source-backed ownership/dependency/test maps sufficient to
write an ODD plan. Follow the injected Orca worker lifecycle contract and send
worker_done with the actual report path and a concise summary.
