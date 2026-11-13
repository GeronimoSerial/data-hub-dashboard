import { beforeAll, describe, expect, it, vi } from 'vitest'
import { obtenerEstacionesPrefecturaDeRegion } from './estaciones-prefectura'
import { obtenerEstacionCatalogo, validarConsultaHistoriaEstacion } from './lecturas-repo'

// Catálogo fijo: el contrato que Corrientes debe seguir entregando sin cambios.
const { CATALOGO } = vi.hoisted(() => ({
  CATALOGO: [
    {
      estacionId: 'pna-corrientes',
      nombrePna: 'CORRIENTES',
      idHistorico: 1,
      rio: 'parana',
      rol: 'corrientes',
      coordenadas: { lat: -27.48, lon: -58.83, fuente: 'pna-mapa.php', consultadaEl: '2026-01-01', verificada: false, precisionDecimales: 2 },
    },
    {
      estacionId: 'pna-contexto',
      nombrePna: 'CONTEXTO',
      idHistorico: 2,
      rio: 'uruguay',
      rol: 'contexto-aguas-arriba',
      coordenadas: null,
      represaAguasArriba: true,
    },
  ],
}))

vi.mock('@/lib/infraestructura/datasets/memoria', () => ({
  referencia: vi.fn(() => CATALOGO),
  versionReferencia: vi.fn(() => 'v-corrientes-test'),
}))

const regionPrevia = process.env.REGION

beforeAll(async () => {
  process.env.REGION = 'corrientes'
  const { __reiniciarRegionActivaParaPruebas } = await import('@/lib/infraestructura/region/activa')
  __reiniciarRegionActivaParaPruebas()
  return () => {
    if (regionPrevia === undefined) delete process.env.REGION
    else process.env.REGION = regionPrevia
  }
})

describe('catálogo de Prefectura en Corrientes', () => {
  it('devuelve el catálogo completo de la región', () => {
    expect(obtenerEstacionesPrefecturaDeRegion()).toEqual(CATALOGO)
  })

  it('resuelve una estación del catálogo por id', () => {
    expect(obtenerEstacionCatalogo('pna-corrientes')).toEqual(CATALOGO[0])
    expect(obtenerEstacionCatalogo('pna-inexistente')).toBeNull()
  })

  it('valida una consulta de historia para una estación conocida', () => {
    const resultado = validarConsultaHistoriaEstacion({
      estacionId: 'pna-corrientes',
      desde: '2026-01-01T00:00:00Z',
      hasta: '2026-01-02T00:00:00Z',
    })
    expect(resultado).toMatchObject({
      ok: true,
      estacion: CATALOGO[0],
      desdeIso: '2026-01-01T00:00:00.000Z',
      hastaIso: '2026-01-02T00:00:00.000Z',
      horasSolicitadas: 24,
      limite: 2500,
    })
  })

  it('rechaza con 404 una estación fuera del catálogo', () => {
    expect(
      validarConsultaHistoriaEstacion({
        estacionId: 'pna-inexistente',
        desde: '2026-01-01T00:00:00Z',
        hasta: '2026-01-02T00:00:00Z',
      }),
    ).toEqual({
      ok: false,
      codigo: 'estacion_no_encontrada',
      status: 404,
      error: 'Estación no encontrada en el catálogo hidrométrico',
    })
  })
})
