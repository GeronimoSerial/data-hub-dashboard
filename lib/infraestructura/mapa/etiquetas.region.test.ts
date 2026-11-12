import { describe, expect, it } from 'vitest'
import { etiquetaDepartamento, etiquetaDepartamentoDeRegion, etiquetasDepartamentoDeRegion } from './etiquetas'

const DEPARTAMENTOS_CORRIENTES: [string, string][] = [
  ['BELLA VISTA', 'Bella Vista'],
  ['BERON DE ASTRADA', 'Berón de Astrada'],
  ['CAPITAL', 'Capital'],
  ['CONCEPCION', 'Concepción'],
  ['CURUZU CUATIA', 'Curuzú Cuatiá'],
  ['EMPEDRADO', 'Empedrado'],
  ['ESQUINA', 'Esquina'],
  ['GENERAL ALVEAR', 'General Alvear'],
  ['GENERAL PAZ', 'General Paz'],
  ['GOYA', 'Goya'],
  ['ITATI', 'Itatí'],
  ['ITUZAINGO', 'Ituzaingó'],
  ['LAVALLE', 'Lavalle'],
  ['MBURUCUYA', 'Mburucuyá'],
  ['MERCEDES', 'Mercedes'],
  ['MONTE CASEROS', 'Monte Caseros'],
  ['PASO DE LOS LIBRES', 'Paso de los Libres'],
  ['SALADAS', 'Saladas'],
  ['SAN COSME', 'San Cosme'],
  ['SAN LUIS DEL PALMAR', 'San Luis del Palmar'],
  ['SAN MARTIN', 'San Martín'],
  ['SAN MIGUEL', 'San Miguel'],
  ['SAN ROQUE', 'San Roque'],
  ['SANTO TOME', 'Santo Tomé'],
  ['SAUCE', 'Sauce'],
]

describe('etiquetas de departamento por región', () => {
  it('la región corrientes conserva cada etiqueta de su tabla', () => {
    expect(DEPARTAMENTOS_CORRIENTES.map(([valor]) => [valor, etiquetaDepartamentoDeRegion('corrientes', valor)]))
      .toEqual(DEPARTAMENTOS_CORRIENTES)
  })

  it('etiquetaDepartamento sin región usa la región activa y da las mismas etiquetas', () => {
    expect(DEPARTAMENTOS_CORRIENTES.map(([valor]) => [valor, etiquetaDepartamento(valor)]))
      .toEqual(DEPARTAMENTOS_CORRIENTES)
  })

  it('otra región no hereda las etiquetas de Corrientes y usa el fallback', () => {
    expect(etiquetasDepartamentoDeRegion('otra')).toEqual({})
    expect(etiquetaDepartamentoDeRegion('otra', 'SAN MARTIN')).toBe('San Martin')
    expect(etiquetaDepartamentoDeRegion('otra', 'ITUZAINGO')).toBe('Ituzaingo')
  })
})
