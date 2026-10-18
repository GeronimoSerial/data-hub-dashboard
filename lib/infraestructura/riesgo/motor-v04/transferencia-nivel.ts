// Transferencia del nivel del Paraná a una escuela por km de río (U5 de
// "Motor v0.4/PLAN_IMPLEMENTACION.md"). Ver docs/motor-v0.4/superacion-terreno.md.
//
// Módulo puro: sin DB ni reloj. Reglas:
// - La escuela se ubica sólo a través del tramo APROBADO de su localidad: la
//   estación de ese tramo debe ser uno de los dos hidrómetros que la encierran.
//   Nunca se asigna por cercanía.
// - Interpolables son las estaciones del Paraná con cero de escala, km de río y
//   coordenada declarada. El km de la escuela sale de proyectarla sobre el
//   segmento entre dos estaciones consecutivas (plano equirectangular, como
//   `anomaliaInterpolada` de motor/exposicion-dinamica.ts) con t ∈ [0, 1].
// - La cota del agua en el sitio es la interpolación lineal por km de
//   (cero + h) de ambas estaciones. Sin cero no hay cota absoluta: nunca se
//   comparan metros de escala con el DEM.

export type EstacionTransferencia = {
  estacionId: string
  rio: 'parana' | 'uruguay'
  ceroM: number | null
  kmRio: number | null
  coordenadas: { lat: number; lon: number } | null
}

export type TramoAprobado = { estacionId: string; localidades: readonly string[] }

export type MotivoTransferencia =
  | 'sin_tramo_aprobado'
  | 'rio_sin_transferencia'
  | 'sin_cero_escala'
  | 'sin_km_rio'
  | 'estacion_sin_coordenadas'
  | 'fuera_de_tramo_interpolable'

type EstacionInterpolable = EstacionTransferencia & { ceroM: number; kmRio: number; coordenadas: { lat: number; lon: number } }

export type UbicacionRio =
  | {
      estado: 'ubicada'
      estacionTramoId: string
      aguasArriba: EstacionInterpolable
      aguasAbajo: EstacionInterpolable
      /** 0 en la estación de aguas arriba, 1 en la de aguas abajo. */
      t: number
      kmRio: number
      /** Distancia de la escuela al segmento recto entre estaciones (no a la costa). */
      distanciaEjeKm: number
    }
  | { estado: 'no_estimable'; motivo: MotivoTransferencia }

const KM_POR_GRADO = 111.32

function claveLocalidad(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
}

/** Estación del tramo aprobado que contiene la localidad, o null. */
export function tramoDeLocalidad(localidad: string | null, tramos: readonly TramoAprobado[]): string | null {
  if (localidad === null) return null
  const clave = claveLocalidad(localidad)
  if (clave === '') return null
  return tramos.find((t) => t.localidades.some((l) => claveLocalidad(l) === clave))?.estacionId ?? null
}

const esInterpolable = (e: EstacionTransferencia): e is EstacionInterpolable =>
  e.rio === 'parana' && e.ceroM !== null && e.kmRio !== null && e.coordenadas !== null

function proyectar(p: { lat: number; lon: number }, a: EstacionInterpolable, b: EstacionInterpolable) {
  const cosLat = Math.cos((((a.coordenadas.lat + b.coordenadas.lat) / 2) * Math.PI) / 180)
  const ax = a.coordenadas.lon * cosLat
  const ay = a.coordenadas.lat
  const dx = b.coordenadas.lon * cosLat - ax
  const dy = b.coordenadas.lat - ay
  const px = p.lon * cosLat - ax
  const py = p.lat - ay
  const largo2 = dx * dx + dy * dy
  const t = largo2 === 0 ? 0 : (px * dx + py * dy) / largo2
  const tc = Math.min(1, Math.max(0, t))
  return { t, distanciaEjeKm: Math.hypot(px - tc * dx, py - tc * dy) * KM_POR_GRADO }
}

export function ubicarEscuelaEnRio(params: {
  punto: { lat: number; lon: number }
  estacionTramoId: string | null
  estaciones: readonly EstacionTransferencia[]
}): UbicacionRio {
  if (params.estacionTramoId === null) return { estado: 'no_estimable', motivo: 'sin_tramo_aprobado' }
  const propia = params.estaciones.find((e) => e.estacionId === params.estacionTramoId)
  if (!propia) return { estado: 'no_estimable', motivo: 'sin_tramo_aprobado' }
  if (propia.rio !== 'parana') return { estado: 'no_estimable', motivo: 'rio_sin_transferencia' }
  if (propia.ceroM === null) return { estado: 'no_estimable', motivo: 'sin_cero_escala' }
  if (propia.kmRio === null) return { estado: 'no_estimable', motivo: 'sin_km_rio' }
  if (propia.coordenadas === null) return { estado: 'no_estimable', motivo: 'estacion_sin_coordenadas' }

  // Aguas arriba primero (km decreciente hacia la desembocadura).
  const cadena = params.estaciones.filter(esInterpolable).sort((a, b) => b.kmRio - a.kmRio)
  const i = cadena.findIndex((e) => e.estacionId === propia.estacionId)
  const segmentos: Array<[EstacionInterpolable, EstacionInterpolable]> = []
  if (i > 0) segmentos.push([cadena[i - 1], cadena[i]])
  if (i < cadena.length - 1) segmentos.push([cadena[i], cadena[i + 1]])

  let mejor: Extract<UbicacionRio, { estado: 'ubicada' }> | null = null
  for (const [a, b] of segmentos) {
    const { t, distanciaEjeKm } = proyectar(params.punto, a, b)
    // Más allá de la otra estación: este par no la encierra. Más allá de la
    // propia: si la propia es interior, la escuela está junto a ella (recodo)
    // y se usa su nivel; si es el extremo del tramo interpolable, queda fuera.
    const propiaEsA = a.estacionId === propia.estacionId
    if ((propiaEsA && t > 1) || (!propiaEsA && t < 0)) continue
    if (segmentos.length < 2 && ((propiaEsA && t < 0) || (!propiaEsA && t > 1))) continue
    const tc = Math.min(1, Math.max(0, t))
    if (mejor !== null && distanciaEjeKm >= mejor.distanciaEjeKm) continue
    mejor = {
      estado: 'ubicada',
      estacionTramoId: propia.estacionId,
      aguasArriba: a,
      aguasAbajo: b,
      t: tc,
      kmRio: a.kmRio + tc * (b.kmRio - a.kmRio),
      distanciaEjeKm,
    }
  }
  return mejor ?? { estado: 'no_estimable', motivo: 'fuera_de_tramo_interpolable' }
}

/** Cota absoluta del agua en el sitio: interpolación por km de cero + h. */
export function nivelEnSitio(
  u: Extract<UbicacionRio, { estado: 'ubicada' }>,
  h: { aguasArribaM: number; aguasAbajoM: number },
): number {
  return (1 - u.t) * (u.aguasArriba.ceroM + h.aguasArribaM) + u.t * (u.aguasAbajo.ceroM + h.aguasAbajoM)
}
