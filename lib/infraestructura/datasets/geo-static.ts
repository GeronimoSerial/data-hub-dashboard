import { getDb } from '@/lib/db'
import { infraAislamientoOsm, infraSusceptibilidadEstatica, infraAccesoOsmGeometria, infraExposicionRutaInundacion, infraExposicionRioDem, infraRutaEvacuacionOsm } from '@/lib/db/schema'
import { guardarVersion, publicarVersion, leerVersion, versionesPublicadas } from './repositorio'
import { validarFilasGeo, proyectarFilasGeo } from './geo-static-contratos.mjs'
import type { Datos, EntradaVersion } from './codec'

const tablas = {
  aislamiento: infraAislamientoOsm, susceptibilidad: infraSusceptibilidadEstatica,
  geometria: infraAccesoOsmGeometria, 'exposicion-ruta': infraExposicionRutaInundacion,
  'inundacion-v2': infraSusceptibilidadEstatica, 'exposicion-ruta-v2': infraExposicionRutaInundacion,
  'exposicion-rio-dem': infraExposicionRioDem,
  'ruta-evacuacion': infraRutaEvacuacionOsm,
}
export type TipoGeo = keyof typeof tablas
export function esTipoGeo(tipo: string): tipo is TipoGeo { return Object.hasOwn(tablas, tipo) }
export async function ingestarGeo(tipo: TipoGeo, filas: Datos[], opciones: {
  revision: string; fuente: string; licencia?: string; fechaFuente?: string
  metadatos?: Datos; entradas?: string[]; publicar?: boolean
}, db = getDb()) {
  const validas = validarFilasGeo(tipo, filas)
  const entradas = opciones.entradas ?? (await versionesPublicadas(['localizaciones', 'departamentos'], db)).map((p) => p.versionId)
  const entrada: EntradaVersion = { datasetId: `geo-${tipo}`, nombre: tipo, formato: 'array', clave: 'cue_anexo',
    datos: filas, revision: opciones.revision, fuente: opciones.fuente, licencia: opciones.licencia,
    fechaFuente: opciones.fechaFuente, metadatos: opciones.metadatos, entradas }
  return guardarVersion(entrada, db, opciones.publicar !== false,
    async (tx) => { await proyectarFilasGeo(tipo, validas, { db: tx, tablas }) })
}

export async function publicarGeo(tipo: TipoGeo, versionId: string, db = getDb()) {
  const datasetId = `geo-${tipo}`
  const seleccion = await leerVersion(datasetId, versionId, db)
  if (!seleccion) throw new Error('Versión geográfica inexistente')
  const filas = validarFilasGeo(tipo, seleccion.documento)
  await publicarVersion(datasetId, versionId, db, async (tx) => { await proyectarFilasGeo(tipo, filas, { db: tx, tablas }) })
}
