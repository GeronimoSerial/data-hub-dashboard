# Base técnica de Ríos: cobertura real, contratos de monitoreo/historia y API de series

Fecha: 16 de octubre de 2026 · Estado: base técnica implementada y verificada (insumos para las secciones de monitoreo, marquee e historia de Ríos).
Referencias: [Plan por batches](2026-10-16-plan-batches-ui-infraestructura.md) y [Propuesta de refactorización](2026-10-16-refactor-ui-mapa-infraestructura.md).

---

## 1. Alcance y límites respetados

Esta entrega implementa exclusivamente la base de datos consultable, los contratos de dominio/calidad, el endpoint histórico por estación y su batería de pruebas para habilitar las secciones de monitoreo e historia de Ríos (Batches 5, 6 y 7) sin tocar la interfaz ni interferir con la mejora incremental sobre `/mapas/infraestructura`:

- **Archivos creados o editados dentro del alcance:**
  - [`lib/infraestructura/hidrometria/estado-altura.ts`](../lib/infraestructura/hidrometria/estado-altura.ts): incorpora `evaluarLecturaMonitoreo` y `evaluarPuntoHistorico` (junto con sus tipos `CalidadLectura`, `CalidadPuntoHistorico`, `VariacionPublicadaEvaluada`, `EvaluacionMonitoreoLectura` y `EvaluacionPuntoHistorico`), conservando intacta la firma y semántica de `estadoAltura` y `EDAD_MAXIMA_LECTURA_HORAS = 18`.
  - [`lib/infraestructura/hidrometria/lecturas-repo.ts`](../lib/infraestructura/hidrometria/lecturas-repo.ts): incorpora `obtenerEstacionCatalogo`, `validarConsultaHistoriaEstacion` y `consultarHistoriaEstacion` (con sus tipos y constantes `RANGO_MAXIMO_HISTORIA_DIAS = 90` y `LIMITE_MAXIMO_LECTURAS_HISTORIA = 2500`), manteniendo sin cambios `guardarLecturasPrefectura`, `ultimaLecturaEstacion` y `hashLecturaOriginal`.
  - [`app/api/infraestructura/hidrometria/estaciones/[id]/lecturas/route.ts`](../app/api/infraestructura/hidrometria/estaciones/[id]/lecturas/route.ts): nueva ruta `GET` estrictamente de solo lectura (no invoca `ensureSeeded` ni realiza escrituras), protegida con `verificarAccesoLectura`, `respuestaAccesoDenegado` y `jsonNoStore`.
  - [`lib/infraestructura/hidrometria/estado-altura.test.ts`](../lib/infraestructura/hidrometria/estado-altura.test.ts), [`lib/infraestructura/hidrometria/lecturas-repo.test.ts`](../lib/infraestructura/hidrometria/lecturas-repo.test.ts) y [`app/api/infraestructura/hidrometria/estaciones/[id]/lecturas/route.test.ts`](../app/api/infraestructura/hidrometria/estaciones/[id]/lecturas/route.test.ts): pruebas unitarias y de integración sobre base efímera PGlite (`usarDbTemporal`).
- **Archivos preservados sin modificaciones:**
  - `app/api/infraestructura/hidrometria/estaciones/route.ts` y `app/api/infraestructura/hidrometria/estado/route.ts`
  - `lib/db/schema.ts`, `lib/db/seed.ts`, migraciones e ingestas (`sync-prefectura-alturas.ts`, `sync-prefectura-historico.ts`)
  - Componentes UI, controles del mapa, planes fuente, CSS y configuración del proyecto.

---

## 2. Verificación Read-Only de cobertura real en base de datos (`hub_dev`)

### 2.1 Identificación de fuente y transacción

Se verificó directamente la base de desarrollo configurada en el entorno local mediante una sesión PostgreSQL con `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` (sin ejecutar migraciones, seeds ni escrituras, y sin exponer credenciales):

- **Driver:** `postgres` (`node-postgres`)
- **Base de datos identificada:** `hub_dev` (puerto `5432`, modo `transaction_read_only = on`)
- **Instante real de verificación:** `2026-10-16T21:24:25.735-03:00` en hora local (`America/Argentina/Buenos_Aires`), equivalente a **`2026-10-17T00:24:25.735Z` en UTC**.
  - *Nota técnica sobre el campo diagnóstico `verificadoUtc`:* en la consulta de inspección se evaluó `NOW() AT TIME ZONE 'UTC'`, que en PostgreSQL devuelve un `timestamp without time zone` (`2026-10-17 00:24:25.735`). El parser de `node-postgres` interpreta todo `timestamp without time zone` en el huso local del proceso (`UTC-3`) y al serializarlo con `.toISOString()` suma otras 3 horas (`2026-10-17T03:24:25.735Z`). El instante UTC verdadero de la consulta fue `2026-10-17T00:24:25.735Z` (`21:24:25-03:00`).
- **Alcance de la evidencia:** refleja el estado real de la base de desarrollo `hub_dev` obtenido por consulta propia; la cobertura en producción dependerá de la antigüedad del cron `sync-prefectura-alturas` en ese entorno.

### 2.2 Resumen global verificado

| Tabla | Métrica verificada | Valor observado en `hub_dev` |
|---|---|---|
| `hidro_lectura` | Estaciones distintas con lecturas | `21` (las 21 estaciones de `CATALOGO_ESTACIONES_PREFECTURA`) |
| `hidro_lectura` | Total de filas almacenadas | `402` |
| `hidro_lectura` | Rango global de `medida_en` (UTC) | `2026-10-13T15:00:00.000Z` a `2026-10-16T21:00:00.000Z` |
| `hidro_lectura` | Rango global de `capturada_en` (UTC) | `2026-10-13T20:46:27.640Z` a `2026-10-16T22:02:10.034Z` |
| `hidro_lectura` | Filas marcadas `inconsistente = true` | `0` |
| `hidro_lectura` | Filas con `alerta_m IS NULL` o `evacuacion_m IS NULL` | `0` |
| `hidro_lectura` | Valores de `fuente` | `["prefectura"]` |
| `hidro_referencia` | Filas de estadística anual (`ventana_dias = 365`) | `18` (únicamente estaciones con `rol = 'corrientes'`; las 3 de `contexto-aguas-arriba` no tienen fila) |
| `hidro_referencia` | Rango muestral y tamaño `n` (`fuente = 'prefectura-historico'`) | `2025-10-15T15:00:00.000Z` a `2026-10-15T09:00:00.000Z`, con `n` entre `676` y `763` |

### 2.3 Cobertura exacta por estación en `hidro_lectura`

La consulta directa de solo lectura sobre `hidro_lectura` muestra dos regímenes claros de frecuencia en las 21 estaciones del catálogo:
- **11 estaciones de mayor frecuencia (13 a 37 puntos, entre 74,0 h y 78,0 h cubiertas):** `pna-libertador` (37), `pna-ituzaingo` (36), `pna-paso-de-los-libres` (35), `pna-yapeyu` (34), `pna-iguazu` (33), `pna-bompland` (32), `pna-alvear` (31), `pna-la-cruz` (31), `pna-corrientes` (24), `pna-itati` (23) y `pna-paso-de-la-patria` (13).
- **10 estaciones de baja frecuencia (6 a 8 puntos en 72,0 h, cadencia de 12 h o 24 h):** `pna-garruchos` (8), `pna-mocoreta` (8), `pna-monte-caseros` (8), `pna-posadas` (8), `pna-santo-tome` (8), `pna-esquina` (7), `pna-goya` (7), `pna-ita-ibate` (7), `pna-bella-vista` (6, con brecha máxima de `24,0 h`) y `pna-empedrado` (6, con brecha máxima de `24,0 h`):

| Estación (`estacion_id`) | Rol | Lecturas (`n`) | Primera medición (`MIN(medida_en)`) | Última medición (`MAX(medida_en)`) | Horas cubiertas | Brecha mín / máx (h) | Huecos `> 18 h` |
|---|---|---:|---|---|---:|---|---|
| `pna-alvear` | `corrientes` | 31 | `2026-10-13T19:00:00.000Z` | `2026-10-16T21:00:00.000Z` | 74,0 h | 2,0 h / 6,0 h | Ninguno |
| `pna-bella-vista` | `corrientes` | 6 | `2026-10-13T15:00:00.000Z` | `2026-10-16T15:00:00.000Z` | 72,0 h | 12,0 h / 24,0 h | Sí (`24,0 h`) |
| `pna-bompland` | `corrientes` | 32 | `2026-10-13T17:00:00.000Z` | `2026-10-16T21:00:00.000Z` | 76,0 h | 2,0 h / 6,0 h | Ninguno |
| `pna-corrientes` | `corrientes` | 24 | `2026-10-13T18:00:00.000Z` | `2026-10-16T21:00:00.000Z` | 75,0 h | 3,0 h / 6,0 h | Ninguno |
| `pna-empedrado` | `corrientes` | 6 | `2026-10-13T15:00:00.000Z` | `2026-10-16T15:00:00.000Z` | 72,0 h | 12,0 h / 24,0 h | Sí (`24,0 h`) |
| `pna-esquina` | `corrientes` | 7 | `2026-10-13T15:00:00.000Z` | `2026-10-16T15:00:00.000Z` | 72,0 h | 12,0 h / 12,0 h | Ninguno |
| `pna-garruchos` | `corrientes` | 8 | `2026-10-13T15:00:00.000Z` | `2026-10-16T15:00:00.000Z` | 72,0 h | 2,0 h / 12,0 h | Ninguno |
| `pna-goya` | `corrientes` | 7 | `2026-10-13T15:00:00.000Z` | `2026-10-16T15:00:00.000Z` | 72,0 h | 12,0 h / 12,0 h | Ninguno |
| `pna-iguazu` | `contexto-aguas-arriba` | 33 | `2026-10-13T19:00:00.000Z` | `2026-10-16T21:00:00.000Z` | 74,0 h | 2,0 h / 6,0 h | Ninguno |
| `pna-ita-ibate` | `corrientes` | 7 | `2026-10-13T15:00:00.000Z` | `2026-10-16T15:00:00.000Z` | 72,0 h | 12,0 h / 12,0 h | Ninguno |
| `pna-itati` | `corrientes` | 23 | `2026-10-13T15:00:00.000Z` | `2026-10-16T21:00:00.000Z` | 78,0 h | 1,0 h / 12,0 h | Ninguno |
| `pna-ituzaingo` | `corrientes` | 36 | `2026-10-13T17:00:00.000Z` | `2026-10-16T21:00:00.000Z` | 76,0 h | 2,0 h / 6,0 h | Ninguno |
| `pna-la-cruz` | `corrientes` | 31 | `2026-10-13T17:00:00.000Z` | `2026-10-16T21:00:00.000Z` | 76,0 h | 2,0 h / 8,0 h | Ninguno |
| `pna-libertador` | `contexto-aguas-arriba` | 37 | `2026-10-13T19:00:00.000Z` | `2026-10-16T21:00:00.000Z` | 74,0 h | 2,0 h / 4,0 h | Ninguno |
| `pna-mocoreta` | `corrientes` | 8 | `2026-10-13T15:00:00.000Z` | `2026-10-16T15:00:00.000Z` | 72,0 h | 2,0 h / 12,0 h | Ninguno |
| `pna-monte-caseros` | `corrientes` | 8 | `2026-10-13T15:00:00.000Z` | `2026-10-16T15:00:00.000Z` | 72,0 h | 2,0 h / 12,0 h | Ninguno |
| `pna-paso-de-la-patria` | `corrientes` | 13 | `2026-10-13T15:00:00.000Z` | `2026-10-16T21:00:00.000Z` | 78,0 h | 2,0 h / 12,0 h | Ninguno |
| `pna-paso-de-los-libres` | `corrientes` | 35 | `2026-10-13T17:00:00.000Z` | `2026-10-16T21:00:00.000Z` | 76,0 h | 2,0 h / 6,0 h | Ninguno |
| `pna-posadas` | `contexto-aguas-arriba` | 8 | `2026-10-13T15:00:00.000Z` | `2026-10-16T15:00:00.000Z` | 72,0 h | 2,0 h / 12,0 h | Ninguno |
| `pna-santo-tome` | `corrientes` | 8 | `2026-10-13T15:00:00.000Z` | `2026-10-16T15:00:00.000Z` | 72,0 h | 2,0 h / 12,0 h | Ninguno |
| `pna-yapeyu` | `corrientes` | 34 | `2026-10-13T17:00:00.000Z` | `2026-10-16T21:00:00.000Z` | 76,0 h | 2,0 h / 6,0 h | Ninguno |

---

## 3. Contrato de últimas lecturas vs. separación de nivel, calidad y variación publicada

### 3.1 Preservación de la respuesta actual (`GET /api/infraestructura/hidrometria/estaciones`)

La ruta actual `app/api/infraestructura/hidrometria/estaciones/route.ts` y la función `estadoAltura(lectura, opciones)` no se modificaron para no romper a `CapaEstacionesRio` ni a ningún consumidor vigente.

Sin embargo, en la respuesta actual de `estadoAltura`, una lectura vigente con `inconsistente: true` devuelve `estado: 'sin_dato'`, pero calcula `tendencia` directamente sobre `variacionM` (`'crece' | 'baja' | 'estable'`). Si una interfaz consume ese campo sin verificar `lectura.inconsistente` o `lecturaVencida`, puede dibujar una flecha de tendencia engañosa sobre una medición defectuosa.

### 3.2 Nuevo evaluador puro `evaluarLecturaMonitoreo` (`lib/infraestructura/hidrometria/estado-altura.ts`)

Para los Batches 5 y 6 (y para normalizar la respuesta de `estaciones/route.ts` en el cliente sin romper el contrato existente), `evaluarLecturaMonitoreo(lectura, opciones)` separa tres ejes ortogonales:

1. **`estadoNivel` (`'evacuacion' | 'alerta' | 'normal' | 'sin_dato'`):**
   - Clasifica únicamente cuando la lectura está vigente (`<= 18 h`), no es inconsistente, tiene `lecturaM !== null` y cuenta con al menos un umbral (`alertaM` o `evacuacionM`).
   - En cualquier otro caso devuelve `'sin_dato'` (nunca presenta una falla ni la ausencia de umbrales como `'normal'`).
2. **`calidad` (`'vigente' | 'vencida' | 'inconsistente' | 'sin_umbrales' | 'sin_lectura'`):**
   - Explicita la causa exacta cuando no hay clasificación normal:
     - `'sin_lectura'`: estación sin fila en `hidro_lectura` o con `lecturaM === null` (sin flag de inconsistencia).
     - `'inconsistente'`: fila marcada por el parser (`lectura_cero_con_crece`, `sin_lectura_con_estado`, `lectura_con_estado_sin_dato`, etc.).
     - `'vencida'`: antigüedad superior a `EDAD_MAXIMA_LECTURA_HORAS` (`18 h`).
     - `'sin_umbrales'`: medición vigente y consistente, pero sin `alertaM` ni `evacuacionM` publicados.
     - `'vigente'`: medición dentro de las 18 h, consistente y con umbrales disponibles.
3. **`variacionPublicada` (`{ variacionM, periodoHoras, estadoPublicado, tendencia, confiable }`):**
   - Expone los valores crudos publicados por Prefectura (`variacionM`, `periodoHoras`, `estadoPublicado`), pero fija `confiable = true` únicamente cuando `!inconsistente && !vencida && lecturaM !== null && variacionM !== null`.
   - Cuando `confiable === false`, fuerza `tendencia: 'sin_dato'` para impedir que se dibuje una flecha activa sobre datos inconsistentes o vencidos.
   - Cuando `calidad === 'sin_umbrales'` y la lectura es reciente y consistente con `variacionM !== null`, conserva `confiable: true` y `tendencia: 'crece' | 'baja' | 'estable'` aunque `estadoNivel` sea `'sin_dato'`.

---

## 4. Contrato y especificación de la API histórica de lecturas

### 4.1 Ruta, carácter Read-Only y parámetros

- **Endpoint:** `GET /api/infraestructura/hidrometria/estaciones/[id]/lecturas`
- **Solo lectura estricto:** el handler ejecuta primero `verificarAccesoLectura()` y luego `consultarHistoriaEstacion(getDb(), ...)`. **No invoca `ensureSeeded()` ni ejecuta inserciones o upserts en ninguna tabla.**
- **Autorización:** `verificarAccesoLectura()` + `respuestaAccesoDenegado(acceso)` (`401` sin sesión, `403` sin permiso o sin recurso `/mapas/infraestructura` registrado).
- **Cabeceras de respuesta:** `Cache-Control: private, no-store` en todas las respuestas (`200`, `400`, `404`) mediante `jsonNoStore`.
- **Parámetros:**
  - `id` (path): identificador de estación (`^[a-z0-9-]+$`, máx. 80 caracteres), validado contra `CATALOGO_ESTACIONES_PREFECTURA`.
    - Formato inválido -> `400` (`codigo: "estacion_id_invalido"`).
    - Estación inexistente en el catálogo -> `404` (`codigo: "estacion_no_encontrada"`).
  - `desde` y `hasta` (query, obligatorios): timestamps ISO-8601 con zona horaria explícita (`Z` u offset `±HH:MM`, p. ej. `2026-10-13T12:00:00-03:00` o `2026-10-13T15:00:00.000Z`).
    - Ausentes, sin zona horaria, no interpretables o con `desde > hasta` -> `400` (`codigo: "rango_invalido"`).
    - Rango `hasta - desde > 90 días` (`RANGO_MAXIMO_HISTORIA_DIAS = 90`) -> `400` (`codigo: "rango_excesivo"`).
  - `limite` (query, opcional): entero entre `1` y `2500` (`LIMITE_MAXIMO_LECTURAS_HISTORIA`, valor por defecto `2500`).
    - Valor no entero, `< 1` o `> 2500` -> `400` (`codigo: "limite_invalido"`).

### 4.2 Compatibilidad de drivers de base de datos

La consulta en `consultarHistoriaEstacion` (`lib/infraestructura/hidrometria/lecturas-repo.ts`) normaliza `desde` y `hasta` a formato canónico UTC (`Date.prototype.toISOString()`) y utiliza exclusivamente constructores tipados de Drizzle (`and`, `eq`, `gte`, `lte`, `asc`, `count`, `min`, `max`) sobre `PgDatabase<PgQueryResultHKT, typeof schema>`. Funciona sin SQL específico de driver tanto en `postgres` (`node-postgres`) como en `pglite` (`@electric-sql/pglite`), aprovechando el índice único compuesto `hidro_lectura_estacion_medida_uidx (estacion_id, medida_en)`.

### 4.3 Ejemplo de respuesta (`200 OK`, sin datos sensibles)

```json
{
  "estacion": {
    "estacionId": "pna-bella-vista",
    "nombre": "BELLA VISTA",
    "rio": "parana",
    "rol": "corrientes",
    "idHistorico": 160,
    "lat": -28.505997,
    "lon": -59.050133,
    "coordenadasVerificadas": false,
    "catalogoVersion": "estaciones-prefectura-v2"
  },
  "rangoSolicitado": {
    "desde": "2026-10-13T00:00:00.000Z",
    "hasta": "2026-10-16T21:00:00.000Z",
    "horasSolicitadas": 93,
    "limiteAplicado": 2500
  },
  "umbrales": {
    "alertaM": 6.0,
    "evacuacionM": 6.5,
    "referenciaMedidaEn": "2026-10-16T15:00:00.000Z",
    "variaronEnVentana": false
  },
  "cobertura": {
    "sinLecturas": false,
    "totalEnVentana": 6,
    "puntosDevueltos": 6,
    "limiteAplicado": 2500,
    "truncada": false,
    "primeraMedidaEn": "2026-10-13T15:00:00.000Z",
    "ultimaMedidaEn": "2026-10-16T15:00:00.000Z",
    "horasCubiertas": 72,
    "brechaMinHoras": 12,
    "brechaMaxHoras": 24,
    "huecos": [
      {
        "desdeMedidaEn": "2026-10-14T03:00:00.000Z",
        "hastaMedidaEn": "2026-10-15T03:00:00.000Z",
        "duracionHoras": 24
      }
    ],
    "disponibleEstacion": {
      "totalLecturas": 6,
      "primeraMedidaEn": "2026-10-13T15:00:00.000Z",
      "ultimaMedidaEn": "2026-10-16T15:00:00.000Z",
      "horasDisponibles": 72
    }
  },
  "calidad": {
    "totalPuntos": 6,
    "puntosValidos": 6,
    "puntosInconsistentes": 0,
    "puntosSinUmbrales": 0,
    "puntosSinLectura": 0,
    "cantidadHuecos": 1,
    "umbralHuecoHoras": 18
  },
  "fuente": {
    "codigo": "prefectura",
    "nombre": "Prefectura Naval Argentina (PNA)",
    "tabla": "hidro_lectura",
    "unidadAltura": "m",
    "zonaHorariaReferencia": "America/Argentina/Buenos_Aires",
    "edadMaximaVigenciaHoras": 18,
    "notaReferenciaAnual": "Las estadísticas de hidro_referencia son agregados anuales (p10, mediana, p90) y nunca se interpolan como puntos de la serie."
  },
  "lecturas": [
    {
      "medidaEn": "2026-10-13T15:00:00.000Z",
      "capturadaEn": "2026-10-13T20:46:27.640Z",
      "fuente": "prefectura",
      "lecturaM": 2.98,
      "alertaM": 6.0,
      "evacuacionM": 6.5,
      "estadoNivel": "normal",
      "calidad": "valida",
      "inconsistente": false,
      "motivosInconsistencia": [],
      "variacionPublicada": {
        "variacionM": 0.02,
        "periodoHoras": 12,
        "estadoPublicado": "CRECE",
        "lecturaAnteriorM": 2.96,
        "medidaAnteriorEn": "2026-10-13T03:00:00.000Z",
        "tendencia": "crece",
        "confiable": true
      },
      "brechaDesdeAnteriorHoras": null,
      "huecoPrevio": false
    }
  ]
}
```

### 4.4 Garantías del contrato histórico

- **Orden temporal estable:** `ORDER BY medida_en ASC, id ASC`.
- **Observaciones reales sin interpolación ni extrapolación:** solo se devuelven filas existentes en `hidro_lectura`. Los intervalos sin mediciones mayores a `18 h` (`UMBRAL_HUECO_HORAS_DEFAULT`) se informan en `cobertura.huecos` y mediante `huecoPrevio: true` y `brechaDesdeAnteriorHoras` en el punto siguiente, para que el gráfico del Batch 7 corte el trazo sin inventar continuidad.
- **Separación estricta respecto de `hidro_referencia`:** los percentiles anuales (`p10M`, `medianaM`, `p90M`) nunca se consultan ni se mezclan como puntos de la serie temporal.
- **Sin truncamiento silencioso:** la consulta pide `limite + 1` filas; si existen más observaciones que `limite`, establece `cobertura.truncada = true` y calcula `cobertura.totalEnVentana` mediante `COUNT(*)` exacto sobre la ventana.
- **Ventana sin lecturas (`sinLecturas: true`):** responde `200 OK` con `lecturas: []` y expone en `cobertura.disponibleEstacion` el rango real histórico que sí posee la estación en `hidro_lectura`, permitiendo a la UI distinguir entre una estación sin historia cargada y una consulta fuera del rango cubierto.

---

## 5. Verificaciones ejecutadas

Se ejecutó la suite de pruebas de hidrometría completa (unitarias + repositorio PGlite + rutas API):

```bash
npx vitest run lib/infraestructura/hidrometria/ app/api/infraestructura/hidrometria/
```

- **Resultado:** `12` archivos de prueba aprobados (`153` tests en total, `0` fallos).
- **Cobertura de casos verificada:**
  - `lib/infraestructura/hidrometria/estado-altura.test.ts` (31 tests): compatibilidad total de `estadoAltura` + pruebas de `evaluarLecturaMonitoreo` y `evaluarPuntoHistorico` (bloqueo de tendencia en lecturas inconsistentes o vencidas, conservación de variación confiable en lecturas `sin_umbrales`, separación de `estadoNivel: 'alerta'` con `tendencia: 'baja'`).
  - `lib/infraestructura/hidrometria/lecturas-repo.test.ts` (18 tests): compatibilidad de `guardarLecturasPrefectura` y `ultimaLecturaEstacion` + validación de catálogo/rango/límite en `validarConsultaHistoriaEstacion` + orden cronológico, detección de huecos `> 18 h`, separación de calidad, truncamiento explícito y no contaminación desde `hidro_referencia` en `consultarHistoriaEstacion`.
  - `app/api/infraestructura/hidrometria/estaciones/[id]/lecturas/route.test.ts` (14 tests): ejecuta `verificarAccesoLectura` real contra la BD efímera PGlite (`usarDbTemporal`) verificando `401` sin sesión, `403` sin permiso al recurso `/mapas/infraestructura`, `403` cuando el recurso no está sembrado (comprobando que `GET` no invoca `ensureSeeded` ni escribe en `recursos`, `infra_periodo` ni `hidro_lectura`), `400` por formato/rango/límite inválido, `400` por rango `> 90d`, `404` por estación fuera de catálogo y `200` con serie ordenada, huecos y `Cache-Control: private, no-store`.

---

## 6. Pendientes documentados para conectar en los Batches 5, 6 y 7

Para respetar los límites de archivos de este encargo paralelo, quedan listos para conectarse en sus entregas correspondientes:

1. **Batch 5 (Monitoreo de estaciones en `Ríos`) y Batch 6 (`Marquee`):**
   - Consumir `/api/infraestructura/hidrometria/estaciones` pasando cada `estacion.lectura` por `evaluarLecturaMonitoreo(estacion.lectura)` (o exponer el objeto `monitoreo` directamente en `app/api/infraestructura/hidrometria/estaciones/route.ts` cuando se habilite editar esa ruta en el Batch 5) para mostrar por separado `estadoNivel`, `calidad` y `variacionPublicada.tendencia` (ocultando flechas cuando `variacionPublicada.confiable === false`).
   - Opcional en Batch 5: si se desea mostrar los percentiles anuales (`p10M`, `medianaM`, `p90M`) como banda o nota de referencia en la tabla/ficha de estación (para las 18 estaciones con `rol = 'corrientes'`), leerlos con `obtenerReferencias(db, 365)` de `lib/infraestructura/hidrometria/referencia-repo.ts` como metadato estático claramente rotulado.
2. **Batch 7 (Gráfico de evolución histórica de alturas):**
   - Conectar el selector de estación y de ventana (`7d`, `30d`, `90d`) a `GET /api/infraestructura/hidrometria/estaciones/[id]/lecturas?desde=...&hasta=...`.
   - Cortar la línea del gráfico cuando `lectura.huecoPrevio === true` o `lectura.calidad === 'inconsistente'` / `'sin_lectura'`, usando `cobertura.huecos` y `cobertura.disponibleEstacion` para informar el rango real observado (~72 a 78 h actualmente en `hub_dev`).
   - Dibujar las líneas horizontales de referencia únicamente cuando `umbrales.alertaM !== null` y `umbrales.evacuacionM !== null`, indicando si `umbrales.variaronEnVentana === true`.
    - Si se requiere disponer de curvas completas de 30 o 90 días desde el primer día en lugar de esperar la acumulación horaria de `sync-prefectura-alturas`, programar un backfill puntual de observaciones hacia `hidro_lectura` en una tarea de datos separada (actualmente `sync-prefectura-historico` solo persiste los agregados anuales en `hidro_referencia`).
