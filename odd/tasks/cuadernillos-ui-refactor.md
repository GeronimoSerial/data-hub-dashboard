# Cuadernillos UI refactor
Objective: rework the three cuadernillos screens (planning, cabecera, supervisor) into a simple, fluid flow. Branch: feat/cuadernillos-ui-refactor (from main). Delivery: ask-on-risk, PRs to main then staging cherry-pick. Runner: `node node_modules/vitest/vitest.mjs run components/cuadernillos`.

## Specs
- S1: "se ve pesimo, listas, kpis, cards, drawers en vez de modals, etc. Un desastre, voy a necesitar un refactor completo para mejorar muchisimo la experiencia de usuario"
- S2: "analiza cada pantalla vos mismo y encargate de mejorarlo vos mismo según corresponda para que cada uno de los users tenga una experiencia sencilla y fluida"
- S3: Planeamiento: "deberia permitirme cargar el stock por escuelas cabeceras" and "cargar x cantidad de x grado ... dependiendo de la cantidad que asigne planeamiento".
- S4: Cabecera: "realizar una solicitud de x material, de x grado ni x stock", limited by what planning assigned.
- S5: Assumption (not asked): the "Sección en desarrollo" modal is removed because overlays become drawers.
- S6: Out of scope: the Crítica severity eligibility rule and any API/permission change (decision pending with the user).

## Tasks
- T1 shared kit (KPI strip, status chip, empty state, drawer, stepper, bar, styles) — inline
- T2 supervisor screen — inline
- T3 cabecera screen — inline
- T4 planning screen (stock per grade, quotas per cabecera in a drawer) — inline
- T5 workspace shell, remove dev modal, tests, staging check — inline

## Log
- L1: "ok voy a necesitar que te enfoques a mejorar la ui, se ve pesimo, listas, kpis, cards, drawers en vez de modals, etc. Un desastre, voy a necesitar un refactor completo para mejorar muchisimo la experiencia de usuario, analiza cada pantalla vos mismo y encargate de mejorarlo vos mismo según corresponda para que cada uno de los users tenga una experiencia sencilla y fluida"
- L2 (2026-11-13): user said planning shows "no hay campañas activas" and cabecera "me permite buscar la escuela pero no realizar una solicitud ... ni x stock"; and "dice disponible 0, cuando deberia tener un seed". Catalog, campaign and demo stock/quota already loaded in staging (#293/#294).
- L3 (2026-11-13): "podes reemplazar los drawers por modals?" Overlays are centered modals now (Drawer renamed Modal in the kit); the earlier "drawers en vez de modals" spec is superseded.
