import { normalizarNombreDepartamento } from '@/lib/mapas/departamentos'
import type { EscuelasMapaResultado } from './parte-mapa'

export function filtrarDepartamentoEscuelasMapa<T extends EscuelasMapaResultado>(
  data: T,
  departamento: string | null,
): T {
  if (!departamento) return data
  const clave = normalizarNombreDepartamento(departamento)
  const escuelas = data.escuelas.filter(
    (escuela) => normalizarNombreDepartamento(escuela.departamento) === clave,
  )
  const sinUbicacion = data.sinUbicacion.filter(
    (escuela) => normalizarNombreDepartamento(escuela.departamento) === clave,
  )
  return { ...data, escuelas, sinUbicacion, totalPadron: escuelas.length + sinUbicacion.length }
}
