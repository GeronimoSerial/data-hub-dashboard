// Puertos del motor de riesgo v0 (E3b, arquitectura hexagonal — decisión fija
// de N1, ver docs/ejecucion-enos/E3b/registro.md). El núcleo puro en
// motor/calculo.ts NO importa DB ni red: sólo conoce estas interfaces. N3 no
// puede ampliarlas sin ask a N1; agregar un puerto nuevo es una decisión de
// contrato, no un detalle local.
//
// Cada puerto declara qué hace cuando el dato no existe: nunca lanza, nunca
// imputa un valor "neutro" en el sentido de bajo riesgo — devuelve un valor
// explícito de ausencia ('sin_dato' | null) que motor/calculo.ts debe tratar
// como confianza degradada, nunca como riesgo bajo por defecto.

// --- Espejo de peligro/nivel.ts de E3a; N1 unifica al integrar ---
// E3a (batch hermano, otro worktree) implementa el tipo real en
// lib/infraestructura/riesgo/peligro/nivel.ts. Hasta el merge, este archivo
// declara los mismos tipos para poder tipar el puerto sin depender del
// código de E3a. Si al integrar difieren, N1 decide cuál es la fuente única.
export type NivelPeligro = 'verde' | 'amarillo' | 'naranja' | 'rojo' | 'sin_dato'
export type HorizontePeligro = 24 | 72 | 240

export interface NivelPeligroCelda {
  geometryRef: string
  horizonteHoras: HorizontePeligro
  nivel: NivelPeligro
  base: 'ensemble' | 'deterministico' | 'sin_dato'
  probabilidadP95: number | null
  probabilidadP99: number | null
  precipitacionMm: number | null
  percentilReferencia: 'P90' | 'P95' | 'P99' | null
  emitidoEn: string
  validoHasta: string
  versionRegla: string
}

export interface NivelCaudalPunto {
  puntoId: string
  percentilActual: number | null
  nivel: NivelPeligro
  emitidoEn: string
  validoHasta: string
}
// --- fin espejo de E3a ---

// Peligro meteorológico estimado por celda/horizonte (Capa 1) y por punto de
// río (caudal). `asOf` es el instante simulado: un adapter real nunca debe
// devolver un dato cuya emisión sea posterior a `asOf` (as-of estricto, ver
// aceptación de backtest/sombra).
export interface PuertoPeligro {
  obtenerNivelesCelda(params: {
    geometryRef: string
    horizontes: readonly HorizontePeligro[]
    asOf: string
  }): Promise<NivelPeligroCelda[]>
  obtenerNivelCaudal(params: { puntoId: string; asOf: string }): Promise<NivelCaudalPunto | null>
}

// Lluvia observada estimada por satélite (IMERG, la implementa E3a). Puede no
// existir todavía: `acumuladoMm24h`/`acumuladoMm72h` en null, no en 0 — 0
// significa "se midió y no llovió", null significa "no hay medición".
export interface LluviaObservadaCelda {
  geometryRef: string
  acumuladoMm24h: number | null
  acumuladoMm72h: number | null
  observadoEn: string | null
}

export interface PuertoLluviaObservada {
  obtenerAcumulado(params: { geometryRef: string; asOf: string }): Promise<LluviaObservadaCelda>
}

// Perfil territorial de la escuela (hoy infra_geo_profile de E2).
// `puntoRioId` asociado es un follow-up de gate de E2 (docs/ejecucion-enos/
// E2/registro.md, Gate N1 #1): el adapter real de este puerto resuelve el
// punto de río más cercano sobre la misma cuenca (decisión local, ver
// registro.md de este batch), sin modificar infra_geo_profile.
export interface PerfilTerritorio {
  cueAnexo: string
  geometryRef: string | null
  departamento: string | null
  puntoRioId: string | null
  motivoExclusion: string | null
}

export interface PuertoTerritorio {
  obtenerPerfil(cueAnexo: string): Promise<PerfilTerritorio | null>
  listarCuesConPerfil(): Promise<string[]>
}

// Índice de aislamiento OSM (G1, infra_aislamiento_osm — aún no mergeado).
// 0 = sin aislamiento conocido, 3 = aislamiento severo; 'sin_datos_red' si G1
// no pudo calcular una ruta (no es lo mismo que 0).
export type NivelAislamiento = 0 | 1 | 2 | 3 | 'sin_datos_red'

export interface PuertoAislamiento {
  obtenerIndice(cueAnexo: string): Promise<NivelAislamiento | null>
}

// Indicadores physrisk estáticos (G1, infra_susceptibilidad_estatica — aún no
// mergeado). Estructura abierta (Record) porque G1 define el catálogo final
// de indicadores; el motor v0 sólo necesita poder promediarlos 0..1.
export interface IndicadoresSusceptibilidad {
  cueAnexo: string
  indicadores: Record<string, number>
  version: string
}

export interface PuertoSusceptibilidad {
  obtenerIndicadores(cueAnexo: string): Promise<IndicadoresSusceptibilidad | null>
}

// Antecedentes de partes CONFIRMADOS (nunca predicciones, para no introducir
// circularidad). `asOf` filtra estrictamente por rigeDesde <= asOf: un
// antecedente que empezó después del instante simulado no cuenta (as-of
// estricto, backtest nunca usa un parte futuro).
export interface AntecedenteHistorial {
  motivo: string
  categoria: string
  rigeDesde: string
  retiradaEn: string | null
  accesoInterrumpido: boolean
}

export interface ResumenHistorial {
  cueAnexo: string
  cantidadConfirmadas: number
  duracionTotalHoras: number
  accesoInterrumpidoCantidad: number
  antecedentes: readonly AntecedenteHistorial[]
}

export interface PuertoHistorial {
  obtenerResumen(params: {
    cueAnexo: string
    asOf: string
    ventanaDias: number
  }): Promise<ResumenHistorial>
}

// Exposición (matrícula/secciones) del corte vigente al momento `asOf`.
export interface ResumenExposicion {
  cueAnexo: string
  matricula: number
  secciones: number
  corteId: number | null
}

export interface PuertoExposicion {
  obtenerResumen(params: { cueAnexo: string; asOf: string }): Promise<ResumenExposicion | null>
}

// Bundle de puertos que motor/calculo.ts recibe por inyección: el núcleo no
// construye ningún adapter, sólo llama estas interfaces.
export interface PuertosMotor {
  peligro: PuertoPeligro
  lluviaObservada: PuertoLluviaObservada
  territorio: PuertoTerritorio
  aislamiento: PuertoAislamiento
  susceptibilidad: PuertoSusceptibilidad
  historial: PuertoHistorial
  exposicion: PuertoExposicion
}
