import { randomUUID } from 'node:crypto'
import { getDb } from '@/lib/db'
import { hazardForecast, hazardObservation, infraGeoProfile } from '@/lib/db/schema'
import { cargarReferencias } from '@/lib/infraestructura/datasets/repositorio'
import { ejecutarSyncRadarMeteo } from '@/lib/infraestructura/radar-meteo/job-sync'
import { generarGrilla, GRID_VERSION } from '@/lib/infraestructura/radar-meteo/grilla'
import type { LoteRadar } from '@/lib/infraestructura/radar-meteo/provider'
import { VARIABLES_RADAR } from '@/lib/infraestructura/radar-meteo/provider'
import { syncSmnAlertas } from '@/lib/infraestructura/radar-meteo/smn-alertas'
import { ingestarGeo } from '@/lib/infraestructura/datasets/geo-static'
import {
  PROVIDER_OBSERVADO,
  VARIABLE_OBSERVADA,
} from '@/lib/infraestructura/riesgo/peligro/observado'
import { ESCUELAS } from './escuelas'

// Radar meteorológico, alerta SMN, lluvia observada y aislamiento del seed del mapa.
// Todo se siembra con funciones de la aplicación (sincronización del radar con un
// proveedor inyectado, sincronización CAP con un fetch inyectado, ingestarGeo) salvo la
// lluvia observada: su escritor (sync-imerg) no exporta la función de persistencia, así
// que las filas de hazard_observation se insertan con el esquema de la app.

const CUE_AISLADA_1 = '1800893-00' // PARAJE SAN ANTONIO (Goya)
const CUE_AISLADA_2 = '1800953-00' // ESTANCIA DON RAUL (Goya)
const CUE_AISLADA_3 = '1800939-00' // PAGO REDONDO (Goya)
const CENTRO_GOYA = { lat: -29.1367, lon: -59.246538 }

const ALERTA_ID = 'urn:oid:2.49.0.1.32.0.2026.seed.radar-mapa-enos'
const RSS_URL = 'https://ssl.smn.gob.ar/CAP/AR.php'
const CAP_URL = 'https://ssl.smn.gob.ar/feeds/CAP/xml_generados/CAP_seed_mapa_enos.xml'

const MS_HORA = 60 * 60 * 1000

// Valores sembrados y esperados. Cambiar un número acá lo cambian las pruebas (un solo lugar).
export const ESPERADOS_RADAR = {
  gridVersion: GRID_VERSION,
  // Corrida de radar: 1 corrida completa, precipitación de 1 mm/h en las primeras 24 h en
  // todas las celdas, así que la lluvia acumulada a 24 h es 24 mm en cada celda.
  corrida: {
    status: 'completo' as const,
    precipitacionHoras: 24,
    precipitacionMmPorHora: 1,
    lluviaAcumulada24hMm: 24,
    modelo: 'best_match',
  },
  // Escuelas con nivel de radar: el roster tiene coordenadas y entran en la corrida.
  escuelasConRadar: [
    '1800893-00',
    '1800953-00',
    '1800939-00',
    '1800643-00',
    '1801899-00',
    '1801855-00',
  ],
  // Alerta SMN sembrada: una sola, cubre Capital y Goya.
  alerta: {
    id: ALERTA_ID,
    event: 'Tormentas',
    severity: 'Moderate',
    severidadEspanol: 'Moderada',
    headline: 'Tormentas',
    departamentos: ['Capital', 'Goya'] as const,
  },
  // Lluvia observada (IMERG): acumulado por celda en mm, celdas sobre Capital y Goya.
  lluviaObservada: {
    horas: 24 as const,
    celdas: [
      { geometryRef: '-27.5_-58.8', granulosMm: [3.1, 4.2], acumuladoMm: 7.3 },
      { geometryRef: '-27.4_-58.9', granulosMm: [5.0, 5.5], acumuladoMm: 10.5 },
      { geometryRef: '-29.1_-59.2', granulosMm: [10.0, 10.0], acumuladoMm: 20.0 },
    ],
  },
  // Escuelas aisladas con ruta de acceso (un tramo hasta la escuela, termina en sus coordenadas).
  // Niveles del índice de aislamiento (lib/mapas/accesos-capas.ts): 0 Baja/fácil ... 3 Alta.
  //   3 Alta: cruce de agua sin puente y sin camino alternativo (dos vados).
  //   2 Media: un cruce de agua sin puente, pero hay otro camino que lo evita.
  //   1 Baja: sin cruces sin puente, trayecto largo con tramos de tierra.
  aisladas: [
    { cueAnexo: CUE_AISLADA_1, indiceAislamiento: 3, crucesAguaCount: 2, alternativaSinCruce: false },
    { cueAnexo: CUE_AISLADA_2, indiceAislamiento: 2, crucesAguaCount: 1, alternativaSinCruce: true },
    { cueAnexo: CUE_AISLADA_3, indiceAislamiento: 1, crucesAguaCount: 0, alternativaSinCruce: false },
  ],
  // Peligro por departamento (hazard_forecast, precipitacion, sin climatología: umbral provisorio
  // de peligro/umbrales-provisorios.ts). Clave: nombre del roster; la API devuelve el nombre normalizado.
  // Niveles: 24 h amarillo > 50 / naranja > 80 / rojo > 120; 72 h amarillo > 80 / naranja > 120 / rojo > 180;
  // 240 h (72 h x 1.5) amarillo > 120 / naranja > 180 / rojo > 270.
  peligroPorDepartamento: {
    Capital: { mm: { 24: 60, 72: 90, 240: 100 }, nivel: { 24: 'amarillo', 72: 'amarillo', 240: 'verde' } },
    Goya: { mm: { 24: 90, 72: 130, 240: 200 }, nivel: { 24: 'naranja', 72: 'naranja', 240: 'naranja' } },
    'Paso de los Libres': { mm: { 24: 130, 72: 190, 240: 300 }, nivel: { 24: 'rojo', 72: 'rojo', 240: 'rojo' } },
    'Santo Tomé': { mm: { 24: 10, 72: 20, 240: 50 }, nivel: { 24: 'verde', 72: 'verde', 240: 'verde' } },
  },
} as const

function ahoraIso(ahora: Date) {
  return ahora.toISOString()
}

function horaInicio(ahora: Date) {
  const inicio = new Date(ahora)
  inicio.setUTCMinutes(0, 0, 0)
  return inicio
}

// Proveedor de radar inyectado: devuelve un lote con los tiempos y valores fijados arriba.
function lotePrecipitacionUniforme(celdas: ReturnType<typeof generarGrilla>, inicio: Date): LoteRadar {
  const horas = 72
  const times = Array.from({ length: horas }, (_, i) => new Date(inicio.getTime() + i * MS_HORA).toISOString().slice(0, 16))
  const serie = (valor: (hora: number) => number) => Array.from({ length: horas }, (_, hora) => valor(hora))
  const values = Object.fromEntries(
    VARIABLES_RADAR.map((variable) => [
      variable,
      celdas.map(() => (variable === 'precipitation' ? serie((h) => (h < ESPERADOS_RADAR.corrida.precipitacionHoras ? ESPERADOS_RADAR.corrida.precipitacionMmPorHora : 0)) : serie(() => 0))),
    ]),
  ) as LoteRadar['values']
  return {
    times,
    // Como el proveedor real (provider.ts), cada celda conserva row/col: la API deriva fila y columna de ellos.
    cells: celdas.map((c) => ({ ...c, latModelo: c.lat, lonModelo: c.lon })),
    values,
    units: Object.fromEntries(VARIABLES_RADAR.map((v) => [v, v === 'precipitation' ? 'mm' : ''])),
  }
}

async function sembrarCorridaRadar(ahora: Date) {
  const celdas = generarGrilla()
  const inicio = horaInicio(ahora)
  await ejecutarSyncRadarMeteo({
    ahora,
    celdas,
    obtener: async () => ({ lotes: [lotePrecipitacionUniforme(celdas, inicio)], pesoTotal: 1 }),
  })
}

// Polígono CAP en formato "lat,lon" separado por espacios, sobre Capital y Goya.
const POLIGONO_CAP = '-27.3,-58.7 -27.3,-59.4 -29.3,-59.4 -29.3,-58.7 -27.3,-58.7'

function capDeAlerta(ahora: Date): string {
  const sent = new Date(ahora.getTime() - 30 * 60 * 1000).toISOString()
  const onset = new Date(ahora.getTime() - 20 * 60 * 1000).toISOString()
  const expires = new Date(ahora.getTime() + 12 * MS_HORA).toISOString()
  return `<?xml version="1.0"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><identifier>${ALERTA_ID}</identifier><sender>smn@smn.gob.ar</sender><sent>${sent}</sent><status>Actual</status><msgType>Alert</msgType><scope>Public</scope><info><language>es-AR</language><category>Met</category><event>Tormentas</event><urgency>Immediate</urgency><severity>Moderate</severity><certainty>Likely</certainty><onset>${onset}</onset><expires>${expires}</expires><senderName>Servicio Meteorologico Nacional</senderName><headline>Tormentas</headline><description>Tormentas de variada intensidad sobre Capital y Goya.</description><instruction>Evite salir.</instruction><web>https://www.smn.gob.ar/alertas</web><contact>pronos@smn.gob.ar</contact><area><areaDesc>Capital y Goya</areaDesc><polygon>${POLIGONO_CAP}</polygon></area></info></alert>`
}

async function sembrarAlertaSmn(ahora: Date) {
  const rss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>seed</title><item><title>Tormentas</title><link>${CAP_URL}</link></item></channel></rss>`
  const cap = capDeAlerta(ahora)
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input)
    const cuerpo = url === RSS_URL ? rss : url === CAP_URL ? cap : null
    if (cuerpo === null) return new Response('no encontrado', { status: 404 })
    return new Response(cuerpo, { status: 200, headers: { 'content-type': 'application/xml' } })
  }) as typeof fetch
  await syncSmnAlertas({ ahora, fetchImpl })
}

async function sembrarLluviaObservada(ahora: Date) {
  const db = getDb()
  const ingeridoEn = ahoraIso(ahora)
  // Dos gránulos IMERG (30 min de cadencia) por celda, con los valores exactos de ESPERADOS_RADAR.
  const desdeMinutos = [30, 60]
  const filas = ESPERADOS_RADAR.lluviaObservada.celdas.flatMap((celda) => {
    return celda.granulosMm.map((valor, indice) => {
      const observadoEn = new Date(ahora.getTime() - desdeMinutos[indice] * 60 * 1000).toISOString()
      return {
        id: randomUUID(),
        provider: PROVIDER_OBSERVADO,
        variable: VARIABLE_OBSERVADA,
        geometryRef: celda.geometryRef,
        valor,
        unidad: 'mm',
        observadoEn,
        validoDesde: new Date(Date.parse(observadoEn) - 30 * 60 * 1000).toISOString(),
        validoHasta: observadoEn,
        calidad: 1,
        rawRef: null,
        ingeridoEn,
      }
    })
  })
  await db.insert(hazardObservation).values(filas)
}

async function sembrarAislamiento(ahora: Date) {
  const fechaExtracto = ahora.toISOString().slice(0, 10)
  // ingestarGeo valida filas con las claves del CSV de origen (snake_case).
  const aislamiento = ESPERADOS_RADAR.aisladas.map((aislada) => ({
    cue_anexo: aislada.cueAnexo,
    version_job: 'seed-mapa-enos-1',
    distancia_via_pavimentada_m: 9800,
    distancia_cabecera_departamental_m: 42000,
    tramos_sin_pavimentar_count: 3,
    tramos_sin_pavimentar_km: 12.4,
    cruces_agua_count: aislada.crucesAguaCount,
    cruces_agua_con_puente_count: 0,
    cruces_agua_con_vado_count: aislada.crucesAguaCount,
    cruces_agua_con_vado_explicito_count: 0,
    cruces_agua_con_vado_probable_count: aislada.crucesAguaCount,
    tiene_alternativa_sin_cruce: aislada.alternativaSinCruce,
    tiene_alternativa_pavimentada: false,
    indice_aislamiento: aislada.indiceAislamiento,
    motivo_sin_datos: null,
    snap_distancia_m: 15,
    fecha_extracto_osm: fechaExtracto,
    licencia: 'ODbL (seed e2e)',
    importado_en: ahora.toISOString(),
  }))

  // Ruta: línea desde el centro de Goya hasta la escuela; termina en sus coordenadas.
  const escuelasPorCue = new Map(ESCUELAS.map((e) => [e.cueAnexo, e]))
  const geometria = ESPERADOS_RADAR.aisladas.map((aislada) => {
    const escuela = escuelasPorCue.get(aislada.cueAnexo)
    if (!escuela || escuela.lat === null || escuela.lon === null) throw new Error(`Escuela aislada sin coordenadas: ${aislada.cueAnexo}`)
    const puntoMedio: [number, number] = [
      (CENTRO_GOYA.lon + escuela.lon) / 2,
      (CENTRO_GOYA.lat + escuela.lat) / 2,
    ]
    return {
      cue_anexo: aislada.cueAnexo,
      version_job: 'seed-mapa-enos-1',
      ruta: {
        type: 'LineString' as const,
        coordinates: [[CENTRO_GOYA.lon, CENTRO_GOYA.lat], puntoMedio, [escuela.lon, escuela.lat]],
      },
      cruces: Array.from({ length: aislada.crucesAguaCount }, (_, i) => ({
        lon: puntoMedio[0] + i * 0.001,
        lat: puntoMedio[1],
        clasificacion: 'vado' as const,
        nombreCurso: 'Arroyo seed',
        nombrePuente: null,
      })),
      via_principal: null,
      destino: { nombre: 'Goya' },
      distancia_destino_m: 9800,
      motivo_sin_geometria: null,
      edificio: null,
      fecha_extracto_osm: fechaExtracto,
      licencia: 'ODbL (seed e2e)',
      importado_en: ahora.toISOString(),
    }
  })

  await ingestarGeo('aislamiento', aislamiento, {
    revision: 'seed-mapa-enos-aislamiento-1',
    fuente: 'seed e2e mapa-enos',
    licencia: 'ODbL (seed e2e)',
    fechaFuente: fechaExtracto,
  })
  await ingestarGeo('geometria', geometria, {
    revision: 'seed-mapa-enos-geometria-1',
    fuente: 'seed e2e mapa-enos',
    licencia: 'ODbL (seed e2e)',
    fechaFuente: fechaExtracto,
  })
}

export async function sembrarRadar(): Promise<void> {
  // La caché de referencias puede ser anterior a datasets.ts: se recarga para ver lo publicado.
  await cargarReferencias(getDb(), true)
  const ahora = new Date()
  await sembrarCorridaRadar(ahora)
  await sembrarAlertaSmn(ahora)
  await sembrarLluviaObservada(ahora)
  await sembrarAislamiento(ahora)
  await sembrarPronosticoPrecipitacion(ahora)
}

// Pronóstico de precipitación por celda para el peligro departamental. El seed escribe las filas
// con el esquema de la app: no hay una función de ingesta de pronóstico de precipitación que
// acepte valores inyectados (el sync de pronóstico existente es de caudal). La corrida queda dos
// horas antes de ahora para que sea anterior a la publicación del run de riesgo.
function sinAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase()
}

async function sembrarPronosticoPrecipitacion(ahora: Date) {
  const db = getDb()
  const corridaEn = new Date(ahora.getTime() - 2 * MS_HORA).toISOString()
  const celdasPorDepartamento = await db
    .selectDistinct({ departamento: infraGeoProfile.departamento, geometryRef: infraGeoProfile.geometryRef })
    .from(infraGeoProfile)
  const filas = celdasPorDepartamento.flatMap((fila) => {
    if (fila.departamento === null || fila.geometryRef === null) return []
    const clave = Object.keys(ESPERADOS_RADAR.peligroPorDepartamento).find(
      (nombre) => sinAcentos(nombre) === fila.departamento,
    )
    if (!clave) throw new Error(`sembrarPronostico: departamento sin valor esperado: ${fila.departamento}`)
    const { mm } = ESPERADOS_RADAR.peligroPorDepartamento[clave as keyof typeof ESPERADOS_RADAR.peligroPorDepartamento]
    return ([24, 72, 240] as const).map((horizonte) => ({
      id: randomUUID(),
      provider: 'seed-mapa-enos',
      variable: 'precipitacion',
      geometryRef: fila.geometryRef!,
      corridaEn,
      validoEn: new Date(Date.parse(corridaEn) + horizonte * MS_HORA).toISOString(),
      horizonteHoras: horizonte,
      valor: mm[horizonte],
      unidad: 'mm',
      pasoHoras: 1,
      rawRef: null,
      ingeridoEn: corridaEn,
    }))
  })
  await db.insert(hazardForecast).values(filas)
}
