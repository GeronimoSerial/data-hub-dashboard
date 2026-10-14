// Adaptador de INGESTA de la observación satelital NASA GPM IMERG.
//
// Envuelve las funciones PURAS de ../providers/imerg (listado/parseo de
// gránulos y armado del subset OPeNDAP) y las expone bajo la forma de
// `PuertoObservacionSatelital`. El único agregado es el fetch real, que hoy
// vive inline en jobs/sync-imerg.ts; acá se inyecta `fetchImpl` + `token` al
// crear el adaptador, así que este archivo NO lee credenciales implícitamente
// (salvo el fallback documentado a `EARTHDATA_TOKEN` cuando no se pasa token).
//
// Traducción de forma (sin cambiar valores):
// - `GranuloImerg` -> `GranuloSatelital` (`titulo` -> `id`; el resto igual).
// - `HazardObservationPunto` -> `ObservacionPrecipitacionCelda`
//   (`valor` -> `valorMm`, `validoDesde`/`validoHasta` -> `ventanaDesde`/
//   `ventanaHasta`; `valor` se pasa sin tocar).
//
// Cableado del job (ABS1, segunda parte): jobs/sync-imerg.ts ya delega en
// `listarGranulos`/`obtenerObservacion` de este adaptador (antes tenía su
// propia copia fiel de `urlCmrVentana` inline). Pendiente menor que sigue sin
// resolverse: ../providers/imerg.ts todavía no exporta un builder de CMR
// propio, así que `urlCmrVentana` de acá abajo sigue siendo una copia (ya no
// duplicada con el job, sólo con la constante `CONFIG_FUENTES.imergCmr`).
import { celdaDeCoordenada } from '../celda'
import { CONFIG_FUENTES } from '../providers/config-fuentes'
import {
  IMERG_LAT_MAX,
  IMERG_LAT_MIN,
  IMERG_LON_MAX,
  IMERG_LON_MIN,
  calcularIndicesGrillaImerg,
  listarGranulosDelPayload,
  mapearAsciiImergACeldas,
} from '../providers/imerg'
import type { GranuloImerg, HazardObservationPunto } from '../providers/imerg'
import { obtenerParseadoImerg } from '../providers/imerg-descarga'
import type {
  GranuloSatelital,
  ObservacionPrecipitacionCelda,
  PuertoObservacionSatelital,
} from './puertos'

// Mismo producto que consulta sync-imerg.ts (`short_name=GPM_3IMERGHHE`).
const SHORT_NAME_IMERG = 'GPM_3IMERGHHE'

export type DependenciasAdaptadorImerg = {
  // Seam de fetch (mismo que usa sync-imerg.ts: se inyecta para test).
  fetchImpl?: typeof fetch
  // Token NASA Earthdata. Si no se pasa, se lee `EARTHDATA_TOKEN` del entorno
  // del proceso; nunca se loguea ni se persiste.
  token?: string
}

function urlCmrVentana(desde: string, hasta: string): string {
  // Copia fiel de jobs/sync-imerg.ts:101 (ver PENDIENTE de cabecera).
  const temporal = `${desde},${hasta}`
  return `https://${CONFIG_FUENTES.imergCmr.host}/search/granules.json?short_name=${SHORT_NAME_IMERG}&temporal=${encodeURIComponent(temporal)}&sort_key=-start_date&page_size=${CONFIG_FUENTES.imergCmr.pageSizeVentana}`
}

function granuloNormalizado(granulo: GranuloImerg): GranuloSatelital {
  return {
    id: granulo.titulo,
    inicioEn: granulo.inicioEn,
    finEn: granulo.finEn,
    urlDatos: granulo.urlDatos,
  }
}

function observacionNormalizada(punto: HazardObservationPunto): ObservacionPrecipitacionCelda {
  return {
    geometryRef: punto.geometryRef,
    variable: punto.variable,
    valorMm: punto.valor,
    observadoEn: punto.observadoEn,
    ventanaDesde: punto.validoDesde,
    ventanaHasta: punto.validoHasta,
    calidad: punto.calidad,
  }
}

export function crearAdaptadorImerg(
  dependencias: DependenciasAdaptadorImerg = {},
): PuertoObservacionSatelital {
  const fetchEfectivo = (): typeof fetch => dependencias.fetchImpl ?? fetch

  function autorizacion(): Record<string, string> {
    const token = dependencias.token ?? process.env[CONFIG_FUENTES.imergCmr.envToken]
    if (token === undefined || token.trim() === '') {
      throw new Error('adaptador IMERG sin token: falta EARTHDATA_TOKEN')
    }
    return { Authorization: `Bearer ${token}` }
  }

  return {
    async listarGranulos({ desde, hasta }) {
      const respuesta = await fetchEfectivo()(urlCmrVentana(desde, hasta), {
        headers: autorizacion(),
      })
      if (!respuesta.ok) throw new Error(`CMR HTTP ${respuesta.status}`)
      return listarGranulosDelPayload(await respuesta.json()).map(granuloNormalizado)
    },

    async obtenerObservacion({ granulo }) {
      const indices = calcularIndicesGrillaImerg(
        IMERG_LAT_MIN,
        IMERG_LAT_MAX,
        IMERG_LON_MIN,
        IMERG_LON_MAX,
      )
      // OPeNDAP ASCII; si no responde, fallback a la descarga HDF5 del gránulo.
      const { parseado } = await obtenerParseadoImerg({
        urlDatosGranulo: granulo.urlDatos,
        indices,
        fetchImpl: fetchEfectivo(),
        headers: autorizacion(),
      })
      const puntos = mapearAsciiImergACeldas({
        parseado,
        // El instante observado es el INICIO del gránulo; la ventana válida
        // completa el intervalo del producto. Mismos valores que el job.
        observadoEn: granulo.inicioEn,
        validoDesde: granulo.inicioEn,
        validoHasta: granulo.finEn,
        celdaDeCoordenada,
      })

      return {
        observaciones: puntos.map(observacionNormalizada),
        // PENDIENTE: el parser puro no modela (ni reporta) celdas del subset sin
        // valor válido; no se inventa el conjunto. Se completa cuando el mapeo
        // exponga las celdas descartadas. Preservar comportamiento: hoy el job
        // tampoco las trackea.
        celdasSinDato: [],
      }
    },
  }
}
