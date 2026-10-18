import { serializarContextoMapaEnQuery } from '@/lib/infraestructura/mapa/estado-retorno'
import type { HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import { FILTROS_MAPA_VACIOS, type FiltrosMapa } from '@/lib/infraestructura/mapa/tipos'
import type { TipoExportacionEscuelas } from './escuelas'

export const RUTA_EXPORTAR_ESCUELAS = '/api/infraestructura/exportar'

export type FiltrosExportacion = Pick<FiltrosMapa, 'departamentos' | 'direcciones'>

/**
 * URL de descarga de una exportación de escuelas. Usa la misma serialización
 * que la URL del mapa (`depto`, `direccion`). El horizonte solo viaja con
 * `en-riesgo`, que es el único tipo que lo usa.
 */
export function urlExportacionEscuelas(input: {
  tipo: TipoExportacionEscuelas
  filtros: FiltrosExportacion
  horizonte: HorizonteMotor
}): string {
  const params = new URLSearchParams([['tipo', input.tipo]])
  const filtros: FiltrosMapa = { ...FILTROS_MAPA_VACIOS, ...input.filtros }
  for (const [clave, valor] of serializarContextoMapaEnQuery({ filtros })) {
    params.append(clave, valor)
  }
  if (input.tipo === 'en-riesgo') params.set('horizonte', String(input.horizonte))
  return `${RUTA_EXPORTAR_ESCUELAS}?${params.toString()}`
}
