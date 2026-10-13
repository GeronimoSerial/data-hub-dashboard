# Propuesta: veredicto diario asistido por IA

> Estado: **plan, no implementado**. Fecha: 2026-10-13. Rama: `GeronimoSerial/veredicto-diario-ia`.
> Este documento describe el diseño ideal para implementar más adelante. No es todavía un archivo de tareas ODD.
> Todo umbral numérico de este documento es un **borrador a calibrar**.

## 1. Objetivo

Ofrecer, desde el mapa, un **veredicto diario en lenguaje llano** sobre la situación de inundación en la provincia de Corrientes, por día, que:

- combine los datos crudos ya ingeridos (lluvia observada, alturas de ríos, pronósticos de lluvia y caudal, avisos SMN);
- asigne un **nivel por día** mediante reglas deterministas y auditables;
- use la IA solo para **redactar** 2–3 oraciones, citando cada cifra con enlace a su fuente;
- quede **persistido** como historial auditable y exportable para autoridades.

Ejemplo del registro buscado:

> En Corrientes la lluvia fue moderada (promedio 13 mm/72 h, máximo ~58 mm en el NE). Aguas arriba, Misiones/Iguazú registró hasta ~162 mm, lo que alimenta la crecida del Uruguay. Paso de los Libres e Ituzaingó están en nivel de evacuación; los impactos son ribereños, no de anegamiento pluvial local.

## 2. Problema

- Hoy la información está dispersa: capas del mapa, fichas de escuela, Centro de Situación y briefing E8. Nadie sintetiza **qué pasó cada día y por qué**.
- La lluvia es un factor entre varios: una crecida ribereña (Uruguay, Paraná) puede ocurrir con poca lluvia local. Un resumen que mire solo lluvia induce a error.
- El briefing E8 actual resume el **corte de riesgo** (KPIs, conteos por nivel), no los datos hidrometeorológicos por día ni por departamento.
- Las autoridades necesitan un texto no técnico y trazable; los operadores, una vista con evidencia.

## 3. No objetivos

- No generar veredictos por escuela (el riesgo por escuela sigue en `infra_risk_snapshot`).
- No dejar que la IA decida el nivel, invente probabilidades ni atribuya causas que los datos no muestran.
- No emitir alertas oficiales ni reemplazar a SMN, Prefectura o Defensa Civil.
- No automatizar en esta etapa la captura de eventos reportados (eso es la capa de eventos I-4 / capa del mapa en la rama hermana).
- No recalibrar los umbrales existentes de peligro (`umbrales-provisorios.ts`).

## 4. Decisiones tomadas

| # | Tema | Decisión |
|---|------|----------|
| D1 | Escala | Un veredicto **provincial** por día + detalle de **departamentos con señal**. No por escuela. |
| D2 | Ventana | Días observados pasados + hoy + próximas 72 h, separando claramente **observado** de **pronóstico**. |
| D3 | Generación | Job programado (cada 6 h + cierre de día), persistido. El modal lee veredictos guardados (historial auditable). |
| D4 | Formato | Por día, un **nivel** (`sin_senal` / `vigilancia` / `alerta` / `severo`, más `sin_dato` si la cobertura es insuficiente) decidido por **reglas deterministas**. La IA solo escribe 2–3 oraciones y cita cada cifra con enlace a su fuente. |
| D5 | Insumos | Los datos medidos (lluvia, ríos, pronóstico) fijan el nivel. Los eventos reportados (prensa, Defensa Civil, municipios) se muestran **aparte** como "confirmado en terreno", con su confianza, y **nunca** suben ni bajan el nivel (así siguen sirviendo para evaluar el sistema). |
| D6 | Audiencia | Operadores: modal abierto desde el mapa (grupo "Situación actual"), línea de tiempo por día, clic en departamento centra el mapa. Autoridades: versión exportable no técnica (PDF o enlace) generada desde el **mismo** veredicto guardado. |

## 5. Piezas existentes a reutilizar

### 5.1 Pipeline de briefing E8 (`lib/infraestructura/briefing-ia/`)

| Pieza | Archivo | Qué aporta |
|------|---------|------------|
| Orquestador | `generar-briefing-asistido.ts` | Prompt, presupuesto, llamada, validación, fallback, persistencia. `VERSION_PROMPT = 'v1'` (`:21`). |
| Proveedor | `proveedor-openrouter.ts` | `fetch` a OpenRouter con `usage: { include: true }` (`:168-172`); timeout 15 s; costo estimado si falta `usage.cost` (`:118-140`). |
| Config | `lib/infraestructura/riesgo/providers/config-fuentes.ts:109-117` | Modelo por defecto `deepseek/deepseek-v4.1-flash`; tarifas 0,035 / 0,29 USD por millón de tokens (entrada/salida); presupuestos. |
| Esquema | `esquema.ts:9-19` | `frases[1..6]` de `{ texto ≤400, refs ≤6 }`. |
| Trazabilidad | `validar.ts:293-339` | Todo o nada: `ref_inexistente`, `cifra_no_trazable`, `cuantificador_en_palabras`, `termino_prohibido`; parser numérico es-AR (`:238-266`); normalización de homoglifos (`:32-99`). |
| Métricas autorizadas | `metricas.ts:29-86` | Lista blanca de métricas citables derivada del corte. |
| Presupuesto | `presupuesto.ts:69-80` | Reserva atómica mensual (`infra_briefing_presupuesto_mes`). `E8_PRESUPUESTO_USD_MES` = 5, `E8_COSTO_MAXIMO_USD_LLAMADA` = 0,01 (reserva previa, ajustada al costo real). |
| Persistencia | `repositorio.ts:89-125`, tabla `infra_briefing` (`lib/db/schema.ts:1128-1155`) | Idempotencia por índice único + `onConflictDoNothing`; auditoría del fallback sin guardar el texto crudo inválido. |
| Job | `job.ts`, `cadencias.ts:37`, `scripts/jobs.mjs:361-365`, timer `deploy/systemd/ops1/enos-ops1-briefing-ia.timer` | Lease en `infra_job_run`, cadencia horaria, a `*:30` UTC. |
| UI | `components/infraestructura/briefing-panel.tsx`, `situacion-client.tsx:237-261, 348-360` | Render IA vs plantilla, flag `AI_BRIEFING_ENABLED`. |

**Propuesta:** extraer del pipeline E8 un núcleo genérico (proveedor, presupuesto, validador parametrizado por lista de métricas y lista de términos prohibidos, auditoría de fallback) y montar el veredicto como **segundo consumidor**. No copiar archivos.

> ⚠️ **Conflicto a resolver:** la lista de términos prohibidos de E8 (`validar.ts:129-177`) bloquea `alerta`, `evacuación` y `SMN`. El veredicto necesita citar "nivel de evacuación de Prefectura" y "aviso amarillo del SMN" cuando son datos medidos. Se requiere una lista propia del veredicto (ver §8.4), no relajar la de E8.

### 5.2 Datos

| Fuente | Tabla / módulo | Granularidad | Cadencia de ingesta |
|--------|----------------|--------------|---------------------|
| Lluvia observada IMERG Early | `hazard_observation` (`schema.ts:864`), variable `precipitacion_observada_satelital`; job `jobs/sync-imerg.ts` | Gránulos de 30 min, celda 0,1° (`celda.ts:9`) | 60 min, backfill ~4 h |
| Alturas de ríos | `hidro_lectura` (`schema.ts:898`, `drizzle/0013_hidro_lectura.sql`) con `alerta_m` / `evacuacion_m` publicados por fila | Por estación y medición; historial sin sobrescritura | 60 min |
| Catálogo de estaciones y tramos | `hidrometria/estaciones-prefectura.ts`, `hidrometria/tramos-prefectura.ts` (`estacionParaLocalidad` `:303`) | Estación ↔ localidades (en código) | — |
| Climatología de lluvia | `hazard_climatology` (`schema.ts:638`), `precipitacion_diaria`, p90/p95/p99, muestras `todos_los_dias` / `dias_humedos`, 1991–2020 (ERA5) | Celda ERA5 (~0,25°) | Diaria |
| Climatología de caudal | `hazard_climatology`, `caudal_diario`, 2015–2024, m³/s | Punto de río | Diaria |
| Pronóstico de caudal GloFAS | `hazard_forecast` (`schema.ts:605`), variable `caudal` | Punto de río, paso 1/3/6 h | 6 h |
| Prob. de excedencia (ensamble) | `hazard_ensemble_prob` (`schema.ts:831`), `precipitacion_24h`, `probabilidad_p95` / `p99` | Celda, 51 miembros | 6 h |
| Pronóstico de lluvia determinista | `hazard_forecast` (variable de lluvia: **a verificar**) | Celda | **a verificar** |
| Avisos SMN | `smn_alerta` (`schema.ts:1332`), `departamentos` jsonb, `nivel_sat`, `onset`/`expires` | Por aviso y departamento | **a verificar** (sin entrada en `cadencias.ts`) |
| Riesgo / situación | `infra_risk_snapshot`, `infra_situacion_corte` (`schema.ts:743, 1083`) | Escuela / corte horario | 6 h / 60 min |
| Salud de fuentes | `hazard_source_health` (`schema.ts:695`) | Por proveedor | — |
| Georreferencia | `ge.ge_localizacion` vía `riesgo/geo-perfil.ts:63`; polígonos `lib/mapas/departamentos.ts:17` | Escuela / departamento | Diaria |

> **Falta una tabla celda → departamento.** Hoy las celdas se derivan de coordenadas de escuelas. Para agregar IMERG por departamento hace falta una intersección celda–polígono precalculada (ver tarea V-02).

### 5.3 Eventos reportados

Registro manual en la rama `docs/investigacion-inundaciones`, carpeta `docs/investigacion-inundaciones-corrientes/02-registro/` (`eventos.csv`, `evidencias.csv`, `pronosticos-avisos.csv`). Confianza: `alta` / `media` / `baja` / `muy baja`. La rama hermana `GeronimoSerial/mapa-peligro-visible` (no fusionada) los copia a `public/data/eventos-inundaciones/` y los carga con `lib/mapas/eventos-inundaciones.ts`.

### 5.4 Dependencia: rama `GeronimoSerial/mapa-peligro-visible`

Agrega el grupo "Situación actual" en `components/mapas/panel-capas.tsx` con tres capas (estaciones de Prefectura por estado, lluvia IMERG 24/72 h, eventos reportados) y backend reutilizable:

- `lib/infraestructura/hidrometria/estado-altura.ts` (clasificación pura de altura → estado);
- `lib/infraestructura/riesgo/peligro/observado-grilla.ts` (acumulado IMERG por celda, con cobertura parcial);
- `app/api/infraestructura/hidrometria/estaciones/route.ts`, `app/api/infraestructura/peligro/observado-grilla/route.ts`.

El veredicto **debe reutilizar** estas funciones para que mapa y veredicto nunca discrepen. Pendientes allí que afectan al veredicto: validación IMERG 72 h (L2c), fallback HDF5 (L2d), guarda de inanición (L2e).

## 6. Insumos por día y por departamento

Definiciones:

- **Día** = día civil ART (UTC−3), `[00:00, 24:00)`. Todos los agregados se calculan sobre esa ventana convertida a UTC.
- **Ámbito** = `provincia` o `departamento:<id>` (id normalizado con `lib/mapas/normalizar-departamento.ts`).
- **Aguas arriba** = cuencas fuera de la provincia que alimentan Paraná/Uruguay (Misiones, sur de Brasil, Paraguay). Sus métricas son de contexto: nunca fijan el nivel de un departamento por sí solas, pero sí se citan. Delimitación exacta: **a definir** (P-3).

### 6.1 Lluvia observada (días pasados y hoy)

| Métrica | Cálculo | Cobertura |
|---------|---------|-----------|
| `lluvia.obs_24h.prom_mm` | Suma de gránulos IMERG del día por celda; promedio ponderado por área de las celdas del departamento | `% gránulos presentes` = gránulos recibidos / (48 × celdas) |
| `lluvia.obs_24h.max_mm` + celda | Máximo de la suma diaria por celda | idem |
| `lluvia.obs_72h.prom_mm` / `max_mm` | Suma móvil de 3 días que termina en el día | idem sobre 144 gránulos |
| `lluvia.obs_24h.percentil` | Posición del máximo diario frente a p90/p95/p99 de `precipitacion_diaria` (`dias_humedos`) de la celda ERA5 que contiene la celda IMERG | — |

Regla `sin_dato` de lluvia: cobertura < 80 % de gránulos para el día (umbral a calibrar). Un día "hoy" con cobertura parcial se marca `parcial` y no se cierra hasta el cierre de día.

### 6.2 Ríos (días pasados y hoy)

| Métrica | Cálculo |
|---------|---------|
| `rio.<estacion>.estado_max` | Peor estado del día (`normal` < `alerta` < `evacuacion`) según `estado-altura.ts` con `alerta_m` / `evacuacion_m` de cada lectura |
| `rio.<estacion>.altura_max_m` | Máxima `lectura_m` del día (excluye `inconsistente = true`) |
| `rio.<estacion>.tendencia_m_24h` | Última lectura del día − última del día anterior |
| `rio.<estacion>.margen_evac_m` | `evacuacion_m − altura_max_m` |

Mapeo estación → departamento: vía `tramos-prefectura.ts` (solo tramos `aprobada`) y localidad → departamento. Regla `sin_dato` de ríos: sin lecturas válidas en las últimas 36 h (a calibrar).

### 6.3 Pronóstico (hoy + 72 h)

| Métrica | Cálculo |
|---------|---------|
| `caudal.<punto>.pico_m3s` + fecha | Máximo de `hazard_forecast` (`caudal`) de la última corrida, por día válido |
| `caudal.<punto>.percentil` | Pico frente a p90/p95/p99 de `caudal_diario` del mismo punto |
| `lluvia.ens.prob_p95` / `prob_p99` | Máximo por departamento de `hazard_ensemble_prob` para el día válido (24 h) |
| `lluvia.pron_24h.max_mm` | Pronóstico determinista por día (**a verificar** fuente/tabla) |
| `smn.<aviso>.nivel` | Peor `nivel_sat` vigente que se solape con el día y el departamento en `smn_alerta` (excluye `cancelada`) |

Regla `sin_dato` de pronóstico: corrida más reciente con antigüedad > 2 cadencias (`estaAtrasado` en `cadencias.ts`).

### 6.4 Frescura

Cada métrica guarda `observado_en` / `corrida_en` y su fuente. Si una fuente está atrasada según `hazard_source_health`, la métrica se excluye y el veredicto lo declara ("sin datos de Prefectura desde las HH:MM").

## 7. Reglas deterministas de nivel (BORRADOR, a calibrar)

El nivel de un ámbito-día es el **máximo** de los niveles por señal. El nivel provincial es el máximo departamental. Cada evaluación guarda una **traza** (`regla`, `métrica`, `valor`, `umbral`, `nivel`).

| Señal | `vigilancia` | `alerta` | `severo` |
|-------|-------------|----------|----------|
| Lluvia observada 24 h (máx. celda) vs climatología | ≥ p90 | ≥ p95 | ≥ p99 |
| Lluvia observada 72 h (máx. celda) | ≥ 80 mm | ≥ 120 mm | ≥ 180 mm (alineado a `umbrales-provisorios-v0.1`) |
| Río: estado Prefectura | margen a alerta < 0,5 m **y** tendencia > 0 | `alerta` | `evacuacion` |
| Río: tendencia en `alerta` | — | — | `alerta` y subida > 0,3 m/24 h (a calibrar) |
| Caudal GloFAS vs climatología | pico ≥ p90 | ≥ p95 | ≥ p99 |
| Prob. ensamble de excedencia | `prob_p95` ≥ 30 % | `prob_p95` ≥ 50 % o `prob_p99` ≥ 20 % | `prob_p99` ≥ 50 % |
| Aviso SMN (lluvia/tormenta) | amarillo | naranja | rojo |

Reglas generales:

- **`sin_dato`** si ninguna señal del tipo correspondiente al día tiene cobertura suficiente. Si hay señal en al menos una fuente, se emite el nivel y se listan las fuentes ausentes.
- **`sin_senal`** si hay datos suficientes y ninguna regla dispara.
- **Días observados:** solo lluvia observada y ríos. Pronósticos pasados no cuentan (se guardan aparte para evaluación).
- **Hoy:** observado + pronóstico; la traza indica qué parte vino de cada uno.
- **Días futuros:** solo pronóstico (caudal, ensamble, SMN, lluvia pronosticada). Etiqueta visible "pronóstico". Se permite nivel máximo `alerta` desde ensamble/lluvia; `severo` futuro solo por caudal ≥ p99 o SMN rojo (a calibrar).
- **Departamentos con señal (D1):** nivel ≥ `vigilancia` o estación ribereña en `alerta`/`evacuacion`.
- **Eventos reportados:** nunca entran a estas reglas (D5).
- Versionado: `reglas-veredicto-v0.1`, guardado en cada fila.

## 8. Rol de la IA y salvaguardas

### 8.1 Entrada del prompt

JSON estructurado con **solo métricas autorizadas** para un ámbito-día:

```json
{
  "fecha": "2026-10-12",
  "tipo_dia": "observado | hoy | pronostico",
  "ambito": "provincia",
  "nivel": "severo",
  "traza": [{ "regla": "rio.estado", "ref": "rio.paso_de_los_libres.estado_max", "nivel": "severo" }],
  "metricas": [
    { "ref": "lluvia.obs_72h.prom_mm", "valor": 13, "unidad": "mm", "fuente_url": "…" },
    { "ref": "aguas_arriba.misiones.obs_72h.max_mm", "valor": 162, "unidad": "mm", "fuente_url": "…" }
  ],
  "fuentes_ausentes": ["smn"],
  "departamentos_con_senal": ["paso_de_los_libres", "ituzaingo"]
}
```

Nunca se envían: eventos reportados, nombres de escuelas, texto libre de fuentes, PII.

### 8.2 Esquema de salida (zod)

```
{
  frases: [{ texto: string(1..400), refs: string[](0..6) }] (2..3),
  factores: ("lluvia_local" | "lluvia_aguas_arriba" | "rio" | "pronostico")[]  // solo etiquetas presentes en la traza
}
```

El campo `nivel` **no** está en la salida: lo pone el código.

### 8.3 Regla de citación

Se reutiliza `validarTrazabilidadBriefing` con la lista de métricas del ámbito-día: toda cifra debe coincidir (redondeo a 2 decimales o truncado) con una `ref` presente en `refs` de su frase. Cada `ref` se renderiza como enlace a `fuente_url`. Cualquier fallo → plantilla.

### 8.4 Afirmaciones prohibidas (lista propia del veredicto)

- Probabilidades que no estén en la entrada.
- Menciones a escuelas o establecimientos.
- Causalidad más allá de los factores de la traza ("debido a", "provocó") sin ref asociada (heurística a calibrar).
- Órdenes o recomendaciones operativas ("evacuar", "suspender clases").
- Afirmar un nivel distinto al calculado.
- Permitido, a diferencia de E8: "nivel de alerta/evacuación de Prefectura" y "aviso del SMN" **solo** si hay una `ref` de esa fuente en la frase.

### 8.5 Plantilla de fallback

Determinista y construida antes de llamar a la IA, como en E8:

> **{fecha} ({tipo_dia}) — {nivel}.** {principal señal según traza con valor y unidad}. Departamentos con señal: {lista}. Fuentes ausentes: {lista}.

### 8.6 Costo estimado

Supuestos: ~2.500 tokens de entrada y ~300 de salida por ámbito-día; tarifas actuales (`config-fuentes.ts:112-113`).

| Concepto | Cálculo | USD |
|----------|---------|-----|
| Una llamada | 2.500 × 0,035e-6 + 300 × 0,29e-6 | ≈ 0,0002 |
| Corrida (≈ 7 días × (1 prov + ≤ 4 deptos)) | 35 llamadas, solo si cambió el `inputs_hash` | ≤ 0,007 |
| Día (4 corridas + cierre) | ≤ 5 corridas | ≤ 0,035 |
| Mes | ≤ 30 días | ≤ ~1 |

Cabe en `E8_PRESUPUESTO_USD_MES = 5` compartido con E8, pero la **reserva previa** de 0,01 USD por llamada (35 llamadas = 0,35 USD reservados por corrida) puede rechazar llamadas por presupuesto aunque el costo real sea bajo. Opciones: presupuesto separado (`VEREDICTO_PRESUPUESTO_USD_MES`) y reserva por llamada de 0,002 USD, o una sola llamada por corrida con todos los ámbitos-día (P-2).

## 9. Persistencia

### 9.1 Tabla propuesta `infra_veredicto_dia`

| Campo | Tipo | Nota |
|-------|------|------|
| `id` | uuid | PK |
| `fecha` | date | Día ART |
| `ambito` | text | `provincia` o `departamento:<id>` |
| `tipo_dia` | text | `observado` / `hoy` / `pronostico` |
| `nivel` | text | `sin_senal` / `vigilancia` / `alerta` / `severo` / `sin_dato` |
| `traza_reglas` | jsonb | Reglas evaluadas, valores, umbrales |
| `version_reglas` | text | `reglas-veredicto-v0.1` |
| `metricas` | jsonb | Lista exacta enviada (con `fuente_url`, `observado_en`) |
| `inputs_hash` | text | SHA-256 de `metricas` + `nivel` + `version_reglas` + `version_prompt` |
| `cobertura` | jsonb | % por fuente, fuentes ausentes |
| `texto_final` | text | Lo que se muestra |
| `salida_ia` | jsonb | `frases` + `refs` validadas (null si plantilla) |
| `fuente` | text | `ia` / `plantilla` |
| `motivo_fallback` | text | Mismos códigos que E8 |
| `modelo`, `version_prompt` | text | |
| `tokens_entrada`, `tokens_salida`, `costo_usd`, `latencia_ms` | | Igual que `infra_briefing` |
| `generado_en` | timestamptz | |
| `job_run_id` | uuid | FK `infra_job_run` |
| `reemplazado_por` | uuid null | FK a la versión siguiente |
| `cerrado` | boolean | `true` tras el cierre definitivo del día |

Índices: único `(fecha, ambito, inputs_hash)`; parcial único `(fecha, ambito) WHERE reemplazado_por IS NULL` (vigente).

Opcional: `infra_veredicto_evento_vinculo` (evento reportado ↔ fecha/departamento) **solo para presentación y evaluación**; no se lee al calcular nivel.

### 9.2 Idempotencia y regeneración

- Por cada ámbito-día se calculan métricas y nivel; si `inputs_hash` coincide con el vigente, **no** se llama a la IA ni se escribe.
- Si cambia, se inserta una fila nueva y se marca `reemplazado_por` en la anterior (en una transacción). Nunca se borra.
- Un día `cerrado` solo se reabre por revisión explícita (p. ej. llegada de IMERG Late/Final), que también genera nueva versión.

## 10. Job y cadencia

- Nombre: `veredicto-diario` en `NombreJob` y `CADENCIAS` (360 min), con lease en `infra_job_run` (`tipo: 'veredicto-diario-v0'`, clave `fecha-corrida`).
- Horario: `00:45, 06:45, 12:45, 18:45` UTC, después de `sync-pronostico-caudal`/`sync-ensemble` y de `calcular-riesgo`. Más un **cierre de día** a las 03:30 UTC (00:30 ART del día siguiente + margen IMERG) que marca `cerrado` el día anterior.
- Timer systemd nuevo en `deploy/systemd/ops1/` y entrada en `scripts/jobs.mjs`, con flag propio (`AI_VEREDICTO_ENABLED`).

### Latencias y revisión

| Fuente | Latencia típica | Efecto |
|--------|-----------------|--------|
| IMERG Early | ~4 h | "Hoy" siempre parcial; el día se cierra a las 03:30 UTC del día siguiente |
| IMERG Late / Final | ~14 h / ~3,5 meses | Revisión opcional (no ingerido hoy: **a verificar**); generaría nueva versión del día |
| Prefectura | horas, irregular | Si falta, `sin_dato` en ríos y nota de fuente ausente |
| GloFAS / ensamble | 6 h | El veredicto futuro cambia con cada corrida |
| SMN | minutos–horas | Cadencia de sync **a verificar** |

Ventana de observados: 7 días hacia atrás (a confirmar, P-4).

## 11. Interfaz

### 11.1 Modal para operadores

Apertura: botón "Veredicto diario" en el grupo "Situación actual" del panel de capas (rama hermana).

```
┌ Veredicto diario — Corrientes ───────────────────────────── [Exportar] [×] ┐
│ ◄ 07 08 09 10 11 12 │ HOY 13 │ 14 15 16 ►                                  │
│   ·  ▲  ▲  ■  ■  ■  │   ■    │  ■  ▲  ·   (· sin señal ▲ vigilancia       │
│        observado     │        │ pronóstico   ◆ alerta ■ severo ? sin dato)│
├────────────────────────────────────────────────────────────────────────────┤
│ Domingo 12/10 · OBSERVADO · [SEVERO]       generado 12/10 18:47 · v3 · IA │
│ En Corrientes la lluvia fue moderada (13 mm/72 h ↗, máx. 58 mm NE ↗)…      │
│ Por qué este nivel: Prefectura Paso de los Libres en evacuación ↗          │
│                                                                            │
│ Departamentos con señal                                                    │
│  [SEVERO] Paso de los Libres  río Uruguay 9,10 m (evac. 8,50) ↗   ⌖        │
│  [SEVERO] Ituzaingó           río Paraná …                        ⌖        │
│  [VIGIL.] Santo Tomé          lluvia 72 h 84 mm ↗                 ⌖        │
│                                                                            │
│ Confirmado en terreno (no modifica el nivel)                               │
│  • EV-20261012-001 · Paso de los Libres · confianza media · fuente ↗       │
│                                                                            │
│ Fuentes ausentes: SMN (sin datos desde 10:00)    Historial de versiones ▾  │
└────────────────────────────────────────────────────────────────────────────┘
```

- Clic en ⌖ o en un departamento: centra y resalta el polígono (`lib/mapas/departamentos.ts`) y activa las capas relevantes.
- Clic en un día de la línea de tiempo: cambia el detalle; la lluvia IMERG del mapa se sincroniza a esa fecha (requiere modo "as-of" en `observado-grilla`, **a verificar**).
- Estados vacíos/parciales: "Sin veredicto todavía para este día", "Día en curso: datos parciales (IMERG hasta HH:MM)", "Sin dato: cobertura insuficiente", "Generado por reglas (IA no disponible)".

### 11.2 Exportación para autoridades

- Misma fila persistida; vista `/veredicto/[fecha]` (enlace) y PDF imprimible desde esa vista.
- Registro no técnico: sin percentiles ni códigos; niveles con nombre y color; texto IA (o plantilla); departamentos con señal; fuentes citadas al pie con fecha y hora; leyenda fija "No es un aviso oficial. Consulte SMN, Prefectura y Defensa Civil."
- Muestra la versión y `generado_en`, de modo que dos exportaciones del mismo día son distinguibles.

## 12. Evaluación

Base: `docs/investigacion-inundaciones-corrientes/08-evaluacion.md` (rama `docs/investigacion-inundaciones`).

- **Conjunto de desarrollo:** crecida de octubre 2026 (2026-10-07 a 2026-10-13): 8 positivos validados, 1 negativo verificado (EV-20261008-002), mediciones bajo umbral (EV-20261013-002/003), 16 departamentos desconocidos.
- **Conjunto de evaluación:** el próximo evento; umbrales congelados (`version_reglas`) antes de que ocurra.
- **Métricas por departamento-día:**
  - cobertura: positivos con nivel ≥ `vigilancia` / positivos;
  - falsas alarmas: niveles ≥ `alerta` en negativos verificados (solo donde existan);
  - anticipación: horas entre el primer veredicto futuro ≥ `vigilancia` y el inicio del evento;
  - vigencia: veredicto vigente consistente con el estado del evento al momento de consulta;
  - fidelidad de texto: % de veredictos IA que pasan validación; revisión manual de una muestra.
- **Reglas de circularidad:** los eventos reportados no entran al nivel (D5); un evento cuya única fuente sea una medición ya usada (p. ej. Prefectura) no cuenta como validación independiente de la señal de ríos.
- Calibración probabilística: no medible con un solo evento (igual que en `08-evaluacion.md`).
- Advertencia: el radar se purga a 14 días; exportar antes de evaluar.

## 13. Dependencias

- Rama `GeronimoSerial/mapa-peligro-visible` fusionada (grupo "Situación actual", `estado-altura.ts`, `observado-grilla.ts`, carga de eventos).
- IMERG estable: backfill retroactivo y tasa de fallas de gránulos (I-4, P-2 del plan de mejoras; L2c–L2e de la rama hermana).
- Tabla celda → departamento (V-02).
- Ruta de sincronización de SMN con cadencia declarada.
- Capa de eventos en la app (I-4) para mostrar "confirmado en terreno" fuera del CSV manual.

## 14. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Alucinación de cifras o causas | Validación de trazabilidad todo o nada; nivel fuera de la IA; plantilla de respaldo |
| Datos atrasados presentados como actuales | Frescura por métrica, `hazard_source_health`, "fuentes ausentes" visible |
| IMERG subestima lluvia convectiva (p. ej. 88–90 mm reportados vs. satélite) | Etiquetar como "estimación satelital"; no bajar nivel solo por IMERG bajo si hay río en alerta; calibrar con EV-20261008-001 |
| Caídas de OPeNDAP / proveedores | `sin_dato` explícito; nunca rellenar con cero |
| Desalineación mapa ↔ veredicto | Reutilizar las mismas funciones de clasificación y agregación |
| Confusión con avisos oficiales | Leyenda fija; vocabulario controlado; sin órdenes operativas |
| Costo por reservas | Presupuesto y reserva propios (§8.6) |
| Sesgo de cobertura de eventos (Paso de los Libres, Ituzaingó) | Declararlo en la evaluación; no usar ausencia de noticia como negativo |

## 15. Preguntas abiertas

| ID | Pregunta |
|----|----------|
| P-1 | ¿El presupuesto del veredicto se comparte con E8 o es propio? |
| P-2 | ¿Una llamada por ámbito-día o una sola llamada por corrida con todos los ámbitos? |
| P-3 | ¿Qué cuencas o celdas definen "aguas arriba" y desde qué fuente (IMERG fuera de la provincia: ¿se ingiere?) — **a verificar**. |
| P-4 | ¿Cuántos días observados mostrar (7 propuesto)? |
| P-5 | ¿PDF generado en servidor o impresión del navegador desde la vista enlace? |
| P-6 | ¿Quién puede ver y compartir el enlace para autoridades (público con token vs. sesión)? |
| P-7 | ¿Fuente del pronóstico determinista de lluvia por día y cadencia de sync de SMN? — **a verificar**. |
| P-8 | ¿Se ingiere IMERG Late/Final para revisar días cerrados? |

## 16. Tareas propuestas (plan, no archivo ODD)

Tamaños: S ≤ 150 líneas, M ≤ 400, L > 400 (orientativo).

| ID | Fase | Tarea | Tamaño | Depende de |
|----|------|-------|--------|------------|
| V-01 | 0 · Base | Extraer núcleo IA reutilizable de E8 (proveedor, presupuesto, validador parametrizable) sin cambiar comportamiento | M | — |
| V-02 | 0 · Base | Tabla/artefacto celda IMERG → departamento (intersección con polígonos) | M | — |
| V-03 | 0 · Base | Migración `infra_veredicto_dia` + repositorio idempotente con `reemplazado_por` | M | — |
| V-04 | 1 · Métricas | Agregador de lluvia observada por departamento-día con cobertura | M | V-02, rama hermana |
| V-05 | 1 · Métricas | Agregador de ríos por día (estado máx., tendencia, margen) vía tramos aprobados | S | rama hermana |
| V-06 | 1 · Métricas | Agregador de pronóstico (GloFAS vs climatología, ensamble, SMN) por día válido | M | P-7 |
| V-07 | 1 · Métricas | Reglas deterministas `reglas-veredicto-v0.1` con traza (funciones puras + tests) | M | V-04..V-06 |
| V-08 | 2 · IA | Prompt, esquema zod, lista de prohibidos propia, plantilla de fallback | M | V-01, V-07 |
| V-09 | 2 · IA | Orquestador por corrida con `inputs_hash` y presupuesto | M | V-03, V-08, P-1, P-2 |
| V-10 | 2 · Job | Job `veredicto-diario` + cierre de día, cadencia, timer, flag | S | V-09 |
| V-11 | 3 · UI | API de lectura (vigente por rango de fechas, historial de versiones) | S | V-03 |
| V-12 | 3 · UI | Modal: línea de tiempo, detalle, departamentos, fuentes ausentes | M | V-11 |
| V-13 | 3 · UI | Interacción con el mapa (centrar departamento, sincronizar fecha) | M | V-12 |
| V-14 | 3 · UI | Sección "confirmado en terreno" desde la capa de eventos | S | V-12, I-4 |
| V-15 | 4 · Export | Vista enlace no técnica + PDF | M | V-11, P-5, P-6 |
| V-16 | 5 · Evaluación | Reproducir crecida oct-2026 (backfill), medir métricas, calibrar umbrales v0.2 | M | V-10 |
| V-17 | 5 · Evaluación | Congelar reglas y documentar protocolo para el próximo evento | S | V-16 |
