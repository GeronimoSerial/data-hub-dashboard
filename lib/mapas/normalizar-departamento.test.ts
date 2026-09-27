import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  normalizarNombreDepartamento,
  normalizarNombreDepartamentoONull,
} from './normalizar-departamento'

const LOS_25_DEPARTAMENTOS = [
  'San Cosme',
  'Esquina',
  'Itatí',
  'Monte Caseros',
  'Ituzaingó',
  'Capital',
  'San Luis del Palmar',
  'Sauce',
  'Curuzú Cuatiá',
  'San Miguel',
  'Empedrado',
  'Berón de Astrada',
  'San Martín',
  'Paso de los Libres',
  'Goya',
  'Lavalle',
  'San Roque',
  'General Alvear',
  'Concepción',
  'Bella Vista',
  'Santo Tomé',
  'Saladas',
  'General Paz',
  'Mburucuyá',
  'Mercedes',
]

describe('normalizarNombreDepartamento', () => {
  it('uppercases', () => {
    expect(normalizarNombreDepartamento('goya')).toBe('GOYA')
  })

  it('descarta tildes (NFD)', () => {
    expect(normalizarNombreDepartamento('Concepción')).toBe('CONCEPCION')
    expect(normalizarNombreDepartamento('Curuzú Cuatiá')).toBe('CURUZU CUATIA')
    expect(normalizarNombreDepartamento('Itatí')).toBe('ITATI')
  })

  it('unifica CONCEPCION y CONCEPCIÓN (gotcha confirmado en la base real)', () => {
    expect(normalizarNombreDepartamento('CONCEPCION')).toBe(
      normalizarNombreDepartamento('CONCEPCIÓN'),
    )
    expect(normalizarNombreDepartamento('concepción')).toBe('CONCEPCION')
  })

  it('normaliza la Ñ (se descompone bajo NFD en N + tilde combinante)', () => {
    expect(normalizarNombreDepartamento('Ñandubay')).toBe('NANDUBAY')
    expect(normalizarNombreDepartamento('ÑANDUBAY')).toBe('NANDUBAY')
  })

  it('colapsa espacios repetidos', () => {
    expect(normalizarNombreDepartamento('San   Cosme')).toBe('SAN COSME')
    expect(normalizarNombreDepartamento('San\t\tCosme')).toBe('SAN COSME')
  })

  it('recorta espacios sobrantes al principio y al final', () => {
    expect(normalizarNombreDepartamento('  Goya  ')).toBe('GOYA')
  })

  it('combina tildes, Ñ, mayúsculas y espacios dobles en un solo caso', () => {
    expect(normalizarNombreDepartamento('  berón   de  astrada  ')).toBe(
      'BERON DE ASTRADA',
    )
  })

  it('normaliza los 25 departamentos reales de Corrientes sin colisiones inesperadas', () => {
    const normalizados = LOS_25_DEPARTAMENTOS.map(normalizarNombreDepartamento)
    expect(new Set(normalizados).size).toBe(25)
    expect(normalizados.sort()).toMatchSnapshot()
  })
})

describe('normalizarNombreDepartamentoONull', () => {
  it('preserva null', () => {
    expect(normalizarNombreDepartamentoONull(null)).toBeNull()
  })

  it('mapea cadena vacía (o sólo espacios) a null', () => {
    expect(normalizarNombreDepartamentoONull('')).toBeNull()
    expect(normalizarNombreDepartamentoONull('   ')).toBeNull()
  })

  it('normaliza igual que la variante no nullable para un valor presente', () => {
    expect(normalizarNombreDepartamentoONull('Concepción')).toBe('CONCEPCION')
  })
})

describe('coherencia contra la base real (public/data/localizaciones.json)', () => {
  // Reproduce, con el normalizador anterior de geo-perfil.ts (mayúsculas +
  // tabla manual de tildes + trim, SIN NFD ni colapso de espacios), el
  // comportamiento que infra_geo_profile tiene persistido HOY. El objetivo de
  // este test es congelar la garantía de la unificación: para el dataset
  // real, el nuevo normalizador compartido no debe producir un valor
  // distinto del que ya se calculó y persistió con la versión vieja.
  const EQUIVALENCIAS_ACENTOS_VIEJO: Record<string, string> = {
    Á: 'A',
    É: 'E',
    Í: 'I',
    Ó: 'O',
    Ú: 'U',
    Ñ: 'N',
  }
  function normalizadorViejoDeGeoPerfil(departamento: string | null): string | null {
    if (departamento == null) return null
    return departamento
      .toUpperCase()
      .replace(/[ÁÉÍÓÚÑ]/g, (c) => EQUIVALENCIAS_ACENTOS_VIEJO[c] ?? c)
      .trim()
  }

  it('no cambia ningún valor de infra_geo_profile.departamento respecto del cálculo anterior', () => {
    const filePath = path.resolve(process.cwd(), 'public/data/localizaciones.json')
    const localizaciones: { departamento: string | null }[] = JSON.parse(
      readFileSync(filePath, 'utf8'),
    )

    const departamentosDistintos = new Set(
      localizaciones.map((l) => l.departamento),
    )
    expect(departamentosDistintos.size).toBeGreaterThan(0)

    const diferencias: { original: string | null; viejo: string | null; nuevo: string | null }[] =
      []
    for (const original of departamentosDistintos) {
      const viejo = normalizadorViejoDeGeoPerfil(original)
      const nuevo = normalizarNombreDepartamentoONull(original)
      if (viejo !== nuevo) diferencias.push({ original, viejo, nuevo })
    }

    // Documentado en el follow-up: verificado a mano, 0 diferencias contra
    // los 26 valores crudos (25 departamentos reales) del dataset actual.
    expect(diferencias).toEqual([])
  })
})
