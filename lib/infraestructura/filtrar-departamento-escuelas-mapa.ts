import { normalizarNombreDepartamento } from '@/lib/mapas/departamentos'
import type { EscuelasMapaResultado } from './parte-mapa'

export function filtrarDepartamentoEscuelasMapa(
  data: EscuelasMapaResultado,
  departamento: string | null,
): EscuelasMapaResultado {
  if (!departamento) return data
  const clave = normalizarNombreDepartamento(departamento)
  const escuelas = data.escuelas.filter(
    (escuela) => normalizarNombreDepartamento(escuela.departamento) === clave,
  )
  const sinUbicacion = data.sinUbicacion.filter(
    (escuela) => normalizarNombreDepartamento(escuela.departamento) === clave,
  )
  return { escuelas, sinUbicacion, totalPadron: escuelas.length + sinUbicacion.length }
}
