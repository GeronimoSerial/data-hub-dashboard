// Parseo y verificación del CSV conservador de altimetría escolar
// ("Motor v0.4/datos/elevacion-conservadora-candidata.csv"). Puro: sin DB ni
// reloj. El importador recalcula la regla por fila y rechaza el archivo si su
// estado, cota o fuente no coinciden con lo recalculado.
import { calcularAltimetriaEscolar, type FuenteConservadora, type ResultadoAltimetria } from './altimetria'

export const CABECERA_ALTIMETRIA = [
  'cue_anexo',
  'departamento',
  'localidad',
  'lat',
  'lon',
  'estado',
  'control_departamento',
  'referencia_vertical',
  'operador',
  'ign_p10_m',
  'copernicus_p10_srvn16_aprox_m',
  'cota_conservadora_candidata_m',
  'fuente_menor_cota',
  'diferencia_ign_menos_cop_m',
  'descenso_respecto_copernicus_m',
  'cota_piso_verificada',
  'estado_uso',
] as const

export const TOLERANCIA_COTA_M = 1e-6

export class FormatoAltimetriaInvalido extends Error {
  constructor(detalle: string) {
    super(`formato inválido en altimetría v0.4: ${detalle}`)
    this.name = 'FormatoAltimetriaInvalido'
  }
}

export type FilaCsvAltimetria = {
  cueAnexo: string
  lat: number | null
  lon: number | null
  estadoCsv: string
  controlDepartamento: string
  referenciaVertical: string
  operador: string
  ignP10M: number | null
  copernicusP10M: number | null
  cotaCsvM: number | null
  fuenteCsv: string
}

const ETIQUETA_FUENTE: Record<FuenteConservadora, string> = {
  ign: 'IGN_MDE_Ar_v2.1_30m',
  copernicus: 'Copernicus_GLO_30_SRVN16_aproximado',
  coincidentes: 'coincidentes',
}

// Vacío = sin dato. Un texto no numérico invalida el archivo; un valor no
// finito queda como NaN para que la regla lo excluya (nunca se vuelve 0).
function numero(valor: string, campo: string): number | null {
  if (valor.trim() === '') return null
  const n = Number(valor)
  if (Number.isNaN(n) && !/^nan$/i.test(valor.trim())) throw new FormatoAltimetriaInvalido(`${campo}="${valor}"`)
  return n
}

/** El archivo no usa comillas: se separa por coma (igual que el importador DEM). */
export function parsearCsvAltimetria(texto: string): FilaCsvAltimetria[] {
  const [cabecera, ...cuerpo] = texto.split('\n').map((l) => l.replace(/\r$/, ''))
  if (cabecera !== CABECERA_ALTIMETRIA.join(',')) throw new FormatoAltimetriaInvalido('cabecera inesperada')
  const vistos = new Set<string>()
  return cuerpo
    .filter((l) => l.trim() !== '')
    .map((linea) => {
      const c = linea.split(',')
      if (c.length !== CABECERA_ALTIMETRIA.length) throw new FormatoAltimetriaInvalido('cantidad de columnas')
      if (c[0] === '' || vistos.has(c[0])) throw new FormatoAltimetriaInvalido(`cue_anexo vacío o repetido (${c[0]})`)
      vistos.add(c[0])
      return {
        cueAnexo: c[0],
        lat: numero(c[3], 'lat'),
        lon: numero(c[4], 'lon'),
        estadoCsv: c[5],
        controlDepartamento: c[6],
        referenciaVertical: c[7],
        operador: c[8],
        ignP10M: numero(c[9], 'ign_p10_m'),
        copernicusP10M: numero(c[10], 'copernicus_p10_srvn16_aprox_m'),
        cotaCsvM: numero(c[11], 'cota_conservadora_candidata_m'),
        fuenteCsv: c[12],
      }
    })
}

function estadoEsperado(r: ResultadoAltimetria): string {
  if (r.estado === 'candidata') return r.fuentesValidas === 2 ? 'candidata_dos_fuentes' : 'candidata_fuente_unica'
  return r.motivo === 'sin_fuente_valida' ? 'sin_cota_comparable' : r.motivo
}

export function evaluarFilaCsvAltimetria(fila: FilaCsvAltimetria): { resultado: ResultadoAltimetria; coincide: boolean } {
  const resultado = calcularAltimetriaEscolar({
    ignP10M: fila.ignP10M,
    copernicusP10M: fila.copernicusP10M,
    tieneCoordenadas: fila.lat !== null && fila.lon !== null && Number.isFinite(fila.lat) && Number.isFinite(fila.lon),
    georreferenciaObservada: fila.controlDepartamento === 'revisar',
    referenciaVertical: fila.referenciaVertical,
    operador: fila.operador,
  })
  const coincideCota =
    resultado.estado === 'candidata'
      ? fila.cotaCsvM !== null && Math.abs(fila.cotaCsvM - resultado.cotaConservadoraM) <= TOLERANCIA_COTA_M
      : fila.cotaCsvM === null
  const coincideFuente =
    resultado.estado === 'candidata' ? fila.fuenteCsv === ETIQUETA_FUENTE[resultado.fuenteConservadora] : fila.fuenteCsv === ''
  return { resultado, coincide: coincideCota && coincideFuente && fila.estadoCsv === estadoEsperado(resultado) }
}
