// Textos y formatos de la pantalla "estado actual" del director (spec §6 y
// §17). Puro: sin React, sin fetch, sin base — así los tres componentes de
// la pantalla comparten un único lugar donde vive el vocabulario exacto de
// la especificación y las cadenas se pueden probar sin montar nada.
//
// Vocabulario prohibido por spec §5.4: "versión", "entidad", "registro
// histórico", "persistencia". No aparecen en este archivo a propósito.
import type {
  Categoria,
  EstadoEstablecimiento,
  EstadoServicioGeneral,
  SeccionEstablecimiento,
  ServicioAlcance,
  Severidad,
} from '@/lib/infraestructura/trayectoria-tipos'

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
}

export interface AfectacionVigente {
  id: string
  motivo: string
  categoria: Categoria
  severidad: Severidad
  descripcion: string | null
  rigeDesde: string
  secciones: SeccionAfectada[]
  totales: TotalesAfectacion
}

export interface ParteResumen {
  id: string
  cueAnexo: string
  estadoEstablecimiento: EstadoEstablecimiento
  estadoEstablecimientoRigeDesde: string
  actualizadaEn: string
}

export interface EstadoActualRespuesta {
  ok: true
  periodo: { id: string; nombre: string } | null
  parte: ParteResumen | null
  servicio?: { estadoGeneral: EstadoServicioGeneral; alcanceVigente: ServicioAlcance[] }
  afectaciones?: AfectacionVigente[]
  secciones?: SeccionEstablecimiento[]
  ultimaActualizacion?: string | null
}

// --- Cadenas textuales de la especificación ---

// spec §17, "Sin situación en seguimiento". Palabra por palabra.
export const MENSAJE_SIN_SITUACION =
  'No hay una situación hidrometeorológica en seguimiento para este establecimiento.'

// No hay cadena de especificación para una lectura fallida (§17 cubre el
// guardado). Se mantiene la promesa funcional de N9: decir qué pasó y ofrecer
// volver a intentar, sin culpar al director.
export const MENSAJE_ERROR_LECTURA =
  'No pudimos mostrar el estado actual del establecimiento. Intente nuevamente.'

export const MENSAJE_ACCESO_VENCIDO =
  'Su acceso ya no está vigente. Vuelva a ingresar la contraseña para ver el estado actual.'

export const MENSAJE_SIN_CORTE =
  'No hay datos de escuelas disponibles en este momento. Intente nuevamente más tarde.'

// spec §3.4 y §10. "Clases parcialmente suspendidas" es un resultado
// informativo: se muestra, nunca se ofrece como opción de carga.
export const ETIQUETA_SERVICIO: Record<EstadoServicioGeneral, string> = {
  normal: 'Clases normales',
  parcial: 'Clases parcialmente suspendidas',
  suspendido: 'Clases suspendidas',
}

// spec §3.5.
export const ETIQUETA_ESTABLECIMIENTO: Record<EstadoEstablecimiento, string> = {
  habitual: 'Funcionamiento habitual',
  evacuado: 'Establecimiento evacuado',
  centro_evacuados: 'Utilizado como centro de evacuados',
}

// La provincia entera trabaja en un solo huso; fijarlo evita que el parte se
// lea con la hora del dispositivo cuando alguien lo abre desde otro lado.
const ZONA_HORARIA = 'America/Argentina/Buenos_Aires'

const FORMATO_FECHA = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  timeZone: ZONA_HORARIA,
})

const FORMATO_HORA = new Intl.DateTimeFormat('es-AR', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: ZONA_HORARIA,
})

/**
 * "18 de septiembre, 10:30" — el formato de los ejemplos de spec §6 y §15.
 * Un valor ilegible se devuelve tal cual en vez de mostrar "Invalid Date":
 * el director prefiere un dato crudo antes que un error.
 */
export function formatearMomento(iso: string | null | undefined): string | null {
  if (!iso) return null
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return iso
  return `${FORMATO_FECHA.format(fecha)}, ${FORMATO_HORA.format(fecha)}`
}

/**
 * Alcance resumido de una afectación en el formato de spec §6:
 * "3 secciones · 74 alumnos". Omite el tramo de alumnos cuando no hay
 * ninguno alcanzado en vez de escribir "0 alumnos", que se lee como un error
 * de carga.
 */
export function resumirAlcance(totales: TotalesAfectacion): string {
  const partes: string[] = []
  if (totales.secciones > 0) {
    partes.push(totales.secciones === 1 ? '1 sección' : `${totales.secciones} secciones`)
  }
  if (totales.alumnos > 0) {
    partes.push(totales.alumnos === 1 ? '1 alumno' : `${totales.alumnos} alumnos`)
  }
  return partes.length > 0 ? partes.join(' · ') : 'Sin secciones ni alumnos informados'
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
 * acción, "Iniciar un reporte".
 */
export function sinSituacionEnSeguimiento(respuesta: EstadoActualRespuesta): boolean {
  if (!respuesta.periodo || !respuesta.parte) return true
  return (respuesta.afectaciones?.length ?? 0) === 0
}
