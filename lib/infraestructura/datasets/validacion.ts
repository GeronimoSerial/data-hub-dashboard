import { z } from 'zod'
import { DATASETS_REFERENCIA, esDatasetReferencia } from './catalogo'
import type { EntradaVersion } from './codec'

const texto = z.string().min(1)
const lat = z.number().finite().min(-90).max(90)
const lon = z.number().finite().min(-180).max(180)
const punto = z.object({ lat, lon })
const geometria = z.object({ type: texto, coordinates: z.array(z.unknown()).min(1) })
const feature = z.object({ type: z.literal('Feature'), properties: z.record(z.string(), z.unknown()), geometry: geometria.nullable() })
const escuela = z.object({ cueAnexo: texto, nombre: texto, departamento: z.string(), localidad: z.string(), lat: lat.nullable(), lon: lon.nullable() })
const estacion = z.object({ estacionId: texto, nombrePna: texto, idHistorico: z.number().int(),
  rio: z.enum(['parana', 'uruguay']), rol: z.enum(['corrientes', 'contexto-aguas-arriba']),
  coordenadas: punto.extend({ precisionDecimales: z.number().int().nonnegative(), verificada: z.literal(false) }).nullable(),
  represaAguasArriba: z.boolean().optional() })

export function validarReferencia(entrada: EntradaVersion) {
  if (!esDatasetReferencia(entrada.datasetId)) return
  const contrato = DATASETS_REFERENCIA[entrada.datasetId]
  if (entrada.formato !== contrato.formato) throw new Error('El formato no corresponde al dataset')
  const documento = entrada.datos as Record<string, unknown>
  const filas = entrada.formato === 'array' ? entrada.datos : documento[entrada.formato]
  const base = z.array(z.record(z.string(), z.unknown())).parse(filas)
  if (contrato.clave) {
    const claves = base.map((fila) => contrato.clave.split('.').reduce<unknown>((valor, campo) =>
      (valor as Record<string, unknown> | null)?.[campo], fila))
    if (claves.some((clave) => clave == null || clave === '') || new Set(claves.map(String)).size !== claves.length) {
      throw new Error(`Claves naturales ausentes o duplicadas en ${entrada.datasetId}`)
    }
  }
  if (!base.length && !['eventos-inundaciones', 'registro-eventos', 'evidencias-inundaciones', 'localidades-riberenas-dudosas'].includes(entrada.datasetId)) {
    throw new Error('Una referencia geográfica no puede quedar vacía')
  }
  if (entrada.formato === 'features') {
    if (documento.type !== 'FeatureCollection') throw new Error('Se requiere FeatureCollection')
    z.array(feature).parse(base)
  }
  switch (entrada.datasetId) {
    case 'departamentos':
      z.array(feature.extend({ geometry: geometria.extend({ type: z.enum(['Polygon', 'MultiPolygon']) }),
        properties: z.object({ nombre: texto, centroide: punto }) })).parse(base)
      break
    case 'localizaciones': z.array(escuela).parse(base); break
    case 'estaciones-prefectura': z.array(estacion).parse(base); break
    case 'estaciones-synop': z.array(punto.extend({ wmo: texto, nombre: texto })).parse(base); break
    case 'puntos-rio': z.array(punto.extend({ id: texto, rio: texto, localidad: texto })).parse(base); break
    case 'cabeceras-departamentales': z.array(punto.extend({ departamento: texto })).parse(base); break
    case 'localidades-urbanas': z.array(punto.extend({ nombre: texto, poblacion: z.number().nonnegative() })).parse(base); break
    case 'tramos-prefectura': z.array(z.object({ tramoId: texto, estacionId: texto, localidades: z.array(texto).min(1), estado: z.enum(['propuesta', 'aprobada']) })).parse(base); break
    case 'georef-departamentos': z.array(z.object({ id: texto, nombre: texto })).parse(base); break
  }
}
