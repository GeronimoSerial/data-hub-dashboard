// Puertos de INGESTA del módulo de riesgo hidrometeorológico ENOS.
//
// Primer borrador de las fronteras normalizadas hacia los jobs de ingesta
// (ensemble, IMERG, seasonal), tal como quedaron bosquejadas en
// docs/ejecucion-enos/ABS1/registro.md, sección "Puertos propuestos".
//
// Reglas transversales de normalización:
// - Toda unidad explícita en el nombre del campo (`Mm`, `Mm3s`, ...).
// - Todo instante en UTC ISO con `Z`.
// - Ausencia explícita como `null` / omisión del punto / entrada en `sinDato`.
//   NUNCA se imputa `0`: `0` siempre significa "se midió y fue cero".
// - Cada método devuelve diagnósticos por clave junto a los datos, para no
//   perder el motivo de las celdas ausentes (`erroresPorCelda` /
//   `erroresPorDepartamento` -> `sinDato`).
//
// Este archivo es SÓLO tipos e interfaces: sin lógica ni imports de red.

// ---------------------------------------------------------------------------
// 2. Ensemble probabilístico
// ---------------------------------------------------------------------------

/** Punto normalizado de probabilidad de superar umbrales de climatología. */
export interface PuntoEnsembleProbabilistico {
  geometryRef: string
  variable: 'precipitacion_acumulada'
  corridaEn: string
  validoDesde: string
  validoHasta: string
  horizonteHoras: number
  acumuladoHoras: 24
  miembrosTotal: number
  miembrosValidos: number
  /** Fracción 0..1; `null` si `miembrosValidos === 0` (ver nota en el adaptador). */
  probabilidadSuperaP95: number | null
  /** Fracción 0..1; `null` si `miembrosValidos === 0` (ver nota en el adaptador). */
  probabilidadSuperaP99: number | null
  /** mm; `null` si `miembrosValidos < 2`. */
  dispersionMm: number | null
}

export interface PuertoPronosticoEnsemble {
  obtenerProbabilidades(params: {
    geometryRefs: string[]
    /** ISO UTC; se mapea al `corridaEn` del provider. */
    asOf: string
    /** mm, climatología ya resuelta. */
    umbralesP95Mm: ReadonlyMap<string, number>
    /** mm, climatología ya resuelta. */
    umbralesP99Mm: ReadonlyMap<string, number>
  }): Promise<{
    puntos: PuntoEnsembleProbabilistico[]
    /** geometryRef -> motivo ('sin_climatologia', 'sin_miembros', ...). */
    sinDato: Record<string, string>
  }>
}

// ---------------------------------------------------------------------------
// 3. Observación satelital (IMERG)
// ---------------------------------------------------------------------------

/** Gránulo de IMERG listado vía CMR. */
export interface GranuloSatelital {
  id: string
  /** ISO UTC. */
  inicioEn: string
  /** ISO UTC. */
  finEn: string
  urlDatos: string
}

/** Observación puntual de precipitación satelital por celda. */
export interface ObservacionPrecipitacionCelda {
  geometryRef: string
  variable: 'precipitacion_observada_satelital'
  /** mm acumulados en la ventana del gránulo (30 min). */
  valorMm: number
  /** ISO UTC (inicio del gránulo). */
  observadoEn: string
  /** ISO UTC. */
  ventanaDesde: string
  /** ISO UTC. */
  ventanaHasta: string
  /** `precipitationQualityIndex`; `null` = el producto no lo trajo. */
  calidad: number | null
}

export interface PuertoObservacionSatelital {
  listarGranulos(params: { desde: string; hasta: string }): Promise<GranuloSatelital[]>
  obtenerObservacion(params: {
    granulo: GranuloSatelital
  }): Promise<{
    observaciones: ObservacionPrecipitacionCelda[]
    /** Celdas del subset sin valor válido. */
    celdasSinDato: string[]
  }>
}

// ---------------------------------------------------------------------------
// 5. Tendencia estacional
// ---------------------------------------------------------------------------

export interface EstadisticaEstacionalNormalizada {
  departamento: string
  variable: 'precipitacion_acumulada'
  /** ISO UTC. */
  emisionEn: string
  /** ISO UTC. */
  validoDesde: string
  /** ISO UTC. */
  validoHasta: string
  horizonteDesdeDias: number
  horizonteHastaDias: number
  miembrosTotal: number
  miembrosValidos: number
  mediaMm: number | null
  medianaMm: number | null
  dispersionMm: number | null
  /** Fracción 0..1; `null` si falta control o no hay perturbados válidos. */
  probabilidadSobreNormal: number | null
}

export interface PuertoTendenciaEstacional {
  obtenerTendencia(params: {
    centroides: Array<{ departamento: string; lat: number; lon: number }>
    /** ISO UTC. */
    emisionEn: string
    horizonteDesdeDias: number
    horizonteHastaDias: number
  }): Promise<{
    estadisticas: EstadisticaEstacionalNormalizada[]
    /** departamento -> motivo. */
    sinDato: Record<string, string>
  }>
}
