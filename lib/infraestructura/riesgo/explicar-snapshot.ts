export type NivelMotor = 'bajo' | 'moderado' | 'alto' | 'muy_alto'

export type FactorMotor = {
  tipo: string
  fuente: string
  variable: string
  valor: number | null
  unidad: string | null
  contribucion: number | null
  explicacion: string | null
  observadoEn: string | null
}

export type SnapshotMotor = {
  nivelRiesgo: NivelMotor | null
  scoreRiesgo: number | null
  horizonteHoras: number
  calculadoEn: string
}

export type ExplicacionSnapshot = {
  nivel: NivelMotor | null
  etiquetaNivel: string
  conclusion: string
  situacionActual: string[]
  zonaExpuesta: string | null
  detalleTecnico: { titulo: string; texto: string }[]
}

const SIN_EVALUAR = 'El motor de riesgo todavía no evaluó esta escuela.'
const ZONA_EXPUESTA = 'La escuela está en zona expuesta a crecidas del río.'
const SIN_SENALES = 'Riesgo actual bajo: sin señales de lluvia ni de río para hoy.'

const ETIQUETA_NIVEL: Record<NivelMotor, string> = {
  bajo: 'Bajo',
  moderado: 'Moderado',
  alto: 'Alto',
  muy_alto: 'Muy alto',
}

const CONCLUSION_NIVEL: Record<NivelMotor, string> = {
  muy_alto: 'Riesgo actual muy alto.',
  alto: 'Riesgo actual alto.',
  moderado: 'Riesgo actual moderado: conviene seguir la evolución.',
  bajo: 'Riesgo actual bajo.',
}

const ETIQUETA_TIPO: Record<string, string> = {
  amenaza: 'Amenaza',
  vulnerabilidad: 'Vulnerabilidad',
  exposicion: 'Exposición',
  urgencia: 'Urgencia',
  acceso: 'Acceso',
}

const NOMBRE_ESTACION: Record<string, string> = {
  ituzaingo: 'Ituzaingó',
  corrientes: 'Corrientes',
  'paso de la patria': 'Paso de la Patria',
  'bella vista': 'Bella Vista',
  goya: 'Goya',
  esquina: 'Esquina',
  empedrado: 'Empedrado',
  itati: 'Itatí',
  'ita ibate': 'Itá Ibaté',
}

const NOMBRE_RIO: Record<string, string> = {
  parana: 'Paraná',
  uruguay: 'Uruguay',
  paraguay: 'Paraguay',
}

const COLORES_PELIGRO = ['verde', 'amarillo', 'naranja', 'rojo']

const REGEX_RIO =
  /^Rio (\S+) en pna-([^:]+):\s*[\d.]+m,\s*estado (\w+) \(alerta ([\d.]+)m, evacuacion ([\d.]+)m\),\s*tendencia (\w+)/i
const REGEX_PELIGRO = /Peligro estimado (\w+) a (\d+)h/i

type EvidenciaFactor = { contribucion: number; texto: string | null }

export function explicarSnapshot(snapshot: SnapshotMotor | null, factores: FactorMotor[]): ExplicacionSnapshot {
  const detalleTecnico = [...factores]
    .sort((a, b) => (b.contribucion ?? 0) - (a.contribucion ?? 0))
    .map((factor) => ({ titulo: tituloTecnico(factor), texto: factor.explicacion ?? '—' }))

  if (snapshot === null || snapshot.nivelRiesgo === null) {
    return {
      nivel: null,
      etiquetaNivel: 'Sin datos',
      conclusion: SIN_EVALUAR,
      situacionActual: [],
      zonaExpuesta: null,
      detalleTecnico: snapshot === null ? [] : detalleTecnico,
    }
  }

  const nivel = snapshot.nivelRiesgo
  const situacionActual = evidenciaActual(factores)
  const conclusion =
    nivel === 'bajo' && situacionActual.length === 0
      ? SIN_SENALES
      : [CONCLUSION_NIVEL[nivel], situacionActual[0]].filter(Boolean).join(' ')

  return {
    nivel,
    etiquetaNivel: ETIQUETA_NIVEL[nivel],
    conclusion,
    situacionActual,
    zonaExpuesta: factores.some(esRioExpuesto) ? ZONA_EXPUESTA : null,
    detalleTecnico,
  }
}

function evidenciaActual(factores: FactorMotor[]): string[] {
  return factores
    .filter((f) => (f.contribucion ?? 0) > 0 && f.tipo === 'amenaza')
    .filter((f) => !(f.explicacion ?? '').startsWith('No implementado'))
    .map((f): EvidenciaFactor => ({ contribucion: f.contribucion ?? 0, texto: textoEvidencia(f) }))
    .sort((a, b) => b.contribucion - a.contribucion)
    .flatMap((e) => (e.texto === null ? [] : [e.texto]))
}

function textoEvidencia(factor: FactorMotor): string | null {
  if (esRio(factor)) return textoRio(factor)
  if (factor.variable === 'superacion_terreno' && factor.valor !== null) return textoRioV04(factor)
  if (factor.fuente === 'lluvia-observada') return textoLluvia(factor)
  if (factor.fuente === 'peligro-celda') return textoPeligro(factor)
  if (factor.explicacion === null) return null
  return `Otra señal: ${factor.explicacion.replace(/_/g, ' ')}.`
}

function esRio(factor: FactorMotor): boolean {
  return factor.variable === 'altura_rio' && factor.valor !== null && factor.unidad !== 'no_aplica'
}

function esRioExpuesto(factor: FactorMotor): boolean {
  return esRio(factor) && (factor.explicacion ?? '').includes('escuela expuesta')
}

function textoRio(factor: FactorMotor): string {
  const valor = factor.valor ?? 0
  const fallback = `Altura del río: ${numero(valor, 2)} m.`
  const partes = REGEX_RIO.exec(factor.explicacion ?? '')
  if (partes === null) return fallback

  const [, rio, estacion, estado, alerta, evacuacion, tendencia] = partes
  const clave = estado.toLowerCase()
  // Altura explícita, estado al lado y umbrales como dato secundario.
  const textoEstado =
    clave === 'evacuacion'
      ? `Evacuación (evacuación ${numero(Number(evacuacion), 2)} m)`
      : clave === 'alerta'
        ? `Alerta (alerta ${numero(Number(alerta), 2)} m)`
        : `Normal (alerta ${numero(Number(alerta), 2)} m)`
  const clausulaTendencia = TENDENCIA[tendencia.toLowerCase()] ?? ''

  return `Río ${nombreRio(rio)} en ${nombreEstacion(estacion)} — Altura del río: ${numero(valor, 2)} m${clausulaTendencia} · ${textoEstado}.`
}

// Factor río del motor v0.4: probabilidad de superación del terreno.
function textoRioV04(factor: FactorMotor): string {
  const pct = (p: number) => `${Math.round(p * 100)} %`
  const partes = /a (\d+)h; conservador ([\d.]+)/.exec(factor.explicacion ?? '')
  const plazo = partes === null ? '' : ` en las próximas ${partes[1]} h`
  const conservador = partes === null ? '' : ` (escenario conservador ${pct(Number(partes[2]))})`
  return `Río: probabilidad ${pct(factor.valor ?? 0)} de que el agua supere el terreno de la escuela${plazo}${conservador}.`
}

const TENDENCIA: Record<string, string> = {
  crece: ' y creciendo',
  baja: ' y bajando',
}

function textoLluvia(factor: FactorMotor): string | null {
  const valor = factor.valor ?? 0
  if (valor < 1) return null
  const ventana = factor.variable === 'acumulado_24h' ? '24 h' : factor.variable === 'acumulado_72h' ? '72 h' : null
  if (ventana === null) return null
  return `Lluvia de las últimas ${ventana}: ${numeroMm(valor)} mm.`
}

function textoPeligro(factor: FactorMotor): string | null {
  const partes = REGEX_PELIGRO.exec(factor.explicacion ?? '')
  if (partes === null) return null
  const color = partes[1].toLowerCase()
  const horas = Number(partes[2])
  if (!COLORES_PELIGRO.includes(color)) return null
  const plazo = horas > 72 && horas % 24 === 0 ? `en los próximos ${horas / 24} días` : `en las próximas ${horas} h`
  return `Pronóstico de lluvia: peligro ${color} ${plazo}.`
}

function tituloTecnico(factor: FactorMotor): string {
  const tipo = ETIQUETA_TIPO[factor.tipo] ?? factor.tipo
  return `${tipo} · ${factor.variable.replace(/_/g, ' ')}`
}

function nombreEstacion(slug: string): string {
  const clave = slug.replace(/^pna-/, '').replace(/-/g, ' ').toLowerCase()
  return NOMBRE_ESTACION[clave] ?? capitalizar(clave)
}

function nombreRio(nombre: string): string {
  const clave = nombre.toLowerCase()
  return NOMBRE_RIO[clave] ?? capitalizar(clave)
}

function capitalizar(texto: string): string {
  return texto
    .split(' ')
    .map((palabra) => (palabra.length === 0 ? palabra : palabra[0].toUpperCase() + palabra.slice(1)))
    .join(' ')
}

function numero(valor: number, decimales: number): string {
  return valor.toFixed(decimales).replace('.', ',')
}

function numeroMm(mm: number): string {
  return mm < 10 ? numero(mm, 1) : String(Math.round(mm))
}
