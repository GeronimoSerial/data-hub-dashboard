import { describe, expect, it } from 'vitest'
import { textos } from '@/lib/i18n'

const es = textos('es')
const pt = textos('pt')
import { traducirNombre } from './traducir-nombre'

describe('traducirNombre: jobs de niveles del río y avisos INMET', () => {
  it.each(['Niveles del río (ANA)', 'Niveles del río (SGB)', 'Avisos meteorológicos (INMET)'])('es conserva %s', (nombre) => {
    expect(traducirNombre(nombre, es)).toBe(nombre)
  })

  it.each([
    ['Niveles del río (ANA)', 'Níveis do rio (ANA)'],
    ['Niveles del río (SGB)', 'Níveis do rio (SGB)'],
    ['Avisos meteorológicos (INMET)', 'Alertas meteorológicos (INMET)'],
  ])('pt traduce %s', (origen, esperado) => {
    expect(traducirNombre(origen, pt)).toBe(esperado)
  })
})
