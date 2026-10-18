import { describe, expect, it } from 'vitest'
import { FILTROS_MAPA_VACIOS } from '@/lib/infraestructura/mapa/tipos'
import { etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import { etiquetasFiltros, nombreArchivoExportacion, parsearSolicitudExportacion } from './solicitud'

describe('parsearSolicitudExportacion', () => {
  it('rechaza un tipo ausente o desconocido', () => {
    expect(parsearSolicitudExportacion(new URLSearchParams('')).ok).toBe(false)
    expect(parsearSolicitudExportacion(new URLSearchParams('tipo=bajo-lluvia')).ok).toBe(false)
  })

  it('usa horizonte 72 por defecto y filtros vacíos sin parámetros', () => {
    const resultado = parsearSolicitudExportacion(new URLSearchParams('tipo=con-clases'))
    expect(resultado).toEqual({
      ok: true,
      solicitud: { tipo: 'con-clases', filtros: FILTROS_MAPA_VACIOS, horizonte: 72 },
    })
  })

  it('acepta los filtros con los mismos nombres de parámetro que el mapa', () => {
    const resultado = parsearSolicitudExportacion(
      new URLSearchParams('tipo=afectadas&departamento=ER&direccion=3,4&clases=sin&apoyo=brinda&q=Escuela'),
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
    const valido = parsearSolicitudExportacion(new URLSearchParams('tipo=en-riesgo&horizonte=240'))
    expect(valido.ok && valido.solicitud.horizonte).toBe(240)

    const invalido = parsearSolicitudExportacion(new URLSearchParams('tipo=en-riesgo&horizonte=99'))
    expect(invalido.ok).toBe(false)
  })
})

describe('etiquetasFiltros', () => {
  it('indica que no hay filtros cuando la exportación es completa', () => {
    expect(etiquetasFiltros(FILTROS_MAPA_VACIOS, [])).toEqual([
      { etiqueta: 'Filtros', valor: 'Sin filtros aplicados' },
    ])
  })

  it('traduce departamentos y direcciones a nombres legibles', () => {
    const etiquetas = etiquetasFiltros(
      { ...FILTROS_MAPA_VACIOS, departamentos: ['GUALEGUAYCHU'], direcciones: [3, 9] },
      [{ id: 3, nombre: 'Nivel Primario' }],
    )
    expect(etiquetas).toEqual([
      { etiqueta: 'Departamento', valor: etiquetaDepartamento('GUALEGUAYCHU') },
      { etiqueta: 'Dirección', valor: 'Nivel Primario, Nivel 9' },
    ])
  })
})

describe('nombreArchivoExportacion', () => {
  it('usa el nombre del catálogo y la fecha en hora de Buenos Aires', () => {
    // 02:30 UTC del 18 es 23:30 del 17 en Buenos Aires.
    expect(nombreArchivoExportacion('en-riesgo', new Date('2026-10-18T02:30:00Z'))).toBe(
      'escuelas-en-riesgo-2026-10-17.xlsx',
    )
  })
})
