# E6 — Riesgo de acceso y señales adicionales con valor medido

Rama: `feat/enos-e6` (worktree `enos-e6`), base `feat/renovación` @ `ff90a8a`
(incluye G1: `infra_aislamiento_osm`, `infra_susceptibilidad_estatica`,
`scripts/importar-geo-static.mjs`; E3b con adaptadores "no disponible" para
aislamiento/susceptibilidad; M1, P1, E4).

Rol: N2 (sonnet), coordinando N3 (`opencode-go/deepseek-v4.1-flash`, uno a la
vez, en primer plano, sin commits/push/merge). Verificación propia: `git diff`
+ `vitest` + `tsc --noEmit` + corrida real del job sobre una base de
desarrollo con las capas de G1 importadas.

## 1. Regla de riesgo de acceso (versionada)

`lib/infraestructura/riesgo/motor/riesgo-acceso.ts`, constante
`REGLA_ACCESO_VERSION = 'acceso-v1'` (`config.ts`). Es una dimensión
**separada** del IRO compuesto — igual que `exposicion`/`urgenciaVerificacion`
ya lo eran en E3b — nunca se mezcla en `scoreRiesgo`/`scoreVulnerabilidad`.

Insumos: `IndiceAislamiento` (nivel 0-3 + conteos de cruces + `tieneAlternativaSinCruce`),
el peligro del horizonte YA leído en el mismo cálculo (celda/caudal, sin volver
a pedir el puerto) y `accesoInterrumpidoCantidad` del historial (motivo real
del catálogo `'Acceso interrumpido'`, ya resuelto desde E3b — no se inventó
ningún literal nuevo).

Score 0-100 = `BASE_ACCESO_POR_NIVEL_AISLAMIENTO[nivel]` (0/20/45/70) +
agravantes aditivos (`AGRAVANTES_ACCESO`): cruce sin puente/vado conocido
(+25), peligro alto en el horizonte -naranja/rojo, ≥66 en la escala 0-100-
(+25), sin alternativa confirmada (+15), alternativa **desconocida** (+20,
deliberadamente MAYOR que "sin alternativa confirmada": un dato faltante
nunca abarata el riesgo), antecedentes de acceso interrumpido confirmados
(+15). Clasificación con los mismos umbrales del IRO (`UMBRAL_MODERADO`/`UMBRAL_ALTO`).

Ausencia (`IndiceAislamiento` null o `nivel: 'sin_datos_red'`) → `nivel: null`,
`confianza: 'baja'`, NUNCA "bajo" por defecto.

Casos de aceptación cubiertos por tests (`riesgo-acceso.test.ts`):
cruce sin puente + peligro alto sube el score por encima del mismo aislamiento
sin peligro; alternativa desconocida da un score ≥ que alternativa confirmada
como ausente; proximidad a un cauce con puente en todos los cruces y
alternativa conocida (sin peligro alto) queda en nivel bajo; sin
`IndiceAislamiento` → confianza baja / nivel null.

## 2. Decisiones de contrato (N2, documentadas)

- **Extensión de `PuertoAislamiento`** (`motor/puertos.ts`): `obtenerIndice()`
  pasó de devolver sólo `NivelAislamiento` a devolver `IndiceAislamiento`
  (nivel + conteos de cruces + `tieneAlternativaSinCruce` + procedencia OSM).
  Motivo: el índice compuesto 0-3 solo no alcanza para distinguir "cruce sin
  puente conocido" de "alternativa desconocida" en la regla de acceso — son
  indistinguibles con sólo el resumen. Es una extensión del MISMO puerto, no
  un puerto nuevo (mismo criterio que `puntoRioId` en `PerfilTerritorio`,
  decisión local de E3b).
- **El aislamiento OSM salió de `PESOS_VULNERABILIDAD`** (antes contribuía al
  IRO compuesto con peso 0.3): ahora es insumo exclusivo de la dimensión de
  acceso. Pesos redistribuidos: `historial 0.5→0.7`, `susceptibilidad 0.2→0.3`.
  `MOTOR_VERSION` subió (cambia un peso ⇒ sube versión, regla fija de E3b).
- **Carga por lote, no escuela por escuela**: los adapters reales de
  aislamiento/susceptibilidad hacen UNA sola query batch a toda la tabla,
  agrupan en memoria por `cueAnexo` quedándose con la última versión (mayor
  `importadoEn`; empate → mayor `versionJob`), y memoizan el resultado en un
  Map lazy dentro del closure del adapter. Susceptibilidad además prioriza,
  dentro de la misma versión, el `periodoRetornoAnios` mayor (escenario más
  conservador) cuando hay varias filas.
- **`infra_risk_snapshot`** ganó 3 columnas (`score_riesgo_acceso`,
  `nivel_riesgo_acceso`, `confianza_acceso`), con `CREATE TABLE IF NOT EXISTS`
  para instalación nueva y `ALTER TABLE ADD COLUMN` idempotente
  (`ensureRiesgoAccesoColumns`, `lib/db/seed.ts`) para una base ya poblada,
  mismo patrón que `ensureMovimientoIdempotencyKeyColumn`.

## 3. Entregables

1. Adaptadores reales `aislamiento.ts`/`susceptibilidad.ts` — batch, con
   fixtures para: con datos, `sin_datos_red`, sin cobertura del dataset
   (nunca "bajo"/0 por defecto), y prueba de que la carga es batch (una sola
   consulta para N cueAnexos).
2. Riesgo de acceso como dimensión separada (arriba). Documentada y versionada.
3. `GET /api/infraestructura/accesos/[cueAnexo]` — solo lectura, `staffGuard`
   (más estricto que la lectura genérica de mapas), `Cache-Control: private,
   no-store`, expone índice/cruces por tipo/`rutaAlternativaSinCruce`
   (`null`=desconocida, nunca se traduce a "segura")/fecha de extracto
   OSM/licencia con atribución `© OpenStreetMap contributors`. 404 sólo si la
   escuela no existe en el padrón; sin cobertura OSM es `disponible: false`
   con 200. Sin datos nominales (test de regresión explícito sobre las keys).
4. UI: `ficha-territorial.tsx` y `risk-explanation-panel.tsx` ganaron una
   sección "Acceso" opcional y separada del estado del edificio/vulnerabilidad
   (texto explícito, nunca sólo color; "Sin datos de acceso" explícito cuando
   `nivel` es null; sin las palabras "alerta"/"SMN"). `layer-control.tsx` ganó
   la capa opcional "Riesgo de acceso" (`CapaRadar: 'riesgo-acceso'`, apagada
   por defecto, no es columna permanente). `map-infraestructura-page.tsx`
   (propiedad de M2) se tocó de forma mínima y aditiva: 27 líneas, sólo pasar
   la nueva prop `riesgoAcceso` al panel existente y el flag de la capa nueva
   con default `false`. **Pendiente** (dejado como TODO explícito en el
   código, `map-infraestructura-page.tsx`): dibujar la capa "Riesgo de acceso"
   en el mapa en sí — sólo existe el toggle/definición, no el renderizado
   geoespacial, para no invadir el archivo de M2 con un cambio grande.
5. KPI `lib/infraestructura/riesgo/kpi-acceso.ts` —
   `calcularMatriculaCondicionadaPorAcceso`: suma matrícula de escuelas con
   `nivelRiesgoAcceso === 'alto'`, excluyendo cueAnexo ya contados en la
   afectación confirmada (`estado === 'afectada'` de `listarEscuelasMapa`).
   Expuesto en `GET /api/infraestructura/radar` como
   `kpis.accesoCondicionado: { escuelas, matricula }`. Tests cubren
   deduplicación explícita y `exposicionMatricula: null`.

## 4. Verificación

- `npx vitest run` (suite completa): **201 archivos, 1706 tests, todos verdes**.
- `npx tsc --noEmit`: sin errores.
- Corrida real del motor sobre una base de desarrollo (`.data` scratch,
  offline, sin llamadas a Open-Meteo) sembrada con `ensureSeeded` +
  `scripts/importar-geo-static.mjs` usando los CSV reales de G1
  (`services/geo-static/output/aislamiento_osm-v1-2026-09-26.csv`,
  `susceptibilidad_estatica-v1-2026.csv`, 2001 filas cada uno) + job
  `geo-perfiles` (2001/2005 perfiles válidos) + job `calcular-riesgo`
  (6003 = 2001 escuelas × 3 horizontes procesados).

  **Distribución de `nivelRiesgoAcceso` (horizonte 24h, 2001 escuelas):**
  - `bajo`: 1099
  - `alto`: 886
  - sin dato (`null`, sin cobertura o `sin_datos_red`): 16
  - `moderado`: 0 (no apareció en esta corrida — artefacto del dataset real de
    G1, que en esta muestra concentra el aislamiento en niveles 1 y 3; no es
    un defecto de la regla, ver umbrales arriba)
  - confianza: 1985 `alta`, 16 `baja` (las 16 sin cobertura)

  El score de acceso se calculó igual para las 2001 escuelas aunque
  `evidenciaValida` haya dado `false` en todas (esta base de desarrollo no
  tiene datos de peligro/lluvia de E3a sembrados): confirma que la dimensión
  de acceso es independiente del gate de evidencia de amenaza del IRO, tal
  como exige el diseño.

## 5. Pendientes (para el gate de N1)

- **Validación satelital de la muestra de 20-30 escuelas rurales** contra el
  índice OSM (aceptación explícita de §6-E6 del plan): NO se hizo en este
  batch — requiere inspección visual de imagen satelital, fuera del alcance
  de un agente automatizado sin esa herramienta. Queda como acción pendiente
  antes de confiar en el índice en producción.
- Renderizado de la capa "Riesgo de acceso" en el mapa del modo Radar (el
  toggle existe, el dibujo geoespacial no — ver punto 4).
- Copernicus GFM y E6b (cuencas/topografía offline, anomalías de lluvia,
  caudal GloFAS) quedan fuera de alcance de E6a por diseño del plan.

## Gate

(reservado para N1)
