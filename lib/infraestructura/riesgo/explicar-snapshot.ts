import { regionPublicaActual } from '@/lib/infraestructura/region/publica'
import { es } from '@/lib/i18n/diccionarios/es'
import type { Diccionario } from '@/lib/i18n/diccionarios/tipos'

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

// 'Alto' and 'Moderado' are spelled the same in Portuguese, so they stay literal.
const ETIQUETA_NIVEL_IGUAL: Partial<Record<NivelMotor, string>> = { alto: 'Alto', moderado: 'Moderado' }

function etiquetaNivel(nivel: NivelMotor, t: Diccionario): string {
  const igual = ETIQUETA_NIVEL_IGUAL[nivel]
  if (igual !== undefined) return igual
  return nivel === 'muy_alto' ? t.libTextos2.riesgoActual.nivel.muyAlto : t.libTextos2.riesgoActual.nivel.bajo
}

function conclusionNivel(nivel: NivelMotor, t: Diccionario): string {
  const c = t.libTextos2.riesgoActual.conclusion
  if (nivel === 'muy_alto') return c.muyAlto
  if (nivel === 'alto') return c.alto
  return nivel === 'moderado' ? c.moderado : c.bajo
}

type TablasRegion = { estaciones: Record<string, string>; rios: Record<string, string> }

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

const TABLAS_POR_REGION: Record<string, TablasRegion> = {
  corrientes: { estaciones: NOMBRE_ESTACION, rios: NOMBRE_RIO },
}

// A region without its own tables gets no river or station names and uses the generic fallback.
function tablasDeRegion(regionId: string): TablasRegion {
  return Object.hasOwn(TABLAS_POR_REGION, regionId) ? TABLAS_POR_REGION[regionId] : { estaciones: {}, rios: {} }
}

const COLORES_PELIGRO = ['verde', 'amarillo', 'naranja', 'rojo']

const REGEX_RIO =
  /^Rio (\S+) en pna-([^:]+):\s*[\d.]+m,\s*estado (\w+) \(alerta ([\d.]+)m, evacuacion ([\d.]+)m\),\s*tendencia (\w+)/i
const REGEX_PELIGRO = /Peligro estimado (\w+) a (\d+)h/i

type EvidenciaFactor = { contribucion: number; texto: string | null }

export function explicarSnapshot(snapshot: SnapshotMotor | null, factores: FactorMotor[], t: Diccionario = es): ExplicacionSnapshot {
  return explicarSnapshotDeRegion(regionPublicaActual().id, snapshot, factores, t)
}

export function explicarSnapshotDeRegion(
  regionId: string,
  snapshot: SnapshotMotor | null,
  factores: FactorMotor[],
  t: Diccionario = es,
): ExplicacionSnapshot {
  const tablas = tablasDeRegion(regionId)
  const detalleTecnico = [...factores]
    .sort((a, b) => (b.contribucion ?? 0) - (a.contribucion ?? 0))
    .map((factor) => ({ titulo: tituloTecnico(factor, t), texto: factor.explicacion ?? '—' }))

  if (snapshot === null || snapshot.nivelRiesgo === null) {
    return {
      nivel: null,
      etiquetaNivel: t.libTextos2.riesgoActual.sinDatos,
      conclusion: t.libTextos2.riesgoActual.sinEvaluar,
      situacionActual: [],
      zonaExpuesta: null,
      detalleTecnico: snapshot === null ? [] : detalleTecnico,
    }
  }

  const nivel = snapshot.nivelRiesgo
  const situacionActual = evidenciaActual(factores, tablas, t)
  const conclusion =
    nivel === 'bajo' && situacionActual.length === 0
      ? t.libTextos2.riesgoActual.sinSenales
      : [conclusionNivel(nivel, t), situacionActual[0]].filter(Boolean).join(' ')

  return {
    nivel,
    etiquetaNivel: etiquetaNivel(nivel, t),
    conclusion,
    situacionActual,
    zonaExpuesta: factores.some(esRioExpuesto) ? t.libTextos2.riesgoActual.zonaExpuesta : null,
    detalleTecnico,
  }
}

function evidenciaActual(factores: FactorMotor[], tablas: TablasRegion, t: Diccionario): string[] {
  return factores
    .filter((f) => (f.contribucion ?? 0) > 0 && f.tipo === 'amenaza')
    .filter((f) => !(f.explicacion ?? '').startsWith('No implementado'))
    .map((f): EvidenciaFactor => ({ contribucion: f.contribucion ?? 0, texto: textoEvidencia(f, tablas, t) }))
    .sort((a, b) => b.contribucion - a.contribucion)
    .flatMap((e) => (e.texto === null ? [] : [e.texto]))
}

function textoEvidencia(factor: FactorMotor, tablas: TablasRegion, t: Diccionario): string | null {
  if (esRio(factor)) return textoRio(factor, tablas, t)
  if (factor.variable === 'superacion_terreno' && factor.valor !== null) return textoRioV04(factor, t)
  if (factor.fuente === 'lluvia-observada') return textoLluvia(factor, t)
  if (factor.fuente === 'peligro-celda') return textoPeligro(factor, t)
  if (factor.explicacion === null) return null
  return t.libTextos2.evidencia.otraSenal(factor.explicacion.replace(/_/g, ' '))
}

function esRio(factor: FactorMotor): boolean {
  return factor.variable === 'altura_rio' && factor.valor !== null && factor.unidad !== 'no_aplica'
}

function esRioExpuesto(factor: FactorMotor): boolean {
  return esRio(factor) && (factor.explicacion ?? '').includes('escuela expuesta')
}

function textoRio(factor: FactorMotor, tablas: TablasRegion, t: Diccionario): string {
  const valor = factor.valor ?? 0
  const fallback = t.libTextos2.evidencia.alturaRioSimple(numero(valor, 2))
  const partes = REGEX_RIO.exec(factor.explicacion ?? '')
  if (partes === null) return fallback

  const [, rio, estacion, estado, alerta, evacuacion, tendencia] = partes
  const clave = estado.toLowerCase()
  // Altura explícita, estado al lado y umbrales como dato secundario.
  const textoEstado =
    clave === 'evacuacion'
      ? t.libTextos2.evidencia.estadoEvacuacion(numero(Number(evacuacion), 2))
      : clave === 'alerta'
        ? t.libTextos2.evidencia.estadoAlerta(numero(Number(alerta), 2))
        : t.libTextos2.evidencia.estadoNormal(numero(Number(alerta), 2))
  const clausulaTendencia = tendenciaTexto(tendencia.toLowerCase(), t)

  return t.libTextos2.evidencia.alturaRio(
    nombreRio(rio, tablas.rios),
    nombreEstacion(estacion, tablas.estaciones),
    `${numero(valor, 2)} m`,
    clausulaTendencia,
    textoEstado,
  )
}

// Factor río del motor v0.4: probabilidad de superación del terreno.
function textoRioV04(factor: FactorMotor, t: Diccionario): string {
  const pct = (p: number) => `${Math.round(p * 100)} %`
  const partes = /a (\d+)h; conservador ([\d.]+)/.exec(factor.explicacion ?? '')
  const plazo = partes === null ? '' : t.libTextos2.evidencia.plazoHoras(partes[1])
  const conservador = partes === null ? '' : t.libTextos2.evidencia.conservador(pct(Number(partes[2])))
  return t.libTextos2.evidencia.probabilidadRio(pct(factor.valor ?? 0), plazo, conservador)
}

function tendenciaTexto(tendencia: string, t: Diccionario): string {
  if (tendencia === 'crece') return t.libTextos2.evidencia.tendenciaCrece
  if (tendencia === 'baja') return t.libTextos2.evidencia.tendenciaBaja
  return ''
}

function textoLluvia(factor: FactorMotor, t: Diccionario): string | null {
  const valor = factor.valor ?? 0
  if (valor < 1) return null
  const ventana = factor.variable === 'acumulado_24h' ? '24 h' : factor.variable === 'acumulado_72h' ? '72 h' : null
  if (ventana === null) return null
  return t.libTextos2.evidencia.lluvia(ventana, numeroMm(valor))
}

function textoPeligro(factor: FactorMotor, t: Diccionario): string | null {
  const partes = REGEX_PELIGRO.exec(factor.explicacion ?? '')
  if (partes === null) return null
  const color = partes[1].toLowerCase()
  const horas = Number(partes[2])
  if (!COLORES_PELIGRO.includes(color)) return null
  const plazo =
    horas > 72 && horas % 24 === 0 ? t.libTextos2.evidencia.plazoDias(String(horas / 24)) : t.libTextos2.evidencia.plazoPeligroHoras(String(horas))
  return t.libTextos2.evidencia.pronosticoPeligro(color, plazo)
}

function tituloTecnico(factor: FactorMotor, t: Diccionario): string {
  const tipo = t.libTextos2.tipoFactor[factor.tipo as keyof typeof t.libTextos2.tipoFactor] ?? factor.tipo
  return `${tipo} · ${factor.variable.replace(/_/g, ' ')}`
}

function nombreEstacion(slug: string, nombres: Record<string, string>): string {
  const clave = slug.replace(/^pna-/, '').replace(/-/g, ' ').toLowerCase()
  return nombres[clave] ?? capitalizar(clave)
}

function nombreRio(nombre: string, nombres: Record<string, string>): string {
  const clave = nombre.toLowerCase()
  return nombres[clave] ?? capitalizar(clave)
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
