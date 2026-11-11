import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  centroDeZona,
  contarAislados,
  estadisticasDeZona,
  idDeZona,
  listarZonas,
  miembrosPorZona,
  radioZonaMetros,
  tendenciaPorZona,
} from './zonas'
import type { CentroZona, DatasetV29, EscuelaV29 } from './tipos'

function escuela(datos: Partial<EscuelaV29> & Pick<EscuelaV29, 'cue'>): EscuelaV29 {
  return {
    nombre: 'Escuela',
    departamento: 'Capital',
    localidad: 'Corrientes',
    ambito: 'Urbano',
    cui: '',
    jurisdiccion: '',
    modalidad: '',
    matricula: 0,
    historia: {},
    lat: -27.5,
    lon: -58.8,
    pof: {},
    agentes: 0,
    zona: 'Zona 1',
    sueldosTotal: null,
    personasSueldos: null,
    clasificacionZonaSueldos: null,
    ...datos,
  }
}

const centros: CentroZona[] = [
  { id: 1, lat: -27.5, lon: -58.8 },
  { id: 2, lat: -27.6, lon: -58.9 },
  { id: 38, lat: -28.1, lon: -57.2 },
]

describe('miembrosPorZona y aislados', () => {
  const universo = [
    escuela({ cue: 'A', zona: 'Zona 1' }),
    escuela({ cue: 'B', zona: 'Zona 1' }),
    escuela({ cue: 'C', zona: 'Aislado' }),
    escuela({ cue: 'D', zona: '' }),
  ]

  it('agrupa por etiqueta y excluye aislados y sin ubicación', () => {
    const porZona = miembrosPorZona(universo)
    expect([...porZona.keys()]).toEqual(['Zona 1'])
    expect(porZona.get('Zona 1')?.map((e) => e.cue)).toEqual(['A', 'B'])
  })

  it('cuenta los aislados sin contar otras zonas', () => {
    expect(contarAislados(universo)).toBe(1)
  })

  it('convierte etiquetas de zona en identificadores', () => {
    expect(idDeZona('Zona 12')).toBe(12)
    expect(idDeZona('Aislado')).toBeNull()
    expect(idDeZona('')).toBeNull()
  })

  it('busca el centro por etiqueta y el radio es de 10 km', () => {
    expect(centroDeZona(centros, 'Zona 38')).toEqual({ id: 38, lat: -28.1, lon: -57.2 })
    expect(centroDeZona(centros, 'Aislado')).toBeUndefined()
    expect(radioZonaMetros()).toBe(10_000)
  })
})

describe('estadisticasDeZona', () => {
  it('compara solo establecimientos con 2023 y 2026 y suma la matrícula total', () => {
    const miembros = [
      escuela({ cue: 'A', matricula: 50, historia: { '2023': 100, '2026': 80 } }),
      escuela({ cue: 'B', matricula: 30, historia: { '2023': 40, '2026': 60 } }),
      escuela({ cue: 'C', matricula: 200, historia: { '2026': 200 } }),
    ]
    const estadisticas = estadisticasDeZona(miembros)
    expect(estadisticas.cantidad).toBe(3)
    expect(estadisticas.matriculaTotal).toBe(280)
    expect(estadisticas.comparables).toBe(2)
    expect(estadisticas.matricula2023).toBe(140)
    expect(estadisticas.matricula2026).toBe(140)
    expect(estadisticas.variacion).toBe(0)
  })

  it('no trata la historia 2026 faltante como cero', () => {
    const miembros = [
      escuela({ cue: 'A', historia: { '2023': 100 } }),
      escuela({ cue: 'B', historia: { '2023': 10, '2026': 12 } }),
    ]
    const estadisticas = estadisticasDeZona(miembros)
    expect(estadisticas.comparables).toBe(1)
    expect(estadisticas.matricula2023).toBe(10)
    expect(estadisticas.matricula2026).toBe(12)
    expect(estadisticas.tendencia).toBe('sube')
  })

  it('zona sin comparables queda como sin comparación y sin cifras de historia', () => {
    const estadisticas = estadisticasDeZona([escuela({ cue: 'A', matricula: 25, historia: { '2026': 25 } })])
    expect(estadisticas.tendencia).toBe('sin')
    expect(estadisticas.etiquetaTendencia).toBe('Sin comparación')
    expect(estadisticas.colorTendencia).toBe('#8b929b')
    expect(estadisticas.matricula2023).toBeNull()
    expect(estadisticas.matricula2026).toBeNull()
    expect(estadisticas.variacion).toBeNull()
    expect(estadisticas.matriculaTotal).toBe(25)
  })

  it.each([
    ['baja', 100, 99, 'Disminuyó', '#F4492E'],
    ['igual', 100, 100, 'Sin cambio', '#90B4E1'],
    ['sube', 99, 100, 'Aumentó', '#719C29'],
  ])('umbral de tendencia %s en el límite', (tendencia, m2023, m2026, etiqueta, color) => {
    const estadisticas = estadisticasDeZona([
      escuela({ cue: 'A', historia: { '2023': m2023, '2026': m2026 } }),
    ])
    expect(estadisticas.tendencia).toBe(tendencia)
    expect(estadisticas.etiquetaTendencia).toBe(etiqueta)
    expect(estadisticas.colorTendencia).toBe(color)
  })
})

describe('listarZonas', () => {
  it('lista zonas sin miembros desde los centros con cero establecimientos', () => {
    const zonas = listarZonas(centros, [escuela({ cue: 'A', zona: 'Zona 1' })])
    const vacia = zonas.find((z) => z.zona === 'Zona 38')
    expect(zonas.map((z) => z.zona)).toEqual(['Zona 1', 'Zona 2', 'Zona 38'])
    expect(vacia?.estadisticas.cantidad).toBe(0)
    expect(vacia?.estadisticas.tendencia).toBe('sin')
    expect(vacia?.centro).toEqual({ id: 38, lat: -28.1, lon: -57.2 })
  })

  it('conserva zonas con miembros que no figuran en los centros', () => {
    const zonas = listarZonas([], [escuela({ cue: 'A', zona: 'Zona 7' })])
    expect(zonas).toHaveLength(1)
    expect(zonas[0]).toMatchObject({ zona: 'Zona 7', id: 7, centro: null })
  })

  it('los totales de zona no cambian con el listado filtrado', () => {
    const universo = [
      escuela({ cue: 'A', departamento: 'Capital', matricula: 10, zona: 'Zona 1' }),
      escuela({ cue: 'B', departamento: 'Goya', matricula: 20, zona: 'Zona 1' }),
    ]
    const filtrado = universo.filter((e) => e.departamento === 'Goya')
    const zona = listarZonas(centros, universo).find((z) => z.zona === 'Zona 1')
    expect(zona?.estadisticas.cantidad).toBe(2)
    expect(zona?.estadisticas.matriculaTotal).toBe(30)
    expect(filtrado.filter((e) => e.zona === 'Zona 1')).toHaveLength(1)
  })
})

describe('tendenciaPorZona', () => {
  it('asigna la clave de tendencia a cada zona con miembros', () => {
    const escuelas = [
      escuela({ cue: 'A', zona: 'Zona 1', historia: { '2023': 10, '2026': 5 } }),
      escuela({ cue: 'B', zona: 'Zona 2', historia: { '2026': 5 } }),
      escuela({ cue: 'C', zona: 'Aislado' }),
    ]
    expect(tendenciaPorZona(escuelas)).toEqual({
      'Zona 1': 'baja',
      'Zona 2': 'sin',
    })
  })
})

const rutaDatos = new URL('./data/v29.json', import.meta.url)

describe.skipIf(!existsSync(rutaDatos))('corte V29 real', () => {
  it('64 centros, 62 zonas con miembros y 89 aislados', () => {
    const dataset = JSON.parse(readFileSync(rutaDatos, 'utf8')) as DatasetV29
    const zonas = listarZonas(dataset.centros, dataset.escuelas)
    expect(dataset.centros).toHaveLength(64)
    expect(zonas.filter((z) => z.estadisticas.cantidad > 0)).toHaveLength(62)
    expect(contarAislados(dataset.escuelas)).toBe(89)
  })
})
