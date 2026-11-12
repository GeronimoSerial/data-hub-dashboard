import { prioridadEfectiva, type ImpactoAlumnos } from './prioridad-alumnos'
import { SEVERIDADES, type Severidad } from './validacion'
import { claveServicioAlcance, resolverAlcanceVigente } from './vigencia-alcance'
import type { SeccionEstablecimiento, ServicioAlcance } from './trayectoria-tipos'
import type { EstadoClases } from './mapa/tipos'
import { es } from '@/lib/i18n/diccionarios/es'
import type { Diccionario } from '@/lib/i18n/diccionarios/tipos'

export function etiquetaFuncionamiento(
  situaciones: readonly { severidad: Severidad; impactoAlumnos?: ImpactoAlumnos }[],
  t: Diccionario = es,
): string {
  const textos = t.libTextos.funcionamiento
  if (situaciones.length === 0) return textos.sinAfectaciones
  let mayor: Severidad | null = null
  for (const situacion of situaciones) {
    const severidad = prioridadEfectiva(situacion)
    if (severidad !== null && (mayor === null || SEVERIDADES.indexOf(severidad) > SEVERIDADES.indexOf(mayor))) {
      mayor = severidad
    }
  }
  return mayor === null ? textos.sinDatos : textos.severidad[mayor]
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

export function etiquetaClases(estado: EstadoClases, informadas: boolean, t: Diccionario = es): string {
  const textos = t.libTextos.funcionamiento
  return informadas ? textos.clases[estado] : textos.sinInformacionClases
}
