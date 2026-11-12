// Altura crítica por escuela en la escala del tramo (reglas v0.4, T10d).
// Módulo puro, sin DB ni reloj. Ver docs/motor-v0.4/validacion-historica.md
// (§T10d) y docs/motor-v0.4/defensas-costeras.md.
//
// La compuerta del piso observado se expresa en UNA magnitud que el usuario
// lee en el boletín: la altura h_crit de la escala de la estación del tramo
// con la que el agua posible (+ margen de error vertical) llega al terreno.
//   1. Offset calibrado (b = 1): cota_agua = a + h → h_crit = cota − margen − a.
//   2. Zona modelada sin offset: inversión de la transferencia km con
//      desplazamiento paralelo de ambas escalas → h_crit = h_ref + (umbral −
//      nivel_sitio_actual).
//   3. Resto: DEM + referencia de largo plazo (exposicion-v04.ts).
// Luego: piso de evidencia seca Sentinel-2 (h_crit ≥ h_seco), P(máx escala ≥
// h_crit) por horizonte con los miembros de análogos de la estación, chequeo
// de tendencia/onda, y defensas costeras.
import type { HorizontePeligro } from './puertos'
import { BANDA_EXPOSICION_V04_M, MARGEN_ERROR_DEM_V04_M, UMBRAL_ALCANZABLE_V04 } from './config'
import type { EvidenciaSecoS2 } from './evidencia-seco-s2'
import { CATALOGO_A5 } from '@/lib/infraestructura/hidrometria/ina/catalogo-a5'
import { regionActiva } from '@/lib/infraestructura/region'

const HORIZONTES: readonly HorizontePeligro[] = [24, 72, 240]
const redondear2 = (x: number) => Math.round(x * 100) / 100

export type AlcanceAlturaCritica = 'completo' | 'reducido' | 'ninguno'
export type FuenteAlturaCritica = 'calibrada' | 'cero+km' | 'dem'

// --- 1. Offsets calibrados con bordes Sentinel-2 (estudio 2026-10-18) ---
// cota_agua(sitio) ≈ aM + h (m IGN aprox., DEM Copernicus GLO-30). La
// pendiente libre b no es confiable (comprimida y dependiente del percentil
// del borde) → b = 1 fija y sólo se calibra a = mediana(borde p50 − h) en las
// fechas de aguas altas. Sobre el desborde el borde GLO-30 queda ~1,0 m debajo
// de cero IGN + h (mediana −1,04 m en 7 escalas del Paraná).
export type VeredictoCalibracion = 'usar' | 'usar_con_reservas' | 'contradicho' | 'no_usar'

export type OffsetCalibrado = {
  estacionId: string
  aM: number | null
  veredicto: VeredictoCalibracion
  /** Fechas S2 del tramo alto usadas en el ajuste. */
  n: number
  /** Desvío de los residuos con b = 1 (m). */
  sdM: number | null
  fuente: string
  fecha: string
  nota?: string
}

const FUENTE_CALIBRACION = 'borde S2 L2A p50 sobre GLO-30, b=1, a=mediana(borde−h) tramo alto'
const FECHA_CALIBRACION = '2026-10-18'
const o = (estacionId: string, aM: number | null, veredicto: VeredictoCalibracion, n: number, sdM: number | null, nota?: string): OffsetCalibrado =>
  ({ estacionId, aM, veredicto, n, sdM, fuente: FUENTE_CALIBRACION, fecha: FECHA_CALIBRACION, ...(nota ? { nota } : {}) })

export const OFFSETS_CALIBRADOS_VERSION = 'offsets-s2-b1-2026-10-18.1'
export const OFFSETS_CALIBRADOS_V04: Readonly<Record<string, OffsetCalibrado>> = {
  'pna-corrientes': o('pna-corrientes', 41.35, 'usar', 4, 0.19, 'defensa costera urbana excluida del muestreo'),
  'pna-itati': o('pna-itati', 44.5, 'usar', 3, 0.27),
  'pna-monte-caseros': o('pna-monte-caseros', 32.05, 'usar', 4, 0.33),
  'pna-garruchos': o('pna-garruchos', 51.21, 'usar', 3, 0.26),
  'pna-paso-de-los-libres': o('pna-paso-de-los-libres', 37.12, 'usar_con_reservas', 4, 0.48),
  'pna-santo-tome': o('pna-santo-tome', 45.11, 'usar_con_reservas', 4, 0.54),
  'pna-ituzaingo': o('pna-ituzaingo', 57.47, 'usar_con_reservas', 3, 0.39, 'aguas abajo de Yacyretá; AOI en la ciudad'),
  'pna-empedrado': o('pna-empedrado', 39.92, 'usar_con_reservas', 3, 0.37),
  'pna-ita-ibate': o('pna-ita-ibate', 53.13, 'usar_con_reservas', 4, 0.43, 'h máx. observado 5,75 m < alerta'),
  'pna-esquina': o('pna-esquina', 20.66, 'usar_con_reservas', 4, 0.42, 'defensa urbana excluida'),
  'pna-goya': o('pna-goya', 28.73, 'usar_con_reservas', 4, 0.43, 'anillo de defensa excluido; bañados vegetados'),
  'pna-bella-vista': o('pna-bella-vista', 33.45, 'usar_con_reservas', 4, 0.76),
  'pna-alvear': o('pna-alvear', 40.21, 'usar_con_reservas', 4, 0.55),
  'pna-yapeyu': o('pna-yapeyu', 38.2, 'usar_con_reservas', 4, 0.57),
  // Contradicho por S2: 3 escuelas quedaron secas a ~340 m del agua con h 7,38
  // m mientras el ajuste dice que se alcanzaban con 6,25–6,52 m. No se usa el
  // offset; sólo la evidencia seca como piso de h_crit.
  'pna-paso-de-la-patria': o('pna-paso-de-la-patria', 43.95, 'contradicho', 3, 0.73, 'usar sólo la evidencia seca como piso'),
  'pna-la-cruz': o('pna-la-cruz', null, 'no_usar', 4, 1.13),
  'pna-mocoreta': o('pna-mocoreta', null, 'no_usar', 0, null),
  'pna-bompland': o('pna-bompland', null, 'no_usar', 0, null),
}

const OFFSETS_POR_REGION: ReadonlyMap<string, Readonly<Record<string, OffsetCalibrado>>> = new Map([['corrientes', OFFSETS_CALIBRADOS_V04]])

/** Offset calibrado utilizable (veredicto usar / usar con reservas) o null; sólo regiones con calibración. */
export function offsetUtilizable(estacionId: string, regionId: string = regionActiva().id): (OffsetCalibrado & { aM: number }) | null {
  const c = OFFSETS_POR_REGION.get(regionId)?.[estacionId]
  return c && c.aM !== null && (c.veredicto === 'usar' || c.veredicto === 'usar_con_reservas') ? (c as OffsetCalibrado & { aM: number }) : null
}

export type AlturasCriticas = { alturaCriticaM: number; alturaCriticaBandaM: number }

export function alturaCriticaCalibrada(aM: number, cotaM: number): AlturasCriticas {
  const alturaCriticaM = redondear2(cotaM - MARGEN_ERROR_DEM_V04_M - aM)
  return { alturaCriticaM, alturaCriticaBandaM: redondear2(alturaCriticaM - BANDA_EXPOSICION_V04_M) }
}

/**
 * Zona modelada: altura de la escala de referencia con la que el nivel
 * transferido al sitio llega al umbral (cota − margen), suponiendo que la
 * escala compañera sube lo mismo (desplazamiento paralelo).
 */
export function alturaCriticaModelada(p: { hReferenciaM: number; nivelSitioM: number; umbralM: number }): number {
  return redondear2(p.hReferenciaM + (p.umbralM - p.nivelSitioM))
}

/** h_crit ≥ altura con la que S2 vio la escuela seca (misma escala). */
export function aplicarEvidenciaSeco(a: AlturasCriticas, ev: EvidenciaSecoS2 | null): AlturasCriticas & { elevadaPorSeco: boolean } {
  if (ev === null || a.alturaCriticaM >= ev.hSecoM) return { ...a, elevadaPorSeco: false }
  return { alturaCriticaM: ev.hSecoM, alturaCriticaBandaM: redondear2(ev.hSecoM - BANDA_EXPOSICION_V04_M), elevadaPorSeco: true }
}

// --- 2. Defensas costeras ---
// ============================================================================
// COMPORTAMIENTO PROVISORIO (confirmado por el usuario 2026-10-18).
// Las ciudades con defensa costera urbana (Goya: anillo; Corrientes: costanera;
// Esquina: defensa urbana) NO tienen hoy cota de coronamiento cargada. Sin
// ella el motor no puede saber si el agua desborda la defensa, y tratar a la
// escuela como si no hubiera defensa la sobrealerta: en Goya 53 de 72 escuelas
// tendrían h_crit por debajo del récord de 7,2 m, consistente con depender del
// anillo. Por eso, con `cotaCoronamientoM: null`, el piso observado baja UN
// nivel (TRATAMIENTO_DEFENSA_V04 = 'piso_reducido'): completo → reducido,
// reducido → ninguno. La explicación lo dice: "protegida por defensa costera;
// cota de coronamiento desconocida: piso reducido un nivel (provisorio)".
//
// CÓMO REEMPLAZARLO: por cada tramo de defensa cargar en DEFENSAS_COSTERAS_V04
// la cota de coronamiento (`cotaCoronamientoM`, m), su `datum` (IGN / SRVN16),
// `fuente` (obra municipal/provincial, INA, DPV, relevamiento propio),
// `fechaRelevamiento` y `estado`. Con la cota cargada el motor compara el agua
// posible en la escala contra h_desborde = coronamiento − a (offset de la
// estación): desborde → piso completo; dentro de la banda → reducido; debajo →
// sin piso. El tratamiento provisorio sólo se usa mientras la cota sea null.
// Las localidades son aproximadas (toda la ciudad, no el polígono protegido).
// ============================================================================
export type TratamientoDefensa = 'piso_reducido' | 'sin_piso' | 'sin_efecto'
export const TRATAMIENTO_DEFENSA_V04: TratamientoDefensa = 'piso_reducido'

export type DefensaCostera = {
  id: string
  /** Localidades (ge_localizacion.localidad, mayúsculas) protegidas, aprox. */
  localidades: readonly string[]
  /** Cota de coronamiento (m); null = desconocida → tratamiento provisorio. */
  cotaCoronamientoM: number | null
  datum: 'IGN' | 'SRVN16' | 'desconocido'
  fuente: string
  fechaRelevamiento: string | null
  estado: 'operativa' | 'en_obra' | 'desconocido'
}

export const DEFENSAS_COSTERAS_VERSION = 'defensas-2026-10-18.1'
export const DEFENSAS_COSTERAS_V04: readonly DefensaCostera[] = [
  { id: 'goya-anillo', localidades: ['GOYA'], cotaCoronamientoM: null, datum: 'desconocido', fuente: 'estudio calibración costera 2026-10-18 (anillo urbano visible en S2); cota pendiente', fechaRelevamiento: null, estado: 'desconocido' },
  { id: 'corrientes-costanera', localidades: ['CORRIENTES'], cotaCoronamientoM: null, datum: 'desconocido', fuente: 'estudio calibración costera 2026-10-18 (defensa urbana excluida del muestreo); cota pendiente', fechaRelevamiento: null, estado: 'desconocido' },
  { id: 'esquina-defensa', localidades: ['ESQUINA'], cotaCoronamientoM: null, datum: 'desconocido', fuente: 'estudio calibración costera 2026-10-18 (defensa urbana excluida); cota pendiente', fechaRelevamiento: null, estado: 'desconocido' },
]

const claveLocalidad = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

export function defensaDeLocalidad(localidad: string | null | undefined): DefensaCostera | null {
  if (!localidad) return null
  const k = claveLocalidad(localidad)
  return DEFENSAS_COSTERAS_V04.find((d) => d.localidades.includes(k)) ?? null
}

// --- 3. Probabilidad y compuerta ---
export type MaximosEscala = Record<HorizontePeligro, number[]>

/** Máximo de cada miembro de análogos de la escala en la ventana de cada horizonte. */
export function maximosEscala(r: { estado: string; trayectorias?: number[][]; desfaseDias?: number } | null): MaximosEscala | null {
  if (!r || r.estado !== 'estimado' || !r.trayectorias || r.trayectorias.length === 0 || r.desfaseDias === undefined) return null
  const dias: Record<HorizontePeligro, number> = { 24: 1, 72: 3, 240: 10 }
  const des = r.desfaseDias
  const salida = {} as MaximosEscala
  for (const h of HORIZONTES) salida[h] = r.trayectorias.map((t) => Math.max(...t.slice(des, des + dias[h])))
  return salida
}

const fraccion = (m: readonly number[], umbral: number) => (m.length === 0 ? 0 : m.filter((x) => x >= umbral).length / m.length)

export type AlcanceHorizonteAltura = {
  alcance: AlcanceAlturaCritica
  /** Alcance antes de aplicar la defensa costera. */
  alcanceSinDefensa: AlcanceAlturaCritica
  pAlcanzar: number | null
  pBanda: number | null
  decide: 'probabilidad' | 'tendencia' | 'subida_posible' | 'banda' | 'ninguno'
  /** h_desborde de la defensa en la escala (coronamiento − a), si se conoce. */
  alturaDesbordeM: number | null
}

function compuerta(
  hC: number,
  hB: number,
  m: readonly number[] | null,
  h0: number | null,
  subidaDet: number | null,
  subidaPosible: number | null,
): Pick<AlcanceHorizonteAltura, 'alcance' | 'pAlcanzar' | 'pBanda' | 'decide'> {
  const p = m ? fraccion(m, hC) : null
  const pB = m ? fraccion(m, hB) : null
  const det = h0 !== null && subidaDet !== null ? h0 + subidaDet : null
  // Sin miembros de análogos se usa el escenario de subida posible (T10).
  const posible = m === null && h0 !== null && subidaPosible !== null ? h0 + subidaPosible : null
  if (p !== null && p >= UMBRAL_ALCANZABLE_V04) return { alcance: 'completo', pAlcanzar: p, pBanda: pB, decide: 'probabilidad' }
  if (det !== null && det >= hC) return { alcance: 'completo', pAlcanzar: p, pBanda: pB, decide: 'tendencia' }
  if (posible !== null && posible >= hC) return { alcance: 'completo', pAlcanzar: p, pBanda: pB, decide: 'subida_posible' }
  if ((pB !== null && pB >= UMBRAL_ALCANZABLE_V04) || (det !== null && det >= hB) || (posible !== null && posible >= hB)) {
    return { alcance: 'reducido', pAlcanzar: p, pBanda: pB, decide: 'banda' }
  }
  return { alcance: 'ninguno', pAlcanzar: p, pBanda: pB, decide: 'ninguno' }
}

const BAJAR: Record<AlcanceAlturaCritica, AlcanceAlturaCritica> = { completo: 'reducido', reducido: 'ninguno', ninguno: 'ninguno' }

export function evaluarAlcanceAlturaCritica(p: {
  alturaCriticaM: number
  alturaCriticaBandaM: number
  h0M: number | null
  maximos: MaximosEscala | null
  /** Tendencia media + onda por horizonte (m); null sin tendencia. */
  subidaDeterministaM: Record<HorizontePeligro, number | null>
  /** Subida posible del escenario (sólo sin miembros de análogos). */
  subidaPosibleM?: Record<HorizontePeligro, number | null>
  defensa: DefensaCostera | null
  /** Offset de la estación (cota_agua = a + h) para comparar con el coronamiento. */
  aEstacionM: number | null
}): Record<HorizontePeligro, AlcanceHorizonteAltura> {
  const salida = {} as Record<HorizontePeligro, AlcanceHorizonteAltura>
  const desborde = p.defensa?.cotaCoronamientoM != null && p.aEstacionM !== null ? redondear2(p.defensa.cotaCoronamientoM - p.aEstacionM) : null
  for (const h of HORIZONTES) {
    const args = [p.maximos?.[h] ?? null, p.h0M, p.subidaDeterministaM[h], p.subidaPosibleM?.[h] ?? null] as const
    const base = compuerta(p.alturaCriticaM, p.alturaCriticaBandaM, ...args)
    let alcance = base.alcance
    let decide = base.decide
    if (p.defensa && desborde !== null) {
      // Coronamiento conocido: el agua debe superar la defensa y el terreno.
      const hD = Math.max(desborde, p.alturaCriticaM)
      const d = compuerta(hD, hD - BANDA_EXPOSICION_V04_M, ...args)
      alcance = d.alcance
      decide = d.decide
    } else if (p.defensa) {
      alcance = TRATAMIENTO_DEFENSA_V04 === 'piso_reducido' ? BAJAR[base.alcance] : TRATAMIENTO_DEFENSA_V04 === 'sin_piso' ? 'ninguno' : base.alcance
    }
    salida[h] = { ...base, alcance, decide, alcanceSinDefensa: base.alcance, alturaDesbordeM: desborde }
  }
  return salida
}

// --- 4. Diagnóstico persistido y explicación ---
export type InfoAlturaCritica = AlcanceHorizonteAltura & {
  estacionId: string
  fuente: FuenteAlturaCritica
  alturaCriticaM: number
  alturaCriticaBandaM: number
  h0M: number | null
  record: { valorM: number; fecha: string } | null
  pAlcanzarPorHorizonte: Record<HorizontePeligro, number | null>
  evidenciaSecoS2: (EvidenciaSecoS2 & { elevada?: boolean }) | null
  defensa: DefensaCostera | null
}

const metros = (x: number | null | undefined) => (x == null ? 's/d' : `${x.toFixed(2).replace('.', ',')} m`)
const pct = (p: number | null | undefined) => (p == null ? 's/d' : `${Math.round(p * 100)} %`)

function nombreEstacion(id: string): string {
  return CATALOGO_A5.find((e) => e.estacionId === id)?.nombre ?? id
}

/** Texto en castellano (se persiste en la explicación del factor). */
export function explicacionAlturaCritica(i: InfoAlturaCritica, h: HorizontePeligro): string {
  const partes = [
    `se alcanza con ${metros(i.alturaCriticaM)} en la escala de ${nombreEstacion(i.estacionId)} (fuente ${i.fuente}; banda ${metros(i.alturaCriticaBandaM)})`,
    `hoy ${metros(i.h0M)}`,
    `récord ${i.record ? `${metros(i.record.valorM)} (${i.record.fecha.slice(0, 4)})` : 's/d'}`,
    `probabilidad 1 día ${pct(i.pAlcanzarPorHorizonte[24])}, 3 días ${pct(i.pAlcanzarPorHorizonte[72])}, 10 días ${pct(i.pAlcanzarPorHorizonte[240])}`,
    `alcance a ${h}h ${i.alcance} por ${i.decide}`,
  ]
  if (i.evidenciaSecoS2) {
    partes.push(`Sentinel-2 la vio seca con ${metros(i.evidenciaSecoS2.hSecoM)}${i.evidenciaSecoS2.fecha ? ` (${i.evidenciaSecoS2.fecha})` : ''}${i.evidenciaSecoS2.elevada ? ': altura crítica elevada a ese valor' : ''}`)
  }
  if (i.defensa) {
    partes.push(i.defensa.cotaCoronamientoM === null
      ? `protegida por defensa costera; cota de coronamiento desconocida: piso reducido un nivel (provisorio) [${i.defensa.id}; sin defensa: ${i.alcanceSinDefensa}]`
      : `protegida por defensa costera ${i.defensa.id} (coronamiento ${metros(i.defensa.cotaCoronamientoM)} ${i.defensa.datum}; desborde con ${metros(i.alturaDesbordeM)} en la escala)`)
  }
  return `altura critica: ${partes.join('; ')}`
}

/** Diagnóstico plano (zod `diagnostico` acepta sólo escalares). */
export function diagnosticoAlturaCritica(i: InfoAlturaCritica): Record<string, number | string | boolean | null> {
  return {
    alturaCriticaM: i.alturaCriticaM,
    alturaCriticaBandaM: i.alturaCriticaBandaM,
    h0M: i.h0M,
    recordM: i.record?.valorM ?? null,
    recordFecha: i.record?.fecha ?? null,
    pAlcanzar24: i.pAlcanzarPorHorizonte[24],
    pAlcanzar72: i.pAlcanzarPorHorizonte[72],
    pAlcanzar240: i.pAlcanzarPorHorizonte[240],
    fuenteAlturaCritica: i.fuente,
    evidenciaSecoS2M: i.evidenciaSecoS2?.hSecoM ?? null,
    evidenciaSecoS2Fecha: i.evidenciaSecoS2?.fecha ?? null,
    defensa: i.defensa?.id ?? null,
    defensaCoronamientoM: i.defensa?.cotaCoronamientoM ?? null,
  }
}
