// Tipos del corte V29 normalizado para el mapa de reorganización. Los campos
// van en camelCase; el mapeo desde los nombres de origen vive en
// importar-v29.ts.

/** Establecimiento del corte V29 con ubicación, matrícula, historia y salarios. */
export interface EscuelaV29 {
  cue: string
  nombre: string
  departamento: string
  localidad: string
  ambito: string
  cui: string
  jurisdiccion: string
  modalidad: string
  matricula: number
  /** Matrícula por año. Un año ausente es sin dato, nunca cero. */
  historia: Record<string, number>
  lat: number
  lon: number
  /** Situación de revista POF. Vacío cuando el CUE no tiene registros. */
  pof: Record<string, unknown>
  agentes: number
  /** "Zona N", "Aislado" o cadena vacía cuando no tiene ubicación. */
  zona: string
  /** Costo salarial mensual de septiembre 2026. Null si falta o no es positivo. */
  sueldosTotal: number | null
  personasSueldos: number | null
  /** Null si falta o el origen vale "NULL". */
  clasificacionZonaSueldos: string | null
}

/** Establecimiento de referencia (Primaria y/o Secundaria) de la capa de referencias. */
export interface ReferenciaV29 {
  cue: string
  nombre: string
  lat: number
  lon: number
  primaria: boolean
  secundaria: boolean
  /** Null cuando el origen no informa matrícula primaria: sin dato, nunca cero. */
  matriculaPrimaria: number | null
  localidad: string
  departamento: string
}

/** Centro de zona: el círculo de 20 km se dibuja en sus coordenadas. */
export interface CentroZona {
  id: number
  lat: number
  lon: number
}

/** Oferta declarada por un CUE en un nivel: matrícula nominal y turnos. */
export interface OfertaNivel {
  total: number
  turnos: Record<string, number>
  modalidades: string[]
  orientaciones: string[]
}

/** Resumen de cobertura del corte. */
export interface CoberturaV29 {
  escuelas: number
  alumnos: number
  conCoordenadas: number
  conImportePositivo: number
  conRegistrosPof: number
  centros: number
  zonasOcupadas: number
  historiaPorAnio: Record<string, number>
}

export interface DatasetV29 {
  version: 'V29'
  /** Fecha de corte declarada por el mockup (AAAA-MM-DD). */
  corte: string
  escuelas: EscuelaV29[]
  referencias: ReferenciaV29[]
  /** Agregados de oferta por CUE y nivel (datosNominales del mockup). No son datos personales. */
  ofertaPorCue: Record<string, Record<string, OfertaNivel>>
  centros: CentroZona[]
  cobertura: CoberturaV29
}

/** Cobertura más las diferencias entre fuentes. Ninguna diferencia se descarta en silencio. */
export interface InformeImportacion extends CoberturaV29 {
  /** Siempre 0 aquí: el cálculo de aislados corresponde a zonas.ts. */
  aislados: number
  aisladosNota: string
  referencias: number
  referenciasPrimaria: number
  referenciasSecundaria: number
  clavesOferta: number
  /** CUE de referencias sin entrada en ofertaPorCue. */
  referenciasSinOferta: number
  /** Claves de ofertaPorCue sin referencia. */
  ofertaSinReferencia: number
  /** CUE de escuelas sin importe salarial positivo. */
  sinImporte: string[]
  /** Campos de origen que no se trasladaron al dataset. */
  camposDescartados: string[]
}
