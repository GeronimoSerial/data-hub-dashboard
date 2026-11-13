import { randomUUID } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { hidroLectura, hidroReferencia } from '@/lib/db/schema'
import { guardarReferencia, type FilaReferencia } from '@/lib/infraestructura/hidrometria/referencia-repo'
import type { Restaurar } from './escenarios-falla'
import { ESPERADOS_HIDRO } from './hidro'

// Escenarios de plausibilidad del Centro de Situación (indicador I4). Cada escenario se aplica dentro
// de la prueba y devuelve su restauración. La estación es la del seed hidrométrico (pna-corrientes).

const ESTACION_ID = 'pna-corrientes'
// Umbral de sensor trabado que escribe el escenario; tiene que coincidir con clasificar.ts (12).
const LECTURAS_IDENTICAS = 12
const VENTANA_REFERENCIA_DIAS = 365
const MINUTO_MS = 60_000

export type EscenarioPlausibilidad = {
  estacion: string
  restaurar: Restaurar
}

// El catálogo de estaciones vive en memoria del proceso de la app (datasets/memoria.ts), no en este
// proceso de prueba; el nombre sale del recorte que siembra hidro.ts (mismo nombre PNA del catálogo).
function nombreEstacion(): string {
  const estacion = ESPERADOS_HIDRO.estaciones.find((e) => e.estacionId === ESTACION_ID)
  if (!estacion) throw new Error(`escenarios-plausibilidad: falta la estación ${ESTACION_ID} en el seed hidrométrico`)
  return estacion.nombre
}

/**
 * Inserta lecturas directamente en hidro_lectura. El camino de la app (publicarCorridaPrefectura) exige
 * una corrida completa con catálogo; para un escenario alcanza con las columnas que lee el indicador.
 * Los ids insertados se borran al restaurar.
 */
async function insertarLecturas(valores: number[]): Promise<string[]> {
  const db = getDb()
  const [base] = await db.select({ catalogoVersion: hidroLectura.catalogoVersion }).from(hidroLectura).limit(1)
  if (!base) throw new Error('escenarios-plausibilidad: no hay lecturas sembradas para tomar el catálogo')

  const ahora = Date.now()
  // Más reciente primero: valores[0] es la última lectura. Espaciadas 10 minutos, dentro de las últimas 2 h,
  // así quedan por delante de las lecturas del seed (horas redondeadas, al menos 2 h atrás).
  const filas = valores.map((lecturaM, indice) => {
    const medidaEn = new Date(ahora - indice * 10 * MINUTO_MS - 7).toISOString()
    return {
      id: randomUUID(),
      estacionId: ESTACION_ID,
      fuente: 'prefectura',
      lecturaM,
      variacionM: null,
      periodoHoras: 6,
      medidaEn,
      estadoPublicado: 'ESTAC.',
      lecturaAnteriorM: null,
      medidaAnteriorEn: null,
      alertaM: 6.5,
      evacuacionM: 7.0,
      inconsistente: false,
      motivosInconsistencia: [],
      hashOriginal: randomUUID().replace(/-/g, ''),
      catalogoVersion: base.catalogoVersion,
      capturadaEn: new Date(ahora).toISOString(),
    }
  })
  await db.insert(hidroLectura).values(filas)
  return filas.map((fila) => fila.id)
}

async function borrarLecturas(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await getDb().delete(hidroLectura).where(inArray(hidroLectura.id, ids))
}

/**
 * Doce lecturas idénticas seguidas como las más recientes de la estación: el indicador marca sensor trabado.
 * Las lecturas insertadas quedan por delante de las del seed, así que son las 12 más recientes.
 */
export async function prepararSensorTrabado(): Promise<EscenarioPlausibilidad> {
  const ids = await insertarLecturas(Array.from({ length: LECTURAS_IDENTICAS }, () => 6.5))
  return {
    estacion: nombreEstacion(),
    restaurar: () => borrarLecturas(ids),
  }
}

/**
 * Última lectura fuera del rango de 365 días de la estación: el indicador marca valor atípico.
 * Usa la última lectura del seed (6.8 m) y un rango máximo de 6.5 m; el rango anterior (si había) se
 * restaura con guardarReferencia, y si no había fila se borra.
 */
export async function prepararValorAtipico(): Promise<EscenarioPlausibilidad> {
  const db = getDb()
  const [previa] = await db
    .select()
    .from(hidroReferencia)
    .where(and(eq(hidroReferencia.estacionId, ESTACION_ID), eq(hidroReferencia.ventanaDias, VENTANA_REFERENCIA_DIAS)))
    .limit(1)

  const ahora = new Date().toISOString()
  const fila: FilaReferencia = {
    estacionId: ESTACION_ID,
    ventanaDias: VENTANA_REFERENCIA_DIAS,
    n: 100,
    medianaM: 4.0,
    p10M: 3.0,
    p90M: 5.5,
    minM: 1.0,
    maxM: 6.5,
    desde: ahora,
    hasta: ahora,
    fuente: 'e2e-plausibilidad',
    calculadoEn: ahora,
  }
  await guardarReferencia(db, fila)

  return {
    estacion: nombreEstacion(),
    restaurar: async () => {
      if (previa) {
        await guardarReferencia(db, { ...previa, minM: previa.minM, maxM: previa.maxM })
      } else {
        await db
          .delete(hidroReferencia)
          .where(and(eq(hidroReferencia.estacionId, ESTACION_ID), eq(hidroReferencia.ventanaDias, VENTANA_REFERENCIA_DIAS)))
      }
    },
  }
}

/**
 * Control sano: lecturas variadas dentro de rango, sin rango de 365 días (min_m/max_m NULL).
 * Solo deja el seed como está y asegura que no quede un rango de un escenario anterior.
 */
export async function prepararLecturasSanas(): Promise<EscenarioPlausibilidad> {
  const db = getDb()
  const [previa] = await db
    .select()
    .from(hidroReferencia)
    .where(and(eq(hidroReferencia.estacionId, ESTACION_ID), eq(hidroReferencia.ventanaDias, VENTANA_REFERENCIA_DIAS)))
    .limit(1)
  if (previa) {
    await db
      .update(hidroReferencia)
      .set({ minM: null, maxM: null })
      .where(and(eq(hidroReferencia.estacionId, ESTACION_ID), eq(hidroReferencia.ventanaDias, VENTANA_REFERENCIA_DIAS)))
  }
  return {
    estacion: nombreEstacion(),
    restaurar: async () => {
      if (!previa) return
      await db
        .update(hidroReferencia)
        .set({ minM: previa.minM, maxM: previa.maxM })
        .where(and(eq(hidroReferencia.estacionId, ESTACION_ID), eq(hidroReferencia.ventanaDias, VENTANA_REFERENCIA_DIAS)))
    },
  }
}
