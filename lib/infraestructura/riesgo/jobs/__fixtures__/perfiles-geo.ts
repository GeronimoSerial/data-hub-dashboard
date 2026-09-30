import { inArray } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraGeoProfile } from '@/lib/db/schema'

type PerfilGeoTest = { cueAnexo: string; geometryRef: string }

export async function insertarPerfilesGeo(celdas: PerfilGeoTest[]) {
  await getDb()
    .insert(infraGeoProfile)
    .values(
      celdas.map(({ cueAnexo, geometryRef }) => ({
        cueAnexo,
        geometryRef,
        motivoExclusion: null,
        perfilVersion: 'geo-perfil-v1',
        calculadoEn: '2026-09-26T00:00:00.000Z',
      })),
    )
}

export async function borrarPerfilesGeo(cueAnexos: string[]) {
  await getDb()
    .delete(infraGeoProfile)
    .where(inArray(infraGeoProfile.cueAnexo, cueAnexos))
}
