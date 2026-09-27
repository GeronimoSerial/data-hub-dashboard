// Adapter real de PuertoPeligro (Capa 1 + caudal) sobre peligro/nivel.ts de
// E3a.
//
// El puerto expone `asOf` como string y, para caudal, un único objeto de
// params; la función real de E3a recibe el `puntoId` posicional y un objeto
// `{ ahora: Date }` aparte. El adapter traduce esa forma de llamada; no
// reimplementa ninguna regla.
//
// Contrato: nunca lanza, nunca imputa un valor neutro de bajo riesgo. La
// decisión de ausencia vive en peligro/nivel.ts ('sin_dato' | null).
import {
  obtenerNivelCaudal as obtenerNivelCaudalReal,
  obtenerNivelesPeligro,
} from '../../peligro/nivel'
import type {
  HorizontePeligro,
  NivelCaudalPunto,
  NivelPeligroCelda,
  PuertoPeligro,
} from '../puertos'

export function crearAdapterPeligro(): PuertoPeligro {
  return {
    async obtenerNivelesCelda(params: {
      geometryRef: string
      horizontes: readonly HorizontePeligro[]
      asOf: string
    }): Promise<NivelPeligroCelda[]> {
      return obtenerNivelesPeligro({
        geometryRefs: [params.geometryRef],
        horizontes: [...params.horizontes],
        ahora: new Date(params.asOf),
      })
    },

    async obtenerNivelCaudal(params: { puntoId: string; asOf: string }): Promise<NivelCaudalPunto | null> {
      return obtenerNivelCaudalReal(params.puntoId, { ahora: new Date(params.asOf) })
    },
  }
}
