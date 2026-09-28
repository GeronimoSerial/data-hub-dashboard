import { getDb, getRawClient } from '@/lib/db'
import { conReintentoPorBloqueo } from '@/lib/db/reintento'
import { infraGeoProfile } from '@/lib/db/schema'
import { normalizarNombreDepartamentoONull } from '@/lib/mapas/normalizar-departamento'
import { asegurarGeAdjuntada } from '../impacto'
import { crearEjecutorSql } from '../ge-db'
import { celdaDeCoordenada } from './celda'

// Perfil geográfico por establecimiento: resuelve, para el 100% del padrón de
// ge_localizacion, la coordenada y la celda de grilla que usa la ingesta de
// amenazas. Corre como job (no en request path) y es idempotente: upsert por
// cueAnexo, nunca dos filas para el mismo establecimiento.
export type ResultadoCalculoGeoPerfiles = {
  procesados: number
  conPerfilValido: number
  excluidos: number
  perfilVersion: string
}

// Versión de la regla de cálculo. Cambiarla permite reprocesar sin confundir
// una corrida vieja con una nueva (ver comentario de infraGeoProfile).
const PERFIL_VERSION = 'geo-perfil-v1'

// Rango geográfico razonable para Corrientes. Fuera de esto la coordenada no
// es confiable (0,0, signo invertido, grados/minutos mal parseados) y el
// perfil se excluye en vez de mandar consultas al vacío.
const LAT_MIN = -32
const LAT_MAX = -26
const LON_MIN = -61
const LON_MAX = -54

// El dato fuente trae el mismo departamento con y sin tilde
// ("CONCEPCIÓN" vs "CONCEPCION") y a veces con espacios dobles, lo que parte
// los agrupamientos por departamento. Normalización compartida con
// lib/mapas/departamentos.ts y lib/mapas/georef-departamentos.ts, ver
// lib/mapas/normalizar-departamento.ts (mayúsculas, sin diacríticos, espacios
// colapsados; cadena vacía tras normalizar se trata como sin dato, igual que
// lat/lon inválidas más abajo).
const normalizarDepartamento = normalizarNombreDepartamentoONull

interface FilaGeLocalizacion {
  cue_anexo: string
  departamento: string | null
  lat: number | null
  lon: number | null
  geo_calidad: string | null
}

export async function calcularGeoPerfiles(
  params?: { ahora?: Date },
): Promise<ResultadoCalculoGeoPerfiles> {
  const db = getDb()
  const client = crearEjecutorSql(getRawClient())
  const ahora = params?.ahora ?? new Date()
  const calculadoEn = ahora.toISOString()

  // attachGe falla si 'ge' ya está adjuntada en esta conexión (getDb memoiza
  // un único Client); asegurarGeAdjuntada es el wrapper idempotente que ya usa
  // el resto de lib/infraestructura (ver impacto.ts).
  await asegurarGeAdjuntada(client)

  const res = await client.execute(
    'SELECT cue_anexo, departamento, lat, lon, geo_calidad FROM ge.ge_localizacion',
  )
  const filas = res.rows as unknown as FilaGeLocalizacion[]

  // Job (no request path): sin BEGIN IMMEDIATE propio, así que db.transaction
  // (BEGIN DEFERRED) puede toparse con SQLITE_BUSY si compite con un escritor
  // concurrente sobre el mismo hub.sqlite. Reintento seguro: la transacción
  // se revierte entera si falla a mitad de camino y el upsert por cueAnexo es
  // plenamente re-ejecutable desde cero. Los contadores se llevan DENTRO del
  // intento para no duplicarse si un intento anterior alcanzó a correr parte
  // del loop antes de fallar.
  const { conPerfilValido, excluidos } = await conReintentoPorBloqueo(() =>
    db.transaction(async (tx) => {
      let conPerfilValidoIntento = 0
      let excluidosIntento = 0
      for (const fila of filas) {
      const lat = fila.lat == null ? null : Number(fila.lat)
      const lon = fila.lon == null ? null : Number(fila.lon)

      let motivoExclusion: string | null
      let geometryRef: string | null

      if (lat === null || lon === null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        motivoExclusion = 'sin_coordenadas'
        geometryRef = null
      } else if (lat < LAT_MIN || lat > LAT_MAX || lon < LON_MIN || lon > LON_MAX) {
        motivoExclusion = 'coordenada_invalida'
        geometryRef = null
      } else {
        motivoExclusion = null
        geometryRef = celdaDeCoordenada(lat, lon)
      }

      const latGuardada = lat !== null && Number.isFinite(lat) ? lat : null
      const lonGuardada = lon !== null && Number.isFinite(lon) ? lon : null
      const departamento = normalizarDepartamento(fila.departamento)

      await tx
        .insert(infraGeoProfile)
        .values({
          cueAnexo: fila.cue_anexo,
          lat: latGuardada,
          lon: lonGuardada,
          geoCalidad: fila.geo_calidad,
          departamento,
          geometryRef,
          motivoExclusion,
          perfilVersion: PERFIL_VERSION,
          calculadoEn,
        })
        .onConflictDoUpdate({
          target: infraGeoProfile.cueAnexo,
          set: {
            lat: latGuardada,
            lon: lonGuardada,
            geoCalidad: fila.geo_calidad,
            departamento,
            geometryRef,
            motivoExclusion,
            perfilVersion: PERFIL_VERSION,
            calculadoEn,
          },
        })

      if (motivoExclusion === null) conPerfilValidoIntento += 1
      else excluidosIntento += 1
      }
      return { conPerfilValido: conPerfilValidoIntento, excluidos: excluidosIntento }
    }),
  )

  return {
    procesados: filas.length,
    conPerfilValido,
    excluidos,
    perfilVersion: PERFIL_VERSION,
  }
}
