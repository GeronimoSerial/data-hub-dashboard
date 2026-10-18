// Módulo ÚNICO de configuración por fuente externa (E3a → consolidación).
// SÓLO declaraciones de constantes/objetos: no contiene lógica, no hace red y
// no lee `process.env` (los nombres de env var se documentan acá, su lectura
// sigue ocurriendo hoy en cada módulo de origen).
//
// Cada valor lleva un comentario `// origen: archivo:línea` apuntando al lugar
// exacto desde donde se tomó; este archivo NO inventa ni redefine ninguno.

// Tipos de host de Open-Meteo, tal como los usan los adapters.
// origen: lib/infraestructura/riesgo/providers/cupo-om.ts:511
export type HostOpenMeteo = 'api' | 'ensemble-api' | 'archive-api' | 'flood-api' | 'seasonal-api'

export const CONFIG_FUENTES = {
  // ---------------------------------------------------------------------
  // Open-Meteo (todos comparten bucket/cuota y el prefijo de plan pago)
  // ---------------------------------------------------------------------
  ecmwf: {
    host: 'api', // origen: lib/infraestructura/riesgo/providers/ecmwf.ts:113 (construirBaseUrl('api', ...))
    ruta: '/v1/ecmwf', // origen: lib/infraestructura/riesgo/providers/ecmwf.ts:23
    envApiKey: 'OPEN_METEO_API_KEY', // origen: lib/infraestructura/riesgo/providers/cupo-om.ts:534
    prefijoHostPago: 'customer-', // origen: lib/infraestructura/riesgo/providers/cupo-om.ts:519
    timeoutMs: 30_000, // origen: lib/infraestructura/riesgo/providers/ecmwf.ts (TIMEOUT_MS_ECMWF)
    reintentos: 3, // origen: lib/infraestructura/riesgo/providers/cliente-http.ts:52
    tamanoLote: 50, // origen: lib/infraestructura/riesgo/providers/ecmwf.ts:35 (TAMANO_LOTE_COORDENADAS)
    diasPronostico: 10, // origen: lib/infraestructura/riesgo/providers/ecmwf.ts:108 (FORECAST_DAYS)
  },
  flood: {
    host: 'flood-api', // origen: lib/infraestructura/riesgo/providers/flood.ts:42 (construirBaseUrl('flood-api', ...))
    ruta: '/v1/flood', // origen: lib/infraestructura/riesgo/providers/flood.ts:15
    envApiKey: 'OPEN_METEO_API_KEY', // origen: lib/infraestructura/riesgo/providers/cupo-om.ts:534
    prefijoHostPago: 'customer-', // origen: lib/infraestructura/riesgo/providers/cupo-om.ts:519
    timeoutMs: 10_000, // origen: lib/infraestructura/riesgo/providers/cliente-http.ts:51
    reintentos: 3, // origen: lib/infraestructura/riesgo/providers/cliente-http.ts:52
    variables: 4, // origen: lib/infraestructura/riesgo/providers/flood.ts:18 (CANTIDAD_VARIABLES_CAUDAL)
    diasPronostico: 10, // origen: lib/infraestructura/riesgo/providers/flood.ts:19 (DIAS_PRONOSTICO)
  },
  ensemble: {
    host: 'ensemble-api', // origen: lib/infraestructura/riesgo/providers/ensemble.ts:164 (construirBaseUrl('ensemble-api', ...))
    ruta: '/v1/ensemble', // origen: lib/infraestructura/riesgo/providers/ensemble.ts:25
    envApiKey: 'OPEN_METEO_API_KEY', // origen: lib/infraestructura/riesgo/providers/cupo-om.ts:534
    prefijoHostPago: 'customer-', // origen: lib/infraestructura/riesgo/providers/cupo-om.ts:519
    timeoutMs: 30_000, // fuente de TIMEOUT_MS_ENSEMBLE (providers/ensemble.ts)
    reintentos: 3, // origen: lib/infraestructura/riesgo/providers/cliente-http.ts:52
    modelo: 'ecmwf_ifs025', // origen: lib/infraestructura/riesgo/providers/ensemble.ts:29 (MODELO_ENSEMBLE)
    tamanoLote: 20, // origen: lib/infraestructura/riesgo/providers/ensemble.ts:35 (TAMANO_LOTE_COORDENADAS_ENSEMBLE)
    diasPronostico: 3, // origen: lib/infraestructura/riesgo/providers/ensemble.ts:40 (DIAS_PRONOSTICO_ENSEMBLE)
  },
  seasonal: {
    host: 'seasonal-api', // origen: lib/infraestructura/riesgo/providers/seasonal.ts:149 (construirBaseUrl('seasonal-api', ...))
    ruta: '/v1/seasonal', // origen: lib/infraestructura/riesgo/providers/seasonal.ts:51
    envApiKey: 'OPEN_METEO_API_KEY', // origen: lib/infraestructura/riesgo/providers/cupo-om.ts:534
    prefijoHostPago: 'customer-', // origen: lib/infraestructura/riesgo/providers/cupo-om.ts:519
    timeoutMs: 10_000, // origen: lib/infraestructura/riesgo/providers/cliente-http.ts:51
    reintentos: 3, // origen: lib/infraestructura/riesgo/providers/cliente-http.ts:52
    modelo: 'ecmwf_seasonal_seamless', // origen: lib/infraestructura/riesgo/providers/seasonal.ts:55 (MODELO_SEASONAL)
    variableDiaria: 'precipitation_sum', // origen: lib/infraestructura/riesgo/providers/seasonal.ts:57 (VARIABLE_DIARIA_SEASONAL)
    tamanoLote: 5, // origen: lib/infraestructura/riesgo/providers/seasonal.ts:64 (TAMANO_LOTE_DEPARTAMENTOS_SEASONAL)
    diasPronostico: 95, // origen: lib/infraestructura/riesgo/providers/seasonal.ts:72 (FORECAST_DAYS_SOLICITADOS)
    horizonteDesdeDias: 30, // origen: lib/infraestructura/riesgo/providers/seasonal.ts:310
    horizonteHastaDias: 90, // origen: lib/infraestructura/riesgo/providers/seasonal.ts:311
  },
  climatologia: {
    host: 'archive-api', // origen: lib/infraestructura/riesgo/providers/climatologia.ts:338 (construirBaseUrl('archive-api', ...))
    ruta: '/v1/archive', // origen: lib/infraestructura/riesgo/providers/climatologia.ts:63
    envApiKey: 'OPEN_METEO_API_KEY', // origen: lib/infraestructura/riesgo/providers/cupo-om.ts:534
    prefijoHostPago: 'customer-', // origen: lib/infraestructura/riesgo/providers/cupo-om.ts:519
    timeoutMs: 10_000, // origen: lib/infraestructura/riesgo/providers/cliente-http.ts:51
    reintentos: 3, // origen: lib/infraestructura/riesgo/providers/cliente-http.ts:52
    tamanoLote: 5, // origen: lib/infraestructura/riesgo/providers/climatologia.ts:258 (TAMANO_LOTE_COORDENADAS)
    gradosCeldaEra5: 0.25, // origen: lib/infraestructura/riesgo/providers/climatologia.ts:80 (GRADOS_CELDA_ERA5)
    periodoDesde: '1991-01-01', // origen: lib/infraestructura/riesgo/jobs/calcular-climatologia.ts:63 (PERIODO_DESDE_DEFAULT)
    periodoHasta: '2020-12-31', // origen: lib/infraestructura/riesgo/jobs/calcular-climatologia.ts:64 (PERIODO_HASTA_DEFAULT)
  },
  climatologiaCaudal: {
    host: 'flood-api', // origen: lib/infraestructura/riesgo/providers/climatologia-caudal.ts:145 (construirBaseUrl('flood-api', ...))
    ruta: '/v1/flood', // origen: lib/infraestructura/riesgo/providers/climatologia-caudal.ts:28
    envApiKey: 'OPEN_METEO_API_KEY', // origen: lib/infraestructura/riesgo/providers/cupo-om.ts:534
    prefijoHostPago: 'customer-', // origen: lib/infraestructura/riesgo/providers/cupo-om.ts:519
    timeoutMs: 10_000, // origen: lib/infraestructura/riesgo/providers/cliente-http.ts:51
    reintentos: 3, // origen: lib/infraestructura/riesgo/providers/cliente-http.ts:52
    tamanoLote: 50, // origen: lib/infraestructura/riesgo/providers/climatologia-caudal.ts:119 (TAMANO_LOTE_COORDENADAS_CAUDAL)
    periodoDesde: '2015-01-01', // origen: lib/infraestructura/riesgo/jobs/calcular-climatologia-caudal.ts:53 (PERIODO_DESDE_DEFAULT)
    periodoHasta: '2024-12-31', // origen: lib/infraestructura/riesgo/jobs/calcular-climatologia-caudal.ts:54 (PERIODO_HASTA_DEFAULT)
  },

  // ---------------------------------------------------------------------
  // NASA GPM IMERG (CMR para metadata + GES DISC OPeNDAP para datos)
  // ---------------------------------------------------------------------
  imergCmr: {
    host: 'cmr.earthdata.nasa.gov', // origen: lib/infraestructura/riesgo/jobs/sync-imerg.ts:101 (urlCmrVentana)
    envToken: 'EARTHDATA_TOKEN', // origen: lib/infraestructura/riesgo/jobs/sync-imerg.ts:10
    timeoutMs: 10_000, // origen: lib/infraestructura/riesgo/providers/cliente-http.ts:51
    reintentos: 3, // origen: lib/infraestructura/riesgo/providers/cliente-http.ts:52
    pageSizeVentana: 170, // origen: lib/infraestructura/riesgo/jobs/sync-imerg.ts:97 (CMR_PAGE_SIZE_VENTANA)
    ventanaBackfillHoras: 72, // origen: lib/infraestructura/riesgo/jobs/sync-imerg.ts:86 (VENTANA_BACKFILL_HORAS)
    margenBackfillHoras: 6, // origen: lib/infraestructura/riesgo/jobs/sync-imerg.ts:87 (MARGEN_BACKFILL_HORAS)
    maxGranulosPorCorrida: 12, // origen: lib/infraestructura/riesgo/jobs/sync-imerg.ts:94 (MAX_GRANULOS_A_PROCESAR_POR_CORRIDA)
  },
  imergOpendap: {
    host: 'data.gesdisc.earthdata.nasa.gov', // origen: lib/infraestructura/riesgo/providers/imerg.ts:135 (HOST_DATOS_GESDISC)
    hostAlterno: 'gpm1.gesdisc.eosdis.nasa.gov', // origen: lib/infraestructura/riesgo/providers/imerg.ts:136 (HOST_OPENDAP_GESDISC)
    envToken: 'EARTHDATA_TOKEN', // origen: lib/infraestructura/riesgo/jobs/sync-imerg.ts:10
  },

  // ---------------------------------------------------------------------
  // OpenRouter (veredicto diario asistido por IA; módulos en lib/infraestructura/briefing-ia/)
  // ---------------------------------------------------------------------
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions', // origen: lib/infraestructura/briefing-ia/proveedor-openrouter.ts:31 (URL_OPENROUTER)
    modeloPorDefecto: 'deepseek/deepseek-v4.1-flash', // origen: lib/infraestructura/briefing-ia/proveedor-openrouter.ts:32 (MODELO_POR_DEFECTO)
    timeoutMs: 15000, // origen: lib/infraestructura/briefing-ia/proveedor-openrouter.ts:33 (TIMEOUT_MS_POR_DEFECTO)
    costoPorMillonEntradaUsd: 0.035, // origen: lib/infraestructura/briefing-ia/proveedor-openrouter.ts:35 (COSTO_POR_MILLON_ENTRADA_USD)
    costoPorMillonSalidaUsd: 0.29, // origen: lib/infraestructura/briefing-ia/proveedor-openrouter.ts:36 (COSTO_POR_MILLON_SALIDA_USD)
    envApiKey: 'OPENROUTER_API_KEY', // origen: lib/infraestructura/briefing-ia/proveedor-openrouter.ts:146
    envModelo: 'OPENROUTER_MODEL', // origen: lib/infraestructura/briefing-ia/proveedor-openrouter.ts:147
    envPresupuestoMes: 'E8_PRESUPUESTO_USD_MES', // origen: lib/infraestructura/briefing-ia/generar-briefing-asistido.ts:93
    envCostoMaximoLlamada: 'E8_COSTO_MAXIMO_USD_LLAMADA', // origen: lib/infraestructura/briefing-ia/generar-briefing-asistido.ts:98
  },
} as const

export type ConfigFuentes = typeof CONFIG_FUENTES
