import { describe, expect, it } from 'vitest'
import { etiquetaDepartamento } from './etiquetas'

describe('etiquetaDepartamento', () => {
  it('presenta los 25 departamentos de Corrientes con tildes y capitalización correctas', () => {
    const departamentos: Record<string, string> = {
      'BELLA VISTA': 'Bella Vista',
      'BERON DE ASTRADA': 'Berón de Astrada',
      CAPITAL: 'Capital',
      CONCEPCION: 'Concepción',
      'CURUZU CUATIA': 'Curuzú Cuatiá',
      EMPEDRADO: 'Empedrado',
      ESQUINA: 'Esquina',
      'GENERAL ALVEAR': 'General Alvear',
      'GENERAL PAZ': 'General Paz',
      GOYA: 'Goya',
      ITATI: 'Itatí',
      ITUZAINGO: 'Ituzaingó',
      LAVALLE: 'Lavalle',
      MBURUCUYA: 'Mburucuyá',
      MERCEDES: 'Mercedes',
      'MONTE CASEROS': 'Monte Caseros',
      'PASO DE LOS LIBRES': 'Paso de los Libres',
      SALADAS: 'Saladas',
      'SAN COSME': 'San Cosme',
      'SAN LUIS DEL PALMAR': 'San Luis del Palmar',
      'SAN MARTIN': 'San Martín',
      'SAN MIGUEL': 'San Miguel',
      'SAN ROQUE': 'San Roque',
      'SANTO TOME': 'Santo Tomé',
      SAUCE: 'Sauce',
    }

    expect(Object.entries(departamentos).map(([valor, esperado]) => [valor, etiquetaDepartamento(valor), esperado]))
      .toEqual(Object.entries(departamentos).map(([valor, esperado]) => [valor, esperado, esperado]))
  })

  it('capitaliza palabra por palabra en el fallback y conserva conectores en minúscula', () => {
    expect(etiquetaDepartamento('VILLA DE LOS DOLORES')).toBe('Villa de los Dolores')
    expect(etiquetaDepartamento('SAN LUIS DEL PALMAR')).toBe('San Luis del Palmar')
  })
})
