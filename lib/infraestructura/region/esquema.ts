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
    fuentesRio: z.array(z.string().min(1)),
    fuentesAlertas: z.array(z.string().min(1)),
    estacionAncla: z.string().min(1),
    archivos: z
      .object({
        mascara: z.string().min(1),
        departamentos: z.string().min(1),
      })
      .strict(),
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
>

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
  }
}
