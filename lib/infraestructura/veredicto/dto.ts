// Forma pública del veredicto diario. No expone tokens, costo, modelo, hash de
// entradas, id de job ni motivo de fallback: esos datos quedan en la fila.
import type { FilaVeredicto } from './repositorio'
import type { EstadoAltura } from './rios'

export type AguaArribaDtoVeredicto = {
  estacionId: string
  nombre: string
  rio: 'parana' | 'uruguay'
  estadoMax: EstadoAltura
  alturaMaxM: number | null
  umbralM: number | null
}

export type MetricaDtoVeredicto = {
  id: string
  valor: unknown
  unidad: string | null
  etiqueta: string
  fuenteUrl: string | null
}

export type DtoVeredicto = {
  id: string
  fecha: string
  ambito: string
  tipoDia: string
  nivel: string
  texto: string | null
  fuente: string
  enCalibracion: boolean
  cerrado: boolean
  generadoEn: string
  version: number | null
  frases: unknown[] | null
  traza: unknown[]
  /** Estaciones de aguas arriba con dato: contexto, no forman parte de la traza ni del nivel. */
  aguasArriba: AguaArribaDtoVeredicto[]
  metricas: MetricaDtoVeredicto[]
  fuentesAusentes: unknown[]
}

function lista(valor: unknown): unknown[] {
  return Array.isArray(valor) ? valor : []
}

function registro(valor: unknown): Record<string, unknown> {
  return valor !== null && typeof valor === 'object' ? (valor as Record<string, unknown>) : {}
}

function aAguaArribaDto(item: unknown): AguaArribaDtoVeredicto {
  const a = registro(item)
  return {
    estacionId: String(a.estacionId ?? ''),
    nombre: String(a.nombre ?? ''),
    rio: a.rio === 'uruguay' ? 'uruguay' : 'parana',
    estadoMax: String(a.estadoMax ?? 'sin_dato') as EstadoAltura,
    alturaMaxM: typeof a.alturaMaxM === 'number' ? a.alturaMaxM : null,
    umbralM: typeof a.umbralM === 'number' ? a.umbralM : null,
  }
}

function aMetricaDto(item: unknown): MetricaDtoVeredicto {
  const m = registro(item)
  return {
    id: String(m.id ?? ''),
    valor: m.valor ?? null,
    unidad: typeof m.unidad === 'string' ? m.unidad : null,
    etiqueta: String(m.etiqueta ?? ''),
    fuenteUrl: typeof m.fuenteUrl === 'string' ? m.fuenteUrl : null,
  }
}

// `version` la calcula el llamador (posición en el historial), no la fila.
export function aDtoVeredicto(fila: FilaVeredicto, version: number | null): DtoVeredicto {
  const salidaIa = registro(fila.salidaIa)
  return {
    id: fila.id,
    fecha: fila.fecha,
    ambito: fila.ambito,
    tipoDia: fila.tipoDia,
    nivel: fila.nivel,
    texto: fila.textoFinal ?? null,
    fuente: fila.fuente,
    enCalibracion: fila.enCalibracion,
    cerrado: fila.cerrado,
    generadoEn: fila.generadoEn,
    version,
    frases: fila.salidaIa ? (Array.isArray(salidaIa.frases) ? salidaIa.frases : null) : null,
    traza: lista(registro(fila.trazaReglas).reglas),
    aguasArriba: lista(registro(fila.trazaReglas).aguasArriba).map(aAguaArribaDto),
    metricas: lista(registro(fila.metricas).metricas).map(aMetricaDto),
    fuentesAusentes: lista(registro(fila.cobertura).fuentesAusentes),
  }
}
