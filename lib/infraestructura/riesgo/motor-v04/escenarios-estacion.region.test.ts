import { describe, expect, it } from 'vitest'
import { ESTACION_AGUAS_ARRIBA_ONDA, aguasArribaOndaDeAncla, construirEscenariosSubida } from './escenarios-estacion'
import type { LecturaPrefectura } from '../motor/escenarios-subida'

const AS_OF = '2026-10-18T02:15:04.000Z'

function diarias(desde: string, valores: number[]): LecturaPrefectura[] {
  const base = Date.parse(`${desde}T15:00:00Z`)
  return valores.map((v, i) => ({ medidaEn: new Date(base + i * 86_400_000).toISOString(), lecturaM: v }))
}

const LECTURAS = new Map([
  ['pna-corrientes', diarias('2026-10-12', [5.43, 5.8, 6.2, 6.5, 6.75, 6.77])],
  ['pna-empedrado', diarias('2026-10-12', [4.94, 5.1, 5.25, 5.4, 5.55, 5.67])],
])

describe('onda aguas arriba según el ancla de la región', () => {
  it('con ancla pna-corrientes (Corrientes) la cadena empieza en el ancla', () => {
    const m = aguasArribaOndaDeAncla('pna-corrientes')
    expect(m.get('pna-empedrado')).toBe('pna-corrientes')
    expect(m.has('pna-corrientes')).toBe(false)
    expect([...m]).toEqual([...ESTACION_AGUAS_ARRIBA_ONDA])
  })

  it('con otra ancla, o sin ancla, no hay onda', () => {
    expect(aguasArribaOndaDeAncla('otra-estacion').size).toBe(0)
    expect(aguasArribaOndaDeAncla(undefined).size).toBe(0)
  })

  it('construirEscenariosSubida con otra ancla no asigna estación aguas arriba a pna-empedrado', () => {
    const conAncla = construirEscenariosSubida({ asOf: AS_OF, series: new Map(), lecturas: LECTURAS, estacionAncla: 'otra-estacion' })
    expect(conAncla.get('pna-empedrado')!.estacionAguasArriba).toBeNull()
    expect(conAncla.get('pna-empedrado')!.ondaM).toBeNull()
  })

  it('por defecto (ancla de la región activa, Corrientes) se mantiene la onda', () => {
    const porDefecto = construirEscenariosSubida({ asOf: AS_OF, series: new Map(), lecturas: LECTURAS })
    expect(porDefecto.get('pna-empedrado')!.estacionAguasArriba).toBe('pna-corrientes')
  })
})
