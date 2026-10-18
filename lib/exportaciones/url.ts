import { serializarContextoMapaEnQuery } from '@/lib/infraestructura/mapa/estado-retorno'
import type { HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import { FILTROS_MAPA_VACIOS, type FiltrosMapa } from '@/lib/infraestructura/mapa/tipos'
import type { FormatoExportacion } from './solicitud'
import type { TipoExportacionEscuelas } from './escuelas'

export const RUTA_EXPORTAR_ESCUELAS = '/api/infraestructura/exportar'

export type FiltrosExportacion = Pick<FiltrosMapa, 'departamentos' | 'direcciones' | 'gravedades'>

/**
 * URL de una exportación de escuelas. Los estados se repiten (`estado=`) y
 * se combinan en O; los filtros del mapa (`depto`, `direccion`, `severidad`)
 * se combinan en Y. `horizonte` viaja sólo si `en-riesgo` está elegido.
 */
export function urlExportacionEscuelas(input: {
  estados: readonly TipoExportacionEscuelas[]
  filtros: FiltrosExportacion
  horizonte: HorizonteMotor
  formato: FormatoExportacion
}): string {
  const params = new URLSearchParams()
  for (const estado of input.estados) params.append('estado', estado)

  const filtros: FiltrosMapa = { ...FILTROS_MAPA_VACIOS, ...input.filtros }
  for (const [clave, valor] of serializarContextoMapaEnQuery({ filtros })) {
    params.append(clave, valor)
  }

  if (input.estados.includes('en-riesgo')) params.set('horizonte', String(input.horizonte))
  if (input.formato === 'json') params.set('formato', 'json')

  const query = params.toString()
  return query ? `${RUTA_EXPORTAR_ESCUELAS}?${query}` : RUTA_EXPORTAR_ESCUELAS
}
