import { cargarReferencias } from '@/lib/infraestructura/datasets/repositorio'
// Estado de los ríos por estación y día para el veredicto diario. Las lecturas
// vienen de hidro_lectura (sincronizada desde la Prefectura Naval Argentina) y
// el catálogo aporta nombre, río y coordenadas para ubicar el departamento.
import { and, gte, lt } from 'drizzle-orm'
import type { Db } from './repositorio'
import { hidroLectura } from '@/lib/db/schema'
import { obtenerEstacionesPrefectura } from '@/lib/infraestructura/hidrometria/estaciones-prefectura'
import { departamentoDeCoordenada } from './celda-departamento'
import { rangoUtcDeDiaArt } from './dia'

export type EstadoAltura = 'sin_dato' | 'normal' | 'alerta' | 'evacuacion'

export type LecturaRio = {
  lecturaM: number | null
  alertaM: number | null
  evacuacionM: number | null
  medidaEn: string
  inconsistente: boolean
}

export type AgregadoRioDia = {
  estadoMax: EstadoAltura
  alturaMaxM: number | null
  tendenciaM24h: number | null
  margenEvacM: number | null
  margenAlertaM: number | null
  ultimaMedidaEn: string
}

export type RioDia = AgregadoRioDia & {
  estacionId: string
  nombre: string
  rio: 'parana' | 'uruguay'
  /** `corrientes` puede elevar el nivel; `contexto-aguas-arriba` sólo se informa. */
  rol: 'corrientes' | 'contexto-aguas-arriba'
  departamento: string | null
}

// Ventana para aceptar una lectura previa como referencia de tendencia.
const VENTANA_PREVIA_MS = 36 * 60 * 60 * 1000

const ORDEN_ESTADO: Record<EstadoAltura, number> = {
  sin_dato: 0,
  normal: 1,
  alerta: 2,
  evacuacion: 3,
}

// Duplica la lógica de la rama hermana `hidrometria/estado-altura.ts`; unificar al integrar.
export function clasificarAltura(
  alturaM: number | null,
  alertaM: number | null,
  evacuacionM: number | null,
): EstadoAltura {
  if (alturaM === null || (alertaM === null && evacuacionM === null)) return 'sin_dato'
  if (evacuacionM !== null && alturaM >= evacuacionM) return 'evacuacion'
  if (alertaM !== null && alturaM >= alertaM) return 'alerta'
  return 'normal'
}

function redondear2(valor: number): number {
  return Math.round(valor * 100) / 100
}

export function agregarRioDia({
  lecturasDia,
  ultimaLecturaDiaAnterior,
}: {
  lecturasDia: LecturaRio[]
  ultimaLecturaDiaAnterior: { lecturaM: number | null } | null
}): AgregadoRioDia | null {
  const validas = lecturasDia
    .filter((l) => !l.inconsistente && l.lecturaM !== null)
    .sort((a, b) => a.medidaEn.localeCompare(b.medidaEn))
  if (validas.length === 0) return null

  const ultima = validas[validas.length - 1]
  const alturas = validas.map((l) => l.lecturaM as number)
  const alturaMax = Math.max(...alturas)
  const estadoMax = validas
    .map((l) => clasificarAltura(l.lecturaM, l.alertaM, l.evacuacionM))
    .reduce((peor, actual) => (ORDEN_ESTADO[actual] > ORDEN_ESTADO[peor] ? actual : peor), 'sin_dato' as EstadoAltura)

  const evacuacionM = [...validas].reverse().find((l) => l.evacuacionM !== null)?.evacuacionM ?? null
  const alertaM = [...validas].reverse().find((l) => l.alertaM !== null)?.alertaM ?? null
  const previa = ultimaLecturaDiaAnterior?.lecturaM ?? null
  const tendencia = previa === null ? null : ultima.lecturaM! - previa

  return {
    estadoMax,
    alturaMaxM: redondear2(alturaMax),
    tendenciaM24h: tendencia === null ? null : redondear2(tendencia),
    margenEvacM: evacuacionM === null ? null : redondear2(evacuacionM - alturaMax),
    margenAlertaM: alertaM === null ? null : redondear2(alertaM - alturaMax),
    ultimaMedidaEn: ultima.medidaEn,
  }
}

/**
 * Estado de cada estación del catálogo con lecturas en el día ART `fecha`.
 * La última lectura previa sólo cuenta si está dentro de las 36 h anteriores al día.
 */
export async function leerRiosDia(db: Db, fecha: string): Promise<RioDia[]> {
  await cargarReferencias()
  const { desde, hasta } = rangoUtcDeDiaArt(fecha)
  const desdeVentana = new Date(Date.parse(desde) - VENTANA_PREVIA_MS).toISOString()

  const filas = await db
    .select()
    .from(hidroLectura)
    .where(and(gte(hidroLectura.medidaEn, desdeVentana), lt(hidroLectura.medidaEn, hasta)))

  const porEstacion = new Map<string, { dia: LecturaRio[]; previa: LecturaRio | null }>()
  for (const fila of filas) {
    const entrada = porEstacion.get(fila.estacionId) ?? { dia: [], previa: null }
    const lectura: LecturaRio = {
      lecturaM: fila.lecturaM,
      alertaM: fila.alertaM,
      evacuacionM: fila.evacuacionM,
      medidaEn: fila.medidaEn,
      inconsistente: fila.inconsistente,
    }
    if (fila.medidaEn >= desde) {
      entrada.dia.push(lectura)
    } else if (!fila.inconsistente && lectura.lecturaM !== null) {
      if (entrada.previa === null || fila.medidaEn > entrada.previa.medidaEn) entrada.previa = lectura
    }
    porEstacion.set(fila.estacionId, entrada)
  }

  const resultado: RioDia[] = []
  for (const estacion of obtenerEstacionesPrefectura()) {
    const entrada = porEstacion.get(estacion.estacionId)
    if (!entrada) continue
    const agregado = agregarRioDia({
      lecturasDia: entrada.dia,
      ultimaLecturaDiaAnterior: entrada.previa,
    })
    if (!agregado) continue
    resultado.push({
      estacionId: estacion.estacionId,
      nombre: estacion.nombrePna,
      rio: estacion.rio,
      rol: estacion.rol,
      departamento: estacion.coordenadas
        ? departamentoDeCoordenada(estacion.coordenadas.lat, estacion.coordenadas.lon)
        : null,
      ...agregado,
    })
  }
  return resultado
}
