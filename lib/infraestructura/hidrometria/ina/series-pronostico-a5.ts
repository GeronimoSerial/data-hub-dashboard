// Catálogo versionado de las series de pronóstico INA A5 de los calibrados 499
// (parana_estacional_sissa) y 289 (tabprono_central). Las corridas pueden
// venir con `metadata: null`, así que estación, variable, unidad y soporte se
// resuelven acá desde /a5/obs/puntual/series?id=… (captura 2026-10-17).
// estacionId sólo se asigna cuando la estación A5 está en CATALOGO_A5; el resto
// conserva los ids A5 con estacionId null. Ver docs/motor-v0.4/hidrologia-ina.md.
import { CATALOGO_A5 } from './catalogo-a5'

export const SERIES_PRONOSTICO_VERSION = 'ina-a5-pronostico-2026-10-17.1'

export const CALIBRADO_ESTACIONAL = 499
export const CALIBRADO_TABPRONO = 289
export const CALIBRADOS_PRONOSTICO = [CALIBRADO_ESTACIONAL, CALIBRADO_TABPRONO] as const

/**
 * Soporte temporal del valor: `semanal_media` es la media de 7 días (nunca un
 * pico diario); `diario` la media de un día; `instantaneo` una lectura puntual
 * (timeSupport 0 en A5); `desconocido` cuando A5 no publica la serie.
 */
export type SoportePronostico = 'semanal_media' | 'diario' | 'instantaneo' | 'desconocido'

export type SeriePronosticoA5 = {
  calId: number
  seriesId: number
  a5EstacionId: number | null
  nombreA5: string | null
  estacionId: string | null
  /** Abreviatura de variable A5 (H, Hms, Hmd); null si no se pudo resolver. */
  variable: string | null
  unidad: 'm' | null
  /** Altura sobre el cero de la escala local de la estación, o desconocida. */
  referencia: 'cero_escala_local' | 'desconocida'
  soporte: SoportePronostico
  motivoSinResolver: string | null
}

const SOPORTE_POR_VARIABLE = {
  H: 'instantaneo',
  Hms: 'semanal_media',
  Hmd: 'diario',
} as const satisfies Record<string, SoportePronostico>

function s(
  calId: number,
  seriesId: number,
  a5EstacionId: number,
  nombreA5: string,
  variable: keyof typeof SOPORTE_POR_VARIABLE,
  referencia: SeriePronosticoA5['referencia'] = 'cero_escala_local',
): SeriePronosticoA5 {
  return {
    calId,
    seriesId,
    a5EstacionId,
    nombreA5,
    estacionId: CATALOGO_A5.find((e) => e.a5EstacionId === a5EstacionId)?.estacionId ?? null,
    variable,
    unidad: 'm',
    referencia,
    soporte: SOPORTE_POR_VARIABLE[variable],
    motivoSinResolver: null,
  }
}

// Presentes en la corrida 499 pero /obs/puntual/series/{id} responde "not found".
function sinResolver(calId: number, seriesId: number): SeriePronosticoA5 {
  return {
    calId, seriesId, a5EstacionId: null, nombreA5: null, estacionId: null, variable: null, unidad: null,
    referencia: 'desconocida', soporte: 'desconocido', motivoSinResolver: 'serie_no_publicada_en_a5',
  }
}

const E = CALIBRADO_ESTACIONAL
const T = CALIBRADO_TABPRONO

export const SERIES_PRONOSTICO_A5: readonly SeriePronosticoA5[] = [
  s(E, 34855, 9, 'Puerto Iguazú', 'Hms'),
  s(E, 34856, 10, 'Libertad', 'Hms'),
  s(E, 34857, 11, 'El Dorado', 'Hms'),
  s(E, 34858, 12, 'Libertador', 'Hms'),
  s(E, 34860, 16, 'Itá Ibaté', 'Hms'),
  s(E, 34861, 17, 'Itatí', 'Hms'),
  s(E, 34862, 18, 'Paso de la Patria', 'Hms'),
  s(E, 34863, 19, 'Corrientes', 'Hms'),
  s(E, 34864, 21, 'Empedrado', 'Hms'),
  s(E, 34865, 22, 'Bella Vista', 'Hms'),
  s(E, 34866, 23, 'Goya', 'Hms'),
  s(E, 34867, 25, 'Esquina', 'Hms'),
  s(E, 34868, 26, 'La Paz', 'Hms'),
  s(E, 34869, 27, 'Santa Elena', 'Hms'),
  s(E, 34884, 28, 'Hernandarias', 'Hms'),
  s(E, 34870, 29, 'Paraná', 'Hms'),
  s(E, 34871, 31, 'Diamante', 'Hms'),
  s(E, 34872, 33, 'San Lorenzo (San Martín)', 'Hms'),
  s(E, 34873, 34, 'Rosario', 'Hms'),
  s(E, 34874, 35, 'Villa Constitución', 'Hms'),
  s(E, 34878, 57, 'Puerto Formosa', 'Hms'),
  s(E, 34879, 58, 'Bermejo', 'Hms'),
  s(E, 34880, 59, 'Isla del Cerrito', 'Hms'),
  s(E, 35471, 40, 'Zárate', 'Hmd'),
  // Atucha pertenece a la red na-sa, no a escalas Prefectura: referencia sin verificar.
  s(E, 35472, 151, 'Atucha', 'Hmd', 'desconocida'),
  sinResolver(E, 34881),
  sinResolver(E, 34882),
  sinResolver(E, 34883),
  s(T, 1540, 19, 'Corrientes', 'H'),
  s(T, 3523, 20, 'Barranqueras', 'H'),
  s(T, 3524, 23, 'Goya', 'H'),
  s(T, 3526, 24, 'Reconquista', 'H'),
  s(T, 3527, 26, 'La Paz', 'H'),
  s(T, 3408, 29, 'Paraná', 'H'),
  s(T, 1542, 30, 'Santa Fe', 'H'),
  s(T, 3412, 34, 'Rosario', 'H'),
]

const INDICE = new Map(SERIES_PRONOSTICO_A5.map((x) => [`${x.calId}:${x.seriesId}`, x]))

export function buscarSeriePronostico(calId: number, seriesId: number): SeriePronosticoA5 | null {
  return INDICE.get(`${calId}:${seriesId}`) ?? null
}
