export type SerieRenaper = Record<string, number>
export const ANIOS_RENAPER = Array.from({ length: 14 }, (_, i) => 2012 + i)

/** Read numeric chart values, never locale-formatted tooltip labels. */
export function extraerSerieRenaper(series: unknown): SerieRenaper {
  if (!Array.isArray(series) || series.length !== 1 || !Array.isArray(series[0]?.data)) {
    throw new Error('Expected one RENAPER birth series')
  }
  const result: SerieRenaper = {}
  for (const point of series[0].data) {
    if (!Number.isInteger(point.x) || !ANIOS_RENAPER.includes(point.x) ||
        !Number.isInteger(point.y) || point.y < 0 || String(point.x) in result) {
      throw new Error('Invalid or duplicate RENAPER birth value')
    }
    result[String(point.x)] = point.y
  }
  if (Object.keys(result).length !== ANIOS_RENAPER.length) throw new Error('Incomplete RENAPER years')
  return result
}

// RENAPER natalidad is declared Corrientes-only (see the natalidad module), so the
// region name and department count are Corrientes values, not read from the active region.
const NOMBRE_PROVINCIA_RENAPER = 'Corrientes'
export const DEPARTAMENTOS_ESPERADOS_CORRIENTES = 25

export function construirSnapshotRenaper(
  departamentos: Record<string, SerieRenaper>, provincia: SerieRenaper, extraidoEn: string,
  cantidadEsperada: number = DEPARTAMENTOS_ESPERADOS_CORRIENTES,
) {
  if (Object.keys(departamentos).length !== cantidadEsperada) {
    throw new Error(`Expected all ${cantidadEsperada} ${NOMBRE_PROVINCIA_RENAPER} departments`)
  }
  const validate = (serie: SerieRenaper) => extraerSerieRenaper([{ data: Object.entries(serie).map(([x, y]) => ({ x: Number(x), y })) }])
  validate(provincia)
  Object.values(departamentos).forEach(validate)
  const conciliacion = Object.fromEntries(ANIOS_RENAPER.map((year) => {
    const key = String(year)
    const sumaDepartamentos = Object.values(departamentos).reduce((sum, serie) => sum + serie[key], 0)
    return [key, { sumaDepartamentos, diferenciaProvincia: provincia[key] - sumaDepartamentos }]
  }))
  return {
    meta: {
      fuente: { nombre: 'RENAPER — Nacimientos identificados', url: 'https://estadisticas.renaper.gob.ar/app_myn/' },
      corteFuente: '2026-09', extraidoEn, anios: ANIOS_RENAPER,
      metodologia: 'Registros administrativos de personas identificadas con DNI; residencia al nacimiento. Serie independiente de DEIS.',
    },
    provincia: { nombre: NOMBRE_PROVINCIA_RENAPER, serie: provincia },
    departamentos: Object.fromEntries(Object.entries(departamentos).map(([nombre, serie]) => [nombre, { nombre, serie }])),
    conciliacion,
  }
}
