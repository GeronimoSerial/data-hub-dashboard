// Sensibilidad del número de escuelas que cambian de nivel frente a v0.3 a los
// umbrales PROVISORIOS del río v0.4 (motor/config.ts, UMBRAL_P_*_V04), sin
// recorrer el motor otra vez (insumo de T9, docs/motor-v0.4/evaluacion-u8.md).
// Reproduce el último paso de calcularRiesgoEscuela (motor/calculo.ts): sobre
// el score que ya incluye el componente 100×P y el piso observado de v0.3
// (`scoreBase`), aplica el piso probabilístico — P principal ≥ pAlto → riesgo
// ≥ UMBRAL_ALTO; si no, P conservadora ≥ pModerado → riesgo ≥ UMBRAL_MODERADO —
// y clasifica. Los pisos sólo suben.
import { clasificarNivel } from '../motor/calculo'
import { PISO_RIESGO_P_ALTO_V04, PISO_RIESGO_P_MODERADO_V04 } from '../motor/config'

type Nivel = 'bajo' | 'moderado' | 'alto' | 'muy_alto'

export interface FilaSensibilidad {
  cueAnexo: string
  horizonteHoras: number
  nivelV03: Nivel | null
  /** Score de riesgo v0.4 antes del piso probabilístico; null = sin evidencia válida. */
  scoreBase: number | null
  pPrincipal: number | null
  pConservador: number | null
}

export interface UmbralesRioV04 {
  pAlto: number
  pModerado: number
}

export interface ResultadoSensibilidad extends UmbralesRioV04 {
  cambian: number
  porHorizonte: { horizonteHoras: number; sube: number; baja: number; igual: number }[]
}

const ORDEN: Record<Nivel, number> = { bajo: 0, moderado: 1, alto: 2, muy_alto: 3 }

export function nivelConUmbrales(fila: FilaSensibilidad, u: UmbralesRioV04): Nivel | null {
  if (fila.scoreBase === null) return null
  let score = fila.scoreBase
  if (fila.pPrincipal !== null && fila.pPrincipal >= u.pAlto) score = Math.max(score, PISO_RIESGO_P_ALTO_V04)
  else if (fila.pConservador !== null && fila.pConservador >= u.pModerado) score = Math.max(score, PISO_RIESGO_P_MODERADO_V04)
  return clasificarNivel(score)
}

export function sensibilidadUmbrales(
  filas: readonly FilaSensibilidad[],
  combinaciones: readonly UmbralesRioV04[],
): ResultadoSensibilidad[] {
  const horizontes = [...new Set(filas.map((f) => f.horizonteHoras))].sort((a, b) => a - b)
  return combinaciones.map((u) => {
    const porHorizonte = horizontes.map((horizonteHoras) => ({ horizonteHoras, sube: 0, baja: 0, igual: 0 }))
    for (const fila of filas) {
      const nuevo = nivelConUmbrales(fila, u)
      // Sin nivel en alguno de los dos no es transición (mismo criterio que comparacion.ts).
      if (fila.nivelV03 === null || nuevo === null) continue
      const t = porHorizonte[horizontes.indexOf(fila.horizonteHoras)]
      const delta = ORDEN[nuevo] - ORDEN[fila.nivelV03]
      if (delta > 0) t.sube += 1
      else if (delta < 0) t.baja += 1
      else t.igual += 1
    }
    return { ...u, cambian: porHorizonte.reduce((n, t) => n + t.sube + t.baja, 0), porHorizonte }
  })
}
