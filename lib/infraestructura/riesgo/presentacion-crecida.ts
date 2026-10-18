import { CATALOGO_A5 } from '@/lib/infraestructura/hidrometria/ina/catalogo-a5'
import type { FactorMotor } from './explicar-snapshot'
import escenas from './antecedentes-crecida-s2.json'

export type PresentacionCrecida = {
  estacion: string
  alturaCriticaM: number | null
  alturaActualM: number | null
  subidaDesdeActualM: number | null
  antecedente: {
    nivelM: number
    fecha: string | null
    distanciaAguaM: number | null
    subidaHastaUmbralM: number | null
  } | null
  defensaCostera: boolean
  origen?: 'estudio_v04'
  probabilidadesPorHorizonte?: Record<24 | 72 | 240, number | null>
}

const NUMERO = '(-?\\d+(?:[.,]\\d+)?)'
const ALTURA = new RegExp(`altura critica: se alcanza con ${NUMERO} m en la escala de ([^;(]+) \\(fuente (?:calibrada|cero\\+km|dem);`)
const ACTUAL = new RegExp(`; hoy ${NUMERO} m(?:;|$)`)
const SECO = new RegExp(`Sentinel-2 la vio seca con ${NUMERO} m(?: \\((\\d{4}-\\d{2}-\\d{2})\\))?`)
const PROBABILIDADES = /probabilidad 1 día (s\/d|\d+ %), 3 días (s\/d|\d+ %), 10 días (s\/d|\d+ %)/
const porcentaje = (texto: string) => {
  const valor = Number(texto.replace(' %', ''))
  return Number.isFinite(valor) && valor >= 0 && valor <= 100 ? valor : null
}
const numero = (texto: string) => Number(texto.replace(',', '.'))
const diferencia = (a: number, b: number) => Math.round((a - b) * 100) / 100

type Escena = { estacionId: string; fecha: string; nivelM: number; distanciasM: Record<string, number | undefined>; alturasEstudioM?: Record<string, number | undefined>; escuelasConDefensa?: string[] }
const ESCENAS: Escena[] = escenas

/** Referencia del estudio, independiente del pronóstico y del modelo del run vigente. */
export function presentarReferenciaEstudio(cueAnexo: string, factores: FactorMotor[]): PresentacionCrecida | null {
  const escena = ESCENAS.find((e) => e.distanciasM[cueAnexo] !== undefined)
  if (!escena) return null
  const lectura = factores.find((f) => f.variable === 'altura_rio'
    && f.valor !== null && Number.isFinite(f.valor)
    && f.explicacion?.includes(` en ${escena.estacionId}:`))
  const alturaActualM = lectura?.valor ?? null
  const alturaCriticaM = escena.alturasEstudioM?.[cueAnexo] ?? null
  const estacion = CATALOGO_A5.find((e) => e.estacionId === escena.estacionId)?.nombre ?? escena.estacionId
  return {
    estacion,
    alturaCriticaM,
    alturaActualM,
    subidaDesdeActualM: alturaCriticaM === null || alturaActualM === null ? null : diferencia(alturaCriticaM, alturaActualM),
    antecedente: {
      nivelM: escena.nivelM, fecha: escena.fecha, distanciaAguaM: escena.distanciasM[cueAnexo] ?? null,
      subidaHastaUmbralM: alturaCriticaM === null ? null : diferencia(alturaCriticaM, escena.nivelM),
    },
    defensaCostera: escena.escuelasConDefensa?.includes(cueAnexo) ?? false,
    origen: 'estudio_v04',
  }
}

/** Lee la explicación persistida: presentar un cálculo nunca vuelve a ejecutar el motor. */
export function presentarCrecida(cueAnexo: string, factores: FactorMotor[], calculadoEn: string): PresentacionCrecida | null {
  for (const factor of factores) {
    if (factor.fuente !== 'rio-v04' && factor.variable !== 'altura_rio') continue
    const texto = factor.explicacion ?? ''
    const altura = ALTURA.exec(texto)
    if (!altura) continue
    const alturaCriticaM = numero(altura[1])
    const estacion = altura[2].trim()
    const actual = ACTUAL.exec(texto)
    const alturaActualM = actual ? numero(actual[1]) : null
    if (!Number.isFinite(alturaCriticaM) || (alturaActualM !== null && !Number.isFinite(alturaActualM))) continue
    const seco = SECO.exec(texto)
    const nivelM = seco ? numero(seco[1]) : null
    const fecha = seco?.[2] ?? null
    const estacionId = CATALOGO_A5.find((e) => e.nombre === estacion)?.estacionId
    // No unir el mínimo de distancia de varias escenas con el máximo de altura.
    const escena = ESCENAS.find((e) => e.estacionId === estacionId && e.fecha === fecha && e.nivelM === nivelM)
    const antecedenteValido = nivelM !== null && Number.isFinite(nivelM) && (fecha === null || fecha <= calculadoEn.slice(0, 10))
    const probabilidades = PROBABILIDADES.exec(texto)
    return {
      estacion,
      alturaCriticaM,
      alturaActualM,
      ...(probabilidades ? { probabilidadesPorHorizonte: {
        24: porcentaje(probabilidades[1]), 72: porcentaje(probabilidades[2]), 240: porcentaje(probabilidades[3]),
      } } : {}),
      subidaDesdeActualM: alturaActualM === null ? null : diferencia(alturaCriticaM, alturaActualM),
      antecedente: antecedenteValido ? {
        nivelM,
        fecha,
        distanciaAguaM: escena?.distanciasM[cueAnexo] ?? null,
        subidaHastaUmbralM: diferencia(alturaCriticaM, nivelM),
      } : null,
      defensaCostera: texto.includes('protegida por defensa costera'),
    }
  }
  return null
}
