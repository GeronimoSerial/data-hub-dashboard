import type {
  AislamientoEscuelaMapa,
  SusceptibilidadEscuelaMapa,
  TerritorioMapa,
} from '@/lib/infraestructura/territorio-mapa'

type MetadatosAislamiento = Omit<Exclude<TerritorioMapa['aislamiento'], null>, 'escuelas'>
type MetadatosSusceptibilidad = Omit<Exclude<TerritorioMapa['susceptibilidad'], null>, 'escuelas'>

const METADATOS_AISLAMIENTO: MetadatosAislamiento = {
  fuente: 'OpenStreetMap',
  atribucion: '© OpenStreetMap contributors',
  licencia: 'ODbL',
  fechaExtractoOsm: '2026-06-01',
  versionJob: '3',
}

const METADATOS_SUSCEPTIBILIDAD: MetadatosSusceptibilidad = {
  fuente: 'physrisk',
  indicador: 'inundacion_fluvial',
  escenario: 'historico',
  unidad: 'm',
  periodoRetornoAnios: 100,
  fechaCorrida: '2026-05-01',
  licencia: 'Apache-2.0',
}

export function territorioCon(
  aislamiento: Record<string, AislamientoEscuelaMapa> | null,
  susceptibilidad: Record<string, SusceptibilidadEscuelaMapa> | null,
  metadatos: {
    aislamiento?: Partial<MetadatosAislamiento>
    susceptibilidad?: Partial<MetadatosSusceptibilidad>
  } = {},
): TerritorioMapa {
  return {
    aislamiento:
      aislamiento === null
        ? null
        : { ...METADATOS_AISLAMIENTO, ...metadatos.aislamiento, escuelas: aislamiento },
    susceptibilidad:
      susceptibilidad === null
        ? null
        : {
            ...METADATOS_SUSCEPTIBILIDAD,
            ...metadatos.susceptibilidad,
            escuelas: susceptibilidad,
          },
  }
}
