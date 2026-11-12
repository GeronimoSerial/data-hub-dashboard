import type { Diccionario } from '@/lib/i18n'

// Presentation only: the lib keeps returning Spanish motivos (APIs are
// snapshot-pinned). Known static messages map to dictionary entries by exact
// text, and known templates map by pattern; anything else falls back to the
// original string.

type Motivos = Diccionario['situacion']['motivos']
type ClaveTexto = { [K in keyof Motivos]: Motivos[K] extends string ? K : never }[keyof Motivos]

const CLAVE_POR_ES: Record<string, ClaveTexto> = {
  'No programado en producción': 'noProgramado',
  'Jobs batch detenidos por pausa operativa (ENOS_JOBS_ENABLED=false)': 'pausaOperativa',
  'Nunca corrió': 'nuncaCorrio',
  'La última corrida quedó interrumpida': 'interrumpida',
  'Nunca completó una corrida': 'nuncaCompleto',
  'Ninguna estación tiene lecturas': 'ningunaEstacion',
  'No hay un run de riesgo publicado': 'sinRun',
  'La sonda de la cadena de datos nunca corrió': 'sondaNuncaCorrio',
  'La cadena de datos quedó interrumpida': 'cadenaInterrumpida',
  'La última corrida de la cadena de datos no registró contadores': 'cadenaSinContadores',
  'No hay observaciones IMERG guardadas': 'imergSinObservaciones',
  'Serie IMERG de hoy sin huecos': 'imergSinHuecos',
  'No hay celdas para calcular': 'sinCeldas',
  'Nunca respondió con datos': 'nuncaRespondio',
  'Dato estático publicado; se actualiza por importación': 'estaticoPublicado',
  'La fuente no respondió': 'fuenteNoRespondio',
  'La última consulta tuvo errores': 'consultaErrores',
  'No hay datasets publicados': 'sinDatasets',
  'Sin lecturas trabadas ni valores fuera del rango de 365 días': 'sinTrabadasConRango',
  'Sin lecturas trabadas. Falta el rango de 365 días: todavía no se comparan los valores con el histórico':
    'sinTrabadasFaltaRango',
}

const CADENA_VERIFICADA = /^Cadena de datos verificada a las (\d{2}:\d{2})$/

// Duration as formatearDuracion emits it: "N min", "N h" (decimal comma for
// gap lengths) or "N días".
const DURACION = '(\\d+(?:,\\d+)? (?:min|h|días))'
const HORA = '(\\d{2}:\\d{2})'
const FECHA = '(\\d{2}/\\d{2}/\\d{4})'

type Patron =[RegExp, (m: RegExpExecArray, t: Diccionario['situacion']) => string]

function duracion(texto: string, t: Diccionario['situacion']): string {
  const dias = /^(\d+) días$/.exec(texto)
  return dias ? t.motivos.duracionDias(dias[1]) : texto
}

// Templates with interpolated values from the lib. Each handler returns the
// dictionary sentence without its final period; the caller re-adds it.
const PATRONES: Patron[] = [
  [/^Falló la última corrida \(intento (\d+)\)$/, (m, t) => t.motivos.falloUltimaCorrida(Number(m[1]))],
  [
    new RegExp(`^Publicado hace ${DURACION}; se espera cada ${DURACION}$`),
    (m, t) => t.motivos.publicadoHaceSeEspera(duracion(m[1], t), duracion(m[2], t)),
  ],
  [new RegExp(`^Se espera cada ${DURACION}$`), (m, t) => t.motivos.seEspera(duracion(m[1], t))],
  [
    /^Última corrida completada con (\d+) filas; se esperan al menos (\d+)$/,
    (m, t) => t.motivos.corridaCompletada(Number(m[1]), Number(m[2])),
  ],
  [
    new RegExp(`^Sin corrida completa hace ${DURACION}; se espera cada ${DURACION}$`),
    (m, t) => t.motivos.sinCorridaCompleta(duracion(m[1], t), duracion(m[2], t)),
  ],
  [
    new RegExp(`^Última verificación de la cadena de datos a las ${HORA} \\(hace (\\d+) h\\)$`),
    (m, t) => t.motivos.verificacionHace(m[1], Number(m[2])),
  ],
  [
    /^(\d+) de (\d+) estaciones sin lectura de las últimas (\d+) h: (.+)$/,
    (m, t) => t.motivos.estacionesSinLectura(Number(m[1]), Number(m[2]), Number(m[3]), m[4]),
  ],
  [
    /^Las (\d+) estaciones tienen lectura de las últimas (\d+) h$/,
    (m, t) => t.motivos.estacionesConLectura(Number(m[1]), Number(m[2])),
  ],
  [
    /^La cadena de datos falló: escuelas fallidas: (\d+), estaciones fallidas: (\d+), discrepancias: (\d+)$/,
    (m, t) => t.motivos.cadenaFallo(Number(m[1]), Number(m[2]), Number(m[3])),
  ],
  [
    new RegExp(`^Dato de hace ${DURACION}; vence a las ${DURACION}$`),
    (m, t) => t.motivos.datoHaceVence(duracion(m[1], t), duracion(m[2], t)),
  ],
  [new RegExp(`^Vence a las ${DURACION}$`), (m, t) => t.motivos.venceA(duracion(m[1], t))],
  [
    /^Publicado hace (\d+) días \(vigencia esperada: (\d+) días\)$/,
    (m, t) => t.motivos.publicadoDias(Number(m[1]), Number(m[2])),
  ],
  [
    new RegExp(`^El dato más nuevo tiene ${DURACION}\\. Cobertura desde el ${FECHA}$`),
    (m, t) => t.motivos.datoMasNuevo(duracion(m[1], t), m[2]),
  ],
  [
    new RegExp(`^Huecos en la serie IMERG de hoy: ${DURACION} sin gránulos entre ${HORA} y ${HORA}$`),
    (m, t) => t.motivos.huecoImergUno(duracion(m[1], t), m[2], m[3]),
  ],
  [
    new RegExp(
      `^Huecos en la serie IMERG de hoy: (\\d+) huecos; el mayor, ${DURACION} sin gránulos entre ${HORA} y ${HORA}$`,
    ),
    (m, t) => t.motivos.huecoImergVarios(Number(m[1]), duracion(m[2], t), m[3], m[4]),
  ],
]

function traducirBase(base: string, t: Diccionario['situacion']): string | undefined {
  const cadena = CADENA_VERIFICADA.exec(base)
  if (cadena) return t.cadenaVerificada(cadena[1])
  const clave = CLAVE_POR_ES[base]
  if (clave !== undefined) return t.motivos[clave]
  for (const [patron, traducir] of PATRONES) {
    const m = patron.exec(base)
    if (m) return traducir(m, t)
  }
  return undefined
}

export function traducirMotivo(es: string, t: Diccionario['situacion']): string {
  const conPunto = es.endsWith('.')
  const base = conPunto ? es.slice(0, -1) : es
  const traducido = traducirBase(base, t)
  if (traducido === undefined) return es
  return conPunto ? `${traducido}.` : traducido
}
