import type { ParteMapa } from '@/lib/infraestructura/parte-mapa'

export function crearParteMapa(overrides: Partial<ParteMapa> = {}): ParteMapa {
  return {
    parteId: 'p1',
    cueAnexo: '1801605-04',
    nombre: 'Escuela 1',
    departamento: 'Capital',
    localidad: 'Corrientes',
    lat: -27.47,
    lon: -58.83,
    servicio: 'normal',
    estadoEstablecimiento: 'habitual',
    peorSeveridad: 'Alta',
    categorias: ['establecimiento'],
    afectaciones: [],
    seccionesAlcanzadas: 0,
    alumnosDelHecho: 0,
    alumnosAlcanzados: 0,
    rigeDesde: '2026-08-01T00:00:00Z',
    actualizadaEn: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}
