// Tests puros de la combinación de puertos de río: sin base de datos ni red.
import { describe, expect, it, vi } from 'vitest'
import { combinarPuertosNivelRio, combinarProveedoresRio } from './combinar-puertos-rio'
import type { EvidenciaRioNoDisponible, EvidenciaRioPrefectura, PuertoNivelRio } from './puertos'

const CUE = '13000001'
const ASOF = '2026-11-13T12:00:00.000Z'

const EVIDENCIA: EvidenciaRioPrefectura = {
  cueAnexo: CUE,
  estacionId: 'ana-cerca',
  rio: 'negro',
  lecturaM: 16.28,
  alertaM: 27,
  evacuacionM: 29,
  variacionM: 0.05,
  medidaEn: '2026-11-13T11:00:00.000Z',
  estado: 'normal',
  criterioExposicion: 'proximidad_ribera',
}

const SIN_DATO: EvidenciaRioNoDisponible = {
  cueAnexo: CUE,
  estacionId: 'sgb-mao',
  rio: 'negro',
  disponibilidad: 'sin_dato',
  motivo: 'sin lectura',
}

const NO_APLICA: EvidenciaRioNoDisponible = {
  cueAnexo: CUE,
  estacionId: 'ana-lejos',
  rio: 'solimoes',
  disponibilidad: 'no_aplica',
  motivo: 'costa de embalse',
}

function puertoFijo(resultado: EvidenciaRioPrefectura | EvidenciaRioNoDisponible | null): PuertoNivelRio {
  return { obtenerEvidencia: vi.fn(async () => resultado) }
}

function puertoRegistrado(
  nombre: string,
  resultado: EvidenciaRioPrefectura | EvidenciaRioNoDisponible | null,
  llamadas: string[],
): PuertoNivelRio {
  return {
    async obtenerEvidencia() {
      llamadas.push(nombre)
      return resultado
    },
  }
}

const parametros = { cueAnexo: CUE, asOf: ASOF }

describe('combinarPuertosNivelRio', () => {
  it('prefiere la evidencia aunque el puerto que dice sin dato vaya primero', async () => {
    const combinado = combinarPuertosNivelRio([puertoFijo(SIN_DATO), puertoFijo(EVIDENCIA)])
    expect(await combinado.obtenerEvidencia(parametros)).toEqual(EVIDENCIA)
  })

  it('devuelve el primer no disponible cuando ningún puerto tiene evidencia', async () => {
    const combinado = combinarPuertosNivelRio([puertoFijo(null), puertoFijo(SIN_DATO), puertoFijo(NO_APLICA)])
    expect(await combinado.obtenerEvidencia(parametros)).toEqual(SIN_DATO)
  })

  it('devuelve null cuando todos los puertos devuelven null', async () => {
    const combinado = combinarPuertosNivelRio([puertoFijo(null), puertoFijo(null)])
    expect(await combinado.obtenerEvidencia(parametros)).toBeNull()
  })

  it('consulta cada puerto en orden, uno por uno', async () => {
    const llamadas: string[] = []
    const combinado = combinarPuertosNivelRio([
      puertoRegistrado('a', EVIDENCIA, llamadas),
      puertoRegistrado('b', null, llamadas),
      puertoRegistrado('c', SIN_DATO, llamadas),
    ])
    await combinado.obtenerEvidencia(parametros)
    expect(llamadas).toEqual(['a', 'b', 'c'])
  })

  it('un error de un puerto se propaga', async () => {
    const roto: PuertoNivelRio = {
      obtenerEvidencia: vi.fn(async () => {
        throw new Error('falló la base')
      }),
    }
    const combinado = combinarPuertosNivelRio([puertoFijo(EVIDENCIA), roto])
    await expect(combinado.obtenerEvidencia(parametros)).rejects.toThrow('falló la base')
  })
})

describe('combinarProveedoresRio', () => {
  it('une los ids con + y combina los puertos creados con las mismas dependencias', async () => {
    const crearA = vi.fn(() => puertoFijo(null))
    const crearB = vi.fn(() => puertoFijo(SIN_DATO))
    const deps = { marca: 'x' }

    const proveedor = combinarProveedoresRio<{ marca: string }>([
      { id: 'prefectura', crearPuerto: crearA },
      { id: 'ana', crearPuerto: crearB },
    ])

    expect(proveedor.id).toBe('prefectura+ana')
    expect(await proveedor.crearPuerto(deps).obtenerEvidencia(parametros)).toEqual(SIN_DATO)
    expect(crearA).toHaveBeenCalledWith(deps)
    expect(crearB).toHaveBeenCalledWith(deps)
  })
})
