import { describe, expect, it } from 'vitest'
import estacionesA5 from '../__fixtures__/ina/estaciones-a5.json'
import { obtenerEstacionesPrefectura } from '../estaciones-prefectura'
import { parsearEstacionesA5 } from './parser-a5'
import { CATALOGO_A5, CATALOGO_A5_VERSION, compararCatalogoConA5, EntradaCatalogoA5Schema, validarCatalogoA5 } from './catalogo-a5'

describe('CATALOGO_A5', () => {
  it('es válido, versionado y cubre exactamente las estaciones Prefectura del tramo de Corrientes', () => {
    expect(CATALOGO_A5_VERSION).toMatch(/^ina-a5-\d{4}-\d{2}-\d{2}/)
    expect(() => validarCatalogoA5(CATALOGO_A5)).not.toThrow()
    const esperadas = obtenerEstacionesPrefectura().filter((e) => e.rol === 'corrientes')
    expect(CATALOGO_A5.map((e) => e.estacionId).sort()).toEqual(esperadas.map((e) => e.estacionId).sort())
    for (const entrada of CATALOGO_A5) {
      const prefectura = esperadas.find((e) => e.estacionId === entrada.estacionId)
      // Emparejado por identificador histórico PNA, nunca por cercanía.
      expect(entrada.a5IdExterno).toBe(String(prefectura?.idHistorico))
      expect(entrada.rio).toBe(prefectura?.rio)
    }
  })

  it('exige motivo cuando falta el cero o el km, y lo prohíbe cuando hay valor', () => {
    const corrientes = CATALOGO_A5.find((e) => e.estacionId === 'pna-corrientes')!
    expect(corrientes).toMatchObject({ ceroIgnM: 42.39, kmRio: 1208, datumCero: 'IGN_historico_supuesto' })
    expect(EntradaCatalogoA5Schema.safeParse({ ...corrientes, ceroIgnM: null }).success).toBe(false)
    expect(EntradaCatalogoA5Schema.safeParse({ ...corrientes, motivoSinKm: 'x' }).success).toBe(false)
    const ituzaingo = CATALOGO_A5.find((e) => e.estacionId === 'pna-ituzaingo')!
    expect(ituzaingo.ceroIgnM).toBeNull()
    expect(ituzaingo.motivoSinCero).toBeTruthy()
  })

  it('rechaza dos entradas con la misma estación o serie', () => {
    expect(() => validarCatalogoA5([CATALOGO_A5[0], CATALOGO_A5[0]])).toThrow()
  })
})

describe('compararCatalogoConA5', () => {
  const estaciones = parsearEstacionesA5(estacionesA5)

  it('no reporta diferencias contra la respuesta A5 capturada', () => {
    expect(compararCatalogoConA5(CATALOGO_A5, estaciones)).toEqual([])
  })

  it('reporta cambios de cero, umbral y estaciones ausentes sin sobrescribir el catálogo', () => {
    const cambiadas = estaciones
      .filter((e) => e.idExterno !== '170')
      .map((e) => (e.idExterno === '130' ? { ...e, ceroIgnM: 42.4, alertaM: 6.6 } : e))
    const diferencias = compararCatalogoConA5(CATALOGO_A5, cambiadas)
    expect(diferencias).toEqual([
      { estacionId: 'pna-corrientes', campo: 'ceroIgnM', catalogo: 42.39, a5: 42.4 },
      { estacionId: 'pna-corrientes', campo: 'alertaM', catalogo: 6.5, a5: 6.6 },
      { estacionId: 'pna-goya', campo: 'estacion', catalogo: 23, a5: null },
    ])
    expect(CATALOGO_A5.find((e) => e.estacionId === 'pna-corrientes')?.ceroIgnM).toBe(42.39)
  })
})
