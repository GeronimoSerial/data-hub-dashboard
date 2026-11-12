import { describe, expect, it } from 'vitest'
import { textos } from '@/lib/i18n'
import { traducirNombre } from './traducir-nombre'

const es = textos('es')
const pt = textos('pt')

describe('traducirNombre: es (Corrientes) is identity', () => {
  it.each([
    'Pronóstico meteorológico',
    'Ensamble meteorológico (radar)',
    'Avisos meteorológicos',
    'Lluvia observada IMERG',
    'Observaciones IMERG',
    'Ensamble de lluvia',
    'Lluvia SYNOP',
    'Pronóstico estacional',
    'Climatología IMERG',
    'Cobertura de la climatología de precipitación',
    'Climatología de caudal',
    'Climatología de precipitación',
    'Cálculo de riesgo escolar',
    'Corte del Centro de Situación',
    'Veredicto diario',
    'Cierre del veredicto',
    'Run de riesgo vigente',
    'Episodios derivados',
    'Pronóstico de caudal',
    'Exposición al río (DEM)',
    'Alturas de Prefectura',
    'Histórico de Prefectura',
    'Lecturas de Prefectura',
    'Plausibilidad de lecturas',
    'Huecos en la serie IMERG',
    'Cadena de datos (sonda)',
    'Datos geográficos y estáticos',
    'Fuente nasa-imerg',
    'Nombre libre de una fuente desconocida',
  ])('%s', (nombre) => {
    expect(traducirNombre(nombre, es)).toBe(nombre)
  })

  it('every es entry of the table maps back to its own Spanish text', () => {
    for (const [clave, texto] of Object.entries(es.situacion.estadoDatos.nombres)) {
      expect(traducirNombre(texto, es), clave).toBe(texto)
    }
  })
})

describe('traducirNombre: pt (Manaus) translates fixed source names', () => {
  it.each([
    ['Pronóstico meteorológico', 'Previsão meteorológica'],
    ['Avisos meteorológicos', 'Alertas meteorológicos'],
    ['Lluvia observada IMERG', 'Chuva observada IMERG'],
    ['Ensamble de lluvia', 'Ensemble de chuva'],
    ['Pronóstico estacional', 'Previsão sazonal'],
    ['Climatología de caudal', 'Climatologia de vazão'],
    ['Cálculo de riesgo escolar', 'Cálculo de risco escolar'],
    ['Corte del Centro de Situación', 'Corte do Centro de Situação'],
    ['Veredicto diario', 'Veredito diário'],
    ['Run de riesgo vigente', 'Execução de risco vigente'],
    ['Pronóstico de caudal', 'Previsão de vazão'],
    ['Exposición al río (DEM)', 'Exposição ao rio (DEM)'],
    ['Alturas de Prefectura', 'Níveis da Prefectura'],
    ['Huecos en la serie IMERG', 'Falhas na série IMERG'],
    ['Cadena de datos (sonda)', 'Cadeia de dados (sonda)'],
    ['Datos geográficos y estáticos', 'Dados geográficos e estáticos'],
    ['Fuente nasa-imerg', 'Fonte nasa-imerg'],
  ])('%s -> %s', (es_, ptEsperado) => {
    expect(traducirNombre(es_, pt)).toBe(ptEsperado)
  })

  it('leaves dataset names from the database unchanged', () => {
    expect(traducirNombre('Departamentos de Corrientes', pt)).toBe('Departamentos de Corrientes')
  })
})
