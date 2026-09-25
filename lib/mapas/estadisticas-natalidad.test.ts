import { describe, expect, it } from 'vitest'
import {
  construirKpis,
  construirOfertaInicialVsCohorte,
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
    serie: { '2014': 1200, '2022': 1000, '2023': 900 },
    variacion: { abs: -300, pct: -25 },
  },
  departamentos: [
    {
      clave: 'CAPITAL',
      nombre: 'Capital',
      coddpto: '18001',
      serie: { '2014': 700, '2022': 600, '2023': 500 },
      variacion: { abs: -200, pct: -28.57 },
      porNivel: { ...porNivelVacio(), Inicial: agregadoNivel(10, 30), Primario: agregadoNivel(8, 40) },
      inicial: { cues: 10, seccionesTotal: 30, seccionesPorCurso: {} },
    },
    {
      clave: 'GOYA',
      nombre: 'Goya',
      coddpto: '18002',
      serie: { '2014': 450, '2022': 400, '2023': 400 },
      variacion: { abs: 0, pct: 0 },
      porNivel: { ...porNivelVacio(), Inicial: agregadoNivel(5, 12), Primario: agregadoNivel(4, 20) },
      inicial: { cues: 5, seccionesTotal: 12, seccionesPorCurso: {} },
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
})

describe('construirOfertaInicialVsCohorte', () => {
  it('usa anioFin - 3 como año de cohorte y compara secciones vs. nacidos de ese año', () => {
    const { anioCohorte, filas } = construirOfertaInicialVsCohorte(DATOS, 'Todos')
    expect(anioCohorte).toBe(2020) // 2023 - 3, dentro del rango [2014, 2023]
    // Ningún departamento de la fixture trae serie en 2020: cae a 0, nunca undefined.
    expect(filas).toEqual([
      { departamento: 'Capital', secciones: 30, nacidosCohorte: 0 },
      { departamento: 'Goya', secciones: 12, nacidosCohorte: 0 },
    ])
  })

  it('acota anioCohorte a anioInicio cuando anioFin - 3 cae fuera del rango de datos', () => {
    const datosRangoCorto: DatosNatalidad = {
      ...DATOS,
      meta: { ...DATOS.meta, anioInicio: 2022, anioFin: 2023 },
    }
    const { anioCohorte } = construirOfertaInicialVsCohorte(datosRangoCorto, 'Todos')
    expect(anioCohorte).toBe(2022)
  })

  it('filtra por departamento', () => {
    const { filas } = construirOfertaInicialVsCohorte(DATOS, 'CAPITAL')
    expect(filas).toEqual([{ departamento: 'Capital', secciones: 30, nacidosCohorte: 0 }])
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
