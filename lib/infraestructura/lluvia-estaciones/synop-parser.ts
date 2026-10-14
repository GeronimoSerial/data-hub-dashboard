/**
 * Decodificador puro de precipitación SYNOP (WMO FM-12) tal como llega en las
 * líneas CSV de Ogimet. Sin E/S: recibe texto y devuelve registros.
 */

export type PrecipitacionSynop = {
  estacionWmo: string
  observadoEn: string
  periodoHoras: number
  precipitacionMm: number
  traza: boolean
  seccion: 1 | 3
}

type Precipitacion = Pick<PrecipitacionSynop, 'periodoHoras' | 'precipitacionMm' | 'traza'>

/** Código t del grupo 6RRRt (FM-12). El código 0 no define período. */
const PERIODO_POR_CODIGO_T: Record<string, number> = {
  '1': 6,
  '2': 12,
  '3': 18,
  '4': 24,
  '5': 1,
  '6': 2,
  '7': 3,
  '8': 9,
  '9': 15,
}

const HORAS_SINOPTICAS = new Set([0, 6, 12, 18])
const CODIGO_TRAZA = 990
const MAXIMO_MM_SIN_ESCALA = 989
const PRIMER_CODIGO_DECIMAL = 991

const REGEX_GRUPO_6 = /^6\d{4}$/

function esGrupo6(token: string): boolean {
  return REGEX_GRUPO_6.test(token)
}

/** Decodifica un grupo 6RRRt ya validado por REGEX_GRUPO_6. */
function decodificarGrupo6(grupo: string): Precipitacion | null {
  const periodoHoras = PERIODO_POR_CODIGO_T[grupo[4]]
  if (periodoHoras === undefined) return null

  const codigoRrr = Number(grupo.slice(1, 4))
  if (codigoRrr === CODIGO_TRAZA) {
    return { periodoHoras, precipitacionMm: 0, traza: true }
  }
  if (codigoRrr >= PRIMER_CODIGO_DECIMAL) {
    return { periodoHoras, precipitacionMm: (codigoRrr - 990) / 10, traza: false }
  }
  return {
    periodoHoras,
    precipitacionMm: Math.min(codigoRrr, MAXIMO_MM_SIN_ESCALA),
    traza: false,
  }
}

function construirFechaUtc(anio: number, mes: number, dia: number, hora: number, minuto: number): string | null {
  const fecha = new Date(Date.UTC(anio, mes - 1, dia, hora, minuto))
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString()
}

/**
 * Decodifica una línea Ogimet `WMO,YYYY,MM,DD,HH,mm,AAXX ... =`.
 * Devuelve [] para líneas NIL, sin AAXX o mal formadas.
 */
export function parsearLineaOgimet(linea: string): PrecipitacionSynop[] {
  const campos = linea.trim().replace(/=\s*$/, '').split(',')
  if (campos.length < 7) return []

  const [estacionWmo, anioTxt, mesTxt, diaTxt, horaTxt, minutoTxt] = campos.slice(0, 6).map((c) => c.trim())
  const [anio, mes, dia, hora, minuto] = [anioTxt, mesTxt, diaTxt, horaTxt, minutoTxt].map(Number)
  const observadoEn = construirFechaUtc(anio, mes, dia, hora, minuto)
  if (!estacionWmo || observadoEn === null) return []

  const tokens = campos.slice(6).join(',').trim().split(/\s+/)
  const indiceAaxx = tokens.indexOf('AAXX')
  if (indiceAaxx === -1) return []

  // Orden FM-12: AAXX YYGGi IIiii iRixhVV Nddff [00fff] grupos de sección 1 ... 333 sección 3 ... 555
  const iRixhVV = tokens[indiceAaxx + 3]
  if (!iRixhVV || !/^\d{5}$/.test(iRixhVV)) return []
  const iR = iRixhVV[0]

  const indice333 = tokens.indexOf('333', indiceAaxx)
  const finSeccion1 = indice333 === -1 ? tokens.length : indice333
  // Se salta el grupo Nddff (índice indiceAaxx + 4): su N puede ser 6 y no es un grupo 6RRRt.
  const seccion1 = tokens.slice(indiceAaxx + 5, finSeccion1)

  const registros: PrecipitacionSynop[] = []
  const grupo6Seccion1 = seccion1.find(esGrupo6)
  const medicionSeccion1 = grupo6Seccion1 ? decodificarGrupo6(grupo6Seccion1) : null

  if (iR !== '4') {
    if (medicionSeccion1) {
      registros.push({ estacionWmo, observadoEn, ...medicionSeccion1, seccion: 1 })
    } else if (iR === '3' && HORAS_SINOPTICAS.has(hora)) {
      registros.push({ estacionWmo, observadoEn, periodoHoras: 6, precipitacionMm: 0, traza: false, seccion: 1 })
    }
  }

  if (indice333 !== -1) {
    const indiceFinSeccion3 = tokens.indexOf('555', indice333 + 1)
    const seccion3 = tokens.slice(indice333 + 1, indiceFinSeccion3 === -1 ? tokens.length : indiceFinSeccion3)
    const grupo6Seccion3 = seccion3.find(esGrupo6)
    const medicionSeccion3 = grupo6Seccion3 ? decodificarGrupo6(grupo6Seccion3) : null
    if (medicionSeccion3) {
      registros.push({ estacionWmo, observadoEn, ...medicionSeccion3, seccion: 3 })
    }
  }

  return registros
}

/** Decodifica un bloque de líneas Ogimet; omite las vacías, NIL y mal formadas. */
export function parsearRespuestaOgimet(texto: string): PrecipitacionSynop[] {
  return texto.split(/\r?\n/).flatMap((linea) => parsearLineaOgimet(linea))
}
