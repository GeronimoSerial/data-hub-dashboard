import { formatoFechaRegion, localeRegion } from '@/lib/infraestructura/formato-region'
import type { ImpactoAlumnos } from '@/lib/infraestructura/prioridad-alumnos'
// Textos y formatos de la pantalla "estado actual" del director (spec §6 y
// §17). Puro: sin React, sin fetch, sin base — así los tres componentes de
// la pantalla comparten un único lugar donde vive el vocabulario exacto de
// la especificación y las cadenas se pueden probar sin montar nada.
//
// Vocabulario prohibido por spec §5.4: "versión", "entidad", "registro
// histórico", "persistencia". No aparecen en este archivo a propósito.
import type {
  Categoria,
  AsistenciaPedagogica,
  EstadoEstablecimiento,
  EstadoServicioGeneral,
  SeccionEstablecimiento,
  ServicioAlcance,
  Severidad,
  SituacionReciente,
} from '@/lib/infraestructura/trayectoria-tipos'
import { textoAlcanceInstituto } from '@/lib/infraestructura/parte/instituto-ui'
import { fichaPanoramaEs } from '@/lib/i18n/diccionarios/grupos/fichaPanorama.es'
import { es } from '@/lib/i18n/diccionarios/es'
import type { Diccionario } from '@/lib/i18n/diccionarios/tipos'

export type { SituacionReciente } from '@/lib/infraestructura/trayectoria-tipos'

// --- Forma de la respuesta de GET /api/problematicas/parte ---
//
// `servicio`, `afectaciones`, `secciones` y `ultimaActualizacion` son
// opcionales a propósito: cuando no hay período vigente la ruta responde 200
// con `{ ok, periodo: null, parte: null, mensaje }` y esos campos no viajan.
// Tratarlos como obligatorios haría que la pantalla se rompa justamente en el
// caso vacío, que es el más frecuente al inicio del período.

export interface AlumnoAfectado {
  gePersonId: number
  nombre: string
  apellido: string
}

export interface SeccionAfectada {
  geSectionId: number
  seccionCompleta: boolean
  alumnos: AlumnoAfectado[]
}

export interface TotalesAfectacion {
  secciones: number
  alumnos: number
  /** Sólo institutos superiores: carreras alcanzadas por la afectación. */
  carreras?: number
}

/** Carrera de un instituto superior alcanzada por una afectación vigente. */
export interface CarreraAfectadaVigente {
  id: number
  nombre: string
  completa: boolean
  alumnos: { id: number; nombre: string; apellido: string }[]
}

export interface AfectacionVigente {
  impactoAlumnos?: ImpactoAlumnos
  id: string
  motivo: string
  categoria: Categoria
  severidad: Severidad
  descripcion: string | null
  rigeDesde: string
  creadaEn: string
  causadaPorId: string | null
  secciones: SeccionAfectada[]
  /** Sólo institutos superiores. */
  carreras?: CarreraAfectadaVigente[]
  totales: TotalesAfectacion
}

export interface ParteResumen {
  id: string
  cueAnexo: string
  estadoEstablecimiento: EstadoEstablecimiento
  estadoEstablecimientoRigeDesde: string
  actualizadaEn: string
  asistenciaPedagogica?: AsistenciaPedagogica | null
}

export interface EstadoActualRespuesta {
  ok: true
  periodo: { id: string; nombre: string } | null
  parte: ParteResumen | null
  servicio?: { estadoGeneral: EstadoServicioGeneral; alcanceVigente: ServicioAlcance[] }
  afectaciones?: AfectacionVigente[]
  secciones?: SeccionEstablecimiento[]
  ultimaActualizacion?: string | null
  recientes?: SituacionReciente[]
  ultimaCarga?: { creadaEn: string; titulo: string; cambios: string[] } | null
}

// --- Cadenas textuales de la especificación ---

// spec §17, "Sin situación en seguimiento". Palabra por palabra.
// Textos en español (diccionario `fichaPanorama`). La pantalla pt los toma del
// diccionario directamente; estas constantes se conservan para quien las usa en es.
export const MENSAJE_SIN_SITUACION = fichaPanoramaEs.parte.sinSituacion

// No hay cadena de especificación para una lectura fallida (§17 cubre el
// guardado). Se mantiene la promesa funcional de N9: decir qué pasó y ofrecer
// volver a intentar, sin culpar al director.
export const MENSAJE_ERROR_LECTURA = fichaPanoramaEs.parte.errorLectura

export const MENSAJE_ACCESO_VENCIDO = fichaPanoramaEs.parte.accesoVencido

export const MENSAJE_SIN_CORTE = fichaPanoramaEs.parte.sinCorte

// spec §3.4 y §10. El funcionamiento parcialmente interrumpido es un resultado
// informativo: se muestra, nunca se ofrece como opción de carga.
export const ETIQUETA_SERVICIO: Record<EstadoServicioGeneral, string> = {
  normal: 'Funcionamiento habitual',
  parcial: 'Funcionamiento parcialmente interrumpido',
  suspendido: 'Funcionamiento interrumpido',
}

// Respuestas de la pregunta de carga "¿Hay clases?" (spec rediseño §5.6).
export const ETIQUETA_CLASES: Record<'normal' | 'suspendido', string> = {
  normal: 'Sí, con normalidad',
  suspendido: 'No, se suspendieron',
}

// spec §3.5.
// Todo el edificio sin clases sin estar evacuado (p. ej. sin agua ni energía).
export const ETIQUETA_ESTABLECIMIENTO: Record<EstadoEstablecimiento, string> = fichaPanoramaEs.establecimiento

function formatoFecha(): Intl.DateTimeFormat {
  return formatoFechaRegion(localeRegion(), { day: 'numeric', month: 'long' })
}

function formatoHora(): Intl.DateTimeFormat {
  return formatoFechaRegion(localeRegion(), { hour: '2-digit', minute: '2-digit', hour12: false })
}

/**
 * "18 de septiembre, 10:30" — el formato de los ejemplos de spec §6 y §15.
 * Un valor ilegible se devuelve tal cual en vez de mostrar "Invalid Date":
 * el director prefiere un dato crudo antes que un error.
 */
export function formatearMomento(iso: string | null | undefined): string | null {
  if (!iso) return null
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return iso
  return `${formatoFecha().format(fecha)}, ${formatoHora().format(fecha)}`
}

/**
 * Alcance resumido de una afectación en el formato de spec §6:
 * "3 secciones · 74 alumnos". Omite el tramo de alumnos cuando no hay
 * ninguno alcanzado en vez de escribir "0 alumnos", que se lee como un error
 * de carga.
 */
export function resumirAlcance(
  totales: TotalesAfectacion,
  textos: Diccionario['fichaPanorama']['alcance'] = fichaPanoramaEs.alcance,
  t: Diccionario = es,
): string {
  if ((totales.carreras ?? 0) > 0) return textoAlcanceInstituto(totales.carreras ?? 0, totales.alumnos, t)
  const partes: string[] = []
  if (totales.secciones > 0) partes.push(textos.secciones(totales.secciones))
  if (totales.alumnos > 0) partes.push(textos.alumnos(totales.alumnos))
  return partes.length > 0 ? partes.join(' · ') : textos.sinSecciones
}

/**
 * Momento desde el cual rige el estado del servicio que se está mostrando:
 * el más reciente de los alcances vigentes. Deliberadamente NO recalcula el
 * estado general — eso lo deriva el servidor (spec §3.4) y esta pantalla lo
 * consume tal cual.
 */
export function rigeDesdeDelServicio(alcanceVigente: ServicioAlcance[] | undefined): string | null {
  if (!alcanceVigente || alcanceVigente.length === 0) return null
  let masReciente: string | null = null
  for (const fila of alcanceVigente) {
    if (masReciente === null || fila.rigeDesde > masReciente) masReciente = fila.rigeDesde
  }
  return masReciente
}

/**
 * "Sin situación en seguimiento" según spec §17: no hay período provincial
 * abierto, todavía no se inició el parte, o el parte no tiene ninguna
 * afectación vigente. Los tres casos se comunican igual y ofrecen la misma
 * acción, "Cargar una situación".
 */
export function sinSituacionEnSeguimiento(respuesta: EstadoActualRespuesta): boolean {
  if (!respuesta.periodo || !respuesta.parte) return true
  return (respuesta.afectaciones?.length ?? 0) === 0
}
