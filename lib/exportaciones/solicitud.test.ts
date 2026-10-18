import { describe, expect, it } from 'vitest'
import { FILTROS_MAPA_VACIOS } from '@/lib/infraestructura/mapa/tipos'
import { etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import { etiquetasFiltros, nombreArchivoExportacion, parsearSolicitudExportacion } from './solicitud'

describe('parsearSolicitudExportacion', () => {
  it('sin estado exporta todas las escuelas, sin horizonte y en xlsx', () => {
    expect(parsearSolicitudExportacion(new URLSearchParams(''))).toEqual({
      ok: true,
      solicitud: {
        estados: [], filtros: FILTROS_MAPA_VACIOS, horizonte: null, formato: 'xlsx',
        pagina: 1, tamanoPagina: 25, ordenarPor: null, sentido: 'asc',
      },
    })
  })

  it('rechaza un estado desconocido', () => {
    expect(parsearSolicitudExportacion(new URLSearchParams('estado=bajo-lluvia')).ok).toBe(false)
    expect(parsearSolicitudExportacion(new URLSearchParams('estado=sin-clases,bajo-lluvia')).ok).toBe(false)
  })

  it('acepta estados repetidos o separados por comas, sin duplicados y en orden del catálogo', () => {
    const resultado = parsearSolicitudExportacion(new URLSearchParams('estado=en-riesgo,afectadas&estado=afectadas'))
    expect(resultado.ok && resultado.solicitud.estados).toEqual(['afectadas', 'en-riesgo'])
  })

  it('acepta los filtros con los mismos nombres de parámetro que el mapa', () => {
    const resultado = parsearSolicitudExportacion(
      new URLSearchParams('estado=afectadas&departamento=ER&direccion=3,4&clases=sin&apoyo=brinda&q=Escuela'),
    )
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.solicitud.filtros).toMatchObject({
      q: 'Escuela',
      departamentos: ['ER'],
      direcciones: [3, 4],
      clases: ['sin'],
      apoyo: ['brinda'],
    })
  })

  it('toma el horizonte válido y rechaza uno fuera de 24, 72 o 240', () => {
    const valido = parsearSolicitudExportacion(new URLSearchParams('estado=en-riesgo&horizonte=240'))
    expect(valido.ok && valido.solicitud.horizonte).toBe(240)

    const invalido = parsearSolicitudExportacion(new URLSearchParams('estado=en-riesgo&horizonte=99'))
    expect(invalido.ok).toBe(false)
  })

  it('acepta formato json y rechaza otros formatos', () => {
    const json = parsearSolicitudExportacion(new URLSearchParams('formato=json'))
    expect(json.ok && json.solicitud.formato).toBe('json')
    expect(parsearSolicitudExportacion(new URLSearchParams('formato=pdf')).ok).toBe(false)
  })
})

describe('etiquetasFiltros', () => {
  it('indica que no hay filtros cuando la exportación es completa', () => {
    expect(etiquetasFiltros(FILTROS_MAPA_VACIOS, [])).toEqual([
      { etiqueta: 'Filtros', valor: 'Sin filtros aplicados' },
    ])
  })

  it('lista los estados seleccionados y traduce departamentos y direcciones', () => {
    const etiquetas = etiquetasFiltros(
      { ...FILTROS_MAPA_VACIOS, departamentos: ['GUALEGUAYCHU'], direcciones: [3, 9] },
      [{ id: 3, nombre: 'Nivel Primario' }],
      ['sin-clases', 'en-riesgo'],
    )
    expect(etiquetas).toEqual([
      { etiqueta: 'Estado', valor: 'sin clases, en riesgo' },
      { etiqueta: 'Departamento', valor: etiquetaDepartamento('GUALEGUAYCHU') },
      { etiqueta: 'Dirección', valor: 'Nivel Primario, Nivel 9' },
    ])
  })
})

describe('nombreArchivoExportacion', () => {
  // 02:30 UTC del 18 es 23:30 del 17 en Buenos Aires.
  const fecha = new Date('2026-10-18T02:30:00Z')

  it('usa el título de los estados como slug y la fecha en hora de Buenos Aires', () => {
    expect(nombreArchivoExportacion(['en-riesgo'], fecha)).toBe('escuelas-en-riesgo-2026-10-17.xlsx')
    expect(nombreArchivoExportacion(['sin-clases', 'en-riesgo'], fecha)).toBe(
      'escuelas-sin-clases-y-en-riesgo-2026-10-17.xlsx',
    )
    expect(nombreArchivoExportacion(['asistidas'], fecha)).toBe(
      'escuelas-con-asistencia-pedagogica-2026-10-17.xlsx',
    )
  })

  it('sin estados usa "escuelas"', () => {
    expect(nombreArchivoExportacion([], fecha)).toBe('escuelas-2026-10-17.xlsx')
  })
})
