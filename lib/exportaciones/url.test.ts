import { describe, expect, it } from 'vitest'
import { urlExportacionEscuelas } from './url'

const SIN_FILTROS = { departamentos: [], direcciones: [] }

describe('urlExportacionEscuelas', () => {
  it('arma la URL solo con el tipo cuando no hay filtros', () => {
    expect(urlExportacionEscuelas({ tipo: 'afectadas', filtros: SIN_FILTROS, horizonte: 72 }))
      .toBe('/api/infraestructura/exportar?tipo=afectadas')
  })

  it('usa los mismos nombres de parámetro que el mapa: depto y direccion, separados por coma', () => {
    const url = urlExportacionEscuelas({
      tipo: 'sin-clases',
      filtros: { departamentos: ['capital', 'goya'], direcciones: [1, 4] },
      horizonte: 72,
    })
    const params = new URL(url, 'http://localhost').searchParams
    expect(params.get('tipo')).toBe('sin-clases')
    expect(params.get('depto')).toBe('capital,goya')
    expect(params.get('direccion')).toBe('1,4')
  })

  it('incluye el horizonte solo para en-riesgo, aunque sea el valor por defecto', () => {
    const riesgo = urlExportacionEscuelas({ tipo: 'en-riesgo', filtros: SIN_FILTROS, horizonte: 72 })
    expect(new URL(riesgo, 'http://localhost').searchParams.get('horizonte')).toBe('72')

    const afectadas = urlExportacionEscuelas({ tipo: 'afectadas', filtros: SIN_FILTROS, horizonte: 240 })
    expect(new URL(afectadas, 'http://localhost').searchParams.has('horizonte')).toBe(false)
  })

  it('respeta el horizonte elegido para en-riesgo', () => {
    const url = urlExportacionEscuelas({ tipo: 'en-riesgo', filtros: SIN_FILTROS, horizonte: 24 })
    expect(new URL(url, 'http://localhost').searchParams.get('horizonte')).toBe('24')
  })
})
