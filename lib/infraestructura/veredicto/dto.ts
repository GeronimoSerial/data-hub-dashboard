import { obtenerEstacionesPrefecturaDeRegion } from '../hidrometria/estaciones-prefectura'
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
  estacion?: { nombre: string; rio: string }
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
  /** Fin (ISO) del último gránulo IMERG recibido; sólo informado para el día de hoy. */
  imergHasta?: string | null
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
  const estacionId = String(m.id ?? '').match(/^rio\.([^.]+)\./)?.[1]
  const estacion = estacionId ? obtenerEstacionesPrefecturaDeRegion().find((e) => e.estacionId === estacionId) : undefined
  const persistida = registro(m.estacion)
  const identidad = typeof persistida.nombre === 'string' && typeof persistida.rio === 'string'
    ? { nombre: persistida.nombre, rio: persistida.rio }
    : estacion ? { nombre: estacion.nombrePna, rio: estacion.rio } : undefined
  return {
    ...(identidad ? { estacion: identidad } : {}),
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
  const cobertura = registro(fila.cobertura)
  return {
    id: fila.id,
    fecha: fila.fecha,
    ambito: fila.ambito,
    tipoDia: fila.tipoDia,
    nivel: fila.nivel,
    texto: sinFuentesAusentes(fila.textoFinal ?? null),
    fuente: fila.fuente,
    enCalibracion: fila.enCalibracion,
    cerrado: fila.cerrado,
    generadoEn: fila.generadoEn,
    version,
    frases: fila.salidaIa ? (Array.isArray(salidaIa.frases) ? salidaIa.frases : null) : null,
    traza: lista(registro(fila.trazaReglas).reglas),
    aguasArriba: lista(registro(fila.trazaReglas).aguasArriba).map(aAguaArribaDto),
    metricas: lista(registro(fila.metricas).metricas).map(aMetricaDto),
    fuentesAusentes: lista(cobertura.fuentesAusentes),
    imergHasta: typeof cobertura.imergHasta === 'string' ? cobertura.imergHasta : null,
  }
}

/**
 * Los veredictos guardados antes de este cambio traen "Sin datos de: …." al
 * final del texto. Las fuentes ausentes ya no van en el texto del operador
 * (quedan en `fuentesAusentes`, como detalle técnico), así que se quitan acá.
 */
export function sinFuentesAusentes(texto: string | null): string | null {
  if (texto === null) return null
  return texto.replace(/\s*Sin datos de: [^.]*\.\s*$/, '').trim()
}
