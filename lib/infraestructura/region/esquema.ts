import { z } from 'zod'

// Coordinates are [lon, lat] unless a field says otherwise.
const par = z.tuple([z.number(), z.number()])
const rango = z.tuple([z.number(), z.number()])
const caja = z
  .object({
    latMin: z.number(),
    latMax: z.number(),
    lonMin: z.number(),
    lonMax: z.number(),
  })
  .strict()

// Institutional signature of the region. Text lines are shown as supplied;
// `logo` names a bundled image, or null for text-only.
export const MarcaConfigSchema = z
  .object({
    logo: z.enum(['educacion-corrientes']).nullable(),
    reparticionesLineas: z.array(z.string().min(1)),
    jurisdiccionLineas: z.array(z.string().min(1)),
    pieLineas: z.array(z.string().min(1)),
  })
  .strict()

export type MarcaRegion = z.infer<typeof MarcaConfigSchema>

// Used when a region config omits `marca`: no logo and no brand text.
export const MARCA_SIN_CONFIGURAR: MarcaRegion = {
  logo: null,
  reparticionesLineas: [],
  jurisdiccionLineas: [],
  pieLineas: [],
}

export const FUENTES_DEM = ['copernicus', 'fabdem'] as const

export const RegionConfigSchema = z
  .object({
    id: z.string().min(1),
    nombre: z.string().min(1),
    pais: z.string().min(2),
    zonaHoraria: z.string().min(1),
    locale: z.string().min(1),
    idiomas: z.array(z.enum(['es', 'pt'])).min(1),
    // Kilometres: how far a point may sit outside the province and still count as inside.
    toleranciaBorde: z.number().positive(),
    bboxPlausible: caja,
    // [[west lon, south lat], [east lon, north lat]]
    limitesMapa: z.tuple([par, par]),
    bboxRuta: caja,
    regionesInteresLluvia: z
      .array(z.object({ lon: rango, lat: rango }).strict())
      .min(1),
    vistaInicial: z.object({ centro: par, zoom: z.number() }).strict(),
    mapaCentro: par,
    mapaZoom: z.number(),
    datasets: z
      .object({
        unidadesAdministrativas: z.string().min(1),
        estacionesRio: z.string().min(1),
        localizaciones: z.string().min(1),
      })
      .strict(),
    // Dataset keys declared in `datasets` whose data is not published yet
    // (e.g. waiting for B12). The contract accepts them only when listed here.
    datasetsPendientes: z.array(z.string().min(1)).optional(),
    // Reference datasets published by `pnpm region:cargar <id>` (clave = infra_dataset key, archivo = repo-relative file).
    cargaDatasets: z
      .array(z.object({ clave: z.string().min(1), archivo: z.string().min(1) }).strict())
      .optional(),
    fuentesRio: z.array(z.string().min(1)),
    fuentesAlertas: z.array(z.string().min(1)),
    // Optional: fuentes de lluvia medida (synop = estaciones SYNOP) y capas estáticas
    // (exposición DEM del río). Un job que las necesita sólo aplica si la región las declara.
    fuentesLluvia: z.array(z.string().min(1)).optional(),
    capasEstaticas: z.array(z.string().min(1)).optional(),
    // Optional: DEM terrain for river exposure. Omitted means copernicus.
    fuenteDem: z.enum(FUENTES_DEM).optional(),
    // Optional: the upstream gauge used for the wave offset. Regions without a
    // river gauge in the motor (e.g. Manaos before B12) omit it.
    estacionAncla: z.string().min(1).optional(),
    // Optional: CUEs and station ids the data-chain probe verifies. Regions without them omit it.
    sondaTestigos: z
      .object({
        escuelas: z.array(z.string().min(1)),
        estaciones: z.array(z.string().min(1)),
      })
      .strict()
      .optional(),
    archivos: z
      .object({
        mascara: z.string().min(1),
        departamentos: z.string().min(1),
      })
      .strict(),
    // Optional: header and footer brand. Omitted means no brand text and no logo.
    marca: MarcaConfigSchema.optional(),
  })
  .strict()

export type RegionConfig = z.infer<typeof RegionConfigSchema>

// Client-safe subset: safe to serialize into the browser bundle.
export type RegionPublica = Pick<
  RegionConfig,
  | 'id'
  | 'nombre'
  | 'pais'
  | 'zonaHoraria'
  | 'locale'
  | 'idiomas'
  | 'limitesMapa'
  | 'vistaInicial'
  | 'mapaCentro'
  | 'mapaZoom'
  | 'regionesInteresLluvia'
  | 'archivos'
  | 'fuentesRio'
>

// Kept apart from regionPublica so its key set stays unchanged; read via marcaActual.
export function marcaPublica(config: RegionConfig): MarcaRegion {
  return config.marca ?? MARCA_SIN_CONFIGURAR
}

export function regionPublica(config: RegionConfig): RegionPublica {
  return {
    id: config.id,
    nombre: config.nombre,
    pais: config.pais,
    zonaHoraria: config.zonaHoraria,
    locale: config.locale,
    idiomas: config.idiomas,
    limitesMapa: config.limitesMapa,
    vistaInicial: config.vistaInicial,
    mapaCentro: config.mapaCentro,
    mapaZoom: config.mapaZoom,
    regionesInteresLluvia: config.regionesInteresLluvia,
    archivos: config.archivos,
    fuentesRio: config.fuentesRio,
  }
}
