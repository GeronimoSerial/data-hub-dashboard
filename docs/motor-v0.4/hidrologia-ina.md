# Hidrología INA A5: catálogo y serie diaria (Motor v0.4, U3a)

## Catálogo de estaciones

`lib/infraestructura/hidrometria/ina/catalogo-a5.ts`, versión `CATALOGO_A5_VERSION` (`ina-a5-2026-10-17.1`). Una entrada por estación Prefectura con `rol = 'corrientes'` (18), emparejada con `estaciones-prefectura` por identificador histórico PNA (`id_externo` en A5). Nunca se empareja por cercanía.

| Campo | Origen |
|---|---|
| `a5EstacionId`, `a5IdExterno`, `rioA5` | `GET /a5/obs/puntual/estaciones?tabla=alturas_prefe` |
| `a5SerieAlturaDiariaId`, `historiaDesde` | `GET /a5/obs/puntual/series?red_id=10&var_id=2` (var 2, medición directa) |
| `ceroIgnM` + `motivoSinCero` | `cero_ign` de A5 (m IGN) |
| `alertaM`, `evacuacionM`, `aguasBajasM` | `nivel_alerta`, `nivel_evacuacion`, `nivel_aguas_bajas` de A5 |
| `kmRio` + `fuenteKmRio` / `motivoSinKm` | Boletín SSPVN 2024-06-27 (tramo Esquina–Confluencia) |
| `datumCero` | siempre `IGN_historico_supuesto` |
| `fuentes` | URL y fecha de captura (2026-10-17) |

Cobertura al 2026-10-17:

- **Con cero y km:** Corrientes (42,39 m; km 1208), Empedrado (39,68; 1140), Bella Vista (34,74; 1057), Goya (29,67; 972), Esquina (22,03; 853).
- **Con cero, sin km** (fuera del boletín): Itá Ibaté (52,42), Itatí (45,66).
- **Con km, sin cero:** Paso de la Patria (km 1240).
- **Sin cero ni km:** Ituzaingó y todo el Uruguay (Garruchos, Santo Tomé, Alvear, La Cruz, Yapeyú, Paso de los Libres, Bompland, Monte Caseros, Mocoretá).

`compararCatalogoConA5` compara una respuesta fresca de A5 con el catálogo y lista diferencias (cero, umbrales, río, estación ausente). No sobrescribe nada: un cambio se revisa y se publica como versión nueva.

### Cómo pedir los ceros faltantes

- **INA (SIyAH)**, administrador de A5: cero IGN de Ituzaingó, Paso de la Patria y las escalas del Uruguay, y su datum.
- **SSPVN / Dirección de Vías Navegables**: km de río de Itatí, Itá Ibaté e Ituzaingó (Alto Paraná) y nivelación de escalas.
- **EBY (Yacyretá)**: cero y nivelación de Ituzaingó e Itá Ibaté.
- **CARU / Prefectura**: escalas del río Uruguay.

### Datum

Se supone IGN histórico (SRVN71), sin verificar. Las cotas escolares están en SRVN16 (aprox.). La diferencia se registra como incertidumbre y no se corrige.

## Serie diaria

- Tablas (migración 0026): `hidro_lote_crudo` (payload A5 inmutable, PK sha256 de `JSON.stringify(payload)`) y `hidro_serie_diaria` (PK `estacion_id, fecha, fuente`; `fecha` local `YYYY-MM-DD`, UTC-3 fijo).
- Repetidas en una misma fecha local: se conserva la de menor `timestart` y, si empatan, la de menor id.
- Reejecutar no crea filas ni cambia valores o fechas. Un valor distinto para una fecha guardada se informa como discrepancia y no se sobrescribe.
- Lectura para el modelo: `leerSerieDiaria(db, estacionId, asOf)`, inclusive hasta `asOf`; nunca devuelve fechas posteriores.

## Presupuesto de solicitudes

Configuración en `CONFIG_FUENTES.inaA5`: ventana de 3.650 días (~3.650 filas por solicitud), timeout 30 s, 2 intentos, máximo 300 solicitudes por corrida. El backfill de las 18 series (desde 1901–2006) son ~200 solicitudes; una corrida incremental, 18 (solape de 7 días). Si se agota el presupuesto, el estado es `parcial` y la próxima corrida sigue desde la última fecha guardada.

## Ejecutar

```bash
node scripts/jobs.mjs sync-ina-serie-diaria
```

Job no programado (`habilitado: false`); respeta el interruptor global de jobs. La primera corrida hace el backfill completo; las siguientes son incrementales. Una estación que falla no detiene las demás y la salud de la fuente `ina-a5` se actualiza en `hazard_source_health`.

## Pronósticos (calibrados 499 y 289)

| Calibrado | Nombre A5 | Variable | Soporte | Qualifiers | Paso |
|---|---|---|---|---|---|
| 499 | `parana_estacional_sissa` | `Hms` altura media semanal, m | `semanal_media` (25 series), `diario` (`Hmd`: Zárate, Atucha) | `main`, `p10`, `p90` | semanal |
| 289 | `tabprono_central` | `H` altura hidrométrica, m | `instantaneo` (timeSupport 0) | `inferior`, `medio`, `superior` | semanal |

- Catálogo de series: `ina/series-pronostico-a5.ts`, versión `SERIES_PRONOSTICO_VERSION` (`ina-a5-pronostico-2026-10-17.1`), resuelto con `/a5/obs/puntual/series?id=…` porque las corridas llegan con `metadata: null`.
- Estaciones propias cubiertas: 499 → Itá Ibaté, Itatí, Paso de la Patria, Corrientes, Empedrado, Bella Vista, Goya, Esquina; 289 → Corrientes, Goya. Ituzaingó y el Uruguay no tienen pronóstico. El resto conserva los ids A5 con `estacion_id` nulo.
- Todas las alturas son metros sobre el cero de la escala local, salvo Atucha (red `na-sa`, referencia `desconocida`). Las series 34881–34883 de 499 no están publicadas en A5: se guardan con variable, unidad y estación nulas y soporte `desconocido`. Una serie fuera del catálogo se guarda igual, sin estación, y el job la informa en `seriesDesconocidas`.

### Qué no se infiere

- `p10/p90` e `inferior/medio/superior` se guardan como etiquetas. No se derivan probabilidades ni se suponen cuantiles para `inferior/superior`.
- Una media semanal nunca se convierte en pico diario. `timestart = timeend` en 499 no significa muestra instantánea: manda el soporte del catálogo.
- No se interpola entre pasos semanales de 289.

### Almacenamiento

- Migración 0027: `hidro_ina_corrida` (PK `cal_id, cor_id`; `forecast_date`, `descargado_en`, `lote_sha256` → `hidro_lote_crudo`) y `hidro_ina_pronostico` (único por `cor_id, series_id, timestart, timeend, qualifier`; `qualifier` nulo permitido).
- En `hidro_lote_crudo`, los lotes de calibrado usan `fuente = 'ina-a5-calibrado'` y `serie_id = cal_id`.
- Una emisión ya guardada no se vuelve a guardar: ni lote, ni valores, ni cambio de `forecast_date`. Filas repetidas dentro de un payload conservan la primera.
- Lectura: `leerUltimaCorridaIna(db, calId, asOf)` devuelve la corrida con mayor `forecast_date <= asOf`. Una emisión vieja descargada después no pasa a ser la más nueva.

### Archivo histórico

Sin autenticación A5 sólo entrega la última corrida (`/sim/calibrados/{id}/corridas/last`); `corridas_guardadas` requiere `cookieAuth` (289 tiene 73 corridas 2022-03 → 2024-06; 499, ninguna). Para evaluar con emisiones pasadas hay que pedir acceso a INA. Hasta entonces el archivo se arma descargando hacia adelante.

### Presupuesto y ejecución

Una solicitud por calibrado (2 por corrida del job), timeout y reintentos de `CONFIG_FUENTES.inaA5`. Con 4 consultas por día son 8 solicitudes diarias. Un calibrado que falla no detiene el otro; la salud de `ina-a5-pronostico` se actualiza best-effort.

```bash
node scripts/jobs.mjs sync-ina-pronostico
```

Job no programado (`habilitado: false`, intervalo previsto 6 h).
