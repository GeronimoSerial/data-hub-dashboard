# Plan de implementación por batches — ENOS multi-región

**Documento interno.** Fecha: 12/11/2026.
Fuentes: [`plan-tests-e2e-mapa-enos.md`](./plan-tests-e2e-mapa-enos.md) (pruebas e indicadores) y [`adaptacion-enos-manaos.md`](./adaptacion-enos-manaos.md) (Manaos).
Las rutas y líneas surgen de un relevamiento del código del 12/11/2026; verificarlas al empezar cada batch.

## Convenciones

- **Batch:** unidad que se implementa, revisa y mergea entera, en su propia rama, con pruebas y documentación juntas.
- **Subtarea `Bn.m`:** paso concreto dentro del batch.
- **Criterios de aceptación (CA):** condiciones observables que deben cumplirse para cerrar el batch. Todas verificables por una prueba o un comando.
- **Rojo primero:** toda corrección de comportamiento empieza con una prueba que falla con el código actual; se registra el fallo observado antes de corregir.
- **Prueba de mutación:** cada prueba nueva se valida rompiendo a propósito lo que prueba y confirmando que falla.
- **Riesgo:** según el ítem de alto riesgo que toque (datos almacenados, seguridad, contratos, concurrencia, entrega, sin cobertura de pruebas).

## Criterio de aceptación rector: cero regresiones en ENOS Corrientes

**Ninguna funcionalidad actual del mapa ENOS de Corrientes puede empeorar.** Puede mejorar, nunca empeorar. Aplica a todos los batches que tocan código compartido (B1 a B11) y prevalece sobre cualquier otro criterio.

- **Qué cuenta como regresión:** una funcionalidad que deja de estar, un dato que cambia sin que el cambio esté pedido y justificado, un flujo que requiere más pasos, una pantalla más lenta, un permiso que se abre o se cierra, un texto o una exportación que cambia de forma.
- **Qué cuenta como mejora permitida:** un indicador que ahora dice la verdad (B5–B6), un `data-testid` agregado, código reorganizado para escalar sin cambio observable.
- **Toda mejora con cambio visible requiere aprobación explícita del responsable del proyecto antes de mergearse.** Se presenta con el antes y el después (captura o salida). Sin aprobación explícita, el cambio visible no entra, aunque sea una mejora. Esto incluye los cambios de indicadores de B5–B6 y cualquier texto, dato o pantalla que cambie para un usuario de Corrientes.
- **Cómo se demuestra:**
  1. Suite e2e de B3 y contratos de API de B2 en verde **sin modificar ninguna prueba existente**. Si una prueba necesita cambiar, el PR explica por qué es una mejora y no una regresión.
  2. Snapshots de API de Corrientes idénticos, salvo cambios declarados.
  3. Comparación diferencial: el mismo seed contra la versión anterior (`main`) y la nueva; stdout, respuestas y archivos exportados iguales salvo cambios declarados.
  4. Tiempos de carga del mapa y de las APIs principales medidos antes y después; no pueden empeorar más de un 10%.
- **Alcance de la libertad en Manaos:** lo que es exclusivo de Manaos (B12–B16, adaptadores brasileños, configuración `manaos.json`) puede diseñarse libremente. Si un cambio para Manaos toca código compartido, vuelve a regir este criterio.

## Decisiones (resueltas el 12/11/2026)

| # | Decisión | Afecta | Resolución |
|---|---|---|---|
| D1 | Base de las pruebas e2e | B1, B4 | **PostgreSQL real**, en local y en CI (no PGlite) |
| D2 | Dónde se valida `REGION` al arrancar | B8 | **`instrumentation.ts`**: si `REGION` es inválida, la app no arranca |
| D3 | Interfaz bilingüe | B10 | **Diccionarios propios tipados** `es`/`pt`; falta de traducción = error de compilación |
| D4 | Preferencia de idioma del usuario | B10 | **Columna en `user`** `user.idioma` (migración `0058_usuario_idioma`, aditiva, nullable; sin valor = idioma de la región) |
| D5 | Card "ENOS Manaos" en el hub | B10 | **Enlace externo** al despliegue de Manaos; agregar soporte de recurso externo si `resource-href.ts` no lo tiene |
| D6 | Rango para valores atípicos de río | B6 | **Guardar mín/máx** (`hidro_referencia.min_m`, `max_m`), completados por el próximo histórico |
| D7 | Observación de la respuesta asistida | B6 | **Columna nueva** `infra_verificacion.observacion`, en la migración `0043` junto con `respondida_por` |

Consecuencias para el criterio de cero regresiones: las migraciones de D4, D6 y D7 son **solo aditivas** (columnas nuevas nullable), no modifican filas existentes y se prueban sobre una copia de la base de staging antes del merge.

---

## Mapa de dependencias

```
B0 (datos Manaos, gestión) ─────────────────────────────────────────┐
                                                                    │
B1 ─► B2 ─┬─► B3a ─┐                                                │
          ├─► B3b ─┼─► B4 ─┬─► B5 ─┐                                │
          └─► B3c ─┘       └─► B6 ─┴─► B7                           │
                           │                                        │
                           └────────────────────────────────────────┴─► B8 ─┬─► B9  ─┐
                                                                            └─► B10 ─┴─► B11 ─► B12 ─┬─► B13 ─┬─► B15
                                                                                                     └─► B14 ─┘   B16 (desde B13)
```

| Batch | Nombre | Depende de | Paralelo con | Riesgo | Migración |
|---|---|---|---|---|---|
| B0 | Validación de datos de Manaos | — | B1–B7 | — | — |
| B1 | Entorno de pruebas | — | B0 | Bajo | No |
| B2 | Seed y contratos de API | B1 | B0 | Bajo | No |
| B3a | E2E acceso, pestañas, capas, filtros | B2 | B3b, B3c | Bajo | No |
| B3b | E2E popups, ficha, parte | B2 | B3a, B3c | Bajo | No |
| B3c | E2E radar, ríos, riesgo, estadísticas, exportaciones, controles | B2 | B3a, B3b | Bajo | No |
| B4 | CI bloqueante | B3a–c | B0 | Medio (entrega) | No |
| B5 | Indicadores: frescura y volumen | B4 | B6 | Medio | No |
| B6 | Indicadores: plausibilidad, cobertura, presentación | B4 | B5 | Alto (datos almacenados) | Sí (`0043`: `respondida_por`, `observacion`, `min_m`, `max_m`) |
| B7 | Sonda en producción | B5, B6 | — | Medio | No |
| B8 | Configuración de región | B4, B0, D2 | — | **Alto** (contratos internos) | No |
| B9 | Río neutral y jobs por región | B8 | B10 | **Alto** (contratos internos) | No |
| B10 | Interfaz bilingüe y card del hub | B8 | B9 | Medio (migración aditiva en `user`) | Sí (`idioma` en `user`) |
| B10b | Barrido de diccionarios es/pt pendiente (cuerpo de la ficha, helpers de etiquetas, radar y estadísticas). **Bloquea la puesta en marcha de Manaos** | B10 | B11 | Bajo | No |
| B11 | Despliegue de Manaos | B9, B10 | — | **Alto** (entrega) | No |
| B12 | Datos y proveedores de Manaos | B11 | — | Medio | No |
| B13 | Bajante y horizonte estacional | B12 | B14 | Medio | Posible |
| B14 | Acceso fluvial y servicios esenciales | B12 | B13 | Medio | Posible |
| B15 | Calibración | B13, B14 | B16 | Medio | No |
| B16 | Alertas (WhatsApp, SMS, CAP) | B13 | B15 | Alto (externo) | Sí |

---

## B0 — Validación de datos de Manaos (sin código)

**Objetivo:** confirmar que existen los datos mínimos para el piloto antes de invertir en código específico.

| Subtarea | Acción | Entregable |
|---|---|---|
| B0.1 | Descargar el Catálogo de Escolas del INEP para Manaos y municipios ribereños; medir % con coordenadas utilizables | Planilla con conteo por municipio |
| B0.2 | Listar estaciones ANA (SNIRH/HidroWeb) en ríos Negro y Solimões con series disponibles | Lista de estaciones con id, coordenadas y período |
| B0.3 | Confirmar sistema y acceso a niveles del puerto de Manaos del Servicio Geológico de Brasil | Endpoint o contacto confirmado |
| B0.4 | Confirmar licencia de FABDEM para uso gubernamental | Licencia documentada |
| B0.5 | Verificar cobertura de estaciones virtuales (Hydroweb, SWOT) en la zona | Lista de estaciones virtuales |
| B0.6 | Contactar SEDUC-AM y SEMED: padrón de escuelas ribereñas, transporte fluvial, alojamiento de datos (LGPD) | Minuta de reunión |
| B0.7 | Verificar si INMET publica alertas en formato CAP | Endpoint confirmado o descartado |

**CA:**
- CA1: al menos un padrón de escuelas con coordenadas para ≥ 80% de las escuelas del área piloto.
- CA2: al menos una fuente de nivel de río con acceso programático confirmado.
- CA3: definida la jurisdicción de alojamiento de datos.

---

## B1 — Entorno de pruebas

**Objetivo:** que Playwright pueda abrir el mapa, dibujarlo e iniciar sesión con cada rol.

| Subtarea | Acción | Archivos | Reutiliza |
|---|---|---|---|
| B1.1 | Config de Playwright para el mapa, con Chromium incluido (no `channel: 'chrome'`, CI no tiene Chrome) | Nuevo `e2e/mapa-enos/playwright.config.ts` | `e2e/hub-access/playwright.config.mjs:1-41` |
| B1.2 | Runner efímero: copia del workspace, build, base PostgreSQL efímera (contenedor en local, servicio en CI; `DATABASE_URL` con `postgres://`), migraciones, seed, servidor, limpieza | Nuevo `e2e/mapa-enos/run.mjs` | `e2e/hub-access/run.mjs:15-57,87`, `e2e/hub-access/serve.mjs` |
| B1.3 | Mapa base local: interceptar `tiles.openfreemap.org/**` desde Playwright y servir un estilo propio, sin tocar código de producción. Registrar la ruta antes del aislamiento de llamadas externas | Nuevo `e2e/mapa-enos/estilo-prueba.json`, `e2e/mapa-enos/fixtures/base.ts` | `isolateExternalCalls` de `e2e/hub-access/hub-access.spec.ts:36-47` (moverlo al fixture) |
| B1.4 | Banderas en el entorno: `RISK_RADAR_ENABLED`, `HAZARD_CONTEXT_ENABLED`, `SEASONAL_ENABLED`, `SITUACION_ENABLED`, `RISK_ENGINE_ENABLED` en `true`. Proyecto adicional con el radar apagado | `e2e/mapa-enos/run.mjs`, config | `lib/infraestructura/riesgo/flags.ts` |
| B1.5 | Gancho `window.__mapaE2E` (`capasVisibles`, `featuresRenderizadas`, `proyectar`) instalado en `handleMapLoad`, solo si `NEXT_PUBLIC_E2E === 'true'` (se define en el build de prueba) | `components/mapas/map-infraestructura-page.tsx` (~`:1642`, `mapRef` en `:652`) | `lib/infraestructura/mapa/capas.ts` |
| B1.6 | Cuentas QA sembradas (7 cuentas de la tabla 4.2 del plan de pruebas). `director_nivel` con fila en `user_niveles_jur`; operador con `geCueAnexo` | Nuevos `e2e/mapa-enos/cuentas-qa.ts`, `e2e/mapa-enos/seed/cuentas.ts` | `createCredentialUser` de `e2e/hub-access/seed.mjs:19-37`; campos en `lib/db/schema.ts:152-165` |
| B1.7 | Proyecto `setup` que inicia sesión una vez por cuenta (con reintento ante el límite de 3 intentos cada 10 s) y guarda `storageState` | Nuevo `e2e/mapa-enos/setup/auth.setup.ts` | `login()` de `e2e/hub-access/hub-access.spec.ts` |

**CA:**
- CA1: `node e2e/mapa-enos/run.mjs` termina con código 0 sobre una prueba de humo.
- CA2: una captura del mapa no está en blanco y ninguna petición sale del origen.
- CA3: existen 7 archivos de `storageState`; las cuentas sin alcance reciben acceso denegado.
- CA4: `window.__mapaE2E` es una función en el build de prueba y `undefined` en el build de producción (prueba automática).
- CA5: el proyecto con radar apagado muestra la pestaña actual al pedir `#radar`.

---

## B2 — Seed del mapa y contratos de API

**Objetivo:** datos conocidos en la base y respuestas de API fijadas, que fallan ante cualquier cambio.

| Subtarea | Acción | Archivos | Reutiliza |
|---|---|---|---|
| B2.1 | Publicar datasets de referencia (departamentos, máscara, localizaciones, estaciones, geo estático) | Nuevo `e2e/mapa-enos/seed/datasets.ts` | `guardarVersion`/`publicarVersion` (`datasets/repositorio.ts:24,72`), `publicarGeo` (`datasets/geo-static.ts:29`), `datasets/__fixtures__/` |
| B2.2 | Escuelas: ~30 con coordenadas y 2 sin, en 3–4 departamentos; tablas GE | Nuevo `e2e/mapa-enos/seed/escuelas.ts` | `ensureLocalizacionesSeeded` (`localizaciones-seed.ts:37-44`), patrón de `e2e/reportes-offline/seed.mjs:1-40` |
| B2.3 | Partes: vigente, sin actualizar, solucionado reciente, con comedor; una escuela con historial de varios cambios | Nuevo `e2e/mapa-enos/seed/partes.ts` | `crearParte`, `crearAfectacion`, `crearServicioAlcance` (`test-utils/parte-fixtures.ts:13,30,68`) |
| B2.4 | Hidrometría: 3 estaciones, una en alerta, con lecturas. Insertar `hidro_lectura` directo o publicar con versión de catálogo válida (en modo producción `publicarCorridaPrefectura` exige 64 hex, `hidrometria/publicacion.ts:40-42`) | Nuevo `e2e/mapa-enos/seed/hidro.ts` | `hidrometria/__fixtures__/` |
| B2.5 | Corrida de riesgo vigente con escuelas en los 4 niveles | Nuevo `e2e/mapa-enos/seed/riesgo.ts` | `publicarRunOperativo` (`riesgo/publicar-run.ts:27-45`), `riesgo/__fixtures__/motor-api.ts` |
| B2.6 | Radar meteorológico, alerta SMN, lluvia observada, escuelas aisladas y rutas de acceso | Nuevo `e2e/mapa-enos/seed/radar.ts` | `radar-meteo/__fixtures__/smn-cap-*.xml`, `lluvia-estaciones/__fixtures__/` |
| B2.7 | Manifiesto de valores esperados: conteos por nivel, departamento, filtro; estaciones; radar | Nuevo `e2e/mapa-enos/seed/esperados.ts` | — |
| B2.8 | Contratos de API: snapshots JSON con normalización de UUIDs y fechas | Nuevos `e2e/mapa-enos/contratos/{contratos.spec.ts,normalizar.ts,snapshots/}` | Lista de endpoints del plan de pruebas §4.6 |
| B2.9 | Actualizar la expectativa de `hub-access.spec.ts` que hoy espera 503 del dataset de departamentos, si comparte seed | `e2e/hub-access/hub-access.spec.ts` | — |

**CA:**
- CA1: cada endpoint del §4.6 devuelve los valores del manifiesto (`escuelas`, `totales`, `riesgo`, `hidrometria/estaciones`, `radar-meteo/alertas`…).
- CA2: los snapshots están versionados y cambiar un número del seed hace fallar al menos un contrato (mutación observada).
- CA3: el seed usa funciones de la aplicación, sin SQL escrito a mano salvo donde se documente el motivo (B2.4).
- CA4: dos corridas seguidas producen snapshots idénticos.

---

## B3a — E2E: acceso, pestañas, capas, filtros

| Subtarea | Acción | Archivos |
|---|---|---|
| B3a.1 | Agregar `data-testid` faltantes: control de capas, chips de filtros, resultados de búsqueda | `components/mapas/{layer-control,filtros-chips,search-box}.tsx` |
| B3a.2 | `acceso-roles.spec.ts`: las 7 cuentas, anónimo con redirección y vuelta, alcance de `director_nivel`, enlace nominal | Nuevo en `e2e/mapa-enos/specs/` |
| B3a.3 | `pestanas.spec.ts`: hash, alias (`#operativa`, `#evolucion`, `?modo=radar`), radar apagado, mapa montado al cambiar | Nuevo |
| B3a.4 | `capas.spec.ts`: valores por defecto, encender/apagar las 8 capas, persistencia tras recarga, leyenda | Nuevo |
| B3a.5 | `filtros-busqueda.spec.ts`: cada filtro, combinación, quitar chips, búsqueda por nombre y CUE | Nuevo |

**CA:**
- CA1: cada caso del plan de pruebas §5.1–5.4 tiene una prueba.
- CA2: cada prueba afirma valores del manifiesto, no "mayor que 0".
- CA3: cada prueba pasó su prueba de mutación (registrada en el PR).
- CA4: ninguna usa `waitForTimeout`.

## B3b — E2E: popups, ficha, parte

| Subtarea | Acción | Archivos |
|---|---|---|
| B3b.1 | `data-testid` en el popup | `components/mapas/feature-popup.tsx` |
| B3b.2 | `popups-ficha.spec.ts`: clic en escuela vía `proyectar`, popup, navegación a ficha, secciones `#panorama`, `#situaciones`, `#historial`, `#territorio`, sin ubicación, sin situaciones, chips, riesgo, volver al mapa | Nuevo |
| B3b.3 | `parte.spec.ts`: actualizar parte desde la ficha y verificar persistencia en ficha e historial; matriz de permisos. Restaura la base tras escribir | Nuevo |

**CA:** CA1–CA4 de B3a aplicadas a §5.5–5.6, más CA5: las pruebas que escriben no dejan estado para otras pruebas (corrida en orden aleatorio verde).

## B3c — E2E: radar, ríos, riesgo, estadísticas, exportaciones, controles

| Subtarea | Acción | Archivos |
|---|---|---|
| B3c.1 | `data-testid` faltantes | `components/mapas/{escuelas-en-riesgo,escuelas-aisladas,panel-situacion-actual,tarjeta-estacion-rio,capa-lluvia-observada,capa-estaciones-rio,panel-estadisticas}.tsx`, `components/mapas/radar-meteo/alertas-seccion.tsx`, `components/mapas/exportar/` |
| B3c.2 | `radar-rios-lluvia.spec.ts` | Nuevo |
| B3c.3 | `riesgo-aisladas.spec.ts` | Nuevo |
| B3c.4 | `estadisticas-exportar.spec.ts`: contenido del archivo descargado (columnas y filas) | Nuevo |
| B3c.5 | `controles-movil.spec.ts`: zoom, pantalla completa, mapa base, flujo móvil (iPhone 13) | Nuevo |

**CA:** CA1–CA4 de B3a aplicadas a §5.7–5.10.

---

## B4 — CI bloqueante

| Subtarea | Acción | Archivos |
|---|---|---|
| B4.1 | Job `e2e-mapa` en el workflow: mismos pasos de instalación que `lint-typecheck-build`, servicio PostgreSQL con health check, `playwright install --with-deps chromium`, `node e2e/mapa-enos/run.mjs` | `.github/workflows/ci.yml` |
| B4.2 | Filtro por rutas a nivel de job (`app/(hub)/mapas`, `components/mapas`, `lib/infraestructura`, `lib/mapas`, `drizzle`, `e2e/mapa-enos`), sin quedar excluido por `paths-ignore` del workflow | `.github/workflows/ci.yml` |
| B4.3 | Artefactos ante falla: reporte HTML, trazas, capturas | `.github/workflows/ci.yml` |
| B4.4 | Sumar las suites `hub-access` y `reportes-offline` | `.github/workflows/ci.yml` |
| B4.5 | Marcar el job como check requerido en la protección de rama (configuración del repositorio, no del archivo) | Configuración de GitHub |

**CA:**
- CA1: verde en un PR limpio.
- CA2: rojo en un PR con un número del seed alterado a propósito.
- CA3: duración menor a 15 minutos.
- CA4: 10 corridas seguidas sin fallos intermitentes.
- CA5: el merge queda bloqueado si el job falla.

---

## B5 — Indicadores: frescura y volumen

Todas las subtareas siguen el orden: escenario de falla en el seed → prueba en rojo observada → corrección → prueba en verde → escenario sano sigue en verde.

| Subtarea | Indicador | Acción | Archivos | Pruebas |
|---|---|---|---|---|
| B5.1 | I1 | Frescura del encabezado según la corrida de riesgo (`infraRiskRun.publicadoEn` vía `corte.riskRunId`). Sin corte o sin fecha: "no verificable", nunca verde | `situacion/consulta.ts:64-95`, `situacion/corte.ts:201-212`, `components/infraestructura/situacion-client.tsx:17-37,240-251` | `situacion/consulta.test.ts`, `situacion-client.test.tsx` |
| B5.2 | I2 | Llevar `contadores` del último job completado a `EstadoJobRun`; `minimoFilas` por job en `JobEsperado` usando el contador de recibidos; `clasificarJob` devuelve `sin_datos` "0 filas"; columna de filas en la página de operación. Sin mínimo para IMERG (cero es legítimo cuando está al día) | `riesgo/salud.ts:27-37,195-255`, `riesgo/jobs-esperados.ts`, `estado-datos/clasificar.ts:108-159`, `estado-datos/consulta.ts`, `app/(hub)/admin/operacion/page.tsx:82-114` | `clasificar.test.ts`, `jobs-esperados.test.ts`, `salud.test.ts` |
| B5.3 | I3 | `actualizarSaludFuente` rechaza `ok` con 0 filas recibidas (pasa a `degradado`); los llamadores pasan el conteo. El caso "IMERG ya sincronizado" sigue `ok` | `riesgo/jobs/salud-fuente.ts:20-62`, `sync-prefectura-alturas.ts`, `sync-imerg.ts` (~`:470-483`), `sync-pronostico-caudal.ts:246`, `sync-ensemble.ts:278` | Nuevo `salud-fuente.test.ts`; `sync-prefectura-alturas.test.ts` |
| B5.4 | I8 | Separar `pausado` (`ENOS_JOBS_ENABLED=false`, cuenta como problema) de `deshabilitado` (job no programado, no cuenta). Actualizar el comentario de decisión en `cadencias.ts:165-171` | `estado-datos/clasificar.ts:46,118-124`, `components/infraestructura/estado-datos/panel-estado-datos.tsx:12-18,28`, `riesgo/cadencias.ts:161-188` | `clasificar.test.ts`, `panel-estado-datos.test.tsx` |
| B5.5 | — | Escenarios de falla en el seed e2e y prueba e2e del Centro de Situación con `qa-admin` para I1, I2, I3, I8 | `e2e/mapa-enos/seed/escenarios-falla.ts`, `e2e/mapa-enos/specs/centro-situacion.spec.ts` | — |

**CA:**
- CA1: corrida de 7 días con corte nuevo → encabezado "Desactualizado".
- CA2: job completado con 0 filas → `sin_datos` "0 filas", visible en operación.
- CA3: fuente sin filas recibidas → no figura `ok`.
- CA4: `ENOS_JOBS_ENABLED=false` → el resumen no dice "Todos los datos al día".
- CA5: cada uno de los casos anteriores falló con el código previo (rojo registrado en el PR).
- CA6: escenario sano → todo verde; IMERG al día con 0 celdas actualizadas sigue `ok`; Prefectura con lecturas duplicadas sigue `ok`.
- CA7: suite e2e completa y snapshots de B2 sin cambios no explicados.

## B6 — Indicadores: plausibilidad, cobertura y presentación

| Subtarea | Indicador | Acción | Archivos | Migración |
|---|---|---|---|---|
| B6.1 | I4 | Sensor trabado: N lecturas idénticas en `hidro_lectura`. Valor atípico contra mín/máx de 365 días (según D6). Ítem de plausibilidad para INA en estado de datos | `estado-datos/{consulta,clasificar}.ts`, `hidrometria/referencia-repo.ts`, `hidrometria/sync-prefectura-historico.ts` | Sí si D6 = guardar mín/máx (`hidro_referencia.min_m`, `max_m`) |
| B6.2 | I5 | Huecos en la serie IMERG del día, ignorando la latencia de publicación (~4 h) | `estado-datos/{consulta,clasificar}.ts` | No |
| B6.3 | I6 | Exponer `corte.cobertura` y mostrar "Cobertura N%" junto al KPI de riesgo alto. Actualizar snapshots afectados con comando explícito | `situacion-client.tsx:279-281`, `situacion/consulta.ts`, `app/api/infraestructura/situacion/route.ts`, `app/api/infraestructura/__snapshots__/caracterizacion-{a,b}.test.ts.snap` | No |
| B6.4 | I7 | KPI "Fuentes vencidas" con la misma función que el panel (`clasificarFuente`); alinear la página de operación. Cambiar los tres tipos jsonb duplicados | `situacion/corte.ts:37-43,121-132`, `lib/db/schema.ts:1517-1521`, `situacion-client.tsx:23-28`, `app/(hub)/admin/operacion/page.tsx:139-150` | No (cortes viejos con valor por defecto) |
| B6.5 | I9 | Sin corrida vigente: `{ sinRun: true }` y texto "Sin cálculo de riesgo disponible" | `situacion/consulta.ts:64-95,110`, `situacion-client.tsx:142-145`, ruta de situación | No |
| B6.6 | I10 | Estado "Enlace vencido" calculado en el servidor (no importar `verificacion-token.ts` en el cliente: usa `node:crypto`). Registrar quién respondió por enlace. Observación obligatoria en respuesta asistida (400 si falta) | `lib/infraestructura/verificaciones.ts:65-71,473-491`, `components/infraestructura/{verificaciones-cola,verificacion-responder}.tsx`, rutas `responder` y `responder-asistida`, `lib/db/schema.ts` | **Sí** (`respondida_por`, `observacion`) |
| B6.7 | I11 | Vigencia esperada por dataset (`VIGENCIA_DATASET_DIAS`) y estado `atrasado` "publicado hace N días" | `estado-datos/{clasificar,consulta}.ts` | No |
| B6.8 | — | Escenarios de falla y pruebas e2e para I4–I7, I9–I11 | `e2e/mapa-enos/seed/escenarios-falla.ts`, `centro-situacion.spec.ts` | — |

**CA:**
- CA1: 12 lecturas idénticas → "Posible sensor trabado"; lectura fuera de rango → aviso de valor atípico.
- CA2: hueco de 3 h en IMERG → aviso; granulos cada 30 min → sin aviso.
- CA3: corrida con 20% de evidencia → "Cobertura 20%" visible.
- CA4: fuente `degradado` dentro del TTL → KPI y panel la marcan los dos.
- CA5: sin corrida vigente → "Sin cálculo de riesgo disponible".
- CA6: enlace vencido → "Enlace vencido"; respuesta asistida sin observación → 400.
- CA7: dataset fuera de vigencia → aviso con antigüedad.
- CA8: rojo registrado para cada caso antes de corregir; escenario sano en verde.
- CA9: la migración `0043` pasa `migraciones-orden.test.ts`, incluye journal y snapshot, y no modifica datos existentes.
- CA10: la migración se commitea sola (riesgo de datos almacenados) y se prueba sobre una copia de la base de staging.

## B7 — Sonda en producción

| Subtarea | Acción | Archivos |
|---|---|---|
| B7.1 | Registrar el job `sonda-cadena-datos`: nombre válido, función, caso en el despachador y código de salida; entrada en jobs esperados con `tipo`; cadencia. Solo en el rol `productor` (staging consume réplicas) | `scripts/jobs.mjs:35-62,536-615`, `riesgo/jobs-esperados.ts`, `riesgo/cadencias.ts:5,24,111`, `estado-datos/clasificar.ts:56-75`, `providers/rol-entorno.ts` |
| B7.2 | Lógica: escuelas y estaciones testigo desde configuración; verificar edad de corrida y lecturas en lo que devuelve el mapa; comparar última lectura guardada con la publicada por Prefectura usando `descargarAlturasPrefectura` en proceso | Nuevo `lib/infraestructura/sonda/`, reutiliza `hidrometria/prefectura-cliente.ts:145,172`, `prefectura-parser.ts`, `estaciones-prefectura.ts:52` |
| B7.3 | Resultado en `infra_job_run.contadores` y `errorSaneado` | — |
| B7.4 | Ítem `sonda:cadena` en estado de datos; línea "Cadena de datos verificada a las HH:MM" en el encabezado; fila en operación | `estado-datos/consulta.ts:30-86`, `situacion-client.tsx`, `app/(hub)/admin/operacion/page.tsx` |
| B7.5 | Tarea programada en Coolify (no systemd: el timer de Prefectura no está instalado) y entrada en el runbook | `docs/ejecucion-enos/OPS1/runbook-scheduler.md` |

**CA:**
- CA1: con datos sanos, el indicador muestra la hora de la última verificación.
- CA2: con una escuela testigo inexistente, el job falla y el indicador queda en rojo (rojo observado primero).
- CA3: con lectura guardada distinta de la publicada, el indicador lo reporta.
- CA4: en staging (rol consumidor) la sonda no consulta Prefectura.
- CA5: pruebas de consistencia de `jobs-esperados.test.ts` y `cadencias.test.ts` en verde.

---

## B8 — Configuración de región

**Regla:** batch de riesgo alto. Se commitea y revisa solo. Se acepta únicamente si los snapshots de B2 quedan idénticos.

| Subtarea | Acción | Archivos |
|---|---|---|
| B8.1 | Esquema zod de región, cargador `regionActiva()` (sin `REGION` → `corrientes`; id desconocido o JSON inválido → falla) y validación al arrancar (según D2). Nombre de variable `REGION` (no confundir con `OBS_REGION`, ya usado) | Nuevos `lib/infraestructura/region/`, `config/regiones/corrientes.json`, `instrumentation.ts` |
| B8.2 | Límite geográfico único desde la región | `riesgo/geo-perfil.ts:27-30`, `riesgo/providers/imerg.ts:82-85`, `lib/mapas/departamentos.ts:28-31`, `lib/reorganizacion/ruta-osrm.ts:20`, `components/mapas/capa-lluvia-observada.tsx:53`, `radar-meteo/verificacion.ts:158` |
| B8.3 | Vista inicial y límites del mapa por props desde el layout. Decidir si natalidad, reorganización y matrícula (`map-natalidad-page.tsx`, `map-reorganizacion-page.tsx`, `lib/map-types.ts:167`) reciben región o se declaran solo-Corrientes | `components/mapas/map-infraestructura-page.tsx:793,1007-1024,1727-1730`, `app/(hub)/mapas/infraestructura/layout.tsx` |
| B8.4 | `ubicacionEnCorrientes` → `ubicacionEnRegion`, con dataset de unidades administrativas por región y tolerancia desde la configuración | `radar-meteo/departamentos.ts:73-74`, `parte-mapa.ts:137,807,842,1040`, `departamento-centroides.ts:11` |
| B8.5 | Eliminar el control fijo de 25 departamentos y nombres de archivo fijos de máscara y departamentos | `lib/mapas/renaper-natalidad.ts:24`, `lib/mapas/departamentos.ts:19,51`, `scripts/regenerar-mascara-corrientes.mjs`, `scripts/extract-natalidad.mjs:53` |
| B8.6 | `GRID_VERSION` = `` `${region.id}-0.2-v1` `` (para Corrientes da el mismo valor) | `radar-meteo/grilla.ts:3` |
| B8.7 | Huso horario y locale desde la región, en los ~14 archivos con `America/Argentina/Buenos_Aires` y los que usan `es-AR` para fechas (los de formato numérico pueden quedar) | `lib/archivo-metadata.ts:18`, `lib/exportaciones/libro-institucional.ts:12`, `radar-meteo/{resumen,verificacion,ensemble,escuela,alertas-agrupadas}.ts`, `hidrometria/lecturas-repo.ts:170,583`, `veredicto/traza-texto.ts:28`, `estado-datos/clasificar.ts:91`, `presentacion/textos-dato.ts:2`, `riesgo/resumen-escuela.ts:43` |
| B8.8 | Etiquetas de departamentos, estaciones y ríos desde datos de referencia; fallback `region.nombre` | `mapa/etiquetas.ts:21-34`, `riesgo/explicar-snapshot.ts:58-71`, `components/mapas/radar-meteo/alertas-seccion.tsx:34` |
| B8.9 | Pruebas de región y regresión | Nuevas junto a `region/`; snapshots de B2 |

Orden: B8.1 → (B8.2, B8.6, B8.7, B8.8 en paralelo) → B8.3, B8.4, B8.5 → B8.9.

**CA:**
- CA1: pruebas de `regionActiva()`: válido, desconocido falla, sin valor = Corrientes, JSON inválido falla.
- CA2: pruebas de `ubicacionEnRegion()` dentro, fuera y en el borde.
- CA3: `GRID_VERSION === 'corrientes-0.2-v1'` afirmado en una prueba.
- CA4: `grep -rn "America/Argentina" lib app components` solo encuentra la configuración.
- CA5: no quedan literales de límites de Corrientes fuera de `config/regiones/corrientes.json`.
- CA6: **snapshots de B2 idénticos** y suite e2e verde sin modificar ninguna prueba.
- CA7: etiquetas de Corrientes idénticas byte a byte.

## B9 — Río neutral y jobs por región

**Regla:** riesgo alto; commit y revisión solos; snapshots de B2 idénticos.

| Subtarea | Acción | Archivos |
|---|---|---|
| B9.1 | `PuertoRioPrefectura` → `PuertoNivelRio`; estados `normal`, `alerta`, `evacuacion`, `bajante` (se mantiene `evacuacion`, que hoy aparece en 18 archivos; `bajante` se agrega sin uso hasta B13) | `riesgo/motor/puertos.ts:182,194,217,235`, `motor/calculo.ts:326-327,385,406`, `motor/config.ts:25`, `motor/__fixtures__/puertos-fake.ts:12,29` |
| B9.2 | Traducción de Prefectura al formato neutral solo en el adaptador | `motor/adaptadores/rio-prefectura.ts:520`, `motor/rio-prefectura.ts` |
| B9.3 | Registro de proveedores por id, seleccionado por `fuentesRio` de la región (no confundir con `adaptadores-ingesta/puertos.ts` ni `briefing-ia/puertos.ts`) | `riesgo/jobs/compartido-riesgo.ts:77-106,195-199`, `jobs/calcular-riesgo.ts:66,165`, `jobs/calcular-riesgo-v04.ts:58,161` |
| B9.4 | Casos especiales de `pna-corrientes` a `estacionAncla`; evidencia de sequía a datos por región | `motor/altura-critica.ts:55`, `motor-v04/escenarios-estacion.ts:38`, `motor/evidencia-seco-s2.ts:20-125` |
| B9.5 | Filtro por región en jobs esperados y rechazo en el despachador, sin campo `aplicaA` (ver desviación a) | `riesgo/jobs-esperados.ts:24,116,124`, `providers/rol-entorno.ts:18`, `scripts/jobs.mjs:34-63` |

**Desviaciones respecto del plan (registradas en implementación):**
- (a) Sin campo `aplicaA` en los objetos de job. La aplicabilidad se deriva del nombre del job y de `fuentesRio` de la región: `sync-prefectura-*` requiere `prefectura` e `sync-ina-*` requiere `ina`. Una prueba de paridad compara `jobs-esperados.ts` con `scripts/jobs.mjs`. El despachador rechaza con código de salida 2 y el mensaje `job <id> does not apply to region <id>`.
- (b) El registro genérico de proveedores vive en `motor/proveedores-rio.ts`. El registro concreto de `prefectura` está en `jobs/compartido-riesgo.ts`, porque CA1 prohíbe importar Prefectura desde `motor/`. `ina` se declara en `FUENTES_RIO_FUERA_DEL_MOTOR`. `ana` y `sgb` lanzan `proveedor de río no implementado` hasta B12.
- (c) La fila de calibración de `pna-corrientes` se mantiene como dato, porque la tabla cubre otras 13 estaciones. Su alcance se fija por id de región en lugar de por `estacionAncla`. El helper neutral `valorAmenazaRio` vive en `motor/nivel-rio.ts`.

**CA:**
- CA1: el motor no importa nada de Prefectura fuera del adaptador (verificable por búsqueda de imports).
- CA2: tabla de traducción de estados Prefectura → neutral cubierta por prueba.
- CA3: lista de jobs de Corrientes idéntica a la actual; la de una región de prueba sin Prefectura excluye `sync-prefectura-*` y `sync-ina-*`.
- CA4: `scripts/jobs.mjs` rechaza con código de salida 2 y el mensaje `job <id> does not apply to region <id>` un job que no aplica a la región.
- CA5: **snapshots de B2 idénticos** y suite e2e verde.

## B10 — Interfaz bilingüe y card del hub

**Decisiones (aprobadas 12/11/2026):**
- **Nombre del producto:** "ENOS 2026" → "ENOS Corrientes", aprobado por el dueño del producto. Se aplica a toda etiqueta visible del producto: título de la card, rótulos de navegación y sección, `aria-label` de la barra de pestañas del mapa y nombres de las pruebas e2e de acceso al hub. Los ids internos, slugs y rutas no cambian.
- **Selector de idioma:** aparece solo en regiones con dos o más entradas en `idiomas` (por ejemplo, Manaos `['pt','es']`). Corrientes (`['es']`) y el hub nunca lo muestran; lo fija una prueba.
- **Prueba e2e de cambio a portugués:** se traslada a B11, porque corre contra un despliegue local con `REGION=manaos` (Corrientes no tiene selector). B10 la cubre con pruebas unitarias y de proveedor.
- **Card "ENOS Manaos":** se crea solo si la variable de entorno `ENOS_MANAOS_URL` es una URL `https`. El enlace externo se permite únicamente para ese id de recurso (lista de permitidos), no como política general de URL externas. Su `ruta` es esa URL.
- **Migración de idioma (D4):** `0058_usuario_idioma`, columna `user.idioma` nullable.
- **Estado de CA3 (diccionarios):** `es` y `pt` están tipados. Migrado: `lib/copy/didactica`, pestañas y modos, panel de capas, leyenda, vista previa de escuela y encabezado de la ficha. Pendiente: barrido del resto de componentes (cuerpo de las secciones de la ficha; helpers de etiquetas en `lib` como `ETIQUETA_ESTADO_CLASES`, `ETIQUETA_NIVEL_RIESGO` y `TITULO_LEYENDA_VISTA`; etiquetas de `BASEMAPS`; etiquetas de accesos del control de capas; componentes de radar y estadísticas). Se registra como seguimiento que debe cerrarse antes de que Manaos salga en producción.

| Subtarea | Acción | Archivos |
|---|---|---|
| B10.1 | Diccionarios `es` y `pt` tipados (según D3), empezando por `lib/copy/didactica.ts` y luego los textos de componentes del mapa; locale de MapLibre por idioma | `lib/copy/`, `components/mapas/`, `map-infraestructura-page.tsx` (`LOCALE_MAPLIBRE_ES`) |
| B10.2 | Idioma por defecto desde `region.locale`; selector de idioma con persistencia (según D4) | `app/(hub)/mapas/infraestructura/layout.tsx`, `lib/db/schema.ts` si D4 = columna |
| B10.3 | Card actual: título "ENOS 2026" → "ENOS Corrientes". Nueva card "ENOS Manaos" con enlace al otro despliegue (según D5) | `lib/infraestructura/recurso-seed.ts:8,22,32`, `lib/db/seed.ts`, `resource-href.ts` |
| B10.4 | Clasificar la nueva card en la sección de infraestructura | `lib/hub-sections.ts:25,85` |
| B10.5 | Constante única para la ruta `/mapas/infraestructura` | `lib/hub-entry-server.ts:57,60`, `lib/acl.ts:38`, `lib/infraestructura/acceso-lectura.ts:17,41`, `lib/access/hub-confinement.ts:43`, layout y `escuelas/[cue]/page.tsx` |

**CA:**
- CA1: suite e2e verde en español sin modificar pruebas.
- CA2: movido a B11 (prueba e2e de cambio a portugués con `REGION=manaos`). En B10, el cambio de idioma queda cubierto por pruebas unitarias y de proveedor, incluida la regla de selector solo con dos o más idiomas.
- CA3: no quedan textos de interfaz del mapa fuera de los diccionarios (prueba que recorre los componentes o revisión con búsqueda). Abierto: barrido pendiente listado en las decisiones de esta sección.
- CA4: la card "ENOS Corrientes" aparece en la sección de infraestructura; la card "ENOS Manaos" aparece solo si `ENOS_MANAOS_URL` es `https`, y abre esa URL.
- CA5: pruebas de `hub-sections`, `hub-entry-server` y ACL en verde.

## B11 — Despliegue de Manaos

**Regla:** riesgo alto (entrega); commit y revisión solos.

| Subtarea | Acción | Archivos |
|---|---|---|
| B11.1 | Confirmar que la imagen no fija `REGION` y lo lee en tiempo de ejecución | `Dockerfile:68,79` |
| B11.2 | `config/regiones/manaos.json` (límites, `America/Manaus`, `pt-BR`, fuentes `ana`/`sgb`/`inmet`) | Nuevo |
| B11.3 | Script `region:cargar <id>` que publica los datasets de referencia de una región | Nuevo en `scripts/`, entrada en `package.json` |
| B11.4 | Prueba de contrato: todo `config/regiones/*.json` valida, sus datasets están declarados y sus proveedores registrados | Nueva junto a `lib/infraestructura/region/` |
| B11.5 | Plantilla de despliegue por región (aplicación, base, scheduler, secretos) y runbook con `REGION` y las tareas de Manaos | `docs/ejecucion-enos/OPS1/runbook-scheduler.md` (secciones `:49`, `:85`, `:186`), `deploy/` |
| B11.6 | Secretos por despliegue: `DATABASE_URL`, `OPEN_METEO_API_KEY`, `EARTHDATA_TOKEN`, `OPENROUTER_API_KEY`, `RIESGO_DATOS_ROL` | Gestor de secretos |
| B11.7 | Instanciar Manaos en la jurisdicción definida en B0 | Infraestructura |

**CA:**
- CA1: la misma imagen corre Corrientes (`REGION=corrientes` o sin variable) y Manaos (`REGION=manaos`).
- CA2: la prueba de contrato de regiones pasa para ambas.
- CA3: Manaos responde con el mapa vacío pero sano, y el Centro de Situación muestra honestamente que no hay datos (gracias a B5–B6).
- CA4: Corrientes no cambia: snapshots de B2 idénticos y suite e2e verde.
- CA5: el runbook documenta cómo crear una región nueva de punta a punta.
- CA6: prueba e2e de cambio a portugués (movida desde B10) que verifica textos de pestañas, leyenda y ficha, corrida contra un despliegue local con `REGION=manaos`.

**Estado de implementación (B11):**
- Hecho: `config/regiones/manaos.json` (límites provisionales, pendientes de B0), `pnpm region:cargar <id>`, prueba de contrato de regiones, plantilla `deploy/regiones/`, runbook `docs/ejecucion-enos/OPS1/runbook-nueva-region.md` y prueba e2e local `pnpm test:e2e:region` (CA6 incluida).
- Ajustes derivados de la prueba con base vacía: `estacionAncla` opcional, `datasetsPendientes`/`cargaDatasets` en el esquema, mapa montado aunque falle la geografía, acceso a Prefectura restringido por región, y arranque abortado con `process.exit(1)` si `REGION` es inválida.
- Pendiente fuera de B11: B10b (arriba), marca institucional de Corrientes fija en la cabecera del hub, jobs `sync-smn-alertas`, `sync-synop-lluvia` e `importar-exposicion-rio-dem` aún no excluidos por regla (ver `deploy/regiones/scheduler-jobs.md`), y secretos adicionales a los de B11.6.
- Bloqueantes de puesta en marcha de Manaos (no afectan a Corrientes), a resolver en B10b/B12:
  - (a) La leyenda de Prefectura ("Estações da Prefeitura", evacuação/alerta) aparece en Manaos; debe seguir `fuentesRio` de la región.
  - (b) Restos en español en la vista portuguesa: panel "SITUACIÓN ACTUAL", "Ver provincia", "Veredicto diario", "Pantalla completa", "Ninguna escuela...".
  - (c) El área del mapa se ve sin mapa base en la captura; resuelto: no es un defecto. Con 8 s de espera, Corrientes y Manaos muestran el mismo mapa base (OpenFreeMap); la captura inicial se tomó antes de que cargaran las teselas. Observación abierta para B12: con la base vacía ambas regiones abren centradas en (0, 0) (Golfo de Guinea), y el encuadre por región solo aplica cuando hay datos.
  - (d) La marca institucional de la cabecera del hub está fija en Corrientes.
  - (e) Catálogo sin scope en `lecturas-repo.ts:210`, `MAP_CENTER` de map-matricula, jobs `sync-smn-alertas`/`sync-synop-lluvia`/`importar-exposicion-rio-dem`, y secretos adicionales a B11.6.
- Evidencia del `COPY config` del Dockerfile (`39346b44`): aceptada sin bajar la imagen. El builder copia todo el repositorio (`COPY . .`), `.dockerignore` no excluye `config/` y el runner hace `COPY --from=builder /app/config ./config`; un `COPY --from` de una ruta inexistente rompe el build, y "Publish GHCR image" terminó bien en `4d6277f0` (B9 en dev). La verificación directa con `docker pull` no fue posible: el token de `gh` no tiene el scope `read:packages`.

---

## B12 — Datos y proveedores de Manaos

| Subtarea | Acción |
|---|---|
| B12.1 | Datasets de Manaos: padrón INEP, municipios IBGE, estaciones ANA; carga con `region:cargar manaos` |
| B12.2 | Adaptador ANA/SGB al puerto `PuertoNivelRio` y su job de sincronización (aplicable a Manaos por `fuentesRio`, sin campo `aplicaA`). Hasta este batch, `ana` y `sgb` lanzan `proveedor de río no implementado` (ver B9, desviación b) |
| B12.3 | Adaptador de alertas INMET (CAP si B0.7 lo confirma) |
| B12.4 | Perfil territorial con FABDEM en lugar de Copernicus DEM para la región |
| B12.5 | Seed e2e de Manaos, manifiesto de esperados y snapshots propios; correr la suite e2e con `REGION=manaos` |

**CA:**
- CA1: las escuelas del área piloto aparecen en el mapa de Manaos con riesgo de inundación calculado.
- CA2: niveles de río de Manaos actualizados según su cadencia y visibles en el Centro de Situación con indicadores en verde reales (frescura, volumen, cobertura).
- CA3: suite e2e de Manaos verde en CI.
- CA4: Corrientes sin cambios (snapshots idénticos).

## B13 — Bajante y horizonte estacional

| Subtarea | Acción |
|---|---|
| B13.1 | Umbrales de nivel mínimo por estación (navegabilidad) en datos de referencia |
| B13.2 | Estado `bajante` en el puerto y su nivel de amenaza con la misma escala de severidad |
| B13.3 | Índices ENOS de NOAA (Niño 3.4 / ONI) como fuente y señal estacional |
| B13.4 | Horizonte de 30 a 90 días en el motor y en la interfaz |
| B13.5 | Pruebas con datos de 2023 y 2024 |

**CA:**
- CA1: los eventos de 2023 y 2024 aparecen como bajante severa con los datos históricos.
- CA2: la crecida de 2021 sigue apareciendo como inundación.
- CA3: Corrientes sin cambios en horizontes 24/72/240 h.

## B14 — Acceso fluvial y servicios esenciales

| Subtarea | Acción |
|---|---|
| B14.1 | Red fluvial (OSM y datos de SEDUC-AM) como dataset |
| B14.2 | Aislamiento por tramo no navegable según el nivel previsto |
| B14.3 | Servicios esenciales: salud (CNES en Brasil, REFES en Argentina), comisarías, bomberos, farmacias, Defensa Civil (OSM y registros oficiales) |
| B14.4 | En la ficha: servicio más cercano de cada tipo, distancia o tiempo de viaje y si el acceso queda cortado |
| B14.5 | Pruebas e2e de la ficha con servicios y acceso cortado |

**CA:**
- CA1: una escuela sembrada con tramo no navegable aparece aislada.
- CA2: la ficha muestra el servicio más cercano de cada tipo con su distancia, para ambas regiones.
- CA3: un servicio con acceso cortado se marca como tal.

## B15 — Calibración

| Subtarea | Acción |
|---|---|
| B15.1 | Procesar Global Surface Water y Sentinel-1 para 2021 y 2023–2024 (servicio de procesamiento satelital bajo demanda) |
| B15.2 | Cruzar áreas con agua y escuelas; tabla de escuelas afectadas por evento |
| B15.3 | Ajustar umbrales y pesos de Manaos; documentar el método |

**CA:**
- CA1: tabla de escuelas afectadas por evento versionada.
- CA2: métrica de acierto del modelo (escuelas afectadas detectadas) antes y después del ajuste, documentada.
- CA3: los umbrales nuevos viven en configuración de región, no en código.

## B16 — Alertas

| Subtarea | Acción |
|---|---|
| B16.1 | Verificación de la organización en Meta Business y plantillas aprobadas en español y portugués |
| B16.2 | Registro de destinatarios con consentimiento (migración) |
| B16.3 | Envío por WhatsApp con SMS de respaldo; registro de entregas |
| B16.4 | Generación de alertas en formato CAP como información de apoyo |
| B16.5 | Pruebas con proveedor simulado; prueba real con destinatarios internos |

**CA:**
- CA1: solo reciben alertas destinatarios con consentimiento registrado.
- CA2: si WhatsApp falla, se envía SMS y queda registrado.
- CA3: las alertas CAP validan contra el esquema CAP 1.2.
- CA4: ninguna alerta se presenta como oficial.

---

## Salida a producción (agregado 12/11/2026)

Pedido del dueño del producto (12/11/2026): "sale la pestaña metodología, pero parece que aun no esta terminado. Necesitamos crear las tareas en coolify, ademas arreglar esa fuga de seguridad, y lo que falta para manaos y salir en vivo debe estar todo tambien. Asi que extiende el plan con lo necesario, y vamos a ir hasta staging ahora".

Dos frentes. **Corrientes:** B1–B11 llegan a staging y después a prod. **Manaos:** todo lo que falta para salir en vivo, desde la validación de datos hasta la operación.

### Mapa de dependencias

```
Dev:         P1, P4, M1, M2 ─► P2 (staging) ─► P3 (Coolify) ─► P5 (prod)
             P6 (Metodología, sin fecha)

Manaos:      M0 (decisiones y datos, dueño) ─┬─► M1 (interfaz pt) ─┐
                                              ├─► M2 (región limpia) ─┼─► B12 ─► M3 (infraestructura) ─► M4 (salida en vivo)
                                              └───────────────────────┘          B13–B16 después de M4
```

| Batch | Nombre | Depende de | Responsable | Riesgo |
|---|---|---|---|---|
| P1 | Correcciones previas a staging | B11 | Agente | Alto (seguridad) |
| P2 | Promoción a staging de B1–B11 y de todo lo de este plan que ya esté en dev | P1, P4, M1, M2 en dev | Agente; el dueño aprueba los cambios visibles | Alto (entrega, migraciones) |
| P3 | Tareas programadas en Coolify | P2 | Dueño, o agente con acceso autorizado | Medio (entrega) |
| P4 | Pendientes del repositorio | — | Agente y dueño | Bajo |
| P5 | Promoción a prod | P2, P3; aprobación explícita | Agente | Alto (entrega, migraciones) |
| P6 | Terminar la pestaña Metodología | Definición del dueño | Agente | Bajo |
| M0 | Decisiones y datos de Manaos (B0) | — | Dueño | — |
| M1 | Interfaz en portugués completa (B10b ampliado) | B10 | Agente | Bajo |
| M2 | Región sin supuestos de Corrientes | B11 | Agente | Medio |
| M3 | Infraestructura de Manaos | M0, M1, M2, B12 | Dueño y agente | Alto (entrega, secretos) |
| M4 | Salida en vivo de Manaos | M3 | Dueño | Alto |

---

### P1 — Correcciones previas a staging

| Subtarea | Acción | Estado |
|---|---|---|
| P1.1 | Ocultar la pestaña Metodología: no está terminada. Se quita el botón de la barra; el panel sigue disponible por `#metodologia`, como en prod | Hecho en `chore/enos-pre-staging` |
| P1.2 | `listarVerificaciones` deja de devolver `tokenHash`. La página `/admin/verificaciones` lo serializaba al navegador. Staging y prod tienen la misma fuga | Hecho, con prueba en rojo previa y verificación independiente |

**CA:**
- CA1: la barra del mapa muestra Situación actual, Radar, Planificación, Capas, Estadísticas y Exportar; `#metodologia` sigue abriendo el panel.
- CA2: ninguna fila de `listarVerificaciones` tiene la clave `tokenHash`. La prueba falla si se revierte el cambio.
- CA3: suite e2e del mapa y pruebas de verificaciones en verde.

### P2 — Promoción a staging

**Orden (decisión del dueño, 12/11/2026):** "igual el promote a staging es recien cuando esté el plan extendido terminado en dev". P2 empieza cuando P1, P4 (partes del agente), M1 y M2 estén en dev. Lo que depende del dueño o de datos externos (P3, P6, M0, B12, M3, M4) no bloquea P2.

Rama `promote/enos-b1-b11-staging`, cortada de `origin/staging`, con `git cherry-pick -x` de los commits de los PR #260, #264, #265, #267, #274 y #281 a #286 (57 commits), más P1.2. El PR #280 (sincronización main → dev) no se incluye.

**Decisiones de la promoción:**
- **`ee38606f` no se incluye.** Agregaba la prueba e2e del botón de Metodología, que staging no tiene. Por la misma razón, P1.1 no hace falta en staging.
- **Pestañas del mapa:** se conservan los `data-testid` nuevos y no se agrega el botón de Metodología.
- **`components/cuadernillos/request-list.tsx`:** staging ya lo había eliminado, y se mantiene eliminado.
- **`sync-pronostico-caudal.test.ts`:** se conservan los dos bloques de pruebas.
- **Archivos tocados por ENOS:** iguales a los de dev, salvo esos tres puntos.
- **Migraciones:** `0057` y `0058` se aplican después de la `0056` de staging, porque los `when` son crecientes.
- **Jobs:** el único job nuevo es `sonda-cadena-datos`. No se renombra ninguno.

| Subtarea | Acción |
|---|---|
| P2.1 | tsc, lint, `vitest --changed origin/staging` y suite e2e del mapa completa sobre la rama |
| P2.2 | PR a `staging` con merge commit; "Publish GHCR image" en verde; `https://staging.analisis.sistemas.mec.gob.ar/api/health` responde `{"ok":true}` |
| P2.3 | Confirmar en la base de staging que `0057` y `0058` se aplicaron (`drizzle.__drizzle_migrations`). El health en verde no lo prueba |
| P2.4 | Revisar staging con una sesión: card "ENOS Corrientes", barra sin Metodología, Centro de Situación y cola de verificaciones |

**Cambios visibles que llegan a staging (aprobados o a confirmar):**
- **Centro de Situación** (aprobado): frescura, volumen, plausibilidad, cobertura y fila de la sonda.
- **Renombre** a "ENOS Corrientes" en la card, la navegación, las etiquetas de admin y el `aria-label` de las pestañas (aprobado).
- **Cola de verificaciones** (B6, a confirmar):
  - muestra "Enlace vencido";
  - la respuesta asistida exige una observación y sin ella devuelve 400.

**Efecto esperado:** hasta que exista la tarea de P3, el Centro de Situación de staging muestra la sonda como "Nunca corrió".

### P3 — Tareas programadas en Coolify

Se crean por cada entorno que corre jobs (staging y prod). Los comandos y cron salen de `deploy/regiones/scheduler-jobs.md` y del runbook `docs/ejecucion-enos/OPS1/runbook-scheduler.md`.

| Tarea | Comando | Cron | Condición |
|---|---|---|---|
| Sonda de la cadena de datos | `node scripts/jobs.mjs sonda-cadena-datos` | `41 * * * *` | — |
| Veredicto diario | `node scripts/jobs.mjs veredicto-diario` | `45 0,6,12,18 * * *` | `AI_VEREDICTO_ENABLED=true` |
| Cierre del veredicto | `node scripts/jobs.mjs veredicto-cierre` | `30 3 * * *` | — |

**CA:**
- CA1: en el panel de operación, `sonda-cadena-datos` corrió y salió bien en la hora siguiente.
- CA2: el encabezado del Centro de Situación muestra "Cadena de datos verificada a las HH:MM".
- CA3: la zona horaria del cron de Coolify está confirmada y anotada en el runbook.
- CA4: las escuelas testigo (1800643-00, 1801605-04, 1801131-00) y las estaciones (pna-corrientes, pna-paso-de-los-libres) existen con datos en el entorno; si no, se ajustan con `SONDA_ESCUELAS_TESTIGO` y `SONDA_ESTACIONES_TESTIGO`.

**Acceso:** el agente no tiene credenciales de Coolify. El dueño crea las tareas, o autoriza explícitamente el destino, la operación y la credencial a usar.

### P4 — Pendientes del repositorio

| Subtarea | Acción | Responsable |
|---|---|---|
| P4.1 | Actualizar el snapshot del catálogo de `/api/hub/admin` (`app/api/caracterizacion.test.ts`, falta `planificacion-territorial`) | Agente |
| P4.2 | Revisar las 4 pruebas de hub-access que ya fallaban en `main` (`hub-access.spec.ts:171`, `:255`, `reportes-offline.spec.ts:351`): regresión real o prueba desactualizada | Agente |
| P4.3 | Marcar `e2e-mapa` como check requerido en la protección de las ramas | Dueño |
| P4.4 | Marcar los incidentes de GitGuardian 39981436, 39981437 y 39992761 como credencial de prueba | Dueño |
| P4.5 | `obtenerVerificacion` también devuelve `tokenHash`; hoy no llega al cliente, pero conviene una proyección sin ese campo | Agente |
| P4.6 | Alinear dev con staging en archivos que staging ya eliminó (por ejemplo `components/cuadernillos/request-list.tsx`) | Agente |

### P5 — Promoción a prod

Igual que P2, desde `origin/prod`. Requiere la aprobación explícita del dueño y P3 hecho en prod.

**Diferencia con staging:** prod no tiene la migración `0054`. Hay que verificar el orden del journal de prod antes de promover.

P1.2 puede adelantarse a prod como hotfix aislado, porque la fuga existe hoy en prod.

### P6 — Terminar la pestaña Metodología

La pestaña queda oculta hasta que se termine. Antes de reintroducir el botón, el dueño define qué le falta: contenido, secciones y fuentes. Al reintroducirla, se actualizan juntas la prueba unitaria de las pestañas y la prueba e2e de `pestanas.spec.ts`.

---

### M0 — Decisiones y datos de Manaos (dueño)

Es el B0 de este plan más las decisiones de operación. Sin M0 no se instancia nada.

| Subtarea | Decisión o entregable |
|---|---|
| M0.1 | B0.1–B0.7 completos: padrón INEP con coordenadas, estaciones ANA, niveles del puerto (SGB), licencia FABDEM, estaciones virtuales, contacto SEDUC-AM y SEMED, alertas INMET |
| M0.2 | Jurisdicción del alojamiento de datos (LGPD) y proveedor: el mismo Coolify u otro |
| M0.3 | Dominio público de Manaos (define `ENOS_MANAOS_URL` para la card del hub de Corrientes) |
| M0.4 | Límites definitivos del área piloto (reemplazan los provisionales de `config/regiones/manaos.json`) |
| M0.5 | Marca institucional de la cabecera de Manaos: logo, nombre y organismo |
| M0.6 | Usuarios iniciales y quién administra el despliegue |

### M1 — Interfaz en portugués completa

Amplía B10b. Bloquea la salida en vivo.

| Subtarea | Acción |
|---|---|
| M1.1 | Barrido de diccionarios pendiente de B10: cuerpo de las secciones de la ficha, `ETIQUETA_ESTADO_CLASES`, `ETIQUETA_NIVEL_RIESGO`, `TITULO_LEYENDA_VISTA`, etiquetas de `BASEMAPS`, accesos del control de capas, radar y estadísticas |
| M1.2 | Restos en español vistos en Manaos: panel "SITUACIÓN ACTUAL", "Ver provincia", "Veredicto diario", "Pantalla completa", "Ninguna escuela..." |
| M1.3 | Centro de Situación y panel de operación en portugués |
| M1.4 | Prueba que recorre los componentes del mapa y falla si queda un texto visible fuera de los diccionarios (B10 CA3) |

**CA:**
- CA1: con `REGION=manaos`, la prueba e2e de cambio a portugués recorre pestañas, leyenda, ficha, radar, estadísticas y Centro de Situación sin textos en español.
- CA2: Corrientes sin cambios (snapshots idénticos, e2e en verde).

### M2 — Región sin supuestos de Corrientes

| Subtarea | Acción |
|---|---|
| M2.1 | La leyenda de Prefectura sigue `fuentesRio` de la región: no aparece en Manaos |
| M2.2 | Marca de la cabecera del hub por región (M0.5) |
| M2.3 | Vista inicial con la base vacía: centrar en los límites de la región, no en (0, 0) |
| M2.4 | Catálogo con scope por región en `lecturas-repo.ts:210` y `MAP_CENTER` de map-matricula |
| M2.5 | Regla de aplicabilidad para `sync-smn-alertas`, `sync-synop-lluvia` e `importar-exposicion-rio-dem` (hoy no se excluyen por región) |
| M2.6 | Comportamiento de `sonda-cadena-datos` sin Prefectura |

**CA:**
- CA1: con `REGION=manaos` y la base vacía, el mapa abre en el área de Manaos y no muestra elementos de Corrientes.
- CA2: un job que no aplica a Manaos sale con código 2.
- CA3: Corrientes sin cambios.

### B12–B16

Sin cambios: datos y proveedores de Manaos (B12), bajante (B13), acceso fluvial (B14), calibración (B15) y alertas (B16). **B12 es requisito de M3:** sin padrón ni niveles de río, Manaos sale vacío. B13–B16 pueden seguir después de la salida en vivo.

### M3 — Infraestructura de Manaos

Sigue `docs/ejecucion-enos/OPS1/runbook-nueva-region.md` y `deploy/regiones/`.

| Subtarea | Acción | Responsable |
|---|---|---|
| M3.1 | Aplicación de Coolify con la misma imagen y `REGION=manaos`, base Postgres propia y dominio de M0.3 | Dueño, o agente con acceso autorizado |
| M3.2 | Secretos: los de B11.6 (`DATABASE_URL`, `OPEN_METEO_API_KEY`, `EARTHDATA_TOKEN`, `OPENROUTER_API_KEY`, `RIESGO_DATOS_ROL`) más `NOMINAL_ENCRYPTION_KEY`, `ADMIN_PASSWORD`, `MATRICULA_DNI_SECRET`, `DATASET_SALT_E7B`, `AI_API_KEY`, `OBS_*` y `GE_SSO_API_KEY`. Valores nuevos, nunca copiados de Corrientes | Dueño |
| M3.3 | Carga de datos: `pnpm region:cargar manaos` con los datasets de B12 | Agente |
| M3.4 | Tareas programadas de la tabla "Manaos" de `deploy/regiones/scheduler-jobs.md`, más las de los proveedores de B12. Las marcadas "revisar" o "no programar" esperan a M2.5 | Dueño, o agente con acceso autorizado |
| M3.5 | Monitoreo y backup de la base, igual que Corrientes | Dueño |
| M3.6 | `ENOS_MANAOS_URL` en Corrientes, solo cuando Manaos esté en vivo: hace visible la card "ENOS Manaos" en el hub | Dueño |

### M4 — Salida en vivo de Manaos

**Criterios de salida:**
- Suite e2e de Manaos (B12 CA3) y de Corrientes en verde en CI.
- El Centro de Situación de Manaos muestra datos reales y frescos, con la sonda en verde durante 48 h.
- Interfaz sin textos en español (M1 CA1).
- Secretos propios, backup probado y runbook revisado.
- Aprobación explícita del dueño.

---

## Criterios comunes a todos los batches

- Pruebas y documentación en el mismo batch que el comportamiento.
- Suite e2e y CI en verde (desde B4).
- Desde B8: snapshots de Corrientes idénticos, salvo cambios pedidos y explicados en el PR.
- Sin archivos temporales ni cachés de prueba en el repositorio.
- Cada PR indica qué criterios de aceptación cubre y cómo se verificó cada uno.
