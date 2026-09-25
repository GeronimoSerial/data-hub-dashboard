import { describe, expect, it } from 'vitest'
import {
  aniosCohorteInicial,
  buscarPuestoNacidosPorSeccion,
  buscarPuestoVariacion,
  construirKpis,
  construirNacidosPorSeccionCohorte,
  construirSerieNacimientos,
  construirSerieProvincialNacimientos,
  construirVariacionNacimientosPorDepartamento,
} from './estadisticas-natalidad'
import type { DatosNatalidad } from './natalidad'

function agregadoNivel(escuelas: number, secciones: number) {
  return { escuelas, secciones }
}

function porNivelVacio() {
  return {
    Inicial: agregadoNivel(0, 0),
    Primario: agregadoNivel(0, 0),
    Secundario: agregadoNivel(0, 0),
    Superior: agregadoNivel(0, 0),
    'Servicios Educativos': agregadoNivel(0, 0),
  }
}

const DATOS: DatosNatalidad = {
  meta: {
    fuenteNatalidad: { nombre: 'DEIS', url: 'https://example.org' },
    fuenteLocalizaciones: 'Localizaciones: X',
    fuenteSecciones: 'Secciones: Y',
    anioInicio: 2014,
    anioFin: 2023,
    anios: [2014, 2022, 2023],
    extraidoEn: '2026-09-25',
  },
  provincia: {
    serie: { '2014': 1200, '2020': 110, '2021': 100, '2022': 1000, '2023': 900 },
    variacion: { abs: -300, pct: -25 },
  },
  departamentos: [
    {
      clave: 'CAPITAL',
      nombre: 'Capital',
      coddpto: '18001',
      serie: { '2014': 700, '2020': 90, '2021': 80, '2022': 600, '2023': 500 },
      variacion: { abs: -200, pct: -28.57 },
      porNivel: { ...porNivelVacio(), Inicial: agregadoNivel(10, 30), Primario: agregadoNivel(8, 40) },
      inicial: {
        cues: 10,
        seccionesTotal: 30,
        seccionesPorCurso: { 'Sala de 3': 3, 'Sala de 4': 3, 'Sala de 5': 3, Plurisala: 1 },
      },
    },
    {
      clave: 'GOYA',
      nombre: 'Goya',
      coddpto: '18002',
      serie: { '2014': 450, '2020': 20, '2021': 20, '2022': 400, '2023': 400 },
      variacion: { abs: 0, pct: 0 },
      porNivel: { ...porNivelVacio(), Inicial: agregadoNivel(5, 12), Primario: agregadoNivel(4, 20) },
      // Sin secciones en Sala de 3/4/5/Plurisala/Sala Integrada (sólo "Sala Especial", que no cuenta):
      // división inválida, debe excluirse (nacidosPorSeccion: null), nunca 0.
      inicial: { cues: 5, seccionesTotal: 12, seccionesPorCurso: { 'Sala Especial': 12 } },
    },
  ],
  departamentosSinMatch: [],
}

describe('construirSerieProvincialNacimientos', () => {
  it('un punto por año de datos.meta.anios', () => {
    expect(construirSerieProvincialNacimientos(DATOS)).toEqual([
      { anio: 2014, valor: 1200 },
      { anio: 2022, valor: 1000 },
      { anio: 2023, valor: 900 },
    ])
  })
})

describe('construirVariacionNacimientosPorDepartamento', () => {
  it('ordena de mayor caída a mayor crecimiento', () => {
    const resultado = construirVariacionNacimientosPorDepartamento(DATOS)
    expect(resultado.map((r) => r.departamento)).toEqual(['Capital', 'Goya'])
  })

  it('un pct null (sin base comparable) queda al final', () => {
    const datosConNull: DatosNatalidad = {
      ...DATOS,
      departamentos: [
        { ...DATOS.departamentos[0], variacion: { abs: 0, pct: null } },
        DATOS.departamentos[1],
      ],
    }
    const resultado = construirVariacionNacimientosPorDepartamento(datosConNull)
    expect(resultado[resultado.length - 1].departamento).toBe('Capital')
  })

  it('incluye la clave del departamento (para resaltar/seleccionar)', () => {
    const resultado = construirVariacionNacimientosPorDepartamento(DATOS)
    expect(resultado.map((r) => r.clave)).toEqual(['CAPITAL', 'GOYA'])
  })
})

describe('buscarPuestoVariacion', () => {
  it('devuelve el puesto (1-based) y el total', () => {
    const barras = construirVariacionNacimientosPorDepartamento(DATOS)
    expect(buscarPuestoVariacion(barras, 'GOYA')).toEqual({ puesto: 2, total: 2 })
    expect(buscarPuestoVariacion(barras, 'CAPITAL')).toEqual({ puesto: 1, total: 2 })
  })

  it('null si la clave no aparece', () => {
    const barras = construirVariacionNacimientosPorDepartamento(DATOS)
    expect(buscarPuestoVariacion(barras, 'INEXISTENTE')).toBeNull()
  })
})

describe('construirSerieNacimientos', () => {
  it("'Todos': serie provincial, titulo de provincia", () => {
    const resultado = construirSerieNacimientos(DATOS, 'Todos')
    expect(resultado.titulo).toBe('Corrientes (provincia)')
    expect(resultado.puntos).toEqual(construirSerieProvincialNacimientos(DATOS))
  })

  it('un departamento: su propia serie, titulo con su nombre', () => {
    const resultado = construirSerieNacimientos(DATOS, 'GOYA')
    expect(resultado.titulo).toBe('Goya')
    expect(resultado.puntos).toEqual([
      { anio: 2014, valor: 450 },
      { anio: 2022, valor: 400 },
      { anio: 2023, valor: 400 },
    ])
  })

  it('clave inexistente: cae a la serie provincial', () => {
    const resultado = construirSerieNacimientos(DATOS, 'INEXISTENTE')
    expect(resultado.titulo).toBe('Corrientes (provincia)')
  })
})

describe('aniosCohorteInicial', () => {
  it('Sala de 5 ≈ ciclo-6, Sala de 4 ≈ ciclo-5, Sala de 3 ≈ ciclo-4', () => {
    expect(aniosCohorteInicial(2026)).toEqual([2022, 2021, 2020])
  })

  it('acepta cualquier ciclo (no hardcodeado)', () => {
    expect(aniosCohorteInicial(2030)).toEqual([2026, 2025, 2024])
  })
})

describe('construirNacidosPorSeccionCohorte', () => {
  it('suma nacidos de las 3 cohortes sobre secciones de Sala de 3/4/5 + Plurisala + Sala Integrada', () => {
    const { ciclo, aniosCohorte, filas } = construirNacidosPorSeccionCohorte(DATOS)
    expect(ciclo).toBe(2026)
    expect(aniosCohorte).toEqual([2022, 2021, 2020])
    // Capital: nacidos 600+80+90=770, secciones 3+3+3+1=10 → 77.
    // Goya: sin secciones en el denominador (sólo "Sala Especial", que no cuenta) → excluido (null), nunca 0.
    expect(filas).toEqual([
      { clave: 'CAPITAL', departamento: 'Capital', nacidosCohorte: 770, secciones: 10, nacidosPorSeccion: 77 },
      { clave: 'GOYA', departamento: 'Goya', nacidosCohorte: 440, secciones: 0, nacidosPorSeccion: null },
    ])
  })

  it('ordena de mayor a menor nacidosPorSeccion, null siempre al final', () => {
    const { filas } = construirNacidosPorSeccionCohorte(DATOS)
    expect(filas.map((f) => f.departamento)).toEqual(['Capital', 'Goya'])
  })

  it('el valor provincial es siempre el total de los 25 departamentos (nunca filtrado)', () => {
    const { provincia } = construirNacidosPorSeccionCohorte(DATOS)
    // Provincia: nacidos 1000+100+110=1210, secciones 10+0=10 → 121.
    expect(provincia).toEqual({
      clave: '__provincia__',
      departamento: 'Corrientes (provincia)',
      nacidosCohorte: 1210,
      secciones: 10,
      nacidosPorSeccion: 121,
    })
  })

  it('mantiene todas las filas (comparación entre departamentos, no filtra por seleccionado)', () => {
    const { filas } = construirNacidosPorSeccionCohorte(DATOS)
    expect(filas.map((f) => f.departamento)).toEqual(['Capital', 'Goya'])
  })
})

describe('buscarPuestoNacidosPorSeccion', () => {
  it('devuelve el puesto entre las filas con valor válido', () => {
    const { filas } = construirNacidosPorSeccionCohorte(DATOS)
    expect(buscarPuestoNacidosPorSeccion(filas, 'CAPITAL')).toEqual({ puesto: 1, total: 1 })
  })

  it('null para una clave sin valor (secciones = 0) o inexistente', () => {
    const { filas } = construirNacidosPorSeccionCohorte(DATOS)
    expect(buscarPuestoNacidosPorSeccion(filas, 'GOYA')).toBeNull()
    expect(buscarPuestoNacidosPorSeccion(filas, 'INEXISTENTE')).toBeNull()
  })
})

describe('construirKpis', () => {
  it('Todos: usa los totales provinciales', () => {
    const kpis = construirKpis(DATOS, 'Todos')
    expect(kpis).toEqual({
      nacidosUltimoAnio: 900,
      variacionNacidos: { abs: -300, pct: -25 },
      seccionesInicialTotal: 42,
      escuelasInicialTotal: 15,
    })
  })

  it('un departamento: usa sus propios valores', () => {
    const kpis = construirKpis(DATOS, 'GOYA')
    expect(kpis).toEqual({
      nacidosUltimoAnio: 400,
      variacionNacidos: { abs: 0, pct: 0 },
      seccionesInicialTotal: 12,
      escuelasInicialTotal: 5,
    })
  })
})
