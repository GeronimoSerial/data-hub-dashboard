import { getDb } from '@/lib/db'
import { infraGeoProfile } from '@/lib/db/schema'
import { asegurarGeAdjuntada } from '../impacto'
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
// ("CONCEPCIÓN" vs "CONCEPCION"), lo que parte los agrupamientos por
// departamento en dos. Normalizamos a mayúsculas sin tildes. No usamos
// NFD + strip de diacríticos porque NFD no descompone la Ñ.
const EQUIVALENCIAS_ACENTOS: Record<string, string> = {
  Á: 'A',
  É: 'E',
  Í: 'I',
  Ó: 'O',
  Ú: 'U',
  Ñ: 'N',
}

function normalizarDepartamento(departamento: string | null): string | null {
  if (departamento == null) return null
  return departamento
    .toUpperCase()
    .replace(/[ÁÉÍÓÚÑ]/g, (caracter) => EQUIVALENCIAS_ACENTOS[caracter] ?? caracter)
    .trim()
}

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
  const ahora = params?.ahora ?? new Date()
  const calculadoEn = ahora.toISOString()

  // attachGe falla si 'ge' ya está adjuntada en esta conexión (getDb memoiza
  // un único Client); asegurarGeAdjuntada es el wrapper idempotente que ya usa
  // el resto de lib/infraestructura (ver impacto.ts).
  await asegurarGeAdjuntada(db.$client)

  const res = await db.$client.execute(
    'SELECT cue_anexo, departamento, lat, lon, geo_calidad FROM ge.ge_localizacion',
  )
  const filas = res.rows as unknown as FilaGeLocalizacion[]

  let conPerfilValido = 0
  let excluidos = 0

  await db.transaction(async (tx) => {
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

      if (motivoExclusion === null) conPerfilValido += 1
      else excluidos += 1
    }
  })

  return {
    procesados: filas.length,
    conPerfilValido,
    excluidos,
    perfilVersion: PERFIL_VERSION,
  }
}
