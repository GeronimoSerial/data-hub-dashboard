import type { Diccionario } from '@/lib/i18n'

// Presentation only: the lib keeps returning Spanish briefing lines and timeline
// descriptions (APIs are snapshot-pinned). Each known line maps to its dictionary
// sentence, whole-line patterns carry the interpolated values, and anything else
// falls back to the original string.

type Situacion = Diccionario['situacion']
type Traduccion = (t: Situacion) => string

const FECHA_ISO = '(\\d{4}-\\d{2}-\\d{2})'

const EXACTOS = new Map<string, Traduccion>([
  ['Primer resumen del día; todavía no hay un corte anterior para comparar.', (t) => t.briefing.primerResumen],
  ['No hay conteos del corte anterior para comparar.', (t) => t.briefing.sinConteosAnterior],
  ['Sin cambios significativos respecto del corte anterior.', (t) => t.briefing.sinCambios],
  ['Cobertura con evidencia: sin dato.', (t) => t.briefing.coberturaSinDato],
  ['Sin evidencia válida: sin dato.', (t) => t.briefing.sinEvidenciaSinDato],
  ['Actualización del parte', (t) => t.descripciones.actualizacionParte],
])

const PATRONES: Array<[RegExp, (m: RegExpExecArray, t: Situacion) => string]> = [
  [
    /^Las escuelas en riesgo alto o muy alto subieron de (\d+) a (\d+) \((\d+) más que en el corte anterior\)\.$/,
    (m, t) => t.briefing.subieron(Number(m[1]), Number(m[2]), Number(m[3])),
  ],
  [
    /^Las escuelas en riesgo alto o muy alto bajaron de (\d+) a (\d+) \((\d+) menos que en el corte anterior\)\.$/,
    (m, t) => t.briefing.bajaron(Number(m[1]), Number(m[2]), Number(m[3])),
  ],
  [
    /^Cobertura con evidencia: (\d+) de (\d+) escuelas procesadas \((\d+)%\)\.(?: Antes: (\d+)\.)?$/,
    (m, t) =>
      t.briefing.cobertura(Number(m[1]), Number(m[2]), Number(m[3])) +
      (m[4] === undefined ? '' : t.briefing.antes(Number(m[4]))),
  ],
  [/^Sin evidencia válida: (\d+) escuelas\.$/, (m, t) => t.briefing.sinEvidencia(Number(m[1]))],
  [
    new RegExp(`^Corte publicado el ${FECHA_ISO}\\.(?: Corte anterior: ${FECHA_ISO}\\.)?$`),
    (m, t) => t.briefing.corte(m[1]!) + (m[2] === undefined ? '' : t.briefing.corteAnterior(m[2])),
  ],
  [
    /^Episodio abierto en (.+) \((\d+) escuelas afectadas\)$/,
    (m, t) => t.descripciones.episodioAbierto(m[1]!, Number(m[2])),
  ],
  [/^Episodio cerrado en (.+)$/, (m, t) => t.descripciones.episodioCerrado(m[1]!)],
  [
    /^Escuelas en riesgo alto o muy alto subieron de (\d+) a (\d+)$/,
    (m, t) => t.descripciones.riesgoSubio(Number(m[1]), Number(m[2])),
  ],
  [
    /^Escuelas en riesgo alto o muy alto bajaron de (\d+) a (\d+)$/,
    (m, t) => t.descripciones.riesgoBajo(Number(m[1]), Number(m[2])),
  ],
]

export function traducirPlantilla(linea: string, t: Situacion): string {
  const exacto = EXACTOS.get(linea)
  if (exacto) return exacto(t)
  for (const [patron, traducir] of PATRONES) {
    const m = patron.exec(linea)
    if (m) return traducir(m, t)
  }
  return linea
}
