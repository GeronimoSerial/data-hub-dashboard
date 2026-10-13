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

- [ ] T1 G-1b: tramos versionados por río (estación → localidades, justificación, `estado`) + `estacionParaLocalidad` que solo usa tramos aprobados
- [ ] T2 V-1: conjunto de referencia versionado (positivos, negativos, bajo umbral) + métricas puras de cobertura, precisión y demora
- [ ] T3 F-2: informe de canales legibles de avisos hidrológicos (INA, EBY, CARU/CTM)
- [ ] T4 F-3: informe de estaciones de lluvia en superficie con acceso abierto

## Progreso y evidencia

(Por tarea: ruta, checks observados, commit.)

## Próximo paso

T1 (writer), T3 y T4 (investigación en paralelo).
