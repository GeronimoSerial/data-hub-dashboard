import { describe, expect, it } from 'vitest'
import {
  CAPA_OTRAS_PRIMARIAS,
  CAPA_SECUNDARIAS,
  CAPA_UNIVERSO,
  CAPA_ZONAS,
  CAPA_RECORRIDO_PUNTOS,
} from './capas'
import { CAPAS_INTERACTIVAS, idsInteractivos, resolverClic, type CaracteristicaClic } from './clics'

const escuela: CaracteristicaClic = { layer: CAPA_UNIVERSO, properties: { cue: '1001', nombre: 'Escuela' } }
const primaria: CaracteristicaClic = { layer: CAPA_OTRAS_PRIMARIAS, properties: { cue: '2001', nombre: 'Primaria' } }
const secundaria: CaracteristicaClic = { layer: CAPA_SECUNDARIAS, properties: { cue: '3001', nombre: 'Secundaria' } }
const zona: CaracteristicaClic = { layer: CAPA_ZONAS, properties: { id: 4, etiqueta: 'Zona 4' } }

describe('resolverClic', () => {
  it('prefiere la escuela del universo a la zona que está debajo', () => {
    expect(resolverClic([zona, escuela])).toEqual({ tipo: 'escuela', cue: '1001' })
  })

  it('prefiere una referencia a la zona', () => {
    expect(resolverClic([zona, primaria])).toEqual({ tipo: 'referencia', cue: '2001', nivel: 'primaria' })
    expect(resolverClic([zona, secundaria])).toEqual({ tipo: 'referencia', cue: '3001', nivel: 'secundaria' })
  })

  it('una escuela del universo gana a una referencia', () => {
    expect(resolverClic([primaria, escuela])).toEqual({ tipo: 'escuela', cue: '1001' })
  })

  it('una secundaria gana a una primaria con el mismo establecimiento', () => {
    const ambas = [
      { layer: CAPA_OTRAS_PRIMARIAS, properties: { cue: '4001' } },
      { layer: CAPA_SECUNDARIAS, properties: { cue: '4001' } },
    ]
    expect(resolverClic(ambas)).toEqual({ tipo: 'referencia', cue: '4001', nivel: 'secundaria' })
  })

  it('devuelve la zona cuando es lo único bajo el puntero', () => {
    expect(resolverClic([zona])).toEqual({ tipo: 'zona', id: 4 })
  })

  it('sin features o con capas no interactivas no devuelve nada', () => {
    expect(resolverClic([])).toBeNull()
    expect(resolverClic([{ layer: CAPA_RECORRIDO_PUNTOS, properties: { rol: 'origen' } }])).toBeNull()
  })

  it('ignora features sin identificador válido', () => {
    expect(resolverClic([{ layer: CAPA_UNIVERSO, properties: {} }, zona])).toEqual({ tipo: 'zona', id: 4 })
    expect(resolverClic([{ layer: CAPA_ZONAS, properties: { id: 'cuatro' } }])).toBeNull()
  })
})

describe('CAPAS_INTERACTIVAS', () => {
  it('va de mayor a menor prioridad: universo, secundarias, primarias y zonas', () => {
    expect(CAPAS_INTERACTIVAS).toEqual([CAPA_UNIVERSO, CAPA_SECUNDARIAS, CAPA_OTRAS_PRIMARIAS, CAPA_ZONAS])
  })
})

describe('idsInteractivos', () => {
  it('incluye sólo las capas visibles, en orden de prioridad', () => {
    expect(idsInteractivos({ zonas: true, otrasPrimarias: true, secundarias: true })).toEqual([
      CAPA_UNIVERSO,
      CAPA_SECUNDARIAS,
      CAPA_OTRAS_PRIMARIAS,
      CAPA_ZONAS,
    ])
  })

  it('omite las capas ocultas y siempre incluye el universo', () => {
    expect(idsInteractivos({ zonas: false, otrasPrimarias: false, secundarias: false })).toEqual([CAPA_UNIVERSO])
    expect(idsInteractivos({ zonas: true, otrasPrimarias: false, secundarias: true })).toEqual([
      CAPA_UNIVERSO,
      CAPA_SECUNDARIAS,
      CAPA_ZONAS,
    ])
  })
})
