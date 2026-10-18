// Catálogo versionado de estaciones Prefectura (PNA) del tramo de Corrientes
// en INA A5. Valores copiados de la respuesta en vivo de
// /a5/obs/puntual/estaciones y /a5/obs/puntual/series (red alturas_prefe) y
// del boletín SSPVN de profundidades; ver docs/motor-v0.4/hidrologia-ina.md.
// El emparejamiento con estaciones-prefectura es por identificador histórico
// PNA (id_externo en A5), nunca por cercanía. Un cambio en A5 se detecta con
// compararCatalogoConA5 y se publica como versión nueva; no se sobrescribe.
import { z } from 'zod'
import type { EstacionA5 } from './parser-a5'

export const CATALOGO_A5_VERSION = 'ina-a5-2026-10-17.1'

const CAPTURA = '2026-10-17'
const URL_ESTACIONES = 'https://alerta.ina.gob.ar/a5/obs/puntual/estaciones?tabla=alturas_prefe&format=json'
const URL_SERIES = 'https://alerta.ina.gob.ar/a5/obs/puntual/series?red_id=10&var_id=2&format=json'
const URL_BOLETIN_SSPVN = 'https://www.argentina.gob.ar/sites/default/files/2018/05/2024-06-27_sup.pdf'

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const EntradaCatalogoA5Schema = z
  .object({
    estacionId: z.string().regex(/^pna-[a-z-]+$/),
    nombre: z.string().min(1),
    a5EstacionId: z.number().int().positive(),
    a5IdExterno: z.string().regex(/^\d+$/),
    /** Serie A5 de altura hidrométrica (var 2, medición directa): una lectura diaria. */
    a5SerieAlturaDiariaId: z.number().int().positive(),
    rio: z.enum(['parana', 'uruguay']),
    rioA5: z.string().min(1),
    ceroIgnM: z.number().nullable(),
    motivoSinCero: z.string().min(1).nullable(),
    alertaM: z.number().nullable(),
    evacuacionM: z.number().nullable(),
    aguasBajasM: z.number().nullable(),
    kmRio: z.number().positive().nullable(),
    fuenteKmRio: z.string().url().nullable(),
    motivoSinKm: z.string().min(1).nullable(),
    datumCero: z.literal('IGN_historico_supuesto'),
    historiaDesde: fecha,
    fuentes: z.array(z.object({ url: z.string().url(), capturadaEl: fecha })).min(1),
  })
  .refine((e) => (e.ceroIgnM === null) === (e.motivoSinCero !== null), {
    message: 'cero IGN nulo exige motivo y un cero presente lo prohíbe',
    path: ['motivoSinCero'],
  })
  .refine((e) => (e.kmRio === null) === (e.motivoSinKm !== null) && (e.kmRio === null) === (e.fuenteKmRio === null), {
    message: 'km nulo exige motivo; km presente exige fuente y prohíbe motivo',
    path: ['motivoSinKm'],
  })

export type EntradaCatalogoA5 = z.infer<typeof EntradaCatalogoA5Schema>

type Base = Pick<
  EntradaCatalogoA5,
  'estacionId' | 'nombre' | 'a5EstacionId' | 'a5IdExterno' | 'a5SerieAlturaDiariaId' | 'rio' | 'rioA5' |
  'ceroIgnM' | 'alertaM' | 'evacuacionM' | 'aguasBajasM' | 'kmRio' | 'historiaDesde'
>

function e(b: Base): EntradaCatalogoA5 {
  const motivoSinKm =
    b.kmRio !== null ? null
    : b.rio === 'uruguay' ? 'sin_fuente_km_rio_uruguay'
    : 'fuera_del_boletin_sspvn_esquina_confluencia'
  return {
    ...b,
    motivoSinCero: b.ceroIgnM === null ? 'cero_ign_no_publicado_en_a5' : null,
    fuenteKmRio: b.kmRio === null ? null : URL_BOLETIN_SSPVN,
    motivoSinKm,
    datumCero: 'IGN_historico_supuesto',
    fuentes: [
      { url: URL_ESTACIONES, capturadaEl: CAPTURA },
      { url: URL_SERIES, capturadaEl: CAPTURA },
      ...(b.kmRio === null ? [] : [{ url: URL_BOLETIN_SSPVN, capturadaEl: CAPTURA }]),
    ],
  }
}

export function validarCatalogoA5(catalogo: readonly unknown[]): EntradaCatalogoA5[] {
  const entradas = z.array(EntradaCatalogoA5Schema).parse(catalogo)
  for (const clave of ['estacionId', 'a5EstacionId', 'a5SerieAlturaDiariaId'] as const) {
    const vistos = new Set(entradas.map((x) => x[clave]))
    if (vistos.size !== entradas.length) throw new Error(`catálogo A5 con ${clave} repetido`)
  }
  return entradas
}

export const CATALOGO_A5: readonly EntradaCatalogoA5[] = validarCatalogoA5([
  e({ estacionId: 'pna-ituzaingo', nombre: 'Ituzaingó', a5EstacionId: 15, a5IdExterno: '90', a5SerieAlturaDiariaId: 15, rio: 'parana', rioA5: 'PARANAMED',
    ceroIgnM: null, alertaM: 3.5, evacuacionM: 4, aguasBajasM: 0.81, kmRio: null, historiaDesde: '1910-03-16' }),
  e({ estacionId: 'pna-ita-ibate', nombre: 'Itá Ibaté', a5EstacionId: 16, a5IdExterno: '100', a5SerieAlturaDiariaId: 16, rio: 'parana', rioA5: 'PARANAMED',
    ceroIgnM: 52.42, alertaM: 7, evacuacionM: 7.5, aguasBajasM: 1.34, kmRio: null, historiaDesde: '1912-01-02' }),
  e({ estacionId: 'pna-itati', nombre: 'Itatí', a5EstacionId: 17, a5IdExterno: '110', a5SerieAlturaDiariaId: 17, rio: 'parana', rioA5: 'PARANAMED',
    ceroIgnM: 45.66, alertaM: 6.8, evacuacionM: 7.5, aguasBajasM: 2.7, kmRio: null, historiaDesde: '1912-01-02' }),
  e({ estacionId: 'pna-paso-de-la-patria', nombre: 'Paso de la Patria', a5EstacionId: 18, a5IdExterno: '120', a5SerieAlturaDiariaId: 18, rio: 'parana', rioA5: 'PARANAMED',
    ceroIgnM: null, alertaM: 6.5, evacuacionM: 7, aguasBajasM: 2.2, kmRio: 1240, historiaDesde: '1956-01-01' }),
  e({ estacionId: 'pna-corrientes', nombre: 'Corrientes', a5EstacionId: 19, a5IdExterno: '130', a5SerieAlturaDiariaId: 19, rio: 'parana', rioA5: 'PARANAMED',
    ceroIgnM: 42.39, alertaM: 6.5, evacuacionM: 7, aguasBajasM: 1.83, kmRio: 1208, historiaDesde: '1901-01-02' }),
  e({ estacionId: 'pna-empedrado', nombre: 'Empedrado', a5EstacionId: 21, a5IdExterno: '150', a5SerieAlturaDiariaId: 21, rio: 'parana', rioA5: 'PARANAINF',
    ceroIgnM: 39.68, alertaM: 6.5, evacuacionM: 6.7, aguasBajasM: 2.8, kmRio: 1140, historiaDesde: '1912-01-02' }),
  e({ estacionId: 'pna-bella-vista', nombre: 'Bella Vista', a5EstacionId: 22, a5IdExterno: '160', a5SerieAlturaDiariaId: 22, rio: 'parana', rioA5: 'PARANAINF',
    ceroIgnM: 34.74, alertaM: 6, evacuacionM: 6.4, aguasBajasM: 3, kmRio: 1057, historiaDesde: '1906-01-02' }),
  e({ estacionId: 'pna-goya', nombre: 'Goya', a5EstacionId: 23, a5IdExterno: '170', a5SerieAlturaDiariaId: 23, rio: 'parana', rioA5: 'PARANAINF',
    ceroIgnM: 29.67, alertaM: 5.2, evacuacionM: 5.7, aguasBajasM: 2.23, kmRio: 972, historiaDesde: '1903-06-17' }),
  e({ estacionId: 'pna-esquina', nombre: 'Esquina', a5EstacionId: 25, a5IdExterno: '190', a5SerieAlturaDiariaId: 25, rio: 'parana', rioA5: 'PARANAINF',
    ceroIgnM: 22.03, alertaM: 5, evacuacionM: 5.4, aguasBajasM: 2.2, kmRio: 853, historiaDesde: '1903-09-04' }),
  e({ estacionId: 'pna-garruchos', nombre: 'Garruchos', a5EstacionId: 67, a5IdExterno: '560', a5SerieAlturaDiariaId: 67, rio: 'uruguay', rioA5: 'URUGUAY',
    ceroIgnM: null, alertaM: 12, evacuacionM: 14, aguasBajasM: 0.03, kmRio: null, historiaDesde: '1931-01-01' }),
  e({ estacionId: 'pna-santo-tome', nombre: 'Santo Tomé', a5EstacionId: 68, a5IdExterno: '570', a5SerieAlturaDiariaId: 68, rio: 'uruguay', rioA5: 'URUGUAY',
    ceroIgnM: null, alertaM: 11.5, evacuacionM: 12.5, aguasBajasM: 1.32, kmRio: null, historiaDesde: '1907-12-02' }),
  e({ estacionId: 'pna-alvear', nombre: 'Alvear', a5EstacionId: 69, a5IdExterno: '580', a5SerieAlturaDiariaId: 69, rio: 'uruguay', rioA5: 'URUGUAY',
    ceroIgnM: null, alertaM: 9.5, evacuacionM: 11, aguasBajasM: 0.89, kmRio: null, historiaDesde: '2006-01-01' }),
  e({ estacionId: 'pna-la-cruz', nombre: 'La Cruz', a5EstacionId: 70, a5IdExterno: '590', a5SerieAlturaDiariaId: 70, rio: 'uruguay', rioA5: 'URUGUAY',
    ceroIgnM: null, alertaM: 9.5, evacuacionM: 11.5, aguasBajasM: 0.26, kmRio: null, historiaDesde: '2006-01-01' }),
  e({ estacionId: 'pna-yapeyu', nombre: 'Yapeyú', a5EstacionId: 71, a5IdExterno: '600', a5SerieAlturaDiariaId: 71, rio: 'uruguay', rioA5: 'URUGUAY',
    ceroIgnM: null, alertaM: 9.5, evacuacionM: 10.5, aguasBajasM: 0, kmRio: null, historiaDesde: '2006-01-01' }),
  e({ estacionId: 'pna-paso-de-los-libres', nombre: 'Paso de los Libres', a5EstacionId: 72, a5IdExterno: '610', a5SerieAlturaDiariaId: 72, rio: 'uruguay', rioA5: 'URUGUAY',
    ceroIgnM: null, alertaM: 7.5, evacuacionM: 8.5, aguasBajasM: 0.9, kmRio: null, historiaDesde: '1908-03-08' }),
  e({ estacionId: 'pna-bompland', nombre: 'Bompland', a5EstacionId: 73, a5IdExterno: '620', a5SerieAlturaDiariaId: 73, rio: 'uruguay', rioA5: 'URUGUAY',
    ceroIgnM: null, alertaM: 7.9, evacuacionM: 10.8, aguasBajasM: 0, kmRio: null, historiaDesde: '2006-01-01' }),
  e({ estacionId: 'pna-monte-caseros', nombre: 'Monte Caseros', a5EstacionId: 74, a5IdExterno: '630', a5SerieAlturaDiariaId: 74, rio: 'uruguay', rioA5: 'URUGUAY',
    ceroIgnM: null, alertaM: 7.5, evacuacionM: 8.5, aguasBajasM: 0.8, kmRio: null, historiaDesde: '1905-03-14' }),
  e({ estacionId: 'pna-mocoreta', nombre: 'Mocoretá', a5EstacionId: 75, a5IdExterno: '640', a5SerieAlturaDiariaId: 75, rio: 'uruguay', rioA5: 'URUGUAY',
    ceroIgnM: null, alertaM: 10.3, evacuacionM: 12, aguasBajasM: 5.24, kmRio: null, historiaDesde: '2006-01-01' }),
])

export type DiferenciaCatalogoA5 = {
  estacionId: string
  campo: 'estacion' | 'ceroIgnM' | 'alertaM' | 'evacuacionM' | 'aguasBajasM' | 'rioA5' | 'a5IdExterno'
  catalogo: number | string | null
  a5: number | string | null
}

/**
 * Compara una respuesta A5 fresca con el catálogo. Sólo informa: el catálogo
 * no se modifica y una diferencia exige revisar y publicar una versión nueva.
 */
export function compararCatalogoConA5(
  catalogo: readonly EntradaCatalogoA5[],
  estaciones: readonly EstacionA5[],
): DiferenciaCatalogoA5[] {
  const porId = new Map(estaciones.map((x) => [x.id, x]))
  const diferencias: DiferenciaCatalogoA5[] = []
  for (const entrada of catalogo) {
    const a5 = porId.get(entrada.a5EstacionId)
    if (!a5) {
      diferencias.push({ estacionId: entrada.estacionId, campo: 'estacion', catalogo: entrada.a5EstacionId, a5: null })
      continue
    }
    const pares: [DiferenciaCatalogoA5['campo'], number | string | null, number | string | null][] = [
      ['a5IdExterno', entrada.a5IdExterno, a5.idExterno],
      ['rioA5', entrada.rioA5, a5.rio],
      ['ceroIgnM', entrada.ceroIgnM, a5.ceroIgnM],
      ['alertaM', entrada.alertaM, a5.alertaM],
      ['evacuacionM', entrada.evacuacionM, a5.evacuacionM],
      ['aguasBajasM', entrada.aguasBajasM, a5.aguasBajasM],
    ]
    for (const [campo, valorCatalogo, valorA5] of pares) {
      if (valorCatalogo !== valorA5) diferencias.push({ estacionId: entrada.estacionId, campo, catalogo: valorCatalogo, a5: valorA5 })
    }
  }
  return diferencias
}
