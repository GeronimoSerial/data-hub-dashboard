// Adapter real de PuertoRioPrefectura. Combina la localidad de la escuela
// (ge_localizacion), el tramo aprobado de su localidad (tramos-prefectura),
// la exposición física al río (susceptibilidad G1, distancia a punto de río)
// y la última lectura oficial de la estación (hidro_lectura).
//
// Estrategia de carga: UNA sola carga por instancia del adapter, memoizada
// en el closure (lazy, en la primera llamada a obtenerEvidencia). Nunca un
// SELECT por cueAnexo.
//
// Contrato: null es "sin evidencia". Nunca se imputa "normal" cuando falta
// tramo aprobado, exposición, lectura vigente o estado oficial.
import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { hidroLectura, infraGeoRio, infraSusceptibilidadEstatica } from '@/lib/db/schema'
import { estacionParaLocalidad } from '@/lib/infraestructura/hidrometria/tramos-prefectura'
import {
  estadoDeLectura,
  evaluarExposicionRio,
  lecturaVigente,
} from '../rio-prefectura'
import type { EvidenciaRioPrefectura, PuertoRioPrefectura } from '../puertos'
import { ultimaFilaConservadoraPorCue } from './susceptibilidad'

// Valores numéricos pueden llegar como string desde pg (numeric/doublePrecision).
type Numerico = number | string | null

export interface FilaSusceptibilidadRio {
  claseRio: string | null
  peligroInundacionFluvial: Numerico
  distanciaAguaM: Numerico
  alturaSobreAguaM: Numerico
  juntoLaguna: boolean | null
}

export interface FilaLecturaRio {
  estacionId: string
  lecturaM: Numerico
  alertaM: Numerico
  evacuacionM: Numerico
  variacionM: Numerico
  medidaEn: string
  inconsistente: boolean | null
}

export interface DatosRio {
  localidadPorCue: Map<string, string | null>
  susceptibilidadPorCue: Map<string, FilaSusceptibilidadRio>
  distanciaRioKmPorCue: Map<string, Numerico>
  lecturas: FilaLecturaRio[]
}

export interface DependenciasAdapterRioPrefectura {
  // Punto de inyección para tests: por defecto consulta la DB real.
  cargarDatos?: () => Promise<DatosRio>
}

// Convierte a número; null, vacío o NaN quedan como null.
function num(valor: Numerico | undefined): number | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor === 'string' && valor.trim() === '') return null
  const n = Number(valor)
  return Number.isNaN(n) ? null : n
}

// Decide la evidencia oficial de una escuela a partir de datos ya cargados.
// Función pura: sin base de datos ni reloj (asOf llega por parámetro).
export function resolverEvidenciaRio(
  datos: DatosRio,
  cueAnexo: string,
  asOf: string,
): EvidenciaRioPrefectura | null {
  const localidad = datos.localidadPorCue.get(cueAnexo)
  if (!localidad) return null

  // Sólo tramos aprobados (comportamiento por defecto de estacionParaLocalidad).
  const tramo = estacionParaLocalidad(localidad)
  if (!tramo) return null

  const asOfMs = Date.parse(asOf)
  if (Number.isNaN(asOfMs)) return null

  // Exposición física al río: sin ella la escuela no recibe el estado del tramo.
  const susceptibilidad = datos.susceptibilidadPorCue.get(cueAnexo)
  const criterio = evaluarExposicionRio({
    claseRio: susceptibilidad?.claseRio ?? null,
    peligroInundacionFluvial: num(susceptibilidad?.peligroInundacionFluvial),
    distanciaAguaM: num(susceptibilidad?.distanciaAguaM),
    alturaSobreAguaM: num(susceptibilidad?.alturaSobreAguaM),
    juntoLaguna: susceptibilidad?.juntoLaguna ?? null,
    distanciaPuntoRioKm: num(datos.distanciaRioKmPorCue.get(cueAnexo)),
  })
  if (criterio === null) return null

  // Última lectura publicada, válida para el momento asOf (ignora futuras e inconsistentes).
  let ultima: FilaLecturaRio | null = null
  let ultimaMs = Number.NEGATIVE_INFINITY
  for (const lectura of datos.lecturas) {
    if (lectura.estacionId !== tramo.estacionId) continue
    if (lectura.inconsistente === true || num(lectura.lecturaM) === null) continue
    const medidaMs = Date.parse(lectura.medidaEn)
    if (Number.isNaN(medidaMs) || medidaMs > asOfMs) continue
    if (medidaMs > ultimaMs) {
      ultima = lectura
      ultimaMs = medidaMs
    }
  }
  if (ultima === null || !lecturaVigente(ultima.medidaEn, asOf)) return null

  const lecturaM = num(ultima.lecturaM)
  if (lecturaM === null) return null
  const alertaM = num(ultima.alertaM)
  const evacuacionM = num(ultima.evacuacionM)

  const estado = estadoDeLectura(lecturaM, alertaM, evacuacionM)
  if (estado === null) return null

  return {
    cueAnexo,
    estacionId: tramo.estacionId,
    rio: tramo.rio,
    lecturaM,
    alertaM,
    evacuacionM,
    variacionM: num(ultima.variacionM),
    medidaEn: ultima.medidaEn,
    estado,
    criterioExposicion: criterio,
  }
}

// Carga única de todas las fuentes necesarias. Cada tabla se lee en batch.
export async function cargarDatosRioDesdeDb(): Promise<DatosRio> {
  const db = getDb()
  const [resLocalidad, filasSusceptibilidad, filasGeo, filasLectura] = await Promise.all([
    db.execute(sql`select cue_anexo, localidad from ge.ge_localizacion`),
    db.select().from(infraSusceptibilidadEstatica),
    db.select().from(infraGeoRio),
    db
      .select({
        estacionId: hidroLectura.estacionId,
        lecturaM: hidroLectura.lecturaM,
        alertaM: hidroLectura.alertaM,
        evacuacionM: hidroLectura.evacuacionM,
        variacionM: hidroLectura.variacionM,
        medidaEn: hidroLectura.medidaEn,
        inconsistente: hidroLectura.inconsistente,
      })
      .from(hidroLectura),
  ])

  // El driver puede devolver { rows } o directamente el array.
  const filasLocalidad = (
    Array.isArray(resLocalidad) ? resLocalidad : ((resLocalidad as { rows?: unknown[] }).rows ?? [])
  ) as Array<{ cue_anexo: string; localidad: string | null }>

  const localidadPorCue = new Map<string, string | null>()
  for (const fila of filasLocalidad) {
    localidadPorCue.set(fila.cue_anexo, fila.localidad)
  }

  const susceptibilidadPorCue = new Map<string, FilaSusceptibilidadRio>()
  for (const [cue, fila] of ultimaFilaConservadoraPorCue(filasSusceptibilidad)) {
    susceptibilidadPorCue.set(cue, {
      claseRio: fila.claseRio,
      peligroInundacionFluvial: fila.peligroInundacionFluvial,
      distanciaAguaM: fila.distanciaAguaM,
      alturaSobreAguaM: fila.alturaSobreAguaM,
      juntoLaguna: fila.juntoLaguna,
    })
  }

  const distanciaRioKmPorCue = new Map<string, Numerico>()
  for (const fila of filasGeo) {
    distanciaRioKmPorCue.set(fila.cueAnexo, fila.distanciaKm)
  }

  return {
    localidadPorCue,
    susceptibilidadPorCue,
    distanciaRioKmPorCue,
    lecturas: filasLectura,
  }
}

export function crearAdapterRioPrefectura(
  deps: DependenciasAdapterRioPrefectura = {},
): PuertoRioPrefectura {
  const cargarDatos = deps.cargarDatos ?? cargarDatosRioDesdeDb
  let cache: Promise<DatosRio> | null = null

  function cargar(): Promise<DatosRio> {
    if (cache === null) cache = cargarDatos()
    return cache
  }

  return {
    async obtenerEvidencia({ cueAnexo, asOf }) {
      const datos = await cargar()
      return resolverEvidenciaRio(datos, cueAnexo, asOf)
    },
  }
}
