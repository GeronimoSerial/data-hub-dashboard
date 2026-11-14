// Short, per-situation events of a movement for the school ficha. Unlike
// describirMovimiento (full prose for the director's history), each event
// names the situation it belongs to, so the ficha can show how one
// situation evolved and a compact log line for the whole school.
import { normalizarDiff, type TipoMovimientoDescrito } from './movimiento-descripcion'
import type { DiffAlcanceCambio, DiffParte } from './movimiento-diff'
import type { EstadoEstablecimiento } from './trayectoria-tipos'
import { SEVERIDADES, type Severidad } from './validacion'

export type TipoEvento =
  | 'nueva'
  | 'gravedad'
  | 'alcance'
  | 'confirmada'
  | 'solucionada'
  | 'retirada'
  | 'datos'
  | 'general'
  | 'evidencia'

export interface EventoMovimiento {
  tipo: TipoEvento
  /** Situation the event belongs to; null for school-wide changes. */
  afectacionId: string | null
  motivo: string | null
  severidad?: Severidad
  /** Log line, names the situation: "Anegamiento pasó a crítica". */
  texto: string
  /** Step label inside the situation's own evolution: "↑ Crítica". */
  paso: string
}

const EDIFICIO_TEXTO: Record<EstadoEstablecimiento, string> = {
  habitual: 'habitual',
  parcial: 'parcial',
  evacuado: 'evacuado',
  centro_evacuados: 'centro de evacuados',
  sin_clases: 'sin clases',
}

function unidadCorta(unidad: DiffAlcanceCambio['unidad']): string {
  return unidad === 'carrera' ? 'carr.' : 'secc.'
}

function alcanceInicial(secciones: number, alumnos: number, todaLaEscuela: boolean | undefined, unidad: DiffAlcanceCambio['unidad']): string | null {
  if (todaLaEscuela) return 'toda la escuela'
  if (secciones > 0) return `${secciones} ${unidadCorta(unidad)}`
  if (alumnos > 0) return `${alumnos} ${alumnos === 1 ? 'alumno' : 'alumnos'}`
  return null
}

function alcanceNeto(cambio: DiffAlcanceCambio): string {
  if (cambio.todaLaEscuela && cambio.seccionesRetiradas + cambio.alumnosRetirados === 0) return 'Toda la escuela'
  const secciones = cambio.seccionesAgregadas - cambio.seccionesRetiradas
  if (secciones !== 0) return `${secciones > 0 ? '+' : '−'}${Math.abs(secciones)} ${unidadCorta(cambio.unidad)}`
  const alumnos = cambio.alumnosAgregados - cambio.alumnosRetirados
  if (alumnos !== 0) return `${alumnos > 0 ? '+' : '−'}${Math.abs(alumnos)} alumnos`
  return 'Alcance ajustado'
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export function eventosMovimiento(resumen: DiffParte, tipo: TipoMovimientoDescrito): EventoMovimiento[] {
  if (tipo === 'evidencia_fotografica') {
    return [{ tipo: 'evidencia', afectacionId: null, motivo: null, texto: 'Fotos agregadas', paso: 'Fotos' }]
  }
  const diff = normalizarDiff(resumen)
  const eventos: EventoMovimiento[] = []

  for (const agregada of diff.afectacionesAgregadas) {
    const alcance = alcanceInicial(agregada.secciones, agregada.alumnos, agregada.todaLaEscuela, agregada.unidad)
    eventos.push({
      tipo: 'nueva',
      afectacionId: agregada.afectacionId,
      motivo: agregada.motivo,
      severidad: agregada.severidad,
      texto: `Nueva: ${agregada.motivo} · ${agregada.severidad.toLowerCase()}`,
      paso: alcance ? `${agregada.severidad} · ${alcance}` : agregada.severidad,
    })
  }

  for (const cambio of diff.severidadesCambiadas) {
    const sube = SEVERIDADES.indexOf(cambio.a) > SEVERIDADES.indexOf(cambio.de)
    eventos.push({
      tipo: 'gravedad',
      afectacionId: cambio.afectacionId,
      motivo: cambio.motivo,
      severidad: cambio.a,
      texto: `${cambio.motivo} pasó a ${cambio.a.toLowerCase()}`,
      paso: `${sube ? '↑' : '↓'} ${cambio.a}`,
    })
  }

  for (const cambio of diff.alcancesCambiados) {
    const neto = alcanceNeto(cambio)
    eventos.push({
      tipo: 'alcance',
      afectacionId: cambio.afectacionId,
      motivo: cambio.motivo,
      texto: `${cambio.motivo}: ${neto === 'Toda la escuela' ? 'toda la escuela' : neto}`,
      paso: neto,
    })
  }

  for (const cambio of diff.datosCambiados ?? []) {
    const descripcion = cambio.campos.find((campo) => campo.campo === 'descripcion' && campo.a)
    const renombre = cambio.campos.find((campo) => campo.campo === 'motivo' && campo.a)
    eventos.push(
      descripcion
        ? { tipo: 'datos', afectacionId: cambio.afectacionId, motivo: cambio.motivo, texto: `${cambio.motivo}: «${descripcion.a}»`, paso: 'Nueva observación' }
        : renombre
          ? { tipo: 'datos', afectacionId: cambio.afectacionId, motivo: cambio.motivo, texto: `Renombrada: ${renombre.de ?? ''} → ${renombre.a}`, paso: 'Renombrada' }
          : { tipo: 'datos', afectacionId: cambio.afectacionId, motivo: cambio.motivo, texto: `${cambio.motivo}: datos corregidos`, paso: 'Datos corregidos' },
    )
  }

  for (const confirmada of diff.afectacionesConfirmadas ?? []) {
    eventos.push({
      tipo: 'confirmada',
      afectacionId: confirmada.afectacionId,
      motivo: confirmada.motivo,
      texto: `${confirmada.motivo} sigue igual`,
      paso: 'Sigue igual',
    })
  }

  for (const retirada of diff.afectacionesRetiradas) {
    const solucionada = retirada.cierre !== 'retirada'
    eventos.push({
      tipo: solucionada ? 'solucionada' : 'retirada',
      afectacionId: retirada.afectacionId,
      motivo: retirada.motivo,
      texto: solucionada ? `Resuelta: ${retirada.motivo}` : `Se quitó: ${retirada.motivo}`,
      paso: solucionada ? 'Resuelta' : 'Se quitó',
    })
  }

  if (diff.serviciosCambiados.length > 0) {
    const interrumpe = diff.serviciosCambiados.some((cambio) => cambio.a === 'suspendido')
    const texto = interrumpe ? 'Se interrumpieron clases' : 'Se retomaron clases'
    eventos.push({ tipo: 'general', afectacionId: null, motivo: null, texto, paso: texto })
  }
  if (diff.establecimientoCambiado) {
    const texto = `Edificio: ${EDIFICIO_TEXTO[diff.establecimientoCambiado.a]}`
    eventos.push({ tipo: 'general', afectacionId: null, motivo: null, texto, paso: capitalizar(texto) })
  }
  if (diff.asistenciaPedagogicaCambiada) {
    const texto = 'Cambió la asistencia pedagógica'
    eventos.push({ tipo: 'general', afectacionId: null, motivo: null, texto, paso: texto })
  }

  if (eventos.length === 0) {
    const texto = tipo === 'confirmacion' ? 'Parte confirmado sin cambios' : 'Parte actualizado'
    eventos.push({ tipo: tipo === 'confirmacion' ? 'confirmada' : 'general', afectacionId: null, motivo: null, texto, paso: texto })
  }
  return eventos
}
