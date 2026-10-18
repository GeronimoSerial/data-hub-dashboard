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
import type { ReglasMotor } from '../config'
import type {
  HorizontePeligro,
  NivelCaudalPunto,
  NivelPeligroCelda,
  PuertoPeligro,
} from '../puertos'

// `reglas: 'v0.4'` activa F5 (acumulado por ventana), F6 (caudal en la
// ventana del horizonte) y la edad máxima del ensemble (F8).
export function crearAdapterPeligro(opciones: { reglas?: ReglasMotor } = {}): PuertoPeligro {
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
        ...(opciones.reglas ? { reglas: opciones.reglas } : {}),
      })
    },

    async obtenerNivelCaudal(params: {
      puntoId: string
      asOf: string
      horizonteHoras?: HorizontePeligro
    }): Promise<NivelCaudalPunto | null> {
      if (opciones.reglas === 'v0.4') {
        return obtenerNivelCaudalReal(params.puntoId, { ahora: new Date(params.asOf), reglas: 'v0.4', horizonteHoras: params.horizonteHoras })
      }
      return obtenerNivelCaudalReal(params.puntoId, { ahora: new Date(params.asOf) })
    },
  }
}
