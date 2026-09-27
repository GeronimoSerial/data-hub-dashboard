// Fakes en memoria de los puertos del motor, para tests deterministas sin DB
// ni red. Usados por motor/calculo.test.ts (N3-Reglas) y por la revisión
// independiente (N3-Revisor). No son adapters "reales" ni deben usarse fuera
// de tests.
import type {
  HorizontePeligro,
  IndicadoresSusceptibilidad,
  IndiceAislamiento,
  NivelCaudalPunto,
  NivelPeligroCelda,
  PerfilTerritorio,
  PuertosMotor,
  ResumenExposicion,
  ResumenHistorial,
} from '../puertos'

export type EscenarioFake = {
  peligro?: Record<string, NivelPeligroCelda[]> // key: geometryRef
  caudal?: Record<string, NivelCaudalPunto> // key: puntoId
  lluvia72h?: Record<string, number | null> // key: geometryRef
  lluvia24h?: Record<string, number | null>
  territorio?: Record<string, PerfilTerritorio>
  aislamiento?: Record<string, IndiceAislamiento>
  susceptibilidad?: Record<string, IndicadoresSusceptibilidad>
  historial?: Record<string, ResumenHistorial>
  exposicion?: Record<string, ResumenExposicion>
}

export function crearPuertosFake(escenario: EscenarioFake): PuertosMotor {
  return {
    peligro: {
      async obtenerNivelesCelda(params: {
        geometryRef: string
        horizontes: readonly HorizontePeligro[]
        asOf: string
      }) {
        const todos = escenario.peligro?.[params.geometryRef] ?? []
        return todos.filter(
          (n) => params.horizontes.includes(n.horizonteHoras) && n.emitidoEn <= params.asOf,
        )
      },
      async obtenerNivelCaudal(params: { puntoId: string; asOf: string }) {
        const fila = escenario.caudal?.[params.puntoId]
        if (!fila || fila.emitidoEn > params.asOf) return null
        return fila
      },
    },
    lluviaObservada: {
      async obtenerAcumulado(params: { geometryRef: string; asOf: string }) {
        return {
          geometryRef: params.geometryRef,
          acumuladoMm24h: escenario.lluvia24h?.[params.geometryRef] ?? null,
          acumuladoMm72h: escenario.lluvia72h?.[params.geometryRef] ?? null,
          observadoEn: escenario.lluvia72h?.[params.geometryRef] != null ? params.asOf : null,
        }
      },
    },
    territorio: {
      async obtenerPerfil(cueAnexo: string) {
        return escenario.territorio?.[cueAnexo] ?? null
      },
      async listarCuesConPerfil() {
        return Object.keys(escenario.territorio ?? {})
      },
    },
    aislamiento: {
      async obtenerIndice(cueAnexo: string) {
        return escenario.aislamiento?.[cueAnexo] ?? null
      },
    },
    susceptibilidad: {
      async obtenerIndicadores(cueAnexo: string) {
        return escenario.susceptibilidad?.[cueAnexo] ?? null
      },
    },
    historial: {
      async obtenerResumen(params: { cueAnexo: string; asOf: string; ventanaDias: number }) {
        const resumen = escenario.historial?.[params.cueAnexo]
        if (!resumen) {
          return {
            cueAnexo: params.cueAnexo,
            cantidadConfirmadas: 0,
            duracionTotalHoras: 0,
            accesoInterrumpidoCantidad: 0,
            antecedentes: [],
          }
        }
        // as-of estricto: el fake también filtra, para que un test que arma
        // un antecedente "futuro" respecto de asOf pruebe de verdad el
        // comportamiento del núcleo, no sólo el del fake.
        const antecedentes = resumen.antecedentes.filter((a) => a.rigeDesde <= params.asOf)
        return { ...resumen, antecedentes }
      },
    },
    exposicion: {
      async obtenerResumen(params: { cueAnexo: string; asOf: string }) {
        void params.asOf
        return escenario.exposicion?.[params.cueAnexo] ?? null
      },
    },
  }
}
