import { prioridadEfectiva, type ImpactoAlumnos } from './prioridad-alumnos'
import { SEVERIDADES, type Severidad } from './validacion'
import { claveServicioAlcance, resolverAlcanceVigente } from './vigencia-alcance'
import type { SeccionEstablecimiento, ServicioAlcance } from './trayectoria-tipos'
import type { EstadoClases } from './mapa/tipos'

const ETIQUETAS_FUNCIONAMIENTO: Record<Severidad, string> = {
  Baja: 'Funcionamiento con afectación leve',
  Media: 'Funcionamiento afectado',
  Alta: 'Funcionamiento gravemente afectado',
  Crítica: 'Funcionamiento críticamente afectado',
}

export function etiquetaFuncionamiento(
  situaciones: readonly { severidad: Severidad; impactoAlumnos?: ImpactoAlumnos }[],
): string {
  if (situaciones.length === 0) return 'Sin afectaciones reportadas'
  let mayor: Severidad | null = null
  for (const situacion of situaciones) {
    const severidad = prioridadEfectiva(situacion)
    if (severidad !== null && (mayor === null || SEVERIDADES.indexOf(severidad) > SEVERIDADES.indexOf(mayor))) {
      mayor = severidad
    }
  }
  return mayor === null ? 'Sin datos para calcular el funcionamiento' : ETIQUETAS_FUNCIONAMIENTO[mayor]
}

export function tieneServicioInformado(
  alcance: readonly ServicioAlcance[],
  secciones: readonly SeccionEstablecimiento[],
  carreras: readonly number[] = [],
): boolean {
  const vigentes = resolverAlcanceVigente([...alcance], { clave: claveServicioAlcance })
  const porAlcance = new Map(vigentes.map((fila) => [claveServicioAlcance(fila), fila.estado]))
  const establecimiento = porAlcance.get(claveServicioAlcance({ tipo: 'establecimiento', referenciaId: null }))
  const estadoDe = (tipo: 'seccion' | 'turno' | 'carrera', referenciaId: string) =>
    porAlcance.get(claveServicioAlcance({ tipo, referenciaId }))

  if (carreras.length === 0 && secciones.length === 0) {
    return establecimiento !== undefined || vigentes.some((fila) => fila.tipo === 'turno' && fila.estado === 'suspendido')
  }

  const estados = carreras.length > 0
    ? carreras.map((carrera) => estadoDe('carrera', String(carrera)) ?? establecimiento)
    : secciones.map((seccion) => estadoDe('seccion', String(seccion.geSectionId)) ?? estadoDe('turno', seccion.turno) ?? establecimiento)

  // A reported suspension establishes interruption even when another unit is unknown;
  // claiming normal classes requires explicit coverage of every current unit.
  return estados.some((estado) => estado === 'suspendido') || estados.every((estado) => estado !== undefined)
}

const ETIQUETAS_CLASES: Record<EstadoClases, string> = {
  normal: 'Clases normales',
  parcial: 'Clases parcialmente suspendidas',
  sin: 'Clases suspendidas',
  evacuado: 'Evacuado',
  centro: 'Usado como centro de evacuados',
}

export function etiquetaClases(estado: EstadoClases, informadas: boolean): string {
  return informadas ? ETIQUETAS_CLASES[estado] : 'Sin información de clases'
}
