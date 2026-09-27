import type { FiltrosMapa } from './parte-mapa'

// Arma la query string de filtros compartida por todos los endpoints de
// /api/mapas/infraestructura (partes, escuelas y totales): los tres aceptan
// exactamente los mismos 7 parámetros. Vive en un módulo propio para que
// use-alertas, use-escuelas-mapa y use-totales-mapa no dupliquen el armado.
export function construirQueryStringFiltrosMapa(filtros: FiltrosMapa): string {
  const parametros = new URLSearchParams()

  const agregar = (nombre: string, valor: string | undefined): void => {
    if (valor !== undefined && valor !== '') {
      parametros.set(nombre, valor)
    }
  }

  agregar('territorio', filtros.territorio)
  agregar('nivel', filtros.nivel)
  agregar('establecimiento', filtros.cueAnexo)
  agregar('motivo', filtros.motivo)
  agregar('severidad', filtros.severidad)
  agregar('categoria', filtros.categoria)
  agregar('servicio', filtros.servicio)

  const cadena = parametros.toString()
  return cadena === '' ? '' : `?${cadena}`
}
