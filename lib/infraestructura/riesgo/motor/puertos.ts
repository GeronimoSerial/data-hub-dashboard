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

// Tipos del contrato de la Capa 1: fuente única en peligro/nivel.ts de E3a
// (antes duplicados acá como espejo, ya unificados). Se importan para tipar
// los puertos y se re-exportan para no romper a quienes los importan desde
// este archivo (motor/tipos.ts, calculo.ts, jobs/ y fixtures).
import type {
  HorizontePeligro,
  NivelCaudalPunto,
  NivelPeligro,
  NivelPeligroCelda,
} from '../peligro/nivel'

export type { HorizontePeligro, NivelCaudalPunto, NivelPeligro, NivelPeligroCelda }

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
  // Fuente de cada acumulado cuando hay valor: 'nasa-imerg' o
  // 'synop:<wmo>:<nombre>:<km>km' (estación SMN medida, preferida sobre IMERG).
  fuente24h?: string
  fuente72h?: string
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

// Índice de aislamiento OSM (G1, infra_aislamiento_osm).
// 0 = sin aislamiento conocido, 3 = aislamiento severo; 'sin_datos_red' si G1
// no pudo calcular una ruta (no es lo mismo que 0).
export type NivelAislamiento = 0 | 1 | 2 | 3 | 'sin_datos_red'

// Por qué un objeto y no devolver sólo el `NivelAislamiento`: el índice
// compuesto 0-3 por sí solo no alcanza para la regla de riesgo de acceso
// (tarea 2), que necesita distinguir explícitamente "cruce de agua sin
// puente/vado" y "alternativa sin cruce DESCONOCIDA" de "alternativa conocida
// y segura". Esos dos casos pueden compartir el mismo nivel resumido y, sin
// los conteos, serían indistinguibles.
//
// `nivel` se conserva como resumen, pero los conteos viajan junto a su
// procedencia (`versionJob`, `fechaExtractoOsm`, `licencia`) para poder
// auditar el dato. `null` en `tieneAlternativaSinCruce` significa
// DESCONOCIDO: nunca se interpreta como `true` (seguro).
export interface IndiceAislamiento {
  cueAnexo: string
  nivel: NivelAislamiento
  crucesAguaCount: number | null
  crucesAguaConPuenteCount: number | null
  crucesAguaConVadoCount: number | null
  tieneAlternativaSinCruce: boolean | null
  versionJob: string
  fechaExtractoOsm: string
  licencia: string
}

export interface PuertoAislamiento {
  obtenerIndice(cueAnexo: string): Promise<IndiceAislamiento | null>
}

// Indicadores physrisk estáticos (G1, infra_susceptibilidad_estatica).
// Estructura abierta (Record) porque G1 define el catálogo final de
// indicadores (las claves espejan las columnas del CSV de G1, p. ej.
// 'peligro_inundacion_fluvial'); el motor v0 sólo necesita poder promediarlos
// 0..1. Un indicador ausente NO entra al Record: nunca se imputa 0.
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

// Estado oficial de la estación de Prefectura de referencia de la escuela
// (tramo de referencia por localidad), SÓLO cuando la escuela está físicamente
// expuesta a ese río. `null` = sin tramo aprobado, escuela no expuesta, sin
// lectura vigente (> 24 h antes de `asOf`) o lectura inconsistente: nunca se
// imputa "normal" en esos casos.
export type EstadoRioPrefectura = 'normal' | 'alerta' | 'evacuacion'

export interface EvidenciaRioPrefectura {
  cueAnexo: string
  estacionId: string
  rio: 'parana' | 'uruguay'
  lecturaM: number
  alertaM: number | null
  evacuacionM: number | null
  // Variación respecto de la lectura anterior publicada (m); > 0 = crece.
  variacionM: number | null
  medidaEn: string
  estado: EstadoRioPrefectura
  // Criterio que hizo a la escuela "expuesta" (trazabilidad del factor). Los
  // criterios basados en DEM empiezan con 'dem_estimado' (exposición estimada).
  criterioExposicion: string
}

// Escuela vinculada a un tramo para la que la evidencia del río NO puede
// evaluarse: 'sin_dato' (expuesta o posiblemente expuesta, pero sin lectura
// vigente o sin nivel de referencia: nunca se imputa "normal") o 'no_aplica'
// (p. ej. costa de embalse aguas arriba de la represa: la estación del tramo no
// la representa). El motor la registra como factor visible, sin puntaje.
export interface EvidenciaRioNoDisponible {
  cueAnexo: string
  estacionId: string
  rio: 'parana' | 'uruguay'
  disponibilidad: 'sin_dato' | 'no_aplica'
  motivo: string
}

export interface PuertoRioPrefectura {
  obtenerEvidencia(params: {
    cueAnexo: string
    asOf: string
  }): Promise<EvidenciaRioPrefectura | EvidenciaRioNoDisponible | null>
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
  // Opcional: los fakes/backtests sin hidrometría no lo inyectan.
  rioPrefectura?: PuertoRioPrefectura
}
