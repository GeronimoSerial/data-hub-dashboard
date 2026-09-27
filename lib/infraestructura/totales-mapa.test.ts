import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EscuelaMapa, EscuelasMapaResultado, FiltrosMapa } from './parte-mapa'
import { listarEscuelasMapa } from './parte-mapa'
import { obtenerTotalesMapa } from './totales-mapa'

// totales-mapa importa `listarEscuelasMapa` de ./parte-mapa; se mockea el
// módulo entero (es distinto del que se está probando) para no arrastrar la
// base de datos real.
vi.mock('./parte-mapa', () => ({
  listarEscuelasMapa: vi.fn(),
}))

const listarEscuelasMapaMock = vi.mocked(listarEscuelasMapa)

function escuela(
  cueAnexo: string,
  departamento: string,
  estado: EscuelaMapa['estado'],
): EscuelaMapa {
  return {
    cueAnexo,
    nombre: cueAnexo,
    departamento,
    localidad: 'Localidad',
    lat: -28,
    lon: -58,
    estado,
  }
}

function sinUbicacion(cueAnexo: string, departamento: string) {
  return { cueAnexo, nombre: cueAnexo, departamento, localidad: 'Localidad' }
}

// 7 escuelas con coordenadas + 2 sin coordenadas = padrón 9.
// - CONCEPCION: CUE-1 (afectada) + CUE-2/CUE-3 (sin afectación) + CUE-8 sin
//   ubicación => 4 total, 1 afectada, 25.0%.
// - CAPITAL: CUE-4/CUE-5 (afectadas) + CUE-6 (sin afectación) + CUE-9 sin
//   ubicación => 4 total, 2 afectadas, 50.0%.
// - ITATI: CUE-7 (sin afectación) => 1 total, 0 afectadas, 0%.
const resultadoEjemplo: EscuelasMapaResultado = {
  escuelas: [
    escuela('CUE-1', 'Concepción', 'afectada'),
    escuela('CUE-2', 'Concepción', 'sin_afectacion_reportada'),
    escuela('CUE-3', 'CONCEPCION', 'sin_afectacion_reportada'),
    escuela('CUE-4', 'Capital', 'afectada'),
    escuela('CUE-5', 'Capital', 'afectada'),
    escuela('CUE-6', 'Capital', 'sin_afectacion_reportada'),
    escuela('CUE-7', 'Itatí', 'sin_afectacion_reportada'),
  ],
  sinUbicacion: [sinUbicacion('CUE-8', 'Concepción'), sinUbicacion('CUE-9', 'Capital')],
  totalPadron: 9,
}

beforeEach(() => {
  listarEscuelasMapaMock.mockReset()
  listarEscuelasMapaMock.mockResolvedValue(resultadoEjemplo)
})

describe('obtenerTotalesMapa', () => {
  it('llama a listarEscuelasMapa UNA sola vez, con los filtros', async () => {
    const filtros: FiltrosMapa = { territorio: 'Capital' }

    await obtenerTotalesMapa(filtros)

    expect(listarEscuelasMapaMock).toHaveBeenCalledTimes(1)
    expect(listarEscuelasMapaMock).toHaveBeenCalledWith(filtros)
  })

  it('agrupa por departamento normalizado y calcula total/afectadas/%', async () => {
    const { departamentos } = await obtenerTotalesMapa()

    expect(departamentos).toEqual([
      {
        departamento: 'CAPITAL',
        departamentoOriginal: 'Capital',
        totalEscuelas: 4,
        escuelasAfectadas: 2,
        porcentajeAfectadas: 50,
      },
      {
        departamento: 'CONCEPCION',
        departamentoOriginal: 'Concepción',
        totalEscuelas: 4,
        escuelasAfectadas: 1,
        porcentajeAfectadas: 25,
      },
      {
        departamento: 'ITATI',
        departamentoOriginal: 'Itatí',
        totalEscuelas: 1,
        escuelasAfectadas: 0,
        porcentajeAfectadas: 0,
      },
    ])
  })

  it('agrupa variantes de capitalización/tildes y muestra el primer original', async () => {
    const { departamentos } = await obtenerTotalesMapa()

    const concepcion = departamentos.filter((d) => d.departamento === 'CONCEPCION')
    expect(concepcion).toHaveLength(1)
    // "Concepción" (CUE-1) se vio antes que "CONCEPCION" (CUE-3).
    expect(concepcion[0].departamentoOriginal).toBe('Concepción')
    // Las 3 escuelas del grupo + CUE-8 sin ubicación.
    expect(concepcion[0].totalEscuelas).toBe(4)
  })

  it('una escuela sin coordenadas suma al total pero nunca a las afectadas', async () => {
    const { departamentos } = await obtenerTotalesMapa()

    const capital = departamentos.find((d) => d.departamento === 'CAPITAL')
    expect(capital).toBeDefined()
    // 3 escuelas con coordenadas + CUE-9 sin ubicación.
    expect(capital!.totalEscuelas).toBe(4)
    // CUE-9 no puede figurar como afectada: sólo 2 lo están.
    expect(capital!.escuelasAfectadas).toBe(2)
    expect(capital!.porcentajeAfectadas).toBe(50)
  })

  it('sin doble conteo: suma de departamentos == provincia == totalPadron', async () => {
    const { departamentos, provincia } = await obtenerTotalesMapa()

    const sumatoria = departamentos.reduce((acc, d) => acc + d.totalEscuelas, 0)
    expect(sumatoria).toBe(provincia.totalEscuelas)
    expect(provincia.totalEscuelas).toBe(resultadoEjemplo.totalPadron)
  })

  it('provincia usa el % sobre los totales sumados, no el promedio de los %', async () => {
    const { departamentos, provincia } = await obtenerTotalesMapa()

    expect(provincia).toEqual({
      totalEscuelas: 9,
      escuelasAfectadas: 3,
      porcentajeAfectadas: 33.3,
    })

    // El promedio de los % por departamento (25.0, 50.0, 0) daría 25.0, que
    // es justo lo que NO debe salir.
    const promedio =
      departamentos.reduce((acc, d) => acc + d.porcentajeAfectadas, 0) / departamentos.length
    expect(Math.round(promedio * 10) / 10).toBe(25)
    expect(provincia.porcentajeAfectadas).not.toBe(Math.round(promedio * 10) / 10)
  })

  it('sin afectadas, todos los porcentajes dan 0', async () => {
    listarEscuelasMapaMock.mockResolvedValue({
      escuelas: [
        escuela('CUE-1', 'Capital', 'sin_afectacion_reportada'),
        escuela('CUE-2', 'Goya', 'sin_afectacion_reportada'),
      ],
      sinUbicacion: [sinUbicacion('CUE-3', 'Goya')],
      totalPadron: 3,
    })

    const { departamentos, provincia } = await obtenerTotalesMapa()

    expect(provincia).toEqual({ totalEscuelas: 3, escuelasAfectadas: 0, porcentajeAfectadas: 0 })
    expect(departamentos.every((d) => d.porcentajeAfectadas === 0)).toBe(true)
  })

  it('padrón vacío devuelve todo en 0 sin división por cero', async () => {
    listarEscuelasMapaMock.mockResolvedValue({ escuelas: [], sinUbicacion: [], totalPadron: 0 })

    const { departamentos, provincia } = await obtenerTotalesMapa()

    expect(departamentos).toEqual([])
    expect(provincia).toEqual({ totalEscuelas: 0, escuelasAfectadas: 0, porcentajeAfectadas: 0 })
  })
})
