import { describe, expect, it } from 'vitest'
import { departamentosSinNovedad, impactoDe, ordenarPorSeveridad, tieneNovedad } from './orden'

const item = (ambito: string, nivel: string, metricas: Record<string, number> = {}) => ({
  ambito,
  nivel,
  metricas: Object.entries(metricas).map(([id, valor]) => ({ id, valor })),
})

describe('ordenarPorSeveridad', () => {
  it('puts severe departments before alert and vigilance ones', () => {
    const orden = ordenarPorSeveridad([
      item('departamento:GOYA', 'vigilancia'),
      item('departamento:ESQUINA', 'severo'),
      item('departamento:LAVALLE', 'alerta'),
    ]).map((i) => i.ambito)

    expect(orden).toEqual(['departamento:ESQUINA', 'departamento:LAVALLE', 'departamento:GOYA'])
  })

  it('breaks level ties by schools and then students without classes', () => {
    const orden = ordenarPorSeveridad([
      item('departamento:A', 'alerta', { 'escuelas.sin_clases': 1, 'alumnos.sin_clases': 900 }),
      item('departamento:B', 'alerta', { 'escuelas.sin_clases': 3 }),
      item('departamento:C', 'alerta', { 'escuelas.sin_clases': 1, 'alumnos.sin_clases': 1200 }),
    ]).map((i) => i.ambito)

    expect(orden).toEqual(['departamento:B', 'departamento:C', 'departamento:A'])
  })

  it('falls back to the department name so the order is stable', () => {
    const orden = ordenarPorSeveridad([
      item('departamento:SAUCE', 'vigilancia'),
      item('departamento:BELLA VISTA', 'vigilancia'),
    ]).map((i) => i.ambito)

    expect(orden).toEqual(['departamento:BELLA VISTA', 'departamento:SAUCE'])
  })

  it('does not mutate its input', () => {
    const lista = [item('departamento:B', 'vigilancia'), item('departamento:A', 'severo')]
    ordenarPorSeveridad(lista)
    expect(lista[0].ambito).toBe('departamento:B')
  })
})

describe('impactoDe / tieneNovedad', () => {
  it('reads impact figures from metrics and ignores non numeric values', () => {
    expect(impactoDe([{ id: 'escuelas.sin_clases', valor: 2 }, { id: 'alumnos.sin_clases', valor: 'x' }])).toMatchObject({
      escuelasSinClases: 2,
      alumnosSinClases: 0,
    })
  })

  it('treats a quiet department with affected schools as news', () => {
    expect(tieneNovedad(item('departamento:A', 'sin_senal'))).toBe(false)
    expect(tieneNovedad(item('departamento:A', 'sin_senal', { 'escuelas.situaciones_abiertas': 1 }))).toBe(true)
    expect(tieneNovedad(item('departamento:A', 'vigilancia'))).toBe(true)
  })

  it('does not treat access risk alone as news', () => {
    expect(tieneNovedad(item('departamento:A', 'sin_senal', { 'acceso.escuelas_en_riesgo': 12 }))).toBe(false)
  })
})

describe('departamentosSinNovedad', () => {
  it('lists every department without news, alphabetically, with display names', () => {
    const conDato = [item('departamento:GOYA', 'alerta'), item('departamento:ESQUINA', 'sin_senal')]
    const quietos = departamentosSinNovedad(conDato)

    expect(quietos).toContain('Esquina')
    expect(quietos).not.toContain('Goya')
    expect(quietos).toContain('Berón de Astrada')
    expect(quietos).toHaveLength(24)
    expect([...quietos].sort((a, b) => a.localeCompare(b, 'es'))).toEqual(quietos)
  })
})
