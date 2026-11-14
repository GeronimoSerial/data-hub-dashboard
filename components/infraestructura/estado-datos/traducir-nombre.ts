import type { Diccionario } from '@/lib/i18n'

// Presentation only: the lib keeps returning Spanish source names (APIs are
// snapshot-pinned). Known fixed names map to dictionary entries by exact text;
// anything else, including dataset names from the database, falls back to the
// original string.

type Nombres = Diccionario['situacion']['estadoDatos']['nombres']
type ClaveNombre = keyof Nombres

const CLAVE_POR_ES = new Map<string, ClaveNombre>([
  ['Pronóstico meteorológico', 'pronosticoMeteorologico'],
  ['Ensamble meteorológico (radar)', 'ensambleRadar'],
  ['Avisos meteorológicos', 'avisosMeteorologicos'],
  ['Avisos meteorológicos (INMET)', 'avisosMeteorologicosInmet'],
  ['Niveles del río (ANA)', 'nivelesRioAna'],
  ['Niveles del río (SGB)', 'nivelesRioSgb'],
  ['Lluvia observada IMERG', 'lluviaObservadaImerg'],
  ['Observaciones IMERG', 'observacionesImerg'],
  ['Ensamble de lluvia', 'ensambleLluvia'],
  ['Lluvia SYNOP', 'lluviaSynop'],
  ['Pronóstico estacional', 'pronosticoEstacional'],
  ['Climatología IMERG', 'climatologiaImerg'],
  ['Cobertura de la climatología de precipitación', 'coberturaClimatologiaPrecipitacion'],
  ['Climatología de caudal', 'climatologiaCaudal'],
  ['Climatología de precipitación', 'climatologiaPrecipitacion'],
  ['Cálculo de riesgo escolar', 'calculoRiesgoEscolar'],
  ['Corte del Centro de Situación', 'corteCentroSituacion'],
  ['Veredicto diario', 'veredictoDiario'],
  ['Cierre del veredicto', 'cierreVeredicto'],
  ['Run de riesgo vigente', 'runRiesgoVigente'],
  ['Episodios derivados', 'episodiosDerivados'],
  ['Pronóstico de caudal', 'pronosticoCaudal'],
  ['Exposición al río (DEM)', 'exposicionRioDem'],
  ['Alturas de Prefectura', 'alturasPrefectura'],
  ['Histórico de Prefectura', 'historicoPrefectura'],
  ['Lecturas de Prefectura', 'lecturasPrefectura'],
  ['Plausibilidad de lecturas', 'plausibilidadLecturas'],
  ['Huecos en la serie IMERG', 'huecosSerieImerg'],
  ['Cadena de datos (sonda)', 'cadenaDatosSonda'],
  ['Datos geográficos y estáticos', 'datosGeograficosEstaticos'],
])

const FUENTE = /^Fuente ([\s\S]+)$/

export function traducirNombre(nombre: string, t: Diccionario): string {
  const clave = CLAVE_POR_ES.get(nombre)
  if (clave !== undefined) return t.situacion.estadoDatos.nombres[clave]
  const fuente = FUENTE.exec(nombre)
  if (fuente) return t.situacion.estadoDatos.fuente(fuente[1]!)
  return nombre
}
