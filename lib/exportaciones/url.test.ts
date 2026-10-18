import { describe, expect, it } from 'vitest'
import { urlExportacionEscuelas } from './url'

const SIN_FILTROS = { departamentos: [], direcciones: [], gravedades: [] }
const BASE = 'http://localhost'

describe('urlExportacionEscuelas', () => {
  it('sin estados ni filtros apunta solo a la ruta de descarga', () => {
    expect(urlExportacionEscuelas({ estados: [], filtros: SIN_FILTROS, horizonte: 72, formato: 'xlsx' }))
      .toBe('/api/infraestructura/exportar')
  })

  it('repite estado por cada tipo elegido, en el orden recibido', () => {
    const url = urlExportacionEscuelas({
      estados: ['sin-clases', 'asistidas'],
      filtros: SIN_FILTROS,
      horizonte: 72,
      formato: 'xlsx',
    })
    expect(new URL(url, BASE).searchParams.getAll('estado')).toEqual(['sin-clases', 'asistidas'])
  })

  it('mezcla estados con filtros del mapa en la misma URL', () => {
    const url = urlExportacionEscuelas({
      estados: ['sin-clases', 'afectadas'],
      filtros: { departamentos: ['capital', 'goya'], direcciones: [1, 4], gravedades: [3, 4] },
      horizonte: 72,
      formato: 'xlsx',
    })
    const params = new URL(url, BASE).searchParams
    expect(params.getAll('estado')).toEqual(['sin-clases', 'afectadas'])
    expect(params.get('depto')).toBe('capital,goya')
    expect(params.get('direccion')).toBe('1,4')
    expect(params.get('severidad')).toBe('3,4')
  })

  it('incluye el horizonte solo cuando en-riesgo está entre los estados', () => {
    const conRiesgo = urlExportacionEscuelas({ estados: ['afectadas', 'en-riesgo'], filtros: SIN_FILTROS, horizonte: 240, formato: 'xlsx' })
    expect(new URL(conRiesgo, BASE).searchParams.get('horizonte')).toBe('240')

    const sinRiesgo = urlExportacionEscuelas({ estados: ['afectadas'], filtros: SIN_FILTROS, horizonte: 240, formato: 'xlsx' })
    expect(new URL(sinRiesgo, BASE).searchParams.has('horizonte')).toBe(false)
  })

  it('pide formato json solo para la vista previa; xlsx queda como valor por defecto', () => {
    const preview = urlExportacionEscuelas({ estados: [], filtros: SIN_FILTROS, horizonte: 72, formato: 'json' })
    expect(new URL(preview, BASE).searchParams.get('formato')).toBe('json')

    const descarga = urlExportacionEscuelas({ estados: [], filtros: SIN_FILTROS, horizonte: 72, formato: 'xlsx' })
    expect(new URL(descarga, BASE).searchParams.has('formato')).toBe(false)
  })

  it('pagina la vista previa y descarga todos los resultados con el mismo orden', () => {
    const opciones = { estados: [] as const, filtros: SIN_FILTROS, horizonte: 72 as const, pagina: 3, tamanoPagina: 50, orden: { key: 'matricula', direction: 'desc' as const } }
    const previa = new URL(urlExportacionEscuelas({ ...opciones, formato: 'json' }), BASE).searchParams
    expect(previa.get('pagina')).toBe('3')
    expect(previa.get('tamanoPagina')).toBe('50')
    expect(previa.get('ordenarPor')).toBe('matricula')
    const descarga = new URL(urlExportacionEscuelas({ ...opciones, formato: 'xlsx' }), BASE).searchParams
    expect(descarga.get('ordenarPor')).toBe('matricula')
    expect(descarga.has('pagina')).toBe(false)
    expect(descarga.has('tamanoPagina')).toBe(false)
  })
})
