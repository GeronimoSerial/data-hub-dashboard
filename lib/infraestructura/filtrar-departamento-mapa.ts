import { normalizarNombreDepartamento } from '@/lib/mapas/departamentos'
import type { RespuestaPartesMapa } from './use-alertas'
import type { IndicadoresMapa, ParteMapa } from './parte-mapa'
import { UMBRAL_SIN_ACTUALIZAR_HORAS } from './umbrales'

export function indicadoresDePartes(partes: ParteMapa[], ahoraMs: number): IndicadoresMapa {
  const umbralMs = UMBRAL_SIN_ACTUALIZAR_HORAS * 60 * 60 * 1000
  return {
    escuelas: partes.length,
    conServicioSuspendido: partes.filter((p) => p.servicio === 'suspendido').length,
    conServicioParcial: partes.filter((p) => p.servicio === 'parcial').length,
    evacuadas: partes.filter((p) => p.estadoEstablecimiento === 'evacuado').length,
    establecimientosParciales: partes.filter((p) => p.estadoEstablecimiento === 'parcial').length,
    centrosDeEvacuados: partes.filter((p) => p.estadoEstablecimiento === 'centro_evacuados').length,
    sinActualizar: partes.filter((p) => ahoraMs - new Date(p.actualizadaEn).getTime() > umbralMs).length,
    alumnosAlcanzados: partes.reduce((total, p) => total + p.alumnosAlcanzados, 0),
    seccionesAlcanzadas: partes.reduce((total, p) => total + p.seccionesAlcanzadas, 0),
  }
}

export function filtrarDepartamentoMapa(
  data: RespuestaPartesMapa,
  departamento: string | null,
  ahoraMs: number | null,
): RespuestaPartesMapa {
  if (!departamento) return data
  const clave = normalizarNombreDepartamento(departamento)
  const partes = data.partes.filter(
    (parte) => normalizarNombreDepartamento(parte.departamento) === clave,
  )
  return { partes, indicadores: indicadoresDePartes(partes, ahoraMs ?? 0) }
}
