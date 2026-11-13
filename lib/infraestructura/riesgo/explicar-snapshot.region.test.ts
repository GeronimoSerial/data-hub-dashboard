import { describe, expect, it } from 'vitest'
import { explicarSnapshot, explicarSnapshotDeRegion, type FactorMotor, type SnapshotMotor } from './explicar-snapshot'

const SNAPSHOT: SnapshotMotor = {
  nivelRiesgo: 'alto',
  scoreRiesgo: 70,
  horizonteHoras: 72,
  calculadoEn: '2026-10-12T12:00:00.000Z',
}

function factorRio(rio: string, estacionSlug: string): FactorMotor {
  return {
    tipo: 'amenaza',
    fuente: 'rio-pna',
    variable: 'altura_rio',
    valor: 4.03,
    unidad: 'm',
    contribucion: 30,
    explicacion: `Rio ${rio} en pna-${estacionSlug}: 4.03m, estado normal (alerta 3.5m, evacuacion 4m), tendencia baja`,
    observadoEn: null,
  }
}

// Corrientes river and station tables, as [slug or raw name, expected label].
const RIOS_CORRIENTES: [string, string][] = [
  ['parana', 'Paraná'],
  ['uruguay', 'Uruguay'],
  ['paraguay', 'Paraguay'],
]

const ESTACIONES_CORRIENTES: [string, string][] = [
  ['ituzaingo', 'Ituzaingó'],
  ['corrientes', 'Corrientes'],
  ['paso de la patria', 'Paso de la Patria'],
  ['bella vista', 'Bella Vista'],
  ['goya', 'Goya'],
  ['esquina', 'Esquina'],
  ['empedrado', 'Empedrado'],
  ['itati', 'Itatí'],
  ['ita ibate', 'Itá Ibaté'],
]

const textoEsperado = (rio: string, estacion: string) =>
  `Río ${rio} en ${estacion} — Altura del río: 4,03 m y bajando · Normal (alerta 3,50 m).`

describe('explicarSnapshot con las tablas de Corrientes', () => {
  it.each(RIOS_CORRIENTES)('el río %s se muestra como %s', (rio, esperado) => {
    const resultado = explicarSnapshot(SNAPSHOT, [factorRio(rio, 'ituzaingo')])
    expect(resultado.situacionActual[0]).toBe(textoEsperado(esperado, 'Ituzaingó'))
  })

  it.each(ESTACIONES_CORRIENTES)('la estación %s se muestra como %s', (estacion, esperado) => {
    const slug = estacion.replace(/ /g, '-')
    const resultado = explicarSnapshot(SNAPSHOT, [factorRio('parana', slug)])
    expect(resultado.situacionActual[0]).toBe(textoEsperado('Paraná', esperado))
  })
})

describe('explicarSnapshotDeRegion', () => {
  it('otra región no aplica los nombres de río ni de estación de Corrientes', () => {
    const resultado = explicarSnapshotDeRegion('otra', SNAPSHOT, [factorRio('parana', 'ituzaingo')])
    expect(resultado.situacionActual[0]).toBe(textoEsperado('Parana', 'Ituzaingo'))
  })

  it('la región corrientes da el mismo resultado que explicarSnapshot', () => {
    const factores = [factorRio('parana', 'ita-ibate')]
    expect(explicarSnapshotDeRegion('corrientes', SNAPSHOT, factores)).toEqual(explicarSnapshot(SNAPSHOT, factores))
  })
})
